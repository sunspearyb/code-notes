#!/usr/bin/env python3
"""Make the introduction video of 法典笔记 (竖屏 1080×1920, about three minutes).

    python3 维护工具/介绍视频/制作视频.py --out 分发/法典笔记介绍视频-20261018.mp4

Steps: build a page with an empty notebook from demo/ in a temporary folder; take phone-size
screenshots with 截图.mjs; voice every line of 场景.json; draw one frame per line with Chrome;
join everything with ffmpeg. Writes the video and a subtitle file (.srt) beside it.

Voice: lines are read by the macOS voice Tingting (婷婷). To use your own recording instead, put
files named <场景 id>-<序号>.m4a (or .wav, .mp3, .aiff) into 维护工具/介绍视频/配音/, e.g.
open-1.m4a for the first line of the scene "open"; 解说词.md lists every line with its file name.

Needs Google Chrome, Node.js, ffmpeg and the macOS `say` command. No personal notes are read:
the page is built with empty starting notes and a separate browser record, in a temporary profile.
"""
import argparse
import html
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

HERE = Path(__file__).resolve().parent
PROJECT = HERE.parent.parent
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
W, H, FPS, GAP = 1080, 1920, 30, 0.45

STYLE = '''
html,body{margin:0;width:1080px;height:1920px;overflow:hidden}
body{background:radial-gradient(circle at 20% 0%,#fbf8ef 0%,#f3efe3 60%,#ebe5d4 100%);color:#1f2a26;font-family:"PingFang SC","Hiragino Sans GB",sans-serif;position:relative}
.serif{font-family:"Fadian Serif","Songti SC","STSong",serif}
.brand{position:absolute;top:56px;left:64px;display:flex;align-items:center;gap:16px;font:600 34px "Fadian Serif","Songti SC",serif;color:#1f4a3d}
.brand img{width:64px;height:64px;border-radius:14px}
.head{position:absolute;top:150px;left:64px;right:64px}
.kicker{font-size:30px;letter-spacing:.12em;color:#a33a2a;font-weight:600}
.title{margin-top:10px;font:600 76px/1.25 "Fadian Serif","Songti SC",serif;color:#1f2a26}
.phone{position:absolute;left:50%;top:370px;transform:translateX(-50%);width:556px;height:1203px;border-radius:64px;background:#17211d;padding:14px;box-shadow:0 30px 70px rgb(31 42 38/.28),0 6px 18px rgb(31 42 38/.18)}
.phone img{width:556px;height:1203px;border-radius:52px;display:block;object-fit:cover}
.sub{position:absolute;left:50px;right:50px;bottom:110px;min-height:190px;display:flex;align-items:center;justify-content:center;text-align:center;font:500 44px/1.6 "PingFang SC",sans-serif;color:#1f2a26}
.sub span{background:rgb(255 253 248/.92);box-decoration-break:clone;-webkit-box-decoration-break:clone;padding:6px 18px;border-radius:12px}
.cover .head{top:520px;text-align:center}
.cover .title{font-size:82px;line-height:1.4;white-space:pre-line}
.cover .kicker{font-size:36px}
.cover .rule{width:120px;height:6px;background:#a33a2a;margin:48px auto 0;border-radius:3px}
.quotes{position:absolute;top:470px;left:90px;right:90px}
.quotes p{margin:0 0 46px;padding:6px 0 6px 34px;border-left:8px solid #d9cfb8;font:500 54px/1.5 "Fadian Serif","Songti SC",serif;color:#8a8577}
.quotes p.on{border-color:#a33a2a;color:#1f2a26}
.end{text-align:center}
.end .big{position:absolute;top:470px;left:0;right:0}
.end .big img{width:300px;height:300px;border-radius:66px;box-shadow:0 20px 50px rgb(31 42 38/.22)}
.end .name{margin-top:56px;font:600 96px "Fadian Serif","Songti SC",serif;color:#1f4a3d;letter-spacing:.06em}
.end .motto{margin-top:30px;font:500 46px "Fadian Serif","Songti SC",serif;color:#1f2a26}
.end .ways{margin-top:60px;font-size:34px;color:#5f6963;letter-spacing:.04em}
'''


