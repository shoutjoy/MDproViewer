"""Read-only backup inspection and recoverable deletion for registered SQLite backups."""

from __future__ import annotations

import hashlib
import os
import re
import sqlite3
import time
import uuid
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

from .database import DatabaseManager
from .repositories import RepositoryError


class BackupExplorerService:
    SAFE_BACKUP_ID_RE = re.compile(r"^backup_[A-Za-z0-9]{8,64}$")
    SAFE_FILE_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,180}\.(?:sqlite|sqlite3|db)$", re.IGNORECASE)
    SAMPLE_LIMIT = 100
    COUNT_TABLES = (
        ("documents", "documents"),
        ("folders", "folders"),
        ("documentVersions", "document_versions"),
        ("sources", "workspace_sources"),
        ("fileEntries", "file_entries"),
        ("settings", "settings"),
        ("assets", "assets"),
        ("backupHistory", "backup_history"),
    )

    def __init__(self, manager: DatabaseManager) -> None:
        self.manager = manager
        self.backup_root = (self.manager.data_root / "backups").resolve()
        self.trash_root = (self.backup_root / "trash").resolve()

    def _backup_id(self, value: Any) -> str:
        backup_id = str(value or "").strip()
        if not self.SAFE_BACKUP_ID_RE.fullmatch(backup_id):
            raise RepositoryError("BACKUP_ID_INVALID", "Backup ID is invalid.")
        return backup_id

    def _record(self, backup_id: str) -> sqlite3.Row:
        with self.manager.connection() as connection:
            row = connection.execute(
                """
                SELECT id, workspace_id, backup_type, file_path, checksum_sha256,
                       size_bytes, schema_version, status, error_message, created_at
                FROM backup_history
                WHERE id = ? AND (workspace_id = ? OR workspace_id IS NULL)
                """,
                (backup_id, self.manager.DEFAULT_WORKSPACE_ID),
            ).fetchone()
        if not row:
            raise RepositoryError("BACKUP_NOT_FOUND", "Backup record was not found.", 404)
        return row

    def _resolve_path(self, row: sqlite3.Row, *, require_file: bool) -> Path:
        raw_path = Path(str(row["file_path"] or ""))
        if raw_path.is_absolute():
            unresolved_candidate = raw_path
        else:
            unresolved_candidate = self.manager.app_root / raw_path
            if not unresolved_candidate.exists():
                unresolved_candidate = self.backup_root / raw_path.name
        if unresolved_candidate.is_symlink():
            raise RepositoryError("BACKUP_SYMLINK_BLOCKED", "Symbolic-link backup paths are not allowed.", 409)
        candidate = unresolved_candidate.resolve()
        if candidate == self.manager.db_path.resolve():
            raise RepositoryError("BACKUP_CURRENT_DATABASE_BLOCKED", "The active SQLite database cannot be inspected or deleted as a backup.", 409)
        try:
            candidate.relative_to(self.backup_root)
        except ValueError as error:
            raise RepositoryError("BACKUP_PATH_OUTSIDE_ROOT", "Backup path is outside the managed backup folder.", 409) from error
        if not self.SAFE_FILE_RE.fullmatch(candidate.name):
            raise RepositoryError("BACKUP_FILE_NAME_INVALID", "Backup file name is invalid.", 409)
        if require_file and (not candidate.is_file() or candidate.is_symlink()):
            raise RepositoryError("BACKUP_FILE_MISSING", "The registered backup file is missing.", 410)
        return candidate

    @staticmethod
    def _sha256_file(path: Path) -> str:
        digest = hashlib.sha256()
        with path.open("rb") as source:
            for chunk in iter(lambda: source.read(1024 * 1024), b""):
                digest.update(chunk)
        return digest.hexdigest()

    @staticmethod
    def _has_table(connection: sqlite3.Connection, table: str) -> bool:
        return connection.execute(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
            (table,),
        ).fetchone() is not None

    @classmethod
    def _count(cls, connection: sqlite3.Connection, table: str) -> int:
        if not cls._has_table(connection, table):
            return 0
        return int(connection.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0] or 0)

    @classmethod
    def _rows(cls, connection: sqlite3.Connection, table: str, sql: str) -> List[Dict[str, Any]]:
        if not cls._has_table(connection, table):
            return []
        return [dict(row) for row in connection.execute(sql, (cls.SAMPLE_LIMIT,)).fetchall()]

    @staticmethod
    def _readonly_connection(path: Path) -> sqlite3.Connection:
        connection = sqlite3.connect(
            path.as_uri() + "?mode=ro&immutable=1",
            uri=True,
            timeout=5.0,
            isolation_level=None,
            check_same_thread=False,
        )
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA query_only = ON")
        connection.execute("PRAGMA busy_timeout = 5000")
        return connection

    def get_detail(self, backup_id: Any) -> Dict[str, Any]:
        normalized_id = self._backup_id(backup_id)
        row = self._record(normalized_id)
        path = self._resolve_path(row, require_file=True)
        actual_size = path.stat().st_size
        actual_checksum = self._sha256_file(path)
        expected_checksum = str(row["checksum_sha256"] or "").lower()
        expected_size = int(row["size_bytes"] or 0)
        try:
            connection = self._readonly_connection(path)
        except sqlite3.Error as error:
            raise RepositoryError("BACKUP_OPEN_FAILED", "Backup database could not be opened read-only.", 409) from error
        try:
            integrity = [str(item[0]) for item in connection.execute("PRAGMA integrity_check").fetchall()]
            foreign_key_rows = connection.execute("PRAGMA foreign_key_check").fetchall()
            counts = {name: self._count(connection, table) for name, table in self.COUNT_TABLES}
            documents = self._rows(
                connection,
                "documents",
                """
                SELECT id, title, content_format AS contentFormat, version,
                       length(content) AS contentBytes, created_at AS createdAt,
                       updated_at AS updatedAt, CASE WHEN deleted_at IS NULL THEN 0 ELSE 1 END AS deleted
                FROM documents ORDER BY updated_at DESC, id LIMIT ?
                """,
            )
            folders = self._rows(
                connection,
                "folders",
                """
                SELECT id, parent_id AS parentId, name, created_at AS createdAt,
                       updated_at AS updatedAt, CASE WHEN deleted_at IS NULL THEN 0 ELSE 1 END AS deleted
                FROM folders ORDER BY sort_order, name, id LIMIT ?
                """,
            )
            files = self._rows(
                connection,
                "file_entries",
                """
                SELECT id, entry_type AS entryType, path, name, extension,
                       mime_type AS mimeType, size_bytes AS sizeBytes, updated_at AS updatedAt
                FROM file_entries WHERE deleted_at IS NULL ORDER BY updated_at DESC, path LIMIT ?
                """,
            )
            settings = self._rows(
                connection,
                "settings",
                """
                SELECT setting_key AS key, setting_group AS `group`, scope_type AS scopeType,
                       scope_id AS scopeId, value_type AS valueType, updated_at AS updatedAt
                FROM settings ORDER BY setting_group, setting_key, scope_id LIMIT ?
                """,
            )
            assets = self._rows(
                connection,
                "assets",
                """
                SELECT id, asset_type AS assetType, original_name AS originalName,
                       mime_type AS mimeType, size_bytes AS sizeBytes, created_at AS createdAt
                FROM assets ORDER BY created_at DESC, id LIMIT ?
                """,
            )
        except sqlite3.Error as error:
            raise RepositoryError("BACKUP_INSPECTION_FAILED", "Backup database contents could not be inspected.", 409) from error
        finally:
            connection.close()
        return {
            "id": row["id"],
            "type": row["backup_type"],
            "status": row["status"],
            "fileName": path.name,
            "filePath": str(row["file_path"]),
            "sizeBytes": actual_size,
            "recordedSizeBytes": expected_size,
            "checksumSha256": actual_checksum,
            "recordedChecksumSha256": expected_checksum,
            "checksumMatches": bool(expected_checksum) and expected_checksum == actual_checksum,
            "sizeMatches": expected_size == 0 or expected_size == actual_size,
            "schemaVersion": int(row["schema_version"] or 0),
            "createdAt": row["created_at"],
            "integrity": integrity,
            "foreignKeyViolations": len(foreign_key_rows),
            "ok": integrity == ["ok"] and not foreign_key_rows
                  and (not expected_checksum or expected_checksum == actual_checksum)
                  and (expected_size == 0 or expected_size == actual_size),
            "counts": counts,
            "documents": documents,
            "folders": folders,
            "files": files,
            "settings": settings,
            "assets": assets,
            "sampleLimit": self.SAMPLE_LIMIT,
            "readOnly": True,
            "sensitiveValuesIncluded": False,
        }

    def delete_backup(self, backup_id: Any, confirmation: Any) -> Dict[str, Any]:
        normalized_id = self._backup_id(backup_id)
        expected_confirmation = f"DELETE_BACKUP:{normalized_id}"
        if str(confirmation or "") != expected_confirmation:
            raise RepositoryError("BACKUP_DELETE_CONFIRMATION_REQUIRED", "Backup deletion confirmation is invalid.", 409)
        row = self._record(normalized_id)
        source = self._resolve_path(row, require_file=False)
        moved: List[tuple[Path, Path]] = []
        self.trash_root.mkdir(parents=True, exist_ok=True)
        try:
            if source.is_file() and not source.is_symlink():
                suffix = f"{int(time.time() * 1000)}_{uuid.uuid4().hex[:8]}_{normalized_id}_{source.name}"
                destination = (self.trash_root / suffix).resolve()
                destination.relative_to(self.trash_root)
                os.replace(source, destination)
                moved.append((source, destination))
                for sidecar_suffix in ("-wal", "-shm"):
                    sidecar = Path(str(source) + sidecar_suffix)
                    if sidecar.is_file() and not sidecar.is_symlink():
                        sidecar_destination = Path(str(destination) + sidecar_suffix)
                        os.replace(sidecar, sidecar_destination)
                        moved.append((sidecar, sidecar_destination))
            with self.manager.write_transaction() as connection:
                deleted = connection.execute(
                    "DELETE FROM backup_history WHERE id = ? AND (workspace_id = ? OR workspace_id IS NULL)",
                    (normalized_id, self.manager.DEFAULT_WORKSPACE_ID),
                ).rowcount
                if deleted != 1:
                    raise RepositoryError("BACKUP_NOT_FOUND", "Backup record was not found.", 404)
        except Exception:
            for original, trashed in reversed(moved):
                if trashed.is_file() and not original.exists():
                    os.replace(trashed, original)
            raise
        return {
            "id": normalized_id,
            "deleted": True,
            "recoverable": bool(moved),
            "trashPath": (
                moved[0][1].relative_to(self.manager.app_root).as_posix()
                if moved and self.manager.app_root in moved[0][1].parents else (str(moved[0][1]) if moved else None)
            ),
            "fileWasMissing": not bool(moved),
        }
