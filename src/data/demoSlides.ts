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
  | 'testing_roadmap';

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
  { code: 'L', labelAr: 'منخفض', rangeAr: 'حتى 150,000 ج.م', anchorEgp: '50,000' },
  { code: 'M', labelAr: 'متوسط', rangeAr: '150,001 – 500,000 ج.م', anchorEgp: '151,000' },
  { code: 'H', labelAr: 'مرتفع', rangeAr: '500,001 – 1,500,000 ج.م', anchorEgp: '501,000' },
  { code: 'VH', labelAr: 'مرتفع جداً', rangeAr: '1,500,001 – 3,000,000 ج.م', anchorEgp: '1,501,000' },
  { code: 'C', labelAr: 'كارثي / حرج', rangeAr: 'أكثر من 3,000,000 ج.م', anchorEgp: '3,001,000' },
] as const;

export const RRF_MATRIX_ROWS = [
  { methodAr: 'ضابط آلي (Automated)', preventive: '95%', detective: '85%', corrective: '50%' },
  { methodAr: 'ضابط شبه آلي (Semi-Auto)', preventive: '90%', detective: '80%', corrective: '40%' },
  { methodAr: 'ضابط يدوي (Manual)', preventive: '75%', detective: '60%', corrective: '30%' },
] as const;

export const MODEL_EVOLUTION_MILESTONES = [
  {
    stage: 'V1 · المرحلة الأولية',
    commitRef: 'Baseline (4301a33)',
    retrieval: 'بحث نصي مباشر بكلمات مفتاحية دون تطبيع جذري أو متجهات دلالية.',
    contextAndTokens: 'نافذة مقطع 240 حرفاً · استجابات محدودة ومقيدة بنماذج صغيرة (0.5B).',
    qaAndCompliance: 'استخلاص استرشادي أساسي؛ تعرض لتسرب أرقام الصفحات وبداية "احتمال...".',
    outcome: 'معدل استدعاء محدود وضعف في دقة الصياغة المصرفية وتغطية الجداول الطويلة.',
  },
  {
    stage: 'V2 · الذاكرة وتوسيع RAG',
    commitRef: 'Upgrade (8c5c335)',
    retrieval: 'إضافة BM25 وتفكيك الجذور العربية + 9 مجموعات مرادفات مصرفية ثنائية اللغة.',
    contextAndTokens: 'توسيع نافذة السياق إلى 1,400 حرف (×5.8) + رفع التوليد إلى 4,096 توكن.',
    qaAndCompliance: 'الانتقال إلى LLM-First Extraction + ذاكرة محادثة متعددة الأدوار (Multi-Turn).',
    outcome: 'قفزة كبيرة في فهم الفقرات الكاملة والردود التحليلية عبر أدوار الحوار.',
  },
  {
    stage: 'V3 · معمارية SOTA الهجينة',
    commitRef: 'SOTA (13160f5)',
    retrieval: 'Hybrid Vector (192-dim + gemini-embedding-2) + BM25 بدمج RRF (k=60).',
    contextAndTokens: 'وضعان معايران: سريع (qwen3:1.7b / LOW) ودقيق (qwen3.5:4b / HIGH) + Schema.',
    qaAndCompliance: 'تمريرتين QA Self-Critique (8 قواعد حتمية + مدقق ذاتي LLM) + معايرة الخسائر.',
    outcome: 'انضباط تام لصياغة المخاطر والضوابط وتقليص الأخطاء التركيبية بنسبة جذرية.',
  },
  {
    stage: 'V4 · المعايرة النهائية للبنك',
    commitRef: 'Client Calibration (d8379bd)',
    retrieval: 'ربط مباشر مع 84 عقدة بازل L1-L3 و34 حالة ESG CBE + وضع المصدر المزدوج.',
    contextAndTokens: 'حماية جدار الأمان: PII Redaction + Prompt Injection Quarantine + Strip Forbidden Fields.',
    qaAndCompliance: 'تصحيح Key Risk (المتبقي فقط)، "-" للبعد القضائي، توحيد فئات القبول 1–4، وتنبيه PDF المصور.',
    outcome: 'تطابق كامل مع ملاحظات مراجعي البنك الأهلي المصري واعتماد 82+87 اختبار تحقق.',
  },
] as const;

