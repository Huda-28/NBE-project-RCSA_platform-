"""
Phase 2A Targeted Verification & Regression Test Suite — Financial & Inherent Risk Engine.
All expected methodology tables and boundary expectations in this test suite are
independently transcribed from the original Methodology PDF images and workbook cells
rather than imported from engine configuration or JSON files.
"""

from __future__ import annotations

import unittest
from decimal import Decimal

from rcsa_engine import (
    CalculationStatus,
    EvidenceReference,
    FinancialInherentEngine,
    FinancialInherentRequest,
    FinancialValueOrigin,
    FrequencyEvidenceOrigin,
    HeatMapZone,
    IncidentFinancialEvidenceRecord,
    Page6InherentZone,
    SeverityCode,
    WorkbookReconciliationStatus,
    audit_cross_phase_consistency,
    calculate_financial_inherent_risk,
    classify_financial_amount,
    classify_financial_amount_literal_excel,
    detect_financial_value_origin,
    link_incidents_to_risk_by_mechanism,
    lookup_page5_heatmap,
    lookup_page6_inherent_zone,
    normalize_frequency,
    recalculate_single_financial_risk_in_register,
    select_evidence_based_financial_impact,
    update_financial_inherent_input_and_recalculate,
    validate_and_select_frequency,
    validate_syndicated_loans_workbook,
)


