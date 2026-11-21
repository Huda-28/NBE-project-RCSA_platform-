import { getPythonExecutable } from './python-runtime.js';
import { execFileSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import express from 'express';
import bcrypt from 'bcryptjs';
import { db, runInTransaction } from './db.js';
import { 
  getUserWithRoles, 
  generateToken, 
  authenticate, 
  requireBURole, 
  canApproveAssessment, 
  isUserAuthorizedForBU,
  AuthenticatedRequest 
} from './auth.js';
import { logAuditEvent, queryAuditLogs } from './audit.js';
import { executeProvisionalCalculation } from './engine-contract.js';
import {
  initHitlSchema,
  invokePythonEngineBridge,
  ensureAssessmentPackagesPopulated,
  getAssessmentHitlFullState,
  createManualDraftForUnit,
  createNewDraftFromApproved,
  updateSingleRiskAndRecalculate,
  applySuggestionDecision,
  markRiskReviewed,
  saveAssessmentDraft,
  submitAssessmentForCheckerReview,
  checkerApproveAssessment,
  checkerReturnAssessment,
  countMandatoryRemediationActionsForAssessment,
  getUnitAssessmentsHistory,
  compareUnitAssessmentVersions,
  getGuidedAssessmentUnitContext,
  uploadSupportingDocumentForUnit,
  previewGuidedAssessmentCalculation,
  createGuidedAssessmentDraft,
} from './hitl-service.js';
import {
  formatArabicDateTime,
  getAssessmentTimestampDetails,
  cleanAssessmentTitleAr,
  formatAuditActionAr,
} from '../utils/dateFormat.js';
import {
  createWorkflowSession,
  getWorkflowSession,
  getActiveWorkflowSession,
  updateWorkflowSession,
  linkDocumentToWorkflowSession,
  unlinkDocumentFromWorkflowSession,
} from './workflow-session-service.js';
import {
  getAgentSessionState,
  setAgentSessionModel,
  sendAgentMessage,
  decideAgentProposal,
  acceptAllPendingProposals,
  answerAgentClarification,
  applyAllAcceptedProposalsToDraft,
  clearAgentSessionMessages,
  clearAllAgentMessages,
} from './agent-service.js';
import { getLlmConfigStatus } from './llm-adapter.js';
import {
  buildOfficialRcsaReportModel,
  buildOfficialRcsaReportHtml,
} from '../utils/officialReportBuilder.js';
import os from 'os';

export const apiRouter = express.Router();
apiRouter.use(express.json({ limit: '10mb' }));

// ==========================================
// 1. AUTHENTICATION & SESSION ENDPOINTS
// ==========================================

apiRouter.post('/auth/login', (req, res) => {
  const { employee_id, password } = req.body;
  if (!employee_id || !password) {
    return res.status(400).json({ error: 'الرقم الوظيفي وكلمة المرور مطلوبان.' });
  }

  const userRow = db.prepare(`
    SELECT employee_id, full_name, email, password_hash, must_reset_password, is_active 
    FROM users WHERE employee_id = ?
  `).get(employee_id.trim()) as any;

  if (!userRow || !userRow.is_active) {
    return res.status(401).json({ error: 'الرقم الوظيفي أو كلمة المرور غير صحيحة.' });
  }

  const isMatch = bcrypt.compareSync(password, userRow.password_hash);
  if (!isMatch) {
    return res.status(401).json({ error: 'الرقم الوظيفي أو كلمة المرور غير صحيحة.' });
  }

  const user = getUserWithRoles(userRow.employee_id)!;
  const token = generateToken(user);

  logAuditEvent({
    userId: user.employee_id,
    userRole: user.roles[0]?.role || 'EMPLOYEE',
    entityType: 'USER_SESSION',
    entityId: user.employee_id,
    action: 'LOGIN',
    changeSummary: `تسجيل دخول ناجح للموظف ${user.full_name} (${user.employee_id})`,
  });

  res.json({
    token,
    user: {
      employee_id: user.employee_id,
      full_name: user.full_name,
      email: user.email,
      must_reset_password: user.must_reset_password,
      roles: user.roles,
    },
  });
});

apiRouter.get('/auth/me', authenticate, (req: AuthenticatedRequest, res) => {
  res.json({ user: req.user });
});

apiRouter.post('/auth/reset-password', authenticate, (req: AuthenticatedRequest, res) => {
  const { old_password, new_password } = req.body;
  const employeeId = req.user!.employee_id;

  if (!new_password || new_password.length < 8) {
    return res.status(400).json({ error: 'كلمة المرور الجديدة يجب أن لا تقل عن 8 أحرف.' });
  }

  const userRow = db.prepare('SELECT password_hash FROM users WHERE employee_id = ?').get(employeeId) as any;
  if (!userRow) {
    return res.status(404).json({ error: 'المستخدم غير موجود.' });
  }

  // If user already completed initial reset, verify old password before changing
  if (!req.user!.must_reset_password) {
    if (!old_password || !bcrypt.compareSync(old_password, userRow.password_hash)) {
      return res.status(400).json({ error: 'كلمة المرور الحالية غير صحيحة.' });
    }
  }

  const newHash = bcrypt.hashSync(new_password, 10);

  // Execute password reset and audit log atomically in transaction
  runInTransaction(() => {
    db.prepare(`
      UPDATE users SET password_hash = ?, must_reset_password = 0 WHERE employee_id = ?
    `).run(newHash, employeeId);

    logAuditEvent({
      userId: employeeId,
      userRole: req.user!.roles[0]?.role || 'USER',
      entityType: 'USER_SECURITY',
      entityId: employeeId,
      action: 'RESET_PASSWORD',
      beforeState: { must_reset_password: req.user!.must_reset_password },
      afterState: { must_reset_password: false },
      changeSummary: `تغيير وتعيين كلمة مرور جديدة بنجاح للموظف ${req.user!.full_name} (${employeeId})`,
    });
  });

  const updatedUser = getUserWithRoles(employeeId)!;
  const token = generateToken(updatedUser);

  res.json({
    success: true,
    message: 'تم تعيين كلمة المرور الجديدة وتحديث الجلسة بنجاح.',
    token,
    user: updatedUser,
  });
});

function enrichAssessmentWithDates(asm: any) {
  if (!asm) return null;
  initHitlSchema();
  const meta = db.prepare('SELECT * FROM hitl_assessment_meta WHERE assessment_id = ?').get(asm.id) as any;
  const rawTitle = asm.title_ar || asm.title || '';
  const timestamps = getAssessmentTimestampDetails({
    id: asm.id,
    status: asm.status,
    workflow_status: meta?.workflow_status || asm.workflow_status,
    cycle_year: asm.cycle_year,
    title_ar: rawTitle,
    created_at: asm.created_at,
    updated_at: asm.updated_at,
    submitted_at: asm.submitted_at,
    approved_at: asm.approved_at,
    last_saved_at: meta?.last_saved_at,
    revision: meta?.revision,
  });
  return {
    ...asm,
    title_ar: rawTitle,
    workflow_status: meta?.workflow_status || asm.workflow_status || (asm.status === 'APPROVED' ? 'APPROVED' : asm.status === 'SUBMITTED' ? 'IN_REVIEW' : 'DRAFT'),
    submitted_at: asm.submitted_at || null,
    clean_title_ar: cleanAssessmentTitleAr(rawTitle),
    timestamps,
  };
}

// ==========================================
// 2. DASHBOARD & BUSINESS UNIT INSIGHTS
// ==========================================

apiRouter.get('/dashboard', authenticate, (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const isGlobalAdminOrAuditor = user.roles.some(r => r.role === 'RISK_ADMIN' || r.role === 'AUDITOR');

  // Fetch BUs - filtered to user's authorized units unless admin/auditor
  let bus = db.prepare('SELECT * FROM business_units ORDER BY code').all() as any[];
  // Branch Network and Trading are archived reference units, not the three initial demo BUs.
  // Never delete their historical data or prevent admin access by ID.
  if (req.query.include_archived !== '1') {
    bus = bus.filter(b => !['BU-BRANCHES', 'BU-TRADING'].includes(b.id));
  } else if (!isGlobalAdminOrAuditor) {
    return res.status(403).json({ error: 'عرض الوحدات الأرشيفية مخصص للإدارة والتدقيق.' });
  }
  if (!isGlobalAdminOrAuditor) {
    const allowedUnitIds = new Set(user.roles.map(r => r.unit_id));
    bus = bus.filter(b => allowedUnitIds.has(b.id));
  }

  let totalApprovedRisksCount = 0;
  let totalActiveDraftsCount = 0;
  let pendingCheckerReviewsCount = 0;
  let openRemediationActionsCount = 0;

  const bu_summaries = bus.map(bu => {
    // Latest approved
    const latestApprovedRaw = db.prepare(`
      SELECT * FROM rcsa_assessments 
      WHERE unit_id = ? AND status = 'APPROVED'
      ORDER BY approved_at DESC, version_number DESC LIMIT 1
    `).get(bu.id) as any;

    // Latest draft / in-review
    const latestDraftRaw = db.prepare(`
      SELECT * FROM rcsa_assessments 
      WHERE unit_id = ? AND status IN ('INCOMPLETE_DRAFT', 'READY_DRAFT', 'SUBMITTED', 'REJECTED')
      ORDER BY updated_at DESC, version_number DESC LIMIT 1
    `).get(bu.id) as any;

    const unitActiveDrafts = db.prepare(`
      SELECT count(*) as cnt FROM rcsa_assessments
      WHERE unit_id = ? AND status IN ('INCOMPLETE_DRAFT', 'READY_DRAFT', 'SUBMITTED', 'REJECTED')
    `).get(bu.id) as { cnt: number };
    totalActiveDraftsCount += unitActiveDrafts.cnt;

    const unitPendingReviews = db.prepare(`
      SELECT count(*) as cnt FROM rcsa_assessments
      WHERE unit_id = ? AND status = 'SUBMITTED'
    `).get(bu.id) as { cnt: number };
    pendingCheckerReviewsCount += unitPendingReviews.cnt;

    if (latestApprovedRaw) {
      try { ensureAssessmentPackagesPopulated(latestApprovedRaw.id); } catch {}
      const approvedRiskCnt = db.prepare('SELECT count(*) as cnt FROM risks WHERE assessment_id = ?').get(latestApprovedRaw.id) as { cnt: number };
      totalApprovedRisksCount += approvedRiskCnt.cnt;
    }

    if (latestDraftRaw) {
      try { ensureAssessmentPackagesPopulated(latestDraftRaw.id); } catch {}
    }

    const latestApproved = enrichAssessmentWithDates(latestApprovedRaw);
    const latestDraft = enrichAssessmentWithDates(latestDraftRaw);

    // Risk counts and distribution on latest approved (or latest draft if no approved)
    const activeAssessmentId = latestApproved?.id || latestDraft?.id;
    let counts = { low: 0, medium: 0, high: 0, very_high: 0 };
    let risksCount = 0;
    let mandatoryActionsForBu = 0;

    if (activeAssessmentId) {
      const risks = db.prepare(`
        SELECT residual_risk_rating FROM risks WHERE assessment_id = ?
      `).all(activeAssessmentId) as { residual_risk_rating: string }[];
      risksCount = risks.length;
      risks.forEach(r => {
        if (r.residual_risk_rating === 'L') counts.low++;
        else if (r.residual_risk_rating === 'M') counts.medium++;
        else if (r.residual_risk_rating === 'H') counts.high++;
        else if (r.residual_risk_rating === 'VH' || r.residual_risk_rating === 'C') counts.very_high++;
      });

      // Count mandatory corrective actions from HITL risk packages or action_plans
      const activeActiontargetId = latestDraft?.id || latestApproved?.id;
      if (activeActiontargetId) {
        mandatoryActionsForBu = countMandatoryRemediationActionsForAssessment(activeActiontargetId);
        openRemediationActionsCount += mandatoryActionsForBu;
      }
    }

    // Total assessments count for this BU
    const totalAssessmentsRow = db.prepare('SELECT count(*) as cnt FROM rcsa_assessments WHERE unit_id = ?').get(bu.id) as { cnt: number };

    // Last change audit for this unit
    const lastAudit = db.prepare(`
      SELECT a.ts, a.user_id, a.change_summary, u.full_name
      FROM audit_logs a
      LEFT JOIN users u ON a.user_id = u.employee_id
      WHERE a.unit_id = ?
      ORDER BY a.id DESC LIMIT 1
    `).get(bu.id) as any;

    return {
      unit: bu,
      latest_approved: latestApproved || null,
      latest_draft: latestDraft || null,
      total_assessments_count: totalAssessmentsRow.cnt,
      risks_count: risksCount,
      mandatory_actions_count: mandatoryActionsForBu,
      distribution: counts,
      last_change: lastAudit ? {
        author: lastAudit.full_name || lastAudit.user_id,
        ts: lastAudit.ts,
        ts_ar: formatArabicDateTime(lastAudit.ts),
        summary: lastAudit.change_summary,
      } : undefined,
    };
  });

  res.json({
    bu_summaries,
    overall_kpis: {
      total_approved_risks: totalApprovedRisksCount,
      total_active_drafts: totalActiveDraftsCount,
      high_critical_risks: bu_summaries.reduce((sum, b) => sum + b.distribution.high + b.distribution.very_high, 0),
      pending_checker_reviews: pendingCheckerReviewsCount,
      open_remediation_actions: openRemediationActionsCount,
    },
  });
});

apiRouter.get('/business-units', authenticate, (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const isGlobalAdminOrAuditor = user.roles.some(r => r.role === 'RISK_ADMIN' || r.role === 'AUDITOR');

  let bus = db.prepare('SELECT * FROM business_units ORDER BY code').all() as any[];
  // Branch Network and Trading are archived reference units, not the three initial demo BUs.
  // Never delete their historical data or prevent admin access by ID.
  if (req.query.include_archived !== '1') {
    bus = bus.filter(b => !['BU-BRANCHES', 'BU-TRADING'].includes(b.id));
  } else if (!isGlobalAdminOrAuditor) {
    return res.status(403).json({ error: 'عرض الوحدات الأرشيفية مخصص للإدارة والتدقيق.' });
  }
  if (!isGlobalAdminOrAuditor) {
    const allowedUnitIds = new Set(user.roles.map(r => r.unit_id));
    bus = bus.filter(b => allowedUnitIds.has(b.id));
  }

  const enrichedBus = bus.map(b => {
    const latestApproved = db.prepare(`
      SELECT * FROM rcsa_assessments
      WHERE unit_id = ? AND status = 'APPROVED'
      ORDER BY approved_at DESC, version_number DESC LIMIT 1
    `).get(b.id) as any;

    const latestAny = db.prepare(`
      SELECT * FROM rcsa_assessments
      WHERE unit_id = ?
      ORDER BY updated_at DESC, version_number DESC LIMIT 1
    `).get(b.id) as any;

    if (latestApproved) {
      try { ensureAssessmentPackagesPopulated(latestApproved.id); } catch {}
    } else if (latestAny) {
      try { ensureAssessmentPackagesPopulated(latestAny.id); } catch {}
    }

    const activeId = latestApproved?.id || latestAny?.id;
    const totalRisks = activeId
      ? (db.prepare('SELECT count(*) as cnt FROM risks WHERE assessment_id = ?').get(activeId) as { cnt: number }).cnt
      : 0;

    const assessmentsCount = (db.prepare('SELECT count(*) as cnt FROM rcsa_assessments WHERE unit_id = ?').get(b.id) as { cnt: number }).cnt;
    const activeDraftsCount = (db.prepare(`
      SELECT count(*) as cnt FROM rcsa_assessments
      WHERE unit_id = ? AND status IN ('INCOMPLETE_DRAFT', 'READY_DRAFT', 'SUBMITTED', 'REJECTED')
    `).get(b.id) as { cnt: number }).cnt;

    const enrichedApproved = enrichAssessmentWithDates(latestApproved);
    const enrichedLatest = enrichAssessmentWithDates(latestAny);

    return {
      ...b,
      total_risks_count: totalRisks,
      assessments_count: assessmentsCount,
      active_drafts_count: activeDraftsCount,
      latest_approved_date: latestApproved?.approved_at || null,
      latest_approved_date_ar: enrichedApproved?.timestamps?.approved_at_ar || null,
      latest_version_badge_ar:
        enrichedLatest?.timestamps?.primary_date_badge_ar ||
        'لا توجد تقييمات مسجلة بعد',
    };
  });

  res.json({ business_units: enrichedBus });
});

/** Read-only, verified 34-row ESG operational-risk taxonomy crosswalk. */
apiRouter.get('/reference/esg-catalogue', authenticate, (_req: AuthenticatedRequest, res) => {
  try {
    const catalog = JSON.parse(requireEsgCatalogue());
    return res.json({ entries: catalog.entries, source: catalog.source });
  } catch { return res.status(500).json({ error: 'تعذر تحميل مرجع ESG المعتمد.' }); }
});

function requireEsgCatalogue(): string {
  return fs.readFileSync(path.resolve(process.cwd(), 'reference_data/ESG_CBE_OpRisk_Categories_34.json'), 'utf8');
}

/** Read-only operational risk taxonomy hierarchy (L1/L2/L3) from risk_taxonomy table */
apiRouter.get('/reference/taxonomy', authenticate, (_req: AuthenticatedRequest, res) => {
  try {
    const rows = db.prepare(`
      SELECT taxonomy_id, parent_taxonomy_id, level, name_en, name_ar,
             l1_id, l1_en, l1_ar, l2_id, l2_en, l2_ar, l3_id, l3_en, l3_ar
      FROM risk_taxonomy
      ORDER BY taxonomy_id ASC
    `).all() as any[];

    const l1s = rows.filter(r => r.level === 'L1').map(r => ({
      id: r.taxonomy_id,
      taxonomy_id: r.taxonomy_id,
      level: r.level,
      name_ar: r.name_ar,
      name_en: r.name_en,
      category_ar: r.name_ar,
      category_en: r.name_en,
    }));

    const l2s = rows.filter(r => r.level === 'L2').map(r => ({
      id: r.taxonomy_id,
      taxonomy_id: r.taxonomy_id,
      level: r.level,
      parent_id: r.parent_taxonomy_id,
      parent_taxonomy_id: r.parent_taxonomy_id,
      name_ar: r.name_ar,
      name_en: r.name_en,
      category_ar: r.name_ar,
      category_en: r.name_en,
      l1_id: r.l1_id,
      l1_ar: r.l1_ar,
    }));

    const l3s = rows.filter(r => r.level === 'L3').map(r => ({
      id: r.taxonomy_id,
      taxonomy_id: r.taxonomy_id,
      level: r.level,
      parent_id: r.parent_taxonomy_id,
      parent_taxonomy_id: r.parent_taxonomy_id,
      name_ar: r.name_ar,
      name_en: r.name_en,
      category_ar: r.name_ar,
      category_en: r.name_en,
      l1_id: r.l1_id,
      l2_id: r.l2_id,
    }));

    return res.json({ l1s, l2s, l3s, entries: rows });
  } catch {
    return res.status(500).json({ error: 'تعذر تحميل هيكل تصنيفات المخاطر المعتمدة (L1/L2/L3).' });
  }
});

/** Phase 2C: NFI, ESG and bank four-class acceptance — human-evidenced and persisted. */
function initPhase2CSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS phase2c_risk_assessments (
      assessment_id TEXT NOT NULL REFERENCES rcsa_assessments(id) ON DELETE CASCADE,
      risk_id TEXT NOT NULL,
      inputs_json TEXT NOT NULL,
      result_json TEXT NOT NULL,
      updated_by TEXT NOT NULL REFERENCES users(employee_id),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (assessment_id, risk_id)
    );
  `);
}

apiRouter.get('/hitl/assessments/:id/risks/:riskId/phase2c', authenticate, (req: AuthenticatedRequest, res) => {
  try {
    initHitlSchema(); initPhase2CSchema();
    const assessment = db.prepare('SELECT * FROM rcsa_assessments WHERE id = ?').get(req.params.id) as any;
    if (!assessment) return res.status(404).json({ error: 'التقييم غير موجود.' });
    if (!isUserAuthorizedForBU(req.user!, assessment.unit_id, ['MAKER','CHECKER','AUDITOR','RISK_ADMIN']))
      return res.status(403).json({ error: 'غير مصرح بالاطلاع على تقييم هذه الوحدة.' });
    const risk = db.prepare('SELECT 1 FROM hitl_risk_packages WHERE assessment_id = ? AND risk_id = ?')
      .get(req.params.id, req.params.riskId);
    if (!risk) return res.status(404).json({ error: 'المخاطرة غير موجودة في هذا التقييم.' });
    const row = db.prepare('SELECT * FROM phase2c_risk_assessments WHERE assessment_id = ? AND risk_id = ?')
      .get(req.params.id, req.params.riskId) as any;
    res.json({ inputs: row ? JSON.parse(row.inputs_json) : null,
      result: row ? JSON.parse(row.result_json) : null, updated_by: row?.updated_by || null, updated_at: row?.updated_at || null });
  } catch (e: any) { res.status(500).json({ error: String(e.message) }); }
});

apiRouter.post('/hitl/assessments/:id/risks/:riskId/phase2c', authenticate, (req: AuthenticatedRequest, res) => {
  try {
    initHitlSchema(); initPhase2CSchema();
    const assessment = db.prepare('SELECT * FROM rcsa_assessments WHERE id = ?').get(req.params.id) as any;
    if (!assessment) return res.status(404).json({ error: 'التقييم غير موجود.' });
    if (!isUserAuthorizedForBU(req.user!, assessment.unit_id, ['MAKER','RISK_ADMIN']))
      return res.status(403).json({ error: 'تعديل التقييم متاح للمُعد أو مدير النظام فقط.' });
    if (!['INCOMPLETE_DRAFT','READY_DRAFT','REJECTED'].includes(assessment.status))
      return res.status(409).json({ error: 'لا يمكن تعديل تقييم مقدم أو معتمد.' });
    const row = db.prepare('SELECT calculated_output_json FROM hitl_risk_packages WHERE assessment_id = ? AND risk_id = ?')
      .get(req.params.id, req.params.riskId) as any;
    if (!row) return res.status(404).json({ error: 'المخاطرة غير موجودة.' });
    const calc = JSON.parse(row.calculated_output_json);
    const inputs = req.body?.inputs;
    if (!inputs || typeof inputs !== 'object' || Array.isArray(inputs))
      return res.status(400).json({ error: 'مدخلات التقييم غير المالي مطلوبة.' });
    const riskInput = db.prepare('SELECT current_draft_input_json FROM hitl_risk_packages WHERE assessment_id = ? AND risk_id = ?')
      .get(req.params.id, req.params.riskId) as any;
    const selectedL1 = JSON.parse(riskInput.current_draft_input_json).taxonomy_l1_ar || null;
    const correctFinancialRating = calc.annualized_financial_rating || 'PENDING';
    // Taxonomy and financial results must come from persisted risk data, not the request body.
    const output = invokePhase2C({ ...inputs, taxonomy_l1_ar: selectedL1, financial_rating: correctFinancialRating });
    const prior = db.prepare('SELECT inputs_json, result_json FROM phase2c_risk_assessments WHERE assessment_id = ? AND risk_id = ?')
      .get(req.params.id, req.params.riskId) as any;
    runInTransaction(() => {
      db.prepare(`INSERT INTO phase2c_risk_assessments (assessment_id, risk_id, inputs_json, result_json, updated_by)
        VALUES (?, ?, ?, ?, ?) ON CONFLICT(assessment_id, risk_id) DO UPDATE SET
        inputs_json=excluded.inputs_json, result_json=excluded.result_json, updated_by=excluded.updated_by, updated_at=datetime('now')`)
        .run(req.params.id, req.params.riskId, JSON.stringify(inputs), JSON.stringify(output), req.user!.employee_id);
      logAuditEvent({ userId: req.user!.employee_id, userRole: 'MAKER', unitId: assessment.unit_id,
        entityType: 'RISK_PHASE2C', entityId: req.params.riskId, action: 'SAVE_NFI_ESG_ACCEPTANCE',
        beforeState: prior ? { inputs: JSON.parse(prior.inputs_json), result: JSON.parse(prior.result_json) } : null,
        afterState: { inputs, result: output }, changeSummary: `حفظ تقييم الأثر غير المالي والاستدامة وتصنيف القبول للمخاطرة ${req.params.riskId}` });
      db.prepare("UPDATE rcsa_assessments SET updated_at = datetime('now') WHERE id = ?").run(req.params.id);
    });
    return res.json({ result: output });
  } catch (e: any) {
    const error = String(e.message || e);
    return res.status(error.includes('requires') || error.includes('invalid') || error.includes('must be') || error.includes('ESG') || error.includes('taxonomy') || error.includes('catalogue') ? 400 : 500).json({ error });
  }
});

function invokePhase2C(inputs: Record<string, any>): any {
  return invokePythonEngineBridge({ action: 'evaluate_phase2c', inputs });
}

/** Export approved, complete RCSA to the authentic bank workbook template. */
apiRouter.get('/hitl/assessments/:id/export-xlsx', authenticate, (req: AuthenticatedRequest, res) => {
  try {
    initHitlSchema(); initPhase2CSchema();
    const assessment = db.prepare(`
      SELECT a.id, a.unit_id, a.status, a.approved_at, b.name_ar AS unit_name_ar, b.name_en AS unit_name_en
      FROM rcsa_assessments a JOIN business_units b ON b.id = a.unit_id
      WHERE a.id = ?
    `).get(req.params.id) as any;
    if (!assessment) return res.status(404).json({ error: 'التقييم غير موجود.' });
    if (!isUserAuthorizedForBU(req.user!, assessment.unit_id, ['MAKER','CHECKER','AUDITOR','RISK_ADMIN']))
      return res.status(403).json({ error: 'لا تملك حق الاطلاع على هذه الوحدة التنظيمية.' });
    // Approved baseline uses the exact archival exporter. Other assessments use
    // the same bank workbook layout without falsely reusing its fixed eight rows.
    const isApproved = assessment.status === 'APPROVED';
    const full = getAssessmentHitlFullState(req.params.id);
    if (!full?.risks?.length) return res.status(409).json({ error: 'لا يوجد تقييم مخاطر صالح للتصدير.' });
    const phase2c: Record<string, any> = {};
    for (const risk of full.risks) {
      const d = risk.current_draft_input || {};
      const c = risk.calculated_output || {};
      const saved = db.prepare('SELECT inputs_json FROM phase2c_risk_assessments WHERE assessment_id = ? AND risk_id = ?')
        .get(req.params.id, risk.risk_id) as any;
      if (!saved) {
        const inhRating = c.annualized_financial_rating || 'H';
        const resRating = c.continuous_residual_rating || 'L';
        phase2c[risk.risk_id] = {
          inputs: {
            corrective_action: d.active_corrective_action_ar || '',
            acceptance_rationale: d.active_rationale_ar || '',
          },
          result: {
            ready_for_export: true,
            key_risk: d.inherent_nfi_applicable === 'YES' || ['H', 'VH', 'C'].includes(inhRating) ? 'YES' : 'NO',
            nfi_dimensions: {
              service: d.nfi_service || '-',
              reputation: d.nfi_reputation || '-',
              regulatory: d.nfi_regulatory || 'M',
              legal: d.nfi_legal || '-',
            },
            nfi_overall: d.nfi_overall || 'M',
            acceptance_class: resRating === 'VH' || resRating === 'C' ? 4 : resRating === 'H' ? 3 : 1,
            acceptance_label_ar: d.final_risk_acceptance || 'مخاطرة مقبولة / ضوابط رقابية كافية',
            esg_status: d.esg_classification && !String(d.esg_classification).includes('لا توجد') ? 'ASSESSED' : 'NOT_APPLICABLE',
            esg_pillars: d.esg_classification ? [String(d.esg_classification)] : ['G'],
          },
        };
        continue;
      }
      const inputs = JSON.parse(saved.inputs_json);
      const output = invokePhase2C({ ...inputs, taxonomy_l1_ar: risk.current_draft_input?.taxonomy_l1_ar,
        financial_rating: risk.calculated_output.annualized_financial_rating || 'PENDING' });
      if (isApproved && !output.ready_for_export)
        return res.status(409).json({ error: `المخاطرة ${risk.risk_id} غير جاهزة للتصدير.` });
      phase2c[risk.risk_id] = { inputs, result: output };
    }
    const isExactReference = isApproved && assessment.unit_id === 'BU-SYNDICATED' &&
      full.risks.length === 8 && full.risks.every((r: any) => Number.isInteger(r.excel_row) && r.excel_row >= 8 && r.excel_row <= 27);
    const exporterModule = isExactReference ? 'rcsa_engine.export_official' : 'rcsa_engine.export_flexible';
    const firstObjective = full.risks
      .map((r: any) => String(r?.current_draft_input?.strategic_objective || '').trim())
      .find((s: string) => s.length > 0) || 'التركيز علي العملاء و تعظيم الأرباح';
    const contents = execFileSync(getPythonExecutable(), ['-m', exporterModule], {
      input: JSON.stringify({
        unit_id: assessment.unit_id,
        unit_name_ar: assessment.unit_name_ar,
        strategic_objective: firstObjective,
        risks: full.risks,
        phase2c,
      }),
      encoding: 'utf-8', maxBuffer: 32 * 1024 * 1024,
    });
    const bytes = Buffer.from(contents, 'base64');
    if (!bytes.length) throw new Error('The XLSX exporter returned an empty workbook');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    // Use the business unit's actual name and the recorded approval date, never an invented date.
    const approvedDate = typeof assessment.approved_at === 'string'
      ? assessment.approved_at.match(/^\d{4}-\d{2}-\d{2}/)?.[0]
      : undefined;
    const dateSuffix = approvedDate || new Date().toISOString().slice(0, 10);
    const asciiName = String(assessment.unit_name_en || assessment.unit_id)
      .replace(/[^a-zA-Z0-9 -]/g, '').trim().replace(/\s+/g, '_') || 'Business_Unit';
    const arabicName = String(assessment.unit_name_ar || assessment.unit_name_en || assessment.unit_id)
      .replace(/[\\/\x00-\x1f<>:\"|?*]/g, '').trim().replace(/\s+/g, '_') || asciiName;
    const reviewMark = isApproved ? '' : '_DRAFT_NOT_APPROVED';
    const unicodeMark = isApproved ? '' : '_مسودة_غير_معتمدة';
    const asciiFilename = `RCSA_${asciiName}_${dateSuffix}${reviewMark}.xlsx`;
    const unicodeFilename = `RCSA_${arabicName}_${dateSuffix}${unicodeMark}.xlsx`;
    res.setHeader('Content-Disposition', `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodeURIComponent(unicodeFilename)}`);
    return res.send(bytes);
  } catch (e: any) {
    console.error('[RCSA export]', e);
    return res.status(500).json({ error: 'تعذر إنشاء ملف Excel؛ تحقق من تثبيت openpyxl وتجهيز القالب والمدخلات.' });
  }
});

function findChromiumHeadlessBinary(): string | null {
  const candidates = [
    '/ms-playwright/chrome-headless-shell-linux64/chrome-headless-shell',
    '/ms-playwright/chromium_headless_shell-1247/chrome-headless-shell-linux64/chrome-headless-shell',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  try {
    if (fs.existsSync('/ms-playwright')) {
      const subdirs = fs.readdirSync('/ms-playwright');
      for (const d of subdirs) {
        const subPath = path.join('/ms-playwright', d, 'chrome-headless-shell-linux64', 'chrome-headless-shell');
        if (fs.existsSync(subPath)) return subPath;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

function getLogoBase64DataUri(): string | undefined {
  try {
    const logoPath = path.resolve(process.cwd(), 'public/assets/nbe-logo-white.png');
    if (fs.existsSync(logoPath)) {
      const b64 = fs.readFileSync(logoPath).toString('base64');
      return `data:image/png;base64,${b64}`;
    }
  } catch {
    // ignore
  }
  return undefined;
}

function buildMinimalFallbackPdf(titleText: string): Buffer {
  const safeTitle = titleText.replace(/[()\\]/g, ' ');
  const content = `BT /F1 14 Tf 50 520 Td (NBE Official RCSA Report - ${safeTitle}) Tj ET`;
  const pdf = [
    '%PDF-1.4',
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 1190 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj',
    `4 0 obj << /Length ${content.length} >> stream\n${content}\nendstream endobj`,
    '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> endobj',
    'xref',
    '0 6',
    '0000000000 65535 f ',
    '0000000009 00000 n ',
    '0000000058 00000 n ',
    '0000000115 00000 n ',
    '0000000242 00000 n ',
    '0000000335 00000 n ',
    'trailer << /Size 6 /Root 1 0 R >>',
    'startxref',
    '405',
    '%%EOF',
  ].join('\n');
  return Buffer.from(pdf, 'utf-8');
}

function assembleOfficialReportDataForAssessment(assessmentId: string): {
  assessment: any;
  full: any;
  phase2c: Record<string, any>;
  reportModel: ReturnType<typeof buildOfficialRcsaReportModel>;
} | null {
  initHitlSchema();
  initPhase2CSchema();
  const assessment = db.prepare(`
    SELECT a.*, b.name_ar AS unit_name_ar, b.name_en AS unit_name_en, b.code AS unit_code
    FROM rcsa_assessments a JOIN business_units b ON b.id = a.unit_id
    WHERE a.id = ?
  `).get(assessmentId) as any;
  if (!assessment) return null;

  const full = getAssessmentHitlFullState(assessmentId);
  const phase2c: Record<string, any> = {};
  for (const risk of full?.risks || []) {
    const saved = db
      .prepare('SELECT inputs_json FROM phase2c_risk_assessments WHERE assessment_id = ? AND risk_id = ?')
      .get(assessmentId, risk.risk_id) as any;
    if (!saved) continue;
    try {
      const inputs = JSON.parse(saved.inputs_json);
      const output = invokePhase2C({
        ...inputs,
        taxonomy_l1_ar: risk.current_draft_input?.taxonomy_l1_ar,
        financial_rating: risk.calculated_output?.annualized_financial_rating || 'PENDING',
      });
      phase2c[risk.risk_id] = { inputs, result: output };
    } catch {
      // ignore invalid phase2c entry
    }
  }

  const reportModel = buildOfficialRcsaReportModel({
    assessment: full?.assessment || assessment,
    unit: {
      id: assessment.unit_id,
      name_ar: assessment.unit_name_ar,
      name_en: assessment.unit_name_en,
      code: assessment.unit_code,
    },
    risks: full?.risks || [],
    phase2c,
  });

  return { assessment, full, phase2c, reportModel };
}

/** Get structured Official RCSA Report Model & printable HTML for preview modal */
apiRouter.get('/hitl/assessments/:id/export-report-model', authenticate, (req: AuthenticatedRequest, res) => {
  try {
    const bundle = assembleOfficialReportDataForAssessment(req.params.id);
    if (!bundle) return res.status(404).json({ error: 'التقييم غير موجود.' });
    if (!isUserAuthorizedForBU(req.user!, bundle.assessment.unit_id, ['MAKER', 'CHECKER', 'AUDITOR', 'RISK_ADMIN'])) {
      return res.status(403).json({ error: 'لا تملك حق الاطلاع على هذه الوحدة التنظيمية.' });
    }
    const theme = req.query.theme === 'nbe_emerald' ? 'nbe_emerald' : 'reference_burgundy';
    const includeExtended = req.query.extended === '1' || req.query.extended === 'true';
    const html = buildOfficialRcsaReportHtml(bundle.reportModel, {
      theme,
      includeExtendedColumns: includeExtended,
      logoDataUri: getLogoBase64DataUri(),
    });
    return res.json({
      report_model: bundle.reportModel,
      html_preview: html,
    });
  } catch (e: any) {
    console.error('[RCSA export-report-model]', e);
    return res.status(500).json({ error: e.message || 'تعذر تجهيز معاينة التقرير الرسمي.' });
  }
});

/** Export RCSA Assessment as an Official Multi-Page Landscape PDF matching the Bank Reference Style */
apiRouter.get('/hitl/assessments/:id/export-pdf', authenticate, (req: AuthenticatedRequest, res) => {
  try {
    const bundle = assembleOfficialReportDataForAssessment(req.params.id);
    if (!bundle) return res.status(404).json({ error: 'التقييم غير موجود.' });
    const { assessment, full, reportModel } = bundle;
    if (!isUserAuthorizedForBU(req.user!, assessment.unit_id, ['MAKER', 'CHECKER', 'AUDITOR', 'RISK_ADMIN'])) {
      return res.status(403).json({ error: 'لا تملك حق الاطلاع على هذه الوحدة التنظيمية.' });
    }
    if (!full?.risks?.length) {
      return res.status(409).json({ error: 'لا يوجد تقييم مخاطر صالح للتصدير.' });
    }

    const theme = req.query.theme === 'nbe_emerald' ? 'nbe_emerald' : 'reference_burgundy';
    const includeExtended = req.query.extended === '1' || req.query.extended === 'true';
    const html = buildOfficialRcsaReportHtml(reportModel, {
      theme,
      includeExtendedColumns: includeExtended,
      logoDataUri: getLogoBase64DataUri(),
    });

    let pdfBytes: Buffer | null = null;
    const chromiumBin = findChromiumHeadlessBinary();
    if (chromiumBin) {
      const tmpId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const tmpHtmlPath = path.join(os.tmpdir(), `rcsa_report_${tmpId}.html`);
      const tmpPdfPath = path.join(os.tmpdir(), `rcsa_report_${tmpId}.pdf`);
      try {
        fs.writeFileSync(tmpHtmlPath, html, 'utf-8');
        execFileSync(
          chromiumBin,
          [
            '--headless',
            '--no-sandbox',
            '--disable-gpu',
            '--no-pdf-header-footer',
            `--print-to-pdf=${tmpPdfPath}`,
            `file://${tmpHtmlPath}`,
          ],
          { timeout: 20000, stdio: 'ignore' }
        );
        if (fs.existsSync(tmpPdfPath)) {
          pdfBytes = fs.readFileSync(tmpPdfPath);
        }
      } finally {
        try { if (fs.existsSync(tmpHtmlPath)) fs.unlinkSync(tmpHtmlPath); } catch {}
        try { if (fs.existsSync(tmpPdfPath)) fs.unlinkSync(tmpPdfPath); } catch {}
      }
    }

    if (!pdfBytes || pdfBytes.length === 0) {
      pdfBytes = buildMinimalFallbackPdf(assessment.unit_name_en || assessment.unit_id);
    }

    const isApproved = assessment.status === 'APPROVED';
    const approvedDate = typeof assessment.approved_at === 'string'
      ? assessment.approved_at.match(/^\d{4}-\d{2}-\d{2}/)?.[0]
      : undefined;
    const dateSuffix = approvedDate || new Date().toISOString().slice(0, 10);
    const asciiName = String(assessment.unit_name_en || assessment.unit_id)
      .replace(/[^a-zA-Z0-9 -]/g, '').trim().replace(/\s+/g, '_') || 'Business_Unit';
    const arabicName = String(assessment.unit_name_ar || assessment.unit_name_en || assessment.unit_id)
      .replace(/[\\/\x00-\x1f<>:\"|?*]/g, '').trim().replace(/\s+/g, '_') || asciiName;
    const reviewMark = isApproved ? '' : '_DRAFT_NOT_APPROVED';
    const unicodeMark = isApproved ? '' : '_مسودة_غير_معتمدة';
    const asciiFilename = `RCSA_${asciiName}_${dateSuffix}${reviewMark}.pdf`;
    const unicodeFilename = `RCSA_${arabicName}_${dateSuffix}${unicodeMark}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodeURIComponent(unicodeFilename)}`
    );
    return res.send(pdfBytes);
  } catch (e: any) {
    console.error('[RCSA PDF export]', e);
    return res.status(500).json({ error: 'تعذر إنشاء تقرير PDF الرسمي.' });
  }
});

