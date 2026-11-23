export type ControlDesignType = 'PREVENTIVE' | 'DETECTIVE' | 'CORRECTIVE';
export type ControlAutomationType = 'AUTOMATED' | 'SEMI_AUTOMATED' | 'MANUAL';

/**
 * Official 5 NBE Strategic Objectives (Methodology PDF Page 8 — reference_data/Methodology_Extract_8_Pages.json).
 */
export const OFFICIAL_NBE_STRATEGIC_OBJECTIVES = [
  'التركيز على العملاء و تعظيم الأرباح',
  'التحول الرقمي و تفعيل الذكاء الاصطناعي',
  'النمو المربح و المستدام',
  'الكفاءة و الامان والمرونة',
  'الشمول المالي',
] as const;

export type OfficialNbeStrategicObjective = (typeof OFFICIAL_NBE_STRATEGIC_OBJECTIVES)[number];

/**
 * Official NBE Financial Reference Anchor Amounts (Methodology Page 6 & Official Template EI880:EI884).
 * Arbitrary values like 250,000 / 180,000 / 200,000 must NEVER be used as reference anchors.
 */
export const OFFICIAL_FINANCIAL_ANCHORS_EGP = {
  L: 50000,
  M: 151000,
  H: 501000,
  VH: 1501000,
  C: 3001000,
} as const;

/**
 * Official NBE Control Frequencies (Methodology Page 2 & Official Template Column Q).
 * Non-standard values like "Per Transaction" / "Per Event" are strictly prohibited.
 */
export const OFFICIAL_NBE_CONTROL_FREQUENCIES = [
  'Multiple times a day\nعدة مرات في اليوم',
  'Daily\nيومياً',
  'Weekly\nأسبوعياً',
  'Monthly\nشهرياً',
  'Quarterly\nربع سنوي',
  'Annually\nسنوي',
  'Ad-hoc\nوفقاً والحالة',
] as const;

/**
 * Official NBE Basel Level-1 Risk Categories (Methodology Page 7).
 */
export const OFFICIAL_BASEL_L1_MAP: Record<string, { code: string; ar: string; en: string }> = {
  'L1-01': { code: '1', ar: '1_ احتيال داخلي', en: 'Internal Fraud' },
  'L1-02': { code: '2', ar: '2_ احتيال خارجي', en: 'External Fraud' },
  'L1-03': { code: '3', ar: '3_وسائل الاحتيال على البطاقات', en: 'Means of Credit Card Fraud' },
  'L1-04': { code: '4', ar: '4_ممارسات العاملين وسلامة بيئة العمل', en: 'Violating labor laws and occupational safety' },
  'L1-05': { code: '5', ar: '5_الممارسات الخاطئة في حق عملاء البنك', en: 'Wrongful practices against banks customers right' },
  'L1-06': { code: '6', ar: '6_أضرار بأصول البنك', en: 'Damages to physical Assets' },
  'L1-07': { code: '7', ar: '7_الأنظمة و التطبيقات', en: 'Business Interruption and System Failure' },
  'L1-08': { code: '8', ar: '8_تنفيذ العمليات المصرفية', en: 'Executing Delivering and Managing Transactions' },
};

export interface ExtractedControlDetails {
  control_name_ar: string;
  design_classification: ControlDesignType;
  control_type_label_ar: string;
  automation_level: ControlAutomationType;
  control_method_label_ar: string;
  control_frequency_raw: string;
  control_owner_ar: string;
  effectiveness_raw: string;
  description_ar: string;
}

export interface ExtractedEsgConfig {
  status: 'ASSESSED' | 'NO_DOCUMENTED_LINK';
  pillars: Array<'E' | 'S' | 'G'>;
  catalogue_ids: number[];
  evidence: Record<string, string>;
  justification?: string;
  pillar_label_ar: string;
  pathway_ar: string;
}

export interface ExtractedRiskDetails {
  pattern_id?: string;
  process_name_ar: string;
  risk_title_ar: string;
  description_ar: string;
  strategic_objective_ar: OfficialNbeStrategicObjective;
  inherent_frequency_text: string;
  frequency_multiplier: number;
  frequency_justification_ar: string;
  reference_anchor_egp: number;
  taxonomy_l1_id: string;
  taxonomy_l1_ar: string;
  taxonomy_l2_id: string;
  taxonomy_l2_ar: string;
  taxonomy_l3_id: string;
  taxonomy_l3_ar: string;
  nfi_service: 'L' | 'M' | 'H' | 'VH' | 'C' | '-';
  nfi_reputation: 'L' | 'M' | 'H' | 'VH' | 'C' | '-';
  nfi_regulatory: 'L' | 'M' | 'H' | 'VH' | 'C' | '-';
  nfi_legal: 'L' | 'M' | 'H' | 'VH' | 'C' | '-';
  service_impact_evidence_ar: string;
  reputation_impact_evidence_ar: string;
  regulatory_impact_evidence_ar: string;
  legal_impact_evidence_ar: string;
  esg: ExtractedEsgConfig;
  acceptance_class: 1 | 2 | 3 | 4;
  acceptance_rationale_ar: string;
  corrective_action_ar: string;
  controls: ExtractedControlDetails[];
}

