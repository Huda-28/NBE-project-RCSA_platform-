import React from 'react';
import {
  Cpu,
  ShieldCheck,
  Database,
  Calculator,
  GitBranch,
  Sparkles,
  Lock,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  Layers,
  TrendingUp,
  Search,
  FileCode2,
} from 'lucide-react';
import {
  MethodologySlide,
  FINANCIAL_BANDS_TABLE,
  RRF_MATRIX_ROWS,
  MODEL_EVOLUTION_MILESTONES,
} from '../data/demoSlides.js';

export const MethodologySlideBody: React.FC<{ slide: MethodologySlide }> = ({ slide }) => {
  switch (slide.layout) {
    case 'deep_cover':
      return (
        <div className="space-y-6">
          <div className="bg-[#09331F] text-white rounded-2xl p-6 sm:p-9 border border-[#006547] relative overflow-hidden">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div className="space-y-4 max-w-2xl">
                <div className="inline-flex items-center gap-2 text-xs font-bold text-[#F79C1E] tracking-wide">
                  <Cpu className="w-4 h-4 shrink-0" />
                  <span>التوثيق المنهجي العميق · هندسة النماذج وتطور الأداء (Deep Dive)</span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-extrabold leading-snug text-white">
                  {slide.title}
                </h2>
                <p className="text-sm sm:text-base text-emerald-100/90 leading-relaxed">
                  {slide.subtitle}
                </p>
              </div>

              <div className="shrink-0 bg-white/10 border border-white/15 rounded-2xl p-5 flex flex-col items-center justify-center min-w-[220px]">
                <img
                  src="/assets/nbe-logo-white.png"
                  alt="البنك الأهلي المصري"
                  className="h-14 w-auto object-contain mb-3"
                />
                <div className="text-xs font-bold text-emerald-100">
                  لجان المنهجية والتدقيق والنماذج
                </div>
                <div className="text-[11px] text-[#F79C1E] mt-0.5 font-mono tabular-nums">
                  SOTA Hybrid RAG · Python Decimal
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-7 pt-6 border-t border-white/15">
              {[
                { num: '5.8×', unit: 'توسيع نافذة السياق', desc: 'من 240 إلى 1,400 حرف للمقطع المسترجع' },
                { num: '4,096', unit: 'توكن للتوليد الدقيق', desc: 'استخراج منظم متعدد الضوابط عبر Schema' },
                { num: '8', unit: 'قواعد تدقيق ذاتي (QA)', desc: 'مراجعة وإصلاح آلي قبل العرض للمعد' },
                { num: '169', unit: 'اختبار تحقق آلي', desc: '82 اختبار Node.js + 87 اختبار Python Decimal' },
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
                  <p className="text-[11px] text-emerald-100/80 mt-1 leading-relaxed">{stat.desc}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                title: '1. حتمية الاحتساب المالي والرقابي',
                body: 'كل معادلات EAL ومصفوفة 3×3 RRF وNFI وKey Risk تُنفذ في بايثون بدقة Decimal دون تدخل لغوي.',
              },
              {
                title: '2. البحث الهجين المتطور (Hybrid RAG)',
                body: 'إصلاح العربية في PDF + BM25 IDF + متجهات دلالية (192-dim + gemini-embedding-2) بدمج RRF.',
              },
              {
                title: '3. رحلة التحسين الموثقة (V1 → V4)',
                body: 'توثيق صريح لكل ترقية من النموذج الأولي الضعيف إلى معمارية SOTA متوافقة مع ملاحظات البنك.',
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

    case 'dual_architecture':
      return (
        <div className="space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-3.5 items-stretch">
            <div className="bg-white border border-[#DCDAD5] rounded-2xl p-4 flex flex-col justify-between space-y-2">
              <div>
                <div className="text-[11px] font-mono font-bold text-[#006547]">LAYER 01 · INGESTION & RAG</div>
                <h3 className="text-sm font-extrabold text-[#09331F] mt-1">استخلاص وبحث هجين</h3>
                <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                  فهرسة PDF/DOCX/XLSX/CSV، إصلاح تداخل اللام-ألف، طمس PII، وبحث BM25 + Vector RRF.
                </p>
              </div>
              <div className="text-[11px] font-mono bg-[#F8F8F6] border border-[#DCDAD5] rounded-lg px-2.5 py-1.5 text-slate-700">
                rag-service.ts · document_extract.py
              </div>
            </div>

            <div className="bg-white border border-[#DCDAD5] rounded-2xl p-4 flex flex-col justify-between space-y-2">
              <div>
                <div className="text-[11px] font-mono font-bold text-[#006547]">LAYER 02 · LLM SYNTHESIS</div>
                <h3 className="text-sm font-extrabold text-[#09331F] mt-1">صياغة واستخلاص مقيّد</h3>
                <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                  توليد أوصاف المخاطر والضوابط وفق JSON Schema صارم ومثال ذهبي Few-Shot دون صلاحية تقييم.
                </p>
              </div>
              <div className="text-[11px] font-mono bg-[#F8F8F6] border border-[#DCDAD5] rounded-lg px-2.5 py-1.5 text-slate-700">
                qwen3.5:4b / gemini-4-hydrogen
              </div>
            </div>

            <div className="bg-amber-50/70 border border-amber-300 rounded-2xl p-4 flex flex-col justify-between space-y-2">
              <div>
                <div className="text-[11px] font-mono font-bold text-amber-800">LAYER 03 · SANITIZE & QA</div>
                <h3 className="text-sm font-extrabold text-amber-950 mt-1">جدار التطهير والتدقيق</h3>
                <p className="text-xs text-slate-700 mt-2 leading-relaxed">
                  حذف أي تصنيف أو RRF يكتبه النموذج عبر <span className="font-mono font-bold">stripForbiddenLlmFields</span> ثم فحص الـ 8 قواعد.
                </p>
              </div>
              <div className="text-[11px] font-mono bg-white border border-amber-200 rounded-lg px-2.5 py-1.5 text-amber-900">
                15 Forbidden Fields Stripped
              </div>
            </div>

            <div className="bg-[#09331F] text-white rounded-2xl p-4 flex flex-col justify-between space-y-2">
              <div>
                <div className="text-[11px] font-mono font-bold text-[#F79C1E]">LAYER 04 · PYTHON ENGINE</div>
                <h3 className="text-sm font-extrabold text-white mt-1">الاحتساب الحتمي المعتمد</h3>
                <p className="text-xs text-emerald-100/90 mt-2 leading-relaxed">
                  حساب EAL، التدرج 5×5، مصفوفة 3×3 MAX RRF، المتبقي، NFI، وKey Risk بدقة Decimal مطلقة.
                </p>
              </div>
              <div className="text-[11px] font-mono bg-white/10 border border-white/15 rounded-lg px-2.5 py-1.5 text-[#F79C1E]">
                rcsa_engine (Authoritative)
              </div>
            </div>
          </div>

          <div className="bg-[#F8F8F6] border border-[#DCDAD5] rounded-2xl p-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <div className="font-extrabold text-[#09331F]">ماذا يُسمح للنموذج اللغوي (LLM) بتوليده؟</div>
              <p className="text-slate-600 mt-1 leading-relaxed">
                اسم العملية، وصف الخطر (الحدث + السبب + الأثر)، الضوابط المقترحة ودوريتها، ترشيح الهدف الاستراتيجي،
                واقتراح تصنيف L1-L3 وESG مع رقم الصفحة والمقطع الداعم فقط.
              </p>
            </div>
            <div>
              <div className="font-extrabold text-rose-900">ما المحظور نهائياً على النموذج اللغوي؟</div>
              <p className="text-slate-600 mt-1 leading-relaxed">
                تحديد <span className="font-mono">inherent_rating</span>، <span className="font-mono">residual_rating</span>،{' '}
                <span className="font-mono">rrf</span>، <span className="font-mono">effective_max_rrf</span>، أو حالة الاعتماد{' '}
                <span className="font-mono">approved_by</span> — تُحذف فوراً وتُدار حصرياً عبر بايثون والمراجع البشري.
              </p>
            </div>
          </div>
        </div>
      );

    case 'phase2a_financial':
      return (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-7 bg-white border border-[#DCDAD5] rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between border-b border-[#EFECE6] pb-2">
              <h3 className="text-sm font-extrabold text-[#09331F]">
                الشرائح المالية الخمس والمبالغ المرجعية الرسمية (EI880:EI884)
              </h3>
              <span className="text-xs font-mono font-bold text-[#006547]">Decimal Precision</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-right border-collapse">
                <thead>
                  <tr className="bg-[#F8F8F6] border-b border-[#DCDAD5] text-[#09331F]">
                    <th className="py-2 px-3 font-extrabold">الرمز</th>
                    <th className="py-2 px-3 font-extrabold">التصنيف</th>
                    <th className="py-2 px-3 font-extrabold">النطاق المستمر (ج.م)</th>
                    <th className="py-2 px-3 font-extrabold">القيمة المرجعية (Anchor)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EFECE6]">
                  {FINANCIAL_BANDS_TABLE.map((row) => (
                    <tr key={row.code}>
                      <td className="py-2 px-3 font-mono font-extrabold text-[#006547]">{row.code}</td>
                      <td className="py-2 px-3 font-bold text-slate-800">{row.labelAr}</td>
                      <td className="py-2 px-3 font-mono tabular-nums text-slate-700">{row.rangeAr}</td>
                      <td className="py-2 px-3 font-mono tabular-nums font-bold text-[#09331F]">
                        {row.anchorEgp} ج.م
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              تمنع الدالة <span className="font-mono font-bold">snapToOfficialReferenceAnchor</span> استخدام تقديرات عشوائية مثل 250,000 أو 180,000؛ وتضبط أي تقدير استرشادي (في غياب خسارة حادثة فعلية) على المراجع الخمسة المعتمدة.
            </p>
          </div>

          <div className="lg:col-span-5 space-y-4">
            <div className="bg-[#F8F8F6] border border-[#DCDAD5] rounded-2xl p-4 space-y-2.5">
              <h4 className="text-xs font-extrabold text-[#09331F]">مضاعفات التكرار السنوي (FREQUENCY_TABLE)</h4>
              <div className="grid grid-cols-1 gap-1.5 text-xs">
                {[
                  { label: '1 · مرة كل سنتان (Once per 2 years)', mult: '× 0.5' },
                  { label: '2 · مرة واحدة كل سنة (Annually)', mult: '× 1.0' },
                  { label: '3 · مرة كل نصف سنة (Half Yearly)', mult: '× 2.0' },
                  { label: '4 · مرة كل ربع سنة (Quarterly)', mult: '× 4.0' },
                  { label: '5 · مرة كل شهر (Monthly)', mult: '× 12.0' },
                ].map((f) => (
                  <div
                    key={f.label}
                    className="bg-white border border-[#DCDAD5] rounded-lg px-3 py-1.5 flex items-center justify-between"
                  >
                    <span className="text-slate-700">{f.label}</span>
                    <span className="font-mono font-extrabold text-[#006547] tabular-nums">{f.mult}</span>
                  </div>
                ))}
              </div>
              <div className="bg-[#09331F] text-white rounded-xl p-3 text-xs font-mono tabular-nums text-center">
                Inherent EAL = Impact (Decimal) × Multiplier
              </div>
            </div>

            <div className="bg-amber-50/70 border border-amber-300 rounded-2xl p-4 text-xs space-y-1.5">
              <div className="font-extrabold text-amber-950">معايرة الحوادث التاريخية (Historical Calibration)</div>
              <p className="text-slate-700 leading-relaxed">
                عند وجود حوادث موثقة للوحدة (مثل 150K–700K بالقروض المشتركة أو 1K–600K بالحسابات)، إذا قلّ التقدير الفردي عن <strong>75%</strong> من أعلى خسارة فعلية، يُصدر النظام تنبيه معايرة تلقائياً.
              </p>
            </div>
          </div>
        </div>
      );

    case 'phase2b_controls':
      return (
        <div className="space-y-5">
          <div className="bg-white border border-[#DCDAD5] rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between border-b border-[#EFECE6] pb-2">
              <h3 className="text-sm font-extrabold text-[#09331F]">
                المصفوفة الرسمية 3×3 لمعامل خفض المخاطرة (OFFICIAL_RRF_MATRIX · EG889:EI897)
              </h3>
              <span className="text-xs font-mono font-bold text-[#006547]">RRF Lookup</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-center border-collapse">
                <thead>
                  <tr className="bg-[#09331F] text-white">
                    <th className="py-2.5 px-4 text-right font-extrabold">آلية التنفيذ (Method)</th>
                    <th className="py-2.5 px-4 font-extrabold">ضابط مانع (Preventive)</th>
                    <th className="py-2.5 px-4 font-extrabold">ضابط كاشف (Detective)</th>
                    <th className="py-2.5 px-4 font-extrabold">ضابط تصحيحي (Corrective)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#DCDAD5]">
                  {RRF_MATRIX_ROWS.map((r) => (
                    <tr key={r.methodAr} className="bg-white">
                      <td className="py-3 px-4 text-right font-extrabold text-[#09331F] bg-[#F8F8F6]">
                        {r.methodAr}
                      </td>
                      <td className="py-3 px-4 font-mono font-extrabold text-[#006547] text-sm tabular-nums">
                        {r.preventive}
                      </td>
                      <td className="py-3 px-4 font-mono font-extrabold text-[#09331F] text-sm tabular-nums">
                        {r.detective}
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-amber-800 text-sm tabular-nums">
                        {r.corrective}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="bg-[#F8F8F6] border border-[#DCDAD5] rounded-xl p-4">
              <div className="font-extrabold text-[#09331F]">1. قاعدة MAX RRF وعدم الجمع</div>
              <p className="text-slate-600 mt-1.5 leading-relaxed">
                يُختار <strong>أعلى معامل خفض</strong> بين الضوابط المنفذة فعلياً ذات الصلة بالخطر، وليس جمع نسب الضوابط، لمنع المبالغة الوهمية في تقليل الخطر.
              </p>
            </div>
            <div className="bg-rose-50/50 border border-rose-200 rounded-xl p-4">
              <div className="font-extrabold text-rose-900">2. استبعاد الضوابط المقترحة (0%)</div>
              <p className="text-slate-700 mt-1.5 leading-relaxed">
                أي ضابط حالته <span className="font-mono font-bold">PROPOSED</span> (خطط مستقبلية) أو غير مؤهل يُحتسب معامل خفضه <strong>0%</strong> حتى يتم تنفيذه واقعياً.
              </p>
            </div>
            <div className="bg-emerald-50/50 border border-emerald-200 rounded-xl p-4">
              <div className="font-extrabold text-[#09331F]">3. تنقية النص والدورية الرسمية</div>
              <p className="text-slate-700 mt-1.5 leading-relaxed">
                حذف عبارات الآلية والنوع من نص العمود <span className="font-mono">M</span>، وإلزام الدوريات السبع الرسمية فقط (منع <span className="font-mono">Per Transaction</span>).
              </p>
            </div>
          </div>
        </div>
      );

    case 'phase2c_nfi_esg':
      return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="bg-white border border-[#DCDAD5] rounded-2xl p-5 space-y-3">
            <h3 className="text-sm font-extrabold text-[#09331F]">
              1. التحقق الحتمي للأثر غير المالي (NFI · الشريحة 4)
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              في وحدة <span className="font-mono font-bold">phase2c.py</span> لا يمر أي بُعد بدون دليل نصي موثق:
            </p>
            <ul className="space-y-2 text-xs text-slate-700">
              <li className="bg-[#F8F8F6] border border-[#DCDAD5] rounded-lg p-2.5">
                <strong>الأبعاد الأربعة:</strong> <span className="font-mono">service · reputation · regulatory · legal</span>
              </li>
              <li className="bg-[#F8F8F6] border border-[#DCDAD5] rounded-lg p-2.5">
                <strong>خيار &quot;-&quot; (غير منطبق):</strong> يتطلب مبرراً مكتوباً لعدم التعرض، خاصةً في الإجراءات القضائية.
              </li>
              <li className="bg-emerald-50 border border-emerald-200 rounded-lg p-2.5">
                <strong>التجميع التحوطي:</strong> <span className="font-mono">overall = max(assessed, key=RANK)</span>
              </li>
            </ul>
          </div>

          <div className="bg-[#09331F] text-white rounded-2xl p-5 space-y-3 flex flex-col justify-between">
            <div className="space-y-2">
              <div className="text-xs font-bold text-[#F79C1E]">2. معادلة المخاطرة الرئيسية (Key Risk)</div>
              <h3 className="text-sm font-extrabold text-white">تقييم حصري من الأثر المتبقي فقط</h3>
              <p className="text-xs text-emerald-100/90 leading-relaxed">
                لا يُعتمد على التقييم المالي الكامن، بل يتم فحص <strong>المتبقي بعد الضوابط</strong>:
              </p>
            </div>
            <div className="bg-[#062315] border border-white/15 rounded-xl p-3 font-mono text-[11px] text-emerald-100 leading-relaxed" dir="ltr">
              effective_fin = residual_financial_rating<br />
              key_risk = &quot;YES&quot; if any(v in (&quot;H&quot;,&quot;VH&quot;,&quot;C&quot;) for v in (effective_fin, overall, *nfi_values)) else &quot;NO&quot;
            </div>
            <div className="text-[11px] text-[#F79C1E]">
              يتم وسم التصدير الرسمي بأساس القرار: RESIDUAL_FINANCIAL_AND_NFI
            </div>
          </div>

          <div className="bg-white border border-[#DCDAD5] rounded-2xl p-5 space-y-3">
            <h3 className="text-sm font-extrabold text-[#09331F]">
              3. ربط بازل (84) + ESG (34) + فئات القبول (1–4)
            </h3>
            <div className="space-y-2 text-xs text-slate-700 leading-relaxed">
              <div className="bg-[#F8F8F6] border border-[#DCDAD5] rounded-lg p-2.5">
                <strong>تصنيف بازل:</strong> مطابقة آلية مع شجرة البنك (84 عقدة <span className="font-mono">L1/L2/L3</span>).
              </div>
              <div className="bg-[#F8F8F6] border border-[#DCDAD5] rounded-lg p-2.5">
                <strong>كتالوج ESG:</strong> فحص التوافق عبر <span className="font-mono">esg_taxonomy.py</span> وإلزام دليل لكل ركيزة <span className="font-mono">E/S/G</span>.
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                <strong>اتساق القبول:</strong> الفئة (1) مقبولة تمنع وجود خطة تصحيحية، ويُصدر تحذير عند تناقض الفئة (3/4) مع خطر متبقٍ منخفض <span className="font-mono">L</span>.
              </div>
            </div>
          </div>
        </div>
      );

    case 'evolution_timeline':
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {MODEL_EVOLUTION_MILESTONES.map((m, idx) => (
              <div
                key={m.stage}
                className={`rounded-2xl border p-4 flex flex-col justify-between space-y-3 ${
                  idx === 3
                    ? 'bg-[#09331F] text-white border-[#09331F]'
                    : idx === 2
                      ? 'bg-emerald-50/70 border-[#006547]/40 text-[#09331F]'
                      : 'bg-white border-[#DCDAD5] text-[#09331F]'
                }`}
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2 pb-2 border-b border-current/15">
                    <span className="text-xs font-extrabold">{m.stage}</span>
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                        idx === 3 ? 'bg-white/15 text-[#F79C1E]' : 'bg-[#F8F8F6] text-[#006547] border border-[#DCDAD5]'
                      }`}
                    >
                      {m.commitRef}
                    </span>
                  </div>

                  <div className="space-y-1.5 text-[11.5px] leading-relaxed">
                    <div>
                      <strong className={idx === 3 ? 'text-[#F79C1E]' : 'text-[#006547]'}>الاسترجاع: </strong>
                      <span className={idx === 3 ? 'text-emerald-50' : 'text-slate-700'}>{m.retrieval}</span>
                    </div>
                    <div>
                      <strong className={idx === 3 ? 'text-[#F79C1E]' : 'text-[#006547]'}>السياق والنموذج: </strong>
                      <span className={idx === 3 ? 'text-emerald-50' : 'text-slate-700'}>{m.contextAndTokens}</span>
                    </div>
                    <div>
                      <strong className={idx === 3 ? 'text-[#F79C1E]' : 'text-[#006547]'}>الجودة والحوكمة: </strong>
                      <span className={idx === 3 ? 'text-emerald-50' : 'text-slate-700'}>{m.qaAndCompliance}</span>
                    </div>
                  </div>
                </div>

                <div
                  className={`rounded-xl p-2.5 text-[11px] font-bold leading-relaxed ${
                    idx === 3
                      ? 'bg-white/10 text-white border border-white/15'
                      : 'bg-[#F8F8F6] text-[#09331F] border border-[#EFECE6]'
                  }`}
                >
                  المحصلة: {m.outcome}
                </div>
              </div>
            ))}
          </div>
        </div>
      );

    case 'rag_hybrid_rrf':
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="bg-white border border-[#DCDAD5] rounded-2xl p-5 space-y-2.5">
              <div className="flex items-center gap-2 text-sm font-extrabold text-[#09331F]">
                <Search className="w-4 h-4 text-[#006547]" />
                <span>المسار 1: المعجمي المتقدم (BM25 IDF)</span>
              </div>
              <ul className="space-y-2 text-xs text-slate-700 leading-relaxed">
                <li>• <strong>إصلاح اللام-ألف في PDF:</strong> 32 قاعدة إصلاح تلقائية (<span className="font-mono">المالحظة ← الملاحظة</span>، <span className="font-mono">اإلجراءات ← الإجراءات</span>).</li>
                <li>• <strong>التجذير والتطبيع العربي:</strong> حذف التشكيل، توحيد الألف والهاء والياء، وتجريد البوادي (<span className="font-mono">ال/وال/بال</span>) واللواحق.</li>
                <li>• <strong>9 مجموعات مرادفات ثنائية اللغة:</strong> ربط (<span className="font-mono">تسوية / نوسترو / reconciliation</span>) و(<span className="font-mono">حظر / عقوبات / OFAC / AML</span>) مع أوزان Bigrams.</li>
              </ul>
            </div>

            <div className="bg-white border border-[#DCDAD5] rounded-2xl p-5 space-y-2.5">
              <div className="flex items-center gap-2 text-sm font-extrabold text-[#09331F]">
                <Database className="w-4 h-4 text-[#006547]" />
                <span>المسار 2: التضمين الدلالي الهجين</span>
              </div>
              <ul className="space-y-2 text-xs text-slate-700 leading-relaxed">
                <li>• <strong>متجه سحابي عالي الدقة:</strong> استدعاء <span className="font-mono font-bold">gemini-embedding-2</span> عند التوفر وتخزين متجه كل مقطع في <span className="font-mono">SQLite (embedding_json)</span> لتفادي إعادة الحساب.</li>
                <li>• <strong>بديل محلي فوري (192-dim):</strong> دالة <span className="font-mono">computeLocalMultilingualSemanticVector</span> (24 بُعداً للمفاهيم المصرفية + 168 بُعداً للجذور وchar 3-grams عبر FNV-1a).</li>
                <li>• <strong>استخراج نافذة السياق الذكية:</strong> التقاط <strong>1,400 حرف</strong> متمركزة حول أول مطابقة بالفقرة.</li>
              </ul>
            </div>

            <div className="bg-[#09331F] text-white rounded-2xl p-5 flex flex-col justify-between space-y-3">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-[#F79C1E]">
                  <GitBranch className="w-4 h-4" />
                  <span>دمج الترتيب التبادلي (Reciprocal Rank Fusion)</span>
                </div>
                <p className="text-xs text-emerald-100/90 leading-relaxed">
                  يدمج ترتيب القائمة المعجمية (BM25) مع قائمة التشابه الدلالي (Cosine Vector) دون الحاجة لمعايرة الأوزان المطلقة:
                </p>
              </div>
              <div className="bg-[#062315] border border-white/15 rounded-xl p-3.5 text-center font-mono text-xs text-[#F79C1E]" dir="ltr">
                RRF_score(d) = 1 / (60 + rank_BM25) + 1 / (60 + rank_Vector)
              </div>
              <div className="text-[11px] text-emerald-100/85 leading-relaxed">
                كما تحمي الدالة الاستعلامات النظرية المفتوحة (مثل بازل 3 أو خطوط الدفاع الثلاث) من إقحام استشهادات ملف غير متعلقة.
              </div>
            </div>
          </div>
        </div>
      );

    case 'llm_profiles_prompting':
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white border border-[#DCDAD5] rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between border-b border-[#EFECE6] pb-2">
                <h3 className="text-sm font-extrabold text-[#09331F]">الوضع السريع (⚡ سريع · FAST)</h3>
                <span className="font-mono text-xs font-bold text-[#006547] bg-[#F8F8F6] border border-[#DCDAD5] px-2.5 py-1 rounded-lg">
                  qwen3:1.7b / LOW
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-[#F8F8F6] rounded-lg p-2.5"><strong>استرجاع RAG:</strong> <span className="font-mono">top_k = 8</span></div>
                <div className="bg-[#F8F8F6] rounded-lg p-2.5"><strong>حد التوليد:</strong> <span className="font-mono">2,560 tokens</span></div>
                <div className="bg-[#F8F8F6] rounded-lg p-2.5"><strong>درجة العشوائية:</strong> <span className="font-mono">temp = 0.15</span></div>
                <div className="bg-[#F8F8F6] rounded-lg p-2.5"><strong>المهلة القصوى:</strong> <span className="font-mono">25s timeout</span></div>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                مصمم للاستجابة الفورية في الأسئلة المباشرة وتلخيص السياسات واستكشاف الملاحظات دون إبطاء الجلسة.
              </p>
            </div>

            <div className="bg-emerald-50/60 border border-[#006547]/40 rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between border-b border-[#006547]/20 pb-2">
                <h3 className="text-sm font-extrabold text-[#09331F]">الوضع الدقيق (🎯 دقيق · HIGH PRECISION)</h3>
                <span className="font-mono text-xs font-bold text-white bg-[#09331F] px-2.5 py-1 rounded-lg">
                  qwen3.5:4b / HIGH
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-white border border-emerald-200 rounded-lg p-2.5"><strong>استرجاع RAG:</strong> <span className="font-mono">top_k = 16</span></div>
                <div className="bg-white border border-emerald-200 rounded-lg p-2.5"><strong>حد التوليد:</strong> <span className="font-mono">4,096 tokens</span></div>
                <div className="bg-white border border-emerald-200 rounded-lg p-2.5"><strong>درجة العشوائية:</strong> <span className="font-mono">temp = 0.10</span></div>
                <div className="bg-white border border-emerald-200 rounded-lg p-2.5"><strong>المهلة القصوى:</strong> <span className="font-mono">45s timeout</span></div>
              </div>
              <p className="text-xs text-slate-700 leading-relaxed">
                يستخدم <span className="font-mono font-bold">ThinkingLevel.HIGH</span> لبناء مصفوفة RCSA الشاملة متعددة الضوابط وربط L1/L2/L3 وESG.
              </p>
            </div>
          </div>

          <div className="bg-[#F8F8F6] border border-[#DCDAD5] rounded-2xl p-4 grid grid-cols-1 lg:grid-cols-3 gap-4 text-xs">
            <div>
              <div className="font-extrabold text-[#09331F]">1. حقن 12 قاعدة + مثال ذهبي (Few-Shot)</div>
              <p className="text-slate-600 mt-1 leading-relaxed">
                توجيه النموذج بنموذج حقل مثالي لسويفت MT103 يحدد هيكل الحدث+السبب+الأثر، وضابطين متكاملين، والقيم المرجعية الخمسة.
              </p>
            </div>
            <div>
              <div className="font-extrabold text-[#09331F]">2. مخرجات مهيكلة (Response Schema)</div>
              <p className="text-slate-600 mt-1 leading-relaxed">
                إلزام التوليد بمصفوفة JSON ذات حقول إجبارية واضحة (أو json_object عند الاتصال بـ Ollama / OpenAI-compatible).
              </p>
            </div>
            <div>
              <div className="font-extrabold text-[#09331F]">3. محلل مرن (parseResilientLlmJson)</div>
              <p className="text-slate-600 mt-1 leading-relaxed">
                يزيل كتل التفكير <span className="font-mono">&lt;think&gt;...&lt;/think&gt;</span> وعلامات Markdown والفواصل الزائدة ويستخلص الـ JSON الأبعد حدوداً بأمان.
              </p>
            </div>
          </div>
        </div>
      );

    case 'qa_self_critique':
      return (
        <div className="space-y-4">
          <div className="bg-[#09331F] text-white rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-xs leading-relaxed">
              <strong className="text-[#F79C1E]">مسار المراجعة قبل العرض (Two-Pass QA):</strong> يمر الناتج أولاً عبر{' '}
              <span className="font-mono font-bold">runLlmSelfCritiquePass</span> (مدقق جودة لغوي)، ثم يخضع تلقائياً لـ{' '}
              <span className="font-mono font-bold">evaluateAndRefineRcsaProposalQa</span> (فاحص ومصلح حتمي من 8 قواعد).
            </div>
            <div className="text-xs font-mono font-bold text-[#F79C1E] shrink-0">
              qa_score_pct (0–100%)
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            {[
              { num: '01', title: 'منع صياغة "احتمال..."', desc: 'حذف بادئة "احتمال/احتمالية" تلقائياً لصياغة الحدث التشغيلي مباشرة.' },
              { num: '02', title: 'تنظيف علامات الصفحات', desc: 'إزالة بقايا "صفحة X • مقطع (Y)" وامتدادات الملفات من العناوين.' },
              { num: '03', title: 'اكتمال السبب والأثر', desc: 'تنبيه تلقائي إذا خلت الفقرة من السبب والنتيجة التشغيلية.' },
              { num: '04', title: 'الأهداف الاستراتيجية الـ 5', desc: 'ضبط الهدف قسراً لأحد الأهداف الخمسة الرسمية للبنك الأهلي.' },
              { num: '05', title: 'نظافة الضوابط والدورية', desc: 'إزالة عبارات (وقائي - آلي) من النص واستبدال Per Transaction.' },
              { num: '06', title: 'التغطية المانعة والكاشفة', desc: 'توصية بإضافة ضابط كاشف عند الاكتفاء بضابط واحد فقط.' },
              { num: '07', title: 'معايرة الخسائر التاريخية', desc: 'تحذير فوري إذا كان التقدير أقل من 75% من خسارة حادثة فعلية.' },
              { num: '08', title: 'اتساق فئة القبول (1–4)', desc: 'توحيد الفئة (1) عند فعالية كل الضوابط وتفادي تناقض مصفوفة القبول.' },
            ].map((rule) => (
              <div key={rule.num} className="bg-white border border-[#DCDAD5] rounded-xl p-3.5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-extrabold text-[#006547]">{rule.num}</span>
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#006547]" />
                </div>
                <div className="font-extrabold text-[#09331F]">{rule.title}</div>
                <p className="text-[11px] text-slate-600 leading-relaxed">{rule.desc}</p>
              </div>
            ))}
          </div>
        </div>
      );

    case 'ai_security_lineage':
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            {
              icon: Lock,
              badge: 'حماية بيانات العملاء · PII Redaction',
              title: 'طمس تلقائي للبيانات البنكية الحساسة (redactBankingPii)',
              desc: 'قبل تمرير أي نص مستخلص لطبقة الاستدلال، تُحجب أرقام IBAN المصرية (EG + 27 رقم)، أرقام الهوية الوطنية (14 رقماً)، وأرقام بطاقات الدفع (16 رقماً).',
              sample: '[REDACTED-IBAN] · [REDACTED-NATIONAL-ID] · [REDACTED-CARD-PAN]',
            },
            {
              icon: AlertTriangle,
              badge: 'الأمن السيبراني · Prompt Quarantine',
              title: 'عزل محاولات حقن الأوامر (quarantinePromptInjection)',
              desc: 'تُعامل النصوص المرفوعة كبيانات غير موثوقة؛ وتُعزل أنماط التحايل (مثل تجاهل التعليمات أو override rrf) بوسم تحذيري صريح.',
              sample: '[QUARANTINED-UNTRUSTED-INSTRUCTION]',
            },
            {
              icon: ShieldCheck,
              badge: 'حارس الجودة · Scanned PDF & Fallback Guard',
              title: 'كشف الملفات المصورة (سكان) وفصل التقييم عن LLM',
              desc: 'يصدر رفض وتحذير واضح للمراجعة البشرية عند رفع PDF ممسوح ضوئياً بدون طبقة نصية، مع جدار stripForbiddenLlmFields.',
              sample: 'MANUAL_REVIEW_REQUIRED · No silent empty fallback',
            },
            {
              icon: Layers,
              badge: 'الشفافية والتدقيق · Source Lineage',
              title: 'نسب كل قيمة + تدقيق التغييرات على مستوى الحقل',
              desc: 'عرض أوسمة (مصدر أصلي / مقترح ذكي / تعديل مسودة / محرك بايثون / معتمد) داخل المصفوفة، مع مقارنة قبل/بعد في سجل Audit Trail.',
              sample: '5 Provenance Badges + Field-Level Audit Log',
            },
          ].map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.title}
                className="bg-white border border-[#DCDAD5] rounded-2xl p-5 flex flex-col justify-between space-y-3"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-[#006547]">{card.badge}</span>
                    <Icon className="w-4 h-4 text-[#006547] shrink-0" />
                  </div>
                  <h3 className="text-sm font-extrabold text-[#09331F]">{card.title}</h3>
                  <p className="text-xs text-slate-600 leading-relaxed">{card.desc}</p>
                </div>
                <div
                  className="bg-[#F8F8F6] border border-[#DCDAD5] rounded-lg px-3 py-2 text-[11px] font-mono text-[#09331F]"
                  dir="ltr"
                >
                  {card.sample}
                </div>
              </div>
            );
          })}
        </div>
      );

    case 'before_after_metrics':
      return (
        <div className="bg-white border border-[#DCDAD5] rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-[#EFECE6] pb-2">
            <h3 className="text-sm font-extrabold text-[#09331F]">
              ملخص الفارق الهندسي الفعلي: الإصدار الأولي (V1) مقابل الحالة الحالية (V4 SOTA)
            </h3>
            <span className="text-xs font-mono font-bold text-[#006547]">6 Improvement Axes</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-right border-collapse">
              <thead>
                <tr className="bg-[#09331F] text-white">
                  <th className="py-2.5 px-3 font-extrabold">محور التحسين</th>
                  <th className="py-2.5 px-3 font-extrabold">الوضع السابق (V1 Baseline)</th>
                  <th className="py-2.5 px-3 font-extrabold">الوضع الحالي (V4 SOTA)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DCDAD5]">
                {[
                  {
                    axis: 'نافذة استرجاع المقطع (Context Window)',
                    before: '240 حرفاً مقطوعة من بداية المقطع (يفقد الجداول والأدلة الوسطى).',
                    after: '1,400 حرف (×5.8) متمركزة حول موضع المطابقة الفعلي.',
                  },
                  {
                    axis: 'آلية البحث في المستندات (RAG)',
                    before: 'مطابقة كلمات حرفية حساسة للهمزات وتداخل PDF.',
                    after: 'Hybrid BM25 IDF + متجهات (192-dim / gemini-embedding-2) بدمج RRF (k=60) + 9 Clusters.',
                  },
                  {
                    axis: 'قدرة النماذج وسقف التوليد',
                    before: 'نموذج صغير (0.5B) مع استجابات متقطعة بدون Schema.',
                    after: 'ملفان مضبوطان (qwen3:1.7b / qwen3.5:4b وgemini-4-hydrogen) حتى 4,096 توكن + Schema.',
                  },
                  {
                    axis: 'سلامة الصياغة والمنهجية',
                    before: 'تسرب "احتمال..." وأرقام الصفحات وقيم مالية عشوائية (250K).',
                    after: 'بوابة QA ذات 8 قواعد + 5 قيم مرجعية رسمية + L1-L3 (84) + ESG (34).',
                  },
                  {
                    axis: 'منطق Key Risk والأبعاد غير المالية',
                    before: 'تشوش بين الكامن والمتبقي، وعدم توثيق خيار "-" للبعد القضائي.',
                    after: 'Key Risk من المتبقي + NFI فقط، وخيار "-" مبرر ومبدأ الأكثر تحوطاً.',
                  },
                  {
                    axis: 'الأمان والاعتماد الحسابي',
                    before: 'ثقة عامة بمخرجات النص بدون عزل PII أو جدار حقول.',
                    after: 'PII Redaction + Prompt Quarantine + Strip 15 Fields + Python Decimal.',
                  },
                ].map((r) => (
                  <tr key={r.axis} className="hover:bg-[#F8F8F6]/70">
                    <td className="py-2.5 px-3 font-extrabold text-[#09331F] bg-[#F8F8F6]/60">{r.axis}</td>
                    <td className="py-2.5 px-3 text-rose-900">{r.before}</td>
                    <td className="py-2.5 px-3 font-bold text-[#006547]">{r.after}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );

    case 'testing_roadmap':
      return (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-7 bg-white border border-[#DCDAD5] rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between border-b border-[#EFECE6] pb-2">
              <div className="flex items-center gap-2 text-sm font-extrabold text-[#09331F]">
                <FileCode2 className="w-4 h-4 text-[#006547]" />
                <span>بوابة التحقق والاختبارات الموثقة (Continuous Verification)</span>
              </div>
              <span className="font-mono text-xs font-bold text-[#006547]">0 Failures</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3.5">
                <div className="text-2xl font-extrabold font-mono tabular-nums text-[#006547]">82/82</div>
                <div className="font-extrabold text-[#09331F] mt-1">اختبارات تكامل Node.js</div>
                <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                  تغطي RAG الهجين، الوكيل الذكي، الصلاحيات، التصدير، وملاحظات البنك الـ9.
                </p>
              </div>
              <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3.5">
                <div className="text-2xl font-extrabold font-mono tabular-nums text-[#006547]">87</div>
                <div className="font-extrabold text-[#09331F] mt-1">اختبارات محرك بايثون</div>
                <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                  تحقق حتمي من EAL، مصفوفة RRF 3×3، Key Risk، وتصدير Excel الدقيق.
                </p>
              </div>
              <div className="bg-[#F8F8F6] border border-[#DCDAD5] rounded-xl p-3.5">
                <div className="text-2xl font-extrabold font-mono tabular-nums text-[#09331F]">100%</div>
                <div className="font-extrabold text-[#09331F] mt-1">فحص متصفح وبناء</div>
                <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                  تدقيق الأنواع tsc وVite build وفحص حي بالمتصفح (سطح المكتب والجوال).
                </p>
              </div>
            </div>

            <div className="bg-[#F8F8F6] border border-[#DCDAD5] rounded-xl p-3 text-xs text-slate-700 leading-relaxed">
              <strong>تغطية ملفات الاختبار:</strong>{' '}
              <span className="font-mono text-[11px]">
                phase2a · phase2b · phase2c · phase3a · phase3b_ai_agent · proposal_extractor · client_feedback_fixes · dashboard_analytics
              </span>
            </div>
          </div>

          <div className="lg:col-span-5 bg-[#09331F] text-white rounded-2xl p-5 flex flex-col justify-between space-y-3">
            <div className="space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-bold text-[#F79C1E]">
                <TrendingUp className="w-4 h-4" />
                <span>خارطة النشر الإنتاجي داخل شبكة البنك (Production Path)</span>
              </div>
              <div className="space-y-2 text-xs">
                <div className="bg-white/10 border border-white/15 rounded-xl p-3">
                  <strong>1. الاستضافة الداخلية للنماذج (On-Prem Ollama):</strong><br />
                  تشغيل <span className="font-mono">qwen3.5:4b</span> أو نماذج 8B محلياً داخل مركز بيانات البنك دون خروج أي وثيقة.
                </div>
                <div className="bg-white/10 border border-white/15 rounded-xl p-3">
                  <strong>2. التخزين المصرفي (Enterprise DB & WORM):</strong><br />
                  الانتقال من SQLite المحلي إلى قاعدة بيانات مصرفية مركزية وأرشفة غير قابلة للتعديل WORM لسجلات التدقيق.
                </div>
                <div className="bg-white/10 border border-white/15 rounded-xl p-3">
                  <strong>3. محرك OCR عربي للمستندات المصوّرة:</strong><br />
                  ربط قارئ ضوئي للوثائق الممسوحة لتحويل تنبيه المراجعة اليدوية إلى استخلاص آلي كامل.
                </div>
              </div>
            </div>
          </div>
        </div>
      );

    default:
      return null;
  }
};
