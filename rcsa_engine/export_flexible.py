"""RCSA review/export for any unit using the provided bank workbook as a layout.

This exporter does not infer assessments. Every populated cell originates from a saved
risk input, an authoritative Python calculation, or a saved Phase 2C assessment.
Approved eight-risk Syndicated Loans exports continue to use export_official.py.
"""
from __future__ import annotations

import base64
from copy import copy
from io import BytesIO
import json
from pathlib import Path
import sys

from openpyxl import load_workbook

TEMPLATE = Path(__file__).resolve().parents[1] / 'reference_data' / 'binary' / 'Official_RCSA_Template.xlsx'
FIRST_ROW = 8
DATA_COLS = range(3, 32)  # C through AE, as in the supplied official template
RISK_MERGE_COLS = (3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31)


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


def export(payload: dict) -> bytes:
    rows = payload.get('risks') or []
    if not rows:
        raise ValueError('لا توجد مخاطر محفوظة للتصدير.')
    if not TEMPLATE.is_file():
        raise FileNotFoundError('Official RCSA workbook template is missing')
    wb = load_workbook(TEMPLATE)
    ws = wb['Risk Profile']
    if str(ws['AE6'].value).strip() != 'ESG':
        raise ValueError('The template does not include the expected ESG column AE')

    # Make the bank's existing risk range reusable for an arbitrary count of
    # reviewed risks/controls. Keep every header cell, header merge, lookup
    # column and the other worksheets untouched.
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

    phase2c = payload.get('phase2c') or {}
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
            'H': 'نعم' if result.get('key_risk') == 'YES' else ('لا' if result.get('key_risk') == 'NO' else None),
            'I': d.get('expected_frequency_text'), 'J': c.get('individual_financial_impact_egp'),
            'K': c.get('expected_annual_loss_egp'), 'L': c.get('annualized_financial_rating'),
            'S': c.get('selected_workbook_rrf_key'), 'T': c.get('residual_financial_amount_egp'),
            'U': c.get('continuous_residual_rating'),
            'V': nfi.get('service'), 'W': nfi.get('reputation'),
            'X': nfi.get('regulatory'), 'Y': nfi.get('legal'),
            'Z': result.get('nfi_overall'), 'AA': result.get('acceptance_label_ar'),
            'AB': inputs.get('corrective_action') if result.get('acceptance_class') in (3, 4) else None,
            'AC': d.get('active_rationale_ar') or inputs.get('acceptance_rationale'),
            'AD': format_taxonomy_path(d),
            'AE': ', '.join(esg) if result.get('esg_status') == 'ASSESSED' else
                  ('لا توجد صلة موثقة' if result.get('esg_status') == 'NOT_APPLICABLE' else None),
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
            # Merge only per-risk columns, not per-control M:R. The header remains unchanged.
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
