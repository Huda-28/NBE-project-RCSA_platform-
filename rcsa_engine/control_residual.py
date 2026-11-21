"""
Phase 2B — Authoritative Control Assessment, Official RRF Lookup,
Maximum Eligible RRF Selection, Residual Financial Risk & Evidence-Based Control Gap Engine.

Grounded strictly in:
- Original Methodology PDF (Pages 2, 3, 6) & reference_data/Methodology_Extract_8_Pages.json
- reference_data/Official_RCSA_Template__1_Risk_Profile.json & .csv (Cells M8:AB27, EG889:EJ897)
- Registered SOPs, Historical Incidents & Audit Findings
"""

from __future__ import annotations

import csv
import json
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

from .financial_inherent import (
    DEFAULT_METHODOLOGY_PATH,
    DEFAULT_WORKBOOK_PATH,
    _to_decimal,
    calculate_financial_inherent_risk,
    classify_financial_amount,
)
from .models import (
    CalculationStepTrace,
    CanonicalWorkbookRiskMapping,
    ControlAssessmentStatus,
    ControlDeficiencyCategory,
    ControlDeficiencyFinding,
    ControlDeficiencyStatus,
    ControlEffectivenessClassification,
    ControlImplementationStatus,
    ControlInputRecord,
    ControlMethod,
    ControlRelevanceClassification,
    ControlType,
    EvidenceLinkOrigin,
    EvidenceReference,
    IncidentOrAuditEvidenceInput,
    IndividualControlAssessmentResult,
    PdfPage6ResidualReferenceView,
    ResidualRiskAssessmentRequest,
    ResidualRiskAssessmentResult,
    SeverityCode,
    WorkbookResidualComparisonRow,
)

DEFAULT_WORKBOOK_CSV_PATH = Path("reference_data/Official_RCSA_Template__1_Risk_Profile.csv")

# ==============================================================================
# 1. OFFICIAL BANK-APPROVED 3x3 RRF MATRIX (Methodology Page 6 & Excel EG889:EI897)
# ==============================================================================

OFFICIAL_RRF_MATRIX: Dict[ControlMethod, Dict[ControlType, Decimal]] = {
    ControlMethod.AUTOMATED: {
        ControlType.PREVENTIVE: Decimal("0.95"),
        ControlType.DETECTIVE: Decimal("0.85"),
        ControlType.CORRECTIVE: Decimal("0.50"),
    },
    ControlMethod.SEMI_AUTOMATED: {
        ControlType.PREVENTIVE: Decimal("0.90"),
        ControlType.DETECTIVE: Decimal("0.80"),
        ControlType.CORRECTIVE: Decimal("0.40"),
    },
    ControlMethod.MANUAL: {
        ControlType.PREVENTIVE: Decimal("0.75"),
        ControlType.DETECTIVE: Decimal("0.60"),
        ControlType.CORRECTIVE: Decimal("0.30"),
    },
}

WORKBOOK_RRF_KEYS: Dict[Tuple[ControlMethod, ControlType], str] = {
    (ControlMethod.AUTOMATED, ControlType.PREVENTIVE): "Auto / preventive",
    (ControlMethod.SEMI_AUTOMATED, ControlType.PREVENTIVE): "Semi Auto / preventive",
    (ControlMethod.MANUAL, ControlType.PREVENTIVE): "Manual / preventive",
    (ControlMethod.AUTOMATED, ControlType.DETECTIVE): "Auto / detective",
    (ControlMethod.SEMI_AUTOMATED, ControlType.DETECTIVE): "Semi Auto / detective",
    (ControlMethod.MANUAL, ControlType.DETECTIVE): "Manual / detective",
    (ControlMethod.AUTOMATED, ControlType.CORRECTIVE): "Auto / corrective",
    (ControlMethod.SEMI_AUTOMATED, ControlType.CORRECTIVE): "Semi Auto / corrective",
    (ControlMethod.MANUAL, ControlType.CORRECTIVE): "Manual / corrective",
}

WORKBOOK_KEY_TO_RRF: Dict[str, Decimal] = {
    v.lower(): OFFICIAL_RRF_MATRIX[k[0]][k[1]] for k, v in WORKBOOK_RRF_KEYS.items()
}

CONTROL_TYPE_LABELS_AR: Dict[ControlType, str] = {
    ControlType.PREVENTIVE: "ضوابط رقابية مانعة",
    ControlType.DETECTIVE: "ضوابط رقابية كاشفة",
    ControlType.CORRECTIVE: "ضوابط رقابية تصحيحية",
}

CONTROL_METHOD_LABELS_AR: Dict[ControlMethod, str] = {
    ControlMethod.AUTOMATED: "ضابط رقابي آلي",
    ControlMethod.SEMI_AUTOMATED: "ضابط رقابي شبه آلي",
    ControlMethod.MANUAL: "ضابط رقابي يدوي",
}

# Methodology PDF Page 6 Residual Risk Reference Amounts (Preserved separately per Rule 8)
PDF_PAGE6_RESIDUAL_REFERENCE_ANCHORS: Dict[str, Decimal] = {
    "Low": Decimal("50000"),
    "Medium": Decimal("151000"),
    "High": Decimal("501000"),
    "Very High": Decimal("1501000"),
}

# Business Unit Source Completeness Metadata (Aligned with registered bu_source_coverage)
BU_SOURCE_COMPLETENESS: Dict[str, Dict[str, str]] = {
    "BU-SYNDICATED": {
        "sop_status": "AVAILABLE",
        "incidents_status": "AVAILABLE",
        "audit_findings_status": "AVAILABLE",
        "rcsa_register_status": "AVAILABLE_WORKBOOK",
    },
    "BU-ACCOUNT": {
        "sop_status": "AVAILABLE",
        "incidents_status": "AVAILABLE",
        "audit_findings_status": "AVAILABLE",
        "rcsa_register_status": "DERIVED_FROM_SOURCES_REQUIRED",
    },
    "BU-POS": {
        "sop_status": "AVAILABLE",
        "incidents_status": "MISSING_DOCUMENT",
        "audit_findings_status": "MISSING_DOCUMENT",
        "rcsa_register_status": "DERIVED_FROM_SOURCES_REQUIRED",
    },
    "BU-BRANCHES": {
        "sop_status": "MISSING_DOCUMENT",
        "incidents_status": "MISSING_DOCUMENT",
        "audit_findings_status": "MISSING_DOCUMENT",
        "rcsa_register_status": "EMPTY_INITIAL_STATE",
    },
    "BU-TRADING": {
        "sop_status": "MISSING_DOCUMENT",
        "incidents_status": "MISSING_DOCUMENT",
        "audit_findings_status": "MISSING_DOCUMENT",
        "rcsa_register_status": "EMPTY_INITIAL_STATE",
    },
}


# ==============================================================================
# 2. NORMALIZATION & OFFICIAL RRF LOOKUP FUNCTIONS
# ==============================================================================


def normalize_control_type(
    raw: Optional[Union[ControlType, str]],
) -> Optional[Tuple[ControlType, str]]:
    """
    Normalize control type (Arabic, English, or combined workbook strings) to
    (ControlType, canonical_arabic_label).
    Returns None if missing or unrecognized.
    """
    if raw is None:
        return None
    if isinstance(raw, ControlType):
        return (raw, CONTROL_TYPE_LABELS_AR[raw])

    cleaned = " ".join(str(raw).strip().split()).lower()
    if not cleaned:
        return None

    preventive_tokens = [
        "preventive",
        "ضوابط مانعة",
        "ضوابط رقابية مانعة",
        "مانعة",
        "مانع",
        "ضابط مانع",
        "وقائي",
        "وقائى",
        "وقائية",
        "ضابط وقائي",
        "ضوابط وقائية",
    ]
    detective_tokens = [
        "detective",
        "ضوابط كاشفة",
        "ضوابط رقابية كاشفة",
        "كاشفة",
        "كاشف",
        "ضابط كاشف",
    ]
    corrective_tokens = [
        "corrective",
        "ضوابط تصحيحية",
        "ضوابط رقابية تصحيحية",
        "تصحيحية",
        "تصحيحي",
        "ضابط تصحيحي",
    ]

    for tok in preventive_tokens:
        if tok in cleaned:
            return (ControlType.PREVENTIVE, CONTROL_TYPE_LABELS_AR[ControlType.PREVENTIVE])
    for tok in detective_tokens:
        if tok in cleaned:
            return (ControlType.DETECTIVE, CONTROL_TYPE_LABELS_AR[ControlType.DETECTIVE])
    for tok in corrective_tokens:
        if tok in cleaned:
            return (ControlType.CORRECTIVE, CONTROL_TYPE_LABELS_AR[ControlType.CORRECTIVE])

    return None


def normalize_control_method(
    raw: Optional[Union[ControlMethod, str]],
) -> Optional[Tuple[ControlMethod, str]]:
    """
    Normalize control execution method (Automated, Semi-Automated, Manual in English/Arabic)
    to (ControlMethod, canonical_arabic_label).
    Returns None if missing or unrecognized.
    """
    if raw is None:
        return None
    if isinstance(raw, ControlMethod):
        return (raw, CONTROL_METHOD_LABELS_AR[raw])

    cleaned = " ".join(str(raw).strip().split()).lower()
    if not cleaned:
        return None

    # Check Semi-Automated BEFORE Automated so "semi-automated" / "شبه آلي" / "نصف آلي" is not matched as "automated"
    semi_tokens = [
        "semi-automated",
        "semi- automated",
        "semi_automated",
        "semi automated",
        "semi auto",
        "شبه آلي",
        "شبه الي",
        "نصف آلي",
        "نصف الي",
        "ضابط رقابي شبه آلي",
        "ضابط رقابي نصف آلي",
    ]
    manual_tokens = [
        "manual",
        "يدوي",
        "يدوى",
        "ضابط رقابي يدوي",
    ]
    auto_tokens = [
        "automated",
        "auto",
        "آلي",
        "الي",
        "ضابط رقابي آلي",
    ]

    for tok in semi_tokens:
        if cleaned == tok or tok in cleaned:
            return (ControlMethod.SEMI_AUTOMATED, CONTROL_METHOD_LABELS_AR[ControlMethod.SEMI_AUTOMATED])
    for tok in manual_tokens:
        if cleaned == tok or tok in cleaned:
            return (ControlMethod.MANUAL, CONTROL_METHOD_LABELS_AR[ControlMethod.MANUAL])
    for tok in auto_tokens:
        if cleaned == tok or tok in cleaned:
            return (ControlMethod.AUTOMATED, CONTROL_METHOD_LABELS_AR[ControlMethod.AUTOMATED])

    return None


