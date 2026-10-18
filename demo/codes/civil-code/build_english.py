#!/usr/bin/env python3
"""Extract the NPC official English Civil Code PDF, downloaded 2026-10-18.

Source: http://en.npc.gov.cn.cdurl.cn/pdf/civilcodeofthepeoplesrepublicofchina.pdf
SHA-256: eecd83ed885676d77ea5e2939e687307c3fe4454bd803243161f87c734863521
Usage: python3 build_english.py --source /path/to/civil-english.pdf
Requires pdfplumber. Chinese DOCX conversion has no third-party dependencies.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import pdfplumber

PACK = Path(__file__).resolve().parent
SHA = 'eecd83ed885676d77ea5e2939e687307c3fe4454bd803243161f87c734863521'
URL = 'http://en.npc.gov.cn.cdurl.cn/pdf/civilcodeofthepeoplesrepublicofchina.pdf'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', required=True, type=Path)
    parser.add_argument('--out-dir', default=PACK, type=Path)
    args = parser.parse_args()
    if hashlib.sha256(args.source.read_bytes()).hexdigest() != SHA:
        raise ValueError('英文源文件校验值不一致')
    text, pages, current = {}, {}, None
    layout_marks = []
    with pdfplumber.open(args.source) as pdf:
        for page_number, page in enumerate(pdf.pages, 1):
            # A small x tolerance preserves the spaces in this typeset PDF.
            for row in page.extract_text_lines(x_tolerance=0.5):
                value = row['text'].strip()
                if re.fullmatch(r'\d+', value) and row['top'] > 750:
                    continue
                # Visually verified isolated typesetting dots before the next
                # Book/Chapter heading, outside Articles 462 and 647.
                if value == '.' and (page_number, current) in ((84, 'a462'), (118, 'a647')):
                    layout_marks.append({'page': page_number, 'afterArticle': current, 'text': value})
                    continue
                match = re.fullmatch(r'Article\s*(\d+)', value)
                if match:
                    n = int(match[1])
                    if n != len(text) + 1:
                        raise ValueError(f'英文条号断裂或重复：{n}')
                    current = f'a{n}'
                    text[current], pages[current] = [], [page_number]
                    continue
                if re.match(r'^(Book|Part|Chapter|Section)\s', value) or value == 'Supplementary Provisions':
                    current = None
                    continue
                if current is None:
                    continue
                if not text[current] or row['x0'] > 100:
                    text[current].append(value)
                else:
                    sep = '' if text[current][-1].endswith('-') else ' '
                    text[current][-1] += sep + value
                if pages[current][-1] != page_number:
                    pages[current].append(page_number)
        page_count = len(pdf.pages)
    chinese = json.loads((PACK / 'versions.json').read_text(encoding='utf-8'))
    expected = [u['id'] for u in chinese['units'] if u['versions']['2020']['exists']]
    if list(text) != expected or any(not paragraphs for paragraphs in text.values()):
        raise ValueError('英文本与中文条号未逐一对应，或出现空条文')
    if len(layout_marks) != 2:
        raise ValueError('PDF版面残留标点与已核对记录不一致')
    output = {'sources': {'2020': {'publisher': '全国人大英文网站', 'url': URL,
               'title': 'Civil Code of the People’s Republic of China', 'downloaded': '2026-10-18',
               'sha256': SHA, 'pages': page_count,
               'note': '官方参考译文，以中文本为准。译文中的男性单数代词通常亦涵盖对应的女性和中性代词，原译本另有说明。'}},
              'texts': {'2020': text}, 'amendments': {}, 'pageRefs': {'2020': pages},
              'validation': {'articleCount': len(text), 'allArticleNumbersMatchChinese': True,
                             'method': 'PDF按可见缩进恢复段落；合并排版换行；保留原译文词语和条文标点。',
                             'excludedLayoutMarks': layout_marks}}
    args.out_dir.mkdir(parents=True, exist_ok=True)
    (args.out_dir / 'english.json').write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'民法典英文：{len(text)} 条，原PDF {page_count} 页，全部条号与中文对应。')


if __name__ == '__main__':
    main()
