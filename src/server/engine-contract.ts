/**
 * Provisional Python Assessment Engine Integration Contract
 * 
 * ARCHITECTURAL NOTICE / إشعار حوكمة المعمارية الصارم:
 * تم عزل وتعطيل الحسابات التمهيدية في TypeScript بشكل كامل منعاً لانحراف المنهجية أو فبركة نتائج حسابية.
 * حسابات المخاطر والضوابط المعتمدة لمصرفنا (الأثر المالي، مصفوفة التكرار، الأبعاد الأربعة لـ NFI، 
 * مصفوفة RRF، وحساب الخطر المتبقي) ستعتمد حصراً على محركات بايثون الأصلية المفحوصة في المرحلة 2.
 * هذا العقد يمثل واجهة التكامل المحددة، ويُرجع حالة صريحة `ENGINE_NOT_CONFIGURED` في حال عدم اتصال محرك بايثون.
 */

export interface ProvisionalEngineCalculationRequest {
  unit_id: string;
  financial_impact_amount?: number;
  inherent_frequency_text?: string;
  nfi_levels?: {
    service?: number;     // 1 to 5
    reputation?: number;  // 1 to 5
    regulatory?: number;  // 1 to 5
    legal?: number;       // 1 to 5
  };
  controls?: Array<{
    control_id: string;
    control_type: 'PREVENTIVE' | 'DETECTIVE' | 'CORRECTIVE';
    control_method: 'AUTOMATED' | 'SEMI_AUTOMATED' | 'MANUAL';
    raw_efficiency_rating: string;
    is_proposed: boolean;
  }>;
}

export interface ProvisionalEngineCalculationResponse {
  is_provisional: true;
  engine_version: string;
  status: 'ENGINE_NOT_CONFIGURED' | 'MISSING_INPUTS_REQUIRED';
  error?: string;
  message: string;
  missing_fields?: string[];
  calculated_metrics?: null;
}

/**
 * Provisional Engine Integration Entry Point.
 * Strictly decoupled from Python assessment engine; does not perform calculations in TypeScript.
 */
export async function executeProvisionalCalculation(
  req: ProvisionalEngineCalculationRequest
): Promise<ProvisionalEngineCalculationResponse> {
  // If required baseline inputs are absent, return explicit missing inputs notice
  if (!req.financial_impact_amount || !req.inherent_frequency_text) {
    const missing: string[] = [];
    if (!req.financial_impact_amount) missing.push('financial_impact_amount');
    if (!req.inherent_frequency_text) missing.push('inherent_frequency_text');

    return {
      is_provisional: true,
      engine_version: 'PROVISIONAL_CONTRACT_V1',
      status: 'MISSING_INPUTS_REQUIRED',
      error: 'البيانات المالية أو التكرارية غير متوفرة في المستند.',
      message: 'يتطلب التقييم المنهجي استيفاء مدخلات الأثر المالي والتكرار بدقة وتوثيق مصدرها قبل الحساب.',
      missing_fields: missing,
      calculated_metrics: null,
    };
  }

  // Authoritative calculations in TypeScript are strictly disabled per banking governance.
  // Returns explicit status awaiting verified Python engine connection in Phase 2.
  return {
    is_provisional: true,
    engine_version: 'PROVISIONAL_CONTRACT_V1',
    status: 'ENGINE_NOT_CONFIGURED',
    error: 'محرك بايثون المصرفي المعتمد لتقييم المخاطر غير متصل حالياً.',
    message: 'تم إيقاف محاكاة الحسابات التمهيدية في TypeScript لضمان عدم حدوث انحراف عن معادلات البنك الأصلية. سيتم ربط وتفعيل محرك بايثون المعتمد في المرحلة 2.',
    calculated_metrics: null,
  };
}
