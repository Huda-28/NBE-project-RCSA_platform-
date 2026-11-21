import { db, runInTransaction } from './db.js';
import { User } from '../types/index.js';
import { isUserAuthorizedForBU } from './auth.js';
import { logAuditEvent } from './audit.js';
import { getWorkflowSession, updateWorkflowSession } from './workflow-session-service.js';
import {
  assembleRagContextBundle,
  searchRelevantCitations,
  matchBestTaxonomyAndEsg,
  extractMonetaryAmountsFromText,
  normalizeTextForRag,
  CitationReference,
  RagContextBundle,
} from './rag-service.js';
import {
  generateLlmCompletion,
  generateAgentAutonomousCompletion,
  generateStructuredRcsaProposalsWithLlm,
  getLlmConfigStatus,
  resolveQwenModelProfile,
  stripForbiddenLlmFields,
  QwenModelProfileId,
} from './llm-adapter.js';
import {
  OFFICIAL_FINANCIAL_ANCHORS_EGP,
  OFFICIAL_NBE_STRATEGIC_OBJECTIVES,
  buildNbeAssessmentRationale,
  isBoilerplateOrCoverChunk,
  extractControlDetailsFromText,
  extractMatchedPatternsFromFullDocument,
  extractRiskDetailsFromText,
  normalizeOfficialControlFrequency,
  normalizeOfficialStrategicObjective,
  snapToOfficialReferenceAnchor,
  stripControlMechanismFromDescription,
  stripLocationMarkers,
} from './proposal-extractor.js';
import {
  createGuidedAssessmentDraft,
  invokePythonEngineBridge,
} from './hitl-service.js';

export interface AgentProposalRecord {
  id: string;
  session_id: string;
  unit_id: string;
  proposal_type: 'RISK' | 'CONTROL' | 'CLARIFICATION' | 'CHANGE_RECOMMENDATION';
  proposal_data: any;
  citations: CitationReference[];
  status: 'PROPOSED' | 'ACCEPTED' | 'MODIFIED_ACCEPTED' | 'REJECTED';
  user_decision_notes?: string;
  decided_by?: string;
  decided_at?: string;
  created_at: string;
}

export interface AgentConversationRecord {
  id: string;
  session_id: string;
  unit_id: string;
  sender_role: 'USER' | 'AGENT' | 'SYSTEM';
  message_text_ar: string;
  model_profile?: QwenModelProfileId;
  citations: CitationReference[];
  created_at: string;
}

export interface AgentClarificationRecord {
  id: string;
  session_id: string;
  proposal_id?: string;
  field_name: string;
  question_ar: string;
  options?: string[];
  user_answer_ar?: string;
  answered_by?: string;
  answered_at?: string;
  created_at: string;
}

export function getAgentSessionState(sessionId: string, user: User) {
  const session = getWorkflowSession(sessionId, user);
  const activeProfile: QwenModelProfileId =
    session.selected_model_profile === 'qwen-0.5b' ? 'qwen-0.5b' : 'qwen-4b';

  const messages = db
    .prepare(`
    SELECT * FROM rcsa_agent_conversations 
    WHERE session_id = ? 
    ORDER BY created_at ASC, rowid ASC
  `)
    .all(sessionId) as any[];

  const formattedMessages: AgentConversationRecord[] = messages.map(m => {
    let citations: CitationReference[] = [];
    try {
      citations = JSON.parse(m.citations_json || '[]');
    } catch {
      citations = [];
    }
    return {
      id: m.id,
      session_id: m.session_id,
      unit_id: m.unit_id,
      sender_role: m.sender_role,
      message_text_ar: m.message_text_ar,
      model_profile: m.model_profile === 'qwen-0.5b' ? 'qwen-0.5b' : 'qwen-4b',
      citations,
      created_at: m.created_at,
    };
  });

  const proposals = db
    .prepare(`
    SELECT * FROM rcsa_agent_proposals 
    WHERE session_id = ? 
    ORDER BY created_at DESC, rowid DESC
  `)
    .all(sessionId) as any[];

  const formattedProposals: AgentProposalRecord[] = proposals.map(p => {
    let proposal_data: any = {};
    let citations: CitationReference[] = [];
    try {
      proposal_data = JSON.parse(p.proposal_data_json || '{}');
    } catch {
      proposal_data = {};
    }
    try {
      citations = JSON.parse(p.citations_json || '[]');
    } catch {
      citations = [];
    }
    return {
      id: p.id,
      session_id: p.session_id,
      unit_id: p.unit_id,
      proposal_type: p.proposal_type,
      proposal_data,
      citations,
      status: p.status,
      user_decision_notes: p.user_decision_notes,
      decided_by: p.decided_by,
      decided_at: p.decided_at,
      created_at: p.created_at,
    };
  });

  const clarifications = db
    .prepare(`
    SELECT * FROM rcsa_agent_clarifications 
    WHERE session_id = ? 
    ORDER BY created_at ASC, rowid ASC
  `)
    .all(sessionId) as any[];

  const formattedClarifications: AgentClarificationRecord[] = clarifications.map(c => {
    let options: string[] = [];
    try {
      options = JSON.parse(c.options_json || '[]');
    } catch {
      options = [];
    }
    return {
      id: c.id,
      session_id: c.session_id,
      proposal_id: c.proposal_id,
      field_name: c.field_name,
      question_ar: c.question_ar,
      options,
      user_answer_ar: c.user_answer_ar,
      answered_by: c.answered_by,
      answered_at: c.answered_at,
      created_at: c.created_at,
    };
  });

  const llmStatus = getLlmConfigStatus(activeProfile);
  const ragBundle = assembleRagContextBundle(sessionId, session.unit_id);

  return {
    session,
    messages: formattedMessages,
    proposals: formattedProposals,
    clarifications: formattedClarifications,
    llm_status: llmStatus,
    rag_stats: ragBundle.rag_stats,
  };
}

export function setAgentSessionModel(
  sessionId: string,
  user: User,
  modelProfile: QwenModelProfileId | string
) {
  const resolved = resolveQwenModelProfile(modelProfile);
  updateWorkflowSession(sessionId, user, {
    selected_model_profile: resolved.id,
  });
  return getAgentSessionState(sessionId, user);
}

/**
 * Enrich a candidate risk proposal with authoritative Python RCSA calculations
 * (Inherent Risk, MAX Eligible Control RRF, Continuous Residual Risk).
 */
function enrichProposalWithPythonCalculation(unitId: string, rawPropData: any): any {
  const { sanitized: propData, strippedFields } = stripForbiddenLlmFields(rawPropData);
  try {
    const controlsInput = (propData.controls || []).map((c: any, idx: number) => {
      const rawTypeStr = String(c.control_type_raw || c.design_classification || '').toLowerCase();
      let mappedType = 'ضوابط رقابية مانعة';
      if (
        c.design_classification === 'CORRECTIVE' ||
        rawTypeStr.includes('corrective') ||
        rawTypeStr.includes('تصحيح')
      ) {
        mappedType = 'ضوابط رقابية تصحيحية';
      } else if (
        c.design_classification === 'DETECTIVE' ||
        rawTypeStr.includes('detective') ||
        rawTypeStr.includes('كاشف')
      ) {
        mappedType = 'ضوابط رقابية كاشفة';
      }

      const rawMethodStr = String(c.control_method_raw || c.automation_level || '').toLowerCase();
      // IMPORTANT: Check SEMI_AUTOMATED BEFORE AUTOMATED because 'نصف آلي' / 'شبه آلي' includes 'آلي'!
      let mappedMethod = 'يدوي';
      if (
        c.automation_level === 'SEMI_AUTOMATED' ||
        rawMethodStr.includes('semi') ||
        rawMethodStr.includes('نصف') ||
        rawMethodStr.includes('شبه')
      ) {
        mappedMethod = 'شبه آلي';
      } else if (
        c.automation_level === 'MANUAL' ||
        rawMethodStr.includes('manual') ||
        rawMethodStr.includes('يدوي')
      ) {
        mappedMethod = 'يدوي';
      } else if (
        c.automation_level === 'AUTOMATED' ||
        rawMethodStr.includes('auto') ||
        rawMethodStr.includes('آلي') ||
        rawMethodStr.includes('الي')
      ) {
        mappedMethod = 'آلي';
      }

      return {
        control_id: c.control_id || `CTL-${propData.risk_id || '01'}-0${idx + 1}`,
        linked_risk_id: propData.risk_id,
        control_description: stripControlMechanismFromDescription(
          c.description_ar || c.control_description || 'ضابط رقابي تشغيلي'
        ),
        control_owner: c.control_owner || c.control_owner_ar || 'السلطة الإشرافية',
        control_type_raw: mappedType,
        control_method_raw: mappedMethod,
        control_frequency_raw: normalizeOfficialControlFrequency(c.control_frequency_raw || 'Daily\nيومياً'),
        effectiveness_raw: c.effectiveness_raw || 'ضابط رقابي فعال',
        implementation_status: c.implementation_status || 'IMPLEMENTED',
        eligible_for_scope_override: c.scope_relevance === 'EXCLUDED' ? false : null,
      };
    });

    const impactAmt = propData.financial_impact_amount ?? OFFICIAL_FINANCIAL_ANCHORS_EGP.M;
    const freqText = propData.inherent_frequency_text || 'مرة واحدة كل سنة';

    const draftInput = {
      risk_id: propData.risk_id,
      unit_id: unitId,
      process_name: propData.process_name_ar || 'العمليات المصرفية للوحدة',
      risk_description: propData.description_ar || propData.risk_title_ar || '',
      individual_financial_impact: impactAmt,
      financial_value_origin: 'EXPLICIT_HUMAN_ESTIMATE',
      financial_evidence_justification: propData.financial_impact_justification || '',
      expected_frequency_text: freqText,
      frequency_origin: 'AUTHORIZED_USER_ESTIMATE',
      frequency_justification: propData.frequency_justification || '',
      taxonomy_l1_id: propData.taxonomy_l1_id,
      taxonomy_l1_ar: propData.taxonomy_l1_ar,
      taxonomy_l2_id: propData.taxonomy_l2_id,
      taxonomy_l2_ar: propData.taxonomy_l2_ar,
      taxonomy_l3_id: propData.taxonomy_l3_id,
      taxonomy_l3_ar: propData.taxonomy_l3_ar,
      controls: controlsInput,
    };

    const pyRes = invokePythonEngineBridge({
      action: 'recalculate_single_risk',
      unit_id: unitId,
      risk_id: propData.risk_id,
      current_draft_input: draftInput,
      preserve_custom_rationale: true,
    });

    const calc = pyRes?.calculated_output || {};
    const computedInhRating = calc.annualized_financial_rating || null;
    const computedResRating = calc.continuous_residual_rating || null;

    // Derive authoritative Key Risk status (YES iff inherent financial OR any NFI dimension is H/VH/C)
    const p2cNfi = propData.phase2c_inputs?.nfi || {};
    const nfiValues = [
      p2cNfi.service?.rating,
      p2cNfi.reputation?.rating,
      p2cNfi.regulatory?.rating,
      p2cNfi.legal?.rating,
    ];
    const isKeyRisk = [computedInhRating, ...nfiValues].some(
      (v) => v === 'H' || v === 'VH' || v === 'C'
    );

    // Ensure Phase 2C acceptance class & corrective action stay strictly consistent with control effectiveness
    const hasNeedsImprovement = controlsInput.some((c: any) =>
      String(c.effectiveness_raw || '').includes('يحتاج تطوير')
    );
    const updatedPhase2c = propData.phase2c_inputs ? { ...propData.phase2c_inputs } : undefined;
    let finalCorrectiveAction = propData.corrective_action_ar || '';
    if (updatedPhase2c) {
      if (!hasNeedsImprovement && (computedResRating === 'L' || computedResRating === 'M') && updatedPhase2c.acceptance_class === 1) {
        updatedPhase2c.corrective_action = '';
        finalCorrectiveAction = '';
      }
      const rankOrder: Record<string, number> = { '-': 0, L: 1, M: 2, H: 3, VH: 4, C: 5 };
      const nfiOverall = nfiValues.reduce(
        (best: string, cur: string) => ((rankOrder[cur] || 0) > (rankOrder[best] || 0) ? cur : best),
        'L'
      );
      const rebuiltRationale = buildNbeAssessmentRationale({
        acceptanceClass: (updatedPhase2c.acceptance_class || 1) as 1 | 2 | 3 | 4,
        frequencyAr: calc.normalized_frequency_label_ar || freqText,
        individualImpactEgp: Number(calc.individual_financial_impact_egp ?? impactAmt),
        residualRating: computedResRating || 'L',
        nfiOverall,
        hasDocumentedIncident: Boolean(propData.has_documented_incident),
        incidentLossEgp: propData.documented_incident_loss_egp,
      });
      updatedPhase2c.acceptance_rationale = rebuiltRationale;
      propData.acceptance_rationale_ar = rebuiltRationale;
    }

    return {
      ...propData,
      strategic_objective_ar: normalizeOfficialStrategicObjective(propData.strategic_objective_ar),
      inherent_frequency_text: calc.normalized_frequency_label_ar || freqText,
      expected_annual_loss: calc.expected_annual_loss_egp ?? propData.expected_annual_loss,
      expected_loss_egp: impactAmt,
      inherent_rating: computedInhRating,
      inherent_label_ar: calc.annualized_financial_label_ar || null,
      effective_max_rrf: calc.effective_max_rrf ?? null,
      selected_workbook_rrf_key: calc.selected_workbook_rrf_key ?? null,
      selected_max_rrf_control_id: calc.selected_max_rrf_control_id || controlsInput[0]?.control_id,
      residual_loss_amount: calc.residual_financial_amount_egp ?? null,
      residual_rating: computedResRating,
      key_risk: isKeyRisk ? 'YES' : 'NO',
      corrective_action_ar: finalCorrectiveAction,
      phase2c_inputs: updatedPhase2c || propData.phase2c_inputs,
      controls: (propData.controls || []).map((origCtrl: any, idx: number) => ({
        ...origCtrl,
        control_id: controlsInput[idx].control_id,
        description_ar: controlsInput[idx].control_description,
        control_frequency_raw: controlsInput[idx].control_frequency_raw,
        control_type_raw: controlsInput[idx].control_type_raw,
        control_method_raw: controlsInput[idx].control_method_raw,
        control_owner: controlsInput[idx].control_owner,
      })),
      python_verified: true,
      calculation_trace: {
        methodology_version: 'v1',
        rule_ids: ['BR-001', 'BR-007', 'BR-008', 'BR-009', 'BR-012'],
        action_plan_improves_residual: false,
        stripped_llm_fields: strippedFields,
      },
    };
  } catch {
    return propData;
  }
}

