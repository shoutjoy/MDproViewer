"""Restricted same-process HTTP API for the MD Viewer SQLite service."""

from __future__ import annotations

import ipaddress
import json
import re
import secrets
import traceback
import uuid
from pathlib import Path
from typing import Any, Dict
from urllib.parse import parse_qs, quote, unquote, urlsplit

from .database import (
    DatabaseConfigurationError,
    DatabaseInitializationError,
    DatabaseManager,
)
from .backup_packages import BackupPackageService
from .backup_explorer import BackupExplorerService
from .fma_previews import FmaPreviewService
from .migrations import IndexedDbMigrationService
from .model_assets import ModelAssetService
from .repositories import RepositoryError, StorageRepository
from .work_files import WorkFileService


class SqliteApiRouter:
    PREFIX = "/api/sqlite/"
    CAPABILITIES = {
        "health": True,
        "bootstrap": True,
        "integrityCheck": True,
        "documents": True,
        "documentVersions": True,
        "folders": True,
        "settings": True,
        "search": True,
        "migration": True,
        "migrationPreview": True,
        "onlineBackup": True,
        "explorer": True,
        "backup": True,
        "backupPackage": True,
        "backupExplorer": True,
        "restorePreview": True,
        "restore": True,
        "workFiles": True,
        "modelAssets": True,
        "fmaPreview": True,
        "storageModeActivation": True,
    }

    def __init__(self, app_root: Path, manager: DatabaseManager | None = None) -> None:
        self.manager = manager or DatabaseManager(app_root)
        self.repository = StorageRepository(self.manager)
        self.migration_service = IndexedDbMigrationService(self.manager, self.repository)
        self.backup_package_service = BackupPackageService(self.manager)
        self.backup_explorer_service = BackupExplorerService(self.manager)
        self.work_file_service = WorkFileService(self.manager)
        self.model_asset_service = ModelAssetService(self.manager)
        self.fma_preview_service = FmaPreviewService(self.manager)
        self._session_token = secrets.token_urlsafe(32)

    @staticmethod
    def _is_loopback(address: str) -> bool:
        try:
            return ipaddress.ip_address(str(address)).is_loopback
        except ValueError:
            return False

    @staticmethod
    def _send_json(handler: Any, status: int, payload: Dict[str, Any]) -> None:
        encoded = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        handler.send_response(status)
        handler.send_header("Content-Type", "application/json; charset=utf-8")
        handler.send_header("Content-Length", str(len(encoded)))
        handler.send_header("X-Content-Type-Options", "nosniff")
        handler.end_headers()
        handler.wfile.write(encoded)

    @staticmethod
    def _send_download(handler: Any, path: Path) -> None:
        size_bytes = path.stat().st_size
        handler.send_response(200)
        handler.send_header("Content-Type", "application/vnd.mdviewer.backup+zip")
        handler.send_header("Content-Disposition", f'attachment; filename="{path.name}"')
        handler.send_header("Content-Length", str(size_bytes))
        handler.send_header("X-Content-Type-Options", "nosniff")
        handler.end_headers()
        with path.open("rb") as source:
            for chunk in iter(lambda: source.read(1024 * 1024), b""):
                handler.wfile.write(chunk)

    @staticmethod
    def _send_work_file_download(handler: Any, item: Dict[str, Any]) -> None:
        path = Path(item["path"])
        file_name = str(item["name"])
        ascii_name = re.sub(r"[^A-Za-z0-9._-]+", "_", file_name).strip("._") or "work-file"
        encoded_name = quote(file_name, safe="")
        handler.send_response(200)
        handler.send_header("Content-Type", str(item["mimeType"]))
        handler.send_header(
            "Content-Disposition",
            f"attachment; filename=\"{ascii_name}\"; filename*=UTF-8''{encoded_name}",
        )
        handler.send_header("Content-Length", str(item["sizeBytes"]))
        handler.send_header("X-Content-Type-Options", "nosniff")
        handler.end_headers()
        with path.open("rb") as source:
            for chunk in iter(lambda: source.read(1024 * 1024), b""):
                handler.wfile.write(chunk)

    def _send_model_download(self, handler: Any, item: Dict[str, Any]) -> None:
        file_name = str(item["name"])
        ascii_name = re.sub(r"[^A-Za-z0-9._-]+", "_", file_name).strip("._") or "model.onnx"
        encoded_name = quote(file_name, safe="")
        handler.send_response(200)
        handler.send_header("Content-Type", str(item["mimeType"]))
        handler.send_header(
            "Content-Disposition",
            f"attachment; filename=\"{ascii_name}\"; filename*=UTF-8''{encoded_name}",
        )
        handler.send_header("Content-Length", str(item["sizeBytes"]))
        handler.send_header("X-MDViewer-Checksum-Sha256", str(item["checksumSha256"]))
        handler.send_header("X-Content-Type-Options", "nosniff")
        handler.end_headers()
        for chunk in self.model_asset_service.iter_model_chunks(item["modelKey"]):
            handler.wfile.write(chunk)

    @staticmethod
    def _send_preview_image(handler: Any, item: Dict[str, Any]) -> None:
        path = Path(item["path"])
        handler.send_response(200)
        handler.send_header("Content-Type", str(item["mimeType"]))
        handler.send_header("Content-Length", str(path.stat().st_size))
        handler.send_header("Cache-Control", "private, max-age=86400")
        handler.send_header("X-Content-Type-Options", "nosniff")
        handler.end_headers()
        with path.open("rb") as source:
            for chunk in iter(lambda: source.read(256 * 1024), b""):
                handler.wfile.write(chunk)

    def handle(self, handler: Any, method: str) -> bool:
        parsed_url = urlsplit(handler.path)
        path = parsed_url.path
        query = parse_qs(parsed_url.query, keep_blank_values=False)
        if not path.startswith(self.PREFIX):
            return False

        request_id = uuid.uuid4().hex
        if not self._is_loopback(handler.client_address[0]):
            self._send_json(
                handler,
                403,
                {
                    "ok": False,
                    "error": {
                        "code": "LOCAL_ACCESS_REQUIRED",
                        "message": "SQLite API access is limited to this computer.",
                    },
                    "requestId": request_id,
                },
            )
            return True

        try:
            fma_thumbnail = re.fullmatch(
                r"/api/sqlite/explorer/files/([^/]+)/fma-thumbnail/([^/]+)", path
            )
            if method == "GET" and fma_thumbnail:
                if not self._has_valid_session(handler):
                    self._send_json(
                        handler,
                        403,
                        {
                            "ok": False,
                            "error": {
                                "code": "INVALID_SESSION",
                                "message": "A valid local application session is required.",
                            },
                            "requestId": request_id,
                        },
                    )
                    return True
                item = self.fma_preview_service.get_thumbnail(
                    fma_thumbnail.group(1), unquote(fma_thumbnail.group(2))
                )
                self._send_preview_image(handler, item)
                return True
            fma_summary = re.fullmatch(r"/api/sqlite/explorer/files/([^/]+)/fma-preview", path)
            if method == "GET" and fma_summary and not self._has_valid_session(handler):
                self._send_json(
                    handler,
                    403,
                    {
                        "ok": False,
                        "error": {
                            "code": "INVALID_SESSION",
                            "message": "A valid local application session is required.",
                        },
                        "requestId": request_id,
                    },
                )
                return True
            backup_detail = re.fullmatch(r"/api/sqlite/explorer/backups/([^/]+)", path)
            if method == "GET" and backup_detail and not self._has_valid_session(handler):
                self._send_json(
                    handler,
                    403,
                    {
                        "ok": False,
                        "error": {
                            "code": "INVALID_SESSION",
                            "message": "A valid local application session is required.",
                        },
                        "requestId": request_id,
                    },
                )
                return True
            model_download = re.fullmatch(r"/api/sqlite/models/([a-z0-9_]+)/download", path)
            if method == "GET" and model_download:
                if not self._has_valid_session(handler):
                    self._send_json(
                        handler,
                        403,
                        {
                            "ok": False,
                            "error": {
                                "code": "INVALID_SESSION",
                                "message": "A valid local application session is required.",
                            },
                            "requestId": request_id,
                        },
                    )
                    return True
                item = self.model_asset_service.get_model(model_download.group(1))
                self._send_model_download(handler, item)
                return True
            if method == "GET" and path.startswith("/api/sqlite/models/") and not self._has_valid_session(handler):
                self._send_json(
                    handler,
                    403,
                    {
                        "ok": False,
                        "error": {
                            "code": "INVALID_SESSION",
                            "message": "A valid local application session is required.",
                        },
                        "requestId": request_id,
                    },
                )
                return True
            work_file_download = re.fullmatch(r"/api/sqlite/workfiles/([^/]+)/download", path)
            if method == "GET" and work_file_download:
                if not self._has_valid_session(handler):
                    self._send_json(
                        handler,
                        403,
                        {
                            "ok": False,
                            "error": {
                                "code": "INVALID_SESSION",
                                "message": "A valid local application session is required.",
                            },
                            "requestId": request_id,
                        },
                    )
                    return True
                item = self.work_file_service.resolve_download(work_file_download.group(1))
                self._send_work_file_download(handler, item)
                return True
            if method == "GET" and path == "/api/sqlite/workfiles" and not self._has_valid_session(handler):
                self._send_json(
                    handler,
                    403,
                    {
                        "ok": False,
                        "error": {
                            "code": "INVALID_SESSION",
                            "message": "A valid local application session is required.",
                        },
                        "requestId": request_id,
                    },
                )
                return True
            package_download = re.fullmatch(r"/api/sqlite/backups/packages/([^/]+\.mdpbackup)", path)
            if method == "GET" and package_download:
                if not self._has_valid_session(handler):
                    self._send_json(
                        handler,
                        403,
                        {
                            "ok": False,
                            "error": {
                                "code": "INVALID_SESSION",
                                "message": "A valid local application session is required.",
                            },
                            "requestId": request_id,
                        },
                    )
                    return True
                package_path = self.backup_package_service.resolve_package_path(
                    package_download.group(1)
                )
                self._send_download(handler, package_path)
                return True
            if method not in {"GET", "HEAD"} and not self._has_valid_session(handler):
                self._discard_request_body(handler)
                self._send_json(
                    handler,
                    403,
                    {
                        "ok": False,
                        "error": {
                            "code": "INVALID_SESSION",
                            "message": "A valid local application session is required.",
                        },
                        "requestId": request_id,
                    },
                )
                return True
            data = self._dispatch(handler, path, method, query)
            self._send_json(handler, 200, {"ok": True, "data": data, "requestId": request_id})
        except KeyError:
            self._send_json(
                handler,
                404,
                {
                    "ok": False,
                    "error": {"code": "NOT_FOUND", "message": "SQLite API endpoint not found."},
                    "requestId": request_id,
                },
            )
        except RepositoryError as error:
            error_payload: Dict[str, Any] = {
                "code": error.code,
                "message": str(error),
            }
            if error.details:
                error_payload["details"] = error.details
            self._send_json(
                handler,
                error.status,
                {"ok": False, "error": error_payload, "requestId": request_id},
            )
        except (DatabaseConfigurationError, DatabaseInitializationError) as error:
            print(f"[SQLite API] request={request_id} configuration/init error: {error}")
            self._send_json(
                handler,
                503,
                {
                    "ok": False,
                    "error": {"code": "SQLITE_UNAVAILABLE", "message": str(error)},
                    "requestId": request_id,
                },
            )
        except Exception:
            print(f"[SQLite API] request={request_id} unexpected error")
            traceback.print_exc()
            self._send_json(
                handler,
                500,
                {
                    "ok": False,
                    "error": {
                        "code": "INTERNAL_ERROR",
                        "message": "The local SQLite service encountered an unexpected error.",
                    },
                    "requestId": request_id,
                },
            )
        return True

    def _has_valid_session(self, handler: Any) -> bool:
        supplied = str(handler.headers.get("X-MDViewer-Session") or "")
        return bool(supplied) and secrets.compare_digest(supplied, self._session_token)

    @staticmethod
    def _discard_request_body(handler: Any, max_bytes: int = 50 * 1024 * 1024) -> None:
        """Drain a rejected local write so Windows does not reset the response socket."""
        try:
            remaining = int(str(handler.headers.get("Content-Length") or "0"))
        except ValueError:
            remaining = 0
        if remaining <= 0 or remaining > max_bytes:
            return
        while remaining > 0:
            chunk = handler.rfile.read(min(remaining, 64 * 1024))
            if not chunk:
                break
            remaining -= len(chunk)

    @staticmethod
    def _read_json(handler: Any, max_bytes: int = 10 * 1024 * 1024) -> Dict[str, Any]:
        raw_length = str(handler.headers.get("Content-Length") or "0")
        try:
            content_length = int(raw_length)
        except ValueError as error:
            raise RepositoryError("INVALID_CONTENT_LENGTH", "Content-Length is invalid.") from error
        if content_length < 0 or content_length > max_bytes:
            max_megabytes = max(1, max_bytes // (1024 * 1024))
            raise RepositoryError(
                "REQUEST_TOO_LARGE",
                f"JSON request exceeds {max_megabytes} MB.",
                413,
            )
        if content_length == 0:
            return {}
        raw_body = handler.rfile.read(content_length)
        try:
            payload = json.loads(raw_body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise RepositoryError("INVALID_JSON", "Request body must be valid UTF-8 JSON.") from error
        if not isinstance(payload, dict):
            raise RepositoryError("INVALID_PAYLOAD", "Request JSON must be an object.")
        return payload

    @staticmethod
    def _query_value(query: Dict[str, Any], key: str, default: Any = None) -> Any:
        values = query.get(key)
        return values[0] if values else default

    def _dispatch(
        self,
        handler: Any,
        path: str,
        method: str,
        query: Dict[str, Any],
    ) -> Dict[str, Any]:
        if method == "GET" and path == "/api/sqlite/health":
            health = self.manager.initialize()
            health["capabilities"] = dict(self.CAPABILITIES)
            return health
        if method == "GET" and path == "/api/sqlite/session":
            return {
                "token": self._session_token,
                "capabilities": dict(self.CAPABILITIES),
            }
        if method == "GET" and path == "/api/sqlite/bootstrap":
            return self.manager.bootstrap()
        if method == "GET" and path == "/api/sqlite/explorer":
            raw_limit = self._query_value(query, "limit", "200")
            try:
                limit = int(raw_limit)
            except (TypeError, ValueError) as error:
                raise RepositoryError("INVALID_LIMIT", "limit must be an integer.") from error
            return self.repository.get_explorer_snapshot(
                query=str(self._query_value(query, "q", "")),
                limit=limit,
            )
        explorer_file_match = re.fullmatch(r"/api/sqlite/explorer/files/([^/]+)", path)
        if method == "GET" and explorer_file_match:
            return self.repository.get_explorer_file_entry(explorer_file_match.group(1))
        explorer_fma_match = re.fullmatch(r"/api/sqlite/explorer/files/([^/]+)/fma-preview", path)
        if method == "GET" and explorer_fma_match:
            return self.fma_preview_service.get_summary(explorer_fma_match.group(1))
        explorer_backup_match = re.fullmatch(r"/api/sqlite/explorer/backups/([^/]+)", path)
        if method == "GET" and explorer_backup_match:
            return self.backup_explorer_service.get_detail(explorer_backup_match.group(1))
        if method == "DELETE" and explorer_backup_match:
            payload = self._read_json(handler, max_bytes=64 * 1024)
            return self.backup_explorer_service.delete_backup(
                explorer_backup_match.group(1), payload.get("confirmation")
            )
        if method == "POST" and path == "/api/sqlite/maintenance/integrity-check":
            return self.manager.integrity_check()
        if method == "POST" and path == "/api/sqlite/backups/packages":
            return self.backup_package_service.create_package()
        if method == "POST" and path == "/api/sqlite/backups/packages/validate":
            payload = self._read_json(handler, max_bytes=1024 * 1024)
            package_path = self.backup_package_service.resolve_package_path(payload.get("fileName"))
            return self.backup_package_service.validate_package(package_path)
        if method == "POST" and path == "/api/sqlite/backups/restore/preview":
            content_type = str(handler.headers.get("Content-Type") or "").split(";", 1)[0].strip().lower()
            if content_type not in {
                "application/vnd.mdviewer.backup+zip",
                "application/octet-stream",
            }:
                raise RepositoryError(
                    "RESTORE_CONTENT_TYPE_INVALID",
                    "Restore preview requires a .mdpbackup binary upload.",
                    415,
                )
            return self.backup_package_service.stage_restore_preview(
                handler.rfile,
                handler.headers.get("Content-Length"),
                unquote(str(handler.headers.get("X-MDViewer-Backup-Name") or "backup.mdpbackup")),
            )
        if method == "POST" and path == "/api/sqlite/backups/restore/apply":
            payload = self._read_json(handler, max_bytes=1024 * 1024)
            return self.backup_package_service.apply_staged_restore(
                payload.get("importId"),
                payload.get("expectedPackageChecksumSha256"),
                payload.get("confirmation"),
            )
        if method == "POST" and path == "/api/sqlite/workfiles":
            content_type = str(handler.headers.get("Content-Type") or "").split(";", 1)[0].strip().lower()
            if content_type not in {
                "application/vnd.fma+zip",
                "application/vnd.fma-edit+json",
                "application/vnd.fma-ai-jena-preset+json",
                "text/markdown",
                "application/vnd.genslide.mpp+json",
                "application/vnd.openxmlformats-officedocument.presentationml.presentation",
                "image/png",
                "application/zip",
                "application/octet-stream",
            }:
                raise RepositoryError(
                    "WORK_FILE_CONTENT_TYPE_INVALID",
                    "Work file upload content type is not supported.",
                    415,
                )
            return self.work_file_service.save_upload(
                handler.rfile,
                handler.headers.get("Content-Length"),
                unquote(str(handler.headers.get("X-MDViewer-File-Name") or "")),
                handler.headers.get("X-MDViewer-Work-Type"),
                handler.headers.get("X-MDViewer-App"),
            )
        if method == "GET" and path == "/api/sqlite/workfiles":
            return self.work_file_service.list_files(
                app_id=self._query_value(query, "app", "fmaviewer"),
                query=self._query_value(query, "q", ""),
                work_type=self._query_value(query, "type"),
                limit=self._query_value(query, "limit", "100"),
            )
        model_match = re.fullmatch(r"/api/sqlite/models/([a-z0-9_]+)", path)
        if method == "GET" and model_match:
            return self.model_asset_service.get_model_status(model_match.group(1))
        if method == "POST" and model_match:
            content_type = str(handler.headers.get("Content-Type") or "").split(";", 1)[0].strip().lower()
            if content_type not in {"application/octet-stream", "application/onnx"}:
                raise RepositoryError(
                    "MODEL_CONTENT_TYPE_INVALID",
                    "ONNX model upload content type is not supported.",
                    415,
                )
            return self.model_asset_service.save_upload(
                handler.rfile,
                handler.headers.get("Content-Length"),
                unquote(str(handler.headers.get("X-MDViewer-File-Name") or "")),
                model_match.group(1),
            )
        if method == "POST" and path == "/api/sqlite/migrations/indexeddb/preview":
            return self.migration_service.preview(self._read_json(handler, max_bytes=50 * 1024 * 1024))
        if method == "POST" and path == "/api/sqlite/migrations/indexeddb/apply":
            return self.migration_service.apply(self._read_json(handler, max_bytes=50 * 1024 * 1024))

        if method == "GET" and path == "/api/sqlite/settings/resolved":
            return self.repository.get_resolved_settings(
                profile_id=self._query_value(query, "profileId"),
                workspace_id=self._query_value(query, "workspaceId"),
                document_id=self._query_value(query, "documentId"),
                feature_id=self._query_value(query, "featureId"),
            )
        if path == "/api/sqlite/settings":
            if method == "GET":
                return {
                    "items": self.repository.list_settings(
                        scope_type=self._query_value(query, "scopeType"),
                        scope_id=self._query_value(query, "scopeId"),
                        setting_group=self._query_value(query, "group"),
                    )
                }
            if method == "PUT":
                return self.repository.put_setting(self._read_json(handler, max_bytes=5 * 1024 * 1024))

        if method == "GET" and path == "/api/sqlite/documents":
            raw_limit = self._query_value(query, "limit", "200")
            try:
                limit = int(raw_limit)
            except (TypeError, ValueError) as error:
                raise RepositoryError("INVALID_LIMIT", "limit must be an integer.") from error
            items = self.repository.list_documents(
                folder_id=self._query_value(query, "folderId"),
                query=str(self._query_value(query, "q", "")),
                limit=limit,
            )
            return {"items": items, "limit": max(1, min(limit, 500))}
        if method == "GET" and path == "/api/sqlite/search":
            raw_limit = self._query_value(query, "limit", "100")
            try:
                limit = int(raw_limit)
            except (TypeError, ValueError) as error:
                raise RepositoryError("INVALID_LIMIT", "limit must be an integer.") from error
            normalized_query = str(self._query_value(query, "q", "")).strip()
            raw_types = str(self._query_value(query, "types", "document"))
            types = [item.strip().lower() for item in raw_types.split(",") if item.strip()]
            unsupported = [item for item in types if item not in {"document", "documents"}]
            if unsupported:
                raise RepositoryError("INVALID_SEARCH_TYPE", "Only document search is available.")
            items = self.repository.search_documents(
                query=normalized_query,
                folder_id=self._query_value(query, "folderId"),
                limit=limit,
            )
            return {
                "items": items,
                "query": normalized_query,
                "types": ["document"],
                "strategy": "like" if len(normalized_query) <= 2 else "fts5",
                "limit": max(1, min(limit, 200)),
            }
        if method == "POST" and path == "/api/sqlite/documents":
            return self.repository.create_document(self._read_json(handler))

        version_list_match = re.fullmatch(r"/api/sqlite/documents/([^/]+)/versions", path)
        if method == "GET" and version_list_match:
            return {"items": self.repository.list_document_versions(version_list_match.group(1))}

        restore_match = re.fullmatch(r"/api/sqlite/documents/([^/]+)/restore/(\d+)", path)
        if method == "POST" and restore_match:
            payload = self._read_json(handler)
            expected_version = payload.get("expectedVersion")
            if not isinstance(expected_version, int):
                raise RepositoryError("EXPECTED_VERSION_REQUIRED", "expectedVersion is required.")
            return self.repository.restore_document_version(
                restore_match.group(1),
                int(restore_match.group(2)),
                expected_version,
            )

        document_match = re.fullmatch(r"/api/sqlite/documents/([^/]+)", path)
        if document_match:
            document_id = document_match.group(1)
            if method == "GET":
                return self.repository.get_document(document_id)
            if method == "PUT":
                return self.repository.update_document(document_id, self._read_json(handler))
            if method == "DELETE":
                raw_version = self._query_value(query, "expectedVersion")
                try:
                    expected_version = int(raw_version)
                except (TypeError, ValueError) as error:
                    raise RepositoryError(
                        "EXPECTED_VERSION_REQUIRED", "expectedVersion query parameter is required."
                    ) from error
                return self.repository.soft_delete_document(document_id, expected_version)

        if method == "GET" and path == "/api/sqlite/folders/tree":
            return {"items": self.repository.list_folders()}
        if method == "POST" and path == "/api/sqlite/folders":
            return self.repository.create_folder(self._read_json(handler))

        folder_match = re.fullmatch(r"/api/sqlite/folders/([^/]+)", path)
        if folder_match:
            folder_id = folder_match.group(1)
            if method == "GET":
                return self.repository.get_folder(folder_id)
            if method == "PATCH":
                return self.repository.update_folder(folder_id, self._read_json(handler))
            if method == "DELETE":
                return self.repository.delete_folder(folder_id)
        raise KeyError(path)
