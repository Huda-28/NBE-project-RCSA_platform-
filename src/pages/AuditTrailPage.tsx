import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { AuditEvent } from '../types/index.js';
import { formatAuditActionAr, formatArabicDateTime } from '../utils/dateFormat.js';
import { 
  History, 
  Search, 
  Filter, 
  ShieldAlert, 
  Clock, 
  User as UserIcon, 
  Building2, 
  FileCode2, 
  X,
  Layers
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
  const [unitFilter, setUnitFilter] = useState(initialUnitId || 'ALL');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch('/api/audit-trail?limit=200', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => setLogs(data.audit_logs || []))
      .catch(err => console.error(err))
      .finally(() => setIsLoading(false));
  }, [token]);

  const filteredLogs = logs.filter(l => {
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
    <div className="space-y-6 animate-in fade-in duration-300 font-['Cairo'] relative">
      {/* Header */}
      <div className="bg-[#ECEBE8] p-5 rounded-2xl border border-[#C6C4C1] shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">سجل التعديلات</h2>
          <p className="text-xs text-slate-600 mt-1">
            تاريخ التعديلات والحسابات وقرارات المراجعة والاعتماد.
          </p>
        </div>

        <div className="px-3 py-1 rounded-xl bg-[#E2E1DE] border border-[#C6C4C1] text-xs font-mono font-bold text-slate-800">
          إجمالي السجلات المعروضة: {filteredLogs.length} / {logs.length}
        </div>
      </div>

      {/* Mandatory Banking Audit Disclaimer Banner */}
      <div className="bg-[#EAE5D9] border-r-4 border-[#F79C1E] border border-[#D4C5A9] p-4 rounded-xl text-amber-950 text-xs flex items-start gap-3 shadow-sm">
        <ShieldAlert className="w-5 h-5 text-[#F79C1E] shrink-0 mt-0.5" />
        <div className="space-y-1">
          <strong className="text-sm font-bold block">إفصاح الحوكمة المصرفية وقواعد التخزين (Regulatory Storage Notice):</strong>
          <p className="leading-relaxed">
            يُوثق النظام رسمياً أن قاعدة بيانات SQLite المحلية تُشكل <strong>وسيط تخزين تطبيقي محلي (Application-Level Storage)</strong> ذا اتساق تعاملي لتشغيل النظام في بيئة التطوير والاختبار المحلي، 
            <strong>ولا تُعد بذاتها وسيطاً مصرفياً غير قابل للتلاعب (Tamper-proof Banking Grade)</strong> مثل أقراص WORM المعتمدة أو HSM أو السجلات المشفرة مركزياً المعمول بها في الإنتاج البنكي الحقيقي.
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-[#ECEBE8] p-4 rounded-xl border border-[#C6C4C1] shadow-sm flex flex-col lg:flex-row items-center justify-between gap-3">
        <div className="relative w-full lg:w-80">
          <Search className="w-4 h-4 text-slate-500 absolute right-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث بالموظف، الإجراء، المخاطرة، أو الملخص..."
            className="w-full pr-9 pl-3 py-1.5 text-xs bg-[#F4F3F0] border border-[#B8B6B2] rounded-xl text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#006547]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-500" />
            <span className="text-xs text-slate-700 font-bold">نوع الإجراء:</span>
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="px-3 py-1.5 text-xs font-bold border border-[#B8B6B2] rounded-lg bg-[#F4F3F0] text-slate-900 focus:ring-1 focus:ring-[#006547]"
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
      <div className="bg-[#ECEBE8] rounded-2xl border border-[#C6C4C1] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-[#09331F] text-white">
              <tr>
                <th className="p-3.5 font-bold">#</th>
                <th className="p-3.5 font-bold">التاريخ والوقت</th>
                <th className="p-3.5 font-bold">الموظف (User ID)</th>
                <th className="p-3.5 font-bold">الدور</th>
                <th className="p-3.5 font-bold">الوحدة التنظيمية</th>
                <th className="p-3.5 font-bold">نوع الكيان</th>
                <th className="p-3.5 font-bold">الإجراء (عربي / تقني)</th>
                <th className="p-3.5 font-bold">ملخص العملية</th>
                <th className="p-3.5 font-bold text-center">الفروق (Diff)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#CECCC9]">
              {filteredLogs.map((log) => {
                const meta = log.action_meta || formatAuditActionAr(log.action);
                return (
                  <tr key={log.id} className="hover:bg-[#E2E1DE] transition-colors">
                    <td className="p-3.5 font-mono text-slate-600">{log.id}</td>
                    <td className="p-3.5 text-slate-800 whitespace-nowrap">
                      <div className="font-bold text-[11px]">{log.ts_ar || formatArabicDateTime(log.ts)}</div>
                      <div className="font-mono text-[10px] text-slate-500">{log.ts}</div>
                    </td>
                    <td className="p-3.5 font-bold text-slate-900 font-mono">{log.user_id}</td>
                    <td className="p-3.5">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#DFDEDB] border border-[#C6C4C1] text-slate-800">
                        {log.user_role}
                      </span>
                    </td>
                    <td className="p-3.5 text-slate-700">{log.unit_name_ar || '-'}</td>
                    <td className="p-3.5 font-mono text-slate-600">{log.entity_type}</td>
                    <td className="p-3.5">
                      <div className="font-bold text-slate-900 text-[11px]">{meta.label_ar}</div>
                      <span className={`inline-block mt-0.5 px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                        log.action === 'APPROVE' ? 'bg-emerald-100 text-emerald-800' :
                        log.action === 'REJECT' || log.action === 'IMMUTABLE_EDIT_BLOCKED' ? 'bg-rose-100 text-rose-800' :
                        log.action.startsWith('HITL_') ? 'bg-amber-100 text-amber-900' :
                        log.action === 'LOGIN' ? 'bg-blue-100 text-blue-800' : 'bg-[#DFDEDB] text-slate-800'
                      }`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="p-3.5 text-slate-800 max-w-md truncate" title={log.change_summary}>
                      {log.change_summary}
                    </td>
                    <td className="p-3.5 text-center">
                      {(log.before_state || log.after_state) ? (
                        <button
                          onClick={() => setSelectedLog(log)}
                          className="px-2.5 py-1 rounded bg-[#E2E6E3] hover:bg-[#006547] text-[#09331F] hover:text-white border border-[#006547]/35 text-[11px] font-bold transition-colors cursor-pointer"
                        >
                          عرض الفروق
                        </button>
                      ) : (
                        <span className="text-slate-500">-</span>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl bg-[#EAE9E6] rounded-2xl shadow-2xl border border-[#B8B6B2] overflow-hidden text-right">
            <div className="bg-[#09331F] text-white p-4 border-b-2 border-[#F79C1E] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileCode2 className="w-5 h-5 text-[#F79C1E]" />
                <h3 className="text-sm font-bold">
                  الفروق المهيكلة للعملية #{selectedLog.id} — {(selectedLog.action_meta || formatAuditActionAr(selectedLog.action)).label_ar} ({selectedLog.action})
                </h3>
              </div>
              <button 
                onClick={() => setSelectedLog(null)}
                className="p-1 rounded bg-white/10 hover:bg-white/20 text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="text-xs text-slate-800 bg-[#E1E0DD] p-2.5 rounded-lg border border-[#C6C4C1]">
                <strong>الملخص:</strong> {selectedLog.change_summary}
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs font-mono">
                {/* Before State */}
                <div className="space-y-1">
                  <div className="font-bold text-rose-800 flex items-center gap-1 font-['Cairo']">
                    <span>الحالة السابقة (Before):</span>
                  </div>
                  <pre className="p-3 rounded-xl bg-rose-100/75 border border-rose-300 text-[11px] text-rose-950 overflow-x-auto h-48">
                    {selectedLog.before_state ? JSON.stringify(selectedLog.before_state, null, 2) : '(لا توجد حالة سابقة - إنشاء جديد)'}
                  </pre>
                </div>

                {/* After State */}
                <div className="space-y-1">
                  <div className="font-bold text-emerald-800 flex items-center gap-1 font-['Cairo']">
                    <span>الحالة اللاحقة (After):</span>
                  </div>
                  <pre className="p-3 rounded-xl bg-emerald-100/75 border border-emerald-300 text-[11px] text-emerald-950 overflow-x-auto h-48">
                    {selectedLog.after_state ? JSON.stringify(selectedLog.after_state, null, 2) : '(تم الحذف)'}
                  </pre>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-[#C6C4C1] bg-[#E1E0DD] flex justify-end">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-4 py-1.5 bg-[#CECCC9] hover:bg-[#B8B6B2] text-slate-900 text-xs font-bold rounded-xl"
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