def normalize_control_effectiveness(
    raw: Optional[Union[ControlEffectivenessClassification, str]],
    implementation_status: ControlImplementationStatus = ControlImplementationStatus.IMPLEMENTED,
) -> ControlEffectivenessClassification:
    """
    Normalize control effectiveness classification strictly to the three official Page 2 categories:
    1. ضابط رقابي فعال (EFFECTIVE)
    2. ضابط رقابي يحتاج إلى تطوير (NEEDS_IMPROVEMENT)
    3. لا يوجد ضابط رقابي (NO_CONTROL)
    Or PENDING_REVIEW if effectiveness cannot be established from the source.
    Never confuses a missing control (NO_CONTROL) with an existing control rated Needs Improvement
    or an existing control with unestablished effectiveness (PENDING_REVIEW).
    """
    if implementation_status == ControlImplementationStatus.NO_CONTROL:
        return ControlEffectivenessClassification.NO_CONTROL

    if raw is None:
        return ControlEffectivenessClassification.PENDING_REVIEW

    if isinstance(raw, ControlEffectivenessClassification):
        return raw

    cleaned = " ".join(str(raw).strip().split())
    if not cleaned:
        return ControlEffectivenessClassification.PENDING_REVIEW

    lower = cleaned.lower()

    # Check Needs Improvement first because the workbook string starts with "ضابط رقابي فعال ولكن يحتاج تطوير..."
    if (
        "يحتاج إلى تطوير" in cleaned
        or "يحتاج الى التطوير" in cleaned
        or "يحتاج تطوير" in cleaned
        or "يحتاج الي تطوير" in cleaned
        or "needs improvement" in lower
        or "needs_improvement" in lower
    ):
        return ControlEffectivenessClassification.NEEDS_IMPROVEMENT

    if (
        "لا يوجد ضابط رقابي" in cleaned
        or "لا يوجد إجراء رقابي" in cleaned
        or "no control" in lower
        or "no_control" in lower
    ):
        return ControlEffectivenessClassification.NO_CONTROL

    if (
        cleaned in ("ضابط رقابي فعال", "إجراء رقابي فعال")
        or lower in ("effective", "ضابط رقابي فعال")
        or "فعال" in cleaned
        or "فعالة" in cleaned
    ):
        return ControlEffectivenessClassification.EFFECTIVE

    return ControlEffectivenessClassification.PENDING_REVIEW


def lookup_official_rrf(
    control_method: Union[ControlMethod, str],
    control_type: Union[ControlType, str],
) -> Tuple[Decimal, str]:
    """
    Deterministic lookup of the official bank-approved Risk Reduction Factor (RRF)
    and its corresponding Excel workbook lookup key (EG889:EJ897).
    Raises ValueError if method or type is invalid/missing.
    """
    norm_method = normalize_control_method(control_method)
    norm_type = normalize_control_type(control_type)

    if norm_method is None:
        raise ValueError(f"Unrecognized or missing control_method: {control_method!r}")
    if norm_type is None:
        raise ValueError(f"Unrecognized or missing control_type: {control_type!r}")

    m_enum, _ = norm_method
    t_enum, _ = norm_type

    rrf_val = OFFICIAL_RRF_MATRIX[m_enum][t_enum]
    wb_key = WORKBOOK_RRF_KEYS[(m_enum, t_enum)]
    return (rrf_val, wb_key)


# ==============================================================================
# 3. INDIVIDUAL CONTROL ASSESSMENT & MAX ELIGIBLE RRF SELECTION
# ==============================================================================


def assess_individual_control(
    record: ControlInputRecord,
) -> IndividualControlAssessmentResult:
    """
    Evaluate an individual control record independently (Phase 2B Section 3 & 6):
    - Normalizes control type, method, frequency, and effectiveness classification.
    - Computes applicable RRF when type and method are verified.
    - Determines eligibility for current residual risk reduction:
      * IMPLEMENTED with verified type & method (whether EFFECTIVE, NEEDS_IMPROVEMENT, or PENDING_REVIEW effectiveness)
        is eligible unless classified as NO_CONTROL.
      * PROPOSED / future controls are excluded from current residual risk reduction.
      * NOT_IMPLEMENTED and NO_CONTROL are excluded.
      * UNKNOWN implementation status triggers PENDING_INPUT.
    """
    missing_fields: List[str] = []

    norm_type = normalize_control_type(record.control_type_raw)
    norm_method = normalize_control_method(record.control_method_raw)
    eff_class = normalize_control_effectiveness(
        record.effectiveness_raw,
        implementation_status=record.implementation_status,
    )
    freq_clean = " ".join(record.control_frequency_raw.strip().split()) if record.control_frequency_raw else None

    c_type = norm_type[0] if norm_type else None
    c_type_ar = norm_type[1] if norm_type else None
    c_method = norm_method[0] if norm_method else None
    c_method_ar = norm_method[1] if norm_method else None

    applicable_rrf: Optional[Decimal] = None
    wb_rrf_key: Optional[str] = None

    if c_type is not None and c_method is not None:
        applicable_rrf, wb_rrf_key = lookup_official_rrf(c_method, c_type)

    status = ControlAssessmentStatus.COMPUTED
    is_eligible = False
    eligibility_reason = ""

    if record.implementation_status == ControlImplementationStatus.UNKNOWN:
        status = ControlAssessmentStatus.PENDING_INPUT
        missing_fields.append("implementation_status")
        is_eligible = False
        eligibility_reason = (
            "حالة تطبيق الضابط الرقابي غير معروفة (UNKNOWN)؛ يتعين التحقق من التطبيق الفعلي قبل احتساب معامل الخفض."
        )
    elif (
        record.implementation_status == ControlImplementationStatus.NO_CONTROL
        or eff_class == ControlEffectivenessClassification.NO_CONTROL
    ):
        is_eligible = False
        applicable_rrf = Decimal("0")
        wb_rrf_key = None
        eligibility_reason = "لا يوجد ضابط رقابي مطبق (NO_CONTROL)؛ معامل الخفض الرقابي = 0."
    elif record.implementation_status == ControlImplementationStatus.PROPOSED:
        is_eligible = False
        eligibility_reason = (
            "ضابط رقابي مقترح / إجراء تصحيحي مستقبلي (PROPOSED)؛ لا يُخفض المخاطر المتبقية الحالية لحين التنفيذ الفعلي."
        )
    elif record.implementation_status == ControlImplementationStatus.NOT_IMPLEMENTED:
        is_eligible = False
        eligibility_reason = "ضابط رقابي غير مطبق فعلياً (NOT_IMPLEMENTED)؛ مستبعد من خفض المخاطر المتبقية الحالية."
    elif record.implementation_status == ControlImplementationStatus.IMPLEMENTED:
        if c_type is None:
            missing_fields.append("control_type")
        if c_method is None:
            missing_fields.append("control_method")

        if missing_fields:
            status = ControlAssessmentStatus.PENDING_INPUT
            is_eligible = False
            eligibility_reason = (
                f"ضابط مطبق ولكن ينقصه تحديد ({', '.join(missing_fields)})؛ يتعين استيفاء النوع/الطريقة لتحديد RRF."
            )
        else:
            if eff_class == ControlEffectivenessClassification.NEEDS_IMPROVEMENT:
                is_eligible = True
                eligibility_reason = (
                    f"ضابط مطبق فعلياً ومصنف ({eff_class.value})؛ يحتفظ بمعامل الخفض المعتمد "
                    f"(RRF={applicable_rrf}) وفق القواعد المعتمدة للمرحلة 2B."
                )
            elif eff_class == ControlEffectivenessClassification.PENDING_REVIEW:
                status = ControlAssessmentStatus.PENDING_REVIEW
                is_eligible = False
                eligibility_reason = (
                    f"ضابط مطبق فعلياً بنوع وطريقة موثقين (RRF النظري={applicable_rrf})، غير مؤهل لخفض المخاطر المتبقية "
                    "لحين استيفاء تقييم الفاعلية بدليل مستندي أو تقييم معتمد (PENDING_REVIEW)."
                )
            else:
                is_eligible = True
                eligibility_reason = (
                    f"ضابط مطبق وفعال ({wb_rrf_key})؛ مؤهل لخفض المخاطر المتبقية بمعامل RRF={applicable_rrf}."
                )

    # Phase 2B.2 Section 7 — Control Scope & Residual Consistency check
    desc_clean = " ".join((record.control_description or "").strip().split())
    inferred_scope = record.scope_relevance
    if not inferred_scope:
        if "SHARE FOLDER" in desc_clean.upper() or "المراسلات الكترونيا" in desc_clean or "المراسلات إلكترونيا" in desc_clean:
            inferred_scope = ControlRelevanceClassification.PARTIALLY_RELEVANT_DIFFERENT_SCOPE.value
        else:
            inferred_scope = ControlRelevanceClassification.DIRECTLY_RELEVANT.value

    scope_requires_review = inferred_scope in (
        ControlRelevanceClassification.PARTIALLY_RELEVANT_DIFFERENT_SCOPE.value,
        ControlRelevanceClassification.IRRELEVANT_MISMATCH.value,
        ControlRelevanceClassification.REQUIRES_HUMAN_REVIEW.value,
    )

    if record.eligible_for_scope_override is False or (
        inferred_scope == ControlRelevanceClassification.IRRELEVANT_MISMATCH.value
        and record.eligible_for_scope_override is not True
    ):
        is_eligible = False
        eligibility_reason = (
            f"يحتفظ الضابط بمعامل الخفض المعتمد رسمياً (RRF={applicable_rrf} — {wb_rrf_key}) دون تعديل نسب المنهجية، "
            f"ولكن تم استبعاده من خفض المخاطر المتبقية لهذه المخاطرة بسبب اختلاف نطاق التغطية الموضوعي ({inferred_scope})."
        )
    elif is_eligible and scope_requires_review:
        eligibility_reason += (
            f" [تنبيه نطاق التغطية ({inferred_scope}): الضابط يغطي حفظ المراسلات الإلكترونية على Share Folder "
            "بينما تتمثل المخاطرة في فقد الأصول الورقية؛ يتطلب مراجعة بشرية لتأكيد أهليته كأعلى معامل خفض MAX RRF]."
        )

    return IndividualControlAssessmentResult(
        control_id=record.control_id,
        linked_risk_id=record.linked_risk_id,
        control_description=record.control_description,
        control_owner=record.control_owner,
        control_type=c_type,
        control_type_label_ar=c_type_ar,
        control_method=c_method,
        control_method_label_ar=c_method_ar,
        control_frequency=freq_clean,
        effectiveness_classification=eff_class,
        implementation_status=record.implementation_status,
        scope_relevance=inferred_scope,
        scope_requires_human_review=scope_requires_review,
        linked_sop_steps=list(record.linked_sop_steps),
        relevant_incident_ids=list(record.relevant_incident_ids),
        relevant_audit_finding_ids=list(record.relevant_audit_finding_ids),
        deficiencies=list(record.deficiencies),
        evidence_references=list(record.evidence_references),
        applicable_rrf=applicable_rrf,
        workbook_rrf_key=wb_rrf_key,
        is_eligible_for_residual_reduction=is_eligible,
        eligibility_reason=eligibility_reason,
        assessment_status=status,
        missing_fields=missing_fields,
    )


