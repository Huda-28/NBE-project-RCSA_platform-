import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

export type QwenModelProfileId = 'qwen-0.5b' | 'qwen-4b';

export interface QwenModelOption {
  id: QwenModelProfileId;
  name: string;
  label_ar: string;
  short_label_ar: string;
  badge_ar: string;
  description_ar: string;
  model_id: string;
  ollama_tag: string;
   ollama_command: string;
  speed_tier: 'FAST' | 'DEEP';
  accuracy_tier: 'STANDARD' | 'HIGH_PRECISION';
  rag_top_k: number;
  temperature: number;
  max_tokens: number;
}

export const QWEN_MODEL_OPTIONS: Record<QwenModelProfileId, QwenModelOption> = {
  'qwen-0.5b': {
    id: 'qwen-0.5b',
    name: 'سريع',
    label_ar: 'سريع',
    short_label_ar: 'سريع',
    badge_ar: '⚡ سريع',
    description_ar: 'استجابة فورية للأسئلة المباشرة وتلخيص الملفات واستكشاف البيانات.',
    model_id: process.env.QWEN_FAST_MODEL || 'qwen3:1.7b',
    ollama_tag: 'qwen3:1.7b',
    ollama_command: 'ollama run qwen3:1.7b',
    speed_tier: 'FAST',
    accuracy_tier: 'STANDARD',
    rag_top_k: 8,
    temperature: 0.15,
    max_tokens: 2560,
  },
  'qwen-4b': {
    id: 'qwen-4b',
    name: 'دقيق',
    label_ar: 'دقيق',
    short_label_ar: 'دقيق',
    badge_ar: '🎯 دقيق',
    description_ar: 'دقة فائقة لتحليل المستندات المعقدة والجداول، وبناء مصفوفة RCSA الشاملة وربط تصنيفات L1/L2/L3 وESG.',
    model_id: process.env.QWEN_ACCURATE_MODEL || 'qwen3.5:4b',
    ollama_tag: 'qwen3.5:4b',
    ollama_command: 'ollama run qwen3.5:4b',
    speed_tier: 'DEEP',
    accuracy_tier: 'HIGH_PRECISION',
    rag_top_k: 16,
    temperature: 0.1,
    max_tokens: 4096,
  },
};

export function resolveQwenModelProfile(profileId?: string | null): QwenModelOption {
  const raw = (profileId || process.env.LLM_MODEL || '').trim().toLowerCase();
  if (
    raw === 'qwen-0.5b' ||
    raw === 'qwen3:1.7b' ||
    raw === 'qwen3 1.7b' ||
    raw === 'ollama run qwen3:1.7b' ||
    raw === 'ollama run qwen3 1.7b' ||
    raw === 'qwen2.5:1.5b' ||
    raw === 'qwen2.5:0.5b' ||
    raw === 'qwen 2.5 0.5b' ||
    raw === '0.5b' ||
    raw === '1.7b' ||
    raw === 'fast' ||
    raw === 'سريع'
  ) {
    return QWEN_MODEL_OPTIONS['qwen-0.5b'];
  }
  if (
    raw === 'qwen-4b' ||
    raw === 'qwen3.5:4b' ||
    raw === 'qwen3.5 4b' ||
    raw === 'ollama run qwen3.5 4b' ||
    raw === 'ollama run qwen3.5:4b' ||
    raw === 'qwen3:8b' ||
    raw === 'aya-expanse:8b' ||
    raw === 'qwen2.5:7b' ||
    raw === 'deepseek-r1:8b' ||
    raw === 'qwen3:4b' ||
    raw === 'qwen 3 4b' ||
    raw === '4b' ||
    raw === '8b' ||
    raw === 'accurate' ||
    raw === 'دقيق'
  ) {
    return QWEN_MODEL_OPTIONS['qwen-4b'];
  }
  return QWEN_MODEL_OPTIONS['qwen-4b'];
}

/**
 * Resiliently parse JSON emitted by local or cloud LLMs (handles markdown fences, surrounding prose, and trailing commas).
 */
