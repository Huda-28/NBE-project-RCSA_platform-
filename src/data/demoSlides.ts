import type { PageId } from '../components/Sidebar.js';

export type SlideLayoutKind =
  | 'cover'
  | 'comparison'
  | 'workflow'
  | 'roles'
  | 'dashboard'
  | 'sources'
  | 'agent'
  | 'calculations'
  | 'nfi_esg'
  | 'matrix'
  | 'governance'
  | 'outputs'
  | 'walkthrough';

export interface DemoSlideJumpTarget {
  label: string;
  page: Exclude<PageId, 'demo'>;
}

export interface DemoSlide {
  id: string;
  number: number;
  indexLabel: string;
  section: string;
  title: string;
  subtitle: string;
  layout: SlideLayoutKind;
  jumpTarget?: DemoSlideJumpTarget;
  presenterNotes: string;
  keyQuestion?: string;
  keyAnswer?: string;
}

export const DEMO_SLIDES: DemoSlide[] = [
  {
    id: 'cover',
    number: 1,
    indexLabel: '01',
    section: 'نظرة تنفيذية',
    title: 'منصة التقييم الذاتي للمخاطر والضوابط الرقابية (RCSA)',
    subtitle:
      'منظومة مصرفية موحدة لأتمتة وحوكمة دورة تقييم المخاطر التشغيلية بالبنك الأهلي المصري، وفق منهجية البنك ومعايير البنك المركزي المصري.',
    layout: 'cover',
    jumpTarget: { label: 'فتح لوحة المعلومات التنفيذية', page: 'dashboard' },
    presenterNotes:
      'ابدأ بالترحيب بالمراجعين وأكد أن الهدف من المنصة ليس استبدال الخبرة المصرفية، بل توحيد الحسابات، منع الأخطاء اليدوية في ملفات Excel، وتوثيق كل خطوة مراجعة واعتماد في سجل تدقيق مركزي.',
    keyQuestion: 'ما الذي تغيره هذه المنصة بالنسبة للبنك؟',
    keyAnswer:
      'تحول دورة التقييم من ملفات متفرقة ومراجعات بريدية إلى بيئة عمل واحدة محكومة بصلاحيات Maker وChecker وAuditor، مع تصدير فوري لنموذج البنك الرسمي.',
  },
  {
    id: 'before-after',
    number: 2,
    indexLabel: '02',
    section: 'القيمة المضافة للبنك',
    title: 'لماذا احتجنا للمنصة؟ مقارنة العمل قبل المنصة وبعدها',
    subtitle:
      'الانتقال من التقييم اليدوي بملفات متفرقة إلى منظومة مركزية موثوقة تقلل وقت الإعداد وتضبط جودة الأرقام.',
    layout: 'comparison',
    presenterNotes:
      'ركّز في هذه الشريحة على أربع نقاط تهم أي مراجع غير تقني: دقة المعادلات، تتبع التعديلات، سهولة تجميع الوحدات، ومنع التعديل بعد الاعتماد.',
    keyQuestion: 'هل تضطر الإدارات للتخلي عن ملفات Excel المعتادة؟',
    keyAnswer:
      'لا؛ المنصة تستوعب بيانات الإدارات والملفات الحالية وتُخرج في النهاية نفس مصنف Excel المعتمد من 29 عموداً إضافة إلى تقرير PDF رسمي.',
  },
  {
    id: 'end-to-end-workflow',
    number: 3,
    indexLabel: '03',
    section: 'رحلة العمل الكاملة',
    title: 'مسار العمل من البداية إلى الاعتماد الرسمي في 5 خطوات',
    subtitle:
      'رحلة واضحة وموحدة تبدأ بتحديد الإدارة وتنتهي بنسخة معتمدة مقفلة وتقارير رسمية جاهزة للتسليم.',
    layout: 'workflow',
    jumpTarget: { label: 'استعراض إعداد تقييم جديد', page: 'backend-rcsa' },
    presenterNotes:
      'اشرح المسار من اليمين لليسار كقصة عملية: يختار الموظف الإدارة والمصدر، ثم تساعده القراءة الذكية للمستندات (أو يدخل بياناته مباشرة)، ثم تُحتسب الأرقام آلياً، يليها اعتماد المراجع المستقل وأخيراً التصدير.',
  },
  {
    id: 'roles-governance',
    number: 4,
    indexLabel: '04',
    section: 'الحوكمة وفصل الصلاحيات',
    title: 'الصلاحيات والأدوار الأربعة: من يفعل ماذا داخل المنصة؟',
    subtitle:
      'تطبيق صارم لمبدأ الفصل بين الإعداد والمراجعة والتدقيق (Maker – Checker – Auditor – Admin) على مستوى كل وحدة تنظيمية.',
    layout: 'roles',
    jumpTarget: { label: 'عرض إدارة المستخدمين والصلاحيات', page: 'admin' },
    presenterNotes:
      'أوضح أن أي مستخدم قد يكون مُعداً في وحدة ومراجعاً في أخرى حسب تكليف الإدارة، ولكن يُمنع تماماً أي شخص — حتى مدير المخاطر المركزية — من اعتماد تقييم قام هو بإعداده.',
    keyQuestion: 'هل يستطيع المدقق الداخلي تعديل أرقام وحدة العمل؟',
    keyAnswer:
      'ممنوع تماماً؛ دور التفتيش والرقابة الداخلية (Auditor) مخصص للقراءة الشاملة والفحص وسجل التعديلات فقط.',
  },
  {
    id: 'executive-dashboard',
    number: 5,
    indexLabel: '05',
    section: 'الرقابة والمتابعة العليا',
    title: 'لوحة المعلومات التنفيذية وخريطة المخاطر الحرارية (5×5)',
    subtitle:
      'رؤية شاملة لحظية لوضع المخاطر الكامنة والمتبقية عبر الإدارات، مع رصد تلقائي للفجوات بين التقدير والخسائر التاريخية.',
    layout: 'dashboard',
    jumpTarget: { label: 'الانتقال إلى لوحة المعلومات', page: 'dashboard' },
    presenterNotes:
      'عند الانتقال للعرض المباشر، أشر إلى البطاقات الخمس العلوية، ثم الخريطة الحرارية 5×5 التي تقارن موضع المخاطر قبل الضوابط (الكامن) وبعد الضوابط (المتبقي)، ثم تنبيه الخسائر التاريخية.',
  },
  {
    id: 'assessment-setup-sources',
    number: 6,
    indexLabel: '06',
    section: 'مرونة إعداد التقييم',
    title: 'إعداد تقييم جديد: 3 مصادر بيانات داخل معالج موجه من 6 خطوات',
    subtitle:
      'تتيح المنصة البدء من مستندات جديدة فقط، أو تحديث دورة سابقة معتمدة دون المساس بالأصل، أو الجمع بينهما معاً.',
    layout: 'sources',
    jumpTarget: { label: 'تجربة المعالج الموجه الآن', page: 'backend-rcsa' },
    presenterNotes:
      'هذه الميزة تعالج واقع الإدارات المصرفية: أحياناً نراجع سياسة جديدة من الصفر، وأحياناً نحدّث تقييم العام الماضي فقط، وأحياناً ندمج تقييم العام الماضي مع تقارير تدقيق وحوادث حديثة لاكتشاف ما تغيّر.',
  },
  {
    id: 'ai-copilot-rag',
    number: 7,
    indexLabel: '07',
    section: 'المساعد الذكي وقراءة الوثائق',
    title: 'وكيل الذكاء الاصطناعي وقاعدة المعرفة (RAG): مساعد أمين وليس صاحب قرار',
    subtitle:
      'يقرأ ملفات السياسات والتدقيق وسجلات الحوادث، ويربطها بتصنيف بازل ومعايير الاستدامة مع إظهار الدليل، والقرار النهائي للموظف دائماً.',
    layout: 'agent',
    jumpTarget: { label: 'فتح شاشة وكيل الذكاء الاصطناعي', page: 'agent' },
    presenterNotes:
      'طمئن المراجعين: الذكاء الاصطناعي لا يعتمد أي رقم أو مخاطرة من تلقاء نفسه. كل مقترح يأتي مرفقاً باسم الملف والصفحة والفقرة، وأمام الموظف ثلاثة أزرار واضحة: قبول أو تعديل أو رفض. وإذا كان ملف PDF مصوراً (سكان)، ينبه النظام لضرورة المراجعة البشرية.',
    keyQuestion: 'ما الفرق بين الوضع السريع والوضع الدقيق في الوكيل؟',
    keyAnswer:
      'الوضع السريع مخصص للأسئلة المباشرة والملخصات الفورية، بينما الوضع الدقيق يفحص المستندات بعمق مع مراجعة جودة داخلية قبل اقتراح صفوف المصفوفة.',
  },
  {
    id: 'deterministic-calculations',
    number: 8,
    indexLabel: '08',
    section: 'دقة الاحتساب البنكي',
    title: 'كيف تُحسب الأرقام المالية والضوابط؟ قواعد واضحة لا تقبل الاجتهاد',
    subtitle:
      'الموظف أو الوكيل يصفان المدخلات، بينما يتولى محرك احتساب مركزي منضبط تطبيق معادلات البنك الأهلي المصري دون أي تدخل عشوائي.',
    layout: 'calculations',
    jumpTarget: { label: 'فتح مصفوفة التقييم والحسابات', page: 'rcsa-table' },
    presenterNotes:
      'اشرح المثال الرقمي البسيط على الشاشة: خسارة فردية 200 ألف × 3 مرات سنوياً = 600 ألف خسارة كامنة. إذا كان لدينا ضابط منفذ تصميمه وتنفيذه فعالان يخفض المخاطرة بنسبة 90%، تصبح الخسارة المتبقية 60 ألفاً فقط. أما الضابط المقترح مستقبلاً فلا يُحتسب في الخفض حالياً.',
  },
  {
    id: 'nfi-esg-keyrisk',
    number: 9,
    indexLabel: '09',
    section: 'الامتثال المنهجي للبنك والمركزي',
    title: 'الأثر غير المالي (NFI 4×5)، الاستدامة (ESG)، وقاعدة المخاطرة الرئيسية',
    subtitle:
      'تغطية كاملة لمصفوفة الشريحة الرابعة للبنك (4 أبعاد × 5 درجات)، كتالوج البنك المركزي للاستدامة، وقاعدة تحديد المخاطرة الرئيسية من الأثر المتبقي فقط.',
    layout: 'nfi_esg',
    jumpTarget: { label: 'استعراض تقييم NFI وESG في المصفوفة', page: 'rcsa-table' },
    presenterNotes:
      'هذه الشريحة تجيب مباشرة عن ملاحظات المراجعين المتخصصين: (1) تم إدراج خيار "-" عند عدم الانطباق في كل بُعد من الأبعاد الأربعة، (2) تُطبق قاعدة الأكثر تحوطاً بأخذ أعلى درجة، (3) المخاطرة الرئيسية Key Risk تعتمد على الأثر المتبقي بعد الضوابط أو أي بُعد NFI بدرجة H فأعلى فقط — ولا تدخل الدرجة الكامنة فيها.',
  },
  {
    id: 'rcsa-matrix-workbench',
    number: 10,
    indexLabel: '10',
    section: 'بيئة العمل والمراجعة اليومية',
    title: 'مصفوفة تقييم المخاطر (29 عموداً) ومؤشرات مصدر كل معلومة',
    subtitle:
      'مساحة العمل التفصيلية لمعد التقييم والمراجع: تمييز بصري واضح لأصل كل قيمة، حماية من الحقول الناقصة، وخيارات "أخرى" في كل القوائم.',
    layout: 'matrix',
    jumpTarget: { label: 'فتح مصفوفة الـ 29 عموداً', page: 'rcsa-table' },
    presenterNotes:
      'أشر إلى أوسمة المصدر الخمسة التي تحل سؤال المراجع الدائم: "من أين جاء هذا الرقم؟" — هل هو من الملف الأصلي، أم مقترح ذكي قبلناه، أم عدّله الموظف في المسودة، أم احتسبه محرك الحسابات، أم تم اعتماده نهائياً. كما أن أي تعديل مالي يوقف التصدير مؤقتاً حتى يُعاد احتساب الصف.',
  },
  {
    id: 'reviews-units-audit',
    number: 11,
    indexLabel: '11',
    section: 'التدقيق والتتبع التاريخي',
    title: 'الاعتماد المستقل، مقارنة الدورات التاريخية، وسجل التدقيق الشامل',
    subtitle:
      'منظومة متكاملة تمنح المراجع المستقل وإدارة التفتيش والرقابة الداخلية رؤية واضحة لكل تغيير، مع حفظ تاريخ كل وحدة عبر السنوات.',
    layout: 'governance',
    jumpTarget: { label: 'فتح شاشة المراجعة والاعتماد', page: 'reviews' },
    presenterNotes:
      'وضّح هنا كيف يترابط الثلاثي الرقابي: (1) صندوق المراجعة يعطي Checker مقارنة واضحة بين القيمة الأصلية والمعدلة ويجبره على كتابة سبب عند الرفض، (2) صفحة الوحدات التنظيمية تقارن دورات الوحدة تاريخياً دون مساس بالنسخ المقفلة، (3) سجل التدقيق يحفظ كل حقل قبل وبعد التعديل.',
  },
  {
    id: 'official-outputs-ux',
    number: 12,
    indexLabel: '12',
    section: 'المخرجات وتجربة المستخدم',
    title: 'التقارير الرسمية المعتمدة (Excel & PDF) وتبسيط الواجهة بتلميحات الشرح',
    subtitle:
      'تصدير فوري متوافق مع قالب البنك المعتمد، مصحوباً بواجهة هادئة غير مزدحمة وشرح فوري لكل زر ومصطلح بمجرد تمرير المؤشر.',
    layout: 'outputs',
    jumpTarget: { label: 'معاينة المخرجات من المصفوفة', page: 'rcsa-table' },
    presenterNotes:
      'تحدث عن التحسينات الأخيرة في تجربة الاستخدام: تم تخفيف الزحام البصري في كل الشاشات وإضافة نظام تلميحات الهوفر (؟) بحيث لو وقف أي مستخدم أو مراجع على أي مصطلح مثل EAL أو RRF أو Key Risk يظهر له شرح عربي مبسط فوراً.',
  },
  {
    id: 'live-demo-walkthrough',
    number: 13,
    indexLabel: '13',
    section: 'خطة العرض المباشر',
    title: 'خطة العرض العملي في 10 دقائق وإجابات أهم أسئلة المراجعين',
    subtitle:
      'دليل عملي خطوة بخطوة لتجربة كافة صلاحيات المنصة أمام الحضور بالحسابات الجاهزة، مع خلاصة جاهزية الجودة.',
    layout: 'walkthrough',
    jumpTarget: { label: 'الانتقال لسجل التدقيق المباشر', page: 'audit' },
    presenterNotes:
      'اختم بجدول العشر دقائق: دقيقتان استعراض إداري بحساب طارق رضوان، 3 دقائق إعداد ذكي بحساب أحمد محمود، 3 دقائق مراجعة المصفوفة والتقارير، ودقيقتان اعتماد بسارة إبراهيم وفحص التدقيق بهدى سامي.',
  },
];