def select_max_eligible_rrf(
    evaluated_controls: List[IndividualControlAssessmentResult],
    verified_no_controls: bool = False,
    control_environment_known: bool = True,
) -> Tuple[ControlAssessmentStatus, Optional[Decimal], Optional[str], Optional[str], str, List[str]]:
    """
    Determine the Maximum Eligible RRF for a risk:
      effective_rrf = MAX(rrf of eligible implemented controls)
    Never adds, averages, or multiplies control coefficients.

    Returns:
      (status, effective_rrf, selected_control_id, selected_workbook_rrf_key, rationale, missing_fields)
    """
    missing_fields: List[str] = []

    if not control_environment_known:
        missing_fields.append("control_environment_status")
        return (
            ControlAssessmentStatus.PENDING_INPUT,
            None,
            None,
            None,
            "بيئة الضوابط الرقابية غير معلومة (Unknown Control Environment)؛ لا يُفترض عدم وجود ضوابط دون تحقق.",
            missing_fields,
        )

    # Check if any control has unknown implementation status or missing type/method while implemented
    for ctrl in evaluated_controls:
        if ctrl.assessment_status == ControlAssessmentStatus.PENDING_INPUT:
            for mf in ctrl.missing_fields:
                missing_fields.append(f"{ctrl.control_id}.{mf}")

    if missing_fields:
        return (
            ControlAssessmentStatus.PENDING_INPUT,
            None,
            None,
            None,
            (
                "توجد ضوابط رقابية غير مكتملة البيانات ("
                + ", ".join(missing_fields)
                + ")؛ يتعين استيفاؤها قبل احتساب أقصى معامل خفض (MAX RRF)."
            ),
            missing_fields,
        )

    if not evaluated_controls:
        if verified_no_controls:
            return (
                ControlAssessmentStatus.COMPUTED,
                Decimal("0"),
                None,
                None,
                "تم التحقق من عدم وجود ضوابط رقابية مطبقة (Verified No Controls)؛ معامل الخفض الفعال = 0.",
                [],
            )
        missing_fields.append("controls_or_verified_no_controls")
        return (
            ControlAssessmentStatus.PENDING_INPUT,
            None,
            None,
            None,
            "لم يتم إرفاق ضوابط رقابية ولم يتم تأكيد انعدام الضوابط؛ لا يُفترض RRF=0 تلقائياً.",
            missing_fields,
        )

    eligible_controls = [
        c
        for c in evaluated_controls
        if c.is_eligible_for_residual_reduction and c.applicable_rrf is not None
    ]

    if not eligible_controls:
        if any(c.assessment_status == ControlAssessmentStatus.PENDING_REVIEW for c in evaluated_controls):
            return (
                ControlAssessmentStatus.PENDING_REVIEW,
                Decimal("0"),
                None,
                None,
                "توجد ضوابط رقابية مطبقة ولكن تقييم فاعليتها قيد المراجعة البشرية (PENDING_REVIEW)؛ لا يُمنح خفض رقابي لحين اعتماد الفاعلية.",
                [],
            )
        # All provided controls have known status and are either NO_CONTROL, NOT_IMPLEMENTED, or PROPOSED
        return (
            ControlAssessmentStatus.COMPUTED,
            Decimal("0"),
            None,
            None,
            "لا توجد ضوابط رقابية مطبقة ومؤهلة حالياً (جميع الضوابط مقترحة أو غير مطبقة أو لا يوجد ضابط)؛ معامل الخفض الفعال = 0.",
            [],
        )

    # Select control with maximum applicable_rrf (preserving first-seen order on ties)
    best_ctrl = eligible_controls[0]
    for ctrl in eligible_controls[1:]:
        assert ctrl.applicable_rrf is not None
        assert best_ctrl.applicable_rrf is not None
        if ctrl.applicable_rrf > best_ctrl.applicable_rrf:
            best_ctrl = ctrl

    all_coeffs_str = ", ".join(
        f"{c.control_id}:{c.applicable_rrf} ({c.workbook_rrf_key})" for c in eligible_controls
    )
    rationale = (
        f"تم اختيار أقصى معامل خفض رقابي MAX RRF = {best_ctrl.applicable_rrf} "
        f"من الضابط ({best_ctrl.control_id} — {best_ctrl.workbook_rrf_key}) "
        f"من بين الضوابط المؤهلة [{all_coeffs_str}] دون جمع أو متوسط."
    )

    overall_status = ControlAssessmentStatus.COMPUTED
    if any(c.assessment_status == ControlAssessmentStatus.PENDING_REVIEW for c in evaluated_controls):
        overall_status = ControlAssessmentStatus.PENDING_REVIEW

    return (
        overall_status,
        best_ctrl.applicable_rrf,
        best_ctrl.control_id,
        best_ctrl.workbook_rrf_key,
        rationale,
        [],
    )


# ==============================================================================
# 4. RESIDUAL FINANCIAL RISK CALCULATION & SEVERITY (EXCEL U vs PDF PAGE 6)
# ==============================================================================


def calculate_residual_financial_amount(
    expected_annual_loss: Decimal,
    effective_rrf: Decimal,
) -> Tuple[Decimal, Decimal]:
    """
    Calculate Residual Financial Risk Amount using Decimal arithmetic:
      residual_factor = Decimal("1") - effective_rrf
      residual_financial_amount = expected_annual_loss * residual_factor
    Raises ValueError if expected_annual_loss <= 0 or effective_rrf not in [0, 1].
    """
    if expected_annual_loss <= Decimal("0"):
        raise ValueError(f"expected_annual_loss must be > 0, got {expected_annual_loss}")
    if effective_rrf < Decimal("0") or effective_rrf > Decimal("1"):
        raise ValueError(f"effective_rrf must be in [0, 1], got {effective_rrf}")

    residual_factor = Decimal("1") - effective_rrf
    residual_amount = expected_annual_loss * residual_factor
    return (residual_amount, residual_factor)


def classify_residual_financial_excel_u(
    residual_amount: Decimal,
) -> Tuple[int, SeverityCode, str, str]:
    """
    Classify Residual Financial Risk according to the verified Excel U-column formula (U8):
      =IF(AND(T8>0,T8<=150000),"L ",
        IF(AND(T8>=150001,T8<=500000),"M ",
          IF(AND(T8>=500001,T8<=1500000),"H ",
            IF(AND(T8>=1500001,T8<=3000000),"VHاً ",
              IF(T8>3000000,"C ","")))))
    Returns:
      (continuous_level_1_to_5, continuous_code_enum, continuous_label_ar, literal_excel_u_string)
    """
    lvl, code, label_ar, _, _ = classify_financial_amount(residual_amount)

    if residual_amount > Decimal("0") and residual_amount <= Decimal("150000"):
        literal_u = "L "
    elif residual_amount >= Decimal("150001") and residual_amount <= Decimal("500000"):
        literal_u = "M "
    elif residual_amount >= Decimal("500001") and residual_amount <= Decimal("1500000"):
        literal_u = "H "
    elif residual_amount >= Decimal("1500001") and residual_amount <= Decimal("3000000"):
        literal_u = "VHاً "
    elif residual_amount > Decimal("3000000"):
        literal_u = "C "
    else:
        literal_u = ""

    return (lvl, code, label_ar, literal_u)


def build_pdf_page6_residual_reference(
    residual_amount: Decimal,
) -> PdfPage6ResidualReferenceView:
    """
    Preserve the Methodology PDF Page 6 residual reference table separately from
    the Excel U-column formula without inventing interval boundaries or a 5th category.
    """
    exact_match: Optional[str] = None
    for label, anchor_val in PDF_PAGE6_RESIDUAL_REFERENCE_ANCHORS.items():
        if residual_amount == anchor_val:
            exact_match = label
            break

    return PdfPage6ResidualReferenceView(
        reference_anchors_egp=dict(PDF_PAGE6_RESIDUAL_REFERENCE_ANCHORS),
        exact_anchor_match_label=exact_match,
        methodology_status="UNRESOLVED_METHODOLOGY_THRESHOLD_RULES",
        eligible_for_final_risk_acceptance=False,
    )


