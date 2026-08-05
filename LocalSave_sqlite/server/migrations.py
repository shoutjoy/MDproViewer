"""Read-only preview for importing normalized legacy IndexedDB records."""

from __future__ import annotations

import hashlib
from typing import Any, Dict, List, Optional, Set

from .database import DatabaseManager
from .repositories import RepositoryError, StorageRepository


class IndexedDbMigrationService:
    """Compare a normalized browser batch with SQLite without writing data."""

    MAX_DOCUMENTS = 1000
    MAX_FOLDERS = 1000

    def __init__(self, manager: DatabaseManager, repository: StorageRepository) -> None:
        self.manager = manager
        self.repository = repository

    @staticmethod
    def _checksum(content: str) -> str:
        return hashlib.sha256(content.encode("utf-8")).hexdigest()

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
        folder_status = {
            str(item.get("id") or ""): str(item.get("status") or "excluded")
            for item in folder_items
            if item.get("id")
        }
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

    def preview(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        if not isinstance(payload, dict):
            raise RepositoryError("INVALID_PAYLOAD", "Migration preview payload must be an object.")
        raw_folders = payload.get("folders")
        raw_documents = payload.get("documents")
        if not isinstance(raw_folders, list) or not isinstance(raw_documents, list):
            raise RepositoryError("INVALID_MIGRATION_BATCH", "folders and documents must be arrays.")
        if len(raw_folders) > self.MAX_FOLDERS or len(raw_documents) > self.MAX_DOCUMENTS:
            raise RepositoryError("MIGRATION_BATCH_TOO_LARGE", "Migration preview batch is too large.", 413)

        current_folders, current_documents = self._load_current()
        folder_items = self._normalize_folders(raw_folders, current_folders)
        document_items = self._normalize_documents(
            raw_documents, current_documents, current_folders, folder_items
        )
        folder_counts = self._status_counts(folder_items)
        document_counts = self._status_counts(document_items)
        summary = {
            "sourceCount": folder_counts["source"] + document_counts["source"],
            "newCount": folder_counts["new"] + document_counts["new"],
            "duplicateCount": folder_counts["duplicate"] + document_counts["duplicate"],
            "conflictCount": folder_counts["conflict"] + document_counts["conflict"],
            "excludedCount": folder_counts["excluded"] + document_counts["excluded"],
            "folders": folder_counts,
            "documents": document_counts,
        }
        source = payload.get("source") if isinstance(payload.get("source"), dict) else {}
        return {
            "previewOnly": True,
            "source": {
                "database": str(source.get("database") or "MarkdownProDB")[:100],
                "version": int(source.get("version") or 0),
            },
            "summary": summary,
            "items": {"folders": folder_items, "documents": document_items},
        }
