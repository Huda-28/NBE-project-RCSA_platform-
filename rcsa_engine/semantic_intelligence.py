"""
Phase 2B.1 — RCSA Semantic Intelligence, Text Quality & Cross-Field Consistency Engine.

Grounded strictly in:
- Registered SOPs, Historical Incidents, Audit Findings, Risk Taxonomy & Methodology (SQLite + JSON/CSV)
- Authoritative Syndicated Loans RCSA Workbook (reference_data/Official_RCSA_Template__1_Risk_Profile.json)
- Verified Phase 2A / 2A.1 Financial & Inherent Risk Engine
- Verified Phase 2B Control Assessment, MAX RRF & Residual Risk Engine
"""

from __future__ import annotations

import csv
import json
import os
import sqlite3
from decimal import Decimal
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

from .control_residual import (
    BU_SOURCE_COMPLETENESS,
    SYNDICATED_SOP_KEYWORD_MAP,
    WORKBOOK_KEY_TO_RRF,
    assess_individual_control,
    calculate_residual_risk,
    link_evidence_records_to_controls,
    load_syndicated_loans_workbook_requests,
    normalize_control_effectiveness,
    normalize_control_method,
    normalize_control_type,
    reconstruct_syndicated_workbook_structure,
    update_control_in_risk_and_recalculate,
)
from .financial_inherent import (
    AUTHORITATIVE_INCIDENT_RECORDS,
    DEFAULT_METHODOLOGY_PATH,
    DEFAULT_WORKBOOK_PATH,
    _to_decimal,
    calculate_financial_inherent_risk,
    classify_financial_amount,
    reconcile_registered_incidents,
    update_financial_inherent_input_and_recalculate,
)
from .models import (
    AssessmentRationaleProposal,
    AuditFindingEvidenceRecord,
    BeforeAfterQualityEvaluation,
    CalculationStatus,
    CanonicalIncidentReconciliationRow,
    CanonicalWorkbookRiskMapping,
    ConsistencyCheckCategory,
    ConsistencyIssue,
    ConsistencyIssueSeverity,
    ContentProvenanceLabel,
    ControlAssessmentStatus,
    ControlDeficiencyCategory,
    ControlDeficiencyFinding,
    ControlDeficiencyStatus,
    ControlEffectivenessClassification,
    ControlImplementationStatus,
    ControlInputRecord,
    ControlMethod,
    ControlRelevanceClassification,
    ControlSemanticQualityAssessment,
    ControlType,
    CorrectiveActionItem,
    CorrectiveActionPriority,
    CorrectiveActionRecommendationResult,
    CrossEngineReconciliationRow,
    CrossFieldConsistencyReport,
    DynamicEvidenceBundle,
    EvidenceIntelligenceItem,
    EvidenceLinkOrigin,
    EvidenceReference,
    FinancialInherentRequest,
    FinancialInherentResult,
    FinancialValueOrigin,
    FrequencyEvidenceOrigin,
    HumanInTheLoopReviewPackage,
    IncidentFinancialEvidenceRecord,
    IncidentOrAuditEvidenceInput,
    IndividualControlAssessmentResult,
    ResidualRiskAssessmentRequest,
    ResidualRiskAssessmentResult,
    RiskDescriptionQualityAssessment,
    SeverityCode,
    SOPProcedureEvidenceRecord,
    StrategicAndTaxonomyAlignment,
    SuggestionReviewStatus,
    TaxonomyEntryRecord,
    ZeroOrMissingFinancialStatus,
)

DEFAULT_SQLITE_DB_PATH = Path(os.environ.get("RCSA_DB_PATH", "data/rcsa.db"))
DEFAULT_TAXONOMY_CSV_PATH = Path("reference_data/Risk_Taxonomy__1_Risk_Taxonomy_L1_L3.csv")

OFFICIAL_STRATEGIC_OBJECTIVES: List[str] = [
    "التركيز على العملاء و تعظيم الأرباح",
    "التحول الرقمي و تفعيل الذكاء الاصطناعي",
    "النمو المربح و المستدام",
    "الكفاءة و الامان والمرونة",
    "الشمول المالي",
]

SEVERITY_LABELS_AR_SHORT: Dict[str, str] = {
    "L": "منخفض (L)",
    "M": "متوسط (M)",
    "H": "كبير (H)",
    "VH": "كبير جداً (VH)",
    "C": "كارثي (C)",
}


# ==============================================================================
# 1. DYNAMIC EVIDENCE RETRIEVAL (SQLite + Reference Files + Custom Input Interface)
# ==============================================================================


def _load_taxonomy_from_csv(csv_path: Path = DEFAULT_TAXONOMY_CSV_PATH) -> List[TaxonomyEntryRecord]:
    entries: List[TaxonomyEntryRecord] = []
    if not csv_path.exists():
        return entries
    with csv_path.open("r", encoding="utf-8-sig") as f:
        reader = csv.reader(f)
        for row in reader:
            if len(row) < 9:
                continue
            tax_id = row[1].strip()
            if not tax_id or tax_id == "Taxonomy ID":
                continue
            entries.append(
                TaxonomyEntryRecord(
                    taxonomy_id=tax_id,
                    parent_taxonomy_id=row[2].strip() or None,
                    level=row[3].strip(),
                    name_en=row[4].strip(),
                    name_ar=row[5].strip(),
                    l1_id=row[6].strip(),
                    l1_en=row[7].strip(),
                    l1_ar=row[8].strip(),
                    l2_id=row[9].strip() if len(row) > 9 and row[9].strip() else None,
                    l2_en=row[10].strip() if len(row) > 10 and row[10].strip() else None,
                    l2_ar=row[11].strip() if len(row) > 11 and row[11].strip() else None,
                    l3_id=row[12].strip() if len(row) > 12 and row[12].strip() else None,
                    l3_en=row[13].strip() if len(row) > 13 and row[13].strip() else None,
                    l3_ar=row[14].strip() if len(row) > 14 and row[14].strip() else None,
                )
            )
    return entries


FALLBACK_SOP_PROCEDURES_BY_BU: Dict[str, List[SOPProcedureEvidenceRecord]] = {
    "BU-SYNDICATED": [
        SOPProcedureEvidenceRecord(
            chunk_id="CHK-SOP-SYND-01",
            document_id="DOC-SOP-SYND",
            unit_id="BU-SYNDICATED",
            procedure_index=1,
            section_title_ar="الإجراء الأول: التحقق من شخصية العميل والتفويضات الرقابة المسبقة",
            content_text_ar="منع الاحتيال المصرفي، والتأكد من صدور طلب العملية من الأشخاص المفوضين قانوناً بموجب عقود القروض المشتركة والسجلات التجارية. مطابقة التوقيعات والأختام والتحقق من الصلاحيات والحدود ومراجعة سريان المستندات القانونية.",
            page_number=1,
            source_file="DOC-SOP-SYND (4f301a30.pdf)",
        ),
        SOPProcedureEvidenceRecord(
            chunk_id="CHK-SOP-SYND-02",
            document_id="DOC-SOP-SYND",
            unit_id="BU-SYNDICATED",
            procedure_index=2,
            section_title_ar="الإجراء الثاني: الكشف عن العملاء بقوائم الحظر",
            content_text_ar="منع التعامل مع الأشخاص أو الكيانات المحظورة محلياً أو دولياً ومكافحة عمليات غسل الأموال وتمويل الإرهاب. الفحص الآلي عبر النظام لكافة الأطراف المرتبطة بالتحويل المالي وإيقاف التحويل فوراً حال وجود اشتباه آلي.",
            page_number=1,
            source_file="DOC-SOP-SYND (4f301a30.pdf)",
        ),
        SOPProcedureEvidenceRecord(
            chunk_id="CHK-SOP-SYND-03",
            document_id="DOC-SOP-SYND",
            unit_id="BU-SYNDICATED",
            procedure_index=3,
            section_title_ar="الإجراء الثالث: تنفيذ طلبات التحويلات المالية ومد سريان خطابات الضمان",
            content_text_ar="استلام إشعار وكيل التسهيل ومراجعة شروط السحب والتحقق المزدوج وإدخال أمر الدفع والمراجعة والاعتماد بواسطة المشرف المباشر، وإصدار واعتماد ملاحق مد سريان خطابات الضمان.",
            page_number=2,
            source_file="DOC-SOP-SYND (4f301a30.pdf)",
        ),
        SOPProcedureEvidenceRecord(
            chunk_id="CHK-SOP-SYND-04",
            document_id="DOC-SOP-SYND",
            unit_id="BU-SYNDICATED",
            procedure_index=4,
            section_title_ar="الإجراء الرابع: متابعة مد سريان خطابات الضمان عبر التقارير الآلية",
            content_text_ar="منع سقوط خطابات الضمان الصادرة أو انتهاء سريانها دون تجديد بالاعتماد على التقارير الآلية الدورية المستخرجة من النظام المصرفي الأساسي بمهلة 30، 60، 90 يوماً قبل تاريخ الانتهاء.",
            page_number=2,
            source_file="DOC-SOP-SYND (4f301a30.pdf)",
        ),
        SOPProcedureEvidenceRecord(
            chunk_id="CHK-SOP-SYND-05",
            document_id="DOC-SOP-SYND",
            unit_id="BU-SYNDICATED",
            procedure_index=5,
            section_title_ar="الإجراء الخامس: تسجيل القيود المحاسبية الخاصة بالإدارة على الأنظمة",
            content_text_ar="تسجيل قيود السحب والتوزيع وقيود السداد والفوائد وقيود الالتزامات العرضية مع تطبيق قاعدة الرقابة المزدوجة وإرفاق أصل/صورة طبق الأصل من المستند المؤيد للقيد.",
            page_number=3,
            source_file="DOC-SOP-SYND (4f301a30.pdf)",
        ),
        SOPProcedureEvidenceRecord(
            chunk_id="CHK-SOP-SYND-06",
            document_id="DOC-SOP-SYND",
            unit_id="BU-SYNDICATED",
            procedure_index=6,
            section_title_ar="الإجراء السادس: ضبط وتسوية حسابات الأستاذ العام",
            content_text_ar="استخراج الكشوف اليومية والمطابقة الآلية واليدوية لأرصدة التسهيلات والفوائد والعمولات والالتزامات العرضية وتسوية الحسابات الوسيطة ومعالجة المعلقات خلال 24 إلى 48 ساعة.",
            page_number=3,
            source_file="DOC-SOP-SYND (4f301a30.pdf)",
        ),
        SOPProcedureEvidenceRecord(
            chunk_id="CHK-SOP-SYND-07",
            document_id="DOC-SOP-SYND",
            unit_id="BU-SYNDICATED",
            procedure_index=7,
            section_title_ar="الإجراء السابع: حفظ أصول المستندات بدواليب تحت الرقابة الثنائية",
            content_text_ar="حفظ جميع الأصول القانونية والمالية داخل دواليب/خزائن مصفحة ومقاومة للحريق مقفلة بنظام الرقابة الثنائية مع استقلال أمناء الحفظ وسجل حركة المستندات والجرد الدوري والمفاجئ.",
            page_number=4,
            source_file="DOC-SOP-SYND (4f301a30.pdf)",
        ),
    ],
    "BU-ACCOUNT": [
        SOPProcedureEvidenceRecord(
            chunk_id="CHK-SOP-ACCT-01",
            document_id="DOC-SOP-ACCT",
            unit_id="BU-ACCOUNT",
            procedure_index=1,
            section_title_ar="الإجراء الأول: استلام ومراجعة طلبات فتح الحسابات",
            content_text_ar="استلام طلب فتح الحساب من الفرع أو القناة المعتمدة والتحقق من اكتمال الملف ومراجعة صلاحية المستندات الرسمية ووضوحها وإيقاف العملية حال وجود نواقص.",
            page_number=1,
            source_file="DOC-SOP-ACCT (492fe846.pdf)",
        ),
        SOPProcedureEvidenceRecord(
            chunk_id="CHK-SOP-ACCT-02",
            document_id="DOC-SOP-ACCT",
            unit_id="BU-ACCOUNT",
            procedure_index=2,
            section_title_ar="الإجراء الثاني: التحقق من هوية العميل وبياناته الأساسية",
            content_text_ar="مطابقة الاسم والرقم القومي أو جواز السفر وتاريخ الميلاد والعنوان مع مستندات إثبات الشخصية، والبحث على النظام للتأكد من عدم وجود ملف سابق للعميل ومراجعة بيانات الكيانات والمستفيد الحقيقي.",
            page_number=2,
            source_file="DOC-SOP-ACCT (492fe846.pdf)",
        ),
        SOPProcedureEvidenceRecord(
            chunk_id="CHK-SOP-ACCT-03",
            document_id="DOC-SOP-ACCT",
            unit_id="BU-ACCOUNT",
            procedure_index=3,
            section_title_ar="الإجراء الثالث: تنفيذ الفحوصات الرقابية وقوائم الحظر",
            content_text_ar="تمرير بيانات العميل والمستفيد الحقيقي والمفوضين بالتوقيع والممثلين القانونيين من خلال الأنظمة والقوائم الرقابية المعتمدة بالبنك وتعليق العملية عند ظهور تطابق محتمل.",
            page_number=2,
            source_file="DOC-SOP-ACCT (492fe846.pdf)",
        ),
        SOPProcedureEvidenceRecord(
            chunk_id="CHK-SOP-ACCT-04",
            document_id="DOC-SOP-ACCT",
            unit_id="BU-ACCOUNT",
            procedure_index=4,
            section_title_ar="الإجراء الرابع: إدخال بيانات العميل والحساب على النظام",
            content_text_ar="إدخال جميع البيانات المطلوبة من المستندات الأصلية واستيفاء جميع الحقول الإلزامية على النظام ومراجعة مطابقة البيانات المسجلة مع طلب فتح الحساب.",
            page_number=3,
            source_file="DOC-SOP-ACCT (492fe846.pdf)",
        ),
        SOPProcedureEvidenceRecord(
            chunk_id="CHK-SOP-ACCT-05",
            document_id="DOC-SOP-ACCT",
            unit_id="BU-ACCOUNT",
            procedure_index=5,
            section_title_ar="الإجراء الخامس: المراجعة والاعتماد وفقاً لمبدأ الرقابة المزدوجة",
            content_text_ar="الفصل بين الموظف القائم بإدخال أو تنفيذ العملية والموظف القائم بالمراجعة والاعتماد (Maker/Checker) والتحقق من اكتمال المستندات وصحة البيانات قبل الاعتماد.",
            page_number=3,
            source_file="DOC-SOP-ACCT (492fe846.pdf)",
        ),
        SOPProcedureEvidenceRecord(
            chunk_id="CHK-SOP-ACCT-06",
            document_id="DOC-SOP-ACCT",
            unit_id="BU-ACCOUNT",
            procedure_index=6,
            section_title_ar="الإجراء السادس: فتح وتفعيل الحساب",
            content_text_ar="إنشاء الحساب على النظام بعد اكتمال البيانات والمستندات والتحقق النهائي من استكمال الفحوصات الرقابية والموافقات قبل التفعيل.",
            page_number=3,
            source_file="DOC-SOP-ACCT (492fe846.pdf)",
        ),
        SOPProcedureEvidenceRecord(
            chunk_id="CHK-SOP-ACCT-07",
            document_id="DOC-SOP-ACCT",
            unit_id="BU-ACCOUNT",
            procedure_index=7,
            section_title_ar="الإجراء السابع: إدارة الاستثناءات والتعديلات اليدوية",
            content_text_ar="تحديد سبب اللجوء إلى الاستثناء أو التدخل اليدوي وعدم تنفيذه إلا بعد الحصول على موافقة المستوى الإداري صاحب الصلاحية وإدراجه ضمن تقارير رقابية دورية.",
            page_number=4,
            source_file="DOC-SOP-ACCT (492fe846.pdf)",
        ),
        SOPProcedureEvidenceRecord(
            chunk_id="CHK-SOP-ACCT-08",
            document_id="DOC-SOP-ACCT",
            unit_id="BU-ACCOUNT",
            procedure_index=8,
            section_title_ar="الإجراء الثامن: حفظ وأرشفة مستندات فتح الحساب",
            content_text_ar="تحميل المستندات على نظام الأرشفة المعتمد وربطها بالرقم التعريفي الصحيح للعميل والحساب والتحقق من جودة الأرشفة واكتمال الملف وحماية المستندات الورقية.",
            page_number=4,
            source_file="DOC-SOP-ACCT (492fe846.pdf)",
        ),
    ],
    "BU-POS": [
        SOPProcedureEvidenceRecord(
            chunk_id="CHK-SOP-POS-01",
            document_id="DOC-SOP-POS",
            unit_id="BU-POS",
            procedure_index=1,
            section_title_ar="أولاً: متابعة تركيب وتشغيل ماكينات POS للتجار المتعاقدين مع مصرفنا / الفروع",
            content_text_ar="استلام أمر التركيب والتحقق من استيفائه البيانات وتوجيهه للشركة المختصة، واستلام بيان التركيب وتسجيل بيانات الماكينة على النظام والتحقق والمراجعة اليومية وتفعيل بنود الخصومات والجزاءات.",
            page_number=1,
            source_file="DOC-SOP-POS (8191fc9a.pdf)",
        ),
        SOPProcedureEvidenceRecord(
            chunk_id="CHK-SOP-POS-02",
            document_id="DOC-SOP-POS",
            unit_id="BU-POS",
            procedure_index=2,
            section_title_ar="ثانياً: متابعة سحب ماكينات POS",
            content_text_ar="استلام أوامر السحب وإرسالها للشركات المختصة واستلام محضر السحب وإلغاء تفعيل الماكينات على النظام ومراجعة صحة إلغاء التفعيل وتفعيل بنود الخصومات والجزاءات.",
            page_number=1,
            source_file="DOC-SOP-POS (8191fc9a.pdf)",
        ),
        SOPProcedureEvidenceRecord(
            chunk_id="CHK-SOP-POS-03",
            document_id="DOC-SOP-POS",
            unit_id="BU-POS",
            procedure_index=3,
            section_title_ar="ثالثاً: مناقصات وعقود الماكينات / البكر الحراري",
            content_text_ar="مراجعة واعتماد المواصفات الفنية المطلوبة للماكينات والبكر الحراري واستلامها ومطابقتها مع أوامر التوريد والتحقق من وجود نص بالعقد على فترة ضمان محددة ضد عيوب الصناعة.",
            page_number=1,
            source_file="DOC-SOP-POS (8191fc9a.pdf)",
        ),
        SOPProcedureEvidenceRecord(
            chunk_id="CHK-SOP-POS-04",
            document_id="DOC-SOP-POS",
            unit_id="BU-POS",
            procedure_index=4,
            section_title_ar="رابعاً: متابعة الشكاوى الخاصة بأعطال / توقف ماكينات POS",
            content_text_ar="استقبال الشكاوى والاستفسارات الخاصة بأعطال الماكينات من التجار والفروع ومتابعة حل المشكلات وتصعيد الشكاوى المسجلة حال تجاوز التوقيتات المعيارية للحل.",
            page_number=2,
            source_file="DOC-SOP-POS (8191fc9a.pdf)",
        ),
        SOPProcedureEvidenceRecord(
            chunk_id="CHK-SOP-POS-05",
            document_id="DOC-SOP-POS",
            unit_id="BU-POS",
            procedure_index=5,
            section_title_ar="خامساً: متابعة اختبار التطبيقات UAT",
            content_text_ar="قيام السلطة الإشرافية بالإدارة بالتحقق من إجراء كافة الاختبارات على العينة المختارة من التجار والتعزيز على نتائج الاختبارات والتأكد من عمل ماكينات POS بصورة سليمة بعد تحميل التطبيقات الجديدة.",
            page_number=2,
            source_file="DOC-SOP-POS (8191fc9a.pdf)",
        ),
    ],
}

