"""
Phase 2B — Comprehensive Verification & Regression Test Suite for:
Individual Control Assessment -> Official RRF Lookup -> Maximum Eligible RRF ->
Residual Financial Risk -> Evidence-Based Control Gap Identification.

All expected values are independently specified from the authoritative NBE
Methodology PDF (Pages 2, 3, 6) and Official RCSA Excel Template (Cells M8:AB27, EG889:EJ897).
"""

from __future__ import annotations

import unittest
from decimal import Decimal
from typing import Dict, Tuple

from rcsa_engine import (
    CalculationStatus,
    ControlAssessmentStatus,
    ControlDeficiencyCategory,
    ControlDeficiencyStatus,
    ControlEffectivenessClassification,
    ControlImplementationStatus,
    ControlInputRecord,
    ControlMethod,
    ControlType,
    EvidenceLinkOrigin,
    EvidenceReference,
    FinancialInherentRequest,
    IncidentOrAuditEvidenceInput,
    ResidualRiskAssessmentRequest,
    SeverityCode,
    analyze_incident_or_audit_control_gap,
    assess_individual_control,
    build_pdf_page6_residual_reference,
    calculate_financial_inherent_risk,
    calculate_residual_financial_amount,
    calculate_residual_risk,
    classify_residual_financial_excel_u,
    link_evidence_records_to_controls,
    load_syndicated_loans_workbook_requests,
    lookup_official_rrf,
    recalculate_single_risk_in_register,
    select_max_eligible_rrf,
    update_control_in_risk_and_recalculate,
    validate_syndicated_loans_residual_workbook,
    validate_syndicated_loans_workbook,
)


