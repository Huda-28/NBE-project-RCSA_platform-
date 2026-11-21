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
import { getUserWithRoles, canApproveAssessment } from '../src/server/auth.js';
import {
  getAssessmentHitlFullState,
  updateSingleRiskAndRecalculate,
  applySuggestionDecision,
  markRiskReviewed,
  saveAssessmentDraft,
  submitAssessmentForCheckerReview,
  checkerApproveAssessment,
  checkerReturnAssessment,
  createNewDraftFromApproved,
  createManualDraftForUnit,
} from '../src/server/hitl-service.js';

describe('Phase 2D — Complete Human-in-the-Loop RCSA Review & Edit Workflow E2E', () => {
  const DRAFT_ID = 'ASM-SYND-2026-V2-DRAFT';

  before(() => {
    initDatabase();
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

  test('1. Maker Login & Open Syndicated Loans Draft (8 Risks, 20 Controls, Pre-Export Readiness & NOT_IMPLEMENTED Phase 2C Markers)', () => {
    const maker = getUserWithRoles('EMP-1001');
    assert.ok(maker, 'Maker EMP-1001 must exist');
    assert.equal(
      maker.roles.some((r) => r.unit_id === 'BU-SYNDICATED' && r.role === 'MAKER'),
      true,
      'EMP-1001 must have MAKER role for BU-SYNDICATED'
    );

    const state = getAssessmentHitlFullState(DRAFT_ID);
    assert.equal(state.assessment.id, DRAFT_ID);
    assert.equal(state.assessment.unit_id, 'BU-SYNDICATED');
    assert.equal(state.assessment.workflow_status, 'DRAFT');
    assert.equal(state.risks.length, 8, 'Syndicated Loans draft must contain all 8 canonical risks (RSK-SYND-01..08)');

    const totalControls = state.risks.reduce(
      (acc: number, r: any) => acc + (r.current_draft_input?.controls?.length || 0),
      0
    );
    assert.equal(totalControls, 20, 'Syndicated Loans draft must contain all 20 canonical controls (Rows 8..27)');

    // Verify Pre-Export Readiness Summary & Deferred Phase 2C Explicit Status
    assert.equal(state.readiness.total_risks, 8);
    assert.equal(state.readiness.deferred_phase2c_capabilities.nfi_4_dimensions, 'NOT_IMPLEMENTED');
    assert.equal(state.readiness.deferred_phase2c_capabilities.esg_catalogue_mapping, 'NOT_IMPLEMENTED');
    assert.equal(state.readiness.deferred_phase2c_capabilities.final_overall_risk_acceptance, 'NOT_IMPLEMENTED');
    assert.equal(state.readiness.deferred_phase2c_capabilities.official_xlsx_file_export, 'NOT_IMPLEMENTED');
    assert.equal(state.readiness.official_column_preview_rows.length, 8);
  });

  test('2. Inspect Risk #6 (RSK-SYND-06): Displays Both Workbook RRF (0.90 / 50,100 EGP) and Calculated RRF (0.80 / 100,200 EGP)', () => {
    const state = getAssessmentHitlFullState(DRAFT_ID);
    const risk6 = state.risks.find((r: any) => r.risk_id === 'RSK-SYND-06');
    assert.ok(risk6, 'RSK-SYND-06 must exist');

    // Original workbook reference values
    assert.equal(risk6.calculated_output.workbook_reference_rrf, 0.90);
    assert.equal(risk6.calculated_output.workbook_reference_t_residual_egp, 50100);
    assert.equal(risk6.original_source.residual_loss_cell_t, '50100');

    // Authoritative calculated values from actual controls (CTL-SYND-R22 Semi-Automated/Detective = 0.80, CTL-SYND-R21 Manual/Preventive = 0.75)
    assert.equal(risk6.calculated_output.effective_max_rrf, 0.80);
    assert.equal(risk6.calculated_output.selected_max_rrf_control_id, 'CTL-SYND-R22');
    assert.equal(risk6.calculated_output.residual_financial_amount_egp, 100200);
    assert.equal(risk6.calculated_output.continuous_residual_rating, 'L');
    assert.equal(
      risk6.source_discrepancies.some((d: any) => d.category === 'WORKBOOK_MANUAL_RRF_VS_CALCULATED_RRF'),
      true,
      'Risk #6 must surface WORKBOOK_MANUAL_RRF_VS_CALCULATED_RRF discrepancy'
    );
  });

  test('3. Edit Permitted Input on Risk #6, Trigger Real Python Recalculation, Verify Outputs, Rationale & Persistence', () => {
    const maker = getUserWithRoles('EMP-1001')!;
    const beforeState = getAssessmentHitlFullState(DRAFT_ID);
    const prevRevision: number = beforeState.assessment.revision;

    // Update individual loss on Risk #6 from 501,000 EGP to 1,000,000 EGP (with frequency = 1x/year -> Annual Expected Loss = 1,000,000 EGP [H])
    const afterState = updateSingleRiskAndRecalculate({
      assessmentId: DRAFT_ID,
      riskId: 'RSK-SYND-06',
      user: maker,
      expectedRevision: prevRevision,
      riskUpdates: {
        individual_financial_impact: 1000000,
        financial_value_origin: 'EXPLICIT_HUMAN_ESTIMATE',
      },
    });

    assert.equal(afterState.assessment.revision, prevRevision + 1);
    const updatedRisk6 = afterState.risks.find((r: any) => r.risk_id === 'RSK-SYND-06');
    assert.ok(updatedRisk6);

    assert.equal(updatedRisk6.calculated_output.individual_financial_impact_egp, 1000000);
    assert.equal(updatedRisk6.calculated_output.expected_annual_loss_egp, 1000000);
    assert.equal(updatedRisk6.calculated_output.annualized_financial_rating, 'H');

    // With MAX RRF = 0.80, residual loss = 1,000,000 * (1 - 0.80) = 200,000 EGP [M]
    assert.equal(updatedRisk6.calculated_output.effective_max_rrf, 0.80);
    assert.equal(updatedRisk6.calculated_output.residual_financial_amount_egp, 200000);
    assert.equal(updatedRisk6.calculated_output.continuous_residual_rating, 'M');

    // Verify before-and-after diff snapshot was captured in previous_calculated_output
    assert.ok(updatedRisk6.previous_calculated_output, 'Previous calculated output snapshot must exist');
    assert.equal(updatedRisk6.previous_calculated_output.expected_annual_loss_egp, 501000);
    assert.equal(updatedRisk6.previous_calculated_output.residual_financial_amount_egp, 100200);

    // Verify Arabic rationale updated to reflect new calculation (1,000,000 and 200,000)
    assert.match(updatedRisk6.current_draft_input.active_rationale_ar, /1,000,000/);
    assert.match(updatedRisk6.current_draft_input.active_rationale_ar, /200,000/);
    assert.equal(updatedRisk6.provenance_map.individual_financial_impact, 'CURRENT_DRAFT_VALUE');

    // Reload from SQLite and verify persistence
    const reloadedState = getAssessmentHitlFullState(DRAFT_ID);
    const reloadedRisk6 = reloadedState.risks.find((r: any) => r.risk_id === 'RSK-SYND-06');
    assert.equal(reloadedRisk6.calculated_output.individual_financial_impact_egp, 1000000);
    assert.equal(reloadedRisk6.calculated_output.expected_annual_loss_egp, 1000000);
    assert.equal(reloadedRisk6.calculated_output.residual_financial_amount_egp, 200000);
    assert.equal(reloadedRisk6.calculated_output.continuous_residual_rating, 'M');
  });

  test('4. Inspect Risk #7 (RSK-SYND-07), Exclude Partial-Scope Control CTL-SYND-R24, Recalculate (0.90 / 200,400 [M] -> 0.75 / 501,000 [H]) & Verify Unrelated Risks Unchanged', () => {
    const maker = getUserWithRoles('EMP-1001')!;
    const beforeState = getAssessmentHitlFullState(DRAFT_ID);
    const risk7Before = beforeState.risks.find((r: any) => r.risk_id === 'RSK-SYND-07');
    assert.ok(risk7Before);

    // Snapshot unrelated risks before recalculating Risk #7
    const unrelatedIds = ['RSK-SYND-01', 'RSK-SYND-03', 'RSK-SYND-04', 'RSK-SYND-05', 'RSK-SYND-08'];
    interface UnrelatedSnapshot {
      annualLoss: number | null;
      maxRrf: number | null;
      residualLoss: number | null;
      rationale: string;
    }
    const unrelatedBefore = new Map<string, UnrelatedSnapshot>(
      beforeState.risks
        .filter((r: any) => unrelatedIds.includes(r.risk_id))
        .map((r: any): [string, UnrelatedSnapshot] => [
          r.risk_id as string,
          {
            annualLoss: r.calculated_output.expected_annual_loss_egp,
            maxRrf: r.calculated_output.effective_max_rrf,
            residualLoss: r.calculated_output.residual_financial_amount_egp,
            rationale: r.current_draft_input.active_rationale_ar,
          },
        ])
    );

    // Inspect Risk #7 initial partial-scope control warning on CTL-SYND-R24
    const ctl24Before = risk7Before.calculated_output.controls_calculated.find(
      (c: any) => c.control_id === 'CTL-SYND-R24'
    );
    assert.ok(ctl24Before);
    assert.equal(ctl24Before.scope_requires_human_review, true);
    assert.equal(risk7Before.calculated_output.effective_max_rrf, 0.90);
    assert.equal(risk7Before.calculated_output.residual_financial_amount_egp, 200400);
    assert.equal(risk7Before.calculated_output.continuous_residual_rating, 'M');

    // Exclude CTL-SYND-R24 from scope eligibility and recalculate Risk #7
    const afterState = updateSingleRiskAndRecalculate({
      assessmentId: DRAFT_ID,
      riskId: 'RSK-SYND-07',
      user: maker,
      expectedRevision: beforeState.assessment.revision,
      controlUpdates: [
        {
          control_id: 'CTL-SYND-R24',
          eligible_for_scope_override: false,
        },
      ],
    });

    const updatedRisk7 = afterState.risks.find((r: any) => r.risk_id === 'RSK-SYND-07');
    assert.ok(updatedRisk7);

    // Verify Risk #7 updates from MAX RRF = 0.90 (200,400 EGP [M]) to MAX RRF = 0.75 (501,000 EGP [H])
    assert.equal(updatedRisk7.calculated_output.effective_max_rrf, 0.75);
    assert.equal(updatedRisk7.calculated_output.selected_max_rrf_control_id, 'CTL-SYND-R23');
    assert.equal(updatedRisk7.calculated_output.residual_financial_amount_egp, 501000);
    assert.equal(updatedRisk7.calculated_output.continuous_residual_rating, 'H');
    assert.ok(updatedRisk7.previous_calculated_output);
    assert.equal(updatedRisk7.previous_calculated_output.effective_max_rrf, 0.90);
    assert.equal(updatedRisk7.previous_calculated_output.residual_financial_amount_egp, 200400);

    // Verify unrelated risks remain 100% unchanged
    for (const riskId of unrelatedIds) {
      const afterRisk = afterState.risks.find((r: any) => r.risk_id === riskId);
      const snap = unrelatedBefore.get(riskId)!;
      assert.equal(
        afterRisk.calculated_output.expected_annual_loss_egp,
        snap.annualLoss,
        `Unrelated risk ${riskId} annual loss must not change`
      );
      assert.equal(
        afterRisk.calculated_output.effective_max_rrf,
        snap.maxRrf,
        `Unrelated risk ${riskId} MAX RRF must not change`
      );
      assert.equal(
        afterRisk.calculated_output.residual_financial_amount_egp,
        snap.residualLoss,
        `Unrelated risk ${riskId} residual loss must not change`
      );
      assert.equal(
        afterRisk.current_draft_input.active_rationale_ar,
        snap.rationale,
        `Unrelated risk ${riskId} rationale must not change`
      );
    }
  });

  test('5. Optimistic Concurrency Check Rejects Stale Revision', () => {
    const maker = getUserWithRoles('EMP-1001')!;
    assert.throws(
      () =>
        updateSingleRiskAndRecalculate({
          assessmentId: DRAFT_ID,
          riskId: 'RSK-SYND-06',
          user: maker,
          expectedRevision: 1, // Stale revision (currently 3)
          riskUpdates: { individual_financial_impact: 300000 },
        }),
      /تعارض التزامن/
    );
  });

  test('6. AI Suggestion Review Workflow (Accept, Modify, Reject) & Provenance Tracking', () => {
    const maker = getUserWithRoles('EMP-1001')!;

    // 6a. Accept AI rationale suggestion on RSK-SYND-04
    const afterR4 = applySuggestionDecision({
      assessmentId: DRAFT_ID,
      riskId: 'RSK-SYND-04',
      user: maker,
      targetField: 'rationale',
      decision: 'ACCEPT',
    });
    const r4Accepted = afterR4.risks.find((r: any) => r.risk_id === 'RSK-SYND-04');
    assert.equal(r4Accepted.suggestion_decisions.rationale.status, 'ACCEPTED_BY_MAKER');
    assert.equal(
      r4Accepted.current_draft_input.active_rationale_ar,
      r4Accepted.package.rationale_proposal.proposed_rationale_ar
    );
    assert.equal(r4Accepted.provenance_map.active_rationale_ar, 'REVIEWER_APPROVED_VALUE');

    // 6b. Modify corrective action suggestion on RSK-SYND-07
    const customAction = 'إجراء تصحيحي إلزامي معتمد من المراجع: تفعيل التحقق الآلي المزدوج قبل الصرف.';
    const afterR7 = applySuggestionDecision({
      assessmentId: DRAFT_ID,
      riskId: 'RSK-SYND-07',
      user: maker,
      targetField: 'corrective_action',
      decision: 'MODIFY',
      modifiedText: customAction,
    });
    const r7Modified = afterR7.risks.find((r: any) => r.risk_id === 'RSK-SYND-07');
    assert.equal(r7Modified.suggestion_decisions.corrective_action.status, 'MODIFIED_BY_MAKER');
    assert.equal(r7Modified.current_draft_input.active_corrective_action_ar, customAction);
    assert.equal(r7Modified.provenance_map.active_corrective_action_ar, 'REVIEWER_APPROVED_VALUE');

    // 6c. Reject risk description suggestion on RSK-SYND-01 -> preserves original source description
    const afterR1 = applySuggestionDecision({
      assessmentId: DRAFT_ID,
      riskId: 'RSK-SYND-01',
      user: maker,
      targetField: 'risk_description',
      decision: 'REJECT',
    });
    const r1Rejected = afterR1.risks.find((r: any) => r.risk_id === 'RSK-SYND-01');
    assert.equal(r1Rejected.suggestion_decisions.risk_description.status, 'REJECTED_KEEP_ORIGINAL');
    assert.equal(
      r1Rejected.current_draft_input.risk_description,
      r1Rejected.original_source.risk_description_cell_g
    );
    assert.equal(r1Rejected.provenance_map.risk_description, 'ORIGINAL_SOURCE_VALUE');
  });

  test('7. Save Draft, Submit for Checker Review, Verify Self-Approval Prohibition & Completeness Blocker on Missing P15 (RSK-SYND-02)', () => {
    const maker = getUserWithRoles('EMP-1001')!;
    const checker = getUserWithRoles('EMP-2002')!;

    // Save draft
    const saveState = saveAssessmentDraft(DRAFT_ID, maker);
    assert.equal(saveState.assessment.workflow_status, 'DRAFT');
    assert.equal(saveState.assessment.last_saved_by, 'EMP-1001');

    // Submit for review
    const submitState = submitAssessmentForCheckerReview(DRAFT_ID, maker);
    assert.equal(submitState.assessment.workflow_status, 'IN_REVIEW');
    assert.equal(submitState.assessment.status, 'SUBMITTED');

    // Maker attempts self-approval -> rejected by Maker-Checker separation
    const selfApproveCheck = canApproveAssessment(maker, DRAFT_ID);
    assert.equal(selfApproveCheck.allowed, false);
    assert.match(selfApproveCheck.reason || '', /Maker-Checker/);

    // Checker attempts approval while RSK-SYND-02 (CTL-SYND-R15 / P15) is still PENDING_REVIEW -> blocked by completeness validation
    assert.throws(
      () => checkerApproveAssessment(DRAFT_ID, checker),
      /لا يمكن الاعتماد النهائي للتقييم قبل استيفاء المتطلبات الإلزامية/
    );
  });

  test('8. Checker Returns Assessment for Changes -> Maker Completes P15 (CTL-SYND-R15) -> Resubmits -> Checker Approves & Seals Immutable Version Snapshot', () => {
    const maker = getUserWithRoles('EMP-1001')!;
    const checker = getUserWithRoles('EMP-2002')!;

    // Checker returns assessment to Maker with mandatory reason
    const returnState = checkerReturnAssessment(
      DRAFT_ID,
      checker,
      'يرجى استكمال تقييم فعالية الضابط الرقابي في الخلية P15 (CTL-SYND-R15) للخطر الثاني قبل الاعتماد النهائي.'
    );
    assert.equal(returnState.assessment.workflow_status, 'RETURNED_FOR_CHANGES');
    assert.equal(returnState.assessment.status, 'REJECTED');

    // Maker completes missing P15 effectiveness on RSK-SYND-02 (CTL-SYND-R15) and recalculates
    const risk2Before = returnState.risks.find((r: any) => r.risk_id === 'RSK-SYND-02');
    const ctl15Before = risk2Before.calculated_output.controls_calculated.find(
      (c: any) => c.control_id === 'CTL-SYND-R15'
    );
    assert.equal(ctl15Before.effectiveness_classification, 'PENDING_REVIEW');

    const afterP15State = updateSingleRiskAndRecalculate({
      assessmentId: DRAFT_ID,
      riskId: 'RSK-SYND-02',
      user: maker,
      expectedRevision: returnState.assessment.revision,
      controlUpdates: [
        {
          control_id: 'CTL-SYND-R15',
          effectiveness_raw: 'ضابط رقابي فعال',
        },
      ],
    });
    const updatedRisk2 = afterP15State.risks.find((r: any) => r.risk_id === 'RSK-SYND-02');
    const ctl15After = updatedRisk2.calculated_output.controls_calculated.find(
      (c: any) => c.control_id === 'CTL-SYND-R15'
    );
    assert.equal(ctl15After.effectiveness_classification, 'ضابط رقابي فعال');
    assert.equal(ctl15After.is_eligible_for_residual_reduction, true);
    assert.equal(updatedRisk2.calculated_output.effective_max_rrf, 0.95);
    assert.equal(updatedRisk2.calculated_output.selected_max_rrf_control_id, 'CTL-SYND-R11');

    // Mark Risk #2 and Risk #6 as reviewed
    markRiskReviewed({
      assessmentId: DRAFT_ID,
      riskId: 'RSK-SYND-02',
      user: maker,
      isReviewed: true,
      acknowledgeDiscrepancies: true,
    });
    markRiskReviewed({
      assessmentId: DRAFT_ID,
      riskId: 'RSK-SYND-06',
      user: maker,
      isReviewed: true,
      acknowledgeDiscrepancies: true,
    });

    // Verify readiness summary now reports is_ready_for_final_approval = true
    const readyState = getAssessmentHitlFullState(DRAFT_ID);
    assert.equal(
      readyState.readiness.is_ready_for_final_approval,
      true,
      'All approval blockers must be resolved after completing P15'
    );

    // Maker re-submits for Checker review
    const resubmitState = submitAssessmentForCheckerReview(DRAFT_ID, maker);
    assert.equal(resubmitState.assessment.workflow_status, 'IN_REVIEW');

    // Checker approves assessment
    const approveState = checkerApproveAssessment(DRAFT_ID, checker);
    assert.equal(approveState.assessment.workflow_status, 'APPROVED');
    assert.equal(approveState.assessment.status, 'APPROVED');
    assert.equal(approveState.assessment.is_latest_approved, true);
    assert.ok(
      approveState.assessment.immutable_snapshot?.cryptographic_sha256 &&
        approveState.assessment.immutable_snapshot.cryptographic_sha256.length === 64,
      'SHA-256 snapshot hash must be generated'
    );

    // Verify immutable snapshot record and field audit history in SQLite
    const snapRow = db
      .prepare('SELECT * FROM immutable_assessment_snapshots WHERE assessment_id = ?')
      .get(DRAFT_ID) as any;
    assert.ok(snapRow, 'Immutable assessment snapshot must be stored in SQLite');
    assert.equal(snapRow.cryptographic_sha256, approveState.assessment.immutable_snapshot.cryptographic_sha256);

    const fieldAudits = db
      .prepare('SELECT * FROM hitl_field_audit_history WHERE assessment_id = ?')
      .all(DRAFT_ID) as any[];
    assert.ok(fieldAudits.length >= 6, 'Field-level audit history must record all financial, control, suggestion, and workflow events');
  });

  test('9. Approved Version Immutability Enforcement (API & Database Triggers) & Reopen as New Draft Version (v3)', () => {
    const maker = getUserWithRoles('EMP-1001')!;

    // 9a. Attempt to directly edit/recalculate the APPROVED v2 assessment via service/API -> MUST BE REJECTED
    assert.throws(
      () =>
        updateSingleRiskAndRecalculate({
          assessmentId: DRAFT_ID,
          riskId: 'RSK-SYND-06',
          user: maker,
          riskUpdates: { individual_financial_impact: 999999 },
        }),
      /النسخة المعتمدة \(APPROVED\) مجمدة وغير قابلة للتعديل المباشر/
    );

    // 9b. Attempt direct SQLite UPDATE/DELETE on hitl_risk_packages, hitl_assessment_meta, and immutable_assessment_snapshots -> MUST BE REJECTED BY SQLITE TRIGGERS
    assert.throws(
      () =>
        db
          .prepare('UPDATE hitl_risk_packages SET reviewer_notes_ar = ? WHERE assessment_id = ?')
          .run('tamper', DRAFT_ID),
      /IMMUTABLE_APPROVED_ASSESSMENT/
    );
    assert.throws(
      () => db.prepare('DELETE FROM hitl_risk_packages WHERE assessment_id = ?').run(DRAFT_ID),
      /IMMUTABLE_APPROVED_ASSESSMENT/
    );
    assert.throws(
      () =>
        db
          .prepare("UPDATE hitl_assessment_meta SET workflow_status = 'DRAFT' WHERE assessment_id = ?")
          .run(DRAFT_ID),
      /IMMUTABLE_APPROVED_META/
    );
    assert.throws(
      () =>
        db
          .prepare('UPDATE immutable_assessment_snapshots SET snapshot_json = ? WHERE assessment_id = ?')
          .run('{}', DRAFT_ID),
      /IMMUTABLE_APPROVED_SNAPSHOT/
    );
    assert.throws(
      () =>
        db.prepare('DELETE FROM immutable_assessment_snapshots WHERE assessment_id = ?').run(DRAFT_ID),
      /IMMUTABLE_APPROVED_SNAPSHOT/
    );

    // 9c. Reopen approved v2 assessment as a new draft version (v3)
    const v3State = createNewDraftFromApproved(DRAFT_ID, maker);
    assert.equal(v3State.assessment.version_number, 3);
    assert.equal(v3State.assessment.base_assessment_id, DRAFT_ID);
    assert.equal(v3State.assessment.workflow_status, 'DRAFT');
    assert.equal(v3State.risks.length, 8);

    // Verify v2 remains APPROVED and immutable while v3 is an editable DRAFT
    const v2State = getAssessmentHitlFullState(DRAFT_ID);
    assert.equal(v2State.assessment.workflow_status, 'APPROVED');
    assert.equal(v2State.assessment.status, 'APPROVED');
  });

  test('10. Empty Business Unit Manual Draft Creation Without Fabricated Data (BU-BRANCHES)', () => {
    const admin = getUserWithRoles('EMP-9009')!;
    const branchState = createManualDraftForUnit('BU-BRANCHES', admin);
    assert.ok(branchState.assessment.id);
    assert.equal(branchState.assessment.unit_id, 'BU-BRANCHES');
    assert.equal(branchState.assessment.version_number, 1);
    assert.equal(branchState.assessment.workflow_status, 'DRAFT');
    // Verify no fabricated financial or control calculations exist for BU-BRANCHES
    assert.equal(branchState.risks.length, 1);
    assert.equal(branchState.risks[0].calculated_output.phase2a_status, 'PENDING_INPUT');
    assert.equal(branchState.risks[0].calculated_output.phase2b_status, 'PENDING_INPUT');
    assert.equal(branchState.risks[0].calculated_output.expected_annual_loss_egp, null);
    assert.equal(branchState.risks[0].calculated_output.residual_financial_amount_egp, null);
    assert.equal(
      branchState.readiness.is_ready_for_final_approval,
      false,
      'Empty unit draft with PENDING_INPUT risks cannot be approved'
    );
  });

  test('11. Server-Side HTTP API Authorization & Persistence Across Simulated Backend Restart', async () => {
    const express = (await import('express')).default;
    const { apiRouter } = await import('../src/server/api.js');
    const { generateToken } = await import('../src/server/auth.js');
    const Database = (await import('better-sqlite3')).default;

    // Ensure demo accounts have must_reset_password = 0 for live API testing
    db.prepare('UPDATE users SET must_reset_password = 0 WHERE employee_id IN (?, ?, ?)').run(
      'EMP-1001',
      'EMP-2002',
      'EMP-3003'
    );

    const maker1001 = getUserWithRoles('EMP-1001')!;
    const checker2002 = getUserWithRoles('EMP-2002')!;
    const maker3003 = getUserWithRoles('EMP-3003')!; // BU-POS & BU-TRADING only (no access to BU-SYNDICATED)

    const tokenMaker1001 = generateToken(maker1001);
    const tokenChecker2002 = generateToken(checker2002);
    const tokenMaker3003 = generateToken(maker3003);

    const app = express();
    app.use(express.json());
    app.use('/api', apiRouter);

    const server = await new Promise<import('http').Server>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });

    try {
      const addr = server.address() as { port: number };
      const baseUrl = `http://127.0.0.1:${addr.port}/api`;

      // 11a. Unauthenticated request is rejected with 401
      const unauthRes = await fetch(`${baseUrl}/hitl/assessments/${DRAFT_ID}`);
      assert.equal(unauthRes.status, 401);

      // 11b. Unauthorized cross-BU request (EMP-3003 accessing BU-SYNDICATED) is rejected with 403
      const crossBuRes = await fetch(`${baseUrl}/hitl/assessments/${DRAFT_ID}`, {
        headers: { Authorization: `Bearer ${tokenMaker3003}` },
      });
      assert.equal(crossBuRes.status, 403);

      // 11c. Find the editable v3 draft created in Subtest 9
      const v3Row = db
        .prepare("SELECT id FROM rcsa_assessments WHERE unit_id = 'BU-SYNDICATED' AND version_number = 3")
        .get() as { id: string };
      assert.ok(v3Row?.id);

      // 11d. Checker (EMP-2002) attempting Maker edit on v3 draft is rejected with 400/403
      const checkerEditRes = await fetch(
        `${baseUrl}/hitl/assessments/${v3Row.id}/risks/RSK-SYND-06/recalculate`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${tokenChecker2002}`,
          },
          body: JSON.stringify({
            risk_updates: { individual_financial_impact: 800000 },
          }),
        }
      );
      assert.equal(checkerEditRes.ok, false, 'Checker must not be allowed to author Maker edits');

      // 11e. Maker (EMP-1001) attempting to directly edit APPROVED v2 via HTTP API is rejected
      const editApprovedRes = await fetch(
        `${baseUrl}/hitl/assessments/${DRAFT_ID}/risks/RSK-SYND-06/recalculate`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${tokenMaker1001}`,
          },
          body: JSON.stringify({
            risk_updates: { individual_financial_impact: 800000 },
          }),
        }
      );
      assert.equal(editApprovedRes.ok, false, 'Approved assessment must reject direct HTTP API edits');

      // 11f. Simulate complete backend restart by opening a fresh independent SQLite connection to DB_PATH
      const restartedDb = new Database(DB_PATH, { readonly: true });
      try {
        const persistedRisk7 = restartedDb
          .prepare('SELECT calculated_output_json, current_draft_input_json FROM hitl_risk_packages WHERE assessment_id = ? AND risk_id = ?')
          .get(DRAFT_ID, 'RSK-SYND-07') as any;
        assert.ok(persistedRisk7);
        const r7Calc = JSON.parse(persistedRisk7.calculated_output_json);
        assert.equal(r7Calc.effective_max_rrf, 0.75, 'Risk #7 RRF=0.75 must persist on disk across backend restart');
        assert.equal(
          r7Calc.residual_financial_amount_egp,
          501000,
          'Risk #7 residual EGP 501,000 must persist on disk across backend restart'
        );

        const persistedRisk6 = restartedDb
          .prepare('SELECT calculated_output_json FROM hitl_risk_packages WHERE assessment_id = ? AND risk_id = ?')
          .get(DRAFT_ID, 'RSK-SYND-06') as any;
        const r6Calc = JSON.parse(persistedRisk6.calculated_output_json);
        assert.equal(r6Calc.effective_max_rrf, 0.80, 'Risk #6 calculated RRF=0.80 must persist on disk');
        assert.equal(r6Calc.workbook_reference_rrf, 0.90, 'Risk #6 workbook reference RRF=0.90 must persist on disk');
      } finally {
        restartedDb.close();
      }
      // 11g. Verify server-side taxonomy hierarchy validation on v3 draft
      const invalidTaxRes = await fetch(
        `${baseUrl}/hitl/assessments/${v3Row.id}/risks/RSK-SYND-06/recalculate`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${tokenMaker1001}`,
          },
          body: JSON.stringify({
            risk_updates: {
              taxonomy_l1_id: 'L1-01',
              taxonomy_l2_id: 'L2-08-01', // Mismatched parent-child pair
            },
          }),
        }
      );
      assert.equal(invalidTaxRes.ok, false, 'Server-side validation must reject mismatched L1-L2 taxonomy hierarchy');
      const errJson = await invalidTaxRes.json();
      assert.ok(errJson.error.includes('لا ينتمي'), 'Error message must explain parent-child taxonomy mismatch');

      // Valid taxonomy hierarchy update on v3 draft
      const validTaxRes = await fetch(
        `${baseUrl}/hitl/assessments/${v3Row.id}/risks/RSK-SYND-06/recalculate`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${tokenMaker1001}`,
          },
          body: JSON.stringify({
            risk_updates: {
              taxonomy_l1_id: 'L1-08',
              taxonomy_l1_ar: 'تنفيذ المعاملات وتسليمها وإدارتها',
              taxonomy_l2_id: 'L2-08-01',
              taxonomy_l2_ar: 'تسجيل المعاملات وتنفيذها وصيانتها',
              taxonomy_l3_id: 'L3-08-01-02',
              taxonomy_l3_ar: 'أخطاء إدخال البيانات أو تحميلها',
            },
          }),
        }
      );
      assert.equal(validTaxRes.ok, true, 'Server-side validation must accept valid L1-L2-L3 taxonomy hierarchy');
      const validTaxState = await validTaxRes.json();
      const updatedRisk6 = validTaxState.state.risks.find((r: any) => r.risk_id === 'RSK-SYND-06');
      assert.equal(updatedRisk6.current_draft_input.taxonomy_l1_id, 'L1-08');
      assert.equal(updatedRisk6.current_draft_input.taxonomy_l2_id, 'L2-08-01');
      assert.equal(updatedRisk6.current_draft_input.taxonomy_l3_id, 'L3-08-01-02');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

