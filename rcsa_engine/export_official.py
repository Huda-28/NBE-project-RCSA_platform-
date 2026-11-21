"""Preserve the supplied official template while exporting a reviewed Syndicated Loans RCSA.

Run with JSON on stdin and output base64-encoded XLSX on stdout.
Uses only the Python standard library and fails closed for unapproved inputs.
"""
from __future__ import annotations
import base64
import json
import os
from pathlib import Path
import sys
import tempfile
import zipfile
import re
from html import escape as xml_escape


TEMPLATE = Path(__file__).resolve().parents[1] / "reference_data" / "binary" / "Official_RCSA_Template.xlsx"


def format_taxonomy_path(d: dict) -> str | None:
    l1_id = d.get("taxonomy_l1_id")
    l1_ar = d.get("taxonomy_l1_ar")
    l2_id = d.get("taxonomy_l2_id")
    l2_ar = d.get("taxonomy_l2_ar")
    l3_id = d.get("taxonomy_l3_id")
    l3_ar = d.get("taxonomy_l3_ar")

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
    if payload.get("unit_id") != "BU-SYNDICATED":
        raise ValueError("تصدير التنسيق المرجعي المتاح مخصص حاليًا للقروض المشتركة؛ ملف القالب لهذه الوحدة الأخرى غير متوفر.")
    risks = payload.get("risks") or []
    if len(risks) != 8:
        raise ValueError("لا يمكن تصدير القالب المرجعي: يلزم مطابقة المخاطر الثماني الخاصة بالقروض المشتركة.")
    phase2c = payload.get("phase2c") or {}
    for r in risks:
        entry = phase2c.get(r["risk_id"])
        if not entry or not entry.get("result", {}).get("ready_for_export"):
            raise ValueError(f"يجب استكمال NFI وESG وتصنيف القبول قبل التصدير: {r['risk_id']}")
    if not TEMPLATE.is_file():
        raise FileNotFoundError("Original official Excel template is missing")
    rows_used = set()
    changed_cells: dict[str, str | int | float] = {}

    def write_cell(address: str, value):
        if not re.fullmatch(r"(?:[A-Z]{1,2})(?:[1-9][0-9]*)", address):
            raise ValueError("Invalid cell reference")
        if not isinstance(value, (str, int, float)) or isinstance(value, bool):
            raise ValueError("Unsupported exported cell value")
        changed_cells[address] = value

    for risk in risks:
        row = risk.get("excel_row")
        if not isinstance(row, int) or row < 8 or row > 27 or row in rows_used:
            raise ValueError("Invalid or duplicate historical risk row; cannot safely write the official template")
        rows_used.add(row)
        d = risk.get("current_draft_input") or {}
        c = risk.get("calculated_output") or {}
        meta = phase2c[risk["risk_id"]]
        f = meta["inputs"]
        v = meta["result"]
        source = risk.get("original_source") or {}
        ctrl_rows = source.get("control_rows") or [row]
        ctrls = d.get("controls") or []
        if len(ctrl_rows) < len(ctrls):
            raise ValueError("More controls than source template has rows; refusing to overwrite other risks")
        values = {
            "D": d.get("process_name"), "E": d.get("strategic_objective"),
            "F": d.get("risk_library_name"), "G": d.get("risk_description"),
            "H": "نعم" if v["key_risk"] == "YES" else "لا" if v["key_risk"] == "NO" else None,
            "I": d.get("expected_frequency_text"),
            "J": c.get("individual_financial_impact_egp"), "K": c.get("expected_annual_loss_egp"),
            "L": c.get("annualized_financial_rating"),
            "S": c.get("selected_workbook_rrf_key"), "T": c.get("residual_financial_amount_egp"),
            "U": c.get("continuous_residual_rating"),
            "V": v["nfi_dimensions"]["service"], "W": v["nfi_dimensions"]["reputation"],
            "X": v["nfi_dimensions"]["regulatory"], "Y": v["nfi_dimensions"]["legal"],
            "Z": v["nfi_overall"], "AA": v["acceptance_label_ar"],
            "AB": f.get("corrective_action") if v["acceptance_class"] in (3, 4) else None,
            "AC": d.get("active_rationale_ar") or f.get("acceptance_rationale"),
            "AD": format_taxonomy_path(d),
            "AE": ", ".join(v["esg_pillars"]) if v["esg_status"] == "ASSESSED" else "لا توجد صلة موثقة",
        }
        for col, value in values.items():
            if value is not None:
                write_cell(f"{col}{row}", value)
        for idx, control in enumerate(ctrls):
            control_row = int(ctrl_rows[idx])
            if control_row < 8 or control_row > 27:
                raise ValueError("Control row out of original template range")
            for col, key in (("M", "control_description"), ("N", "control_owner"),
                             ("O", "control_method_raw"), ("P", "effectiveness_raw"),
                             ("Q", "control_frequency_raw"), ("R", "control_type_raw")):
                value = control.get(key)
                if value is not None:
                    write_cell(f"{col}{control_row}", value)
    fd, output_path = tempfile.mkstemp(suffix=".xlsx")
    os.close(fd)
    try:
        # Preserve the bank workbook XML package, including styles, merges,
        # formulas, helper tables and all unrelated worksheets unchanged.
        with zipfile.ZipFile(TEMPLATE) as original:
            source_xml = original.read('xl/worksheets/sheet1.xml').decode('utf-8')
            for address, value in changed_cells.items():
                pattern = re.compile(r'<c\b(?=[^>]*\br="' + re.escape(address) + r'")[^>]*?(?:/>|>.*?</c>)', re.DOTALL)
                match = pattern.search(source_xml)
                if not match:
                    raise ValueError(f"Missing original template cell {address}; cannot preserve structure")
                original_open = match.group(0).split('>', 1)[0].rstrip('/>')
                base = re.sub(r'\s+t="[^"]*"', '', original_open)
                if type(value) in (int, float):
                    replacement_cell = f'{base} t="n"><v>{value}</v></c>'
                else:
                    replacement_cell = f'{base} t="inlineStr"><is><t>{xml_escape(str(value), quote=False)}</t></is></c>'
                source_xml = source_xml[:match.start()] + replacement_cell + source_xml[match.end():]
            with zipfile.ZipFile(output_path, 'w') as output:
                for entry in original.infolist():
                    blob = source_xml.encode('utf-8') if entry.filename == 'xl/worksheets/sheet1.xml' else original.read(entry.filename)
                    output.writestr(entry, blob)
        return Path(output_path).read_bytes()
    finally:
        if Path(output_path).exists():
            Path(output_path).unlink()


def main():
    data = json.load(sys.stdin)
    out = export(data)
    sys.stdout.write(base64.b64encode(out).decode("ascii"))


if __name__ == "__main__":
    main()
