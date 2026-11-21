import io
import unittest
import zipfile
import xml.etree.ElementTree as ET
from rcsa_engine.export_flexible import export, TEMPLATE

try:
    from openpyxl import load_workbook  # type: ignore
except ImportError:
    load_workbook = None  # type: ignore


def _read_sheet_cells_and_merges(xlsx_bytes: bytes):
    """Read cell text values & merged ranges using openpyxl when available, or stdlib XML."""
    if load_workbook is not None:
        ws = load_workbook(io.BytesIO(xlsx_bytes))['Risk Profile']
        cells = {cell.coordinate: cell.value for row in ws.iter_rows() for cell in row if cell.value is not None}
        merges = {str(m) for m in ws.merged_cells.ranges}
        return cells, merges, ws

    ns = {'x': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
    with zipfile.ZipFile(io.BytesIO(xlsx_bytes)) as zf:
        shared_strings = []
        if 'xl/sharedStrings.xml' in zf.namelist():
            sst = ET.fromstring(zf.read('xl/sharedStrings.xml'))
            for si in sst.findall('x:si', ns):
                shared_strings.append(''.join(t.text or '' for t in si.findall('.//x:t', ns)))

        sheet = ET.fromstring(zf.read('xl/worksheets/sheet1.xml'))
        cells = {}
        for c in sheet.findall('.//x:sheetData/x:row/x:c', ns):
            ref = c.attrib.get('r')
            if not ref:
                continue
            ctype = c.attrib.get('t')
            if ctype == 'inlineStr':
                val = ''.join(t.text or '' for t in c.findall('.//x:t', ns))
            elif ctype == 's':
                v = c.find('x:v', ns)
                idx = int(v.text) if v is not None and v.text is not None else -1
                val = shared_strings[idx] if 0 <= idx < len(shared_strings) else None
            else:
                v = c.find('x:v', ns)
                val = v.text if v is not None else None
            if val is not None and val != '':
                cells[ref] = val
        merges = {mc.attrib['ref'] for mc in sheet.findall('.//x:mergeCells/x:mergeCell', ns) if 'ref' in mc.attrib}
        return cells, merges, None


class FlexibleBankTemplateTests(unittest.TestCase):
    def example(self, unit_id='BU-POS', risks=None, phase2c=None):
        if risks is None:
            risks = [{
                'risk_id': 'RSK-POS-NEW',
                'current_draft_input': {
                    'process_name': 'تشغيل نقاط البيع', 'risk_description': 'مخاطرة نقص التوثيق',
                    'expected_frequency_text': None, 'controls': [
                        {'control_description': 'مراجعة قيد الاستيفاء', 'effectiveness_raw': 'PENDING_REVIEW',
                         'implementation_status': 'PROPOSED'},
                        {'control_description': 'فحص يدوي', 'implementation_status': 'PROPOSED'},
                    ],
                },
                'calculated_output': {'expected_annual_loss_egp': None, 'residual_financial_amount_egp': None},
            }]
        return {'unit_id': unit_id, 'risks': risks, 'phase2c': phase2c or {}}

    def test_headers_styles_and_other_sheets_preserved(self):
        with open(TEMPLATE, 'rb') as f:
            src_cells, _, ws_source = _read_sheet_cells_and_merges(f.read())
        exp_cells, exp_merges, ws_export = _read_sheet_cells_and_merges(export(self.example()))
        self.assertEqual([src_cells.get(f'{c}6') for c in ('C', 'D', 'G', 'AD', 'AE')],
                         [exp_cells.get(f'{c}6') for c in ('C', 'D', 'G', 'AD', 'AE')])
        self.assertEqual(
            exp_cells.get('AA6'),
            'التقدير النهائي للمخاطرة ومدى فاعلية الإجراءات الرقابية المطبقة ككل',
        )
        self.assertEqual(exp_cells.get('G8'), 'مخاطرة نقص التوثيق')
        self.assertEqual(exp_cells.get('M8'), 'مراجعة قيد الاستيفاء')
        self.assertEqual(exp_cells.get('M9'), 'فحص يدوي')
        self.assertIn('G8:G9', exp_merges)
        self.assertIsNone(exp_cells.get('J8'))
        self.assertIsNone(exp_cells.get('T8'))
        if ws_source is not None and ws_export is not None:
            self.assertEqual(ws_export['G8'].font.name, ws_source['G8'].font.name)
            self.assertEqual(ws_export['G8'].font.sz, ws_source['G8'].font.sz)
            self.assertEqual(ws_export['G8'].fill.patternType, ws_source['G8'].fill.patternType)

    def test_esg_and_nfi_are_written_only_when_supported(self):
        p = self.example(phase2c={'RSK-POS-NEW': {'result': {
            'nfi_dimensions': {'service': 'M', 'reputation': '-', 'regulatory': '-', 'legal': '-'},
            'nfi_overall': 'M', 'esg_status': 'ASSESSED', 'esg_pillars': ['S'],
            'acceptance_label_ar': 'مخاطرة غير مقبولة والضوابط الرقابية تحتاج إلى تطوير',
            'acceptance_class': 3,
        }, 'inputs': {'corrective_action': 'استكمال المستندات'}}})
        cells, _, _ = _read_sheet_cells_and_merges(export(p))
        self.assertEqual(cells.get('V8'), 'M')
        self.assertEqual(cells.get('Z8'), 'M')
        self.assertEqual(cells.get('AE8'), 'S')
        self.assertEqual(cells.get('AB8'), 'استكمال المستندات')

    def test_class1_acceptance_suppresses_corrective_action_and_no_documented_link_esg(self):
        p = self.example(phase2c={'RSK-POS-NEW': {'result': {
            'nfi_dimensions': {'service': 'L', 'reputation': 'L', 'regulatory': 'L', 'legal': 'L'},
            'nfi_overall': 'L', 'esg_status': 'NO_DOCUMENTED_LINK', 'esg_pillars': [],
            'acceptance_label_ar': 'مخاطرة مقبولة / ضوابط رقابية كافية',
            'acceptance_class': 1,
        }, 'inputs': {'corrective_action': 'لا يجب أن يظهر هذا النص للفئة الأولى'}}})
        cells, _, _ = _read_sheet_cells_and_merges(export(p))
        self.assertIsNone(cells.get('AB8'))
        self.assertEqual(cells.get('AE8'), 'لا توجد صلة موثقة')

    def test_variable_risk_counts_do_not_copy_old_example_risks(self):
        risks = [dict(self.example()['risks'][0], risk_id=f'RSK-{i}',
                      current_draft_input={'risk_description': f'مخاطرة {i}', 'controls': []}) for i in range(5)]
        cells, _, _ = _read_sheet_cells_and_merges(export(self.example(risks=risks)))
        self.assertEqual(cells.get('G12'), 'مخاطرة 4')
        self.assertIsNone(cells.get('G13'))
        self.assertEqual(cells.get('AE6'), 'ESG')

    def test_empty_assessment_is_rejected(self):
        with self.assertRaises(ValueError):
            export(self.example(risks=[]))


if __name__ == '__main__':
    unittest.main()
