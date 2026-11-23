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

    def test_arabic_tounicode_cmap_and_objstm_pdf_extraction(self):
        import zlib
        with tempfile.TemporaryDirectory() as t:
            # Build a real PDF with compressed /ObjStm page + /ToUnicode CMap Arabic font + a decoy binary font stream
            cmap = (
                b'/CIDInit /ProcSet findresource begin\n12 dict begin begincmap\n'
                b'4 beginbfchar\n<0001> <062D>\n<0002> <0648>\n<0003> <0627>\n<0004> <0644>\n'
                b'<0005> <0629>\n<0006> <0020>\nendbfchar\nendcmap\n'
            )
            cmap_z = zlib.compress(cmap)
            # Visual LTR glyphs for 'حوالة' = ['ة', 'ل', 'ا', 'و', 'ح'] => <00050004000300020001>
            content = b'BT /F1 12 Tf 1 0 0 1 400 700 Tm [<00050004000300020001>] TJ ET'
            content_z = zlib.compress(content)
            # Decoy FontFile2 binary stream that used to produce gibberish under naive regex
            decoy_font = zlib.compress(b'\x00\x01\x00\x00(NuXJ|Y28e) Tj \x13\x14\x0c\x1e\x1a')

            page_obj = b'<</Type/Page/Parent 2 0 R/Resources<</Font<</F1 4 0 R>>>>/Contents 6 0 R>>'
            objstm_hdr = f'3 0 '.encode('ascii')
            objstm_data = zlib.compress(objstm_hdr + page_obj)

            pdf = (
                b'%PDF-1.7\n'
                b'1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n'
                b'2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n'
                b'4 0 obj<</Type/Font/Subtype/Type0/Encoding/Identity-H/ToUnicode 5 0 R>>endobj\n'
                b'5 0 obj<</Length ' + str(len(cmap_z)).encode() + b'/Filter/FlateDecode>>stream\n' + cmap_z + b'\nendstream\nendobj\n'
                b'6 0 obj<</Length ' + str(len(content_z)).encode() + b'/Filter/FlateDecode>>stream\n' + content_z + b'\nendstream\nendobj\n'
                b'7 0 obj<</Type/FontFile2/Length ' + str(len(decoy_font)).encode() + b'/Filter/FlateDecode>>stream\n' + decoy_font + b'\nendstream\nendobj\n'
                b'8 0 obj<</Type/ObjStm/N 1/First ' + str(len(objstm_hdr)).encode() + b'/Length ' + str(len(objstm_data)).encode() + b'/Filter/FlateDecode>>stream\n' + objstm_data + b'\nendstream\nendobj\n'
                b'%%EOF\n'
            )
            p = Path(t) / 'arabic_cmap.pdf'
            p.write_bytes(pdf)
            result = extract(str(p))
            self.assertEqual(result['status'], 'EXTRACTED')
            self.assertIn('حوالة', result['text'])
            self.assertNotIn('NuXJ', result['text'])

    def test_real_transfers_arabic_pdf_extracts_clean_arabic(self):
        sample = Path('data/uploads/BU-SWIFT-SETTLE/1794514361443_دليل_اجراءات_العمل_الافتراضية_لاعمال_الحوالات.pdf')
        if not sample.is_file():
            self.skipTest('Sample Arabic transfers PDF not present')
        result = extract(str(sample))
        self.assertEqual(result['status'], 'EXTRACTED')
        self.assertIn('الحوالات', result['text'])
        self.assertIn('SWIFT', result['text'])
        self.assertNotIn('0NuXJ', result['text'])

    def test_valid_png_reports_vision_required(self):
        from rcsa_engine.document_extract import _encode_png_rgb_or_gray
        with tempfile.TemporaryDirectory() as t:
            png_bytes = _encode_png_rgb_or_gray(4, 4, 3, b'\xff\x00\x00' * 16)
            self.assertIsNotNone(png_bytes)
            p = Path(t) / 'table_scan.png'
            p.write_bytes(png_bytes)
            result = extract(str(p))
            self.assertEqual(result['status'], 'VISION_REQUIRED')
            self.assertTrue(result['is_image'])
            self.assertTrue(result['needs_vision'])
            self.assertEqual(result['mime_type'], 'image/png')

    def test_pdf_multicolumn_table_reconstruction_to_markdown(self):
        with tempfile.TemporaryDirectory() as t:
            # Multi-column table rows at X=420 (col 1) and X=140 (col 2) across Y=700 and Y=670
            content = (
                b'BT /F1 11 Tf '
                b'1 0 0 1 140 700 Tm (Risk_Event) Tj '
                b'1 0 0 1 420 700 Tm (Control_Owner) Tj '
                b'1 0 0 1 140 670 Tm (Delay_SWIFT) Tj '
                b'1 0 0 1 420 670 Tm (Ops_Manager) Tj '
                b'ET'
            )
            pdf = (
                b'%PDF-1.4\n'
                b'1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n'
                b'2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n'
                b'3 0 obj<</Type/Page/Parent 2 0 R/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>endobj\n'
                b'4 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n'
                b'5 0 obj<</Length ' + str(len(content)).encode() + b'>>stream\n' + content + b'\nendstream\nendobj\n'
                b'%%EOF\n'
            )
            p = Path(t) / 'table_pdf.pdf'
            p.write_bytes(pdf)
            result = extract(str(p))
            self.assertEqual(result['status'], 'EXTRACTED')
            self.assertTrue(result['has_tables'])
            self.assertGreaterEqual(result['table_count'], 1)
            self.assertIn('| Risk_Event | Control_Owner |', result['text'])
            self.assertIn('| --- | --- |', result['text'])
            self.assertIn('| Delay_SWIFT | Ops_Manager |', result['text'])

    def test_pdf_embedded_jpeg_extraction_for_vision(self):
        from rcsa_engine.document_extract import extract_embedded_images
        with tempfile.TemporaryDirectory() as t:
            # Minimal valid JPEG SOI + APP0 header + EOI wrapped inside PDF Image XObject
            fake_jpeg = b'\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00\xff\xd9'
            pdf = (
                b'%PDF-1.4\n'
                b'1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n'
                b'2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n'
                b'3 0 obj<</Type/Page/Parent 2 0 R/Resources<</XObject<</Im1 4 0 R>>>>/Contents 5 0 R>>endobj\n'
                b'4 0 obj<</Type/XObject/Subtype/Image/Width 100/Height 80/ColorSpace/DeviceRGB/BitsPerComponent 8/Filter/DCTDecode/Length '
                + str(len(fake_jpeg)).encode() + b'>>stream\n' + fake_jpeg + b'\nendstream\nendobj\n'
                b'5 0 obj<</Length 15>>stream\n/Im1 Do\nendstream\nendobj\n'
                b'%%EOF\n'
            )
            p = Path(t) / 'scanned_jpeg.pdf'
            p.write_bytes(pdf)
            meta = extract(str(p))
            self.assertTrue(meta['needs_vision'])
            self.assertEqual(meta['embedded_image_count'], 1)
            out_dir = Path(t) / 'imgs'
            extracted = extract_embedded_images(str(p), str(out_dir))
            self.assertEqual(len(extracted['images']), 1)
            img_info = extracted['images'][0]
            self.assertEqual(img_info['mime_type'], 'image/jpeg')
            self.assertTrue(Path(img_info['path']).read_bytes().startswith(b'\xff\xd8\xff'))


if __name__ == '__main__':
    unittest.main()
