import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'child_process';

// Ensure isolated test DB
process.env.NODE_ENV = 'test';
if (!process.env.RCSA_DB_PATH) {
  process.env.RCSA_DB_PATH = path.resolve('data', 'rcsa_test.db');
}

import { db, initDatabase, DB_PATH } from '../src/server/db.js';
import { getUserWithRoles } from '../src/server/auth.js';
import { createWorkflowSession, linkDocumentToWorkflowSession } from '../src/server/workflow-session-service.js';
import { searchRelevantCitations, assembleRagContextBundle } from '../src/server/rag-service.js';
import { generateLlmCompletion, getLlmConfigStatus } from '../src/server/llm-adapter.js';
import {
  getAgentSessionState,
  sendAgentMessage,
  decideAgentProposal,
  answerAgentClarification,
  applyAllAcceptedProposalsToDraft,
} from '../src/server/agent-service.js';
import { getAssessmentHitlFullState } from '../src/server/hitl-service.js';
import { getPythonExecutable } from '../src/server/python-runtime.js';

describe('Phase 3B — Real Evidence-Grounded Conversational RCSA Agent E2E', () => {
  let maker: any;
  let checker: any;
  let unauthorizedMaker: any;
  let newSessionId: string;
  let updateSessionId: string;

  before(() => {
    initDatabase();
    maker = getUserWithRoles('EMP-1001'); // Maker for BU-SYNDICATED, BU-ACCOUNT, BU-POS
    checker = getUserWithRoles('EMP-2002'); // Checker for BU-SYNDICATED, BU-ACCOUNT, BU-POS
    unauthorizedMaker = getUserWithRoles('EMP-3003'); // Maker for BU-POS only
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

  test('1. Safe behavior when no model is configured (LLM_NOT_CONFIGURED)', async () => {
    delete process.env.LLM_API_BASE_URL;
    delete process.env.OPENAI_API_BASE;

    const config = getLlmConfigStatus();
    assert.equal(config.isConfigured, false);

    const completion = await generateLlmCompletion([{ role: 'user', content: 'مرحباً' }]);
    assert.equal(completion.success, false);
    assert.equal(completion.code, 'LLM_NOT_CONFIGURED');
    assert.ok(completion.error?.includes('غير مهيأ'));
  });

  test('Sends the user-selected Qwen model to the configured LLM endpoint', async () => {
    const originalBaseUrl = process.env.LLM_API_BASE_URL;
    const originalModelName = process.env.LLM_MODEL_NAME;
    const originalFetch = globalThis.fetch;
    const requestedModels: string[] = [];

    process.env.LLM_API_BASE_URL = 'http://localhost:11434/v1';
    process.env.LLM_MODEL_NAME = 'qwen2.5:7b';
    globalThis.fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
      const requestBody = JSON.parse(String(init?.body));
      requestedModels.push(requestBody.model);
      return new Response(JSON.stringify({ choices: [{ message: { content: 'تم' } }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    try {
      const config = getLlmConfigStatus();
      assert.deepEqual(config.availableModels.map((model) => model.id), ['qwen2.5:0.5b', 'qwen2.5:7b']);

      for (const modelName of ['qwen2.5:0.5b', 'qwen2.5:7b'] as const) {
        const completion = await generateLlmCompletion(
          [{ role: 'user', content: 'اختبار' }],
          { modelName },
        );
        assert.equal(completion.success, true);
      }

      assert.deepEqual(requestedModels, ['qwen2.5:0.5b', 'qwen2.5:7b']);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalBaseUrl === undefined) delete process.env.LLM_API_BASE_URL;
      else process.env.LLM_API_BASE_URL = originalBaseUrl;
      if (originalModelName === undefined) delete process.env.LLM_MODEL_NAME;
      else process.env.LLM_MODEL_NAME = originalModelName;
    }
  });

  test('2. Upload multiple real-format documents into one session and retrieve citations', () => {
    const session = createWorkflowSession({
      unitId: 'BU-SYNDICATED',
      user: maker,
      workflowMode: 'NEW',
      sessionTitle: 'جلسة التقييم الموحدة الجديدة مع المستندات',
    });
    newSessionId = session.id;

    // Insert 2 test documents with chunks
    const doc1Id = `DOC-SOP-${Date.now()}`;
    db.prepare(`
      INSERT INTO documents (id, unit_id, file_type, filename, uploaded_by, session_id, uploaded_at)
      VALUES (?, 'BU-SYNDICATED', 'SOP', 'SOP_Syndicated_Loans_2026.pdf', 'EMP-1001', ?, datetime('now'))
    `).run(doc1Id, newSessionId);

    db.prepare(`
      INSERT INTO document_chunks (id, document_id, chunk_index, section_title, content_text, page_number)
      VALUES (?, ?, 1, 'إجراءات القيد والمراجعة المستندية', 'يجب مطابقة التوقيعات المعتمدة ورسائل السويفت الورقية قبل تنفيذ القروض المشتركة.', 1)
    `).run(`CHK-1-${Date.now()}`, doc1Id);

    const doc2Id = `DOC-AUDIT-${Date.now()}`;
    db.prepare(`
      INSERT INTO documents (id, unit_id, file_type, filename, uploaded_by, session_id, uploaded_at)
      VALUES (?, 'BU-SYNDICATED', 'AUDIT_REPORT', 'Audit_Finding_Syndicated_2026.pdf', 'EMP-1001', ?, datetime('now'))
    `).run(doc2Id, newSessionId);

    db.prepare(`
      INSERT INTO document_chunks (id, document_id, chunk_index, section_title, content_text, page_number)
      VALUES (?, ?, 1, 'ملاحظات التفتيش الميداني', 'تبين وجود تأخير في أرشفة طلبات التحويل المالية لمدة تجاوزت 48 ساعة.', 2)
    `).run(`CHK-2-${Date.now()}`, doc2Id);

    linkDocumentToWorkflowSession(newSessionId, doc1Id, maker);
    linkDocumentToWorkflowSession(newSessionId, doc2Id, maker);

    // Test citation search
    const citations = searchRelevantCitations(newSessionId, 'BU-SYNDICATED', 'السويفت الورقية والتأخير');
    assert.ok(citations.length > 0, 'Citations must be retrieved from uploaded session documents');
    assert.ok(citations.some(c => c.quote_text.includes('السويفت')));
  });

  test('3. Generate proposals for a new session without historical seed risks', async () => {
    const state = await sendAgentMessage(newSessionId, maker, 'قم بتحليل المستندات المرفوعة وتوليد المخاطر والضوابط المقترحة.');
    
    assert.ok(state.messages.length >= 2, 'Conversation must contain user message and agent reply');
    assert.ok(state.proposals.length > 0, 'Proposals must be generated from uploaded session documents');
    assert.equal(state.proposals[0].status, 'PROPOSED');
    assert.ok(state.proposals[0].citations.length > 0, 'Every generated proposal must contain source citations');
  });

  test('4. Compare changed SOPs and new incidents with an existing RCSA baseline (UPDATE Mode)', async () => {
    const session = createWorkflowSession({
      unitId: 'BU-SYNDICATED',
      user: maker,
      workflowMode: 'UPDATE',
      sessionTitle: 'تحديث تقييم القروض المشتركة القائم',
    });
    updateSessionId = session.id;

    const bundle = assembleRagContextBundle(updateSessionId, 'BU-SYNDICATED');
    assert.ok(bundle.baseline_risks.length > 0, 'UPDATE mode RAG context bundle includes baseline risks');
    assert.equal(bundle.unit.id, 'BU-SYNDICATED');
  });

  test('5. Ask and persist clarification questions and employee answers', async () => {
    const state = getAgentSessionState(newSessionId, maker);
    assert.ok(state.clarifications.length > 0, 'Clarifications must be generated for incomplete inputs');

    const targetClarif = state.clarifications[0];
    const updatedState = answerAgentClarification(newSessionId, targetClarif.id, maker, '250,000 جم (متوسط M)');

    const answered = updatedState.clarifications.find((c: any) => c.id === targetClarif.id);
    assert.equal(answered?.user_answer_ar, '250,000 جم (متوسط M)');
    assert.equal(answered?.answered_by, 'EMP-1001');
  });

  test('6. Accept/reject individual risk and control proposals', () => {
    const state = getAgentSessionState(newSessionId, maker);
    assert.ok(state.proposals.length > 0);

    const targetProp = state.proposals[0];

    // Accept proposal
    const acceptedState = decideAgentProposal(newSessionId, targetProp.id, maker, 'ACCEPT');
    const acceptedProp = acceptedState.proposals.find((p: any) => p.id === targetProp.id);
    assert.equal(acceptedProp?.status, 'ACCEPTED');

    // Verify accepted risk is added to candidate risks in workflow session
    assert.ok(acceptedState.session.candidate_risks.some((r: any) => r.risk_id === targetProp.proposal_data.risk_id));
  });

  test('7. Apply accepted inputs, recalculate deterministic outcomes and open review draft', () => {
    const result = applyAllAcceptedProposalsToDraft(newSessionId, maker);

    assert.equal(result.success, true);
    assert.ok(result.assessment?.id, 'A real assessment draft must be created in SQLite');
    assert.equal(result.assessment.status, 'INCOMPLETE_DRAFT');

    // Verify created assessment can be reloaded by HITL service
    const asmRow = db.prepare('SELECT * FROM rcsa_assessments WHERE id = ?').get(result.assessment.id) as any;
    assert.ok(asmRow);
    assert.equal(asmRow.unit_id, 'BU-SYNDICATED');
  });

  test('8. Verify NFI/ESG evidence traceability in accepted proposals', () => {
    const state = getAgentSessionState(newSessionId, maker);
    const acceptedProp = state.proposals.find((p: any) => p.status === 'ACCEPTED');

    assert.ok(acceptedProp);
    assert.ok(acceptedProp.proposal_data.taxonomy_l1_ar, 'Taxonomy L1 must be present');
    assert.ok(acceptedProp.proposal_data.esg_pillar, 'ESG pillar classification must be present');
    assert.ok(acceptedProp.citations.length > 0, 'Source evidence citation must be attached');
  });

  test('9. Export the reviewed version using official bank Excel template', () => {
    const state = getAgentSessionState(newSessionId, maker);
    const draftId = state.session.draft_assessment_id;
    assert.ok(draftId, 'Draft assessment ID must exist');

    const hitlState = getAssessmentHitlFullState(draftId);
    assert.ok(hitlState.risks?.length > 0, 'Created draft must contain risks');

    // Verify Python official exporter runs without error on the created assessment
    const contents = execFileSync(getPythonExecutable(), ['-m', 'rcsa_engine.export_flexible'], {
      input: JSON.stringify({ unit_id: 'BU-SYNDICATED', risks: hitlState.risks }),
      encoding: 'utf-8',
      maxBuffer: 32 * 1024 * 1024,
    });

    const bytes = Buffer.from(contents, 'base64');
    assert.ok(bytes.length > 1000, 'XLSX exporter must return non-empty workbook bytes');
  });

  test('10. Confirm tenant/business-unit authorization and Maker/Checker restrictions', () => {
    // POS maker (EMP-3003) attempting to access Syndicated Loans agent session
    assert.throws(() => {
      getAgentSessionState(newSessionId, unauthorizedMaker);
    }, (err: any) => err.statusCode === 403 || String(err.message || '').includes('غير مصرح'));

    assert.throws(() => {
      decideAgentProposal(newSessionId, 'PROP-INVALID', unauthorizedMaker, 'ACCEPT');
    }, (err: any) => err.statusCode === 403 || String(err.message || '').includes('غير مصرح'));
  });
});