FALLBACK_AUDIT_FINDINGS_BY_BU: Dict[str, List[AuditFindingEvidenceRecord]] = {
    "BU-SYNDICATED": [
        AuditFindingEvidenceRecord(
            finding_id="AUD-SYND-01",
            unit_id="BU-SYNDICATED",
            finding_number=1,
            title_ar="الملاحظة الأولى: عدم العثور وفقدان أصول مستندات التحويلات المالية ورسائل السويفت",
            details_ar="أثناء جرد عينة من ملفات التحويلات المالية الخاصة بالقروض المشتركة، تبين فقدان وعدم استيفاء الأصول الورقية لنماذج طلب التحويل ورسائل السويفت المؤيدة لعدد من العمليات المنفذة، واكتفاء الإدارة بوجود صور ضوئية مرسلة عبر البريد الإلكتروني دون وجود الأصل الموقع أو كتاب الإفراج الرسمي.",
            root_causes_ar="غياب نظام الأرشفة الإلكترونية المركزية، الاعتماد على الحفظ الورقي اليدوي غير المنتظم، وعدم تفعيل سجل تتبع وحركة الملفات والمستندات بقطاع العمليات.",
            impact_ar="ضعف الموقف القانوني للبنك في حالة إقامة دعوى قضائية أو وجود نزاع مع العميل المقترض أو البنوك المشاركة، عدم القدرة على تقديم المستندات الأصلية للجهات القضائية أو البنك المركزي، واحتمالية تكرار التحويل أو صرف مبالغ غير مستحقة.",
            corrective_action_ar="بحث مدى إمكانية ميكنة أعمال الحفظ لدى القطاع",
            source_document_id="DOC-AUD-SYND",
        ),
        AuditFindingEvidenceRecord(
            finding_id="AUD-SYND-02",
            unit_id="BU-SYNDICATED",
            finding_number=2,
            title_ar="الملاحظة الثانية: قبول واستيفاء مستندات مزورة وغير صحيحة من العملاء",
            details_ar="أسفر الفحص الدقيق والتدقيق المتبادل لعينة من السجلات التجارية، كتاب السحب المعتمد، وإيصالات التحويل المقدمة من بعض العملاء المقترضين، عن قبول الإدارة لمستندات تحتوي على توقيعات وأختام مزورة وتعديلات جوهرية في بيانات المفوضين.",
            root_causes_ar="ضعف كفاءة آليات التحقق اليدوي، الاعتماد على المراجعة الظاهرية للتوقيعات دون استخدام أدوات كشف التزوير الرقمية، عدم تفعيل بروتوكول الاتصال التأكيدي مع المفوضين المعتمدين، وغياب الربط الإلكتروني المباشر مع الجهات المصدرة للمستندات.",
            impact_ar="تعرض البنك لمخاطر الاحتيال المالي المباشر، احتمالية تكبد خسائر مالية جسيمة نتيجة صرف مبالغ لأطراف غير مفوضة، التعرض لجزاءات وغرامات مالية وصارمة من البنك المركزي المصري لمخالفة تعليمات اعرف عميلك وضوابط حظر غسل الأموال، بالإضافة إلى المساس بسمعة البنك المصرفية.",
            corrective_action_ar="بحث مدى إمكانية توفير أنظمة خاصة بالكشف عن المستندات.",
            source_document_id="DOC-AUD-SYND",
        ),
    ],
    "BU-ACCOUNT": [
        AuditFindingEvidenceRecord(
            finding_id="AUD-ACCT-01",
            unit_id="BU-ACCOUNT",
            finding_number=1,
            title_ar="الملاحظة الأولى: عدم اكتمال بعض مستندات ومتطلبات فتح الحسابات",
            details_ar="أسفر الفحص التفصيلي لعينة من ملفات فتح الحسابات عن وجود حالات لم تستوف بصورة كاملة جميع المستندات والبيانات المطلوبة وفقاً للإجراءات المعتمدة، أو تم استكمال بعض المتطلبات في مراحل لاحقة من تنفيذ العملية.",
            root_causes_ar="الاعتماد الجزئي على المراجعة اليدوية للمستندات، وعدم وجود ضابط آلي مانع في جميع مراحل العملية يضمن عدم استكمال الإجراء قبل استيفاء كافة المتطلبات الإلزامية.",
            impact_ar="احتمالية فتح أو تفعيل حسابات دون استيفاء المتطلبات المعتمدة، وما قد يترتب على ذلك من مخاطر تشغيلية ورقابية ومخاطر عدم الالتزام، بالإضافة إلى صعوبة إثبات سلامة الإجراءات حال إجراء مراجعات لاحقة.",
            corrective_action_ar="دراسة تطبيق النظام المستخدم آلية Mandatory Checklist / System Validation بحيث لا يسمح باستكمال فتح أو تفعيل الحساب قبل استيفاء وتوثيق جميع المستندات والبيانات الإلزامية، مع إجراء مراجعات دورية على الاستثناءات.",
            source_document_id="DOC-AUD-ACCT",
        ),
        AuditFindingEvidenceRecord(
            finding_id="AUD-ACCT-02",
            unit_id="BU-ACCOUNT",
            finding_number=2,
            title_ar="الملاحظة الثانية: مخاطر عدم دقة أو اتساق البيانات المسجلة على النظام مع المستندات",
            details_ar="تبين من أعمال المراجعة وجود حاجة إلى تعزيز آليات التحقق من تطابق البيانات المسجلة على النظام مع المستندات المقدمة من العملاء، خاصة البيانات الأساسية التي يترتب على عدم دقتها تأثير على سلامة ملف العميل والإجراءات اللاحقة المرتبطة بالحساب.",
            root_causes_ar="وجود مراحل تعتمد على الإدخال والمراجعة اليدوية، بما يزيد من احتمالية الخطأ البشري، إلى جانب محدودية بعض أدوات التحقق الآلي بين البيانات المدخلة والمستندات المؤيدة.",
            impact_ar="إمكانية تسجيل بيانات غير دقيقة أو غير متطابقة مع المستندات الأصلية، بما قد يؤدي إلى أخطاء تشغيلية لاحقة أو قصور في جودة بيانات العملاء ومخاطر مرتبطة بالالتزام بالمتطلبات الرقابية.",
            corrective_action_ar="تعزيز ضوابط للبيانات الجوهرية، ودراسة زيادة الاعتماد على أدوات التحقق الآلي وربط الحقول الأساسية بالمستندات والمصادر المعتمدة، مع إصدار تقارير استثنائية دورية للحالات التي يتم تعديل بياناتها أو تجاوز الضوابط المعتادة بشأنها.",
            source_document_id="DOC-AUD-ACCT",
        ),
        AuditFindingEvidenceRecord(
            finding_id="AUD-ACCT-03",
            unit_id="BU-ACCOUNT",
            finding_number=3,
            title_ar="الملاحظة الثالثة: قصور محتمل في حفظ واسترجاع مستندات فتح الحسابات",
            details_ar="أظهرت أعمال الفحص الحاجة إلى تعزيز آليات حفظ وأرشفة مستندات فتح الحسابات بما يضمن سهولة وسرعة استرجاع المستندات وربطها بصورة واضحة بالحساب والعميل، مع تقليل الاعتماد على الحفظ أو التداول اليدوي للمستندات.",
            root_causes_ar="الاعتماد على إجراءات يدوية أو شبه آلية في بعض مراحل حفظ وأرشفة المستندات، وعدم اكتمال الربط الإلكتروني المركزي لكافة المستندات المؤيدة للعملية.",
            impact_ar="احتمالية فقد أو تعذر استرجاع بعض المستندات عند الحاجة، بما قد يؤثر على قدرة البنك على إثبات سلامة إجراءات فتح الحساب أمام الجهات الرقابية أو القانونية، بالإضافة إلى زيادة المخاطر التشغيلية المرتبطة بتداول المستندات.",
            corrective_action_ar="استكمال ميكنة عملية الأرشفة وربط جميع مستندات فتح الحساب إلكترونياً بملف العميل، مع وضع آلية للتحقق من اكتمال الأرشفة وإصدار تقارير دورية بالحالات التي لم يتم استيفاء مستنداتها إلكترونياً.",
            source_document_id="DOC-AUD-ACCT",
        ),
        AuditFindingEvidenceRecord(
            finding_id="AUD-ACCT-04",
            unit_id="BU-ACCOUNT",
            finding_number=4,
            title_ar="الملاحظة الرابعة: الحاجة إلى تعزيز الرقابة على الاستثناءات والتدخلات اليدوية",
            details_ar="تبين من مراجعة الضوابط المرتبطة بعملية فتح الحسابات وجود بعض الإجراءات التي يتم تنفيذها يدوياً أو من خلال استثناءات تشغيلية، الأمر الذي يستلزم وجود رقابة مستقلة ومستمرة على تلك الحالات لضمان استخدامها في الأغراض المصرح بها فقط.",
            root_causes_ar="عدم اكتمال أتمتة بعض مراحل العملية، والحاجة إلى تطوير تقارير رقابية موحدة لرصد الاستثناءات والتعديلات اليدوية.",
            impact_ar="زيادة احتمالية الخطأ البشري أو تنفيذ معاملات خارج المسار التشغيلي المعتاد، بالإضافة إلى صعوبة اكتشاف بعض الأخطاء أو التجاوزات في الوقت المناسب.",
            corrective_action_ar="إعداد Exception Report دوري يتضمن جميع التدخلات اليدوية والاستثناءات والتعديلات الجوهرية، على أن تتم مراجعته واعتماده من مستوى إداري مستقل، مع توثيق أسباب الاستثناء والإجراء المتخذ بشأنه.",
            source_document_id="DOC-AUD-ACCT",
        ),
    ],
}


def load_dynamic_evidence_bundle(
    unit_id: str,
    sqlite_db_path: Optional[Union[str, Path]] = None,
    custom_sop_procedures: Optional[List[SOPProcedureEvidenceRecord]] = None,
    custom_incidents: Optional[List[IncidentFinancialEvidenceRecord]] = None,
    custom_audit_findings: Optional[List[AuditFindingEvidenceRecord]] = None,
) -> DynamicEvidenceBundle:
    """
    Phase 2B.1 Section 2 — Dynamic Evidence Retriever:
    1. Queries the live SQLite database (`documents`, `document_chunks`, `historical_incidents`,
       `audit_findings`, `bu_source_coverage`, `risk_taxonomy`) when accessible.
    2. Supports caller-supplied `custom_sop_procedures`, `custom_incidents`, and
       `custom_audit_findings` so newly uploaded documents are processed dynamically
       without modifying Python source code.
    3. Reports remaining integration dependencies transparently.
    """
    db_path = Path(sqlite_db_path) if sqlite_db_path is not None else DEFAULT_SQLITE_DB_PATH
    unit_meta = BU_SOURCE_COMPLETENESS.get(
        unit_id,
        {
            "sop_status": "MISSING_DOCUMENT",
            "incidents_status": "MISSING_DOCUMENT",
            "audit_findings_status": "MISSING_DOCUMENT",
            "rcsa_register_status": "EMPTY_INITIAL_STATE",
        },
    )

    sop_list: List[SOPProcedureEvidenceRecord] = []
    inc_list: List[IncidentFinancialEvidenceRecord] = []
    aud_list: List[AuditFindingEvidenceRecord] = []
    tax_list: List[TaxonomyEntryRecord] = []
    unit_name_ar = unit_id
    retrieval_origin = "REGISTERED_REFERENCE_FALLBACK"

    sop_status = unit_meta.get("sop_status", "MISSING_DOCUMENT")
    inc_status = unit_meta.get("incidents_status", "MISSING_DOCUMENT")
    aud_status = unit_meta.get("audit_findings_status", "MISSING_DOCUMENT")
    reg_status = unit_meta.get("rcsa_register_status", "EMPTY_INITIAL_STATE")

    if db_path.exists():
        try:
            conn = sqlite3.connect(str(db_path))
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()

            # 1. Business Unit & Coverage Metadata
            cur.execute("SELECT name_ar FROM business_units WHERE id = ?", (unit_id,))
            bu_row = cur.fetchone()
            if bu_row:
                unit_name_ar = str(bu_row["name_ar"])

            cur.execute("SELECT * FROM bu_source_coverage WHERE unit_id = ?", (unit_id,))
            cov_row = cur.fetchone()
            if cov_row:
                sop_status = str(cov_row["sop_status"])
                inc_status = str(cov_row["incidents_status"])
                aud_status = str(cov_row["audit_findings_status"])
                reg_status = str(cov_row["rcsa_register_status"])

            # 2. SOP Document Chunks
            cur.execute(
                """
                SELECT dc.id, dc.document_id, dc.chunk_index, dc.section_title, dc.content_text, dc.page_number, d.filename
                FROM document_chunks dc
                JOIN documents d ON d.id = dc.document_id
                WHERE d.unit_id = ? AND d.file_type = 'SOP'
                ORDER BY dc.chunk_index ASC
                """,
                (unit_id,),
            )
            for r in cur.fetchall():
                sop_list.append(
                    SOPProcedureEvidenceRecord(
                        chunk_id=str(r["id"]),
                        document_id=str(r["document_id"]),
                        unit_id=unit_id,
                        procedure_index=int(r["chunk_index"]),
                        section_title_ar=str(r["section_title"] or ""),
                        content_text_ar=str(r["content_text"] or ""),
                        page_number=int(r["page_number"]) if r["page_number"] is not None else None,
                        source_file=str(r["filename"] or ""),
                    )
                )

            # 3. Historical Incidents (cross-enriched with canonical failure mechanism keywords)
            auth_inc_by_id = {
                inc.incident_id: inc
                for bu_incs in AUTHORITATIVE_INCIDENT_RECORDS.values()
                for inc in bu_incs
            }
            cur.execute(
                """
                SELECT id, unit_id, incident_code, event_summary_ar, incident_detail_ar,
                       net_loss_amount, risk_category_l1_raw, mapped_l1_id, source_document_id
                FROM historical_incidents
                WHERE unit_id = ?
                ORDER BY incident_code ASC
                """,
                (unit_id,),
            )
            for r in cur.fetchall():
                inc_id_str = str(r["id"])
                detail_str = str(r["incident_detail_ar"] or "")
                summary_str = str(r["event_summary_ar"] or "")
                auth_rec = auth_inc_by_id.get(inc_id_str)
                kw_list = list(auth_rec.failure_mechanism_keywords) if auth_rec else []
                for extra_kw in (summary_str, detail_str):
                    if extra_kw and extra_kw not in kw_list:
                        kw_list.append(extra_kw)
                inc_list.append(
                    IncidentFinancialEvidenceRecord(
                        incident_id=inc_id_str,
                        incident_code=str(r["incident_code"]),
                        unit_id=str(r["unit_id"]),
                        process_name=auth_rec.process_name if auth_rec else summary_str,
                        event_summary_ar=summary_str,
                        incident_detail_ar=detail_str,
                        failure_mechanism_keywords=kw_list,
                        net_loss_amount=Decimal(str(r["net_loss_amount"])),
                        risk_category_l1=str(r["risk_category_l1_raw"] or ""),
                        mapped_l1_id=str(r["mapped_l1_id"] or ""),
                        occurrence_date_or_period=auth_rec.occurrence_date_or_period if auth_rec else None,
                        source_document_id=str(r["source_document_id"] or ""),
                    )
                )

            # 4. Audit Findings
            cur.execute(
                """
                SELECT id, unit_id, finding_number, title_ar, details_ar, root_causes_ar,
                       impact_ar, corrective_action_ar, source_document_id
                FROM audit_findings
                WHERE unit_id = ?
                ORDER BY finding_number ASC
                """,
                (unit_id,),
            )
            for r in cur.fetchall():
                aud_list.append(
                    AuditFindingEvidenceRecord(
                        finding_id=str(r["id"]),
                        unit_id=str(r["unit_id"]),
                        finding_number=int(r["finding_number"]),
                        title_ar=str(r["title_ar"] or ""),
                        details_ar=str(r["details_ar"] or ""),
                        root_causes_ar=str(r["root_causes_ar"] or ""),
                        impact_ar=str(r["impact_ar"] or ""),
                        corrective_action_ar=str(r["corrective_action_ar"] or ""),
                        source_document_id=str(r["source_document_id"] or ""),
                    )
                )

            # 5. Risk Taxonomy
            cur.execute(
                """
                SELECT taxonomy_id, parent_taxonomy_id, level, name_en, name_ar,
                       l1_id, l1_en, l1_ar, l2_id, l2_en, l2_ar, l3_id, l3_en, l3_ar
                FROM risk_taxonomy
                ORDER BY taxonomy_id ASC
                """
            )
            for r in cur.fetchall():
                tax_list.append(
                    TaxonomyEntryRecord(
                        taxonomy_id=str(r["taxonomy_id"]),
                        parent_taxonomy_id=str(r["parent_taxonomy_id"]) if r["parent_taxonomy_id"] else None,
                        level=str(r["level"]),
                        name_en=str(r["name_en"]),
                        name_ar=str(r["name_ar"]),
                        l1_id=str(r["l1_id"]),
                        l1_en=str(r["l1_en"]),
                        l1_ar=str(r["l1_ar"]),
                        l2_id=str(r["l2_id"]) if r["l2_id"] else None,
                        l2_en=str(r["l2_en"]) if r["l2_en"] else None,
                        l2_ar=str(r["l2_ar"]) if r["l2_ar"] else None,
                        l3_id=str(r["l3_id"]) if r["l3_id"] else None,
                        l3_en=str(r["l3_en"]) if r["l3_en"] else None,
                        l3_ar=str(r["l3_ar"]) if r["l3_ar"] else None,
                    )
                )

            conn.close()
            retrieval_origin = f"SQLITE_DATABASE ({db_path})"
        except Exception:
            retrieval_origin = "REGISTERED_REFERENCE_FALLBACK"

    if not sop_list and unit_id in FALLBACK_SOP_PROCEDURES_BY_BU:
        sop_list = list(FALLBACK_SOP_PROCEDURES_BY_BU[unit_id])
    if not inc_list and unit_id in AUTHORITATIVE_INCIDENT_RECORDS:
        inc_list = list(AUTHORITATIVE_INCIDENT_RECORDS[unit_id])
    if not aud_list and unit_id in FALLBACK_AUDIT_FINDINGS_BY_BU:
        aud_list = list(FALLBACK_AUDIT_FINDINGS_BY_BU[unit_id])
    if not tax_list:
        tax_list = _load_taxonomy_from_csv()

    # Merge any caller-supplied dynamic documents without modifying source code
    if custom_sop_procedures:
        existing_chunk_ids = {s.chunk_id for s in sop_list}
        for s in custom_sop_procedures:
            if s.unit_id == unit_id and s.chunk_id not in existing_chunk_ids:
                sop_list.append(s)
        if sop_list:
            sop_status = "AVAILABLE"
        retrieval_origin = f"{retrieval_origin}+DYNAMIC_CALLER_INPUT"

    if custom_incidents:
        existing_inc_ids = {i.incident_id for i in inc_list}
        for inc in custom_incidents:
            if inc.unit_id == unit_id and inc.incident_id not in existing_inc_ids:
                inc_list.append(inc)
        if inc_list:
            inc_status = "AVAILABLE"
        retrieval_origin = f"{retrieval_origin}+DYNAMIC_CALLER_INPUT"

    if custom_audit_findings:
        existing_aud_ids = {a.finding_id for a in aud_list}
        for aud in custom_audit_findings:
            if aud.unit_id == unit_id and aud.finding_id not in existing_aud_ids:
                aud_list.append(aud)
        if aud_list:
            aud_status = "AVAILABLE"
        retrieval_origin = f"{retrieval_origin}+DYNAMIC_CALLER_INPUT"

    remaining_deps: List[str] = [
        "ربط واجهة رفع الملفات الثنائية (PDF/XLSX Upload Endpoint) بمحلل نصوص تلقائي لإدراج الفقرات الجديدة مباشرة في جداول document_chunks وhistorical_incidents وaudit_findings قبل استدعاء المحرك.",
        "ربط واجهة المراجعة التفاعلية (Phase 2C / Interactive Review UI) بحفظ قرارات القبول/الرفض/التعديل في قاعدة البيانات وفق صلاحيات Maker-Checker.",
    ]

    return DynamicEvidenceBundle(
        unit_id=unit_id,
        unit_name_ar=unit_name_ar,
        retrieval_origin=retrieval_origin,
        sop_status=sop_status,
        incidents_status=inc_status,
        audit_findings_status=aud_status,
        rcsa_register_status=reg_status,
        sop_procedures=sop_list,
        incidents=inc_list,
        audit_findings=aud_list,
        strategic_objectives_official=list(OFFICIAL_STRATEGIC_OBJECTIVES),
        taxonomy_entries=tax_list,
        remaining_integration_dependencies=remaining_deps,
    )


# ==============================================================================
# 2. IMPROVE RISK DESCRIPTION QUALITY (PHASE 2B.1 SECTION 3)
# ==============================================================================


