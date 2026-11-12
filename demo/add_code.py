#!/usr/bin/env python3
"""Add a new code from a folder in 新法典/: python3 demo/add_code.py [新法典/<名称>] [--redo]

The folder holds the current text of one law or document (.docx, .txt or .md) and, optionally,
说明.txt and a 修正案/ folder. See 新法典/给助手的说明.md. Without a folder name, every folder in
新法典/ that has no 核对报告.md yet is added (folders starting with _ are skipped).

This makes the module (demo/modules/<标识>/), the code (demo/codes/<标识>/), its page and
「打开<简称>笔记.command」, checks the result, and writes 核对报告.md into the folder.
--redo removes what an earlier run made for this folder (never the notes) and makes it again.
Python standard library only.
"""
import copy
import datetime
import difflib
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
sys.dont_write_bytecode = True
import make_pack

DEMO = Path(__file__).resolve().parent
PROJECT = DEMO.parent
INBOX = PROJECT / '新法典'
KEYS = {'修正案顺序': 'order', '名称': 'name', '全称': 'name', '简称': 'short', '年份': 'year', '标识': 'id', '前缀': 'prefix'}


def settings(folder):
    values = {}
    note = folder / '说明.txt'
    if note.exists():
        raw = note.read_bytes()
        try:
            text = raw.decode('utf-8-sig')
        except UnicodeDecodeError:
            text = raw.decode('gb18030', errors='replace')
        for line in text.splitlines():
            m = re.match(r'\s*([^：:#\s]+)\s*[：:]\s*(.+?)\s*$', line)
            if m and m[1] in KEYS and not m[2].startswith('（'):
                values[KEYS[m[1]]] = m[2]
            t = re.match(r'\s*文本\s*((?:19|20)\d{2})\s*[：:]\s*(.+?)\s*$', line)  # 文本 1997：文件名
            if t:
                values.setdefault('texts', {})[int(t[1])] = t[2]
            r = re.match(r'\s*分段参考\s*((?:19|20)\d{2})\s*[：:]\s*(.+?)\s*$', line)  # another copy of a text, for its paragraph breaks only
            if r:
                values.setdefault('layouts', {})[int(r[1])] = r[2]
    digest = hashlib.sha256(folder.name.encode('utf-8')).hexdigest()
    values.setdefault('short', folder.name)
    values.setdefault('name', values['short'])
    values.setdefault('id', 'law-' + digest[:6])
    values.setdefault('prefix', ''.join(chr(97 + int(c, 16)) for c in digest[:4]))
    return values


def year_texts(folder):
    """Several texts of the same law, one per year (the year is in the file name): {year: path}."""
    named = settings(folder).get('texts')
    if named:  # 说明.txt lists the texts: 文本 1997：文件名
        missing = [f for f in named.values() if not (folder / f).is_file()]
        if missing:
            raise SystemExit('说明.txt 中列出的文件不存在：' + '、'.join(missing))
        return {year: folder / f for year, f in named.items()} if len(named) > 1 else {}
    found = {}
    for p in sorted(folder.iterdir()):
        m = re.search(r'(?<!\d)((?:19|20)\d{2})(?!\d)', p.stem)
        if p.is_file() and p.suffix.lower() in ('.docx', '.txt', '.md') and p.name not in ('说明.txt', '核对报告.md') and m:
            found[int(m[1])] = p
    return found if len(found) > 1 else {}


def align(old, new):
    """Pairs of the same article in two texts, by wording: [(i, j)], i or j None for removed and added ones."""
    text = lambda u: '\n'.join(u['paragraphs'])
    a, b = [text(u) for u in old], [text(u) for u in new]
    def score(x, y):
        if x == y:
            return 1.0
        matcher = difflib.SequenceMatcher(None, x, y, autojunk=False)
        return matcher.ratio() if matcher.quick_ratio() >= 0.4 else 0.0
    n, m, gap = len(a), len(b), 0.45
    cost = [[float('inf')] * (m + 1) for _ in range(n + 1)]
    move = [[None] * (m + 1) for _ in range(n + 1)]
    cost[0][0] = 0
    for i in range(n + 1):
        for j in range(m + 1):
            if i and cost[i - 1][j] + gap < cost[i][j]:
                cost[i][j], move[i][j] = cost[i - 1][j] + gap, (1, 0)
            if j and cost[i][j - 1] + gap < cost[i][j]:
                cost[i][j], move[i][j] = cost[i][j - 1] + gap, (0, 1)
            if i and j and abs(i * m / n - j) <= 45:
                s = score(a[i - 1], b[j - 1])
                if s >= 0.4 and cost[i - 1][j - 1] + 1 - s < cost[i][j]:
                    cost[i][j], move[i][j] = cost[i - 1][j - 1] + 1 - s, (1, 1)
    pairs, i, j = [], n, m
    while i or j:
        di, dj = move[i][j]
        pairs.append((i - 1 if di else None, j - 1 if dj else None))
        i, j = i - di, j - dj
    return pairs[::-1]