export interface RoleSummaryItem {
  roleAr: string;
  roleEn: string;
  demoUser: string;
  employeeId: string;
  scope: string;
  permissions: string[];
  restriction: string;
}

export const ROLE_MATRIX_SUMMARY: RoleSummaryItem[] = [
  {
    roleAr: 'مُعد التقييم',
    roleEn: 'Maker',
    demoUser: 'أحمد محمود / كريم حسام',
    employeeId: 'EMP-1001 / EMP-3003',
    scope: 'الوحدات المعينة له فقط',
    permissions: [
      'إعداد مسودة جديدة أو من دورة سابقة',
      'رفع المستندات واستخدام الوكيل الذكي',
      'تعديل البيانات وتشغيل الحساب الآلي والإرسال',
    ],
    restriction: 'يُمنع من اعتماد التقييم أو مراجعة عمله',
  },
  {
    roleAr: 'المراجع المستقل',
    roleEn: 'Checker',
    demoUser: 'سارة إبراهيم / منى كمال',
    employeeId: 'EMP-2002 / EMP-4004',
    scope: 'المسودات المرسلة في وحداته',
    permissions: [
      'فحص المصفوفة ومقارنة القيم الأصلية والمعدلة',
      'الاطلاع على الأدلة وملاحظات NFI وESG',
      'الاعتماد النهائي أو الإعادة مع سبب إلزامي',
    ],
    restriction: 'قراءة وفحص فقط دون إنشاء أو تعديل المسودة',
  },
  {
    roleAr: 'التفتيش والرقابة الداخلية',
    roleEn: 'Auditor',
    demoUser: 'هدى سامي',
    employeeId: 'EMP-8008',
    scope: 'نطاق التدقيق المصرفي المصرح به',
    permissions: [
      'استعراض كافة التقييمات والنسخ المعتمدة',
      'تتبع سجل التعديلات الشامل (قبل / بعد)',
      'تصدير التقارير الرسمية للمراجعة الرقابية',
    ],
    restriction: 'صلاحية قراءة وفحص كاملة دون تعديل أو اعتماد',
  },
  {
    roleAr: 'مدير المخاطر المركزية',
    roleEn: 'Risk Admin',
    demoUser: 'طارق رضوان',
    employeeId: 'EMP-9009',
    scope: 'كافة الإدارات والوحدات التنظيمية',
    permissions: [
      'الإشراف الشامل وإدارة المستخدمين والوحدات',
      'إعداد المسودات ومراقبة لوحة المعلومات العليا',
      'فحص سجل التدقيق وتنبيهات الخسائر التاريخية',
    ],
    restriction: 'تطبق عليه أيضاً قاعدة منع الاعتماد الذاتي لعمله',
  },
];

