import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'http';
import { initDatabase } from '../src/server/db.js';
import { apiRouter } from '../src/server/api.js';
import { getUserWithRoles, generateToken } from '../src/server/auth.js';
import {
  buildOfficialRcsaReportModel,
  buildOfficialRcsaReportHtml,
  classifyControlEffectivenessTone,
  classifyAcceptanceDecisionTone,
  formatOfficialSelectedRrfKey,
  formatOfficialControlFrequency,
} from '../src/utils/officialReportBuilder.js';

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

test('Official RCSA Report Builder & PDF/Excel Export Suite', async (t) => {
  await t.test('1. Pure logic: classifyControlEffectivenessTone & classifyAcceptanceDecisionTone match reference PDF colors', () => {
    const effGreen = classifyControlEffectivenessTone('ضابط رقابي فعال', 'EFFECTIVE');
    assert.equal(effGreen.tone, 'green');

    const effYellow = classifyControlEffectivenessTone(
      'ضابط رقابي فعال ولكن يحتاج تطوير (إجراءات تصحيحية لاحقة)',
      'PARTIALLY_EFFECTIVE'
    );
    assert.equal(effYellow.tone, 'yellow');

    const accGreen = classifyAcceptanceDecisionTone('مخاطرة مقبولة / ضوابط رقابية كافية', 1, 'L', false);
    assert.equal(accGreen.tone, 'green');

    const accYellow = classifyAcceptanceDecisionTone(
      'مخاطرة مقبولة / ضوابط رقابية كافية ولكن يمكن تجويد الضوابط مستقبلا بغرض تحسين الخدمة/ الأعمال',
      3,
      'H',
      true
    );
    assert.equal(accYellow.tone, 'yellow');

    const accOrange = classifyAcceptanceDecisionTone(
      'مخاطرة غير مقبولة حيث أن الضوابط الرقابية تحتاج تطوير',
      4,
      'VH',
      true
    );
    assert.equal(accOrange.tone, 'orange');

    assert.equal(formatOfficialSelectedRrfKey('Manual / preventive'), 'Manual / preventive');
    assert.equal(formatOfficialSelectedRrfKey('Semi Auto / preventive'), 'Semi Auto / preventive');
    assert.equal(formatOfficialSelectedRrfKey(null), '-');
    assert.equal(formatOfficialControlFrequency('Per Transaction'), 'Multiple times a day\nعدة مرات في اليوم');
    assert.equal(formatOfficialControlFrequency('Per Event'), 'Ad-hoc\nوفقاً والحالة');
  });

  await t.test('2. Pure logic: buildOfficialRcsaReportModel & buildOfficialRcsaReportHtml produce exact reference structure', () => {
    const model = buildOfficialRcsaReportModel({
      assessment: { id: 'ASM-SYND-2026-V1', status: 'APPROVED', approved_at: '2026-08-15T10:30:00Z' },
      unit: { id: 'BU-SYNDICATED', name_ar: 'لعمليات القروض المشتركة', name_en: 'Syndicated Loans', code: 'SYND-OPS' },
      risks: [
        {
          risk_id: 'RSK-SYND-01',
          current_draft_input: {
            process_name: 'تنفيذ التحويلات',
            strategic_objective: 'التركيز علي العملاء و تعظيم الأرباح',
            risk_description: 'التعامل مع أحد أطراف محظور التعامل معهم',
            expected_frequency_text: 'مرة كل نصف سنه',
            taxonomy_l1_id: 'L1-05',
            taxonomy_l1_ar: '_5_ عملاء و منتجات',
            controls: [
              {
                control_id: 'CTRL-01',
                control_description: 'الكشف عن عناصر التحويل من خلال أنظمة الكشف لقوائم الحظر',
                control_owner: 'السلطه الاشرافيه',
                control_method_raw: 'Semi-Automated',
                effectiveness_raw: 'ضابط رقابي فعال',
                control_frequency_raw: 'Daily\nيومياً',
                control_type_raw: 'ضوابط مانعة Preventive',
              },
              {
                control_id: 'CTRL-02',
                control_description: 'الكشف اليا على كافة اطراف التحويل الصادر قبل الارسال',
                control_owner: 'النظام',
                control_method_raw: 'Automated',
                effectiveness_raw: 'ضابط رقابي فعال',
                control_frequency_raw: 'Ad-hoc\nوفقاً والحالة',
                control_type_raw: 'ضوابط مانعة Preventive',
              },
            ],
          },
          calculated_output: {
            individual_financial_impact_egp: 501000,
            expected_annual_loss_egp: 1002000,
            annualized_financial_rating: 'H',
            selected_workbook_rrf_key: 'Auto / preventive',
            residual_financial_amount_egp: 50100,
            continuous_residual_rating: 'L',
          },
          phase2c: {
            inputs: { acceptance_class: 1, corrective_action: 'نص تصحيحي لا يجب أن يظهر للفئة 1' },
            result: {
              acceptance_class: 1,
              acceptance_label_ar: 'مخاطرة مقبولة / ضوابط رقابية كافية',
              nfi_overall: 'M',
              nfi_dimensions: { service: 'M', reputation: 'M', regulatory: 'L', legal: 'L' },
            },
          },
        },
      ],
    });

    assert.equal(model.title_ar, 'نموذج المخاطر الافتراضي "لعمليات القروض المشتركة"');
    assert.equal(model.strategic_objective_ar, 'التركيز علي العملاء و تعظيم الأرباح');
    assert.equal(model.risks.length, 1);
    assert.equal(model.risks[0].controls.length, 2);
    assert.equal(model.risks[0].individual_impact_egp, '501000');
    assert.equal(model.risks[0].expected_annual_loss_egp, '1002000.00');
    assert.equal(model.risks[0].residual_loss_formatted, '50,100.00');
    assert.equal(model.risks[0].corrective_action_ar, '', 'Class 1 accepted risk must suppress corrective action');

    const html = buildOfficialRcsaReportHtml(model, { includeExtendedColumns: true });
    assert.ok(html.includes('نموذج المخاطر الافتراضي &quot;لعمليات القروض المشتركة&quot;'));
    assert.ok(html.includes('الأهداف الاستراتيجية'));
    assert.ok(html.includes('التقدير النهائي للمخاطرة ومدى فاعلية الإجراءات الرقابية المطبقة ككل'));
    assert.ok(html.includes('#963634'));
    assert.ok(html.includes('#C00000'));
    assert.ok(html.includes('#99FF99'));
    assert.ok(html.includes('Sakkal Majalla'));
    assert.ok(html.includes('rowspan="2"'));
  });

  await t.test('3. API E2E: /export-report-model, /export-pdf, and /export-xlsx return valid official reports', async () => {
    const { server, baseUrl } = await startTestServer();
    try {
      const maker = getUserWithRoles('EMP-1001')!;
      const token = generateToken(maker);

      // 1. Fetch report model & HTML preview for Syndicated Loans approved assessment
      const modelRes = await fetch(
        `${baseUrl}/api/hitl/assessments/ASM-SYND-2026-V1/export-report-model?theme=reference_burgundy`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      assert.equal(modelRes.status, 200);
      const modelJson = await modelRes.json();
      assert.ok(modelJson.report_model);
      assert.equal(modelJson.report_model.risks.length, 8);
      assert.ok(modelJson.html_preview.includes('نموذج المخاطر الافتراضي'));

      // 2. Export PDF report
      const pdfRes = await fetch(
        `${baseUrl}/api/hitl/assessments/ASM-SYND-2026-V1/export-pdf`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      assert.equal(pdfRes.status, 200);
      assert.equal(pdfRes.headers.get('content-type'), 'application/pdf');
      const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer());
      assert.ok(pdfBuffer.length > 100);
      assert.equal(pdfBuffer.subarray(0, 4).toString('ascii'), '%PDF');

      // 3. Export Excel report for a non-Syndicated unit (e.g. ASM-ACCT-2026-V1) to test export_flexible.py dynamic header & merges
      const xlsxRes = await fetch(
        `${baseUrl}/api/hitl/assessments/ASM-ACCT-2026-V1/export-xlsx`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      assert.equal(xlsxRes.status, 200);
      const xlsxBuffer = Buffer.from(await xlsxRes.arrayBuffer());
      assert.ok(xlsxBuffer.length > 5000);
      // PK zip header
      assert.equal(xlsxBuffer.subarray(0, 2).toString('ascii'), 'PK');

      // 4. Create a new Business Unit as Maker (EMP-1001) and verify it is immediately authorized & usable
      const createBuRes = await fetch(`${baseUrl}/api/business-units`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name_ar: 'إدارة الاعتمادات المستندية وخطابات الضمان (اختبار)',
          code: 'TEST-TF-01',
          allow_existing: true,
        }),
      });
      assert.ok(createBuRes.status === 201 || createBuRes.status === 200);
      const createBuJson = await createBuRes.json();
      assert.equal(createBuJson.business_unit.id, 'BU-TEST-TF-01');

      const listBuRes = await fetch(`${baseUrl}/api/business-units`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const listBuJson = await listBuRes.json();
      assert.ok(
        listBuJson.business_units.some((u: any) => u.id === 'BU-TEST-TF-01'),
        'Newly created unit must appear in Maker authorized business units list'
      );

      // Clean up test unit so initial seed count assertions remain untouched
      const { db } = await import('../src/server/db.js');
      db.prepare('DELETE FROM user_bu_roles WHERE unit_id = ?').run('BU-TEST-TF-01');
      db.prepare('DELETE FROM business_units WHERE id = ?').run('BU-TEST-TF-01');
    } finally {
      server.close();
    }
  });
});
