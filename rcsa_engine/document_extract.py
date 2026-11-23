"""Deterministic text, table-layout, and embedded-image extraction for supporting RCSA documents.

Supports PDF (CMap Arabic + multi-column Markdown table reconstruction + embedded image detection),
DOCX (paragraphs + Markdown tables), XLSX (worksheets + tabular rows), PPTX (slides),
CSV/TSV (header-mapped rows), JSON, XML, HTML (Markdown tables), RTF, YAML, Markdown,
TXT, LOG, ZIP bundles, and valid Image files (reported as VISION_REQUIRED for multimodal VLM).
For corrupt or unparseable files, reports MANUAL_REQUIRED.
"""
from __future__ import annotations
import argparse
import binascii
import csv
import io
import json
import logging
from pathlib import Path
import re
import struct
import sys
import zipfile
import zlib
import xml.etree.ElementTree as ET

MAX_CHARS = 120_000
MAX_BYTES = 6 * 1024 * 1024
MAX_UNCOMPRESSED_MEMBER = 16 * 1024 * 1024
NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
WORD_NS = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
PPT_NS = '{http://schemas.openxmlformats.org/drawingml/2006/main}'


def _read_text_with_arabic_fallback(raw_bytes: bytes) -> str:
    for enc in ('utf-8-sig', 'utf-8', 'cp1256', 'windows-1256', 'iso-8859-6', 'latin-1'):
        try:
            return raw_bytes.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw_bytes.decode('utf-8', errors='replace')


def _zip_member(z: zipfile.ZipFile, name: str) -> bytes:
    info = z.getinfo(name)
    if info.file_size > MAX_UNCOMPRESSED_MEMBER:
        raise ValueError('Spreadsheet/document component exceeds safe extraction limit')
    return z.read(name)


IMAGE_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.webp', '.bmp', '.tif', '.tiff'}


def _detect_valid_image_mime(raw: bytes, ext: str) -> str | None:
    if len(raw) < 12:
        return None
    if ext == '.png' and raw.startswith(b'\x89PNG\r\n\x1a\n'):
        return 'image/png'
    if ext in ('.jpg', '.jpeg') and raw.startswith(b'\xff\xd8\xff'):
        return 'image/jpeg'
    if ext == '.webp' and raw.startswith(b'RIFF') and raw[8:12] == b'WEBP':
        return 'image/webp'
    if ext == '.bmp' and raw.startswith(b'BM') and len(raw) >= 26:
        return 'image/bmp'
    if ext in ('.tif', '.tiff') and (raw.startswith(b'II*\x00') or raw.startswith(b'MM\x00*')):
        return 'image/tiff'
    return None


def _encode_png_rgb_or_gray(width: int, height: int, channels: int, pixel_bytes: bytes) -> bytes | None:
    if width <= 0 or height <= 0 or width > 6000 or height > 6000 or channels not in (1, 3):
        return None
    row_bytes = width * channels
    if len(pixel_bytes) < row_bytes * height:
        return None

    raw_scanlines = bytearray()
    for r in range(height):
        raw_scanlines.append(0)
        start = r * row_bytes
        raw_scanlines.extend(pixel_bytes[start:start + row_bytes])

    def _chunk(chunk_type: bytes, data: bytes) -> bytes:
        crc = binascii.crc32(chunk_type + data) & 0xFFFFFFFF
        return struct.pack('>I', len(data)) + chunk_type + data + struct.pack('>I', crc)

    color_type = 2 if channels == 3 else 0
    ihdr = struct.pack('>IIBBBBB', width, height, 8, color_type, 0, 0, 0)
    idat = zlib.compress(bytes(raw_scanlines), level=6)
    return b'\x89PNG\r\n\x1a\n' + _chunk(b'IHDR', ihdr) + _chunk(b'IDAT', idat) + _chunk(b'IEND', b'')


def _format_markdown_table(rows: list[list[str]]) -> list[str]:
    clean_rows = [[re.sub(r'\s+', ' ', c.replace('|', '/')).strip() for c in row] for row in rows if any(c.strip() for c in row)]
    if not clean_rows:
        return []
    col_count = max(len(r) for r in clean_rows)
    if col_count < 2:
        return [' '.join(r).strip() for r in clean_rows if any(r)]
    padded = [r + [''] * (col_count - len(r)) for r in clean_rows]
    lines = ['| ' + ' | '.join(padded[0]) + ' |']
    if len(padded) >= 2:
        lines.append('| ' + ' | '.join(['---'] * col_count) + ' |')
        for r in padded[1:]:
            lines.append('| ' + ' | '.join(r) + ' |')
    return lines


def extract_docx(path: Path) -> str:
    with zipfile.ZipFile(path) as z:
        root = ET.fromstring(_zip_member(z, 'word/document.xml'))
        pieces: list[str] = []
        body = root.find(WORD_NS + 'body')
        target = body if body is not None else root

        for elem in target:
            if elem.tag == WORD_NS + 'p':
                text = ''.join(node.text or '' for node in elem.iter(WORD_NS + 't')).strip()
                if text:
                    pieces.append(text)
            elif elem.tag == WORD_NS + 'tbl':
                tbl_rows: list[list[str]] = []
                for tr in elem.iter(WORD_NS + 'tr'):
                    cells = []
                    for tc in tr.findall(WORD_NS + 'tc'):
                        cell_txt = ' '.join(
                            ''.join(n.text or '' for n in p.iter(WORD_NS + 't')).strip()
                            for p in tc.iter(WORD_NS + 'p')
                        ).strip()
                        cells.append(cell_txt)
                    if any(cells):
                        tbl_rows.append(cells)
                if tbl_rows:
                    pieces.extend(_format_markdown_table(tbl_rows))
            if sum(len(x) for x in pieces) >= MAX_CHARS:
                break

        if not pieces:
            for paragraph in root.iter(WORD_NS + 'p'):
                text = ''.join(node.text or '' for node in paragraph.iter(WORD_NS + 't')).strip()
                if text:
                    pieces.append(text)
                if sum(len(x) for x in pieces) >= MAX_CHARS:
                    break

        return '\n'.join(pieces)[:MAX_CHARS]