def build_history(texts, prefix, ident, latest_ids, layouts=None):
    """The law in every year: articles of successive texts are matched by wording, so an article keeps
    one identity while its number changes; articles of earlier texts that are gone stay as units of their own."""
    years = sorted(texts)
    cut = {year: make_pack.cut(make_pack.paragraphs(texts[year]), prefix)[0] for year in years}
    # 分段参考: another copy of the same text whose paragraphs are divided properly. Where the end of one of
    # its paragraphs and the start of the next are found, joined, inside a paragraph of our text, ours is divided there.
    redivided = 0
    for year, path in (layouts or {}).items():
        rows = make_pack.paragraphs(path)
        for unit in cut.get(year, []):
            done = []
            for p in unit['paragraphs']:
                pieces = [p]
                for before, after in zip(rows, rows[1:]):
                    tail, head = re.sub(r'\s', '', before)[-10:], re.sub(r'\s', '', after)[:10]
                    if len(tail) < 6 or len(head) < 6 or tail[-1] not in '。；：':
                        continue
                    for k, piece in enumerate(pieces):
                        at = piece.find(tail + head)
                        if at >= 0 and piece.count(tail + head) == 1:
                            pieces[k:k + 1] = [piece[:at + len(tail)], piece[at + len(tail):]]
                            redivided += 1
                            break
                done += pieces
            unit['paragraphs'] = done
    chain = [{years[0]: u} for u in cut[years[0]]]
    changes = {}
    for previous, year in zip(years, years[1:]):
        alive = [c for c in chain if previous in c]
        position, stats = -1, {'修改': 0, '新增': 0, '删去': 0, '只变条号': 0, '未变': 0}
        pairs = align(cut[previous], cut[year])
        # A heavily rewritten article finds no partner by wording: between the same neighbours, a removed
        # article and an added one with the same number are one article.
        fixed, k = [], 0
        while k < len(pairs):
            run = []
            while k < len(pairs) and None in pairs[k]:
                run.append(pairs[k]); k += 1
            gone, new = [i for i, j in run if j is None], [j for i, j in run if i is None]
            both = {cut[previous][i]['label']: i for i in gone}
            joined = {j: both[cut[year][j]['label']] for j in new if cut[year][j]['label'] in both}
            fixed += [(i, None) for i in gone if i not in joined.values()]
            fixed += [(joined.get(j), j) for j in new]
            if k < len(pairs):
                fixed.append(pairs[k]); k += 1
        for i, j in fixed:
            if i is None:
                position += 1
                chain.insert(position, {year: cut[year][j]})
                stats['新增'] += 1
                continue
            position = chain.index(alive[i])
            if j is None:
                stats['删去'] += 1
            else:
                alive[i][year] = cut[year][j]
                same = cut[previous][i]['paragraphs'] == cut[year][j]['paragraphs']
                stats['未变' if same and cut[previous][i]['label'] == cut[year][j]['label'] else '只变条号' if same else '修改'] += 1
        changes[year] = stats
    # The same words divided into paragraphs differently (a web page that ran two 款 together) is not a
    # change of the law: the earlier text takes the paragraphs of the later one.
    relaid = 0
    for c in chain:
        present = sorted(c)
        for earlier, later in reversed(list(zip(present, present[1:]))):
            if c[earlier]['paragraphs'] != c[later]['paragraphs'] and ''.join(c[earlier]['paragraphs']) == ''.join(c[later]['paragraphs']):
                c[earlier]['paragraphs'] = list(c[later]['paragraphs'])
                relaid += 1
    # A paragraph of the earlier text that runs two 款 together, one of which stands unchanged in the
    # later text, is divided where that 款 begins or ends.
    for c in chain:
        present = sorted(c)
        for earlier, later in reversed(list(zip(present, present[1:]))):
            known = [q for q in c[later]['paragraphs'] if len(q) >= 8]
            again = True
            while again:
                again = False
                for i, p in enumerate(c[earlier]['paragraphs']):
                    for q in known:
                        at = p.find(q)
                        if at < 0 or p == q or (at > 0 and p[at - 1] not in '。；：') or (at + len(q) < len(p) and q[-1] not in '。；：'):
                            continue
                        c[earlier]['paragraphs'][i:i + 1] = [x for x in (p[:at], q, p[at + len(q):]) if x]
                        again = True
                        break
                    if again:
                        break
    if relaid and len(years) == 2:
        changes[years[1]]['修改'] -= relaid
        changes[years[1]]['未变'] += relaid
    latest, ids, units = years[-1], iter(latest_ids), []
    method = 'add_code.py 自各年文本逐段提取；相邻文本的条文按文字相似度对应，条号变动后仍为同一条；仅去除段首段尾空白和条号分隔空白'
    for c in chain:
        last = max(c)
        u = c[last]
        index = cut[last].index(u) + 1
        unit = {'id': next(ids) if latest in c else f'{prefix}{index}-{last}', 'kind': u['kind'], 'number': u['number'], 'label': u['label'], 'versions': {}}
        before = None
        for year in years:
            v = c.get(year)
            if v is None:
                entry = {'exists': False, 'label': '', 'paragraphs': [], 'amendments': [], 'sourceRefs': [], 'diff': [], 'changed': before is not None}
            else:
                text = '\n'.join(v['paragraphs'])
                if before is None or before['paragraphs'] == v['paragraphs']:
                    diff = [{'type': 'equal', 'text': text}]
                else:
                    old = '\n'.join(before['paragraphs'])
                    ops = difflib.SequenceMatcher(None, old, text, autojunk=False).get_opcodes()
                    diff = [op for tag, a1, a2, b1, b2 in ops for op in (
                        [{'type': 'equal', 'text': text[b1:b2]}] if tag == 'equal' else
                        ([{'type': 'delete', 'text': old[a1:a2]}] if a2 > a1 else []) + ([{'type': 'insert', 'text': text[b1:b2]}] if b2 > b1 else []))]
                changed = year != years[0] and (before is None or before['paragraphs'] != v['paragraphs'] or before['label'] != v['label'])
                entry = {'exists': True, 'label': v['label'], 'paragraphs': v['paragraphs'], 'amendments': [], 'sourceRefs': [], 'diff': diff,
                         'changed': changed, 'sourceFile': texts[year].name, 'method': method}
            unit['versions'][str(year)] = entry
            before = v
        units.append(unit)
    sources = [{'file': texts[y].name, 'title': f'{y} 年文本', 'sha256': hashlib.sha256(texts[y].read_bytes()).hexdigest(),
                'converted': datetime.date.today().isoformat()} for y in years]
    documents = {f'{ident}-{y}': {'unitCount': len(cut[y]), 'paragraphCount': sum(len(u['paragraphs']) for u in cut[y]),
                                  'bodySha256': hashlib.sha256('\n'.join(p for u in cut[y] for p in u['paragraphs']).encode()).hexdigest()} for y in years}
    # Every year's text must come back exactly from the units.
    for y in years:
        rebuilt = [(u['versions'][str(y)]['label'], u['versions'][str(y)]['paragraphs']) for u in units if u['versions'][str(y)]['exists']]
        if rebuilt != [(u['label'], u['paragraphs']) for u in cut[y]]:
            raise SystemExit(f'{y} 年文本未能从对应结果中原样还原，请检查文件。')
    return {'years': years, 'sources': sources, 'units': units, 'amendments': [],
            'validation': {'documents': documents, 'allSnapshotsMatchSourceTexts': True, 'matching': '按文字相似度自动对应，待人工核对', 'paragraphsTakenFromLaterText': relaid, 'paragraphsDividedByReference': redivided}}, changes, cut


