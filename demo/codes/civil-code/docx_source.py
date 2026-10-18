"""Strict DOCX extraction for this data pack; Python standard library only.

Only leading/trailing paragraph whitespace and the article-number separator are
removed. Body words, punctuation and paragraph boundaries are never rewritten.
"""
import hashlib
import re
from pathlib import Path
from xml.etree import ElementTree as ET
from zipfile import ZipFile

NS = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
W = '{' + NS['w'] + '}'
NUM = '零一二三四五六七八九十百千'
ARTICLE = re.compile(r'^(第([' + NUM + r']+)条)\s*(.*)$')
HEADING = re.compile(r'^(第([' + NUM + r']+)(分编|编|章|节))\s*(.+)$')
LEVELS = {'编': ('part', 0), '分编': ('subpart', 1), '章': ('chapter', 2), '节': ('section', 3)}


def number(value):
    total = digit = 0
    for char in value:
        if char in '零一二三四五六七八九':
            digit = '零一二三四五六七八九'.index(char)
        else:
            total += (digit or 1) * {'十': 10, '百': 100, '千': 1000}[char]
            digit = 0
    return total + digit


def paragraphs(path, source):
    raw = Path(path).read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    if digest != source['sha256']:
        raise ValueError(f"{source['file']} SHA-256 不一致：{digest}；请重新核对原文件，勿直接覆盖校验值")
    with ZipFile(path) as archive:
        root = ET.fromstring(archive.read('word/document.xml'))
    body = root.find('w:body', NS)
    if body.find('w:tbl', NS) is not None:
        raise ValueError('发现表格，须人工确认读取顺序')
    if root.find('.//w:del', NS) is not None or root.find('.//w:ins', NS) is not None:
        raise ValueError('发现修订标记，须先核对官方定稿文本')
    out = []
    for i, p in enumerate(body.findall('w:p', NS), 1):
        chunks = []
        for element in p.iter():
            if element.tag == W + 't':
                chunks.append(element.text or '')
            elif element.tag == W + 'tab':
                chunks.append('\t')
            elif element.tag in (W + 'br', W + 'cr'):
                if element.get(W + 'type') != 'page':
                    chunks.append('\n')
        text = ''.join(chunks).strip()
        if text:
            out.append((i, text))
    return out


def parse_law(path, source, count, prefix):
    rows = paragraphs(path, source)
    first = next(i for i, (_, t) in enumerate(rows) if ARTICLE.match(t))
    if number(ARTICLE.match(rows[first][1])[2]) != 1:
        raise ValueError('正文未从第一条开始')
    root_title = next(t for _, t in rows if HEADING.match(t))
    start = max(i for i in range(first) if rows[i][1] == root_title)
    toc = [t for _, t in rows[:start] if HEADING.match(t) or re.fullmatch(r'附\s*则', t)]
    structure, stack, headings, articles = [], [], [], {}
    current = None
    for index, text in rows[start:]:
        h = HEADING.match(text)
        plain = re.fullmatch(r'附\s*则', text)
        if h or plain:
            level, rank = LEVELS[h[3]] if h else ('plain', 0)
            while stack and stack[-1][0] >= rank:
                _, previous = stack.pop()
                previous['to'] = prefix + str(len(articles))
            node = {'id': f'{prefix}-node-{len(headings) + 1}', 'level': level,
                    'name': h[4] if h else text, 'title': text,
                    'from': prefix + str(len(articles) + 1)}
            if h:
                node['number'] = number(h[2])
            if stack:
                stack[-1][1].setdefault('children', []).append(node)
            else:
                structure.append(node)
            stack.append((rank, node))
            headings.append(text)
            current = None
            continue
        a = ARTICLE.match(text)
        if a:
            n = number(a[2])
            if n != len(articles) + 1:
                raise ValueError(f'条号不连续或重复：{a[1]}')
            current = {'label': a[1], 'paragraphs': [], 'sourceParagraphs': []}
            articles[n] = current
            text = a[3].strip()
        if current is None or not text:
            raise ValueError(f'无法归入正文的段落 {index}：{text!r}')
        current['paragraphs'].append(text)
        current['sourceParagraphs'].append(index)
    while stack:
        stack.pop()[1]['to'] = prefix + str(len(articles))
    if len(articles) != count:
        raise ValueError(f'条数 {len(articles)}，预期 {count}')
    if toc and toc != headings:
        raise ValueError('目录标题与正文标题不一致，须逐项核对')
    if any(not a['paragraphs'] for a in articles.values()):
        raise ValueError('存在空条文')
    return articles, structure, {'articleCount': count, 'paragraphCount': sum(len(a['paragraphs']) for a in articles.values()),
                                'headingCount': len(headings), 'tocMatchesBody': bool(toc),
                                'bodySha256': hashlib.sha256('\n'.join(p for a in articles.values() for p in a['paragraphs']).encode()).hexdigest()}


def version(article, source):
    if article is None:
        return {'exists': False, 'label': '', 'paragraphs': [], 'amendments': [], 'sourceRefs': [], 'diff': [], 'changed': False}
    return {'exists': True, 'label': article['label'], 'paragraphs': article['paragraphs'],
            'amendments': [], 'sourceRefs': [], 'diff': [{'type': 'equal', 'text': '\n'.join(article['paragraphs'])}], 'changed': False, 'sourceFile': source['file'],
            'sourceParagraphs': article['sourceParagraphs'], 'method': '国家法律法规数据库 DOCX 逐段提取；仅去除段首段尾空白和条号分隔空白'}