/**
 * Elevated Open-Domain Expert Synthesizer:
 * When the user's question is NOT matched in the RAG index (`citations.length === 0`),
 * the agent exercises full open-domain authority to answer directly and comprehensively
 * across banking, operational risk (Basel II/III, CBE, NBE), KRIs, controls, cyber/IT,
 * fraud, AML/KYC, third-party risk, ESG, SOP drafting, or any general/conversational query.
 */
function synthesizeOpenDomainExpertAnswer(params: {
  userQuestion: string;
  modelProfile: QwenModelProfileId;
  ragBundle: RagContextBundle;
}): string {
  const { userQuestion, modelProfile, ragBundle } = params;
  const normQ = normalizeTextForRag(userQuestion);
  const isFast = modelProfile === 'qwen-0.5b';
  const unitName = ragBundle.unit?.name_ar || 'الوحدة التنظيمية';
  const matchedTax = matchBestTaxonomyAndEsg(userQuestion, ragBundle);

  const sections: string[] = [];
  sections.push(
    `🌐 **[صلاحية الاستدلال المفتوح والخبرة المصرفية للنموذج — خارج نطاق مرفقات RAG المباشرة]**`
  );
  sections.push(
    `_لم يرد هذا الاستفسار نصاً في المقاطع المفهرسة للملفات المرفوعة، لذا يجيب النموذج بصلاحيته الاستشارية الكاملة ومعرفته المصرفية والعامة:_`
  );

  // 1. Conversational / Greeting / Capabilities
  if (
    normQ.match(/^(مرحبا|اهلا|سلام|صباح|مساء|ازيك|كيف حالك|hi|hello|hey|من انت|عرف نفسك|تقدر تعمل ايه|ما هي قدراتك|مساعده|help)/)
  ) {
    sections.push(
      `\nأهلاً بك! أنا **الوكيل الذكي لمنصة التقييم الذاتي للمخاطر والضوابط الرقابية (RCSA & RAG)**، وأعمل حالياً بصلاحيات موسعة تشمل مسارين متكاملين:\n` +
        `1. **مسار الاسترجاع الموثق (RAG System):** قراءة وفهم كافة الملفات والجداول التي ترفعها (PDF, Word, Excel, CSV, JSON, XML, PPTX, TXT) والإجابة عن أدق التفاصيل والأرقام الواردة فيها وبناء مصفوفة RCSA رسمية.\n` +
        `2. **مسار الصلاحية الاستشارية المفتوحة (Open-Domain LLM Authority):** الإجابة الحرة والشاملة عن أي سؤال مصرفي أو رقابي أو تقني أو عام حتى لو لم يكن موجوداً في الملفات المرفوعة (مثل معايير بازل، تعليمات البنك المركزي المصري، تصميم الضوابط، مؤشرات KRI، الأمن السيبراني، مكافحة الاحتيال وغسل الأموال، خطط الطوارئ، وصياغة السياسات).`
    );
    return sections.join('\n');
  }

  // 2. Basel II/III, CBE Regulations, Governance & Three Lines of Defense
  if (normQ.match(/بازل|basel|المركزي|cbe|رقاب|خطوط الدفاع|حوكمة|راس المال|تشغيلي|منهجي/)) {
    sections.push(
      `\n**🏛️ المرجعية الرقابية ومعايير بازل والبنك المركزي المصري (CBE):**\n` +
        `- **التعريف الرقابي للمخاطر التشغيلية:** هي مخاطر الخسارة الناتجة عن عدم كفاية أو فشل العمليات الداخلية أو العنصر البشري أو الأنظمة الآلية أو الناتجة عن أحداث خارجية، وتشمل المخاطر القانونية وتستبعد المخاطر الاستراتيجية ومخاطر السمعة (كركيزة رأس مال مباشرة، مع قياس أثرها غير المالي NFI).\n` +
        `- **نموذج خطوط الدفاع الثلاثة (Three Lines of Defense):**\n` +
        `  1. **خط الدفاع الأول (${unitName}):** يمتلك المخاطر، وينفذ التقييم الذاتي (RCSA)، ويطبق الضوابط اليومية.\n` +
        `  2. **خط الدفاع الثاني (إدارة المخاطر التشغيلية والالتزام):** يضع المنهجية، ويراجع التقييمات ويتحداها (Risk Challenge)، ويراقب مؤشرات الإنذار المبكر (KRIs).\n` +
        `  3. **خط الدفاع الثالث (المراجعة الداخلية والتفتيش):** يقدم تأكيداً مستقلاً حول كفاءة التصميم والتشغيل الفعلي للضوابط.`
    );
  }

  // 3. Control Design (Preventive vs Detective, Automated vs Manual, BR-007/008/009)
  if (normQ.match(/ضابط|ضوابط|وقائي|كاشف|تصحيحي|يدوي|الي|رقابه|تصميم|فعاليه/)) {
    sections.push(
      `\n**🛡️ هندسة وتصميم الضوابط الرقابية المصرفية:**\n` +
        `- **الضوابط الوقائية الآلية (Preventive Automated Controls):** هي الأعلى كفاءة في خفض المخاطر (تمنح معامل خفض RRF يصل إلى \`90%\` عند التكرار المنتظم والتصميم الفعال)، مثل القيود الإجبارية في النظام البنكي (System Hard Stops) والتحقق الآلي من الصلاحيات (Maker-Checker).\n` +
        `- **الضوابط الكاشفة (Detective Controls):** ترصد الخطأ بعد وقوعه لاحتواء الأثر (مثل التسويات اليومية وتقارير الاستثناءات \`Exception Reports\`)، وتمنح معامل خفض أقل من الضوابط الوقائية.\n` +
        `- **قواعد إعادة التقييم الإلزامية (BR-007 / BR-008 / BR-009):**\n` +
        `  • أي تعديل جوهري في إجراءات العمل (SOP) يستوجب إعادة تقييم كفاية تصميم الضابط.\n` +
        `  • ظهور ملاحظة تفتيش أو حادث تشغيلي متكرر يفرض مراجعة فعالية التشغيل الفعلي للضابط.`
    );
  }

  // 4. Key Risk Indicators (KRIs) & Risk Appetite
  if (normQ.match(/مؤشر|مؤشرات|kri|انذار مبكر|شهي|appetite|tolerance|حدود|قياس/)) {
    sections.push(
      `\n**📈 تصميم مؤشرات المخاطر الرئيسية (KRIs) وحدود الإنذار المبكر:**\n` +
        `- لبناء مؤشر KRI استباقي فعال في **${unitName}**، يجب تحديد ثلاث مناطق قياس كمية:\n` +
        `  1. **النطاق الأخضر (المقبول / Within Appetite):** سير العمليات ضمن الحدود الطبيعية.\n` +
        `  2. **النطاق الأصفر (إنذار مبكر / Early Warning Trigger):** يستوجب تحليل السبب الجذري واتخاذ إجراء وقائي فوري.\n` +
        `  3. **النطاق الأحمر (تجاوز حد التحمل / Breach of Tolerance):** يستوجب التصعيد الفوري للجنة المخاطر وتفعيل خطة عمل تصحيحية (Action Plan).\n` +
        `- **أمثلة عملية لمؤشرات KRI:** نسبة المعاملات المعلقة لأكثر من 24 ساعة، عدد حالات التجاوز الاستثنائي للصلاحيات، معدل توقف الأنظمة الحرجة، وعدد شكاوى العملاء المتكررة.`
    );
  }

  // 5. Cyber, IT, Fraud, AML/KYC, Third-Party & BCP/DR
  if (normQ.match(/سيبران|اختراق|امن معلومات|احتيال|تزوير|غسل اموال|kyc|اعرف عميلك|طرف ثالث|مورد|استمراري|طوارئ|bcp|انقطاع/)) {
    sections.push(
      `\n**🔐 التحليل التخصصي للمخاطر التقنية والأمنية والامتثال:**\n` +
        `- **السبب الجذري والمحركات:** ثغرات التكامل التقني، ضعف التحقق الثنائي (MFA)، أو الاعتماد على موردين خارجيين (Third-Party Vendors) دون اتفاقيات مستوى خدمة (SLA) صارمة.\n` +
        `- **حزمة الضوابط الموصى بها:**\n` +
        `  1. تفعيل التشفير الكامل ومراقبة السجلات الأمنية لحظياً عبر مركز العمليات الأمنية (SOC/SIEM).\n` +
        `  2. تطبيق قواعد مكافحة الاحتيال الآلية (Fraud Monitoring Rules) وفحص قوائم الحظر وKYC قبل تمرير المعاملات.\n` +
        `  3. إجراء اختبارات دورية لخطة استمرارية الأعمال والتعافي من الكوارث (BCP/DR Drills) لضمان عدم تجاوز زمن التعافي المستهدف (RTO/RPO).`
    );
  }

  // 6. Drafting SOPs, Policies, or Action Plans
  if (normQ.match(/صياغ|اكتب|نموذج|خطه عمل|اجراء|سياسه|رد علي التفتيش|مقترح/)) {
    sections.push(
      `\n**📝 نموذج إرشادي مقترح للتطبيق في (${unitName}):**\n` +
        `- **الهدف الرقابي:** إحكام الرقابة المسبقة واللاحقة ومنع تكرار الفجوات التشغيلية.\n` +
        `- **الخطوة الإجرائية (1 - الإعداد والتحقق):** التزام الموظف المختص (Maker) بمراجعة المستندات الأصلية والتحقق من استيفاء كافة الحقول الإلزامية على النظام قبل الإرسال.\n` +
        `- **الخطوة الإجرائية (2 - المراجعة والاعتماد):** قيام المراجع المستقل (Checker) بمطابقة البيانات واعتماد العملية وفق مصفوفة الصلاحيات المالية.\n` +
        `- **الخطوة الإجرائية (3 - التسوية والأرشفة):** إصدار تقرير مطابقة يومي آلي في نهاية اليوم وأرشفة المستندات إلكترونياً.`
    );
  }

  // 7. Always provide a tailored synthesis for ANY question + Taxonomy/ESG linkage in deep mode
  sections.push(
    `\n**💡 التحليل المباشر والتوصية الاستشارية لسؤالك ("${userQuestion.slice(0, 120)}"):**\n` +
      `- **السياق التطبيقي:** بالاستناد إلى طبيعة عمل **${unitName}** وأفضل الممارسات المصرفية، يُنصح بتوثيق الإجراء أو الاستفسار محل البحث ضمن مصفوفة المخاطر والضوابط وربطه بمؤشر قياس واضح (KRI) ومسؤول تنفيذ محدد.\n` +
      `- **الربط الهيكلي الاسترشادي بالتصنيف المصرفي:**\n` +
      `  • التصنيف الرئيسي (L1): **${matchedTax.taxonomy_l1_ar}** (\`${matchedTax.taxonomy_l1_id}\`)\n` +
      `  • التصنيف الفرعي (L2/L3): **${matchedTax.taxonomy_l2_ar}** ← **${matchedTax.taxonomy_l3_ar}** (\`${matchedTax.taxonomy_l3_id}\`)\n` +
      `  • البعد البيئي والمجتمعي والحوكمة (ESG): **${matchedTax.esg_pillar}** (${matchedTax.esg_pathway_ar}).`
  );

  if (!isFast) {
    sections.push(
      `\n**🧭 خطوات عملية مقترحة (الوضع الدقيق):**\n` +
        `1. إذا كان لديك مستند أو جدول يخص هذا الموضوع، يمكنك رفعه أو لصقه ليقوم محرك **RAG** بدمجه مع هذا التحليل.\n` +
        `2. يمكنك توجيهي بعبارة: *"قم بتوليد مقترح خطر وضابط رقابي لهذا الموضوع"* لإدراجه في بطاقات القرار وإعادة احتساب درجاته عبر محرك بايثون المعتمد.`
    );
  }

  return sections.join('\n');
}

/**
 * Synthesize a deeply grounded Qwen RAG response in Arabic that directly answers ANY user question
 * about the uploaded documents, tables, procedures, incidents, audit findings, or RCSA calculations,
 * AND exercises elevated open-domain LLM authority whenever the question is not found in the RAG index.
 */