CN = '零一二三四五六七八九'


def cn(text):
    total = digit = 0
    for ch in text:
        if ch in CN:
            digit = CN.index(ch)
        else:
            total += (digit or 1) * {'十': 10, '百': 100, '千': 1000}[ch]
            digit = 0
    return total + digit


def revision_docs(folder, texts, name, units):
    """Amendments and decisions in the folder (every text file that is not one of the law's own texts):
    each is cut into its numbered items, and every item is attached to the articles it names
    (“刑法第一百二十条”“作为第一百二十条之一”). Returns the documents; units get 'revisions': [[doc id, item index]]."""
    short_law = re.sub(r'^中华人民共和国', '', name)
    by_label = {}
    for u in units:
        for v in u['versions'].values():
            if v['exists']:
                by_label.setdefault(v['label'], u)
    files = [p for p in sorted([*folder.iterdir(), *((folder / '修正案').iterdir() if (folder / '修正案').is_dir() else [])])
             if p.is_file() and p.suffix.lower() in ('.docx', '.txt', '.md') and p not in texts.values()
             and p.name not in ('说明.txt', '核对报告.md', *settings(folder).get('layouts', {}).values()) and not p.name.startswith(('.', '~', '00_'))]
    docs, unplaced = [], []
    for p in files:
        raw = p.read_text(encoding='utf-8', errors='replace') if p.suffix.lower() != '.docx' else ''
        rows = make_pack.paragraphs(p)
        title = rows[0] if rows else p.stem
        if not re.search(r'修正案|决定|修改|修正', title):
            continue  # notes and other papers in the folder are not amendments
        rule = next((i for i, line in enumerate(raw.splitlines()) if re.fullmatch(r'\s*-{3,}\s*', line)), None)
        if rule is not None:  # notes on the source come before a rule line; the document starts after it
            body = make_pack.paragraphs_of_text('\n'.join(raw.splitlines()[rule + 1:]))
        else:
            body = rows[1:]
        date = next((re.search(r'((?:19|20)\d{2})年(\d{1,2})月(\d{1,2})日', line) for line in body[:3] if re.search(r'(?:19|20)\d{2}年', line)), None)
        year = int(date[1]) if date else int(re.search(r'((?:19|20)\d{2})', p.stem)[1]) if re.search(r'((?:19|20)\d{2})', p.stem) else None
        sequence = re.search(r'修正案（([一二三四五六七八九十]+)）', title)
        short = f"修{sequence[1]}" if sequence else '修一' if title.endswith('修正案') else '决定'
        whole = '部分法律' in title  # a decision about several laws: keep only what concerns this law
        items, current = [], None
        for line in body:
            numbered = re.match(r'^([一二三四五六七八九十百]+)、', line)
            if numbered:
                current = {'label': f'第{numbered[1]}项', 'paragraphs': [line]}
                items.append(current)
            elif current is not None:
                current['paragraphs'].append(line)
        if not items or whole:
            if whole:
                lines = [line for line in body if re.match(rf'^[\d０-９]*[．.、]?\s*《{name}》第', line)]
                heads = [h for h in body if re.match(r'^（[一二三四五六七八九十]+）', h) and any(body.index(h) < body.index(line) for line in lines)]
                head = max(heads, key=body.index) if heads and lines else None
                items = [{'label': '有关本法的部分', 'paragraphs': [*([head] if head and body.index(head) < body.index(lines[0]) else []), *lines]}] if lines else []
            else:
                start = next((i for i, line in enumerate(body) if short_law in line), 0)
                items = [{'label': '全文', 'paragraphs': body[start:]}]
        doc = {'id': re.sub(r'\W+', '', p.stem)[:40], 'title': title, 'short': short, 'year': year, 'date': '-'.join(f'{int(x):02d}' if i else x for i, x in enumerate(date.groups())) if date else '',
               'file': p.name, 'items': items}
        for index, item in enumerate(items):
            head = item['paragraphs'][0] if len(item['paragraphs'][0]) > 12 or len(item['paragraphs']) == 1 else ''.join(item['paragraphs'][:2])
            lead = re.split(r'[：:]“|修改为：', head)[0] if not whole and item['label'] != '全文' else '\n'.join(item['paragraphs'])
            labels = []
            for match in re.finditer(r'第([零一二三四五六七八九十百]+)条(?:之([一二三四五六七八九十]))?', lead):
                label = match[0]
                if label not in labels:
                    labels.append(label)
            targets = [by_label[l] for l in labels if l in by_label]
            # “第×条后增加一条，作为第×条之一”: the new article is the target, not the one it follows
            grown = re.search(r'增加[一二两三四五六七八九十]+条，?作为(.+)', lead)
            if grown:
                targets = [by_label[m[0]] for m in re.finditer(r'第[零一二三四五六七八九十百]+条(?:之[一二三四五六七八九十])?', grown[1]) if m[0] in by_label]
            if not whole and item['label'] != '全文' and not re.search(r'修改为|增加|删去|修改|补充', head[:len(lead) + 8]):
                targets = []  # an item that only cites articles (依照刑法第×条处罚) changes none of them
            item['unitIds'] = [u['id'] for u in targets]
            for u in targets:
                u.setdefault('revisions', []).append([doc['id'], index])
            if not targets and item['label'] not in ('全文',) and re.search(r'修改为|增加|删去', lead):
                unplaced.append(f"{doc['short']}{item['label']}：{head[:40]}…")
        if items:
            docs.append(doc)
    order = lambda d: (d['date'] or str(d['year'] or ''), d['file'])
    return sorted(docs, key=order), unplaced


