#!/usr/bin/env python3
"""Put modules together into a code: python3 demo/compose.py [<法典名称> …]

A module is one document (a law, a policy, any text cut into articles) in demo/modules/<名称>/:
module.json (its name, citation and table of contents), versions.json (its text in the years it
was adopted or amended) and subtitles.json. A code in demo/codes/<名称>/ that lists modules in its
codex.json is put together from them:

    "modules": ["cybersecurity", "data-security", "personal-information"]

An existing code can be used as a module as well; its article ids get a prefix so that two codes
can sit in one book:

    "modules": [{"code": "constitution", "prefix": "xf"}, {"code": "civil-code", "prefix": "mf"}, "cybersecurity"]

This script writes the code's versions.json and subtitles.json, the `levels`, `structure`, `yearLabels`
and `accepts` entries of its codex.json, and a guide.json when the code has none. Everything else in
codex.json (name, welcome, features, relationCategories…) is written by hand and left alone.
To split or regroup a code, change the list and run this again (build.py does it before building).

Years: the code's years are those of all its modules. In a year before a module was adopted its
articles do not exist; in a year in which it did not change they repeat its latest text.
Python standard library only.
"""
import copy
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent
CODES, MODULES = ROOT / 'codes', ROOT / 'modules'
LAUNCHERS = ROOT.parent  # where 打开…笔记.command files go
ABSENT = {'exists': False, 'label': '', 'paragraphs': [], 'amendments': [], 'sourceRefs': [], 'diff': [], 'changed': False}


def read(path):
    return json.loads(path.read_text(encoding='utf-8'))


def write(path, data):
    text = json.dumps(data, ensure_ascii=False, indent=2) + '\n'
    if not path.exists() or path.read_text(encoding='utf-8') != text:
        path.write_text(text, encoding='utf-8')
        return True
    return False


def walk(nodes):
    for node in nodes:
        yield node
        yield from walk(node.get('children', []))


def load_module(spec):
    """One module, in a common shape: laws (top nodes of the table of contents), levels, history,
    subtitles, guide, and which backups (book ids) use the same article ids."""
    if isinstance(spec, str):
        folder = MODULES / spec
        if not (folder / 'module.json').exists():
            raise SystemExit(f'找不到模块 {spec}：demo/modules/{spec}/module.json 不存在。')
        meta = read(folder / 'module.json')
        node = {'id': meta['id'], 'level': 'law', 'name': meta['name'], 'law': meta['law'], 'children': meta.get('structure', [])}
        module = {'name': spec, 'laws': [node], 'levels': meta.get('levels', {}), 'history': read(folder / 'versions.json'),
                  'subtitles': read(folder / 'subtitles.json') if (folder / 'subtitles.json').exists() else {},
                  'guide': None, 'books': meta.get('books', []), 'prefix': ''}
        first, last = module['history']['units'][0]['id'], module['history']['units'][-1]['id']
        node['from'], node['to'] = first, last
        order = ['id', 'level', 'name', 'from', 'to', 'law', 'children']
        module['laws'] = [{k: node[k] for k in order}]
        return module
    name, prefix = spec['code'], spec.get('prefix', '')
    folder = CODES / name
    codex = read(folder / 'codex.json')
    history = read(folder / codex['files']['history'])
    structure = copy.deepcopy(codex['structure'])
    if all(node.get('law') for node in structure):  # a code already made of several laws
        laws = structure
    else:
        citation = codex['citation']
        laws = [{'id': name, 'level': 'law', 'name': codex['short'], 'from': history['units'][0]['id'], 'to': history['units'][-1]['id'],
                 'law': {'name': codex['name'], 'short': codex['short'], 'aliases': [a for a in citation.get('aliases', []) if a != codex['name']],
                         'citation': citation}, 'children': structure}]
    module = {'name': name, 'laws': laws, 'levels': copy.deepcopy(codex['levels']), 'history': history,
              'subtitles': read(folder / codex['files']['subtitles']), 'books': [codex['id']], 'prefix': prefix,
              'guide': read(folder / codex['files']['guide']) if 'guide' in codex['files'] else None}
    if prefix:
        rename(module, prefix)
    return module


