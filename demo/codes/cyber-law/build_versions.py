#!/usr/bin/env python3
"""Build three laws and the 2025 amendment from official NPC database DOCX files.

Downloaded 2026-10-18 from https://flk.npc.gov.cn/ . The SOURCE_ROWS below give
each official record ID and SHA-256. All original files stay outside the repo.
Usage: python3 build_versions.py --cyber-2016 FILE --cyber-2025 FILE
       --data-2021 FILE --personal-2021 FILE --amendment FILE
Only Python standard library is needed. Source hashes are mandatory.
"""
import argparse
import copy
import json
import re
from pathlib import Path
from docx_source import NUM, number, paragraphs, parse_law, version

PACK = Path(__file__).resolve().parent
SOURCE_ROWS = [
    ('cyber-2016', '中华人民共和国网络安全法（2016）', '2c909fdd678bf17901678bf8276f093d', '',
     'd7429897c983078fe862e4703424d27e0b382fccdc96c96bf3d23ff3517be951', '2016-11-07', '2017-06-01'),
    ('cyber-2025', '中华人民共和国网络安全法（2025年修正）', '021e7d7684474107b8f3febbb1c4f8b5', '',
     '9e575cff7451bbc373e122103bd1c7627285fb470be1cae468d0fd06bab56e03', '2025-10-28', '2026-01-01'),
    ('data-2021', '中华人民共和国数据安全法', 'ff80818179f5e0800179f885c7e70392', '',
     '722d29084fef73485e45485309daef570cee2cdee5c1ed19dcac95b0a28a065b', '2021-06-10', '2021-09-01'),
    ('personal-2021', '中华人民共和国个人信息保护法', 'ff8081817b6472a3017b656cc2040044', '',
     '1815f84f43dd5011442c817a197d745c9aef631f5db3b6c7a75be1acc2b5cd8b', '2021-08-20', '2021-11-01'),
    ('cyber-amendment-2025', '全国人民代表大会常务委员会关于修改《中华人民共和国网络安全法》的决定',
     '021e7d7684474107b8f3febbb1c4f8b5', '0938a0c8d1174b98921f6da2ab3e53e8',
     '931275083fa93b090843707d0bf1ced38bdc0fa921a258d02af5a97d14a30b06', '2025-10-28', '2026-01-01'),
]
SOURCES = {key: {'file': key + '.docx', 'title': title, 'publisher': '国家法律法规数据库',
                 'url': f'https://flk.npc.gov.cn/detail?id={rid}' + (f'&fileId={fid}&type=relevantResource' if fid else ''),
                 'downloadUrl': f'https://flk.npc.gov.cn/law-search/download/mobile?format=docx&bbbs={rid}&fileId={fid}',
                 'downloaded': '2026-10-18', 'sha256': sha, 'adoptedOrAmended': adopted, 'effective': effective}
           for key, title, rid, fid, sha, adopted, effective in SOURCE_ROWS}
DECISION_PDF = {
    'file': 'cyber-amendment-2025.pdf',
    'title': '全国人民代表大会常务委员会公报2025年第6号，第792—794页',
    'publisher': '国家法律法规数据库', 'downloaded': '2026-10-18',
    'url': 'https://flk.npc.gov.cn/detail?id=021e7d7684474107b8f3febbb1c4f8b5&fileId=bab97f77fce64fd59d62430bd1bc7aa6&type=relevantResource',
    'downloadUrl': 'https://flk.npc.gov.cn/law-search/download/mobile?format=pdf&bbbs=021e7d7684474107b8f3febbb1c4f8b5&fileId=bab97f77fce64fd59d62430bd1bc7aa6',
    'sha256': '582e3ba065c0e2ac64c27abeef039c5ff26933ed4f57ba979f0e5ba071b9bf80',
    'purpose': '核对修正决定的公报页码；条文仍从官方DOCX提取。'}
# Verified against the three-page official gazette attachment. These are the
# printed gazette page numbers, not the one-based PDF page index.
DECISION_PAGES = {1: [792], 2: [792], 3: [792], 4: [792], 5: [792, 793],
                  6: [793], 7: [793], 8: [793], 9: [793], 10: [793],
                  11: [793, 794], 12: [794], 13: [794], 14: [794]}

