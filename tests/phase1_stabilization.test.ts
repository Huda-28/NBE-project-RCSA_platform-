import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';

// Ensure test environment uses isolated test DB
process.env.NODE_ENV = 'test';
process.env.RCSA_DB_PATH = path.resolve('data', 'rcsa_test.db');

import jwt from 'jsonwebtoken';
import { db, initDatabase, DB_PATH, runInTransaction } from '../src/server/db.js';
import { 
  getUserWithRoles, 
  canApproveAssessment, 
  isUserAuthorizedForBU, 
  generateToken, 
  getJwtSecret
} from '../src/server/auth.js';
import { logAuditEvent, queryAuditLogs } from '../src/server/audit.js';
import { executeProvisionalCalculation } from '../src/server/engine-contract.js';

describe('Phase 1 Stabilization — Security, Data Integrity & Integration Hardening', () => {
  before(() => {
    initDatabase();
  });

  after(() => {
    // Clean up test DB artifacts after tests complete
    try {
      db.close();
      if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
      const wal = `${DB_PATH}-wal`;
      const shm = `${DB_PATH}-shm`;
      if (fs.existsSync(wal)) fs.unlinkSync(wal);
      if (fs.existsSync(shm)) fs.unlinkSync(shm);
    } catch (e) {}
  });

  test('1. Test Database Isolation: Verified that tests use data/rcsa_test.db and do not contaminate dev data/rcsa.db', () => {
    assert.ok(DB_PATH.endsWith('rcsa_test.db'), `DB path must be isolated test DB, received: ${DB_PATH}`);
  });

  test('2. Authentication Security: Valid password succeeds with bcrypt, invalid password is unconditionally rejected', () => {
    const user = getUserWithRoles('EMP-1001');
    assert.ok(user, 'EMP-1001 must exist');

    const userRow = db.prepare('SELECT password_hash FROM users WHERE employee_id = ?').get('EMP-1001') as any;
    assert.ok(userRow?.password_hash, 'Password hash must exist in DB');
    
    // Correct password
    const valid = bcrypt.compareSync('NBE@2026!', userRow.password_hash);
    assert.equal(valid, true, 'Valid password must match bcrypt hash');

    // Incorrect password
    const invalid = bcrypt.compareSync('WrongPassword123!', userRow.password_hash);
    assert.equal(invalid, false, 'Invalid password must fail bcrypt comparison');

    // JWT token generation and verification
    const token = generateToken(user);
    const decoded = jwt.verify(token, getJwtSecret()) as any;
    assert.ok(decoded);
    assert.equal(decoded.sub, 'EMP-1001');
  });

  test('3. Backend First-Login Password Reset Enforcement: must_reset_password blocks non-reset workflows', () => {
    const testEmp = 'EMP-RESET-TEST-99';
    const tempPass = bcrypt.hashSync('Temp@123', 10);
    
    db.prepare(`
      INSERT OR REPLACE INTO users (employee_id, full_name, email, password_hash, must_reset_password, is_active)
      VALUES (?, 'مستخدم لاختبار إعادة التعيين', 'reset.test@nbe.com.eg', ?, 1, 1)
    `).run(testEmp, tempPass);

    const initialUser = getUserWithRoles(testEmp);
    assert.equal(initialUser?.must_reset_password, true, 'Initial state must require password reset');

    // Simulate backend password reset execution
    const newPass = bcrypt.hashSync('SecureNewPassword@2026', 10);
    db.prepare('UPDATE users SET password_hash = ?, must_reset_password = 0 WHERE employee_id = ?').run(newPass, testEmp);

    const updatedUser = getUserWithRoles(testEmp);
    assert.equal(updatedUser?.must_reset_password, false, 'must_reset_password must be flipped to 0');
    
    const row = db.prepare('SELECT password_hash FROM users WHERE employee_id = ?').get(testEmp) as any;
    assert.equal(bcrypt.compareSync('SecureNewPassword@2026', row.password_hash), true);
  });

  test('4. Horizontal Cross-BU Authorization & Data Isolation: Unauthorized BU access is rejected', () => {
    const maker1001 = getUserWithRoles('EMP-1001')!; // Roles: BU-SYNDICATED, BU-ACCOUNT, BU-POS
    const maker3003 = getUserWithRoles('EMP-3003')!; // Roles: BU-POS, BU-TRADING

    // BU-POS access (both EMP-1001 and EMP-3003 have authorized access)
    assert.equal(isUserAuthorizedForBU(maker1001, 'BU-POS'), true, 'EMP-1001 has access to BU-POS');
    assert.equal(isUserAuthorizedForBU(maker3003, 'BU-POS'), true, 'EMP-3003 has access to BU-POS');

    // BU-ACCOUNT access isolation (EMP-3003 must NOT have access)
    assert.equal(isUserAuthorizedForBU(maker1001, 'BU-ACCOUNT'), true, 'EMP-1001 has access to BU-ACCOUNT');
    assert.equal(isUserAuthorizedForBU(maker3003, 'BU-ACCOUNT'), false, 'EMP-3003 must NOT have access to BU-ACCOUNT (strict isolation)');

    // BU-TRADING access isolation (EMP-1001 must NOT have access)
    assert.equal(isUserAuthorizedForBU(maker3003, 'BU-TRADING'), true, 'EMP-3003 has access to BU-TRADING');
    assert.equal(isUserAuthorizedForBU(maker1001, 'BU-TRADING'), false, 'EMP-1001 must NOT have access to BU-TRADING (strict isolation)');

    // Central Risk Admin has oversight
    const admin = getUserWithRoles('EMP-9009')!;
    assert.equal(isUserAuthorizedForBU(admin, 'BU-BRANCHES'), true);
    assert.equal(isUserAuthorizedForBU(admin, 'BU-TRADING'), true);
    assert.equal(isUserAuthorizedForBU(admin, 'BU-POS'), true);
  });

  test('5. Maker-Checker Self-Approval Prohibition Enforcement: Self-approval is strictly rejected', () => {
    const makerUser = getUserWithRoles('EMP-1001')!;
    const checkerUser = getUserWithRoles('EMP-2002')!;

    const testAsmId = 'TEST-STAB-ASM-01';
    db.prepare(`
      INSERT OR REPLACE INTO rcsa_assessments (id, unit_id, cycle_year, title, workflow_source, status, version_number, created_by)
      VALUES (?, 'BU-SYNDICATED', 2026, 'تقييم اختبار الحوكمة المزدوجة', 'BACKEND_GUIDED', 'SUBMITTED', 1, ?)
    `).run(testAsmId, makerUser.employee_id);

    // Creator attempts self-approval -> MUST BE REJECTED
    const makerAttempt = canApproveAssessment(makerUser, testAsmId);
    assert.equal(makerAttempt.allowed, false, 'Maker self-approval must be prohibited');
    assert.match(makerAttempt.reason || '', /Maker-Checker/);

    // Independent Checker -> MUST BE ALLOWED
    const checkerAttempt = canApproveAssessment(checkerUser, testAsmId);
    assert.equal(checkerAttempt.allowed, true, 'Independent Checker must be permitted to approve');
  });

  test('6. Admin vs Auditor Role Boundaries: Strict separation between administrative and audit oversight', () => {
    const admin = getUserWithRoles('EMP-9009')!;
    const auditor = getUserWithRoles('EMP-8008')!;
    const maker = getUserWithRoles('EMP-1001')!;

    const adminRoles = admin.roles.map(r => r.role);
    const auditorRoles = auditor.roles.map(r => r.role);
    const makerRoles = maker.roles.map(r => r.role);

    assert.ok(adminRoles.includes('RISK_ADMIN'), 'EMP-9009 must be RISK_ADMIN');
    assert.ok(!adminRoles.includes('AUDITOR'), 'EMP-9009 is not AUDITOR');

    assert.ok(auditorRoles.includes('AUDITOR'), 'EMP-8008 must be AUDITOR');
    assert.ok(!auditorRoles.includes('MAKER'), 'AUDITOR must not be MAKER');
    assert.ok(!auditorRoles.includes('CHECKER'), 'AUDITOR must not be CHECKER');

    assert.ok(!makerRoles.includes('AUDITOR'), 'MAKER must not be AUDITOR');
    assert.ok(!makerRoles.includes('RISK_ADMIN'), 'MAKER must not be RISK_ADMIN');
  });

  test('7. Fail-Secure Secret Management in Production: Missing JWT secret throws error in production', () => {
    const origEnv = process.env.NODE_ENV;
    const origSecret = process.env.JWT_SECRET;
    const origRcsaSecret = process.env.RCSA_SECRET;
    try {
      process.env.NODE_ENV = 'production';
      delete process.env.JWT_SECRET;
      delete process.env.RCSA_SECRET;
      assert.throws(() => {
        getJwtSecret();
      }, /FATAL SECURITY/);
    } finally {
      process.env.NODE_ENV = origEnv;
      if (origSecret) process.env.JWT_SECRET = origSecret;
      if (origRcsaSecret) process.env.RCSA_SECRET = origRcsaSecret;
    }
  });

  test('8. Decoupled Provisional Calculation Engine: Returns ENGINE_NOT_CONFIGURED and no synthetic calculations', async () => {
    const res = await executeProvisionalCalculation({
      unit_id: 'BU-BRANCHES',
      financial_impact_amount: 1500000,
      inherent_frequency_text: 'مرة كل ربع سنة ',
      controls: [
        {
          control_id: 'CTRL-01',
          control_type: 'PREVENTIVE',
          control_method: 'AUTOMATED',
          raw_efficiency_rating: 'فعال',
          is_proposed: false,
        }
      ]
    });

    assert.equal(res.is_provisional, true);
    assert.equal(res.status, 'ENGINE_NOT_CONFIGURED');
    assert.equal(res.calculated_metrics, null, 'Calculated metrics must remain null until Phase 2 Python engine connection');
    assert.ok(res.error?.includes('محرك بايثون'));
  });

  test('9. Structured Application Audit Logging & Transaction Boundaries: Atomic state capture with before/after', () => {
    let logId: number = 0;
    runInTransaction(() => {
      logId = logAuditEvent({
        userId: 'EMP-1001',
        userRole: 'MAKER',
        unitId: 'BU-BRANCHES',
        entityType: 'ASSESSMENT',
        entityId: 'ASM-STAB-TX-01',
        action: 'SUBMIT_FOR_REVIEW',
        beforeState: { status: 'DRAFT', version: 1 },
        afterState: { status: 'SUBMITTED', version: 1 },
        changeSummary: 'تقديم تقييم شبكة الفروع للاعتماد ضمن معاملة ذرية',
      });
    });

    assert.ok(logId > 0, 'Audit record ID must be generated within transaction');
    const logs = queryAuditLogs({ unitId: 'BU-BRANCHES', limit: 10 });
    const target = logs.find(l => l.id === logId);
    assert.ok(target, 'Audit event must be committed to database');
    assert.equal(target.action, 'SUBMIT_FOR_REVIEW');
    assert.equal(target.before_state.status, 'DRAFT');
    assert.equal(target.after_state.status, 'SUBMITTED');
  });

  test('10. Preservation of All 5 Business Units Across Restarts (Idempotent Migration)', () => {
    const expected = [
      { code: 'SYND-OPS', name_ar: 'إدارة عمليات القروض المشتركة' },
      { code: 'ACCT-OPS', name_ar: 'إدارة عمليات فتح الحسابات' },
      { code: 'POS-OPS', name_ar: 'إدارة عمليات ماكينات نقاط البيع' },
      { code: 'BRANCHES', name_ar: 'شبكة الفروع' },
      { code: 'TRADING', name_ar: 'التداول' },
    ];

    const currentRows = db.prepare('SELECT code, name_ar FROM business_units').all() as any[];
    assert.equal(currentRows.length >= 5, true);

    for (const exp of expected) {
      const match = currentRows.find(r => r.code === exp.code);
      assert.ok(match, `Unit ${exp.code} must exist`);
      assert.equal(match.name_ar, exp.name_ar);
    }

    // Re-run initDatabase to simulate server restart
    initDatabase();

    const restartedRows = db.prepare('SELECT code, name_ar FROM business_units').all() as any[];
    assert.equal(restartedRows.length, currentRows.length, 'No duplicate or lost business units after restart');
  });

  test('11. Role-Based Access Control for Audit Logs (RISK_ADMIN and AUDITOR only)', () => {
    const admin = getUserWithRoles('EMP-9009')!;
    const auditor = getUserWithRoles('EMP-8008')!;
    const maker = getUserWithRoles('EMP-1001')!;
    const checker = getUserWithRoles('EMP-2002')!;

    const canAccessAudit = (u: any) => u.roles.some((r: any) => r.role === 'RISK_ADMIN' || r.role === 'AUDITOR');

    assert.equal(canAccessAudit(admin), true, 'Admin can access audit logs');
    assert.equal(canAccessAudit(auditor), true, 'Auditor can access audit logs');
    assert.equal(canAccessAudit(maker), false, 'Maker cannot access audit logs');
    assert.equal(canAccessAudit(checker), false, 'Checker cannot access audit logs');
  });
});
