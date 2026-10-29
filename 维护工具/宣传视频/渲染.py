#!/usr/bin/env python3
"""Render the promotional films of 法典笔记 (1920×1080, 60 s each).

    python3 维护工具/宣传视频/渲染.py --film A                    # A 条文不是孤岛（体系解释）
    python3 维护工具/宣传视频/渲染.py --film B                    # B 怎样读懂一条宪法（其他解释方法与功能）
    python3 维护工具/宣传视频/渲染.py --film B --only 4           # only scene 4, for review
    python3 维护工具/宣传视频/渲染.py --film B --stills 9,18,35   # single frames as PNG, no video

Frames come from 渲染.html, which draws whatever second it is asked for; 抓帧.mjs steps through them
in Chrome and 配乐.py writes the soundtrack. Needs Chrome, Node.js, ffmpeg and Python 3 with numpy.
Nothing from the project's personal notes is read. Law names and article text come from the
published data pack (demo/codes/constitution/related-laws.json, versions.json).
"""
import argparse
import json
from pathlib import Path
import os
import shutil
import socket
import subprocess
import sys
import tempfile

HERE = Path(__file__).resolve().parent
PROJECT = HERE.parent.parent
PACK = PROJECT / 'demo' / 'codes' / 'constitution'
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
W, H = 1920, 1080


def run(*args, **kw):
    subprocess.run([str(a) for a in args], check=True, **kw)


def film_data(name, film):
    """Text for the renderer. Article text is read from the data pack, never retyped."""
    related = json.loads((PACK / 'related-laws.json').read_text(encoding='utf-8'))
    versions = json.loads((PACK / 'versions.json').read_text(encoding='utf-8'))
    units = {u['id']: u for u in versions['units']}
    years = versions['years']
    latest = str(years[-1])
    para = lambda uid, year=latest: units[uid]['versions'][str(year)]['paragraphs']
    text = json.loads(json.dumps(film['text']))
    data = {'LAWS': [law['short'] for law in related['laws']],
            'STRICT': [uid for uid, items in related['delegations'].items() if any(i['strict'] for i in items)],
            'A59_LAWS': [law['title'] for law in related['laws'] if 'a59' in law['units']]}
    if name == 'A':
        text['a13'] = [film['text']['a13'][0]] + para('a13')
        text['a33'] = [film['text']['a33'][0], para('a33')[0]]
    elif name == 'C':
        data['BDATA'] = {'a37': para('a37')}
    elif name == 'B':
        articles = [u for u in versions['units'] if u.get('kind') != 'preamble' and u['versions'][latest]['exists']]
        index38 = next(i for i, u in enumerate(articles) if u['id'] == 'a38')
        a11 = {}
        for y in years:
            v = units['a11']['versions'][str(y)]
            refs = [r['amendmentArticle'] for r in v['sourceRefs'] if r.get('amendmentArticle')]
            a11[str(y)] = {'text': '\n'.join(v['paragraphs']), 'changed': v['changed'], 'diff': v['diff'], 'amendment': refs[-1] if refs else ''}
        data['BDATA'] = {'a11': a11, 'title11': '第十一条', 'a40': para('a40')[0], 'a37': para('a37'), 'a38': para('a38')[0].split('。')[0] + '。', 'years': years, 'title33': '第三十三条',
                         'a33': {str(y): para('a33', y) for y in years}, 'a38at': index38 / (len(articles) - 1)}
    data.update({'TEXT': text, 'TOTAL': sum(n for _, n in film['scenes']), 'FILM_ID': name, 'SCENES': film['scenes'], 'FILM_TITLE': film['title']})
    return data


def page(work, data, fps):
    html = (HERE / '渲染.html').read_text(encoding='utf-8')
    script = ''.join(f'window.{k}={json.dumps(v, ensure_ascii=False)};' for k, v in data.items())
    html = html.replace('<canvas id="stage" width="1920" height="1080"></canvas>',
                        f'<canvas id="stage" width="{W}" height="{H}"></canvas>\n<script>{script}window.FPS={fps};</script>')
    target = work / 'render.html'
    target.write_text(html, encoding='utf-8')
    return target.as_uri()


def frames(work, url, start, end, fps):
    out = work / 'frames'
    if out.exists():
        shutil.rmtree(out)
    out.mkdir()
    with socket.socket() as probe:
        probe.bind(('127.0.0.1', 0))
        port = probe.getsockname()[1]
    run('node', HERE / '抓帧.mjs', url, out, work / 'profile', start, end, fps, env={**os.environ, 'CDP_PORT': str(port)})
    return sorted(out.glob('*.png'))