export type MethodologyLayoutKind =
  | 'deep_cover'
  | 'dual_architecture'
  | 'phase2a_financial'
  | 'phase2b_controls'
  | 'phase2c_nfi_esg'
  | 'evolution_timeline'
  | 'rag_hybrid_rrf'
  | 'llm_profiles_prompting'
  | 'qa_self_critique'
  | 'ai_security_lineage'
  | 'before_after_metrics'
  | 'testing_roadmap'
  | 'references';

export interface MethodologySlide {
  id: string;
  number: number;
  indexLabel: string;
  section: string;
  title: string;
  subtitle: string;
  layout: MethodologyLayoutKind;
  jumpTarget?: DemoSlideJumpTarget;
  presenterNotes: string;
  keyQuestion?: string;
  keyAnswer?: string;
}

export const FINANCIAL_BANDS_TABLE = [
  { code: 'L', labelEn: 'Low', rangeEn: 'Up to 150,000 EGP', anchorEgp: '50,000' },
  { code: 'M', labelEn: 'Medium', rangeEn: '150,001 – 500,000 EGP', anchorEgp: '151,000' },
  { code: 'H', labelEn: 'High', rangeEn: '500,001 – 1,500,000 EGP', anchorEgp: '501,000' },
  { code: 'VH', labelEn: 'Very High', rangeEn: '1,500,001 – 3,000,000 EGP', anchorEgp: '1,501,000' },
  { code: 'C', labelEn: 'Critical', rangeEn: 'Above 3,000,000 EGP', anchorEgp: '3,001,000' },
] as const;

