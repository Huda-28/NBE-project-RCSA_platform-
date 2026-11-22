import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  ClipboardList,
  Grid,
  Layers,
  Shield,
  TrendingDown,
} from 'lucide-react';
import { PageId } from './Sidebar.js';
import { AppNavigationState } from '../App.js';
import {
  computePortfolioAnalytics,
  DashboardRiskRecord,
  DashboardControlRecord,
  DashboardIncidentRecord,
  DashboardActionPlanRecord,
  FREQUENCY_BAND_LABELS_AR,
  HeatmapCell,
  HeatmapMode,
  IMPACT_BAND_LABELS_AR,
  SeverityTone,
} from '../utils/dashboardAnalytics.js';

interface ExecutiveAnalyticsSectionProps {
  units: Array<{ id: string; name_ar: string; code: string }>;
  selectedUnitId: string | null;
  onSelectUnitFilter: (unitId: string | null) => void;
  analyticsData: {
    risk_records: DashboardRiskRecord[];
    control_records: DashboardControlRecord[];
    incident_records: DashboardIncidentRecord[];
    action_plan_records: DashboardActionPlanRecord[];
  };
  onNavigate?: (next: Partial<AppNavigationState> & { page: PageId }) => void;
}

function formatCompactEgp(value: number): string {
  const num = Number(value || 0);
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(2)} مليون`;
  }
  if (num >= 1_000) {
    return `${Math.round(num / 1_000).toLocaleString()} ألف`;
  }
  return num.toLocaleString();
}

const HEATMAP_CELL_TONE_CLASSES: Record<SeverityTone, { bg: string; activeBg: string; text: string; border: string; labelAr: string }> = {
  L: {
    bg: 'bg-[#E9F5EF] hover:bg-[#D5ECE0]',
    activeBg: 'bg-[#006547] text-white',
    text: 'text-[#09331F]',
    border: 'border-[#B6DAC8]',
    labelAr: 'منخفض',
  },
  M: {
    bg: 'bg-[#FEF6E6] hover:bg-[#FDEBC8]',
    activeBg: 'bg-[#B45309] text-white',
    text: 'text-[#78350F]',
    border: 'border-[#F5D38E]',
    labelAr: 'متوسط',
  },
  H: {
    bg: 'bg-[#FFF0E6] hover:bg-[#FEDBC4]',
    activeBg: 'bg-[#C2410C] text-white',
    text: 'text-[#7C2D12]',
    border: 'border-[#FDBA8C]',
    labelAr: 'مرتفع',
  },
  VH: {
    bg: 'bg-[#FEECEF] hover:bg-[#FCCFD7]',
    activeBg: 'bg-[#BE123C] text-white',
    text: 'text-[#881337]',
    border: 'border-[#FCA5B5]',
    labelAr: 'حرج / عالٍ جداً',
  },
};

export const ExecutiveAnalyticsSection: React.FC<ExecutiveAnalyticsSectionProps> = ({
  units,
  selectedUnitId,
  onSelectUnitFilter,
  analyticsData,
  onNavigate,
}) => {
  const [scopeMode, setScopeMode] = useState<'ALL' | 'SELECTED'>('ALL');
  const [heatmapMode, setHeatmapMode] = useState<HeatmapMode>('INHERENT');
  const [activeCellCoord, setActiveCellCoord] = useState<{ freq: number; impact: number } | null>(null);

  const effectiveUnitId = scopeMode === 'SELECTED' ? selectedUnitId : null;

  const analytics = useMemo(
    () =>
      computePortfolioAnalytics({
        risks: analyticsData.risk_records || [],
        controls: analyticsData.control_records || [],
        incidents: analyticsData.incident_records || [],
        actionPlans: analyticsData.action_plan_records || [],
        selectedUnitId: effectiveUnitId,
      }),
    [analyticsData, effectiveUnitId]
  );

  const activeHeatmapGrid =
    heatmapMode === 'INHERENT' ? analytics.heatmapInherent : analytics.heatmapResidual;

  // Automatically pick the highest-priority populated cell when no cell is manually selected
  const resolvedCell: HeatmapCell | null = useMemo(() => {
    const allCells = activeHeatmapGrid.flat();
    if (activeCellCoord) {
      const exact = allCells.find(
        (c) => c.freqLevel === activeCellCoord.freq && c.impactLevel === activeCellCoord.impact
      );
      if (exact) return exact;
    }
    const populated = allCells
      .filter((c) => c.risks.length > 0)
      .sort((a, b) => b.impactLevel + b.freqLevel - (a.impactLevel + a.freqLevel) || b.risks.length - a.risks.length);
    return populated[0] || null;
  }, [activeHeatmapGrid, activeCellCoord]);

  const maxBaselRisks = Math.max(1, ...analytics.baselDistribution.map((b) => b.total_risks));

  const activeUnitLabel =
    effectiveUnitId
      ? units.find((u) => u.id === effectiveUnitId)?.name_ar || 'الوحدة المحددة'
      : 'كافة وحدات العمل المصرح بها';

  return (
    <section
      aria-label="التحليلات التنفيذية والمصفوفة الحرارية للمخاطر"
      data-testid="executive-analytics-section"
      className="space-y-5 sm:space-y-6"
    >
      {/* Toolbar: Scope Filter + Financial Exposure Strip */}
      <div className="bg-white rounded-2xl border border-[#DCDAD5] p-4 sm:p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3.5 border-b border-[#E5E3DE]">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#09331F] text-[#F79C1E] flex items-center justify-center shrink-0">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-extrabold text-[#09331F]">
                تحليلات محفظة المخاطر والرقابة (Risk Intelligence)
              </h3>
              <p className="text-xs text-slate-600 mt-0.5">
                النطاق المعروض: <span className="font-bold text-[#006547]">{activeUnitLabel}</span>
                <span className="mx-1.5 text-slate-300" aria-hidden="true">·</span>
                <span>مصفوفة NBE 5×5 ومعايرة الخسائر الفعلية</span>
              </p>
            </div>
          </div>

          {/* Interactive Scope Segmented Filter */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center p-1 bg-[#F3F4F2] border border-[#DCDAD5] rounded-xl">
              <button
                type="button"
                data-testid="analytics-scope-all-btn"
                onClick={() => {
                  setScopeMode('ALL');
                  setActiveCellCoord(null);
                }}
                className={`min-h-9 px-3 py-1.5 text-xs font-bold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  scopeMode === 'ALL'
                    ? 'bg-[#09331F] text-white'
                    : 'text-slate-700 hover:text-[#09331F]'
                }`}
              >
                كافة الوحدات
              </button>
              <button
                type="button"
                data-testid="analytics-scope-selected-btn"
                onClick={() => {
                  setScopeMode('SELECTED');
                  setActiveCellCoord(null);
                }}
                className={`min-h-9 px-3 py-1.5 text-xs font-bold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  scopeMode === 'SELECTED'
                    ? 'bg-[#09331F] text-white'
                    : 'text-slate-700 hover:text-[#09331F]'
                }`}
              >
                الوحدة المحددة فقط
              </button>
            </div>

            {scopeMode === 'SELECTED' && units.length > 0 && (
              <select
                aria-label="تحديد وحدة العمل للتحليل"
                value={selectedUnitId || units[0].id}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === 'OTHER') {
                    setScopeMode('ALL');
                    setActiveCellCoord(null);
                    return;
                  }
                  onSelectUnitFilter(val);
                  setActiveCellCoord(null);
                }}
                className="min-h-10 px-3 py-1.5 text-xs font-bold bg-[#F8F8F6] border border-[#DCDAD5] rounded-xl text-[#09331F] focus:outline-none focus:ring-2 focus:ring-[#006547]"
              >
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name_ar} ({u.code})
                  </option>
                ))}
                <option value="OTHER">أخرى</option>
              </select>
            )}
          </div>
        </div>

        {/* Financial Exposure & Control Reduction Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div className="p-3.5 rounded-xl bg-[#F8F8F6] border border-[#E5E3DE]">
            <div className="text-[11px] font-bold text-slate-600 flex items-center justify-between">
              <span>الخسارة السنوية الكامنة (EAL)</span>
              <Activity className="w-4 h-4 text-[#09331F]" />
            </div>
            <div className="text-xl font-black text-[#09331F] mt-1.5 font-mono tabular-nums">
              {formatCompactEgp(analytics.financialTotals.total_inherent_eal)} <span className="text-xs font-bold">ج.م</span>
            </div>
            <div className="text-[11px] text-slate-600 mt-0.5">إجمالي التعرض قبل أثر الضوابط</div>
          </div>

          <div className="p-3.5 rounded-xl bg-[#F8F8F6] border border-[#E5E3DE]">
            <div className="text-[11px] font-bold text-slate-600 flex items-center justify-between">
              <span>صافي التعرض المتبقي (Residual)</span>
              <Shield className="w-4 h-4 text-[#006547]" />
            </div>
            <div className="text-xl font-black text-[#006547] mt-1.5 font-mono tabular-nums">
              {formatCompactEgp(analytics.financialTotals.total_residual_eal)} <span className="text-xs font-bold">ج.م</span>
            </div>
            <div className="text-[11px] text-slate-600 mt-0.5">التعرض الصافي بعد تطبيق RRF</div>
          </div>

          <div className="p-3.5 rounded-xl bg-[#F8F8F6] border border-[#E5E3DE]">
            <div className="text-[11px] font-bold text-slate-600 flex items-center justify-between">
              <span>نسبة خفض المخاطر بالضوابط</span>
              <TrendingDown className="w-4 h-4 text-[#006547]" />
            </div>
            <div className="text-xl font-black text-[#006547] mt-1.5 font-mono tabular-nums">
              {analytics.financialTotals.risk_reduction_pct}%
            </div>
            <div className="text-[11px] text-slate-600 mt-0.5 tabular-nums">
              وفر رقابي: {formatCompactEgp(analytics.financialTotals.risk_reduction_amount)} ج.م
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-[#F8F8F6] border border-[#E5E3DE]">
            <div className="text-[11px] font-bold text-slate-600 flex items-center justify-between">
              <span>الخسائر التاريخية الموثقة</span>
              <AlertTriangle className="w-4 h-4 text-[#B45309]" />
            </div>
            <div className="text-xl font-black text-slate-900 mt-1.5 font-mono tabular-nums">
              {formatCompactEgp(analytics.financialTotals.total_historical_loss)} <span className="text-xs font-bold">ج.م</span>
            </div>
            <div className="text-[11px] text-slate-600 mt-0.5">حوادث فعلية بسجل الخسائر</div>
          </div>
        </div>
      </div>

      {/* Main Row 1: 5x5 Interactive Heatmap + Cell Drill-Down Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* 5x5 NBE Risk Heatmap */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-[#DCDAD5] p-4 sm:p-5 flex flex-col justify-between">
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-[#E5E3DE]">
              <div className="flex items-center gap-2">
                <Grid className="w-4 h-4 text-[#006547] shrink-0" />
                <div>
                  <h4 className="text-sm font-extrabold text-[#09331F]">
                    خريطة المخاطر الحرارية التفاعلية (NBE 5×5)
                  </h4>
                  <p className="text-[11px] text-slate-600">
                    اضغط على أي خلية لعرض تفاصيل المخاطر وانتقل لمصفوفة الوحدة
                  </p>
                </div>
              </div>

              <div className="inline-flex items-center p-1 bg-[#F3F4F2] border border-[#DCDAD5] rounded-xl self-start sm:self-auto">
                <button
                  type="button"
                  data-testid="heatmap-toggle-inherent"
                  onClick={() => {
                    setHeatmapMode('INHERENT');
                    setActiveCellCoord(null);
                  }}
                  className={`min-h-9 px-3 py-1.5 text-xs font-bold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    heatmapMode === 'INHERENT'
                      ? 'bg-[#09331F] text-white'
                      : 'text-slate-700 hover:text-[#09331F]'
                  }`}
                >
                  الخطر الكامن (Inherent)
                </button>
                <button
                  type="button"
                  data-testid="heatmap-toggle-residual"
                  onClick={() => {
                    setHeatmapMode('RESIDUAL');
                    setActiveCellCoord(null);
                  }}
                  className={`min-h-9 px-3 py-1.5 text-xs font-bold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    heatmapMode === 'RESIDUAL'
                      ? 'bg-[#006547] text-white'
                      : 'text-slate-700 hover:text-[#006547]'
                  }`}
                >
                  الخطر المتبقي (Residual)
                </button>
              </div>
            </div>

            {/* 5x5 Matrix Table */}
            <div className="mt-4 overflow-x-auto">
              <div className="min-w-[340px]">
                <div className="grid grid-cols-6 gap-1.5 items-stretch">
                  <div className="flex items-center justify-center text-[10px] font-bold text-slate-500 p-1">
                    التكرار \ الأثر
                  </div>
                  {([1, 2, 3, 4, 5] as const).map((imp) => (
                    <div
                      key={`col-h-${imp}`}
                      className="text-center py-1.5 px-1 bg-[#F8F8F6] border border-[#E5E3DE] rounded-lg"
                    >
                      <div className="text-[11px] font-extrabold text-[#09331F]">
                        {IMPACT_BAND_LABELS_AR[imp].short}
                      </div>
                      <div className="text-[9px] text-slate-500 font-mono tabular-nums">
                        {IMPACT_BAND_LABELS_AR[imp].range}
                      </div>
                    </div>
                  ))}

                  {activeHeatmapGrid.map((row) => {
                    const freqLevel = row[0].freqLevel;
                    return (
                      <React.Fragment key={`row-${freqLevel}`}>
                        <div className="flex flex-col items-center justify-center p-1.5 bg-[#F8F8F6] border border-[#E5E3DE] rounded-lg text-center">
                          <span className="text-[11px] font-extrabold text-[#09331F]">
                            {FREQUENCY_BAND_LABELS_AR[freqLevel].short}
                          </span>
                          <span className="text-[9px] text-slate-500 font-mono tabular-nums">
                            {FREQUENCY_BAND_LABELS_AR[freqLevel].detail}
                          </span>
                        </div>
                        {row.map((cell) => {
                          const style = HEATMAP_CELL_TONE_CLASSES[cell.tone];
                          const isSelectedCell =
                            resolvedCell?.freqLevel === cell.freqLevel &&
                            resolvedCell?.impactLevel === cell.impactLevel;
                          const count = cell.risks.length;

                          return (
                            <button
                              key={`cell-${cell.freqLevel}-${cell.impactLevel}`}
                              type="button"
                              data-testid={`heatmap-cell-${cell.freqLevel}-${cell.impactLevel}`}
                              aria-label={`التكرار ${FREQUENCY_BAND_LABELS_AR[cell.freqLevel].short} والأثر ${IMPACT_BAND_LABELS_AR[cell.impactLevel].short}: ${count} مخاطر`}
                              onClick={() =>
                                setActiveCellCoord({ freq: cell.freqLevel, impact: cell.impactLevel })
                              }
                              className={`min-h-12 sm:min-h-14 rounded-xl border transition-all flex flex-col items-center justify-center cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#09331F] ${
                                isSelectedCell
                                  ? `${style.activeBg} border-[#09331F] ring-2 ring-[#09331F]/30`
                                  : `${style.bg} ${style.text} ${style.border}`
                              }`}
                            >
                              <span
                                className={`text-sm sm:text-base font-black font-mono tabular-nums ${
                                  count === 0 && !isSelectedCell ? 'opacity-35' : ''
                                }`}
                              >
                                {count}
                              </span>
                              <span className="text-[9px] font-bold opacity-85">
                                {cell.tone}
                              </span>
                            </button>
                          );
                        })}
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-[#E5E3DE] flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600">
            <div className="flex flex-wrap items-center gap-3">
              <span>L منخفض</span>
              <span className="text-slate-300" aria-hidden="true">·</span>
              <span>M متوسط</span>
              <span className="text-slate-300" aria-hidden="true">·</span>
              <span>H مرتفع</span>
              <span className="text-slate-300" aria-hidden="true">·</span>
              <span>VH حرج / عالٍ جداً</span>
            </div>
            <span className="font-mono tabular-nums text-[#09331F] font-bold">
              الوضع: {heatmapMode === 'INHERENT' ? 'قبل الضوابط' : 'بعد الضوابط (RRF)'}
            </span>
          </div>
        </div>

        {/* Drill-Down Inspector for Selected Heatmap Cell */}
        <div
          data-testid="heatmap-drilldown-panel"
          className="lg:col-span-5 bg-white rounded-2xl border border-[#DCDAD5] p-4 sm:p-5 flex flex-col justify-between"
        >
          <div className="space-y-3">
            <div className="pb-3 border-b border-[#E5E3DE] flex items-center justify-between gap-2">
              <div>
                <h4 className="text-sm font-extrabold text-[#09331F]">
                  تفاصيل الخلية المحددة
                </h4>
                {resolvedCell ? (
                  <p className="text-[11px] text-slate-600 mt-0.5 tabular-nums">
                    التكرار: {FREQUENCY_BAND_LABELS_AR[resolvedCell.freqLevel].short} · الأثر:{' '}
                    {IMPACT_BAND_LABELS_AR[resolvedCell.impactLevel].short} · تصنيف:{' '}
                    <span className="font-bold text-[#09331F]">
                      {HEATMAP_CELL_TONE_CLASSES[resolvedCell.tone].labelAr}
                    </span>
                  </p>
                ) : (
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    لا توجد مخاطر مسجلة في النطاق المحدد
                  </p>
                )}
              </div>
              {resolvedCell && (
                <span className="text-xs font-mono font-bold text-[#006547] tabular-nums">
                  {resolvedCell.risks.length} مخاطر
                </span>
              )}
            </div>

            {resolvedCell && resolvedCell.risks.length > 0 ? (
              <div className="space-y-2.5 max-h-[340px] overflow-y-auto pl-1">
                {resolvedCell.risks.map((risk) => (
                  <div
                    key={risk.risk_id}
                    className="p-3 rounded-xl bg-[#F8F8F6] border border-[#E5E3DE] space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-[11px] font-bold text-[#006547] flex flex-wrap items-center gap-1.5">
                          <span className="font-mono tabular-nums">{risk.risk_code}</span>
                          <span className="text-slate-400" aria-hidden="true">·</span>
                          <span className="truncate">{risk.unit_name_ar}</span>
                        </div>
                        <div className="text-xs font-extrabold text-[#09331F] mt-0.5 leading-snug">
                          {risk.process_name}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          onNavigate?.({
                            page: 'rcsa-table',
                            unitId: risk.unit_id,
                            assessmentId: risk.assessment_id,
                            riskId: risk.risk_id,
                          })
                        }
                        className="min-h-9 px-2.5 py-1 rounded-lg bg-[#006547] hover:bg-[#09331F] text-white text-[11px] font-bold flex items-center gap-1 shrink-0 cursor-pointer whitespace-nowrap"
                      >
                        <span>عرض</span>
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <p className="text-[11px] text-slate-700 leading-relaxed line-clamp-2">
                      {risk.risk_description}
                    </p>

                    <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-600 font-mono tabular-nums">
                      <span>الكامن: {risk.inherent_risk_rating || '-'}</span>
                      <span className="text-slate-300" aria-hidden="true">·</span>
                      <span>المتبقي: {risk.residual_risk_rating || '-'}</span>
                      <span className="text-slate-300" aria-hidden="true">·</span>
                      <span>RRF: {Math.round(Number(risk.applied_max_rrf || 0) * 100)}%</span>
                      <span className="text-slate-300" aria-hidden="true">·</span>
                      <span>الضوابط: {risk.controls_count}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-10 text-center text-xs text-slate-500 bg-[#F8F8F6] rounded-xl border border-[#E5E3DE]">
                هذه الخلية خالية من المخاطر في الوضع الحالي ({heatmapMode === 'INHERENT' ? 'الخطر الكامن' : 'الخطر المتبقي'}).
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Row 2: Basel II Category Concentration & Control Effectiveness / SPOF Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Basel II Category Breakdown */}
        <div className="lg:col-span-6 bg-white rounded-2xl border border-[#DCDAD5] p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-[#E5E3DE]">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#006547] shrink-0" />
              <div>
                <h4 className="text-sm font-extrabold text-[#09331F]">
                  تركز المخاطر حسب تصنيفات بازل (Basel II L1)
                </h4>
                <p className="text-[11px] text-slate-600">
                  توزيع المخاطر والتعرض المتبقي عبر الفئات الثمانية المعتمدة
                </p>
              </div>
            </div>
            <span className="text-xs font-mono font-bold text-[#09331F] tabular-nums">
              {analytics.baselDistribution.length} فئات
            </span>
          </div>

          {analytics.baselDistribution.length > 0 ? (
            <div className="space-y-3">
              {analytics.baselDistribution.map((item) => {
                const widthPct = Math.max(8, Math.round((item.total_risks / maxBaselRisks) * 100));
                return (
                  <div key={item.taxonomy_l1_id} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-bold text-[#09331F] truncate">{item.label_ar}</span>
                      <span className="text-[11px] text-slate-600 font-mono tabular-nums shrink-0">
                        {item.total_risks} مخاطر · حرج/عالٍ: {item.high_or_critical} · متبقي:{' '}
                        {formatCompactEgp(item.total_residual_eal)}
                      </span>
                    </div>
                    <div className="h-2.5 bg-[#ECEEE9] border border-[#DCDAD5] rounded-md overflow-hidden">
                      <div
                        style={{ width: `${widthPct}%` }}
                        className={`h-full ${
                          item.high_or_critical > 0 ? 'bg-[#09331F]' : 'bg-[#006547]'
                        }`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-8 text-center text-xs text-slate-500">
              لا توجد مخاطر مصنفة في النطاق المحدد.
            </div>
          )}
        </div>

        {/* Control Effectiveness & Single-Point-of-Failure (SPOF) Controls */}
        <div className="lg:col-span-6 bg-white rounded-2xl border border-[#DCDAD5] p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-[#E5E3DE]">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-[#006547] shrink-0" />
              <div>
                <h4 className="text-sm font-extrabold text-[#09331F]">
                  كفاءة الضوابط الرقابية والاعتماد الحرج (Control Analytics)
                </h4>
                <p className="text-[11px] text-slate-600">
                  النوع، آلية التنفيذ، ومتوسط معامل خفض المخاطر RRF
                </p>
              </div>
            </div>
            <span className="text-xs font-mono font-bold text-[#006547] tabular-nums">
              متوسط RRF: {analytics.controlAnalytics.avg_rrf_pct}%
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
            <div className="p-3 rounded-xl bg-[#F8F8F6] border border-[#E5E3DE]">
              <div className="text-[10px] font-bold text-slate-500">توزيع النوع الرقابي</div>
              <div className="mt-1.5 space-y-1.5 text-[11px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-700">مانعة (Preventive)</span>
                  <span className="font-mono tabular-nums font-bold text-[#09331F] shrink-0">{analytics.controlAnalytics.by_type.PREVENTIVE}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-700">كاشفة (Detective)</span>
                  <span className="font-mono tabular-nums font-bold text-[#006547] shrink-0">{analytics.controlAnalytics.by_type.DETECTIVE}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-700">تصحيحية</span>
                  <span className="font-mono tabular-nums font-bold text-slate-700 shrink-0">{analytics.controlAnalytics.by_type.CORRECTIVE}</span>
                </div>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[#F8F8F6] border border-[#E5E3DE]">
              <div className="text-[10px] font-bold text-slate-500">آلية التنفيذ</div>
              <div className="mt-1.5 space-y-1.5 text-[11px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-700">آلي (Auto)</span>
                  <span className="font-mono tabular-nums font-bold text-[#006547] shrink-0">{analytics.controlAnalytics.by_method.AUTOMATED}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-700">شبه آلي</span>
                  <span className="font-mono tabular-nums font-bold text-[#09331F] shrink-0">{analytics.controlAnalytics.by_method.SEMI_AUTOMATED}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-700">يدوي (Manual)</span>
                  <span className="font-mono tabular-nums font-bold text-amber-800 shrink-0">{analytics.controlAnalytics.by_method.MANUAL}</span>
                </div>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[#F8F8F6] border border-[#E5E3DE]">
              <div className="text-[10px] font-bold text-slate-500">تقييم الكفاءة</div>
              <div className="mt-1.5 space-y-1.5 text-[11px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-700">فعال</span>
                  <span className="font-mono tabular-nums font-bold text-[#006547] shrink-0">{analytics.controlAnalytics.by_effectiveness.effective}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-700">يحتاج تطوير</span>
                  <span className="font-mono tabular-nums font-bold text-amber-800 shrink-0">{analytics.controlAnalytics.by_effectiveness.needs_improvement}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-700">غير فعال</span>
                  <span className="font-mono tabular-nums font-bold text-rose-700 shrink-0">{analytics.controlAnalytics.by_effectiveness.ineffective}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Single Point of Failure / Highest RRF Controls */}
          <div className="space-y-2">
            <div className="text-xs font-extrabold text-[#09331F]">
              أهم الضوابط المحورية (الأكثر ارتباطاً بالمخاطر أو الأعلى RRF)
            </div>
            {analytics.controlAnalytics.spof_controls.length > 0 ? (
              <div className="divide-y divide-[#E5E3DE] border border-[#E5E3DE] rounded-xl overflow-hidden">
                {analytics.controlAnalytics.spof_controls.slice(0, 4).map((ctrl) => (
                  <div
                    key={`${ctrl.unit_id}-${ctrl.control_code}`}
                    className="px-3 py-2.5 bg-white flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="font-bold text-[#09331F] truncate">
                        {ctrl.control_description}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono tabular-nums mt-0.5">
                        {ctrl.control_code} · {ctrl.unit_name_ar} · {ctrl.control_method}
                      </div>
                    </div>
                    <div className="text-left shrink-0 font-mono tabular-nums">
                      <div className="text-xs font-extrabold text-[#006547]">
                        RRF {Math.round(ctrl.rrf_value * 100)}%
                      </div>
                      <div className="text-[10px] text-slate-600">
                        يغطي {ctrl.risk_coverage_count} خطر
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-4 text-center text-xs text-slate-500 bg-[#F8F8F6] rounded-xl">
                لا توجد ضوابط مسجلة في النطاق المحدد.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Row 3: Loss Calibration Alerts & Remediation Action Plans Tracker */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Statistical Loss Calibration Alerts */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-[#DCDAD5] p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-[#E5E3DE]">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-[#B45309] shrink-0" />
              <div>
                <h4 className="text-sm font-extrabold text-[#09331F]">
                  معايرة الخسائر التاريخية (Loss Calibration)
                </h4>
                <p className="text-[11px] text-slate-600">
                  رصد التقديرات المالية الأقل من حوادث الخسائر الفعلية المسجلة
                </p>
              </div>
            </div>
            <span className="text-xs font-mono font-bold text-slate-700 tabular-nums">
              {analytics.lossCalibrationAlerts.length} تنبيه
            </span>
          </div>

          {analytics.lossCalibrationAlerts.length > 0 ? (
            <div className="space-y-2.5 max-h-[260px] overflow-y-auto">
              {analytics.lossCalibrationAlerts.map((al) => (
                <div
                  key={`${al.risk_id}-${al.incident_code}`}
                  className="p-3 rounded-xl bg-[#FEF6E6] border border-[#F5D38E] text-xs space-y-1"
                >
                  <div className="flex items-center justify-between gap-2 font-bold text-[#78350F]">
                    <span className="font-mono tabular-nums truncate">
                      {al.risk_code} · {al.unit_name_ar}
                    </span>
                    <span className="font-mono tabular-nums shrink-0 whitespace-nowrap">
                      {al.ratio_pct}% من الفعلي
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-800 leading-relaxed">
                    التقدير الحالي ({al.estimated_single_loss.toLocaleString()} ج.م) أقل من الحادث التاريخي{' '}
                    <span className="font-bold">[{al.incident_code}]</span> ({al.historical_max_loss.toLocaleString()} ج.م):{' '}
                    {al.incident_summary_ar}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 px-4 text-center text-xs text-[#006547] bg-[#E9F5EF] border border-[#B6DAC8] rounded-xl flex flex-col items-center gap-2">
              <CheckCircle2 className="w-5 h-5" />
              <span className="font-bold">
                كافة التقديرات المالية للمخاطر متوافقة مع سجل الخسائر التاريخية المسجل.
              </span>
            </div>
          )}
        </div>

        {/* Remediation Action Plans & Governance Tracker */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-[#DCDAD5] p-4 sm:p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#E5E3DE]">
            <div className="flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-[#006547] shrink-0" />
              <div>
                <h4 className="text-sm font-extrabold text-[#09331F]">
                  متابعة خطط العمل التصحيحية (Action Plans & SLA)
                </h4>
                <p className="text-[11px] text-slate-600 font-mono tabular-nums">
                  الإجمالي: {analytics.actionPlansSummary.total} · قيد التنفيذ:{' '}
                  {analytics.actionPlansSummary.in_progress} · متأخر:{' '}
                  {analytics.actionPlansSummary.delayed} · مكتمل:{' '}
                  {analytics.actionPlansSummary.completed}
                </p>
              </div>
            </div>
          </div>

          {analytics.actionPlansSummary.items.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[#E5E3DE] text-[11px] text-slate-500">
                    <th className="py-2 pl-2 font-bold">الخطر / الوحدة</th>
                    <th className="py-2 px-2 font-bold">الإجراء التصحيحي والمسؤول</th>
                    <th className="py-2 px-2 font-bold">الاستحقاق</th>
                    <th className="py-2 pr-2 font-bold">الحالة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E3DE]">
                  {analytics.actionPlansSummary.items.slice(0, 6).map((ap) => (
                    <tr key={ap.id} className="hover:bg-[#F8F8F6] transition-colors">
                      <td className="py-2.5 pl-2 font-mono tabular-nums whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() =>
                            onNavigate?.({
                              page: 'rcsa-table',
                              unitId: ap.unit_id,
                              assessmentId: ap.assessment_id,
                              riskId: ap.risk_id,
                            })
                          }
                          className="text-[#006547] hover:underline font-bold cursor-pointer"
                        >
                          {ap.risk_code}
                        </button>
                        <div className="text-[10px] text-slate-500 font-sans truncate max-w-[130px]">{ap.unit_name_ar}</div>
                      </td>
                      <td className="py-2.5 px-2 text-slate-800 max-w-[240px]">
                        <div className="truncate font-semibold" title={ap.title}>
                          {ap.title}
                        </div>
                        <div className="text-[10px] text-slate-500 truncate mt-0.5">
                          المسؤول: {ap.assigned_owner}
                        </div>
                      </td>
                      <td className="py-2.5 px-2 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                        {ap.target_completion_date}
                      </td>
                      <td className="py-2.5 pr-2 font-bold whitespace-nowrap">
                        <span
                          className={
                            ap.current_status === 'COMPLETED'
                              ? 'text-[#006547]'
                              : ap.current_status === 'DELAYED'
                                ? 'text-rose-700'
                                : 'text-amber-800'
                          }
                        >
                          {ap.current_status === 'COMPLETED'
                            ? 'مكتمل'
                            : ap.current_status === 'DELAYED'
                              ? 'متأخر'
                              : ap.current_status === 'IN_PROGRESS'
                                ? 'جارٍ التنفيذ'
                                : 'قيد الانتظار'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-8 text-center text-xs text-slate-500 bg-[#F8F8F6] rounded-xl border border-[#E5E3DE]">
              لا توجد خطط عمل تصحيحية مسجلة أو متأخرة في النطاق المحدد حالياً.
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
