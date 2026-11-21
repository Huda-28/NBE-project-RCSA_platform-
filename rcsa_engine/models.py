"""
Domain Models for Phase 2A — Financial & Inherent Risk Assessment Engine.
Uses Pydantic BaseModel when installed, with a standard-library compatibility layer
for slim container environments without pip/pydantic preinstalled.
"""

from __future__ import annotations

from decimal import Decimal
from enum import Enum
from typing import Any, Dict, List, Optional, Union

try:
    from pydantic import BaseModel, Field  # type: ignore
    PYDANTIC_AVAILABLE = True
except ImportError:
    PYDANTIC_AVAILABLE = False

    def Field(default: Any = None, default_factory: Any = None, **kwargs: Any) -> Any:
        if default_factory is not None:
            return default_factory
        return default

    class BaseModel:  # type: ignore[no-redef]
        """Lightweight Pydantic-compatible BaseModel fallback for stdlib-only runtimes."""

        def __init__(self, **data: Any) -> None:
            annotations = {}
            for cls in reversed(self.__class__.__mro__):
                annotations.update(getattr(cls, "__annotations__", {}))
            for name in annotations:
                if name in data:
                    val = data[name]
                else:
                    default_attr = getattr(self.__class__, name, None)
                    if callable(default_attr) and default_attr in (list, dict):
                        val = default_attr()
                    else:
                        val = default_attr
                setattr(self, name, val)
            for k, v in data.items():
                if not hasattr(self, k):
                    setattr(self, k, v)

        def model_dump(self) -> Dict[str, Any]:
            out: Dict[str, Any] = {}
            for k, v in self.__dict__.items():
                if isinstance(v, BaseModel):
                    out[k] = v.model_dump()
                elif isinstance(v, list):
                    out[k] = [x.model_dump() if isinstance(x, BaseModel) else x for x in v]
                elif isinstance(v, Enum):
                    out[k] = v.value
                else:
                    out[k] = v
            return out

        def dict(self) -> Dict[str, Any]:
            return self.model_dump()


class CalculationStatus(str, Enum):
    COMPUTED = "COMPUTED"
    PENDING_INPUT = "PENDING_INPUT"


class SeverityCode(str, Enum):
    L = "L"
    M = "M"
    H = "H"
    VH = "VH"
    C = "C"


class HeatMapZone(str, Enum):
    GREEN = "GREEN"
    YELLOW = "YELLOW"
    ORANGE = "ORANGE"
    RED = "RED"


class Page6InherentZone(str, Enum):
    STANDARD_ZONE = "STANDARD_ZONE"
    RED_ESCALATION_ZONE = "RED_ESCALATION_ZONE"


class FinancialValueOrigin(str, Enum):
    TEMPLATE_REFERENCE_AMOUNT = "TEMPLATE_REFERENCE_AMOUNT"
    DOCUMENTED_HISTORICAL_INCIDENT = "DOCUMENTED_HISTORICAL_INCIDENT"
    HIGHEST_RELEVANT_INCIDENT_LOSS = "HIGHEST_RELEVANT_INCIDENT_LOSS"
    EXPLICIT_HUMAN_ESTIMATE = "EXPLICIT_HUMAN_ESTIMATE"
    MISSING_OR_UNSUPPORTED = "MISSING_OR_UNSUPPORTED"
    UNSPECIFIED = "UNSPECIFIED"


class FrequencyEvidenceOrigin(str, Enum):
    SOURCE_DOCUMENTED_FREQUENCY = "SOURCE_DOCUMENTED_FREQUENCY"
    AUTHORIZED_USER_ESTIMATE = "AUTHORIZED_USER_ESTIMATE"
    FREQUENCY_REQUIRING_REVIEW = "FREQUENCY_REQUIRING_REVIEW"
    MISSING_FREQUENCY = "MISSING_FREQUENCY"


class WorkbookReconciliationStatus(str, Enum):
    MATCH = "MATCH"
    EXPLAINED_DIFFERENCE = "EXPLAINED_DIFFERENCE"
    REQUIRES_REVIEW = "REQUIRES_REVIEW"


class ZeroOrMissingFinancialStatus(str, Enum):
    """
    Phase 2B.2 Section 6 — Explicitly distinguishes zero, missing, or unsupported
    financial impact states. None of the zero/missing states may automatically assign
    L severity or complete a financial calculation without explicit positive impact.
    """
    NOT_APPLICABLE_POSITIVE_AMOUNT = "NOT_APPLICABLE_POSITIVE_AMOUNT"
    VERIFIED_ZERO_LOSS = "VERIFIED_ZERO_LOSS"
    NO_INCIDENT_LOSS_REPORTED = "NO_INCIDENT_LOSS_REPORTED"
    MISSING_FINANCIAL_IMPACT = "MISSING_FINANCIAL_IMPACT"
    UNKNOWN_FINANCIAL_IMPACT = "UNKNOWN_FINANCIAL_IMPACT"


class EvidenceReference(BaseModel):
    source_file: str
    location: str
    field_name: str
    raw_value: Optional[str] = None


class CalculationStepTrace(BaseModel):
    step_number: int
    step_name: str
    methodology_reference: str
    formula_or_rule: str
    inputs: Dict[str, Any] = Field(default_factory=dict)
    output: Any = None


class IncidentFinancialEvidenceRecord(BaseModel):
    """
    Authoritative historical incident record for evidence-based financial impact selection.
    Linked to risks strictly by Business Unit, process, event, and failure mechanism.
    """
    incident_id: str
    incident_code: str
    unit_id: str
    process_name: str
    event_summary_ar: str
    incident_detail_ar: str
    failure_mechanism_keywords: List[str] = Field(default_factory=list)
    net_loss_amount: Decimal
    risk_category_l1: Optional[str] = None
    mapped_l1_id: Optional[str] = None
    occurrence_date_or_period: Optional[str] = None
    source_document_id: str = ""


