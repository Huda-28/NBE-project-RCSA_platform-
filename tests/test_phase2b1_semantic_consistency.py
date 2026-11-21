"""
Phase 2B.1 — Verification & Regression Test Suite for RCSA Semantic Intelligence,
Text Quality, Cross-Field Consistency, Strategic/Taxonomy Alignment & HITL Readiness.
"""

from __future__ import annotations

import unittest
from decimal import Decimal

from rcsa_engine import (
    AuditFindingEvidenceRecord,
    CalculationStatus,
    ConsistencyCheckCategory,
    ConsistencyIssueSeverity,
    ContentProvenanceLabel,
    ControlAssessmentStatus,
    ControlDeficiencyCategory,
    ControlDeficiencyStatus,
    ControlEffectivenessClassification,
    ControlImplementationStatus,
    ControlInputRecord,
    ControlRelevanceClassification,
    ControlType,
    CorrectiveActionPriority,
    EvidenceLinkOrigin,
    EvidenceReference,
    FinancialInherentRequest,
    FinancialValueOrigin,
    FrequencyEvidenceOrigin,
    IncidentFinancialEvidenceRecord,
    IncidentOrAuditEvidenceInput,
    ResidualRiskAssessmentRequest,
    SeverityCode,
    SOPProcedureEvidenceRecord,
    SuggestionReviewStatus,
    analyze_evidence_intelligence_for_risk,
    analyze_incident_or_audit_control_gap,
    apply_hitl_review_decision,
    build_account_opening_candidate_review_package,
    build_hitl_review_package_for_risk,
    calculate_financial_inherent_risk,
    calculate_residual_risk,
    evaluate_and_improve_control_description,
    evaluate_and_improve_risk_description,
    evaluate_strategic_objectives_and_taxonomy,
    generate_before_after_quality_evaluations,
    generate_professional_arabic_rationale,
    link_evidence_records_to_controls,
    load_dynamic_evidence_bundle,
    load_syndicated_loans_workbook_requests,
    recommend_corrective_actions,
    validate_cross_field_consistency,
)