export function parseResilientLlmJson(rawText: string): any | null {
  if (!rawText || !rawText.trim()) return null;
  let cleaned = rawText.trim();
  // Strip <think>...</think> blocks emitted by reasoning models (e.g. Qwen3 / DeepSeek-R1)
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  // Strip markdown ```json ... ``` fences
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch && fenceMatch[1]) {
    cleaned = fenceMatch[1].trim();
  }
  const normalized = cleaned.replace(/,\s*([\]}])/g, '$1');
  try {
    return JSON.parse(normalized);
  } catch {
    // Try extracting the outermost JSON object or array in order of earliest appearance
    const firstBracket = normalized.indexOf('[');
    const lastBracket = normalized.lastIndexOf(']');
    const firstBrace = normalized.indexOf('{');
    const lastBrace = normalized.lastIndexOf('}');

    const candidateEntries: Array<{ start: number; text: string }> = [];
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      candidateEntries.push({ start: firstBrace, text: normalized.slice(firstBrace, lastBrace + 1) });
    }
    if (firstBracket !== -1 && lastBracket > firstBracket) {
      candidateEntries.push({ start: firstBracket, text: normalized.slice(firstBracket, lastBracket + 1) });
    }
    candidateEntries.sort((a, b) => a.start - b.start);

    for (const entry of candidateEntries) {
      const noTrailingCommas = entry.text.replace(/,\s*([\]}])/g, '$1');
      try {
        return JSON.parse(noTrailingCommas);
      } catch {
        // continue
      }
    }
    return null;
  }
}

/**
 * Hard Guarantee (README §Hard guarantees):
 * "The LLM can never supply ratings, RRF, effectiveness, status or approvals (fields stripped + logged; engines own them)."
 */
const FORBIDDEN_LLM_SUPPLIED_FIELDS = new Set([
  'inherent_rating',
  'inherent_risk_rating',
  'residual_rating',
  'residual_risk_rating',
  'rrf',
  'control_rrf',
  'effective_max_rrf',
  'control_effectiveness',
  'effectiveness_score',
  'status',
  'approval_status',
  'approved_by',
  'approved_at',
  'finalized_by',
  'finalized_at',
]);

export function stripForbiddenLlmFields<T extends Record<string, any>>(
  candidate: T
): { sanitized: T; strippedFields: string[] } {
  if (!candidate || typeof candidate !== 'object') {
    return { sanitized: candidate, strippedFields: [] };
  }
  const copy: Record<string, any> = { ...candidate };
  const strippedFields: string[] = [];

  for (const key of Object.keys(copy)) {
    if (FORBIDDEN_LLM_SUPPLIED_FIELDS.has(key.toLowerCase())) {
      strippedFields.push(key);
      delete copy[key];
    }
  }

  if (Array.isArray(copy.controls)) {
    copy.controls = copy.controls.map((ctrl: any) => {
      if (!ctrl || typeof ctrl !== 'object') return ctrl;
      const ctrlCopy = { ...ctrl };
      for (const k of ['rrf', 'control_rrf', 'effectiveness_score', 'residual_rating', 'status', 'approved_by']) {
        if (k in ctrlCopy) {
          strippedFields.push(`controls.${k}`);
          delete ctrlCopy[k];
        }
      }
      return ctrlCopy;
    });
  }

  return { sanitized: copy as T, strippedFields };
}

export interface LlmChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmConfigStatus {
  isConfigured: boolean;
  provider: string;
  baseUrl?: string;
  modelName?: string;
  hasApiKey: boolean;
  selectedProfile: QwenModelProfileId;
  selectedModel: QwenModelOption;
  availableModels: QwenModelOption[];
  ragStatus: 'ACTIVE';
}

export function getLlmConfigStatus(profileId?: string | null): LlmConfigStatus {
  const provider = process.env.MODEL_PROVIDER || 'openai_compatible';
  const baseUrl =
    process.env.LLM_API_BASE_URL ||
    process.env.OPENAI_BASE_URL ||
    process.env.OLLAMA_BASE_URL ||
    process.env.OPENAI_API_BASE;
  const apiKey = process.env.LLM_API_KEY || process.env.OPENAI_API_KEY;
  const selectedModel = resolveQwenModelProfile(profileId);
  const modelName =
    process.env.LLM_MODEL_NAME ||
    process.env.OPENAI_MODEL_NAME ||
    (profileId ? selectedModel.ollama_tag : process.env.LLM_MODEL || selectedModel.ollama_tag);

  const isConfigured = Boolean(baseUrl && baseUrl.trim().length > 0);

  return {
    isConfigured,
    provider,
    baseUrl: baseUrl || undefined,
    modelName,
    hasApiKey: Boolean(apiKey),
    selectedProfile: selectedModel.id,
    selectedModel,
    availableModels: [QWEN_MODEL_OPTIONS['qwen-0.5b'], QWEN_MODEL_OPTIONS['qwen-4b']],
    ragStatus: 'ACTIVE',
  };
}

