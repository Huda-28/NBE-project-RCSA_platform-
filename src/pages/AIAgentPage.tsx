import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { useAuth } from '../context/AuthContext.js';
import { PageId } from '../components/Sidebar.js';
import { AppNavigationState } from '../App.js';
import { 
  Bot as BotIcon, 
  Cpu as CpuIcon, 
  FileText as FileTextIcon, 
  Layers as LayersIcon, 
  ArrowRight as ArrowRightIcon, 
  TableProperties as TablePropertiesIcon, 
  FileUp as FileUpIcon, 
  AlertCircle as AlertCircleIcon, 
  CheckCircle2 as CheckCircle2Icon, 
  FolderOpen as FolderOpenIcon, 
  Send as SendIcon, 
  Check as CheckIcon, 
  X as XIcon, 
  Edit3 as Edit3Icon, 
  HelpCircle as HelpCircleIcon, 
  Sparkles as SparklesIcon, 
  Trash2 as Trash2Icon,
  PlusCircle as PlusCircleIcon,
  RefreshCcw as RefreshCcwIcon,
  ChevronDown,
  ChevronUp,
  LoaderCircle as LoaderIcon,
} from 'lucide-react';

type AgentModelId = 'qwen2.5:0.5b' | 'qwen2.5:7b';

const agentModels: Array<{ id: AgentModelId; label: string }> = [
  { id: 'qwen2.5:0.5b', label: 'الأسرع' },
  { id: 'qwen2.5:7b', label: 'الأدق' },
];

interface AIAgentPageProps {
  initialUnitId?: string;
  initialSessionId?: string;
  initialMode?: 'NEW' | 'UPDATE';
  onNavigate?: (next: Partial<AppNavigationState> & { page: PageId }, replace?: boolean) => void;
}