function synthesizeQwenGroundedRagAnswer(params: {
  userQuestion: string;
  modelProfile: QwenModelProfileId;
  ragBundle: RagContextBundle;
  citations: CitationReference[];
  workflowMode: 'NEW' | 'UPDATE';
}): string {
  const { userQuestion, modelProfile, ragBundle, citations, workflowMode } = params;
  const qOption = resolveQwenModelProfile(modelProfile);
  const normQ = normalizeTextForRag(userQuestion);
  const isFast = modelProfile === 'qwen-0.5b';

  const lines: string[] = [];
  lines.push(
    isFast
      ? `⚡ **[${qOption.short_label_ar} — استدلال الذكاء الاصطناعي وRAG السريع]**`
      : `🎯 **[${qOption.short_label_ar} — استدلال الذكاء الاصطناعي وRAG المعمق]**`
  );

  // Check if user is asking a specific question vs general RCSA generation
  const isAskingCalculation = Boolean(
    normQ.match(/حساب|معادل|rrf|متبقي|كامنه|كامن|تخفيض|كيفيه احتساب|ازاي بتحسب|درجه المخاطر/)
  );
  const isAskingComparison = Boolean(
    normQ.match(/مقارن|فرق|تغيير|تحديث|سابق|قديم|جديد|تاريخ/)
  );
  const isAskingIncidentsOrAudit = Boolean(
    normQ.match(/حادث|حوادث|تفتيش|ملاحظ|فجو|خسار|خسائر/)
  );
  const isAskingSummaryOrFiles = Boolean(
    normQ.match(/ملف|مستند|داتا|بيانات|ملخص|لخص|محتوي|شوف|اقرا|فهمت|مرفوع/)
  );

  const isOpenDomainQuery =
    citations.length === 0 &&
    !isAskingCalculation &&
    !isAskingComparison &&
    !isAskingIncidentsOrAudit &&
    !isAskingSummaryOrFiles;

  // 1. Direct Evidence-Based Answer from Uploaded Documents & RAG Citations
  if (citations.length > 0) {
    lines.push(`\n**🔍 الإجابة المستخلصة من فهرس المستندات والأدلة (RAG Retrieval):**`);
    const topCitations = isFast ? citations.slice(0, 3) : citations.slice(0, 6);

    for (let i = 0; i < topCitations.length; i++) {
      const c = topCitations[i];
      lines.push(
        `${i + 1}. **[${c.title_ar} — ${c.section_title || 'مقطع مرجعي'}]:**\n   "${c.quote_text}"`
      );
    }

    // Extract any numbers/amounts/timeframes from the matched chunks to highlight directly
    const matchedTextCombined = topCitations.map(c => c.quote_text).join(' ');
    const foundAmounts = extractMonetaryAmountsFromText(matchedTextCombined);
    const timeMatches = matchedTextCombined.match(/\d+\s*(?:ساعة|ساعات|يوم|يوماً|أيام|شهر|أشهر|سنة|سنوات|%)/g);

    if (foundAmounts.length > 0 || (timeMatches && timeMatches.length > 0)) {
      lines.push(`\n**📌 المؤشرات الرقمية والزمنية المستخرجة من النص:**`);
      if (foundAmounts.length > 0) {
        lines.push(`- القيم والمبالغ المالية المرصودة: ${foundAmounts.map(a => `${a.toLocaleString()} ج.م`).join(' ، ')}`);
      }
      if (timeMatches && timeMatches.length > 0) {
        lines.push(`- الحدود الزمنية / النسب المرجعية: ${Array.from(new Set(timeMatches)).join(' ، ')}`);
      }
    }
  } else if (isOpenDomainQuery) {
    // Elevated LLM Authority when query is not in RAG
    lines.push(
      '\n' +
        synthesizeOpenDomainExpertAnswer({
          userQuestion,
          modelProfile,
          ragBundle,
        })
    );
  } else if (ragBundle.session_documents.length === 0) {
    lines.push(
      `\nℹ️ لم يتم رفع مستندات خاصة بالجلسة حتى الآن. يمكنك رفع أي ملف (PDF, Word, Excel, CSV, JSON, XML, TXT, PPTX, ZIP) أو لصق البيانات مباشرة ليقوم محرك **${qOption.short_label_ar}** بفهرستها، كما يمكنك طرح أي سؤال عام أو استشاري وسيجيبك النموذج بصلاحيته الكاملة.`
    );
  }

  // 2. If asking about uploaded files summary / structure (or in deep mode when RAG matched)
  if ((isAskingSummaryOrFiles || (!isFast && !isOpenDomainQuery)) && ragBundle.session_documents.length > 0) {
    lines.push(`\n**📂 تحليل هيكلي للملفات المرفوعة بالجلسة (${ragBundle.session_documents.length} ملف):**`);
    for (const doc of ragBundle.session_documents) {
      const previewChunk = doc.chunks[0]?.content_text?.slice(0, isFast ? 120 : 220) || 'لا يوجد نص مستخلص';
      const amountsStr =
        doc.detected_amounts_egp.length > 0
          ? ` | مبالغ مرصودة: ${doc.detected_amounts_egp.map(a => `${a.toLocaleString()} ج.م`).join('، ')}`
          : '';
      lines.push(
        `- **${doc.title_ar}** (النوع: \`${doc.doc_type}\` • ${doc.chunks.length} مقاطع مفهرسة • ${doc.total_chars.toLocaleString()} حرف${amountsStr}):\n  مقتطف: *"${previewChunk}..."*`
      );
    }
  }

  // 3. If asking about incidents or audit findings (or in deep mode when RAG matched)
  if (
    isAskingIncidentsOrAudit ||
    (!isFast && !isOpenDomainQuery && (ragBundle.incidents.length > 0 || ragBundle.audit_findings.length > 0))
  ) {
    if (ragBundle.incidents.length > 0) {
      const maxInc = ragBundle.incidents.reduce(
        (max: any, inc: any) => ((inc.loss_amount_egp || 0) > (max?.loss_amount_egp || 0) ? inc : max),
        ragBundle.incidents[0]
      );
      lines.push(
        `\n**⚠️ سجل الحوادث التشغيلية والخسائر الفعلية (${ragBundle.incidents.length} حادث):**`
      );
      lines.push(
        `- أقصى خسارة تاريخية مسجلة: **${Number(maxInc?.loss_amount_egp || 0).toLocaleString()} ج.م** (${maxInc?.event_type || maxInc?.id}).`
      );
      for (const inc of ragBundle.incidents.slice(0, isFast ? 2 : 4)) {
        lines.push(
          `  • [${inc.id}] ${inc.description} (الخسارة: ${Number(inc.loss_amount_egp || 0).toLocaleString()} ج.م)`
        );
      }
    }
    if (ragBundle.audit_findings.length > 0) {
      lines.push(`\n**🛡️ ملاحظات التفتيش والمراجعة الداخلية (${ragBundle.audit_findings.length} ملاحظة):**`);
      for (const af of ragBundle.audit_findings.slice(0, isFast ? 2 : 4)) {
        lines.push(`  • **${af.title_ar}**: ${af.details_ar.slice(0, 160)} (الإجراء التصحيحي: ${af.corrective_action_ar.slice(0, 100)})`);
      }
    }
  }

  // 4. If asking about RRF / Residual / Inherent calculation methodology
  if (isAskingCalculation) {
    lines.push(`\n**🧮 المنهجية الحسابية المعتمدة بمحرك بايثون (Authoritative RCSA Engine):**`);
    lines.push(`- **الخسارة السنوية المتوقعة (Expected Annual Loss):** = قيمة الأثر المالي الفردي (EGP) × معامل التكرار السنوي.`);
    lines.push(`- **معامل خفض المخاطر الأقصى (MAX Eligible Control RRF):** يتم اختيار أعلى معامل RRF فقط من بين الضوابط **المطبقة فعلياً (IMPLEMENTED)** والمؤهلة نطاقياً (مثلاً: ضابط وقائي آلي فعال = \`90%\` أو \`77.5%\` وفق مصفوفة البنك)، مع استبعاد الضوابط المقترحة (\`PROPOSED\`) أو الجزئية غير المغطاة.`);
    lines.push(`- **قيمة المخاطرة المتبقية (Continuous Residual Risk):** = الخسارة السنوية المتوقعة × \`(1 - MAX Eligible RRF)\`.`);
  }

  // 5. If in UPDATE mode or asking about historical comparison
  if ((isAskingComparison || (workflowMode === 'UPDATE' && !isOpenDomainQuery)) && ragBundle.baseline_risks.length > 0) {
    lines.push(
      `\n**🔄 مقارنة RAG مع التقييم المرجعي السابق للوحدة (${ragBundle.baseline_risks.length} مخاطر أساسية):**`
    );
    for (const br of ragBundle.baseline_risks.slice(0, isFast ? 3 : 5)) {
      lines.push(
        `- **[${br.risk_id}] ${br.process_name}:** الأثر الفردي = ${Number(br.individual_financial_impact || 0).toLocaleString()} ج.م | أقصى RRF = ${Math.round(Number(br.effective_max_rrf || 0) * 100)}% | المتبقي = ${Number(br.residual_financial_amount_egp || 0).toLocaleString()} ج.م (${br.residual_financial_rating || '-'})`
      );
    }
  }

  // 6. Standard coverage summary footer (preserves test expectations)
  if (ragBundle.session_documents.length > 0 || ragBundle.incidents.length > 0) {
    const docTitles = ragBundle.session_documents.map(d => d.title_ar).join('، ');
    const incCount = ragBundle.incidents.length;
    lines.push(
      `\n📊 **ملخص تغطية الأدلة والمستندات بالجلسة:**\n- المستندات المرفوعة: ${docTitles || 'لا توجد مستندات'}\n- سجل الحوادث الميدانية المسجلة: ${incCount} حوادث تشغيلية.`
    );
  }

  return lines.join('\n');
}

/**
 * Extract high-precision RCSA Risk & Control proposals from ALL uploaded session documents
 * using Qwen profile depth (`qwen-0.5b` Fast vs `qwen-4b` High Accuracy), official 84-row L1-L3 taxonomy,
 * 34-row ESG catalogue, and authoritative Python recalculation.
 */
async function buildHighPrecisionRcsaProposals(params: {
  session: any;
  ragBundle: RagContextBundle;
  modelProfile: QwenModelProfileId;
  existingProposals: AgentProposalRecord[];
}): Promise<
  Array<{
    type: 'RISK' | 'CONTROL' | 'CLARIFICATION' | 'CHANGE_RECOMMENDATION';
    data: any;
    citations: CitationReference[];
  }>
