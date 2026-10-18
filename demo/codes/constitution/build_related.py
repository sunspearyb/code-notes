#!/usr/bin/env python3
"""Build related-laws.json: the 宪法相关法 and the constitution articles each one relates to.

    python3 demo/codes/constitution/build_related.py <现行有效法律目录.pdf>

Sources:
- The list: 《现行有效法律目录》 published by the NPC Standing Committee's Legislative Affairs
  Commission on 中国人大网, section 宪法相关法 (56 laws as of 2026-08-28). Pass the downloaded PDF;
  it is not kept in the project. Needs pdftotext (poppler).
- Links: 国家法律法规数据库 (flk.npc.gov.cn). Each title is looked up through the database's own search
  and only an exact, currently valid title match is linked; otherwise the law is listed without a link.
- Article relations: related-map.json, drafted by hand at law level (not per article of the law) and
  marked 拟定 until the user has checked it.

Also marks, for every article, the words by which the constitution leaves a matter to law
("由法律规定", "依照法律规定" …), so the page can make them clickable.
"""
import datetime
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
import time
import urllib.parse
import urllib.request

PACK = Path(__file__).resolve().parent
CACHE = Path.home() / 'Library' / 'Caches' / 'fadian-laws'
CATALOGUE_URL = 'http://www.npc.gov.cn/npc/c2597/c5854/c5855/202609/P020260904396146393500.pdf'
SEARCH = 'https://flk.npc.gov.cn/law-search/search/list'
# Longest first so that “依照法律规定” is not split into “依照法律”.
DELEGATION = ['由法律另行规定', '由法律规定', '以法律规定', '依照法律规定', '依照法律', '法律规定的', '依法']
STRICT = {'由法律另行规定', '由法律规定', '以法律规定'}
CN = '零一二三四五六七八九'


def catalogue(pdf):
    text = subprocess.run(['pdftotext', '-layout', str(pdf), '-'], check=True, capture_output=True, text=True).stdout
    date = re.search(r'截至\s*(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日', text)
    start, end = text.index('宪法相关法'), text.index('民法商法')
    # Page numbers stand alone on a line, and page breaks (form feeds) can fall inside an entry.
    lines = [line for line in text[start:end].replace('\f', '\n').split('\n') if not re.fullmatch(r'\s*\d{1,2}\s*', line)]
    block = re.sub(r'(?<=[一-鿿）])\s*\d{1,2}\s*(?=[一-鿿（])', '', re.sub(r'\s+', '', '\n'.join(lines)))
    count = int(re.search(r'宪法相关法（(\d+)件）', block)[1])
    laws = []
    for number, body in re.findall(r'(\d+)[．.](.+?)(?=\d+[．.]|$)', block[block.index('）') + 1:]):
        title = re.match(r'[^（]+', body)[0]
        history = re.match(r'[^（]+（([^）]*)）', body)
        events = re.findall(r'(\d{4})年(通过|修正|修订)', history[1]) if history else []
        laws.append({'number': int(number), 'title': title, 'history': [f'{y}年{e}' for y, e in events]})
    if len(laws) != count or [law['number'] for law in laws] != list(range(1, count + 1)):
        sys.exit(f'目录解析不完整：应为 {count} 件，读到 {len(laws)} 件')
    return laws, (f'{date[1]}-{int(date[2]):02d}-{int(date[3]):02d}' if date else '')


