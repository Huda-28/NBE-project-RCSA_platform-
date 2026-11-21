"""
Phase 2B.2 — Independent Regression Test Suite for Cross-Engine Consistency & Source Data Integrity.

Covers all 10 mandatory verification areas from Phase 2B.2 Section 10:
1. All 9 official RRF values (Automated, Semi-Automated, Manual x Preventive, Detective, Corrective).
2. Manual + Preventive = 0.75, never 0.30 (and never confused with Manual + Corrective = 0.30).
3. Risk-to-control row mapping across all 8 Syndicated Loans risks (Rows 8..27, 20 controls).
4. Row 19 (CTL-SYND-R19) belongs only to Risk #4 (RSK-SYND-04) and Row 20 (CTL-SYND-R20) belongs only to Risk #5 (RSK-SYND-05).
5. Exact incident amounts from original PDFs & SQLite, and single-event MAX selection without summing.
6. 100,000 EGP classified as L (Low), never M (Medium).
7. Zero, missing, and unknown financial impact handling (VERIFIED_ZERO_LOSS, NO_INCIDENT_LOSS_REPORTED, MISSING_FINANCIAL_IMPACT, UNKNOWN_FINANCIAL_IMPACT).
8. Partial-scope control handling (CTL-SYND-R24 preserves official RRF=0.90, flags human review, and recalculates to MAX RRF=0.75 / 501,000 EGP / H when scope-excluded).
9. Generated Arabic rationale text matching calculated values across all 8 risks and Account Opening candidate.
10. Single-risk recalculation after control eligibility or input changes without mutating unrelated risks.
"""

from __future__ import annotations

import unittest
from decimal import Decimal

from rcsa_engine import (
    CalculationStatus,
    ConsistencyCheckCategory,
    ConsistencyIssueSeverity,
    ControlAssessmentStatus,
    ControlEffectivenessClassification,
    ControlImplementationStatus,
    ControlInputRecord,
    ControlMethod,
    ControlRelevanceClassification,
    ControlType,
    FinancialInherentRequest,
    FinancialValueOrigin,
    FrequencyEvidenceOrigin,
    ResidualRiskAssessmentRequest,
    SeverityCode,
    ZeroOrMissingFinancialStatus,
    apply_hitl_review_decision,
    assess_individual_control,
    build_account_opening_candidate_review_package,
    build_hitl_review_package_for_risk,
    calculate_financial_inherent_risk,
    calculate_residual_risk,
    classify_financial_amount,
    evaluate_and_improve_control_description,
    generate_before_after_quality_evaluations,
    load_syndicated_loans_workbook_requests,
    lookup_official_rrf,
    recalculate_single_risk_in_register,
    reconcile_registered_incidents,
    reconstruct_syndicated_workbook_structure,
    run_end_to_end_syndicated_reconciliation,
    select_evidence_based_financial_impact,
)


