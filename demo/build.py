"""Build a self-contained, offline demo. Python standard library only."""
from pathlib import Path
import base64
import json
from html import escape
import os
from edition import EDITION_FILE, CONTENT_CODEX, effective, load_codex, pack_names, page_name
from help_page import render_help

root = Path(__file__).resolve().parent
# marks.js, focus.js and settings.js come right after app.js: the first render (learning.js) may already
# need them, for instance when the app reopens on 设置.
SCRIPTS = ['model.js', 'notebook.js', 'learning-model.js', 'app.js', 'marks.js', 'focus.js', 'settings.js', 'local-files.js', 'workspace.js',
           'learning.js', 'relations.js', 'readings.js', 'statutes.js', 'smart.js', 'storage.js', 'analysis.js']


def load_data(name):
    """The page data: this edition's starting notes plus one code's data pack (codes/<name>/codex.json).
    The starting notes belong to the default pack; other packs start empty."""
    data = json.loads((root / 'data/content.json').read_text(encoding='utf-8'))
    if name != CONTENT_CODEX:
        data['seedNotes'], data['importedNotes'] = [], []
    data['codex'] = load_codex(name)
    for key, file in data['codex']['files'].items():
        data[key] = json.loads((root / 'codes' / name / file).read_text(encoding='utf-8'))
    # Analysis frameworks (e.g. 法权分析) are shared by every code; frameworks/<id>.json.
    data['frameworks'] = {path.stem: json.loads(path.read_text(encoding='utf-8')) for path in sorted((root / 'frameworks').glob('*.json'))}
    # Every code in this folder, so that one code's page can open an article of another.
    data['codes'] = [{'name': other, 'id': (c := load_codex(other))['id'], 'short': c.get('short', other), 'fullName': c['name'],
                      'page': page_name(other), 'webFolder': '' if other == CONTENT_CODEX else c.get('webFolder', other),
                      'aliases': c.get('citation', {}).get('aliases', [])} for other in pack_names()]
    return data


def check_font(names):
    """Characters of a data pack missing from the font subset show in the system serif (a heavier 宋体)."""
    covered = root / 'src/fonts.chars'
    if not covered.exists():
        return
    have = set(covered.read_text(encoding='utf-8'))
    need = {c for name in names for path in (root / 'codes' / name).glob('*.json')
            for c in path.read_text(encoding='utf-8') if '\u3400' <= c <= '\u9fff'}
    missing = sorted(need - have)
    if missing:
        print(f'注意：字体子集缺少 {len(missing)} 个字（如 {"".join(missing[:12])}），这些字会显示为系统宋体。'
              '请运行 build_font.py 重新生成 src/fonts.css。')


def build_page(name):
    data = load_data(name)
    data['edition'] = effective(EDITION_FILE, name, data['codex'])
    if data['codex']['id'] == 'cn-constitution':
        assert len(data['history']['units']) == 156
        assert data['history']['validation']['replayed2018MatchesSuppliedFullText']
    page = (root / 'src/template.html.in').read_text(encoding='utf-8')
    page = page.replace('__EDITION_TITLE__', escape(data['edition']['title']))
    # src/icon.png comes from 维护工具/应用图标/制作图标.py: the browser-tab icon and the sidebar mark.
    icon = root / 'src/icon.png'
    icon_url = 'data:image/png;base64,' + base64.b64encode(icon.read_bytes()).decode() if icon.exists() else ''
    page = page.replace('</title>', '</title>\n  <link rel="icon" href="' + icon_url + '">' if icon_url else '</title>', 1)
    data['icon'] = icon_url
    # src/fonts.css is produced by build_font.py; without it the page uses the system serif.
    styles = [root / 'src' / file for file in ['fonts.css', 'styles.css', 'learning.css']]
    page = page.replace('/*__STYLES__*/', '\n'.join(path.read_text(encoding='utf-8') for path in styles if path.exists()))
    page = page.replace('/*__DATA__*/', json.dumps(data, ensure_ascii=False).replace('<', '\\u003c'))
    page = page.replace('/*__SCRIPT__*/', '\n'.join((root / 'src' / file).read_text(encoding='utf-8') for file in SCRIPTS))
    target = root / page_name(name)
    target.write_text(page, encoding='utf-8')
    print(f'Built {target.name} ({target.stat().st_size:,} bytes)')
    

# Every data pack gets its own page (法典笔记.html for the default, 法典笔记-<名称>.html for the others);
# FADIAN_CODEX=<名称> builds only that one.
names = [os.environ['FADIAN_CODEX']] if os.environ.get('FADIAN_CODEX') else pack_names()
check_font(names)
for name in names:
    build_page(name)
(root / '本地助手接入.html').write_text(render_help((root / '本地助手接入.md').read_text(encoding='utf-8')), encoding='utf-8')
def entry(path, target):
    path.write_text(f'''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="0;url={target}"><title>打开法典笔记</title><style>body{{max-width:640px;margin:80px auto;padding:24px;background:#faf8f0;color:#8b3652;font:18px/1.8 sans-serif}}a{{color:inherit}}</style><h1>法典笔记</h1><p><a href="{target}">点击进入个人法典笔记</a></p><p>如内置浏览器不支持直接打开本地文件，请双击 demo 文件夹中的「打开演示.command」，通过本机网址进入。</p></html>''', encoding='utf-8')
entry(root / 'index.html', './法典笔记.html')
entry(root / 'src/index.html', '../法典笔记.html')
entry(root / 'src/template.html', '../法典笔记.html')
entry(root.parent / 'index.html', './demo/法典笔记.html')