export async function generateLlmCompletion(
  messages: LlmChatMessage[],
  options?: {
    modelProfile?: QwenModelProfileId | string;
    temperature?: number;
    responseFormatJson?: boolean;
    timeoutMs?: number;
  }
): Promise<{
  success: boolean;
  content: string;
  modelUsed: string;
  profileId: QwenModelProfileId;
  code?: string;
  error?: string;
}> {
  const status = getLlmConfigStatus(options?.modelProfile);
  const chosenOption = status.selectedModel;

  if (!status.isConfigured || !status.baseUrl) {
    return {
      success: false,
      content: '',
      modelUsed: chosenOption.ollama_tag,
      profileId: chosenOption.id,
      code: 'LLM_NOT_CONFIGURED',
      error:
        'النموذج الذكي غير مهيأ في إعدادات الخادم (OPENAI_BASE_URL / LLM_API_BASE_URL غير محدد). يعمل النظام في الوضع الحتمي الموثق (Offline RAG + Python Engine).',
    };
  }

  const cleanBase = status.baseUrl.replace(/\/+$/, '');
  const endpoint = cleanBase.endsWith('/chat/completions')
    ? cleanBase
    : `${cleanBase}/chat/completions`;
  const timeoutMs = options?.timeoutMs || (chosenOption.id === 'qwen-0.5b' ? 25000 : 45000);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const apiKey = process.env.LLM_API_KEY || process.env.OPENAI_API_KEY;
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const targetModelName =
    process.env.LLM_MODEL_NAME ||
    (options?.modelProfile ? chosenOption.ollama_tag : process.env.LLM_MODEL || chosenOption.ollama_tag);

  const requestBody: any = {
    model: targetModelName,
    messages,
    temperature: options?.temperature ?? chosenOption.temperature,
    max_tokens: chosenOption.max_tokens,
  };

  if (options?.responseFormatJson) {
    requestBody['response_format'] = { type: 'json_object' };
  }

  try {
    const res = await globalThis.fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errorText = await res.text().catch(() => '');
      return {
        success: false,
        content: '',
        modelUsed: targetModelName,
        profileId: chosenOption.id,
        code: 'LLM_UNAVAILABLE',
        error: `استجابة خادم النموذج الذكي غير متاحة (${res.status}): ${errorText.slice(0, 120)}`,
      };
    }

    const data: any = await res.json();
    const rawContent = data.choices?.[0]?.message?.content || data.message?.content || '';
    const content = rawContent.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

    if (!content) {
      return {
        success: false,
        content: '',
        modelUsed: targetModelName,
        profileId: chosenOption.id,
        code: 'LLM_EMPTY_RESPONSE',
        error: 'لم يقدم النموذج الذكي استجابة نصية.',
      };
    }

    return {
      success: true,
      content,
      modelUsed: targetModelName,
      profileId: chosenOption.id,
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    const isAbort = err.name === 'AbortError';
    return {
      success: false,
      content: '',
      modelUsed: targetModelName,
      profileId: chosenOption.id,
      code: isAbort ? 'LLM_TIMEOUT' : 'LLM_UNAVAILABLE',
      error: isAbort
        ? `تجاوزت الاستجابة مهلة الانتظار المحدد (${timeoutMs / 1000} ثانية).`
        : `تعذر الاتصال ببيئة استدلال النموذج الذكي (${err.message || 'خطأ شبكة'}).`,
    };
  }
}

/**
 * Elevated Autonomous LLM Completion for the AI Agent with full Multi-Turn Conversation Memory:
 * 1. Uses local Ollama / OpenAI-compatible server when configured and reachable.
 * 2. Falls back to server-side `@google/genai` (`gemini-4-hydrogen`) with structured multi-turn `contents`,
 *    giving the LLM full authority to answer both RAG-grounded and open-domain questions outside the RAG index.
 */