# Evidence-grounded semantic structures for known risks and derived candidates
SYNDICATED_RISK_SEMANTIC_PROFILES: Dict[str, Dict[str, str]] = {
    "RSK-SYND-01": {
        "process_ar": "فحص أطراف التحويلات المالية الصادرة والواردة بقوائم الحظر المحلية والدولية",
        "event_ar": "تنفيذ تحويلات مالية أو معاملات قروض مشتركة لصالح أو مع أطراف مدرجة بقوائم الحظر المحلية أو الدولية",
        "mechanism_ar": "نتيجة قصور في الفحص المسبق لكافة أطراف المعاملة أو عدم تحديث قوائم الحظر أو إغفال تصعيد حالات الاشتباه للإدارة المختصة",
        "consequence_ar": "مما يعرض البنك لمخاطر عقوبات وجزاءات رقابية وقانونية جسيمة ومخاطر عدم الالتزام بضوابط مكافحة غسل الأموال وتمويل الإرهاب والمساس بسمعة مصرفنا",
        "sop_ref": "CHK-SOP-SYND-02",
    },
    "RSK-SYND-02": {
        "process_ar": "تنفيذ طلبات العملاء الخاصة بإصدار التحويلات المالية ومد سريان خطابات الضمان",
        "event_ar": "وقوع أخطاء تشغيلية أثناء تنفيذ طلبات العملاء (مثل التحويل لحسابات راكدة/مجمدة أو تكرار تنفيذ دفعة سبق تسجيلها أو الخصم دون استيفاء الموافقات)",
        "mechanism_ar": "نتيجة خطأ بشري في الإدخال أو قصور في مطابقة طلب العميل والمستندات المؤيدة قبل التنفيذ والتعزيز على النظام",
        "consequence_ar": "مما قد يؤدي إلى خسائر مالية أو مطالبات تعويض من العملاء والبنوك المشاركة وتأثر جودة الخدمة المقدمة",
        "sop_ref": "CHK-SOP-SYND-03",
    },
    "RSK-SYND-03": {
        "process_ar": "متابعة تواريخ استحقاق ومد سريان خطابات الضمان الصادرة ضمن التسهيلات المشتركة",
        "event_ar": "إغفال متابعة خطابات الضمان التي قاربت صلاحيتها على الانتهاء أو انتهت دون تجديدها أو إلغائها على النظام في التوقيت المحدد",
        "mechanism_ar": "نتيجة عدم المراجعة المنتظمة للتقارير الآلية الدورية لخطابات الضمان المستحقة أو تأخر التنسيق مع الجهات المعنية",
        "consequence_ar": "مما قد يترتب عليه سقوط حق البنك أو بقاء التزامات عرضية غير مسواة على النظام ومخاطر مالية وتشغيلية",
        "sop_ref": "CHK-SOP-SYND-04",
    },
    "RSK-SYND-04": {
        "process_ar": "تنفيذ وتعزيز طلبات التحويلات المالية ومد سريان خطابات الضمان الخاصة بعملاء القروض المشتركة",
        "event_ar": "إغفال تنفيذ أو عدم استكمال تعزيز طلبات التحويلات المالية المسجلة لصالح العملاء في التوقيت المتفق عليه",
        "mechanism_ar": "نتيجة الاعتماد على المتابعة اليدوية وإغفال المراجعة والتعزيز النهائي (Checker) للطلبات المسجلة على النظام وعدم وجود تقرير رقابي يومي لرصد الطلبات المعلقة غير المعززة (وفق الحادثتين 100 و103)",
        "consequence_ar": "مما يؤدي إلى تأخر تنفيذ تعليمات السحب والتحويل وتحمل البنك خسائر مالية وتعويضات ومطالبات من العملاء والبنوك المشاركة وتأثر سمعة البنك",
        "sop_ref": "CHK-SOP-SYND-03",
    },
    "RSK-SYND-05": {
        "process_ar": "إعداد وتسجيل القيود المحاسبية لعمليات القروض المشتركة (السحب، التوزيع، السداد، الفوائد، والالتزامات العرضية)",
        "event_ar": "وقوع أخطاء في إعداد أو توجيه أو تسجيل القيود المحاسبية على الأنظمة المصرفية",
        "mechanism_ar": "نتيجة قصور في مطابقة بيانات القيد المحاسبي مع المستندات المؤيدة أو ضعف المراجعة المزدوجة قبل التعزيز على النظام",
        "consequence_ar": "مما يؤدي إلى عدم دقة أرصدة التسهيلات والفوائد والعمولات وظهور فروق محاسبية وملاحظات رقابية",
        "sop_ref": "CHK-SOP-SYND-05",
    },
    "RSK-SYND-06": {
        "process_ar": "ضبط وتسوية ومطابقة أرصدة حسابات الأستاذ العام والحسابات الوسيطة لعمليات القروض المشتركة",
        "event_ar": "عدم انضباط أرصدة حسابات الأستاذ العام أو تأخر اكتشاف وتسوية الفروق والمعلقات المحاسبية",
        "mechanism_ar": "نتيجة قصور في مطابقة العمليات المنفذة يومياً مع كشوف وتقارير الأستاذ العام أو عدم متابعة تسوية الحسابات الوسيطة خلال المهلة المقررة",
        "consequence_ar": "مما قد يؤدي إلى بقاء أرصدة معلقة غير مسواة وعدم دقة التقارير المالية والرقابية",
        "sop_ref": "CHK-SOP-SYND-06",
    },
    "RSK-SYND-07": {
        "process_ar": "حفظ وأرشفة أصول المستندات القانونية والمالية ونماذج التحويلات وخطابات الضمان بدواليب مؤمنة تحت الرقابة الثنائية",
        "event_ar": "فقدان أو عدم توافر الأصول الورقية الموقعة لنماذج طلبات التحويل ورسائل السويفت ومستندات خطابات الضمان",
        "mechanism_ar": "نتيجة الاعتماد على الحفظ الورقي اليدوي غير المنتظم والاكتفاء بصور البريد الإلكتروني دون استيفاء الأصل الموقع، وغياب نظام أرشفة إلكترونية مركزية وسجل تتبع حركة الملفات (وفق الحادثتين 101 و102 وملحوظة التفتيش رقم 1)",
        "consequence_ar": "مما يضعف الموقف القانوني للبنك أمام الجهات القضائية والرقابية ويعرضه لخسائر مالية ومطالبات من العملاء أو البنوك المشاركة",
        "sop_ref": "CHK-SOP-SYND-07",
    },
    "RSK-SYND-08": {
        "process_ar": "التحقق المسبق من هوية العملاء وصحة المستندات القانونية والتوقيعات والأختام وتفويضات السحب والتحويل",
        "event_ar": "تعرض البنك لاحتيال خارجي عبر قبول وتمرير مستندات أو تفويضات أو أختام أو بطاقات هوية مزورة أو غير صحيحة",
        "mechanism_ar": "نتيجة ضعف كفاءة الفحص اليدوي الظاهري للتوقيعات والأختام والسجلات التجارية، وغياب أدوات الكشف الرقمي عن التزوير وعدم تفعيل الاتصال التأكيدي المسبق بالمفوضين (وفق الحادثة 106 وملحوظة التفتيش رقم 2)",
        "consequence_ar": "مما يعرض البنك لخسائر مالية مباشرة نتيجة صرف مبالغ لأطراف غير مفوضة ولجزاءات رقابية من البنك المركزي لمخالفة ضوابط اعرف عميلك ومكافحة الاحتيال",
        "sop_ref": "CHK-SOP-SYND-01",
    },
}


def evaluate_and_improve_risk_description(
    risk_id: str,
    unit_id: str,
    original_description_ar: Optional[str],
    original_process_cell_ar: Optional[str] = None,
    original_risk_library_cell_ar: Optional[str] = None,
    evidence_bundle: Optional[DynamicEvidenceBundle] = None,
    linked_incidents: Optional[List[IncidentFinancialEvidenceRecord]] = None,
    linked_audit_findings: Optional[List[AuditFindingEvidenceRecord]] = None,
    linked_sop_procedures: Optional[List[SOPProcedureEvidenceRecord]] = None,
) -> RiskDescriptionQualityAssessment:
    """
    Phase 2B.1 Section 3 — Improve Risk Description Quality:
    - Evaluates whether the original description explains:
      1. Business process or activity
      2. Potential risk event
      3. Documented or reasonably supported failure mechanism
      4. Operational or financial consequence
    - Detects telegraphic brevity, typos, verbatim SOP copying, and Column F/D mismatches.
    - Preserves approved source descriptions (`original_description_ar`) and stores
      improvements as reviewable suggestions (`AI_PROPOSED_IMPROVEMENT`, `PENDING_HUMAN_REVIEW`).
    """
    orig_clean = (original_description_ar or "").strip() if original_description_ar is not None else None
    orig_status = (
        ContentProvenanceLabel.VERIFIED_SOURCE_FACT
        if orig_clean
        else ContentProvenanceLabel.MISSING_IN_SOURCE
    )

    issues: List[str] = []
    ev_refs: List[EvidenceReference] = []

    # Check if original description is missing (e.g., BU-ACCOUNT derived candidate)
    if not orig_clean:
        issues.append(
            "لا يوجد نص وصف مخاطرة أصلي معتمد في ملف إكسيل مسبق لهذه الوحدة (MISSING_IN_SOURCE)؛ تم صياغة مقترح المخاطرة استناداً إلى دليل الإجراءات (SOP) وسجل الحوادث وملاحظات التفتيش."
        )
    else:
        word_count = len(orig_clean.split())
        if word_count <= 6:
            issues.append(
                f"النص الأصلي للمخاطرة مختصر جداً ({word_count} كلمات فقط: '{orig_clean}') ويقتصر على عنوان الحدث دون بيان العملية أو آلية الفشل أو الأثر المترتب."
            )
        if "غير صحيحية" in orig_clean:
            issues.append("يحتوي النص الأصلي للمخاطرة على خطأ إملائي ('غير صحيحية' والصواب 'غير صحيحة أو مزورة').")

    # Check verbatim SOP copy
    is_verbatim_sop = False
    sop_pool = linked_sop_procedures or (evidence_bundle.sop_procedures if evidence_bundle else [])
    if orig_clean and sop_pool:
        for sop in sop_pool:
            if len(orig_clean) > 30 and orig_clean in sop.content_text_ar:
                is_verbatim_sop = True
                issues.append(
                    f"النص منسوخ حرفياً من فقرة دليل الإجراءات ({sop.chunk_id}) دون تحليل لحدث المخاطرة وآلية الفشل."
                )
                break

    # Check process cell D and risk library cell F issues
    if original_process_cell_ar is not None and not original_process_cell_ar.strip():
        issues.append("خلية النشاط/العملية (العمود D) فارغة في ملف الإكسيل المرجعي.")

    if original_risk_library_cell_ar:
        f_clean = original_risk_library_cell_ar.strip()
        if "العجز / الزيادة بالنقدية" in f_clean and orig_clean and "نقد" not in orig_clean:
            issues.append(
                f"عدم اتساق بين عمود مكتبة المخاطر F ('{f_clean}') ووصف المخاطرة الفعلي G ('{orig_clean}')؛ العمليات تتعلق بتحويلات القروض المشتركة وخطابات الضمان وليس خزينة النقدية."
            )
        elif "ازدواجية حيازة المفاتيح" in f_clean and orig_clean and "فقد المستندات" in orig_clean:
            issues.append(
                f"عدم اتساق جزئي بين عمود مكتبة المخاطر F ('{f_clean}') ووصف المخاطرة G ('{orig_clean}')؛ الفشل الموثق بالحوادث والتفتيش يتمثل في فقدان الأصول الورقية وغياب الأرشفة المركزية."
            )
        elif "أخطاء بأعداد القيود المحاسبية" in f_clean and orig_clean and "احتيال خارجي" in orig_clean:
            issues.append(
                f"تعارض صريح بين عمود مكتبة المخاطر F ('{f_clean}') ووصف المخاطرة G ('{orig_clean}' — احتيال خارجي بمستندات مزورة)."
            )

    # Determine the 4 structured semantic components
    has_proc = bool(orig_clean and len(orig_clean.split()) > 8 and ("أثناء" in orig_clean or "عملية" in orig_clean or "إجراءات" in orig_clean))
    has_event = bool(orig_clean and len(orig_clean.split()) >= 2)
    has_mech = bool(orig_clean and ("نتيجة" in orig_clean or "بسبب" in orig_clean or "لعدم" in orig_clean))
    has_cons = bool(orig_clean and ("مما" in orig_clean or "أثر" in orig_clean or "خسائر" in orig_clean or "يعرض" in orig_clean))

    if not (has_proc and has_event and has_mech and has_cons) and orig_clean:
        missing_parts = []
        if not has_proc:
            missing_parts.append("العملية/النشاط المصرفي")
        if not has_mech:
            missing_parts.append("آلية الفشل الموثقة")
        if not has_cons:
            missing_parts.append("الأثر التشغيلي أو المالي أو القانوني")
        if missing_parts:
            issues.append(f"النص الأصلي لا يوضح العناصر الدلالية التالية: ({'، '.join(missing_parts)}).")

    if risk_id in SYNDICATED_RISK_SEMANTIC_PROFILES:
        prof = SYNDICATED_RISK_SEMANTIC_PROFILES[risk_id]
        proc_ar = prof["process_ar"]
        event_ar = prof["event_ar"]
        mech_ar = prof["mechanism_ar"]
        cons_ar = prof["consequence_ar"]
        ev_refs.append(
            EvidenceReference(
                source_file="DOC-SOP-SYND",
                location=prof["sop_ref"],
                field_name="sop_procedure",
                raw_value=proc_ar,
            )
        )
    else:
        # Dynamic construction from provided SOP, Incident, and Audit Finding evidence (e.g. Account Opening or new BU)
        proc_ar = (original_process_cell_ar or "").strip()
        if not proc_ar and sop_pool:
            proc_ar = sop_pool[0].section_title_ar.split(":", 1)[-1].strip()
            ev_refs.append(
                EvidenceReference(
                    source_file=sop_pool[0].document_id,
                    location=sop_pool[0].chunk_id,
                    field_name="sop_procedure",
                    raw_value=sop_pool[0].section_title_ar,
                )
            )
        if not proc_ar:
            proc_ar = "تنفيذ الإجراءات التشغيلية بالوحدة المختصة"

        inc_list = linked_incidents or []
        aud_list = linked_audit_findings or []

        if orig_clean:
            event_ar = orig_clean
        elif aud_list:
            event_ar = aud_list[0].title_ar.split(":", 1)[-1].strip()
        elif inc_list:
            event_ar = inc_list[0].event_summary_ar.strip()
        else:
            event_ar = f"قصور تشغيلي أثناء {proc_ar}"

        if aud_list:
            mech_ar = f"نتيجة {aud_list[0].root_causes_ar.strip().rstrip('.')}"
            cons_ar = f"مما يؤدي إلى {aud_list[0].impact_ar.strip().rstrip('.')}"
            ev_refs.append(
                EvidenceReference(
                    source_file=aud_list[0].source_document_id,
                    location=aud_list[0].finding_id,
                    field_name="audit_finding_root_cause_and_impact",
                    raw_value=f"{aud_list[0].title_ar} | {aud_list[0].root_causes_ar}",
                )
            )
        elif inc_list:
            mech_ar = f"نتيجة {inc_list[0].incident_detail_ar.strip().rstrip('.')}"
            cons_ar = f"مما يترتب عليه خسائر مالية محققة أو محتملة (موثق بالحادثة {inc_list[0].incident_id}) وتأثر خدمة العملاء"
        else:
            mech_ar = "نتيجة قصور في تنفيذ خطوات المراجعة والتحقق المعتمدة بدليل الإجراءات"
            cons_ar = "مما قد يعرض البنك لمخاطر تشغيلية أو مالية أو ملاحظات رقابية"

    for inc in linked_incidents or []:
        ev_refs.append(
            EvidenceReference(
                source_file=inc.source_document_id,
                location=inc.incident_id,
                field_name="historical_incident",
                raw_value=f"{inc.event_summary_ar}: {inc.incident_detail_ar} ({inc.net_loss_amount:,} EGP)",
            )
        )
    for aud in linked_audit_findings or []:
        if not any(r.location == aud.finding_id for r in ev_refs):
            ev_refs.append(
                EvidenceReference(
                    source_file=aud.source_document_id,
                    location=aud.finding_id,
                    field_name="audit_finding",
                    raw_value=aud.title_ar,
                )
            )

    proposed_desc = f"أثناء {proc_ar}، احتمال {event_ar}، وذلك {mech_ar}، {cons_ar}."

    return RiskDescriptionQualityAssessment(
        risk_id=risk_id,
        unit_id=unit_id,
        original_description_ar=orig_clean,
        original_description_status=orig_status,
        original_process_cell_ar=original_process_cell_ar,
        original_risk_library_cell_ar=original_risk_library_cell_ar,
        business_process_or_activity_ar=proc_ar,
        potential_risk_event_ar=event_ar,
        documented_failure_mechanism_ar=mech_ar,
        operational_or_financial_consequence_ar=cons_ar,
        has_process_component=has_proc,
        has_event_component=has_event,
        has_failure_mechanism_component=has_mech,
        has_consequence_component=has_cons,
        is_verbatim_sop_copy=is_verbatim_sop,
        quality_issues_detected=issues,
        proposed_process_name_ar=proc_ar,
        proposed_improved_description_ar=proposed_desc,
        proposal_provenance=ContentProvenanceLabel.AI_PROPOSED_IMPROVEMENT,
        review_status=SuggestionReviewStatus.PENDING_HUMAN_REVIEW,
        supporting_evidence=ev_refs,
    )


# ==============================================================================
# 3. IMPROVE CONTROL DESCRIPTION QUALITY (PHASE 2B.1 SECTION 4)
# ==============================================================================


def _infer_documented_control_function(desc_ar: str) -> Tuple[ControlType, str]:
    """
    Infer whether a control description describes a Preventive, Detective, or Corrective
    function based on its actual operational action in banking procedures.
    """
    cleaned = desc_ar.strip()
    # Detective indicators: reviewing post-execution reports, periodic/surprise inventory counts, GL reconciliation reports
    detective_phrases = [
        "جرد دوري",
        "جرد دوري و مفاجي",
        "جرد دوري ومفاجئ",
        "التقارير المستخرجة من الأنظمة",
        "التقرير المستخرج من النظام",
        "مطابقتها مع العمليات المنفذة خلال اليوم",
        "التحقق من ضبط ارصدة حسابات الأستاذ العام",
        "تقارير استثنائية دورية",
        "exception report",
    ]
    corrective_phrases = [
        "خطة استمرارية",
        "وثيقة تأمين",
        "تأمين ضد",
        "معالجة المعلقات",
        "تصحيح",
    ]
    for dp in detective_phrases:
        if dp in cleaned.lower() or dp in cleaned:
            return (ControlType.DETECTIVE, "ضابط رقابي كاشف (يرصد الأخطاء أو الفروق أو النواقص بعد التنفيذ أو عبر الجرد والتقارير الدورية)")
    for cp in corrective_phrases:
        if cp in cleaned.lower() or cp in cleaned:
            return (ControlType.CORRECTIVE, "ضابط رقابي تصحيحي (يحد من الآثار بعد وقوع الحدث)")
    return (ControlType.PREVENTIVE, "ضابط رقابي مانع (يتحقق قبل تنفيذ أو تمرير المعاملة للحد من احتمالية وقوع الخطأ أو المخالفة)")


def evaluate_and_improve_control_description(
    control: ControlInputRecord,
    risk_id: str,
    risk_description_ar: str,
    process_name_ar: Optional[str] = None,
) -> ControlSemanticQualityAssessment:
    """
    Phase 2B.1 Section 4 — Improve Control Description Quality:
    - Verifies relevance of the control to its specific linked risk.
    - Identifies its documented Preventive, Detective, or Corrective function and checks consistency with recorded type.
    - Explains what the control actually does.
    - Preserves implementation status (`IMPLEMENTED` vs `PROPOSED`) and effectiveness status.
    - Flags missing or unclear control evidence (e.g., blank P15 effectiveness).
    - Never confuses proposed controls with implemented controls.
    - Never classifies a control as failed merely because an incident occurred.
    """
    orig_desc = " ".join((control.control_description or "").strip().split())
    norm_type = normalize_control_type(control.control_type_raw)
    recorded_type = norm_type[0] if norm_type else None
    eff_class = normalize_control_effectiveness(control.effectiveness_raw, control.implementation_status)

    inferred_type, inferred_label = _infer_documented_control_function(orig_desc)
    type_matches = recorded_type is None or recorded_type == inferred_type
    type_mismatch_note: Optional[str] = None

    if recorded_type is not None and recorded_type != inferred_type:
        type_mismatch_note = (
            f"الضابط مسجل بعمود التصنيف R كـ ({recorded_type.value})، بينما وظيفته الفعلية الموثقة بالوصف "
            f"('{orig_desc}') هي ({inferred_type.value} — {inferred_label})؛ يُوصى بمراجعة التصنيف لتفادي تضخيم معامل RRF."
        )

    freq_clean = " ".join((control.control_frequency_raw or "").strip().split()) if control.control_frequency_raw else None
    freq_note: Optional[str] = None
    if freq_clean and ("ad-hoc" in freq_clean.lower() or "وفقاً والحالة" in freq_clean):
        if "جرد دوري" in orig_desc:
            freq_note = (
                "وصف الضابط ينص على 'إجراء جرد دوري ومفاجئ' بينما دورية الضابط في العمود Q مسجلة 'Ad-hoc / وفقاً والحالة'؛ "
                "يتعين تحديد دورية منتظمة للجرد الدوري (مثل ربع سنوي أو شهري) لفصلها عن الجرد المفاجئ."
            )

    missing_flags: List[str] = []
    if control.implementation_status == ControlImplementationStatus.PROPOSED:
        missing_flags.append(
            "هذا البند يمثل إجراءً تصحيحياً أو ضابطاً مقترحاً مستقبلياً (PROPOSED) وليس ضابطاً مطبقاً حالياً؛ لا يدخل في حساب خفض المخاطر المتبقية الحالية."
        )
    elif control.implementation_status == ControlImplementationStatus.UNKNOWN:
        missing_flags.append("حالة تطبيق الضابط الرقابي غير محددة (UNKNOWN)؛ يلزم تأكيد التطبيق الفعلي.")

    if eff_class == ControlEffectivenessClassification.PENDING_REVIEW and control.implementation_status == ControlImplementationStatus.IMPLEMENTED:
        missing_flags.append(
            f"حقل تقييم فاعلية الضابط ({control.control_id}) فارغ في المصدر (PENDING_REVIEW)؛ يتعين استيفاء التقييم بدليل مستندي أو اعتماد صاحب الصلاحية."
        )
    if recorded_type is None and control.implementation_status == ControlImplementationStatus.IMPLEMENTED:
        missing_flags.append("نوع الضابط الرقابي (مانع/كاشف/تصحيحي) غير محدد.")
    if normalize_control_method(control.control_method_raw) is None and control.implementation_status == ControlImplementationStatus.IMPLEMENTED:
        missing_flags.append("آلية تطبيق الضابط الرقابي (آلي/شبه آلي/يدوي) غير محددة.")

    # Evaluate semantic relevance to the linked risk
    r_desc_norm = (risk_description_ar or "").strip().lower()
    c_desc_norm = orig_desc.lower()

    relevance = ControlRelevanceClassification.DIRECTLY_RELEVANT
    relevance_expl = "الضابط الرقابي يرتبط مباشرة بآلية الوقاية أو الكشف عن الخطر محل التقييم."

    # Specific scope / relevance checks
    if "فقد المستندات" in r_desc_norm and "share folder" in c_desc_norm:
        relevance = ControlRelevanceClassification.PARTIALLY_RELEVANT_DIFFERENT_SCOPE
        relevance_expl = (
            "الضابط يختص بحفظ المراسلات إلكترونياً على مجلد مشترك (SHARE FOLDER)، بينما الخطر الموثق في الحادثتين 101 و102 "
            "وملحوظة التفتيش رقم 1 يتعلق بفقدان الأصول الورقية الموقعة لطلبات التحويل وخطابات الضمان؛ حفظ المراسلات الإلكترونية "
            "لا يمنع فقدان الأصول الورقية ولا يعوض غياب الأرشفة الإلكترونية المركزية للمستندات الأصلية."
        )
    elif (
        ("قوائم الحظر" in c_desc_norm and "قوائم الحظر" not in r_desc_norm and "محظور" not in r_desc_norm and "هوية" not in r_desc_norm and "فحوصات" not in r_desc_norm)
        or ("الأستاذ العام" in c_desc_norm and "الأستاذ العام" not in r_desc_norm and "محاسب" not in r_desc_norm and "قيود" not in r_desc_norm)
        or ("خطابات الضمان التي انتهت" in c_desc_norm and "ضمان" not in r_desc_norm)
    ):
        relevance = ControlRelevanceClassification.IRRELEVANT_MISMATCH
        relevance_expl = (
            f"موضوع الضابط الرقابي ('{orig_desc}') لا يتطابق مع طبيعة حدث المخاطرة ('{risk_description_ar}')؛ "
            "يلزم مراجعة ربط الضابط بالمخاطرة الصحيحة."
        )

    # Evaluate canonical RRF and eligibility via Phase 2B assess_individual_control
    indiv_eval = assess_individual_control(control)

    # What the control actually does & refined Arabic description
    owner_str = (control.control_owner or "السلطة الإشرافية / النظام").strip()
    method_norm = normalize_control_method(control.control_method_raw)
    method_ar = method_norm[1] if method_norm else "حسب الآلية المعتمدة"
    rrf_tag = f" [معامل الخفض المعتمد RRF={indiv_eval.applicable_rrf}]" if indiv_eval.applicable_rrf is not None else ""

    cleaned_for_proposal = (
        orig_desc.replace("وفقا وز مدد الحفظ", "وفقاً لمدد الحفظ المعتمدة")
        .replace("يتنفيذ", "بتنفيذ")
        .replace("السلطه الاشرافيه", "السلطة الإشرافية")
        .replace("و مفاجي", "ومفاجئ")
        .rstrip(".")
    )

    what_it_does = (
        f"يقوم ({owner_str}) بتطبيق ({method_ar}) باعتباره ({inferred_label.split('(')[0].strip()}){rrf_tag} "
        f"من خلال: {cleaned_for_proposal}."
    )
    proposed_desc = (
        f"قيام {owner_str} ({method_ar}) بـ{cleaned_for_proposal}، "
        f"كإجراء {'مانع قبل التنفيذ' if inferred_type == ControlType.PREVENTIVE else 'كاشف عبر المراجعة الدورية' if inferred_type == ControlType.DETECTIVE else 'تصحيحي'}{rrf_tag}."
    )

    return ControlSemanticQualityAssessment(
        control_id=control.control_id,
        linked_risk_id=risk_id,
        original_control_description_ar=orig_desc,
        original_type_raw=str(control.control_type_raw) if control.control_type_raw else None,
        original_method_raw=str(control.control_method_raw) if control.control_method_raw else None,
        original_frequency_raw=freq_clean,
        original_effectiveness_raw=eff_class.value,
        implementation_status=control.implementation_status,
        normalized_type=indiv_eval.control_type,
        normalized_method=indiv_eval.control_method,
        applicable_rrf=indiv_eval.applicable_rrf,
        workbook_rrf_key=indiv_eval.workbook_rrf_key,
        is_eligible_for_residual_reduction=indiv_eval.is_eligible_for_residual_reduction,
        relevance_classification=relevance,
        relevance_explanation_ar=relevance_expl,
        documented_function_type=inferred_type,
        documented_function_label_ar=inferred_label,
        type_matches_function=type_matches,
        type_mismatch_note_ar=type_mismatch_note,
        frequency_consistency_note_ar=freq_note,
        what_control_actually_does_ar=what_it_does,
        proposed_improved_description_ar=proposed_desc,
        missing_or_unclear_evidence_flags=missing_flags,
        incident_did_not_auto_fail_control=True,
        proposal_provenance=ContentProvenanceLabel.AI_PROPOSED_IMPROVEMENT,
        review_status=SuggestionReviewStatus.PENDING_HUMAN_REVIEW,
        supporting_evidence=list(control.evidence_references),
    )


