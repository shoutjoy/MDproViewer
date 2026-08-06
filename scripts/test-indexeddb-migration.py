"""Tests for the read-only IndexedDB to SQLite migration preview."""

from __future__ import annotations

import hashlib
import json
import sqlite3
import sys
import tempfile
from pathlib import Path


APP_ROOT = Path(__file__).resolve().parents[1]
if str(APP_ROOT) not in sys.path:
    sys.path.insert(0, str(APP_ROOT))

from LocalSave_sqlite.server.database import DatabaseManager  # noqa: E402
from LocalSave_sqlite.server.migrations import IndexedDbMigrationService  # noqa: E402
from LocalSave_sqlite.server.repositories import RepositoryError, StorageRepository  # noqa: E402


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def checksum(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="sqlite-migration-preview-", dir=APP_ROOT / "LocalSave_sqlite") as temp_name:
        manager = DatabaseManager(APP_ROOT, data_root=Path(temp_name) / "data")
        manager.initialize()
        repository = StorageRepository(manager)
        repository.create_folder({"id": "folder_existing", "name": "기존 폴더", "parentId": "root"})
        repository.create_document(
            {"id": "doc_same", "folderId": "folder_existing", "title": "같은 문서", "content": "동일 본문"}
        )
        repository.create_document(
            {"id": "doc_conflict", "folderId": "root", "title": "서버 문서", "content": "서버 본문"}
        )
        service = IndexedDbMigrationService(manager, repository)
        before_documents = len(repository.list_documents(limit=100))
        before_folders = len(repository.list_folders())

        result = service.preview(
            {
                "source": {"database": "MarkdownProDB", "version": 5},
                "folders": [
                    {"id": "root", "name": "ROOT", "parentId": None},
                    {"id": "folder_existing", "name": "기존 폴더", "parentId": "root"},
                    {"id": "folder_new", "name": "새 폴더", "parentId": "root"},
                    {"id": "bad folder", "name": "잘못된 ID"},
                    {"id": "folder_existing", "name": "중복 원본", "parentId": "root"},
                ],
                "documents": [
                    {
                        "id": "doc_same",
                        "folderId": "folder_existing",
                        "title": "같은 문서",
                        "content": "동일 본문",
                        "checksum": checksum("동일 본문"),
                    },
                    {"id": "doc_same", "folderId": "root", "title": "원본 중복", "content": "x"},
                    {
                        "id": "doc_conflict",
                        "folderId": "root",
                        "title": "로컬 문서",
                        "content": "로컬 본문",
                        "checksum": checksum("로컬 본문"),
                    },
                    {
                        "id": "doc_new",
                        "folderId": "folder_new",
                        "title": "새 문서",
                        "content": "새 본문",
                        "checksum": checksum("새 본문"),
                    },
                    {
                        "id": "doc_bad_checksum",
                        "folderId": "root",
                        "title": "checksum 오류",
                        "content": "본문",
                        "checksum": "0" * 64,
                    },
                ],
            }
        )

        summary = result["summary"]
        require(result["previewOnly"] is True, "preview must be explicitly read-only")
        require(summary["sourceCount"] == 10, "source count mismatch")
        require(summary["newCount"] == 2, "new count mismatch")
        require(summary["duplicateCount"] == 3, "duplicate count mismatch")
        require(summary["conflictCount"] == 1, "conflict count mismatch")
        require(summary["excludedCount"] == 4, "excluded count mismatch")
        require(len(repository.list_documents(limit=100)) == before_documents, "preview wrote documents")
        require(len(repository.list_folders()) == before_folders, "preview wrote folders")
        require(manager.integrity_check()["ok"] is True, "preview damaged the temporary DB")

        blocker_batch = {
            "source": {"database": "MarkdownProDB", "version": 5},
            "folders": [{"id": "root", "name": "ROOT", "parentId": None}],
            "documents": [
                {
                    "id": "doc_conflict",
                    "folderId": "root",
                    "title": "충돌 로컬",
                    "content": "충돌 로컬 본문",
                    "checksum": checksum("충돌 로컬 본문"),
                }
            ],
        }
        blocker_preview = service.preview(blocker_batch)
        blocker_batch["previewFingerprint"] = blocker_preview["batchFingerprint"]
        blocker_batch["migrationId"] = blocker_preview["migrationId"]
        try:
            service.apply(blocker_batch)
        except RepositoryError as error:
            require(error.code == "MIGRATION_PREVIEW_HAS_BLOCKERS", "blocked apply error mismatch")
        else:
            raise AssertionError("conflicted migration apply must be blocked")
        with manager.connection() as connection:
            require(connection.execute("SELECT COUNT(*) FROM backup_history").fetchone()[0] == 0, "blocked apply created backup")

        clean_batch = {
            "source": {"database": "MarkdownProDB", "version": 5},
            "folders": [
                {"id": "root", "name": "ROOT", "parentId": None},
                {"id": "folder_child_new", "name": "새 하위", "parentId": "folder_parent_new"},
                {"id": "folder_parent_new", "name": "새 상위", "parentId": "root"},
            ],
            "documents": [
                {
                    "id": "doc_same",
                    "folderId": "folder_existing",
                    "title": "같은 문서",
                    "content": "동일 본문",
                    "checksum": checksum("동일 본문"),
                },
                {
                    "id": "doc_new_apply",
                    "folderId": "folder_child_new",
                    "title": "실제 이관 문서",
                    "content": "이관 본문 checksum 검증",
                    "checksum": checksum("이관 본문 checksum 검증"),
                    "createdAt": 1785970000000,
                    "updatedAt": 1785971000000,
                },
            ],
        }
        clean_preview = service.preview(clean_batch)
        require(clean_preview["summary"]["newCount"] == 3, "clean preview new count mismatch")
        require(clean_preview["summary"]["conflictCount"] == 0, "clean preview has conflicts")
        clean_batch["previewFingerprint"] = clean_preview["batchFingerprint"]
        clean_batch["migrationId"] = clean_preview["migrationId"]
        stale_batch = dict(clean_batch)
        stale_batch["previewFingerprint"] = "0" * 64
        try:
            service.apply(stale_batch)
        except RepositoryError as error:
            require(error.code == "MIGRATION_PREVIEW_STALE", "stale preview error mismatch")
        else:
            raise AssertionError("stale migration preview must be rejected")
        applied = service.apply(clean_batch)
        require(applied["status"] == "completed", "migration apply did not complete")
        require(
            applied["applied"] == {"folders": 2, "documents": 1, "fileSources": 0, "fileFolders": 0, "files": 0, "settings": 0},
            "applied count mismatch",
        )
        require(applied["sourcePreserved"] is True, "source preservation flag missing")
        require(
            applied["verified"] == {"folders": 3, "documents": 2, "fileSources": 0, "fileFolders": 0, "files": 0, "settings": 0},
            "verification count mismatch",
        )
        require(applied["backup"] and applied["backup"]["checksumSha256"], "pre-migration backup missing")

        backup_path = APP_ROOT / applied["backup"]["filePath"]
        require(backup_path.is_file(), "online backup file does not exist")
        require(
            hashlib.sha256(backup_path.read_bytes()).hexdigest() == applied["backup"]["checksumSha256"],
            "online backup checksum mismatch",
        )
        backup_connection = sqlite3.connect(str(backup_path))
        try:
            backup_count = backup_connection.execute(
                "SELECT COUNT(*) FROM documents WHERE id = 'doc_new_apply'"
            ).fetchone()[0]
            backup_integrity = backup_connection.execute("PRAGMA integrity_check").fetchone()[0]
        finally:
            backup_connection.close()
        require(backup_count == 0, "pre-migration backup contains migrated document")
        require(str(backup_integrity).lower() == "ok", "pre-migration backup integrity failed")

        migrated = repository.get_document("doc_new_apply")
        require(migrated["checksum"] == checksum("이관 본문 checksum 검증"), "migrated checksum mismatch")
        require(migrated["folderId"] == "folder_child_new", "migrated folder relationship mismatch")
        require(migrated["sourceMode"] == "legacy_indb", "migration source mode mismatch")
        with manager.connection() as connection:
            version = connection.execute(
                "SELECT change_type, checksum FROM document_versions WHERE document_id = ? AND version_no = 1",
                ("doc_new_apply",),
            ).fetchone()
            checkpoint_row = connection.execute(
                "SELECT value_json FROM app_meta WHERE key = ?",
                (f"indexeddb_migration:{clean_preview['migrationId']}",),
            ).fetchone()
            backup_history_count = connection.execute(
                "SELECT COUNT(*) FROM backup_history WHERE backup_type = 'pre_migration' AND status = 'completed'"
            ).fetchone()[0]
        require(version["change_type"] == "migration", "initial migration version type mismatch")
        require(version["checksum"] == migrated["checksum"], "initial version checksum mismatch")
        require(json.loads(checkpoint_row["value_json"])["status"] == "completed", "checkpoint missing")
        require(backup_history_count == 1, "backup history record missing")

        document_count_after_apply = len(repository.list_documents(limit=100))
        folder_count_after_apply = len(repository.list_folders())
        reapplied = service.apply(clean_batch)
        require(reapplied["idempotent"] is True, "repeat apply must be idempotent")
        require(
            reapplied["applied"] == {"folders": 0, "documents": 0, "fileSources": 0, "fileFolders": 0, "files": 0, "settings": 0},
            "repeat apply wrote records",
        )
        require(len(repository.list_documents(limit=100)) == document_count_after_apply, "repeat apply duplicated documents")
        require(len(repository.list_folders()) == folder_count_after_apply, "repeat apply duplicated folders")

        resume_batch = {
            "source": {"database": "MarkdownProDB", "version": 5},
            "folders": [
                {"id": "root", "name": "ROOT", "parentId": None},
                {"id": "folder_resume", "name": "재개 폴더", "parentId": "root"},
            ],
            "documents": [
                {
                    "id": "doc_resume",
                    "folderId": "folder_resume",
                    "title": "재개 문서",
                    "content": "checkpoint 재개 본문",
                    "checksum": checksum("checkpoint 재개 본문"),
                }
            ],
        }
        resume_preview = service.preview(resume_batch)
        resume_batch["previewFingerprint"] = resume_preview["batchFingerprint"]
        resume_batch["migrationId"] = resume_preview["migrationId"]
        resume_backup = manager.create_online_backup("pre_migration")
        service._save_checkpoint(
            resume_preview["migrationId"],
            {
                "migrationId": resume_preview["migrationId"],
                "fingerprint": resume_preview["batchFingerprint"],
                "status": "backup_created",
                "backup": resume_backup,
            },
        )
        with manager.connection() as connection:
            backup_count_before_resume = connection.execute(
                "SELECT COUNT(*) FROM backup_history WHERE backup_type = 'pre_migration'"
            ).fetchone()[0]
        resumed = service.apply(resume_batch)
        require(resumed["backup"]["id"] == resume_backup["id"], "checkpoint did not reuse backup")
        require(repository.get_document("doc_resume")["folderId"] == "folder_resume", "resumed migration failed")
        with manager.connection() as connection:
            backup_count_after_resume = connection.execute(
                "SELECT COUNT(*) FROM backup_history WHERE backup_type = 'pre_migration'"
            ).fetchone()[0]
        require(backup_count_after_resume == backup_count_before_resume, "resume created a second backup")

        file_batch = {
            "source": {
                "database": "MarkdownProDB",
                "version": 5,
                "fileDatabase": "mdpro-indb-v1",
                "fileVersion": 1,
            },
            "folders": [],
            "documents": [],
            "fileSource": {
                "id": "source_mdpro_indb_v1",
                "database": "mdpro-indb-v1",
                "store": "files",
                "name": "연구 백업",
                "rootUri": "indexeddb://mdpro-indb-v1/files",
                "savedAt": 1785972000000,
                "memo": "Phase 4C test",
                "declaredFileCount": 3,
            },
            "files": [
                {
                    "path": "README.md",
                    "name": "README.md",
                    "extension": "md",
                    "content": "# 연구 백업",
                    "modifiedAt": 1785972100000,
                    "sizeBytes": len("# 연구 백업".encode("utf-8")),
                    "checksum": checksum("# 연구 백업"),
                },
                {
                    "path": "docs/ch1.md",
                    "name": "ch1.md",
                    "extension": "md",
                    "content": "첫 장 본문",
                    "modifiedAt": 1785972200000,
                    "sizeBytes": len("첫 장 본문".encode("utf-8")),
                    "checksum": checksum("첫 장 본문"),
                },
                {
                    "path": "docs/nested/note.txt",
                    "name": "note.txt",
                    "extension": "txt",
                    "content": "중첩 메모",
                    "modifiedAt": 1785972300000,
                    "sizeBytes": len("중첩 메모".encode("utf-8")),
                    "checksum": checksum("중첩 메모"),
                },
            ],
        }
        file_preview = service.preview(file_batch)
        require(file_preview["summary"]["sourceFiles"] == 3, "source file count mismatch")
        require(file_preview["summary"]["generatedFileFolders"] == 2, "derived folder count mismatch")
        require(file_preview["summary"]["newCount"] == 6, "file preview new count mismatch")
        require(file_preview["summary"]["conflictCount"] == 0, "file preview conflict")
        require(
            all("content" not in item for item in file_preview["items"]["fileEntries"]),
            "file preview leaked content",
        )
        file_batch["previewFingerprint"] = file_preview["batchFingerprint"]
        file_batch["migrationId"] = file_preview["migrationId"]
        file_applied = service.apply(file_batch)
        require(
            file_applied["applied"] == {"folders": 0, "documents": 0, "fileSources": 1, "fileFolders": 2, "files": 3, "settings": 0},
            "file migration applied count mismatch",
        )
        require(
            file_applied["verified"] == {"folders": 0, "documents": 0, "fileSources": 1, "fileFolders": 2, "files": 3, "settings": 0},
            "file migration verification count mismatch",
        )
        with manager.connection() as connection:
            source_row = connection.execute(
                "SELECT source_type, name, root_uri, config_json FROM workspace_sources WHERE id = ?",
                ("source_mdpro_indb_v1",),
            ).fetchone()
            file_rows = connection.execute(
                "SELECT id, parent_id, entry_type, path, content_text, size_bytes, checksum, modified_at "
                "FROM file_entries WHERE source_id = ? ORDER BY path",
                ("source_mdpro_indb_v1",),
            ).fetchall()
        require(source_row["source_type"] == "legacy_indb", "legacy file source type mismatch")
        require(source_row["name"] == "연구 백업", "legacy file source name mismatch")
        require(json.loads(source_row["config_json"])["declaredFileCount"] == 3, "file source metadata mismatch")
        require(len(file_rows) == 5, "file entries and derived folders count mismatch")
        nested = next(row for row in file_rows if row["path"] == "docs/nested/note.txt")
        nested_parent = next(row for row in file_rows if row["path"] == "docs/nested")
        require(nested["parent_id"] == nested_parent["id"], "file parent relationship mismatch")
        require(nested["content_text"] == "중첩 메모", "file content mismatch")
        require(nested["checksum"] == checksum("중첩 메모"), "file checksum mismatch")
        require(nested["size_bytes"] == len("중첩 메모".encode("utf-8")), "file size mismatch")
        require(nested["modified_at"] == 1785972300000, "file timestamp mismatch")

        repeated_files = service.apply(file_batch)
        require(repeated_files["idempotent"] is True, "file migration repeat must be idempotent")
        with manager.connection() as connection:
            require(
                connection.execute("SELECT COUNT(*) FROM file_entries WHERE source_id = ?", ("source_mdpro_indb_v1",)).fetchone()[0] == 5,
                "repeat file migration duplicated entries",
            )

        conflict_file_batch = json.loads(json.dumps(file_batch))
        conflict_file_batch.pop("previewFingerprint", None)
        conflict_file_batch.pop("migrationId", None)
        conflict_file_batch["files"][1]["content"] = "변경된 첫 장"
        conflict_file_batch["files"][1]["checksum"] = checksum("변경된 첫 장")
        conflict_file_batch["files"][1]["sizeBytes"] = len("변경된 첫 장".encode("utf-8"))
        conflict_file_preview = service.preview(conflict_file_batch)
        require(conflict_file_preview["summary"]["conflictCount"] == 1, "file path conflict not detected")
        conflict_file_batch["previewFingerprint"] = conflict_file_preview["batchFingerprint"]
        conflict_file_batch["migrationId"] = conflict_file_preview["migrationId"]
        with manager.connection() as connection:
            backup_count_before_file_block = connection.execute(
                "SELECT COUNT(*) FROM backup_history"
            ).fetchone()[0]
        try:
            service.apply(conflict_file_batch)
        except RepositoryError as error:
            require(error.code == "MIGRATION_PREVIEW_HAS_BLOCKERS", "file conflict apply error mismatch")
        else:
            raise AssertionError("conflicted file migration must be blocked")
        with manager.connection() as connection:
            require(
                connection.execute("SELECT COUNT(*) FROM backup_history").fetchone()[0]
                == backup_count_before_file_block,
                "blocked file migration created backup",
            )

        invalid_file_batch = {
            "source": {"database": "MarkdownProDB", "version": 5},
            "folders": [],
            "documents": [],
            "fileSource": {
                "id": "source_mdpro_indb_v1",
                "name": "연구 백업",
                "rootUri": "indexeddb://mdpro-indb-v1/files",
            },
            "files": [
                {
                    "path": "../outside.md",
                    "content": "경로 이탈",
                    "checksum": checksum("경로 이탈"),
                },
                {
                    "path": "safe.md",
                    "content": "정상 본문",
                    "checksum": "0" * 64,
                },
            ],
        }
        invalid_file_preview = service.preview(invalid_file_batch)
        require(invalid_file_preview["summary"]["excludedCount"] == 2, "invalid files were not excluded")

        settings_batch = {
            "source": {"database": "MarkdownProDB", "version": 5},
            "folders": [],
            "documents": [],
            "settings": [
                {
                    "key": "highlightVisible",
                    "value": True,
                    "scopeType": "global",
                    "scopeId": "",
                },
                {
                    "key": "githubRepo",
                    "value": "sample-owner/sample-repo",
                    "scopeType": "workspace",
                    "scopeId": "workspace_default",
                },
                {
                    "key": "userInfo",
                    "value": {"name": "테스트 사용자", "major": "Research"},
                    "scopeType": "profile",
                    "scopeId": "profile_default",
                },
            ],
            "settingsClassification": {
                "safeKeys": ["highlightVisible", "githubRepo", "userInfo"],
                "sensitiveKeys": ["apiKey", "githubToken"],
                "transientKeys": ["sqliteEnabled", "verified"],
                "unknownKeys": ["futureSetting"],
                "missingSecrets": ["apiKey", "githubToken"],
            },
        }
        settings_preview = service.preview(settings_batch)
        require(settings_preview["summary"]["settings"]["new"] == 3, "safe settings preview failed")
        require(settings_preview["summary"]["settingsClassification"]["sensitive"] == 2, "secret classification failed")
        require(settings_preview["summary"]["missingSecrets"] == ["apiKey", "githubToken"], "secret re-entry list failed")
        serialized_preview = json.dumps(settings_preview, ensure_ascii=False)
        require("real-github-secret" not in serialized_preview, "settings preview leaked a secret value")
        settings_batch["previewFingerprint"] = settings_preview["batchFingerprint"]
        settings_batch["migrationId"] = settings_preview["migrationId"]
        settings_applied = service.apply(settings_batch)
        require(settings_applied["applied"]["settings"] == 3, "safe settings apply count failed")
        require(settings_applied["verified"]["settings"] == 3, "safe settings verification failed")
        resolved = repository.get_resolved_settings()
        require(resolved["values"]["highlightVisible"] is True, "global setting restore failed")
        require(resolved["values"]["githubRepo"] == "sample-owner/sample-repo", "workspace setting restore failed")
        require(resolved["values"]["userInfo"]["name"] == "테스트 사용자", "profile setting restore failed")

        shared_backup = manager.create_online_backup("manual")
        restored_manager = DatabaseManager(
            APP_ROOT,
            data_root=manager.data_root,
            db_path=APP_ROOT / shared_backup["filePath"],
        )
        restored_manager.initialize()
        restored_values = StorageRepository(restored_manager).get_resolved_settings()["values"]
        require(restored_values["githubRepo"] == "sample-owner/sample-repo", "shared DB setting restore failed")
        require("apiKey" not in restored_values and "githubToken" not in restored_values, "shared DB contains secrets")

        malicious_settings = {
            "source": {"database": "MarkdownProDB", "version": 5},
            "folders": [],
            "documents": [],
            "settings": [
                {"key": "githubToken", "value": "real-github-secret"},
                {"key": "userInfo", "value": {"name": "x", "apiToken": "nested-secret"}},
            ],
        }
        malicious_preview = service.preview(malicious_settings)
        require(malicious_preview["summary"]["excludedCount"] == 2, "malicious settings were not blocked")
        malicious_json = json.dumps(malicious_preview, ensure_ascii=False)
        require("real-github-secret" not in malicious_json, "preview exposed blocked top-level secret")
        require("nested-secret" not in malicious_json, "preview exposed blocked nested secret")

        require(manager.integrity_check()["ok"] is True, "applied migration damaged the temporary DB")

    print("IndexedDB migration preview tests passed.")


if __name__ == "__main__":
    main()
