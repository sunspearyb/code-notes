#!/usr/bin/env python3
"""Build review-history.json: official records of 备案审查 (filing and review), for reading beside the articles.

Maintenance tool for the constitution pack; the page only reads review-history.json.

Source: the 备案审查工作 column of the Legislative Affairs Commission on 中国人大网
(npc.gov.cn): annual work reports, published review cases and the rules on filing and review.
The column pages are read to list the documents; each document title is checked against
its own page.

Paragraphs are copied verbatim. A paragraph is attached to an article only when it names
the article ("宪法第四十五条") or quotes a phrase that appears in exactly one article of
the text in force at the time; the reason is kept in "basis". Paragraphs that refer to
constitutional principles without naming an article are left to the reader: open the
document from the list. Downloads are cached in --cache.
"""
import argparse
import datetime
import html
import json
from pathlib import Path
import re
import sys
import time
import urllib.parse
import urllib.request

PACK = Path(__file__).resolve().parent
COLUMN = 'http://www.npc.gov.cn/npc/c2597/c5854/bascgz/'
LISTS = [('报告', 'bascgzqkbg/'), ('案例', 'bascgzalxb/'), ('制度', 'basczd/')]
CN = '零一二三四五六七八九'
NUMERAL = '[一二三四五六七八九十百零]+'


# Cases discussed in the course (《第四部分 宪法的运行（2025）》 slides 42—64). The paragraph is the
# official report's, found by the key phrase; the title is the course's; the articles are a draft
# (Claude, to be checked) because most of these paragraphs speak of constitutional principles
# without naming an article.
CASES = [
    ('“超生辞退”', '2017', '423334', '超生即辞退', ['a42', 'a25']),
    ('废止收容教育制度', '2018', '423335', '建议对收容教育制度进行合宪性审查', ['a37']),
    ('通信自由与通信秘密', '2019', '423336', '通讯记录', ['a40']),
    ('民航发展基金的征收', '2020', '423340', '民航发展基金', ['a13']),
    ('民族学校使用本民族语言教学', '2020', '423340', '各级各类民族学校', ['a19']),
    ('“同命不同价”', '2020', '423340', '人身损害赔偿', ['a33']),
    ('部分民族自治地方民族教育条例', '2021', '423339', '民族教育条例', ['a19', 'a4']),
    ('强制亲子鉴定', '2021', '423339', '亲子鉴定', ['a38', 'a49']),
    ('省级司法机关、公安机关联合发文', '2022', '423338', '袭警罪', ['a5']),
    ('被调用检察人员的任职决定', '2022', '423338', '统一调用辖区内的检察人员', ['a104', 'a136']),
    ('被调用检察人员的任职决定（续）', '2023', '433996', '统一调用辖区内的检察人员', ['a104', 'a136']),
    ('信用惩戒“连坐”', '2023', '433996', '连坐', ['a33']),
    ('公司法司法解释与法不溯及既往', '2024', '442028', '公司法施行前', ['a5']),
    ('受刑事处罚人员与最低生活保障', '2024', '442028', '最低生活保障政策', ['a45']),
    ('受过刑事处罚人员的从业限制', '2024', '442028', '不得从事某种职业', ['a42']),
]


def cn_value(text):
    total, section, digit = 0, 0, 0
    for ch in text:
        if ch in CN:
            digit = CN.index(ch)
        elif ch == '十':
            section += (digit or 1) * 10
            digit = 0
        elif ch == '百':
            section += (digit or 1) * 100
            digit = 0
    return total + section + digit


def fetch(url, cache):
    target = cache / re.sub(r'[^\w.-]+', '_', url)
    if target.exists():
        return target.read_bytes().decode('utf-8', 'replace')
    for attempt in range(5):
        try:
            request = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (fadian-notes source check)'})
            with urllib.request.urlopen(request, timeout=60) as response:
                raw = response.read()
            target.write_bytes(raw)
            return raw.decode('utf-8', 'replace')
        except OSError as error:
            print('  重试：', url, error)
            time.sleep(3 + attempt * 3)
    sys.exit('无法取得：' + url)


def clean(text):
    return re.sub(r'\s+', '', html.unescape(re.sub(r'<[^>]+>', '', text)))


