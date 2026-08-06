"""Tests read-only backup inspection and recoverable backup deletion."""

from __future__ import annotations

import json
import sys
import tempfile
import time
import uuid
from pathlib import Path


APP_ROOT = Path(__file__).resolve().parents[1]
if str(APP_ROOT) not in sys.path:
    sys.path.insert(0, str(APP_ROOT))

from LocalSave_sqlite.server.backup_explorer import BackupExplorerService  # noqa: E402
from LocalSave_sqlite.server.database import DatabaseManager  # noqa: E402
from LocalSave_sqlite.server.repositories import RepositoryError, StorageRepository  # noqa: E402


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def expect_error(action, code: str) -> None:
    try:
        action()
    except RepositoryError as error:
        require(error.code == code, f"expected {code}, received {error.code}")
    else:
        raise AssertionError(f"expected {code}")


def insert_backup_record(manager: DatabaseManager, backup_id: str, file_path: str) -> None:
    now_ms = int(time.time() * 1000)
    with manager.write_transaction() as connection:
        connection.execute(
            """
            INSERT INTO backup_history
                (id, workspace_id, backup_type, file_path, checksum_sha256,
                 size_bytes, schema_version, manifest_json, status, created_at)
            VALUES (?, ?, 'manual', ?, '', 0, 3, '{}', 'completed', ?)
            """,
            (backup_id, manager.DEFAULT_WORKSPACE_ID, file_path, now_ms),
        )


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="sqlite-backup-explorer-", dir=APP_ROOT / "LocalSave_sqlite") as temp_name:
        manager = DatabaseManager(APP_ROOT, data_root=Path(temp_name) / "data")
        manager.initialize()
        repository = StorageRepository(manager)
        repository.create_document(
            {"id": "doc_backup_view", "title": "백업에서 보이는 제목", "content": "본문은 응답에 나오면 안 됩니다."}
        )
        secret_value = "VALUE_MUST_NOT_APPEAR_987"
        with manager.write_transaction() as connection:
            connection.execute(
                """
                INSERT INTO settings
                    (scope_type, scope_id, setting_group, setting_key, value_json, value_type, updated_at)
                VALUES ('global', '', 'ui', 'backupExplorerProbe', ?, 'string', ?)
                """,
                (json.dumps(secret_value), int(time.time() * 1000)),
            )

        backup = manager.create_online_backup("manual")
        source_path = APP_ROOT / backup["filePath"]
        require(source_path.is_file(), "online backup file was not created")
        service = BackupExplorerService(manager)

        detail = service.get_detail(backup["id"])
        require(detail["readOnly"] is True, "backup detail must be read-only")
        require(detail["sensitiveValuesIncluded"] is False, "sensitive-value marker mismatch")
        require(detail["ok"] is True, "backup integrity result failed")
        require(detail["checksumMatches"] is True, "backup checksum mismatch")
        require(detail["counts"]["documents"] == 1, "document count mismatch")
        require(detail["counts"]["settings"] == 1, "setting count mismatch")
        require(detail["documents"][0]["title"] == "백업에서 보이는 제목", "document metadata missing")
        require("content" not in detail["documents"][0], "document body leaked")
        require("value" not in detail["settings"][0], "setting value leaked")
        require(secret_value not in json.dumps(detail, ensure_ascii=False), "secret setting leaked")

        expect_error(
            lambda: service.delete_backup(backup["id"], "DELETE_BACKUP:wrong"),
            "BACKUP_DELETE_CONFIRMATION_REQUIRED",
        )
        require(source_path.is_file(), "invalid confirmation changed backup file")

        current_id = "backup_" + uuid.uuid4().hex
        insert_backup_record(manager, current_id, manager._display_path())
        expect_error(lambda: service.get_detail(current_id), "BACKUP_CURRENT_DATABASE_BLOCKED")

        outside_id = "backup_" + uuid.uuid4().hex
        outside_path = Path(temp_name) / "outside.sqlite"
        outside_path.write_bytes(b"not-a-database")
        insert_backup_record(manager, outside_id, str(outside_path))
        expect_error(lambda: service.get_detail(outside_id), "BACKUP_PATH_OUTSIDE_ROOT")

        missing_id = "backup_" + uuid.uuid4().hex
        expect_error(lambda: service.get_detail(missing_id), "BACKUP_NOT_FOUND")

        deleted = service.delete_backup(backup["id"], "DELETE_BACKUP:" + backup["id"])
        require(deleted["deleted"] is True, "backup deletion result mismatch")
        require(deleted["recoverable"] is True, "backup should be recoverable")
        require(not source_path.exists(), "deleted backup remained in source folder")
        trash_path = APP_ROOT / deleted["trashPath"]
        require(trash_path.is_file(), "backup was not moved to managed trash")
        with manager.connection() as connection:
            remaining = connection.execute("SELECT COUNT(*) FROM backup_history WHERE id = ?", (backup["id"],)).fetchone()[0]
        require(remaining == 0, "deleted backup history row remained")
        expect_error(
            lambda: service.delete_backup(backup["id"], "DELETE_BACKUP:" + backup["id"]),
            "BACKUP_NOT_FOUND",
        )

        stale_id = "backup_" + uuid.uuid4().hex
        stale_relative = (manager.data_root / "backups" / "missing.sqlite").relative_to(APP_ROOT).as_posix()
        insert_backup_record(manager, stale_id, stale_relative)
        stale_deleted = service.delete_backup(stale_id, "DELETE_BACKUP:" + stale_id)
        require(stale_deleted["fileWasMissing"] is True, "stale backup record was not removed safely")
        require(stale_deleted["recoverable"] is False, "missing backup cannot be recoverable")

        print("SQLite backup explorer tests passed")


if __name__ == "__main__":
    main()
