#!/usr/bin/env python3
"""로컬 HTTP 서버 실행 - md_viewer (AI 사이드바 등 정상 동작)"""
import http.server
import socketserver
import webbrowser
import os
import ipaddress
import socket
import urllib.error
import urllib.parse
import urllib.request

from LocalSave_sqlite.server.api import SqliteApiRouter
from LocalSave_sqlite.server.database import DatabaseManager
from LocalSave_sqlite.server.instance_lock import SqliteInstanceLock, SqliteInstanceLockError

PREFERRED_PORT = int(os.environ.get("MD_VIEWER_PORT", "8765"))
DIR = os.path.dirname(os.path.abspath(__file__))
HOST = os.environ.get("MD_VIEWER_HOST", "127.0.0.1").strip() or "127.0.0.1"
OPEN_BROWSER = os.environ.get("MD_VIEWER_NO_BROWSER", "").strip().lower() not in {"1", "true", "yes"}

os.chdir(DIR)

SQLITE_MANAGER = DatabaseManager(DIR)
SQLITE_INSTANCE_LOCK = SqliteInstanceLock(
    SQLITE_MANAGER.data_root / "mdviewer.instance.lock",
    SQLITE_MANAGER.db_path.name,
)
try:
    SQLITE_INSTANCE_LOCK.acquire()
except SqliteInstanceLockError as error:
    raise SystemExit(
        "SQLite 서버 시작 차단: 같은 데이터 폴더를 사용하는 MD Viewer가 이미 실행 중입니다. "
        "기존 앱을 사용하거나 종료한 뒤 다시 실행하세요."
    ) from error

SQLITE_API = SqliteApiRouter(DIR, manager=SQLITE_MANAGER)

class Handler(http.server.SimpleHTTPRequestHandler):
    IMAGE_PROXY_PATH = "/__mdviewer_image_proxy"
    IMAGE_PROXY_LIMIT = 30 * 1024 * 1024

    @staticmethod
    def _validate_public_image_url(raw_url):
        target = urllib.parse.urlsplit(str(raw_url or "").strip())
        if target.scheme not in {"http", "https"} or not target.hostname:
            raise ValueError("Only HTTP(S) image URLs are supported")
        if target.username or target.password:
            raise ValueError("Credentials in image URLs are not allowed")
        for address in socket.getaddrinfo(target.hostname, target.port or 443, type=socket.SOCK_STREAM):
            ip = ipaddress.ip_address(address[4][0])
            if not ip.is_global:
                raise ValueError("Private or local network image URLs are not allowed")
        return target.geturl()

    def _send_proxy_error(self, status, message):
        payload = str(message or "Image proxy error").encode("utf-8", errors="replace")
        self.send_response(status)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def _proxy_image(self, raw_url):
        if self.client_address[0] not in {"127.0.0.1", "::1"}:
            self._send_proxy_error(403, "Image proxy is available only from this computer")
            return
        try:
            target_url = self._validate_public_image_url(raw_url)
            class SafeRedirectHandler(urllib.request.HTTPRedirectHandler):
                def redirect_request(self, req, fp, code, msg, headers, newurl):
                    Handler._validate_public_image_url(newurl)
                    return super().redirect_request(req, fp, code, msg, headers, newurl)

            request = urllib.request.Request(
                target_url,
                headers={
                    "User-Agent": "Mozilla/5.0 MDViewer/1.0",
                    "Accept": "image/avif,image/webp,image/svg+xml,image/*,*/*;q=0.8",
                },
            )
            opener = urllib.request.build_opener(SafeRedirectHandler())
            with opener.open(request, timeout=15) as response:
                self._validate_public_image_url(response.geturl())
                declared_size = int(response.headers.get("Content-Length") or 0)
                if declared_size > self.IMAGE_PROXY_LIMIT:
                    raise ValueError("Image is larger than 30 MB")
                payload = response.read(self.IMAGE_PROXY_LIMIT + 1)
                if len(payload) > self.IMAGE_PROXY_LIMIT:
                    raise ValueError("Image is larger than 30 MB")
                content_type = response.headers.get_content_type() or "application/octet-stream"
        except (ValueError, OSError, urllib.error.URLError) as error:
            self._send_proxy_error(502, error)
            return

        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "private, max-age=300")
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        if SQLITE_API.handle(self, "GET"):
            return
        parsed = urllib.parse.urlsplit(self.path)
        if parsed.path == self.IMAGE_PROXY_PATH:
            query = urllib.parse.parse_qs(parsed.query)
            self._proxy_image((query.get("url") or [""])[0])
            return
        super().do_GET()

    def do_POST(self):
        if SQLITE_API.handle(self, "POST"):
            return
        self.send_error(404, "Not Found")

    def do_PUT(self):
        if SQLITE_API.handle(self, "PUT"):
            return
        self.send_error(404, "Not Found")

    def do_PATCH(self):
        if SQLITE_API.handle(self, "PATCH"):
            return
        self.send_error(404, "Not Found")

    def do_DELETE(self):
        if SQLITE_API.handle(self, "DELETE"):
            return
        self.send_error(404, "Not Found")

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        super().end_headers()

class ReusableTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True
    daemon_threads = True

try:
    try:
        httpd = ReusableTCPServer((HOST, PREFERRED_PORT), Handler)
    except OSError:
        httpd = ReusableTCPServer((HOST, 0), Handler)

    with httpd:
        port = httpd.server_address[1]
        browser_host = "127.0.0.1" if HOST in {"0.0.0.0", "::"} else HOST
        url = f"http://{browser_host}:{port}/"
        print(f"서버 실행: {url}")
        print(f"바인딩: {HOST}:{port}")
        print("종료: Ctrl+C")
        if OPEN_BROWSER:
            webbrowser.open(url)
        httpd.serve_forever()
finally:
    SQLITE_INSTANCE_LOCK.release()
