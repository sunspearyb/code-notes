"""Edition settings live outside the shared application code.

edition.json describes the edition (debug or pure). The code being read is a data pack in codes/:
the one named in data/content.json ("codex") by default, or the one in the FADIAN_CODEX environment
variable (set by `launch.py --codex <name>`). Each code other than the constitution gets its own
browser record, service port, data folder and export file names, derived here, so notes of
different codes never mix and the constitution's records keep their original names.
"""
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent
EDITION_FILE = json.loads((ROOT / 'edition.json').read_text(encoding='utf-8'))
CONTENT_CODEX = json.loads((ROOT / 'data/content.json').read_text(encoding='utf-8')).get('codex', 'constitution')


def pack_names():
    """The default pack first, then the others in codes/; folders starting with _ are drafts."""
    others = sorted(p.name for p in (ROOT / 'codes').iterdir()
                    if (p / 'codex.json').exists() and not p.name.startswith('_') and p.name != CONTENT_CODEX)
    return [CONTENT_CODEX, *others]


def load_codex(name):
    return json.loads((ROOT / 'codes' / name / 'codex.json').read_text(encoding='utf-8'))


def page_name(name):
    return '法典笔记.html' if name == CONTENT_CODEX else f'法典笔记-{name}.html'


def effective(edition, codex_name, codex):
    result = dict(edition)
    result.setdefault('exportName', '法典笔记数据')
    result.setdefault('markdownName', '法典笔记')
    if codex.get('id') == 'cn-constitution':
        return result
    short = codex.get('short') or codex_name
    result.update({
        'title': f"{edition['title'].split(' · ')[0]} · {short}",
        'storageKey': f"{edition['storageKey']}:{codex['id']}",
        'legacyStorageKey': None,
        'serviceMarker': f"{edition['serviceMarker']}-{codex_name}",
        'port': edition['port'] + int(codex.get('portOffset', 0)),
        'dataDirectory': f"{edition['dataDirectory']}-{codex_name}",
        'exportName': f'法典笔记数据-{short}',
        'markdownName': f'法典笔记-{short}',
    })
    return result


CODEX_NAME = os.environ.get('FADIAN_CODEX') or CONTENT_CODEX
CODEX = load_codex(CODEX_NAME)
EDITION = effective(EDITION_FILE, CODEX_NAME, CODEX)