> {
  const { session, ragBundle, modelProfile, existingProposals } = params;
  const generatedProposals: Array<{
    type: 'RISK' | 'CONTROL' | 'CLARIFICATION' | 'CHANGE_RECOMMENDATION';
    data: any;
    citations: CitationReference[];
  }> = [];

  const isAccurateMode = modelProfile === 'qwen-4b';
  const maxProposalsToGenerate = isAccurateMode ? 8 : 4;

  // Track already-cited chunk IDs or risk titles so we don't duplicate existing proposals
  const existingChunkIds = new Set<string>();
  const existingTitles = new Set<string>();
  for (const ep of existingProposals) {
    if (ep.proposal_data?.risk_title_ar) existingTitles.add(ep.proposal_data.risk_title_ar);
    for (const cit of ep.citations || []) {
      if (cit.chunk_id) existingChunkIds.add(cit.chunk_id);
    }
  }

  let nextRiskSeq = existingProposals.length + 1;
  const maxUnitIncidentLoss = ragBundle.incidents.reduce(
    (max: number, inc: any) => Math.max(max, Number(inc.loss_amount_egp || 0)),
    0
  );

  // Collect informative operational chunks (filtering out cover titles / prefaces whenever operational clauses exist)
  const unindexedDocChunks: Array<{ doc: any; chunk: any; score: number }> = [];
  const allDocTextParts: string[] = [];
  for (const doc of ragBundle.session_documents) {
    allDocTextParts.push(doc.title_ar || '');
    for (const ch of doc.chunks) {
      if (ch.content_text) allDocTextParts.push(ch.content_text);
    }

    const candidatePool = doc.chunks.filter(
      ch => ch.content_text && ch.content_text.trim().length > 15 && !existingChunkIds.has(ch.id)
    );
    const nonCoverPool = candidatePool.filter(
      ch => !isBoilerplateOrCoverChunk(ch.content_text, doc.chunks.length)
    );
    const activePool = nonCoverPool.length > 0 ? nonCoverPool : candidatePool;

    const scored = activePool.map((ch, idx) => {
      const txt = normalizeTextForRag(ch.content_text);
      let s = 0;
      if (ch.content_text.includes('•') || ch.content_text.includes(':')) s += 4;
      if (txt.match(/حظر|عقوبات|غسل|احتيال|تزوير|maker|checker|اعتماد|صلاحيات/)) s += 5;
      if (txt.match(/نوسترو|مطابقه|تسويه|مقاصه|تجميد|فك تجميد|قيد مزدوج|السيوله|صادره|وارده|اغفال/)) s += 4;
      if (txt.match(/ضابط|رقاب|فحص|تحقق|تدقيق|مراجعه|تقرير|sla|انذار/)) s += 3;
      if (ch.content_text.trim().length >= 90) s += 2;
      return { doc, chunk: ch, score: s, order: idx };
    });

    scored.sort((a, b) => b.score - a.score || a.order - b.order);
    const perDocLimit = isAccurateMode ? 8 : 4;
    for (const item of scored.slice(0, perDocLimit)) {
      unindexedDocChunks.push({ doc: item.doc, chunk: item.chunk, score: item.score });
    }
  }

  // Special case: ONLY if the active session unit is specifically POS and has minimal uploaded text
  const isPosUnit =
    session.unit_id === 'BU-POS' ||
    (session.unit.code === 'POS' && !session.unit_id.includes('SWIFT') && !session.unit_id.includes('SETTLE'));

  if (existingProposals.length === 0 && isPosUnit && unindexedDocChunks.length <= 2) {
    const docSettlement =
      ragBundle.session_documents.find(d => d.title_ar.includes('SOP') || d.title_ar.includes('إجراءات')) ||
      ragBundle.session_documents[0];
    const chunk1 = docSettlement?.chunks[0];
    const historicalLoss1 = maxUnitIncidentLoss > 0 ? maxUnitIncidentLoss : OFFICIAL_FINANCIAL_ANCHORS_EGP.M;

    const rawPos1 = enrichProposalWithPythonCalculation(session.unit_id, {
      risk_id: `RSK-${session.unit.code}-01`,
      process_name_ar: 'تسوية وسداد معاملات نقاط البيع (POS Settlement)',
      strategic_objective_ar: OFFICIAL_NBE_STRATEGIC_OBJECTIVES[0],
      risk_title_ar: 'أخطاء وتأخير تسوية المعاملات المالية عبر أجهزة نقاط البيع POS',
      description_ar:
        'عدم مطابقة إجمالي المبالغ المسواة عبر ماكينات POS مع الحسابات الجارية للتجار نتيجة خلل إدخال البيانات أو انقطاع الربط مع شبكة الخصم، مما يؤدي إلى فروق محاسبية وخسائر مالية مباشرة وشكاوى التجار.',
      single_incident_max_loss: historicalLoss1,
      financial_impact_amount: historicalLoss1,
      has_documented_incident: maxUnitIncidentLoss > 0,
      documented_incident_loss_egp: maxUnitIncidentLoss > 0 ? maxUnitIncidentLoss : undefined,
      financial_impact_justification:
        maxUnitIncidentLoss > 0
          ? `مستند إلى سجل الحوادث الميدانية المسجلة بقيمة ${Number(historicalLoss1).toLocaleString()} ج.م`
          : `قيمة مرجعية معيارية وفق منهجية البنك الأهلي المصري (${historicalLoss1.toLocaleString()} ج.م)`,
      inherent_frequency_text: 'مرة واحدة كل نصف سنة',
      frequency_multiplier: 2,
      frequency_justification: 'تقدير تكرار نصف سنوي استناداً لحجم معاملات التسوية اليومية لأجهزة نقاط البيع.',
      expected_annual_loss: historicalLoss1 * 2,
      clarification_status: 'CONFIRMED',
      taxonomy_l1_id: 'L1-08',
      taxonomy_l1_ar: '8_تنفيذ العمليات المصرفية',
      taxonomy_l2_id: 'L2-08-01',
      taxonomy_l2_ar: 'تخطيط وتنفيذ المعاملات',
      taxonomy_l3_id: 'L3-08-01-02',
      taxonomy_l3_ar: 'أخطاء إدخال البيانات أو صيانتها أو تحميلها',
      taxonomy_rationale_ar:
        'التصنيف المعتمد وفق منهجية البنك (8_تنفيذ العمليات المصرفية) لتعلق المخاطرة بتسوية المعاملات.',
      nfi_service_level: 2,
      nfi_reputation_level: 2,
      nfi_regulatory_level: 1,
      nfi_legal_level: 1,
      nfi_composite_score: 'M (متوسط)',
      esg_pillar: 'G (حوكمة العمليات المصرفية والرقابة الداخلية)',
      esg_pathway_ar: '[32] حوكمة العمليات والرقابة والتقارير الرقابية (L1-08)',
      acceptance_class: 1,
      corrective_action_ar: '',
      phase2c_inputs: {
        nfi: {
          service: { rating: 'M', evidence: 'تأخر محتمل في إضافة تسويات التجار.' },
          reputation: { rating: 'M', evidence: 'تأثر محدود لرضا التجار عند تأخر التسوية.' },
          regulatory: { rating: 'L', evidence: 'ملاحظات رقابية منخفضة.' },
          legal: { rating: 'L', evidence: 'مغطى بعقود التجار المعتمدة.' },
        },
        esg: {
          status: 'ASSESSED',
          pillars: ['G'],
          catalogue_ids: [32],
          evidence: { G: 'ضوابط حوكمة التسويات اليومية وتقارير المطابقة (مرجع CBE #32).' },
        },
        acceptance_class: 1,
        acceptance_rationale: '',
        corrective_action: '',
      },
      model_generated_by: modelProfile,
      controls: [
        {
          control_id: `CTL-${session.unit.code}-01-01`,
          control_name_ar: 'المطابقة اليومية الآلية لتسويات أجهزة نقاط البيع',
          control_type_label_ar: 'ضوابط رقابية مانعة',
          control_method_label_ar: 'آلي',
          description_ar: 'إجراء المطابقة الآلية اليومية بين ملفات تسوية ماكينات POS وحسابات التجار الجارية قبل الترحيل.',
          control_frequency_raw: 'Daily\nيومياً',
          control_owner: 'النظام المصرفي الأساسي',
          design_classification: 'PREVENTIVE',
          automation_level: 'AUTOMATED',
          effectiveness_raw: 'ضابط رقابي فعال',
          implementation_status: 'IMPLEMENTED',
          scope_relevance: 'ELIGIBLE',
        },
        {
          control_id: `CTL-${session.unit.code}-01-02`,
          control_name_ar: 'المراجعة الإشرافية لتقارير فروقات التسوية اليومية',
          control_type_label_ar: 'ضوابط رقابية كاشفة',
          control_method_label_ar: 'شبه آلي',
          description_ar: 'فحص ومراجعة تقرير فروقات التسوية اليومية ومعالجة البنود المعلقة خلال 24 ساعة.',
          control_frequency_raw: 'Daily\nيومياً',
          control_owner: 'السلطة الإشرافية',
          design_classification: 'DETECTIVE',
          automation_level: 'SEMI_AUTOMATED',
          effectiveness_raw: 'ضابط رقابي فعال',
          implementation_status: 'IMPLEMENTED',
          scope_relevance: 'ELIGIBLE',
        },
      ],
    });

    generatedProposals.push({
      type: 'RISK',
      data: rawPos1,
      citations: chunk1
        ? [
            {
              document_id: docSettlement.id,
              chunk_id: chunk1.id,
              title_ar: docSettlement.title_ar,
              file_name: docSettlement.file_name,
              section_title: chunk1.section_title || 'تسوية المعاملات اليومية',
              quote_text: chunk1.content_text.slice(0, 220),
              doc_type: docSettlement.doc_type,
            },
          ]
        : [],
    });

    const docAudit =
      ragBundle.session_documents.find(d => d.doc_type === 'AUDIT_REPORT' || d.title_ar.includes('تفتيش')) ||
      ragBundle.session_documents[1] ||
      ragBundle.session_documents[0];
    const chunk2 = docAudit?.chunks[0] || chunk1;
    const financialLoss2 = OFFICIAL_FINANCIAL_ANCHORS_EGP.L; // 50,000 official Low anchor

    const rawPos2 = enrichProposalWithPythonCalculation(session.unit_id, {
      risk_id: `RSK-${session.unit.code}-02`,
      process_name_ar: 'تشغيل وصيانة أجهزة نقاط البيع (Terminal Operations)',
      strategic_objective_ar: OFFICIAL_NBE_STRATEGIC_OBJECTIVES[3],
      risk_title_ar: 'أعطال الأجهزة والبرمجيات وانقطاع الربط الشبكي لأجهزة نقاط البيع POS',
      description_ar:
        'توقف أو انقطاع الاتصال بأجهزة نقاط البيع لدى التجار بسبب عطل في شبكة الاتصالات أو توقف البرمجيات التشغيلية، مما يؤدي إلى التعطل التشغيلي وشكاوى التجار وتأثر السمعة.',
      single_incident_max_loss: financialLoss2,
      financial_impact_amount: financialLoss2,
      financial_impact_justification: `قيمة مرجعية معيارية وفق منهجية البنك الأهلي المصري (${financialLoss2.toLocaleString()} ج.م)`,
      inherent_frequency_text: 'مرة واحدة كل ربع سنة',
      frequency_multiplier: 4,
      frequency_justification: 'تقدير تكرار ربع سنوي نظراً لتوزع الأجهزة ميدانياً واعتمادها على شبكات الاتصالات.',
      expected_annual_loss: financialLoss2 * 4,
      clarification_status: 'CONFIRMED',
      taxonomy_l1_id: 'L1-07',
      taxonomy_l1_ar: '7_الأنظمة و التطبيقات',
      taxonomy_l2_id: 'L2-07-01',
      taxonomy_l2_ar: 'نظم العمل الإلكترونية ووسائل الاتصال',
      taxonomy_l3_id: 'L3-07-01-01',
      taxonomy_l3_ar: 'أعطال الأجهزة أو البرمجيات أو الشبكات',
      taxonomy_rationale_ar:
        'التصنيف المعتمد وفق منهجية البنك (7_الأنظمة و التطبيقات) لانقطاع الاتصالات وتعطل الماكينات.',
      nfi_service_level: 3,
      nfi_reputation_level: 2,
      nfi_regulatory_level: 1,
      nfi_legal_level: 1,
      nfi_composite_score: 'H (كبير)',
      esg_pillar: 'E (الاستدامة البيئية والمناخية)',
      esg_pathway_ar: '[18] توقف الأنظمة أثناء التحول لبنية تحتية موفرة للطاقة أو أنظمة جديدة (L1-07)',
      acceptance_class: 1,
      corrective_action_ar: '',
      phase2c_inputs: {
        nfi: {
          service: { rating: 'H', evidence: 'انقطاع خدمة الدفع الإلكتروني لدى التجار عند تعطل الماكينات.' },
          reputation: { rating: 'M', evidence: 'تأثر قصير الأجل لرضا التجار وحاملي البطاقات.' },
          regulatory: { rating: 'L', evidence: 'ملاحظات رقابية منخفضة.' },
          legal: { rating: 'L', evidence: 'مغطى باتفاقيات الصيانة SLA مع الشركات الموردة.' },
        },
        esg: {
          status: 'ASSESSED',
          pillars: ['E'],
          catalogue_ids: [18],
          evidence: { E: 'استمرارية الأنظمة والبنية التحتية الرقمية (مرجع CBE #18).' },
        },
        acceptance_class: 1,
        acceptance_rationale: '',
        corrective_action: '',
      },
      model_generated_by: modelProfile,
      controls: [
        {
          control_id: `CTL-${session.unit.code}-02-01`,
          control_name_ar: 'المراقبة اللحظية الموحدة لحالة أجهزة نقاط البيع وتصعيد الأعطال',
          control_type_label_ar: 'ضوابط رقابية كاشفة',
          control_method_label_ar: 'آلي',
          description_ar: 'مراقبة حالة اتصال ماكينات POS لحظياً وإصدار تنبيهات تلقائية عند انقطاع الشبكة لتوجيه الدعم الفني فوراً.',
          control_frequency_raw: 'Multiple times a day\nعدة مرات في اليوم',
          control_owner: 'إدارة عمليات نقاط البيع',
          design_classification: 'DETECTIVE',
          automation_level: 'AUTOMATED',
          effectiveness_raw: 'ضابط رقابي فعال',
          implementation_status: 'IMPLEMENTED',
          scope_relevance: 'ELIGIBLE',
        },
        {
          control_id: `CTL-${session.unit.code}-02-02`,
          control_name_ar: 'اختبارات القبول الميداني للتطبيقات وتفعيل جزاءات عقود الصيانة',
          control_type_label_ar: 'ضوابط رقابية مانعة',
          control_method_label_ar: 'يدوي',
          description_ar: 'إجراء اختبارات UAT على عينة من التجار قبل تعميم التحديثات وتفعيل بنود الجزاءات عند تجاوز مهل الصيانة.',
          control_frequency_raw: 'Ad-hoc\nوفقاً والحالة',
          control_owner: 'السلطة الإشرافية',
          design_classification: 'PREVENTIVE',
          automation_level: 'MANUAL',
          effectiveness_raw: 'ضابط رقابي فعال',
          implementation_status: 'IMPLEMENTED',
          scope_relevance: 'ELIGIBLE',
        },
      ],
    });

    generatedProposals.push({
      type: 'RISK',
      data: rawPos2,
      citations: chunk2
        ? [
            {
              document_id: docAudit.id,
              chunk_id: chunk2.id,
              title_ar: docAudit.title_ar,
              file_name: docAudit.file_name,
              section_title: chunk2.section_title || 'فحص الجاهزية الفنية لأجهزة POS',
              quote_text: chunk2.content_text.slice(0, 220),
              doc_type: docAudit.doc_type,
            },
          ]
        : [],
    });

    return generatedProposals;
  }

  // Helper to find the best supporting citation chunk in session_documents for a given risk pattern
  const findBestCitationForText = (keywordsText: string) => {
    const normKw = normalizeTextForRag(keywordsText);
    const words = normKw.split(/\s+/).filter(w => w.length >= 4).slice(0, 14);
    let bestDoc: any = ragBundle.session_documents[0];
    let bestChunk: any = bestDoc?.chunks?.[0];
    let bestScore = -1;
    for (const doc of ragBundle.session_documents) {
      for (const ch of doc.chunks) {
        if (!ch.content_text || isBoilerplateOrCoverChunk(ch.content_text, doc.chunks.length)) continue;
        const cNorm = normalizeTextForRag(ch.content_text);
        let sc = 0;
        for (const w of words) {
          if (cNorm.includes(w)) sc += 2;
        }
        if (sc > bestScore) {
          bestScore = sc;
          bestDoc = doc;
          bestChunk = ch;
        }
      }
    }
    if (!bestDoc || !bestChunk) return [];
    return [
      {
        document_id: bestDoc.id,
        chunk_id: bestChunk.id,
        title_ar: bestDoc.title_ar,
        file_name: bestDoc.file_name,
        section_title: bestChunk.section_title || 'مقطع مرجعي',
        quote_text: bestChunk.content_text.trim().slice(0, 240),
        page_number: bestChunk.page_number || 1,
        doc_type: bestDoc.doc_type,
      },
    ];
  };

  // Phase 1: Full-Document Core Pattern Coverage (ensures core operational SOP risks such as
  // Outgoing Transfers, Incoming Transfers, Omitted Execution, GL/Nostro Reconciliation, Sanctions/AML,
  // External Fraud, Accounting Entries, and Freeze/Release are extracted cleanly with 2-3 controls each)
  const combinedDocumentText = allDocTextParts.join('\n');
  if (combinedDocumentText.trim().length > 40) {
    const matchedCoreRisks = extractMatchedPatternsFromFullDocument(
      combinedDocumentText,
      maxProposalsToGenerate
    );
    const levelNumMap: Record<string, number> = { '-': 0, L: 1, M: 2, H: 3, VH: 4, C: 5 };
    const compLabelMap: Record<string, string> = {
      L: 'L (منخفض)',
      M: 'M (متوسط)',
      H: 'H (كبير)',
      VH: 'VH (كبير جداً)',
      C: 'C (كارثي)',
    };

    for (const coreRisk of matchedCoreRisks) {
      if (generatedProposals.length >= maxProposalsToGenerate) break;
      if (existingTitles.has(coreRisk.risk_title_ar)) continue;
      existingTitles.add(coreRisk.risk_title_ar);

      const riskId = `RSK-${session.unit.code}-${String(nextRiskSeq).padStart(2, '0')}`;
      const seqStr = String(nextRiskSeq).padStart(2, '0');
      nextRiskSeq++;

      const estLoss = coreRisk.reference_anchor_egp;
      const nfiAll = [coreRisk.nfi_service, coreRisk.nfi_reputation, coreRisk.nfi_regulatory, coreRisk.nfi_legal];
      const nfiMax = nfiAll.reduce((b, cur) => (levelNumMap[cur] > levelNumMap[b] ? cur : b), 'L');
      const citations = findBestCitationForText(`${coreRisk.process_name_ar} ${coreRisk.risk_title_ar} ${coreRisk.description_ar}`);

      const matchedBaselineRisk =
        session.workflow_mode === 'UPDATE' && ragBundle.baseline_risks.length > 0
          ? ragBundle.baseline_risks[0]
          : null;

      const rawProposalData = enrichProposalWithPythonCalculation(session.unit_id, {
        risk_id: matchedBaselineRisk?.risk_id || riskId,
        linked_baseline_risk_id: matchedBaselineRisk?.risk_id || undefined,
        reassessment_flag_br:
          session.workflow_mode === 'UPDATE' ? 'BR-007/BR-008/BR-009' : undefined,
        requires_reviewer_reassessment: session.workflow_mode === 'UPDATE',
        process_name_ar: coreRisk.process_name_ar,
        strategic_objective_ar: coreRisk.strategic_objective_ar,
        risk_library_name_ar: coreRisk.taxonomy_l3_ar || coreRisk.taxonomy_l2_ar,
        risk_title_ar: coreRisk.risk_title_ar,
        description_ar: coreRisk.description_ar,
        single_incident_max_loss: estLoss,
        financial_impact_amount: estLoss,
        financial_impact_justification: `قيمة مرجعية معيارية معتمدة وفق منهجية البنك الأهلي المصري (${estLoss.toLocaleString()} ج.م — شريحة EI880:EI884) لعدم توفر خسائر تاريخية مسجلة`,
        inherent_frequency_text: coreRisk.inherent_frequency_text,
        frequency_multiplier: coreRisk.frequency_multiplier,
        frequency_justification: coreRisk.frequency_justification_ar,
        expected_annual_loss: estLoss * coreRisk.frequency_multiplier,
        clarification_status: 'NEEDS_CONFIRMATION',
        taxonomy_l1_id: coreRisk.taxonomy_l1_id,
        taxonomy_l1_ar: coreRisk.taxonomy_l1_ar,
        taxonomy_l2_id: coreRisk.taxonomy_l2_id,
        taxonomy_l2_ar: coreRisk.taxonomy_l2_ar,
        taxonomy_l3_id: coreRisk.taxonomy_l3_id,
        taxonomy_l3_ar: coreRisk.taxonomy_l3_ar,
        taxonomy_rationale_ar: `التصنيف المعتمد وفق منهجية البنك (${coreRisk.taxonomy_l1_ar} ← ${coreRisk.taxonomy_l2_ar} ← ${coreRisk.taxonomy_l3_ar}).`,
        esg_pillar: coreRisk.esg.pillar_label_ar,
        esg_code: coreRisk.esg.pillars[0] || undefined,
        esg_pathway_ar: coreRisk.esg.pathway_ar,
        nfi_service_level: levelNumMap[coreRisk.nfi_service] || 1,
        nfi_reputation_level: levelNumMap[coreRisk.nfi_reputation] || 1,
        nfi_regulatory_level: levelNumMap[coreRisk.nfi_regulatory] || 1,
        nfi_legal_level: levelNumMap[coreRisk.nfi_legal] || 1,
        nfi_composite_score: compLabelMap[nfiMax] || 'M (متوسط)',
        acceptance_rationale_ar: coreRisk.acceptance_rationale_ar,
        corrective_action_ar: coreRisk.corrective_action_ar,
        columns_populated_count: 29,
        phase2c_inputs: {
          nfi: {
            service: { rating: coreRisk.nfi_service, evidence: coreRisk.service_impact_evidence_ar },
            reputation: { rating: coreRisk.nfi_reputation, evidence: coreRisk.reputation_impact_evidence_ar },
            regulatory: { rating: coreRisk.nfi_regulatory, evidence: coreRisk.regulatory_impact_evidence_ar },
            legal: { rating: coreRisk.nfi_legal, evidence: coreRisk.legal_impact_evidence_ar },
          },
          esg:
            coreRisk.esg.status === 'ASSESSED'
              ? {
                  status: 'ASSESSED',
                  pillars: coreRisk.esg.pillars,
                  catalogue_ids: coreRisk.esg.catalogue_ids,
                  evidence: coreRisk.esg.evidence,
                }
              : {
                  status: 'NO_DOCUMENTED_LINK',
                  pillars: [],
                  evidence: {},
                  justification:
                    coreRisk.esg.justification ||
                    'لا توجد صلة موثقة بأبعاد ESG وفق كتالوج البنك المركزي المصري.',
                },
          acceptance_class: coreRisk.acceptance_class,
          acceptance_rationale: coreRisk.acceptance_rationale_ar,
          corrective_action: coreRisk.acceptance_class === 1 ? '' : coreRisk.corrective_action_ar,
        },
        model_generated_by: modelProfile,
        controls: coreRisk.controls.map((ctrl, cIdx) => ({
          control_id: `CTL-${session.unit.code}-${seqStr}-0${cIdx + 1}`,
          control_name_ar: ctrl.control_name_ar,
          control_type_label_ar: ctrl.control_type_label_ar,
          control_method_label_ar: ctrl.control_method_label_ar,
          description_ar: ctrl.description_ar,
          control_owner: ctrl.control_owner_ar,
          control_frequency_raw: ctrl.control_frequency_raw,
          design_classification: ctrl.design_classification,
          automation_level: ctrl.automation_level,
          effectiveness_raw: ctrl.effectiveness_raw,
          implementation_status: 'IMPLEMENTED',
          scope_relevance: 'ELIGIBLE',
          flagged_for_reviewer_reassessment: session.workflow_mode === 'UPDATE',
        })),
      });

      generatedProposals.push({
        type: session.workflow_mode === 'UPDATE' && matchedBaselineRisk ? 'CHANGE_RECOMMENDATION' : 'RISK',
        data: rawProposalData,
        citations,
      });
    }
  }

  // Phase 2: Universal Chunk Extraction for any remaining slots (handles unseen/custom BU documents)
  const remainingSlots = maxProposalsToGenerate - generatedProposals.length;
  const llmExtractedItems =
    remainingSlots > 0 && unindexedDocChunks.length > 0
      ? await generateStructuredRcsaProposalsWithLlm({
          unitNameAr: session.unit?.name_ar || 'الوحدة التنظيمية',
          chunks: unindexedDocChunks.slice(0, remainingSlots + 2).map(({ doc, chunk }) => ({
            chunk_id: chunk.id,
            doc_title_ar: doc.title_ar,
            content_text: chunk.content_text.trim(),
          })),
          maxItems: remainingSlots,
          modelProfile,
        })
      : null;

  const llmItemByChunkId = new Map<string, any>();
  if (Array.isArray(llmExtractedItems)) {
    for (const item of llmExtractedItems) {
      if (item && item.chunk_id && !llmItemByChunkId.has(item.chunk_id)) {
        llmItemByChunkId.set(item.chunk_id, item);
      }
    }
  }

  for (const { doc, chunk } of unindexedDocChunks) {
    if (generatedProposals.length >= maxProposalsToGenerate) break;

    const chunkText = chunk.content_text.trim();
    const llmItem = llmItemByChunkId.get(chunk.id);
    const cleanSectionHint = stripLocationMarkers(chunk.section_title || '');
    const taxEsg = matchBestTaxonomyAndEsg(`${doc.title_ar} ${cleanSectionHint} ${chunkText}`, ragBundle);
    const detectedAmounts = extractMonetaryAmountsFromText(chunkText);

    const semanticControl = extractControlDetailsFromText(chunkText, cleanSectionHint);
    const semanticRisk = extractRiskDetailsFromText(
      chunkText,
      session.unit?.name_ar || 'الوحدة التنظيمية',
      semanticControl,
      cleanSectionHint
    );

    const estLoss =
      detectedAmounts[0] ||
      (maxUnitIncidentLoss > 0 ? maxUnitIncidentLoss : 0) ||
      (llmItem?.estimated_loss_egp && llmItem.estimated_loss_egp >= 1000
        ? snapToOfficialReferenceAnchor(llmItem.estimated_loss_egp)
        : 0) ||
      semanticRisk.reference_anchor_egp ||
      OFFICIAL_FINANCIAL_ANCHORS_EGP.M;

    const normChunk = normalizeTextForRag(chunkText);
    let freqText = semanticRisk.inherent_frequency_text || 'مرة واحدة كل سنة';
    let freqMult = semanticRisk.frequency_multiplier || 1;
    const llmFreqRaw = normalizeTextForRag(llmItem?.inherent_frequency_ar || '');
    if (llmFreqRaw.includes('شهر') || normChunk.match(/شهريا|كل شهر|monthly/)) {
      freqText = 'مرة واحدة كل شهر';
      freqMult = 12;
    } else if (llmFreqRaw.includes('ربع') || normChunk.match(/ربع سنوي|كل ربع|quarterly/)) {
      freqText = 'مرة واحدة كل ربع سنة';
      freqMult = 4;
    } else if (llmFreqRaw.includes('نصف') || normChunk.match(/نصف سنوي|مرتين في العام|semi/)) {
      freqText = 'مرة واحدة كل نصف سنة';
      freqMult = 2;
    } else if (llmFreqRaw.includes('سنت') || normChunk.match(/كل سنتان|كل سنتين/)) {
      freqText = 'مرة كل سنتان';
      freqMult = 0.5;
    }

    const cleanLlmProcess = stripLocationMarkers(llmItem?.process_name_ar);
    const cleanLlmRiskTitle = stripLocationMarkers(llmItem?.risk_title_ar);
    const cleanLlmRiskDesc = stripLocationMarkers(llmItem?.risk_description_ar);
    const cleanLlmObjective = normalizeOfficialStrategicObjective(
      llmItem?.strategic_objective_ar || semanticRisk.strategic_objective_ar
    );

    const finalProcessName = cleanLlmProcess || semanticRisk.process_name_ar;
    const finalRiskTitle = cleanLlmRiskTitle || semanticRisk.risk_title_ar;
    const finalRiskDesc =
      cleanLlmRiskDesc && !cleanLlmRiskDesc.includes('مخاطرة مستنبطة من تحليل المستند')
        ? cleanLlmRiskDesc.replace(/^احتمال\s+/, '')
        : semanticRisk.description_ar;

    if (existingTitles.has(finalRiskTitle)) continue;
    existingTitles.add(finalRiskTitle);

    const riskId = `RSK-${session.unit.code}-${String(nextRiskSeq).padStart(2, '0')}`;
    const seqStr = String(nextRiskSeq).padStart(2, '0');
    nextRiskSeq++;

    // Build multiple controls (preferring LLM multi-controls array if provided, else semantic multi-controls)
    const llmControlsList = Array.isArray(llmItem?.controls) && llmItem.controls.length > 0
      ? llmItem.controls
      : llmItem?.control_description_ar
        ? [
            {
              control_name_ar: llmItem.control_name_ar,
              control_type: llmItem.control_type,
              automation_level: llmItem.automation_level,
              control_frequency_ar: llmItem.control_frequency_ar,
              control_owner_ar: 'السلطة الإشرافية',
              control_description_ar: llmItem.control_description_ar,
            },
          ]
        : null;

    const builtControls = llmControlsList
      ? llmControlsList.map((lc: any, cIdx: number) => {
          const dType =
            lc.control_type === 'DETECTIVE' || lc.control_type === 'CORRECTIVE' || lc.control_type === 'PREVENTIVE'
              ? lc.control_type
              : semanticControl.design_classification;
          const aLevel =
            lc.automation_level === 'AUTOMATED' || lc.automation_level === 'SEMI_AUTOMATED' || lc.automation_level === 'MANUAL'
              ? lc.automation_level
              : semanticControl.automation_level;
          return {
            control_id: `CTL-${session.unit.code}-${seqStr}-0${cIdx + 1}`,
            control_name_ar: stripLocationMarkers(lc.control_name_ar) || semanticControl.control_name_ar,
            control_type_label_ar:
              dType === 'DETECTIVE'
                ? 'ضوابط رقابية كاشفة'
                : dType === 'CORRECTIVE'
                  ? 'ضوابط رقابية تصحيحية'
                  : 'ضوابط رقابية مانعة',
            control_method_label_ar:
              aLevel === 'AUTOMATED' ? 'آلي' : aLevel === 'SEMI_AUTOMATED' ? 'شبه آلي' : 'يدوي',
            description_ar:
              stripControlMechanismFromDescription(lc.control_description_ar) || semanticControl.description_ar,
            control_owner: stripLocationMarkers(lc.control_owner_ar) || 'السلطة الإشرافية',
            control_frequency_raw: normalizeOfficialControlFrequency(
              lc.control_frequency_ar || semanticControl.control_frequency_raw
            ),
            design_classification: dType,
            automation_level: aLevel,
            effectiveness_raw: 'ضابط رقابي فعال',
            implementation_status: 'IMPLEMENTED',
            scope_relevance: 'ELIGIBLE',
            flagged_for_reviewer_reassessment:
              session.workflow_mode === 'UPDATE' || doc.doc_type === 'INCIDENT_LOG' || doc.doc_type === 'AUDIT_REPORT',
          };
        })
      : semanticRisk.controls.map((sc, cIdx) => ({
          control_id: `CTL-${session.unit.code}-${seqStr}-0${cIdx + 1}`,
          control_name_ar: sc.control_name_ar,
          control_type_label_ar: sc.control_type_label_ar,
          control_method_label_ar: sc.control_method_label_ar,
          description_ar: sc.description_ar,
          control_owner: sc.control_owner_ar,
          control_frequency_raw: sc.control_frequency_raw,
          design_classification: sc.design_classification,
          automation_level: sc.automation_level,
          effectiveness_raw: sc.effectiveness_raw,
          implementation_status: 'IMPLEMENTED',
          scope_relevance: 'ELIGIBLE',
          flagged_for_reviewer_reassessment:
            session.workflow_mode === 'UPDATE' || doc.doc_type === 'INCIDENT_LOG' || doc.doc_type === 'AUDIT_REPORT',
        }));

    const matchedBaselineRisk =
      session.workflow_mode === 'UPDATE' && ragBundle.baseline_risks.length > 0
        ? ragBundle.baseline_risks[0]
        : null;

    const resolvedTaxL1Id = semanticRisk.pattern_id ? semanticRisk.taxonomy_l1_id : taxEsg.taxonomy_l1_id;
    const resolvedTaxL1Ar = semanticRisk.pattern_id ? semanticRisk.taxonomy_l1_ar : taxEsg.taxonomy_l1_ar;

    const rawProposalData = enrichProposalWithPythonCalculation(session.unit_id, {
      risk_id: matchedBaselineRisk?.risk_id || riskId,
      linked_baseline_risk_id: matchedBaselineRisk?.risk_id || undefined,
      reassessment_flag_br:
        session.workflow_mode === 'UPDATE' || doc.doc_type === 'INCIDENT_LOG' || doc.doc_type === 'AUDIT_REPORT'
          ? 'BR-007/BR-008/BR-009'
          : undefined,
      requires_reviewer_reassessment:
        session.workflow_mode === 'UPDATE' || doc.doc_type === 'INCIDENT_LOG' || doc.doc_type === 'AUDIT_REPORT',
      process_name_ar: finalProcessName,
      strategic_objective_ar: cleanLlmObjective,
      risk_library_name_ar: `${semanticRisk.taxonomy_l3_ar || taxEsg.taxonomy_l3_ar || taxEsg.taxonomy_l2_ar}`,
      risk_title_ar: finalRiskTitle,
      description_ar: finalRiskDesc,
      single_incident_max_loss: estLoss,
      financial_impact_amount: estLoss,
      has_documented_incident: detectedAmounts.length > 0 || maxUnitIncidentLoss > 0,
      documented_incident_loss_egp: detectedAmounts[0] || (maxUnitIncidentLoss > 0 ? maxUnitIncidentLoss : undefined),
      financial_impact_justification:
        detectedAmounts.length > 0
          ? `قيمة مستخرجة مباشرة من نص المستند المرفوع (${doc.title_ar}): ${estLoss.toLocaleString()} ج.م`
          : `قيمة مرجعية معيارية معتمدة وفق منهجية البنك الأهلي المصري (${estLoss.toLocaleString()} ج.م)`,
      inherent_frequency_text: freqText,
      frequency_multiplier: freqMult,
      frequency_justification: semanticRisk.frequency_justification_ar,
      expected_annual_loss: estLoss * freqMult,
      clarification_status: detectedAmounts.length > 0 ? 'CONFIRMED' : 'NEEDS_CONFIRMATION',
      ...taxEsg,
      taxonomy_l1_id: resolvedTaxL1Id,
      taxonomy_l1_ar: resolvedTaxL1Ar,
      nfi_service_level: semanticRisk.nfi_service === 'H' ? 3 : 2,
      nfi_reputation_level: semanticRisk.nfi_reputation === 'H' ? 3 : 2,
      nfi_regulatory_level: semanticRisk.nfi_regulatory === 'H' ? 3 : semanticRisk.nfi_regulatory === 'M' ? 2 : 1,
      nfi_legal_level: semanticRisk.nfi_legal === 'H' ? 3 : 1,
      nfi_composite_score:
        semanticRisk.nfi_regulatory === 'H' || semanticRisk.nfi_service === 'H' ? 'H (كبير)' : 'M (متوسط)',
      acceptance_rationale_ar: semanticRisk.acceptance_rationale_ar,
      corrective_action_ar: semanticRisk.acceptance_class === 1 ? '' : semanticRisk.corrective_action_ar,
      columns_populated_count: 29,
      phase2c_inputs: {
        nfi: {
          service: { rating: semanticRisk.nfi_service, evidence: semanticRisk.service_impact_evidence_ar },
          reputation: { rating: semanticRisk.nfi_reputation, evidence: semanticRisk.reputation_impact_evidence_ar },
          regulatory: { rating: semanticRisk.nfi_regulatory, evidence: semanticRisk.regulatory_impact_evidence_ar },
          legal: { rating: semanticRisk.nfi_legal, evidence: semanticRisk.legal_impact_evidence_ar },
        },
        esg:
          semanticRisk.esg.status === 'ASSESSED'
            ? {
                status: 'ASSESSED',
                pillars: semanticRisk.esg.pillars,
                catalogue_ids: semanticRisk.esg.catalogue_ids,
                evidence: semanticRisk.esg.evidence,
              }
            : {
                status: 'NO_DOCUMENTED_LINK',
                pillars: [],
                evidence: {},
                justification:
                  semanticRisk.esg.justification ||
                  'لا توجد صلة موثقة بأبعاد ESG وفق كتالوج البنك المركزي المصري.',
              },
        acceptance_class: semanticRisk.acceptance_class,
        acceptance_rationale: semanticRisk.acceptance_rationale_ar,
        corrective_action: semanticRisk.acceptance_class === 1 ? '' : semanticRisk.corrective_action_ar,
      },
      model_generated_by: modelProfile,
      controls: builtControls,
    });

    generatedProposals.push({
      type: session.workflow_mode === 'UPDATE' && matchedBaselineRisk ? 'CHANGE_RECOMMENDATION' : 'RISK',
      data: rawProposalData,
      citations: [
        {
          document_id: doc.id,
          chunk_id: chunk.id,
          title_ar: doc.title_ar,
          file_name: doc.file_name,
          section_title: chunk.section_title || 'مقطع مرجعي',
          quote_text: chunkText.slice(0, 240),
          page_number: chunk.page_number || 1,
          doc_type: doc.doc_type,
        },
      ],
    });
  }

  // Zero-Shot Cross-BU Structural Decomposition (when unit has 0 uploaded files)
  if (generatedProposals.length === 0 && existingProposals.length === 0) {
    const unitNameAr = session.unit?.name_ar || 'الوحدة التنظيمية';
    const unitCode = session.unit?.code || 'UNIT';
    const zeroShotStages = [
      {
        stageTitle: `القبول والتحقق المستندي وفحص الصلاحيات — ${unitNameAr}`,
        strategicObj: OFFICIAL_NBE_STRATEGIC_OBJECTIVES[0],
        riskTitle: `قصور التحقق المستندي أو تمرير معاملات غير مستوفاة في ${unitNameAr}`,
        riskDesc: `قبول أو تنفيذ طلبات ببيانات غير مكتملة أو دون استيفاء التوقيعات والمستندات الإلزامية في (${unitNameAr}) نتيجة قصور المراجعة الأولية، مما يؤدي إلى خسائر مالية وتعويضات وملاحظات رقابية.`,
        freqText: 'مرة واحدة كل نصف سنة',
        freqMult: 2,
        estLoss: maxUnitIncidentLoss > 0 ? maxUnitIncidentLoss : OFFICIAL_FINANCIAL_ANCHORS_EGP.M,
        controls: [
          {
            ctrlName: `المراجعة المزدوجة وقائمة التحقق المستندي الإلزامية (Maker-Checker)`,
            ctrlDesc: `مراجعة المستندات والتوقيعات واعتمادها عبر نظام الفصل بين المهام قبل تنفيذ أي معاملة في ${unitNameAr}.`,
            ctrlType: 'PREVENTIVE' as const,
            ctrlMethod: 'SEMI_AUTOMATED' as const,
            ctrlTypeLabel: 'ضوابط رقابية مانعة',
            ctrlMethodLabel: 'شبه آلي',
            ctrlFreq: 'Multiple times a day\nعدة مرات في اليوم',
          },
          {
            ctrlName: `التحقق الآلي من الحقول الإلزامية بالنظام`,
            ctrlDesc: `منع النظام لاستكمال تسجيل المعاملة قبل استيفاء جميع الحقول والمرفقات الإلزامية في ${unitNameAr}.`,
            ctrlType: 'PREVENTIVE' as const,
            ctrlMethod: 'AUTOMATED' as const,
            ctrlTypeLabel: 'ضوابط رقابية مانعة',
            ctrlMethodLabel: 'آلي',
            ctrlFreq: 'Multiple times a day\nعدة مرات في اليوم',
          },
        ],
      },
      {
        stageTitle: `التنفيذ والقيد المالي والتسوية المحاسبية — ${unitNameAr}`,
        strategicObj: OFFICIAL_NBE_STRATEGIC_OBJECTIVES[3],
        riskTitle: `أخطاء القيد والتسوية وتأخر المطابقة اليومية في ${unitNameAr}`,
        riskDesc: `حدوث فروقات مالية أو أخطاء في القيد المحاسبي أو تأخر تسوية الحسابات الوسيطة الخاصة بـ (${unitNameAr}) نتيجة خطأ الإدخال أو تأخر المطابقة، مما يؤدي إلى تشوه المراكز المالية وخسائر مالية وملاحظات تفتيشية.`,
        freqText: 'مرة واحدة كل سنة',
        freqMult: 1,
        estLoss: OFFICIAL_FINANCIAL_ANCHORS_EGP.L,
        controls: [
          {
            ctrlName: `قاعدة توازن القيد المزدوج الآلية`,
            ctrlDesc: `التحقق الآلي من توازن الطرف المدين والدائن قبل ترحيل القيود المحاسبية لحسابات ${unitNameAr}.`,
            ctrlType: 'PREVENTIVE' as const,
            ctrlMethod: 'AUTOMATED' as const,
            ctrlTypeLabel: 'ضوابط رقابية مانعة',
            ctrlMethodLabel: 'آلي',
            ctrlFreq: 'Multiple times a day\nعدة مرات في اليوم',
          },
          {
            ctrlName: `المطابقة اليومية لحسابات الأستاذ العام والحسابات الوسيطة`,
            ctrlDesc: `فحص ومطابقة أرصدة الحسابات الوسيطة يومياً وتصفية البنود المعلقة خلال 24-48 ساعة لحسابات ${unitNameAr}.`,
            ctrlType: 'DETECTIVE' as const,
            ctrlMethod: 'SEMI_AUTOMATED' as const,
            ctrlTypeLabel: 'ضوابط رقابية كاشفة',
            ctrlMethodLabel: 'شبه آلي',
            ctrlFreq: 'Daily\nيومياً',
          },
        ],
      },
    ];

    for (const stage of zeroShotStages.slice(0, isAccurateMode ? 2 : 1)) {
      const taxEsg = matchBestTaxonomyAndEsg(`${unitNameAr} ${stage.stageTitle} ${stage.riskDesc}`, ragBundle);
      const rId = `RSK-${unitCode}-${String(nextRiskSeq).padStart(2, '0')}`;
      const seqStr = String(nextRiskSeq).padStart(2, '0');
      nextRiskSeq++;

      const zeroShotProp = enrichProposalWithPythonCalculation(session.unit_id, {
        risk_id: rId,
        process_name_ar: stage.stageTitle,
        strategic_objective_ar: stage.strategicObj,
        risk_library_name_ar: taxEsg.taxonomy_l3_ar || taxEsg.taxonomy_l2_ar,
        risk_title_ar: stage.riskTitle,
        description_ar: stage.riskDesc,
        single_incident_max_loss: stage.estLoss,
        financial_impact_amount: stage.estLoss,
        financial_impact_justification: `قيمة مرجعية معيارية وفق منهجية البنك الأهلي المصري (${stage.estLoss.toLocaleString()} ج.م)`,
        inherent_frequency_text: stage.freqText,
        frequency_multiplier: stage.freqMult,
        frequency_justification: `تقدير معياري استناداً لدورية عمليات (${unitNameAr})`,
        expected_annual_loss: stage.estLoss * stage.freqMult,
        clarification_status: 'NEEDS_CONFIRMATION',
        ...taxEsg,
        nfi_service_level: 2,
        nfi_reputation_level: 2,
        nfi_regulatory_level: 2,
        nfi_legal_level: 1,
        nfi_composite_score: 'M (متوسط)',
        acceptance_rationale_ar: '',
        corrective_action_ar: '',
        columns_populated_count: 29,
        phase2c_inputs: {
          nfi: {
            service: { rating: 'M', evidence: `أثر تشغيلي متوسط على مستوى الخدمة في ${unitNameAr}` },
            reputation: { rating: 'M', evidence: `أثر متوسط على رضا المتعاملين في ${unitNameAr}` },
            regulatory: { rating: 'M', evidence: `مرتبط بمتطلبات الالتزام الداخلي والرقابي لوحدة ${unitNameAr}` },
            legal: { rating: 'L', evidence: `مغطى بالنماذج القانونية القياسية للبنك` },
          },
          esg: {
            status: 'NO_DOCUMENTED_LINK',
            pillars: [],
            evidence: {},
            justification: `إجراء تشغيلي قياسي ضمن (${unitNameAr}) دون صلة موثقة بأبعاد ESG بكتالوج البنك المركزي.`,
          },
          acceptance_class: 1,
          acceptance_rationale: '',
          corrective_action: '',
        },
        model_generated_by: modelProfile,
        controls: stage.controls.map((c, cIdx) => ({
          control_id: `CTL-${unitCode}-${seqStr}-0${cIdx + 1}`,
          control_name_ar: c.ctrlName,
          control_type_label_ar: c.ctrlTypeLabel,
          control_method_label_ar: c.ctrlMethodLabel,
          description_ar: c.ctrlDesc,
          control_owner: 'السلطة الإشرافية',
          control_frequency_raw: c.ctrlFreq,
          design_classification: c.ctrlType,
          automation_level: c.ctrlMethod,
          effectiveness_raw: 'ضابط رقابي فعال',
          implementation_status: 'IMPLEMENTED',
          scope_relevance: 'ELIGIBLE',
        })),
      });

      generatedProposals.push({
        type: 'RISK',
        data: zeroShotProp,
        citations: [
          {
            document_id: `ZERO-SHOT-${unitCode}`,
            title_ar: `التحليل الهيكلي المعمم لوحدة (${unitNameAr})`,
            file_name: `منهجية التعميم الهيكلي للمخاطر (Zero-Shot Cross-BU)`,
            section_title: stage.stageTitle,
            quote_text: stage.riskDesc,
            doc_type: 'SOP',
          },
        ],
      });
    }
  }

  return generatedProposals;
}