def lookup(title):
    target = CACHE / ('flk-' + hashlib.sha256(title.encode()).hexdigest()[:16] + '.json')
    if target.exists():
        rows = json.loads(target.read_text(encoding='utf-8'))
    else:
        body = json.dumps({'searchRange': 1, 'sxrq': [], 'gbrq': [], 'searchType': 1, 'sxx': [], 'gbrqYear': [],
                           'flfgCodeId': [], 'zdjgCodeId': [], 'searchContent': title, 'pageNum': 1, 'pageSize': 20}).encode()
        request = urllib.request.Request(SEARCH, data=body, headers={'Content-Type': 'application/json;charset=UTF-8', 'User-Agent': 'Mozilla/5.0 (fadian-notes source check)'})
        with urllib.request.urlopen(request, timeout=60) as response:
            rows = json.load(response).get('rows') or []
        target.write_text(json.dumps(rows, ensure_ascii=False), encoding='utf-8')
        time.sleep(0.5)
    plain = lambda t: re.sub(r'<[^>]+>', '', t)
    exact = [r for r in rows if plain(r['title']) == title and r.get('sxx') == 3]
    if not exact:
        return None
    r = exact[0]
    return {'url': 'https://flk.npc.gov.cn/detail?' + urllib.parse.urlencode({'id': r['bbbs'], 'title': title}), 'published': r.get('gbrq', '')}


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    pdf = Path(sys.argv[1])
    CACHE.mkdir(parents=True, exist_ok=True)
    laws, as_of = catalogue(pdf)
    mapping = json.loads((PACK / 'related-map.json').read_text(encoding='utf-8'))
    versions = json.loads((PACK / 'versions.json').read_text(encoding='utf-8'))
    units = {u['id']: u for u in versions['units']}
    latest = str(versions['years'][-1])
    out, problems = [], []
    for law in laws:
        short = law['title'].removeprefix('中华人民共和国')
        entry = mapping['laws'].get(short)
        if entry is None:
            problems.append(f'related-map.json 中没有：{short}')
            continue
        for uid in entry['units']:
            if uid not in units or not units[uid]['versions'][latest]['exists']:
                problems.append(f'{short}：{uid} 不是 {latest} 年文本中的条文')
        found = lookup(law['title'])
        out.append({'id': f'law{law["number"]}', 'title': law['title'], 'short': short, 'history': law['history'],
                    'url': found['url'] if found else '', 'units': entry['units'], 'note': entry.get('note', ''),
                    'status': '已核对' if mapping.get('checked') else '拟定'})
    extra = set(mapping['laws']) - {law['short'] for law in out}
    problems += [f'related-map.json 中多出：{name}' for name in sorted(extra)]
    if problems:
        sys.exit('\n'.join(problems))
    # Words leaving a matter to law, per paragraph of the latest text.
    delegations = {}
    pattern = re.compile('|'.join(DELEGATION))
    for uid, unit in units.items():
        version = unit['versions'][latest]
        if not version['exists']:
            continue
        found = [{'block': b, 'start': m.start(), 'end': m.end(), 'text': m.group(0), 'strict': m.group(0) in STRICT}
                 for b, paragraph in enumerate(version['paragraphs']) for m in pattern.finditer(paragraph)]
        if found:
            delegations[uid] = found
    result = {'description': '宪法相关法：全国人大常委会法制工作委员会《现行有效法律目录》中“宪法相关法”部门的法律，及其与宪法条文的对应。对应关系只到法律为止，由 Claude 拟定，待使用者核对。',
              'source': {'title': f'现行有效法律目录（截至 {as_of}）', 'publisher': '全国人大常委会法制工作委员会', 'url': CATALOGUE_URL,
                         'sha256': hashlib.sha256(pdf.read_bytes()).hexdigest(), 'checked': datetime.date.today().isoformat()},
              'database': {'name': '国家法律法规数据库', 'url': 'https://flk.npc.gov.cn/'},
              'year': int(latest), 'laws': out, 'delegations': delegations,
              'rule': '条文中写“由法律规定”“以法律规定”的，是宪法明确要求以法律规定的事项；“依照法律规定”“依照法律”“依法”“法律规定的”，是宪法要求依照法律行使或者保护的事项。'}
    (PACK / 'related-laws.json').write_text(json.dumps(result, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    linked = sum(1 for law in out if law['url'])
    strict = sorted({uid for uid, items in delegations.items() if any(i['strict'] for i in items)}, key=lambda u: list(units).index(u))
    print(f'related-laws.json：{len(out)} 件宪法相关法，{linked} 件有数据库链接；{len(delegations)} 条含委诸法律的用语，其中 {len(strict)} 条写明“由法律规定”。')
    for law in out:
        if not law['url']:
            print('  未找到链接：' + law['title'])


if __name__ == '__main__':
    main()