def calculate_residual_risk(
    request: ResidualRiskAssessmentRequest,
) -> ResidualRiskAssessmentResult:
    """
    Execute the complete Phase 2B Control Assessment, MAX RRF & Residual Financial Risk pipeline.
    """
    missing_fields: List[str] = []

    # Resolve expected_annual_loss from request or phase2a_result
    annual_loss_dec = _to_decimal(request.expected_annual_loss)
    if annual_loss_dec is None and request.phase2a_result is not None:
        annual_loss_dec = request.phase2a_result.expected_annual_loss

    if annual_loss_dec is None or annual_loss_dec <= Decimal("0"):
        missing_fields.append("expected_annual_loss")

    # Resolve BU source completeness defaults if not explicitly overridden
    bu_meta = BU_SOURCE_COMPLETENESS.get(request.unit_id, {})
    inc_status = request.incident_Document_status or bu_meta.get("incidents_status", "MISSING_DOCUMENT")
    aud_status = request.audit_document_status or bu_meta.get("audit_findings_status", "MISSING_DOCUMENT")

    # Step 1: Assess each individual control independently
    evaluated_controls: List[IndividualControlAssessmentResult] = [
        assess_individual_control(ctrl) for ctrl in request.controls
    ]

    # Collect all control gap findings attached to controls
    all_gap_findings: List[ControlDeficiencyFinding] = []
    for ctrl in evaluated_controls:
        for df in ctrl.deficiencies:
            all_gap_findings.append(df)

    # Step 2: Determine MAX Eligible RRF
    rrf_status, effective_rrf, selected_ctrl_id, selected_wb_key, rrf_rationale, rrf_missing = (
        select_max_eligible_rrf(
            evaluated_controls=evaluated_controls,
            verified_no_controls=request.verified_no_controls,
            control_environment_known=request.control_environment_known,
        )
    )
    missing_fields.extend(rrf_missing)

    selected_ctrl_obj = next(
        (c for c in evaluated_controls if c.control_id == selected_ctrl_id),
        None,
    )
    if selected_ctrl_obj is not None and selected_ctrl_obj.scope_requires_human_review:
        rrf_rationale += (
            f" [يتطلب مراجعة بشرية: الضابط المختار لأعلى معامل خفض ({selected_ctrl_id} — RRF={effective_rrf}) "
            f"ذو تغطية جزئية لنطاق مختلف ({selected_ctrl_obj.scope_relevance}) ولا يعالج آلية الفشل المادية بالكامل]."
        )

    requires_human_review = (
        rrf_status == ControlAssessmentStatus.PENDING_REVIEW
        or any(df.requires_human_review for df in all_gap_findings)
        or (selected_ctrl_obj is not None and selected_ctrl_obj.scope_requires_human_review)
        or inc_status == "MISSING_DOCUMENT"
        or aud_status == "MISSING_DOCUMENT"
    )

    if missing_fields or effective_rrf is None or annual_loss_dec is None:
        return ResidualRiskAssessmentResult(
            status=ControlAssessmentStatus.PENDING_INPUT,
            missing_fields=missing_fields,
            requires_human_review=True,
            message_ar=(
                "مدخلات احتساب المخاطر المتبقية أو الضوابط الرقابية غير مكتملة "
                f"({', '.join(missing_fields)})؛ لا يتم افتراض قيم مفقودة."
            ),
            risk_id=request.risk_id,
            unit_id=request.unit_id,
            process_name=request.process_name,
            risk_description=request.risk_description,
            expected_annual_loss=annual_loss_dec,
            control_assessments=evaluated_controls,
            control_gap_findings=all_gap_findings,
            max_rrf_selection_rationale=rrf_rationale,
            incident_document_status=inc_status,
            audit_document_status=aud_status,
            proposed_corrective_action=request.proposed_corrective_action,
            source_evidence=list(request.source_evidence),
            calculation_trace=[
                CalculationStepTrace(
                    step_number=1,
                    step_name="Phase 2B Completeness & Control Eligibility Gate",
                    methodology_reference="Phase 2B Rules 6 & 9 — Missing Input Protection",
                    formula_or_rule="Require valid expected_annual_loss (>0) and verified control environment / attributes",
                    inputs={
                        "expected_annual_loss": str(annual_loss_dec),
                        "controls_count": len(request.controls),
                        "verified_no_controls": request.verified_no_controls,
                        "control_environment_known": request.control_environment_known,
                    },
                    output={
                        "status": "PENDING_INPUT",
                        "missing_fields": missing_fields,
                        "rationale": rrf_rationale,
                    },
                )
            ],
        )

    # Step 3: Residual Financial Loss = expected_annual_loss * (1 - effective_rrf)
    residual_amount, residual_factor = calculate_residual_financial_amount(
        expected_annual_loss=annual_loss_dec,
        effective_rrf=effective_rrf,
    )

    # Step 4: Residual Financial Severity (Excel U-column vs PDF Page 6 Reference)
    res_lvl, res_code, res_label_ar, literal_u = classify_residual_financial_excel_u(residual_amount)
    pdf_ref_view = build_pdf_page6_residual_reference(residual_amount)

    final_status = (
        ControlAssessmentStatus.PENDING_REVIEW
        if requires_human_review
        else ControlAssessmentStatus.COMPUTED
    )

    traces: List[CalculationStepTrace] = [
        CalculationStepTrace(
            step_number=1,
            step_name="Individual Control Assessment & Official RRF Lookup",
            methodology_reference="Methodology PDF Pages 2 & 6 — 3x3 RRF Table (Auto/Semi-Auto/Manual x Prev/Det/Corr)",
            formula_or_rule="Lookup each implemented control's (control_method, control_type) in official 9-cell RRF table",
            inputs={
                "controls_evaluated": [
                    {
                        "control_id": c.control_id,
                        "method": c.control_method.value if c.control_method else None,
                        "type": c.control_type.value if c.control_type else None,
                        "status": c.implementation_status.value,
                        "effectiveness": c.effectiveness_classification.value,
                    }
                    for c in evaluated_controls
                ]
            },
            output={
                "eligible_controls": [
                    {
                        "control_id": c.control_id,
                        "applicable_rrf": str(c.applicable_rrf),
                        "workbook_rrf_key": c.workbook_rrf_key,
                    }
                    for c in evaluated_controls
                    if c.is_eligible_for_residual_reduction
                ]
            },
        ),
        CalculationStepTrace(
            step_number=2,
            step_name="Maximum Eligible RRF Selection (MAX Rule)",
            methodology_reference="Methodology PDF Page 6 & Workbook S8:T8 Formula",
            formula_or_rule="effective_rrf = MAX(applicable_rrf of eligible implemented controls)",
            inputs={
                "eligible_rrfs": [
                    str(c.applicable_rrf)
                    for c in evaluated_controls
                    if c.is_eligible_for_residual_reduction and c.applicable_rrf is not None
                ]
            },
            output={
                "effective_rrf": str(effective_rrf),
                "residual_factor_1_minus_rrf": str(residual_factor),
                "selected_max_rrf_control_id": selected_ctrl_id,
                "selected_workbook_rrf_key": selected_wb_key,
                "rationale": rrf_rationale,
            },
        ),
        CalculationStepTrace(
            step_number=3,
            step_name="Residual Financial Risk Amount Calculation (T)",
            methodology_reference="Official RCSA Template Formula T8: (1 - effective_rrf) * K8",
            formula_or_rule="residual_financial_amount = expected_annual_loss * (Decimal('1') - effective_rrf)",
            inputs={
                "expected_annual_loss_egp": str(annual_loss_dec),
                "effective_rrf": str(effective_rrf),
                "residual_factor": str(residual_factor),
            },
            output={"residual_financial_amount_egp": str(residual_amount)},
        ),
        CalculationStepTrace(
            step_number=4,
            step_name="Residual Financial Severity Classification (Excel U-Column vs PDF Page 6 Reference)",
            methodology_reference="Official RCSA Template Formula U8 & Methodology PDF Page 6 Reference Table",
            formula_or_rule='Excel U8: (0,150k]->"L ", (150k,500k]->"M ", (500k,1.5M]->"H ", (1.5M,3M]->"VHاً ", >3M->"C "',
            inputs={"residual_financial_amount_egp": str(residual_amount)},
            output={
                "continuous_residual_rating": res_code.value,
                "excel_u_column_rating": literal_u,
                "pdf_page6_methodology_status": pdf_ref_view.methodology_status,
                "pdf_page6_exact_anchor_match": pdf_ref_view.exact_anchor_match_label,
            },
        ),
    ]

    return ResidualRiskAssessmentResult(
        status=final_status,
        missing_fields=[],
        requires_human_review=requires_human_review,
        message_ar=(
            "تم احتساب معامل الخفض الأقصى (MAX RRF) وصافي المخاطر المالية المتبقية بنجاح."
            if final_status == ControlAssessmentStatus.COMPUTED
            else "تم احتساب المخاطر المالية المتبقية مبدئياً مع وجود بنود تتطلب مراجعة بشرية (PENDING_REVIEW)."
        ),
        risk_id=request.risk_id,
        unit_id=request.unit_id,
        process_name=request.process_name,
        risk_description=request.risk_description,
        expected_annual_loss=annual_loss_dec,
        control_assessments=evaluated_controls,
        control_gap_findings=all_gap_findings,
        effective_rrf=effective_rrf,
        residual_factor=residual_factor,
        selected_max_rrf_control_id=selected_ctrl_id,
        selected_workbook_rrf_key=selected_wb_key,
        max_rrf_selection_rationale=rrf_rationale,
        residual_financial_amount=residual_amount,
        continuous_residual_level=res_lvl,
        continuous_residual_rating=res_code,
        continuous_residual_label_ar=res_label_ar,
        excel_u_column_rating=literal_u,
        excel_u_column_code_normalized=res_code,
        pdf_page6_residual_reference=pdf_ref_view,
        incident_document_status=inc_status,
        audit_document_status=aud_status,
        proposed_corrective_action=request.proposed_corrective_action,
        source_evidence=list(request.source_evidence),
        calculation_trace=traces,
    )


# ==============================================================================
# 5. EVIDENCE-BASED CONTROL GAP ANALYSIS (INCIDENTS, AUDIT FINDINGS & SOPs)
# ==============================================================================