const LOCATION_NOISE_REGEX =
  /(?:صفحة\s*\d+(?:\s*•\s*مقطع\s*\(\d+\))?|مقطع\s*(?:مستخلص\s*)?(?:رقم\s*)?\(\d+\)|PDF\s*section\s*\d+(?:\s*•\s*مقطع\s*\(\d+\))?|\[(?:PDF\s*page|Vision\s*Page|Slide)\s*\d+\]|\[(?:جدول\s*مستخلص|الجدول\s*#?\d+|تحليل\s*بصري[^\]]*)\])/gi;

const CONTROL_MECHANISM_PREFIX_REGEX =
  /\s*\((?:ضابط\s*رقابي\s*)?(?:وقائي|مانع|مانعة|كاشف|كاشفة|تصحيحي|تصحيحية|preventive|detective|corrective|آلي|شبه\s*آلي|نصف\s*آلي|يدوي|automated|semi[\s-]*automated|semi[\s-]*auto|manual)(?:\s*[-–—/،,]\s*(?:ضابط\s*رقابي\s*)?(?:وقائي|مانع|مانعة|كاشف|كاشفة|تصحيحي|تصحيحية|preventive|detective|corrective|آلي|شبه\s*آلي|نصف\s*آلي|يدوي|automated|semi[\s-]*automated|semi[\s-]*auto|manual))*\)\s*/gi;

/**
 * Strip page/chunk location markers ("صفحة 1 • مقطع (1)", "[Vision Page 1]") and file extensions from operational titles.
 */
export function stripLocationMarkers(raw?: string | null): string {
  if (!raw) return '';
  return raw
    .replace(LOCATION_NOISE_REGEX, '')
    .replace(/^\|[\s\-:|]+\|$/gm, '')
    .replace(/\s*\|\s*/g, ' — ')
    .replace(/\.(?:pdf|docx?|xlsx?|csv|pptx?|txt|json|xml|png|jpe?g|webp|tiff?|bmp)\b/gi, '')
    .replace(/^\s*[-—•:()|]+\s*/, '')
    .replace(/\s*[-—•:()|]+\s*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Remove control mechanism / classification prefixes (e.g., "(ضابط رقابي وقائي - آلي)") from
 * the control description text (Column M), since Columns O & R already store method & type.
 */
export function stripControlMechanismFromDescription(raw?: string | null): string {
  if (!raw) return '';
  return stripLocationMarkers(
    raw
      .replace(CONTROL_MECHANISM_PREFIX_REGEX, ' ')
      .replace(/\s*:\s*:/g, ':')
  )
    .replace(/^\s*[-–—:]+\s*/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Snap any non-incident heuristic estimate strictly to one of the 5 official NBE reference anchor amounts.
 */
export function snapToOfficialReferenceAnchor(amount?: number | null): number {
  const n = Number(amount || 0);
  if (!Number.isFinite(n) || n <= 150000) return OFFICIAL_FINANCIAL_ANCHORS_EGP.L;
  if (n <= 500000) return OFFICIAL_FINANCIAL_ANCHORS_EGP.M;
  if (n <= 1500000) return OFFICIAL_FINANCIAL_ANCHORS_EGP.H;
  if (n <= 3000000) return OFFICIAL_FINANCIAL_ANCHORS_EGP.VH;
  return OFFICIAL_FINANCIAL_ANCHORS_EGP.C;
}

/**
 * Normalize any control frequency string strictly to the 7 official NBE control frequencies.
 */
export function normalizeOfficialControlFrequency(raw?: string | null): string {
  const val = String(raw || '').trim();
  const n = normAr(val);
  if (!n) return 'Daily\nيومياً';
  if (
    n.includes('multiple times') ||
    n.includes('عده مرات') ||
    n.includes('مع كل معامله') ||
    n.includes('مع كل عمليه') ||
    n.includes('مع كل قيد') ||
    n.includes('per transaction') ||
    n.includes('continuous') ||
    n.includes('مستمر') ||
    n.includes('لحظي') ||
    n.includes('فوري')
  ) {
    return 'Multiple times a day\nعدة مرات في اليوم';
  }
  if (
    n.includes('ad-hoc') ||
    n.includes('adhoc') ||
    n.includes('ad hoc') ||
    n.includes('وفقا والحاله') ||
    n.includes('وفقاً والحالة') ||
    n.includes('حسب الحاله') ||
    n.includes('per event') ||
    n.includes('عند كل حاله')
  ) {
    return 'Ad-hoc\nوفقاً والحالة';
  }
  if (n.includes('daily') || n.includes('يومي')) return 'Daily\nيومياً';
  if (n.includes('weekly') || n.includes('اسبوع')) return 'Weekly\nأسبوعياً';
  if (n.includes('monthly') || n.includes('شهر')) return 'Monthly\nشهرياً';
  if (n.includes('quarterly') || n.includes('ربع سنوي')) return 'Quarterly\nربع سنوي';
  if (n.includes('annually') || n.includes('annual') || n.includes('سنوي')) return 'Annually\nسنوي';
  return 'Daily\nيومياً';
}

/**
 * Map any raw strategic objective text strictly to one of the 5 official NBE Strategic Objectives (Methodology Page 8).
 */
export function normalizeOfficialStrategicObjective(raw?: string | null): OfficialNbeStrategicObjective {
  const n = normAr(String(raw || ''));
  if (!n) return OFFICIAL_NBE_STRATEGIC_OBJECTIVES[0];
  if (n.includes('التحول الرقمي') || n.includes('الذكاء الاصطناعي') || n.includes('رقمي') || n.includes('تطبيق')) {
    return 'التحول الرقمي و تفعيل الذكاء الاصطناعي';
  }
  if (n.includes('النمو المربح') || n.includes('المستدام') || n.includes('نمو')) {
    return 'النمو المربح و المستدام';
  }
  if (
    n.includes('الكفاءه') ||
    n.includes('الامان') ||
    n.includes('المرونه') ||
    n.includes('حظر') ||
    n.includes('عقوبات') ||
    n.includes('غسل') ||
    n.includes('احتيال') ||
    n.includes('الاستاذ') ||
    n.includes('مطابقه') ||
    n.includes('قيد') ||
    n.includes('تجميد') ||
    n.includes('امتثال')
  ) {
    return 'الكفاءة و الامان والمرونة';
  }
  if (n.includes('الشمول المالي') || n.includes('شمول')) {
    return 'الشمول المالي';
  }
  return 'التركيز على العملاء و تعظيم الأرباح';
}

/**
 * Normalize Arabic letters lightly for reliable keyword matching.
 */
function normAr(text: string): string {
  return (text || '')
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Detect cover-page titles, generic prefaces, and non-operational header-only chunks
 * so the agent skips them whenever real operational/control chunks exist in the document.
 */
export function isBoilerplateOrCoverChunk(text: string, totalChunksInDoc = 1): boolean {
  if (!text) return true;
  const trimmed = text.trim();
  if (trimmed.length < 20) return true;

  if (totalChunksInDoc <= 2) return false;

  const n = normAr(trimmed);
  if (
    trimmed.length < 95 &&
    !trimmed.includes(':') &&
    !trimmed.includes('•') &&
    n.match(/^(?:دليل\s+اجراءات|دليل\s+العمل|سياسه\s+عامه|مقدمه|فهرس|قائمه\s+المحتويات|الباب\s+الاول|الفصل\s+الاول)/)
  ) {
    return true;
  }

  if (
    n.startsWith('المقدمه والاهداف العامه') ||
    n.startsWith('يهدف هذا الدليل') ||
    n.startsWith('تهدف هذه الوثيقه') ||
    (n.includes('يهدف هذا الدليل') && !n.includes('•') && trimmed.length < 480)
  ) {
    return true;
  }

  return false;
}

/**
 * Format Assessment Rationale (Column AC) strictly aligned with NBE Official Template phrasing.
 */
export function buildNbeAssessmentRationale(params: {
  acceptanceClass: 1 | 2 | 3 | 4;
  frequencyAr: string;
  individualImpactEgp: number;
  residualRating: string;
  nfiOverall: string;
  hasDocumentedIncident?: boolean;
  incidentLossEgp?: number;
  controlNoteAr?: string;
}): string {
  const {
    acceptanceClass,
    frequencyAr,
    individualImpactEgp,
    residualRating,
    nfiOverall,
    hasDocumentedIncident,
    incidentLossEgp,
    controlNoteAr,
  } = params;
  const ratingMap: Record<string, string> = {
    L: 'منخفض (L)',
    M: 'متوسط (M)',
    H: 'كبير (H)',
    VH: 'كبير جداً (VH)',
    C: 'كارثي (C)',
  };
  const resAr = ratingMap[residualRating] || residualRating || 'منخفض (L)';
  const nfiAr = ratingMap[nfiOverall] || nfiOverall || 'متوسط (M)';
  const amtStr = Math.round(individualImpactEgp).toLocaleString('en-US');

  if (hasDocumentedIncident && incidentLossEgp && incidentLossEgp > 0) {
    const incStr = Math.round(incidentLossEgp).toLocaleString('en-US');
    const tail =
      acceptanceClass === 1
        ? 'والمخاطرة مقبولة في ظل كفاءة الضوابط الرقابية المطبقة'
        : 'مع ضرورة تنفيذ الإجراءات التصحيحية المحددة لتعزيز الضوابط الرقابية';
    return `تم التقييم في ضوء التعرض لأحداث مخاطر تشغيل وترتب عليها خسائر مالية قيمتها ${incStr} جم، ووفقاً والاتفاق مع الوحدة تم توقع حدوث المخاطرة (${frequencyAr}) بتأثير مالي متبقي ${resAr} وتأثير غير مالي ${nfiAr} ${tail}.`;
  }

  if (acceptanceClass === 1) {
    return `المخاطرة مقبولة والضوابط الرقابية فعالة، ووفقاً والاتفاق مع الوحدة تم توقع حدوث المخاطرة (${frequencyAr}) في ضوء عدم وجود أحداث خسائر تاريخية مسجلة وبأثر مالي فردي مرجعي ${amtStr} جم، ليصبح الأثر المالي المتبقي ${resAr} والأثر غير المالي ${nfiAr}.`;
  }

  if (acceptanceClass === 2) {
    return `المخاطرة مقبولة والضوابط الرقابية فعالة ولكن يمكن تجويدها مستقبلاً، ووفقاً والاتفاق مع الوحدة تم توقع حدوث المخاطرة (${frequencyAr}) بأثر مالي فردي مرجعي ${amtStr} جم وأثر مالي متبقي ${resAr} وغير مالي ${nfiAr}${controlNoteAr ? ` (${controlNoteAr})` : ''}.`;
  }

  return `المخاطرة غير مقبولة لحاجة بعض الضوابط الرقابية للتطوير، ووفقاً والاتفاق مع الوحدة تم توقع حدوث المخاطرة (${frequencyAr}) بأثر مالي فردي مرجعي ${amtStr} جم وأثر مالي متبقي ${resAr} وغير مالي ${nfiAr}${controlNoteAr ? ` — ${controlNoteAr}` : ''}.`;
}

interface PatternControlSpec {
  controlNameAr: string;
  designClassification: ControlDesignType;
  automationLevel: ControlAutomationType;
  frequencyRaw: string;
  ownerAr: string;
  effectivenessRaw: string;
  actionAr: string;
}

interface BankingRiskPattern {
  id: string;
  match: RegExp;
  isCoreTransfersSopRisk?: boolean;
  processNameAr: string;
  strategicObjectiveAr: OfficialNbeStrategicObjective;
  riskTitleAr: string;
  riskStatementAr: string; // Structured NBE wording: direct event + cause + consequence (never starting loosely with "احتمال")
  inherentFrequencyText: string;
  frequencyMultiplier: number;
  frequencyJustificationAr: string;
  referenceAnchorEgp: number;
  taxonomyL1Id: string;
  taxonomyL2Id: string;
  taxonomyL2Ar: string;
  taxonomyL3Id: string;
  taxonomyL3Ar: string;
  nfiService: 'L' | 'M' | 'H' | 'VH' | 'C' | '-';
  nfiReputation: 'L' | 'M' | 'H' | 'VH' | 'C' | '-';
  nfiRegulatory: 'L' | 'M' | 'H' | 'VH' | 'C' | '-';
  nfiLegal: 'L' | 'M' | 'H' | 'VH' | 'C' | '-';
  serviceEvidenceAr: string;
  reputationEvidenceAr: string;
  regulatoryEvidenceAr: string;
  legalEvidenceAr: string;
  esg: ExtractedEsgConfig;
  acceptanceClass: 1 | 2 | 3 | 4;
  correctiveActionAr: string;
  controls: PatternControlSpec[];
}

function getControlTypeLabelAr(design: ControlDesignType): string {
  if (design === 'DETECTIVE') return 'ضوابط رقابية كاشفة';
  if (design === 'CORRECTIVE') return 'ضوابط رقابية تصحيحية';
  return 'ضوابط رقابية مانعة';
}

function getControlMethodLabelAr(method: ControlAutomationType): string {
  if (method === 'AUTOMATED') return 'آلي';
  if (method === 'SEMI_AUTOMATED') return 'شبه آلي';
  return 'يدوي';
}

const BANKING_RISK_PATTERNS: BankingRiskPattern[] = [
  {
    id: 'OUTGOING_TRANSFERS_EXECUTION',
    match: /تحويلات\s*صادره|حوالات\s*صادره|الرصيد\s*الكافي|core\s*banking|iban|routing|bic|mt103|mt202|pacs\.008|pacs\.009|استيفاء\s*البيانات|ارسال\s*الحوالات|اوامر\s*الدفع/,
    isCoreTransfersSopRisk: true,
    processNameAr: 'تنفيذ وإرسال التحويلات المالية الصادرة (SWIFT / ACH)',
    strategicObjectiveAr: 'التركيز على العملاء و تعظيم الأرباح',
    riskTitleAr: 'أخطاء تنفيذ التحويلات المالية الصادرة (SWIFT / ACH)',
    riskStatementAr:
      'أخطاء تنفيذ التحويلات المالية الصادرة نتيجة إدخال بيانات غير صحيحة للمستفيد (رقم الحساب الدولي IBAN أو كود BIC) أو الخصم دون التحقق من الرصيد الكافي وحالة الحساب، مما يؤدي إلى ارتداد الحوالات وتكبد خسائر مالية وتعويضات للعملاء وتأثر جودة الخدمة.',
    inherentFrequencyText: 'مرة واحدة كل ربع سنة',
    frequencyMultiplier: 4,
    frequencyJustificationAr:
      'تقدير تكرار ربع سنوي استناداً لارتفاع حجم المعاملات اليومية للتحويلات الصادرة وتعدد نقاط الإدخال والمراجعة.',
    referenceAnchorEgp: OFFICIAL_FINANCIAL_ANCHORS_EGP.M, // 151,000 × 4 = 604,000 (H) -> Key Risk = YES
    taxonomyL1Id: 'L1-08',
    taxonomyL2Id: 'L2-08-01',
    taxonomyL2Ar: 'تسجيل المعاملات وتنفيذها وصيانتها',
    taxonomyL3Id: 'L3-08-01-02',
    taxonomyL3Ar: 'أخطاء إدخال البيانات أو تحميلها',
    nfiService: 'M',
    nfiReputation: 'M',
    nfiRegulatory: 'L',
    nfiLegal: '-',
    serviceEvidenceAr: 'تأخر وصول التحويلات الصادرة للعملاء أو ارتدادها عند وجود خطأ في بيانات المستفيد.',
    reputationEvidenceAr: 'تأثر محدود على رضا العملاء لحالات فردية عند ارتداد أو تأخر التحويل الصادر.',
    regulatoryEvidenceAr: 'ملاحظات رقابية منخفضة حال تكرار الأخطاء التشغيلية في أوامر الدفع.',
    legalEvidenceAr: 'لا يوجد تعرض لإجراءات قضائية (مغطى بنماذج وشروط أوامر التحويل المعتمدة).',
    esg: {
      status: 'ASSESSED',
      pillars: ['G'],
      catalogue_ids: [32],
      evidence: {
        G: 'الالتزام بضوابط حوكمة تنفيذ التحويلات والرقابة الداخلية لتجنب الملاحظات الرقابية (مرجع CBE #32).',
      },
      pillar_label_ar: 'G (حوكمة العمليات المصرفية والرقابة الداخلية)',
      pathway_ar: '[32] ضعف حوكمة العمليات والرقابة والتقارير الرقابية (L1-08)',
    },
    acceptanceClass: 1,
    correctiveActionAr: '',
    controls: [
      {
        controlNameAr: 'التحقق الآلي بالنظام المصرفي الأساسي من صحة IBAN/BIC وكفاية الرصيد',
        designClassification: 'PREVENTIVE',
        automationLevel: 'AUTOMATED',
        frequencyRaw: 'Multiple times a day\nعدة مرات في اليوم',
        ownerAr: 'النظام المصرفي الأساسي',
        effectivenessRaw: 'ضابط رقابي فعال',
        actionAr:
          'فحص النظام آلياً لصحة صيغة رقم الحساب الدولي (IBAN) وكود البنك (BIC/Routing) وكفاية الرصيد وعدم وجود حظر أو تجميد على الحساب قبل تمرير أمر الدفع.',
      },
      {
        controlNameAr: 'المراجعة والاعتماد متعدد المستويات لأوامر التحويل (Maker-Checker-Approver)',
        designClassification: 'PREVENTIVE',
        automationLevel: 'SEMI_AUTOMATED',
        frequencyRaw: 'Multiple times a day\nعدة مرات في اليوم',
        ownerAr: 'السلطة الإشرافية',
        effectivenessRaw: 'ضابط رقابي فعال',
        actionAr:
          'مطابقة المراجع والمعتمد لبيانات أمر الدفع والمبلغ والعملة والغرض التجاري مع طلب العميل والمستندات المؤيدة قبل التعزيز والإرسال على شبكة SWIFT/ACH.',
      },
      {
        controlNameAr: 'مراجعة تقرير نهاية اليوم لإجمالي التحويلات الصادرة والمرتدة',
        designClassification: 'DETECTIVE',
        automationLevel: 'SEMI_AUTOMATED',
        frequencyRaw: 'Daily\nيومياً',
        ownerAr: 'مدير عمليات التحويلات',
        effectivenessRaw: 'ضابط رقابي فعال',
        actionAr:
          'استخراج ومراجعة تقرير نهاية اليوم (EOD) لإجمالي التحويلات الصادرة والتأكد من تطابق الإشعارات المرسلة مع القيود المنفذة ومعالجة أي رسائل مرتدة فوراً.',
      },
    ],
  },
  {
    id: 'INCOMING_TRANSFERS_EXECUTION',
    match: /تحويلات\s*وارده|حوالات\s*وارده|اشعار\s*التغطيه|credit\s*advice|اضافه\s*للحساب|المقاصه\s*الاليه|بنوك\s*مصر|ebc|batches|جلسات\s*التسويه|ach\s*return|مرتجعات/,
    isCoreTransfersSopRisk: true,
    processNameAr: 'استقبال وتنفيذ التحويلات الواردة ومعالجة المرتجعات (Nostro / ACH)',
    strategicObjectiveAr: 'التركيز على العملاء و تعظيم الأرباح',
    riskTitleAr: 'أخطاء تنفيذ التحويلات الواردة أو إضافة مبالغ دون تحقق من التغطية المالية',
    riskStatementAr:
      'أخطاء تنفيذ التحويلات الواردة وإضافتها لحسابات غير مطابقة أو قبل التحقق من ورود إشعار التغطية المالية (Nostro Credit Advice) أو التأخر في رد الحوالات غير المطابقة (ACH Returns)، مما يؤدي إلى صرف مبالغ بالخطأ وتكبد خسائر مالية وغرامات تسوية وتأخر مستحقات العملاء.',
    inherentFrequencyText: 'مرة واحدة كل نصف سنة',
    frequencyMultiplier: 2,
    frequencyJustificationAr:
      'تقدير تكرار نصف سنوي استناداً إلى أتمتة جزء كبير من إضافة الحوالات الواردة عبر STP مع بقاء احتمالية حالات الاستثناء وعدم التطابق.',
    referenceAnchorEgp: OFFICIAL_FINANCIAL_ANCHORS_EGP.M, // 151,000 × 2 = 302,000 (M) + NFI max M -> Key Risk = NO!
    taxonomyL1Id: 'L1-08',
    taxonomyL2Id: 'L2-08-01',
    taxonomyL2Ar: 'تسجيل المعاملات وتنفيذها وصيانتها',
    taxonomyL3Id: 'L3-08-01-02',
    taxonomyL3Ar: 'أخطاء إدخال البيانات أو تحميلها',
    nfiService: 'M',
    nfiReputation: 'M',
    nfiRegulatory: 'L',
    nfiLegal: 'L',
    serviceEvidenceAr: 'تأخر إضافة قيمة الحوالة الواردة لحساب المستفيد عند وجود عدم تطابق في البيانات.',
    reputationEvidenceAr: 'شكاوى محدودة من العملاء نتيجة تأخر الإضافة أو رد الحوالة الواردة.',
    regulatoryEvidenceAr: 'ملاحظات منخفضة مرتبطة بالالتزام بمواعيد جلسات المقاصة والردود (Cut-off Times).',
    legalEvidenceAr: 'تغطية قانونية عبر قواعد المقاصة الآلية واتفاقيات المراسلين.',
    esg: {
      status: 'ASSESSED',
      pillars: ['G'],
      catalogue_ids: [32],
      evidence: {
        G: 'الالتزام بضوابط حوكمة إضافة الحوالات الواردة وتسويات المقاصة الآلية والرقابة الداخلية (مرجع CBE #32).',
      },
      pillar_label_ar: 'G (حوكمة العمليات المصرفية والرقابة الداخلية)',
      pathway_ar: '[32] ضعف حوكمة العمليات والرقابة والتقارير الرقابية (L1-08)',
    },
    acceptanceClass: 1,
    correctiveActionAr: '',
    controls: [
      {
        controlNameAr: 'المطابقة الآلية لبيانات المستفيد ورقم الحساب (IBAN/Account Match)',
        designClassification: 'PREVENTIVE',
        automationLevel: 'AUTOMATED',
        frequencyRaw: 'Multiple times a day\nعدة مرات في اليوم',
        ownerAr: 'النظام المصرفي الأساسي',
        effectivenessRaw: 'ضابط رقابي فعال',
        actionAr:
          'تحقق النظام آلياً من تطابق رقم الحساب الدولي (IBAN) واسم المستفيد وحالة الحساب قبل تنفيذ الإضافة الآلية وتوجيه الحالات غير المطابقة لقائمة الانتظار (Repair Queue).',
      },
      {
        controlNameAr: 'التحقق من ورود التغطية المالية بحساب البنك المراسل قبل الإضافة',
        designClassification: 'PREVENTIVE',
        automationLevel: 'SEMI_AUTOMATED',
        frequencyRaw: 'Multiple times a day\nعدة مرات في اليوم',
        ownerAr: 'السلطة الإشرافية',
        effectivenessRaw: 'ضابط رقابي فعال',
        actionAr:
          'التأكد من ورود إشعار التغطية المالية (Nostro Credit Advice / MT202) ومطابقة المبلغ والعملة قبل إتاحة الرصيد لحساب المستفيد.',
      },
      {
        controlNameAr: 'مراجعة تقرير ملفات المقاصة الآلية (EBC) ومعالجة المرتجعات ضمن المهلة',
        designClassification: 'DETECTIVE',
        automationLevel: 'SEMI_AUTOMATED',
        frequencyRaw: 'Daily\nيومياً',
        ownerAr: 'مسؤول تسوية المقاصة',
        effectivenessRaw: 'ضابط رقابي فعال',
        actionAr:
          'مطابقة إشعارات القبول والرفض الصادرة من شركة بنوك مصر (EBC) لكل جلسة تسوية ورد الحوالات غير المطابقة (ACH Returns) قبل انتهاء التوقيت الرقابي المحدد.',
      },
    ],
  },
  {
    id: 'OMITTED_EXECUTION_INQUIRY_SLA',
    match: /اغفال\s*تنفيذ|mt199|mt299|mt195|mt196|mt192|الرد\s*علي|استفسار|24\s*ساعه|sla|ارشفه|طلبات\s*العملاء/,
    isCoreTransfersSopRisk: true,
    processNameAr: 'متابعة تنفيذ الطلبات وإدارة رسائل الاستفسار البنكية (MT199 / MT299)',
    strategicObjectiveAr: 'التركيز على العملاء و تعظيم الأرباح',
    riskTitleAr: 'إغفال تنفيذ طلبات التحويلات أو التأخر في الرد على رسائل الاستفسار البنكية',
    riskStatementAr:
      'إغفال تنفيذ طلبات تحويلات العملاء أو التأخر في الرد على رسائل الاستفسار البنكية (MT199/MT299) عن مهلة 24 ساعة عمل نتيجة تراكم قوائم الانتظار أو تأخر استيفاء المستندات من الفروع، مما يؤدي إلى تجميد أموال العملاء لدى البنوك المراسلة وتصاعد الشكاوى ومخالفات اتفاقيات مستوى الخدمة (SLA) وتحمل تعويضات فوائد تأخير.',
    inherentFrequencyText: 'مرة واحدة كل ربع سنة',
    frequencyMultiplier: 4,
    frequencyJustificationAr:
      'تقدير تكرار ربع سنوي نظراً لتعدد قنوات استلام الطلبات والاستفسارات بين الفروع والبنوك المراسلة والاعتماد الجزئي على المتابعة اليدوية.',
    referenceAnchorEgp: OFFICIAL_FINANCIAL_ANCHORS_EGP.M, // 151,000 × 4 = 604,000 (H) -> Residual 120,800 (L)
    taxonomyL1Id: 'L1-08',
    taxonomyL2Id: 'L2-08-01',
    taxonomyL2Ar: 'تسجيل المعاملات وتنفيذها وصيانتها',
    taxonomyL3Id: 'L3-08-01-03',
    taxonomyL3Ar: 'عدم الالتزام بالمواعيد النهائية أو المسؤوليات المحددة',
    nfiService: 'M',
    nfiReputation: 'M',
    nfiRegulatory: 'M',
    nfiLegal: 'L',
    serviceEvidenceAr: 'تأثير ملحوظ لانقطاع أو تأخر الرد على رسائل الاستفسار ضمن مهلة 24 ساعة مع عدم وجود تأثير كبير على الأطراف المعنية.',
    reputationEvidenceAr: 'تصاعد محدود لشكاوى الفروع عند تأخر تنفيذ التحويلات أو الرد على الاستفسارات.',
    regulatoryEvidenceAr: 'ملاحظات رقابية متوسطة مع توفر فترة تصحيح لمعالجة اتفاقيات مستوى الخدمة (SLA).',
    legalEvidenceAr: 'مطالبات محدودة بفوائد تأخير عند تجاوز مدد التنفيذ المتفق عليها.',
    esg: {
      status: 'ASSESSED',
      pillars: ['G'],
      catalogue_ids: [32],
      evidence: {
        G: 'حوكمة متابعة طلبات العملاء والاستفسارات البنكية والالتزام بمواعيد الخدمة والرقابة الداخلية (مرجع CBE #32).',
      },
      pillar_label_ar: 'G (حوكمة العمليات المصرفية والرقابة الداخلية)',
      pathway_ar: '[32] ضعف حوكمة العمليات والرقابة والتقارير الرقابية (L1-08)',
    },
    acceptanceClass: 2,
    correctiveActionAr:
      'تجويد آلية التصعيد الآلي بنظام التذاكر قبل انتهاء مهلة الرد المقررة (24 ساعة) لرسائل MT199/MT299 لتحسين جودة الخدمة.',
    controls: [
      {
        controlNameAr: 'تتبع رسائل الاستفسار وطلبات التحويل عبر نظام التذاكر الآلي ومؤشر SLA',
        designClassification: 'DETECTIVE',
        automationLevel: 'SEMI_AUTOMATED',
        frequencyRaw: 'Daily\nيومياً',
        ownerAr: 'مسؤول وحدة الاستفسارات',
        effectivenessRaw: 'ضابط رقابي فعال',
        actionAr:
          'تسجيل جميع رسائل الاستفسار البنكية (MT199/MT299) وطلبات الفروع على نظام التذاكر الآلي ومتابعة مؤشر مهلة الرد المحددة بـ 24 ساعة عمل مع الأرشفة الإلكترونية.',
      },
      {
        controlNameAr: 'المراجعة الإشرافية لقائمة الطلبات المعلقة قبل إقفال يوم العمل',
        designClassification: 'PREVENTIVE',
        automationLevel: 'MANUAL',
        frequencyRaw: 'Daily\nيومياً',
        ownerAr: 'السلطة الإشرافية',
        effectivenessRaw: 'ضابط رقابي فعال ولكن يحتاج إلى تطوير (تجويد مستقبلي لمؤشرات SLA)',
        actionAr:
          'حصر ومراجعة قائمة الطلبات ورسائل الاستفسار المعلقة بنهاية كل يوم عمل للتأكد من عدم إغفال أي طلب وتصعيد المعاملات المتأخرة للفروع المعنية.',
      },
      {
        controlNameAr: 'إجراءات تصعيد ومعالجة الطلبات المتأخرة وإرسال الردود التصحيحية',
        designClassification: 'CORRECTIVE',
        automationLevel: 'MANUAL',
        frequencyRaw: 'Ad-hoc\nوفقاً والحالة',
        ownerAr: 'مدير عمليات التحويلات',
        effectivenessRaw: 'ضابط رقابي فعال',
        actionAr:
          'تصعيد المعاملات التي تجاوزت المهلة القياسية وإرسال رسائل سويفت تصحيحية/إلغاء (MT192/MT196) لاسترداد أو تحرير الأموال المعلقة لدى المراسلين.',
      },
    ],
  },
  {
    id: 'GL_NOSTRO_RECONCILIATION',
    match: /نوسترو|nostro|mt950|mt940|الاستاذ\s*العام|حسابات\s*وسيطه|transit|suspense|فروقات|معلقه|مطابقه\s*يوميه|ضبط\s*حساب/,
    isCoreTransfersSopRisk: true,
    processNameAr: 'ضبط وتسوية حسابات الأستاذ العام (GL) وحسابات النوسترو والحسابات الوسيطة',
    strategicObjectiveAr: 'الكفاءة و الامان والمرونة',
    riskTitleAr: 'أخطاء ضبط وتسوية أرصدة حسابات الأستاذ العام (GL) وحسابات النوسترو والحسابات الوسيطة',
    riskStatementAr:
      'أخطاء ضبط وتسوية أرصدة حسابات الأستاذ العام وحسابات البنوك المراسلة (Nostro) وبقاء بنود معلقة بالحسابات الوسيطة لأكثر من 24-48 ساعة نتيجة تأخر المطابقة اليومية لكشوف (MT950/MT940) أو عدم معالجة الفروقات، مما يؤدي إلى تشوه المراكز المالية وتراكم فروقات محاسبية غير مكتشفة واحتمال السحب على المكشوف وتكبد فوائد وغرامات وملاحظات تفتيشية.',
    inherentFrequencyText: 'مرة واحدة كل ربع سنة',
    frequencyMultiplier: 4,
    frequencyJustificationAr:
      'تقدير تكرار ربع سنوي نظراً للحجم اليومي المرتفع لحركات النوسترو والحسابات الوسيطة وتعدد العملات والمراسلين.',
    referenceAnchorEgp: OFFICIAL_FINANCIAL_ANCHORS_EGP.M, // 151,000 × 4 = 604,000 (H) -> Key Risk = YES
    taxonomyL1Id: 'L1-08',
    taxonomyL2Id: 'L2-08-01',
    taxonomyL2Ar: 'تسجيل المعاملات وتنفيذها وصيانتها',
    taxonomyL3Id: 'L3-08-01-05',
    taxonomyL3Ar: 'أخطاء محاسبية',
    nfiService: 'L',
    nfiReputation: 'L',
    nfiRegulatory: 'H',
    nfiLegal: 'L',
    serviceEvidenceAr: 'تأثير غير مباشر محدود على الخدمة المصرفية في حال تسوية الفروقات داخلياً.',
    reputationEvidenceAr: 'تأثير محدود على السمعة ما لم تتأثر أرصدة العملاء.',
    regulatoryEvidenceAr: 'ملاحظات جوهرية من التفتيش الداخلي والبنك المركزي حال تقادم البنود المعلقة في حسابات الأستاذ العام والنوسترو.',
    legalEvidenceAr: 'مخاطر قانونية منخفضة مرتبطة بتسويات المراسلين.',
    esg: {
      status: 'ASSESSED',
      pillars: ['G'],
      catalogue_ids: [32],
      evidence: {
        G: 'حوكمة التقارير المحاسبية والرقابية وضبط حسابات الأستاذ العام لتفادي الجزاءات والملاحظات الرقابية (مرجع CBE #32).',
      },
      pillar_label_ar: 'G (حوكمة العمليات المصرفية والرقابة الداخلية)',
      pathway_ar: '[32] ضعف حوكمة العمليات والرقابة والتقارير الرقابية (L1-08)',
    },
    acceptanceClass: 1,
    correctiveActionAr: '',
    controls: [
      {
        controlNameAr: 'المطابقة الآلية اليومية لكشوف النوسترو (MT950/MT940) مع دفاتر الأستاذ العام',
        designClassification: 'DETECTIVE',
        automationLevel: 'SEMI_AUTOMATED',
        frequencyRaw: 'Daily\nيومياً',
        ownerAr: 'وحدة المطابقات والتسويات',
        effectivenessRaw: 'ضابط رقابي فعال',
        actionAr:
          'تحميل ومطابقة كشوف حسابات البنوك المراسلة (MT950/MT940) يومياً عبر نظام المطابقة الآلي مع أرصدة الأستاذ العام وحصر الفروقات والبنود المفتوحة فورياً.',
      },
      {
        controlNameAr: 'مراجعة واعتماد تقرير أعمار البنود المعلقة بالحسابات الوسيطة (24-48 ساعة)',
        designClassification: 'DETECTIVE',
        automationLevel: 'MANUAL',
        frequencyRaw: 'Daily\nيومياً',
        ownerAr: 'السلطة الإشرافية',
        effectivenessRaw: 'ضابط رقابي فعال',
        actionAr:
          'فحص تقرير أعمار البنود المعلقة (Aging Report) بالحسابات الوسيطة (Transit/Suspense) يومياً وإلزام تصفيتها خلال 24 إلى 48 ساعة مع اعتماد السلطة الإشرافية.',
      },
      {
        controlNameAr: 'منع الترحيل غير المتوازن على حسابات الأستاذ العام',
        designClassification: 'PREVENTIVE',
        automationLevel: 'AUTOMATED',
        frequencyRaw: 'Multiple times a day\nعدة مرات في اليوم',
        ownerAr: 'النظام المصرفي الأساسي',
        effectivenessRaw: 'ضابط رقابي فعال',
        actionAr:
          'التحقق الآلي من توازن الجانب المدين والدائن وربط الحسابات التفصيلية بحسابات الأستاذ العام قبل السماح بترحيل قيود التسوية.',
      },
    ],
  },
  {
    id: 'SANCTION_AML_SCREENING',
    match: /قوائم\s*الحظر|العقوبات|غسل\s*الاموال|sanction|ofac|aml|kyc|التمويل\s*المشبوه|اشتباه|اطراف\s*محظور/,
    isCoreTransfersSopRisk: true,
    processNameAr: 'فحص قوائم الحظر والعقوبات ومكافحة غسل الأموال (Sanction & AML Screening)',
    strategicObjectiveAr: 'الكفاءة و الامان والمرونة',
    riskTitleAr: 'التعامل مع أطراف محظورة أو مخالفة قوائم العقوبات ومكافحة غسل الأموال',
    riskStatementAr:
      'تمرير تحويلات أو معاملات لأطراف مدرجة بقوائم الحظر والعقوبات (OFAC / UN / EU / البنك المركزي) أو شبهات غسل الأموال نتيجة قصور الفحص الآلي أو عدم تحديث القوائم أو إغفال التحقق من المعاملات غير الاعتيادية، مما يؤدي إلى فرض غرامات وعقوبات رقابية جسيمة وملاحقات قانونية وتضرر بالغ بسمعة البنك.',
    inherentFrequencyText: 'مرة واحدة كل نصف سنة',
    frequencyMultiplier: 2,
    frequencyJustificationAr:
      'تقدير تكرار نصف سنوي استناداً لطبيعة التحويلات الدولية وتحديثات قوائم العقوبات المستمرة والحساسية الرقابية القصوى.',
    referenceAnchorEgp: OFFICIAL_FINANCIAL_ANCHORS_EGP.H, // 501,000 × 2 = 1,002,000 (H) -> Key Risk = YES
    taxonomyL1Id: 'L1-05',
    taxonomyL2Id: 'L2-05-02',
    taxonomyL2Ar: 'ممارسات الأعمال غير السليمة',
    taxonomyL3Id: 'L3-05-02-04',
    taxonomyL3Ar: 'أنشطة غير مرخصة أو غسل الأموال',
    nfiService: 'L',
    nfiReputation: 'VH',
    nfiRegulatory: 'VH',
    nfiLegal: 'H',
    serviceEvidenceAr: 'تأثر محدود على سرعة الخدمة للحالات المشتبه بها فقط أثناء الفحص.',
    reputationEvidenceAr: 'إساءة بالغة وطويلة الأجل لسمعة البنك محلياً ودولياً حال ثبوت مخالفة قوائم العقوبات.',
    regulatoryEvidenceAr: 'جزاءات وغرامات رقابية جسيمة من البنك المركزي المصري والجهات الدولية عند مخالفة العقوبات.',
    legalEvidenceAr: 'مسؤولية قانونية ودعاوى دولية ومحلية محتملة حال تمرير أموال محظورة.',
    esg: {
      status: 'ASSESSED',
      pillars: ['G'],
      catalogue_ids: [30],
      evidence: {
        G: 'مخالفة العقوبات الدولية والمحلية وضوابط مكافحة غسل الأموال تندرج مباشرة تحت بند الحوكمة #30 بكتالوج البنك المركزي المصري.',
      },
      pillar_label_ar: 'G (حوكمة العمليات المصرفية والرقابة الداخلية)',
      pathway_ar: '[30] تسهيل التهرب الضريبي للعملاء أو مخالفة العقوبات (L1-05)',
    },
    acceptanceClass: 1,
    correctiveActionAr: '',
    controls: [
      {
        controlNameAr: 'محرك الفحص الآلي الفوري لقوائم الحظر والعقوبات (Sanction Screening Engine)',
        designClassification: 'PREVENTIVE',
        automationLevel: 'AUTOMATED',
        frequencyRaw: 'Multiple times a day\nعدة مرات في اليوم',
        ownerAr: 'نظام الفحص الآلي لقوائم الحظر',
        effectivenessRaw: 'ضابط رقابي فعال',
        actionAr:
          'تمرير جميع أطراف التحويل الصادر والوارد (الآمر، المستفيد، البنوك الوسيطة) آلياً ضد قوائم العقوبات المحدثة (OFAC, UN, EU, البنك المركزي) وتعليق أي تطابق فوري قبل التنفيذ.',
      },
      {
        controlNameAr: 'نظام الرقابة السلوكية ورصد المعاملات المشتبه بها (AML Monitoring)',
        designClassification: 'DETECTIVE',
        automationLevel: 'SEMI_AUTOMATED',
        frequencyRaw: 'Daily\nيومياً',
        ownerAr: 'قطاع الامتثال ومكافحة غسل الأموال',
        effectivenessRaw: 'ضابط رقابي فعال',
        actionAr:
          'مراجعة التنبيهات اليومية الناتجة عن سيناريوهات رصد المعاملات غير الاعتيادية ومطابقتها مع ملف العميل (KYC) وتصعيد حالات الاشتباه.',
      },
      {
        controlNameAr: 'مراجعة واعتماد حالات التطابق الإيجابي المعلق بواسطة قطاع الامتثال',
        designClassification: 'PREVENTIVE',
        automationLevel: 'MANUAL',
        frequencyRaw: 'Ad-hoc\nوفقاً والحالة',
        ownerAr: 'قطاع الامتثال',
        effectivenessRaw: 'ضابط رقابي فعال',
        actionAr:
          'فحص الحوالات الموقوفة نتيجة تشابه الأسماء وعدم السماح بإطلاقها إلا بعد التحقق المستندي وإصدار موافقة موثقة من قطاع الامتثال.',
      },
    ],
  },
  {
    id: 'EXTERNAL_FRAUD_FORGERY_CALLBACK',
    match: /احتيال|تزوير|callback|التحويلات\s*الكبيره|فحص\s*مزدوج|fraud|maker|checker|approver|المراجعه\s*الثنائيه|حدود\s*الصلاحيات/,
    isCoreTransfersSopRisk: true,
    processNameAr: 'التحقق من الحوالات الكبيرة والصلاحيات ومكافحة الاحتيال (Callback & Fraud Control)',
    strategicObjectiveAr: 'الكفاءة و الامان والمرونة',
    riskTitleAr: 'احتيال خارجي عبر أوامر تحويل مزورة أو تجاوز حدود الصلاحيات المعتمدة',
    riskStatementAr:
      'تنفيذ أوامر تحويل مزورة أو احتيالية عالية القيمة أو تمرير معاملات بتجاوز حدود الصلاحيات نتيجة قصور مطابقة التوقيعات أو عدم إجراء الاتصال التأكيدي بالعميل (Callback Verification)، مما يؤدي إلى تكبد خسائر مالية مباشرة ومطالبات تعويض من العملاء ومخاطر قانونية وسمعية.',
    inherentFrequencyText: 'مرة واحدة كل سنة',
    frequencyMultiplier: 1,
    frequencyJustificationAr:
      'تقدير تكرار سنوي استناداً لمخاطر محاولات الاحتيال الخارجي المتكررة في القطاع المصرفي على أوامر الدفع مرتفعة القيمة.',
    referenceAnchorEgp: OFFICIAL_FINANCIAL_ANCHORS_EGP.H, // 501,000 × 1 = 501,000 (H) -> Key Risk = YES
    taxonomyL1Id: 'L1-02',
    taxonomyL2Id: 'L2-02-01',
    taxonomyL2Ar: 'السرقة والاحتيال',
    taxonomyL3Id: 'L3-02-01-02',
    taxonomyL3Ar: 'التزوير',
    nfiService: 'L',
    nfiReputation: 'H',
    nfiRegulatory: 'M',
    nfiLegal: 'H',
    serviceEvidenceAr: 'أثر محدود على استمرارية الخدمة للعملاء الآخرين.',
    reputationEvidenceAr: 'تأثر ملحوظ لسمعة البنك وثقة العملاء حال تعرض حسابات العملاء لعمليات تحويل احتيالية.',
    regulatoryEvidenceAr: 'ملاحظات رقابية بشأن كفاءة ضوابط مكافحة الاحتيال وحماية أموال المودعين.',
    legalEvidenceAr: 'دعاوى ونزاعات قضائية محتملة مع العملاء المتضررين للمطالبة بالتعويض.',
    esg: {
      status: 'ASSESSED',
      pillars: ['G'],
      catalogue_ids: [33],
      evidence: {
        G: 'حماية قنوات الدفع الإلكتروني ومنع اختراق أو تزوير أوامر التحويل يرتبط بأمن النظام وحوكمة مكافحة الاحتيال الخارجي (مرجع CBE #33).',
      },
      pillar_label_ar: 'G (حوكمة العمليات المصرفية والرقابة الداخلية)',
      pathway_ar: '[33] أمن النظام ومنع الاحتيال والاختراق الخارجي (L1-02)',
    },
    acceptanceClass: 1,
    correctiveActionAr: '',
    controls: [
      {
        controlNameAr: 'مصفوفة الفصل بين المهام والاعتماد المتدرج (Maker-Checker-Approver)',
        designClassification: 'PREVENTIVE',
        automationLevel: 'SEMI_AUTOMATED',
        frequencyRaw: 'Multiple times a day\nعدة مرات في اليوم',
        ownerAr: 'السلطة الإشرافية',
        effectivenessRaw: 'ضابط رقابي فعال',
        actionAr:
          'إلزام النظام بالفصل التام بين مدخل البيانات والمراجع والمعتمد وتطبيق حدود الصلاحيات المالية المعتمدة قبل تحرير أي رسالة دفع.',
      },
      {
        controlNameAr: 'مطابقة توقيعات وتفويضات العميل إلكترونياً على النظام',
        designClassification: 'PREVENTIVE',
        automationLevel: 'SEMI_AUTOMATED',
        frequencyRaw: 'Multiple times a day\nعدة مرات في اليوم',
        ownerAr: 'مسؤول التحقق والمراجعة',
        effectivenessRaw: 'ضابط رقابي فعال',
        actionAr:
          'مضاهاة توقيعات وأختام المفوضين الواردة بطلب التحويل مع نماذج التوقيعات والسجلات التجارية المحفوظة على النظام قبل التنفيذ.',
      },
      {
        controlNameAr: 'الاتصال التأكيدي المسجل بالعميل للتحويلات مرتفعة القيمة (Callback Verification)',
        designClassification: 'PREVENTIVE',
        automationLevel: 'MANUAL',
        frequencyRaw: 'Ad-hoc\nوفقاً والحالة',
        ownerAr: 'السلطة الإشرافية',
        effectivenessRaw: 'ضابط رقابي فعال',
        actionAr:
          'إجراء اتصال هاتفي مسجل على أرقام الهواتف المسجلة بملف العميل للتحقق من صحة أوامر التحويل التي تتجاوز الحد المقرر وتوثيق بيانات المكالمة.',
      },
    ],
  },
  {
    id: 'DOUBLE_ENTRY_ACCOUNTING',
    match: /القيد\s*المزدوج|double\s*entry|التوازن\s*المحاسبي|مراكز\s*الكلفه|المدين\s*والدائن|القيود\s*المحاسبيه/,
    isCoreTransfersSopRisk: true,
    processNameAr: 'إعداد وتسجيل واعتماد القيود المحاسبية للعمليات',
    strategicObjectiveAr: 'الكفاءة و الامان والمرونة',
    riskTitleAr: 'أخطاء إعداد وتسجيل القيود المحاسبية أو التوجيه الخاطئ لمراكز الكلفة',
    riskStatementAr:
      'أخطاء إعداد وتسجيل القيود المحاسبية للعمليات أو توجيهها لحسابات تفصيلية ومراكز كلفة غير صحيحة نتيجة خطأ الإدخال اليدوي أو عدم مراجعة المستندات المؤيدة، مما يؤدي إلى أخطاء في القوائم المالية والعمولات وملاحظات مراجعة داخلية ورقابية.',
    inherentFrequencyText: 'مرة واحدة كل سنة',
    frequencyMultiplier: 1,
    frequencyJustificationAr:
      'تقدير تكرار سنوي نظراً لتقييد الترحيل الآلي بقواعد التوازن المحاسبي وندرة القيود اليدوية الاستثنائية.',
    referenceAnchorEgp: OFFICIAL_FINANCIAL_ANCHORS_EGP.L, // 50,000 × 1 = 50,000 (L) + NFI max M -> Key Risk = NO!
    taxonomyL1Id: 'L1-08',
    taxonomyL2Id: 'L2-08-01',
    taxonomyL2Ar: 'تسجيل المعاملات وتنفيذها وصيانتها',
    taxonomyL3Id: 'L3-08-01-05',
    taxonomyL3Ar: 'أخطاء محاسبية',
    nfiService: 'L',
    nfiReputation: 'L',
    nfiRegulatory: 'M',
    nfiLegal: 'L',
    serviceEvidenceAr: 'لا يترتب على القيد الداخلي توقف مباشر للخدمة المقدمة للعميل.',
    reputationEvidenceAr: 'أثر منخفض على السمعة لاقتصار الخطأ على التوجيه المحاسبي الداخلي.',
    regulatoryEvidenceAr: 'ملاحظات مراجعة ورقابية متوسطة حال عدم دقة تصنيف الحسابات أو العمولات.',
    legalEvidenceAr: 'أثر قانوني منخفض دون نزاعات مع أطراف خارجية.',
    esg: {
      status: 'ASSESSED',
      pillars: ['G'],
      catalogue_ids: [32],
      evidence: {
        G: 'سلامة التوجيه والقيود المحاسبية تعزز دقة الإفصاحات والتقارير الرقابية (مرجع CBE #32).',
      },
      pillar_label_ar: 'G (حوكمة العمليات المصرفية والرقابة الداخلية)',
      pathway_ar: '[32] ضعف حوكمة العمليات والرقابة والتقارير الرقابية (L1-08)',
    },
    acceptanceClass: 1,
    correctiveActionAr: '',
    controls: [
      {
        controlNameAr: 'قاعدة توازن القيد المزدوج الآلية بالنظام (Double-Entry Validation)',
        designClassification: 'PREVENTIVE',
        automationLevel: 'AUTOMATED',
        frequencyRaw: 'Multiple times a day\nعدة مرات في اليوم',
        ownerAr: 'النظام المصرفي الأساسي',
        effectivenessRaw: 'ضابط رقابي فعال',
        actionAr:
          'منع النظام آلياً لترحيل أي قيد محاسبي في حال عدم تساوي إجمالي الطرف المدين مع إجمالي الطرف الدائن أو غياب رمز مركز الكلفة الإلزامي.',
      },
      {
        controlNameAr: 'المراجعة المستندية والاعتماد الإشرافي للقيود المحاسبية قبل الترحيل',
        designClassification: 'PREVENTIVE',
        automationLevel: 'SEMI_AUTOMATED',
        frequencyRaw: 'Daily\nيومياً',
        ownerAr: 'السلطة الإشرافية',
        effectivenessRaw: 'ضابط رقابي فعال',
        actionAr:
          'إرفاق المستند المؤيد لكل قيد محاسبي ومراجعة أرقام الحسابات التفصيلية والعمولات واعتماد القيد من مراجع مستقل قبل الترحيل النهائي.',
      },
    ],
  },
  {
    id: 'FREEZE_RELEASE_COMPLIANCE',
    match: /تجميد|فك\s*تجميد|freeze|release|امتثال|قضائي|حجز|حساب\s*معلق/,
    isCoreTransfersSopRisk: true,
    processNameAr: 'إجراءات تجميد وفك تجميد الحوالات والأموال الخاضعة للامتثال',
    strategicObjectiveAr: 'الكفاءة و الامان والمرونة',
    riskTitleAr: 'فك تجميد أو تحرير أموال محجوزة دون موافقة قطاع الامتثال أو سند قانوني',
    riskStatementAr:
      'فك تجميد أو تحرير حوالات أو أرصدة محجوزة دون استيفاء إذن كتابي معتمد من قطاع الامتثال أو قرار قضائي/رقابي موثق على النظام، مما يؤدي إلى مخالفة جسيمة لتعليمات البنك المركزي والجهات القضائية وتحمل مسؤولية قانونية وغرامات مالية مباشرة.',
    inherentFrequencyText: 'مرة كل سنتان',
    frequencyMultiplier: 0.5,
    frequencyJustificationAr:
      'تقدير تكرار مرة كل سنتين نظراً لندرة حالات التجميد والفك وتقيدها بقفل نظامي صارم وموافقات استثنائية.',
    referenceAnchorEgp: OFFICIAL_FINANCIAL_ANCHORS_EGP.H, // 501,000 × 0.5 = 250,500 (M), NFI regulatory H -> Key Risk = YES
    taxonomyL1Id: 'L1-05',
    taxonomyL2Id: 'L2-05-02',
    taxonomyL2Ar: 'ممارسات الأعمال غير السليمة',
    taxonomyL3Id: 'L3-05-02-01',
    taxonomyL3Ar: 'معاملات غير مسموح بها قانونًا',
    nfiService: 'L',
    nfiReputation: 'H',
    nfiRegulatory: 'H',
    nfiLegal: 'H',
    serviceEvidenceAr: 'تأثير منخفض على الخدمة الاعتيادية لاقتصار الإجراء على الحالات المجمدة.',
    reputationEvidenceAr: 'أثر كبير على سمعة البنك أمام الجهات الرقابية والقضائية حال الإخلال بقرار تجميد.',
    regulatoryEvidenceAr: 'عدم الامتثال لقرارات التجميد يعرض البنك لملاحظات رقابية جوهرية واحتمالية فرض عقوبات.',
    legalEvidenceAr: 'مسؤولية قانونية ومطالبات قضائية مباشرة حال تحرير أموال محجوز عليها قانونياً.',
    esg: {
      status: 'ASSESSED',
      pillars: ['G'],
      catalogue_ids: [30],
      evidence: {
        G: 'الالتزام الصارم بقرارات التجميد والحجز وموافقة الامتثال يندرج ضمن ضوابط الحوكمة والامتثال للعقوبات (مرجع CBE #30).',
      },
      pillar_label_ar: 'G (حوكمة العمليات المصرفية والرقابة الداخلية)',
      pathway_ar: '[30] تسهيل التهرب الضريبي للعملاء أو مخالفة العقوبات (L1-05)',
    },
    acceptanceClass: 1,
    correctiveActionAr: '',
    controls: [
      {
        controlNameAr: 'القفل النظامي الإلزامي للحسابات والحوالات المجمدة',
        designClassification: 'PREVENTIVE',
        automationLevel: 'AUTOMATED',
        frequencyRaw: 'Ad-hoc\nوفقاً والحالة',
        ownerAr: 'النظام المصرفي الأساسي',
        effectivenessRaw: 'ضابط رقابي فعال',
        actionAr:
          'تفعيل قفل نظامي مانع (Hard Hold) على الحوالات والأرصدة المجمدة يمنع الصرف أو التحويل دون إدخال صلاحية فك الحجز المعتمدة.',
      },
      {
        controlNameAr: 'قيد الموافقة الكتابية المسبقة من قطاع الامتثال والشؤون القانونية',
        designClassification: 'PREVENTIVE',
        automationLevel: 'MANUAL',
        frequencyRaw: 'Ad-hoc\nوفقاً والحالة',
        ownerAr: 'قطاع الامتثال والشؤون القانونية',
        effectivenessRaw: 'ضابط رقابي فعال',
        actionAr:
          'حظر تحرير أي حوالة من الحساب المعلق إلا بموجب موافقة كتابية موثقة من قطاع الامتثال أو قرار قضائي رسمي مع إثبات رقم الإذن بالسجل.',
      },
      {
        controlNameAr: 'مراجعة سجل التدقيق الدوري لحالات التجميد وفك التجميد (Audit Trail)',
        designClassification: 'DETECTIVE',
        automationLevel: 'SEMI_AUTOMATED',
        frequencyRaw: 'Monthly\nشهرياً',
        ownerAr: 'الرقابة الداخلية / الامتثال',
        effectivenessRaw: 'ضابط رقابي فعال',
        actionAr:
          'استخراج ومراجعة سجل التدقيق الشهري لجميع حركات التجميد وفك التجميد ومطابقتها مع أرقام الإذن الكتابية الصادرة من قطاع الامتثال.',
      },
    ],
  },
  {
    id: 'LIQUIDITY_NOSTRO_LIMITS',
    match: /السيوله|المكشوف|حدود\s*السيوله|التغطيه\s*الماليه/,
    isCoreTransfersSopRisk: false,
    processNameAr: 'إدارة ومراقبة حدود السيولة بحسابات البنوك المراسلة (Nostro)',
    strategicObjectiveAr: 'النمو المربح و المستدام',
    riskTitleAr: 'السحب على المكشوف أو رفض التسوية لتجاوز حدود السيولة بحسابات النوسترو',
    riskStatementAr:
      'إرسال أوامر دفع دولية دون التحقق المسبق من كفاية السيولة المتاحة بحسابات البنوك المراسلة (Nostro)، مما يؤدي إلى السحب على المكشوف وتحمل فوائد وغرامات تأخير لدى المراسلين أو رفض وتعطل تسوية التحويلات.',
    inherentFrequencyText: 'مرة واحدة كل سنة',
    frequencyMultiplier: 1,
    frequencyJustificationAr: 'تقدير تكرار سنوي وفقاً لمتابعة الخزانة اليومية لأرصدة العملات الأجنبية وحجم التدفقات.',
    referenceAnchorEgp: OFFICIAL_FINANCIAL_ANCHORS_EGP.M, // 151,000 × 1 = 151,000 (M)
    taxonomyL1Id: 'L1-08',
    taxonomyL2Id: 'L2-08-01',
    taxonomyL2Ar: 'تسجيل المعاملات وتنفيذها وصيانتها',
    taxonomyL3Id: 'L3-08-01-06',
    taxonomyL3Ar: 'ضعف الأداء التشغيلي للأعمال',
    nfiService: 'M',
    nfiReputation: 'L',
    nfiRegulatory: 'L',
    nfiLegal: 'L',
    serviceEvidenceAr: 'تأخر محتمل في تسوية بعض الحوالات الدولية عند نقص التغطية اللحظية.',
    reputationEvidenceAr: 'أثر محدود على السمعة مع البنوك المراسلة حال سرعة التغطية.',
    regulatoryEvidenceAr: 'ملاحظات منخفضة حال الالتزام بحدود السيولة المعتمدة.',
    legalEvidenceAr: 'مخاطر قانونية منخفضة محكومة باتفاقيات البنوك المراسلة.',
    esg: {
      status: 'ASSESSED',
      pillars: ['G'],
      catalogue_ids: [32],
      evidence: {
        G: 'حوكمة مراقبة حدود السيولة بحسابات البنوك المراسلة والالتزام بالضوابط الرقابية الداخلية (مرجع CBE #32).',
      },
      pillar_label_ar: 'G (حوكمة العمليات المصرفية والرقابة الداخلية)',
      pathway_ar: '[32] ضعف حوكمة العمليات والرقابة والتقارير الرقابية (L1-08)',
    },
    acceptanceClass: 1,
    correctiveActionAr: '',
    controls: [
      {
        controlNameAr: 'فحص أرصدة وحدود السيولة المتاحة بحسابات المراسلين قبل إطلاق الحوالات',
        designClassification: 'PREVENTIVE',
        automationLevel: 'SEMI_AUTOMATED',
        frequencyRaw: 'Multiple times a day\nعدة مرات في اليوم',
        ownerAr: 'إدارة الخزانة والعمليات الدولية',
        effectivenessRaw: 'ضابط رقابي فعال',
        actionAr:
          'مراجعة أرصدة حسابات النوسترو بالعملات الأجنبية والتنسيق مع قطاع الخزانة لتمويل التغطية اللازمة قبل إطلاق رسائل الدفع عالية القيمة.',
      },
      {
        controlNameAr: 'متابعة تقرير مراكز السيولة اليومية وتنبيهات الحد الأدنى للنوسترو',
        designClassification: 'DETECTIVE',
        automationLevel: 'SEMI_AUTOMATED',
        frequencyRaw: 'Daily\nيومياً',
        ownerAr: 'السلطة الإشرافية',
        effectivenessRaw: 'ضابط رقابي فعال',
        actionAr:
          'مراجعة تقرير مراكز السيولة اليومي ومراقبة أي سحوبات على المكشوف أو فوائد مدينة لدى البنوك المراسلة ومعالجتها فوراً.',
      },
    ],
  },
];

function materializePattern(pattern: BankingRiskPattern): ExtractedRiskDetails {
  const l1 = OFFICIAL_BASEL_L1_MAP[pattern.taxonomyL1Id] || OFFICIAL_BASEL_L1_MAP['L1-08'];
  const controls: ExtractedControlDetails[] = pattern.controls.map((c) => ({
    control_name_ar: c.controlNameAr,
    design_classification: c.designClassification,
    control_type_label_ar: getControlTypeLabelAr(c.designClassification),
    automation_level: c.automationLevel,
    control_method_label_ar: getControlMethodLabelAr(c.automationLevel),
    control_frequency_raw: normalizeOfficialControlFrequency(c.frequencyRaw),
    control_owner_ar: c.ownerAr,
    effectiveness_raw: c.effectivenessRaw,
    // Strictly clean control description without embedded "(ضابط رقابي وقائي - آلي)" mechanism text!
    description_ar: stripControlMechanismFromDescription(c.actionAr),
  }));

  const rankOrder: Record<string, number> = { '-': 0, L: 1, M: 2, H: 3, VH: 4, C: 5 };
  const nfiLevels = [pattern.nfiService, pattern.nfiReputation, pattern.nfiRegulatory, pattern.nfiLegal];
  const nfiOverall = nfiLevels.reduce((best, cur) => (rankOrder[cur] > rankOrder[best] ? cur : best), 'L');

  const rationale = buildNbeAssessmentRationale({
    acceptanceClass: pattern.acceptanceClass,
    frequencyAr: pattern.inherentFrequencyText,
    individualImpactEgp: pattern.referenceAnchorEgp,
    residualRating: 'L',
    nfiOverall,
  });

  return {
    pattern_id: pattern.id,
    process_name_ar: pattern.processNameAr,
    risk_title_ar: pattern.riskTitleAr,
    description_ar: pattern.riskStatementAr,
    strategic_objective_ar: pattern.strategicObjectiveAr,
    inherent_frequency_text: pattern.inherentFrequencyText,
    frequency_multiplier: pattern.frequencyMultiplier,
    frequency_justification_ar: pattern.frequencyJustificationAr,
    reference_anchor_egp: pattern.referenceAnchorEgp,
    taxonomy_l1_id: pattern.taxonomyL1Id,
    taxonomy_l1_ar: l1.ar,
    taxonomy_l2_id: pattern.taxonomyL2Id,
    taxonomy_l2_ar: pattern.taxonomyL2Ar,
    taxonomy_l3_id: pattern.taxonomyL3Id,
    taxonomy_l3_ar: pattern.taxonomyL3Ar,
    nfi_service: pattern.nfiService,
    nfi_reputation: pattern.nfiReputation,
    nfi_regulatory: pattern.nfiRegulatory,
    nfi_legal: pattern.nfiLegal,
    service_impact_evidence_ar: pattern.serviceEvidenceAr,
    reputation_impact_evidence_ar: pattern.reputationEvidenceAr,
    regulatory_impact_evidence_ar: pattern.regulatoryEvidenceAr,
    legal_impact_evidence_ar: pattern.legalEvidenceAr,
    esg: pattern.esg,
    acceptance_class: pattern.acceptanceClass,
    acceptance_rationale_ar: rationale,
    corrective_action_ar: pattern.acceptanceClass === 1 ? '' : pattern.correctiveActionAr,
    controls,
  };
}

/**
 * Scan the entire combined SOP document text to return all core operational risk patterns
 * evidenced in the document so key SOP risks (outgoing transfers, incoming transfers, omitted
 * execution, GL/Nostro reconciliation, sanctions/AML, fraud, accounting entries, freeze/release)
 * are never missed.
 */
export function extractMatchedPatternsFromFullDocument(
  fullDocumentText: string,
  maxPatterns = 8
): ExtractedRiskDetails[] {
  const n = normAr(fullDocumentText || '');
  const matched: ExtractedRiskDetails[] = [];
  const seen = new Set<string>();

  for (const p of BANKING_RISK_PATTERNS) {
    if (p.match.test(n) && !seen.has(p.id)) {
      seen.add(p.id);
      matched.push(materializePattern(p));
    }
  }

  // If the document is clearly a Transfers / SWIFT / ACH SOP, ensure the 4 core operational risks
  // flagged by NBE reviewers (Outgoing, Incoming, Omitted Execution, GL/Nostro Reconciliation) are always covered!
  const isTransfersSop =
    /حوالات|تحويلات|سويفت|swift|ach|المقاصه\s*الاليه|نوسترو|nostro|mt103/.test(n);
  if (isTransfersSop) {
    for (const p of BANKING_RISK_PATTERNS) {
      if (p.isCoreTransfersSopRisk && !seen.has(p.id)) {
        seen.add(p.id);
        matched.push(materializePattern(p));
      }
    }
  }

  return matched.slice(0, maxPatterns);
}

export interface StructuredTableFields {
  processName?: string;
  riskTitle?: string;
  controlDesc?: string;
  owner?: string;
  frequency?: string;
  impactText?: string;
  normalizedSummary: string;
}

/**
 * Parse Markdown tables (`| col1 | col2 |` + `| --- | --- |`) from text/vision chunks
 * into clean header-value pairs and named RCSA semantic fields (never leaving `|` pipes in titles).
 */
export function extractStructuredTableFields(rawText: string): StructuredTableFields | null {
  if (!rawText || !rawText.includes('|')) return null;
  const rawLines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith('|') && l.endsWith('|') && l.split('|').length >= 3);

  if (rawLines.length < 2) return null;

  const isSeparator = (line: string) => /^\|[\s\-:|]+\|$/.test(line);
  const splitRow = (line: string) =>
    line
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((c) => c.trim());

  const headers = splitRow(rawLines[0]);
  const dataLines = rawLines.slice(1).filter((l) => !isSeparator(l));
  if (dataLines.length === 0) return null;

  const firstCells = splitRow(dataLines[0]);
  const fields: StructuredTableFields = { normalizedSummary: '' };
  const pairedParts: string[] = [];

  for (let i = 0; i < firstCells.length; i++) {
    const val = firstCells[i];
    if (!val || val === '-' || val === '—') continue;
    const hdr = headers[i] || `بند ${i + 1}`;
    const hNorm = normAr(hdr);
    pairedParts.push(`${hdr}: ${val}`);

    if (!fields.processName && hNorm.match(/العمليه|الإجراء|الاجراء|النشاط|process|stage|مرحله/)) {
      fields.processName = val;
    } else if (!fields.riskTitle && hNorm.match(/المخاطر|المخاطره|الخطر|وصف الخطر|risk|threat|event|حدث/)) {
      fields.riskTitle = val;
    } else if (!fields.controlDesc && hNorm.match(/الضابط|الرقاب|التحكم|الاجراء الرقابي|control|mitigat/)) {
      fields.controlDesc = val;
    } else if (!fields.owner && hNorm.match(/المسؤول|المالك|الاداره|السلطه|owner|department/)) {
      fields.owner = val;
    } else if (!fields.frequency && hNorm.match(/الدوريه|التكرار|frequency|cadence/)) {
      fields.frequency = val;
    } else if (!fields.impactText && hNorm.match(/الاثر|الخساره|المبلغ|التقييم|impact|loss|egp|amount/)) {
      fields.impactText = val;
    }
  }

  // Fallback assignment if columns used generic headers
  if (!fields.processName && firstCells[0]) fields.processName = firstCells[0];
  if (!fields.riskTitle && firstCells[1] && firstCells[1] !== fields.processName) {
    fields.riskTitle = firstCells[1];
  }
  if (!fields.controlDesc && firstCells[2]) fields.controlDesc = firstCells[2];

  const extraRowSummaries = dataLines
    .slice(1, 4)
    .map((line) => {
      const cells = splitRow(line);
      return cells
        .map((c, idx) => (c ? `${headers[idx] || idx + 1}: ${c}` : ''))
        .filter(Boolean)
        .join(' | ');
    })
    .filter(Boolean);

  fields.normalizedSummary = [pairedParts.join(' — '), ...extraRowSummaries].filter(Boolean).join(' ؛ ');
  return fields.normalizedSummary ? fields : null;
}

export function normalizeMarkdownTableToStructuredText(rawText: string): string {
  const tableFields = extractStructuredTableFields(rawText);
  if (tableFields) {
    return tableFields.normalizedSummary;
  }
  return stripLocationMarkers(rawText);
}

/**
 * Extract clean clause heading and body from raw text (e.g., "• فحص قوائم الحظر: تمرير...") or Markdown tables.
 */
function parseClauseSubjectAndBody(chunkText: string, sectionHint?: string): {
  subject: string;
  body: string;
} {
  const tableFields = extractStructuredTableFields(chunkText);
  if (tableFields) {
    const subj = (tableFields.processName || tableFields.riskTitle || stripLocationMarkers(sectionHint) || 'إجراء تشغيلي')
      .slice(0, 85)
      .trim();
    return {
      subject: subj,
      body: tableFields.normalizedSummary,
    };
  }

  const cleaned = stripLocationMarkers(chunkText)
    .replace(/^[•\-\*]+\s*/, '')
    .trim();

  const colonIdx = cleaned.indexOf(':');
  if (colonIdx > 2 && colonIdx <= 90) {
    const candidateSubject = cleaned
      .slice(0, colonIdx)
      .replace(/^\d+(?:\.\d+)*\.?\s*/, '')
      .replace(/[()]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const candidateBody = cleaned.slice(colonIdx + 1).trim();
    if (candidateSubject.length >= 4 && candidateBody.length >= 12) {
      return { subject: candidateSubject, body: candidateBody };
    }
  }

  const headingMatch = cleaned.match(/^\d+(?:\.\d+)*\.?\s+([^\n•:]{6,85})/);
  if (headingMatch) {
    return {
      subject: headingMatch[1].trim(),
      body: cleaned.slice(headingMatch[0].length).trim() || cleaned,
    };
  }

  const cleanHint = stripLocationMarkers(sectionHint).replace(/^\d+(?:\.\d+)*\.?\s*/, '').trim();
  if (cleanHint && cleanHint.length >= 5) {
    return { subject: cleanHint.slice(0, 75), body: cleaned };
  }

  const firstSentence = cleaned.split(/[.\n،؛]/)[0]?.trim() || cleaned.slice(0, 65);
  return {
    subject: firstSentence.slice(0, 70),
    body: cleaned,
  };
}

function classifyControlHeuristically(text: string): {
  design: ControlDesignType;
  automation: ControlAutomationType;
  frequency: string;
} {
  const n = normAr(text);
  let design: ControlDesignType = 'PREVENTIVE';
  if (n.match(/تصحيح|رد الاموال|فك تجميد|استثناء|معالجه الاخطاء|اعاده|corrective/)) {
    design = 'CORRECTIVE';
  } else if (n.match(/مطابقه|تقرير|فحص لاحق|تدقيق|جرد|رصد|استفسار|تفتيش|مراجعه دوريه|detective|reconcil/)) {
    design = 'DETECTIVE';
  }

  let automation: ControlAutomationType = 'MANUAL';
  if (n.match(/محرك|تلقائي|الي|اليه|نظام|system|core banking|automated|gateway|engine|فوري/)) {
    if (n.match(/موظف|مراجعه|اعتماد|يدوي|اتصال|مكالمه|موافقه|checker|maker|مستند/)) {
      automation = 'SEMI_AUTOMATED';
    } else {
      automation = 'AUTOMATED';
    }
  } else if (n.match(/تقرير|نظام|إلكتروني|تذاكر|سجل|semi/)) {
    automation = 'SEMI_AUTOMATED';
  }

  let frequency = 'Multiple times a day\nعدة مرات في اليوم';
  if (n.match(/يومي|daily|نهايه اليوم|جلسات/)) frequency = 'Daily\nيومياً';
  else if (n.match(/اسبوع|weekly/)) frequency = 'Weekly\nأسبوعياً';
  else if (n.match(/شهري|monthly/)) frequency = 'Monthly\nشهرياً';
  else if (n.match(/ربع سنوي|quarterly/)) frequency = 'Quarterly\nربع سنوي';
  else if (n.match(/سنوي|annually/)) frequency = 'Annually\nسنوي';
  else if (n.match(/حاله|استثناء|ad-?hoc/)) frequency = 'Ad-hoc\nوفقاً والحالة';

  return { design, automation, frequency };
}

/**
 * Extract concrete primary control name, classification, automation level, and clean description
 * directly from chunk text or Markdown table rows. Never embeds mechanism labels ("ضابط رقابي وقائي - آلي")
 * or pipe/page markers inside `description_ar`.
 */
export function extractControlDetailsFromText(
  chunkText: string,
  sectionHint?: string
): ExtractedControlDetails {
  const tableFields = extractStructuredTableFields(chunkText);
  const effectiveControlSource = tableFields?.controlDesc || chunkText;
  const n = normAr(`${sectionHint || ''} ${chunkText}`);
  const matchedPattern = BANKING_RISK_PATTERNS.find((p) => p.match.test(n));

  if (matchedPattern && !tableFields?.controlDesc) {
    return materializePattern(matchedPattern).controls[0];
  }

  const { subject, body } = parseClauseSubjectAndBody(effectiveControlSource, sectionHint);
  const { design, automation, frequency } = classifyControlHeuristically(
    `${effectiveControlSource} ${tableFields?.frequency || ''} ${subject} ${body}`
  );
  const typeLabel = getControlTypeLabelAr(design);
  const methodLabel = getControlMethodLabelAr(automation);
  const baseSubject = tableFields?.controlDesc ? tableFields.controlDesc.slice(0, 75).trim() : subject;
  const controlName =
    baseSubject.startsWith('ضابط') ||
    baseSubject.startsWith('فحص') ||
    baseSubject.startsWith('مراجعة') ||
    baseSubject.startsWith('مطابقة') ||
    baseSubject.startsWith('التحقق')
      ? baseSubject
      : `التحقق من ${baseSubject}`;
  const cleanBody = stripControlMechanismFromDescription(
    (tableFields?.controlDesc || body).slice(0, 220)
  );

  return {
    control_name_ar: controlName,
    design_classification: design,
    control_type_label_ar: typeLabel,
    automation_level: automation,
    control_method_label_ar: methodLabel,
    control_frequency_raw: normalizeOfficialControlFrequency(tableFields?.frequency || frequency),
    control_owner_ar: tableFields?.owner || 'السلطة الإشرافية',
    effectiveness_raw: 'ضابط رقابي فعال',
    description_ar: cleanBody || controlName,
  };
}

/**
 * Extract concrete process name, coded operational risk title, consequence-explicit description,
 * official NBE strategic objective, Basel taxonomy, ESG mapping, and multiple controls.
 */
export function extractRiskDetailsFromText(
  chunkText: string,
  unitNameAr: string,
  controlInfo: ExtractedControlDetails,
  sectionHint?: string
): ExtractedRiskDetails {
  const tableFields = extractStructuredTableFields(chunkText);
  const n = normAr(`${sectionHint || ''} ${chunkText}`);
  const matchedPattern = BANKING_RISK_PATTERNS.find((p) => p.match.test(n));

  if (matchedPattern && !tableFields) {
    return materializePattern(matchedPattern);
  }

  const { subject, body } = parseClauseSubjectAndBody(chunkText, sectionHint);
  const processName = (tableFields?.processName || subject || `عمليات ${unitNameAr}`).trim();
  const rawTitleSource = (tableFields?.riskTitle || processName).trim();
  const riskTitle =
    rawTitleSource.startsWith('أخطاء') ||
    rawTitleSource.startsWith('مخاطر') ||
    rawTitleSource.startsWith('تعطل') ||
    rawTitleSource.startsWith('تأخر') ||
    tableFields?.riskTitle
      ? rawTitleSource
      : `أخطاء أو قصور تشغيلي في ${processName}`;
  const conciseAction = stripControlMechanismFromDescription((tableFields?.riskTitle || body).slice(0, 180));
  const strategicObj = normalizeOfficialStrategicObjective(`${processName} ${body}`);
  const l1 = matchedPattern
    ? OFFICIAL_BASEL_L1_MAP[matchedPattern.taxonomyL1Id] || OFFICIAL_BASEL_L1_MAP['L1-08']
    : OFFICIAL_BASEL_L1_MAP['L1-08'];

  const secondaryControl: ExtractedControlDetails = {
    control_name_ar: `المراجعة الإشرافية الدورية لتقارير ${processName}`,
    design_classification: 'DETECTIVE',
    control_type_label_ar: getControlTypeLabelAr('DETECTIVE'),
    automation_level: 'SEMI_AUTOMATED',
    control_method_label_ar: getControlMethodLabelAr('SEMI_AUTOMATED'),
    control_frequency_raw: 'Daily\nيومياً',
    control_owner_ar: tableFields?.owner || 'السلطة الإشرافية',
    effectiveness_raw: 'ضابط رقابي فعال',
    description_ar: `استخراج ومراجعة التقارير اليومية للعمليات المنفذة في (${processName}) للتأكد من سلامة التنفيذ ومعالجة أي استثناءات فور رصدها.`,
  };

  return {
    process_name_ar: processName,
    risk_title_ar: riskTitle,
    description_ar: `قصور أو خطأ تنفيذي في إجراء (${processName}) فيما يتعلق بـ (${conciseAction || processName})، مما يؤدي إلى تكبد خسائر مالية وتعطل جودة الخدمة والتعرض لملاحظات رقابية.`,
    strategic_objective_ar: strategicObj,
    inherent_frequency_text: matchedPattern?.inherentFrequencyText || 'مرة واحدة كل سنة',
    frequency_multiplier: matchedPattern?.frequencyMultiplier || 1,
    frequency_justification_ar: `تقدير تكرار استناداً لطبيعة إجراء (${processName}) والأدلة الموثقة في المستند.`,
    reference_anchor_egp: matchedPattern?.referenceAnchorEgp || OFFICIAL_FINANCIAL_ANCHORS_EGP.M,
    taxonomy_l1_id: matchedPattern?.taxonomyL1Id || 'L1-08',
    taxonomy_l1_ar: l1.ar,
    taxonomy_l2_id: matchedPattern?.taxonomyL2Id || 'L2-08-01',
    taxonomy_l2_ar: matchedPattern?.taxonomyL2Ar || 'تسجيل المعاملات وتنفيذها وصيانتها',
    taxonomy_l3_id: matchedPattern?.taxonomyL3Id || 'L3-08-01-02',
    taxonomy_l3_ar: matchedPattern?.taxonomyL3Ar || 'أخطاء إدخال البيانات أو تحميلها',
    nfi_service: matchedPattern?.nfiService || 'M',
    nfi_reputation: matchedPattern?.nfiReputation || 'M',
    nfi_regulatory: matchedPattern?.nfiRegulatory || 'L',
    nfi_legal: matchedPattern?.nfiLegal || 'L',
    service_impact_evidence_ar: `تأثر ملحوظ في مستوى انتظام الخدمة عند تعطل إجراء (${processName}).`,
    reputation_impact_evidence_ar: `تأثر محدود لرضا المتعاملين حال وقوع خطأ تنفيذي في (${processName}).`,
    regulatory_impact_evidence_ar: `ملاحظات رقابية منخفضة مرتبطة بالالتزام بدليل إجراءات (${processName}).`,
    legal_impact_evidence_ar: `مغطى بالنماذج والشروط القانونية المعتمدة في (${unitNameAr}).`,
    esg: matchedPattern?.esg || {
      status: 'ASSESSED',
      pillars: ['G'],
      catalogue_ids: [32],
      evidence: {
        G: `حوكمة تنفيذ وضبط إجراءات (${processName}) في (${unitNameAr}) والالتزام بالرقابة الداخلية (مرجع CBE #32).`,
      },
      pillar_label_ar: 'G (حوكمة العمليات المصرفية والرقابة الداخلية)',
      pathway_ar: '[32] ضعف حوكمة العمليات والرقابة والتقارير الرقابية (L1-08)',
    },
    acceptance_class: matchedPattern?.acceptanceClass || 1,
    acceptance_rationale_ar: buildNbeAssessmentRationale({
      acceptanceClass: matchedPattern?.acceptanceClass || 1,
      frequencyAr: matchedPattern?.inherentFrequencyText || 'مرة واحدة كل سنة',
      individualImpactEgp: matchedPattern?.referenceAnchorEgp || OFFICIAL_FINANCIAL_ANCHORS_EGP.M,
      residualRating: 'L',
      nfiOverall: 'M',
    }),
    corrective_action_ar: matchedPattern?.acceptanceClass && matchedPattern.acceptanceClass !== 1 ? matchedPattern.correctiveActionAr : '',
    controls: [controlInfo, secondaryControl],
  };
}