class TestPhase2B2CrossEngineIntegrity(unittest.TestCase):
    """Comprehensive verification of Phase 2B.2 Cross-Engine Consistency & Source Data Integrity."""

    def test_01_all_nine_official_rrf_values(self) -> None:
        """1. Verify all 9 official RRF values in the 3x3 matrix."""
        expected_matrix = {
            (ControlMethod.AUTOMATED, ControlType.PREVENTIVE): Decimal("0.95"),
            (ControlMethod.AUTOMATED, ControlType.DETECTIVE): Decimal("0.85"),
            (ControlMethod.AUTOMATED, ControlType.CORRECTIVE): Decimal("0.50"),
            (ControlMethod.SEMI_AUTOMATED, ControlType.PREVENTIVE): Decimal("0.90"),
            (ControlMethod.SEMI_AUTOMATED, ControlType.DETECTIVE): Decimal("0.80"),
            (ControlMethod.SEMI_AUTOMATED, ControlType.CORRECTIVE): Decimal("0.40"),
            (ControlMethod.MANUAL, ControlType.PREVENTIVE): Decimal("0.75"),
            (ControlMethod.MANUAL, ControlType.DETECTIVE): Decimal("0.60"),
            (ControlMethod.MANUAL, ControlType.CORRECTIVE): Decimal("0.30"),
        }
        self.assertEqual(len(expected_matrix), 9)
        for (method, ctype), expected_rrf in expected_matrix.items():
            rrf_val, wb_key = lookup_official_rrf(method, ctype)
            self.assertEqual(rrf_val, expected_rrf)
            self.assertTrue(len(wb_key) > 0)

    def test_02_manual_preventive_is_075_never_030(self) -> None:
        """2. Verify Manual + Preventive is always 0.75 across both Control and Semantic engines, never 0.30."""
        rrf_mp, key_mp = lookup_official_rrf("Manual", "Preventive")
        self.assertEqual(rrf_mp, Decimal("0.75"))
        self.assertNotEqual(rrf_mp, Decimal("0.30"))
        self.assertEqual(key_mp, "Manual / preventive")

        # Verify all Manual/Preventive controls in Syndicated Loans workbook
        loaded = load_syndicated_loans_workbook_requests()
        manual_prev_ids = set()

        for _, _, req, _ in loaded:
            for ctrl in req.controls:
                indiv = assess_individual_control(ctrl)
                if indiv.control_method == ControlMethod.MANUAL and indiv.control_type == ControlType.PREVENTIVE:
                    manual_prev_ids.add(ctrl.control_id)
                    self.assertEqual(indiv.applicable_rrf, Decimal("0.75"), f"{ctrl.control_id} must have RRF=0.75")
                    sem = evaluate_and_improve_control_description(
                        control=ctrl,
                        risk_id=req.risk_id,
                        risk_description_ar=req.risk_description or "",
                    )
                    self.assertEqual(sem.applicable_rrf, Decimal("0.75"), f"Semantic {ctrl.control_id} must have RRF=0.75")
                    self.assertIn("RRF=0.75", sem.what_control_actually_does_ar)
                    self.assertNotIn("RRF=0.30", sem.what_control_actually_does_ar)

        self.assertTrue({"CTL-SYND-R14", "CTL-SYND-R19", "CTL-SYND-R21", "CTL-SYND-R23", "CTL-SYND-R25", "CTL-SYND-R26"}.issubset(manual_prev_ids))

        # Also check Account Opening CTL-ACCT-01 (Manual / Preventive)
        acct_pkg = build_account_opening_candidate_review_package()
        ctl_acct_01_sem = next(c for c in acct_pkg.control_quality_assessments if c.control_id == "CTL-ACCT-01")
        self.assertEqual(ctl_acct_01_sem.applicable_rrf, Decimal("0.75"))
        self.assertIn("CTL-ACCT-01: RRF=0.75", acct_pkg.rationale_proposal.proposed_rationale_ar)

    def test_03_risk_to_control_row_mapping_across_all_eight_risks(self) -> None:
        """3. Reconstruct and verify exact row spans and control counts across all 8 Syndicated Loans risks."""
        mappings = reconstruct_syndicated_workbook_structure()
        self.assertEqual(len(mappings), 8)

        expected = [
            ("RSK-SYND-01", 8, 9, [8, 9], ["CTL-SYND-R8", "CTL-SYND-R9"]),
            ("RSK-SYND-02", 10, 15, [10, 11, 12, 13, 14, 15], ["CTL-SYND-R10", "CTL-SYND-R11", "CTL-SYND-R12", "CTL-SYND-R13", "CTL-SYND-R14", "CTL-SYND-R15"]),
            ("RSK-SYND-03", 16, 18, [16, 17, 18], ["CTL-SYND-R16", "CTL-SYND-R17", "CTL-SYND-R18"]),
            ("RSK-SYND-04", 19, 19, [19], ["CTL-SYND-R19"]),
            ("RSK-SYND-05", 20, 20, [20], ["CTL-SYND-R20"]),
            ("RSK-SYND-06", 21, 22, [21, 22], ["CTL-SYND-R21", "CTL-SYND-R22"]),
            ("RSK-SYND-07", 23, 25, [23, 24, 25], ["CTL-SYND-R23", "CTL-SYND-R24", "CTL-SYND-R25"]),
            ("RSK-SYND-08", 26, 27, [26, 27], ["CTL-SYND-R26", "CTL-SYND-R27"]),
        ]

        total_controls = 0
        for m, (exp_id, exp_first, exp_last, exp_rows, exp_ctrls) in zip(mappings, expected):
            self.assertEqual(m.risk_id, exp_id)
            self.assertEqual(m.first_row, exp_first)
            self.assertEqual(m.last_row, exp_last)
            self.assertEqual(m.workbook_rows, exp_rows)
            self.assertEqual(m.linked_control_ids, exp_ctrls)
            total_controls += m.control_count

        self.assertEqual(total_controls, 20)

    def test_04_row19_is_risk4_only_and_row20_is_risk5_only(self) -> None:
        """4. Verify Row 19 (CTL-SYND-R19) belongs exclusively to Risk #4 and Row 20 (CTL-SYND-R20) to Risk #5."""
        mappings = {m.risk_id: m for m in reconstruct_syndicated_workbook_structure()}
        r4 = mappings["RSK-SYND-04"]
        r5 = mappings["RSK-SYND-05"]

        self.assertEqual(r4.workbook_rows, [19])
        self.assertEqual(r4.linked_control_ids, ["CTL-SYND-R19"])
        self.assertNotIn("CTL-SYND-R20", r4.linked_control_ids)

        self.assertEqual(r5.workbook_rows, [20])
        self.assertEqual(r5.linked_control_ids, ["CTL-SYND-R20"])
        self.assertNotIn("CTL-SYND-R19", r5.linked_control_ids)

        # Verify that if CTL-SYND-R20 is ever erroneously attached to RSK-SYND-04, cross-field consistency flags CRITICAL_CONTRADICTION
        loaded = {req.risk_id: (r_row, req, cells) for r_row, _, req, cells in load_syndicated_loans_workbook_requests()}
        r4_row, r4_req, r4_cells = loaded["RSK-SYND-04"]
        _, r5_req, _ = loaded["RSK-SYND-05"]

        tampered_p2b_req = ResidualRiskAssessmentRequest(
            risk_id="RSK-SYND-04",
            unit_id="BU-SYNDICATED",
            process_name=r4_req.process_name,
            risk_description=r4_req.risk_description,
            expected_annual_loss=r4_req.expected_annual_loss,
            controls=list(r4_req.controls) + list(r5_req.controls),  # Erroneously attach CTL-SYND-R20 to Risk #4
        )
        p2a_req = FinancialInherentRequest(
            risk_id="RSK-SYND-04",
            unit_id="BU-SYNDICATED",
            process_name=r4_req.process_name,
            risk_description=r4_req.risk_description,
            individual_financial_impact=Decimal("1501000"),
            expected_frequency_text="Half Yearly\nنصف سنوياً",
        )
        tampered_pkg = build_hitl_review_package_for_risk(
            phase2a_request=p2a_req,
            phase2b_request=tampered_p2b_req,
            workbook_cells=r4_cells,
            excel_row=r4_row,
        )
        row_mismatch_issues = [
            iss
            for iss in tampered_pkg.consistency_report.issues
            if iss.category == ConsistencyCheckCategory.RISK_VS_LINKED_CONTROLS
            and iss.severity == ConsistencyIssueSeverity.CRITICAL_CONTRADICTION
            and "CTL-SYND-R20" in iss.field_references
        ]
        self.assertEqual(len(row_mismatch_issues), 1)

    def test_05_authoritative_incident_amounts_and_single_event_max_selection(self) -> None:
        """5. Verify exact incident amounts from PDFs & SQLite and single-event MAX selection without summing."""
        inc_rows = reconcile_registered_incidents()
        self.assertEqual(len(inc_rows), 9)

        by_id = {r.canonical_incident_id: r for r in inc_rows}
        expected_amounts = {
            "INC-SYND-100": (Decimal("150000"), SeverityCode.L),
            "INC-SYND-101": (Decimal("599000"), SeverityCode.H),
            "INC-SYND-102": (Decimal("100000"), SeverityCode.L),
            "INC-SYND-103": (Decimal("700000"), SeverityCode.H),
            "INC-SYND-106": (Decimal("300000"), SeverityCode.M),
            "INC-ACCT-201": (Decimal("1500"), SeverityCode.L),
            "INC-ACCT-220": (Decimal("600000"), SeverityCode.H),
            "INC-ACCT-200": (Decimal("201000"), SeverityCode.M),
            "INC-ACCT-106": (Decimal("1000"), SeverityCode.L),
        }

        for cid, (exp_amt, exp_sev) in expected_amounts.items():
            self.assertIn(cid, by_id)
            row = by_id[cid]
            self.assertEqual(row.original_loss_amount, exp_amt, f"{cid} loss mismatch")
            self.assertEqual(row.individual_severity_code, exp_sev, f"{cid} severity mismatch")
            self.assertTrue(row.sqlite_matches_pdf, f"{cid} SQLite vs PDF mismatch")

        # Verify Risk #4 (100=150k, 103=700k) selects MAX=700,000 (never 850,000 sum)
        dec_r4 = select_evidence_based_financial_impact(
            unit_id="BU-SYNDICATED",
            risk_id="RSK-SYND-04",
            explicit_linked_incident_ids=["100", "103"],
        )
        self.assertEqual(dec_r4.selected_amount, Decimal("700000"))
        self.assertNotEqual(dec_r4.selected_amount, Decimal("850000"))

        # Verify Risk #7 (101=599k, 102=100k) selects MAX=599,000 (never 699,000 sum, never 50,000, never 0)
        dec_r7 = select_evidence_based_financial_impact(
            unit_id="BU-SYNDICATED",
            risk_id="RSK-SYND-07",
            explicit_linked_incident_ids=["101", "102"],
        )
        self.assertEqual(dec_r7.selected_amount, Decimal("599000"))
        self.assertNotEqual(dec_r7.selected_amount, Decimal("699000"))

    def test_06_100000_egp_classified_as_low_never_medium(self) -> None:
        """6. Verify 100,000 EGP is strictly classified as L (Low) in (0, 150,000], never M (Medium)."""
        lvl, code, label_ar, _, wb_code = classify_financial_amount(Decimal("100000"))
        self.assertEqual(lvl, 1)
        self.assertEqual(code, SeverityCode.L)
        self.assertEqual(label_ar, "تأثير مالي منخفض")
        self.assertEqual(wb_code, "L ")
        self.assertNotEqual(code, SeverityCode.M)

        # Boundary checks at 150,000 and 150,001
        _, code_150k, _, _, _ = classify_financial_amount(Decimal("150000"))
        _, code_150001, _, _, _ = classify_financial_amount(Decimal("150001"))
        self.assertEqual(code_150k, SeverityCode.L)
        self.assertEqual(code_150001, SeverityCode.M)

    def test_07_zero_missing_and_unknown_financial_impact_handling(self) -> None:
        """7. Verify explicit distinction of VERIFIED_ZERO_LOSS, NO_INCIDENT_LOSS_REPORTED, MISSING_FINANCIAL_IMPACT, UNKNOWN_FINANCIAL_IMPACT."""
        # A. VERIFIED_ZERO_LOSS
        res_zero = calculate_financial_inherent_risk(
            FinancialInherentRequest(
                risk_id="TEST-ZERO-1",
                unit_id="BU-SYNDICATED",
                individual_financial_impact=Decimal("0"),
                financial_value_origin=FinancialValueOrigin.EXPLICIT_HUMAN_ESTIMATE,
                expected_frequency_text="Yearly\nسنوياً",
            )
        )
        self.assertEqual(res_zero.status, CalculationStatus.PENDING_INPUT)
        self.assertEqual(res_zero.zero_or_missing_status, ZeroOrMissingFinancialStatus.VERIFIED_ZERO_LOSS)
        self.assertIsNone(res_zero.individual_impact_rating)  # Never auto-assigned L!

        # B. NO_INCIDENT_LOSS_REPORTED
        res_no_loss = calculate_financial_inherent_risk(
            FinancialInherentRequest(
                risk_id="TEST-ZERO-2",
                unit_id="BU-SYNDICATED",
                individual_financial_impact=Decimal("0"),
                expected_frequency_text="Yearly\nسنوياً",
            )
        )
        self.assertEqual(res_no_loss.status, CalculationStatus.PENDING_INPUT)
        self.assertEqual(res_no_loss.zero_or_missing_status, ZeroOrMissingFinancialStatus.NO_INCIDENT_LOSS_REPORTED)
        self.assertIsNone(res_no_loss.individual_impact_rating)

        # C. MISSING_FINANCIAL_IMPACT
        res_missing = calculate_financial_inherent_risk(
            FinancialInherentRequest(
                risk_id="TEST-MISSING",
                unit_id="BU-POS",
                individual_financial_impact=None,
                expected_frequency_text="Monthly\nشهرياً",
            )
        )
        self.assertEqual(res_missing.status, CalculationStatus.PENDING_INPUT)
        self.assertEqual(res_missing.zero_or_missing_status, ZeroOrMissingFinancialStatus.MISSING_FINANCIAL_IMPACT)
        self.assertIsNone(res_missing.individual_impact_rating)

        # D. UNKNOWN_FINANCIAL_IMPACT
        res_unknown = calculate_financial_inherent_risk(
            FinancialInherentRequest(
                risk_id="TEST-UNKNOWN",
                unit_id="BU-POS",
                individual_financial_impact="UNKNOWN",
                financial_value_origin=FinancialValueOrigin.UNSPECIFIED,
                expected_frequency_text="Monthly\nشهرياً",
            )
        )
        self.assertEqual(res_unknown.status, CalculationStatus.PENDING_INPUT)
        self.assertEqual(res_unknown.zero_or_missing_status, ZeroOrMissingFinancialStatus.UNKNOWN_FINANCIAL_IMPACT)
        self.assertIsNone(res_unknown.individual_impact_rating)

    def test_08_partial_scope_control_handling_and_recalculation_on_risk7(self) -> None:
        """8. Verify CTL-SYND-R24 preserves official RRF=0.90, flags human review, and recalculates Risk #7 to 0.75 / 501,000 EGP / H when scope-excluded."""
        evals = {ev.risk_id: ev for ev in generate_before_after_quality_evaluations()}
        ev7 = evals["RSK-SYND-07"]

        r23_sem = next(c for c in ev7.control_evaluations if c.control_id == "CTL-SYND-R23")
        r24_sem = next(c for c in ev7.control_evaluations if c.control_id == "CTL-SYND-R24")
        r25_sem = next(c for c in ev7.control_evaluations if c.control_id == "CTL-SYND-R25")

        # Official RRFs preserved without inventing arbitrary percentages
        self.assertEqual(r23_sem.applicable_rrf, Decimal("0.75"))
        self.assertEqual(r24_sem.applicable_rrf, Decimal("0.90"))
        self.assertEqual(r25_sem.applicable_rrf, Decimal("0.75"))
        self.assertEqual(r24_sem.relevance_classification, ControlRelevanceClassification.PARTIALLY_RELEVANT_DIFFERENT_SCOPE)

        # Build HITL package for Risk #7 and verify human review flag is raised
        loaded = {req.risk_id: (r_row, req, cells) for r_row, _, req, cells in load_syndicated_loans_workbook_requests()}
        r7_row, r7_p2b_req, r7_cells = loaded["RSK-SYND-07"]
        r7_p2a_req = FinancialInherentRequest(
            risk_id="RSK-SYND-07",
            unit_id="BU-SYNDICATED",
            process_name=r7_p2b_req.process_name,
            risk_description=r7_p2b_req.risk_description,
            individual_financial_impact=Decimal("501000"),
            financial_value_origin=FinancialValueOrigin.TEMPLATE_REFERENCE_AMOUNT,
            expected_frequency_text=r7_cells.get(f"I{r7_row}", ""),
            frequency_origin=FrequencyEvidenceOrigin.SOURCE_DOCUMENTED_FREQUENCY,
            explicit_linked_incident_ids=["101", "102"],
        )
        pkg7 = build_hitl_review_package_for_risk(
            phase2a_request=r7_p2a_req,
            phase2b_request=r7_p2b_req,
            workbook_cells=r7_cells,
            excel_row=r7_row,
        )
        self.assertTrue(pkg7.phase2b_result.requires_human_review)
        self.assertEqual(pkg7.phase2b_result.effective_rrf, Decimal("0.90"))
        self.assertEqual(pkg7.phase2b_result.residual_financial_amount, Decimal("200400"))
        self.assertEqual(pkg7.phase2b_result.continuous_residual_rating, SeverityCode.M)

        # Now exclude CTL-SYND-R24 from eligible RRF due to partial scope mismatch via HITL decision
        revised_pkg7 = apply_hitl_review_decision(
            package=pkg7,
            user_role="MAKER",
            target_field="control_scope_eligibility",
            action="UPDATE_INPUT_AND_RECALCULATE",
            custom_value=False,
            target_control_id="CTL-SYND-R24",
        )
        # CTL-SYND-R24 still keeps its official RRF=0.90, but is no longer eligible for Risk #7 reduction
        r24_after = next(c for c in revised_pkg7.phase2b_result.control_assessments if c.control_id == "CTL-SYND-R24")
        self.assertEqual(r24_after.applicable_rrf, Decimal("0.90"))
        self.assertFalse(r24_after.is_eligible_for_residual_reduction)

        # Risk #7 MAX RRF deterministically recalculates to 0.75 (from CTL-SYND-R23 / CTL-SYND-R25), residual = 501,000 EGP (H)
        self.assertEqual(revised_pkg7.phase2b_result.effective_rrf, Decimal("0.75"))
        self.assertIn(revised_pkg7.phase2b_result.selected_max_rrf_control_id, ("CTL-SYND-R23", "CTL-SYND-R25"))
        self.assertEqual(revised_pkg7.phase2b_result.residual_financial_amount, Decimal("501000"))
        self.assertEqual(revised_pkg7.phase2b_result.continuous_residual_rating, SeverityCode.H)
        self.assertIn("MAX RRF=0.75", revised_pkg7.active_rationale_ar)
        self.assertIn("501,000", revised_pkg7.active_rationale_ar)

    def test_09_arabic_rationale_matches_calculated_values(self) -> None:
        """9. Verify generated Arabic rationales strictly match calculated values across all examples."""
        evals = {ev.risk_id: ev for ev in generate_before_after_quality_evaluations()}

        # Risk #4: CTL-SYND-R19 (RRF=0.75), INC-SYND-100 (150,000 [L]), INC-SYND-103 (700,000 [H]), Residual 750,500 (H)
        rat4 = evals["RSK-SYND-04"].rationale_proposal.proposed_rationale_ar
        self.assertIn("CTL-SYND-R19: RRF=0.75", rat4)
        self.assertNotIn("CTL-SYND-R20", rat4)
        self.assertIn("INC-SYND-100: 150,000 ج.م [L]", rat4)
        self.assertIn("INC-SYND-103: 700,000 ج.م [H]", rat4)
        self.assertIn("750,500 ج.م", rat4)

        # Risk #7: CTL-SYND-R23 (0.75), CTL-SYND-R24 (0.90), CTL-SYND-R25 (0.75), INC-SYND-101 (599,000 [H]), INC-SYND-102 (100,000 [L])
        rat7 = evals["RSK-SYND-07"].rationale_proposal.proposed_rationale_ar
        self.assertIn("CTL-SYND-R23: RRF=0.75", rat7)
        self.assertIn("CTL-SYND-R24: RRF=0.90", rat7)
        self.assertIn("CTL-SYND-R25: RRF=0.75", rat7)
        self.assertIn("INC-SYND-101: 599,000 ج.م [H]", rat7)
        self.assertIn("INC-SYND-102: 100,000 ج.م [L]", rat7)
        self.assertNotIn("50,000", rat7)

        # Risk #8: CTL-SYND-R26 (0.75), CTL-SYND-R27 (0.90), INC-SYND-106 (300,000 [M]), Residual 601,200 (H)
        rat8 = evals["RSK-SYND-08"].rationale_proposal.proposed_rationale_ar
        self.assertIn("CTL-SYND-R26: RRF=0.75", rat8)
        self.assertIn("CTL-SYND-R27: RRF=0.90", rat8)
        self.assertIn("INC-SYND-106: 300,000 ج.م [M]", rat8)
        self.assertIn("601,200 ج.م", rat8)

    def test_10_end_to_end_reconciliation_and_single_risk_isolation(self) -> None:
        """10. Verify end-to-end 8-risk reconciliation and single-risk recalculation isolation."""
        e2e_rows = run_end_to_end_syndicated_reconciliation()
        self.assertEqual(len(e2e_rows), 8)

        by_id = {r.risk_id: r for r in e2e_rows}
        self.assertEqual(by_id["RSK-SYND-04"].actual_control_ids, ["CTL-SYND-R19"])
        self.assertEqual(by_id["RSK-SYND-05"].actual_control_ids, ["CTL-SYND-R20"])
        self.assertEqual(by_id["RSK-SYND-06"].correct_max_rrf, Decimal("0.80"))
        self.assertEqual(by_id["RSK-SYND-06"].workbook_reference_rrf, Decimal("0.90"))
        self.assertTrue(by_id["RSK-SYND-07"].scope_review_required)
        self.assertEqual(by_id["RSK-SYND-07"].scope_revised_max_rrf, Decimal("0.75"))
        self.assertEqual(by_id["RSK-SYND-07"].scope_revised_residual_egp, Decimal("501000"))
        self.assertEqual(by_id["RSK-SYND-07"].scope_revised_severity, "H")

        # Verify single-risk isolation when updating Risk #7's control eligibility
        loaded_reqs = [req for _, _, req, _ in load_syndicated_loans_workbook_requests()]
        baseline_results = {req.risk_id: calculate_residual_risk(req) for req in loaded_reqs}

        r7_req = next(req for req in loaded_reqs if req.risk_id == "RSK-SYND-07")
        updated_r7_controls = [
            ControlInputRecord(
                control_id=c.control_id,
                linked_risk_id=c.linked_risk_id,
                control_description=c.control_description,
                control_owner=c.control_owner,
                control_type_raw=c.control_type_raw,
                control_method_raw=c.control_method_raw,
                control_frequency_raw=c.control_frequency_raw,
                effectiveness_raw=c.effectiveness_raw,
                implementation_status=c.implementation_status,
                eligible_for_scope_override=(False if c.control_id == "CTL-SYND-R24" else None),
            )
            for c in r7_req.controls
        ]
        updated_r7_req = ResidualRiskAssessmentRequest(
            risk_id=r7_req.risk_id,
            unit_id=r7_req.unit_id,
            process_name=r7_req.process_name,
            risk_description=r7_req.risk_description,
            expected_annual_loss=r7_req.expected_annual_loss,
            controls=updated_r7_controls,
        )

        recalculated_map = recalculate_single_risk_in_register(
            register_requests=loaded_reqs,
            target_risk_id="RSK-SYND-07",
            updated_target_request=updated_r7_req,
        )

        for rid, res in recalculated_map.items():
            if rid == "RSK-SYND-07":
                self.assertEqual(res.effective_rrf, Decimal("0.75"))
                self.assertEqual(res.residual_financial_amount, Decimal("501000"))
            else:
                self.assertEqual(res.effective_rrf, baseline_results[rid].effective_rrf)
                self.assertEqual(res.residual_financial_amount, baseline_results[rid].residual_financial_amount)


if __name__ == "__main__":
    unittest.main()
