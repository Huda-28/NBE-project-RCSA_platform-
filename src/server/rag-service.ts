import { db } from './db.js';

export interface CitationReference {
  document_id: string;
  chunk_id?: string;
  title_ar: string;
  file_name: string;
  section_title?: string;
  quote_text: string;
  page_number?: number;
  doc_type: string;
}

export interface RagContextBundle {
  unit: {
    id: string;
    name_ar: string;
    code: string;
  };
  session_documents: Array<{
    id: string;
    title_ar: string;
    file_name: string;
    doc_type: string;
    chunks: Array<{
      id: string;
      chunk_index: number;
      section_title?: string;
      content_text: string;
      page_number?: number;
    }>;
  }>;
  incidents: any[];
  audit_findings: any[];
  baseline_risks: any[];
  taxonomy_l1: any[];
  esg_pillars: any[];
}

export function assembleRagContextBundle(sessionId: string, unitId: string): RagContextBundle {
  const unit = db.prepare('SELECT id, name_ar, code FROM business_units WHERE id = ?').get(unitId) as any || {
    id: unitId,
    name_ar: unitId,
    code: unitId,
  };

  const sessionRow = db.prepare('SELECT uploaded_document_ids_json, base_assessment_id FROM rcsa_workflow_sessions WHERE id = ?').get(sessionId) as any;

  let uploadedDocIds: string[] = [];
  try {
    uploadedDocIds = JSON.parse(sessionRow?.uploaded_document_ids_json || '[]');
  } catch {
    uploadedDocIds = [];
  }

  // Fetch session documents
  let docs: any[] = [];
  if (uploadedDocIds.length > 0) {
    const placeholders = uploadedDocIds.map(() => '?').join(',');
    docs = db.prepare(`SELECT * FROM documents WHERE id IN (${placeholders})`).all(...uploadedDocIds) as any[];
  } else {
    docs = db.prepare('SELECT * FROM documents WHERE session_id = ? OR unit_id = ? LIMIT 10').all(sessionId, unitId) as any[];
  }

  const session_documents = docs.map((d: any) => {
    const chunks = db.prepare('SELECT id, chunk_index, section_title, content_text, page_number FROM document_chunks WHERE document_id = ? ORDER BY chunk_index ASC').all(d.id) as any[];
    return {
      id: d.id,
      title_ar: d.filename || d.id,
      file_name: d.filename || `${d.id}.pdf`,
      doc_type: d.file_type || 'SOP',
      chunks,
    };
  });

  // Fetch unit incidents
  let incidents: any[] = [];
  try {
    incidents = db.prepare('SELECT * FROM incidents WHERE unit_id = ? ORDER BY id DESC LIMIT 15').all(unitId) as any[];
  } catch {
    incidents = [];
  }

  // Fetch unit audit findings
  let audit_findings: any[] = [];
  try {
    audit_findings = db.prepare('SELECT * FROM audit_findings WHERE unit_id = ? ORDER BY id DESC LIMIT 15').all(unitId) as any[];
  } catch {
    audit_findings = [];
  }

  // Fetch baseline risks if base_assessment_id exists
  let baseline_risks: any[] = [];
  if (sessionRow?.base_assessment_id) {
    const pkgs = db.prepare(`
      SELECT risk_id, current_draft_input_json, calculated_output_json 
      FROM hitl_risk_packages 
      WHERE assessment_id = ? 
      ORDER BY display_order ASC
    `).all(sessionRow.base_assessment_id) as any[];

    baseline_risks = pkgs.map((p) => {
      try {
        const draft = JSON.parse(p.current_draft_input_json);
        const calc = JSON.parse(p.calculated_output_json || '{}');
        return {
          risk_id: p.risk_id,
          process_name: draft.process_name,
          risk_description: draft.risk_description,
          individual_financial_impact: draft.individual_financial_impact,
          expected_frequency_text: draft.expected_frequency_text,
          controls: draft.controls || [],
          residual_financial_rating: calc.continuous_residual_rating,
        };
      } catch {
        return null;
      }
    }).filter(Boolean);
  }

  // Taxonomy L1 & ESG Reference
  const taxonomy_l1 = [
    { code: 'L1-01', name_ar: 'الاحتيال الداخلي والخارجي' },
    { code: 'L1-02', name_ar: 'الممارسات التوظيفية والسلامة ببيئة العمل' },
    { code: 'L1-03', name_ar: 'العملاء والمنتجات وممارسات الأعمال' },
    { code: 'L1-04', name_ar: 'أضرار الأصول المادية والظروف القاهرة' },
    { code: 'L1-05', name_ar: 'تعطل الأعمال وخردة النظم' },
    { code: 'L1-06', name_ar: 'إدارة العمليات والتنفيذ وتوثيق المعاملات' },
  ];

  const esg_pillars = [
    { code: 'E', name_ar: 'الاستدامة البيئية والمناخية (Environmental)' },
    { code: 'S', name_ar: 'المسؤولية الاجتماعية والعدالة ببيئة العمل (Social)' },
    { code: 'G', name_ar: 'الحوكمة الضابطة الشفافة والأخلاقيات (Governance)' },
  ];

  return {
    unit: { id: unit.id, name_ar: unit.name_ar, code: unit.code },
    session_documents,
    incidents,
    audit_findings,
    baseline_risks,
    taxonomy_l1,
    esg_pillars,
  };
}

export function searchRelevantCitations(sessionId: string, unitId: string, query: string, topK = 5): CitationReference[] {
  const bundle = assembleRagContextBundle(sessionId, unitId);
  const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
  const citations: Array<CitationReference & { score: number }> = [];

  // Search in session document chunks
  for (const doc of bundle.session_documents) {
    for (const chunk of doc.chunks) {
      const text = chunk.content_text.toLowerCase();
      let matchCount = 0;
      for (const term of terms) {
        if (text.includes(term)) matchCount++;
      }
      if (matchCount > 0 || terms.length === 0) {
        citations.push({
          document_id: doc.id,
          chunk_id: chunk.id,
          title_ar: doc.title_ar,
          file_name: doc.file_name,
          section_title: chunk.section_title || `مقطع رقم ${chunk.chunk_index + 1}`,
          quote_text: chunk.content_text.slice(0, 200),
          page_number: chunk.page_number || 1,
          doc_type: doc.doc_type,
          score: matchCount + 1,
        });
      }
    }
  }

  // Search in incidents
  for (const inc of bundle.incidents) {
    const text = `${inc.description || ''} ${inc.cause || ''}`.toLowerCase();
    let matchCount = 0;
    for (const term of terms) {
      if (text.includes(term)) matchCount++;
    }
    if (matchCount > 0 || terms.length === 0) {
      citations.push({
        document_id: `INCIDENT-${inc.id}`,
        title_ar: `حادث تشغيلي: ${inc.event_type || inc.id}`,
        file_name: `سجل الحوادث (${inc.id})`,
        section_title: `خسارة: ${Number(inc.loss_amount_egp || 0).toLocaleString()} جم`,
        quote_text: inc.description || 'حادث تشغيلي مسجل برقم الحادث',
        doc_type: 'INCIDENT_LOG',
        score: matchCount + 2,
      });
    }
  }

  citations.sort((a, b) => b.score - a.score);
  return citations.slice(0, topK).map(({ score, ...c }) => c);
}
