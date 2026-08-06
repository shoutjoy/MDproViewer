"""Tests for portable .mdpbackup creation and read-only validation."""

from __future__ import annotations

import hashlib
import io
import json
import sqlite3
import sys
import tempfile
import zipfile
from pathlib import Path


APP_ROOT = Path(__file__).resolve().parents[1]
if str(APP_ROOT) not in sys.path:
    sys.path.insert(0, str(APP_ROOT))

from LocalSave_sqlite.server.backup_packages import BackupPackageService  # noqa: E402
from LocalSave_sqlite.server.database import DatabaseManager  # noqa: E402
from LocalSave_sqlite.server.repositories import RepositoryError, StorageRepository  # noqa: E402


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def sha256(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="sqlite-package-test-", dir=APP_ROOT / "LocalSave_sqlite") as temp_name:
        data_root = Path(temp_name) / "data"
        manager = DatabaseManager(APP_ROOT, data_root=data_root)
        manager.initialize()
        repository = StorageRepository(manager)
        repository.create_document(
            {"id": "doc_package", "title": "공유 문서", "content": "공유 DB 복원 본문"}
        )
        repository.put_setting({"key": "sitesVisible", "value": True})

        asset_content = b"portable-asset-content"
        asset_path = data_root / "assets" / "images" / "sample.bin"
        asset_path.parent.mkdir(parents=True, exist_ok=True)
        asset_path.write_bytes(asset_content)
        now_ms = 1785985000000
        with manager.write_transaction() as connection:
            connection.execute(
                """
                INSERT INTO assets
                    (id, workspace_id, asset_type, storage_type, original_name,
                     stored_name, relative_path, mime_type, extension, size_bytes,
                     checksum_sha256, created_at, updated_at)
                VALUES (?, ?, 'attachment', 'filesystem', ?, ?, ?,
                        'application/octet-stream', 'bin', ?, ?, ?, ?)
                """,
                (
                    "asset_package", manager.DEFAULT_WORKSPACE_ID, "sample.bin", "sample.bin",
                    "images/sample.bin", len(asset_content), sha256(asset_content), now_ms, now_ms,
                ),
            )

        service = BackupPackageService(manager)
        before_document = repository.get_document("doc_package")
        result = service.create_package()
        package_path = service.resolve_package_path(result["fileName"])
        require(package_path.suffix == ".mdpbackup", "package extension mismatch")
        require(result["validation"]["ok"] is True, "created package validation failed")
        require(result["validation"]["assetCount"] == 1, "asset validation count mismatch")
        require(result["checksumSha256"] == sha256(package_path.read_bytes()), "package checksum mismatch")
        require(repository.get_document("doc_package")["checksum"] == before_document["checksum"], "package changed source document")

        package_bytes = package_path.read_bytes()
        staged = service.stage_restore_preview(
            io.BytesIO(package_bytes), len(package_bytes), "다른-PC-백업.mdpbackup"
        )
        require(staged["status"] == "validated_preview", "restore preview status mismatch")
        require(staged["originalName"] == "다른-PC-백업.mdpbackup", "restore preview filename mismatch")
        require(staged["packageChecksumSha256"] == sha256(package_bytes), "staged package checksum mismatch")
        require(staged["validation"]["databaseCounts"]["documents"] == 1, "restore document preview count failed")
        require(staged["validation"]["databaseCounts"]["settings"] == 1, "restore settings preview count failed")
        require(staged["validation"]["assetCount"] == 1, "restore asset preview count failed")
        require((data_root / "imports" / f"{staged['importId']}.mdpbackup").is_file(), "staged package missing")
        require((data_root / "imports" / f"{staged['importId']}.json").is_file(), "staged metadata missing")
        require(repository.get_document("doc_package")["checksum"] == before_document["checksum"], "restore preview changed live DB")

        with zipfile.ZipFile(package_path, "r") as archive:
            names = set(archive.namelist())
            require(names == {"manifest.json", "mdpro.sqlite", "assets/", "assets/images/sample.bin"}, "package entries mismatch")
            manifest = json.loads(archive.read("manifest.json").decode("utf-8"))
            require(manifest["format"] == "mdviewer-sqlite-backup", "manifest format mismatch")
            require(manifest["formatVersion"] == 1, "manifest version mismatch")
            require(manifest["assets"]["count"] == 1, "manifest asset count mismatch")
            require(archive.read("assets/images/sample.bin") == asset_content, "packaged asset content mismatch")
            extracted_db = data_root / "restored-copy.sqlite"
            extracted_db.write_bytes(archive.read("mdpro.sqlite"))

        restored_manager = DatabaseManager(APP_ROOT, data_root=data_root, db_path=extracted_db)
        restored_manager.initialize()
        restored_repository = StorageRepository(restored_manager)
        require(restored_repository.get_document("doc_package")["content"] == "공유 DB 복원 본문", "shared DB document restore failed")
        require(restored_repository.get_resolved_settings()["values"]["sitesVisible"] is True, "shared DB setting restore failed")

        corrupted_path = data_root / "exports" / "mdviewer_1785985000001_aaaaaaaaaaaa.mdpbackup"
        with zipfile.ZipFile(package_path, "r") as source, zipfile.ZipFile(corrupted_path, "w", zipfile.ZIP_DEFLATED) as target:
            for info in source.infolist():
                payload = source.read(info.filename)
                if info.filename == "mdpro.sqlite":
                    payload = payload + b"corruption"
                target.writestr(info.filename, payload)
        try:
            service.validate_package(corrupted_path)
        except RepositoryError as error:
            require(error.code in {"BACKUP_DATABASE_CHECKSUM_MISMATCH", "BACKUP_DATABASE_SIZE_MISMATCH"}, "corrupt DB error mismatch")
        else:
            raise AssertionError("corrupted database package must be rejected")
        staged_before_failure = set((data_root / "imports").glob("restore_*"))
        corrupted_bytes = corrupted_path.read_bytes()
        try:
            service.stage_restore_preview(
                io.BytesIO(corrupted_bytes), len(corrupted_bytes), "corrupted.mdpbackup"
            )
        except RepositoryError as error:
            require(error.code in {"BACKUP_DATABASE_CHECKSUM_MISMATCH", "BACKUP_DATABASE_SIZE_MISMATCH"}, "corrupt upload error mismatch")
        else:
            raise AssertionError("corrupted restore upload must be rejected")
        require(set((data_root / "imports").glob("restore_*")) == staged_before_failure, "failed upload left staging files")

        try:
            service.stage_restore_preview(io.BytesIO(package_bytes), len(package_bytes), "not-a-backup.zip")
        except RepositoryError as error:
            require(error.code == "RESTORE_FILE_NAME_INVALID", "restore extension error mismatch")
        else:
            raise AssertionError("non-mdpbackup upload must be rejected")
        try:
            service.stage_restore_preview(io.BytesIO(package_bytes[:-10]), len(package_bytes), "short.mdpbackup")
        except RepositoryError as error:
            require(error.code == "RESTORE_UPLOAD_INCOMPLETE", "incomplete upload error mismatch")
        else:
            raise AssertionError("incomplete restore upload must be rejected")

        traversal_path = data_root / "exports" / "mdviewer_1785985000002_bbbbbbbbbbbb.mdpbackup"
        with zipfile.ZipFile(traversal_path, "w", zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("../outside.txt", b"blocked")
            archive.writestr("assets/", b"")
            archive.writestr("mdpro.sqlite", b"not-a-db")
            archive.writestr("manifest.json", b"{}")
        try:
            service.validate_package(traversal_path)
        except RepositoryError as error:
            require(error.code == "BACKUP_UNSAFE_PATH", "path traversal error mismatch")
        else:
            raise AssertionError("path traversal package must be rejected")
        require(not (data_root / "outside.txt").exists(), "validator extracted a traversal entry")

        future_db = data_root / "future-schema.sqlite"
        with zipfile.ZipFile(package_path, "r") as archive:
            future_db.write_bytes(archive.read("mdpro.sqlite"))
            future_manifest = json.loads(archive.read("manifest.json").decode("utf-8"))
            packaged_asset = archive.read("assets/images/sample.bin")
        future_connection = sqlite3.connect(str(future_db))
        try:
            future_connection.execute(
                "INSERT INTO schema_migrations(version, name, checksum, applied_at) VALUES (999, 'future', 'test', ?)",
                (now_ms,),
            )
            future_connection.commit()
        finally:
            future_connection.close()
        future_bytes = future_db.read_bytes()
        future_manifest["database"]["schemaVersion"] = 999
        future_manifest["database"]["sizeBytes"] = len(future_bytes)
        future_manifest["database"]["checksumSha256"] = sha256(future_bytes)
        future_path = data_root / "exports" / "mdviewer_1785985000003_cccccccccccc.mdpbackup"
        with zipfile.ZipFile(future_path, "w", zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("assets/", b"")
            archive.writestr("assets/images/sample.bin", packaged_asset)
            archive.writestr("mdpro.sqlite", future_bytes)
            archive.writestr("manifest.json", json.dumps(future_manifest, ensure_ascii=False))
        try:
            service.validate_package(future_path)
        except RepositoryError as error:
            require(error.code == "BACKUP_SCHEMA_UNSUPPORTED", "future schema error mismatch")
        else:
            raise AssertionError("future schema package must be rejected")

        try:
            service.resolve_package_path("../mdpro.sqlite")
        except RepositoryError as error:
            require(error.code == "BACKUP_PACKAGE_NAME_INVALID", "unsafe package name error mismatch")
        else:
            raise AssertionError("unsafe package filename must be rejected")

        asset_path.write_bytes(b"changed-after-db-metadata")
        try:
            service.create_package()
        except RepositoryError as error:
            require(error.code in {"BACKUP_ASSET_CHECKSUM_MISMATCH", "BACKUP_ASSET_SIZE_MISMATCH"}, "asset mismatch error mismatch")
        else:
            raise AssertionError("asset metadata mismatch must block package creation")

        require(manager.integrity_check()["ok"] is True, "package tests damaged source DB")

        settings_ui = (APP_ROOT / "Setting" / "settings-ui.js").read_text(encoding="utf-8")
        index_html = (APP_ROOT / "index.html").read_text(encoding="utf-8")
        require("sqlite-backup-package-create" in settings_ui, "backup package create UI missing")
        require("sqlite-backup-package-download" in settings_ui, "backup package download UI missing")
        require("sqlite-restore-package-file" in settings_ui, "restore file selection UI missing")
        require("sqlite-restore-package-preview" in settings_ui, "restore preview UI missing")
        require("실제 복원 버튼은 아직 제공하지 않습니다" in settings_ui, "restore preview safety notice missing")
        require("모든 문서 본문" in settings_ui, "backup data scope warning missing")
        require("20260806-restore-preview-1" in index_html, "restore preview cache version missing")

    print("SQLite backup package tests passed.")


if __name__ == "__main__":
    main()