def paragraphs(page):
    """Paragraphs of the article body (div#Zoom), without the decorative list marks some reports use."""
    body = page[page.index('id="Zoom"'):]
    body = body[:body.index('<div class="editor"')] if '<div class="editor"' in body else body
    body = re.sub(r'(?s)<script.*?</script>|<style.*?</style>|<!--.*?-->', '', body)
    parts = re.split(r'(?i)</?(?:p|div|br)\b[^>]*>', body)
    return [text.lstrip('━—') for text in (html.unescape(re.sub(r'<[^>]+>', '', part)).strip().strip('　 ') for part in parts) if text.strip()]


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('--cache', type=Path, default=Path.home() / 'Library' / 'Caches' / 'fadian-review')
    args = parser.parse_args()
    args.cache.mkdir(parents=True, exist_ok=True)
    versions = json.loads((PACK / 'versions.json').read_text(encoding='utf-8'))
    units = versions['units']
    today = datetime.date.today().isoformat()
    documents, points, seen = [], [], set()
    for kind, path in LISTS:
        page = fetch(COLUMN + path, args.cache)
        for href, title, day in re.findall(r'<li[^>]*>\s*<a href="([^"]+)"[^>]*>\s*([^<]{4,300}?)\s*</a>\s*<span[^>]*>([^<]*)</span>', page):
            url = urllib.parse.urljoin(COLUMN + path, href)
            if url in seen or 'c30834' not in url:
                continue
            seen.add(url)
            body = fetch(url, args.cache)
            heading = re.search(r'<title>(.*?)</title>', body, re.S)
            if not heading or clean(heading.group(1)).split('_中国人大网')[0] != clean(title):
                sys.exit('标题与原文页面不一致：' + url)
            documents.append({'id': re.search(r't(\d{8}_\d+)', url).group(1), 'kind': kind, 'title': clean(title),
                              'date': day.strip(), 'url': url, 'checked': today})
            document = documents[-1]
            # Article numbers changed in 2018; texts written before then cite the 2004 numbering.
            # Early reports were posted again in 2023, so the year in the title decides.
            written = re.search(r'(\d{4})年备案审查', document['title'])
            year = 2004 if (int(written[1]) if written else int(document['date'][:4])) < 2018 else 2018
            texts = {u['id']: ''.join(u['versions'][str(year)]['paragraphs']) for u in units if u['versions'][str(year)]['exists']}
            by_label = {u['versions'][str(year)]['label']: u['id'] for u in units if u['versions'][str(year)]['exists']}
            for text in paragraphs(body):
                if '宪法' not in text:
                    continue
                linked, basis = [], []
                for match in re.finditer(rf'宪法(?:第{NUMERAL}条(?:第{NUMERAL}款)?(?:、第{NUMERAL}条(?:第{NUMERAL}款)?)*)', text):
                    for article in re.findall(rf'第({NUMERAL})条', match.group(0)):
                        unit = by_label.get(f'第{article}条')
                        if unit and unit not in linked:
                            linked.append(unit)
                            basis.append(match.group(0))
                for quote in re.findall(r'宪法[^“。；]{0,12}“([^”]{6,})”', text):
                    hits = [uid for uid, body_text in texts.items() if quote in body_text]
                    if len(hits) == 1 and hits[0] not in linked:
                        linked.append(hits[0])
                        basis.append(f'引用“{quote}”')
                chapters = ['rights'] if '宪法第二章' in text else []
                if linked or chapters:
                    points.append({'doc': document['id'], 'text': text, 'units': linked, 'chapters': chapters, 'basis': basis or ['宪法第二章']})
    # Course cases: add the title to the paragraph found automatically, or add the paragraph.
    texts = {}
    for document in documents:
        texts[document['id']] = paragraphs(fetch(document['url'], args.cache))
    for title, year, doc, key, units_ in CASES:
        doc_id = next((d['id'] for d in documents if d['id'].endswith(doc)), '')
        found = [t for t in texts.get(doc_id, []) if key in t]
        if not found:
            sys.exit(f'没有在报告 {doc} 中找到事例：{title}')
        text = max(found, key=len)  # the case itself, not a heading that mentions it
        point = next((p for p in points if p['text'] == text), None)
        if point is None:
            point = {'doc': doc_id, 'text': text, 'units': [], 'chapters': [], 'basis': []}
            points.append(point)
        point.setdefault('cases', []).append({'title': title, 'year': year})
        for uid in units_:
            if uid not in point['units']:
                point['units'].append(uid)
                point['basis'].append('课程事例，条文由 Claude 归入，待核')
    if not documents:
        sys.exit('没有读到备案审查栏目的文件列表。')
    result = {'description': '全国人大常委会法制工作委员会公布的备案审查工作情况报告、审查案例和有关制度。段落按原文照录。',
              'source': '中国人大网 · 法制工作委员会 · 备案审查工作', 'column': COLUMN,
              'course': '《第四部分 宪法的运行（2025）》课件所列备案审查事例（第 42—64 页），段落取自对应年度的工作情况报告。',
              'rule': '段落写明宪法条文（如“宪法第四十五条”），或引用了只见于一条条文的宪法原文时，归入该条；只说宪法原则、精神而未写明条文的段落，不自动归入，可从文件列表打开原文阅读。',
              'documents': documents, 'points': points}
    (PACK / 'review-history.json').write_text(json.dumps(result, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print(f'review-history.json：{len(documents)} 份文件，{len(points)} 段归入条文。')
    for p in points:
        print(' ', next(d['date'] for d in documents if d['id'] == p['doc']), p['units'], p['chapters'], p['basis'], p['text'][:40])


if __name__ == '__main__':
    main()
