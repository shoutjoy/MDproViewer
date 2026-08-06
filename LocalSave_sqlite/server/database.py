"""SQLite initialization and health operations for MD Viewer.

The browser never sends SQL to this module. Higher-level repositories will be
added behind the local API as each storage phase is implemented.
"""

from __future__ import annotations

import hashlib
import json
import os
import sqlite3
import threading
import time
import uuid
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Dict, Iterator, Optional


class DatabaseConfigurationError(RuntimeError):
    """Raised when a database path or schema configuration is unsafe."""


class DatabaseInitializationError(RuntimeError):
    """Raised when the database cannot be initialized safely."""


class DatabaseManager:
    DEFAULT_PROFILE_ID = "profile_default"
    DEFAULT_WORKSPACE_ID = "workspace_default"
    ROOT_FOLDER_ID = "root"

    def __init__(
        self,
        app_root: Path,
        data_root: Optional[Path] = None,
        db_path: Optional[Path] = None,
    ) -> None:
        self.app_root = Path(app_root).resolve()
        self.sqlite_root = self.app_root / "LocalSave_sqlite"
        self.schema_path = self.sqlite_root / "migrations" / "001_initial_v3.sql"
        self.manifest_path = self.sqlite_root / "migrations" / "manifest.json"

        configured_root = data_root or os.environ.get("MD_VIEWER_SQLITE_ROOT")
        self.data_root = Path(configured_root or (self.sqlite_root / "data")).resolve()

        configured_db = db_path or os.environ.get("MD_VIEWER_SQLITE_PATH")
        candidate = Path(configured_db) if configured_db else Path("mdpro.sqlite")
        if not candidate.is_absolute():
            candidate = self.data_root / candidate
        self.db_path = candidate.resolve()
        self._assert_path_is_allowed(self.db_path)

        # Every connection participates in this lock so a restore can wait for
        # in-flight readers/writers to close before replacing the live files.
        self._access_lock = threading.RLock()
        self._init_lock = threading.RLock()
        self._write_lock = threading.RLock()
        self._initialized = False
        self._schema_version: Optional[int] = None

    def _assert_path_is_allowed(self, path: Path) -> None:
        try:
            path.relative_to(self.data_root)
        except ValueError as error:
            raise DatabaseConfigurationError(
                "The SQLite database path must stay inside the configured data root."
            ) from error
        if path.suffix.lower() not in {".sqlite", ".sqlite3", ".db"}:
            raise DatabaseConfigurationError("The SQLite database file extension is not allowed.")

    def _read_manifest(self) -> Dict[str, Any]:
        try:
            manifest = json.loads(self.manifest_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            raise DatabaseInitializationError("The SQLite validation manifest cannot be read.") from error
        if not isinstance(manifest, dict) or not isinstance(manifest.get("schema_version"), int):
            raise DatabaseInitializationError("The SQLite validation manifest is invalid.")
        return manifest

    def _read_verified_schema(self, manifest: Dict[str, Any]) -> str:
        try:
            schema_bytes = self.schema_path.read_bytes()
        except OSError as error:
            raise DatabaseInitializationError("The SQLite schema file cannot be read.") from error

        actual_checksum = hashlib.sha256(schema_bytes).hexdigest()
        expected_checksum = str(manifest.get("schema_checksum_sha256") or "").lower()
        if not expected_checksum or actual_checksum.lower() != expected_checksum:
            raise DatabaseInitializationError("The SQLite schema checksum does not match the manifest.")
        try:
            return schema_bytes.decode("utf-8")
        except UnicodeDecodeError as error:
            raise DatabaseInitializationError("The SQLite schema is not valid UTF-8.") from error

    def _open_connection(self) -> sqlite3.Connection:
        connection = sqlite3.connect(
            str(self.db_path),
            timeout=5.0,
            isolation_level=None,
            check_same_thread=False,
        )
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA busy_timeout = 5000")
        connection.execute("PRAGMA synchronous = NORMAL")
        connection.execute("PRAGMA temp_store = MEMORY")
        connection.execute("PRAGMA recursive_triggers = ON")
        return connection

    def initialize(self) -> Dict[str, Any]:
        with self._access_lock, self._init_lock:
            if self._initialized:
                return self.health()

            manifest = self._read_manifest()
            schema_sql = self._read_verified_schema(manifest)
            expected_version = int(manifest["schema_version"])
            self.data_root.mkdir(parents=True, exist_ok=True)

            connection = self._open_connection()
            try:
                has_migrations = connection.execute(
                    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'"
                ).fetchone()
                if not has_migrations:
                    connection.executescript(schema_sql)

                version_row = connection.execute(
                    "SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations"
                ).fetchone()
                current_version = int(version_row["version"] if version_row else 0)
                if current_version < expected_version:
                    connection.executescript(schema_sql)
                    version_row = connection.execute(
                        "SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations"
                    ).fetchone()
                    current_version = int(version_row["version"] if version_row else 0)
                if current_version != expected_version:
                    raise DatabaseInitializationError(
                        "The SQLite schema version is unsupported by this application."
                    )

                self._ensure_bootstrap_rows(connection, expected_version)
                quick_check = connection.execute("PRAGMA quick_check").fetchone()
                if not quick_check or str(quick_check[0]).lower() != "ok":
                    raise DatabaseInitializationError("SQLite quick_check did not return ok.")

                self._schema_version = current_version
                self._initialized = True
            except sqlite3.Error as error:
                raise DatabaseInitializationError("SQLite initialization failed.") from error
            finally:
                connection.close()

            return self.health()

    def _ensure_bootstrap_rows(self, connection: sqlite3.Connection, schema_version: int) -> None:
        now_ms = int(time.time() * 1000)
        with self._write_lock:
            connection.execute("BEGIN IMMEDIATE")
            try:
                connection.execute(
                    """
                    INSERT OR IGNORE INTO profiles
                        (id, display_name, prefix_enabled, created_at, updated_at)
                    VALUES (?, ?, 0, ?, ?)
                    """,
                    (self.DEFAULT_PROFILE_ID, "Default User", now_ms, now_ms),
                )
                connection.execute(
                    """
                    INSERT OR IGNORE INTO workspaces
                        (id, owner_profile_id, name, workspace_type, locale,
                         created_at, updated_at, last_opened_at)
                    VALUES (?, ?, ?, 'research', 'ko-KR', ?, ?, ?)
                    """,
                    (
                        self.DEFAULT_WORKSPACE_ID,
                        self.DEFAULT_PROFILE_ID,
                        "MD Viewer",
                        now_ms,
                        now_ms,
                        now_ms,
                    ),
                )
                connection.execute(
                    """
                    INSERT OR IGNORE INTO folders
                        (id, workspace_id, parent_id, name, sort_order,
                         is_expanded, created_at, updated_at)
                    VALUES (?, ?, NULL, 'ROOT', 0, 1, ?, ?)
                    """,
                    (self.ROOT_FOLDER_ID, self.DEFAULT_WORKSPACE_ID, now_ms, now_ms),
                )
                connection.execute(
                    """
                    INSERT INTO app_meta (key, value_json, updated_at)
                    VALUES ('local_storage', ?, ?)
                    ON CONFLICT(key) DO UPDATE SET
                        value_json = excluded.value_json,
                        updated_at = excluded.updated_at
                    """,
                    (json.dumps({"schemaVersion": schema_version}), now_ms),
                )
                connection.execute("COMMIT")
            except Exception:
                connection.execute("ROLLBACK")
                raise

    @contextmanager
    def connection(self) -> Iterator[sqlite3.Connection]:
        with self._access_lock:
            if not self._initialized:
                self.initialize()
            connection = self._open_connection()
            try:
                yield connection
            finally:
                connection.close()

    @contextmanager
    def write_transaction(self) -> Iterator[sqlite3.Connection]:
        with self._access_lock, self._write_lock:
            if not self._initialized:
                self.initialize()
            connection = self._open_connection()
            try:
                connection.execute("BEGIN IMMEDIATE")
                yield connection
                connection.execute("COMMIT")
            except Exception:
                try:
                    connection.execute("ROLLBACK")
                except sqlite3.Error:
                    pass
                raise
            finally:
                connection.close()

    @contextmanager
    def exclusive_write(self) -> Iterator[None]:
        """Hold the process write lock across backup and a related transaction."""
        with self._access_lock, self._write_lock:
            yield

    @contextmanager
    def exclusive_maintenance(self) -> Iterator[None]:
        """Wait for all DB users and block new connections during file replacement."""
        with self._access_lock, self._write_lock:
            yield

    def checkpoint_for_replacement(self) -> None:
        """Flush WAL content while the caller holds (or acquires) maintenance access."""
        with self._access_lock, self._write_lock:
            connection = self._open_connection()
            try:
                result = connection.execute("PRAGMA wal_checkpoint(TRUNCATE)").fetchone()
                if result and int(result[0]) != 0:
                    raise DatabaseInitializationError("SQLite WAL checkpoint remained busy.")
            finally:
                connection.close()

    def reload_replaced_database(self) -> Dict[str, Any]:
        """Forget cached schema state and validate the database now at ``db_path``."""
        with self._access_lock, self._write_lock:
            self._initialized = False
            self._schema_version = None
            return self.initialize()

    def create_online_backup(self, backup_type: str = "pre_migration") -> Dict[str, Any]:
        if backup_type not in {"manual", "daily", "weekly", "pre_migration", "pre_update"}:
            raise DatabaseConfigurationError("SQLite backup type is invalid.")
        if not self._initialized:
            self.initialize()

        now_ms = int(time.time() * 1000)
        backup_id = f"backup_{uuid.uuid4().hex}"
        backup_dir = (self.data_root / "backups").resolve()
        try:
            backup_dir.relative_to(self.data_root)
        except ValueError as error:
            raise DatabaseConfigurationError("SQLite backup path is outside the data root.") from error
        backup_dir.mkdir(parents=True, exist_ok=True)
        backup_path = backup_dir / f"{backup_type}_{now_ms}_{backup_id[-8:]}.sqlite"

        with self._access_lock, self._write_lock:
            source = self._open_connection()
            destination = sqlite3.connect(str(backup_path), timeout=5.0, isolation_level=None)
            try:
                source.backup(destination)
                integrity = destination.execute("PRAGMA integrity_check").fetchone()
                foreign_keys = destination.execute("PRAGMA foreign_key_check").fetchall()
                if not integrity or str(integrity[0]).lower() != "ok" or foreign_keys:
                    raise DatabaseInitializationError("SQLite online backup verification failed.")
            except Exception:
                destination.close()
                source.close()
                if backup_path.is_file():
                    backup_path.unlink()
                raise
            else:
                destination.close()
                source.close()

            digest = hashlib.sha256()
            with backup_path.open("rb") as backup_file:
                for chunk in iter(lambda: backup_file.read(1024 * 1024), b""):
                    digest.update(chunk)
            checksum = digest.hexdigest()
            size_bytes = backup_path.stat().st_size
            try:
                display_path = backup_path.relative_to(self.app_root).as_posix()
            except ValueError:
                display_path = backup_path.name
            manifest = {
                "backupId": backup_id,
                "backupType": backup_type,
                "databasePath": self._display_path(),
                "schemaVersion": int(self._schema_version or 0),
                "createdAt": now_ms,
            }
            with self.write_transaction() as connection:
                connection.execute(
                    """
                    INSERT INTO backup_history
                        (id, workspace_id, backup_type, file_path, checksum_sha256,
                         size_bytes, schema_version, manifest_json, status, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?)
                    """,
                    (
                        backup_id,
                        self.DEFAULT_WORKSPACE_ID,
                        backup_type,
                        display_path,
                        checksum,
                        size_bytes,
                        int(self._schema_version or 0),
                        json.dumps(manifest, ensure_ascii=False, separators=(",", ":")),
                        now_ms,
                    ),
                )
        return {
            "id": backup_id,
            "type": backup_type,
            "filePath": display_path,
            "checksumSha256": checksum,
            "sizeBytes": size_bytes,
            "schemaVersion": int(self._schema_version or 0),
            "createdAt": now_ms,
        }

    def _display_path(self) -> str:
        try:
            return self.db_path.relative_to(self.app_root).as_posix()
        except ValueError:
            return self.db_path.name

    def health(self) -> Dict[str, Any]:
        if not self._initialized:
            return self.initialize()
        with self.connection() as connection:
            journal_mode = str(connection.execute("PRAGMA journal_mode").fetchone()[0])
            foreign_keys = bool(connection.execute("PRAGMA foreign_keys").fetchone()[0])
            sqlite_version = str(connection.execute("SELECT sqlite_version()").fetchone()[0])
        return {
            "available": True,
            "databasePath": self._display_path(),
            "schemaVersion": self._schema_version,
            "sqliteVersion": sqlite_version,
            "journalMode": journal_mode,
            "foreignKeys": foreign_keys,
            "readable": self.db_path.is_file(),
            "writable": os.access(self.db_path, os.W_OK),
        }

    def bootstrap(self) -> Dict[str, Any]:
        with self.connection() as connection:
            profile = connection.execute(
                "SELECT id, display_name, academic_id, major, contact, email, prefix_enabled "
                "FROM profiles WHERE id = ? AND deleted_at IS NULL",
                (self.DEFAULT_PROFILE_ID,),
            ).fetchone()
            workspace = connection.execute(
                "SELECT id, owner_profile_id, name, workspace_type, locale, last_opened_at "
                "FROM workspaces WHERE id = ? AND deleted_at IS NULL",
                (self.DEFAULT_WORKSPACE_ID,),
            ).fetchone()
            root_folder = connection.execute(
                "SELECT id, workspace_id, parent_id, name, sort_order, is_expanded "
                "FROM folders WHERE id = ? AND deleted_at IS NULL",
                (self.ROOT_FOLDER_ID,),
            ).fetchone()
        return {
            "profile": dict(profile) if profile else None,
            "workspace": dict(workspace) if workspace else None,
            "rootFolder": dict(root_folder) if root_folder else None,
        }

    def integrity_check(self) -> Dict[str, Any]:
        with self.connection() as connection:
            integrity_rows = [str(row[0]) for row in connection.execute("PRAGMA integrity_check")]
            foreign_key_rows = [dict(row) for row in connection.execute("PRAGMA foreign_key_check")]
        return {
            "integrity": integrity_rows,
            "foreignKeyViolations": foreign_key_rows,
            "ok": integrity_rows == ["ok"] and not foreign_key_rows,
        }
