#!/usr/bin/env python3
"""로컬 HTTP 서버 실행 - md_viewer (AI 사이드바 등 정상 동작)"""
import http.server
import socketserver
import webbrowser
import os

PORT = 8080
DIR = os.path.dirname(os.path.abspath(__file__))

os.chdir(DIR)

class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        super().end_headers()

with socketserver.TCPServer(("", PORT), Handler) as httpd:
    url = f"http://localhost:{PORT}"
    print(f"서버 실행: {url}")
    print("종료: Ctrl+C")
    webbrowser.open(url)
    httpd.serve_forever()
