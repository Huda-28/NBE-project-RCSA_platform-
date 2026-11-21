export interface OfficialReportControlRow {
  control_id: string;
  control_description_ar: string;
  control_owner_ar: string;
  control_method_label: string;
  effectiveness_label_ar: string;
  effectiveness_color_tone: 'green' | 'yellow' | 'orange' | 'neutral';
  frequency_label: string;
  control_type_label: string;
}

export interface OfficialReportRiskRow {
  ref_number: number;
  risk_id: string;
  process_name_ar: string;
  strategic_objective_ar: string;
  risk_library_ar: string;
  risk_description_ar: string;
  key_risk_badge: string;
  expected_frequency_ar: string;
  individual_impact_egp: string;
  expected_annual_loss_egp: string;
  inherent_rating: string;
  controls: OfficialReportControlRow[];
  selected_rrf_label: string;
  residual_loss_formatted: string;
  residual_rating: string;
  nfi_service: string;
  nfi_reputation: string;
  nfi_regulatory: string;
  nfi_legal: string;
  nfi_overall: string;
  final_acceptance_label_ar: string;
  final_acceptance_color_tone: 'green' | 'yellow' | 'orange' | 'neutral';
  corrective_action_ar: string;
  assessment_rationale_ar: string;
  level1_category_ar: string;
  full_taxonomy_path_ar: string;
  esg_classification_ar: string;
}

export interface OfficialRcsaReportModel {
  assessment_id: string;
  unit_id: string;
  unit_name_ar: string;
  unit_name_en: string;
  unit_code: string;
  title_ar: string;
  strategic_objective_ar: string;
  workflow_status: string;
  status_badge_ar: string;
  is_approved: boolean;
  date_label_ar: string;
  sha256_hash?: string;
  risks: OfficialReportRiskRow[];
}

export function classifyControlEffectivenessTone(
  effRaw?: string | null,
  effClass?: string | null
): { label_ar: string; tone: 'green' | 'yellow' | 'orange' | 'neutral' } {
  const raw = String(effRaw || '').trim();
  const cls = String(effClass || '').trim().toUpperCase();

  if (
    cls === 'EFFECTIVE' ||
    (raw.includes('ضابط رقابي فعال') && !raw.includes('يحتاج تطوير') && !raw.includes('غير فعال'))
  ) {
    return {
      label_ar: raw || 'ضابط رقابي فعال',
      tone: 'green',
    };
  }

  if (
    cls === 'PARTIALLY_EFFECTIVE' ||
    cls === 'NEEDS_IMPROVEMENT' ||
    raw.includes('يحتاج تطوير') ||
    raw.includes('ضعيف')
  ) {
    return {
      label_ar: raw || 'ضابط رقابي فعال ولكن يحتاج تطوير (إجراءات تصحيحية لاحقة)',
      tone: 'yellow',
    };
  }

  if (cls === 'INEFFECTIVE' || raw.includes('غير فعال') || raw.includes('لا يوجد')) {
    return {
      label_ar: raw || 'ضابط رقابي غير فعال',
      tone: 'orange',
    };
  }

  return {
    label_ar: raw || 'ضابط رقابي فعال',
    tone: raw ? 'green' : 'neutral',
  };
}

export function classifyAcceptanceDecisionTone(
  acceptanceLabel?: string | null,
  acceptanceClass?: number | null,
  residualRating?: string | null,
  hasNeedsImprovementControl?: boolean
): { label_ar: string; tone: 'green' | 'yellow' | 'orange' | 'neutral' } {
  const raw = String(acceptanceLabel || '').trim();

  if (acceptanceClass === 4 || raw.includes('غير مقبولة')) {
    return {
      label_ar:
        raw || 'مخاطرة غير مقبولة حيث أن الضوابط الرقابية تحتاج تطوير',
      tone: 'orange',
    };
  }

  if (
    acceptanceClass === 2 ||
    acceptanceClass === 3 ||
    raw.includes('تجويد الضوابط') ||
    raw.includes('تحسين الخدمة') ||
    hasNeedsImprovementControl
  ) {
    return {
      label_ar:
        raw ||
        'مخاطرة مقبولة / ضوابط رقابية كافية ولكن يمكن تجويد الضوابط مستقبلا بغرض تحسين الخدمة/ الأعمال',
      tone: 'yellow',
    };
  }

  if (
    acceptanceClass === 1 ||
    raw.includes('مخاطرة مقبولة') ||
    residualRating === 'L' ||
    residualRating === 'M'
  ) {
    return {
      label_ar: raw || 'مخاطرة مقبولة / ضوابط رقابية كافية',
      tone: 'green',
    };
  }

  return {
    label_ar: raw || 'مخاطرة مقبولة / ضوابط رقابية كافية',
    tone: 'green',
  };
}

