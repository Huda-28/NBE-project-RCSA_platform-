import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Ensure isolated test DB
process.env.NODE_ENV = 'test';
if (!process.env.RCSA_DB_PATH) {
  process.env.RCSA_DB_PATH = path.resolve('data', 'rcsa_test.db');
}

import { db, initDatabase, DB_PATH } from '../src/server/db.js';
import { getUserWithRoles } from '../src/server/auth.js';
import {
  createWorkflowSession,
  getWorkflowSession,
  getActiveWorkflowSession,
  updateWorkflowSession,
  linkDocumentToWorkflowSession,
} from '../src/server/workflow-session-service.js';

describe('Phase 3A — Unified RCSA Assessment Session & UX Workflow E2E', () => {
  let maker: any;
  let newSessionId: string;
  let updateSessionId: string;

  before(() => {
    initDatabase();
    maker = getUserWithRoles('EMP-1001');
  });

  after(() => {
    try {
      db.close();
      if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
      const wal = `${DB_PATH}-wal`;
      const shm = `${DB_PATH}-shm`;
      if (fs.existsSync(wal)) fs.unlinkSync(wal);
      if (fs.existsSync(shm)) fs.unlinkSync(shm);
    } catch {
      // Ignore cleanup errors
    }
  });

  test('1. Create Workflow Session in NEW Mode — Clean Start Without Historical Risks or Docs', () => {
    assert.ok(maker, 'Maker EMP-1001 must exist');

    const session = createWorkflowSession({
      unitId: 'BU-SYNDICATED',
      user: maker,
      workflowMode: 'NEW',
      sessionTitle: 'تقييم مخاطر القروض المشتركة الجديد 2026',
    });

    assert.ok(session.id.startsWith('SES-SYND-'));
    assert.equal(session.unit_id, 'BU-SYNDICATED');
    assert.equal(session.workflow_mode, 'NEW');
    assert.equal(session.base_assessment_id, null);
    assert.deepEqual(session.candidate_risks, [], 'NEW mode must start with clean/empty candidate risks');
    assert.deepEqual(session.uploaded_document_ids, [], 'NEW mode must start with empty session document list');

    newSessionId = session.id;
  });

  test('2. Create Workflow Session in UPDATE Mode — Preloads Approved Baseline Risks Without Overwriting', () => {
    const session = createWorkflowSession({
      unitId: 'BU-SYNDICATED',
      user: maker,
      workflowMode: 'UPDATE',
      sessionTitle: 'تحديث تقييم القروض المشتركة المعتمد',
    });

    assert.ok(session.id.startsWith('SES-SYND-'));
    assert.equal(session.unit_id, 'BU-SYNDICATED');
    assert.equal(session.workflow_mode, 'UPDATE');
    assert.ok(session.base_assessment_id, 'UPDATE mode must resolve an approved baseline assessment ID');
    assert.ok(session.candidate_risks.length > 0, 'UPDATE mode preloads baseline risks as editable candidates');

    // Verify baseline assessment is untouched in DB
    const baseAsm = db.prepare('SELECT status FROM rcsa_assessments WHERE id = ?').get(session.base_assessment_id) as any;
    assert.equal(baseAsm.status, 'APPROVED', 'Base assessment remains APPROVED and immutable');

    updateSessionId = session.id;
  });

  test('3. Retrieve Active Workflow Session for Unit & User', () => {
    const activeSess = getActiveWorkflowSession('BU-SYNDICATED', maker);
    assert.ok(activeSess, 'Active session must be retrievable');
    assert.equal(activeSess.id, updateSessionId, 'Active session must match most recently created session for BU');
  });

  test('4. Link Uploaded Document to Active Workflow Session', () => {
    // Insert dummy document using schema columns
    const docId = `DOC-TEST-${Date.now()}`;
    db.prepare(`
      INSERT INTO documents (id, unit_id, file_type, filename, uploaded_by, uploaded_at)
      VALUES (?, 'BU-SYNDICATED', 'SOP', 'test_sop.pdf', 'EMP-1001', datetime('now'))
    `).run(docId);

    const updatedSession = linkDocumentToWorkflowSession(newSessionId, docId, maker);
    assert.ok(updatedSession, 'Updated session must exist');
    assert.ok(updatedSession.uploaded_document_ids.includes(docId), 'Session must include linked document ID');
    assert.equal(updatedSession.session_documents.length, 1);
    assert.equal(updatedSession.session_documents[0].id, docId);
  });

  test('5. Update Session Candidate Risks & Stepper Progress (PATCH / Persistence)', () => {
    const updatedRisks = [
      {
        risk_id: 'RSK-SYND-NEW-01',
        process_name_ar: 'عمليات التحويل الشامل',
        risk_title_ar: 'تأخير تنفيذي في التحويلات',
        description_ar: 'احتمال تأخير تنفيذ طلبات التحويل المالية القادمة من الفروع',
        expected_loss_egp: 250000,
        expected_frequency_text: 'Annually\nسنوياً',
        controls: [],
      },
    ];

    const patched = updateWorkflowSession(newSessionId, maker, {
      current_step: 4,
      candidate_risks: updatedRisks,
      calc_preview: { total_expected_loss: 250000 },
    });

    assert.equal(patched.current_step, 4);
    assert.equal(patched.candidate_risks.length, 1);
    assert.equal(patched.candidate_risks[0].risk_id, 'RSK-SYND-NEW-01');
    assert.equal(patched.calc_preview.total_expected_loss, 250000);

    // Verify persistence from DB re-query
    const reloaded = getWorkflowSession(newSessionId, maker);
    assert.equal(reloaded.current_step, 4);
    assert.equal(reloaded.candidate_risks[0].process_name_ar, 'عمليات التحويل الشامل');
  });

  test('6. Enforce Horizontal RBAC Authorization on Session Access', () => {
    const unauthorizedUser = getUserWithRoles('EMP-3003'); // POS Operations maker only
    assert.ok(unauthorizedUser);

    assert.throws(() => {
      getWorkflowSession(newSessionId, unauthorizedUser);
    }, (err: any) => err.statusCode === 403 || String(err.message || '').includes('غير مصرح'));
  });
});
