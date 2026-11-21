import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { formatAuditActionAr, formatArabicDateTime } from '../utils/dateFormat.js';
import {
  Search,
  Filter,
  ShieldAlert,
  FileCode2,
  X,
} from 'lucide-react';

interface AuditTrailPageProps {
  initialUnitId?: string;
}

export const AuditTrailPage: React.FC<AuditTrailPageProps> = ({ initialUnitId }) => {
  const { token } = useAuth();
  const [logs, setLogs] = useState<any[]>([]);
  const [selectedLog, setSelectedLog] = useState<any | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState('ALL');
  const [unitFilter] = useState(initialUnitId || 'ALL');
  const [, setIsLoading] = useState(true);

  useEffect(() => {
    fetch('/api/audit-trail?limit=200', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => setLogs(data.audit_logs || []))
      .catch((err) => console.error(err))
      .finally(() => setIsLoading(false));
  }, [token]);

  const filteredLogs = logs.filter((l) => {
    const meta = l.action_meta || formatAuditActionAr(l.action);
    const matchesSearch =
      l.user_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.change_summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.entity_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
      meta.label_ar.includes(searchQuery);

    const matchesAction = actionFilter === 'ALL' || l.action === actionFilter;
    const matchesUnit = unitFilter === 'ALL' || l.unit_id === unitFilter;

    return matchesSearch && matchesAction && matchesUnit;
  });

  const distinctActions = Array.from(new Set(logs.map((l) => l.action)));

  return (
    <div className="space-y-5 sm:space-y-6 animate-in fade-in duration-300 font-['Cairo'] relative">
      {/* Header */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-[#DCDAD5] shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg sm:text-xl font-extrabold text-[#09331F]">سجل التعديلات</h2>
          <p className="text-xs text-slate-600 mt-1">
            تاريخ التعديلات والحسابات وقرارات المراجعة والاعتماد.
          </p>
        </div>

        <div className="text-xs font-mono font-bold text-[#09331F] tabular-nums">
          إجمالي السجلات المعروضة: {filteredLogs.length} / {logs.length}
        </div>
      </div>

      {/* Mandatory Banking Audit Disclaimer Banner */}
      <div className="bg-amber-50/80 border border-amber-300 p-4 rounded-2xl text-amber-950 text-xs flex items-start gap-3 shadow-xs">
        <ShieldAlert className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <strong className="text-sm font-bold block">
            إفصاح الحوكمة المصرفية وقواعد التخزين (Regulatory Storage Notice):
          </strong>
          <p className="leading-relaxed">
            يُوثق النظام رسمياً أن قاعدة بيانات SQLite المحلية تُشكل{' '}
            <strong>وسيط تخزين تطبيقي محلي (Application-Level Storage)</strong> ذا اتساق تعاملي لتشغيل النظام في بيئة التطوير والاختبار المحلي،{' '}
            <strong>ولا تُعد بذاتها وسيطاً مصرفياً غير قابل للتلاعب (Tamper-proof Banking Grade)</strong> مثل أقراص WORM المعتمدة أو HSM أو السجلات المشفرة مركزياً المعمول بها في الإنتاج البنكي الحقيقي.
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-[#DCDAD5] shadow-xs flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        <div className="relative w-full lg:w-80">
          <Search className="w-4 h-4 text-slate-500 absolute right-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث بالموظف، الإجراء، المخاطرة، أو الملخص..."
            className="w-full min-h-10 pr-9 pl-3 py-2 text-xs bg-[#F8F8F6] border border-[#DCDAD5] rounded-xl text-slate-900 placeholder:text-slate-500 focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#006547]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Filter className="w-4 h-4 text-slate-500 shrink-0" />
            <span className="text-xs text-slate-700 font-bold shrink-0">نوع الإجراء:</span>
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="w-full sm:w-auto min-h-10 px-3 py-1.5 text-xs font-bold border border-[#DCDAD5] rounded-xl bg-[#F8F8F6] text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#006547]"
            >
              <option value="ALL">كافة الإجراءات الرقابية والتدقيقية</option>
              {[
                'HITL_RISK_RECALCULATE',
                'HITL_SAVE_DRAFT',
                'HITL_SUGGESTION_DECISION',
                'HITL_RISK_REVIEW_STATUS',
                'SUBMIT_FOR_REVIEW',
                'APPROVE',
                'REJECT',
                'CREATE_DRAFT_FROM_APPROVED',
                'CREATE_MANUAL_DRAFT',
                'CREATE_GUIDED_DRAFT',
                'UPLOAD_SUPPORTING_DOCUMENT',
                'IMMUTABLE_EDIT_BLOCKED',
                'CREATE',
                'LOGIN',
                'RESET_PASSWORD',
                ...distinctActions,
              ]
                .filter((v, idx, arr) => arr.indexOf(v) === idx)
                .map((act) => {
                  const meta = formatAuditActionAr(act);
                  return (
                    <option key={act} value={act}>
                      {meta.label_ar} ({act})
                    </option>
                  );
                })}
            </select>
          </div>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="bg-white rounded-2xl border border-[#DCDAD5] shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-[#09331F] text-white">
              <tr>
                <th className="p-3.5 font-bold whitespace-nowrap">#</th>
                <th className="p-3.5 font-bold whitespace-nowrap">التاريخ والوقت</th>
                <th className="p-3.5 font-bold whitespace-nowrap">الموظف (User ID)</th>
                <th className="p-3.5 font-bold whitespace-nowrap">الدور</th>
                <th className="p-3.5 font-bold whitespace-nowrap">الوحدة التنظيمية</th>
                <th className="p-3.5 font-bold whitespace-nowrap">نوع الكيان</th>
                <th className="p-3.5 font-bold whitespace-nowrap">الإجراء (عربي / تقني)</th>
                <th className="p-3.5 font-bold whitespace-nowrap">ملخص العملية</th>
                <th className="p-3.5 font-bold text-center whitespace-nowrap">الفروق (Diff)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E3DE]">
              {filteredLogs.map((log) => {
                const meta = log.action_meta || formatAuditActionAr(log.action);
                return (
                  <tr key={log.id} className="hover:bg-[#F8F8F6] transition-colors">
                    <td className="p-3.5 font-mono text-slate-600 tabular-nums">{log.id}</td>
                    <td className="p-3.5 text-slate-800 whitespace-nowrap tabular-nums">
                      <div className="font-bold text-[11px]">{log.ts_ar || formatArabicDateTime(log.ts)}</div>
                      <div className="font-mono text-[10px] text-slate-500">{log.ts}</div>
                    </td>
                    <td className="p-3.5 font-bold text-slate-900 font-mono tabular-nums whitespace-nowrap">
                      {log.user_id}
                    </td>
                    <td className="p-3.5 whitespace-nowrap">
                      <span className="text-[11px] font-bold text-[#09331F] font-mono">
                        {log.user_role}
                      </span>
                    </td>
                    <td className="p-3.5 text-slate-700 whitespace-nowrap">{log.unit_name_ar || '-'}</td>
                    <td className="p-3.5 font-mono text-slate-600 whitespace-nowrap">{log.entity_type}</td>
                    <td className="p-3.5 whitespace-nowrap">
                      <div className="font-bold text-slate-900 text-[11px]">{meta.label_ar}</div>
                      <span
                        className={`inline-block mt-0.5 text-[10px] font-mono font-bold ${
                          log.action === 'APPROVE'
                            ? 'text-[#006547]'
                            : log.action === 'REJECT' || log.action === 'IMMUTABLE_EDIT_BLOCKED'
                              ? 'text-rose-700'
                              : log.action.startsWith('HITL_')
                                ? 'text-amber-800'
                                : log.action === 'LOGIN'
                                  ? 'text-sky-700'
                                  : 'text-slate-600'
                        }`}
                      >
                        {log.action}
                      </span>
                    </td>
                    <td className="p-3.5 text-slate-800 max-w-md truncate" title={log.change_summary}>
                      {log.change_summary}
                    </td>
                    <td className="p-3.5 text-center whitespace-nowrap">
                      {log.before_state || log.after_state ? (
                        <button
                          type="button"
                          onClick={() => setSelectedLog(log)}
                          className="min-h-8 px-2.5 py-1 rounded-lg bg-[#F8F8F6] hover:bg-[#006547] text-[#09331F] hover:text-white border border-[#DCDAD5] text-[11px] font-bold transition-colors cursor-pointer"
                        >
                          عرض الفروق
                        </button>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Structured Field-Level Diff Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-3.5 sm:p-4">
          <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-[#DCDAD5] overflow-hidden text-right">
            <div className="bg-[#09331F] text-white p-4 border-b-2 border-[#F79C1E] flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <FileCode2 className="w-5 h-5 text-[#F79C1E] shrink-0" />
                <h3 className="text-xs sm:text-sm font-bold truncate tabular-nums">
                  الفروق المهيكلة للعملية #{selectedLog.id} —{' '}
                  {(selectedLog.action_meta || formatAuditActionAr(selectedLog.action)).label_ar} (
                  {selectedLog.action})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center shrink-0 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 sm:p-5 space-y-4 max-h-[75vh] overflow-y-auto">
              <div className="text-xs text-slate-800 bg-[#F8F8F6] p-3 rounded-xl border border-[#E5E3DE]">
                <strong>الملخص:</strong> {selectedLog.change_summary}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-mono">
                {/* Before State */}
                <div className="space-y-1.5">
                  <div className="font-bold text-rose-800 flex items-center gap-1 font-['Cairo']">
                    <span>الحالة السابقة (Before):</span>
                  </div>
                  <pre className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-[11px] text-rose-950 overflow-x-auto h-48">
                    {selectedLog.before_state
                      ? JSON.stringify(selectedLog.before_state, null, 2)
                      : '(لا توجد حالة سابقة - إنشاء جديد)'}
                  </pre>
                </div>

                {/* After State */}
                <div className="space-y-1.5">
                  <div className="font-bold text-[#006547] flex items-center gap-1 font-['Cairo']">
                    <span>الحالة اللاحقة (After):</span>
                  </div>
                  <pre className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-950 overflow-x-auto h-48">
                    {selectedLog.after_state
                      ? JSON.stringify(selectedLog.after_state, null, 2)
                      : '(تم الحذف)'}
                  </pre>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-[#E5E3DE] bg-[#F8F8F6] flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="min-h-9 px-4 py-1.5 bg-white hover:bg-[#EFECE6] text-slate-900 border border-[#DCDAD5] text-xs font-bold rounded-xl cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
