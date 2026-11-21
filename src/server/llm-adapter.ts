export interface LlmChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export const LLM_MODELS = [
  { id: 'qwen2.5:0.5b', label: 'الأسرع', description: 'للردود والمهام البسيطة' },
  { id: 'qwen2.5:7b', label: 'الأدق', description: 'للتحليل والردود المعقدة' },
] as const;

export type LlmModelId = (typeof LLM_MODELS)[number]['id'];

export interface LlmConfigStatus {
  isConfigured: boolean;
  baseUrl?: string;
  modelName?: string;
  hasApiKey: boolean;
  availableModels: typeof LLM_MODELS;
}

export function isLlmModelId(value: unknown): value is LlmModelId {
  return typeof value === 'string' && LLM_MODELS.some((model) => model.id === value);
}

export function getLlmConfigStatus(): LlmConfigStatus {
  const baseUrl = process.env.LLM_API_BASE_URL || process.env.OPENAI_API_BASE || process.env.OPENAI_BASE_URL;
  const apiKey = process.env.LLM_API_KEY || process.env.OPENAI_API_KEY;
  const configuredModel = process.env.LLM_MODEL_NAME || process.env.OPENAI_MODEL_NAME || 'qwen2.5:7b';
  const modelName = isLlmModelId(configuredModel) ? configuredModel : 'qwen2.5:7b';

  const isConfigured = Boolean(baseUrl);

  return {
    isConfigured,
    baseUrl: baseUrl || undefined,
    modelName,
    hasApiKey: Boolean(apiKey),
    availableModels: LLM_MODELS,
  };
}

export async function generateLlmCompletion(
  messages: LlmChatMessage[],
  options?: {
    temperature?: number;
    responseFormatJson?: boolean;
    timeoutMs?: number;
    modelName?: LlmModelId;
  }
): Promise<{ success: boolean; content: string; code?: string; error?: string }> {
  const status = getLlmConfigStatus();

  if (!status.isConfigured || !status.baseUrl) {
    return {
      success: false,
      content: '',
      code: 'LLM_NOT_CONFIGURED',
      error: 'النموذج الذكي غير مهيأ في إعدادات الخادم (LLM_API_BASE_URL غير محدد). الجلسة موحدة والوظائف المباشرة متاحة.',
    };
  }

  const endpoint = `${status.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const configuredTimeoutMs = Number(process.env.LLM_TIMEOUT_MS);
  const defaultTimeoutMs =
    Number.isFinite(configuredTimeoutMs) && configuredTimeoutMs > 0
      ? configuredTimeoutMs
      : 120000;
  const timeoutMs = options?.timeoutMs ?? defaultTimeoutMs;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const apiKey = process.env.LLM_API_KEY || process.env.OPENAI_API_KEY;
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const requestBody: any = {
    model: options?.modelName ?? status.modelName,
    messages,
    temperature: options?.temperature ?? 0.2,
  };

  if (options?.responseFormatJson) {
    requestBody['response_format'] = { type: 'json_object' };
  }

  try {
    let res: Response;
    try {
      res = await globalThis.fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
    } catch (firstErr: any) {
      // If host.docker.internal fails to resolve on Linux, auto-retry via Docker gateway 172.17.0.1
      if (
        endpoint.includes('host.docker.internal') &&
        (firstErr?.message?.includes('ENOTFOUND') || firstErr?.message?.includes('fetch failed'))
      ) {
        const fallbackEndpoint = endpoint.replace('host.docker.internal', '172.17.0.1');
        console.log(`[LLM Adapter] host.docker.internal not reachable, trying Linux host gateway: ${fallbackEndpoint}`);
        res = await globalThis.fetch(fallbackEndpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });
      } else {
        throw firstErr;
      }
    }

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errorText = await res.text().catch(() => '');
      return {
        success: false,
        content: '',
        code: 'LLM_UNAVAILABLE',
        error: `استجابة خادم النموذج الذكي غير متاحة (${res.status}): ${errorText.slice(0, 120)}`,
      };
    }

    const data: any = await res.json();
    const content = data.choices?.[0]?.message?.content || '';

    if (!content) {
      return {
        success: false,
        content: '',
        code: 'LLM_EMPTY_RESPONSE',
        error: 'لم يقدم النموذج الذكي استجابة نصية.',
      };
    }

    return {
      success: true,
      content,
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    const isAbort = err.name === 'AbortError';
    return {
      success: false,
      content: '',
      code: isAbort ? 'LLM_TIMEOUT' : 'LLM_UNAVAILABLE',
      error: isAbort
        ? `تجاوزت الاستجابة مهلة الانتظار المحدد (${timeoutMs / 1000} ثانية).`
        : `تعذر الاتصال ببيئة استدلال النموذج الذكي (${err.message || 'خطأ شبكة'}).`,
    };
  }
}
