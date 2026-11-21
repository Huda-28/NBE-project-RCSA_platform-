"""
Authoritative Python CLI Bridge for Phase 2D — Human-in-the-Loop RCSA Review & Edit Workflow.

Provides deterministic JSON-over-stdio execution of:
1. initialize_unit_packages: Assembles full HITL review packages for a Business Unit from
   registered reference data and SQLite evidence bundles.
2. recalculate_single_risk: Re-runs Phase 2A (Financial & Inherent), Phase 2B (Control & Residual),
   and Phase 2B.1/2B.2 (Semantic Quality, Rationale, Corrective Action & Consistency) for a
   SINGLE target risk without touching unrelated risks.
"""

from __future__ import annotations

import json
import sys
from decimal import Decimal
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional

from rcsa_engine.control_residual import (
    DEFAULT_WORKBOOK_PATH,
    WORKBOOK_KEY_TO_RRF,
    load_syndicated_loans_workbook_requests,
)
from rcsa_engine.models import (
    BaseModel,
    ControlDeficiencyCategory,
    ControlEffectivenessClassification,
    ControlImplementationStatus,
    ControlInputRecord,
    EvidenceReference,
    FinancialInherentRequest,
    FinancialValueOrigin,
    FrequencyEvidenceOrigin,
    IncidentOrAuditEvidenceInput,
    ResidualRiskAssessmentRequest,
    SuggestionReviewStatus,
)
from rcsa_engine.semantic_intelligence import (
    build_account_opening_candidate_review_package,
    build_hitl_review_package_for_risk,
    link_evidence_records_to_controls,
    load_dynamic_evidence_bundle,
)


def to_serializable(obj: Any) -> Any:
    """Recursively convert BaseModel, Decimal, Enum, Set, and Path objects into JSON-safe primitives."""
    if obj is None:
        return None
    if isinstance(obj, Enum):
        return obj.value
    if isinstance(obj, (bool, int, float, str)):
        return obj
    if isinstance(obj, Decimal):
        # Preserve exact numeric representation; also convert integral decimals cleanly
        if obj == obj.to_integral_value():
            return int(obj)
        return float(obj)
    if isinstance(obj, Path):
        return str(obj)
    if isinstance(obj, BaseModel):
        return to_serializable(obj.model_dump())
    if isinstance(obj, dict):
        return {str(k): to_serializable(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple, set)):
        return [to_serializable(x) for x in obj]
    if hasattr(obj, "__dict__"):
        return to_serializable(vars(obj))
    return str(obj)


EXPLICIT_INCIDENTS_BY_SYND_RISK: Dict[str, List[str]] = {
    "RSK-SYND-01": [],
    "RSK-SYND-02": [],
    "RSK-SYND-03": [],
    "RSK-SYND-04": ["100", "103"],
    "RSK-SYND-05": [],
    "RSK-SYND-06": [],
    "RSK-SYND-07": ["101", "102"],
    "RSK-SYND-08": ["106"],
}