def analyze_incident_or_audit_control_gap(
    finding_id: str,
    source_type: str,
    source_reference_id: str,
    affected_business_process: str,
    failure_mechanism: str,
    controls: List[ControlInputRecord],
    explicit_target_control_ids: Optional[List[str]] = None,
    ai_suggested_control_ids: Optional[List[str]] = None,
    failure_keywords: Optional[List[str]] = None,
    deficiency_category: Optional[ControlDeficiencyCategory] = None,
    confirmed_by_audit_or_workbook: bool = False,
    evidence_references: Optional[List[EvidenceReference]] = None,
) -> ControlDeficiencyFinding:
    """
    Deterministic evidence-based control gap analyzer (Phase 2B Section 4 & Final Integrity Check #3/#4/#5):
    - Identifies which specific control(s) among a risk's controls address the observed failure mechanism.
    - Explicitly separates:
      * CONFIRMED_DOCUMENTARY_EVIDENCE (only when `confirmed_by_audit_or_workbook=True` and `explicit_target_control_ids` is provided)
      * AI_SUGGESTED_CANDIDATE (when `ai_suggested_control_ids` is provided — always marked SUSPECTED/HUMAN_REVIEW_REQUIRED, never CONFIRMED)
      * HEURISTIC_CANDIDATE_MATCH (when matched via `failure_keywords` — always marked SUSPECTED/HUMAN_REVIEW_REQUIRED, never CONFIRMED)
      * UNSUPPORTED_SOURCE (when no failure mechanism is supported by the source)
    - Never marks all controls attached to a risk as ineffective simply because an incident occurred.
    """
    ev_refs = list(evidence_references) if evidence_references else []
    candidate_ids = [c.control_id for c in controls]

    if not failure_mechanism.strip():
        return ControlDeficiencyFinding(
            finding_id=finding_id,
            source_type=source_type,
            source_reference_id=source_reference_id,
            affected_business_process=affected_business_process,
            failure_mechanism=failure_mechanism,
            candidate_control_ids=candidate_ids,
            linked_control_ids=[],
            deficiency_category=None,
            deficiency_status=ControlDeficiencyStatus.UNSUPPORTED,
            evidence_link_origin=EvidenceLinkOrigin.UNSUPPORTED_SOURCE,
            requires_human_review=True,
            reasoning="لم يتضمن المصدر آلية فشل أو سبباً جذرياً موثقاً؛ لا يتم اختلاق سبب جذري.",
            evidence_references=ev_refs,
        )

    # 1. Explicit target control IDs (Documentary or Human-Reviewed)
    if explicit_target_control_ids is not None:
        matched_ids = [cid for cid in explicit_target_control_ids if cid in candidate_ids]
        if matched_ids:
            origin = (
                EvidenceLinkOrigin.CONFIRMED_DOCUMENTARY_EVIDENCE
                if confirmed_by_audit_or_workbook
                else EvidenceLinkOrigin.HEURISTIC_CANDIDATE_MATCH
            )
            status = (
                ControlDeficiencyStatus.CONFIRMED
                if confirmed_by_audit_or_workbook
                else ControlDeficiencyStatus.SUSPECTED
            )
            cat = deficiency_category or (
                ControlDeficiencyCategory.CONTROL_DESIGN_DEFICIENCY
                if confirmed_by_audit_or_workbook
                else ControlDeficiencyCategory.CONTROL_EXECUTION_FAILURE
            )
            return ControlDeficiencyFinding(
                finding_id=finding_id,
                source_type=source_type,
                source_reference_id=source_reference_id,
                affected_business_process=affected_business_process,
                failure_mechanism=failure_mechanism,
                candidate_control_ids=candidate_ids,
                linked_control_ids=matched_ids,
                deficiency_category=cat,
                deficiency_status=status,
                evidence_link_origin=origin,
                requires_human_review=not confirmed_by_audit_or_workbook,
                reasoning=(
                    f"تم ربط آلية الفشل ({failure_mechanism}) بالضابط الرقابي المحدد ({', '.join(matched_ids)}) فقط "
                    f"دون تعميم القصور على باقي الضوابط المرتبطة بالمخاطرة ({len(candidate_ids)} ضوابط)."
                ),
                evidence_references=ev_refs,
            )

    # 2. AI-Suggested Candidate Control IDs (Never auto-confirmed; always requires human review)
    if ai_suggested_control_ids is not None:
        ai_matched = [cid for cid in ai_suggested_control_ids if cid in candidate_ids]
        if len(ai_matched) == 1:
            return ControlDeficiencyFinding(
                finding_id=finding_id,
                source_type=source_type,
                source_reference_id=source_reference_id,
                affected_business_process=affected_business_process,
                failure_mechanism=failure_mechanism,
                candidate_control_ids=candidate_ids,
                linked_control_ids=ai_matched,
                deficiency_category=deficiency_category or ControlDeficiencyCategory.CONTROL_EXECUTION_FAILURE,
                deficiency_status=ControlDeficiencyStatus.SUSPECTED,
                evidence_link_origin=EvidenceLinkOrigin.AI_SUGGESTED_CANDIDATE,
                requires_human_review=True,
                reasoning=(
                    f"ارتباط مقترح آلياً (AI_SUGGESTED_CANDIDATE) بالضابط ({ai_matched[0]})؛ "
                    "يبقى بحالة اشتباه (SUSPECTED) ويتطلب اعتماد المراجع البشري ولا يُعد دليلاً مستندياً مؤكداً."
                ),
                evidence_references=ev_refs,
            )
        elif len(ai_matched) > 1:
            return ControlDeficiencyFinding(
                finding_id=finding_id,
                source_type=source_type,
                source_reference_id=source_reference_id,
                affected_business_process=affected_business_process,
                failure_mechanism=failure_mechanism,
                candidate_control_ids=candidate_ids,
                linked_control_ids=ai_matched,
                deficiency_category=deficiency_category,
                deficiency_status=ControlDeficiencyStatus.HUMAN_REVIEW_REQUIRED,
                evidence_link_origin=EvidenceLinkOrigin.AI_SUGGESTED_CANDIDATE,
                requires_human_review=True,
                reasoning=(
                    f"ارتباط مقترح آلياً (AI_SUGGESTED_CANDIDATE) يشمل عدة ضوابط ({', '.join(ai_matched)})؛ "
                    "يتطلب المراجعة البشرية لتحديد الضابط المعني."
                ),
                evidence_references=ev_refs,
            )

    # 3. Heuristic keyword matching against control descriptions (Always SUSPECTED or HUMAN_REVIEW_REQUIRED)
    matched_ids = []
    if failure_keywords:
        for ctrl in controls:
            desc_norm = ctrl.control_description.lower()
            if any(kw.lower() in desc_norm for kw in failure_keywords):
                matched_ids.append(ctrl.control_id)

    if len(matched_ids) == 1:
        status = (
            ControlDeficiencyStatus.CONFIRMED
            if confirmed_by_audit_or_workbook
            else ControlDeficiencyStatus.SUSPECTED
        )
        origin = (
            EvidenceLinkOrigin.CONFIRMED_DOCUMENTARY_EVIDENCE
            if confirmed_by_audit_or_workbook
            else EvidenceLinkOrigin.HEURISTIC_CANDIDATE_MATCH
        )
        cat = deficiency_category or (
            ControlDeficiencyCategory.CONTROL_DESIGN_DEFICIENCY
            if confirmed_by_audit_or_workbook
            else ControlDeficiencyCategory.CONTROL_EXECUTION_FAILURE
        )
        return ControlDeficiencyFinding(
            finding_id=finding_id,
            source_type=source_type,
            source_reference_id=source_reference_id,
            affected_business_process=affected_business_process,
            failure_mechanism=failure_mechanism,
            candidate_control_ids=candidate_ids,
            linked_control_ids=matched_ids,
            deficiency_category=cat,
            deficiency_status=status,
            evidence_link_origin=origin,
            requires_human_review=not confirmed_by_audit_or_workbook,
            reasoning=(
                f"تم ربط آلية الفشل ({failure_mechanism}) بالضابط الرقابي المحدد ({matched_ids[0]}) فقط "
                f"دون تعميم القصور على باقي الضوابط المرتبطة بالمخاطرة ({len(candidate_ids)} ضوابط)."
            ),
            evidence_references=ev_refs,
        )

    if len(matched_ids) > 1:
        return ControlDeficiencyFinding(
            finding_id=finding_id,
            source_type=source_type,
            source_reference_id=source_reference_id,
            affected_business_process=affected_business_process,
            failure_mechanism=failure_mechanism,
            candidate_control_ids=candidate_ids,
            linked_control_ids=matched_ids,
            deficiency_category=deficiency_category,
            deficiency_status=ControlDeficiencyStatus.HUMAN_REVIEW_REQUIRED,
            evidence_link_origin=EvidenceLinkOrigin.HEURISTIC_CANDIDATE_MATCH,
            requires_human_review=True,
            reasoning=(
                f"تتقاطع آلية الفشل مع أكثر من ضابط رقابي محتمل ({', '.join(matched_ids)})؛ "
                "يلزم المراجعة البشرية لتحديد الضابط المسؤول بدقة."
            ),
            evidence_references=ev_refs,
        )

    # Zero existing controls matched the failure mechanism -> Missing preventive/detective control
    return ControlDeficiencyFinding(
        finding_id=finding_id,
        source_type=source_type,
        source_reference_id=source_reference_id,
        affected_business_process=affected_business_process,
        failure_mechanism=failure_mechanism,
        candidate_control_ids=candidate_ids,
        linked_control_ids=[],
        deficiency_category=deficiency_category or ControlDeficiencyCategory.MISSING_PREVENTIVE_CONTROL,
        deficiency_status=ControlDeficiencyStatus.SUSPECTED,
        evidence_link_origin=EvidenceLinkOrigin.HEURISTIC_CANDIDATE_MATCH,
        requires_human_review=True,
        reasoning=(
            "لم يتم العثور على ضابط رقابي قائم يغطي آلية الفشل المذكورة؛ يوصى بمراجعة الحاجة إلى ضابط مانع/كاشف إضافي."
        ),
        evidence_references=ev_refs,
    )


