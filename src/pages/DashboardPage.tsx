import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { DashboardSummary } from '../types/index.js';
import { PageId } from '../components/Sidebar.js';
import { AppNavigationState } from '../App.js';
import { formatArabicDateTime, formatWorkflowStatusAr } from '../utils/dateFormat.js';
import { 
  Building2, 
  ShieldCheck, 
  AlertTriangle, 
  Clock, 
  FileEdit, 
  CheckCircle2, 
  ArrowUpRight, 
  Info,
  Calendar,
  User as UserIcon,
  Sparkles,
  History,
  TableProperties,
  FilePlus2
} from 'lucide-react';

interface DashboardPageProps {
  onNavigate?: (next: Partial<AppNavigationState> & { page: PageId }) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({ onNavigate }) => {
  const { token, user } = useAuth();
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedBU, setSelectedBU] = useState<string | null>(null);

  useEffect(() => {
    if (!token || user?.must_reset_password) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    fetch('/api/dashboard', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => (res.ok ? res.json() : null))
      .then(d => {
        if (d && Array.isArray(d.bu_summaries)) {
          setData(d);
          if (d.bu_summaries.length > 0) {
            setSelectedBU(d.bu_summaries[0].unit.id);
          }
        }
      })
      .catch(err => console.error('Failed to load dashboard data:', err))
      .finally(() => setIsLoading(false));
  }, [token, user?.must_reset_password]);

  if (isLoading) {
    return (
      <div className="p-8 text-center text-slate-500 font-['Cairo']">
        <div className="w-8 h-8 border-4 border-[#006547] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <div>جارٍ تحميل مؤشرات لوحة القيادة المركزية للمخاطر التشغيلية...</div>
      </div>
    );
  }

  if (user?.must_reset_password) {
    return (
      <div className="p-8 text-center text-slate-600 font-['Cairo']">
        يرجى إتمام تعيين كلمة المرور الجديدة لتفعيل جلسة العمل المصرفية.
      </div>
    );
  }

  if (!data || !Array.isArray(data.bu_summaries) || data.bu_summaries.length === 0) {
    return <div className="p-8 text-center text-rose-600">تعذر تحميل بيانات لوحة القيادة.</div>;
  }