def _build_source_discrepancies_for_package(
    pkg: Any,
    workbook_cells: Dict[str, str],
    excel_row: Optional[int],
    control_rows: List[int],
) -> List[Dict[str, Any]]:
    """
    Build structured source discrepancy warnings for reviewer inspection (Phase 2D Section 6):
    1. Risk #1 workbook financial source differences.
    2. Risk #6 workbook manual RRF (0.90) vs calculated RRF (0.80).
    3. Risk #7 partial-scope control CTL-SYND-R24 (Share Folder electronic vs physical documents).
    4. Risk #2 missing P15 control-effectiveness rating (PENDING_REVIEW).
    5. Financial impact values that differ from linked incident losses (Risk #4, Risk #7, Risk #8).
    6. Missing source documents vs confirmed zero values.
    """
    discrepancies: List[Dict[str, Any]] = []
    r_id = pkg.risk_id
    r_str = str(excel_row) if excel_row is not None else ""
    p2a_res = pkg.phase2a_result
    p2b_res = pkg.phase2b_result

    # 1. Risk #1 workbook financial source / rationale narrative difference
    if r_id == "RSK-SYND-01":
        discrepancies.append({
            "discrepancy_id": "DISC-RSK-SYND-01-FIN-NARRATIVE",
            "risk_id": r_id,
            "category": "WORKBOOK_FINANCIAL_SOURCE_DIFFERENCE",
            "severity": "MATERIAL_WARNING",
            "title_ar": "ملاحظة المصدر المالي للمخاطرة رقم 1 (صف 8–9)",
            "description_ar": (
                "القيمة المرجعية للأثر المالي الفردي في J8 هي 501,000 ج.م (شريحة H) بتكرار نصف سنوي (×2) "
                "وخسارة سنوية متوقعة K8 = 1,002,000 ج.م (تصنيف L8 = H)، بينما يذكر التبرير الأصلي في AC8 "
                "'بتأثير مالي منخفض' دون فصل بين الأثر المتلازم المرتفع والأثر المتبقي المنخفض (50,100 ج.م بعد RRF=0.95)."
            ),
            "original_source_value": {
                "J8_individual_egp": 501000,
                "K8_annual_egp": 1002000,
                "L8_rating": "H",
                "AC8_text": workbook_cells.get("AC8", ""),
            },
            "calculated_value": {
                "individual_impact_egp": to_serializable(p2a_res.individual_financial_impact),
                "expected_annual_loss_egp": to_serializable(p2a_res.expected_annual_loss),
                "inherent_rating": to_serializable(p2a_res.annualized_financial_rating),
                "residual_loss_egp": to_serializable(p2b_res.residual_financial_amount),
                "residual_rating": to_serializable(p2b_res.continuous_residual_rating),
            },
            "requires_human_decision": True,
            "recommended_action_ar": "مراجعة واعتماد نص الأساس المنطقي المصحح الذي يفصل بوضوح بين الخطر المتلازم والخطر المتبقي.",
        })

    # 2. Risk #6 (and general) workbook manual S-column RRF vs calculated MAX RRF from actual controls
    if r_str and f"S{r_str}" in workbook_cells:
        wb_s_key = workbook_cells.get(f"S{r_str}", "").strip()
        wb_rrf = WORKBOOK_KEY_TO_RRF.get(wb_s_key.lower(), Decimal("0"))
        wb_t_raw = workbook_cells.get(f"T{r_str}", "0").strip()
        wb_t = Decimal(wb_t_raw) if wb_t_raw.replace(".", "", 1).isdigit() else Decimal("0")
        wb_u = workbook_cells.get(f"U{r_str}", "").strip()

        calc_rrf = p2b_res.effective_rrf
        calc_s_key = p2b_res.selected_workbook_rrf_key or ""
        if calc_rrf is not None and wb_rrf != calc_rrf:
            discrepancies.append({
                "discrepancy_id": f"DISC-{r_id}-RRF-MISMATCH",
                "risk_id": r_id,
                "category": "WORKBOOK_MANUAL_RRF_VS_CALCULATED_RRF",
                "severity": "CRITICAL_DISCREPANCY",
                "title_ar": f"اختلاف معامل الخفض اليدوي في الإكسيل (S{r_str}={wb_rrf}) عن المحسوب من الضوابط الفعلية ({calc_rrf})",
                "description_ar": (
                    f"في ملف الإكسيل المرجعي، تم اختيار '{wb_s_key}' يدوياً في الخلية S{r_str} (معامل خفض {wb_rrf} وصافي متبقٍ T{r_str}={wb_t:,.0f} ج.م)، "
                    f"بينما الضوابط الفعلية المسجلة للمخاطرة هي فقط ({'، '.join(c.control_id for c in p2b_res.control_assessments)}) "
                    f"وأعلى معامل خفض فعلي مؤهل هو {calc_rrf} ({calc_s_key} من {p2b_res.selected_max_rrf_control_id}) "
                    f"بصافي خطر متبقٍ محسوب {p2b_res.residual_financial_amount:,.0f} ج.م."
                ),
                "original_source_value": {
                    "cell_S": wb_s_key,
                    "workbook_rrf": to_serializable(wb_rrf),
                    "cell_T_residual_egp": to_serializable(wb_t),
                    "cell_U_rating": wb_u,
                },
                "calculated_value": {
                    "selected_control_id": p2b_res.selected_max_rrf_control_id,
                    "selected_rrf_key": calc_s_key,
                    "calculated_max_rrf": to_serializable(calc_rrf),
                    "calculated_residual_egp": to_serializable(p2b_res.residual_financial_amount),
                    "calculated_residual_rating": to_serializable(p2b_res.continuous_residual_rating),
                },
                "requires_human_decision": True,
                "recommended_action_ar": f"اعتماد القيمة المحسوبة آلياً من الضوابط الفعلية (MAX RRF = {calc_rrf}، صافي المتبقي = {p2b_res.residual_financial_amount:,.0f} ج.م) مع حفظ قيمة الإكسيل المرجعية في سجل المطابقة.",
            })

    # 3. Partial-scope control CTL-SYND-R24 on Risk #7
    for ctrl_res in p2b_res.control_assessments:
        if ctrl_res.control_id == "CTL-SYND-R24" or ctrl_res.scope_requires_human_review or (
            ctrl_res.scope_relevance and "PARTIALLY_RELEVANT" in str(ctrl_res.scope_relevance)
        ):
            is_currently_eligible = ctrl_res.is_eligible_for_residual_reduction
            discrepancies.append({
                "discrepancy_id": f"DISC-{r_id}-{ctrl_res.control_id}-PARTIAL-SCOPE",
                "risk_id": r_id,
                "control_id": ctrl_res.control_id,
                "category": "PARTIAL_SCOPE_CONTROL_ELIGIBILITY",
                "severity": "MATERIAL_WARNING",
                "title_ar": f"مراجعة النطاق الجزئي للضابط ({ctrl_res.control_id}) — حفظ المراسلات الإلكترونية مقابل الأصول الورقية",
                "description_ar": (
                    f"الضابط ({ctrl_res.control_id}: حفظ كافة المراسلات على SHARE FOLDER، بمعامل RRF=0.90) يغطي المراسلات الإلكترونية فقط، "
                    "بينما المخاطرة رقم 7 والحادثتان (101 و102) وملحوظة التفتيش رقم 1 (AUD-SYND-01) تتعلق بفقدان أصول المستندات الورقية الموقعة. "
                    + (
                        "الضابط محتسب حالياً ضمن MAX RRF=0.90 (متبقٍ 200,400 ج.م - M). عند استبعاده نطاقياً يصبح MAX RRF=0.75 (CTL-SYND-R23/R25) ويرتفع الخطر المتبقي إلى 501,000 ج.م (H)."
                        if is_currently_eligible
                        else "تم استبعاد الضابط نطاقياً بقرار المراجع؛ أصبح MAX RRF=0.75 (CTL-SYND-R23/R25) والخطر المتبقي 501,000 ج.م (H)."
                    )
                ),
                "original_source_value": {
                    "control_id": ctrl_res.control_id,
                    "workbook_rrf": 0.90,
                    "baseline_residual_egp": 200400,
                    "baseline_residual_rating": "M",
                },
                "calculated_value": {
                    "is_currently_eligible": is_currently_eligible,
                    "effective_max_rrf": to_serializable(p2b_res.effective_rrf),
                    "selected_max_rrf_control_id": p2b_res.selected_max_rrf_control_id,
                    "residual_financial_amount_egp": to_serializable(p2b_res.residual_financial_amount),
                    "residual_severity": to_serializable(p2b_res.continuous_residual_rating),
                },
                "requires_human_decision": True,
                "recommended_action_ar": "تحديد ما إذا كان الضابط CTL-SYND-R24 مؤهلاً لخفض خطر فقدان الأصول الورقية أو استبعاده نطاقياً لإعادة احتساب الخطر المتبقي.",
            })

    # 4. Missing P15 control effectiveness rating (and any PENDING_REVIEW control)
    for ctrl_res in p2b_res.control_assessments:
        if ctrl_res.effectiveness_classification == ControlEffectivenessClassification.PENDING_REVIEW:
            discrepancies.append({
                "discrepancy_id": f"DISC-{r_id}-{ctrl_res.control_id}-MISSING-EFFECTIVENESS",
                "risk_id": r_id,
                "control_id": ctrl_res.control_id,
                "category": "MISSING_CONTROL_EFFECTIVENESS_P15",
                "severity": "PENDING_INPUT_BLOCKER",
                "title_ar": f"حقل فاعلية الضابط ({ctrl_res.control_id}) فارغ في المصدر (PENDING_REVIEW)",
                "description_ar": (
                    f"الضابط ({ctrl_res.control_id}) لا يحتوي على تقييم فاعلية في العمود P بملف الإكسيل الأصلي (الخلية P15 فارغة). "
                    "تم إبقاء حالته PENDING_REVIEW وتعليق أهليته في حساب RRF لحين إدخال تقييم معتمد ومؤيد بالدليل."
                ),
                "original_source_value": {
                    "control_id": ctrl_res.control_id,
                    "cell_P": None,
                    "status": "PENDING_REVIEW",
                },
                "calculated_value": {
                    "effectiveness_classification": ctrl_res.effectiveness_classification.value,
                    "is_eligible_for_residual_reduction": ctrl_res.is_eligible_for_residual_reduction,
                    "applicable_rrf": to_serializable(ctrl_res.applicable_rrf),
                },
                "requires_human_decision": True,
                "recommended_action_ar": "استيفاء تقييم فاعلية الضابط في لوحة استكمال البيانات المفقودة مع توثيق الدليل المؤيد.",
            })

    # 5. Financial impact differs from linked incident losses (e.g. Risk #4, Risk #7, Risk #8)
    dec = p2a_res.impact_selection_decision
    if (
        dec is not None
        and dec.proposed_evidence_amount is not None
        and dec.selected_amount is not None
        and dec.proposed_evidence_amount != dec.selected_amount
    ):
        discrepancies.append({
            "discrepancy_id": f"DISC-{r_id}-TEMPLATE-VS-INCIDENT-LOSS",
            "risk_id": r_id,
            "category": "FINANCIAL_IMPACT_VS_INCIDENT_LOSS",
            "severity": "MATERIAL_WARNING",
            "title_ar": (
                f"اختلاف الأثر المالي الفردي المدخل ({dec.selected_amount:,.0f} ج.م) عن أعلى خسارة حادثة مرتبطة ({dec.proposed_evidence_amount:,.0f} ج.م)"
            ),
            "description_ar": (
                f"القيمة المستخدمة حالياً للأثر المالي الفردي هي {dec.selected_amount:,.0f} ج.م ({dec.selected_amount_origin.value})، "
                f"بينما أعلى خسارة حادثة فردية مرتبطة موثقة بسجل الحوادث هي {dec.proposed_evidence_amount:,.0f} ج.م "
                f"(الحادثة {dec.highest_relevant_incident_id} ضمن الحوادث المرتبطة: {', '.join(dec.relevant_incident_ids)}؛ لا يتم جمع الحوادث المنفصلة)."
            ),
            "original_source_value": {
                "selected_amount_egp": to_serializable(dec.selected_amount),
                "selected_origin": dec.selected_amount_origin.value,
            },
            "calculated_value": {
                "highest_incident_id": dec.highest_relevant_incident_id,
                "highest_incident_loss_egp": to_serializable(dec.proposed_evidence_amount),
                "relevant_incident_ids": list(dec.relevant_incident_ids),
            },
            "requires_human_decision": True,
            "recommended_action_ar": (
                f"يمكن للمراجع الإبقاء على القيمة المرجعية ({dec.selected_amount:,.0f} ج.م) مع التبرير أو اعتماد أعلى خسارة حادثة فردية ({dec.proposed_evidence_amount:,.0f} ج.م) وإعادة الاحتساب."
            ),
        })

    # 6. Missing source documents vs confirmed zero values
    if p2b_res.incident_document_status == "MISSING_DOCUMENT" or p2b_res.audit_document_status == "MISSING_DOCUMENT":
        discrepancies.append({
            "discrepancy_id": f"DISC-{r_id}-MISSING-SOURCE-DOCS",
            "risk_id": r_id,
            "category": "MISSING_SOURCE_DOCUMENT_VS_CONFIRMED_ZERO",
            "severity": "PENDING_INPUT_BLOCKER",
            "title_ar": "مستندات مصدرية غير مرفقة (MISSING_DOCUMENT — لا تُعامل كصفر حوادث مؤكدة)",
            "description_ar": (
                f"حالة سجل الحوادث: ({p2b_res.incident_document_status})، وحالة تقرير التفتيش: ({p2b_res.audit_document_status}). "
                "وفقاً لمنهجية البنك، لا يجوز افتراض عدم وجود حوادث أو ملاحظات (صفر مؤكد) عند غياب المستند المصدري."
            ),
            "original_source_value": {
                "incident_document_status": p2b_res.incident_document_status,
                "audit_document_status": p2b_res.audit_document_status,
            },
            "calculated_value": {
                "zero_or_missing_status": to_serializable(p2a_res.zero_or_missing_status),
            },
            "requires_human_decision": True,
            "recommended_action_ar": "استيفاء البيانات المفقودة وتحديد مصدر التقدير المالي والتكراري بدقة.",
        })

    return discrepancies


