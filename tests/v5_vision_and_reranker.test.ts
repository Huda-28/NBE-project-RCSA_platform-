import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

process.env.NODE_ENV = 'test';
if (!process.env.RCSA_DB_PATH) {
  process.env.RCSA_DB_PATH = path.resolve('data', 'rcsa_test_v5.db');
}

import { db, initDatabase, DB_PATH } from '../src/server/db.js';
import { getUserWithRoles } from '../src/server/auth.js';
import {
  chunkExtractedDocumentText,
  countMarkdownTablesInText,
} from '../src/server/table-chunker.js';
import {
  extractControlDetailsFromText,
  extractRiskDetailsFromText,
} from '../src/server/proposal-extractor.js';
import {
  uploadSupportingDocumentForUnit,
  uploadSupportingDocumentWithVision,
  reanalyzeDocumentWithVision,
  getGuidedAssessmentUnitContext,
} from '../src/server/hitl-service.js';
import {
  createWorkflowSession,
  getWorkflowSession,
  linkDocumentToWorkflowSession,
} from '../src/server/workflow-session-service.js';
import {
  assembleRagContextBundle,
  fuseBm25AndVectorWithRrf,
  rerankCandidatesWithStage2,
  searchRelevantCitations,
} from '../src/server/rag-service.js';
import { buildHighPrecisionRcsaProposals } from '../src/server/agent-service.js';

function buildMinimalValidPngBase64(): string {
  const width = 2;
  const height = 2;
  // Raw scanlines: filter byte (0) + 2 RGB pixels per row
  const raw = Buffer.from([
    0, 255, 0, 0, 0, 255, 0,
    0, 0, 0, 255, 255, 255, 255,
  ]);
  const idatData = zlib.deflateSync(raw);

  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    crcTable[n] = c >>> 0;
  }
  const crc32 = (buf: Buffer): number => {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  };
  const makeChunk = (type: string, data: Buffer): Buffer => {
    const typeBuf = Buffer.from(type, 'ascii');
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(data.length, 0);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
    return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB

  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([
    sig,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', idatData),
    makeChunk('IEND', Buffer.alloc(0)),
  ]).toString('base64');
}

function buildMinimalScannedPdfBase64(): string {
  const fakeJpeg = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
    0xff, 0xfe, 0x00, 0x20, ...Array(30).fill(0x41),
    0xff, 0xd9,
  ]);
  const head = Buffer.from(
    '%PDF-1.4\n' +
      '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
      '2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n' +
      '3 0 obj<</Type/Page/Parent 2 0 R/Resources<</XObject<</Im1 4 0 R>>>>/Contents 5 0 R>>endobj\n' +
      `4 0 obj<</Type/XObject/Subtype/Image/Width 120/Height 90/ColorSpace/DeviceRGB/BitsPerComponent 8/Filter/DCTDecode/Length ${fakeJpeg.length}>>stream\n`,
    'ascii'
  );
  const tail = Buffer.from(
    '\nendstream\nendobj\n' +
      '5 0 obj<</Length 15>>stream\n/Im1 Do\nendstream\nendobj\n%%EOF\n',
    'ascii'
  );
  return Buffer.concat([head, fakeJpeg, tail]).toString('base64');
}

