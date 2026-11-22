import path from 'path';
import { GoogleGenAI } from '@google/genai';
import { db } from './db.js';

export interface CitationReference {
  document_id: string;
  chunk_id?: string;
  title_ar: string;
  file_name: string;
  section_title?: string;
  quote_text: string;
  page_number?: number;
  doc_type: string;
  relevance_score?: number;
}

export interface DocumentIntelligenceSummary {
  document_id: string;
  title_ar: string;
  doc_type: string;
  chunks_count: number;
  total_chars: number;
  detected_amounts_egp: number[];
  detected_Controls_hints: string[];
  detected_processes: string[];
  key_excerpts: string[];
}

export interface RagContextBundle {
  unit: {
    id: string;
    name_ar: string;
    code: string;
  };
  session_documents: Array<{
    id: string;
    title_ar: string;
    file_name: string;
    doc_type: string;
    total_chars: number;
    detected_amounts_egp: number[];
    chunks: Array<{
      id: string;
      chunk_index: number;
      section_title?: string;
      content_text: string;
      page_number?: number;
    }>;
  }>;
  incidents: any[];
  audit_findings: any[];
  baseline_risks: any[];
  taxonomy_l1: any[];
  taxonomy_entries: any[];
  esg_pillars: any[];
  esg_catalogue: any[];
  rag_stats: {
    documents_count: number;
    total_chunks_count: number;
    total_indexed_chars: number;
    incidents_count: number;
    audit_findings_count: number;
    baseline_risks_count: number;
    taxonomy_nodes_count: number;
    esg_items_count: number;
  };
}

const ARABIC_LIGATURE_REPAIRS: Array<[string, string]> = [
  ['المالحظة', 'الملاحظة'],
  ['المالحظات', 'الملاحظات'],
  ['مالحظة', 'ملاحظة'],
  ['مالحظات', 'ملاحظات'],
  ['اإلجراءات', 'الإجراءات'],
  ['اإلجراء', 'الإجراء'],
  ['اإلدارة', 'الإدارة'],
  ['اإلدارات', 'الإدارات'],
  ['األهلي', 'الأهلي'],
  ['اآللي', 'الآلي'],
  ['اآللية', 'الآلية'],
  ['األخطار', 'الأخطار'],
  ['األمن', 'الأمن'],
  ['األموال', 'الأموال'],
  ['المعامالت', 'المعاملات'],
  ['معامالت', 'معاملات'],
  ['التعديالت', 'التعديلات'],
  ['تعديالت', 'تعديلات'],
  ['االلتزام', 'الالتزام'],
  ['االعتماد', 'الاعتماد'],
  ['االئتمان', 'الائتمان'],
  ['العالقة', 'العلاقة'],
  ['عالقة', 'علاقة'],
  ['العمالت', 'العملات'],
  ['عمالت', 'عملات'],
  ['الحاالت', 'الحالات'],
  ['حاالت', 'حالات'],
  ['االختيار', 'الاختيار'],
  ['االستالم', 'الاستلام'],
  ['االتصاالت', 'الاتصالات'],
  ['اتصاالت', 'اتصالات'],
  ['البنك االهلي', 'البنك الأهلي'],
];

/**
 * Repair broken Arabic PDF Lam-Alef ligatures (e.g. "المالحظة" -> "الملاحظة") per README §Document intelligence.
 */
export function repairArabicPdfText(text: string): string {
  if (!text) return '';
  let repaired = text;
  for (const [broken, fixed] of ARABIC_LIGATURE_REPAIRS) {
    repaired = repaired.split(broken).join(fixed);
  }
  return repaired;
}

/**
 * Prompt-injection quarantine: uploaded text is treated strictly as data, never instructions.
 */
export function quarantinePromptInjection(text: string): {
  sanitizedText: string;
  injectionDetected: boolean;
} {
  if (!text) return { sanitizedText: '', injectionDetected: false };
  const patterns = [
    /ignore\s+(?:all\s+)?(?:previous|prior|above)\s+instructions/gi,
    /system\s*prompt\s*:/gi,
    /you\s+are\s+now\s+(?:a|an)\b/gi,
    /تجاهل\s+(?:كافة\s+|جميع\s+)?التعليمات\s+السابقة/g,
    /override\s+(?:rrf|residual_rating|inherent_rating|approval)/gi,
  ];
  let sanitizedText = text;
  let injectionDetected = false;
  for (const pat of patterns) {
    if (pat.test(sanitizedText)) {
      injectionDetected = true;
      sanitizedText = sanitizedText.replace(pat, '[QUARANTINED-UNTRUSTED-INSTRUCTION]');
    }
  }
  return { sanitizedText, injectionDetected };
}

/**
 * Redact sensitive banking PII (Egyptian IBAN, 14-digit National ID, 16-digit Card PAN).
 */
export function redactBankingPii(text: string): string {
  if (!text) return '';
  return text
    .replace(/\bEG\d{27}\b/g, '[REDACTED-IBAN]')
    .replace(/\b[23]\d{13}\b/g, '[REDACTED-NATIONAL-ID]')
    .replace(/\b(?:\d{4}[-\s]?){3}\d{4}\b/g, '[REDACTED-CARD-PAN]');
}

/**
 * Normalize Arabic and English text for high-recall lexical & stem matching.
 */
export function normalizeTextForRag(text: string): string {
  if (!text) return '';
  return repairArabicPdfText(text)
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '') // Strip Tashkeel & Tatweel
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const ARABIC_STOP_WORDS = new Set([
  'من', 'في', 'على', 'الي', 'إلى', 'عن', 'مع', 'هذا', 'هذه', 'تلك', 'ذلك',
  'التي', 'الذي', 'الذين', 'ما', 'هي', 'هو', 'هل', 'كيف', 'ماذا', 'متى',
  'اين', 'لماذا', 'كل', 'بعض', 'او', 'أو', 'ثم', 'بل', 'لا', 'نعم', 'كان',
  'كانت', 'يكون', 'تكون', 'تم', 'يتم', 'تتم', 'قد', 'لقد', 'ان', 'أن', 'إن',
  'به', 'بها', 'له', 'لها', 'فيها', 'فيه', 'عليه', 'عليها', 'منها', 'منه',
  'عند', 'خلال', 'بعد', 'قبل', 'حول', 'ضد', 'بين', 'تحت', 'فوق', 'امام',
  'قم', 'يرجي', 'اريد', 'عايز', 'لو', 'سمحت', 'لي', 'لنا', 'عنها',
]);

