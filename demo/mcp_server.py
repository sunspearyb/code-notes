#!/usr/bin/env python3
"""法典笔记的 MCP 服务：让 AI 助手按法律人的方法查询本机的条文和笔记。

An MCP server over stdio (JSON-RPC, one message per line). Python standard library only.
It reads nothing itself: every question goes to the local service of the code concerned
(the code must be open in 法典笔记), which applies the reader's choice for that code in 智能辅助：
保险箱 (nothing), 只读 (law text; notes only when allowed) or 协作 (suggestions for review as well).

Add it to an assistant as a stdio server with the command:  python3 <项目>/demo/mcp_server.py
See 本地助手接入.md.
"""
import json
from pathlib import Path
import sys
import urllib.error
import urllib.request
sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
from edition import EDITION_FILE, effective, load_codex, pack_names

OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))
METHOD_NOTE = '法典笔记按解释方法组织查询：先读文字（read_article），再看它在体系中的位置（article_context），再看沿革（article_history），最后看使用者收集的材料和自己的笔记（article_materials、article_notes）。回答时注明条文和年份；笔记是使用者的理解，不是法律。不要代替使用者下结论，新的理解用 propose_note 提交，由使用者审阅。'
REF = {'type': 'string', 'description': '条文，如“第三十三条”“33”“个人信息保护法第十三条”“第一百二十条之一”“序言第七自然段”'}
CODE = {'type': 'string', 'description': '法典：list_codes 返回的 name 或简称，如 constitution、民法典。只打开了一部法典时可以不填'}
YEAR = {'type': 'integer', 'description': '文本年份；不填用最新文本'}


def tool(name, description, properties=None, required=()):
    return {'name': name, 'description': description, 'inputSchema': {'type': 'object', 'properties': properties or {}, 'required': list(required)}}


ARTICLE = {'code': CODE, 'ref': REF, 'year': YEAR}
TOOLS = [
    tool('list_codes', '列出法典笔记中的法典、是否已打开，以及使用者给助手的权限（保险箱／只读／协作）。先调用它。' + METHOD_NOTE),
    tool('read_article', '【文义解释】读一条的原文，分款返回，并给出引用格式。', ARTICLE, ['ref']),
    tool('article_context', '【体系解释】这一条在哪一编、章、节，前后是哪两条；使用者把它与哪些条文关联、划入了哪些部分。', ARTICLE, ['ref']),
    tool('article_history', '【历史解释】这一条在各年文本中的变化：哪年出现、哪年修改、增删了什么、对应的修正案。', ARTICLE, ['ref']),
    tool('article_materials', '【目的解释及其他】使用者在这一条下收集的材料：立法说明、案例、配套规定、比较法材料。需要使用者允许读取笔记。', ARTICLE, ['ref']),
    tool('article_notes', '使用者在这一条下写的笔记，注明解释方法和来源（本人、讲义、助手建议经本人审阅）。需要使用者允许读取笔记。', ARTICLE, ['ref']),
    tool('search', '在条文（以及允许时的笔记、材料）中检索词句，最多返回 30 项。', {'code': CODE, 'query': {'type': 'string'}, 'year': YEAR}, ['query']),
    tool('propose_note', '提交一则候选笔记，等使用者审阅后才进入笔记。只在“协作”时可用。excerpt 必须逐字出现在 sourceText 中。', {
        'code': CODE, 'ref': REF, 'year': YEAR,
        'question': {'type': 'string', 'description': '要解释的问题'},
        'text': {'type': 'string', 'description': '整理的内容，写明尚待论证之处'},
        'title': {'type': 'string', 'description': '依据材料的名称'},
        'sourceText': {'type': 'string', 'description': '依据材料的原文'},
        'excerpt': {'type': 'string', 'description': '逐字摘自 sourceText 的一句'},
        'methods': {'type': 'array', 'items': {'type': 'string'}, 'description': '文义解释、体系解释、历史解释、目的解释中的若干项'},
        'assistant': {'type': 'string', 'description': '助手的名称'}}, ['ref', 'text', 'title', 'sourceText', 'excerpt']),
]
ACTIONS = {'read_article': 'article', 'article_context': 'context', 'article_history': 'history', 'article_materials': 'materials', 'article_notes': 'notes'}
LEVELS = {'vault': '保险箱：助手不能读取', 'read': '只读', 'collab': '协作：可以提交候选笔记'}


class Problem(Exception):
    pass


def packs():
    out = []
    for name in pack_names():
        codex = load_codex(name)
        out.append({'name': name, 'short': codex['short'], 'fullName': codex['name'], 'port': effective(EDITION_FILE, name, codex)['port']})
    return out


def call(port, path, body=None, token=None):
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['X-Fadian-Token'] = token
    request = urllib.request.Request(f'http://127.0.0.1:{port}{path}', json.dumps(body, ensure_ascii=False).encode('utf-8') if body is not None else None, headers)
    try:
        with OPENER.open(request, timeout=20) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        try:
            message = json.load(error).get('error', '')
        except ValueError:
            message = ''
        raise Problem(message or f'本机服务返回 {error.code}。')


def session(pack):
    """The session token of a code's local service, or None when the code is not open."""
    try:
        health = call(pack['port'], '/__fadian_health')
        if not str(health.get('app', '')).startswith(EDITION_FILE['serviceMarker']):
            return None
        return call(pack['port'], '/api/session')['token']
    except (OSError, ValueError, KeyError, Problem):
        return None