# The mapping follows the fourteen clauses of the decision, including the
# mergers in clauses 11 and 12. Old 64 and 66 retain their own historical units.
OLD_TO_NEW = {**{n: n for n in (1, 2)}, **{n: n + 1 for n in range(3, 19)},
              **{n: n + 2 for n in range(19, 61)}, 61: 64, 62: 65, 63: 66,
              64: None, 65: 67, 66: None, 67: 68, 68: 69, 69: 70, 70: 71, 71: 72,
              **{n: n + 2 for n in range(72, 80)}}
AFFECTED = {1: ['cs3'], 2: ['cs19'], 3: ['cs20'], 4: ['cs42'], 5: ['cs61'],
            6: ['cs62'], 7: ['cs63'], 8: ['cs64'], 9: ['cs65'], 10: ['cs67'],
            11: ['cs69', 'cs70'], 12: ['cs64-2016', 'cs66-2016', 'cs71'],
            13: ['cs73'], 14: ['cs77']}


def parse_decision(path):
    source = SOURCES['cyber-amendment-2025']
    records, current, tail = [], None, []
    for i, text in paragraphs(path, source):
        m = re.match(r'^([' + NUM + r']+)、', text)
        if m:
            n = number(m[1])
            if n != len(records) + 1:
                raise ValueError('修正决定序号不连续')
            current = {'year': 2025, 'number': n, 'label': f'第{m[1]}项', 'text': text,
                       'paragraphs': [text], 'sourceParagraphs': [i], 'sourceFile': source['file'],
                       'sourceRefs': [{'file': '《全国人大常委会公报》2025年第6号', 'page': page,
                                       'pdfPage': page - 791, 'url': DECISION_PDF['url']}
                                      for page in DECISION_PAGES[n]], 'unitIds': AFFECTED[n]}
            records.append(current)
        elif text.startswith('本决定自') or text.startswith('《中华人民共和国网络安全法》根据'):
            current = None
            tail.append(text)
        elif current:
            current['paragraphs'].append(text)
            current['sourceParagraphs'].append(i)
            current['text'] += '\n' + text
    if len(records) != 14 or tail != ['本决定自2026年1月1日起施行。', '《中华人民共和国网络安全法》根据本决定作相应修改并对条文顺序作相应调整，重新公布。']:
        raise ValueError('修正决定条项或施行条款不一致')
    return records, tail