export const METHODOLOGY_SLIDES: MethodologySlide[] = [
  {
    id: 'deep-cover',
    number: 1,
    indexLabel: '01',
    section: 'المنهجية وهندسة النماذج',
    title: 'تشريح المنهجية المصرفية، هندسة النماذج، ورحلة تطوير الأداء (SOTA)',
    subtitle:
      'عرض تقني-منهجي معمق يوضح كيف تجمع المنصة بين محرك الاحتساب الحتمي (Python Decimal) ومعمارية الذكاء الهجين (Hybrid Vector+BM25 RRF + QA Self-Critique).',
    layout: 'deep_cover',
    jumpTarget: { label: 'فتح وكيل الذكاء الاصطناعي', page: 'agent' },
    presenterNotes:
      'هذا العرض موجه للجان المنهجية، التدقيق التقني، وفرق المخاطر والنماذج: يربط كل قاعدة من قواعد البنك الثمانية ومعادلات Excel بمكونات التنفيذ الفعلية، ويستعرض مسار التحسين من المرحلة V1 حتى V4 SOTA.',
    keyQuestion: 'ما المبدأ الهندسي الأساسي الذي بُنيت عليه المنصة؟',
    keyAnswer:
      'مبدأ الفصل الحاسم بين الفهم والاستخلاص (دور LLM/RAG) وبين الاحتساب والتصنيف والاعتماد (دور محرك بايثون الحتمي والإنسان).',
  },
  {
    id: 'dual-architecture',
    number: 2,
    indexLabel: '02',
    section: 'المعمارية الهجينة',
    title: 'المعمارية ثنائية المحرك: الذكاء اللغوي للاستخلاص والمحرك الحتمي للحساب',
    subtitle:
      'النموذج اللغوي لا يحسب أرقاماً ولا يحدد RRF ولا يعتمد مخاطرة؛ كل مخرجاته تمر بجدار تطهير قبل دخول محرك بايثون المعتمد.',
    layout: 'dual_architecture',
    jumpTarget: { label: 'استعراض مصفوفة RCSA', page: 'rcsa-table' },
    presenterNotes:
      'أشر إلى تدفق البيانات في الشريحة: المستندات تدخل الاستخلاص وRAG، ثم LLM يقترح نصوصاً مهيكلة بـ JSON Schema، ثم دالة stripForbiddenLlmFields تحذف قسراً أي درجات أو RRF قد يحاول النموذج كتابتها، وأخيراً يحسب Python Decimal القيم النهائية.',
    keyQuestion: 'ماذا يحدث لو حاول النموذج اللغوي كتابة تصنيف High أو RRF 95% في إجابته؟',
    keyAnswer:
      'تقوم دالة stripForbiddenLlmFields بإسقاط 15 حقلاً محظوراً فوراً وتسجيل الحادثة في السجل، ثم يُمرر الصف لمحرك بايثون للاحتساب الرسمي.',
  },
  {
    id: 'phase2a-financial',
    number: 3,
    indexLabel: '03',
    section: 'محرك الحسابات (Phase 2A)',
    title: 'المنهجية المالية والخطر الكامن: الشرائح الخمس، المراجع، ومعايرة الحوادث',
    subtitle:
      'احتساب دقيق باستخدام Decimal خالٍ من أخطاء الفاصلة العائمة، مطابق لصفحات المنهجية (3، 5، 6) وخلايا القالب الرسمي (EI880:EI884).',
    layout: 'phase2a_financial',
    jumpTarget: { label: 'رؤية تنبيهات المعايرة في اللوحة', page: 'dashboard' },
    presenterNotes:
      'اعرض جدول الشرائح الخمس والمبالغ المرجعية الرسمية (50K، 151K، 501K، 1,501K، 3,001K) التي تمنع القيم العشوائية مثل 250K، ثم اشرح كيف يقارن النظام التقدير بسجل الحوادث التاريخية للوحدة ويرفع تنبيهاً إذا قل عن 75%.',
  },
  {
    id: 'phase2b-controls',
    number: 4,
    indexLabel: '04',
    section: 'محرك الضوابط (Phase 2B)',
    title: 'تقييم الضوابط، مصفوفة 3×3 لمعامل الخفض (RRF)، والخطر المتبقي',
    subtitle:
      'تطبيق قاعدة أعلى معامل خفض مؤهل (MAX RRF) للضوابط المنفذة ذات الصلة فقط، مع استبعاد الضوابط المقترحة (0%) وتوحيد الدوريات السبع.',
    layout: 'phase2b_controls',
    jumpTarget: { label: 'مراجعة الضوابط في المصفوفة', page: 'rcsa-table' },
    presenterNotes:
      'تأكد من إبراز المصفوفة 3×3 بالكامل (Automated 95/85/50 · Semi-Auto 90/80/40 · Manual 75/60/30) والتأكيد على أننا نأخذ MAX وليس الجمع، وأن الضابط المقترح مستقبلاً لا يخفض الخطر الحالي، مع تنظيف نص الضابط من عبارات النوع والآلية.',
  },
  {
    id: 'phase2c-nfi-esg',
    number: 5,
    indexLabel: '05',
    section: 'الحوكمة المنهجية (Phase 2C)',
    title: 'مصفوفة الشريحة 4 (NFI 4×5)، تصنيف بازل (84)، ESG (34)، وقاعدة Key Risk',
    subtitle:
      'تحقق حتمي من الأدلة لكل بُعد غير مالي، تطبيق مبدأ الأكثر تحوطاً، وحساب Key Risk حصرياً من الأثر المتبقي بعد الضوابط.',
    layout: 'phase2c_nfi_esg',
    jumpTarget: { label: 'فتح إعداد التقييم الموجه', page: 'backend-rcsa' },
    presenterNotes:
      'سلط الضوء على إصلاحات المراجعين في phase2c.py: خيار "-" يتطلب مبرراً مكتوباً لعدم التعرض، قاعدة Key Risk تفحص residual_financial_rating وNFI فقط (وليس الكامن)، ويمنع النظام اختيار الفئة (1) مقبولة مع وجود خطة تصحيحية.',
  },
  {
    id: 'evolution-timeline',
    number: 6,
    indexLabel: '06',
    section: 'رحلة تطوير النماذج',
    title: 'رحلة ترقية أداء النماذج: من الأداء المحدود (V1) إلى معمارية SOTA (V4)',
    subtitle:
      'توثيق المراحل الأربع التي عالجت ضعف الاستخلاص الأولي عبر ترقية الاسترجاع، حجم السياق، النماذج، وخطوة التدقيق الذاتي.',
    layout: 'evolution_timeline',
    jumpTarget: { label: 'تجربة الوكيل المحدّث', page: 'agent' },
    presenterNotes:
      'هذه الشريحة تجيب مباشرة عن سؤال: ماذا غيّرنا عندما لاحظنا ضعف أداء النموذج؟ اتبع الجدول من V1 (نافذة 240 حرفاً + بحث حرفي + 0.5B) إلى V2 (8c5c335) إلى V3 SOTA (13160f5) ثم V4 معايرة البنك (d8379bd).',
  },
  {
    id: 'rag-hybrid-rrf',
    number: 7,
    indexLabel: '07',
    section: 'تطوير البحث والاسترجاع',
    title: 'تشريح محرك Hybrid RAG: إصلاح العربية + BM25 IDF + متجهات + دمج RRF',
    subtitle:
      'كيف نجح النظام في استرجاع الفقرات والجداول العربية والإنجليزية بدقة عالية وتجاوز مشكلات كسور PDF ومرادفات المصارف.',
    layout: 'rag_hybrid_rrf',
    jumpTarget: { label: 'فحص قاعدة المعرفة في الوكيل', page: 'agent' },
    presenterNotes:
      'اشرح المسارين المتوازيين في rag-service.ts: مسار BM25 المعزز بـ 30+ قاعدة إصلاح للام-ألف (مثل المالحظة ← الملاحظة) و9 مجموعات مرادفات مصرفية، ومسار المتجهات الهجين (192-dim محلي + gemini-embedding-2 مخزن في SQLite)، ثم دمجهما بمعادلة RRF (k=60).',
  },
  {
    id: 'llm-profiles-prompting',
    number: 8,
    indexLabel: '08',
    section: 'ترقية النماذج والتوجيه',
    title: 'هندسة النماذج الثنائية (سريع / دقيق)، Few-Shot Gold Standard، وتنقية JSON',
    subtitle:
      'استبدال النماذج الضعيفة بملفين مضبوطين بدقة وتوجيه صارم مقترن بمثال مرجعي ذهبي ومحلل JSON مقاوم لأخطاء التوليد.',
    layout: 'llm_profiles_prompting',
    jumpTarget: { label: 'مقارنة الوضع السريع والدقيق', page: 'agent' },
    presenterNotes:
      'وضّح لماذا غيّرنا الإعداد من نموذج 0.5B قديم إلى ملفين متدرجين (qwen3:1.7b / LOW للاستعلام الفوري، وqwen3.5:4b / HIGH للتحليل العميق 4096 توكن)، وكيف تضمن generateStructuredRcsaProposalsWithLlm مخرجات JSON صالحة عبر parseResilientLlmJson.',
  },
  {
    id: 'qa-self-critique',
    number: 9,
    indexLabel: '09',
    section: 'التدقيق الذاتي وجودة المخرجات',
    title: 'بوابة الجودة المزدوجة (QA Self-Critique): 8 قواعد فحص وإصلاح تلقائي',
    subtitle:
      'مراجعة ذاتية مزدوجة (نموذج مدقق + فاحص حتمي من 8 قواعد) تنظف كل مقترح وتتحقق من تاريخ الخسائر قبل عرضه للموظف.',
    layout: 'qa_self_critique',
    jumpTarget: { label: 'معاينة التقييم الآلي للمقترحات', page: 'agent' },
    presenterNotes:
      'استعرض القواعد الثماني في evaluateAndRefineRcsaProposalQa وكيف تمنع أكثر أخطاء النماذج شيوعاً: بدء الوصف بـ"احتمال"، تسرب رقم الصفحة، الخروج عن الأهداف الاستراتيجية الـ5، واستخدام Per Transaction.',
  },
  {
    id: 'ai-security-lineage',
    number: 10,
    indexLabel: '10',
    section: 'أمن النماذج وتتبع المصدر',
    title: 'أمن الذكاء الاصطناعي المصرفي: حماية PII، صد حقن الأوامر، وتتبع النسب',
    subtitle:
      'دفاعات أمان متعددة الطبقات تحمي بيانات عملاء البنك وتمنع التلاعب بالوثائق وتوثق أصل كل خلية أمام المراجع.',
    layout: 'ai_security_lineage',
    jumpTarget: { label: 'مراجعة سجل التدقيق المركزي', page: 'audit' },
    presenterNotes:
      'هذه الشريحة أساسية لفرق أمن المعلومات والالتزام: redactBankingPii يطمس IBAN والرقم القومي والبطاقات، quarantinePromptInjection يعزل أي أوامر خبيثة داخل الملفات المرفوعة، مع حارس PDF المصور (سكان) وأوسمة التمييز الخمسة.',
  },
  {
    id: 'before-after-metrics',
    number: 11,
    indexLabel: '11',
    section: 'تقييم التحسن',
    title: 'أثر الترقية: مقارنة قدرات النموذج وجودة المخرجات قبل التطوير وبعد SOTA',
    subtitle:
      'قياس واضح للفارق العملي عبر 6 محاور هندسية ومنهجية تفسر القفزة في دقة الاستخلاص وثبات المصفوفة النهائية.',
    layout: 'before_after_metrics',
    presenterNotes:
      'راجع الجدول المقارن: نافذة السياق زادت من 240 إلى 1400 حرف (×5.8)، حد التوليد ارتفع إلى 4096 توكن، الاسترجاع تحول لدمج Vector+BM25 RRF، ودخلت بوابة QA ذات الـ8 قواعد لإغلاق فجوات الالتزام المنهجي.',
  },
  {
    id: 'testing-roadmap',
    number: 12,
    indexLabel: '12',
    section: 'التحقق والجودة والجاهزية',
    title: 'حوكمة التحقق الشامل (169+ اختبار تحقق) وخارطة الجاهزية الإنتاجية للبنك',
    subtitle:
      'ضمان جودة عبر حزم اختبارات آلية مزدوجة (Node.js + Python Decimal) وفحص متصفح حقيقي، مع مسار واضح للنشر داخل البنية المصرفية.',
    layout: 'testing_roadmap',
    jumpTarget: { label: 'مراجعة الوحدات وسجل التدقيق', page: 'business-units' },
    presenterNotes:
      'اختم بملخص التحقق الهندسي الفعلي: 82 اختبار Node.js + 87 اختبار Python unittest + TypeScript check + Playwright verification، ثم وضح متطلبات الانتقال من بيئة التقييم إلى بيئة البنك الإنتاجية (Ollama محلي + WORM Storage + OCR).',
  },
];