def extract_pptx(path: Path) -> str:
    pieces: list[str] = []
    with zipfile.ZipFile(path) as z:
        slides = sorted(
            n for n in z.namelist()
            if n.startswith('ppt/slides/slide') and n.endswith('.xml')
        )
        for idx, slide_name in enumerate(slides[:60], 1):
            root = ET.fromstring(_zip_member(z, slide_name))
            texts = [t.text.strip() for t in root.iter(PPT_NS + 't') if t.text and t.text.strip()]
            if texts:
                pieces.append(f'[Slide {idx}]\n' + '\n'.join(texts))
            if sum(len(x) for x in pieces) >= MAX_CHARS:
                break
    return '\n'.join(pieces)[:MAX_CHARS]


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
            headers_by_col: dict[str, str] = {}
            for row_idx, row in enumerate(list(root.iter(NS + 'row'))[:2000]):
                values = []
                for cell in list(row.findall(NS + 'c'))[:45]:
                    ref = cell.attrib.get('r', '')
                    col_letters = re.sub(r'[0-9]+', '', ref)
                    v = cell.find(NS + 'v')
                    if cell.attrib.get('t') == 'inlineStr':
                        inline = cell.find(NS + 'is')
                        txt = ''.join(t.text or '' for t in inline.iter(NS + 't')) if inline is not None else ''
                    elif v is not None and v.text is not None:
                        txt = shared[int(v.text)] if cell.attrib.get('t') == 's' and int(v.text) < len(shared) else v.text
                    else:
                        txt = ''
                    clean_txt = txt.strip()
                    if clean_txt:
                        if row_idx == 0 and col_letters:
                            headers_by_col[col_letters] = clean_txt
                        hdr = headers_by_col.get(col_letters)
                        if hdr and row_idx > 0 and hdr != clean_txt:
                            values.append(f'{ref} ({hdr}): {clean_txt}')
                        else:
                            values.append(f'{ref}: {clean_txt}')
                if values:
                    pieces.append(' | '.join(values))
                if sum(map(len, pieces)) >= MAX_CHARS:
                    return '\n'.join(pieces)[:MAX_CHARS]
    return '\n'.join(pieces)[:MAX_CHARS]


_ARABIC_CODEPOINTS = (
    set(range(0x0600, 0x06FF + 1))
    | set(range(0x0750, 0x077F + 1))
    | set(range(0xFB50, 0xFDFF + 1))
    | set(range(0xFE70, 0xFEFF + 1))
)

_MIRROR_BRACKETS = {
    '(': ')',
    ')': '(',
    '[': ']',
    ']': '[',
    '{': '}',
    '}': '{',
    '<': '>',
    '>': '<',
}


def _is_arabic_char(ch: str) -> bool:
    return bool(ch) and ord(ch) in _ARABIC_CODEPOINTS


def _strip_control_chars(text: str) -> str:
    return re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', text)


def _is_meaningful_extracted_line(text: str) -> bool:
    cleaned = _strip_control_chars(text).strip()
    if len(cleaned) < 2:
        return False
    printable_words = sum(1 for ch in cleaned if ch.isalnum() or _is_arabic_char(ch))
    if printable_words == 0:
        return False
    non_space = sum(1 for ch in cleaned if not ch.isspace())
    if non_space >= 8 and (printable_words / non_space) < 0.35:
        return False
    return True