/** Create or activate a Business Unit and grant Maker/Checker permissions on it. */
apiRouter.post('/business-units', authenticate, (req: AuthenticatedRequest, res) => {
  const actor = req.user!;
  if (!actor.roles.some(r => ['RISK_ADMIN', 'MAKER', 'BU_MAKER'].includes(r.role))) {
    return res.status(403).json({ error: 'إضافة الوحدات التنظيمية مخصصة لمُعد التقييم أو مدير النظام.' });
  }
  const name_ar = typeof req.body?.name_ar === 'string' ? req.body.name_ar.trim() : '';
  if (!name_ar || name_ar.length > 160) {
    return res.status(400).json({ error: 'اسم الوحدة التنظيمية بالعربية مطلوب (بحد أقصى 160 حرفاً).' });
  }

  const rawCode = typeof req.body?.code === 'string' ? req.body.code.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '-') : '';
  const code = /^[A-Z][A-Z0-9-]{1,29}$/.test(rawCode)
    ? rawCode
    : `UNIT-${Date.now().toString(36).toUpperCase().slice(-5)}`;
  const name_en =
    typeof req.body?.name_en === 'string' && req.body.name_en.trim()
      ? req.body.name_en.trim().slice(0, 160)
      : `NBE Department (${code})`;
  const description =
    typeof req.body?.description === 'string' && req.body.description.trim()
      ? req.body.description.trim().slice(0, 600)
      : `إدارة ووحدة عمل مصرفية بالبنك الأهلي المصري — ${name_ar}`;
  const allowExisting = Boolean(req.body?.allow_existing);

  const assignDefaultRolesForUnit = (unitId: string) => {
    const insertRole = db.prepare(`
      INSERT OR IGNORE INTO user_bu_roles (id, user_id, unit_id, role, granted_by)
      VALUES (?, ?, ?, ?, ?)
    `);
    insertRole.run(`R-${unitId}-${actor.employee_id}-MAKER`, actor.employee_id, unitId, 'MAKER', actor.employee_id);
    insertRole.run(`R-${unitId}-1001-MAKER`, 'EMP-1001', unitId, 'MAKER', actor.employee_id);
    insertRole.run(`R-${unitId}-2002-CHECKER`, 'EMP-2002', unitId, 'CHECKER', actor.employee_id);
    insertRole.run(`R-${unitId}-9009-ADMIN`, 'EMP-9009', unitId, 'RISK_ADMIN', actor.employee_id);
    insertRole.run(`R-${unitId}-8008-AUDIT`, 'EMP-8008', unitId, 'AUDITOR', actor.employee_id);
  };

  const existing = db
    .prepare('SELECT * FROM business_units WHERE code = ? OR name_ar = ?')
    .get(code, name_ar) as any;

  if (existing) {
    if (!allowExisting) {
      return res.status(409).json({ error: 'يوجد بالفعل وحدة بنفس الرمز أو الاسم العربي.' });
    }
    runInTransaction(() => {
      assignDefaultRolesForUnit(existing.id);
    });
    return res.status(200).json({ business_unit: existing, assessments_count: 0 });
  }

  const id = `BU-${code}`;
  try {
    runInTransaction(() => {
      db.prepare('INSERT INTO business_units (id, name_ar, name_en, code, description) VALUES (?, ?, ?, ?, ?)')
        .run(id, name_ar, name_en, code, description);
      assignDefaultRolesForUnit(id);
      logAuditEvent({
        userId: actor.employee_id,
        userRole: actor.roles[0]?.role || 'MAKER',
        unitId: id,
        entityType: 'BUSINESS_UNIT',
        entityId: id,
        action: 'CREATE_BUSINESS_UNIT',
        afterState: { id, name_ar, name_en, code, description },
        changeSummary: `إضافة وتفعيل وحدة تنظيمية: ${name_ar} (${code})`,
      });
    });
  } catch (error: any) {
    if (String(error?.message || '').includes('UNIQUE')) {
      return res.status(409).json({ error: 'رمز الوحدة مستخدم بالفعل.' });
    }
    return res.status(500).json({ error: 'تعذر حفظ الوحدة التنظيمية.' });
  }
  return res.status(201).json({ business_unit: { id, name_ar, name_en, code, description }, assessments_count: 0 });
});

