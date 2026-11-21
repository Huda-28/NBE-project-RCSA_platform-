import io
import unittest
from openpyxl import load_workbook
from rcsa_engine.export_flexible import export, TEMPLATE


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
        source = load_workbook(TEMPLATE)
        ws_source = source['Risk Profile']
        ws_export = load_workbook(io.BytesIO(export(self.example())))['Risk Profile']
        self.assertEqual([ws_source[f'{c}6'].value for c in ('C', 'D', 'G', 'AA', 'AD', 'AE')],
                         [ws_export[f'{c}6'].value for c in ('C', 'D', 'G', 'AA', 'AD', 'AE')])
        self.assertEqual(ws_export['G8'].value, 'مخاطرة نقص التوثيق')
        self.assertEqual(ws_export['M8'].value, 'مراجعة قيد الاستيفاء')
        self.assertEqual(ws_export['M9'].value, 'فحص يدوي')
        self.assertIn('G8:G9', {str(m) for m in ws_export.merged_cells.ranges})
        self.assertIsNone(ws_export['J8'].value)
        self.assertIsNone(ws_export['T8'].value)
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
        ws = load_workbook(io.BytesIO(export(p)))['Risk Profile']
        self.assertEqual(ws['V8'].value, 'M')
        self.assertEqual(ws['Z8'].value, 'M')
        self.assertEqual(ws['AE8'].value, 'S')
        self.assertEqual(ws['AB8'].value, 'استكمال المستندات')

    def test_variable_risk_counts_do_not_copy_old_example_risks(self):
        risks = [dict(self.example()['risks'][0], risk_id=f'RSK-{i}',
                      current_draft_input={'risk_description': f'مخاطرة {i}', 'controls': []}) for i in range(5)]
        ws = load_workbook(io.BytesIO(export(self.example(risks=risks))))['Risk Profile']
        self.assertEqual(ws['G12'].value, 'مخاطرة 4')
        self.assertIsNone(ws['G13'].value)
        self.assertEqual(ws['AE6'].value, 'ESG')

    def test_empty_assessment_is_rejected(self):
        with self.assertRaises(ValueError):
            export(self.example(risks=[]))


if __name__ == '__main__':
    unittest.main()