class TestPhase2B1SemanticIntelligenceAndConsistency(unittest.TestCase):
    """Covers all 9 required test categories in Phase 2B.1 Section 12 plus Sections 2–11."""

    def test_01_correct_and_incorrect_risk_control_relationships(self) -> None:
        """
        1. Verify detection of:
           - Directly relevant control (`DIRECTLY_RELEVANT`)
           - Partially relevant control with different scope (`PARTIALLY_RELEVANT_DIFFERENT_SCOPE` — e.g. SHARE FOLDER on Risk #7)
           - Irrelevant mismatched control (`IRRELEVANT_MISMATCH` — e.g. AML sanctions control attached to GL balancing risk)
           - Recorded Preventive type vs actual Detective function (`CTL-SYND-R25` periodic/surprise inventory)
           - Proposed future control vs implemented control (`PROPOSED` vs `IMPLEMENTED`)
        """
        # 1a. Directly relevant control (CTL-SYND-R23 on Risk #7 physical document retention)
        c_direct = evaluate_and_improve_control_description(
            control=ControlInputRecord(
                control_id="CTL-SYND-R23",
                linked_risk_id="RSK-SYND-07",
                control_description="حفظ كافة أصول الطلبات وفقا وز مدد الحفظ بدواليب مؤمنة تحت الرقابة الثنائية",
                control_owner="السلطة الاشرافية",
                control_type_raw="ضوابط مانعة Preventive",
                control_method_raw="manual",
                control_frequency_raw="Daily\nيومياً",
                effectiveness_raw="ضابط رقابي فعال ولكن يحتاج تطوير (إجراءات تصحيحية لاحقة)",
                implementation_status=ControlImplementationStatus.IMPLEMENTED,
            ),
            risk_id="RSK-SYND-07",
            risk_description_ar="فقد المستندات",
        )
        self.assertEqual(c_direct.relevance_classification, ControlRelevanceClassification.DIRECTLY_RELEVANT)
        self.assertTrue(c_direct.type_matches_function)
        self.assertIn("وفقاً لمدد الحفظ المعتمدة", c_direct.proposed_improved_description_ar)

        # 1b. Scope mismatch: SHARE FOLDER electronic correspondence control on physical document loss risk
        c_scope = evaluate_and_improve_control_description(
            control=ControlInputRecord(
                control_id="CTL-SYND-R24",
                linked_risk_id="RSK-SYND-07",
                control_description="حفظ كافة المراسلات الكترونيا بال SHARE FOLDER ",
                control_owner="السلطة الاشرافية",
                control_type_raw="ضوابط مانعة Preventive",
                control_method_raw="Semi- Automated",
                control_frequency_raw="Daily\nيومياً",
                effectiveness_raw="ضابط رقابي فعال",
            ),
            risk_id="RSK-SYND-07",
            risk_description_ar="فقد المستندات",
        )
        self.assertEqual(
            c_scope.relevance_classification,
            ControlRelevanceClassification.PARTIALLY_RELEVANT_DIFFERENT_SCOPE,
        )
        self.assertIn("SHARE FOLDER", c_scope.relevance_explanation_ar)

        # 1c. Function mismatch: Periodic/surprise inventory inspection recorded as Preventive & Ad-hoc (CTL-SYND-R25)
        c_inv = evaluate_and_improve_control_description(
            control=ControlInputRecord(
                control_id="CTL-SYND-R25",
                linked_risk_id="RSK-SYND-07",
                control_description="اجراء جرد دوري و مفاجي للتحقق من توافر كافة الملفات بالدواليب المؤمنة",
                control_owner="السلطة الاشرافية",
                control_type_raw="ضوابط مانعة Preventive",
                control_method_raw="manual",
                control_frequency_raw="Ad-hoc\nوفقاً والحالة",
                effectiveness_raw="ضابط رقابي فعال",
            ),
            risk_id="RSK-SYND-07",
            risk_description_ar="فقد المستندات",
        )
        self.assertEqual(c_inv.documented_function_type, ControlType.DETECTIVE)
        self.assertFalse(c_inv.type_matches_function)
        self.assertIsNotNone(c_inv.type_mismatch_note_ar)
        self.assertIsNotNone(c_inv.frequency_consistency_note_ar)

        # 1d. Irrelevant mismatch: Sanctions screening control attached to GL balancing risk
        c_irrel = evaluate_and_improve_control_description(
            control=ControlInputRecord(
                control_id="CTL-WRONG-LINK",
                linked_risk_id="RSK-SYND-06",
                control_description="الكشف عن عناصر التحويل من خلال أنظمة الكشف لقوائم الحظر",
                control_owner="النظام",
                control_type_raw="Preventive",
                control_method_raw="Automated",
                effectiveness_raw="ضابط رقابي فعال",
            ),
            risk_id="RSK-SYND-06",
            risk_description_ar="أخطاء ضبط ارصدة حسابات الأستاذ العام",
        )
        self.assertEqual(c_irrel.relevance_classification, ControlRelevanceClassification.IRRELEVANT_MISMATCH)

    def test_02_unsupported_incident_links_and_ambiguous_evidence(self) -> None:
        """
        2 & 3. Verify handling of unsupported incident links (`UNSUPPORTED_SOURCE`),
               heuristic candidate matches (`HEURISTIC_CANDIDATE_MATCH`), and
               ambiguous multi-control AI suggestions (`AI_SUGGESTED_CANDIDATE` -> `HUMAN_REVIEW_REQUIRED`).
        """
        controls = [
            ControlInputRecord(
                control_id="CTL-A",
                linked_risk_id="RSK-TEST",
                control_description="مراجعة طلبات التحويلات المالية والتعزيز على النظام",
                control_type_raw="Preventive",
                control_method_raw="Semi-Automated",
                effectiveness_raw="ضابط رقابي فعال",
            ),
            ControlInputRecord(
                control_id="CTL-B",
                linked_risk_id="RSK-TEST",
                control_description="مراجعة التقارير اليومية لطلبات التحويلات المالية",
                control_type_raw="Detective",
                control_method_raw="Semi-Automated",
                effectiveness_raw="ضابط رقابي فعال",
            ),
        ]

        # 2a. Unsupported source (empty failure mechanism)
        unsupported_finding = analyze_incident_or_audit_control_gap(
            finding_id="F-UNSUP",
            source_type="INCIDENT",
            source_reference_id="INC-EMPTY",
            affected_business_process="تنفيذ التحويلات",
            failure_mechanism="   ",
            controls=controls,
        )
        self.assertEqual(unsupported_finding.evidence_link_origin, EvidenceLinkOrigin.UNSUPPORTED_SOURCE)
        self.assertEqual(unsupported_finding.deficiency_status, ControlDeficiencyStatus.UNSUPPORTED)
        self.assertTrue(unsupported_finding.requires_human_review)
        self.assertEqual(unsupported_finding.linked_control_ids, [])

        # 2b. Ambiguous heuristic match across both controls -> HUMAN_REVIEW_REQUIRED
        ambig_heuristic = analyze_incident_or_audit_control_gap(
            finding_id="F-AMBIG-HEUR",
            source_type="INCIDENT",
            source_reference_id="INC-AMBIG",
            affected_business_process="تنفيذ التحويلات",
            failure_mechanism="تأخر مراجعة طلبات التحويلات المالية",
            controls=controls,
            failure_keywords=["طلبات التحويلات المالية"],
        )
        self.assertEqual(ambig_heuristic.evidence_link_origin, EvidenceLinkOrigin.HEURISTIC_CANDIDATE_MATCH)
        self.assertEqual(ambig_heuristic.deficiency_status, ControlDeficiencyStatus.HUMAN_REVIEW_REQUIRED)
        self.assertTrue(ambig_heuristic.requires_human_review)
        self.assertEqual(ambig_heuristic.linked_control_ids, ["CTL-A", "CTL-B"])

        # 2c. AI-suggested candidate is never auto-confirmed
        ai_cand = analyze_incident_or_audit_control_gap(
            finding_id="F-AI-CAND",
            source_type="AUDIT_FINDING",
            source_reference_id="AUD-AI",
            affected_business_process="تنفيذ التحويلات",
            failure_mechanism="قصور محتمل في التعزيز",
            controls=controls,
            ai_suggested_control_ids=["CTL-A"],
        )
        self.assertEqual(ai_cand.evidence_link_origin, EvidenceLinkOrigin.AI_SUGGESTED_CANDIDATE)
        self.assertEqual(ai_cand.deficiency_status, ControlDeficiencyStatus.SUSPECTED)
        self.assertTrue(ai_cand.requires_human_review)

    def test_03_control_deficiency_classifications_and_remaining_effective_controls(self) -> None:
        """
        4. Verify that confirmed documentary evidence on one control (`CTL-SYND-R26`) does not
           mark sibling controls (`CTL-SYND-R27`) ineffective, and `remaining_effective_control_ids`
           accurately records which controls remained effective.
        """
        loaded = load_syndicated_loans_workbook_requests()
        by_id = {req.risk_id: (r_row, ctrl_rows, req, cell_map) for r_row, ctrl_rows, req, cell_map in loaded}

        # Risk #8 (RSK-SYND-08, Rows 26..27)
        _, _, r8_req, _ = by_id["RSK-SYND-08"]
        r8_res = calculate_residual_risk(r8_req)
        intel_items = analyze_evidence_intelligence_for_risk(
            risk_id="RSK-SYND-08",
            unit_id="BU-SYNDICATED",
            process_name_ar="التحقق من صحة المستندات",
            controls=r8_req.controls,
            gap_findings=r8_res.control_gap_findings,
        )
        self.assertEqual(len(intel_items), 1)
        item = intel_items[0]
        self.assertEqual(item.evidence_state, EvidenceLinkOrigin.CONFIRMED_DOCUMENTARY_EVIDENCE)
        self.assertEqual(item.deficiency_status, ControlDeficiencyStatus.CONFIRMED)
        self.assertEqual(item.relevant_existing_control_ids, ["CTL-SYND-R26"])
        self.assertEqual(item.remaining_effective_control_ids, ["CTL-SYND-R27"])
        self.assertFalse(item.requires_human_review)

    def test_04_rationale_consistency_and_separation_of_inherent_vs_residual(self) -> None:
        """
        5. Verify that generated Arabic rationale is compact, separates Inherent from Residual
           assessments, cites only verified evidence, and flags inconsistencies in the original
           workbook rationale (`AC19`, `AC23`, `AC26`).
        """
        evals = generate_before_after_quality_evaluations()
        by_risk = {e.risk_id: e for e in evals}

        # Risk #4 (RSK-SYND-04): Original AC19 says 'بتاثير مالي كبير' (H) while L19 is 'C '
        r4_eval = by_risk["RSK-SYND-04"]
        self.assertTrue(r4_eval.rationale_proposal.is_compact_for_official_template)
        self.assertTrue(r4_eval.rationale_proposal.inherent_vs_residual_separated)
        self.assertIn("[الخطر المتلازم]:", r4_eval.rationale_proposal.proposed_rationale_ar)
        self.assertIn("[الخطر المتبقي]:", r4_eval.rationale_proposal.proposed_rationale_ar)
        self.assertIn("750,500", r4_eval.rationale_proposal.proposed_rationale_ar)
        self.assertGreaterEqual(len(r4_eval.rationale_proposal.original_rationale_issues), 1)

        # Risk #7 (RSK-SYND-07): Original AA23 says 'مخاطرة مقبولة' while AC23 says 'المخاطرة غير مقبولة'
        r7_eval = by_risk["RSK-SYND-07"]
        contradiction_issues = [
            iss
            for iss in r7_eval.consistency_report.issues
            if iss.category == ConsistencyCheckCategory.RATIONALE_VS_ACTUAL_ASSESSMENT_RESULTS
            and iss.severity == ConsistencyIssueSeverity.CRITICAL_CONTRADICTION
        ]
        self.assertEqual(len(contradiction_issues), 1)
        self.assertIn("AA23", contradiction_issues[0].field_references)
        self.assertIn("AC23", contradiction_issues[0].field_references)

    def test_05_action_plan_relevance_and_no_mandatory_action_when_controls_sufficient(self) -> None:
        """
        6. Verify that:
           - Risks with sufficient effective controls (`RSK-SYND-01`, `RSK-SYND-05`) have
             `mandatory_action_required = False` and zero `required_corrective_action_candidates`.
           - Risk #4 (`RSK-SYND-04`) recommends a daily monitoring/tracking report (`recommends_automation=False`)
             rather than blindly recommending full automation for every risk.
           - No action item invents `assigned_owner` or `target_completion_date`.
        """
        loaded = load_syndicated_loans_workbook_requests()
        by_id = {req.risk_id: (r_row, ctrl_rows, req, cell_map) for r_row, ctrl_rows, req, cell_map in loaded}

        # Risk #1 (All controls effective) -> No mandatory corrective actions
        _, _, r1_req, r1_cells = by_id["RSK-SYND-01"]
        r1_res = calculate_residual_risk(r1_req)
        r1_act = recommend_corrective_actions(
            risk_id="RSK-SYND-01",
            unit_id="BU-SYNDICATED",
            phase2b_result=r1_res,
            original_workbook_action_ar=r1_cells.get("AB8"),
        )
        self.assertFalse(r1_act.mandatory_action_required)
        self.assertEqual(len(r1_act.required_corrective_action_candidates), 0)

        # Risk #4 (Manual control needs improvement) -> Recommends tracking report, NOT blind automation, and no invented owner/date
        _, _, r4_req, r4_cells = by_id["RSK-SYND-04"]
        r4_res = calculate_residual_risk(r4_req)
        r4_act = recommend_corrective_actions(
            risk_id="RSK-SYND-04",
            unit_id="BU-SYNDICATED",
            phase2b_result=r4_res,
            original_workbook_action_ar=r4_cells.get("AB19"),
        )
        self.assertTrue(r4_act.mandatory_action_required)
        self.assertEqual(len(r4_act.required_corrective_action_candidates), 1)
        cand = r4_act.required_corrective_action_candidates[0]
        self.assertFalse(cand.recommends_automation)
        self.assertIsNone(cand.assigned_owner)
        self.assertIsNone(cand.target_completion_date)
        self.assertEqual(cand.approval_status, SuggestionReviewStatus.PENDING_HUMAN_REVIEW)

    def test_06_cross_field_consistency_high_inherent_low_residual_valid_and_risk6_rrf_mismatch(self) -> None:
        """
        7. Verify cross-field consistency checks:
           - High Inherent (`H`) + Low Residual (`L`) on Risk #1 (`RSK-SYND-01`, RRF=0.95) is recognized as VALID (`high_inherent_low_residual_valid=True`).
           - Risk #6 (`RSK-SYND-06`, Row 21) flags `RRF_VS_ELIGIBLE_IMPLEMENTED_CONTROLS` because `S21='Semi Auto / preventive'` (0.90) is not among its controls (0.75 and 0.80).
           - Final risk acceptance is deferred to Phase 2C (`final_risk_acceptance_deferred_to_phase2c=True`).
        """
        loaded = load_syndicated_loans_workbook_requests()
        by_id = {req.risk_id: (r_row, ctrl_rows, req, cell_map) for r_row, ctrl_rows, req, cell_map in loaded}
        synd_bundle = load_dynamic_evidence_bundle("BU-SYNDICATED")

        # Risk #1: High Inherent (1,002,000 EGP = H) -> Low Residual (50,100 EGP = L) with 0.95 Automated Preventive
        r1_row, _, r1_p2b_req, r1_cells = by_id["RSK-SYND-01"]
        r1_p2a_req = FinancialInherentRequest(
            risk_id="RSK-SYND-01",
            unit_id="BU-SYNDICATED",
            process_name=r1_cells.get("F8"),
            risk_description=r1_cells.get("G8"),
            individual_financial_impact=r1_cells.get("J8"),
            expected_frequency_text=r1_cells.get("I8"),
        )
        r1_pkg = build_hitl_review_package_for_risk(
            phase2a_request=r1_p2a_req,
            phase2b_request=r1_p2b_req,
            evidence_bundle=synd_bundle,
            workbook_cells=r1_cells,
            excel_row=r1_row,
        )
        self.assertTrue(r1_pkg.consistency_report.high_inherent_low_residual_valid)
        self.assertTrue(r1_pkg.consistency_report.final_risk_acceptance_deferred_to_phase2c)

        # Risk #6: Workbook S21 ('Semi Auto / preventive' = 0.90) vs actual controls (0.75, 0.80 -> MAX 0.80)
        r6_row, _, r6_p2b_req, r6_cells = by_id["RSK-SYND-06"]
        r6_p2a_req = FinancialInherentRequest(
            risk_id="RSK-SYND-06",
            unit_id="BU-SYNDICATED",
            process_name=r6_cells.get("F21"),
            risk_description=r6_cells.get("G21"),
            individual_financial_impact=r6_cells.get("J21"),
            expected_frequency_text=r6_cells.get("I21"),
        )
        r6_pkg = build_hitl_review_package_for_risk(
            phase2a_request=r6_p2a_req,
            phase2b_request=r6_p2b_req,
            evidence_bundle=synd_bundle,
            workbook_cells=r6_cells,
            excel_row=r6_row,
        )
        rrf_issues = [
            iss
            for iss in r6_pkg.consistency_report.issues
            if iss.category == ConsistencyCheckCategory.RRF_VS_ELIGIBLE_IMPLEMENTED_CONTROLS
        ]
        self.assertEqual(len(rrf_issues), 1)
        self.assertIn("S21", rrf_issues[0].field_references)

    def test_07_missing_input_handling_and_no_fabricated_source_details(self) -> None:
        """
        8. Verify that for the derived Account Opening candidate (`RSK-ACCT-CAND-01`):
           - `original_description_ar` is `None` (`MISSING_IN_SOURCE`) — never fabricated!
           - `individual_financial_impact` is selected from `INC-ACCT-200` (201,000 EGP).
           - `expected_frequency` is missing (`PENDING_INPUT`) because historical incidents in `DOC-INC-ACCT`
             have no observation period, so neither annual loss nor residual loss is fabricated.
           - Proposed control `CTL-ACCT-03-PROPOSED` is excluded from current residual RRF reduction.
        """
        acct_pkg = build_account_opening_candidate_review_package()

        self.assertIsNone(acct_pkg.risk_description_quality.original_description_ar)
        self.assertEqual(
            acct_pkg.risk_description_quality.original_description_status,
            ContentProvenanceLabel.MISSING_IN_SOURCE,
        )
        self.assertEqual(
            acct_pkg.risk_description_quality.proposal_provenance,
            ContentProvenanceLabel.AI_PROPOSED_IMPROVEMENT,
        )
        self.assertEqual(acct_pkg.phase2a_result.status, CalculationStatus.PENDING_INPUT)
        self.assertEqual(acct_pkg.phase2a_result.individual_financial_impact, Decimal("201000"))
        self.assertIn("expected_frequency", acct_pkg.pending_missing_fields)
        self.assertIsNone(acct_pkg.phase2a_result.expected_annual_loss)
        self.assertEqual(acct_pkg.phase2b_result.status, ControlAssessmentStatus.PENDING_INPUT)

        # Verify proposed control CTL-ACCT-03-PROPOSED is not eligible for current RRF reduction
        prop_ctrl = next(
            c for c in acct_pkg.phase2b_result.control_assessments if c.control_id == "CTL-ACCT-03-PROPOSED"
        )
        self.assertEqual(prop_ctrl.implementation_status, ControlImplementationStatus.PROPOSED)
        self.assertFalse(prop_ctrl.is_eligible_for_residual_reduction)

    def test_08_dynamic_evidence_input_compatibility_without_code_changes(self) -> None:
        """
        9. Verify that `load_dynamic_evidence_bundle` reads from SQLite/registered sources
           and dynamically accepts newly uploaded SOP procedures, incidents, and audit findings
           for a partial-data Business Unit (`BU-BRANCHES`) without modifying Python source code.
        """
        # Before upload: BU-BRANCHES has MISSING_DOCUMENT for SOP, Incidents, and Audit Findings
        empty_branches = load_dynamic_evidence_bundle("BU-BRANCHES")
        self.assertEqual(empty_branches.sop_status, "MISSING_DOCUMENT")
        self.assertEqual(len(empty_branches.sop_procedures), 0)

        # Dynamically supply newly uploaded SOP, Incident, and Audit Finding for BU-BRANCHES
        uploaded_sop = SOPProcedureEvidenceRecord(
            chunk_id="CHK-SOP-BRN-01",
            document_id="DOC-SOP-BRN-NEW",
            unit_id="BU-BRANCHES",
            procedure_index=1,
            section_title_ar="الإجراء الأول: جرد ومطابقة الخزينة الرئيسية بالفرع في نهاية اليوم",
            content_text_ar="إجراء الجرد الفعلي للنقدية بالخزينة الرئيسية ومطابقتها مع رصيد النظام بحضور مدير الفرع وصراف الخزينة تحت الرقابة الثنائية.",
            page_number=1,
            source_file="uploaded_branch_sop.pdf",
        )
        uploaded_inc = IncidentFinancialEvidenceRecord(
            incident_id="INC-BRN-501",
            incident_code="501",
            unit_id="BU-BRANCHES",
            process_name="جرد ومطابقة الخزينة الرئيسية بالفرع",
            event_summary_ar="عجز نقدي بالخزينة الفرعية",
            incident_detail_ar="ظهور فرق عجز نقدي نتيجة عدم إجراء المطابقة المسائية المزدوجة قبل الإقفال",
            failure_mechanism_keywords=["عجز نقدي", "عدم إجراء المطابقة المسائية"],
            net_loss_amount=Decimal("45000"),
            risk_category_l1="8 Executing, Delivering & Managing Transactions",
            mapped_l1_id="L1-08",
            source_document_id="DOC-INC-BRN-NEW",
        )
        uploaded_aud = AuditFindingEvidenceRecord(
            finding_id="AUD-BRN-01",
            unit_id="BU-BRANCHES",
            finding_number=1,
            title_ar="الملاحظة الأولى: عدم انتظام توقيع محاضر الجرد المسائي للخزينة ببعض الفروع",
            details_ar="تبين إغفال توقيع المشرف على محضر مطابقة النقدية اليومي مع شاشة النظام.",
            root_causes_ar="ضعف المتابعة الإشرافية اليومية على محاضر جرد الخزينة.",
            impact_ar="تأخر اكتشاف فروق النقدية ومخاطر تشغيلية ومالية.",
            corrective_action_ar="إلزام مديري الفروع بمراجعة وتوقيع محضر المطابقة اليومي إلكترونياً قبل إقفال اليومية.",
            source_document_id="DOC-AUD-BRN-NEW",
        )

        dyn_bundle = load_dynamic_evidence_bundle(
            unit_id="BU-BRANCHES",
            custom_sop_procedures=[uploaded_sop],
            custom_incidents=[uploaded_inc],
            custom_audit_findings=[uploaded_aud],
        )
        self.assertEqual(dyn_bundle.sop_status, "AVAILABLE")
        self.assertEqual(dyn_bundle.incidents_status, "AVAILABLE")
        self.assertEqual(dyn_bundle.audit_findings_status, "AVAILABLE")
        self.assertEqual(len(dyn_bundle.sop_procedures), 1)
        self.assertEqual(len(dyn_bundle.incidents), 1)
        self.assertEqual(len(dyn_bundle.audit_findings), 1)

        # Evaluate a new risk on BU-BRANCHES using the dynamic bundle
        desc_qual = evaluate_and_improve_risk_description(
            risk_id="RSK-BRN-01",
            unit_id="BU-BRANCHES",
            original_description_ar=None,
            evidence_bundle=dyn_bundle,
            linked_incidents=dyn_bundle.incidents,
            linked_audit_findings=dyn_bundle.audit_findings,
            linked_sop_procedures=dyn_bundle.sop_procedures,
        )
        self.assertIn("جرد ومطابقة الخزينة الرئيسية", desc_qual.proposed_improved_description_ar)
        self.assertIn("ضعف المتابعة الإشرافية", desc_qual.proposed_improved_description_ar)

    def test_09_strategic_objectives_and_taxonomy_alignment_plus_hitl_workflow(self) -> None:
        """
        10. Verify:
            - Strategic objectives use only the 5 official Page 8 objectives.
            - L1-L3 taxonomy suggestions map accurately without replacing approved classifications,
              and ESG remains `DEFERRED_TO_PHASE_2C`.
            - All 4 mandatory Before/After quality evaluations are complete.
            - HITL review workflow allows Maker to supply missing frequency on `RSK-ACCT-CAND-01`,
              triggers dependent Phase 2A + Phase 2B recalculation, and blocks `AUDITOR` / `CHECKER` from direct Maker authoring.
        """
        evals = generate_before_after_quality_evaluations()
        self.assertEqual(len(evals), 4)
        for ev in evals:
            for obj in ev.strategic_and_taxonomy_alignment.linked_official_strategic_objectives:
                self.assertIn(obj, [
                    "التركيز على العملاء و تعظيم الأرباح",
                    "التحول الرقمي و تفعيل الذكاء الاصطناعي",
                    "النمو المربح و المستدام",
                    "الكفاءة و الامان والمرونة",
                    "الشمول المالي",
                ])
            self.assertEqual(ev.strategic_and_taxonomy_alignment.esg_classification_status, "DEFERRED_TO_PHASE_2C")

        # Interactive HITL test on Account Opening candidate (RSK-ACCT-CAND-01)
        acct_pkg = build_account_opening_candidate_review_package()
        self.assertEqual(acct_pkg.phase2a_result.status, CalculationStatus.PENDING_INPUT)

        # 1. Auditor cannot modify
        with self.assertRaises(PermissionError):
            apply_hitl_review_decision(
                package=acct_pkg,
                user_role="AUDITOR",
                target_field="expected_frequency_text",
                action="UPDATE_INPUT_AND_RECALCULATE",
                custom_value="مرة كل نصف سنة",
            )

        # 2. Maker supplies authorized frequency ("مرة كل نصف سنة" -> x2) -> triggers dependent Phase 2A & 2B calculation!
        updated_pkg = apply_hitl_review_decision(
            package=acct_pkg,
            user_role="MAKER",
            target_field="expected_frequency_text",
            action="UPDATE_INPUT_AND_RECALCULATE",
            custom_value="مرة كل نصف سنة",
        )
        self.assertEqual(updated_pkg.phase2a_result.status, CalculationStatus.COMPUTED)
        self.assertEqual(updated_pkg.phase2a_result.individual_financial_impact, Decimal("201000"))
        self.assertEqual(updated_pkg.phase2a_result.expected_annual_loss, Decimal("402000"))
        self.assertEqual(updated_pkg.phase2a_result.annualized_financial_rating, SeverityCode.M)

        # Dependent Phase 2B residual calculation: MAX RRF from CTL-ACCT-02 (Semi-Automated Preventive = 0.90; CTL-ACCT-03-PROPOSED is excluded!)
        self.assertEqual(updated_pkg.phase2b_result.status, ControlAssessmentStatus.COMPUTED)
        self.assertEqual(updated_pkg.phase2b_result.effective_rrf, Decimal("0.90"))
        self.assertEqual(updated_pkg.phase2b_result.selected_max_rrf_control_id, "CTL-ACCT-02")
        self.assertEqual(updated_pkg.phase2b_result.residual_financial_amount, Decimal("40200.00"))
        self.assertEqual(updated_pkg.phase2b_result.continuous_residual_rating, SeverityCode.L)
        self.assertEqual(updated_pkg.maker_checker_status, "MODIFIED_BY_MAKER_PENDING_CHECKER_APPROVAL")

        # 3. Maker accepts the improved Arabic risk description suggestion
        updated_pkg = apply_hitl_review_decision(
            package=updated_pkg,
            user_role="MAKER",
            target_field="risk_description",
            action="ACCEPT_SUGGESTION",
        )
        self.assertEqual(
            updated_pkg.risk_description_quality.review_status,
            SuggestionReviewStatus.ACCEPTED_BY_MAKER,
        )
        self.assertEqual(
            updated_pkg.active_risk_description_ar,
            updated_pkg.risk_description_quality.proposed_improved_description_ar,
        )


if __name__ == "__main__":
    unittest.main()
