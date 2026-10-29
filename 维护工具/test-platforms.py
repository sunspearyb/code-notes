"""Regression checks for Android asset names and every generated web menu target.

Run after demo/build.py: python3 维护工具/test-platforms.py [pure-source-folder]
No Android SDK, signing key, browser, or personal data required.
"""
import importlib.util
import json
from html import unescape
from pathlib import Path
import re
import struct
import sys
import tempfile
import unittest
import zipfile

sys.dont_write_bytecode = True
ROOT = Path(sys.argv.pop(1)).resolve() if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('editions', Path(__file__).with_name('制作各终端版本.py'))
editions = importlib.util.module_from_spec(spec)
spec.loader.exec_module(editions)


class PlatformTests(unittest.TestCase):
    def test_android_aapt_utf8_names_survive_dex(self):
        with tempfile.TemporaryDirectory() as tmp:
            apk, dex = Path(tmp) / 'base.apk', Path(tmp) / 'classes.dex'
            expected = {'assets/index.html': b'home', 'assets/法典笔记.html': b'home',
                        'assets/法典笔记-civil-code.html': b'civil', 'assets/法典笔记-cyber-law.html': b'cyber'}
            with zipfile.ZipFile(apk, 'w', zipfile.ZIP_DEFLATED) as archive:
                for name, data in expected.items():
                    archive.writestr(name, data)
            # Reproduce AAPT's valid UTF-8 bytes without its UTF-8 flag.
            raw = bytearray(apk.read_bytes())
            with zipfile.ZipFile(apk) as archive:
                for info in archive.infolist():
                    struct.pack_into('<H', raw, info.header_offset + 6, info.flag_bits & ~0x800)
                offset = archive.start_dir
                for _ in archive.infolist():
                    flags = struct.unpack_from('<H', raw, offset + 8)[0]
                    struct.pack_into('<H', raw, offset + 8, flags & ~0x800)
                    name_len, extra_len, comment_len = struct.unpack_from('<HHH', raw, offset + 28)
                    offset += 46 + name_len + extra_len + comment_len
            apk.write_bytes(raw)
            dex.write_bytes(b'dex-test')
            editions.android.append_dex(apk, dex)
            with zipfile.ZipFile(apk) as archive:
                self.assertIsNone(archive.testzip())
                for name, data in expected.items():
                    self.assertEqual(archive.read(name), data)
                self.assertEqual(archive.read('classes.dex'), b'dex-test')

    def check_routes(self, folder):
        pages = list(folder.rglob('index.html'))
        self.assertEqual(len(pages), 3)
        for page in pages:
            html = page.read_text(encoding='utf-8')
            routes = json.loads(unescape(re.search(r'<meta name="fadian-web-routes" content="(.*?)">', html)[1]))
            self.assertEqual(len(routes), 3)
            for code_id, href in routes.items():
                target = (page.parent / href).resolve()
                self.assertTrue(target.is_relative_to(folder.resolve()))
                data = json.loads(re.search(r'<script id="content-data" type="application/json">(.*?)</script>', target.read_text(encoding='utf-8'), re.S)[1])
                self.assertEqual(data['codex']['id'], code_id)

    def test_standalone_web_archives_have_all_destinations(self):
        with tempfile.TemporaryDirectory() as tmp:
            original = editions.DIST
            try:
                editions.DIST = Path(tmp)
                for name in ['constitution', 'civil-code', 'cyber-law']:
                    pack = editions.Pack(ROOT, name)
                    folder, archive = editions.make_web(pack.page, 'regression', pack)
                    self.check_routes(folder)
                    extracted = Path(tmp) / ('unzipped-' + name)
                    with zipfile.ZipFile(archive) as z:
                        z.extractall(extracted)
                    self.check_routes(extracted / folder.name)
            finally:
                editions.DIST = original

    def test_hosted_urls_remain_unchanged(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            for name in ['constitution', 'civil-code', 'cyber-law']:
                pack = editions.Pack(ROOT, name)
                editions.make_web(pack.page, 'regression', pack, folder)
            for path in ['index.html', 'civil-code/index.html', 'cyber-law/index.html']:
                self.assertTrue((folder / path).is_file())
            self.check_routes(folder)


if __name__ == '__main__':
    unittest.main()