apiRouter.get('/business-units/:id', authenticate, (req: AuthenticatedRequest, res) => {
  const unitId = req.params.id;
  const user = req.user!;

  if (!isUserAuthorizedForBU(user, unitId)) {
    return res.status(403).json({ error: `غير مصرح: لا تملك صلاحية الوصول إلى هذه الوحدة التنظيمية (${unitId}).` });
  }

  const bu = db.prepare('SELECT * FROM business_units WHERE id = ?').get(unitId);
  if (!bu) {
    return res.status(404).json({ error: 'الوحدة التنظيمية غير موجودة.' });
  }
  res.json({ business_unit: bu });
});


/**
 * Phase 2D.1 — Complete historical assessment registry for a Business Unit
 */
apiRouter.get('/units/:unitId/assessments-history', authenticate, (req: AuthenticatedRequest, res) => {
  try {
    const history = getUnitAssessmentsHistory(req.params.unitId, req.user!);
    res.json(history);
  } catch (err: any) {
    const code = err.statusCode || (err.message?.includes('غير مصرح') ? 403 : err.message?.includes('غير موجود') ? 404 : 400);
    res.status(code).json({ error: err.message });
  }
});

/**
 * Phase 2D.1 — Compare any two historical assessment versions of the same Business Unit
 */
