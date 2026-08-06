"""Smoke tests for the local SQLite server core."""

from __future__ import annotations

import sys
import tempfile
from pathlib import Path


APP_ROOT = Path(__file__).resolve().parents[1]
if str(APP_ROOT) not in sys.path:
    sys.path.insert(0, str(APP_ROOT))

from LocalSave_sqlite.server.database import (  # noqa: E402
    DatabaseConfigurationError,
    DatabaseManager,
)
from LocalSave_sqlite.server.repositories import RepositoryError, StorageRepository  # noqa: E402


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def main() -> None:
    temp_parent = APP_ROOT / "LocalSave_sqlite"
    with tempfile.TemporaryDirectory(prefix="sqlite-test-", dir=temp_parent) as temp_name:
        temp_root = Path(temp_name)
        data_root = temp_root / "data"
        manager = DatabaseManager(APP_ROOT, data_root=data_root)

        health = manager.initialize()
        require(health["available"] is True, "SQLite health must be available")
        require(health["schemaVersion"] == 3, "schema version must be 3")
        require(health["journalMode"].lower() == "wal", "journal mode must be WAL")
        require(health["foreignKeys"] is True, "foreign keys must be enabled")

        bootstrap = manager.bootstrap()
        require(bootstrap["profile"]["id"] == "profile_default", "default profile missing")
        require(bootstrap["workspace"]["id"] == "workspace_default", "default workspace missing")
        require(bootstrap["rootFolder"]["id"] == "root", "root folder missing")

        integrity = manager.integrity_check()
        require(integrity["ok"] is True, "integrity check must pass")

        repository = StorageRepository(manager)
        folder = repository.create_folder({"id": "folder_test", "name": "테스트 폴더"})
        require(folder["name"] == "테스트 폴더", "folder create failed")

        document = repository.create_document(
            {
                "id": "doc_test",
                "folderId": folder["id"],
                "title": "SQLite 테스트 문서",
                "content": "첫 번째 본문입니다.\n한글 저장 테스트",
            }
        )
        require(document["version"] == 1, "new document version must be 1")
        require(document["folderId"] == "folder_test", "document folder must be preserved")

        listed = repository.list_documents(folder_id="folder_test", query="SQLite")
        require(len(listed) == 1, "document list query must find the test document")
        require("content" not in listed[0], "document list must not load full content")

        title_results = repository.search_documents("SQLite", folder_id="folder_test")
        require(len(title_results) == 1, "FTS title search must find the test document")
        require(title_results[0]["matchSource"] == "title", "title match source is incorrect")
        body_results = repository.search_documents("저장 테스트", folder_id="folder_test")
        require(len(body_results) == 1, "FTS body search must find the test document")
        require(body_results[0]["matchSource"] == "content", "body match source is incorrect")
        short_results = repository.search_documents("한", folder_id="folder_test")
        require(len(short_results) == 1, "one-character Korean LIKE fallback must work")
        require(repository.search_documents("테", limit=1)[0]["id"] == "doc_test", "search limit failed")

        repository.put_setting({"key": "sitesVisible", "value": False, "scopeType": "global"})
        repository.put_setting(
            {
                "key": "sitesVisible",
                "value": True,
                "scopeType": "workspace",
                "scopeId": "workspace_default",
            }
        )
        repository.put_setting(
            {
                "key": "sitesVisible",
                "value": False,
                "scopeType": "feature",
                "scopeId": "feature_test",
            }
        )
        repository.put_setting(
            {
                "key": "sitesVisible",
                "value": True,
                "scopeType": "document",
                "scopeId": "doc_test",
            }
        )
        resolved_workspace = repository.get_resolved_settings()
        require(resolved_workspace["values"]["sitesVisible"] is True, "workspace setting precedence failed")
        resolved_feature = repository.get_resolved_settings(feature_id="feature_test")
        require(resolved_feature["values"]["sitesVisible"] is False, "feature setting precedence failed")
        resolved_document = repository.get_resolved_settings(
            feature_id="feature_test", document_id="doc_test"
        )
        require(resolved_document["values"]["sitesVisible"] is True, "document setting precedence failed")
        require(
            resolved_document["precedence"] == ["global", "profile", "workspace", "feature", "document"],
            "setting precedence metadata failed",
        )
        try:
            repository.put_setting({"key": "githubToken", "value": "must-not-store"})
        except RepositoryError as error:
            require(error.code == "SENSITIVE_SETTING_BLOCKED", "secret key rejection code mismatch")
        else:
            raise AssertionError("secret setting write must be rejected")
        try:
            repository.put_setting(
                {"key": "userInfo", "value": {"name": "x", "accessToken": "nested-secret"}}
            )
        except RepositoryError as error:
            require(error.code == "SENSITIVE_NESTED_SETTING_BLOCKED", "nested secret rejection failed")
        else:
            raise AssertionError("nested secret setting write must be rejected")

        explorer = repository.get_explorer_snapshot(query="SQLite", limit=25)
        require(explorer["readOnly"] is True, "explorer must be explicitly read-only")
        require(explorer["counts"]["documents"] == 1, "explorer document count failed")
        require(explorer["counts"]["folders"] == 2, "explorer folder count failed")
        require(explorer["counts"]["settings"] == 4, "explorer setting count failed")
        require(len(explorer["documents"]) == 1, "explorer query failed")
        require("content" not in explorer["documents"][0], "explorer list leaked document content")
        require(explorer["documents"][0]["folderName"] == "테스트 폴더", "folder label missing")
        require(explorer["database"]["schemaVersion"] == 3, "explorer database metadata missing")

        updated = repository.update_document(
            "doc_test",
            {
                "expectedVersion": 1,
                "title": "SQLite 수정 문서",
                "content": "두 번째 본문입니다.",
                "folderId": "folder_test",
            },
        )
        require(updated["version"] == 2, "document update must increment version")
        require(updated["content"] == "두 번째 본문입니다.", "document update content mismatch")
        require(repository.search_documents("저장 테스트") == [], "FTS update trigger kept stale content")
        require(len(repository.search_documents("두 번째 본문")) == 1, "FTS update trigger missed new content")

        try:
            repository.update_document(
                "doc_test",
                {"expectedVersion": 1, "title": "충돌", "content": "덮어쓰기 금지"},
            )
        except RepositoryError as error:
            require(error.code == "VERSION_CONFLICT", "stale update must return VERSION_CONFLICT")
            require(error.details.get("currentVersion") == 2, "conflict must expose current version")
        else:
            raise AssertionError("stale document update must be rejected")

        versions = repository.list_document_versions("doc_test")
        require([item["version"] for item in versions] == [2, 1], "document versions are incorrect")
        version_explorer = repository.get_explorer_snapshot()
        require(version_explorer["counts"]["versions"] == 2, "explorer version count failed")

        restored = repository.restore_document_version("doc_test", 1, 2)
        require(restored["version"] == 3, "restore must create a new version")
        require(restored["content"].startswith("첫 번째"), "restore content mismatch")

        child = repository.create_folder(
            {"id": "folder_child", "name": "하위 폴더", "parentId": "folder_test"}
        )
        require(child["parentId"] == "folder_test", "child folder parent mismatch")
        try:
            repository.update_folder("folder_test", {"parentId": "folder_child"})
        except RepositoryError as error:
            require(error.code == "FOLDER_CYCLE", "folder cycle must be rejected")
        else:
            raise AssertionError("folder cycle must not be allowed")

        deleted_folder = repository.delete_folder("folder_test")
        require(deleted_folder["movedDocuments"] == 1, "folder delete must report moved documents")
        moved_document = repository.get_document("doc_test")
        require(moved_document["folderId"] == "root", "deleted folder documents must move to ROOT")
        require(moved_document["version"] == 4, "folder move must invalidate stale document versions")
        moved_child = repository.get_folder("folder_child")
        require(moved_child["parentId"] is None, "child folder must be reparented")

        deleted_document = repository.soft_delete_document("doc_test", 4)
        require(deleted_document["deleted"] is True, "document soft delete failed")
        require(repository.list_documents(query="SQLite") == [], "deleted document must not be listed")
        require(repository.search_documents("첫 번째 본문") == [], "deleted document must leave FTS search")

        final_integrity = manager.integrity_check()
        require(final_integrity["ok"] is True, "CRUD operations must preserve integrity")

        second_manager = DatabaseManager(APP_ROOT, data_root=data_root)
        second_health = second_manager.initialize()
        require(second_health["schemaVersion"] == 3, "repeat initialization must be idempotent")

        try:
            DatabaseManager(
                APP_ROOT,
                data_root=data_root,
                db_path=temp_root / "outside" / "unsafe.sqlite",
            )
        except DatabaseConfigurationError:
            pass
        else:
            raise AssertionError("database paths outside data_root must be rejected")

    print("SQLite server core tests passed.")


if __name__ == "__main__":
    main()
