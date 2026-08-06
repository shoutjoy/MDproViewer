"""End-to-end HTTP tests for the restricted SQLite API using a temporary DB."""

from __future__ import annotations

import base64
import hashlib
import io
import json
import sys
import tempfile
import threading
import urllib.error
import urllib.parse
import urllib.request
import zipfile
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
        type(router.model_asset_service).MIN_MODEL_BYTES = 1
        type(router.model_asset_service).CHUNK_BYTES = 7

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

        def request_work_upload(
            payload: bytes, file_name: str, work_type: str, token: str = "", app_id: str = "fmaviewer"
        ) -> tuple[int, dict]:
            content_types = {
                "ai_jena_preset": "application/vnd.fma-ai-jena-preset+json",
                "genslide_mpp": "application/vnd.genslide.mpp+json",
                "genslide_pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
                "genslide_png": "image/png",
                "genslide_image_zip": "application/zip",
            }
            content_type = content_types.get(work_type, "application/vnd.fma+zip")
            headers = {
                "Accept": "application/json",
                "Content-Type": content_type,
                "X-MDViewer-File-Name": urllib.parse.quote(file_name),
                "X-MDViewer-Work-Type": work_type,
                "X-MDViewer-App": app_id,
            }
            if token:
                headers["X-MDViewer-Session"] = token
            req = urllib.request.Request(
                base_url + "/workfiles", data=payload, headers=headers, method="POST"
            )
            try:
                with urllib.request.urlopen(req, timeout=30) as response:
                    return response.status, json.loads(response.read().decode("utf-8"))
            except urllib.error.HTTPError as error:
                return error.code, json.loads(error.read().decode("utf-8"))

        def request_model_upload(payload: bytes, file_name: str, token: str = "") -> tuple[int, dict]:
            headers = {
                "Accept": "application/json",
                "Content-Type": "application/octet-stream",
                "X-MDViewer-File-Name": urllib.parse.quote(file_name),
            }
            if token:
                headers["X-MDViewer-Session"] = token
            req = urllib.request.Request(
                base_url + "/models/u2net_human_seg",
                data=payload,
                headers=headers,
                method="POST",
            )
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
            require(health["data"]["capabilities"]["backupExplorer"] is True, "backup explorer capability missing")
            require(health["data"]["capabilities"]["restorePreview"] is True, "restore preview capability missing")
            require(health["data"]["capabilities"]["restore"] is True, "restore apply capability missing")
            require(health["data"]["capabilities"]["workFiles"] is True, "work files capability missing")
            require(health["data"]["capabilities"]["modelAssets"] is True, "model assets capability missing")
            require(health["data"]["capabilities"]["fmaPreview"] is True, "FMA preview capability missing")
            require(
                health["data"]["capabilities"]["storageModeActivation"] is True,
                "storage activation must be available after recovery support",
            )

            status, session = request("GET", "/session")
            token = session["data"]["token"]
            require(status == 200 and token, "session endpoint failed")

            fma_buffer = io.BytesIO()
            fma_manifest = {
                "format": "fma-archive",
                "version": 3,
                "images": [{"src": {"$fmaMedia": "m1"}}],
                "media": {"m1": {"path": "media/test.png", "mimeType": "image/png"}},
            }
            with zipfile.ZipFile(fma_buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
                archive.writestr("manifest.json", json.dumps(fma_manifest))
                archive.writestr(
                    "media/test.png",
                    base64.b64decode(
                        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
                    ),
                )
            fma_bytes = fma_buffer.getvalue()
            status, blocked_work_upload = request_work_upload(
                fma_bytes, "HTTP 작업.fma", "fma_webp"
            )
            require(status == 403, "work file upload without session must be blocked")
            status, saved_work_file = request_work_upload(
                fma_bytes, "HTTP 작업.fma", "fma_webp", token
            )
            require(status == 200, "work file upload failed")
            work_item = saved_work_file["data"]
            require(work_item["checksumSha256"] == hashlib.sha256(fma_bytes).hexdigest(), "work file checksum failed")
            status, blocked_work_list = request("GET", "/workfiles?app=fmaviewer")
            require(status == 403, "work file list without session must be blocked")
            status, work_list = request("GET", "/workfiles?app=fmaviewer&q=HTTP&type=fma_webp", token=token)
            require(status == 200 and len(work_list["data"]["items"]) == 1, "work file search failed")
            work_download_path = f"/workfiles/{work_item['id']}/download"
            status, blocked_work_download = request("GET", work_download_path)
            require(status == 403, "work file download without session must be blocked")
            download_status, downloaded_work_file, work_headers = request_binary(work_download_path, token)
            require(download_status == 200 and downloaded_work_file == fma_bytes, "work file round-trip failed")
            require("filename*=UTF-8''" in work_headers.get("Content-Disposition", ""), "work file UTF-8 filename missing")
            fma_preview_path = f"/explorer/files/{work_item['id']}/fma-preview"
            status, blocked_fma_preview = request("GET", fma_preview_path)
            require(status == 403, "FMA preview without session must be blocked")
            status, fma_preview = request("GET", fma_preview_path, token=token)
            require(status == 200 and fma_preview["data"]["counts"]["images"] == 1, "FMA preview summary failed")
            require(fma_preview["data"]["shownGalleryItems"] == 1, "FMA preview gallery failed")
            fma_thumbnail_path = (
                f"/explorer/files/{work_item['id']}/fma-thumbnail/"
                + urllib.parse.quote("m1")
            )
            status, blocked_fma_thumbnail = request("GET", fma_thumbnail_path)
            require(status == 403, "FMA thumbnail without session must be blocked")
            thumbnail_status, thumbnail_bytes, thumbnail_headers = request_binary(fma_thumbnail_path, token)
            require(thumbnail_status == 200 and len(thumbnail_bytes) <= 2 * 1024 * 1024, "FMA thumbnail failed")
            require(thumbnail_headers.get("Content-Type", "").startswith("image/"), "FMA thumbnail MIME failed")

            preset_bytes = json.dumps(
                {
                    "format": "FMA-AI-JENA-REFERENCES",
                    "version": 1,
                    "name": "HTTP AI Jena 세팅",
                    "references": {
                        "face": {
                            "name": "face.png",
                            "mimeType": "image/png",
                            "src": "data:image/png;base64,AA==",
                        },
                        "clothing": None,
                        "background": None,
                        "pose": None,
                    },
                    "poseCategory": "",
                    "posePreset": "",
                    "selectedPose": "",
                },
                ensure_ascii=False,
            ).encode("utf-8")
            status, saved_preset = request_work_upload(
                preset_bytes, "HTTP AI Jena 세팅.json", "ai_jena_preset", token
            )
            require(status == 200, "AI Jena preset HTTP upload failed")
            preset_item = saved_preset["data"]
            require(
                preset_item["validation"]["referenceCount"] == 1,
                "AI Jena preset HTTP validation failed",
            )
            status, preset_list = request(
                "GET", "/workfiles?app=fmaviewer&q=AI%20Jena&type=ai_jena_preset", token=token
            )
            require(status == 200 and len(preset_list["data"]["items"]) == 1, "AI Jena preset HTTP search failed")
            preset_download_status, downloaded_preset, _ = request_binary(
                f"/workfiles/{preset_item['id']}/download", token
            )
            require(
                preset_download_status == 200 and downloaded_preset == preset_bytes,
                "AI Jena preset HTTP round-trip failed",
            )

            genslide_mpp = json.dumps(
                {
                    "format": "genslide-html2pptx-mpp",
                    "version": 2,
                    "exportedAt": "2026-08-06T09:00:00.000Z",
                    "currentIndex": 0,
                    "slides": [{"html": "<section>HTTP GenSlide</section>"}],
                    "images": [],
                },
                ensure_ascii=False,
            ).encode("utf-8")
            status, saved_genslide = request_work_upload(
                genslide_mpp, "HTTP GenSlide.mpp", "genslide_mpp", token, "genslide"
            )
            require(status == 200, "GenSlide MPP HTTP upload failed")
            genslide_item = saved_genslide["data"]
            require(genslide_item["validation"]["slideCount"] == 1, "GenSlide HTTP validation failed")
            status, genslide_list = request(
                "GET", "/workfiles?app=genslide&q=HTTP&type=genslide_mpp", token=token
            )
            require(status == 200 and len(genslide_list["data"]["items"]) == 1, "GenSlide HTTP search failed")
            genslide_download_status, genslide_download, _ = request_binary(
                f"/workfiles/{genslide_item['id']}/download", token
            )
            require(
                genslide_download_status == 200 and genslide_download == genslide_mpp,
                "GenSlide HTTP round-trip failed",
            )

            model_bytes = b"\x08HTTP-ONNX-model-0123456789"
            status, blocked_model_upload = request_model_upload(
                model_bytes, "u2net_human_seg.onnx"
            )
            require(status == 403, "model upload without session must be blocked")
            status, saved_model = request_model_upload(
                model_bytes, "u2net_human_seg.onnx", token
            )
            require(status == 200, "model upload failed")
            model_item = saved_model["data"]
            require(model_item["checksumSha256"] == hashlib.sha256(model_bytes).hexdigest(), "model checksum failed")
            require(model_item["chunkCount"] == 4, "model chunk count failed")
            status, blocked_model_status = request("GET", "/models/u2net_human_seg")
            require(status == 403, "model status without session must be blocked")
            status, model_status = request("GET", "/models/u2net_human_seg", token=token)
            require(status == 200 and model_status["data"]["available"] is True, "model status failed")
            model_download_path = "/models/u2net_human_seg/download"
            status, blocked_model_download = request("GET", model_download_path)
            require(status == 403, "model download without session must be blocked")
            model_download_status, downloaded_model, model_headers = request_binary(model_download_path, token)
            require(model_download_status == 200 and downloaded_model == model_bytes, "model HTTP round-trip failed")
            require(
                model_headers.get("X-MDViewer-Checksum-Sha256") == hashlib.sha256(model_bytes).hexdigest(),
                "model download checksum header failed",
            )

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
            require(explorer["data"]["counts"]["sources"] == 4, "explorer source count failed")
            require(explorer["data"]["counts"]["fileEntries"] == 6, "explorer file count failed")
            require(explorer["data"]["counts"]["settings"] == 2, "explorer settings count failed")
            migrated_file = next(
                item for item in explorer["data"]["fileEntries"] if item["entryType"] == "file"
            )
            require("content" not in migrated_file, "explorer file list leaked content")
            status, file_detail = request("GET", f"/explorer/files/{migrated_file['id']}")
            require(status == 200, "explorer file detail failed")
            require(file_detail["data"]["content"] == "HTTP 파일 이관 본문", "file detail content mismatch")

            backup_id = explorer["data"]["backups"][0]["id"]
            backup_detail_path = f"/explorer/backups/{backup_id}"
            status, blocked_backup_detail = request("GET", backup_detail_path)
            require(status == 403, "backup detail without session must be blocked")
            require(blocked_backup_detail["error"]["code"] == "INVALID_SESSION", "backup detail session error mismatch")
            status, backup_detail = request("GET", backup_detail_path, token=token)
            require(status == 200 and backup_detail["data"]["readOnly"] is True, "backup detail endpoint failed")
            require(backup_detail["data"]["sensitiveValuesIncluded"] is False, "backup detail sensitive marker failed")
            require(backup_detail["data"]["integrity"] == ["ok"], "backup detail integrity failed")
            require(all("content" not in item for item in backup_detail["data"]["documents"]), "backup detail leaked document bodies")
            require(all("value" not in item for item in backup_detail["data"]["settings"]), "backup detail leaked setting values")
            status, blocked_backup_delete = request(
                "DELETE", backup_detail_path, {"confirmation": f"DELETE_BACKUP:{backup_id}"}
            )
            require(status == 403, "backup delete without session must be blocked")
            status, wrong_backup_delete = request(
                "DELETE", backup_detail_path, {"confirmation": "DELETE_BACKUP:wrong"}, token
            )
            require(status == 409 and wrong_backup_delete["error"]["code"] == "BACKUP_DELETE_CONFIRMATION_REQUIRED", "backup confirmation guard failed")
            status, backup_deleted = request(
                "DELETE", backup_detail_path, {"confirmation": f"DELETE_BACKUP:{backup_id}"}, token
            )
            require(status == 200 and backup_deleted["data"]["recoverable"] is True, "backup trash deletion failed")
            require((APP_ROOT / backup_deleted["data"]["trashPath"]).is_file(), "backup trash file missing")
            status, repeated_backup_delete = request(
                "DELETE", backup_detail_path, {"confirmation": f"DELETE_BACKUP:{backup_id}"}, token
            )
            require(status == 404 and repeated_backup_delete["error"]["code"] == "BACKUP_NOT_FOUND", "double backup deletion must be blocked")
            status, explorer_after_backup_delete = request("GET", "/explorer?limit=25")
            require(status == 200 and explorer_after_backup_delete["data"]["counts"]["backups"] == 0, "backup history row remained after delete")

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
            status, changed_after_preview = request(
                "POST",
                "/documents",
                {"id": "doc_after_restore_preview", "title": "복원으로 제거", "content": "임시 본문"},
                token,
            )
            require(status == 200 and changed_after_preview["data"]["id"] == "doc_after_restore_preview", "restore mutation setup failed")
            restore_apply_payload = {
                "importId": restore_data["importId"],
                "expectedPackageChecksumSha256": restore_data["packageChecksumSha256"],
                "confirmation": "RESTORE_VALIDATED_BACKUP",
            }
            status, blocked_restore_apply = request(
                "POST", "/backups/restore/apply", restore_apply_payload
            )
            require(status == 403, "restore apply without session must be blocked")
            status, restored_apply = request(
                "POST", "/backups/restore/apply", restore_apply_payload, token
            )
            require(status == 200, "restore apply endpoint failed")
            require(restored_apply["data"]["status"] == "applied", "restore apply status mismatch")
            require(restored_apply["data"]["reloadRequired"] is True, "restore reload flag missing")
            require(restored_apply["data"]["verification"]["integrityCheck"] == ["ok"], "restored live integrity failed")
            require(restored_apply["data"]["verification"]["foreignKeyViolations"] == 0, "restored live FK failed")
            require(restored_apply["data"]["verification"]["databaseCounts"]["documents"] == 2, "restored live document count failed")
            pre_restore_path = APP_ROOT / restored_apply["data"]["preRestoreBackup"]["filePath"]
            require(pre_restore_path.is_file(), "automatic pre-restore package missing")
            status, removed_after_restore = request("GET", "/documents/doc_after_restore_preview")
            require(status == 404, "data created after preview survived restore")
            status, repeated_restore = request(
                "POST", "/backups/restore/apply", restore_apply_payload, token
            )
            require(status == 409, "applied restore staging must not be reusable")
            require(repeated_restore["error"]["code"] == "RESTORE_STAGING_NOT_READY", "repeat restore error mismatch")
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