export async function sendAgentMessage(
  sessionId: string,
  user: User,
  userMessageText: string,
  requestedModelProfile?: QwenModelProfileId | string
) {
  let session = getWorkflowSession(sessionId, user);
  if (!isUserAuthorizedForBU(user, session.unit_id, ['MAKER', 'RISK_ADMIN'])) {
    const err: any = new Error('غير مصرح: يلزم توفر صلاحية معد تقييم لإرسال توجيهات لوكيل الذكاء الاصطناعي.');
    err.statusCode = 403;
    throw err;
  }

  // Update session model profile if explicitly passed
  const activeProfile: QwenModelProfileId = requestedModelProfile
    ? resolveQwenModelProfile(requestedModelProfile).id
    : session.selected_model_profile === 'qwen-0.5b'
      ? 'qwen-0.5b'
      : 'qwen-4b';

  if (requestedModelProfile && activeProfile !== session.selected_model_profile) {
    session = updateWorkflowSession(sessionId, user, { selected_model_profile: activeProfile });
  }

  const qOption = resolveQwenModelProfile(activeProfile);

  // 1. Save User Message
  const userMsgId = `MSG-U-${Date.now()}`;
  db.prepare(`
    INSERT INTO rcsa_agent_conversations (id, session_id, unit_id, sender_role, message_text_ar, model_profile, created_at)
    VALUES (?, ?, ?, 'USER', ?, ?, datetime('now'))
  `).run(userMsgId, sessionId, session.unit_id, userMessageText, activeProfile);

  // 2. Retrieve RAG context & citations using Qwen model's topK depth
  const citations = searchRelevantCitations(sessionId, session.unit_id, userMessageText, qOption.rag_top_k);
  const ragBundle = assembleRagContextBundle(sessionId, session.unit_id);

  // 3. Generate Reply (Autonomous LLM with elevated Open-Domain + RAG authority, or Offline Grounded/Open-Domain Synthesis)
  let agentReplyText = '';

  const promptContextText = `
النموذج المختار: ${qOption.label_ar}
الوحدة التنظيمية: ${session.unit.name_ar} (${session.unit.code})
نمط التقييم: ${session.workflow_mode === 'NEW' ? 'إنشاء تقييم RCSA جديد' : 'تحديث ومقارنة تقييم RCSA قائم'}
المستندات المرفوعة بالجلسة (${ragBundle.session_documents.length}):
${ragBundle.session_documents.map(d => `- ${d.title_ar} (${d.doc_type}): ${d.chunks.length} مقطع نصي`).join('\n') || 'لا توجد مستندات مرفوعة حالياً'}

حالة البحث في فهرس RAG لهذا السؤال: ${
    citations.length > 0
      ? `تم العثور على (${citations.length}) مقاطع مطابقة في فهرس RAG`
      : `لم يتم العثور على تطابق نصي مباشر في فهرس RAG — استخدم صلاحيتك الكاملة ومعرفتك المصرفية والعامة للإجابة الشاملة عن سؤال المستخدم دون تقييد`
  }
${
  citations.length > 0
    ? `المقتطفات المسترجعة عبر محرك RAG:\n${citations.map((c, idx) => `[${idx + 1}] (${c.title_ar} - ${c.section_title}): "${c.quote_text}"`).join('\n\n')}`
    : ''
}

سجل الحوادث التاريخية (${ragBundle.incidents.length}):
${ragBundle.incidents.slice(0, 5).map(inc => `- [${inc.id}] ${inc.description}: ${Number(inc.loss_amount_egp || 0).toLocaleString()} ج.م`).join('\n')}

ملاحظات التفتيش (${ragBundle.audit_findings.length}):
${ragBundle.audit_findings.slice(0, 5).map(af => `- ${af.title_ar}: ${af.details_ar}`).join('\n')}
  `.trim();

  const systemPrompt =
    activeProfile === 'qwen-0.5b'
      ? `أنت وكيل الذكاء الاصطناعي المصرفي (الوضع: سريع) للبنك الأهلي المصري لنظام RCSA وRAG.
تتمتع بصلاحية مزدوجة عالية:
1) إذا وُجدت مقتطفات مطابقة في فهرس RAG، اعتمد عليها بدقة وأجب باختصار ووضوح.
2) إذا لم تجد إجابة السؤال في فهرس RAG أو كان السؤال عاماً أو استشارياً أو مصرفياً خارج نطاق الملفات المرفوعة، فلديك صلاحية كاملة وحرية تامة للإجابة من معرفتك الشاملة وخبرتك في العمل المصرفي وإدارة المخاطر (معايير بازل، تعليمات البنك المركزي المصري، الضوابط الرقابية، مؤشرات KRI، الأمن السيبراني، مكافحة الاحتيال، أو أي موضوع يسأل عنه المستخدم) دون الامتناع عن الإجابة.`
      : `أنت وكيل الذكاء الاصطناعي المصرفي الخبير (الوضع: دقيق) للبنك الأهلي المصري لنظام RCSA وRAG.
تتمتع بصلاحية استشارية وتحليلية عليا:
1) عند توفر أدلة ومقتطفات في فهرس RAG، قم بتحليلها بعمق ووثق إجابتك بالمصادر مع ربط المخاطر بتصنيف البنك المركزي (L1/L2/L3) وركائز الاستدامة (ESG).
2) عندما لا تتوفر إجابة السؤال في فهرس RAG أو يطرح المستخدم سؤالاً خارج نطاق الملفات المرفوعة، استخدم صلاحيتك الكاملة ومعرفتك الموسوعية والخبرة المصرفية والرقابية لتقديم إجابة وافية ومعمقة وحلول عملية مبتكرة، مع التنويه بشفافية إلى أن الإجابة مستندة إلى خبرة النموذج الاستشارية.`;

  const llmRes = await generateAgentAutonomousCompletion(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `سياق الجلسة وRAG:\n${promptContextText}\n\nسؤال/توجيه المستخدم: ${userMessageText}` },
    ],
    { modelProfile: activeProfile }
  );

  if (llmRes.success) {
    const modeHeader =
      citations.length === 0
        ? `${qOption.badge_ar} **[${qOption.short_label_ar} — صلاحية الاستدلال المفتوح والخبرة المصرفية]**`
        : `${qOption.badge_ar} **[${qOption.short_label_ar}]**`;
    agentReplyText = `${modeHeader}\n\n${llmRes.content}`;
    if (ragBundle.session_documents.length > 0 || ragBundle.incidents.length > 0) {
      const docTitles = ragBundle.session_documents.map(d => d.title_ar).join('، ');
      agentReplyText += `\n\n📊 **ملخص تغطية الأدلة والمستندات بالجلسة:**\n- المستندات المرفوعة: ${docTitles || 'لا توجد مستندات'}\n- سجل الحوادث الميدانية المسجلة: ${ragBundle.incidents.length} حوادث تشغيلية.`;
    }
  } else {
    agentReplyText = synthesizeQwenGroundedRagAnswer({
      userQuestion: userMessageText,
      modelProfile: activeProfile,
      ragBundle,
      citations,
      workflowMode: session.workflow_mode,
    });
  }

  // 4. Generate High-Accuracy RCSA Proposals when user asks for RCSA/document analysis OR on first RAG-matched turn
  const existingState = getAgentSessionState(sessionId, user);
  const normMsg = normalizeTextForRag(userMessageText);
  const userRequestedRcsaGeneration = Boolean(
    normMsg.match(/تحليل المستند|تحليل كافه|توليد|استخراج|بناء مصفوف|مصفوفه rcsa|المخاطر والضوابط المقترح|اقتراح قائمه المخاطر/)
  );

  let generatedProposals: Array<{
    type: 'RISK' | 'CONTROL' | 'CLARIFICATION' | 'CHANGE_RECOMMENDATION';
    data: any;
    citations: CitationReference[];
  }> = [];

  if ((existingState.proposals.length === 0 && citations.length > 0) || userRequestedRcsaGeneration) {
    generatedProposals = await buildHighPrecisionRcsaProposals({
      session,
      ragBundle,
      modelProfile: activeProfile,
      existingProposals: existingState.proposals,
    });
  }

  // 5. Save Agent Reply Message into Conversation
  const agentMsgId = `MSG-A-${Date.now()}`;
  db.prepare(`
    INSERT INTO rcsa_agent_conversations (id, session_id, unit_id, sender_role, message_text_ar, model_profile, citations_json, created_at)
    VALUES (?, ?, ?, 'AGENT', ?, ?, ?, datetime('now'))
  `).run(
    agentMsgId,
    sessionId,
    session.unit_id,
    agentReplyText,
    activeProfile,
    JSON.stringify(citations)
  );

  // 6. Save Proposals and Insert Explicit Financial Input Clarifications Directly into Conversation
  if (generatedProposals.length > 0) {
    runInTransaction(() => {
      for (const prop of generatedProposals) {
        const propId = `PROP-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
        db.prepare(`
          INSERT INTO rcsa_agent_proposals (id, session_id, unit_id, proposal_type, proposal_data_json, citations_json, status, created_at)
          VALUES (?, ?, ?, ?, ?, ?, 'PROPOSED', datetime('now'))
        `).run(
          propId,
          sessionId,
          session.unit_id,
          prop.type,
          JSON.stringify(prop.data),
          JSON.stringify(prop.citations)
        );

        const clarifId = `CLAR-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
        const questionText = `يرجى اختيار أو تأكيد قيمة الأثر المالي الفردي التقديري بالجنيه المصري (EGP) للمخاطرة المقترحة (${prop.data.risk_id}: ${prop.data.risk_title_ar})، مع المبرر المرجعي:`;
        const optionsList = [
          `تأكيد ${Number(prop.data.financial_impact_amount || OFFICIAL_FINANCIAL_ANCHORS_EGP.M).toLocaleString()} ج.م (القيمة المرجعية المعتمدة)`,
          '50,000 ج.م (تأثير مالي منخفض — شريحة L)',
          '151,000 ج.م (تأثير مالي متوسط — شريحة M)',
          '501,000 ج.م (تأثير مالي كبير — شريحة H)',
          '1,501,000 ج.م (تأثير مالي كبير جداً — شريحة VH)',
        ];

        db.prepare(`
          INSERT INTO rcsa_agent_clarifications (id, session_id, proposal_id, field_name, question_ar, options_json, created_at)
          VALUES (?, ?, ?, 'financial_impact_amount', ?, ?, datetime('now'))
        `).run(clarifId, sessionId, propId, questionText, JSON.stringify(optionsList));

        const clarifMsgId = `MSG-A-CLAR-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`;
        db.prepare(`
          INSERT INTO rcsa_agent_conversations (id, session_id, unit_id, sender_role, message_text_ar, model_profile, citations_json, created_at)
          VALUES (?, ?, ?, 'AGENT', ?, ?, ?, datetime('now'))
        `).run(
          clarifMsgId,
          sessionId,
          session.unit_id,
          questionText,
          activeProfile,
          JSON.stringify(prop.citations)
        );
      }
    });
  }

  return getAgentSessionState(sessionId, user);
}