def run(*args, **kw):
    subprocess.run([str(a) for a in args], check=True, **kw)


def duration(path):
    out = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(path)],
                         check=True, capture_output=True, text=True).stdout
    return float(out.strip())


def build_page(work):
    """A copy of demo/ with no starting notes and its own browser record."""
    demo = work / 'demo'
    shutil.copytree(PROJECT / 'demo', demo, ignore=shutil.ignore_patterns('.fadian*', '__pycache__', '*.html', '*.jpg', '*.png'))
    shutil.copy(PROJECT / 'demo/src/icon.png', demo / 'src/icon.png')
    content = json.loads((demo / 'data/content.json').read_text(encoding='utf-8'))
    content['seedNotes'], content['importedNotes'] = [], []
    (demo / 'data/content.json').write_text(json.dumps(content, ensure_ascii=False), encoding='utf-8')
    (demo / 'edition.json').write_text(json.dumps({'name': 'video', 'title': '法典笔记', 'storageKey': 'fadian-notes-video',
        'legacyStorageKey': None, 'serviceMarker': 'fadian-video', 'port': 8790, 'dataDirectory': '.fadian-video'}), encoding='utf-8')
    run(sys.executable, demo / 'build.py', env={'PYTHONDONTWRITEBYTECODE': '1', 'PATH': '/usr/bin:/bin'}, capture_output=True)
    return demo / '法典笔记.html'


def frame_html(scene, line, shot_dir, icon):
    kind = scene.get('kind', 'shot')
    sub = f'<div class="sub"><span>{html.escape(line["text"])}</span></div>'
    brand = f'<div class="brand"><img src="{icon}">法典笔记</div>'
    head = f'<div class="head"><div class="kicker">{html.escape(scene.get("kicker", ""))}</div><div class="title">{html.escape(scene.get("title", ""))}</div></div>'
    if kind == 'cover':
        body = f'<body class="cover">{brand}<div class="head"><div class="kicker">{html.escape(scene.get("kicker", ""))}</div><div class="title">{html.escape(scene["title"])}</div><div class="rule"></div></div>{sub}</body>'
    elif kind == 'quote':
        spoken = line['text'].replace(' ', '')
        quotes = ''.join(f'<p class="{"on" if q.replace(" ", "") in spoken else ""}">{html.escape(q)}</p>' for q in scene['quotes'])
        body = f'<body>{brand}{head}<div class="quotes">{quotes}</div>{sub}</body>'
    elif kind == 'end':
        body = f'<body class="end"><div class="big"><img src="{icon}"><div class="name">法典笔记</div><div class="motto">法解释的方法，就是法律人的学习方法</div><div class="ways">PC&amp;Mac 通用版 · Windows 版 · 安卓版 · 网页版</div></div>{sub}</body>'
    else:
        body = f'<body>{brand}{head}<div class="phone"><img src="{(shot_dir / (line["shot"] + ".png")).as_uri()}"></div>{sub}</body>'
    fonts = (PROJECT / 'demo/src/fonts.css').as_uri()
    return f'<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><link rel="stylesheet" href="{fonts}"><style>{STYLE}</style></head>{body}</html>'


def voice(scene_id, number, text, work):
    for suffix in ('.m4a', '.wav', '.mp3', '.aiff'):
        recorded = HERE / '配音' / f'{scene_id}-{number}{suffix}'
        if recorded.exists():
            return recorded
    target = work / 'audio' / f'{scene_id}-{number}.aiff'
    run('say', '-v', 'Tingting', '-r', '190', '-o', target, text.replace('GenAI', 'Gen A I'))
    return target


def srt_time(t):
    ms = round(t * 1000)
    return f'{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}'


