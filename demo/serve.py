#!/usr/bin/env python3
"""Serve only the demo directory on localhost; never expose the project PDFs."""
import argparse
import os
import signal
import threading
import time
import functools
import http.server
import json
from pathlib import Path
import socketserver
import urllib.request
import webbrowser
import urllib.parse
import sys
sys.dont_write_bytecode = True
from local_service import LocalService, ServiceError, MAX_BODY
from agent_bridge import handle as handle_agent
from edition import EDITION, CODEX_NAME, page_name

ROOT = Path(__file__).resolve().parent
MARKER = EDITION['serviceMarker']

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def guess_type(self, path):
        content_type = super().guess_type(path)
        if Path(path).suffix.lower() == '.md':
            content_type = 'text/plain'
        if content_type.startswith('text/'):
            content_type += '; charset=utf-8'
        return content_type

    def valid_host(self):
        port = self.server.server_port
        allowed = {f'127.0.0.1:{port}', f'localhost:{port}'}
        return self.headers.get('Host') in allowed and (not self.headers.get('Origin') or self.headers['Origin'] in {'http://' + h for h in allowed})

    def send_json(self, data, status=200):
        content = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def do_GET(self):
        if not self.valid_host():
            return self.send_json({'error': '仅接受本机页面请求。'}, 403)
        if self.path == '/__fadian_health':
            return self.send_json({'app': MARKER})
        if self.path == '/api/session':
            return self.send_json({'token': self.server.service.token})
        if self.path.startswith('/api/'):
            if self.headers.get('X-Fadian-Token') != self.server.service.token:
                return self.send_json({'error': '请重新打开本机页面。'}, 403)
            service = self.server.service
            routes = {'/api/status': service.status, '/api/snapshot': service.current_snapshot, '/api/conflicts': service.conflict_copies,
                      '/api/attachments': lambda: service.index, '/api/proposals': lambda: service.proposals,
                      '/api/backups': service.backups}
            if self.path in routes:
                return self.send_json(routes[self.path]())
            if self.path.startswith('/api/file/'):
                try:
                    record, content = service.attachment(self.path.rsplit('/', 1)[-1])
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/octet-stream')
                    self.send_header('Content-Disposition', "attachment; filename*=UTF-8''" + urllib.parse.quote(record['name']))
                    self.send_header('Content-Length', str(len(content)))
                    self.end_headers()
                    self.wfile.write(content)
                    return
                except ServiceError as error:
                    return self.send_json({'error': str(error)}, error.status)
            return self.send_json({'error': '接口不存在。'}, 404)
        # Private service files live outside the web root. Disallow dot paths too.
        if any(part.startswith('.') for part in urllib.parse.unquote(self.path).split('/') if part):
            return self.send_error(404)
        super().do_GET()

    def do_POST(self):
        if not self.valid_host() or self.headers.get('X-Fadian-Token') != self.server.service.token:
            return self.send_json({'error': '请求来源无效，请从本机页面操作。'}, 403)
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if not 0 < size <= MAX_BODY:
                raise ServiceError('请求内容过大或为空。', 413)
            if not self.headers.get('Content-Type', '').startswith('application/json'):
                raise ServiceError('请使用 JSON 请求。', 415)
            body = json.loads(self.rfile.read(size))
            if not isinstance(body, dict):
                raise ServiceError('请求格式无效。')
            service = self.server.service
            routes = {'/api/settings': lambda: service.settings(body), '/api/snapshot': lambda: service.save_snapshot(body),
                      '/api/upload': lambda: service.upload(body), '/api/analyze': lambda: service.analyze(body),
                      '/api/resolve': lambda: service.resolve(body), '/api/search': service.search,
                      '/api/backup': service.backup, '/api/restore': lambda: service.restore(body.get('name')),
                      '/api/conflict-done': lambda: service.conflict_done(body.get('name')),
                      '/api/file-delete': lambda: service.remove_file(str(body.get('id', '')))}
            routes['/api/agent'] = lambda: handle_agent(service, body)
            if self.path not in routes:
                raise ServiceError('接口不存在。', 404)
            self.send_json(routes[self.path]())
        except ServiceError as error:
            self.send_json({'error': str(error), 'data': error.data}, error.status)
        except Exception:
            self.send_json({'error': '本机操作未完成，请核对文件格式、目录权限与磁盘空间。'}, 400)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('X-Frame-Options', 'DENY')
        super().end_headers()

class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=EDITION['port'])
    parser.add_argument('--open', action='store_true')
    parser.add_argument('--data-dir', help='独立数据目录（用于测试或单独书库）')
    args = parser.parse_args()
    # Each data pack has its own page; the service of one pack opens that page.
    url = f'http://127.0.0.1:{args.port}/' + ('' if page_name(CODEX_NAME) == '法典笔记.html' else urllib.parse.quote(page_name(CODEX_NAME)))
    try:
        server = Server(('127.0.0.1', args.port), Handler)
    except OSError:
        try:
            with urllib.request.urlopen(f'http://127.0.0.1:{args.port}/__fadian_health', timeout=2) as response:
                existing = json.load(response)
            if existing.get('app') == MARKER:
                print('法典笔记已经运行：' + url, flush=True)
                if args.open:
                    webbrowser.open(url)
                return
        except Exception:
            pass
        raise SystemExit(f'端口 {args.port} 已被其他程序占用。请关闭占用程序，或使用 --port 指定其他端口。原浏览器笔记与端口有关，变更前请导出备份。')
    server.service = LocalService(ROOT.parent, args.data_dir)
    server.service.start_scheduler()
    # The Mac app (维护工具/mac-app) passes its process id: if the app goes away without stopping the
    # service (force quit), the service stops by itself instead of holding the port.
    parent = os.environ.get('FADIAN_PARENT_PID', '')
    if parent.isdigit():
        def watch_parent():
            while True:
                time.sleep(2)
                try:
                    os.kill(int(parent), 0)
                except OSError:
                    server.shutdown()
                    return
        threading.Thread(target=watch_parent, daemon=True).start()
    print('法典笔记已启动：' + url, flush=True)
    print('关闭此终端或按 Control-C 可停止服务。服务仅供本机访问。', flush=True)
    if args.open:
        webbrowser.open(url)
    def stop(*unused):
        raise KeyboardInterrupt
    signal.signal(signal.SIGTERM, stop)  # quitting the Mac app stops the service the same way as Control-C
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\n法典笔记服务已停止。')
    finally:
        server.service.stop_event.set()
        server.server_close()

if __name__ == '__main__':
    main()
