#!/usr/bin/env python3
"""Make the PC&Mac 通用版, 网页版, 安卓版, Windows 版 and Mac 版 from one pure edition.

Every edition embeds the same page, 分发/法典笔记-纯净版-TAG/demo/法典笔记.html, so make
the pure edition first (维护工具/制作纯净版.py --tag TAG); in the public repository, where the
folder is itself the pure edition, pass --page demo/法典笔记.html. Only the PC&Mac 通用版 started
with its launcher connects to the local service; the others keep notes on the device and move
them as JSON backups.

  PC&Mac   分发/法典笔记-PC&Mac通用版-TAG.zip  the pure edition, unpacking to a folder named 法典笔记
  网页版   分发/法典笔记-网页版-TAG/      offline web app (PWA) for GitHub Pages; iPhone, iPad, Android
  安卓版   分发/法典笔记-安卓版-TAG.apk   package cn.fadian.notes, installs beside the self-test APK
  Windows  分发/法典笔记-Windows版-TAG-安装程序.exe and -免安装.exe (维护工具/windows-app)
  Mac      分发/法典笔记-Mac版-TAG.dmg     the same shell built for macOS (Apple chips and Intel)

The 网页版 is made per data pack (--codex), one site folder each. The 安卓版, Windows 版 and Mac 版 are one
app holding every data pack, switched inside the app; each pack keeps its notes under its own key.

Existing outputs are never overwritten. Signing keys stay in ~/.fadian, outside the project:
later APKs install over earlier ones only when signed with the same key.

The Windows build needs rustup with the x86_64-pc-windows-msvc target, cargo-xwin,
LLVM (brew install llvm) and NSIS (brew install makensis).
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import subprocess
import sys
import plistlib
import posixpath
from html import escape
import tempfile
import zipfile

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
android = __import__('制作安卓测试版')

PROJECT = Path(__file__).resolve().parent.parent
DIST = PROJECT / '分发'
ICONS = PROJECT / '维护工具' / '应用图标'
WINDOWS_APP = PROJECT / '维护工具' / 'windows-app'
CACHE = Path.home() / 'Library' / 'Caches' / 'fadian-windows'
RELEASE_KEY = Path.home() / '.fadian' / 'android-release.keystore'
RELEASE_PASS = Path.home() / '.fadian' / 'android-release.password'
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

HEAD = '''<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="@APP@">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
'''


class Pack:
    """One data pack as an app: the constitution keeps the plain names (法典笔记, cn.fadian.notes);
    other packs add their short name and their own web folder, Android package and Windows app id."""
    def __init__(self, source, name):
        demo = source / 'demo'
        content = json.loads((demo / 'data/content.json').read_text(encoding='utf-8'))
        self.default = name in (None, content.get('codex', 'constitution'))
        self.name = content.get('codex', 'constitution') if name is None else name
        codex = json.loads((demo / 'codes' / self.name / 'codex.json').read_text(encoding='utf-8'))
        self.short = codex.get('short', self.name)
        self.page = demo / ('法典笔记.html' if self.default else f'法典笔记-{self.name}.html')
        slug = re.sub(r'[^a-z0-9]', '', self.name.lower())
        self.app = '法典笔记' if self.default else f'法典笔记 · {self.short}'
        self.file = '法典笔记' if self.default else f'法典笔记-{self.short}'
        self.web = '' if self.default else codex.get('webFolder', self.name)
        self.android = 'cn.fadian.notes' if self.default else f'cn.fadian.notes.{slug}'
        self.windows = 'FadianNotes' if self.default else f'FadianNotes-{slug}'
        self.exe = '法典笔记' if self.default else f'法典笔记-{self.short}'
REGISTER = '''<script>if('serviceWorker' in navigator&&isSecureContext)addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));</script>
'''
SERVICE_WORKER = '''// 法典笔记网页版的离线缓存。打开过一次后，不联网也能使用；笔记本身存在浏览器中，不在这里。
const PREFIX='fadian-@PACK@-',CACHE=PREFIX+'@TAG@';  // caches are shared by every folder of the site
const FILES=['./','index.html','manifest.webmanifest','icon-192.png','icon-512.png','apple-touch-icon.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(PREFIX)&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
// The page tries the network first so that updates arrive, but falls back to the cached copy
// after 6 seconds or when offline; other files come from the cache.
// Only this folder's own files are handled: other packs live in sub-folders of the same site and
// have their own service worker.
const OWN=new Set(FILES.map(f=>new URL(f,self.registration.scope).href));
self.addEventListener('fetch',e=>{
  const r=e.request,url=new URL(r.url);url.search='';url.hash='';
  if(r.method!=='GET'||!OWN.has(url.href))return;
  if(r.mode!=='navigate'){e.respondWith(caches.match(r,{ignoreSearch:true}).then(hit=>hit||fetch(r)));return;}
  const net=fetch(r).then(res=>{if(res.ok){const copy=res.clone();caches.open(CACHE).then(c=>c.put('index.html',copy));}return res;});
  const late=new Promise(ok=>setTimeout(ok,6000)).then(()=>caches.match('index.html'));
  e.respondWith(Promise.race([net.catch(()=>caches.match('index.html')),late.then(hit=>hit||net)]));
});
'''


def checksum(path):
    path.with_name(path.name + '.sha256').write_text(
        hashlib.sha256(path.read_bytes()).hexdigest() + '  ' + path.name + '\n', encoding='utf-8')


def make_pc(page, tag, pack=None):
    """The pure edition folder as one ZIP. It unpacks to 法典笔记/, a name that stays the same
    across versions, so the folder can live in a cloud drive and be replaced on upgrade."""
    source = page.parent.parent
    target = DIST / f'法典笔记-PC&Mac通用版-{tag}.zip'
    with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED) as z:
        for path in sorted(source.rglob('*')):
            relative = path.relative_to(source)
            if path.is_file() and not any(part.startswith('.fadian') for part in relative.parts) and path.name not in ('法典笔记数据.json', '法典笔记.md'):
                info = zipfile.ZipInfo.from_file(path, Path('法典笔记') / relative)
                info.compress_type = zipfile.ZIP_DEFLATED
                z.writestr(info, path.read_bytes())
    checksum(target)
    return [target]


def make_web(page, tag, pack, out=None, layout=None):
    """For GitHub Pages the constitution sits at the site root and other packs in their own folder
    (e.g. /civil-code/): each folder is a separate installable app with its own offline cache."""
    standalone = out is None
    html = page.read_text(encoding='utf-8')
    data = json.loads(re.search(r'<script id="content-data" type="application/json">(.*?)</script>', html, re.S)[1])
    codes = data['codes']
    site_root = out or DIST / f'{pack.file}-网页版-{tag}'
    # A downloaded ZIP must include every destination offered by its code menu.
    # Keep the selected code at its root; hosted Pages retains the existing URLs.
    if standalone:
        layout = {c['name']: '' if c['name'] == pack.name else c['webFolder'] or c['name'] for c in codes}
    folders = layout or {c['name']: c['webFolder'] for c in codes}
    own_folder = folders[pack.name]
    out = site_root / own_folder if own_folder else site_root
    routes = {c['id']: posixpath.relpath(folders[c['name']] or '.', own_folder or '.') + '/index.html' for c in codes}
    out.mkdir(parents=True, exist_ok=True)
    assert html.count('</head>') == 1 and html.count('</body>') == 1
    html = re.sub(r'<title>[^<]*</title>', f'<title>{pack.app}</title>', html, count=1)
    route_meta = '<meta name="fadian-web-routes" content="' + escape(json.dumps(routes, ensure_ascii=False), quote=True) + '">\n'
    html = html.replace('</head>', route_meta + HEAD.replace('@APP@', pack.app) + '</head>').replace('</body>', REGISTER + '</body>')
    (out / 'index.html').write_text(html, encoding='utf-8')
    (out / 'sw.js').write_text(SERVICE_WORKER.replace('@PACK@', pack.name).replace('@TAG@', tag), encoding='utf-8')
    (out / 'manifest.webmanifest').write_text(json.dumps({
        'name': pack.app, 'short_name': pack.short if not pack.default else '法典笔记', 'id': './', 'lang': 'zh-CN', 'start_url': './', 'scope': './',
        'display': 'standalone', 'background_color': '#faf8f0', 'theme_color': '#faf8f0',
        'icons': [{'src': 'icon-192.png', 'sizes': '192x192', 'type': 'image/png'},
                  {'src': 'icon-512.png', 'sizes': '512x512', 'type': 'image/png'}],
    }, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    shutil.copy(ICONS / 'web-192.png', out / 'icon-192.png')
    shutil.copy(ICONS / 'web-512.png', out / 'icon-512.png')
    shutil.copy(ICONS / 'apple-touch-180.png', out / 'apple-touch-icon.png')
    (out / '.nojekyll').write_text('', encoding='utf-8')  # GitHub Pages: publish the files as they are
    if not standalone:
        return [out]
    for code in codes:
        if code['name'] != pack.name:
            other = Pack(page.parent.parent, code['name'])
            make_web(other.page, tag, other, site_root, folders)
    archive = out.with_suffix('.zip')
    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as z:
        for path in sorted(out.rglob('*')):
            z.write(path, Path(out.name) / path.relative_to(out))
    checksum(archive)
    return [out, archive]


def all_pages(page):
    """Every data pack's page beside the given one, the default (法典笔记.html) first."""
    pages = sorted(page.parent.glob('法典笔记*.html'), key=lambda p: (p.name != '法典笔记.html', p.name))
    for p in pages:
        text = p.read_text(encoding='utf-8')
        if 'fadian-notes-clean-v1' not in text or 'fadian-notes-demo-' in text:
            sys.exit(f'{p.name} 不是纯净版页面，停止制作。')
    return pages


