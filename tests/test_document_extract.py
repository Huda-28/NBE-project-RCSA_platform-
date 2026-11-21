import tempfile
import unittest
import zipfile
from pathlib import Path
from rcsa_engine.document_extract import extract


class SupportingDocumentExtractTests(unittest.TestCase):
    def test_docx_extracts_real_paragraphs(self):
        with tempfile.TemporaryDirectory() as t:
            path = Path(t) / 'procedure.docx'
            with zipfile.ZipFile(path, 'w') as z:
                z.writestr('word/document.xml', '''<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>يجب التحقق من الطلب</w:t></w:r></w:p></w:body></w:document>''')
            result = extract(str(path))
            self.assertEqual(result['status'], 'EXTRACTED')
            self.assertIn('التحقق من الطلب', result['text'])

    def test_xlsx_extracts_shared_strings_and_numbers(self):
        with tempfile.TemporaryDirectory() as t:
            path = Path(t) / 'incident.xlsx'
            with zipfile.ZipFile(path, 'w') as z:
                z.writestr('xl/sharedStrings.xml', '''<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>حادث مسجل</t></si></sst>''')
                z.writestr('xl/worksheets/sheet1.xml', '''<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1"><v>150000</v></c></row></sheetData></worksheet>''')
            result = extract(str(path))
            self.assertEqual(result['status'], 'EXTRACTED')
            self.assertIn('حادث مسجل', result['text'])
            self.assertIn('150000', result['text'])

    def test_unsupported_or_empty_fails_safely(self):
        with tempfile.TemporaryDirectory() as t:
            path = Path(t) / 'photo.png'
            path.write_bytes(b'not interpreted')
            self.assertEqual(extract(str(path))['status'], 'MANUAL_REQUIRED')
            path = Path(t) / 'empty.pdf'
            path.write_bytes(b'corrupt file')
            self.assertEqual(extract(str(path))['status'], 'MANUAL_REQUIRED')

    def test_size_limit_is_enforced(self):
        with tempfile.TemporaryDirectory() as t:
            path = Path(t) / 'oversize.txt'
            with open(path, 'wb') as out:
                out.truncate(6 * 1024 * 1024 + 1)
            with self.assertRaisesRegex(ValueError, '6 MB'):
                extract(str(path))


if __name__ == '__main__':
    unittest.main()