  const selectedSummary = (data.bu_summaries.find(b => b.unit.id === selectedBU) || data.bu_summaries[0]) as any;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#ECEBE8] p-5 rounded-2xl border border-[#C6C4C1] shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900 font-['Cairo']">
              لوحة المعلومات
            </h2>
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold">
              بيانات حية وموثقة
            </span>
          </div>
          <p className="text-xs text-slate-600 mt-1">
            المخاطر والتقييمات المعتمدة والمسودات والمراجعات المعلقة.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-[#E2E1DE] text-[#09331F] px-3 py-1.5 rounded-xl border border-[#B8B6B2] text-xs font-semibold">
          <Calendar className="w-4 h-4 text-[#006547]" />
          <span>دورة تقييم عام: 2026</span>
        </div>
      </div>

      {/* Top Executive KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-[#ECEBE8] p-4 rounded-2xl border border-[#C6C4C1] shadow-sm">
          <div className="text-[11px] font-bold text-slate-600 flex items-center justify-between">
            <span>إجمالي المخاطر المعتمدة</span>
            <ShieldCheck className="w-4 h-4 text-emerald-700" />
          </div>
          <div className="text-2xl font-black text-slate-900 mt-2 font-mono">
            {data.overall_kpis.total_approved_risks}
          </div>
          <div className="text-[10px] text-emerald-700 font-semibold mt-1">
            نسخ رسمية معتمدة ومجمدة
          </div>
        </div>

        <div className="bg-[#ECEBE8] p-4 rounded-2xl border border-[#C6C4C1] shadow-sm">
          <div className="text-[11px] font-bold text-slate-600 flex items-center justify-between">
            <span>المسودات النشطة</span>
            <FileEdit className="w-4 h-4 text-sky-700" />
          </div>
          <div className="text-2xl font-black text-slate-900 mt-2 font-mono">
            {data.overall_kpis.total_active_drafts}
          </div>
          <div className="text-[10px] text-sky-700 font-semibold mt-1">
            مسودات قيد المراجعة أو الاستيفاء
          </div>
        </div>

        <div className="bg-[#ECEBE8] p-4 rounded-2xl border border-[#C6C4C1] shadow-sm">
          <div className="text-[11px] font-bold text-slate-600 flex items-center justify-between">
            <span>مخاطر عالية وحرجة</span>
            <AlertTriangle className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-2xl font-black text-rose-700 mt-2 font-mono">
            {data.overall_kpis.high_critical_risks}
          </div>
          <div className="text-[10px] text-rose-700 font-semibold mt-1">
            تستلزم إجراءات رقابية وخطط تصحيح
          </div>
        </div>

        <div className="bg-[#ECEBE8] p-4 rounded-2xl border border-[#C6C4C1] shadow-sm">
          <div className="text-[11px] font-bold text-slate-600 flex items-center justify-between">
            <span>بانتظار اعتماد المراجع المستقل</span>
            <Clock className="w-4 h-4 text-amber-700" />
          </div>
          <div className="text-2xl font-black text-amber-800 mt-2 font-mono">
            {data.overall_kpis.pending_checker_reviews}
          </div>
          <div className="text-[10px] text-amber-800 font-semibold mt-1">
            إرسالات مكتملة بانتظار الاعتماد المستقل
          </div>
        </div>

        <div className="bg-[#ECEBE8] p-4 rounded-2xl border border-[#C6C4C1] shadow-sm">
          <div className="text-[11px] font-bold text-slate-600 flex items-center justify-between">
            <span>خطط العمل التصحيحية</span>
            <CheckCircle2 className="w-4 h-4 text-[#006547]" />
          </div>
          <div className="text-2xl font-black text-slate-900 mt-2 font-mono">
            {data.overall_kpis.open_remediation_actions}
          </div>
          <div className="text-[10px] text-slate-600 font-semibold mt-1">
            إجراءات تصحيحية إلزامية مسجلة
          </div>
        </div>
      </div>

      {/* Business Units Comparison Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {data.bu_summaries.map((rawSummary) => {
          const summary = rawSummary as any;
          const isSelected = selectedBU === summary.unit.id;
          const bu = summary.unit;
          const approvedAsm = summary.latest_approved;
          const draftAsm = summary.latest_draft;
          const activeAsm = draftAsm || approvedAsm;

          return (
            <div
              key={bu.id}
              onClick={() => setSelectedBU(bu.id)}
              className={`rounded-2xl border transition-all cursor-pointer p-5 flex flex-col justify-between shadow-sm ${
                isSelected
                  ? 'bg-[#F0EFED] border-[#006547] ring-2 ring-[#006547]/25 shadow-md'
                  : 'bg-[#ECEBE8] border-[#C6C4C1] hover:bg-[#F0EFED] hover:border-[#AAA8A5]'
              }`}
            >
              <div>
                {/* BU Header */}
                <div className="flex items-start justify-between gap-2 pb-3 border-b border-[#CECCC9]">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl bg-[#E2E1DE] border border-[#B8B6B2] flex items-center justify-center shrink-0">
                      <Building2 className="w-5 h-5 text-[#006547]" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">{bu.name_ar}</h3>
                      <div className="text-[10px] text-slate-600 font-mono">{bu.code}</div>
                    </div>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                    approvedAsm 
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300/60' 
                      : draftAsm 
                        ? draftAsm.status === 'INCOMPLETE_DRAFT'
                          ? 'bg-amber-100 text-amber-900 border border-amber-300'
                          : 'bg-sky-100 text-sky-800 border border-sky-300/60'
                        : 'bg-[#DFDEDB] text-slate-700 border border-[#C6C4C1]'
                  }`}>
                    {approvedAsm 
                      ? 'معتمد رسمياً' 
                      : draftAsm 
                        ? formatWorkflowStatusAr(draftAsm.workflow_status, draftAsm.status)
                        : 'لم يتم إنشاء تقييم بعد'}
                  </span>
                </div>

                {/* Approved vs Draft Details using Actual Arabic Dates */}
                <div className="grid grid-cols-2 gap-2 my-3.5">
                  <div className="bg-[#E2E1DE] border border-[#C6C4C1] p-2.5 rounded-xl">
                    <div className="text-[10px] font-bold text-[#09331F] flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                      <span>آخر تقييم معتمد:</span>
                    </div>
                    {approvedAsm ? (
                      <div className="mt-1">
                        <div className="text-[11px] font-bold text-slate-900 leading-snug">
                          {approvedAsm.timestamps?.approved_at_ar || formatArabicDateTime(approvedAsm.approved_at)}
                        </div>
                        <div className="text-[10px] text-emerald-800 font-semibold mt-0.5">
                          تاريخ الاعتماد الرسمي
                        </div>
                      </div>
                    ) : (
                      <div className="text-[10px] text-slate-500 mt-1 font-semibold">لا يوجد تقييم معتمد</div>
                    )}
                  </div>

                  <div className="bg-[#E2E1DE] border border-[#C6C4C1] p-2.5 rounded-xl">
                    <div className="text-[10px] font-bold text-amber-900 flex items-center gap-1">
                      <FileEdit className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                      <span>المسودة الجارية:</span>
                    </div>
                    {draftAsm ? (
                      <div className="mt-1">
                        <div className="text-[11px] font-bold text-slate-900 leading-snug">
                          {draftAsm.timestamps?.updated_at_ar ||
                            draftAsm.timestamps?.created_at_ar ||
                            formatArabicDateTime(draftAsm.updated_at)}
                        </div>
                        <div className="text-[10px] text-amber-800 font-semibold truncate mt-0.5">
                          {formatWorkflowStatusAr(draftAsm.workflow_status, draftAsm.status)}
                        </div>
                      </div>
                    ) : (
                      <div className="text-[10px] text-slate-500 mt-1 font-semibold">لا توجد مسودة نشطة</div>
                    )}
                  </div>
                </div>

                {/* Residual Risk Distribution Breakdown */}
                <div className="space-y-1.5 my-3">
                  <div className="text-[11px] font-semibold text-slate-700 flex justify-between">
                    <span>توزيع درجات الخطر المتبقي:</span>
                    <span className="font-mono text-slate-900 font-bold">{summary.risks_count} خطر</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-[#D8D7D6] border border-[#C6C4C1] overflow-hidden flex">
                    <div 
                      style={{ width: `${summary.risks_count ? (summary.distribution.low / summary.risks_count) * 100 : 0}%` }} 
                      className="bg-emerald-500 h-full" 
                      title={`منخفض: ${summary.distribution.low}`}
                    />
                    <div 
                      style={{ width: `${summary.risks_count ? (summary.distribution.medium / summary.risks_count) * 100 : 0}%` }} 
                      className="bg-amber-400 h-full" 
                      title={`متوسط: ${summary.distribution.medium}`}
                    />
                    <div 
                      style={{ width: `${summary.risks_count ? (summary.distribution.high / summary.risks_count) * 100 : 0}%` }} 
                      className="bg-orange-500 h-full" 
                      title={`مرتفع: ${summary.distribution.high}`}
                    />
                    <div 
                      style={{ width: `${summary.risks_count ? (summary.distribution.very_high / summary.risks_count) * 100 : 0}%` }} 
                      className="bg-rose-600 h-full" 
                      title={`حرج/مرتفع جداً: ${summary.distribution.very_high}`}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-600 font-mono">
                    <span className="text-emerald-800 font-semibold">L: {summary.distribution.low}</span>
                    <span className="text-amber-800 font-semibold">M: {summary.distribution.medium}</span>
                    <span className="text-orange-800 font-semibold">H: {summary.distribution.high}</span>
                    <span className="text-rose-800 font-semibold">VH: {summary.distribution.very_high}</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons & Last change metadata */}
              <div className="mt-2 pt-2.5 border-t border-[#CECCC9] space-y-2">
                {summary.last_change && (
                  <div className="text-[10px] text-slate-600 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1 truncate">
                      <UserIcon className="w-3 h-3 text-slate-500 shrink-0" />
                      <span className="truncate">آخر نشاط: {summary.last_change.author}</span>
                    </div>
                    <span className="text-[10px] text-slate-700 shrink-0">
                      {summary.last_change.ts_ar || formatArabicDateTime(summary.last_change.ts)}
                    </span>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-1.5 pt-1" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => onNavigate?.({ page: 'business-units', unitId: bu.id })}
                    className="flex-1 px-2.5 py-1.5 rounded-lg bg-[#E2E1DE] hover:bg-[#D5D3CF] text-[#09331F] border border-[#B8B6B2] text-[11px] font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer"
                  >
                    <History className="w-3.5 h-3.5 text-[#006547]" />
                    <span>سجل التقييمات ({summary.total_assessments_count ?? 0})</span>
                  </button>

                  {activeAsm ? (
                    <button
                      type="button"
                      onClick={() =>
                        onNavigate?.({
                          page: 'rcsa-table',
                          unitId: bu.id,
                          assessmentId: activeAsm.id,
                        })
                      }
                      className="flex-1 px-2.5 py-1.5 rounded-lg bg-[#006547] hover:bg-[#09331F] text-white text-[11px] font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer"
                    >
                      <TableProperties className="w-3.5 h-3.5 text-[#F79C1E]" />
                      <span>فتح التقييم</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        onNavigate?.({
                          page: 'backend-rcsa',
                          unitId: bu.id,
                        })
                      }
                      className="flex-1 px-2.5 py-1.5 rounded-lg bg-[#09331F] hover:bg-[#006547] text-white text-[11px] font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer"
                    >
                      <FilePlus2 className="w-3.5 h-3.5 text-[#F79C1E]" />
                      <span>إعداد تقييم جديد</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Selected BU Deep-Dive Insights */}
      {selectedSummary && (
        <div className="bg-[#ECEBE8] rounded-2xl border border-[#C6C4C1] p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#CECCC9]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#09331F] text-[#F79C1E] flex items-center justify-center font-bold">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  الرؤى والتحليلات الرقابية: {selectedSummary.unit.name_ar}
                </h3>
                <p className="text-xs text-slate-600">
                  مطابقة الملاحظات الميدانية المسجلة مع الضوابط الرقابية وقاعدة أحداث الخسائر
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  onNavigate?.({
                    page: 'business-units',
                    unitId: selectedSummary.unit.id,
                  })
                }
                className="px-3 py-1.5 rounded-xl bg-[#E2E1DE] hover:bg-[#D5D3CF] text-[#09331F] border border-[#B8B6B2] text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <History className="w-3.5 h-3.5 text-[#006547]" />
                <span>السجل التاريخي والمقارنة</span>
              </button>

              {(selectedSummary.latest_draft || selectedSummary.latest_approved) && (
                <button
                  type="button"
                  onClick={() =>
                    onNavigate?.({
                      page: 'rcsa-table',
                      unitId: selectedSummary.unit.id,
                      assessmentId: (selectedSummary.latest_draft || selectedSummary.latest_approved).id,
                    })
                  }
                  className="px-3 py-1.5 rounded-xl bg-[#006547] hover:bg-[#09331F] text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <TableProperties className="w-3.5 h-3.5 text-[#F79C1E]" />
                  <span>فتح مصفوفة المخاطر للوحدة</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
            <div className="p-4 rounded-xl bg-[#E2E1DE] border border-[#C6C4C1]">
              <div className="text-xs font-bold text-slate-900 mb-1 flex items-center gap-1.5">
                <Info className="w-4 h-4 text-[#006547]" />
                <span>الوضعية الرقابية للوحدة</span>
              </div>
              <p className="text-xs text-slate-700 leading-relaxed">
                {selectedSummary.unit.description}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[#E2E1DE] border border-[#C6C4C1]">
              <div className="text-xs font-bold text-slate-900 mb-1 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-700" />
                <span>حالة الاعتماد والحوكمة</span>
              </div>
              <p className="text-xs text-slate-700 leading-relaxed">
                {selectedSummary.latest_approved 
                  ? `التقييم معتمد رسمياً (${selectedSummary.latest_approved.timestamps?.primary_date_badge_ar || formatArabicDateTime(selectedSummary.latest_approved.approved_at)}) بواسطة المراجع المستقل. هذا التقييم مجمد وغير قابل للتعديل المباشر.`
                  : 'الوحدة لا تمتلك تقييماً معتمداً حتى الآن، يلزم إكمال واستيفاء المسودة وتقديمها للمراجعة.'}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[#E2E1DE] border border-[#C6C4C1]">
              <div className="text-xs font-bold text-slate-900 mb-1 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-700" />
                <span>التوصية المنهجية والخطط التصحيحية</span>
              </div>
              <p className="text-xs text-slate-700 leading-relaxed">
                {selectedSummary.mandatory_actions_count > 0
                  ? `يوجد عدد (${selectedSummary.mandatory_actions_count}) إجراء تصحيحي إلزامي لمعالجة الفجوات الرقابية أو استبعاد الضوابط المقترحة من خفض الخطر المتبقي الحالي.`
                  : 'وفقاً لمبدأ التحوط، الضوابط المقترحة مستبعدة من خفض الخطر المتبقي الحالي حتى يتم تطبيقها واختبار كفاءتها.'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

