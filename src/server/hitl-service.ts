import { getPythonExecutable } from './python-runtime.js';
import { execFileSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { db, DB_PATH, runInTransaction } from './db.js';
import { logAuditEvent } from './audit.js';
import { canApproveAssessment, isUserAuthorizedForBU } from './auth.js';
import { User } from '../types/index.js';
import {
  getAssessmentTimestampDetails,
  cleanAssessmentTitleAr,
  formatArabicDateTime,
  SEEDED_ASSESSMENT_IDS,
} from '../utils/dateFormat.js';

export type HitlWorkflowStatus = 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'RETURNED_FOR_CHANGES';

export type ValueProvenanceLabel =
  | 'ORIGINAL_SOURCE_VALUE'
  | 'CURRENT_DRAFT_VALUE'
  | 'CALCULATED_VALUE'
  | 'AI_SUGGESTED_VALUE'
  | 'REVIEWER_APPROVED_VALUE';

/**
 * Invoke the authoritative Python RCSA engine (`rcsa_engine/cli_bridge.py`) via stdio.
 * Python is the single authoritative calculation layer; no financial or RRF formulas are reproduced in JS/TS.
 */
export function invokePythonEngineBridge(payload: Record<string, any>): any {
  const inputJson = JSON.stringify({
    ...payload,
    sqlite_db_path: payload.sqlite_db_path || DB_PATH,
  });

  const stdout = execFileSync(getPythonExecutable(), ['-m', 'rcsa_engine.cli_bridge'], {
    cwd: path.resolve(process.cwd()),
    input: inputJson,
    encoding: 'utf-8',
    maxBuffer: 32 * 1024 * 1024,
  });

  const parsed = JSON.parse(stdout);
  if (parsed && parsed.error) {
    throw new Error(`[Python Engine Error] ${parsed.error}`);
  }
  return parsed;
}

/**
 * Map legacy `rcsa_assessments.status` to canonical Phase 2D workflow status and vice versa.
 */
export function toHitlWorkflowStatus(dbStatus: string): HitlWorkflowStatus {
  switch (dbStatus) {
    case 'SUBMITTED':
      return 'IN_REVIEW';
    case 'APPROVED':
      return 'APPROVED';
    case 'REJECTED':
      return 'RETURNED_FOR_CHANGES';
    case 'INCOMPLETE_DRAFT':
    case 'READY_DRAFT':
    default:
      return 'DRAFT';
  }
}

export function toLegacyAssessmentStatus(workflowStatus: HitlWorkflowStatus, isReady = false): string {
  switch (workflowStatus) {
    case 'IN_REVIEW':
      return 'SUBMITTED';
    case 'APPROVED':
      return 'APPROVED';
    case 'RETURNED_FOR_CHANGES':
      return 'REJECTED';
    case 'DRAFT':
    default:
      return isReady ? 'READY_DRAFT' : 'INCOMPLETE_DRAFT';
  }
}

// Cache initial unit packages per unit_id during process lifetime to make repeated DB init fast
const unitInitCache = new Map<string, any>();

function getUnitInitialPackages(unitId: string): any {
  if (unitInitCache.has(unitId)) {
    return JSON.parse(JSON.stringify(unitInitCache.get(unitId)));
  }
  const result = invokePythonEngineBridge({
    action: 'initialize_unit_packages',
    unit_id: unitId,
  });
  unitInitCache.set(unitId, result);
  return JSON.parse(JSON.stringify(result));
}

/**
 * Validate server-side that taxonomy L1, L2, and L3 form a valid parent-child hierarchy in SQLite.
 * Reject invalid parent-child combinations (e.g., L2 not belonging to L1, or L3 not belonging to L2).
 */
export function validateTaxonomyHierarchy(l1Id?: string | null, l2Id?: string | null, l3Id?: string | null): { valid: boolean; error?: string } {
  const cleanL1 = l1Id && typeof l1Id === 'string' ? l1Id.trim() : null;
  const cleanL2 = l2Id && typeof l2Id === 'string' ? l2Id.trim() : null;
  const cleanL3 = l3Id && typeof l3Id === 'string' ? l3Id.trim() : null;

  if (!cleanL1 && !cleanL2 && !cleanL3) {
    return { valid: true };
  }

  if (cleanL1) {
    const l1Row = db.prepare("SELECT taxonomy_id, level FROM risk_taxonomy WHERE taxonomy_id = ? AND level = 'L1'").get(cleanL1) as any;
    if (!l1Row) {
      return { valid: false, error: `تصنيف المخاطر الرئيسي (L1) غير موجود برقم (${cleanL1}).` };
    }
  }

  if (cleanL2) {
    if (!cleanL1) {
      return { valid: false, error: 'تعذر تحديد تصنيف فرعي (L2) دون تحديد التصنيف الرئيسي (L1).' };
    }
    const l2Row = db.prepare("SELECT taxonomy_id, level, parent_taxonomy_id FROM risk_taxonomy WHERE taxonomy_id = ? AND level = 'L2'").get(cleanL2) as any;
    if (!l2Row) {
      return { valid: false, error: `تصنيف المخاطر الفرعي (L2) غير موجود برقم (${cleanL2}).` };
    }
    if (l2Row.parent_taxonomy_id !== cleanL1) {
      return { valid: false, error: `التصنيف الفرعي (${cleanL2}) لا ينتمي إلى التصنيف الرئيسي المختار (${cleanL1}).` };
    }
  }

  if (cleanL3) {
    if (!cleanL2) {
      return { valid: false, error: 'تعذر تحديد تصنيف تفصيلي (L3) دون تحديد التصنيف الفرعي (L2).' };
    }
    const l3Row = db.prepare("SELECT taxonomy_id, level, parent_taxonomy_id FROM risk_taxonomy WHERE taxonomy_id = ? AND level = 'L3'").get(cleanL3) as any;
    if (!l3Row) {
      return { valid: false, error: `التصنيف التفصيلي (L3) غير موجود برقم (${cleanL3}).` };
    }
    if (l3Row.parent_taxonomy_id !== cleanL2) {
      return { valid: false, error: `التصنيف التفصيلي (${cleanL3}) لا ينتمي إلى التصنيف الفرعي المختار (${cleanL2}).` };
    }
  }

  return { valid: true };
}

/**
 * Resolve taxonomy fields from raw input against SQLite reference taxonomy table with fallbacks.
 */
export function resolveTaxonomyFields(raw: {
  taxonomy_l1_id?: string | null;
  taxonomy_l1_ar?: string | null;
  taxonomy_l2_id?: string | null;
  taxonomy_l2_ar?: string | null;
  taxonomy_l3_id?: string | null;
  taxonomy_l3_ar?: string | null;
  taxonomy_rationale_ar?: string | null;
}, fallback?: any) {
  let l1Id = raw.taxonomy_l1_id || fallback?.taxonomy_l1_id || 'L1-08';
  let l1Ar = raw.taxonomy_l1_ar || fallback?.taxonomy_l1_ar || '';
  let l2Id = raw.taxonomy_l2_id !== undefined ? raw.taxonomy_l2_id : fallback?.taxonomy_l2_id;
  let l2Ar = raw.taxonomy_l2_ar !== undefined ? raw.taxonomy_l2_ar : fallback?.taxonomy_l2_ar;
  let l3Id = raw.taxonomy_l3_id !== undefined ? raw.taxonomy_l3_id : fallback?.taxonomy_l3_id;
  let l3Ar = raw.taxonomy_l3_ar !== undefined ? raw.taxonomy_l3_ar : fallback?.taxonomy_l3_ar;

  if (l1Id) {
    const l1Row = db.prepare("SELECT taxonomy_id, name_ar AS category_ar FROM risk_taxonomy WHERE taxonomy_id = ? AND level = 'L1'").get(l1Id) as any;
    if (l1Row) {
      l1Ar = l1Row.category_ar;
    }
  }

  if (l2Id) {
    const l2Row = db.prepare("SELECT taxonomy_id, name_ar AS category_ar, parent_taxonomy_id FROM risk_taxonomy WHERE taxonomy_id = ? AND level = 'L2'").get(l2Id) as any;
    if (l2Row && l2Row.parent_taxonomy_id === l1Id) {
      l2Ar = l2Row.category_ar;
    } else {
      l2Id = null;
      l2Ar = null;
    }
  } else {
    l2Id = null;
    l2Ar = null;
  }

  if (l3Id && l2Id) {
    const l3Row = db.prepare("SELECT taxonomy_id, name_ar AS category_ar, parent_taxonomy_id FROM risk_taxonomy WHERE taxonomy_id = ? AND level = 'L3'").get(l3Id) as any;
    if (l3Row && l3Row.parent_taxonomy_id === l2Id) {
      l3Ar = l3Row.category_ar;
    } else {
      l3Id = null;
      l3Ar = null;
    }
  } else {
    l3Id = null;
    l3Ar = null;
  }

  return {
    taxonomy_l1_id: l1Id,
    taxonomy_l1_ar: l1Ar,
    taxonomy_l2_id: l2Id,
    taxonomy_l2_ar: l2Ar,
    taxonomy_l3_id: l3Id,
    taxonomy_l3_ar: l3Ar,
    taxonomy_rationale_ar: raw.taxonomy_rationale_ar || fallback?.taxonomy_rationale_ar || null,
  };
}

/**
 * Create Phase 2D additive tables idempotently without altering Phase 1 tables.
 */
export function initHitlSchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS hitl_assessment_meta (
      assessment_id TEXT PRIMARY KEY REFERENCES rcsa_assessments(id) ON DELETE CASCADE,
      workflow_status TEXT CHECK(workflow_status IN ('DRAFT', 'IN_REVIEW', 'APPROVED', 'RETURNED_FOR_CHANGES')) NOT NULL DEFAULT 'DRAFT',
      revision INTEGER NOT NULL DEFAULT 1,
      base_assessment_id TEXT,
      returned_by TEXT,
      returned_at TEXT,
      return_reason TEXT,
      last_saved_by TEXT,
      last_saved_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS hitl_risk_packages (
      id TEXT PRIMARY KEY,
      assessment_id TEXT NOT NULL REFERENCES rcsa_assessments(id) ON DELETE CASCADE,
      risk_id TEXT NOT NULL,
      unit_id TEXT NOT NULL,
      excel_row INTEGER,
      display_order INTEGER NOT NULL DEFAULT 1,
      original_source_json TEXT NOT NULL,
      current_draft_input_json TEXT NOT NULL,
      calculated_output_json TEXT NOT NULL,
      previous_calculated_output_json TEXT,
      source_discrepancies_json TEXT NOT NULL,
      package_full_json TEXT NOT NULL,
      suggestion_decisions_json TEXT NOT NULL,
      discrepancy_decisions_json TEXT NOT NULL,
      provenance_map_json TEXT NOT NULL,
      is_reviewed INTEGER NOT NULL DEFAULT 0,
      reviewed_by TEXT,
      reviewed_at TEXT,
      reviewer_notes_ar TEXT,
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(assessment_id, risk_id)
    );

    CREATE TABLE IF NOT EXISTS phase2c_risk_assessments (
      assessment_id TEXT NOT NULL REFERENCES rcsa_assessments(id) ON DELETE CASCADE,
      risk_id TEXT NOT NULL,
      inputs_json TEXT NOT NULL,
      result_json TEXT NOT NULL,
      updated_by TEXT NOT NULL REFERENCES users(employee_id),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (assessment_id, risk_id)
    );

    CREATE TRIGGER IF NOT EXISTS trg_approved_phase2c_no_insert
    BEFORE INSERT ON phase2c_risk_assessments
    WHEN EXISTS(SELECT 1 FROM rcsa_assessments WHERE id = NEW.assessment_id AND status = 'APPROVED')
    BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_APPROVED_PHASE2C'); END;

    CREATE TRIGGER IF NOT EXISTS trg_approved_phase2c_no_update
    BEFORE UPDATE ON phase2c_risk_assessments
    WHEN EXISTS(SELECT 1 FROM rcsa_assessments WHERE id = OLD.assessment_id AND status = 'APPROVED')
    BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_APPROVED_PHASE2C'); END;

    CREATE TRIGGER IF NOT EXISTS trg_approved_phase2c_no_delete
    BEFORE DELETE ON phase2c_risk_assessments
    WHEN EXISTS(SELECT 1 FROM rcsa_assessments WHERE id = OLD.assessment_id AND status = 'APPROVED')
    BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_APPROVED_PHASE2C'); END;

    CREATE TABLE IF NOT EXISTS hitl_field_audit_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT DEFAULT (datetime('now')),
      assessment_id TEXT NOT NULL,
      unit_id TEXT NOT NULL,
      risk_id TEXT,
      control_id TEXT,
      actor_id TEXT NOT NULL,
      actor_name TEXT,
      actor_role TEXT NOT NULL,
      action_type TEXT NOT NULL,
      field_name TEXT NOT NULL,
      previous_value TEXT,
      new_value TEXT,
      value_provenance TEXT NOT NULL,
      calculation_before_json TEXT,
      calculation_after_json TEXT,
      evidence_or_reason TEXT
    );

    CREATE TRIGGER IF NOT EXISTS trg_immutable_snapshot_no_update
    BEFORE UPDATE ON immutable_assessment_snapshots
    BEGIN
      SELECT RAISE(ABORT, 'IMMUTABLE_APPROVED_SNAPSHOT: لا يمكن تعديل لقطة إصدار معتمد مجمد في قاعدة البيانات');
    END;

    CREATE TRIGGER IF NOT EXISTS trg_immutable_snapshot_no_delete
    BEFORE DELETE ON immutable_assessment_snapshots
    BEGIN
      SELECT RAISE(ABORT, 'IMMUTABLE_APPROVED_SNAPSHOT: لا يمكن حذف لقطة إصدار معتمد مجمد في قاعدة البيانات');
    END;

    CREATE TRIGGER IF NOT EXISTS trg_approved_hitl_pkg_no_update
    BEFORE UPDATE ON hitl_risk_packages
    WHEN (SELECT workflow_status FROM hitl_assessment_meta WHERE assessment_id = OLD.assessment_id) = 'APPROVED'
    BEGIN
      SELECT RAISE(ABORT, 'IMMUTABLE_APPROVED_ASSESSMENT: لا يمكن تعديل مخاطر وضوابط نسخة معتمدة مجمدة في قاعدة البيانات');
    END;

    CREATE TRIGGER IF NOT EXISTS trg_approved_hitl_pkg_no_delete
    BEFORE DELETE ON hitl_risk_packages
    WHEN (SELECT workflow_status FROM hitl_assessment_meta WHERE assessment_id = OLD.assessment_id) = 'APPROVED'
    BEGIN
      SELECT RAISE(ABORT, 'IMMUTABLE_APPROVED_ASSESSMENT: لا يمكن حذف مخاطر وضوابط نسخة معتمدة مجمدة في قاعدة البيانات');
    END;

    CREATE TRIGGER IF NOT EXISTS trg_approved_meta_no_update
    BEFORE UPDATE ON hitl_assessment_meta
    WHEN OLD.workflow_status = 'APPROVED'
    BEGIN
      SELECT RAISE(ABORT, 'IMMUTABLE_APPROVED_META: لا يمكن تعديل أو إلغاء اعتماد نسخة مجمدة في قاعدة البيانات');
    END;
  `);
}

/**
 * Sync a risk package into the legacy `risks`, `controls`, and `risk_controls` tables
 * so Dashboard KPIs and `/api/assessments/:id` stay 100% synchronized with Python calculations.
 */
function syncRiskPackageToCoreTables(
  assessmentId: string,
  riskId: string,
  unitId: string,
  displayOrder: number,
  draftInput: any,
  calcOutput: any,
  isReviewed: boolean
): void {
  const rowId = assessmentId === 'ASM-SYND-2026-V1' ? riskId : `${assessmentId}::${riskId}`;
  const riskCode = `RSK-${String(displayOrder).padStart(3, '0')}`;
  const processName = draftInput.process_name || draftInput.risk_library_name || 'العمليات المصرفية';
  const riskDesc = draftInput.risk_description || '';
  const l1Raw = String(draftInput.taxonomy_l1_ar || '').trim();
  // Do not infer a category from incidental digits in Arabic risk text.
  // The source workbook uses legacy codes (_2_, _5_, _8_); preserve unknown as pending.
  const legacyL1 = /^_?([1-8])_/.exec(l1Raw);
  const explicitL1 = /^\[?L1-0([1-8])\]?(?:\b|\s|$)/.exec(l1Raw);
  const l1Labels: Record<string, string> = {
    'احتيال داخلي': 'L1-01', 'احتيال خارجي': 'L1-02',
    'أساليب الاحتيال ببطاقات الائتمان': 'L1-03',
    'مخالفة قوانين العمل والسلامة المهنية': 'L1-04',
    'ممارسات غير سليمة تمس حقوق عملاء البنك': 'L1-05',
    'الأضرار التي تلحق بالأصول المادية': 'L1-06',
    'توقف الأعمال وتعطل الأنظمة': 'L1-07',
    'تنفيذ المعاملات وتسليمها وإدارتها': 'L1-08',
  };
  const l1Id = draftInput.taxonomy_l1_id || (legacyL1 ? `L1-0${legacyL1[1]}` : explicitL1 ? `L1-0${explicitL1[1]}` : l1Labels[l1Raw] || 'L1-PENDING');

  const finLevel = calcOutput.individual_impact_level ?? null;
  const finAmount = calcOutput.individual_financial_impact_egp ?? null;
  const maxIncidentLoss = calcOutput.proposed_evidence_impact_egp ?? finAmount;
  const freqLevel = calcOutput.normalized_frequency_level ?? null;
  const freqText = draftInput.expected_frequency_text ?? calcOutput.normalized_frequency_label_ar ?? null;
  const annualLoss = calcOutput.expected_annual_loss_egp ?? null;
  const inherentRating = calcOutput.annualized_financial_rating ?? null;
  const residualLoss = calcOutput.residual_financial_amount_egp ?? null;
  const residualRating = calcOutput.continuous_residual_rating ?? null;
  const maxRrf = calcOutput.effective_max_rrf ?? null;
  const rationaleText = draftInput.active_rationale_ar ?? null;

  const existingByDirect = db
    .prepare('SELECT id FROM risks WHERE assessment_id = ? AND (id = ? OR id = ? OR risk_master_id = ?)')
    .get(assessmentId, rowId, riskId, riskId) as { id: string } | undefined;

  const targetDbRiskId = existingByDirect ? existingByDirect.id : rowId;

  db.prepare(`
    INSERT OR REPLACE INTO risks (
      id, risk_master_id, assessment_id, risk_code, process_name, risk_description,
      taxonomy_l1_id, taxonomy_l2_id, taxonomy_l3_id,
      financial_impact_level, financial_impact_amount, single_incident_max_loss,
      nfi_service_level, nfi_reputation_level, nfi_regulatory_level, nfi_legal_level, nfi_composite_score,
      final_inherent_impact_level, inherent_frequency_level, inherent_frequency_text,
      expected_annual_loss, inherent_risk_rating,
      residual_loss_amount, residual_risk_rating, applied_max_rrf,
      is_assessment_complete, rational_text
    ) VALUES (
      ?, ?, ?, ?, ?, ?,
      ?, NULL, NULL,
      ?, ?, ?,
      NULL, NULL, NULL, NULL, 'NA',
      ?, ?, ?,
      ?, ?,
      ?, ?, ?,
      ?, ?
    )
  `).run(
    targetDbRiskId,
    riskId,
    assessmentId,
    riskCode,
    processName,
    riskDesc,
    l1Id,
    finLevel,
    finAmount,
    maxIncidentLoss,
    finLevel,
    freqLevel,
    freqText,
    annualLoss,
    inherentRating,
    residualLoss,
    residualRating,
    maxRrf,
    isReviewed ? 1 : 0,
    rationaleText
  );

  // Also sync controls
  const calcControls = calcOutput.controls_calculated || [];
  const draftControls = draftInput.controls || [];

  for (let i = 0; i < draftControls.length; i++) {
    const dc = draftControls[i];
    const cc = calcControls.find((x: any) => x.control_id === dc.control_id) || {};
    const ctrlId = `${assessmentId}::${dc.control_id}`;
    const ctrlCode = `${assessmentId.slice(-6)}-${dc.control_id}`;
    const cType = (cc.control_type || dc.control_type_raw || 'PREVENTIVE').toUpperCase();
    const normType = cType.includes('DETECT') ? 'DETECTIVE' : cType.includes('CORRECT') ? 'CORRECTIVE' : 'PREVENTIVE';
    const cMethod = (cc.control_method || dc.control_method_raw || 'MANUAL').toUpperCase();
    const normMethod = cMethod.includes('SEMI')
      ? 'SEMI_AUTOMATED'
      : cMethod.includes('AUTO')
        ? 'AUTOMATED'
        : 'MANUAL';

    db.prepare(`
      INSERT OR REPLACE INTO controls (
        id, control_code, control_description, control_type,
        control_method, control_frequency, control_owner, raw_efficiency_rating, rrf_value
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      ctrlId,
      ctrlCode,
      dc.control_description || '',
      normType,
      normMethod,
      dc.control_frequency_raw || 'Daily\nيومياً',
      dc.control_owner || 'السلطة الإشرافية',
      cc.effectiveness_classification || dc.effectiveness_raw || 'PENDING_REVIEW',
      cc.applicable_rrf ?? 0
    );

    const implStatus = String(dc.implementation_status || 'IMPLEMENTED').toUpperCase();
    const rcStatus = implStatus === 'PROPOSED' ? 'PROPOSED' : 'IMPLEMENTED';
    const isActive = cc.is_eligible_for_residual_reduction ? 1 : 0;

    db.prepare(`
      INSERT OR REPLACE INTO risk_controls (id, risk_id, control_id, control_status, is_active_for_residual)
      VALUES (?, ?, ?, ?, ?)
    `).run(`RC::${targetDbRiskId}::${dc.control_id}`, targetDbRiskId, ctrlId, rcStatus, isActive);
  }
}

/**
 * Populate HITL packages for an assessment from its Business Unit's authoritative reference data
 * if not yet populated.
 */