export function formatOfficialControlMethod(raw?: string | null): string {
  const val = String(raw || '').trim();
  if (!val) return '-';
  if (/semi/i.test(val) || val.includes('نصف آلي') || val.includes('شبه آلي') || val.includes('شبه الي')) {
    return 'Semi-Automated';
  }
  if (/manual/i.test(val) || val.includes('يدوي') || val.includes('يدوى')) return 'manual';
  if (/auto/i.test(val) || val.includes('آلي') || val.includes('الي')) return 'Automated';
  return val;
}

export function formatOfficialControlFrequency(raw?: string | null): string {
  const val = String(raw || '').trim();
  if (!val) return 'Daily\nيومياً';
  if (
    /multiple\s*times/i.test(val) ||
    val.includes('عدة مرات') ||
    /per\s*transaction/i.test(val) ||
    /continuous/i.test(val) ||
    val.includes('مستمر') ||
    val.includes('مع كل معاملة')
  ) {
    return 'Multiple times a day\nعدة مرات في اليوم';
  }
  if (/daily/i.test(val) || val.includes('يومي')) return 'Daily\nيومياً';
  if (
    /ad-?hoc/i.test(val) ||
    /per\s*event/i.test(val) ||
    val.includes('وفقاً والحالة') ||
    val.includes('حسب الحالة') ||
    val.includes('عند كل حالة')
  ) {
    return 'Ad-hoc\nوفقاً والحالة';
  }
  if (/weekly/i.test(val) || val.includes('أسبوع')) return 'Weekly\nأسبوعياً';
  if (/monthly/i.test(val) || val.includes('شهر')) return 'Monthly\nشهرياً';
  if (/quarterly/i.test(val) || val.includes('ربع سنوي')) return 'Quarterly\nربع سنوي';
  if (/annual/i.test(val) || val.includes('سنوي')) return 'Annually\nسنوي';
  return 'Daily\nيومياً';
}

export function formatOfficialControlType(raw?: string | null): string {
  const val = String(raw || '').trim();
  if (!val) return 'ضوابط مانعة\nPreventive';
  if (/corrective/i.test(val) || val.includes('تصحيح')) return 'ضوابط تصحيحية\nCorrective';
  if (/detective/i.test(val) || val.includes('كاشف')) return 'ضوابط كاشفة\nDetective';
  if (/preventive/i.test(val) || val.includes('مانع') || val.includes('وقائ')) return 'ضوابط مانعة\nPreventive';
  return val;
}

export function formatOfficialSelectedRrfKey(rawKey?: string | null): string {
  const val = String(rawKey || '').trim();
  if (!val || val === 'NONE') return '-';
  if (/^auto\s*\/\s*preventive$/i.test(val) || val === 'AUTO_PREVENTIVE') return 'Auto / preventive';
  if (/^semi\s*auto\s*\/\s*preventive$/i.test(val) || val === 'SEMI_AUTO_PREVENTIVE') {
    return 'Semi Auto / preventive';
  }
  if (/^manual\s*\/\s*preventive$/i.test(val) || val === 'MANUAL_PREVENTIVE') {
    return 'Manual / preventive';
  }
  if (/^auto\s*\/\s*detective$/i.test(val) || val === 'AUTO_DETECTIVE') return 'Auto / detective';
  if (/^semi\s*auto\s*\/\s*detective$/i.test(val) || val === 'SEMI_AUTO_DETECTIVE') {
    return 'Semi Auto / detective';
  }
  if (/^manual\s*\/\s*detective$/i.test(val) || val === 'MANUAL_DETECTIVE') {
    return 'Manual / detective';
  }
  if (/^auto\s*\/\s*corrective$/i.test(val) || val === 'AUTO_CORRECTIVE') return 'Auto / corrective';
  if (/^semi\s*auto\s*\/\s*corrective$/i.test(val) || val === 'SEMI_AUTO_CORRECTIVE') {
    return 'Semi Auto / corrective';
  }
  if (/^manual\s*\/\s*corrective$/i.test(val) || val === 'MANUAL_CORRECTIVE') {
    return 'Manual / corrective';
  }
  return val;
}

