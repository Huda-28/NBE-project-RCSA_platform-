import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { PageId } from '../components/Sidebar.js';
import { AppNavigationState } from '../App.js';
import { CreateBusinessUnitModal } from '../components/CreateBusinessUnitModal.js';
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
  Zap as ZapIcon,
  Target as TargetIcon,
  Database as DatabaseIcon,
  Eye as EyeIcon,
  ClipboardPaste as ClipboardPasteIcon,
  ShieldCheck as ShieldCheckIcon,
} from 'lucide-react';

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
  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  const [businessUnits, setBusinessUnits] = useState<any[]>([]);
  const [selectedUnitId, setSelectedUnitId] = useState<string>(initialUnitId || '');
  const [sessionId, setSessionId] = useState<string | null>(initialSessionId || null);
  const [workflowMode, setWorkflowMode] = useState<'NEW' | 'UPDATE'>(initialMode || 'NEW');
  const [selectedModelProfile, setSelectedModelProfile] = useState<'qwen-0.5b' | 'qwen-4b'>(() => {
    try {
      const saved = window.localStorage.getItem('rcsa_selected_qwen_model');
      if (saved === 'qwen-0.5b' || saved === 'qwen2.5:0.5b' || saved === 'سريع') return 'qwen-0.5b';
      if (saved === 'qwen-4b' || saved === 'qwen3.5:4b' || saved === 'qwen3:4b' || saved === 'دقيق') return 'qwen-4b';
    } catch {
      // ignore storage errors
    }
    return 'qwen-4b';
  });

  // Agent session state
  const [session, setSession] = useState<any | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [proposals, setProposals] = useState<any[]>([]);
  const [clarifications, setClarifications] = useState<any[]>([]);
  const [llmStatus, setLlmStatus] = useState<any | null>(null);
  const [ragStats, setRagStats] = useState<any | null>(null);

  const [loadingState, setLoadingState] = useState<boolean>(true);
  const [sendingMsg, setSendingMsg] = useState<boolean>(false);
  const [uploadingDocs, setUploadingDocs] = useState<boolean>(false);
  const [switchingModel, setSwitchingModel] = useState<boolean>(false);
  const [userPromptText, setUserPromptText] = useState<string>('');
  const [actionNotice, setActionNotice] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // UI Toggles & Modals
  const [showDocsPanel, setShowDocsPanel] = useState<boolean>(true);
  const [showProposalsPanel, setShowProposalsPanel] = useState<boolean>(true);
  const [inspectedDocId, setInspectedDocId] = useState<string | null>(null);
  const [showPasteModal, setShowPasteModal] = useState<boolean>(false);
  const [showAddUnitModal, setShowAddUnitModal] = useState<boolean>(false);
  const [pasteTitle, setPasteTitle] = useState<string>('');
  const [pasteDocType, setPasteDocType] = useState<string>('SOP');
  const [pasteContent, setPasteContent] = useState<string>('');

  // Inline Proposal Editing
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
          const defaultBu = list.find((u: any) => u.id === 'BU-SWIFT-SETTLE') || list[0];
          setSelectedUnitId(defaultBu.id);
        }
      })
      .catch((err) => console.error('Failed to load authorized business units:', err));
  }, [token, initialUnitId]);

  const applyStateResponse = (stateData: any, fallbackMode?: 'NEW' | 'UPDATE') => {
    if (stateData.session) {
      setSession(stateData.session);
      setWorkflowMode(stateData.session.workflow_mode || fallbackMode || 'NEW');
      let savedBrowserPref: string | null = null;
      try {
        savedBrowserPref = window.localStorage.getItem('rcsa_selected_qwen_model');
      } catch {
        savedBrowserPref = null;
      }
      if (savedBrowserPref === 'qwen-0.5b' || savedBrowserPref === 'qwen-4b') {
        setSelectedModelProfile(savedBrowserPref);
      } else if (stateData.session.selected_model_profile) {
        setSelectedModelProfile(
          stateData.session.selected_model_profile === 'qwen-0.5b' ? 'qwen-0.5b' : 'qwen-4b'
        );
      }
    }
    setMessages(stateData.messages || []);
    setProposals(stateData.proposals || []);
    setClarifications(stateData.clarifications || []);
    setLlmStatus(stateData.llm_status || null);
    setRagStats(stateData.rag_stats || null);
  };

  // Load Agent Session details by ID or active session for selected unit
  const loadAgentState = async (targetSessionId?: string, targetUnitId?: string, modeToUse?: 'NEW' | 'UPDATE') => {
    if (!token) return;
    setLoadingState(true);
    try {
      const unitIdToUse = targetUnitId || selectedUnitId;
      const effectiveMode = modeToUse || workflowMode;
      // Do not reuse a sessionId if it belongs to a different business unit
      let sid = targetSessionId;
      if (!sid && sessionId && session && session.unit_id === unitIdToUse) {
        sid = sessionId;
      }

      if (!sid) {
        const activeRes = await fetch(`/api/workflow/sessions/active?unit_id=${unitIdToUse}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const activeBody = await activeRes.json();
        if (activeBody.session && activeBody.session.workflow_mode === effectiveMode) {
          sid = activeBody.session.id;
        } else {
          const createRes = await fetch('/api/workflow/sessions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              unit_id: unitIdToUse,
              workflow_mode: effectiveMode,
              session_title:
                effectiveMode === 'UPDATE'
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
          applyStateResponse(stateData, effectiveMode);
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
    setInspectedDocId(null);
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
          session_title:
            newMode === 'UPDATE'
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
          text:
            newMode === 'NEW'
              ? 'تم البدء في جلسة تقييم جديد مستقلة بدون نسخ مخاطر تاريخية.'
              : 'تم البدء في جلسة تحديث تقييم وتحميل بيانات التقييم المرجعي السابق للمقارنة.',
        });
      }
    } catch (err: any) {
      setActionNotice({ type: 'error', text: err.message });
      setLoadingState(false);
    }
  };

  // Switch between Qwen 2.5 0.5B (Fast) and Qwen 3 4B (Accurate) and remember in browser
  const handleSwitchQwenModel = async (newProfile: 'qwen-0.5b' | 'qwen-4b') => {
    setSelectedModelProfile(newProfile);
    try {
      window.localStorage.setItem('rcsa_selected_qwen_model', newProfile);
    } catch {
      // ignore storage errors
    }
    if (!token || !sessionId) return;
    setSwitchingModel(true);
    try {
      const res = await fetch(`/api/agent/sessions/${sessionId}/model`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ model_profile: newProfile }),
      });
      const data = await res.json();
      if (res.ok) {
        applyStateResponse(data);
        setActionNotice({
          type: 'info',
          text:
            newProfile === 'qwen-0.5b'
              ? '⚡ تم التبديل إلى الوضع (سريع) وحفظ الاختيار.'
              : '🎯 تم التبديل إلى الوضع (دقيق) وحفظ الاختيار.',
        });
      }
    } catch (err: any) {
      console.error('Failed to switch Qwen model:', err);
    } finally {
      setSwitchingModel(false);
    }
  };

  // Upload any document format directly from AI Agent Page
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0 || !token || !sessionId) return;

    setUploadingDocs(true);
    setActionNotice(null);
    let successCount = 0;
    let totalExtractedChunks = 0;
    const failMessages: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const lowerName = file.name.toLowerCase();
        const isTextLike =
          lowerName.endsWith('.txt') ||
          lowerName.endsWith('.csv') ||
          lowerName.endsWith('.tsv') ||
          lowerName.endsWith('.json') ||
          lowerName.endsWith('.md') ||
          lowerName.endsWith('.xml') ||
          lowerName.endsWith('.html') ||
          lowerName.endsWith('.htm') ||
          lowerName.endsWith('.yaml') ||
          lowerName.endsWith('.yml') ||
          lowerName.endsWith('.log') ||
          lowerName.endsWith('.rtf');

        let contentBase64: string | undefined = undefined;
        let contentText: string | undefined = undefined;

        if (isTextLike) {
          contentText = await file.text();
        } else {
          const buffer = await file.arrayBuffer();
          const bytes = new Uint8Array(buffer);
          let binary = '';
          const chunkSize = 8192;
          for (let j = 0; j < bytes.length; j += chunkSize) {
            binary += String.fromCharCode(...bytes.subarray(j, j + chunkSize));
          }
          contentBase64 = btoa(binary);
        }

        // Infer document classification
        let fileType = 'SOP';
        if (lowerName.includes('incident') || lowerName.includes('حادث') || lowerName.includes('خسار')) {
          fileType = 'INCIDENT_LOG';
        } else if (lowerName.includes('audit') || lowerName.includes('تفتيش') || lowerName.includes('مراجعة')) {
          fileType = 'AUDIT_REPORT';
        } else if (lowerName.includes('rcsa') || lowerName.includes('تقييم')) {
          fileType = 'PREVIOUS_RCSA';
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
            file_size_bytes: contentBase64 ? file.size : undefined,
            title_ar: file.name,
          }),
        });

        const uploadData = await uploadRes.json();
        if (!uploadRes.ok) throw new Error(uploadData.error || `فشل رفع المستند ${file.name}`);
        successCount++;
        totalExtractedChunks += Number(uploadData.extracted_chunks_count || 0);
      } catch (err: any) {
        failMessages.push(`${file.name}: ${err.message}`);
      }
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    await loadAgentState(sessionId, selectedUnitId);
    setUploadingDocs(false);

    if (successCount > 0 && failMessages.length === 0) {
      setActionNotice({
        type: 'success',
        text: `تم رفع وفهرسة (${successCount}) ملفات بنجاح واستخلاص (${totalExtractedChunks}) مقطعاً مرجعياً في محرك RAG الجاهز للأسئلة وبناء RCSA.`,
      });
    } else if (failMessages.length > 0) {
      setActionNotice({
        type: 'error',
        text: `تم رفع (${successCount}) مستندات وتعذر معالجة: ${failMessages.join(' | ')}`,
      });
    }
  };

  // Paste direct text / table / CSV / JSON as a document in the RAG session
  const handlePasteDataSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !sessionId || !pasteContent.trim()) return;

    setUploadingDocs(true);
    setActionNotice(null);
    const cleanTitle = (pasteTitle.trim() || `بيانات_مدخلة_${Date.now()}.txt`).replace(/\s+/g, '_');
    const filenameWithExt = cleanTitle.includes('.') ? cleanTitle : `${cleanTitle}.txt`;

    try {
      const uploadRes = await fetch(`/api/guided-rcsa/units/${selectedUnitId}/documents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          session_id: sessionId,
          fileType: pasteDocType,
          doc_type: pasteDocType,
          filename: filenameWithExt,
          file_name: filenameWithExt,
          mimeType: 'text/plain',
          text_content: pasteContent.trim(),
          title_ar: pasteTitle.trim() || filenameWithExt,
        }),
      });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploadData.error || 'تعذر حفظ البيانات النصية.');

      setShowPasteModal(false);
      setPasteTitle('');
      setPasteContent('');
      await loadAgentState(sessionId, selectedUnitId);
      setActionNotice({
        type: 'success',
        text: `تم فهرسة البيانات المضافة (${uploadData.extracted_chunks_count || 1} مقطع) بنجاح في نظام RAG وإتاحتها للوضع (${selectedModelProfile === 'qwen-0.5b' ? 'سريع' : 'دقيق'}).`,
      });
    } catch (err: any) {
      setActionNotice({ type: 'error', text: err.message });
    } finally {
      setUploadingDocs(false);
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
      if (inspectedDocId === documentId) setInspectedDocId(null);
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
    if (!customPrompt) setUserPromptText('');

    try {
      const res = await fetch(`/api/agent/sessions/${sessionId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          message_text_ar: textToSubmit,
          model_profile: selectedModelProfile,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل إرسال التوجيه للوكيل.');
      applyStateResponse(data);
      setTimeout(() => {
        chatBottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 100);
    } catch (err: any) {
      setActionNotice({ type: 'error', text: err.message });
    } finally {
      setSendingMsg(false);
    }
  };

  const handleProposalDecision = async (
    proposalId: string,
    decision: 'ACCEPT' | 'REJECT' | 'MODIFIED_ACCEPTED',
    modifiedData?: any
  ) => {
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
      applyStateResponse(data);
      setEditingProposalId(null);
      setActionNotice({
        type: 'success',
        text:
          decision === 'REJECT'
            ? 'تم استبعاد المقترح من التقييم.'
            : 'تم قبول المقترح وإعادة احتسابه عبر محرك بايثون وإدراجه في مسودة التقييم.',
      });
    } catch (err: any) {
      setActionNotice({ type: 'error', text: err.message });
    }
  };

  const handleAcceptAllProposals = async () => {
    if (!token || !sessionId) return;
    setActionNotice(null);
    try {
      const res = await fetch(`/api/agent/sessions/${sessionId}/proposals/accept-all`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'تعذر قبول كافة التوصيات.');
      applyStateResponse(data);
      setActionNotice({
        type: 'success',
        text: 'تم قبول جميع التوصيات المقترحة وإدراجها في مسودة التقييم الجاهزة للمراجعة.',
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
      applyStateResponse(data);
      setActionNotice({ type: 'success', text: 'تم تسجيل إجابتك وإعادة احتساب الأثر المالي وتحديث التوصية.' });
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

  const handleClearCurrentChat = async () => {
    if (!token || !sessionId) return;
    try {
      const res = await fetch(`/api/agent/sessions/${sessionId}/messages`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'تعذر مسح المحادثة.');
      applyStateResponse(data);
      setActionNotice({ type: 'success', text: 'تم مسح سجل المحادثة والتوصيات القديمة للجلسة بنجاح.' });
    } catch (err: any) {
      setActionNotice({ type: 'error', text: err.message });
    }
  };

  const handleClearAllPlatformChat = async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/agent/messages', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'تعذر مسح سجل المحادثات.');
      setMessages([]);
      setProposals([]);
      setClarifications([]);
      setActionNotice({ type: 'success', text: 'تم مسح كافة سجلات المحادثات والتوصيات القديمة في المنصة بنجاح.' });
    } catch (err: any) {
      setActionNotice({ type: 'error', text: err.message });
    }
  };

  const docsList = session?.session_documents || [];
  const inspectedDoc = docsList.find((d: any) => d.id === inspectedDocId) || null;
  const pendingProposalsCount = proposals.filter((p) => p.status === 'PROPOSED').length;
  const acceptedProposalsCount = proposals.filter(
    (p) => p.status === 'ACCEPTED' || p.status === 'MODIFIED_ACCEPTED'
  ).length;

  const formatDocTitle = (raw?: string): string => {
    if (!raw) return 'مستند مرجعي';
    const base = raw.split('/').pop() || raw;
    if (/^_+/.test(base)) {
      const cleanTail = base.replace(/^_+/, '').replace(/_+/g, '_');
      return `دليل إجراءات الوحدة المعتمد (${cleanTail})`;
    }
    return base.replace(/^\d{10,}_/, '');
  };

  const formatMessageDisplay = (rawText?: string): string => {
    if (!rawText) return '';
    return rawText
      .replace(/public\/assets\/aistudio\/[^\s\n)]+/g, (match) => formatDocTitle(match))
      .replace(/_{4,}[^\s\n)\]]+/g, (match) => formatDocTitle(match))
      .replace(/Qwen\s*(?:2\.5|3(?:\.5)?)\s*(?:0\.5B|4B)\s*\((سريع|دقيق)\)/gi, '$1')
      .replace(/Qwen\s*(?:0\.5B|4B)\s*\((سريع|دقيق)\)/gi, '$1');
  };

  const renderInlineMarkdown = (text: string, isUser = false): React.ReactNode => {
    if (!text) return null;
    // Match **bold**, `code`, or _italic_
    const tokenRegex = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\n]+\*|_[^_\n]+_)/g;
    const parts = text.split(tokenRegex);

    return parts.map((part, idx) => {
      if (!part) return null;
      if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
        const inner = part.slice(2, -2).replace(/\*\*/g, '');
        return (
          <strong
            key={idx}
            className={isUser ? 'font-extrabold text-white' : 'font-extrabold text-[#09331F]'}
          >
            {inner}
          </strong>
        );
      }
      if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
        const inner = part.slice(1, -1);
        return (
          <code
            key={idx}
            className={
              isUser
                ? 'px-1.5 py-0.5 rounded bg-white/20 text-white font-mono text-[11px] font-bold mx-0.5'
                : 'px-1.5 py-0.5 rounded bg-[#006547]/15 text-[#09331F] font-mono text-[11px] font-bold mx-0.5'
            }
          >
            {inner}
          </code>
        );
      }
      if (
        ((part.startsWith('*') && part.endsWith('*')) ||
          (part.startsWith('_') && part.endsWith('_'))) &&
        part.length > 2
      ) {
        const inner = part.slice(1, -1).replace(/\*\*/g, '');
        return (
          <em key={idx} className={isUser ? 'italic text-emerald-100' : 'italic text-slate-700'}>
            {inner}
          </em>
        );
      }
      // Strip any stray unpaired ** markers
      return <React.Fragment key={idx}>{part.replace(/\*\*/g, '')}</React.Fragment>;
    });
  };

  const renderFormattedMarkdown = (rawText?: string, isUser = false): React.ReactNode => {
    const cleaned = formatMessageDisplay(rawText);
    if (!cleaned) return null;

    const lines = cleaned.split('\n');
    const elements: React.ReactNode[] = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      // 1. Empty line spacer
      if (!trimmed) {
        elements.push(<div key={`sp-${i}`} className="h-1.5" />);
        i++;
        continue;
      }

      // 2. Markdown Table block (consecutive lines containing |)
      if (trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.split('|').length >= 3) {
        const tableLines: string[] = [];
        while (
          i < lines.length &&
          lines[i].trim().startsWith('|') &&
          lines[i].trim().includes('|')
        ) {
          tableLines.push(lines[i].trim());
          i++;
        }

        const parsedRows = tableLines
          .filter((tLine) => !/^\|[\s\-:|]+\|$/.test(tLine))
          .map((tLine) =>
            tLine
              .replace(/^\|/, '')
              .replace(/\|$/, '')
              .split('|')
              .map((cell) => cell.trim())
          );

        if (parsedRows.length > 0) {
          const headerRow = parsedRows[0];
          const bodyRows = parsedRows.slice(1);
          elements.push(
            <div
              key={`tbl-${i}`}
              className="overflow-x-auto my-2 rounded-xl border border-[#B8B6B2] shadow-2xs"
            >
              <table className="w-full text-[11px] text-right border-collapse">
                <thead className="bg-[#09331F] text-white">
                  <tr>
                    {headerRow.map((hCell, cIdx) => (
                      <th
                        key={cIdx}
                        className="px-2.5 py-2 font-bold border-b border-[#006547] text-right"
                      >
                        {renderInlineMarkdown(hCell, true)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#CECCC9] bg-[#F4F3F0] text-slate-900">
                  {bodyRows.map((bRow, rIdx) => (
                    <tr key={rIdx} className="hover:bg-[#ECEBE8]">
                      {bRow.map((bCell, cIdx) => (
                        <td key={cIdx} className="px-2.5 py-1.5 align-top leading-relaxed">
                          {renderInlineMarkdown(bCell, false)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
          continue;
        }
      }

      // 3. Horizontal rule
      if (/^[-*_]{3,}$/.test(trimmed)) {
        elements.push(<hr key={`hr-${i}`} className="border-[#CECCC9] my-2" />);
        i++;
        continue;
      }

      // 4. Headings (#, ##, ###, ####)
      const headingMatch = trimmed.match(/^(#{1,4})\s+(.*)$/);
      if (headingMatch) {
        const level = headingMatch[1].length;
        const headingText = headingMatch[2];
        elements.push(
          <div
            key={`hd-${i}`}
            className={`font-extrabold ${
              level <= 2 ? 'text-sm' : 'text-[13px]'
            } ${
              isUser
                ? 'text-white'
                : 'text-[#09331F]'
            } mt-2.5 mb-1 leading-snug`}
          >
            {renderInlineMarkdown(headingText, isUser)}
          </div>
        );
        i++;
        continue;
      }

      // 5. Bullet list item (-, *, •)
      const bulletMatch = line.match(/^(\s*)[-*•]\s+(.*)$/);
      if (bulletMatch) {
        const indent = bulletMatch[1].length >= 2 ? 'mr-3' : '';
        const itemText = bulletMatch[2];
        elements.push(
          <div key={`ul-${i}`} className={`flex items-start gap-2 pr-1 my-0.5 ${indent}`}>
            <span
              className={`font-extrabold select-none mt-0.5 ${
                isUser ? 'text-[#F79C1E]' : 'text-[#006547]'
              }`}
            >
              •
            </span>
            <div className="flex-1 leading-relaxed">{renderInlineMarkdown(itemText, isUser)}</div>
          </div>
        );
        i++;
        continue;
      }

      // 6. Numbered list item (1., 2), etc.)
      const numMatch = line.match(/^(\s*)(\d+[\.\)])\s+(.*)$/);
      if (numMatch) {
        const indent = numMatch[1].length >= 2 ? 'mr-3' : '';
        const numLabel = numMatch[2].replace(/[\.\)]$/, '');
        const itemText = numMatch[3];
        elements.push(
          <div key={`ol-${i}`} className={`flex items-start gap-2 pr-1 my-1 ${indent}`}>
            <span
              className={`px-1.5 py-0.2 rounded font-extrabold text-[10px] shrink-0 mt-0.5 ${
                isUser
                  ? 'bg-white/20 text-white'
                  : 'bg-[#006547]/15 text-[#09331F]'
              }`}
            >
              {numLabel}
            </span>
            <div className="flex-1 leading-relaxed">{renderInlineMarkdown(itemText, isUser)}</div>
          </div>
        );
        i++;
        continue;
      }

      // 7. Standard paragraph line
      elements.push(
        <div key={`p-${i}`} className="leading-relaxed">
          {renderInlineMarkdown(line, isUser)}
        </div>
      );
      i++;
    }

    return <div className="space-y-0.5">{elements}</div>;
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-300 font-['Cairo'] text-right" dir="rtl">
      <CreateBusinessUnitModal
        isOpen={showAddUnitModal}
        onClose={() => setShowAddUnitModal(false)}
        existingUnitCodes={businessUnits.map((b) => b.code)}
        onUnitCreated={(newUnit) => {
          setBusinessUnits((prev) => {
            if (prev.some((b) => b.id === newUnit.id)) return prev;
            return [...prev, newUnit];
          });
          handleUnitChange(newUnit.id);
        }}
      />
      {/* Hidden File Input for Universal Document Upload */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        multiple
        accept=".pdf,.docx,.doc,.xlsx,.xls,.pptx,.ppt,.csv,.tsv,.txt,.md,.json,.xml,.html,.htm,.rtf,.yaml,.yml,.log,.zip"
        className="hidden"
      />

      {/* Main Executive Page Header */}
      <div className="bg-white p-5 rounded-2xl border border-[#DCDAD5] shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-[#09331F] text-[#F79C1E] flex items-center justify-center shrink-0 shadow-inner border border-[#006547]">
            <BotIcon className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-xl font-extrabold text-[#09331F]">
                منظومة الوكيل الذكي وقاعدة المعرفة الشاملة (RAG) لإعداد RCSA
              </h2>
              <span className="text-[10px] px-2.5 py-0.5 rounded-md bg-emerald-50 text-[#006547] font-bold border border-emerald-300">
                محرك RAG متعدد الصيغ + استدلال شامل (29 عموداً)
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-1">
              ارفع أي نوع من الملفات أو الجداول (PDF, Word, Excel, CSV, JSON, XML, PPTX, TXT, ZIP)، واسأل أي سؤال عنها، وولّد مصفوفة RCSA عالية الدقة لكافة وحدات العمل.
            </p>
          </div>
        </div>

        {/* Primary Action Header Bar: Upload Documents & Paste Data */}
        <div className="flex items-center gap-2.5 flex-wrap shrink-0">
          <button
            type="button"
            disabled={uploadingDocs || !sessionId}
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-2.5 rounded-xl bg-[#006547] hover:bg-[#09331F] text-white font-bold text-xs flex items-center gap-2 shadow-xs cursor-pointer disabled:opacity-40 transition-all active:scale-98"
          >
            <FileUpIcon className="w-4 h-4 text-[#F79C1E]" />
            <span>{uploadingDocs ? 'جاري رفع وفهرسة الملفات...' : 'رفع ملفات للتحليل (كافة الصيغ)'}</span>
          </button>

          <button
            type="button"
            disabled={uploadingDocs || !sessionId}
            onClick={() => setShowPasteModal(true)}
            className="px-3.5 py-2.5 rounded-xl bg-[#F8F8F6] hover:bg-[#EFECE6] border border-[#DCDAD5] text-[#09331F] font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-all"
          >
            <ClipboardPasteIcon className="w-4 h-4 text-[#006547]" />
            <span>لصق نص / جدول مباشر</span>
          </button>
        </div>
      </div>

      {/* Interactive 3-Step RCSA Lifecycle Progress Bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-white p-3.5 rounded-2xl border border-[#DCDAD5] shadow-xs">
        <div
          onClick={() => fileInputRef.current?.click()}
          className="p-3 rounded-xl bg-[#F8F8F6] hover:bg-emerald-50/50 border border-[#E5E3DE] hover:border-[#006547]/40 transition-all cursor-pointer flex items-center justify-between gap-2"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-7 h-7 rounded-lg bg-[#09331F] text-[#F79C1E] font-mono font-bold text-xs flex items-center justify-center shrink-0">
              1
            </span>
            <div className="min-w-0">
              <div className="text-xs font-extrabold text-[#09331F] truncate">
                تغذية المعرفة وفهرسة المستندات
              </div>
              <div className="text-[10px] text-slate-600 tabular-nums truncate">
                {docsList.length > 0
                  ? `${docsList.length} ملفات مرفقة بالجلسة`
                  : 'مراجع الوحدة أو استدلال شامل بدون ملفات'}
              </div>
            </div>
          </div>
          <FileUpIcon className="w-4 h-4 text-[#006547] shrink-0" />
        </div>

        <div
          onClick={() => {
            if (!sendingMsg) {
              handleSendMessage(
                'قم بتحليل كافة المستندات المرفوعة بالجلسة، واقتراح قائمة المخاطر والضوابط بدقة عالية، وحساب الأثر المالي المقدر، والأثر غير المالي (NFI)، وركائز ESG، والتصنيف الهيكلي L1/L2/L3.'
              );
            }
          }}
          className="p-3 rounded-xl bg-[#F8F8F6] hover:bg-emerald-50/50 border border-[#E5E3DE] hover:border-[#006547]/40 transition-all cursor-pointer flex items-center justify-between gap-2"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-7 h-7 rounded-lg bg-[#006547] text-white font-mono font-bold text-xs flex items-center justify-center shrink-0">
              2
            </span>
            <div className="min-w-0">
              <div className="text-xs font-extrabold text-[#09331F] truncate">
                توليد ومراجعة توصيات RCSA
              </div>
              <div className="text-[10px] text-slate-600 tabular-nums truncate">
                {proposals.length} توصيات مستنبطة • {acceptedProposalsCount} مقبولة
              </div>
            </div>
          </div>
          <TargetIcon className="w-4 h-4 text-[#F79C1E] shrink-0" />
        </div>

        <div
          onClick={handleCreateDraftAndOpenReview}
          className="p-3 rounded-xl bg-emerald-50/70 hover:bg-emerald-100/70 border border-[#006547]/40 transition-all cursor-pointer flex items-center justify-between gap-2"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-7 h-7 rounded-lg bg-[#F79C1E] text-[#09331F] font-mono font-bold text-xs flex items-center justify-center shrink-0">
              3
            </span>
            <div className="min-w-0">
              <div className="text-xs font-extrabold text-[#09331F] truncate">
                اعتماد المصفوفة والتصدير الرسمي
              </div>
              <div className="text-[10px] text-[#006547] font-semibold truncate">
                ملء تلقائي لـ 29 عموداً (C إلى AE) وتصدير Excel
              </div>
            </div>
          </div>
          <TablePropertiesIcon className="w-4 h-4 text-[#006547] shrink-0" />
        </div>
      </div>

      {/* Mode Selector (سريع / دقيق) & RAG Engine Telemetry Bar */}
      <div className="bg-white p-4 rounded-2xl border border-[#DCDAD5] shadow-xs space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Selector: سريع vs دقيق */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
            <div className="flex items-center gap-1.5 text-xs font-bold text-[#09331F] shrink-0">
              <CpuIcon className="w-4 h-4 text-[#006547]" />
              <span>وضع الاستدلال:</span>
            </div>

            <div
              className="grid grid-cols-2 gap-2 bg-[#F3F4F2] p-1.5 rounded-xl border border-[#DCDAD5]"
              role="group"
              aria-label="اختيار وضع الاستدلال"
            >
              <button
                type="button"
                disabled={switchingModel}
                onClick={() => handleSwitchQwenModel('qwen-0.5b')}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-2 text-right ${
                  selectedModelProfile === 'qwen-0.5b'
                    ? 'bg-[#006547] text-white shadow-xs ring-2 ring-[#F79C1E]/80'
                    : 'bg-white text-slate-800 hover:bg-[#EFECE6] hover:text-slate-950 border border-[#DCDAD5]'
                }`}
              >
                <ZapIcon
                  className={`w-4 h-4 shrink-0 ${
                    selectedModelProfile === 'qwen-0.5b' ? 'text-[#F79C1E]' : 'text-amber-600'
                  }`}
                />
                <div>
                  <div className="text-sm font-bold">سريع</div>
                  <div
                    className={`text-[10px] font-normal ${
                      selectedModelProfile === 'qwen-0.5b' ? 'text-emerald-100' : 'text-slate-600'
                    }`}
                  >
                    استجابة فورية للأسئلة المباشرة والملخصات السريعة
                  </div>
                </div>
              </button>

              <button
                type="button"
                disabled={switchingModel}
                onClick={() => handleSwitchQwenModel('qwen-4b')}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-2 text-right ${
                  selectedModelProfile === 'qwen-4b'
                    ? 'bg-[#09331F] text-white shadow-xs ring-2 ring-[#F79C1E]'
                    : 'bg-white text-slate-800 hover:bg-[#EFECE6] hover:text-slate-950 border border-[#DCDAD5]'
                }`}
              >
                <TargetIcon
                  className={`w-4 h-4 shrink-0 ${
                    selectedModelProfile === 'qwen-4b' ? 'text-[#F79C1E]' : 'text-[#006547]'
                  }`}
                />
                <div>
                  <div className="text-sm font-bold">دقيق</div>
                  <div
                    className={`text-[10px] font-normal ${
                      selectedModelProfile === 'qwen-4b' ? 'text-emerald-100' : 'text-slate-600'
                    }`}
                  >
                    دقة فائقة لتحليل الملفات وبناء مصفوفة RCSA الشاملة
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Live RAG Knowledge Base Stats */}
          <div className="flex items-center gap-2 flex-wrap text-[11px] tabular-nums">
            <div className="px-3 py-1.5 rounded-xl bg-[#F8F8F6] border border-[#DCDAD5] text-slate-800 flex items-center gap-1.5">
              <DatabaseIcon className="w-3.5 h-3.5 text-[#006547]" />
              <span>فهرس RAG النشط:</span>
              <strong className="text-[#09331F]">{ragStats?.documents_count ?? docsList.length} ملفات</strong>
              <span className="text-slate-400">•</span>
              <strong className="text-[#09331F]">{ragStats?.total_chunks_count ?? 0} مقطع نصي</strong>
            </div>
            <div className="px-3 py-1.5 rounded-xl bg-[#F8F8F6] border border-[#DCDAD5] text-slate-800 flex items-center gap-1.5">
              <ShieldCheckIcon className="w-3.5 h-3.5 text-[#006547]" />
              <span>مرجع التصنيف:</span>
              <strong className="text-[#09331F]">{ragStats?.taxonomy_nodes_count ?? 84} بند L1-L3</strong>
              <span className="text-slate-400">•</span>
              <strong className="text-[#09331F]">{ragStats?.esg_items_count ?? 34} معيار ESG</strong>
            </div>
          </div>
        </div>

        {/* Business Unit Selector & Workflow Mode Switcher Row */}
        <div className="pt-2.5 border-t border-[#E5E3DE] flex flex-col md:flex-row items-center justify-between gap-3">
          {/* BU Selector */}
          <div className="flex items-center gap-2 flex-wrap">
            <LayersIcon className="w-4 h-4 text-[#006547]" />
            <label htmlFor="agent-bu-select" className="text-xs font-bold text-[#09331F]">
              الوحدة التنظيمية:
            </label>
            <select
              id="agent-bu-select"
              value={selectedUnitId}
              onChange={(e) => {
                if (e.target.value === 'OTHER') {
                  setShowAddUnitModal(true);
                  return;
                }
                handleUnitChange(e.target.value);
              }}
              className="px-3.5 py-1.5 text-xs font-bold border border-[#DCDAD5] rounded-xl bg-[#F8F8F6] text-slate-900 focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#006547]"
            >
              {businessUnits.map((bu) => (
                <option key={bu.id} value={bu.id}>
                  {bu.name_ar} ({bu.code})
                </option>
              ))}
              <option value="OTHER">أخرى</option>
            </select>
            <button
              type="button"
              data-testid="agent-add-unit-btn"
              onClick={() => setShowAddUnitModal(true)}
              className="px-3 py-1.5 rounded-xl bg-[#006547] hover:bg-[#09331F] text-white text-xs font-bold flex items-center gap-1.5 shadow-2xs cursor-pointer transition-colors"
            >
              <PlusCircleIcon className="w-3.5 h-3.5 text-[#F79C1E]" />
              <span>+ وحدة تنظيمية أخرى</span>
            </button>
          </div>

          {/* Workflow Mode Selector Buttons */}
          <div className="flex items-center gap-2 bg-[#F3F4F2] p-1 rounded-xl border border-[#DCDAD5]">
            <button
              type="button"
              onClick={() => handleSwitchWorkflowMode('NEW')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                workflowMode === 'NEW'
                  ? 'bg-[#006547] text-white shadow-2xs'
                  : 'text-slate-700 hover:text-[#09331F]'
              }`}
            >
              <PlusCircleIcon className="w-3.5 h-3.5 text-[#F79C1E]" />
              <span>إنشاء RCSA جديدة</span>
            </button>

            <button
              type="button"
              onClick={() => handleSwitchWorkflowMode('UPDATE')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                workflowMode === 'UPDATE'
                  ? 'bg-[#006547] text-white shadow-2xs'
                  : 'text-slate-700 hover:text-[#09331F]'
              }`}
            >
              <RefreshCcwIcon className="w-3.5 h-3.5 text-[#F79C1E]" />
              <span>تحديث RCSA سابقة</span>
            </button>
          </div>

          {/* Active Session Info */}
          {session && (
            <div className="flex items-center gap-2 text-xs">
              <span className="px-2.5 py-0.5 rounded-md bg-[#09331F] text-[#F79C1E] font-mono tabular-nums font-bold text-[11px]">
                {session.id}
              </span>
              <span className="font-bold text-slate-900 text-[11px] truncate max-w-[220px]">
                {session.session_title}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Paste Direct Text / Table Modal */}
      {showPasteModal && (
        <div className="bg-white p-5 rounded-2xl border-2 border-[#006547] shadow-md space-y-4">
          <div className="flex items-center justify-between border-b border-[#E5E3DE] pb-2.5">
            <div className="flex items-center gap-2 text-sm font-bold text-[#09331F]">
              <ClipboardPasteIcon className="w-4 h-4 text-[#006547]" />
              <span>إدخال وفهرسة بيانات نصية أو جدول مباشر في محرك RAG</span>
            </div>
            <button
              type="button"
              onClick={() => setShowPasteModal(false)}
              className="text-slate-600 hover:text-slate-900 p-1 cursor-pointer"
              aria-label="إغلاق نافذة اللصق"
            >
              <XIcon className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handlePasteDataSubmit} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  اسم البيان أو المستند:
                </label>
                <input
                  type="text"
                  value={pasteTitle}
                  onChange={(e) => setPasteTitle(e.target.value)}
                  placeholder="مثال: دليل إجراءات التسويات أو جدول حوادث الربع الثالث"
                  className="w-full px-3 py-2 text-xs bg-[#F8F8F6] border border-[#DCDAD5] rounded-xl text-slate-900"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  تصنيف البيانات:
                </label>
                <select
                  value={pasteDocType}
                  onChange={(e) => setPasteDocType(e.target.value === 'OTHER' ? 'SOP' : e.target.value)}
                  className="w-full px-3 py-2 text-xs font-bold bg-[#F8F8F6] border border-[#DCDAD5] rounded-xl text-slate-900"
                >
                  <option value="SOP">إجراءات عمل قياسية (SOP)</option>
                  <option value="INCIDENT_LOG">سجل حوادث وخسائر تشغيلية (INCIDENT_LOG)</option>
                  <option value="AUDIT_REPORT">تقرير تفتيش ومراجعة داخلية (AUDIT_REPORT)</option>
                  <option value="PREVIOUS_RCSA">بيانات مصفوفة مخاطر (PREVIOUS_RCSA)</option>
                  <option value="OTHER">أخرى</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">
                المحتوى النصي أو الجدول (انسخ والصق من Word أو Excel أو CSV أو JSON أو أي نص):
              </label>
              <textarea
                rows={5}
                required
                value={pasteContent}
                onChange={(e) => setPasteContent(e.target.value)}
                placeholder="الصق هنا أي إجراءات أو جداول أو ملاحظات تفتيش أو بيانات ليقوم محرك RAG بفهمها والرد على أي سؤال حولها..."
                className="w-full p-3 text-xs bg-[#F8F8F6] border border-[#DCDAD5] rounded-xl text-slate-900"
              />
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowPasteModal(false)}
                className="px-3.5 py-2 rounded-xl bg-[#F3F4F2] border border-[#DCDAD5] text-slate-800 text-xs font-bold cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={uploadingDocs || !pasteContent.trim()}
                className="px-4 py-2 rounded-xl bg-[#006547] hover:bg-[#09331F] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
              >
                <CheckIcon className="w-4 h-4 text-[#F79C1E]" />
                <span>فهرسة البيانات في محرك RAG</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Action Notification Banner */}
      {actionNotice && (
        <div
          className={`p-3.5 rounded-xl text-xs font-bold flex items-center justify-between border ${
            actionNotice.type === 'success'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
              : actionNotice.type === 'error'
                ? 'bg-rose-50 border-rose-300 text-rose-950'
                : 'bg-sky-50 border-sky-300 text-sky-950'
          }`}
        >
          <div className="flex items-center gap-2">
            {actionNotice.type === 'success' ? (
              <CheckCircle2Icon className="w-4 h-4 text-[#006547] shrink-0" />
            ) : actionNotice.type === 'error' ? (
              <AlertCircleIcon className="w-4 h-4 text-rose-700 shrink-0" />
            ) : (
              <HelpCircleIcon className="w-4 h-4 text-sky-700 shrink-0" />
            )}
            <span>{actionNotice.text}</span>
          </div>
          <button
            onClick={() => setActionNotice(null)}
            className="text-slate-600 hover:text-slate-900 cursor-pointer"
            aria-label="إغلاق التنبيه"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Attached Session Documents & RAG Inspector Panel */}
      <div className="bg-white rounded-2xl border border-[#DCDAD5] p-4 shadow-xs space-y-3">
        <div className="flex items-center justify-between border-b border-[#E5E3DE] pb-2.5">
          <div className="flex items-center gap-2 text-xs font-bold text-[#09331F]">
            <FolderOpenIcon className="w-4 h-4 text-[#006547]" />
            <span>المستندات والملفات المفهرسة في قاعدة معرفة الجلسة (RAG Documents: {docsList.length})</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={uploadingDocs || !sessionId}
              onClick={() => fileInputRef.current?.click()}
              className="text-[11px] px-2.5 py-1 rounded-lg bg-[#F8F8F6] border border-[#DCDAD5] text-[#006547] font-bold hover:bg-[#EFECE6] flex items-center gap-1 cursor-pointer"
            >
              <FileUpIcon className="w-3.5 h-3.5" />
              <span>إضافة ملفات أخرى +</span>
            </button>
            <button
              type="button"
              onClick={() => setShowDocsPanel(!showDocsPanel)}
              className="text-slate-600 hover:text-slate-900 p-1 cursor-pointer"
              aria-label={showDocsPanel ? 'طي لوحة المستندات' : 'توسيع لوحة المستندات'}
            >
              {showDocsPanel ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {showDocsPanel && (
          <div className="space-y-3">
            {docsList.length === 0 ? (
              <div className="p-5 text-center text-xs text-slate-700 bg-[#F8F8F6] rounded-xl border border-dashed border-[#006547]/40 space-y-2">
                <p className="font-bold text-[#09331F]">
                  لم يتم إرفاق مستندات خاصة بهذه الجلسة بعد (يتم استخدام المراجع الأساسية للوحدة أو الاستدلال المصرفي الشامل).
                </p>
                <p className="text-slate-600">
                  اضغط على <strong>"رفع ملفات للتحليل (كافة الصيغ)"</strong> أو <strong>"لصق نص / جدول مباشر"</strong> لرفع أي ملفات (PDF, Word, Excel, CSV, JSON, XML, PPTX, TXT) ليقوم محرك RAG بفهمها والرد على أي سؤال حولها.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {docsList.map((doc: any) => {
                  const isInspected = inspectedDocId === doc.id;
                  return (
                    <div
                      key={doc.id}
                      className={`p-3 rounded-xl border transition-all flex flex-col justify-between gap-2 text-xs ${
                        isInspected
                          ? 'bg-emerald-50/70 border-[#006547] ring-1 ring-[#006547]'
                          : 'bg-[#F8F8F6] border-[#DCDAD5]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1 truncate">
                          <div className="flex items-center gap-1.5">
                            <FileTextIcon className="w-3.5 h-3.5 text-[#006547] shrink-0" />
                            <span className="font-bold text-slate-900 truncate" title={doc.title_ar || doc.filename}>
                              {doc.title_ar || doc.filename}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-slate-600 flex-wrap tabular-nums">
                            <span className="px-1.5 py-0.2 rounded bg-white border border-[#DCDAD5] font-mono font-bold text-[#09331F]">
                              {doc.doc_type || 'SOP'}
                            </span>
                            <span>• {doc.chunks_count || 0} مقاطع مفهرسة</span>
                            {doc.total_chars ? <span>• {Number(doc.total_chars).toLocaleString()} حرف</span> : null}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleUnlinkDocument(doc.id)}
                          className="text-rose-600 hover:text-rose-900 p-1 rounded hover:bg-rose-100 shrink-0 cursor-pointer"
                          title="إلغاء إرفاق المستند من الجلسة"
                          aria-label={`إلغاء إرفاق ${doc.title_ar || doc.filename}`}
                        >
                          <Trash2Icon className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="flex items-center justify-between gap-1.5 pt-2 border-t border-[#E5E3DE]">
                        <button
                          type="button"
                          onClick={() => setInspectedDocId(isInspected ? null : doc.id)}
                          className="px-2 py-1 rounded-lg bg-white hover:bg-[#EFECE6] border border-[#DCDAD5] text-[#09331F] font-bold text-[10px] flex items-center gap-1 cursor-pointer"
                        >
                          <EyeIcon className="w-3 h-3 text-[#006547]" />
                          <span>{isInspected ? 'إخفاء المقاطع' : 'فحص المقاطع المستخرجة'}</span>
                        </button>

                        <button
                          type="button"
                          disabled={sendingMsg}
                          onClick={() =>
                            handleSendMessage(`اشرح لي بالتفصيل محتوى الملف المرفوع (${doc.title_ar}) وأهم الإجراءات والأرقام والمخاطر الواردة فيه.`)
                          }
                          className="px-2.5 py-1 rounded-lg bg-[#006547]/10 hover:bg-[#006547]/20 text-[#006547] font-bold text-[10px] cursor-pointer"
                        >
                          اسأل عن هذا الملف
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Document Chunks RAG Inspector Drawer */}
            {inspectedDoc && (
              <div className="p-4 rounded-xl bg-[#F8F8F6] border-2 border-[#006547] space-y-2.5">
                <div className="flex items-center justify-between border-b border-[#E5E3DE] pb-2">
                  <div className="text-xs font-bold text-[#09331F] flex items-center gap-2">
                    <DatabaseIcon className="w-4 h-4 text-[#006547]" />
                    <span>
                      معاينة المقاطع المستخلصة في فهرس RAG للمستند: {inspectedDoc.title_ar} ({inspectedDoc.chunks?.length || 0} مقطع)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setInspectedDocId(null)}
                    className="text-slate-600 hover:text-slate-900 text-xs font-bold cursor-pointer"
                  >
                    إغلاق ✕
                  </button>
                </div>

                {(!inspectedDoc.chunks || inspectedDoc.chunks.length === 0) ? (
                  <p className="text-xs text-slate-600">لا توجد مقاطع نصية مستخلصة لهذا الملف.</p>
                ) : (
                  <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                    {inspectedDoc.chunks.map((ch: any) => (
                      <div key={ch.id} className="p-2.5 rounded-lg bg-white border border-[#DCDAD5] text-[11px] space-y-1">
                        <div className="font-bold text-[#006547]">
                          {ch.section_title || `مقطع #${ch.chunk_index}`} (صفحة {ch.page_number || 1})
                        </div>
                        <p className="text-slate-800 leading-relaxed whitespace-pre-wrap">{ch.content_text}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Main Grid: Conversational RAG Thread (Left Span 7) & RCSA Proposals/Decision Cards (Right Span 5) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Conversational Chat Thread (Span 7) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white rounded-2xl border border-[#DCDAD5] p-4 sm:p-5 shadow-xs space-y-4 flex flex-col h-[520px] sm:h-[660px]">
            <div className="flex items-center justify-between border-b border-[#E5E3DE] pb-3">
              <div className="flex items-center gap-2">
                <BotIcon className="w-4 h-4 text-[#006547]" />
                <h3 className="text-sm font-extrabold text-[#09331F]">
                  محادثة نظام RAG والوكيل الذكي ({selectedModelProfile === 'qwen-0.5b' ? 'سريع' : 'دقيق'})
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] px-2 py-0.5 rounded-md bg-[#F8F8F6] border border-[#DCDAD5] text-[#09331F] font-bold tabular-nums">
                  {messages.length} رسالة
                </span>
                <button
                  type="button"
                  onClick={handleClearAllPlatformChat}
                  title="مسح كل الشات القديم في المنصة"
                  className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <Trash2Icon className="w-3 h-3 text-rose-600" />
                  <span>مسح كل الشات</span>
                </button>
              </div>
            </div>

            {/* Quick Prompt Actions for User */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              <button
                type="button"
                disabled={sendingMsg}
                onClick={() =>
                  handleSendMessage(
                    'قم بتحليل كافة المستندات المرفوعة بالجلسة، واقتراح قائمة المخاطر والضوابط بدقة عالية، وحساب الأثر المالي المقدر، والأثر غير المالي (NFI)، وركائز ESG، والتصنيف الهيكلي L1/L2/L3.'
                  )
                }
                className="px-3 py-1.5 rounded-lg bg-[#006547] text-white hover:bg-[#09331F] text-[10px] font-bold shrink-0 cursor-pointer flex items-center gap-1.5 shadow-2xs"
              >
                <TargetIcon className="w-3 h-3 text-[#F79C1E]" />
                <span>توليد مصفوفة RCSA بدقة عالية</span>
              </button>
              <button
                type="button"
                disabled={sendingMsg}
                onClick={() =>
                  handleSendMessage('لخص لي كافة الملفات والبيانات المرفوعة بالجلسة، وأهم الإجراءات والأرقام الواردة فيها.')
                }
                className="px-2.5 py-1.5 rounded-lg bg-[#F8F8F6] border border-[#DCDAD5] text-[#09331F] hover:bg-[#EFECE6] text-[10px] font-bold shrink-0 cursor-pointer flex items-center gap-1"
              >
                <FileTextIcon className="w-3 h-3 text-[#006547]" />
                <span>تلخيص الملفات المرفوعة</span>
              </button>
              <button
                type="button"
                disabled={sendingMsg}
                onClick={() =>
                  handleSendMessage('قم بمطابقة خطوات العمل مع سجل الحوادث الميدانية وملاحظات التفتيش وبيان الفجوات الرقابية.')
                }
                className="px-2.5 py-1.5 rounded-lg bg-[#F8F8F6] border border-[#DCDAD5] text-[#09331F] hover:bg-[#EFECE6] text-[10px] font-bold shrink-0 cursor-pointer flex items-center gap-1"
              >
                <ShieldCheckIcon className="w-3 h-3 text-[#006547]" />
                <span>مطابقة SOPs مع الحوادث والتفتيش</span>
              </button>
              <button
                type="button"
                disabled={sendingMsg}
                onClick={() =>
                  handleSendMessage('اشرح كيفية حساب الخسارة السنوية المتوقعة ومعامل خفض المخاطر الأقصى MAX RRF والمخاطرة المتبقية.')
                }
                className="px-2.5 py-1.5 rounded-lg bg-[#F8F8F6] border border-[#DCDAD5] text-[#09331F] hover:bg-[#EFECE6] text-[10px] font-bold shrink-0 cursor-pointer flex items-center gap-1"
              >
                <CpuIcon className="w-3 h-3 text-[#006547]" />
                <span>شرح حسابات RRF والمتبقي</span>
              </button>
            </div>

            {/* Chat Messages Log */}
            <div className="flex-1 overflow-y-auto space-y-3.5 pl-1 pr-1">
              {messages.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-600 space-y-2.5 my-auto">
                  <SparklesIcon className="w-8 h-8 text-[#F79C1E] mx-auto opacity-80" />
                  <p className="font-bold text-[#09331F] text-sm">
                    مرحباً بك في نظام RAG والوكيل الذكي ({selectedModelProfile === 'qwen-0.5b' ? 'سريع' : 'دقيق'})
                  </p>
                  <p className="max-w-md mx-auto text-slate-600 leading-relaxed">
                    ارفع أي ملفات أو الصق جداولك، ثم اسأل الوكيل أي سؤال تفصيلي عنها، أو اضغط على <strong>"توليد مصفوفة RCSA بدقة عالية"</strong> لبناء التقييم متضمناً حسابات بايثون المعتمدة وتصنيفات البنك المركزي.
                  </p>
                </div>
              ) : (
                messages.map((m) => {
                  const isUser = m.sender_role === 'USER';
                  const matchingClarif = !isUser
                    ? clarifications.find(
                        (c) =>
                          m.message_text_ar.includes(c.question_ar) ||
                          c.question_ar.includes(m.message_text_ar)
                      )
                    : null;

                  const msgModelBadge = m.model_profile === 'qwen-0.5b' ? 'سريع' : 'دقيق';

                  return (
                    <div key={m.id} className={`flex flex-col ${isUser ? 'items-start' : 'items-end'}`}>
                      <div
                        className={`max-w-[92%] p-4 rounded-2xl text-xs space-y-2.5 shadow-2xs ${
                          isUser
                            ? 'bg-[#006547] text-white rounded-br-none'
                            : 'bg-[#F8F8F6] border border-[#DCDAD5] text-slate-900 rounded-bl-none'
                        }`}
                      >
                        <div className="font-bold text-[10px] opacity-95 flex items-center justify-between gap-2 pb-1 border-b border-current/10">
                          <span>{isUser ? 'الموظف المصرفي (المُعد)' : 'وكيل الذكاء الاصطناعي (RAG)'}</span>
                          {!isUser && (
                            <span className="px-2 py-0.5 rounded bg-[#09331F] text-[#F79C1E] text-[9px] font-bold">
                              وضع {msgModelBadge}
                            </span>
                          )}
                        </div>
                        <div className="leading-relaxed break-words [overflow-wrap:anywhere]">
                          {renderFormattedMarkdown(m.message_text_ar, isUser)}
                        </div>

                        {/* Inline Clarification Controls Inside Chat Bubble */}
                        {!isUser && matchingClarif && (
                          <div className="pt-2 border-t border-[#E5E3DE] space-y-2">
                            {matchingClarif.user_answer_ar ? (
                              <div className="text-[11px] font-bold text-emerald-950 bg-emerald-50 p-2 rounded-xl border border-emerald-300 flex items-center gap-1.5">
                                <CheckCircle2Icon className="w-4 h-4 text-[#006547] shrink-0" />
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
                                          handleAnswerClarification(
                                            matchingClarif.id,
                                            (e.target as HTMLInputElement).value
                                          );
                                        }
                                      }}
                                    />
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Citations list OR Open-Domain LLM Authority badge under agent reply */}
                        {!isUser && m.citations && m.citations.length > 0 ? (
                          <div className="pt-2 border-t border-[#E5E3DE] space-y-1.5">
                            <div className="text-[10px] font-bold text-[#006547] flex items-center gap-1">
                              <FileTextIcon className="w-3 h-3" />
                              <span>الأدلة والمقاطع المسترجعة من فهرس RAG ({m.citations.length}):</span>
                            </div>
                            <div className="space-y-1 max-h-36 overflow-y-auto">
                              {m.citations.map((c: any, cIdx: number) => (
                                <div
                                  key={cIdx}
                                  className="bg-white p-2 rounded-lg text-[10px] text-slate-800 border border-[#DCDAD5] break-words [overflow-wrap:anywhere]"
                                >
                                  <div className="font-bold text-[#09331F]">
                                    {formatDocTitle(c.title_ar)} • {c.section_title}
                                  </div>
                                  <p className="italic text-slate-600 mt-0.5">"{c.quote_text}"</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : !isUser && !matchingClarif ? (
                          <div className="pt-2 border-t border-[#E5E3DE] flex items-center gap-1.5 text-[10px] font-bold text-[#09331F]">
                            <SparklesIcon className="w-3.5 h-3.5 text-[#F79C1E] shrink-0" />
                            <span>إجابة عبر صلاحية الاستدلال المفتوح والخبرة المصرفية للنموذج (خارج فهرس RAG المباشر)</span>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={chatBottomRef} />
            </div>

            {/* Prompt Input Footer */}
            <div className="border-t border-[#E5E3DE] pt-3 flex items-center gap-2">
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
                placeholder={`اسأل (${selectedModelProfile === 'qwen-0.5b' ? 'سريع' : 'دقيق'}) أي سؤال عن الملفات المرفوعة أو أي استشارة مصرفية وعامة خارج فهرس RAG...`}
                className="flex-1 p-2.5 text-xs bg-[#F8F8F6] border border-[#DCDAD5] rounded-xl text-slate-900 focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#006547]"
              />
              <button
                type="button"
                disabled={sendingMsg || !userPromptText.trim()}
                onClick={() => handleSendMessage()}
                className="px-4 py-3 rounded-xl bg-[#006547] hover:bg-[#09331F] text-white text-xs font-bold flex items-center gap-1.5 shadow-xs disabled:opacity-40 shrink-0 cursor-pointer"
              >
                <SendIcon className="w-4 h-4 text-[#F79C1E]" />
                <span>{sendingMsg ? 'جاري التحليل...' : 'إرسال'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Decision Cards & Session Actions (Span 5) */}
        <div className="lg:col-span-5 space-y-4">
          {/* Proposals & Decision Cards Panel */}
          <div className="bg-white rounded-2xl border border-[#DCDAD5] p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-[#E5E3DE] pb-3 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <SparklesIcon className="w-4 h-4 text-[#F79C1E]" />
                <h3 className="text-sm font-extrabold text-[#09331F]">توصيات مصفوفة RCSA المستنبطة</h3>
              </div>
              <div className="flex items-center gap-2">
                {pendingProposalsCount > 0 && (
                  <button
                    type="button"
                    onClick={handleAcceptAllProposals}
                    className="text-[10px] px-2.5 py-1 rounded-lg bg-[#006547] hover:bg-[#09331F] text-white font-bold flex items-center gap-1 cursor-pointer shadow-2xs tabular-nums"
                  >
                    <CheckIcon className="w-3 h-3 text-[#F79C1E]" />
                    <span>قبول الكل ({pendingProposalsCount})</span>
                  </button>
                )}
                <span className="text-[10px] px-2 py-0.5 bg-[#F8F8F6] border border-[#DCDAD5] rounded-md font-bold text-[#09331F] tabular-nums">
                  {proposals.length} توصيات ({acceptedProposalsCount} مقبولة)
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
                  <div className="p-6 text-center text-xs text-slate-600 bg-[#F8F8F6] rounded-xl border border-[#DCDAD5] space-y-2">
                    <p className="font-bold text-[#09331F]">لا توجد توصيات RCSA مولّدة بعد في هذه الجلسة.</p>
                    <p>
                      اضغط على زر <strong>"توليد مصفوفة RCSA بدقة عالية"</strong> في نافذة المحادثة ليقوم الوضع{' '}
                      <strong>({selectedModelProfile === 'qwen-0.5b' ? 'سريع' : 'دقيق'})</strong> باستخراج المخاطر والضوابط واحتساب نتائجها.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3.5 max-h-[540px] overflow-y-auto pl-1 pr-1">
                    {proposals.map((p) => {
                      const data = p.proposal_data || {};
                      const isAccepted = p.status === 'ACCEPTED' || p.status === 'MODIFIED_ACCEPTED';
                      const isRejected = p.status === 'REJECTED';
                      const isEditing = editingProposalId === p.id;

                      return (
                        <div
                          key={p.id}
                          className={`p-4 rounded-xl border space-y-3 transition-all ${
                            isAccepted
                              ? 'border-[#006547] bg-emerald-50/40'
                              : isRejected
                                ? 'border-slate-300 bg-slate-50 opacity-60'
                                : 'border-[#DCDAD5] bg-[#F8F8F6]'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="space-y-1.5 flex-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#09331F] text-[#F79C1E] font-mono tabular-nums">
                                  {data.risk_id || p.id}
                                </span>
                                {(data.taxonomy_l1_ar || data.taxonomy_l2_ar) && (
                                  <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-50 text-[#006547] border border-emerald-200 font-semibold">
                                    {data.taxonomy_l1_id ? `[${data.taxonomy_l1_id}] ` : ''}
                                    {data.taxonomy_l1_ar || ''}
                                    {data.taxonomy_l2_ar
                                      ? ` ← ${data.taxonomy_l2_id ? `[${data.taxonomy_l2_id}] ` : ''}${data.taxonomy_l2_ar}`
                                      : ''}
                                  </span>
                                )}
                                {data.esg_pillar && (
                                  <span className="text-[10px] px-2 py-0.5 rounded bg-amber-50 text-amber-900 border border-amber-200 font-semibold">
                                    ESG: {data.esg_pillar}
                                  </span>
                                )}
                              </div>
                              {data.process_name_ar && (
                                <div className="text-[10px] font-bold text-[#006547]">
                                  العملية: {data.process_name_ar}
                                </div>
                              )}
                              <h4 className="text-xs font-extrabold text-[#09331F]">
                                {data.risk_title_ar || data.process_name_ar}
                              </h4>
                              <div className="text-[11px] text-slate-700 leading-relaxed break-words [overflow-wrap:anywhere]">
                                {renderInlineMarkdown(formatMessageDisplay(data.description_ar), false)}
                              </div>

                              {/* Authoritative Python Calculation & NFI Badges */}
                              <div className="grid grid-cols-2 gap-2 text-[10px] pt-1 tabular-nums">
                                <div className="bg-white p-2 rounded-lg border border-[#DCDAD5]">
                                  <span className="font-bold text-[#006547]">الأثر المالي الفردي: </span>
                                  <span className="font-bold text-slate-900 font-mono">
                                    {Number(data.financial_impact_amount || data.expected_loss_egp || 0).toLocaleString()} ج.م
                                  </span>
                                </div>
                                <div className="bg-white p-2 rounded-lg border border-[#DCDAD5]">
                                  <span className="font-bold text-[#006547]">التكرار / المتلازم: </span>
                                  <span className="font-bold text-slate-900">
                                    {data.inherent_frequency_text || 'مرة واحدة كل سنة'} ({data.inherent_rating || '-'})
                                  </span>
                                </div>
                                {data.effective_max_rrf !== undefined && data.effective_max_rrf !== null && (
                                  <div className="bg-white p-2 rounded-lg border border-[#DCDAD5]">
                                    <span className="font-bold text-[#006547]">أقصى خفض RRF: </span>
                                    <span className="font-bold text-slate-900 font-mono">
                                      {Math.round(Number(data.effective_max_rrf || 0) * 100)}%
                                      {data.selected_workbook_rrf_key ? ` (${data.selected_workbook_rrf_key})` : ''}
                                    </span>
                                  </div>
                                )}
                                {data.residual_loss_amount !== undefined && data.residual_loss_amount !== null && (
                                  <div className="bg-white p-2 rounded-lg border border-[#DCDAD5]">
                                    <span className="font-bold text-[#006547]">المتبقي ({data.residual_rating || '-'}): </span>
                                    <span className="font-bold text-slate-900 font-mono">
                                      {Number(data.residual_loss_amount || 0).toLocaleString()} ج.م
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>

                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded shrink-0 ${
                                isAccepted
                                  ? 'bg-[#006547] text-white'
                                  : isRejected
                                    ? 'bg-slate-400 text-white'
                                    : 'bg-amber-50 text-amber-900 border border-amber-300'
                              }`}
                            >
                              {isAccepted ? 'تم القبول ✓' : isRejected ? 'تم الاستبعاد ✗' : 'بانتظار القرار'}
                            </span>
                          </div>

                          {/* Proposed Controls Preview (ALL extracted controls) */}
                          {Array.isArray(data.controls) && data.controls.length > 0 && (
                            <div className="space-y-1.5">
                              {data.controls.map((ctrl: any, ctrlIdx: number) => {
                                const ctrlTypeLabel =
                                  ctrl.control_type_label_ar ||
                                  (ctrl.design_classification === 'DETECTIVE'
                                    ? 'ضوابط رقابية كاشفة'
                                    : ctrl.design_classification === 'CORRECTIVE'
                                      ? 'ضوابط رقابية تصحيحية'
                                      : 'ضوابط رقابية مانعة');
                                const ctrlAutoLabel =
                                  ctrl.control_method_label_ar ||
                                  (ctrl.automation_level === 'AUTOMATED'
                                    ? 'آلي'
                                    : ctrl.automation_level === 'SEMI_AUTOMATED'
                                      ? 'شبه آلي'
                                      : 'يدوي');
                                return (
                                  <div
                                    key={ctrl.control_id || ctrlIdx}
                                    className="bg-white p-2.5 rounded-lg border border-[#DCDAD5] text-[10px] space-y-1"
                                  >
                                    <div className="font-bold text-[#09331F] flex items-center justify-between gap-2 flex-wrap">
                                      <span className="flex items-center gap-1">
                                        <ShieldCheckIcon className="w-3.5 h-3.5 text-[#006547] shrink-0" />
                                        <span>
                                          {ctrl.control_name_ar
                                            ? `${ctrl.control_name_ar} (${ctrl.control_id})`
                                            : `الضابط الرقابي (${ctrl.control_id})`}
                                        </span>
                                      </span>
                                      <span className="text-[10px] font-bold text-[#006547]">
                                        {ctrlTypeLabel} • {ctrlAutoLabel}
                                      </span>
                                    </div>
                                    <div className="text-slate-700 leading-relaxed">{ctrl.description_ar}</div>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {/* Self-Critique QA & Historical Loss Calibration Verification */}
                          {data.qa_critique && (
                            <div className="pt-1.5 border-t border-[#E5E3DE] text-[10px] space-y-1">
                              <div className="flex flex-wrap items-center justify-between gap-2 text-slate-700 font-mono tabular-nums">
                                <span className="font-bold text-[#006547]">
                                  فحص الجودة المنهجي (Self-Critique QA): {data.qa_critique.passed_rules_count}/{data.qa_critique.checked_rules_count} ({data.qa_critique.qa_score_pct}%)
                                </span>
                                {Array.isArray(data.qa_critique.auto_repaired_issues) && data.qa_critique.auto_repaired_issues.length > 0 && (
                                  <span className="text-slate-600">
                                    تصحيح تلقائي ({data.qa_critique.auto_repaired_issues.length})
                                  </span>
                                )}
                              </div>
                              {data.qa_critique.loss_calibration_alert && (
                                <div className="p-2 rounded-lg bg-[#FEF6E6] border border-[#F5D38E] text-[#78350F] leading-relaxed font-sans">
                                  {data.qa_critique.loss_calibration_alert}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Inline Edit Form when editingProposalId === p.id */}
                          {isEditing && (
                            <div className="p-3 bg-white rounded-xl border border-[#006547] space-y-2.5 text-xs">
                              <div className="font-bold text-[#006547]">تعديل بيانات التوصية قبل القبول:</div>
                              <div>
                                <label className="block text-[10px] font-bold text-slate-700 mb-0.5">
                                  عنوان المخاطرة:
                                </label>
                                <input
                                  type="text"
                                  value={editFormData.risk_title_ar || ''}
                                  onChange={(e) =>
                                    setEditFormData({ ...editFormData, risk_title_ar: e.target.value })
                                  }
                                  className="w-full px-2.5 py-1.5 border border-[#DCDAD5] rounded-lg text-xs"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold text-slate-700 mb-0.5">
                                  وصف المخاطرة:
                                </label>
                                <textarea
                                  rows={2}
                                  value={editFormData.description_ar || ''}
                                  onChange={(e) =>
                                    setEditFormData({ ...editFormData, description_ar: e.target.value })
                                  }
                                  className="w-full px-2.5 py-1.5 border border-[#DCDAD5] rounded-lg text-xs"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold text-slate-700 mb-0.5">
                                  الأثر المالي الفردي المقدر (ج.م):
                                </label>
                                <input
                                  type="number"
                                  value={editFormData.financial_impact_amount || 0}
                                  onChange={(e) =>
                                    setEditFormData({
                                      ...editFormData,
                                      financial_impact_amount: Number(e.target.value),
                                      single_incident_max_loss: Number(e.target.value),
                                    })
                                  }
                                  className="w-full px-2.5 py-1.5 border border-[#DCDAD5] rounded-lg text-xs font-mono tabular-nums"
                                />
                              </div>
                              <div className="flex justify-end gap-2 pt-1">
                                <button
                                  type="button"
                                  onClick={() => setEditingProposalId(null)}
                                  className="px-2.5 py-1 rounded-lg bg-[#F3F4F2] border border-[#DCDAD5] text-slate-800 text-[11px] font-bold cursor-pointer"
                                >
                                  إلغاء
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleProposalDecision(p.id, 'MODIFIED_ACCEPTED', editFormData)
                                  }
                                  className="px-3 py-1 rounded-lg bg-[#006547] text-white text-[11px] font-bold cursor-pointer"
                                >
                                  حفظ وقبول التعديل ✓
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Evidence Citations */}
                          {p.citations && p.citations.length > 0 && (
                            <div className="bg-white p-2.5 rounded-lg border border-[#DCDAD5] text-[10px] text-slate-800 space-y-1 break-words [overflow-wrap:anywhere]">
                              <div className="font-bold text-[#006547] flex items-center gap-1">
                                <FileTextIcon className="w-3.5 h-3.5 shrink-0" />
                                <span>المقطع المصدري الموثق ({formatDocTitle(p.citations[0].title_ar)}):</span>
                              </div>
                              <p className="italic text-slate-600">"{p.citations[0].quote_text}"</p>
                            </div>
                          )}

                          {/* Decision Buttons */}
                          {!isAccepted && !isRejected && !isEditing && (
                            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E5E3DE]">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingProposalId(p.id);
                                  setEditFormData({
                                    risk_title_ar: data.risk_title_ar || data.process_name_ar,
                                    description_ar: data.description_ar,
                                    financial_impact_amount: data.financial_impact_amount || 151000,
                                  });
                                }}
                                className="px-2.5 py-1.5 rounded-lg bg-white border border-[#DCDAD5] text-slate-800 hover:bg-[#EFECE6] text-xs font-bold flex items-center gap-1 cursor-pointer"
                              >
                                <Edit3Icon className="w-3.5 h-3.5 text-[#006547]" />
                                <span>تعديل</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleProposalDecision(p.id, 'REJECT')}
                                className="px-3 py-1.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-900 hover:bg-rose-100 text-xs font-bold flex items-center gap-1 cursor-pointer"
                              >
                                <XIcon className="w-3.5 h-3.5 text-rose-700" />
                                <span>رفض</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleProposalDecision(p.id, 'ACCEPT')}
                                className="px-3.5 py-1.5 rounded-lg bg-[#006547] hover:bg-[#09331F] text-white text-xs font-bold flex items-center gap-1 shadow-xs cursor-pointer"
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
          <div className="bg-white p-4 rounded-2xl border border-[#DCDAD5] shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
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
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-[#F8F8F6] hover:bg-[#EFECE6] text-[#09331F] border border-[#DCDAD5] text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <ArrowRightIcon className="w-4 h-4 text-[#006547]" />
              <span>← إعداد التقييم الموجه</span>
            </button>

            <button
              type="button"
              onClick={handleCreateDraftAndOpenReview}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-[#006547] hover:bg-[#09331F] text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs cursor-pointer active:scale-98"
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
