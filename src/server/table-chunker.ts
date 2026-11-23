export type DocumentChunkKind = 'TABLE' | 'VISION_OCR' | 'PROSE';

export interface StructuredDocumentChunk {
  chunk_index: number;
  section_title: string;
  content_text: string;
  page_number: number;
  chunk_kind: DocumentChunkKind;
  table_rows_count: number;
}

export function countMarkdownTablesInText(text: string): number {
  if (!text) return 0;
  const matches = text.match(/^\|.+\|\s*\n\|(?:\s*:?-{2,}:?\s*\|)+/gm);
  return matches ? matches.length : 0;
}

function isMarkdownTableRow(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.split('|').length >= 3;
}

function isMarkdownSeparatorRow(line: string): boolean {
  const trimmed = line.trim();
  return /^\|(?:\s*:?-{2,}:?\s*\|)+$/.test(trimmed);
}

/**
 * V5 Table-Aware Document Chunker:
 * - Preserves contiguous Markdown tables (`| col1 | col2 |` + `| --- | --- |`) intact in single chunks.
 * - Splits oversized tables across row boundaries while REPEATING header + separator rows so column meaning is never lost.
 * - Tracks [PDF page N], [Vision Page N], [Slide N], and section headings accurately.
 */
export function chunkExtractedDocumentText(
  rawText: string,
  safeFileName: string,
  options?: {
    maxTableChunkChars?: number;
    maxProseChunkChars?: number;
    maxChunks?: number;
  }
): StructuredDocumentChunk[] {
  if (!rawText || !rawText.trim()) return [];

  const maxTableChars = options?.maxTableChunkChars ?? 1800;
  const maxProseChars = options?.maxProseChunkChars ?? 1100;
  const maxChunks = options?.maxChunks ?? 350;

  const cleanedText = rawText.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');
  const lines = cleanedText.split(/\r?\n/);

  const chunks: StructuredDocumentChunk[] = [];
  let currentPage = 1;
  let currentSection = '';
  let currentVisionPage = false;

  const pushChunk = (
    body: string,
    kind: DocumentChunkKind,
    overrideBracketSection?: string,
    tableRowsCount = 0
  ) => {
    const cleanBody = body.trim();
    if (cleanBody.length <= 2 || chunks.length >= maxChunks) return;

    const seq = chunks.length + 1;
    const prefixTag =
      kind === 'TABLE' ? 'جدول مهيكل · ' : kind === 'VISION_OCR' ? 'تحليل بصري · ' : '';

    const sectionLabel = overrideBracketSection
      ? `${prefixTag}${overrideBracketSection} — ${safeFileName}`
      : currentSection
        ? `${prefixTag}${currentSection} (صفحة ${currentPage})`
        : `${prefixTag}صفحة ${currentPage} • مقطع (${seq})`;

    chunks.push({
      chunk_index: seq,
      section_title: sectionLabel,
      content_text: cleanBody,
      page_number: currentPage,
      chunk_kind: kind,
      table_rows_count: tableRowsCount,
    });
  };

  let proseBuffer: string[] = [];
  let proseBracketOverride: string | undefined;

  const flushProseBuffer = () => {
    if (proseBuffer.length === 0) return;
    const body = proseBuffer.join('\n').trim();
    proseBuffer = [];
    const override = proseBracketOverride;
    proseBracketOverride = undefined;
    if (body.length > 2) {
      pushChunk(body, currentVisionPage ? 'VISION_OCR' : 'PROSE', override, 0);
    }
  };

  let i = 0;
  while (i < lines.length && chunks.length < maxChunks) {
    const rawLine = lines[i];
    const line = rawLine.trim();

    if (!line) {
      // Blank line ends current prose block
      flushProseBuffer();
      i += 1;
      continue;
    }

    // Check page / vision markers
    const pageMatch = line.match(/^\[(?:PDF page|Vision Page|Slide)\s+(\d+)\]\s*(.*)$/i);
    if (pageMatch) {
      flushProseBuffer();
      currentPage = parseInt(pageMatch[1], 10) || currentPage;
      currentVisionPage = /^\[Vision Page/i.test(line);
      const remainder = pageMatch[2]?.trim();
      if (remainder) {
        proseBuffer.push(remainder);
      }
      i += 1;
      continue;
    }

    // Standalone bracket heading like [xl/worksheets/sheet1.xml] or [مخطط عمليات]
    const bracketMatch = line.match(/^\[([^\]]+)\]\s*(.*)$/);
    if (bracketMatch && !bracketMatch[2]?.trim()) {
      flushProseBuffer();
      currentSection = bracketMatch[1].trim();
      i += 1;
      continue;
    }

    // Detect contiguous Markdown table block
    if (isMarkdownTableRow(line)) {
      flushProseBuffer();
      const tableLines: string[] = [];
      while (i < lines.length && isMarkdownTableRow(lines[i])) {
        tableLines.push(lines[i].trim());
        i += 1;
      }

      const hasHeaderSep = tableLines.length >= 2 && isMarkdownSeparatorRow(tableLines[1]);
      const headerPair = hasHeaderSep ? [tableLines[0], tableLines[1]] : [];
      const dataRows = hasHeaderSep ? tableLines.slice(2) : tableLines;

      if (tableLines.join('\n').length <= maxTableChars || dataRows.length === 0) {
        pushChunk(tableLines.join('\n'), 'TABLE', undefined, dataRows.length || tableLines.length);
      } else {
        // Split large tables while repeating header + separator in every sub-chunk
        let batch: string[] = [...headerPair];
        let batchRows = 0;
        for (const r of dataRows) {
          const projectedLen = batch.join('\n').length + r.length + 1;
          if (projectedLen > maxTableChars && batchRows > 0) {
            pushChunk(batch.join('\n'), 'TABLE', undefined, batchRows);
            batch = [...headerPair];
            batchRows = 0;
          }
          batch.push(r);
          batchRows += 1;
        }
        if (batchRows > 0) {
          pushChunk(batch.join('\n'), 'TABLE', undefined, batchRows);
        }
      }
      continue;
    }

    // Track numbered headings inside document
    const effectiveLine = bracketMatch?.[2]?.trim() || line;
    const headingPrefix = effectiveLine.match(/^(\d+(?:\.\d+)*\.?\s+[^•:\n]{5,90})(?:\s|$)/);
    if (headingPrefix && !effectiveLine.startsWith('•') && !effectiveLine.includes('|')) {
      const candidateHeading = headingPrefix[1].replace(/\s+/g, ' ').trim().slice(0, 80);
      if (candidateHeading.length >= 6) {
        flushProseBuffer();
        currentSection = candidateHeading;
      }
    }

    if (bracketMatch?.[1]) {
      flushProseBuffer();
      proseBracketOverride = bracketMatch[1];
    }

    const projectedProseLen = proseBuffer.join('\n').length + effectiveLine.length + 1;
    if (proseBuffer.length > 0 && projectedProseLen > maxProseChars) {
      flushProseBuffer();
    }

    proseBuffer.push(effectiveLine);
    i += 1;
  }

  flushProseBuffer();
  return chunks;
}
