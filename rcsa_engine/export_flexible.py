"""RCSA review/export for any unit using the provided bank workbook as a layout.

This exporter does not infer assessments. Every populated cell originates from a saved
risk input, an authoritative Python calculation, or a saved Phase 2C assessment.
Approved eight-risk Syndicated Loans exports continue to use export_official.py.
"""
from __future__ import annotations

import base64
from copy import copy
from html import escape as xml_escape
from io import BytesIO
import json
import os
from pathlib import Path
import re
import sys
import tempfile
import zipfile

try:
    from openpyxl import load_workbook  # type: ignore
except ImportError:
    load_workbook = None

TEMPLATE = Path(__file__).resolve().parents[1] / 'reference_data' / 'binary' / 'Official_RCSA_Template.xlsx'
FIRST_ROW = 8
DATA_COLS = range(3, 32)  # C through AE, as in the supplied official template
RISK_MERGE_COLS = (3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31)
RISK_MERGE_COL_LETTERS = (
    'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L',
    'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', 'AA', 'AB', 'AC', 'AD', 'AE'
)


def format_taxonomy_path(d: dict) -> str | None:
    l1_id = d.get('taxonomy_l1_id')
    l1_ar = d.get('taxonomy_l1_ar')
    l2_id = d.get('taxonomy_l2_id')
    l2_ar = d.get('taxonomy_l2_ar')
    l3_id = d.get('taxonomy_l3_id')
    l3_ar = d.get('taxonomy_l3_ar')

    parts = []
    if l1_ar:
        l1_str = f"[{l1_id}] {l1_ar}" if l1_id and not str(l1_ar).startswith('[') else str(l1_ar)
        parts.append(l1_str)
    if l2_ar:
        l2_str = f"[{l2_id}] {l2_ar}" if l2_id and not str(l2_ar).startswith('[') else str(l2_ar)
        parts.append(l2_str)
    if l3_ar:
        l3_str = f"[{l3_id}] {l3_ar}" if l3_id and not str(l3_ar).startswith('[') else str(l3_ar)
        parts.append(l3_str)

    if not parts:
        return None
    return " ← ".join(parts)