const OFFICIAL_NBE_L1_DISPLAY: Record<string, string> = {
  'L1-01': '1_ احتيال داخلي',
  'L1-02': '2_ احتيال خارجي',
  'L1-03': '3_وسائل الاحتيال على البطاقات',
  'L1-04': '4_ممارسات العاملين وسلامة بيئة العمل',
  'L1-05': '5_الممارسات الخاطئة في حق عملاء البنك',
  'L1-06': '6_أضرار بأصول البنك',
  'L1-07': '7_الأنظمة و التطبيقات',
  'L1-08': '8_تنفيذ العمليات المصرفية',
};

export function formatOfficialLevel1Category(draftInput: Record<string, any>): {
  level1_short_ar: string;
  full_path_ar: string;
} {
  const l1Id = String(draftInput?.taxonomy_l1_id || '').trim();
  const l1Ar = String(draftInput?.taxonomy_l1_ar || '').trim();
  const l2Id = String(draftInput?.taxonomy_l2_id || '').trim();
  const l2Ar = String(draftInput?.taxonomy_l2_ar || '').trim();
  const l3Id = String(draftInput?.taxonomy_l3_id || '').trim();
  const l3Ar = String(draftInput?.taxonomy_l3_ar || '').trim();

  let level1Short = OFFICIAL_NBE_L1_DISPLAY[l1Id] || l1Ar || '8_تنفيذ العمليات المصرفية';
  if (!OFFICIAL_NBE_L1_DISPLAY[l1Id] && l1Ar) {
    const m = l1Id.match(/(\d+)$/);
    if (m && !l1Ar.startsWith('_') && !/^[1-8]_/.test(l1Ar)) {
      level1Short = `${Number(m[1])}_${l1Ar}`;
    }
  }

  const parts: string[] = [];
  if (level1Short) parts.push(l1Id && !level1Short.startsWith('[') ? `[${l1Id}] ${level1Short}` : level1Short);
  if (l2Ar) parts.push(l2Id ? `[${l2Id}] ${l2Ar}` : l2Ar);
  if (l3Ar) parts.push(l3Id ? `[${l3Id}] ${l3Ar}` : l3Ar);

  return {
    level1_short_ar: level1Short,
    full_path_ar: parts.length > 0 ? parts.join(' ← ') : level1Short,
  };
}