class FinancialImpactSelectionDecision(BaseModel):
    """
    Preserves the original amount, proposed evidence-based amount, selected amount,
    evidence origin, linked vs. excluded incidents, and selection rationale separately.
    Never sums independent incident losses to determine single-event impact.
    """
    unit_id: Optional[str] = None
    risk_id: Optional[str] = None
    original_amount: Optional[Decimal] = None
    original_amount_origin: FinancialValueOrigin = FinancialValueOrigin.MISSING_OR_UNSUPPORTED
    selected_amount: Optional[Decimal] = None
    selected_amount_origin: FinancialValueOrigin = FinancialValueOrigin.MISSING_OR_UNSUPPORTED
    proposed_evidence_amount: Optional[Decimal] = None
    proposed_evidence_origin: Optional[FinancialValueOrigin] = None
    highest_relevant_incident_id: Optional[str] = None
    relevant_incident_ids: List[str] = Field(default_factory=list)
    relevant_incident_losses_egp: List[Decimal] = Field(default_factory=list)
    excluded_unrelated_incident_ids: List[str] = Field(default_factory=list)
    aggregation_rule: str = "SINGLE_EVENT_MAX_INDIVIDUAL_LOSS_NO_SUMMATION"
    zero_or_missing_status: ZeroOrMissingFinancialStatus = (
        ZeroOrMissingFinancialStatus.NOT_APPLICABLE_POSITIVE_AMOUNT
    )
    requires_reviewer_clarification: bool = False
    clarification_reasons: List[str] = Field(default_factory=list)
    selection_rationale: str = ""
    source_references: List[EvidenceReference] = Field(default_factory=list)


class FrequencyValidationDecision(BaseModel):
    """
    Distinguishes source-documented frequency, authorized user estimate,
    frequency requiring review, and missing frequency.
    Prohibits deriving frequency from incident count alone without a valid observation period
    and supporting reasoning, and never treats missing incidents as zero probability.
    """
    raw_frequency_text: Optional[str] = None
    normalized_frequency_level: Optional[int] = None
    normalized_frequency_label_ar: Optional[str] = None
    normalized_frequency_label_en: Optional[str] = None
    annual_frequency_multiplier: Optional[Decimal] = None
    frequency_origin: FrequencyEvidenceOrigin = FrequencyEvidenceOrigin.MISSING_FREQUENCY
    observed_incident_count: Optional[int] = None
    observation_period_years: Optional[Decimal] = None
    supporting_reasoning: Optional[str] = None
    incidents_document_status: str = "AVAILABLE"
    is_valid_for_calculation: bool = False
    requires_reviewer_clarification: bool = False
    clarification_reasons: List[str] = Field(default_factory=list)
    validation_rationale: str = ""


class FinancialInherentRequest(BaseModel):
    risk_ref: Optional[str] = None
    risk_id: Optional[str] = None
    unit_id: Optional[str] = None
    process_name: Optional[str] = None
    risk_description: Optional[str] = None
    individual_financial_impact: Optional[Union[Decimal, int, float, str]] = None
    financial_value_origin: Optional[FinancialValueOrigin] = None
    expected_frequency_text: Optional[str] = None
    expected_frequency_level: Optional[int] = None
    frequency_origin: Optional[FrequencyEvidenceOrigin] = None
    failure_mechanism_keywords: List[str] = Field(default_factory=list)
    candidate_incidents: List[IncidentFinancialEvidenceRecord] = Field(default_factory=list)
    explicit_linked_incident_ids: Optional[List[str]] = None
    observed_incident_count: Optional[int] = None
    observation_period_years: Optional[Union[Decimal, int, float, str]] = None
    frequency_supporting_reasoning: Optional[str] = None
    incidents_document_status: str = "AVAILABLE"
    workbook_cached_k_loss: Optional[Union[Decimal, int, float, str]] = None
    workbook_cached_l_rating: Optional[str] = None
    workbook_k_formula: Optional[str] = None
    workbook_l_formula: Optional[str] = None
    workbook_ac_rationale: Optional[str] = None
    source_evidence: List[EvidenceReference] = Field(default_factory=list)


class FinancialInherentResult(BaseModel):
    status: CalculationStatus
    missing_fields: List[str] = Field(default_factory=list)
    message_ar: str = ""

    risk_ref: Optional[str] = None
    risk_id: Optional[str] = None
    unit_id: Optional[str] = None
    process_name: Optional[str] = None
    risk_description: Optional[str] = None

    # 1. Individual Financial Impact (J{row} & Methodology Page 3 Financial Impact Table)
    individual_financial_impact: Optional[Decimal] = None
    financial_value_origin: Optional[FinancialValueOrigin] = None
    zero_or_missing_status: ZeroOrMissingFinancialStatus = (
        ZeroOrMissingFinancialStatus.NOT_APPLICABLE_POSITIVE_AMOUNT
    )
    individual_impact_level: Optional[int] = None
    individual_impact_rating: Optional[SeverityCode] = None
    individual_impact_label_ar: Optional[str] = None
    individual_impact_label_en: Optional[str] = None
    impact_selection_decision: Optional[FinancialImpactSelectionDecision] = None
    linked_incident_ids: List[str] = Field(default_factory=list)
    excluded_unrelated_incident_ids: List[str] = Field(default_factory=list)
    proposed_evidence_impact_egp: Optional[Decimal] = None
    proposed_evidence_impact_origin: Optional[FinancialValueOrigin] = None

    # 2. Normalized & Annualized Frequency (I{row} & Methodology Page 3 Expected Frequency Table)
    raw_frequency_text: Optional[str] = None
    normalized_frequency_level: Optional[int] = None
    normalized_frequency_label_ar: Optional[str] = None
    normalized_frequency_label_en: Optional[str] = None
    annual_frequency_multiplier: Optional[Decimal] = None
    frequency_origin: Optional[FrequencyEvidenceOrigin] = None
    frequency_validation_decision: Optional[FrequencyValidationDecision] = None

    # 3. Expected Annual Financial Loss (K{row} = J{row} * Multiplier)
    formula_expression: str = "Annual Expected Loss = Individual Expected Loss × Annual Frequency Multiplier"
    expected_annual_loss: Optional[Decimal] = None
    workbook_k_formula: Optional[str] = None
    workbook_l_formula: Optional[str] = None

    # 4. Annualized Financial Severity Rating (Continuous & Literal Excel L{row} formula)
    annualized_financial_level: Optional[int] = None
    annualized_financial_rating: Optional[SeverityCode] = None
    annualized_financial_label_ar: Optional[str] = None
    workbook_formatted_l_rating: Optional[str] = None
    literal_excel_l_rating: Optional[str] = None

    # 5 & 6. Separate 5x5 Inherent Risk Heat-Map Results (Methodology Pages 5 & 6)
    heatmap_coordinates: Optional[Dict[str, int]] = None
    page5_matrix_rating: Optional[SeverityCode] = None
    page5_matrix_color: Optional[HeatMapZone] = None
    page6_inherent_zone: Optional[Page6InherentZone] = None

    # 7. Provenance, Reviewer Clarification & Workbook Reconciliation
    requires_reviewer_clarification: bool = False
    reviewer_clarification_requirements: List[str] = Field(default_factory=list)
    workbook_reconciliation_status: Optional[str] = None
    workbook_reconciliation_explanation: Optional[str] = None
    source_evidence: List[EvidenceReference] = Field(default_factory=list)
    calculation_trace: List[CalculationStepTrace] = Field(default_factory=list)