/**
 * Bilingual Banking & Operational Risk Synonym Clusters for Query Expansion.
 * Helps match user questions written in different operational phrasing against SOP/Audit/Incident chunks.
 */
const BANKING_SYNONYM_CLUSTERS: string[][] = [
  ['تسويه', 'تسويات', 'مطابقه', 'فروق', 'مقاصه', 'نوسترو', 'reconciliation', 'settlement', 'nostro'],
  ['حواله', 'حوالات', 'تحويل', 'تحويلات', 'سويفت', 'رسائل', 'swift', 'mt103', 'mt202'],
  ['صلاحيات', 'اعتماد', 'مراجعه مزدوج', 'فصل مهام', 'توقيع', 'maker', 'checker', 'authorization'],
  ['حظر', 'عقوبات', 'غسل اموال', 'امتثال', 'تجميد', 'فك تجميد', 'sanctions', 'ofac', 'aml', 'kyc'],
  ['احتيال', 'تزوير', 'انتحال', 'اختلاس', 'مزور', 'fraud', 'forgery', 'callback'],
  ['عطل', 'اعطال', 'توقف', 'انقطاع', 'شبكه', 'ماكينات', 'نقاط البيع', 'pos', 'outage', 'downtime'],
  ['قيد', 'قيود', 'محاسب', 'استاذ عام', 'حساب وسيط', 'مدين', 'دائن', 'gl', 'ledger'],
  ['تفتيش', 'ملاحظه', 'فجوه', 'تدقيق', 'audit', 'finding'],
  ['حادث', 'خساره', 'خسائر', 'تعويض', 'غرامه', 'loss', 'incident'],
];

export function tokenizeRagQuery(query: string): {
  rawTerms: string[];
  stems: string[];
  expandedSynonyms: string[];
  bigrams: string[];
} {
  const norm = normalizeTextForRag(query);
  const rawWords = norm.split(/\s+/).filter(w => w.length >= 2 && !ARABIC_STOP_WORDS.has(w));
  const stems = new Set<string>();

  for (const w of rawWords) {
    stems.add(w);
    // Strip common Arabic prefixes (وال, بال, كال, فال, لل, ال)
    const strippedPrefix = w.replace(/^(وال|بال|كال|فال|لل|ال)/, '');
    if (strippedPrefix.length >= 3) {
      stems.add(strippedPrefix);
    }
    // Strip common plural/feminine suffixes (ات, ين, ون, ه, ي, ها, هم)
    const strippedSuffix = strippedPrefix.replace(/(ات|ين|ون|ها|هم|ان|يه|ه)$/, '');
    if (strippedSuffix.length >= 3) {
      stems.add(strippedSuffix);
    }
  }

  // Build adjacent bi-grams for phrase proximity scoring
  const bigrams: string[] = [];
  for (let i = 0; i < rawWords.length - 1; i++) {
    bigrams.push(`${rawWords[i]} ${rawWords[i + 1]}`);
  }

  // Expand synonyms from banking clusters when query matches a cluster term
  const expandedSynonyms = new Set<string>();
  const stemArr = Array.from(stems);
  for (const cluster of BANKING_SYNONYM_CLUSTERS) {
    const matchesCluster = cluster.some(cTerm =>
      stemArr.some(s => s.length >= 3 && (cTerm.includes(s) || s.includes(cTerm)))
    );
    if (matchesCluster) {
      for (const syn of cluster) {
        if (!stems.has(syn)) {
          expandedSynonyms.add(syn);
        }
      }
    }
  }

  return {
    rawTerms: rawWords,
    stems: stemArr,
    expandedSynonyms: Array.from(expandedSynonyms),
    bigrams,
  };
}

/**
 * Extract the richest context window (up to maxChars, default 1400) centered around the first matched query term
 * so the LLM receives complete operational paragraphs/tables instead of a truncated 240-char prefix.
 */
export function extractBestContextWindow(rawText: string, searchTerms: string[], maxChars = 1400): string {
  if (!rawText) return '';
  const clean = rawText.trim();
  if (clean.length <= maxChars) return clean;

  const normFull = normalizeTextForRag(clean);
  let bestPos = -1;
  for (const term of searchTerms) {
    if (term.length < 3) continue;
    const idx = normFull.indexOf(term);
    if (idx !== -1 && (bestPos === -1 || idx < bestPos)) {
      bestPos = idx;
    }
  }

  if (bestPos <= 120) {
    return clean.slice(0, maxChars);
  }
  const start = Math.max(0, bestPos - 220);
  return (start > 0 ? '...' : '') + clean.slice(start, start + maxChars);
}

/**
 * Extract numeric monetary amounts (in EGP) mentioned in text.
 */
export function extractMonetaryAmountsFromText(text: string): number[] {
  if (!text) return [];
  const amounts: number[] = [];

  // Match numbers with commas or followed by currency/unit keywords
  const regex = /(\d{1,3}(?:,\d{3})+|\d{4,9})(?:\s*(?:ج\.?م|جنيه|جم|egp|الف|ألف|مليون))?/gi;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    const rawNum = Number(m[1].replace(/,/g, ''));
    if (!Number.isNaN(rawNum) && rawNum >= 1000 && rawNum <= 500_000_000) {
      // Exclude years like 2024, 2025, 2026 unless followed by currency
      if (rawNum >= 2020 && rawNum <= 2035 && !m[0].match(/ج\.?م|جنيه|جم|egp/i)) {
        continue;
      }
      if (!amounts.includes(rawNum)) {
        amounts.push(rawNum);
      }
    }
  }
  return amounts;
}

