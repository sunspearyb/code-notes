#!/usr/bin/env python3
"""Build english.json: official English translations of the 1982 and 2018 texts and the five amendments.

Maintenance tool for the constitution pack; the page only reads english.json.

Sources, both published by the National People's Congress:
- 2018 text and the 2018 amendment: the NPC English website (en.npc.gov.cn.cdurl.cn), which
  labels its law translations "for reference only".
- 1982 original text and the 1988, 1993, 1999 and 2004 amendments: the former NPC English
  website (www.npc.gov.cn/englishnpc), now offline, read from Internet Archive snapshots.

Every article and amendment is checked against the Chinese data in versions.json by number,
so a missing or extra article stops the build. Downloads are cached in --cache.
"""
import argparse
import datetime
import html
import json
from pathlib import Path
import re
import sys
import time
import urllib.request

PACK = Path(__file__).resolve().parent
OLD = 'http://www.npc.gov.cn/englishnpc/Constitution/'
ARCHIVE = 'https://web.archive.org/web/{stamp}id_/{url}'
# Snapshot times come from the Internet Archive index (CDX) of the former NPC English website.
PAGES_1982 = [  # (path, snapshot); the old index page lists Section 1 under the wrong address
    ('2007-11/14/content_1372974.htm', '20111124181320'), ('2007-11/14/content_1372953.htm', '20111124181256'),
    ('2007-11/09/content_1372846.htm', '20111124181250'), ('2007-11/14/content_1372972.htm', '20111124181315'),
    ('2007-11/14/content_1372954.htm', '20111124181300'), ('2007-11/14/content_1372955.htm', '20111124181305'),
    ('2007-11/14/content_1372956.htm', '20111124181309'), ('2007-11/15/content_1372982.htm', '20111124181325'),
    ('2007-11/15/content_1372983.htm', '20111124181330'), ('2007-11/15/content_1372984.htm', '20111124181335'),
    ('2007-11/15/content_1372985.htm', '20111123184632'),
]
AMENDMENTS_OLD = {1988: ('node_2829.htm', '20111124121110'), 1993: ('node_2828.htm', '20090713071415'),
                  1999: ('node_2827.htm', '20090713071041'), 2004: ('node_2826.htm', '20080613131632')}
NEW = 'http://en.npc.gov.cn.cdurl.cn/'
PAGE_2018, AMENDMENT_2018 = '2018-03/11/c_1145393.htm', '2018-03/11/c_1145428.htm'
AMENDMENT_NUMBERS = {1988: range(1, 3), 1993: range(3, 12), 1999: range(12, 18), 2004: range(18, 32), 2018: range(32, 53)}
CN = '零一二三四五六七八九'