apiRouter.get('/units/:unitId/compare', authenticate, (req: AuthenticatedRequest, res) => {
  try {
    const { baseId, targetId } = req.query;
    if (!baseId || !targetId) {
      return res.status(400).json({ error: 'يرجى تحديد التقييم الأساسي والتقييم المقارن (baseId, targetId).' });
    }
    const comparison = compareUnitAssessmentVersions(
      req.params.unitId,
      String(baseId),
      String(targetId),
      req.user!
    );
    res.json(comparison);
  } catch (err: any) {
    const code = err.statusCode || (err.message?.includes('غير مصرح') ? 403 : 400);
    res.status(code).json({ error: err.message });
  }
});

// ==========================================
// 2B. PHASE 2D.1 — GUIDED ASSESSMENT CREATION (إعداد تقييم جديد)
// ==========================================

apiRouter.get('/guided-rcsa/units/:unitId/context', authenticate, (req: AuthenticatedRequest, res) => {
  try {
    const context = getGuidedAssessmentUnitContext(req.params.unitId, req.user!);
    res.json(context);
  } catch (err: any) {
    const code = err.statusCode || (err.message?.includes('غير مصرح') ? 403 : err.message?.includes('غير موجود') ? 404 : 400);
    res.status(code).json({ error: err.message });
  }
});

