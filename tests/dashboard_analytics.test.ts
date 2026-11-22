import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyMonetaryBandLevel,
  getHeatmapCellTone,
  buildHeatmap5x5,
  computePortfolioAnalytics,
  DashboardRiskRecord,
  DashboardControlRecord,
  DashboardIncidentRecord,
  DashboardActionPlanRecord,
} from '../src/utils/dashboardAnalytics.js';

test('1. Monetary band classification matches NBE Financial Impact Bands', () => {
  assert.equal(classifyMonetaryBandLevel(50_000), 1);
  assert.equal(classifyMonetaryBandLevel(150_000), 1);
  assert.equal(classifyMonetaryBandLevel(151_000), 2);
  assert.equal(classifyMonetaryBandLevel(501_000), 3);
  assert.equal(classifyMonetaryBandLevel(1_501_000), 4);
  assert.equal(classifyMonetaryBandLevel(3_001_000), 5);
});

test('2. 5x5 Heatmap tones match NBE Page 5 Matrix', () => {
  assert.equal(getHeatmapCellTone(1, 1), 'L');
  assert.equal(getHeatmapCellTone(3, 3), 'M');
  assert.equal(getHeatmapCellTone(4, 3), 'H');
  assert.equal(getHeatmapCellTone(5, 4), 'VH');
  assert.equal(getHeatmapCellTone(5, 1), 'M');
});

test('3. Inherent vs Residual 5x5 Heatmap shifts risks after RRF control reduction', () => {
  const sampleRisks: DashboardRiskRecord[] = [
    {
      risk_id: 'R-1',
      risk_code: 'RSK-SWF-01',
      unit_id: 'BU-SWIFT',
      unit_name_ar: 'الحوالات',
      unit_code: 'SWIFT',
      assessment_id: 'ASM-1',
      assessment_status: 'APPROVED',
      process_name: 'تنفيذ التحويلات الصادرة',
      risk_description: 'أخطاء تمرير رسائل سويفت',
      taxonomy_l1_id: 'L1-08',
      taxonomy_l1_ar: '8_تنفيذ العمليات المصرفية',
      financial_impact_level: 4, // >1.5M <=3M
      inherent_frequency_level: 3, // Semi-annual
      financial_impact_amount: 2_000_000,
      expected_annual_loss: 4_000_000,
      inherent_risk_rating: 'H',
      residual_loss_amount: 400_000, // Drops from Band 4 (<=3M) to Band 2 (<=500k)
      residual_risk_rating: 'M',
      applied_max_rrf: 0.9,
      controls_count: 2,
      action_plans_count: 0,
    },
  ];

  const inhGrid = buildHeatmap5x5(sampleRisks, 'INHERENT');
  const resGrid = buildHeatmap5x5(sampleRisks, 'RESIDUAL');

  // Row index for freqLevel=3 is 5 - 3 = 2. Col index for impact=4 is 3; impact=2 is 1.
  assert.equal(inhGrid[2][3].risks.length, 1);
  assert.equal(resGrid[2][1].risks.length, 1);
  assert.equal(resGrid[2][3].risks.length, 0);
});

test('4. Portfolio analytics computes Basel concentration, SPOF controls, RRF % savings, and Loss Calibration alerts', () => {
  const risks: DashboardRiskRecord[] = [
    {
      risk_id: 'R-1',
      risk_code: 'RSK-01',
      unit_id: 'BU-SYNDICATED',
      unit_name_ar: 'القروض المشتركة',
      unit_code: 'SYNDICATED',
      assessment_id: 'ASM-1',
      assessment_status: 'APPROVED',
      process_name: 'توثيق الضمانات',
      risk_description: 'قصور مراجعة المستندات',
      taxonomy_l1_id: 'L1-02',
      taxonomy_l1_ar: '2_ احتيال خارجي',
      financial_impact_level: 2,
      inherent_frequency_level: 2,
      financial_impact_amount: 100_000, // Below historical incident 300,000 * 0.75 = 225,000
      expected_annual_loss: 200_000,
      inherent_risk_rating: 'M',
      residual_loss_amount: 40_000,
      residual_risk_rating: 'L',
      applied_max_rrf: 0.8,
      controls_count: 2,
      action_plans_count: 1,
    },
    {
      risk_id: 'R-2',
      risk_code: 'RSK-02',
      unit_id: 'BU-SYNDICATED',
      unit_name_ar: 'القروض المشتركة',
      unit_code: 'SYNDICATED',
      assessment_id: 'ASM-1',
      assessment_status: 'APPROVED',
      process_name: 'صرف التسهيل',
      risk_description: 'أخطاء قيد التسهيلات',
      taxonomy_l1_id: 'L1-08',
      taxonomy_l1_ar: '8_ تنفيذ العمليات المصرفية',
      financial_impact_level: 3,
      inherent_frequency_level: 3,
      financial_impact_amount: 600_000,
      expected_annual_loss: 1_200_000,
      inherent_risk_rating: 'M',
      residual_loss_amount: 360_000,
      residual_risk_rating: 'M',
      applied_max_rrf: 0.7,
      controls_count: 1,
      action_plans_count: 0,
    },
  ];

  const controls: DashboardControlRecord[] = [
    {
      control_id: 'C-1',
      control_code: 'CTL-CORE-01',
      control_description: 'المراجعة المزدوجة على النظام الأساسي',
      control_type: 'PREVENTIVE',
      control_method: 'AUTOMATED',
      control_frequency: 'Daily',
      raw_efficiency_rating: 'ضابط رقابي فعال',
      rrf_value: 0.8,
      unit_id: 'BU-SYNDICATED',
      unit_name_ar: 'القروض المشتركة',
      linked_risk_ids: ['R-1', 'R-2'],
      linked_risk_codes: ['RSK-01', 'RSK-02'],
    },
  ];

  const incidents: DashboardIncidentRecord[] = [
    {
      unit_id: 'BU-SYNDICATED',
      incident_code: 'INC-106',
      event_summary_ar: 'تقديم مستندات مزورة',
      net_loss_amount: 300_000,
      mapped_l1_id: 'L1-02',
    },
  ];

  const actionPlans: DashboardActionPlanRecord[] = [
    {
      id: 'AP-1',
      risk_id: 'R-1',
      risk_code: 'RSK-01',
      risk_description: 'قصور مراجعة المستندات',
      unit_id: 'BU-SYNDICATED',
      unit_name_ar: 'القروض المشتركة',
      assessment_id: 'ASM-1',
      title: 'تفعيل التحقق الرقمي من الهوية',
      assigned_owner: 'مدير العمليات',
      target_completion_date: '2026-12-31',
      current_status: 'IN_PROGRESS',
    },
  ];

  const res = computePortfolioAnalytics({
    risks,
    controls,
    incidents,
    actionPlans,
    selectedUnitId: null,
  });

  assert.equal(res.financialTotals.total_inherent_eal, 1_400_000);
  assert.equal(res.financialTotals.total_residual_eal, 400_000);
  assert.ok(res.financialTotals.risk_reduction_pct > 70);
  assert.equal(res.baselDistribution.length, 2);
  assert.equal(res.controlAnalytics.spof_controls[0].risk_coverage_count, 2);
  assert.equal(res.lossCalibrationAlerts.length, 1);
  assert.equal(res.lossCalibrationAlerts[0].incident_code, 'INC-106');
  assert.equal(res.actionPlansSummary.in_progress, 1);
});