def cn_number(n):
    if n < 10:
        return CN[n]
    if n < 20:
        return '十' + (CN[n % 10] if n % 10 else '')
    if n < 100:
        return CN[n // 10] + '十' + (CN[n % 10] if n % 10 else '')
    rest = n % 100
    return CN[n // 100] + '百' + ('' if not rest else ('零' + CN[rest] if rest < 10 else ('一' + cn_number(rest) if rest < 20 else cn_number(rest))))


def fetch(url, cache):
    target = cache / re.sub(r'[^\w.-]+', '_', url)
    if target.exists():
        return target.read_bytes().decode('utf-8', 'replace')
    for attempt in range(5):
        try:
            request = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (fadian-notes source check)'})
            with urllib.request.urlopen(request, timeout=90) as response:
                raw = response.read()
            if b'Constitution' in raw or b'Amendment' in raw:
                target.write_bytes(raw)
                return raw.decode('utf-8', 'replace')
        except OSError as error:
            print('  重试：', url, error)
        time.sleep(3 + attempt * 3)
    sys.exit('无法取得：' + url)


def lines(page):
    # Keep only the article body: NPC pages end it with an enpcontent comment, the old
    # index pages with the right-column comment; related-news links follow.
    for marker in ('<!--/enpcontent-->', '<!--right end'):
        if marker in page:
            page = page[:page.index(marker)]
            break
    page = re.sub(r'(?s)<script.*?</script>|<style.*?</style>|<!--.*?-->', '', page)
    text = html.unescape(re.sub(r'<[^>]+>', '\n', page)).replace('\xa0', ' ')
    return [re.sub(r'[ \t]+', ' ', line).strip() for line in text.split('\n') if line.strip()]


HEADING = re.compile(r'^(Chapter [IVXⅠ-Ⅻ]+|Section \d+)\b')


def parse_text(rows, last_article):
    """Preamble paragraphs and articles, from lines that start at the preamble heading."""
    preamble, articles, current = [], {}, None
    for row in rows:
        if row == 'Preamble':
            current = 'preamble'
            continue
        if HEADING.match(row):
            current = 'heading'
            continue
        match = re.match(r'^Article (\d+)\b\.?\s*(.*)$', row)
        if match and int(match[1]) == len(articles) + 1:
            current = int(match[1])
            articles[current] = [match[2]] if match[2] else []
            continue
        if current == 'preamble':
            preamble.append(row)
        elif isinstance(current, int):
            articles[current].append(row)
        if current == last_article and row.startswith(('Announcement', 'Amendment to the Constitution')):
            articles[current].pop()
            break
    return preamble, articles


# The NPC English page of the 2018 amendment prints Article 52 without its number and opening
# sentence: the new Section 7 follows Article 51 directly. The text from that heading on is kept
# as Article 52 and the gap is recorded in english.json.
UNNUMBERED = {52: 'Section 7 Commissions of Supervision'}


def parse_amendment(rows, numbers):
    result, current, expected = {}, None, iter(numbers)
    wanted = next(expected)
    for row in rows:
        match = re.match(r'^Article (\d+)\b\.?\s*(.*)$', row)
        if wanted in UNNUMBERED and row == UNNUMBERED[wanted]:
            current = wanted
            result[current] = [row]
            wanted = next(expected, None)
            continue
        if match and int(match[1]) == wanted:
            current = wanted
            result[current] = [match[2]] if match[2] else []
            wanted = next(expected, None)
            continue
        if current is not None:
            result[current].append(row)
    return result


def trim(rows, stop):
    out = []
    for row in rows:
        if any(row.startswith(s) for s in stop):
            break
        out.append(row)
    return out


FOOTER = ('Copyright', 'null', '/enpproperty', 'Print', 'Close', 'Related', 'Xinhuanet', "People's Daily Online")


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('--cache', type=Path, default=Path.home() / 'Library' / 'Caches' / 'fadian-english')
    args = parser.parse_args()
    args.cache.mkdir(parents=True, exist_ok=True)
    versions = json.loads((PACK / 'versions.json').read_text(encoding='utf-8'))
    units = versions['units']
    by_label = {year: {u['versions'][str(year)]['label']: u['id'] for u in units if u['versions'][str(year)]['exists']} for year in (1982, 2018)}
    preamble_ids = [u['id'] for u in units if u['kind'] == 'preamble']
    today = datetime.date.today().isoformat()
    sources, texts, warnings = {}, {}, []

    # 1982 original
    rows = []
    for path, stamp in PAGES_1982:
        page = lines(fetch(ARCHIVE.format(stamp=stamp, url=OLD + path), args.cache))
        start = next(i for i, row in enumerate(page) if row.startswith('(Adopted on December 4, 1982)')) + 1
        rows += trim(page[start:], FOOTER)
    preamble, articles = parse_text(rows, 138)
    texts[1982] = (preamble, articles)
    sources['1982'] = {'title': "Constitution of the People's Republic of China (Adopted on December 4, 1982)",
                       'publisher': "全国人民代表大会（原英文网站，已下线）", 'url': OLD + 'node_2830.htm',
                       'archive': [ARCHIVE.format(stamp=s, url=OLD + p).replace('id_/', '/') for p, s in PAGES_1982], 'checked': today}
    # 2018 text
    page = lines(fetch(NEW + PAGE_2018, args.cache))
    start = [i for i, row in enumerate(page) if row == 'Preamble'][1]
    preamble, articles = parse_text(trim(page[start:], FOOTER), 143)
    texts[2018] = (preamble, articles)
    sources['2018'] = {'title': "The Constitution of the People's Republic of China (2018)", 'publisher': '全国人民代表大会英文网站',
                       'url': NEW + PAGE_2018, 'note': '网站注明法律译文仅供参考（Translation for Reference Only）。', 'checked': today}

    english = {'description': '中华人民共和国宪法的官方英文译本，仅供参考；以中文本为准。', 'sources': sources,
               'texts': {}, 'amendments': {}}
    for year, (preamble, articles) in texts.items():
        expected = 138 if year == 1982 else 143
        if len(preamble) != len(preamble_ids) or sorted(articles) != list(range(1, expected + 1)):
            sys.exit(f'{year} 年英文本的序言段数或条数不符：{len(preamble)} 段，{len(articles)} 条')
        units_text = {pid: [p] for pid, p in zip(preamble_ids, preamble)}
        for number, paragraphs in articles.items():
            unit = by_label[year].get(f'第{cn_number(number)}条')
            if not unit:
                sys.exit(f'{year} 年第 {number} 条找不到对应的中文条文')
            units_text[unit] = [p for p in paragraphs if p]
            chinese = next(u for u in units if u['id'] == unit)['versions'][str(year)]['paragraphs']
            if len(chinese) != len(units_text[unit]):
                warnings.append(f'{year} Article {number}: 英文 {len(units_text[unit])} 段，中文 {len(chinese)} 段')
        english['texts'][str(year)] = units_text

    # Amendments
    for year, (node, stamp) in AMENDMENTS_OLD.items():
        page = lines(fetch(ARCHIVE.format(stamp=stamp, url=OLD + node), args.cache))
        start = next(i for i, row in enumerate(page) if row.startswith('(Adopted at'))
        english['amendments'][str(year)] = {'heading': page[start], **parse_amendment(trim(page[start + 1:], FOOTER), AMENDMENT_NUMBERS[year])}
        sources[f'amendment-{year}'] = {'title': f"Amendment to the Constitution of the People's Republic of China ({year})",
                                        'publisher': '全国人民代表大会（原英文网站，已下线）', 'url': OLD + node,
                                        'archive': ARCHIVE.format(stamp=stamp, url=OLD + node).replace('id_/', '/'), 'checked': today}
    page = lines(fetch(NEW + AMENDMENT_2018, args.cache))
    start = next(i for i, row in enumerate(page) if row.startswith('(Adopted by the First Session of the Thirteenth'))
    english['amendments']['2018'] = {'heading': page[start], **parse_amendment(trim(page[start + 1:], FOOTER), AMENDMENT_NUMBERS[2018])}
    sources['amendment-2018'] = {'title': "Amendment to the Constitution of the People's Republic of China (2018)", 'publisher': '全国人民代表大会英文网站',
                                 'url': NEW + AMENDMENT_2018, 'note': '网站注明法律译文仅供参考（Translation for Reference Only）。', 'checked': today}
    chinese = {(a['year'], a['label']) for a in versions['amendments']}
    for year, numbers in AMENDMENT_NUMBERS.items():
        got = english['amendments'][str(year)]
        missing = [n for n in numbers if not got.get(n)]
        if missing or any((year, f'第{cn_number(n)}条') not in chinese for n in numbers):
            sys.exit(f'{year} 年修正案英文本缺少第 {missing} 条，或与中文修正案条号不符')
        english['amendments'][str(year)] = {'heading': got['heading'], 'articles': {str(n): got[n] for n in numbers}}
    english['amendments']['2018']['notes'] = {'52': '英文网站所载译文没有标出“Article 52”，也没有译出本条开头的引语（中文本：宪法第三章“国家机构”中增加一节，作为第七节“监察委员会”；增加五条，分别作为第一百二十三条至第一百二十七条）。这里把第五十一条之后的内容作为第五十二条。'}
    (PACK / 'english.json').write_text(json.dumps(english, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print('english.json：1982 年 138 条，2018 年 143 条，修正案 52 条；序言各 %d 段。' % len(preamble_ids))
    for warning in warnings:
        print('  段落数不同（显示不受影响）：' + warning)


if __name__ == '__main__':
    main()