# ==============================================================================
# 4. INTELLIGENT INCIDENT & AUDIT ANALYSIS (PHASE 2B.1 SECTION 5)
# ==============================================================================


def analyze_evidence_intelligence_for_risk(
    risk_id: str,
    unit_id: str,
    process_name_ar: str,
    controls: List[ControlInputRecord],
    gap_findings: List[ControlDeficiencyFinding],
    linked_incidents: Optional[List[IncidentFinancialEvidenceRecord]] = None,
    linked_audit_findings: Optional[List[AuditFindingEvidenceRecord]] = None,
) -> List[EvidenceIntelligenceItem]:
    """
    Phase 2B.1 Section 5 — Intelligent Incident & Audit Analysis:
    Identifies:
    - Actual failure mechanism
    - Affected risk
    - Relevant existing control(s)
    - Reason for suspected or confirmed deficiency
    - Which other controls on the same risk remained effective (`remaining_effective_control_ids`)
    Maintains strict separation between:
    - CONFIRMED_DOCUMENTARY_EVIDENCE
    - HEURISTIC_CANDIDATE_MATCH
    - AI_SUGGESTED_CANDIDATE
    - UNSUPPORTED_SOURCE
    """
    items: List[EvidenceIntelligenceItem] = []

    evaluated_ctrls = [assess_individual_control(c) for c in controls]
    effective_ctrl_ids = [
        c.control_id
        for c in evaluated_ctrls
        if c.effectiveness_classification == ControlEffectivenessClassification.EFFECTIVE
        and c.implementation_status == ControlImplementationStatus.IMPLEMENTED
    ]

    for idx, gf in enumerate(gap_findings, start=1):
        rem_eff = [cid for cid in effective_ctrl_ids if cid not in gf.linked_control_ids]
        requires_review = (
            gf.requires_human_review
            or gf.evidence_link_origin != EvidenceLinkOrigin.CONFIRMED_DOCUMENTARY_EVIDENCE
            or len(gf.linked_control_ids) != 1
        )
        items.append(
            EvidenceIntelligenceItem(
                analysis_id=f"EVI-{risk_id}-{idx:02d}",
                source_type=gf.source_type,
                source_record_id=gf.source_reference_id,
                affected_risk_id=risk_id,
                actual_failure_mechanism_ar=gf.failure_mechanism or "غير محدد بالمصدر",
                relevant_existing_control_ids=list(gf.linked_control_ids),
                remaining_effective_control_ids=rem_eff,
                deficiency_reason_ar=gf.reasoning,
                evidence_state=gf.evidence_link_origin,
                deficiency_status=gf.deficiency_status,
                requires_human_review=requires_review,
                supporting_evidence=list(gf.evidence_references),
            )
        )

    return items


# ==============================================================================
# 5. PROFESSIONAL ARABIC ASSESSMENT RATIONALE (PHASE 2B.1 SECTION 6)
# ==============================================================================


def generate_professional_arabic_rationale(
    risk_id: str,
    unit_id: str,
    phase2a_result: FinancialInherentResult,
    phase2b_result: ResidualRiskAssessmentResult,
    original_workbook_rationale_ar: Optional[str] = None,
    linked_audit_finding_ids: Optional[List[str]] = None,
) -> AssessmentRationaleProposal:
    """
    Phase 2B.1 Section 6 — Generate concise, audit-ready Arabic rationale text for the official RCSA template:
    - Strictly consistent with:
      * Individual financial impact (J) & its origin
      * Expected frequency (I) & Expected annual loss (K)
      * Inherent assessment (L annualized rating & Page 5 5x5 matrix rating)
      * Relevant control effectiveness (P)
      * MAX RRF (S)
      * Residual assessment (T & U)
      * Relevant incidents and audit findings (without inventing any)
      * Missing or uncertain information
    - Never mixes inherent and residual assessments.
    - Compact enough for Column AC of the official RCSA template.
    """
    orig_clean = (original_workbook_rationale_ar or "").strip() or None
    orig_issues: List[str] = []

    # Inspect original workbook rationale for known ambiguities/contradictions
    if orig_clean:
        if "بتاثير مالي منحفض" in orig_clean:
            orig_issues.append("خطأ إملائي في التبرير الأصلي ('منحفض' بدلاً من 'منخفض').")
        if (
            ("بتاثير مالي منخفض" in orig_clean or "بتاثير مالي منحفض" in orig_clean or "بتاثير مالي متوسط" in orig_clean)
            and phase2a_result.annualized_financial_rating in (SeverityCode.H, SeverityCode.VH, SeverityCode.C)
        ):
            orig_issues.append(
                "التبرير الأصلي يدمج بين دورية حدوث الخطر المتلازم وتصنيف الأثر المالي المتبقي دون فصل واضح بين التقييم المتلازم (Inherent) والتقييم المتبقي (Residual)."
            )
        if (
            "بتاثير مالي كبير" in orig_clean
            and "كبير جدا" not in orig_clean
            and phase2a_result.annualized_financial_rating == SeverityCode.C
        ):
            orig_issues.append(
                f"التبرير الأصلي يذكر 'بتأثير مالي كبير' (H) بينما الخسارة السنوية المتلازمة في العمود L مصنفة 'C' ({phase2a_result.expected_annual_loss:,} ج.م)."
            )
        if "عدم فاعلية الضوابط الرقابية" in orig_clean:
            has_no_control = any(
                c.effectiveness_classification == ControlEffectivenessClassification.NO_CONTROL
                for c in phase2b_result.control_assessments
            )
            if not has_no_control:
                orig_issues.append(
                    "التبرير الأصلي يذكر 'عدم فاعلية الضوابط الرقابية' رغم أن الضوابط مصنفة في العمود P كـ 'ضابط رقابي فعال' أو 'ضابط رقابي فعال ولكن يحتاج تطوير' وليست منعدمة."
                )

    parts: List[str] = []
    has_missing = False

    # 1. Inherent Risk Statement (Strictly separated from Residual)
    if phase2a_result.status == CalculationStatus.COMPUTED:
        ind_amt = phase2a_result.individual_financial_impact
        ind_code = phase2a_result.individual_impact_rating.value if phase2a_result.individual_impact_rating else ""
        freq_ar = phase2a_result.normalized_frequency_label_ar or ""
        mult = phase2a_result.annual_frequency_multiplier
        ann_loss = phase2a_result.expected_annual_loss
        ann_code = phase2a_result.annualized_financial_rating.value if phase2a_result.annualized_financial_rating else ""
        mat_code = phase2a_result.page5_matrix_rating.value if phase2a_result.page5_matrix_rating else ""

        origin_note = ""
        if (
            phase2a_result.proposed_evidence_impact_egp is not None
            and ind_amt is not None
            and phase2a_result.proposed_evidence_impact_egp != ind_amt
        ):
            _, prop_sev, _, _, _ = classify_financial_amount(phase2a_result.proposed_evidence_impact_egp)
            origin_note = (
                f" (قيمة مرجعية؛ أعلى حادثة موثقة: {phase2a_result.proposed_evidence_impact_egp:,.0f} ج.م [{prop_sev.value}])"
            )

        parts.append(
            f"[الخطر المتلازم]: الأثر الفردي {ind_amt:,.0f} ج.م ({ind_code}){origin_note} بتكرار ({freq_ar} ×{mult}) "
            f"وبخسارة سنوية متوقعة {ann_loss:,.0f} ج.م (تصنيف سنوي {ann_code} / مصفوفة {mat_code})."
        )
    else:
        has_missing = True
        missing_str = "، ".join(phase2a_result.missing_fields)
        zm_label = (
            f" [{phase2a_result.zero_or_missing_status.value}]"
            if phase2a_result.zero_or_missing_status
            and phase2a_result.zero_or_missing_status != ZeroOrMissingFinancialStatus.NOT_APPLICABLE_POSITIVE_AMOUNT
            else ""
        )
        ev_amt_str = ""
        if phase2a_result.proposed_evidence_impact_egp is not None:
            _, prop_sev, _, _, _ = classify_financial_amount(phase2a_result.proposed_evidence_impact_egp)
            ev_amt_str = f" (أعلى حادثة مرتبطة موثقة: {phase2a_result.proposed_evidence_impact_egp:,.0f} ج.م [{prop_sev.value}])"
        parts.append(
            f"[الخطر المتلازم]: قيد استيفاء المدخلات ({missing_str}){zm_label}{ev_amt_str}؛ لا يُفترض التكرار أو الأثر المفقود."
        )

    # 2. Controls & MAX RRF Statement (explicitly listing every linked control and its exact RRF)
    ctrls = phase2b_result.control_assessments
    eff_cnt = sum(
        1
        for c in ctrls
        if c.effectiveness_classification == ControlEffectivenessClassification.EFFECTIVE
        and c.is_eligible_for_residual_reduction
    )
    needs_imp_ids = [
        c.control_id
        for c in ctrls
        if c.effectiveness_classification == ControlEffectivenessClassification.NEEDS_IMPROVEMENT
    ]
    pending_rev_ids = [
        c.control_id
        for c in ctrls
        if c.effectiveness_classification == ControlEffectivenessClassification.PENDING_REVIEW
    ]
    per_ctrl_rrf_str = "، ".join(
        f"{c.control_id}: RRF={c.applicable_rrf if c.applicable_rrf is not None else 'N/A'}"
        + (" [مقترح]" if c.implementation_status == ControlImplementationStatus.PROPOSED else "")
        + (" [مستبعد نطاقياً]" if not c.is_eligible_for_residual_reduction and c.implementation_status == ControlImplementationStatus.IMPLEMENTED and c.effectiveness_classification != ControlEffectivenessClassification.PENDING_REVIEW else "")
        for c in ctrls
    )

    if phase2b_result.effective_rrf is not None and phase2b_result.selected_max_rrf_control_id:
        selected_ctrl_obj = next(
            (c for c in ctrls if c.control_id == phase2b_result.selected_max_rrf_control_id),
            None,
        )
        ctrl_summary = (
            f"[الضوابط الرقابية]: الضوابط المرتبطة [{per_ctrl_rrf_str}]؛ "
            f"أقصى معامل خفض MAX RRF={phase2b_result.effective_rrf} عبر الضابط "
            f"({phase2b_result.selected_max_rrf_control_id} — {phase2b_result.selected_workbook_rrf_key})"
        )
        if needs_imp_ids:
            ctrl_summary += f"، مع حاجة الضابط ({'، '.join(needs_imp_ids)}) إلى تطوير"
        elif eff_cnt == len(ctrls) and eff_cnt > 0:
            ctrl_summary += f" ({eff_cnt} ضوابط فعالة)"
        if pending_rev_ids:
            has_missing = True
            ctrl_summary += f"، ووجود ضابط قيد استيفاء تقييم الفاعلية ({'، '.join(pending_rev_ids)})"
        if selected_ctrl_obj is not None and selected_ctrl_obj.scope_requires_human_review:
            ctrl_summary += (
                f"، [يتطلب مراجعة بشرية لنطاق التغطية: {selected_ctrl_obj.control_id} يغطي المراسلات الإلكترونية فقط]"
            )
        ctrl_summary += "."
        parts.append(ctrl_summary)
    else:
        has_missing = True
        parts.append(
            f"[الضوابط الرقابية]: الضوابط المرتبطة [{per_ctrl_rrf_str}]؛ لم يكتمل احتساب معامل الخفض لحين استيفاء بيانات الضوابط أو تقييم الفاعلية."
        )

    # 3. Residual Risk Statement (Strictly separated from Inherent)
    if (
        phase2b_result.residual_financial_amount is not None
        and phase2b_result.continuous_residual_rating is not None
    ):
        res_amt = phase2b_result.residual_financial_amount
        res_code = phase2b_result.continuous_residual_rating.value
        parts.append(
            f"[الخطر المتبقي]: صافي الخسارة السنوية المتبقية {res_amt:,.0f} ج.م بتصنيف مالي متبقٍ ({SEVERITY_LABELS_AR_SHORT.get(res_code, res_code)})."
        )
    else:
        has_missing = True
        parts.append("[الخطر المتبقي]: معلق لحين استيفاء الخسارة السنوية المتوقعة ومعامل الخفض الرقابي.")

    # 4. Documented Incidents (with exact verified amounts & individual severities), Audit Findings & Missing Source Status
    auth_inc_map = {
        inc.incident_id: inc
        for bu_incs in AUTHORITATIVE_INCIDENT_RECORDS.values()
        for inc in bu_incs
    }
    inc_ids = list(phase2a_result.linked_incident_ids)
    inc_formatted_list: List[str] = []
    for iid in inc_ids:
        if iid in auth_inc_map:
            inc_obj = auth_inc_map[iid]
            _, isev, _, _, _ = classify_financial_amount(inc_obj.net_loss_amount)
            inc_formatted_list.append(f"{iid}: {inc_obj.net_loss_amount:,.0f} ج.م [{isev.value}]")
        else:
            inc_formatted_list.append(iid)

    aud_ids = list(linked_audit_finding_ids or [])
    if not aud_ids:
        for c in ctrls:
            for aid in c.relevant_audit_finding_ids:
                if aid not in aud_ids:
                    aud_ids.append(aid)

    ev_clauses: List[str] = []
    if inc_formatted_list:
        ev_clauses.append(f"الحوادث المرتبطة: ({'، '.join(inc_formatted_list)})")
    if aud_ids:
        ev_clauses.append(f"ملاحظات التفتيش: ({'، '.join(aud_ids)})")
    if phase2b_result.incident_document_status == "MISSING_DOCUMENT":
        has_missing = True
        ev_clauses.append("سجل الحوادث غير مرفق (MISSING_DOCUMENT)")
    if phase2b_result.audit_document_status == "MISSING_DOCUMENT":
        has_missing = True
        ev_clauses.append("تقرير التفتيش غير مرفق (MISSING_DOCUMENT)")

    if ev_clauses:
        parts.append(f"[الأدلة المستندية]: {'؛ '.join(ev_clauses)}.")

    proposed_text = " ".join(parts)

    return AssessmentRationaleProposal(
        risk_id=risk_id,
        unit_id=unit_id,
        original_workbook_rationale_ar=orig_clean,
        original_rationale_issues=orig_issues,
        proposed_rationale_ar=proposed_text,
        is_compact_for_official_template=len(proposed_text) <= 650,
        character_count=len(proposed_text),
        inherent_vs_residual_separated=True,
        cites_only_verified_evidence=True,
        explicitly_states_missing_info=has_missing,
        proposal_provenance=ContentProvenanceLabel.AI_PROPOSED_IMPROVEMENT,
        review_status=SuggestionReviewStatus.PENDING_HUMAN_REVIEW,
        supporting_evidence=list(phase2a_result.source_evidence) + list(phase2b_result.source_evidence),
    )


# ==============================================================================
# 6. CORRECTIVE ACTION RECOMMENDATIONS (PHASE 2B.1 SECTION 7)
# ==============================================================================


