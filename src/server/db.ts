import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcryptjs';
import { registerReferenceSources } from './reference-registry.js';

const DB_DIR = path.resolve('data');
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

export const DB_PATH = process.env.RCSA_DB_PATH || path.join(DB_DIR, process.env.NODE_ENV === 'test' ? 'rcsa_test.db' : 'rcsa.db');
export const db = new Database(DB_PATH);

// Enable foreign keys and Write-Ahead Logging (WAL) for high concurrency and persistence
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

/**
 * Execute a sequence of database operations atomically in a transaction.
 */
export function runInTransaction<T>(action: () => T): T {
  return db.transaction(action)();
}

export function initDatabase() {
  console.log(`[Database] Initializing persistent SQLite database at: ${DB_PATH}`);

  db.exec(`
    -- 1. Business Units
    CREATE TABLE IF NOT EXISTS business_units (
      id TEXT PRIMARY KEY,
      name_ar TEXT NOT NULL,
      name_en TEXT NOT NULL,
      code TEXT UNIQUE NOT NULL,
      description TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- 2. Users
    CREATE TABLE IF NOT EXISTS users (
      employee_id TEXT PRIMARY KEY,
      full_name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      must_reset_password INTEGER DEFAULT 1,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- 3. Multi-Role & BU Permissions
    CREATE TABLE IF NOT EXISTS user_bu_roles (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(employee_id) ON DELETE CASCADE,
      unit_id TEXT NOT NULL REFERENCES business_units(id) ON DELETE CASCADE,
      role TEXT CHECK(role IN ('MAKER', 'CHECKER', 'RISK_ADMIN', 'AUDITOR')) NOT NULL,
      granted_at TEXT DEFAULT (datetime('now')),
      granted_by TEXT,
      UNIQUE(user_id, unit_id, role)
    );

    -- 4. Documents & Evidence Chunks
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      unit_id TEXT NOT NULL REFERENCES business_units(id),
      filename TEXT NOT NULL,
      file_type TEXT CHECK(file_type IN ('SOP', 'AUDIT_REPORT', 'INCIDENT_LOG', 'PREVIOUS_RCSA')) NOT NULL,
      file_hash TEXT,
      uploaded_by TEXT NOT NULL REFERENCES users(employee_id),
      uploaded_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS document_chunks (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      chunk_index INTEGER NOT NULL,
      section_title TEXT,
      content_text TEXT NOT NULL,
      page_number INTEGER
    );

    -- 5. RCSA Assessments & Drafts
    CREATE TABLE IF NOT EXISTS rcsa_assessments (
      id TEXT PRIMARY KEY,
      unit_id TEXT NOT NULL REFERENCES business_units(id),
      cycle_year INTEGER NOT NULL,
      title TEXT NOT NULL,
      workflow_source TEXT CHECK(workflow_source IN ('BACKEND_GUIDED', 'AI_AGENT', 'MANUAL_OFFLINE')) NOT NULL,
      status TEXT CHECK(status IN ('INCOMPLETE_DRAFT', 'READY_DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED')) NOT NULL DEFAULT 'INCOMPLETE_DRAFT',
      version_number INTEGER NOT NULL DEFAULT 1,
      is_latest_approved INTEGER NOT NULL DEFAULT 0,
      created_by TEXT NOT NULL REFERENCES users(employee_id),
      submitted_by TEXT REFERENCES users(employee_id),
      submitted_at TEXT,
      approved_by TEXT REFERENCES users(employee_id),
      approved_at TEXT,
      rejection_reason TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- 6. Operational Risks (Supports incomplete drafts & stable risk identity across versions)
    CREATE TABLE IF NOT EXISTS risks (
      id TEXT PRIMARY KEY,
      risk_master_id TEXT NOT NULL,
      assessment_id TEXT NOT NULL REFERENCES rcsa_assessments(id) ON DELETE CASCADE,
      risk_code TEXT NOT NULL,
      process_name TEXT NOT NULL,
      risk_description TEXT NOT NULL,
      taxonomy_l1_id TEXT NOT NULL,
      taxonomy_l2_id TEXT,
      taxonomy_l3_id TEXT,
      financial_impact_level INTEGER,
      financial_impact_amount REAL,
      single_incident_max_loss REAL,
      nfi_service_level INTEGER,
      nfi_reputation_level INTEGER,
      nfi_regulatory_level INTEGER,
      nfi_legal_level INTEGER,
      nfi_composite_score TEXT,
      final_inherent_impact_level INTEGER,
      inherent_frequency_level INTEGER,
      inherent_frequency_text TEXT,
      expected_annual_loss REAL,
      inherent_risk_rating TEXT,
      residual_loss_amount REAL,
      residual_risk_rating TEXT,
      applied_max_rrf REAL,
      is_assessment_complete INTEGER DEFAULT 0,
      rational_text TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- 7. Controls Library
    CREATE TABLE IF NOT EXISTS controls (
      id TEXT PRIMARY KEY,
      control_code TEXT NOT NULL UNIQUE,
      control_description TEXT NOT NULL,
      control_type TEXT CHECK(control_type IN ('PREVENTIVE', 'DETECTIVE', 'CORRECTIVE')) NOT NULL,
      control_method TEXT CHECK(control_method IN ('AUTOMATED', 'SEMI_AUTOMATED', 'MANUAL')) NOT NULL,
      control_frequency TEXT NOT NULL,
      control_owner TEXT NOT NULL,
      raw_efficiency_rating TEXT NOT NULL,
      rrf_value REAL NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- 8. Risk-to-Control Junction (Many-to-Many with status: PROPOSED / IMPLEMENTED / VERIFIED)
    CREATE TABLE IF NOT EXISTS risk_controls (
      id TEXT PRIMARY KEY,
      risk_id TEXT NOT NULL REFERENCES risks(id) ON DELETE CASCADE,
      control_id TEXT NOT NULL REFERENCES controls(id) ON DELETE CASCADE,
      control_status TEXT CHECK(control_status IN ('PROPOSED', 'IMPLEMENTED', 'VERIFIED')) NOT NULL DEFAULT 'IMPLEMENTED',
      is_active_for_residual INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(risk_id, control_id)
    );

    -- 9. Remediation Action Plans
    CREATE TABLE IF NOT EXISTS action_plans (
      id TEXT PRIMARY KEY,
      risk_id TEXT NOT NULL REFERENCES risks(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      assigned_owner TEXT NOT NULL,
      target_completion_date TEXT NOT NULL,
      current_status TEXT CHECK(current_status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'DELAYED')) DEFAULT 'PENDING',
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- 10. Missing Data Clarification Prompts & Answers (Interactive provenance)
    CREATE TABLE IF NOT EXISTS clarification_prompts (
      id TEXT PRIMARY KEY,
      assessment_id TEXT NOT NULL REFERENCES rcsa_assessments(id) ON DELETE CASCADE,
      risk_id TEXT NOT NULL REFERENCES risks(id) ON DELETE CASCADE,
      field_name TEXT NOT NULL,
      question_ar TEXT NOT NULL,
      context_hint TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS clarification_answers (
      id TEXT PRIMARY KEY,
      prompt_id TEXT NOT NULL REFERENCES clarification_prompts(id) ON DELETE CASCADE,
      answered_by TEXT NOT NULL REFERENCES users(employee_id),
      user_role TEXT NOT NULL,
      supplied_value TEXT NOT NULL,
      justification_source TEXT NOT NULL,
      answered_at TEXT DEFAULT (datetime('now'))
    );

    -- 11. Immutable Assessment Snapshots (Approved version sealing)
    CREATE TABLE IF NOT EXISTS immutable_assessment_snapshots (
      id TEXT PRIMARY KEY,
      assessment_id TEXT NOT NULL REFERENCES rcsa_assessments(id),
      version_number INTEGER NOT NULL,
      snapshot_json TEXT NOT NULL,
      cryptographic_sha256 TEXT NOT NULL,
      approved_by TEXT NOT NULL REFERENCES users(employee_id),
      approved_at TEXT NOT NULL,
      UNIQUE(assessment_id, version_number)
    );

    -- 12. Structured Field-Level Audit Log (Append-Only)
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT DEFAULT (datetime('now')),
      user_id TEXT NOT NULL,
      user_role TEXT NOT NULL,
      unit_id TEXT,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      action TEXT NOT NULL,
      before_state TEXT,
      after_state TEXT,
      change_summary TEXT NOT NULL
    );

    -- 13. Phase 2D HITL Assessment Workflow & Optimistic Concurrency Metadata
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

    -- 14. Phase 2D HITL Risk & Control Review Packages
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

    -- 15. Phase 2D Field-Level Before/After Audit History
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

    -- 16. Database-Level Immutability Triggers for Approved Assessments & Snapshots
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

    -- 17. Phase 3A Unified RCSA Workflow Assessment Sessions
    CREATE TABLE IF NOT EXISTS rcsa_workflow_sessions (
      id TEXT PRIMARY KEY,
      unit_id TEXT NOT NULL REFERENCES business_units(id),
      workflow_mode TEXT NOT NULL CHECK(workflow_mode IN ('NEW', 'UPDATE')),
      base_assessment_id TEXT REFERENCES rcsa_assessments(id),
      draft_assessment_id TEXT REFERENCES rcsa_assessments(id),
      session_title TEXT NOT NULL,
      current_step INTEGER NOT NULL DEFAULT 1,
      use_historical_sources INTEGER NOT NULL DEFAULT 0,
      uploaded_document_ids_json TEXT NOT NULL DEFAULT '[]',
      candidate_risks_json TEXT NOT NULL DEFAULT '[]',
      calc_preview_json TEXT,
      created_by TEXT NOT NULL REFERENCES users(employee_id),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_workflow_sessions_unit_user ON rcsa_workflow_sessions(unit_id, created_by, updated_at DESC);

    -- 18. Phase 3B Conversational AI Agent Sessions, Proposals & Decision History
    CREATE TABLE IF NOT EXISTS rcsa_agent_conversations (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES rcsa_workflow_sessions(id) ON DELETE CASCADE,
      unit_id TEXT NOT NULL,
      sender_role TEXT CHECK(sender_role IN ('USER', 'AGENT', 'SYSTEM')) NOT NULL,
      message_text_ar TEXT NOT NULL,
      citations_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_agent_conv_session ON rcsa_agent_conversations(session_id, created_at ASC);

    CREATE TABLE IF NOT EXISTS rcsa_agent_proposals (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES rcsa_workflow_sessions(id) ON DELETE CASCADE,
      unit_id TEXT NOT NULL,
      proposal_type TEXT CHECK(proposal_type IN ('RISK', 'CONTROL', 'CLARIFICATION', 'CHANGE_RECOMMENDATION')) NOT NULL,
      proposal_data_json TEXT NOT NULL,
      citations_json TEXT NOT NULL DEFAULT '[]',
      status TEXT CHECK(status IN ('PROPOSED', 'ACCEPTED', 'MODIFIED_ACCEPTED', 'REJECTED')) DEFAULT 'PROPOSED',
      user_decision_notes TEXT,
      decided_by TEXT REFERENCES users(employee_id),
      decided_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_agent_proposals_session ON rcsa_agent_proposals(session_id, status);

    CREATE TABLE IF NOT EXISTS rcsa_agent_clarifications (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES rcsa_workflow_sessions(id) ON DELETE CASCADE,
      proposal_id TEXT REFERENCES rcsa_agent_proposals(id) ON DELETE CASCADE,
      field_name TEXT NOT NULL,
      question_ar TEXT NOT NULL,
      options_json TEXT,
      user_answer_ar TEXT,
      answered_by TEXT REFERENCES users(employee_id),
      answered_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_agent_clarif_session ON rcsa_agent_clarifications(session_id);
  `);

  try {
    db.exec("ALTER TABLE documents ADD COLUMN session_id TEXT");
  } catch {
    // Column already exists
  }

  try {
    db.exec("ALTER TABLE rcsa_workflow_sessions ADD COLUMN selected_model_profile TEXT DEFAULT 'qwen-4b'");
  } catch {
    // Column already exists
  }

  try {
    db.exec("ALTER TABLE rcsa_agent_conversations ADD COLUMN model_profile TEXT DEFAULT 'qwen-4b'");
  } catch {
    // Column already exists
  }

  try {
    db.exec("ALTER TABLE document_chunks ADD COLUMN embedding_json TEXT");
  } catch {
    // Column already exists
  }

  runInTransaction(() => {
    seedInitialData();
    ensureAllBusinessUnitsAndPermissions();
    registerReferenceSources(db);
  });
}