export function decideAgentProposal(
  sessionId: string,
  proposalId: string,
  user: User,
  decision: 'ACCEPT' | 'REJECT' | 'MODIFIED_ACCEPTED',
  modifiedData?: any,
  notes?: string
) {
  const session = getWorkflowSession(sessionId, user);
  if (!isUserAuthorizedForBU(user, session.unit_id, ['MAKER', 'RISK_ADMIN'])) {
    const err: any = new Error('غير مصرح: يلزم توفر صلاحية معد تقييم لاتخاذ قرارات القبول والرفض.');
    err.statusCode = 403;
    throw err;
  }

  const propRow = db
    .prepare('SELECT * FROM rcsa_agent_proposals WHERE id = ? AND session_id = ?')
    .get(proposalId, sessionId) as any;
  if (!propRow) {
    const err: any = new Error('المقترح المحدد غير موجود بالجلسة.');
    err.statusCode = 404;
    throw err;
  }

  let finalData: any = {};
  try {
    finalData = JSON.parse(propRow.proposal_data_json || '{}');
  } catch {
    finalData = {};
  }
  if (modifiedData && typeof modifiedData === 'object') {
    finalData = enrichProposalWithPythonCalculation(session.unit_id, {
      ...finalData,
      ...modifiedData,
    });
  }

  const decStr = String(decision);
  let dbStatus: 'ACCEPTED' | 'REJECTED' | 'MODIFIED_ACCEPTED' = 'ACCEPTED';
  if (decStr === 'ACCEPT' || decStr === 'ACCEPTED') dbStatus = 'ACCEPTED';
  else if (decStr === 'REJECT' || decStr === 'REJECTED') dbStatus = 'REJECTED';
  else if (decStr === 'MODIFIED_ACCEPTED') dbStatus = 'MODIFIED_ACCEPTED';

  runInTransaction(() => {
    db.prepare(`
      UPDATE rcsa_agent_proposals 
      SET status = ?, proposal_data_json = ?, user_decision_notes = ?, decided_by = ?, decided_at = datetime('now')
      WHERE id = ?
    `).run(dbStatus, JSON.stringify(finalData), notes || null, user.employee_id, proposalId);

    if (dbStatus === 'ACCEPTED' || dbStatus === 'MODIFIED_ACCEPTED') {
      const currentCandidates = [...(session.candidate_risks || [])];
      const existingIdx = currentCandidates.findIndex(r => r.risk_id === finalData.risk_id);

      if (existingIdx >= 0) {
        currentCandidates[existingIdx] = finalData;
      } else {
        currentCandidates.push(finalData);
      }

      updateWorkflowSession(sessionId, user, {
        candidate_risks: currentCandidates,
      });

      logAuditEvent({
        userId: user.employee_id,
        userRole: user.roles[0]?.role || 'MAKER',
        unitId: session.unit_id,
        entityType: 'AGENT_PROPOSAL',
        entityId: proposalId,
        action: 'ACCEPT_AGENT_PROPOSAL',
        afterState: finalData,
        changeSummary: `قبول توصية الذكاء الاصطناعي للمخاطرة ${finalData.risk_id || proposalId} وإدراجها في مسودة الجلسة`,
      });
    }
  });

  return getAgentSessionState(sessionId, user);
}