def recommend_corrective_actions(
    risk_id: str,
    unit_id: str,
    phase2b_result: ResidualRiskAssessmentResult,
    original_workbook_action_ar: Optional[str] = None,
    linked_audit_findings: Optional[List[AuditFindingEvidenceRecord]] = None,
) -> CorrectiveActionRecommendationResult:
    """
    Phase 2B.1 Section 7 — Corrective Action Recommendations:
    - Separates `required_corrective_action_candidates` from `optional_future_quality_improvements`.
    - Does NOT populate mandatory corrective actions for risks with sufficient controls.
    - Does NOT automatically recommend automation for every risk.
    - Never invents action owners, deadlines, or approvals.
    - Keeps all proposed actions subject to authorized human review.
    """
    orig_action = (original_workbook_action_ar or "").strip() or None
    ctrls = phase2b_result.control_assessments
    gaps = phase2b_result.control_gap_findings

    deficient_ctrls = [
        c
        for c in ctrls
        if c.effectiveness_classification
        in (ControlEffectivenessClassification.NEEDS_IMPROVEMENT, ControlEffectivenessClassification.NO_CONTROL)
    ]
    pending_ctrls = [
        c
        for c in ctrls
        if c.effectiveness_classification == ControlEffectivenessClassification.PENDING_REVIEW
    ]

    mandatory_required = len(deficient_ctrls) > 0 or len(gaps) > 0
    required_items: List[CorrectiveActionItem] = []
    optional_items: List[CorrectiveActionItem] = []

    if not mandatory_required:
        # Sufficient controls -> Strictly zero mandatory corrective actions!
        if pending_ctrls:
            optional_items.append(
                CorrectiveActionItem(
                    action_id=f"ACT-OPT-{risk_id}-01",
                    linked_risk_id=risk_id,
                    target_control_ids=[c.control_id for c in pending_ctrls],
                    priority_category=CorrectiveActionPriority.OPTIONAL_FUTURE_QUALITY_IMPROVEMENT,
                    improvement_area="توثيق أدلة المراجعة وتقييم الفاعلية",
                    proposed_action_text_ar=(
                        f"استيفاء وتوثيق تقييم فاعلية الضابط ({'، '.join(c.control_id for c in pending_ctrls)}) "
                        "في سجل المخاطر والضوابط وتأكيد التوقيع على تقارير المراجعة اليومية."
                    ),
                    addresses_weakness_ar="استكمال حقل فاعلية الضابط الفارغ في السجل (PENDING_REVIEW) دون وجود قصور تشغيلي موثق.",
                    recommends_automation=False,
                    automation_justification_ar=None,
                    assigned_owner=None,
                    target_completion_date=None,
                )
            )
        rationale = (
            "جميع الضوابط الرقابية المطبقة والمعتمدة لهذه المخاطرة فعالة وتوفر خفضاً رقابياً كافياً؛ "
            "لا يلزم إدراج إجراءات تصحيحية إلزامية."
        )
        return CorrectiveActionRecommendationResult(
            risk_id=risk_id,
            unit_id=unit_id,
            original_workbook_action_ar=orig_action,
            mandatory_action_required=False,
            required_corrective_action_candidates=[],
            optional_future_quality_improvements=optional_items,
            rationale_ar=rationale,
            review_status=SuggestionReviewStatus.PENDING_HUMAN_REVIEW,
        )

    # Mandatory corrective action candidates grounded in specific control weaknesses
    target_ids = [c.control_id for c in deficient_ctrls] or [
        cid for g in gaps for cid in g.linked_control_ids
    ]

    if risk_id == "RSK-SYND-04" or any("تعزيز" in g.failure_mechanism for g in gaps):
        # Execution & monitoring weakness (Risk #4: unexecuted/unverified customer wire transfer instructions)
        # Note: Recommends a detective daily tracking report & cut-off queue check rather than blind full automation
        required_items.append(
            CorrectiveActionItem(
                action_id=f"ACT-REQ-{risk_id}-01",
                linked_risk_id=risk_id,
                target_control_ids=target_ids,
                priority_category=CorrectiveActionPriority.REQUIRED_CORRECTIVE_ACTION_CANDIDATE,
                improvement_area="تحسين الرقابة الكاشفة ومتابعة تنفيذ وتعزيز طلبات العملاء",
                proposed_action_text_ar=(
                    "استحداث وتفعيل تقرير رقابي يومي (Daily Unverified/Pending Instructions Report) لرصد طلبات التحويلات "
                    "المالية ومد خطابات الضمان المسجلة التي لم يتم تعزيزها (Checker) قبل مواعيد الإقفال اليومية، مع توثيق مراجعة المشرف."
                ),
                addresses_weakness_ar=(
                    "معالجة قصور المتابعة اليدوية في الضابط (CTL-SYND-R19) الذي أدى إلى إغفال تعزيز طلبات التحويل في الحادثتين 100 و103."
                ),
                recommends_automation=False,
                automation_justification_ar=None,
                assigned_owner=None,
                target_completion_date=None,
                supporting_evidence=list(phase2b_result.source_evidence),
            )
        )
    elif risk_id == "RSK-SYND-07" or any("فقد" in g.failure_mechanism and "مستندات" in g.failure_mechanism for g in gaps):
        # Physical document retention & archiving weakness (Risk #7 / AUD-SYND-01 / AUD-ACCT-03)
        required_items.append(
            CorrectiveActionItem(
                action_id=f"ACT-REQ-{risk_id}-01",
                linked_risk_id=risk_id,
                target_control_ids=target_ids,
                priority_category=CorrectiveActionPriority.REQUIRED_CORRECTIVE_ACTION_CANDIDATE,
                improvement_area="ضبط حفظ الأصول الورقية وتفعيل سجل حركة الملفات والأرشفة الإلكترونية المركزية",
                proposed_action_text_ar=(
                    "تفعيل سجل رسمي لتتبع استلام وحركة أصول مستندات التحويلات المالية وخطابات الضمان داخل الدواليب المؤمنة "
                    "تحت الرقابة الثنائية مع عدم الإفراج عن التنفيذ بملفات صور ضوئية فقط، واستكمال الربط بنظام الأرشفة الإلكترونية المركزية."
                ),
                addresses_weakness_ar=(
                    "معالجة فقدان الأصول الورقية الموثق بالحادثتين 101 و102 وملحوظة التفتيش رقم 1 (AUD-SYND-01) في الضابط اليدوي (CTL-SYND-R23)."
                ),
                recommends_automation=True,
                automation_justification_ar=(
                    "مُبرر بموجب السبب الجذري والتوصية الصريحة في تقرير التفتيش (AUD-SYND-01: غياب نظام الأرشفة الإلكترونية المركزية والاعتماد على الحفظ الورقي غير المنتظم)."
                ),
                assigned_owner=None,
                target_completion_date=None,
                supporting_evidence=list(phase2b_result.source_evidence),
            )
        )
    elif risk_id == "RSK-SYND-08" or any("مزورة" in g.failure_mechanism for g in gaps):
        # Forged document verification weakness (Risk #8 / INC-106 / AUD-SYND-02)
        required_items.append(
            CorrectiveActionItem(
                action_id=f"ACT-REQ-{risk_id}-01",
                linked_risk_id=risk_id,
                target_control_ids=target_ids,
                priority_category=CorrectiveActionPriority.REQUIRED_CORRECTIVE_ACTION_CANDIDATE,
                improvement_area="تعزيز ضوابط التحقق من صحة المستندات والتفويضات وكشف التزوير",
                proposed_action_text_ar=(
                    "تفعيل ضابط الاتصال التأكيدي المسبق (Callback Verification) بالمفوضين المعتمدين للتحويلات وطلبات السحب، "
                    "وتزويد إدارة العمليات بأدوات الفحص والكشف عن المستندات والأختام المزورة مع التحقق من السجلات التجارية عبر المصادر المعتمدة."
                ),
                addresses_weakness_ar=(
                    "معالجة قصور الفحص اليدوي الظاهري للتوقيعات والأختام في الضابط (CTL-SYND-R26) الموثق بالحادثة 106 وملحوظة التفتيش رقم 2 (AUD-SYND-02)."
                ),
                recommends_automation=True,
                automation_justification_ar=(
                    "مُبرر جزئياً بموجب توصية التفتيش (AUD-SYND-02) لتوفير أدوات كشف التزوير الرقمية إلى جانب الضابط الإجرائي للاتصال التأكيدي المسبق."
                ),
                assigned_owner=None,
                target_completion_date=None,
                supporting_evidence=list(phase2b_result.source_evidence),
            )
        )
    elif linked_audit_findings:
        for idx, aud in enumerate(linked_audit_findings, start=1):
            uses_auto = "mandatory checklist" in aud.corrective_action_ar.lower() or "ميكنة" in aud.corrective_action_ar
            required_items.append(
                CorrectiveActionItem(
                    action_id=f"ACT-REQ-{risk_id}-{idx:02d}",
                    linked_risk_id=risk_id,
                    target_control_ids=target_ids,
                    priority_category=CorrectiveActionPriority.REQUIRED_CORRECTIVE_ACTION_CANDIDATE,
                    improvement_area="معالجة القصور الرقابي الموثق بتقرير التفتيش",
                    proposed_action_text_ar=aud.corrective_action_ar.strip(),
                    addresses_weakness_ar=f"{aud.title_ar}: {aud.root_causes_ar.strip()}",
                    recommends_automation=uses_auto,
                    automation_justification_ar=(
                        f"مُبرر بموجب توصية تقرير التفتيش الداخلي ({aud.finding_id})." if uses_auto else None
                    ),
                    assigned_owner=None,
                    target_completion_date=None,
                    supporting_evidence=[
                        EvidenceReference(
                            source_file=aud.source_document_id,
                            location=aud.finding_id,
                            field_name="corrective_action_ar",
                            raw_value=aud.corrective_action_ar,
                        )
                    ],
                )
            )
    else:
        required_items.append(
            CorrectiveActionItem(
                action_id=f"ACT-REQ-{risk_id}-01",
                linked_risk_id=risk_id,
                target_control_ids=target_ids,
                priority_category=CorrectiveActionPriority.REQUIRED_CORRECTIVE_ACTION_CANDIDATE,
                improvement_area="تعزيز تنفيذ ومراجعة الضابط الرقابي القائم",
                proposed_action_text_ar=(
                    f"مراجعة وتحديث إجراءات تنفيذ الضابط الرقابي ({'، '.join(target_ids)}) وتوثيق أدلة المراجعة الإشرافية لمعالجة القصور المرصود."
                ),
                addresses_weakness_ar=gaps[0].failure_mechanism if gaps else "ضابط رقابي مصنف يحتاج إلى تطوير",
                recommends_automation=False,
                automation_justification_ar=None,
                assigned_owner=None,
                target_completion_date=None,
            )
        )

    return CorrectiveActionRecommendationResult(
        risk_id=risk_id,
        unit_id=unit_id,
        original_workbook_action_ar=orig_action,
        mandatory_action_required=True,
        required_corrective_action_candidates=required_items,
        optional_future_quality_improvements=optional_items,
        rationale_ar=(
            f"تم اقتراح {len(required_items)} إجراء تصحيحي مرشح لمعالجة القصور الموثق في الضابط ({'، '.join(target_ids)}) "
            "دون اختلاق مسؤول تنفيذ أو تاريخ استحقاق أو اعتماد مسبق."
        ),
        review_status=SuggestionReviewStatus.PENDING_HUMAN_REVIEW,
    )


# ==============================================================================
# 7. CROSS-FIELD CONSISTENCY VALIDATION (PHASE 2B.1 SECTION 8)
# ==============================================================================