export const RRF_MATRIX_ROWS = [
  { methodEn: 'Automated Control', preventive: '95%', detective: '85%', corrective: '50%' },
  { methodEn: 'Semi-Automated Control', preventive: '90%', detective: '80%', corrective: '40%' },
  { methodEn: 'Manual Control', preventive: '75%', detective: '60%', corrective: '30%' },
] as const;

export const MODEL_EVOLUTION_MILESTONES = [
  {
    stage: 'V1 · Initial Baseline',
    commitRef: 'Baseline (4301a33)',
    retrieval: 'Direct keyword substring lookup (LIKE) without Arabic morphological repair or dense embeddings.',
    contextAndTokens: '240-character chunk window; constrained outputs from a small 0.5B parameter model.',
    qaAndCompliance: 'Basic heuristic extraction; vulnerable to leaked page markers and weak hedging ("Probability...").',
    outcome: 'Low recall on long banking SOPs and inconsistent table/control wording.',
  },
  {
    stage: 'V2 · RAG & Memory Upgrade',
    commitRef: 'Upgrade (8c5c335)',
    retrieval: 'Added custom BM25 ranking with Arabic stemming + 9 bilingual operational risk synonym clusters.',
    contextAndTokens: 'Expanded retrieval window to 1,400 chars (5.8x) and generation budget to 4,096 tokens.',
    qaAndCompliance: 'Transitioned to LLM-First structured extraction with multi-turn conversational memory.',
    outcome: 'Major leap in paragraph comprehension and analytical coherence across follow-up turns.',
  },
  {
    stage: 'V3 · Industry Best-Practice Hybrid AI',
    commitRef: 'Hybrid RAG + QA (13160f5)',
    retrieval: 'Hybrid dense embeddings (192-dim + gemini-embedding-2) fused with BM25 via RRF (k=60).',
    contextAndTokens: 'Dual calibrated model profiles: Fast (qwen3:1.7b / LOW) and Accurate (qwen3.5:4b / HIGH) + Schema.',
    qaAndCompliance: 'Two-pass QA self-critique (8 deterministic banking rules + LLM refinement pass) + loss checks.',
    outcome: 'Disciplined risk/control phrasing, strict evidence citations, and steep drop in schema errors.',
  },
  {
    stage: 'V4 · NBE Reviewer Calibration',
    commitRef: 'Bank Calibration (d8379bd)',
    retrieval: 'Bound directly to 84 Basel L1–L3 nodes and 34 CBE ESG cases + Dual-Source continuation mode.',
    contextAndTokens: 'Full security perimeter: PII Redaction, Prompt-Injection Quarantine, and 15-field stripping.',
    qaAndCompliance: 'Residual-only Key Risk, "-" legal NFI justification, 1–4 acceptability rules, and scanned-PDF OCR alerts.',
    outcome: 'Full alignment with NBE reviewer feedback and backed by 82 Node.js + 87 Python regression tests.',
  },
  {
    stage: 'V5 · Multimodal Vision & Stage-2 Reranker',
    commitRef: 'Vision + Rerank (V5)',
    retrieval: 'Stage-2 multi-concept + table-aware Precision Reranker over Stage-1 RRF (k=60) candidate pools.',
    contextAndTokens: 'ViT/Swin multimodal Vision parser + PDF embedded image extractor + header-preserving Markdown table chunker.',
    qaAndCompliance: 'Clean tabular row parsing into 29-column Matrix proposals + VISION_DOCUMENT_EXTRACT audit logging.',
    outcome: 'Understands scanned PDFs, PNG/JPG tables, and complex multi-column tables with measurable Precision@1 & MRR uplift.',
  },
] as const;