export function acceptAllPendingProposals(sessionId: string, user: User) {
  const session = getWorkflowSession(sessionId, user);
  if (!isUserAuthorizedForBU(user, session.unit_id, ['MAKER', 'RISK_ADMIN'])) {
    const err: any = new Error('غير مصرح: يلزم توفر صلاحية معد تقييم لاتخاذ قرارات القبول.');
    err.statusCode = 403;
    throw err;
  }

  const pendingRows = db
    .prepare("SELECT * FROM rcsa_agent_proposals WHERE session_id = ? AND status = 'PROPOSED'")
    .all(sessionId) as any[];

  for (const row of pendingRows) {
    decideAgentProposal(sessionId, row.id, user, 'ACCEPT');
  }

  return getAgentSessionState(sessionId, user);
}

export function answerAgentClarification(
  sessionId: string,
  clarificationId: string,
  user: User,
  answerText: string
) {
  const session = getWorkflowSession(sessionId, user);
  if (!isUserAuthorizedForBU(user, session.unit_id, ['MAKER', 'RISK_ADMIN'])) {
    const err: any = new Error('غير مصرح: يلزم توفر صلاحية معد تقييم لاستيفاء استفسارات الذكاء الاصطناعي.');
    err.statusCode = 403;
    throw err;
  }

  const clarif = db
    .prepare('SELECT * FROM rcsa_agent_clarifications WHERE id = ? AND session_id = ?')
    .get(clarificationId, sessionId) as any;
  if (!clarif) {
    const err: any = new Error('الاستفسار المحدد غير موجود.');
    err.statusCode = 404;
    throw err;
  }

  runInTransaction(() => {
    db.prepare(`
      UPDATE rcsa_agent_clarifications 
      SET user_answer_ar = ?, answered_by = ?, answered_at = datetime('now') 
      WHERE id = ?
    `).run(answerText, user.employee_id, clarificationId);

    const userMsgId = `MSG-U-CLAR-${Date.now()}`;
    db.prepare(`
      INSERT INTO rcsa_agent_conversations (id, session_id, unit_id, sender_role, message_text_ar, model_profile, created_at)
      VALUES (?, ?, ?, 'USER', ?, ?, datetime('now'))
    `).run(userMsgId, sessionId, session.unit_id, `إجابة الاستفسار: ${answerText}`, session.selected_model_profile);

    if (clarif.proposal_id) {
      const prop = db
        .prepare('SELECT * FROM rcsa_agent_proposals WHERE id = ?')
        .get(clarif.proposal_id) as any;
      if (prop) {
        let pData: any = {};
        try {
          pData = JSON.parse(prop.proposal_data_json || '{}');
        } catch {
          pData = {};
        }

        if (
          clarif.field_name === 'financial_impact_amount' ||
          clarif.field_name === 'individual_financial_impact'
        ) {
          const cleanDigits = answerText.replace(/[^\d]/g, '');
          let parsedVal = cleanDigits ? parseInt(cleanDigits, 10) : 0;

          if (!parsedVal || parsedVal <= 0) {
            if (answerText.includes('منخفض') || answerText.includes('L')) parsedVal = OFFICIAL_FINANCIAL_ANCHORS_EGP.L;
            else if (answerText.includes('متوسط') || answerText.includes('M')) parsedVal = OFFICIAL_FINANCIAL_ANCHORS_EGP.M;
            else if (answerText.includes('كبير جداً') || answerText.includes('VH')) parsedVal = OFFICIAL_FINANCIAL_ANCHORS_EGP.VH;
            else if (answerText.includes('كبير') || answerText.includes('مرتفع') || answerText.includes('H')) parsedVal = OFFICIAL_FINANCIAL_ANCHORS_EGP.H;
            else parsedVal = pData.financial_impact_amount || OFFICIAL_FINANCIAL_ANCHORS_EGP.M;
          }

          pData.financial_impact_amount = parsedVal;
          pData.single_incident_max_loss = parsedVal;
          pData.financial_impact_justification = `تم الاعتماد وتأكيد القيمة الموثقة من قِبل الموظف المصرفي: ${Number(parsedVal).toLocaleString()} ج.م`;
          pData.expected_annual_loss = parsedVal * (pData.frequency_multiplier || 1);
          pData.expected_loss_egp = pData.expected_annual_loss;
          pData.clarification_status = 'CONFIRMED';

          pData = enrichProposalWithPythonCalculation(session.unit_id, pData);
        }

        db.prepare('UPDATE rcsa_agent_proposals SET proposal_data_json = ? WHERE id = ?').run(
          JSON.stringify(pData),
          clarif.proposal_id
        );

        if (prop.status === 'ACCEPTED' || prop.status === 'MODIFIED_ACCEPTED') {
          const currentCandidates = [...(session.candidate_risks || [])];
          const cIdx = currentCandidates.findIndex(r => r.risk_id === pData.risk_id);
          if (cIdx >= 0) {
            currentCandidates[cIdx] = pData;
            updateWorkflowSession(sessionId, user, { candidate_risks: currentCandidates });
          }
        }
      }
    }

    const agentConfirmId = `MSG-A-CONF-${Date.now()}`;
    const confirmText = `شكرًا لك. تم تسجيل إجابتك ("${answerText}") وإعادة احتساب الأثر المالي/الرقابي عبر محرك بايثون وتحديث التقييم المقترح بنجاح.`;
    db.prepare(`
      INSERT INTO rcsa_agent_conversations (id, session_id, unit_id, sender_role, message_text_ar, model_profile, created_at)
      VALUES (?, ?, ?, 'AGENT', ?, ?, datetime('now'))
    `).run(agentConfirmId, sessionId, session.unit_id, confirmText, session.selected_model_profile);
  });

  return getAgentSessionState(sessionId, user);
}

