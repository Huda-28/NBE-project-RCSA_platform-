import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { db, initDatabase } from '../src/server/db.js';
import { getUserWithRoles, canApproveAssessment } from '../src/server/auth.js';
import { logAuditEvent, queryAuditLogs } from '../src/server/audit.js';
import { executeProvisionalCalculation } from '../src/server/engine-contract.js';

describe('Phase 1 Verification Tests — Banking Foundation, Security & 5 Business Units', () => {
  before(() => {
    initDatabase();
  });

  test('1. All Five Business Units Exist in Persistent Storage (including BRANCHES and TRADING)', () => {
    const units = db.prepare('SELECT count(*) as count FROM business_units').get() as { count: number };
    assert.equal(units.count >= 5, true, 'All 5 Business Units must be seeded in SQLite');

    const expectedUnits = [
      { code: 'SYND-OPS', name_ar: 'إدارة عمليات القروض المشتركة' },
      { code: 'ACCT-OPS', name_ar: 'إدارة عمليات فتح الحسابات' },
      { code: 'POS-OPS', name_ar: 'إدارة عمليات ماكينات نقاط البيع' },
      { code: 'BRANCHES', name_ar: 'شبكة الفروع' },
      { code: 'TRADING', name_ar: 'التداول' },
    ];

    const rows = db.prepare('SELECT id, code, name_ar FROM business_units').all() as any[];
    for (const eu of expectedUnits) {
      const match = rows.find(r => r.code === eu.code);
      assert.ok(match, `Unit with code ${eu.code} must exist in storage`);
      assert.equal(match.name_ar, eu.name_ar, `Unit ${eu.code} must have Arabic name "${eu.name_ar}"`);
    }
  });

  test('2. Idempotent Migration Verification on Restart (No Data Lost)', () => {
    const beforeCount = (db.prepare('SELECT count(*) as count FROM business_units').get() as any).count;
    const beforeAssessments = (db.prepare('SELECT count(*) as count FROM rcsa_assessments').get() as any).count;

    // Simulate restart by calling initDatabase() again
    initDatabase();

    const afterCount = (db.prepare('SELECT count(*) as count FROM business_units').get() as any).count;
    const afterAssessments = (db.prepare('SELECT count(*) as count FROM rcsa_assessments').get() as any).count;

    assert.equal(afterCount, beforeCount, 'Business unit count must be identical across restarts');
    assert.equal(afterAssessments, beforeAssessments, 'Assessment count must be preserved across restarts');
  });

  test('3. Multi-Role Authorization & BU Access for Demonstration Units', () => {
    // EMP-1001: Maker for BU-POS, but NOT Maker for BU-TRADING or BU-BRANCHES
    const maker1001 = getUserWithRoles('EMP-1001')!;
    const hasPosRole = maker1001.roles.some(r => r.unit_id === 'BU-POS' && r.role === 'MAKER');
    const hasBranchesRole = maker1001.roles.some(r => r.unit_id === 'BU-BRANCHES' && r.role === 'MAKER');
    const hasTradingRole = maker1001.roles.some(r => r.unit_id === 'BU-TRADING' && r.role === 'MAKER');

    assert.equal(hasPosRole, true, 'EMP-1001 must have MAKER role on BU-POS');
    assert.equal(hasBranchesRole, false, 'EMP-1001 must NOT have MAKER role on BU-BRANCHES');
    assert.equal(hasTradingRole, false, 'EMP-1001 must NOT have MAKER role on BU-TRADING (strict isolation)');

    // EMP-3003: Maker for BU-POS and BU-TRADING
    const maker3003 = getUserWithRoles('EMP-3003')!;
    const hasPos3003 = maker3003.roles.some(r => r.unit_id === 'BU-POS' && r.role === 'MAKER');
    const hasTrading3003 = maker3003.roles.some(r => r.unit_id === 'BU-TRADING' && r.role === 'MAKER');
    assert.equal(hasPos3003, true, 'EMP-3003 must have MAKER role on BU-POS');
    assert.equal(hasTrading3003, true, 'EMP-3003 must have MAKER role on BU-TRADING');

    // EMP-9009: Central Risk Admin has oversight on all units
    const admin = getUserWithRoles('EMP-9009')!;
    assert.equal(admin.roles.some(r => r.unit_id === 'BU-BRANCHES' && r.role === 'RISK_ADMIN'), true);
    assert.equal(admin.roles.some(r => r.unit_id === 'BU-TRADING' && r.role === 'RISK_ADMIN'), true);
    assert.equal(admin.roles.some(r => r.unit_id === 'BU-POS' && r.role === 'RISK_ADMIN'), true);
  });

  test('4. Empty State Verification for Newly Created Units', () => {
    // Both BU-BRANCHES and BU-TRADING should initially have no approved assessments and no draft assessments
    const branchesAssessments = db.prepare('SELECT count(*) as cnt FROM rcsa_assessments WHERE unit_id = ?').get('BU-BRANCHES') as any;
    assert.equal(branchesAssessments.cnt, 0, 'BU-BRANCHES must initially have 0 assessments (shows "لم يتم إنشاء تقييم بعد")');

    const tradingAssessments = db.prepare('SELECT count(*) as cnt FROM rcsa_assessments WHERE unit_id = ?').get('BU-TRADING') as any;
    assert.equal(tradingAssessments.cnt, 0, 'BU-TRADING must initially have 0 assessments (shows "لم يتم إنشاء تقييم بعد")');
  });

  test('5. Authentication & User Provisioning with bcrypt hash', () => {
    const maker = getUserWithRoles('EMP-1001');
    assert.ok(maker, 'EMP-1001 must exist');
    assert.equal(maker.employee_id, 'EMP-1001');

    const userRow = db.prepare('SELECT password_hash FROM users WHERE employee_id = ?').get('EMP-1001') as any;
    const isMatch = bcrypt.compareSync('NBE@2026!', userRow.password_hash);
    assert.equal(isMatch, true, 'Password hash must verify against NBE@2026!');
  });

  test('6. First-Login Password Reset Workflow', () => {
    const testEmpId = 'EMP-TEST-RESET-2';
    const tempHash = bcrypt.hashSync('Temp@123', 10);

    db.prepare(`
      INSERT OR REPLACE INTO users (employee_id, full_name, email, password_hash, must_reset_password, is_active)
      VALUES (?, 'مستخدم تجريبي للاختبار 2', 'test.reset2@nbe.com.eg', ?, 1, 1)
    `).run(testEmpId, tempHash);

    let user = getUserWithRoles(testEmpId);
    assert.equal(user?.must_reset_password, true);

    const newHash = bcrypt.hashSync('NewSecurePassword@2026', 10);
    db.prepare('UPDATE users SET password_hash = ?, must_reset_password = 0 WHERE employee_id = ?')
      .run(newHash, testEmpId);

    user = getUserWithRoles(testEmpId);
    assert.equal(user?.must_reset_password, false, 'must_reset_password must be flipped to false');
    const row = db.prepare('SELECT password_hash FROM users WHERE employee_id = ?').get(testEmpId) as any;
    assert.equal(bcrypt.compareSync('NewSecurePassword@2026', row.password_hash), true);
  });

  test('7. Maker-Checker Self-Approval Prohibition Enforcement', () => {
    const makerUser = getUserWithRoles('EMP-1001')!;
    const checkerUser = getUserWithRoles('EMP-2002')!;

    const testAsmId = 'TEST-ASM-MAKER-CHECKER-2';
    db.prepare(`
      INSERT OR REPLACE INTO rcsa_assessments (id, unit_id, cycle_year, title, workflow_source, status, version_number, created_by)
      VALUES (?, 'BU-SYNDICATED', 2026, 'تقييم اختبار الرقابة المزدوجة 2', 'BACKEND_GUIDED', 'SUBMITTED', 1, ?)
    `).run(testAsmId, makerUser.employee_id);

    // Maker attempts self-approval -> MUST BE REJECTED
    const makerApprovalAttempt = canApproveAssessment(makerUser, testAsmId);
    assert.equal(makerApprovalAttempt.allowed, false, 'Maker self-approval must be strictly prohibited');
    assert.match(makerApprovalAttempt.reason || '', /Maker-Checker/);

    // Independent Checker attempts approval -> MUST BE ALLOWED
    const checkerApprovalAttempt = canApproveAssessment(checkerUser, testAsmId);
    assert.equal(checkerApprovalAttempt.allowed, true, 'Independent Checker must be allowed to approve');
  });

  test('8. Structured Application Audit Logging & Query', () => {
    const logId = logAuditEvent({
      userId: 'EMP-1001',
      userRole: 'MAKER',
      unitId: 'BU-BRANCHES',
      entityType: 'UNIT_TEST',
      entityId: 'TEST-BRANCH-1',
      action: 'TEST_BRANCH_ACTION',
      beforeState: { status: 'INITIAL' },
      afterState: { status: 'UPDATED' },
      changeSummary: 'اختبار وحدة لسجل التدقيق على شبكة الفروع',
    });

    assert.ok(logId > 0, 'Audit event must return valid insert ID');
    const logs = queryAuditLogs({ unitId: 'BU-BRANCHES', limit: 5 });
    assert.ok(logs.length > 0);
    const testLog = logs.find(l => l.id === logId);
    assert.ok(testLog);
    assert.equal(testLog.unit_name_ar, 'شبكة الفروع');
    assert.equal(testLog.before_state.status, 'INITIAL');
    assert.equal(testLog.after_state.status, 'UPDATED');
  });

  test('9. Provisional Calculation Engine Contract Returns ENGINE_NOT_CONFIGURED (Decoupled TypeScript)', async () => {
    const validRes = await executeProvisionalCalculation({
      unit_id: 'BU-BRANCHES',
      financial_impact_amount: 500000,
      inherent_frequency_text: 'مرة كل ربع سنة ',
      controls: [
        {
          control_id: 'C1',
          control_type: 'PREVENTIVE',
          control_method: 'AUTOMATED',
          raw_efficiency_rating: 'فعال',
          is_proposed: false,
        }
      ]
    });

    assert.equal(validRes.is_provisional, true);
    assert.equal(validRes.status, 'ENGINE_NOT_CONFIGURED');
    assert.equal(validRes.calculated_metrics, null);
    assert.ok(validRes.error?.includes('محرك بايثون'));

    // Check missing inputs response
    const missingRes = await executeProvisionalCalculation({
      unit_id: 'BU-BRANCHES',
    });
    assert.equal(missingRes.status, 'MISSING_INPUTS_REQUIRED');
    assert.equal(missingRes.calculated_metrics, null);
    assert.deepEqual(missingRes.missing_fields, ['financial_impact_amount', 'inherent_frequency_text']);
  });
});