def main():
    parser = argparse.ArgumentParser(description='制作法典笔记宣传片')
    parser.add_argument('--film', required=True, help='场景.json 中的片名，如 A、B、C、D')
    parser.add_argument('--out', type=Path, help='输出 MP4；默认按 场景.json 写到 分发/')
    parser.add_argument('--only', type=int, help='只渲染第几场')
    parser.add_argument('--stills', help='只导出几个时刻的画面，逗号分隔的秒数')
    parser.add_argument('--cover-only', action='store_true', help='只重新生成封面 PNG')
    parser.add_argument('--portrait', action='store_true', help='竖屏 1080×1920；文件名加“-竖屏”')
    parser.add_argument('--fps', type=int, default=30)
    parser.add_argument('--crf', type=int, default=18)
    args = parser.parse_args()
    for tool in ('ffmpeg', 'ffprobe', 'node'):
        if not shutil.which(tool):
            sys.exit(f'需要 {tool}。')
    if not Path(CHROME).exists():
        sys.exit('需要 Google Chrome。')
    global W, H
    if args.portrait:
        W, H = 1080, 1920
    os.environ['FRAME_SIZE'] = f'{W}x{H}'
    film = json.loads((HERE / '场景.json').read_text(encoding='utf-8'))['films'][args.film]
    # A portrait film may set its own scenes, texts, accents and cover (portrait: {scenes, text, …});
    # with short: true it is the short-video version, with scenes of its own (v… in 渲染.html).
    if args.portrait and film.get('portrait'):
        film = {**film, **{k: v for k, v in film['portrait'].items() if k != 'text'}, 'text': {**film['text'], **film['portrait'].get('text', {})}}
    # A portrait output name that already says 竖屏 (the short-video version) is used as it is.
    suffix = '-竖屏' if args.portrait and '竖屏' not in film['output'] else ''
    out = args.out or PROJECT / '分发' / f'{film["output"]}{suffix}.mp4'
    out = out if out.is_absolute() else PROJECT / out
    # Scene lengths are in 场景.json; cuts, accents and the cover are given relative to a scene.
    starts, at = {}, 0.0
    bounds = [0.0]
    for scene, length in film['scenes']:
        starts.setdefault(scene, at)
        at += length
        bounds.append(at)
    duration, fps = at, args.fps
    cuts = bounds[1:-1]
    accents = [starts[scene] + offset for scene, offset in film['accents']]
    cover_at = starts[film['cover'][0]] + film['cover'][1]
    sfx = [f'{starts[scene] + offset:g}:{kind}' for scene, offset, kind in film.get('sfx', [])]
    with tempfile.TemporaryDirectory(prefix='fadian-promo-') as temp:
        work = Path(temp)
        url = page(work, {**film_data(args.film, film), 'PORTRAIT': args.portrait, 'VIEWS': film.get('views', {}), 'SHORT': bool(film.get('short')), 'CHAPTERS': film.get('chapters', [])}, fps)
        if args.cover_only:
            cover = out.with_suffix('.png')
            shutil.copy(frames(work, page(work, {**film_data(args.film, film), 'COVER': True, 'PORTRAIT': args.portrait, 'VIEWS': film.get('views', {}), 'SHORT': bool(film.get('short')), 'CHAPTERS': film.get('chapters', [])}, fps), cover_at, cover_at + 1 / fps, fps)[0], cover)
            print(f'封面：{cover}')
            return
        if args.stills:
            outdir = out.parent / f'{out.stem}-stills'
            outdir.mkdir(parents=True, exist_ok=True)
            for t in (float(x) for x in args.stills.split(',')):
                shutil.copy(frames(work, url, t, t + 1 / fps, fps)[0], outdir / f'{t:05.1f}s.png')
            print(f'画面：{outdir}')
            return
        start, end = (bounds[args.only - 1], bounds[args.only]) if args.only else (0, duration)
        if args.only:
            out = out.with_name(f'{out.stem}-第{args.only}场.mp4')
        elif out.exists():
            sys.exit(f'{out} 已存在，不会覆盖。')
        print(f'{args.film} 片：渲染 {start}—{end} 秒……')
        shots = frames(work, url, start, end, fps)
        out.parent.mkdir(parents=True, exist_ok=True)
        video = work / 'video.mp4'
        run('ffmpeg', '-v', 'error', '-y', '-framerate', fps, '-i', work / 'frames/%05d.png',
            '-vf', f'scale={W}:{H},format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', args.crf, '-r', fps, video)
        if args.only:
            shutil.copy(video, out)
        else:
            audio = work / 'sound.wav'
            run(sys.executable, HERE / '配乐.py', audio, duration,
                '--style', args.film, '--cuts', ','.join(f'{c:g}' for c in cuts), '--accents', ','.join(f'{a:g}' for a in accents), '--sfx', ','.join(sfx))
            run('ffmpeg', '-v', 'error', '-y', '-i', video, '-i', audio, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
                '-shortest', '-movflags', '+faststart', '-metadata', f'title=法典笔记：{film["title"]}', out)
            # The cover is drawn with 法典笔记 and the film's title over the chosen moment.
            cover = out.with_suffix('.png')
            cover_url = page(work, {**film_data(args.film, film), 'COVER': True, 'PORTRAIT': args.portrait, 'VIEWS': film.get('views', {}), 'SHORT': bool(film.get('short')), 'CHAPTERS': film.get('chapters', [])}, fps)
            shutil.copy(frames(work, cover_url, cover_at, cover_at + 1 / fps, fps)[0], cover)
    print(f'完成：{out}（{end - start:.0f} 秒，{out.stat().st_size / 1e6:.1f} MB）')


if __name__ == '__main__':
    main()