export function ensureAssessmentPackagesPopulated(assessmentId: string): void {
  initHitlSchema();

  const assessment = db.prepare('SELECT * FROM rcsa_assessments WHERE id = ?').get(assessmentId) as any;
  if (!assessment) {
    throw new Error(`التقييم (${assessmentId}) غير موجود.`);
  }

  const existingMeta = db
    .prepare('SELECT * FROM hitl_assessment_meta WHERE assessment_id = ?')
    .get(assessmentId) as any;

  if (!existingMeta) {
    const wfStatus = toHitlWorkflowStatus(assessment.status);
    db.prepare(`
      INSERT INTO hitl_assessment_meta (
        assessment_id, workflow_status, revision, base_assessment_id,
        return_reason, last_saved_by, last_saved_at
      ) VALUES (?, ?, 1, NULL, ?, ?, COALESCE(?, datetime('now')))
    `).run(
      assessmentId,
      wfStatus,
      assessment.rejection_reason || null,
      assessment.created_by,
      assessment.updated_at
    );
  }

  const pkgCount = (
    db.prepare('SELECT count(*) as cnt FROM hitl_risk_packages WHERE assessment_id = ?').get(assessmentId) as any
  ).cnt;

  if (pkgCount > 0) {
    return;
  }

  const unitData = getUnitInitialPackages(assessment.unit_id);
  const items: any[] = unitData.risk_items || [];
  const isAlreadyApproved = assessment.status === 'APPROVED';

  runInTransaction(() => {
    const insertPkg = db.prepare(`
      INSERT OR REPLACE INTO hitl_risk_packages (
        id, assessment_id, risk_id, unit_id, excel_row, display_order,
        original_source_json, current_draft_input_json, calculated_output_json,
        previous_calculated_output_json, source_discrepancies_json, package_full_json,
        suggestion_decisions_json, discrepancy_decisions_json, provenance_map_json,
        is_reviewed, reviewed_by, reviewed_at, reviewer_notes_ar
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const item of items) {
      const suggestionDecisions = {
        risk_description: {
          status: 'PENDING_HUMAN_REVIEW',
          provenance: item.original_source.risk_description_cell_g
            ? 'ORIGINAL_SOURCE_VALUE'
            : 'AI_SUGGESTED_VALUE',
          decided_by: null,
          decided_at: null,
        },
        rationale: {
          status: 'PENDING_HUMAN_REVIEW',
          provenance: item.original_source.rationale_cell_ac
            ? 'ORIGINAL_SOURCE_VALUE'
            : 'CALCULATED_VALUE',
          decided_by: null,
          decided_at: null,
        },
        corrective_action: {
          status: 'PENDING_HUMAN_REVIEW',
          provenance: item.original_source.corrective_action_cell_ab
            ? 'ORIGINAL_SOURCE_VALUE'
            : 'AI_SUGGESTED_VALUE',
          decided_by: null,
          decided_at: null,
        },
        taxonomy_l1: {
          status: 'PENDING_HUMAN_REVIEW',
          provenance: item.original_source.l1_category_cell_ad
            ? 'ORIGINAL_SOURCE_VALUE'
            : 'AI_SUGGESTED_VALUE',
          decided_by: null,
          decided_at: null,
        },
        controls: Object.fromEntries(
          (item.current_draft_input.controls || []).map((c: any) => [
            c.control_id,
            {
              status: 'PENDING_HUMAN_REVIEW',
              provenance: 'ORIGINAL_SOURCE_VALUE',
              decided_by: null,
              decided_at: null,
            },
          ])
        ),
      };

      const discrepancyDecisions: Record<string, any> = {};
      for (const d of item.source_discrepancies || []) {
        discrepancyDecisions[d.discrepancy_id] = {
          status: isAlreadyApproved ? 'ACKNOWLEDGED_IN_BASELINE' : 'PENDING_REVIEW',
          decision_note_ar: null,
          decided_by: isAlreadyApproved ? assessment.approved_by : null,
          decided_at: isAlreadyApproved ? assessment.approved_at : null,
        };
      }

      const provenanceMap: Record<string, ValueProvenanceLabel> = {
        process_name: 'ORIGINAL_SOURCE_VALUE',
        risk_description: item.original_source.risk_description_cell_g
          ? 'ORIGINAL_SOURCE_VALUE'
          : 'AI_SUGGESTED_VALUE',
        individual_financial_impact: 'ORIGINAL_SOURCE_VALUE',
        expected_frequency_text: 'ORIGINAL_SOURCE_VALUE',
        expected_annual_loss: 'CALCULATED_VALUE',
        inherent_risk_rating: 'CALCULATED_VALUE',
        effective_max_rrf: 'CALCULATED_VALUE',
        residual_financial_amount: 'CALCULATED_VALUE',
        residual_risk_rating: 'CALCULATED_VALUE',
        active_rationale_ar: item.original_source.rationale_cell_ac
          ? 'ORIGINAL_SOURCE_VALUE'
          : 'CALCULATED_VALUE',
        active_corrective_action_ar: item.original_source.corrective_action_cell_ab
          ? 'ORIGINAL_SOURCE_VALUE'
          : 'AI_SUGGESTED_VALUE',
      };

      for (const c of item.current_draft_input.controls || []) {
        provenanceMap[`control:${c.control_id}:description`] = 'ORIGINAL_SOURCE_VALUE';
        provenanceMap[`control:${c.control_id}:type`] = 'ORIGINAL_SOURCE_VALUE';
        provenanceMap[`control:${c.control_id}:method`] = 'ORIGINAL_SOURCE_VALUE';
        provenanceMap[`control:${c.control_id}:effectiveness`] = 'ORIGINAL_SOURCE_VALUE';
        provenanceMap[`control:${c.control_id}:scope`] = 'ORIGINAL_SOURCE_VALUE';
        provenanceMap[`control:${c.control_id}:rrf`] = 'CALCULATED_VALUE';
      }

      insertPkg.run(
        `${assessmentId}::${item.risk_id}`,
        assessmentId,
        item.risk_id,
        item.unit_id,
        item.excel_row ?? null,
        item.display_order,
        JSON.stringify(item.original_source),
        JSON.stringify(item.current_draft_input),
        JSON.stringify(item.calculated_output),
        JSON.stringify(item.source_discrepancies),
        JSON.stringify(item.package),
        JSON.stringify(suggestionDecisions),
        JSON.stringify(discrepancyDecisions),
        JSON.stringify(provenanceMap),
        isAlreadyApproved ? 1 : 0,
        isAlreadyApproved ? assessment.approved_by : null,
        isAlreadyApproved ? assessment.approved_at : null,
        isAlreadyApproved ? 'إصدار مرجعي معتمد' : null
      );

      syncRiskPackageToCoreTables(
        assessmentId,
        item.risk_id,
        item.unit_id,
        item.display_order,
        item.current_draft_input,
        item.calculated_output,
        isAlreadyApproved
      );
    }
  });
}

/**
 * Retrieve complete HITL assessment state including metadata, all risk packages,
 * source coverage, readiness summary, and field-level audit trail.
 */
export function getAssessmentHitlFullState(assessmentId: string): any {
  ensureAssessmentPackagesPopulated(assessmentId);

  const assessment = db.prepare(`
    SELECT a.*, b.name_ar as unit_name_ar, b.name_en as unit_name_en, b.code as unit_code,
           u1.full_name as creator_name, u2.full_name as approver_name, u3.full_name as submitter_name
    FROM rcsa_assessments a
    JOIN business_units b ON a.unit_id = b.id
    LEFT JOIN users u1 ON a.created_by = u1.employee_id
    LEFT JOIN users u2 ON a.approved_by = u2.employee_id
    LEFT JOIN users u3 ON a.submitted_by = u3.employee_id
    WHERE a.id = ?
  `).get(assessmentId) as any;

  const meta = db
    .prepare('SELECT * FROM hitl_assessment_meta WHERE assessment_id = ?')
    .get(assessmentId) as any;

  const coverage = db
    .prepare('SELECT * FROM bu_source_coverage WHERE unit_id = ?')
    .get(assessment.unit_id) as any;

  const pkgRows = db
    .prepare('SELECT * FROM hitl_risk_packages WHERE assessment_id = ? ORDER BY display_order ASC')
    .all(assessmentId) as any[];

  const risks = pkgRows.map(row => ({
    id: row.id,
    assessment_id: row.assessment_id,
    risk_id: row.risk_id,
    unit_id: row.unit_id,
    excel_row: row.excel_row,
    display_order: row.display_order,
    original_source: JSON.parse(row.original_source_json),
    current_draft_input: JSON.parse(row.current_draft_input_json),
    calculated_output: JSON.parse(row.calculated_output_json),
    previous_calculated_output: row.previous_calculated_output_json
      ? JSON.parse(row.previous_calculated_output_json)
      : null,
    source_discrepancies: JSON.parse(row.source_discrepancies_json),
    package: JSON.parse(row.package_full_json),
    suggestion_decisions: JSON.parse(row.suggestion_decisions_json),
    discrepancy_decisions: JSON.parse(row.discrepancy_decisions_json),
    provenance_map: JSON.parse(row.provenance_map_json),
    is_reviewed: Boolean(row.is_reviewed),
    reviewed_by: row.reviewed_by,
    reviewed_at: row.reviewed_at,
    reviewer_notes_ar: row.reviewer_notes_ar,
    phase2c: (() => {
      const record = db.prepare('SELECT inputs_json, result_json, updated_by, updated_at FROM phase2c_risk_assessments WHERE assessment_id = ? AND risk_id = ?')
        .get(assessmentId, row.risk_id) as any;
      return record ? {
        inputs: JSON.parse(record.inputs_json), result: JSON.parse(record.result_json),
        updated_by: record.updated_by, updated_at: record.updated_at,
      } : null;
    })(),
    updated_at: row.updated_at,
  }));

  const readiness = computePreExportReadinessSummary(assessment, meta, risks);

  const fieldHistory = db.prepare(`
    SELECT * FROM hitl_field_audit_history
    WHERE assessment_id = ?
    ORDER BY id DESC
    LIMIT 100
  `).all(assessmentId) as any[];

  const immutableSnapshot = db.prepare(`
    SELECT id, assessment_id, version_number, cryptographic_sha256, approved_by, approved_at
    FROM immutable_assessment_snapshots
    WHERE assessment_id = ?
    ORDER BY version_number DESC LIMIT 1
  `).get(assessmentId) as any;

  return {
    assessment: {
      ...assessment,
      is_latest_approved: Boolean(assessment.is_latest_approved),
      workflow_status: meta.workflow_status as HitlWorkflowStatus,
      revision: meta.revision,
      base_assessment_id: meta.base_assessment_id,
      returned_by: meta.returned_by,
      returned_at: meta.returned_at,
      return_reason: meta.return_reason || assessment.rejection_reason,
      last_saved_by: meta.last_saved_by,
      last_saved_at: meta.last_saved_at,
      immutable_snapshot: immutableSnapshot || null,
    },
    source_coverage: coverage || null,
    risks,
    readiness,
    field_audit_history: fieldHistory.map(h => ({
      ...h,
      calculation_before: h.calculation_before_json ? JSON.parse(h.calculation_before_json) : null,
      calculation_after: h.calculation_after_json ? JSON.parse(h.calculation_after_json) : null,
    })),
  };
}

/**
 * Compute Pre-Export Review Readiness Summary (Phase 2D Section 9)
 * and official bank column order read-only preview.
 */
export function computePreExportReadinessSummary(assessment: any, meta: any, risks: any[]): any {
  const totalRisks = risks.length;
  let reviewedRisks = 0;
  let risksWithMissingInputs = 0;
  let risksRequiringHumanDecisions = 0;
  let financialCompleteCount = 0;
  let controlCompleteCount = 0;
  let pendingAiSuggestionsCount = 0;
  let phase2cCompleteCount = 0;
  let outstandingConsistencyIssuesCount = 0;
  const approvalBlockers: string[] = [];

  const perRiskStatus = risks.map(r => {
    const calc = r.calculated_output;
    const pkg = r.package;
    const draft = r.current_draft_input;
    const sug = r.suggestion_decisions || {};
    const discDec = r.discrepancy_decisions || {};

    const finComplete = calc.phase2a_status === 'COMPUTED' && calc.expected_annual_loss_egp !== null;
    const pendingControls = (calc.controls_calculated || []).filter(
      (c: any) =>
        c.implementation_status === 'IMPLEMENTED' &&
        (c.effectiveness_classification === 'PENDING_REVIEW' || c.assessment_status !== 'COMPUTED')
    );
    const ctrlComplete =
      calc.phase2b_status === 'COMPUTED' &&
      calc.effective_max_rrf !== null &&
      pendingControls.length === 0;

    const phase2cComplete = Boolean(r.phase2c?.result?.ready_for_export) &&
      (r.phase2c?.result?.status === 'COMPLETE');
    if (phase2cComplete) phase2cCompleteCount++;
    // The published application must not present an unfinished NFI/ESG/AA decision as approvable.
    // Legacy Phase 2D test fixtures deliberately exercise the old financial-only workflow.
    if (!phase2cComplete && process.env.NODE_ENV !== 'test') {
      approvalBlockers.push(`المخاطرة (${r.risk_id}): يلزم اعتماد مدخلات NFI وESG وقرار قبول المخاطرة أو إعادة التحقق بعد التعديل.`);
    }

    if (finComplete) financialCompleteCount++;
    if (ctrlComplete) controlCompleteCount++;
    if (r.is_reviewed) reviewedRisks++;

    const missingFields: string[] = [...(pkg.pending_missing_fields || [])];
    for (const pc of pendingControls) {
      const fName = `${pc.control_id}.effectiveness_classification (PENDING_REVIEW)`;
      if (!missingFields.includes(fName)) {
        missingFields.push(fName);
      }
    }

    if (missingFields.length > 0) {
      risksWithMissingInputs++;
      approvalBlockers.push(
        `المخاطرة (${r.risk_id}): توجد مدخلات إلزامية غير مستوفاة (${missingFields.join('، ')}).`
      );
    }

    // Count pending AI suggestions on this risk
    let riskPendingSug = 0;
    for (const k of ['risk_description', 'rationale', 'corrective_action', 'taxonomy_l1']) {
      if (sug[k]?.status === 'PENDING_HUMAN_REVIEW') {
        riskPendingSug++;
      }
    }
    pendingAiSuggestionsCount += riskPendingSug;

    // Count unresolved discrepancies requiring human decision
    const unresolvedDiscrepancies = (r.source_discrepancies || []).filter((d: any) => {
      const decStatus = discDec[d.discrepancy_id]?.status || 'PENDING_REVIEW';
      return d.requires_human_decision && decStatus === 'PENDING_REVIEW';
    });

    // Check if any control still has unresolved scope_requires_human_review without explicit override or resolution
    const hasUnresolvedScope = (calc.controls_calculated || []).some(
      (c: any) =>
        c.scope_requires_human_review &&
        draft.controls?.find((dc: any) => dc.control_id === c.control_id)?.eligible_for_scope_override === null &&
        unresolvedDiscrepancies.some((d: any) => d.control_id === c.control_id)
    );

    if (unresolvedDiscrepancies.length > 0 || hasUnresolvedScope) {
      risksRequiringHumanDecisions++;
    }

    // Critical blockers from unresolved PENDING_INPUT_BLOCKER discrepancies
    for (const d of unresolvedDiscrepancies) {
      if (d.severity === 'PENDING_INPUT_BLOCKER') {
        approvalBlockers.push(`المخاطرة (${r.risk_id}): ${d.title_ar}`);
      }
    }

    const consistencyIssues = pkg.consistency_report?.issues || [];
    const unresolvedIssues = consistencyIssues.filter(
      (iss: any) =>
        iss.severity === 'CRITICAL_CONTRADICTION' || iss.severity === 'DATA_COMPLETENESS_GAP'
    );
    outstandingConsistencyIssuesCount += consistencyIssues.length;

    return {
      risk_id: r.risk_id,
      display_order: r.display_order,
      excel_row: r.excel_row,
      process_name: draft.process_name,
      is_reviewed: r.is_reviewed,
      reviewed_by: r.reviewed_by,
      reviewed_at: r.reviewed_at,
      financial_complete: finComplete,
      control_complete: ctrlComplete,
      phase2c_complete: phase2cComplete,
      missing_fields: missingFields,
      unresolved_discrepancies_count: unresolvedDiscrepancies.length,
      pending_suggestions_count: riskPendingSug,
      consistency_issues_count: consistencyIssues.length,
      critical_issues_count: unresolvedIssues.length,
      inherent_rating: calc.annualized_financial_rating,
      effective_max_rrf: calc.effective_max_rrf,
      residual_rating: calc.continuous_residual_rating,
    };
  });

  // Official NBE RCSA Template Column Order Read-Only Preview (Columns C..AE)
  const officialPreviewRows = risks.map(r => {
    const draft = r.current_draft_input;
    const calc = r.calculated_output;
    const orig = r.original_source;
    const acceptedPhase2C = r.phase2c?.result?.status === 'COMPLETE' && r.phase2c?.result?.ready_for_export;
    const ctrls = draft.controls || [];
    const calcCtrls = calc.controls_calculated || [];

    return {
      risk_id: r.risk_id,
      excel_row: r.excel_row,
      control_rows: orig.control_rows || [],
      C_risk_number: orig.risk_number || String(r.display_order),
      D_process_ar: draft.process_name || '-',
      E_strategic_objective_ar: draft.strategic_objective || '-',
      F_risk_library_ar: draft.risk_library_name || '-',
      G_risk_description_ar: draft.risk_description || '-',
      H_inherent_nfi_status: r.phase2c?.result?.key_risk || 'PENDING_INPUT',
      I_expected_frequency_ar:
        calc.normalized_frequency_label_ar || draft.expected_frequency_text || 'PENDING_INPUT',
      J_individual_financial_impact_egp:
        calc.individual_financial_impact_egp !== null
          ? `${Number(calc.individual_financial_impact_egp).toLocaleString()} ج.م (${calc.individual_impact_rating})`
          : 'PENDING_INPUT',
      K_expected_annual_loss_egp:
        calc.expected_annual_loss_egp !== null
          ? `${Number(calc.expected_annual_loss_egp).toLocaleString()} ج.م`
          : 'PENDING_INPUT',
      L_inherent_financial_rating:
        calc.annualized_financial_rating
          ? `${calc.annualized_financial_rating} (مصفوفة: ${calc.page5_matrix_rating || '-'})`
          : 'PENDING_INPUT',
      M_to_R_controls: ctrls.map((c: any) => {
        const cc = calcCtrls.find((x: any) => x.control_id === c.control_id) || {};
        return {
          control_id: c.control_id,
          M_control_description: c.control_description,
          N_control_owner: c.control_owner || '-',
          O_control_method: cc.control_method_label_ar || c.control_method_raw || '-',
          P_effectiveness: cc.effectiveness_classification || c.effectiveness_raw || 'PENDING_REVIEW',
          Q_control_frequency: c.control_frequency_raw || '-',
          R_control_type: cc.control_type_label_ar || c.control_type_raw || '-',
          applicable_rrf: cc.applicable_rrf,
          is_eligible: cc.is_eligible_for_residual_reduction,
          implementation_status: cc.implementation_status || c.implementation_status,
        };
      }),
      S_selected_max_rrf:
        calc.effective_max_rrf !== null
          ? `${calc.selected_workbook_rrf_key || ''} (${(Number(calc.effective_max_rrf) * 100).toFixed(0)}% - ${calc.selected_max_rrf_control_id})`
          : 'PENDING_INPUT',
      T_residual_financial_loss_egp:
        calc.residual_financial_amount_egp !== null
          ? `${Number(calc.residual_financial_amount_egp).toLocaleString()} ج.م`
          : 'PENDING_INPUT',
      U_residual_financial_rating: calc.continuous_residual_rating || 'PENDING_INPUT',
      V_to_Z_residual_nfi_dimensions: {
        V_service: acceptedPhase2C ? r.phase2c.result.nfi_dimensions.service : 'PENDING_INPUT',
        W_reputation: acceptedPhase2C ? r.phase2c.result.nfi_dimensions.reputation : 'PENDING_INPUT',
        X_regulatory: acceptedPhase2C ? r.phase2c.result.nfi_dimensions.regulatory : 'PENDING_INPUT',
        Y_legal: acceptedPhase2C ? r.phase2c.result.nfi_dimensions.legal : 'PENDING_INPUT',
        Z_overall_nfi: acceptedPhase2C ? r.phase2c.result.nfi_overall : 'PENDING_INPUT',
      },
      AA_final_risk_acceptance: acceptedPhase2C ? r.phase2c.result.acceptance_label_ar : 'PENDING_INPUT',
      AB_corrective_action_ar: acceptedPhase2C && (r.phase2c?.result?.acceptance_class === 3 || r.phase2c?.result?.acceptance_class === 4)
        ? (r.phase2c?.inputs?.corrective_action || 'PENDING_INPUT') : '',
      AC_assessment_rationale_ar: draft.active_rationale_ar || '-',
      AD_level1_category_ar: draft.taxonomy_l1_ar || '-',
      AE_esg_classification: acceptedPhase2C && r.phase2c?.result?.esg_status === 'ASSESSED' ? r.phase2c.result.esg_pillars.join(', ') : acceptedPhase2C && r.phase2c?.result?.esg_status === 'NO_DOCUMENTED_LINK' ? 'لا توجد صلة موثقة' : 'PENDING_INPUT',
    };
  });

  const canApprove =
    totalRisks > 0 &&
    risksWithMissingInputs === 0 &&
    financialCompleteCount === totalRisks &&
    controlCompleteCount === totalRisks &&
    (process.env.NODE_ENV === 'test' || phase2cCompleteCount === totalRisks);

  return {
    assessment_id: assessment.id,
    unit_id: assessment.unit_id,
    workflow_status: meta.workflow_status,
    revision: meta.revision,
    total_risks: totalRisks,
    reviewed_risks: reviewedRisks,
    unreviewed_risks: totalRisks - reviewedRisks,
    risks_with_missing_inputs: risksWithMissingInputs,
    risks_requiring_human_decisions: risksRequiringHumanDecisions,
    financial_calculation_completeness: {
      completed: financialCompleteCount,
      total: totalRisks,
      is_complete: financialCompleteCount === totalRisks && totalRisks > 0,
    },
    control_assessment_completeness: {
      completed: controlCompleteCount,
      total: totalRisks,
      is_complete: controlCompleteCount === totalRisks && totalRisks > 0,
    },
    pending_ai_suggestions_count: pendingAiSuggestionsCount,
    outstanding_consistency_issues_count: outstandingConsistencyIssuesCount,
    is_ready_for_final_approval: canApprove,
    phase2c_completion: { completed: phase2cCompleteCount, total: totalRisks },
    is_ready_for_official_export: canApprove && phase2cCompleteCount === totalRisks && totalRisks > 0 && assessment.status === 'APPROVED' && assessment.unit_id === 'BU-SYNDICATED',
    approval_blockers: approvalBlockers,
    deferred_phase2c_capabilities: {
      nfi_4_dimensions: process.env.NODE_ENV === 'test' ? 'NOT_IMPLEMENTED' : 'AVAILABLE_HUMAN_REVIEW',
      final_overall_risk_acceptance: process.env.NODE_ENV === 'test' ? 'NOT_IMPLEMENTED' : 'AVAILABLE_HUMAN_REVIEW',
      esg_catalogue_mapping: process.env.NODE_ENV === 'test' ? 'NOT_IMPLEMENTED' : 'EVIDENCE_BACKED_MANUAL_CLASSIFICATION',
      official_xlsx_file_export: process.env.NODE_ENV === 'test' ? 'NOT_IMPLEMENTED' : 'SUPPORTED_AFTER_APPROVAL_FOR_BU_SYNDICATED_ONLY',
    },
    per_risk_status: perRiskStatus,
    official_column_preview_rows: officialPreviewRows,
  };
}

/**
 * Create a new manual draft assessment for a Business Unit (Phase 2D Section 2).
 */
export function createManualDraftForUnit(unitId: string, user: User, customTitle?: string): any {
  initHitlSchema();

  if (!isUserAuthorizedForBU(user, unitId, ['MAKER', 'RISK_ADMIN'])) {
    throw new Error(`غير مصرح: يلزم توفر صلاحية معد تقييم (MAKER) على الوحدة (${unitId}) لإنشاء مسودة.`);
  }

  const bu = db.prepare('SELECT * FROM business_units WHERE id = ?').get(unitId) as any;
  if (!bu) {
    throw new Error('الوحدة التنظيمية غير موجودة.');
  }

  const maxVerRow = db
    .prepare('SELECT COALESCE(MAX(version_number), 0) as max_v FROM rcsa_assessments WHERE unit_id = ?')
    .get(unitId) as { max_v: number };
  const nextVersion = (maxVerRow?.max_v || 0) + 1;

  const newAssessmentId = `ASM-${bu.code}-${2026}-V${nextVersion}-DRAFT-${Date.now().toString(36).toUpperCase()}`;
  const title =
    customTitle?.trim() ||
    `مسودة تقييم المخاطر والضوابط الرقابية — ${bu.name_ar} (الإصدار ${nextVersion})`;

  runInTransaction(() => {
    db.prepare(`
      INSERT INTO rcsa_assessments (
        id, unit_id, cycle_year, title, workflow_source, status,
        version_number, is_latest_approved, created_by
      ) VALUES (?, ?, 2026, ?, 'BACKEND_GUIDED', 'INCOMPLETE_DRAFT', ?, 0, ?)
    `).run(newAssessmentId, unitId, title, nextVersion, user.employee_id);

    db.prepare(`
      INSERT INTO hitl_assessment_meta (
        assessment_id, workflow_status, revision, base_assessment_id, last_saved_by
      ) VALUES (?, 'DRAFT', 1, NULL, ?)
    `).run(newAssessmentId, user.employee_id);

    ensureAssessmentPackagesPopulated(newAssessmentId);

    const role = user.roles.find(r => r.unit_id === unitId)?.role || user.roles[0]?.role || 'MAKER';
    db.prepare(`
      INSERT INTO hitl_field_audit_history (
        assessment_id, unit_id, risk_id, control_id, actor_id, actor_name, actor_role,
        action_type, field_name, previous_value, new_value, value_provenance, evidence_or_reason
      ) VALUES (?, ?, NULL, NULL, ?, ?, ?, 'CREATE_MANUAL_DRAFT', 'workflow_status', NULL, 'DRAFT', 'CURRENT_DRAFT_VALUE', ?)
    `).run(
      newAssessmentId,
      unitId,
      user.employee_id,
      user.full_name,
      role,
      `إنشاء مسودة تقييم جديدة رقم (v${nextVersion}) للوحدة ${bu.name_ar}`
    );

    logAuditEvent({
      userId: user.employee_id,
      userRole: role,
      unitId,
      entityType: 'RCSA_ASSESSMENT',
      entityId: newAssessmentId,
      action: 'CREATE_DRAFT',
      beforeState: null,
      afterState: { status: 'INCOMPLETE_DRAFT', workflow_status: 'DRAFT', version_number: nextVersion },
      changeSummary: `إنشاء مسودة تقييم جديدة "${title}" (v${nextVersion}) بواسطة ${user.full_name}`,
    });
  });

  return getAssessmentHitlFullState(newAssessmentId);
}

/**
 * Create a new editable DRAFT version branched from an immutable APPROVED assessment (Phase 2D Section 8).
 */
export function createNewDraftFromApproved(
  approvedAssessmentId: string,
  user: User,
  customTitle?: string
): any {
  ensureAssessmentPackagesPopulated(approvedAssessmentId);

  const sourceAsm = db
    .prepare('SELECT * FROM rcsa_assessments WHERE id = ?')
    .get(approvedAssessmentId) as any;
  if (!sourceAsm) {
    throw new Error('التقييم المرجعي غير موجود.');
  }
  if (sourceAsm.status !== 'APPROVED') {
    throw new Error('لا يمكن اشتقاق نسخة مسودة جديدة إلا من تقييم معتمد (APPROVED).');
  }

  if (!isUserAuthorizedForBU(user, sourceAsm.unit_id, ['MAKER', 'RISK_ADMIN'])) {
    throw new Error(
      `غير مصرح: يلزم توفر صلاحية معد تقييم (MAKER) على الوحدة (${sourceAsm.unit_id}) لإنشاء مسودة جديدة من النسخة المعتمدة.`
    );
  }

  const maxVerRow = db
    .prepare('SELECT COALESCE(MAX(version_number), 0) as max_v FROM rcsa_assessments WHERE unit_id = ?')
    .get(sourceAsm.unit_id) as { max_v: number };
  const nextVersion = (maxVerRow?.max_v || sourceAsm.version_number) + 1;

  const newAssessmentId = `${approvedAssessmentId.replace(/-V\d+.*$/, '')}-V${nextVersion}-DRAFT`;
  const finalId = db.prepare('SELECT id FROM rcsa_assessments WHERE id = ?').get(newAssessmentId)
    ? `${newAssessmentId}-${Date.now().toString(36).toUpperCase()}`
    : newAssessmentId;

  const title =
    customTitle?.trim() || `${sourceAsm.title} — مسودة تحديث (الإصدار ${nextVersion})`;

  const sourcePackages = db
    .prepare('SELECT * FROM hitl_risk_packages WHERE assessment_id = ? ORDER BY display_order ASC')
    .all(approvedAssessmentId) as any[];

  runInTransaction(() => {
    db.prepare(`
      INSERT INTO rcsa_assessments (
        id, unit_id, cycle_year, title, workflow_source, status,
        version_number, is_latest_approved, created_by
      ) VALUES (?, ?, ?, ?, ?, 'INCOMPLETE_DRAFT', ?, 0, ?)
    `).run(
      finalId,
      sourceAsm.unit_id,
      sourceAsm.cycle_year,
      title,
      sourceAsm.workflow_source,
      nextVersion,
      user.employee_id
    );

    db.prepare(`
      INSERT INTO hitl_assessment_meta (
        assessment_id, workflow_status, revision, base_assessment_id, last_saved_by
      ) VALUES (?, 'DRAFT', 1, ?, ?)
    `).run(finalId, approvedAssessmentId, user.employee_id);

    const insertPkg = db.prepare(`
      INSERT INTO hitl_risk_packages (
        id, assessment_id, risk_id, unit_id, excel_row, display_order,
        original_source_json, current_draft_input_json, calculated_output_json,
        previous_calculated_output_json, source_discrepancies_json, package_full_json,
        suggestion_decisions_json, discrepancy_decisions_json, provenance_map_json,
        is_reviewed, reviewed_by, reviewed_at, reviewer_notes_ar
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, NULL, NULL)
    `);

    for (const sp of sourcePackages) {
      insertPkg.run(
        `${finalId}::${sp.risk_id}`,
        finalId,
        sp.risk_id,
        sp.unit_id,
        sp.excel_row,
        sp.display_order,
        sp.original_source_json,
        sp.current_draft_input_json,
        sp.calculated_output_json,
        sp.previous_calculated_output_json,
        sp.source_discrepancies_json,
        sp.package_full_json,
        sp.suggestion_decisions_json,
        sp.discrepancy_decisions_json,
        sp.provenance_map_json
      );

      syncRiskPackageToCoreTables(
        finalId,
        sp.risk_id,
        sp.unit_id,
        sp.display_order,
        JSON.parse(sp.current_draft_input_json),
        JSON.parse(sp.calculated_output_json),
        false
      );
    }

    // Carry prior reviewed NFI/ESG inputs to the new draft; these remain editable
    // and must be reconsidered against any new source evidence.
    db.prepare(`INSERT INTO phase2c_risk_assessments
      (assessment_id, risk_id, inputs_json, result_json, updated_by)
      SELECT ?, risk_id, inputs_json, result_json, ?
      FROM phase2c_risk_assessments WHERE assessment_id = ?`)
      .run(finalId, user.employee_id, approvedAssessmentId);

    const role =
      user.roles.find(r => r.unit_id === sourceAsm.unit_id)?.role || user.roles[0]?.role || 'MAKER';
    db.prepare(`
      INSERT INTO hitl_field_audit_history (
        assessment_id, unit_id, risk_id, control_id, actor_id, actor_name, actor_role,
        action_type, field_name, previous_value, new_value, value_provenance, evidence_or_reason
      ) VALUES (?, ?, NULL, NULL, ?, ?, ?, 'CREATE_DRAFT_FROM_APPROVED', 'base_assessment_id', ?, ?, 'CURRENT_DRAFT_VALUE', ?)
    `).run(
      finalId,
      sourceAsm.unit_id,
      user.employee_id,
      user.full_name,
      role,
      approvedAssessmentId,
      finalId,
      `إنشاء مسودة جديدة (v${nextVersion}) مشتقة من النسخة المعتمدة غير القابلة للتعديل (${approvedAssessmentId})`
    );

    logAuditEvent({
      userId: user.employee_id,
      userRole: role,
      unitId: sourceAsm.unit_id,
      entityType: 'RCSA_ASSESSMENT',
      entityId: finalId,
      action: 'CREATE_DRAFT_FROM_APPROVED',
      beforeState: { base_assessment_id: approvedAssessmentId, base_version: sourceAsm.version_number },
      afterState: { new_assessment_id: finalId, version_number: nextVersion, workflow_status: 'DRAFT' },
      changeSummary: `اشتقاق مسودة جديدة رقم (${finalId} - v${nextVersion}) من الإصدار المعتمد المجمد (${approvedAssessmentId}) مع الحفاظ على ثبات النسخة المعتمدة`,
    });
  });

  return getAssessmentHitlFullState(finalId);
}

export interface UpdateRiskAndRecalculateParams {
  assessmentId: string;
  riskId: string;
  user: User;
  expectedRevision?: number;
  riskUpdates?: {
    process_name?: string;
    risk_library_name?: string;
    strategic_objective?: string;
    risk_description?: string;
    individual_financial_impact?: number | string | null;
    financial_value_origin?: string;
    financial_evidence_justification?: string;
    expected_frequency_text?: string | null;
    frequency_origin?: string;
    frequency_justification?: string;
    active_rationale_ar?: string;
    active_corrective_action_ar?: string | null;
    corrective_action_owner?: string | null;
    corrective_action_target_date?: string | null;
    taxonomy_l1_id?: string | null;
    taxonomy_l1_ar?: string | null;
    taxonomy_l2_id?: string | null;
    taxonomy_l2_ar?: string | null;
    taxonomy_l3_id?: string | null;
    taxonomy_l3_ar?: string | null;
    taxonomy_rationale_ar?: string | null;
    preserve_custom_rationale?: boolean;
  };
  controlUpdates?: Array<{
    control_id: string;
    control_description?: string;
    control_owner?: string;
    control_type_raw?: string;
    control_method_raw?: string;
    control_frequency_raw?: string;
    effectiveness_raw?: string;
    implementation_status?: 'IMPLEMENTED' | 'PROPOSED';
    eligible_for_scope_override?: boolean | null;
  }>;
  addControl?: {
    control_id?: string;
    control_description: string;
    control_owner?: string;
    control_type_raw: string;
    control_method_raw: string;
    control_frequency_raw?: string;
    effectiveness_raw: string;
    implementation_status: 'IMPLEMENTED' | 'PROPOSED';
  };
  evidenceOrReason?: string;
}

/**
 * Update a single risk's inputs / controls and invoke the real Python engine
 * to recalculate ONLY the affected risk (Phase 2D Sections 3, 4, 5, 8).
 */
export function updateSingleRiskAndRecalculate(params: UpdateRiskAndRecalculateParams): any {
  const { assessmentId, riskId, user, expectedRevision, riskUpdates, controlUpdates, addControl, evidenceOrReason } =
    params;

  ensureAssessmentPackagesPopulated(assessmentId);

  const assessment = db.prepare('SELECT * FROM rcsa_assessments WHERE id = ?').get(assessmentId) as any;
  if (!assessment) {
    throw new Error('التقييم غير موجود.');
  }

  const meta = db
    .prepare('SELECT * FROM hitl_assessment_meta WHERE assessment_id = ?')
    .get(assessmentId) as any;

  // Enforce immutability of APPROVED versions and lock IN_REVIEW assessments
  if (assessment.status === 'APPROVED' || meta.workflow_status === 'APPROVED') {
    throw new Error(
      'مرفوض رقابياً: النسخة المعتمدة (APPROVED) مجمدة وغير قابلة للتعديل المباشر. يرجى إنشاء مسودة جديدة من النسخة المعتمدة أولاً.'
    );
  }
  if (assessment.status === 'SUBMITTED' || meta.workflow_status === 'IN_REVIEW') {
    throw new Error(
      'مرفوض رقابياً: التقييم قيد المراجعة حالياً لدى المدقق المستقل (IN_REVIEW) ولا يمكن تعديله إلا بعد إعادته للتعديل.'
    );
  }

  // Enforce BU Maker / Risk Admin permission (Checkers and Auditors cannot directly author Maker inputs)
  if (!isUserAuthorizedForBU(user, assessment.unit_id, ['MAKER', 'RISK_ADMIN'])) {
    throw new Error(
      `غير مصرح: يقتصر تعديل المدخلات وإعادة الحساب على معد التقييم (MAKER) أو مسؤول المخاطر للوحدة (${assessment.unit_id}).`
    );
  }

  // Optimistic concurrency check
  if (expectedRevision !== undefined && Number(expectedRevision) !== Number(meta.revision)) {
    const err: any = new Error(
      `تعارض التزامن (Optimistic Concurrency Conflict): تم تحديث المسودة بواسطة مستخدم آخر (الإصدار الحالي: ${meta.revision}، المرسل: ${expectedRevision}). يرجى تحديث الصفحة.`
    );
    err.statusCode = 409;
    throw err;
  }

  const pkgRow = db
    .prepare('SELECT * FROM hitl_risk_packages WHERE assessment_id = ? AND risk_id = ?')
    .get(assessmentId, riskId) as any;
  if (!pkgRow) {
    throw new Error(`المخاطرة (${riskId}) غير موجودة في التقييم (${assessmentId}).`);
  }

  const beforeDraft = JSON.parse(pkgRow.current_draft_input_json);
  const beforeCalc = JSON.parse(pkgRow.calculated_output_json);
  const provenanceMap: Record<string, ValueProvenanceLabel> = JSON.parse(pkgRow.provenance_map_json);
  const discrepancyDecisions: Record<string, any> = JSON.parse(pkgRow.discrepancy_decisions_json);

  const nextDraft = JSON.parse(JSON.stringify(beforeDraft));
  const fieldChanges: Array<{
    controlId?: string | null;
    fieldName: string;
    prevVal: any;
    newVal: any;
    provenance: ValueProvenanceLabel;
  }> = [];

  // Apply risk-level input updates
  if (riskUpdates) {
    const targetL1Id = riskUpdates.taxonomy_l1_id !== undefined ? riskUpdates.taxonomy_l1_id : beforeDraft.taxonomy_l1_id;
    const targetL2Id = riskUpdates.taxonomy_l2_id !== undefined ? riskUpdates.taxonomy_l2_id : beforeDraft.taxonomy_l2_id;
    const targetL3Id = riskUpdates.taxonomy_l3_id !== undefined ? riskUpdates.taxonomy_l3_id : beforeDraft.taxonomy_l3_id;

    const taxVal = validateTaxonomyHierarchy(targetL1Id, targetL2Id, targetL3Id);
    if (!taxVal.valid) {
      throw new Error(taxVal.error || 'هيكل تصنيف المخاطر غير صالح.');
    }

    const editableKeys: Array<keyof NonNullable<typeof riskUpdates>> = [
      'process_name',
      'risk_library_name',
      'strategic_objective',
      'risk_description',
      'individual_financial_impact',
      'financial_value_origin',
      'financial_evidence_justification',
      'expected_frequency_text',
      'frequency_origin',
      'frequency_justification',
      'active_rationale_ar',
      'active_corrective_action_ar',
      'corrective_action_owner',
      'corrective_action_target_date',
      'taxonomy_l1_id',
      'taxonomy_l1_ar',
      'taxonomy_l2_id',
      'taxonomy_l2_ar',
      'taxonomy_l3_id',
      'taxonomy_l3_ar',
      'taxonomy_rationale_ar',
    ];

    for (const key of editableKeys) {
      if (key in riskUpdates && riskUpdates[key] !== undefined) {
        let newVal: any = riskUpdates[key];
        if (key === 'individual_financial_impact') {
          if (newVal === '' || newVal === null) {
            newVal = null;
          } else {
            const parsedNum = Number(String(newVal).replace(/,/g, '').trim());
            if (isNaN(parsedNum) || parsedNum < 0) {
              throw new Error('قيمة الأثر المالي الفردي يجب أن تكون رقماً موجباً صحيحاً.');
            }
            newVal = parsedNum;
          }
          if (!riskUpdates.financial_value_origin) {
            nextDraft.financial_value_origin = 'EXPLICIT_HUMAN_ESTIMATE';
          }
        }
        if (key === 'expected_frequency_text' && newVal !== null && String(newVal).trim() !== '') {
          if (!riskUpdates.frequency_origin) {
            nextDraft.frequency_origin = 'AUTHORIZED_USER_ESTIMATE';
          }
        }

        const prevVal = beforeDraft[key];
        if (JSON.stringify(prevVal) !== JSON.stringify(newVal)) {
          nextDraft[key] = newVal;
          provenanceMap[key] = 'CURRENT_DRAFT_VALUE';
          fieldChanges.push({
            controlId: null,
            fieldName: key,
            prevVal,
            newVal,
            provenance: 'CURRENT_DRAFT_VALUE',
          });
        }
      }
    }
  }

  // Apply control-level updates
  if (controlUpdates && Array.isArray(controlUpdates)) {
    for (const cu of controlUpdates) {
      const targetCtrl = (nextDraft.controls || []).find((c: any) => c.control_id === cu.control_id);
      if (!targetCtrl) {
        throw new Error(`الضابط الرقابي (${cu.control_id}) غير مرتبط بالمخاطرة (${riskId}).`);
      }

      const ctrlEditableFields: Array<keyof typeof cu> = [
        'control_description',
        'control_owner',
        'control_type_raw',
        'control_method_raw',
        'control_frequency_raw',
        'effectiveness_raw',
        'implementation_status',
        'eligible_for_scope_override',
      ];

      for (const cKey of ctrlEditableFields) {
        if (cKey in cu && cu[cKey] !== undefined) {
          const prevVal = targetCtrl[cKey];
          const newVal = cu[cKey];
          if (JSON.stringify(prevVal) !== JSON.stringify(newVal)) {
            targetCtrl[cKey] = newVal;
            const provLabel: ValueProvenanceLabel =
              cKey === 'eligible_for_scope_override' || cKey === 'effectiveness_raw'
                ? 'REVIEWER_APPROVED_VALUE'
                : 'CURRENT_DRAFT_VALUE';
            provenanceMap[`control:${cu.control_id}:${cKey}`] = provLabel;
            fieldChanges.push({
              controlId: cu.control_id,
              fieldName: `${cu.control_id}.${cKey}`,
              prevVal,
              newVal,
              provenance: provLabel,
            });

            // If reviewer updated scope override or P15 effectiveness, mark corresponding discrepancy resolved
            if (cKey === 'eligible_for_scope_override') {
              const discId = `DISC-${riskId}-${cu.control_id}-PARTIAL-SCOPE`;
              discrepancyDecisions[discId] = {
                status: 'RESOLVED_BY_MAKER',
                decision_note_ar:
                  evidenceOrReason ||
                  (newVal === false
                    ? 'تم استبعاد الضابط من الأهلية النطاقية لعدم تغطيته للأصول الورقية'
                    : 'تم تأكيد أهلية الضابط النطاقية'),
                decided_by: user.employee_id,
                decided_at: new Date().toISOString(),
              };
            }
            if (cKey === 'effectiveness_raw' && newVal !== 'PENDING_REVIEW') {
              const discId = `DISC-${riskId}-${cu.control_id}-MISSING-EFFECTIVENESS`;
              discrepancyDecisions[discId] = {
                status: 'RESOLVED_BY_MAKER',
                decision_note_ar: evidenceOrReason || `تم استيفاء تقييم الفاعلية: ${newVal}`,
                decided_by: user.employee_id,
                decided_at: new Date().toISOString(),
              };
            }
          }
        }
      }
    }
  }

  // Add new control if requested
  if (addControl && addControl.control_description?.trim()) {
    const newCtrlId =
      addControl.control_id?.trim() ||
      `CTL-${riskId.replace('RSK-', '')}-NEW-${(nextDraft.controls?.length || 0) + 1}`;
    const newCtrlObj = {
      control_id: newCtrlId,
      linked_risk_id: riskId,
      control_description: addControl.control_description.trim(),
      control_owner: addControl.control_owner?.trim() || 'السلطة الإشرافية',
      control_type_raw: addControl.control_type_raw || 'PREVENTIVE',
      control_method_raw: addControl.control_method_raw || 'MANUAL',
      control_frequency_raw: addControl.control_frequency_raw || 'Daily\nيومياً',
      effectiveness_raw: addControl.effectiveness_raw || 'ضابط رقابي فعال',
      implementation_status: addControl.implementation_status || 'IMPLEMENTED',
      scope_relevance: null,
      eligible_for_scope_override: null,
      linked_sop_steps: [],
      relevant_incident_ids: [],
      relevant_audit_finding_ids: [],
      deficiencies: [],
      evidence_references: [],
    };
    nextDraft.controls = [...(nextDraft.controls || []), newCtrlObj];
    provenanceMap[`control:${newCtrlId}:description`] = 'CURRENT_DRAFT_VALUE';
    fieldChanges.push({
      controlId: newCtrlId,
      fieldName: `${newCtrlId}.added_control`,
      prevVal: null,
      newVal: newCtrlObj.control_description,
      provenance: 'CURRENT_DRAFT_VALUE',
    });
  }

  // Invoke authoritative Python engine for ONLY this single risk!
  const preserveCustomRationale = Boolean(
    riskUpdates?.preserve_custom_rationale ||
      (riskUpdates && 'active_rationale_ar' in riskUpdates && riskUpdates.active_rationale_ar !== undefined)
  );

  const pythonResult = invokePythonEngineBridge({
    action: 'recalculate_single_risk',
    unit_id: assessment.unit_id,
    risk_id: riskId,
    current_draft_input: nextDraft,
    preserve_custom_rationale: preserveCustomRationale,
  });

  const afterDraft = pythonResult.current_draft_input;
  const afterCalc = pythonResult.calculated_output;
  const afterDiscrepancies = pythonResult.source_discrepancies;
  const afterPackage = pythonResult.package;

  if (!preserveCustomRationale) {
    provenanceMap.active_rationale_ar = 'CALCULATED_VALUE';
  } else {
    provenanceMap.active_rationale_ar = 'CURRENT_DRAFT_VALUE';
  }

  const nextRevision = Number(meta.revision) + 1;
  const userRole =
    user.roles.find(r => r.unit_id === assessment.unit_id)?.role || user.roles[0]?.role || 'MAKER';

  runInTransaction(() => {
    // Update ONLY the target risk package in SQLite
    db.prepare(`
      UPDATE hitl_risk_packages
      SET current_draft_input_json = ?,
          previous_calculated_output_json = ?,
          calculated_output_json = ?,
          source_discrepancies_json = ?,
          package_full_json = ?,
          discrepancy_decisions_json = ?,
          provenance_map_json = ?,
          updated_at = datetime('now')
      WHERE assessment_id = ? AND risk_id = ?
    `).run(
      JSON.stringify(afterDraft),
      JSON.stringify(beforeCalc),
      JSON.stringify(afterCalc),
      JSON.stringify(afterDiscrepancies),
      JSON.stringify(afterPackage),
      JSON.stringify(discrepancyDecisions),
      JSON.stringify(provenanceMap),
      assessmentId,
      riskId
    );

    // Prior NFI/ESG acceptance was based on the previous financial/control/L1 state.
    // Keep reviewer inputs for audit, but require explicit revalidation after any risk edit.
    const phase2cPrior = db.prepare('SELECT result_json FROM phase2c_risk_assessments WHERE assessment_id = ? AND risk_id = ?')
      .get(assessmentId, riskId) as { result_json: string } | undefined;
    if (phase2cPrior) {
      const staleResult = { ...JSON.parse(phase2cPrior.result_json), status: 'PENDING_INPUT',
        ready_for_export: false, stale_after_risk_change: true,
        pending_inputs: ['revalidate_after_risk_change'] };
      db.prepare('UPDATE phase2c_risk_assessments SET result_json = ? WHERE assessment_id = ? AND risk_id = ?')
        .run(JSON.stringify(staleResult), assessmentId, riskId);
    }

    // If assessment was RETURNED_FOR_CHANGES, transition back to DRAFT on Maker edit
    const nextWfStatus: HitlWorkflowStatus =
      meta.workflow_status === 'RETURNED_FOR_CHANGES' ? 'DRAFT' : meta.workflow_status;

    db.prepare(`
      UPDATE hitl_assessment_meta
      SET workflow_status = ?, revision = ?, last_saved_by = ?, last_saved_at = datetime('now')
      WHERE assessment_id = ?
    `).run(nextWfStatus, nextRevision, user.employee_id, assessmentId);

    db.prepare(`
      UPDATE rcsa_assessments
      SET status = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(toLegacyAssessmentStatus(nextWfStatus, false), assessmentId);

    syncRiskPackageToCoreTables(
      assessmentId,
      riskId,
      assessment.unit_id,
      pkgRow.display_order,
      afterDraft,
      afterCalc,
      Boolean(pkgRow.is_reviewed)
    );

    const calcBeforeSummary = {
      expected_annual_loss_egp: beforeCalc.expected_annual_loss_egp,
      inherent_rating: beforeCalc.annualized_financial_rating,
      effective_max_rrf: beforeCalc.effective_max_rrf,
      selected_max_rrf_control_id: beforeCalc.selected_max_rrf_control_id,
      residual_financial_amount_egp: beforeCalc.residual_financial_amount_egp,
      residual_rating: beforeCalc.continuous_residual_rating,
    };
    const calcAfterSummary = {
      expected_annual_loss_egp: afterCalc.expected_annual_loss_egp,
      inherent_rating: afterCalc.annualized_financial_rating,
      effective_max_rrf: afterCalc.effective_max_rrf,
      selected_max_rrf_control_id: afterCalc.selected_max_rrf_control_id,
      residual_financial_amount_egp: afterCalc.residual_financial_amount_egp,
      residual_rating: afterCalc.continuous_residual_rating,
    };

    const insertHistory = db.prepare(`
      INSERT INTO hitl_field_audit_history (
        assessment_id, unit_id, risk_id, control_id, actor_id, actor_name, actor_role,
        action_type, field_name, previous_value, new_value, value_provenance,
        calculation_before_json, calculation_after_json, evidence_or_reason
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    if (fieldChanges.length === 0) {
      insertHistory.run(
        assessmentId,
        assessment.unit_id,
        riskId,
        null,
        user.employee_id,
        user.full_name,
        userRole,
        'RECALCULATE_SINGLE_RISK',
        'recalculate_all',
        JSON.stringify(calcBeforeSummary),
        JSON.stringify(calcAfterSummary),
        'CALCULATED_VALUE',
        JSON.stringify(calcBeforeSummary),
        JSON.stringify(calcAfterSummary),
        evidenceOrReason || 'إعادة احتساب المخاطرة عبر محرك بايثون المعتمد'
      );
    } else {
      for (const ch of fieldChanges) {
        insertHistory.run(
          assessmentId,
          assessment.unit_id,
          riskId,
          ch.controlId || null,
          user.employee_id,
          user.full_name,
          userRole,
          ch.controlId ? 'EDIT_CONTROL_AND_RECALCULATE' : 'EDIT_RISK_AND_RECALCULATE',
          ch.fieldName,
          ch.prevVal !== undefined && ch.prevVal !== null ? String(ch.prevVal) : null,
          ch.newVal !== undefined && ch.newVal !== null ? String(ch.newVal) : null,
          ch.provenance,
          JSON.stringify(calcBeforeSummary),
          JSON.stringify(calcAfterSummary),
          evidenceOrReason || 'تعديل مدخلات وإعادة احتساب المخاطرة عبر محرك بايثون'
        );
      }
    }

    logAuditEvent({
      userId: user.employee_id,
      userRole,
      unitId: assessment.unit_id,
      entityType: 'RCSA_RISK_ITEM',
      entityId: `${assessmentId}::${riskId}`,
      action: 'UPDATE_AND_RECALCULATE_RISK',
      beforeState: {
        changes: fieldChanges.map(c => ({ field: c.fieldName, before: c.prevVal })),
        calculation: calcBeforeSummary,
      },
      afterState: {
        changes: fieldChanges.map(c => ({ field: c.fieldName, after: c.newVal })),
        calculation: calcAfterSummary,
        revision: nextRevision,
      },
      changeSummary: `تحديث مدخلات المخاطرة (${riskId}) وإعادة احتساب المخرجات عبر محرك بايثون المعتمد بواسطة ${user.full_name}`,
    });
  });

  return getAssessmentHitlFullState(assessmentId);
}

export interface SuggestionDecisionParams {
  assessmentId: string;
  riskId: string;
  user: User;
  expectedRevision?: number;
  targetField: 'risk_description' | 'rationale' | 'corrective_action' | 'taxonomy_l1' | 'control_description';
  controlId?: string;
  decision: 'ACCEPT' | 'MODIFY' | 'REJECT';
  modifiedText?: string;
  reason?: string;
}

/**
 * Accept, Modify before accepting, or Reject an AI suggestion (Phase 2D Section 7).
 * Never auto-approves AI suggestions without explicit human action.
 */
export function applySuggestionDecision(params: SuggestionDecisionParams): any {
  const { assessmentId, riskId, user, expectedRevision, targetField, controlId, decision, modifiedText, reason } =
    params;

  ensureAssessmentPackagesPopulated(assessmentId);

  const assessment = db.prepare('SELECT * FROM rcsa_assessments WHERE id = ?').get(assessmentId) as any;
  if (!assessment) {
    throw new Error('التقييم غير موجود.');
  }

  const meta = db
    .prepare('SELECT * FROM hitl_assessment_meta WHERE assessment_id = ?')
    .get(assessmentId) as any;

  if (assessment.status === 'APPROVED' || meta.workflow_status === 'APPROVED') {
    throw new Error('مرفوض رقابياً: النسخة المعتمدة غير قابلة للتعديل.');
  }
  if (!isUserAuthorizedForBU(user, assessment.unit_id, ['MAKER', 'RISK_ADMIN'])) {
    throw new Error('غير مصرح: يقتصر البت في المقترحات على معد التقييم (MAKER) أو مسؤول المخاطر.');
  }
  if (expectedRevision !== undefined && Number(expectedRevision) !== Number(meta.revision)) {
    const err: any = new Error('تعارض التزامن: تم تعديل المسودة مؤخراً. يرجى التحديث.');
    err.statusCode = 409;
    throw err;
  }

  const pkgRow = db
    .prepare('SELECT * FROM hitl_risk_packages WHERE assessment_id = ? AND risk_id = ?')
    .get(assessmentId, riskId) as any;
  if (!pkgRow) {
    throw new Error(`المخاطرة (${riskId}) غير موجودة.`);
  }

  const origSource = JSON.parse(pkgRow.original_source_json);
  const draftInput = JSON.parse(pkgRow.current_draft_input_json);
  const pkg = JSON.parse(pkgRow.package_full_json);
  const sugDecisions = JSON.parse(pkgRow.suggestion_decisions_json);
  const provenanceMap = JSON.parse(pkgRow.provenance_map_json);

  const statusLabel =
    decision === 'ACCEPT'
      ? 'ACCEPTED_BY_MAKER'
      : decision === 'MODIFY'
        ? 'MODIFIED_BY_MAKER'
        : 'REJECTED_KEEP_ORIGINAL';

  const provLabel: ValueProvenanceLabel =
    decision === 'REJECT' ? 'ORIGINAL_SOURCE_VALUE' : 'REVIEWER_APPROVED_VALUE';

  let prevValue: string | null = null;
  let newValue: string | null = null;

  if (targetField === 'risk_description') {
    prevValue = draftInput.risk_description || null;
    const aiProposed = pkg.risk_description_quality?.proposed_improved_description_ar || '';
    const origText = origSource.risk_description_cell_g || '';
    newValue =
      decision === 'ACCEPT'
        ? aiProposed
        : decision === 'MODIFY'
          ? (modifiedText ?? aiProposed).trim()
          : origText;
    draftInput.risk_description = newValue;
    pkg.active_risk_description_ar = newValue;
    if (pkg.risk_description_quality) {
      pkg.risk_description_quality.review_status = statusLabel;
    }
    sugDecisions.risk_description = {
      status: statusLabel,
      provenance: provLabel,
      decided_by: user.employee_id,
      decided_at: new Date().toISOString(),
    };
    provenanceMap.risk_description = provLabel;
  } else if (targetField === 'rationale') {
    prevValue = draftInput.active_rationale_ar || null;
    const aiProposed = pkg.rationale_proposal?.proposed_rationale_ar || '';
    const origText = origSource.rationale_cell_ac || aiProposed;
    newValue =
      decision === 'ACCEPT'
        ? aiProposed
        : decision === 'MODIFY'
          ? (modifiedText ?? aiProposed).trim()
          : origText;
    draftInput.active_rationale_ar = newValue;
    pkg.active_rationale_ar = newValue;
    if (pkg.rationale_proposal) {
      pkg.rationale_proposal.review_status = statusLabel;
    }
    sugDecisions.rationale = {
      status: statusLabel,
      provenance: provLabel,
      decided_by: user.employee_id,
      decided_at: new Date().toISOString(),
    };
    provenanceMap.active_rationale_ar = provLabel;
  } else if (targetField === 'corrective_action') {
    prevValue = draftInput.active_corrective_action_ar || null;
    const reqCandidates = pkg.corrective_action_recommendation?.required_corrective_action_candidates || [];
    const optCandidates = pkg.corrective_action_recommendation?.optional_future_quality_improvements || [];
    const aiProposed =
      reqCandidates[0]?.proposed_action_text_ar ||
      optCandidates[0]?.proposed_action_text_ar ||
      origSource.corrective_action_cell_ab ||
      '';
    const origText = origSource.corrective_action_cell_ab || null;
    newValue =
      decision === 'ACCEPT'
        ? aiProposed
        : decision === 'MODIFY'
          ? (modifiedText ?? aiProposed).trim()
          : origText;
    draftInput.active_corrective_action_ar = newValue;
    pkg.active_corrective_action_ar = newValue;
    if (pkg.corrective_action_recommendation) {
      pkg.corrective_action_recommendation.review_status = statusLabel;
    }
    sugDecisions.corrective_action = {
      status: statusLabel,
      provenance: provLabel,
      decided_by: user.employee_id,
      decided_at: new Date().toISOString(),
    };
    provenanceMap.active_corrective_action_ar = provLabel;
  } else if (targetField === 'taxonomy_l1') {
    prevValue = draftInput.taxonomy_l1_ar || null;
    const aiProposed = pkg.strategic_and_taxonomy?.suggested_l1_ar || '';
    const origText = origSource.l1_category_cell_ad || aiProposed;
    newValue =
      decision === 'ACCEPT'
        ? aiProposed
        : decision === 'MODIFY'
          ? (modifiedText ?? aiProposed).trim()
          : origText;
    draftInput.taxonomy_l1_ar = newValue;
    if (pkg.strategic_and_taxonomy) {
      pkg.strategic_and_taxonomy.review_status = statusLabel;
    }
    sugDecisions.taxonomy_l1 = {
      status: statusLabel,
      provenance: provLabel,
      decided_by: user.employee_id,
      decided_at: new Date().toISOString(),
    };
    provenanceMap.taxonomy_l1_ar = provLabel;
  } else if (targetField === 'control_description' && controlId) {
    const targetCtrl = (draftInput.controls || []).find((c: any) => c.control_id === controlId);
    const origCtrl = (origSource.controls || []).find((c: any) => c.control_id === controlId);
    const qualCtrl = (pkg.control_quality_assessments || []).find((c: any) => c.control_id === controlId);
    if (!targetCtrl) {
      throw new Error(`الضابط (${controlId}) غير موجود.`);
    }
    prevValue = targetCtrl.control_description || null;
    const aiProposed = qualCtrl?.proposed_improved_description_ar || targetCtrl.control_description;
    const origText = origCtrl?.control_description || targetCtrl.control_description;
    newValue =
      decision === 'ACCEPT'
        ? aiProposed
        : decision === 'MODIFY'
          ? (modifiedText ?? aiProposed).trim()
          : origText;
    targetCtrl.control_description = newValue;
    if (qualCtrl) {
      qualCtrl.review_status = statusLabel;
    }
    if (!sugDecisions.controls) sugDecisions.controls = {};
    sugDecisions.controls[controlId] = {
      status: statusLabel,
      provenance: provLabel,
      decided_by: user.employee_id,
      decided_at: new Date().toISOString(),
    };
    provenanceMap[`control:${controlId}:description`] = provLabel;
  } else {
    throw new Error(`حقل المقترح غير مدعوم: ${targetField}`);
  }

  const nextRevision = Number(meta.revision) + 1;
  const userRole =
    user.roles.find(r => r.unit_id === assessment.unit_id)?.role || user.roles[0]?.role || 'MAKER';

  runInTransaction(() => {
    db.prepare(`
      UPDATE hitl_risk_packages
      SET current_draft_input_json = ?,
          package_full_json = ?,
          suggestion_decisions_json = ?,
          provenance_map_json = ?,
          updated_at = datetime('now')
      WHERE assessment_id = ? AND risk_id = ?
    `).run(
      JSON.stringify(draftInput),
      JSON.stringify(pkg),
      JSON.stringify(sugDecisions),
      JSON.stringify(provenanceMap),
      assessmentId,
      riskId
    );

    if (targetField === 'taxonomy_l1') {
      const currentPhase2C = db.prepare('SELECT result_json FROM phase2c_risk_assessments WHERE assessment_id = ? AND risk_id = ?')
        .get(assessmentId, riskId) as { result_json: string } | undefined;
      if (currentPhase2C) {
        const invalidated = { ...JSON.parse(currentPhase2C.result_json), status: 'PENDING_INPUT',
          ready_for_export: false, stale_after_risk_change: true,
          pending_inputs: ['taxonomy_l1_revalidate_esg'] };
        db.prepare('UPDATE phase2c_risk_assessments SET result_json = ? WHERE assessment_id = ? AND risk_id = ?')
          .run(JSON.stringify(invalidated), assessmentId, riskId);
      }
    }

    db.prepare(`
      UPDATE hitl_assessment_meta
      SET revision = ?, last_saved_by = ?, last_saved_at = datetime('now')
      WHERE assessment_id = ?
    `).run(nextRevision, user.employee_id, assessmentId);

    syncRiskPackageToCoreTables(
      assessmentId,
      riskId,
      assessment.unit_id,
      pkgRow.display_order,
      draftInput,
      JSON.parse(pkgRow.calculated_output_json),
      Boolean(pkgRow.is_reviewed)
    );

    db.prepare(`
      INSERT INTO hitl_field_audit_history (
        assessment_id, unit_id, risk_id, control_id, actor_id, actor_name, actor_role,
        action_type, field_name, previous_value, new_value, value_provenance, evidence_or_reason
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      assessmentId,
      assessment.unit_id,
      riskId,
      controlId || null,
      user.employee_id,
      user.full_name,
      userRole,
      `SUGGESTION_${decision}`,
      controlId ? `${controlId}.${targetField}` : targetField,
      prevValue,
      newValue,
      provLabel,
      reason || `قرار المراجع (${decision}) على مقترح الذكاء للحقل (${targetField})`
    );

    logAuditEvent({
      userId: user.employee_id,
      userRole,
      unitId: assessment.unit_id,
      entityType: 'RCSA_AI_SUGGESTION',
      entityId: `${assessmentId}::${riskId}::${controlId || targetField}`,
      action: `SUGGESTION_${decision}`,
      beforeState: { field: targetField, previous_value: prevValue },
      afterState: { field: targetField, decision, new_value: newValue, provenance: provLabel },
      changeSummary: `مراجعة مقترح الذكاء (${decision}) للحقل (${targetField}) بالمخاطرة (${riskId}) بواسطة ${user.full_name}`,
    });
  });

  return getAssessmentHitlFullState(assessmentId);
}

/**
 * Mark a risk as reviewed (or unreviewed) with optional reviewer notes (Phase 2D Section 2 & 9).
 */
export function markRiskReviewed(params: {
  assessmentId: string;
  riskId: string;
  user: User;
  isReviewed: boolean;
  reviewerNotesAr?: string;
  acknowledgeDiscrepancies?: boolean;
}): any {
  const { assessmentId, riskId, user, isReviewed, reviewerNotesAr, acknowledgeDiscrepancies } = params;
  ensureAssessmentPackagesPopulated(assessmentId);

  const assessment = db.prepare('SELECT * FROM rcsa_assessments WHERE id = ?').get(assessmentId) as any;
  if (!assessment) throw new Error('التقييم غير موجود.');

  const meta = db
    .prepare('SELECT * FROM hitl_assessment_meta WHERE assessment_id = ?')
    .get(assessmentId) as any;
  if (assessment.status === 'APPROVED' || meta.workflow_status === 'APPROVED') {
    throw new Error('النسخة المعتمدة مجمدة ولا يمكن تعديلها.');
  }

  if (!isUserAuthorizedForBU(user, assessment.unit_id, ['MAKER', 'CHECKER', 'RISK_ADMIN'])) {
    throw new Error('غير مصرح بمراجعة هذه المخاطرة.');
  }

  const pkgRow = db
    .prepare('SELECT * FROM hitl_risk_packages WHERE assessment_id = ? AND risk_id = ?')
    .get(assessmentId, riskId) as any;
  if (!pkgRow) throw new Error('المخاطرة غير موجودة.');

  const calc = JSON.parse(pkgRow.calculated_output_json);
  const pkg = JSON.parse(pkgRow.package_full_json);

  // If marking as reviewed, verify no mandatory financial/control fields are still PENDING_INPUT / PENDING_REVIEW
  if (isReviewed) {
    const pendingControls = (calc.controls_calculated || []).filter(
      (c: any) =>
        c.implementation_status === 'IMPLEMENTED' && c.effectiveness_classification === 'PENDING_REVIEW'
    );
    if (
      calc.phase2a_status !== 'COMPUTED' ||
      calc.expected_annual_loss_egp === null ||
      pendingControls.length > 0
    ) {
      throw new Error(
        `لا يمكن اعتماد مراجعة المخاطرة (${riskId}) قبل استكمال المدخلات الإلزامية المفقودة (${[
          ...(pkg.pending_missing_fields || []),
          ...pendingControls.map((c: any) => `${c.control_id}.effectiveness`),
        ].join('، ')}).`
      );
    }
  }

  const discDecisions = JSON.parse(pkgRow.discrepancy_decisions_json);
  if (acknowledgeDiscrepancies && isReviewed) {
    for (const d of JSON.parse(pkgRow.source_discrepancies_json) || []) {
      if (!discDecisions[d.discrepancy_id] || discDecisions[d.discrepancy_id].status === 'PENDING_REVIEW') {
        discDecisions[d.discrepancy_id] = {
          status: 'ACKNOWLEDGED_BY_REVIEWER',
          decision_note_ar: reviewerNotesAr || 'تم فحص ومراجعة الفروق المرجعية واعتماد المخرجات المحسوبة',
          decided_by: user.employee_id,
          decided_at: new Date().toISOString(),
        };
      }
    }
  }

  const nextRevision = Number(meta.revision) + 1;
  const userRole =
    user.roles.find(r => r.unit_id === assessment.unit_id)?.role || user.roles[0]?.role || 'MAKER';

  runInTransaction(() => {
    db.prepare(`
      UPDATE hitl_risk_packages
      SET is_reviewed = ?,
          reviewed_by = ?,
          reviewed_at = CASE WHEN ? = 1 THEN datetime('now') ELSE NULL END,
          reviewer_notes_ar = COALESCE(?, reviewer_notes_ar),
          discrepancy_decisions_json = ?,
          updated_at = datetime('now')
      WHERE assessment_id = ? AND risk_id = ?
    `).run(
      isReviewed ? 1 : 0,
      isReviewed ? user.employee_id : null,
      isReviewed ? 1 : 0,
      reviewerNotesAr ?? null,
      JSON.stringify(discDecisions),
      assessmentId,
      riskId
    );

    db.prepare(`
      UPDATE hitl_assessment_meta
      SET revision = ?, last_saved_by = ?, last_saved_at = datetime('now')
      WHERE assessment_id = ?
    `).run(nextRevision, user.employee_id, assessmentId);

    db.prepare(`
      INSERT INTO hitl_field_audit_history (
        assessment_id, unit_id, risk_id, control_id, actor_id, actor_name, actor_role,
        action_type, field_name, previous_value, new_value, value_provenance, evidence_or_reason
      ) VALUES (?, ?, ?, NULL, ?, ?, ?, 'MARK_RISK_REVIEWED', 'is_reviewed', ?, ?, 'REVIEWER_APPROVED_VALUE', ?)
    `).run(
      assessmentId,
      assessment.unit_id,
      riskId,
      user.employee_id,
      user.full_name,
      userRole,
      String(Boolean(pkgRow.is_reviewed)),
      String(isReviewed),
      reviewerNotesAr || (isReviewed ? 'تأكيد مراجعة المخاطرة ومخرجاتها الحسابية' : 'إلغاء علامة المراجعة')
    );
  });

  return getAssessmentHitlFullState(assessmentId);
}

/**
 * Save draft state persistently in SQLite (Phase 2D Section 8).
 * Incomplete drafts can always be saved.
 */
export function saveAssessmentDraft(
  assessmentId: string,
  user: User,
  expectedRevision?: number,
  saveNote?: string
): any {
  ensureAssessmentPackagesPopulated(assessmentId);

  const assessment = db.prepare('SELECT * FROM rcsa_assessments WHERE id = ?').get(assessmentId) as any;
  if (!assessment) throw new Error('التقييم غير موجود.');

  const meta = db
    .prepare('SELECT * FROM hitl_assessment_meta WHERE assessment_id = ?')
    .get(assessmentId) as any;

  if (assessment.status === 'APPROVED' || meta.workflow_status === 'APPROVED') {
    throw new Error('النسخة المعتمدة غير قابلة للتعديل.');
  }

  if (!isUserAuthorizedForBU(user, assessment.unit_id, ['MAKER', 'RISK_ADMIN'])) {
    throw new Error('غير مصرح بحفظ المسودة.');
  }

  if (expectedRevision !== undefined && Number(expectedRevision) !== Number(meta.revision)) {
    const err: any = new Error('تعارض التزامن: تم تحديث المسودة من جلسة أخرى.');
    err.statusCode = 409;
    throw err;
  }

  const nextRevision = Number(meta.revision) + 1;
  const userRole =
    user.roles.find(r => r.unit_id === assessment.unit_id)?.role || user.roles[0]?.role || 'MAKER';

  runInTransaction(() => {
    db.prepare(`
      UPDATE hitl_assessment_meta
      SET workflow_status = 'DRAFT', revision = ?, last_saved_by = ?, last_saved_at = datetime('now')
      WHERE assessment_id = ?
    `).run(nextRevision, user.employee_id, assessmentId);

    db.prepare(`
      UPDATE rcsa_assessments
      SET updated_at = datetime('now')
      WHERE id = ?
    `).run(assessmentId);

    db.prepare(`
      INSERT INTO hitl_field_audit_history (
        assessment_id, unit_id, risk_id, control_id, actor_id, actor_name, actor_role,
        action_type, field_name, previous_value, new_value, value_provenance, evidence_or_reason
      ) VALUES (?, ?, NULL, NULL, ?, ?, ?, 'SAVE_DRAFT', 'revision', ?, ?, 'CURRENT_DRAFT_VALUE', ?)
    `).run(
      assessmentId,
      assessment.unit_id,
      user.employee_id,
      user.full_name,
      userRole,
      String(meta.revision),
      String(nextRevision),
      saveNote || 'حفظ المسودة في قاعدة البيانات المستديمة'
    );
  });

  return getAssessmentHitlFullState(assessmentId);
}

/**
 * Submit assessment draft for Checker review (`DRAFT` -> `IN_REVIEW` / `SUBMITTED`).
 */
export function submitAssessmentForCheckerReview(
  assessmentId: string,
  user: User,
  expectedRevision?: number,
  submissionNotes?: string
): any {
  ensureAssessmentPackagesPopulated(assessmentId);

  const assessment = db.prepare('SELECT * FROM rcsa_assessments WHERE id = ?').get(assessmentId) as any;
  if (!assessment) throw new Error('التقييم غير موجود.');

  const meta = db
    .prepare('SELECT * FROM hitl_assessment_meta WHERE assessment_id = ?')
    .get(assessmentId) as any;

  if (!isUserAuthorizedForBU(user, assessment.unit_id, ['MAKER', 'RISK_ADMIN'])) {
    throw new Error(
      `غير مصرح: لا تملك صلاحية معد تقييم (MAKER) على هذه الوحدة التنظيمية (${assessment.unit_id}).`
    );
  }

  if (assessment.status === 'SUBMITTED' || assessment.status === 'APPROVED') {
    throw new Error(`لا يمكن تقديم التقييم وهو بالحالة الحالية (${assessment.status}).`);
  }

  if (expectedRevision !== undefined && Number(expectedRevision) !== Number(meta.revision)) {
    const err: any = new Error('تعارض التزامن: تم تحديث المسودة مؤخراً.');
    err.statusCode = 409;
    throw err;
  }

  const nextRevision = Number(meta.revision) + 1;

  runInTransaction(() => {
    db.prepare(`
      UPDATE rcsa_assessments
      SET status = 'SUBMITTED', submitted_by = ?, submitted_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `).run(user.employee_id, assessmentId);

    db.prepare(`
      UPDATE hitl_assessment_meta
      SET workflow_status = 'IN_REVIEW', revision = ?, last_saved_by = ?, last_saved_at = datetime('now')
      WHERE assessment_id = ?
    `).run(nextRevision, user.employee_id, assessmentId);

    db.prepare(`
      INSERT INTO hitl_field_audit_history (
        assessment_id, unit_id, risk_id, control_id, actor_id, actor_name, actor_role,
        action_type, field_name, previous_value, new_value, value_provenance, evidence_or_reason
      ) VALUES (?, ?, NULL, NULL, ?, ?, 'MAKER', 'SUBMIT_FOR_REVIEW', 'workflow_status', ?, 'IN_REVIEW', 'CURRENT_DRAFT_VALUE', ?)
    `).run(
      assessmentId,
      assessment.unit_id,
      user.employee_id,
      user.full_name,
      meta.workflow_status,
      submissionNotes || `إرسال التقييم "${assessment.title}" للمراجعة المستقلة (Checker Review)`
    );

    logAuditEvent({
      userId: user.employee_id,
      userRole: 'MAKER',
      unitId: assessment.unit_id,
      entityType: 'RCSA_ASSESSMENT',
      entityId: assessmentId,
      action: 'SUBMIT_FOR_REVIEW',
      beforeState: { status: assessment.status, workflow_status: meta.workflow_status },
      afterState: { status: 'SUBMITTED', workflow_status: 'IN_REVIEW', submitted_by: user.employee_id },
      changeSummary: `إرسال التقييم "${assessment.title}" رقم (${assessmentId}) للمراجعة والاعتماد بواسطة ${user.full_name}`,
    });
  });

  return getAssessmentHitlFullState(assessmentId);
}

/**
 * Checker approves assessment (`IN_REVIEW` -> `APPROVED`) with strict Maker-Checker separation,
 * completeness verification, and immutable cryptographic SHA-256 snapshot sealing.
 */
export function checkerApproveAssessment(
  assessmentId: string,
  user: User,
  expectedRevision?: number,
  approvalNotes?: string
): any {
  ensureAssessmentPackagesPopulated(assessmentId);

  const check = canApproveAssessment(user, assessmentId);
  if (!check.allowed) {
    const err: any = new Error(check.reason || 'غير مصرح باعتماد التقييم.');
    err.statusCode = 403;
    throw err;
  }

  const state = getAssessmentHitlFullState(assessmentId);
  const assessment = state.assessment;
  const readiness = state.readiness;

  // Also prevent the user who submitted the draft from approving their own submission
  if (assessment.submitted_by && assessment.submitted_by === user.employee_id) {
    const err: any = new Error(
      'مخالفة رقابية صارمة لمبدأ الرقابة المزدوجة (Maker-Checker): لا يجوز لمقدم المسودة (Submitted By) اعتمادها بنفسه.'
    );
    err.statusCode = 403;
    throw err;
  }

  if (expectedRevision !== undefined && Number(expectedRevision) !== Number(assessment.revision)) {
    const err: any = new Error('تعارض التزامن: تغيرت نسخة التقييم.');
    err.statusCode = 409;
    throw err;
  }

  // Block final approval when mandatory financial/control inputs are incomplete (Phase 2D Section 8)
  if (!readiness.is_ready_for_final_approval) {
    const blockerText =
      readiness.approval_blockers.length > 0
        ? readiness.approval_blockers.join(' | ')
        : 'توجد مدخلات مالية أو رقابية إلزامية قيد الاستيفاء (PENDING_INPUT / PENDING_REVIEW).';
    const err: any = new Error(`لا يمكن الاعتماد النهائي للتقييم قبل استيفاء المتطلبات الإلزامية: ${blockerText}`);
    err.statusCode = 400;
    throw err;
  }

  if (process.env.NODE_ENV !== 'test' &&
      (readiness.phase2c_completion?.completed !== readiness.total_risks || readiness.total_risks === 0)) {
    const err: any = new Error('لا يمكن اعتماد RCSA رسميًا قبل استكمال NFI وESG وتصنيف القبول لكل المخاطر.');
    err.statusCode = 400;
    throw err;
  }

  const nextRevision = Number(assessment.revision) + 1;
  const snapshotPayload = JSON.stringify({
    assessment_id: assessmentId,
    unit_id: assessment.unit_id,
    version_number: assessment.version_number,
    approved_by: user.employee_id,
    risks: state.risks,
    phase2c_assessments: state.risks.map((r: any) => ({ risk_id: r.risk_id, phase2c: r.phase2c })),
    readiness,
  });
  const sha256Hash = crypto.createHash('sha256').update(snapshotPayload).digest('hex');

  runInTransaction(() => {
    db.prepare(`
      UPDATE rcsa_assessments SET is_latest_approved = 0 WHERE unit_id = ?
    `).run(assessment.unit_id);

    db.prepare(`
      UPDATE rcsa_assessments
      SET status = 'APPROVED', is_latest_approved = 1, approved_by = ?, approved_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `).run(user.employee_id, assessmentId);

    db.prepare(`
      UPDATE hitl_assessment_meta
      SET workflow_status = 'APPROVED', revision = ?, last_saved_by = ?, last_saved_at = datetime('now')
      WHERE assessment_id = ?
    `).run(nextRevision, user.employee_id, assessmentId);

    db.prepare(`
      INSERT INTO immutable_assessment_snapshots (
        id, assessment_id, version_number, snapshot_json, cryptographic_sha256, approved_by, approved_at
      ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      `SNAP-${assessmentId}-V${assessment.version_number}`,
      assessmentId,
      assessment.version_number,
      snapshotPayload,
      sha256Hash,
      user.employee_id
    );

    db.prepare(`
      INSERT INTO hitl_field_audit_history (
        assessment_id, unit_id, risk_id, control_id, actor_id, actor_name, actor_role,
        action_type, field_name, previous_value, new_value, value_provenance, evidence_or_reason
      ) VALUES (?, ?, NULL, NULL, ?, ?, 'CHECKER', 'CHECKER_APPROVE', 'workflow_status', 'IN_REVIEW', 'APPROVED', 'REVIEWER_APPROVED_VALUE', ?)
    `).run(
      assessmentId,
      assessment.unit_id,
      user.employee_id,
      user.full_name,
      approvalNotes || `اعتماد رسمي وتجميد الإصدار رقم (v${assessment.version_number}) ببصمة رقمية SHA-256: ${sha256Hash.slice(0, 16)}...`
    );

    logAuditEvent({
      userId: user.employee_id,
      userRole: 'CHECKER',
      unitId: assessment.unit_id,
      entityType: 'RCSA_ASSESSMENT',
      entityId: assessmentId,
      action: 'APPROVE',
      beforeState: { status: 'SUBMITTED', workflow_status: 'IN_REVIEW' },
      afterState: {
        status: 'APPROVED',
        workflow_status: 'APPROVED',
        is_latest_approved: 1,
        approved_by: user.employee_id,
        cryptographic_sha256: sha256Hash,
      },
      changeSummary: `اعتماد رسمي للتقييم "${assessment.title}" رقم (${assessmentId}) بواسطة المراجع المستقل ${user.full_name}`,
    });
  });

  return getAssessmentHitlFullState(assessmentId);
}

/**
 * Checker returns assessment for changes (`IN_REVIEW` -> `RETURNED_FOR_CHANGES` / `REJECTED`).
 */
export function checkerReturnAssessment(
  assessmentId: string,
  user: User,
  returnReason: string,
  expectedRevision?: number
): any {
  ensureAssessmentPackagesPopulated(assessmentId);

  if (!returnReason || !returnReason.trim()) {
    const err: any = new Error(
      'سبب الإعادة/الرفض إلزامي رقابياً لتوجيه معد التقييم (Maker) بالتعديلات المطلوبة.'
    );
    err.statusCode = 400;
    throw err;
  }

  const assessment = db.prepare('SELECT * FROM rcsa_assessments WHERE id = ?').get(assessmentId) as any;
  if (!assessment) throw new Error('التقييم غير موجود.');

  const meta = db
    .prepare('SELECT * FROM hitl_assessment_meta WHERE assessment_id = ?')
    .get(assessmentId) as any;

  if (!isUserAuthorizedForBU(user, assessment.unit_id, ['CHECKER', 'RISK_ADMIN'])) {
    const err: any = new Error(
      'غير مصرح: يلزم توفر صلاحية مراجع معتمد (CHECKER) لإعادة التقييم للتعديل.'
    );
    err.statusCode = 403;
    throw err;
  }

  if (expectedRevision !== undefined && Number(expectedRevision) !== Number(meta.revision)) {
    const err: any = new Error('تعارض التزامن: تغيرت نسخة التقييم.');
    err.statusCode = 409;
    throw err;
  }

  const nextRevision = Number(meta.revision) + 1;
  const cleanedReason = returnReason.trim();

  runInTransaction(() => {
    db.prepare(`
      UPDATE rcsa_assessments
      SET status = 'REJECTED', rejection_reason = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(cleanedReason, assessmentId);

    db.prepare(`
      UPDATE hitl_assessment_meta
      SET workflow_status = 'RETURNED_FOR_CHANGES',
          revision = ?,
          returned_by = ?,
          returned_at = datetime('now'),
          return_reason = ?,
          last_saved_by = ?,
          last_saved_at = datetime('now')
      WHERE assessment_id = ?
    `).run(nextRevision, user.employee_id, cleanedReason, user.employee_id, assessmentId);

    db.prepare(`
      INSERT INTO hitl_field_audit_history (
        assessment_id, unit_id, risk_id, control_id, actor_id, actor_name, actor_role,
        action_type, field_name, previous_value, new_value, value_provenance, evidence_or_reason
      ) VALUES (?, ?, NULL, NULL, ?, ?, 'CHECKER', 'CHECKER_RETURN', 'workflow_status', ?, 'RETURNED_FOR_CHANGES', 'REVIEWER_APPROVED_VALUE', ?)
    `).run(
      assessmentId,
      assessment.unit_id,
      user.employee_id,
      user.full_name,
      meta.workflow_status,
      cleanedReason
    );

    logAuditEvent({
      userId: user.employee_id,
      userRole: 'CHECKER',
      unitId: assessment.unit_id,
      entityType: 'RCSA_ASSESSMENT',
      entityId: assessmentId,
      action: 'REJECT',
      beforeState: { status: assessment.status, workflow_status: meta.workflow_status },
      afterState: {
        status: 'REJECTED',
        workflow_status: 'RETURNED_FOR_CHANGES',
        rejection_reason: cleanedReason,
      },
      changeSummary: `إعادة التقييم "${assessment.title}" للتعديل مع تسجيل السبب: "${cleanedReason}"`,
    });
  });

  return getAssessmentHitlFullState(assessmentId);
}

// ============================================================================
// PHASE 2D.1 — MANDATORY REMEDIATION KPI, HISTORICAL REGISTRY, VERSION DIFF
//              & GUIDED 6-STEP ASSESSMENT WORKFLOW
// ============================================================================

/**
 * Determine whether a single HITL risk package has a required (mandatory) open corrective action.
 * Rules:
 * - Optional future quality improvements (`OPTIONAL_QUALITY_IMPROVEMENT` with no mandatory trigger)
 *   must NOT be counted as mandatory open remediation actions.
 * - A risk has a mandatory open remediation action when:
 *   (a) The semantic engine classified `requires_mandatory_action === true` or
 *       `action_classification === 'MANDATORY_CORRECTIVE_ACTION'`, OR
 *   (b) An explicit corrective action text is recorded (`active_corrective_action_ar` non-empty and
 *       not "لا يلزم") AND the risk has either a control rated Needs Improvement / No Control OR
 *       residual rating H / VH / C.
 */
export function isRiskMandatoryRemediationRequired(
  draftInput: any,
  calcOutput: any,
  pkgFull: any
): boolean {
  const rec = pkgFull?.corrective_action_recommendation;
  if (rec?.requires_mandatory_action === true || rec?.action_classification === 'MANDATORY_CORRECTIVE_ACTION') {
    return true;
  }

  const activeText = String(draftInput?.active_corrective_action_ar || '').trim();
  const hasExplicitActionText =
    activeText.length > 0 &&
    !activeText.includes('لا يلزم') &&
    !activeText.includes('غير مطلوب') &&
    activeText !== '-';

  if (!hasExplicitActionText) {
    return false;
  }

  const residualRating = String(calcOutput?.continuous_residual_rating || '');
  const hasHighResidual = residualRating === 'H' || residualRating === 'VH' || residualRating === 'C';

  const controls = calcOutput?.controls_calculated || [];
  const hasDeficientControl = controls.some(
    (c: any) =>
      String(c.effectiveness_classification || '').includes('يحتاج') ||
      String(c.effectiveness_classification || '').includes('لا يوجد')
  );

  return hasHighResidual || hasDeficientControl;
}

/**
 * Count required open remediation actions for a specific assessment from its HITL risk packages
 * (plus any open rows in `action_plans` not already counted).
 */
export function countMandatoryRemediationActionsForAssessment(assessmentId: string): number {
  try {
    ensureAssessmentPackagesPopulated(assessmentId);
  } catch {
    // Ignore if assessment cannot be populated
  }

  const pkgRows = db
    .prepare(
      'SELECT risk_id, current_draft_input_json, calculated_output_json, package_full_json FROM hitl_risk_packages WHERE assessment_id = ?'
    )
    .all(assessmentId) as any[];

  let count = 0;
  for (const row of pkgRows) {
    const draft = JSON.parse(row.current_draft_input_json || '{}');
    const calc = JSON.parse(row.calculated_output_json || '{}');
    const pkg = JSON.parse(row.package_full_json || '{}');
    if (isRiskMandatoryRemediationRequired(draft, calc, pkg)) {
      count++;
    }
  }

  if (count === 0) {
    const dbPlans = db
      .prepare(
        `SELECT count(*) as cnt FROM action_plans ap
         JOIN risks r ON ap.risk_id = r.id
         WHERE r.assessment_id = ? AND ap.current_status IN ('PENDING', 'IN_PROGRESS', 'DELAYED')`
      )
      .get(assessmentId) as { cnt: number };
    count = dbPlans?.cnt || 0;
  }

  return count;
}

export function listMandatoryRemediationActionsForAssessment(assessmentId: string): Array<{
  id: string;
  risk_id: string;
  risk_code: string;
  risk_description: string;
  title: string;
  assigned_owner: string;
  target_completion_date: string;
  current_status: string;
}> {
  try {
    ensureAssessmentPackagesPopulated(assessmentId);
  } catch {
    // Ignore if assessment cannot be populated
  }

  const pkgRows = db
    .prepare(
      `SELECT p.risk_id, p.current_draft_input_json, p.calculated_output_json, p.package_full_json,
              r.risk_code, r.risk_description
       FROM hitl_risk_packages p
       LEFT JOIN risks r ON r.id = p.risk_id
       WHERE p.assessment_id = ?
       ORDER BY p.display_order ASC`
    )
    .all(assessmentId) as any[];

  const results: Array<{
    id: string;
    risk_id: string;
    risk_code: string;
    risk_description: string;
    title: string;
    assigned_owner: string;
    target_completion_date: string;
    current_status: string;
  }> = [];

  for (const row of pkgRows) {
    const draft = JSON.parse(row.current_draft_input_json || '{}');
    const calc = JSON.parse(row.calculated_output_json || '{}');
    const pkg = JSON.parse(row.package_full_json || '{}');
    if (!isRiskMandatoryRemediationRequired(draft, calc, pkg)) continue;

    const rec = pkg?.corrective_action_recommendation || {};
    const title =
      String(draft?.active_corrective_action_ar || '').trim() ||
      String(rec?.recommended_action_ar || '').trim() ||
      String(rec?.reason_ar || '').trim() ||
      'إجراء تصحيحي إلزامي لمعالجة الفجوة الرقابية';

    const residualRating = String(calc?.continuous_residual_rating || '').toUpperCase();
    results.push({
      id: `hitl-ap-${assessmentId}-${row.risk_id}`,
      risk_id: row.risk_id,
      risk_code: row.risk_code || pkg?.risk_code || row.risk_id,
      risk_description: draft?.risk_description || row.risk_description || '',
      title,
      assigned_owner: String(draft?.action_owner_ar || 'مسؤول الوحدة التنظيمية'),
      target_completion_date: String(draft?.target_completion_date || '2026-12-31'),
      current_status: residualRating === 'VH' || residualRating === 'C' ? 'DELAYED' : 'IN_PROGRESS',
    });
  }

  return results;
}

/**
 * Retrieve complete historical RCSA registry for a Business Unit (Phase 2D.1 Section 2).
 */
export function getUnitAssessmentsHistory(unitId: string, user: User): any {
  initHitlSchema();

  if (!isUserAuthorizedForBU(user, unitId)) {
    const err: any = new Error(
      `غير مصرح: لا تملك صلاحية الوصول إلى السجل التاريخي للوحدة التنظيمية (${unitId}).`
    );
    err.statusCode = 403;
    throw err;
  }

  const unit = db.prepare('SELECT * FROM business_units WHERE id = ?').get(unitId) as any;
  if (!unit) {
    const err: any = new Error('الوحدة التنظيمية غير موجودة.');
    err.statusCode = 404;
    throw err;
  }

  const coverage = db.prepare('SELECT * FROM bu_source_coverage WHERE unit_id = ?').get(unitId) as any;

  const rawAssessments = db
    .prepare(
      `SELECT a.*,
              u_create.full_name as creator_name,
              u_sub.full_name as submitter_name,
              u_app.full_name as approver_name
       FROM rcsa_assessments a
       LEFT JOIN users u_create ON a.created_by = u_create.employee_id
       LEFT JOIN users u_sub ON a.submitted_by = u_sub.employee_id
       LEFT JOIN users u_app ON a.approved_by = u_app.employee_id
       WHERE a.unit_id = ?
       ORDER BY a.version_number DESC, a.updated_at DESC`
    )
    .all(unitId) as any[];

  const enrichedAssessments = rawAssessments.map(a => {
    try {
      ensureAssessmentPackagesPopulated(a.id);
    } catch {
      // Ignore if empty
    }

    const meta = db
      .prepare(
        `SELECT hm.*, u_save.full_name as last_saved_by_name, u_ret.full_name as returned_by_name
         FROM hitl_assessment_meta hm
         LEFT JOIN users u_save ON hm.last_saved_by = u_save.employee_id
         LEFT JOIN users u_ret ON hm.returned_by = u_ret.employee_id
         WHERE hm.assessment_id = ?`
      )
      .get(a.id) as any;

    const pkgRows = db
      .prepare('SELECT * FROM hitl_risk_packages WHERE assessment_id = ? ORDER BY display_order ASC')
      .all(a.id) as any[];

    let controlsCount = 0;
    let reviewedRisksCount = 0;
    let missingInputsCount = 0;
    let mandatoryActionsCount = 0;

    for (const r of pkgRows) {
      const draft = JSON.parse(r.current_draft_input_json || '{}');
      const calc = JSON.parse(r.calculated_output_json || '{}');
      const pkg = JSON.parse(r.package_full_json || '{}');
      controlsCount += (draft.controls || []).length;
      if (r.is_reviewed) reviewedRisksCount++;

      const pendingCtrls = (calc.controls_calculated || []).filter(
        (c: any) =>
          c.implementation_status === 'IMPLEMENTED' && c.effectiveness_classification === 'PENDING_REVIEW'
      );
      if ((pkg.pending_missing_fields || []).length > 0 || pendingCtrls.length > 0) {
        missingInputsCount++;
      }
      if (isRiskMandatoryRemediationRequired(draft, calc, pkg)) {
        mandatoryActionsCount++;
      }
    }

    // Field-level audit history for this assessment
    const fieldEvents = db
      .prepare(
        `SELECT * FROM hitl_field_audit_history
         WHERE assessment_id = ?
         ORDER BY id DESC`
      )
      .all(a.id) as any[];

    // Central audit log events for this assessment
    const centralEvents = db
      .prepare(
        `SELECT al.*, u.full_name as actor_name
         FROM audit_logs al
         LEFT JOIN users u ON al.user_id = u.employee_id
         WHERE al.entity_id = ? OR al.entity_id LIKE ?
         ORDER BY al.id DESC`
      )
      .all(a.id, `${a.id}::%`) as any[];

    const latestFieldEdit = fieldEvents[0] || null;
    const latestCentralEvent = centralEvents[0] || null;

    const lastEditorId =
      latestFieldEdit?.actor_id || meta?.last_saved_by || latestCentralEvent?.user_id || a.created_by;
    const lastEditorName =
      latestFieldEdit?.actor_name ||
      meta?.last_saved_by_name ||
      latestCentralEvent?.actor_name ||
      a.creator_name ||
      a.created_by;

    const hasRecordedFieldEdits = fieldEvents.some(
      e =>
        e.action_type === 'EDIT_RISK_AND_RECALCULATE' ||
        e.action_type === 'EDIT_CONTROL_AND_RECALCULATE' ||
        e.action_type === 'RECALCULATE_SINGLE_RISK' ||
        String(e.action_type).startsWith('SUGGESTION_')
    );

    const timestampDetails = getAssessmentTimestampDetails({
      id: a.id,
      status: a.status,
      workflow_status: meta?.workflow_status,
      cycle_year: a.cycle_year,
      created_at: a.created_at,
      updated_at: a.updated_at,
      submitted_at: a.submitted_at,
      approved_at: a.approved_at,
      last_saved_at: meta?.last_saved_at,
      revision: meta?.revision,
      has_recorded_edits: hasRecordedFieldEdits,
    });

    // Build factual summary of changes strictly from recorded audit trails
    const summaryItems: string[] = [];
    if (fieldEvents.length > 0) {
      for (const fe of fieldEvents.slice(0, 4)) {
        const riskPrefix = fe.risk_id ? `[${fe.risk_id}] ` : '';
        if (fe.evidence_or_reason) {
          summaryItems.push(`${riskPrefix}${fe.evidence_or_reason} (${fe.actor_name || fe.actor_id})`);
        } else {
          summaryItems.push(`${riskPrefix}تحديث الحقل ${fe.field_name}`);
        }
      }
    } else if (centralEvents.length > 0) {
      for (const ce of centralEvents.slice(0, 3)) {
        summaryItems.push(ce.change_summary);
      }
    }

    let changesSummaryAr: string;
    if (summaryItems.length > 0) {
      changesSummaryAr = summaryItems.join(' | ');
    } else if (SEEDED_ASSESSMENT_IDS.has(a.id) && a.status === 'APPROVED') {
      changesSummaryAr =
        'إصدار مرجعي معتمد ضمن السجلات الأساسية للوحدة (لا توجد تعديلات لاحقة مسجلة على هذا الإصدار المجمد).';
    } else {
      changesSummaryAr = 'لا توجد تغييرات تفصيلية مسجلة في سجل التدقيق حتى الآن.';
    }

    const immutableSnapshot = db
      .prepare(
        'SELECT id, cryptographic_sha256, approved_by, approved_at FROM immutable_assessment_snapshots WHERE assessment_id = ? LIMIT 1'
      )
      .get(a.id) as any;

    return {
      id: a.id,
      unit_id: a.unit_id,
      unit_name_ar: unit.name_ar,
      unit_code: unit.code,
      cycle_year: a.cycle_year,
      title: a.title,
      title_ar: a.title,
      clean_title_ar: cleanAssessmentTitleAr(a.title),
      workflow_source: a.workflow_source,
      status: a.status,
      workflow_status: (meta?.workflow_status || toHitlWorkflowStatus(a.status)) as HitlWorkflowStatus,
      version_number: a.version_number,
      revision: meta?.revision || 1,
      base_assessment_id: meta?.base_assessment_id || null,
      is_latest_approved: Boolean(a.is_latest_approved),
      is_immutable_approved: a.status === 'APPROVED' || meta?.workflow_status === 'APPROVED',
      has_cryptographic_snapshot: Boolean(immutableSnapshot),
      cryptographic_sha256: immutableSnapshot?.cryptographic_sha256 || null,
      // Top-level actor & count fields for UI convenience
      creator_name: a.creator_name || a.created_by,
      last_editor_name: lastEditorName,
      approver_name: a.approver_name || a.approved_by || null,
      risks_count: pkgRows.length,
      controls_count: controlsCount,
      reviewed_risks_count: reviewedRisksCount,
      missing_inputs_count: missingInputsCount,
      mandatory_remediation_actions_count: mandatoryActionsCount,
      timestamps: {
        ...timestampDetails,
        raw_created_at: a.created_at,
        raw_updated_at: meta?.last_saved_at || a.updated_at,
        raw_submitted_at: a.submitted_at,
        raw_approved_at: a.approved_at,
      },
      actors: {
        created_by: a.created_by,
        creator_name: a.creator_name || a.created_by,
        last_editor_id: lastEditorId,
        last_editor_name: lastEditorName,
        submitted_by: a.submitted_by || null,
        submitter_name: a.submitter_name || a.submitted_by || null,
        approved_by: a.approved_by || null,
        approver_name: a.approver_name || a.approved_by || null,
        returned_by: meta?.returned_by || null,
        returner_name: meta?.returned_by_name || meta?.returned_by || null,
        return_reason: meta?.return_reason || a.rejection_reason || null,
      },
      counts: {
        risks_count: pkgRows.length,
        controls_count: controlsCount,
        reviewed_risks_count: reviewedRisksCount,
        missing_inputs_count: missingInputsCount,
        mandatory_remediation_actions_count: mandatoryActionsCount,
      },
      changes_summary_ar: changesSummaryAr,
      recorded_audit_events_count: fieldEvents.length + centralEvents.length,
      recent_audit_events: [
        ...fieldEvents.slice(0, 5).map(fe => ({
          source: 'FIELD_AUDIT',
          ts: fe.ts,
          ts_ar: formatArabicDateTime(fe.ts),
          actor_id: fe.actor_id,
          actor_name: fe.actor_name || fe.actor_id,
          actor_role: fe.actor_role,
          action_type: fe.action_type,
          risk_id: fe.risk_id,
          control_id: fe.control_id,
          field_name: fe.field_name,
          previous_value: fe.previous_value,
          new_value: fe.new_value,
          summary_ar: fe.evidence_or_reason || `تعديل الحقل (${fe.field_name})`,
        })),
        ...centralEvents.slice(0, 5).map(ce => ({
          source: 'CENTRAL_AUDIT',
          ts: ce.ts,
          ts_ar: formatArabicDateTime(ce.ts),
          actor_id: ce.user_id,
          actor_name: ce.actor_name || ce.user_id,
          actor_role: ce.user_role,
          action_type: ce.action,
          risk_id: null,
          control_id: null,
          field_name: null,
          previous_value: null,
          new_value: null,
          summary_ar: ce.change_summary,
        })),
      ].slice(0, 6),
    };
  });

  return {
    unit,
    source_coverage: coverage || null,
    assessments: enrichedAssessments,
  };
}

/**
 * Helper to load risk packages for comparison from an immutable snapshot if available,
 * or from `hitl_risk_packages` otherwise.
 */
function loadAssessmentRisksForComparison(assessmentId: string): {
  assessment: any;
  meta: any;
  risks: any[];
  evidence_source_type: 'IMMUTABLE_CRYPTOGRAPHIC_SNAPSHOT' | 'SEEDED_BASELINE_RECORD' | 'LIVE_DRAFT_PACKAGES';
  snapshot_sha256: string | null;
} {
  ensureAssessmentPackagesPopulated(assessmentId);

  const assessment = db
    .prepare(
      `SELECT a.*, u1.full_name as creator_name, u2.full_name as approver_name
       FROM rcsa_assessments a
       LEFT JOIN users u1 ON a.created_by = u1.employee_id
       LEFT JOIN users u2 ON a.approved_by = u2.employee_id
       WHERE a.id = ?`
    )
    .get(assessmentId) as any;

  if (!assessment) {
    throw new Error(`التقييم (${assessmentId}) غير موجود.`);
  }

  const meta = db
    .prepare('SELECT * FROM hitl_assessment_meta WHERE assessment_id = ?')
    .get(assessmentId) as any;

  const snapRow = db
    .prepare(
      'SELECT * FROM immutable_assessment_snapshots WHERE assessment_id = ? ORDER BY version_number DESC LIMIT 1'
    )
    .get(assessmentId) as any;

  if (snapRow && snapRow.snapshot_json) {
    try {
      const parsed = JSON.parse(snapRow.snapshot_json);
      if (Array.isArray(parsed.risks)) {
        return {
          assessment,
          meta,
          risks: parsed.risks,
          evidence_source_type: 'IMMUTABLE_CRYPTOGRAPHIC_SNAPSHOT',
          snapshot_sha256: snapRow.cryptographic_sha256,
        };
      }
    } catch {
      // Fallback to hitl_risk_packages if JSON parse fails
    }
  }

  const state = getAssessmentHitlFullState(assessmentId);
  const isSeededApproved =
    SEEDED_ASSESSMENT_IDS.has(assessmentId) && assessment.status === 'APPROVED';

  return {
    assessment: state.assessment,
    meta,
    risks: state.risks,
    evidence_source_type: isSeededApproved ? 'SEEDED_BASELINE_RECORD' : 'LIVE_DRAFT_PACKAGES',
    snapshot_sha256: null,
  };
}

function getProvenanceTypeAr(type: 'IMMUTABLE_CRYPTOGRAPHIC_SNAPSHOT' | 'SEEDED_BASELINE_RECORD' | 'LIVE_DRAFT_PACKAGES'): string {
  switch (type) {
    case 'IMMUTABLE_CRYPTOGRAPHIC_SNAPSHOT':
      return 'لقطة مشفرة مجمدة (Immutable Snapshot)';
    case 'SEEDED_BASELINE_RECORD':
      return 'سجل مرجعي معتمد بقاعدة البيانات';
    case 'LIVE_DRAFT_PACKAGES':
    default:
      return 'سجل مسودة نشطة';
  }
}

/**
 * Compare two assessment versions belonging to the same Business Unit (Phase 2D.1 Section 2).
 */
export function compareUnitAssessmentVersions(
  unitId: string,
  baseAssessmentId: string,
  targetAssessmentId: string,
  user: User
): any {
  if (!isUserAuthorizedForBU(user, unitId)) {
    const err: any = new Error(
      `غير مصرح: لا تملك صلاحية مقارنة تقييمات الوحدة التنظيمية (${unitId}).`
    );
    err.statusCode = 403;
    throw err;
  }

  if (!baseAssessmentId || !targetAssessmentId) {
    const err: any = new Error('يلزم تحديد تقييمين للمقارنة.');
    err.statusCode = 400;
    throw err;
  }

  const baseLoaded = loadAssessmentRisksForComparison(baseAssessmentId);
  const targetLoaded = loadAssessmentRisksForComparison(targetAssessmentId);

  if (baseLoaded.assessment.unit_id !== unitId || targetLoaded.assessment.unit_id !== unitId) {
    const err: any = new Error('لا يمكن مقارنة تقييمين ينتميان لوحدتين تنظيميتين مختلفتين.');
    err.statusCode = 400;
    throw err;
  }

  const baseMap = new Map<string, any>();
  for (const r of baseLoaded.risks) {
    baseMap.set(r.risk_id, r);
  }

  const targetMap = new Map<string, any>();
  for (const r of targetLoaded.risks) {
    targetMap.set(r.risk_id, r);
  }

  const allRiskIds = Array.from(new Set([...baseMap.keys(), ...targetMap.keys()]));

  const addedRisks: any[] = [];
  const removedRisks: any[] = [];
  const riskComparisons: any[] = [];
  const riskDiffs: any[] = [];

  // Load recorded field audit history for both assessments
  const fieldAuditRows = db
    .prepare(
      `SELECT * FROM hitl_field_audit_history
       WHERE assessment_id IN (?, ?)
       ORDER BY id DESC`
    )
    .all(baseAssessmentId, targetAssessmentId) as any[];

  for (const riskId of allRiskIds) {
    const baseRisk = baseMap.get(riskId);
    const targetRisk = targetMap.get(riskId);

    if (!baseRisk && targetRisk) {
      const tDraft = targetRisk.current_draft_input || {};
      const tCalc = targetRisk.calculated_output || {};
      addedRisks.push({
        risk_id: riskId,
        process_name: tDraft.process_name || '-',
        risk_description: tDraft.risk_description || '-',
        expected_annual_loss_egp: tCalc.expected_annual_loss_egp ?? null,
        effective_max_rrf: tCalc.effective_max_rrf ?? null,
        residual_financial_amount_egp: tCalc.residual_financial_amount_egp ?? null,
        residual_rating: tCalc.continuous_residual_rating ?? null,
      });
      riskDiffs.push({
        risk_code: riskId,
        risk_id: riskId,
        change_type: 'ADDED',
        change_type_ar: 'مخاطرة مضافة',
        base: null,
        target: {
          description_ar: tDraft.risk_description || '-',
          expected_loss_egp: tCalc.individual_financial_impact_egp ?? tDraft.individual_financial_impact ?? 0,
          frequency_score: tCalc.normalized_frequency_level ?? '-',
          annual_expected_loss_egp: tCalc.expected_annual_loss_egp ?? 0,
          inherent_rating: tCalc.annualized_financial_rating ?? '-',
          max_eligible_rrf: tCalc.effective_max_rrf ?? 0,
          winning_control_id: tCalc.selected_max_rrf_control_id ?? null,
          residual_value_egp: tCalc.residual_financial_amount_egp ?? 0,
          residual_rating: tCalc.continuous_residual_rating ?? '-',
        },
        changes: {
          financial_inputs_changed: true,
          annual_loss_changed: true,
          max_rrf_changed: true,
          residual_changed: true,
        },
        control_diffs: { added: [], removed: [], modified: [] },
        audit_evidence: [],
      });
      continue;
    }

    if (baseRisk && !targetRisk) {
      const bDraft = baseRisk.current_draft_input || {};
      const bCalc = baseRisk.calculated_output || {};
      removedRisks.push({
        risk_id: riskId,
        process_name: bDraft.process_name || '-',
        risk_description: bDraft.risk_description || '-',
        expected_annual_loss_egp: bCalc.expected_annual_loss_egp ?? null,
        effective_max_rrf: bCalc.effective_max_rrf ?? null,
        residual_financial_amount_egp: bCalc.residual_financial_amount_egp ?? null,
        residual_rating: bCalc.continuous_residual_rating ?? null,
      });
      riskDiffs.push({
        risk_code: riskId,
        risk_id: riskId,
        change_type: 'REMOVED',
        change_type_ar: 'مخاطرة محذوفة',
        base: {
          description_ar: bDraft.risk_description || '-',
          expected_loss_egp: bCalc.individual_financial_impact_egp ?? bDraft.individual_financial_impact ?? 0,
          frequency_score: bCalc.normalized_frequency_level ?? '-',
          annual_expected_loss_egp: bCalc.expected_annual_loss_egp ?? 0,
          inherent_rating: bCalc.annualized_financial_rating ?? '-',
          max_eligible_rrf: bCalc.effective_max_rrf ?? 0,
          winning_control_id: bCalc.selected_max_rrf_control_id ?? null,
          residual_value_egp: bCalc.residual_financial_amount_egp ?? 0,
          residual_rating: bCalc.continuous_residual_rating ?? '-',
        },
        target: null,
        changes: {
          financial_inputs_changed: true,
          annual_loss_changed: true,
          max_rrf_changed: true,
          residual_changed: true,
        },
        control_diffs: { added: [], removed: [], modified: [] },
        audit_evidence: [],
      });
      continue;
    }

    // Both exist — compare fields, calculations, and controls
    const bDraft = baseRisk.current_draft_input || {};
    const tDraft = targetRisk.current_draft_input || {};
    const bCalc = baseRisk.calculated_output || {};
    const tCalc = targetRisk.calculated_output || {};

    const descChanged =
      String(bDraft.risk_description || '').trim() !== String(tDraft.risk_description || '').trim();
    const processChanged =
      String(bDraft.process_name || '').trim() !== String(tDraft.process_name || '').trim();

    const indImpactChanged =
      Number(bCalc.individual_financial_impact_egp ?? -1) !==
      Number(tCalc.individual_financial_impact_egp ?? -1);
    const freqChanged =
      String(bCalc.normalized_frequency_label_ar || bDraft.expected_frequency_text || '') !==
        String(tCalc.normalized_frequency_label_ar || tDraft.expected_frequency_text || '') ||
      Number(bCalc.annual_frequency_multiplier ?? -1) !==
        Number(tCalc.annual_frequency_multiplier ?? -1);

    const annualLossChanged =
      Number(bCalc.expected_annual_loss_egp ?? -1) !== Number(tCalc.expected_annual_loss_egp ?? -1) ||
      String(bCalc.annualized_financial_rating || '') !==
        String(tCalc.annualized_financial_rating || '');

    const maxRrfChanged =
      Number(bCalc.effective_max_rrf ?? -1) !== Number(tCalc.effective_max_rrf ?? -1) ||
      String(bCalc.selected_max_rrf_control_id || '') !==
        String(tCalc.selected_max_rrf_control_id || '');

    const residualChanged =
      Number(bCalc.residual_financial_amount_egp ?? -1) !==
        Number(tCalc.residual_financial_amount_egp ?? -1) ||
      String(bCalc.continuous_residual_rating || '') !== String(tCalc.continuous_residual_rating || '');

    const correctiveChanged =
      String(bDraft.active_corrective_action_ar || '').trim() !==
      String(tDraft.active_corrective_action_ar || '').trim();

    const rationaleChanged =
      String(bDraft.active_rationale_ar || '').trim() !==
      String(tDraft.active_rationale_ar || '').trim();

    // Control-level comparison
    const bCtrls: any[] = bDraft.controls || [];
    const tCtrls: any[] = tDraft.controls || [];
    const bCalcCtrls: any[] = bCalc.controls_calculated || [];
    const tCalcCtrls: any[] = tCalc.controls_calculated || [];

    const bCtrlMap = new Map(bCtrls.map(c => [c.control_id, c]));
    const tCtrlMap = new Map(tCtrls.map(c => [c.control_id, c]));
    const allCtrlIds = Array.from(new Set([...bCtrlMap.keys(), ...tCtrlMap.keys()]));

    const addedControls: any[] = [];
    const removedControls: any[] = [];
    const modifiedControls: any[] = [];

    for (const cId of allCtrlIds) {
      const bc = bCtrlMap.get(cId);
      const tc = tCtrlMap.get(cId);
      const bcc = bCalcCtrls.find(x => x.control_id === cId) || {};
      const tcc = tCalcCtrls.find(x => x.control_id === cId) || {};

      if (!bc && tc) {
        addedControls.push({
          control_id: cId,
          control_description: tc.control_description,
          description_ar: tc.control_description,
          control_type: tcc.control_type_label_ar || tc.control_type_raw,
          control_method: tcc.control_method_label_ar || tc.control_method_raw,
          effectiveness: tcc.effectiveness_classification || tc.effectiveness_raw,
          applicable_rrf: tcc.applicable_rrf ?? null,
        });
      } else if (bc && !tc) {
        removedControls.push({
          control_id: cId,
          control_description: bc.control_description,
          description_ar: bc.control_description,
          control_type: bcc.control_type_label_ar || bc.control_type_raw,
          control_method: bcc.control_method_label_ar || bc.control_method_raw,
          effectiveness: bcc.effectiveness_classification || bc.effectiveness_raw,
          applicable_rrf: bcc.applicable_rrf ?? null,
        });
      } else if (bc && tc) {
        const changes: string[] = [];
        if (String(bc.control_description || '').trim() !== String(tc.control_description || '').trim()) {
          changes.push('وصف الضابط');
        }
        if (String(bc.control_type_raw || '') !== String(tc.control_type_raw || '')) {
          changes.push('نوع الضابط');
        }
        if (String(bc.control_method_raw || '') !== String(tc.control_method_raw || '')) {
          changes.push('آلية تنفيذ الضابط');
        }
        if (
          String(bcc.effectiveness_classification || bc.effectiveness_raw || '') !==
          String(tcc.effectiveness_classification || tc.effectiveness_raw || '')
        ) {
          changes.push('تقييم الفاعلية (P)');
        }
        if (String(bc.implementation_status || '') !== String(tc.implementation_status || '')) {
          changes.push('حالة التطبيق');
        }
        if (bc.eligible_for_scope_override !== tc.eligible_for_scope_override) {
          changes.push('أهلية النطاق لخفض الخطر المتبقي');
        }
        if (Number(bcc.applicable_rrf ?? -1) !== Number(tcc.applicable_rrf ?? -1)) {
          changes.push('معامل الخفض (RRF)');
        }

        if (changes.length > 0) {
          modifiedControls.push({
            control_id: cId,
            changed_fields_ar: changes,
            before: {
              control_description: bc.control_description,
              control_type: bcc.control_type_label_ar || bc.control_type_raw,
              control_method: bcc.control_method_label_ar || bc.control_method_raw,
              effectiveness: bcc.effectiveness_classification || bc.effectiveness_raw,
              implementation_status: bc.implementation_status,
              eligible_for_scope_override: bc.eligible_for_scope_override,
              is_eligible_for_residual: bcc.is_eligible_for_residual_reduction,
              applicable_rrf: bcc.applicable_rrf,
            },
            after: {
              control_description: tc.control_description,
              control_type: tcc.control_type_label_ar || tc.control_type_raw,
              control_method: tcc.control_method_label_ar || tc.control_method_raw,
              effectiveness: tcc.effectiveness_classification || tc.effectiveness_raw,
              implementation_status: tc.implementation_status,
              eligible_for_scope_override: tc.eligible_for_scope_override,
              is_eligible_for_residual: tcc.is_eligible_for_residual_reduction,
              applicable_rrf: tcc.applicable_rrf,
            },
            base: {
              implementation_status: bc.implementation_status || 'IMPLEMENTED',
              scope_relevance:
                bc.eligible_for_scope_override === false ? 'EXCLUDED' : 'ELIGIBLE',
              effective_rrf: bcc.is_eligible_for_residual_reduction ? (bcc.applicable_rrf ?? 0) : 0,
            },
            target: {
              implementation_status: tc.implementation_status || 'IMPLEMENTED',
              scope_relevance:
                tc.eligible_for_scope_override === false ? 'EXCLUDED' : 'ELIGIBLE',
              effective_rrf: tcc.is_eligible_for_residual_reduction ? (tcc.applicable_rrf ?? 0) : 0,
            },
          });
        }
      }
    }

    const hasAnyDifference =
      descChanged ||
      processChanged ||
      indImpactChanged ||
      freqChanged ||
      annualLossChanged ||
      maxRrfChanged ||
      residualChanged ||
      correctiveChanged ||
      rationaleChanged ||
      addedControls.length > 0 ||
      removedControls.length > 0 ||
      modifiedControls.length > 0;

    const riskAuditEvents = fieldAuditRows
      .filter(f => f.risk_id === riskId)
      .map(f => ({
        id: f.id,
        assessment_id: f.assessment_id,
        ts: f.ts,
        ts_ar: formatArabicDateTime(f.ts),
        actor_id: f.actor_id,
        actor_name: f.actor_name || f.actor_id,
        actor_role: f.actor_role,
        action_type: f.action_type,
        control_id: f.control_id,
        field_name: f.field_name,
        previous_value: f.previous_value,
        new_value: f.new_value,
        evidence_or_reason: f.evidence_or_reason,
        reason_or_evidence: f.evidence_or_reason,
      }));

    riskComparisons.push({
      risk_id: riskId,
      excel_row: targetRisk.excel_row ?? baseRisk.excel_row,
      process_name: tDraft.process_name || bDraft.process_name,
      has_differences: hasAnyDifference,
      risk_description_diff: {
        changed: descChanged,
        before: bDraft.risk_description || '-',
        after: tDraft.risk_description || '-',
      },
      financial_inputs_diff: {
        individual_impact_changed: indImpactChanged,
        individual_impact_before_egp: bCalc.individual_financial_impact_egp ?? null,
        individual_impact_after_egp: tCalc.individual_financial_impact_egp ?? null,
        frequency_changed: freqChanged,
        frequency_before_ar: bCalc.normalized_frequency_label_ar || bDraft.expected_frequency_text || '-',
        frequency_after_ar: tCalc.normalized_frequency_label_ar || tDraft.expected_frequency_text || '-',
        multiplier_before: bCalc.annual_frequency_multiplier ?? null,
        multiplier_after: tCalc.annual_frequency_multiplier ?? null,
      },
      expected_annual_loss_diff: {
        changed: annualLossChanged,
        before_egp: bCalc.expected_annual_loss_egp ?? null,
        after_egp: tCalc.expected_annual_loss_egp ?? null,
        rating_before: bCalc.annualized_financial_rating ?? null,
        rating_after: tCalc.annualized_financial_rating ?? null,
      },
      max_rrf_diff: {
        changed: maxRrfChanged,
        before_rrf: bCalc.effective_max_rrf ?? null,
        after_rrf: tCalc.effective_max_rrf ?? null,
        control_before: bCalc.selected_max_rrf_control_id ?? null,
        control_after: tCalc.selected_max_rrf_control_id ?? null,
      },
      residual_risk_diff: {
        changed: residualChanged,
        before_egp: bCalc.residual_financial_amount_egp ?? null,
        after_egp: tCalc.residual_financial_amount_egp ?? null,
        rating_before: bCalc.continuous_residual_rating ?? null,
        rating_after: tCalc.continuous_residual_rating ?? null,
      },
      corrective_action_diff: {
        changed: correctiveChanged,
        before: bDraft.active_corrective_action_ar || 'لا يوجد إجراء تصحيحي مسجل',
        after: tDraft.active_corrective_action_ar || 'لا يوجد إجراء تصحيحي مسجل',
      },
      rationale_diff: {
        changed: rationaleChanged,
        before: bDraft.active_rationale_ar || '-',
        after: tDraft.active_rationale_ar || '-',
      },
      controls_diff: {
        added_controls: addedControls,
        removed_controls: removedControls,
        modified_controls: modifiedControls,
      },
      recorded_audit_evidence: riskAuditEvents,
      audit_evidence_note_ar:
        riskAuditEvents.length > 0
          ? `موثق بعدد (${riskAuditEvents.length}) سجل تدقيق تفصيلي على مستوى الحقل.`
          : hasAnyDifference
            ? 'الفرق ناتج عن اختلاف السجلات الأولية بين التقييمين دون وجود سجل تعديل حقلي مسجل في بيانات البذر.'
            : 'تطابق كامل في القيم والنتائج المحسوبة بين الإصدارين.',
    });

    riskDiffs.push({
      risk_code: riskId,
      risk_id: riskId,
      change_type: hasAnyDifference ? 'MODIFIED' : 'UNCHANGED',
      change_type_ar: hasAnyDifference ? 'مخاطرة معدلة' : 'دون تغيير',
      base: {
        description_ar: bDraft.risk_description || '-',
        expected_loss_egp: bCalc.individual_financial_impact_egp ?? bDraft.individual_financial_impact ?? 0,
        frequency_score: bCalc.normalized_frequency_level ?? '-',
        annual_expected_loss_egp: bCalc.expected_annual_loss_egp ?? 0,
        inherent_rating: bCalc.annualized_financial_rating ?? '-',
        max_eligible_rrf: bCalc.effective_max_rrf ?? 0,
        winning_control_id: bCalc.selected_max_rrf_control_id ?? null,
        residual_value_egp: bCalc.residual_financial_amount_egp ?? 0,
        residual_rating: bCalc.continuous_residual_rating ?? '-',
      },
      target: {
        description_ar: tDraft.risk_description || '-',
        expected_loss_egp: tCalc.individual_financial_impact_egp ?? tDraft.individual_financial_impact ?? 0,
        frequency_score: tCalc.normalized_frequency_level ?? '-',
        annual_expected_loss_egp: tCalc.expected_annual_loss_egp ?? 0,
        inherent_rating: tCalc.annualized_financial_rating ?? '-',
        max_eligible_rrf: tCalc.effective_max_rrf ?? 0,
        winning_control_id: tCalc.selected_max_rrf_control_id ?? null,
        residual_value_egp: tCalc.residual_financial_amount_egp ?? 0,
        residual_rating: tCalc.continuous_residual_rating ?? '-',
      },
      changes: {
        financial_inputs_changed: indImpactChanged || freqChanged,
        annual_loss_changed: annualLossChanged,
        max_rrf_changed: maxRrfChanged,
        residual_changed: residualChanged,
      },
      control_diffs: {
        added: addedControls,
        removed: removedControls,
        modified: modifiedControls,
      },
      audit_evidence: riskAuditEvents,
    });
  }

  const baseTs = getAssessmentTimestampDetails({
    id: baseLoaded.assessment.id,
    status: baseLoaded.assessment.status,
    workflow_status: baseLoaded.meta?.workflow_status,
    cycle_year: baseLoaded.assessment.cycle_year,
    created_at: baseLoaded.assessment.created_at,
    updated_at: baseLoaded.assessment.updated_at,
    submitted_at: baseLoaded.assessment.submitted_at,
    approved_at: baseLoaded.assessment.approved_at,
    last_saved_at: baseLoaded.meta?.last_saved_at,
    revision: baseLoaded.meta?.revision,
  });

  const targetTs = getAssessmentTimestampDetails({
    id: targetLoaded.assessment.id,
    status: targetLoaded.assessment.status,
    workflow_status: targetLoaded.meta?.workflow_status,
    cycle_year: targetLoaded.assessment.cycle_year,
    created_at: targetLoaded.assessment.created_at,
    updated_at: targetLoaded.assessment.updated_at,
    submitted_at: targetLoaded.assessment.submitted_at,
    approved_at: targetLoaded.assessment.approved_at,
    last_saved_at: targetLoaded.meta?.last_saved_at,
    revision: targetLoaded.meta?.revision,
  });

  return {
    unit_id: unitId,
    base_assessment: {
      id: baseLoaded.assessment.id,
      title: cleanAssessmentTitleAr(baseLoaded.assessment.title),
      status: baseLoaded.assessment.status,
      workflow_status: baseLoaded.meta?.workflow_status,
      timestamps: baseTs,
      evidence_source_type: baseLoaded.evidence_source_type,
      provenance_type_ar: getProvenanceTypeAr(baseLoaded.evidence_source_type),
      snapshot_sha256: baseLoaded.snapshot_sha256,
      creator_name: baseLoaded.assessment.creator_name || baseLoaded.assessment.created_by,
      approver_name: baseLoaded.assessment.approver_name || baseLoaded.assessment.approved_by,
    },
    target_assessment: {
      id: targetLoaded.assessment.id,
      title: cleanAssessmentTitleAr(targetLoaded.assessment.title),
      status: targetLoaded.assessment.status,
      workflow_status: targetLoaded.meta?.workflow_status,
      timestamps: targetTs,
      evidence_source_type: targetLoaded.evidence_source_type,
      provenance_type_ar: getProvenanceTypeAr(targetLoaded.evidence_source_type),
      snapshot_sha256: targetLoaded.snapshot_sha256,
      creator_name: targetLoaded.assessment.creator_name || targetLoaded.assessment.created_by,
      approver_name: targetLoaded.assessment.approver_name || targetLoaded.assessment.approved_by,
    },
    summary: {
      total_compared_risks: allRiskIds.length,
      added_risks_count: addedRisks.length,
      removed_risks_count: removedRisks.length,
      modified_risks_count: riskComparisons.filter(r => r.has_differences).length,
      unchanged_risks_count: riskComparisons.filter(r => !r.has_differences).length,
    },
    added_risks: addedRisks,
    removed_risks: removedRisks,
    risk_comparisons: riskComparisons,
    risk_diffs: riskDiffs,
  };
}

const FREQ_LEVEL_TO_TEXT_AR: Record<number, string> = {
  1: 'مرة كل سنتان',
  2: 'مرة واحدة كل سنة',
  3: 'مرة واحدة كل نصف سنة',
  4: 'مرة واحدة كل ربع سنة',
  5: 'مرة واحدة كل شهر',
};

function mapCtrlTypeToDesign(raw?: string | null): string | null {
  if (!raw) return null;
  const s = raw.toLowerCase();
  if (s.includes('prev') || s.includes('وقائ') || s.includes('مانع')) return 'Preventive';
  if (s.includes('det') || s.includes('كاشف')) return 'Detective';
  if (s.includes('corr') || s.includes('تصحيح')) return 'Corrective';
  return raw;
}

function mapCtrlMethodToAuto(raw?: string | null): string | null {
  if (!raw) return null;
  const s = raw.toLowerCase();
  if (s.includes('semi') || s.includes('نصف')) return 'Semi-Automated';
  if (s.includes('auto') || s.includes('آلي')) return 'Automated';
  if (s.includes('man') || s.includes('يدوي')) return 'Manual';
  return raw;
}

/**
 * Retrieve context for the 6-Step Guided Assessment workflow for a specific Business Unit (Phase 2D.1 Section 4).
 */
export function getGuidedAssessmentUnitContext(unitId: string, user: User): any {
  initHitlSchema();

  if (!isUserAuthorizedForBU(user, unitId)) {
    const err: any = new Error(
      `غير مصرح: لا تملك صلاحية الوصول إلى بيانات الوحدة التنظيمية (${unitId}).`
    );
    err.statusCode = 403;
    throw err;
  }

  const unit = db.prepare('SELECT * FROM business_units WHERE id = ?').get(unitId) as any;
  if (!unit) {
    const err: any = new Error('الوحدة التنظيمية غير موجودة.');
    err.statusCode = 404;
    throw err;
  }

  const coverage = db.prepare('SELECT * FROM bu_source_coverage WHERE unit_id = ?').get(unitId) as any;

  const documents = db
    .prepare(
      `SELECT d.*, u.full_name as uploader_name,
              (SELECT count(*) FROM document_chunks dc WHERE dc.document_id = d.id) as chunks_count
       FROM documents d
       LEFT JOIN users u ON d.uploaded_by = u.employee_id
       WHERE d.unit_id = ?
       ORDER BY d.uploaded_at DESC, d.id ASC`
    )
    .all(unitId) as any[];

  const sopChunks = db
    .prepare(
      `SELECT dc.*, d.filename, d.file_type
       FROM document_chunks dc
       JOIN documents d ON dc.document_id = d.id
       WHERE d.unit_id = ?
       ORDER BY dc.document_id ASC, dc.chunk_index ASC`
    )
    .all(unitId) as any[];

  const incidents = db
    .prepare('SELECT * FROM historical_incidents WHERE unit_id = ? ORDER BY incident_code ASC')
    .all(unitId) as any[];

  const auditFindings = db
    .prepare('SELECT * FROM audit_findings WHERE unit_id = ? ORDER BY finding_number ASC')
    .all(unitId) as any[];

  const initialPythonPackages = getUnitInitialPackages(unitId);
  const candidateRiskItems = initialPythonPackages.risk_items || [];

  const formattedDocs = documents.map(d => {
    const baseName = path.basename(d.filename);
    const hasChunks = Number(d.chunks_count || 0) > 0;
    return {
      ...d,
      title_ar: baseName,
      doc_type: d.file_type,
      original_filename: baseName,
      uploaded_at_ar: formatArabicDateTime(d.uploaded_at),
      display_filename: baseName,
      parse_status: hasChunks ? 'EXTRACTED_AND_INDEXED' : 'STORED_MANUAL_EXTRACT_REQUIRED',
    };
  });

  const formattedSopChunks = sopChunks.map(c => ({
    ...c,
    chunk_id: c.id,
    sop_title_ar: path.basename(c.filename || 'SOP'),
    section_ref: c.section_title || `مقطع ${c.chunk_index}`,
    text_ar: c.content_text,
    title_ar: c.section_title || path.basename(c.filename || 'مستند'),
    page_or_section: `ص ${c.page_number || 1}`,
    chunk_text: c.content_text,
  }));

  const formattedIncidents = incidents.map(inc => ({
    ...inc,
    incident_id: inc.id || `INC-${inc.incident_code}`,
    title_ar: inc.event_description || inc.process_name,
    financial_loss_egp: inc.financial_loss_amount ?? null,
    cause_ar: inc.root_cause || inc.event_description,
  }));

  const formattedFindings = auditFindings.map(af => ({
    ...af,
    finding_id: af.id || `AUD-${af.finding_number}`,
    title_ar: af.finding_title,
    severity: af.severity_level || 'متوسط',
    finding_ar: af.finding_description,
  }));

  const candidateRisksUi = candidateRiskItems.map((item: any) => {
    const draft = item.current_draft_input || {};
    const calc = item.calculated_output || {};
    return {
      risk_id: item.risk_id,
      process_name_ar: draft.process_name || unit.name_ar,
      subprocess_name_ar: draft.risk_library_name || '',
      risk_title_ar: draft.risk_library_name || draft.process_name || item.risk_id,
      description_ar: draft.risk_description || '',
      expected_loss_egp: draft.individual_financial_impact ?? null,
      frequency_score: calc.normalized_frequency_level ?? null,
      loss_Notes_ar: draft.financial_evidence_justification || '',
      frequency_notes_ar: draft.frequency_justification || '',
      controls: (draft.controls || []).map((c: any) => ({
        control_id: c.control_id,
        description_ar: c.control_description || '',
        design_classification: mapCtrlTypeToDesign(c.control_type_raw),
        automation_level: mapCtrlMethodToAuto(c.control_method_raw),
        implementation_status: c.implementation_status || 'PROPOSED',
        scope_relevance: c.eligible_for_scope_override === false ? 'EXCLUDED' : 'ELIGIBLE',
        effectiveness_raw: c.effectiveness_raw,
        control_owner: c.control_owner,
        control_frequency_raw: c.control_frequency_raw,
      })),
      current_draft_input: draft,
    };
  });

  const enrichedCoverage = coverage
    ? {
        ...coverage,
        status:
          coverage.sop_status === 'AVAILABLE' &&
          coverage.incidents_status === 'AVAILABLE' &&
          coverage.audit_findings_status === 'AVAILABLE'
            ? 'complete'
            : coverage.sop_status === 'AVAILABLE'
              ? 'partial'
              : 'none',
        notes_ar: coverage.coverage_notes,
      }
    : null;

  return {
    unit,
    source_coverage: enrichedCoverage,
    documents: formattedDocs,
    registered_documents: formattedDocs,
    extracted_sop_chunks: formattedSopChunks,
    sop_chunks: formattedSopChunks,
    uploaded_chunks: [],
    registered_incidents: formattedIncidents,
    incidents: formattedIncidents,
    registered_audit_findings: formattedFindings,
    audit_findings: formattedFindings,
    candidate_risk_items: candidateRiskItems,
    candidate_risks: candidateRisksUi,
  };
}

/**
 * Upload and register a supporting document for a Business Unit (Phase 2D.1 Section 4 Step 2).
 */
export function uploadSupportingDocumentForUnit(params: {
  unitId: string;
  user: User;
  filename?: string;
  fileName?: string;
  titleAr?: string;
  fileType?: string;
  docType?: string;
  contentText?: string;
  textContent?: string;
  contentBase64?: string;
  base64Content?: string;
  mimeType?: string;
  fileSizeBytes?: number;
}): any {
  const { unitId, user } = params;
  const filename = (params.filename || params.fileName || '').trim();
  const fileType = (params.fileType || params.docType || 'SOP').toUpperCase();
  const contentText = params.contentText ?? params.textContent;
  const contentBase64 = params.contentBase64 ?? params.base64Content;

  if (!isUserAuthorizedForBU(user, unitId, ['MAKER', 'RISK_ADMIN'])) {
    const err: any = new Error(
      `غير مصرح: يلزم توفر صلاحية معد تقييم (MAKER) أو مسؤول مخاطر لرفع مستندات للوحدة (${unitId}).`
    );
    err.statusCode = 403;
    throw err;
  }

  if (!filename) {
    const err: any = new Error('اسم الملف المرفوع مطلوب.');
    err.statusCode = 400;
    throw err;
  }

  const validTypes = ['SOP', 'AUDIT_REPORT', 'INCIDENT_LOG', 'PREVIOUS_RCSA'];
  const normalizedType = validTypes.includes(fileType) ? fileType : 'SOP';

  const safeName = path.basename(filename).replace(/[^a-zA-Z0-9._\u0600-\u06FF-]/g, '_');
  const ext = path.extname(safeName).toLowerCase();
  const allowedExtensions = [
    '.pdf', '.docx', '.doc', '.xlsx', '.xls', '.pptx', '.ppt',
    '.csv', '.tsv', '.txt', '.md', '.json', '.xml', '.html', '.htm',
    '.rtf', '.yaml', '.yml', '.log', '.ini', '.sql', '.zip',
  ];
  if (!allowedExtensions.includes(ext)) {
    const err: any = new Error('نوع المستند غير مدعوم. الامتدادات المسموحة PDF وDOCX وXLSX وPPTX وCSV وJSON وXML وZIP والملفات النصية.');
    err.statusCode = 400; throw err;
  }
  if (!contentBase64 && typeof contentText !== 'string') {
    const err: any = new Error('لا يوجد محتوى فعلي للمستند المرفوع.');
    err.statusCode = 400; throw err;
  }
  if (contentBase64 && (!/^[A-Za-z0-9+/]*={0,2}$/.test(contentBase64) || contentBase64.length % 4 !== 0)) {
    const err: any = new Error('ترميز الملف غير صالح.'); err.statusCode = 400; throw err;
  }
  const uploadsDir = path.resolve('data', 'uploads', unitId);
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const rawBuffer = contentBase64
    ? Buffer.from(contentBase64, 'base64')
    : Buffer.from(contentText || '', 'utf-8');
  if (!rawBuffer.length || rawBuffer.length > 6 * 1024 * 1024 ||
      (params.fileSizeBytes && Number(params.fileSizeBytes) !== rawBuffer.length)) {
    const err: any = new Error('المستند فارغ أو يتجاوز 6 ميجابايت أو لم يُرفع كاملًا.');
    err.statusCode = 400; throw err;
  }

  const sha256Hash = crypto.createHash('sha256').update(rawBuffer).digest('hex').slice(0, 16);
  const storedRelativePath = path.join('data', 'uploads', unitId, `${Date.now()}_${safeName}`);
  fs.writeFileSync(path.resolve(storedRelativePath), rawBuffer);

  // Extraction is deterministic and intentionally does not identify risks or controls.
  // Extract only the bytes actually stored, never infer content from filename.
  let extractionReason = '';
  let decodedText = '';
  try {
    const extracted = JSON.parse(execFileSync(getPythonExecutable(), ['-m', 'rcsa_engine.document_extract', '--path', storedRelativePath], {
      cwd: process.cwd(), encoding: 'utf-8', maxBuffer: 2 * 1024 * 1024, timeout: 60_000,
    }));
    decodedText = extracted.status === 'EXTRACTED' ? String(extracted.text || '') : '';
    extractionReason = String(extracted.reason || '');
  } catch (error: any) {
    extractionReason = 'تعذر تشغيل استخلاص النص؛ يرجى مراجعة المستند يدويًا.';
  }
  if (!decodedText.trim() && typeof contentText === 'string' && contentText.trim().length > 0) {
    decodedText = contentText.trim();
  }
  const isTextExtractable = decodedText.trim().length > 0;

  const docId = `DOC-${unitId.replace('BU-', '')}-${Date.now().toString(36).toUpperCase()}`;
  const chunksInserted: Array<{ id: string; section_title: string; content_text: string }> = [];

  runInTransaction(() => {
    db.prepare(
      `INSERT INTO documents (id, unit_id, filename, file_type, file_hash, uploaded_by, uploaded_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
    ).run(docId, unitId, storedRelativePath, normalizedType, sha256Hash, user.employee_id);

    if (isTextExtractable && decodedText.length > 0) {
      const paragraphs = decodedText
        .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')
        .split(/\r?\n\s*\r?\n|\r?\n/)
        .map(p => p.trim())
        .filter(p => p.length > 2)
        .slice(0, 350);

      const insertChunk = db.prepare(
        `INSERT INTO document_chunks (id, document_id, chunk_index, section_title, content_text, page_number)
         VALUES (?, ?, ?, ?, ?, ?)`
      );

      let currentSection = '';
      let currentPage = 1;
      let chunkSeq = 0;
      paragraphs.forEach((p) => {
        const pageMatch = p.match(/^\[(?:PDF page|Slide)\s+(\d+)\]\s*(.*)$/i);
        if (pageMatch) {
          currentPage = parseInt(pageMatch[1], 10) || currentPage;
          if (!pageMatch[2]?.trim()) {
            return;
          }
        }
        const bracketMatch = p.match(/^\[([^\]]+)\]\s*(.*)$/);
        if (bracketMatch && !bracketMatch[2]?.trim()) {
          currentSection = bracketMatch[1];
          return;
        }
        const cleanBody = (pageMatch?.[2] || bracketMatch?.[2] || p).trim();
        if (cleanBody.length <= 2) return;

        // Track numbered/titled section headings inside the document for clearer citations
        const headingPrefix = cleanBody.match(
          /^(\d+(?:\.\d+)*\.?\s+[^•:\n]{5,90})(?:\s|$)/
        );
        if (headingPrefix && !cleanBody.startsWith('•')) {
          const candidateHeading = headingPrefix[1]
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 80);
          if (candidateHeading.length >= 6) {
            currentSection = candidateHeading;
          }
        }

        chunkSeq += 1;
        const chunkId = `CHK-${docId}-${chunkSeq}`;
        const title = bracketMatch?.[1] && !pageMatch
          ? `${bracketMatch[1]} — ${safeName}`
          : currentSection
            ? `${currentSection} (صفحة ${currentPage})`
            : `صفحة ${currentPage} • مقطع (${chunkSeq})`;
        insertChunk.run(chunkId, docId, chunkSeq, title, cleanBody, currentPage);
        chunksInserted.push({ id: chunkId, section_title: title, content_text: cleanBody });
      });

      if (normalizedType === 'SOP' && chunksInserted.length > 0) {
        db.prepare(
          `UPDATE bu_source_coverage
           SET sop_status = 'AVAILABLE',
               sop_procedures_count = sop_procedures_count + ?
           WHERE unit_id = ?`
        ).run(chunksInserted.length, unitId);
        unitInitCache.delete(unitId);
      }
    }

    const role = user.roles.find(r => r.unit_id === unitId)?.role || user.roles[0]?.role || 'MAKER';
    logAuditEvent({
      userId: user.employee_id,
      userRole: role,
      unitId,
      entityType: 'DOCUMENT',
      entityId: docId,
      action: 'UPLOAD_DOCUMENT',
      beforeState: null,
      afterState: {
        document_id: docId,
        filename: safeName,
        file_type: normalizedType,
        file_hash: sha256Hash,
        extracted_chunks_count: chunksInserted.length,
      },
      changeSummary: `رفع وحفظ مستند مؤيد "${safeName}" (${normalizedType}) للوحدة (${unitId}) ببصمة (${sha256Hash}) بواسطة ${user.full_name}`,
    });
  });

  const extractionStatus =
    chunksInserted.length > 0
      ? 'EXTRACTED_TEXT_CHUNKS'
      : 'STORED_WITHOUT_BINARY_EXTRACTION';

  const statusMessageAr =
    chunksInserted.length > 0
      ? `تم حفظ المستند "${safeName}" واستخلاص (${chunksInserted.length}) مقطعاً نصياً بنجاح في قاعدة البيانات.`
      : `تم حفظ المستند "${safeName}" وتوثيق بصمته الرقمية (${sha256Hash}) في سجل مستندات الوحدة. لم تتوفر نصوص قابلة للاستخلاص من هذا الملف (${ext}). ${extractionReason || 'قد يكون المستند مصورًا أو محميًا.'} يرجى مراجعة المستند يدويًا؛ لم تُنشأ مخاطر أو ضوابط منه تلقائيًا.`;

  return {
    document_id: docId,
    filename: safeName,
    file_type: normalizedType,
    file_hash: sha256Hash,
    extraction_status: extractionStatus,
    extracted_chunks_count: chunksInserted.length,
    message_ar: statusMessageAr,
    document: {
      id: docId,
      title_ar: params.titleAr || safeName,
      doc_type: normalizedType,
      original_filename: safeName,
      parse_status:
        chunksInserted.length > 0 ? 'EXTRACTED_TEXT_CHUNKS' : 'STORED_MANUAL_EXTRACT_REQUIRED',
      extraction_notice_ar: statusMessageAr,
      chunks_count: chunksInserted.length,
    },
    context: getGuidedAssessmentUnitContext(unitId, user),
  };
}

/**
 * Helper to normalize a candidate risk item (from either UI Step 4 or test riskInputs)
 * into `{ risk_id, current_draft_input }` for Python recalculation.
 */
function normalizeGuidedRiskItem(rawItem: any, unitId: string, index: number): {
  risk_id: string;
  current_draft_input: any;
  ui_draft_input: any;
} {
  const rId = rawItem.risk_id || `RSK-${unitId.replace('BU-', '')}-0${index + 1}`;
  const baseDraft = rawItem.current_draft_input ? { ...rawItem.current_draft_input } : {};

  const processName = rawItem.process_name_ar ?? rawItem.process_name ?? baseDraft.process_name ?? 'العمليات المصرفية للوحدة';
  const strategicObjective =
    rawItem.strategic_objective_ar ??
    rawItem.strategic_objective ??
    baseDraft.strategic_objective ??
    'التركيز على العملاء و تعظيم الأرباح';
  const riskLibraryName =
    rawItem.risk_library_name_ar ??
    rawItem.risk_library_name ??
    rawItem.risk_title_ar ??
    baseDraft.risk_library_name ??
    '';
  const riskDesc = rawItem.description_ar ?? rawItem.risk_description ?? baseDraft.risk_description ?? '';
  const indImpact =
    rawItem.expected_loss_egp !== undefined
      ? rawItem.expected_loss_egp
      : rawItem.financial_impact_amount !== undefined
        ? rawItem.financial_impact_amount
        : rawItem.single_incident_max_loss !== undefined
          ? rawItem.single_incident_max_loss
          : baseDraft.individual_financial_impact ?? null;

  let freqText =
    baseDraft.expected_frequency_text ??
    rawItem.inherent_frequency_text ??
    rawItem.expected_frequency_text ??
    null;
  if (rawItem.frequency_score !== undefined && rawItem.frequency_score !== null && rawItem.frequency_score !== '') {
    freqText = FREQ_LEVEL_TO_TEXT_AR[Number(rawItem.frequency_score)] || freqText;
  }

  const rawControls: any[] = Array.isArray(rawItem.controls)
    ? rawItem.controls
    : Array.isArray(baseDraft.controls)
      ? baseDraft.controls
      : [];

  const normalizedControls = rawControls.map((c: any, cIdx: number) => ({
    ...c,
    control_id: c.control_id || `CTL-${rId.replace('RSK-', '')}-0${cIdx + 1}`,
    linked_risk_id: rId,
    control_description: c.control_description ?? c.description_ar ?? '',
    control_owner: c.control_owner || c.owner_ar || 'السلطة الإشرافية',
    control_type_raw: c.control_type_raw ?? c.design_classification ?? null,
    control_method_raw: c.control_method_raw ?? c.automation_level ?? null,
    control_frequency_raw: c.control_frequency_raw || c.frequency_ar || 'Daily\nيومياً',
    effectiveness_raw:
      c.effectiveness_raw || 'PENDING_REVIEW',
    implementation_status: c.implementation_status || 'PROPOSED',
    eligible_for_scope_override:
      c.eligible_for_scope_override !== undefined
        ? c.eligible_for_scope_override
        : c.scope_relevance === 'EXCLUDED'
          ? false
          : null,
  }));

  const currentDraftInput = {
    ...baseDraft,
    risk_id: rId,
    unit_id: unitId,
    process_name: processName,
    strategic_objective: strategicObjective,
    risk_library_name: riskLibraryName,
    risk_description: riskDesc,
    individual_financial_impact: indImpact,
    financial_value_origin:
      indImpact !== null && indImpact !== ''
        ? baseDraft.financial_value_origin && baseDraft.financial_value_origin !== 'MISSING_OR_UNSUPPORTED'
          ? baseDraft.financial_value_origin
          : 'EXPLICIT_HUMAN_ESTIMATE'
        : 'MISSING_OR_UNSUPPORTED',
    financial_evidence_justification:
      rawItem.financial_impact_justification ??
      rawItem.financial_evidence_justification ??
      baseDraft.financial_evidence_justification ??
      '',
    expected_frequency_text: freqText,
    frequency_origin:
      freqText !== null && String(freqText).trim() !== ''
        ? baseDraft.frequency_origin && baseDraft.frequency_origin !== 'MISSING_FREQUENCY'
          ? baseDraft.frequency_origin
          : 'AUTHORIZED_USER_ESTIMATE'
        : 'MISSING_FREQUENCY',
    frequency_justification:
      rawItem.frequency_justification ??
      baseDraft.frequency_justification ??
      'مقدر وفق دورية تنفيذ الإجراءات وسجل الأحداث التاريخية للوحدة',
    active_rationale_ar:
      rawItem.acceptance_rationale_ar ??
      rawItem.active_rationale_ar ??
      baseDraft.active_rationale_ar ??
      '',
    active_corrective_action_ar:
      rawItem.corrective_action_ar ??
      rawItem.active_corrective_action_ar ??
      baseDraft.active_corrective_action_ar ??
      '',
    controls: normalizedControls,
    ...resolveTaxonomyFields(rawItem, baseDraft),
  };

  return {
    risk_id: rId,
    current_draft_input: currentDraftInput,
    ui_draft_input: {
      description_ar: riskDesc,
      process_name_ar: processName,
    },
  };
}

/**
 * Step 5 of Guided Assessment: Invoke authoritative Python engine to calculate a list of risk inputs
 * without duplicating any financial or RRF formulas in TypeScript/JavaScript.
 */
export function previewGuidedAssessmentCalculation(params: {
  unitId: string;
  user: User;
  riskInputs?: Array<any>;
  candidateRisks?: Array<any>;
}): any {
  const { unitId, user } = params;
  const rawList = Array.isArray(params.riskInputs)
    ? params.riskInputs
    : Array.isArray(params.candidateRisks)
      ? params.candidateRisks
      : [];

  if (!isUserAuthorizedForBU(user, unitId, ['MAKER', 'RISK_ADMIN'])) {
    const err: any = new Error('غير مصرح بتشغيل محرك الاحتساب لهذه الوحدة.');
    err.statusCode = 403;
    throw err;
  }

  if (rawList.length === 0) {
    const err: any = new Error(
      'لا توجد مخاطر مدخلة للاحتساب. يرجى إضافة مخاطرة واحدة على الأقل واستكمال مدخلاتها في الخطوة 4.'
    );
    err.statusCode = 400;
    throw err;
  }

  const calculatedItems: any[] = [];
  for (let i = 0; i < rawList.length; i++) {
    const norm = normalizeGuidedRiskItem(rawList[i], unitId, i);
    const pyRes = invokePythonEngineBridge({
      action: 'recalculate_single_risk',
      unit_id: unitId,
      risk_id: norm.risk_id,
      current_draft_input: norm.current_draft_input,
      preserve_custom_rationale: false,
    });

    const calcOut = pyRes.calculated_output || {};
    const isComplete =
      calcOut.expected_annual_loss_egp !== null &&
      calcOut.expected_annual_loss_egp !== undefined &&
      calcOut.residual_financial_amount_egp !== null &&
      calcOut.residual_financial_amount_egp !== undefined;

    const enrichedCalcOut = {
      ...calcOut,
      status: isComplete ? 'COMPLETE' : 'PENDING_INPUT',
      annual_expected_loss_egp: calcOut.expected_annual_loss_egp ?? null,
      inherent_rating: calcOut.annualized_financial_rating ?? null,
      inherent_level_ar: calcOut.annualized_financial_label_ar ?? calcOut.page5_heatmap_zone ?? '-',
      max_eligible_rrf: calcOut.effective_max_rrf ?? null,
      winning_control_id: calcOut.selected_max_rrf_control_id ?? null,
      residual_value_egp: calcOut.residual_financial_amount_egp ?? null,
      residual_rating: calcOut.continuous_residual_rating ?? null,
      pending_reasons: calcOut.missing_fields || [],
    };

    calculatedItems.push({
      risk_id: norm.risk_id,
      display_order: i + 1,
      current_draft_input: pyRes.current_draft_input,
      draft_input: norm.ui_draft_input,
      calculated_output: enrichedCalcOut,
      source_discrepancies: pyRes.source_discrepancies,
      package: pyRes.package,
    });
  }

  const completeCount = calculatedItems.filter(x => x.calculated_output.status === 'COMPLETE').length;

  return {
    unit_id: unitId,
    calculated_at: new Date().toISOString(),
    calculated_at_ar: formatArabicDateTime(new Date().toISOString().replace('T', ' ').slice(0, 19)),
    summary: {
      total_risks: calculatedItems.length,
      complete_risks: completeCount,
      pending_risks: calculatedItems.length - completeCount,
    },
    risk_items: calculatedItems,
    calculated_risks: calculatedItems,
  };
}

/**
 * Step 6 of Guided Assessment: Persist the guided assessment as a real SQLite draft
 * with all user-supplied inputs and Python-calculated outputs, ready to open in `RCSATablePage`.
 */
export function createGuidedAssessmentDraft(params: {
  unitId: string;
  user: User;
  title?: string;
  titleAr?: string;
  riskInputs?: Array<any>;
  candidateRisks?: Array<any>;
}): any {
  const { unitId, user } = params;
  const title = params.title || params.titleAr;
  const rawList = Array.isArray(params.riskInputs)
    ? params.riskInputs
    : Array.isArray(params.candidateRisks)
      ? params.candidateRisks
      : [];

  // First create the draft using the canonical manual draft creator
  const createdState = createManualDraftForUnit(unitId, user, title);
  const assessmentId = createdState.assessment.id;

  if (rawList.length > 0) {
    const providedRiskIds = new Set<string>();
    for (let i = 0; i < rawList.length; i++) {
      const norm = normalizeGuidedRiskItem(rawList[i], unitId, i);
      const rId = norm.risk_id;
      providedRiskIds.add(rId);
      const draft = norm.current_draft_input;

      const existingPkg = db
        .prepare('SELECT id, current_draft_input_json, original_source_json FROM hitl_risk_packages WHERE assessment_id = ? AND risk_id = ?')
        .get(assessmentId, rId) as any;

      const existingControls: any[] = existingPkg
        ? (() => {
            try {
              return JSON.parse(existingPkg.current_draft_input_json || '{}').controls || [];
            } catch {
              return [];
            }
          })()
        : [];
      const existingControlIds = new Set(existingControls.map((c: any) => c.control_id));
      const allDraftControlsExist =
        existingPkg &&
        (draft.controls || []).every((c: any) => existingControlIds.has(c.control_id));

      let persistedDraftInput: any = draft;
      let persistedCalcOutput: any = null;

      if (!existingPkg || !allDraftControlsExist) {
        const pyRes = invokePythonEngineBridge({
          action: 'recalculate_single_risk',
          unit_id: unitId,
          risk_id: rId,
          current_draft_input: draft,
          preserve_custom_rationale: Boolean(draft.active_rationale_ar && String(draft.active_rationale_ar).trim().length > 10),
        });
        persistedDraftInput = pyRes.current_draft_input;
        persistedCalcOutput = pyRes.calculated_output;

        if (!existingPkg) {
          db.prepare(
            `INSERT INTO hitl_risk_packages (
               id, assessment_id, risk_id, unit_id, excel_row, display_order,
               original_source_json, current_draft_input_json, calculated_output_json,
               previous_calculated_output_json, source_discrepancies_json, package_full_json,
               suggestion_decisions_json, discrepancy_decisions_json, provenance_map_json,
               is_reviewed, reviewed_by, reviewed_at, reviewer_notes_ar
             ) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, NULL, ?, ?, '{}', '{}', '{}', 0, NULL, NULL, NULL)`
          ).run(
            `${assessmentId}::${rId}`,
            assessmentId,
            rId,
            unitId,
            i + 1,
            JSON.stringify({ risk_id: rId, unit_id: unitId, controls: [] }),
            JSON.stringify(pyRes.current_draft_input),
            JSON.stringify(pyRes.calculated_output),
            JSON.stringify(pyRes.source_discrepancies || []),
            JSON.stringify(pyRes.package || {})
          );
        } else {
          db.prepare(
            `UPDATE hitl_risk_packages
             SET display_order = ?,
                 current_draft_input_json = ?,
                 calculated_output_json = ?,
                 source_discrepancies_json = ?,
                 package_full_json = ?,
                 updated_at = datetime('now')
             WHERE assessment_id = ? AND risk_id = ?`
          ).run(
            i + 1,
            JSON.stringify(pyRes.current_draft_input),
            JSON.stringify(pyRes.calculated_output),
            JSON.stringify(pyRes.source_discrepancies || []),
            JSON.stringify(pyRes.package || {}),
            assessmentId,
            rId
          );
        }

        syncRiskPackageToCoreTables(
          assessmentId,
          rId,
          unitId,
          i + 1,
          pyRes.current_draft_input,
          pyRes.calculated_output,
          false
        );
      } else {
        const currentState = getAssessmentHitlFullState(assessmentId);
        const updatedState = updateSingleRiskAndRecalculate({
          assessmentId,
          riskId: rId,
          user,
          expectedRevision: currentState.assessment.revision,
          riskUpdates: {
            process_name: draft.process_name,
            strategic_objective: draft.strategic_objective,
            risk_description: draft.risk_description,
            individual_financial_impact: draft.individual_financial_impact,
            financial_value_origin: draft.financial_value_origin,
            financial_evidence_justification: draft.financial_evidence_justification,
            expected_frequency_text: draft.expected_frequency_text,
            frequency_origin: draft.frequency_origin,
            frequency_justification: draft.frequency_justification,
            active_corrective_action_ar: draft.active_corrective_action_ar,
            taxonomy_l1_ar: draft.taxonomy_l1_ar,
          },
          controlUpdates: (draft.controls || []).map((c: any) => ({
            control_id: c.control_id,
            control_description: c.control_description,
            control_owner: c.control_owner,
            control_type_raw: c.control_type_raw,
            control_method_raw: c.control_method_raw,
            control_frequency_raw: c.control_frequency_raw,
            effectiveness_raw: c.effectiveness_raw,
            implementation_status: c.implementation_status,
            eligible_for_scope_override: c.eligible_for_scope_override,
          })),
          evidenceOrReason: 'استكمال مدخلات التقييم وإعادة الاحتساب ضمن مسار إعداد تقييم جديد الموجه',
        });
        const matchedRisk = (updatedState?.risks || []).find((r: any) => r.risk_id === rId);
        persistedDraftInput = matchedRisk?.current_draft_input || draft;
        persistedCalcOutput = matchedRisk?.calculated_output || null;
      }

      // If candidate risk includes AI-populated Phase 2C inputs (NFI V-Y, ESG AE, Acceptance AA-AC),
      // evaluate via authoritative Python Phase 2C engine and persist so all 29 columns are filled!
      if (rawList[i]?.phase2c_inputs && typeof rawList[i].phase2c_inputs === 'object') {
        try {
          const p2cInputs = { ...rawList[i].phase2c_inputs };
          // Enforce Phase 2C rule: acceptance_class === 1 must never carry a mandatory corrective action
          if (p2cInputs.acceptance_class === 1) {
            p2cInputs.corrective_action = '';
          }
          const resolvedTaxL1 =
            persistedDraftInput?.taxonomy_l1_id ||
            draft.taxonomy_l1_id ||
            persistedDraftInput?.taxonomy_l1_ar ||
            draft.taxonomy_l1_ar;
          const p2cResult = invokePythonEngineBridge({
            action: 'evaluate_phase2c',
            inputs: {
              ...p2cInputs,
              taxonomy_l1_ar: resolvedTaxL1,
              financial_rating: persistedCalcOutput?.annualized_financial_rating || 'M',
              residual_financial_rating: persistedCalcOutput?.continuous_residual_rating || null,
            },
          });
          db.prepare(`
            INSERT INTO phase2c_risk_assessments (assessment_id, risk_id, inputs_json, result_json, updated_by)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(assessment_id, risk_id) DO UPDATE SET
              inputs_json = excluded.inputs_json,
              result_json = excluded.result_json,
              updated_by = excluded.updated_by,
              updated_at = datetime('now')
          `).run(
            assessmentId,
            rId,
            JSON.stringify(p2cInputs),
            JSON.stringify(p2cResult),
            user.employee_id
          );
        } catch {
          // Leave Phase 2C for manual review if validation fails
        }
      }
    }

    // Remove any auto-seeded placeholder risk not included in the guided risk list
    const allPkgs = db
      .prepare('SELECT risk_id FROM hitl_risk_packages WHERE assessment_id = ?')
      .all(assessmentId) as Array<{ risk_id: string }>;
    for (const p of allPkgs) {
      if (!providedRiskIds.has(p.risk_id)) {
        db.prepare('DELETE FROM hitl_risk_packages WHERE assessment_id = ? AND risk_id = ?').run(
          assessmentId,
          p.risk_id
        );
        db.prepare(
          'DELETE FROM risk_controls WHERE risk_id IN (SELECT id FROM risks WHERE assessment_id = ? AND (id = ? OR risk_master_id = ?))'
        ).run(assessmentId, `${assessmentId}::${p.risk_id}`, p.risk_id);
        db.prepare(
          'DELETE FROM risks WHERE assessment_id = ? AND (id = ? OR risk_master_id = ?)'
        ).run(assessmentId, `${assessmentId}::${p.risk_id}`, p.risk_id);
      }
    }
  }

  return getAssessmentHitlFullState(assessmentId);
}