export const AIAgentPage: React.FC<AIAgentPageProps> = ({
  initialUnitId,
  initialSessionId,
  initialMode,
  onNavigate,
}) => {
  const { token } = useAuth();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [businessUnits, setBusinessUnits] = useState<any[]>([]);
  const [selectedUnitId, setSelectedUnitId] = useState<string>(initialUnitId || 'BU-POS');
  const [sessionId, setSessionId] = useState<string | null>(initialSessionId || null);
  const [workflowMode, setWorkflowMode] = useState<'NEW' | 'UPDATE'>(initialMode || 'NEW');

  // Agent session state
  const [session, setSession] = useState<any | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [proposals, setProposals] = useState<any[]>([]);
  const [clarifications, setClarifications] = useState<any[]>([]);
  const [llmStatus, setLlmStatus] = useState<any | null>(null);
  const [selectedModel, setSelectedModel] = useState<AgentModelId>('qwen2.5:7b');

  const [loadingState, setLoadingState] = useState<boolean>(true);
  const [sendingMsg, setSendingMsg] = useState<boolean>(false);
  const [uploadingDocs, setUploadingDocs] = useState<boolean>(false);
  const [userPromptText, setUserPromptText] = useState<string>('');
  const [actionNotice, setActionNotice] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // UI Toggles
  const [showDocsPanel, setShowDocsPanel] = useState<boolean>(true);
  const [showProposalsPanel, setShowProposalsPanel] = useState<boolean>(true);
  const [editingProposalId, setEditingProposalId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<any>({});

  // Load authorized Business Units
  useEffect(() => {
    if (!token) return;
    fetch('/api/business-units', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        const list = data.business_units || [];
        setBusinessUnits(list);
        if (initialUnitId && list.some((u: any) => u.id === initialUnitId)) {
          setSelectedUnitId(initialUnitId);
        } else if (!selectedUnitId && list.length > 0) {
          setSelectedUnitId(list[0].id);
        }
      })
      .catch((err) => console.error('Failed to load authorized business units:', err));
  }, [token, initialUnitId]);

  // Load Agent Session details by ID or active session for selected unit
  const loadAgentState = async (targetSessionId?: string, targetUnitId?: string, modeToUse?: 'NEW' | 'UPDATE') => {
    if (!token) return;
    setLoadingState(true);
    try {
      const unitIdToUse = targetUnitId || selectedUnitId;
      const effectiveMode = modeToUse || workflowMode;
      let sid = targetSessionId || sessionId;

      if (!sid) {
        const activeRes = await fetch(`/api/workflow/sessions/active?unit_id=${unitIdToUse}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const activeBody = await activeRes.json();
        if (activeBody.session && activeBody.session.workflow_mode === effectiveMode) {
          sid = activeBody.session.id;
        } else {
          // Create new session for this unit & mode
          const createRes = await fetch('/api/workflow/sessions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              unit_id: unitIdToUse,
              workflow_mode: effectiveMode,
              session_title: effectiveMode === 'UPDATE' 
                ? `تحديث تقييم المخاطر التشغيلية - ${unitIdToUse}`
                : `تقييم جديد للمخاطر التشغيلية - ${unitIdToUse}`,
            }),
          });
          const createBody = await createRes.json();
          sid = createBody.session?.id;
        }
      }

      if (sid) {
        setSessionId(sid);
        const stateRes = await fetch(`/api/agent/sessions/${sid}/state`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const stateData = await stateRes.json();
        if (stateRes.ok) {
          setSession(stateData.session);
          setWorkflowMode(stateData.session.workflow_mode || effectiveMode);
          setMessages(stateData.messages || []);
          setProposals(stateData.proposals || []);
          setClarifications(stateData.clarifications || []);
          setLlmStatus(stateData.llm_status || null);
        }
      }
    } catch (err: any) {
      console.error('Failed to load agent session state:', err);
    } finally {
      setLoadingState(false);
    }
  };

  useEffect(() => {
    if (token && selectedUnitId) {
      loadAgentState(initialSessionId, selectedUnitId, initialMode);
    }
  }, [token, selectedUnitId, initialSessionId]);

  const handleUnitChange = (newUnitId: string) => {
    setSelectedUnitId(newUnitId);
    setSessionId(null);
    setSession(null);
    onNavigate?.({ page: 'agent', unitId: newUnitId }, true);
    loadAgentState(undefined, newUnitId, workflowMode);
  };

  const handleSwitchWorkflowMode = async (newMode: 'NEW' | 'UPDATE') => {
    if (newMode === workflowMode && session) return;
    setWorkflowMode(newMode);
    setLoadingState(true);
    setActionNotice(null);
    try {
      const createRes = await fetch('/api/workflow/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          unit_id: selectedUnitId,
          workflow_mode: newMode,
          session_title: newMode === 'UPDATE'
            ? `تحديث تقييم المخاطر التشغيلية - ${selectedUnitId}`
            : `تقييم جديد للمخاطر التشغيلية - ${selectedUnitId}`,
        }),
      });
      const createBody = await createRes.json();
      if (!createRes.ok) throw new Error(createBody.error || 'تعذر تغيير نمط التقييم.');
      
      const newSid = createBody.session?.id;
      if (newSid) {
        setSessionId(newSid);
        onNavigate?.({ page: 'agent', unitId: selectedUnitId, sessionId: newSid, mode: newMode }, true);
        await loadAgentState(newSid, selectedUnitId, newMode);
        setActionNotice({
          type: 'info',
          text: newMode === 'NEW'
            ? 'تم البدء في جلسة تقييم جديد مستقلة بدون نسخ مخاطر تاريخية.'
            : 'تم البدء في جلسة تحديث تقييم وتحميل بيانات التقييم المرجعي السابق للمقارنة.',
        });
      }
    } catch (err: any) {
      setActionNotice({ type: 'error', text: err.message });
      setLoadingState(false);
    }
  };

  // Upload document directly from AI Agent Page
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0 || !token || !sessionId) return;

    setUploadingDocs(true);
    setActionNotice(null);
    let successCount = 0;
    let failMessages: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        // Read file as base64 or text
        const isText = file.name.endsWith('.txt') || file.name.endsWith('.csv');
        let contentBase64: string | undefined = undefined;
        let contentText: string | undefined = undefined;

        if (isText) {
          contentText = await file.text();
        } else {
          const buffer = await file.arrayBuffer();
          contentBase64 = btoa(
            new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
          );
        }

        // Infer file type
        let fileType = 'SOP';
        const lowerName = file.name.toLowerCase();
        if (lowerName.includes('incident') || lowerName.includes('حادث') || lowerName.includes('خسار')) {
          fileType = 'INCIDENT_REPORT';
        } else if (lowerName.includes('audit') || lowerName.includes('تفتيش') || lowerName.includes('مراجعة')) {
          fileType = 'AUDIT_REPORT';
        } else if (lowerName.includes('rcsa') || lowerName.includes('تقييم')) {
          fileType = 'RCSA';
        }

        const uploadRes = await fetch(`/api/guided-rcsa/units/${selectedUnitId}/documents`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            session_id: sessionId,
            fileType,
            doc_type: fileType,
            filename: file.name,
            file_name: file.name,
            mimeType: file.type || 'application/octet-stream',
            base64_content: contentBase64,
            text_content: contentText,
            file_size_bytes: file.size,
            title_ar: file.name,
          }),
        });

        const uploadData = await uploadRes.json();
        if (!uploadRes.ok) throw new Error(uploadData.error || `فشل رفع المستند ${file.name}`);
        successCount++;
      } catch (err: any) {
        failMessages.push(`${file.name}: ${err.message}`);
      }
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    // Refresh agent session state to show updated documents
    await loadAgentState(sessionId, selectedUnitId);
    setUploadingDocs(false);

    if (successCount > 0 && failMessages.length === 0) {
      setActionNotice({
        type: 'success',
        text: `تم رفع واستخراج النص والنسخ المرجعية لعدد (${successCount}) مستندات بنجاح وإتاحتها لمحرك الاستدلال.`,
      });
    } else if (failMessages.length > 0) {
      setActionNotice({
        type: 'error',
        text: `تم رفع (${successCount}) مستندات وتعذر معالجة المستندات التالية: ${failMessages.join(' | ')}`,
      });
    }
  };

  // Unlink/Detach document from session
  const handleUnlinkDocument = async (documentId: string) => {
    if (!token || !sessionId) return;
    try {
      const res = await fetch(`/api/workflow/sessions/${sessionId}/documents/${documentId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'تعذر إلغاء إرفاق المستند.');
      await loadAgentState(sessionId, selectedUnitId);
      setActionNotice({
        type: 'success',
        text: 'تم إلغاء إرفاق المستند من هذه الجلسة بنجاح دون حذف السجلات التاريخية.',
      });
    } catch (err: any) {
      setActionNotice({ type: 'error', text: err.message });
    }
  };

  const handleSendMessage = async (customPrompt?: string) => {
    if (!token || !sessionId || sendingMsg) return;
    const textToSubmit = (customPrompt || userPromptText).trim();
    if (!textToSubmit) return;

    setSendingMsg(true);
    setActionNotice(null);
    setUserPromptText('');

    try {
      const res = await fetch(`/api/agent/sessions/${sessionId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message_text_ar: textToSubmit, llm_model: selectedModel }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل إرسال التوجيه للوكيل.');
      setSession(data.session);
      setMessages(data.messages || []);
      setProposals(data.proposals || []);
      setClarifications(data.clarifications || []);
      setLlmStatus(data.llm_status || null);
    } catch (err: any) {
      setActionNotice({ type: 'error', text: err.message });
    } finally {
      setSendingMsg(false);
    }
  };

  const handleProposalDecision = async (proposalId: string, decision: 'ACCEPT' | 'REJECT' | 'MODIFIED_ACCEPTED', modifiedData?: any) => {
    if (!token || !sessionId) return;
    setActionNotice(null);
    try {
      const res = await fetch(`/api/agent/sessions/${sessionId}/proposals/${proposalId}/decide`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          decision,
          modified_data: modifiedData,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'تعذر تسجيل قرار القبول/الرفض.');
      setSession(data.session);
      setMessages(data.messages || []);
      setProposals(data.proposals || []);
      setClarifications(data.clarifications || []);
      setEditingProposalId(null);
      setActionNotice({
        type: 'success',
        text: decision === 'REJECT' ? 'تم استبعاد المقترح من التقييم.' : 'تم قبول المقترح وإدراجه بنجاح في مسودة التقييم بالجلسة.',
      });
    } catch (err: any) {
      setActionNotice({ type: 'error', text: err.message });
    }
  };

  const handleAnswerClarification = async (clarificationId: string, answerText: string) => {
    if (!token || !sessionId) return;
    try {
      const res = await fetch(`/api/agent/sessions/${sessionId}/clarifications/${clarificationId}/answer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ answer_text_ar: answerText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'تعذر تسليم الإجابة.');
      setSession(data.session);
      setMessages(data.messages || []);
      setProposals(data.proposals || []);
      setClarifications(data.clarifications || []);
      setActionNotice({ type: 'success', text: 'تم تسجيل إجابتك وتأكيدها في سياق الجلسة.' });
    } catch (err: any) {
      setActionNotice({ type: 'error', text: err.message });
    }
  };

  const handleCreateDraftAndOpenReview = async () => {
    if (!token || !sessionId) return;
    try {
      const res = await fetch(`/api/agent/sessions/${sessionId}/create-draft`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'تعذر إنشاء مسودة التقييم المعتمدة.');
      const draftId = body.assessment?.id;
      if (draftId && onNavigate) {
        onNavigate({
          page: 'rcsa-table',
          unitId: selectedUnitId,
          assessmentId: draftId,
          sessionId,
          mode: session?.workflow_mode,
        });
      }
    } catch (err: any) {
      setActionNotice({ type: 'error', text: err.message });
    }
  };

  const docsList = session?.session_documents || [];

  return (
    <div className="space-y-6 animate-in fade-in duration-300 font-['Cairo'] text-right" dir="rtl">
      
      {/* Hidden File Input for Direct Document Upload */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        multiple
        accept=".pdf,.docx,.doc,.xlsx,.xls,.csv"
        className="hidden"
      />

      {/* Main Page Header */}
      <div className="bg-[#ECEBE8] p-5 rounded-2xl border border-[#C6C4C1] shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-[#09331F] text-[#F79C1E] flex items-center justify-center shrink-0 shadow-inner">
            <BotIcon className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-bold text-slate-900">بيئة العمل التفاعلية لإصدار وتقييم RCSA (AI Agent)</h2>
              <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-900 font-bold border border-emerald-300">
                بيئة العمل الأساسية المباشرة
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-1">
              إدارة التقييمات عبر الحوار المباشر، رفع وتحليل المستندات، توليد المخاطر والضوابط، والمتابعة إلى المصفوفة التنفيذية.
            </p>
          </div>
        </div>

        {/* Primary Action Header Bar: Upload Documents Button */}
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            disabled={uploadingDocs || !sessionId}
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-2.5 rounded-xl bg-[#006547] hover:bg-[#09331F] text-white font-bold text-xs flex items-center gap-2 shadow-sm cursor-pointer disabled:opacity-40 transition-all active:scale-98"
          >
            <FileUpIcon className="w-4 h-4 text-[#F79C1E] animate-bounce" />
            <span>{uploadingDocs ? 'جاري رفع واستخراج المستندات...' : 'رفع المستندات والأدلة'}</span>
          </button>

          <div className="bg-[#E2E1DE] border border-[#B8B6B2] px-3.5 py-2.5 rounded-xl text-xs text-slate-800 flex items-center gap-2">
            <CpuIcon className="w-4 h-4 text-[#006547]" />
            <span className="text-[11px]">
              الاستدلال:{' '}
              <strong>
                {llmStatus?.isConfigured ? 'محرك ذكي نشط' : 'استدلال قطعي شفاف (Grounded Offline)'}
              </strong>
            </span>
          </div>
        </div>
      </div>

      {/* Business Unit Selector & Workflow Mode Switcher Bar */}
      <div className="bg-[#ECEBE8] p-4 rounded-2xl border border-[#C6C4C1] shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        
        {/* BU Selector */}
        <div className="flex items-center gap-2">
          <LayersIcon className="w-4 h-4 text-[#006547]" />
          <span className="text-xs font-bold text-slate-800">الوحدة التنظيمية:</span>
          <select 
            value={selectedUnitId}
            onChange={(e) => handleUnitChange(e.target.value)}
            className="px-3.5 py-1.5 text-xs font-bold border border-[#B8B6B2] rounded-xl bg-[#F4F3F0] text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#006547]"
          >
            {businessUnits.map((bu) => (
              <option key={bu.id} value={bu.id}>
                {bu.name_ar} ({bu.code})
              </option>
            ))}
          </select>
        </div>

        {/* Workflow Mode Selector Buttons */}
        <div className="flex items-center gap-2 bg-[#E2E1DE] p-1.5 rounded-xl border border-[#B8B6B2]">
          <button
            type="button"
            onClick={() => handleSwitchWorkflowMode('NEW')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              workflowMode === 'NEW'
                ? 'bg-[#006547] text-white shadow-xs'
                : 'text-slate-700 hover:text-slate-900'
            }`}
          >
            <PlusCircleIcon className="w-3.5 h-3.5 text-[#F79C1E]" />
            <span>إنشاء RCSA جديدة</span>
          </button>

          <button
            type="button"
            onClick={() => handleSwitchWorkflowMode('UPDATE')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              workflowMode === 'UPDATE'
                ? 'bg-[#006547] text-white shadow-xs'
                : 'text-slate-700 hover:text-slate-900'
            }`}
          >
            <RefreshCcwIcon className="w-3.5 h-3.5 text-[#F79C1E]" />
            <span>تحديث RCSA سابقة</span>
          </button>
        </div>

        {/* Active Session Info */}
        {session && (
          <div className="flex items-center gap-2 text-xs">
            <span className="px-2.5 py-0.5 rounded-full bg-[#006547] text-[#F79C1E] font-mono font-bold border border-[#F79C1E]/40 text-[11px]">
              {session.id}
            </span>
            <span className="font-bold text-slate-900 text-[11px] truncate max-w-[200px]">
              {session.session_title}
            </span>
          </div>
        )}
      </div>

      {/* Action Notification Banner */}
      {actionNotice && (
        <div className={`p-3.5 rounded-xl text-xs font-bold flex items-center justify-between border ${
          actionNotice.type === 'success'
            ? 'bg-emerald-100 border-emerald-300 text-emerald-950'
            : actionNotice.type === 'error'
              ? 'bg-rose-100 border-rose-300 text-rose-950'
              : 'bg-blue-100 border-blue-300 text-blue-950'
        }`}>
          <div className="flex items-center gap-2">
            {actionNotice.type === 'success' ? (
              <CheckCircle2Icon className="w-4 h-4 text-emerald-700 shrink-0" />
            ) : actionNotice.type === 'error' ? (
              <AlertCircleIcon className="w-4 h-4 text-rose-700 shrink-0" />
            ) : (
              <HelpCircleIcon className="w-4 h-4 text-blue-700 shrink-0" />
            )}
            <span>{actionNotice.text}</span>
          </div>
          <button onClick={() => setActionNotice(null)} className="text-slate-600 hover:text-slate-900 cursor-pointer">
            <XIcon className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Attached Session Documents Panel */}
      <div className="bg-[#ECEBE8] rounded-2xl border border-[#C6C4C1] p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between border-b border-[#CECCC9] pb-2.5">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
            <FolderOpenIcon className="w-4 h-4 text-[#006547]" />
            <span>المستندات والأدلة المرفوعة بالجلسة الحالية ({docsList.length})</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={uploadingDocs || !sessionId}
              onClick={() => fileInputRef.current?.click()}
              className="text-[11px] px-2.5 py-1 rounded-lg bg-[#E2E1DE] border border-[#B8B6B2] text-[#006547] font-bold hover:bg-[#D5D3CF] flex items-center gap-1 cursor-pointer"
            >
              <FileUpIcon className="w-3.5 h-3.5" />
              <span>إضافة مستندات +</span>
            </button>
            <button
              type="button"
              onClick={() => setShowDocsPanel(!showDocsPanel)}
              className="text-slate-600 hover:text-slate-900 p-1 cursor-pointer"
            >
              {showDocsPanel ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {showDocsPanel && (
          <div>
            {docsList.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-600 bg-[#DFDEDB] rounded-xl border border-[#C6C4C1]">
                لم يتم إرفاق أي مستندات بهذه الجلسة بعد. اضغط على زر <strong>"رفع المستندات والأدلة"</strong> لإرفاق ملفات SOPs أو تقارير التفتيش أو الحوادث الميدانية.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {docsList.map((doc: any) => (
                  <div key={doc.id} className="p-3 bg-[#F4F3F0] rounded-xl border border-[#C6C4C1] flex items-start justify-between gap-2 text-xs">
                    <div className="space-y-1 truncate">
                      <div className="flex items-center gap-1.5">
                        <FileTextIcon className="w-3.5 h-3.5 text-[#006547] shrink-0" />
                        <span className="font-bold text-slate-900 truncate" title={doc.title_ar || doc.filename}>
                          {doc.title_ar || doc.filename}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-slate-600 flex-wrap">
                        <span className="px-1.5 py-0.2 rounded bg-[#E2E1DE] font-semibold text-slate-800">
                          {doc.doc_type || 'SOP'}
                        </span>
                        <span>• {doc.chunks_count || 0} مقاطع نصية</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleUnlinkDocument(doc.id)}
                      className="text-rose-600 hover:text-rose-900 p-1 rounded hover:bg-rose-100 shrink-0 cursor-pointer"
                      title="إلغاء إرفاق المستند من الجلسة"
                    >
                      <Trash2Icon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Main Grid: Conversational Thread (Left Span 7) & Proposals/Decision Cards (Right Span 5) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Conversational Chat Thread (Span 7) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-[#ECEBE8] rounded-2xl border border-[#C6C4C1] p-5 shadow-sm space-y-4 flex flex-col h-[620px]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#CECCC9] pb-3">
              <div className="flex items-center gap-2">
                <BotIcon className="w-4 h-4 text-[#006547]" />
                <h3 className="text-sm font-bold text-slate-900">محادثة المساعد المصرفي الذكي</h3>
              </div>
              <div className="flex items-center gap-2">
                {llmStatus?.isConfigured && (
                  <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-700">
                    <span>النموذج:</span>
                    <select
                      aria-label="اختيار نموذج الذكاء الاصطناعي"
                      value={selectedModel}
                      disabled={sendingMsg}
                      onChange={(event) => setSelectedModel(event.target.value as AgentModelId)}
                      className="max-w-[170px] rounded-lg border border-[#B8B6B2] bg-[#F4F3F0] px-2 py-1 text-[10px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#006547] disabled:opacity-60"
                    >
                      {(llmStatus.availableModels || agentModels).map((model: { id: AgentModelId; label: string }) => (
                        <option key={model.id} value={model.id}>{model.label}</option>
                      ))}
                    </select>
                  </label>
                )}
                <span className="text-[10px] text-slate-600 font-mono">{messages.length} رسالة</span>
              </div>
            </div>

            {/* Quick Prompt Actions for User */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              <button
                type="button"
                disabled={sendingMsg}
                onClick={() => handleSendMessage('قم بتحليل كافة المستندات المرفوعة بالجلسة، واقتراح قائمة المخاطر والضوابط، وحساب الأثر المالي المقدر، والأثر غير المالي (NFI)، وركائز ESG، والتصنيف الهيكلي L1/L2/L3.')}
                className="px-2.5 py-1 rounded-lg bg-[#E2E1DE] border border-[#B8B6B2] text-[#006547] hover:bg-[#D5D3CF] text-[10px] font-bold shrink-0 cursor-pointer"
              >
                ⚡ تحليل كافة المستندات وتوليد التوصيات
              </button>
              <button
                type="button"
                disabled={sendingMsg}
                onClick={() => handleSendMessage('قم بمطابقة خطوات العمل مع سجل الحوادث الميدانية وبيان الفجوات الرقابية.')}
                className="px-2.5 py-1 rounded-lg bg-[#E2E1DE] border border-[#B8B6B2] text-[#006547] hover:bg-[#D5D3CF] text-[10px] font-bold shrink-0 cursor-pointer"
              >
                ⚡ مطابقة SOPs مع الحوادث
              </button>
            </div>

            {/* Chat Messages Log */}
            <div className="flex-1 overflow-y-auto space-y-3.5 pl-1 pr-1">
              {messages.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-600 space-y-2 my-auto">
                  <SparklesIcon className="w-8 h-8 text-[#F79C1E] mx-auto opacity-70" />
                  <p className="font-bold text-slate-800">مرحباً بك في بيئة العمل التفاعلية لإعداد وتقييم RCSA</p>
                  <p className="max-w-md mx-auto text-slate-600">
                    يمكنك رفع المستندات المباشرة، أو الضغط على أزرار التحليل السريع أعلاه، أو كتابة توجيهاتك لتوليد التوصيات والاعتمادات.
                  </p>
                </div>
              ) : (
                messages.map((m) => {
                  const isUser = m.sender_role === 'USER';
                  // Find if message corresponds to a clarification prompt
                  const matchingClarif = !isUser
                    ? clarifications.find((c) => m.message_text_ar.includes(c.question_ar) || c.question_ar.includes(m.message_text_ar))
                    : null;

                  return (
                    <div
                      key={m.id}
                      className={`flex flex-col ${isUser ? 'items-start' : 'items-end'}`}
                    >
                      <div className={`max-w-[90%] p-3.5 rounded-2xl text-xs space-y-2.5 shadow-xs ${
                        isUser
                          ? 'bg-[#006547] text-white rounded-br-none'
                          : 'bg-[#E2E1DE] border border-[#C6C4C1] text-slate-900 rounded-bl-none'
                      }`}>
                        <div className="font-bold text-[10px] opacity-80 flex items-center gap-1">
                          {isUser ? 'الموظف (المُعد)' : 'وكيل الذكاء الاصطناعي (AI Agent)'}
                        </div>
                        {isUser ? (
                          <p className="leading-relaxed whitespace-pre-wrap">{m.message_text_ar}</p>
                        ) : (
                          <div dir="rtl" className="space-y-2 text-right leading-relaxed break-words [&_strong]:font-extrabold [&_em]:italic [&_p]:my-1.5 [&_h1]:my-2 [&_h1]:text-base [&_h1]:font-extrabold [&_h2]:my-2 [&_h2]:text-sm [&_h2]:font-extrabold [&_h3]:my-1.5 [&_h3]:font-bold [&_ul]:my-2 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pr-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pr-5 [&_li]:ps-1 [&_blockquote]:border-r-2 [&_blockquote]:border-[#006547] [&_blockquote]:pr-3 [&_blockquote]:text-slate-700 [&_code]:rounded [&_code]:bg-black/5 [&_code]:px-1 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-black/5 [&_pre]:p-2">
                            <ReactMarkdown>{m.message_text_ar}</ReactMarkdown>
                          </div>
                        )}

                        {/* Inline Clarification Controls Inside Chat Bubble */}
                        {!isUser && matchingClarif && (
                          <div className="pt-2 border-t border-[#CECCC9] space-y-2">
                            {matchingClarif.user_answer_ar ? (
                              <div className="text-[11px] font-bold text-emerald-950 bg-emerald-100/90 p-2 rounded-xl border border-emerald-300 flex items-center gap-1.5">
                                <CheckCircle2Icon className="w-4 h-4 text-emerald-700 shrink-0" />
                                <span>تم الإجابة وتأكيد المدخل: {matchingClarif.user_answer_ar}</span>
                              </div>
                            ) : (
                              <div className="bg-amber-50/90 p-3 rounded-xl border border-amber-300 space-y-2">
                                <div className="text-[11px] font-bold text-amber-950 flex items-center gap-1">
                                  <HelpCircleIcon className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                                  <span>يرجى اختيار وتأكيد القيمة المناسبة:</span>
                                </div>
                                {matchingClarif.options && matchingClarif.options.length > 0 ? (
                                  <div className="flex flex-wrap gap-1.5">
                                    {matchingClarif.options.map((opt: string, oIdx: number) => (
                                      <button
                                        key={oIdx}
                                        type="button"
                                        onClick={() => handleAnswerClarification(matchingClarif.id, opt)}
                                        className="px-3 py-1.5 rounded-xl bg-white border border-amber-400 text-[#006547] font-bold text-[11px] hover:bg-amber-100 shadow-2xs transition-all cursor-pointer active:scale-98"
                                      >
                                        {opt}
                                      </button>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="flex gap-1.5">
                                    <input
                                      type="text"
                                      placeholder="اكتب القيمة أو التبرير المعتمد..."
                                      className="flex-1 px-3 py-1.5 border border-amber-300 rounded-xl text-xs bg-white text-slate-900"
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          handleAnswerClarification(matchingClarif.id, (e.target as HTMLInputElement).value);
                                        }
                                      }}
                                    />
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Citations list under agent reply */}
                        {!isUser && m.citations && m.citations.length > 0 && (
                          <div className="pt-2 border-t border-[#CECCC9] space-y-1">
                            <div className="text-[10px] font-bold text-[#006547] flex items-center gap-1">
                              <FileTextIcon className="w-3 h-3" />
                              <span>الأدلة والمستندات المعتمدة:</span>
                            </div>
                            <div className="space-y-1">
                              {m.citations.map((c: any, cIdx: number) => (
                                <div key={cIdx} className="bg-[#DFDEDB] p-2 rounded-lg text-[10px] text-slate-800 border border-[#C6C4C1]">
                                  <div className="font-bold text-slate-900">{c.title_ar} • {c.section_title}</div>
                                  <p className="italic text-slate-700 mt-0.5">"{c.quote_text}"</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
              {sendingMsg && (
                <div role="status" aria-live="polite" className="flex justify-end">
                  <div className="flex max-w-[90%] items-center gap-2 rounded-2xl rounded-bl-none border border-[#C6C4C1] bg-[#E2E1DE] p-3.5 text-xs text-slate-800 shadow-xs">
                    <LoaderIcon className="h-4 w-4 animate-spin text-[#006547]" />
                    <span>
                      المساعد بيفكر باستخدام {agentModels.find((model) => model.id === selectedModel)?.label || selectedModel}...
                      قد يستغرق التحليل بعض الوقت.
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Prompt Input Footer */}
            <div className="border-t border-[#CECCC9] pt-3 flex items-center gap-2">
              <textarea
                rows={2}
                value={userPromptText}
                onChange={(e) => setUserPromptText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder="اكتب توجيهاتك أو استفساراتك للمساعد الذكي..."
                className="flex-1 p-2.5 text-xs bg-[#F4F3F0] border border-[#B8B6B2] rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#006547]"
              />
              <button
                type="button"
                disabled={sendingMsg || !userPromptText.trim()}
                onClick={() => handleSendMessage()}
                className="px-4 py-3 rounded-xl bg-[#006547] hover:bg-[#09331F] text-white text-xs font-bold flex items-center gap-1.5 shadow-sm disabled:opacity-40 shrink-0 cursor-pointer"
              >
                <SendIcon className="w-4 h-4 text-[#F79C1E]" />
                <span>إرسال</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Decision Cards & Session Actions (Span 5) */}
        <div className="lg:col-span-5 space-y-4">

          {/* Proposals & Decision Cards Panel (Collapsible) */}
          <div className="bg-[#ECEBE8] rounded-2xl border border-[#C6C4C1] p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-[#CECCC9] pb-3">
              <div className="flex items-center gap-2">
                <SparklesIcon className="w-4 h-4 text-[#F79C1E]" />
                <h3 className="text-sm font-bold text-slate-900">توصيات الذكاء الاصطناعي للمراجعة والاعتماد</h3>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] px-2 py-0.5 bg-[#E2E1DE] border border-[#C6C4C1] rounded-md font-bold text-slate-800">
                  {proposals.length} توصيات
                </span>
                <button
                  type="button"
                  onClick={() => setShowProposalsPanel(!showProposalsPanel)}
                  className="text-slate-600 hover:text-slate-900 p-1 cursor-pointer"
                  title={showProposalsPanel ? 'طي اللوحة' : 'توسيع اللوحة'}
                >
                  {showProposalsPanel ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {showProposalsPanel && (
              <div>
                {proposals.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-600 bg-[#DFDEDB] rounded-xl border border-[#C6C4C1]">
                    لا توجد توصيات جديدة بانتظار قرارك حالياً. يمكنك استخدام التوجيهات أو رفع مستندات جديدة لتوليد التوصيات.
                  </div>
                ) : (
                  <div className="space-y-3.5 max-h-[500px] overflow-y-auto pl-1 pr-1">
                    {proposals.map((p) => {
                      const data = p.proposal_data || {};
                      const isAccepted = p.status === 'ACCEPTED' || p.status === 'MODIFIED_ACCEPTED';
                      const isRejected = p.status === 'REJECTED';

                      return (
                        <div 
                          key={p.id}
                          className={`p-4 rounded-xl border-2 space-y-3 transition-all ${
                            isAccepted 
                              ? 'border-emerald-500 bg-emerald-50/60'
                              : isRejected
                                ? 'border-slate-300 bg-slate-100 opacity-60'
                                : 'border-[#006547]/40 bg-[#E4E7E4]'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="space-y-1.5">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 font-mono">
                                  {data.risk_id || p.id}
                                </span>
                                {(data.taxonomy_l1_ar || data.taxonomy_l2_ar) && (
                                  <span className="text-[10px] px-2 py-0.5 rounded bg-blue-100 text-blue-900 font-semibold">
                                    {data.taxonomy_l1_id ? `[${data.taxonomy_l1_id}] ` : ''}{data.taxonomy_l1_ar || ''}
                                    {data.taxonomy_l2_ar ? ` ← ${data.taxonomy_l2_id ? `[${data.taxonomy_l2_id}] ` : ''}${data.taxonomy_l2_ar}` : ''}
                                  </span>
                                )}
                                {data.esg_pillar && (
                                  <span className="text-[10px] px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-semibold">
                                    ESG: {data.esg_pillar}
                                  </span>
                                )}
                              </div>
                              <h4 className="text-xs font-bold text-slate-900">{data.risk_title_ar || data.process_name_ar}</h4>
                              <p className="text-[11px] text-slate-700 leading-relaxed">{data.description_ar}</p>

                              {/* Financial & NFI Assessment Badges */}
                              <div className="grid grid-cols-2 gap-2 text-[10px] pt-1">
                                <div className="bg-[#DFDEDB] p-2 rounded-lg border border-[#C6C4C1]">
                                  <span className="font-bold text-[#006547]">💰 الأثر المالي الفردي: </span>
                                  <span className="font-semibold text-slate-900">
                                    {Number(data.financial_impact_amount || data.expected_loss_egp || 0).toLocaleString()} ج.م
                                  </span>
                                </div>
                                <div className="bg-[#DFDEDB] p-2 rounded-lg border border-[#C6C4C1]">
                                  <span className="font-bold text-[#006547]">📊 NFI المركب: </span>
                                  <span className="font-semibold text-slate-900">{data.nfi_composite_score || 'M (متوسط)'}</span>
                                </div>
                              </div>
                            </div>

                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded shrink-0 ${
                              isAccepted ? 'bg-emerald-600 text-white' : isRejected ? 'bg-slate-400 text-white' : 'bg-amber-100 text-amber-900 border border-amber-300'
                            }`}>
                              {isAccepted ? 'تم القبول ✓' : isRejected ? 'تم الاستبعاد ✗' : 'بانتظار القرار'}
                            </span>
                          </div>

                          {/* Evidence Citations */}
                          {p.citations && p.citations.length > 0 && (
                            <div className="bg-[#DFDEDB] p-2.5 rounded-lg border border-[#C6C4C1] text-[10px] text-slate-800 space-y-1">
                              <div className="font-bold text-[#006547] flex items-center gap-1">
                                <FileTextIcon className="w-3.5 h-3.5" />
                                <span>المقطع المصدري الموثق ({p.citations[0].title_ar}):</span>
                              </div>
                              <p className="italic text-slate-700">"{p.citations[0].quote_text}"</p>
                            </div>
                          )}

                          {/* Decision Buttons */}
                          {!isAccepted && !isRejected && (
                            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#CECCC9]">
                              <button
                                type="button"
                                onClick={() => handleProposalDecision(p.id, 'REJECT')}
                                className="px-3 py-1.5 rounded-lg bg-rose-100 border border-rose-300 text-rose-900 hover:bg-rose-200 text-xs font-bold flex items-center gap-1 cursor-pointer"
                              >
                                <XIcon className="w-3.5 h-3.5 text-rose-700" />
                                <span>رفض</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleProposalDecision(p.id, 'ACCEPT')}
                                className="px-3.5 py-1.5 rounded-lg bg-[#006547] hover:bg-[#09331F] text-white text-xs font-bold flex items-center gap-1 shadow-sm cursor-pointer"
                              >
                                <CheckIcon className="w-3.5 h-3.5 text-[#F79C1E]" />
                                <span>قبول التوصية</span>
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Persistent Navigation Footer */}
          <div className="bg-[#ECEBE8] p-4 rounded-2xl border border-[#C6C4C1] shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => {
                onNavigate?.({
                  page: 'backend-rcsa',
                  unitId: selectedUnitId,
                  sessionId: sessionId || undefined,
                  mode: session?.workflow_mode,
                });
              }}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-[#E2E1DE] hover:bg-[#D5D3CF] text-[#09331F] border border-[#B8B6B2] text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <ArrowRightIcon className="w-4 h-4 text-[#006547]" />
              <span>← إعداد التقييم الموجه</span>
            </button>

            <button
              type="button"
              onClick={handleCreateDraftAndOpenReview}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-[#006547] hover:bg-[#09331F] text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm cursor-pointer active:scale-98"
            >
              <TablePropertiesIcon className="w-4 h-4 text-[#F79C1E]" />
              <span>المتابعة إلى مصفوفة التقييم والاعتماد (Review & Export) →</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
