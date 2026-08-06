"""Portable ``.mdpbackup`` creation, validation, staging, and safe restore."""

from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import sqlite3
import tempfile
import time
import uuid
import zipfile
from pathlib import Path, PurePosixPath
from typing import Any, Dict, List, Optional

from .database import DatabaseManager
from .repositories import RepositoryError


class BackupPackageService:
    FORMAT = "mdviewer-sqlite-backup"
    FORMAT_VERSION = 1
    DATABASE_ENTRY = "mdpro.sqlite"
    ASSET_PREFIX = "assets/"
    MAX_MANIFEST_BYTES = 1024 * 1024
    MAX_ARCHIVE_ENTRIES = 10000
    MAX_DATABASE_BYTES = 4 * 1024 * 1024 * 1024
    MAX_ASSET_BYTES = 2 * 1024 * 1024 * 1024
    MAX_TOTAL_BYTES = 8 * 1024 * 1024 * 1024
    MAX_PACKAGE_UPLOAD_BYTES = 8 * 1024 * 1024 * 1024
    SAFE_PACKAGE_RE = r"^mdviewer_[0-9]{13}_[a-f0-9]{12}\.mdpbackup$"

    def __init__(self, manager: DatabaseManager) -> None:
        self.manager = manager

    @staticmethod
    def _sha256_file(path: Path) -> str:
        digest = hashlib.sha256()
        with path.open("rb") as source:
            for chunk in iter(lambda: source.read(1024 * 1024), b""):
                digest.update(chunk)
        return digest.hexdigest()

    @staticmethod
    def _sha256_stream(source: Any) -> tuple[str, int]:
        digest = hashlib.sha256()
        size = 0
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
            size += len(chunk)
        return digest.hexdigest(), size

    @staticmethod
    def _safe_archive_name(name: Any, *, allow_directory: bool = False) -> str:
        normalized = str(name or "")
        if not normalized or "\x00" in normalized or "\\" in normalized:
            raise RepositoryError("BACKUP_UNSAFE_PATH", "Backup contains an unsafe path.", 400)
        path = PurePosixPath(normalized)
        if path.is_absolute() or any(part in {"", ".", ".."} for part in path.parts):
            raise RepositoryError("BACKUP_UNSAFE_PATH", "Backup contains an unsafe path.", 400)
        if not allow_directory and normalized.endswith("/"):
            raise RepositoryError("BACKUP_UNSAFE_PATH", "Backup file path is invalid.", 400)
        return normalized

    def _exports_root(self) -> Path:
        root = (self.manager.data_root / "exports").resolve()
        try:
            root.relative_to(self.manager.data_root)
        except ValueError as error:
            raise RepositoryError("BACKUP_EXPORT_PATH_INVALID", "Backup export path is invalid.", 500) from error
        root.mkdir(parents=True, exist_ok=True)
        return root

    def _assets_root(self) -> Path:
        return (self.manager.data_root / "assets").resolve()

    def _imports_root(self) -> Path:
        root = (self.manager.data_root / "imports").resolve()
        try:
            root.relative_to(self.manager.data_root)
        except ValueError as error:
            raise RepositoryError("RESTORE_STAGING_PATH_INVALID", "Restore staging path is invalid.", 500) from error
        root.mkdir(parents=True, exist_ok=True)
        return root

    @staticmethod
    def _display_upload_name(value: Any) -> str:
        normalized = str(value or "backup.mdpbackup").replace("\\", "/").split("/")[-1].strip()
        if not normalized or len(normalized) > 255 or not normalized.lower().endswith(".mdpbackup"):
            raise RepositoryError("RESTORE_FILE_NAME_INVALID", "Select a valid .mdpbackup file.", 400)
        return normalized

    def _normalize_asset_path(self, value: Any) -> str:
        raw = str(value or "").strip().replace("\\", "/")
        if raw.startswith("assets/"):
            raw = raw[len("assets/") :]
        return self._safe_archive_name(raw)

    def _resolve_asset(self, relative_path: str) -> Path:
        assets_root = self._assets_root()
        candidate = assets_root.joinpath(*PurePosixPath(relative_path).parts)
        resolved = candidate.resolve()
        try:
            resolved.relative_to(assets_root)
        except ValueError as error:
            raise RepositoryError("BACKUP_ASSET_PATH_OUTSIDE_ROOT", "Asset path leaves the SQLite assets root.", 409) from error
        if not resolved.is_file():
            raise RepositoryError(
                "BACKUP_ASSET_MISSING",
                f"Referenced asset is missing: {relative_path}",
                409,
            )
        return resolved

    def _collect_assets(self) -> List[Dict[str, Any]]:
        with self.manager.connection() as connection:
            rows = connection.execute(
                """
                SELECT 'asset' AS reference_type, id AS reference_id,
                       relative_path, checksum_sha256, size_bytes
                FROM assets
                WHERE storage_type = 'filesystem' AND deleted_at IS NULL
                  AND relative_path IS NOT NULL
                UNION ALL
                SELECT 'variant' AS reference_type, v.id AS reference_id,
                       v.relative_path, NULL AS checksum_sha256, NULL AS size_bytes
                FROM asset_variants AS v
                JOIN assets AS a ON a.id = v.asset_id
                WHERE a.deleted_at IS NULL AND v.relative_path IS NOT NULL
                ORDER BY reference_type, reference_id
                """
            ).fetchall()
        assets: List[Dict[str, Any]] = []
        seen_paths: Dict[str, Dict[str, Any]] = {}
        for row in rows:
            relative_path = self._normalize_asset_path(row["relative_path"])
            file_path = self._resolve_asset(relative_path)
            checksum = self._sha256_file(file_path)
            size_bytes = file_path.stat().st_size
            declared_checksum = str(row["checksum_sha256"] or "").lower()
            declared_size = row["size_bytes"]
            if declared_checksum and declared_checksum != checksum:
                raise RepositoryError(
                    "BACKUP_ASSET_CHECKSUM_MISMATCH",
                    f"Asset checksum does not match SQLite metadata: {relative_path}",
                    409,
                )
            if declared_size is not None and int(declared_size) != size_bytes:
                raise RepositoryError(
                    "BACKUP_ASSET_SIZE_MISMATCH",
                    f"Asset size does not match SQLite metadata: {relative_path}",
                    409,
                )
            existing = seen_paths.get(relative_path)
            if existing:
                if existing["checksumSha256"] != checksum:
                    raise RepositoryError("BACKUP_ASSET_PATH_CONFLICT", "Asset paths conflict.", 409)
                existing["references"].append(
                    {"type": str(row["reference_type"]), "id": str(row["reference_id"])}
                )
                continue
            item = {
                "relativePath": relative_path,
                "archivePath": self.ASSET_PREFIX + relative_path,
                "checksumSha256": checksum,
                "sizeBytes": size_bytes,
                "references": [
                    {"type": str(row["reference_type"]), "id": str(row["reference_id"])}
                ],
                "_filePath": file_path,
            }
            seen_paths[relative_path] = item
            assets.append(item)
        assets.sort(key=lambda item: str(item["archivePath"]))
        return assets

    def create_package(self, backup_type: str = "manual") -> Dict[str, Any]:
        if not self.manager._initialized:
            self.manager.initialize()
        with self.manager.exclusive_write():
            source_backup = self.manager.create_online_backup(backup_type)
            assets = self._collect_assets()
        display_backup_path = Path(str(source_backup["filePath"]))
        database_path = (self.manager.app_root / display_backup_path).resolve()
        if not database_path.is_file():
            database_path = (self.manager.data_root / "backups" / display_backup_path.name).resolve()
        if not database_path.is_file():
            raise RepositoryError("BACKUP_DATABASE_MISSING", "Online backup file is missing.", 500)
        now_ms = int(time.time() * 1000)
        package_id = uuid.uuid4().hex[:12]
        file_name = f"mdviewer_{now_ms}_{package_id}.mdpbackup"
        exports_root = self._exports_root()
        package_path = (exports_root / file_name).resolve()
        try:
            package_path.relative_to(exports_root)
        except ValueError as error:
            raise RepositoryError("BACKUP_EXPORT_PATH_INVALID", "Backup export path is invalid.", 500) from error
        temp_path = package_path.with_suffix(".tmp")
        asset_manifest = [
            {key: value for key, value in item.items() if key != "_filePath"}
            for item in assets
        ]
        manifest = {
            "format": self.FORMAT,
            "formatVersion": self.FORMAT_VERSION,
            "createdAt": now_ms,
            "workspaceId": self.manager.DEFAULT_WORKSPACE_ID,
            "database": {
                "archivePath": self.DATABASE_ENTRY,
                "checksumSha256": str(source_backup["checksumSha256"]).lower(),
                "sizeBytes": int(source_backup["sizeBytes"]),
                "schemaVersion": int(source_backup["schemaVersion"]),
                "integrityCheck": "ok",
                "foreignKeyViolations": 0,
            },
            "assets": {
                "archiveRoot": self.ASSET_PREFIX,
                "count": len(asset_manifest),
                "totalBytes": sum(int(item["sizeBytes"]) for item in asset_manifest),
                "entries": asset_manifest,
            },
            "sourceBackup": {
                "id": source_backup["id"],
                "createdAt": source_backup["createdAt"],
            },
        }
        encoded_manifest = json.dumps(
            manifest, ensure_ascii=False, sort_keys=True, indent=2
        ).encode("utf-8")
        if len(encoded_manifest) > self.MAX_MANIFEST_BYTES:
            raise RepositoryError("BACKUP_MANIFEST_TOO_LARGE", "Backup manifest is too large.", 413)
        try:
            with zipfile.ZipFile(temp_path, "w", compression=zipfile.ZIP_DEFLATED, allowZip64=True) as archive:
                archive.writestr("assets/", b"")
                archive.write(database_path, self.DATABASE_ENTRY)
                for item in assets:
                    archive.write(item["_filePath"], str(item["archivePath"]))
                archive.writestr("manifest.json", encoded_manifest)
            os.replace(temp_path, package_path)
            validation = self.validate_package(package_path)
        except Exception:
            if temp_path.is_file():
                temp_path.unlink()
            if package_path.is_file():
                package_path.unlink()
            raise
        package_checksum = self._sha256_file(package_path)
        try:
            display_package_path = package_path.relative_to(self.manager.app_root).as_posix()
        except ValueError:
            display_package_path = package_path.name
        return {
            "fileName": file_name,
            "filePath": display_package_path,
            "downloadUrl": f"/api/sqlite/backups/packages/{file_name}",
            "checksumSha256": package_checksum,
            "sizeBytes": package_path.stat().st_size,
            "manifest": manifest,
            "validation": validation,
            "sourceBackup": source_backup,
        }

    def resolve_package_path(self, file_name: Any) -> Path:
        normalized = str(file_name or "").strip()
        if not re.fullmatch(self.SAFE_PACKAGE_RE, normalized):
            raise RepositoryError("BACKUP_PACKAGE_NAME_INVALID", "Backup package name is invalid.", 400)
        exports_root = self._exports_root()
        path = (exports_root / normalized).resolve()
        try:
            path.relative_to(exports_root)
        except ValueError as error:
            raise RepositoryError("BACKUP_PACKAGE_PATH_INVALID", "Backup package path is invalid.", 400) from error
        if not path.is_file():
            raise RepositoryError("BACKUP_PACKAGE_NOT_FOUND", "Backup package was not found.", 404)
        return path

    def stage_restore_preview(
        self,
        source: Any,
        content_length: Any,
        original_name: Any,
    ) -> Dict[str, Any]:
        try:
            expected_size = int(content_length)
        except (TypeError, ValueError) as error:
            raise RepositoryError("RESTORE_CONTENT_LENGTH_INVALID", "Restore upload size is invalid.", 400) from error
        if expected_size <= 0:
            raise RepositoryError("RESTORE_FILE_EMPTY", "Restore package is empty.", 400)
        if expected_size > self.MAX_PACKAGE_UPLOAD_BYTES:
            raise RepositoryError("RESTORE_FILE_TOO_LARGE", "Restore package exceeds the allowed size.", 413)
        display_name = self._display_upload_name(original_name)
        imports_root = self._imports_root()
        import_id = f"restore_{uuid.uuid4().hex}"
        staged_path = (imports_root / f"{import_id}.mdpbackup").resolve()
        temp_path = (imports_root / f".{import_id}.upload").resolve()
        try:
            staged_path.relative_to(imports_root)
            temp_path.relative_to(imports_root)
        except ValueError as error:
            raise RepositoryError("RESTORE_STAGING_PATH_INVALID", "Restore staging path is invalid.", 500) from error
        received = 0
        digest = hashlib.sha256()
        try:
            with temp_path.open("xb") as destination:
                while received < expected_size:
                    chunk = source.read(min(1024 * 1024, expected_size - received))
                    if not chunk:
                        break
                    destination.write(chunk)
                    digest.update(chunk)
                    received += len(chunk)
            if received != expected_size:
                raise RepositoryError("RESTORE_UPLOAD_INCOMPLETE", "Restore package upload is incomplete.", 400)
            os.replace(temp_path, staged_path)
            validation = self.validate_package(staged_path)
            metadata = {
                "importId": import_id,
                "originalName": display_name,
                "stagedFileName": staged_path.name,
                "receivedAt": int(time.time() * 1000),
                "packageChecksumSha256": digest.hexdigest(),
                "packageSizeBytes": received,
                "validation": validation,
                "status": "validated_preview",
            }
            metadata_path = imports_root / f"{import_id}.json"
            metadata_temp = imports_root / f".{import_id}.json.tmp"
            metadata_temp.write_text(
                json.dumps(metadata, ensure_ascii=False, sort_keys=True, indent=2),
                encoding="utf-8",
            )
            os.replace(metadata_temp, metadata_path)
            return metadata
        except Exception:
            if temp_path.is_file():
                temp_path.unlink()
            if staged_path.is_file():
                staged_path.unlink()
            metadata_temp_candidate = imports_root / f".{import_id}.json.tmp"
            if metadata_temp_candidate.is_file():
                metadata_temp_candidate.unlink()
            raise

    def _resolve_staged_restore(self, import_id: Any) -> tuple[Path, Path, Dict[str, Any]]:
        normalized = str(import_id or "").strip().lower()
        if not re.fullmatch(r"restore_[a-f0-9]{32}", normalized):
            raise RepositoryError("RESTORE_IMPORT_ID_INVALID", "Restore import ID is invalid.", 400)
        imports_root = self._imports_root()
        package_path = (imports_root / f"{normalized}.mdpbackup").resolve()
        metadata_path = (imports_root / f"{normalized}.json").resolve()
        try:
            package_path.relative_to(imports_root)
            metadata_path.relative_to(imports_root)
        except ValueError as error:
            raise RepositoryError("RESTORE_STAGING_PATH_INVALID", "Restore staging path is invalid.", 500) from error
        if not package_path.is_file() or not metadata_path.is_file():
            raise RepositoryError("RESTORE_STAGING_NOT_FOUND", "Validated restore staging was not found.", 404)
        try:
            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
            raise RepositoryError("RESTORE_METADATA_INVALID", "Restore staging metadata is invalid.", 409) from error
        if not isinstance(metadata, dict) or metadata.get("importId") != normalized:
            raise RepositoryError("RESTORE_METADATA_INVALID", "Restore staging metadata is invalid.", 409)
        if metadata.get("status") != "validated_preview":
            raise RepositoryError("RESTORE_STAGING_NOT_READY", "Restore staging is not ready to apply.", 409)
        return package_path, metadata_path, metadata

    @staticmethod
    def _write_json_atomic(path: Path, payload: Dict[str, Any]) -> None:
        temporary = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
        try:
            temporary.write_text(
                json.dumps(payload, ensure_ascii=False, sort_keys=True, indent=2),
                encoding="utf-8",
            )
            os.replace(temporary, path)
        finally:
            if temporary.is_file():
                temporary.unlink()

    def _restore_work_root(self, import_id: str) -> Path:
        imports_root = self._imports_root()
        work_root = (imports_root / f".{import_id}.apply_{uuid.uuid4().hex}").resolve()
        try:
            work_root.relative_to(imports_root)
        except ValueError as error:
            raise RepositoryError("RESTORE_WORK_PATH_INVALID", "Restore work path is invalid.", 500) from error
        work_root.mkdir(parents=False, exist_ok=False)
        return work_root

    def _extract_restore_files(
        self,
        package_path: Path,
        work_root: Path,
        validation: Dict[str, Any],
    ) -> tuple[Path, Path]:
        database_path = work_root / self.DATABASE_ENTRY
        assets_path = work_root / "assets"
        assets_path.mkdir(parents=False, exist_ok=False)
        manifest = validation.get("manifest") if isinstance(validation.get("manifest"), dict) else {}
        assets = manifest.get("assets") if isinstance(manifest.get("assets"), dict) else {}
        entries = assets.get("entries") if isinstance(assets.get("entries"), list) else []
        with zipfile.ZipFile(package_path, "r") as archive:
            with archive.open(self.DATABASE_ENTRY, "r") as source, database_path.open("xb") as destination:
                shutil.copyfileobj(source, destination, length=1024 * 1024)
            for item in entries:
                relative_path = self._safe_archive_name(item.get("relativePath"))
                target = assets_path.joinpath(*PurePosixPath(relative_path).parts).resolve()
                try:
                    target.relative_to(assets_path.resolve())
                except ValueError as error:
                    raise RepositoryError("RESTORE_ASSET_PATH_INVALID", "Restore asset path is invalid.", 400) from error
                target.parent.mkdir(parents=True, exist_ok=True)
                with archive.open(str(item["archivePath"]), "r") as source, target.open("xb") as destination:
                    shutil.copyfileobj(source, destination, length=1024 * 1024)
        if self._sha256_file(database_path) != str(validation.get("databaseChecksumSha256") or ""):
            raise RepositoryError("RESTORE_DATABASE_CHANGED", "Prepared restore database checksum changed.", 409)
        return database_path, assets_path

    def _live_database_counts(self) -> Dict[str, int]:
        with self.manager.connection() as connection:
            return {
                "documents": int(connection.execute("SELECT COUNT(*) FROM documents WHERE deleted_at IS NULL").fetchone()[0]),
                "folders": int(connection.execute("SELECT COUNT(*) FROM folders WHERE deleted_at IS NULL").fetchone()[0]),
                "documentVersions": int(connection.execute("SELECT COUNT(*) FROM document_versions").fetchone()[0]),
                "settings": int(connection.execute("SELECT COUNT(*) FROM settings").fetchone()[0]),
                "assets": int(connection.execute("SELECT COUNT(*) FROM assets WHERE deleted_at IS NULL").fetchone()[0]),
                "fileEntries": int(connection.execute("SELECT COUNT(*) FROM file_entries WHERE deleted_at IS NULL").fetchone()[0]),
            }

    def _verify_live_restore(self, validation: Dict[str, Any]) -> Dict[str, Any]:
        integrity = self.manager.integrity_check()
        if not integrity.get("ok"):
            raise RepositoryError("RESTORE_LIVE_INTEGRITY_FAILED", "Restored database integrity verification failed.", 500)
        actual_counts = self._live_database_counts()
        expected_counts = validation.get("databaseCounts") or {}
        if actual_counts != expected_counts:
            raise RepositoryError(
                "RESTORE_LIVE_COUNT_MISMATCH",
                "Restored database counts do not match the validated preview.",
                500,
                {"expected": expected_counts, "actual": actual_counts},
            )
        manifest = validation.get("manifest") if isinstance(validation.get("manifest"), dict) else {}
        assets = manifest.get("assets") if isinstance(manifest.get("assets"), dict) else {}
        entries = assets.get("entries") if isinstance(assets.get("entries"), list) else []
        expected_paths = set()
        for item in entries:
            relative_path = self._normalize_asset_path(item.get("relativePath"))
            expected_paths.add(relative_path)
            file_path = self._resolve_asset(relative_path)
            if file_path.stat().st_size != int(item.get("sizeBytes") or -1):
                raise RepositoryError("RESTORE_LIVE_ASSET_SIZE_MISMATCH", "Restored asset size does not match.", 500)
            if self._sha256_file(file_path) != str(item.get("checksumSha256") or "").lower():
                raise RepositoryError("RESTORE_LIVE_ASSET_CHECKSUM_MISMATCH", "Restored asset checksum does not match.", 500)
        assets_root = self._assets_root()
        actual_paths = {
            path.relative_to(assets_root).as_posix()
            for path in assets_root.rglob("*")
            if path.is_file()
        } if assets_root.is_dir() else set()
        if actual_paths != expected_paths:
            raise RepositoryError("RESTORE_LIVE_ASSET_SET_MISMATCH", "Restored asset set does not match.", 500)
        return {
            "integrityCheck": integrity.get("integrity") or [],
            "foreignKeyViolations": len(integrity.get("foreignKeyViolations") or []),
            "databaseCounts": actual_counts,
            "assetCount": len(actual_paths),
        }

    @staticmethod
    def _remove_directory(path: Path) -> None:
        if path.is_dir():
            shutil.rmtree(path)

    @staticmethod
    def _remove_database_files(path: Path) -> None:
        for candidate in (path, Path(str(path) + "-wal"), Path(str(path) + "-shm")):
            if candidate.is_file():
                candidate.unlink()

    def _after_restore_files_replaced(self, import_id: str) -> None:
        """Test hook invoked after DB/assets replacement and before verification."""

    def apply_staged_restore(
        self,
        import_id: Any,
        expected_package_checksum: Any,
        confirmation: Any,
    ) -> Dict[str, Any]:
        if confirmation != "RESTORE_VALIDATED_BACKUP":
            raise RepositoryError("RESTORE_CONFIRMATION_REQUIRED", "Explicit restore confirmation is required.", 400)
        package_path, metadata_path, metadata = self._resolve_staged_restore(import_id)
        expected_checksum = str(expected_package_checksum or "").strip().lower()
        if not re.fullmatch(r"[a-f0-9]{64}", expected_checksum):
            raise RepositoryError("RESTORE_CHECKSUM_REQUIRED", "Validated package checksum is required.", 400)
        actual_checksum = self._sha256_file(package_path)
        metadata_checksum = str(metadata.get("packageChecksumSha256") or "").lower()
        if actual_checksum != expected_checksum or actual_checksum != metadata_checksum:
            raise RepositoryError("RESTORE_PACKAGE_CHANGED", "Restore package changed after preview.", 409)

        validation = self.validate_package(package_path)
        if str(validation.get("packageChecksumSha256") or "").lower() != expected_checksum:
            raise RepositoryError("RESTORE_PACKAGE_CHANGED", "Restore package changed after preview.", 409)
        normalized_import_id = str(metadata["importId"])
        work_root = self._restore_work_root(normalized_import_id)
        rollback_root = (self.manager.data_root / "restore_rollbacks" / f"{normalized_import_id}_{uuid.uuid4().hex}").resolve()
        try:
            rollback_root.relative_to(self.manager.data_root)
        except ValueError as error:
            self._remove_directory(work_root)
            raise RepositoryError("RESTORE_ROLLBACK_PATH_INVALID", "Restore rollback path is invalid.", 500) from error

        database_ready = False
        assets_ready = False
        old_database_moved = False
        old_assets_moved = False
        pre_restore_backup: Optional[Dict[str, Any]] = None
        prepared_database: Optional[Path] = None
        prepared_assets: Optional[Path] = None
        rollback_database = rollback_root / self.manager.db_path.name
        rollback_assets = rollback_root / "assets"
        live_assets = self._assets_root()
        try:
            prepared_database, prepared_assets = self._extract_restore_files(package_path, work_root, validation)
            with self.manager.exclusive_maintenance():
                # This portable package is the durable user recovery point. Its
                # source DB is also retained as a verified online backup.
                pre_restore_backup = self.create_package(backup_type="pre_update")
                self.manager.checkpoint_for_replacement()
                rollback_root.mkdir(parents=True, exist_ok=False)
                os.replace(self.manager.db_path, rollback_database)
                old_database_moved = True
                for suffix in ("-wal", "-shm"):
                    sidecar = Path(str(self.manager.db_path) + suffix)
                    if sidecar.is_file():
                        os.replace(sidecar, rollback_root / f"{self.manager.db_path.name}{suffix}")
                os.replace(prepared_database, self.manager.db_path)
                database_ready = True
                if live_assets.is_dir():
                    os.replace(live_assets, rollback_assets)
                    old_assets_moved = True
                elif live_assets.exists():
                    raise RepositoryError("RESTORE_ASSETS_PATH_INVALID", "Live assets path is not a directory.", 500)
                os.replace(prepared_assets, live_assets)
                assets_ready = True
                self._after_restore_files_replaced(normalized_import_id)
                health = self.manager.reload_replaced_database()
                verification = self._verify_live_restore(validation)

            metadata.update({
                "status": "applied",
                "appliedAt": int(time.time() * 1000),
                "preRestoreBackup": {
                    "fileName": pre_restore_backup["fileName"],
                    "filePath": pre_restore_backup["filePath"],
                    "checksumSha256": pre_restore_backup["checksumSha256"],
                    "sourceBackup": pre_restore_backup["sourceBackup"],
                },
                "result": verification,
            })
            self._write_json_atomic(metadata_path, metadata)
            # Cleanup happens after the restore is durably marked applied. A
            # cleanup error must never roll a verified live database backward.
            try:
                self._remove_directory(work_root)
                self._remove_directory(rollback_root)
            except OSError:
                pass
            return {
                "status": "applied",
                "importId": normalized_import_id,
                "originalName": metadata.get("originalName"),
                "packageChecksumSha256": expected_checksum,
                "schemaVersion": int(health.get("schemaVersion") or 0),
                "verification": verification,
                "preRestoreBackup": metadata["preRestoreBackup"],
                "reloadRequired": True,
            }
        except Exception as error:
            rollback_error: Optional[Exception] = None
            if old_database_moved:
                try:
                    with self.manager.exclusive_maintenance():
                        if assets_ready:
                            self._remove_directory(live_assets)
                        if old_assets_moved and rollback_assets.is_dir():
                            os.replace(rollback_assets, live_assets)
                        self._remove_database_files(self.manager.db_path)
                        os.replace(rollback_database, self.manager.db_path)
                        for suffix in ("-wal", "-shm"):
                            rollback_sidecar = rollback_root / f"{self.manager.db_path.name}{suffix}"
                            if rollback_sidecar.is_file():
                                os.replace(rollback_sidecar, Path(str(self.manager.db_path) + suffix))
                        self.manager.reload_replaced_database()
                except Exception as caught:
                    rollback_error = caught
            if rollback_error is None:
                self._remove_directory(rollback_root)
                self._remove_directory(work_root)
            if rollback_error is not None:
                raise RepositoryError(
                    "RESTORE_ROLLBACK_FAILED",
                    "Restore failed and automatic rollback also failed. Recovery files were preserved.",
                    500,
                    {"rollbackPath": str(rollback_root.name)},
                ) from rollback_error
            if isinstance(error, RepositoryError) and not old_database_moved:
                raise
            raise RepositoryError(
                "RESTORE_APPLY_FAILED",
                "Restore failed and the previous database and assets were restored.",
                500,
                {"preRestoreBackup": pre_restore_backup.get("filePath") if pre_restore_backup else None},
            ) from error

    def validate_package(self, package_path: Path) -> Dict[str, Any]:
        package_path = Path(package_path).resolve()
        if not package_path.is_file():
            raise RepositoryError("BACKUP_PACKAGE_NOT_FOUND", "Backup package was not found.", 404)
        temp_database: Optional[Path] = None
        try:
            with zipfile.ZipFile(package_path, "r") as archive:
                infos = archive.infolist()
                if len(infos) > self.MAX_ARCHIVE_ENTRIES:
                    raise RepositoryError("BACKUP_TOO_MANY_ENTRIES", "Backup has too many entries.", 413)
                names: set[str] = set()
                total_size = 0
                for info in infos:
                    name = self._safe_archive_name(info.filename, allow_directory=info.is_dir())
                    if name in names:
                        raise RepositoryError("BACKUP_DUPLICATE_ENTRY", "Backup contains duplicate entries.", 400)
                    names.add(name)
                    total_size += int(info.file_size)
                    if total_size > self.MAX_TOTAL_BYTES:
                        raise RepositoryError("BACKUP_UNCOMPRESSED_TOO_LARGE", "Backup expands beyond the allowed size.", 413)
                    if info.file_size > 0 and info.compress_size == 0:
                        raise RepositoryError("BACKUP_INVALID_COMPRESSION", "Backup entry compression metadata is invalid.", 400)
                    if info.compress_size > 0 and info.file_size / info.compress_size > 1000:
                        raise RepositoryError("BACKUP_COMPRESSION_RATIO_BLOCKED", "Backup compression ratio is unsafe.", 413)
                if "manifest.json" not in names or self.DATABASE_ENTRY not in names or "assets/" not in names:
                    raise RepositoryError("BACKUP_REQUIRED_ENTRY_MISSING", "Backup required entries are missing.", 400)
                manifest_info = archive.getinfo("manifest.json")
                if manifest_info.file_size > self.MAX_MANIFEST_BYTES:
                    raise RepositoryError("BACKUP_MANIFEST_TOO_LARGE", "Backup manifest is too large.", 413)
                try:
                    manifest = json.loads(archive.read("manifest.json").decode("utf-8"))
                except (UnicodeDecodeError, json.JSONDecodeError) as error:
                    raise RepositoryError("BACKUP_MANIFEST_INVALID", "Backup manifest is invalid.", 400) from error
                if not isinstance(manifest, dict) or manifest.get("format") != self.FORMAT:
                    raise RepositoryError("BACKUP_FORMAT_UNSUPPORTED", "Backup format is not supported.", 400)
                if int(manifest.get("formatVersion") or 0) != self.FORMAT_VERSION:
                    raise RepositoryError("BACKUP_VERSION_UNSUPPORTED", "Backup format version is not supported.", 400)
                database = manifest.get("database") if isinstance(manifest.get("database"), dict) else {}
                if database.get("archivePath") != self.DATABASE_ENTRY:
                    raise RepositoryError("BACKUP_DATABASE_ENTRY_INVALID", "Backup database entry is invalid.", 400)
                database_info = archive.getinfo(self.DATABASE_ENTRY)
                if database_info.file_size > self.MAX_DATABASE_BYTES:
                    raise RepositoryError("BACKUP_DATABASE_TOO_LARGE", "Backup database is too large.", 413)
                with archive.open(self.DATABASE_ENTRY, "r") as source:
                    database_checksum, database_size = self._sha256_stream(source)
                if database_checksum != str(database.get("checksumSha256") or "").lower():
                    raise RepositoryError("BACKUP_DATABASE_CHECKSUM_MISMATCH", "Backup database checksum does not match.", 400)
                if database_size != int(database.get("sizeBytes") or -1):
                    raise RepositoryError("BACKUP_DATABASE_SIZE_MISMATCH", "Backup database size does not match.", 400)

                assets = manifest.get("assets") if isinstance(manifest.get("assets"), dict) else {}
                entries = assets.get("entries") if isinstance(assets.get("entries"), list) else []
                declared_assets: Dict[str, Dict[str, Any]] = {}
                for item in entries:
                    if not isinstance(item, dict):
                        raise RepositoryError("BACKUP_ASSET_MANIFEST_INVALID", "Backup asset manifest is invalid.", 400)
                    archive_path = self._safe_archive_name(item.get("archivePath"))
                    if not archive_path.startswith(self.ASSET_PREFIX):
                        raise RepositoryError("BACKUP_ASSET_PATH_INVALID", "Backup asset path is invalid.", 400)
                    relative_path = self._safe_archive_name(item.get("relativePath"))
                    if archive_path != self.ASSET_PREFIX + relative_path:
                        raise RepositoryError("BACKUP_ASSET_PATH_INVALID", "Backup asset paths do not match.", 400)
                    if archive_path in declared_assets:
                        raise RepositoryError("BACKUP_DUPLICATE_ASSET", "Backup asset manifest has duplicates.", 400)
                    declared_assets[archive_path] = item
                actual_assets = {
                    info.filename for info in infos
                    if not info.is_dir() and info.filename.startswith(self.ASSET_PREFIX)
                }
                if actual_assets != set(declared_assets):
                    raise RepositoryError("BACKUP_ASSET_SET_MISMATCH", "Backup assets do not match the manifest.", 400)
                allowed_names = {"manifest.json", self.DATABASE_ENTRY, "assets/"} | actual_assets
                if names != allowed_names:
                    raise RepositoryError("BACKUP_UNDECLARED_ENTRY", "Backup contains undeclared entries.", 400)
                asset_total = 0
                for archive_path, item in declared_assets.items():
                    info = archive.getinfo(archive_path)
                    if info.file_size > self.MAX_ASSET_BYTES:
                        raise RepositoryError("BACKUP_ASSET_TOO_LARGE", "Backup asset is too large.", 413)
                    with archive.open(archive_path, "r") as source:
                        checksum, size_bytes = self._sha256_stream(source)
                    if checksum != str(item.get("checksumSha256") or "").lower():
                        raise RepositoryError("BACKUP_ASSET_CHECKSUM_MISMATCH", "Backup asset checksum does not match.", 400)
                    if size_bytes != int(item.get("sizeBytes") or -1):
                        raise RepositoryError("BACKUP_ASSET_SIZE_MISMATCH", "Backup asset size does not match.", 400)
                    asset_total += size_bytes
                if len(declared_assets) != int(assets.get("count") or 0) or asset_total != int(assets.get("totalBytes") or 0):
                    raise RepositoryError("BACKUP_ASSET_SUMMARY_MISMATCH", "Backup asset summary does not match.", 400)

                handle = tempfile.NamedTemporaryFile(
                    prefix="mdviewer-validate-", suffix=".sqlite", dir=self.manager.data_root, delete=False
                )
                temp_database = Path(handle.name)
                try:
                    with archive.open(self.DATABASE_ENTRY, "r") as source:
                        for chunk in iter(lambda: source.read(1024 * 1024), b""):
                            handle.write(chunk)
                finally:
                    handle.close()
            connection = sqlite3.connect(f"file:{temp_database.as_posix()}?mode=ro", uri=True)
            try:
                has_migrations = connection.execute(
                    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'"
                ).fetchone()
                schema_version = int(
                    connection.execute(
                        "SELECT COALESCE(MAX(version), 0) FROM schema_migrations"
                    ).fetchone()[0]
                ) if has_migrations else 0
                integrity_rows = [str(row[0]) for row in connection.execute("PRAGMA integrity_check")]
                foreign_key_rows = connection.execute("PRAGMA foreign_key_check").fetchall()
                database_counts = {
                    "documents": int(connection.execute("SELECT COUNT(*) FROM documents WHERE deleted_at IS NULL").fetchone()[0]),
                    "folders": int(connection.execute("SELECT COUNT(*) FROM folders WHERE deleted_at IS NULL").fetchone()[0]),
                    "documentVersions": int(connection.execute("SELECT COUNT(*) FROM document_versions").fetchone()[0]),
                    "settings": int(connection.execute("SELECT COUNT(*) FROM settings").fetchone()[0]),
                    "assets": int(connection.execute("SELECT COUNT(*) FROM assets WHERE deleted_at IS NULL").fetchone()[0]),
                    "fileEntries": int(connection.execute("SELECT COUNT(*) FROM file_entries WHERE deleted_at IS NULL").fetchone()[0]),
                }
            finally:
                connection.close()
            expected_schema = int(self.manager.health().get("schemaVersion") or 0)
            if schema_version != int(database.get("schemaVersion") or -1):
                raise RepositoryError("BACKUP_SCHEMA_MANIFEST_MISMATCH", "Backup schema does not match its manifest.", 400)
            if schema_version != expected_schema:
                raise RepositoryError("BACKUP_SCHEMA_UNSUPPORTED", "Backup schema version is not supported.", 409)
            if integrity_rows != ["ok"]:
                raise RepositoryError("BACKUP_INTEGRITY_FAILED", "Backup database integrity check failed.", 400)
            if foreign_key_rows:
                raise RepositoryError("BACKUP_FOREIGN_KEY_FAILED", "Backup database foreign key check failed.", 400)
            return {
                "ok": True,
                "format": self.FORMAT,
                "formatVersion": self.FORMAT_VERSION,
                "schemaVersion": schema_version,
                "databaseChecksumSha256": database_checksum,
                "databaseSizeBytes": database_size,
                "integrityCheck": integrity_rows,
                "foreignKeyViolations": 0,
                "assetCount": len(declared_assets),
                "assetBytes": asset_total,
                "packageChecksumSha256": self._sha256_file(package_path),
                "packageSizeBytes": package_path.stat().st_size,
                "databaseCounts": database_counts,
                "manifest": manifest,
            }
        except zipfile.BadZipFile as error:
            raise RepositoryError("BACKUP_ARCHIVE_INVALID", "Backup archive is invalid.", 400) from error
        finally:
            if temp_database and temp_database.is_file():
                temp_database.unlink()