export async function generateAgentAutonomousCompletion(
  messages: LlmChatMessage[],
  options?: {
    modelProfile?: QwenModelProfileId | string;
    temperature?: number;
  }
): Promise<{
  success: boolean;
  content: string;
  modelUsed: string;
  profileId: QwenModelProfileId;
  code?: string;
  error?: string;
}> {
  const chosenOption = resolveQwenModelProfile(options?.modelProfile);
  const status = getLlmConfigStatus(chosenOption.id);

  if (status.isConfigured) {
    const primaryRes = await generateLlmCompletion(messages, options);
    if (primaryRes.success) {
      return primaryRes;
    }
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey && geminiKey.trim().length > 0 && process.env.NODE_ENV !== 'test') {
    try {
      const ai = new GoogleGenAI({
        apiKey: geminiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });
      const systemInstruction = messages
        .filter(m => m.role === 'system')
        .map(m => m.content)
        .join('\n\n');

      const dialogueTurns = messages
        .filter(m => m.role !== 'system' && m.content && m.content.trim().length > 0)
        .map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        }));

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: dialogueTurns.length > 0 ? dialogueTurns : 'مرحباً',
        config: {
          systemInstruction: systemInstruction || undefined,
          temperature: options?.temperature ?? chosenOption.temperature,
          thinkingConfig: {
            thinkingLevel: chosenOption.id === 'qwen-0.5b' ? ThinkingLevel.LOW : ThinkingLevel.HIGH,
          },
        },
      });

      const text = (response.text || '').trim();
      if (text) {
        return {
          success: true,
          content: text,
          modelUsed: chosenOption.ollama_tag,
          profileId: chosenOption.id,
        };
      }
    } catch {
      // Fall through to deterministic/open-domain local expert synthesis
    }
  }

  return {
    success: false,
    content: '',
    modelUsed: chosenOption.ollama_tag,
    profileId: chosenOption.id,
    code: 'LLM_NOT_CONFIGURED',
  };
}

export interface LlmExtractedControlItem {
  control_name_ar: string;
  control_type: 'PREVENTIVE' | 'DETECTIVE' | 'CORRECTIVE';
  automation_level: 'AUTOMATED' | 'SEMI_AUTOMATED' | 'MANUAL';
  control_frequency_ar: string;
  control_owner_ar?: string;
  control_description_ar: string;
}

export interface LlmExtractedRcsaItem {
  chunk_id: string;
  process_name_ar: string;
  strategic_objective_ar: string;
  risk_title_ar: string;
  risk_description_ar: string;
  inherent_frequency_ar?: string;
  control_name_ar?: string;
  control_type?: 'PREVENTIVE' | 'DETECTIVE' | 'CORRECTIVE';
  automation_level?: 'AUTOMATED' | 'SEMI_AUTOMATED' | 'MANUAL';
  control_frequency_ar?: string;
  control_description_ar?: string;
  controls?: LlmExtractedControlItem[];
  estimated_loss_egp?: number;
}

/**
 * Use configured LLM (Ollama/OpenAI or server-side Gemini `gemini-4-hydrogen`) to extract concrete,
 * named RCSA Risks and multiple Controls directly from document chunks as structured JSON.
 * Strictly calibrated to NBE 8-Page RCSA Methodology with Few-Shot Gold Standard Guidance.
 */
