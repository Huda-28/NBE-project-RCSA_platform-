import { db } from './db.js';

export interface CreateAuditEntryParams {
  userId: string;
  userRole: string;
  unitId?: string;
  entityType: string;
  entityId: string;
  action: string;
  beforeState?: Record<string, any> | null;
  afterState?: Record<string, any> | null;
  changeSummary: string;
}

/**
 * Structured, append-only application audit logger.
 * 
 * BANKING AUDIT DISCLAIMER / وثيقة الحوكمة المصرفية:
 * هذا السجل يمثل طبقة تدقيق تطبيقية محلية (Application-Level Audit Trail) ذات اتساق تعاملي.
 * يُوثق النظام رسمياً أن قاعدة بيانات SQLite المحلية لا تُعد بذاتها وسيط تخزين مصرفي غير قابل للتلاعب 
 * (Tamper-proof Banking Grade) مثل أقراص WORM المعتمدة أو HSM أو السجلات المشفرة مركزياً في بيئة الإنتاج البنكي.
 */
export function logAuditEvent(params: CreateAuditEntryParams): number {
  const stmt = db.prepare(`
    INSERT INTO audit_logs (
      ts, user_id, user_role, unit_id, entity_type, entity_id, action, before_state, after_state, change_summary
    ) VALUES (
      datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
  `);

  const result = stmt.run(
    params.userId,
    params.userRole,
    params.unitId || null,
    params.entityType,
    params.entityId,
    params.action,
    params.beforeState ? JSON.stringify(params.beforeState) : null,
    params.afterState ? JSON.stringify(params.afterState) : null,
    params.changeSummary
  );

  return Number(result.lastInsertRowid);
}

export function queryAuditLogs(filters: {
  unitId?: string;
  entityType?: string;
  userId?: string;
  limit?: number;
}) {
  let sql = `
    SELECT 
      a.id, a.ts, a.user_id, a.user_role, a.unit_id, b.name_ar as unit_name_ar,
      a.entity_type, a.entity_id, a.action, a.before_state, a.after_state, a.change_summary
    FROM audit_logs a
    LEFT JOIN business_units b ON a.unit_id = b.id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (filters.unitId) {
    sql += ` AND a.unit_id = ?`;
    params.push(filters.unitId);
  }
  if (filters.entityType) {
    sql += ` AND a.entity_type = ?`;
    params.push(filters.entityType);
  }
  if (filters.userId) {
    sql += ` AND a.user_id = ?`;
    params.push(filters.userId);
  }

  sql += ` ORDER BY a.id DESC LIMIT ?`;
  params.push(filters.limit || 100);

  const rows = db.prepare(sql).all(...params) as any[];

  return rows.map(r => ({
    ...r,
    before_state: r.before_state ? JSON.parse(r.before_state) : null,
    after_state: r.after_state ? JSON.parse(r.after_state) : null,
  }));
}
