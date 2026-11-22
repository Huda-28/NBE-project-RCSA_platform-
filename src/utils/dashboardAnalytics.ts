/**
 * Pure Executive RCSA Analytics Engine
 * Computes NBE Page-5 5x5 Inherent vs. Residual Risk Heatmaps, Basel II Category Concentration,
 * Control Effectiveness & Single-Point-of-Failure (SPOF) metrics, Historical Loss Calibration alerts,
 * and Remediation Action Plan tracking.
 *
 * Completely decoupled from Express/React for deterministic unit testing.
 */

export type HeatmapMode = 'INHERENT' | 'RESIDUAL';
export type SeverityTone = 'L' | 'M' | 'H' | 'VH';

export interface DashboardRiskRecord {
  risk_id: string;
  risk_code: string;
  unit_id: string;
  unit_name_ar: string;
  unit_code: string;
  assessment_id: string;
  assessment_status: string;
  process_name: string;
  risk_description: string;
  taxonomy_l1_id: string;
  taxonomy_l1_ar: string;
  financial_impact_level: number | null;
  inherent_frequency_level: number | null;
  financial_impact_amount: number | null;
  expected_annual_loss: number | null;
  inherent_risk_rating: string | null;
  residual_loss_amount: number | null;
  residual_risk_rating: string | null;
  applied_max_rrf: number | null;
  controls_count: number;
  action_plans_count: number;
}

export interface DashboardControlRecord {
  control_id: string;
  control_code: string;
  control_description: string;
  control_type: 'PREVENTIVE' | 'DETECTIVE' | 'CORRECTIVE' | string;
  control_method: 'AUTOMATED' | 'SEMI_AUTOMATED' | 'MANUAL' | string;
  control_frequency: string;
  raw_efficiency_rating: string;
  rrf_value: number;
  unit_id: string;
  unit_name_ar: string;
  linked_risk_ids: string[];
  linked_risk_codes: string[];
}

export interface DashboardIncidentRecord {
  unit_id: string;
  incident_code: string;
  event_summary_ar: string;
  net_loss_amount: number;
  mapped_l1_id?: string | null;
}

export interface DashboardActionPlanRecord {
  id: string;
  risk_id: string;
  risk_code: string;
  risk_description: string;
  unit_id: string;
  unit_name_ar: string;
  assessment_id: string;
  title: string;
  assigned_owner: string;
  target_completion_date: string;
  current_status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'DELAYED' | string;
}

export interface HeatmapCell {
  impactLevel: 1 | 2 | 3 | 4 | 5;
  freqLevel: 1 | 2 | 3 | 4 | 5;
  tone: SeverityTone;
  isRedEscalationZone: boolean;
  risks: DashboardRiskRecord[];
}

export interface BaselCategoryStat {
  taxonomy_l1_id: string;
  label_ar: string;
  total_risks: number;
  high_or_critical: number;
  total_inherent_eal: number;
  total_residual_eal: number;
}

export interface LossCalibrationAlert {
  unit_id: string;
  unit_name_ar: string;
  risk_id: string;
  risk_code: string;
  estimated_single_loss: number;
  historical_max_loss: number;
  incident_code: string;
  incident_summary_ar: string;
  ratio_pct: number;
}

export interface PortfolioAnalyticsResult {
  heatmapInherent: HeatmapCell[][];
  heatmapResidual: HeatmapCell[][];
  financialTotals: {
    total_inherent_eal: number;
    total_residual_eal: number;
    risk_reduction_amount: number;
    risk_reduction_pct: number;
    total_historical_loss: number;
  };
  baselDistribution: BaselCategoryStat[];
  controlAnalytics: {
    total_controls: number;
    by_type: { PREVENTIVE: number; DETECTIVE: number; CORRECTIVE: number };
    by_method: { AUTOMATED: number; SEMI_AUTOMATED: number; MANUAL: number };
    by_effectiveness: { effective: number; needs_improvement: number; ineffective: number };
    avg_rrf_pct: number;
    spof_controls: Array<DashboardControlRecord & { risk_coverage_count: number }>;
  };
  lossCalibrationAlerts: LossCalibrationAlert[];
  actionPlansSummary: {
    total: number;
    pending: number;
    in_progress: number;
    completed: number;
    delayed: number;
    items: DashboardActionPlanRecord[];
  };
}

