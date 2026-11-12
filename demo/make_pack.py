#!/usr/bin/env python3
"""Turn a document into a module: python3 demo/make_pack.py 文件 --name 名称 [选项]

The document can be a law, a policy or any text, as .docx, .txt or .md. It is cut into units:

- a law: 第一条、第二条…, with 编、章、节 as its table of contents;
- a policy or notice without articles: 一、二、三、… each become a unit, the opening paragraphs
  become 引言;
- any other text: one unit per paragraph.

The module is written to demo/modules/<标识>/ (module.json, versions.json, subtitles.json). List it
in a code's codex.json ("modules": […]) and run build.py, or pass --code to get a code of its own
right away, opened with `python3 demo/launch.py --open --codex <标识>`.

Options:
  --name 名称     full name of the document (required)
  --short 简称    short name shown before article numbers; default: the name
  --id 标识       folder name, letters, digits and hyphens; default: made from the name
  --prefix 前缀   letters put before article ids (e.g. gdpr → gdpr1, gdpr2…); default: the id's letters
  --year 年份     year of this text; default: this year
  --code          also create demo/codes/<标识>/ containing just this module

The words of the document are never changed: only blank space at the ends of paragraphs and the
separator after an article number are removed. Check the result against the original.
Python standard library only.
"""
import argparse
from datetime import date
import hashlib
import json
from pathlib import Path
import re
from xml.etree import ElementTree
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parent
NUM = '零〇一二三四五六七八九十百千'
ARTICLE = re.compile(r'^(第([' + NUM + r'\d]+)条(?:之([' + NUM + r'\d]+)(?=[\s　]|$))?)[\s　]*(.*)$', re.S)
HEADING = re.compile(r'^(第([' + NUM + r'\d]+)(分编|编|章|节))[\s　]*(.*)$')
ITEM = re.compile(r'^([' + NUM + r']+)、[\s　]*(.*)$', re.S)
RANKS = {'编': ('part', 0), '分编': ('subpart', 1), '章': ('chapter', 2), '节': ('section', 3)}
LEVELS = {'part': {'name': '编', 'numbered': True}, 'subpart': {'name': '分编', 'numbered': True},
          'chapter': {'name': '章', 'numbered': True}, 'section': {'name': '节', 'numbered': True},
          'plain': {'name': '', 'numbered': False}}
CN = '零一二三四五六七八九'


def number(value):
    if value.isdigit():
        return int(value)
    total = digit = 0
    for char in value.replace('〇', '零'):
        if char in CN:
            digit = CN.index(char)
        else:
            total += (digit or 1) * {'十': 10, '百': 100, '千': 1000}[char]
            digit = 0
    return total + digit