def main():
    parser = argparse.ArgumentParser(description='制作法典笔记介绍视频')
    parser.add_argument('--out', type=Path, required=True, help='输出的 MP4 文件，例如 分发/法典笔记介绍视频-20261018.mp4')
    args = parser.parse_args()
    out = args.out if args.out.is_absolute() else PROJECT / args.out
    if out.exists():
        sys.exit(f'{out} 已存在，不会覆盖。')
    for tool in ('ffmpeg', 'ffprobe', 'node', 'say'):
        if not shutil.which(tool):
            sys.exit(f'需要 {tool}。')
    scenes = json.loads((HERE / '场景.json').read_text(encoding='utf-8'))['scenes']
    with tempfile.TemporaryDirectory(prefix='fadian-video-') as temp:
        work = Path(temp)
        for name in ('shots', 'frames', 'audio', 'parts'):
            (work / name).mkdir()
        page = build_page(work)
        print('截图……')
        run('node', HERE / '截图.mjs', page.as_uri(), work / 'shots', work / 'profile')
        icon = (PROJECT / '维护工具/应用图标/master-round-1024.png').as_uri()
        parts, cues, clock, previous = [], [], 0.0, None
        flat = [(scene, number, line) for scene in scenes for number, line in enumerate(scene['lines'], 1)]
        print(f'配音与画面：{len(flat)} 段')
        for index, (scene, number, line) in enumerate(flat):
            key = f'{scene["id"]}-{number}'
            look = (scene['id'], line.get('shot'))
            following = flat[index + 1] if index + 1 < len(flat) else None
            next_look = (following[0]['id'], following[2].get('shot')) if following else None
            audio = voice(scene['id'], number, line['text'], work)
            length = duration(audio) + GAP + (0.6 if number == len(scene['lines']) else 0)
            page_file = work / 'frames' / f'{key}.html'
            page_file.write_text(frame_html(scene, line, work / 'shots', icon), encoding='utf-8')
            image = work / 'frames' / f'{key}.png'
            run(CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars', f'--user-data-dir={work / "profile-frames"}',
                f'--window-size={W},{H}', '--virtual-time-budget=3000', '--allow-file-access-from-files',
                f'--screenshot={image}', page_file.as_uri(), capture_output=True)
            fades = []
            if look != previous:
                fades.append('fade=t=in:st=0:d=0.25')
            if look != next_look:
                fades.append(f'fade=t=out:st={length - 0.25:.3f}:d=0.25')
            part = work / 'parts' / f'{index:03d}.mp4'
            run('ffmpeg', '-v', 'error', '-y', '-loop', '1', '-framerate', FPS, '-i', image, '-i', audio,
                '-filter_complex', f'[0:v]scale={W}:{H},format=yuv420p{"," + ",".join(fades) if fades else ""}[v];[1:a]aresample=48000,aformat=channel_layouts=stereo,apad[a]',
                '-map', '[v]', '-map', '[a]', '-t', f'{length:.3f}', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
                '-tune', 'stillimage', '-r', FPS, '-c:a', 'aac', '-b:a', '160k', part)
            parts.append(part)
            cues.append((clock, clock + length - GAP, line['text']))
            clock += length
            previous = look
        listing = work / 'parts.txt'
        listing.write_text(''.join(f"file '{p}'\n" for p in parts), encoding='utf-8')
        out.parent.mkdir(parents=True, exist_ok=True)
        run('ffmpeg', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', listing, '-c', 'copy', '-movflags', '+faststart',
            '-metadata', 'title=法典笔记：法解释的方法，就是法律人的学习方法', out)
    srt = out.with_suffix('.srt')
    srt.write_text(''.join(f'{i}\n{srt_time(a)} --> {srt_time(b)}\n{text}\n\n' for i, (a, b, text) in enumerate(cues, 1)), encoding='utf-8')
    print(f'完成：{out}（{int(clock // 60)} 分 {round(clock % 60)} 秒，{out.stat().st_size / 1e6:.1f} MB），字幕 {srt.name}')


if __name__ == '__main__':
    main()
