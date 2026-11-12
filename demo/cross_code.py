"""Links between codes: each code keeps its own notebook, and a note may point to an article of another code
(a 跨法典关联 record: details.code and details.article). The service of one code reads the text and the
notebooks of the others from the project folder, read-only, to show that article and to list the records
of other codes that point here."""
import json
from agent_bridge import describe, find_unit
from edition import EDITION_FILE, CODEX_NAME, effective, load_codex, pack_names
from local_service import ServiceError


class Book:
    def __init__(self, project, name):
        self.name, self.codex = name, load_codex(name)
        history = json.loads((project / 'demo/codes' / name / self.codex['files']['history']).read_text(encoding='utf-8'))
        self.units, self.years, self.amendments = history['units'], tuple(history['years']), history['amendments']


def names(codex):
    laws = [n['law'] for n in codex.get('structure', []) if n.get('law')]
    return {x for x in [codex['name'], codex['short'], *codex.get('citation', {}).get('aliases', []),
                        *(y for law in laws for y in (law['name'], law['short'], *law.get('aliases', [])))] if x}


def matches(codex, text):
    q = str(text or '').replace('《', '').replace('》', '').strip()
    return bool(q) and any(q == n or q in n or n in q for n in names(codex))


def book(service, name):
    if name == CODEX_NAME:
        return service
    cache = service.__dict__.setdefault('other_books', {})
    if name not in cache:
        cache[name] = Book(service.project, name)
    return cache[name]


def notebook(service, name):
    """The saved notes of another code, or {} when it has none."""
    if hasattr(service, 'other_home'):
        home = service.other_home(name)
    else:
        home = service.project / effective(EDITION_FILE, name, load_codex(name))['dataDirectory']
    try:
        return json.loads((home / 'notebook.json').read_text(encoding='utf-8')).get('state') or {}
    except (OSError, ValueError):
        return {}


def locate(target, code, article):
    year = target.years[-1]
    units = [u for u in target.units if u['versions'][str(year)]['exists']]
    return find_unit(target, {'ref': str(code or '') + str(article or '')}, units, year), year


def text(service, body):
    name = next((n for n in pack_names() if body.get('code') in (n, load_codex(n)['id']) or matches(load_codex(n), body.get('code'))), None)
    if not name:
        raise ServiceError('法典笔记中没有装这部法典，只能记录名称和条号。', 404)
    target = book(service, name)
    if body.get('unitId'):  # a record of another code names its own article by id
        year = target.years[-1]
        unit = next((u for u in target.units if u['id'] == body['unitId'] and u['versions'][str(year)]['exists']), None)
        if not unit:
            raise ServiceError('那部法典的现行文本中没有这一条。', 404)
    else:
        unit, year = locate(target, body.get('code'), body.get('ref'))
    state = service.snapshot.get('state') or {} if name == CODEX_NAME else notebook(service, name)
    notes = [{'question': n.get('question', ''), 'text': n.get('text', '')} for n in state.get('notes', []) if n.get('unitId') == unit['id']]
    return {**describe(target, unit, year), 'code': target.codex['short'], 'codeId': target.codex['id'], 'here': name == CODEX_NAME,
            'paragraphs': unit['versions'][str(year)]['paragraphs'], 'notes': notes[:20], 'name': name, 'version': unit['versions'][str(year)]['label']}


def units(service, body):
    """The articles of another code, for choosing one in the link dialog of 法条精读."""
    name = next((n for n in pack_names() if body.get('code') in (n, load_codex(n)['id'])), None)
    if not name:
        raise ServiceError('法典笔记中没有装这部法典。', 404)
    target = book(service, name)
    year = target.years[-1]
    subtitles = {}
    codex = target.codex
    path = service.project / 'demo/codes' / name / codex['files']['subtitles']
    try:
        subtitles = json.loads(path.read_text(encoding='utf-8'))
    except (OSError, ValueError):
        pass
    order = {u['id']: i for i, u in enumerate(target.units)}
    laws = [n for n in codex.get('structure', []) if n.get('law')]
    law = lambda uid: next((n['law']['short'] for n in laws if order[n['from']] <= order[uid] <= order[n['to']]), '') if len(laws) > 1 else ''
    return {'code': codex['short'], 'codeId': codex['id'], 'name': name, 'year': year,
            'units': [{'id': u['id'], 'label': u['versions'][str(year)]['label'], 'law': law(u['id']),
                       'gist': (subtitles.get(u['id']) or '') if isinstance(subtitles.get(u['id']), str) else ''}
                      for u in target.units if u['versions'][str(year)]['exists']]}


def back(service):
    """Records in the notebooks of other codes that point to an article of this code."""
    records = []
    for name in pack_names():
        if name == CODEX_NAME:
            continue
        other, state = None, notebook(service, name)
        for r in state.get('materialRelations', []):
            details = r.get('details') or {}
            if r.get('category') != 'crosscode' or not matches(service.codex, details.get('code')):
                continue
            try:
                unit_id = locate(service, details.get('code'), details.get('article'))[0]['id']
            except ServiceError:
                unit_id = None
            other = other or book(service, name)
            scope = r.get('scope') or {}
            year = scope.get('year') if scope.get('year') in other.years else other.years[-1]
            sources = [describe(other, u, year) for u in other.units if u['id'] in scope.get('unitIds', []) and u['versions'][str(year)]['exists']]
            records.append({'code': other.codex['short'], 'codeName': name, 'unitId': unit_id, 'article': details.get('article', ''), 'quote': details.get('quote', ''),
                            'from': [{'label': s['label'], 'unitId': s['unitId']} for s in sources],
                            'text': r.get('text', ''), 'question': r.get('question', ''), 'updatedAt': r.get('updatedAt')})
    return {'records': records}


def handle(service, body):
    if body.get('action') == 'text':
        return text(service, body)
    if body.get('action') == 'back':
        return back(service)
    if body.get('action') == 'units':
        return units(service, body)
    raise ServiceError('可用操作：text、back。')
