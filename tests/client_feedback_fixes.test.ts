import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

process.env.NODE_ENV = 'test';
if (!process.env.RCSA_DB_PATH) {
  process.env.RCSA_DB_PATH = path.resolve('data', 'rcsa_client_fixes_test.db');
}

import { initDatabase, db, DB_PATH } from '../src/server/db.js';
import { apiRouter } from '../src/server/api.js';
import { getUserWithRoles, generateToken } from '../src/server/auth.js';
import { extractMatchedPatternsFromFullDocument } from '../src/server/proposal-extractor.js';
import {
  buildOfficialRcsaReportModel,
  buildOfficialRcsaReportHtml,
} from '../src/utils/officialReportBuilder.js';
import { createWorkflowSession } from '../src/server/workflow-session-service.js';

function startTestServer(): Promise<{ server: http.Server; baseUrl: string }> {
  return new Promise((resolve) => {
    initDatabase();
    const app = express();
    app.use('/api', apiRouter);
    const server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address() as any;
      resolve({ server, baseUrl: `http://127.0.0.1:${addr.port}` });
    });
  });
}

test('Client Feedback 9 Remarks Verification Suite', async (t) => {
  t.after(() => {
    try {
      db.close();
      if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
      if (fs.existsSync(`${DB_PATH}-wal`)) fs.unlinkSync(`${DB_PATH}-wal`);
      if (fs.existsSync(`${DB_PATH}-shm`)) fs.unlinkSync(`${DB_PATH}-shm`);
    } catch {
      // Ignore cleanup errors
    }
  });

  await t.test('Remarks 1-6: Transfers SOP extraction enforces Legal "-", Class 1/2 acceptance, Basel L2/L3 Arabic names, and CBE 34 ESG items', () => {
    const corpus = `
      دليل إجراءات العمل الافتراضية لأعمال الحوالات
      1. التحويلات الصادرة (Outgoing Transfers / MT103): التحقق من الآيبان والصلاحيات المزدوجة ومواعيد القطع.
      2. التحويلات الواردة (Incoming Transfers): استلام سويفت ومطابقة المستفيد.
      3. الاستفسارات والمرتجعات (MT199 / MT192): متابعة الاستفسارات والرد ضمن SLA.
      4. مطابقة حسابات النوسترو وحسابات الأستاذ العام (Nostro / GL Reconciliation).
      5. فحص قوائم الحظر (Sanction Screening / AML).
      6. الوقاية من الاحتيال الخارجي والتزوير ومعاودة الاتصال (Call-Back Verification).
      7. القيود المحاسبية والترحيل وتحصيل العمولات والمصاريف.
      8. تجميد الأموال وفك التجميد (Funds Freeze).
      9. تأخر معالجة الحوالات أو عدم تنفيذها وفق اتفاقيات مستوى الخدمة (SLA).
    `;
    const extracted = extractMatchedPatternsFromFullDocument(corpus, 9);
    assert.ok(extracted.length >= 8);

    // Remark 6: Pattern 1 (Outgoing Transfers) Legal Exposure is '-' when covered by approved templates
    const p1 = extracted.find((r) => r.pattern_id === 'OUTGOING_TRANSFERS_EXECUTION');
    assert.ok(p1, 'Pattern 1 must exist');
    assert.equal(p1.nfi_legal, '-', 'Outgoing transfers legal exposure must be "-" (covered by approved contracts)');

    // Remark 2: Pattern 3 (Queries/Returns) Acceptance Class is 2 (Service M, acceptable with future SLA enhancement)
    const p3 = extracted.find((r) => r.pattern_id === 'OMITTED_EXECUTION_INQUIRY_SLA');
    assert.ok(p3, 'Pattern 3 must exist');
    assert.equal(p3.acceptance_class, 2, 'Queries/Returns risk must be Acceptance Class 2');
    assert.equal(p3.nfi_service, 'M');
    assert.equal(p3.taxonomy_l3_id, 'L3-08-01-03');

    // Remark 1: Pattern 6 (External Fraud) Acceptance Class 1 + empty corrective action when all controls effective
    const p6 = extracted.find((r) => r.pattern_id === 'EXTERNAL_FRAUD_FORGERY_CALLBACK');
    assert.ok(p6, 'Pattern 6 must exist');
    assert.equal(p6.acceptance_class, 1, 'External fraud risk with all effective controls must be Acceptance Class 1');
    assert.equal(p6.corrective_action_ar, '', 'Acceptance Class 1 must have empty corrective action');
    assert.equal(p6.taxonomy_l3_id, 'L3-02-01-02');

    // Remark 3 & 4: Every extracted risk has valid official Basel L2/L3 and CBE 34 ESG linkage
    for (const r of extracted) {
      assert.ok(r.taxonomy_l1_id.startsWith('L1-'), `Missing L1 ID on ${r.pattern_id}`);
      assert.ok(r.taxonomy_l2_id.startsWith('L2-'), `Missing L2 ID on ${r.pattern_id}`);
      assert.ok(r.taxonomy_l3_id.startsWith('L3-'), `Missing L3 ID on ${r.pattern_id}`);
      assert.ok(r.taxonomy_l2_ar.length > 3, `Missing L2 Arabic name on ${r.pattern_id}`);
      assert.ok(r.taxonomy_l3_ar.length > 3, `Missing L3 Arabic name on ${r.pattern_id}`);
      assert.equal(r.esg.status, 'ASSESSED', `Risk ${r.pattern_id} must map to CBE ESG item`);
      assert.ok(r.esg.catalogue_ids.length > 0 && r.esg.catalogue_ids[0] >= 1 && r.esg.catalogue_ids[0] <= 34);
    }
  });

  await t.test('Remark 5 & 7: Default report HTML uses official reference burgundy template (#963634/#C00000) and calculates Key Risk from Residual + NFI', () => {
    const model = buildOfficialRcsaReportModel({
      assessment: { id: 'ASM-TEST-BURGUNDY', status: 'DRAFT' },
      unit: { id: 'BU-SYNDICATED', name_ar: 'وحدة اختبارية', name_en: 'Test BU', code: 'TST' },
      risks: [
        {
          risk_id: 'RSK-KR-RES-LOW',
          current_draft_input: {
            process_name: 'اختبار',
            risk_description: 'اختبار احتساب المخاطرة الجوهرية من الأثر المتبقي',
            expected_frequency_text: 'سنوياً',
            controls: [],
          },
          calculated_output: {
            individual_financial_impact_egp: 501000,
            expected_annual_loss_egp: 1002000,
            annualized_financial_rating: 'H',
            residual_financial_amount_egp: 50100,
            continuous_residual_rating: 'L',
          },
          phase2c: {
            inputs: { acceptance_class: 1 },
            result: {
              acceptance_class: 1,
              nfi_overall: 'M',
              nfi_dimensions: { service: 'M', reputation: 'L', regulatory: '-', legal: '-' },
            },
          },
        },
      ],
    });

    // Residual L and NFI M => Key Risk MUST be 'no' even though Inherent financial rating is 'H'
    assert.equal(model.risks[0].key_risk_badge, 'no');

    const defaultHtml = buildOfficialRcsaReportHtml(model);
    assert.ok(defaultHtml.includes('>no<'), 'Rendered HTML Key Risk cell must show no');
    assert.ok(defaultHtml.includes('#963634'), 'Default report HTML must use template burgundy #963634');
    assert.ok(defaultHtml.includes('#C00000'), 'Default report HTML must use template title color #C00000');
    assert.ok(defaultHtml.includes('Sakkal Majalla'), 'Default report HTML must include template font Sakkal Majalla');
    assert.ok(defaultHtml.includes('ضوابط الاحتساب'), 'Report HTML must display Key Risk & NFI aggregation methodology note');

    const emeraldHtml = buildOfficialRcsaReportHtml(model, { theme: 'nbe_emerald' });
    assert.ok(emeraldHtml.includes('#09331F') && emeraldHtml.includes('#006547'), 'Optional nbe_emerald theme remains supported');
  });

  await t.test('Remark 7 (API): /export-report-model defaults to official reference burgundy theme when no theme query param is given', async () => {
    const { server, baseUrl } = await startTestServer();
    try {
      const maker = getUserWithRoles('EMP-1001')!;
      const token = generateToken(maker);
      const res = await fetch(`${baseUrl}/api/hitl/assessments/ASM-SYND-2026-V1/export-report-model`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(res.status, 200);
      const json = await res.json();
      assert.ok(json.html_preview.includes('#963634'));
      assert.ok(json.html_preview.includes('#C00000'));
    } finally {
      server.close();
    }
  });

  await t.test('Remark 9: Dual-source NEW session (useHistoricalSources + preloadBaselineRisks) preloads baseline while pure NEW stays clean', () => {
    initDatabase();
    const maker = getUserWithRoles('EMP-1001')!;
    const pureNew = createWorkflowSession({
      unitId: 'BU-SYNDICATED',
      user: maker,
      workflowMode: 'NEW',
      sessionTitle: 'مستندات جديدة فقط',
    });
    assert.equal(pureNew.base_assessment_id, null);
    assert.equal(pureNew.candidate_risks.length, 0);

    const dualSource = createWorkflowSession({
      unitId: 'BU-SYNDICATED',
      user: maker,
      workflowMode: 'NEW',
      useHistoricalSources: true,
      preloadBaselineRisks: true,
      sessionTitle: 'مستندات جديدة + بيانات الوحدة السابقة معاً',
    });
    assert.equal(dualSource.workflow_mode, 'NEW');
    assert.equal(dualSource.use_historical_sources, true);
    assert.ok(dualSource.base_assessment_id, 'Dual-source session must link baseline assessment ID');
    assert.ok(dualSource.candidate_risks.length > 0, 'Dual-source session must preload previous unit risks alongside document upload');
  });
});