export const METHODOLOGY_REFERENCES = [
  {
    category: 'Information Retrieval, Reranking & Multimodal Vision',
    items: [
      {
        citation: 'Cormack, G. V., Clarke, C. L. A., & Buettcher, S. (2009)',
        title: 'Reciprocal Rank Fusion outperforms Condorcet and individual Rank Learning Methods (SIGIR ’09)',
        roleInSystem: 'Governs Stage-1 Hybrid RAG rank fusion in rag-service.ts using constant k = 60 across dense vectors and BM25.',
      },
      {
        citation: 'Robertson, S., & Zaragoza, H. (2009) & Nogueira, R., & Cho, K. (2019)',
        title: 'BM25 Probabilistic Relevance & Two-Stage Passage Reranking (FnTIR ’09 / arXiv:1901.04085)',
        roleInSystem: 'Forms Stage-1 lexical scoring paired with Stage-2 precision reranking (rerankCandidatesWithStage2) for exact table/code fidelity.',
      },
      {
        citation: 'Dosovitskiy, A., et al. (ICLR 2021) & Liu, Z., et al. (ICCV 2021)',
        title: 'Vision Transformer (ViT) & Swin Transformer Hierarchical Shifted-Window Encoders + Lewis et al. (NeurIPS 2020) RAG',
        roleInSystem: 'Guides patch/hierarchical visual document & table extraction (vision-document-parser.ts) combined with evidence-grounded RAG.',
      },
    ],
  },
  {
    category: 'Model Reasoning, Self-Critique & AI Security',
    items: [
      {
        citation: 'Madaan, A., Tandon, N., Gupta, P., et al. (2023)',
        title: 'Self-Refine: Iterative Refinement with Self-Feedback (NeurIPS 2023)',
        roleInSystem: 'Basis for Accurate mode runLlmSelfCritiquePass reviewing 8 RCSA QA rules prior to Maker sign-off.',
      },
      {
        citation: 'Qwen Team (2025) & Google Gemini Developer Docs (2025)',
        title: 'Qwen3 Technical Report (arXiv:2505.09388) & gemini-embedding-2 / Multimodal Vision & Schema Outputs',
        roleInSystem: 'Powers qwen3:1.7b / qwen3.5:4b profiles, multimodal Vision table/OCR extraction, 192-dim dense vectors, and JSON outputs.',
      },
      {
        citation: 'OWASP Foundation (2025) & NIST (2023)',
        title: 'OWASP Top 10 for LLM Applications (LLM01 / LLM02) & NIST AI Risk Management Framework (AI 100-1)',
        roleInSystem: 'Informs EG IBAN/National ID/PAN redaction, prompt-injection quarantine across Vision OCR, and human-in-the-loop separation.',
      },
    ],
  },
  {
    category: 'Banking Regulation & Primary NBE Methodology',
    items: [
      {
        citation: 'Basel Committee on Banking Supervision (BCBS)',
        title: 'Principles for the Sound Management of Operational Risk (PSMOR) & Event Type Taxonomy (L1/L2/L3)',
        roleInSystem: 'Defines the 7 Level-1 operational risk categories and 84 hierarchical L1→L2→L3 taxonomy nodes.',
      },
      {
        citation: 'Central Bank of Egypt (CBE)',
        title: 'Sustainable Finance & Environmental/Social/Governance (ESG) Operational Risk Catalogue',
        roleInSystem: 'Provides the 34 standardized E/S/G risk cases integrated across extraction, QA, and official exports.',
      },
      {
        citation: 'National Bank of Egypt (NBE) — Operational Risk Division',
        title: 'NBE RCSA Methodology Slides (Pages 3–6), Official 29-Column Template (C–AE), & Reviewer Calibration Notes',
        roleInSystem: 'Authoritative source for EI880:EI884 anchors, 3×3 RRF matrix, 4×5 NFI ("-"), and residual-only Key Risk.',
      },
    ],
  },
] as const;

