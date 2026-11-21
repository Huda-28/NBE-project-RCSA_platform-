import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

process.env.NODE_ENV = 'test';
if (!process.env.RCSA_DB_PATH) {
  process.env.RCSA_DB_PATH = path.resolve('data', 'rcsa_test_2d1.db');
}

import { db, initDatabase, DB_PATH } from '../src/server/db.js';
import { getUserWithRoles } from '../src/server/auth.js';
import {
  formatArabicDateTime,
  cleanAssessmentTitleAr,
  getAssessmentTimestampDetails,
  formatAuditActionAr,
} from '../src/utils/dateFormat.js';
import {
  getUnitAssessmentsHistory,
  compareUnitAssessmentVersions,
  getGuidedAssessmentUnitContext,
  uploadSupportingDocumentForUnit,
  previewGuidedAssessmentCalculation,
  createGuidedAssessmentDraft,
  countMandatoryRemediationActionsForAssessment,
  updateSingleRiskAndRecalculate,
  ensureAssessmentPackagesPopulated,
} from '../src/server/hitl-service.js';

describe('Phase 2D.1 — Date Formatting, Historical Registry, Version Comparison & Guided RCSA', () => {
  before(() => {
    initDatabase();
  });

  after(() => {
    try {
      db.close();
      if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
      if (fs.existsSync(`${DB_PATH}-wal`)) fs.unlinkSync(`${DB_PATH}-wal`);
      if (fs.existsSync(`${DB_PATH}-shm`)) fs.unlinkSync(`${DB_PATH}-shm`);
    } catch {}
  });
  it('1. Formats timestamps into clear Arabic date and time and strips V1/V2 labels from titles', () => {
    const formatted = formatArabicDateTime('2026-08-15 10:30:00');
    assert.ok(formatted.includes('15 أغسطس 2026'), `Expected Arabic date in "${formatted}"`);
    assert.ok(formatted.includes('10:30 صباحًا'), `Expected Arabic time in "${formatted}"`);

    const cleanedTitle = cleanAssessmentTitleAr('تقييم مخاطر القروض المشتركة - الإصدار المعتمد الأول (V1)');
    assert.ok(!cleanedTitle.includes('V1'), `Expected V1 stripped from "${cleanedTitle}"`);
    assert.ok(!cleanedTitle.includes('الإصدار المعتمد الأول'), `Expected version ordinal stripped from "${cleanedTitle}"`);
  });

  it('2. Distinguishes seeded assessment recorded approval/audit dates from DB initialization timestamps', () => {
    const v1Details = getAssessmentTimestampDetails({
      id: 'ASM-SYND-2026-V1',
      status: 'APPROVED',
      workflow_status: 'APPROVED',
      title_ar: 'تقييم مخاطر القروض المشتركة - الإصدار المعتمد الأول',
      created_at: '2026-11-03 12:00:00', // DB init timestamp
      updated_at: '2026-11-03 12:00:00',
      approved_at: '2026-08-15 10:30:00',
    });

    assert.equal(v1Details.is_seeded_record, true);
    assert.ok(v1Details.primary_date_badge_ar.includes('تاريخ الاعتماد: 15 أغسطس 2026'));
    assert.ok(!v1Details.primary_version_label_ar.includes('V1'));
    assert.ok(!v1Details.primary_version_label_ar.includes('v1'));
    assert.equal(v1Details.original_assessment_date_ar, 'غير مسجل بالمصدر');

    const v2Details = getAssessmentTimestampDetails({
      id: 'ASM-SYND-2026-V2-DRAFT',
      status: 'READY_DRAFT',
      workflow_status: 'DRAFT',
      title_ar: 'تقييم مخاطر القروض المشتركة - مسودة المراجعة الدورية V2',
      created_at: '2026-11-03 12:00:00',
      updated_at: '2026-11-03 12:00:00',
      approved_at: null,
    });

    assert.equal(v2Details.is_seeded_record, true);
    assert.ok(v2Details.created_at_ar.includes('1 أكتوبر 2026'));
    assert.ok(!v2Details.primary_version_label_ar.includes('V2'));
  });

  it('3. Retrieves complete Business Unit assessment history with accurate Arabic dates, counts, and audit summaries', () => {
    const adminUser = getUserWithRoles('EMP-9009')!;
    const history = getUnitAssessmentsHistory('BU-SYNDICATED', adminUser);

    assert.equal(history.unit.id, 'BU-SYNDICATED');
    assert.ok(history.assessments.length >= 2, 'BU-SYNDICATED must have at least 2 assessments (approved + draft)');

    for (const asm of history.assessments) {
      assert.ok(asm.timestamps.primary_date_badge_ar.length > 0);
      assert.ok(!asm.timestamps.primary_version_label_ar.includes('V1'));
      assert.ok(!asm.timestamps.primary_version_label_ar.includes('V2'));
      assert.equal(asm.counts.risks_count, 8);
      assert.ok(asm.counts.controls_count >= 8);
      assert.ok(asm.changes_summary_ar.length > 0);
    }
  });

  it('4. Enforces Business Unit horizontal authorization on assessment history and comparison', () => {
    const syndMaker = getUserWithRoles('EMP-1001')!; // Authorized for BU-SYNDICATED, BU-ACCOUNT, BU-POS; NOT BU-TRADING
    // Positive access to authorized BU-POS
    const posHistory = getUnitAssessmentsHistory('BU-POS', syndMaker);
    assert.ok(posHistory, 'EMP-1001 must have authorized access to BU-POS');

    // Strict horizontal rejection for unauthorized BU-TRADING
    assert.throws(
      () => getUnitAssessmentsHistory('BU-TRADING', syndMaker),
      /غير مصرح/
    );
    assert.throws(
      () => compareUnitAssessmentVersions('BU-TRADING', 'ASM-TRADING-2026-V1', 'ASM-TRADING-2026-V1', syndMaker),
      /غير مصرح/
    );
  });

  it('5. Counts mandatory corrective actions accurately while excluding optional future improvements', () => {
    ensureAssessmentPackagesPopulated('ASM-SYND-2026-V1');
    const mandatoryCount = countMandatoryRemediationActionsForAssessment('ASM-SYND-2026-V1');
    // In BU-SYNDICATED baseline: RSK-SYND-04 (proposed control), RSK-SYND-07 (high residual), RSK-SYND-08 (partial scope) = 3 mandatory actions
    assert.ok(mandatoryCount >= 3, `Expected at least 3 mandatory remediation actions, got ${mandatoryCount}`);
  });

  it('6. Compares two historical assessment versions of the same Business Unit and detects control/RRF/residual diffs', () => {
    const maker = getUserWithRoles('EMP-1001')!;
    ensureAssessmentPackagesPopulated('ASM-SYND-2026-V1');
    ensureAssessmentPackagesPopulated('ASM-SYND-2026-V2-DRAFT');

    // Reset draft status if needed so maker can edit RSK-SYND-07
    db.prepare(`UPDATE rcsa_assessments SET status = 'READY_DRAFT' WHERE id = 'ASM-SYND-2026-V2-DRAFT'`).run();
    db.prepare(`UPDATE hitl_assessment_meta SET workflow_status = 'DRAFT' WHERE assessment_id = 'ASM-SYND-2026-V2-DRAFT'`).run();

    // Exclude CTL-SYND-R24 on RSK-SYND-07 in V2-DRAFT
    updateSingleRiskAndRecalculate({
      assessmentId: 'ASM-SYND-2026-V2-DRAFT',
      riskId: 'RSK-SYND-07',
      user: maker,
      controlUpdates: [
        {
          control_id: 'CTL-SYND-R24',
          eligible_for_scope_override: false,
        },
      ],
      evidenceOrReason: 'استبعاد الضابط الجزئي لأغراض المقارنة التاريخية',
    });

    const comparison = compareUnitAssessmentVersions(
      'BU-SYNDICATED',
      'ASM-SYND-2026-V1',
      'ASM-SYND-2026-V2-DRAFT',
      maker
    );

    assert.equal(comparison.unit_id, 'BU-SYNDICATED');
    assert.ok(comparison.summary.modified_risks_count >= 1);

    const r07Diff = comparison.risk_comparisons.find((d: any) => d.risk_id === 'RSK-SYND-07');
    assert.ok(r07Diff, 'Expected RSK-SYND-07 in risk_comparisons');
    assert.equal(r07Diff.has_differences, true);
    assert.equal(r07Diff.max_rrf_diff.before_rrf, 0.9);
    assert.equal(r07Diff.max_rrf_diff.after_rrf, 0.75);
    assert.equal(r07Diff.residual_risk_diff.before_egp, 200400);
    assert.equal(r07Diff.residual_risk_diff.after_egp, 501000);

    // Restore CTL-SYND-R24 to null so subsequent test suites see clean baseline
    updateSingleRiskAndRecalculate({
      assessmentId: 'ASM-SYND-2026-V2-DRAFT',
      riskId: 'RSK-SYND-07',
      user: maker,
      controlUpdates: [
        {
          control_id: 'CTL-SYND-R24',
          eligible_for_scope_override: null,
        },
      ],
      evidenceOrReason: 'استعادة الضابط الجزئي بعد اختبار المقارنة',
    });
  });

  it('7. Supports Guided Assessment context, document upload (text & binary), Python preview calculation, and draft creation', () => {
    const admin = getUserWithRoles('EMP-9009')!;

    // Step 1-3: Load context for BU-POS
    const posCtx = getGuidedAssessmentUnitContext('BU-POS', admin);
    assert.equal(posCtx.unit.id, 'BU-POS');
    assert.equal(posCtx.candidate_risk_items.length, 1);

    // Step 2a: Upload TXT document -> extracts chunks
    const txtUpload = uploadSupportingDocumentForUnit({
      unitId: 'BU-POS',
      user: admin,
      fileType: 'SOP',
      filename: 'pos_sop_2026.txt',
      mimeType: 'text/plain',
      contentText: 'يتعين مطابقة حركات نقاط البيع يومياً مع تقارير شبكة الدفع الوطنية والتسوية البنكية.',
    });
    assert.equal(txtUpload.extraction_status, 'EXTRACTED_TEXT_CHUNKS');
    assert.ok(txtUpload.extracted_chunks_count >= 1);

    // Step 2b: Upload binary PDF document -> records honestly without faking extraction
    const pdfUpload = uploadSupportingDocumentForUnit({
      unitId: 'BU-POS',
      user: admin,
      fileType: 'AUDIT_REPORT',
      filename: 'pos_audit.pdf',
      mimeType: 'application/pdf',
      contentBase64: 'JVBERi0xLjQK',
    });
    assert.equal(pdfUpload.extraction_status, 'STORED_WITHOUT_BINARY_EXTRACTION');
    assert.equal(pdfUpload.extracted_chunks_count, 0);

    // Step 4-5: Complete missing inputs on BU-POS candidate risks and preview Python calculation
    const completedRiskInputs = posCtx.candidate_risk_items.map((r: any) => ({
      risk_id: r.risk_id,
      current_draft_input: {
        ...r.current_draft_input,
        individual_financial_impact: 120000,
        expected_frequency_text: 'مرتين في العام',
        controls: (r.current_draft_input.controls || []).map((c: any) => ({
          ...c,
          control_type_raw: c.control_type_raw || 'ضابط كاشف',
          control_method_raw: c.control_method_raw || 'نصف آلي',
          effectiveness_raw: c.effectiveness_raw || 'ضوابط فعالة (P1-5)',
        })),
      },
    }));

    const preview = previewGuidedAssessmentCalculation({
      unitId: 'BU-POS',
      user: admin,
      riskInputs: completedRiskInputs,
    });
    assert.equal(preview.risk_items.length, 1);
    assert.equal(preview.risk_items[0].calculated_output.expected_annual_loss_egp, 240000);

    // Step 6: Create guided draft in SQLite for BU-BRANCHES (which starts empty)
    const branchesDraft = createGuidedAssessmentDraft({
      unitId: 'BU-BRANCHES',
      user: admin,
      title: 'تقييم مخاطر شبكة الفروع الموجه',
      riskInputs: [
        {
          risk_id: 'RSK-BRN-01',
          current_draft_input: {
            process_name: 'عمليات الخزينة الفرعية والشباك',
            strategic_objective: 'ضمان سلامة العمليات النقدية',
            risk_description: 'مخاطر العجز أو الزيادة النقدية بشبابيك الصرافين نتيجة قصور الجرد الثنائي.',
            individual_financial_impact: 100000,
            financial_value_origin: 'HUMAN_ENTERED',
            financial_evidence_justification: 'تقدير تشغيلي لخزينة الفرع',
            expected_frequency_text: 'مرتين في العام',
            frequency_origin: 'HUMAN_ENTERED',
            frequency_justification: 'دورية الجرد والمراجعة',
            controls: [
              {
                control_id: 'CTL-BRN-01',
                control_description: 'جرد ثنائي يومي ومطابقة آلية لرصيد الخزينة بنهاية اليوم.',
                control_owner: 'مدير الخزينة بالفرع',
                control_type_raw: 'ضابط وقائي',
                control_method_raw: 'نصف آلي',
                control_frequency_raw: 'يومياً',
                effectiveness_raw: 'ضوابط فعالة (P1-5)',
                implementation_status: 'IMPLEMENTED',
                eligible_for_scope_override: true,
              },
            ],
          },
        },
      ],
    });

    assert.equal(branchesDraft.assessment.unit_id, 'BU-BRANCHES');
    assert.equal(branchesDraft.risks.length, 1);
    assert.equal(branchesDraft.risks[0].calculated_output.expected_annual_loss_egp, 200000);
    assert.equal(branchesDraft.risks[0].calculated_output.effective_max_rrf, 0.9);
    assert.equal(branchesDraft.risks[0].calculated_output.residual_financial_amount_egp, 20000);

    // Clean up test-created BU-BRANCHES draft and uploaded docs so seeded state remains clean
    const createdId = branchesDraft.assessment.id;
    db.prepare('DELETE FROM hitl_risk_packages WHERE assessment_id = ?').run(createdId);
    db.prepare('DELETE FROM hitl_assessment_meta WHERE assessment_id = ?').run(createdId);
    db.prepare('DELETE FROM risk_controls WHERE risk_id IN (SELECT id FROM risks WHERE assessment_id = ?)').run(createdId);
    db.prepare('DELETE FROM risks WHERE assessment_id = ?').run(createdId);
    db.prepare('DELETE FROM rcsa_assessments WHERE id = ?').run(createdId);
    db.prepare('DELETE FROM document_chunks WHERE document_id IN (?, ?)').run(txtUpload.document_id, pdfUpload.document_id);
    db.prepare('DELETE FROM documents WHERE id IN (?, ?)').run(txtUpload.document_id, pdfUpload.document_id);
  });

  it('8. Formats audit trail actions into clear Arabic labels alongside technical codes', () => {
    const recalcMeta = formatAuditActionAr('UPDATE_AND_RECALCULATE_RISK');
    assert.ok(recalcMeta.label_ar.includes('إعادة احتساب'));
    const uploadMeta = formatAuditActionAr('UPLOAD_DOCUMENT');
    assert.ok(uploadMeta.label_ar.includes('رفع وإرفاق مستند'));
  });
});
