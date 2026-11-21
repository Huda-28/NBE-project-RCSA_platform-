import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { initDatabase } from '../src/server/db.js';
import { apiRouter } from '../src/server/api.js';
import { getUserWithRoles, generateToken } from '../src/server/auth.js';

function startTestServer(): Promise<{ server: http.Server; baseUrl: string }> {
  return new Promise((resolve) => {
    initDatabase();
    const app = express();
    app.use(express.json({ limit: '15mb' }));
    app.use('/api', apiRouter);
    const server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address() as any;
      resolve({ server, baseUrl: `http://127.0.0.1:${addr.port}` });
    });
  });
}

function buildMinimalArabicCmapPdfBuffer(): Buffer {
  const cmap = Buffer.from(
    '/CIDInit /ProcSet findresource begin\n12 dict begin begincmap\n' +
      '6 beginbfchar\n' +
      '<0001> <062D>\n<0002> <0648>\n<0003> <0627>\n<0004> <0644>\n<0005> <0629>\n<0006> <0020>\n' +
      '<0007> <0633>\n<0008> <064A>\n<0009> <0641>\n<000A> <062A>\n' +
      'endbfchar\nendcmap\n',
    'ascii'
  );
  const cmapZ = zlib.deflateSync(cmap);
  // Visual LTR glyphs for 'سويفت' + ' ' + 'حوالة'
  const content = Buffer.from(
    'BT /F1 12 Tf 1 0 0 1 380 720 Tm [<000A0009000800020007000600050004000300020001>] TJ ET',
    'ascii'
  );
  const contentZ = zlib.deflateSync(content);
  const decoyFontZ = zlib.deflateSync(
    Buffer.from('\x00\x01\x00\x00(NuXJ|Y28e) Tj \x13\x14\x0c\x1e\x1a', 'latin1')
  );

  const pageObj = Buffer.from(
    '<</Type/Page/Parent 2 0 R/Resources<</Font<</F1 4 0 R>>>>/Contents 6 0 R>>',
    'ascii'
  );
  const objstmHdr = Buffer.from('3 0 ', 'ascii');
  const objstmData = zlib.deflateSync(Buffer.concat([objstmHdr, pageObj]));

  return Buffer.concat([
    Buffer.from('%PDF-1.7\n', 'ascii'),
    Buffer.from('1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n', 'ascii'),
    Buffer.from('2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n', 'ascii'),
    Buffer.from('4 0 obj<</Type/Font/Subtype/Type0/Encoding/Identity-H/ToUnicode 5 0 R>>endobj\n', 'ascii'),
    Buffer.from(`5 0 obj<</Length ${cmapZ.length}/Filter/FlateDecode>>stream\n`, 'ascii'),
    cmapZ,
    Buffer.from('\nendstream\nendobj\n', 'ascii'),
    Buffer.from(`6 0 obj<</Length ${contentZ.length}/Filter/FlateDecode>>stream\n`, 'ascii'),
    contentZ,
    Buffer.from('\nendstream\nendobj\n', 'ascii'),
    Buffer.from(`7 0 obj<</Type/FontFile2/Length ${decoyFontZ.length}/Filter/FlateDecode>>stream\n`, 'ascii'),
    decoyFontZ,
    Buffer.from('\nendstream\nendobj\n', 'ascii'),
    Buffer.from(
      `8 0 obj<</Type/ObjStm/N 1/First ${objstmHdr.length}/Length ${objstmData.length}/Filter/FlateDecode>>stream\n`,
      'ascii'
    ),
    objstmData,
    Buffer.from('\nendstream\nendobj\n%%EOF\n', 'ascii'),
  ]);
}

