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
  FilePlus2,
  Bot,
  Plus,
} from 'lucide-react';
import { CreateBusinessUnitModal } from '../components/CreateBusinessUnitModal.js';

interface DashboardPageProps {
  onNavigate?: (next: Partial<AppNavigationState> & { page: PageId }) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({ onNavigate }) => {
  const { token, user } = useAuth();
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedBU, setSelectedBU] = useState<string | null>(null);
  const [showAddUnitModal, setShowAddUnitModal] = useState(false);

  const loadDashboard = () => {
    if (!token || user?.must_reset_password) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    fetch('/api/dashboard', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => {
        if (d && Array.isArray(d.bu_summaries)) {
          setData(d);
          setSelectedBU((prev) => prev || (d.bu_summaries[0]?.unit?.id ?? null));
        }
      })
      .catch((err) => console.error('Failed to load dashboard data:', err))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    loadDashboard();
  }, [token, user?.must_reset_password]);

  if (isLoading) {
    return (
      <div className="p-10 text-center text-slate-600 font-['Cairo'] bg-white rounded-2xl border border-[#DCDAD5] shadow-xs">
        <div className="w-8 h-8 border-4 border-[#006547] border-t-[#F79C1E] rounded-full animate-spin mx-auto mb-3" />
        <div className="text-sm font-bold text-[#09331F]">
          جارٍ تحميل مؤشرات لوحة القيادة المركزية للمخاطر التشغيلية...
        </div>
      </div>
    );
  }

  if (user?.must_reset_password) {
    return (
      <div className="p-8 text-center text-slate-700 font-['Cairo'] bg-white rounded-2xl border border-[#DCDAD5]">
        يرجى إتمام تعيين كلمة المرور الجديدة لتفعيل جلسة العمل المصرفية.
      </div>
    );
  }

  if (!data || !Array.isArray(data.bu_summaries) || data.bu_summaries.length === 0) {
    return (
      <div className="p-8 text-center text-rose-700 bg-white rounded-2xl border border-rose-200">
        تعذر تحميل بيانات لوحة القيادة.
      </div>
    );
  }

  const selectedSummary = (data.bu_summaries.find((b) => b.unit.id === selectedBU) ||
    data.bu_summaries[0]) as any;

  return (
    <div className="space-y-5 sm:space-y-6 animate-in fade-in duration-300">
      {/* Executive Page Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-4 sm:p-5 rounded-2xl border border-[#DCDAD5] shadow-xs">
        <div className="flex items-start gap-3.5">
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-[#09331F] text-[#F79C1E] flex items-center justify-center shrink-0 border border-[#006547]">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg sm:text-xl font-extrabold text-[#09331F] font-['Cairo']">
                لوحة المعلومات التنفيذية
              </h2>
              <span className="hidden sm:inline text-slate-300" aria-hidden="true">·</span>
              <span className="text-xs font-bold text-[#006547] flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                <span className="tabular-nums">دورة تقييم عام 2026</span>
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-1 leading-relaxed">
              الرقابة المركزية على المخاطر التشغيلية والتقييمات المعتمدة والمسودات والمراجعات المعلقة بكافة وحدات العمل.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <button
            type="button"
            data-testid="dashboard-add-unit-btn"
            onClick={() => setShowAddUnitModal(true)}
            className="min-h-10 px-3.5 py-2 rounded-xl bg-[#F8F8F6] hover:bg-[#EFECE6] text-[#09331F] border border-[#006547]/40 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4 text-[#006547]" />
            <span>+ وحدة تنظيمية أخرى</span>
          </button>

          <button
            type="button"
            onClick={() =>
              onNavigate?.({
                page: 'agent',
                unitId: selectedBU || undefined,
              })
            }
            className="min-h-10 px-3.5 py-2 rounded-xl bg-[#006547] hover:bg-[#09331F] text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all cursor-pointer whitespace-nowrap"
          >
            <Bot className="w-4 h-4 text-[#F79C1E]" />
            <span>فتح الوكيل الذكي (RAG)</span>
          </button>
        </div>
      </div>

      <CreateBusinessUnitModal
        isOpen={showAddUnitModal}
        onClose={() => setShowAddUnitModal(false)}
        existingUnitCodes={data.bu_summaries.map((s: any) => s.unit?.code)}
        onUnitCreated={(newUnit) => {
          setSelectedBU(newUnit.id);
          loadDashboard();
        }}
      />

      {/* Top Executive KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5 sm:gap-4">
        <div className="bg-white p-4 rounded-2xl border border-[#DCDAD5] shadow-xs flex flex-col justify-between">
          <div className="text-[11px] font-bold text-slate-600 flex items-center justify-between">
            <span>إجمالي المخاطر المعتمدة</span>
            <ShieldCheck className="w-4 h-4 text-[#006547]" />
          </div>
          <div className="text-2xl font-black text-[#09331F] mt-2 font-mono tabular-nums">
            {data.overall_kpis.total_approved_risks}
          </div>
          <div className="text-[11px] text-[#006547] font-semibold mt-1">
            نسخ رسمية معتمدة ومجمدة
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-[#DCDAD5] shadow-xs flex flex-col justify-between">
          <div className="text-[11px] font-bold text-slate-600 flex items-center justify-between">
            <span>المسودات النشطة</span>
            <FileEdit className="w-4 h-4 text-sky-700" />
          </div>
          <div className="text-2xl font-black text-slate-900 mt-2 font-mono tabular-nums">
            {data.overall_kpis.total_active_drafts}
          </div>
          <div className="text-[11px] text-sky-800 font-semibold mt-1">
            مسودات قيد المراجعة أو الاستيفاء
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-[#DCDAD5] shadow-xs flex flex-col justify-between">
          <div className="text-[11px] font-bold text-slate-600 flex items-center justify-between">
            <span>مخاطر عالية وحرجة</span>
            <AlertTriangle className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-2xl font-black text-rose-700 mt-2 font-mono tabular-nums">
            {data.overall_kpis.high_critical_risks}
          </div>
          <div className="text-[11px] text-rose-700 font-semibold mt-1">
            تستلزم إجراءات رقابية وخطط تصحيح
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-[#DCDAD5] shadow-xs flex flex-col justify-between">
          <div className="text-[11px] font-bold text-slate-600 flex items-center justify-between">
            <span>بانتظار اعتماد المراجع المستقل</span>
            <Clock className="w-4 h-4 text-amber-700" />
          </div>
          <div className="text-2xl font-black text-amber-800 mt-2 font-mono tabular-nums">
            {data.overall_kpis.pending_checker_reviews}
          </div>
          <div className="text-[11px] text-amber-800 font-semibold mt-1">
            إرسالات مكتملة بانتظار الاعتماد المستقل
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-[#DCDAD5] shadow-xs flex flex-col justify-between sm:col-span-2 lg:col-span-1">
          <div className="text-[11px] font-bold text-slate-600 flex items-center justify-between">
            <span>خطط العمل التصحيحية</span>
            <CheckCircle2 className="w-4 h-4 text-[#006547]" />
          </div>
          <div className="text-2xl font-black text-slate-900 mt-2 font-mono tabular-nums">
            {data.overall_kpis.open_remediation_actions}
          </div>
          <div className="text-[11px] text-slate-600 font-semibold mt-1">
            إجراءات تصحيحية إلزامية مسجلة
          </div>
        </div>
      </div>

      {/* Business Units Comparison Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
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
              className={`rounded-2xl border transition-all cursor-pointer p-4 sm:p-5 flex flex-col justify-between ${
                isSelected
                  ? 'bg-white border-[#006547] ring-2 ring-[#006547]/20 shadow-md'
                  : 'bg-white border-[#DCDAD5] hover:border-[#006547]/50 shadow-xs'
              }`}
            >
              <div>
                {/* BU Header */}
                <div className="flex items-start justify-between gap-2 pb-3 border-b border-[#E5E3DE]">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 transition-colors ${
                        isSelected
                          ? 'bg-[#09331F] border-[#006547] text-[#F79C1E]'
                          : 'bg-[#F8F8F6] border-[#DCDAD5] text-[#006547]'
                      }`}
                    >
                      <Building2 className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-extrabold text-[#09331F] truncate">{bu.name_ar}</h3>
                      <div className="text-[10px] text-slate-500 font-mono tabular-nums">{bu.code}</div>
                    </div>
                  </div>
                  <span
                    className={`text-[11px] font-bold shrink-0 ${
                      approvedAsm
                        ? 'text-[#006547]'
                        : draftAsm
                          ? draftAsm.status === 'INCOMPLETE_DRAFT'
                            ? 'text-amber-800'
                            : 'text-sky-800'
                          : 'text-slate-500'
                    }`}
                  >
                    {approvedAsm
                      ? 'معتمد رسمياً'
                      : draftAsm
                        ? formatWorkflowStatusAr(draftAsm.workflow_status, draftAsm.status)
                        : 'بدون تقييم'}
                  </span>
                </div>

                {/* Approved vs Draft Details using Actual Arabic Dates */}
                <div className="grid grid-cols-2 gap-2.5 my-3.5">
                  <div className="bg-[#F8F8F6] border border-[#E5E3DE] p-2.5 rounded-xl">
                    <div className="text-[10px] font-bold text-[#09331F] flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#006547] shrink-0" />
                      <span>آخر تقييم معتمد:</span>
                    </div>
                    {approvedAsm ? (
                      <div className="mt-1">
                        <div className="text-[11px] font-bold text-slate-900 leading-snug tabular-nums">
                          {approvedAsm.timestamps?.approved_at_ar ||
                            formatArabicDateTime(approvedAsm.approved_at)}
                        </div>
                        <div className="text-[10px] text-[#006547] font-semibold mt-0.5">
                          تاريخ الاعتماد الرسمي
                        </div>
                      </div>
                    ) : (
                      <div className="text-[10px] text-slate-500 mt-1 font-semibold">
                        لا يوجد تقييم معتمد
                      </div>
                    )}
                  </div>

                  <div className="bg-[#F8F8F6] border border-[#E5E3DE] p-2.5 rounded-xl">
                    <div className="text-[10px] font-bold text-amber-900 flex items-center gap-1">
                      <FileEdit className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                      <span>المسودة الجارية:</span>
                    </div>
                    {draftAsm ? (
                      <div className="mt-1">
                        <div className="text-[11px] font-bold text-slate-900 leading-snug tabular-nums">
                          {draftAsm.timestamps?.updated_at_ar ||
                            draftAsm.timestamps?.created_at_ar ||
                            formatArabicDateTime(draftAsm.updated_at)}
                        </div>
                        <div className="text-[10px] text-amber-800 font-semibold truncate mt-0.5">
                          {formatWorkflowStatusAr(draftAsm.workflow_status, draftAsm.status)}
                        </div>
                      </div>
                    ) : (
                      <div className="text-[10px] text-slate-500 mt-1 font-semibold">
                        لا توجد مسودة نشطة
                      </div>
                    )}
                  </div>
                </div>

                {/* Residual Risk Distribution Breakdown */}
                <div className="space-y-1.5 my-3">
                  <div className="text-[11px] font-bold text-slate-700 flex justify-between">
                    <span>توزيع درجات الخطر المتبقي:</span>
                    <span className="font-mono tabular-nums text-[#09331F] font-extrabold">
                      {summary.risks_count} خطر
                    </span>
                  </div>
                  <div className="h-2.5 rounded-md bg-[#ECEEE9] border border-[#DCDAD5] overflow-hidden flex">
                    <div
                      style={{
                        width: `${
                          summary.risks_count
                            ? (summary.distribution.low / summary.risks_count) * 100
                            : 0
                        }%`,
                      }}
                      className="bg-[#006547] h-full"
                      title={`منخفض: ${summary.distribution.low}`}
                    />
                    <div
                      style={{
                        width: `${
                          summary.risks_count
                            ? (summary.distribution.medium / summary.risks_count) * 100
                            : 0
                        }%`,
                      }}
                      className="bg-[#F79C1E] h-full"
                      title={`متوسط: ${summary.distribution.medium}`}
                    />
                    <div
                      style={{
                        width: `${
                          summary.risks_count
                            ? (summary.distribution.high / summary.risks_count) * 100
                            : 0
                        }%`,
                      }}
                      className="bg-orange-600 h-full"
                      title={`مرتفع: ${summary.distribution.high}`}
                    />
                    <div
                      style={{
                        width: `${
                          summary.risks_count
                            ? (summary.distribution.very_high / summary.risks_count) * 100
                            : 0
                        }%`,
                      }}
                      className="bg-rose-600 h-full"
                      title={`حرج/مرتفع جداً: ${summary.distribution.very_high}`}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-600 font-mono tabular-nums">
                    <span className="text-[#006547] font-bold">L: {summary.distribution.low}</span>
                    <span className="text-amber-800 font-bold">M: {summary.distribution.medium}</span>
                    <span className="text-orange-800 font-bold">H: {summary.distribution.high}</span>
                    <span className="text-rose-800 font-bold">VH: {summary.distribution.very_high}</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons & Last change metadata */}
              <div className="mt-2 pt-2.5 border-t border-[#E5E3DE] space-y-2">
                {summary.last_change && (
                  <div className="text-[10px] text-slate-600 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1 truncate">
                      <UserIcon className="w-3 h-3 text-slate-500 shrink-0" />
                      <span className="truncate">آخر نشاط: {summary.last_change.author}</span>
                    </div>
                    <span className="text-[10px] text-slate-700 shrink-0 tabular-nums">
                      {summary.last_change.ts_ar || formatArabicDateTime(summary.last_change.ts)}
                    </span>
                  </div>
                )}

                <div
                  className="flex flex-wrap items-center gap-1.5 pt-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() => onNavigate?.({ page: 'business-units', unitId: bu.id })}
                    className="flex-1 min-h-9 px-2.5 py-1.5 rounded-lg bg-[#F8F8F6] hover:bg-[#EFECE6] text-[#09331F] border border-[#DCDAD5] text-[11px] font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer tabular-nums whitespace-nowrap"
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
                      className="flex-1 min-h-9 px-2.5 py-1.5 rounded-lg bg-[#006547] hover:bg-[#09331F] text-white text-[11px] font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
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
                      className="flex-1 min-h-9 px-2.5 py-1.5 rounded-lg bg-[#09331F] hover:bg-[#006547] text-white text-[11px] font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
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
        <div className="bg-white rounded-2xl border border-[#DCDAD5] p-4 sm:p-6 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#E5E3DE]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#09331F] text-[#F79C1E] flex items-center justify-center font-bold border border-[#006547] shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-extrabold text-[#09331F]">
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
                className="min-h-9 px-3 py-1.5 rounded-xl bg-[#F8F8F6] hover:bg-[#EFECE6] text-[#09331F] border border-[#DCDAD5] text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
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
                      assessmentId: (selectedSummary.latest_draft || selectedSummary.latest_approved)
                        .id,
                    })
                  }
                  className="min-h-9 px-3.5 py-1.5 rounded-xl bg-[#006547] hover:bg-[#09331F] text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <TableProperties className="w-3.5 h-3.5 text-[#F79C1E]" />
                  <span>فتح مصفوفة المخاطر للوحدة</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
            <div className="p-4 rounded-xl bg-[#F8F8F6] border border-[#E5E3DE]">
              <div className="text-xs font-extrabold text-[#09331F] mb-1.5 flex items-center gap-1.5">
                <Info className="w-4 h-4 text-[#006547]" />
                <span>الوضعية الرقابية للوحدة</span>
              </div>
              <p className="text-xs text-slate-700 leading-relaxed">
                {selectedSummary.unit.description}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[#F8F8F6] border border-[#E5E3DE]">
              <div className="text-xs font-extrabold text-[#09331F] mb-1.5 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-[#006547]" />
                <span>حالة الاعتماد والحوكمة</span>
              </div>
              <p className="text-xs text-slate-700 leading-relaxed">
                {selectedSummary.latest_approved
                  ? `التقييم معتمد رسمياً (${
                      selectedSummary.latest_approved.timestamps?.primary_date_badge_ar ||
                      formatArabicDateTime(selectedSummary.latest_approved.approved_at)
                    }) بواسطة المراجع المستقل. هذا التقييم مجمد وغير قابل للتعديل المباشر.`
                  : 'الوحدة لا تمتلك تقييماً معتمداً حتى الآن، يلزم إكمال واستيفاء المسودة وتقديمها للمراجعة.'}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[#F8F8F6] border border-[#E5E3DE]">
              <div className="text-xs font-extrabold text-[#09331F] mb-1.5 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-[#F79C1E]" />
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
