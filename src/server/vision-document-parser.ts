import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { getPythonExecutable } from './python-runtime.js';
import {
  quarantinePromptInjection,
  redactBankingPii,
  repairArabicPdfText,
} from './rag-service.js';
import { countMarkdownTablesInText } from './table-chunker.js';

export type VisionEngineKind =
  | 'GEMINI_VIT_VLM'
  | 'OLLAMA_VISION'
  | 'CUSTOM_VISION_FN'
  | 'UNAVAILABLE';

export interface VisionPageImage {
  pageNumber: number;
  mimeType: string;
  base64Data: string;
  sourceKind: 'DIRECT_IMAGE' | 'EMBEDDED_PDF_OR_OFFICE' | 'CHROMIUM_RENDERED_PDF';
}

export interface VisionParseResult {
  status: 'EXTRACTED' | 'VISION_UNAVAILABLE' | 'MANUAL_REQUIRED';
  text: string;
  engine: VisionEngineKind;
  modelName: string;
  pagesProcessed: number;
  tablesDetected: number;
  piiRedactions: number;
  injectionQuarantined: boolean;
  reason?: string;
}

export type VisionModelCallback = (params: {
  base64Data: string;
  mimeType: string;
  pageNumber: number;
  prompt: string;
}) => Promise<string>;

const VISION_RCSA_EXTRACTION_PROMPT = `أنت محلل مستندات مصرفية فائق الدقة (ViT / Multimodal Document & Table Parser) متخصص في مستندات البنك الأهلي المصري والرقابة التشغيلية (RCSA).
المهمة: استخرج كل ما يظهر في هذه الصورة/الصفحة بدقة حرفية دون تلخيص أو اختصار أو اختلاق:
1) الجداول (الأهم): حوّل أي جدول (عربي أو إنجليزي أو مختلط) إلى جدول Markdown متكامل الأعمدة والصفوف:
   | العمود 1 | العمود 2 | ... |
   | --- | --- | ... |
   - حافظ على ارتباط كل صف بعموده الصحيح (لا تدمج الأعمدة معاً)، وكرّر القيمة إذا كانت هناك خلايا مدمجة (merged cells).
   - استخرج كافة الأرقام والمبالغ المالية (مثل ج.م / EGP / % / RRF / التكرار) والأكواد (RSK / CTL / MT103 / L1-L3 / ESG) كما هي حرفياً.
2) النصوص والبنود: استخرج العناوين، بنود الإجراءات (SOP)، ملاحظات التفتيش، أو تقارير الحوادث بنفس ترتيب القراءة الصحيح (من اليمين لليسار للعربية).
3) المخططات والرسوم (Charts/Diagrams): إذا احتوت الصورة على مخطط تدفق أو رسم بياني أو مصفوفة مخاطر (Heat Map)، صفها بصيغة مهيكلة تحت عنوان [مخطط / رسم بياني: ...] مع ذكر كل القيم والتصنيفات الظاهرة.
4) التوثيق الصادق: لا تخمّن أو تبتكر أي رقم غير واضح؛ وإذا كانت خلية غير مقروءة اكتب [غير واضح]. أعد النص والجدول المستخرجين فقط دون مقدمات أو تعليقات جانبية.`;

const IMAGE_MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
};

