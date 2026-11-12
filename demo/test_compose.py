#!/usr/bin/env python3
"""Modules: putting codes together (compose.py) and cutting a document into a module (make_pack.py)."""
import json
from pathlib import Path
import shutil
import sys
import tempfile
import unittest
sys.dont_write_bytecode = True
import compose
import make_pack

ROOT = Path(__file__).resolve().parent


class ComposeTest(unittest.TestCase):
    def setUp(self):
        self.temp = Path(tempfile.mkdtemp())
        shutil.copytree(ROOT / 'codes', self.temp / 'codes')
        shutil.copytree(ROOT / 'modules', self.temp / 'modules')
        self.saved = compose.CODES, compose.MODULES, compose.LAUNCHERS
        compose.CODES, compose.MODULES, compose.LAUNCHERS = self.temp / 'codes', self.temp / 'modules', self.temp

    def tearDown(self):
        compose.CODES, compose.MODULES, compose.LAUNCHERS = self.saved
        shutil.rmtree(self.temp)

    def test_composed_codes_are_up_to_date(self):
        # Composing again must not change a single byte of the packs kept in the project.
        for name in ('cyber-law',):
            before = {p.name: p.read_bytes() for p in (ROOT / 'codes' / name).glob('*.json')}
            self.assertTrue(compose.compose(name))
            for file, content in before.items():
                self.assertEqual((self.temp / 'codes' / name / file).read_bytes(), content, f'{name}/{file}')

    def test_split_and_regroup(self):
        pack = self.temp / 'codes/cyber-law'
        codex = json.loads((pack / 'codex.json').read_text(encoding='utf-8'))
        codex['modules'] = ['personal-information', 'data-security']
        (pack / 'codex.json').write_text(json.dumps(codex, ensure_ascii=False), encoding='utf-8')
        compose.compose('cyber-law')
        history = json.loads((pack / 'versions.json').read_text(encoding='utf-8'))
        self.assertEqual(history['years'], [2021])
        self.assertEqual([u['id'] for u in history['units']][:1] + [u['id'] for u in history['units']][-1:], ['pi1', 'ds55'])
        self.assertEqual(len(history['units']), 74 + 55)
        codex = json.loads((pack / 'codex.json').read_text(encoding='utf-8'))
        self.assertEqual([n['id'] for n in codex['structure']], ['personal-information', 'data-security'])
        self.assertTrue(all(key.startswith(('pi', 'ds')) for key in json.loads((pack / 'subtitles.json').read_text(encoding='utf-8'))))

    def test_missing_module_and_clashing_ids(self):
        pack = self.temp / 'codes/cyber-law'
        codex = json.loads((pack / 'codex.json').read_text(encoding='utf-8'))
        for modules in (['no-such-module'], ['cybersecurity', 'cybersecurity'], [{'code': 'constitution'}, {'code': 'civil-code'}]):
            codex['modules'] = modules
            (pack / 'codex.json').write_text(json.dumps(codex, ensure_ascii=False), encoding='utf-8')
            with self.assertRaises(SystemExit):
                compose.compose('cyber-law')


class CutTest(unittest.TestCase):
    def test_law(self):
        rows = ['某办法', '目录', '第一章　总则', '第二章　附则', '第一章　总则', '第一条　为了测试，制定本办法。', '第二条 适用范围。', '前款另有规定的除外。', '第二章　附则', '第三条　自公布之日起施行。']
        units, structure, kind = make_pack.cut(rows, 'tr')
        self.assertEqual(kind, 'law')
        self.assertEqual([(u['id'], u['label'], u['paragraphs']) for u in units], [
            ('tr1', '第一条', ['为了测试，制定本办法。']), ('tr2', '第二条', ['适用范围。', '前款另有规定的除外。']), ('tr3', '第三条', ['自公布之日起施行。'])])
        self.assertEqual([(n['level'], n['name'], n['from'], n['to']) for n in structure], [('chapter', '总则', 'tr1', 'tr2'), ('chapter', '附则', 'tr3', 'tr3')])

    def test_inserted_articles(self):
        rows = ['第一章　总则', '第一条　甲。', '第二条　乙。', '第二条之一　丙。', '第二条之二　丁。', '第二章　附则', '第三条　戊。']
        units, structure, _ = make_pack.cut(rows, 'xs')
        self.assertEqual([(u['id'], u['label'], u['number']) for u in units], [
            ('xs1', '第一条', 1), ('xs2', '第二条', 2), ('xs2-1', '第二条之一', None), ('xs2-2', '第二条之二', None), ('xs3', '第三条', 3)])
        self.assertEqual([(n['from'], n['to']) for n in structure], [('xs1', 'xs2-2'), ('xs3', 'xs3')])
        with self.assertRaises(SystemExit):
            make_pack.cut(['第一条 甲', '第二条 乙', '第二条之二 丙'], 'x')

    def test_policy_and_plain_text(self):
        units, structure, kind = make_pack.cut(['关于某事的意见', '各单位：', '一、总体要求', '坚持问题导向。', '二、主要任务', '（一）完善制度。', '三、保障', '高度重视。'], 'tp')
        self.assertEqual((kind, structure), ('items', []))
        self.assertEqual([(u['kind'], u['label'], u['paragraphs']) for u in units], [
            ('preamble', '引言', ['关于某事的意见', '各单位：']), ('item', '一、总体要求', ['坚持问题导向。']),
            ('item', '二、主要任务', ['（一）完善制度。']), ('item', '三、保障', ['高度重视。'])])
        units, _, kind = make_pack.cut(['第一段文字。', '第二段文字。'], 'x')
        self.assertEqual((kind, [u['label'] for u in units]), ('paragraphs', ['第一段', '第二段']))

    def test_numbers(self):
        for n in (1, 10, 11, 20, 21, 100, 101, 110, 111, 120, 1000, 1001, 1010, 1100, 1260):
            self.assertEqual(make_pack.number(make_pack.cn_number(n)), n)
        with self.assertRaises(SystemExit):
            make_pack.cut(['第一条 甲', '第三条 乙', '第四条 丙'], 'x')


if __name__ == '__main__':
    unittest.main()
