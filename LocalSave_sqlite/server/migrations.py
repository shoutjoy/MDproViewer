"""Read-only preview for importing normalized legacy IndexedDB records."""

from __future__ import annotations

import hashlib
import json
import sqlite3
import time
import uuid
from typing import Any, Dict, List, Optional, Set

from .database import DatabaseManager
from .repositories import RepositoryError, StorageRepository
from .settings_policy import SENSITIVE_KEY_RE, SettingPolicyError, validate_setting


class IndexedDbMigrationService:
    """Compare a normalized browser batch with SQLite without writing data."""

    MAX_DOCUMENTS = 1000
    MAX_FOLDERS = 1000
    MAX_FILES = 5000
    MAX_FILE_PATH_LENGTH = 2048
    MAX_FILE_CONTENT_BYTES = 20 * 1024 * 1024
    LEGACY_FILE_SOURCE_ID = "source_mdpro_indb_v1"

    def __init__(self, manager: DatabaseManager, repository: StorageRepository) -> None:
        self.manager = manager
        self.repository = repository

    @staticmethod
    def _checksum(content: str) -> str:
        return hashlib.sha256(content.encode("utf-8")).hexdigest()

    @staticmethod
    def _now_ms() -> int:
        return int(time.time() * 1000)

    @staticmethod
    def _safe_timestamp(value: Any, fallback: int) -> int:
        try:
            timestamp = int(value)
        except (TypeError, ValueError):
            return fallback
        return timestamp if timestamp > 0 else fallback

    @staticmethod
    def _word_count(content: str) -> int:
        return len([part for part in content.split() if part])

    @staticmethod
    def _batch_fingerprint(payload: Dict[str, Any]) -> str:
        canonical = {
            "source": payload.get("source") if isinstance(payload.get("source"), dict) else {},
            "folders": payload.get("folders") if isinstance(payload.get("folders"), list) else [],
            "documents": payload.get("documents") if isinstance(payload.get("documents"), list) else [],
            "fileSource": payload.get("fileSource") if isinstance(payload.get("fileSource"), dict) else None,
            "files": payload.get("files") if isinstance(payload.get("files"), list) else [],
            "settings": payload.get("settings") if isinstance(payload.get("settings"), list) else [],
            "settingsClassification": payload.get("settingsClassification")
            if isinstance(payload.get("settingsClassification"), dict) else {},
        }
        encoded = json.dumps(
            canonical, ensure_ascii=False, sort_keys=True, separators=(",", ":")
        ).encode("utf-8")
        return hashlib.sha256(encoded).hexdigest()

    @staticmethod
    def _migration_id(fingerprint: str) -> str:
        return f"indb_{fingerprint[:24]}"

    @staticmethod
    def _checkpoint_key(migration_id: str) -> str:
        return f"indexeddb_migration:{migration_id}"

    @staticmethod
    def _excluded(kind: str, index: int, reason: str, record_id: str = "") -> Dict[str, Any]:
        return {
            "kind": kind,
            "sourceIndex": index,
            "id": record_id,
            "status": "excluded",
            "reason": reason,
        }

    @staticmethod
    def _status_counts(items: List[Dict[str, Any]]) -> Dict[str, int]:
        result = {"source": len(items), "new": 0, "duplicate": 0, "conflict": 0, "excluded": 0}
        for item in items:
            status = str(item.get("status") or "excluded")
            if status in result:
                result[status] += 1
            else:
                result["excluded"] += 1
        return result

    def _load_current(self) -> tuple[Dict[str, Dict[str, Any]], Dict[str, Dict[str, Any]]]:
        with self.manager.connection() as connection:
            folders = {
                str(row["id"]): dict(row)
                for row in connection.execute(
                    """
                    SELECT id, parent_id, name
                    FROM folders
                    WHERE workspace_id = ? AND deleted_at IS NULL
                    """,
                    (self.manager.DEFAULT_WORKSPACE_ID,),
                )
            }
            documents = {
                str(row["id"]): dict(row)
                for row in connection.execute(
                    """
                    SELECT id, folder_id, title, content, checksum, version
                    FROM documents
                    WHERE workspace_id = ? AND deleted_at IS NULL
                    """,
                    (self.manager.DEFAULT_WORKSPACE_ID,),
                )
            }
        return folders, documents

    def _load_current_files(
        self,
    ) -> tuple[Optional[Dict[str, Any]], Dict[str, Dict[str, Any]]]:
        with self.manager.connection() as connection:
            source_row = connection.execute(
                """
                SELECT id, source_type, name, root_uri, config_json
                FROM workspace_sources
                WHERE id = ? AND workspace_id = ?
                """,
                (self.LEGACY_FILE_SOURCE_ID, self.manager.DEFAULT_WORKSPACE_ID),
            ).fetchone()
            entries = {
                str(row["path"]): dict(row)
                for row in connection.execute(
                    """
                    SELECT id, entry_type, path, name, extension, mime_type,
                           size_bytes, modified_at, checksum
                    FROM file_entries
                    WHERE source_id = ? AND deleted_at IS NULL
                    """,
                    (self.LEGACY_FILE_SOURCE_ID,),
                )
            }
        return (dict(source_row) if source_row else None), entries

    def _load_current_settings(self) -> Dict[tuple[str, str, str, str], Dict[str, Any]]:
        with self.manager.connection() as connection:
            rows = connection.execute(
                """
                SELECT scope_type, scope_id, setting_group, setting_key,
                       value_json, value_type
                FROM settings
                """
            ).fetchall()
        return {
            (
                str(row["scope_type"]), str(row["scope_id"]),
                str(row["setting_group"]), str(row["setting_key"]),
            ): dict(row)
            for row in rows
        }

    def _normalize_settings(
        self,
        raw_settings: List[Any],
        current_settings: Dict[tuple[str, str, str, str], Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        items: List[Dict[str, Any]] = []
        seen: Set[tuple[str, str, str, str]] = set()
        for index, raw in enumerate(raw_settings):
            raw_key = str(raw.get("key") or "").strip() if isinstance(raw, dict) else ""
            if not isinstance(raw, dict):
                items.append(self._excluded("setting", index, "INVALID_RECORD"))
                continue
            try:
                setting = validate_setting(
                    raw_key,
                    raw.get("value"),
                    scope_type=raw.get("scopeType"),
                    scope_id=raw.get("scopeId"),
                    profile_id=self.manager.DEFAULT_PROFILE_ID,
                    workspace_id=self.manager.DEFAULT_WORKSPACE_ID,
                )
            except SettingPolicyError as error:
                items.append(self._excluded("setting", index, error.code, raw_key))
                continue
            identity = (
                setting["scopeType"], setting["scopeId"],
                setting["group"], setting["key"],
            )
            if identity in seen:
                items.append(self._excluded("setting", index, "DUPLICATE_SOURCE_SETTING", raw_key))
                continue
            seen.add(identity)
            item = {
                "kind": "setting",
                "sourceIndex": index,
                "scopeType": setting["scopeType"],
                "scopeId": setting["scopeId"],
                "group": setting["group"],
                "key": setting["key"],
                "id": setting["key"],
                "valueType": setting["valueType"],
                "status": "new",
                "reason": "NOT_IN_SQLITE",
            }
            current = current_settings.get(identity)
            if current:
                try:
                    current_value = json.loads(str(current.get("value_json") or "null"))
                except json.JSONDecodeError:
                    current_value = object()
                same = (
                    current_value == setting["value"]
                    and str(current.get("value_type") or "") == setting["valueType"]
                )
                item["status"] = "duplicate" if same else "conflict"
                item["reason"] = "SAME_SCOPE_KEY_AND_VALUE" if same else "SETTING_VALUE_CONFLICT"
            items.append(item)
        return items

    @staticmethod
    def _settings_classification(payload: Dict[str, Any]) -> Dict[str, Any]:
        raw = payload.get("settingsClassification")
        source = raw if isinstance(raw, dict) else {}

        def names(field: str, sensitive_only: bool = False) -> List[str]:
            values = source.get(field)
            if not isinstance(values, list):
                return []
            result: List[str] = []
            for value in values[:200]:
                name = str(value or "").strip()[:128]
                if not name or name in result:
                    continue
                if sensitive_only and not SENSITIVE_KEY_RE.search(name):
                    continue
                result.append(name)
            return result

        safe_keys = names("safeKeys")
        sensitive_keys = names("sensitiveKeys", sensitive_only=True)
        transient_keys = names("transientKeys")
        unknown_keys = names("unknownKeys")
        missing_secrets = names("missingSecrets", sensitive_only=True)
        return {
            "safeKeys": safe_keys,
            "sensitiveKeys": sensitive_keys,
            "transientKeys": transient_keys,
            "unknownKeys": unknown_keys,
            "missingSecrets": missing_secrets,
            "counts": {
                "safe": len(safe_keys),
                "sensitive": len(sensitive_keys),
                "transient": len(transient_keys),
                "unknown": len(unknown_keys),
            },
        }

    def _normalize_folders(
        self,
        raw_folders: List[Any],
        current_folders: Dict[str, Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        items: List[Dict[str, Any]] = []
        normalized: Dict[str, Dict[str, Any]] = {}
        seen_ids: Set[str] = set()

        for index, raw in enumerate(raw_folders):
            if not isinstance(raw, dict):
                items.append(self._excluded("folder", index, "INVALID_RECORD"))
                continue
            raw_id = str(raw.get("id") or "").strip()
            try:
                folder_id = self.repository._validate_id(raw_id, "folderId")
                name = "ROOT" if folder_id == self.manager.ROOT_FOLDER_ID else self.repository._validate_title(raw.get("name"))
                parent_value = raw.get("parentId")
                if folder_id == self.manager.ROOT_FOLDER_ID:
                    parent_id: Optional[str] = None
                else:
                    parent_id = self.repository._validate_id(
                        parent_value or self.manager.ROOT_FOLDER_ID, "parentId"
                    )
            except RepositoryError as error:
                items.append(self._excluded("folder", index, error.code, raw_id))
                continue
            if folder_id in seen_ids:
                items.append(self._excluded("folder", index, "DUPLICATE_SOURCE_ID", folder_id))
                continue
            seen_ids.add(folder_id)
            item = {
                "kind": "folder",
                "sourceIndex": index,
                "id": folder_id,
                "name": name,
                "parentId": parent_id,
                "status": "new",
                "reason": "NOT_IN_SQLITE",
            }
            normalized[folder_id] = item
            items.append(item)

        current_name_keys = {
            (row.get("parent_id"), str(row.get("name") or "")): folder_id
            for folder_id, row in current_folders.items()
        }
        incoming_name_groups: Dict[tuple[Optional[str], str], List[Dict[str, Any]]] = {}
        for item in normalized.values():
            current = current_folders.get(item["id"])
            if current:
                same = str(current.get("name") or "") == item["name"] and current.get("parent_id") == item["parentId"]
                item["status"] = "duplicate" if same else "conflict"
                item["reason"] = "SAME_ID_AND_CONTENT" if same else "FOLDER_ID_CONFLICT"
                item["current"] = {
                    "name": str(current.get("name") or ""),
                    "parentId": current.get("parent_id"),
                }
                continue
            name_key = (item["parentId"], item["name"])
            conflicting_id = current_name_keys.get(name_key)
            if conflicting_id:
                item["status"] = "conflict"
                item["reason"] = "FOLDER_NAME_CONFLICT"
                item["currentId"] = conflicting_id
                continue
            incoming_name_groups.setdefault(name_key, []).append(item)

        for group in incoming_name_groups.values():
            if len(group) > 1:
                for item in group:
                    item["status"] = "conflict"
                    item["reason"] = "SOURCE_FOLDER_NAME_CONFLICT"

        def parent_is_blocked(item: Dict[str, Any]) -> bool:
            parent_id = item.get("parentId")
            if not parent_id or parent_id in current_folders:
                return False
            parent = normalized.get(str(parent_id))
            return not parent or parent.get("status") not in {"new", "duplicate"}

        changed = True
        while changed:
            changed = False
            for item in normalized.values():
                if item.get("status") != "new":
                    continue
                if item.get("parentId") == item.get("id"):
                    item["status"] = "excluded"
                    item["reason"] = "FOLDER_CYCLE"
                    changed = True
                elif parent_is_blocked(item):
                    item["status"] = "excluded"
                    item["reason"] = "PARENT_FOLDER_UNRESOLVED"
                    changed = True

        def has_cycle(folder_id: str) -> bool:
            visited: Set[str] = set()
            current_id = folder_id
            while current_id in normalized:
                if current_id in visited:
                    return True
                visited.add(current_id)
                parent_id = normalized[current_id].get("parentId")
                if not parent_id or parent_id in current_folders:
                    return False
                current_id = str(parent_id)
            return False

        cycle_ids = [item["id"] for item in normalized.values() if item.get("status") == "new" and has_cycle(item["id"])]
        for folder_id in cycle_ids:
            normalized[folder_id]["status"] = "excluded"
            normalized[folder_id]["reason"] = "FOLDER_CYCLE"
        if cycle_ids:
            changed = True
            while changed:
                changed = False
                for item in normalized.values():
                    if item.get("status") == "new" and parent_is_blocked(item):
                        item["status"] = "excluded"
                        item["reason"] = "PARENT_FOLDER_UNRESOLVED"
                        changed = True
        return items

    def _normalize_documents(
        self,
        raw_documents: List[Any],
        current_documents: Dict[str, Dict[str, Any]],
        current_folders: Dict[str, Dict[str, Any]],
        folder_items: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        items: List[Dict[str, Any]] = []
        seen_ids: Set[str] = set()
        folder_status: Dict[str, str] = {}
        for item in folder_items:
            folder_id = str(item.get("id") or "")
            if folder_id and folder_id not in folder_status:
                folder_status[folder_id] = str(item.get("status") or "excluded")
        available_folder_ids = set(current_folders)
        available_folder_ids.update(
            folder_id for folder_id, status in folder_status.items() if status in {"new", "duplicate"}
        )

        for index, raw in enumerate(raw_documents):
            if not isinstance(raw, dict):
                items.append(self._excluded("document", index, "INVALID_RECORD"))
                continue
            raw_id = str(raw.get("id") or "").strip()
            try:
                document_id = self.repository._validate_id(raw_id, "documentId")
                title = self.repository._validate_title(raw.get("title"))
                content = self.repository._validate_content(raw.get("content"))
                folder_id = self.repository._validate_id(
                    raw.get("folderId") or self.manager.ROOT_FOLDER_ID, "folderId"
                )
            except RepositoryError as error:
                items.append(self._excluded("document", index, error.code, raw_id))
                continue
            if document_id in seen_ids:
                items.append(self._excluded("document", index, "DUPLICATE_SOURCE_ID", document_id))
                continue
            seen_ids.add(document_id)
            checksum = self._checksum(content)
            supplied_checksum = str(raw.get("checksum") or "").lower()
            item: Dict[str, Any] = {
                "kind": "document",
                "sourceIndex": index,
                "id": document_id,
                "title": title,
                "folderId": folder_id,
                "checksum": checksum,
                "status": "new",
                "reason": "NOT_IN_SQLITE",
            }
            if supplied_checksum and supplied_checksum != checksum:
                item["status"] = "excluded"
                item["reason"] = "CHECKSUM_MISMATCH"
                items.append(item)
                continue
            if folder_status.get(folder_id) in {"conflict", "excluded"}:
                item["status"] = "excluded"
                item["reason"] = "FOLDER_MAPPING_UNRESOLVED"
                items.append(item)
                continue
            if folder_id not in available_folder_ids:
                item["status"] = "excluded"
                item["reason"] = "FOLDER_NOT_FOUND"
                items.append(item)
                continue
            current = current_documents.get(document_id)
            if current:
                current_checksum = str(current.get("checksum") or "") or self._checksum(str(current.get("content") or ""))
                same = (
                    current_checksum == checksum
                    and str(current.get("title") or "") == title
                    and str(current.get("folder_id") or self.manager.ROOT_FOLDER_ID) == folder_id
                )
                item["status"] = "duplicate" if same else "conflict"
                item["reason"] = "SAME_ID_AND_CONTENT" if same else "DOCUMENT_ID_CONFLICT"
                item["current"] = {
                    "title": str(current.get("title") or ""),
                    "folderId": current.get("folder_id"),
                    "checksum": current_checksum,
                    "version": int(current.get("version") or 1),
                }
            items.append(item)
        return items

    @classmethod
    def _normalize_file_path(cls, value: Any) -> str:
        path = str(value or "").replace("\\", "/").strip().strip("/")
        while "//" in path:
            path = path.replace("//", "/")
        if not path or len(path) > cls.MAX_FILE_PATH_LENGTH or "\x00" in path:
            raise RepositoryError("INVALID_FILE_PATH", "File path is invalid.")
        parts = path.split("/")
        if any(not part or part in {".", ".."} or len(part) > 255 for part in parts):
            raise RepositoryError("INVALID_FILE_PATH", "File path contains an invalid segment.")
        return path

    @staticmethod
    def _file_entry_id(entry_type: str, path: str) -> str:
        digest = hashlib.sha256(f"{entry_type}:{path}".encode("utf-8")).hexdigest()[:32]
        return f"legacy_{entry_type}_{digest}"

    @staticmethod
    def _file_mime_type(extension: str) -> str:
        return {
            "md": "text/markdown",
            "markdown": "text/markdown",
            "txt": "text/plain",
            "html": "text/html",
            "htm": "text/html",
            "css": "text/css",
            "js": "text/javascript",
            "json": "application/json",
            "csv": "text/csv",
            "xml": "application/xml",
            "svg": "image/svg+xml",
            "mmd": "text/plain",
        }.get(extension.lower(), "text/plain")

    def _normalize_file_source(
        self,
        raw_source: Any,
        current_source: Optional[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        if raw_source is None:
            return []
        if not isinstance(raw_source, dict):
            return [self._excluded("fileSource", 0, "INVALID_RECORD")]
        raw_id = str(raw_source.get("id") or "").strip()
        try:
            source_id = self.repository._validate_id(raw_id, "sourceId")
            name = self.repository._validate_title(raw_source.get("name") or "inDB 파일 백업")
        except RepositoryError as error:
            return [self._excluded("fileSource", 0, error.code, raw_id)]
        if source_id != self.LEGACY_FILE_SOURCE_ID:
            return [self._excluded("fileSource", 0, "UNSUPPORTED_FILE_SOURCE_ID", source_id)]
        root_uri = str(raw_source.get("rootUri") or "indexeddb://mdpro-indb-v1/files")[:2048]
        item: Dict[str, Any] = {
            "kind": "fileSource",
            "sourceIndex": 0,
            "id": source_id,
            "name": name,
            "rootUri": root_uri,
            "status": "new",
            "reason": "NOT_IN_SQLITE",
        }
        if current_source:
            same = (
                str(current_source.get("source_type") or "") == "legacy_indb"
                and str(current_source.get("root_uri") or "") == root_uri
            )
            item["status"] = "duplicate" if same else "conflict"
            item["reason"] = "SAME_SOURCE" if same else "FILE_SOURCE_ID_CONFLICT"
        return [item]

    def _normalize_file_entries(
        self,
        raw_files: List[Any],
        source_items: List[Dict[str, Any]],
        current_entries: Dict[str, Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        source_status = source_items[0].get("status") if source_items else "excluded"
        file_items: List[Dict[str, Any]] = []
        seen_paths: Set[str] = set()

        for index, raw in enumerate(raw_files):
            if not isinstance(raw, dict):
                file_items.append(self._excluded("file", index, "INVALID_RECORD"))
                continue
            raw_path = str(raw.get("path") or "")
            try:
                path = self._normalize_file_path(raw_path)
                content = str(raw.get("content") if raw.get("content") is not None else "")
                content_bytes = content.encode("utf-8")
                if len(content_bytes) > self.MAX_FILE_CONTENT_BYTES:
                    raise RepositoryError("FILE_CONTENT_TOO_LARGE", "File content exceeds 20 MB.", 413)
            except RepositoryError as error:
                file_items.append(self._excluded("file", index, error.code, raw_path[:128]))
                continue
            if path in seen_paths:
                file_items.append(self._excluded("file", index, "DUPLICATE_SOURCE_PATH", path))
                continue
            seen_paths.add(path)
            name = path.rsplit("/", 1)[-1]
            extension = str(raw.get("extension") or (name.rsplit(".", 1)[-1] if "." in name else ""))
            extension = extension.lower().lstrip(".")[:50]
            checksum = self._checksum(content)
            supplied_checksum = str(raw.get("checksum") or "").lower()
            supplied_size = raw.get("sizeBytes")
            item: Dict[str, Any] = {
                "kind": "file",
                "sourceIndex": index,
                "id": self._file_entry_id("file", path),
                "path": path,
                "name": name,
                "extension": extension or None,
                "mimeType": self._file_mime_type(extension),
                "sizeBytes": len(content_bytes),
                "checksum": checksum,
                "modifiedAt": self._safe_timestamp(raw.get("modifiedAt"), 0) or None,
                "status": "new",
                "reason": "NOT_IN_SQLITE",
            }
            if supplied_checksum and supplied_checksum != checksum:
                item["status"] = "excluded"
                item["reason"] = "CHECKSUM_MISMATCH"
            elif supplied_size is not None:
                try:
                    if int(supplied_size) != len(content_bytes):
                        item["status"] = "excluded"
                        item["reason"] = "SIZE_MISMATCH"
                except (TypeError, ValueError):
                    item["status"] = "excluded"
                    item["reason"] = "INVALID_SIZE"
            if source_status not in {"new", "duplicate"}:
                item["status"] = "excluded"
                item["reason"] = "FILE_SOURCE_UNRESOLVED"
            file_items.append(item)

        folder_paths: Set[str] = set()
        valid_file_paths = {
            str(item["path"])
            for item in file_items
            if item.get("path") and item.get("status") not in {"excluded"}
        }
        for path in valid_file_paths:
            parts = path.split("/")[:-1]
            for depth in range(1, len(parts) + 1):
                folder_paths.add("/".join(parts[:depth]))

        folder_items: List[Dict[str, Any]] = []
        for folder_path in sorted(folder_paths, key=lambda value: (value.count("/"), value)):
            parent_path = folder_path.rsplit("/", 1)[0] if "/" in folder_path else ""
            folder_items.append(
                {
                    "kind": "fileFolder",
                    "sourceIndex": -1,
                    "id": self._file_entry_id("folder", folder_path),
                    "path": folder_path,
                    "name": folder_path.rsplit("/", 1)[-1],
                    "parentPath": parent_path or None,
                    "status": "new",
                    "reason": "DERIVED_FROM_FILE_PATH",
                }
            )

        folder_by_path = {str(item["path"]): item for item in folder_items}
        file_by_path = {
            str(item["path"]): item for item in file_items if item.get("path")
        }
        for collision_path in set(folder_by_path).intersection(file_by_path):
            folder_by_path[collision_path]["status"] = "conflict"
            folder_by_path[collision_path]["reason"] = "SOURCE_PATH_TYPE_CONFLICT"
            file_by_path[collision_path]["status"] = "conflict"
            file_by_path[collision_path]["reason"] = "SOURCE_PATH_TYPE_CONFLICT"

        for item in folder_items + file_items:
            if item.get("status") != "new":
                continue
            current = current_entries.get(str(item.get("path") or ""))
            if not current:
                continue
            if item["kind"] == "fileFolder":
                same = str(current.get("entry_type") or "") == "folder"
            else:
                same = (
                    str(current.get("entry_type") or "") == "file"
                    and str(current.get("checksum") or "") == str(item.get("checksum") or "")
                )
            item["status"] = "duplicate" if same else "conflict"
            item["reason"] = "SAME_PATH_AND_CONTENT" if same else "FILE_PATH_CONFLICT"
            item["current"] = {
                "id": current.get("id"),
                "entryType": current.get("entry_type"),
                "checksum": current.get("checksum"),
            }

        return folder_items + file_items

    def preview(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        if not isinstance(payload, dict):
            raise RepositoryError("INVALID_PAYLOAD", "Migration preview payload must be an object.")
        raw_folders = payload.get("folders")
        raw_documents = payload.get("documents")
        if not isinstance(raw_folders, list) or not isinstance(raw_documents, list):
            raise RepositoryError("INVALID_MIGRATION_BATCH", "folders and documents must be arrays.")
        raw_file_source = payload.get("fileSource")
        raw_files = payload.get("files", [])
        raw_settings = payload.get("settings", [])
        if not isinstance(raw_files, list):
            raise RepositoryError("INVALID_MIGRATION_BATCH", "files must be an array.")
        if not isinstance(raw_settings, list):
            raise RepositoryError("INVALID_MIGRATION_BATCH", "settings must be an array.")
        if raw_files and not isinstance(raw_file_source, dict):
            raise RepositoryError("INVALID_MIGRATION_BATCH", "fileSource is required when files are present.")
        if len(raw_folders) > self.MAX_FOLDERS or len(raw_documents) > self.MAX_DOCUMENTS:
            raise RepositoryError("MIGRATION_BATCH_TOO_LARGE", "Migration preview batch is too large.", 413)
        if len(raw_files) > self.MAX_FILES:
            raise RepositoryError("MIGRATION_BATCH_TOO_LARGE", "File migration batch is too large.", 413)
        if len(raw_settings) > 500:
            raise RepositoryError("MIGRATION_BATCH_TOO_LARGE", "Settings migration batch is too large.", 413)

        current_folders, current_documents = self._load_current()
        current_file_source, current_file_entries = self._load_current_files()
        current_settings = self._load_current_settings()
        folder_items = self._normalize_folders(raw_folders, current_folders)
        document_items = self._normalize_documents(
            raw_documents, current_documents, current_folders, folder_items
        )
        file_source_items = self._normalize_file_source(raw_file_source, current_file_source)
        file_entry_items = self._normalize_file_entries(
            raw_files, file_source_items, current_file_entries
        ) if raw_file_source is not None else []
        setting_items = self._normalize_settings(raw_settings, current_settings)
        folder_counts = self._status_counts(folder_items)
        document_counts = self._status_counts(document_items)
        file_source_counts = self._status_counts(file_source_items)
        file_entry_counts = self._status_counts(file_entry_items)
        setting_counts = self._status_counts(setting_items)
        settings_classification = self._settings_classification(payload)
        summary = {
            "sourceCount": folder_counts["source"] + document_counts["source"] + file_source_counts["source"] + file_entry_counts["source"] + setting_counts["source"],
            "newCount": folder_counts["new"] + document_counts["new"] + file_source_counts["new"] + file_entry_counts["new"] + setting_counts["new"],
            "duplicateCount": folder_counts["duplicate"] + document_counts["duplicate"] + file_source_counts["duplicate"] + file_entry_counts["duplicate"] + setting_counts["duplicate"],
            "conflictCount": folder_counts["conflict"] + document_counts["conflict"] + file_source_counts["conflict"] + file_entry_counts["conflict"] + setting_counts["conflict"],
            "excludedCount": folder_counts["excluded"] + document_counts["excluded"] + file_source_counts["excluded"] + file_entry_counts["excluded"] + setting_counts["excluded"],
            "folders": folder_counts,
            "documents": document_counts,
            "fileSources": file_source_counts,
            "fileEntries": file_entry_counts,
            "settings": setting_counts,
            "settingsClassification": settings_classification["counts"],
            "missingSecrets": settings_classification["missingSecrets"],
            "sourceFiles": len(raw_files),
            "generatedFileFolders": len([item for item in file_entry_items if item.get("kind") == "fileFolder"]),
        }
        source = payload.get("source") if isinstance(payload.get("source"), dict) else {}
        try:
            source_version = int(source.get("version") or 0)
        except (TypeError, ValueError):
            source_version = 0
        try:
            file_source_version = int(source.get("fileVersion") or 0)
        except (TypeError, ValueError):
            file_source_version = 0
        fingerprint = self._batch_fingerprint(payload)
        return {
            "previewOnly": True,
            "batchFingerprint": fingerprint,
            "migrationId": self._migration_id(fingerprint),
            "source": {
                "database": str(source.get("database") or "MarkdownProDB")[:100],
                "version": source_version,
                "fileDatabase": str(source.get("fileDatabase") or "")[:100] or None,
                "fileVersion": file_source_version,
            },
            "summary": summary,
            "items": {
                "folders": folder_items,
                "documents": document_items,
                "fileSources": file_source_items,
                "fileEntries": file_entry_items,
                "settings": setting_items,
            },
            "settingsClassification": settings_classification,
        }

    def _load_checkpoint(self, migration_id: str) -> Optional[Dict[str, Any]]:
        key = self._checkpoint_key(migration_id)
        with self.manager.connection() as connection:
            row = connection.execute(
                "SELECT value_json FROM app_meta WHERE key = ?", (key,)
            ).fetchone()
        if not row:
            return None
        try:
            value = json.loads(str(row["value_json"] or "{}"))
        except json.JSONDecodeError:
            return None
        return value if isinstance(value, dict) else None

    def _save_checkpoint(
        self,
        migration_id: str,
        checkpoint: Dict[str, Any],
        connection: Optional[sqlite3.Connection] = None,
    ) -> None:
        key = self._checkpoint_key(migration_id)
        encoded = json.dumps(checkpoint, ensure_ascii=False, separators=(",", ":"))
        updated_at = self._now_ms()
        sql = """
            INSERT INTO app_meta (key, value_json, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET
                value_json = excluded.value_json,
                updated_at = excluded.updated_at
        """
        if connection is not None:
            connection.execute(sql, (key, encoded, updated_at))
            return
        with self.manager.write_transaction() as checkpoint_connection:
            checkpoint_connection.execute(sql, (key, encoded, updated_at))

    def _ordered_new_folders(
        self,
        folder_items: List[Dict[str, Any]],
        current_folder_ids: Set[str],
    ) -> List[Dict[str, Any]]:
        pending = {
            str(item["id"]): item
            for item in folder_items
            if item.get("status") == "new"
        }
        ordered: List[Dict[str, Any]] = []
        available = set(current_folder_ids)
        while pending:
            ready = [
                item for item in pending.values()
                if not item.get("parentId") or str(item.get("parentId")) in available
            ]
            if not ready:
                raise RepositoryError(
                    "MIGRATION_FOLDER_RELATION_INVALID",
                    "Migration folders cannot be ordered by their parent relationships.",
                    409,
                )
            ready.sort(key=lambda item: (int(item.get("sourceIndex") or 0), str(item.get("id"))))
            for item in ready:
                ordered.append(item)
                available.add(str(item["id"]))
                pending.pop(str(item["id"]), None)
        return ordered

    def _verify_applied_records(
        self,
        connection: sqlite3.Connection,
        folder_items: List[Dict[str, Any]],
        document_items: List[Dict[str, Any]],
        new_document_ids: Set[str],
    ) -> Dict[str, int]:
        verified_folders = 0
        verified_documents = 0
        for item in folder_items:
            if item.get("status") not in {"new", "duplicate"}:
                continue
            row = connection.execute(
                """
                SELECT name, parent_id FROM folders
                WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL
                """,
                (item["id"], self.manager.DEFAULT_WORKSPACE_ID),
            ).fetchone()
            if not row or str(row["name"]) != str(item["name"]) or row["parent_id"] != item.get("parentId"):
                raise RepositoryError(
                    "MIGRATION_FOLDER_VERIFY_FAILED",
                    f"Migrated folder verification failed: {item['id']}",
                    409,
                )
            verified_folders += 1

        for item in document_items:
            if item.get("status") not in {"new", "duplicate"}:
                continue
            row = connection.execute(
                """
                SELECT title, folder_id, checksum, version FROM documents
                WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL
                """,
                (item["id"], self.manager.DEFAULT_WORKSPACE_ID),
            ).fetchone()
            if (
                not row
                or str(row["title"]) != str(item["title"])
                or str(row["folder_id"] or self.manager.ROOT_FOLDER_ID) != str(item["folderId"])
                or str(row["checksum"] or "") != str(item["checksum"])
            ):
                raise RepositoryError(
                    "MIGRATION_DOCUMENT_VERIFY_FAILED",
                    f"Migrated document verification failed: {item['id']}",
                    409,
                )
            if str(item["id"]) in new_document_ids:
                version = connection.execute(
                    """
                    SELECT checksum FROM document_versions
                    WHERE document_id = ? AND version_no = 1
                    """,
                    (item["id"],),
                ).fetchone()
                if not version or str(version["checksum"] or "") != str(item["checksum"]):
                    raise RepositoryError(
                        "MIGRATION_VERSION_VERIFY_FAILED",
                        f"Initial migrated version verification failed: {item['id']}",
                        409,
                    )
            verified_documents += 1
        return {"folders": verified_folders, "documents": verified_documents}

    def _verify_applied_files(
        self,
        connection: sqlite3.Connection,
        source_items: List[Dict[str, Any]],
        file_entry_items: List[Dict[str, Any]],
    ) -> Dict[str, int]:
        verified_sources = 0
        verified_file_folders = 0
        verified_files = 0
        for item in source_items:
            if item.get("status") not in {"new", "duplicate"}:
                continue
            row = connection.execute(
                """
                SELECT source_type, root_uri FROM workspace_sources
                WHERE id = ? AND workspace_id = ?
                """,
                (item["id"], self.manager.DEFAULT_WORKSPACE_ID),
            ).fetchone()
            if (
                not row
                or str(row["source_type"] or "") != "legacy_indb"
                or str(row["root_uri"] or "") != str(item["rootUri"])
            ):
                raise RepositoryError(
                    "MIGRATION_FILE_SOURCE_VERIFY_FAILED",
                    "Migrated legacy file source verification failed.",
                    409,
                )
            verified_sources += 1

        for item in file_entry_items:
            if item.get("status") not in {"new", "duplicate"}:
                continue
            row = connection.execute(
                """
                SELECT entry_type, path, name, size_bytes, checksum
                FROM file_entries
                WHERE source_id = ? AND path = ? AND deleted_at IS NULL
                """,
                (self.LEGACY_FILE_SOURCE_ID, item["path"]),
            ).fetchone()
            expected_type = "folder" if item.get("kind") == "fileFolder" else "file"
            if not row or str(row["entry_type"] or "") != expected_type or str(row["name"] or "") != str(item["name"]):
                raise RepositoryError(
                    "MIGRATION_FILE_ENTRY_VERIFY_FAILED",
                    f"Migrated file entry verification failed: {item['path']}",
                    409,
                )
            if expected_type == "file" and (
                str(row["checksum"] or "") != str(item.get("checksum") or "")
                or int(row["size_bytes"] or 0) != int(item.get("sizeBytes") or 0)
            ):
                raise RepositoryError(
                    "MIGRATION_FILE_CHECKSUM_VERIFY_FAILED",
                    f"Migrated file checksum verification failed: {item['path']}",
                    409,
                )
            if expected_type == "folder":
                verified_file_folders += 1
            else:
                verified_files += 1
        return {
            "fileSources": verified_sources,
            "fileFolders": verified_file_folders,
            "files": verified_files,
        }

    def _verify_applied_settings(
        self,
        connection: sqlite3.Connection,
        setting_items: List[Dict[str, Any]],
        normalized_settings: Dict[tuple[str, str, str, str], Dict[str, Any]],
    ) -> int:
        verified = 0
        for item in setting_items:
            if item.get("status") not in {"new", "duplicate"}:
                continue
            identity = (
                str(item["scopeType"]), str(item["scopeId"]),
                str(item["group"]), str(item["key"]),
            )
            expected = normalized_settings.get(identity)
            row = connection.execute(
                """
                SELECT value_json, value_type FROM settings
                WHERE scope_type = ? AND scope_id = ?
                  AND setting_group = ? AND setting_key = ?
                """,
                identity,
            ).fetchone()
            if not expected or not row:
                raise RepositoryError(
                    "MIGRATION_SETTING_VERIFY_FAILED",
                    f"Migrated setting verification failed: {item['key']}",
                    409,
                )
            try:
                stored_value = json.loads(str(row["value_json"]))
            except json.JSONDecodeError as error:
                raise RepositoryError(
                    "MIGRATION_SETTING_VERIFY_FAILED",
                    f"Migrated setting JSON verification failed: {item['key']}",
                    409,
                ) from error
            if stored_value != expected["value"] or str(row["value_type"]) != expected["valueType"]:
                raise RepositoryError(
                    "MIGRATION_SETTING_VERIFY_FAILED",
                    f"Migrated setting value verification failed: {item['key']}",
                    409,
                )
            verified += 1
        return verified

    def apply(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        if not isinstance(payload, dict):
            raise RepositoryError("INVALID_PAYLOAD", "Migration apply payload must be an object.")
        fingerprint = self._batch_fingerprint(payload)
        supplied_fingerprint = str(payload.get("previewFingerprint") or "")
        if not supplied_fingerprint or supplied_fingerprint != fingerprint:
            raise RepositoryError(
                "MIGRATION_PREVIEW_STALE",
                "Migration data changed after preview. Run preview again.",
                409,
            )
        migration_id = self._migration_id(fingerprint)
        supplied_migration_id = str(payload.get("migrationId") or migration_id)
        if supplied_migration_id != migration_id:
            raise RepositoryError("INVALID_MIGRATION_ID", "Migration ID does not match the batch.")

        with self.manager.exclusive_write():
            preview = self.preview(payload)
            summary = preview["summary"]
            if int(summary["conflictCount"]) > 0 or int(summary["excludedCount"]) > 0:
                raise RepositoryError(
                    "MIGRATION_PREVIEW_HAS_BLOCKERS",
                    "Resolve migration conflicts and excluded records before applying.",
                    409,
                    {
                        "conflictCount": int(summary["conflictCount"]),
                        "excludedCount": int(summary["excludedCount"]),
                    },
                )

            checkpoint = self._load_checkpoint(migration_id) or {}
            if checkpoint.get("status") == "completed" and checkpoint.get("fingerprint") == fingerprint:
                return {
                    "migrationId": migration_id,
                    "status": "completed",
                    "idempotent": True,
                    "applied": {"folders": 0, "documents": 0, "fileSources": 0, "fileFolders": 0, "files": 0, "settings": 0},
                    "skippedDuplicates": int(summary["duplicateCount"]),
                    "verified": checkpoint.get("verified") or {},
                    "backup": checkpoint.get("backup"),
                    "sourcePreserved": True,
                }

            backup = checkpoint.get("backup") if isinstance(checkpoint.get("backup"), dict) else None
            if int(summary["newCount"]) > 0 and not backup:
                backup = self.manager.create_online_backup("pre_migration")
                checkpoint = {
                    "migrationId": migration_id,
                    "fingerprint": fingerprint,
                    "status": "backup_created",
                    "backup": backup,
                    "source": preview["source"],
                    "updatedAt": self._now_ms(),
                }
                self._save_checkpoint(migration_id, checkpoint)

            raw_folders = {
                str(item.get("id") or ""): item
                for item in payload.get("folders", [])
                if isinstance(item, dict)
            }
            raw_documents = {
                str(item.get("id") or ""): item
                for item in payload.get("documents", [])
                if isinstance(item, dict)
            }
            raw_file_source = payload.get("fileSource") if isinstance(payload.get("fileSource"), dict) else {}
            raw_files: Dict[str, Dict[str, Any]] = {}
            for raw_file in payload.get("files", []):
                if not isinstance(raw_file, dict):
                    continue
                try:
                    normalized_path = self._normalize_file_path(raw_file.get("path"))
                except RepositoryError:
                    continue
                if normalized_path not in raw_files:
                    raw_files[normalized_path] = raw_file
            normalized_settings: Dict[tuple[str, str, str, str], Dict[str, Any]] = {}
            for raw_setting in payload.get("settings", []):
                if not isinstance(raw_setting, dict):
                    continue
                try:
                    normalized_setting = validate_setting(
                        raw_setting.get("key"),
                        raw_setting.get("value"),
                        scope_type=raw_setting.get("scopeType"),
                        scope_id=raw_setting.get("scopeId"),
                        profile_id=self.manager.DEFAULT_PROFILE_ID,
                        workspace_id=self.manager.DEFAULT_WORKSPACE_ID,
                    )
                except SettingPolicyError:
                    continue
                identity = (
                    normalized_setting["scopeType"], normalized_setting["scopeId"],
                    normalized_setting["group"], normalized_setting["key"],
                )
                if identity not in normalized_settings:
                    normalized_setting["updatedAt"] = self._safe_timestamp(
                        raw_setting.get("updatedAt"), self._now_ms()
                    )
                    normalized_settings[identity] = normalized_setting
            folder_items = preview["items"]["folders"]
            document_items = preview["items"]["documents"]
            file_source_items = preview["items"]["fileSources"]
            file_entry_items = preview["items"]["fileEntries"]
            setting_items = preview["items"]["settings"]
            file_folder_by_path = {
                str(item["path"]): item
                for item in file_entry_items
                if item.get("kind") == "fileFolder"
            }
            new_documents = {
                str(item["id"]) for item in document_items if item.get("status") == "new"
            }
            applied_folders = 0
            applied_documents = 0
            applied_file_sources = 0
            applied_file_folders = 0
            applied_files = 0
            applied_settings = 0
            now_ms = self._now_ms()

            try:
                with self.manager.write_transaction() as connection:
                    for item in file_source_items:
                        if item.get("status") != "new":
                            continue
                        saved_at = self._safe_timestamp(raw_file_source.get("savedAt"), now_ms)
                        config = {
                            "database": str(raw_file_source.get("database") or "mdpro-indb-v1")[:100],
                            "store": str(raw_file_source.get("store") or "files")[:100],
                            "declaredFileCount": raw_file_source.get("declaredFileCount"),
                            "savedAt": raw_file_source.get("savedAt"),
                            "memo": str(raw_file_source.get("memo") or "")[:2000] or None,
                        }
                        connection.execute(
                            """
                            INSERT INTO workspace_sources
                                (id, workspace_id, source_type, name, root_uri,
                                 config_json, sync_direction, is_enabled, status,
                                 last_synced_at, created_at, updated_at)
                            VALUES (?, ?, 'legacy_indb', ?, ?, ?, 'manual', 1,
                                    'ready', ?, ?, ?)
                            """,
                            (
                                item["id"], self.manager.DEFAULT_WORKSPACE_ID, item["name"],
                                item["rootUri"],
                                json.dumps(config, ensure_ascii=False, separators=(",", ":")),
                                saved_at, saved_at, now_ms,
                            ),
                        )
                        applied_file_sources += 1

                    current_folder_ids = {
                        str(row["id"])
                        for row in connection.execute(
                            "SELECT id FROM folders WHERE workspace_id = ? AND deleted_at IS NULL",
                            (self.manager.DEFAULT_WORKSPACE_ID,),
                        )
                    }
                    for item in self._ordered_new_folders(folder_items, current_folder_ids):
                        raw = raw_folders.get(str(item["id"])) or {}
                        created_at = self._safe_timestamp(raw.get("createdAt"), now_ms)
                        updated_at = self._safe_timestamp(raw.get("updatedAt"), created_at)
                        connection.execute(
                            """
                            INSERT INTO folders
                                (id, workspace_id, parent_id, name, sort_order,
                                 is_expanded, created_at, updated_at)
                            VALUES (?, ?, ?, ?, ?, 1, ?, ?)
                            """,
                            (
                                item["id"], self.manager.DEFAULT_WORKSPACE_ID,
                                item.get("parentId"), item["name"],
                                int(raw.get("sortOrder") or 0), created_at, updated_at,
                            ),
                        )
                        applied_folders += 1

                    for item in document_items:
                        if item.get("status") != "new":
                            continue
                        raw = raw_documents.get(str(item["id"])) or {}
                        content = str(raw.get("content") if raw.get("content") is not None else "")
                        created_at = self._safe_timestamp(raw.get("createdAt"), now_ms)
                        updated_at = self._safe_timestamp(raw.get("updatedAt"), created_at)
                        connection.execute(
                            """
                            INSERT INTO documents
                                (id, workspace_id, folder_id, title, content, content_format,
                                 document_type, status, language, source_mode, word_count,
                                 checksum, version, created_at, updated_at, last_opened_at)
                            VALUES (?, ?, ?, ?, ?, 'markdown', 'document', 'active', 'ko',
                                    'legacy_indb', ?, ?, 1, ?, ?, ?)
                            """,
                            (
                                item["id"], self.manager.DEFAULT_WORKSPACE_ID, item["folderId"],
                                item["title"], content, self._word_count(content), item["checksum"],
                                created_at, updated_at, updated_at,
                            ),
                        )
                        connection.execute(
                            """
                            INSERT INTO document_versions
                                (id, document_id, version_no, title, content, checksum,
                                 change_type, change_summary, created_at)
                            VALUES (?, ?, 1, ?, ?, ?, 'migration', ?, ?)
                            """,
                            (
                                f"version_{uuid.uuid4().hex}", item["id"], item["title"],
                                content, item["checksum"], "Imported from MarkdownProDB", updated_at,
                            ),
                        )
                        applied_documents += 1

                    for item in setting_items:
                        if item.get("status") != "new":
                            continue
                        identity = (
                            str(item["scopeType"]), str(item["scopeId"]),
                            str(item["group"]), str(item["key"]),
                        )
                        setting = normalized_settings[identity]
                        connection.execute(
                            """
                            INSERT INTO settings
                                (scope_type, scope_id, setting_group, setting_key,
                                 value_json, value_type, updated_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?)
                            """,
                            (
                                setting["scopeType"], setting["scopeId"], setting["group"],
                                setting["key"], setting["valueJson"], setting["valueType"],
                                setting["updatedAt"],
                            ),
                        )
                        applied_settings += 1

                    for item in file_entry_items:
                        if item.get("status") != "new" or item.get("kind") != "fileFolder":
                            continue
                        parent_path = item.get("parentPath")
                        parent_item = file_folder_by_path.get(str(parent_path)) if parent_path else None
                        parent_id = (
                            (parent_item.get("current") or {}).get("id")
                            if parent_item and parent_item.get("status") == "duplicate"
                            else parent_item.get("id") if parent_item else None
                        )
                        connection.execute(
                            """
                            INSERT INTO file_entries
                                (id, source_id, parent_id, entry_type, path, name,
                                 sync_status, created_at, updated_at)
                            VALUES (?, ?, ?, 'folder', ?, ?, 'synced', ?, ?)
                            """,
                            (
                                item["id"], self.LEGACY_FILE_SOURCE_ID, parent_id,
                                item["path"], item["name"], now_ms, now_ms,
                            ),
                        )
                        applied_file_folders += 1

                    for item in file_entry_items:
                        if item.get("status") != "new" or item.get("kind") != "file":
                            continue
                        raw = raw_files.get(str(item["path"])) or {}
                        content = str(raw.get("content") if raw.get("content") is not None else "")
                        parent_path = str(item["path"]).rsplit("/", 1)[0] if "/" in str(item["path"]) else ""
                        parent_item = file_folder_by_path.get(parent_path) if parent_path else None
                        parent_id = (
                            (parent_item.get("current") or {}).get("id")
                            if parent_item and parent_item.get("status") == "duplicate"
                            else parent_item.get("id") if parent_item else None
                        )
                        modified_at = self._safe_timestamp(raw.get("modifiedAt"), now_ms)
                        connection.execute(
                            """
                            INSERT INTO file_entries
                                (id, source_id, parent_id, entry_type, path, name,
                                 extension, mime_type, content_text, size_bytes,
                                 modified_at, checksum, base_checksum, sync_status,
                                 created_at, updated_at)
                            VALUES (?, ?, ?, 'file', ?, ?, ?, ?, ?, ?, ?, ?, ?,
                                    'synced', ?, ?)
                            """,
                            (
                                item["id"], self.LEGACY_FILE_SOURCE_ID, parent_id,
                                item["path"], item["name"], item.get("extension"),
                                item.get("mimeType"), content, item["sizeBytes"],
                                modified_at, item["checksum"], item["checksum"],
                                modified_at, modified_at,
                            ),
                        )
                        applied_files += 1

                    verified = self._verify_applied_records(
                        connection, folder_items, document_items, new_documents
                    )
                    verified.update(
                        self._verify_applied_files(connection, file_source_items, file_entry_items)
                    )
                    verified["settings"] = self._verify_applied_settings(
                        connection, setting_items, normalized_settings
                    )
                    completed_checkpoint = {
                        "migrationId": migration_id,
                        "fingerprint": fingerprint,
                        "status": "completed",
                        "backup": backup,
                        "source": preview["source"],
                        "applied": {
                            "folders": applied_folders,
                            "documents": applied_documents,
                            "fileSources": applied_file_sources,
                            "fileFolders": applied_file_folders,
                            "files": applied_files,
                            "settings": applied_settings,
                        },
                        "verified": verified,
                        "completedAt": self._now_ms(),
                    }
                    self._save_checkpoint(migration_id, completed_checkpoint, connection)
            except sqlite3.IntegrityError as error:
                raise RepositoryError(
                    "MIGRATION_APPLY_CONFLICT",
                    "SQLite changed after preview. Run migration preview again.",
                    409,
                ) from error

        return {
            "migrationId": migration_id,
            "status": "completed",
            "idempotent": False,
            "applied": {
                "folders": applied_folders,
                "documents": applied_documents,
                "fileSources": applied_file_sources,
                "fileFolders": applied_file_folders,
                "files": applied_files,
                "settings": applied_settings,
            },
            "skippedDuplicates": int(summary["duplicateCount"]),
            "verified": verified,
            "backup": backup,
            "sourcePreserved": True,
        }