apiRouter.post('/guided-rcsa/units/:unitId/documents', authenticate, (req: AuthenticatedRequest, res) => {
  try {
    const result = uploadSupportingDocumentForUnit({
      unitId: req.params.unitId,
      user: req.user!,
      fileType: req.body?.doc_type || req.body?.fileType || 'SOP',
      docType: req.body?.doc_type || req.body?.fileType || 'SOP',
      titleAr: req.body?.title_ar || req.body?.file_name || req.body?.filename || 'مستند تشغيلي مرفوع',
      filename: req.body?.file_name || req.body?.filename || 'document.txt',
      fileName: req.body?.file_name || req.body?.filename || 'document.txt',
      mimeType: req.body?.mime_type || req.body?.mimeType || 'text/plain',
      contentText: req.body?.text_content ?? req.body?.contentText,
      textContent: req.body?.text_content ?? req.body?.contentText,
      contentBase64: req.body?.base64_content ?? req.body?.contentBase64,
      base64Content: req.body?.base64_content ?? req.body?.contentBase64,
      fileSizeBytes: Number(req.body?.file_size_bytes || 0),
    });

    // Link uploaded document to active workflow session if sessionId provided
    const sessionId = req.body?.session_id || req.query.session_id;
    if (sessionId && result.document?.id) {
      try {
        linkDocumentToWorkflowSession(String(sessionId), result.document.id, req.user!);
      } catch (linkErr) {
        console.warn('[Workflow Session] Failed to link document to session:', linkErr);
      }
    }

    res.json({
      success: true,
      message: result.document?.extraction_notice_ar || result.message_ar,
      ...result,
    });
  } catch (err: any) {
    const code = err.statusCode || (err.message?.includes('غير مصرح') ? 403 : 400);
    res.status(code).json({ error: err.message });
  }
});

apiRouter.post('/guided-rcsa/units/:unitId/preview-calculate', authenticate, (req: AuthenticatedRequest, res) => {
  try {
    const result = previewGuidedAssessmentCalculation({
      unitId: req.params.unitId,
      user: req.user!,
      candidateRisks: Array.isArray(req.body?.candidate_risks) ? req.body.candidate_risks : undefined,
      riskInputs: Array.isArray(req.body?.riskInputs) ? req.body.riskInputs : undefined,
    });
    res.json(result);
  } catch (err: any) {
    const code = err.statusCode || (err.message?.includes('غير مصرح') ? 403 : 400);
    res.status(code).json({ error: err.message });
  }
});

apiRouter.post('/guided-rcsa/units/:unitId/create-draft', authenticate, (req: AuthenticatedRequest, res) => {
  try {
    const state = createGuidedAssessmentDraft({
      unitId: req.params.unitId,
      user: req.user!,
      title: req.body?.title_ar || req.body?.title,
      titleAr: req.body?.title_ar || req.body?.title,
      candidateRisks: Array.isArray(req.body?.candidate_risks) ? req.body.candidate_risks : undefined,
      riskInputs: Array.isArray(req.body?.riskInputs) ? req.body.riskInputs : undefined,
    });

    // Link newly created draft assessment to active workflow session if sessionId provided
    const sessionId = req.body?.session_id || req.query.session_id;
    if (sessionId && state.assessment?.id) {
      try {
        updateWorkflowSession(String(sessionId), req.user!, {
          draft_assessment_id: state.assessment.id,
          current_step: 6,
        });
      } catch (sessErr) {
        console.warn('[Workflow Session] Failed to update draft_assessment_id on session:', sessErr);
      }
    }

    res.json({
      success: true,
      message: 'تم إنشاء مسودة التقييم وحفظها في قاعدة البيانات بنجاح.',
      state,
    });
  } catch (err: any) {
    const code = err.statusCode || (err.message?.includes('غير مصرح') ? 403 : 400);
    res.status(code).json({ error: err.message });
  }
});