class WorkbookRiskComparisonRow(BaseModel):
    risk_ref: str
    stable_risk_id: str = ""
    excel_row: int
    merged_row_span: List[int] = Field(default_factory=list)
    merged_cell_ranges_in_block: List[str] = Field(default_factory=list)
    risk_description: str
    individual_financial_impact: Decimal
    financial_value_origin: str
    cited_incident_ids: List[str] = Field(default_factory=list)
    cited_incident_losses_egp: List[Decimal] = Field(default_factory=list)
    highest_relevant_incident_id: Optional[str] = None
    highest_relevant_incident_loss_egp: Optional[Decimal] = None
    evidence_based_annual_loss_egp: Optional[Decimal] = None
    evidence_based_annual_rating: Optional[str] = None
    individual_impact_rating: str
    expected_frequency_raw: str
    frequency_origin: str = "SOURCE_DOCUMENTED_FREQUENCY"
    annual_frequency_multiplier: Decimal
    workbook_k_formula: str = ""
    workbook_l_formula: str = ""
    expected_workbook_k_loss: Decimal
    calculated_k_loss: Decimal
    expected_workbook_l_rating: str
    calculated_l_rating: str
    page5_inherent_matrix_rating: str
    page5_inherent_matrix_color: str
    page6_inherent_zone: str
    k_loss_status: str
    l_rating_status: str
    matrix_vs_l_status: str
    reconciliation_status: str = "MATCH"
    disagreement_reason: str = ""
    workbook_ac_rationale_text: str = ""
    explanation: str



# ==============================================================================
# PHASE 2B MODELS — CONTROL ASSESSMENT, MAX RRF & RESIDUAL RISK ENGINE
# ==============================================================================


class ControlAssessmentStatus(str, Enum):
    COMPUTED = "COMPUTED"
    PENDING_INPUT = "PENDING_INPUT"
    PENDING_REVIEW = "PENDING_REVIEW"


class ControlType(str, Enum):
    PREVENTIVE = "PREVENTIVE"
    DETECTIVE = "DETECTIVE"
    CORRECTIVE = "CORRECTIVE"


class ControlMethod(str, Enum):
    AUTOMATED = "AUTOMATED"
    SEMI_AUTOMATED = "SEMI_AUTOMATED"
    MANUAL = "MANUAL"


class ControlImplementationStatus(str, Enum):
    IMPLEMENTED = "IMPLEMENTED"
    PROPOSED = "PROPOSED"
    NOT_IMPLEMENTED = "NOT_IMPLEMENTED"
    NO_CONTROL = "NO_CONTROL"
    UNKNOWN = "UNKNOWN"


class ControlEffectivenessClassification(str, Enum):
    """
    Official 3-level control effectiveness classification from Methodology PDF Page 2,
    plus PENDING_REVIEW when effectiveness cannot be established from evidence.
    """
    EFFECTIVE = "ضابط رقابي فعال"
    NEEDS_IMPROVEMENT = "ضابط رقابي يحتاج إلى تطوير"
    NO_CONTROL = "لا يوجد ضابط رقابي"
    PENDING_REVIEW = "PENDING_REVIEW"


class ControlDeficiencyStatus(str, Enum):
    CONFIRMED = "CONFIRMED"
    SUSPECTED = "SUSPECTED"
    UNSUPPORTED = "UNSUPPORTED"
    HUMAN_REVIEW_REQUIRED = "HUMAN_REVIEW_REQUIRED"


class ControlDeficiencyCategory(str, Enum):
    CONTROL_DESIGN_DEFICIENCY = "CONTROL_DESIGN_DEFICIENCY"
    CONTROL_EXECUTION_FAILURE = "CONTROL_EXECUTION_FAILURE"
    MISSING_PREVENTIVE_CONTROL = "MISSING_PREVENTIVE_CONTROL"
    MISSING_DETECTIVE_CONTROL = "MISSING_DETECTIVE_CONTROL"
    INSUFFICIENT_CONTROL_FREQUENCY = "INSUFFICIENT_CONTROL_FREQUENCY"
    INCOMPLETE_CONTROL_IMPLEMENTATION = "INCOMPLETE_CONTROL_IMPLEMENTATION"
    MISSING_EXECUTION_EVIDENCE = "MISSING_EXECUTION_EVIDENCE"