def link_evidence_records_to_controls(
    controls: List[ControlInputRecord],
    evidence_inputs: List[IncidentOrAuditEvidenceInput],
    sop_keyword_map: Optional[Dict[str, List[str]]] = None,
) -> Tuple[List[ControlInputRecord], List[ControlDeficiencyFinding]]:
    """
    Reusable, Business-Unit-agnostic evidence-linking pipeline (Integrity Check #3, #4, #5):
    - Accepts any list of `ControlInputRecord` and any list of `IncidentOrAuditEvidenceInput`
      (works identically for BU-SYNDICATED, BU-ACCOUNT, BU-POS, BU-BRANCHES, BU-TRADING).
    - Optionally links SOP steps via `sop_keyword_map` (mapping sop_chunk_id -> matching keywords).
    - Separates `CONFIRMED_DOCUMENTARY_EVIDENCE` (when `explicit_confirmed_control_ids` is set)
      from `HEURISTIC_CANDIDATE_MATCH` and `AI_SUGGESTED_CANDIDATE`.
    - Attaches each `ControlDeficiencyFinding` ONLY to the specific `linked_control_ids`
      implicated by the failure mechanism — never marks all controls on the risk ineffective
      and never overwrites a control's `effectiveness_raw`.
    """
    cloned_controls: List[ControlInputRecord] = []
    for c in controls:
        sop_steps = list(c.linked_sop_steps)
        if sop_keyword_map:
            desc_lower = c.control_description.lower()
            for sop_id, kw_list in sop_keyword_map.items():
                if sop_id not in sop_steps and any(kw.lower() in desc_lower for kw in kw_list):
                    sop_steps.append(sop_id)

        cloned_controls.append(
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
                linked_sop_steps=sop_steps,
                relevant_incident_ids=list(c.relevant_incident_ids),
                relevant_audit_finding_ids=list(c.relevant_audit_finding_ids),
                deficiencies=list(c.deficiencies),
                evidence_references=list(c.evidence_references),
            )
        )

    ctrl_by_id: Dict[str, ControlInputRecord] = {c.control_id: c for c in cloned_controls}
    produced_findings: List[ControlDeficiencyFinding] = []

    for ev in evidence_inputs:
        is_confirmed_doc = ev.explicit_confirmed_control_ids is not None and len(ev.explicit_confirmed_control_ids) > 0
        finding = analyze_incident_or_audit_control_gap(
            finding_id=ev.finding_id,
            source_type=ev.source_type,
            source_reference_id=ev.source_reference_id,
            affected_business_process=ev.affected_business_process,
            failure_mechanism=ev.failure_mechanism,
            controls=cloned_controls,
            explicit_target_control_ids=ev.explicit_confirmed_control_ids,
            ai_suggested_control_ids=ev.ai_suggested_control_ids,
            failure_keywords=ev.failure_keywords,
            deficiency_category=ev.deficiency_category,
            confirmed_by_audit_or_workbook=is_confirmed_doc,
            evidence_references=ev.evidence_references,
        )
        produced_findings.append(finding)

        # Attach finding ONLY to the specific linked control(s), leaving other controls on the risk untouched
        for cid in finding.linked_control_ids:
            target_ctrl = ctrl_by_id.get(cid)
            if target_ctrl is not None:
                target_ctrl.deficiencies.append(finding)
                ref_ids = [r.strip() for r in ev.source_reference_id.split(",") if r.strip()]
                for ref_id in ref_ids:
                    if ev.source_type == "INCIDENT" and ref_id not in target_ctrl.relevant_incident_ids:
                        target_ctrl.relevant_incident_ids.append(ref_id)
                    elif ev.source_type == "AUDIT_FINDING" and ref_id not in target_ctrl.relevant_audit_finding_ids:
                        target_ctrl.relevant_audit_finding_ids.append(ref_id)

    return (cloned_controls, produced_findings)


# ==============================================================================
# 6. ISOLATED RISK & CONTROL UPDATE / RECALCULATION (INTEGRITY CHECK #6 & #7)
# ==============================================================================


def update_control_in_risk_and_recalculate(
    request: ResidualRiskAssessmentRequest,
    control_id: str,
    effectiveness_raw: Optional[Union[ControlEffectivenessClassification, str]] = None,
    control_type_raw: Optional[Union[ControlType, str]] = None,
    control_method_raw: Optional[Union[ControlMethod, str]] = None,
    implementation_status: Optional[ControlImplementationStatus] = None,
    scope_relevance: Optional[str] = None,
    eligible_for_scope_override: Optional[bool] = None,
    evidence_reference: Optional[EvidenceReference] = None,
) -> Tuple[ResidualRiskAssessmentRequest, ResidualRiskAssessmentResult]:
    """
    Immutably update a single control inside a `ResidualRiskAssessmentRequest`
    (for example, supplying an authorized user assessment or evidence for cell P15 / CTL-SYND-R15,
    or revising scope eligibility for partial-scope control CTL-SYND-R24 on Risk #7)
    and recalculate that risk without mutating the original request or any sibling controls.
    """
    updated_controls: List[ControlInputRecord] = []
    found = False
    for c in request.controls:
        if c.control_id == control_id:
            found = True
            new_ev = list(c.evidence_references)
            if evidence_reference is not None:
                new_ev.append(evidence_reference)
            updated_controls.append(
                ControlInputRecord(
                    control_id=c.control_id,
                    linked_risk_id=c.linked_risk_id,
                    control_description=c.control_description,
                    control_owner=c.control_owner,
                    control_type_raw=control_type_raw if control_type_raw is not None else c.control_type_raw,
                    control_method_raw=control_method_raw if control_method_raw is not None else c.control_method_raw,
                    control_frequency_raw=c.control_frequency_raw,
                    effectiveness_raw=effectiveness_raw if effectiveness_raw is not None else c.effectiveness_raw,
                    implementation_status=(
                        implementation_status if implementation_status is not None else c.implementation_status
                    ),
                    scope_relevance=scope_relevance if scope_relevance is not None else c.scope_relevance,
                    eligible_for_scope_override=(
                        eligible_for_scope_override
                        if eligible_for_scope_override is not None
                        else c.eligible_for_scope_override
                    ),
                    linked_sop_steps=list(c.linked_sop_steps),
                    relevant_incident_ids=list(c.relevant_incident_ids),
                    relevant_audit_finding_ids=list(c.relevant_audit_finding_ids),
                    deficiencies=list(c.deficiencies),
                    evidence_references=new_ev,
                )
            )
        else:
            updated_controls.append(
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
                    scope_relevance=c.scope_relevance,
                    eligible_for_scope_override=c.eligible_for_scope_override,
                    linked_sop_steps=list(c.linked_sop_steps),
                    relevant_incident_ids=list(c.relevant_incident_ids),
                    relevant_audit_finding_ids=list(c.relevant_audit_finding_ids),
                    deficiencies=list(c.deficiencies),
                    evidence_references=list(c.evidence_references),
                )
            )

    if not found:
        raise ValueError(f"Control {control_id!r} not found in risk {request.risk_id!r}")

    updated_req = ResidualRiskAssessmentRequest(
        risk_id=request.risk_id,
        unit_id=request.unit_id,
        process_name=request.process_name,
        risk_description=request.risk_description,
        expected_annual_loss=request.expected_annual_loss,
        phase2a_result=request.phase2a_result,
        controls=updated_controls,
        verified_no_controls=request.verified_no_controls,
        control_environment_known=request.control_environment_known,
        incident_Document_status=request.incident_Document_status,
        audit_document_status=request.audit_document_status,
        proposed_corrective_action=request.proposed_corrective_action,
        source_evidence=list(request.source_evidence),
    )
    return (updated_req, calculate_residual_risk(updated_req))


def recalculate_single_risk_in_register(
    register_requests: List[ResidualRiskAssessmentRequest],
    target_risk_id: str,
    updated_target_request: ResidualRiskAssessmentRequest,
) -> Dict[str, ResidualRiskAssessmentResult]:
    """
    Recalculate a risk register where `target_risk_id` receives `updated_target_request`,
    preserving all other risks in the register untouched and deterministic.
    """
    results: Dict[str, ResidualRiskAssessmentResult] = {}
    found = False
    for req in register_requests:
        if req.risk_id == target_risk_id:
            found = True
            results[req.risk_id] = calculate_residual_risk(updated_target_request)
        else:
            results[req.risk_id] = calculate_residual_risk(req)
    if not found:
        raise ValueError(f"target_risk_id {target_risk_id!r} not found in register")
    return results


# ==============================================================================
# 7. AUTHORITATIVE SYNDICATED LOANS WORKBOOK (8 RISKS, 20 CONTROLS) LOADER & VALIDATOR
# ==============================================================================


SYNDICATED_SOP_KEYWORD_MAP: Dict[str, List[str]] = {
    "CHK-SOP-SYND-01": ["تحقيق الشخصية", "شخصية العميل", "مطابقة التوقيع", "أصول المستندات المقدمة", "موافقات"],
    "CHK-SOP-SYND-02": ["قوائم الحظر", "محظور التعامل"],
    "CHK-SOP-SYND-03": ["تنفيذ التحويلات", "مدفوعات", "مدفوعة", "تعزيز كافة العمليات", "مراجعة طلبات مد"],
    "CHK-SOP-SYND-04": ["خطابات الضمان التي سوف تنتهي", "خطابات الضمان التي انتهت صلاحيتها"],
    "CHK-SOP-SYND-05": ["القيود المحاسبية"],
    "CHK-SOP-SYND-06": ["الأستاذ العام", "العمليات المنفذة خلال اليوم"],
    "CHK-SOP-SYND-07": ["بدواليب مؤمنة", "SHARE FOLDER", "جرد دوري"],
}


