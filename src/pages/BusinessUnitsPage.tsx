import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { BusinessUnit } from '../types/index.js';
import { PageId } from '../components/Sidebar.js';
import { AppNavigationState } from '../App.js';
import { 
  Building2, 
  ShieldCheck, 
  Calendar, 
  ArrowLeft, 
  History, 
  GitCompare, 
  TableProperties, 
  FilePlus2, 
  CopyPlus, 
  User as UserIcon, 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  FileText,
  Lock,
  Info,
  Plus
} from 'lucide-react';

interface BusinessUnitsPageProps {
  initialUnitId?: string;
  onNavigate?: (next: Partial<AppNavigationState> & { page: PageId }) => void;
}

export const BusinessUnitsPage: React.FC<BusinessUnitsPageProps> = ({ initialUnitId, onNavigate }) => {
  const { token, user } = useAuth();
  const [units, setUnits] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(initialUnitId || null);

  const canManageUnits = Boolean(user?.roles.some(r => r.role === 'RISK_ADMIN'));
  const [showCreateUnit, setShowCreateUnit] = useState(false);
  const [newUnit, setNewUnit] = useState({ name_ar: '', name_en: '', code: '', description: '' });
  const [createError, setCreateError] = useState('');
  const [createBusy, setCreateBusy] = useState(false);

  const createBusinessUnit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token || !canManageUnits) return;
    setCreateBusy(true);
    setCreateError('');
    try {
      const response = await fetch('/api/business-units', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(newUnit),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'تعذر إضافة الوحدة.');
      setShowCreateUnit(false);
      setNewUnit({ name_ar: '', name_en: '', code: '', description: '' });
      setSelectedUnitId(payload.business_unit.id);
      loadUnits();
    } catch (error: any) {
      setCreateError(error.message);
    } finally {
      setCreateBusy(false);
    }
  };

  // Unit assessment history state
  const [unitHistory, setUnitHistory] = useState<any | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [actionBanner, setActionBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Version Comparison state
  const [baseCompareId, setBaseCompareId] = useState<string>('');
  const [targetCompareId, setTargetCompareId] = useState<string>('');
  const [comparisonData, setComparisonData] = useState<any | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [showUnchangedInCompare, setShowUnchangedInCompare] = useState(false);

  const loadUnits = useCallback(() => {
    if (!token) return;
    setIsLoading(true);
    fetch('/api/business-units', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        const list = data.business_units || [];
        setUnits(list);
        setSelectedUnitId(current => {
          if (current && list.some((u: any) => u.id === current)) return current;
          if (initialUnitId && list.some((u: any) => u.id === initialUnitId)) return initialUnitId;
          return list[0]?.id || null;
        });
      })
      .catch(err => console.error('Failed to load business units:', err))
      .finally(() => setIsLoading(false));
  }, [token, initialUnitId]);

  useEffect(() => {
    loadUnits();
  }, [loadUnits]);

  useEffect(() => {
    if (initialUnitId && initialUnitId !== selectedUnitId) {
      setSelectedUnitId(initialUnitId);
    }
  }, [initialUnitId]);

  const loadUnitHistory = useCallback((unitId: string) => {
    if (!token || !unitId) return;
    setHistoryLoading(true);
    setHistoryError(null);
    setComparisonData(null);
    setCompareError(null);

    fetch(`/api/units/${unitId}/assessments-history`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(async res => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || 'تعذر تحميل السجل التاريخي للوحدة.');
        return body;
      })
      .then(data => {
        setUnitHistory(data);
        const asms = data.assessments || [];
        if (asms.length >= 2) {
          // Default base = older/approved, target = newer/draft
          const approvedOne = asms.find((a: any) => a.workflow_status === 'APPROVED') || asms[asms.length - 1];
          const otherOne = asms.find((a: any) => a.id !== approvedOne.id) || asms[0];
          setBaseCompareId(approvedOne.id);
          setTargetCompareId(otherOne.id);
        } else if (asms.length === 1) {
          setBaseCompareId(asms[0].id);
          setTargetCompareId('');
        } else {
          setBaseCompareId('');
          setTargetCompareId('');
        }
      })
      .catch((err: any) => {
        setHistoryError(err.message || 'تعذر تحميل السجل التاريخي للوحدة.');
      })
      .finally(() => setHistoryLoading(false));
  }, [token]);

  useEffect(() => {
    if (selectedUnitId) {
      loadUnitHistory(selectedUnitId);
    }
  }, [selectedUnitId, loadUnitHistory]);

  const handleSelectUnit = (unitId: string) => {
    setSelectedUnitId(unitId);
    onNavigate?.({ page: 'business-units', unitId });
  };

  const handleCreateDraftFromApproved = async (approvedAssessmentId: string, unitId: string) => {
    if (!token) return;
    setActionBusyId(approvedAssessmentId);
    setActionBanner(null);
    try {
      const res = await fetch(`/api/hitl/assessments/${approvedAssessmentId}/create-draft-from-approved`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'تعذر اشتقاق مسودة جديدة.');
      }
      const newAssessmentId = data.state?.assessment?.id;
      setActionBanner({
        type: 'success',
        text: 'تم اشتقاق مسودة تقييم جديدة قابلة للتعديل مع الحفاظ على ثبات التقييم المعتمد.',
      });
      loadUnits();
      loadUnitHistory(unitId);
      if (newAssessmentId && onNavigate) {
        onNavigate({
          page: 'rcsa-table',
          unitId,
          assessmentId: newAssessmentId,
        });
      }
    } catch (err: any) {
      setActionBanner({ type: 'error', text: err.message });
    } finally {
      setActionBusyId(null);
    }
  };

  const handleRunComparison = async () => {
    if (!token || !selectedUnitId || !baseCompareId || !targetCompareId) return;
    if (baseCompareId === targetCompareId) {
      setCompareError('يرجى اختيار تقييمين مختلفين لإجراء المقارنة التاريخية.');
      return;
    }
    setCompareLoading(true);
    setCompareError(null);
    try {
      const res = await fetch(
        `/api/units/${selectedUnitId}/compare?baseId=${encodeURIComponent(baseCompareId)}&targetId=${encodeURIComponent(targetCompareId)}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'تعذر إجراء المقارنة بين التقييمين.');
      setComparisonData(body);
    } catch (err: any) {
      setCompareError(err.message);
    } finally {
      setCompareLoading(false);
    }
  };

  const canUserCreateDraftInUnit = (unitId: string) => {
    if (!user) return false;
    return user.roles.some(
      r => r.role === 'RISK_ADMIN' || (r.unit_id === unitId && r.role === 'MAKER')
    );
  };

  if (isLoading) {
    return (
      <div className="p-8 text-center text-slate-500 font-['Cairo']">
        <div className="w-8 h-8 border-4 border-[#006547] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <div>جارٍ تحميل بيانات الوحدات التنظيمية المصرفية والسجل التاريخي...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300 font-['Cairo']">
      {/* Header */}
      <div className="bg-[#ECEBE8] p-5 rounded-2xl border border-[#C6C4C1] shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">الوحدات التنظيمية</h2>
          <p className="text-xs text-slate-600 mt-1">
            اختر وحدة لعرض تقييماتها السابقة وسجل التعديلات والمقارنة بينها.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          {canManageUnits && (
            <button type="button" onClick={() => setShowCreateUnit(v => !v)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#006547] text-white text-xs font-bold hover:bg-[#09331F]">
              <Plus className="w-4 h-4" /> إضافة وحدة تنظيمية
            </button>
          )}
          <div className="px-3 py-1.5 rounded-xl bg-[#E2E1DE] border border-[#C6C4C1] text-xs font-bold text-slate-800 shrink-0">
            الوحدات المتاحة: {units.length}
          </div>
        </div>
      </div>

      {showCreateUnit && canManageUnits && (
        <form onSubmit={createBusinessUnit} className="bg-[#ECEBE8] border border-[#C6C4C1] rounded-2xl p-5 space-y-3">
          <h3 className="font-bold text-[#09331F]">إضافة وحدة تنظيمية جديدة</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {([
              ['name_ar', 'اسم الوحدة بالعربية'],
              ['name_en', 'الاسم بالإنجليزية'],
              ['code', 'رمز الوحدة (English)'],
              ['description', 'وصف مختصر'],
            ] as const).map(([key, label]) => (
              <label key={key} className="text-xs font-semibold text-slate-800 space-y-1">
                <span className="block">{label}</span>
                <input required={key !== 'description'} value={newUnit[key]}
                  onChange={e => setNewUnit(prev => ({ ...prev, [key]: e.target.value }))}
                  className="w-full rounded-lg border border-[#B8B6B2] bg-[#F4F3F0] px-3 py-2 text-sm focus:ring-2 focus:ring-[#006547] outline-none" />
              </label>
            ))}
          </div>
          <p className="text-xs text-slate-600">تبدأ الوحدة الجديدة بدون تقييمات؛ تُسند صلاحيات الموظفين لها من إدارة النظام.</p>
          {createError && <p role="alert" className="text-xs font-semibold text-rose-700">{createError}</p>}
          <div className="flex gap-2">
            <button disabled={createBusy} type="submit" className="bg-[#006547] text-white rounded-lg px-4 py-2 text-xs font-bold disabled:opacity-60">{createBusy ? 'جارٍ الحفظ...' : 'حفظ الوحدة'}</button>
            <button type="button" onClick={() => setShowCreateUnit(false)} className="border border-[#B8B6B2] rounded-lg px-4 py-2 text-xs">إلغاء</button>
          </div>
        </form>
      )}

      {/* Grid of Units */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {units.map((bu) => {
          const isSelected = selectedUnitId === bu.id;
          return (
            <div
              key={bu.id}
              onClick={() => handleSelectUnit(bu.id)}
              className={`rounded-2xl border p-6 shadow-sm flex flex-col justify-between transition-all cursor-pointer ${
                isSelected
                  ? 'bg-[#F0EFED] border-[#006547] ring-2 ring-[#006547]/25 shadow-md'
                  : 'bg-[#ECEBE8] border-[#C6C4C1] hover:bg-[#F0EFED] hover:shadow-md'
              }`}
            >
              <div>
                <div className="flex items-start justify-between pb-4 border-b border-[#CECCC9]">
                  <div className="w-12 h-12 rounded-2xl bg-[#E2E1DE] border border-[#B8B6B2] flex items-center justify-center">
                    <Building2 className="w-6 h-6 text-[#006547]" />
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-xs px-2.5 py-1 rounded-full bg-[#DFDEDB] border border-[#C6C4C1] text-slate-800 font-mono font-bold">
                      {bu.code}
                    </span>
                    <span className="text-[10px] font-bold text-[#006547]">
                      إجمالي التقييمات المسجلة: {bu.assessments_count ?? 0}
                    </span>
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  <h3 className="text-base font-bold text-slate-900">{bu.name_ar}</h3>
                  <div className="text-xs text-slate-600 font-sans">{bu.name_en}</div>
                  <p className="text-xs text-slate-700 leading-relaxed mt-2">
                    {bu.description}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 mt-6 pt-4 border-t border-[#CECCC9]">
                  <div className="p-2.5 rounded-xl bg-[#E2E1DE] border border-[#C6C4C1]">
                    <div className="text-[10px] text-slate-600 font-bold">المخاطر المسجلة:</div>
                    <div className="text-lg font-black text-slate-900 font-mono mt-0.5">
                      {bu.total_risks_count || 0}
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-[#E2E1DE] border border-[#C6C4C1]">
                    <div className="text-[10px] text-slate-600 font-bold">تاريخ آخر اعتماد رسمي:</div>
                    <div className="text-[11px] font-bold text-slate-800 mt-1 leading-snug">
                      {bu.latest_approved_date_ar || 'لم يتم اعتماد تقييم بعد'}
                    </div>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleSelectUnit(bu.id);
                }}
                className="mt-6 pt-4 border-t border-[#CECCC9] w-full flex items-center justify-between text-xs font-bold text-[#006547] hover:text-[#09331F] cursor-pointer"
              >
                <span>إدارة ملفات المخاطر والسجل التاريخي</span>
                <ArrowLeft className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Selected Business Unit Historical Registry & Version Comparison */}
      {selectedUnitId && (
        <div className="bg-[#ECEBE8] rounded-2xl border border-[#C6C4C1] p-6 shadow-sm space-y-6">
          {historyLoading ? (
            <div className="p-6 text-center text-slate-600">
              <div className="w-6 h-6 border-3 border-[#006547] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <div className="text-xs font-bold">جارٍ تحميل السجل التاريخي للتقييمات والمراجعات...</div>
            </div>
          ) : historyError ? (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold">
              {historyError}
            </div>
          ) : unitHistory ? (
            <>
              {/* Registry Section Header */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-[#CECCC9]">
                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-[#09331F] text-[#F79C1E] flex items-center justify-center shrink-0">
                    <History className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-base font-bold text-slate-900">
                        السجل التاريخي لتقييمات المخاطر والرقابة الذاتية: {unitHistory.unit.name_ar}
                      </h3>
                      <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-[#E2E1DE] border border-[#B8B6B2] text-[#09331F] font-bold">
                        عدد التقييمات المسجلة: {unitHistory.assessments?.length || 0}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-1">
                      جميع التقييمات المعتمدة والمسودات قيد الإعداد مرتبة ومميزة بتواريخها وأوقاتها الفعلية الموثقة في السجل التدقيقي.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {canUserCreateDraftInUnit(unitHistory.unit.id) && (
                    <button
                      type="button"
                      onClick={() =>
                        onNavigate?.({
                          page: 'backend-rcsa',
                          unitId: unitHistory.unit.id,
                        })
                      }
                      className="px-3.5 py-2 rounded-xl bg-[#006547] hover:bg-[#09331F] text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
                    >
                      <FilePlus2 className="w-4 h-4 text-[#F79C1E]" />
                      <span>إعداد تقييم جديد لهذه الوحدة</span>
                    </button>
                  )}
                </div>
              </div>

              {actionBanner && (
                <div
                  className={`p-3.5 rounded-xl border text-xs font-bold flex items-center justify-between ${
                    actionBanner.type === 'success'
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                      : 'bg-rose-50 border-rose-300 text-rose-900'
                  }`}
                >
                  <span>{actionBanner.text}</span>
                  <button
                    type="button"
                    onClick={() => setActionBanner(null)}
                    className="text-[11px] underline cursor-pointer"
                  >
                    إغلاق
                  </button>
                </div>
              )}

              {/* Assessments List */}
              {(!unitHistory.assessments || unitHistory.assessments.length === 0) ? (
                <div className="p-8 rounded-2xl bg-[#E2E1DE] border border-[#C6C4C1] text-center space-y-3">
                  <FileText className="w-8 h-8 text-slate-500 mx-auto" />
                  <div className="text-sm font-bold text-slate-800">
                    لا توجد تقييمات مسجلة حتى الآن لوحدة ({unitHistory.unit.name_ar})
                  </div>
                  <p className="text-xs text-slate-600 max-w-lg mx-auto">
                    يمكنك البدء بإعداد تقييم جديد لهذه الوحدة عبر معالج إعداد التقييم الموجه لرفع المستندات التشغيلية واستيفاء المدخلات واحتساب المخاطر.
                  </p>
                  {canUserCreateDraftInUnit(unitHistory.unit.id) && (
                    <button
                      type="button"
                      onClick={() =>
                        onNavigate?.({
                          page: 'backend-rcsa',
                          unitId: unitHistory.unit.id,
                        })
                      }
                      className="px-4 py-2 rounded-xl bg-[#006547] hover:bg-[#09331F] text-white text-xs font-bold inline-flex items-center gap-2 cursor-pointer"
                    >
                      <FilePlus2 className="w-4 h-4 text-[#F79C1E]" />
                      <span>بدء إعداد تقييم جديد الآن</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {unitHistory.assessments.map((asm: any) => {
                    const ts = asm.timestamps || {};
                    const isApproved = asm.workflow_status === 'APPROVED' || asm.status === 'APPROVED';
                    const isInReview = asm.workflow_status === 'IN_REVIEW' || asm.status === 'SUBMITTED';
                    const isReturned = asm.workflow_status === 'RETURNED_FOR_CHANGES' || asm.status === 'REJECTED';

                    return (
                      <div
                        key={asm.id}
                        className="rounded-2xl bg-[#E2E1DE] border border-[#B8B6B2] p-5 shadow-2xs space-y-4"
                      >
                        {/* Top row: Date-based title & status badge & action buttons */}
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-[#CECCC9]">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span
                                className={`text-[11px] px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1 ${
                                  isApproved
                                    ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                                    : isInReview
                                      ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                      : isReturned
                                        ? 'bg-rose-100 text-rose-900 border border-rose-300'
                                        : 'bg-sky-100 text-sky-900 border border-sky-300'
                                }`}
                              >
                                {isApproved ? (
                                  <Lock className="w-3 h-3 text-emerald-800" />
                                ) : (
                                  <Clock className="w-3 h-3" />
                                )}
                                <span>{ts.workflow_status_ar}</span>
                              </span>

                              <span className="text-xs font-bold text-[#09331F] bg-[#ECEBE8] px-2.5 py-0.5 rounded-lg border border-[#C6C4C1]">
                                {ts.primary_date_badge_ar}
                              </span>
                            </div>

                            <h4 className="text-sm font-bold text-slate-900 pt-1">
                              {asm.clean_title_ar} — ({ts.primary_date_badge_ar})
                            </h4>
                          </div>

                          {/* Direct Workspace Actions */}
                          <div className="flex flex-wrap items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() =>
                                onNavigate?.({
                                  page: 'rcsa-table',
                                  unitId: unitHistory.unit.id,
                                  assessmentId: asm.id,
                                })
                              }
                              className="px-3.5 py-2 rounded-xl bg-[#006547] hover:bg-[#09331F] text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                            >
                              <TableProperties className="w-3.5 h-3.5 text-[#F79C1E]" />
                              <span>
                                {isApproved
                                  ? 'فتح للمعاينة (للقراءة فقط)'
                                  : 'فتح في مساحة المراجعة والتعديل'}
                              </span>
                            </button>

                            {isApproved && canUserCreateDraftInUnit(unitHistory.unit.id) && (
                              <button
                                type="button"
                                disabled={actionBusyId === asm.id}
                                onClick={() => handleCreateDraftFromApproved(asm.id, unitHistory.unit.id)}
                                className="px-3.5 py-2 rounded-xl bg-[#ECEBE8] hover:bg-[#F0EFED] text-[#09331F] border border-[#006547] text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                              >
                                <CopyPlus className="w-3.5 h-3.5 text-[#006547]" />
                                <span>
                                  {actionBusyId === asm.id
                                    ? 'جارٍ اشتقاق مسودة...'
                                    : 'اشتقاق مسودة جديدة من هذا التقييم'}
                                </span>
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Metadata Grid: Dates, Creator, Editor, Approver, Counts */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                          <div className="p-3 rounded-xl bg-[#ECEBE8] border border-[#C6C4C1]">
                            <div className="text-[10px] font-bold text-slate-600">تاريخ التقييم / تاريخ الإنشاء:</div>
                            <div className="font-bold text-slate-900 mt-1">
                              {ts.created_at_ar || ts.original_assessment_date_ar}
                            </div>
                            <div className="text-[10px] text-slate-600 mt-0.5">
                              {ts.created_at_label_ar}
                            </div>
                          </div>

                          <div className="p-3 rounded-xl bg-[#ECEBE8] border border-[#C6C4C1]">
                            <div className="text-[10px] font-bold text-slate-600">تاريخ آخر تعديل موثق:</div>
                            <div className="font-bold text-slate-900 mt-1">
                              {ts.updated_at_ar}
                            </div>
                            <div className="text-[10px] text-slate-600 mt-0.5">
                              {ts.updated_at_label_ar}
                            </div>
                          </div>

                          <div className="p-3 rounded-xl bg-[#ECEBE8] border border-[#C6C4C1]">
                            <div className="text-[10px] font-bold text-slate-600">تاريخ الإرسال وتاريخ الاعتماد:</div>
                            <div className="font-bold text-slate-900 mt-1">
                              {isApproved ? `الاعتماد: ${ts.approved_at_ar}` : `الإرسال: ${ts.submitted_at_ar}`}
                            </div>
                            {isApproved && ts.submitted_at_ar && ts.submitted_at_ar !== 'لم يُرسل للمراجعة بعد' && (
                              <div className="text-[10px] text-slate-600 mt-0.5">
                                الإرسال: {ts.submitted_at_ar}
                              </div>
                            )}
                          </div>

                          <div className="p-3 rounded-xl bg-[#ECEBE8] border border-[#C6C4C1]">
                            <div className="text-[10px] font-bold text-slate-600">المسؤولون ونطاق التقييم:</div>
                            <div className="font-bold text-slate-900 mt-1">
                              إعداد: {asm.creator_name} | آخر محرر: {asm.last_editor_name}
                            </div>
                            <div className="text-[10px] text-slate-700 mt-0.5">
                              {asm.approver_name ? `المعتمد (Checker): ${asm.approver_name}` : 'لم يُعتمد بعد'} • ({asm.risks_count} مخاطر / {asm.controls_count} ضوابط)
                            </div>
                          </div>
                        </div>

                        {/* Factual Summary of Changes from Audit Trail */}
                        <div className="p-3 rounded-xl bg-[#ECEBE8] border border-[#C6C4C1] text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="flex items-start gap-2">
                            <Info className="w-4 h-4 text-[#006547] shrink-0 mt-0.5" />
                            <div>
                              <span className="font-bold text-slate-900">ملخص التعديلات والسجل التدقيقي: </span>
                              <span className="text-slate-700">{asm.changes_summary_ar}</span>
                            </div>
                          </div>
                          {ts.provenance_note_ar && (
                            <span className="text-[10px] text-slate-500 shrink-0">
                              {ts.provenance_note_ar}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Historical Version Comparison Section */}
              {unitHistory.assessments && unitHistory.assessments.length >= 2 && (
                <div className="pt-6 border-t border-[#CECCC9] space-y-4">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-[#006547] text-white flex items-center justify-center">
                        <GitCompare className="w-5 h-5 text-[#F79C1E]" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-900">
                          مقارنة التقييمات التاريخية للوحدة ({unitHistory.unit.name_ar})
                        </h4>
                        <p className="text-xs text-slate-600">
                          اختر أي تقييمين مسجلين لنفس الوحدة لمقارنة المخاطر، الضوابط، المدخلات المالية، أعلى معامل خفض مؤهل (MAX RRF)، والخطر المتبقي.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Selectors */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-[#E2E1DE] p-4 rounded-2xl border border-[#B8B6B2] items-end">
                    <div>
                      <label className="block text-xs font-bold text-slate-800 mb-1.5">
                        التقييم المرجعي الأول (الأساس):
                      </label>
                      <select
                        value={baseCompareId}
                        onChange={(e) => setBaseCompareId(e.target.value)}
                        className="w-full rounded-xl bg-[#F5F4F2] border border-[#B8B6B2] px-3 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#006547]"
                      >
                        {unitHistory.assessments.map((a: any) => (
                          <option key={a.id} value={a.id}>
                            {a.timestamps?.primary_version_label_ar || a.clean_title_ar}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-800 mb-1.5">
                        التقييم المقارن الثاني (الهدف):
                      </label>
                      <select
                        value={targetCompareId}
                        onChange={(e) => setTargetCompareId(e.target.value)}
                        className="w-full rounded-xl bg-[#F5F4F2] border border-[#B8B6B2] px-3 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#006547]"
                      >
                        {unitHistory.assessments.map((a: any) => (
                          <option key={a.id} value={a.id}>
                            {a.timestamps?.primary_version_label_ar || a.clean_title_ar}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleRunComparison}
                        disabled={compareLoading || !baseCompareId || !targetCompareId}
                        className="w-full px-4 py-2.5 rounded-xl bg-[#09331F] hover:bg-[#006547] text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <GitCompare className="w-4 h-4 text-[#F79C1E]" />
                        <span>{compareLoading ? 'جارٍ تحليل الفروقات...' : 'عرض المقارنة التفصيلية'}</span>
                      </button>
                    </div>
                  </div>

                  {compareError && (
                    <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-300 text-rose-900 text-xs font-bold">
                      {compareError}
                    </div>
                  )}

                  {/* Comparison Results */}
                  {comparisonData && (
                    <div className="space-y-4 bg-[#E2E1DE] p-5 rounded-2xl border border-[#B8B6B2]">
                      {/* Provenance & Summary Bar */}
                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-[#CECCC9]">
                        <div className="space-y-1">
                          <div className="text-xs font-bold text-[#09331F]">
                            نتيجة المقارنة: ({comparisonData.base_assessment.timestamps?.primary_date_badge_ar}) ⟵ مقابل ⟶ ({comparisonData.target_assessment.timestamps?.primary_date_badge_ar})
                          </div>
                          <div className="text-[11px] text-slate-700">
                            الأساس: {comparisonData.base_assessment.provenance_type_ar} | المقارن: {comparisonData.target_assessment.provenance_type_ar}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                          <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-900 border border-emerald-300">
                            مخاطر مضافة: {comparisonData.summary.added_risks_count}
                          </span>
                          <span className="px-2.5 py-1 rounded-lg bg-rose-100 text-rose-900 border border-rose-300">
                            مخاطر محذوفة: {comparisonData.summary.removed_risks_count}
                          </span>
                          <span className="px-2.5 py-1 rounded-lg bg-amber-100 text-amber-900 border border-amber-300">
                            مخاطر معدلة: {comparisonData.summary.modified_risks_count}
                          </span>
                          <span className="px-2.5 py-1 rounded-lg bg-[#ECEBE8] text-slate-800 border border-[#C6C4C1]">
                            دون تغيير: {comparisonData.summary.unchanged_risks_count}
                          </span>
                          <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-800 mr-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={showUnchangedInCompare}
                              onChange={(e) => setShowUnchangedInCompare(e.target.checked)}
                              className="rounded border-slate-400"
                            />
                            <span>إظهار المخاطر غير المعدلة</span>
                          </label>
                        </div>
                      </div>

                      {/* Diff items */}
                      <div className="space-y-3">
                        {comparisonData.risk_diffs
                          .filter((d: any) => showUnchangedInCompare || d.change_type !== 'UNCHANGED')
                          .map((diff: any) => (
                            <div
                              key={diff.risk_code}
                              className="p-4 rounded-xl bg-[#ECEBE8] border border-[#C6C4C1] space-y-3 text-xs"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[#CECCC9]">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono font-bold text-[#09331F] bg-[#E2E1DE] px-2 py-0.5 rounded border border-[#B8B6B2]">
                                    {diff.risk_code}
                                  </span>
                                  <span className="font-bold text-slate-900">
                                    {diff.target?.description_ar || diff.base?.description_ar}
                                  </span>
                                </div>
                                <span
                                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                                    diff.change_type === 'ADDED'
                                      ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                                      : diff.change_type === 'REMOVED'
                                        ? 'bg-rose-100 text-rose-900 border border-rose-300'
                                        : diff.change_type === 'MODIFIED'
                                          ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                          : 'bg-slate-200 text-slate-700'
                                  }`}
                                >
                                  {diff.change_type_ar}
                                </span>
                              </div>

                              {/* Financial & Residual Metric Comparison Table */}
                              {diff.base && diff.target && (
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-2.5">
                                  <div className={`p-2.5 rounded-lg border ${diff.changes.financial_inputs_changed ? 'bg-amber-50/90 border-amber-300' : 'bg-[#E2E1DE] border-[#C6C4C1]'}`}>
                                    <div className="text-[10px] font-bold text-slate-600">المدخلات المالية (الخسارة الفردية / التكرار):</div>
                                    <div className="mt-1 font-mono text-[11px] text-slate-800">
                                      الأساس: {Number(diff.base.expected_loss_egp).toLocaleString()} ج.م (تكرار {diff.base.frequency_score})
                                    </div>
                                    <div className="font-mono text-[11px] font-bold text-slate-900">
                                      المقارن: {Number(diff.target.expected_loss_egp).toLocaleString()} ج.م (تكرار {diff.target.frequency_score})
                                    </div>
                                  </div>

                                  <div className={`p-2.5 rounded-lg border ${diff.changes.annual_loss_changed ? 'bg-amber-50/90 border-amber-300' : 'bg-[#E2E1DE] border-[#C6C4C1]'}`}>
                                    <div className="text-[10px] font-bold text-slate-600">الخسارة السنوية المتوقعة (الخطر الكامن):</div>
                                    <div className="mt-1 font-mono text-[11px] text-slate-800">
                                      الأساس: {Number(diff.base.annual_expected_loss_egp).toLocaleString()} ج.م ({diff.base.inherent_rating})
                                    </div>
                                    <div className="font-mono text-[11px] font-bold text-slate-900">
                                      المقارن: {Number(diff.target.annual_expected_loss_egp).toLocaleString()} ج.م ({diff.target.inherent_rating})
                                    </div>
                                  </div>

                                  <div className={`p-2.5 rounded-lg border ${diff.changes.max_rrf_changed ? 'bg-amber-50/90 border-amber-300' : 'bg-[#E2E1DE] border-[#C6C4C1]'}`}>
                                    <div className="text-[10px] font-bold text-slate-600">أعلى معامل خفض مؤهل (MAX RRF):</div>
                                    <div className="mt-1 font-mono text-[11px] text-slate-800">
                                      الأساس: {(Number(diff.base.max_eligible_rrf) * 100).toFixed(0)}% ({diff.base.winning_control_id || '-'})
                                    </div>
                                    <div className="font-mono text-[11px] font-bold text-slate-900">
                                      المقارن: {(Number(diff.target.max_eligible_rrf) * 100).toFixed(0)}% ({diff.target.winning_control_id || '-'})
                                    </div>
                                  </div>

                                  <div className={`p-2.5 rounded-lg border ${diff.changes.residual_changed ? 'bg-amber-50/90 border-amber-300' : 'bg-[#E2E1DE] border-[#C6C4C1]'}`}>
                                    <div className="text-[10px] font-bold text-slate-600">الخطر المتبقي وتصنيفه:</div>
                                    <div className="mt-1 font-mono text-[11px] text-slate-800">
                                      الأساس: {Number(diff.base.residual_value_egp).toLocaleString()} ج.م ({diff.base.residual_rating})
                                    </div>
                                    <div className="font-mono text-[11px] font-bold text-slate-900">
                                      المقارن: {Number(diff.target.residual_value_egp).toLocaleString()} ج.م ({diff.target.residual_rating})
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* Control changes */}
                              {(diff.control_diffs?.added?.length > 0 ||
                                diff.control_diffs?.removed?.length > 0 ||
                                diff.control_diffs?.modified?.length > 0) && (
                                <div className="p-2.5 rounded-lg bg-[#E2E1DE] border border-[#C6C4C1] space-y-1">
                                  <div className="text-[11px] font-bold text-slate-900">فروقات الضوابط الرقابية المرتبطة:</div>
                                  {diff.control_diffs.added.map((c: any) => (
                                    <div key={c.control_id} className="text-[11px] text-emerald-900">
                                      + ضابط مضاف ({c.control_id}): {c.description_ar}
                                    </div>
                                  ))}
                                  {diff.control_diffs.removed.map((c: any) => (
                                    <div key={c.control_id} className="text-[11px] text-rose-900">
                                      - ضابط مستبعد/محذوف ({c.control_id}): {c.description_ar}
                                    </div>
                                  ))}
                                  {diff.control_diffs.modified.map((m: any) => (
                                    <div key={m.control_id} className="text-[11px] text-amber-950">
                                      ~ تعديل الضابط ({m.control_id}): حالة التنفيذ ({m.base.implementation_status} ⟵ {m.target.implementation_status}) | الملاءمة للخطر المتبقي ({m.base.scope_relevance || 'ELIGIBLE'} ⟵ {m.target.scope_relevance || 'ELIGIBLE'}) | RRF الفعال ({(Number(m.base.effective_rrf) * 100).toFixed(0)}% ⟵ {(Number(m.target.effective_rrf) * 100).toFixed(0)}%)
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* Audit Evidence */}
                              {diff.audit_evidence && diff.audit_evidence.length > 0 && (
                                <div className="text-[11px] text-slate-700 bg-[#E2E1DE]/70 px-3 py-2 rounded-lg border border-[#C6C4C1]">
                                  <span className="font-bold text-[#09331F]">التوثيق التدقيقي للتعديلات: </span>
                                  {diff.audit_evidence.map((ev: any, idx: number) => (
                                    <span key={idx}>
                                      [{ev.ts_ar}: {ev.reason_or_evidence || ev.field_name}] {idx < diff.audit_evidence.length - 1 ? ' • ' : ''}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : null}
        </div>
      )}
    </div>
  );
};