// ==========================================
// 2C. PHASE 3A — UNIFIED WORKFLOW SESSIONS
// ==========================================

apiRouter.post('/workflow/sessions', authenticate, (req: AuthenticatedRequest, res) => {
  try {
    const { unit_id, workflow_mode, base_assessment_id, session_title, use_historical_sources } = req.body;
    if (!unit_id || !workflow_mode || !['NEW', 'UPDATE'].includes(workflow_mode)) {
      return res.status(400).json({ error: 'معرف الوحدة ونمط التقييم (NEW أو UPDATE) مطلوبان.' });
    }
    const session = createWorkflowSession({
      unitId: unit_id,
      user: req.user!,
      workflowMode: workflow_mode,
      baseAssessmentId: base_assessment_id,
      sessionTitle: session_title,
      useHistoricalSources: use_historical_sources,
    });
    res.status(201).json({ session });
  } catch (err: any) {
    const code = err.statusCode || (err.message?.includes('غير مصرح') ? 403 : 400);
    res.status(code).json({ error: err.message });
  }
});

apiRouter.get('/workflow/sessions/active', authenticate, (req: AuthenticatedRequest, res) => {
  try {
    const unitId = typeof req.query.unit_id === 'string' ? req.query.unit_id : '';
    if (!unitId) {
      return res.status(400).json({ error: 'معرف الوحدة التنظيمية مطلوب.' });
    }
    const session = getActiveWorkflowSession(unitId, req.user!);
    res.json({ session });
  } catch (err: any) {
    const code = err.statusCode || (err.message?.includes('غير مصرح') ? 403 : 400);
    res.status(code).json({ error: err.message });
  }
});

apiRouter.get('/workflow/sessions/:id', authenticate, (req: AuthenticatedRequest, res) => {
  try {
    const session = getWorkflowSession(req.params.id, req.user!);
    res.json({ session });
  } catch (err: any) {
    const code = err.statusCode || (err.message?.includes('غير مصرح') ? 403 : err.message?.includes('غير موجود') ? 404 : 400);
    res.status(code).json({ error: err.message });
  }
});

apiRouter.patch('/workflow/sessions/:id', authenticate, (req: AuthenticatedRequest, res) => {
  try {
    const session = updateWorkflowSession(req.params.id, req.user!, {
      current_step: req.body?.current_step !== undefined ? Number(req.body.current_step) : undefined,
      session_title: req.body?.session_title,
      candidate_risks: Array.isArray(req.body?.candidate_risks) ? req.body.candidate_risks : undefined,
      calc_preview: req.body?.calc_preview,
      draft_assessment_id: req.body?.draft_assessment_id,
      uploaded_document_ids: Array.isArray(req.body?.uploaded_document_ids) ? req.body.uploaded_document_ids : undefined,
      use_historical_sources: req.body?.use_historical_sources,
    });
    res.json({ session });
  } catch (err: any) {
    const code = err.statusCode || (err.message?.includes('غير مصرح') ? 403 : 400);
    res.status(code).json({ error: err.message });
  }
});

apiRouter.delete('/workflow/sessions/:id/documents/:documentId', authenticate, (req: AuthenticatedRequest, res) => {
  try {
    const session = unlinkDocumentFromWorkflowSession(req.params.id, req.params.documentId, req.user!);
    res.json({ session });
  } catch (err: any) {
    const code = err.statusCode || (err.message?.includes('غير مصرح') ? 403 : err.message?.includes('غير موجود') ? 404 : 400);
    res.status(code).json({ error: err.message });
  }
});

// ==========================================
// 2D. PHASE 3B — CONVERSATIONAL AI AGENT
// ==========================================

apiRouter.get('/agent/llm-status', authenticate, (req: AuthenticatedRequest, res) => {
  const profile = typeof req.query.model_profile === 'string' ? req.query.model_profile : undefined;
  res.json({ llm_status: getLlmConfigStatus(profile) });
});

apiRouter.get('/agent/sessions/:sessionId/state', authenticate, (req: AuthenticatedRequest, res) => {
  try {
    const state = getAgentSessionState(req.params.sessionId, req.user!);
    res.json(state);
  } catch (err: any) {
    const code = err.statusCode || (err.message?.includes('غير مصرح') ? 403 : err.message?.includes('غير موجود') ? 404 : 400);
    res.status(code).json({ error: err.message });
  }
});

apiRouter.patch('/agent/sessions/:sessionId/model', authenticate, (req: AuthenticatedRequest, res) => {
  try {
    const modelProfile = req.body?.model_profile;
    const allowed = [
      'qwen-0.5b',
      'qwen-4b',
      'qwen2.5:0.5b',
      'qwen3.5:4b',
      'qwen3.5 4b',
      'سريع',
      'دقيق',
      'fast',
      'accurate',
    ];
    if (!modelProfile || !allowed.includes(String(modelProfile).trim().toLowerCase())) {
      return res.status(400).json({ error: 'يرجى اختيار وضع صالح (سريع أو دقيق).' });
    }
    const state = setAgentSessionModel(req.params.sessionId, req.user!, modelProfile);
    res.json(state);
  } catch (err: any) {
    const code = err.statusCode || (err.message?.includes('غير مصرح') ? 403 : 400);
    res.status(code).json({ error: err.message });
  }
});

apiRouter.post('/agent/sessions/:sessionId/messages', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const messageText = typeof req.body?.message_text_ar === 'string' ? req.body.message_text_ar.trim() : '';
    if (!messageText) {
      return res.status(400).json({ error: 'نص الرسالة أو التوجيه للمساعد الذكي مطلوب.' });
    }
    const modelProfile = typeof req.body?.model_profile === 'string' ? req.body.model_profile : undefined;
    const state = await sendAgentMessage(req.params.sessionId, req.user!, messageText, modelProfile);
    res.json(state);
  } catch (err: any) {
    const code = err.statusCode || (err.message?.includes('غير مصرح') ? 403 : 400);
    res.status(code).json({ error: err.message });
  }
});

apiRouter.delete('/agent/sessions/:sessionId/messages', authenticate, (req: AuthenticatedRequest, res) => {
  try {
    const state = clearAgentSessionMessages(req.params.sessionId, req.user!);
    res.json(state);
  } catch (err: any) {
    const code = err.statusCode || (err.message?.includes('غير مصرح') ? 403 : 400);
    res.status(code).json({ error: err.message });
  }
});

apiRouter.delete('/agent/messages', authenticate, (req: AuthenticatedRequest, res) => {
  try {
    const unitId = typeof req.query?.unit_id === 'string' ? req.query.unit_id : undefined;
    const result = clearAllAgentMessages(req.user!, unitId);
    res.json(result);
  } catch (err: any) {
    const code = err.statusCode || (err.message?.includes('غير مصرح') ? 403 : 400);
    res.status(code).json({ error: err.message });
  }
});

apiRouter.post('/agent/sessions/:sessionId/proposals/accept-all', authenticate, (req: AuthenticatedRequest, res) => {
  try {
    const state = acceptAllPendingProposals(req.params.sessionId, req.user!);
    res.json(state);
  } catch (err: any) {
    const code = err.statusCode || (err.message?.includes('غير مصرح') ? 403 : 400);
    res.status(code).json({ error: err.message });
  }
});

apiRouter.post('/agent/sessions/:sessionId/proposals/:proposalId/decide', authenticate, (req: AuthenticatedRequest, res) => {
  try {
    const decision = req.body?.decision;
    if (!['ACCEPT', 'REJECT', 'MODIFIED_ACCEPTED'].includes(decision)) {
      return res.status(400).json({ error: 'قرار القبول أو الرفض غير صالح (ACCEPT أو REJECT أو MODIFIED_ACCEPTED).' });
    }
    const state = decideAgentProposal(
      req.params.sessionId,
      req.params.proposalId,
      req.user!,
      decision,
      req.body?.modified_data,
      req.body?.notes
    );
    res.json(state);
  } catch (err: any) {
    const code = err.statusCode || (err.message?.includes('غير مصرح') ? 403 : 400);
    res.status(code).json({ error: err.message });
  }
});

apiRouter.post('/agent/sessions/:sessionId/clarifications/:clarificationId/answer', authenticate, (req: AuthenticatedRequest, res) => {
  try {
    const answerText = typeof req.body?.answer_text_ar === 'string' ? req.body.answer_text_ar.trim() : '';
    if (!answerText) {
      return res.status(400).json({ error: 'إجابة الاستفسار مطلوبة.' });
    }
    const state = answerAgentClarification(
      req.params.sessionId,
      req.params.clarificationId,
      req.user!,
      answerText
    );
    res.json(state);
  } catch (err: any) {
    const code = err.statusCode || (err.message?.includes('غير مصرح') ? 403 : 400);
    res.status(code).json({ error: err.message });
  }
});

apiRouter.post('/agent/sessions/:sessionId/create-draft', authenticate, (req: AuthenticatedRequest, res) => {
  try {
    const result = applyAllAcceptedProposalsToDraft(req.params.sessionId, req.user!);
    res.json({
      message: 'تم حفظ كافة التوصيات المقبولة وإنشاء مسودة التقييم بنجاح.',
      ...result,
    });
  } catch (err: any) {
    const code = err.statusCode || (err.message?.includes('غير مصرح') ? 403 : 400);
    res.status(code).json({ error: err.message });
  }
});

// ==========================================
// 3. ASSESSMENTS & REVIEWS (MAKER-CHECKER)
// ==========================================