def make_android(page, tag, pack):
    # The released APK must keep its signing key: a new key would stop students from installing over
    # the old app (and uninstalling erases their notes). Never create one here.
    if not RELEASE_KEY.exists() or not RELEASE_PASS.exists():
        sys.exit(f'找不到安卓发布签名（{RELEASE_KEY.parent}）。请从备份中恢复 android-release.keystore 和 android-release.password，不要新建。')
    target = android.build(all_pages(page), DIST / f'{pack.file}-安卓版-{tag}.apk', package=pack.android, label='法典笔记',
                           keystore=RELEASE_KEY, alias='fadian', password=RELEASE_PASS.read_text(encoding='utf-8').strip(),
                           icons=ICONS, version_name=tag)
    checksum(target)
    return [target]


def make_windows(page, tag, pack):
    numbers = re.match(r'(\d{4})(\d{4})(?:-r(\d+))?', tag)
    version = f'{numbers[1]}.{int(numbers[2])}.{numbers[3] or 0}.0' if numbers else '1.0.0.0'
    pages = CACHE / 'pages'
    shutil.rmtree(pages, ignore_errors=True)
    pages.mkdir(parents=True)
    for p in all_pages(page):
        shutil.copy(p, pages / p.name)
    env = {**os.environ, 'FADIAN_PAGES': str(pages), 'FADIAN_TITLE': pack.app, 'CARGO_TARGET_DIR': str(CACHE / 'target'),
           'XWIN_CACHE_DIR': str(CACHE / 'xwin'), 'LC_ALL': 'en_US.UTF-8',
           # Keep the builder's home folder (user name) out of the panic messages compiled into the exe.
           'RUSTFLAGS': f'-C target-feature=+crt-static --remap-path-prefix={Path.home()}=~',
           'PATH': f'{Path.home()}/.cargo/bin:/opt/homebrew/opt/llvm/bin:' + os.environ['PATH']}
    android.run('cargo', 'xwin', 'build', '--release', '--target', 'x86_64-pc-windows-msvc', cwd=WINDOWS_APP, env=env)
    exe = CACHE / 'target' / 'x86_64-pc-windows-msvc' / 'release' / 'fadian-notes.exe'
    portable = DIST / f'{pack.file}-Windows版-{tag}-免安装.exe'
    setup = DIST / f'{pack.file}-Windows版-{tag}-安装程序.exe'
    shutil.copy(exe, portable)
    # makensis reads the UTF-8 script only under a UTF-8 locale (LC_ALL above).
    android.run('makensis', '-INPUTCHARSET', 'UTF8', '-V2', f'-DEXE={exe}', f'-DOUTFILE={setup}',
                f'-DVERSION={version}', f'-DTAG={tag}', f'-DAPPNAME={pack.exe}', f'-DAPPID={pack.windows}',
                'installer.nsi', cwd=WINDOWS_APP, env=env)
    if str(Path.home()).encode() in portable.read_bytes():
        sys.exit('Windows 程序中含有本机路径，停止制作。')
    for path in (portable, setup):
        checksum(path)
    return [setup, portable]