export const METHODOLOGY_SLIDES: MethodologySlide[] = [
  {
    id: 'deep-cover',
    number: 1,
    indexLabel: '01',
    section: 'Methodology & Model Architecture',
    title: 'Quantitative RCSA Methodology, Hybrid AI Models & Performance Evolution',
    subtitle:
      'An in-depth technical and methodological walkthrough of how the platform combines a deterministic Python Decimal calculation engine with industry best-practice Hybrid RAG (Vector + BM25 RRF + Self-Critique QA).',
    layout: 'deep_cover',
    jumpTarget: { label: 'Open AI Risk Agent', page: 'agent' },
    presenterNotes:
      'Designed for model risk committees, internal audit, and methodology reviewers: maps every NBE rule and Excel formula directly to the running code, and traces the V1-to-V5 model upgrade path grounded in established research.',
    keyQuestion: 'What is the foundational engineering principle behind this platform?',
    keyAnswer:
      'Strict separation of concerns: Hybrid RAG and LLMs extract and cite qualitative policy evidence, while the deterministic Python Decimal engine and human reviewers control 100% of ratings, RRF, and approvals.',
  },
  {
    id: 'dual-architecture',
    number: 2,
    indexLabel: '02',
    section: 'Dual-Engine Architecture',
    title: 'Strict Separation: Deterministic Python Engine vs. Advisory Hybrid AI',
    subtitle:
      'The language model never calculates loss figures, assigns RRF percentages, or approves risks; every model payload passes a 15-field sanitizer before deterministic computation.',
    layout: 'dual_architecture',
    jumpTarget: { label: 'Inspect 29-Column Matrix', page: 'rcsa-table' },
    presenterNotes:
      'Walk reviewers through the contract: documents flow into Hybrid RAG retrieval, the LLM generates schema-bound text with verbatim quotes, stripForbiddenLlmFields removes any restricted rating fields, and Python Decimal computes the official figures.',
    keyQuestion: 'What happens if the LLM attempts to output a High rating or 95% RRF?',
    keyAnswer:
      'stripForbiddenLlmFields immediately drops all 15 forbidden calculation and approval fields, logs the sanitization event, and delegates scoring strictly to the Python engine.',
  },
  {
    id: 'phase2a-financial',
    number: 3,
    indexLabel: '03',
    section: 'Calculation Engine (Phase 2A)',
    title: 'Financial Impact Bands, Official Anchors (EI880:EI884) & Historical Calibration',
    subtitle:
      'Exact Decimal arithmetic free of floating-point drift, implementing NBE methodology pages 3, 5, and 6 alongside automatic historical loss benchmarking.',
    layout: 'phase2a_financial',
    jumpTarget: { label: 'View Loss Alerts in Dashboard', page: 'dashboard' },
    presenterNotes:
      'Highlight the five official EGP impact bands and exact EI880:EI884 reference anchors (50K, 151K, 501K, 1.501M, 3.001M) that prevent arbitrary inputs, plus the automatic <75% historical loss alert.',
  },
  {
    id: 'phase2b-controls',
    number: 4,
    indexLabel: '04',
    section: 'Controls Engine (Phase 2B)',
    title: 'Control Evaluation, 3×3 Official RRF Matrix & Residual Risk Calculation',
    subtitle:
      'Conservative MAX RRF selection over relevant IMPLEMENTED controls only, enforcing 0% reduction for PROPOSED controls and the seven official control frequencies.',
    layout: 'phase2b_controls',
    jumpTarget: { label: 'Review Controls in Matrix', page: 'rcsa-table' },
    presenterNotes:
      'Emphasize why the engine takes MAX RRF rather than adding controls together—preventing artificial risk understatement—and why future PROPOSED controls receive 0% credit until implemented.',
  },
  {
    id: 'phase2c-nfi-esg',
    number: 5,
    indexLabel: '05',
    section: 'Governance Rules (Phase 2C)',
    title: 'Slide 4 NFI (4×5 + "-"), Basel Taxonomy (84), CBE ESG (34) & Residual Key Risk',
    subtitle:
      'Deterministic validation of non-financial evidence, worst-case aggregation across dimensions, and strict enforcement of NBE residual-only Key Risk criteria.',
    layout: 'phase2c_nfi_esg',
    jumpTarget: { label: 'Open Guided Assessment Wizard', page: 'backend-rcsa' },
    presenterNotes:
      'Point out key NBE reviewer calibrations enforced in phase2c.py: the "-" NFI option requires written rationale, Key Risk evaluates residual financial and NFI ratings only, and Category 1 acceptability is blocked when an action plan exists.',
  },
  {
    id: 'evolution-timeline',
    number: 6,
    indexLabel: '06',
    section: 'Model Performance Journey',
    title: 'Evolution from V1 Weak Baseline to V5 Multimodal Vision & Reranked Architecture',
    subtitle:
      'How five tracked engineering iterations resolved weak recall, scanned images, split tables, and schema errors into a multimodal banking architecture.',
    layout: 'evolution_timeline',
    jumpTarget: { label: 'Test the Upgraded AI Agent', page: 'agent' },
    presenterNotes:
      'This slide directly documents the journey requested by reviewers: tracing V1 (4301a33), V2 (8c5c335), V3 Hybrid RAG + Self-Critique (13160f5), V4 Bank Calibration (d8379bd), and V5 Multimodal Vision (ViT/Swin VLM) + Table Chunker + Stage-2 Reranker.',
  },
  {
    id: 'rag-hybrid-rrf',
    number: 7,
    indexLabel: '07',
    section: 'Hybrid Retrieval & Reranking',
    title: 'Inside Two-Stage Hybrid RAG: Tables + Vision OCR + RRF (k=60) + Stage-2 Reranker',
    subtitle:
      'How the retrieval pipeline combines table-preserving Markdown chunking, ViT/Swin multimodal OCR, BM25 + gemini-embedding-2 / 192-dim dense vectors via RRF (k=60), and Stage-2 precision reranking.',
    layout: 'rag_hybrid_rrf',
    jumpTarget: { label: 'Inspect Knowledge Base in Agent', page: 'agent' },
    presenterNotes:
      'Explain the upgraded V5 two-stage pipeline: table reconstruction + ViT/Swin visual parsing feed Stage-1 RRF (k=60) candidate generation (BM25 + gemini-embedding-2 vectors), followed by rerankCandidatesWithStage2 scoring multi-concept, code, and table fidelity.',
  },
  {
    id: 'llm-profiles-prompting',
    number: 8,
    indexLabel: '08',
    section: 'Model Tuning & Parsing',
    title: 'Dual Calibrated Model Profiles (Fast vs. Accurate) & Resilient JSON Parsing',
    subtitle:
      'Replacing undersized baseline inference with role-matched Qwen3 / Qwen3.5 profiles, gold-standard few-shot prompting, and fault-tolerant JSON recovery.',
    layout: 'llm_profiles_prompting',
    jumpTarget: { label: 'Compare Fast & Accurate Modes', page: 'agent' },
    presenterNotes:
      'Contrast Fast mode (qwen3:1.7b / LOW thinking for interactive Q&A) with Accurate mode (qwen3.5:4b / HIGH thinking, 4,096 tokens, 16 chunks) and show how parseResilientLlmJson safely strips <think> traces and repairs output syntax.',
  },
  {
    id: 'qa-self-critique',
    number: 9,
    indexLabel: '09',
    section: 'Output Quality Assurance',
    title: 'Dual Quality Gate: 8 Deterministic NBE Rules + Self-Refinement Critique Pass',
    subtitle:
      'Every AI proposal undergoes automated quality scoring (0–100), regulatory rule verification, and iterative refinement before reaching the Maker.',
    layout: 'qa_self_critique',
    jumpTarget: { label: 'Inspect Automated QA Scores', page: 'agent' },
    presenterNotes:
      'Review the 8 checks in evaluateAndRefineRcsaProposalQa—including stripping weak "Probability..." openers, verifying verbatim quotes, validating L1–L3 hierarchy, and triggering runLlmSelfCritiquePass in Accurate mode.',
  },
  {
    id: 'ai-security-lineage',
    number: 10,
    indexLabel: '10',
    section: 'AI Security & Data Lineage',
    title: 'Banking AI Guardrails: PII Redaction, Injection Quarantine & 5-Badge Lineage',
    subtitle:
      'Defense-in-depth aligned with OWASP LLM Top 10 and NIST AI RMF protecting customer identifiers, blocking embedded document attacks, and auditing every cell.',
    layout: 'ai_security_lineage',
    jumpTarget: { label: 'Inspect Central Audit Trail', page: 'audit' },
    presenterNotes:
      'Crucial for InfoSec review: redactBankingPii masks EG IBANs, 14-digit National IDs, and 16-digit PANs before inference; quarantinePromptInjection neutralizes untrusted SOP instructions; and 5 matrix provenance badges track human vs. AI edits.',
  },
  {
    id: 'before-after-metrics',
    number: 11,
    indexLabel: '11',
    section: 'Architectural Uplift',
    title: 'Verified Capability Comparison: V1 Baseline vs. V5 Multimodal Architecture',
    subtitle:
      'An honest, repository-verified before/after comparison across vision table extraction, two-stage reranking, reasoning depth, security, and regulatory alignment.',
    layout: 'before_after_metrics',
    presenterNotes:
      'Highlight concrete measurable changes implemented in code: 5.8x context expansion, multimodal ViT/Swin image & scanned-PDF understanding, header-preserving Markdown table chunking, Stage-2 precision reranking, and 15 forbidden fields stripped.',
  },
  {
    id: 'testing-roadmap',
    number: 12,
    indexLabel: '12',
    section: 'Verification & Production Readiness',
    title: 'Automated Verification & Vision/Reranker Benchmarks + Production Roadmap',
    subtitle:
      'Dual-stack TypeScript and Python test suites plus before-vs-after benchmarks verifying precision gains on scanned tables alongside an air-gapped banking roadmap.',
    layout: 'testing_roadmap',
    jumpTarget: { label: 'Review Units & Audit Trail', page: 'business-units' },
    presenterNotes:
      'Summarize verified test coverage across Python decimal formulas, PDF/table/image extraction, Stage-2 reranking uplift, official 29-column Excel export, and air-gapped Ollama/ViT scaling.',
  },
  {
    id: 'references',
    number: 13,
    indexLabel: '13',
    section: 'References & Sources',
    title: 'Research Papers, AI Governance Frameworks & Banking Regulatory Sources',
    subtitle:
      'Peer-reviewed publications, vision/reranking transformers, security standards, and primary NBE / CBE / Basel sources underpinning the platform design.',
    layout: 'references',
    presenterNotes:
      'Close with transparent attribution: Cormack et al. (2009) RRF, Robertson & Zaragoza (2009) BM25, Nogueira & Cho (2019) Reranking, Dosovitskiy et al. (2021) ViT, Liu et al. (2021) Swin, Madaan et al. (2023) Self-Refine, OWASP/NIST, and BCBS/CBE/NBE standards.',
    keyQuestion: 'What external research and standards validate the V5 multimodal architecture?',
    keyAnswer:
      'Two-stage retrieval pairs Cormack et al. (2009) RRF and Robertson & Zaragoza (2009) BM25 with Nogueira & Cho (2019) reranking; visual table parsing follows Dosovitskiy et al. (2021) ViT and Liu et al. (2021) Swin principles; and scoring enforces BCBS, CBE ESG, and official NBE RCSA rules.',
  },
];


