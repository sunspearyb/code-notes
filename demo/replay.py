"""Replay amendments: from the first text of a law to its current text, one amendment at a time.

add_code.py calls this when a folder holds the original text, the current text and the amendments
between them. Each item of an amendment is read as one or more operations on an article
(修改为、增加一款、增加一条、删去…) and applied to the text as it stood. The text after an article's
last amendment must equal the current text; where it does not, the current text is used all the
same and the article is listed for checking. The law then has one version per year of amendment.
"""
import difflib
import re

N = '零一二三四五六七八九十百'
ART = rf'第[{N}]+条(?:之[{N}]+)?'
ITEM = re.compile(rf'^（([{N}]+)）')
CN = '零一二三四五六七八九'


def cn(text):
    total = digit = 0
    for ch in text:
        if ch in CN:
            digit = CN.index(ch)
        else:
            total += (digit or 1) * {'十': 10, '百': 100}[ch]
            digit = 0
    return total + digit


def cn_number(n):
    return CN[n] if n < 10 else ('' if n < 20 else CN[n // 10]) + '十' + (CN[n % 10] if n % 10 else '')


def norm(paragraphs):
    """For comparing texts from different sources: no spaces, one kind of colon and quotation mark, half-width digits."""
    text = re.sub(r'\s', '', ''.join(paragraphs or []))
    return re.sub(r'[“”"‘’\']', '', text).replace(':', '：').replace(',', '，').translate(str.maketrans('０１２３４５６７８９', '0123456789'))


def clauses(paragraphs):
    """款: a paragraph, with the enumerated 项 that follow it."""
    groups = []
    for p in paragraphs:
        if ITEM.match(p) and groups:
            groups[-1].append(p)
        else:
            groups.append([p])
    return groups


def segments(paragraphs):
    """An item as [(lead, quoted paragraphs, remark)]: 增加一款作为第二款:“…” 原第二款作为第三款，修改为:“…”."""
    out = []
    for p in paragraphs:
        if p.startswith('“') and out:
            out[-1][1].append(p)
            continue
        m = re.search(r'[：:]\s*“', p)
        if m:
            out.append([p[:m.start()], [p[m.end() - 1:]], ''])
        elif re.search(r'修改为[：:]', p) and '“' not in p:  # an unquoted replacement (1998 decision)
            lead, _, text = re.split(r'(修改为)[：:]', p, 1)
            out.append([lead + '修改为', ['“' + text + '”'], ''])
        else:
            out.append([p, [], ''])
    for seg in out:
        if seg[1]:
            last = seg[1][-1]
            end = last.rfind('”')
            if end >= 0:
                seg[2] = last[end + 1:].lstrip('。')
                seg[1][-1] = last[:end] + ('。' if last[end + 1:].startswith('。') and last[:end][-1:] not in '。；' else '')
            seg[1] = [q[1:] if q.startswith('“') else q for q in seg[1]]
            seg[1] = [q for q in seg[1] if q]
    return out


def operations(item):
    """[(kind, article label(s), numbers, quoted paragraphs)] for one item of an amendment."""
    ops, target = [], None
    for lead, quoted, remark in segments(item['paragraphs']):
        lead = re.sub(rf'^[{N}]+、', '', lead)
        first = re.search(ART, lead)
        nums = lambda text: [cn(x) for x in re.findall(rf'第([{N}]+)[款项]', text)]
        m = re.search(rf'(?:后|后面)增加[{N}两]+条，?作为(.+)$', lead)
        if m:
            labels = re.findall(ART, m[1])
            parts, current = {}, None
            for q in quoted:
                head = re.match(rf'({ART})[\s　]*(.*)$', q, re.S)
                if head and head[1] in labels:
                    current = head[1]
                    parts[current] = [head[2]] if head[2] else []
                elif current:
                    parts[current].append(q)
            if not parts:
                parts = {labels[0]: quoted}
            ops += [('article', label, [], parts.get(label, [])) for label in labels]
            continue
        if first and not re.search(r'原第|^增加', lead):
            target = first[0]
        if not target:
            continue
        if '将该条修改为' in lead or re.search(rf'{ART}修改为$', lead):
            ops.append(('article', target, [], quoted))
        elif re.search(rf'原第[{N}]+款作为第([{N}]+)款，修改为', lead):
            ops.append(('clause', target, [cn(re.search(rf'作为第([{N}]+)款', lead)[1])], quoted))
        elif re.search(rf'第[{N}]+款(?:、第[{N}]+款)*修改为$', lead):
            ops.append(('clause', target, nums(lead.split('条', 1)[1] if first else lead), quoted))
        elif re.search(rf'第[{N}]+项修改为$', lead):
            ops.append(('item', target, nums(lead)[-1:], quoted))
        elif re.search(rf'增加[一二两]款，?作为第', lead):
            ops.append(('add-clause', target, nums(lead.split('增加', 1)[1]), quoted))
        elif re.search(rf'增加一项，?作为第', lead):
            ops.append(('add-item', target, nums(lead.split('增加', 1)[1]), quoted))
        elif re.search(rf'^删去(?:刑法)?{ART}(?:第[{N}]+款)?。?$', lead):
            ops.append(('delete', target, nums(lead), []))
    return ops


def apply(state, kind, numbers, quoted):
    """The article's paragraphs after one operation; raises ValueError when the operation does not fit."""
    if kind == 'article':
        return list(quoted)
    if state is None:
        raise ValueError('条文尚不存在')
    groups = clauses(state)
    if kind == 'delete':
        if not numbers:
            return ['（删去）']
        del groups[numbers[0] - 1]
    elif kind == 'clause':
        lo, hi = min(numbers) - 1, max(numbers)
        if hi > len(groups):
            raise ValueError('没有这一款')
        groups[lo:hi] = clauses(quoted)
    elif kind == 'add-clause':
        new = clauses(quoted)
        if len(new) != len(numbers) and len(numbers) == 1:
            new = [quoted]
        at = min(numbers) - 1
        if at > len(groups):
            raise ValueError('款的位置超出范围')
        groups[at:at] = new
    else:  # item, add-item: in the 款 that has items
        holder = next((g for g in groups if any(ITEM.match(p) for p in g[1:])), None)
        if holder is None:
            raise ValueError('本条没有项')
        n, text = numbers[0], quoted[0]
        text = text if ITEM.match(text) else f'（{cn_number(n)}）{text}'
        places = [i for i, p in enumerate(holder) if ITEM.match(p)]
        if kind == 'item':
            holder[places[n - 1]] = text
        else:
            holder.insert(places[n - 1] if n - 1 < len(places) else len(holder), text)
            count = 0
            for i, p in enumerate(holder):
                if ITEM.match(p):
                    count += 1
                    holder[i] = ITEM.sub(f'（{cn_number(count)}）', p, 1)
    return [p for g in groups for p in g]


def diff_ops(old, new):
    a, b = '\n'.join(old), '\n'.join(new)
    out = []
    for tag, a1, a2, b1, b2 in difflib.SequenceMatcher(None, a, b, autojunk=False).get_opcodes():
        if tag == 'equal':
            out.append({'type': 'equal', 'text': b[b1:b2]})
        else:
            if a2 > a1:
                out.append({'type': 'delete', 'text': a[a1:a2]})
            if b2 > b1:
                out.append({'type': 'insert', 'text': b[b1:b2]})
    return out


def replay(history, phrase_changes=()):
    """Gives history one version per year of amendment. Returns the lines of a report.
    phrase_changes: [(doc id, old, new)] for decisions that replace a phrase in the articles they name."""
    first, last = str(history['years'][0]), str(history['years'][-1])
    docs = history.get('revisionDocs', [])
    by_label = {}
    for u in history['units']:
        for v in u['versions'].values():
            if v['exists']:
                by_label.setdefault(v['label'], u)
    plan, amendments, unread = {}, [], []  # unit id → [(year, number, kind, numbers, quoted, doc short + item label)]
    for doc in docs:
        for index, item in enumerate(doc['items']):
            name = f"《{doc['title'].replace('中华人民共和国', '')}》{item['label']}"
            found = operations(item)
            swap = next(((old, new) for d, old, new in phrase_changes if d == doc['id']), None)
            if swap:
                found = [('phrase', by_label[u_label]['versions'][last]['label'], swap, []) for u_label in
                         [u['versions'][last]['label'] for u in history['units'] if u['id'] in item.get('unitIds', [])]]
            if not found:
                if item.get('unitIds'):
                    unread.append(f"{doc['short']}{item['label']}：{item['paragraphs'][0][:36]}…")
                continue
            number = len(amendments) + 1
            amendments.append({'year': doc['year'], 'number': number, 'label': name, 'text': '\n'.join(item['paragraphs']), 'sourceRefs': []})
            for kind, label, numbers, quoted in found:
                unit = by_label.get(label)
                if unit is None:
                    unread.append(f"{doc['short']}{item['label']}：找不到{label}")
                    continue
                plan.setdefault(unit['id'], []).append((doc['year'], number, kind, numbers, quoted, f"{doc['short']}{item['label']}"))
    years = sorted({int(first), int(last), *(year for steps in plan.values() for year, *_ in steps)})
    mismatched, failed, untouched, intermediate = [], [], [], 0
    for u in history['units']:
        origin, final = u['versions'][first], u['versions'][last]
        steps = plan.get(u['id'], [])
        label = final['label'] if final['exists'] else origin['label']
        state = list(origin['paragraphs']) if origin['exists'] else None
        versions, previous, ok = {}, None, True
        for year in years:
            mine = [s for s in steps if s[0] == year]
            for _, number, kind, numbers, quoted, where in mine:
                try:
                    state = state.copy() if state else state
                    if kind == 'phrase':
                        state = [p.replace(numbers[0], numbers[1]) if numbers[1] not in p else p for p in state]
                    else:
                        state = apply(state, kind, numbers, quoted)
                except (ValueError, IndexError, TypeError) as error:
                    ok = False
                    failed.append(f'{label}（{where}）：{error or "没有读懂"}')
            is_last = bool(mine) and not any(s[0] > year for s in steps)
            if is_last or (not steps and year == int(last)):
                if steps and final['exists'] and norm(state) != norm(final['paragraphs']):
                    if ok:
                        mismatched.append(f"{label}（{'、'.join(s[5] for s in steps)}）")
                    ok = False
                state = list(final['paragraphs']) if final['exists'] else None
            elif mine:
                intermediate += 1
            if not steps and year == int(last) and origin['exists'] and final['exists'] and origin['paragraphs'] != final['paragraphs']:
                untouched.append(label)
            if state is None:
                entry = {'exists': False, 'label': '', 'paragraphs': [], 'amendments': [], 'sourceRefs': [], 'diff': [], 'changed': previous is not None}
            else:
                changed = year != years[0] and (previous is None or previous != state)
                entry = {'exists': True, 'label': label, 'paragraphs': list(state), 'amendments': [s[1] for s in mine], 'sourceRefs': [],
                         'diff': [{'type': 'equal', 'text': '\n'.join(state)}] if year == years[0] or previous is None else diff_ops(previous, state) if changed else [],
                         'changed': changed, **({'unverified': True} if not ok and mine else {})}
            versions[str(year)] = entry
            previous = list(state) if state is not None else None
        u['versions'] = versions
    history['years'] = years
    history['amendments'] = amendments
    history['validation'].update(replayedAmendments=len(amendments), replayMismatches=len(mismatched) + len(failed))
    touched = len(plan)
    lines = [f"从 {first} 年原文出发，逐项重放了 {len(amendments)} 项修改，涉及 {touched} 条；共得到 {len(years)} 个年份的文本：{'、'.join(map(str, years))}。",
             f"重放到最后一次修改的结果与现行文本相同的有 {touched - len(mismatched) - len({f.split('（')[0] for f in failed})} 条。中间年份的文本（{intermediate} 处）是重放得出的，没有别的文本可以对照。", '']
    if failed:
        lines += ['### 没有读懂或无法套用的修改（这些条文的中间年份文本不可靠，最后一次修改后用现行文本）', *('- ' + f for f in failed), '']
    if mismatched:
        lines += ['### 重放结果与现行文本不同（最后一次修改后用现行文本；中间年份文本请核对）', *('- ' + m for m in mismatched), '']
    if unread:
        lines += ['### 没有处理的修改项', *('- ' + x for x in unread), '']
    if untouched:
        lines += [f"### 没有修正案涉及、但两个文本不同的条文（底本排版差异，记在 {last} 年）", '- ' + '、'.join(untouched), '']
    return lines