function ensureAllBusinessUnitsAndPermissions() {
  const insertBU = db.prepare(`
    INSERT OR IGNORE INTO business_units (id, name_ar, name_en, code, description)
    VALUES (?, ?, ?, ?, ?)
  `);

  insertBU.run(
    'BU-BRANCHES',
    'شبكة الفروع',
    'Branch Network',
    'BRANCHES',
    'إدارة وتنسيق شبكة فروع البنك الأهلي المصري، والعمليات المصرفية والنقدية وخدمة العملاء بالشبكة الجغرافية للفروع'
  );

  insertBU.run(
    'BU-TRADING',
    'التداول',
    'Trading',
    'TRADING',
    'إدارة عمليات تداول الأوراق المالية، وأسواق رأس المال، وغرفة المعاملات الدولية، وإدارة السيولة والمشتقات والتحوط'
  );

  const insertRole = db.prepare(`
    INSERT OR IGNORE INTO user_bu_roles (id, user_id, unit_id, role, granted_by)
    VALUES (?, ?, ?, ?, 'SYSTEM')
  `);

  // EMP-9009 (Risk Admin - Central oversight across all 5 units)
  insertRole.run('R-7', 'EMP-9009', 'BU-SYNDICATED', 'RISK_ADMIN');
  insertRole.run('R-8', 'EMP-9009', 'BU-ACCOUNT', 'RISK_ADMIN');
  insertRole.run('R-9', 'EMP-9009', 'BU-POS', 'RISK_ADMIN');
  insertRole.run('R-BRANCHES-ADMIN', 'EMP-9009', 'BU-BRANCHES', 'RISK_ADMIN');
  insertRole.run('R-TRADING-ADMIN', 'EMP-9009', 'BU-TRADING', 'RISK_ADMIN');

  // EMP-8008 (Auditor - Internal audit across all 5 units)
  insertRole.run('R-10', 'EMP-8008', 'BU-SYNDICATED', 'AUDITOR');
  insertRole.run('R-11', 'EMP-8008', 'BU-ACCOUNT', 'AUDITOR');
  insertRole.run('R-12', 'EMP-8008', 'BU-POS', 'AUDITOR');
  insertRole.run('R-BRANCHES-AUDIT', 'EMP-8008', 'BU-BRANCHES', 'AUDITOR');
  insertRole.run('R-TRADING-AUDIT', 'EMP-8008', 'BU-TRADING', 'AUDITOR');

  // EMP-1001 (Demo Maker: Syndicated Loans, Account Opening, and POS Operations - NOT Branch Network or Trading)
  insertRole.run('R-1', 'EMP-1001', 'BU-SYNDICATED', 'MAKER');
  insertRole.run('R-2', 'EMP-1001', 'BU-ACCOUNT', 'MAKER');
  insertRole.run('R-POS-MAKER-1001', 'EMP-1001', 'BU-POS', 'MAKER');
  db.prepare("DELETE FROM user_bu_roles WHERE user_id = 'EMP-1001' AND unit_id = 'BU-BRANCHES'").run();

  // EMP-2002 (Demo Checker: Syndicated Loans, Account Opening, and POS Operations - NOT Branch Network or Trading)
  insertRole.run('R-3', 'EMP-2002', 'BU-SYNDICATED', 'CHECKER');
  insertRole.run('R-4', 'EMP-2002', 'BU-ACCOUNT', 'CHECKER');
  insertRole.run('R-POS-CHECKER-2002', 'EMP-2002', 'BU-POS', 'CHECKER');
  db.prepare("DELETE FROM user_bu_roles WHERE user_id = 'EMP-2002' AND unit_id = 'BU-BRANCHES'").run();

  // EMP-3003 (Maker for BU-POS and BU-TRADING)
  insertRole.run('R-5', 'EMP-3003', 'BU-POS', 'MAKER');
  insertRole.run('R-TRADING-MAKER', 'EMP-3003', 'BU-TRADING', 'MAKER');

  // EMP-4004 (Checker for BU-POS and BU-TRADING)
  insertRole.run('R-6', 'EMP-4004', 'BU-POS', 'CHECKER');
  insertRole.run('R-TRADING-CHECKER', 'EMP-4004', 'BU-TRADING', 'CHECKER');

  // Ensure demo accounts do not require password reset on initial demo access
  db.prepare("UPDATE users SET must_reset_password = 0 WHERE employee_id IN ('EMP-1001', 'EMP-2002', 'EMP-3003', 'EMP-4004', 'EMP-9009', 'EMP-8008')").run();
}