def rounded_icon(work):
    """macOS icons are a rounded square inset in the canvas; round master-square-1024.png in Chrome."""
    html = work / 'icon.html'
    html.write_text(f'''<!doctype html><style>html,body{{margin:0;background:transparent}}
img{{position:absolute;left:100px;top:100px;width:824px;height:824px;border-radius:185px;box-shadow:0 10px 24px rgb(0 0 0/.22)}}</style>
<img src="{(ICONS / 'master-square-1024.png').as_uri()}">''', encoding='utf-8')
    target = work / 'icon-1024.png'
    android.run(CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars', f'--user-data-dir={work / "profile"}',
        '--default-background-color=00000000', '--window-size=1024,1024', '--allow-file-access-from-files',
        f'--screenshot={target}', html.as_uri(), capture_output=True)
    iconset = work / 'AppIcon.iconset'
    iconset.mkdir()
    for size in (16, 32, 128, 256, 512):
        for scale in (1, 2):
            name = f'icon_{size}x{size}{"@2x" if scale == 2 else ""}.png'
            android.run('sips', '-z', str(size * scale), str(size * scale), str(target), '--out', str(iconset / name), capture_output=True)
    android.run('iconutil', '-c', 'icns', str(iconset), '-o', str(work / 'AppIcon.icns'))
    return work / 'AppIcon.icns'