class EvidenceLinkOrigin(str, Enum):
    """
    Explicitly separates confirmed documentary findings from heuristic keyword matches
    and AI-suggested candidate deficiencies (Phase 2B Final Integrity Check Item #4).
    """
    CONFIRMED_DOCUMENTARY_EVIDENCE = "CONFIRMED_DOCUMENTARY_EVIDENCE"
    HEURISTIC_CANDIDATE_MATCH = "HEURISTIC_CANDIDATE_MATCH"
    AI_SUGGESTED_CANDIDATE = "AI_SUGGESTED_CANDIDATE"
    UNSUPPORTED_SOURCE = "UNSUPPORTED_SOURCE"


class PdfResidualMethodologyStatus(str, Enum):
    UNRESOLVED_METHODOLOGY_THRESHOLD_RULES = "UNRESOLVED_METHODOLOGY_THRESHOLD_RULES"
    EXACT_REFERENCE_ANCHOR_MATCH_ONLY = "EXACT_REFERENCE_ANCHOR_ANCHOR_MATCH_ONLY"


class ControlDeficiencyFinding(BaseModel):
    finding_id: str
    source_type: str  # "INCIDENT" | "AUDIT_FINDING" | "SOP_GAP"
    source_reference_id: str
    affected_business_process: str
    failure_mechanism: str
    candidate_control_ids: List[str] = Field(default_factory=list)
    linked_control_ids: List[str] = Field(default_factory=list)
    deficiency_category: Optional[ControlDeficiencyCategory] = None
    deficiency_status: ControlDeficiencyStatus = ControlDeficiencyStatus.UNSUPPORTED
    evidence_link_origin: EvidenceLinkOrigin = EvidenceLinkOrigin.HEURISTIC_CANDIDATE_MATCH
    requires_human_review: bool = False
    reasoning: str = ""
    evidence_references: List[EvidenceReference] = Field(default_factory=list)


class IncidentOrAuditEvidenceInput(BaseModel):
    """
    Reusable, Business-Unit-agnostic evidence input record for linking incidents
    or audit findings to candidate controls without BU-specific hardcoding.
    """
    finding_id: str
    unit_id: str
    source_type: str  # "INCIDENT" | "AUDIT_FINDING"
    source_reference_id: str
    affected_business_process: str
    failure_mechanism: str
    failure_keywords: List[str] = Field(default_factory=list)
    explicit_confirmed_control_ids: Optional[List[str]] = None
    ai_suggested_control_ids: Optional[List[str]] = None
    deficiency_category: Optional[ControlDeficiencyCategory] = None
    evidence_references: List[EvidenceReference] = Field(default_factory=list)


class ControlInputRecord(BaseModel):
    control_id: str
    linked_risk_id: str
    control_description: str
    control_owner: Optional[str] = None
    control_type_raw: Optional[Union[ControlType, str]] = None
    control_method_raw: Optional[Union[ControlMethod, str]] = None
    control_frequency_raw: Optional[str] = None
    effectiveness_raw: Optional[Union[ControlEffectivenessClassification, str]] = None
    implementation_status: ControlImplementationStatus = ControlImplementationStatus.IMPLEMENTED
    scope_relevance: Optional[str] = None
    eligible_for_scope_override: Optional[bool] = None
    linked_sop_steps: List[str] = Field(default_factory=list)
    relevant_incident_ids: List[str] = Field(default_factory=list)
    relevant_audit_finding_ids: List[str] = Field(default_factory=list)
    deficiencies: List[ControlDeficiencyFinding] = Field(default_factory=list)
    evidence_references: List[EvidenceReference] = Field(default_factory=list)


class IndividualControlAssessmentResult(BaseModel):
    control_id: str
    linked_risk_id: str
    control_description: str
    control_owner: Optional[str] = None
    control_type: Optional[ControlType] = None
    control_type_label_ar: Optional[str] = None
    control_method: Optional[ControlMethod] = None
    control_method_label_ar: Optional[str] = None
    control_frequency: Optional[str] = None
    effectiveness_classification: ControlEffectivenessClassification = (
        ControlEffectivenessClassification.PENDING_REVIEW
    )
    implementation_status: ControlImplementationStatus = ControlImplementationStatus.UNKNOWN
    scope_relevance: Optional[str] = None
    scope_requires_human_review: bool = False
    linked_sop_steps: List[str] = Field(default_factory=list)
    relevant_incident_ids: List[str] = Field(default_factory=list)
    relevant_audit_finding_ids: List[str] = Field(default_factory=list)
    deficiencies: List[ControlDeficiencyFinding] = Field(default_factory=list)
    evidence_references: List[EvidenceReference] = Field(default_factory=list)
    applicable_rrf: Optional[Decimal] = None
    workbook_rrf_key: Optional[str] = None
    is_eligible_for_residual_reduction: bool = False
    eligibility_reason: str = ""
    assessment_status: ControlAssessmentStatus = ControlAssessmentStatus.COMPUTED
    missing_fields: List[str] = Field(default_factory=list)


class PdfPage6ResidualReferenceView(BaseModel):
    """
    Preserves the Methodology PDF Page 6 Residual Risk reference amounts
    (Low=50,000, Medium=151,000, High=501,000, Very High=1,501,000 EGP)
    separately from the Excel U-column classification without inventing interval boundaries.
    """
    reference_anchors_egp: Dict[str, Decimal] = Field(default_factory=dict)
    exact_anchor_match_label: Optional[str] = None
    methodology_status: str = "UNRESOLVED_METHODOLOGY_THRESHOLD_RULES"
    eligible_for_final_risk_acceptance: bool = False
    note: str = (
        "Methodology PDF Page 6 lists four reference amounts (Low: 50,000; Medium: 151,000; "
        "High: 501,000; Very High: 1,501,000 EGP) without establishing continuous interval "
        "boundaries or a 5th Catastrophic threshold. Per Phase 2B Rule 8, Excel U-column "
        "classification is computed distinctly and the unresolved PDF reference table is not "
        "used for final risk acceptance decisions."
    )


