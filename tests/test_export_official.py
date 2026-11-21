"""Structural export contract tests; test review values are NOT bank approvals."""
import io
import unittest
import zipfile
import xml.etree.ElementTree as ET

from rcsa_engine.cli_bridge import initialize_unit_packages
from rcsa_engine.export_official import export, TEMPLATE
from rcsa_engine.phase2c import evaluate_phase2c


class OfficialTemplatePreservationTests(unittest.TestCase):
    def test_export_keeps_original_package_and_merged_cells(self):
        risks = initialize_unit_packages('BU-SYNDICATED')['risk_items']
        assessments = {}
        for risk in risks:
            inputs = {
                'financial_rating': risk['calculated_output'].get('annualized_financial_rating'),
                'nfi': {dim: {'rating': '-', 'evidence': 'TEST FIXTURE ONLY'} for dim in ('service', 'reputation', 'regulatory', 'legal')},
                'esg': {'status': 'NO_DOCUMENTED_LINK', 'pillars': [], 'justification': 'TEST FIXTURE ONLY'},
                'acceptance_class': 1,
                'acceptance_rationale': 'TEST FIXTURE ONLY',
                'corrective_action': '',
            }
            assessments[risk['risk_id']] = {'inputs': inputs, 'result': evaluate_phase2c(inputs)}
        result = export({'unit_id': 'BU-SYNDICATED', 'risks': risks, 'phase2c': assessments})
        with zipfile.ZipFile(TEMPLATE) as original, zipfile.ZipFile(io.BytesIO(result)) as exported:
            self.assertIsNone(exported.testzip())
            self.assertEqual(set(exported.namelist()), set(original.namelist()))
            ns = {'x': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
            for zipped in (original, exported):
                sheet = ET.fromstring(zipped.read('xl/worksheets/sheet1.xml'))
                self.assertEqual(len(sheet.find('x:mergeCells', ns)), 34)
            self.assertEqual(original.read('xl/styles.xml'), exported.read('xl/styles.xml'))
            self.assertEqual(original.read('xl/workbook.xml'), exported.read('xl/workbook.xml'))

    def test_rejects_incomplete_assessment(self):
        risks = initialize_unit_packages('BU-SYNDICATED')['risk_items']
        with self.assertRaises(ValueError):
            export({'unit_id': 'BU-SYNDICATED', 'risks': risks, 'phase2c': {}})


if __name__ == '__main__':
    unittest.main()