function seedInitialData() {
  const count = db.prepare('SELECT count(*) as cnt FROM business_units').get() as { cnt: number };
  if (count.cnt > 0) {
    return; // Already seeded
  }

  console.log('[Database] Seeding initial authoritative banking reference data...');

  // 1. Seed Business Units
  const insertBU = db.prepare(`
    INSERT INTO business_units (id, name_ar, name_en, code, description)
    VALUES (?, ?, ?, ?, ?)
  `);

  insertBU.run(
    'BU-SYNDICATED',
    'إدارة عمليات القروض المشتركة',
    'Syndicated Loans Operations',
    'SYND-OPS',
    'إدارة عمليات السحب والتحويلات ومد خطابات الضمان والرقابة الثنائية لحسابات التمويل المشترك'
  );
  insertBU.run(
    'BU-ACCOUNT',
    'إدارة عمليات فتح الحسابات',
    'Account Opening Operations',
    'ACCT-OPS',
    'إدارة فحص مستندات الأفراد والشركات والتحقق من قوائم الحظر وإجراءات Maker/Checker وتفعيل الحسابات'
  );
  insertBU.run(
    'BU-POS',
    'إدارة عمليات ماكينات نقاط البيع',
    'POS Terminals Operations',
    'POS-OPS',
    'إدارة توريد وتركيب وسحب ماكينات نقاط البيع للتجار والفروع وإدارة الأعطال واختبارات التطبيقات'
  );

  // 2. Seed Initial Users
  // Standard initial password hash for "NBE@2026!"
  const initialPasswordHash = bcrypt.hashSync('NBE@2026!', 10);

  const insertUser = db.prepare(`
    INSERT INTO users (employee_id, full_name, email, password_hash, must_reset_password, is_active)
    VALUES (?, ?, ?, ?, ?, 1)
  `);

  insertUser.run('EMP-1001', 'أحمد محمود سليمان', 'a.soliman@nbe.com.eg', initialPasswordHash, 1);
  insertUser.run('EMP-2002', 'سارة إبراهيم خليل', 's.khalil@nbe.com.eg', initialPasswordHash, 1);
  insertUser.run('EMP-3003', 'كريم حسام الدين', 'k.hossam@nbe.com.eg', initialPasswordHash, 1);
  insertUser.run('EMP-4004', 'مريم عبد الرحمن فؤاد', 'm.fouad@nbe.com.eg', initialPasswordHash, 1);
  insertUser.run('EMP-9009', 'طارق عبد العزيز رضوان', 't.radwan@nbe.com.eg', initialPasswordHash, 0); // Risk Admin
  insertUser.run('EMP-8008', 'هدى سامي مصطفى', 'h.samy@nbe.com.eg', initialPasswordHash, 0); // Auditor

  // 3. Grant Multi-Role & BU Permissions
  const insertRole = db.prepare(`
    INSERT INTO user_bu_roles (id, user_id, unit_id, role, granted_by)
    VALUES (?, ?, ?, ?, 'SYSTEM')
  `);

  // EMP-1001: Maker for Syndicated Loans, Account Opening & POS Operations
  insertRole.run('R-1', 'EMP-1001', 'BU-SYNDICATED', 'MAKER');
  insertRole.run('R-2', 'EMP-1001', 'BU-ACCOUNT', 'MAKER');
  insertRole.run('R-POS-MAKER-1001', 'EMP-1001', 'BU-POS', 'MAKER');

  // EMP-2002: Checker for Syndicated Loans, Account Opening & POS Operations
  insertRole.run('R-3', 'EMP-2002', 'BU-SYNDICATED', 'CHECKER');
  insertRole.run('R-4', 'EMP-2002', 'BU-ACCOUNT', 'CHECKER');
  insertRole.run('R-POS-CHECKER-2002', 'EMP-2002', 'BU-POS', 'CHECKER');

  // EMP-3003: Maker for POS Operations
  insertRole.run('R-5', 'EMP-3003', 'BU-POS', 'MAKER');

  // EMP-4004: Checker for POS Operations
  insertRole.run('R-6', 'EMP-4004', 'BU-POS', 'CHECKER');

  // EMP-9009: Central Risk Admin (All BUs)
  insertRole.run('R-7', 'EMP-9009', 'BU-SYNDICATED', 'RISK_ADMIN');
  insertRole.run('R-8', 'EMP-9009', 'BU-ACCOUNT', 'RISK_ADMIN');
  insertRole.run('R-9', 'EMP-9009', 'BU-POS', 'RISK_ADMIN');

  // EMP-8008: Internal Auditor (All BUs)
  insertRole.run('R-10', 'EMP-8008', 'BU-SYNDICATED', 'AUDITOR');
  insertRole.run('R-11', 'EMP-8008', 'BU-ACCOUNT', 'AUDITOR');
  insertRole.run('R-12', 'EMP-8008', 'BU-POS', 'AUDITOR');

  // 4. Seed Seed Assessments (Approved Baseline and In-Progress Draft)
  const insertAssessment = db.prepare(`
    INSERT INTO rcsa_assessments (
      id, unit_id, cycle_year, title, workflow_source, status, 
      version_number, is_latest_approved, created_by, approved_by, approved_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Approved V1 for Syndicated Loans
  insertAssessment.run(
    'ASM-SYND-2026-V1',
    'BU-SYNDICATED',
    2026,
    'التقييم الدوري الشامل لمخاطر عمليات القروض المشتركة 2026',
    'BACKEND_GUIDED',
    'APPROVED',
    1,
    1,
    'EMP-1001',
    'EMP-2002',
    '2026-08-15 10:30:00'
  );

  // Draft V2 for Syndicated Loans
  insertAssessment.run(
    'ASM-SYND-2026-V2-DRAFT',
    'BU-SYNDICATED',
    2026,
    'تحديث تقييم القروض المشتركة في ضوء نتائج التفتيش الميداني 2026',
    'AI_AGENT',
    'INCOMPLETE_DRAFT',
    2,
    0,
    'EMP-1001',
    null,
    null
  );

  // Approved V1 for Account Opening
  insertAssessment.run(
    'ASM-ACCT-2026-V1',
    'BU-ACCOUNT',
    2026,
    'تقييم مخاطر وضوابط عمليات فتح الحسابات المصرفية 2026',
    'BACKEND_GUIDED',
    'APPROVED',
    1,
    1,
    'EMP-1001',
    'EMP-2002',
    '2026-06-20 14:15:00'
  );

  // Approved V1 for POS
  insertAssessment.run(
    'ASM-POS-2026-V1',
    'BU-POS',
    2026,
    'التقييم السنوي لمخاطر وضوابط ماكينات نقاط البيع (POS)',
    'BACKEND_GUIDED',
    'APPROVED',
    1,
    1,
    'EMP-3003',
    'EMP-4004',
    '2026-09-01 11:00:00'
  );

  // 5. Seed Controls from Bank Methodology & Workbooks
  const insertControl = db.prepare(`
    INSERT INTO controls (
      id, control_code, control_description, control_type, 
      control_method, control_frequency, control_owner, raw_efficiency_rating, rrf_value
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertControl.run(
    'CTL-01',
    'CTL-AML-SCREEN',
    'الكشف آلياً على كافة أطراف التحويل الصادر قبل الإرسال وإيقاف التحويل حال وجود شبهة حظر',
    'PREVENTIVE',
    'AUTOMATED',
    'Ad-hoc\nوفقاً والحالة',
    'النظام المصرفي الآلي',
    'ضابط رقابي فعال',
    0.95
  );

  insertControl.run(
    'CTL-02',
    'CTL-SIG-VERIFY',
    'التحقق من شخصية العميل ومطابقة التوقيع والحدود مع النظام المصرفي',
    'PREVENTIVE',
    'SEMI_AUTOMATED',
    'Daily\nيومياً',
    'السلطة الإشرافية',
    'ضابط رقابي فعال',
    0.90
  );

  insertControl.run(
    'CTL-03',
    'CTL-DUAL-SAFE',
    'حفظ كافة أصول الطلبات ومستندات الضمان بدواليب مؤمنة تحت الرقابة الثنائية',
    'PREVENTIVE',
    'MANUAL',
    'Daily\nيومياً',
    'أمناء الحفظ',
    'ضابط رقابي فعال ولكن يحتاج تطوير',
    0.75
  );

  insertControl.run(
    'CTL-04',
    'CTL-DOC-ARCHIVE-ACTION',
    'بحث مدى إمكانية ميكنة أعمال الحفظ والأرشفة الإلكترونية المركزية بقطاع العمليات',
    'CORRECTIVE',
    'MANUAL',
    'Ad-hoc\nوفقاً والحالة',
    'قطاع العمليات وتكنولوجيا المعلومات',
    'مقترح مستقبلي',
    0.30
  );

  // 6. Seed Exemplary Risks for Approved Assessment ASM-SYND-2026-V1
  const insertRisk = db.prepare(`
    INSERT INTO risks (
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
      ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?,
      ?, ?, ?,
      ?, ?
    )
  `);

  // Risk 1: التعامل مع أطراف محظور التعامل معهم
  insertRisk.run(
    'RSK-SYND-01',
    'M-RSK-001',
    'ASM-SYND-2026-V1',
    'RSK-001',
    'تنفيذ طلبات التحويلات المالية',
    'التعامل مع أحد أطراف محظور التعامل معهم بموجب قوائم الحظر المحلية والدولية',
    'L1-02',
    'L2-02-01',
    'L3-02-01-01',
    3,
    501000,
    300000,
    1,
    2,
    3,
    3,
    'M',
    3,
    3,
    'مرة كل نصف سنه',
    1002000,
    'H',
    50100,
    'L',
    0.95,
    1,
    'الضوابط الرقابية فعالة، والتكرار متوقع مرة كل نصف سنة بأثر مالي منخفض وغير مالي متوسط بعد التخفيض الرقابي الآلي'
  );

  // Risk 2: فقد المستندات وأصول الضمانات
  insertRisk.run(
    'RSK-SYND-02',
    'M-RSK-002',
    'ASM-SYND-2026-V1',
    'RSK-002',
    'حفظ أصول المستندات والضمانات',
    'فقدان أصول مستندات التحويلات أو خطابات الضمان وضعف الموقف القانوني للبنك',
    'L1-08',
    'L2-08-03',
    'L3-08-03-02',
    3,
    501000,
    599000,
    1,
    2,
    3,
    2,
    'M',
    3,
    4,
    'مرة كل ربع سنة ',
    2004000,
    'VH',
    200400,
    'M',
    0.90,
    1,
    'في ضوء ملحوظة التفتيش رقم 1 وقاعدة الأحداث 101/102، تم وضع إجراء تصحيحي لميكنة الحفظ'
  );

  // Link Risk to Controls (risk_controls junction)
  const insertRiskControl = db.prepare(`
    INSERT INTO risk_controls (id, risk_id, control_id, control_status, is_active_for_residual)
    VALUES (?, ?, ?, ?, ?)
  `);

  insertRiskControl.run('RC-01', 'RSK-SYND-01', 'CTL-01', 'IMPLEMENTED', 1);
  insertRiskControl.run('RC-02', 'RSK-SYND-01', 'CTL-02', 'IMPLEMENTED', 1);
  insertRiskControl.run('RC-03', 'RSK-SYND-02', 'CTL-03', 'IMPLEMENTED', 1);
  insertRiskControl.run('RC-04', 'RSK-SYND-02', 'CTL-04', 'PROPOSED', 0); // Proposed control: does NOT reduce current residual!

  // 7. Seed Initial Structured Audit Log Events
  const insertAudit = db.prepare(`
    INSERT INTO audit_logs (ts, user_id, user_role, unit_id, entity_type, entity_id, action, before_state, after_state, change_summary)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertAudit.run(
    '2026-08-15 09:12:00',
    'EMP-1001',
    'MAKER',
    'BU-SYNDICATED',
    'RCSA_ASSESSMENT',
    'ASM-SYND-2026-V1',
    'SUBMIT',
    JSON.stringify({ status: 'READY_DRAFT' }),
    JSON.stringify({ status: 'SUBMITTED', submitted_by: 'EMP-1001' }),
    'إرسال التقييم السنوي للقروض المشتركة للمراجعة والاعتماد'
  );

  insertAudit.run(
    '2026-08-15 10:30:00',
    'EMP-2002',
    'CHECKER',
    'BU-SYNDICATED',
    'RCSA_ASSESSMENT',
    'ASM-SYND-2026-V1',
    'APPROVE',
    JSON.stringify({ status: 'SUBMITTED' }),
    JSON.stringify({ status: 'APPROVED', version_number: 1, approved_by: 'EMP-2002' }),
    'اعتماد التقييم السنوي كإصدار رسمي معتمد رقم 1 بعد المراجعة المستقلة'
  );

  insertAudit.run(
    '2026-10-01 11:20:00',
    'EMP-1001',
    'MAKER',
    'BU-SYNDICATED',
    'RCSA_ASSESSMENT',
    'ASM-SYND-2026-V2-DRAFT',
    'CREATE',
    null,
    JSON.stringify({ status: 'INCOMPLETE_DRAFT', version_number: 2, title: 'تحديث تقييم القروض المشتركة في ضوء نتائج التفتيش' }),
    'إنشاء مسودة تحديث جديدة رقم 2 لإدراج خطط العمل وملاحظات التفتيش الميداني'
  );

  console.log('[Database] Seed completed successfully.');
}
