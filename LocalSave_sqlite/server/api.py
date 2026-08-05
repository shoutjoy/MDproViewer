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
from urllib.parse import parse_qs, urlsplit

from .database import (
    DatabaseConfigurationError,
    DatabaseInitializationError,
    DatabaseManager,
)
from .migrations import IndexedDbMigrationService
from .repositories import RepositoryError, StorageRepository


class SqliteApiRouter:
    PREFIX = "/api/sqlite/"
    CAPABILITIES = {
        "health": True,
        "bootstrap": True,
        "integrityCheck": True,
        "documents": True,
        "documentVersions": True,
        "folders": True,
        "settings": False,
        "search": True,
        "migration": False,
        "migrationPreview": True,
        "backup": False,
        "storageModeActivation": True,
    }

    def __init__(self, app_root: Path, manager: DatabaseManager | None = None) -> None:
        self.manager = manager or DatabaseManager(app_root)
        self.repository = StorageRepository(self.manager)
        self.migration_service = IndexedDbMigrationService(self.manager, self.repository)
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
            if method not in {"GET", "HEAD"} and not self._has_valid_session(handler):
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
    def _read_json(handler: Any, max_bytes: int = 10 * 1024 * 1024) -> Dict[str, Any]:
        raw_length = str(handler.headers.get("Content-Length") or "0")
        try:
            content_length = int(raw_length)
        except ValueError as error:
            raise RepositoryError("INVALID_CONTENT_LENGTH", "Content-Length is invalid.") from error
        if content_length < 0 or content_length > max_bytes:
            raise RepositoryError("REQUEST_TOO_LARGE", "JSON request exceeds 10 MB.", 413)
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
        if method == "POST" and path == "/api/sqlite/maintenance/integrity-check":
            return self.manager.integrity_check()
        if method == "POST" and path == "/api/sqlite/migrations/indexeddb/preview":
            return self.migration_service.preview(self._read_json(handler))

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
