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
  ArrowRight,
  Layers,
  TrendingUp,
  Search,
  FileCode2,
  BookOpen,
} from 'lucide-react';
import {
  MethodologySlide,
  FINANCIAL_BANDS_TABLE,
  RRF_MATRIX_ROWS,
  MODEL_EVOLUTION_MILESTONES,
  METHODOLOGY_REFERENCES,
} from '../data/demoSlides.js';

export const MethodologySlideBody: React.FC<{ slide: MethodologySlide }> = ({ slide }) => {
  switch (slide.layout) {
    case 'deep_cover':
      return (
        <div className="space-y-6 text-left" dir="ltr">
          <div className="bg-[#09331F] text-white rounded-2xl p-6 sm:p-9 border border-[#006547] relative overflow-hidden">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div className="space-y-4 max-w-2xl">
                <div className="inline-flex items-center gap-2 text-xs font-bold text-[#F79C1E] tracking-wide">
                  <Cpu className="w-4 h-4 shrink-0" />
                  <span>Methodology, Model Engineering &amp; Performance Evolution (Deep Dive)</span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-extrabold leading-snug text-white">
                  {slide.title}
                </h2>
                <p className="text-sm sm:text-base text-emerald-100/90 leading-relaxed">
                  {slide.subtitle}
                </p>
              </div>

              <div className="shrink-0 bg-white/10 border border-white/15 rounded-2xl p-5 flex flex-col items-center justify-center min-w-[230px]">
                <img
                  src="/assets/nbe-logo-white.png"
                  alt="National Bank of Egypt"
                  className="h-14 w-auto object-contain mb-3"
                />
                <div className="text-xs font-bold text-emerald-100">
                  Methodology, Risk &amp; Model Audit
                </div>
                <div className="text-[11px] text-[#F79C1E] mt-0.5 font-mono tabular-nums">
                  Hybrid RAG · Python Decimal
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-7 pt-6 border-t border-white/15">
              {[
                {
                  num: '5.8x',
                  unit: 'Context Expansion',
                  desc: 'Grew from 240 to 1,400 chars per retrieved chunk (250-char overlap)',
                },
                {
                  num: '4,096',
                  unit: 'Token Output Budget',
                  desc: 'Structured multi-control extraction with schema enforcement',
                },
                {
                  num: '8',
                  unit: 'Self-Critique QA Rules',
                  desc: 'Automated quality scoring & repair pass prior to Maker sign-off',
                },
                {
                  num: '181',
                  unit: 'Automated Tests',
                  desc: '91 Node.js tests + 90 Python checks + V4→V5 P@1/MRR benchmark',
                },
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
                title: '1. Deterministic Quantitative Engine',
                body: 'All EAL formulas, 3x3 RRF lookups, NFI aggregation, and Key Risk classification run inside Python Decimal with zero LLM involvement.',
              },
              {
                title: '2. Industry Best-Practice Multimodal RAG',
                body: 'Combines ViT/Swin Vision parsing, table-aware Markdown chunking, BM25 + 192-dim dense vectors via RRF (k=60), and Stage-2 precision reranking.',
              },
              {
                title: '3. Documented V1-to-V5 Evolution',
                body: 'Traces every upgrade from the initial weak baseline through V4 NBE calibration and V5 multimodal Vision document understanding.',
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
        <div className="space-y-5 text-left" dir="ltr">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
            <div className="bg-white border border-[#DCDAD5] rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between border-b border-[#EFECE6] pb-2.5">
                <div className="flex items-center gap-2 text-sm font-extrabold text-[#09331F]">
                  <Database className="w-4 h-4 text-[#006547]" />
                  <span>Stage 1: Advisory AI &amp; Hybrid RAG</span>
                </div>
                <span className="text-[11px] font-mono text-[#006547] font-bold">TypeScript</span>
              </div>
              <ul className="space-y-2 text-xs text-slate-700 leading-relaxed">
                <li>• Universal document &amp; Vision parsing (PDF/DOCX/XLSX/PPTX/PNG/JPG) + Markdown table reconstruction.</li>
                <li>• Two-stage retrieval: BM25 + 192-dim/gemini vectors via RRF (k=60) + Stage-2 Precision Reranker.</li>
                <li>• Gold-standard few-shot extraction bounded by Basel (84) and CBE ESG (34) catalogues.</li>
                <li>• Evidence attribution: mandatory verbatim quote, file name, and page number per row.</li>
              </ul>
            </div>

            <div className="bg-amber-50/70 border border-amber-300 rounded-2xl p-5 space-y-3 flex flex-col justify-between">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between border-b border-amber-200 pb-2.5">
                  <div className="flex items-center gap-2 text-sm font-extrabold text-amber-950">
                    <ShieldCheck className="w-4 h-4 text-amber-700" />
                    <span>Stage 2: Sanitization Perimeter</span>
                  </div>
                  <span className="text-[11px] font-mono text-amber-800 font-bold">Guardrails</span>
                </div>
                <p className="text-xs text-slate-800 leading-relaxed">
                  <strong>stripForbiddenLlmFields()</strong> forcibly drops any unauthorized score, RRF,
                  or approval key an LLM emits:
                </p>
                <div className="bg-white border border-amber-200 rounded-xl p-2.5 font-mono text-[11px] text-rose-900 leading-relaxed">
                  inherent_eal · inherent_rating · rrf_applied · residual_eal · residual_rating ·
                  overall_nfi_score · is_key_risk · approval_status · approved_by (15 fields)
                </div>
              </div>
              <div className="text-[11px] font-bold text-amber-900 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 shrink-0" />
                <span>AI never calculates ratings and never approves rows</span>
              </div>
            </div>

            <div className="bg-[#09331F] text-white rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between border-b border-white/15 pb-2.5">
                <div className="flex items-center gap-2 text-sm font-extrabold text-white">
                  <Calculator className="w-4 h-4 text-[#F79C1E]" />
                  <span>Stage 3: Deterministic Engine</span>
                </div>
                <span className="text-[11px] font-mono text-[#F79C1E] font-bold">Python Decimal</span>
              </div>
              <ul className="space-y-2 text-xs text-emerald-100/90 leading-relaxed">
                <li>• Fixed-precision Decimal arithmetic avoiding IEEE-754 floating-point drift.</li>
                <li>• Phase 2A: Inherent EAL + 5x5 matrix rating + EI880:EI884 reference anchors.</li>
                <li>• Phase 2B: Official 3x3 RRF lookup (MAX rule) + residual exposure &amp; acceptability.</li>
                <li>• Phase 2C: NFI 4x5 worst-case aggregation, &quot;-&quot; justification, and residual-only Key Risk.</li>
              </ul>
            </div>
          </div>

          <div className="bg-[#F8F8F6] border border-[#DCDAD5] rounded-xl p-3.5 flex flex-wrap items-center justify-center gap-3 text-xs font-bold text-[#09331F]">
            <span>Bank Policy / Audit / Incident Files</span>
            <ArrowRight className="w-4 h-4 text-[#006547]" />
            <span>Hybrid RAG + LLM Draft</span>
            <ArrowRight className="w-4 h-4 text-[#006547]" />
            <span>8-Rule QA + 15-Field Strip</span>
            <ArrowRight className="w-4 h-4 text-[#006547]" />
            <span>Human Accept / Edit</span>
            <ArrowRight className="w-4 h-4 text-[#006547]" />
            <span className="text-[#006547]">Python Decimal Compute + Checker Lock</span>
          </div>
        </div>
      );

    case 'phase2a_financial':
      return (
        <div className="space-y-4 text-left" dir="ltr">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-7 bg-white border border-[#DCDAD5] rounded-2xl p-4 sm:p-5 space-y-3">
              <div className="flex items-center justify-between border-b border-[#EFECE6] pb-2">
                <h3 className="text-sm font-extrabold text-[#09331F]">
                  Official EGP Impact Bands &amp; EI880:EI884 Reference Anchors
                </h3>
                <span className="text-[11px] font-mono text-[#006547] font-bold">Phase 2A</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="bg-[#09331F] text-white">
                      <th className="py-2 px-3 rounded-tl-lg">Band</th>
                      <th className="py-2 px-3">Rating</th>
                      <th className="py-2 px-3">Official Range (EGP)</th>
                      <th className="py-2 px-3 rounded-tr-lg">Anchor (EI880:EI884)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EFECE6]">
                    {FINANCIAL_BANDS_TABLE.map((row) => (
                      <tr key={row.code} className="hover:bg-[#F8F8F6]">
                        <td className="py-2 px-3 font-mono font-extrabold text-[#006547]">
                          {row.code}
                        </td>
                        <td className="py-2 px-3 font-bold text-[#09331F]">{row.labelEn}</td>
                        <td className="py-2 px-3 font-mono tabular-nums text-slate-700">
                          {row.rangeEn}
                        </td>
                        <td className="py-2 px-3 font-mono tabular-nums font-extrabold text-[#9A5B00]">
                          {row.anchorEgp}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="lg:col-span-5 space-y-3">
              <div className="bg-[#09331F] text-white rounded-2xl p-4 space-y-2.5">
                <div className="text-xs font-bold text-[#F79C1E]">
                  Deterministic Inherent Loss Formulas
                </div>
                <div className="bg-white/10 border border-white/15 rounded-xl p-3 font-mono text-xs space-y-1.5">
                  <div>Inherent_EAL = Avg_Impact_EGP × Freq_Multiplier</div>
                  <div>Residual_EAL = Inherent_EAL × (1 - MAX_RRF)</div>
                </div>
                <div className="text-[11px] text-emerald-100/90 leading-relaxed">
                  <strong>Official Frequency Multipliers:</strong> Yearly <span className="font-mono">1</span> ·
                  Semi-Annually <span className="font-mono">2</span> · Quarterly <span className="font-mono">4</span> ·
                  Monthly <span className="font-mono">12</span> · Weekly <span className="font-mono">52</span> · Daily{' '}
                  <span className="font-mono">250</span>.
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 space-y-1.5">
                <div className="flex items-center gap-2 text-xs font-extrabold text-amber-950">
                  <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                  <span>Historical Loss Calibration Check (&lt; 75% Threshold)</span>
                </div>
                <p className="text-xs text-slate-700 leading-relaxed">
                  Automatic cross-check against the Historical Loss DB: whenever an assessment&apos;s
                  Inherent EAL falls below <strong>75%</strong> of actual unit losses over the past 2 years,
                  an under-estimation alert is raised for the Checker.
                </p>
              </div>
            </div>
          </div>
        </div>
      );

    case 'phase2b_controls':
      return (
        <div className="space-y-4 text-left" dir="ltr">
          <div className="bg-white border border-[#DCDAD5] rounded-2xl p-4 sm:p-5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#EFECE6] pb-2.5">
              <h3 className="text-sm font-extrabold text-[#09331F]">
                Official 3×3 Risk Reduction Factor Matrix (OFFICIAL_RRF_MATRIX · EG889:EI897)
              </h3>
              <span className="text-xs font-mono font-bold text-[#006547]">RRF Lookup</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-center">
                <thead>
                  <tr className="bg-[#09331F] text-white">
                    <th className="py-2.5 px-4 text-left rounded-tl-lg">Execution Mechanism</th>
                    <th className="py-2.5 px-4">Preventive</th>
                    <th className="py-2.5 px-4">Detective</th>
                    <th className="py-2.5 px-4 rounded-tr-lg">Corrective</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EFECE6]">
                  {RRF_MATRIX_ROWS.map((row) => (
                    <tr key={row.methodEn}>
                      <td className="py-2.5 px-4 text-left font-extrabold text-[#09331F] bg-[#F8F8F6]">
                        {row.methodEn}
                      </td>
                      <td className="py-2.5 px-4 font-mono font-extrabold text-emerald-900 tabular-nums">
                        {row.preventive}
                      </td>
                      <td className="py-2.5 px-4 font-mono font-extrabold text-[#006547] tabular-nums">
                        {row.detective}
                      </td>
                      <td className="py-2.5 px-4 font-mono font-extrabold text-amber-900 tabular-nums">
                        {row.corrective}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 text-xs">
            <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-4 space-y-1.5">
              <div className="font-extrabold text-[#09331F]">1. Conservative MAX RRF Rule</div>
              <p className="text-slate-700 leading-relaxed">
                The engine selects the <strong>highest single eligible control</strong> rather than
                adding control percentages together, preventing artificial risk understatement.
              </p>
            </div>
            <div className="bg-rose-50/70 border border-rose-200 rounded-xl p-4 space-y-1.5">
              <div className="font-extrabold text-rose-950">2. Zero Credit for Proposed Controls</div>
              <p className="text-slate-700 leading-relaxed">
                Any control marked <span className="font-mono font-bold">PROPOSED</span> or unrelated
                to the specific threat receives exactly <strong>0%</strong> credit until verified as implemented.
              </p>
            </div>
            <div className="bg-[#F8F8F6] border border-[#DCDAD5] rounded-xl p-4 space-y-1.5">
              <div className="font-extrabold text-[#09331F]">3. Clean Text &amp; 7 Official Cadences</div>
              <p className="text-slate-700 leading-relaxed">
                Strips redundant mechanism tags from Column M control text and enforces the 7 official
                cadences (blocking invalid labels such as <span className="font-mono">Per Transaction</span>).
              </p>
            </div>
          </div>
        </div>
      );

    case 'phase2c_nfi_esg':
      return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 text-left" dir="ltr">
          <div className="bg-white border border-[#DCDAD5] rounded-2xl p-5 space-y-3">
            <div className="text-xs font-mono font-bold text-[#006547]">Slide 4 · NFI Matrix (4×5)</div>
            <h3 className="text-sm font-extrabold text-[#09331F]">
              Non-Financial Impact &amp; &quot;-&quot; Justification
            </h3>
            <ul className="space-y-2 text-xs text-slate-700 leading-relaxed">
              <li>
                • Four independent dimensions rated <span className="font-mono">1–5</span>:
                Service/Customer Disruption, Reputation, Regulatory/CBE, Legal/Judicial.
              </li>
              <li>
                • Selecting <strong>&quot;-&quot; (Not Applicable)</strong> requires a written rationale
                and excludes the dimension rather than defaulting to 1.
              </li>
              <li>
                • <strong>Worst-Case Principle:</strong> Overall NFI equals the highest severity score
                across applicable dimensions, paired with mandatory dimension evidence.
              </li>
            </ul>
          </div>

          <div className="bg-white border border-[#DCDAD5] rounded-2xl p-5 space-y-3">
            <div className="text-xs font-mono font-bold text-[#006547]">Basel L1–L3 &amp; CBE ESG</div>
            <h3 className="text-sm font-extrabold text-[#09331F]">
              Taxonomic Binding &amp; 1–4 Acceptability Rules
            </h3>
            <ul className="space-y-2 text-xs text-slate-700 leading-relaxed">
              <li>
                • Strict hierarchical validation across <strong>84 Basel nodes</strong> (7 L1 event
                categories down to L3) plus an &quot;Other&quot; option with custom specification.
              </li>
              <li>
                • Mandatory mapping against the <strong>34 CBE ESG cases</strong> across Environmental (E),
                Social (S), and Governance (G) pillars.
              </li>
              <li>
                • Blocks selecting Acceptability Category <span className="font-mono">(1) Acceptable</span> whenever
                a remediation Action Plan is present.
              </li>
            </ul>
          </div>

          <div className="bg-[#09331F] text-white rounded-2xl p-5 flex flex-col justify-between space-y-3">
            <div className="space-y-2">
              <div className="text-xs font-mono font-bold text-[#F79C1E]">Strict NBE Key Risk Rule</div>
              <h3 className="text-base font-extrabold">Residual-Only Classification</h3>
              <p className="text-xs text-emerald-100/90 leading-relaxed">
                Inherent ratings never trigger Key Risk status. Following NBE audit calibration,{' '}
                <span className="font-mono">is_key_risk = &quot;Yes&quot;</span> holds if and only if:
              </p>
            </div>
            <div className="space-y-2 font-mono text-xs">
              <div className="bg-white/10 border border-white/15 rounded-xl p-3">
                residual_financial_rating IN (H, VH, C)
              </div>
              <div className="text-center text-[#F79C1E] font-bold">OR</div>
              <div className="bg-white/10 border border-white/15 rounded-xl p-3">
                any_applicable_nfi_dimension IN (H, VH, C)
              </div>
            </div>
          </div>
        </div>
      );

    case 'evolution_timeline':
      return (
        <div className="space-y-4 text-left" dir="ltr">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {MODEL_EVOLUTION_MILESTONES.map((step, idx) => {
              const isLatest = idx === MODEL_EVOLUTION_MILESTONES.length - 1;
              return (
                <div
                  key={step.stage}
                  className={`rounded-2xl p-4 border flex flex-col justify-between space-y-3 ${
                    isLatest
                      ? 'bg-[#09331F] text-white border-[#09331F] md:col-span-2 lg:col-span-2'
                      : 'bg-white text-slate-800 border-[#DCDAD5]'
                  }`}
                >
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-2 pb-2 border-b border-current/15">
                      <span
                        className={`text-xs font-extrabold ${
                          isLatest ? 'text-[#F79C1E]' : 'text-[#09331F]'
                        }`}
                      >
                        {step.stage}
                      </span>
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded-md border ${
                          isLatest
                            ? 'bg-white/10 border-white/20 text-emerald-100'
                            : 'bg-[#F8F8F6] border-[#DCDAD5] text-[#006547]'
                        }`}
                      >
                        {step.commitRef}
                      </span>
                    </div>

                    <div className="text-[11.5px] space-y-2 leading-relaxed">
                      <div>
                        <strong className={isLatest ? 'text-[#F79C1E]' : 'text-[#006547]'}>
                          Retrieval:{' '}
                        </strong>
                        <span>{step.retrieval}</span>
                      </div>
                      <div>
                        <strong className={isLatest ? 'text-[#F79C1E]' : 'text-[#006547]'}>
                          Context &amp; Model:{' '}
                        </strong>
                        <span>{step.contextAndTokens}</span>
                      </div>
                      <div>
                        <strong className={isLatest ? 'text-[#F79C1E]' : 'text-[#006547]'}>
                          QA &amp; Governance:{' '}
                        </strong>
                        <span>{step.qaAndCompliance}</span>
                      </div>
                    </div>
                  </div>

                  <div
                    className={`rounded-xl p-2.5 text-[11px] font-bold leading-relaxed ${
                      isLatest
                        ? 'bg-white/10 text-emerald-100'
                        : 'bg-[#F8F8F6] text-[#09331F] border border-[#EFECE6]'
                    }`}
                  >
                    Impact: {step.outcome}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      );

    case 'rag_hybrid_rrf':
      return (
        <div className="space-y-4 text-left" dir="ltr">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="bg-white border border-[#DCDAD5] rounded-2xl p-5 space-y-2.5">
              <div className="flex items-center gap-2 text-sm font-extrabold text-[#09331F]">
                <Search className="w-4 h-4 text-[#006547]" />
                <span>Leg 1: Arabic Normalization + BM25</span>
              </div>
              <ul className="space-y-2 text-xs text-slate-700 leading-relaxed">
                <li>
                  • Repairs <strong>30+ PDF Identity-H Lam-Alef ligature distortions</strong> prior to chunk indexing.
                </li>
                <li>
                  • Arabic root stemming + <strong>9 banking synonym clusters</strong> (cyber, fraud, AML, SLA, third-party, reconciliation, credit, liquidity, ESG).
                </li>
                <li>
                  • Overlapping sliding chunks: <span className="font-mono font-bold">1,400 chars / 250 overlap</span>.
                </li>
              </ul>
            </div>

            <div className="bg-white border border-[#DCDAD5] rounded-2xl p-5 space-y-2.5">
              <div className="flex items-center gap-2 text-sm font-extrabold text-[#09331F]">
                <Layers className="w-4 h-4 text-[#006547]" />
                <span>Leg 2: Dense Semantic Vectors</span>
              </div>
              <ul className="space-y-2 text-xs text-slate-700 leading-relaxed">
                <li>
                  • Computes semantic embeddings via <span className="font-mono font-bold">gemini-embedding-2</span> or local <strong>192-dim</strong> feature projection fallback.
                </li>
                <li>
                  • Stored persistently in SQLite (<span className="font-mono">embedding_json</span>) to avoid re-indexing overhead.
                </li>
                <li>
                  • Resolves English risk prompts against Arabic banking SOP clauses cleanly.
                </li>
              </ul>
            </div>

            <div className="bg-[#09331F] text-white rounded-2xl p-5 space-y-3 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-extrabold text-[#F79C1E]">
                  <GitBranch className="w-4 h-4 shrink-0" />
                  <span>Stage-1 RRF (k=60) + Stage-2 Reranker</span>
                </div>
                <div className="bg-white/10 border border-white/15 rounded-xl p-3 font-mono text-[11px]">
                  stage2 = rrf + multi_concept + bigram + code_match + table_bonus
                </div>
                <p className="text-xs text-emerald-100/90 leading-relaxed">
                  Applies Cormack et al. (2009) RRF (<span className="font-mono">k = 60</span>) followed by{' '}
                  <span className="font-mono">rerankCandidatesWithStage2</span> to elevate exact table rows and codes.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-emerald-50/70 border border-[#006547]/30 rounded-xl p-3.5 text-xs text-slate-800 flex items-center gap-2.5">
            <Sparkles className="w-4 h-4 text-[#006547] shrink-0" />
            <span>
              <strong>V5 Vision &amp; Table-Aware Guard:</strong> Scanned PDFs &amp; images trigger ViT/Swin multimodal OCR (<span className="font-mono font-bold">vision-document-parser.ts</span>) while <span className="font-mono font-bold">table-chunker.ts</span> preserves Markdown column headers across row splits.
            </span>
          </div>
        </div>
      );

    case 'llm_profiles_prompting':
      return (
        <div className="space-y-4 text-left" dir="ltr">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-[#F8F8F6] border border-[#DCDAD5] rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between border-b border-[#DCDAD5] pb-2">
                <span className="text-sm font-extrabold text-[#09331F]">Fast Mode (Q&amp;A &amp; Summaries)</span>
                <span className="font-mono text-xs font-bold text-[#006547]">qwen3:1.7b / LOW</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <div className="bg-white border border-[#DCDAD5] rounded-lg p-2.5">rag_top_k: <strong>8</strong></div>
                <div className="bg-white border border-[#DCDAD5] rounded-lg p-2.5">temperature: <strong>0.15</strong></div>
                <div className="bg-white border border-[#DCDAD5] rounded-lg p-2.5">max_tokens: <strong>2,560</strong></div>
                <div className="bg-white border border-[#DCDAD5] rounded-lg p-2.5">timeout: <strong>25s</strong></div>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Tuned for low-latency interactive questions across uploaded policy manuals during assessment drafting.
              </p>
            </div>

            <div className="bg-emerald-50/60 border border-[#006547]/40 rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between border-b border-[#006547]/20 pb-2">
                <span className="text-sm font-extrabold text-[#09331F]">Accurate Mode (Deep Matrix Extraction)</span>
                <span className="font-mono text-xs font-bold text-[#006547]">qwen3.5:4b / HIGH</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <div className="bg-white border border-emerald-200 rounded-lg p-2.5">rag_top_k: <strong>16</strong></div>
                <div className="bg-white border border-emerald-200 rounded-lg p-2.5">temperature: <strong>0.10</strong></div>
                <div className="bg-white border border-emerald-200 rounded-lg p-2.5">max_tokens: <strong>4,096</strong></div>
                <div className="bg-white border border-emerald-200 rounded-lg p-2.5">timeout: <strong>45s</strong></div>
              </div>
              <p className="text-xs text-slate-700 leading-relaxed">
                Activated for full structured risk/control extraction alongside the mandatory self-refinement QA pass.
              </p>
            </div>
          </div>

          <div className="bg-[#09331F] text-white rounded-2xl p-4 sm:p-5 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="space-y-1.5">
              <div className="font-extrabold text-[#F79C1E]">Gold-Standard Few-Shot Anchoring</div>
              <p className="text-emerald-100/90 leading-relaxed">
                System prompts embed a calibrated RCSA template enforcing Cause → Event → Impact structure,
                valid Basel L1–L3 codes, and zero calculation guesses.
              </p>
            </div>
            <div className="space-y-1.5">
              <div className="font-extrabold text-[#F79C1E] font-mono">parseResilientLlmJson()</div>
              <p className="text-emerald-100/90 leading-relaxed">
                Automatically strips <span className="font-mono">&lt;think&gt;...&lt;/think&gt;</span> blocks, markdown
                fences, and trailing commas so structured extraction never fails on reasoning tokens.
              </p>
            </div>
          </div>
        </div>
      );

    case 'qa_self_critique':
      return (
        <div className="space-y-4 text-left" dir="ltr">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            {[
              { code: 'QA-01', title: 'No Hedged Openers', desc: 'Strips weak "Probability..." / "Risk of..." openers; starts with direct operational failure.' },
              { code: 'QA-02', title: 'Cause-Event-Impact', desc: 'Verifies complete structural narrative rather than fragmented bullet labels.' },
              { code: 'QA-03', title: 'Evidence & Page Citation', desc: 'Requires verbatim quote (evidence_quote), file name, and page number.' },
              { code: 'QA-04', title: '5 Strategic Objectives', desc: 'Maps strictly to NBE approved strategic risk objectives without drift.' },
              { code: 'QA-05', title: 'Clean Control Narrative', desc: 'Removes execution method prefixes from Column M control descriptions.' },
              { code: 'QA-06', title: '7 Official Cadences', desc: 'Replaces invalid phrases like "Per Transaction" with Daily/Monthly/Yearly cadence.' },
              { code: 'QA-07', title: 'Basel (84) & CBE ESG (34)', desc: 'Validates valid taxonomy IDs and consistent E/S/G pillar linkage.' },
              { code: 'QA-08', title: 'Accurate Self-Critique', desc: 'In Accurate mode, runs runLlmSelfCritiquePass (Madaan et al. Self-Refine).' },
            ].map((rule) => (
              <div key={rule.code} className="bg-white border border-[#DCDAD5] rounded-xl p-3.5 space-y-1">
                <div className="font-mono font-extrabold text-[#006547]">{rule.code}</div>
                <div className="font-extrabold text-[#09331F]">{rule.title}</div>
                <p className="text-[11px] text-slate-600 leading-relaxed">{rule.desc}</p>
              </div>
            ))}
          </div>

          <div className="bg-emerald-50/70 border border-[#006547]/30 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="space-y-1">
              <div className="font-extrabold text-[#09331F] flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#F79C1E]" />
                <span>Automated Quality Score (0–100) + Historical Loss Calibration (&lt;75%)</span>
              </div>
              <p className="text-slate-700">
                Every proposal surfaces its <span className="font-mono font-bold">qa_score</span> and any historical
                loss warnings directly in the card before Maker acceptance into the official matrix.
              </p>
            </div>
            <span className="font-mono font-extrabold text-[#006547] bg-white border border-[#DCDAD5] px-3 py-1.5 rounded-lg shrink-0">
              Accept / Edit / Reject
            </span>
          </div>
        </div>
      );

    case 'ai_security_lineage':
      return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-left" dir="ltr">
          <div className="bg-white border border-[#DCDAD5] rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-2 text-sm font-extrabold text-[#09331F] border-b border-[#EFECE6] pb-2">
              <Lock className="w-4 h-4 text-[#006547]" />
              <span>Layered Banking AI Defense (OWASP LLM &amp; NIST AI RMF)</span>
            </div>
            <div className="space-y-2.5 text-xs">
              <div className="bg-[#F8F8F6] border border-[#DCDAD5] rounded-xl p-3">
                <div className="font-extrabold text-[#09331F] font-mono">1. redactBankingPii()</div>
                <p className="text-slate-600 mt-1">
                  Automatically redacts Egyptian IBANs (<span className="font-mono">EG...</span>), 14-digit
                  National IDs, and 16-digit PAN card numbers prior to prompt assembly.
                </p>
              </div>
              <div className="bg-[#F8F8F6] border border-[#DCDAD5] rounded-xl p-3">
                <div className="font-extrabold text-[#09331F] font-mono">2. quarantinePromptInjection()</div>
                <p className="text-slate-600 mt-1">
                  Detects and neutralizes embedded override directives inside uploaded SOP/audit files and
                  sandboxes untrusted text inside non-executable delimiters (OWASP LLM01).
                </p>
              </div>
              <div className="bg-rose-50/70 border border-rose-200 rounded-xl p-3">
                <div className="font-extrabold text-rose-950 font-mono">3. stripForbiddenLlmFields()</div>
                <p className="text-rose-900 mt-1">
                  Drops 15 restricted rating, RRF, and approval fields from LLM output so model hallucinations
                  can never alter financial calculations or workflow authority.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white border border-[#DCDAD5] rounded-2xl p-5 space-y-3 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-extrabold text-[#09331F] border-b border-[#EFECE6] pb-2">
                <FileCode2 className="w-4 h-4 text-[#006547]" />
                <span>Five Cell-Level Data Provenance Badges (Audit Trail)</span>
              </div>
              <div className="space-y-2 text-xs">
                {[
                  { badge: 'Original Baseline', desc: 'Imported directly from prior approved RCSA baseline.' },
                  { badge: 'AI Proposed', desc: 'Extracted with document evidence and explicitly approved by Maker.' },
                  { badge: 'Draft Edit', desc: 'Manually modified by Maker; highlighted before/after for Checker.' },
                  { badge: 'Python Calculated', desc: 'Deterministic Python Decimal engine result (read-only).' },
                  { badge: 'Checker Approved', desc: 'Locked in an immutable audited cycle by an independent Checker.' },
                ].map((item) => (
                  <div key={item.badge} className="bg-[#F8F8F6] border border-[#DCDAD5] rounded-lg px-3 py-2 flex items-center justify-between gap-2">
                    <span className="font-extrabold text-[#09331F] shrink-0">{item.badge}</span>
                    <span className="text-slate-600 text-[11px]">{item.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      );

    case 'before_after_metrics':
      return (
        <div className="bg-white border border-[#DCDAD5] rounded-2xl p-4 sm:p-5 space-y-3 text-left" dir="ltr">
          <div className="flex items-center justify-between border-b border-[#EFECE6] pb-2.5">
            <div className="flex items-center gap-2 text-sm font-extrabold text-[#09331F]">
              <TrendingUp className="w-4 h-4 text-[#006547]" />
              <span>Repository-Verified Architectural Uplift: V1 Baseline vs. V5 Multimodal Architecture</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="bg-[#09331F] text-white">
                  <th className="py-2.5 px-3 rounded-tl-lg">Engineering Dimension</th>
                  <th className="py-2.5 px-3">V1 Weak Baseline (4301a33)</th>
                  <th className="py-2.5 px-3 rounded-tr-lg">V5 Multimodal &amp; Reranked Architecture</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EFECE6]">
                {[
                  {
                    axis: 'Context Window & Output Tokens',
                    before: '240 chars per snippet · constrained 0.5B generation',
                    after: '1,400 chars per snippet (5.8x) · 4,096 token output budget · header-preserved tables',
                  },
                  {
                    axis: 'Images, Scanned PDFs & Tables',
                    before: 'Image/scan files stored unparsed (0 chunks); tables flattened into broken text',
                    after: 'ViT/Swin Vision OCR + embedded PDF image extractor + Markdown table reconstruction',
                  },
                  {
                    axis: 'Search & Two-Stage Ranking',
                    before: 'Exact substring lookup (LIKE); sensitive to Arabic PDF font breaks',
                    after: '30+ Lam-Alef fixes + BM25 + Vectors via RRF (k=60) + Stage-2 Precision Reranker',
                  },
                  {
                    axis: 'Model Profiles & JSON Recovery',
                    before: 'Single small model; prone to broken JSON & <think> parse failures',
                    after: 'Dual profiles (qwen3:1.7b / qwen3.5:4b) + gold few-shot + resilient JSON parser',
                  },
                  {
                    axis: 'Quality Gate & Security Perimeter',
                    before: 'Unchecked raw output; no PII masking or strict field stripping',
                    after: '8 deterministic NBE QA rules + Self-Refine + PII redaction + 15 fields stripped',
                  },
                  {
                    axis: 'Methodological Compliance',
                    before: 'Key Risk overlapped with inherent risk; rigid NFI & single-source flow',
                    after: 'Residual-only Key Risk, Slide 4 NFI ("-"), Basel 84, CBE ESG 34, Dual-Source',
                  },
                ].map((row) => (
                  <tr key={row.axis} className="hover:bg-[#F8F8F6]">
                    <td className="py-2.5 px-3 font-extrabold text-[#09331F]">{row.axis}</td>
                    <td className="py-2.5 px-3 text-rose-900 bg-rose-50/40">{row.before}</td>
                    <td className="py-2.5 px-3 text-emerald-950 font-bold bg-emerald-50/40">
                      {row.after}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );

    case 'testing_roadmap':
      return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-left" dir="ltr">
          <div className="bg-white border border-[#DCDAD5] rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-2 text-sm font-extrabold text-[#09331F] border-b border-[#EFECE6] pb-2">
              <CheckCircle2 className="w-4 h-4 text-[#006547]" />
              <span>Continuous Verification Suite (Actually Executed)</span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                <div className="text-2xl font-extrabold font-mono text-[#006547] tabular-nums">91</div>
                <div className="text-[11px] font-bold text-[#09331F]">Node.js / TypeScript Tests</div>
              </div>
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                <div className="text-2xl font-extrabold font-mono text-[#006547] tabular-nums">90</div>
                <div className="text-[11px] font-bold text-[#09331F]">Python Decimal &amp; Extractor Tests</div>
              </div>
            </div>
            <ul className="space-y-1.5 text-xs text-slate-700 leading-relaxed">
              <li>• <strong>V5 Multimodal &amp; Rerank:</strong> Verified PNG/PDF Vision parsing, Markdown table chunking, and Stage-2 Reranker uplift (P@1: 0% → 100%, MRR: 0.400 → 1.000 vs Stage-1 RRF).</li>
              <li>• Hybrid RRF vector/BM25 ranking, Arabic Lam-Alef restoration, PII redaction, and injection quarantine.</li>
              <li>• End-to-end 29-column official Excel export (C–AE), green Committee PDF, and RBAC separation.</li>
              <li>• Live Playwright browser verification on Desktop (1440×900) and Mobile (390×844) with zero console errors.</li>
            </ul>
          </div>

          <div className="bg-[#09331F] text-white rounded-2xl p-5 space-y-3 flex flex-col justify-between">
            <div className="space-y-2.5">
              <div className="text-xs font-mono font-bold text-[#F79C1E]">
                Enterprise Bank Deployment Roadmap
              </div>
              <h3 className="text-base font-extrabold">Scaling Inside NBE Infrastructure</h3>
              <ul className="space-y-2 text-xs text-emerald-100/90 leading-relaxed">
                <li>
                  • <strong>Air-Gapped On-Premises LLM:</strong> Connect local GPU-backed Ollama cluster
                  (<span className="font-mono">qwen3 / qwen3.5</span>) so zero policy data ever leaves NBE networks.
                </li>
                <li>
                  • <strong>Active Directory / LDAP SSO &amp; Loss DB Sync:</strong> Seamless corporate
                  authentication and automated operational loss feed ingestion.
                </li>
                <li>
                  • <strong>WORM Audit Archiving &amp; OCR Pipeline:</strong> Immutable storage for approved
                  cycles plus dedicated OCR ingestion for scanned legacy directives.
                </li>
              </ul>
            </div>
          </div>
        </div>
      );

    case 'references':
      return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 text-left" dir="ltr">
          {METHODOLOGY_REFERENCES.map((group) => (
            <div
              key={group.category}
              className="bg-white border border-[#DCDAD5] rounded-2xl p-4 sm:p-5 space-y-3 flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs font-extrabold text-[#006547] border-b border-[#EFECE6] pb-2">
                  <BookOpen className="w-4 h-4 shrink-0" />
                  <span>{group.category}</span>
                </div>
                <div className="space-y-2.5">
                  {group.items.map((ref) => (
                    <div
                      key={ref.title}
                      className="bg-[#F8F8F6] border border-[#DCDAD5] rounded-xl p-3 space-y-1"
                    >
                      <div className="text-[11px] font-bold text-[#9A5B00]">{ref.citation}</div>
                      <div className="text-xs font-extrabold text-[#09331F] leading-snug">
                        {ref.title}
                      </div>
                      <p className="text-[11px] text-slate-600 leading-relaxed">
                        <strong>Applied in Platform:</strong> {ref.roleInSystem}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      );

    default:
      return null;
  }
};
