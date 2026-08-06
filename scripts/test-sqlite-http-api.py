"""End-to-end HTTP tests for the restricted SQLite API using a temporary DB."""

from __future__ import annotations

import hashlib
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

        def request_binary(path: str, token: str) -> tuple[int, bytes, dict]:
            req = urllib.request.Request(
                base_url + path,
                headers={
                    "Accept": "application/vnd.mdviewer.backup+zip",
                    "X-MDViewer-Session": token,
                },
                method="GET",
            )
            with urllib.request.urlopen(req, timeout=30) as response:
                return response.status, response.read(), dict(response.headers.items())

        def request_upload(
            path: str, payload: bytes, file_name: str, token: str = ""
        ) -> tuple[int, dict]:
            headers = {
                "Accept": "application/json",
                "Content-Type": "application/vnd.mdviewer.backup+zip",
                "X-MDViewer-Backup-Name": urllib.parse.quote(file_name),
            }
            if token:
                headers["X-MDViewer-Session"] = token
            req = urllib.request.Request(base_url + path, data=payload, headers=headers, method="POST")
            try:
                with urllib.request.urlopen(req, timeout=30) as response:
                    return response.status, json.loads(response.read().decode("utf-8"))
            except urllib.error.HTTPError as error:
                return error.code, json.loads(error.read().decode("utf-8"))

        try:
            status, health = request("GET", "/health")
            require(status == 200 and health["ok"], "health endpoint failed")
            require(health["data"]["capabilities"]["documents"] is True, "document capability missing")
            require(health["data"]["capabilities"]["search"] is True, "search capability missing")
            require(
                health["data"]["capabilities"]["migrationPreview"] is True,
                "migration preview capability missing",
            )
            require(health["data"]["capabilities"]["migration"] is True, "migration apply missing")
            require(health["data"]["capabilities"]["onlineBackup"] is True, "online backup missing")
            require(health["data"]["capabilities"]["explorer"] is True, "explorer capability missing")
            require(health["data"]["capabilities"]["settings"] is True, "settings capability missing")
            require(health["data"]["capabilities"]["backup"] is True, "backup capability missing")
            require(health["data"]["capabilities"]["backupPackage"] is True, "backup package capability missing")
            require(health["data"]["capabilities"]["restorePreview"] is True, "restore preview capability missing")
            require(health["data"]["capabilities"]["restore"] is False, "restore must remain disabled in package phase")
            require(
                health["data"]["capabilities"]["storageModeActivation"] is True,
                "storage activation must be available after recovery support",
            )

            status, session = request("GET", "/session")
            token = session["data"]["token"]
            require(status == 200 and token, "session endpoint failed")

            status, blocked_setting = request(
                "PUT", "/settings", {"key": "sitesVisible", "value": True}
            )
            require(status == 403, "setting write without session must be blocked")
            status, global_setting = request(
                "PUT", "/settings", {"key": "sitesVisible", "value": False}, token
            )
            require(status == 200 and global_setting["data"]["value"] is False, "global setting write failed")
            status, workspace_setting = request(
                "PUT",
                "/settings",
                {
                    "key": "sitesVisible",
                    "value": True,
                    "scopeType": "workspace",
                    "scopeId": "workspace_default",
                },
                token,
            )
            require(status == 200 and workspace_setting["data"]["value"] is True, "workspace setting write failed")
            status, resolved_settings = request("GET", "/settings/resolved")
            require(status == 200, "resolved settings endpoint failed")
            require(resolved_settings["data"]["values"]["sitesVisible"] is True, "HTTP setting precedence failed")
            status, listed_settings = request("GET", "/settings?scopeType=workspace&scopeId=workspace_default")
            require(status == 200 and len(listed_settings["data"]["items"]) == 1, "settings list failed")
            status, blocked_secret = request(
                "PUT", "/settings", {"key": "githubToken", "value": "http-secret-value"}, token
            )
            require(status == 400, "HTTP secret setting was not blocked")
            require(blocked_secret["error"]["code"] == "SENSITIVE_SETTING_BLOCKED", "HTTP secret error mismatch")
            require("http-secret-value" not in json.dumps(blocked_secret), "HTTP secret error leaked value")

            status, unauthorized = request("POST", "/documents", {"title": "blocked"})
            require(status == 403, "write without session token must be blocked")
            require(unauthorized["error"]["code"] == "INVALID_SESSION", "wrong unauthorized error")

            status, folder = request(
                "POST",
                "/folders",
                {"id": "folder_http", "name": "HTTP 폴더", "parentId": "root"},
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

            status, blocked_preview = request(
                "POST", "/migrations/indexeddb/preview", {"folders": [], "documents": []}
            )
            require(status == 403, "migration preview without session must be blocked")
            status, preview = request(
                "POST",
                "/migrations/indexeddb/preview",
                {
                    "source": {"database": "MarkdownProDB", "version": 5},
                    "folders": [
                        {"id": "root", "name": "ROOT", "parentId": None},
                        {"id": "folder_http", "name": "HTTP 폴더", "parentId": "root"},
                    ],
                    "documents": [
                        {
                            "id": "doc_http",
                            "folderId": "folder_http",
                            "title": "HTTP 테스트",
                            "content": "첫 본문과 전용 검색어",
                            "checksum": hashlib.sha256("첫 본문과 전용 검색어".encode("utf-8")).hexdigest(),
                        }
                    ],
                },
                token,
            )
            require(status == 200 and preview["data"]["previewOnly"], "migration preview failed")
            require(preview["data"]["summary"]["duplicateCount"] == 3, "preview duplicate count failed")

            apply_batch = {
                "source": {
                    "database": "MarkdownProDB",
                    "version": 5,
                    "fileDatabase": "mdpro-indb-v1",
                    "fileVersion": 1,
                },
                "folders": [
                    {"id": "root", "name": "ROOT", "parentId": None},
                    {"id": "folder_apply_http", "name": "이관 폴더", "parentId": "root"},
                ],
                "documents": [
                    {
                        "id": "doc_apply_http",
                        "folderId": "folder_apply_http",
                        "title": "HTTP 이관",
                        "content": "HTTP 실제 이관 본문",
                        "checksum": hashlib.sha256("HTTP 실제 이관 본문".encode("utf-8")).hexdigest(),
                    }
                ],
                "fileSource": {
                    "id": "source_mdpro_indb_v1",
                    "database": "mdpro-indb-v1",
                    "store": "files",
                    "name": "HTTP 파일 백업",
                    "rootUri": "indexeddb://mdpro-indb-v1/files",
                    "declaredFileCount": 1,
                },
                "files": [
                    {
                        "path": "docs/http.md",
                        "name": "http.md",
                        "extension": "md",
                        "content": "HTTP 파일 이관 본문",
                        "sizeBytes": len("HTTP 파일 이관 본문".encode("utf-8")),
                        "checksum": hashlib.sha256("HTTP 파일 이관 본문".encode("utf-8")).hexdigest(),
                    }
                ],
            }
            status, apply_preview = request(
                "POST", "/migrations/indexeddb/preview", apply_batch, token
            )
            require(status == 200 and apply_preview["data"]["summary"]["newCount"] == 5, "apply preview failed")
            require(apply_preview["data"]["summary"]["sourceFiles"] == 1, "file preview missing")
            apply_batch["previewFingerprint"] = apply_preview["data"]["batchFingerprint"]
            apply_batch["migrationId"] = apply_preview["data"]["migrationId"]
            status, applied = request(
                "POST", "/migrations/indexeddb/apply", apply_batch, token
            )
            require(status == 200 and applied["data"]["applied"]["documents"] == 1, "migration apply failed")
            require(applied["data"]["applied"]["fileSources"] == 1, "file source apply failed")
            require(applied["data"]["applied"]["fileFolders"] == 1, "file folder apply failed")
            require(applied["data"]["applied"]["files"] == 1, "file apply failed")
            require(applied["data"]["backup"]["checksumSha256"], "HTTP migration backup missing")
            status, migrated_document = request("GET", "/documents/doc_apply_http")
            require(status == 200 and migrated_document["data"]["sourceMode"] == "legacy_indb", "HTTP migrated document missing")
            explorer_query = urllib.parse.quote("HTTP")
            status, explorer = request("GET", f"/explorer?q={explorer_query}&limit=25")
            require(status == 200 and explorer["data"]["readOnly"] is True, "explorer endpoint failed")
            require(explorer["data"]["counts"]["documents"] == 2, "explorer count failed")
            require(len(explorer["data"]["documents"]) == 2, "explorer query results failed")
            require("content" not in explorer["data"]["documents"][0], "explorer leaked content")
            require(explorer["data"]["counts"]["backups"] == 1, "explorer backup count failed")
            require(explorer["data"]["counts"]["migrationCheckpoints"] == 1, "checkpoint count failed")
            require(explorer["data"]["counts"]["sources"] == 1, "explorer source count failed")
            require(explorer["data"]["counts"]["fileEntries"] == 2, "explorer file count failed")
            require(explorer["data"]["counts"]["settings"] == 2, "explorer settings count failed")
            migrated_file = next(
                item for item in explorer["data"]["fileEntries"] if item["entryType"] == "file"
            )
            require("content" not in migrated_file, "explorer file list leaked content")
            status, file_detail = request("GET", f"/explorer/files/{migrated_file['id']}")
            require(status == 200, "explorer file detail failed")
            require(file_detail["data"]["content"] == "HTTP 파일 이관 본문", "file detail content mismatch")

            status, package_created = request("POST", "/backups/packages", {}, token)
            require(status == 200, "backup package create endpoint failed")
            package_data = package_created["data"]
            require(package_data["fileName"].endswith(".mdpbackup"), "backup package filename failed")
            require(package_data["validation"]["ok"] is True, "backup package server validation failed")
            require(package_data["manifest"]["database"]["schemaVersion"] == 3, "backup manifest schema missing")
            status, package_validated = request(
                "POST",
                "/backups/packages/validate",
                {"fileName": package_data["fileName"]},
                token,
            )
            require(status == 200 and package_validated["data"]["ok"] is True, "backup validate endpoint failed")
            status, blocked_download = request(
                "GET", f"/backups/packages/{package_data['fileName']}"
            )
            require(status == 403 and blocked_download["error"]["code"] == "INVALID_SESSION", "backup download session guard failed")
            download_status, package_bytes, package_headers = request_binary(
                f"/backups/packages/{package_data['fileName']}", token
            )
            require(download_status == 200 and package_bytes.startswith(b"PK"), "backup binary download failed")
            require(len(package_bytes) == package_data["sizeBytes"], "backup download size mismatch")
            require(
                hashlib.sha256(package_bytes).hexdigest() == package_data["checksumSha256"],
                "backup download checksum mismatch",
            )
            require("attachment" in package_headers.get("Content-Disposition", ""), "backup download disposition missing")
            status, before_restore_preview = request("GET", "/explorer?limit=10")
            require(status == 200, "restore preview baseline failed")
            status, blocked_restore_preview = request_upload(
                "/backups/restore/preview", package_bytes, "다른PC.mdpbackup"
            )
            require(status == 403, "restore preview without session must be blocked")
            require(blocked_restore_preview["error"]["code"] == "INVALID_SESSION", "restore preview session error mismatch")
            status, restore_preview = request_upload(
                "/backups/restore/preview", package_bytes, "다른PC.mdpbackup", token
            )
            require(status == 200, "restore preview upload failed")
            restore_data = restore_preview["data"]
            require(restore_data["status"] == "validated_preview", "restore preview status failed")
            require(restore_data["originalName"] == "다른PC.mdpbackup", "restore preview filename decoding failed")
            require(restore_data["validation"]["schemaVersion"] == 3, "restore preview schema failed")
            require(restore_data["validation"]["integrityCheck"] == ["ok"], "restore preview integrity failed")
            require(restore_data["validation"]["foreignKeyViolations"] == 0, "restore preview FK failed")
            require(restore_data["validation"]["databaseCounts"]["documents"] == 2, "restore preview document count failed")
            status, after_restore_preview = request("GET", "/explorer?limit=10")
            require(status == 200, "restore preview after snapshot failed")
            for key in ("documents", "folders", "settings", "migrationCheckpoints", "backups"):
                require(
                    before_restore_preview["data"]["counts"][key]
                    == after_restore_preview["data"]["counts"][key],
                    f"restore preview changed live count: {key}",
                )
            status, reapplied = request(
                "POST", "/migrations/indexeddb/apply", apply_batch, token
            )
            require(status == 200 and reapplied["data"]["idempotent"] is True, "HTTP repeat apply not idempotent")

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