export async function generateStructuredRcsaProposalsWithLlm(params: {
  unitNameAr: string;
  chunks: Array<{ chunk_id: string; doc_title_ar: string; content_text: string }>;
  maxItems: number;
  modelProfile?: QwenModelProfileId | string;
}): Promise<LlmExtractedRcsaItem[] | null> {
  const { unitNameAr, chunks, maxItems, modelProfile } = params;
  if (!chunks || chunks.length === 0 || process.env.NODE_ENV === 'test') {
    return null;
  }

  const chosenOption = resolveQwenModelProfile(modelProfile);
  const status = getLlmConfigStatus(chosenOption.id);
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!status.isConfigured && !(geminiKey && geminiKey.trim().length > 0)) {
    return null;
  }

  const systemPrompt = `أنت خبير إدارة المخاطر التشغيلية (RCSA) بالبنك الأهلي المصري.
مهمتك قراءة المقاطع النصية المرفوعة للوحدة (${unitNameAr}) بعمق واستخراج المخاطر التشغيلية الفعلية والضوابط الرقابية التفصيلية الواردة بها وفقاً لمنهجية البنك الأهلي المصري المعتمدة (29 عموداً):
قواعد إلزامية صارمة:
1) لا تكتب أبداً أرقام الصفحات أو المقاطع (مثل "صفحة 1 • مقطع (1)") ولا اسم الملف كاسم للخطر أو الضابط.
2) صياغة المخاطرة (risk_description_ar): لا تبدأ بعبارة "احتمال..."، بل ابدأ بالحدث التشغيلي المحدد والسبب واذكر النتيجة والأثر صراحةً (مثال نموذجي: "أخطاء تنفيذ التحويلات الصادرة نتيجة قصور المراجعة المستندية وعدم مطابقة رموز BIC، مما يؤدي إلى ارتداد الحوالات وتكبد خسائر مالية وتعويضات للعملاء").
3) الأهداف الاستراتيجية (strategic_objective_ar): اختر حصراً أحد الأهداف الخمسة المعتمدة للبنك الأهلي المصري فقط:
   - التركيز على العملاء و تعظيم الأرباح
   - التحول الرقمي و تفعيل الذكاء الاصطناعي
   - النمو المربح و المستدام
   - الكفاءة و الامان والمرونة
   - الشمول المالي
4) نص الضابط الرقابي (control_description_ar): اكتب الإجراء الرقابي العملي فقط كما يطبق ميدانياً، واحذف تماماً آلية أو نوع الضابط من داخل النص (ممنوع كتابة "ضابط رقابي وقائي - آلي" أو "Semi-Automated" داخل النص).
5) دورية الضابط الرقابي (control_frequency_ar): اختر حصراً من القائمة الرسمية للبنك (ممنوع استخدام Per Transaction أو Per Event):
   - Multiple times a day (عدة مرات في اليوم)
   - Daily (يومياً)
   - Weekly (أسبوعياً)
   - Monthly (شهرياً)
   - Quarterly (ربع سنوي)
   - Annually (سنوي)
   - Ad-hoc (وفقاً والحالة)
6) استخرج عدة ضوابط رقابية (2 إلى 3 ضوابط مميزة ومتكاملة: مانعة وكاشفة) لكل مخاطرة في مصفوفة controls.
7) عدد مرات حدوث المخاطرة (inherent_frequency_ar): نوّع التكرار منطقياً حسب حجم النشاط (مرة كل سنتان / مرة واحدة كل سنة / مرة واحدة كل نصف سنة / مرة واحدة كل ربع سنة / مرة واحدة كل شهر) ولا تجعلها كلها سنوياً.
8) الأثر المالي الفردي المرجعي (estimated_loss_egp): إن ورد رقم خسارة فعلية بالمستند فاستخدمه، وإن لم يرد اختر حصراً من القيم المرجعية الـ 5 المعتمدة بمنهجية البنك فقط: 50000 أو 151000 أو 501000 أو 1501000 أو 3001000 (ممنوع استخدام 250000).

مثال مرجعي (Few-Shot Gold Standard) لعنصر واحد:
{
  "chunk_id": "CHK-1",
  "process_name_ar": "تنفيذ ومراجعة التحويلات الخارجية عبر نظام السويفت",
  "strategic_objective_ar": "التركيز على العملاء و تعظيم الأرباح",
  "risk_title_ar": "أخطاء إدخال بيانات المستفيد أو العملة في رسائل السويفت الصادرة",
  "risk_description_ar": "أخطاء إدخال بيانات المستفيد أو رقم IBAN أو العملة في رسائل MT103 نتيجة قصور المراجعة المستندية قبل التمرير، مما يؤدي إلى ارتداد الحوالة وتحمل عمولات مراسلين وخسائر مالية وتأثر رضا العملاء.",
  "inherent_frequency_ar": "مرة واحدة كل ربع سنة",
  "estimated_loss_egp": 151000,
  "controls": [
    {
      "control_name_ar": "التحقق الآلي من صيغة IBAN ورموز السويفت BIC",
      "control_type": "PREVENTIVE",
      "automation_level": "AUTOMATED",
      "control_frequency_ar": "Multiple times a day",
      "control_owner_ar": "النظام المصرفي الأساسي",
      "control_description_ar": "فحص النظام آلياً لصحة هيكل رقم الحساب الدولي IBAN ومطابقة كود البنك المراسل BIC ومنع التمرير عند وجود خطأ."
    },
    {
      "control_name_ar": "المراجعة المزدوجة المستقلة (Maker-Checker) قبل الإجازة النهائية",
      "control_type": "PREVENTIVE",
      "automation_level": "SEMI_AUTOMATED",
      "control_frequency_ar": "Multiple times a day",
      "control_owner_ar": "السلطة الإشرافية",
      "control_description_ar": "مطابقة المراجع المستقل لبيانات رسالة السويفت مع أصل طلب العميل المعتمد قبل إجازة الإرسال على النظام."
    }
  ]
}`;

  const chunksBlock = chunks
    .map(
      (c, idx) =>
        `[${idx + 1}] chunk_id=${c.chunk_id} | المصدر=${c.doc_title_ar}\n${c.content_text.slice(0, 1800)}`
    )
    .join('\n\n---\n\n');

  const userPrompt = `استخرج بحد أقصى (${maxItems}) مخاطر تشغيلية رئيسية شاملة ومتعددة الضوابط من المقاطع التالية لوحدة (${unitNameAr}):\n\n${chunksBlock}`;

  if (status.isConfigured) {
    try {
      const jsonRes = await generateLlmCompletion(
        [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: `${userPrompt}\n\nأعد النتيجة بصيغة JSON object يحتوي على مفتاح "items" كمصفوفة بهذه الحقول فقط: chunk_id, process_name_ar, strategic_objective_ar, risk_title_ar, risk_description_ar, inherent_frequency_ar, estimated_loss_egp, controls (مصفوفة من 2-3 ضوابط لكل منها: control_name_ar, control_type [PREVENTIVE|DETECTIVE|CORRECTIVE], automation_level [AUTOMATED|SEMI_AUTOMATED|MANUAL], control_frequency_ar, control_owner_ar, control_description_ar).`,
          },
        ],
        { modelProfile: chosenOption.id, responseFormatJson: true, timeoutMs: 45000 }
      );
      if (jsonRes.success && jsonRes.content) {
        const parsed = parseResilientLlmJson(jsonRes.content);
        const items = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.items) ? parsed.items : null;
        if (items && items.length > 0) return items;
      }
    } catch {
      // Fall through to Gemini or deterministic extractor
    }
  }

  if (geminiKey && geminiKey.trim().length > 0) {
    try {
      const ai = new GoogleGenAI({
        apiKey: geminiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: userPrompt,
        config: {
          systemInstruction: systemPrompt,
          thinkingConfig: {
            thinkingLevel: chosenOption.id === 'qwen-0.5b' ? ThinkingLevel.LOW : ThinkingLevel.HIGH,
          },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                chunk_id: { type: Type.STRING },
                process_name_ar: { type: Type.STRING },
                strategic_objective_ar: { type: Type.STRING },
                risk_title_ar: { type: Type.STRING },
                risk_description_ar: { type: Type.STRING },
                inherent_frequency_ar: { type: Type.STRING },
                estimated_loss_egp: { type: Type.NUMBER },
                controls: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      control_name_ar: { type: Type.STRING },
                      control_type: { type: Type.STRING },
                      automation_level: { type: Type.STRING },
                      control_frequency_ar: { type: Type.STRING },
                      control_owner_ar: { type: Type.STRING },
                      control_description_ar: { type: Type.STRING },
                    },
                    required: [
                      'control_name_ar',
                      'control_type',
                      'automation_level',
                      'control_frequency_ar',
                      'control_description_ar',
                    ],
                  },
                },
              },
              required: [
                'chunk_id',
                'process_name_ar',
                'strategic_objective_ar',
                'risk_title_ar',
                'risk_description_ar',
                'controls',
              ],
            },
          },
        },
      });
      const rawJson = (response.text || '').trim();
      if (rawJson) {
        const parsed = parseResilientLlmJson(rawJson);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {
      // Fall through cleanly to deterministic semantic extractor
    }
  }

  return null;
}