class ResidualRiskAssessmentRequest(BaseModel):
    risk_id: str
    unit_id: str
    process_name: Optional[str] = None
    risk_description: Optional[str] = None
    expected_annual_loss: Optional[Union[Decimal, int, float, str]] = None
    phase2a_result: Optional[FinancialInherentResult] = None
    controls: List[ControlInputRecord] = Field(default_factory=list)
    verified_no_controls: bool = False
    control_environment_known: bool = True
    incident_Document_status: str = "AVAILABLE"  # AVAILABLE | MISSING_DOCUMENT | CONFIRMED_ZERO
    audit_document_status: str = "AVAILABLE"  # AVAILABLE | MISSING_DOCUMENT | CONFIRMED_ZERO
    proposed_corrective_action: Optional[str] = None
    source_evidence: List[EvidenceReference] = Field(default_factory=list)


class ResidualRiskAssessmentResult(BaseModel):
    status: ControlAssessmentStatus
    missing_fields: List[str] = Field(default_factory=list)
    requires_human_review: bool = False
    message_ar: str = ""

    risk_id: str
    unit_id: str
    process_name: Optional[str] = None
    risk_description: Optional[str] = None

    # Baseline from Phase 2A
    expected_annual_loss: Optional[Decimal] = None

    # Individual Control Evaluations
    control_assessments: List[IndividualControlAssessmentResult] = Field(default_factory=list)
    control_gap_findings: List[ControlDeficiencyFinding] = Field(default_factory=list)

    # Selected Maximum Eligible RRF
    effective_rrf: Optional[Decimal] = None
    residual_factor: Optional[Decimal] = None  # (1 - effective_rrf)
    selected_max_rrf_control_id: Optional[str] = None
    selected_workbook_rrf_key: Optional[str] = None
    max_rrf_selection_rationale: str = ""

    # Residual Financial Loss (expected_annual_loss * (1 - effective_rrf))
    residual_financial_amount: Optional[Decimal] = None

    # Distinct Residual Risk Severity Classifications (Excel U-column vs PDF Page 6 Reference)
    continuous_residual_level: Optional[int] = None
    continuous_residual_rating: Optional[SeverityCode] = None
    continuous_residual_label_ar: Optional[str] = None
    excel_u_column_rating: Optional[str] = None  # Literal U8 formula output ("L ", "M ", "H ", "VHاً ", "C ")
    excel_u_column_code_normalized: Optional[SeverityCode] = None
    pdf_page6_residual_reference: Optional[PdfPage6ResidualReferenceView] = None

    # Source completeness & provenance
    incident_document_status: str = "AVAILABLE"
    audit_document_status: str = "AVAILABLE"
    proposed_corrective_action: Optional[str] = None
    source_evidence: List[EvidenceReference] = Field(default_factory=list)
    calculation_trace: List[CalculationStepTrace] = Field(default_factory=list)


class WorkbookResidualComparisonRow(BaseModel):
    risk_ref: str
    excel_row: int
    control_rows: List[int] = Field(default_factory=list)
    expected_annual_loss_k: Decimal
    evaluated_controls_count: int
    selected_control_id: str
    calculated_max_rrf: Decimal
    expected_workbook_rrf: Decimal = Decimal("0")
    calculated_rrf_key: str
    expected_workbook_s_key: str
    calculated_residual_t: Decimal
    expected_workbook_t: Decimal
    calculated_u_rating: str
    expected_workbook_u_rating: str
    s_key_status: str
    t_loss_status: str
    u_rating_status: str
    explanation: str


# ==============================================================================
# PHASE 2B.1 MODELS — RCSA SEMANTIC INTELLIGENCE, TEXT QUALITY & CONSISTENCY
# ==============================================================================


class SuggestionReviewStatus(str, Enum):
    PENDING_HUMAN_REVIEW = "PENDING_HUMAN_REVIEW"
    ACCEPTED_BY_MAKER = "ACCEPTED_BY_MAKER"
    MODIFIED_BY_MAKER = "MODIFIED_BY_MAKER"
    REJECTED_KEEP_ORIGINAL = "REJECTED_KEEP_ORIGINAL"
    APPROVED_BY_CHECKER = "APPROVED_BY_CHECKER"


class ContentProvenanceLabel(str, Enum):
    VERIFIED_SOURCE_FACT = "VERIFIED_SOURCE_FACT"
    ENGINE_DETERMINISTIC_CALCULATION = "ENGINE_DETERMINISTIC_CALCULATION"
    AI_PROPOSED_IMPROVEMENT = "AI_PROPOSED_IMPROVEMENT"
    MISSING_IN_SOURCE = "MISSING_IN_SOURCE"


class ControlRelevanceClassification(str, Enum):
    DIRECTLY_RELEVANT = "DIRECTLY_RELEVANT"
    PARTIALLY_RELEVANT_DIFFERENT_SCOPE = "PARTIALLY_RELEVANT_DIFFERENT_SCOPE"
    IRRELEVANT_MISMATCH = "IRRELEVANT_MISMATCH"
    REQUIRES_HUMAN_REVIEW = "REQUIRES_HUMAN_REVIEW"


class CorrectiveActionPriority(str, Enum):
    REQUIRED_CORRECTIVE_ACTION_CANDIDATE = "REQUIRED_CORRECTIVE_ACTION_CANDIDATE"
    OPTIONAL_FUTURE_QUALITY_IMPROVEMENT = "OPTIONAL_FUTURE_QUALITY_IMPROVEMENT"
    NO_ACTION_REQUIRED_SUFFICIENT_CONTROLS = "NO_ACTION_REQUIRED_SUFFICIENT_CONTROLS"