def rename(module, prefix):
    """Article ids get the prefix (a33 → xfa33), nodes of the table of contents prefix- (rights → xf-rights)."""
    nodes = {node['id']: prefix + '-' + node['id'] for node in walk(module['laws'])}
    for node in walk(module['laws']):
        node['id'] = nodes[node['id']]
        node['from'], node['to'] = prefix + node['from'], prefix + node['to']
    for unit in module['history']['units']:
        unit['id'] = prefix + unit['id']
        if 'mergedInto' in unit:
            unit['mergedInto'] = prefix + unit['mergedInto']
        if 'chapter' in unit:
            unit['chapter'] = nodes.get(unit['chapter'], unit['chapter'])
    module['subtitles'] = {prefix + key: value for key, value in module['subtitles'].items()}
    if module['guide']:
        for step in module['guide'].get('steps', []):
            if step.get('unitId'):
                step['unitId'] = prefix + step['unitId']


def join(target, extra):
    """Validation records of several modules: tables join, yes/no values must all hold, counts add up."""
    for key, value in extra.items():
        if key not in target:
            target[key] = copy.deepcopy(value)
        elif isinstance(value, dict) and isinstance(target[key], dict):
            join(target[key], value)
        elif isinstance(value, bool) and isinstance(target[key], bool):
            target[key] = target[key] and value
        elif isinstance(value, (int, float)) and isinstance(target[key], (int, float)) and not isinstance(target[key], bool):
            target[key] += value
    return target


def dense(unit, own, years):
    """The unit's text in every year of the code."""
    versions, latest = {}, None
    for year in years:
        if year in own:
            latest = unit['versions'][str(year)]
            versions[str(year)] = latest
        elif latest is None:
            versions[str(year)] = dict(ABSENT)
        elif not latest['exists']:
            versions[str(year)] = copy.deepcopy(latest)
        else:
            versions[str(year)] = {**copy.deepcopy(latest), 'amendments': [], 'changed': False,
                                   'diff': [{'type': 'equal', 'text': '\n'.join(latest['paragraphs'])}]}
    return {**unit, 'versions': versions}


def compose(name):
    folder = CODES / name
    codex = read(folder / 'codex.json')
    if not codex.get('modules'):
        return False
    modules = [load_module(spec) for spec in codex['modules']]
    years = sorted({year for m in modules for year in m['history']['years']})
    history = {'years': years, 'sources': [], 'units': [], 'amendments': []}
    levels, structure, subtitles, validation, accepts, seen, later, labels = {'law': {'name': '', 'numbered': False}}, [], {}, {}, {}, set(), [], {}
    for m in modules:
        h = m['history']
        # Levels of the table of contents: a level that another module defines differently gets its own name.
        renamed = {}
        for key, level in m['levels'].items():
            if key in levels and levels[key] != level:
                renamed[key] = f"{m['prefix'] or m['name']}-{key}"
        for key, level in m['levels'].items():
            level = dict(level)
            if level.get('numberWithin') in renamed:
                level['numberWithin'] = renamed[level['numberWithin']]
            levels.setdefault(renamed.get(key, key), level)
        for node in walk(m['laws']):
            node['level'] = renamed.get(node['level'], node['level'])
        structure += m['laws']
        for unit in h['units']:
            if unit['id'] in seen:
                raise SystemExit(f"条文标识 {unit['id']} 在两个模块中重复（{m['name']}）。请给其中一个模块加 prefix。")
            seen.add(unit['id'])
            history['units'].append(dense(unit, set(h['years']), years))
        history['sources'] += h.get('sources', [])
        later += h.get('amendmentSources', [])
        history['amendments'] += h.get('amendments', [])
        history.setdefault('revisionDocs', []).extend(h.get('revisionDocs', []))
        if 'amendmentDecision' in h:
            history.setdefault('amendmentDecision', h['amendmentDecision'])
        join(validation, h.get('validation', {}))
        subtitles.update(m['subtitles'])
        for book in m['books']:
            accepts[book] = m['prefix']
        for year in h['years']:
            labels.setdefault(year, []).extend(law['law']['short'] for law in m['laws'])
    history['sources'] += later
    history = {key: history[key] for key in ('years', 'sources', 'units', 'amendments', 'amendmentDecision', 'revisionDocs') if key in history and (key != 'revisionDocs' or history[key])}
    history['validation'] = validation
    changed = write(folder / codex['files']['history'], history)
    changed |= write(folder / codex['files']['subtitles'], subtitles)
    guide = folder / codex['files'].get('guide', 'guide.json')
    if not guide.exists():
        source = next((m['guide'] for m in modules if m['guide']), None)
        if not source:  # the general guide, without examples
            base = CODES / 'civil-code' / 'guide.json'
            source = read(base) if base.exists() else {'title': '使用说明', 'intro': '', 'steps': [], 'tips': {}, 'own': {}}
            for step in source.get('steps', []):
                step['example'], step['unitId'] = '', history['units'][0]['id']
        changed |= write(guide, source)
    updated = dict(codex)
    updated['levels'], updated['structure'] = levels, structure
    accepts.pop(codex['id'], None)
    if accepts:
        updated['accepts'] = accepts
    if 'yearLabels' not in codex or codex.get('yearLabelsComposed'):
        if len(modules) > 1:
            updated['yearLabels'] = {str(year): f"{year} 年（{'、'.join(labels[year])}）" for year in years}
            updated['yearLabelsComposed'] = True
    changed |= write(folder / 'codex.json', updated)
    print(f"{name}：{len(modules)} 个模块，{len(history['units'])} 条，年份 {years[0]}—{years[-1]}" + ('' if changed else '（没有变化）'))
    return True