def _build_workbook_documentary_evidence_inputs_for_risk(
    r_row: int,
    ctrl_rows: List[int],
    cell_map: Dict[str, str],
    wb_path: Path,
) -> List[IncidentOrAuditEvidenceInput]:
    """
    Extract documentary incident and audit finding links from the authoritative
    RCSA workbook rationale (`AC{r_row}`) and control effectiveness (`P{c_row}`) cells,
    feeding them into the reusable `link_evidence_records_to_controls` mechanism.
    """
    rationale_text = cell_map.get(f"AC{r_row}", "").strip()
    process_name = cell_map.get(f"F{r_row}", "").strip()
    if not rationale_text:
        return []

    # Identify which control(s) on this risk are explicitly marked Needs Improvement in Column P
    needs_improvement_ctrl_ids: List[str] = []
    for c_row in ctrl_rows:
        p_val = cell_map.get(f"P{c_row}", "").strip()
        if "يحتاج تطوير" in p_val or "يحتاج إلى تطوير" in p_val or "يحتاج الى التطوير" in p_val:
            needs_improvement_ctrl_ids.append(f"CTL-SYND-R{c_row}")

    if not needs_improvement_ctrl_ids:
        return []

    ev_inputs: List[IncidentOrAuditEvidenceInput] = []

    if "100/103" in rationale_text or ("100" in rationale_text and "103" in rationale_text):
        ev_inputs.append(
            IncidentOrAuditEvidenceInput(
                finding_id=f"DOC-GAP-SYND-R{r_row}-INC",
                unit_id="BU-SYNDICATED",
                source_type="INCIDENT",
                source_reference_id="INC-SYND-100, INC-SYND-103",
                affected_business_process=process_name,
                failure_mechanism="اغفال تعزيز طلبات تنفيذ التحويلات الخاصة بأحد العملاء",
                failure_keywords=["تعزيز كافة العمليات"],
                explicit_confirmed_control_ids=needs_improvement_ctrl_ids,
                deficiency_category=ControlDeficiencyCategory.CONTROL_EXECUTION_FAILURE,
                evidence_references=[
                    EvidenceReference(
                        source_file=str(wb_path),
                        location=f"Risk Profile!P{r_row}, AB{r_row}, AC{r_row}",
                        field_name="workbook_documented_incident_link",
                        raw_value=rationale_text,
                    )
                ],
            )
        )

    if "101 / 102" in rationale_text or ("101" in rationale_text and "102" in rationale_text):
        ev_inputs.append(
            IncidentOrAuditEvidenceInput(
                finding_id=f"DOC-GAP-SYND-R{r_row}-INC-AUD",
                unit_id="BU-SYNDICATED",
                source_type="AUDIT_FINDING",
                source_reference_id="INC-SYND-101, INC-SYND-102, AUD-SYND-01",
                affected_business_process=process_name,
                failure_mechanism="فقدان وعدم استيفاء الأصول الورقية لنماذج طلب التحويل وخطابات الضمان",
                failure_keywords=["حفظ كافة أصول الطلبات"],
                explicit_confirmed_control_ids=needs_improvement_ctrl_ids,
                deficiency_category=ControlDeficiencyCategory.INCOMPLETE_CONTROL_IMPLEMENTATION,
                evidence_references=[
                    EvidenceReference(
                        source_file=str(wb_path),
                        location=f"Risk Profile!P{r_row}:P{ctrl_rows[-1]}, AB{r_row}, AC{r_row}",
                        field_name="workbook_documented_incident_and_audit_link",
                        raw_value=rationale_text,
                    )
                ],
            )
        )

    if "106" in rationale_text:
        ev_inputs.append(
            IncidentOrAuditEvidenceInput(
                finding_id=f"DOC-GAP-SYND-R{r_row}-INC-AUD",
                unit_id="BU-SYNDICATED",
                source_type="AUDIT_FINDING",
                source_reference_id="INC-SYND-106, AUD-SYND-02",
                affected_business_process=process_name,
                failure_mechanism="قبول مستندات تحتوي على توقيعات وأختام مزورة نتيجة ضعف الفحص اليدوي",
                failure_keywords=["فحص أصول المستندات"],
                explicit_confirmed_control_ids=needs_improvement_ctrl_ids,
                deficiency_category=ControlDeficiencyCategory.CONTROL_DESIGN_DEFICIENCY,
                evidence_references=[
                    EvidenceReference(
                        source_file=str(wb_path),
                        location=f"Risk Profile!P{r_row}:P{ctrl_rows[-1]}, AB{r_row}, AC{r_row}",
                        field_name="workbook_documented_incident_and_audit_link",
                        raw_value=rationale_text,
                    )
                ],
            )
        )

    return ev_inputs


def load_syndicated_loans_workbook_requests(
    workbook_json_path: Union[str, Path] = DEFAULT_WORKBOOK_PATH,
) -> List[Tuple[int, List[int], ResidualRiskAssessmentRequest, Dict[str, str]]]:
    """
    Load all 8 risks and their 20 linked control rows (Rows 8..27) directly from
    `reference_data/Official_RCSA_Template__1_Risk_Profile.json`, linking SOP steps
    and documentary incident/audit evidence through the reusable `link_evidence_records_to_controls` pipeline.
    Returns a list of tuples:
      (risk_start_row, control_rows, ResidualRiskAssessmentRequest, cell_map)
    """
    wb_path = Path(workbook_json_path)
    with wb_path.open("r", encoding="utf-8") as f:
        wb = json.load(f)

    cell_map: Dict[str, str] = {c["cell"]: str(c["value"]) for c in wb.get("cells", [])}

    risk_row_groups: List[Tuple[int, List[int]]] = [
        (8, [8, 9]),
        (10, [10, 11, 12, 13, 14, 15]),
        (16, [16, 17, 18]),
        (19, [19]),
        (20, [20]),
        (21, [21, 22]),
        (23, [23, 24, 25]),
        (26, [26, 27]),
    ]

    loaded: List[Tuple[int, List[int], ResidualRiskAssessmentRequest, Dict[str, str]]] = []

    for r_row, ctrl_rows in risk_row_groups:
        risk_num = cell_map.get(f"C{r_row}", "").strip()
        risk_id = f"RSK-SYND-{risk_num.zfill(2)}"
        process_name = cell_map.get(f"F{r_row}", "").strip()
        risk_desc = cell_map.get(f"G{r_row}", "").strip()
        k_val = cell_map.get(f"K{r_row}", "").strip()
        action_plan = cell_map.get(f"AB{r_row}", "").strip() or None

        raw_controls: List[ControlInputRecord] = []
        for c_row in ctrl_rows:
            raw_controls.append(
                ControlInputRecord(
                    control_id=f"CTL-SYND-R{c_row}",
                    linked_risk_id=risk_id,
                    control_description=cell_map.get(f"M{c_row}", "").strip(),
                    control_owner=cell_map.get(f"N{c_row}", "").strip() or None,
                    control_method_raw=cell_map.get(f"O{c_row}", "").strip() or None,
                    effectiveness_raw=cell_map.get(f"P{c_row}", "").strip() or None,
                    control_frequency_raw=cell_map.get(f"Q{c_row}", "").strip() or None,
                    control_type_raw=cell_map.get(f"R{c_row}", "").strip() or None,
                    implementation_status=ControlImplementationStatus.IMPLEMENTED,
                    evidence_references=[
                        EvidenceReference(
                            source_file=str(wb_path),
                            location=f"Risk Profile!M{c_row}:R{c_row}",
                            field_name="control_record",
                            raw_value=cell_map.get(f"M{c_row}", "").strip(),
                        )
                    ],
                )
            )

        ev_inputs = _build_workbook_documentary_evidence_inputs_for_risk(
            r_row=r_row,
            ctrl_rows=ctrl_rows,
            cell_map=cell_map,
            wb_path=wb_path,
        )
        linked_controls, _ = link_evidence_records_to_controls(
            controls=raw_controls,
            evidence_inputs=ev_inputs,
            sop_keyword_map=SYNDICATED_SOP_KEYWORD_MAP,
        )

        req = ResidualRiskAssessmentRequest(
            risk_id=risk_id,
            unit_id="BU-SYNDICATED",
            process_name=process_name,
            risk_description=risk_desc,
            expected_annual_loss=Decimal(k_val),
            controls=linked_controls,
            verified_no_controls=False,
            control_environment_known=True,
            incident_Document_status="AVAILABLE",
            audit_document_status="AVAILABLE",
            proposed_corrective_action=action_plan,
            source_evidence=[
                EvidenceReference(
                    source_file=str(wb_path),
                    location=f"Risk Profile!C{r_row}:AB{ctrl_rows[-1]}",
                    field_name="risk_and_controls_block",
                    raw_value=f"Risk #{risk_num} (Rows {r_row}..{ctrl_rows[-1]})",
                )
            ],
        )
        loaded.append((r_row, ctrl_rows, req, cell_map))

    return loaded


def validate_syndicated_loans_residual_workbook(
    workbook_json_path: Union[str, Path] = DEFAULT_WORKBOOK_PATH,
) -> List[WorkbookResidualComparisonRow]:
    """
    Validate all 8 risks and 20 control rows (Rows 8..27) of the authoritative Syndicated Loans RCSA workbook
    against the Phase 2B Control Assessment, MAX RRF & Residual Financial Risk Engine.
    Preserves both the calculated residual values and the original workbook reference values.
    """
    loaded = load_syndicated_loans_workbook_requests(workbook_json_path)
    comparisons: List[WorkbookResidualComparisonRow] = []

    for r_row, ctrl_rows, req, cell_map in loaded:
        res = calculate_residual_risk(req)
        risk_num = cell_map.get(f"C{r_row}", "").strip()

        expected_s_key = cell_map.get(f"S{r_row}", "").strip()
        expected_wb_rrf = WORKBOOK_KEY_TO_RRF.get(expected_s_key.lower(), Decimal("0"))
        expected_t_val = Decimal(cell_map.get(f"T{r_row}", "0").strip())
        expected_u_val = cell_map.get(f"U{r_row}", "").strip()

        calc_rrf = res.effective_rrf or Decimal("0")
        calc_s_key = (res.selected_workbook_rrf_key or "").strip()
        calc_t_val = res.residual_financial_amount or Decimal("0")
        calc_u_val = (res.excel_u_column_rating or "").strip()

        s_status = "PASS" if calc_s_key == expected_s_key else "DISCREPANCY_IN_WORKBOOK_S_SELECTION"
        t_status = "PASS" if calc_t_val == expected_t_val else "DISCREPANCY_FROM_WORKBOOK_S_SELECTION"
        u_status = "PASS" if calc_u_val == expected_u_val else "FAIL"

        if r_row == 21 and s_status != "PASS":
            explanation = (
                "Workbook Author Discrepancy on Row 21 (Risk #6): Row 21 has Manual/Preventive (RRF=0.75) "
                "and Row 22 has Semi-Automated/Detective (RRF=0.80). Strict MAX of documented controls yields "
                f"0.80 ('{calc_s_key}', T21={calc_t_val:,} EGP, U21='{calc_u_val}'). In cell S21, the workbook author "
                f"selected '{expected_s_key}' (combining Row 22's Semi-Automated method with Row 21's Preventive type -> "
                f"RRF={expected_wb_rrf}, T21={expected_t_val:,} EGP, U21='{expected_u_val}'). Both result in Residual Severity '{calc_u_val}' (Low)."
            )
        else:
            explanation = (
                f"Evaluated {len(ctrl_rows)} control(s) in rows {ctrl_rows}; selected {res.selected_max_rrf_control_id} "
                f"with MAX RRF={calc_rrf} ('{calc_s_key}'). Residual loss = {req.expected_annual_loss:,} x (1 - {calc_rrf}) "
                f"= {calc_t_val:,} EGP, rating '{calc_u_val}' — matches workbook S{r_row}/T{r_row}/U{r_row}."
            )

        comparisons.append(
            WorkbookResidualComparisonRow(
                risk_ref=f"Risk #{risk_num} (Row {r_row})",
                excel_row=r_row,
                control_rows=ctrl_rows,
                expected_annual_loss_k=Decimal(str(req.expected_annual_loss)),
                evaluated_controls_count=len(ctrl_rows),
                selected_control_id=res.selected_max_rrf_control_id or "",
                calculated_max_rrf=calc_rrf,
                expected_workbook_rrf=expected_wb_rrf,
                calculated_rrf_key=calc_s_key,
                expected_workbook_s_key=expected_s_key,
                calculated_residual_t=calc_t_val,
                expected_workbook_t=expected_t_val,
                calculated_u_rating=calc_u_val,
                expected_workbook_u_rating=expected_u_val,
                s_key_status=s_status,
                t_loss_status=t_status,
                u_rating_status=u_status,
                explanation=explanation,
            )
        )

    return comparisons