export const IMPACT_BAND_LABELS_AR: Record<1 | 2 | 3 | 4 | 5, { short: string; range: string }> = {
  1: { short: 'منخفض', range: '≤ 150 ألف' },
  2: { short: 'متوسط', range: '≤ 500 ألف' },
  3: { short: 'مرتفع', range: '≤ 1.5 مليون' },
  4: { short: 'مرتفع جداً', range: '≤ 3 مليون' },
  5: { short: 'كارثي', range: '> 3 مليون' },
};

export const FREQUENCY_BAND_LABELS_AR: Record<1 | 2 | 3 | 4 | 5, { short: string; detail: string }> = {
  5: { short: 'شهري فأقل', detail: '12× / سنة' },
  4: { short: 'ربع سنوي', detail: '4× / سنة' },
  3: { short: 'نصف سنوي', detail: '2× / سنة' },
  2: { short: 'سنوي', detail: '1× / سنة' },
  1: { short: 'كل سنتين+', detail: '0.5× / سنة' },
};

const OFFICIAL_NBE_L1_MAP: Record<string, string> = {
  'L1-01': '1_ احتيال داخلي',
  'L1-02': '2_ احتيال خارجي',
  'L1-03': '3_ وسائل الاحتيال على البطاقات',
  'L1-04': '4_ ممارسات العاملين وسلامة بيئة العمل',
  'L1-05': '5_ الممارسات الخاطئة في حق عملاء البنك',
  'L1-06': '6_ أضرار بأصول البنك',
  'L1-07': '7_ الأنظمة والتطبيقات',
  'L1-08': '8_ تنفيذ العمليات المصرفية',
};

/**
 * Matches rcsa_engine/financial_inherent.py FINANCIAL_IMPACT_BANDS exactly.
 */
export function classifyMonetaryBandLevel(amountEgp: number | null | undefined): 1 | 2 | 3 | 4 | 5 {
  const val = Number(amountEgp || 0);
  if (val <= 150_000) return 1;
  if (val <= 500_000) return 2;
  if (val <= 1_500_000) return 3;
  if (val <= 3_000_000) return 4;
  return 5;
}

/**
 * Matches rcsa_engine/financial_inherent.py PAGE5_HEATMAP_5X5 (Impact 1..5 x Frequency 1..5).
 */
export function getHeatmapCellTone(impactLevel: number, freqLevel: number): SeverityTone {
  const matrix: Record<number, Record<number, SeverityTone>> = {
    1: { 1: 'L', 2: 'L', 3: 'L', 4: 'M', 5: 'M' },
    2: { 1: 'L', 2: 'L', 3: 'M', 4: 'M', 5: 'H' },
    3: { 1: 'L', 2: 'M', 3: 'M', 4: 'H', 5: 'VH' },
    4: { 1: 'M', 2: 'M', 3: 'H', 4: 'VH', 5: 'VH' },
    5: { 1: 'M', 2: 'H', 3: 'VH', 4: 'VH', 5: 'VH' },
  };
  return matrix[impactLevel]?.[freqLevel] || 'M';
}

function clampLevel(lvl: number | null | undefined, fallback = 2): 1 | 2 | 3 | 4 | 5 {
  const n = Math.round(Number(lvl || 0));
  if (n >= 1 && n <= 5) return n as 1 | 2 | 3 | 4 | 5;
  return fallback as 1 | 2 | 3 | 4 | 5;
}

function ratingToFallbackLevel(rating: string | null | undefined): 1 | 2 | 3 | 4 | 5 {
  if (rating === 'L') return 1;
  if (rating === 'M') return 2;
  if (rating === 'H') return 3;
  if (rating === 'VH') return 4;
  if (rating === 'C') return 5;
  return 2;
}

/**
 * Build a 5x5 matrix (rows = frequency 5 down to 1, cols = impact 1 to 5).
 */