def new_code(ident, name, short, modules):
    """A new code made of the given modules: its own page, notebook, port and launcher."""
    folder = CODES / ident
    if folder.exists():
        raise SystemExit(f'法典 {ident} 已经存在（{folder}）。')
    offsets = [int(read(p).get('portOffset', 0)) for p in CODES.glob('*/codex.json')]
    quoted = f'《{name}》'
    related = CODES / 'cyber-law' / 'codex.json'
    folder.mkdir(parents=True)
    write(folder / 'codex.json', {
        'about': f'{name}，由模块拼装（见 codex.json 的 modules）。', 'id': f'user-{ident}', 'name': name, 'short': short, 'whole': short, 'amendment': '修正',
        'portOffset': max(offsets, default=0) + 1, 'webFolder': ident,
        'citation': {'latest': quoted, 'original': quoted + '（{year} 年）', 'amended': quoted + '（{year} 年修正）',
                     'aliases': list(dict.fromkeys([name, short])), 'note': '引用时注明文件全称、条款；引用以往文本时注明版本年份。'},
        'files': {'history': 'versions.json', 'subtitles': 'subtitles.json', 'guide': 'guide.json'}, 'modules': modules,
        'levels': {}, 'structure': [], 'welcome': {'body': '', 'start': '', 'startLabel': ''},
        'searchQuery': name, 'features': {}, 'relationCategories': read(related).get('relationCategories', {}) if related.exists() else {}})
    try:
        compose(ident)
    except BaseException:
        import shutil
        shutil.rmtree(folder)
        raise
    codex, history = read(folder / 'codex.json'), read(folder / 'versions.json')
    year, ids = str(history['years'][-1]), [u['id'] for u in history['units']]
    here = [u for u in history['units'] if u['versions'][year]['exists']]
    first = next((u for u in here if u['kind'] == 'article'), here[0])
    law = next((n['law']['short'] for n in codex['structure'] if ids.index(n['from']) <= ids.index(first['id']) <= ids.index(n['to'])), '') if len(codex['structure']) > 1 else ''
    codex['welcome'] = {'body': f'阅读{short}，在条文下写笔记，记录条文之间、条文与材料之间的联系。', 'start': first['id'],
                        'startLabel': f"从{law}{first['versions'][year]['label']}读起"}
    if len(history['years']) > 1:
        codex['features'] = {'amendments': True}
    write(folder / 'codex.json', codex)
    launcher = LAUNCHERS / f'打开{short}笔记.command'
    launcher.write_text(f'#!/bin/zsh\napp_directory="${{0:A:h}}"\npython3 "$app_directory/demo/launch.py" --codex {ident} --open\n', encoding='utf-8')
    launcher.chmod(0o755)
    return codex


def main():
    names = sys.argv[1:] or sorted(p.name for p in CODES.iterdir() if (p / 'codex.json').exists())
    for name in names:
        if not compose(name) and sys.argv[1:]:
            print(f'{name}：codex.json 中没有 modules，不需要拼装。')


if __name__ == '__main__':
    main()