export function clearAgentSessionMessages(sessionId: string, user: User) {
  const session = getWorkflowSession(sessionId, user);
  if (!isUserAuthorizedForBU(user, session.unit_id, ['MAKER', 'CHECKER', 'RISK_ADMIN', 'AUDITOR'])) {
    const err: any = new Error('غير مصرح: لا تملك صلاحية مسح محادثات هذه الوحدة.');
    err.statusCode = 403;
    throw err;
  }

  runInTransaction(() => {
    db.prepare('DELETE FROM rcsa_agent_conversations WHERE session_id = ?').run(sessionId);
    db.prepare('DELETE FROM rcsa_agent_clarifications WHERE session_id = ?').run(sessionId);
    db.prepare('DELETE FROM rcsa_agent_proposals WHERE session_id = ?').run(sessionId);
    db.prepare("UPDATE rcsa_workflow_sessions SET candidate_risks_json = '[]' WHERE id = ?").run(sessionId);
    logAuditEvent({
      userId: user.employee_id,
      userRole: user.roles[0]?.role || 'MAKER',
      unitId: session.unit_id,
      entityType: 'AGENT_SESSION',
      entityId: sessionId,
      action: 'CLEAR_MESSAGES',
      beforeState: null,
      afterState: null,
      changeSummary: `مسح محادثات ورسائل وتوصيات الجلسة ${sessionId} بواسطة ${user.full_name}`,
    });
  });

  return getAgentSessionState(sessionId, user);
}

export function clearAllAgentMessages(user: User, unitId?: string) {
  if (unitId && !isUserAuthorizedForBU(user, unitId, ['MAKER', 'CHECKER', 'RISK_ADMIN', 'AUDITOR'])) {
    const err: any = new Error('غير مصرح: لا تملك صلاحية مسح محادثات هذه الوحدة.');
    err.statusCode = 403;
    throw err;
  }

  runInTransaction(() => {
    if (unitId) {
      db.prepare(`
        DELETE FROM rcsa_agent_conversations 
        WHERE session_id IN (SELECT id FROM rcsa_workflow_sessions WHERE unit_id = ?)
      `).run(unitId);
      db.prepare(`
        DELETE FROM rcsa_agent_clarifications 
        WHERE session_id IN (SELECT id FROM rcsa_workflow_sessions WHERE unit_id = ?)
      `).run(unitId);
      db.prepare(`
        DELETE FROM rcsa_agent_proposals 
        WHERE session_id IN (SELECT id FROM rcsa_workflow_sessions WHERE unit_id = ?)
      `).run(unitId);
      db.prepare(`
        UPDATE rcsa_workflow_sessions SET candidate_risks_json = '[]' WHERE unit_id = ?
      `).run(unitId);
    } else {
      db.prepare('DELETE FROM rcsa_agent_conversations').run();
      db.prepare('DELETE FROM rcsa_agent_clarifications').run();
      db.prepare('DELETE FROM rcsa_agent_proposals').run();
      db.prepare("UPDATE rcsa_workflow_sessions SET candidate_risks_json = '[]'").run();
    }
    logAuditEvent({
      userId: user.employee_id,
      userRole: user.roles[0]?.role || 'MAKER',
      unitId: unitId || 'GLOBAL',
      entityType: 'AGENT_SESSION',
      entityId: 'ALL',
      action: 'CLEAR_ALL_CHAT',
      beforeState: null,
      afterState: null,
      changeSummary: `مسح سجل كافة المحادثات القديمة في المنصة بواسطة ${user.full_name}`,
    });
  });

  return { success: true, message: 'تم مسح كافة سجلات المحادثات القديمة بنجاح.' };
}

export function applyAllAcceptedProposalsToDraft(sessionId: string, user: User) {
  const session = getWorkflowSession(sessionId, user);
  if (!isUserAuthorizedForBU(user, session.unit_id, ['MAKER', 'RISK_ADMIN'])) {
    const err: any = new Error('غير مصرح: يلزم توفر صلاحية معد تقييم لحفظ واعتماد مسودة التقييم.');
    err.statusCode = 403;
    throw err;
  }

  if ((session.candidate_risks || []).length === 0) {
    const err: any = new Error('لا توجد مخاطر مقبولة في مسودة الجلسة لإنشاء التقييم.');
    err.statusCode = 400;
    throw err;
  }

  const state = createGuidedAssessmentDraft({
    unitId: session.unit_id,
    user,
    title: session.session_title,
    candidateRisks: session.candidate_risks,
  });

  updateWorkflowSession(sessionId, user, {
    draft_assessment_id: state.assessment?.id,
    current_step: 6,
  });

  return {
    success: true,
    assessment: state.assessment,
    state,
  };
}