def current_text(folder):
    several = year_texts(folder)
    if several:
        return several[max(several)]
    files = [p for p in sorted(folder.iterdir()) if p.is_file() and p.suffix.lower() in ('.docx', '.txt', '.md')
             and p.name not in ('说明.txt', '核对报告.md') and not p.name.startswith(('.', '~'))]
    named = [p for p in files if '现行' in p.name]
    if len(named) == 1:
        return named[0]
    if len(files) == 1:
        return files[0]
    raise SystemExit(f'{folder.name}：文件夹里要有一份现行文本（.docx、.txt 或 .md）。'
                     + ('有几份文件时，请把现行文本的文件名改成含“现行”二字。' if files else '现在没有找到。旧式 .doc 和 PDF 请先另存为 .docx。'))


def remove(ident, short):
    for path in (DEMO / 'modules' / ident, DEMO / 'codes' / ident):
        shutil.rmtree(path, ignore_errors=True)
    for path in (DEMO / f'法典笔记-{ident}.html', PROJECT / f'打开{short}笔记.command'):
        path.unlink(missing_ok=True)


def add(folder, redo=False):
    v = settings(folder)
    source = current_text(folder)
    if redo:
        remove(v['id'], v['short'])
    args = [str(source), '--name', v['name'], '--short', v['short'], '--id', v['id'], '--prefix', v['prefix'], '--code']
    several = year_texts(folder)
    if several:
        args += ['--year', str(max(several))]
    elif v.get('year'):
        args += ['--year', re.sub(r'\D', '', v['year'])]
    try:
        make_pack.main(args)
    except BaseException:
        shutil.rmtree(DEMO / 'modules' / v['id'], ignore_errors=True) if not (DEMO / 'codes' / v['id']).exists() else None
        raise
    changes, counts, unplaced, replayed = {}, {}, [], []
    # 条旨.json in the folder: titles of articles from an official source, by article number
    # ({"第一百二十条之一": "帮助恐怖活动罪", "_说明": "where they come from"}). Never written by this program.
    titles = json.loads((folder / '条旨.json').read_text(encoding='utf-8')) if (folder / '条旨.json').exists() else {}
    if titles:
        module = DEMO / 'modules' / v['id']
        single = json.loads((module / 'versions.json').read_text(encoding='utf-8'))
        by_label = {u['label']: u['id'] for u in single['units']}
        unknown = [k for k in titles if not k.startswith('_') and k not in by_label]
        if unknown:
            raise SystemExit('条旨.json 中有现行文本没有的条文：' + '、'.join(unknown[:8]))
        drafted = json.loads((folder / '拟定条旨.json').read_text(encoding='utf-8')) if (folder / '拟定条旨.json').exists() else {}
        clash = [k for k in drafted if not k.startswith('_') and (k in titles or k not in by_label)]
        if clash:
            raise SystemExit('拟定条旨.json 中有已有法定条旨或不存在的条文：' + '、'.join(clash[:8]))
        merged = {by_label[k]: t for src in (titles, drafted) for k, t in src.items() if not k.startswith('_')}
        (module / 'subtitles.json').write_text(json.dumps(merged, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        import compose as composer
        composer.compose(v['id'])
        path = DEMO / 'codes' / v['id'] / 'codex.json'
        codex = json.loads(path.read_text(encoding='utf-8'))
        # Which titles are official, and from which document: shown as a small mark beside the title.
        sources = titles.get('_来源', {})
        codex['subtitleSources'] = {by_label[k]: sources.get(k, titles.get('_说明', '')) for k in titles if not k.startswith('_')}
        codex['subtitleNote'] = drafted.get('_说明', '条旨是拟定的概括，可以修改，不属于原文。') if drafted else titles.get('_说明', '')
        codex['subtitleOfficialNote'] = titles.get('_说明', '')
        path.write_text(json.dumps(codex, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    if several:  # every year's text, with articles matched from one text to the next
        import compose
        module = DEMO / 'modules' / v['id']
        single = json.loads((module / 'versions.json').read_text(encoding='utf-8'))
        history, changes, cut = build_history(several, v['prefix'], v['id'], [u['id'] for u in single['units']], {y: folder / f for y, f in v.get('layouts', {}).items()})
        history['revisionDocs'], unplaced = revision_docs(folder, several, v['name'], history['units'])
        replayed = []
        if len(several) == 2 and history['revisionDocs']:  # the original and the current text: every year in between is replayed
            import replay
            phrases = [(d['id'], m[1], m[2]) for d in history['revisionDocs'] for item in d['items']
                       for m in [re.search(r'中的“(.+?)”修改为“(.+?)”', item['paragraphs'][0])] if m and item['label'] == '有关本法的部分']
            replayed = replay.replay(history, phrases)
        counts = {y: len(cut[y]) for y in cut}
        (module / 'versions.json').write_text(json.dumps(history, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        meta = json.loads((module / 'module.json').read_text(encoding='utf-8'))
        meta['years'] = history['years']
        (module / 'module.json').write_text(json.dumps(meta, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        compose.compose(v['id'])
        path = DEMO / 'codes' / v['id'] / 'codex.json'
        codex = json.loads(path.read_text(encoding='utf-8'))
        codex['features'] = {**codex.get('features', {}), 'amendments': True}
        if replayed:  # name each year after the amendments made in it
            made = {}
            for d in history['revisionDocs']:
                if any(a['year'] == d['year'] and a['label'].startswith('《' + d['title'].replace('中华人民共和国', '')) for a in history['amendments']):
                    made.setdefault(d['year'], []).append(d['short'])
            codex['yearLabels'] = {str(y): f"{y} 年（{'、'.join(made[y])}）" if y in made else f'{y} 年原文' if y == history['years'][0] else f'{y} 年' for y in history['years']}
        path.write_text(json.dumps(codex, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    env = {**os.environ, 'FADIAN_CODEX': v['id'], 'PYTHONDONTWRITEBYTECODE': '1'}
    built = subprocess.run([sys.executable, str(DEMO / 'build.py')], env=env, capture_output=True, text=True)
    checked = subprocess.run([sys.executable, str(DEMO / 'codes/check_pack.py'), v['id']], capture_output=True, text=True)
    codex = json.loads((DEMO / 'codes' / v['id'] / 'codex.json').read_text(encoding='utf-8'))
    history = json.loads((DEMO / 'codes' / v['id'] / 'versions.json').read_text(encoding='utf-8'))
    units, year = [u for u in history['units'] if u['versions'][str(history['years'][-1])]['exists']], str(history['years'][-1])
    index = {u['id']: i for i, u in enumerate(units)}
    line = lambda u: f"- {u['label']}：{u['versions'][year]['paragraphs'][0][:40]}…（共 {len(u['versions'][year]['paragraphs'])} 段）"
    parts = [f"- {n.get('title') or n['name']}：{units[index[n['from']]]['label']}—{units[index[n['to']]]['label']}，{index[n['to']] - index[n['from']] + 1} 条"
             for top in codex['structure'] for n in top.get('children', [])]
    later = sorted(p.name for p in (folder / '修正案').iterdir() if not p.name.startswith('.')) if (folder / '修正案').is_dir() else []
    ok = built.returncode == 0 and checked.returncode == 0
    report = [f"# 核对报告 · {v['name']}", '',
              f"- 结果：{'已加入法典笔记' if ok else '没有完成，见下方的检查结果'}",
              f"- 现行文本：{source.name}", f"- 标识：{v['id']}　条文前缀：{v['prefix']}　年份：{year}",
              f"- 共 {len(units)} 条（其中“第×条之×” {sum(1 for u in units if '之' in u['label'])} 条），目录 {len(parts)} 项",
              f"- 打开方式：双击项目文件夹中的「打开{v['short']}笔记.command」；教师版应用重新打开后，在“法典”菜单中也能看到。", '',
              '## 请对照原件核对', '', '工具不改动文字，但切分可能出错。请核对条数、每一部分的起止，并抽查几条。', '',
              '### 开头三条', *map(line, units[:3]), '', '### 末尾三条', *map(line, units[-3:]), '',
              '### 各部分的起止和条数', *(parts or ['（没有编、章、节）']), '',
              *(['## 历年文本', '', f"共 {len(several)} 个文本：" + '、'.join(f'{y} 年 {counts[y]} 条' for y in sorted(counts)) + '。相邻文本的条文按文字相似度自动对应，请抽查。', '',
                 *(f"- {y} 年相对上一文本：" + '，'.join(f'{k} {n} 条' for k, n in s.items()) for y, s in changes.items()), '',
                 *([f"- 有 {history['validation']['paragraphsTakenFromLaterText']} 条的早期文本与后来的文本文字完全相同、只是分段不同（来源网页把几款连成了一段），已按后来文本的分段显示，不算修改。", ''] if history['validation'].get('paragraphsTakenFromLaterText') else []),
                 *([f"- 早期文本有 {history['validation']['paragraphsDividedByReference']} 处按“分段参考”文件重新分段（文字不变）。", ''] if history['validation'].get('paragraphsDividedByReference') else []),
                 '### 被删去或并入其他条的旧条文', *([f"- {u['label']}（最后见于 {max(int(y) for y, x in u['versions'].items() if x['exists'])} 年）：{next(x for x in reversed(list(u['versions'].values())) if x['exists'])['paragraphs'][0][:36]}…"
                                        for u in history['units'] if not u['versions'][year]['exists']] or ['（无）']), ''] if several else []),
              *(['## 逐项重放修正案', '', *replayed, ''] if replayed else []),
              '## 还没有做的', '', (f"- 条旨取自文件夹中的 条旨.json，共 {sum(1 for k in titles if not k.startswith('_'))} 条（有来源标记）；另有拟定条旨.json 中的拟定条旨，可由使用者修改。" if titles else '- 条旨（每条的小标题）是空的，可以在阅读时自己填写。'), '- 使用说明中的例题是通用的，没有引用这部法典的条文。',
              *(['- 只有现行文本一个版本，没有历次修改的逐字对照。'] if not several else ['- 各年目录沿用最新文本的章节；早期文本的章节名称若有不同，没有单独记录。', '- 没有修正案（修改决定）的原文，条文下不显示对应的修改决定。']),
              *([f"- 修正案文件夹中的 {len(later)} 份文件尚未处理：{'、'.join(later)}。把修正案挂到条文下、重建历年文本，见《给助手的说明》第五节。"] if later else []),
              '', '## 检查结果', '', '```', (checked.stdout + checked.stderr).strip(), (built.stdout + built.stderr).strip(), '```', '']
    (folder / '核对报告.md').write_text('\n'.join(report), encoding='utf-8')
    print(f"{'已加入' if ok else '未完成'}：{v['name']}，{len(units)} 条。核对报告：新法典/{folder.name}/核对报告.md")
    return ok


def main():
    args = [a for a in sys.argv[1:] if a != '--redo']
    redo = '--redo' in sys.argv[1:]
    if args:
        folders = [next((p for p in (Path(a), PROJECT / a, INBOX / a) if p.is_dir()), INBOX / a) for a in args]
    else:
        folders = [p for p in sorted(INBOX.iterdir()) if p.is_dir() and not p.name.startswith(('_', '.')) and (redo or not (p / '核对报告.md').exists())]
        if not folders:
            print('新法典/ 中没有待加入的文件夹（已有核对报告的不再重复加入；要重做请加 --redo）。')
    results = []
    for folder in folders:
        if not folder.is_dir():
            raise SystemExit(f'找不到文件夹：{folder}')
        results.append(add(folder, redo))
    sys.exit(0 if all(results) else 1)


if __name__ == '__main__':
    main()