def list_codes():
    result = []
    for pack in packs():
        token = session(pack)
        entry = {'name': pack['name'], 'short': pack['short'], 'fullName': pack['fullName'], 'open': bool(token)}
        if token:
            config = call(pack['port'], '/api/status', token=token)['config']
            entry.update(access=LEVELS.get(config.get('aiAccess', 'vault')), notesReadable=config.get('aiAccess', 'vault') != 'vault' and bool(config.get('aiReadNotes')))
        else:
            entry['hint'] = '没有打开。请使用者在法典笔记中打开这部法典。'
        result.append(entry)
    return {'codes': result, 'howToAsk': METHOD_NOTE}


def choose(wanted):
    all_packs = packs()
    if wanted:
        q = str(wanted).replace('《', '').replace('》', '').strip()
        pack = next((p for p in all_packs if q in (p['name'], p['short'], p['fullName'])), None) or next((p for p in all_packs if p['short'] in q or q in p['fullName']), None)
        if not pack:
            raise Problem('没有这部法典。现有：' + '、'.join(f"{p['short']}（{p['name']}）" for p in all_packs))
        token = session(pack)
        if not token:
            raise Problem(f"{pack['short']}没有打开。请使用者在法典笔记中打开这部法典，再试一次。")
        return pack, token
    opened = [(p, t) for p in all_packs for t in [session(p)] if t]
    if not opened:
        raise Problem('法典笔记没有打开。请使用者先打开法典笔记（教师版应用，或双击「打开法典笔记.command」）。')
    if len(opened) > 1:
        raise Problem('打开了几部法典，请用 code 指明：' + '、'.join(p['name'] for p, _ in opened))
    return opened[0]


def run(name, args):
    if name == 'list_codes':
        return list_codes()
    pack, token = choose(args.get('code'))
    body = {k: args[k] for k in ('ref', 'year', 'query') if args.get(k) is not None}
    if name in ACTIONS:
        body['action'] = ACTIONS[name]
    elif name == 'search':
        body['action'] = 'search'
    elif name == 'propose_note':
        unit = call(pack['port'], '/api/agent', {**body, 'action': 'article'}, token)
        text = args['sourceText']
        digest = __import__('hashlib').sha256(json.dumps(args, ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:24]
        body = {'action': 'propose', 'requestId': 'mcp-' + digest, 'assistant': str(args.get('assistant') or 'MCP 助手')[:100], 'proposals': [{
            'kind': 'note', 'scope': {'kind': 'articles', 'year': unit['year'], 'unitIds': [unit['unitId']]}, 'title': args['title'],
            'sourceText': text, 'excerpt': args['excerpt'], 'question': args.get('question', ''), 'text': args['text'], 'methods': args.get('methods', [])}]}
        result = call(pack['port'], '/api/agent', body, token)
        return {'submitted': len(result['proposals']), 'article': unit['label'], 'status': '已提交为候选，等使用者在“关联阅读 → 新知导入”中审阅；审阅前不会进入笔记。'}
    else:
        raise Problem('没有这个工具。')
    return {'code': pack['short'], 'result': call(pack['port'], '/api/agent', body, token)}


def respond(message):
    method, ident = message.get('method'), message.get('id')
    if ident is None:  # a notification
        return None
    if method == 'initialize':
        version = (message.get('params') or {}).get('protocolVersion') or '2024-11-05'
        result = {'protocolVersion': version, 'capabilities': {'tools': {}}, 'serverInfo': {'name': 'fadian-notes', 'version': '1.0'}, 'instructions': METHOD_NOTE}
    elif method == 'ping':
        result = {}
    elif method == 'tools/list':
        result = {'tools': TOOLS}
    elif method == 'tools/call':
        params = message.get('params') or {}
        try:
            output, failed = run(params.get('name'), params.get('arguments') or {}), False
        except Problem as problem:
            output, failed = {'error': str(problem)}, True
        except (KeyError, TypeError) as error:
            output, failed = {'error': f'参数不完整或格式不对：{error}'}, True
        except OSError:
            output, failed = {'error': '无法连接本机的法典笔记，请确认它已经打开。'}, True
        result = {'content': [{'type': 'text', 'text': json.dumps(output, ensure_ascii=False, indent=1)}], 'isError': failed}
    else:
        return {'jsonrpc': '2.0', 'id': ident, 'error': {'code': -32601, 'message': f'Method not found: {method}'}}
    return {'jsonrpc': '2.0', 'id': ident, 'result': result}


def main():
    for line in sys.stdin.buffer:
        line = line.strip()
        if not line:
            continue
        try:
            message = json.loads(line)
        except ValueError:
            reply = {'jsonrpc': '2.0', 'id': None, 'error': {'code': -32700, 'message': 'Parse error'}}
        else:
            reply = respond(message) if isinstance(message, dict) else {'jsonrpc': '2.0', 'id': None, 'error': {'code': -32600, 'message': 'Invalid Request'}}
        if reply is not None:
            sys.stdout.buffer.write(json.dumps(reply, ensure_ascii=False).encode('utf-8') + b'\n')
            sys.stdout.buffer.flush()


if __name__ == '__main__':
    main()