export function buildHeatmap5x5(
  risks: DashboardRiskRecord[],
  mode: HeatmapMode
): HeatmapCell[][] {
  const grid: HeatmapCell[][] = [];
  const freqOrder: Array<1 | 2 | 3 | 4 | 5> = [5, 4, 3, 2, 1];
  const impOrder: Array<1 | 2 | 3 | 4 | 5> = [1, 2, 3, 4, 5];

  for (const freqLevel of freqOrder) {
    const row: HeatmapCell[] = [];
    for (const impactLevel of impOrder) {
      row.push({
        impactLevel,
        freqLevel,
        tone: getHeatmapCellTone(impactLevel, freqLevel),
        isRedEscalationZone: impactLevel + freqLevel >= 7,
        risks: [],
      });
    }
    grid.push(row);
  }

  for (const r of risks) {
    const freqLvl = clampLevel(r.inherent_frequency_level, 2);
    let impLvl: 1 | 2 | 3 | 4 | 5;
    if (mode === 'INHERENT') {
      impLvl = r.financial_impact_level
        ? clampLevel(r.financial_impact_level, 2)
        : r.expected_annual_loss
          ? classifyMonetaryBandLevel(r.expected_annual_loss)
          : r.financial_impact_amount
            ? classifyMonetaryBandLevel(r.financial_impact_amount)
            : ratingToFallbackLevel(r.inherent_risk_rating);
    } else {
      if (r.residual_loss_amount !== null && r.residual_loss_amount !== undefined) {
        impLvl = classifyMonetaryBandLevel(r.residual_loss_amount);
      } else {
        impLvl = ratingToFallbackLevel(r.residual_risk_rating);
      }
    }

    const rowIdx = 5 - freqLvl;
    const colIdx = impLvl - 1;
    if (grid[rowIdx]?.[colIdx]) {
      grid[rowIdx][colIdx].risks.push(r);
    }
  }

  return grid;
}

