import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { PageId } from '../components/Sidebar.js';
import { AppNavigationState } from '../App.js';
import { formatWorkflowStatusAr } from '../utils/dateFormat.js';
import { 
  FileCheck2, 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  Clock, 
  Send, 
  UserCheck, 
  ShieldAlert,
  Building2,
  TableProperties,
  Calendar,
  Lock
} from 'lucide-react';

interface ReviewsPageProps {
  onNavigate?: (next: Partial<AppNavigationState> & { page: PageId }) => void;
}

export const ReviewsPage: React.FC<ReviewsPageProps> = ({ onNavigate }) => {
  const { user, token } = useAuth();
  const [assessments, setAssessments] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'IN_REVIEW' | 'DRAFT' | 'RETURNED' | 'APPROVED'>('ALL');
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchAssessments = () => {
    fetch('/api/assessments', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => setAssessments(data.assessments || []))
      .catch(err => console.error(err))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    fetchAssessments();
  }, [token]);

  const handleApprove = async (id: string) => {
    setActionMessage(null);
    try {
      const res = await fetch(`/api/assessments/${id}/approve`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}` 
        }
      });
      const data = await res.json();
      if (!res.ok) {
        setActionMessage({ type: 'error', text: data.error || 'فشل اعتماد التقييم.' });
      } else {
        setActionMessage({ type: 'success', text: data.message || 'تم الاعتماد الرسمي وتجميد التقييم.' });
        fetchAssessments();
      }
    } catch {
      setActionMessage({ type: 'error', text: 'خطأ في الاتصال بالخادم.' });
    }
  };

  const handleReject = async (id: string) => {
    if (!rejectionReason.trim()) {
      setActionMessage({ type: 'error', text: 'سبب الرفض إلزامي رقابياً لتوجيه معد التقييم (Maker).' });
      return;
    }

    try {
      const res = await fetch(`/api/assessments/${id}/reject`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ rejection_reason: rejectionReason.trim() })
      });
      const data = await res.json();
      if (!res.ok) {
        setActionMessage({ type: 'error', text: data.error || 'فشل رفض التقييم.' });
      } else {
        setActionMessage({ type: 'success', text: data.message || 'تم رفض التقييم وإعادته للمراجعة.' });
        setRejectingId(null);
        setRejectionReason('');
        fetchAssessments();
      }
    } catch {
      setActionMessage({ type: 'error', text: 'خطأ في الاتصال بالخادم.' });
    }
  };

  const handleSubmitForReview = async (id: string) => {
    setActionMessage(null);
    try {
      const res = await fetch(`/api/assessments/${id}/submit`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}` 
        }
      });
      const data = await res.json();
      if (!res.ok) {
        setActionMessage({ type: 'error', text: data.error || 'فشل إرسال التقييم للمراجعة.' });
      } else {
        setActionMessage({ type: 'success', text: data.message || 'تم إرسال التقييم للمراجعة بنجاح.' });
        fetchAssessments();
      }
    } catch {
      setActionMessage({ type: 'error', text: 'خطأ في الاتصال بالخادم.' });
    }
  };

  const filteredAssessments = assessments.filter((a) => {
    const wf = a.workflow_status || '';
    if (statusFilter === 'ALL') return true;
    if (statusFilter === 'IN_REVIEW') return wf === 'IN_REVIEW' || a.status === 'SUBMITTED';
    if (statusFilter === 'APPROVED') return wf === 'APPROVED' || a.status === 'APPROVED';
    if (statusFilter === 'RETURNED') return wf === 'RETURNED_FOR_CHANGES' || a.status === 'REJECTED';
    if (statusFilter === 'DRAFT') return (wf === 'DRAFT' || a.status === 'INCOMPLETE_DRAFT' || a.status === 'READY_DRAFT') && wf !== 'RETURNED_FOR_CHANGES';
    return true;
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-300 font-['Cairo']">
      {/* Header */}
      <div className="bg-[#ECEBE8] p-5 rounded-2xl border border-[#C6C4C1] shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">المراجعة والاعتماد وحوكمة التقييمات (Maker-Checker)</h2>
          <p className="text-xs text-slate-600 mt-1">
            إنفاذ معايير الرقابة الثنائية: الفصل التام بين منشئ المسودة (Maker) والمراجع المستقل (Checker) مع فحص كامل للمخاطر والضوابط قبل الاعتماد.
          </p>
        </div>

        {/* Workflow Status Queue Tabs */}
        <div className="flex flex-wrap bg-[#DFDEDB] border border-[#C6C4C1] p-1 rounded-xl text-xs font-bold gap-1">
          {[
            { id: 'ALL', label: `كافة التقييمات (${assessments.length})` },
            { id: 'IN_REVIEW', label: 'بانتظار اعتماد المراجع' },
            { id: 'DRAFT', label: 'مسودات قيد الإعداد' },
            { id: 'RETURNED', label: 'معادة للتصحيح' },
            { id: 'APPROVED', label: 'معتمدة ومجمدة' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id as any)}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                statusFilter === tab.id ? 'bg-[#006547] text-white shadow-sm' : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Action Notification Banner */}
      {actionMessage && (
        <div className={`p-4 rounded-xl text-xs flex items-center gap-2.5 animate-in slide-in-from-top-2 ${
          actionMessage.type === 'success' 
            ? 'bg-emerald-100/80 border border-emerald-300 text-emerald-950'
            : 'bg-rose-100/80 border border-rose-300 text-rose-950'
        }`}>
          {actionMessage.type === 'success' ? (
            <CheckCircle className="w-5 h-5 text-emerald-700 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-700 shrink-0" />
          )}
          <span className="font-semibold">{actionMessage.text}</span>
        </div>
      )}

      {/* Rejection Modal / Prompt */}
      {rejectingId && (
        <div className="bg-[#EAE5D9] border border-amber-400 p-4 rounded-xl text-amber-950 space-y-3">
          <div className="font-bold text-xs flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-800" />
            <span>تسجيل أسباب الرفض وإعادة التقييم للتصحيح:</span>
          </div>
          <textarea
            rows={2}
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            placeholder="اكتب الملاحظات الرقابية الإلزامية التي تستوجب التصحيح قبل الموافقة..."
            className="w-full p-2.5 text-xs bg-[#F4F3F0] border border-[#B8B6B2] rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#006547]"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => { setRejectingId(null); setRejectionReason(''); }}
              className="px-3 py-1.5 text-xs rounded-lg border border-[#B8B6B2] bg-[#E2E1DE] text-slate-800 hover:bg-[#ECEBE8]"
            >
              إلغاء
            </button>
            <button
              onClick={() => handleReject(rejectingId)}
              className="px-3 py-1.5 text-xs rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold"
            >
              تأكيد الرفض والإرجاع
            </button>
          </div>
        </div>
      )}

      {/* Assessments List */}
      <div className="space-y-4">
        {filteredAssessments.map((a) => {
          const isSubmitted = a.workflow_status === 'IN_REVIEW' || a.status === 'SUBMITTED';
          const isApproved = a.workflow_status === 'APPROVED' || a.status === 'APPROVED';
          const isReturned = a.workflow_status === 'RETURNED_FOR_CHANGES' || a.status === 'REJECTED';
          const isDraft = !isSubmitted && !isApproved;
          const ts = a.timestamps || {};

          return (
            <div key={a.id} className="bg-[#ECEBE8] rounded-2xl border border-[#C6C4C1] p-5 shadow-sm space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-[#CECCC9]">
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 ${
                    isApproved ? 'bg-emerald-100 text-emerald-800 border border-emerald-300/60' : isSubmitted ? 'bg-amber-100 text-amber-800 border border-amber-300/60' : 'bg-[#DFDEDB] text-slate-800 border border-[#C6C4C1]'
                  }`}>
                    {isApproved ? <Lock className="w-4 h-4" /> : <Calendar className="w-4 h-4 text-[#006547]" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-bold text-slate-900">
                        {a.clean_title_ar || a.title_ar || a.title}
                      </h3>
                      <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold ${
                        isApproved
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : isSubmitted
                            ? 'bg-amber-100 text-amber-800 border border-amber-300'
                            : isReturned
                              ? 'bg-rose-100 text-rose-800 border border-rose-300'
                              : 'bg-[#DFDEDB] text-slate-700 border border-[#C6C4C1]'
                      }`}>
                        {formatWorkflowStatusAr(a.workflow_status, a.status)}
                      </span>
                      <span className="text-xs font-bold text-[#09331F] bg-[#E2E1DE] px-2.5 py-0.5 rounded-lg border border-[#B8B6B2]">
                        {ts.primary_date_badge_ar}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-600 flex flex-wrap items-center gap-2 mt-1">
                      <span>الإدارة: {a.unit_name_ar}</span>
                      <span>•</span>
                      <span>أنشئ بواسطة: {a.creator_name || a.created_by}</span>
                      <span>•</span>
                      <span>{ts.created_at_ar}</span>
                    </div>
                  </div>
                </div>

                {/* Workflow & Inspection Action Buttons */}
                <div className="flex flex-wrap items-center gap-2 self-end lg:self-auto">
                  <button
                    type="button"
                    onClick={() =>
                      onNavigate?.({
                        page: 'rcsa-table',
                        unitId: a.unit_id,
                        assessmentId: a.id,
                      })
                    }
                    className="px-3.5 py-1.5 rounded-xl bg-[#E2E1DE] hover:bg-[#D5D3CF] text-[#09331F] border border-[#B8B6B2] text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <TableProperties className="w-3.5 h-3.5 text-[#006547]" />
                    <span>فحص ومراجعة تفاصيل المخاطر والضوابط</span>
                  </button>

                  {/* Maker Submit Action */}
                  {isDraft && (
                    <button
                      onClick={() => handleSubmitForReview(a.id)}
                      className="px-3.5 py-1.5 rounded-xl bg-sky-700 hover:bg-sky-800 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>إرسال للمراجعة (Maker)</span>
                    </button>
                  )}

                  {/* Checker Approval & Rejection Actions */}
                  {isSubmitted && (
                    <>
                      <button
                        onClick={() => setRejectingId(a.id)}
                        className="px-3 py-1.5 rounded-xl bg-rose-100/80 hover:bg-rose-200/80 text-rose-800 border border-rose-300 text-xs font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>إعادة للتعديل</span>
                      </button>
                      <button
                        onClick={() => handleApprove(a.id)}
                        className="px-3.5 py-1.5 rounded-xl bg-[#006547] hover:bg-[#09331F] text-white text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer"
                      >
                        <UserCheck className="w-3.5 h-3.5 text-[#F79C1E]" />
                        <span>اعتماد رسمي (Checker)</span>
                      </button>
                    </>
                  )}

                  {isApproved && (
                    <div className="text-xs text-emerald-900 font-bold flex items-center gap-1 bg-[#E2E6E3] px-3 py-1.5 rounded-xl border border-[#006547]/35">
                      <CheckCircle className="w-4 h-4 text-[#006547]" />
                      <span>معتمد بواسطة: {a.approver_name || a.approved_by}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Assessment Sub-Details */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs bg-[#E2E1DE] p-3 rounded-xl border border-[#C6C4C1]">
                <div>
                  <span className="text-slate-600 block text-[10px]">تاريخ آخر نشاط مسجل:</span>
                  <span className="font-semibold text-slate-900">{ts.updated_at_ar}</span>
                </div>
                <div>
                  <span className="text-slate-600 block text-[10px]">عدد المخاطر المدرجة:</span>
                  <span className="font-mono font-bold text-slate-900">{a.risks_count || 0} خطر</span>
                </div>
                <div>
                  <span className="text-slate-600 block text-[10px]">حالة الاعتماد والحفظ:</span>
                  <span className="font-semibold text-slate-900">
                    {isApproved ? `معتمد رسمياً (${ts.approved_at_ar})` : formatWorkflowStatusAr(a.workflow_status, a.status)}
                  </span>
                </div>
              </div>

              {(a.return_reason || a.rejection_reason) && (
                <div className="p-3 bg-rose-100/80 border border-rose-300 rounded-xl text-xs text-rose-950">
                  <div className="font-bold text-[11px] mb-1">ملاحظات المراجع المستقل (أسباب الإرجاع للتصحيح):</div>
                  <p>{a.return_reason || a.rejection_reason}</p>
                </div>
              )}
            </div>
          );
        })}

        {filteredAssessments.length === 0 && (
          <div className="p-8 text-center text-slate-600 bg-[#ECEBE8] rounded-2xl border border-[#C6C4C1]">
            لا توجد تقييمات مسجلة ضمن قائمة التصفية المختارة حالياً.
          </div>
        )}
      </div>
    </div>
  );
};

