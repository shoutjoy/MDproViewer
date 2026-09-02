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
import json
import xml.etree.ElementTree as ET

from web_search import SEARCH_PATHS, web_search

from LocalSave_sqlite.server.api import SqliteApiRouter
from LocalSave_sqlite.server.database import DatabaseManager
from LocalSave_sqlite.server.instance_lock import SqliteInstanceLock, SqliteInstanceLockError

PREFERRED_PORT = int(os.environ.get("MD_VIEWER_PORT", "8765"))
DIR = os.path.dirname(os.path.abspath(__file__))
HOST = os.environ.get("MD_VIEWER_HOST", "127.0.0.1").strip() or "127.0.0.1"
OPEN_BROWSER = os.environ.get("MD_VIEWER_NO_BROWSER", "").strip().lower() not in {"1", "true", "yes"}
CACHE_MODE = os.environ.get("MD_VIEWER_CACHE_MODE", "release").strip().lower()

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
    DEEPSEEK_PROXY_PATH = "/__mdviewer_deepseek_proxy"
    LMSTUDIO_PROXY_PATH = "/__mdviewer_lmstudio_proxy"
    IMAGE_PROXY_LIMIT = 30 * 1024 * 1024

    def send_header(self, keyword, value):
        if str(keyword).lower() == "cache-control":
            self._mdviewer_cache_control_sent = True
        super().send_header(keyword, value)

    def _default_cache_control(self):
        parsed = urllib.parse.urlsplit(self.path)
        path = parsed.path.lower()
        if path.startswith("/__mdviewer_"):
            return "no-store"
        if CACHE_MODE in {"dev", "development", "no-cache"}:
            return "no-store, no-cache, must-revalidate"
        if path in {"", "/"} or path.endswith((".html", ".htm")):
            return "no-cache, must-revalidate"
        extension = os.path.splitext(path)[1]
        if parsed.query and extension in {".js", ".css", ".woff", ".woff2", ".ttf", ".otf", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico"}:
            return "public, max-age=31536000, immutable"
        if extension in {".woff", ".woff2", ".ttf", ".otf", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico"}:
            return "public, max-age=604800"
        if extension in {".js", ".css"}:
            return "public, max-age=300, must-revalidate"
        return "no-cache, must-revalidate"

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

    def _send_json(self, status, value):
        payload = json.dumps(value, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        origin = str(self.headers.get("Origin") or "").strip()
        if self.path.split("?", 1)[0] in SEARCH_PATHS and self._is_local_web_origin(origin):
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.end_headers()
        self.wfile.write(payload)

    @staticmethod
    def _is_local_web_origin(origin):
        if origin == "null":
            return True
        try:
            parsed = urllib.parse.urlsplit(origin)
            return parsed.scheme in {"http", "https"} and parsed.hostname in {"127.0.0.1", "localhost", "::1"}
        except ValueError:
            return False

    def _web_search(self, query_string):
        if self.client_address[0] not in {"127.0.0.1", "::1"}:
            self._send_json(403, {"ok": False, "error": "검색 API는 이 컴퓨터에서만 사용할 수 있습니다."})
            return
        try:
            self._send_json(200, web_search(query_string))
        except ValueError as error:
            self._send_json(400, {"ok": False, "error": str(error)})
        except LookupError as error:
            self._send_json(404, {"ok": False, "error": str(error)})
        except (OSError, urllib.error.URLError, ET.ParseError) as error:
            self.log_error("web search failed: %s", error)
            self._send_json(502, {"ok": False, "error": "인터넷 검색 서비스에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요."})

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
        if parsed.path in SEARCH_PATHS:
            self._web_search(parsed.query)
            return
        if parsed.path == self.IMAGE_PROXY_PATH:
            query = urllib.parse.parse_qs(parsed.query)
            self._proxy_image((query.get("url") or [""])[0])
            return
        if parsed.path == self.LMSTUDIO_PROXY_PATH:
            query = urllib.parse.parse_qs(parsed.query)
            self._proxy_lmstudio((query.get("url") or [""])[0], "GET")
            return
        super().do_GET()

    def do_POST(self):
        if SQLITE_API.handle(self, "POST"):
            return
        parsed = urllib.parse.urlsplit(self.path)
        if parsed.path == self.DEEPSEEK_PROXY_PATH:
            self._proxy_deepseek()
            return
        if parsed.path == self.LMSTUDIO_PROXY_PATH:
            query = urllib.parse.parse_qs(parsed.query)
            self._proxy_lmstudio((query.get("url") or [""])[0], "POST")
            return
        self.send_error(404, "Not Found")

    def _proxy_lmstudio(self, raw_url, method):
        if self.client_address[0] not in {"127.0.0.1", "::1"}:
            self._send_proxy_error(403, "LM Studio proxy is available only from this computer")
            return
        try:
            target = urllib.parse.urlsplit(str(raw_url or "").strip())
            if target.scheme != "http" or target.hostname not in {"127.0.0.1", "localhost", "::1"}:
                raise ValueError("Only a local LM Studio HTTP address is allowed")
            if target.username or target.password:
                raise ValueError("Credentials in the LM Studio URL are not allowed")
            data = None
            if method == "POST":
                size = int(self.headers.get("Content-Length") or 0)
                if size < 0 or size > 16 * 1024 * 1024:
                    raise ValueError("Invalid LM Studio request size")
                data = self.rfile.read(size) if size else b""
            headers = {
                "Accept": self.headers.get("Accept") or "application/json",
                "Content-Type": self.headers.get("Content-Type") or "application/json",
            }
            authorization = self.headers.get("Authorization")
            if authorization:
                headers["Authorization"] = authorization
            request = urllib.request.Request(target.geturl(), data=data, method=method, headers=headers)
            try:
                response = urllib.request.urlopen(request, timeout=3600)
            except urllib.error.HTTPError as error:
                response = error
            with response:
                self.send_response(response.status)
                content_type = response.headers.get("Content-Type") or "application/json; charset=utf-8"
                self.send_header("Content-Type", content_type)
                if "text/event-stream" in content_type.lower():
                    self.send_header("X-Accel-Buffering", "no")
                self.end_headers()
                if "text/event-stream" in content_type.lower():
                    # HTTPResponse.read(size) tries to fill the requested buffer.
                    # That can hold LM Studio tokens until 64 KiB accumulates or
                    # generation finishes. SSE is line framed, so forward each
                    # line as soon as LM Studio produces it.
                    while True:
                        line = response.readline()
                        if not line:
                            break
                        self.wfile.write(line)
                        self.wfile.flush()
                else:
                    while True:
                        chunk = response.read(64 * 1024)
                        if not chunk:
                            break
                        self.wfile.write(chunk)
                        self.wfile.flush()
        except (ValueError, OSError, urllib.error.URLError) as error:
            self._send_proxy_error(502, error)

    def _proxy_deepseek(self):
        if self.client_address[0] not in {"127.0.0.1", "::1"}:
            self._send_proxy_error(403, "DeepSeek proxy is available only from this computer")
            return
        try:
            size = int(self.headers.get("Content-Length") or 0)
            if size <= 0 or size > 4 * 1024 * 1024:
                raise ValueError("Invalid request size")
            envelope = json.loads(self.rfile.read(size).decode("utf-8"))
            base_url = str(envelope.get("baseUrl") or "https://api.deepseek.com").rstrip("/")
            target = urllib.parse.urlsplit(base_url)
            if target.scheme != "https" or target.hostname not in {"api.deepseek.com"}:
                raise ValueError("Only the official DeepSeek API host is allowed")
            api_path = str(envelope.get("path") or "")
            if api_path not in {"/chat/completions", "/models", "/user/balance"}:
                raise ValueError("Unsupported DeepSeek API path")
            api_key = str(envelope.get("apiKey") or "").strip()
            if not api_key:
                raise ValueError("DeepSeek API key is missing")
            body = envelope.get("body")
            data = None if body is None else json.dumps(body).encode("utf-8")
            request = urllib.request.Request(
                base_url + api_path,
                data=data,
                method="GET" if body is None else "POST",
                headers={"Authorization": "Bearer " + api_key, "Content-Type": "application/json", "Accept": "application/json"},
            )
            timeout = max(30, min(3600, int(envelope.get("timeoutSeconds") or 300)))
            try:
                with urllib.request.urlopen(request, timeout=timeout) as response:
                    payload = response.read(16 * 1024 * 1024)
                    status = response.status
            except urllib.error.HTTPError as error:
                payload = error.read(16 * 1024 * 1024)
                status = error.code
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
        except (ValueError, OSError, urllib.error.URLError, json.JSONDecodeError) as error:
            self._send_proxy_error(502, error)

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
        if not getattr(self, "_mdviewer_cache_control_sent", False):
            self.send_header("Cache-Control", self._default_cache_control())
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
