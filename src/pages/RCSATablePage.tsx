import React, { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { RCSAssessment } from '../types/index.js';
import { PageId } from '../components/Sidebar.js';
import { AppNavigationState } from '../App.js';
import { Phase2CReviewPanel } from '../components/Phase2CReviewPanel.js';
import { OfficialRcsaReportModal } from '../components/OfficialRcsaReportModal.js';
import { CreateBusinessUnitModal } from '../components/CreateBusinessUnitModal.js';
import { HoverTooltip, InfoHint } from '../components/HoverTooltip.js';
import { getAssessmentTimestampDetails, formatWorkflowStatusAr } from '../utils/dateFormat.js';
import {
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  AlertTriangle,
  ShieldAlert,
  Building2,
  FileSpreadsheet,
  Calculator,
  Save,
  Send,
  UserCheck,
  RotateCcw,
  GitBranch,
  Plus,
  Sparkles,
  FileText,
  History,
  Lock,
  Check,
  X,
  Edit3,
  Eye,
  Layers,
  Info,
} from 'lucide-react';

const FREQUENCY_OPTIONS = [
  { value: 'Once Every Two Years\nمرة كل سنتين', label: 'مرة كل سنتين (Once Every Two Years — ×0.5)' },
  { value: 'Annually\nسنوياً', label: 'سنوياً (Annually — ×1)' },
  { value: 'Semi-Annually\nمرة كل نصف سنة', label: 'مرة كل نصف سنة (Semi-Annually — ×2)' },
  { value: 'Quarterly\nمرة كل ربع سنة', label: 'مرة كل ربع سنة (Quarterly — ×4)' },
  { value: 'Monthly\nشهرياً', label: 'شهرياً (Monthly — ×12)' },
];

const EFFECTIVENESS_OPTIONS = [
  { value: 'ضابط رقابي فعال', label: 'ضابط رقابي فعال (Effective)' },
  { value: 'ضابط رقابي يحتاج إلى تطوير', label: 'ضابط رقابي يحتاج إلى تطوير (Needs Improvement)' },
  { value: 'لا يوجد ضابط رقابي', label: 'لا يوجد ضابط رقابي (No Control)' },
  { value: 'PENDING_REVIEW', label: 'قيد المراجعة / غير مستوفى بالمصدر (PENDING_REVIEW)' },
];

const CONTROL_TYPE_OPTIONS = [
  { value: 'Preventive', label: 'مانع (Preventive)' },
  { value: 'Detective', label: 'كاشف (Detective)' },
  { value: 'Corrective', label: 'تصحيحي (Corrective)' },
];

const CONTROL_METHOD_OPTIONS = [
  { value: 'Automated', label: 'آلي (Automated)' },
  { value: 'Semi-Automated', label: 'شبه آلي (Semi-Automated)' },
  { value: 'Manual', label: 'يدوي (Manual)' },
];

const PROVENANCE_LABELS_AR: Record<string, { text: string; code: string; desc: string; cls: string }> = {
  ORIGINAL_SOURCE_VALUE: {
    text: 'مصدر أصلي',
    code: 'ORIGINAL_SOURCE_VALUE',
    desc: 'قيمة مستخرجة مباشرة من سجل أو مستند المصدر الأصلي دون تعديل.',
    cls: 'bg-slate-100 text-slate-700 border-slate-300',
  },
  CURRENT_DRAFT_VALUE: {
    text: 'تعديل مسودة',
    code: 'CURRENT_DRAFT_VALUE',
    desc: 'قيمة معدلة يدوياً بواسطة معد التقييم (Maker) في المسودة الحالية.',
    cls: 'bg-sky-50 text-sky-900 border-sky-300',
  },
  CALCULATED_VALUE: {
    text: 'محرك بايثون',
    code: 'CALCULATED_VALUE',
    desc: 'مخرج محسوب تلقائياً بمحرك بايثون المعتمد ولا يُعدّل يدوياً.',
    cls: 'bg-emerald-50 text-emerald-900 border-emerald-300',
  },
  AI_SUGGESTED_VALUE: {
    text: 'مقترح ذكي',
    code: 'AI_SUGGESTED_VALUE',
    desc: 'صياغة أو تقدير مقترح من الوكيل الذكي ومؤيد بالأدلة لحين قرار المراجع.',
    cls: 'bg-amber-50 text-amber-900 border-amber-300',
  },
  REVIEWER_APPROVED_VALUE: {
    text: 'معتمد',
    code: 'REVIEWER_APPROVED_VALUE',
    desc: 'قيمة تم اعتمادها رسمياً من المراجع المستقل (Checker).',
    cls: 'bg-[#006547]/15 text-[#09331F] border-[#006547]/40',
  },
};

interface RCSATablePageProps {
  initialUnitId?: string;
  initialAssessmentId?: string;
  initialRiskId?: string;
  initialSessionId?: string;
  onNavigate?: (next: Partial<AppNavigationState> & { page: PageId }, replace?: boolean) => void;
}

export const RCSATablePage: React.FC<RCSATablePageProps> = ({
  initialUnitId,
  initialAssessmentId,
  initialRiskId,
  initialSessionId,
  onNavigate,
}) => {
  const { user, token } = useAuth();
  const [businessUnits, setBusinessUnits] = useState<any[]>([]);
  const [selectedUnitId, setSelectedUnitId] = useState<string>(initialUnitId || 'BU-SYNDICATED');
  const [assessments, setAssessments] = useState<any[]>([]);
  const [selectedAssessmentId, setSelectedAssessmentId] = useState<string>(initialAssessmentId || '');
  const [sessionInfo, setSessionInfo] = useState<any | null>(null);
  const [hitlState, setHitlState] = useState<any | null>(null);
  const [selectedRiskId, setSelectedRiskId] = useState<string>(initialRiskId || 'RSK-SYND-01');
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<
    'inputs_and_calc' | 'controls' | 'ai_suggestions' | 'evidence_and_audit'
  >('inputs_and_calc');
  const [showOfficialPreview, setShowOfficialPreview] = useState<boolean>(false);
  const [showOfficialReportModal, setShowOfficialReportModal] = useState<boolean>(false);
  const [showAddUnitModal, setShowAddUnitModal] = useState<boolean>(false);

  // Filters & search
  const [searchQuery, setSearchQuery] = useState('');
  const [listFilter, setListFilter] = useState<
    'ALL' | 'MISSING_INPUTS' | 'DISCREPANCIES' | 'UNREVIEWED' | 'REVIEWED'
  >('ALL');

  // Loading & notification state
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSavingOrRecalculating, setIsSavingOrRecalculating] = useState<boolean>(false);
  const [bannerMsg, setBannerMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(
    null
  );

  // Reference data for cascading Risk Taxonomy (L1/L2/L3)
  const [taxonomyL1s, setTaxonomyL1s] = useState<any[]>([]);
  const [taxonomyL2s, setTaxonomyL2s] = useState<any[]>([]);
  const [taxonomyL3s, setTaxonomyL3s] = useState<any[]>([]);

  // Local editable form state for the currently selected risk
  const [riskForm, setRiskForm] = useState<{
    process_name: string;
    strategic_objective: string;
    risk_library_name: string;
    risk_description: string;
    individual_financial_impact: string;
    financial_value_origin: string;
    financial_evidence_justification: string;
    expected_frequency_text: string;
    frequency_origin: string;
    frequency_justification: string;
    active_rationale_ar: string;
    active_corrective_action_ar: string;
    taxonomy_l1_ar: string;
    taxonomy_l1_id: string;
    taxonomy_l2_ar: string;
    taxonomy_l2_id: string;
    taxonomy_l3_ar: string;
    taxonomy_l3_id: string;
    evidence_or_reason: string;
    preserve_custom_rationale: boolean;
  }>({
    process_name: '',
    strategic_objective: '',
    risk_library_name: '',
    risk_description: '',
    individual_financial_impact: '',
    financial_value_origin: 'TEMPLATE_REFERENCE_AMOUNT',
    financial_evidence_justification: '',
    expected_frequency_text: '',
    frequency_origin: 'SOURCE_DOCUMENTED_FREQUENCY',
    frequency_justification: '',
    active_rationale_ar: '',
    active_corrective_action_ar: '',
    taxonomy_l1_ar: '',
    taxonomy_l1_id: '',
    taxonomy_l2_ar: '',
    taxonomy_l2_id: '',
    taxonomy_l3_ar: '',
    taxonomy_l3_id: '',
    evidence_or_reason: '',
    preserve_custom_rationale: false,
  });

  // Local editable controls state for the selected risk
  const [controlsForm, setControlsForm] = useState<Record<string, any>>({});

  // New control modal/inline form
  const [showAddControl, setShowAddControl] = useState(false);
  const [newControlForm, setNewControlForm] = useState({
    control_description: '',
    control_owner: 'السلطة الإشرافية',
    control_type_raw: 'Preventive',
    control_method_raw: 'Manual',
    control_frequency_raw: 'Daily\nيومياً',
    effectiveness_raw: 'ضابط رقابي فعال',
    implementation_status: 'IMPLEMENTED' as 'IMPLEMENTED' | 'PROPOSED',
  });

  // AI Suggestion modification state
  const [modifyingSuggestionField, setModifyingSuggestionField] = useState<string | null>(null);
  const [modifiedSuggestionText, setModifiedSuggestionText] = useState<string>('');

  // Checker return reason prompt
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnReasonText, setReturnReasonText] = useState('');

  // Reviewer notes for marking risk reviewed
  const [reviewerNoteInput, setReviewerNoteInput] = useState('');

  // Load Business Units & Assessments
  const loadAssessmentsList = async (preferredAssessmentId?: string, unitFilter?: string, clearSession?: boolean) => {
    setIsLoading(true);
    try {
      const [buRes, asmRes] = await Promise.all([
        fetch('/api/business-units', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/assessments', { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const buData = await buRes.json();
      const asmData = await asmRes.json();

      const allBus = buData.business_units || [];
      setBusinessUnits(allBus);

      const list: any[] = asmData.assessments || [];
      setAssessments(list);

      // If unitFilter was explicitly requested, honor it strictly; otherwise match preferredAssessmentId
      const matchedPreferred = preferredAssessmentId
        ? list.find((a) => a.id === preferredAssessmentId && (!unitFilter || a.unit_id === unitFilter))
        : undefined;

      let targetUnit = unitFilter || matchedPreferred?.unit_id || initialUnitId || selectedUnitId;
      if (allBus.length > 0 && !allBus.some((b: any) => b.id === targetUnit)) {
        targetUnit = allBus[0].id;
      }
      setSelectedUnitId(targetUnit);

      const unitAssessments = list.filter((a) => a.unit_id === targetUnit);
      const navSessionOverride = clearSession ? { sessionId: '' } : {};

      if (matchedPreferred) {
        setSelectedAssessmentId(matchedPreferred.id);
        onNavigate?.({ page: 'rcsa-table', unitId: targetUnit, assessmentId: matchedPreferred.id, ...navSessionOverride }, true);
      } else if (unitAssessments.length > 0) {
        const draftAsm = unitAssessments.find((a) => a.status !== 'APPROVED') || unitAssessments[0];
        setSelectedAssessmentId(draftAsm.id);
        onNavigate?.({ page: 'rcsa-table', unitId: targetUnit, assessmentId: draftAsm.id, ...navSessionOverride }, true);
      } else {
        setSelectedAssessmentId('');
        setHitlState(null);
        onNavigate?.({ page: 'rcsa-table', unitId: targetUnit, assessmentId: '', ...navSessionOverride }, true);
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!token) return;

    // Fetch Risk Taxonomy (L1 / L2) reference data
    fetch('/api/reference/taxonomy', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.l1s) setTaxonomyL1s(data.l1s);
        if (data.l2s) setTaxonomyL2s(data.l2s);
        if (data.l3s) setTaxonomyL3s(data.l3s);
      })
      .catch((err) => console.error('[Taxonomy Fetch Error]', err));

    if (initialSessionId) {
      fetch(`/api/workflow/sessions/${initialSessionId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.session && (!initialUnitId || data.session.unit_id === initialUnitId)) {
            setSessionInfo(data.session);
            const targetAsm = initialAssessmentId || data.session.draft_assessment_id || undefined;
            const targetUnit = initialUnitId || data.session.unit_id || undefined;
            loadAssessmentsList(targetAsm, targetUnit);
          } else {
            setSessionInfo(null);
            loadAssessmentsList(initialAssessmentId, initialUnitId);
          }
        })
        .catch(() => {
          setSessionInfo(null);
          loadAssessmentsList(initialAssessmentId, initialUnitId);
        });
    } else {
      setSessionInfo(null);
      loadAssessmentsList(initialAssessmentId, initialUnitId);
    }
  }, [token, initialUnitId, initialAssessmentId, initialSessionId]);

  // Load full HITL state whenever selectedAssessmentId changes
  const loadHitlAssessmentState = async (assessmentId: string, keepSelectedRiskId?: string) => {
    if (!assessmentId) {
      setHitlState(null);
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch(`/api/hitl/assessments/${assessmentId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setBannerMsg({ type: 'error', text: data.error || 'فشل تحميل بيانات المراجعة التفاعلية.' });
        return;
      }
      setHitlState(data);
      const riskList = data.risks || [];
      if (riskList.length > 0) {
        const targetRisk =
          keepSelectedRiskId && riskList.some((r: any) => r.risk_id === keepSelectedRiskId)
            ? keepSelectedRiskId
            : riskList.some((r: any) => r.risk_id === selectedRiskId)
              ? selectedRiskId
              : riskList[0].risk_id;
        setSelectedRiskId(targetRisk);
      }
    } catch (err: any) {
      setBannerMsg({ type: 'error', text: 'خطأ في الاتصال بالخادم.' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (selectedAssessmentId) {
      loadHitlAssessmentState(selectedAssessmentId);
    }
  }, [selectedAssessmentId]);

  const currentRiskObj = useMemo(() => {
    if (!hitlState?.risks) return null;
    return hitlState.risks.find((r: any) => r.risk_id === selectedRiskId) || hitlState.risks[0] || null;
  }, [hitlState, selectedRiskId]);

  // Sync local form state when selected risk or hitlState updates
  useEffect(() => {
    if (!currentRiskObj) return;
    const d = currentRiskObj.current_draft_input || {};
    setRiskForm({
      process_name: d.process_name || '',
      strategic_objective: d.strategic_objective || '',
      risk_library_name: d.risk_library_name || '',
      risk_description: d.risk_description || '',
      individual_financial_impact:
        d.individual_financial_impact !== null && d.individual_financial_impact !== undefined
          ? String(d.individual_financial_impact)
          : '',
      financial_value_origin: d.financial_value_origin || 'TEMPLATE_REFERENCE_AMOUNT',
      financial_evidence_justification: d.financial_evidence_justification || '',
      expected_frequency_text: d.expected_frequency_text || '',
      frequency_origin: d.frequency_origin || 'SOURCE_DOCUMENTED_FREQUENCY',
      frequency_justification: d.frequency_justification || '',
      active_rationale_ar: d.active_rationale_ar || '',
      active_corrective_action_ar: d.active_corrective_action_ar || '',
      taxonomy_l1_ar: d.taxonomy_l1_ar || '',
      taxonomy_l1_id: d.taxonomy_l1_id || '',
      taxonomy_l2_ar: d.taxonomy_l2_ar || '',
      taxonomy_l2_id: d.taxonomy_l2_id || '',
      taxonomy_l3_ar: d.taxonomy_l3_ar || '',
      taxonomy_l3_id: d.taxonomy_l3_id || '',
      evidence_or_reason: '',
      preserve_custom_rationale: false,
    });
    setReviewerNoteInput(currentRiskObj.reviewer_notes_ar || '');

    const cMap: Record<string, any> = {};
    for (const c of d.controls || []) {
      cMap[c.control_id] = {
        control_id: c.control_id,
        control_description: c.control_description || '',
        control_owner: c.control_owner || '',
        control_type_raw: c.control_type_raw || 'Preventive',
        control_method_raw: c.control_method_raw || 'Manual',
        control_frequency_raw: c.control_frequency_raw || '',
        effectiveness_raw: c.effectiveness_raw || 'PENDING_REVIEW',
        implementation_status: c.implementation_status || 'IMPLEMENTED',
        eligible_for_scope_override:
          c.eligible_for_scope_override === undefined ? null : c.eligible_for_scope_override,
      };
    }
    setControlsForm(cMap);
    setModifyingSuggestionField(null);
  }, [currentRiskObj]);

  // Role permissions on current unit
  const currentUnitRoles = useMemo(() => {
    if (!user) return [];
    return user.roles.filter(r => r.unit_id === selectedUnitId || r.role === 'RISK_ADMIN' || r.role === 'AUDITOR');
  }, [user, selectedUnitId]);

  const isMakerOrAdmin = useMemo(
    () => currentUnitRoles.some(r => r.role === 'MAKER' || r.role === 'RISK_ADMIN'),
    [currentUnitRoles]
  );
  const isCheckerOrAdmin = useMemo(
    () => currentUnitRoles.some(r => r.role === 'CHECKER' || r.role === 'RISK_ADMIN'),
    [currentUnitRoles]
  );

  const workflowStatus = hitlState?.assessment?.workflow_status || 'DRAFT';
  const isEditableDraft =
    isMakerOrAdmin && (workflowStatus === 'DRAFT' || workflowStatus === 'RETURNED_FOR_CHANGES');

  // Filtered risks for table
  const filteredRisks = useMemo(() => {
    const list: any[] = hitlState?.risks || [];
    return list.filter(r => {
      const draft = r.current_draft_input || {};
      const calc = r.calculated_output || {};
      const pkg = r.package || {};
      const matchesSearch =
        !searchQuery.trim() ||
        r.risk_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (draft.process_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (draft.risk_description || '').toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;

      const hasPendingControls = (calc.controls_calculated || []).some(
        (c: any) =>
          c.implementation_status === 'IMPLEMENTED' && c.effectiveness_classification === 'PENDING_REVIEW'
      );
      const hasMissing =
        (pkg.pending_missing_fields || []).length > 0 ||
        calc.phase2a_status !== 'COMPUTED' ||
        hasPendingControls;

      if (listFilter === 'MISSING_INPUTS') return hasMissing;
      if (listFilter === 'DISCREPANCIES') return (r.source_discrepancies || []).length > 0;
      if (listFilter === 'UNREVIEWED') return !r.is_reviewed;
      if (listFilter === 'REVIEWED') return Boolean(r.is_reviewed);
      return true;
    });
  }, [hitlState, searchQuery, listFilter]);

  // Navigation helpers (Previous Risk / Next Risk)
  const allRisks: any[] = hitlState?.risks || [];
  const currentRiskIndex = allRisks.findIndex(r => r.risk_id === currentRiskObj?.risk_id);
  const handlePrevRisk = () => {
    if (currentRiskIndex > 0) {
      setSelectedRiskId(allRisks[currentRiskIndex - 1].risk_id);
    }
  };
  const handleNextRisk = () => {
    if (currentRiskIndex >= 0 && currentRiskIndex < allRisks.length - 1) {
      setSelectedRiskId(allRisks[currentRiskIndex + 1].risk_id);
    }
  };

  // Action: Recalculate single risk via Python engine
  const handleRecalculateRisk = async (
    customRiskUpdates?: Record<string, any>,
    customControlUpdates?: any[],
    customReason?: string,
    customAddControl?: any
  ) => {
    if (!selectedAssessmentId || !currentRiskObj) return;
    setIsSavingOrRecalculating(true);
    setBannerMsg(null);
    try {
      const payload = {
        expected_revision: hitlState?.assessment?.revision,
        risk_updates: customRiskUpdates || {
          process_name: riskForm.process_name,
          strategic_objective: riskForm.strategic_objective,
          risk_library_name: riskForm.risk_library_name,
          risk_description: riskForm.risk_description,
          individual_financial_impact:
            riskForm.individual_financial_impact.trim() === ''
              ? null
              : Number(riskForm.individual_financial_impact.replace(/,/g, '')),
          financial_value_origin: riskForm.financial_value_origin,
          financial_evidence_justification: riskForm.financial_evidence_justification,
          expected_frequency_text: riskForm.expected_frequency_text || null,
          frequency_origin: riskForm.frequency_origin,
          frequency_justification: riskForm.frequency_justification,
          active_rationale_ar: riskForm.active_rationale_ar,
          active_corrective_action_ar: riskForm.active_corrective_action_ar || null,
          taxonomy_l1_ar: riskForm.taxonomy_l1_ar,
          taxonomy_l1_id: riskForm.taxonomy_l1_id,
          taxonomy_l2_ar: riskForm.taxonomy_l2_ar,
          taxonomy_l2_id: riskForm.taxonomy_l2_id,
          taxonomy_l3_ar: riskForm.taxonomy_l3_ar,
          taxonomy_l3_id: riskForm.taxonomy_l3_id,
          preserve_custom_rationale: riskForm.preserve_custom_rationale,
        },
        control_updates: customControlUpdates || Object.values(controlsForm),
        add_control: customAddControl || undefined,
        evidence_or_reason:
          customReason ||
          riskForm.evidence_or_reason ||
          'تحديث مدخلات المخاطرة وإعادة الاحتساب عبر محرك بايثون المعتمد',
      };

      const res = await fetch(
        `/api/hitl/assessments/${selectedAssessmentId}/risks/${currentRiskObj.risk_id}/recalculate`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setBannerMsg({ type: 'error', text: data.error || 'فشل إعادة الاحتساب.' });
      } else {
        setHitlState(data.state);
        setBannerMsg({
          type: 'success',
          text: data.message || `تم إعادة احتساب المخاطرة (${currentRiskObj.risk_id}) وحفظ التغييرات بنجاح.`,
        });
        setShowAddControl(false);
      }
    } catch (err: any) {
      setBannerMsg({ type: 'error', text: 'خطأ في الاتصال بالخادم أثناء إعادة الاحتساب.' });
    } finally {
      setIsSavingOrRecalculating(false);
    }
  };

  // Action: AI Suggestion decision (Accept / Modify / Reject)
  const handleSuggestionDecision = async (
    targetField: 'risk_description' | 'rationale' | 'corrective_action' | 'taxonomy_l1' | 'control_description',
    decision: 'ACCEPT' | 'MODIFY' | 'REJECT',
    controlId?: string,
    customText?: string
  ) => {
    if (!selectedAssessmentId || !currentRiskObj) return;
    setIsSavingOrRecalculating(true);
    setBannerMsg(null);
    try {
      const res = await fetch(
        `/api/hitl/assessments/${selectedAssessmentId}/risks/${currentRiskObj.risk_id}/suggestion`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            expected_revision: hitlState?.assessment?.revision,
            target_field: targetField,
            control_id: controlId,
            decision,
            modified_text: customText,
            reason: `قرار المراجع (${decision}) على مقترح الحقل (${targetField})`,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setBannerMsg({ type: 'error', text: data.error || 'فشل تطبيق القرار على المقترح.' });
      } else {
        setHitlState(data.state);
        setModifyingSuggestionField(null);
        setBannerMsg({ type: 'success', text: data.message });
      }
    } catch {
      setBannerMsg({ type: 'error', text: 'خطأ في الاتصال بالخادم.' });
    } finally {
      setIsSavingOrRecalculating(false);
    }
  };

  // Action: Mark risk reviewed
  const handleToggleRiskReviewed = async (markReviewed: boolean) => {
    if (!selectedAssessmentId || !currentRiskObj) return;
    setIsSavingOrRecalculating(true);
    setBannerMsg(null);
    try {
      const res = await fetch(
        `/api/hitl/assessments/${selectedAssessmentId}/risks/${currentRiskObj.risk_id}/review-status`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            is_reviewed: markReviewed,
            reviewer_notes_ar: reviewerNoteInput || 'تمت المراجعة والتحقق من دقة الحسابات والأدلة',
            acknowledge_discrepancies: true,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setBannerMsg({ type: 'error', text: data.error || 'تعذر تحديث حالة مراجعة المخاطرة.' });
      } else {
        setHitlState(data.state);
        setBannerMsg({ type: 'success', text: data.message });
      }
    } catch {
      setBannerMsg({ type: 'error', text: 'خطأ في الاتصال بالخادم.' });
    } finally {
      setIsSavingOrRecalculating(false);
    }
  };

  // Workflow Actions: Save Draft, Submit, Approve, Return, Create New Draft
  const handleSaveDraft = async () => {
    if (!selectedAssessmentId) return;
    setIsSavingOrRecalculating(true);
    setBannerMsg(null);
    try {
      const res = await fetch(`/api/hitl/assessments/${selectedAssessmentId}/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          expected_revision: hitlState?.assessment?.revision,
          save_note: 'حفظ يدوي للمسودة من شاشة المراجعة التفاعلية',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBannerMsg({ type: 'error', text: data.error });
      } else {
        setHitlState(data.state);
        setBannerMsg({ type: 'success', text: data.message });
      }
    } finally {
      setIsSavingOrRecalculating(false);
    }
  };

  const handleSubmitForReview = async () => {
    if (!selectedAssessmentId) return;
    setIsSavingOrRecalculating(true);
    setBannerMsg(null);
    try {
      const res = await fetch(`/api/hitl/assessments/${selectedAssessmentId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          expected_revision: hitlState?.assessment?.revision,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBannerMsg({ type: 'error', text: data.error });
      } else {
        setHitlState(data.state);
        await loadAssessmentsList(selectedAssessmentId, selectedUnitId);
        setBannerMsg({ type: 'success', text: data.message });
      }
    } finally {
      setIsSavingOrRecalculating(false);
    }
  };

  const handleCheckerApprove = async () => {
    if (!selectedAssessmentId) return;
    setIsSavingOrRecalculating(true);
    setBannerMsg(null);
    try {
      const res = await fetch(`/api/hitl/assessments/${selectedAssessmentId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          expected_revision: hitlState?.assessment?.revision,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBannerMsg({ type: 'error', text: data.error });
      } else {
        setHitlState(data.state);
        await loadAssessmentsList(selectedAssessmentId, selectedUnitId);
        setBannerMsg({ type: 'success', text: data.message });
      }
    } finally {
      setIsSavingOrRecalculating(false);
    }
  };

  const handleCheckerReturn = async () => {
    if (!selectedAssessmentId || !returnReasonText.trim()) {
      setBannerMsg({ type: 'error', text: 'يرجى إدخال سبب الإعادة للتعديل.' });
      return;
    }
    setIsSavingOrRecalculating(true);
    setBannerMsg(null);
    try {
      const res = await fetch(`/api/hitl/assessments/${selectedAssessmentId}/return`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          expected_revision: hitlState?.assessment?.revision,
          return_reason: returnReasonText.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBannerMsg({ type: 'error', text: data.error });
      } else {
        setHitlState(data.state);
        setShowReturnModal(false);
        setReturnReasonText('');
        await loadAssessmentsList(selectedAssessmentId, selectedUnitId);
        setBannerMsg({ type: 'success', text: data.message });
      }
    } finally {
      setIsSavingOrRecalculating(false);
    }
  };

  const handleCreateManualDraft = async () => {
    setIsSavingOrRecalculating(true);
    setBannerMsg(null);
    try {
      const res = await fetch('/api/hitl/assessments/create-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ unit_id: selectedUnitId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBannerMsg({ type: 'error', text: data.error });
      } else {
        const newId = data.state.assessment.id;
        await loadAssessmentsList(newId, selectedUnitId);
        setHitlState(data.state);
        setBannerMsg({ type: 'success', text: data.message });
      }
    } finally {
      setIsSavingOrRecalculating(false);
    }
  };

  const handleCreateDraftFromApproved = async () => {
    if (!selectedAssessmentId) return;
    setIsSavingOrRecalculating(true);
    setBannerMsg(null);
    try {
      const res = await fetch(
        `/api/hitl/assessments/${selectedAssessmentId}/create-draft-from-approved`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({}),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setBannerMsg({ type: 'error', text: data.error });
      } else {
        const newId = data.state.assessment.id;
        await loadAssessmentsList(newId, selectedUnitId);
        setHitlState(data.state);
        setBannerMsg({ type: 'success', text: data.message });
      }
    } finally {
      setIsSavingOrRecalculating(false);
    }
  };

  const handleOfficialExport = async () => {
    if (!token || !selectedAssessmentId) return;
    setBannerMsg(null);
    setIsSavingOrRecalculating(true);
    try {
      const response = await fetch(`/api/hitl/assessments/${encodeURIComponent(selectedAssessmentId)}/export-xlsx`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error || 'تعذر تصدير ملف Excel.');
      }
      const blob = await response.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      // Respect the backend's Business Unit + real approval-date file name.
      const disposition = response.headers.get('Content-Disposition') || '';
      const encodedFilename = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
      const plainFilename = disposition.match(/filename="([^"]+)"/i)?.[1];
      let exportedName = plainFilename || `RCSA_${selectedUnitId}_date-unavailable.xlsx`;
      if (encodedFilename) {
        try { exportedName = decodeURIComponent(encodedFilename); } catch { /* use the ASCII fallback */ }
      }
      link.download = exportedName;
      link.click();
      URL.revokeObjectURL(downloadUrl);
    } catch (error: any) {
      setBannerMsg({ type: 'error', text: error.message });
    } finally {
      setIsSavingOrRecalculating(false);
    }
  };

  const handleOfficialPdfExport = async () => {
    if (!token || !selectedAssessmentId) return;
    setBannerMsg(null);
    setIsSavingOrRecalculating(true);
    try {
      const response = await fetch(
        `/api/hitl/assessments/${encodeURIComponent(selectedAssessmentId)}/export-pdf`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || 'تعذر تصدير ملف PDF الرسمي.');
      }
      const blob = await response.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      const disposition = response.headers.get('Content-Disposition') || '';
      const encodedFilename = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
      const plainFilename = disposition.match(/filename="([^"]+)"/i)?.[1];
      let exportedName = plainFilename || `RCSA_${selectedUnitId}_Official_Report.pdf`;
      if (encodedFilename) {
        try {
          exportedName = decodeURIComponent(encodedFilename);
        } catch {
          // keep fallback
        }
      }
      link.download = exportedName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(downloadUrl);
      setBannerMsg({
        type: 'success',
        text: `تم تصدير وتنزيل تقرير PDF الرسمي بنجاح (${exportedName}).`,
      });
    } catch (error: any) {
      setBannerMsg({ type: 'error', text: error.message });
    } finally {
      setIsSavingOrRecalculating(false);
    }
  };

  const renderSeverityBadge = (rating?: string | null) => {
    const clean = rating ? String(rating).trim().replace('اً', '') : '';
    switch (clean) {
      case 'L':
        return (
          <span className="inline-block whitespace-nowrap px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
            منخفض (L)
          </span>
        );
      case 'M':
        return (
          <span className="inline-block whitespace-nowrap px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
            متوسط (M)
          </span>
        );
      case 'H':
        return (
          <span className="inline-block whitespace-nowrap px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-100 text-orange-900 border border-orange-300">
            مرتفع (H)
          </span>
        );
      case 'VH':
        return (
          <span className="inline-block whitespace-nowrap px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-900 border border-rose-300">
            مرتفع جداً (VH)
          </span>
        );
      case 'C':
        return (
          <span className="inline-block whitespace-nowrap px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-900 border border-rose-300">
            حرج (C)
          </span>
        );
      default:
        return (
          <span className="inline-block whitespace-nowrap px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-900 border border-amber-300">
            PENDING_INPUT
          </span>
        );
    }
  };

  const renderProvenanceBadge = (provKey?: string) => {
    const info = PROVENANCE_LABELS_AR[provKey || 'ORIGINAL_SOURCE_VALUE'] || PROVENANCE_LABELS_AR.ORIGINAL_SOURCE_VALUE;
    return (
      <HoverTooltip title={info.code} description={info.desc}>
        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border cursor-help ${info.cls}`}>
          {info.text}
        </span>
      </HoverTooltip>
    );
  };

  const unitAssessments = assessments.filter(a => a.unit_id === selectedUnitId);
  const readiness = hitlState?.readiness;
  const calc = currentRiskObj?.calculated_output || {};
  const prevCalc = currentRiskObj?.previous_calculated_output || null;
  const orig = currentRiskObj?.original_source || {};
  const pkg = currentRiskObj?.package || {};
  const provMap = currentRiskObj?.provenance_map || {};
  const sugDecisions = currentRiskObj?.suggestion_decisions || {};

  return (
    <div className="space-y-5 animate-in fade-in duration-300 font-['Cairo'] text-right" dir="rtl">
      {/* Official RCSA Report Preview & Export Modal (PDF / Excel / A3 Print) */}
      <OfficialRcsaReportModal
        assessmentId={selectedAssessmentId}
        unitId={selectedUnitId}
        token={token}
        isOpen={showOfficialReportModal}
        onClose={() => setShowOfficialReportModal(false)}
        onExportExcel={handleOfficialExport}
      />

      <CreateBusinessUnitModal
        isOpen={showAddUnitModal}
        onClose={() => setShowAddUnitModal(false)}
        existingUnitCodes={businessUnits.map((b) => b.code)}
        onUnitCreated={(newUnit) => {
          setBusinessUnits((prev) => {
            if (prev.some((b) => b.id === newUnit.id)) return prev;
            return [...prev, newUnit];
          });
          setSessionInfo(null);
          setSelectedAssessmentId('');
          setHitlState(null);
          setSelectedUnitId(newUnit.id);
          loadAssessmentsList(undefined, newUnit.id, true);
        }}
      />

      {/* Unified Workflow Session Breadcrumb & Navigation Banner (Phase 3A) */}
      {sessionInfo && (
        <div className="bg-[#09331F] text-white p-3.5 rounded-2xl border-2 border-[#F79C1E] shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="px-2.5 py-0.5 rounded-full bg-[#006547] text-[#F79C1E] text-xs font-bold border border-[#F79C1E]/40 font-mono">
              جلسة عمل موحدة: {sessionInfo.id}
            </span>
            <div className="text-xs">
              <span className="font-bold">{sessionInfo.session_title}</span>
              <span className="text-emerald-200 mr-2">
                ({sessionInfo.workflow_mode === 'NEW' ? 'تقييم جديد' : 'تحديث تقييم سابق'})
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigate?.({
              page: 'backend-rcsa',
              unitId: selectedUnitId,
              sessionId: sessionInfo.id,
              mode: sessionInfo.workflow_mode,
            })}
            className="px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-[#F79C1E] hover:text-white text-xs font-bold flex items-center gap-1.5 transition-colors shrink-0 cursor-pointer"
          >
            <ChevronRight className="w-3.5 h-3.5" />
            <span>العودة إلى إعداد التقييم الموجه</span>
          </button>
        </div>
      )}

      {/* 1. Top Header: Business Unit, Assessment Version & Maker-Checker Workflow Controls */}
      <div className="bg-white p-5 rounded-xl border border-[#DCDAD5] shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-xl font-bold text-slate-900">
                مصفوفة تقييم المخاطر والضوابط
              </h2>
              {hitlState?.assessment && (() => {
                const currentAsmRow = assessments.find((a: any) => a.id === hitlState.assessment.id);
                const ts = currentAsmRow?.timestamps || getAssessmentTimestampDetails({
                  id: hitlState.assessment.id,
                  status: hitlState.assessment.status,
                  workflow_status: workflowStatus,
                  title_ar: hitlState.assessment.title_ar,
                  created_at: hitlState.assessment.created_at,
                  updated_at: hitlState.assessment.updated_at,
                  submitted_at: hitlState.assessment.submitted_at,
                  approved_at: hitlState.assessment.approved_at,
                });
                return (
                  <>
                    <span
                      data-testid="workflow-status-badge"
                      className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                        workflowStatus === 'APPROVED'
                          ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                          : workflowStatus === 'IN_REVIEW'
                            ? 'bg-amber-100 text-amber-900 border-amber-300'
                            : workflowStatus === 'RETURNED_FOR_CHANGES'
                              ? 'bg-rose-100 text-rose-900 border-rose-300'
                              : 'bg-sky-100 text-sky-900 border-sky-300'
                      }`}
                    >
                      {formatWorkflowStatusAr(workflowStatus, hitlState.assessment.status)} — ({ts.primary_date_badge_ar})
                    </span>
                    {hitlState.assessment.immutable_snapshot && (
                      <span className="px-2 py-0.5 rounded bg-[#09331F] text-emerald-200 text-[10px] font-mono">
                        SHA-256: {hitlState.assessment.immutable_snapshot.cryptographic_sha256.slice(0, 12)}...
                      </span>
                    )}
                  </>
                );
              })()}
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              <p className="text-xs text-slate-600">
                مراجعة المخاطر والضوابط وتوثيق القرارات.
              </p>
              <InfoHint
                title="سجل RCSA الرسمي (29 عموداً)"
                description="اختر أي مخاطرة من الجدول لاستعراض حساباتها الماليّة، تعديل ضوابطها، أو استكمال الأثر غير المالي (NFI) وESG."
              />
            </div>
          </div>

          {/* Workflow Action Buttons */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <HoverTooltip title="سجل التقييمات والمقارنة" description="فتح صفحة وحدات العمل لاستعراض النسخ التاريخية والمقارنة الزمنية لهذه الوحدة." side="bottom">
              <button
                type="button"
                onClick={() => onNavigate?.({ page: 'business-units', unitId: selectedUnitId })}
                className="min-h-8 px-2.5 py-1 rounded-xl bg-[#F8F8F6] hover:bg-[#EFECE6] text-[#09331F] border border-[#DCDAD5] text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
              >
                <History className="w-3.5 h-3.5 text-[#006547]" />
                <span>سجل الوحدة</span>
              </button>
            </HoverTooltip>

            <HoverTooltip title="معاينة الأعمدة الرسمية" description="إظهار أو إخفاء جدول القراءة فقط مطابقاً لترتيب أعمدة RCSA الرسمية (من C إلى AE)." side="bottom">
              <button
                type="button"
                onClick={() => setShowOfficialPreview(prev => !prev)}
                data-testid="toggle-readiness-preview-btn"
                className="min-h-8 px-2.5 py-1 rounded-xl bg-[#F8F8F6] hover:bg-[#EFECE6] text-slate-900 border border-[#DCDAD5] text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-[#006547]" />
                <span>{showOfficialPreview ? 'إخفاء الأعمدة الرسمية' : 'الأعمدة الرسمية'}</span>
              </button>
            </HoverTooltip>

            {isEditableDraft && (
              <>
                <HoverTooltip title="حفظ المسودة الحالية" description="حفظ كافة التعديلات غير المرسلة على الخادم مع تسجيل أثر التدقيق." side="bottom">
                  <button
                    type="button"
                    disabled={isSavingOrRecalculating}
                    onClick={handleSaveDraft}
                    data-testid="save-draft-btn"
                    className="min-h-8 px-3 py-1 rounded-xl bg-[#09331F] hover:bg-[#006547] text-white text-xs font-bold flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5 text-[#F79C1E]" />
                    <span>حفظ المسودة</span>
                  </button>
                </HoverTooltip>
                <HoverTooltip title="إرسال للمراجع المستقل (Checker)" description="تجميد التعديلات وإرسال التقييم للمراجعة والاعتماد الرسمي." side="bottom">
                  <button
                    type="button"
                    disabled={isSavingOrRecalculating}
                    onClick={handleSubmitForReview}
                    data-testid="submit-for-review-btn"
                    className="min-h-8 px-3 py-1 rounded-xl bg-sky-700 hover:bg-sky-800 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>إرسال للمراجعة</span>
                  </button>
                </HoverTooltip>
              </>
            )}

            {workflowStatus === 'IN_REVIEW' && isCheckerOrAdmin && (
              <>
                <HoverTooltip title="إعادة التقييم لمعده (Maker)" description="إرجاع التقييم مع تسجيل الملاحظات الرقابية المطلوب تعديلها." side="bottom">
                  <button
                    type="button"
                    disabled={isSavingOrRecalculating}
                    onClick={() => setShowReturnModal(true)}
                    data-testid="checker-return-btn"
                    className="min-h-8 px-3 py-1 rounded-xl bg-rose-100 hover:bg-rose-200 text-rose-900 border border-rose-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>إعادة للتعديل</span>
                  </button>
                </HoverTooltip>
                <HoverTooltip title="اعتماد التقييم رسمياً" description="قفل النسخة نهائياً بختم SHA-256 غير قابل للتعديل وإصدار التقارير الرسمية." side="bottom">
                  <button
                    type="button"
                    disabled={isSavingOrRecalculating}
                    onClick={handleCheckerApprove}
                    data-testid="checker-approve-btn"
                    className="min-h-8 px-3 py-1 rounded-xl bg-[#006547] hover:bg-[#09331F] text-white text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer"
                  >
                    <UserCheck className="w-3.5 h-3.5 text-[#F79C1E]" />
                    <span>اعتماد رسمي</span>
                  </button>
                </HoverTooltip>
              </>
            )}

            {selectedAssessmentId && (
              <>
                <HoverTooltip title="معاينة التقرير الرسمي" description="فتح نافذة معاينة التقرير التنفيذي الكامل للطباعة أو التصدير (PDF / Excel)." side="bottom">
                  <button
                    type="button"
                    disabled={isSavingOrRecalculating}
                    onClick={() => setShowOfficialReportModal(true)}
                    data-testid="open-official-report-modal-btn"
                    className="min-h-8 px-3 py-1 rounded-xl bg-[#09331F] hover:bg-[#006547] text-white border border-[#F79C1E]/50 text-xs font-bold flex items-center gap-1.5 shadow-xs disabled:opacity-60 cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5 text-[#F79C1E]" />
                    <span>معاينة التقرير</span>
                  </button>
                </HoverTooltip>

                <HoverTooltip title={workflowStatus === 'APPROVED' ? 'تصدير PDF المعتمد' : 'تصدير PDF (مسودة)'} description="توليد وتنزيل نسخة PDF منسقة للعرض والطباعة." side="bottom">
                  <button
                    type="button"
                    disabled={isSavingOrRecalculating}
                    onClick={handleOfficialPdfExport}
                    data-testid="export-pdf-btn"
                    className="min-h-8 px-3 py-1 rounded-xl bg-[#09331F] hover:bg-[#006547] text-white border border-[#006547] text-xs font-bold flex items-center gap-1.5 shadow-xs disabled:opacity-60 cursor-pointer"
                  >
                    <FileText className="w-3.5 h-3.5 text-[#F79C1E]" />
                    <span>{workflowStatus === 'APPROVED' ? 'PDF المعتمد' : 'PDF مسودة'}</span>
                  </button>
                </HoverTooltip>

                <HoverTooltip title={workflowStatus === 'APPROVED' ? 'تصدير Excel المعتمد' : 'تنزيل Excel للمراجعة'} description="تنزيل مصنف Excel رسمي مطابق لنموذج البنك (29 عموداً مع الصيغ)." side="bottom">
                  <button
                    type="button"
                    disabled={isSavingOrRecalculating}
                    onClick={handleOfficialExport}
                    data-testid="export-excel-btn"
                    className="min-h-8 px-3 py-1 rounded-xl bg-[#F8F8F6] hover:bg-[#EFECE6] text-[#09331F] border border-[#DCDAD5] text-xs font-bold flex items-center gap-1.5 disabled:opacity-60 cursor-pointer"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-[#006547]" />
                    <span>{workflowStatus === 'APPROVED' ? 'Excel المعتمد' : 'Excel مسودة'}</span>
                  </button>
                </HoverTooltip>
              </>
            )}

            {workflowStatus === 'APPROVED' && isMakerOrAdmin && (
              <HoverTooltip title="إنشاء دورة مراجعة جديدة" description="نسخ هذه النسخة المعتمدة إلى مسودة جديدة قابلة للتعديل مع حفظ الأصل دون تغيير." side="bottom">
                <button
                  type="button"
                  disabled={isSavingOrRecalculating}
                  onClick={handleCreateDraftFromApproved}
                  data-testid="create-draft-from-approved-btn"
                  className="min-h-8 px-3 py-1 rounded-xl bg-[#006547] hover:bg-[#09331F] text-white text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <GitBranch className="w-3.5 h-3.5 text-[#F79C1E]" />
                  <span>مسودة من المعتمد</span>
                </button>
              </HoverTooltip>
            )}
          </div>
        </div>

        {/* Selectors Row: Business Unit & Assessment Selector */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
          <div className="md:col-span-5 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-[#006547] shrink-0" />
            <label className="text-xs font-bold text-slate-700 shrink-0">الوحدة:</label>
            <select
              data-testid="bu-selector"
              value={selectedUnitId}
              onChange={e => {
                const newBu = e.target.value;
                if (newBu === 'OTHER') {
                  setShowAddUnitModal(true);
                  return;
                }
                setSessionInfo(null);
                setSelectedAssessmentId('');
                setHitlState(null);
                setSelectedUnitId(newBu);
                loadAssessmentsList(undefined, newBu, true);
              }}
              className="w-full px-3 py-1.5 text-xs font-bold border border-slate-300 rounded-lg bg-[#F8F8F6] text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#006547]"
            >
              {businessUnits.map((b, idx) => (
                <option key={`bu-${b.id || idx}`} value={b.id}>
                  {b.name_ar} ({b.code})
                </option>
              ))}
              <option value="OTHER">أخرى</option>
            </select>
            <HoverTooltip title="إضافة وحدة جديدة" description="تسجيل وحدة تنظيمية جديدة وإضافتها للقائمة فوراً.">
              <button
                type="button"
                data-testid="table-add-unit-btn"
                onClick={() => setShowAddUnitModal(true)}
                className="px-2.5 py-1.5 rounded-lg bg-[#006547] hover:bg-[#09331F] text-white text-xs font-bold flex items-center gap-1 shrink-0 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-[#F79C1E]" />
                <span>وحدة</span>
              </button>
            </HoverTooltip>
          </div>

          <div className="md:col-span-5 flex items-center gap-2">
            <Layers className="w-4 h-4 text-[#006547] shrink-0" />
            <label className="text-xs font-bold text-slate-700 shrink-0">التقييم:</label>
            <select
              data-testid="assessment-selector"
              value={selectedAssessmentId}
              onChange={e => {
                const nextId = e.target.value;
                if (nextId === 'OTHER') {
                  if (isMakerOrAdmin) handleCreateManualDraft();
                  return;
                }
                setSelectedAssessmentId(nextId);
                onNavigate?.({ page: 'rcsa-table', unitId: selectedUnitId, assessmentId: nextId }, true);
              }}
              className="w-full px-3 py-1.5 text-xs font-bold border border-slate-300 rounded-lg bg-[#F8F8F6] text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#006547]"
            >
              {unitAssessments.map((a: any, idx: number) => (
                <option key={`asm-${a.id || idx}`} value={a.id}>
                  {a.timestamps?.primary_version_label_ar ||
                    `${a.clean_title_ar || a.title_ar || a.title} — [${formatWorkflowStatusAr(a.workflow_status, a.status)}]`}
                </option>
              ))}
              {unitAssessments.length === 0 && <option key="asm-empty" value="">لم يتم إنشاء تقييم لهذه الوحدة بعد</option>}
              <option value="OTHER">أخرى</option>
            </select>
          </div>

          <div className="md:col-span-2 flex justify-end">
            {isMakerOrAdmin && (
              <HoverTooltip title="مسودة يدوية جديدة" description="فتح مسودة تقييم جديدة فارغة للوحدة المختارة لملئها يدوياً." className="block w-full">
                <button
                  type="button"
                  onClick={handleCreateManualDraft}
                  data-testid="create-manual-draft-btn"
                  className="w-full px-3 py-1.5 rounded-xl bg-[#E2E6E3] hover:bg-[#D2DCD5] text-[#09331F] border border-[#006547]/40 text-xs font-bold flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>مسودة جديدة</span>
                </button>
              </HoverTooltip>
            )}
          </div>
        </div>

        {/* Return reason banner if returned by Checker */}
        {hitlState?.assessment?.return_reason && (
          <div className="p-3 rounded-xl bg-rose-100/90 border border-rose-300 text-xs text-rose-950 flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-700 shrink-0 mt-0.5" />
            <div>
              <strong>ملاحظات المراجع المستقل (Checker) لإعادة التعديل:</strong>{' '}
              {hitlState.assessment.return_reason}
            </div>
          </div>
        )}
      </div>

      {/* Checker Return Reason Modal */}
      {showReturnModal && (
        <div className="bg-rose-50 border border-rose-300 p-4 rounded-2xl text-rose-950 space-y-3 shadow-xs">
          <div className="text-xs font-bold flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-700" />
            <span>إعادة التقييم إلى معد التقييم (Maker) مع تسجيل الملاحظات الرقابية الإلزامية:</span>
          </div>
          <textarea
            rows={2}
            data-testid="checker-return-reason-input"
            value={returnReasonText}
            onChange={e => setReturnReasonText(e.target.value)}
            placeholder="اذكر سبب الإعادة أو التعديلات المطلوبة..."
            className="w-full p-2.5 text-xs bg-white border border-rose-200 rounded-xl text-slate-900"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowReturnModal(false)}
              className="px-3 py-1.5 rounded-lg bg-white border border-[#DCDAD5] text-xs font-bold text-slate-800 cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="button"
              data-testid="confirm-checker-return-btn"
              onClick={handleCheckerReturn}
              className="px-4 py-1.5 rounded-lg bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold cursor-pointer"
            >
              تأكيد الإعادة للتعديل
            </button>
          </div>
        </div>
      )}

      {/* Action Status Notification Banner */}
      {bannerMsg && (
        <div
          data-testid="hitl-action-banner"
          className={`p-3.5 rounded-xl text-xs font-bold flex items-center justify-between gap-3 border ${
            bannerMsg.type === 'success'
              ? 'bg-emerald-100/90 border-emerald-300 text-emerald-950'
              : bannerMsg.type === 'error'
                ? 'bg-rose-100/90 border-rose-300 text-rose-950'
                : 'bg-sky-100/90 border-sky-300 text-sky-950'
          }`}
        >
          <div className="flex items-center gap-2">
            {bannerMsg.type === 'success' ? (
              <CheckCircle className="w-4 h-4 text-emerald-700 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-700 shrink-0" />
            )}
            <span>{bannerMsg.text}</span>
          </div>
          <button onClick={() => setBannerMsg(null)} className="text-slate-600 hover:text-slate-900">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 2. Pre-Export Review Readiness Summary Strip (Phase 2D Section 9) */}
      {readiness && (
        <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-[#DCDAD5] shadow-sm space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 rounded-xl border border-[#E5E3DE] bg-[#F8F8F6]/70 divide-x divide-x-reverse divide-[#E5E3DE] text-center">
            <div className="p-2.5">
              <div className="text-[10px] text-slate-600 font-semibold inline-flex items-center gap-1 justify-center">
                <span>إجمالي المخاطر</span>
                <InfoHint title="إجمالي المخاطر" description="العدد الكلي لصفوف المخاطر المسجلة في مسودة التقييم الحالية." />
              </div>
              <div className="text-base font-bold font-mono tabular-nums text-slate-900 mt-0.5" data-testid="readiness-total-risks">
                {readiness.total_risks}
              </div>
            </div>
            <div className="p-2.5 bg-[#006547]/5">
              <div className="text-[10px] text-slate-700 font-semibold inline-flex items-center gap-1 justify-center">
                <span>المراجعة</span>
                <InfoHint title="المخاطر المراجعة" description="عدد المخاطر التي اعتمد المراجع مراجعتها ضمن المسودة." />
              </div>
              <div className="text-base font-bold font-mono tabular-nums text-[#006547] mt-0.5" data-testid="readiness-reviewed-risks">
                {readiness.reviewed_risks} / {readiness.total_risks}
              </div>
            </div>
            <div
              className={`p-2.5 ${
                readiness.risks_with_missing_inputs > 0
                  ? 'bg-amber-50/70 text-amber-950'
                  : ''
              }`}
            >
              <div className="text-[10px] font-semibold inline-flex items-center gap-1 justify-center">
                <span>قيد الاستيفاء</span>
                <InfoHint title="مدخلات ناقصة" description="مخاطر تفتقر لأثر مالي أو تكرار أو تقييم غير مالي مكتمل." />
              </div>
              <div className="text-base font-bold font-mono tabular-nums mt-0.5" data-testid="readiness-missing-inputs">
                {readiness.risks_with_missing_inputs}
              </div>
            </div>
            <div className="p-2.5">
              <div className="text-[10px] text-slate-600 font-semibold inline-flex items-center gap-1 justify-center">
                <span>قرارات بشرية</span>
                <InfoHint title="قرارات المراجع" description="مخاطر تنتظر قرار القبول النهائي أو مطابقة ESG أو فحص NFI." />
              </div>
              <div className="text-base font-bold font-mono tabular-nums text-amber-800 mt-0.5">
                {readiness.risks_requiring_human_decisions}
              </div>
            </div>
            <div className="p-2.5">
              <div className="text-[10px] text-slate-600 font-semibold inline-flex items-center gap-1 justify-center">
                <span>الحساب المالي</span>
                <InfoHint title="اكتمال الحساب المالي" description="عدد المخاطر التي اكتمل احتساب الخسارة السنوية والمتبقية لها عبر محرك بايثون." />
              </div>
              <div className="text-base font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                {readiness.financial_calculation_completeness.completed}/{readiness.total_risks}
              </div>
            </div>
            <div className="p-2.5">
              <div className="text-[10px] text-slate-600 font-semibold inline-flex items-center gap-1 justify-center">
                <span>تقييم الضوابط</span>
                <InfoHint title="اكتمال الضوابط" description="المخاطر التي حُسمت فيها فاعلية الضوابط وأهليتها لحساب MAX RRF." />
              </div>
              <div className="text-base font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                {readiness.control_assessment_completeness.completed}/{readiness.total_risks}
              </div>
            </div>
            <div className="p-2.5">
              <div className="text-[10px] text-slate-600 font-semibold inline-flex items-center gap-1 justify-center">
                <span>مقترحات الذكاء</span>
                <InfoHint title="مقترحات AI المعلقة" description="عدد التوصيات المقترحة التي لم يبت فيها المراجع بالقبول أو التعديل أو الرفض." />
              </div>
              <div className="text-base font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                {readiness.pending_ai_suggestions_count}
              </div>
            </div>
            <div className="p-2.5">
              <div className="text-[10px] text-slate-600 font-semibold inline-flex items-center gap-1 justify-center">
                <span>الجاهزية</span>
                <InfoHint title="جاهزية الاعتماد والتصدير" description="مؤشر تحقق شروط الاعتماد النهائي وإصدار ملفات RCSA الرسمية." />
              </div>
              <div className="text-xs font-bold mt-1">
                {readiness.is_ready_for_final_approval ? (
                  <span className="text-emerald-800">جاهز ✓</span>
                ) : (
                  <span className="text-amber-800">قيد الاستكمال</span>
                )}
              </div>
            </div>
          </div>

          {/* Official NBE Column Preview Table (When toggled) */}
          {showOfficialPreview && (
            <div
              data-testid="official-column-preview-panel"
              className="p-4 rounded-xl bg-[#F8F8F6] border border-[#E5E3DE] space-y-3"
            >
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    معاينة القراءة فقط وفق ترتيب أعمدة نموذج RCSA الرسمي للبنك (الأعمدة C إلى AE)
                  </h3>
                  <p className="text-[11px] text-slate-600">
                    توضح المعاينة البيانات المحسوبة وقرارات المراجعة، وتظهر القيم غير المستوفاة بوضوح.
                  </p>
                </div>
                <div className="flex gap-1.5 flex-wrap text-[10px]">
                  <span className="px-2 py-0.5 rounded bg-white border border-[#DCDAD5] text-slate-800 font-mono">
                    NFI: يُستكمل بالمراجعة
                  </span>
                  <span className="px-2 py-0.5 rounded bg-white border border-[#DCDAD5] text-slate-800 font-mono">
                    قرار القبول (AA): مراجعة بشرية
                  </span>
                  <span className="px-2 py-0.5 rounded bg-white border border-[#DCDAD5] text-slate-800 font-mono">
                    ESG: طبقًا للكتالوج المرجعي
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-[#DCDAD5]">
                <table className="w-full text-right text-[11px] bg-white">
                  <thead className="bg-[#09331F] text-white">
                    <tr>
                      <th className="p-2">م (C)</th>
                      <th className="p-2">النشاط / العملية (D)</th>
                      <th className="p-2">الهدف الاستراتيجي (E)</th>
                      <th className="p-2">وصف المخاطرة (G)</th>
                      <th className="p-2">NFI متلازم (H)</th>
                      <th className="p-2">التكرار (I)</th>
                      <th className="p-2">الأثر الفردي (J)</th>
                      <th className="p-2">الخسارة السنوية (K)</th>
                      <th className="p-2">المتلازم (L)</th>
                      <th className="p-2">الضوابط (M..R)</th>
                      <th className="p-2">MAX RRF (S)</th>
                      <th className="p-2">المتبقي بالجنيه (T)</th>
                      <th className="p-2">المتبقي (U)</th>
                      <th className="p-2">NFI متبقي (V..Z)</th>
                      <th className="p-2">القبول النهائي (AA)</th>
                      <th className="p-2">الإجراء التصحيحي (AB)</th>
                      <th className="p-2">الأساس المنطقي (AC)</th>
                      <th className="p-2">المستوى الأول (AD)</th>
                      <th className="p-2">ESG (AE)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#CECCC9]">
                    {(readiness.official_column_preview_rows || []).map((pr: any) => {
                      const isSelected = pr.risk_id === selectedRiskId;
                      return (
                        <tr
                          key={pr.risk_id}
                          onClick={() => setSelectedRiskId(pr.risk_id)}
                          className={`cursor-pointer transition-colors ${
                            isSelected ? 'bg-emerald-50/90 font-semibold' : 'hover:bg-[#F8F8F6]'
                          }`}
                          title="انقر لتعديل ومراجعة هذه المخاطرة وضوابطها في مساحة العمل بالأسفل"
                        >
                          <td className="p-2 font-mono font-bold">{pr.C_risk_number}</td>
                          <td className="p-2 max-w-36 truncate" title={pr.D_process_ar}>
                            {pr.D_process_ar}
                          </td>
                          <td className="p-2 max-w-36 truncate" title={pr.E_strategic_objective_ar}>
                            {pr.E_strategic_objective_ar}
                          </td>
                          <td className="p-2 max-w-52 truncate" title={pr.G_risk_description_ar}>
                            {pr.G_risk_description_ar}
                          </td>
                          <td className="p-2 text-xs">{pr.H_inherent_nfi_status === 'YES' ? 'نعم' : pr.H_inherent_nfi_status === 'NO' ? 'لا' : 'قيد الاستيفاء'}</td>
                          <td className="p-2">{pr.I_expected_frequency_ar}</td>
                          <td className="p-2 font-mono">{pr.J_individual_financial_impact_egp}</td>
                          <td className="p-2 font-mono font-bold">{pr.K_expected_annual_loss_egp}</td>
                          <td className="p-2 font-bold">{pr.L_inherent_financial_rating}</td>
                          <td className="p-2">
                            {pr.M_to_R_controls.length} ضوابط
                          </td>
                          <td className="p-2 font-mono font-bold text-[#006547]">{pr.S_selected_max_rrf}</td>
                          <td className="p-2 font-mono font-bold">{pr.T_residual_financial_loss_egp}</td>
                          <td className="p-2 font-bold">{pr.U_residual_financial_rating}</td>
                          <td className="p-2 text-xs" title={`خدمة: ${pr.V_to_Z_residual_nfi_dimensions.V_service}، سمعة: ${pr.V_to_Z_residual_nfi_dimensions.W_reputation}، رقابي: ${pr.V_to_Z_residual_nfi_dimensions.X_regulatory}، قانوني: ${pr.V_to_Z_residual_nfi_dimensions.Y_legal}`}>{pr.V_to_Z_residual_nfi_dimensions.Z_overall_nfi}</td>
                          <td className="p-2 text-xs">{pr.AA_final_risk_acceptance}</td>
                          <td className="p-2 max-w-48 truncate" title={pr.AB_corrective_action_ar}>
                            {pr.AB_corrective_action_ar}
                          </td>
                          <td className="p-2 max-w-56 truncate" title={pr.AC_assessment_rationale_ar}>
                            {pr.AC_assessment_rationale_ar}
                          </td>
                          <td className="p-2 max-w-36 truncate">{pr.AD_level1_category_ar}</td>
                          <td className="p-2 text-xs">{pr.AE_esg_classification}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3. RCSA Risk Register Table with Search & Review Filters */}
      <div className="bg-white rounded-xl border border-[#DCDAD5] shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-[#F8F8F6] flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-500 absolute right-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="بحث بمعرف المخاطرة، النشاط، أو الوصف..."
              className="w-full pr-9 pl-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#006547]"
            />
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <Filter className="w-3.5 h-3.5 text-slate-500" />
            {[
              { id: 'ALL', label: 'الكل' },
              { id: 'MISSING_INPUTS', label: 'مدخلات قيد الاستيفاء' },
              { id: 'DISCREPANCIES', label: 'فروق مرجعية ونطاقية' },
              { id: 'UNREVIEWED', label: 'لم تراجع بعد' },
              { id: 'REVIEWED', label: 'تمت مراجعتها' },
            ].map(f => (
              <button
                key={f.id}
                type="button"
                onClick={() => setListFilter(f.id as any)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                  listFilter === f.id
                    ? 'bg-[#006547] text-white'
                    : 'bg-white border border-[#DCDAD5] text-slate-700 hover:bg-[#EFECE6]'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-[11px]">
            <thead className="bg-[#09331F] text-white">
              <tr>
                <th className="px-2 py-2.5 font-bold whitespace-nowrap">
                  <HoverTooltip title="معرف المخاطرة (C)" description="الرمز الفريد للمخاطرة وصفوف الضوابط المرتبطة بها في السجل الرسمي." side="bottom">
                    <span className="cursor-help">المخاطرة</span>
                  </HoverTooltip>
                </th>
                <th className="px-2 py-2.5 font-bold">
                  <HoverTooltip title="النشاط / العملية (D/F)" description="النشاط التشغيلي أو العملية البنكية التي تنشأ ضمنها المخاطرة." side="bottom">
                    <span className="cursor-help">النشاط (D/F)</span>
                  </HoverTooltip>
                </th>
                <th className="px-2 py-2.5 font-bold">
                  <HoverTooltip title="وصف المخاطرة (G)" description="التوصيف الدلالي للسبب والحدث والأثر وفق معايير البنك." side="bottom">
                    <span className="cursor-help">وصف المخاطرة (G)</span>
                  </HoverTooltip>
                </th>
                <th className="px-2 py-2.5 font-bold whitespace-nowrap">
                  <HoverTooltip title="الأثر المالي الفردي (J)" description="قيمة الخسارة المقدرة بالجنيه المصري عند وقوع الحادثة الواحدة." side="bottom">
                    <span className="cursor-help">الأثر الفردي (J)</span>
                  </HoverTooltip>
                </th>
                <th className="px-2 py-2.5 font-bold whitespace-nowrap">
                  <HoverTooltip title="التكرار المتوقع (I)" description="معدل تكرار حدوث المخاطرة سنوياً ومعامل الضرب السنوي." side="bottom">
                    <span className="cursor-help">التكرار (I)</span>
                  </HoverTooltip>
                </th>
                <th className="px-2 py-2.5 font-bold whitespace-nowrap">
                  <HoverTooltip title="الخسارة السنوية المتوقعة (K)" description="حاصل ضرب الأثر الفردي (J) × معامل التكرار السنوي (I) قبل الضوابط." side="bottom">
                    <span className="cursor-help">الخسارة السنوية (K)</span>
                  </HoverTooltip>
                </th>
                <th className="px-2 py-2.5 font-bold whitespace-nowrap">
                  <HoverTooltip title="التقييم المالي الكامن (L)" description="تصنيف شدة الخطر الكامن (L / M / H / VH / C) بناءً على الخسارة السنوية الكامنة." side="bottom">
                    <span className="cursor-help">المتلازم (L)</span>
                  </HoverTooltip>
                </th>
                <th className="px-2 py-2.5 font-bold whitespace-nowrap">
                  <HoverTooltip title="أعلى معامل خفض للضوابط (MAX RRF - S)" description="أكبر نسبة خفض من الضوابط المطبقة والمؤهلة نطاقياً وفق مصفوفة 3×3 المعتمدة." side="bottom">
                    <span className="cursor-help">MAX RRF (S)</span>
                  </HoverTooltip>
                </th>
                <th className="px-2 py-2.5 font-bold whitespace-nowrap">
                  <HoverTooltip title="صافي الخطر المتبقي (T / U)" description="الخسارة المتبقية بالجنيه وتصنيفها بعد خصم معامل MAX RRF من الخسارة الكامنة." side="bottom">
                    <span className="cursor-help">المتبقي (T / U)</span>
                  </HoverTooltip>
                </th>
                <th className="px-2 py-2.5 font-bold whitespace-nowrap">
                  <HoverTooltip title="حالة المراجعة والتنبيهات" description="حالة اعتماد المخاطرة والتنبيهات المرجعية أو النطاقية المرتبطة بها." side="bottom">
                    <span className="cursor-help">الحالة والتنبيهات</span>
                  </HoverTooltip>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#CECCC9]">
              {filteredRisks.map(r => {
                const d = r.current_draft_input || {};
                const c = r.calculated_output || {};
                const o = r.original_source || {};
                const isSelected = r.risk_id === currentRiskObj?.risk_id;
                const hasWbRrfDiff =
                  c.workbook_reference_rrf !== null &&
                  c.workbook_reference_rrf !== undefined &&
                  c.effective_max_rrf !== null &&
                  Number(c.workbook_reference_rrf) !== Number(c.effective_max_rrf);

                const hasPendingCtrl = (c.controls_calculated || []).some(
                  (ctrl: any) =>
                    ctrl.implementation_status === 'IMPLEMENTED' &&
                    ctrl.effectiveness_classification === 'PENDING_REVIEW'
                );

                return (
                  <tr
                    key={r.risk_id}
                    data-testid={`risk-row-${r.risk_id}`}
                    onClick={() => setSelectedRiskId(r.risk_id)}
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-emerald-50/90 font-semibold'
                        : 'hover:bg-[#F8F8F6]'
                    }`}
                  >
                    <td className="px-2 py-2 font-mono font-bold text-slate-900 whitespace-nowrap">
                      <div dir="ltr" className="text-right">{r.risk_id}</div>
                      {o.control_rows?.length > 0 && (
                        <div className="text-[9px] text-slate-600 font-sans">
                          صفوف {o.control_rows[0]}..{o.control_rows[o.control_rows.length - 1]} ({o.control_rows.length} ضوابط)
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-2 font-semibold text-slate-800 max-w-28 truncate" title={d.process_name}>
                      {d.process_name}
                    </td>
                    <td className="px-2 py-2 text-slate-700 max-w-36 truncate" title={d.risk_description}>
                      {d.risk_description}
                    </td>
                    <td className="px-2 py-2 font-mono text-slate-900 whitespace-nowrap">
                      {c.individual_financial_impact_egp !== null
                        ? `${Number(c.individual_financial_impact_egp).toLocaleString()} جم`
                        : 'PENDING_INPUT'}
                    </td>
                    <td className="px-2 py-2 text-slate-700 font-semibold text-[10px] leading-tight max-w-24">
                      {c.normalized_frequency_label_ar || d.expected_frequency_text || 'PENDING_INPUT'}
                      {c.annual_frequency_multiplier ? ` (×${c.annual_frequency_multiplier})` : ''}
                    </td>
                    <td className="px-2 py-2 font-mono font-bold text-slate-900 whitespace-nowrap">
                      {c.expected_annual_loss_egp !== null
                        ? `${Number(c.expected_annual_loss_egp).toLocaleString()} جم`
                        : 'PENDING_INPUT'}
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap">{renderSeverityBadge(c.annualized_financial_rating)}</td>
                    <td className="px-2 py-2 font-mono whitespace-nowrap">
                      <div dir="ltr" className="font-bold text-[#006547] text-right text-[10px]">
                        {c.effective_max_rrf !== null
                          ? `${(Number(c.effective_max_rrf) * 100).toFixed(0)}% (${c.selected_max_rrf_control_id})`
                          : 'PENDING'}
                      </div>
                      {hasWbRrfDiff && (
                        <div className="text-[9px] text-amber-800 font-semibold font-sans">
                          مرجع الإكسيل S: {(Number(c.workbook_reference_rrf) * 100).toFixed(0)}%
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap">
                      <div className="font-mono font-bold text-slate-900 mb-0.5">
                        {c.residual_financial_amount_egp !== null
                          ? `${Number(c.residual_financial_amount_egp).toLocaleString()} جم`
                          : 'PENDING'}
                      </div>
                      {renderSeverityBadge(c.continuous_residual_rating)}
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap">
                      <div className="flex flex-col gap-0.5 items-start">
                        {r.is_reviewed ? (
                          <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-300">
                            تمت المراجعة ✓
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-slate-200 text-slate-700">
                            قيد المراجعة
                          </span>
                        )}
                        {hasPendingCtrl && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                            PENDING_REVIEW (P15)
                          </span>
                        )}
                        {(r.source_discrepancies || []).length > 0 && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-orange-100 text-orange-900 border border-orange-300">
                            {r.source_discrepancies.length} تنبيه مرجعي
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!isLoading && unitAssessments.length === 0 && (
                <tr>
                  <td colSpan={10} className="p-8 text-center bg-[#F8F8F6]">
                    <div className="max-w-lg mx-auto space-y-3">
                      <div className="text-sm font-bold text-[#09331F]">
                        لا توجد مسودة تقييم RCSA منشأة لهذه الوحدة التنظيمية بعد
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        يمكنك إنشاء مسودة تقييم يدوية مباشرة للوحدة المختارة، أو الانتقال إلى الوكيل الذكي لرفع أدلة العمل واستخلاص مصفوفة المخاطر والضوابط تلقائياً.
                      </p>
                      <div className="flex items-center justify-center gap-2.5 flex-wrap pt-1">
                        {isMakerOrAdmin && (
                          <button
                            type="button"
                            onClick={handleCreateManualDraft}
                            data-testid="empty-unit-create-draft-btn"
                            className="px-4 py-2 rounded-xl bg-[#006547] hover:bg-[#09331F] text-white text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer"
                          >
                            <Plus className="w-4 h-4 text-[#F79C1E]" />
                            <span>إنشاء مسودة RCSA لهذه الوحدة الآن</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onNavigate?.({ page: 'agent', unitId: selectedUnitId, sessionId: '' })}
                          className="px-4 py-2 rounded-xl bg-white hover:bg-[#EFECE6] text-[#09331F] border border-[#DCDAD5] text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                        >
                          <Sparkles className="w-4 h-4 text-[#006547]" />
                          <span>استنباط المصفوفة من المستندات بالوكيل الذكي</span>
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. Interactive Risk-by-Risk & Control-by-Control Review & Edit Workspace */}
      {currentRiskObj && (
        <div
          data-testid="risk-review-workspace"
          className="bg-white rounded-xl border-2 border-[#006547]/40 shadow-md overflow-hidden"
        >
          <Phase2CReviewPanel
            assessmentId={selectedAssessmentId || ''}
            riskId={currentRiskObj.risk_id}
            riskL1={currentRiskObj.current_draft_input?.taxonomy_l1_ar || ''}
            editable={isEditableDraft}
            onSaved={() => loadHitlAssessmentState(selectedAssessmentId, currentRiskObj.risk_id)}
          />
          {/* Workspace Header with Row-by-Row Navigation */}
          <div className="bg-[#09331F] text-white p-4 border-b-2 border-[#F79C1E] flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="px-3 py-1 rounded-lg bg-[#006547] text-[#F79C1E] font-mono font-bold text-sm border border-[#F79C1E]/40">
                {currentRiskObj.risk_id}
              </span>
              <div>
                <h3 className="text-base font-bold">
                  مساحة المراجعة والتعديل التفاعلي — {currentRiskObj.current_draft_input?.process_name}
                </h3>
                <div className="text-[11px] text-emerald-200 flex items-center gap-3 mt-0.5">
                  <span>
                    المخاطرة {currentRiskIndex + 1} من {allRisks.length}
                  </span>
                  {orig.excel_row && (
                    <span>
                      • صفوف ملف الإكسيل المرجعي: {orig.control_rows?.join(', ') || orig.excel_row}
                    </span>
                  )}
                  <span>
                    • الضوابط المرتبطة: {(currentRiskObj.current_draft_input?.controls || []).length} ضوابط
                  </span>
                </div>
              </div>
            </div>

            {/* Previous / Next Risk Navigation + Mark Reviewed Button */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                disabled={currentRiskIndex <= 0}
                onClick={handlePrevRisk}
                data-testid="prev-risk-btn"
                className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-30 text-xs font-bold flex items-center gap-1"
              >
                <ChevronRight className="w-4 h-4" />
                <span>المخاطرة السابقة</span>
              </button>
              <button
                type="button"
                disabled={currentRiskIndex >= allRisks.length - 1}
                onClick={handleNextRisk}
                data-testid="next-risk-btn"
                className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-30 text-xs font-bold flex items-center gap-1"
              >
                <span>المخاطرة التالية</span>
                <ChevronLeft className="w-4 h-4" />
              </button>

              {workflowStatus !== 'APPROVED' && (
                <button
                  type="button"
                  disabled={isSavingOrRecalculating}
                  onClick={() => handleToggleRiskReviewed(!currentRiskObj.is_reviewed)}
                  data-testid="mark-risk-reviewed-btn"
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors ${
                    currentRiskObj.is_reviewed
                      ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
                      : 'bg-[#F79C1E] text-slate-950 hover:bg-amber-400'
                  }`}
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>
                    {currentRiskObj.is_reviewed ? 'تمت مراجعة المخاطرة ✓' : 'اعتماد مراجعة هذه المخاطرة'}
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* Quick Risk Selector Bar */}
          <div className="bg-[#F8F8F6] px-4 py-2 border-b border-[#E5E3DE] flex items-center gap-1.5 overflow-x-auto">
            <span className="text-[11px] font-bold text-slate-700 ml-2 shrink-0">انتقال سريع:</span>
            {allRisks.map(r => (
              <button
                key={r.risk_id}
                type="button"
                data-testid={`quick-risk-pill-${r.risk_id}`}
                onClick={() => setSelectedRiskId(r.risk_id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold shrink-0 transition-all cursor-pointer tabular-nums ${
                  r.risk_id === currentRiskObj.risk_id
                    ? 'bg-[#006547] text-white shadow-xs'
                    : 'bg-white text-slate-800 border border-[#DCDAD5] hover:bg-[#EFECE6]'
                }`}
              >
                {r.risk_id} {r.is_reviewed ? '✓' : ''}
              </button>
            ))}
          </div>

          <div className="p-5 space-y-5">
            {/* A. Before-and-After Recalculation Diff Banner (When risk was recalculated) */}
            {prevCalc && (
              <div
                data-testid="before-after-recalc-diff"
                className="p-4 rounded-xl bg-[#E2E6E3] border-2 border-[#006547] space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-[#09331F] flex items-center gap-2">
                    <Calculator className="w-4 h-4 text-[#006547]" />
                    <span>مقارنة المخرجات قبل وبعد إعادة الاحتساب الفوري (محرك بايثون المعتمد):</span>
                  </div>
                  <span className="text-[10px] font-mono bg-[#006547] text-white px-2 py-0.5 rounded">
                    ISOLATED SINGLE-RISK RECALCULATION
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
                  <div className="p-2.5 rounded-lg bg-[#F0EFED] border border-[#C6C4C1]">
                    <div className="text-[10px] text-slate-600">الخسارة السنوية المتوقعة (K):</div>
                    <div className="font-mono mt-0.5">
                      <span className="line-through text-slate-500 ml-2">
                        {prevCalc.expected_annual_loss_egp !== null
                          ? `${Number(prevCalc.expected_annual_loss_egp).toLocaleString()} ج.م`
                          : 'PENDING'}
                      </span>
                      <span className="font-bold text-slate-900">
                        →{' '}
                        {calc.expected_annual_loss_egp !== null
                          ? `${Number(calc.expected_annual_loss_egp).toLocaleString()} ج.م (${calc.annualized_financial_rating})`
                          : 'PENDING'}
                      </span>
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-[#F0EFED] border border-[#C6C4C1]">
                    <div className="text-[10px] text-slate-600">معامل الخفض الأقصى (MAX RRF - S):</div>
                    <div className="font-mono mt-0.5">
                      <span className="line-through text-slate-500 ml-2">
                        {prevCalc.effective_max_rrf !== null ? prevCalc.effective_max_rrf : 'N/A'} (
                        {prevCalc.selected_max_rrf_control_id || '-'})
                      </span>
                      <span className="font-bold text-[#006547]">
                        → {calc.effective_max_rrf !== null ? calc.effective_max_rrf : 'N/A'} (
                        {calc.selected_max_rrf_control_id || '-'})
                      </span>
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-[#F0EFED] border border-[#C6C4C1]">
                    <div className="text-[10px] text-slate-600">صافي الخسارة المتبقية (T):</div>
                    <div className="font-mono mt-0.5">
                      <span className="line-through text-slate-500 ml-2">
                        {prevCalc.residual_financial_amount_egp !== null
                          ? `${Number(prevCalc.residual_financial_amount_egp).toLocaleString()} ج.م`
                          : 'PENDING'}
                      </span>
                      <span className="font-bold text-slate-900">
                        →{' '}
                        {calc.residual_financial_amount_egp !== null
                          ? `${Number(calc.residual_financial_amount_egp).toLocaleString()} ج.م`
                          : 'PENDING'}
                      </span>
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-[#F0EFED] border border-[#C6C4C1]">
                    <div className="text-[10px] text-slate-600">تصنيف الخطر المالي المتبقي (U):</div>
                    <div className="font-mono mt-0.5">
                      <span className="line-through text-slate-500 ml-2">
                        {prevCalc.continuous_residual_rating || 'PENDING'}
                      </span>
                      <span className="font-bold text-slate-900">
                        → {calc.continuous_residual_rating || 'PENDING'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* B. Source Discrepancies & Missing Data Completion Panel (Sections 3 & 6) */}
            {(currentRiskObj.source_discrepancies?.length > 0 ||
              (pkg.pending_missing_fields && pkg.pending_missing_fields.length > 0)) && (
              <div
                data-testid="source-discrepancies-panel"
                className="p-4 rounded-xl bg-[#EAE5D9] border border-amber-400 space-y-3"
              >
                <div className="text-xs font-bold text-amber-950 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-800 shrink-0" />
                  <span>
                    تنبيهات الفروق المرجعية واستكمال البيانات المفقودة (Source Discrepancies & Missing Data Completion):
                  </span>
                </div>

                <div className="space-y-2.5">
                  {(currentRiskObj.source_discrepancies || []).map((disc: any) => (
                    <div
                      key={disc.discrepancy_id}
                      data-testid={`discrepancy-card-${disc.discrepancy_id}`}
                      className="p-3.5 rounded-xl bg-[#F4F3F0] border border-[#C6C4C1] space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <span className="font-bold text-slate-900">{disc.title_ar}</span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                            disc.severity === 'PENDING_INPUT_BLOCKER'
                              ? 'bg-rose-100 text-rose-900 border border-rose-300'
                              : 'bg-amber-100 text-amber-900 border border-amber-300'
                          }`}
                        >
                          {disc.category}
                        </span>
                      </div>
                      <p className="text-slate-700 leading-relaxed">{disc.description_ar}</p>
                      <div className="text-[11px] text-[#006547] font-semibold">
                        الإجراء الموصى به: {disc.recommended_action_ar}
                      </div>

                      {/* Quick Action Buttons for Specific Discrepancies */}
                      {isEditableDraft && disc.category === 'PARTIAL_SCOPE_CONTROL_ELIGIBILITY' && (
                        <div className="pt-2 flex items-center gap-2 flex-wrap">
                          <button
                            type="button"
                            disabled={isSavingOrRecalculating}
                            data-testid="exclude-partial-scope-control-btn"
                            onClick={() => {
                              const updatedCtrls = Object.values(controlsForm).map((c: any) =>
                                c.control_id === disc.control_id
                                  ? { ...c, eligible_for_scope_override: false }
                                  : c
                              );
                              handleRecalculateRisk(
                                undefined,
                                updatedCtrls,
                                `استبعاد الضابط (${disc.control_id}) نطاقياً لأنه يغطي المراسلات الإلكترونية على Share Folder ولا يمنع فقد الأصول الورقية`
                              );
                            }}
                            className="px-3 py-1.5 rounded-lg bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold"
                          >
                            استبعاد الضابط ({disc.control_id}) نطاقياً وإعادة الاحتساب (MAX RRF: 0.90 → 0.75)
                          </button>
                          <button
                            type="button"
                            disabled={isSavingOrRecalculating}
                            data-testid="restore-partial-scope-control-btn"
                            onClick={() => {
                              const updatedCtrls = Object.values(controlsForm).map((c: any) =>
                                c.control_id === disc.control_id
                                  ? { ...c, eligible_for_scope_override: true }
                                  : c
                              );
                              handleRecalculateRisk(
                                undefined,
                                updatedCtrls,
                                `إعادة تضمين الضابط (${disc.control_id}) ضمن الأهلية النطاقية (MAX RRF = 0.90)`
                              );
                            }}
                            className="px-3 py-1.5 rounded-lg bg-[#E2E1DE] hover:bg-[#D5D4D0] text-slate-900 border border-[#B8B6B2] text-xs font-bold"
                          >
                            إبقاء الضابط مؤهلاً (MAX RRF = 0.90)
                          </button>
                        </div>
                      )}

                      {isEditableDraft &&
                        disc.category === 'FINANCIAL_IMPACT_VS_INCIDENT_LOSS' &&
                        disc.calculated_value?.highest_incident_loss_egp && (
                          <div className="pt-2 flex items-center gap-2 flex-wrap">
                            <button
                              type="button"
                              disabled={isSavingOrRecalculating}
                              data-testid="adopt-highest-incident-loss-btn"
                              onClick={() => {
                                handleRecalculateRisk(
                                  {
                                    ...riskForm,
                                    individual_financial_impact:
                                      disc.calculated_value.highest_incident_loss_egp,
                                    financial_value_origin: 'HIGHEST_RELEVANT_INCIDENT_LOSS',
                                    financial_evidence_justification: `اعتماد أعلى خسارة حادثة فردية مرتبطة (${disc.calculated_value.highest_incident_id}: ${Number(disc.calculated_value.highest_incident_loss_egp).toLocaleString()} ج.م)`,
                                  },
                                  undefined,
                                  `اعتماد أعلى خسارة حادثة فردية موثقة (${disc.calculated_value.highest_incident_id})`
                                );
                              }}
                              className="px-3 py-1.5 rounded-lg bg-[#006547] hover:bg-[#09331F] text-white text-xs font-bold"
                            >
                              اعتماد أعلى خسارة حادثة فردية ({Number(disc.calculated_value.highest_incident_loss_egp).toLocaleString()} ج.م من {disc.calculated_value.highest_incident_id}) وإعادة الحساب
                            </button>
                          </div>
                        )}

                      {isEditableDraft && disc.category === 'MISSING_CONTROL_EFFECTIVENESS_P15' && (
                        <div className="pt-2 flex items-center gap-2 flex-wrap">
                          <span className="text-[11px] font-bold text-slate-700">
                            استكمال تقييم فاعلية الضابط ({disc.control_id}):
                          </span>
                          <button
                            type="button"
                            disabled={isSavingOrRecalculating}
                            data-testid={`complete-p15-effective-btn-${disc.control_id}`}
                            onClick={() => {
                              const updatedCtrls = Object.values(controlsForm).map((c: any) =>
                                c.control_id === disc.control_id
                                  ? { ...c, effectiveness_raw: 'ضابط رقابي فعال' }
                                  : c
                              );
                              handleRecalculateRisk(
                                undefined,
                                updatedCtrls,
                                `استكمال تقييم فاعلية الضابط (${disc.control_id} - الخلية P15) كضابط رقابي فعال بناءً على مراجعة تقارير الحسابات اليومية`
                              );
                            }}
                            className="px-3 py-1 rounded-lg bg-[#006547] hover:bg-[#09331F] text-white text-xs font-bold"
                          >
                            اعتماد كـ &quot;ضابط رقابي فعال&quot; وإعادة الحساب
                          </button>
                          <button
                            type="button"
                            disabled={isSavingOrRecalculating}
                            onClick={() => {
                              const updatedCtrls = Object.values(controlsForm).map((c: any) =>
                                c.control_id === disc.control_id
                                  ? { ...c, effectiveness_raw: 'ضابط رقابي يحتاج إلى تطوير' }
                                  : c
                              );
                              handleRecalculateRisk(
                                undefined,
                                updatedCtrls,
                                `استكمال تقييم فاعلية الضابط (${disc.control_id} - الخلية P15) كضابط يحتاج إلى تطوير`
                              );
                            }}
                            className="px-3 py-1 rounded-lg bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold"
                          >
                            اعتماد كـ &quot;ضابط يحتاج إلى تطوير&quot; وإعادة الحساب
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Workspace Sub-Navigation Tabs */}
            <div className="flex bg-[#F8F8F6] p-1 rounded-xl border border-[#E5E3DE] gap-1 flex-wrap">
              {[
                {
                  id: 'inputs_and_calc',
                  label: '1. المدخلات والحساب المالي',
                  hint: 'تعديل الأثر الفردي والتكرار والتصنيف (L1/L2/L3) واستعراض مخرجات محرك بايثون للخطر الكامن والمتبقي.',
                },
                {
                  id: 'controls',
                  label: `2. الضوابط الرقابية (${(currentRiskObj.current_draft_input?.controls || []).length})`,
                  hint: 'مراجعة فاعلية الضوابط وأهليتها النطاقية لحساب معامل الخفض الأقصى (MAX RRF) أو إضافة ضوابط جديدة.',
                },
                {
                  id: 'ai_suggestions',
                  label: '3. مقترحات الذكاء',
                  hint: 'مقارنة النص الأصلي بالمقترح الذكي واتخاذ قرار القبول أو التعديل أو الرفض.',
                },
                {
                  id: 'evidence_and_audit',
                  label: '4. الأدلة وسجل التدقيق',
                  hint: 'فحوصات الاتساق العشرية وسجل التعديلات التفصيلي (قبل/بعد) بالمستخدم والتاريخ.',
                },
              ].map(t => (
                <HoverTooltip key={t.id} title={t.label} description={t.hint} side="bottom">
                  <button
                    type="button"
                    data-testid={`workspace-tab-${t.id}`}
                    onClick={() => setActiveWorkspaceTab(t.id as any)}
                    className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      activeWorkspaceTab === t.id
                        ? 'bg-[#006547] text-white shadow-xs'
                        : 'text-slate-700 hover:bg-[#EFECE6] hover:text-slate-950'
                    }`}
                  >
                    {t.label}
                  </button>
                </HoverTooltip>
              ))}
            </div>

            {/* TAB 1: Editable Risk Inputs vs Protected Read-Only Calculated Outputs */}
            {activeWorkspaceTab === 'inputs_and_calc' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                {/* Right Column (7 cols): Editable Risk Inputs */}
                <div className="lg:col-span-7 bg-[#F8F8F6] p-4 rounded-xl border border-[#E5E3DE] space-y-4">
                  <div className="flex items-center justify-between border-b border-[#E5E3DE] pb-2">
                    <h4 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                      <Edit3 className="w-4 h-4 text-[#006547]" />
                      <span>المدخلات القابلة للتعديل للمخاطرة ({currentRiskObj.risk_id})</span>
                    </h4>
                    <span className="text-[11px] font-semibold text-slate-600">
                      {isEditableDraft ? 'وضع التعديل مفعّل (Maker)' : 'وضع القراءة فقط'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="font-bold text-slate-800">النشاط / العملية (العمود D):</label>
                        {renderProvenanceBadge(provMap.process_name)}
                      </div>
                      <input
                        type="text"
                        disabled={!isEditableDraft}
                        value={riskForm.process_name}
                        onChange={e => setRiskForm(prev => ({ ...prev, process_name: e.target.value }))}
                        className="w-full px-3 py-1.5 bg-[#F4F3F0] border border-[#B8B6B2] rounded-lg text-slate-900 disabled:opacity-60"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="font-bold text-slate-800">الهدف الاستراتيجي (العمود E):</label>
                      </div>
                      <input
                        type="text"
                        disabled={!isEditableDraft}
                        value={riskForm.strategic_objective}
                        onChange={e =>
                          setRiskForm(prev => ({ ...prev, strategic_objective: e.target.value }))
                        }
                        className="w-full px-3 py-1.5 bg-[#F4F3F0] border border-[#B8B6B2] rounded-lg text-slate-900 disabled:opacity-60"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-bold text-slate-800">
                        وصف المخاطرة التشغيلية (العمود G):
                      </label>
                      {renderProvenanceBadge(provMap.risk_description)}
                    </div>
                    <textarea
                      rows={2}
                      disabled={!isEditableDraft}
                      data-testid="risk-description-input"
                      value={riskForm.risk_description}
                      onChange={e => setRiskForm(prev => ({ ...prev, risk_description: e.target.value }))}
                      className="w-full p-2.5 text-xs bg-[#F4F3F0] border border-[#B8B6B2] rounded-lg text-slate-900 disabled:opacity-60"
                    />
                  </div>

                  {/* Dynamic Cascading Risk Taxonomy L1, L2 & L3 Section */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-[#F8F8F6] p-3.5 rounded-xl border border-[#DCDAD5] text-xs">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="font-bold text-slate-900">
                          تصنيف المخاطر L1 (العمود AD):
                        </label>
                        {renderProvenanceBadge(provMap.taxonomy_l1_ar)}
                      </div>
                      <select
                        disabled={!isEditableDraft}
                        data-testid="taxonomy-l1-select"
                        value={riskForm.taxonomy_l1_id || ''}
                        onChange={e => {
                          const selectedId = e.target.value;
                          if (selectedId === 'OTHER') {
                            setRiskForm(prev => ({ ...prev, taxonomy_l1_id: 'OTHER', taxonomy_l1_ar: 'أخرى', taxonomy_l2_id: '', taxonomy_l2_ar: '', taxonomy_l3_id: '', taxonomy_l3_ar: '' }));
                            return;
                          }
                          const matchedL1 = taxonomyL1s.find(
                            l1 => (l1.taxonomy_id || l1.id) === selectedId
                          );
                          const newL1Ar = matchedL1
                            ? matchedL1.category_ar || matchedL1.name_ar
                            : '';

                          // Requirement 1: Clear L2 and L3 when L1 changes. Do NOT auto-select first child.
                          setRiskForm(prev => ({
                            ...prev,
                            taxonomy_l1_id: selectedId,
                            taxonomy_l1_ar: newL1Ar,
                            taxonomy_l2_id: '',
                            taxonomy_l2_ar: '',
                            taxonomy_l3_id: '',
                            taxonomy_l3_ar: '',
                          }));
                        }}
                        className="w-full px-3 py-1.5 bg-white border border-[#DCDAD5] rounded-lg text-slate-900 font-semibold disabled:opacity-60"
                      >
                        <option key="l1-empty" value="">-- اختر التصنيف الرئيسي L1 --</option>
                        {taxonomyL1s.map((l1, idx) => {
                          const tId = l1.taxonomy_id || l1.id || `L1-${idx}`;
                          const catAr = l1.category_ar || l1.name_ar || '';
                          const catEn = l1.category_en || l1.name_en || '';
                          return (
                            <option key={`l1-${tId}-${idx}`} value={tId}>
                              {tId}: {catAr} ({catEn})
                            </option>
                          );
                        })}
                        {!taxonomyL1s.some(
                          l1 => (l1.taxonomy_id || l1.id) === riskForm.taxonomy_l1_id
                        ) &&
                          riskForm.taxonomy_l1_ar &&
                          riskForm.taxonomy_l1_id !== 'OTHER' && (
                            <option key="l1-custom" value={riskForm.taxonomy_l1_id || 'CUSTOM'}>
                              {riskForm.taxonomy_l1_ar}
                            </option>
                          )}
                        <option key="l1-other" value="OTHER">أخرى</option>
                      </select>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="font-bold text-slate-900">
                          تصنيف المخاطر L2 الفرعي:
                        </label>
                      </div>
                      <select
                        disabled={!isEditableDraft || !riskForm.taxonomy_l1_id}
                        data-testid="taxonomy-l2-select"
                        value={riskForm.taxonomy_l2_id || ''}
                        onChange={e => {
                          const selectedId = e.target.value;
                          if (selectedId === 'OTHER') {
                            setRiskForm(prev => ({ ...prev, taxonomy_l2_id: 'OTHER', taxonomy_l2_ar: 'أخرى', taxonomy_l3_id: '', taxonomy_l3_ar: '' }));
                            return;
                          }
                          const matchedL2 = taxonomyL2s.find(
                            l2 => (l2.taxonomy_id || l2.id) === selectedId
                          );

                          // Requirement 2: Clear L3 when L2 changes.
                          setRiskForm(prev => ({
                            ...prev,
                            taxonomy_l2_id: selectedId,
                            taxonomy_l2_ar: matchedL2
                              ? matchedL2.category_ar || matchedL2.name_ar
                              : '',
                            taxonomy_l3_id: '',
                            taxonomy_l3_ar: '',
                          }));
                        }}
                        className="w-full px-3 py-1.5 bg-white border border-[#DCDAD5] rounded-lg text-slate-900 font-semibold disabled:opacity-60"
                      >
                        <option key="l2-empty" value="">-- اختر التصنيف الفرعي L2 --</option>
                        {taxonomyL2s
                          .filter(
                            l2 =>
                              (l2.parent_taxonomy_id || l2.parent_id) === riskForm.taxonomy_l1_id
                          )
                          .map((l2, idx) => {
                            const tId = l2.taxonomy_id || l2.id || `L2-${idx}`;
                            const catAr = l2.category_ar || l2.name_ar || '';
                            const catEn = l2.category_en || l2.name_en || '';
                            return (
                              <option key={`l2-${tId}-${idx}`} value={tId}>
                                {tId}: {catAr} ({catEn})
                              </option>
                            );
                          })}
                        {!taxonomyL2s.some(
                          l2 => (l2.taxonomy_id || l2.id) === riskForm.taxonomy_l2_id
                        ) &&
                          riskForm.taxonomy_l2_ar &&
                          riskForm.taxonomy_l2_id !== 'OTHER' && (
                            <option key="l2-custom" value={riskForm.taxonomy_l2_id || 'CUSTOM'}>
                              {riskForm.taxonomy_l2_ar}
                            </option>
                          )}
                        <option key="l2-other" value="OTHER">أخرى</option>
                      </select>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="font-bold text-slate-900">
                          تصنيف المخاطر L3 التفصيلي:
                        </label>
                      </div>
                      <select
                        disabled={!isEditableDraft || !riskForm.taxonomy_l2_id}
                        data-testid="taxonomy-l3-select"
                        value={riskForm.taxonomy_l3_id || ''}
                        onChange={e => {
                          const selectedId = e.target.value;
                          if (selectedId === 'OTHER') {
                            setRiskForm(prev => ({ ...prev, taxonomy_l3_id: 'OTHER', taxonomy_l3_ar: 'أخرى' }));
                            return;
                          }
                          const matchedL3 = taxonomyL3s.find(
                            l3 => (l3.taxonomy_id || l3.id) === selectedId
                          );
                          setRiskForm(prev => ({
                            ...prev,
                            taxonomy_l3_id: selectedId,
                            taxonomy_l3_ar: matchedL3
                              ? matchedL3.category_ar || matchedL3.name_ar
                              : '',
                          }));
                        }}
                        className="w-full px-3 py-1.5 bg-white border border-[#DCDAD5] rounded-lg text-slate-900 font-semibold disabled:opacity-60"
                      >
                        <option key="l3-empty" value="">-- اختر التصنيف التفصيلي L3 --</option>
                        {taxonomyL3s
                          .filter(
                            l3 =>
                              (l3.parent_taxonomy_id || l3.parent_id) === riskForm.taxonomy_l2_id
                          )
                          .map((l3, idx) => {
                            const tId = l3.taxonomy_id || l3.id || `L3-${idx}`;
                            const catAr = l3.category_ar || l3.name_ar || '';
                            const catEn = l3.category_en || l3.name_en || '';
                            return (
                              <option key={`l3-${tId}-${idx}`} value={tId}>
                                {tId}: {catAr} ({catEn})
                              </option>
                            );
                          })}
                        {!taxonomyL3s.some(
                          l3 => (l3.taxonomy_id || l3.id) === riskForm.taxonomy_l3_id
                        ) &&
                          riskForm.taxonomy_l3_ar &&
                          riskForm.taxonomy_l3_id !== 'OTHER' && (
                            <option key="l3-custom" value={riskForm.taxonomy_l3_id || 'CUSTOM'}>
                              {riskForm.taxonomy_l3_ar}
                            </option>
                          )}
                        <option key="l3-other" value="OTHER">أخرى</option>
                      </select>
                    </div>
                  </div>

                  {/* Financial Impact & Frequency Editable Section */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-[#ECEBE8] p-3.5 rounded-xl border border-[#C6C4C1] text-xs">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="font-bold text-slate-900">
                          الأثر المالي الفردي بالجنيه (العمود J):
                        </label>
                        {renderProvenanceBadge(provMap.individual_financial_impact)}
                      </div>
                      <input
                        type="number"
                        disabled={!isEditableDraft}
                        data-testid="individual-financial-impact-input"
                        value={riskForm.individual_financial_impact}
                        onChange={e =>
                          setRiskForm(prev => ({
                            ...prev,
                            individual_financial_impact: e.target.value,
                            financial_value_origin: 'EXPLICIT_HUMAN_ESTIMATE',
                          }))
                        }
                        placeholder="أدخل القيمة بالجنيه المصري..."
                        className="w-full px-3 py-1.5 font-mono font-bold bg-[#F4F3F0] border border-[#B8B6B2] rounded-lg text-slate-900 disabled:opacity-60"
                      />
                      <div>
                        <label className="text-[11px] font-semibold text-slate-700 block mb-0.5">
                          مصدر / مبرر الأثر المالي الفردي:
                        </label>
                        <input
                          type="text"
                          disabled={!isEditableDraft}
                          value={riskForm.financial_evidence_justification}
                          onChange={e =>
                            setRiskForm(prev => ({
                              ...prev,
                              financial_evidence_justification: e.target.value,
                            }))
                          }
                          placeholder="اذكر المستند أو الحادثة أو أساس التقدير..."
                          className="w-full px-2.5 py-1 text-[11px] bg-[#F4F3F0] border border-[#B8B6B2] rounded-lg text-slate-800 disabled:opacity-60"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="font-bold text-slate-900">
                          التكرار المتوقع لحدوث المخاطرة (العمود I):
                        </label>
                        {renderProvenanceBadge(provMap.expected_frequency_text)}
                      </div>
                      <select
                        disabled={!isEditableDraft}
                        data-testid="expected-frequency-select"
                        value={riskForm.expected_frequency_text}
                        onChange={e => {
                          if (e.target.value === 'OTHER') {
                            setRiskForm(prev => ({
                              ...prev,
                              expected_frequency_text: prev.expected_frequency_text || 'Annually\nسنوياً',
                              frequency_origin: 'AUTHORIZED_USER_ESTIMATE',
                            }));
                            return;
                          }
                          setRiskForm(prev => ({
                            ...prev,
                            expected_frequency_text: e.target.value,
                            frequency_origin: 'AUTHORIZED_USER_ESTIMATE',
                          }));
                        }}
                        className="w-full px-3 py-1.5 bg-[#F4F3F0] border border-[#B8B6B2] rounded-lg text-slate-900 font-semibold disabled:opacity-60"
                      >
                        <option key="freq-empty" value="">-- اختر التكرار المعتمد (PENDING_INPUT) --</option>
                        {FREQUENCY_OPTIONS.map((fo, idx) => (
                          <option key={`freq-${fo.value || idx}`} value={fo.value}>
                            {fo.label}
                          </option>
                        ))}
                        {riskForm.expected_frequency_text &&
                          !FREQUENCY_OPTIONS.some(fo => fo.value === riskForm.expected_frequency_text) && (
                            <option key="freq-custom" value={riskForm.expected_frequency_text}>
                              {riskForm.expected_frequency_text} (قيمة المصدر الحالي)
                            </option>
                          )}
                        <option key="freq-other" value="OTHER">أخرى</option>
                      </select>
                      <div>
                        <label className="text-[11px] font-semibold text-slate-700 block mb-0.5">
                          مبرر / دليل التكرار المتوقع:
                        </label>
                        <input
                          type="text"
                          disabled={!isEditableDraft}
                          value={riskForm.frequency_justification}
                          onChange={e =>
                            setRiskForm(prev => ({ ...prev, frequency_justification: e.target.value }))
                          }
                          placeholder="مبرر اختيار دورية التكرار..."
                          className="w-full px-2.5 py-1 text-[11px] bg-[#F4F3F0] border border-[#B8B6B2] rounded-lg text-slate-800 disabled:opacity-60"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Assessment Rationale & Corrective Action */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-bold text-slate-800">
                        الأساس المنطقي للتقدير (العمود AC — يتحدث تلقائياً مع الحساب ما لم تثبته يدوياً):
                      </label>
                      {renderProvenanceBadge(provMap.active_rationale_ar)}
                    </div>
                    <textarea
                      rows={3}
                      disabled={!isEditableDraft}
                      data-testid="rationale-textarea"
                      value={riskForm.active_rationale_ar}
                      onChange={e =>
                        setRiskForm(prev => ({
                          ...prev,
                          active_rationale_ar: e.target.value,
                          preserve_custom_rationale: true,
                        }))
                      }
                      className="w-full p-2.5 text-xs bg-[#F4F3F0] border border-[#B8B6B2] rounded-lg text-slate-900 leading-relaxed disabled:opacity-60"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-bold text-slate-800">
                        الإجراءات التصحيحية المقترحة (العمود AB):
                      </label>
                      {renderProvenanceBadge(provMap.active_corrective_action_ar)}
                    </div>
                    <textarea
                      rows={2}
                      disabled={!isEditableDraft}
                      data-testid="corrective-action-textarea"
                      value={riskForm.active_corrective_action_ar}
                      onChange={e =>
                        setRiskForm(prev => ({ ...prev, active_corrective_action_ar: e.target.value }))
                      }
                      placeholder="لا يلزم إجراء تصحيحي إلزامي للضوابط الفعالة..."
                      className="w-full p-2.5 text-xs bg-[#F4F3F0] border border-[#B8B6B2] rounded-lg text-slate-900 disabled:opacity-60"
                    />
                  </div>

                  {isEditableDraft && (
                    <div className="pt-2 border-t border-[#CECCC9] flex flex-col sm:flex-row items-center justify-between gap-3">
                      <input
                        type="text"
                        value={riskForm.evidence_or_reason}
                        onChange={e =>
                          setRiskForm(prev => ({ ...prev, evidence_or_reason: e.target.value }))
                        }
                        placeholder="سبب التعديل أو المرجع المستندي لسجل التدقيق..."
                        className="w-full sm:flex-1 px-3 py-2 text-xs bg-[#F4F3F0] border border-[#B8B6B2] rounded-xl text-slate-900"
                      />
                      <button
                        type="button"
                        disabled={isSavingOrRecalculating}
                        data-testid="recalculate-risk-btn"
                        onClick={() => handleRecalculateRisk()}
                        className="w-full sm:w-auto px-4 py-2 rounded-xl bg-[#006547] hover:bg-[#09331F] text-white text-xs font-bold flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
                      >
                        <Calculator className="w-4 h-4 text-[#F79C1E]" />
                        <span>
                          {isSavingOrRecalculating
                            ? 'جارٍ إعادة الاحتساب بمحرك بايثون...'
                            : 'حفظ التعديلات وإعادة احتساب المخاطرة (Python Engine)'}
                        </span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Left Column (5 cols): Protected Read-Only Calculated Outputs */}
                <div className="lg:col-span-5 bg-emerald-50/50 p-4 rounded-xl border border-[#006547]/30 space-y-4">
                  <div className="flex items-center justify-between border-b border-[#006547]/20 pb-2">
                    <h4 className="text-sm font-bold text-[#09331F] flex items-center gap-1.5">
                      <Lock className="w-4 h-4 text-[#006547]" />
                      <span>المخرجات المحسوبة آلياً (للقراءة فقط — محرك بايثون)</span>
                    </h4>
                    {renderProvenanceBadge('CALCULATED_VALUE')}
                  </div>

                  {/* 1. Phase 2A Financial & Inherent Outputs */}
                  <div className="p-3.5 rounded-xl bg-white border border-[#DCDAD5] space-y-2.5 text-xs">
                    <div className="font-bold text-slate-900 border-b border-[#E5E3DE] pb-1">
                      أولاً: مخرجات الأثر المالي والخطر المتلازم (Phase 2A Engine)
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-[10px] text-slate-600 block">شريحة الأثر الفردي:</span>
                        <span className="font-bold text-slate-900">
                          {calc.individual_impact_label_ar || 'PENDING'} ({calc.individual_impact_rating || '-'})
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-600 block">معامل التكرار السنوي:</span>
                        <span className="font-mono font-bold text-slate-900">
                          {calc.annual_frequency_multiplier !== null
                            ? `×${calc.annual_frequency_multiplier}`
                            : 'PENDING_INPUT'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-600 block">
                          الخسارة السنوية المتوقعة (العمود K):
                        </span>
                        <span
                          className="font-mono font-bold text-sm text-rose-800"
                          data-testid="calc-annual-loss-k"
                        >
                          {calc.expected_annual_loss_egp !== null
                            ? `${Number(calc.expected_annual_loss_egp).toLocaleString()} ج.م`
                            : 'PENDING_INPUT'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-600 block">
                          تصنيف التقييم المالي السنوي (العمود L):
                        </span>
                        <div data-testid="calc-inherent-rating-l">
                          {renderSeverityBadge(calc.annualized_financial_rating)}
                        </div>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-600 block">مصفوفة 5×5 (صفحة 5):</span>
                        <span className="font-bold text-slate-900">
                          {calc.page5_matrix_rating || '-'} ({calc.page5_matrix_color || '-'})
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-600 block">نطاق التصعيد (صفحة 6):</span>
                        <span className="font-mono text-[11px] font-bold text-slate-800">
                          {calc.page6_inherent_zone || '-'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 2. Phase 2B MAX RRF & Residual Risk Outputs (with Workbook Reference Comparison!) */}
                  <div className="p-3.5 rounded-xl bg-white border border-[#DCDAD5] space-y-2.5 text-xs">
                    <div className="font-bold text-slate-900 border-b border-[#E5E3DE] pb-1">
                      ثانياً: معامل الخفض الأقصى والخطر المتبقي (Phase 2B Engine)
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-[10px] text-slate-600 block">
                          معامل الخفض الأقصى المحسوب (MAX RRF - S):
                        </span>
                        <span
                          className="font-mono font-bold text-sm text-[#006547]"
                          data-testid="calc-effective-max-rrf"
                        >
                          {calc.effective_max_rrf !== null
                            ? `${calc.effective_max_rrf} (${(Number(calc.effective_max_rrf) * 100).toFixed(0)}%)`
                            : 'PENDING'}
                        </span>
                        <div className="text-[10px] text-slate-600 font-mono">
                          الضابط المختار: {calc.selected_max_rrf_control_id || '-'} ({calc.selected_workbook_rrf_key || '-'})
                        </div>
                      </div>

                      <div>
                        <span className="text-[10px] text-slate-600 block">
                          مرجع الإكسيل الأصلي (الخلية S / T):
                        </span>
                        <span
                          className="font-mono font-bold text-slate-800"
                          data-testid="workbook-ref-rrf-display"
                        >
                          {calc.workbook_reference_rrf !== null && calc.workbook_reference_rrf !== undefined
                            ? `RRF=${calc.workbook_reference_rrf} (${calc.workbook_reference_s_key})`
                            : 'لا يوجد مرجع إكسيل'}
                        </span>
                        {calc.workbook_reference_t_residual_egp !== null &&
                          calc.workbook_reference_t_residual_egp !== undefined && (
                            <div className="text-[10px] text-slate-600 font-mono">
                              T المرجعي: {Number(calc.workbook_reference_t_residual_egp).toLocaleString()} ج.م (
                              {calc.workbook_reference_u_rating})
                            </div>
                          )}
                      </div>

                      <div>
                        <span className="text-[10px] text-slate-600 block">
                          صافي الخسارة السنوية المتبقية (العمود T):
                        </span>
                        <span
                          className="font-mono font-bold text-sm text-slate-900"
                          data-testid="calc-residual-loss-t"
                        >
                          {calc.residual_financial_amount_egp !== null
                            ? `${Number(calc.residual_financial_amount_egp).toLocaleString()} ج.م`
                            : 'PENDING'}
                        </span>
                      </div>

                      <div>
                        <span className="text-[10px] text-slate-600 block">
                          تصنيف الأثر المالي المتبقي (العمود U):
                        </span>
                        <div data-testid="calc-residual-rating-u">
                          {renderSeverityBadge(calc.continuous_residual_rating)}
                        </div>
                      </div>
                    </div>

                    <div className="text-[11px] text-slate-700 bg-[#E2E1DE] p-2 rounded-lg border border-[#C6C4C1]">
                      <strong>قاعدة الاختيار:</strong> {calc.max_rrf_selection_rationale}
                    </div>
                  </div>

                  {/* 3. Key Risk Rule & Phase 2C Notice */}
                  <div className="p-3 rounded-xl bg-[#E2E1DE] border border-[#C6C4C1] text-[11px] text-slate-700 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 font-bold text-[#09331F]">
                      <span>قاعدة المخاطرة الرئيسية (Key Risk) وNFI / ESG</span>
                      <InfoHint
                        title="قاعدة Key Risk والحساب النهائي"
                        description={`تُصنّف المخاطرة رئيسية (YES) فقط إذا كان التقييم المالي المتبقي (${calc.continuous_residual_rating || 'PENDING'}) أو أي بُعد غير مالي (NFI) يساوي H أو VH أو C، وتُطبق أعلى درجة وفق مبدأ الأكثر تحوطاً مع مطابقة كتالوج ESG (34 بنداً).`}
                      />
                    </div>
                    <span className="font-mono font-bold text-[10px] text-[#006547]">
                      المتبقي الحالي: {calc.continuous_residual_rating || 'PENDING'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: Control-by-Control Review & Edit (including Scope Eligibility Override & P15 Completion) */}
            {activeWorkspaceTab === 'controls' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-1.5">
                    <h4 className="text-sm font-bold text-slate-900">
                      مراجعة وتعديل الضوابط ({currentRiskObj.risk_id})
                    </h4>
                    <InfoHint
                      title="قاعدة حساب MAX RRF للضوابط"
                      description="يُطبق محرك بايثون أعلى معامل خفض مؤهل (MAX Eligible Implemented RRF) من مصفوفة 3×3، ولا تدخل الضوابط المقترحة (PROPOSED) أو المستبعدة نطاقياً في تخفيض الخطر المتبقي."
                    />
                  </div>
                  {isEditableDraft && (
                    <HoverTooltip title="إضافة ضابط جديد" description="فتح نموذج إضافة ضابط رقابي حالي أو مقترح لهذه المخاطرة." side="bottom">
                      <button
                        type="button"
                        onClick={() => setShowAddControl(prev => !prev)}
                        className="px-3 py-1.5 rounded-xl bg-[#006547] hover:bg-[#09331F] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>إضافة ضابط رقابي</span>
                      </button>
                    </HoverTooltip>
                  )}
                </div>

                {/* Add New Control Form */}
                {showAddControl && isEditableDraft && (
                  <div className="p-4 rounded-xl bg-[#E2E6E3] border border-[#006547] space-y-3 text-xs">
                    <div className="font-bold text-[#09331F]">إضافة ضابط رقابي جديد للمخاطرة ({currentRiskObj.risk_id}):</div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="sm:col-span-2">
                        <label className="block font-bold mb-1">وصف الضابط الرقابي:</label>
                        <input
                          type="text"
                          value={newControlForm.control_description}
                          onChange={e =>
                            setNewControlForm(prev => ({ ...prev, control_description: e.target.value }))
                          }
                          placeholder="أدخل وصف الإجراء الرقابي الفعلي..."
                          className="w-full px-3 py-1.5 bg-[#F4F3F0] border border-[#B8B6B2] rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block font-bold mb-1">حالة التطبيق:</label>
                        <select
                          value={newControlForm.implementation_status}
                          onChange={e =>
                            setNewControlForm(prev => ({
                              ...prev,
                              implementation_status: (e.target.value === 'OTHER' ? 'PROPOSED' : e.target.value) as any,
                            }))
                          }
                          className="w-full px-3 py-1.5 bg-[#F4F3F0] border border-[#B8B6B2] rounded-lg font-bold"
                        >
                          <option value="IMPLEMENTED">مطبق حالياً (IMPLEMENTED)</option>
                          <option value="PROPOSED">ضابط مقترح مستقبلي (PROPOSED — RRF=0)</option>
                          <option value="OTHER">أخرى</option>
                        </select>
                      </div>
                      <div>
                        <label className="block font-bold mb-1">نوع الضابط (R):</label>
                        <select
                          value={newControlForm.control_type_raw}
                          onChange={e =>
                            setNewControlForm(prev => ({ ...prev, control_type_raw: e.target.value === 'OTHER' ? 'Preventive' : e.target.value }))
                          }
                          className="w-full px-3 py-1.5 bg-[#F4F3F0] border border-[#B8B6B2] rounded-lg"
                        >
                          {CONTROL_TYPE_OPTIONS.map(o => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                          <option value="OTHER">أخرى</option>
                        </select>
                      </div>
                      <div>
                        <label className="block font-bold mb-1">آلية التطبيق (O):</label>
                        <select
                          value={newControlForm.control_method_raw}
                          onChange={e =>
                            setNewControlForm(prev => ({ ...prev, control_method_raw: e.target.value === 'OTHER' ? 'Manual' : e.target.value }))
                          }
                          className="w-full px-3 py-1.5 bg-[#F4F3F0] border border-[#B8B6B2] rounded-lg"
                        >
                          {CONTROL_METHOD_OPTIONS.map(o => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                          <option value="OTHER">أخرى</option>
                        </select>
                      </div>
                      <div>
                        <label className="block font-bold mb-1">تقييم الفاعلية (P):</label>
                        <select
                          value={newControlForm.effectiveness_raw}
                          onChange={e =>
                            setNewControlForm(prev => ({ ...prev, effectiveness_raw: e.target.value === 'OTHER' ? 'PENDING_REVIEW' : e.target.value }))
                          }
                          className="w-full px-3 py-1.5 bg-[#F4F3F0] border border-[#B8B6B2] rounded-lg"
                        >
                          {EFFECTIVENESS_OPTIONS.map(o => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                          <option value="OTHER">أخرى</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setShowAddControl(false)}
                        className="px-3 py-1.5 rounded-lg bg-[#E2E1DE] border border-[#B8B6B2] font-bold"
                      >
                        إلغاء
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleRecalculateRisk(
                            undefined,
                            undefined,
                            `إضافة ضابط رقابي جديد (${newControlForm.implementation_status}) وإعادة احتساب المخاطرة`,
                            newControlForm
                          )
                        }
                        className="px-4 py-1.5 rounded-lg bg-[#006547] text-white font-bold"
                      >
                        إضافة الضابط وإعادة الاحتساب
                      </button>
                    </div>
                  </div>
                )}

                {/* Controls Cards */}
                <div className="space-y-3">
                  {(calc.controls_calculated || []).map((cc: any) => {
                    const cf = controlsForm[cc.control_id] || {};
                    const isWinningMaxRrf = calc.selected_max_rrf_control_id === cc.control_id;

                    return (
                      <div
                        key={cc.control_id}
                        data-testid={`control-card-${cc.control_id}`}
                        className={`p-4 rounded-xl border text-xs space-y-3 ${
                          isWinningMaxRrf
                            ? 'bg-[#E2E6E3] border-2 border-[#006547]'
                            : 'bg-[#E2E1DE] border-[#C6C4C1]'
                        }`}
                      >
                        <div className="flex items-center justify-between flex-wrap gap-2 border-b border-[#CECCC9] pb-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono font-bold text-sm text-[#09331F] bg-[#F4F3F0] px-2.5 py-0.5 rounded border border-[#B8B6B2]">
                              {cc.control_id}
                            </span>
                            {isWinningMaxRrf && (
                              <span className="px-2.5 py-0.5 rounded-full bg-[#006547] text-white font-bold text-[10px]">
                                الضابط المختار لـ MAX RRF ({cc.applicable_rrf}) ★
                              </span>
                            )}
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                cc.is_eligible_for_residual_reduction
                                  ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                                  : 'bg-amber-100 text-amber-900 border border-amber-300'
                              }`}
                            >
                              {cc.is_eligible_for_residual_reduction
                                ? `مؤهل لخفض المخاطر (RRF = ${cc.applicable_rrf})`
                                : `غير مؤهل لخفض المخاطر (${cc.eligibility_reason})`}
                            </span>
                          </div>
                          {renderProvenanceBadge(provMap[`control:${cc.control_id}:effectiveness`])}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                          <div className="md:col-span-6">
                            <label className="block font-bold text-slate-800 mb-1">
                              وصف الضابط الرقابي (العمود M):
                            </label>
                            <textarea
                              rows={2}
                              disabled={!isEditableDraft}
                              value={cf.control_description || ''}
                              onChange={e =>
                                setControlsForm(prev => ({
                                  ...prev,
                                  [cc.control_id]: {
                                    ...prev[cc.control_id],
                                    control_description: e.target.value,
                                  },
                                }))
                              }
                              className="w-full p-2 bg-[#F4F3F0] border border-[#B8B6B2] rounded-lg text-slate-900 disabled:opacity-60"
                            />
                          </div>

                          <div className="md:col-span-2">
                            <label className="block font-bold text-slate-800 mb-1">نوع الضابط (R):</label>
                            <select
                              disabled={!isEditableDraft}
                              data-testid={`control-type-select-${cc.control_id}`}
                              value={cf.control_type_raw || 'Preventive'}
                              onChange={e =>
                                setControlsForm(prev => ({
                                  ...prev,
                                  [cc.control_id]: {
                                    ...prev[cc.control_id],
                                    control_type_raw: e.target.value === 'OTHER' ? 'Preventive' : e.target.value,
                                  },
                                }))
                              }
                              className="w-full px-2.5 py-1.5 bg-[#F4F3F0] border border-[#B8B6B2] rounded-lg font-semibold disabled:opacity-60"
                            >
                              {CONTROL_TYPE_OPTIONS.map((o, idx) => (
                                <option key={`ctype-${o.value || idx}`} value={o.value}>
                                  {o.label}
                                </option>
                              ))}
                              {cf.control_type_raw &&
                                !CONTROL_TYPE_OPTIONS.some(o => o.value === cf.control_type_raw) && (
                                  <option key="ctype-custom" value={cf.control_type_raw}>{cf.control_type_raw}</option>
                                )}
                              <option value="OTHER">أخرى</option>
                            </select>
                          </div>

                          <div className="md:col-span-2">
                            <label className="block font-bold text-slate-800 mb-1">آلية التطبيق (O):</label>
                            <select
                              disabled={!isEditableDraft}
                              data-testid={`control-method-select-${cc.control_id}`}
                              value={cf.control_method_raw || 'Manual'}
                              onChange={e =>
                                setControlsForm(prev => ({
                                  ...prev,
                                  [cc.control_id]: {
                                    ...prev[cc.control_id],
                                    control_method_raw: e.target.value === 'OTHER' ? 'Manual' : e.target.value,
                                  },
                                }))
                              }
                              className="w-full px-2.5 py-1.5 bg-[#F4F3F0] border border-[#B8B6B2] rounded-lg font-semibold disabled:opacity-60"
                            >
                              {CONTROL_METHOD_OPTIONS.map((o, idx) => (
                                <option key={`cmethod-${o.value || idx}`} value={o.value}>
                                  {o.label}
                                </option>
                              ))}
                              {cf.control_method_raw &&
                                !CONTROL_METHOD_OPTIONS.some(o => o.value === cf.control_method_raw) && (
                                  <option key="cmethod-custom" value={cf.control_method_raw}>{cf.control_method_raw}</option>
                                )}
                              <option value="OTHER">أخرى</option>
                            </select>
                          </div>

                          <div className="md:col-span-2">
                            <label className="block font-bold text-slate-800 mb-1">تقييم الفاعلية (P):</label>
                            <select
                              disabled={!isEditableDraft}
                              data-testid={`control-eff-select-${cc.control_id}`}
                              value={cf.effectiveness_raw || 'PENDING_REVIEW'}
                              onChange={e =>
                                setControlsForm(prev => ({
                                  ...prev,
                                  [cc.control_id]: {
                                    ...prev[cc.control_id],
                                    effectiveness_raw: e.target.value === 'OTHER' ? 'PENDING_REVIEW' : e.target.value,
                                  },
                                }))
                              }
                              className="w-full px-2.5 py-1.5 bg-[#F4F3F0] border border-[#B8B6B2] rounded-lg font-semibold disabled:opacity-60"
                            >
                              {EFFECTIVENESS_OPTIONS.map(o => (
                                <option key={o.value} value={o.value}>
                                  {o.label}
                                </option>
                              ))}
                              <option value="OTHER">أخرى</option>
                            </select>
                          </div>
                        </div>

                        {/* Scope Eligibility & Implementation Status Row */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-[#CECCC9]">
                          <div className="flex items-center gap-4 flex-wrap">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-700">حالة التطبيق:</span>
                              <select
                                disabled={!isEditableDraft}
                                value={cf.implementation_status || 'IMPLEMENTED'}
                                onChange={e =>
                                  setControlsForm(prev => ({
                                    ...prev,
                                    [cc.control_id]: {
                                      ...prev[cc.control_id],
                                      implementation_status: e.target.value === 'OTHER' ? 'PROPOSED' : e.target.value,
                                    },
                                  }))
                                }
                                className="px-2.5 py-1 bg-[#F4F3F0] border border-[#B8B6B2] rounded-lg font-semibold disabled:opacity-60"
                              >
                                <option value="IMPLEMENTED">مطبق حالياً (IMPLEMENTED)</option>
                                <option value="PROPOSED">ضابط مقترح (PROPOSED — RRF=0)</option>
                                <option value="OTHER">أخرى</option>
                              </select>
                            </div>

                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-700">الأهلية النطاقية لخفض الخطر:</span>
                              <select
                                disabled={!isEditableDraft}
                                data-testid={`control-scope-select-${cc.control_id}`}
                                value={
                                  cf.eligible_for_scope_override === false
                                    ? 'EXCLUDED'
                                    : 'ELIGIBLE'
                                }
                                onChange={e =>
                                  setControlsForm(prev => ({
                                    ...prev,
                                    [cc.control_id]: {
                                      ...prev[cc.control_id],
                                      eligible_for_scope_override:
                                        e.target.value === 'EXCLUDED' ? false : true,
                                    },
                                  }))
                                }
                                className="px-2.5 py-1 bg-[#F4F3F0] border border-[#B8B6B2] rounded-lg font-semibold disabled:opacity-60"
                              >
                                <option value="ELIGIBLE">مؤهل نطاقياً لخفض هذه المخاطرة</option>
                                <option value="EXCLUDED">
                                  مستبعد نطاقياً (يغطي نطاقاً مختلفاً — لا يخفض الخطر المتبقي)
                                </option>
                                <option value="OTHER">أخرى</option>
                              </select>
                            </div>

                            <div className="font-mono text-slate-800">
                              معامل الخفض المحسوب (للقراءة فقط):{' '}
                              <strong className="text-[#006547]">
                                {cc.applicable_rrf !== null ? cc.applicable_rrf : '0'} ({cc.workbook_rrf_key})
                              </strong>
                            </div>
                          </div>

                          {isEditableDraft && (
                            <button
                              type="button"
                              disabled={isSavingOrRecalculating}
                              data-testid={`save-recalc-control-btn-${cc.control_id}`}
                              onClick={() =>
                                handleRecalculateRisk(
                                  undefined,
                                  Object.values(controlsForm),
                                  `تحديث خصائص أو نطاق الضابط الرقابي (${cc.control_id}) وإعادة احتساب المخاطرة`
                                )
                              }
                              className="px-3.5 py-1.5 rounded-xl bg-[#006547] hover:bg-[#09331F] text-white font-bold flex items-center gap-1.5 shrink-0"
                            >
                              <Calculator className="w-3.5 h-3.5 text-[#F79C1E]" />
                              <span>حفظ تعديل الضابط وإعادة الاحتساب</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* TAB 3: AI Suggestion Review (Original vs Proposed with Accept / Modify / Reject) */}
            {activeWorkspaceTab === 'ai_suggestions' && (
              <div className="space-y-4">
                <div className="bg-[#E2E1DE] p-3.5 rounded-xl border border-[#C6C4C1] text-xs flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <strong className="text-slate-900">حوكمة مراجعة مقترحات الذكاء (AI Suggestion Review):</strong>{' '}
                    <span className="text-slate-700">
                      لا يتم اعتماد أي نص مقترح تلقائياً. يمكنك مقارنة النص الأصلي بالمقترح واختيار (قبول المقترح)، أو (التعديل قبل الاعتماد)، أو (الرفض والإبقاء على النص الأصلي).
                    </span>
                  </div>
                  {renderProvenanceBadge('AI_SUGGESTED_VALUE')}
                </div>

                {[
                  {
                    field: 'risk_description' as const,
                    title: '1. مقترح تحسين صياغة وصف المخاطرة (العمود G — العناصر الدلالية الأربعة)',
                    originalText: orig.risk_description_cell_g || 'غير متوفر بالمصدر (MISSING_IN_SOURCE)',
                    proposedText: pkg.risk_description_quality?.proposed_improved_description_ar || '',
                    activeText: currentRiskObj.current_draft_input?.risk_description || '',
                    status: sugDecisions.risk_description?.status || 'PENDING_HUMAN_REVIEW',
                    issues: pkg.risk_description_quality?.quality_issues_detected || [],
                  },
                  {
                    field: 'rationale' as const,
                    title: '2. مقترح الأساس المنطقي الاحترافي للتقدير (العمود AC — فصل المتلازم عن المتبقي وتوثيق الأدلة)',
                    originalText: orig.rationale_cell_ac || 'غير متوفر بالمصدر',
                    proposedText: pkg.rationale_proposal?.proposed_rationale_ar || '',
                    activeText: currentRiskObj.current_draft_input?.active_rationale_ar || '',
                    status: sugDecisions.rationale?.status || 'PENDING_HUMAN_REVIEW',
                    issues: pkg.rationale_proposal?.original_rationale_issues || [],
                  },
                  {
                    field: 'corrective_action' as const,
                    title: '3. مقترح الإجراءات التصحيحية المرشحة (العمود AB)',
                    originalText:
                      orig.corrective_action_cell_ab || 'لا يوجد إجراء تصحيحي مسجل بالملف الأصلي',
                    proposedText:
                      pkg.corrective_action_recommendation?.required_corrective_action_candidates?.[0]
                        ?.proposed_action_text_ar ||
                      pkg.corrective_action_recommendation?.rationale_ar ||
                      '',
                    activeText:
                      currentRiskObj.current_draft_input?.active_corrective_action_ar ||
                      'لا يلزم إجراء تصحيحي إلزامي',
                    status: sugDecisions.corrective_action?.status || 'PENDING_HUMAN_REVIEW',
                    issues: [],
                  },
                ].map(card => (
                  <div
                    key={card.field}
                    data-testid={`ai-suggestion-card-${card.field}`}
                    className="p-4 rounded-xl bg-[#E2E1DE] border border-[#C6C4C1] space-y-3 text-xs"
                  >
                    <div className="flex items-center justify-between flex-wrap gap-2 border-b border-[#CECCC9] pb-2">
                      <span className="font-bold text-slate-900">{card.title}</span>
                      <span
                        data-testid={`suggestion-status-${card.field}`}
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                          card.status === 'ACCEPTED_BY_MAKER' || card.status === 'MODIFIED_BY_MAKER'
                            ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                            : card.status === 'REJECTED_KEEP_ORIGINAL'
                              ? 'bg-slate-200 text-slate-800 border border-slate-300'
                              : 'bg-amber-100 text-amber-900 border border-amber-300'
                        }`}
                      >
                        {card.status}
                      </span>
                    </div>

                    {card.issues.length > 0 && (
                      <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-300 text-amber-950 text-[11px] space-y-1">
                        <div className="font-bold">ملاحظات الجودة المرصودة في النص الأصلي:</div>
                        <ul className="list-disc list-inside space-y-0.5">
                          {card.issues.map((iss: string, i: number) => (
                            <li key={i}>{iss}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="p-3 rounded-lg bg-[#F0EFED] border border-[#C6C4C1]">
                        <div className="text-[10px] font-bold text-slate-600 mb-1">
                          النص الأصلي بالمصدر (ORIGINAL_SOURCE_VALUE):
                        </div>
                        <p className="text-slate-800 leading-relaxed">{card.originalText}</p>
                      </div>
                      <div className="p-3 rounded-lg bg-[#E2E6E3] border border-[#006547]/40">
                        <div className="text-[10px] font-bold text-[#09331F] mb-1">
                          النص المقترح المدعوم بالأدلة (AI_SUGGESTED_VALUE):
                        </div>
                        <p className="text-slate-900 font-semibold leading-relaxed">{card.proposedText}</p>
                      </div>
                    </div>

                    <div className="p-2.5 rounded-lg bg-[#F4F3F0] border border-[#B8B6B2] text-[11px]">
                      <span className="font-bold text-slate-700">النص المعتمد حالياً بالمسودة: </span>
                      <span className="text-slate-900" data-testid={`active-text-${card.field}`}>
                        {card.activeText}
                      </span>
                    </div>

                    {modifyingSuggestionField === card.field && isEditableDraft && (
                      <div className="space-y-2 pt-2">
                        <label className="block font-bold text-slate-800">
                          تعديل النص المقترح قبل اعتماده:
                        </label>
                        <textarea
                          rows={3}
                          data-testid={`modify-suggestion-textarea-${card.field}`}
                          value={modifiedSuggestionText}
                          onChange={e => setModifiedSuggestionText(e.target.value)}
                          className="w-full p-2.5 bg-[#F4F3F0] border border-[#006547] rounded-lg text-slate-900"
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setModifyingSuggestionField(null)}
                            className="px-3 py-1 rounded-lg bg-[#DFDEDB] border border-[#B8B6B2] font-bold"
                          >
                            إلغاء
                          </button>
                          <button
                            type="button"
                            data-testid={`confirm-modify-suggestion-btn-${card.field}`}
                            onClick={() =>
                              handleSuggestionDecision(
                                card.field,
                                'MODIFY',
                                undefined,
                                modifiedSuggestionText
                              )
                            }
                            className="px-3.5 py-1 rounded-lg bg-[#006547] text-white font-bold"
                          >
                            حفظ واعتماد النص المعدل
                          </button>
                        </div>
                      </div>
                    )}

                    {isEditableDraft && modifyingSuggestionField !== card.field && (
                      <div className="flex items-center gap-2 pt-1 flex-wrap">
                        <button
                          type="button"
                          disabled={isSavingOrRecalculating}
                          data-testid={`accept-suggestion-btn-${card.field}`}
                          onClick={() => handleSuggestionDecision(card.field, 'ACCEPT')}
                          className="px-3 py-1.5 rounded-lg bg-[#006547] hover:bg-[#09331F] text-white font-bold flex items-center gap-1"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>قبول المقترح</span>
                        </button>
                        <button
                          type="button"
                          disabled={isSavingOrRecalculating}
                          data-testid={`open-modify-suggestion-btn-${card.field}`}
                          onClick={() => {
                            setModifyingSuggestionField(card.field);
                            setModifiedSuggestionText(card.proposedText);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-sky-700 hover:bg-sky-800 text-white font-bold flex items-center gap-1"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>تعديل قبل الاعتماد</span>
                        </button>
                        <button
                          type="button"
                          disabled={isSavingOrRecalculating}
                          data-testid={`reject-suggestion-btn-${card.field}`}
                          onClick={() => handleSuggestionDecision(card.field, 'REJECT')}
                          className="px-3 py-1.5 rounded-lg bg-[#DFDEDB] hover:bg-[#CECCC9] text-slate-800 border border-[#B8B6B2] font-bold flex items-center gap-1"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>رفض والإبقاء على الأصل</span>
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* TAB 4: Source Evidence, Consistency Checks & Field-Level Audit History */}
            {activeWorkspaceTab === 'evidence_and_audit' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
                {/* Right: Evidence & Consistency Issues */}
                <div className="bg-[#E2E1DE] p-4 rounded-xl border border-[#C6C4C1] space-y-3">
                  <h4 className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-[#006547]" />
                    <span>الأدلة المستندية وفحوصات الاتساق العشرية للمخاطرة ({currentRiskObj.risk_id})</span>
                  </h4>

                  <div className="space-y-2">
                    <div className="font-bold text-slate-800">فحوصات الاتساق المرصودة:</div>
                    {(pkg.consistency_report?.issues || []).map((iss: any) => (
                      <div
                        key={iss.issue_id}
                        className="p-2.5 rounded-lg bg-[#F4F3F0] border border-[#C6C4C1] space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-bold text-[10px] text-[#006547]">
                            {iss.category}
                          </span>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-100 text-amber-900">
                            {iss.severity}
                          </span>
                        </div>
                        <p className="text-slate-800">{iss.issue_description_ar}</p>
                        <div className="text-[11px] text-slate-600">
                          التصحيح المقترح: {iss.suggested_correction_ar}
                        </div>
                      </div>
                    ))}
                    {(!pkg.consistency_report?.issues || pkg.consistency_report.issues.length === 0) && (
                      <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900">
                        كافة الحقول متسقة عبر الأبعاد العشرة.
                      </div>
                    )}
                  </div>
                </div>

                {/* Left: Field-Level Audit History */}
                <div className="bg-[#E2E1DE] p-4 rounded-xl border border-[#C6C4C1] space-y-3">
                  <h4 className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
                    <History className="w-4 h-4 text-[#006547]" />
                    <span>سجل التدقيق على مستوى الحقول (Field-Level Before/After Audit Trail)</span>
                  </h4>

                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {(hitlState?.field_audit_history || []).map((h: any) => (
                      <div
                        key={h.id}
                        className="p-2.5 rounded-lg bg-[#F4F3F0] border border-[#C6C4C1] space-y-1"
                      >
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="font-bold text-slate-900">
                            {h.actor_name || h.actor_id} ({h.actor_role}) — {h.action_type}
                          </span>
                          <span className="font-mono text-slate-500">{h.ts}</span>
                        </div>
                        <div className="text-[11px] font-mono text-slate-800">
                          [{h.risk_id || 'ASSESSMENT'}] {h.field_name}:{' '}
                          <span className="line-through text-slate-500">{h.previous_value ?? 'NULL'}</span> →{' '}
                          <strong className="text-[#006547]">{h.new_value ?? 'NULL'}</strong>
                        </div>
                        {h.evidence_or_reason && (
                          <div className="text-[11px] text-slate-600">السبب/الدليل: {h.evidence_or_reason}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