export function assembleRagContextBundle(sessionId: string, unitId: string): RagContextBundle {
  const unit = (db.prepare('SELECT id, name_ar, code FROM business_units WHERE id = ?').get(unitId) as any) || {
    id: unitId,
    name_ar: unitId,
    code: unitId.replace('BU-', ''),
  };

  const sessionRow = db
    .prepare('SELECT uploaded_document_ids_json, base_assessment_id, use_historical_sources FROM rcsa_workflow_sessions WHERE id = ?')
    .get(sessionId) as any;

  let uploadedDocIds: string[] = [];
  try {
    uploadedDocIds = JSON.parse(sessionRow?.uploaded_document_ids_json || '[]');
  } catch {
    uploadedDocIds = [];
  }

  // Fetch session documents (prioritizing explicitly uploaded session documents, plus unit documents)
  let docs: any[] = [];
  if (uploadedDocIds.length > 0) {
    const placeholders = uploadedDocIds.map(() => '?').join(',');
    docs = db.prepare(`SELECT * FROM documents WHERE id IN (${placeholders})`).all(...uploadedDocIds) as any[];
  } else {
    docs = db
      .prepare('SELECT * FROM documents WHERE session_id = ? OR unit_id = ? ORDER BY uploaded_at DESC LIMIT 15')
      .all(sessionId, unitId) as any[];
  }

  let totalChunksCount = 0;
  let totalIndexedChars = 0;

  const session_documents = docs.map((d: any) => {
    const chunks = db
      .prepare('SELECT id, chunk_index, section_title, content_text, page_number FROM document_chunks WHERE document_id = ? ORDER BY chunk_index ASC')
      .all(d.id) as any[];

    const cleanName = d.filename ? path.basename(String(d.filename)).replace(/^\d+_/, '') : d.id;
    const fullDocText = chunks.map(c => c.content_text).join('\n');
    const docChars = fullDocText.length;
    totalChunksCount += chunks.length;
    totalIndexedChars += docChars;

    return {
      id: d.id,
      title_ar: cleanName || d.id,
      file_name: cleanName || `${d.id}.pdf`,
      doc_type: d.file_type || 'SOP',
      total_chars: docChars,
      detected_amounts_egp: extractMonetaryAmountsFromText(fullDocText),
      chunks,
    };
  });

  // Fetch unit incidents from historical_incidents (and fallback to incidents if present)
  let incidents: any[] = [];
  try {
    const histInc = db
      .prepare('SELECT * FROM historical_incidents WHERE unit_id = ? ORDER BY incident_code ASC LIMIT 25')
      .all(unitId) as any[];
    incidents = histInc.map(inc => ({
      ...inc,
      id: inc.incident_code || inc.id,
      event_type: inc.event_summary_ar || inc.incident_code,
      description: `${inc.event_summary_ar || ''} — ${inc.incident_detail_ar || ''}`.trim(),
      cause: inc.risk_category_l1_raw || '',
      loss_amount_egp: Number(inc.net_loss_amount || 0),
    }));
  } catch {
    incidents = [];
  }

  if (incidents.length === 0) {
    try {
      incidents = db.prepare('SELECT * FROM incidents WHERE unit_id = ? ORDER BY id DESC LIMIT 15').all(unitId) as any[];
    } catch {
      incidents = [];
    }
  }

  // Fetch unit audit findings
  let audit_findings: any[] = [];
  try {
    const rawFindings = db
      .prepare('SELECT * FROM audit_findings WHERE unit_id = ? ORDER BY finding_number ASC LIMIT 25')
      .all(unitId) as any[];
    audit_findings = rawFindings.map(af => ({
      ...af,
      title_ar: af.title_ar || af.finding_title || `ملاحظة تفتيش رقم ${af.finding_number || af.id}`,
      details_ar: af.details_ar || af.finding_description || '',
      root_causes_ar: af.root_causes_ar || '',
      impact_ar: af.impact_ar || '',
      corrective_action_ar: af.corrective_action_ar || '',
    }));
  } catch {
    audit_findings = [];
  }

  // Fetch baseline risks if base_assessment_id exists OR dual-source mode (use_historical_sources = 1)
  let baseline_risks: any[] = [];
  let effectiveBaseAssessmentId = sessionRow?.base_assessment_id || null;
  if (!effectiveBaseAssessmentId && Number(sessionRow?.use_historical_sources || 0) === 1) {
    const latestApproved = db
      .prepare(
        `SELECT id FROM rcsa_assessments WHERE unit_id = ? AND status = 'APPROVED' ORDER BY version_number DESC, approved_at DESC LIMIT 1`
      )
      .get(unitId) as { id: string } | undefined;
    effectiveBaseAssessmentId = latestApproved?.id || null;
  }

  if (effectiveBaseAssessmentId) {
    const pkgs = db
      .prepare(`
      SELECT risk_id, current_draft_input_json, calculated_output_json 
      FROM hitl_risk_packages 
      WHERE assessment_id = ? 
      ORDER BY display_order ASC
    `)
      .all(effectiveBaseAssessmentId) as any[];

    baseline_risks = pkgs
      .map(p => {
        try {
          const draft = JSON.parse(p.current_draft_input_json);
          const calc = JSON.parse(p.calculated_output_json || '{}');
          return {
            risk_id: p.risk_id,
            process_name: draft.process_name,
            risk_description: draft.risk_description,
            individual_financial_impact: draft.individual_financial_impact,
            expected_frequency_text: draft.expected_frequency_text,
            expected_annual_loss_egp: calc.expected_annual_loss_egp,
            inherent_rating: calc.annualized_financial_rating,
            effective_max_rrf: calc.effective_max_rrf,
            selected_max_rrf_control_id: calc.selected_max_rrf_control_id,
            residual_financial_amount_egp: calc.residual_financial_amount_egp,
            residual_financial_rating: calc.continuous_residual_rating,
            taxonomy_l1_ar: draft.taxonomy_l1_ar,
            controls: draft.controls || [],
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  }

  // Load full official 84-entry Risk Taxonomy (L1/L2/L3) from SQLite
  let taxonomy_entries: any[] = [];
  try {
    taxonomy_entries = db
      .prepare('SELECT * FROM risk_taxonomy ORDER BY taxonomy_id ASC')
      .all() as any[];
  } catch {
    taxonomy_entries = [];
  }

  const taxonomy_l1 =
    taxonomy_entries.filter(t => t.level === 'L1').length > 0
      ? taxonomy_entries
          .filter(t => t.level === 'L1')
          .map(t => ({ code: t.taxonomy_id, name_ar: t.name_ar, name_en: t.name_en }))
      : [
          { code: 'L1-01', name_ar: 'الاحتيال الداخلي' },
          { code: 'L1-02', name_ar: 'الاحتيال الخارجي' },
          { code: 'L1-03', name_ar: 'ممارسات التوظيف والسلامة المهنية' },
          { code: 'L1-04', name_ar: 'العملاء والمنتجات وممارسات الأعمال' },
          { code: 'L1-05', name_ar: 'الأضرار التي تلحق بالأصول المادية' },
          { code: 'L1-06', name_ar: 'انقطاع الأعمال وتعطل الأنظمة' },
          { code: 'L1-07', name_ar: 'تنفيذ المعاملات وتسليمها وإدارة العمليات' },
        ];

  // Load official 34-entry ESG Catalogue from SQLite
  let esg_catalogue: any[] = [];
  try {
    esg_catalogue = db.prepare('SELECT * FROM esg_catalogue ORDER BY item_number ASC').all() as any[];
  } catch {
    esg_catalogue = [];
  }

  const esg_pillars = [
    { code: 'E', name_ar: 'الاستدامة البيئية والمناخية (Environmental)' },
    { code: 'S', name_ar: 'المسؤولية الاجتماعية والعدالة ببيئة العمل (Social)' },
    { code: 'G', name_ar: 'الحوكمة الضابطة الشفافة والأخلاقيات (Governance)' },
  ];

  return {
    unit: { id: unit.id, name_ar: unit.name_ar, code: unit.code },
    session_documents,
    incidents,
    audit_findings,
    baseline_risks,
    taxonomy_l1,
    taxonomy_entries,
    esg_pillars,
    esg_catalogue,
    rag_stats: {
      documents_count: session_documents.length,
      total_chunks_count: totalChunksCount,
      total_indexed_chars: totalIndexedChars,
      incidents_count: incidents.length,
      audit_findings_count: audit_findings.length,
      baseline_risks_count: baseline_risks.length,
      taxonomy_nodes_count: taxonomy_entries.length || taxonomy_l1.length,
      esg_items_count: esg_catalogue.length || 34,
    },
  };
}

const SEMANTIC_VECTOR_DIMS = 192;

function fnv1aHash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Compute a deterministic 192-dimension multilingual semantic vector encoding:
 * - Dims [0..23]: Banking & Operational Risk Concept Clusters (Arabic + English cross-lingual projection)
 * - Dims [24..191]: Hashed Arabic/English morphological stems + character 3-grams
 */
export function computeLocalMultilingualSemanticVector(text: string): number[] {
  const vec = new Array<number>(SEMANTIC_VECTOR_DIMS).fill(0);
  if (!text || !text.trim()) return vec;

  const norm = normalizeTextForRag(text);
  const { stems, bigrams } = tokenizeRagQuery(text);

  // 1. Cross-lingual concept cluster projection (Dims 0..23)
  BANKING_SYNONYM_CLUSTERS.forEach((cluster, idx) => {
    const dim = idx % 24;
    let hits = 0;
    for (const cTerm of cluster) {
      if (norm.includes(cTerm)) hits++;
    }
    if (hits > 0) {
      vec[dim] += 2.2 * Math.min(3, hits);
    }
  });

  // 2. Stem & bi-gram hashed projections (Dims 24..191)
  const bucketSize = SEMANTIC_VECTOR_DIMS - 24;
  for (const s of stems) {
    const h = fnv1aHash(s);
    const dim = 24 + (h % bucketSize);
    const sign = (h & 1) === 0 ? 1 : -1;
    vec[dim] += sign * 1.4;
  }
  for (const bg of bigrams) {
    const h = fnv1aHash(bg);
    const dim = 24 + (h % bucketSize);
    const sign = (h & 1) === 0 ? 1 : -1;
    vec[dim] += sign * 1.8;
  }

  // 3. Character 3-gram projections for Arabic morphological resilience
  const compact = norm.replace(/\s+/g, ' ');
  for (let i = 0; i <= compact.length - 3; i++) {
    const tri = compact.slice(i, i + 3);
    if (tri.trim().length < 2) continue;
    const h = fnv1aHash(tri);
    const dim = 24 + (h % bucketSize);
    const sign = (h & 1) === 0 ? 1 : -1;
    vec[dim] += sign * 0.35;
  }

  // L2 Normalize
  let normSq = 0;
  for (let i = 0; i < vec.length; i++) normSq += vec[i] * vec[i];
  const mag = Math.sqrt(normSq);
  if (mag > 0) {
    for (let i = 0; i < vec.length; i++) vec[i] /= mag;
  }
  return vec;
}

export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!vecA || !vecB || vecA.length === 0 || vecA.length !== vecB.length) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < vecA.length; i++) {
    const a = vecA[i];
    const b = vecB[i];
    dot += a * b;
    magA += a * a;
    magB += b * b;
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom > 0 ? dot / denom : 0;
}

/**
 * Reciprocal Rank Fusion (RRF): Combines BM25 lexical ranking and Dense Vector semantic ranking.
 * score(d) = 1 / (k + rank_bm25(d)) + 1 / (k + rank_vec(d))
 */
export function fuseBm25AndVectorWithRrf<T>(
  bm25Ranked: T[],
  vectorRanked: T[],
  getKey: (item: T) => string,
  k = 60
): Array<{ item: T; rrf_score: number; bm25_rank?: number; vector_rank?: number }> {
  const fused = new Map<string, { item: T; rrf_score: number; bm25_rank?: number; vector_rank?: number }>();

  bm25Ranked.forEach((item, idx) => {
    const key = getKey(item);
    const rank = idx + 1;
    const entry = fused.get(key) || { item, rrf_score: 0 };
    entry.bm25_rank = rank;
    entry.rrf_score += 1 / (k + rank);
    fused.set(key, entry);
  });

  vectorRanked.forEach((item, idx) => {
    const key = getKey(item);
    const rank = idx + 1;
    const entry = fused.get(key) || { item, rrf_score: 0 };
    entry.vector_rank = rank;
    entry.rrf_score += 1 / (k + rank);
    fused.set(key, entry);
  });

  return Array.from(fused.values()).sort((a, b) => b.rrf_score - a.rrf_score);
}

/**
 * Call Gemini `gemini-embedding-2` server-side when GEMINI_API_KEY is configured and not in unit test mode.
 */
async function embedTextsWithGemini(texts: string[]): Promise<number[][] | null> {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey || !geminiKey.trim() || process.env.NODE_ENV === 'test' || texts.length === 0) {
    return null;
  }
  try {
    const ai = new GoogleGenAI({
      apiKey: geminiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
    const result = await ai.models.embedContent({
      model: 'gemini-embedding-2',
      contents: texts.map((t) => t.slice(0, 4000)),
    });
    if (result?.embeddings && result.embeddings.length === texts.length) {
      return result.embeddings.map((e) => e.values || []);
    }
    return null;
  } catch {
    return null;
  }
}

function getChunkStoredEmbedding(chunkId: string): number[] | null {
  try {
    const row = db.prepare('SELECT embedding_json FROM document_chunks WHERE id = ?').get(chunkId) as
      | { embedding_json?: string | null }
      | undefined;
    if (row?.embedding_json) {
      const parsed = JSON.parse(row.embedding_json);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // ignore
  }
  return null;
}

function saveChunkEmbedding(chunkId: string, vec: number[]) {
  try {
    db.prepare('UPDATE document_chunks SET embedding_json = ? WHERE id = ?').run(JSON.stringify(vec), chunkId);
  } catch {
    // ignore if readonly or missing
  }
}

interface ScoredCandidate {
  key: string;
  citation: CitationReference;
  bm25Score: number;
  directLexicalMatches: number;
  rawText: string;
}

function buildBm25AndLocalCandidates(
  sessionId: string,
  unitId: string,
  query: string
): {
  bundle: RagContextBundle;
  candidates: ScoredCandidate[];
  isOpenDomainFrameworkQuery: boolean;
  isBroadFileOrAnalysisRequest: boolean;
  queryVecLocal: number[];
} {
  const bundle = assembleRagContextBundle(sessionId, unitId);
  const { rawTerms, stems, expandedSynonyms, bigrams } = tokenizeRagQuery(query);
  const normQuery = normalizeTextForRag(query);
  const queryVecLocal = computeLocalMultilingualSemanticVector(query);

  // Build corpus-wide Document Frequency (DF) for BM25 IDF weighting
  const allCorpusNormTexts: string[] = [];
  for (const doc of bundle.session_documents) {
    for (const chunk of doc.chunks) {
      allCorpusNormTexts.push(normalizeTextForRag(`${chunk.section_title || ''} ${chunk.content_text || ''}`));
    }
  }
  for (const inc of bundle.incidents) {
    allCorpusNormTexts.push(normalizeTextForRag(`${inc.event_type || ''} ${inc.description || ''} ${inc.cause || ''}`));
  }
  for (const af of bundle.audit_findings) {
    allCorpusNormTexts.push(normalizeTextForRag(`${af.title_ar || ''} ${af.details_ar || ''} ${af.corrective_action_ar || ''}`));
  }

  const totalDocsN = Math.max(1, allCorpusNormTexts.length);
  const computeIdf = (term: string): number => {
    let df = 0;
    for (const txt of allCorpusNormTexts) {
      if (txt.includes(term)) df++;
    }
    return Math.log(1 + (totalDocsN - df + 0.5) / (df + 0.5));
  };

  const stemIdfMap = new Map<string, number>();
  for (const s of stems) {
    stemIdfMap.set(s, Math.max(0.8, computeIdf(s)));
  }

  // Detect if the user is asking a purely theoretical open-domain regulatory question (e.g. Basel 3 / Three Lines of Defense)
  const isOpenDomainFrameworkQuery = Boolean(
    normQuery.match(/بازل\s*3|خطوط الدفاع الثلاث|three lines of defense/)
  );
  const isBroadFileOrAnalysisRequest = Boolean(
    normQuery.match(/ملف|مستند|داتا|بيانات|ملخص|لخص|محتوي|شوف|اقرا|فهمت|مرفوع|تحليل|استخراج|مصفوف|rcsa/)
  );

  const candidates: ScoredCandidate[] = [];

  // 1. Session document chunks
  for (const doc of bundle.session_documents) {
    for (const chunk of doc.chunks) {
      const rawText = chunk.content_text || '';
      const normText = normalizeTextForRag(`${chunk.section_title || ''} ${rawText}`);
      const lowerRaw = rawText.toLowerCase();

      let score = 0;
      let directLexicalMatches = 0;

      for (const t of rawTerms) {
        if (lowerRaw.includes(t) || normText.includes(t)) {
          const idf = stemIdfMap.get(t) ?? 1.2;
          score += 4 * idf;
          directLexicalMatches++;
        }
      }

      for (const s of stems) {
        if (normText.includes(s)) {
          const idf = stemIdfMap.get(s) ?? 1.0;
          score += 2.5 * idf;
          directLexicalMatches++;
        }
      }

      for (const bg of bigrams) {
        if (normText.includes(bg)) {
          score += 6;
        }
      }

      if (!isOpenDomainFrameworkQuery && (directLexicalMatches > 0 || expandedSynonyms.length > 0)) {
        let synMatches = 0;
        for (const syn of expandedSynonyms) {
          if (syn.length >= 3 && normText.includes(syn)) {
            synMatches++;
          }
        }
        if (directLexicalMatches > 0 && synMatches > 0) {
          score += Math.min(8, synMatches * 2.0);
        }
      }

      if (normQuery.length > 6 && normText.includes(normQuery)) {
        score += 12;
      }

      if (
        directLexicalMatches > 0 &&
        normQuery.match(/مبلغ|قيمه|خسار|مالي|جنيه|كم|عدد|نسبه|ساعه|يوم|حد/) &&
        rawText.match(/\d+/)
      ) {
        score += 3.5;
      }

      candidates.push({
        key: `CHUNK::${chunk.id}`,
        citation: {
          document_id: doc.id,
          chunk_id: chunk.id,
          title_ar: doc.title_ar,
          file_name: doc.file_name,
          section_title: chunk.section_title || `مقطع رقم ${chunk.chunk_index}`,
          quote_text: extractBestContextWindow(rawText, [...rawTerms, ...stems], 1400),
          page_number: chunk.page_number || 1,
          doc_type: doc.doc_type,
          relevance_score: Number((score > 0 ? score + 2 : 0).toFixed(2)),
        },
        bm25Score: score,
        directLexicalMatches,
        rawText: `${chunk.section_title || ''} ${rawText}`,
      });
    }
  }

  // 2. Unit historical incidents
  for (const inc of bundle.incidents) {
    const rawText = `${inc.event_type || ''} ${inc.description || ''} ${inc.cause || ''}`;
    const normText = normalizeTextForRag(rawText);
    let score = 0;
    let directLexicalMatches = 0;
    for (const s of stems) {
      if (normText.includes(s)) {
        const idf = stemIdfMap.get(s) ?? 1.0;
        score += 2.5 * idf;
        directLexicalMatches++;
      }
    }
    for (const bg of bigrams) {
      if (normText.includes(bg)) score += 5;
    }
    if (normQuery.match(/حادث|حوادث|خسار|فعلي|تاريخ/)) {
      score += 4;
      directLexicalMatches++;
    }
    candidates.push({
      key: `INCIDENT::${inc.id}`,
      citation: {
        document_id: `INCIDENT-${inc.id}`,
        title_ar: `حادث تشغيلي: ${inc.event_type || inc.id}`,
        file_name: `سجل الحوادث (${inc.id})`,
        section_title: `صافي الخسارة: ${Number(inc.loss_amount_egp || 0).toLocaleString()} ج.م`,
        quote_text: inc.description || 'حادث تشغيلي مسجل بسجل الخسائر التاريخية',
        doc_type: 'INCIDENT_LOG',
        relevance_score: Number((score > 0 ? score + 1.5 : 0).toFixed(2)),
      },
      bm25Score: score,
      directLexicalMatches,
      rawText,
    });
  }

  // 3. Unit audit findings
  for (const af of bundle.audit_findings) {
    const rawText = `${af.title_ar || ''} ${af.details_ar || ''} ${af.root_causes_ar || ''} ${af.corrective_action_ar || ''}`;
    const normText = normalizeTextForRag(rawText);
    let score = 0;
    let directLexicalMatches = 0;
    for (const s of stems) {
      if (normText.includes(s)) {
        const idf = stemIdfMap.get(s) ?? 1.0;
        score += 2.5 * idf;
        directLexicalMatches++;
      }
    }
    for (const bg of bigrams) {
      if (normText.includes(bg)) score += 5;
    }
    if (normQuery.match(/تفتيش|مراجع|ملاحظ|رقاب|فجو/)) {
      score += 4;
      directLexicalMatches++;
    }
    candidates.push({
      key: `AUDIT::${af.id}`,
      citation: {
        document_id: `AUDIT-${af.id}`,
        title_ar: `ملاحظة تفتيش: ${af.title_ar}`,
        file_name: `تقرير التفتيش الداخلي (${af.finding_number || af.id})`,
        section_title: `الأثر: ${(af.impact_ar || 'ملاحظة رقابية').slice(0, 80)}`,
        quote_text: `${af.details_ar} — الإجراء التصحيحي: ${af.corrective_action_ar}`.slice(0, 900),
        doc_type: 'AUDIT_REPORT',
        relevance_score: Number((score > 0 ? score + 1.5 : 0).toFixed(2)),
      },
      bm25Score: score,
      directLexicalMatches,
      rawText,
    });
  }

  return {
    bundle,
    candidates,
    isOpenDomainFrameworkQuery,
    isBroadFileOrAnalysisRequest,
    queryVecLocal,
  };
}

/**
 * Synchronous Hybrid BM25 IDF + Multilingual Semantic Vector + Reciprocal Rank Fusion (RRF) search.
 */
export function searchRelevantCitations(
  sessionId: string,
  unitId: string,
  query: string,
  topK = 5
): CitationReference[] {
  const {
    bundle,
    candidates,
    isOpenDomainFrameworkQuery,
    isBroadFileOrAnalysisRequest,
    queryVecLocal,
  } = buildBm25AndLocalCandidates(sessionId, unitId, query);

  if (isOpenDomainFrameworkQuery) {
    // Only return matches if explicit Basel 3 / Three Lines of Defense text exists in BM25
    const directHits = candidates
      .filter((c) => c.bm25Score > 0)
      .sort((a, b) => b.bm25Score - a.bm25Score);
    return directHits.slice(0, topK).map((c) => c.citation);
  }

  const bm25Hits = candidates
    .filter((c) => c.bm25Score > 0)
    .sort((a, b) => b.bm25Score - a.bm25Score);

  const vectorHits = candidates
    .map((c) => ({
      cand: c,
      sim: cosineSimilarity(queryVecLocal, computeLocalMultilingualSemanticVector(c.rawText)),
    }))
    .filter((v) => v.sim >= 0.34)
    .sort((a, b) => b.sim - a.sim)
    .map((v) => v.cand);

  const fused = fuseBm25AndVectorWithRrf(bm25Hits, vectorHits, (c) => c.key, 60);

  if (fused.length === 0 && bundle.session_documents.length > 0 && isBroadFileOrAnalysisRequest) {
    const fallbackCitations: CitationReference[] = [];
    for (const doc of bundle.session_documents) {
      for (const chunk of doc.chunks.slice(0, 6)) {
        fallbackCitations.push({
          document_id: doc.id,
          chunk_id: chunk.id,
          title_ar: doc.title_ar,
          file_name: doc.file_name,
          section_title: chunk.section_title || `مقطع رقم ${chunk.chunk_index}`,
          quote_text: chunk.content_text.slice(0, 1400),
          page_number: chunk.page_number || 1,
          doc_type: doc.doc_type,
          relevance_score: 1,
        });
      }
    }
    return fallbackCitations.slice(0, topK);
  }

  return fused.slice(0, topK).map((f) => ({
    ...f.item.citation,
    relevance_score: Number((f.item.citation.relevance_score || f.rrf_score * 100).toFixed(2)),
  }));
}

/**
 * Asynchronous SOTA Hybrid RAG Search:
 * Combines BM25 IDF lexical scoring + Gemini `gemini-embedding-2` (or local semantic vector fallback)
 * via Reciprocal Rank Fusion (RRF), caching document chunk vectors in SQLite.
 */
export async function searchRelevantCitationsHybrid(
  sessionId: string,
  unitId: string,
  query: string,
  topK = 5
): Promise<CitationReference[]> {
  const {
    bundle,
    candidates,
    isOpenDomainFrameworkQuery,
    isBroadFileOrAnalysisRequest,
    queryVecLocal,
  } = buildBm25AndLocalCandidates(sessionId, unitId, query);

  if (isOpenDomainFrameworkQuery) {
    const directHits = candidates
      .filter((c) => c.bm25Score > 0)
      .sort((a, b) => b.bm25Score - a.bm25Score);
    return directHits.slice(0, topK).map((c) => c.citation);
  }

  const bm25Hits = candidates
    .filter((c) => c.bm25Score > 0)
    .sort((a, b) => b.bm25Score - a.bm25Score);

  // Attempt dense cross-lingual Gemini embeddings when API key is configured in runtime
  let vectorHits: ScoredCandidate[] = [];
  const geminiQueryRes = await embedTextsWithGemini([query]);
  const queryGeminiVec = geminiQueryRes?.[0];

  if (queryGeminiVec && queryGeminiVec.length > 0) {
    const chunkCandsMissingEmb: ScoredCandidate[] = [];
    const chunkVecMap = new Map<string, number[]>();

    for (const c of candidates) {
      if (c.citation.chunk_id) {
        const cached = getChunkStoredEmbedding(c.citation.chunk_id);
        if (cached && cached.length === queryGeminiVec.length) {
          chunkVecMap.set(c.key, cached);
        } else {
          chunkCandsMissingEmb.push(c);
        }
      }
    }

    if (chunkCandsMissingEmb.length > 0) {
      const batchToEmbed = chunkCandsMissingEmb.slice(0, 24);
      const batchVectors = await embedTextsWithGemini(batchToEmbed.map((c) => c.rawText));
      if (batchVectors && batchVectors.length === batchToEmbed.length) {
        batchToEmbed.forEach((cand, idx) => {
          const vec = batchVectors[idx];
          if (vec && vec.length > 0 && cand.citation.chunk_id) {
            chunkVecMap.set(cand.key, vec);
            saveChunkEmbedding(cand.citation.chunk_id, vec);
          }
        });
      }
    }

    vectorHits = candidates
      .map((c) => {
        const docVec = chunkVecMap.get(c.key);
        const sim = docVec
          ? cosineSimilarity(queryGeminiVec, docVec)
          : cosineSimilarity(queryVecLocal, computeLocalMultilingualSemanticVector(c.rawText));
        return { cand: c, sim };
      })
      .filter((v) => v.sim >= 0.42)
      .sort((a, b) => b.sim - a.sim)
      .map((v) => v.cand);
  } else {
    vectorHits = candidates
      .map((c) => ({
        cand: c,
        sim: cosineSimilarity(queryVecLocal, computeLocalMultilingualSemanticVector(c.rawText)),
      }))
      .filter((v) => v.sim >= 0.34)
      .sort((a, b) => b.sim - a.sim)
      .map((v) => v.cand);
  }

  const fused = fuseBm25AndVectorWithRrf(bm25Hits, vectorHits, (c) => c.key, 60);

  if (fused.length === 0 && bundle.session_documents.length > 0 && isBroadFileOrAnalysisRequest) {
    const fallbackCitations: CitationReference[] = [];
    for (const doc of bundle.session_documents) {
      for (const chunk of doc.chunks.slice(0, 6)) {
        fallbackCitations.push({
          document_id: doc.id,
          chunk_id: chunk.id,
          title_ar: doc.title_ar,
          file_name: doc.file_name,
          section_title: chunk.section_title || `مقطع رقم ${chunk.chunk_index}`,
          quote_text: chunk.content_text.slice(0, 1400),
          page_number: chunk.page_number || 1,
          doc_type: doc.doc_type,
          relevance_score: 1,
        });
      }
    }
    return fallbackCitations.slice(0, topK);
  }

  return fused.slice(0, topK).map((f) => ({
    ...f.item.citation,
    relevance_score: Number((f.item.citation.relevance_score || f.rrf_score * 100).toFixed(2)),
  }));
}

/**
 * Match any operational risk / procedure text against the authoritative 84-row CBE/NBE Risk Taxonomy (L1/L2/L3)
 * and 34-row ESG Catalogue in SQLite.
 */
export function matchBestTaxonomyAndEsg(
  text: string,
  bundle: RagContextBundle
): {
  taxonomy_l1_id: string;
  taxonomy_l1_ar: string;
  taxonomy_l2_id: string;
  taxonomy_l2_ar: string;
  taxonomy_l3_id: string;
  taxonomy_l3_ar: string;
  taxonomy_rationale_ar: string;
  esg_pillar: string;
  esg_code: 'E' | 'S' | 'G';
  esg_pathway_ar: string;
  esg_catalogue_item?: string;
  esg_catalogue_id?: number;
} {
  const { stems } = tokenizeRagQuery(text);
  const norm = normalizeTextForRag(text);

  const NBE_L1_LABELS: Record<string, string> = {
    'L1-01': '1_ احتيال داخلي',
    'L1-02': '2_ احتيال خارجي',
    'L1-03': '3_وسائل الاحتيال على البطاقات',
    'L1-04': '4_ممارسات العاملين وسلامة بيئة العمل',
    'L1-05': '5_الممارسات الخاطئة في حق عملاء البنك',
    'L1-06': '6_أضرار بأصول البنك',
    'L1-07': '7_الأنظمة و التطبيقات',
    'L1-08': '8_تنفيذ العمليات المصرفية',
  };

  // Score L3 rows from official risk_taxonomy table
  const l3Rows = (bundle.taxonomy_entries || []).filter(r => r.level === 'L3');
  let bestL3: any = null;
  let bestScore = -1;

  for (const row of l3Rows) {
    const rowNorm = normalizeTextForRag(`${row.l1_ar || ''} ${row.l2_ar || ''} ${row.l3_ar || ''} ${row.name_ar || ''} ${row.name_en || ''}`);
    let score = 0;
    for (const s of stems) {
      if (s.length >= 3 && rowNorm.includes(s)) score += 3;
    }
    // Domain keyword rules aligned with official NBE 8-category Basel taxonomy (Methodology Page 7)
    if (norm.match(/احتيال داخلي|اختلاس|رشوه|تواطؤ موظف/) && row.l1_id === 'L1-01') score += 12;
    if (norm.match(/احتيال خارجي|احتيال|تزوير|سرق|انتحال|callback|مستندات مزور/) && row.l1_id === 'L1-02') score += 12;
    if (norm.match(/بطاقات ائتمان|بطاقه|credit card/) && row.l1_id === 'L1-03') score += 12;
    if (norm.match(/موظف|سلامه مهنيه|توظيف|قانون العمل/) && row.l1_id === 'L1-04') score += 10;
    if (norm.match(/غسل|اموال|حظر|عقوبات|sanction|ofac|aml|kyc|امتثال|تجميد|فك تجميد|حقوق عملاء/) && row.l1_id === 'L1-05') score += 12;
    if (norm.match(/حريق|سيول|اصول ماديه|كوارث طبيعيه|مباني/) && row.l1_id === 'L1-06') score += 10;
    if (norm.match(/توقف النظام|انقطاع الشبكه|عطل فني|برمجيات|تعطل الانظمه|ماكينات pos/) && row.l1_id === 'L1-07') score += 10;
    if (norm.match(/قيد|تسوي|ادخال|معامل|تحويل|حوال|سويفت|مقاصه|نوسترو|الاستاذ العام|مراجع|توقيع|مستند|ارشيف|ارشف|تاخير|اغفال|استفسار/) && row.l1_id === 'L1-08') score += 12;

    if (score > bestScore) {
      bestScore = score;
      bestL3 = row;
    }
  }

  // Score ESG catalogue rows
  let bestEsg: any = null;
  let bestEsgScore = 0;
  for (const esg of bundle.esg_catalogue || []) {
    const esgNorm = normalizeTextForRag(`${esg.risk_name_ar || ''} ${esg.cbe_l1_ar || ''} ${esg.cbe_l2_ar || ''}`);
    let score = 0;
    for (const s of stems) {
      if (s.length >= 3 && esgNorm.includes(s)) score += 2.5;
    }
    if (bestL3 && esg.cbe_l1_ar && normalizeTextForRag(bestL3.l1_ar || '').includes(normalizeTextForRag(esg.cbe_l1_ar).slice(0, 8))) {
      score += 4;
    }
    if (score > bestEsgScore) {
      bestEsgScore = score;
      bestEsg = esg;
    }
  }

  const esgDriver: 'E' | 'S' | 'G' =
    bestEsg?.esg_driver ||
    (norm.match(/بيئ|مناخ|طاقه|انبعاث|كربون|نفايات/)
      ? 'E'
      : norm.match(/عملاء|شكاو|موظف|سلامه|مجتمع|تمويل مستدام|خصوصيه/)
        ? 'S'
        : 'G');

  const esgPillarLabel =
    esgDriver === 'E'
      ? 'E (الاستدامة البيئية والمناخية)'
      : esgDriver === 'S'
        ? 'S (المسؤولية الاجتماعية وحماية المتعاملين)'
        : 'G (حوكمة العمليات المصرفية والرقابة الداخلية)';

  const esgPathway = bestEsg
    ? `[${bestEsg.esg_id}] ${bestEsg.risk_name_ar} (${bestEsg.cbe_l1_ar} ← ${bestEsg.cbe_l2_ar})`
    : esgDriver === 'E'
      ? 'مسار إدارة البصمة البيئية وكفاءة الموارد التشغيلية (Environmental)'
      : esgDriver === 'S'
        ? 'مسار جودة الخدمة المصرفية وحماية حقوق العملاء وبيئة العمل (Social)'
        : 'مسار الحوكمة المصرفية والالتزام بالضوابط الرقابية والشفافية (Governance)';

  if (bestL3 && bestScore > 0) {
    const resolvedL1Id = bestL3.l1_id || 'L1-08';
    const officialL1Ar = NBE_L1_LABELS[resolvedL1Id] || bestL3.l1_ar || '8_تنفيذ العمليات المصرفية';
    const defaultCatByL1: Record<string, { id: number; pillar: 'E' | 'S' | 'G' }> = {
      'L1-01': { id: 31, pillar: 'G' },
      'L1-02': { id: 33, pillar: 'G' },
      'L1-03': { id: 33, pillar: 'G' },
      'L1-04': { id: 24, pillar: 'S' },
      'L1-05': { id: 30, pillar: 'G' },
      'L1-06': { id: 16, pillar: 'E' },
      'L1-07': { id: 18, pillar: 'E' },
      'L1-08': { id: 32, pillar: 'G' },
    };
    const l1Fallback = defaultCatByL1[resolvedL1Id] || { id: 32, pillar: 'G' as const };
    const matchedCatalogueId = Number(bestEsg?.item_number || l1Fallback.id);
    return {
      taxonomy_l1_id: resolvedL1Id,
      taxonomy_l1_ar: officialL1Ar,
      taxonomy_l2_id: bestL3.l2_id || 'L2-08-01',
      taxonomy_l2_ar: bestL3.l2_ar || 'تسجيل المعاملات وتنفيذها وصيانتها',
      taxonomy_l3_id: bestL3.l3_id || bestL3.taxonomy_id || 'L3-08-01-02',
      taxonomy_l3_ar: bestL3.l3_ar || bestL3.name_ar || 'أخطاء إدخال البيانات أو تحميلها',
      taxonomy_rationale_ar: `تم الربط وفق هيكل تصنيف المخاطر التشغيلية المعتمد بالبنك (${officialL1Ar} ← ${bestL3.l2_ar || 'تسجيل المعاملات وتنفيذها وصيانتها'} ← ${bestL3.l3_ar || bestL3.name_ar}).`,
      esg_pillar: esgPillarLabel,
      esg_code: bestEsg?.esg_driver || l1Fallback.pillar || esgDriver,
      esg_pathway_ar: esgPathway,
      esg_catalogue_item: bestEsg?.risk_name_ar,
      esg_catalogue_id: matchedCatalogueId,
    };
  }

  return {
    taxonomy_l1_id: 'L1-08',
    taxonomy_l1_ar: '8_تنفيذ العمليات المصرفية',
    taxonomy_l2_id: 'L2-08-01',
    taxonomy_l2_ar: 'تسجيل المعاملات وتنفيذها وصيانتها',
    taxonomy_l3_id: 'L3-08-01-02',
    taxonomy_l3_ar: 'أخطاء إدخال البيانات أو تحميلها',
    taxonomy_rationale_ar: 'التصنيف المعتمد وفق كتالوج مخاطر التشغيل المصرفية (8_تنفيذ العمليات المصرفية).',
    esg_pillar: 'G (حوكمة العمليات المصرفية والرقابة الداخلية)',
    esg_code: 'G' as const,
    esg_pathway_ar: '[32] ضعف حوكمة العمليات والرقابة والتقارير الرقابية (L1-08)',
    esg_catalogue_item: 'ضعف حوكمة العمليات والرقابة والتقارير الرقابية',
    esg_catalogue_id: 32,
  };
}