def _extract_calculated_snapshot(pkg: Any, workbook_cells: Dict[str, str], excel_row: Optional[int]) -> Dict[str, Any]:
    """Extract a clean, structured snapshot of all read-only calculated outputs for UI display and diffing."""
    p2a = pkg.phase2a_result
    p2b = pkg.phase2b_result
    r_str = str(excel_row) if excel_row is not None else ""
    wb_s_key = workbook_cells.get(f"S{r_str}", "").strip() if r_str else None
    wb_rrf = WORKBOOK_KEY_TO_RRF.get(wb_s_key.lower(), None) if wb_s_key else None
    wb_t_raw = workbook_cells.get(f"T{r_str}", "").strip() if r_str else ""
    wb_t = float(wb_t_raw) if wb_t_raw and wb_t_raw.replace(".", "", 1).isdigit() else None
    wb_u = workbook_cells.get(f"U{r_str}", "").strip() if r_str else None

    return {
        "phase2a_status": to_serializable(p2a.status),
        "phase2b_status": to_serializable(p2b.status),
        "individual_financial_impact_egp": to_serializable(p2a.individual_financial_impact),
        "individual_impact_level": p2a.individual_impact_level,
        "individual_impact_rating": to_serializable(p2a.individual_impact_rating),
        "individual_impact_label_ar": p2a.individual_impact_label_ar,
        "financial_value_origin": to_serializable(p2a.financial_value_origin),
        "proposed_evidence_impact_egp": to_serializable(p2a.proposed_evidence_impact_egp),
        "linked_incident_ids": list(p2a.linked_incident_ids),
        "normalized_frequency_level": p2a.normalized_frequency_level,
        "normalized_frequency_label_ar": p2a.normalized_frequency_label_ar,
        "annual_frequency_multiplier": to_serializable(p2a.annual_frequency_multiplier),
        "expected_annual_loss_egp": to_serializable(p2a.expected_annual_loss),
        "annualized_financial_level": p2a.annualized_financial_level,
        "annualized_financial_rating": to_serializable(p2a.annualized_financial_rating),
        "annualized_financial_label_ar": p2a.annualized_financial_label_ar,
        "workbook_formatted_l_rating": p2a.workbook_formatted_l_rating,
        "page5_matrix_rating": to_serializable(p2a.page5_matrix_rating),
        "page5_matrix_color": to_serializable(p2a.page5_matrix_color),
        "page6_inherent_zone": to_serializable(p2a.page6_inherent_zone),
        "effective_max_rrf": to_serializable(p2b.effective_rrf),
        "residual_factor": to_serializable(p2b.residual_factor),
        "selected_max_rrf_control_id": p2b.selected_max_rrf_control_id,
        "selected_workbook_rrf_key": p2b.selected_workbook_rrf_key,
        "max_rrf_selection_rationale": p2b.max_rrf_selection_rationale,
        "residual_financial_amount_egp": to_serializable(p2b.residual_financial_amount),
        "continuous_residual_level": p2b.continuous_residual_level,
        "continuous_residual_rating": to_serializable(p2b.continuous_residual_rating),
        "continuous_residual_label_ar": p2b.continuous_residual_label_ar,
        "excel_u_column_rating": p2b.excel_u_column_rating,
        "workbook_reference_s_key": wb_s_key,
        "workbook_reference_rrf": to_serializable(wb_rrf),
        "workbook_reference_t_residual_egp": wb_t,
        "workbook_reference_u_rating": wb_u,
        "controls_calculated": [
            {
                "control_id": c.control_id,
                "control_type": to_serializable(c.control_type),
                "control_type_label_ar": c.control_type_label_ar,
                "control_method": to_serializable(c.control_method),
                "control_method_label_ar": c.control_method_label_ar,
                "effectiveness_classification": to_serializable(c.effectiveness_classification),
                "implementation_status": to_serializable(c.implementation_status),
                "applicable_rrf": to_serializable(c.applicable_rrf),
                "workbook_rrf_key": c.workbook_rrf_key,
                "is_eligible_for_residual_reduction": c.is_eligible_for_residual_reduction,
                "eligibility_reason": c.eligibility_reason,
                "scope_requires_human_review": c.scope_requires_human_review,
                "assessment_status": to_serializable(c.assessment_status),
            }
            for c in p2b.control_assessments
        ],
        # Explicitly mark Phase 2C capabilities as NOT_IMPLEMENTED per Phase 2D Section 4 & 10
        "nfi_assessment_status": "NOT_IMPLEMENTED",
        "esg_assessment_status": "NOT_IMPLEMENTED",
        "final_risk_acceptance_status": "NOT_IMPLEMENTED",
    }