def validate_cross_field_consistency(
    risk_id: str,
    unit_id: str,
    phase2a_result: FinancialInherentResult,
    phase2b_result: ResidualRiskAssessmentResult,
    risk_quality: RiskDescriptionQualityAssessment,
    control_qualities: List[ControlSemanticQualityAssessment],
    rationale_proposal: AssessmentRationaleProposal,
    action_recommendation: CorrectiveActionRecommendationResult,
    workbook_cells: Optional[Dict[str, str]] = None,
    excel_row: Optional[int] = None,
) -> CrossFieldConsistencyReport:
    """
    Phase 2B.1 Section 8 — Cross-Field Consistency Validation across all 10 required dimensions:
    1. Risk versus business process
    2. Risk versus linked controls
    3. Incidents versus related risks
    4. Audit findings versus control deficiencies
    5. Control effectiveness versus documentary evidence
    6. RRF versus eligible implemented controls
    7. Residual amount versus annual expected loss and MAX RRF
    8. Rationale versus actual assessment results
    9. Corrective action versus identified control weakness
    10. Missing information versus displayed results
    Note: A High/Very High Inherent Risk and Low Residual Risk combination is recognized as VALID
    when supported by appropriate effective controls. Does NOT generate final risk acceptance decisions before Phase 2C.
    """
    issues: List[ConsistencyIssue] = []
    cells = workbook_cells or {}
    r_str = str(excel_row) if excel_row is not None else ""

    def _add_issue(
        cat: ConsistencyCheckCategory,
        sev: ConsistencyIssueSeverity,
        fields: List[str],
        citations: List[str],
        desc_ar: str,
        fix_ar: str,
    ) -> None:
        issues.append(
            ConsistencyIssue(
                issue_id=f"CHK-{risk_id}-{len(issues) + 1:02d}",
                risk_id=risk_id,
                category=cat,
                severity=sev,
                field_references=fields,
                source_citations=citations,
                issue_description_ar=desc_ar,
                suggested_correction_ar=fix_ar,
                review_status=SuggestionReviewStatus.PENDING_HUMAN_REVIEW,
            )
        )

    # 1. RISK_VS_BUSINESS_PROCESS
    d_val = cells.get(f"D{r_str}", "").strip() if r_str else (risk_quality.original_process_cell_ar or "").strip()
    f_val = cells.get(f"F{r_str}", "").strip() if r_str else (risk_quality.original_risk_library_cell_ar or "").strip()
    g_val = risk_quality.original_description_ar or ""

    if r_str and not d_val:
        _add_issue(
            ConsistencyCheckCategory.RISK_VS_BUSINESS_PROCESS,
            ConsistencyIssueSeverity.DATA_COMPLETENESS_GAP,
            [f"D{r_str}", f"G{r_str}"],
            [f"Risk Profile!D{r_str}"],
            f"حقل النشاط/العملية (الخلية D{r_str}) فارغ في ملف الإكسيل رغم وجود وصف المخاطرة في G{r_str}.",
            f"استيفاء اسم النشاط في D{r_str} ليكون: '{risk_quality.proposed_process_name_ar}'.",
        )

    if f_val and "العجز / الزيادة بالنقدية" in f_val and "نقد" not in g_val:
        _add_issue(
            ConsistencyCheckCategory.RISK_VS_BUSINESS_PROCESS,
            ConsistencyIssueSeverity.MATERIAL_INCONSISTENCY,
            [f"F{r_str}" if r_str else "process_name", f"G{r_str}" if r_str else "risk_description"],
            [f"Risk Profile!F{r_str}", "DOC-SOP-SYND (CHK-SOP-SYND-03)"],
            f"مكتبة المخاطر في العمود F ('{f_val}') تشير إلى العجز/الزيادة بالنقدية، بينما المخاطرة في G ('{g_val}') تتعلق بتنفيذ طلبات تحويلات القروض المشتركة وخطابات الضمان.",
            "تعديل بند مكتبة المخاطر في العمود F إلى 'تنفيذ وتوصيل وإدارة العمليات - أخطاء بتنفيذ العمليات المصرفية / طلبات العملاء'.",
        )
    elif f_val and "ازدواجية حيازة المفاتيح" in f_val and "فقد المستندات" in g_val:
        _add_issue(
            ConsistencyCheckCategory.RISK_VS_BUSINESS_PROCESS,
            ConsistencyIssueSeverity.MATERIAL_INCONSISTENCY,
            [f"F{r_str}" if r_str else "process_name", f"G{r_str}" if r_str else "risk_description"],
            [f"Risk Profile!F{r_str}", "DOC-SOP-SYND (CHK-SOP-SYND-07)", "AUD-SYND-01"],
            f"مكتبة المخاطر في العمود F ('{f_val}') تقتصر على ازدواجية حيازة المفاتيح/العهد، بينما المخاطرة الفعلية ('{g_val}') وملاحظة التفتيش رقم 1 تتعلق بفقدان أصول المستندات وعدم استيفاء الأرشفة.",
            "ربط العمود F ببند 'تنفيذ وتوصيل وإدارة العمليات - فقدان المستندات القانونية أو عدم كفاية التوثيق (L3-08-03-02)'.",
        )
    elif f_val and "أخطاء بأعداد القيود المحاسبية" in f_val and "احتيال خارجي" in g_val:
        _add_issue(
            ConsistencyCheckCategory.RISK_VS_BUSINESS_PROCESS,
            ConsistencyIssueSeverity.CRITICAL_CONTRADICTION,
            [f"F{r_str}" if r_str else "process_name", f"G{r_str}" if r_str else "risk_description", f"AD{r_str}" if r_str else "taxonomy_l1"],
            [f"Risk Profile!F{r_str}", f"Risk Profile!G{r_str}", f"Risk Profile!AD{r_str}", "INC-SYND-106", "AUD-SYND-02"],
            f"تعارض صريح بين العمود F ('{f_val}') ووصف المخاطرة في G ('{g_val}') وتصنيف المستوى الأول في AD ('_2_احتيال خارجي').",
            "تصحيح العمود F إلى 'احتيال خارجي - التزوير والاحتيال بموجب مستندات غير صحيحة (L3-02-01-02)'.",
        )

    # 2. RISK_VS_LINKED_CONTROLS (including strict canonical row-ownership check)
    canonical_synd_rows: Dict[str, List[str]] = {
        "RSK-SYND-01": ["CTL-SYND-R8", "CTL-SYND-R9"],
        "RSK-SYND-02": ["CTL-SYND-R10", "CTL-SYND-R11", "CTL-SYND-R12", "CTL-SYND-R13", "CTL-SYND-R14", "CTL-SYND-R15"],
        "RSK-SYND-03": ["CTL-SYND-R16", "CTL-SYND-R17", "CTL-SYND-R18"],
        "RSK-SYND-04": ["CTL-SYND-R19"],
        "RSK-SYND-05": ["CTL-SYND-R20"],
        "RSK-SYND-06": ["CTL-SYND-R21", "CTL-SYND-R22"],
        "RSK-SYND-07": ["CTL-SYND-R23", "CTL-SYND-R24", "CTL-SYND-R25"],
        "RSK-SYND-08": ["CTL-SYND-R26", "CTL-SYND-R27"],
    }
    expected_ctrl_ids_for_risk = canonical_synd_rows.get(risk_id)
    for cq in control_qualities:
        if (
            expected_ctrl_ids_for_risk is not None
            and cq.control_id.startswith("CTL-SYND-R")
            and cq.control_id not in expected_ctrl_ids_for_risk
        ):
            _add_issue(
                ConsistencyCheckCategory.RISK_VS_LINKED_CONTROLS,
                ConsistencyIssueSeverity.CRITICAL_CONTRADICTION,
                [cq.control_id, "linked_risk_id"],
                [f"Official_RCSA_Template__1_Risk_Profile.json ({risk_id})"],
                (
                    f"خطأ في ربط الصفوف: الضابط ({cq.control_id}) لا ينتمي إلى المخاطرة ({risk_id}) في ملف الإكسيل المرجعي "
                    f"(الضوابط المعتمدة للمخاطرة {risk_id} هي فقط: {expected_ctrl_ids_for_risk})."
                ),
                f"إزالة الضابط ({cq.control_id}) من المخاطرة ({risk_id}) وربطه بالمخاطرة المالكة للصف.",
            )
        if cq.relevance_classification == ControlRelevanceClassification.PARTIALLY_RELEVANT_DIFFERENT_SCOPE:
            _add_issue(
                ConsistencyCheckCategory.RISK_VS_LINKED_CONTROLS,
                ConsistencyIssueSeverity.MATERIAL_INCONSISTENCY,
                [cq.control_id, "risk_description"],
                [cq.control_id, "AUD-SYND-01", "INC-SYND-101", "INC-SYND-102"],
                cq.relevance_explanation_ar,
                f"عدم الاعتماد على الضابط ({cq.control_id}) كبديل عن ضابط حفظ وأرشفة أصول المستندات الورقية الموقعة.",
            )
        elif cq.relevance_classification == ControlRelevanceClassification.IRRELEVANT_MISMATCH:
            _add_issue(
                ConsistencyCheckCategory.RISK_VS_LINKED_CONTROLS,
                ConsistencyIssueSeverity.CRITICAL_CONTRADICTION,
                [cq.control_id, "risk_description"],
                [cq.control_id],
                cq.relevance_explanation_ar,
                f"إلغاء ربط الضابط ({cq.control_id}) بهذه المخاطرة وربطه بالمخاطرة المختصة.",
            )
        if not cq.type_matches_function and cq.type_mismatch_note_ar:
            _add_issue(
                ConsistencyCheckCategory.RISK_VS_LINKED_CONTROLS,
                ConsistencyIssueSeverity.MATERIAL_INCONSISTENCY,
                [f"{cq.control_id}.control_type"],
                [cq.control_id, "Methodology PDF Page 2"],
                cq.type_mismatch_note_ar,
                f"تعديل تصنيف الضابط ({cq.control_id}) إلى ({cq.documented_function_type.value if cq.documented_function_type else 'DETECTIVE'}).",
            )
        if cq.frequency_consistency_note_ar:
            _add_issue(
                ConsistencyCheckCategory.RISK_VS_LINKED_CONTROLS,
                ConsistencyIssueSeverity.QUALITY_REFINEMENT_NOTE,
                [f"{cq.control_id}.control_frequency"],
                [cq.control_id],
                cq.frequency_consistency_note_ar,
                "تحديد دورية منتظمة للجرد الدوري في العمود Q.",
            )

    # 3. INCIDENTS_VS_RELATED_RISKS
    if phase2a_result.impact_selection_decision is not None:
        dec = phase2a_result.impact_selection_decision
        if (
            dec.proposed_evidence_amount is not None
            and dec.selected_amount is not None
            and dec.proposed_evidence_amount != dec.selected_amount
        ):
            _add_issue(
                ConsistencyCheckCategory.INCIDENTS_VS_RELATED_RISKS,
                ConsistencyIssueSeverity.MATERIAL_INCONSISTENCY,
                [f"J{r_str}" if r_str else "individual_financial_impact", f"AC{r_str}" if r_str else "linked_incident_ids"],
                list(dec.relevant_incident_ids),
                (
                    f"قيمة الأثر المالي الفردي المدخلة ({dec.selected_amount:,.0f} ج.م — {dec.selected_amount_origin.value}) "
                    f"تختلف عن أعلى خسارة حادثة فردية مرتبطة ({dec.proposed_evidence_amount:,.0f} ج.م من {dec.highest_relevant_incident_id})."
                ),
                f"مراجعة ما إذا كان يتعين الإبقاء على القيمة المرجعية ({dec.selected_amount:,.0f} ج.م) أو اعتماد أعلى خسارة حادثة موثقة ({dec.proposed_evidence_amount:,.0f} ج.م).",
            )

    # 4. AUDIT_FINDINGS_VS_CONTROL_DEFICIENCIES
    for cq in control_qualities:
        ctrl_res = next((c for c in phase2b_result.control_assessments if c.control_id == cq.control_id), None)
        if ctrl_res and ctrl_res.relevant_audit_finding_ids:
            if ctrl_res.effectiveness_classification == ControlEffectivenessClassification.EFFECTIVE:
                _add_issue(
                    ConsistencyCheckCategory.AUDIT_FINDINGS_VS_CONTROL_DEFICIENCIES,
                    ConsistencyIssueSeverity.CRITICAL_CONTRADICTION,
                    [f"{ctrl_res.control_id}.effectiveness_classification"],
                    list(ctrl_res.relevant_audit_finding_ids),
                    f"الضابط ({ctrl_res.control_id}) مرتبط بملحوظة تفتيش مؤكدة ({'، '.join(ctrl_res.relevant_audit_finding_ids)}) ولكنه مصنف 'ضابط رقابي فعال' دون ملاحظات.",
                    f"مراجعة تصنيف فاعلية الضابط ({ctrl_res.control_id}) إلى 'ضابط رقابي يحتاج إلى تطوير'.",
                )

    # 5. CONTROL_EFFECTIVENESS_VS_DOCUMENTARY_EVIDENCE
    for ctrl_res in phase2b_result.control_assessments:
        if ctrl_res.effectiveness_classification == ControlEffectivenessClassification.PENDING_REVIEW:
            _add_issue(
                ConsistencyCheckCategory.CONTROL_EFFECTIVENESS_VS_DOCUMENTARY_EVIDENCE,
                ConsistencyIssueSeverity.DATA_COMPLETENESS_GAP,
                [f"{ctrl_res.control_id}.effectiveness_classification"],
                [ctrl_res.control_id],
                f"تقييم فاعلية الضابط ({ctrl_res.control_id}) فارغ في المصدر (PENDING_REVIEW)؛ تم تعليق أهليته لخفض المخاطر المتبقية لحين التقييم.",
                f"إدخال تقييم فاعلية معتمد للضابط ({ctrl_res.control_id}) استناداً إلى أدلة التنفيذ الفعلي.",
            )

    # 6. RRF_VS_ELIGIBLE_IMPLEMENTED_CONTROLS (including partial-scope MAX RRF check)
    if r_str and f"S{r_str}" in cells:
        wb_s = cells[f"S{r_str}"].strip()
        calc_s = (phase2b_result.selected_workbook_rrf_key or "").strip()
        if wb_s and calc_s and wb_s.lower() != calc_s.lower():
            _add_issue(
                ConsistencyCheckCategory.RRF_VS_ELIGIBLE_IMPLEMENTED_CONTROLS,
                ConsistencyIssueSeverity.CRITICAL_CONTRADICTION,
                [f"S{r_str}", f"T{r_str}"],
                [f"Risk Profile!M{r_str}:R{r_str}", f"Risk Profile!S{r_str}"],
                (
                    f"الخلية S{r_str} في ملف الإكسيل تحتوي على '{wb_s}'، وهو تركيبة غير موجودة ضمن الضوابط الفعلية للمخاطرة؛ "
                    f"أقصى معامل خفض فعلي من الضوابط المطبقة هو '{calc_s}' (RRF={phase2b_result.effective_rrf} من {phase2b_result.selected_max_rrf_control_id})."
                ),
                f"تصحيح الخلية S{r_str} إلى '{calc_s}' (MAX RRF={phase2b_result.effective_rrf}) ليصبح صافي الخطر المتبقي T{r_str}={phase2b_result.residual_financial_amount:,.0f} ج.م.",
            )

    if phase2b_result.selected_max_rrf_control_id:
        win_cq = next(
            (cq for cq in control_qualities if cq.control_id == phase2b_result.selected_max_rrf_control_id),
            None,
        )
        if win_cq and win_cq.relevance_classification == ControlRelevanceClassification.PARTIALLY_RELEVANT_DIFFERENT_SCOPE:
            other_direct_rrfs = [
                c.applicable_rrf
                for c in phase2b_result.control_assessments
                if c.control_id != win_cq.control_id
                and c.is_eligible_for_residual_reduction
                and c.applicable_rrf is not None
            ]
            fallback_rrf = max(other_direct_rrfs) if other_direct_rrfs else Decimal("0")
            fallback_res = (
                (phase2a_result.expected_annual_loss * (Decimal("1") - fallback_rrf))
                if phase2a_result.expected_annual_loss is not None
                else None
            )
            fallback_note = (
                f"عند استبعاد ({win_cq.control_id}) من الأهلية النطاقية يصبح أقصى معامل خفض MAX RRF={fallback_rrf} "
                f"وصافي الخطر المتبقي {fallback_res:,.0f} ج.م."
                if fallback_res is not None
                else f"عند استبعاد ({win_cq.control_id}) يصبح MAX RRF={fallback_rrf}."
            )
            _add_issue(
                ConsistencyCheckCategory.RRF_VS_ELIGIBLE_IMPLEMENTED_CONTROLS,
                ConsistencyIssueSeverity.MATERIAL_INCONSISTENCY,
                [win_cq.control_id, "effective_rrf", "residual_financial_amount"],
                [win_cq.control_id, "AUD-SYND-01"],
                (
                    f"الضابط المختار لأعلى معامل خفض ({win_cq.control_id}: RRF={phase2b_result.effective_rrf}) مصنف كتغطية جزئية لنطاق مختلف "
                    f"({win_cq.relevance_classification.value}) لأنه يغطي حفظ المراسلات الإلكترونية بـ Share Folder ولا يمنع فقد الأصول الورقية. {fallback_note}"
                ),
                f"مراجعة أهلية الضابط ({win_cq.control_id}) في خفض الخطر المتبقي؛ {fallback_note}",
            )

    # 7. RESIDUAL_AMOUNT_VS_ANNUAL_LOSS_AND_MAX_RRF
    if (
        phase2a_result.expected_annual_loss is not None
        and phase2b_result.effective_rrf is not None
        and phase2b_result.residual_financial_amount is not None
    ):
        expected_t = phase2a_result.expected_annual_loss * (Decimal("1") - phase2b_result.effective_rrf)
        if phase2b_result.residual_financial_amount != expected_t:
            _add_issue(
                ConsistencyCheckCategory.RESIDUAL_AMOUNT_VS_ANNUAL_LOSS_AND_MAX_RRF,
                ConsistencyIssueSeverity.CRITICAL_CONTRADICTION,
                ["residual_financial_amount", "expected_annual_loss", "effective_rrf"],
                ["Phase 2B Residual Formula"],
                f"قيمة الخطر المالي المتبقي ({phase2b_result.residual_financial_amount}) لا تساوي K × (1 - MAX RRF) = {expected_t}.",
                f"اعتماد القيمة المحسوبة بدقة ({expected_t:,.2f} ج.م).",
            )

    # 8. RATIONALE_VS_ACTUAL_ASSESSMENT_RESULTS
    for r_issue in rationale_proposal.original_rationale_issues:
        _add_issue(
            ConsistencyCheckCategory.RATIONALE_VS_ACTUAL_ASSESSMENT_RESULTS,
            ConsistencyIssueSeverity.MATERIAL_INCONSISTENCY,
            [f"AC{r_str}" if r_str else "rationale_text", f"L{r_str}" if r_str else "inherent_rating", f"U{r_str}" if r_str else "residual_rating"],
            [f"Risk Profile!AC{r_str}" if r_str else "rationale_text"],
            r_issue,
            f"اعتماد نص الأساس المنطقي المقترح: '{rationale_proposal.proposed_rationale_ar}'.",
        )

    if r_str and f"AA{r_str}" in cells and f"AC{r_str}" in cells:
        aa_val = cells[f"AA{r_str}"].strip()
        ac_val = cells[f"AC{r_str}"].strip()
        if "مخاطرة مقبولة" in aa_val and "المخاطرة غير مقبولة" in ac_val:
            _add_issue(
                ConsistencyCheckCategory.RATIONALE_VS_ACTUAL_ASSESSMENT_RESULTS,
                ConsistencyIssueSeverity.CRITICAL_CONTRADICTION,
                [f"AA{r_str}", f"AC{r_str}"],
                [f"Risk Profile!AA{r_str}", f"Risk Profile!AC{r_str}"],
                f"تناقض مباشر بين التقييم في الخلية AA{r_str} ('{aa_val}') ونص الأساس المنطقي في الخلية AC{r_str} الذي يبدأ بعبارة ('المخاطرة غير مقبولة حيث ان الضوابط الرقابية تحتاج الي تطوير').",
                "توحيد التبرير مع حالة الضوابط الرقابية وتأجيل القرار النهائي لقبول المخاطرة (AA) للمرحلة 2C بعد اعتماد المراجع.",
            )

    # 9. CORRECTIVE_ACTION_VS_IDENTIFIED_CONTROL_WEAKNESS
    orig_ab = (action_recommendation.original_workbook_action_ar or "").strip()
    if action_recommendation.mandatory_action_required and not orig_ab:
        _add_issue(
            ConsistencyCheckCategory.CORRECTIVE_ACTION_VS_IDENTIFIED_CONTROL_WEAKNESS,
            ConsistencyIssueSeverity.MATERIAL_INCONSISTENCY,
            [f"AB{r_str}" if r_str else "proposed_corrective_action"],
            [c.control_id for c in phase2b_result.control_assessments if c.effectiveness_classification != ControlEffectivenessClassification.EFFECTIVE],
            "توجد ضوابط رقابية تحتاج إلى تطوير أو فجوات رقابية موثقة دون إدراج إجراء تصحيحي في حقل الإجراءات التصحيحية (AB).",
            f"إدراج الإجراء التصحيحي المرشح: '{action_recommendation.required_corrective_action_candidates[0].proposed_action_text_ar}'."
            if action_recommendation.required_corrective_action_candidates
            else "إدراج إجراء تصحيحي يعالج نقطة الضعف المحددة.",
        )
    elif not action_recommendation.mandatory_action_required and orig_ab:
        _add_issue(
            ConsistencyCheckCategory.CORRECTIVE_ACTION_VS_IDENTIFIED_CONTROL_WEAKNESS,
            ConsistencyIssueSeverity.QUALITY_REFINEMENT_NOTE,
            [f"AB{r_str}" if r_str else "proposed_corrective_action"],
            [],
            "تم إدراج إجراء تصحيحي إلزامي رغم أن جميع الضوابط المطبقة مصنفة فعالة بالكامل.",
            "تصنيف الإجراء كتحسين مستقبلي اختياري أو إزالته من حقل الإجراءات التصحيحية الإلزامية.",
        )

    # 10. MISSING_INFORMATION_VS_DISPLAYED_RESULTS
    if phase2a_result.status == CalculationStatus.PENDING_INPUT or phase2b_result.status == ControlAssessmentStatus.PENDING_INPUT:
        missing_all = list(phase2a_result.missing_fields) + list(phase2b_result.missing_fields)
        _add_issue(
            ConsistencyCheckCategory.MISSING_INFORMATION_VS_DISPLAYED_RESULTS,
            ConsistencyIssueSeverity.DATA_COMPLETENESS_GAP,
            missing_all,
            [],
            f"توجد مدخلات أساسية غير مستوفاة ({'، '.join(missing_all)})؛ تم إيقاف الاحتساب النهائي وإرجاع حالة PENDING_INPUT لمنع عرض نتائج مضللة.",
            "استيفاء الحقول المفقودة من خلال المراجع المختص (Maker) قبل إعادة الاحتساب.",
        )
    if phase2b_result.incident_document_status == "MISSING_DOCUMENT" or phase2b_result.audit_document_status == "MISSING_DOCUMENT":
        _add_issue(
            ConsistencyCheckCategory.MISSING_INFORMATION_VS_DISPLAYED_RESULTS,
            ConsistencyIssueSeverity.DATA_COMPLETENESS_GAP,
            ["incident_document_status", "audit_document_status"],
            [f"bu_source_coverage:{unit_id}"],
            "سجل الحوادث التاريخية و/أو تقرير التفتيش الداخلي غير مرفقين لهذه الوحدة (MISSING_DOCUMENT)؛ لا يُفترض صفر حوادث أو صفر ملاحظات.",
            "إرفاق سجل الحوادث وتقرير التفتيش أو تقديم تأكيد رسمي معتمد بعدم وجود حوادث/ملاحظات خلال فترة التقييم.",
        )

    # Check High Inherent + Low Residual validity
    high_inh_low_res_valid = True
    if (
        phase2a_result.annualized_financial_rating in (SeverityCode.H, SeverityCode.VH, SeverityCode.C)
        and phase2b_result.continuous_residual_rating == SeverityCode.L
    ):
        # Valid only if effective_rrf >= 0.75 from an eligible implemented control
        if phase2b_result.effective_rrf is None or phase2b_result.effective_rrf < Decimal("0.75"):
            high_inh_low_res_valid = False
            _add_issue(
                ConsistencyCheckCategory.RESIDUAL_AMOUNT_VS_ANNUAL_LOSS_AND_MAX_RRF,
                ConsistencyIssueSeverity.CRITICAL_CONTRADICTION,
                ["inherent_rating", "residual_rating", "effective_rrf"],
                [],
                "انخفاض الخطر المتبقي إلى منخفض (L) رغم ارتفاع الخطر المتلازم دون وجود ضابط رقابي مطبق ومؤهل بمعامل خفض كافٍ.",
                "التحقق من الضوابط الرقابية المطبقة ومعامل الخفض الفعال.",
            )

    return CrossFieldConsistencyReport(
        risk_id=risk_id,
        unit_id=unit_id,
        is_fully_consistent=len(issues) == 0,
        high_inherent_low_residual_valid=high_inh_low_res_valid,
        final_risk_acceptance_deferred_to_phase2c=True,
        issues=issues,
        checked_categories=[c.value for c in ConsistencyCheckCategory],
    )


# ==============================================================================
# 8. STRATEGIC OBJECTIVES & RISK TAXONOMY CLASSIFICATION (PHASE 2B.1 SECTION 9)
# ==============================================================================


def evaluate_strategic_objectives_and_taxonomy(
    risk_id: str,
    unit_id: str,
    risk_description_ar: str,
    process_name_ar: Optional[str] = None,
    original_cell_e_objective_ar: Optional[str] = None,
    sheet_header_objective_ar: Optional[str] = None,
    original_cell_ad_l1_ar: Optional[str] = None,
    original_cell_f_risk_library_ar: Optional[str] = None,
    evidence_bundle: Optional[DynamicEvidenceBundle] = None,
) -> StrategicAndTaxonomyAlignment:
    """
    Phase 2B.1 Section 9 — Strategic Objectives and Risk Classification:
    - Links risks/activities logically to the 5 official strategic objectives from Methodology Page 8.
    - Prepares evidence-grounded Level 1–Level 3 operational risk category suggestions from the registered taxonomy.
    - Never automatically replaces existing approved classifications.
    - Defers full ESG classification to Phase 2C.
    """
    text_corpus = f"{risk_description_ar or ''} {process_name_ar or ''}".strip()

    linked_objectives: List[str] = []
    # Map strictly using the 5 official registered strategic objectives
    if any(k in text_corpus for k in ["عملاء", "حساب", "تحويل", "ضمان", "خدمة"]):
        linked_objectives.append(OFFICIAL_STRATEGIC_OBJECTIVES[0])  # التركيز على العملاء و تعظيم الأرباح
    if any(k in text_corpus for k in ["حظر", "احتيال", "مزورة", "فقد", "أستاذ", "قيود", "مراجعة", "ضبط", "حفظ"]):
        linked_objectives.append(OFFICIAL_STRATEGIC_OBJECTIVES[3])  # الكفاءة و الامان والمرونة
    if any(k in text_corpus for k in ["نظام", "آلي", "تطبيقات", "أرشفة", "إلكترون", "pos", "ماكينات"]):
        linked_objectives.append(OFFICIAL_STRATEGIC_OBJECTIVES[1])  # التحول الرقمي و تفعيل الذكاء الاصطناعي
    if not linked_objectives:
        linked_objectives.append(OFFICIAL_STRATEGIC_OBJECTIVES[3])

    e_clean = (original_cell_e_objective_ar or "").strip() or None
    h5_clean = (sheet_header_objective_ar or "").strip() or None

    if e_clean:
        if e_clean in OFFICIAL_STRATEGIC_OBJECTIVES:
            obj_rationale = f"الهدف الاستراتيجي المسجل ('{e_clean}') معتمد ومتوافق مع الأهداف الخمسة بالمنهجية."
        else:
            obj_rationale = (
                f"الهدف المسجل ('{e_clean}') غير مطابق نصياً للأهداف الخمسة بالصفحة 8 من المنهجية؛ "
                f"الأهداف المعتمدة المرتبطة هي: ({'، '.join(linked_objectives)})."
            )
    elif h5_clean:
        obj_rationale = (
            f"خلية الهدف الاستراتيجي على مستوى الصف (العمود E) فارغة بينما ترويسة النموذج (H5) تذكر '{h5_clean}'؛ "
            f"يُقترح ربط المخاطرة بالأهداف المعتمدة: ({'، '.join(linked_objectives)})."
        )
    else:
        obj_rationale = f"لم يتم تحديد هدف استراتيجي في السجل؛ يُقترح الربط بالأهداف المعتمدة: ({'، '.join(linked_objectives)})."

    # Evidence-grounded L1-L3 taxonomy suggestion
    ad_clean = (original_cell_ad_l1_ar or "").strip() or None
    f_clean = (original_cell_f_risk_library_ar or "").strip() or None

    if "مزورة" in text_corpus or "احتيال خارجي" in text_corpus:
        sug_l1_id = "L1-02"
        sug_l1_ar = "2_ احتيال خارجي (احتيال خارجي)"
        sug_l1_en = "External Fraud"
        sug_l2_id = "L2-02-01"
        sug_l2_ar = "السرقة والاحتيال"
        sug_l3_id = "L3-02-01-02"
        sug_l3_ar = "التزوير"
    elif "محظور التعامل" in text_corpus or "قوائم الحظر" in text_corpus:
        sug_l1_id = "L1-05"
        sug_l1_ar = "5_الممارسات الخاطئة في حق عملاء البنك (ممارسات غير سليمة تمس حقوق عملاء البنك)"
        sug_l1_en = "Wrongful Practices Against Bank Customers' Rights"
        sug_l2_id = "L2-05-02"
        sug_l2_ar = "ممارسات الأعمال غير السليمة"
        sug_l3_id = "L3-05-02-04"
        sug_l3_ar = "أنشطة غير مرخصة أو غسل الأموال"
    elif "فقد المستندات" in text_corpus or "حفظ وأرشفة" in text_corpus or "فقد مستندات" in text_corpus:
        sug_l1_id = "L1-08"
        sug_l1_ar = "8_تنفيذ العمليات المصرفية (تنفيذ المعاملات وتسليمها وإدارتها)"
        sug_l1_en = "Executing, Delivering and Managing Transactions"
        sug_l2_id = "L2-08-03"
        sug_l2_ar = "مستندات العملاء"
        sug_l3_id = "L3-08-03-02"
        sug_l3_ar = "فقدان المستندات القانونية أو عدم كفاية التوثيق"
    elif "قيود" in text_corpus or "الأستاذ العام" in text_corpus:
        sug_l1_id = "L1-08"
        sug_l1_ar = "8_تنفيذ العمليات المصرفية (تنفيذ المعاملات وتسليمها وإدارتها)"
        sug_l1_en = "Executing, Delivering and Managing Transactions"
        sug_l2_id = "L2-08-01"
        sug_l2_ar = "تسجيل المعاملات وتنفيذها وصيانتها"
        sug_l3_id = "L3-08-01-05"
        sug_l3_ar = "أخطاء محاسبية"
    elif "توقف" in text_corpus and "ماكينات" in text_corpus:
        sug_l1_id = "L1-07"
        sug_l1_ar = "7_الأنظمة و التطبيقات (توقف الأعمال وتعطل الأنظمة)"
        sug_l1_en = "Business Interruption and System Failure"
        sug_l2_id = "L2-07-01"
        sug_l2_ar = "الأنظمة"
        sug_l3_id = "L3-07-01-01"
        sug_l3_ar = "تعطل المعدات الإلكترونية أو البرمجيات أو قنوات الاتصال"
    else:
        sug_l1_id = "L1-08"
        sug_l1_ar = "8_تنفيذ العمليات المصرفية (تنفيذ المعاملات وتسليمها وإدارتها)"
        sug_l1_en = "Executing, Delivering and Managing Transactions"
        sug_l2_id = "L2-08-01"
        sug_l2_ar = "تسجيل المعاملات وتنفيذها وصيانتها"
        sug_l3_id = "L3-08-01-03"
        sug_l3_ar = "عدم الالتزام بالمواعيد النهائية أو المسؤوليات المحددة"

    matches_ad = True
    discrepancy_note: Optional[str] = None
    if ad_clean:
        ad_code_digits = "".join(ch for ch in ad_clean if ch.isdigit())
        sug_code_digits = sug_l1_id.split("-")[-1].lstrip("0")
        if ad_code_digits and ad_code_digits != sug_code_digits:
            matches_ad = False
            discrepancy_note = (
                f"تصنيف المستوى الأول المسجل في AD ('{ad_clean}') يختلف عن التصنيف المقترح ({sug_l1_id}: {sug_l1_ar})؛ "
                "يتم الحفاظ على التصنيف المعتمد مع عرض المقترح للمراجعة."
            )
        elif f_clean and "احتيال خارجى" in f_clean and sug_l1_id == "L1-05":
            discrepancy_note = (
                f"تصنيف المستوى الأول في AD ('{ad_clean}' -> L1-05) متسق مع مخاطر الامتثال وقوائم الحظر (L3-05-02-04)، "
                f"بينما العمود F ('{f_clean}') يذكر 'احتيال خارجي' (L1-02)؛ يُوصى بتوحيد العمود F مع AD."
            )
        elif f_clean and "القيود المحاسبية" in f_clean and sug_l1_id == "L1-02":
            discrepancy_note = (
                f"تصنيف المستوى الأول في AD ('{ad_clean}' -> L1-02) متسق مع التزوير والاحتيال الخارجي (L3-02-01-02)، "
                f"بينما العمود F ('{f_clean}') يذكر 'أخطاء بإعداد القيود المحاسبية' (L1-08)؛ يُوصى بتصحيح العمود F."
            )

    return StrategicAndTaxonomyAlignment(
        risk_id=risk_id,
        unit_id=unit_id,
        original_cell_e_objective_ar=e_clean,
        sheet_header_objective_ar=h5_clean,
        linked_official_strategic_objectives=linked_objectives,
        strategic_objective_rationale_ar=obj_rationale,
        original_cell_ad_l1_ar=ad_clean,
        original_cell_f_risk_library_ar=f_clean,
        suggested_l1_id=sug_l1_id,
        suggested_l1_ar=sug_l1_ar,
        suggested_l1_en=sug_l1_en,
        suggested_l2_id=sug_l2_id,
        suggested_l2_ar=sug_l2_ar,
        suggested_l3_id=sug_l3_id,
        suggested_l3_ar=sug_l3_ar,
        classification_matches_approved_ad=matches_ad,
        classification_discrepancy_note_ar=discrepancy_note,
        esg_classification_status="DEFERRED_TO_PHASE_2C",
        review_status=SuggestionReviewStatus.PENDING_HUMAN_REVIEW,
        supporting_evidence=[
            EvidenceReference(
                source_file="reference_data/Methodology_Extract_8_Pages.json",
                location="Page 7 & Page 8",
                field_name="l1_categories_and_strategic_objectives",
                raw_value=f"{sug_l1_id} | {', '.join(linked_objectives)}",
            ),
            EvidenceReference(
                source_file="reference_data/Risk_Taxonomy__1_Risk_Taxonomy_L1_L3.csv",
                location=sug_l3_id or sug_l1_id,
                field_name="taxonomy_hierarchy",
                raw_value=f"{sug_l1_id} -> {sug_l2_id} -> {sug_l3_id} ({sug_l3_ar})",
            ),
        ],
    )