export function computePortfolioAnalytics(params: {
  risks: DashboardRiskRecord[];
  controls: DashboardControlRecord[];
  incidents: DashboardIncidentRecord[];
  actionPlans: DashboardActionPlanRecord[];
  selectedUnitId?: string | null;
}): PortfolioAnalyticsResult {
  const { selectedUnitId } = params;
  const risks = selectedUnitId
    ? params.risks.filter((r) => r.unit_id === selectedUnitId)
    : params.risks;
  const controls = selectedUnitId
    ? params.controls.filter((c) => c.unit_id === selectedUnitId)
    : params.controls;
  const incidents = selectedUnitId
    ? params.incidents.filter((i) => i.unit_id === selectedUnitId)
    : params.incidents;
  const actionPlans = selectedUnitId
    ? params.actionPlans.filter((a) => a.unit_id === selectedUnitId)
    : params.actionPlans;

  const heatmapInherent = buildHeatmap5x5(risks, 'INHERENT');
  const heatmapResidual = buildHeatmap5x5(risks, 'RESIDUAL');

  const totalInherentEal = risks.reduce((sum, r) => sum + Number(r.expected_annual_loss || r.financial_impact_amount || 0), 0);
  const totalResidualEal = risks.reduce((sum, r) => sum + Number(r.residual_loss_amount || 0), 0);
  const riskReductionAmount = Math.max(0, totalInherentEal - totalResidualEal);
  const riskReductionPct =
    totalInherentEal > 0 ? Math.round((riskReductionAmount / totalInherentEal) * 1000) / 10 : 0;
  const totalHistoricalLoss = incidents.reduce((sum, i) => sum + Number(i.net_loss_amount || 0), 0);

  // Basel L1 Concentration
  const baselMap = new Map<string, BaselCategoryStat>();
  for (const r of risks) {
    const l1Id = r.taxonomy_l1_id || 'L1-08';
    const labelAr = OFFICIAL_NBE_L1_MAP[l1Id] || r.taxonomy_l1_ar || l1Id;
    const existing = baselMap.get(l1Id) || {
      taxonomy_l1_id: l1Id,
      label_ar: labelAr,
      total_risks: 0,
      high_or_critical: 0,
      total_inherent_eal: 0,
      total_residual_eal: 0,
    };
    existing.total_risks += 1;
    if (r.residual_risk_rating === 'H' || r.residual_risk_rating === 'VH' || r.residual_risk_rating === 'C') {
      existing.high_or_critical += 1;
    }
    existing.total_inherent_eal += Number(r.expected_annual_loss || r.financial_impact_amount || 0);
    existing.total_residual_eal += Number(r.residual_loss_amount || 0);
    baselMap.set(l1Id, existing);
  }
  const baselDistribution = Array.from(baselMap.values()).sort(
    (a, b) => b.total_risks - a.total_risks || b.total_residual_eal - a.total_residual_eal
  );

  // Control Analytics & SPOF Controls
  const byType = { PREVENTIVE: 0, DETECTIVE: 0, CORRECTIVE: 0 };
  const byMethod = { AUTOMATED: 0, SEMI_AUTOMATED: 0, MANUAL: 0 };
  const byEffectiveness = { effective: 0, needs_improvement: 0, ineffective: 0 };
  let rrfSum = 0;

  for (const c of controls) {
    if (c.control_type === 'PREVENTIVE') byType.PREVENTIVE++;
    else if (c.control_type === 'DETECTIVE') byType.DETECTIVE++;
    else byType.CORRECTIVE++;

    if (c.control_method === 'AUTOMATED') byMethod.AUTOMATED++;
    else if (c.control_method === 'SEMI_AUTOMATED') byMethod.SEMI_AUTOMATED++;
    else byMethod.MANUAL++;

    const eff = String(c.raw_efficiency_rating || '');
    if (eff.includes('غير فعال') || eff.includes('لا يعمل') || eff.includes('ضعيف')) {
      byEffectiveness.ineffective++;
    } else if (eff.includes('يحتاج') || eff.includes('جزئ') || eff.includes('تطوير')) {
      byEffectiveness.needs_improvement++;
    } else {
      byEffectiveness.effective++;
    }

    rrfSum += Number(c.rrf_value || 0);
  }

  const avgRrfPct = controls.length > 0 ? Math.round((rrfSum / controls.length) * 1000) / 10 : 0;

  const spofControls = controls
    .map((c) => ({
      ...c,
      risk_coverage_count: Math.max(1, c.linked_risk_ids?.length || 1),
    }))
    .sort((a, b) => b.risk_coverage_count - a.risk_coverage_count || b.rrf_value - a.rrf_value)
    .slice(0, 6);

  // Statistical Loss Calibration Alerts: compare risk estimates against unit's real historical incidents
  const lossCalibrationAlerts: LossCalibrationAlert[] = [];
  const maxIncidentByUnitAndL1 = new Map<string, DashboardIncidentRecord>();
  const maxIncidentByUnit = new Map<string, DashboardIncidentRecord>();

  for (const inc of incidents) {
    if (inc.net_loss_amount <= 0) continue;
    const uKey = inc.unit_id;
    const curUnitBest = maxIncidentByUnit.get(uKey);
    if (!curUnitBest || inc.net_loss_amount > curUnitBest.net_loss_amount) {
      maxIncidentByUnit.set(uKey, inc);
    }
    if (inc.mapped_l1_id) {
      const lKey = `${inc.unit_id}::${inc.mapped_l1_id}`;
      const curLBest = maxIncidentByUnitAndL1.get(lKey);
      if (!curLBest || inc.net_loss_amount > curLBest.net_loss_amount) {
        maxIncidentByUnitAndL1.set(lKey, inc);
      }
    }
  }

  for (const r of risks) {
    const matchedInc =
      maxIncidentByUnitAndL1.get(`${r.unit_id}::${r.taxonomy_l1_id}`) ||
      maxIncidentByUnit.get(r.unit_id);
    if (!matchedInc) continue;
    const estSingle = Number(r.financial_impact_amount || 0);
    if (estSingle > 0 && estSingle < matchedInc.net_loss_amount * 0.75) {
      lossCalibrationAlerts.push({
        unit_id: r.unit_id,
        unit_name_ar: r.unit_name_ar,
        risk_id: r.risk_id,
        risk_code: r.risk_code,
        estimated_single_loss: estSingle,
        historical_max_loss: matchedInc.net_loss_amount,
        incident_code: matchedInc.incident_code,
        incident_summary_ar: matchedInc.event_summary_ar,
        ratio_pct: Math.round((estSingle / matchedInc.net_loss_amount) * 100),
      });
    }
  }

  // Action Plans Summary
  let pending = 0;
  let inProgress = 0;
  let completed = 0;
  let delayed = 0;
  for (const ap of actionPlans) {
    if (ap.current_status === 'COMPLETED') completed++;
    else if (ap.current_status === 'DELAYED') delayed++;
    else if (ap.current_status === 'IN_PROGRESS') inProgress++;
    else pending++;
  }

  return {
    heatmapInherent,
    heatmapResidual,
    financialTotals: {
      total_inherent_eal: totalInherentEal,
      total_residual_eal: totalResidualEal,
      risk_reduction_amount: riskReductionAmount,
      risk_reduction_pct: riskReductionPct,
      total_historical_loss: totalHistoricalLoss,
    },
    baselDistribution,
    controlAnalytics: {
      total_controls: controls.length,
      by_type: byType,
      by_method: byMethod,
      by_effectiveness: byEffectiveness,
      avg_rrf_pct: avgRrfPct,
      spof_controls: spofControls,
    },
    lossCalibrationAlerts: lossCalibrationAlerts.slice(0, 6),
    actionPlansSummary: {
      total: actionPlans.length,
      pending,
      in_progress: inProgress,
      completed,
      delayed,
      items: actionPlans,
    },
  };
}
