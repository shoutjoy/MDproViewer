"""Large application model assets stored as chunked SQLite BLOB rows."""

from __future__ import annotations

import hashlib
import json
import re
import sqlite3
import time
import uuid
from typing import Any, BinaryIO, Dict, Iterator, List

from .database import DatabaseManager
from .repositories import RepositoryError


class ModelAssetService:
    MODEL_CONFIG = {
        "u2net_human_seg": {
            "fileName": "u2net_human_seg.onnx",
            "mimeType": "application/octet-stream",
            "appId": "fmaviewer",
        }
    }
    MIN_MODEL_BYTES = 100_000_000
    MAX_MODEL_BYTES = 512 * 1024 * 1024
    CHUNK_BYTES = 4 * 1024 * 1024
    MANIFEST_FORMAT = "sqlite-chunked-model"
    MANIFEST_VERSION = 1
    SAFE_FILE_NAME_RE = re.compile(r"^[^\\/\x00]{1,255}$")

    def __init__(self, manager: DatabaseManager) -> None:
        self.manager = manager

    @classmethod
    def _model_key(cls, value: Any) -> str:
        normalized = str(value or "").strip().lower()
        if normalized not in cls.MODEL_CONFIG:
            raise RepositoryError("MODEL_KEY_INVALID", "Application model is not supported.")
        return normalized

    @classmethod
    def _file_name(cls, value: Any) -> str:
        normalized = str(value or "").strip()
        if not cls.SAFE_FILE_NAME_RE.fullmatch(normalized) or not normalized.lower().endswith(".onnx"):
            raise RepositoryError("MODEL_FILE_NAME_INVALID", "Select a valid .onnx model file.")
        return normalized

    @classmethod
    def _content_length(cls, value: Any) -> int:
        try:
            size_bytes = int(str(value or ""))
        except ValueError as error:
            raise RepositoryError("INVALID_CONTENT_LENGTH", "Content-Length is invalid.") from error
        if size_bytes < cls.MIN_MODEL_BYTES:
            raise RepositoryError("MODEL_FILE_TOO_SMALL", "ONNX model file is smaller than expected.")
        if size_bytes > cls.MAX_MODEL_BYTES:
            raise RepositoryError("MODEL_FILE_TOO_LARGE", "ONNX model file exceeds the 512 MB limit.", 413)
        return size_bytes

    @classmethod
    def _parse_manifest(cls, value: Any) -> Dict[str, Any]:
        try:
            manifest = json.loads(str(value or ""))
        except (TypeError, json.JSONDecodeError) as error:
            raise RepositoryError("MODEL_MANIFEST_INVALID", "Stored model manifest is invalid.", 500) from error
        if (
            not isinstance(manifest, dict)
            or manifest.get("format") != cls.MANIFEST_FORMAT
            or manifest.get("version") != cls.MANIFEST_VERSION
            or not isinstance(manifest.get("chunkAssetIds"), list)
            or not manifest["chunkAssetIds"]
            or len(set(manifest["chunkAssetIds"])) != len(manifest["chunkAssetIds"])
        ):
            raise RepositoryError("MODEL_MANIFEST_INVALID", "Stored model manifest is invalid.", 500)
        return manifest

    @staticmethod
    def _looks_like_error_document(first_chunk: bytes) -> bool:
        prefix = first_chunk[:512].lstrip().lower()
        return prefix.startswith((b"<!", b"<html", b"<?xml", b"{"))

    def save_upload(
        self,
        stream: BinaryIO,
        content_length: Any,
        file_name: Any,
        model_key: Any,
    ) -> Dict[str, Any]:
        normalized_key = self._model_key(model_key)
        normalized_name = self._file_name(file_name)
        expected_size = self._content_length(content_length)
        config = self.MODEL_CONFIG[normalized_key]
        source_id = f"source_sqlite_models_{config['appId']}"
        entry_id = f"file_model_{config['appId']}_{normalized_key}"
        entry_path = f"models/{normalized_key}.onnx"
        now_ms = int(time.time() * 1000)
        digest = hashlib.sha256()
        received = 0
        new_asset_ids: List[str] = []

        with self.manager.write_transaction() as connection:
            previous = connection.execute(
                "SELECT content_text FROM file_entries WHERE id = ? AND deleted_at IS NULL",
                (entry_id,),
            ).fetchone()
            previous_manifest = self._parse_manifest(previous["content_text"]) if previous else None
            previous_asset_ids = list(previous_manifest.get("chunkAssetIds", [])) if previous_manifest else []

            connection.execute(
                """
                INSERT INTO workspace_sources
                    (id, workspace_id, source_type, name, root_uri, config_json,
                     sync_direction, is_enabled, status, created_at, updated_at)
                VALUES (?, ?, 'internal_library', ?, ?, ?, 'manual', 1, 'ready', ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    name = excluded.name,
                    config_json = excluded.config_json,
                    is_enabled = 1,
                    status = 'ready',
                    updated_at = excluded.updated_at
                """,
                (
                    source_id,
                    self.manager.DEFAULT_WORKSPACE_ID,
                    f"{config['appId']} SQLite 모델",
                    f"sqlite://models/{config['appId']}",
                    json.dumps({"appId": config["appId"], "kind": "models"}, ensure_ascii=False),
                    now_ms,
                    now_ms,
                ),
            )

            remaining = expected_size
            chunk_index = 0
            while remaining > 0:
                chunk = stream.read(min(remaining, self.CHUNK_BYTES))
                if not chunk:
                    break
                if chunk_index == 0 and self._looks_like_error_document(chunk):
                    raise RepositoryError("MODEL_FILE_CONTENT_INVALID", "Downloaded model is an error document.")
                digest.update(chunk)
                received += len(chunk)
                remaining -= len(chunk)
                asset_id = f"asset_model_chunk_{uuid.uuid4().hex}"
                new_asset_ids.append(asset_id)
                connection.execute(
                    """
                    INSERT INTO assets
                        (id, workspace_id, asset_type, storage_type, original_name,
                         stored_name, mime_type, extension, size_bytes, source_provider,
                         created_at, updated_at)
                    VALUES (?, ?, 'other', 'sqlite_blob', ?, ?, ?, 'onnx-part', ?, ?, ?, ?)
                    """,
                    (
                        asset_id,
                        self.manager.DEFAULT_WORKSPACE_ID,
                        normalized_name,
                        f"{normalized_key}.part{chunk_index:04d}",
                        config["mimeType"],
                        len(chunk),
                        f"sqlite_model:{config['appId']}:{normalized_key}:{chunk_index}",
                        now_ms,
                        now_ms,
                    ),
                )
                connection.execute(
                    "INSERT INTO asset_blobs (asset_id, blob_data, created_at) VALUES (?, ?, ?)",
                    (asset_id, sqlite3.Binary(chunk), now_ms),
                )
                chunk_index += 1

            if received != expected_size:
                raise RepositoryError("MODEL_UPLOAD_INCOMPLETE", "ONNX model upload is incomplete.")

            checksum = digest.hexdigest()
            deduplicated = bool(
                previous_manifest
                and previous_manifest.get("checksumSha256") == checksum
                and int(previous_manifest.get("sizeBytes") or 0) == received
            )
            if deduplicated:
                for asset_id in new_asset_ids:
                    connection.execute("DELETE FROM assets WHERE id = ?", (asset_id,))
                connection.execute(
                    "UPDATE file_entries SET name = ?, modified_at = ?, updated_at = ? WHERE id = ?",
                    (normalized_name, now_ms, now_ms, entry_id),
                )
                manifest = previous_manifest
            else:
                manifest = {
                    "format": self.MANIFEST_FORMAT,
                    "version": self.MANIFEST_VERSION,
                    "modelKey": normalized_key,
                    "appId": config["appId"],
                    "fileName": normalized_name,
                    "mimeType": config["mimeType"],
                    "sizeBytes": received,
                    "checksumSha256": checksum,
                    "chunkBytes": self.CHUNK_BYTES,
                    "chunkAssetIds": new_asset_ids,
                    "createdAt": now_ms,
                }
                connection.execute(
                    """
                    INSERT INTO file_entries
                        (id, source_id, entry_type, path, name, extension, mime_type,
                         content_text, size_bytes, modified_at, remote_revision, checksum,
                         base_checksum, sync_status, created_at, updated_at)
                    VALUES (?, ?, 'file', ?, ?, 'onnx', ?, ?, ?, ?, 'onnx_model', ?, ?, 'synced', ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                        source_id = excluded.source_id,
                        path = excluded.path,
                        name = excluded.name,
                        mime_type = excluded.mime_type,
                        content_text = excluded.content_text,
                        size_bytes = excluded.size_bytes,
                        modified_at = excluded.modified_at,
                        checksum = excluded.checksum,
                        base_checksum = excluded.base_checksum,
                        sync_status = 'synced',
                        deleted_at = NULL,
                        updated_at = excluded.updated_at
                    """,
                    (
                        entry_id,
                        source_id,
                        entry_path,
                        normalized_name,
                        config["mimeType"],
                        json.dumps(manifest, ensure_ascii=False, separators=(",", ":")),
                        received,
                        now_ms,
                        checksum,
                        checksum,
                        now_ms,
                        now_ms,
                    ),
                )
                for asset_id in previous_asset_ids:
                    connection.execute("DELETE FROM assets WHERE id = ?", (asset_id,))

        return self.get_model(normalized_key) | {"deduplicated": deduplicated}

    def get_model(self, model_key: Any) -> Dict[str, Any]:
        normalized_key = self._model_key(model_key)
        config = self.MODEL_CONFIG[normalized_key]
        entry_id = f"file_model_{config['appId']}_{normalized_key}"
        with self.manager.connection() as connection:
            row = connection.execute(
                """
                SELECT id, name, mime_type, size_bytes, checksum, content_text,
                       created_at, updated_at
                FROM file_entries
                WHERE id = ? AND deleted_at IS NULL
                """,
                (entry_id,),
            ).fetchone()
            if not row:
                raise RepositoryError("MODEL_NOT_FOUND", "SQLite model is not stored.", 404)
            manifest = self._parse_manifest(row["content_text"])
            chunk_ids = list(manifest["chunkAssetIds"])
            placeholders = ",".join("?" for _ in chunk_ids)
            chunks = connection.execute(
                f"""
                SELECT a.id, a.size_bytes, LENGTH(b.blob_data) AS blob_size
                FROM assets AS a
                JOIN asset_blobs AS b ON b.asset_id = a.id
                WHERE a.id IN ({placeholders}) AND a.deleted_at IS NULL
                """,
                chunk_ids,
            ).fetchall()
        sizes = {str(item["id"]): int(item["blob_size"] or 0) for item in chunks}
        if len(sizes) != len(chunk_ids) or any(asset_id not in sizes for asset_id in chunk_ids):
            raise RepositoryError("MODEL_CHUNK_MISSING", "SQLite model chunk is missing.", 409)
        total_size = sum(sizes[asset_id] for asset_id in chunk_ids)
        if total_size != int(row["size_bytes"] or 0) or total_size != int(manifest.get("sizeBytes") or 0):
            raise RepositoryError("MODEL_SIZE_MISMATCH", "SQLite model size does not match.", 409)
        return {
            "modelKey": normalized_key,
            "appId": config["appId"],
            "name": str(row["name"]),
            "mimeType": str(row["mime_type"] or config["mimeType"]),
            "sizeBytes": total_size,
            "checksumSha256": str(row["checksum"] or ""),
            "chunkCount": len(chunk_ids),
            "createdAt": int(row["created_at"]),
            "updatedAt": int(row["updated_at"]),
            "downloadUrl": f"/api/sqlite/models/{normalized_key}/download",
            "_chunkAssetIds": chunk_ids,
        }

    def get_model_status(self, model_key: Any) -> Dict[str, Any]:
        try:
            item = self.get_model(model_key)
        except RepositoryError as error:
            if error.code == "MODEL_NOT_FOUND":
                return {"available": False, "modelKey": self._model_key(model_key)}
            raise
        item.pop("_chunkAssetIds", None)
        item["available"] = True
        return item

    def iter_model_chunks(self, model_key: Any) -> Iterator[bytes]:
        item = self.get_model(model_key)
        chunk_ids = item["_chunkAssetIds"]
        with self.manager.connection() as connection:
            for asset_id in chunk_ids:
                row = connection.execute(
                    """
                    SELECT b.blob_data
                    FROM asset_blobs AS b
                    JOIN assets AS a ON a.id = b.asset_id
                    WHERE b.asset_id = ? AND a.deleted_at IS NULL
                    """,
                    (asset_id,),
                ).fetchone()
                if not row:
                    raise RepositoryError("MODEL_CHUNK_MISSING", "SQLite model chunk is missing.", 409)
                yield bytes(row["blob_data"])
