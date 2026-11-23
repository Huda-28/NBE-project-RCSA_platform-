import React from 'react';

interface RichChunkContentProps {
  text?: string | null;
  className?: string;
}

/**
 * Renders chunk text containing prose and Markdown table blocks (`| col1 | col2 |`)
 * as clean styled HTML tables for RAG inspectors and Guided Wizard step 3 previews.
 */
export const RichChunkContent: React.FC<RichChunkContentProps> = ({ text, className = '' }) => {
  if (!text) return null;

  const lines = text.split(/\r?\n/);
  const blocks: Array<{ type: 'table'; rows: string[][] } | { type: 'text'; text: string }> = [];

  let i = 0;
  let textBuffer: string[] = [];

  const flushText = () => {
    const joined = textBuffer.join('\n').trim();
    if (joined) {
      blocks.push({ type: 'text', text: joined });
    }
    textBuffer = [];
  };

  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.split('|').length >= 3) {
      flushText();
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
        blocks.push({ type: 'table', rows: parsedRows });
      }
      continue;
    }

    textBuffer.push(lines[i]);
    i++;
  }
  flushText();

  return (
    <div className={`space-y-2 ${className}`}>
      {blocks.map((block, idx) => {
        if (block.type === 'text') {
          return (
            <p key={`txt-${idx}`} className="text-slate-800 leading-relaxed whitespace-pre-wrap">
              {block.text}
            </p>
          );
        }

        const [headerRow, ...bodyRows] = block.rows;
        return (
          <div key={`tbl-${idx}`} className="overflow-x-auto rounded-lg border border-[#DCDAD5] bg-white">
            <table className="w-full text-[11px] text-right border-collapse">
              <thead className="bg-[#09331F] text-white">
                <tr>
                  {headerRow.map((hCell, cIdx) => (
                    <th key={cIdx} className="px-2.5 py-1.5 font-bold border-b border-[#006547] text-right">
                      {hCell}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EFECE6] text-slate-900">
                {bodyRows.map((bRow, rIdx) => (
                  <tr key={rIdx} className="odd:bg-white even:bg-[#F8F8F6]">
                    {bRow.map((bCell, cIdx) => (
                      <td key={cIdx} className="px-2.5 py-1.5 align-top leading-relaxed">
                        {bCell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
};