def verify_amendment_replay(old, new, amendments):
    """Apply all 14 decision items to 2016 text and match the official 2025 text."""
    items = {item['number']: item for item in amendments}

    def remap(paragraphs):
        def replace(match):
            n = number(match[1])
            return new[OLD_TO_NEW[n] or 71]['label']
        return [re.sub('第([' + NUM + ']+)条', replace, p) for p in paragraphs]

    def quoted(n):
        text = items[n]['text']
        text = text[text.index('“') + 1:text.rindex('”')]
        return [p[1:] if p.startswith('“') else p for p in text.split('\n')]

    result = {n: remap(old[k]['paragraphs']) for k, n in OLD_TO_NEW.items() if n}
    for clause, article in [(1, 3), (3, 20), (5, 61), (7, 63), (9, 65),
                            (10, 67), (11, 69), (12, 71), (13, 73), (14, 77)]:
        result[article] = quoted(clause)
    if len(old[18]['paragraphs']) != 2 or len(old[69]['paragraphs']) != 4:
        raise ValueError('修正前第18条或第69条分款不一致')
    result[19] = remap(old[18]['paragraphs'][:1])
    result[42] += quoted(4)
    result[62] += quoted(6)
    replacements = re.findall('“([^”]+)”', items[8]['text'])
    if len(replacements) != 2 or result[64][0].count(replacements[0]) != 1:
        raise ValueError('第8项修正的替换位置不唯一')
    result[64] = [p.replace(*replacements) for p in result[64]]
    result[70] = remap(old[69]['paragraphs'][:1] + [
        old[69]['paragraphs'][2].replace('（二）', '（一）', 1),
        old[69]['paragraphs'][3].replace('（三）', '（二）', 1)])
    errors = [n for n in sorted(result) if result[n] != new[n]['paragraphs']]
    if set(result) != set(range(1, 82)) or errors:
        raise ValueError(f'修正决定重建结果与官方2025年全文不一致：{errors}')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for key in ('cyber-2016', 'cyber-2025', 'data-2021', 'personal-2021', 'amendment'):
        parser.add_argument('--' + key, required=True, type=Path)
    parser.add_argument('--out-dir', type=Path, default=PACK)
    args = parser.parse_args()
    parsed, structures, checks = {}, {}, {}
    for key, count, prefix in [('cyber-2016', 79, 'cs'), ('cyber-2025', 81, 'cs'), ('data-2021', 55, 'ds'), ('personal-2021', 74, 'pi')]:
        parsed[key], structures[key], checks[key] = parse_law(getattr(args, key.replace('-', '_')), SOURCES[key], count, prefix)
    amendments, tail = parse_decision(args.amendment)
    verify_amendment_replay(parsed['cyber-2016'], parsed['cyber-2025'], amendments)
    if set(OLD_TO_NEW) != set(range(1, 80)):
        raise ValueError('旧条号映射不完整')
    reverse = {v: k for k, v in OLD_TO_NEW.items() if v}
    if set(range(1, 82)) - set(reverse) != {3, 20, 63, 73}:
        raise ValueError('新增条号不符')
    units = []
    def add(uid, latest_n, old_n):
        old = parsed['cyber-2016'].get(old_n)
        new = parsed['cyber-2025'].get(latest_n)
        versions = {str(y): version(old, SOURCES['cyber-2016']) for y in (2016, 2021)}
        versions['2025'] = version(new, SOURCES['cyber-2025'])
        versions['2025']['amendments'] = [n for n, ids in AFFECTED.items() if uid in ids]
        versions['2025']['changed'] = (old is None or new is None or
            (old['label'], old['paragraphs']) != (new['label'], new['paragraphs']))
        unit = {'id': uid, 'kind': 'article', 'number': latest_n or old_n,
                'label': (new or old)['label'], 'versions': versions}
        if latest_n and old_n:
            unit['originalNumber'] = old_n
        if not latest_n:
            unit['mergedInto'] = 'cs71'
        units.append(unit)
    for n in range(1, 82):
        if n == 67:
            add('cs64-2016', None, 64)
        if n == 68:
            add('cs66-2016', None, 66)
        add('cs' + str(n), n, reverse.get(n))
    for key, prefix in [('data-2021', 'ds'), ('personal-2021', 'pi')]:
        for n, article in parsed[key].items():
            units.append({'id': prefix + str(n), 'kind': 'article', 'number': n, 'label': article['label'],
                          'versions': {'2016': version(None, SOURCES[key]),
                                       '2021': version(article, SOURCES[key]), '2025': version(article, SOURCES[key])}})
    # Rebuild each original sequence from the stable IDs and compare every
    # paragraph to the independent per-document parse. This detects lost merges.
    for key, year, prefix in [('cyber-2016', 2016, 'cs'), ('cyber-2025', 2025, 'cs'), ('data-2021', 2021, 'ds'), ('personal-2021', 2021, 'pi')]:
        reconstructed = [u['versions'][str(year)] for u in units if u['id'].startswith(prefix) and u['versions'][str(year)]['exists']]
        if [(v['label'], v['paragraphs']) for v in reconstructed] != [(a['label'], a['paragraphs']) for a in parsed[key].values()]:
            raise ValueError(f'{key} 重建文本或顺序不一致')
    codex = json.loads((PACK / 'codex.json').read_text(encoding='utf-8'))
    for root, key in zip(codex['structure'], ('cyber-2025', 'data-2021', 'personal-2021')):
        root['children'] = structures[key]
    data = {'years': [2016, 2021, 2025], 'sources': list(SOURCES.values()) + [DECISION_PDF], 'units': units,
            'amendments': amendments, 'amendmentDecision': {'year': 2025, 'effective': '2026-01-01', 'closingParagraphs': tail,
              'source': SOURCES['cyber-amendment-2025'], 'oldToNew': {str(k): v for k, v in OLD_TO_NEW.items()},
              'mergers': [{'oldArticles': [68, 69], 'newArticles': [69, 70], 'decisionItem': 11},
                          {'oldArticles': [64, 66, 70], 'newArticles': [71], 'decisionItem': 12}]},
            'validation': {'documents': checks, 'sourceHashesVerified': True, 'allSnapshotsMatchSourceParagraphs': True,
                           'all14AmendmentsReplayedAndMatched': True,
                           'latestArticleCount': 210, 'historicalUnitCount': 212, 'amendmentCount': 14}}
    args.out_dir.mkdir(parents=True, exist_ok=True)
    for name, value in [('versions.json', data), ('codex.json', codex)]:
        (args.out_dir / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('网络法典：2016 年 79 条，2021 年 208 条，2025 年 210 条；保留 2 条被合并的旧条文；14 项修正决定。')


if __name__ == '__main__':
    main()