def _export_stdlib_xml(rows: list, phase2c: dict, unit_name_ar: str | None = None, strategic_objective: str | None = None) -> bytes:
    """Pure Python standard-library exporter preserving the official bank XLSX package, styles, and merges."""
    changed_cells: dict[str, str | int | float | None] = {}
    style_overrides: dict[str, str] = {}
    dynamic_merges: list[str] = []

    all_cols = (
        'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L',
        'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V',
        'W', 'X', 'Y', 'Z', 'AA', 'AB', 'AC', 'AD', 'AE',
    )
    for r_clear in range(FIRST_ROW, 28):
        for col in all_cols:
            changed_cells[f'{col}{r_clear}'] = None

    if unit_name_ar:
        changed_cells['M3'] = f'نموذج المخاطر الافتراضي "{unit_name_ar}"'
    if strategic_objective:
        changed_cells['H5'] = strategic_objective
    changed_cells['AA6'] = 'التقدير النهائي للمخاطرة ومدى فاعلية الإجراءات الرقابية المطبقة ككل'

    current_row = FIRST_ROW
    for index, risk in enumerate(rows, 1):
        d = risk.get('current_draft_input') or {}
        c = risk.get('calculated_output') or {}
        p = phase2c.get(risk.get('risk_id')) or {}
        inputs = p.get('inputs') or {}
        result = p.get('result') or {}
        nfi = result.get('nfi_dimensions') or {}
        esg = result.get('esg_pillars') or []
        if not isinstance(esg, list):
            esg = []

        ctrls = d.get('controls') or []
        count = max(1, len(ctrls))

        acc_label = result.get('acceptance_label_ar') or d.get('final_risk_acceptance')
        acc_class = result.get('acceptance_class')

        first_values = {
            'C': index,
            'D': d.get('process_name'),
            'E': d.get('strategic_objective'),
            'F': d.get('risk_library_name'),
            'G': d.get('risk_description'),
            'H': 'yes' if result.get('key_risk') == 'YES' else ('no' if result.get('key_risk') == 'NO' else None),
            'I': d.get('expected_frequency_text'),
            'J': c.get('individual_financial_impact_egp'),
            'K': c.get('expected_annual_loss_egp'),
            'L': c.get('annualized_financial_rating'),
            'S': c.get('selected_workbook_rrf_key'),
            'T': c.get('residual_financial_amount_egp'),
            'U': c.get('continuous_residual_rating'),
            'V': nfi.get('service'),
            'W': nfi.get('reputation'),
            'X': nfi.get('regulatory'),
            'Y': nfi.get('legal'),
            'Z': result.get('nfi_overall'),
            'AA': acc_label,
            'AB': (
                inputs.get('corrective_action') or d.get('active_corrective_action_ar') or None
                if acc_class in (3, 4)
                else (
                    (inputs.get('corrective_action') or None)
                    if acc_class == 2
                    else None
                )
            ),
            'AC': d.get('active_rationale_ar') or inputs.get('acceptance_rationale'),
            'AD': format_taxonomy_path(d),
            'AE': ', '.join(esg) if result.get('esg_status') == 'ASSESSED' else (
                'لا توجد صلة موثقة' if result.get('esg_status') in ('NOT_APPLICABLE', 'NO_DOCUMENTED_LINK') else None
            ),
        }
        for col, val in first_values.items():
            if val is not None:
                changed_cells[f'{col}{current_row}'] = val

        # Color-coded style for AA (Final Risk Acceptance)
        if acc_label:
            if acc_class == 4 or 'غير مقبولة' in str(acc_label):
                style_overrides[f'AA{current_row}'] = '241'  # Orange fill in bank template
            elif acc_class in (2, 3) or 'تجويد' in str(acc_label):
                style_overrides[f'AA{current_row}'] = '217'  # Yellow fill in bank template
            else:
                style_overrides[f'AA{current_row}'] = '157'  # Green fill in bank template

        for offset, control in enumerate(ctrls):
            r = current_row + offset
            for col, key in (
                ('M', 'control_description'), ('N', 'control_owner'),
                ('O', 'control_method_raw'), ('P', 'effectiveness_raw'),
                ('Q', 'control_frequency_raw'), ('R', 'control_type_raw'),
            ):
                val = control.get(key)
                if val is not None:
                    changed_cells[f'{col}{r}'] = val

            eff_val = str(control.get('effectiveness_raw') or '')
            if 'يحتاج تطوير' in eff_val or 'ضعيف' in eff_val or 'غير فعال' in eff_val:
                style_overrides[f'P{r}'] = '217'  # Yellow fill in bank template
            elif eff_val:
                style_overrides[f'P{r}'] = '159'  # Green fill in bank template

        if count > 1:
            end_row = current_row + count - 1
            for mcol in RISK_MERGE_COL_LETTERS:
                dynamic_merges.append(f'{mcol}{current_row}:{mcol}{end_row}')

        current_row += count

    fd, output_path = tempfile.mkstemp(suffix='.xlsx')
    os.close(fd)
    try:
        with zipfile.ZipFile(TEMPLATE) as original:
            source_xml = original.read('xl/worksheets/sheet1.xml').decode('utf-8')
            for address, value in changed_cells.items():
                pattern = re.compile(r'<c\b(?=[^>]*\br="' + re.escape(address) + r'")[^>]*?(?:/>|>.*?</c>)', re.DOTALL)
                match = pattern.search(source_xml)
                if not match:
                    continue
                original_open = match.group(0).split('>', 1)[0].rstrip('/>')
                base = re.sub(r'\s+t="[^"]*"', '', original_open)
                if address in style_overrides:
                    new_s = style_overrides[address]
                    if re.search(r'\bs="[^"]*"', base):
                        base = re.sub(r'\bs="[^"]*"', f's="{new_s}"', base)
                    else:
                        base = f'{base} s="{new_s}"'
                if value is None:
                    replacement_cell = f'{base}/>'
                elif type(value) in (int, float):
                    replacement_cell = f'{base} t="n"><v>{value}</v></c>'
                else:
                    replacement_cell = f'{base} t="inlineStr"><is><t>{xml_escape(str(value), quote=False)}</t></is></c>'
                source_xml = source_xml[:match.start()] + replacement_cell + source_xml[match.end():]

            # Update <mergeCells> in sheet1.xml so row-8..27 hardcoded merges are replaced with dynamic_merges
            merge_block_match = re.search(r'<mergeCells\b[^>]*>.*?</mergeCells>', source_xml, re.DOTALL)
            if merge_block_match:
                existing_merges = re.findall(r'<mergeCell\s+ref="([^"]+)"\s*/>', merge_block_match.group(0))
                kept_merges = []
                for ref in existing_merges:
                    m_rows = [int(n) for n in re.findall(r'\d+', ref)]
                    # Keep header merges (<8) and helper table merges (>100)
                    if all(r_num < FIRST_ROW or r_num > 100 for r_num in m_rows):
                        kept_merges.append(ref)
                final_merges = kept_merges + dynamic_merges
                new_merge_xml = (
                    f'<mergeCells count="{len(final_merges)}">'
                    + ''.join(f'<mergeCell ref="{ref}"/>' for ref in final_merges)
                    + '</mergeCells>'
                )
                source_xml = source_xml[:merge_block_match.start()] + new_merge_xml + source_xml[merge_block_match.end():]

            with zipfile.ZipFile(output_path, 'w') as output:
                for entry in original.infolist():
                    blob = source_xml.encode('utf-8') if entry.filename == 'xl/worksheets/sheet1.xml' else original.read(entry.filename)
                    output.writestr(entry, blob)
        return Path(output_path).read_bytes()
    finally:
        if Path(output_path).exists():
            Path(output_path).unlink()


