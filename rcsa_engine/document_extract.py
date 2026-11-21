"""Deterministic text extraction for supporting RCSA documents, not AI interpretation.

Returns bounded textual source excerpts. Never infers a risk, a control, an incident,
or a financial input. For scanned PDFs and unsupported files, reports MANUAL_REQUIRED.
"""
from __future__ import annotations
import argparse
import json
import logging
from pathlib import Path
import sys
import zipfile
import xml.etree.ElementTree as ET

MAX_CHARS = 120_000
MAX_BYTES = 6 * 1024 * 1024
MAX_UNCOMPRESSED_MEMBER = 16 * 1024 * 1024
NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
WORD_NS = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'


def _zip_member(z: zipfile.ZipFile, name: str) -> bytes:
    info = z.getinfo(name)
    if info.file_size > MAX_UNCOMPRESSED_MEMBER:
        raise ValueError('Spreadsheet/document component exceeds safe extraction limit')
    return z.read(name)


def extract_docx(path: Path) -> str:
    with zipfile.ZipFile(path) as z:
        root = ET.fromstring(_zip_member(z, 'word/document.xml'))
        paras = []
        for paragraph in root.iter(WORD_NS + 'p'):
            text = ''.join(node.text or '' for node in paragraph.iter(WORD_NS + 't')).strip()
            if text:
                paras.append(text)
            if sum(len(x) for x in paras) >= MAX_CHARS:
                break
        return '\n'.join(paras)[:MAX_CHARS]


def extract_xlsx(path: Path) -> str:
    pieces: list[str] = []
    with zipfile.ZipFile(path) as z:
        shared: list[str] = []
        if 'xl/sharedStrings.xml' in z.namelist():
            strings = ET.fromstring(_zip_member(z, 'xl/sharedStrings.xml'))
            for si in strings.findall(NS + 'si'):
                shared.append(''.join(t.text or '' for t in si.iter(NS + 't')))
        sheets = sorted((n for n in z.namelist()
                         if n.startswith('xl/worksheets/sheet') and n.endswith('.xml')))
        for sheet_name in sheets[:8]:
            pieces.append(f'[{sheet_name}]')
            root = ET.fromstring(_zip_member(z, sheet_name))
            for row in list(root.iter(NS + 'row'))[:2000]:
                values = []
                for cell in list(row.findall(NS + 'c'))[:45]:
                    v = cell.find(NS + 'v')
                    if cell.attrib.get('t') == 'inlineStr':
                        inline = cell.find(NS + 'is')
                        txt = ''.join(t.text or '' for t in inline.iter(NS + 't')) if inline is not None else ''
                    elif v is not None and v.text is not None:
                        txt = shared[int(v.text)] if cell.attrib.get('t') == 's' and int(v.text) < len(shared) else v.text
                    else:
                        txt = ''
                    if txt.strip():
                        values.append(f'{cell.attrib.get("r", "")}: {txt.strip()}')
                if values:
                    pieces.append(' | '.join(values))
                if sum(map(len, pieces)) >= MAX_CHARS:
                    return '\n'.join(pieces)[:MAX_CHARS]
    return '\n'.join(pieces)[:MAX_CHARS]


def extract_pdf(path: Path) -> str:
    try:
        from pypdf import PdfReader
    except ImportError:
        raise RuntimeError('PDF text extraction requires the lightweight pypdf package')
    logging.getLogger('pypdf').setLevel(logging.CRITICAL)
    reader = PdfReader(str(path), strict=False)
    if reader.is_encrypted:
        raise ValueError('Encrypted PDF cannot be extracted without authorization')
    pieces = []
    for index, page in enumerate(reader.pages[:80], 1):
        txt = (page.extract_text() or '').strip()
        if txt:
            pieces.append(f'[PDF page {index}]\n{txt}')
        if sum(map(len, pieces)) >= MAX_CHARS:
            break
    return '\n'.join(pieces)[:MAX_CHARS]


def extract(path: str) -> dict:
    file = Path(path)
    if not file.is_file():
        raise ValueError('Uploaded document not found')
    if file.stat().st_size > MAX_BYTES:
        raise ValueError('Uploaded document exceeds 6 MB size limit')
    ext = file.suffix.lower()
    try:
        if ext == '.pdf':
            text = extract_pdf(file)
        elif ext == '.docx':
            text = extract_docx(file)
        elif ext == '.xlsx':
            text = extract_xlsx(file)
        elif ext in ('.txt', '.md', '.csv', '.json'):
            text = file.read_text(encoding='utf-8-sig', errors='replace')[:MAX_CHARS]
        else:
            return {'status': 'MANUAL_REQUIRED', 'text': '', 'reason': 'Unsupported document type'}
    except Exception as exc:
        return {'status': 'MANUAL_REQUIRED', 'text': '', 'reason': str(exc)[:300]}
    if not text.strip():
        return {'status': 'MANUAL_REQUIRED', 'text': '', 'reason': 'No selectable text found; scanned/empty file requires review'}
    return {'status': 'EXTRACTED', 'text': text, 'chars': len(text)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--path', required=True)
    args = parser.parse_args()
    print(json.dumps(extract(args.path), ensure_ascii=False))

if __name__ == '__main__':
    main()