def make_mac(page, tag, pack):
    """The Windows shell built for macOS, as 法典笔记.app in a .dmg. Without an Apple developer
    certificate the app is signed ad hoc, so the first opening is allowed once in 系统设置."""
    mac_cache = Path.home() / 'Library' / 'Caches' / 'fadian-mac'
    pages = mac_cache / 'pages'
    shutil.rmtree(pages, ignore_errors=True)
    pages.mkdir(parents=True)
    for p in all_pages(page):
        shutil.copy(p, pages / p.name)
    env = {**os.environ, 'FADIAN_PAGES': str(pages), 'CARGO_TARGET_DIR': str(mac_cache / 'target'),
           'RUSTFLAGS': f'--remap-path-prefix={Path.home()}=~', 'PATH': f'{Path.home()}/.cargo/bin:' + os.environ['PATH']}
    binaries = []
    for target in ('aarch64-apple-darwin', 'x86_64-apple-darwin'):
        android.run('rustup', 'target', 'add', target, env=env, capture_output=True)
        android.run('cargo', 'build', '--release', '--target', target, cwd=WINDOWS_APP, env=env)
        binaries.append(mac_cache / 'target' / target / 'release' / 'fadian-notes')
    dmg = DIST / f'{pack.file}-Mac版-{tag}.dmg'
    numbers = re.match(r'(\d{4})(\d{4})(?:-r(\d+))?', tag)
    version = f'{numbers[1]}.{int(numbers[2])}.{numbers[3] or 0}' if numbers else '1.0.0'
    with tempfile.TemporaryDirectory() as tmp:
        work = Path(tmp)
        app = work / 'dmg' / '法典笔记.app'
        (app / 'Contents/MacOS').mkdir(parents=True)
        (app / 'Contents/Resources').mkdir()
        android.run('lipo', '-create', *binaries, '-output', app / 'Contents/MacOS/fadian-notes')
        shutil.copy(rounded_icon(work), app / 'Contents/Resources/AppIcon.icns')
        with open(app / 'Contents/Info.plist', 'wb') as f:
            plistlib.dump({'CFBundleName': '法典笔记', 'CFBundleDisplayName': '法典笔记', 'CFBundleIdentifier': 'cn.fadian.notes',
                           'CFBundleExecutable': 'fadian-notes', 'CFBundleIconFile': 'AppIcon', 'CFBundlePackageType': 'APPL',
                           'CFBundleShortVersionString': version, 'CFBundleVersion': version, 'LSMinimumSystemVersion': '11.0',
                           'NSHighResolutionCapable': True, 'LSApplicationCategoryType': 'public.app-category.education'}, f)
        android.run('codesign', '--force', '--deep', '--sign', '-', app)
        os.symlink('/Applications', work / 'dmg' / '应用程序')
        android.run('hdiutil', 'create', '-volname', '法典笔记', '-srcfolder', work / 'dmg', '-ov', '-format', 'UDZO', dmg, capture_output=True)
    if str(Path.home()).encode() in (binaries[0]).read_bytes():
        sys.exit('Mac 程序中含有本机路径，停止制作。')
    checksum(dmg)
    return [dmg]


