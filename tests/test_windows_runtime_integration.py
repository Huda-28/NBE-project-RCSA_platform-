import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]

class WindowsRuntimeIntegrationTest(unittest.TestCase):
    def test_backend_uses_portable_python(self):
        for filename in ('src/server/api.ts', 'src/server/hitl-service.ts'):
            content = (ROOT / filename).read_text(encoding='utf-8')
            self.assertIn('getPythonExecutable()', content)
            self.assertNotIn("execFileSync('python3'", content)

    def test_frontend_excludes_unwanted_messages(self):
        for filename in ('src/components/Header.tsx', 'src/pages/AIAgentPage.tsx'):
            content = (ROOT / filename).read_text(encoding='utf-8')
            self.assertNotIn('منظومة الحساب المنهجي المعتمد', content)
            self.assertNotIn('إشعار حوكمة التطوير وضبط الجودة', content)
            self.assertNotIn('يُمنع منعاً باتاً فبركة استجابات وهمية', content)

    def test_dependencies_match_vite(self):
        import json
        package = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))
        self.assertEqual(package['devDependencies']['esbuild'], '^0.28.0')

if __name__ == '__main__':
    unittest.main()