class ConsistencyCheckCategory(str, Enum):
    RISK_VS_BUSINESS_PROCESS = "RISK_VS_BUSINESS_PROCESS"
    RISK_VS_LINKED_CONTROLS = "RISK_VS_LINKED_CONTROLS"
    INCIDENTS_VS_RELATED_RISKS = "INCIDENTS_VS_RELATED_RISKS"
    AUDIT_FINDINGS_VS_CONTROL_DEFICIENCIES = "AUDIT_FINDINGS_VS_CONTROL_DEFICIENCIES"
    CONTROL_EFFECTIVENESS_VS_DOCUMENTARY_EVIDENCE = "CONTROL_EFFECTIVENESS_VS_DOCUMENTARY_EVIDENCE"
    RRF_VS_ELIGIBLE_IMPLEMENTED_CONTROLS = "RRF_VS_ELIGIBLE_IMPLEMENTED_CONTROLS"
    RESIDUAL_AMOUNT_VS_ANNUAL_LOSS_AND_MAX_RRF = "RESIDUAL_AMOUNT_VS_ANNUAL_LOSS_AND_MAX_RRF"
    RATIONALE_VS_ACTUAL_ASSESSMENT_RESULTS = "RATIONALE_VS_ACTUAL_ASSESSMENT_RESULTS"
    CORRECTIVE_ACTION_VS_IDENTIFIED_CONTROL_WEAKNESS = "CORRECTIVE_ACTION_VS_IDENTIFIED_CONTROL_WEAKNESS"
    MISSING_INFORMATION_VS_DISPLAYED_RESULTS = "MISSING_INFORMATION_VS_DISPLAYED_RESULTS"


class ConsistencyIssueSeverity(str, Enum):
    CRITICAL_CONTRADICTION = "CRITICAL_CONTRADICTION"
    MATERIAL_INCONSISTENCY = "MATERIAL_INCONSISTENCY"
    DATA_COMPLETENESS_GAP = "DATA_COMPLETENESS_GAP"
    QUALITY_REFINEMENT_NOTE = "QUALITY_REFINEMENT_NOTE"


class SOPProcedureEvidenceRecord(BaseModel):
    chunk_id: str
    document_id: str
    unit_id: str
    procedure_index: int
    section_title_ar: str
    content_text_ar: str
    page_number: Optional[int] = None
    source_file: str = ""


class AuditFindingEvidenceRecord(BaseModel):
    finding_id: str
    unit_id: str
    finding_number: int
    title_ar: str
    details_ar: str
    root_causes_ar: str
    impact_ar: str
    corrective_action_ar: str
    source_document_id: str = ""


class TaxonomyEntryRecord(BaseModel):
    taxonomy_id: str
    parent_taxonomy_id: Optional[str] = None
    level: str  # "L1" | "L2" | "L3"
    name_en: str
    name_ar: str
    l1_id: str
    l1_en: str
    l1_ar: str
    l2_id: Optional[str] = None
    l2_en: Optional[str] = None
    l2_ar: Optional[str] = None
    l3_id: Optional[str] = None
    l3_en: Optional[str] = None
    l3_ar: Optional[str] = None


class DynamicEvidenceBundle(BaseModel):
    """
    Reusable, Business-Unit-agnostic evidence bundle retrieved dynamically from
    SQLite (`documents`, `document_chunks`, `historical_incidents`, `audit_findings`,
    `bu_source_coverage`, `risk_taxonomy`) or supplied directly by callers for
    newly uploaded documents without modifying Python source code.
    """
    unit_id: str
    unit_name_ar: str = ""
    retrieval_origin: str = "SQLITE_AND_REGISTERED_SOURCES"
    sop_status: str = "MISSING_DOCUMENT"
    incidents_status: str = "MISSING_DOCUMENT"
    audit_findings_status: str = "MISSING_DOCUMENT"
    rcsa_register_status: str = "EMPTY_INITIAL_STATE"
    sop_procedures: List[SOPProcedureEvidenceRecord] = Field(default_factory=list)
    incidents: List[IncidentFinancialEvidenceRecord] = Field(default_factory=list)
    audit_findings: List[AuditFindingEvidenceRecord] = Field(default_factory=list)
    strategic_objectives_official: List[str] = Field(default_factory=list)
    taxonomy_entries: List[TaxonomyEntryRecord] = Field(default_factory=list)
    remaining_integration_dependencies: List[str] = Field(default_factory=list)


class RiskDescriptionQualityAssessment(BaseModel):
    risk_id: str
    unit_id: str
    original_description_ar: Optional[str] = None
    original_description_status: ContentProvenanceLabel = ContentProvenanceLabel.VERIFIED_SOURCE_FACT
    original_process_cell_ar: Optional[str] = None
    original_risk_library_cell_ar: Optional[str] = None

    # Four required semantic components
    business_process_or_activity_ar: str = ""
    potential_risk_event_ar: str = ""
    documented_failure_mechanism_ar: str = ""
    operational_or_financial_consequence_ar: str = ""

    has_process_component: bool = False
    has_event_component: bool = False
    has_failure_mechanism_component: bool = False
    has_consequence_component: bool = False
    is_verbatim_sop_copy: bool = False
    quality_issues_detected: List[str] = Field(default_factory=list)

    proposed_process_name_ar: str = ""
    proposed_improved_description_ar: str = ""
    proposal_provenance: ContentProvenanceLabel = ContentProvenanceLabel.AI_PROPOSED_IMPROVEMENT
    review_status: SuggestionReviewStatus = SuggestionReviewStatus.PENDING_HUMAN_REVIEW
    supporting_evidence: List[EvidenceReference] = Field(default_factory=list)