function findChromiumHeadlessBinary(): string | null {
  const candidates = [
    '/ms-playwright/chrome-headless-shell-linux64/chrome-headless-shell',
    '/ms-playwright/chromium_headless_shell-1247/chrome-headless-shell-linux64/chrome-headless-shell',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  try {
    if (fs.existsSync('/ms-playwright')) {
      for (const d of fs.readdirSync('/ms-playwright')) {
        const subPath = path.join('/ms-playwright', d, 'chrome-headless-shell-linux64', 'chrome-headless-shell');
        if (fs.existsSync(subPath)) return subPath;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

export function isVisionModelConfigured(): {
  configured: boolean;
  engine: VisionEngineKind;
  modelName: string;
} {
  const ollamaUrl = process.env.OLLAMA_BASE_URL || process.env.LLM_API_BASE_URL;
  const ollamaVisionModel = process.env.OLLAMA_VISION_MODEL;
  if (ollamaUrl && ollamaVisionModel && ollamaVisionModel.trim()) {
    return {
      configured: true,
      engine: 'OLLAMA_VISION',
      modelName: ollamaVisionModel.trim(),
    };
  }
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey && geminiKey.trim() && process.env.NODE_ENV !== 'test') {
    return {
      configured: true,
      engine: 'GEMINI_VIT_VLM',
      modelName: 'gemini-4-hydrogen',
    };
  }
  return {
    configured: false,
    engine: 'UNAVAILABLE',
    modelName: 'none',
  };
}

/**
 * Collect images from:
 * 1) Direct uploaded image file (.png/.jpg/.webp/.bmp/.tif)
 * 2) Embedded PDF/DOCX/PPTX/XLSX images extracted via Python stdlib extractor
 * 3) Chromium headless screenshot fallback for vector/complex PDFs without direct image streams
 */
export function collectDocumentPageImages(
  filePath: string,
  maxPages = 6
): VisionPageImage[] {
  const absPath = path.resolve(filePath);
  if (!fs.existsSync(absPath)) return [];
  const ext = path.extname(absPath).toLowerCase();

  if (IMAGE_MIME_BY_EXT[ext]) {
    const raw = fs.readFileSync(absPath);
    if (raw.length < 12) return [];
    return [
      {
        pageNumber: 1,
        mimeType: IMAGE_MIME_BY_EXT[ext],
        base64Data: raw.toString('base64'),
        sourceKind: 'DIRECT_IMAGE',
      },
    ];
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rcsa_vision_'));
  const collected: VisionPageImage[] = [];

  try {
    // Extract embedded images directly from PDF/Office containers first
    try {
      const outJson = execFileSync(
        getPythonExecutable(),
        ['-m', 'rcsa_engine.document_extract', '--path', absPath, '--extract-images-dir', tmpDir],
        { cwd: process.cwd(), encoding: 'utf-8', maxBuffer: 2 * 1024 * 1024, timeout: 30_000 }
      );
      const parsed = JSON.parse(outJson);
      if (Array.isArray(parsed.images)) {
        for (const item of parsed.images.slice(0, maxPages)) {
          if (item?.path && fs.existsSync(item.path)) {
            const buf = fs.readFileSync(item.path);
            if (buf.length > 32) {
              collected.push({
                pageNumber: Number(item.page) || collected.length + 1,
                mimeType: String(item.mime_type || 'image/png'),
                base64Data: buf.toString('base64'),
                sourceKind: 'EMBEDDED_PDF_OR_OFFICE',
              });
            }
          }
        }
      }
    } catch {
      // ignore and fall through to Chromium render if needed
    }

    // If PDF has pages but no embedded JPEG/PNG XObjects (e.g. vector table PDF), rasterize page 1 via Chromium headless
    if (collected.length === 0 && ext === '.pdf') {
      const pdfBytes = fs.readFileSync(absPath);
      const hasRealPages = pdfBytes.includes('/Page') && pdfBytes.length > 180;
      const chromiumBin = hasRealPages ? findChromiumHeadlessBinary() : null;
      if (chromiumBin) {
        const screenshotPath = path.join(tmpDir, 'pdf_render_p1.png');
        try {
          execFileSync(
            chromiumBin,
            [
              '--headless',
              '--no-sandbox',
              '--disable-gpu',
              '--window-size=1440,1920',
              `--screenshot=${screenshotPath}`,
              `file://${absPath}`,
            ],
            { timeout: 15_000, stdio: 'ignore' }
          );
          if (fs.existsSync(screenshotPath)) {
            const pngBuf = fs.readFileSync(screenshotPath);
            if (pngBuf.length > 512) {
              collected.push({
                pageNumber: 1,
                mimeType: 'image/png',
                base64Data: pngBuf.toString('base64'),
                sourceKind: 'CHROMIUM_RENDERED_PDF',
              });
            }
          }
        } catch {
          // ignore headless render failures
        }
      }
    }
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup error
    }
  }

  return collected;
}

async function callOllamaVision(params: {
  baseUrl: string;
  modelName: string;
  base64Data: string;
  prompt: string;
}): Promise<string> {
  const cleanBase = params.baseUrl.replace(/\/+$/, '').replace(/\/v1$/, '');
  const endpoint = `${cleanBase}/api/chat`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
    const res = await globalThis.fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: params.modelName,
        stream: false,
        messages: [
          {
            role: 'user',
            content: params.prompt,
            images: [params.base64Data],
          },
        ],
        options: { temperature: 0.1 },
      }),
      signal: controller.signal,
    });
    if (!res.ok) return '';
    const data: any = await res.json();
    return String(data?.message?.content || data?.choices?.[0]?.message?.content || '').trim();
  } finally {
    clearTimeout(timeout);
  }
}

async function callGeminiVision(params: {
  apiKey: string;
  base64Data: string;
  mimeType: string;
  prompt: string;
}): Promise<string> {
  const ai = new GoogleGenAI({
    apiKey: params.apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: [
      {
        role: 'user',
        parts: [
          {
            inlineData: {
              mimeType: params.mimeType,
              data: params.base64Data,
            },
          },
          { text: params.prompt },
        ],
      },
    ],
    config: {
      temperature: 0.1,
      thinkingConfig: {
        thinkingLevel: ThinkingLevel.LOW,
      },
    },
  });

  return (response.text || '').trim();
}

