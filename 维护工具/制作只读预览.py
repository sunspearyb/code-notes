#!/usr/bin/env python3
"""Build script-free read-only previews from the clean compiled pages."""
import argparse, json, re
from pathlib import Path
from html import escape as e

def build(source, site):
    preview = site / 'preview'
    preview.mkdir(parents=True, exist_ok=True)
    links = []
    for page in sorted((source / 'demo').glob('法典笔记*.html')):
        match = re.search(r'<script id="content-data" type="application/json">(.*?)</script>', page.read_text(), re.S)
        if not match:
            continue
        data = json.loads(match.group(1))
        codex = data['codex']
        folder = codex.get('webFolder', 'constitution')
        if not folder:
            folder = 'constitution'
        target = preview / folder
        target.mkdir(parents=True, exist_ok=True)
        formal = '../../' if folder == 'constitution' else '../../' + folder + '/'
        latest = str(max(data['history']['years']))
        articles = []
        for unit in data['history']['units']:
            version = unit['versions'].get(latest)
            if not version or not version.get('exists', True):
                continue
            label = version.get('label', unit.get('label', unit['id']))
            subtitle = data.get('subtitles', {}).get(unit['id'], '')
            if isinstance(subtitle, dict):
                subtitle = subtitle.get(latest, '')
            if not isinstance(subtitle, str):
                subtitle = ''
            title = label + (' · ' + subtitle if subtitle else '')
            body = ''.join('<p>' + e(t) + '</p>' for t in version['paragraphs'])
            articles.append('<details><summary>' + e(title) + '</summary>' + body + '</details>')
        title = codex['short'] + ' · 只读预览'
        content = '<p><a href="../">三部法典预览目录</a> · <a href="' + formal + '">进入正式手机版</a></p><h1>' + e(title) + '</h1><p class="notice">仅供阅读，不提供添加笔记、上传、导入或保存功能。正式记笔记请进入正式手机版，或下载电脑网页版。</p><p>展示数据包最新文本（' + latest + ' 年版本），点击条文标题展开。条旨为研读草稿。</p>' + ''.join(articles)
        (target / 'index.html').write_text(document(title, content), encoding='utf-8')
        links.append('<li><a href="' + e(folder) + '/">' + e(codex['short']) + '</a></li>')
    (preview / 'index.html').write_text(document('法典笔记 · 只读预览', '<h1>法典笔记 · 只读预览</h1><p class="notice">这里只供阅读，不接收或保存任何笔记。正式使用请进入各法典的正式手机版，或下载电脑网页版。</p><ul>' + ''.join(links) + '</ul><p><a href="https://github.com/sunspearyb/code-notes/releases/latest">版本选择与下载</a></p>'), encoding='utf-8')

def document(title, body):
    return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="script-src &#39;none&#39;; connect-src &#39;none&#39;; object-src &#39;none&#39;; form-action &#39;none&#39;; base-uri &#39;none&#39;"><title>' + e(title) + '</title><style>body{max-width:850px;margin:0 auto;padding:24px 18px;background:#faf8f0;color:#2b2426;font:17px/1.8 system-ui}a{color:#8b3652}h1{font-size:28px}.notice{padding:16px;background:#f6eaee;border-left:4px solid #8b3652}details{border-bottom:1px solid #d7dbd3;padding:14px 0}summary{cursor:pointer;font-weight:600}p{overflow-wrap:anywhere}li{margin:16px 0}</style></head><body>' + body + '</body></html>'

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', type=Path, default=Path('.'))
    parser.add_argument('--site', type=Path, required=True)
    args = parser.parse_args()
    build(args.source, args.site)