def _parse_tounicode_cmap(cmap_bytes: bytes) -> dict[bytes, str]:
    text = cmap_bytes.decode('latin-1', errors='ignore')
    mapping: dict[bytes, str] = {}

    def _decode_utf16_hex(h: str) -> str:
        if len(h) % 2 != 0:
            h = '0' + h
        b = bytes.fromhex(h)
        if len(b) == 1:
            return chr(b[0])
        if len(b) % 2 == 0:
            return b.decode('utf-16-be', errors='ignore')
        return b.decode('latin-1', errors='ignore')

    for blk in re.finditer(r'beginbfchar\s*(.*?)\s*endbfchar', text, re.DOTALL):
        for pair in re.finditer(r'<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>', blk.group(1)):
            s_hex = pair.group(1)
            if len(s_hex) % 2 != 0:
                s_hex = '0' + s_hex
            src = bytes.fromhex(s_hex)
            dst = _decode_utf16_hex(pair.group(2))
            if dst:
                mapping[src] = dst

    for blk in re.finditer(r'beginbfrange\s*(.*?)\s*endbfrange', text, re.DOTALL):
        body = blk.group(1)
        pos = 0
        while pos < len(body):
            m_arr = re.match(
                r'\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*\[(.*?)\]',
                body[pos:],
                re.DOTALL,
            )
            if m_arr:
                s_hex, e_hex, arr_txt = m_arr.group(1), m_arr.group(2), m_arr.group(3)
                width = max(1, (len(s_hex) + 1) // 2)
                start_i, end_i = int(s_hex, 16), int(e_hex, 16)
                for offset, th in enumerate(re.findall(r'<([0-9A-Fa-f]+)>', arr_txt)):
                    if start_i + offset <= end_i:
                        dst = _decode_utf16_hex(th)
                        if dst:
                            mapping[(start_i + offset).to_bytes(width, 'big')] = dst
                pos += m_arr.end()
                continue

            m_rng = re.match(
                r'\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>',
                body[pos:],
            )
            if m_rng:
                s_hex, e_hex, d_hex = m_rng.group(1), m_rng.group(2), m_rng.group(3)
                width = max(1, (len(s_hex) + 1) // 2)
                start_i, end_i, base_cp = int(s_hex, 16), int(e_hex, 16), int(d_hex, 16)
                for offset in range(min(max(0, end_i - start_i + 1), 2048)):
                    cp = base_cp + offset
                    if cp <= 0x10FFFF:
                        mapping[(start_i + offset).to_bytes(width, 'big')] = chr(cp)
                pos += m_rng.end()
                continue

            pos += 1

    return mapping


def _extract_pdf_stdlib(path: Path) -> str:
    import unicodedata

    raw = path.read_bytes()
    if not raw.startswith(b'%PDF-'):
        raise ValueError('Invalid PDF header')

    obj_map: dict[int, bytes] = {}
    for m in re.finditer(rb'(\d+)\s+(\d+)\s+obj\b(.*?)\bendobj', raw, re.DOTALL):
        obj_map[int(m.group(1))] = m.group(3)

    def _extract_stream(body: bytes) -> tuple[bytes, bytes]:
        sm = re.search(rb'stream[\r\n]+(.*?)[\r\n]*endstream', body, re.DOTALL)
        if not sm:
            return body, b''
        dict_b, st_b = body[:sm.start()], sm.group(1)
        data = st_b
        if b'/ASCIIHexDecode' in dict_b:
            try:
                hex_clean = re.sub(rb'[^0-9A-Fa-f]', b'', data)
                if len(hex_clean) % 2 != 0:
                    hex_clean += b'0'
                data = bytes.fromhex(hex_clean.decode('ascii'))
            except Exception:
                pass
        if b'/FlateDecode' in dict_b:
            for wb in (zlib.MAX_WBITS, -zlib.MAX_WBITS):
                try:
                    data = zlib.decompress(data, wb)
                    break
                except Exception:
                    continue
        return dict_b, data

    # Unpack /ObjStm compressed object streams
    for oid, body in list(obj_map.items()):
        if b'/ObjStm' in body:
            dict_b, data = _extract_stream(body)
            nm = re.search(rb'/N\s+(\d+)', dict_b)
            fm = re.search(rb'/First\s+(\d+)', dict_b)
            if nm and fm and data:
                n = int(nm.group(1))
                first = int(fm.group(1))
                header = data[:first].decode('latin-1', errors='ignore').split()
                pairs = [
                    (int(header[2 * i]), int(header[2 * i + 1]))
                    for i in range(min(n, len(header) // 2))
                ]
                body_data = data[first:]
                for idx, (sub_id, off) in enumerate(pairs):
                    end_off = pairs[idx + 1][1] if idx + 1 < len(pairs) else len(body_data)
                    if sub_id not in obj_map:
                        obj_map[sub_id] = body_data[off:end_off]

    def _resolve_ref(ref_id: int) -> bytes:
        return obj_map.get(ref_id, b'')

    def _collect_resources(node_body: bytes, inherited_fonts: dict[str, int], inherited_xobjs: dict[str, int]) -> tuple[dict[str, int], dict[str, int]]:
        fonts = dict(inherited_fonts)
        xobjs = dict(inherited_xobjs)

        res_body = node_body
        res_ref = re.search(rb'/Resources\s+(\d+)\s+\d+\s+R', node_body)
        if res_ref:
            res_body = _resolve_ref(int(res_ref.group(1)))
        else:
            res_inline = re.search(rb'/Resources\s*<<(.*)>>', node_body, re.DOTALL)
            if res_inline:
                res_body = res_inline.group(1)

        fm = re.search(rb'/Font\s*<<(.*?)>>', res_body, re.DOTALL)
        if fm:
            for fref in re.finditer(rb'/([A-Za-z0-9_+.-]+)\s+(\d+)\s+\d+\s+R', fm.group(1)):
                fonts[fref.group(1).decode('latin-1', errors='ignore')] = int(fref.group(2))
        else:
            fobj = re.search(rb'/Font\s+(\d+)\s+\d+\s+R', res_body)
            if fobj:
                fbody = _resolve_ref(int(fobj.group(1)))
                for fref in re.finditer(rb'/([A-Za-z0-9_+.-]+)\s+(\d+)\s+\d+\s+R', fbody):
                    fonts[fref.group(1).decode('latin-1', errors='ignore')] = int(fref.group(2))

        xm = re.search(rb'/XObject\s*<<(.*?)>>', res_body, re.DOTALL)
        if xm:
            for xref in re.finditer(rb'/([A-Za-z0-9_+.-]+)\s+(\d+)\s+\d+\s+R', xm.group(1)):
                xobjs[xref.group(1).decode('latin-1', errors='ignore')] = int(xref.group(2))
        else:
            xobj = re.search(rb'/XObject\s+(\d+)\s+\d+\s+R', res_body)
            if xobj:
                xbody = _resolve_ref(int(xobj.group(1)))
                for xref in re.finditer(rb'/([A-Za-z0-9_+.-]+)\s+(\d+)\s+\d+\s+R', xbody):
                    xobjs[xref.group(1).decode('latin-1', errors='ignore')] = int(xref.group(2))

        return fonts, xobjs

    page_entries: list[tuple[int, bytes, dict[str, int], dict[str, int]]] = []
    visited_nodes: set[int] = set()

    def _walk_pages(node_id: int, inherited_fonts: dict[str, int], inherited_xobjs: dict[str, int]):
        if node_id in visited_nodes or len(page_entries) >= 80:
            return
        visited_nodes.add(node_id)
        body = _resolve_ref(node_id)
        if not body:
            return
        local_fonts, local_xobjs = _collect_resources(body, inherited_fonts, inherited_xobjs)
        km = re.search(rb'/Kids\s*\[(.*?)\]', body, re.DOTALL)
        if km:
            for kid in re.finditer(rb'(\d+)\s+\d+\s+R', km.group(1)):
                _walk_pages(int(kid.group(1)), local_fonts, local_xobjs)
        elif re.search(rb'/Type\s*/Page\b', body):
            page_entries.append((node_id, body, local_fonts, local_xobjs))

    root_pages_id = None
    for _, body in obj_map.items():
        if b'/Catalog' in body:
            pm = re.search(rb'/Pages\s+(\d+)\s+\d+\s+R', body)
            if pm:
                root_pages_id = int(pm.group(1))
                break

    if root_pages_id is not None:
        _walk_pages(root_pages_id, {}, {})

    if not page_entries:
        for oid, body in sorted(obj_map.items()):
            if re.search(rb'/Type\s*/Page\b', body) and not re.search(rb'/Type\s*/Pages\b', body):
                f, x = _collect_resources(body, {}, {})
                page_entries.append((oid, body, f, x))

    cmap_cache: dict[int, tuple[dict[bytes, str], list[int], bool]] = {}

    def _get_cmap(font_oid: int) -> tuple[dict[bytes, str], list[int], bool]:
        if font_oid in cmap_cache:
            return cmap_cache[font_oid]
        fbody = _resolve_ref(font_oid)
        tm = re.search(rb'/ToUnicode\s+(\d+)\s+\d+\s+R', fbody)
        cmap: dict[bytes, str] = {}
        if tm:
            _, cstream = _extract_stream(_resolve_ref(int(tm.group(1))))
            if cstream:
                cmap = _parse_tounicode_cmap(cstream)
        key_lens = sorted({len(k) for k in cmap}, reverse=True)
        is_type0 = b'/Type0' in fbody or b'/Identity-H' in fbody
        cmap_cache[font_oid] = (cmap, key_lens, is_type0)
        return cmap_cache[font_oid]

    def _decode_bytes_to_glyphs(b: bytes, cmap: dict[bytes, str], key_lens: list[int], is_type0: bool) -> list[str]:
        if b.startswith(b'\xfe\xff'):
            return list(b[2:].decode('utf-16-be', errors='ignore'))
        if cmap:
            out: list[str] = []
            i = 0
            n = len(b)
            while i < n:
                matched = False
                for kl in key_lens:
                    sub = b[i:i + kl]
                    if sub in cmap:
                        out.append(cmap[sub])
                        i += kl
                        matched = True
                        break
                if not matched:
                    i += 2 if is_type0 else 1
            return out
        if is_type0:
            # Type0 / Identity-H without a ToUnicode CMap encodes raw CIDs, not readable text
            return []
        return list(b.decode('cp1252', errors='ignore'))

    def _decode_lit_to_bytes(lit: str) -> bytes:
        out_b = bytearray()
        i = 0
        n = len(lit)
        while i < n:
            ch = lit[i]
            if ch == '\\' and i + 1 < n:
                nxt = lit[i + 1]
                if nxt in ('n', 'r', 't', 'b', 'f', '(', ')', '\\'):
                    esc = {
                        'n': '\n', 'r': '\r', 't': '\t', 'b': '\b',
                        'f': '\f', '(': '(', ')': ')', '\\': '\\',
                    }[nxt]
                    out_b.append(ord(esc))
                    i += 2
                    continue
                if nxt in '01234567':
                    om = re.match(r'[0-7]{1,3}', lit[i + 1:i + 4])
                    if om:
                        out_b.append(int(om.group(0), 8) & 0xFF)
                        i += 1 + len(om.group(0))
                        continue
                if nxt in ('\r', '\n'):
                    i += 2
                    if nxt == '\r' and i < n and lit[i] == '\n':
                        i += 1
                    continue
            out_b.append(ord(ch) & 0xFF)
            i += 1
        return bytes(out_b)

    def _glyphs_visual_to_logical(glyphs: list[str]) -> str:
        if not any(_is_arabic_char(c) for g in glyphs for c in g):
            return unicodedata.normalize('NFKC', ''.join(glyphs))

        runs: list[tuple[str, list[str]]] = []
        cur: list[str] = []
        cur_type: str | None = None
        for g in glyphs:
            g_ar = any(_is_arabic_char(c) for c in g)
            g_ltr = g.isascii() and g.isalnum()
            if g_ar:
                kind = 'RTL'
            elif g_ltr:
                kind = 'LTR'
            else:
                kind = cur_type or 'NEUTRAL'

            if cur_type and kind != cur_type and kind != 'NEUTRAL':
                runs.append((cur_type, cur))
                cur = [g]
                cur_type = kind
            else:
                if not cur_type or cur_type == 'NEUTRAL':
                    cur_type = kind
                cur.append(g)
        if cur:
            runs.append((cur_type or 'RTL', cur))

        out: list[str] = []
        for kind, toks in reversed(runs):
            if kind == 'RTL':
                rev_toks = [
                    _MIRROR_BRACKETS.get(t, t) if len(t) == 1 else t
                    for t in reversed(toks)
                ]
                out.append(''.join(rev_toks))
            else:
                out.append(''.join(toks))
        return unicodedata.normalize('NFKC', ''.join(out))

    op_pattern = re.compile(
        r'/([A-Za-z0-9_+.-]+)\s+[-+]?\d*\.?\d+\s+Tf'
        r'|([-+]?\d*\.?\d+)\s+([-+]?\d*\.?\d+)\s+([-+]?\d*\.?\d+)\s+([-+]?\d*\.?\d+)\s+([-+]?\d*\.?\d+)\s+([-+]?\d*\.?\d+)\s+Tm'
        r'|([-+]?\d*\.?\d+)\s+([-+]?\d*\.?\d+)\s+T[dD]'
        r'|\bT\*'
        r'|\[(.*?)\]\s*TJ'
        r'|<([0-9A-Fa-f]+)>\s*(?:Tj|\'|")'
        r'|\(((?:\\.|[^()\\])*)\)\s*(?:Tj|\'|")',
        re.DOTALL,
    )
    tj_item_pattern = re.compile(r'<([0-9A-Fa-f]+)>|\(((?:\\.|[^()\\])*)\)')

    def _parse_stream_rows(stream_str: str, fonts: dict[str, int]) -> list[tuple[float, float, str]]:
        rows: list[tuple[float, float, str]] = []
        for bt in re.finditer(r'\bBT\b(.*?)\bET\b', stream_str, re.DOTALL):
            blk = bt.group(1)
            cur_font: str | None = None
            cur_x, cur_y = 0.0, 0.0
            for op in op_pattern.finditer(blk):
                if op.group(1):
                    cur_font = op.group(1)
                elif op.group(6) is not None:
                    cur_x, cur_y = float(op.group(6)), float(op.group(7))
                elif op.group(8) is not None:
                    cur_x += float(op.group(8))
                    cur_y += float(op.group(9))
                elif op.group(0) == 'T*':
                    cur_y -= 12.0
                else:
                    font_oid = fonts.get(cur_font, -1) if cur_font else -1
                    cmap, key_lens, is_type0 = _get_cmap(font_oid) if font_oid >= 0 else ({}, [], False)
                    glyphs: list[str] = []
                    if op.group(10) is not None:
                        for item in tj_item_pattern.finditer(op.group(10)):
                            if item.group(1) is not None:
                                h = item.group(1)
                                if len(h) % 2 != 0:
                                    h += '0'
                                glyphs.extend(_decode_bytes_to_glyphs(bytes.fromhex(h), cmap, key_lens, is_type0))
                            elif item.group(2) is not None:
                                glyphs.extend(_decode_bytes_to_glyphs(_decode_lit_to_bytes(item.group(2)), cmap, key_lens, is_type0))
                    elif op.group(11) is not None:
                        h = op.group(11)
                        if len(h) % 2 != 0:
                            h += '0'
                        glyphs = _decode_bytes_to_glyphs(bytes.fromhex(h), cmap, key_lens, is_type0)
                    elif op.group(12) is not None:
                        glyphs = _decode_bytes_to_glyphs(_decode_lit_to_bytes(op.group(12)), cmap, key_lens, is_type0)
                    if glyphs:
                        txt = _strip_control_chars(_glyphs_visual_to_logical(glyphs))
                        if txt:
                            rows.append((round(cur_y, 1), round(cur_x, 2), txt))
        return rows

    pieces: list[str] = []
    if page_entries:
        for p_idx, (_, pbody, fonts, xobjs) in enumerate(page_entries, 1):
            c_refs: list[int] = []
            cm_arr = re.search(rb'/Contents\s*\[(.*?)\]', pbody, re.DOTALL)
            if cm_arr:
                c_refs = [int(m.group(1)) for m in re.finditer(rb'(\d+)\s+\d+\s+R', cm_arr.group(1))]
            else:
                cm_one = re.search(rb'/Contents\s+(\d+)\s+\d+\s+R', pbody)
                if cm_one:
                    c_refs = [int(cm_one.group(1))]

            stream_str = ''
            for cref in c_refs:
                _, cd = _extract_stream(_resolve_ref(cref))
                if cd:
                    stream_str += '\n' + cd.decode('latin-1', errors='ignore')

            # Include referenced Form XObjects if page stream invokes /XName Do
            for do_m in re.finditer(r'/([A-Za-z0-9_+.-]+)\s+Do\b', stream_str):
                xname = do_m.group(1)
                xid = xobjs.get(xname)
                if xid is not None:
                    xbody = _resolve_ref(xid)
                    if b'/Subtype/Form' in xbody or b'/Subtype /Form' in xbody:
                        xfonts, _ = _collect_resources(xbody, fonts, xobjs)
                        _, xd = _extract_stream(xbody)
                        if xd:
                            stream_str += '\n' + xd.decode('latin-1', errors='ignore')
                            fonts = {**fonts, **xfonts}

            rows = _parse_stream_rows(stream_str, fonts)
            if not rows:
                continue

            rows.sort(key=lambda r: -r[0])
            grouped_lines: list[list[tuple[float, str]]] = []
            cur_line: list[tuple[float, str]] = []
            last_y: float | None = None
            for y, x, txt in rows:
                if last_y is None or abs(y - last_y) <= 2.5:
                    cur_line.append((x, txt))
                    if last_y is None:
                        last_y = y
                else:
                    grouped_lines.append(cur_line)
                    cur_line = [(x, txt)]
                    last_y = y
            if cur_line:
                grouped_lines.append(cur_line)

            page_row_entries: list[tuple[float, list[str]]] = []
            for ln in grouped_lines:
                has_ar = any(_is_arabic_char(c) for _, t in ln for c in t)
                ln_sorted = sorted(ln, key=lambda it: -it[0] if has_ar else it[0])

                # Split horizontal row spans into distinct columns when visual gap indicates tabular cells
                row_cells: list[str] = []
                cur_cell_parts: list[str] = []
                prev_x: float | None = None
                prev_len = 0
                for span_x, span_t in ln_sorted:
                    clean_span = re.sub(r'\s+', ' ', span_t).strip()
                    if not clean_span:
                        continue
                    if prev_x is None:
                        cur_cell_parts.append(clean_span)
                    else:
                        dx = abs(span_x - prev_x)
                        est_gap = dx - max(10.0, prev_len * 4.2)
                        if dx >= 42.0 and est_gap >= 14.0:
                            joined_cell = ''.join(cur_cell_parts).strip()
                            if joined_cell:
                                row_cells.append(joined_cell)
                            cur_cell_parts = [clean_span]
                        else:
                            if cur_cell_parts and not cur_cell_parts[-1].endswith(' ') and not clean_span.startswith(' ') and est_gap >= 2.2:
                                cur_cell_parts.append(' ' + clean_span)
                            else:
                                cur_cell_parts.append(clean_span)
                    prev_x = span_x
                    prev_len = len(clean_span)
                if cur_cell_parts:
                    joined_cell = ''.join(cur_cell_parts).strip()
                    if joined_cell:
                        row_cells.append(joined_cell)

                full_row_txt = re.sub(r'\s+', ' ', ' '.join(row_cells)).strip()
                if not full_row_txt or full_row_txt.lower() == 'public document':
                    continue
                if _is_meaningful_extracted_line(full_row_txt):
                    row_y = next((y for y, _, t in rows if any(t == it[1] for it in ln)), 0.0)
                    page_row_entries.append((row_y, row_cells))

            if page_row_entries:
                merged_lines: list[str] = []
                idx_r = 0
                total_r = len(page_row_entries)
                while idx_r < total_r:
                    _, cells = page_row_entries[idx_r]
                    if 2 <= len(cells) <= 8:
                        table_block: list[list[str]] = [cells]
                        look = idx_r + 1
                        while look < total_r:
                            _, next_cells = page_row_entries[look]
                            if 2 <= len(next_cells) <= 8:
                                table_block.append(next_cells)
                                look += 1
                            else:
                                break
                        if len(table_block) >= 2:
                            merged_lines.extend(_format_markdown_table(table_block))
                            idx_r = look
                            continue

                    ln = ' '.join(cells).strip()
                    starts_new_block = (
                        ln.startswith(('•', '-', '*', '▪'))
                        or bool(re.match(r'^(?:\d+(?:\.\d+)*[.)]?\s|[أ-ي]\s*[-)])', ln))
                        or len(ln) <= 55
                    )
                    if (
                        merged_lines
                        and not merged_lines[-1].startswith('|')
                        and not starts_new_block
                        and len(merged_lines[-1]) < 340
                        and not merged_lines[-1].endswith(('.', '؟', '!', ':'))
                    ):
                        merged_lines[-1] = f'{merged_lines[-1]} {ln}'
                    else:
                        merged_lines.append(ln)
                    idx_r += 1

                pieces.append(f'[PDF page {p_idx}]\n' + '\n'.join(merged_lines))
            if sum(len(x) for x in pieces) >= MAX_CHARS:
                break

    if pieces:
        return '\n'.join(pieces)[:MAX_CHARS]

    # Fallback ONLY for simple uncompressed / non-font PDFs without page tree metadata
    stream_pattern = re.compile(rb'stream[\r\n]+(.*?)[\r\n]*endstream', re.DOTALL)
    for match in stream_pattern.finditer(raw):
        prefix = raw[max(0, match.start() - 250):match.start()]
        if any(marker in prefix for marker in (b'/FontFile', b'/ObjStm', b'/XRef', b'/Subtype/Image', b'/Subtype /Image')):
            continue
        chunk = match.group(1)
        decompressed = chunk
        if b'/FlateDecode' in prefix:
            for wbits in (zlib.MAX_WBITS, -zlib.MAX_WBITS):
                try:
                    decompressed = zlib.decompress(chunk, wbits)
                    break
                except Exception:
                    continue
        if b'\x00' in decompressed[:128] and b'BT' not in decompressed:
            continue
        text_stream = decompressed.decode('latin-1', errors='ignore')
        extracted_tokens: list[str] = []
        for lit_match in re.finditer(r'\(([^()]{2,})\)\s*(?:Tj|TJ|\')', text_stream):
            clean_lit = _strip_control_chars(
                lit_match.group(1).replace('\\n', '\n').replace('\\r', ' ').replace('\\(', '(').replace('\\)', ')')
            ).strip()
            if _is_meaningful_extracted_line(clean_lit):
                extracted_tokens.append(clean_lit)
        if extracted_tokens:
            joined = ' '.join(extracted_tokens).strip()
            if _is_meaningful_extracted_line(joined):
                pieces.append(f'[PDF section {len(pieces) + 1}]\n{joined}')
        if sum(len(x) for x in pieces) >= MAX_CHARS:
            break

    return '\n'.join(pieces)[:MAX_CHARS]


def extract_pdf(path: Path) -> str:
    raw_head = path.read_bytes()[:8]
    if not raw_head.startswith(b'%PDF-'):
        raise ValueError('Not a valid PDF file')
    try:
        from pypdf import PdfReader  # type: ignore
        logging.getLogger('pypdf').setLevel(logging.CRITICAL)
        reader = PdfReader(str(path), strict=False)
        if reader.is_encrypted:
            raise ValueError('Encrypted PDF cannot be extracted without authorization')
        pieces = []
        for index, page in enumerate(reader.pages[:80], 1):
            txt = (page.extract_text() or '').strip()
            if txt and _is_meaningful_extracted_line(txt):
                pieces.append(f'[PDF page {index}]\n{txt}')
            if sum(map(len, pieces)) >= MAX_CHARS:
                break
        res = '\n'.join(pieces)[:MAX_CHARS]
        if res.strip():
            return res
    except ImportError:
        pass
    return _extract_pdf_stdlib(path)


def extract_csv_or_tsv(path: Path, delimiter: str = ',') -> str:
    raw_text = _read_text_with_arabic_fallback(path.read_bytes())
    reader = csv.reader(io.StringIO(raw_text), delimiter=delimiter)
    rows = [r for r in reader if any(cell.strip() for cell in r)]
    if not rows:
        return ''
    headers = [h.strip() for h in rows[0]]
    pieces = [' | '.join(h for h in headers if h)]
    for idx, row in enumerate(rows[1:1500], 1):
        pairs = []
        for col_i, val in enumerate(row):
            v = val.strip()
            if not v:
                continue
            hdr = headers[col_i] if col_i < len(headers) and headers[col_i] else f'Col{col_i + 1}'
            pairs.append(f'{hdr}: {v}')
        if pairs:
            pieces.append(f'[صف {idx}] ' + ' | '.join(pairs))
        if sum(len(x) for x in pieces) >= MAX_CHARS:
            break
    return '\n'.join(pieces)[:MAX_CHARS]


def extract_json_file(path: Path) -> str:
    raw_text = _read_text_with_arabic_fallback(path.read_bytes())
    try:
        parsed = json.loads(raw_text)
        pieces: list[str] = []

        def _walk(obj, prefix=''):
            if sum(len(x) for x in pieces) >= MAX_CHARS:
                return
            if isinstance(obj, dict):
                row_parts = []
                for k, v in obj.items():
                    if isinstance(v, (str, int, float, bool)) and str(v).strip():
                        row_parts.append(f'{k}: {v}')
                if row_parts:
                    pieces.append((f'[{prefix}] ' if prefix else '') + ' | '.join(row_parts))
                for k, v in obj.items():
                    if isinstance(v, (dict, list)):
                        _walk(v, f'{prefix}.{k}' if prefix else str(k))
            elif isinstance(obj, list):
                for idx, item in enumerate(obj[:500], 1):
                    _walk(item, f'{prefix}[{idx}]' if prefix else f'البند {idx}')

        _walk(parsed)
        if pieces:
            return '\n'.join(pieces)[:MAX_CHARS]
    except Exception:
        pass
    return raw_text[:MAX_CHARS]


def extract_xml_or_html(path: Path) -> str:
    raw_text = _read_text_with_arabic_fallback(path.read_bytes())
    # Strip script and style tags for HTML
    cleaned = re.sub(r'<(script|style)\b[^>]*>.*?</\1>', ' ', raw_text, flags=re.DOTALL | re.IGNORECASE)

    # Convert HTML <table> elements cleanly into Markdown table blocks
    def _replace_html_table(match: re.Match) -> str:
        tbl_html = match.group(0)
        rows_out: list[list[str]] = []
        for tr_m in re.finditer(r'<tr\b[^>]*>(.*?)</tr>', tbl_html, flags=re.DOTALL | re.IGNORECASE):
            cells_out: list[str] = []
            for cell_m in re.finditer(r'<(?:th|td)\b[^>]*>(.*?)</(?:th|td)>', tr_m.group(1), flags=re.DOTALL | re.IGNORECASE):
                cell_txt = re.sub(r'<[^>]+>', ' ', cell_m.group(1))
                cell_txt = re.sub(r'\s+', ' ', cell_txt).strip()
                cells_out.append(cell_txt)
            if any(cells_out):
                rows_out.append(cells_out)
        if not rows_out:
            return '\n'
        return '\n' + '\n'.join(_format_markdown_table(rows_out)) + '\n'

    cleaned = re.sub(r'<table\b[^>]*>.*?</table>', _replace_html_table, cleaned, flags=re.DOTALL | re.IGNORECASE)
    cleaned = re.sub(r'<[^>]+>', '\n', cleaned)
    lines = [line.strip() for line in cleaned.splitlines() if line.strip()]
    return '\n'.join(lines)[:MAX_CHARS]


def extract_zip_bundle(path: Path) -> str:
    pieces: list[str] = []
    with zipfile.ZipFile(path) as z:
        for info in z.infolist()[:30]:
            if info.is_dir() or info.file_size > MAX_UNCOMPRESSED_MEMBER:
                continue
            sub_ext = Path(info.filename).suffix.lower()
            if sub_ext in ('.txt', '.md', '.csv', '.tsv', '.json', '.xml', '.html', '.htm', '.yaml', '.yml', '.log'):
                raw = z.read(info.filename)
                txt = _read_text_with_arabic_fallback(raw).strip()
                if txt:
                    pieces.append(f'[ملف داخل الأرشيف: {info.filename}]\n{txt[:15000]}')
            if sum(len(x) for x in pieces) >= MAX_CHARS:
                break
    return '\n'.join(pieces)[:MAX_CHARS]


# Arabic PDF Lam-Alef Ligature & Banking Vocabulary Repair (README §Document intelligence & §Known limitations)
_ARABIC_LIGATURE_REPAIRS = (
    ('المالحظة', 'الملاحظة'),
    ('المالحظات', 'الملاحظات'),
    ('مالحظة', 'ملاحظة'),
    ('مالحظات', 'ملاحظات'),
    ('اإلجراءات', 'الإجراءات'),
    ('اإلجراء', 'الإجراء'),
    ('اإلدارة', 'الإدارة'),
    ('اإلدارات', 'الإدارات'),
    ('األهلي', 'الأهلي'),
    ('اآللي', 'الآلي'),
    ('اآللية', 'الآلية'),
    ('األخطار', 'الأخطار'),
    ('األمن', 'الأمن'),
    ('األموال', 'الأموال'),
    ('المعامالت', 'المعاملات'),
    ('التعديالت', 'التعديلات'),
    ('االلتزام', 'الالتزام'),
    ('االعتماد', 'الاعتماد'),
    ('االئتمان', 'الائتمان'),
    ('العالقة', 'العلاقة'),
    ('العمالت', 'العملات'),
    ('الحاالت', 'الحالات'),
    ('االختيار', 'الاختيار'),
    ('االستالم', 'الاستلام'),
    ('االتصاالت', 'الاتصالات'),
    ('البنك االهلي', 'البنك الأهلي'),
)

_PROMPT_INJECTION_PATTERNS = (
    re.compile(r'ignore\s+(?:all\s+)?(?:previous|prior|above)\s+instructions', re.IGNORECASE),
    re.compile(r'system\s*prompt\s*:', re.IGNORECASE),
    re.compile(r'you\s+are\s+now\s+(?:a|an)\b', re.IGNORECASE),
    re.compile(r'تجاهل\s+(?:كافة\s+|جميع\s+)?التعليمات\s+السابقة'),
    re.compile(r'override\s+(?:rrf|residual_rating|inherent_rating|approval)', re.IGNORECASE),
)


def repair_arabic_pdf_text(text: str) -> str:
    if not text:
        return ''
    repaired = text
    for broken, fixed in _ARABIC_LIGATURE_REPAIRS:
        repaired = repaired.replace(broken, fixed)
    return repaired


def quarantine_prompt_injection(text: str) -> tuple[str, bool]:
    if not text:
        return '', False
    sanitized = text
    flagged = False
    for pat in _PROMPT_INJECTION_PATTERNS:
        if pat.search(sanitized):
            flagged = True
            sanitized = pat.sub('[QUARANTINED-UNTRUSTED-INSTRUCTION]', sanitized)
    return sanitized, flagged


def redact_banking_pii(text: str) -> tuple[str, int]:
    if not text:
        return '', 0
    count = 0
    # Redact Egyptian IBAN (EG followed by 27 digits)
    text, n1 = re.subn(r'\bEG\d{27}\b', '[REDACTED-IBAN]', text)
    # Redact 14-digit Egyptian National ID
    text, n2 = re.subn(r'\b[23]\d{13}\b', '[REDACTED-NATIONAL-ID]', text)
    # Redact 16-digit PAN card numbers
    text, n3 = re.subn(r'\b(?:\d{4}[-\s]?){3}\d{4}\b', '[REDACTED-CARD-PAN]', text)
    count = n1 + n2 + n3
    return text, count


def _count_markdown_tables(text: str) -> int:
    if not text:
        return 0
    return len(re.findall(r'^\|.+\|\s*\n\|(?:\s*:?-{2,}:?\s*\|)+', text, flags=re.MULTILINE))


def _inspect_document_media(file: Path, ext: str) -> tuple[int, int]:
    """Return (embedded_image_count, page_count)."""
    try:
        if ext == '.pdf':
            raw = file.read_bytes()
            img_count = len(re.findall(rb'/Subtype\s*/Image\b', raw))
            pages = len(re.findall(rb'/Type\s*/Page\b(?!s)', raw))
            if pages == 0 and img_count == 0 and b'/Pages' not in raw:
                return 0, 0
            return img_count, max(1, pages)
        if ext in ('.docx', '.pptx', '.xlsx') and zipfile.is_zipfile(file):
            with zipfile.ZipFile(file) as z:
                media = [n for n in z.namelist() if '/media/' in n and not n.endswith('/')]
                slides_or_sheets = [n for n in z.namelist() if n.startswith(('ppt/slides/slide', 'xl/worksheets/sheet'))]
                return len(media), max(1, len(slides_or_sheets))
    except Exception:
        pass
    return 0, 1


def extract_embedded_images(path: str, out_dir: str, max_images: int = 8) -> dict:
    """Extract embedded images (JPEG/PNG) from PDF or Office ZIP archives for multimodal Vision OCR."""
    file = Path(path)
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    if not file.is_file():
        return {'images': [], 'error': 'File not found'}
    ext = file.suffix.lower()
    saved: list[dict] = []

    try:
        if ext in IMAGE_EXTENSIONS:
            raw = file.read_bytes()
            mime = _detect_valid_image_mime(raw, ext)
            if mime:
                dest = out / f'page_1{ext}'
                dest.write_bytes(raw)
                saved.append({'path': str(dest), 'mime_type': mime, 'page': 1})
            return {'images': saved}

        if ext == '.pdf':
            raw = file.read_bytes()
            for m in re.finditer(rb'(\d+)\s+\d+\s+obj\b(.*?)\bendobj', raw, re.DOTALL):
                if len(saved) >= max_images:
                    break
                body = m.group(2)
                if not re.search(rb'/Subtype\s*/Image\b', body):
                    continue
                sm = re.search(rb'stream[\r\n]+(.*?)[\r\n]*endstream', body, re.DOTALL)
                if not sm:
                    continue
                dict_b, st_b = body[:sm.start()], sm.group(1)
                if b'/DCTDecode' in dict_b and st_b.startswith(b'\xff\xd8\xff'):
                    idx = len(saved) + 1
                    dest = out / f'pdf_img_{idx}.jpg'
                    dest.write_bytes(st_b)
                    saved.append({'path': str(dest), 'mime_type': 'image/jpeg', 'page': idx})
                elif b'/FlateDecode' in dict_b:
                    wm = re.search(rb'/Width\s+(\d+)', dict_b)
                    hm = re.search(rb'/Height\s+(\d+)', dict_b)
                    if wm and hm:
                        w, h = int(wm.group(1)), int(hm.group(1))
                        channels = 1 if b'/DeviceGray' in dict_b else 3
                        decompressed = None
                        for wb in (zlib.MAX_WBITS, -zlib.MAX_WBITS):
                            try:
                                decompressed = zlib.decompress(st_b, wb)
                                break
                            except Exception:
                                continue
                        if decompressed:
                            png_bytes = _encode_png_rgb_or_gray(w, h, channels, decompressed)
                            if png_bytes:
                                idx = len(saved) + 1
                                dest = out / f'pdf_img_{idx}.png'
                                dest.write_bytes(png_bytes)
                                saved.append({'path': str(dest), 'mime_type': 'image/png', 'page': idx})
            return {'images': saved}

        if ext in ('.docx', '.pptx', '.xlsx') and zipfile.is_zipfile(file):
            with zipfile.ZipFile(file) as z:
                media_names = sorted(n for n in z.namelist() if '/media/' in n and not n.endswith('/'))
                for idx, name in enumerate(media_names[:max_images], 1):
                    sub_ext = Path(name).suffix.lower()
                    if sub_ext not in ('.png', '.jpg', '.jpeg', '.webp'):
                        continue
                    data = _zip_member(z, name)
                    mime = _detect_valid_image_mime(data, sub_ext)
                    if mime:
                        dest = out / f'media_{idx}{sub_ext}'
                        dest.write_bytes(data)
                        saved.append({'path': str(dest), 'mime_type': mime, 'page': idx})
            return {'images': saved}
    except Exception as exc:
        return {'images': saved, 'error': str(exc)[:200]}

    return {'images': saved}


def extract(path: str) -> dict:
    file = Path(path)
    if not file.is_file():
        raise ValueError('Uploaded document not found')
    if file.stat().st_size > MAX_BYTES:
        raise ValueError('Uploaded document exceeds 6 MB size limit')
    ext = file.suffix.lower()

    if ext in IMAGE_EXTENSIONS:
        raw_img = file.read_bytes()
        mime = _detect_valid_image_mime(raw_img, ext)
        if not mime:
            return {
                'status': 'MANUAL_REQUIRED',
                'text': '',
                'reason': 'Invalid or unrecognized image binary header',
                'is_image': True,
                'needs_vision': False,
            }
        return {
            'status': 'VISION_REQUIRED',
            'text': '',
            'chars': 0,
            'format': ext.lstrip('.').upper(),
            'mime_type': mime,
            'is_image': True,
            'needs_vision': True,
            'has_tables': False,
            'table_count': 0,
            'embedded_image_count': 1,
            'page_count': 1,
            'reason': 'Image document requires multimodal Vision OCR/Table parser',
        }

    embedded_image_count, page_count = _inspect_document_media(file, ext)

    try:
        if ext == '.pdf':
            text = extract_pdf(file)
        elif ext in ('.docx', '.doc'):
            text = extract_docx(file) if zipfile.is_zipfile(file) else _read_text_with_arabic_fallback(file.read_bytes())[:MAX_CHARS]
        elif ext in ('.xlsx', '.xls'):
            text = extract_xlsx(file) if zipfile.is_zipfile(file) else _read_text_with_arabic_fallback(file.read_bytes())[:MAX_CHARS]
        elif ext in ('.pptx', '.ppt'):
            text = extract_pptx(file) if zipfile.is_zipfile(file) else ''
        elif ext == '.csv':
            text = extract_csv_or_tsv(file, ',')
        elif ext == '.tsv':
            text = extract_csv_or_tsv(file, '\t')
        elif ext == '.json':
            text = extract_json_file(file)
        elif ext in ('.xml', '.html', '.htm'):
            text = extract_xml_or_html(file)
        elif ext == '.zip':
            text = extract_zip_bundle(file)
        elif ext in ('.txt', '.md', '.rtf', '.yaml', '.yml', '.log', '.ini', '.sql'):
            text = _read_text_with_arabic_fallback(file.read_bytes())[:MAX_CHARS]
        else:
            return {'status': 'MANUAL_REQUIRED', 'text': '', 'reason': 'Unsupported document type'}
    except Exception as exc:
        return {'status': 'MANUAL_REQUIRED', 'text': '', 'reason': str(exc)[:300]}
    if not text.strip():
        needs_vision = bool(ext == '.pdf' and (embedded_image_count > 0 or page_count >= 1))
        return {
            'status': 'MANUAL_REQUIRED',
            'text': '',
            'reason': 'No selectable text found; scanned/empty file requires review',
            'is_image': False,
            'needs_vision': needs_vision,
            'has_tables': False,
            'table_count': 0,
            'embedded_image_count': embedded_image_count,
            'page_count': page_count,
        }

    repaired_text = repair_arabic_pdf_text(text)
    quarantined_text, injection_quarantined = quarantine_prompt_injection(repaired_text)
    redacted_text, pii_redactions = redact_banking_pii(quarantined_text)
    table_count = _count_markdown_tables(redacted_text)
    chars_per_page = len(redacted_text) / max(1, page_count)
    needs_vision = bool(embedded_image_count > 0 and (chars_per_page < 450 or ext == '.pdf'))

    return {
        'status': 'EXTRACTED',
        'text': redacted_text,
        'chars': len(redacted_text),
        'format': ext.lstrip('.').upper(),
        'injection_quarantined': injection_quarantined,
        'pii_redactions': pii_redactions,
        'is_image': False,
        'needs_vision': needs_vision,
        'has_tables': table_count > 0,
        'table_count': table_count,
        'embedded_image_count': embedded_image_count,
        'page_count': page_count,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--path', required=True)
    parser.add_argument('--extract-images-dir', default='')
    args = parser.parse_args()
    if args.extract_images_dir:
        print(json.dumps(extract_embedded_images(args.path, args.extract_images_dir), ensure_ascii=False))
    else:
        print(json.dumps(extract(args.path), ensure_ascii=False))


if __name__ == '__main__':
    main()