class TestPhase2AFinancialInherent(unittest.TestCase):
    """Independent verification tests for Phase 2A Financial & Inherent Risk Engine."""

    def test_1_financial_decimal_boundaries_14_values(self) -> None:
        """
        Verify classification behavior for all 14 required decimal boundary values:
        0, 0.01, 150000, 150000.50, 150001, 500000, 500000.50, 500001,
        1500000, 1500000.50, 1500001, 3000000, 3000000.50, 3000001.
        """
        # 1. Value 0: Rejected as non-positive in continuous classification, "" in literal Excel
        with self.assertRaises(ValueError):
            classify_financial_amount(Decimal("0"))
        self.assertEqual(classify_financial_amount_literal_excel(Decimal("0")), "")

        res_zero = calculate_financial_inherent_risk(
            FinancialInherentRequest(
                risk_ref="BOUNDARY-0",
                individual_financial_impact=Decimal("0"),
                expected_frequency_text="مرة واحدة كل سنة ",
            )
        )
        self.assertEqual(res_zero.status, CalculationStatus.PENDING_INPUT)
        self.assertIn("individual_financial_impact", res_zero.missing_fields)

        # 2. The 13 positive boundary values:
        # (value, expected_continuous_level, expected_continuous_code, expected_literal_excel_l)
        boundary_expectations = [
            (Decimal("0.01"), 1, SeverityCode.L, "L "),
            (Decimal("150000"), 1, SeverityCode.L, "L "),
            (Decimal("150000.50"), 2, SeverityCode.M, ""),       # Continuous=M, Literal Excel="" (gap)
            (Decimal("150001"), 2, SeverityCode.M, "M "),
            (Decimal("500000"), 2, SeverityCode.M, "M "),
            (Decimal("500000.50"), 3, SeverityCode.H, ""),       # Continuous=H, Literal Excel="" (gap)
            (Decimal("500001"), 3, SeverityCode.H, "H "),
            (Decimal("1500000"), 3, SeverityCode.H, "H "),
            (Decimal("1500000.50"), 4, SeverityCode.VH, ""),     # Continuous=VH, Literal Excel="" (gap)
            (Decimal("1500001"), 4, SeverityCode.VH, "VH "),
            (Decimal("3000000"), 4, SeverityCode.VH, "VH "),
            (Decimal("3000000.50"), 5, SeverityCode.C, "C "),    # Both Continuous and Literal Excel="C " (K8>3000000)
            (Decimal("3000001"), 5, SeverityCode.C, "C "),
        ]

        for val, exp_lvl, exp_code, exp_excel_lit in boundary_expectations:
            lvl, code, _, _, _ = classify_financial_amount(val)
            self.assertEqual(lvl, exp_lvl, f"Continuous level mismatch at {val}")
            self.assertEqual(code, exp_code, f"Continuous code mismatch at {val}")

            lit = classify_financial_amount_literal_excel(val)
            self.assertEqual(lit, exp_excel_lit, f"Literal Excel mismatch at {val}")

    def test_2_independent_page6_inherent_matrix_all_25_cells(self) -> None:
        """
        Independently verify all 25 cells of the Page 6 Inherent Risk Matrix against
        the original Methodology PDF Page 6 image (without reading Methodology_Extract_8_Pages.json).
        - Critical impact (5) with least frequent occurrence (1 = سنتان فاكثر) MUST be STANDARD_ZONE (uncolored).
        - Exact staircase of 10 RED cells (Impact + Frequency >= 7) and 15 WHITE/STANDARD cells.
        """
        # Independently transcribed from original Page 6 PDF image:
        # Columns: 1=سنتان فاكثر, 2=سنة, 3=6 شهور, 4=3 شهور, 5=شهر او اقل
        expected_page6_25_cells = {
            (1, 1): Page6InherentZone.STANDARD_ZONE,
            (1, 2): Page6InherentZone.STANDARD_ZONE,
            (1, 3): Page6InherentZone.STANDARD_ZONE,
            (1, 4): Page6InherentZone.STANDARD_ZONE,
            (1, 5): Page6InherentZone.STANDARD_ZONE,
            (2, 1): Page6InherentZone.STANDARD_ZONE,
            (2, 2): Page6InherentZone.STANDARD_ZONE,
            (2, 3): Page6InherentZone.STANDARD_ZONE,
            (2, 4): Page6InherentZone.STANDARD_ZONE,
            (2, 5): Page6InherentZone.RED_ESCALATION_ZONE,
            (3, 1): Page6InherentZone.STANDARD_ZONE,
            (3, 2): Page6InherentZone.STANDARD_ZONE,
            (3, 3): Page6InherentZone.STANDARD_ZONE,
            (3, 4): Page6InherentZone.RED_ESCALATION_ZONE,
            (3, 5): Page6InherentZone.RED_ESCALATION_ZONE,
            (4, 1): Page6InherentZone.STANDARD_ZONE,
            (4, 2): Page6InherentZone.STANDARD_ZONE,
            (4, 3): Page6InherentZone.RED_ESCALATION_ZONE,
            (4, 4): Page6InherentZone.RED_ESCALATION_ZONE,
            (4, 5): Page6InherentZone.RED_ESCALATION_ZONE,
            (5, 1): Page6InherentZone.STANDARD_ZONE,  # Critical impact + least frequent (سنتان فاكثر) is WHITE/UNCOLORED
            (5, 2): Page6InherentZone.RED_ESCALATION_ZONE,
            (5, 3): Page6InherentZone.RED_ESCALATION_ZONE,
            (5, 4): Page6InherentZone.RED_ESCALATION_ZONE,
            (5, 5): Page6InherentZone.RED_ESCALATION_ZONE,
        }

        red_cells = []
        standard_cells = []
        for (imp, freq), exp_zone in expected_page6_25_cells.items():
            actual_zone = lookup_page6_inherent_zone(imp, freq)
            self.assertEqual(
                actual_zone,
                exp_zone,
                f"Page 6 cell (Impact={imp}, Freq={freq}) expected {exp_zone}, got {actual_zone}",
            )
            if actual_zone == Page6InherentZone.RED_ESCALATION_ZONE:
                red_cells.append((imp, freq))
            else:
                standard_cells.append((imp, freq))

        # Explicit check for Critical impact (5) with least frequent occurrence (1)
        self.assertEqual(
            lookup_page6_inherent_zone(5, 1),
            Page6InherentZone.STANDARD_ZONE,
            "Cell (Impact=5 Critical, Frequency=1 Once per 2 years) must be uncolored STANDARD_ZONE per Page 6 PDF image",
        )
        # Exact count of red cells on Page 6 = 4 + 3 + 2 + 1 + 0 = 10
        self.assertEqual(len(red_cells), 10)
        self.assertEqual(len(standard_cells), 15)

    def test_3_independent_page5_heatmap_all_25_cells(self) -> None:
        """
        Independently verify all 25 cells of the Page 5 Financial & Non-Financial Matrix
        against the original Methodology PDF Page 5 image.
        """
        expected_page5_25_cells = {
            (1, 1): (SeverityCode.L, HeatMapZone.GREEN),
            (1, 2): (SeverityCode.L, HeatMapZone.GREEN),
            (1, 3): (SeverityCode.L, HeatMapZone.GREEN),
            (1, 4): (SeverityCode.M, HeatMapZone.YELLOW),
            (1, 5): (SeverityCode.M, HeatMapZone.YELLOW),
            (2, 1): (SeverityCode.L, HeatMapZone.GREEN),
            (2, 2): (SeverityCode.L, HeatMapZone.GREEN),
            (2, 3): (SeverityCode.M, HeatMapZone.YELLOW),
            (2, 4): (SeverityCode.M, HeatMapZone.YELLOW),
            (2, 5): (SeverityCode.H, HeatMapZone.ORANGE),
            (3, 1): (SeverityCode.L, HeatMapZone.GREEN),
            (3, 2): (SeverityCode.M, HeatMapZone.YELLOW),
            (3, 3): (SeverityCode.M, HeatMapZone.YELLOW),
            (3, 4): (SeverityCode.H, HeatMapZone.ORANGE),
            (3, 5): (SeverityCode.VH, HeatMapZone.RED),
            (4, 1): (SeverityCode.M, HeatMapZone.YELLOW),
            (4, 2): (SeverityCode.M, HeatMapZone.YELLOW),
            (4, 3): (SeverityCode.H, HeatMapZone.ORANGE),
            (4, 4): (SeverityCode.VH, HeatMapZone.RED),
            (4, 5): (SeverityCode.VH, HeatMapZone.RED),
            (5, 1): (SeverityCode.M, HeatMapZone.YELLOW),
            (5, 2): (SeverityCode.H, HeatMapZone.ORANGE),
            (5, 3): (SeverityCode.VH, HeatMapZone.RED),
            (5, 4): (SeverityCode.VH, HeatMapZone.RED),
            (5, 5): (SeverityCode.VH, HeatMapZone.RED),
        }

        for (imp, freq), (exp_rating, exp_color) in expected_page5_25_cells.items():
            rating, color = lookup_page5_heatmap(imp, freq)
            self.assertEqual(rating, exp_rating)
            self.assertEqual(color, exp_color)

    def test_4_distinguish_financial_evidence_origins(self) -> None:
        """
        Verify that Bank Template Reference Amounts (50k, 151k, 501k, 1,501k, 3,001k)
        are never mislabeled as Documented Historical Incident losses, and actual
        incident losses (150k, 599k, 100k, 700k, 300k; 1.5k, 600k, 201k, 1k) are
        correctly recognized per Business Unit.
        """
        # 1. Template Reference Anchors (EI880:EI884 & Page 6 table)
        for anchor in [
            Decimal("50000"),
            Decimal("151000"),
            Decimal("501000"),
            Decimal("1501000"),
            Decimal("3001000"),
        ]:
            origin = detect_financial_value_origin(anchor, unit_id="BU-SYNDICATED")
            self.assertEqual(
                origin,
                FinancialValueOrigin.TEMPLATE_REFERENCE_AMOUNT,
                f"Anchor {anchor} must be classified as TEMPLATE_REFERENCE_AMOUNT, never as incident loss",
            )

        # 2. Documented Historical Incidents for BU-SYNDICATED (7725d811.pdf)
        for inc_loss in [
            Decimal("150000"),
            Decimal("599000"),
            Decimal("100000"),
            Decimal("700000"),
            Decimal("300000"),
        ]:
            origin = detect_financial_value_origin(inc_loss, unit_id="BU-SYNDICATED")
            self.assertEqual(origin, FinancialValueOrigin.DOCUMENTED_HISTORICAL_INCIDENT)

        # 3. Documented Historical Incidents for BU-ACCOUNT (95fdf53e.pdf)
        for inc_loss in [
            Decimal("1500"),
            Decimal("600000"),
            Decimal("201000"),
            Decimal("1000"),
        ]:
            origin = detect_financial_value_origin(inc_loss, unit_id="BU-ACCOUNT")
            self.assertEqual(origin, FinancialValueOrigin.DOCUMENTED_HISTORICAL_INCIDENT)

        # 4. Explicit Human Estimate passed by caller
        est_origin = detect_financial_value_origin(
            Decimal("250000"),
            unit_id="BU-POS",
            explicit_origin=FinancialValueOrigin.EXPLICIT_HUMAN_ESTIMATE,
        )
        self.assertEqual(est_origin, FinancialValueOrigin.EXPLICIT_HUMAN_ESTIMATE)

    def test_5_frequency_normalization_and_annualization(self) -> None:
        """Verify Arabic and English frequency normalization and Decimal multipliers."""
        cases = [
            ("مرة كل سنتان ", 1, Decimal("0.5")),
            ("Once per 2 years", 1, Decimal("0.5")),
            ("مرة واحدة كل سنة ", 2, Decimal("1")),
            ("مرة كل سنة", 2, Decimal("1")),
            ("Annually", 2, Decimal("1")),
            ("مرة كل نصف سنه", 3, Decimal("2")),
            ("مرة كل نصف سنة ", 3, Decimal("2")),
            ("مرة كل 6 شهور", 3, Decimal("2")),
            ("مرة كل ربع سنة ", 4, Decimal("4")),
            ("مرة كل 3 شهور", 4, Decimal("4")),
            ("Quarterly", 4, Decimal("4")),
            ("مرة كل شهر ", 5, Decimal("12")),
            ("Monthly", 5, Decimal("12")),
        ]
        for raw, exp_lvl, exp_mult in cases:
            norm = normalize_frequency(freq_text=raw)
            self.assertIsNotNone(norm, f"Failed to normalize {raw!r}")
            assert norm is not None
            lvl, _, _, mult = norm
            self.assertEqual(lvl, exp_lvl)
            self.assertEqual(mult, exp_mult)
            self.assertIsInstance(mult, Decimal)

        self.assertIsNone(normalize_frequency(freq_text=""))
        self.assertIsNone(normalize_frequency(freq_text="غير معروف"))
        self.assertIsNone(normalize_frequency(freq_text=None))

    def test_6_pending_input_when_essential_inputs_missing(self) -> None:
        """Verify PENDING_INPUT status and zero fabrication when impact or frequency is missing."""
        res_both = calculate_financial_inherent_risk(
            FinancialInherentRequest(risk_ref="POS-R1", unit_id="BU-POS")
        )
        self.assertEqual(res_both.status, CalculationStatus.PENDING_INPUT)
        self.assertEqual(
            res_both.missing_fields,
            ["individual_financial_impact", "expected_frequency"],
        )
        self.assertIsNone(res_both.expected_annual_loss)
        self.assertIsNone(res_both.annualized_financial_rating)
        self.assertIsNone(res_both.page5_matrix_rating)

    def test_7_eight_syndicated_loans_workbook_risks_regression_and_origins(self) -> None:
        """
        Verify all 8 risks in the authoritative Syndicated Loans RCSA workbook,
        confirming that every workbook J{row} is identified as TEMPLATE_REFERENCE_AMOUNT
        even when historical incidents are cited in Column AC.
        """
        comparisons = validate_syndicated_loans_workbook()
        self.assertEqual(len(comparisons), 8)

        expected_rows = [
            (8, Decimal("501000"), Decimal("2"), Decimal("1002000"), "H", "M", "STANDARD_ZONE", []),
            (10, Decimal("151000"), Decimal("4"), Decimal("604000"), "H", "M", "STANDARD_ZONE", []),
            (16, Decimal("1501000"), Decimal("1"), Decimal("1501000"), "VH", "M", "STANDARD_ZONE", []),
            (19, Decimal("1501000"), Decimal("2"), Decimal("3002000"), "C", "H", "RED_ESCALATION_ZONE", ["100", "103"]),
            (20, Decimal("501000"), Decimal("1"), Decimal("501000"), "H", "M", "STANDARD_ZONE", []),
            (21, Decimal("501000"), Decimal("1"), Decimal("501000"), "H", "M", "STANDARD_ZONE", []),
            (23, Decimal("501000"), Decimal("4"), Decimal("2004000"), "VH", "H", "RED_ESCALATION_ZONE", ["101", "102"]),
            (26, Decimal("501000"), Decimal("12"), Decimal("6012000"), "C", "VH", "RED_ESCALATION_ZONE", ["106"]),
        ]

        for comp, (row, j_val, mult, k_val, l_val, p5_val, p6_val, inc_ids) in zip(comparisons, expected_rows):
            self.assertEqual(comp.excel_row, row)
            self.assertEqual(comp.individual_financial_impact, j_val)
            self.assertEqual(comp.financial_value_origin, "TEMPLATE_REFERENCE_AMOUNT")
            self.assertEqual(comp.cited_incident_ids, inc_ids)
            self.assertEqual(comp.annual_frequency_multiplier, mult)
            self.assertEqual(comp.expected_workbook_k_loss, k_val)
            self.assertEqual(comp.calculated_k_loss, k_val)
            self.assertEqual(comp.expected_workbook_l_rating, l_val)
            self.assertEqual(comp.calculated_l_rating, l_val)
            self.assertEqual(comp.page5_inherent_matrix_rating, p5_val)
            self.assertEqual(comp.page6_inherent_zone, p6_val)
            self.assertEqual(comp.k_loss_status, "PASS")
            self.assertEqual(comp.l_rating_status, "PASS")

    def test_8_evidence_and_calculation_trace_preservation(self) -> None:
        """Verify that source evidence and 5 calculation trace steps are preserved."""
        engine = FinancialInherentEngine()
        ev = EvidenceReference(
            source_file="reference_data/Official_RCSA_Template__1_Risk_Profile.json",
            location="Risk Profile!J23",
            field_name="individual_financial_impact",
            raw_value="501000",
        )
        res = engine.evaluate(
            FinancialInherentRequest(
                risk_ref="Risk #7 (Row 23)",
                unit_id="BU-SYNDICATED",
                individual_financial_impact="501000",
                expected_frequency_text="مرة كل ربع سنة ",
                source_evidence=[ev],
            )
        )
        self.assertEqual(res.status, CalculationStatus.COMPUTED)
        self.assertEqual(res.financial_value_origin, FinancialValueOrigin.TEMPLATE_REFERENCE_AMOUNT)
        self.assertEqual(len(res.source_evidence), 1)
        self.assertEqual(len(res.calculation_trace), 5)


    def test_9_relevant_vs_unrelated_incident_losses_and_multiple_incidents_max_no_summation(self) -> None:
        """
        Verify Phase 2A.1 Section 2 & 8:
        - Relevant vs. unrelated incident losses in the same Business Unit (never link merely by BU).
        - Multiple incidents linked to one risk (select MAX individual loss, never sum losses).
        - Preserving original approved/template estimate while identifying highest incident loss as proposed_evidence_amount.
        """
        # 1. Risk #4 (Row 19): Operational disbursement/utilization error before guarantee validation
        # Should link to INC-SYND-100 (150,000) and INC-SYND-103 (700,000), and NOT link to
        # INC-SYND-101/102 (system glitch in repayment schedules) or INC-SYND-106 (collateral valuation).
        linked_r19, rejected_r19 = link_incidents_to_risk_by_mechanism(
            unit_id="BU-SYNDICATED",
            process_name="مرحلة الصرف و الاستخدام ",
            risk_description="خطأ تشغيلي ناتج عن الإهمال في الصرف قبل التحقق من صحة الضمانات أو استيفاء الشروط",
            explicit_linked_incident_ids=["100", "103"],
        )
        linked_ids = [inc.incident_id for inc in linked_r19]
        self.assertEqual(linked_ids, ["INC-SYND-100", "INC-SYND-103"])
        self.assertEqual(len(rejected_r19), 3)  # 101, 102, 106 rejected as different failure mechanisms

        # 2. When no template/approved override is supplied, select MAX individual loss (700,000), NEVER sum (850,000)
        res_evidence_only = calculate_financial_inherent_risk(
            FinancialInherentRequest(
                risk_ref="RSK-SYND-04-EVIDENCE-ONLY",
                risk_id="RSK-SYND-04",
                unit_id="BU-SYNDICATED",
                process_name="مرحلة الصرف و الاستخدام ",
                risk_description="خطأ تشغيلي ناتج عن الإهمال في الصرف قبل التحقق من صحة الضمانات أو استيفاء الشروط",
                explicit_linked_incident_ids=["100", "103"],
                expected_frequency_text="مرة كل نصف سنه",
            )
        )
        self.assertEqual(res_evidence_only.status, CalculationStatus.COMPUTED)
        self.assertEqual(res_evidence_only.individual_financial_impact, Decimal("700000"))
        self.assertNotEqual(res_evidence_only.individual_financial_impact, Decimal("850000"))  # Never sum 150k + 700k
        self.assertEqual(res_evidence_only.financial_value_origin, FinancialValueOrigin.HIGHEST_RELEVANT_INCIDENT_LOSS)
        self.assertEqual(res_evidence_only.individual_impact_rating, SeverityCode.H)
        self.assertEqual(res_evidence_only.expected_annual_loss, Decimal("1400000"))
        self.assertEqual(res_evidence_only.annualized_financial_rating, SeverityCode.H)

        # 3. When workbook template estimate (1,501,000) IS supplied alongside incidents 100 & 103,
        # preserve 1,501,000 as original_amount without silently replacing it, and expose 700,000 as proposed_evidence_amount
        res_with_template = calculate_financial_inherent_risk(
            FinancialInherentRequest(
                risk_ref="RSK-SYND-04-WORKBOOK",
                risk_id="RSK-SYND-04",
                unit_id="BU-SYNDICATED",
                process_name="مرحلة الصرف و الاستخدام ",
                risk_description="خطأ تشغيلي ناتج عن الإهمال في الصرف قبل التحقق من صحة الضمانات أو استيفاء الشروط",
                individual_financial_impact=Decimal("1501000"),
                explicit_linked_incident_ids=["100", "103"],
                expected_frequency_text="مرة كل نصف سنه",
                workbook_cached_k_loss=Decimal("3002000"),
                workbook_cached_l_rating="C ",
                workbook_ac_rationale="وقوع حدث تشغيلي خاص بالصرف بتاثير مالي كبير (100 - 103)",
                source_evidence=[
                    EvidenceReference(
                        source_file="reference_data/Official_RCSA_Template__1_Risk_Profile.json",
                        location="Risk Profile!J19",
                        field_name="individual_financial_impact",
                        raw_value="1501000",
                    )
                ],
            )
        )
        self.assertEqual(res_with_template.individual_financial_impact, Decimal("1501000"))
        self.assertEqual(res_with_template.impact_selection_decision.original_amount, Decimal("1501000"))
        self.assertEqual(res_with_template.proposed_evidence_impact_egp, Decimal("700000"))
        self.assertEqual(res_with_template.financial_value_origin, FinancialValueOrigin.TEMPLATE_REFERENCE_AMOUNT)
        self.assertTrue(res_with_template.requires_reviewer_clarification)
        self.assertEqual(
            res_with_template.workbook_reconciliation_status,
            WorkbookReconciliationStatus.REQUIRES_REVIEW.value,
        )

        # 4. Unrelated Risk in same Business Unit (Risk #1: Credit study inaccuracy) with NO cited incidents
        # must NOT pull in INC-SYND-100/101/102/103/106 merely because unit_id == BU-SYNDICATED
        res_unrelated = calculate_financial_inherent_risk(
            FinancialInherentRequest(
                risk_ref="RSK-SYND-01-NO-OVERRIDE",
                risk_id="RSK-SYND-01",
                unit_id="BU-SYNDICATED",
                process_name="مرحلة الدراسة الائتمانية",
                risk_description="عدم دقة الدراسة الائتمانية للعميل والقصور في تقدير الجدارة الائتمانية",
                expected_frequency_text="مرة كل نصف سنه",
            )
        )
        self.assertEqual(res_unrelated.status, CalculationStatus.PENDING_INPUT)
        self.assertEqual(res_unrelated.financial_value_origin, FinancialValueOrigin.MISSING_OR_UNSUPPORTED)
        self.assertEqual(len(res_unrelated.linked_incident_ids), 0)
        self.assertEqual(len(res_unrelated.excluded_unrelated_incident_ids), 5)

    def test_10_no_false_origin_inference_on_numerical_match(self) -> None:
        """
        Verify Phase 2A.1 Section 2:
        Do NOT infer TEMPLATE_REFERENCE_AMOUNT merely because a number matches 151,000, 501,000,
        or 1,501,000 when explicit provenance (EXPLICIT_HUMAN_ESTIMATE or DOCUMENTED_HISTORICAL_INCIDENT) is given.
        """
        # Human estimate that happens to equal 501,000 EGP
        res_human = calculate_financial_inherent_risk(
            FinancialInherentRequest(
                risk_ref="HUMAN-501K",
                unit_id="BU-SYNDICATED",
                individual_financial_impact=Decimal("501000"),
                financial_value_origin=FinancialValueOrigin.EXPLICIT_HUMAN_ESTIMATE,
                expected_frequency_text="مرة واحدة كل سنة ",
            )
        )
        self.assertEqual(res_human.financial_value_origin, FinancialValueOrigin.EXPLICIT_HUMAN_ESTIMATE)

        # Documented incident that happens to equal 151,000 EGP
        inc_151k = IncidentFinancialEvidenceRecord(
            incident_id="INC-CUSTOM-151K",
            incident_code="151K",
            unit_id="BU-ACCOUNT",
            process_name="فتح الحساب",
            event_summary_ar="حادث موثق بقيمة 151000 جنيه",
            incident_detail_ar="تفاصيل الحادث الموثق لفتح الحساب",
            failure_mechanism_keywords=["فتح الحساب"],
            net_loss_amount=Decimal("151000"),
            source_document_id="custom_incident_log.pdf",
        )
        decision = select_evidence_based_financial_impact(
            unit_id="BU-ACCOUNT",
            process_name="فتح الحساب",
            risk_description="خطأ في فتح الحساب",
            provided_amount=Decimal("151000"),
            explicit_origin=FinancialValueOrigin.DOCUMENTED_HISTORICAL_INCIDENT,
            candidate_incidents=[inc_151k],
        )
        self.assertEqual(decision.selected_amount_origin, FinancialValueOrigin.DOCUMENTED_HISTORICAL_INCIDENT)
        self.assertEqual(decision.selected_amount, Decimal("151000"))

    def test_11_frequency_validation_inadequate_observation_history_and_missing_incidents(self) -> None:
        """
        Verify Phase 2A.1 Section 3 & 8:
        - Do not derive frequency from incident count alone without a valid observation period and supporting reasoning.
        - Do not treat missing incidents (MISSING_DOCUMENT or 0 incidents) as zero occurrence probability.
        - Return PENDING_INPUT when essential frequency evidence is unavailable.
        """
        # 1. Incident count provided WITHOUT observation_period_years or supporting reasoning -> REJECTED
        freq_decision_no_window = validate_and_select_frequency(
            observed_incident_count=2,
            observation_period_years=None,
            supporting_reasoning=None,
        )
        self.assertEqual(freq_decision_no_window.frequency_origin, FrequencyEvidenceOrigin.FREQUENCY_REQUIRING_REVIEW)
        self.assertIsNone(freq_decision_no_window.annual_frequency_multiplier)
        self.assertFalse(freq_decision_no_window.is_valid_for_calculation)
        self.assertTrue(freq_decision_no_window.requires_reviewer_clarification)

        res_inadequate_freq = calculate_financial_inherent_risk(
            FinancialInherentRequest(
                risk_ref="FREQ-INADEQUATE-HISTORY",
                unit_id="BU-SYNDICATED",
                individual_financial_impact=Decimal("500000"),
                financial_value_origin=FinancialValueOrigin.EXPLICIT_HUMAN_ESTIMATE,
                observed_incident_count=2,
                # Missing observation_period_years and frequency_supporting_reasoning!
            )
        )
        self.assertEqual(res_inadequate_freq.status, CalculationStatus.PENDING_INPUT)
        self.assertEqual(res_inadequate_freq.frequency_origin, FrequencyEvidenceOrigin.FREQUENCY_REQUIRING_REVIEW)
        self.assertTrue(res_inadequate_freq.requires_reviewer_clarification)

        # 2. Missing incident document (e.g., BU-POS) or 0 incidents must NEVER produce 0 multiplier or fabricate frequency
        res_pos_missing = calculate_financial_inherent_risk(
            FinancialInherentRequest(
                risk_ref="POS-NO-INCIDENT-DOC",
                unit_id="BU-POS",
                individual_financial_impact=Decimal("300000"),
                financial_value_origin=FinancialValueOrigin.EXPLICIT_HUMAN_ESTIMATE,
                observed_incident_count=0,
                observation_period_years=Decimal("1"),
                incidents_document_status="MISSING_DOCUMENT",
            )
        )
        self.assertEqual(res_pos_missing.status, CalculationStatus.PENDING_INPUT)
        self.assertIsNone(res_pos_missing.annual_frequency_multiplier)
        self.assertIn(
            "لا يجوز اعتبار عدم وجود حوادث أو فقدان سجل الحوادث مساوياً لاحتمالية حدوث صفرية",
            res_pos_missing.frequency_validation_decision.validation_rationale,
        )

        # 3. Valid observation window + reasoning + authorized estimate -> COMPUTED with AUTHORIZED_USER_ESTIMATE
        res_valid_freq = calculate_financial_inherent_risk(
            FinancialInherentRequest(
                risk_ref="FREQ-VALID-AUTHORIZED",
                unit_id="BU-SYNDICATED",
                individual_financial_impact=Decimal("500000"),
                financial_value_origin=FinancialValueOrigin.EXPLICIT_HUMAN_ESTIMATE,
                expected_frequency_level=3,  # Half-Yearly (multiplier 2)
                frequency_origin=FrequencyEvidenceOrigin.AUTHORIZED_USER_ESTIMATE,
                observed_incident_count=2,
                observation_period_years=Decimal("1.0"),
                frequency_supporting_reasoning="حدثان موثقان خلال فترة رصد سنة كاملة مع ثبات حجم العمليات",
            )
        )
        self.assertEqual(res_valid_freq.status, CalculationStatus.COMPUTED)
        self.assertEqual(res_valid_freq.frequency_origin, FrequencyEvidenceOrigin.AUTHORIZED_USER_ESTIMATE)
        self.assertEqual(res_valid_freq.annual_frequency_multiplier, Decimal("2"))

    def test_12_eight_risk_workbook_reconciliation_and_row_19_discrepancy(self) -> None:
        """
        Verify Phase 2A.1 Section 5 & 8:
        - All 8 Syndicated Loans risks reconciled with stable Risk IDs (RSK-SYND-01..08),
          merged-cell row spans, literal K/L formulas, and reconciliation status.
        - Row 19 (RSK-SYND-04) specifically flagged as REQUIRES_REVIEW with:
          * J19 = 1,501,000 (TEMPLATE_REFERENCE_AMOUNT from EI883)
          * Highest relevant incident loss = 700,000 (INC-SYND-103) from [100 (150k), 103 (700k)]
          * K19 = 3,002,000 (L19 = 'C ') vs evidence-based annual loss = 1,400,000 ('H')
          * AC19 narrative 'بتاثير مالي كبير' matching 'H'
        """
        comparisons = validate_syndicated_loans_workbook()
        self.assertEqual(len(comparisons), 8)

        expected_meta = [
            ("RSK-SYND-01", 8, [8, 9], None, WorkbookReconciliationStatus.MATCH.value),
            ("RSK-SYND-02", 10, [10, 11, 12, 13, 14, 15], None, WorkbookReconciliationStatus.MATCH.value),
            ("RSK-SYND-03", 16, [16, 17, 18], None, WorkbookReconciliationStatus.MATCH.value),
            ("RSK-SYND-04", 19, [19], Decimal("700000"), WorkbookReconciliationStatus.REQUIRES_REVIEW.value),
            ("RSK-SYND-05", 20, [20], None, WorkbookReconciliationStatus.MATCH.value),
            ("RSK-SYND-06", 21, [21, 22], None, WorkbookReconciliationStatus.MATCH.value),
            ("RSK-SYND-07", 23, [23, 24, 25], Decimal("599000"), WorkbookReconciliationStatus.EXPLAINED_DIFFERENCE.value),
            ("RSK-SYND-08", 26, [26, 27], Decimal("300000"), WorkbookReconciliationStatus.EXPLAINED_DIFFERENCE.value),
        ]

        for comp, (risk_id, row, span, max_inc_loss, rec_status) in zip(comparisons, expected_meta):
            self.assertEqual(comp.stable_risk_id, risk_id)
            self.assertEqual(comp.excel_row, row)
            self.assertEqual(comp.merged_row_span, span)
            self.assertEqual(comp.highest_relevant_incident_loss_egp, max_inc_loss)
            self.assertEqual(comp.reconciliation_status, rec_status)
            self.assertTrue(comp.workbook_k_formula.startswith("IF("))
            self.assertTrue(comp.workbook_l_formula.startswith("IF(AND("))

        # Detailed verification of Row 19 (RSK-SYND-04)
        r19 = comparisons[3]
        self.assertEqual(r19.stable_risk_id, "RSK-SYND-04")
        self.assertEqual(r19.individual_financial_impact, Decimal("1501000"))
        self.assertEqual(r19.highest_relevant_incident_loss_egp, Decimal("700000"))
        self.assertEqual(r19.highest_relevant_incident_id, "INC-SYND-103")
        self.assertEqual(r19.evidence_based_annual_loss_egp, Decimal("1400000"))
        self.assertEqual(r19.evidence_based_annual_rating, "H")
        self.assertEqual(r19.expected_workbook_k_loss, Decimal("3002000"))
        self.assertEqual(r19.expected_workbook_l_rating, "C")
        self.assertEqual(r19.page5_inherent_matrix_rating, "H")
        self.assertIn("بتاثير مالي كبير", r19.disagreement_reason)

    def test_13_cross_phase_consistency_audit_and_isolated_recalculation(self) -> None:
        """
        Verify Phase 2A.1 Section 6, 7 & 8:
        - Cross-phase consistency audit for Discrepancies A (Risk #1), B (Risk #2 / P15), and C (BU-POS).
        - Single-risk financial recalculation without altering other risks in a register.
        """
        audit = audit_cross_phase_consistency()

        # Discrepancy A: Risk #1 (Rows 8..9) has P8 Effective (0.90) and P9 Effective (0.95) -> MAX RRF = 0.95
        disc_a = audit["risk_1"]
        self.assertEqual(disc_a["ctl_r8_rrf"], Decimal("0.90"))
        self.assertEqual(disc_a["ctl_r9_rrf"], Decimal("0.95"))
        self.assertEqual(disc_a["selected_max_rrf"], Decimal("0.95"))
        self.assertEqual(disc_a["residual_loss_egp"], Decimal("50100.00"))

        # Discrepancy B: Risk #2 (Rows 10..15) has blank P15 (CTL-SYND-R15, RRF 0.80, ineligible while PENDING_REVIEW)
        disc_b = audit["risk_2"]
        self.assertFalse(disc_b["p15_present_in_workbook"])
        self.assertEqual(disc_b["ctl_r15_theoretical_rrf"], Decimal("0.80"))
        self.assertFalse(disc_b["ctl_r15_eligible_before_review"])
        self.assertEqual(disc_b["risk2_status_before_review"], "PENDING_REVIEW")
        self.assertEqual(disc_b["risk2_max_rrf_before_review"], Decimal("0.95"))
        self.assertTrue(disc_b["ctl_r15_eligible_after_review"])
        self.assertEqual(disc_b["risk2_status_after_review"], "COMPUTED")
        self.assertEqual(disc_b["risk2_max_rrf_after_review"], Decimal("0.95"))

        # Discrepancy C: BU-POS is strictly MISSING_DOCUMENT across TS and Python
        disc_c = audit["bu_pos"]
        self.assertEqual(disc_c["incidents_status"], "MISSING_DOCUMENT")
        self.assertEqual(disc_c["audit_findings_status"], "MISSING_DOCUMENT")

        # Isolated single-risk financial recalculation in a multi-risk register
        req_r1 = FinancialInherentRequest(
            risk_ref="Risk #1 (Row 8)",
            risk_id="RSK-SYND-01",
            unit_id="BU-SYNDICATED",
            individual_financial_impact=Decimal("501000"),
            financial_value_origin=FinancialValueOrigin.TEMPLATE_REFERENCE_AMOUNT,
            expected_frequency_text="مرة كل نصف سنه",
        )
        req_r4 = FinancialInherentRequest(
            risk_ref="Risk #4 (Row 19)",
            risk_id="RSK-SYND-04",
            unit_id="BU-SYNDICATED",
            process_name="مرحلة الصرف و الاستخدام ",
            risk_description="خطأ تشغيلي ناتج عن الإهمال في الصرف قبل التحقق من صحة الضمانات أو استيفاء الشروط",
            individual_financial_impact=Decimal("1501000"),
            financial_value_origin=FinancialValueOrigin.TEMPLATE_REFERENCE_AMOUNT,
            explicit_linked_incident_ids=["100", "103"],
            expected_frequency_text="مرة كل نصف سنه",
        )
        reqs = [req_r1, req_r4]
        initial_r1 = calculate_financial_inherent_risk(req_r1)
        initial_r4 = calculate_financial_inherent_risk(req_r4)
        self.assertEqual(initial_r1.expected_annual_loss, Decimal("1002000"))
        self.assertEqual(initial_r4.expected_annual_loss, Decimal("3002000"))

        # Reviewer updates RSK-SYND-04 to use the 700,000 EGP highest incident loss
        updated_r4_req, _ = update_financial_inherent_input_and_recalculate(
            request=req_r4,
            individual_financial_impact=Decimal("700000"),
            financial_value_origin=FinancialValueOrigin.HIGHEST_RELEVANT_INCIDENT_LOSS,
        )
        updated_map = recalculate_single_financial_risk_in_register(
            register_requests=reqs,
            target_risk_id="RSK-SYND-04",
            updated_target_request=updated_r4_req,
        )
        # RSK-SYND-01 is untouched (same values)
        self.assertEqual(updated_map["RSK-SYND-01"].expected_annual_loss, Decimal("1002000"))
        self.assertEqual(updated_map["RSK-SYND-01"].annualized_financial_rating, SeverityCode.H)
        # RSK-SYND-04 is recalculated to 1,400,000 EGP ('H')
        self.assertEqual(updated_map["RSK-SYND-04"].individual_financial_impact, Decimal("700000"))
        self.assertEqual(updated_map["RSK-SYND-04"].expected_annual_loss, Decimal("1400000"))
        self.assertEqual(updated_map["RSK-SYND-04"].annualized_financial_rating, SeverityCode.H)


def test_pytest_phase2a_independent_suite() -> None:
    suite = TestPhase2AFinancialInherent()
    suite.test_1_financial_decimal_boundaries_14_values()
    suite.test_2_independent_page6_inherent_matrix_all_25_cells()
    suite.test_3_independent_page5_heatmap_all_25_cells()
    suite.test_4_distinguish_financial_evidence_origins()
    suite.test_5_frequency_normalization_and_annualization()
    suite.test_6_pending_input_when_essential_inputs_missing()
    suite.test_7_eight_syndicated_loans_workbook_risks_regression_and_origins()
    suite.test_8_evidence_and_calculation_trace_preservation()
    suite.test_9_relevant_vs_unrelated_incident_losses_and_multiple_incidents_max_no_summation()
    suite.test_10_no_false_origin_inference_on_numerical_match()
    suite.test_11_frequency_validation_inadequate_observation_history_and_missing_incidents()
    suite.test_12_eight_risk_workbook_reconciliation_and_row_19_discrepancy()
    suite.test_13_cross_phase_consistency_audit_and_isolated_recalculation()


if __name__ == "__main__":
    unittest.main(verbosity=2)

