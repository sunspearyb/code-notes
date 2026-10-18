#!/usr/bin/env python3
"""Extract official NPC English HTML files downloaded 2026-10-18.

Sources and SHA-256: english-sources.json beside this script.
Usage: python3 build_english.py --source-dir /path/to/downloads
Only the standard library is needed. No translation is generated here.
"""
import argparse
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re

PACK = Path(__file__).resolve().parent


class Paragraphs(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.rows, self.chunks, self.active, self.heading = [], [], False, False

    def handle_starttag(self, tag, attrs):
        if tag == 'p':
            self.active, self.chunks = True, []
            self.heading = 'center' in dict(attrs).get('style', '')
        elif tag == 'br' and self.active:
            self.chunks.append('\n')

    def handle_data(self, value):
        if self.active:
            self.chunks.append(value)

    def handle_endtag(self, tag):
        if tag == 'p' and self.active:
            value = ''.join(self.chunks).replace('\xa0', ' ').strip()
            self.rows.append((value, self.heading))
            self.active = False


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-dir', required=True, type=Path)
    parser.add_argument('--out-dir', default=PACK, type=Path)
    args = parser.parse_args()
    manifest = json.loads((PACK / 'english-sources.json').read_text())
    chinese = json.loads((PACK / 'versions.json').read_text())
    combined, sources = {}, {}
    for law in manifest:
        translated, current = {}, None
        for source in law['files']:
            raw = (args.source_dir / source['file']).read_bytes()
            if hashlib.sha256(raw).hexdigest() != source['sha256']:
                raise ValueError(f"英文源文件校验值不一致：{source['file']}")
            html = raw.decode('utf-8')
            if '<!--enpcontent-->' not in html or '<!--/enpcontent-->' not in html:
                raise ValueError('官方网页正文标记缺失')
            html = html.split('<!--enpcontent-->', 1)[1].split('<!--/enpcontent-->', 1)[0]
            p = Paragraphs()
            p.feed(html)
            for value, heading in p.rows:
                m = re.match(r'^Article\s+(\d+)\b\s*(.*)$', value, re.S)
                if m:
                    n = int(m[1])
                    if n != len(translated) + 1:
                        raise ValueError(f"{law['name']} 英文条号断裂或重复：{n}")
                    current = law['prefix'] + str(n)
                    translated[current] = [m[2].strip()] if m[2].strip() else []
                elif heading:
                    current = None
                elif current and value:
                    translated[current].append(value)
        expected = [u['id'] for u in chinese['units'] if u['id'].startswith(law['prefix']) and u['versions']['2021']['exists']]
        if list(translated) != expected or any(not ps for ps in translated.values()):
            raise ValueError(f"{law['name']} 英文未逐条对应中文，禁止输出不完整译本")
        combined.update(translated)
        source = {'publisher': '全国人大英文网站', 'title': law['name'], 'url': law['files'][0]['url'],
                  'downloaded': '2026-10-18', 'files': law['files'],
                  'note': '2021年通过文本的官方参考译文；2025年合编快照沿用同一文本，以中文本为准。'}
        for year in (2021, 2025):
            sources[f"{law['nodeId']}:{year}"] = source
        print(f"{law['name']}：{len(translated)} 条，全部与中文条号对应。")
    output = {'sources': sources, 'texts': {'2021': combined, '2025': combined}, 'amendments': {},
              'validation': {'allIncludedArticleNumbersMatchChinese': True, 'articlesPerSnapshot': len(combined)},
              'notIncluded': [{'law': '网络安全法', 'years': [2016, 2021, 2025],
                               'reason': '截至2026-10-18，未找到可核实的官方英文全文；未以新闻报道或非官方译文替代。'}]}
    args.out_dir.mkdir(parents=True, exist_ok=True)
    (args.out_dir / 'english.json').write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