def export(payload: dict) -> bytes:
    rows = payload.get('risks') or []
    if not rows:
        raise ValueError('لا توجد مخاطر محفوظة للتصدير.')
    if not TEMPLATE.is_file():
        raise FileNotFoundError('Official RCSA workbook template is missing')

    phase2c = payload.get('phase2c') or {}
    unit_name_ar = payload.get('unit_name_ar')
    strategic_objective = payload.get('strategic_objective')

    if load_workbook is None:
        return _export_stdlib_xml(rows, phase2c, unit_name_ar=unit_name_ar, strategic_objective=strategic_objective)

    wb = load_workbook(TEMPLATE)
    ws = wb['Risk Profile']
    if str(ws['AE6'].value).strip() != 'ESG':
        raise ValueError('The template does not include the expected ESG column AE')

    if unit_name_ar:
        ws['M3'] = f'نموذج المخاطر الافتراضي "{unit_name_ar}"'
    if strategic_objective:
        ws['H5'] = strategic_objective
    ws['AA6'] = 'التقدير النهائي للمخاطرة ومدى فاعلية الإجراءات الرقابية المطبقة ككل'

    for merged in list(ws.merged_cells.ranges):
        if merged.min_row >= FIRST_ROW and merged.min_col <= 31:
            ws.unmerge_cells(str(merged))
    base_style = {col: copy(ws.cell(FIRST_ROW, col)._style) for col in DATA_COLS}
    ctrl_style = {col: copy(ws.cell(FIRST_ROW + 1, col)._style) for col in DATA_COLS}
    row_counts = [max(1, len((r.get('current_draft_input') or {}).get('controls') or [])) for r in rows]
    max_row = max(27, FIRST_ROW + sum(row_counts) - 1)
    if max_row >= 850:
        raise ValueError('عدد الصفوف يتجاوز نطاق العرض المدعوم في قالب البنك.')
    for row in ws.iter_rows(min_row=FIRST_ROW, max_row=max_row, min_col=3, max_col=31):
        for cell in row:
            cell.value = None

    current_row = FIRST_ROW
    for index, (risk, count) in enumerate(zip(rows, row_counts), 1):
        d = risk.get('current_draft_input') or {}
        c = risk.get('calculated_output') or {}
        p = phase2c.get(risk.get('risk_id')) or {}
        inputs = p.get('inputs') or {}
        result = p.get('result') or {}
        nfi = result.get('nfi_dimensions') or {}
        esg = result.get('esg_pillars') or []
        if not isinstance(esg, list):
            esg = []
        first_values = {
            'C': index, 'D': d.get('process_name'), 'E': d.get('strategic_objective'),
            'F': d.get('risk_library_name'), 'G': d.get('risk_description'),
            'H': 'yes' if result.get('key_risk') == 'YES' else ('no' if result.get('key_risk') == 'NO' else None),
            'I': d.get('expected_frequency_text'), 'J': c.get('individual_financial_impact_egp'),
            'K': c.get('expected_annual_loss_egp'), 'L': c.get('annualized_financial_rating'),
            'S': c.get('selected_workbook_rrf_key'), 'T': c.get('residual_financial_amount_egp'),
            'U': c.get('continuous_residual_rating'),
            'V': nfi.get('service'), 'W': nfi.get('reputation'),
            'X': nfi.get('regulatory'), 'Y': nfi.get('legal'),
            'Z': result.get('nfi_overall'), 'AA': result.get('acceptance_label_ar'),
            'AB': (
                inputs.get('corrective_action') or d.get('active_corrective_action_ar') or None
                if result.get('acceptance_class') in (3, 4)
                else ((inputs.get('corrective_action') or None) if result.get('acceptance_class') == 2 else None)
            ),
            'AC': d.get('active_rationale_ar') or inputs.get('acceptance_rationale'),
            'AD': format_taxonomy_path(d),
            'AE': ', '.join(esg) if result.get('esg_status') == 'ASSESSED' else
                  ('لا توجد صلة موثقة' if result.get('esg_status') in ('NOT_APPLICABLE', 'NO_DOCUMENTED_LINK') else None),
        }
        for col, value in first_values.items():
            if value is not None:
                cell = ws[f'{col}{current_row}']
                cell.value = value
        ctrls = d.get('controls') or []
        for offset in range(count):
            r = current_row + offset
            for col in DATA_COLS:
                ws.cell(r, col)._style = copy((base_style if offset == 0 else ctrl_style)[col])
            if offset >= len(ctrls):
                continue
            control = ctrls[offset]
            for col, key in (
                ('M', 'control_description'), ('N', 'control_owner'),
                ('O', 'control_method_raw'), ('P', 'effectiveness_raw'),
                ('Q', 'control_frequency_raw'), ('R', 'control_type_raw'),
            ):
                val = control.get(key)
                if val is not None:
                    ws[f'{col}{r}'] = val
        if count > 1:
            for col in RISK_MERGE_COLS:
                ws.merge_cells(start_row=current_row, start_column=col,
                               end_row=current_row + count - 1, end_column=col)
        current_row += count
    output = BytesIO()
    wb.save(output)
    return output.getvalue()


def main() -> None:
    data = json.load(sys.stdin)
    sys.stdout.write(base64.b64encode(export(data)).decode('ascii'))


if __name__ == '__main__':
    main()