def cn_number(n):
    if n < 10:
        return CN[n]
    if n < 100:
        return ('' if n < 20 else CN[n // 10]) + '十' + (CN[n % 10] if n % 10 else '')
    if n < 1000:
        rest = n % 100
        return CN[n // 100] + '百' + ('' if not rest else '零' + CN[rest] if rest < 10 else '一' + cn_number(rest) if rest < 20 else cn_number(rest))
    rest = n % 1000
    return CN[n // 1000] + '千' + ('' if not rest else ('零' if rest < 100 else '') + ('一' + cn_number(rest) if 10 <= rest < 20 else cn_number(rest)))


def paragraphs(path):
    if path.suffix.lower() == '.docx':
        ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
        w = '{' + ns['w'] + '}'
        with ZipFile(path) as archive:
            root = ElementTree.fromstring(archive.read('word/document.xml'))
        if root.find('.//w:del', ns) is not None or root.find('.//w:ins', ns) is not None:
            raise SystemExit('文件中有修订标记，请先接受或拒绝全部修订，另存后再试。')
        rows = []
        for p in root.find('w:body', ns).iter(w + 'p'):
            chunks = []
            for element in p.iter():
                if element.tag == w + 't':
                    chunks.append(element.text or '')
                elif element.tag == w + 'tab':
                    chunks.append(' ')
                elif element.tag in (w + 'br', w + 'cr') and element.get(w + 'type') != 'page':
                    chunks.append('\n')
            rows += ''.join(chunks).split('\n')
    elif path.suffix.lower() in ('.txt', '.md'):
        raw = path.read_bytes()
        for encoding in ('utf-8-sig', 'gb18030'):
            try:
                rows = raw.decode(encoding).splitlines()
                break
            except UnicodeDecodeError:
                continue
        else:
            raise SystemExit('无法识别文件的文字编码，请另存为 UTF-8 文本。')
    else:
        raise SystemExit('支持 .docx、.txt 和 .md 文件。PDF 请先另存为 Word 或文本，并核对文字。')
    if path.suffix.lower() == '.md':  # heading marks and rules are layout, not text
        rows = [re.sub(r'^#{1,6}\s+', '', row.strip()) for row in rows if not re.fullmatch(r'\s*(-{3,}|\*{3,}|_{3,})\s*', row)]
    return [text for text in (row.strip(' \t　\r') for row in rows) if text]


def paragraphs_of_text(text):
    rows = [re.sub(r'^#{1,6}\s+', '', row.strip()) for row in text.splitlines() if not re.fullmatch(r'\s*(-{3,}|\*{3,}|_{3,})\s*', row)]
    return [t for t in (row.strip(' \t　\r') for row in rows) if t]


def cut(rows, prefix):
    """Units, table of contents and the kind of document."""
    units, structure, stack = [], [], []
    articles = [i for i, text in enumerate(rows) if ARTICLE.match(text)]
    if len(articles) >= 3:
        first = articles[0]
        headings = [i for i in range(first) if HEADING.match(rows[i]) or re.fullmatch(r'附[\s　]*则', rows[i])]
        # A table of contents before the text repeats the headings: start at the last copy of the first one.
        start = max((i for i in headings if rows[i] == rows[headings[0]]), default=first) if headings else first
        current, last = None, (0, 0)
        for text in rows[start:]:
            h, plain = HEADING.match(text), re.fullmatch(r'附[\s　]*则', text)
            if (h or plain) and not ARTICLE.match(text):
                level, rank = RANKS[h[3]] if h else ('plain', 0)
                while stack and stack[-1][0] >= rank:
                    stack.pop()[1]['to'] = len(units)
                node = {'id': f'{prefix}-node-{sum(1 for _ in flat(structure)) + 1}', 'level': level, 'name': (h[4] if h else text).strip(), 'title': text, 'from': len(units) + 1}
                if h:
                    node['number'] = number(h[2])
                (stack[-1][1].setdefault('children', []) if stack else structure).append(node)
                stack.append((rank, node))
                current = None
                continue
            ap = re.fullmatch(r'附件([一二三四五六七八九十\d]*)', text)
            if ap and units:  # lists attached to the law, after its last article
                while stack:
                    stack.pop()[1]['to'] = len(units)
                if not any(n['id'] == f'{prefix}-appendix' for n in structure):
                    structure.append({'id': f'{prefix}-appendix', 'level': 'plain', 'name': '附件', 'title': '附件', 'from': len(units) + 1})
                current = {'kind': 'appendix', 'number': None, 'id': f'{prefix}-fj{sum(1 for u in units if u["kind"] == "appendix") + 1}', 'label': text, 'paragraphs': []}
                units.append(current)
                continue
            a = ARTICLE.match(text) if not (current and current['kind'] == 'appendix') else None
            if a:
                # 第一百二十条之一: an article added later keeps the number of the article before it.
                n, extra = number(a[2]), number(a[3]) if a[3] else 0
                if (n, extra) not in ((last[0] + 1, 0), (last[0], last[1] + 1)):
                    raise SystemExit(f'条号不连续或重复：在“{units[-1]["label"] if units else "开头"}”之后遇到“{a[1]}”。请核对文件；若正文中有以“第×条”开头的段落，请在其前加一个字后重试。')
                last = (n, extra)
                current = {'kind': 'article', 'number': None if extra else n, 'id': f'{prefix}{n}' + (f'-{extra}' if extra else ''),
                           'label': f'第{cn_number(n)}条' + (f'之{cn_number(extra)}' if extra else ''), 'paragraphs': []}
                units.append(current)
                text = a[4].strip()
            if current is None:
                raise SystemExit(f'无法归入条文的段落：{text[:40]}')
            if text:
                current['paragraphs'].append(text)
        while stack:
            stack.pop()[1]['to'] = len(units)
        for node in structure:
            node.setdefault('to', len(units))
        kind = 'law'
    else:
        items = [i for i, text in enumerate(rows) if ITEM.match(text)]
        sequence = [number(ITEM.match(rows[i])[1]) for i in items]
        if len(items) >= 2 and sequence == list(range(1, len(items) + 1)):
            if items[0] > 0:
                units.append({'kind': 'preamble', 'number': 0, 'label': '引言', 'paragraphs': rows[:items[0]]})
            for k, i in enumerate(items):
                body = rows[i:items[k + 1] if k + 1 < len(items) else len(rows)]
                head = ITEM.match(body[0])[2].strip()
                label = f'{cn_number(k + 1)}、{head}' if head and len(head) <= 24 and '。' not in head else f'第{cn_number(k + 1)}部分'
                units.append({'kind': 'item', 'number': k + 1, 'label': label, 'paragraphs': body[1:] if label.endswith(head) and head and len(body) > 1 else body})
            kind = 'items'
        else:
            units = [{'kind': 'paragraph', 'number': k + 1, 'label': f'第{cn_number(k + 1)}段', 'paragraphs': [text]} for k, text in enumerate(rows)]
            kind = 'paragraphs'
    if not units or any(not u['paragraphs'] for u in units):
        raise SystemExit('没有切出可用的条文，或有空条文。请核对文件。')
    for k, unit in enumerate(units):
        unit.setdefault('id', f'{prefix}{k + 1}')
    for node in flat(structure):  # from/to were counted in units
        node['from'], node['to'] = units[node['from'] - 1]['id'], units[node['to'] - 1]['id']
    return units, structure, kind


def flat(nodes):
    for node in nodes:
        yield node
        yield from flat(node.get('children', []))


def write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def main(argv=None):
    parser = argparse.ArgumentParser(description='把一份文件做成法典笔记的模块。', epilog=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('file')
    parser.add_argument('--name', required=True)
    parser.add_argument('--short')
    parser.add_argument('--id')
    parser.add_argument('--prefix')
    parser.add_argument('--year', type=int, default=date.today().year)
    parser.add_argument('--code', action='store_true')
    args = parser.parse_args(argv)
    source = Path(args.file).expanduser()
    if not source.is_file():
        raise SystemExit(f'找不到文件：{source}')
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    ident = args.id or re.sub(r'[^a-z0-9]+', '-', args.name.lower()).strip('-') or 'doc-' + digest[:6]
    if not re.fullmatch(r'[a-z][a-z0-9-]{0,30}', ident):
        raise SystemExit('标识请用小写字母开头，只含小写字母、数字和连字符，例如 --id gdpr')
    prefix = args.prefix or re.sub(r'[^a-z]', '', ident)[:6]
    if not re.fullmatch(r'[A-Za-z]{1,8}', prefix):
        raise SystemExit('前缀请用 1—8 个字母，例如 --prefix gdpr')
    folder = ROOT / 'modules' / ident
    if folder.exists():
        raise SystemExit(f'模块 {ident} 已经存在（{folder}）。换一个 --id，或先删除原文件夹。')
    for other in sorted((ROOT / 'modules').glob('*/versions.json')) + sorted((ROOT / 'codes').glob('*/versions.json')):
        first = json.loads(other.read_text(encoding='utf-8'))['units'][0]['id']
        if re.sub(r'\d+$', '', first) == prefix:
            raise SystemExit(f'前缀 {prefix} 已被 {other.parent.name} 使用，请用 --prefix 另选一个。')
    units, structure, kind = cut(paragraphs(source), prefix)
    short, year = args.short or args.name, args.year
    record = {'file': source.name, 'title': args.name, 'sha256': digest, 'converted': date.today().isoformat()}
    method = f'make_pack.py 自 {source.suffix.lower()[1:]} 文件逐段提取；仅去除段首段尾空白和条号分隔空白'
    history = {'years': [year], 'sources': [record], 'units': [
        {'id': u['id'], 'kind': u['kind'], 'number': u['number'], 'label': u['label'], 'versions': {str(year): {
            'exists': True, 'label': u['label'], 'paragraphs': u['paragraphs'], 'amendments': [], 'sourceRefs': [],
            'diff': [{'type': 'equal', 'text': '\n'.join(u['paragraphs'])}], 'changed': False, 'sourceFile': source.name, 'method': method}}}
        for u in units], 'amendments': [], 'validation': {'documents': {ident: {
            'unitCount': len(units), 'paragraphCount': sum(len(u['paragraphs']) for u in units),
            'bodySha256': hashlib.sha256('\n'.join(p for u in units for p in u['paragraphs']).encode()).hexdigest()}}}}
    quoted = f'《{args.name}》'
    law = {'name': args.name, 'short': short, 'aliases': [], 'citation': {
        'latest': quoted, 'original': quoted + '（{year} 年）', 'amended': quoted + '（{year} 年修正）',
        'aliases': list(dict.fromkeys([args.name, short])), 'note': '引用时注明文件全称、条款；引用以往文本时注明版本年份。'}}
    used = {node['level'] for node in flat(structure)}
    write(folder / 'module.json', {'id': ident, 'name': short, 'about': f'{args.name}，由 make_pack.py 自 {source.name} 生成，文字待与原件核对。',
                                   'years': [year], 'books': [f'user-{ident}'], 'law': law,
                                   'levels': {key: value for key, value in LEVELS.items() if key in used}, 'structure': structure})
    write(folder / 'versions.json', history)
    write(folder / 'subtitles.json', {})
    what = {'law': '按条切分', 'items': '按“一、二、三、”切分', 'paragraphs': '按自然段切分'}[kind]
    print(f'已生成模块 {ident}：{what}，共 {len(units)} 个单元，目录 {sum(1 for _ in flat(structure))} 项。文件夹：demo/modules/{ident}/')
    print(f'  首：{units[0]["label"]} {units[0]["paragraphs"][0][:30]}…')
    print(f'  末：{units[-1]["label"]} {units[-1]["paragraphs"][0][:30]}…')
    if args.code:
        make_code(ident, args.name, short, units[0])
    else:
        print(f'下一步：在某部法典的 codex.json 的 "modules" 中加上 "{ident}"，再运行 python3 demo/build.py；或重新运行并加 --code。')


def make_code(ident, name, short, first):
    """A code that holds just this module, so it can be opened right away."""
    from compose import new_code
    new_code(ident, name, short, [ident])
    print(f'已生成法典 {ident}。运行 python3 demo/build.py 生成页面；之后双击「打开{short}笔记.command」，或 python3 demo/launch.py --open --codex {ident}。')


if __name__ == '__main__':
    main()
