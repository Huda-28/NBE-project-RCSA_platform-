import React, { useState, useEffect, useCallback } from 'react';
import {
  ChevronRight,
  ChevronLeft,
  LayoutGrid,
  FileDown,
  MessageSquareText,
  ArrowUpLeft,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  Calculator,
  Bot,
  FileSpreadsheet,
  FileText,
  Building2,
  History,
  UserCheck,
  Maximize2,
  Minimize2,
  Layers,
  Clock,
  Sparkles,
  AlertTriangle,
} from 'lucide-react';
import {
  DEMO_SLIDES,
  ROLE_MATRIX_SUMMARY,
  DemoSlide,
  METHODOLOGY_SLIDES,
  MethodologySlide,
} from '../data/demoSlides.js';
import type { PageId } from '../components/Sidebar.js';
import type { AppNavigationState } from '../App.js';
import { HoverTooltip } from '../components/HoverTooltip.js';
import { MethodologySlideBody } from '../components/MethodologySlidesRenderer.js';

export type DemoDeckKind = 'executive' | 'methodology';

interface DemoPresentationPageProps {
  onNavigate?: (next: Partial<AppNavigationState> & { page: PageId }) => void;
}

export const DemoPresentationPage: React.FC<DemoPresentationPageProps> = ({ onNavigate }) => {
  const [activeDeck, setActiveDeck] = useState<DemoDeckKind>(() => {
    if (typeof window !== 'undefined') {
      const deckParam = new URLSearchParams(window.location.search).get('deck');
      if (deckParam === 'methodology') return 'methodology';
    }
    return 'executive';
  });
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showNotes, setShowNotes] = useState(true);
  const [showOverview, setShowOverview] = useState(false);
  const [isFocusMode, setIsFocusMode] = useState(false);

  const activeSlides: Array<DemoSlide | MethodologySlide> =
    activeDeck === 'executive' ? DEMO_SLIDES : METHODOLOGY_SLIDES;
  const slide = activeSlides[currentIndex] || activeSlides[0];
  const totalSlides = activeSlides.length;

  const handleSelectDeck = useCallback((deck: DemoDeckKind) => {
    setActiveDeck(deck);
    setCurrentIndex(0);
    setShowOverview(false);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (deck === 'methodology') {
        url.searchParams.set('deck', 'methodology');
      } else {
        url.searchParams.delete('deck');
      }
      window.history.replaceState({}, '', url.toString());
    }
  }, []);

  const goNext = useCallback(() => {
    setCurrentIndex((prev) => Math.min(totalSlides - 1, prev + 1));
  }, [totalSlides]);

  const goPrev = useCallback(() => {
    setCurrentIndex((prev) => Math.max(0, prev - 1));
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;

      const isMethodology = activeDeck === 'methodology';
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (isMethodology) goPrev();
        else goNext();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (isMethodology) goNext();
        else goPrev();
      } else if (e.key === 'g' || e.key === 'G') {
        setShowOverview((prev) => !prev);
      } else if (e.key === 'n' || e.key === 'N') {
        setShowNotes((prev) => !prev);
      } else if (e.key === 'Escape') {
        setShowOverview(false);
        setIsFocusMode(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeDeck, goNext, goPrev]);

  const renderSlideBody = (activeSlide: DemoSlide) => {
    switch (activeSlide.layout) {
      case 'cover':
        return (
          <div className="space-y-6">
            <div className="bg-[#09331F] text-white rounded-2xl p-6 sm:p-9 border border-[#006547] relative overflow-hidden">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div className="space-y-4 max-w-2xl">
                  <div className="inline-flex items-center gap-2 text-xs font-bold text-[#F79C1E] tracking-wide">
                    <ShieldCheck className="w-4 h-4 shrink-0" />
                    <span>العرض التعريفي التنفيذي للمراجعين والإدارات المصرفية</span>
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-extrabold leading-snug text-white">
                    {activeSlide.title}
                  </h2>
                  <p className="text-sm sm:text-base text-emerald-100/90 leading-relaxed">
                    {activeSlide.subtitle}
                  </p>
                </div>

                <div className="shrink-0 bg-white/10 border border-white/15 rounded-2xl p-5 flex flex-col items-center justify-center min-w-[210px]">
                  <img
                    src="/assets/nbe-logo-white.png"
                    alt="البنك الأهلي المصري"
                    className="h-14 w-auto object-contain mb-3"
                  />
                  <div className="text-xs font-bold text-emerald-100">قطاع المخاطر التشغيلية</div>
                  <div className="text-[11px] text-[#F79C1E] mt-0.5 font-mono tabular-nums">
                    NBE RCSA · 2026
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-7 pt-6 border-t border-white/15">
                {[
                  { num: '29', unit: 'عموداً معتمداً', desc: 'نموذج البنك الرسمي من C إلى AE' },
                  { num: '84', unit: 'تصنيف بازل', desc: 'تغطية كاملة للمستويات L1 / L2 / L3' },
                  { num: '34', unit: 'حالة استدامة', desc: 'كتالوج المخاطر البيئية والاجتماعية CBE' },
                  { num: '4', unit: 'أدوار حوكمة', desc: 'فصل كامل بين المعد والمراجع والمدقق' },
                ].map((stat) => (
                  <div
                    key={stat.unit}
                    className="bg-[#062315]/75 border border-white/15 rounded-xl p-3.5"
                  >
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-extrabold font-mono tabular-nums text-[#F79C1E]">
                        {stat.num}
                      </span>
                      <span className="text-xs font-bold text-white">{stat.unit}</span>
                    </div>
                    <p className="text-[11px] text-emerald-100/80 mt-1 leading-relaxed">
                      {stat.desc}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                {
                  title: 'لغة مصرفية واضحة بدون تعقيد تقني',
                  body: 'يشرح هذا العرض كل شاشة، وكل معادلة مالية، وكل خطوة مراجعة بالطريقة التي يعتمدها مراجع البنك.',
                },
                {
                  title: 'معاينة وتجربة حية أثناء الجلسة',
                  body: 'يمكن الانتقال مباشرة من أي شريحة إلى الشاشة الفعلية في المنصة لتجربتها أمام الحضور.',
                },
                {
                  title: 'تغطية شاملة لمتطلبات المراجعين',
                  body: 'يوضح كيف تم تنفيذ قواعد Key Risk وNFI 4×5 وESG والمصادر المزدوجة وأدوات الشرح التفاعلي.',
                },
              ].map((card) => (
                <div
                  key={card.title}
                  className="bg-[#F8F8F6] border border-[#DCDAD5] rounded-xl p-4"
                >
                  <div className="text-sm font-extrabold text-[#09331F]">{card.title}</div>
                  <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">{card.body}</p>
                </div>
              ))}
            </div>
          </div>
        );

      case 'comparison':
        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-rose-50/50 border border-rose-200 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-rose-200 pb-3">
                <div>
                  <div className="text-[11px] font-bold text-rose-700">الوضع التقليدي السابق</div>
                  <h3 className="text-base font-extrabold text-rose-950 mt-0.5">
                    العمل اليدوي بملفات Excel المتفرقة
                  </h3>
                </div>
                <XCircle className="w-6 h-6 text-rose-600 shrink-0" />
              </div>
              <ul className="space-y-3 text-xs text-slate-800">
                {[
                  {
                    head: 'احتمالية أخطاء المعادلات',
                    text: 'أي تعديل غير مقصود في خلية أو صيغة داخل Excel قد يغيّر تصنيف الخطر دون تنبيه.',
                  },
                  {
                    head: 'صعوبة إثبات من عدّل ماذا ومتى',
                    text: 'تداول الملفات عبر البريد الإلكتروني يضيع تسلسل الملاحظات وقرارات القبول والرفض.',
                  },
                  {
                    head: 'اختلاف تصنيف الإدارات للمخاطر المتشابهة',
                    text: 'صعوبة توحيد تصنيف بازل (L1–L3) وبنود الاستدامة (ESG) بين عشرات الإدارات يدوياً.',
                  },
                  {
                    head: 'مجهود مضاعف في تجميع تقارير الإدارة العليا',
                    text: 'إعداد خريطة المخاطر الإجمالية 5×5 ومقارنة الدورات السابقة يستغرق أياماً من التجميع.',
                  },
                ].map((item) => (
                  <li key={item.head} className="bg-white border border-rose-100 rounded-xl p-3">
                    <div className="font-bold text-rose-900">{item.head}</div>
                    <div className="text-slate-600 mt-1 leading-relaxed">{item.text}</div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-emerald-50/50 border border-[#006547]/30 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-[#006547]/20 pb-3">
                <div>
                  <div className="text-[11px] font-bold text-[#006547]">المنظومة الجديدة</div>
                  <h3 className="text-base font-extrabold text-[#09331F] mt-0.5">
                    منصة RCSA المركزية بالبنك الأهلي المصري
                  </h3>
                </div>
                <CheckCircle2 className="w-6 h-6 text-[#006547] shrink-0" />
              </div>
              <ul className="space-y-3 text-xs text-slate-800">
                {[
                  {
                    head: 'حسابات بنكية حتمية موحدة',
                    text: 'المعادلات محمية في محرك حسابات مركزي يحسب الخسارة الكامنة ومعامل الضوابط والمتبقي بدقة 100%.',
                  },
                  {
                    head: 'سجل تدقيق شامل وأرشفة محمية',
                    text: 'كل تعديل أو قرار اعتماد أو إعادة يوثّق باسم الموظف والتوقيت والقيمة قبل وبعد التعديل.',
                  },
                  {
                    head: 'مساعد ذكي يقرأ السياسات والحوادث',
                    text: 'يقرأ المستندات ويقترح المخاطر والضوابط وتصنيف بازل وESG مع إظهار رقم الصفحة والفقرة.',
                  },
                  {
                    head: 'لوحة قيادة وتقارير رسمية فورية',
                    text: 'لوحة معلومات 5×5 لحظية، ومقارنة بين الدورات، وتصدير Excel (29 عموداً) وPDF الرسمي بضغطة زر.',
                  },
                ].map((item) => (
                  <li
                    key={item.head}
                    className="bg-white border border-emerald-200/80 rounded-xl p-3"
                  >
                    <div className="font-bold text-[#09331F]">{item.head}</div>
                    <div className="text-slate-600 mt-1 leading-relaxed">{item.text}</div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        );

      case 'workflow':
        return (
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
              {[
                {
                  step: '01',
                  title: 'تحديد الوحدة ومصدر البيانات',
                  role: 'مُعد التقييم (Maker)',
                  desc: 'اختيار الإدارة المعنية وبدء التقييم إما من مستندات جديدة أو استكمال دورة سابقة أو الدمج بينهما.',
                },
                {
                  step: '02',
                  title: 'قراءة الوثائق والاقتراح الذكي',
                  role: 'الوكيل الذكي + الموظف',
                  desc: 'رفع السياسات وتقارير الحوادث والتدقيق؛ يقترح الوكيل المخاطر مع الدليل ويختار الموظف ما يقبله.',
                },
                {
                  step: '03',
                  title: 'الضوابط وNFI والحساب الآلي',
                  role: 'محرك الحسابات المعتمد',
                  desc: 'استيفاء الأثر المالي، تقييم فاعلية الضوابط 3×3، الأثر غير المالي NFI، ومعيار ESG ثم الحساب الآلي.',
                },
                {
                  step: '04',
                  title: 'المراجعة والاعتماد المستقل',
                  role: 'المراجع المستقل (Checker)',
                  desc: 'فحص التعديلات وخطط المعالجة، ثم الاعتماد النهائي أو الإعادة للمعد بملاحظات موثقة إلزامياً.',
                },
                {
                  step: '05',
                  title: 'القفل والتصدير الرسمي',
                  role: 'المخرجات والرقابة',
                  desc: 'حفظ النسخة كمرجع تاريخي غير قابل للتعديل مع إتاحة تصدير Excel الرسمي وتقرير PDF المعتمد.',
                },
              ].map((item) => (
                <div
                  key={item.step}
                  className="bg-white border border-[#DCDAD5] rounded-2xl p-4 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-3 pb-2 border-b border-[#EFECE6]">
                      <span className="text-xl font-extrabold font-mono tabular-nums text-[#006547]">
                        {item.step}
                      </span>
                      <span className="text-[11px] font-bold text-[#9A5B00]">
                        {item.role}
                      </span>
                    </div>
                    <h4 className="text-sm font-extrabold text-[#09331F] leading-snug">
                      {item.title}
                    </h4>
                    <p className="text-xs text-slate-600 mt-2 leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-[#F8F8F6] border border-[#DCDAD5] rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-xs text-slate-700 leading-relaxed">
                <strong className="text-[#09331F]">نقطة حوكمة مهمة للمراجع:</strong> لا يمكن
                لأي نسخة معتمدة أن تتغير لاحقاً؛ بل عند بدء دورة جديدة تُنشأ{' '}
                <strong>نسخة مسودة مستقلة</strong> مرتبطة بالنسخة السابقة كمرجع تاريخي.
              </div>
              <div className="text-xs font-bold font-mono tabular-nums text-[#006547] shrink-0">
                DRAFT → IN_REVIEW → APPROVED (مقفل)
              </div>
            </div>
          </div>
        );

      case 'roles':
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {ROLE_MATRIX_SUMMARY.map((role) => (
                <div
                  key={role.roleEn}
                  className="bg-white border border-[#DCDAD5] rounded-2xl p-4 sm:p-5 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-3 pb-3 border-b border-[#EFECE6]">
                      <div>
                        <h3 className="text-base font-extrabold text-[#09331F]">{role.roleAr}</h3>
                        <div className="text-xs text-slate-500 mt-0.5">
                          حساب العرض: <strong className="text-slate-800">{role.demoUser}</strong> ·{' '}
                          <span className="font-mono tabular-nums text-[#006547]">
                            {role.employeeId}
                          </span>
                        </div>
                      </div>
                      <span className="text-xs font-mono font-bold text-[#09331F] bg-[#F8F8F6] border border-[#DCDAD5] px-2.5 py-1 rounded-lg shrink-0">
                        {role.roleEn}
                      </span>
                    </div>

                    <div className="text-xs text-[#006547] font-bold mt-3">
                      النطاق: {role.scope}
                    </div>

                    <ul className="mt-2.5 space-y-1.5 text-xs text-slate-700">
                      {role.permissions.map((perm) => (
                        <li key={perm} className="flex items-start gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#006547] shrink-0 mt-0.5" />
                          <span>{perm}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="mt-4 pt-2.5 border-t border-rose-100 text-[11px] font-bold text-rose-800 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-rose-700 shrink-0" />
                    <span>قيد الحوكمة: {role.restriction}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );

      case 'dashboard':
        return (
          <div className="space-y-5">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {[
                { label: 'إجمالي المخاطر المرصودة', desc: 'عدد المخاطر التشغيلية عبر الوحدات المصرح بها للمستخدم.' },
                { label: 'المخاطر الرئيسية (Key Risks)', desc: 'فقط المخاطر التي يظل أثرها المتبقي أو غير المالي مرتفعاً (H / VH / C).' },
                { label: 'الخسارة السنوية الكامنة (EAL)', desc: 'إجمالي الخسائر المالية المتوقعة قبل تطبيق أي ضوابط رقابية.' },
                { label: 'الخسارة المتبقية بعد الضوابط', desc: 'التعرض المالي المتبقي فعلياً بعد خصم فاعلية الضوابط المنفذة.' },
                { label: 'نسبة خفض المخاطرة', desc: 'النسبة المئوية للوفر المالي الذي حققته الضوابط القائمة للبنك.' },
              ].map((kpi, idx) => (
                <div
                  key={kpi.label}
                  className="bg-[#F8F8F6] border border-[#DCDAD5] rounded-xl p-3.5"
                >
                  <div className="text-[11px] font-mono font-bold text-[#006547] tabular-nums">
                    KPI 0{idx + 1}
                  </div>
                  <div className="text-xs font-extrabold text-[#09331F] mt-1 leading-snug">
                    {kpi.label}
                  </div>
                  <p className="text-[11px] text-slate-600 mt-1.5 leading-relaxed">{kpi.desc}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2 bg-white border border-[#DCDAD5] rounded-2xl p-5 space-y-3">
                <h3 className="text-sm font-extrabold text-[#09331F]">
                  الخريطة الحرارية التفاعلية 5×5 (الكامن مقابل المتبقي)
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  تعرض مصفوفة من 25 خلية (الأثر من VL إلى C × الاحتمالية من 1 إلى 5) لتوضح لإدارة المخاطر
                  كيف انتقلت المخاطر من المنطقة الحمراء الكامنة إلى المنطقة الخضراء أو الصفراء بعد تطبيق الضوابط.
                </p>
                <div className="grid grid-cols-5 gap-1.5 pt-1 text-center text-[11px] font-bold">
                  {[
                    { code: 'VL', color: 'bg-emerald-50 border-emerald-200 text-emerald-900', label: 'منخفض جداً' },
                    { code: 'L', color: 'bg-emerald-100/70 border-emerald-300 text-emerald-950', label: 'منخفض' },
                    { code: 'M', color: 'bg-amber-50 border-amber-300 text-amber-950', label: 'متوسط' },
                    { code: 'H', color: 'bg-orange-100 border-orange-300 text-orange-950', label: 'مرتفع' },
                    { code: 'VH / C', color: 'bg-rose-100 border-rose-300 text-rose-950', label: 'حرج / رئيسي' },
                  ].map((cell) => (
                    <div key={cell.code} className={`rounded-lg border p-2.5 ${cell.color}`}>
                      <div className="font-mono">{cell.code}</div>
                      <div className="text-[10px] font-semibold mt-0.5">{cell.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-amber-50/60 border border-amber-300 rounded-2xl p-5 flex flex-col justify-between space-y-3">
                <div>
                  <div className="flex items-center gap-2 text-amber-900 font-extrabold text-sm">
                    <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                    <span>تنبيهات معايرة الخسائر التاريخية</span>
                  </div>
                  <p className="text-xs text-slate-700 mt-2 leading-relaxed">
                    تقارن اللوحة تلقائياً بين التقدير السنوي الذي أدخلته الوحدة وبين سجل الخسائر الفعلية التاريخية للبنك.
                  </p>
                </div>
                <div className="bg-white border border-amber-200 rounded-xl p-3 text-xs text-slate-700 leading-relaxed">
                  <strong>فائدة عملية:</strong> إذا وُجد خطر قُدّرت خسارته بأقل مما حدث فعلياً في التاريخ المصرفي،
                  يرفع النظام تنبيهاً فورياً للمراجع.
                </div>
              </div>
            </div>
          </div>
        );

      case 'sources':
        return (
          <div className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                {
                  badge: 'الخيار الأول',
                  title: 'مستندات جديدة فقط',
                  when: 'عند تقييم منتج جديد أو سياسة مستحدثة لا يوجد لها تقييم سابق.',
                  steps: 'يرفع المعد مستندات السياسة والإجراءات، فيبني النظام مسودة التقييم من الصفر.',
                },
                {
                  badge: 'الخيار الثاني',
                  title: 'استكمال وتحديث تقييم الوحدة السابق',
                  when: 'في الدورات الدورية السنوية أو ربع السنوية لنفس الإدارة.',
                  steps: 'تُستورد آخر نسخة معتمدة أو مسودة كنسخة جديدة قابلة للتحديث مع بقاء الأصل المعتَمد مقفلاً.',
                },
                {
                  badge: 'الخيار الثالث · الأحدث',
                  title: 'المصدر المزدوج (مستندات + بيانات سابقة)',
                  when: 'عند تحديث تقييم العام الماضي مع ظهور تقارير تدقيق أو حوادث جديدة.',
                  steps: 'يدمج النظام التقييم السابق مع المستندات المرفوعة ليكتشف المخاطر المستجدة ويقارنها.',
                },
              ].map((mode) => (
                <div
                  key={mode.title}
                  className="bg-white border border-[#DCDAD5] rounded-2xl p-5 flex flex-col justify-between space-y-3"
                >
                  <div>
                    <div className="text-xs font-extrabold text-[#006547]">{mode.badge}</div>
                    <h3 className="text-base font-extrabold text-[#09331F] mt-1">{mode.title}</h3>
                    <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                      <strong className="text-slate-800">متى نستخدمه؟ </strong>
                      {mode.when}
                    </p>
                  </div>
                  <div className="bg-[#F8F8F6] border border-[#EFECE6] rounded-xl p-3 text-xs text-slate-700 leading-relaxed">
                    {mode.steps}
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-[#09331F] text-white rounded-2xl p-4 sm:p-5">
              <div className="text-xs font-bold text-[#F79C1E] mb-3">
                خطوات المعالج الموجه (Guided Wizard · 6 خطوات لا تترك حقلاً منسياً):
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 text-center text-xs">
                {[
                  '1. الوحدة ومصدر البيانات',
                  '2. رفع وفهرسة المستندات',
                  '3. مراجعة المخاطر والضوابط',
                  '4. استيفاء الحقول المفقودة',
                  '5. الحساب المنهجي الآلي',
                  '6. فتح مصفوفة الـ 29 عموداً',
                ].map((step) => (
                  <div
                    key={step}
                    className="bg-white/10 border border-white/15 rounded-xl px-2.5 py-2.5 font-bold"
                  >
                    {step}
                  </div>
                ))}
              </div>
            </div>
          </div>
        );

      case 'agent':
        return (
          <div className="space-y-5">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="bg-white border border-[#DCDAD5] rounded-2xl p-5 space-y-3">
                <div className="flex items-center gap-2 text-[#09331F] font-extrabold text-sm">
                  <FileText className="w-4 h-4 text-[#006547]" />
                  <span>1. قراءة وفهم المستندات المتنوعة</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  يقبل المنفذ الصيغ المستخدمة داخل البنك يومياً:
                </p>
                <div className="text-xs font-mono font-bold text-[#09331F] bg-[#F8F8F6] border border-[#DCDAD5] rounded-xl p-3 leading-relaxed">
                  PDF · Word (DOCX) · Excel (XLSX) · CSV · PowerPoint · JSON · XML
                </div>
                <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-2.5 leading-relaxed">
                  <strong>حماية الدقة:</strong> عند رفع ملف PDF مصوّر (سكان) دون نص قابل للقراءة،
                  ينبه النظام الموظف فوراً بضرورة المراجعة البشرية.
                </p>
              </div>

              <div className="bg-white border border-[#DCDAD5] rounded-2xl p-5 space-y-3">
                <div className="flex items-center gap-2 text-[#09331F] font-extrabold text-sm">
                  <Bot className="w-4 h-4 text-[#006547]" />
                  <span>2. وضعان للعمل + مطابقة قواعد البنك</span>
                </div>
                <div className="space-y-2.5 text-xs">
                  <div className="bg-[#F8F8F6] border border-[#DCDAD5] rounded-xl p-3">
                    <div className="font-extrabold text-[#09331F]">الوضع السريع</div>
                    <div className="text-slate-600 mt-1">
                      للأسئلة المباشرة والاستفسارات والملخصات السريعة من السياسات المرفوعة.
                    </div>
                  </div>
                  <div className="bg-emerald-50/70 border border-[#006547]/30 rounded-xl p-3">
                    <div className="font-extrabold text-[#09331F]">الوضع الدقيق</div>
                    <div className="text-slate-600 mt-1">
                      لاستخلاص صفوف التقييم بدقة عالية مع خطوة فحص جودة ذاتي ومطابقة{' '}
                      <strong>84 بند بازل</strong> و<strong>34 حالة ESG</strong>.
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white border border-[#DCDAD5] rounded-2xl p-5 space-y-3 flex flex-col justify-between">
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2 text-[#09331F] font-extrabold text-sm">
                    <UserCheck className="w-4 h-4 text-[#006547]" />
                    <span>3. الرقابة البشرية الكاملة (لا قرار تلقائياً)</span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    كل مقترح من الوكيل يعرض <strong>الدليل المقتبس واسم الملف ورقم الصفحة</strong>، ولا يدخل
                    المسودة الرسمية إلا بعد قرار الموظف:
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-xs font-extrabold">
                  <div className="bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-xl py-2.5">
                    قبول
                  </div>
                  <div className="bg-amber-50 border border-amber-300 text-amber-900 rounded-xl py-2.5">
                    تعديل
                  </div>
                  <div className="bg-rose-50 border border-rose-300 text-rose-900 rounded-xl py-2.5">
                    رفض
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      case 'calculations':
        return (
          <div className="space-y-5">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="bg-white border border-[#DCDAD5] rounded-2xl p-5 space-y-2.5">
                <div className="text-xs font-mono font-bold text-[#006547]">المرحلة 1 · الخطر الكامن</div>
                <h3 className="text-sm font-extrabold text-[#09331F]">الخسارة السنوية الكامنة (EAL)</h3>
                <div className="bg-[#F8F8F6] border border-[#DCDAD5] rounded-xl p-3 text-xs font-bold text-[#09331F]">
                  الخسارة الكامنة = متوسط الأثر المالي × معدل التكرار السنوي
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  يُصنّف النظام الناتج تلقائياً على مصفوفة <strong>5×5</strong> لتحديد درجة الخطر الكامن
                  (<span className="font-mono">VL, L, M, H, VH, C</span>).
                </p>
              </div>

              <div className="bg-white border border-[#DCDAD5] rounded-2xl p-5 space-y-2.5">
                <div className="text-xs font-mono font-bold text-[#006547]">المرحلة 2 · الضوابط الرقابية 3×3</div>
                <h3 className="text-sm font-extrabold text-[#09331F]">أعلى معامل خفض مؤهل (MAX RRF)</h3>
                <div className="bg-[#F8F8F6] border border-[#DCDAD5] rounded-xl p-3 text-xs text-slate-700 leading-relaxed">
                  تقاطع <strong>كفاءة التصميم × الالتزام بالتنفيذ</strong> يحدد نسبة الخفض، مع أخذ{' '}
                  <strong>أعلى ضابط منفذ فعلياً</strong> يغطي الخطر.
                </div>
                <p className="text-xs text-rose-800 font-bold leading-relaxed">
                  قاعدة صارمة: أي ضابط حالته &quot;مقترح&quot; (Proposed) أو خارج النطاق يُمنح 0% خفض حالياً.
                </p>
              </div>

              <div className="bg-white border border-[#DCDAD5] rounded-2xl p-5 space-y-2.5">
                <div className="text-xs font-mono font-bold text-[#006547]">المرحلة 3 · الخطر المتبقي</div>
                <h3 className="text-sm font-extrabold text-[#09331F]">الخسارة والتصنيف المتبقي</h3>
                <div className="bg-emerald-50 border border-[#006547]/30 rounded-xl p-3 text-xs font-bold text-[#09331F]">
                  الخسارة المتبقية = الخسارة الكامنة × (1 − نسبة الخفض)
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  إذا بقي الخطر مرتفعاً عن حد التحمل البنكي، يطلب النظام تلقائياً إدراج{' '}
                  <strong>خطة معالجة (Action Plan)</strong>.
                </p>
              </div>
            </div>

            <div className="bg-[#09331F] text-white rounded-2xl p-5">
              <div className="text-xs font-bold text-[#F79C1E] mb-3">
                مثال رقمي مبسط من بيئة البنك (بدون أي تعقيد برمجي):
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
                <div className="bg-white/10 border border-white/15 rounded-xl p-3">
                  <div className="text-emerald-200">1. المعطيات</div>
                  <div className="font-bold mt-1 font-mono tabular-nums">
                    أثر 200,000 جم × تكرار 3/سنة
                  </div>
                </div>
                <div className="bg-white/10 border border-white/15 rounded-xl p-3">
                  <div className="text-emerald-200">2. الخسارة الكامنة</div>
                  <div className="font-bold mt-1 font-mono tabular-nums text-[#F79C1E]">
                    600,000 جم/سنة
                  </div>
                </div>
                <div className="bg-white/10 border border-white/15 rounded-xl p-3">
                  <div className="text-emerald-200">3. ضابط منفذ فعّال</div>
                  <div className="font-bold mt-1 font-mono tabular-nums">
                    تصميم وتنفيذ فعّالان = 90% RRF
                  </div>
                </div>
                <div className="bg-[#006547] border border-[#F79C1E]/60 rounded-xl p-3">
                  <div className="text-emerald-100">4. الخسارة المتبقية</div>
                  <div className="font-extrabold mt-1 font-mono tabular-nums text-white">
                    60,000 جم/سنة فقط
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      case 'nfi_esg':
        return (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="bg-white border border-[#DCDAD5] rounded-2xl p-5 space-y-3">
              <h3 className="text-sm font-extrabold text-[#09331F]">
                1. مصفوفة الأثر غير المالي (NFI · الشريحة 4)
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                يُقيّم كل خطر عبر <strong>4 أبعاد مستقلة</strong> بدرجات من <span className="font-mono">1</span> إلى{' '}
                <span className="font-mono">5</span>، مع خيار <strong>&quot;-&quot;</strong> إذا لم ينطبق البُعد:
              </p>
              <div className="grid grid-cols-2 gap-2 text-xs font-bold text-[#09331F]">
                <div className="bg-[#F8F8F6] border border-[#DCDAD5] rounded-lg p-2.5">توقف الخدمة والعملاء</div>
                <div className="bg-[#F8F8F6] border border-[#DCDAD5] rounded-lg p-2.5">السمعة والثقة العامة</div>
                <div className="bg-[#F8F8F6] border border-[#DCDAD5] rounded-lg p-2.5">الرقابي والبنك المركزي</div>
                <div className="bg-[#F8F8F6] border border-[#DCDAD5] rounded-lg p-2.5">القانوني والتشريعي</div>
              </div>
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs text-emerald-950 leading-relaxed">
                <strong>مبدأ الأكثر تحوطاً:</strong> الدرجة النهائية للأثر غير المالي هي أعلى درجة مسجلة بين الأبعاد الأربعة.
              </div>
            </div>

            <div className="bg-white border border-[#DCDAD5] rounded-2xl p-5 space-y-3">
              <h3 className="text-sm font-extrabold text-[#09331F]">
                2. مخاطر الاستدامة (ESG · كتالوج المركزي)
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                ربط كل مخاطرة تشغيلية بأحد المحاور الثلاثة واختيار الحالة المرجعية من قائمة البنك المركزي المصري (34 بنداً):
              </p>
              <div className="space-y-2 text-xs">
                <div className="bg-[#F8F8F6] border border-[#DCDAD5] rounded-xl p-2.5">
                  <strong className="text-[#006547]">البيئي (E):</strong> مخاطر المناخ، كفاءة الطاقة، والتمويل الأخضر.
                </div>
                <div className="bg-[#F8F8F6] border border-[#DCDAD5] rounded-xl p-2.5">
                  <strong className="text-[#006547]">الاجتماعي (S):</strong> حقوق العملاء، الشمول المالي، وبيئة العمل.
                </div>
                <div className="bg-[#F8F8F6] border border-[#DCDAD5] rounded-xl p-2.5">
                  <strong className="text-[#006547]">الحوكمة (G):</strong> الشفافية، النزاهة، والامتثال المؤسسي.
                </div>
              </div>
            </div>

            <div className="bg-[#09331F] text-white rounded-2xl p-5 flex flex-col justify-between space-y-4">
              <div className="space-y-2.5">
                <div className="text-xs font-bold text-[#F79C1E]">
                  3. القاعدة الصارمة لتحديد المخاطرة الرئيسية (Key Risk)
                </div>
                <h3 className="text-base font-extrabold leading-snug">
                  تُحسب حصرياً من الأثر المتبقي بعد الضوابط (Residual Only)
                </h3>
                <p className="text-xs text-emerald-100/90 leading-relaxed">
                  استجابةً لملاحظات مراجعي البنك، لا يُنظر للخطر الكامن في تحديد المخاطرة الرئيسية؛ بل يكون الجواب{' '}
                  <strong>&quot;نعم&quot;</strong> فقط إذا تحقق أحد الشرطين:
                </p>
              </div>
              <div className="space-y-2 text-xs">
                <div className="bg-white/10 border border-white/15 rounded-xl p-3 font-bold">
                  1) الأثر المالي المتبقي = H أو VH أو C
                </div>
                <div className="bg-white/10 border border-white/15 rounded-xl p-3 font-bold">
                  2) أو أي بُعد غير مالي (NFI) = H أو VH أو C
                </div>
              </div>
            </div>
          </div>
        );

      case 'matrix':
        return (
          <div className="space-y-5">
            <div className="bg-white border border-[#DCDAD5] rounded-2xl p-5 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#EFECE6]">
                <h3 className="text-sm font-extrabold text-[#09331F]">
                  خمس علامات توضح للمراجع مصدر كل رقم ونص داخل مصفوفة الـ 29 عموداً
                </h3>
                <span className="text-xs font-mono font-bold text-[#006547]">Columns C → AE</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
                {[
                  {
                    badge: 'مصدر أصلي',
                    tone: 'bg-slate-100 border-slate-300 text-slate-900',
                    desc: 'بيان منقول مباشرة من ملف Excel أو التقييم المعتمد السابق للوحدة.',
                  },
                  {
                    badge: 'مقترح ذكي',
                    tone: 'bg-amber-50 border-amber-300 text-amber-900',
                    desc: 'توصية مستخلصة من مستندات السياسة والتدقيق بعد موافقة المعد عليها.',
                  },
                  {
                    badge: 'تعديل مسودة',
                    tone: 'bg-sky-50 border-sky-300 text-sky-900',
                    desc: 'حقل عدّله مُعد التقييم يدوياً خلال العمل ويخضع لفحص المراجع.',
                  },
                  {
                    badge: 'محرك بايثون',
                    tone: 'bg-emerald-50 border-emerald-300 text-emerald-950',
                    desc: 'نتيجة رياضية محسوبة آلياً دون تدخل يدوي في الصيغ أو الدرجات.',
                  },
                  {
                    badge: 'معتمد نهائياً',
                    tone: 'bg-[#09331F] border-[#09331F] text-white',
                    desc: 'نسخة مغلقة وموثقة باعتماد المراجع المستقل (Checker).',
                  },
                ].map((tag) => (
                  <div key={tag.badge} className="bg-[#F8F8F6] border border-[#DCDAD5] rounded-xl p-3 space-y-2">
                    <div className={`inline-block px-2.5 py-1 rounded-md border font-bold text-[11px] ${tag.tone}`}>
                      {tag.badge}
                    </div>
                    <p className="text-[11px] text-slate-600 leading-relaxed">{tag.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="bg-[#F8F8F6] border border-[#DCDAD5] rounded-xl p-4">
                <div className="font-extrabold text-[#09331F]">ضمان سلامة الحسابات أثناء التعديل</div>
                <p className="text-slate-600 mt-1.5 leading-relaxed">
                  إذا عدّل الموظف أي قيمة مالية أو ضابطاً رقابياً في صف تم حسابه مسبقاً، يتغير وضع الصف تلقائياً
                  إلى <strong>&quot;بانتظار إعادة الاحتساب&quot;</strong> ولا يُسمح بالإرسال أو التصدير قبل التحديث.
                </p>
              </div>
              <div className="bg-[#F8F8F6] border border-[#DCDAD5] rounded-xl p-4">
                <div className="font-extrabold text-[#09331F]">مرونة كاملة بخيار &quot;أخرى&quot; في جميع القوائم</div>
                <p className="text-slate-600 mt-1.5 leading-relaxed">
                  كل قوائم الاختيار (تصنيف بازل، نوع الضابط، حالة الضابط، الأبعاد، والاستدامة) تتيح خيار{' '}
                  <strong>&quot;أخرى&quot;</strong> مع حقل كتابة مخصص لتغطية أي حالة مستجدة في العمل المصرفي.
                </p>
              </div>
            </div>
          </div>
        );

      case 'governance':
        return (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="bg-white border border-[#DCDAD5] rounded-2xl p-5 space-y-3">
              <div className="flex items-center gap-2 text-[#09331F] font-extrabold text-sm">
                <UserCheck className="w-4 h-4 text-[#006547]" />
                <span>صندوق المراجعة والاعتماد (Checker)</span>
              </div>
              <ul className="space-y-2 text-xs text-slate-700 leading-relaxed">
                <li>• يرى المراجع كل المسودات المرسلة له مرتبة حسب الوحدة.</li>
                <li>• يقارن تلقائياً القيمة الأصلية بأي تعديل أو مقترح ذكي أُدخل على الصف.</li>
                <li>• عند الإعادة للمعد، <strong>يلزم النظام كتابة سبب واضح</strong> يظهر في السجل.</li>
              </ul>
            </div>

            <div className="bg-white border border-[#DCDAD5] rounded-2xl p-5 space-y-3">
              <div className="flex items-center gap-2 text-[#09331F] font-extrabold text-sm">
                <Building2 className="w-4 h-4 text-[#006547]" />
                <span>الوحدات التنظيمية والمقارنة التاريخية</span>
              </div>
              <ul className="space-y-2 text-xs text-slate-700 leading-relaxed">
                <li>• استعراض كل إدارة مصرفية (مثل القروض المشتركة، الحسابات، نقاط البيع POS).</li>
                <li>• عرض تاريخ الدورات السابقة والمعتمدة مع آخر معد وآخر معدل وتاريخ الاعتماد.</li>
                <li>• <strong>مقارنة دورات التقييم</strong> لرصد المخاطر المستحدثة أو التي تغير تقييمها.</li>
              </ul>
            </div>

            <div className="bg-white border border-[#DCDAD5] rounded-2xl p-5 space-y-3">
              <div className="flex items-center gap-2 text-[#09331F] font-extrabold text-sm">
                <History className="w-4 h-4 text-[#006547]" />
                <span>سجل التعديلات والتدقيق (Audit Trail)</span>
              </div>
              <ul className="space-y-2 text-xs text-slate-700 leading-relaxed">
                <li>• توثيق فوري لعمليات الإنشاء، التعديل، الحساب، الإرسال، الاعتماد، والرفض.</li>
                <li>• يعرض القيمة <strong>قبل التعديل وبعده</strong> لكل حقل تغيّر.</li>
                <li>• متاح للبحث والتصفية حسب الموظف أو نوع الإجراء لإدارة التفتيش (Auditor).</li>
              </ul>
            </div>
          </div>
        );

      case 'outputs':
        return (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="bg-white border border-[#DCDAD5] rounded-2xl p-5 space-y-3">
              <div className="flex items-center gap-2 text-[#09331F] font-extrabold text-sm">
                <FileSpreadsheet className="w-5 h-5 text-[#006547]" />
                <span>مصنف Excel الرسمي (29 عموداً)</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                يُصدّر النظام ملف Excel مطابقاً حرفياً لقالب البنك الأهلي المصري (الأعمدة{' '}
                <span className="font-mono font-bold">C–AE</span>) مع الحفاظ على هيكل الأوراق والصيغ المعتمدة،
                بمجرد استيفاء كافة صفوف المصفوفة.
              </p>
            </div>

            <div className="bg-white border border-[#DCDAD5] rounded-2xl p-5 space-y-3">
              <div className="flex items-center gap-2 text-[#09331F] font-extrabold text-sm">
                <FileText className="w-5 h-5 text-[#006547]" />
                <span>التقرير الأخضر المنسق (PDF)</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                معاينة حية وطباعة/تصدير لتقرير PDF رسمي بالهوية البصرية الخضراء للبنك الأهلي المصري،
                متضمناً جداول المخاطر والضوابط وNFI وESG وKey Risk جاهزاً للعرض على اللجان.
              </p>
            </div>

            <div className="bg-emerald-50/60 border border-[#006547]/30 rounded-2xl p-5 space-y-3">
              <div className="flex items-center gap-2 text-[#09331F] font-extrabold text-sm">
                <Sparkles className="w-5 h-5 text-[#F79C1E]" />
                <span>واجهة هادئة + شرح فوري بالهوفر (؟)</span>
              </div>
              <p className="text-xs text-slate-700 leading-relaxed">
                تم تقليل الازدحام البصري داخل كل الشاشات وإضافة أيقونة <strong>(؟)</strong> وتلميحات تشرح أي زر
                أو مصطلح (مثل EAL وRRF وNFI وKey Risk) فور الوقوف عليه بالمؤشر.
              </p>
            </div>
          </div>
        );

      case 'walkthrough':
        return (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-7 bg-white border border-[#DCDAD5] rounded-2xl p-5 space-y-3">
              <div className="flex items-center gap-2 text-[#09331F] font-extrabold text-sm pb-2 border-b border-[#EFECE6]">
                <Clock className="w-4 h-4 text-[#006547]" />
                <span>جدول العرض المباشر في 10 دقائق (أثناء الجلسة)</span>
              </div>
              <div className="space-y-2.5 text-xs">
                {[
                  {
                    time: 'الدقائق 1–2',
                    account: 'طارق رضوان (EMP-9009 · مدير المخاطر)',
                    action: 'استعراض لوحة المعلومات، خريطة المخاطر 5×5، وتنبيهات الخسائر التاريخية والوحدات.',
                  },
                  {
                    time: 'الدقائق 3–5',
                    account: 'أحمد محمود (EMP-1001 · مُعد التقييم)',
                    action: 'تجربة إعداد تقييم جديد (المصدر المزدوج) ورفع ملف للوكيل الذكي ثم قبول مقترح بالدليل.',
                  },
                  {
                    time: 'الدقائق 6–8',
                    account: 'مصفوفة الـ 29 عموداً',
                    action: 'تعديل NFI أو ضابط رقابي، تشغيل الحساب الآلي، ومعاينة التقرير الأخضر PDF وExcel.',
                  },
                  {
                    time: 'الدقائق 9–10',
                    account: 'سارة إبراهيم (EMP-2002) ثم هدى سامي (EMP-8008)',
                    action: 'اعتماد المسودة كمراجع مستقل، ثم فحص سجل التدقيق الشامل (قبل / بعد) كمدقق داخلي.',
                  },
                ].map((step) => (
                  <div
                    key={step.time}
                    className="bg-[#F8F8F6] border border-[#DCDAD5] rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                  >
                    <div className="space-y-0.5">
                      <div className="font-extrabold text-[#09331F]">
                        {step.time} · <span className="text-[#006547]">{step.account}</span>
                      </div>
                      <div className="text-slate-600 leading-relaxed">{step.action}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="lg:col-span-5 bg-[#09331F] text-white rounded-2xl p-5 flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="text-xs font-bold text-[#F79C1E]">
                  إجابات مختصرة لأكثر أسئلة المراجعين شيوعاً
                </div>
                <div className="space-y-2.5 text-xs">
                  <div className="bg-white/10 border border-white/15 rounded-xl p-3">
                    <div className="font-bold text-white">هل يقرر الذكاء الاصطناعي الأرقام أو يعتمدها؟</div>
                    <div className="text-emerald-100/85 mt-1">
                      لا؛ يقترح فقط بالدليل، والحساب لمحرك البنك، والاعتماد حصري للمراجع البشري.
                    </div>
                  </div>
                  <div className="bg-white/10 border border-white/15 rounded-xl p-3">
                    <div className="font-bold text-white">هل تظل النسخ المعتمدة السابقة محمية؟</div>
                    <div className="text-emerald-100/85 mt-1">
                      نعم؛ كل نسخة معتمدة مقفلة تماماً، وأي تحديث يتم في مسودة دورة جديدة مستقلة.
                    </div>
                  </div>
                  <div className="bg-white/10 border border-white/15 rounded-xl p-3">
                    <div className="font-bold text-white">هل مخرجات المنصة مطابقة لنموذج البنك؟</div>
                    <div className="text-emerald-100/85 mt-1">
                      نعم؛ تصدر قالب Excel الكامل (29 عموداً C–AE) مع التقرير الأخضر الرسمي PDF.
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-white/15 text-[11px] text-emerald-100/90 flex items-center justify-between">
                <span>كلمة مرور جميع حسابات العرض التجريبية:</span>
                <span className="font-mono font-bold text-[#F79C1E]" dir="ltr">
                  NBE@2026!
                </span>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div
      className={`${
        isFocusMode
          ? 'fixed inset-0 z-50 bg-[#F4F5F3] p-4 sm:p-6 overflow-y-auto'
          : 'space-y-4'
      } font-['Cairo']`}
      dir="rtl"
      data-testid="demo-presentation-page"
    >
      {/* Deck Switcher Bar */}
      <div
        className="bg-white border border-[#DCDAD5] rounded-2xl p-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 shadow-xs"
        role="tablist"
        aria-label="اختيار العرض التقديمي"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 flex-1">
          <button
            type="button"
            role="tab"
            aria-selected={activeDeck === 'executive'}
            onClick={() => handleSelectDeck('executive')}
            data-testid="deck-tab-executive"
            className={`px-4 py-2.5 rounded-xl border text-right transition-all cursor-pointer flex items-center justify-between gap-3 ${
              activeDeck === 'executive'
                ? 'bg-[#09331F] text-white border-[#09331F] shadow-xs'
                : 'bg-[#F8F8F6] hover:bg-[#EFECE6] text-[#09331F] border-[#DCDAD5]'
            }`}
          >
            <div>
              <div className="text-xs sm:text-sm font-extrabold">
                العرض التنفيذي (لغير التقنيين · 13 شريحة)
              </div>
              <div
                className={`text-[11px] mt-0.5 ${
                  activeDeck === 'executive' ? 'text-emerald-100/90' : 'text-slate-600'
                }`}
              >
                رحلة التقييم والأدوار والمصفوفة والمخرجات للمراجعين والإدارات
              </div>
            </div>
            <span
              className={`font-mono font-extrabold text-xs px-2 py-0.5 rounded-md tabular-nums shrink-0 ${
                activeDeck === 'executive'
                  ? 'bg-white/15 text-[#F79C1E]'
                  : 'bg-white text-[#006547] border border-[#DCDAD5]'
              }`}
            >
              13
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeDeck === 'methodology'}
            onClick={() => handleSelectDeck('methodology')}
            data-testid="deck-tab-methodology"
            dir="ltr"
            className={`px-4 py-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between gap-3 ${
              activeDeck === 'methodology'
                ? 'bg-[#09331F] text-white border-[#09331F] shadow-xs'
                : 'bg-[#F8F8F6] hover:bg-[#EFECE6] text-[#09331F] border-[#DCDAD5]'
            }`}
          >
            <div>
              <div className="text-xs sm:text-sm font-extrabold">
                Methodology, Models &amp; Evolution (EN · 13 Slides)
              </div>
              <div
                className={`text-[11px] mt-0.5 ${
                  activeDeck === 'methodology' ? 'text-emerald-100/90' : 'text-slate-600'
                }`}
              >
                Python Decimal + Hybrid RAG (RRF) + Best-Practice V1→V4 &amp; Academic References
              </div>
            </div>
            <span
              className={`font-mono font-extrabold text-xs px-2 py-0.5 rounded-md tabular-nums shrink-0 ${
                activeDeck === 'methodology'
                  ? 'bg-white/15 text-[#F79C1E]'
                  : 'bg-white text-[#006547] border border-[#DCDAD5]'
              }`}
            >
              13
            </span>
          </button>
        </div>
      </div>

      {/* Top Executive Presenter Bar */}
      <div
        dir={activeDeck === 'methodology' ? 'ltr' : 'rtl'}
        className={`bg-white border border-[#DCDAD5] rounded-2xl p-3.5 sm:px-5 sm:py-3.5 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-3 ${
          activeDeck === 'methodology' ? 'text-left' : 'text-right'
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-[#09331F] text-[#F79C1E] flex items-center justify-center font-mono font-extrabold text-sm shrink-0 tabular-nums">
            {slide.indexLabel}
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-bold text-[#006547] flex items-center gap-2">
              <span>
                {activeDeck === 'executive'
                  ? 'العرض التعريفي للمنصة (غير تقني)'
                  : 'Methodology, Hybrid Models & Evolution (Deep Dive)'}
              </span>
              <span className="text-slate-300">·</span>
              <span>{slide.section}</span>
            </div>
            <h1 className="text-sm sm:text-base font-extrabold text-[#09331F] truncate">
              {activeDeck === 'executive'
                ? `شريحة ${slide.number} من ${totalSlides}: ${slide.title}`
                : `Slide ${slide.number} of ${totalSlides}: ${slide.title}`}
            </h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <HoverTooltip
            description={
              activeDeck === 'executive'
                ? 'فتح فهرس كل الشرائح للقفز السريع لأي موضوع'
                : 'Toggle full 13-slide overview index to jump to any section'
            }
            side="bottom"
          >
            <button
              type="button"
              onClick={() => setShowOverview((prev) => !prev)}
              aria-expanded={showOverview}
              data-testid="demo-overview-toggle"
              className={`min-h-9 px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
                showOverview
                  ? 'bg-[#09331F] text-white border-[#09331F]'
                  : 'bg-[#F8F8F6] hover:bg-[#EFECE6] text-[#09331F] border-[#DCDAD5]'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>{activeDeck === 'executive' ? 'فهرس الشرائح' : 'Slide Overview'}</span>
            </button>
          </HoverTooltip>

          <HoverTooltip
            description={
              activeDeck === 'executive'
                ? 'إظهار أو إخفاء نقاط الحديث وإجابات أسئلة المراجعين'
                : 'Show or hide presenter notes and committee Q&A talking points'
            }
            side="bottom"
          >
            <button
              type="button"
              onClick={() => setShowNotes((prev) => !prev)}
              aria-expanded={showNotes}
              data-testid="demo-notes-toggle"
              className={`min-h-9 px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
                showNotes
                  ? 'bg-emerald-50 text-[#09331F] border-[#006547]/40'
                  : 'bg-[#F8F8F6] hover:bg-[#EFECE6] text-slate-700 border-[#DCDAD5]'
              }`}
            >
              <MessageSquareText className="w-3.5 h-3.5 text-[#006547]" />
              <span>{activeDeck === 'executive' ? 'ملاحظات المُقدّم' : 'Presenter Notes'}</span>
            </button>
          </HoverTooltip>

          <HoverTooltip
            description={
              activeDeck === 'executive'
                ? 'تكبير مساحة العرض التقديمي وإخفاء القوائم الجانبية'
                : 'Expand slide view to full-screen focus mode'
            }
            side="bottom"
          >
            <button
              type="button"
              onClick={() => setIsFocusMode((prev) => !prev)}
              aria-label={
                activeDeck === 'executive'
                  ? isFocusMode
                    ? 'إنهاء وضع التركيز'
                    : 'وضع التركيز الكامل'
                  : isFocusMode
                    ? 'Exit focus mode'
                    : 'Enter focus mode'
              }
              className="min-h-9 px-3 py-1.5 rounded-xl bg-[#F8F8F6] hover:bg-[#EFECE6] text-[#09331F] border border-[#DCDAD5] text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              {isFocusMode ? (
                <>
                  <Minimize2 className="w-3.5 h-3.5 text-[#006547]" />
                  <span>{activeDeck === 'executive' ? 'خروج' : 'Exit'}</span>
                </>
              ) : (
                <>
                  <Maximize2 className="w-3.5 h-3.5 text-[#006547]" />
                  <span>{activeDeck === 'executive' ? 'تركيز' : 'Focus'}</span>
                </>
              )}
            </button>
          </HoverTooltip>

          <HoverTooltip
            description={
              activeDeck === 'executive'
                ? 'تنزيل نسخة PDF جاهزة للطباعة أو الإرسال للمراجعين (13 شريحة)'
                : 'Download 13-slide 16:9 PDF deck (Methodology, Models & References)'
            }
            side="bottom"
          >
            <a
              href={
                activeDeck === 'executive'
                  ? '/NBE_RCSA_Executive_Demo_AR.pdf'
                  : '/NBE_RCSA_Methodology_Models_Journey.pdf'
              }
              download={
                activeDeck === 'executive'
                  ? 'NBE_RCSA_Executive_Demo_AR.pdf'
                  : 'NBE_RCSA_Methodology_Models_Journey.pdf'
              }
              data-testid="demo-download-pdf"
              className="min-h-9 px-3.5 py-1.5 rounded-xl bg-[#006547] hover:bg-[#09331F] text-white text-xs font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <FileDown className="w-3.5 h-3.5 text-[#F79C1E]" />
              <span>{activeDeck === 'executive' ? 'تنزيل PDF للعرض' : 'Download Deck PDF'}</span>
            </a>
          </HoverTooltip>
        </div>
      </div>

      {/* Slide Overview Grid Drawer */}
      {showOverview && (
        <div
          dir={activeDeck === 'methodology' ? 'ltr' : 'rtl'}
          className={`bg-white border border-[#DCDAD5] rounded-2xl p-4 shadow-sm ${
            activeDeck === 'methodology' ? 'text-left' : 'text-right'
          }`}
          data-testid="demo-overview-grid"
        >
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-[#EFECE6]">
            <div className="flex items-center gap-2 text-xs font-extrabold text-[#09331F]">
              <Layers className="w-4 h-4 text-[#006547]" />
              <span>
                {activeDeck === 'executive'
                  ? `فهرس العرض الكامل (${totalSlides} شريحة) — اضغط للانتقال الفوري`
                  : `Full Slide Index (${totalSlides} Slides) — Click any card to jump`}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowOverview(false)}
              className="text-xs font-bold text-slate-600 hover:text-[#09331F] cursor-pointer"
            >
              {activeDeck === 'executive' ? 'إغلاق' : 'Close'}
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {activeSlides.map((s, idx) => {
              const isSelected = idx === currentIndex;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setCurrentIndex(idx);
                    setShowOverview(false);
                  }}
                  className={`${
                    activeDeck === 'methodology' ? 'text-left' : 'text-right'
                  } p-3 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-[#09331F] text-white border-[#09331F]'
                      : 'bg-[#F8F8F6] hover:bg-[#EFECE6] text-[#09331F] border-[#DCDAD5]'
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px] font-bold">
                    <span className="font-mono tabular-nums text-[#F79C1E]">{s.indexLabel}</span>
                    <span className={isSelected ? 'text-emerald-200' : 'text-[#006547]'}>
                      {s.section}
                    </span>
                  </div>
                  <div className="text-xs font-extrabold mt-1 line-clamp-2 leading-snug">
                    {s.title}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Main Slide Stage */}
      <section
        dir={activeDeck === 'methodology' ? 'ltr' : 'rtl'}
        aria-label={
          activeDeck === 'executive'
            ? `الشريحة ${slide.number}: ${slide.title}`
            : `Slide ${slide.number}: ${slide.title}`
        }
        className={`bg-white border border-[#DCDAD5] rounded-2xl p-5 sm:p-7 shadow-xs space-y-5 ${
          activeDeck === 'methodology' ? 'text-left' : 'text-right'
        }`}
      >
        {(activeDeck === 'executive'
          ? (slide as DemoSlide).layout !== 'cover'
          : (slide as MethodologySlide).layout !== 'deep_cover') && (
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-3 pb-4 border-b border-[#EFECE6]">
            <div className="space-y-1 max-w-4xl">
              <div className="text-xs font-bold text-[#006547] flex items-center gap-2">
                <span className="font-mono tabular-nums text-[#9A5B00]">
                  {slide.indexLabel} / {String(totalSlides).padStart(2, '0')}
                </span>
                <span className="text-slate-300">·</span>
                <span>{slide.section}</span>
              </div>
              <h2 className="text-lg sm:text-2xl font-extrabold text-[#09331F] leading-snug">
                {slide.title}
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">{slide.subtitle}</p>
            </div>

            {slide.jumpTarget && onNavigate && (
              <HoverTooltip
                description={
                  activeDeck === 'executive'
                    ? 'الانتقال فوراً إلى هذه الشاشة داخل المنصة الحية لتجربتها أمام الحضور'
                    : 'Jump straight to this live screen in the running platform'
                }
                side="bottom"
              >
                <button
                  type="button"
                  onClick={() => onNavigate({ page: slide.jumpTarget!.page })}
                  data-testid="demo-live-jump-btn"
                  className="min-h-10 px-4 py-2 rounded-xl bg-[#FEF5E7] hover:bg-[#FDE8C8] text-[#09331F] border border-[#F79C1E]/50 text-xs font-extrabold flex items-center gap-2 shrink-0 cursor-pointer transition-colors"
                >
                  <span>{slide.jumpTarget.label}</span>
                  <ArrowUpLeft className="w-4 h-4 text-[#006547]" />
                </button>
              </HoverTooltip>
            )}
          </div>
        )}

        <div>
          {activeDeck === 'executive' ? (
            renderSlideBody(slide as DemoSlide)
          ) : (
            <MethodologySlideBody slide={slide as MethodologySlide} />
          )}
        </div>

        {/* Bottom Slide Controls & Progress */}
        <div className="pt-4 border-t border-[#EFECE6] flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-start">
            <button
              type="button"
              onClick={goPrev}
              disabled={currentIndex === 0}
              data-testid="demo-prev-slide"
              className="min-h-10 px-4 py-2 rounded-xl border border-[#DCDAD5] bg-[#F8F8F6] hover:bg-[#EFECE6] disabled:opacity-40 disabled:cursor-not-allowed text-[#09331F] text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              {activeDeck === 'methodology' ? (
                <ChevronLeft className="w-4 h-4 text-[#006547]" />
              ) : (
                <ChevronRight className="w-4 h-4 text-[#006547]" />
              )}
              <span>{activeDeck === 'executive' ? 'الشريحة السابقة' : 'Previous Slide'}</span>
            </button>

            <button
              type="button"
              onClick={goNext}
              disabled={currentIndex === totalSlides - 1}
              data-testid="demo-next-slide"
              className="min-h-10 px-4 py-2 rounded-xl bg-[#006547] hover:bg-[#09331F] disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <span>{activeDeck === 'executive' ? 'الشريحة التالية' : 'Next Slide'}</span>
              {activeDeck === 'methodology' ? (
                <ChevronRight className="w-4 h-4 text-[#F79C1E]" />
              ) : (
                <ChevronLeft className="w-4 h-4 text-[#F79C1E]" />
              )}
            </button>
          </div>

          {/* Minimal dot-free step bar */}
          <div className="flex items-center gap-1.5 flex-wrap justify-center">
            {activeSlides.map((s, idx) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setCurrentIndex(idx)}
                aria-label={
                  activeDeck === 'executive'
                    ? `الانتقال إلى الشريحة ${s.number}: ${s.title}`
                    : `Jump to Slide ${s.number}: ${s.title}`
                }
                className={`h-2 rounded-full transition-all cursor-pointer ${
                  idx === currentIndex
                    ? 'w-7 bg-[#006547]'
                    : idx < currentIndex
                      ? 'w-3 bg-[#F79C1E]/75 hover:bg-[#F79C1E]'
                      : 'w-3 bg-[#DCDAD5] hover:bg-slate-400'
                }`}
              />
            ))}
          </div>

          <div className="text-[11px] text-slate-500 flex items-center gap-3 shrink-0">
            <span className="font-mono tabular-nums font-bold text-[#09331F]">
              {slide.number} / {totalSlides}
            </span>
            <a
              href={
                activeDeck === 'executive'
                  ? '/demo-presentation.html'
                  : '/methodology-models-presentation.html'
              }
              className="text-[#006547] hover:underline font-bold"
            >
              {activeDeck === 'executive'
                ? 'عرض جميع الشرائح للطباعة ↗'
                : 'Open All 13 Slides (Print View) ↗'}
            </a>
          </div>
        </div>
      </section>

      {/* Presenter Talking Points & Anticipated Bank Reviewer Question */}
      {showNotes && (
        <aside
          dir={activeDeck === 'methodology' ? 'ltr' : 'rtl'}
          className={`bg-[#FAF9F6] border border-[#DCDAD5] rounded-2xl p-4 sm:p-5 space-y-3 ${
            activeDeck === 'methodology' ? 'text-left' : 'text-right'
          }`}
          data-testid="demo-presenter-notes"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-extrabold text-[#09331F]">
              <MessageSquareText className="w-4 h-4 text-[#006547]" />
              <span>
                {activeDeck === 'executive'
                  ? 'دليل الشرح للمُقدّم (بلغة مصرفية غير تقنية)'
                  : 'Methodology & Technical Presenter Notes'}
              </span>
            </div>
            <span className="text-[11px] text-slate-500">
              {activeDeck === 'executive'
                ? 'اختصارات لوحة المفاتيح: الأسهم للتنقل · G للفهرس · N للملاحظات'
                : 'Shortcuts: Arrow Keys to Navigate · G Overview · N Notes'}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">{slide.presenterNotes}</p>
          {slide.keyQuestion && slide.keyAnswer && (
            <div className="bg-white border border-[#DCDAD5] rounded-xl p-3.5 text-xs space-y-1">
              <div className="font-extrabold text-[#006547]">
                {activeDeck === 'executive'
                  ? `سؤال متوقع من المراجع: ${slide.keyQuestion}`
                  : `Anticipated Committee Question: ${slide.keyQuestion}`}
              </div>
              <div className="text-slate-700 leading-relaxed">
                <strong>{activeDeck === 'executive' ? 'الإجابة:' : 'Answer:'}</strong>{' '}
                {slide.keyAnswer}
              </div>
            </div>
          )}
        </aside>
      )}
    </div>
  );
};
