import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { PageId } from '../components/Sidebar.js';
import { AppNavigationState } from '../App.js';
import { CreateBusinessUnitModal } from '../components/CreateBusinessUnitModal.js';
import {
  FileUp,
  HelpCircle,
  Calculator,
  ArrowRight,
  ArrowLeft,
  UploadCloud,
  FileText,
  AlertTriangle,
  Plus,
  TableProperties,
  CheckCircle2,
  ShieldCheck,
  Bot,
} from 'lucide-react';

interface BackendRCSAPageProps {
  initialUnitId?: string;
  initialSessionId?: string;
  initialMode?: 'NEW' | 'UPDATE';
  onNavigate?: (next: Partial<AppNavigationState> & { page: PageId }, replace?: boolean) => void;
}

export const BackendRCSAPage: React.FC<BackendRCSAPageProps> = ({
  initialUnitId,
  initialSessionId,
  initialMode,
  onNavigate,
}) => {
  const { token } = useAuth();
  const [currentStep, setCurrentStep] = useState(1);
  const [units, setUnits] = useState<any[]>([]);
  const [unitsLoading, setUnitsLoading] = useState(true);
  const [selectedBU, setSelectedBU] = useState<string>(initialUnitId || '');
  const [showAddUnitModal, setShowAddUnitModal] = useState<boolean>(false);

  // Unified Workflow Session State (Phase 3A)
  const [sessionId, setSessionId] = useState<string | null>(initialSessionId || null);
  const [workflowMode, setWorkflowMode] = useState<'NEW' | 'UPDATE'>(initialMode || 'NEW');
  const [baseAssessmentId, setBaseAssessmentId] = useState<string>('');
  const [unitApprovedAssessments, setUnitApprovedAssessments] = useState<any[]>([]);
  const [activeSession, setActiveSession] = useState<any | null>(null);
  const [, setSessionLoading] = useState<boolean>(false);

  // Fresh assessment is the default. Historical sources or dual-source combined mode are explicit choices.
  const [sourceMode, setSourceMode] = useState<'NEW_DOCS' | 'HISTORICAL' | 'COMBINED'>('NEW_DOCS');
  const [useHistoricalSources, setUseHistoricalSources] = useState(false);
  const [customDocTypeLabel, setCustomDocTypeLabel] = useState('');
  const [uploadedInSession, setUploadedInSession] = useState<string[]>([]);

  // Unit context for steps 2-6
  const [unitContext, setUnitContext] = useState<any | null>(null);
  const [, setContextLoading] = useState(false);
  const [, setContextError] = useState<string | null>(null);

  // Step 2: Document upload state
  const [docType, setDocType] = useState<string>('SOP');
  const [docTitleAr, setDocTitleAr] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [uploadNotice, setUploadNotice] = useState<{
    type: 'success' | 'warning' | 'error';
    text: string;
  } | null>(null);

  // Step 4: Editable candidate risks & controls
  const [candidateRisks, setCandidateRisks] = useState<any[]>([]);

  // Step 5: Python engine calculation preview
  const [calcPreview, setCalcPreview] = useState<any | null>(null);
  const [calcLoading, setCalcLoading] = useState(false);
  const [calcError, setCalcError] = useState<string | null>(null);

  // Step 6: Save draft
  const [draftTitleAr, setDraftTitleAr] = useState<string>('');
  const [savingDraft, setSavingDraft] = useState(false);
  const [createdDraftState, setCreatedDraftState] = useState<any | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const steps = [
    { num: 1, title: 'اختيار الوحدة', desc: 'تحديد الإدارة المصرفية' },
    { num: 2, title: 'المستندات الداعمة', desc: 'SOPs، التفتيش، والحوادث' },
    { num: 3, title: 'معاينة الأدلة والاستخراج', desc: 'المقاطع والمرجعيات المسجلة' },
    { num: 4, title: 'استيفاء المدخلات الناقصة', desc: 'استكمال الأثر والتكرار والضوابط' },
    { num: 5, title: 'الحساب المنهجي', desc: 'تشغيل محرك بايثون المعتمد' },
    { num: 6, title: 'حفظ المسودة والمراجعة', desc: 'حفظ وفتح في مصفوفة RCSA' },
  ];

  // Load authorized Business Units
  useEffect(() => {
    if (!token) return;
    setUnitsLoading(true);
    fetch('/api/business-units', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        const list = data.business_units || [];
        setUnits(list);
        if (initialUnitId && list.some((u: any) => u.id === initialUnitId)) {
          setSelectedBU(initialUnitId);
        } else if (!selectedBU && list.length > 0) {
          setSelectedBU(list[0].id);
        }
      })
      .catch((err) => console.error('Failed to load authorized units:', err))
      .finally(() => setUnitsLoading(false));
  }, [token, initialUnitId]);

  const loadGuidedContext = useCallback(
    (unitId: string, preserveCandidates = false) => {
      if (!token || !unitId) return;
      setContextLoading(true);
      setContextError(null);
      fetch(`/api/guided-rcsa/units/${unitId}/context`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(async (res) => {
          const body = await res.json();
          if (!res.ok) throw new Error(body.error || 'تعذر تحميل سياق الوحدة التنظيمية.');
          return body;
        })
        .then((ctx) => {
          setUnitContext(ctx);
          setDraftTitleAr(`تقييم المخاطر والرقابة الذاتية - ${ctx.unit.name_ar}`);
          if (!preserveCandidates && !sessionId) {
            setCandidateRisks(
              useHistoricalSources ? JSON.parse(JSON.stringify(ctx.candidate_risks || [])) : []
            );
            setCalcPreview(null);
            setCreatedDraftState(null);
          }
        })
        .catch((err: any) => {
          setContextError(err.message);
        })
        .finally(() => setContextLoading(false));
    },
    [token, sessionId, useHistoricalSources]
  );

  // Fetch approved assessments for selectedBU to populate UPDATE baseline dropdown
  useEffect(() => {
    if (!token || !selectedBU) return;
    fetch(`/api/units/${selectedBU}/assessments-history`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        const approved = (data.assessments || []).filter((a: any) => a.status === 'APPROVED');
        setUnitApprovedAssessments(approved);
        if (approved.length > 0 && !baseAssessmentId) {
          setBaseAssessmentId(approved[0].id);
        }
      })
      .catch((err) => console.error('Failed to load approved assessments:', err));
  }, [token, selectedBU, baseAssessmentId]);

  // Load Session details by ID or check for active session for selectedBU
  useEffect(() => {
    if (!token || !selectedBU) return;
    if (initialSessionId) {
      setSessionLoading(true);
      fetch(`/api/workflow/sessions/${initialSessionId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.session) {
            const sess = data.session;
            setSessionId(sess.id);
            setActiveSession(sess);
            setWorkflowMode(sess.workflow_mode);
            if (sess.base_assessment_id) setBaseAssessmentId(sess.base_assessment_id);
            if (sess.current_step) setCurrentStep(sess.current_step);
            if (sess.candidate_risks && sess.candidate_risks.length > 0) {
              setCandidateRisks(sess.candidate_risks);
            }
            if (sess.calc_preview) setCalcPreview(sess.calc_preview);
            if (sess.uploaded_document_ids) setUploadedInSession(sess.uploaded_document_ids);
            const useHist = Boolean(sess.use_historical_sources);
            setUseHistoricalSources(useHist);
            setSourceMode(sess.workflow_mode === 'UPDATE' ? 'HISTORICAL' : useHist ? 'COMBINED' : 'NEW_DOCS');
          }
        })
        .catch((err) => console.error('Failed to load initial session:', err))
        .finally(() => setSessionLoading(false));
    } else {
      fetch(`/api/workflow/sessions/active?unit_id=${selectedBU}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.session) {
            setActiveSession(data.session);
          }
        })
        .catch((err) => console.error('Failed to check active session:', err));
    }
  }, [token, selectedBU, initialSessionId]);

  useEffect(() => {
    if (selectedBU) {
      setUploadedInSession([]);
      loadGuidedContext(selectedBU, false);
    }
  }, [selectedBU, loadGuidedContext]);

  // Start new persistent workflow session (NEW_DOCS, HISTORICAL/UPDATE, or COMBINED dual-source)
  const handleStartSession = async (
    mode: 'NEW' | 'UPDATE',
    baseId?: string,
    nextSourceMode?: 'NEW_DOCS' | 'HISTORICAL' | 'COMBINED'
  ) => {
    if (!token || !selectedBU) return;
    setSessionLoading(true);
    const resolvedSourceMode = nextSourceMode || (mode === 'UPDATE' ? 'HISTORICAL' : 'NEW_DOCS');
    const useHist = resolvedSourceMode === 'HISTORICAL' || resolvedSourceMode === 'COMBINED';
    try {
      const chosenBase = useHist ? baseId || baseAssessmentId || undefined : undefined;
      const res = await fetch('/api/workflow/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          unit_id: selectedBU,
          workflow_mode: mode,
          base_assessment_id: chosenBase,
          session_title:
            resolvedSourceMode === 'COMBINED'
              ? `تقييم جديد (مستندات جديدة + بيانات الوحدة السابقة) - ${unitContext?.unit?.name_ar || selectedBU}`
              : `${mode === 'NEW' ? 'تقييم جديد' : 'تحديث تقييم معتمد'} - ${unitContext?.unit?.name_ar || selectedBU}`,
          use_historical_sources: useHist,
          preload_baseline_risks: resolvedSourceMode === 'COMBINED' || mode === 'UPDATE',
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'تعذر بدء جلسة التقييم.');
      const sess = body.session;
      setSessionId(sess.id);
      setActiveSession(sess);
      setWorkflowMode(sess.workflow_mode);
      setSourceMode(resolvedSourceMode);
      if (sess.base_assessment_id) setBaseAssessmentId(sess.base_assessment_id);
      setCandidateRisks(sess.candidate_risks || []);
      setCalcPreview(null);
      setUploadedInSession([]);
      setUseHistoricalSources(Boolean(sess.use_historical_sources));
      onNavigate?.(
        {
          page: 'backend-rcsa',
          unitId: selectedBU,
          sessionId: sess.id,
          mode: sess.workflow_mode,
        },
        true
      );
      return sess;
    } catch (err: any) {
      setContextError(err.message);
      return null;
    } finally {
      setSessionLoading(false);
    }
  };

  // Resume an active session
  const handleResumeActiveSession = (sess: any) => {
    setSessionId(sess.id);
    setActiveSession(sess);
    setWorkflowMode(sess.workflow_mode);
    if (sess.base_assessment_id) setBaseAssessmentId(sess.base_assessment_id);
    if (sess.current_step) setCurrentStep(sess.current_step);
    setCandidateRisks(sess.candidate_risks || []);
    if (sess.calc_preview) setCalcPreview(sess.calc_preview);
    setUploadedInSession(sess.uploaded_document_ids || []);
    const useHist = Boolean(sess.use_historical_sources);
    setUseHistoricalSources(useHist);
    setSourceMode(sess.workflow_mode === 'UPDATE' ? 'HISTORICAL' : useHist ? 'COMBINED' : 'NEW_DOCS');
    onNavigate?.(
      {
        page: 'backend-rcsa',
        unitId: selectedBU,
        sessionId: sess.id,
        mode: sess.workflow_mode,
      },
      true
    );
  };

  // Auto-sync candidate risks and step to SQLite session
  const syncSessionToServer = async (risks: any[], step: number, preview?: any) => {
    if (!token || !sessionId) return;
    try {
      await fetch(`/api/workflow/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          current_step: step,
          candidate_risks: risks,
          calc_preview: preview !== undefined ? preview : calcPreview,
        }),
      });
    } catch (err) {
      console.warn('[Workflow Session] Auto-sync failed:', err);
    }
  };

  const currentSessionDocuments = (unitContext?.registered_documents || []).filter(
    (d: any) =>
      uploadedInSession.includes(d.id) || (activeSession?.uploaded_document_ids || []).includes(d.id)
  );
  const visibleSourceChunks = (unitContext?.sop_chunks || []).filter(
    (c: any) => useHistoricalSources || uploadedInSession.includes(c.document_id)
  );
  const visibleIncidents = useHistoricalSources ? unitContext?.incidents || [] : [];
  const visibleFindings = useHistoricalSources ? unitContext?.audit_findings || [] : [];

  const handleFileSelection = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setSelectedFile(file);
    if (file && !docTitleAr.trim()) {
      setDocTitleAr(file.name.replace(/\.[^/.]+$/, ''));
    }
  };

  const handleUploadSupportingDocument = async () => {
    if (!token || !selectedBU || !selectedFile) return;
    setUploadingDoc(true);
    setUploadNotice(null);

    try {
      const ext = selectedFile.name.split('.').pop()?.toLowerCase() || '';
      let textContent: string | undefined = undefined;
      let base64Content: string | undefined = undefined;

      if (selectedFile.size > 6 * 1024 * 1024)
        throw new Error('الحد الأقصى لحجم المستند 6 ميجابايت.');
      if (ext === 'txt' || ext === 'csv' || selectedFile.type.startsWith('text/')) {
        textContent = await selectedFile.text();
      } else {
        if (selectedFile.size > 6 * 1024 * 1024) {
          throw new Error('حجم الملف أكبر من 6 ميجابايت؛ يُرجى تقسيمه أو اختيار نسخة أصغر.');
        }
        const bytes = new Uint8Array(await selectedFile.arrayBuffer());
        const blocks: string[] = [];
        for (let i = 0; i < bytes.length; i += 32768) {
          blocks.push(String.fromCharCode(...bytes.subarray(i, i + 32768)));
        }
        base64Content = btoa(blocks.join(''));
      }

      const res = await fetch(`/api/guided-rcsa/units/${selectedBU}/documents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          doc_type: docType === 'OTHER' ? 'SOP' : docType,
          title_ar:
            (docType === 'OTHER' && customDocTypeLabel.trim() ? `[${customDocTypeLabel.trim()}] ` : '') +
            (docTitleAr.trim() || selectedFile.name),
          file_name: selectedFile.name,
          mime_type: selectedFile.type || `application/${ext || 'octet-stream'}`,
          text_content: textContent,
          base64_content: base64Content,
          file_size_bytes: selectedFile.size,
          session_id: sessionId,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'فشل رفع المستند الداعم.');

      const isManualRequired = body.document?.parse_status?.includes('MANUAL_EXTRACT_REQUIRED');
      setUploadNotice({
        type: isManualRequired ? 'warning' : 'success',
        text: body.document?.extraction_notice_ar || 'تم تسجيل المستند بنجاح.',
      });
      if (body.document?.id) {
        setUploadedInSession((prev) => [...prev, body.document.id]);
      }
      setSelectedFile(null);
      setDocTitleAr('');
      loadGuidedContext(selectedBU, true);
    } catch (err: any) {
      setUploadNotice({ type: 'error', text: err.message });
    } finally {
      setUploadingDoc(false);
    }
  };

  // Step 4 helpers: update candidate risk or control with persistent auto-sync
  const handleUpdateCandidateRisk = (riskIdx: number, field: string, value: any) => {
    setCandidateRisks((prev) => {
      const next = [...prev];
      const item = { ...next[riskIdx], [field]: value };
      next[riskIdx] = item;
      if (sessionId) syncSessionToServer(next, 4);
      return next;
    });
  };

  const handleUpdateCandidateControl = (
    riskIdx: number,
    ctrlIdx: number,
    field: string,
    value: any
  ) => {
    setCandidateRisks((prev) => {
      const next = [...prev];
      const risk = { ...next[riskIdx] };
      const controls = [...(risk.controls || [])];
      controls[ctrlIdx] = { ...controls[ctrlIdx], [field]: value };
      risk.controls = controls;
      next[riskIdx] = risk;
      if (sessionId) syncSessionToServer(next, 4);
      return next;
    });
  };

  const handleAddCandidateRisk = () => {
    const unitCode = unitContext?.unit?.code?.split('-')[0] || 'UNIT';
    const nextNum = candidateRisks.length + 1;
    const nextList = [
      ...candidateRisks,
      {
        risk_id: `RSK-${unitCode}-NEW-${Date.now()}-${nextNum}`,
        process_name_ar: '',
        risk_title_ar: '',
        description_ar: '',
        expected_loss_egp: null,
        frequency_score: null,
        loss_Notes_ar: '',
        frequency_notes_ar: '',
        controls: [],
        missing_fields: [
          'risk_description',
          'individual_financial_impact',
          'expected_frequency',
          'control_evidence',
        ],
      },
    ];
    setCandidateRisks(nextList);
    setCalcPreview(null);
    if (sessionId) syncSessionToServer(nextList, 4, null);
  };

  const handleAddControlToCandidateRisk = (riskIdx: number) => {
    setCandidateRisks((prev) => {
      const next = [...prev];
      const risk = { ...next[riskIdx] };
      const controls = [...(risk.controls || [])];
      const newCtrlId = `${risk.risk_id}-CTL-${controls.length + 1}`;
      controls.push({
        control_id: newCtrlId,
        description_ar: '',
        design_classification: null,
        automation_level: null,
        effectiveness_raw: 'PENDING_REVIEW',
        implementation_status: 'PROPOSED',
        scope_relevance: 'EXCLUDED',
      });
      risk.controls = controls;
      next[riskIdx] = risk;
      if (sessionId) syncSessionToServer(next, 4);
      return next;
    });
  };

  // Step 5: Execute authoritative Python RCSA calculation
  const handleRunPythonPreview = async () => {
    if (!token || !selectedBU) return;
    setCalcLoading(true);
    setCalcError(null);
    try {
      const res = await fetch(`/api/guided-rcsa/units/${selectedBU}/preview-calculate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ candidate_risks: candidateRisks }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'تعذر تشغيل محرك بايثون للحساب المنهجي.');
      setCalcPreview(body);
      if (sessionId) syncSessionToServer(candidateRisks, 5, body);
    } catch (err: any) {
      setCalcError(err.message);
    } finally {
      setCalcLoading(false);
    }
  };

  // Step 6: Save as real SQLite draft and open in RCSATablePage
  const handleSaveGuidedDraft = async (openImmediately = true) => {
    if (!token || !selectedBU) return;
    setSavingDraft(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/guided-rcsa/units/${selectedBU}/create-draft`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title_ar: draftTitleAr,
          candidate_risks: candidateRisks,
          session_id: sessionId,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'تعذر حفظ مسودة التقييم في قاعدة البيانات.');
      setCreatedDraftState(body.state);
      const newId = body.state?.assessment?.id;
      if (openImmediately && newId && onNavigate) {
        onNavigate({
          page: 'rcsa-table',
          unitId: selectedBU,
          assessmentId: newId,
          sessionId: sessionId || undefined,
          mode: workflowMode,
        });
      }
    } catch (err: any) {
      setSaveError(err.message);
    } finally {
      setSavingDraft(false);
    }
  };

  return (
    <div className="space-y-5 sm:space-y-6 animate-in fade-in duration-300 font-['Cairo']">
      {/* Page Header */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-[#DCDAD5] shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-[#09331F] text-[#F79C1E] flex items-center justify-center shrink-0 border border-[#006547]">
            <FileUp className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg sm:text-xl font-extrabold text-[#09331F]">إعداد تقييم جديد</h2>
              <span className="text-slate-300">·</span>
              <span className="text-xs font-bold text-[#006547]">الحفظ والمراجعة متاحان</span>
            </div>
            <p className="text-xs text-slate-600 mt-1">
              ارفع مستنداتك، واستكمل المخاطر والضوابط، ثم راجع النتائج واحفظ المسودة.
            </p>
          </div>
        </div>
      </div>

      {/* Stepper Progress Bar */}
      <div className="bg-white p-4 sm:p-6 rounded-2xl border border-[#DCDAD5] shadow-xs">
        <div className="mb-4 flex flex-wrap items-center gap-4 rounded-xl border border-[#E5E3DE] bg-[#F8F8F6] p-3 text-xs" data-testid="assessment-source-mode-bar">
          <span className="font-bold text-[#09331F]">مصدر التقييم:</span>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              data-testid="source-mode-new-docs"
              checked={sourceMode === 'NEW_DOCS'}
              onChange={() => {
                setSourceMode('NEW_DOCS');
                setWorkflowMode('NEW');
                setUseHistoricalSources(false);
                setCandidateRisks([]);
                setCalcPreview(null);
                setUploadedInSession([]);
              }}
            />
            مستندات جديدة فقط
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              data-testid="source-mode-historical"
              checked={sourceMode === 'HISTORICAL'}
              onChange={() => {
                setSourceMode('HISTORICAL');
                setWorkflowMode('UPDATE');
                setUseHistoricalSources(true);
                setCandidateRisks(JSON.parse(JSON.stringify(unitContext?.candidate_risks || [])));
                setCalcPreview(null);
              }}
            />
            الاستعانة ببيانات الوحدة السابقة
          </label>
          <label className="flex items-center gap-2 cursor-pointer font-bold text-[#006547]">
            <input
              type="radio"
              data-testid="source-mode-combined"
              checked={sourceMode === 'COMBINED'}
              onChange={() => {
                setSourceMode('COMBINED');
                setWorkflowMode('NEW');
                setUseHistoricalSources(true);
                setCandidateRisks(JSON.parse(JSON.stringify(unitContext?.candidate_risks || [])));
                setCalcPreview(null);
              }}
            />
            مستندات جديدة + الاستعانة ببيانات الوحدة السابقة معاً
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2">
          {steps.map((s) => {
            const isCompleted = s.num < currentStep;
            const isCurrent = s.num === currentStep;

            return (
              <div
                key={s.num}
                onClick={() => {
                  setCurrentStep(s.num);
                  if (s.num === 5 && !calcPreview) {
                    handleRunPythonPreview();
                  }
                }}
                className={`p-3 rounded-xl border cursor-pointer transition-all ${
                  isCurrent
                    ? 'border-[#006547] bg-emerald-50/70 shadow-xs'
                    : isCompleted
                      ? 'border-emerald-200 bg-emerald-50/30 text-emerald-950'
                      : 'border-[#E5E3DE] bg-[#F8F8F6] hover:border-[#006547]/40'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <div
                    className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold tabular-nums shrink-0 ${
                      isCurrent
                        ? 'bg-[#006547] text-white'
                        : isCompleted
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {s.num}
                  </div>
                  <div className="text-xs font-bold text-[#09331F] truncate">{s.title}</div>
                </div>
                <div className="text-[10px] text-slate-600">{s.desc}</div>
              </div>
            );
          })}
        </div>

        {/* Step Body */}
        <div className="mt-6 sm:mt-8 border-t border-[#E5E3DE] pt-5 sm:pt-6">
          {/* STEP 1: SELECT AUTHORIZED BUSINESS UNIT */}
          {currentStep === 1 && (
            <div className="space-y-4 max-w-2xl mx-auto">
              <CreateBusinessUnitModal
                isOpen={showAddUnitModal}
                onClose={() => setShowAddUnitModal(false)}
                existingUnitCodes={units.map((u) => u.code)}
                onUnitCreated={(newUnit) => {
                  setUnits((prev) => {
                    if (prev.some((u) => u.id === newUnit.id)) return prev;
                    return [...prev, newUnit];
                  });
                  setSelectedBU(newUnit.id);
                }}
              />
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#F8F8F6] p-3.5 rounded-xl border border-[#E5E3DE]">
                <div className="space-y-0.5">
                  <h3 className="text-sm font-extrabold text-[#09331F]">
                    الخطوة 1: حدد الوحدة التنظيمية المصرفية المستهدفة
                  </h3>
                  <p className="text-xs text-slate-600">
                    اختر من الوحدات المفعّلة أدناه أو أضف أي إدارة / وحدة تنظيمية جديدة للعمل عليها.
                  </p>
                </div>
                <button
                  type="button"
                  data-testid="wizard-add-unit-btn"
                  onClick={() => setShowAddUnitModal(true)}
                  className="min-h-10 px-3.5 py-2 rounded-xl bg-[#006547] hover:bg-[#09331F] text-white text-xs font-bold flex items-center gap-1.5 shadow-xs shrink-0 cursor-pointer whitespace-nowrap"
                >
                  <Plus className="w-4 h-4 text-[#F79C1E]" />
                  <span>+ إضافة / اختيار وحدة تنظيمية أخرى</span>
                </button>
              </div>

              {unitsLoading ? (
                <div className="p-6 text-center text-xs text-slate-600">
                  جارٍ تحميل الوحدات المصرح بها...
                </div>
              ) : (
                <div className="space-y-2.5">
                  {units.map((bu) => (
                    <label
                      key={bu.id}
                      className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border cursor-pointer transition-all ${
                        selectedBU === bu.id
                          ? 'border-[#006547] bg-emerald-50/60 ring-1 ring-[#006547]/40'
                          : 'border-[#DCDAD5] bg-white hover:border-[#006547]/40'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="radio"
                          name="bu"
                          checked={selectedBU === bu.id}
                          onChange={() => setSelectedBU(bu.id)}
                          className="mt-1 text-[#006547] focus:ring-[#006547]"
                        />
                        <div>
                          <div className="text-xs font-extrabold text-[#09331F]">{bu.name_ar}</div>
                          <div className="text-[10px] text-slate-500 font-mono tabular-nums mt-0.5">
                            {bu.code} · {bu.id}
                          </div>
                          <div className="text-[11px] text-slate-700 mt-1">{bu.description}</div>
                        </div>
                      </div>
                      <div className="text-right sm:text-left shrink-0 space-y-0.5 tabular-nums">
                        <span className="inline-block text-[11px] font-bold text-[#006547]">
                          المخاطر المسجلة: {bu.total_risks_count || 0}
                        </span>
                        <div className="text-[10px] text-slate-500">
                          {bu.latest_version_badge_ar}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              )}

              {/* Workflow Mode Selection Cards (Phase 3A) */}
              <div className="bg-[#F8F8F6] p-4 sm:p-5 rounded-2xl border border-[#E5E3DE] space-y-4 mt-6">
                <div className="text-xs font-bold text-[#09331F] flex items-center justify-between flex-wrap gap-2">
                  <span>اختر نمط جلسة التقييم (Workflow Mode):</span>
                  {sessionId && (
                    <span className="text-[11px] text-[#006547] font-mono tabular-nums">
                      جلسة جارية: {sessionId} ({workflowMode === 'NEW' ? 'تقييم جديد' : 'تحديث معتمد'})
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* Option 1: New RCSA (New Docs Only) */}
                  <div
                    data-testid="card-mode-new-docs"
                    onClick={() => {
                      setWorkflowMode('NEW');
                      setSourceMode('NEW_DOCS');
                      setUseHistoricalSources(false);
                      handleStartSession('NEW', undefined, 'NEW_DOCS');
                    }}
                    className={`p-4 rounded-xl border cursor-pointer transition-all ${
                      sourceMode === 'NEW_DOCS'
                        ? 'border-[#006547] bg-white ring-1 ring-[#006547]/40 shadow-xs'
                        : 'border-[#DCDAD5] bg-white hover:border-[#006547]/40'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded-full border-2 border-[#006547] flex items-center justify-center">
                          {sourceMode === 'NEW_DOCS' && (
                            <div className="w-2 h-2 rounded-full bg-[#006547]" />
                          )}
                        </div>
                        <span className="text-xs font-bold text-[#09331F]">
                          مستندات جديدة فقط (New RCSA)
                        </span>
                      </div>
                      <span className="text-[10px] text-sky-800 font-bold">بداية نظيفة</span>
                    </div>
                    <p className="text-[11px] text-slate-600 pr-6 leading-relaxed">
                      بدء تقييم جديد اعتماداً على المستندات والأدلة المرفوعة حديثاً دون استيراد مخاطر سابقة.
                    </p>
                  </div>

                  {/* Option 2: Update Existing Approved RCSA */}
                  <div
                    data-testid="card-mode-historical"
                    onClick={() => {
                      setWorkflowMode('UPDATE');
                      setSourceMode('HISTORICAL');
                      setUseHistoricalSources(true);
                      handleStartSession('UPDATE', undefined, 'HISTORICAL');
                    }}
                    className={`p-4 rounded-xl border cursor-pointer transition-all ${
                      sourceMode === 'HISTORICAL'
                        ? 'border-[#006547] bg-white ring-1 ring-[#006547]/40 shadow-xs'
                        : 'border-[#DCDAD5] bg-white hover:border-[#006547]/40'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded-full border-2 border-[#006547] flex items-center justify-center">
                          {sourceMode === 'HISTORICAL' && (
                            <div className="w-2 h-2 rounded-full bg-[#006547]" />
                          )}
                        </div>
                        <span className="text-xs font-bold text-[#09331F]">
                          الاستعانة ببيانات الوحدة السابقة (Update)
                        </span>
                      </div>
                      <span className="text-[10px] text-[#006547] font-bold">تحديث دوري</span>
                    </div>
                    <p className="text-[11px] text-slate-600 pr-6 leading-relaxed">
                      استيراد مخاطر وضوابط النسخة المعتمدة وسجل الحوادث والتفتيش مع إبقاء النسخة الأصلية غير قابلة للتغيير.
                    </p>

                    {(sourceMode === 'HISTORICAL' || sourceMode === 'COMBINED') && unitApprovedAssessments.length > 0 && (
                      <div
                        className="mt-3 pt-3 border-t border-[#E5E3DE] pr-6"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <label className="block text-[10px] font-bold text-slate-700 mb-1">
                          حدد التقييم المعتمد المرجعي:
                        </label>
                        <select
                          value={baseAssessmentId}
                          onChange={(e) => {
                            if (e.target.value === 'OTHER') return;
                            const newBaseId = e.target.value;
                            setBaseAssessmentId(newBaseId);
                            handleStartSession(sourceMode === 'COMBINED' ? 'NEW' : 'UPDATE', newBaseId, sourceMode);
                          }}
                          className="w-full min-h-9 px-2.5 py-1.5 text-xs font-bold border border-[#DCDAD5] rounded-xl bg-[#F8F8F6] text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#006547]"
                        >
                          {unitApprovedAssessments.map((a: any) => (
                            <option key={a.id} value={a.id}>
                              {a.timestamps?.primary_version_label_ar || a.title_ar || a.title} (نسخة{' '}
                              {a.version_number})
                            </option>
                          ))}
                          <option value="OTHER">أخرى</option>
                        </select>
                      </div>
                    )}
                  </div>

                  {/* Option 3: Combined Dual-Source (New Documents + Historical Unit Data Together) */}
                  <div
                    data-testid="card-mode-combined"
                    onClick={() => {
                      setWorkflowMode('NEW');
                      setSourceMode('COMBINED');
                      setUseHistoricalSources(true);
                      handleStartSession('NEW', undefined, 'COMBINED');
                    }}
                    className={`p-4 rounded-xl border cursor-pointer transition-all ${
                      sourceMode === 'COMBINED'
                        ? 'border-[#006547] bg-white ring-1 ring-[#006547]/40 shadow-xs'
                        : 'border-[#DCDAD5] bg-white hover:border-[#006547]/40'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded-full border-2 border-[#006547] flex items-center justify-center">
                          {sourceMode === 'COMBINED' && (
                            <div className="w-2 h-2 rounded-full bg-[#006547]" />
                          )}
                        </div>
                        <span className="text-xs font-bold text-[#09331F]">
                          مستندات جديدة + بيانات الوحدة السابقة معاً
                        </span>
                      </div>
                      <span className="text-[10px] text-amber-800 font-bold">مصدر مزدوج</span>
                    </div>
                    <p className="text-[11px] text-slate-600 pr-6 leading-relaxed">
                      الجمع بين رفع مستندات جديدة والاستعانة بمخاطر الوحدة السابقة وسجلات الحوادث والتفتيش في تقييم واحد متكامل.
                    </p>
                  </div>
                </div>

                {/* Active session resumption banner if exists and not currently selected */}
                {activeSession && activeSession.id !== sessionId && (
                  <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-amber-950">
                    <div className="flex items-center gap-2">
                      <HelpCircle className="w-4 h-4 text-amber-700 shrink-0" />
                      <span>
                        توجد جلسة عمل نشطة سابقة لهذه الوحدة:{' '}
                        <strong>{activeSession.session_title}</strong>
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleResumeActiveSession(activeSession)}
                      className="min-h-8 px-3 py-1 bg-amber-700 hover:bg-amber-800 text-white rounded-lg text-xs font-bold cursor-pointer"
                    >
                      استئناف الجلسة السابقة
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 2: SUPPORTING DOCUMENTS & REAL UPLOAD */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-extrabold text-[#09331F]">
                    الخطوة 2: المستندات والأدلة الداعمة لوحدة (
                    {unitContext?.unit?.name_ar || selectedBU})
                  </h3>
                  <p className="text-xs text-slate-600 mt-0.5">
                    استعرض المستندات المرجعية المسجلة للوحدة أو ارفع ملفات داعمة جديدة (إجراءات عمل قياسية SOP، تقارير تفتيش، سجلات حوادث).
                  </p>
                </div>
              </div>

              {/* AI Agent Cross-Workflow Bridge Banner (Phase 3A) */}
              <div className="bg-emerald-50/70 p-4 rounded-2xl border border-[#006547]/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-[#006547] text-[#F79C1E] flex items-center justify-center shrink-0">
                    <Bot className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-[#09331F]">
                      وكيل الذكاء الاصطناعي المصرفي (AI Agent)
                    </div>
                    <div className="text-[11px] text-slate-700">
                      يمكنك الانتقال لفحص ومطابقة المستندات المرفوعة مع كشف ESG وقاعدة الحوادث ضمن نفس الجلسة والعودة دون فقدان أي بيانات.
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (sessionId) {
                      syncSessionToServer(candidateRisks, currentStep);
                    }
                    onNavigate?.({
                      page: 'agent',
                      unitId: selectedBU,
                      sessionId: sessionId || undefined,
                      mode: workflowMode,
                    });
                  }}
                  className="min-h-10 px-4 py-2 rounded-xl bg-[#006547] text-white hover:bg-[#09331F] text-xs font-bold flex items-center gap-1.5 shadow-xs shrink-0 cursor-pointer whitespace-nowrap"
                >
                  <span>الانتقال إلى وكيل الذكاء الاصطناعي</span>
                  <ArrowLeft className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Upload New Supporting Document Card */}
              <div className="bg-[#F8F8F6] p-4 sm:p-5 rounded-2xl border border-[#E5E3DE] space-y-4">
                <div className="text-xs font-bold text-[#09331F] flex items-center gap-2">
                  <UploadCloud className="w-4 h-4 text-[#006547]" />
                  <span>رفع مستند تشغيلي أو رقابي جديد وربطه بالوحدة</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-800 mb-1">
                      تصنيف المستند:
                    </label>
                    <select
                      value={docType}
                      onChange={(e) => setDocType(e.target.value)}
                      className="w-full min-h-10 rounded-xl bg-white border border-[#DCDAD5] px-3 py-2 text-xs font-bold text-slate-900"
                    >
                      <option value="SOP">إجراءات العمل القياسية (SOP)</option>
                      <option value="AUDIT_REPORT">تقرير التفتيش والمراجعة الداخلية</option>
                      <option value="INCIDENT_LOG">سجل أحداث الخسائر والحوادث التشغيلية</option>
                      <option value="PREVIOUS_RCSA">سجل تقييم مخاطر سابق (RCSA)</option>
                      <option value="OTHER">أخرى</option>
                    </select>
                    {docType === 'OTHER' && (
                      <input
                        type="text"
                        value={customDocTypeLabel}
                        onChange={(e) => setCustomDocTypeLabel(e.target.value)}
                        placeholder="حدد نوع المستند (أخرى)..."
                        className="w-full min-h-9 mt-1.5 rounded-xl bg-amber-50 border border-amber-300 px-2.5 py-1 text-xs text-slate-900"
                      />
                    )}
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-800 mb-1">
                      عنوان المستند (بالعربية):
                    </label>
                    <input
                      type="text"
                      value={docTitleAr}
                      onChange={(e) => setDocTitleAr(e.target.value)}
                      placeholder="مثال: دليل إجراءات المراجعة المستندية المحدث"
                      className="w-full min-h-10 rounded-xl bg-white border border-[#DCDAD5] px-3 py-2 text-xs text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-800 mb-1">
                      اختر الملف (TXT, CSV, PDF, DOCX, XLSX):
                    </label>
                    <input
                      type="file"
                      accept=".txt,.csv,.pdf,.docx,.xlsx"
                      onChange={handleFileSelection}
                      className="w-full min-h-10 rounded-xl bg-white border border-[#DCDAD5] px-3 py-1.5 text-xs text-slate-800 file:ml-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:bg-[#006547] file:text-white file:text-[11px] file:font-bold"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-[11px] text-slate-600">
                    يتم حفظ الملف ومحاولة استخراج محتواه. تحليل المخاطر تلقائيًا من المستندات سيكون متاحًا بعد تفعيل المساعد الذكي.
                  </span>
                  <button
                    type="button"
                    disabled={!selectedFile || uploadingDoc}
                    onClick={handleUploadSupportingDocument}
                    className="min-h-10 px-4 py-2 rounded-xl bg-[#006547] hover:bg-[#09331F] text-white text-xs font-bold disabled:opacity-40 flex items-center gap-1.5 cursor-pointer"
                  >
                    <UploadCloud className="w-4 h-4 text-[#F79C1E]" />
                    <span>
                      {uploadingDoc
                        ? 'جارٍ حفظ المستند...'
                        : 'رفع وتسجيل المستند في قاعدة البيانات'}
                    </span>
                  </button>
                </div>

                {uploadNotice && (
                  <div
                    className={`p-3 rounded-xl border text-xs font-bold ${
                      uploadNotice.type === 'success'
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                        : uploadNotice.type === 'warning'
                          ? 'bg-amber-50 border-amber-200 text-amber-900'
                          : 'bg-rose-50 border-rose-200 text-rose-900'
                    }`}
                  >
                    {uploadNotice.text}
                  </div>
                )}
              </div>

              {/* Registered Documents Table */}
              <div className="space-y-2.5">
                <div className="text-xs font-bold text-[#09331F] tabular-nums">
                  المستندات المرفوعة في التقييم الحالي ({currentSessionDocuments.length}):
                </div>
                {currentSessionDocuments.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {currentSessionDocuments.map((doc: any) => (
                      <div
                        key={doc.id}
                        className="p-3.5 rounded-xl bg-[#F8F8F6] border border-[#E5E3DE] flex items-start justify-between gap-3"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-[#006547] shrink-0" />
                            <span className="text-xs font-bold text-slate-900">{doc.title_ar}</span>
                          </div>
                          <div className="text-[10px] text-slate-600 font-mono">
                            {doc.doc_type} · {doc.original_filename}
                          </div>
                          <div className="text-[10px] text-slate-600 tabular-nums">
                            تاريخ التسجيل: {doc.uploaded_at_ar} · المقاطع النصية: {doc.chunks_count}
                          </div>
                        </div>
                        <span
                          className={`text-[11px] font-bold shrink-0 ${
                            doc.parse_status?.includes('MANUAL_EXTRACT_REQUIRED')
                              ? 'text-amber-800'
                              : 'text-[#006547]'
                          }`}
                        >
                          {doc.parse_status?.includes('MANUAL_EXTRACT_REQUIRED')
                            ? 'يتطلب استخراج يدوي'
                            : 'مستخرج ومفهرس'}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 rounded-xl bg-[#F8F8F6] border border-[#E5E3DE] text-xs text-slate-600">
                    لم تُرفع ملفات لهذا التقييم بعد.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 3: SOURCE & EXTRACTION PREVIEW */}
          {currentStep === 3 && (
            <div className="space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-extrabold text-[#09331F]">
                    الخطوة 3: معاينة المقاطع النصية المستخرجة والسجلات المرجعية (
                    {unitContext?.unit?.name_ar})
                  </h3>
                  <p className="text-xs text-slate-600 mt-0.5">
                    تمييز واضح بين المقاطع النصية الخام المستخرجة من المستندات وبين سجلات الحوادث والتفتيش والمخاطر المهيكلة.
                  </p>
                </div>
                {unitContext?.source_coverage && (
                  <span className="text-xs font-bold text-[#006547]">
                    تغطية المصادر:{' '}
                    {unitContext.source_coverage.status === 'complete'
                      ? 'مكتملة'
                      : unitContext.source_coverage.status === 'partial'
                        ? 'جزئية'
                        : 'غير مسجلة'}
                  </span>
                )}
              </div>

              {useHistoricalSources && unitContext?.source_coverage?.notes_ar && (
                <div className="p-3.5 rounded-xl bg-[#F8F8F6] border border-[#E5E3DE] text-xs text-slate-800">
                  <span className="font-bold text-[#09331F]">ملاحظة التغطية المرجعية: </span>
                  {unitContext.source_coverage.notes_ar}
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Raw Extracted SOP & Document Chunks */}
                <div className="bg-[#F8F8F6] p-4 rounded-2xl border border-[#E5E3DE] space-y-3">
                  <div className="text-xs font-bold text-[#09331F] flex items-center justify-between">
                    <span>المقاطع المستخرجة من الملفات المختارة</span>
                    <span className="font-mono text-[11px] text-[#006547] tabular-nums">
                      {visibleSourceChunks.length} مقطع
                    </span>
                  </div>
                  <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                    {visibleSourceChunks.map((chunk: any) => (
                      <div
                        key={chunk.chunk_id}
                        className="p-3 rounded-xl bg-white border border-[#DCDAD5] text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between text-[10px] font-bold text-[#006547]">
                          <span>
                            {chunk.sop_title_ar} — ({chunk.section_ref})
                          </span>
                          <span className="font-mono tabular-nums">{chunk.chunk_id}</span>
                        </div>
                        <p className="text-slate-800 leading-relaxed">{chunk.text_ar}</p>
                      </div>
                    ))}
                    {visibleSourceChunks.length === 0 && (
                      <div className="text-xs text-slate-600 p-3">
                        لا توجد مقاطع نصية مستخرجة لهذه الوحدة حالياً.
                      </div>
                    )}
                  </div>
                </div>

                {/* Historical Incidents & Audit Findings */}
                <div className="bg-[#F8F8F6] p-4 rounded-2xl border border-[#E5E3DE] space-y-3">
                  <div className="text-xs font-bold text-[#09331F] flex items-center justify-between">
                    <span>سجلات الحوادث والتفتيش السابقة</span>
                    <span className="font-mono text-[11px] text-slate-700 tabular-nums">
                      {visibleIncidents.length} حادثة · {visibleFindings.length} ملاحظة تفتيش
                    </span>
                  </div>
                  <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                    {visibleIncidents.map((inc: any) => (
                      <div
                        key={inc.incident_id}
                        className="p-3 rounded-xl bg-white border border-[#DCDAD5] text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between text-[10px] font-bold text-rose-800">
                          <span>
                            حادثة تشغيلية ({inc.incident_id}): {inc.title_ar}
                          </span>
                          <span className="font-mono tabular-nums">
                            {inc.financial_loss_egp !== null
                              ? `${Number(inc.financial_loss_egp).toLocaleString()} ج.م`
                              : 'بدون خسارة مباشرة'}
                          </span>
                        </div>
                        <p className="text-slate-700 text-[11px]">{inc.cause_ar}</p>
                      </div>
                    ))}
                    {visibleFindings.map((af: any) => (
                      <div
                        key={af.finding_id}
                        className="p-3 rounded-xl bg-white border border-[#DCDAD5] text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between text-[10px] font-bold text-amber-900">
                          <span>
                            ملاحظة تفتيش ({af.finding_id}): {af.title_ar}
                          </span>
                          <span className="font-mono">{af.severity}</span>
                        </div>
                        <p className="text-slate-700 text-[11px]">{af.finding_ar}</p>
                      </div>
                    ))}
                    {visibleIncidents.length + visibleFindings.length === 0 && (
                      <div className="text-xs text-slate-600 p-3">
                        لا توجد حوادث أو ملاحظات تفتيش مسجلة لهذه الوحدة.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: MISSING-DATA COMPLETION & CANDIDATE RISK EDITING */}
          {currentStep === 4 && (
            <div className="space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-extrabold text-[#09331F] tabular-nums">
                    الخطوة 4: استيفاء المدخلات الناقصة ومراجعة المخاطر والضوابط المرشحة (
                    {candidateRisks.length} مخاطرة)
                  </h3>
                  <p className="text-xs text-slate-600 mt-0.5">
                    يتم تمييز الحقول المفقودة التي تمنع الحساب المنهجي، ويمكنك استيفاؤها أو إضافة مخاطرة جديدة قبل تشغيل محرك بايثون.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleAddCandidateRisk}
                  className="min-h-10 px-3.5 py-2 rounded-xl bg-[#006547] hover:bg-[#09331F] text-white text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer whitespace-nowrap"
                >
                  <Plus className="w-4 h-4 text-[#F79C1E]" />
                  <span>إضافة مخاطرة جديدة للوحدة</span>
                </button>
              </div>

              {candidateRisks.length === 0 ? (
                <div className="p-6 rounded-2xl bg-[#F8F8F6] border border-[#E5E3DE] text-center space-y-3">
                  <AlertTriangle className="w-7 h-7 text-amber-700 mx-auto" />
                  <div className="text-xs font-bold text-slate-900">
                    لا توجد مخاطر مرجعية مسجلة مسبقاً لوحدة ({unitContext?.unit?.name_ar}).
                  </div>
                  <p className="text-xs text-slate-600">
                    اضغط على «إضافة مخاطرة جديدة للوحدة» لإدراج مخاطرة وضوابطها واستيفاء قيم الخسارة الفردية والتكرار.
                  </p>
                  <button
                    type="button"
                    onClick={handleAddCandidateRisk}
                    className="min-h-10 px-4 py-2 rounded-xl bg-[#006547] text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-4 h-4 text-[#F79C1E]" />
                    <span>إضافة مخاطرة أولى الآن</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {candidateRisks.map((risk, rIdx) => {
                    const isLossMissing =
                      risk.expected_loss_egp === null ||
                      risk.expected_loss_egp === undefined ||
                      risk.expected_loss_egp === '';
                    const isFreqMissing =
                      risk.frequency_score === null ||
                      risk.frequency_score === undefined ||
                      risk.frequency_score === '';

                    return (
                      <div
                        key={risk.risk_id}
                        className="p-4 rounded-2xl bg-[#F8F8F6] border border-[#E5E3DE] space-y-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[#E5E3DE]">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-[#09331F] bg-white px-2.5 py-0.5 rounded border border-[#DCDAD5] tabular-nums">
                              {risk.risk_id}
                            </span>
                            <span className="text-xs font-bold text-slate-900">
                              {risk.process_name_ar}
                            </span>
                          </div>
                          {isLossMissing || isFreqMissing ? (
                            <span className="text-xs text-amber-800 font-bold">
                              يتطلب استيفاء مدخلات مفقودة قبل اكتمال الاحتساب
                            </span>
                          ) : (
                            <span className="text-xs text-[#006547] font-bold">
                              المدخلات المالية للمخاطرة مستوفاة
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <div className="md:col-span-1">
                            <label className="block text-[11px] font-bold text-slate-800 mb-1">
                              وصف المخاطرة (بالعربية):
                            </label>
                            <textarea
                              rows={2}
                              value={risk.description_ar || ''}
                              onChange={(e) =>
                                handleUpdateCandidateRisk(rIdx, 'description_ar', e.target.value)
                              }
                              className="w-full rounded-xl bg-white border border-[#DCDAD5] p-2 text-xs text-slate-900"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-bold text-slate-800 mb-1">
                              الخسارة الفردية المتوقعة (ج.م):
                              {isLossMissing && (
                                <span className="text-rose-700 mr-1">
                                  (مفقود — يمنع احتساب الخسارة السنوية والخطر المتبقي)
                                </span>
                              )}
                            </label>
                            <input
                              type="number"
                              min={0}
                              step={1000}
                              value={risk.expected_loss_egp ?? ''}
                              placeholder="أدخل القيمة بالجنيه المصري (أو 0 المؤكد)"
                              onChange={(e) =>
                                handleUpdateCandidateRisk(
                                  rIdx,
                                  'expected_loss_egp',
                                  e.target.value === '' ? null : Number(e.target.value)
                                )
                              }
                              className={`w-full min-h-10 rounded-xl px-3 py-2 text-xs font-mono font-bold tabular-nums ${
                                isLossMissing
                                  ? 'bg-amber-50 border-2 border-amber-500 text-amber-950'
                                  : 'bg-white border border-[#DCDAD5] text-slate-900'
                              }`}
                            />
                            {risk.loss_Notes_ar && (
                              <div className="text-[10px] text-slate-600 mt-1">
                                {risk.loss_Notes_ar}
                              </div>
                            )}
                          </div>

                          <div>
                            <label className="block text-[11px] font-bold text-slate-800 mb-1">
                              درجة التكرار (1 إلى 5):
                              {isFreqMissing && (
                                <span className="text-rose-700 mr-1">
                                  (مفقود — يمنع احتساب الخسارة السنوية)
                                </span>
                              )}
                            </label>
                            <select
                              value={risk.frequency_score ?? ''}
                              onChange={(e) => {
                                if (e.target.value === 'OTHER') {
                                  handleUpdateCandidateRisk(rIdx, 'frequency_score', risk.frequency_score ?? 2);
                                  return;
                                }
                                handleUpdateCandidateRisk(
                                  rIdx,
                                  'frequency_score',
                                  e.target.value === '' ? null : Number(e.target.value)
                                );
                              }}
                              className="w-full min-h-10 rounded-xl bg-white border border-[#DCDAD5] px-3 py-2 text-xs font-bold text-slate-900"
                            >
                              <option value="">-- اختر درجة التكرار --</option>
                              <option value={1}>1 — نادر جداً (معامل 0.5 سنوياً)</option>
                              <option value={2}>2 — نادر / سنوي (معامل 1 سنوياً)</option>
                              <option value={3}>3 — محتمل / نصف سنوي (معامل 2 سنوياً)</option>
                              <option value={4}>4 — متكرر / ربع سنوي (معامل 4 سنوياً)</option>
                              <option value={5}>5 — متكرر جداً / شهري (معامل 12 سنوياً)</option>
                              <option value="OTHER">أخرى</option>
                            </select>
                          </div>
                        </div>

                        {/* Controls for this candidate risk */}
                        <div className="pt-2 border-t border-[#E5E3DE] space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold text-slate-800 tabular-nums">
                              الضوابط الرقابية المرتبطة ({risk.controls?.length || 0}):
                            </span>
                            <button
                              type="button"
                              onClick={() => handleAddControlToCandidateRisk(rIdx)}
                              className="text-[11px] font-bold text-[#006547] hover:underline flex items-center gap-1 cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>إضافة ضابط رقابي</span>
                            </button>
                          </div>

                          {(risk.controls || []).map((ctrl: any, cIdx: number) => {
                            const missingDesign = !ctrl.design_classification;
                            const missingAuto = !ctrl.automation_level;

                            return (
                              <div
                                key={ctrl.control_id}
                                className="p-3 rounded-xl bg-white border border-[#DCDAD5] grid grid-cols-1 md:grid-cols-4 gap-2.5 text-xs"
                              >
                                <div className="md:col-span-2">
                                  <div className="font-mono text-[10px] font-bold text-[#09331F] tabular-nums">
                                    {ctrl.control_id}
                                  </div>
                                  <input
                                    type="text"
                                    value={ctrl.description_ar || ''}
                                    onChange={(e) =>
                                      handleUpdateCandidateControl(
                                        rIdx,
                                        cIdx,
                                        'description_ar',
                                        e.target.value
                                      )
                                    }
                                    className="w-full min-h-9 mt-1 rounded-lg bg-[#F8F8F6] border border-[#DCDAD5] px-2.5 py-1.5 text-xs text-slate-900"
                                  />
                                </div>

                                <div>
                                  <label className="block text-[10px] font-bold text-slate-700">
                                    تصنيف التصميم:{' '}
                                    {missingDesign && (
                                      <span className="text-rose-700">(مفقود — يمنع RRF)</span>
                                    )}
                                  </label>
                                  <select
                                    value={ctrl.design_classification || ''}
                                    onChange={(e) =>
                                      handleUpdateCandidateControl(
                                        rIdx,
                                        cIdx,
                                        'design_classification',
                                        e.target.value === 'OTHER' ? 'Preventive' : (e.target.value || null)
                                      )
                                    }
                                    className={`w-full min-h-9 mt-1 rounded-lg px-2 py-1.5 text-xs font-bold ${
                                      missingDesign
                                        ? 'bg-amber-50 border-2 border-amber-500 text-amber-950'
                                        : 'bg-[#F8F8F6] border border-[#DCDAD5] text-slate-900'
                                    }`}
                                  >
                                    <option value="">-- غير محدد (معلق) --</option>
                                    <option value="Preventive">وقائي (Preventive)</option>
                                    <option value="Detective">كاشف (Detective)</option>
                                    <option value="Corrective">تصحيحي (Corrective)</option>
                                    <option value="OTHER">أخرى</option>
                                  </select>
                                </div>

                                <div>
                                  <label className="block text-[10px] font-bold text-slate-700">
                                    مستوى الأتمتة:{' '}
                                    {missingAuto && (
                                      <span className="text-rose-700">(مفقود — يمنع RRF)</span>
                                    )}
                                  </label>
                                  <select
                                    value={ctrl.automation_level || ''}
                                    onChange={(e) =>
                                      handleUpdateCandidateControl(
                                        rIdx,
                                        cIdx,
                                        'automation_level',
                                        e.target.value === 'OTHER' ? 'Manual' : (e.target.value || null)
                                      )
                                    }
                                    className={`w-full min-h-9 mt-1 rounded-lg px-2 py-1.5 text-xs font-bold ${
                                      missingAuto
                                        ? 'bg-amber-50 border-2 border-amber-500 text-amber-950'
                                        : 'bg-[#F8F8F6] border border-[#DCDAD5] text-slate-900'
                                    }`}
                                  >
                                    <option value="">-- غير محدد (معلق) --</option>
                                    <option value="Automated">آلي بالكامل (Automated)</option>
                                    <option value="Semi-Automated">نصف آلي (Semi-Automated)</option>
                                    <option value="Manual">يدوي (Manual)</option>
                                    <option value="OTHER">أخرى</option>
                                  </select>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* STEP 5: AUTHORITATIVE PYTHON ENGINE CALCULATION PREVIEW */}
          {currentStep === 5 && (
            <div className="space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-extrabold text-[#09331F]">
                    الخطوة 5: نتائج الحساب المنهجي عبر محرك بايثون المعتمد
                  </h3>
                  <p className="text-xs text-slate-600 mt-0.5">
                    يتم احتساب الخسارة السنوية المتوقعة، مصفوفة 5×5، مصفوفة معامل الخفض (3×3 RRF)، وأعلى معامل خفض مؤهل (MAX RRF) والخطر المتبقي عبر محرك بايثون المعتمد.
                  </p>
                </div>

                <button
                  type="button"
                  disabled={calcLoading}
                  onClick={handleRunPythonPreview}
                  className="min-h-10 px-4 py-2 rounded-xl bg-[#006547] hover:bg-[#09331F] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                >
                  <Calculator className="w-4 h-4 text-[#F79C1E]" />
                  <span>
                    {calcLoading ? 'جارٍ تشغيل محرك بايثون...' : 'إعادة تشغيل الحساب المنهجي'}
                  </span>
                </button>
              </div>

              {calcError && (
                <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs font-bold">
                  {calcError}
                </div>
              )}

              {calcLoading ? (
                <div className="p-8 text-center text-xs text-slate-700">
                  <div className="w-7 h-7 border-3 border-[#006547] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                  <div>جارٍ احتساب المخاطر والضوابط عبر محرك بايثون المعتمد...</div>
                </div>
              ) : calcPreview ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="p-3.5 rounded-xl bg-[#F8F8F6] border border-[#E5E3DE]">
                      <div className="text-[11px] font-bold text-slate-600">
                        إجمالي المخاطر المحسوبة:
                      </div>
                      <div className="text-xl font-black text-[#09331F] font-mono tabular-nums mt-1">
                        {calcPreview.summary.total_risks}
                      </div>
                    </div>
                    <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200">
                      <div className="text-[11px] font-bold text-emerald-800">
                        مخاطر مكتملة الاحتساب:
                      </div>
                      <div className="text-xl font-black text-[#006547] font-mono tabular-nums mt-1">
                        {calcPreview.summary.complete_risks}
                      </div>
                    </div>
                    <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200">
                      <div className="text-[11px] font-bold text-amber-800">
                        مخاطر بانتظار استيفاء مدخلات:
                      </div>
                      <div className="text-xl font-black text-amber-900 font-mono tabular-nums mt-1">
                        {calcPreview.summary.pending_risks}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {(calcPreview.calculated_risks || []).map((item: any) => {
                      const out = item.calculated_output || {};
                      const isComplete = out.status === 'COMPLETE';
                      return (
                        <div
                          key={item.risk_id}
                          className="p-4 rounded-2xl bg-[#F8F8F6] border border-[#E5E3DE] space-y-2.5 text-xs"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[#E5E3DE]">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-[#09331F] bg-white px-2 py-0.5 rounded border border-[#DCDAD5] tabular-nums">
                                {item.risk_id}
                              </span>
                              <span className="font-bold text-slate-900">
                                {item.draft_input.description_ar}
                              </span>
                            </div>
                            <span
                              className={`text-xs font-bold ${
                                isComplete ? 'text-[#006547]' : 'text-amber-800'
                              }`}
                            >
                              {isComplete
                                ? 'مكتمل الاحتساب (COMPLETE)'
                                : 'معلق لاستيفاء المدخلات (PENDING_INPUT)'}
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                            <div className="p-2.5 rounded-xl bg-white border border-[#DCDAD5]">
                              <div className="text-[10px] text-slate-600 font-bold">
                                الخسارة السنوية المتوقعة:
                              </div>
                              <div className="font-mono font-bold text-slate-900 mt-1 tabular-nums">
                                {out.annual_expected_loss_egp !== null &&
                                out.annual_expected_loss_egp !== undefined
                                  ? `${Number(out.annual_expected_loss_egp).toLocaleString()} ج.م`
                                  : 'معلق'}
                              </div>
                            </div>

                            <div className="p-2.5 rounded-xl bg-white border border-[#DCDAD5]">
                              <div className="text-[10px] text-slate-600 font-bold">
                                تصنيف الخطر الكامن (5×5):
                              </div>
                              <div className="font-mono font-bold text-slate-900 mt-1 tabular-nums">
                                {out.inherent_rating || 'معلق'} ({out.inherent_level_ar || '-'})
                              </div>
                            </div>

                            <div className="p-2.5 rounded-xl bg-white border border-[#DCDAD5]">
                              <div className="text-[10px] text-slate-600 font-bold">
                                أعلى معامل خفض مؤهل (MAX RRF):
                              </div>
                              <div className="font-mono font-bold text-[#006547] mt-1 tabular-nums">
                                {out.max_eligible_rrf !== null &&
                                out.max_eligible_rrf !== undefined
                                  ? `${(Number(out.max_eligible_rrf) * 100).toFixed(0)}% (${
                                      out.winning_control_id || 'بدون'
                                    })`
                                  : 'معلق'}
                              </div>
                            </div>

                            <div className="p-2.5 rounded-xl bg-white border border-[#DCDAD5]">
                              <div className="text-[10px] text-slate-600 font-bold">
                                الخطر المتبقي وتصنيفه:
                              </div>
                              <div className="font-mono font-bold text-slate-900 mt-1 tabular-nums">
                                {out.residual_value_egp !== null &&
                                out.residual_value_egp !== undefined
                                  ? `${Number(out.residual_value_egp).toLocaleString()} ج.م (${
                                      out.residual_rating
                                    })`
                                  : 'معلق'}
                              </div>
                            </div>
                          </div>

                          {out.pending_reasons && out.pending_reasons.length > 0 && (
                            <div className="text-[11px] text-amber-900 bg-amber-50 p-2.5 rounded-xl border border-amber-200">
                              <span className="font-bold">أسباب التعليق: </span>
                              {out.pending_reasons.join(' · ')}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {/* STEP 6: SAVE DRAFT & OPEN IN RCSA TABLE WORKSPACE */}
          {currentStep === 6 && (
            <div className="space-y-5 max-w-2xl mx-auto">
              <div className="text-center space-y-1">
                <h3 className="text-sm font-extrabold text-[#09331F]">
                  الخطوة 6: حفظ مسودة التقييم في قاعدة البيانات وفتحها في مساحة المراجعة
                </h3>
                <p className="text-xs text-slate-600">
                  سيتم إنشاء سجل تقييم جديد في قاعدة البيانات (SQLite) لوحدة (
                  {unitContext?.unit?.name_ar}) بجميع المخاطر والضوابط والحسابات، وفتحه مباشرة في صفحة مصفوفة المخاطر RCSA للمراجعة والاعتماد.
                </p>
              </div>

              <div className="bg-[#F8F8F6] p-4 sm:p-5 rounded-2xl border border-[#E5E3DE] space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-900 mb-1.5">
                    عنوان التقييم:
                  </label>
                  <input
                    type="text"
                    value={draftTitleAr}
                    onChange={(e) => setDraftTitleAr(e.target.value)}
                    className="w-full min-h-10 rounded-xl bg-white border border-[#DCDAD5] px-3.5 py-2.5 text-xs font-bold text-slate-900"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-white border border-[#DCDAD5]">
                    <div className="text-[10px] text-slate-600 font-bold">الوحدة التنظيمية:</div>
                    <div className="font-bold text-slate-900 mt-0.5">
                      {unitContext?.unit?.name_ar}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-white border border-[#DCDAD5]">
                    <div className="text-[10px] text-slate-600 font-bold">
                      عدد المخاطر المدرجة في المسودة:
                    </div>
                    <div className="font-bold text-[#09331F] font-mono tabular-nums mt-0.5">
                      {candidateRisks.length} مخاطرة
                    </div>
                  </div>
                </div>

                {saveError && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs font-bold">
                    {saveError}
                  </div>
                )}

                {createdDraftState ? (
                  <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-950 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-bold">
                      <CheckCircle2 className="w-4 h-4 text-[#006547]" />
                      <span>تم حفظ المسودة بنجاح في قاعدة البيانات!</span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        onNavigate?.({
                          page: 'rcsa-table',
                          unitId: selectedBU,
                          assessmentId: createdDraftState.assessment.id,
                        })
                      }
                      className="w-full min-h-11 px-4 py-2.5 rounded-xl bg-[#006547] hover:bg-[#09331F] text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <TableProperties className="w-4 h-4 text-[#F79C1E]" />
                      <span>فتح المسودة الآن في مساحة المراجعة والتعديل (RCSA)</span>
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={savingDraft || candidateRisks.length === 0}
                    onClick={() => handleSaveGuidedDraft(true)}
                    className="w-full min-h-11 px-5 py-3 rounded-xl bg-[#006547] hover:bg-[#09331F] text-white text-xs font-bold flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer disabled:opacity-40"
                  >
                    <ShieldCheck className="w-4 h-4 text-[#F79C1E]" />
                    <span>
                      {savingDraft
                        ? 'جارٍ حفظ المسودة والتحقق من الحسابات...'
                        : 'حفظ المسودة وفتحها في مصفوفة المخاطر والرقابة الذاتية'}
                    </span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Stepper Navigation Buttons */}
          <div className="flex justify-between items-center mt-6 pt-4 border-t border-[#E5E3DE]">
            <button
              type="button"
              disabled={currentStep === 1}
              onClick={() => setCurrentStep((prev) => Math.max(1, prev - 1))}
              className="min-h-10 px-4 py-2 rounded-xl border border-[#DCDAD5] bg-[#F8F8F6] text-xs font-bold text-slate-800 hover:bg-[#EFECE6] disabled:opacity-30 flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowRight className="w-3.5 h-3.5" />
              <span>الخطوة السابقة</span>
            </button>

            <button
              type="button"
              disabled={currentStep === steps.length}
              onClick={async () => {
                if (currentStep === 1 && !sessionId) {
                  await handleStartSession(workflowMode);
                }
                const next = Math.min(steps.length, currentStep + 1);
                setCurrentStep(next);
                if (next === 5) {
                  handleRunPythonPreview();
                }
              }}
              className="min-h-10 px-4 py-2 rounded-xl bg-[#006547] hover:bg-[#09331F] text-white text-xs font-bold disabled:opacity-30 flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <span>الخطوة التالية</span>
              <ArrowLeft className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