export function buildOfficialRcsaReportModel(params: {
  assessment: Record<string, any>;
  unit?: Record<string, any>;
  risks: Array<Record<string, any>>;
  phase2c?: Record<string, any>;
}): OfficialRcsaReportModel {
  const { assessment, unit, risks, phase2c = {} } = params;
  const unitId = String(unit?.id || assessment?.unit_id || 'BU-SYNDICATED');
  const unitNameAr = String(
    unit?.name_ar || assessment?.unit_name_ar || 'لعمليات القروض المشتركة'
  ).trim();
  const unitNameEn = String(
    unit?.name_en || assessment?.unit_name_en || 'Syndicated Loans Operations'
  ).trim();
  const unitCode = String(unit?.code || unitId).trim();

  const firstObjective =
    risks
      .map((r) => String(r?.current_draft_input?.strategic_objective || '').trim())
      .find((s) => s.length > 0) || 'التركيز علي العملاء و تعظيم الأرباح';

  const workflowStatus = String(
    assessment?.workflow_status || assessment?.status || 'DRAFT'
  ).toUpperCase();
  const isApproved = workflowStatus === 'APPROVED' || assessment?.status === 'APPROVED';

  const statusBadgeAr = isApproved
    ? 'تقييم معتمد رسمياً (Official Approved RCSA)'
    : workflowStatus === 'IN_REVIEW'
      ? 'قيد المراجعة المستقلة (Checker Review)'
      : 'مسودة عمل ومراجعة (Draft RCSA)';

  const rawDate =
    assessment?.approved_at ||
    assessment?.submitted_at ||
    assessment?.updated_at ||
    assessment?.created_at ||
    new Date().toISOString();
  const dateMatch = String(rawDate).match(/^\d{4}-\d{2}-\d{2}/);
  const dateLabelAr = dateMatch ? dateMatch[0] : new Date().toISOString().slice(0, 10);

  const reportRisks: OfficialReportRiskRow[] = (risks || []).map((risk, idx) => {
    const d = risk?.current_draft_input || {};
    const c = risk?.calculated_output || {};
    const p2c = phase2c[risk?.risk_id] || {};
    const p2cInputs = p2c.inputs || {};
    const p2cResult = p2c.result || {};
    const nfiDims = p2cResult.nfi_dimensions || {};
    const rawControls: Array<Record<string, any>> = Array.isArray(d.controls) ? d.controls : [];
    const calcControls: Array<Record<string, any>> = Array.isArray(c.controls_calculated)
      ? c.controls_calculated
      : [];

    const controlsList: OfficialReportControlRow[] =
      rawControls.length > 0
        ? rawControls.map((ctrl, cIdx) => {
            const calcCtrl =
              calcControls.find((cc) => cc.control_id === ctrl.control_id) ||
              calcControls[cIdx] ||
              {};
            const effInfo = classifyControlEffectivenessTone(
              ctrl.effectiveness_raw,
              calcCtrl.effectiveness_classification
            );
            return {
              control_id: String(ctrl.control_id || `CTRL-${cIdx + 1}`),
              control_description_ar: String(ctrl.control_description || '-').trim(),
              control_owner_ar: String(ctrl.control_owner || 'السلطة الاشرافية').trim(),
              control_method_label: formatOfficialControlMethod(ctrl.control_method_raw),
              effectiveness_label_ar: effInfo.label_ar,
              effectiveness_color_tone: effInfo.tone,
              frequency_label: formatOfficialControlFrequency(ctrl.control_frequency_raw),
              control_type_label: formatOfficialControlType(ctrl.control_type_raw),
            };
          })
        : [
            {
              control_id: 'CTRL-01',
              control_description_ar: 'لم يتم إدراج ضوابط رقابية بعد',
              control_owner_ar: 'السلطة الاشرافية',
              control_method_label: 'manual',
              effectiveness_label_ar: 'قيد الاستيفاء',
              effectiveness_color_tone: 'neutral',
              frequency_label: 'Daily\nيومياً',
              control_type_label: 'ضوابط مانعة\nPreventive',
            },
          ];

    const hasNeedsImprovement = controlsList.some(
      (ctrl) => ctrl.effectiveness_color_tone === 'yellow' || ctrl.effectiveness_color_tone === 'orange'
    );

    const inhRating = String(c.annualized_financial_rating || '-').trim();
    const resRating = String(c.continuous_residual_rating || '-').trim();

    const keyRiskRaw =
      p2cResult.key_risk ||
      d.inherent_nfi_applicable ||
      (inhRating === 'VH' || inhRating === 'C' || inhRating === 'H' ? 'YES' : 'NO');
    const keyRiskBadge =
      keyRiskRaw === 'YES' || keyRiskRaw === 'yes' || keyRiskRaw === 'نعم'
        ? 'yes'
        : keyRiskRaw === 'NO' || keyRiskRaw === 'no' || keyRiskRaw === 'لا'
          ? 'no'
          : '';

    const indivImpactNum = Number(
      c.individual_financial_impact_egp ?? d.individual_financial_impact ?? 0
    );
    const annualLossNum = Number(c.expected_annual_loss_egp ?? 0);
    const residualLossNum = Number(c.residual_financial_amount_egp ?? 0);

    const acceptanceInfo = classifyAcceptanceDecisionTone(
      p2cResult.acceptance_label_ar || d.final_risk_acceptance,
      p2cResult.acceptance_class,
      resRating,
      hasNeedsImprovement
    );

    // Strictly suppress corrective action when acceptance_class === 1 (all controls effective & risk accepted)
    const isClass1Accepted =
      p2cResult.acceptance_class === 1 ||
      (!p2cResult.acceptance_class && acceptanceInfo.tone === 'green' && !hasNeedsImprovement);
    const correctiveActionAr = isClass1Accepted
      ? ''
      : String(p2cInputs.corrective_action || d.active_corrective_action_ar || '').trim();

    const rationaleAr = String(
      d.active_rationale_ar ||
        p2cInputs.acceptance_rationale ||
        'المخاطرة مقبولة والضوابط الرقابية فعالة ووفقاً والاتفاق مع الوحدة.'
    ).trim();

    const taxFormatted = formatOfficialLevel1Category(d);

    const esgPillars = Array.isArray(p2cResult.esg_pillars) ? p2cResult.esg_pillars : [];
    const esgLabel =
      p2cResult.esg_status === 'ASSESSED' && esgPillars.length > 0
        ? esgPillars.join(', ')
        : String(d.esg_classification || 'لا توجد صلة موثقة');

    return {
      ref_number: idx + 1,
      risk_id: String(risk?.risk_id || `RSK-${idx + 1}`),
      process_name_ar: String(d.process_name || '-').trim(),
      strategic_objective_ar: String(d.strategic_objective || firstObjective).trim(),
      risk_library_ar: String(d.risk_library_name || '-').trim(),
      risk_description_ar: String(d.risk_description || '-').trim(),
      key_risk_badge: keyRiskBadge,
      expected_frequency_ar: String(
        c.normalized_frequency_label_ar || d.expected_frequency_text || '-'
      ).trim(),
      individual_impact_egp: indivImpactNum > 0 ? String(Math.round(indivImpactNum)) : '-',
      expected_annual_loss_egp:
        annualLossNum > 0
          ? annualLossNum.toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }).replace(/,/g, '')
          : '-',
      inherent_rating: inhRating,
      controls: controlsList,
      selected_rrf_label: formatOfficialSelectedRrfKey(
        c.selected_workbook_rrf_key || c.workbook_reference_s_key
      ),
      residual_loss_formatted:
        residualLossNum > 0
          ? residualLossNum.toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })
          : '-',
      residual_rating: resRating,
      nfi_service: String(nfiDims.service || d.nfi_service || '-'),
      nfi_reputation: String(nfiDims.reputation || d.nfi_reputation || '-'),
      nfi_regulatory: String(nfiDims.regulatory || d.nfi_regulatory || '-'),
      nfi_legal: String(nfiDims.legal || d.nfi_legal || '-'),
      nfi_overall: String(p2cResult.nfi_overall || d.nfi_overall || '-'),
      final_acceptance_label_ar: acceptanceInfo.label_ar,
      final_acceptance_color_tone: acceptanceInfo.tone,
      corrective_action_ar: correctiveActionAr,
      assessment_rationale_ar: rationaleAr,
      level1_category_ar: taxFormatted.level1_short_ar,
      full_taxonomy_path_ar: taxFormatted.full_path_ar,
      esg_classification_ar: esgLabel,
    };
  });

  return {
    assessment_id: String(assessment?.id || 'ASM-RCSA'),
    unit_id: unitId,
    unit_name_ar: unitNameAr,
    unit_name_en: unitNameEn,
    unit_code: unitCode,
    title_ar: `نموذج المخاطر الافتراضي "${unitNameAr}"`,
    strategic_objective_ar: firstObjective,
    workflow_status: workflowStatus,
    status_badge_ar: statusBadgeAr,
    is_approved: isApproved,
    date_label_ar: dateLabelAr,
    sha256_hash: assessment?.immutable_snapshot?.cryptographic_sha256,
    risks: reportRisks,
  };
}

