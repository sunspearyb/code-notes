#!/usr/bin/env python3
"""Check a data pack before building it: python3 demo/codes/check_pack.py <名称>

Checks the files listed in codex.json, that every article has a text in each year in which it
exists, that article labels match their numbers, that the table of contents covers every
article exactly once, that subtitles and guide examples point to real articles, and that the
pack's id and port do not clash with other packs. It also prints a count per law, part and
year so the numbers can be compared with the official text. Exit status 1 when something is wrong.
"""
import json
from pathlib import Path
import re
import sys

CODES = Path(__file__).resolve().parent
CN = '零一二三四五六七八九'


def cn_number(n):
    if n < 10:
        return CN[n]
    if n < 100:
        return ('' if n < 20 else CN[n // 10]) + '十' + (CN[n % 10] if n % 10 else '')
    if n < 1000:
        rest = n % 100
        return CN[n // 100] + '百' + ('' if not rest else '零' + CN[rest] if rest < 10 else '一' + cn_number(rest) if rest < 20 else cn_number(rest))
    rest = n % 1000
    tail = '' if not rest else ('零' + (CN[rest] if rest < 10 else '一' + cn_number(rest) if rest < 20 else cn_number(rest)) if rest < 100 else cn_number(rest))
    return CN[n // 1000] + '千' + tail


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    name = sys.argv[1]
    pack = CODES / name
    problems, notes = [], []
    codex = json.loads((pack / 'codex.json').read_text(encoding='utf-8'))
    for key in ('id', 'name', 'short', 'whole', 'amendment', 'citation', 'files', 'levels', 'structure', 'welcome'):
        if key not in codex:
            problems.append(f'codex.json 缺少 {key}')
    data = {}
    for key, file in codex.get('files', {}).items():
        path = pack / file
        if not path.exists():
            problems.append(f'codex.json 列出的 {file} 不存在')
            continue
        data[key] = json.loads(path.read_text(encoding='utf-8'))
    for key in ('history', 'subtitles', 'guide'):
        if key not in data:
            problems.append(f'缺少必需的数据：{key}')
    if problems:
        report(problems, notes)

    # Other packs: id and port must differ.
    for other in CODES.iterdir():
        if other == pack or not (other / 'codex.json').exists() or other.name.startswith('_'):
            continue
        o = json.loads((other / 'codex.json').read_text(encoding='utf-8'))
        if o.get('id') == codex['id']:
            problems.append(f'id {codex["id"]} 与数据包 {other.name} 相同')
        if int(o.get('portOffset', 0)) == int(codex.get('portOffset', 0)):
            problems.append(f'portOffset 与数据包 {other.name} 相同（{codex.get("portOffset", 0)}），两部法典的本机服务会占用同一端口')

    history = data['history']
    years, units = history.get('years', []), history.get('units', [])
    if not years or years != sorted(years) or len(set(years)) != len(years):
        problems.append('versions.json 的 years 必须是从早到晚、不重复的年份')
    ids = [u.get('id') for u in units]
    if len(set(ids)) != len(ids):
        problems.append('条文 id 有重复')
    for u in units:
        if not re.fullmatch(r'[A-Za-z][\w-]{0,40}', u.get('id', '')):
            problems.append(f'条文 id 不合规：{u.get("id")}（字母开头，只用字母、数字、连字符）')
        for year in years:
            v = u.get('versions', {}).get(str(year))
            if v is None:
                problems.append(f'{u["id"]} 缺少 {year} 年的记录（不存在时写 exists:false）')
                continue
            if v.get('exists'):
                if not v.get('paragraphs') or any(not isinstance(p, str) or not p.strip() or p != p.strip() for p in v['paragraphs']):
                    problems.append(f'{u["id"]} {year} 年：段落为空，或段首段尾有空白')
                if u.get('kind') == 'article' and v.get('label') != f'第{cn_number(u.get("number", 0))}条' and u.get('number') and str(year) == str(years[-1]):
                    problems.append(f'{u["id"]}：{years[-1]} 年条号 {v.get("label")} 与 number {u.get("number")} 不一致')
                for p in v['paragraphs']:
                    if re.search(r'[　 ]{2,}|\t', p):
                        notes.append(f'{u["id"]} {year} 年有连续空白，请核对是否为排版残留')
                        break
    index = {uid: i for i, uid in enumerate(ids)}

    # Table of contents: nodes, ranges, coverage.
    levels = codex.get('levels', {})
    seen_nodes = set()

    def walk(nodes, parent_range):
        for n in nodes:
            if n.get('id') in seen_nodes:
                problems.append(f'目录节点 id 重复：{n.get("id")}')
            seen_nodes.add(n.get('id'))
            if n.get('level') not in levels:
                problems.append(f'目录节点 {n.get("id")} 的 level {n.get("level")} 没有在 levels 中声明')
            if n.get('from') not in index or n.get('to') not in index:
                problems.append(f'目录节点 {n.get("id")} 的 from/to 不是已有条文')
                continue
            a, b = index[n['from']], index[n['to']]
            if a > b or parent_range and not (parent_range[0] <= a and b <= parent_range[1]):
                problems.append(f'目录节点 {n.get("id")} 的范围倒置或超出上级')
            if n.get('law') and not {'name', 'short', 'citation'} <= set(n['law']):
                problems.append(f'法律节点 {n.get("id")} 的 law 需要 name、short、citation')
            walk(n.get('children', []), (a, b))
    walk(codex.get('structure', []), None)
    roots = codex.get('structure', [])
    covered = []
    for n in roots:
        if n.get('from') in index and n.get('to') in index:
            covered += ids[index[n['from']]:index[n['to']] + 1]
    if sorted(covered) != sorted(ids) or len(covered) != len(set(covered)):
        missing = sorted(set(ids) - set(covered), key=index.get)[:10]
        problems.append(f'顶层目录没有恰好覆盖全部条文一次{"，未覆盖：" + "、".join(missing) if missing else "（有重叠）"}')
    laws = [n for n in roots if n.get('law')]
    if laws and len(laws) != len(roots):
        problems.append('一个数据包含几部法律时，每个顶层节点都要写 law')
    if not laws:
        for key in ('latest', 'original', 'amended', 'aliases'):
            if key not in codex.get('citation', {}):
                problems.append(f'citation 缺少 {key}')

    # Subtitles and guide examples.
    for uid in data['subtitles']:
        if uid not in index:
            problems.append(f'subtitles.json 中的 {uid} 不是已有条文')
    guide = data['guide']
    for step in guide.get('steps', []):
        if step.get('unitId') and step['unitId'] not in index:
            problems.append(f'guide.json 例题引用的 {step["unitId"]} 不是已有条文')
    if codex.get('welcome', {}).get('start') not in index:
        problems.append('welcome.start 不是已有条文')
    text = json.dumps(guide, ensure_ascii=False) + json.dumps(codex.get('welcome', {}), ensure_ascii=False)
    if codex['id'] != 'cn-constitution' and '宪法' in text:
        notes.append('使用说明或欢迎语中出现“宪法”，请确认不是照抄宪法数据包的文字')

    # Counts to compare with the official text.
    print(f'数据包 {name}（{codex.get("name")}）：{len(units)} 个条文单元，年份 {", ".join(map(str, years))}')
    for year in years:
        alive = [u for u in units if u['versions'][str(year)].get('exists')]
        parts = []
        for n in roots:
            if n.get('from') in index and n.get('to') in index:
                inside = [u for u in alive if index[n['from']] <= index[u['id']] <= index[n['to']]]
                parts.append(f'{n.get("name")} {len(inside)}')
        print(f'  {year} 年：{len(alive)} 条（{"，".join(parts)}）')
    missing_subtitles = sum(1 for u in units if u['id'] not in data['subtitles'])
    if missing_subtitles:
        notes.append(f'{missing_subtitles} 条没有条旨（可以留空，由使用者自己写）')
    report(problems, notes)


def report(problems, notes):
    for note in notes:
        print('提示：' + note)
    if problems:
        for problem in problems[:60]:
            print('错误：' + problem)
        if len(problems) > 60:
            print(f'……另有 {len(problems) - 60} 处')
        sys.exit(1)
    print('检查通过。')
    sys.exit(0)


if __name__ == '__main__':
    main()