class ControlSemanticQualityAssessment(BaseModel):
    control_id: str
    linked_risk_id: str
    original_control_description_ar: str
    original_type_raw: Optional[str] = None
    original_method_raw: Optional[str] = None
    original_frequency_raw: Optional[str] = None
    original_effectiveness_raw: Optional[str] = None
    implementation_status: ControlImplementationStatus = ControlImplementationStatus.IMPLEMENTED
    normalized_type: Optional[ControlType] = None
    normalized_method: Optional[ControlMethod] = None
    applicable_rrf: Optional[Decimal] = None
    workbook_rrf_key: Optional[str] = None
    is_eligible_for_residual_reduction: bool = False

    relevance_classification: ControlRelevanceClassification = ControlRelevanceClassification.DIRECTLY_RELEVANT
    relevance_explanation_ar: str = ""
    documented_function_type: Optional[ControlType] = None
    documented_function_label_ar: str = ""
    type_matches_function: bool = True
    type_mismatch_note_ar: Optional[str] = None
    frequency_consistency_note_ar: Optional[str] = None

    what_control_actually_does_ar: str = ""
    proposed_improved_description_ar: str = ""
    missing_or_unclear_evidence_flags: List[str] = Field(default_factory=list)
    incident_did_not_auto_fail_control: bool = True
    proposal_provenance: ContentProvenanceLabel = ContentProvenanceLabel.AI_PROPOSED_IMPROVEMENT
    review_status: SuggestionReviewStatus = SuggestionReviewStatus.PENDING_HUMAN_REVIEW
    supporting_evidence: List[EvidenceReference] = Field(default_factory=list)


class EvidenceIntelligenceItem(BaseModel):
    analysis_id: str
    source_type: str  # "INCIDENT" | "AUDIT_FINDING"
    source_record_id: str
    affected_risk_id: str
    actual_failure_mechanism_ar: str
    relevant_existing_control_ids: List[str] = Field(default_factory=list)
    remaining_effective_control_ids: List[str] = Field(default_factory=list)
    deficiency_reason_ar: str = ""
    evidence_state: EvidenceLinkOrigin = EvidenceLinkOrigin.HEURISTIC_CANDIDATE_MATCH
    deficiency_status: ControlDeficiencyStatus = ControlDeficiencyStatus.SUSPECTED
    requires_human_review: bool = True
    supporting_evidence: List[EvidenceReference] = Field(default_factory=list)


class AssessmentRationaleProposal(BaseModel):
    risk_id: str
    unit_id: str
    original_workbook_rationale_ar: Optional[str] = None
    original_rationale_issues: List[str] = Field(default_factory=list)
    proposed_rationale_ar: str = ""
    is_compact_for_official_template: bool = True
    character_count: int = 0
    inherent_vs_residual_separated: bool = True
    cites_only_verified_evidence: bool = True
    explicitly_states_missing_info: bool = False
    proposal_provenance: ContentProvenanceLabel = ContentProvenanceLabel.AI_PROPOSED_IMPROVEMENT
    review_status: SuggestionReviewStatus = SuggestionReviewStatus.PENDING_HUMAN_REVIEW
    supporting_evidence: List[EvidenceReference] = Field(default_factory=list)


class CorrectiveActionItem(BaseModel):
    action_id: str
    linked_risk_id: str
    target_control_ids: List[str] = Field(default_factory=list)
    priority_category: CorrectiveActionPriority
    improvement_area: str
    proposed_action_text_ar: str
    addresses_weakness_ar: str
    recommends_automation: bool = False
    automation_justification_ar: Optional[str] = None
    assigned_owner: Optional[str] = None  # Never invented
    target_completion_date: Optional[str] = None  # Never invented
    approval_status: SuggestionReviewStatus = SuggestionReviewStatus.PENDING_HUMAN_REVIEW
    supporting_evidence: List[EvidenceReference] = Field(default_factory=list)


class CorrectiveActionRecommendationResult(BaseModel):
    risk_id: str
    unit_id: str
    original_workbook_action_ar: Optional[str] = None
    mandatory_action_required: bool = False
    required_corrective_action_candidates: List[CorrectiveActionItem] = Field(default_factory=list)
    optional_future_quality_improvements: List[CorrectiveActionItem] = Field(default_factory=list)
    rationale_ar: str = ""
    review_status: SuggestionReviewStatus = SuggestionReviewStatus.PENDING_HUMAN_REVIEW


class ConsistencyIssue(BaseModel):
    issue_id: str
    risk_id: str
    category: ConsistencyCheckCategory
    severity: ConsistencyIssueSeverity
    field_references: List[str] = Field(default_factory=list)
    source_citations: List[str] = Field(default_factory=list)
    issue_description_ar: str
    suggested_correction_ar: str
    review_status: SuggestionReviewStatus = SuggestionReviewStatus.PENDING_HUMAN_REVIEW


class CrossFieldConsistencyReport(BaseModel):
    risk_id: str
    unit_id: str
    is_fully_consistent: bool = False
    high_inherent_low_residual_valid: bool = True
    final_risk_acceptance_deferred_to_phase2c: bool = True
    issues: List[ConsistencyIssue] = Field(default_factory=list)
    checked_categories: List[str] = Field(default_factory=list)


class StrategicAndTaxonomyAlignment(BaseModel):
    risk_id: str
    unit_id: str
    original_cell_e_objective_ar: Optional[str] = None
    sheet_header_objective_ar: Optional[str] = None
    linked_official_strategic_objectives: List[str] = Field(default_factory=list)
    strategic_objective_rationale_ar: str = ""

    original_cell_ad_l1_ar: Optional[str] = None
    original_cell_f_risk_library_ar: Optional[str] = None
    suggested_l1_id: str = ""
    suggested_l1_ar: str = ""
    suggested_l1_en: str = ""
    suggested_l2_id: Optional[str] = None
    suggested_l2_ar: Optional[str] = None
    suggested_l3_id: Optional[str] = None
    suggested_l3_ar: Optional[str] = None
    classification_matches_approved_ad: bool = True
    classification_discrepancy_note_ar: Optional[str] = None
    esg_classification_status: str = "DEFERRED_TO_PHASE_2C"
    review_status: SuggestionReviewStatus = SuggestionReviewStatus.PENDING_HUMAN_REVIEW
    supporting_evidence: List[EvidenceReference] = Field(default_factory=list)