function escapeHtml(str: string): string {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getToneBgHex(tone: 'green' | 'yellow' | 'orange' | 'neutral'): string {
  if (tone === 'green') return '#66FF33';
  if (tone === 'yellow') return '#FFFF00';
  if (tone === 'orange') return '#FFCC00';
  return '#FFFFFF';
}

export function buildOfficialRcsaReportHtml(
  model: OfficialRcsaReportModel,
  options?: {
    theme?: 'reference_burgundy' | 'nbe_emerald';
    includeExtendedColumns?: boolean;
    logoDataUri?: string;
  }
): string {
  const theme = options?.theme || 'reference_burgundy';
  const includeExtended = Boolean(options?.includeExtendedColumns);
  const headerBg = theme === 'nbe_emerald' ? '#09331F' : '#7A1C1C';
  const subHeaderBg = theme === 'nbe_emerald' ? '#006547' : '#801C1C';
  const titleTextHex = theme === 'nbe_emerald' ? '#09331F' : '#C00000';
  const logoSrc = options?.logoDataUri || '/assets/nbe-logo-white.png';

  const rowsHtml: string[] = [];

  for (const risk of model.risks) {
    const span = Math.max(1, risk.controls.length);
    risk.controls.forEach((ctrl, ctrlIdx) => {
      const isFirst = ctrlIdx === 0;
      const effBg = getToneBgHex(ctrl.effectiveness_color_tone);
      const accBg = getToneBgHex(risk.final_acceptance_color_tone);

      const cells: string[] = [];

      if (isFirst) {
        cells.push(
          `<td rowspan="${span}" class="num-cell ref-col">${escapeHtml(String(risk.ref_number))}</td>`
        );
        if (includeExtended) {
          cells.push(
            `<td rowspan="${span}" class="txt-cell">${escapeHtml(risk.process_name_ar)}</td>`,
            `<td rowspan="${span}" class="txt-cell">${escapeHtml(risk.strategic_objective_ar)}</td>`,
            `<td rowspan="${span}" class="txt-cell">${escapeHtml(risk.risk_library_ar)}</td>`
          );
        }
        cells.push(
          `<td rowspan="${span}" class="txt-cell risk-col">${escapeHtml(risk.risk_description_ar)}</td>`,
          `<td rowspan="${span}" class="center-cell">${escapeHtml(risk.key_risk_badge)}</td>`,
          `<td rowspan="${span}" class="center-cell">${escapeHtml(risk.expected_frequency_ar)}</td>`,
          `<td rowspan="${span}" class="num-cell">${escapeHtml(risk.individual_impact_egp)}</td>`,
          `<td rowspan="${span}" class="num-cell">${escapeHtml(risk.expected_annual_loss_egp)}</td>`,
          `<td rowspan="${span}" class="rating-cell">${escapeHtml(risk.inherent_rating)}</td>`
        );
      }

      // Control columns M, N, O, P, Q, R (rendered on every row)
      cells.push(
        `<td class="txt-cell ctrl-desc-col">${escapeHtml(ctrl.control_description_ar)}</td>`,
        `<td class="center-cell">${escapeHtml(ctrl.control_owner_ar)}</td>`,
        `<td class="center-cell" dir="ltr">${escapeHtml(ctrl.control_method_label)}</td>`,
        `<td class="center-cell" style="background-color:${effBg};font-weight:700;">${escapeHtml(ctrl.effectiveness_label_ar)}</td>`,
        `<td class="center-cell pre-line">${escapeHtml(ctrl.frequency_label)}</td>`,
        `<td class="center-cell pre-line">${escapeHtml(ctrl.control_type_label)}</td>`
      );

      if (isFirst) {
        cells.push(
          `<td rowspan="${span}" class="center-cell" dir="ltr">${escapeHtml(risk.selected_rrf_label)}</td>`,
          `<td rowspan="${span}" class="num-cell">${escapeHtml(risk.residual_loss_formatted)}</td>`,
          `<td rowspan="${span}" class="rating-cell">${escapeHtml(risk.residual_rating)}</td>`,
          `<td rowspan="${span}" class="rating-cell">${escapeHtml(risk.nfi_service)}</td>`,
          `<td rowspan="${span}" class="rating-cell">${escapeHtml(risk.nfi_reputation)}</td>`,
          `<td rowspan="${span}" class="rating-cell">${escapeHtml(risk.nfi_regulatory)}</td>`,
          `<td rowspan="${span}" class="rating-cell">${escapeHtml(risk.nfi_legal)}</td>`,
          `<td rowspan="${span}" class="rating-cell">${escapeHtml(risk.nfi_overall)}</td>`,
          `<td rowspan="${span}" class="center-cell" style="background-color:${accBg};font-weight:700;">${escapeHtml(risk.final_acceptance_label_ar)}</td>`,
          `<td rowspan="${span}" class="txt-cell">${escapeHtml(risk.corrective_action_ar)}</td>`,
          `<td rowspan="${span}" class="txt-cell rationale-col">${escapeHtml(risk.assessment_rationale_ar)}</td>`,
          `<td rowspan="${span}" class="center-cell">${escapeHtml(
            includeExtended ? risk.full_taxonomy_path_ar : risk.level1_category_ar
          )}</td>`
        );
        if (includeExtended) {
          cells.push(
            `<td rowspan="${span}" class="center-cell">${escapeHtml(risk.esg_classification_ar)}</td>`
          );
        }
      }

      rowsHtml.push(`<tr>${cells.join('')}</tr>`);
    });
  }

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(model.title_ar)} - البنك الأهلي المصري</title>
  <style>
    @page {
      size: A3 landscape;
      margin: 8mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      margin: 0;
      padding: 8px;
      font-family: 'Cairo', 'Tahoma', 'Arial', sans-serif;
      background: #FFFFFF;
      color: #000000;
      direction: rtl;
    }
    .nbe-top-stamp {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background-color: #09331F;
      color: #FFFFFF;
      padding: 8px 16px;
      border-bottom: 3px solid #F79C1E;
      margin-bottom: 10px;
    }
    .nbe-top-stamp .brand-right {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .nbe-top-stamp img {
      height: 34px;
      width: auto;
      object-fit: contain;
    }
    .nbe-top-stamp .bank-title {
      font-size: 13px;
      font-weight: 800;
      color: #FFFFFF;
    }
    .nbe-top-stamp .bank-sub {
      font-size: 10px;
      color: #A7F3D0;
    }
    .nbe-top-stamp .meta-left {
      text-align: left;
      font-size: 10px;
      line-height: 1.4;
    }
    .nbe-top-stamp .badge {
      display: inline-block;
      background: #006547;
      border: 1px solid #F79C1E;
      color: #F79C1E;
      padding: 2px 8px;
      border-radius: 4px;
      font-weight: 700;
      font-size: 10px;
    }
    /* Official Title Banner Box matching Page 1 of Reference PDF */
    .official-title-box {
      border: 1.5px solid #000000;
      margin-bottom: 12px;
      background: #FFFFFF;
    }
    .official-title-main {
      padding: 16px 12px;
      text-align: center;
      font-size: 22px;
      font-weight: 800;
      color: ${titleTextHex};
      border-bottom: 1px solid #000000;
    }
    .official-objective-row {
      display: flex;
      align-items: stretch;
      min-height: 28px;
    }
    .official-objective-label {
      width: 140px;
      background-color: ${headerBg};
      color: #FFFFFF;
      font-size: 11px;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 4px 8px;
      border-left: 1px solid #000000;
      flex-shrink: 0;
    }
    .official-objective-value {
      flex: 1;
      padding: 4px 12px;
      font-size: 12px;
      font-weight: 700;
      color: #000000;
      display: flex;
      align-items: center;
    }
    /* Main RCSA Matrix Table matching Pages 2-5 of Reference PDF */
    table.rcsa-official-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      font-size: 9.5px;
      line-height: 1.35;
      border: 1.5px solid #000000;
    }
    table.rcsa-official-table thead {
      display: table-header-group;
    }
    table.rcsa-official-table th {
      background-color: ${headerBg};
      color: #FFFFFF;
      border: 1px solid #000000;
      padding: 5px 3px;
      font-weight: 700;
      text-align: center;
      vertical-align: middle;
      word-break: keep-all;
      overflow-wrap: break-word;
    }
    table.rcsa-official-table tr.sub-header-row th {
      background-color: ${subHeaderBg};
      font-size: 8px;
      padding: 4px 2px;
    }
    table.rcsa-official-table td {
      border: 1px solid #000000;
      padding: 4px 3px;
      vertical-align: top;
      word-break: normal;
      overflow-wrap: break-word;
      color: #000000;
    }
    .ref-col {
      width: 26px;
      text-align: center;
      font-weight: 700;
    }
    .risk-col {
      width: 98px;
      font-weight: 700;
    }
    .ctrl-desc-col {
      width: 155px;
    }
    .rationale-col {
      width: 138px;
    }
    .num-cell {
      text-align: center;
      font-family: 'Courier New', monospace;
      font-weight: 700;
      font-size: 8.5px;
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
    }
    .rating-cell {
      text-align: center;
      font-weight: 800;
      font-size: 10px;
      white-space: nowrap;
    }
    .center-cell {
      text-align: center;
    }
    .txt-cell {
      text-align: right;
    }
    .pre-line {
      white-space: pre-line;
    }
  </style>
</head>
<body>
  <!-- Official Bank Header Stamp -->
  <div class="nbe-top-stamp">
    <div class="brand-right">
      <img src="${logoSrc}" alt="البنك الأهلي المصري" />
      <div>
        <div class="bank-title">البنك الأهلي المصري — قطاع المخاطر التشغيلية والرقابة</div>
        <div class="bank-sub">سجل التقييم الذاتي للمخاطر والضوابط الرقابية (RCSA Official Report)</div>
      </div>
    </div>
    <div class="meta-left">
      <div><span class="badge">${escapeHtml(model.status_badge_ar)}</span></div>
      <div style="margin-top:3px;">كود الوحدة: <strong>${escapeHtml(model.unit_code)}</strong> | التاريخ: <strong>${escapeHtml(model.date_label_ar)}</strong></div>
    </div>
  </div>

  <!-- Official Title Box matching Page 1 of Reference PDF -->
  <div class="official-title-box">
    <div class="official-title-main">
      ${escapeHtml(model.title_ar)}
    </div>
    <div class="official-objective-row">
      <div class="official-objective-label">الأهداف الاستراتيجية</div>
      <div class="official-objective-value">${escapeHtml(model.strategic_objective_ar)}</div>
    </div>
  </div>

  <!-- Official RCSA Matrix Table matching Pages 2-5 of Reference PDF -->
  <table class="rcsa-official-table">
    <thead>
      <tr>
        <th rowspan="2" style="width:28px;">المرجع</th>
        ${
          includeExtended
            ? `<th rowspan="2" style="width:66px;">الأنشطة<br/>Process</th>
               <th rowspan="2" style="width:66px;">الأهداف الاستراتيجية</th>
               <th rowspan="2" style="width:74px;">مكتبة المخاطر</th>`
            : ''
        }
        <th rowspan="2" style="width:98px;">المخاطر</th>
        <th rowspan="2" style="width:42px;">المخاطر الرئيسية</th>
        <th rowspan="2" style="width:52px;">عدد مرات حدوث المخاطرة</th>
        <th colspan="3" style="width:162px;">تقييم المخاطرة في ظل عدم تطبيق الضوابط الرقابية<br/>Inherent risk</th>
        <th colspan="2" style="width:210px;">الضوابط الرقابية المطبقة</th>
        <th rowspan="2" style="width:58px;">آلية تطبيق الضابط الرقابي</th>
        <th rowspan="2" style="width:68px;">فاعلية الضوابط الرقابية المطبقة</th>
        <th rowspan="2" style="width:50px;">دورية الضوابط الرقابية</th>
        <th rowspan="2" style="width:62px;">تصنيف الضوابط الرقابية</th>
        <th rowspan="2" style="width:60px;">نوع / طريقة تطبيق الضابط الرقابي</th>
        <th rowspan="2" style="width:64px;">التقييم النهائي للمخاطرة في ظل تطبيق الضوابط الرقابية<br/>Residual risk</th>
        <th rowspan="2" style="width:36px;">التأثير المالي</th>
        <th colspan="5" style="width:170px;">التأثير غير المالي</th>
        <th rowspan="2" style="width:74px;">التقدير النهائي للمخاطرة ومدى فاعلية الإجراءات الرقابية المطبقة ككل</th>
        <th rowspan="2" style="width:76px;">إجراءات تصحيحية (إن وجدت)</th>
        <th rowspan="2" style="width:138px;">الأساس المنطقي للتقدير</th>
        <th rowspan="2" style="width:72px;">تصنيف المخاطر المستوى الأول<br/>Level 1</th>
        ${includeExtended ? `<th rowspan="2" style="width:50px;">ESG</th>` : ''}
      </tr>
      <tr class="sub-header-row">
        <th>التأثير المالي</th>
        <th>الخسارة المتوقعة خلال سنة</th>
        <th>التأثير المالي للمخاطرة</th>
        <th>الضوابط الرقابية</th>
        <th>المسئول عن تطبيق الضوابط الرقابية</th>
        <th>التأثير على تقديم الخدمة</th>
        <th>التأثير على السمعة والعملاء</th>
        <th>التعرض لملاحظات الجهات الرقابية</th>
        <th>التعرض لإجراءات قضائية</th>
        <th>التأثير غير المالي</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml.join('\n')}
    </tbody>
  </table>
</body>
</html>`;
}