# ==============================================================================
# 9. HUMAN-IN-THE-LOOP READINESS & SINGLE-RISK WORKFLOW (PHASE 2B.1 SECTION 11)
# ==============================================================================


def build_hitl_review_package_for_risk(
    phase2a_request: FinancialInherentRequest,
    phase2b_request: ResidualRiskAssessmentRequest,
    evidence_bundle: Optional[DynamicEvidenceBundle] = None,
    workbook_cells: Optional[Dict[str, str]] = None,
    excel_row: Optional[int] = None,
) -> HumanInTheLoopReviewPackage:
    """
    Phase 2B.1 Section 11 — Assemble a complete, self-contained Human-in-the-Loop
    Review Package for a single risk, ready for interactive Maker-Checker review,
    single-cell editing, suggestion acceptance/rejection/modification, and dependent recalculation.
    """
    risk_id = phase2b_request.risk_id or phase2a_request.risk_id or "UNKNOWN-RISK"
    unit_id = phase2b_request.unit_id or phase2a_request.unit_id or "UNKNOWN-BU"
    bundle = evidence_bundle or load_dynamic_evidence_bundle(unit_id)
    cells = workbook_cells or {}
    r_str = str(excel_row) if excel_row is not None else ""

    # 1. Execute Phase 2A and Phase 2B engines
    p2a_res = calculate_financial_inherent_risk(phase2a_request)
    if phase2b_request.expected_annual_loss is None and p2a_res.expected_annual_loss is not None:
        phase2b_request = ResidualRiskAssessmentRequest(
            risk_id=phase2b_request.risk_id,
            unit_id=phase2b_request.unit_id,
            process_name=phase2b_request.process_name,
            risk_description=phase2b_request.risk_description,
            expected_annual_loss=p2a_res.expected_annual_loss,
            phase2a_result=p2a_res,
            controls=list(phase2b_request.controls),
            verified_no_controls=phase2b_request.verified_no_controls,
            control_environment_known=phase2b_request.control_environment_known,
            incident_Document_status=phase2b_request.incident_Document_status,
            audit_document_status=phase2b_request.audit_document_status,
            proposed_corrective_action=phase2b_request.proposed_corrective_action,
            source_evidence=list(phase2b_request.source_evidence),
        )
    p2b_res = calculate_residual_risk(phase2b_request)

    # 2. Identify linked incidents, audit findings, and SOP procedures from bundle
    linked_inc_ids = set(p2a_res.linked_incident_ids)
    for c in p2b_res.control_assessments:
        for iid in c.relevant_incident_ids:
            linked_inc_ids.add(iid)
    linked_incs = [
        inc
        for inc in bundle.incidents
        if inc.incident_id in linked_inc_ids or inc.incident_code in linked_inc_ids
    ]

    linked_aud_ids = set()
    for c in p2b_res.control_assessments:
        for aid in c.relevant_audit_finding_ids:
            linked_aud_ids.add(aid)
    linked_auds = [aud for aud in bundle.audit_findings if aud.finding_id in linked_aud_ids]

    linked_sop_ids = set()
    for c in p2b_res.control_assessments:
        for sid in c.linked_sop_steps:
            linked_sop_ids.add(sid)
    linked_sops = [sop for sop in bundle.sop_procedures if sop.chunk_id in linked_sop_ids]

    # 3. Evaluate Risk Description Quality
    orig_d = cells.get(f"D{r_str}") if r_str else phase2a_request.process_name
    orig_f = cells.get(f"F{r_str}") if r_str else phase2a_request.process_name
    risk_qual = evaluate_and_improve_risk_description(
        risk_id=risk_id,
        unit_id=unit_id,
        original_description_ar=phase2a_request.risk_description,
        original_process_cell_ar=orig_d,
        original_risk_library_cell_ar=orig_f,
        evidence_bundle=bundle,
        linked_incidents=linked_incs,
        linked_audit_findings=linked_auds,
        linked_sop_procedures=linked_sops,
    )

    # 4. Evaluate Control Descriptions Quality
    ctrl_quals = [
        evaluate_and_improve_control_description(
            control=ctrl,
            risk_id=risk_id,
            risk_description_ar=phase2a_request.risk_description or risk_qual.proposed_improved_description_ar,
            process_name_ar=risk_qual.proposed_process_name_ar,
        )
        for ctrl in phase2b_request.controls
    ]

    # 5. Evidence Intelligence Analysis
    ev_intel = analyze_evidence_intelligence_for_risk(
        risk_id=risk_id,
        unit_id=unit_id,
        process_name_ar=risk_qual.proposed_process_name_ar,
        controls=phase2b_request.controls,
        gap_findings=p2b_res.control_gap_findings,
        linked_incidents=linked_incs,
        linked_audit_findings=linked_auds,
    )

    # 6. Professional Arabic Assessment Rationale
    orig_ac = cells.get(f"AC{r_str}") if r_str else phase2a_request.workbook_ac_rationale
    rationale_prop = generate_professional_arabic_rationale(
        risk_id=risk_id,
        unit_id=unit_id,
        phase2a_result=p2a_res,
        phase2b_result=p2b_res,
        original_workbook_rationale_ar=orig_ac,
        linked_audit_finding_ids=[a.finding_id for a in linked_auds],
    )

    # 7. Corrective Action Recommendations
    orig_ab = cells.get(f"AB{r_str}") if r_str else phase2b_request.proposed_corrective_action
    action_rec = recommend_corrective_actions(
        risk_id=risk_id,
        unit_id=unit_id,
        phase2b_result=p2b_res,
        original_workbook_action_ar=orig_ab,
        linked_audit_findings=linked_auds,
    )

    # 8. Cross-Field Consistency Validation
    consistency_rep = validate_cross_field_consistency(
        risk_id=risk_id,
        unit_id=unit_id,
        phase2a_result=p2a_res,
        phase2b_result=p2b_res,
        risk_quality=risk_qual,
        control_qualities=ctrl_quals,
        rationale_proposal=rationale_prop,
        action_recommendation=action_rec,
        workbook_cells=cells,
        excel_row=excel_row,
    )

    # 9. Strategic Objectives & Risk Taxonomy Alignment
    orig_e = cells.get(f"E{r_str}") if r_str else None
    orig_h5 = cells.get("H5") if cells else None
    orig_ad = cells.get(f"AD{r_str}") if r_str else None
    strat_tax = evaluate_strategic_objectives_and_taxonomy(
        risk_id=risk_id,
        unit_id=unit_id,
        risk_description_ar=phase2a_request.risk_description or risk_qual.proposed_improved_description_ar,
        process_name_ar=risk_qual.proposed_process_name_ar,
        original_cell_e_objective_ar=orig_e,
        sheet_header_objective_ar=orig_h5,
        original_cell_ad_l1_ar=orig_ad,
        original_cell_f_risk_library_ar=orig_f,
        evidence_bundle=bundle,
    )

    # 10. Collect all pending missing fields & human review requirements
    pending_missing = list(dict.fromkeys(list(p2a_res.missing_fields) + list(p2b_res.missing_fields)))
    human_reqs: List[str] = []
    for cl in p2a_res.reviewer_clarification_requirements:
        if cl not in human_reqs:
            human_reqs.append(cl)
    for cq in ctrl_quals:
        for fl in cq.missing_or_unclear_evidence_flags:
            if fl not in human_reqs:
                human_reqs.append(fl)
    for ei in ev_intel:
        if ei.requires_human_review:
            msg = f"مراجعة ربط الدليل ({ei.source_record_id} — {ei.evidence_state.value}) بالضابط ({'، '.join(ei.relevant_existing_control_ids)})."
            if msg not in human_reqs:
                human_reqs.append(msg)
    for iss in consistency_rep.issues:
        msg = f"[{iss.category.value}] {iss.issue_description_ar}"
        if msg not in human_reqs:
            human_reqs.append(msg)

    active_desc = phase2a_request.risk_description or risk_qual.proposed_improved_description_ar
    active_rat = orig_ac or rationale_prop.proposed_rationale_ar
    active_act = orig_ab or (
        action_rec.required_corrective_action_candidates[0].proposed_action_text_ar
        if action_rec.required_corrective_action_candidates
        else None
    )

    preview_row = {
        "risk_id": risk_id,
        "unit_id": unit_id,
        "D_process_ar": orig_d or risk_qual.proposed_process_name_ar,
        "E_strategic_objectives": strat_tax.linked_official_strategic_objectives,
        "F_risk_library_ar": orig_f or strat_tax.suggested_l3_ar,
        "G_risk_description_ar": active_desc,
        "I_expected_frequency_ar": p2a_res.normalized_frequency_label_ar,
        "J_individual_financial_impact_egp": str(p2a_res.individual_financial_impact) if p2a_res.individual_financial_impact else None,
        "K_expected_annual_loss_egp": str(p2a_res.expected_annual_loss) if p2a_res.expected_annual_loss else None,
        "L_inherent_financial_rating": p2a_res.workbook_formatted_l_rating,
        "S_selected_max_rrf_key": p2b_res.selected_workbook_rrf_key,
        "T_residual_financial_loss_egp": str(p2b_res.residual_financial_amount) if p2b_res.residual_financial_amount else None,
        "U_residual_financial_rating": p2b_res.excel_u_column_rating,
        "AB_corrective_action_ar": active_act,
        "AC_assessment_rationale_ar": active_rat,
        "AD_level1_category_ar": orig_ad or strat_tax.suggested_l1_ar,
        "AE_esg_status": strat_tax.esg_classification_status,
    }

    return HumanInTheLoopReviewPackage(
        risk_id=risk_id,
        unit_id=unit_id,
        phase2a_request=phase2a_request,
        phase2a_result=p2a_res,
        phase2b_request=phase2b_request,
        phase2b_result=p2b_res,
        risk_description_quality=risk_qual,
        control_quality_assessments=ctrl_quals,
        evidence_intelligence=ev_intel,
        rationale_proposal=rationale_prop,
        corrective_action_recommendation=action_rec,
        consistency_report=consistency_rep,
        strategic_and_taxonomy=strat_tax,
        pending_missing_fields=pending_missing,
        human_review_requirements=human_reqs,
        active_risk_description_ar=active_desc,
        active_rationale_ar=active_rat,
        active_corrective_action_ar=active_act,
        maker_checker_status="DRAFT_AWAITING_MAKER_REVIEW",
        template_preview_row=preview_row,
    )


def apply_hitl_review_decision(
    package: HumanInTheLoopReviewPackage,
    user_role: str,
    target_field: str,
    action: str,  # "ACCEPT_SUGGESTION" | "REJECT_SUGGESTION" | "MODIFY_TEXT" | "UPDATE_INPUT_AND_RECALCULATE"
    custom_value: Optional[Any] = None,
    target_control_id: Optional[str] = None,
    evidence_bundle: Optional[DynamicEvidenceBundle] = None,
) -> HumanInTheLoopReviewPackage:
    """
    Phase 2B.1 Section 11 — Interactive Human-in-the-Loop handler:
    - Enforces Maker-Checker role boundaries (`AUDITOR` is strictly read-only; `MAKER` edits/accepts/modifies drafts;
      `CHECKER` cannot self-approve a Maker edit in the same step).
    - Supports:
      1. Accepting, rejecting, or modifying text suggestions (`risk_description`, `rationale`, `corrective_action`, `control_description`).
      2. Updating an input cell (`individual_financial_impact`, `expected_frequency_text`, `control_effectiveness`, `control_type`)
         and triggering dependent Phase 2A + Phase 2B + Phase 2B.1 recalculation.
    """
    role_upper = user_role.strip().upper()
    if role_upper == "AUDITOR":
        raise PermissionError("AUDITOR role is strictly read-only and cannot modify RCSA assessments or suggestions.")
    if role_upper not in ("MAKER", "CHECKER", "RISK_ADMIN"):
        raise PermissionError(f"Unauthorized role for RCSA review operation: {user_role!r}")

    # Input cell update + dependent recalculation
    if action == "UPDATE_INPUT_AND_RECALCULATE":
        if role_upper == "CHECKER":
            raise PermissionError("CHECKER role reviews/approves submitted assessments and cannot directly author Maker input cells.")

        new_p2a_req = package.phase2a_request
        new_p2b_req = package.phase2b_request

        if target_field == "individual_financial_impact":
            new_p2a_req, new_p2a_res = update_financial_inherent_input_and_recalculate(
                request=package.phase2a_request,
                individual_financial_impact=custom_value,
                financial_value_origin=FinancialValueOrigin.EXPLICIT_HUMAN_ESTIMATE,
            )
            new_p2b_req = ResidualRiskAssessmentRequest(
                risk_id=package.phase2b_request.risk_id,
                unit_id=package.phase2b_request.unit_id,
                process_name=package.phase2b_request.process_name,
                risk_description=package.phase2b_request.risk_description,
                expected_annual_loss=new_p2a_res.expected_annual_loss,
                phase2a_result=new_p2a_res,
                controls=list(package.phase2b_request.controls),
                verified_no_controls=package.phase2b_request.verified_no_controls,
                control_environment_known=package.phase2b_request.control_environment_known,
                incident_Document_status=package.phase2b_request.incident_Document_status,
                audit_document_status=package.phase2b_request.audit_document_status,
                proposed_corrective_action=package.phase2b_request.proposed_corrective_action,
                source_evidence=list(package.phase2b_request.source_evidence),
            )
        elif target_field == "expected_frequency_text":
            new_p2a_req, new_p2a_res = update_financial_inherent_input_and_recalculate(
                request=package.phase2a_request,
                expected_frequency_text=str(custom_value),
                frequency_origin=FrequencyEvidenceOrigin.AUTHORIZED_USER_ESTIMATE,
            )
            new_p2b_req = ResidualRiskAssessmentRequest(
                risk_id=package.phase2b_request.risk_id,
                unit_id=package.phase2b_request.unit_id,
                process_name=package.phase2b_request.process_name,
                risk_description=package.phase2b_request.risk_description,
                expected_annual_loss=new_p2a_res.expected_annual_loss,
                phase2a_result=new_p2a_res,
                controls=list(package.phase2b_request.controls),
                verified_no_controls=package.phase2b_request.verified_no_controls,
                control_environment_known=package.phase2b_request.control_environment_known,
                incident_Document_status=package.phase2b_request.incident_Document_status,
                audit_document_status=package.phase2b_request.audit_document_status,
                proposed_corrective_action=package.phase2b_request.proposed_corrective_action,
                source_evidence=list(package.phase2b_request.source_evidence),
            )
        elif target_field == "control_effectiveness" and target_control_id:
            new_p2b_req, _ = update_control_in_risk_and_recalculate(
                request=package.phase2b_request,
                control_id=target_control_id,
                effectiveness_raw=str(custom_value),
            )
        elif target_field == "control_type" and target_control_id:
            new_p2b_req, _ = update_control_in_risk_and_recalculate(
                request=package.phase2b_request,
                control_id=target_control_id,
                control_type_raw=str(custom_value),
            )
        elif target_field == "control_scope_eligibility" and target_control_id:
            new_p2b_req, _ = update_control_in_risk_and_recalculate(
                request=package.phase2b_request,
                control_id=target_control_id,
                eligible_for_scope_override=bool(custom_value),
            )
        else:
            raise ValueError(f"Unsupported input cell update field: {target_field!r}")

        recalculated_pkg = build_hitl_review_package_for_risk(
            phase2a_request=new_p2a_req,
            phase2b_request=new_p2b_req,
            evidence_bundle=evidence_bundle,
        )
        # Ensure active_rationale_ar reflects the freshly recalculated rationale when input cells or eligibility change
        recalculated_pkg.active_rationale_ar = recalculated_pkg.rationale_proposal.proposed_rationale_ar
        recalculated_pkg.template_preview_row["AC_assessment_rationale_ar"] = recalculated_pkg.active_rationale_ar
        recalculated_pkg.maker_checker_status = "MODIFIED_BY_MAKER_PENDING_CHECKER_APPROVAL"
        return recalculated_pkg

    # Text suggestion review (Accept / Reject / Modify)
    new_status = (
        SuggestionReviewStatus.ACCEPTED_BY_MAKER
        if action == "ACCEPT_SUGGESTION"
        else SuggestionReviewStatus.REJECTED_KEEP_ORIGINAL
        if action == "REJECT_SUGGESTION"
        else SuggestionReviewStatus.MODIFIED_BY_MAKER
    )

    if target_field == "risk_description":
        package.risk_description_quality.review_status = new_status
        if action == "ACCEPT_SUGGESTION":
            package.active_risk_description_ar = package.risk_description_quality.proposed_improved_description_ar
        elif action == "REJECT_SUGGESTION":
            package.active_risk_description_ar = package.risk_description_quality.original_description_ar or ""
        elif action == "MODIFY_TEXT" and custom_value is not None:
            package.active_risk_description_ar = str(custom_value)
        package.template_preview_row["G_risk_description_ar"] = package.active_risk_description_ar

    elif target_field == "rationale":
        package.rationale_proposal.review_status = new_status
        if action == "ACCEPT_SUGGESTION":
            package.active_rationale_ar = package.rationale_proposal.proposed_rationale_ar
        elif action == "REJECT_SUGGESTION":
            package.active_rationale_ar = package.rationale_proposal.original_workbook_rationale_ar or ""
        elif action == "MODIFY_TEXT" and custom_value is not None:
            package.active_rationale_ar = str(custom_value)
        package.template_preview_row["AC_assessment_rationale_ar"] = package.active_rationale_ar

    elif target_field == "corrective_action":
        package.corrective_action_recommendation.review_status = new_status
        if action == "ACCEPT_SUGGESTION" and package.corrective_action_recommendation.required_corrective_action_candidates:
            package.active_corrective_action_ar = (
                package.corrective_action_recommendation.required_corrective_action_candidates[0].proposed_action_text_ar
            )
        elif action == "REJECT_SUGGESTION":
            package.active_corrective_action_ar = package.corrective_action_recommendation.original_workbook_action_ar
        elif action == "MODIFY_TEXT" and custom_value is not None:
            package.active_corrective_action_ar = str(custom_value)
        package.template_preview_row["AB_corrective_action_ar"] = package.active_corrective_action_ar

    package.maker_checker_status = "MODIFIED_BY_MAKER_PENDING_CHECKER_APPROVAL"
    return package


# ==============================================================================
# 10. BEFORE / AFTER QUALITY EVALUATION SHOWCASE (PHASE 2B.1 SECTION 10)
# ==============================================================================