class BeforeAfterQualityEvaluation(BaseModel):
    """
    Phase 2B.1 Section 10 — Complete 8-part Before/After Quality Evaluation record
    clearly separating verified source facts from AI/Engine-generated proposals.
    """
    example_id: str
    risk_id: str
    unit_id: str
    excel_row: Optional[int] = None
    title_ar: str

    # 1. Original description or current available text (Verified Source Fact)
    original_description_ar: Optional[str] = None
    original_description_provenance: ContentProvenanceLabel = ContentProvenanceLabel.VERIFIED_SOURCE_FACT
    original_process_cell_ar: Optional[str] = None
    original_rationale_cell_ac_ar: Optional[str] = None
    original_action_cell_ab_ar: Optional[str] = None

    # 2. Proposed improved Arabic description (Proposal)
    proposed_process_name_ar: str = ""
    proposed_improved_description_ar: str = ""
    proposal_provenance: ContentProvenanceLabel = ContentProvenanceLabel.AI_PROPOSED_IMPROVEMENT

    # 3. Linked source evidence
    linked_source_evidence: List[EvidenceReference] = Field(default_factory=list)
    evidence_intelligence_items: List[EvidenceIntelligenceItem] = Field(default_factory=list)

    # 4. Control relevance
    control_evaluations: List[ControlSemanticQualityAssessment] = Field(default_factory=list)

    # 5. Concise proposed rationale
    rationale_proposal: AssessmentRationaleProposal

    # 6. Corrective action suggestion, if supported
    corrective_action_recommendation: CorrectiveActionRecommendationResult

    # 7. Potential inconsistencies
    consistency_report: CrossFieldConsistencyReport
    strategic_and_taxonomy_alignment: StrategicAndTaxonomyAlignment

    # 8. Human-review requirements
    human_review_requirements: List[str] = Field(default_factory=list)


class HumanInTheLoopReviewPackage(BaseModel):
    """
    Phase 2B.1 Section 11 — Complete reviewable package for a single risk, ready for
    an interactive Maker-Checker Review & Edit UI workflow without bypassing permissions.
    """
    risk_id: str
    unit_id: str
    phase2a_request: FinancialInherentRequest
    phase2a_result: FinancialInherentResult
    phase2b_request: ResidualRiskAssessmentRequest
    phase2b_result: ResidualRiskAssessmentResult
    risk_description_quality: RiskDescriptionQualityAssessment
    control_quality_assessments: List[ControlSemanticQualityAssessment] = Field(default_factory=list)
    evidence_intelligence: List[EvidenceIntelligenceItem] = Field(default_factory=list)
    rationale_proposal: AssessmentRationaleProposal
    corrective_action_recommendation: CorrectiveActionRecommendationResult
    consistency_report: CrossFieldConsistencyReport
    strategic_and_taxonomy: StrategicAndTaxonomyAlignment
    pending_missing_fields: List[str] = Field(default_factory=list)
    human_review_requirements: List[str] = Field(default_factory=list)
    active_risk_description_ar: str = ""
    active_rationale_ar: str = ""
    active_corrective_action_ar: Optional[str] = None
    maker_checker_status: str = "DRAFT_AWAITING_MAKER_REVIEW"
    template_preview_row: Dict[str, Any] = Field(default_factory=dict)


# ==============================================================================
# PHASE 2B.2 MODELS — CANONICAL SOURCE OF TRUTH & CROSS-ENGINE RECONCILIATION
# ==============================================================================


class CanonicalWorkbookRiskMapping(BaseModel):
    """
    Phase 2B.2 Section 4 — Deterministic workbook risk-to-control row mapping
    reconstructed directly from Official_RCSA_Template__1_Risk_Profile.json.
    """
    risk_id: str
    risk_ref: str
    unit_id: str = "BU-SYNDICATED"
    first_row: int
    last_row: int
    workbook_rows: List[int] = Field(default_factory=list)
    merged_ranges_in_block: List[str] = Field(default_factory=list)
    process_text_ar: str
    risk_library_text_ar: str
    sub_risk_description_ar: str
    linked_control_ids: List[str] = Field(default_factory=list)
    linked_control_rows: List[int] = Field(default_factory=list)
    control_count: int = 0


class CanonicalIncidentReconciliationRow(BaseModel):
    """
    Phase 2B.2 Section 5 — Authoritative incident reconciliation row verified
    against the original PDF incident tables and SQLite historical_incidents.
    """
    original_document_id: str
    original_incident_id: str
    canonical_incident_id: str
    unit_id: str
    source_date: str
    original_loss_amount: Decimal
    individual_severity_code: SeverityCode
    individual_severity_label_ar: str
    currency: str = "EGP"
    linked_risk_ids: List[str] = Field(default_factory=list)
    event_summary_ar: str = ""
    incident_detail_ar: str = ""
    sqlite_matches_pdf: bool = True
    confidence_and_evidence_reference: str = ""


class CrossEngineReconciliationRow(BaseModel):
    """
    Phase 2B.2 Section 9 — Real end-to-end reconciliation row across Phase 2A,
    Phase 2A.1, Phase 2B, and Phase 2B.1/2B.2 for each Syndicated Loans risk.
    """
    risk_id: str
    risk_ref: str
    workbook_rows: List[int] = Field(default_factory=list)
    actual_control_ids: List[str] = Field(default_factory=list)
    control_rrf_map: Dict[str, str] = Field(default_factory=dict)
    source_incident_ids: List[str] = Field(default_factory=list)
    individual_impact_egp: Decimal
    individual_impact_origin: str
    individual_impact_severity: str
    annual_frequency_multiplier: Decimal
    expected_annual_loss_egp: Decimal
    inherent_severity: str
    correct_max_rrf: Decimal
    selected_max_rrf_control_id: str
    workbook_reference_rrf: Decimal
    residual_amount_egp: Decimal
    workbook_reference_residual_egp: Decimal
    residual_severity: str
    workbook_reference_residual_severity: str
    scope_review_required: bool = False
    scope_revised_max_rrf: Optional[Decimal] = None
    scope_revised_residual_egp: Optional[Decimal] = None
    scope_revised_severity: Optional[str] = None
    consistency_status: str = "VERIFIED_CONSISTENT"
    consistency_notes: str = ""