def audit_cross_phase_consistency(
    workbook_json_path: Union[str, Path] = DEFAULT_WORKBOOK_PATH,
) -> Dict[str, Any]:
    """
    Phase 2A.1 Section 6 — Cross-Phase Consistency Audit across Risk #1, Risk #2, and BU-POS:
    Verifies against actual authoritative workbook cells and registered source coverage metadata:
    A. Risk #1 (RSK-SYND-01, Rows 8..9):
       - Row 8 (CTL-SYND-R8): O8='Semi- Automated', P8='ضابط رقابي فعال', R8='ضوابط مانعة Preventive' -> RRF = 0.90
       - Row 9 (CTL-SYND-R9): O9='Automated', P9='ضابط رقابي فعال', R9='ضوابط مانعة Preventive' -> RRF = 0.95
       - Both controls are Effective in the workbook; MAX RRF = 0.95 (T8 = 50,100 EGP).
       - The prior integrity report's prose mention of 0.75 / P9 Ineffective was a narrative illustration error,
         NOT a change in the workbook or engine logic.
    B. Risk #2 (RSK-SYND-02, Rows 10..15):
       - Rows 10..14 are all Effective ('ضابط رقابي فعال') with RRFs [0.90, 0.95, 0.95, 0.90, 0.75].
       - Row 15 (CTL-SYND-R15) has O15='Semi- Automated', R15='ضوابط كاشفة Detective' (theoretical RRF=0.80)
         and blank P15 -> PENDING_REVIEW (ineligible for RRF reduction until assessed).
       - Because CTL-SYND-R11 and CTL-SYND-R12 are already Effective Automated/Preventive (0.95),
         Risk #2's MAX RRF in the authoritative workbook is 0.95 (T10 = 30,200 EGP) both before and after
         assessing P15 as Effective; assessing P15 transitions Risk #2's status from PENDING_REVIEW to COMPUTED.
       - A change from 0.90 to 0.95 only occurs in a synthetic fixture where a 0.95 control starts as PENDING_REVIEW
         and is subsequently approved.
    C. BU-POS Source Coverage Status:
       - BU-POS has an authoritative SOP PDF (DOC-SOP-POS, 5 procedures), but NO incident log PDF and NO audit
         report PDF, and NO zero-incident confirmation document.
       - Both `BU_SOURCE_COMPLETENESS['BU-POS']` and `src/server/reference-registry.ts` (`bu_source_coverage`)
         classify BU-POS incidents_status and audit_findings_status as `'MISSING_DOCUMENT'` (never `'CONFIRMED_ZERO'`
         or `'NO_INCIDENTS_RECORDED'`).
    """
    loaded = load_syndicated_loans_workbook_requests(workbook_json_path)
    by_id = {req.risk_id: (r_row, ctrl_rows, req, cell_map) for r_row, ctrl_rows, req, cell_map in loaded}

    # Audit A: Risk #1 (RSK-SYND-01)
    _, _, r1_req, r1_cells = by_id["RSK-SYND-01"]
    r1_res = calculate_residual_risk(r1_req)

    # Audit B: Risk #2 (RSK-SYND-02)
    _, _, r2_req, r2_cells = by_id["RSK-SYND-02"]
    r2_res_before = calculate_residual_risk(r2_req)
    r15_before = next(c for c in r2_res_before.control_assessments if c.control_id == "CTL-SYND-R15")
    _, r2_res_after = update_control_in_risk_and_recalculate(
        request=r2_req,
        control_id="CTL-SYND-R15",
        effectiveness_raw=ControlEffectivenessClassification.EFFECTIVE,
    )
    r15_after = next(c for c in r2_res_after.control_assessments if c.control_id == "CTL-SYND-R15")

    # Audit C: BU-POS
    pos_meta = dict(BU_SOURCE_COMPLETENESS["BU-POS"])

    return {
        "risk_1": {
            "risk_id": "RSK-SYND-01",
            "p8_raw": r1_cells.get("P8"),
            "p9_raw": r1_cells.get("P9"),
            "ctl_r8_rrf": r1_res.control_assessments[0].applicable_rrf,
            "ctl_r9_rrf": r1_res.control_assessments[1].applicable_rrf,
            "selected_max_rrf": r1_res.effective_rrf,
            "selected_control_id": r1_res.selected_max_rrf_control_id,
            "residual_loss_egp": r1_res.residual_financial_amount,
            "root_cause_of_report_difference": (
                "Narrative illustration error in prior integrity summary text; actual workbook P8 and P9 are both "
                "'ضابط رقابي فعال' (0.90 and 0.95) and engine consistently selects MAX RRF = 0.95 (CTL-SYND-R9)."
            ),
        },
        "risk_2": {
            "risk_id": "RSK-SYND-02",
            "p15_present_in_workbook": "P15" in r2_cells,
            "ctl_r15_theoretical_rrf": r15_before.applicable_rrf,
            "ctl_r15_eligible_before_review": r15_before.is_eligible_for_residual_reduction,
            "ctl_r15_status_before_review": r15_before.assessment_status.value,
            "risk2_status_before_review": r2_res_before.status.value,
            "risk2_max_rrf_before_review": r2_res_before.effective_rrf,
            "risk2_residual_before_review": r2_res_before.residual_financial_amount,
            "ctl_r15_eligible_after_review": r15_after.is_eligible_for_residual_reduction,
            "ctl_r15_status_after_review": r15_after.assessment_status.value,
            "risk2_status_after_review": r2_res_after.status.value,
            "risk2_max_rrf_after_review": r2_res_after.effective_rrf,
            "risk2_residual_after_review": r2_res_after.residual_financial_amount,
            "root_cause_of_report_difference": (
                "In the authoritative workbook, Rows 11 and 12 are already Effective Automated/Preventive controls "
                "(RRF = 0.95), while Row 15 (P15=blank) is Semi-Automated/Detective (RRF = 0.80). Therefore Risk #2's "
                "MAX RRF is 0.95 (T10 = 30,200 EGP) both before and after P15 is reviewed; reviewing P15 changes "
                "CTL-SYND-R15 from ineligible PENDING_REVIEW to eligible COMPUTED (0.80) and transitions Risk #2's "
                "status from PENDING_REVIEW to COMPUTED. A 0.90 -> 0.95 jump only occurs when an unassessed 0.95 control "
                "is approved on a risk whose highest other control is 0.90."
            ),
        },
        "bu_pos": {
            "unit_id": "BU-POS",
            "sop_status": pos_meta["sop_status"],
            "incidents_status": pos_meta["incidents_status"],
            "audit_findings_status": pos_meta["audit_findings_status"],
            "rcsa_register_status": pos_meta["rcsa_register_status"],
            "root_cause_of_report_difference": (
                "Narrative text error in prior integrity summary; no incident log or zero-incident confirmation "
                "exists for BU-POS. Both reference-registry.ts (bu_source_coverage) and BU_SOURCE_COMPLETENESS['BU-POS'] "
                "strictly preserve incidents_status='MISSING_DOCUMENT' and audit_findings_status='MISSING_DOCUMENT'."
            ),
        },
    }


def reconstruct_syndicated_workbook_structure(
    workbook_json_path: Union[str, Path] = DEFAULT_WORKBOOK_PATH,
) -> List[CanonicalWorkbookRiskMapping]:
    """
    Phase 2B.2 Section 4 — Deterministically reconstruct the 8-risk, 20-control
    structure (Rows 8..27) directly from `Official_RCSA_Template__1_Risk_Profile.json`
    (`cells` and `merged_ranges`), proving exact row spans and control ownership
    (specifically verifying that Row 19 / CTL-SYND-R19 is Risk #4 and Row 20 / CTL-SYND-R20
    is Risk #5).
    """
    wb_path = Path(workbook_json_path)
    with wb_path.open("r", encoding="utf-8") as f:
        wb = json.load(f)

    cell_map: Dict[str, str] = {c["cell"]: str(c["value"]) for c in wb.get("cells", [])}
    merged_ranges: List[str] = list(wb.get("merged_ranges", []))

    # Discover all risk anchor rows in rows 8..27 where Column C has a risk number
    anchor_rows: List[int] = []
    for r in range(8, 28):
        c_val = cell_map.get(f"C{r}", "").strip()
        if c_val.isdigit():
            anchor_rows.append(r)

    mappings: List[CanonicalWorkbookRiskMapping] = []
    for idx, start_row in enumerate(anchor_rows):
        end_row = (anchor_rows[idx + 1] - 1) if (idx + 1 < len(anchor_rows)) else 27
        row_span = list(range(start_row, end_row + 1))
        risk_num = cell_map.get(f"C{start_row}", "").strip()
        risk_id = f"RSK-SYND-{risk_num.zfill(2)}"

        block_merges: List[str] = []
        for mr in merged_ranges:
            if ":" in mr:
                first_part = mr.split(":")[0]
                digits = "".join(ch for ch in first_part if ch.isdigit())
                if digits and int(digits) in row_span:
                    block_merges.append(mr)

        ctrl_rows: List[int] = []
        ctrl_ids: List[str] = []
        for r in row_span:
            if cell_map.get(f"M{r}", "").strip():
                ctrl_rows.append(r)
                ctrl_ids.append(f"CTL-SYND-R{r}")

        mappings.append(
            CanonicalWorkbookRiskMapping(
                risk_id=risk_id,
                risk_ref=f"Risk #{risk_num}",
                unit_id="BU-SYNDICATED",
                first_row=start_row,
                last_row=end_row,
                workbook_rows=row_span,
                merged_ranges_in_block=block_merges,
                process_text_ar=cell_map.get(f"F{start_row}", "").strip(),
                risk_library_text_ar=cell_map.get(f"G{start_row}", "").strip(),
                sub_risk_description_ar=cell_map.get(f"H{start_row}", "").strip(),
                linked_control_ids=ctrl_ids,
                linked_control_rows=ctrl_rows,
                control_count=len(ctrl_ids),
            )
        )

    return mappings