/**
 * Run V5 Multimodal ViT/VLM Document & Table Understanding on an image, scanned PDF,
 * or complex PDF/Office file containing visual tables or embedded scans.
 * Applies full Arabic Lam-Alef repair, Prompt-Injection Quarantine, and Banking PII Redaction.
 */
export async function parseDocumentWithVision(params: {
  filePath: string;
  maxPages?: number;
  visionCallback?: VisionModelCallback;
}): Promise<VisionParseResult> {
  const { filePath, maxPages = 6, visionCallback } = params;
  const images = collectDocumentPageImages(filePath, maxPages);

  if (images.length === 0) {
    return {
      status: 'MANUAL_REQUIRED',
      text: '',
      engine: 'UNAVAILABLE',
      modelName: 'none',
      pagesProcessed: 0,
      tablesDetected: 0,
      piiRedactions: 0,
      injectionQuarantined: false,
      reason: 'لم يتم العثور على صور أو صفحات قابلة للمعالجة البصرية داخل الملف.',
    };
  }

  const visionStatus = isVisionModelConfigured();
  if (!visionCallback && !visionStatus.configured) {
    return {
      status: 'VISION_UNAVAILABLE',
      text: '',
      engine: 'UNAVAILABLE',
      modelName: 'none',
      pagesProcessed: 0,
      tablesDetected: 0,
      piiRedactions: 0,
      injectionQuarantined: false,
      reason:
        'نموذج الرؤية الحاسوبية (GEMINI_API_KEY أو OLLAMA_VISION_MODEL) غير مهيأ حالياً؛ تم حفظ الملف بدون اختلاق نصوص.',
    };
  }

  const pageSections: string[] = [];
  let activeEngine: VisionEngineKind = visionCallback
    ? 'CUSTOM_VISION_FN'
    : visionStatus.engine;
  let activeModelName = visionCallback ? 'vit-vlm-vision-parser' : visionStatus.modelName;

  for (const img of images) {
    let rawOutput = '';
    try {
      if (visionCallback) {
        rawOutput = await visionCallback({
          base64Data: img.base64Data,
          mimeType: img.mimeType,
          pageNumber: img.pageNumber,
          prompt: VISION_RCSA_EXTRACTION_PROMPT,
        });
      } else if (visionStatus.engine === 'OLLAMA_VISION') {
        const baseUrl = process.env.OLLAMA_BASE_URL || process.env.LLM_API_BASE_URL || '';
        rawOutput = await callOllamaVision({
          baseUrl,
          modelName: visionStatus.modelName,
          base64Data: img.base64Data,
          prompt: VISION_RCSA_EXTRACTION_PROMPT,
        });
      } else if (visionStatus.engine === 'GEMINI_VIT_VLM') {
        rawOutput = await callGeminiVision({
          apiKey: process.env.GEMINI_API_KEY || '',
          base64Data: img.base64Data,
          mimeType: img.mimeType,
          prompt: VISION_RCSA_EXTRACTION_PROMPT,
        });
      }
    } catch {
      rawOutput = '';
    }

    const clean = rawOutput.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    if (clean) {
      pageSections.push(`[Vision Page ${img.pageNumber}]\n${clean}`);
    }
  }

  if (pageSections.length === 0) {
    return {
      status: 'MANUAL_REQUIRED',
      text: '',
      engine: activeEngine,
      modelName: activeModelName,
      pagesProcessed: images.length,
      tablesDetected: 0,
      piiRedactions: 0,
      injectionQuarantined: false,
      reason: 'تعذر استخلاص نصوص أو جداول مقروءة من الصور بالمحرك البصري.',
    };
  }

  const combinedRaw = pageSections.join('\n\n');
  const repaired = repairArabicPdfText(combinedRaw);
  const { sanitizedText, injectionDetected } = quarantinePromptInjection(repaired);
  const beforePii = sanitizedText;
  const redactedText = redactBankingPii(beforePii);
  const piiMatches = redactedText.match(/\[REDACTED-(?:IBAN|NATIONAL-ID|CARD-PAN)\]/g);
  const tablesDetected = countMarkdownTablesInText(redactedText);

  return {
    status: 'EXTRACTED',
    text: redactedText,
    engine: activeEngine,
    modelName: activeModelName,
    pagesProcessed: pageSections.length,
    tablesDetected,
    piiRedactions: piiMatches ? piiMatches.length : 0,
    injectionQuarantined: injectionDetected,
  };
}
