#!/usr/bin/env python3
"""Local assistant entry. Python standard library only; run --help for commands."""
import argparse
import base64
import json
from pathlib import Path
import sys
import urllib.error
import urllib.request
from edition import EDITION


def main():
    parser = argparse.ArgumentParser(description='法典笔记本地助手入口。先启动书库，并在“智能辅助”允许接入。')
    parser.add_argument('--port', type=int, default=EDITION['port'])
    parser.add_argument('--year', type=int, help='文本年份；不填时使用该法典的最新文本')
    commands = parser.add_subparsers(dest='action', required=True)
    for name in ['status', 'catalogue', 'book', 'files']:
        commands.add_parser(name)
    commands.add_parser('read').add_argument('unitId')
    commands.add_parser('file').add_argument('id')
    commands.add_parser('search').add_argument('query')
    commands.add_parser('upload').add_argument('path')
    commands.add_parser('propose').add_argument('path', help='UTF-8 JSON 建议文件')
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error('端口无效')
    base = f'http://127.0.0.1:{args.port}'
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *unused):
            raise RuntimeError('本机服务不应重定向。')
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    def request(path, body=None, token=None):
        headers = {'Content-Type': 'application/json'}
        if token:
            headers['X-Fadian-Token'] = token
        req = urllib.request.Request(base+path, json.dumps(body, ensure_ascii=False).encode('utf-8') if body is not None else None, headers)
        with opener.open(req, timeout=15) as response:
            return json.load(response)
    try:
        health = request('/__fadian_health')
        # Codes other than the constitution add their name to the marker (fadian-notes-clean-v1-cyber-law).
        if not str(health.get('app', '')).startswith(('fadian-notes-local-v4', 'fadian-notes-clean-v1')):
            raise RuntimeError('该端口不是法典笔记服务。')
        token = request('/api/session')['token']
        if args.action == 'status':
            status = request('/api/status', token=token)
            result = {'enabled': status['config'].get('agentEnabled', False), 'attachments': status['attachments'], 'pending': status['pending']}
        else:
            body = {'action': args.action}
            if args.year is not None:
                body['year'] = args.year
            for key in ['unitId', 'id', 'query']:
                if hasattr(args, key):
                    body[key] = getattr(args, key)
            if args.action == 'upload':
                file = Path(args.path)
                if file.stat().st_size > 16*1024*1024:
                    raise RuntimeError('文件超过 16 MB。')
                body.update(name=file.name, content=base64.b64encode(file.read_bytes()).decode('ascii'))
            if args.action == 'propose':
                if Path(args.path).stat().st_size > 2*1024*1024:
                    raise RuntimeError('建议文件超过 2 MB。')
                proposal = json.loads(Path(args.path).read_text(encoding='utf-8'))
                if not isinstance(proposal, dict):
                    raise RuntimeError('建议文件须为 JSON 对象。')
                body.update(proposal);body['action'] = 'propose'
            result = request('/api/agent', body, token)
        print(json.dumps(result, ensure_ascii=False, indent=2))
    except urllib.error.HTTPError as error:
        try:
            message = json.load(error).get('error', '本机服务未完成请求。')
        except (ValueError, TypeError):
            message = '本机服务未完成请求。'
        print(message, file=sys.stderr);return 1
    except (OSError, ValueError, RuntimeError, KeyError) as error:
        print(str(error) if not isinstance(error, urllib.error.URLError) else '无法连接本机书库。请先启动法典笔记，核对端口。', file=sys.stderr);return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