class TestPhase2BControlResidualEngine(unittest.TestCase):
    """
    Covers all 20 required verification categories specified in Phase 2B Section 12.
    """

    def test_01_all_nine_rrf_matrix_entries(self) -> None:
        """1. Independently verify all 9 official RRF matrix entries and workbook lookup keys."""
        independent_expected_rrf: Dict[Tuple[str, str], Tuple[Decimal, str]] = {
            ("Automated", "Preventive"): (Decimal("0.95"), "Auto / preventive"),
            ("Automated", "Detective"): (Decimal("0.85"), "Auto / detective"),
            ("Automated", "Corrective"): (Decimal("0.50"), "Auto / corrective"),
            ("Semi-Automated", "Preventive"): (Decimal("0.90"), "Semi Auto / preventive"),
            ("Semi-Automated", "Detective"): (Decimal("0.80"), "Semi Auto / detective"),
            ("Semi-Automated", "Corrective"): (Decimal("0.40"), "Semi Auto / corrective"),
            ("Manual", "Preventive"): (Decimal("0.75"), "Manual / preventive"),
            ("Manual", "Detective"): (Decimal("0.60"), "Manual / detective"),
            ("Manual", "Corrective"): (Decimal("0.30"), "Manual / corrective"),
        }
        self.assertEqual(len(independent_expected_rrf), 9)
        for (method_str, type_str), (exp_rrf, exp_key) in independent_expected_rrf.items():
            calc_rrf, calc_key = lookup_official_rrf(method_str, type_str)
            self.assertEqual(calc_rrf, exp_rrf, f"Mismatch for ({method_str}, {type_str})")
            self.assertEqual(calc_key, exp_key)

    def test_02_preventive_detective_corrective_control_types(self) -> None:
        """2. Verify Arabic and English normalization for Preventive, Detective, and Corrective controls."""
        c_prev = assess_individual_control(
            ControlInputRecord(
                control_id="C-PREV",
                linked_risk_id="R-1",
                control_description="ضوابط مانعة",
                control_type_raw="ضوابط مانعة Preventive",
                control_method_raw="Automated",
                effectiveness_raw="ضابط رقابي فعال",
            )
        )
        c_det = assess_individual_control(
            ControlInputRecord(
                control_id="C-DET",
                linked_risk_id="R-1",
                control_description="ضوابط كاشفة",
                control_type_raw="ضوابط كاشفة Detective",
                control_method_raw="Automated",
                effectiveness_raw="ضابط رقابي فعال",
            )
        )
        c_corr = assess_individual_control(
            ControlInputRecord(
                control_id="C-CORR",
                linked_risk_id="R-1",
                control_description="ضوابط تصحيحية",
                control_type_raw="ضوابط رقابية تصحيحية",
                control_method_raw="Automated",
                effectiveness_raw="ضابط رقابي فعال",
            )
        )
        self.assertEqual(c_prev.control_type, ControlType.PREVENTIVE)
        self.assertEqual(c_prev.applicable_rrf, Decimal("0.95"))
        self.assertEqual(c_det.control_type, ControlType.DETECTIVE)
        self.assertEqual(c_det.applicable_rrf, Decimal("0.85"))
        self.assertEqual(c_corr.control_type, ControlType.CORRECTIVE)
        self.assertEqual(c_corr.applicable_rrf, Decimal("0.50"))

    def test_03_automated_semi_automated_manual_methods(self) -> None:
        """3. Verify Arabic and English normalization for Automated, Semi-Automated, and Manual methods."""
        c_auto = assess_individual_control(
            ControlInputRecord(
                control_id="C-AUTO",
                linked_risk_id="R-1",
                control_description="ضابط آلي",
                control_type_raw="Preventive",
                control_method_raw="ضابط رقابي آلي",
                effectiveness_raw="ضابط رقابي فعال",
            )
        )
        c_semi = assess_individual_control(
            ControlInputRecord(
                control_id="C-SEMI",
                linked_risk_id="R-1",
                control_description="ضابط شبه آلي",
                control_type_raw="Preventive",
                control_method_raw="Semi- Automated",
                effectiveness_raw="ضابط رقابي فعال",
            )
        )
        c_man = assess_individual_control(
            ControlInputRecord(
                control_id="C-MAN",
                linked_risk_id="R-1",
                control_description="ضابط يدوي",
                control_type_raw="Preventive",
                control_method_raw="manual",
                effectiveness_raw="ضابط رقابي فعال",
            )
        )
        self.assertEqual(c_auto.control_method, ControlMethod.AUTOMATED)
        self.assertEqual(c_auto.applicable_rrf, Decimal("0.95"))
        self.assertEqual(c_semi.control_method, ControlMethod.SEMI_AUTOMATED)
        self.assertEqual(c_semi.applicable_rrf, Decimal("0.90"))
        self.assertEqual(c_man.control_method, ControlMethod.MANUAL)
        self.assertEqual(c_man.applicable_rrf, Decimal("0.75"))

    def test_04_single_implemented_control(self) -> None:
        """4. Verify single implemented control RRF and residual calculation."""
        req = ResidualRiskAssessmentRequest(
            risk_id="RSK-SINGLE",
            unit_id="BU-SYNDICATED",
            expected_annual_loss=Decimal("501000"),
            controls=[
                ControlInputRecord(
                    control_id="CTL-01",
                    linked_risk_id="RSK-SINGLE",
                    control_description="مراجعة القيود المحاسبية",
                    control_type_raw="Preventive",
                    control_method_raw="Semi-Automated",
                    effectiveness_raw="ضابط رقابي فعال",
                    implementation_status=ControlImplementationStatus.IMPLEMENTED,
                )
            ],
        )
        res = calculate_residual_risk(req)
        self.assertEqual(res.status, ControlAssessmentStatus.COMPUTED)
        self.assertEqual(res.effective_rrf, Decimal("0.90"))
        self.assertEqual(res.selected_max_rrf_control_id, "CTL-01")
        self.assertEqual(res.residual_financial_amount, Decimal("50100.00"))
        self.assertEqual(res.continuous_residual_rating, SeverityCode.L)

    def test_05_multiple_controls_using_max_rrf_never_sum_or_average(self) -> None:
        """
        5. Verify MAX RRF selection with multiple controls (Prompt Section 7 Example):
        - Expected annual loss: EGP 1,000,000
        - Implemented automated preventive control: RRF = 0.95
        - Implemented manual detective control: RRF = 0.60
        - Maximum RRF: 0.95
        - Residual financial amount: EGP 50,000
        """
        req = ResidualRiskAssessmentRequest(
            risk_id="RSK-MULTI-MAX",
            unit_id="BU-SYNDICATED",
            expected_annual_loss=Decimal("1000000"),
            controls=[
                ControlInputRecord(
                    control_id="CTL-MAN-DET",
                    linked_risk_id="RSK-MULTI-MAX",
                    control_description="تقرير مطابقة يدوي",
                    control_type_raw="Detective",
                    control_method_raw="Manual",
                    effectiveness_raw="ضابط رقابي فعال",
                    implementation_status=ControlImplementationStatus.IMPLEMENTED,
                ),
                ControlInputRecord(
                    control_id="CTL-AUTO-PREV",
                    linked_risk_id="RSK-MULTI-MAX",
                    control_description="حظر آلي بالنظام",
                    control_type_raw="Preventive",
                    control_method_raw="Automated",
                    effectiveness_raw="ضابط رقابي فعال",
                    implementation_status=ControlImplementationStatus.IMPLEMENTED,
                ),
            ],
        )
        res = calculate_residual_risk(req)
        self.assertEqual(res.effective_rrf, Decimal("0.95"))
        self.assertEqual(res.selected_max_rrf_control_id, "CTL-AUTO-PREV")
        self.assertEqual(res.residual_financial_amount, Decimal("50000.00"))
        self.assertEqual(res.continuous_residual_rating, SeverityCode.L)

    def test_06_implemented_control_rated_needs_improvement_retains_rrf(self) -> None:
        """
        6. Verify that an implemented control rated 'ضابط رقابي يحتاج إلى تطوير'
        retains its applicable RRF under Phase 2B rules (e.g., Syndicated Loans Row 19).
        """
        req = ResidualRiskAssessmentRequest(
            risk_id="RSK-SYND-04",
            unit_id="BU-SYNDICATED",
            expected_annual_loss=Decimal("3002000"),
            controls=[
                ControlInputRecord(
                    control_id="CTL-SYND-R19",
                    linked_risk_id="RSK-SYND-04",
                    control_description="التحقق من تعزيز كافة العمليات التي تم تسجيلها علي أنظمة مصرفنا",
                    control_type_raw="ضوابط مانعة Preventive",
                    control_method_raw="manual",
                    effectiveness_raw="ضابط رقابي فعال ولكن يحتاج تطوير (إجراءات تصحيحية لاحقة)",
                    implementation_status=ControlImplementationStatus.IMPLEMENTED,
                )
            ],
        )
        res = calculate_residual_risk(req)
        self.assertEqual(
            res.control_assessments[0].effectiveness_classification,
            ControlEffectivenessClassification.NEEDS_IMPROVEMENT,
        )
        self.assertTrue(res.control_assessments[0].is_eligible_for_residual_reduction)
        self.assertEqual(res.effective_rrf, Decimal("0.75"))
        self.assertEqual(res.residual_financial_amount, Decimal("750500.00"))
        self.assertEqual(res.continuous_residual_rating, SeverityCode.H)

    def test_07_proposed_controls_excluded_from_current_rrf(self) -> None:
        """
        7. Verify that a PROPOSED or future control does NOT reduce current residual risk.
        """
        req = ResidualRiskAssessmentRequest(
            risk_id="RSK-PROPOSED-TEST",
            unit_id="BU-SYNDICATED",
            expected_annual_loss=Decimal("2004000"),
            controls=[
                ControlInputRecord(
                    control_id="CTL-IMP-MAN",
                    linked_risk_id="RSK-PROPOSED-TEST",
                    control_description="حفظ الأصول بدواليب تحت الرقابة الثنائية",
                    control_type_raw="Preventive",
                    control_method_raw="Manual",
                    effectiveness_raw="ضابط رقابي يحتاج إلى تطوير",
                    implementation_status=ControlImplementationStatus.IMPLEMENTED,
                ),
                ControlInputRecord(
                    control_id="CTL-PROP-AUTO",
                    linked_risk_id="RSK-PROPOSED-TEST",
                    control_description="مشروع ميكنة الحفظ والأرشفة الإلكترونية الآلية",
                    control_type_raw="Preventive",
                    control_method_raw="Automated",
                    effectiveness_raw="ضابط رقابي فعال",
                    implementation_status=ControlImplementationStatus.PROPOSED,
                ),
            ],
        )
        res = calculate_residual_risk(req)
        self.assertFalse(res.control_assessments[1].is_eligible_for_residual_reduction)
        self.assertEqual(res.effective_rrf, Decimal("0.75"))
        self.assertEqual(res.selected_max_rrf_control_id, "CTL-IMP-MAN")
        self.assertEqual(res.residual_financial_amount, Decimal("501000.00"))

    def test_08_verified_absence_of_controls_gives_zero_rrf(self) -> None:
        """
        8. Verify that when absence of implemented controls is verified, effective_rrf = 0
        and residual_financial_amount equals expected_annual_loss.
        """
        req = ResidualRiskAssessmentRequest(
            risk_id="RSK-NO-CTL",
            unit_id="BU-SYNDICATED",
            expected_annual_loss=Decimal("800000"),
            controls=[],
            verified_no_controls=True,
            control_environment_known=True,
        )
        res = calculate_residual_risk(req)
        self.assertEqual(res.status, ControlAssessmentStatus.COMPUTED)
        self.assertEqual(res.effective_rrf, Decimal("0"))
        self.assertEqual(res.residual_financial_amount, Decimal("800000"))
        self.assertEqual(res.continuous_residual_rating, SeverityCode.H)

    def test_09_unknown_control_implementation_status_returns_pending_input(self) -> None:
        """
        9. Verify that an unknown control environment or unknown control implementation status
        returns PENDING_INPUT rather than assuming effective_rrf = 0.
        """
        # Case A: Unknown control environment with empty list
        req_env_unknown = ResidualRiskAssessmentRequest(
            risk_id="RSK-UNK-ENV",
            unit_id="BU-ACCOUNT",
            expected_annual_loss=Decimal("500000"),
            controls=[],
            verified_no_controls=False,
            control_environment_known=False,
        )
        res_env = calculate_residual_risk(req_env_unknown)
        self.assertEqual(res_env.status, ControlAssessmentStatus.PENDING_INPUT)
        self.assertIsNone(res_env.effective_rrf)
        self.assertIsNone(res_env.residual_financial_amount)

        # Case B: Control with UNKNOWN implementation status
        req_ctrl_unknown = ResidualRiskAssessmentRequest(
            risk_id="RSK-UNK-CTL",
            unit_id="BU-ACCOUNT",
            expected_annual_loss=Decimal("500000"),
            controls=[
                ControlInputRecord(
                    control_id="CTL-UNK",
                    linked_risk_id="RSK-UNK-CTL",
                    control_description="مراجعة مستندات فتح الحساب",
                    control_type_raw="Preventive",
                    control_method_raw="Manual",
                    implementation_status=ControlImplementationStatus.UNKNOWN,
                )
            ],
        )
        res_ctrl = calculate_residual_risk(req_ctrl_unknown)
        self.assertEqual(res_ctrl.status, ControlAssessmentStatus.PENDING_INPUT)
        self.assertIn("CTL-UNK.implementation_status", res_ctrl.missing_fields)

    def test_10_missing_control_type_or_method_returns_pending_input(self) -> None:
        """10. Verify that an implemented control missing type or method returns PENDING_INPUT."""
        req = ResidualRiskAssessmentRequest(
            risk_id="RSK-MISSING-ATTR",
            unit_id="BU-ACCOUNT",
            expected_annual_loss=Decimal("600000"),
            controls=[
                ControlInputRecord(
                    control_id="CTL-NO-METHOD",
                    linked_risk_id="RSK-MISSING-ATTR",
                    control_description="ضابط بدون طريقة تطبيق محددة",
                    control_type_raw="Preventive",
                    control_method_raw=None,
                    implementation_status=ControlImplementationStatus.IMPLEMENTED,
                )
            ],
        )
        res = calculate_residual_risk(req)
        self.assertEqual(res.status, ControlAssessmentStatus.PENDING_INPUT)
        self.assertIn("CTL-NO-METHOD.control_method", res.missing_fields)
        self.assertIsNone(res.residual_financial_amount)

    def test_11_residual_monetary_decimal_precision(self) -> None:
        """11. Verify exact Decimal arithmetic without IEEE-754 floating-point drift."""
        # In IEEE-754 float: 1 - 0.95 = 0.050000000000000044 (as seen in workbook cell EJ889!)
        # With Decimal: Decimal("1") - Decimal("0.95") == Decimal("0.05") exactly.
        res_amt, res_factor = calculate_residual_financial_amount(
            expected_annual_loss=Decimal("1002000"),
            effective_rrf=Decimal("0.95"),
        )
        self.assertEqual(res_factor, Decimal("0.05"))
        self.assertEqual(res_amt, Decimal("50100.00"))

    def test_12_residual_financial_severity_boundaries(self) -> None:
        """12. Verify residual financial severity boundaries for continuous and Excel U-column formulas."""
        boundary_cases = [
            (Decimal("50000"), SeverityCode.L, "L "),
            (Decimal("150000"), SeverityCode.L, "L "),
            (Decimal("150000.50"), SeverityCode.M, ""),  # Integer gap in literal U8 formula
            (Decimal("150001"), SeverityCode.M, "M "),
            (Decimal("500000"), SeverityCode.M, "M "),
            (Decimal("500001"), SeverityCode.H, "H "),
            (Decimal("1500000"), SeverityCode.H, "H "),
            (Decimal("1500001"), SeverityCode.VH, "VHاً "),
            (Decimal("3000000"), SeverityCode.VH, "VHاً "),
            (Decimal("3000001"), SeverityCode.C, "C "),
        ]
        for amt, exp_code, exp_literal_u in boundary_cases:
            _, code, _, literal_u = classify_residual_financial_excel_u(amt)
            self.assertEqual(code, exp_code, f"Continuous mismatch at {amt}")
            self.assertEqual(literal_u, exp_literal_u, f"Literal U8 mismatch at {amt}")

    def test_13_pdf_versus_excel_residual_classification_distinction(self) -> None:
        """
        13. Verify that the PDF Page 6 Residual Reference Table (50k, 151k, 501k, 1,501k)
        is preserved separately from the Excel U-column classification and marked
        UNRESOLVED_METHODOLOGY_THRESHOLD_RULES (ineligible for final risk acceptance).
        """
        # At EGP 50,100 (Risk #1 & Risk #5 residual loss in workbook):
        # Excel U-column classifies 50,100 <= 150,000 as 'L '.
        # PDF Page 6 lists Low=50,000 and Medium=151,000 without interval rules.
        _, u_code, _, literal_u = classify_residual_financial_excel_u(Decimal("50100"))
        pdf_view = build_pdf_page6_residual_reference(Decimal("50100"))

        self.assertEqual(u_code, SeverityCode.L)
        self.assertEqual(literal_u, "L ")
        self.assertIsNone(pdf_view.exact_anchor_match_label)
        self.assertEqual(pdf_view.methodology_status, "UNRESOLVED_METHODOLOGY_THRESHOLD_RULES")
        self.assertFalse(pdf_view.eligible_for_final_risk_acceptance)
        self.assertEqual(
            pdf_view.reference_anchors_egp,
            {
                "Low": Decimal("50000"),
                "Medium": Decimal("151000"),
                "High": Decimal("501000"),
                "Very High": Decimal("1501000"),
            },
        )

    def test_14_incident_linked_to_one_specific_control_not_all_controls(self) -> None:
        """
        14. Verify that an incident or audit finding is linked only to the specific control
        responsible for the failure mechanism, not all controls attached to the risk.
        """
        controls = [
            ControlInputRecord(
                control_id="CTL-SYND-R23",
                linked_risk_id="RSK-SYND-07",
                control_description="حفظ كافة أصول الطلبات وفقا ومدد الحفظ بدواليب مؤمنة تحت الرقابة الثنائية",
                control_type_raw="Preventive",
                control_method_raw="Manual",
            ),
            ControlInputRecord(
                control_id="CTL-SYND-R24",
                linked_risk_id="RSK-SYND-07",
                control_description="حفظ كافة المراسلات الكترونيا بال SHARE FOLDER",
                control_type_raw="Preventive",
                control_method_raw="Semi-Automated",
            ),
            ControlInputRecord(
                control_id="CTL-SYND-R25",
                linked_risk_id="RSK-SYND-07",
                control_description="اجراء جرد دوري ومفاجئ للتحقق من توافر كافة الملفات بالدواليب المؤمنة",
                control_type_raw="Preventive",
                control_method_raw="Manual",
            ),
        ]
        finding = analyze_incident_or_audit_control_gap(
            finding_id="GAP-TEST-101",
            source_type="INCIDENT",
            source_reference_id="INC-SYND-101",
            affected_business_process="حفظ أصول المستندات",
            failure_mechanism="فقد أصول الطلبات الورقية الخاصة بتنفيذ التحويلات",
            controls=controls,
            failure_keywords=["حفظ كافة أصول الطلبات"],
            deficiency_category=ControlDeficiencyCategory.INCOMPLETE_CONTROL_IMPLEMENTATION,
            confirmed_by_audit_or_workbook=True,
        )
        self.assertEqual(finding.linked_control_ids, ["CTL-SYND-R23"])
        self.assertNotIn("CTL-SYND-R24", finding.linked_control_ids)
        self.assertNotIn("CTL-SYND-R25", finding.linked_control_ids)
        self.assertEqual(finding.deficiency_status, ControlDeficiencyStatus.CONFIRMED)

    def test_15_confirmed_vs_suspected_vs_ambiguous_human_review_deficiencies(self) -> None:
        """
        15. Verify confirmed vs suspected deficiencies, and verify that when multiple controls
        match the failure mechanism without disambiguating evidence, HUMAN_REVIEW_REQUIRED is returned.
        """
        controls = [
            ControlInputRecord(
                control_id="CTL-A",
                linked_risk_id="RSK-X",
                control_description="مراجعة مستندات العميل عند الاستلام",
                control_type_raw="Preventive",
                control_method_raw="Manual",
            ),
            ControlInputRecord(
                control_id="CTL-B",
                linked_risk_id="RSK-X",
                control_description="مراجعة مستندات العميل قبل التفعيل",
                control_type_raw="Preventive",
                control_method_raw="Semi-Automated",
            ),
        ]
        # Ambiguous match across CTL-A and CTL-B -> HUMAN_REVIEW_REQUIRED
        ambiguous = analyze_incident_or_audit_control_gap(
            finding_id="GAP-AMB",
            source_type="INCIDENT",
            source_reference_id="INC-ACCT-200",
            affected_business_process="فتح الحسابات",
            failure_mechanism="فتح حساب بمستندات غير صحيحة نتيجة قصور مراجعة مستندات العميل",
            controls=controls,
            failure_keywords=["مراجعة مستندات العميل"],
            confirmed_by_audit_or_workbook=False,
        )
        self.assertEqual(ambiguous.deficiency_status, ControlDeficiencyStatus.HUMAN_REVIEW_REQUIRED)
        self.assertTrue(ambiguous.requires_human_review)
        self.assertEqual(ambiguous.linked_control_ids, ["CTL-A", "CTL-B"])

        # Single control match without audit confirmation -> SUSPECTED
        suspected = analyze_incident_or_audit_control_gap(
            finding_id="GAP-SUSP",
            source_type="INCIDENT",
            source_reference_id="INC-ACCT-200",
            affected_business_process="فتح الحسابات",
            failure_mechanism="قصور مراجعة مستندات العميل عند الاستلام",
            controls=controls,
            failure_keywords=["عند الاستلام"],
            confirmed_by_audit_or_workbook=False,
        )
        self.assertEqual(suspected.deficiency_status, ControlDeficiencyStatus.SUSPECTED)
        self.assertEqual(suspected.linked_control_ids, ["CTL-A"])

    def test_16_missing_source_evidence_returns_unsupported(self) -> None:
        """16. Verify that when source does not support a failure mechanism, UNSUPPORTED is returned."""
        controls = [
            ControlInputRecord(
                control_id="CTL-1",
                linked_risk_id="RSK-1",
                control_description="ضابط رقابي",
                control_type_raw="Preventive",
                control_method_raw="Manual",
            )
        ]
        unsupported = analyze_incident_or_audit_control_gap(
            finding_id="GAP-NONE",
            source_type="INCIDENT",
            source_reference_id="INC-UNKNOWN",
            affected_business_process="عمليات",
            failure_mechanism="   ",
            controls=controls,
        )
        self.assertEqual(unsupported.deficiency_status, ControlDeficiencyStatus.UNSUPPORTED)
        self.assertEqual(unsupported.linked_control_ids, [])
        self.assertTrue(unsupported.requires_human_review)

    def test_17_no_fabricated_control_effectiveness_rating(self) -> None:
        """
        17. Verify that a control with blank/missing effectiveness rating (such as Row 15
        in the Syndicated Loans workbook) remains PENDING_REVIEW and is not confused with NO_CONTROL.
        """
        ctrl = assess_individual_control(
            ControlInputRecord(
                control_id="CTL-SYND-R15",
                linked_risk_id="RSK-SYND-02",
                control_description="مراجعة التقارير المستخرجة من الأنظمة ومطابقتها مع العمليات المنفذة خلال اليوم",
                control_type_raw="ضوابط كاشفة Detective",
                control_method_raw="Semi- Automated",
                effectiveness_raw="",
                implementation_status=ControlImplementationStatus.IMPLEMENTED,
            )
        )
        self.assertEqual(
            ctrl.effectiveness_classification,
            ControlEffectivenessClassification.PENDING_REVIEW,
        )
        self.assertNotEqual(
            ctrl.effectiveness_classification,
            ControlEffectivenessClassification.NO_CONTROL,
        )
        self.assertEqual(ctrl.applicable_rrf, Decimal("0.80"))
        self.assertEqual(ctrl.assessment_status, ControlAssessmentStatus.PENDING_REVIEW)

    def test_18_incomplete_business_unit_handling(self) -> None:
        """
        18. Verify incomplete BU handling for BU-POS, BU-ACCOUNT, BU-BRANCHES, and BU-TRADING:
        - Missing incident/audit files are preserved as MISSING_DOCUMENT (not assumed zero).
        - Missing financial or control inputs return PENDING_INPUT without fabrication.
        """
        # BU-POS has SOP controls but missing expected_annual_loss and missing incident/audit docs
        req_pos = ResidualRiskAssessmentRequest(
            risk_id="RSK-POS-01",
            unit_id="BU-POS",
            process_name="متابعة تركيب وتشغيل ماكينات POS",
            expected_annual_loss=None,
            controls=[
                ControlInputRecord(
                    control_id="CTL-POS-01",
                    linked_risk_id="RSK-POS-01",
                    control_description="المراجعة اليومية لبيان التركيب",
                    control_type_raw="Detective",
                    control_method_raw="Manual",
                    effectiveness_raw=None,
                )
            ],
            incident_Document_status="MISSING_DOCUMENT",
            audit_document_status="MISSING_DOCUMENT",
        )
        res_pos = calculate_residual_risk(req_pos)
        self.assertEqual(res_pos.status, ControlAssessmentStatus.PENDING_INPUT)
        self.assertIn("expected_annual_loss", res_pos.missing_fields)
        self.assertEqual(res_pos.incident_document_status, "MISSING_DOCUMENT")
        self.assertEqual(res_pos.audit_document_status, "MISSING_DOCUMENT")

        # BU-BRANCHES has no initial documents or controls
        req_branches = ResidualRiskAssessmentRequest(
            risk_id="RSK-BR-01",
            unit_id="BU-BRANCHES",
            expected_annual_loss=None,
            controls=[],
            verified_no_controls=False,
            control_environment_known=False,
            incident_Document_status="MISSING_DOCUMENT",
            audit_document_status="MISSING_DOCUMENT",
        )
        res_branches = calculate_residual_risk(req_branches)
        self.assertEqual(res_branches.status, ControlAssessmentStatus.PENDING_INPUT)
        self.assertIsNone(res_branches.effective_rrf)
        self.assertIsNone(res_branches.residual_financial_amount)

    def test_19_compatibility_with_phase2a_and_syndicated_workbook_8_risks_19_controls(self) -> None:
        """
        19. Verify seamless chaining from Phase 2A FinancialInherentResult into Phase 2B,
        and validate all 8 risks (19 controls) in the Syndicated Loans reference workbook.
        """
        # Chain Phase 2A -> Phase 2B for Risk #1 (Row 8)
        p2a_res = calculate_financial_inherent_risk(
            FinancialInherentRequest(
                risk_ref="RSK-SYND-01",
                unit_id="BU-SYNDICATED",
                individual_financial_impact=Decimal("501000"),
                expected_frequency_text="مرة كل نصف سنه",
            )
        )
        self.assertEqual(p2a_res.status, CalculationStatus.COMPUTED)
        self.assertEqual(p2a_res.expected_annual_loss, Decimal("1002000.0"))

        p2b_res = calculate_residual_risk(
            ResidualRiskAssessmentRequest(
                risk_id="RSK-SYND-01",
                unit_id="BU-SYNDICATED",
                phase2a_result=p2a_res,
                controls=[
                    ControlInputRecord(
                        control_id="CTL-SYND-R8",
                        linked_risk_id="RSK-SYND-01",
                        control_description="الكشف عن عناصر التحويل",
                        control_type_raw="Preventive",
                        control_method_raw="Semi- Automated",
                        effectiveness_raw="ضابط رقابي فعال",
                    ),
                    ControlInputRecord(
                        control_id="CTL-SYND-R9",
                        linked_risk_id="RSK-SYND-01",
                        control_description="الكشف آلياً على كافة أطراف التحويل",
                        control_type_raw="Preventive",
                        control_method_raw="Automated",
                        effectiveness_raw="ضابط رقابي فعال",
                    ),
                ],
            )
        )
        self.assertEqual(p2b_res.effective_rrf, Decimal("0.95"))
        self.assertEqual(p2b_res.residual_financial_amount, Decimal("50100.000"))
        self.assertEqual(p2b_res.continuous_residual_rating, SeverityCode.L)

        # Validate all 8 risks and 20 control rows (Rows 8..27) from the authoritative workbook
        wb_rows = validate_syndicated_loans_residual_workbook()
        self.assertEqual(len(wb_rows), 8)
        total_controls = sum(r.evaluated_controls_count for r in wb_rows)
        self.assertEqual(total_controls, 20)

        # Risks 1, 2, 3, 4, 5, 7, 8 match S, T, and U 100%; Risk 6 (Row 21) documents the S21 author discrepancy
        for r in wb_rows:
            self.assertEqual(r.u_rating_status, "PASS", f"U rating failed on row {r.excel_row}")
            if r.excel_row != 21:
                self.assertEqual(r.s_key_status, "PASS", f"S key failed on row {r.excel_row}")
                self.assertEqual(r.t_loss_status, "PASS", f"T loss failed on row {r.excel_row}")
            else:
                self.assertEqual(r.calculated_max_rrf, Decimal("0.80"))
                self.assertEqual(r.calculated_residual_t, Decimal("100200.00"))
                self.assertEqual(r.expected_workbook_t, Decimal("50100"))
                self.assertEqual(r.calculated_u_rating, "L")

    def test_20_preservation_of_phase2a_workbook_regression(self) -> None:
        """20. Verify that Phase 2A financial & inherent calculations remain 100% intact."""
        p2a_comparisons = validate_syndicated_loans_workbook()
        self.assertEqual(len(p2a_comparisons), 8)

    def test_21_risk6_selects_0_80_and_preserves_both_calculated_and_workbook_reference_values(self) -> None:
        """
        21. Final Integrity Check #1 & #2:
        Verify that Risk #6 (Row 21) selects RRF = 0.80 ('Semi Auto / detective') from its
        actual documented controls (Row 21 Manual/Preventive=0.75, Row 22 Semi-Auto/Detective=0.80),
        NOT the manually selected 0.90 ('Semi Auto / preventive') in Excel cell S21,
        and preserves both calculated (T=100,200) and workbook reference (T=50,100) values.
        """
        wb_rows = validate_syndicated_loans_residual_workbook()
        risk6_row = next(r for r in wb_rows if r.excel_row == 21)

        self.assertEqual(risk6_row.selected_control_id, "CTL-SYND-R22")
        self.assertEqual(risk6_row.calculated_max_rrf, Decimal("0.80"))
        self.assertEqual(risk6_row.calculated_rrf_key, "Semi Auto / detective")
        self.assertEqual(risk6_row.calculated_residual_t, Decimal("100200.00"))
        self.assertEqual(risk6_row.calculated_u_rating, "L")

        # Original workbook reference values preserved side-by-side
        self.assertEqual(risk6_row.expected_workbook_rrf, Decimal("0.90"))
        self.assertEqual(risk6_row.expected_workbook_s_key, "Semi Auto / preventive")
        self.assertEqual(risk6_row.expected_workbook_t, Decimal("50100"))
        self.assertEqual(risk6_row.expected_workbook_u_rating, "L")

    def test_22_reusable_evidence_linking_and_separation_of_confirmed_vs_heuristic_vs_ai(self) -> None:
        """
        22. Final Integrity Check #3, #4 & #5:
        - Verify that `link_evidence_records_to_controls` is reusable across any Business Unit
          (tested here on BU-ACCOUNT controls and incidents INC-ACCT-200 & AUD-ACCT-01).
        - Verify strict separation between CONFIRMED_DOCUMENTARY_EVIDENCE, HEURISTIC_CANDIDATE_MATCH,
          and AI_SUGGESTED_CANDIDATE.
        - Verify that an incident does NOT mark every linked control ineffective or overwrite
          any control's effectiveness rating automatically.
        """
        acct_controls = [
            ControlInputRecord(
                control_id="CTL-ACCT-01",
                linked_risk_id="RSK-ACCT-01",
                control_description="مراجعة صلاحية بطاقة الرقم القومي ومستندات إثبات الشخصية عند الاستلام",
                control_type_raw="Preventive",
                control_method_raw="Manual",
                effectiveness_raw="ضابط رقابي فعال",
            ),
            ControlInputRecord(
                control_id="CTL-ACCT-02",
                linked_risk_id="RSK-ACCT-01",
                control_description="الفحص الآلي لقوائم الحظر والمستفيد الحقيقي على النظام",
                control_type_raw="Preventive",
                control_method_raw="Automated",
                effectiveness_raw="ضابط رقابي فعال",
            ),
        ]

        evidence_inputs = [
            # 1. Heuristic keyword match on INC-ACCT-200 (expired national ID) -> SUSPECTED, HEURISTIC_CANDIDATE_MATCH
            IncidentOrAuditEvidenceInput(
                finding_id="FIND-HEURISTIC-ACCT-200",
                unit_id="BU-ACCOUNT",
                source_type="INCIDENT",
                source_reference_id="INC-ACCT-200",
                affected_business_process="فتح الحسابات",
                failure_mechanism="فتح حساب عميل بمستندات غير صحيحة حيث ان بطاقة الرقم القومي منتهية",
                failure_keywords=["بطاقة الرقم القومي"],
            ),
            # 2. AI-suggested candidate link -> SUSPECTED, AI_SUGGESTED_CANDIDATE, requires_human_review=True
            IncidentOrAuditEvidenceInput(
                finding_id="FIND-AI-ACCT-01",
                unit_id="BU-ACCOUNT",
                source_type="AUDIT_FINDING",
                source_reference_id="AUD-ACCT-01",
                affected_business_process="فتح الحسابات",
                failure_mechanism="عدم اكتمال بعض مستندات فتح الحسابات",
                ai_suggested_control_ids=["CTL-ACCT-01"],
            ),
            # 3. Confirmed documentary evidence -> CONFIRMED, CONFIRMED_DOCUMENTARY_EVIDENCE
            IncidentOrAuditEvidenceInput(
                finding_id="FIND-CONFIRMED-DOC-01",
                unit_id="BU-ACCOUNT",
                source_type="AUDIT_FINDING",
                source_reference_id="AUD-ACCT-01",
                affected_business_process="فتح الحسابات",
                failure_mechanism="الاعتماد الجزئي على المراجعة اليدوية للمستندات عند الاستلام",
                explicit_confirmed_control_ids=["CTL-ACCT-01"],
                deficiency_category=ControlDeficiencyCategory.CONTROL_DESIGN_DEFICIENCY,
            ),
        ]

        linked_ctrls, findings = link_evidence_records_to_controls(
            controls=acct_controls,
            evidence_inputs=evidence_inputs,
            sop_keyword_map={"CHK-SOP-ACCT-02": ["بطاقة الرقم القومي"], "CHK-SOP-ACCT-03": ["قوائم الحظر"]},
        )

        self.assertEqual(len(findings), 3)
        # Heuristic finding
        self.assertEqual(findings[0].evidence_link_origin, EvidenceLinkOrigin.HEURISTIC_CANDIDATE_MATCH)
        self.assertEqual(findings[0].deficiency_status, ControlDeficiencyStatus.SUSPECTED)
        self.assertTrue(findings[0].requires_human_review)
        self.assertEqual(findings[0].linked_control_ids, ["CTL-ACCT-01"])

        # AI-suggested finding
        self.assertEqual(findings[1].evidence_link_origin, EvidenceLinkOrigin.AI_SUGGESTED_CANDIDATE)
        self.assertEqual(findings[1].deficiency_status, ControlDeficiencyStatus.SUSPECTED)
        self.assertTrue(findings[1].requires_human_review)
        self.assertEqual(findings[1].linked_control_ids, ["CTL-ACCT-01"])

        # Confirmed documentary finding
        self.assertEqual(findings[2].evidence_link_origin, EvidenceLinkOrigin.CONFIRMED_DOCUMENTARY_EVIDENCE)
        self.assertEqual(findings[2].deficiency_status, ControlDeficiencyStatus.CONFIRMED)
        self.assertFalse(findings[2].requires_human_review)
        self.assertEqual(findings[2].linked_control_ids, ["CTL-ACCT-01"])

        # CTL-ACCT-02 on the same risk was NOT implicated by any of the 3 findings
        self.assertEqual(linked_ctrls[1].deficiencies, [])
        self.assertEqual(linked_ctrls[1].relevant_incident_ids, [])
        # Neither CTL-ACCT-01 nor CTL-ACCT-02 had its effectiveness_raw auto-mutated
        self.assertEqual(linked_ctrls[0].effectiveness_raw, "ضابط رقابي فعال")
        self.assertEqual(linked_ctrls[1].effectiveness_raw, "ضابط رقابي فعال")

    def test_23_p15_pending_review_lifecycle_and_isolated_single_risk_recalculation(self) -> None:
        """
        23. Final Integrity Check #6 & #7:
        - Verify that Row 15 (`CTL-SYND-R15` on Risk #2) remains `PENDING_REVIEW` when loaded
          from the authoritative workbook because cell `P15` is empty.
        - Verify that when an authorized user assessment updates `CTL-SYND-R15` (or updates
          a control on another risk), recalculating the affected risk updates ONLY that risk
          while all other 7 risks in the register remain 100% unchanged.
        """
        loaded = load_syndicated_loans_workbook_requests()
        register_reqs = [item[2] for item in loaded]
        baseline_results = {req.risk_id: calculate_residual_risk(req) for req in register_reqs}

        # Check Risk #2 (RSK-SYND-02) baseline: CTL-SYND-R15 is PENDING_REVIEW
        r2_base = baseline_results["RSK-SYND-02"]
        r15_ctrl = next(c for c in r2_base.control_assessments if c.control_id == "CTL-SYND-R15")
        self.assertEqual(
            r15_ctrl.effectiveness_classification,
            ControlEffectivenessClassification.PENDING_REVIEW,
        )
        self.assertEqual(r15_ctrl.assessment_status, ControlAssessmentStatus.PENDING_REVIEW)
        self.assertEqual(r2_base.status, ControlAssessmentStatus.PENDING_REVIEW)

        # Now supply an authorized user effectiveness assessment for CTL-SYND-R15
        r2_req = next(req for req in register_reqs if req.risk_id == "RSK-SYND-02")
        updated_r2_req, updated_r2_res = update_control_in_risk_and_recalculate(
            request=r2_req,
            control_id="CTL-SYND-R15",
            effectiveness_raw=ControlEffectivenessClassification.EFFECTIVE,
            evidence_reference=EvidenceReference(
                source_file="HUMAN_REVIEW_APPROVAL",
                location="Checker Sign-Off EMP-2002",
                field_name="effectiveness_raw",
                raw_value="ضابط رقابي فعال",
            ),
        )
        r15_updated = next(c for c in updated_r2_res.control_assessments if c.control_id == "CTL-SYND-R15")
        self.assertEqual(
            r15_updated.effectiveness_classification,
            ControlEffectivenessClassification.EFFECTIVE,
        )
        self.assertEqual(r15_updated.assessment_status, ControlAssessmentStatus.COMPUTED)
        self.assertEqual(updated_r2_res.status, ControlAssessmentStatus.COMPUTED)

        # Recalculate across the 8-risk register and verify all other 7 risks are 100% unchanged
        recalculated_register = recalculate_single_risk_in_register(
            register_requests=register_reqs,
            target_risk_id="RSK-SYND-02",
            updated_target_request=updated_r2_req,
        )
        for risk_id, base_res in baseline_results.items():
            if risk_id == "RSK-SYND-02":
                self.assertEqual(recalculated_register[risk_id].status, ControlAssessmentStatus.COMPUTED)
            else:
                self.assertEqual(
                    recalculated_register[risk_id].model_dump(),
                    base_res.model_dump(),
                    f"Unrelated risk {risk_id} changed during isolated recalculation!",
                )


if __name__ == "__main__":
    unittest.main(verbosity=2)

