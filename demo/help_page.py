"""Render the bundled Markdown help with a small, escaped Markdown subset."""
from html import escape
import re


def inline(text):
    return ''.join('<code>' + escape(part) + '</code>' if i % 2 else escape(part)
                   for i, part in enumerate(text.split('`')))


def render_help(source):
    blocks, paragraph, code = [], [], []
    fenced = False

    def flush():
        if paragraph:
            blocks.append('<p>' + inline(' '.join(paragraph)) + '</p>')
            paragraph.clear()

    for line in source.splitlines():
        if line.startswith('```'):
            flush()
            if fenced:
                blocks.append('<pre><code>' + escape('\n'.join(code)) + '</code></pre>')
                code.clear()
            fenced = not fenced
        elif fenced:
            code.append(line)
        elif not line.strip():
            flush()
        elif re.match(r'^#{1,3} ', line):
            flush()
            level = len(line) - len(line.lstrip('#'))
            blocks.append(f'<h{level}>' + inline(line[level + 1:]) + f'</h{level}>')
        else:
            paragraph.append(line)
    flush()
    if fenced:
        blocks.append('<pre><code>' + escape('\n'.join(code)) + '</code></pre>')
    return '''<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>本地助手接入 · 法典笔记</title>
<style>
:root{color-scheme:light}*{box-sizing:border-box}body{margin:0;background:#faf8f0;color:#2b2426;font:16px/1.9 "PingFang SC","Hiragino Sans GB","Microsoft YaHei",system-ui,sans-serif}
main{max-width:820px;margin:48px auto;padding:40px 52px;background:#fffefa;border:1px solid #ebe3d6;border-radius:12px;box-shadow:0 1px 2px rgb(31 42 38/.04),0 6px 20px rgb(31 42 38/.05)}
nav{font-size:14px;border-bottom:1px solid #ebe3d6;padding-bottom:16px}a{color:#8b3652;text-underline-offset:3px}
h1,h2,h3{font-family:"Songti SC","Noto Serif CJK SC","Source Han Serif SC","SimSun",serif;font-weight:600;letter-spacing:.04em}h1{font-size:28px;margin:28px 0 18px}h2{font-size:21px;margin-top:40px;padding-left:12px;border-left:3px solid #b5452f;line-height:1.5}h3{font-size:18px}
p{overflow-wrap:anywhere;color:#4a3f42}code{background:#f4efe5;padding:2px 5px;border-radius:4px;font-size:.88em;color:#2b2426}pre{overflow:auto;background:#f4efe5;border-radius:10px;padding:18px 20px;line-height:1.7;font-size:14px}pre code{padding:0}
footer{margin-top:36px;padding-top:18px;border-top:1px solid #ebe3d6;font-size:13px;color:#6b5f63}
@media(max-width:640px){main{margin:0;padding:24px 18px;border:0;border-radius:0}h1{font-size:24px}}
</style></head><body><main><nav><a href="./法典笔记.html">返回法典笔记</a></nav>
''' + '\n'.join(blocks) + '''
<footer>本页与提供给助手的 Markdown 说明使用同一份原文。<a href="./本地助手接入.md" download>下载 Markdown 原文</a></footer>
</main></body></html>
'''
