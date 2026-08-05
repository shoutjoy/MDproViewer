"""End-to-end HTTP tests for the restricted SQLite API using a temporary DB."""

from __future__ import annotations

import json
import sys
import tempfile
import threading
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


APP_ROOT = Path(__file__).resolve().parents[1]
if str(APP_ROOT) not in sys.path:
    sys.path.insert(0, str(APP_ROOT))

from LocalSave_sqlite.server.api import SqliteApiRouter  # noqa: E402
from LocalSave_sqlite.server.database import DatabaseManager  # noqa: E402


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="sqlite-http-test-", dir=APP_ROOT / "LocalSave_sqlite") as temp_name:
        manager = DatabaseManager(APP_ROOT, data_root=Path(temp_name) / "data")
        router = SqliteApiRouter(APP_ROOT, manager=manager)

        class Handler(BaseHTTPRequestHandler):
            def _handle(self, method: str) -> None:
                if not router.handle(self, method):
                    self.send_error(404)

            def do_GET(self) -> None:
                self._handle("GET")

            def do_POST(self) -> None:
                self._handle("POST")

            def do_PUT(self) -> None:
                self._handle("PUT")

            def do_PATCH(self) -> None:
                self._handle("PATCH")

            def do_DELETE(self) -> None:
                self._handle("DELETE")

            def log_message(self, _format: str, *_args: object) -> None:
                pass

        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        base_url = f"http://127.0.0.1:{server.server_address[1]}/api/sqlite"

        def request(
            method: str,
            path: str,
            payload: object | None = None,
            token: str = "",
        ) -> tuple[int, dict]:
            body = None if payload is None else json.dumps(payload, ensure_ascii=False).encode("utf-8")
            headers = {"Accept": "application/json"}
            if body is not None:
                headers["Content-Type"] = "application/json; charset=utf-8"
            if token:
                headers["X-MDViewer-Session"] = token
            req = urllib.request.Request(base_url + path, data=body, headers=headers, method=method)
            try:
                with urllib.request.urlopen(req, timeout=10) as response:
                    return response.status, json.loads(response.read().decode("utf-8"))
            except urllib.error.HTTPError as error:
                return error.code, json.loads(error.read().decode("utf-8"))

        try:
            status, health = request("GET", "/health")
            require(status == 200 and health["ok"], "health endpoint failed")
            require(health["data"]["capabilities"]["documents"] is True, "document capability missing")
            require(health["data"]["capabilities"]["search"] is True, "search capability missing")
            require(
                health["data"]["capabilities"]["storageModeActivation"] is True,
                "storage activation must be available after recovery support",
            )

            status, session = request("GET", "/session")
            token = session["data"]["token"]
            require(status == 200 and token, "session endpoint failed")

            status, unauthorized = request("POST", "/documents", {"title": "blocked"})
            require(status == 403, "write without session token must be blocked")
            require(unauthorized["error"]["code"] == "INVALID_SESSION", "wrong unauthorized error")

            status, folder = request(
                "POST",
                "/folders",
                {"id": "folder_http", "name": "HTTP 폴더"},
                token,
            )
            require(status == 200 and folder["data"]["id"] == "folder_http", "folder create failed")

            status, created = request(
                "POST",
                "/documents",
                {
                    "id": "doc_http",
                    "folderId": "folder_http",
                    "title": "HTTP 테스트",
                    "content": "첫 본문과 전용 검색어",
                },
                token,
            )
            require(status == 200 and created["data"]["version"] == 1, "document create failed")

            status, listed = request("GET", "/documents?q=HTTP&folderId=folder_http")
            require(status == 200 and len(listed["data"]["items"]) == 1, "document list failed")
            require("content" not in listed["data"]["items"][0], "document list leaked full content")

            body_query = urllib.parse.quote("전용 검색어")
            status, searched = request("GET", f"/search?q={body_query}&types=document&limit=25")
            require(status == 200 and len(searched["data"]["items"]) == 1, "FTS body search failed")
            require(searched["data"]["strategy"] == "fts5", "FTS strategy was not reported")
            require(searched["data"]["items"][0]["matchSource"] == "content", "body match source failed")
            short_query = urllib.parse.quote("전")
            status, short_search = request("GET", f"/search?q={short_query}&limit=1")
            require(status == 200 and len(short_search["data"]["items"]) == 1, "short LIKE search failed")
            require(short_search["data"]["strategy"] == "like", "short search strategy was not reported")
            require("content" not in searched["data"]["items"][0], "search result leaked full content")

            status, updated = request(
                "PUT",
                "/documents/doc_http",
                {"expectedVersion": 1, "title": "HTTP 수정", "content": "둘째 본문"},
                token,
            )
            require(status == 200 and updated["data"]["version"] == 2, "document update failed")
            status, stale_search = request("GET", f"/search?q={body_query}")
            require(status == 200 and stale_search["data"]["items"] == [], "search index kept stale body")

            status, conflict = request(
                "PUT",
                "/documents/doc_http",
                {"expectedVersion": 1, "title": "충돌", "content": "금지"},
                token,
            )
            require(status == 409, "stale document update must return 409")
            require(conflict["error"]["code"] == "VERSION_CONFLICT", "wrong conflict code")
            require(conflict["error"]["details"]["currentVersion"] == 2, "conflict version missing")

            status, versions = request("GET", "/documents/doc_http/versions")
            require(status == 200 and len(versions["data"]["items"]) == 2, "version list failed")

            status, restored = request(
                "POST",
                "/documents/doc_http/restore/1",
                {"expectedVersion": 2},
                token,
            )
            require(status == 200 and restored["data"]["version"] == 3, "version restore failed")

            status, deleted_folder = request("DELETE", "/folders/folder_http", token=token)
            require(status == 200 and deleted_folder["data"]["movedDocuments"] == 1, "folder delete failed")

            status, moved = request("GET", "/documents/doc_http")
            require(status == 200 and moved["data"]["folderId"] == "root", "document was not moved to ROOT")
            require(moved["data"]["version"] == 4, "folder move did not invalidate stale version")

            status, deleted = request(
                "DELETE", "/documents/doc_http?expectedVersion=4", token=token
            )
            require(status == 200 and deleted["data"]["deleted"], "document delete failed")

            status, integrity = request("POST", "/maintenance/integrity-check", token=token)
            require(status == 200 and integrity["data"]["ok"], "HTTP CRUD integrity failed")
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=5)

    print("SQLite HTTP API tests passed.")


if __name__ == "__main__":
    main()