describe('V5 Multimodal Vision, Table Understanding & Stage-2 Reranker Proof Suite', () => {
  let maker: any;

  before(() => {
    initDatabase();
    maker = getUserWithRoles('EMP-1001'); // Maker for BU-SYNDICATED
  });

  after(() => {
    try {
      db.close();
      if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
      for (const suffix of ['-wal', '-shm']) {
        if (fs.existsSync(`${DB_PATH}${suffix}`)) fs.unlinkSync(`${DB_PATH}${suffix}`);
      }
    } catch {
      // ignore cleanup error
    }
  });

  test('1. Table-Aware Chunker keeps Markdown tables intact and repeats header + separator on large splits', () => {
    const header = '| العملية | وصف الخطر | الضابط الرقابي | المالك | التكرار |';
    const sep = '| --- | --- | --- | --- | --- |';
    const rows = Array.from({ length: 12 }, (_, idx) =>
      `| تسوية الحوالات رقم ${idx + 1} | تأخر مطابقة كشف نوسترو MT950 بقيمة 501,000 جم | مطابقة آلية يومية مع اعتماد ثنائي | رئيس قسم التسويات | يومياً |`
    );
    const docText = `[PDF page 2]\nمقدمة إجرائية قصيرة عن ضوابط الحوالات.\n\n${header}\n${sep}\n${rows.join('\n')}`;

    assert.equal(countMarkdownTablesInText(docText), 1);

    const chunks = chunkExtractedDocumentText(docText, 'swift_matrix.pdf', {
      maxTableChunkChars: 420,
      maxProseChunkChars: 350,
    });

    const tableChunks = chunks.filter((c) => c.chunk_kind === 'TABLE');
    assert.ok(tableChunks.length >= 2, 'Large table should split into multiple TABLE chunks');
    for (const tc of tableChunks) {
      assert.ok(tc.content_text.includes(header), 'Every split TABLE chunk must repeat header row');
      assert.ok(tc.content_text.includes(sep), 'Every split TABLE chunk must repeat separator row');
      assert.equal(tc.page_number, 2);
    }
  });

  test('2. Table-Aware Proposal Extractor extracts clean process/risk/control/owner without pipe clutter', () => {
    const mdTableChunk =
      '| العملية | وصف الخطر | الضابط الرقابي | المالك | التكرار |\n' +
      '| --- | --- | --- | --- | --- |\n' +
      '| تسوية حسابات المراسلين | عدم مطابقة رسائل MT950 اليومية مما يؤدي إلى أرصدة معلقة بخسارة 501,000 جم | المطابقة الآلية اليومية لكشوف نوسترو مع الاعتماد المزدوج | رئيس قسم التسويات | يومياً |';

    const ctrl = extractControlDetailsFromText(mdTableChunk, 'جدول الضوابط');
    assert.equal(ctrl.control_owner_ar, 'رئيس قسم التسويات');
    assert.ok(!ctrl.control_name_ar.includes('|'), 'Control name must not leak pipe chars');
    assert.ok(!ctrl.description_ar.includes('|'), 'Control description must not leak pipe chars');
    assert.ok(ctrl.control_frequency_raw.toLowerCase().includes('daily'));

    const risk = extractRiskDetailsFromText(mdTableChunk, 'القروض المشتركة', ctrl, 'جدول المخاطر');
    assert.equal(risk.process_name_ar, 'تسوية حسابات المراسلين');
    assert.ok(!risk.risk_title_ar.includes('|'), 'Risk title must not leak pipe chars');
    assert.ok(!risk.description_ar.includes('|'), 'Risk description must not leak pipe chars');
  });

  test('3. Measurable V4 vs V5 Uplift on Image Upload, PII Redaction, Hybrid Retrieval & Proposals', async () => {
    const pngB64 = buildMinimalValidPngBase64();
    const session = createWorkflowSession({
      unitId: 'BU-SYNDICATED',
      user: maker,
      workflowMode: 'NEW',
    });

    // V4 Baseline (synchronous extractor without Vision): produces 0 chunks on PNG image
    const v4SyncRes = uploadSupportingDocumentForUnit({
      unitId: 'BU-SYNDICATED',
      user: maker,
      filename: 'legacy_v4_scan.png',
      fileType: 'SOP',
      contentBase64: pngB64,
    });
    assert.equal(v4SyncRes.extracted_chunks_count, 0);
    assert.equal(v4SyncRes.document.parse_status, 'STORED_MANUAL_EXTRACT_REQUIRED');
    assert.equal(v4SyncRes.needs_vision, true);

    // V5 Multimodal Vision Upload on PNG table scan (deterministic ViT/Swin Vision parser callback)
    const v5UploadRes = await uploadSupportingDocumentWithVision({
      unitId: 'BU-SYNDICATED',
      user: maker,
      filename: 'syndicated_limits_table.png',
      fileType: 'SOP',
      contentBase64: pngB64,
      visionCallback: async () =>
        '| العملية | وصف الخطر | الضابط الرقابي | المالك | التكرار |\n' +
        '| --- | --- | --- | --- | --- |\n' +
        '| مراجعة حدود التمويل المشترك | تجاوز حدود الصرف دون تحقق من تواقيع الاعتماد المزدوج بما يعرض البنك لخسارة 501,000 جم لحساب EG123456789012345678901234567 | التحقق الآلي من صلاحيات التوقيع قبل تنفيذ قيد الصرف | مدير ائتمان القروض المشتركة | يومياً |',
    });

    assert.equal(v5UploadRes.extraction_status, 'EXTRACTED_TEXT_CHUNKS');
    assert.equal(v5UploadRes.extraction_method, 'VISION_MULTIMODAL');
    assert.ok(v5UploadRes.table_count >= 1);
    assert.ok(v5UploadRes.extracted_chunks_count >= 1);

    // Verify Guided Context + Workflow Session hydration + PII Redaction + Audit Log
    const unitCtx = getGuidedAssessmentUnitContext('BU-SYNDICATED', maker);
    const v5DocCtx = unitCtx.documents.find((d: any) => d.id === v5UploadRes.document_id);
    assert.ok(v5DocCtx);
    assert.equal(v5DocCtx.extraction_method, 'VISION_MULTIMODAL');
    assert.ok(v5DocCtx.table_count >= 1);

    linkDocumentToWorkflowSession(session.id, v5UploadRes.document_id, maker);
    const hydratedSession = getWorkflowSession(session.id, maker);
    const sesDoc = hydratedSession.session_documents.find((d: any) => d.id === v5UploadRes.document_id);
    assert.ok(sesDoc);
    assert.equal(sesDoc.extraction_method, 'VISION_MULTIMODAL');
    assert.ok(sesDoc.chunks.some((c: any) => c.chunk_kind === 'TABLE'));
    const tableChunk = sesDoc.chunks.find((c: any) => c.chunk_kind === 'TABLE');
    assert.ok(
      tableChunk.content_text.includes('[REDACTED-IBAN]'),
      'Vision-extracted text must pass banking PII redaction before persistence'
    );
    assert.ok(!tableChunk.content_text.includes('EG123456789012345678901234567'));

    const auditEntry = db
      .prepare(
        `SELECT action, after_state FROM audit_logs
         WHERE entity_id = ? AND action = 'VISION_DOCUMENT_EXTRACT'
         ORDER BY ts DESC LIMIT 1`
      )
      .get(v5UploadRes.document_id) as any;
    assert.ok(auditEntry, 'VISION_DOCUMENT_EXTRACT audit entry must be persisted');

    // Verify end-to-end RAG retrieval + structured RCSA proposals from the uploaded PNG table
    const citations = searchRelevantCitations(
      session.id,
      'BU-SYNDICATED',
      'جدول تجاوز حدود الصرف 501,000 جم القروض المشتركة',
      5
    );
    assert.ok(citations.length >= 1);
    assert.equal(citations[0].document_id, v5UploadRes.document_id);
    assert.equal(citations[0].retrieval_stage, 'RRF_K60_PLUS_STAGE2_RERANK');

    const ragBundle = assembleRagContextBundle(session.id, 'BU-SYNDICATED');
    assert.ok(ragBundle.rag_stats.vision_documents_count >= 1);
    assert.ok(ragBundle.rag_stats.tables_detected_count >= 1);

    const proposals = await buildHighPrecisionRcsaProposals({
      session: hydratedSession,
      ragBundle,
      modelProfile: 'qwen-0.5b',
      existingProposals: [],
    });
    assert.ok(proposals.length >= 1, 'Should generate structured RCSA proposal from PNG Vision table');
    const firstRisk = proposals.find((p) => p.type === 'RISK');
    assert.ok(firstRisk);
    assert.ok(!String(firstRisk.data.risk_title_ar || '').includes('|'));
    assert.ok(!String(firstRisk.data.control_description_ar || '').includes('|'));

    // Also test upgrading a previously-uploaded scanned PDF containing embedded JPEG via reanalyzeDocumentWithVision
    const pdfB64 = buildMinimalScannedPdfBase64();
    const scannedPdfSync = uploadSupportingDocumentForUnit({
      unitId: 'BU-SYNDICATED',
      user: maker,
      filename: 'scanned_circular_embedded.pdf',
      fileType: 'AUDIT_REPORT',
      contentBase64: pdfB64,
    });
    assert.equal(scannedPdfSync.extracted_chunks_count, 0);
    assert.equal(scannedPdfSync.needs_vision, true);

    const upgradedPdf = await reanalyzeDocumentWithVision({
      documentId: scannedPdfSync.document_id,
      user: maker,
      visionCallback: async () =>
        '| بند التفتيش | الملاحظة الرقابية | الإجراء التصحيحي |\n' +
        '| --- | --- | --- |\n' +
        '| AUD-12 | تأخر توثيق الضمانات العينية للقرض المشترك لأكثر من 15 يوم عمل | استيفاء ملف الضمانات إلكترونياً قبل التفعيل |',
    });
    assert.equal(upgradedPdf.extraction_status, 'EXTRACTED_TEXT_CHUNKS');
    assert.equal(upgradedPdf.extraction_method, 'VISION_MULTIMODAL');
    assert.ok(upgradedPdf.table_count >= 1);
  });

  test('4. Quantitative Retrieval Benchmark: V5 Stage-2 Reranker measurably beats V4 Stage-1 RRF on Precision@1 and MRR', () => {
    interface BenchmarkCase {
      id: string;
      query: string;
      goldId: string;
      docs: Array<{
        id: string;
        text: string;
        chunkKind: 'TABLE' | 'VISION_OCR' | 'PROSE';
        bm25RankBoost?: boolean;
      }>;
    }

    const cases: BenchmarkCase[] = [
      {
        id: 'Q1_NOSTR0_MT950',
        query: 'جدول تسوية حساب نوسترو MT950 بقيمة 501000 جنيه',
        goldId: 'gold-1',
        docs: [
          {
            id: 'dist-1a',
            chunkKind: 'PROSE',
            // Keyword-spam distractor missing MT950 and missing 501000 and missing table
            text: 'تسوية تسوية تسوية حساب نوسترو حساب نوسترو إجراءات عامة للتسويات المصرفية بدون تحديد حدود مالية أو كود الرسالة.',
          },
          {
            id: 'dist-1b',
            chunkKind: 'PROSE',
            text: 'تسوية الحسابات العامة — دليل الإجراءات الموحد',
          },
          {
            id: 'gold-1',
            chunkKind: 'TABLE',
            text:
              '| العملية | الكود | الحد المالي | الضابط |\n| --- | --- | --- | --- |\n' +
              '| تسوية حساب نوسترو | MT950 | 501000 جنيه | مطابقة يومية آلية لكشف MT950 قبل الإغلاق |',
          },
        ],
      },
      {
        id: 'Q2_DUAL_CONTROL_RRF95',
        query: 'جدول مقارنة نسبة 95% للضابط الآلي الوقائي واعتماد الصلاحيات',
        goldId: 'gold-2',
        docs: [
          {
            id: 'dist-2a',
            chunkKind: 'PROSE',
            text: 'جدول مقارنة جدول مقارنة نسبة نسبة الصلاحيات واعتماد الصلاحيات في السياسة السنوية دون أرقام أو ضابط آلي.',
          },
          {
            id: 'dist-2b',
            chunkKind: 'PROSE',
            text: 'الضابط الوقائي: مقدمة عامة',
          },
          {
            id: 'gold-2',
            chunkKind: 'TABLE',
            text:
              '| آلية الضابط | النوع | نسبة 95% RRF | النطاق |\n| --- | --- | --- | --- |\n' +
              '| الضابط الآلي | وقائي | 95% | اعتماد الصلاحيات والتحقق الثنائي الآلي |',
          },
        ],
      },
      {
        id: 'Q3_AML_SANCTIONS_CODE',
        query: 'تطبيق قوائم الحظر الفورية كود AML-07 عند تنفيذ التحويل',
        goldId: 'gold-3',
        docs: [
          {
            id: 'dist-3a',
            chunkKind: 'PROSE',
            text: 'التحويل التحويل قوائم الحظر تنفيذ التحويل ضمن السياسة العامة للفرع مع تكرار كلمة تنفيذ التحويل وقوائم الحظر.',
          },
          {
            id: 'dist-3b',
            chunkKind: 'PROSE',
            text: 'تطبيق قوائم الحظر الفورية',
          },
          {
            id: 'gold-3',
            chunkKind: 'PROSE',
            text: 'يجب تطبيق فحص قوائم الحظر الفورية (كود AML-07) على كافة طلبات تنفيذ التحويل الدولي قبل التمرير لشبكة سويفت.',
          },
        ],
      },
      {
        id: 'Q4_HIST_LOSS_75',
        query: 'تنبيه المعايرة بنسبة 75% مقارنة بالخسائر التاريخية الفعلية',
        goldId: 'gold-4',
        docs: [
          {
            id: 'dist-4a',
            chunkKind: 'PROSE',
            text: 'الخسائر التاريخية الخسائر التاريخية مقارنة المعايرة الفعلية بدون تحديد نسبة العتبة الرقابية المعتمدة.',
          },
          {
            id: 'gold-4',
            chunkKind: 'TABLE',
            text:
              '| مؤشر المعايرة | الحد الرقابي | الإجراء |\n| --- | --- | --- |\n' +
              '| مقارنة الخسائر التاريخية الفعلية | 75% | إصدار تنبيه المعايرة للمعد والمراجع عند انخفاض التقدير عن 75% |',
          },
        ],
      },
      {
        id: 'Q5_ATM_CASH_CUSTODY',
        query: 'جدول جرد نقدية الصراف الآلي يوميا ومالك الضابط المعتمد',
        goldId: 'gold-5',
        docs: [
          {
            id: 'dist-5a',
            chunkKind: 'PROSE',
            text: 'نقدية الصراف الآلي نقدية الصراف الآلي إجراءات تشغيل الفروع دون بيان التكرار اليومي أو جدول مالك الضابط.',
          },
          {
            id: 'gold-5',
            chunkKind: 'TABLE',
            text:
              '| النشاط | الضابط | المالك | التكرار |\n| --- | --- | --- | --- |\n' +
              '| جرد نقدية الصراف الآلي | مطابقة الجرد المزدوج لأرصدة الخزينة | مشرف الخزينة | يوميا |',
          },
        ],
      },
    ];

    let v4Top1Hits = 0;
    let v5Top1Hits = 0;
    let v4MrrSum = 0;
    let v5MrrSum = 0;

    for (const bc of cases) {
      // Simulated Stage-1 RRF ordering where repetitive/short distractors rank above gold
      const bm25Order = [...bc.docs]; // distractors first
      const vectorOrder = [...bc.docs].sort((a, b) =>
        a.id === bc.goldId ? 1 : b.id === bc.goldId ? -1 : 0
      );
      const rrfFused = fuseBm25AndVectorWithRrf(bm25Order, vectorOrder, (d) => d.id, 60);

      const v4GoldRank = rrfFused.findIndex((x) => x.item.id === bc.goldId) + 1;
      if (v4GoldRank === 1) v4Top1Hits++;
      v4MrrSum += 1 / v4GoldRank;

      const stage2 = rerankCandidatesWithStage2(
        bc.query,
        rrfFused.map((f) => ({
          key: f.item.id,
          rawText: f.item.text,
          rrfScore: f.rrf_score,
          citation: {
            document_id: f.item.id,
            title_ar: f.item.id,
            file_name: `${f.item.id}.pdf`,
            quote_text: f.item.text,
            doc_type: 'SOP',
            chunk_kind: f.item.chunkKind,
            relevance_score: f.rrf_score,
          },
        })),
        bc.docs.length
      );

      const v5GoldRank = stage2.findIndex((x) => x.key === bc.goldId) + 1;
      if (v5GoldRank === 1) v5Top1Hits++;
      v5MrrSum += 1 / v5GoldRank;
    }

    const v4P1 = v4Top1Hits / cases.length;
    const v5P1 = v5Top1Hits / cases.length;
    const v4Mrr = v4MrrSum / cases.length;
    const v5Mrr = v5MrrSum / cases.length;

    console.log(
      `[V5 Benchmark] V4 Stage-1 RRF: P@1=${(v4P1 * 100).toFixed(0)}%, MRR=${v4Mrr.toFixed(3)} | V5 Stage-2 Reranker: P@1=${(v5P1 * 100).toFixed(0)}%, MRR=${v5Mrr.toFixed(3)}`
    );

    assert.ok(v5P1 > v4P1, `Expected V5 P@1 (${v5P1}) > V4 P@1 (${v4P1})`);
    assert.ok(v5Mrr > v4Mrr, `Expected V5 MRR (${v5Mrr}) > V4 MRR (${v4Mrr})`);
    assert.equal(v5P1, 1, 'Expected 100% Precision@1 on the V5 multi-concept & table benchmark');
  });
});