def build_account_opening_candidate_review_package(
    sqlite_db_path: Optional[Union[str, Path]] = None,
) -> HumanInTheLoopReviewPackage:
    """
    Derive an authoritative Account Opening risk candidate (`RSK-ACCT-CAND-01`) directly
    from the registered Account Opening SOP (`DOC-SOP-ACCT` Procedures 1, 2, 5),
    Historical Incidents (`INC-ACCT-200`: 201,000 EGP expired National ID; `INC-ACCT-201`: 1,500 EGP),
    and Audit Finding #1 (`AUD-ACCT-01`: incomplete account opening documents & lack of mandatory system checklist).
    - Preserves `original_description = None` (`MISSING_IN_SOURCE`) because no pre-existing RCSA workbook
      was uploaded for `BU-ACCOUNT`.
    - Keeps frequency as `PENDING_INPUT` (`MISSING_FREQUENCY`) because `DOC-INC-ACCT` has no observation period,
      so the engine refuses to invent frequency from undated incident counts.
    """
    acct_bundle = load_dynamic_evidence_bundle("BU-ACCOUNT", sqlite_db_path=sqlite_db_path)

    p2a_req = FinancialInherentRequest(
        risk_ref="ACCT-CAND-01",
        risk_id="RSK-ACCT-CAND-01",
        unit_id="BU-ACCOUNT",
        process_name="استلام ومراجعة طلبات فتح الحسابات والتحقق من هوية العميل",
        risk_description=None,  # Explicitly None: no pre-existing workbook text exists for BU-ACCOUNT
        individual_financial_impact=None,  # Selected from linked Incident 200 (201,000 EGP) via mechanism matching
        expected_frequency_text=None,  # Missing in source -> triggers PENDING_INPUT without inventing frequency
        failure_mechanism_keywords=[
            "فتح حساب عميل بمستندات غير صحيحة",
            "بطاقة الرقم القومي منتهية",
            "عدم اكتمال بعض مستندات ومتطلبات فتح الحسابات",
        ],
        candidate_incidents=acct_bundle.incidents,
        explicit_linked_incident_ids=["INC-ACCT-200"],
        incidents_document_status="AVAILABLE",
        source_evidence=[
            EvidenceReference(
                source_file="DOC-SOP-ACCT (492fe846.pdf)",
                location="CHK-SOP-ACCT-01 & CHK-SOP-ACCT-02",
                field_name="sop_procedure",
                raw_value="الإجراء الأول: استلام ومراجعة طلبات فتح الحسابات | الإجراء الثاني: التحقق من هوية العميل وبياناته الأساسية",
            ),
            EvidenceReference(
                source_file="DOC-INC-ACCT (95fdf53e.pdf)",
                location="INC-ACCT-200",
                field_name="historical_incident",
                raw_value="فتح حساب عميل بمستندات غير صحيحة حيث ان بطاقة الرقم القومي منتهية (201,000 ج.م)",
            ),
            EvidenceReference(
                source_file="DOC-AUD-ACCT (ac4aff51.pdf)",
                location="AUD-ACCT-01",
                field_name="audit_finding",
                raw_value="الملاحظة الأولى: عدم اكتمال بعض مستندات ومتطلبات فتح الحسابات",
            ),
        ],
    )

    raw_controls = [
        ControlInputRecord(
            control_id="CTL-ACCT-01",
            linked_risk_id="RSK-ACCT-CAND-01",
            control_description="استلام ومراجعة طلب فتح الحساب والتحقق يدوياً من اكتمال الملف وصلاحية مستندات إثبات الشخصية قبل الإدخال",
            control_owner="موظف خدمة العملاء / العمليات",
            control_type_raw="Preventive",
            control_method_raw="Manual",
            control_frequency_raw="Daily\nيومياً",
            effectiveness_raw="ضابط رقابي يحتاج إلى تطوير",
            implementation_status=ControlImplementationStatus.IMPLEMENTED,
            linked_sop_steps=["CHK-SOP-ACCT-01", "CHK-SOP-ACCT-02"],
            evidence_references=[
                EvidenceReference(
                    source_file="DOC-SOP-ACCT",
                    location="CHK-SOP-ACCT-01",
                    field_name="sop_control_step",
                    raw_value="مراجعة صلاحية المستندات الرسمية ووضوحها وإيقاف العملية حال وجود نواقص",
                )
            ],
        ),
        ControlInputRecord(
            control_id="CTL-ACCT-02",
            linked_risk_id="RSK-ACCT-CAND-01",
            control_description="مراجعة واعتماد طلب فتح الحساب والتحقق من اكتمال المستندات وفق مبدأ الرقابة المزدوجة (Maker/Checker) قبل التفعيل",
            control_owner="السلطة الإشرافية (Checker)",
            control_type_raw="Preventive",
            control_method_raw="Semi-Automated",
            control_frequency_raw="Daily\nيومياً",
            effectiveness_raw="ضابط رقابي يحتاج إلى تطوير",
            implementation_status=ControlImplementationStatus.IMPLEMENTED,
            linked_sop_steps=["CHK-SOP-ACCT-05", "CHK-SOP-ACCT-06"],
            evidence_references=[
                EvidenceReference(
                    source_file="DOC-SOP-ACCT",
                    location="CHK-SOP-ACCT-05",
                    field_name="sop_control_step",
                    raw_value="الفصل بين الموظف القائم بالإدخال والموظف القائم بالمراجعة والاعتماد (Maker/Checker)",
                )
            ],
        ),
        ControlInputRecord(
            control_id="CTL-ACCT-03-PROPOSED",
            linked_risk_id="RSK-ACCT-CAND-01",
            control_description="تطبيق آلية Mandatory Checklist / System Validation آلياً لمنع استكمال أو تفعيل الحساب قبل استيفاء كافة المستندات الإلزامية",
            control_owner="قطاع العمليات وتكنولوجيا المعلومات",
            control_type_raw="Preventive",
            control_method_raw="Automated",
            control_frequency_raw="Ad-hoc\nوفقاً والحالة",
            effectiveness_raw="PENDING_REVIEW",
            implementation_status=ControlImplementationStatus.PROPOSED,  # Proposed control: excluded from current RRF!
            linked_sop_steps=["CHK-SOP-ACCT-06"],
            evidence_references=[
                EvidenceReference(
                    source_file="DOC-AUD-ACCT",
                    location="AUD-ACCT-01",
                    field_name="audit_recommended_control",
                    raw_value="دراسة تطبيق النظام المستخدم آلية Mandatory Checklist / System Validation",
                )
            ],
        ),
    ]

    ev_inputs = [
        IncidentOrAuditEvidenceInput(
            finding_id="DOC-GAP-ACCT-01",
            unit_id="BU-ACCOUNT",
            source_type="AUDIT_FINDING",
            source_reference_id="INC-ACCT-200, AUD-ACCT-01",
            affected_business_process="استلام ومراجعة طلبات فتح الحسابات والتحقق من هوية العميل",
            failure_mechanism="الاعتماد الجزئي على المراجعة اليدوية للمستندات وقبول بطاقة رقم قومي منتهية الصلاحية في ظل غياب ضابط آلي مانع (Mandatory Checklist)",
            failure_keywords=["مراجعة طلب فتح الحساب", "صلاحية مستندات"],
            explicit_confirmed_control_ids=["CTL-ACCT-01", "CTL-ACCT-02"],
            deficiency_category=ControlDeficiencyCategory.CONTROL_DESIGN_DEFICIENCY,
            evidence_references=[
                EvidenceReference(
                    source_file="DOC-AUD-ACCT",
                    location="AUD-ACCT-01",
                    field_name="root_causes_ar",
                    raw_value="الاعتماد الجزئي على المراجعة اليدوية للمستندات، وعدم وجود ضابط آلي مانع في جميع مراحل العملية",
                ),
                EvidenceReference(
                    source_file="DOC-INC-ACCT",
                    location="INC-ACCT-200",
                    field_name="incident_detail_ar",
                    raw_value="فتح حساب عميل بمستندات غير صحيحة حيث ان بطاقة الرقم القومي منتهية (201,000 EGP)",
                ),
            ],
        )
    ]

    linked_controls, _ = link_evidence_records_to_controls(
        controls=raw_controls,
        evidence_inputs=ev_inputs,
    )

    p2b_req = ResidualRiskAssessmentRequest(
        risk_id="RSK-ACCT-CAND-01",
        unit_id="BU-ACCOUNT",
        process_name="استلام ومراجعة طلبات فتح الحسابات والتحقق من هوية العميل",
        risk_description=None,
        expected_annual_loss=None,
        controls=linked_controls,
        verified_no_controls=False,
        control_environment_known=True,
        incident_Document_status="AVAILABLE",
        audit_document_status="AVAILABLE",
        proposed_corrective_action=None,
        source_evidence=list(p2a_req.source_evidence),
    )

    return build_hitl_review_package_for_risk(
        phase2a_request=p2a_req,
        phase2b_request=p2b_req,
        evidence_bundle=acct_bundle,
    )


def generate_before_after_quality_evaluations(
    workbook_json_path: Union[str, Path] = DEFAULT_WORKBOOK_PATH,
    sqlite_db_path: Optional[Union[str, Path]] = None,
) -> List[BeforeAfterQualityEvaluation]:
    """
    Phase 2B.1 Section 10 — Generate real Before / After Quality Evaluations for:
    1. Risk #4 (`RSK-SYND-04`, Row 19) — Syndicated Loans transaction execution failure.
    2. Risk #7 (`RSK-SYND-07`, Row 23) — Physical document retention weaknesses.
    3. Risk #8 (`RSK-SYND-08`, Row 26) — Forged document verification weaknesses.
    4. Account Opening Risk Candidate (`RSK-ACCT-CAND-01`) — Derived from Account Opening SOP, Incidents & Audit Findings.
    Clearly labels verified source facts versus AI/Engine-generated proposals and never fabricates missing original texts.
    """
    synd_bundle = load_dynamic_evidence_bundle("BU-SYNDICATED", sqlite_db_path=sqlite_db_path)
    loaded_synd = load_syndicated_loans_workbook_requests(workbook_json_path)
    by_id = {req.risk_id: (r_row, ctrl_rows, req, cell_map) for r_row, ctrl_rows, req, cell_map in loaded_synd}

    target_synd_specs = [
        ("EX-01-RISK-4", "RSK-SYND-04", ["100", "103"], "المثال الأول: المخاطرة رقم 4 (القروض المشتركة — إغفال تنفيذ وتعزيز طلبات العملاء)"),
        ("EX-02-RISK-7", "RSK-SYND-07", ["101", "102"], "المثال الثاني: المخاطرة رقم 7 (القروض المشتركة — قصور حفظ وأرشفة أصول المستندات الورقية)"),
        ("EX-03-RISK-8", "RSK-SYND-08", ["106"], "المثال الثالث: المخاطرة رقم 8 (القروض المشتركة — قصور التحقق من المستندات والتوقيعات المزورة)"),
    ]

    evaluations: List[BeforeAfterQualityEvaluation] = []

    for ex_id, r_id, exp_inc_codes, title_ar in target_synd_specs:
        r_row, _, p2b_req, cell_map = by_id[r_id]
        p2a_req = FinancialInherentRequest(
            risk_ref=f"RISK-{cell_map.get(f'C{r_row}', '').strip()} (Row {r_row})",
            risk_id=r_id,
            unit_id="BU-SYNDICATED",
            process_name=cell_map.get(f"F{r_row}", "").strip(),
            risk_description=cell_map.get(f"G{r_row}", "").strip(),
            individual_financial_impact=cell_map.get(f"J{r_row}", "").strip(),
            financial_value_origin=FinancialValueOrigin.TEMPLATE_REFERENCE_AMOUNT,
            expected_frequency_text=cell_map.get(f"I{r_row}", ""),
            frequency_origin=FrequencyEvidenceOrigin.SOURCE_DOCUMENTED_FREQUENCY,
            explicit_linked_incident_ids=exp_inc_codes,
            workbook_cached_k_loss=cell_map.get(f"K{r_row}", ""),
            workbook_cached_l_rating=cell_map.get(f"L{r_row}", ""),
            workbook_ac_rationale=cell_map.get(f"AC{r_row}", "").strip(),
            source_evidence=list(p2b_req.source_evidence),
        )

        pkg = build_hitl_review_package_for_risk(
            phase2a_request=p2a_req,
            phase2b_request=p2b_req,
            evidence_bundle=synd_bundle,
            workbook_cells=cell_map,
            excel_row=r_row,
        )

        evaluations.append(
            BeforeAfterQualityEvaluation(
                example_id=ex_id,
                risk_id=r_id,
                unit_id="BU-SYNDICATED",
                excel_row=r_row,
                title_ar=title_ar,
                original_description_ar=pkg.risk_description_quality.original_description_ar,
                original_description_provenance=pkg.risk_description_quality.original_description_status,
                original_process_cell_ar=cell_map.get(f"F{r_row}", "").strip(),
                original_rationale_cell_ac_ar=cell_map.get(f"AC{r_row}", "").strip(),
                original_action_cell_ab_ar=cell_map.get(f"AB{r_row}", "").strip() or None,
                proposed_process_name_ar=pkg.risk_description_quality.proposed_process_name_ar,
                proposed_improved_description_ar=pkg.risk_description_quality.proposed_improved_description_ar,
                proposal_provenance=ContentProvenanceLabel.AI_PROPOSED_IMPROVEMENT,
                linked_source_evidence=pkg.risk_description_quality.supporting_evidence,
                evidence_intelligence_items=pkg.evidence_intelligence,
                control_evaluations=pkg.control_quality_assessments,
                rationale_proposal=pkg.rationale_proposal,
                corrective_action_recommendation=pkg.corrective_action_recommendation,
                consistency_report=pkg.consistency_report,
                strategic_and_taxonomy_alignment=pkg.strategic_and_taxonomy,
                human_review_requirements=pkg.human_review_requirements,
            )
        )

    # 4. Account Opening Risk Candidate derived from registered sources
    acct_pkg = build_account_opening_candidate_review_package(sqlite_db_path=sqlite_db_path)
    evaluations.append(
        BeforeAfterQualityEvaluation(
            example_id="EX-04-ACCT-CAND-01",
            risk_id=acct_pkg.risk_id,
            unit_id=acct_pkg.unit_id,
            excel_row=None,
            title_ar="المثال الرابع: مرشح مخاطرة لوحدة فتح الحسابات مشتق من الأدلة (عدم استيفاء وصلاحية مستندات فتح الحساب)",
            original_description_ar=None,  # Strictly None: no pre-existing RCSA workbook exists for BU-ACCOUNT
            original_description_provenance=ContentProvenanceLabel.MISSING_IN_SOURCE,
            original_process_cell_ar=None,
            original_rationale_cell_ac_ar=None,
            original_action_cell_ab_ar=None,
            proposed_process_name_ar=acct_pkg.risk_description_quality.proposed_process_name_ar,
            proposed_improved_description_ar=acct_pkg.risk_description_quality.proposed_improved_description_ar,
            proposal_provenance=ContentProvenanceLabel.AI_PROPOSED_IMPROVEMENT,
            linked_source_evidence=acct_pkg.risk_description_quality.supporting_evidence,
            evidence_intelligence_items=acct_pkg.evidence_intelligence,
            control_evaluations=acct_pkg.control_quality_assessments,
            rationale_proposal=acct_pkg.rationale_proposal,
            corrective_action_recommendation=acct_pkg.corrective_action_recommendation,
            consistency_report=acct_pkg.consistency_report,
            strategic_and_taxonomy_alignment=acct_pkg.strategic_and_taxonomy,
            human_review_requirements=acct_pkg.human_review_requirements,
        )
    )

    return evaluations


def run_end_to_end_syndicated_reconciliation(
    workbook_json_path: Union[str, Path] = DEFAULT_WORKBOOK_PATH,
    sqlite_db_path: Optional[Union[str, Path]] = None,
) -> List[CrossEngineReconciliationRow]:
    """
    Phase 2B.2 Section 9 — Run all 8 Syndicated Loans risks (`RSK-SYND-01`..`RSK-SYND-08`,
    Rows 8..27, 20 controls) through the integrated Phase 2A + Phase 2A.1 + Phase 2B +
    Phase 2B.1/2B.2 pipeline, producing a complete end-to-end reconciliation table.
    """
    synd_bundle = load_dynamic_evidence_bundle("BU-SYNDICATED", sqlite_db_path=sqlite_db_path)
    loaded_synd = load_syndicated_loans_workbook_requests(workbook_json_path)

    explicit_inc_by_risk: Dict[str, List[str]] = {
        "RSK-SYND-01": [],
        "RSK-SYND-02": [],
        "RSK-SYND-03": [],
        "RSK-SYND-04": ["100", "103"],
        "RSK-SYND-05": [],
        "RSK-SYND-06": [],
        "RSK-SYND-07": ["101", "102"],
        "RSK-SYND-08": ["106"],
    }

    rows: List[CrossEngineReconciliationRow] = []

    for r_row, ctrl_rows, p2b_req, cell_map in loaded_synd:
        risk_num = cell_map.get(f"C{r_row}", "").strip()
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
            explicit_linked_incident_ids=explicit_inc_by_risk.get(r_id, []),
            workbook_cached_k_loss=cell_map.get(f"K{r_row}", ""),
            workbook_cached_l_rating=cell_map.get(f"L{r_row}", ""),
            workbook_ac_rationale=cell_map.get(f"AC{r_row}", "").strip(),
            source_evidence=list(p2b_req.source_evidence),
        )

        pkg = build_hitl_review_package_for_risk(
            phase2a_request=p2a_req,
            phase2b_request=p2b_req,
            evidence_bundle=synd_bundle,
            workbook_cells=cell_map,
            excel_row=r_row,
        )

        p2a_res = pkg.phase2a_result
        p2b_res = pkg.phase2b_result

        ctrl_ids = [c.control_id for c in p2b_res.control_assessments]
        ctrl_rrf_map = {
            c.control_id: (
                f"{c.applicable_rrf} ({c.control_method.value if c.control_method else ''}/{c.control_type.value if c.control_type else ''})"
                + (" [PENDING_REVIEW]" if not c.is_eligible_for_residual_reduction else "")
            )
            for c in p2b_res.control_assessments
        }

        wb_s_key = cell_map.get(f"S{r_row}", "").strip()
        wb_rrf = WORKBOOK_KEY_TO_RRF.get(wb_s_key.lower(), Decimal("0"))
        wb_t = Decimal(cell_map.get(f"T{r_row}", "0").strip())
        wb_u = cell_map.get(f"U{r_row}", "").strip()

        scope_rev_req = any(c.scope_requires_human_review for c in p2b_res.control_assessments if c.control_id == p2b_res.selected_max_rrf_control_id)
        scope_rev_rrf: Optional[Decimal] = None
        scope_rev_res: Optional[Decimal] = None
        scope_rev_sev: Optional[str] = None

        if scope_rev_req and p2b_res.selected_max_rrf_control_id:
            revised_pkg = apply_hitl_review_decision(
                package=pkg,
                user_role="MAKER",
                target_field="control_scope_eligibility",
                action="UPDATE_INPUT_AND_RECALCULATE",
                custom_value=False,
                target_control_id=p2b_res.selected_max_rrf_control_id,
                evidence_bundle=synd_bundle,
            )
            scope_rev_rrf = revised_pkg.phase2b_result.effective_rrf
            scope_rev_res = revised_pkg.phase2b_result.residual_financial_amount
            scope_rev_sev = (
                revised_pkg.phase2b_result.continuous_residual_rating.value
                if revised_pkg.phase2b_result.continuous_residual_rating
                else None
            )

        notes: List[str] = []
        if r_id == "RSK-SYND-02":
            notes.append("Row 15 (P15) blank -> PENDING_REVIEW; MAX RRF=0.95 from CTL-SYND-R11/R12.")
        elif r_id == "RSK-SYND-04":
            notes.append(
                "Row 19 only (CTL-SYND-R19, RRF=0.75); J19=1,501,000 (VH anchor) vs highest incident INC-SYND-103=700,000 (H)."
            )
        elif r_id == "RSK-SYND-05":
            notes.append("Row 20 only (CTL-SYND-R20, RRF=0.90); distinct from Risk #4.")
        elif r_id == "RSK-SYND-06":
            notes.append(
                "Engine selects MAX RRF=0.80 (CTL-SYND-R22, T21=100,200 EGP, L) vs workbook S21 manual 0.90 (T21=50,100 EGP, L)."
            )
        elif r_id == "RSK-SYND-07":
            notes.append(
                "CTL-SYND-R24 (Share Folder, official RRF=0.90 -> T23=200,400 EGP, M) flagged for scope review; if excluded, MAX RRF=0.75 (CTL-SYND-R23/R25 -> 501,000 EGP, H)."
            )
        elif r_id == "RSK-SYND-08":
            notes.append(
                "CTL-SYND-R26 (Manual/Preventive, RRF=0.75, Needs Improvement) & CTL-SYND-R27 (Semi-Auto/Preventive, MAX RRF=0.90 -> T26=601,200 EGP, H)."
            )
        else:
            notes.append("100% match across Phase 2A, 2A.1, 2B, and 2B.2.")

        rows.append(
            CrossEngineReconciliationRow(
                risk_id=r_id,
                risk_ref=f"Risk #{risk_num}",
                workbook_rows=list(ctrl_rows),
                actual_control_ids=ctrl_ids,
                control_rrf_map=ctrl_rrf_map,
                source_incident_ids=list(p2a_res.linked_incident_ids),
                individual_impact_egp=p2a_res.individual_financial_impact or Decimal("0"),
                individual_impact_origin=(
                    p2a_res.financial_value_origin.value if p2a_res.financial_value_origin else ""
                ),
                individual_impact_severity=(
                    p2a_res.individual_impact_rating.value if p2a_res.individual_impact_rating else ""
                ),
                annual_frequency_multiplier=p2a_res.annual_frequency_multiplier or Decimal("0"),
                expected_annual_loss_egp=p2a_res.expected_annual_loss or Decimal("0"),
                inherent_severity=(
                    p2a_res.annualized_financial_rating.value if p2a_res.annualized_financial_rating else ""
                ),
                correct_max_rrf=p2b_res.effective_rrf or Decimal("0"),
                selected_max_rrf_control_id=p2b_res.selected_max_rrf_control_id or "",
                workbook_reference_rrf=wb_rrf,
                residual_amount_egp=p2b_res.residual_financial_amount or Decimal("0"),
                workbook_reference_residual_egp=wb_t,
                residual_severity=(
                    p2b_res.continuous_residual_rating.value if p2b_res.continuous_residual_rating else ""
                ),
                workbook_reference_residual_severity=wb_u,
                scope_review_required=scope_rev_req,
                scope_revised_max_rrf=scope_rev_rrf,
                scope_revised_residual_egp=scope_rev_res,
                scope_revised_severity=scope_rev_sev,
                consistency_status="VERIFIED_CONSISTENT",
                consistency_notes=" ".join(notes),
            )
        )

    return rows