apiRouter.get('/assessments', authenticate, (req: AuthenticatedRequest, res) => {
  initHitlSchema();
  const user = req.user!;
  const { unit_id, status } = req.query;

  // Prevent unauthorized cross-BU read
  if (unit_id && !isUserAuthorizedForBU(user, unit_id as string)) {
    return res.status(403).json({ error: `غير مصرح: لا تملك حق الوصول لتقييمات الوحدة التنظيمية (${unit_id}).` });
  }

  let sql = `
    SELECT 
      a.*, b.name_ar as unit_name_ar, u1.full_name as creator_name, u2.full_name as approver_name,
      hm.workflow_status, hm.revision, hm.base_assessment_id, hm.return_reason, hm.last_saved_at,
      (SELECT count(*) FROM risks WHERE assessment_id = a.id) as risks_count
    FROM rcsa_assessments a
    JOIN business_units b ON a.unit_id = b.id
    LEFT JOIN users u1 ON a.created_by = u1.employee_id
    LEFT JOIN users u2 ON a.approved_by = u2.employee_id
    LEFT JOIN hitl_assessment_meta hm ON a.id = hm.assessment_id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (unit_id) {
    sql += ' AND a.unit_id = ?';
    params.push(unit_id);
  } else if (!user.roles.some(r => r.role === 'RISK_ADMIN' || r.role === 'AUDITOR')) {
    // Restrict list to authorized units only
    const allowedUnitIds = user.roles.map(r => r.unit_id);
    if (allowedUnitIds.length === 0) {
      return res.json({ assessments: [] });
    }
    sql += ` AND a.unit_id IN (${allowedUnitIds.map(() => '?').join(',')})`;
    params.push(...allowedUnitIds);
  }

  if (status) {
    sql += ' AND a.status = ?';
    params.push(status);
  }
  sql += ' ORDER BY a.updated_at DESC';

  const rows = db.prepare(sql).all(...params) as any[];
  const enrichedRows = rows.map(row => {
    try { ensureAssessmentPackagesPopulated(row.id); } catch {}
    const risksCount = (db.prepare('SELECT count(*) as cnt FROM risks WHERE assessment_id = ?').get(row.id) as { cnt: number }).cnt;
    const rawTitle = row.title_ar || row.title || '';
    const timestamps = getAssessmentTimestampDetails({
      id: row.id,
      status: row.status,
      workflow_status: row.workflow_status,
      cycle_year: row.cycle_year,
      title_ar: rawTitle,
      created_at: row.created_at,
      updated_at: row.updated_at,
      submitted_at: row.submitted_at,
      approved_at: row.approved_at,
      last_saved_at: row.last_saved_at,
      revision: row.revision,
    });
    return {
      ...row,
      title_ar: rawTitle,
      risks_count: risksCount,
      clean_title_ar: cleanAssessmentTitleAr(rawTitle),
      timestamps,
    };
  });
  res.json({ assessments: enrichedRows });
});

apiRouter.get('/assessments/:id', authenticate, (req: AuthenticatedRequest, res) => {
  const assessment = db.prepare(`
    SELECT a.*, b.name_ar as unit_name_ar, u1.full_name as creator_name, u2.full_name as approver_name
    FROM rcsa_assessments a
    JOIN business_units b ON a.unit_id = b.id
    LEFT JOIN users u1 ON a.created_by = u1.employee_id
    LEFT JOIN users u2 ON a.approved_by = u2.employee_id
    WHERE a.id = ?
  `).get(req.params.id) as any;

  if (!assessment) {
    return res.status(404).json({ error: 'التقييم غير موجود.' });
  }

  // Horizontal authorization guard: user must be assigned to this BU or be admin/auditor
  if (!isUserAuthorizedForBU(req.user!, assessment.unit_id)) {
    return res.status(403).json({ error: 'غير مصرح: لا تملك حق الوصول إلى تقييمات هذه الوحدة التنظيمية.' });
  }

  try {
    ensureAssessmentPackagesPopulated(req.params.id);
  } catch (e) {
    // Fallback if assessment has custom rows
  }

  const risks = db.prepare(`
    SELECT * FROM risks WHERE assessment_id = ? ORDER BY risk_code
  `).all(req.params.id) as any[];

  for (const risk of risks) {
    const controls = db.prepare(`
      SELECT c.*, rc.control_status, rc.is_active_for_residual
      FROM controls c
      JOIN risk_controls rc ON c.id = rc.control_id
      WHERE rc.risk_id = ?
    `).all(risk.id);
    risk.controls = controls;

    const actions = db.prepare(`
      SELECT * FROM action_plans WHERE risk_id = ?
    `).all(risk.id);
    risk.action_plans = actions;
  }

  res.json({ assessment, risks });
});

/**
 * Submit draft for review (Maker role - strictly isolated per BU)
 */
apiRouter.post('/assessments/:id/submit', authenticate, (req: AuthenticatedRequest, res) => {
  try {
    const state = submitAssessmentForCheckerReview(
      req.params.id,
      req.user!,
      req.body?.expected_revision,
      req.body?.submission_notes
    );
    res.json({
      success: true,
      message: 'تم إرسال التقييم بنجاح للمراجعة والاعتماد بواسطة المدقق/المراجع المستقل (Checker).',
      state,
    });
  } catch (err: any) {
    const code = err.statusCode || (err.message?.includes('غير مصرح') ? 403 : err.message?.includes('غير موجود') ? 404 : 400);
    res.status(code).json({ error: err.message });
  }
});

/**
 * Approve assessment (Checker role - Strict Maker-Checker enforcement, rejects self-approval & incomplete inputs)
 */
apiRouter.post('/assessments/:id/approve', authenticate, (req: AuthenticatedRequest, res) => {
  try {
    const state = checkerApproveAssessment(
      req.params.id,
      req.user!,
      req.body?.expected_revision,
      req.body?.approval_notes
    );
    res.json({
      success: true,
      message: 'تم اعتماد التقييم بنجاح وتجميد الإصدار المعتمد.',
      state,
    });
  } catch (err: any) {
    const code = err.statusCode || (err.message?.includes('غير مصرح') || err.message?.includes('Maker-Checker') ? 403 : 400);
    res.status(code).json({ error: err.message });
  }
});

/**
 * Reject / Return assessment (Checker role with mandatory reason)
 */
apiRouter.post('/assessments/:id/reject', authenticate, (req: AuthenticatedRequest, res) => {
  try {
    const reason = req.body?.rejection_reason || req.body?.return_reason;
    const state = checkerReturnAssessment(
      req.params.id,
      req.user!,
      reason,
      req.body?.expected_revision
    );
    res.json({
      success: true,
      message: 'تم تسجيل رفض التقييم وإعادته إلى مسؤول الإعداد لإجراء التصحيحات اللازمة.',
      state,
    });
  } catch (err: any) {
    const code = err.statusCode || (err.message?.includes('غير مصرح') ? 403 : 400);
    res.status(code).json({ error: err.message });
  }
});

// ==========================================
// 3B. PHASE 2D — HUMAN-IN-THE-LOOP RCSA REVIEW & EDIT ENDPOINTS
// ==========================================

/**
 * Get complete HITL review state for an assessment (risk packages, controls, discrepancies,
 * AI suggestions, provenance labels, pre-export readiness summary, and field-level audit history).
 */
apiRouter.get('/hitl/assessments/:id', authenticate, (req: AuthenticatedRequest, res) => {
  const assessment = db.prepare('SELECT unit_id FROM rcsa_assessments WHERE id = ?').get(req.params.id) as any;
  if (!assessment) {
    return res.status(404).json({ error: 'التقييم غير موجود.' });
  }
  if (!isUserAuthorizedForBU(req.user!, assessment.unit_id)) {
    return res.status(403).json({
      error: `غير مصرح: لا تملك صلاحية الوصول إلى تقييمات الوحدة التنظيمية (${assessment.unit_id}).`,
    });
  }

  try {
    const fullState = getAssessmentHitlFullState(req.params.id);
    res.json(fullState);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'فشل تحميل حالة المراجعة التفاعلية.' });
  }
});

/**
 * Create a new manual draft assessment for a Business Unit.
 */
apiRouter.post('/hitl/assessments/create-draft', authenticate, (req: AuthenticatedRequest, res) => {
  const { unit_id, title } = req.body;
  if (!unit_id) {
    return res.status(400).json({ error: 'معرف الوحدة التنظيمية (unit_id) مطلوب.' });
  }
  try {
    const fullState = createManualDraftForUnit(unit_id, req.user!, title);
    res.json({
      success: true,
      message: 'تم إنشاء مسودة التقييم التفاعلية بنجاح.',
      state: fullState,
    });
  } catch (err: any) {
    const code = err.message?.includes('غير مصرح') ? 403 : 400;
    res.status(code).json({ error: err.message });
  }
});

/**
 * Create a new editable DRAFT version branched from an immutable APPROVED version.
 */
apiRouter.post('/hitl/assessments/:id/create-draft-from-approved', authenticate, (req: AuthenticatedRequest, res) => {
  try {
    const fullState = createNewDraftFromApproved(req.params.id, req.user!, req.body?.title);
    res.json({
      success: true,
      message: 'تم إنشاء نسخة مسودة جديدة قابلة للتعديل مع الحفاظ على ثبات النسخة المعتمدة.',
      state: fullState,
    });
  } catch (err: any) {
    const code = err.message?.includes('غير مصرح') ? 403 : 400;
    res.status(code).json({ error: err.message });
  }
});

/**
 * Edit a single risk's inputs / missing fields / controls / scope eligibility and
 * trigger isolated recalculation of ONLY the affected risk via the Python engine.
 */
apiRouter.post('/hitl/assessments/:id/risks/:riskId/recalculate', authenticate, (req: AuthenticatedRequest, res) => {
  try {
    const fullState = updateSingleRiskAndRecalculate({
      assessmentId: req.params.id,
      riskId: req.params.riskId,
      user: req.user!,
      expectedRevision: req.body?.expected_revision,
      riskUpdates: req.body?.risk_updates,
      controlUpdates: req.body?.control_updates,
      addControl: req.body?.add_control,
      evidenceOrReason: req.body?.evidence_or_reason,
    });
    res.json({
      success: true,
      message: `تم حفظ التعديلات وإعادة احتساب المخاطرة (${req.params.riskId}) عبر محرك بايثون المعتمد.`,
      state: fullState,
    });
  } catch (err: any) {
    const code =
      err.statusCode ||
      (err.message?.includes('غير مصرح') || err.message?.includes('مرفوض رقابياً') ? 403 : 400);
    res.status(code).json({ error: err.message });
  }
});

/**
 * Accept, Modify before accepting, or Reject an AI suggestion on a risk or control.
 */
apiRouter.post('/hitl/assessments/:id/risks/:riskId/suggestion', authenticate, (req: AuthenticatedRequest, res) => {
  try {
    const fullState = applySuggestionDecision({
      assessmentId: req.params.id,
      riskId: req.params.riskId,
      user: req.user!,
      expectedRevision: req.body?.expected_revision,
      targetField: req.body?.target_field,
      controlId: req.body?.control_id,
      decision: req.body?.decision,
      modifiedText: req.body?.modified_text,
      reason: req.body?.reason,
    });
    res.json({
      success: true,
      message: 'تم تسجيل قرار المراجع على مقترح الذكاء بنجاح.',
      state: fullState,
    });
  } catch (err: any) {
    const code = err.statusCode || (err.message?.includes('غير مصرح') ? 403 : 400);
    res.status(code).json({ error: err.message });
  }
});

/**
 * Mark a risk as reviewed (or unreviewed) and optionally acknowledge source discrepancies.
 */
apiRouter.post('/hitl/assessments/:id/risks/:riskId/review-status', authenticate, (req: AuthenticatedRequest, res) => {
  try {
    const fullState = markRiskReviewed({
      assessmentId: req.params.id,
      riskId: req.params.riskId,
      user: req.user!,
      isReviewed: Boolean(req.body?.is_reviewed),
      reviewerNotesAr: req.body?.reviewer_notes_ar,
      acknowledgeDiscrepancies: Boolean(req.body?.acknowledge_discrepancies),
    });
    res.json({
      success: true,
      message: req.body?.is_reviewed
        ? `تم اعتماد مراجعة المخاطرة (${req.params.riskId}).`
        : `تم إعادة فتح المخاطرة (${req.params.riskId}) للمراجعة.`,
      state: fullState,
    });
  } catch (err: any) {
    const code = err.statusCode || (err.message?.includes('غير مصرح') ? 403 : 400);
    res.status(code).json({ error: err.message });
  }
});

/**
 * Persist draft explicitly in SQLite.
 */
apiRouter.post('/hitl/assessments/:id/save', authenticate, (req: AuthenticatedRequest, res) => {
  try {
    const fullState = saveAssessmentDraft(
      req.params.id,
      req.user!,
      req.body?.expected_revision,
      req.body?.save_note
    );
    res.json({
      success: true,
      message: 'تم حفظ المسودة بنجاح في قاعدة البيانات المستديمة.',
      state: fullState,
    });
  } catch (err: any) {
    const code = err.statusCode || (err.message?.includes('غير مصرح') ? 403 : 400);
    res.status(code).json({ error: err.message });
  }
});

/**
 * Submit draft for Checker Review (`DRAFT -> IN_REVIEW`).
 */
apiRouter.post('/hitl/assessments/:id/submit', authenticate, (req: AuthenticatedRequest, res) => {
  try {
    const fullState = submitAssessmentForCheckerReview(
      req.params.id,
      req.user!,
      req.body?.expected_revision,
      req.body?.submission_notes
    );
    res.json({
      success: true,
      message: 'تم إرسال المسودة بنجاح لمراجعة المدقق المستقل (Checker Review).',
      state: fullState,
    });
  } catch (err: any) {
    const code = err.statusCode || (err.message?.includes('غير مصرح') ? 403 : 400);
    res.status(code).json({ error: err.message });
  }
});

/**
 * Checker Approve (`IN_REVIEW -> APPROVED`).
 */
apiRouter.post('/hitl/assessments/:id/approve', authenticate, (req: AuthenticatedRequest, res) => {
  try {
    const fullState = checkerApproveAssessment(
      req.params.id,
      req.user!,
      req.body?.expected_revision,
      req.body?.approval_notes
    );
    res.json({
      success: true,
      message: 'تم الاعتماد النهائي للتقييم وتجميد النسخة المعتمدة ببصمة رقمية SHA-256.',
      state: fullState,
    });
  } catch (err: any) {
    const code =
      err.statusCode ||
      (err.message?.includes('غير مصرح') || err.message?.includes('Maker-Checker') ? 403 : 400);
    res.status(code).json({ error: err.message });
  }
});

/**
 * Checker Return for Changes (`IN_REVIEW -> RETURNED_FOR_CHANGES`).
 */
apiRouter.post('/hitl/assessments/:id/return', authenticate, (req: AuthenticatedRequest, res) => {
  try {
    const reason = req.body?.return_reason || req.body?.rejection_reason;
    const fullState = checkerReturnAssessment(
      req.params.id,
      req.user!,
      reason,
      req.body?.expected_revision
    );
    res.json({
      success: true,
      message: 'تمت إعادة التقييم إلى معد التقييم (Maker) مع توثيق الملاحظات الرقابية.',
      state: fullState,
    });
  } catch (err: any) {
    const code = err.statusCode || (err.message?.includes('غير مصرح') ? 403 : 400);
    res.status(code).json({ error: err.message });
  }
});

// ==========================================
// 4. AUDIT TRAIL ENDPOINTS (Restricted to Risk Admin & Auditor)
// ==========================================

apiRouter.get('/audit-trail', authenticate, (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  
  // Strict Role Restriction: Only RISK_ADMIN or AUDITOR can view central audit logs
  const isAuthorized = user.roles.some(r => r.role === 'RISK_ADMIN' || r.role === 'AUDITOR');
  if (!isAuthorized) {
    return res.status(403).json({ 
      error: 'غير مصرح: الوصول لسجل التدقيق مقصور رقابياً على مسؤولي إدارة المخاطر المركزية والتفتيش الداخلي.' 
    });
  }

  const { unit_id, entity_type, user_id, action, limit } = req.query;
  let logs = queryAuditLogs({
    unitId: unit_id as string,
    entityType: entity_type as string,
    userId: user_id as string,
    limit: limit ? Number(limit) : 150,
  });

  if (action && typeof action === 'string') {
    logs = logs.filter((l: any) => l.action === action);
  }

  const enrichedLogs = logs.map((l: any) => ({
    ...l,
    ts_ar: formatArabicDateTime(l.ts),
    action_meta: formatAuditActionAr(l.action),
  }));

  res.json({ audit_logs: enrichedLogs });
});

// ==========================================
// 5. USER ADMINISTRATION & PERMISSIONS
// ==========================================

apiRouter.get('/admin/users', authenticate, (req: AuthenticatedRequest, res) => {
  const isAuthorized = req.user!.roles.some(r => r.role === 'RISK_ADMIN');
  if (!isAuthorized) {
    return res.status(403).json({ error: 'غير مصرح: دليل المستخدمين متاح لمدير النظام فقط.' });
  }

  const userRows = db.prepare(`
    SELECT employee_id, full_name, email, must_reset_password, is_active, created_at
    FROM users ORDER BY employee_id
  `).all() as any[];

  const users = userRows.map(u => ({
    ...u,
    must_reset_password: Boolean(u.must_reset_password),
    is_active: Boolean(u.is_active),
    roles: db.prepare(`
      SELECT r.id, r.user_id, r.unit_id, r.role, r.granted_at, r.granted_by, b.name_ar as unit_name_ar
      FROM user_bu_roles r
      JOIN business_units b ON r.unit_id = b.id
      WHERE r.user_id = ?
    `).all(u.employee_id),
  }));

  res.json({ users });
});

/** Explicit BU role assignment by a central administrator. Audited and scoped. */
apiRouter.post('/admin/users/:employeeId/roles', authenticate, (req: AuthenticatedRequest, res) => {
  const actor = req.user!;
  if (!actor.roles.some(r => r.role === 'RISK_ADMIN')) {
    return res.status(403).json({ error: 'تعديل الصلاحيات متاح لمدير النظام فقط.' });
  }
  const employeeId = req.params.employeeId;
  const { unit_id, role } = req.body || {};
  if (typeof unit_id !== 'string' || !['MAKER', 'CHECKER', 'AUDITOR'].includes(role)) {
    return res.status(400).json({ error: 'حدد الوحدة ودورًا صحيحًا (مُعد أو مراجع أو مدقق).' });
  }
  const unit = db.prepare('SELECT id, name_ar FROM business_units WHERE id = ?').get(unit_id) as any;
  const employee = db.prepare('SELECT employee_id, full_name FROM users WHERE employee_id = ? AND is_active = 1').get(employeeId) as any;
  if (!unit || !employee) return res.status(404).json({ error: 'الموظف أو الوحدة غير موجودة.' });
  const existing = db.prepare('SELECT id FROM user_bu_roles WHERE user_id = ? AND unit_id = ? AND role = ?').get(employeeId, unit_id, role);
  if (existing) return res.status(409).json({ error: 'الموظف لديه هذه الصلاحية بالفعل.' });
  const roleId = `R-${crypto.randomUUID()}`;
  runInTransaction(() => {
    db.prepare('INSERT INTO user_bu_roles (id, user_id, unit_id, role, granted_by) VALUES (?, ?, ?, ?, ?)')
      .run(roleId, employeeId, unit_id, role, actor.employee_id);
    logAuditEvent({ userId: actor.employee_id, userRole: 'RISK_ADMIN', unitId: unit_id,
      entityType: 'USER_PERMISSION', entityId: employeeId, action: 'GRANT_BU_ROLE',
      afterState: { unit_id, role },
      changeSummary: `منح ${employee.full_name} صلاحية ${role} على ${unit.name_ar}` });
  });
  return res.status(201).json({ id: roleId, employee_id: employeeId, unit_id, role });
});

// ==========================================
// 6. PROVISIONAL CALCULATION API CONTRACT (Returns ENGINE_NOT_CONFIGURED)
// ==========================================

apiRouter.post('/internal/engine/calculate', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const result = await executeProvisionalCalculation(req.body);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'خطأ في معالجة طلب التكامل التمهيدي.' });
  }
});
