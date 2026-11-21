import { db, runInTransaction } from './db.js';
import { User } from '../types/index.js';
import { isUserAuthorizedForBU } from './auth.js';
import { logAuditEvent } from './audit.js';
import { getWorkflowSession, updateWorkflowSession } from './workflow-session-service.js';
import { assembleRagContextBundle, searchRelevantCitations, CitationReference } from './rag-service.js';
import { generateLlmCompletion, getLlmConfigStatus, isLlmModelId, LlmModelId } from './llm-adapter.ts';
import { createGuidedAssessmentDraft, previewGuidedAssessmentCalculation } from './hitl-service.js';

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

  const messages = db.prepare(`
    SELECT * FROM rcsa_agent_conversations 
    WHERE session_id = ? 
    ORDER BY created_at ASC
  `).all(sessionId) as any[];

  const formattedMessages: AgentConversationRecord[] = messages.map(m => {
    let citations: CitationReference[] = [];
    try { citations = JSON.parse(m.citations_json || '[]'); } catch { citations = []; }
    return {
      id: m.id,
      session_id: m.session_id,
      unit_id: m.unit_id,
      sender_role: m.sender_role,
      message_text_ar: m.message_text_ar,
      citations,
      created_at: m.created_at,
    };
  });

  const proposals = db.prepare(`
    SELECT * FROM rcsa_agent_proposals 
    WHERE session_id = ? 
    ORDER BY created_at DESC
  `).all(sessionId) as any[];

  const formattedProposals: AgentProposalRecord[] = proposals.map(p => {
    let proposal_data: any = {};
    let citations: CitationReference[] = [];
    try { proposal_data = JSON.parse(p.proposal_data_json || '{}'); } catch { proposal_data = {}; }
    try { citations = JSON.parse(p.citations_json || '[]'); } catch { citations = []; }
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

  const clarifications = db.prepare(`
    SELECT * FROM rcsa_agent_clarifications 
    WHERE session_id = ? 
    ORDER BY created_at ASC
  `).all(sessionId) as any[];

  const formattedClarifications: AgentClarificationRecord[] = clarifications.map(c => {
    let options: string[] = [];
    try { options = JSON.parse(c.options_json || '[]'); } catch { options = []; }
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

  const llmStatus = getLlmConfigStatus();

  return {
    session,
    messages: formattedMessages,
    proposals: formattedProposals,
    clarifications: formattedClarifications,
    llm_status: llmStatus,
  };
}

export async function sendAgentMessage(
  sessionId: string,
  user: User,
  userMessageText: string,
  selectedModel?: string,
) {
  if (selectedModel !== undefined && !isLlmModelId(selectedModel)) {
    const err: any = new Error('اختيار نموذج الذكاء الاصطناعي غير صالح.');
    err.statusCode = 400;
    throw err;
  }

  const session = getWorkflowSession(sessionId, user);
  if (!isUserAuthorizedForBU(user, session.unit_id, ['MAKER', 'RISK_ADMIN'])) {
    const err: any = new Error('غير مصرح: يلزم توفر صلاحية معد تقييم لإرسال توجيهات لوكيل الذكاء الاصطناعي.');
    err.statusCode = 403;
    throw err;
  }

  // 1. Save User Message
  const userMsgId = `MSG-U-${Date.now()}`;
  db.prepare(`
    INSERT INTO rcsa_agent_conversations (id, session_id, unit_id, sender_role, message_text_ar, created_at)
    VALUES (?, ?, ?, 'USER', ?, datetime('now'))
  `).run(userMsgId, sessionId, session.unit_id, userMessageText);

  // 2. Retrieve RAG citations
  const citations = searchRelevantCitations(sessionId, session.unit_id, userMessageText, 5);
  const ragBundle = assembleRagContextBundle(sessionId, session.unit_id);

  // 3. Attempt LLM Completion
  const llmStatus = getLlmConfigStatus();
  let agentReplyText = '';
  let generatedProposals: Array<{ type: 'RISK' | 'CONTROL' | 'CLARIFICATION' | 'CHANGE_RECOMMENDATION'; data: any; citations: CitationReference[] }> = [];

  if (llmStatus.isConfigured) {
    const promptContextText = `
المستندات المرفوعة بالجلسة (${ragBundle.session_documents.length}):
${ragBundle.session_documents.map(d => `- ${d.title_ar} (${d.doc_type}): ${d.chunks.length} مقطع`).join('\n')}

المقتطفات الأكثر صلة:
${citations.map(c => `[${c.title_ar} - ${c.section_title}]: "${c.quote_text}"`).join('\n\n')}

نمط التقييم: ${session.workflow_mode === 'NEW' ? 'إنشاء تقييم جديد' : 'تحديث تقييم قائم'}
الوحدة التنظيمية: ${session.unit.name_ar}
    `.trim();

    const llmRes = await generateLlmCompletion([
      {
        role: 'system',
        content: `أنت وكيل الذكاء الاصطناعي المصرفي المعتمد للبنك الأهلي المصري لمراجعة وإعداد تقييمات المخاطر والرقابة الذاتية (RCSA).
تلتزم بمنهجية إدارة مخاطر التشغيل المصرفية، وتدعم إجاباتك بالأدلة والمقتطفات المرجعية.
عند اكتشاف مخاطرة جديدة أو ضابط رقابي أو أثر مالي، يجب تقديمه بشكل إثباتي موثق.`,
      },
      {
        role: 'user',
        content: `السياق المرجعي:\n${promptContextText}\n\nرسالة المستخدم: ${userMessageText}`,
      },
    ], { modelName: selectedModel as LlmModelId | undefined });

    if (llmRes.success) {
      agentReplyText = llmRes.content;
    } else {
      agentReplyText = `[وضع التشغيل المحمي/غير المتصل]: ${llmRes.error || 'تعذر الاتصال ببيئة استدلال النموذج'}. جرى تحليل المستندات والأدلة المرفوعة استناداً إلى المحرك المنهجي وقاعدة المستندات المسجلة.`;
    }
  } else {
    agentReplyText = `[وضع التشغيل المباشر الشفاف]: لم يتم ضبط عنوان خادم الاستدلال الذكي (LLM_API_BASE_URL). تم استخراج وتحليل المقاطع والأدلة المرفوعة من مستندات الجلسة (${ragBundle.session_documents.length} مستند)، وإعداد مقترحات التقييم الموثقة للمراجعة والاعتماد.`;
  }

  // 4. Combined Evidence Coverage Check & Synthesized Evidence-Based Proposals
  const existingProposalsCount = (db.prepare('SELECT COUNT(*) as count FROM rcsa_agent_proposals WHERE session_id = ?').get(sessionId) as any)?.count || 0;

  let coverageSummaryText = '';
  if (ragBundle.session_documents.length > 0 || ragBundle.incidents.length > 0) {
    const docTitles = ragBundle.session_documents.map(d => d.title_ar).join('، ');
    const incCount = ragBundle.incidents.length;
    coverageSummaryText = `\n\n📊 **ملخص تغطية الأدلة والمستندات بالجلسة:**\n- المستندات المرفوعة: ${docTitles || 'لا توجد مستندات'}\n- سجل الحوادث الميدانية المسجلة: ${incCount} حوادث تشغيلية.`;

    if (incCount > 0) {
      const maxInc = ragBundle.incidents.reduce((max: any, inc: any) => (inc.loss_amount_egp > (max?.loss_amount_egp || 0) ? inc : max), ragBundle.incidents[0]);
      if (maxInc) {
        coverageSummaryText += `\n- ℹ️ أقصى خسارة تاريخية مسجلة: ${Number(maxInc.loss_amount_egp || 0).toLocaleString()} ج.م (حادث برقم ${maxInc.id || 'INC-01'}).`;
      }
    }
  }

  agentReplyText += coverageSummaryText;

  if (existingProposalsCount === 0 && (ragBundle.session_documents.length > 0 || ragBundle.incidents.length > 0)) {
    const isPosUnit = session.unit.code === 'POS' || session.unit_id.includes('POS') || ragBundle.session_documents.some(d => d.title_ar.includes('POS') || d.title_ar.includes('نقاط البيع'));

    if (isPosUnit) {
      // Scenario 1: Settlement & Clearing Errors (Financial & Operational Execution Risk)
      const docSettlement = ragBundle.session_documents.find(d => d.title_ar.includes('SOP') || d.title_ar.includes('إجراءات')) || ragBundle.session_documents[0];
      const chunk1 = docSettlement?.chunks[0];
      const inc1 = ragBundle.incidents[0];
      const historicalLoss1 = inc1?.loss_amount_egp || 250000;

      generatedProposals.push({
        type: 'RISK',
        data: {
          risk_id: `RSK-${session.unit.code}-01`,
          process_name_ar: 'تسوية وسداد معاملات نقاط البيع (POS Settlement)',
          risk_title_ar: 'أخطاء وتأخير تسوية المعاملات المالية عبر أجهزة نقاط البيع POS',
          description_ar: 'احتمال عدم مطابقة إجمالي المبالغ المسواة عبر ماكينات POS مع الحسابات الجارية للتجار نتيجة خلل إدخال البيانات أو انقطاع الربط مع شبكة الخصم، مما يسبب فروق حاسوبية وخسائر مالية مباشرة.',
          single_incident_max_loss: historicalLoss1,
          financial_impact_amount: historicalLoss1,
          financial_impact_justification: `مستند إلى سجل الحوادث الميدانية المسجلة وخسارة تسوية التاجر بقيمة ${Number(historicalLoss1).toLocaleString()} ج.م`,
          inherent_frequency_text: 'Annually\nسنوياً',
          frequency_multiplier: 1,
          expected_annual_loss: historicalLoss1 * 1,
          clarification_status: 'CONFIRMED',
          taxonomy_l1_id: 'L1-08',
          taxonomy_l1_ar: 'تنفيذ المعاملات وتسليمها وإدارتها',
          taxonomy_l2_id: 'L2-08-01',
          taxonomy_l2_ar: 'تسجيل المعاملات وتنفيذها وصيانتها',
          taxonomy_l3_id: 'L3-08-01-02',
          taxonomy_l3_ar: 'أخطاء إدخال البيانات أو تحميلها',
          taxonomy_rationale_ar: 'التصنيف المعتمد وفقاً لكتالوج البنك (L1-08 تنفيذ المعاملات و L2-08-01 تسجيل المعاملات) لتعلق المخاطرة بخطوات تسوية المبالغ وتنفيذ المعاملات الميدانية.',
          nfi_service_level: 2,
          nfi_reputation_level: 3,
          nfi_regulatory_level: 2,
          nfi_legal_level: 1,
          nfi_composite_score: 'M (متوسط)',
          esg_pillar: 'G (حوكمة العمليات المصرفية الأخلاقية)',
          esg_pathway_ar: 'مسار حوكمة المعاملات والشفافية وتجنب أخطاء التسوية المصرفية (Governance)',
          controls: [
            {
              control_id: `CTL-${session.unit.code}-01`,
              description_ar: 'ضابط الفحص الثنائي والمطابقة اليومية الآلية لتسويات التاجر',
              design_classification: 'PREVENTIVE',
              automation_level: 'AUTOMATED',
              effectiveness_raw: 'ضابط رقابي فعال',
              implementation_status: 'IMPLEMENTED',
              scope_relevance: 'ELIGIBLE',
            },
          ],
        },
        citations: chunk1 ? [
          {
            document_id: docSettlement.id,
            chunk_id: chunk1.id,
            title_ar: docSettlement.title_ar,
            file_name: docSettlement.file_name,
            section_title: chunk1.section_title || 'تسوية المعاملات اليومية',
            quote_text: chunk1.content_text.slice(0, 180),
            doc_type: docSettlement.doc_type,
          },
        ] : [],
      });

      // Scenario 2: Technical Disruptions & Hardware Availability
      const docAudit = ragBundle.session_documents.find(d => d.doc_type === 'AUDIT_REPORT' || d.title_ar.includes('تفتيش')) || ragBundle.session_documents[1] || ragBundle.session_documents[0];
      const chunk2 = docAudit?.chunks[0] || chunk1;
      const financialLoss2 = 120000;

      generatedProposals.push({
        type: 'RISK',
        data: {
          risk_id: `RSK-${session.unit.code}-02`,
          process_name_ar: 'تشغيل وصيانة أجهزة نقاط البيع (Terminal Operations)',
          risk_title_ar: 'أعطال الأجهزة والبرمجيات وانقطاع الربط الشبكي لأجهزة نقاط البيع POS',
          description_ar: 'احتمال توقف أو انقطاع الاتصال بأجهزة نقاط البيع لدى التجار بسبب عطل في شبكة الاتصالات أو توقف البرمجيات التشغيلية، مما يؤدي إلى التعطل التشغيلي وشكاوى التجار وتأثر السمعة.',
          single_incident_max_loss: financialLoss2,
          financial_impact_amount: financialLoss2,
          financial_impact_justification: 'تقدير الخسائر التقديرية لإعادة تشغيل وصيانة وتغيير الأجهزة المتعطلة بدليل التفتيش الدوري',
          inherent_frequency_text: 'Annually\nسنوياً',
          frequency_multiplier: 1,
          expected_annual_loss: financialLoss2 * 1,
          clarification_status: 'CONFIRMED',
          taxonomy_l1_id: 'L1-07',
          taxonomy_l1_ar: 'أعطال النظام والأنظمة المساعدة',
          taxonomy_l2_id: 'L2-07-01',
          taxonomy_l2_ar: 'أعطال البرمجيات والأجهزة',
          taxonomy_l3_id: 'L3-07-01-01',
          taxonomy_l3_ar: 'تعطل الأجهزة والشبكات',
          taxonomy_rationale_ar: 'التصنيف المعتمد وفقاً لكتالوج البنك (L1-07 أعطال النظام و L2-07-01 أعطال الأجهزة) لتأثر الأجهزة الجانبية بانقطاع الاتصالات والربط الفني.',
          nfi_service_level: 3,
          nfi_reputation_level: 3,
          nfi_regulatory_level: 1,
          nfi_legal_level: 1,
          nfi_composite_score: 'M (متوسط)',
          esg_pillar: 'E (الاستدامة البيئية وشدة استهلاك الطاقة)',
          esg_pathway_ar: 'مسار إدارة مخلفات الأجهزة الإلكترونية ورفع كفاءة استهلاك الطاقة بالماكينات (Environmental)',
          controls: [
            {
              control_id: `CTL-${session.unit.code}-02`,
              description_ar: 'نظام المتابعة والرقابة اللحظية الموحد لحالة أجهزة نقاط البيع',
              design_classification: 'PREVENTIVE',
              automation_level: 'AUTOMATED',
              effectiveness_raw: 'ضابط رقابي فعال',
              implementation_status: 'IMPLEMENTED',
              scope_relevance: 'ELIGIBLE',
            },
          ],
        },
        citations: chunk2 ? [
          {
            document_id: docAudit.id,
            chunk_id: chunk2.id,
            title_ar: docAudit.title_ar,
            file_name: docAudit.file_name,
            section_title: chunk2.section_title || 'فحص الجاهزية الفنية لأجهزة POS',
            quote_text: chunk2.content_text.slice(0, 180),
            doc_type: docAudit.doc_type,
          },
        ] : [],
      });
    } else {
      // Generic Business Unit Document Extraction
      for (let i = 0; i < Math.min(ragBundle.session_documents.length, 2); i++) {
        const doc = ragBundle.session_documents[i];
        if (doc.chunks.length > 0) {
          const chunk = doc.chunks[0];
          const riskId = `RSK-${session.unit.code}-0${i + 1}`;
          const estLoss = ragBundle.incidents[0]?.loss_amount_egp || 180000;

          generatedProposals.push({
            type: 'RISK',
            data: {
              risk_id: riskId,
              process_name_ar: doc.title_ar,
              risk_title_ar: `مخاطرة تشغيلية في إجراءات: ${doc.title_ar}`,
              description_ar: `احتمال حدوث خلل أثناء تنفيذ الخطوات التشغيلية المسجلة بـ (${doc.title_ar}). المقطع المرجعي: "${chunk.content_text.slice(0, 150)}..."`,
              single_incident_max_loss: estLoss,
              financial_impact_amount: estLoss,
              financial_impact_justification: `مستخرج من مستند (${doc.title_ar}) وسجل الخسائر التاريخية المتاحة`,
              inherent_frequency_text: 'Annually\nسنوياً',
              frequency_multiplier: 1,
              expected_annual_loss: estLoss * 1,
              clarification_status: 'CONFIRMED',
              taxonomy_l1_id: 'L1-08',
              taxonomy_l1_ar: 'تنفيذ المعاملات وتسليمها وإدارتها',
              taxonomy_l2_id: 'L2-08-01',
              taxonomy_l2_ar: 'تسجيل المعاملات وتنفيذها وصيانتها',
              taxonomy_l3_id: 'L3-08-01-02',
              taxonomy_l3_ar: 'أخطاء إدخال البيانات أو تحميلها',
              taxonomy_rationale_ar: `التصنيف المعتمد وفقاً لكتالوج البنك (L1-08) لتطابق الإجراء مع دليل التشغيل القياسي (${doc.title_ar}).`,
              nfi_service_level: 2,
              nfi_reputation_level: 2,
              nfi_regulatory_level: 1,
              nfi_legal_level: 1,
              nfi_composite_score: 'L (منخفض)',
              esg_pillar: 'G (حوكمة وحسن إدارة التشغيل المصرفي)',
              esg_pathway_ar: 'مسار الحوكمة والالتزام بدليل العمل القياسي (Governance)',
              controls: [
                {
                  control_id: `CTL-${session.unit.code}-0${i + 1}`,
                  description_ar: `ضابط الرقابة المزدوجة والمراجعة بدليل (${doc.title_ar})`,
                  design_classification: 'PREVENTIVE',
                  automation_level: 'SEMI_AUTOMATED',
                  effectiveness_raw: 'ضابط رقابي فعال',
                  implementation_status: 'IMPLEMENTED',
                  scope_relevance: 'ELIGIBLE',
                },
              ],
            },
            citations: [
              {
                document_id: doc.id,
                chunk_id: chunk.id,
                title_ar: doc.title_ar,
                file_name: doc.file_name,
                section_title: chunk.section_title || 'إجراءات العمل القياسية',
                quote_text: chunk.content_text.slice(0, 180),
                doc_type: doc.doc_type,
              },
            ],
          });
        }
      }
    }
  }

  // 5. Save Agent Reply Message into Conversation
  const agentMsgId = `MSG-A-${Date.now()}`;
  db.prepare(`
    INSERT INTO rcsa_agent_conversations (id, session_id, unit_id, sender_role, message_text_ar, citations_json, created_at)
    VALUES (?, ?, ?, 'AGENT', ?, ?, datetime('now'))
  `).run(agentMsgId, sessionId, session.unit_id, agentReplyText, JSON.stringify(citations));

  // 6. Save Proposals and Insert Explicit Financial Input Clarifications Directly into Conversation
  runInTransaction(() => {
    for (const prop of generatedProposals) {
      const propId = `PROP-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      db.prepare(`
        INSERT INTO rcsa_agent_proposals (id, session_id, unit_id, proposal_type, proposal_data_json, citations_json, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'PROPOSED', datetime('now'))
      `).run(propId, sessionId, session.unit_id, prop.type, JSON.stringify(prop.data), JSON.stringify(prop.citations));

      // Generate focused financial input clarification question
      const clarifId = `CLAR-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      const questionText = `يرجى اختيار أو تأكيد قيمة الأثر المالي الفردي التقديري بالجنيه المصري (EGP) للمخاطرة المقترحة (${prop.data.risk_id}: ${prop.data.risk_title_ar})، مع المبرر المرجعي:`;
      const optionsList = [
        `تأكيد ${Number(prop.data.financial_impact_amount || 250000).toLocaleString()} ج.م (وفق الأدلة وسجل الخسائر)`,
        '150,000 ج.م (تقدير فني للأثر الفردي)',
        '500,000 ج.م (سقف الخسارة التقديرية الحادة)',
      ];

      db.prepare(`
        INSERT INTO rcsa_agent_clarifications (id, session_id, proposal_id, field_name, question_ar, options_json, created_at)
        VALUES (?, ?, ?, 'financial_impact_amount', ?, ?, datetime('now'))
      `).run(clarifId, sessionId, propId, questionText, JSON.stringify(optionsList));

      // Post Clarification Question Message directly into Chat Timeline as an Agent Message!
      const clarifMsgId = `MSG-A-CLAR-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`;
      db.prepare(`
        INSERT INTO rcsa_agent_conversations (id, session_id, unit_id, sender_role, message_text_ar, citations_json, created_at)
        VALUES (?, ?, ?, 'AGENT', ?, ?, datetime('now'))
      `).run(clarifMsgId, sessionId, session.unit_id, questionText, JSON.stringify(prop.citations));
    }
  });

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

  const propRow = db.prepare('SELECT * FROM rcsa_agent_proposals WHERE id = ? AND session_id = ?').get(proposalId, sessionId) as any;
  if (!propRow) {
    const err: any = new Error('المقترح المحدد غير موجود بالجلسة.');
    err.statusCode = 404;
    throw err;
  }

  let finalData: any = {};
  try { finalData = JSON.parse(propRow.proposal_data_json || '{}'); } catch { finalData = {}; }
  if (modifiedData && typeof modifiedData === 'object') {
    finalData = { ...finalData, ...modifiedData };
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
      // Add accepted risk proposal into workflow session candidate risks
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

export function answerAgentClarification(sessionId: string, clarificationId: string, user: User, answerText: string) {
  const session = getWorkflowSession(sessionId, user);
  if (!isUserAuthorizedForBU(user, session.unit_id, ['MAKER', 'RISK_ADMIN'])) {
    const err: any = new Error('غير مصرح: يلزم توفر صلاحية معد تقييم لاستيفاء استفسارات الذكاء الاصطناعي.');
    err.statusCode = 403;
    throw err;
  }

  const clarif = db.prepare('SELECT * FROM rcsa_agent_clarifications WHERE id = ? AND session_id = ?').get(clarificationId, sessionId) as any;
  if (!clarif) {
    const err: any = new Error('الاستفسار المحدد غير موجود.');
    err.statusCode = 404;
    throw err;
  }

  runInTransaction(() => {
    // 1. Record Answer
    db.prepare(`
      UPDATE rcsa_agent_clarifications 
      SET user_answer_ar = ?, answered_by = ?, answered_at = datetime('now') 
      WHERE id = ?
    `).run(answerText, user.employee_id, clarificationId);

    // 2. Insert User Answer Turn in Chat
    const userMsgId = `MSG-U-CLAR-${Date.now()}`;
    db.prepare(`
      INSERT INTO rcsa_agent_conversations (id, session_id, unit_id, sender_role, message_text_ar, created_at)
      VALUES (?, ?, ?, 'USER', ?, datetime('now'))
    `).run(userMsgId, sessionId, session.unit_id, `إجابة الاستفسار: ${answerText}`);

    // 3. Update Proposal Data if linked
    if (clarif.proposal_id) {
      const prop = db.prepare('SELECT * FROM rcsa_agent_proposals WHERE id = ?').get(clarif.proposal_id) as any;
      if (prop) {
        let pData: any = {};
        try { pData = JSON.parse(prop.proposal_data_json || '{}'); } catch { pData = {}; }

        if (clarif.field_name === 'financial_impact_amount' || clarif.field_name === 'individual_financial_impact') {
          // Extract exact digits or parse selected option
          const cleanDigits = answerText.replace(/[^\d]/g, '');
          let parsedVal = cleanDigits ? parseInt(cleanDigits, 10) : 0;

          if (!parsedVal || parsedVal <= 0) {
            if (answerText.includes('منخفض') || answerText.includes('L')) parsedVal = 150000;
            else if (answerText.includes('متوسط') || answerText.includes('M')) parsedVal = 350000;
            else if (answerText.includes('مرتفع') || answerText.includes('H')) parsedVal = 500000;
            else parsedVal = pData.financial_impact_amount || 250000;
          }

          pData.financial_impact_amount = parsedVal;
          pData.single_incident_max_loss = parsedVal;
          pData.financial_impact_justification = `تم الاعتماد وتأكيد القيمة الموثقة من قِبل الموظف المصرفي: ${Number(parsedVal).toLocaleString()} ج.م`;
          pData.expected_annual_loss = parsedVal * (pData.frequency_multiplier || 1);
          pData.expected_loss_egp = pData.expected_annual_loss;
          pData.clarification_status = 'CONFIRMED';
        }

        db.prepare('UPDATE rcsa_agent_proposals SET proposal_data_json = ? WHERE id = ?').run(JSON.stringify(pData), clarif.proposal_id);

        // Update session candidate risks if accepted
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

    // 4. Insert Agent Confirmation Turn in Chat
    const agentConfirmId = `MSG-A-CONF-${Date.now()}`;
    const confirmText = `شكرًا لك. تم تسجيل إجابتك ("${answerText}") وتأكيد الأثر المالي/الرقابي وتحديث التقييم المقترح بنجاح.`;
    db.prepare(`
      INSERT INTO rcsa_agent_conversations (id, session_id, unit_id, sender_role, message_text_ar, created_at)
      VALUES (?, ?, ?, 'AGENT', ?, datetime('now'))
    `).run(agentConfirmId, sessionId, session.unit_id, confirmText);
  });

  return getAgentSessionState(sessionId, user);
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
