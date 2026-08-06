"""Document and folder repositories for the local SQLite service."""

from __future__ import annotations

import hashlib
import json
import re
import sqlite3
import time
import uuid
from typing import Any, Dict, List, Optional

from .database import DatabaseManager
from .settings_policy import SCOPE_PRIORITY, SettingPolicyError, validate_setting


class RepositoryError(RuntimeError):
    def __init__(
        self,
        code: str,
        message: str,
        status: int = 400,
        details: Optional[Dict[str, Any]] = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.status = status
        self.details = details or {}


class StorageRepository:
    MAX_TITLE_LENGTH = 500
    MAX_CONTENT_LENGTH = 10 * 1024 * 1024
    MAX_SEARCH_QUERY_LENGTH = 500
    SAFE_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$")

    def __init__(self, manager: DatabaseManager) -> None:
        self.manager = manager

    @staticmethod
    def _setting_result(row: sqlite3.Row) -> Dict[str, Any]:
        try:
            value = json.loads(str(row["value_json"]))
        except (TypeError, json.JSONDecodeError) as error:
            raise RepositoryError("INVALID_STORED_SETTING", "Stored setting JSON is invalid.", 500) from error
        return {
            "scopeType": row["scope_type"],
            "scopeId": row["scope_id"],
            "group": row["setting_group"],
            "key": row["setting_key"],
            "value": value,
            "valueType": row["value_type"],
            "updatedAt": row["updated_at"],
        }

    def _validated_setting(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        if not isinstance(payload, dict):
            raise RepositoryError("INVALID_PAYLOAD", "Setting payload must be an object.")
        try:
            return validate_setting(
                payload.get("key", payload.get("settingKey")),
                payload.get("value"),
                scope_type=payload.get("scopeType"),
                scope_id=payload.get("scopeId"),
                profile_id=self.manager.DEFAULT_PROFILE_ID,
                workspace_id=self.manager.DEFAULT_WORKSPACE_ID,
            )
        except SettingPolicyError as error:
            raise RepositoryError(error.code, str(error)) from error

    def list_settings(
        self,
        scope_type: Optional[str] = None,
        scope_id: Optional[str] = None,
        setting_group: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        clauses: List[str] = []
        values: List[Any] = []
        if scope_type:
            normalized_scope = str(scope_type).strip().lower()
            if normalized_scope not in SCOPE_PRIORITY:
                raise RepositoryError("INVALID_SETTING_SCOPE", "Setting scope is invalid.")
            clauses.append("scope_type = ?")
            values.append(normalized_scope)
        if scope_id is not None:
            clauses.append("scope_id = ?")
            values.append(str(scope_id).strip())
        if setting_group:
            clauses.append("setting_group = ?")
            values.append(str(setting_group).strip())
        where = " WHERE " + " AND ".join(clauses) if clauses else ""
        priority_sql = "CASE scope_type " + " ".join(
            f"WHEN '{scope}' THEN {index}" for index, scope in enumerate(SCOPE_PRIORITY)
        ) + " ELSE 99 END"
        with self.manager.connection() as connection:
            rows = connection.execute(
                f"""
                SELECT scope_type, scope_id, setting_group, setting_key,
                       value_json, value_type, updated_at
                FROM settings{where}
                ORDER BY {priority_sql}, setting_group, setting_key, scope_id
                """,
                values,
            ).fetchall()
        return [self._setting_result(row) for row in rows]

    def put_setting(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        setting = self._validated_setting(payload)
        updated_at = self._now_ms()
        with self.manager.write_transaction() as connection:
            connection.execute(
                """
                INSERT INTO settings
                    (scope_type, scope_id, setting_group, setting_key,
                     value_json, value_type, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(scope_type, scope_id, setting_group, setting_key)
                DO UPDATE SET value_json = excluded.value_json,
                              value_type = excluded.value_type,
                              updated_at = excluded.updated_at
                """,
                (
                    setting["scopeType"], setting["scopeId"], setting["group"],
                    setting["key"], setting["valueJson"], setting["valueType"], updated_at,
                ),
            )
        return {**setting, "updatedAt": updated_at, "valueJson": None}

    def get_resolved_settings(
        self,
        profile_id: Optional[str] = None,
        workspace_id: Optional[str] = None,
        document_id: Optional[str] = None,
        feature_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        scope_ids = {
            "global": "",
            "profile": str(profile_id or self.manager.DEFAULT_PROFILE_ID).strip(),
            "workspace": str(workspace_id or self.manager.DEFAULT_WORKSPACE_ID).strip(),
            "feature": str(feature_id or "").strip(),
            "document": str(document_id or "").strip(),
        }
        selected: Dict[tuple[str, str], Dict[str, Any]] = {}
        for scope_type in SCOPE_PRIORITY:
            scope_id = scope_ids[scope_type]
            if scope_type not in {"global"} and not scope_id:
                continue
            for item in self.list_settings(scope_type=scope_type, scope_id=scope_id):
                selected[(str(item["group"]), str(item["key"]))] = item
        items = list(selected.values())
        items.sort(key=lambda item: (str(item["group"]), str(item["key"])))
        return {
            "precedence": list(SCOPE_PRIORITY),
            "scopeIds": scope_ids,
            "values": {str(item["key"]): item["value"] for item in items},
            "items": items,
        }

    @staticmethod
    def _now_ms() -> int:
        return int(time.time() * 1000)

    @staticmethod
    def _checksum(content: str) -> str:
        return hashlib.sha256(content.encode("utf-8")).hexdigest()

    @staticmethod
    def _word_count(content: str) -> int:
        return len([part for part in re.split(r"\s+", content.strip()) if part])

    def _validate_id(self, value: Any, field: str) -> str:
        normalized = str(value or "").strip()
        if not normalized or not self.SAFE_ID_RE.fullmatch(normalized):
            raise RepositoryError("INVALID_ID", f"{field} is invalid.")
        return normalized

    def _validate_title(self, value: Any) -> str:
        title = str(value or "").strip()
        if not title:
            raise RepositoryError("TITLE_REQUIRED", "Document title is required.")
        if len(title) > self.MAX_TITLE_LENGTH:
            raise RepositoryError("TITLE_TOO_LONG", "Document title is too long.")
        return title

    def _validate_content(self, value: Any) -> str:
        content = str(value if value is not None else "")
        if len(content.encode("utf-8")) > self.MAX_CONTENT_LENGTH:
            raise RepositoryError("CONTENT_TOO_LARGE", "Document content exceeds 10 MB.", 413)
        return content

    @staticmethod
    def _document_summary(row: sqlite3.Row) -> Dict[str, Any]:
        return {
            "id": row["id"],
            "workspaceId": row["workspace_id"],
            "folderId": row["folder_id"],
            "title": row["title"],
            "contentFormat": row["content_format"],
            "documentType": row["document_type"],
            "status": row["status"],
            "wordCount": row["word_count"],
            "version": row["version"],
            "createdAt": row["created_at"],
            "updatedAt": row["updated_at"],
            "lastOpenedAt": row["last_opened_at"],
        }

    @classmethod
    def _document_detail(cls, row: sqlite3.Row) -> Dict[str, Any]:
        result = cls._document_summary(row)
        result.update(
            {
                "content": row["content"],
                "checksum": row["checksum"],
                "language": row["language"],
                "sourceMode": row["source_mode"],
                "isFavorite": bool(row["is_favorite"]),
                "isPinned": bool(row["is_pinned"]),
                "isReadonly": bool(row["is_readonly"]),
            }
        )
        return result

    @staticmethod
    def _folder_result(row: sqlite3.Row) -> Dict[str, Any]:
        return {
            "id": row["id"],
            "workspaceId": row["workspace_id"],
            "parentId": row["parent_id"],
            "name": row["name"],
            "sortOrder": row["sort_order"],
            "isExpanded": bool(row["is_expanded"]),
            "createdAt": row["created_at"],
            "updatedAt": row["updated_at"],
        }

    def _require_folder(self, connection: sqlite3.Connection, folder_id: str) -> sqlite3.Row:
        row = connection.execute(
            "SELECT * FROM folders WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL",
            (folder_id, self.manager.DEFAULT_WORKSPACE_ID),
        ).fetchone()
        if not row:
            raise RepositoryError("FOLDER_NOT_FOUND", "Folder not found.", 404)
        return row

    def list_documents(
        self,
        folder_id: Optional[str] = None,
        query: str = "",
        limit: int = 200,
    ) -> List[Dict[str, Any]]:
        safe_limit = max(1, min(int(limit or 200), 500))
        clauses = ["workspace_id = ?", "deleted_at IS NULL"]
        values: List[Any] = [self.manager.DEFAULT_WORKSPACE_ID]
        if folder_id:
            clauses.append("folder_id = ?")
            values.append(self._validate_id(folder_id, "folderId"))
        normalized_query = str(query or "").strip()
        if normalized_query:
            clauses.append("title LIKE ? ESCAPE '\\'")
            escaped = normalized_query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            values.append(f"%{escaped}%")
        values.append(safe_limit)
        sql = f"""
            SELECT id, workspace_id, folder_id, title, content_format, document_type,
                   status, word_count, version, created_at, updated_at, last_opened_at
            FROM documents
            WHERE {' AND '.join(clauses)}
            ORDER BY updated_at DESC, id ASC
            LIMIT ?
        """
        with self.manager.connection() as connection:
            return [self._document_summary(row) for row in connection.execute(sql, values)]

    def search_documents(
        self,
        query: str,
        folder_id: Optional[str] = None,
        limit: int = 100,
    ) -> List[Dict[str, Any]]:
        normalized_query = str(query or "").strip()
        if not normalized_query:
            return []
        if len(normalized_query) > self.MAX_SEARCH_QUERY_LENGTH:
            raise RepositoryError("SEARCH_QUERY_TOO_LONG", "Search query is too long.")

        safe_limit = max(1, min(int(limit or 100), 200))
        folder_clause = ""
        folder_values: List[Any] = []
        if folder_id:
            folder_clause = " AND d.folder_id = ?"
            folder_values.append(self._validate_id(folder_id, "folderId"))

        summary_columns = """
            d.id, d.workspace_id, d.folder_id, d.title, d.content_format,
            d.document_type, d.status, d.word_count, d.version, d.created_at,
            d.updated_at, d.last_opened_at
        """
        if len(normalized_query) <= 2:
            escaped = normalized_query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            pattern = f"%{escaped}%"
            sql = f"""
                SELECT {summary_columns},
                       CASE WHEN d.title LIKE ? ESCAPE '\\' THEN 'title' ELSE 'content' END AS match_source,
                       '' AS snippet
                FROM documents AS d
                WHERE d.workspace_id = ? AND d.deleted_at IS NULL
                  AND (d.title LIKE ? ESCAPE '\\' OR d.content LIKE ? ESCAPE '\\')
                  {folder_clause}
                ORDER BY CASE WHEN d.title LIKE ? ESCAPE '\\' THEN 0 ELSE 1 END,
                         d.updated_at DESC, d.id ASC
                LIMIT ?
            """
            values: List[Any] = [
                pattern,
                self.manager.DEFAULT_WORKSPACE_ID,
                pattern,
                pattern,
                *folder_values,
                pattern,
                safe_limit,
            ]
        else:
            fts_query = '"' + normalized_query.replace('"', '""') + '"'
            sql = f"""
                SELECT {summary_columns},
                       CASE WHEN instr(lower(d.title), lower(?)) > 0 THEN 'title' ELSE 'content' END AS match_source,
                       snippet(document_fts, 3, '', '', ' … ', 16) AS snippet
                FROM document_fts
                JOIN documents AS d ON d.id = document_fts.document_id
                WHERE document_fts MATCH ?
                  AND d.workspace_id = ? AND d.deleted_at IS NULL
                  {folder_clause}
                ORDER BY bm25(document_fts, 0.0, 0.0, 5.0, 1.0),
                         d.updated_at DESC, d.id ASC
                LIMIT ?
            """
            values = [
                normalized_query,
                fts_query,
                self.manager.DEFAULT_WORKSPACE_ID,
                *folder_values,
                safe_limit,
            ]

        with self.manager.connection() as connection:
            rows = connection.execute(sql, values).fetchall()
        results = []
        for row in rows:
            item = self._document_summary(row)
            item["matchSource"] = row["match_source"]
            item["snippet"] = row["snippet"]
            results.append(item)
        return results

    def get_document(self, document_id: str) -> Dict[str, Any]:
        normalized_id = self._validate_id(document_id, "documentId")
        with self.manager.connection() as connection:
            row = connection.execute(
                "SELECT * FROM documents WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL",
                (normalized_id, self.manager.DEFAULT_WORKSPACE_ID),
            ).fetchone()
        if not row:
            raise RepositoryError("DOCUMENT_NOT_FOUND", "Document not found.", 404)
        return self._document_detail(row)

    def create_document(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        if not isinstance(payload, dict):
            raise RepositoryError("INVALID_PAYLOAD", "Document payload must be an object.")
        document_id = self._validate_id(
            payload.get("id") or f"doc_{uuid.uuid4().hex}", "documentId"
        )
        folder_id = self._validate_id(payload.get("folderId") or self.manager.ROOT_FOLDER_ID, "folderId")
        title = self._validate_title(payload.get("title"))
        content = self._validate_content(payload.get("content"))
        now_ms = self._now_ms()
        checksum = self._checksum(content)
        version_id = f"version_{uuid.uuid4().hex}"

        try:
            with self.manager.write_transaction() as connection:
                self._require_folder(connection, folder_id)
                connection.execute(
                    """
                    INSERT INTO documents
                        (id, workspace_id, folder_id, title, content, content_format,
                         document_type, status, language, source_mode, word_count,
                         checksum, version, created_at, updated_at, last_opened_at)
                    VALUES (?, ?, ?, ?, ?, 'markdown', 'document', 'active', 'ko',
                            'internal', ?, ?, 1, ?, ?, ?)
                    """,
                    (
                        document_id,
                        self.manager.DEFAULT_WORKSPACE_ID,
                        folder_id,
                        title,
                        content,
                        self._word_count(content),
                        checksum,
                        now_ms,
                        now_ms,
                        now_ms,
                    ),
                )
                connection.execute(
                    """
                    INSERT INTO document_versions
                        (id, document_id, version_no, title, content, checksum,
                         change_type, change_summary, created_at)
                    VALUES (?, ?, 1, ?, ?, ?, 'manual_save', ?, ?)
                    """,
                    (version_id, document_id, title, content, checksum, "Initial SQLite save", now_ms),
                )
        except sqlite3.IntegrityError as error:
            raise RepositoryError("DOCUMENT_CONFLICT", "A document with this ID already exists.", 409) from error
        return self.get_document(document_id)

    def update_document(self, document_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        normalized_id = self._validate_id(document_id, "documentId")
        if not isinstance(payload, dict):
            raise RepositoryError("INVALID_PAYLOAD", "Document payload must be an object.")
        expected_version = payload.get("expectedVersion")
        if not isinstance(expected_version, int) or expected_version < 1:
            raise RepositoryError("EXPECTED_VERSION_REQUIRED", "expectedVersion is required.")

        with self.manager.write_transaction() as connection:
            current = connection.execute(
                "SELECT * FROM documents WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL",
                (normalized_id, self.manager.DEFAULT_WORKSPACE_ID),
            ).fetchone()
            if not current:
                raise RepositoryError("DOCUMENT_NOT_FOUND", "Document not found.", 404)
            if int(current["version"]) != expected_version:
                raise RepositoryError(
                    "VERSION_CONFLICT",
                    "The document was changed by another operation.",
                    409,
                    {"currentVersion": int(current["version"])},
                )

            title = self._validate_title(payload.get("title", current["title"]))
            content = self._validate_content(payload.get("content", current["content"]))
            folder_id = self._validate_id(payload.get("folderId", current["folder_id"]), "folderId")
            self._require_folder(connection, folder_id)
            next_version = expected_version + 1
            now_ms = self._now_ms()
            checksum = self._checksum(content)
            cursor = connection.execute(
                """
                UPDATE documents
                SET folder_id = ?, title = ?, content = ?, word_count = ?, checksum = ?,
                    version = ?, updated_at = ?, last_opened_at = ?
                WHERE id = ? AND version = ? AND deleted_at IS NULL
                """,
                (
                    folder_id,
                    title,
                    content,
                    self._word_count(content),
                    checksum,
                    next_version,
                    now_ms,
                    now_ms,
                    normalized_id,
                    expected_version,
                ),
            )
            if cursor.rowcount != 1:
                raise RepositoryError("VERSION_CONFLICT", "Document update conflict.", 409)
            connection.execute(
                """
                INSERT INTO document_versions
                    (id, document_id, version_no, title, content, checksum,
                     change_type, change_summary, created_at)
                VALUES (?, ?, ?, ?, ?, ?, 'manual_save', ?, ?)
                """,
                (
                    f"version_{uuid.uuid4().hex}",
                    normalized_id,
                    next_version,
                    title,
                    content,
                    checksum,
                    str(payload.get("changeSummary") or "SQLite document update")[:500],
                    now_ms,
                ),
            )
        return self.get_document(normalized_id)

    def soft_delete_document(self, document_id: str, expected_version: int) -> Dict[str, Any]:
        normalized_id = self._validate_id(document_id, "documentId")
        if not isinstance(expected_version, int) or expected_version < 1:
            raise RepositoryError("EXPECTED_VERSION_REQUIRED", "expectedVersion is required.")
        now_ms = self._now_ms()
        with self.manager.write_transaction() as connection:
            cursor = connection.execute(
                """
                UPDATE documents
                SET deleted_at = ?, updated_at = ?, version = version + 1
                WHERE id = ? AND workspace_id = ? AND version = ? AND deleted_at IS NULL
                """,
                (
                    now_ms,
                    now_ms,
                    normalized_id,
                    self.manager.DEFAULT_WORKSPACE_ID,
                    expected_version,
                ),
            )
            if cursor.rowcount != 1:
                current = connection.execute(
                    "SELECT version FROM documents WHERE id = ? AND deleted_at IS NULL",
                    (normalized_id,),
                ).fetchone()
                if current:
                    raise RepositoryError(
                        "VERSION_CONFLICT",
                        "The document was changed before deletion.",
                        409,
                        {"currentVersion": int(current["version"])},
                    )
                raise RepositoryError("DOCUMENT_NOT_FOUND", "Document not found.", 404)
        return {"id": normalized_id, "deleted": True}

    def list_document_versions(self, document_id: str) -> List[Dict[str, Any]]:
        normalized_id = self._validate_id(document_id, "documentId")
        self.get_document(normalized_id)
        with self.manager.connection() as connection:
            rows = connection.execute(
                """
                SELECT id, version_no, title, checksum, change_type, change_summary, created_at
                FROM document_versions
                WHERE document_id = ?
                ORDER BY version_no DESC
                """,
                (normalized_id,),
            ).fetchall()
        return [
            {
                "id": row["id"],
                "version": row["version_no"],
                "title": row["title"],
                "checksum": row["checksum"],
                "changeType": row["change_type"],
                "changeSummary": row["change_summary"],
                "createdAt": row["created_at"],
            }
            for row in rows
        ]

    def restore_document_version(
        self,
        document_id: str,
        version_number: int,
        expected_version: int,
    ) -> Dict[str, Any]:
        normalized_id = self._validate_id(document_id, "documentId")
        if version_number < 1 or expected_version < 1:
            raise RepositoryError("INVALID_VERSION", "Document version is invalid.")
        with self.manager.write_transaction() as connection:
            current = connection.execute(
                "SELECT * FROM documents WHERE id = ? AND deleted_at IS NULL",
                (normalized_id,),
            ).fetchone()
            if not current:
                raise RepositoryError("DOCUMENT_NOT_FOUND", "Document not found.", 404)
            if int(current["version"]) != expected_version:
                raise RepositoryError(
                    "VERSION_CONFLICT",
                    "The document changed before restore.",
                    409,
                    {"currentVersion": int(current["version"])},
                )
            source = connection.execute(
                "SELECT * FROM document_versions WHERE document_id = ? AND version_no = ?",
                (normalized_id, version_number),
            ).fetchone()
            if not source:
                raise RepositoryError("VERSION_NOT_FOUND", "Document version not found.", 404)
            next_version = expected_version + 1
            now_ms = self._now_ms()
            connection.execute(
                """
                UPDATE documents
                SET title = ?, content = ?, checksum = ?, word_count = ?,
                    version = ?, updated_at = ?
                WHERE id = ? AND version = ?
                """,
                (
                    source["title"],
                    source["content"],
                    source["checksum"],
                    self._word_count(source["content"]),
                    next_version,
                    now_ms,
                    normalized_id,
                    expected_version,
                ),
            )
            connection.execute(
                """
                INSERT INTO document_versions
                    (id, document_id, version_no, title, content, checksum,
                     change_type, change_summary, created_at)
                VALUES (?, ?, ?, ?, ?, ?, 'restore', ?, ?)
                """,
                (
                    f"version_{uuid.uuid4().hex}",
                    normalized_id,
                    next_version,
                    source["title"],
                    source["content"],
                    source["checksum"],
                    f"Restored version {version_number}",
                    now_ms,
                ),
            )
        return self.get_document(normalized_id)

    def list_folders(self) -> List[Dict[str, Any]]:
        with self.manager.connection() as connection:
            rows = connection.execute(
                """
                SELECT id, workspace_id, parent_id, name, sort_order, is_expanded,
                       created_at, updated_at
                FROM folders
                WHERE workspace_id = ? AND deleted_at IS NULL
                ORDER BY CASE WHEN id = 'root' THEN 0 ELSE 1 END, sort_order, name, id
                """,
                (self.manager.DEFAULT_WORKSPACE_ID,),
            ).fetchall()
        return [self._folder_result(row) for row in rows]

    def get_explorer_snapshot(self, query: str = "", limit: int = 200) -> Dict[str, Any]:
        """Return a read-only, content-free overview for the SQLite explorer UI."""
        normalized_query = str(query or "").strip()
        if len(normalized_query) > self.MAX_SEARCH_QUERY_LENGTH:
            raise RepositoryError("SEARCH_QUERY_TOO_LONG", "Search query is too long.")
        safe_limit = max(1, min(int(limit or 200), 500))
        escaped = normalized_query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        pattern = f"%{escaped}%"

        document_where = "d.workspace_id = ? AND d.deleted_at IS NULL"
        document_values: List[Any] = [self.manager.DEFAULT_WORKSPACE_ID]
        if normalized_query:
            document_where += (
                " AND (d.title LIKE ? ESCAPE '\\' OR d.id LIKE ? ESCAPE '\\'"
                " OR COALESCE(f.name, '') LIKE ? ESCAPE '\\')"
            )
            document_values.extend([pattern, pattern, pattern])
        document_values.append(safe_limit)

        folder_where = "workspace_id = ? AND deleted_at IS NULL"
        folder_values: List[Any] = [self.manager.DEFAULT_WORKSPACE_ID]
        if normalized_query:
            folder_where += " AND (name LIKE ? ESCAPE '\\' OR id LIKE ? ESCAPE '\\')"
            folder_values.extend([pattern, pattern])
        folder_values.append(safe_limit)

        with self.manager.connection() as connection:
            count_row = connection.execute(
                """
                SELECT
                    (SELECT COUNT(*) FROM documents
                     WHERE workspace_id = ? AND deleted_at IS NULL) AS documents,
                    (SELECT COUNT(*) FROM documents
                     WHERE workspace_id = ? AND deleted_at IS NOT NULL) AS deleted_documents,
                    (SELECT COUNT(*) FROM folders
                     WHERE workspace_id = ? AND deleted_at IS NULL) AS folders,
                    (SELECT COUNT(*) FROM document_versions AS v
                     JOIN documents AS d ON d.id = v.document_id
                     WHERE d.workspace_id = ?) AS versions,
                    (SELECT COUNT(*) FROM backup_history
                     WHERE workspace_id = ? OR workspace_id IS NULL) AS backups,
                    (SELECT COUNT(*) FROM app_meta
                     WHERE key LIKE 'indexeddb_migration:%') AS migration_checkpoints,
                    (SELECT COUNT(*) FROM workspace_sources
                     WHERE workspace_id = ?) AS sources,
                    (SELECT COUNT(*) FROM file_entries AS e
                     JOIN workspace_sources AS s ON s.id = e.source_id
                     WHERE s.workspace_id = ? AND e.deleted_at IS NULL) AS file_entries,
                    (SELECT COUNT(*) FROM settings) AS settings
                """,
                (
                    self.manager.DEFAULT_WORKSPACE_ID,
                    self.manager.DEFAULT_WORKSPACE_ID,
                    self.manager.DEFAULT_WORKSPACE_ID,
                    self.manager.DEFAULT_WORKSPACE_ID,
                    self.manager.DEFAULT_WORKSPACE_ID,
                    self.manager.DEFAULT_WORKSPACE_ID,
                    self.manager.DEFAULT_WORKSPACE_ID,
                ),
            ).fetchone()
            document_rows = connection.execute(
                f"""
                SELECT d.id, d.workspace_id, d.folder_id, d.title, d.content_format,
                       d.document_type, d.status, d.word_count, d.version, d.checksum,
                       d.source_mode, d.created_at, d.updated_at, d.last_opened_at,
                       f.name AS folder_name
                FROM documents AS d
                LEFT JOIN folders AS f ON f.id = d.folder_id AND f.deleted_at IS NULL
                WHERE {document_where}
                ORDER BY d.updated_at DESC, d.id ASC
                LIMIT ?
                """,
                document_values,
            ).fetchall()
            folder_rows = connection.execute(
                f"""
                SELECT id, workspace_id, parent_id, name, sort_order, is_expanded,
                       created_at, updated_at,
                       (SELECT COUNT(*) FROM documents AS d
                        WHERE d.folder_id = folders.id AND d.deleted_at IS NULL) AS document_count
                FROM folders
                WHERE {folder_where}
                ORDER BY CASE WHEN id = 'root' THEN 0 ELSE 1 END, sort_order, name, id
                LIMIT ?
                """,
                folder_values,
            ).fetchall()
            backup_rows = connection.execute(
                """
                SELECT id, backup_type, file_path, checksum_sha256, size_bytes,
                       schema_version, status, error_message, created_at
                FROM backup_history
                WHERE workspace_id = ? OR workspace_id IS NULL
                ORDER BY created_at DESC, id DESC
                LIMIT ?
                """,
                (self.manager.DEFAULT_WORKSPACE_ID, safe_limit),
            ).fetchall()
            checkpoint_rows = connection.execute(
                """
                SELECT key, value_json, updated_at
                FROM app_meta
                WHERE key LIKE 'indexeddb_migration:%'
                ORDER BY updated_at DESC, key DESC
                LIMIT ?
                """,
                (safe_limit,),
            ).fetchall()
            source_rows = connection.execute(
                """
                SELECT id, source_type, name, root_uri, sync_direction, is_enabled,
                       status, last_synced_at, created_at, updated_at
                FROM workspace_sources
                WHERE workspace_id = ?
                ORDER BY updated_at DESC, id ASC
                LIMIT ?
                """,
                (self.manager.DEFAULT_WORKSPACE_ID, safe_limit),
            ).fetchall()
            file_values: List[Any] = [self.manager.DEFAULT_WORKSPACE_ID]
            file_where = "s.workspace_id = ? AND e.deleted_at IS NULL"
            if normalized_query:
                file_where += (
                    " AND (e.path LIKE ? ESCAPE '\\' OR e.name LIKE ? ESCAPE '\\'"
                    " OR s.name LIKE ? ESCAPE '\\')"
                )
                file_values.extend([pattern, pattern, pattern])
            file_values.append(safe_limit)
            file_rows = connection.execute(
                f"""
                SELECT e.id, e.source_id, s.name AS source_name, e.parent_id,
                       e.entry_type, e.path, e.name, e.extension, e.mime_type,
                       e.size_bytes, e.modified_at, e.remote_revision, e.checksum, e.sync_status,
                       e.created_at, e.updated_at
                FROM file_entries AS e
                JOIN workspace_sources AS s ON s.id = e.source_id
                WHERE {file_where}
                ORDER BY CASE WHEN e.entry_type = 'folder' THEN 0 ELSE 1 END,
                         e.path, e.id
                LIMIT ?
                """,
                file_values,
            ).fetchall()
            setting_values: List[Any] = []
            setting_where = ""
            if normalized_query:
                setting_where = (
                    "WHERE setting_key LIKE ? ESCAPE '\\' OR setting_group LIKE ? ESCAPE '\\'"
                    " OR scope_type LIKE ? ESCAPE '\\' OR scope_id LIKE ? ESCAPE '\\'"
                    " OR value_json LIKE ? ESCAPE '\\'"
                )
                setting_values.extend([pattern, pattern, pattern, pattern, pattern])
            setting_values.append(safe_limit)
            setting_rows = connection.execute(
                f"""
                SELECT scope_type, scope_id, setting_group, setting_key,
                       value_json, value_type, updated_at
                FROM settings
                {setting_where}
                ORDER BY updated_at DESC, setting_group, setting_key
                LIMIT ?
                """,
                setting_values,
            ).fetchall()

        documents = []
        for row in document_rows:
            item = self._document_summary(row)
            item.update(
                {
                    "checksum": row["checksum"],
                    "sourceMode": row["source_mode"],
                    "folderName": row["folder_name"],
                }
            )
            documents.append(item)

        folders = []
        for row in folder_rows:
            item = self._folder_result(row)
            item["documentCount"] = int(row["document_count"] or 0)
            folders.append(item)

        backups = [
            {
                "id": row["id"],
                "type": row["backup_type"],
                "filePath": row["file_path"],
                "checksumSha256": row["checksum_sha256"],
                "sizeBytes": row["size_bytes"],
                "schemaVersion": row["schema_version"],
                "status": row["status"],
                "errorMessage": row["error_message"],
                "createdAt": row["created_at"],
            }
            for row in backup_rows
        ]

        checkpoints = []
        for row in checkpoint_rows:
            try:
                value = json.loads(row["value_json"])
            except (TypeError, json.JSONDecodeError):
                value = {"status": "invalid_metadata"}
            checkpoints.append(
                {
                    "key": row["key"],
                    "migrationId": str(row["key"]).split(":", 1)[-1],
                    "status": value.get("status"),
                    "fingerprint": value.get("fingerprint"),
                    "applied": value.get("applied"),
                    "verified": value.get("verified"),
                    "backup": value.get("backup"),
                    "completedAt": value.get("completedAt"),
                    "updatedAt": row["updated_at"],
                }
            )

        sources = [
            {
                "id": row["id"],
                "type": row["source_type"],
                "name": row["name"],
                "rootUri": row["root_uri"],
                "syncDirection": row["sync_direction"],
                "isEnabled": bool(row["is_enabled"]),
                "status": row["status"],
                "lastSyncedAt": row["last_synced_at"],
                "createdAt": row["created_at"],
                "updatedAt": row["updated_at"],
            }
            for row in source_rows
        ]
        file_entries = [
            {
                "id": row["id"],
                "sourceId": row["source_id"],
                "sourceName": row["source_name"],
                "parentId": row["parent_id"],
                "entryType": row["entry_type"],
                "path": row["path"],
                "name": row["name"],
                "extension": row["extension"],
                "mimeType": row["mime_type"],
                "sizeBytes": row["size_bytes"],
                "modifiedAt": row["modified_at"],
                "workType": str(row["remote_revision"] or ""),
                "checksum": row["checksum"],
                "syncStatus": row["sync_status"],
                "createdAt": row["created_at"],
                "updatedAt": row["updated_at"],
            }
            for row in file_rows
        ]
        settings = [self._setting_result(row) for row in setting_rows]

        health = self.manager.health()
        return {
            "readOnly": True,
            "query": normalized_query,
            "limit": safe_limit,
            "database": {
                "path": health.get("databasePath"),
                "schemaVersion": health.get("schemaVersion"),
                "sqliteVersion": health.get("sqliteVersion"),
                "journalMode": health.get("journalMode"),
            },
            "counts": {
                "documents": int(count_row["documents"] or 0),
                "deletedDocuments": int(count_row["deleted_documents"] or 0),
                "folders": int(count_row["folders"] or 0),
                "versions": int(count_row["versions"] or 0),
                "backups": int(count_row["backups"] or 0),
                "migrationCheckpoints": int(count_row["migration_checkpoints"] or 0),
                "sources": int(count_row["sources"] or 0),
                "fileEntries": int(count_row["file_entries"] or 0),
                "settings": int(count_row["settings"] or 0),
            },
            "documents": documents,
            "folders": folders,
            "backups": backups,
            "migrationCheckpoints": checkpoints,
            "sources": sources,
            "fileEntries": file_entries,
            "settings": settings,
        }

    def get_explorer_file_entry(self, entry_id: str) -> Dict[str, Any]:
        normalized_id = self._validate_id(entry_id, "fileEntryId")
        with self.manager.connection() as connection:
            row = connection.execute(
                """
                SELECT e.id, e.source_id, s.name AS source_name, e.parent_id,
                       e.entry_type, e.path, e.name, e.extension, e.mime_type,
                       e.content_text, e.size_bytes, e.modified_at, e.remote_revision, e.checksum,
                       e.sync_status, e.created_at, e.updated_at
                FROM file_entries AS e
                JOIN workspace_sources AS s ON s.id = e.source_id
                WHERE e.id = ? AND s.workspace_id = ? AND e.deleted_at IS NULL
                """,
                (normalized_id, self.manager.DEFAULT_WORKSPACE_ID),
            ).fetchone()
        if not row:
            raise RepositoryError("FILE_ENTRY_NOT_FOUND", "File entry not found.", 404)
        return {
            "id": row["id"],
            "sourceId": row["source_id"],
            "sourceName": row["source_name"],
            "parentId": row["parent_id"],
            "entryType": row["entry_type"],
            "path": row["path"],
            "name": row["name"],
            "extension": row["extension"],
            "mimeType": row["mime_type"],
            "content": row["content_text"],
            "sizeBytes": row["size_bytes"],
            "modifiedAt": row["modified_at"],
            "workType": str(row["remote_revision"] or ""),
            "checksum": row["checksum"],
            "syncStatus": row["sync_status"],
            "createdAt": row["created_at"],
            "updatedAt": row["updated_at"],
        }

    def create_folder(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        if not isinstance(payload, dict):
            raise RepositoryError("INVALID_PAYLOAD", "Folder payload must be an object.")
        folder_id = self._validate_id(payload.get("id") or f"folder_{uuid.uuid4().hex}", "folderId")
        parent_id_value = payload.get("parentId")
        parent_id = self._validate_id(parent_id_value, "parentId") if parent_id_value else None
        name = self._validate_title(payload.get("name"))
        now_ms = self._now_ms()
        try:
            with self.manager.write_transaction() as connection:
                if parent_id:
                    self._require_folder(connection, parent_id)
                connection.execute(
                    """
                    INSERT INTO folders
                        (id, workspace_id, parent_id, name, sort_order,
                         is_expanded, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, 1, ?, ?)
                    """,
                    (
                        folder_id,
                        self.manager.DEFAULT_WORKSPACE_ID,
                        parent_id,
                        name,
                        int(payload.get("sortOrder") or 0),
                        now_ms,
                        now_ms,
                    ),
                )
        except sqlite3.IntegrityError as error:
            raise RepositoryError("FOLDER_CONFLICT", "A folder with this name or ID already exists.", 409) from error
        return self.get_folder(folder_id)

    def get_folder(self, folder_id: str) -> Dict[str, Any]:
        normalized_id = self._validate_id(folder_id, "folderId")
        with self.manager.connection() as connection:
            row = self._require_folder(connection, normalized_id)
        return self._folder_result(row)

    def update_folder(self, folder_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        normalized_id = self._validate_id(folder_id, "folderId")
        if normalized_id == self.manager.ROOT_FOLDER_ID:
            raise RepositoryError("ROOT_FOLDER_LOCKED", "ROOT folder cannot be modified.", 409)
        if not isinstance(payload, dict):
            raise RepositoryError("INVALID_PAYLOAD", "Folder payload must be an object.")
        with self.manager.write_transaction() as connection:
            current = self._require_folder(connection, normalized_id)
            name = self._validate_title(payload.get("name", current["name"]))
            parent_value = payload.get("parentId", current["parent_id"])
            parent_id = self._validate_id(parent_value, "parentId") if parent_value else None
            if parent_id:
                self._require_folder(connection, parent_id)
                descendants = connection.execute(
                    """
                    WITH RECURSIVE descendants(id) AS (
                        SELECT id FROM folders WHERE parent_id = ? AND deleted_at IS NULL
                        UNION ALL
                        SELECT child.id FROM folders AS child
                        JOIN descendants AS parent ON child.parent_id = parent.id
                        WHERE child.deleted_at IS NULL
                    )
                    SELECT 1 FROM descendants WHERE id = ? LIMIT 1
                    """,
                    (normalized_id, parent_id),
                ).fetchone()
                if parent_id == normalized_id or descendants:
                    raise RepositoryError("FOLDER_CYCLE", "A folder cannot be moved into itself.", 409)
            try:
                connection.execute(
                    """
                    UPDATE folders
                    SET name = ?, parent_id = ?, sort_order = ?, updated_at = ?
                    WHERE id = ? AND deleted_at IS NULL
                    """,
                    (
                        name,
                        parent_id,
                        int(payload.get("sortOrder", current["sort_order"])),
                        self._now_ms(),
                        normalized_id,
                    ),
                )
            except sqlite3.IntegrityError as error:
                raise RepositoryError("FOLDER_CONFLICT", "Folder update conflicts with existing data.", 409) from error
        return self.get_folder(normalized_id)

    def delete_folder(self, folder_id: str) -> Dict[str, Any]:
        normalized_id = self._validate_id(folder_id, "folderId")
        if normalized_id == self.manager.ROOT_FOLDER_ID:
            raise RepositoryError("ROOT_FOLDER_LOCKED", "ROOT folder cannot be deleted.", 409)
        now_ms = self._now_ms()
        with self.manager.write_transaction() as connection:
            folder = self._require_folder(connection, normalized_id)
            moved_documents = connection.execute(
                "SELECT COUNT(*) FROM documents WHERE folder_id = ? AND deleted_at IS NULL",
                (normalized_id,),
            ).fetchone()[0]
            connection.execute(
                """
                UPDATE documents
                SET folder_id = ?, version = version + 1, updated_at = ?
                WHERE folder_id = ? AND deleted_at IS NULL
                """,
                (self.manager.ROOT_FOLDER_ID, now_ms, normalized_id),
            )
            connection.execute(
                "UPDATE folders SET parent_id = ?, updated_at = ? WHERE parent_id = ? AND deleted_at IS NULL",
                (folder["parent_id"], now_ms, normalized_id),
            )
            connection.execute(
                "UPDATE folders SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL",
                (now_ms, now_ms, normalized_id),
            )
        return {"id": normalized_id, "deleted": True, "movedDocuments": int(moved_documents)}
