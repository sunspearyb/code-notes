"""Help must remain legible Chinese via HTTP and direct local-file opening."""
from pathlib import Path
import unittest
from help_page import render_help
from serve import Handler


class HelpTests(unittest.TestCase):
    def test_render_preserves_chinese_and_escapes_source(self):
        page = render_help('# 接入说明\n\n核对来源后收入。`正文`\n\n```sh\n<测试>&\n```\n\n<script>bad()</script>')
        self.assertIn('<meta charset="utf-8">', page)
        self.assertIn('<h1>接入说明</h1>', page)
        self.assertIn('核对来源后收入。<code>正文</code>', page)
        self.assertIn('&lt;测试&gt;&amp;', page)
        self.assertNotIn('<script>', page)
        self.assertEqual(page.encode('utf-8').decode('utf-8'), page)

    def test_text_responses_declare_utf8(self):
        handler = Handler.__new__(Handler)
        self.assertEqual(handler.guess_type('本地助手接入.md'), 'text/plain; charset=utf-8')
        self.assertEqual(handler.guess_type('本地助手接入.html'), 'text/html; charset=utf-8')
        self.assertNotIn('charset', handler.guess_type('image.png'))

    def test_built_help_uses_current_markdown(self):
        root = Path(__file__).resolve().parent
        source = (root / '本地助手接入.md').read_text(encoding='utf-8')
        page = (root / '本地助手接入.html').read_text(encoding='utf-8')
        self.assertEqual(page, render_help(source))
        ui = (root / 'src/smart.js').read_text(encoding='utf-8')
        self.assertIn('href="./本地助手接入.html"', ui)
        self.assertNotIn('人工智能使用原则 · 查看原文', ui)
        self.assertIn('收入笔记前的审阅步骤保留', ui)


if __name__ == '__main__':
    unittest.main()