def main():
    parser = argparse.ArgumentParser(description='从纯净版制作网页版、安卓版和 Windows 版')
    parser.add_argument('--tag', required=True, help='纯净版的版本号，例如 20261017-r3')
    parser.add_argument('--only', default='pc,web,android,windows,mac', help='只制作其中几种，用逗号分隔：pc,web,android,windows,mac')
    parser.add_argument('--page', type=Path, help='纯净版页面；默认是 分发/法典笔记-纯净版-TAG/demo/法典笔记.html')
    parser.add_argument('--web-dir', type=Path, help='网页版写到这个目录（GitHub Pages 用），不另生成 ZIP')
    parser.add_argument('--codex', help='数据包名称，例如 civil-code；默认是宪法。只用于网页版：PC&Mac 通用版和各应用版都包含全部数据包')
    parser.add_argument('--source', type=Path, help='纯净版文件夹；默认是 分发/法典笔记-纯净版-TAG。在公开仓库中写 .')
    args = parser.parse_args()
    source = (args.source or (args.page.resolve().parent.parent if args.page else DIST / f'法典笔记-纯净版-{args.tag}')).resolve()
    if not (source / 'demo/edition.json').exists():
        sys.exit(f'找不到纯净版 {source}，请先运行 python3 维护工具/制作纯净版.py --tag {args.tag}')
    pack = Pack(source, args.codex)
    page = (args.page.resolve() if args.page else pack.page)
    if not page.exists():
        sys.exit(f'找不到 {page}，请先在纯净版中运行 python3 demo/build.py')
    text = page.read_text(encoding='utf-8')
    if 'fadian-notes-clean-v1' not in text or 'fadian-notes-demo-' in text:
        sys.exit('这个页面不是纯净版，停止制作。')
    makers = {'pc': make_pc, 'web': lambda page, tag, pack: make_web(page, tag, pack, args.web_dir.resolve() if args.web_dir else None),
              'android': make_android, 'windows': make_windows, 'mac': make_mac}
    chosen = [name.strip() for name in args.only.split(',') if name.strip()]
    if not pack.default:  # the PC&Mac 通用版 and the apps already hold every data pack
        chosen = [name for name in chosen if name == 'web']
    if unknown := [name for name in chosen if name not in makers]:
        sys.exit('不认识的终端：' + '、'.join(unknown))
    planned = {'pc': [f'法典笔记-PC&Mac通用版-{args.tag}.zip'],
               'web': [] if args.web_dir else [f'{pack.file}-网页版-{args.tag}', f'{pack.file}-网页版-{args.tag}.zip'],
               'android': [f'{pack.file}-安卓版-{args.tag}.apk'],
               'windows': [f'{pack.file}-Windows版-{args.tag}-安装程序.exe', f'{pack.file}-Windows版-{args.tag}-免安装.exe'],
               'mac': [f'{pack.file}-Mac版-{args.tag}.dmg']}
    web_target = args.web_dir and (args.web_dir / pack.web if pack.web else args.web_dir)
    if web_target and (web_target / 'index.html').exists():
        sys.exit(f'{web_target} 已存在，不会覆盖。')
    if existing := [name for key in chosen for name in planned[key] if (DIST / name).exists()]:
        sys.exit('以下版本已存在，不会覆盖：' + '、'.join(existing))
    made = []
    for name in chosen:
        print(f'— 制作{ {"pc": "PC&Mac 通用版", "web": "网页版", "android": "安卓版", "windows": "Windows 版", "mac": "Mac 版"}[name] }')
        made += makers[name](page, args.tag, pack)
    print('完成：')
    for path in made:
        size = sum(p.stat().st_size for p in path.rglob('*')) if path.is_dir() else path.stat().st_size
        print(f'  {path.relative_to(PROJECT) if path.is_relative_to(PROJECT) else path}（{size / 1e6:.1f} MB）')
    if 'android' in chosen:
        print(f'安卓签名文件在 {RELEASE_KEY.parent}，请另行备份；丢失后新版本不能覆盖安装。')


if __name__ == '__main__':
    main()
