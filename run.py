#!/usr/bin/env python3
"""로컬 HTTP 서버 실행 - dist 폴더 serve (AI 사이드바 등 정상 동작)"""
import http.server
import socketserver
import subprocess
import sys
import webbrowser
import os

PORT = 8080
DIR = os.path.dirname(os.path.abspath(__file__))
DIST_DIR = os.path.join(DIR, "dist")


def ensure_dist():
    """dist가 없으면 npm install + npm run build 실행."""
    if os.path.isdir(DIST_DIR):
        return
    print("dist 폴더가 없습니다. npm install 및 npm run build를 실행합니다...")
    npm = "npm.cmd" if os.name == "nt" else "npm"
    for cmd in ([npm, "install"], [npm, "run", "build"]):
        print(f"> {' '.join(cmd)}")
        result = subprocess.run(cmd, cwd=DIR)
        if result.returncode != 0:
            print(f"실패: {' '.join(cmd)} (exit {result.returncode})", file=sys.stderr)
            sys.exit(result.returncode)
    if not os.path.isdir(DIST_DIR):
        print("빌드 후에도 dist 폴더가 없습니다.", file=sys.stderr)
        sys.exit(1)


ensure_dist()
os.chdir(DIST_DIR)


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        super().end_headers()


with socketserver.TCPServer(("", PORT), Handler) as httpd:
    url = f"http://localhost:{PORT}"
    print(f"서버 실행: {url} (serving {DIST_DIR})")
    print("종료: Ctrl+C")
    webbrowser.open(url)
    httpd.serve_forever()