test('Custom Business Unit Creation, Draft Switching, Official Export & Arabic PDF Extraction', async (t) => {
  const { server, baseUrl } = await startTestServer();
  t.after(() => server.close());

  const adminUser = getUserWithRoles('EMP-9009');
  assert.ok(adminUser, 'Admin user EMP-9009 must exist');
  const adminToken = generateToken(adminUser!);

  const suffix = Date.now().toString(36).toUpperCase().slice(-5);
  const unitCode = `SWF-${suffix}`;
  let createdUnitId = '';
  let draftAssessmentId = '';

  await t.test('1. Create a brand new Business Unit and create a manual RCSA draft for it', async () => {
    const createRes = await fetch(`${baseUrl}/api/business-units`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        code: unitCode,
        name_ar: `إدارة التحويلات والتسويات الاختبارية ${suffix}`,
        name_en: `SWIFT Settlements Test ${suffix}`,
        description: 'وحدة اختبارية لتنفيذ التحويلات المالية والتسويات عبر سويفت والمقاصة الآلية',
      }),
    });
    assert.equal(createRes.status, 201);
    const createdBody = await createRes.json();
    createdUnitId = createdBody.business_unit.id;
    assert.equal(createdUnitId, `BU-${unitCode}`);

    // Verify GET /api/business-units includes the newly created unit
    const listRes = await fetch(`${baseUrl}/api/business-units`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(listRes.status, 200);
    const listData = await listRes.json();
    assert.ok(
      listData.business_units.some((b: any) => b.id === createdUnitId),
      'Newly created BU must appear in /api/business-units selector'
    );

    // Create manual draft on the new BU (like clicking "مسودة يدوية جديدة" in RCSATablePage)
    const draftRes = await fetch(`${baseUrl}/api/hitl/assessments/create-draft`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ unit_id: createdUnitId }),
    });
    assert.equal(draftRes.status, 200);
    const draftData = await draftRes.json();
    assert.ok(draftData.state?.assessment?.id);
    assert.ok(
      Array.isArray(draftData.state?.risks) && draftData.state.risks.length >= 1,
      'Manual draft for newly created BU must contain populated starter risk package'
    );
    draftAssessmentId = draftData.state.assessment.id;

    // Export Excel & PDF report for the new BU draft
    const pdfRes = await fetch(`${baseUrl}/api/hitl/assessments/${encodeURIComponent(draftAssessmentId)}/export-pdf`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(pdfRes.status, 200);
    assert.ok((pdfRes.headers.get('content-type') || '').includes('application/pdf'));

    const xlsxRes = await fetch(`${baseUrl}/api/hitl/assessments/${encodeURIComponent(draftAssessmentId)}/export-xlsx`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(xlsxRes.status, 200);
  });

  await t.test('2. Upload Arabic Identity-H CMap PDF to new BU and run AI Agent proposals cleanly (no gibberish, no POS leak)', async () => {
    let samplePdfPath = '';
    const uploadsDir = path.resolve('data/uploads');
    if (fs.existsSync(uploadsDir)) {
      for (const dir of fs.readdirSync(uploadsDir)) {
        const fullDir = path.join(uploadsDir, dir);
        if (fs.statSync(fullDir).isDirectory()) {
          const match = fs.readdirSync(fullDir).find(f => f.includes('الحوالات') && f.endsWith('.pdf'));
          if (match) {
            samplePdfPath = path.join(fullDir, match);
            break;
          }
        }
      }
    }
    const pdfBuffer = samplePdfPath && fs.existsSync(samplePdfPath)
      ? fs.readFileSync(samplePdfPath)
      : buildMinimalArabicCmapPdfBuffer();

    // Create a workflow session for the new BU
    const createSessRes = await fetch(`${baseUrl}/api/workflow/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        unit_id: createdUnitId,
        workflow_mode: 'NEW',
        session_title: 'تقييم الحوالات وسويفت',
        use_historical_sources: false,
      }),
    });
    assert.equal(createSessRes.status, 201);
    const sessBody = await createSessRes.json();
    const sessionId = sessBody.session.id;

    // Upload the Arabic Identity-H CMap PDF linked to the session
    const uploadRes = await fetch(
      `${baseUrl}/api/guided-rcsa/units/${encodeURIComponent(createdUnitId)}/documents?session_id=${encodeURIComponent(sessionId)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          filename: 'دليل_اجراءات_العمل_الافتراضية_لاعمال_الحوالات.pdf',
          doc_type: 'SOP',
          base64_content: pdfBuffer.toString('base64'),
          file_size_bytes: pdfBuffer.length,
        }),
      }
    );
    assert.equal(uploadRes.status, 200);
    const uploadBody = await uploadRes.json();
    assert.equal(uploadBody.extraction_status, 'EXTRACTED_TEXT_CHUNKS');
    assert.ok(uploadBody.extracted_chunks_count >= 1);

    // Send agent message to generate proposals from the uploaded Arabic PDF
    const msgRes = await fetch(`${baseUrl}/api/agent/sessions/${encodeURIComponent(sessionId)}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        message_text_ar: 'استنبط المخاطر والضوابط الرقابية من دليل إجراءات الحوالات المرفوع.',
        model_profile: 'FAST_LLM',
      }),
    });
    assert.equal(msgRes.status, 200);
    const agentState = await msgRes.json();
    const proposalsJson = JSON.stringify(agentState.proposals || []);
    const chatJson = JSON.stringify(agentState.conversations || []);
    assert.ok(!proposalsJson.includes('0NuXJ'), 'Proposals must not contain binary gibberish');
    assert.ok(!chatJson.includes('0NuXJ'), 'Chat messages must not contain binary gibberish');
    assert.ok(!proposalsJson.includes('نقاط البيع'), 'Non-POS BU must never leak POS risk text');
    assert.ok(
      !proposalsJson.includes('مخاطرة مستنبطة من تحليل المستند'),
      'Risk description must state the actual operational risk instead of boilerplate wrapper'
    );
    assert.ok(
      !/ضابط رقابي \(صفحة/.test(proposalsJson),
      'Control description must state actual control name & type instead of page/chunk coordinates'
    );
    assert.ok(agentState.proposals.length >= 1, 'Agent should generate clean RCSA proposals from the Arabic PDF');
    const firstProp = agentState.proposals[0].proposal_data;
    assert.ok(
      firstProp.risk_title_ar && !firstProp.risk_title_ar.includes('صفحة 1'),
      'Risk title must describe the actual risk, not the page number'
    );
    assert.ok(
      firstProp.controls?.[0]?.control_name_ar && firstProp.controls?.[0]?.control_type_label_ar,
      'Proposed control must include explicit control name and type classification'
    );
  });
});
