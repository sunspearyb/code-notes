#!/usr/bin/env python3
"""Make every icon of 法典笔记 from one design in 图标设计.html.

    python3 维护工具/应用图标/制作图标.py --design index     # 换用另一个方案时改 --design
    python3 维护工具/应用图标/制作图标.py --preview          # 生成五个方案的对比图「方案对比.png」

Writes, next to this file: web-192.png, web-512.png and apple-touch-180.png (网页版), android-foreground.png,
android-background.png and android-legacy.png (安卓版), windows.ico (Windows 版), master-*.png (1024 px),
and demo/src/icon.png, which build.py puts into the page as the browser-tab icon and the sidebar mark.
Rebuild the page and the editions afterwards.

Needs Google Chrome (headless screenshots) and the macOS `sips` command, or Pillow, for resizing.
"""
import argparse
import json
from pathlib import Path
import shutil
import struct
import subprocess
import sys
import tempfile

HERE = Path(__file__).resolve().parent
PROJECT = HERE.parent.parent
SOURCE = HERE / '图标设计.html'
DESIGNS = ['index', 'annotate', 'spines', 'seal', 'bracket']
CHROME = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', 'google-chrome', 'chromium', 'chrome']


def chrome():
    for candidate in CHROME:
        if Path(candidate).exists() or shutil.which(candidate):
            return candidate
    sys.exit('需要 Google Chrome 来绘制图标。')


def render(design, mode, target, work):
    """One 1024 px PNG with transparency. Smaller windows are not used: headless Chrome may widen them."""
    subprocess.run([chrome(), '--headless=new', '--disable-gpu', '--hide-scrollbars', f'--user-data-dir={work / "profile"}',
                    '--default-background-color=00000000', '--window-size=1024,1024', '--virtual-time-budget=4000',
                    '--allow-file-access-from-files', f'--screenshot={target}', f'{SOURCE.as_uri()}?design={design}&mode={mode}'],
                   check=True, capture_output=True)
    if not target.exists():
        sys.exit(f'未能绘制 {design} {mode}')


def resize(source, size, target):
    if shutil.which('sips'):
        subprocess.run(['sips', '-z', str(size), str(size), str(source), '--out', str(target)], check=True, capture_output=True)
        return
    from PIL import Image  # outside macOS
    Image.open(source).resize((size, size), Image.LANCZOS).save(target)


def write_ico(pngs, target):
    """An .ico holding PNG images, as Windows Vista and later read them."""
    header = struct.pack('<HHH', 0, 1, len(pngs))
    entries, data, offset = b'', b'', 6 + 16 * len(pngs)
    for size, raw in pngs:
        entries += struct.pack('<BBBBHHII', size % 256, size % 256, 0, 0, 1, 32, len(raw), offset)
        data += raw
        offset += len(raw)
    target.write_bytes(header + entries + data)


def make(design):
    with tempfile.TemporaryDirectory(prefix='fadian-icon-') as temp:
        work = Path(temp)
        master = {mode: work / f'{mode}.png' for mode in ('square', 'round', 'fg', 'bg')}
        for mode, path in master.items():
            render(design, mode, path, work)
        outputs = [('square', 512, 'web-512.png'), ('square', 192, 'web-192.png'), ('square', 180, 'apple-touch-180.png'),
                   ('fg', 432, 'android-foreground.png'), ('bg', 432, 'android-background.png'), ('round', 192, 'android-legacy.png')]
        for mode, size, name in outputs:
            resize(master[mode], size, HERE / name)
        shutil.copy(master['square'], HERE / 'master-square-1024.png')
        shutil.copy(master['round'], HERE / 'master-round-1024.png')
        icons = []
        for size in (16, 24, 32, 48, 64, 256):
            path = work / f'ico-{size}.png'
            resize(master['round'], size, path)
            icons.append((size, path.read_bytes()))
        write_ico(icons, HERE / 'windows.ico')
        resize(master['round'], 128, PROJECT / 'demo' / 'src' / 'icon.png')
    (HERE / '当前方案.json').write_text(json.dumps({'design': design}, ensure_ascii=False) + '\n', encoding='utf-8')
    print(f'已按方案“{design}”生成各终端图标和 demo/src/icon.png。请重新运行 demo/build.py 和制作工具。')


def preview():
    names = {'index': '索引贴', 'annotate': '朱批', 'spines': '书脊', 'seal': '印', 'bracket': '条旨'}
    with tempfile.TemporaryDirectory(prefix='fadian-icon-') as temp:
        work = Path(temp)
        cells = []
        for design in DESIGNS:
            for mode in ('square', 'round'):
                render(design, mode, work / f'{design}-{mode}.png', work)
            resize(work / f'{design}-round.png', 32, work / f'{design}-32.png')
            resize(work / f'{design}-round.png', 16, work / f'{design}-16.png')
            cells.append(f'<figure><img class="big" src="{design}-square.png"><img class="small" src="{design}-32.png"><img class="tiny" src="{design}-16.png"><figcaption>{names[design]}</figcaption></figure>')
        page = work / 'sheet.html'
        page.write_text('<!doctype html><meta charset="utf-8"><style>body{margin:0;padding:30px;background:#f6f4ee;display:flex;gap:30px;font:600 20px "PingFang SC",sans-serif;color:#1f2a26}'
                        'figure{margin:0;text-align:center}.big{width:220px;height:220px;border-radius:48px;display:block;box-shadow:0 4px 14px rgb(0 0 0/.12)}'
                        '.small,.tiny{margin:14px 6px 0}.small{width:32px}.tiny{width:16px}figcaption{margin-top:6px}</style>' + ''.join(cells), encoding='utf-8')
        subprocess.run([chrome(), '--headless=new', '--disable-gpu', '--hide-scrollbars', f'--user-data-dir={work / "profile"}', '--window-size=1340,360',
                        '--allow-file-access-from-files', f'--screenshot={HERE / "方案对比.png"}', page.as_uri()], check=True, capture_output=True)
    print('已生成 维护工具/应用图标/方案对比.png')


def main():
    parser = argparse.ArgumentParser(description='生成法典笔记各终端的应用图标')
    parser.add_argument('--design', choices=DESIGNS, help='方案：' + '、'.join(DESIGNS))
    parser.add_argument('--preview', action='store_true', help='生成五个方案的对比图')
    args = parser.parse_args()
    if args.preview:
        preview()
    if args.design:
        make(args.design)
    if not args.preview and not args.design:
        parser.print_help()


if __name__ == '__main__':
    main()
