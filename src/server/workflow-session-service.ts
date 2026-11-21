import { db, runInTransaction } from './db.js';
import { User } from '../types/index.js';
import { isUserAuthorizedForBU } from './auth.js';
import { logAuditEvent } from './audit.js';
import { formatArabicDateTime } from '../utils/dateFormat.js';
import { ensureAssessmentPackagesPopulated } from './hitl-service.js';

export interface WorkflowSessionRecord {
  id: string;
  unit_id: string;
  workflow_mode: 'NEW' | 'UPDATE';
  base_assessment_id: string | null;
  draft_assessment_id: string | null;
  session_title: string;
  current_step: number;
  use_historical_sources: number;
  uploaded_document_ids_json: string;
  candidate_risks_json: string;
  calc_preview_json: string | null;
  selected_model_profile?: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface EnrichedWorkflowSession {
  id: string;
  unit_id: string;
  workflow_mode: 'NEW' | 'UPDATE';
  base_assessment_id: string | null;
  draft_assessment_id: string | null;
  session_title: string;
  current_step: number;
  use_historical_sources: boolean;
  uploaded_document_ids: string[];
  candidate_risks: any[];
  calc_preview: any | null;
  selected_model_profile: 'qwen-0.5b' | 'qwen-4b';
  created_by: string;
  created_at: string;
  created_at_ar: string;
  updated_at: string;
  updated_at_ar: string;
  unit: {
    id: string;
    name_ar: string;
    name_en: string;
    code: string;
  };
  base_assessment?: {
    id: string;
    title: string;
    version_number: number;
    status: string;
    approved_at?: string;
    approved_at_ar?: string;
  } | null;
  draft_assessment?: {
    id: string;
    title: string;
    version_number: number;
    status: string;
    workflow_status?: string;
  } | null;
  session_documents: any[];
}

export function createWorkflowSession(params: {
  unitId: string;
  user: User;
  workflowMode: 'NEW' | 'UPDATE';
  baseAssessmentId?: string;
  sessionTitle?: string;
  useHistoricalSources?: boolean;
}): EnrichedWorkflowSession {
  const { unitId, user, workflowMode } = params;

  if (!isUserAuthorizedForBU(user, unitId, ['MAKER', 'RISK_ADMIN'])) {
    const err: any = new Error(`غير مصرح: يلزم توفر صلاحية معد تقييم (MAKER) على الوحدة (${unitId}) لإنشاء جلسة عمل.`);
    err.statusCode = 403;
    throw err;
  }

  const unit = db.prepare('SELECT id, name_ar, name_en, code FROM business_units WHERE id = ?').get(unitId) as any;
  if (!unit) {
    const err: any = new Error('الوحدة التنظيمية المحددة غير موجودة.');
    err.statusCode = 404;
    throw err;
  }

  let baseAssessmentId = params.baseAssessmentId || null;
  let candidateRisks: any[] = [];

  if (workflowMode === 'UPDATE') {
    // In UPDATE mode, find the chosen baseline or latest approved assessment
    if (!baseAssessmentId) {
      const latestApproved = db.prepare(`
        SELECT id FROM rcsa_assessments 
        WHERE unit_id = ? AND status = 'APPROVED'
        ORDER BY version_number DESC, approved_at DESC LIMIT 1
      `).get(unitId) as { id: string } | undefined;
      baseAssessmentId = latestApproved?.id || null;
    }

    if (baseAssessmentId) {
      const baseAsm = db.prepare('SELECT id, unit_id, status, title FROM rcsa_assessments WHERE id = ?').get(baseAssessmentId) as any;
      if (!baseAsm || baseAsm.unit_id !== unitId) {
        const err: any = new Error('التقييم السابق المحدد لا يتبع هذه الوحدة التنظيمية.');
        err.statusCode = 400;
        throw err;
      }
      try {
        ensureAssessmentPackagesPopulated(baseAssessmentId);
      } catch {}

      // Preload baseline risks as editable candidate risks from hitl_risk_packages
      const pkgs = db.prepare(`
        SELECT risk_id, current_draft_input_json, calculated_output_json 
        FROM hitl_risk_packages 
        WHERE assessment_id = ? 
        ORDER BY display_order ASC, risk_id ASC
      `).all(baseAssessmentId) as Array<{ risk_id: string; current_draft_input_json: string; calculated_output_json: string }>;

      candidateRisks = pkgs.map(p => {
        try {
          const draft = JSON.parse(p.current_draft_input_json);
          const calc = JSON.parse(p.calculated_output_json || '{}');
          return {
            risk_id: p.risk_id,
            process_name_ar: draft.process_name || unit.name_ar,
            subprocess_name_ar: draft.risk_library_name || '',
            risk_title_ar: draft.risk_library_name || draft.process_name || p.risk_id,
            description_ar: draft.risk_description || '',
            expected_loss_egp: draft.individual_financial_impact ?? null,
            frequency_score: calc.normalized_frequency_level ?? null,
            expected_frequency_text: draft.expected_frequency_text || null,
            strategic_objective: draft.strategic_objective || '',
            loss_Notes_ar: draft.financial_evidence_justification || '',
            frequency_notes_ar: draft.frequency_justification || '',
            taxonomy_l1_ar: draft.taxonomy_l1_ar || '',
            controls: (draft.controls || []).map((c: any) => ({
              control_id: c.control_id,
              description_ar: c.control_description || '',
              design_classification: c.control_type_raw || null,
              automation_level: c.control_method_raw || null,
              implementation_status: c.implementation_status || 'IMPLEMENTED',
              scope_relevance: c.eligible_for_scope_override === false ? 'EXCLUDED' : 'ELIGIBLE',
              effectiveness_raw: c.effectiveness_raw || 'ضابط رقابي فعال',
              control_owner: c.control_owner || '',
              control_frequency_raw: c.control_frequency_raw || '',
            })),
            current_draft_input: draft,
          };
        } catch {
          return null;
        }
      }).filter(Boolean);
    }
  } else {
    // In NEW mode: strictly DO NOT copy unrelated historical risks
    baseAssessmentId = null;
    candidateRisks = [];
  }

  const sessionId = `SES-${unit.code}-${Date.now().toString(36).toUpperCase()}`;
  const defaultTitle = workflowMode === 'UPDATE'
    ? `تحديث تقييم المخاطر التشغيلية - ${unit.name_ar}`
    : `تقييم جديد للمخاطر التشغيلية - ${unit.name_ar}`;
  const sessionTitle = (params.sessionTitle || defaultTitle).trim();
  const useHistorical = workflowMode === 'UPDATE' ? 1 : (params.useHistoricalSources ? 1 : 0);

  db.prepare(`
    INSERT INTO rcsa_workflow_sessions (
      id, unit_id, workflow_mode, base_assessment_id, draft_assessment_id,
      session_title, current_step, use_historical_sources,
      uploaded_document_ids_json, candidate_risks_json, calc_preview_json,
      created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, NULL, ?, 1, ?, '[]', ?, NULL, ?, datetime('now'), datetime('now'))
  `).run(
    sessionId,
    unitId,
    workflowMode,
    baseAssessmentId,
    sessionTitle,
    useHistorical,
    JSON.stringify(candidateRisks),
    user.employee_id
  );

  logAuditEvent({
    userId: user.employee_id,
    userRole: user.roles[0]?.role || 'MAKER',
    unitId,
    entityType: 'RCSA_SESSION',
    entityId: sessionId,
    action: 'CREATE_WORKFLOW_SESSION',
    afterState: { id: sessionId, unitId, workflowMode, baseAssessmentId, sessionTitle },
    changeSummary: `بدء جلسة عمل RCSA موحدة (${workflowMode === 'NEW' ? 'تقييم جديد' : 'تحديث تقييم'}) للوحدة ${unit.name_ar}`,
  });

  return getWorkflowSession(sessionId, user);
}

export function getWorkflowSession(sessionId: string, user: User): EnrichedWorkflowSession {
  const row = db.prepare('SELECT * FROM rcsa_workflow_sessions WHERE id = ?').get(sessionId) as WorkflowSessionRecord | undefined;
  if (!row) {
    const err: any = new Error('جلسة العمل غير موجودة.');
    err.statusCode = 404;
    throw err;
  }

  if (!isUserAuthorizedForBU(user, row.unit_id)) {
    const err: any = new Error(`غير مصرح: لا تملك حق الوصول إلى جلسة الوحدة (${row.unit_id}).`);
    err.statusCode = 403;
    throw err;
  }

  const unit = db.prepare('SELECT id, name_ar, name_en, code FROM business_units WHERE id = ?').get(row.unit_id) as any;

  let baseAsm: any = null;
  if (row.base_assessment_id) {
    baseAsm = db.prepare('SELECT id, title, version_number, status, approved_at FROM rcsa_assessments WHERE id = ?').get(row.base_assessment_id) as any;
    if (baseAsm) {
      baseAsm.approved_at_ar = baseAsm.approved_at ? formatArabicDateTime(baseAsm.approved_at) : undefined;
    }
  }

  let draftAsm: any = null;
  if (row.draft_assessment_id) {
    draftAsm = db.prepare('SELECT id, title, version_number, status FROM rcsa_assessments WHERE id = ?').get(row.draft_assessment_id) as any;
    if (draftAsm) {
      const meta = db.prepare('SELECT workflow_status FROM hitl_assessment_meta WHERE assessment_id = ?').get(row.draft_assessment_id) as any;
      draftAsm.workflow_status = meta?.workflow_status || draftAsm.status;
    }
  }

  let uploadedDocIds: string[] = [];
  try {
    uploadedDocIds = JSON.parse(row.uploaded_document_ids_json || '[]');
  } catch {
    uploadedDocIds = [];
  }

  let sessionDocs: any[] = [];
  if (uploadedDocIds.length > 0) {
    const placeholders = uploadedDocIds.map(() => '?').join(',');
    sessionDocs = db.prepare(`
      SELECT d.*, u.full_name as uploader_name,
             (SELECT count(*) FROM document_chunks dc WHERE dc.document_id = d.id) as chunks_count
      FROM documents d
      LEFT JOIN users u ON d.uploaded_by = u.employee_id
      WHERE d.id IN (${placeholders})
      ORDER BY d.uploaded_at DESC
    `).all(...uploadedDocIds) as any[];

    sessionDocs = sessionDocs.map(d => {
      const docChunks = db.prepare(`
        SELECT id, chunk_index, section_title, content_text, page_number
        FROM document_chunks
        WHERE document_id = ?
        ORDER BY chunk_index ASC
      `).all(d.id) as any[];
      const rawName = d.filename ? d.filename.split('/').pop()?.split('\\').pop() || d.id : d.id;
      const cleanTitle = rawName.replace(/^\d+_/, '');
      const totalChars = docChunks.reduce((sum, ch) => sum + (ch.content_text?.length || 0), 0);
      return {
        ...d,
        title_ar: cleanTitle,
        doc_type: d.file_type,
        uploaded_at_ar: formatArabicDateTime(d.uploaded_at),
        chunks_count: Number(d.chunks_count || docChunks.length || 0),
        total_chars: totalChars,
        chunks: docChunks,
      };
    });
  }

  let candidateRisks: any[] = [];
  try {
    candidateRisks = JSON.parse(row.candidate_risks_json || '[]');
  } catch {
    candidateRisks = [];
  }

  let calcPreview: any = null;
  try {
    calcPreview = row.calc_preview_json ? JSON.parse(row.calc_preview_json) : null;
  } catch {
    calcPreview = null;
  }

  return {
    id: row.id,
    unit_id: row.unit_id,
    workflow_mode: row.workflow_mode,
    base_assessment_id: row.base_assessment_id,
    draft_assessment_id: row.draft_assessment_id,
    session_title: row.session_title,
    current_step: row.current_step,
    use_historical_sources: Boolean(row.use_historical_sources),
    uploaded_document_ids: uploadedDocIds,
    candidate_risks: candidateRisks,
    calc_preview: calcPreview,
    selected_model_profile: row.selected_model_profile === 'qwen-0.5b' ? 'qwen-0.5b' : 'qwen-4b',
    created_by: row.created_by,
    created_at: row.created_at,
    created_at_ar: formatArabicDateTime(row.created_at),
    updated_at: row.updated_at,
    updated_at_ar: formatArabicDateTime(row.updated_at),
    unit,
    base_assessment: baseAsm,
    draft_assessment: draftAsm,
    session_documents: sessionDocs,
  };
}

export function getActiveWorkflowSession(unitId: string, user: User): EnrichedWorkflowSession | null {
  if (!isUserAuthorizedForBU(user, unitId)) {
    return null;
  }

  const latest = db.prepare(`
    SELECT id FROM rcsa_workflow_sessions 
    WHERE unit_id = ? AND created_by = ?
    ORDER BY updated_at DESC, id DESC LIMIT 1
  `).get(unitId, user.employee_id) as { id: string } | undefined;

  if (!latest) {
    // Check if there is any active session for this unit
    const anyLatest = db.prepare(`
      SELECT id FROM rcsa_workflow_sessions 
      WHERE unit_id = ?
      ORDER BY updated_at DESC, id DESC LIMIT 1
    `).get(unitId) as { id: string } | undefined;

    if (!anyLatest) return null;
    return getWorkflowSession(anyLatest.id, user);
  }

  return getWorkflowSession(latest.id, user);
}

export function updateWorkflowSession(
  sessionId: string,
  user: User,
  patch: {
    current_step?: number;
    session_title?: string;
    candidate_risks?: any[];
    calc_preview?: any;
    draft_assessment_id?: string;
    uploaded_document_ids?: string[];
    use_historical_sources?: boolean;
    selected_model_profile?: 'qwen-0.5b' | 'qwen-4b' | string;
  }
): EnrichedWorkflowSession {
  const session = db.prepare('SELECT * FROM rcsa_workflow_sessions WHERE id = ?').get(sessionId) as WorkflowSessionRecord | undefined;
  if (!session) {
    const err: any = new Error('جلسة العمل غير موجودة.');
    err.statusCode = 404;
    throw err;
  }

  if (!isUserAuthorizedForBU(user, session.unit_id, ['MAKER', 'RISK_ADMIN'])) {
    const err: any = new Error('غير مصرح بتعديل جلسة التقييم لهذه الوحدة.');
    err.statusCode = 403;
    throw err;
  }

  const currentStep = patch.current_step !== undefined ? Math.max(1, Math.min(6, patch.current_step)) : session.current_step;
  const sessionTitle = patch.session_title !== undefined ? patch.session_title.trim() : session.session_title;
  const draftAssessmentId = patch.draft_assessment_id !== undefined ? patch.draft_assessment_id : session.draft_assessment_id;
  const useHistorical = patch.use_historical_sources !== undefined ? (patch.use_historical_sources ? 1 : 0) : session.use_historical_sources;
  const selectedModelProfile =
    patch.selected_model_profile !== undefined
      ? (patch.selected_model_profile === 'qwen-0.5b' ? 'qwen-0.5b' : 'qwen-4b')
      : (session.selected_model_profile === 'qwen-0.5b' ? 'qwen-0.5b' : 'qwen-4b');

  let candRisksJson = session.candidate_risks_json;
  if (patch.candidate_risks !== undefined) {
    candRisksJson = JSON.stringify(patch.candidate_risks);
  }

  let calcPreviewJson = session.calc_preview_json;
  if (patch.calc_preview !== undefined) {
    calcPreviewJson = patch.calc_preview ? JSON.stringify(patch.calc_preview) : null;
  }

  let uploadedDocIdsJson = session.uploaded_document_ids_json;
  if (patch.uploaded_document_ids !== undefined) {
    uploadedDocIdsJson = JSON.stringify(patch.uploaded_document_ids);
  }

  db.prepare(`
    UPDATE rcsa_workflow_sessions
    SET current_step = ?,
        session_title = ?,
        draft_assessment_id = ?,
        use_historical_sources = ?,
        candidate_risks_json = ?,
        calc_preview_json = ?,
        uploaded_document_ids_json = ?,
        selected_model_profile = ?,
        updated_at = datetime('now')
    WHERE id = ?
  `).run(
    currentStep,
    sessionTitle,
    draftAssessmentId,
    useHistorical,
    candRisksJson,
    calcPreviewJson,
    uploadedDocIdsJson,
    selectedModelProfile,
    sessionId
  );

  return getWorkflowSession(sessionId, user);
}

export function linkDocumentToWorkflowSession(sessionId: string, documentId: string, user: User) {
  const session = db.prepare('SELECT * FROM rcsa_workflow_sessions WHERE id = ?').get(sessionId) as WorkflowSessionRecord | undefined;
  if (!session) return;

  if (!isUserAuthorizedForBU(user, session.unit_id, ['MAKER', 'RISK_ADMIN'])) {
    return;
  }

  let list: string[] = [];
  try {
    list = JSON.parse(session.uploaded_document_ids_json || '[]');
  } catch {
    list = [];
  }

  if (!list.includes(documentId)) {
    list.push(documentId);
    db.prepare(`
      UPDATE rcsa_workflow_sessions 
      SET uploaded_document_ids_json = ?, updated_at = datetime('now') 
      WHERE id = ?
    `).run(JSON.stringify(list), sessionId);
  }

  try {
    db.prepare('UPDATE documents SET session_id = ? WHERE id = ?').run(sessionId, documentId);
  } catch {}

  return getWorkflowSession(sessionId, user);
}

export function unlinkDocumentFromWorkflowSession(sessionId: string, documentId: string, user: User) {
  const session = db.prepare('SELECT * FROM rcsa_workflow_sessions WHERE id = ?').get(sessionId) as WorkflowSessionRecord | undefined;
  if (!session) {
    const err: any = new Error('جلسة العمل غير موجودة.');
    err.statusCode = 404;
    throw err;
  }

  if (!isUserAuthorizedForBU(user, session.unit_id, ['MAKER', 'RISK_ADMIN'])) {
    const err: any = new Error('غير مصرح بتعديل مستندات جلسة العمل.');
    err.statusCode = 403;
    throw err;
  }

  let list: string[] = [];
  try {
    list = JSON.parse(session.uploaded_document_ids_json || '[]');
  } catch {
    list = [];
  }

  const updatedList = list.filter(id => id !== documentId);

  db.prepare(`
    UPDATE rcsa_workflow_sessions 
    SET uploaded_document_ids_json = ?, updated_at = datetime('now') 
    WHERE id = ?
  `).run(JSON.stringify(updatedList), sessionId);

  try {
    db.prepare('UPDATE documents SET session_id = NULL WHERE id = ? AND session_id = ?').run(documentId, sessionId);
  } catch {}

  return getWorkflowSession(sessionId, user);
}