def initialize_unit_packages(
    unit_id: str,
    sqlite_db_path: Optional[str] = None,
    workbook_json_path: str = str(DEFAULT_WORKBOOK_PATH),
) -> Dict[str, Any]:
    """Assemble initial HITL review packages for a given Business Unit."""
    bundle = load_dynamic_evidence_bundle(unit_id, sqlite_db_path=sqlite_db_path)
    items: List[Dict[str, Any]] = []

    if unit_id == "BU-SYNDICATED":
        loaded_synd = load_syndicated_loans_workbook_requests(workbook_json_path)
        for display_idx, (r_row, ctrl_rows, p2b_req, cell_map) in enumerate(loaded_synd, start=1):
            risk_num = cell_map.get(f"C{r_row}", "").strip() or str(display_idx)
            r_id = p2b_req.risk_id
            p2a_req = FinancialInherentRequest(
                risk_ref=f"RISK-{risk_num} (Row {r_row})",
                risk_id=r_id,
                unit_id="BU-SYNDICATED",
                process_name=cell_map.get(f"F{r_row}", "").strip(),
                risk_description=cell_map.get(f"G{r_row}", "").strip(),
                individual_financial_impact=cell_map.get(f"J{r_row}", "").strip(),
                financial_value_origin=FinancialValueOrigin.TEMPLATE_REFERENCE_AMOUNT,
                expected_frequency_text=cell_map.get(f"I{r_row}", ""),
                frequency_origin=FrequencyEvidenceOrigin.SOURCE_DOCUMENTED_FREQUENCY,
                explicit_linked_incident_ids=EXPLICIT_INCIDENTS_BY_SYND_RISK.get(r_id, []),
                workbook_cached_k_loss=cell_map.get(f"K{r_row}", ""),
                workbook_cached_l_rating=cell_map.get(f"L{r_row}", ""),
                workbook_ac_rationale=cell_map.get(f"AC{r_row}", "").strip(),
                source_evidence=list(p2b_req.source_evidence),
            )

            pkg = build_hitl_review_package_for_risk(
                phase2a_request=p2a_req,
                phase2b_request=p2b_req,
                evidence_bundle=bundle,
                workbook_cells=cell_map,
                excel_row=r_row,
            )

            # Capture immutable original source snapshot
            relevant_cells = {}
            for col in ["C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "S", "T", "U", "V", "W", "X", "Y", "Z", "AA", "AB", "AC", "AD", "AE"]:
                if f"{col}{r_row}" in cell_map:
                    relevant_cells[f"{col}{r_row}"] = cell_map[f"{col}{r_row}"]
            for cr in ctrl_rows:
                for col in ["M", "N", "O", "P", "Q", "R"]:
                    if f"{col}{cr}" in cell_map:
                        relevant_cells[f"{col}{cr}"] = cell_map[f"{col}{cr}"]
            if "H5" in cell_map:
                relevant_cells["H5"] = cell_map["H5"]

            orig_source = {
                "risk_id": r_id,
                "risk_number": risk_num,
                "excel_row": r_row,
                "control_rows": list(ctrl_rows),
                "workbook_cells": relevant_cells,
                "process_cell_d": cell_map.get(f"D{r_row}", "").strip() or None,
                "objective_cell_e": cell_map.get(f"E{r_row}", "").strip() or cell_map.get("H5", "").strip() or None,
                "risk_library_cell_f": cell_map.get(f"F{r_row}", "").strip() or None,
                "risk_description_cell_g": cell_map.get(f"G{r_row}", "").strip() or None,
                "frequency_cell_i": cell_map.get(f"I{r_row}", "").strip() or None,
                "individual_impact_cell_j": cell_map.get(f"J{r_row}", "").strip() or None,
                "annual_loss_cell_k": cell_map.get(f"K{r_row}", "").strip() or None,
                "inherent_rating_cell_l": cell_map.get(f"L{r_row}", "").strip() or None,
                "selected_rrf_cell_s": cell_map.get(f"S{r_row}", "").strip() or None,
                "residual_loss_cell_t": cell_map.get(f"T{r_row}", "").strip() or None,
                "residual_rating_cell_u": cell_map.get(f"U{r_row}", "").strip() or None,
                "overall_rating_cell_aa": cell_map.get(f"AA{r_row}", "").strip() or None,
                "corrective_action_cell_ab": cell_map.get(f"AB{r_row}", "").strip() or None,
                "rationale_cell_ac": cell_map.get(f"AC{r_row}", "").strip() or None,
                "l1_category_cell_ad": cell_map.get(f"AD{r_row}", "").strip() or None,
                "controls": to_serializable(p2b_req.controls),
            }

            draft_input = {
                "risk_id": r_id,
                "unit_id": "BU-SYNDICATED",
                "excel_row": r_row,
                "control_rows": list(ctrl_rows),
                "workbook_cells": relevant_cells,
                "process_name": cell_map.get(f"D{r_row}", "").strip() or cell_map.get(f"F{r_row}", "").strip(),
                "risk_library_name": cell_map.get(f"F{r_row}", "").strip(),
                "strategic_objective": cell_map.get(f"E{r_row}", "").strip() or cell_map.get("H5", "").strip(),
                "risk_description": cell_map.get(f"G{r_row}", "").strip(),
                "individual_financial_impact": to_serializable(pkg.phase2a_result.individual_financial_impact),
                "financial_value_origin": to_serializable(pkg.phase2a_result.financial_value_origin),
                "financial_evidence_justification": "القيمة المرجعية المسجلة بنموذج القروض المشتركة المعتمد",
                "expected_frequency_text": cell_map.get(f"I{r_row}", "").strip(),
                "frequency_origin": to_serializable(pkg.phase2a_result.frequency_origin),
                "frequency_justification": "التكرار الموثق بنموذج القروض المشتركة المعتمد",
                "explicit_linked_incident_ids": EXPLICIT_INCIDENTS_BY_SYND_RISK.get(r_id, []),
                "active_rationale_ar": pkg.active_rationale_ar,
                "active_corrective_action_ar": pkg.active_corrective_action_ar,
                "corrective_action_owner": None,
                "corrective_action_target_date": None,
                "taxonomy_l1_ar": cell_map.get(f"AD{r_row}", "").strip() or pkg.strategic_and_taxonomy.suggested_l1_ar,
                "controls": to_serializable(p2b_req.controls),
            }

            calc_snap = _extract_calculated_snapshot(pkg, relevant_cells, r_row)
            discrepancies = _build_source_discrepancies_for_package(pkg, relevant_cells, r_row, list(ctrl_rows))

            items.append({
                "risk_id": r_id,
                "unit_id": "BU-SYNDICATED",
                "excel_row": r_row,
                "display_order": display_idx,
                "original_source": orig_source,
                "current_draft_input": draft_input,
                "calculated_output": calc_snap,
                "source_discrepancies": discrepancies,
                "package": to_serializable(pkg),
            })

    elif unit_id == "BU-ACCOUNT":
        # Candidate 1: Derived from Account Opening SOP + INC-ACCT-200 + AUD-ACCT-01
        pkg1 = build_account_opening_candidate_review_package(sqlite_db_path=sqlite_db_path)
        orig1 = {
            "risk_id": pkg1.risk_id,
            "risk_number": "1",
            "excel_row": None,
            "control_rows": [],
            "workbook_cells": {},
            "process_cell_d": pkg1.phase2a_request.process_name,
            "risk_description_cell_g": None,  # MISSING_IN_SOURCE
            "frequency_cell_i": None,  # MISSING_FREQUENCY -> PENDING_INPUT
            "individual_impact_cell_j": 201000,
            "controls": to_serializable(pkg1.phase2b_request.controls),
        }
        draft1 = {
            "risk_id": pkg1.risk_id,
            "unit_id": "BU-ACCOUNT",
            "excel_row": None,
            "control_rows": [],
            "workbook_cells": {},
            "process_name": pkg1.phase2a_request.process_name,
            "risk_library_name": pkg1.strategic_and_taxonomy.suggested_l3_ar,
            "strategic_objective": (
                pkg1.strategic_and_taxonomy.linked_official_strategic_objectives[0]
                if pkg1.strategic_and_taxonomy.linked_official_strategic_objectives
                else ""
            ),
            "risk_description": pkg1.active_risk_description_ar,
            "individual_financial_impact": to_serializable(pkg1.phase2a_result.individual_financial_impact),
            "financial_value_origin": to_serializable(pkg1.phase2a_result.financial_value_origin),
            "financial_evidence_justification": "مشتق من الحادثة التاريخية INC-ACCT-200 (201,000 ج.م - بطاقة رقم قومي منتهية)",
            "expected_frequency_text": None,
            "frequency_origin": "MISSING_FREQUENCY",
            "frequency_justification": "",
            "explicit_linked_incident_ids": ["INC-ACCT-200"],
            "active_rationale_ar": pkg1.active_rationale_ar,
            "active_corrective_action_ar": pkg1.active_corrective_action_ar,
            "corrective_action_owner": None,
            "corrective_action_target_date": None,
            "taxonomy_l1_ar": pkg1.strategic_and_taxonomy.suggested_l1_ar,
            "controls": to_serializable(pkg1.phase2b_request.controls),
        }
        calc1 = _extract_calculated_snapshot(pkg1, {}, None)
        disc1 = _build_source_discrepancies_for_package(pkg1, {}, None, [])
        items.append({
            "risk_id": pkg1.risk_id,
            "unit_id": "BU-ACCOUNT",
            "excel_row": None,
            "display_order": 1,
            "original_source": orig1,
            "current_draft_input": draft1,
            "calculated_output": calc1,
            "source_discrepancies": disc1,
            "package": to_serializable(pkg1),
        })

    elif unit_id in ("BU-POS", "BU-BRANCHES", "BU-TRADING"):
        # Partial-data / missing-document candidate risk so authorized users can complete missing inputs
        r_id = f"RSK-{unit_id.replace('BU-', '')}-01"
        proc_default = (
            bundle.sop_procedures[0].section_title_ar
            if bundle.sop_procedures
            else f"العمليات التشغيلية لوحدة {bundle.unit_name_ar or unit_id}"
        )
        p2a_req = FinancialInherentRequest(
            risk_ref=r_id,
            risk_id=r_id,
            unit_id=unit_id,
            process_name=proc_default,
            risk_description=f"قصور تشغيلي أثناء تنفيذ {proc_default}",
            individual_financial_impact=None,
            expected_frequency_text=None,
            incidents_document_status=bundle.incidents_status,
        )
        raw_ctrl = ControlInputRecord(
            control_id=f"CTL-{unit_id.replace('BU-', '')}-01",
            linked_risk_id=r_id,
            control_description=f"مراجعة واعتماد العمليات التشغيلية وفق دليل الإجراءات المعتمد ({proc_default})",
            control_owner="السلطة الإشرافية المختصة",
            control_type_raw="Preventive",
            control_method_raw="Manual",
            control_frequency_raw="Daily\nيومياً",
            effectiveness_raw="PENDING_REVIEW",
            implementation_status=ControlImplementationStatus.IMPLEMENTED,
        )
        p2b_req = ResidualRiskAssessmentRequest(
            risk_id=r_id,
            unit_id=unit_id,
            process_name=proc_default,
            risk_description=p2a_req.risk_description,
            expected_annual_loss=None,
            controls=[raw_ctrl],
            incident_Document_status=bundle.incidents_status,
            audit_document_status=bundle.audit_findings_status,
        )
        pkg = build_hitl_review_package_for_risk(
            phase2a_request=p2a_req,
            phase2b_request=p2b_req,
            evidence_bundle=bundle,
        )
        orig = {
            "risk_id": r_id,
            "risk_number": "1",
            "excel_row": None,
            "control_rows": [],
            "workbook_cells": {},
            "process_cell_d": proc_default,
            "risk_description_cell_g": p2a_req.risk_description,
            "frequency_cell_i": None,
            "individual_impact_cell_j": None,
            "controls": to_serializable(p2b_req.controls),
        }
        draft = {
            "risk_id": r_id,
            "unit_id": unit_id,
            "excel_row": None,
            "control_rows": [],
            "workbook_cells": {},
            "process_name": proc_default,
            "risk_library_name": pkg.strategic_and_taxonomy.suggested_l3_ar,
            "strategic_objective": (
                pkg.strategic_and_taxonomy.linked_official_strategic_objectives[0]
                if pkg.strategic_and_taxonomy.linked_official_strategic_objectives
                else ""
            ),
            "risk_description": p2a_req.risk_description,
            "individual_financial_impact": None,
            "financial_value_origin": "MISSING_OR_UNSUPPORTED",
            "financial_evidence_justification": "",
            "expected_frequency_text": None,
            "frequency_origin": "MISSING_FREQUENCY",
            "frequency_justification": "",
            "explicit_linked_incident_ids": [],
            "active_rationale_ar": pkg.active_rationale_ar,
            "active_corrective_action_ar": pkg.active_corrective_action_ar,
            "corrective_action_owner": None,
            "corrective_action_target_date": None,
            "taxonomy_l1_ar": pkg.strategic_and_taxonomy.suggested_l1_ar,
            "controls": to_serializable(p2b_req.controls),
        }
        calc = _extract_calculated_snapshot(pkg, {}, None)
        disc = _build_source_discrepancies_for_package(pkg, {}, None, [])
        items.append({
            "risk_id": r_id,
            "unit_id": unit_id,
            "excel_row": None,
            "display_order": 1,
            "original_source": orig,
            "current_draft_input": draft,
            "calculated_output": calc,
            "source_discrepancies": disc,
            "package": to_serializable(pkg),
        })

    return {
        "unit_id": unit_id,
        "evidence_bundle": to_serializable(bundle),
        "risk_items": items,
    }


def recalculate_single_risk(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Recalculate a single target risk from its current draft inputs using the authoritative
    Python Phase 2A, Phase 2B, and Phase 2B.1/2B.2 engines.
    """
    unit_id: str = payload["unit_id"]
    risk_id: str = payload["risk_id"]
    sqlite_db_path: Optional[str] = payload.get("sqlite_db_path")
    draft_input: Dict[str, Any] = payload["current_draft_input"]
    excel_row: Optional[int] = draft_input.get("excel_row")
    control_rows: List[int] = draft_input.get("control_rows") or []
    workbook_cells: Dict[str, str] = draft_input.get("workbook_cells") or {}

    bundle = load_dynamic_evidence_bundle(unit_id, sqlite_db_path=sqlite_db_path)

    # Parse financial value origin
    fin_origin_str = draft_input.get("financial_value_origin") or "EXPLICIT_HUMAN_ESTIMATE"
    try:
        fin_origin = FinancialValueOrigin(fin_origin_str)
    except ValueError:
        fin_origin = FinancialValueOrigin.EXPLICIT_HUMAN_ESTIMATE

    # Parse frequency origin
    freq_origin_str = draft_input.get("frequency_origin") or "AUTHORIZED_USER_ESTIMATE"
    try:
        freq_origin = FrequencyEvidenceOrigin(freq_origin_str)
    except ValueError:
        freq_origin = FrequencyEvidenceOrigin.AUTHORIZED_USER_ESTIMATE

    raw_impact = draft_input.get("individual_financial_impact")
    if raw_impact == "" or raw_impact is None:
        raw_impact = None
    elif fin_origin == FinancialValueOrigin.MISSING_OR_UNSUPPORTED:
        fin_origin = FinancialValueOrigin.EXPLICIT_HUMAN_ESTIMATE

    raw_freq = draft_input.get("expected_frequency_text")
    if raw_freq is not None and str(raw_freq).strip() == "":
        raw_freq = None
    elif raw_freq is not None and freq_origin == FrequencyEvidenceOrigin.MISSING_FREQUENCY:
        freq_origin = FrequencyEvidenceOrigin.AUTHORIZED_USER_ESTIMATE

    explicit_inc_ids = draft_input.get("explicit_linked_incident_ids")
    if explicit_inc_ids is None and unit_id == "BU-SYNDICATED":
        explicit_inc_ids = EXPLICIT_INCIDENTS_BY_SYND_RISK.get(risk_id, [])

    r_str = str(excel_row) if excel_row is not None else ""
    p2a_req = FinancialInherentRequest(
        risk_ref=f"RISK-{risk_id}",
        risk_id=risk_id,
        unit_id=unit_id,
        process_name=draft_input.get("process_name") or "",
        risk_description=draft_input.get("risk_description") or "",
        individual_financial_impact=raw_impact,
        financial_value_origin=fin_origin if raw_impact is not None else FinancialValueOrigin.MISSING_OR_UNSUPPORTED,
        expected_frequency_text=raw_freq,
        frequency_origin=freq_origin if raw_freq is not None else FrequencyEvidenceOrigin.MISSING_FREQUENCY,
        frequency_supporting_reasoning=draft_input.get("frequency_justification") or None,
        candidate_incidents=bundle.incidents,
        explicit_linked_incident_ids=explicit_inc_ids,
        incidents_document_status=bundle.incidents_status,
        workbook_cached_k_loss=workbook_cells.get(f"K{r_str}") if r_str else None,
        workbook_cached_l_rating=workbook_cells.get(f"L{r_str}") if r_str else None,
        workbook_ac_rationale=workbook_cells.get(f"AC{r_str}") if r_str else None,
    )

    # Reconstruct ControlInputRecord list
    controls_data: List[Dict[str, Any]] = draft_input.get("controls") or []
    reconstructed_controls: List[ControlInputRecord] = []

    for c_dict in controls_data:
        impl_str = str(c_dict.get("implementation_status") or "IMPLEMENTED").upper()
        try:
            impl_status = ControlImplementationStatus(impl_str)
        except ValueError:
            impl_status = ControlImplementationStatus.IMPLEMENTED

        ev_refs = [
            EvidenceReference(
                source_file=str(ev.get("source_file", "")),
                location=str(ev.get("location", "")),
                field_name=str(ev.get("field_name", "")),
                raw_value=ev.get("raw_value"),
            )
            for ev in (c_dict.get("evidence_references") or [])
            if isinstance(ev, dict)
        ]

        scope_override = c_dict.get("eligible_for_scope_override")
        if scope_override is not None:
            scope_override = bool(scope_override)

        reconstructed_controls.append(
            ControlInputRecord(
                control_id=str(c_dict.get("control_id")),
                linked_risk_id=risk_id,
                control_description=str(c_dict.get("control_description") or ""),
                control_owner=c_dict.get("control_owner"),
                control_type_raw=c_dict.get("control_type_raw") or c_dict.get("control_type"),
                control_method_raw=c_dict.get("control_method_raw") or c_dict.get("control_method"),
                control_frequency_raw=c_dict.get("control_frequency_raw") or c_dict.get("control_frequency"),
                effectiveness_raw=c_dict.get("effectiveness_raw") or c_dict.get("effectiveness_classification") or "PENDING_REVIEW",
                implementation_status=impl_status,
                scope_relevance=c_dict.get("scope_relevance"),
                eligible_for_scope_override=scope_override,
                linked_sop_steps=list(c_dict.get("linked_sop_steps") or []),
                relevant_incident_ids=list(c_dict.get("relevant_incident_ids") or []),
                relevant_audit_finding_ids=list(c_dict.get("relevant_audit_finding_ids") or []),
                evidence_references=ev_refs,
            )
        )

    p2b_req = ResidualRiskAssessmentRequest(
        risk_id=risk_id,
        unit_id=unit_id,
        process_name=draft_input.get("process_name") or "",
        risk_description=draft_input.get("risk_description") or "",
        expected_annual_loss=None,  # Will be populated from Phase 2A result inside build_hitl_review_package_for_risk
        controls=reconstructed_controls,
        verified_no_controls=bool(draft_input.get("verified_no_controls", False)),
        control_environment_known=True,
        incident_Document_status=bundle.incidents_status,
        audit_document_status=bundle.audit_findings_status,
        proposed_corrective_action=draft_input.get("active_corrective_action_ar"),
    )

    pkg = build_hitl_review_package_for_risk(
        phase2a_request=p2a_req,
        phase2b_request=p2b_req,
        evidence_bundle=bundle,
        workbook_cells=workbook_cells,
        excel_row=excel_row,
    )

    # Refresh active rationale to reflect the newly recalculated financial/control/residual outputs
    # unless the caller explicitly passed preserve_custom_rationale=True
    if not payload.get("preserve_custom_rationale", False):
        pkg.active_rationale_ar = pkg.rationale_proposal.proposed_rationale_ar
        pkg.template_preview_row["AC_assessment_rationale_ar"] = pkg.active_rationale_ar
    else:
        if draft_input.get("active_rationale_ar"):
            pkg.active_rationale_ar = str(draft_input["active_rationale_ar"])
            pkg.template_preview_row["AC_assessment_rationale_ar"] = pkg.active_rationale_ar

    if draft_input.get("risk_description"):
        pkg.active_risk_description_ar = str(draft_input["risk_description"])
        pkg.template_preview_row["G_risk_description_ar"] = pkg.active_risk_description_ar

    if draft_input.get("active_corrective_action_ar") is not None:
        pkg.active_corrective_action_ar = draft_input["active_corrective_action_ar"]
        pkg.template_preview_row["AB_corrective_action_ar"] = pkg.active_corrective_action_ar

    pkg.maker_checker_status = "MODIFIED_BY_MAKER_PENDING_CHECKER_APPROVAL"

    calc_snap = _extract_calculated_snapshot(pkg, workbook_cells, excel_row)
    discrepancies = _build_source_discrepancies_for_package(pkg, workbook_cells, excel_row, control_rows)

    # Sync updated draft_input fields from recalculated package
    updated_draft_input = dict(draft_input)
    updated_draft_input["individual_financial_impact"] = to_serializable(pkg.phase2a_result.individual_financial_impact)
    updated_draft_input["financial_value_origin"] = to_serializable(pkg.phase2a_result.financial_value_origin)
    updated_draft_input["active_rationale_ar"] = pkg.active_rationale_ar
    updated_draft_input["active_corrective_action_ar"] = pkg.active_corrective_action_ar
    updated_draft_input["controls"] = to_serializable(p2b_req.controls)

    return {
        "risk_id": risk_id,
        "unit_id": unit_id,
        "excel_row": excel_row,
        "current_draft_input": updated_draft_input,
        "calculated_output": calc_snap,
        "source_discrepancies": discrepancies,
        "package": to_serializable(pkg),
    }


def main() -> None:
    raw_in = sys.stdin.read()
    if not raw_in.strip():
        print(json.dumps({"error": "Empty stdin payload sent to cli_bridge.py"}))
        sys.exit(1)

    req = json.loads(raw_in)
    action = req.get("action")

    if action == "initialize_unit_packages":
        out = initialize_unit_packages(
            unit_id=req["unit_id"],
            sqlite_db_path=req.get("sqlite_db_path"),
            workbook_json_path=req.get("workbook_json_path", str(DEFAULT_WORKBOOK_PATH)),
        )
        print(json.dumps(out, ensure_ascii=False))
    elif action == "recalculate_single_risk":
        out = recalculate_single_risk(req)
        print(json.dumps(out, ensure_ascii=False))
    elif action == "evaluate_phase2c":
        from rcsa_engine.phase2c import evaluate_phase2c
        out = evaluate_phase2c(req.get("inputs") or {})
        print(json.dumps(out, ensure_ascii=False))
    else:
        print(json.dumps({"error": f"Unknown cli_bridge action: {action!r}"}))
        sys.exit(1)


if __name__ == "__main__":
    main()
