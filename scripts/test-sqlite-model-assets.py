"""Round-trip, replacement and rollback tests for chunked SQLite model BLOBs."""

from __future__ import annotations

import hashlib
import io
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
from LocalSave_sqlite.server.model_assets import ModelAssetService  # noqa: E402
from LocalSave_sqlite.server.repositories import RepositoryError  # noqa: E402


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def expect_error(code: str, callback) -> None:
    try:
        callback()
    except RepositoryError as error:
        require(error.code == code, f"expected {code}, got {error.code}")
    else:
        raise AssertionError(f"expected {code}")


def counts(manager: DatabaseManager) -> tuple[int, int, int]:
    with manager.connection() as connection:
        assets = int(connection.execute("SELECT COUNT(*) FROM assets").fetchone()[0])
        blobs = int(connection.execute("SELECT COUNT(*) FROM asset_blobs").fetchone()[0])
        entries = int(
            connection.execute("SELECT COUNT(*) FROM file_entries WHERE remote_revision='onnx_model'").fetchone()[0]
        )
    return assets, blobs, entries


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="sqlite-model-assets-", dir=APP_ROOT / "LocalSave_sqlite") as temp_name:
        manager = DatabaseManager(APP_ROOT, data_root=Path(temp_name) / "data")
        manager.initialize()
        service = ModelAssetService(manager)
        ModelAssetService.MIN_MODEL_BYTES = 1
        ModelAssetService.CHUNK_BYTES = 7

        first_bytes = b"\x08ONNX-model-one-0123456789"
        first = service.save_upload(
            io.BytesIO(first_bytes), len(first_bytes), "u2net_human_seg.onnx", "u2net_human_seg"
        )
        require(first["checksumSha256"] == hashlib.sha256(first_bytes).hexdigest(), "first checksum failed")
        require(first["chunkCount"] == 4, "chunk count failed")
        require(b"".join(service.iter_model_chunks("u2net_human_seg")) == first_bytes, "model round-trip failed")
        require(counts(manager) == (4, 4, 1), "first SQLite BLOB counts failed")

        duplicate = service.save_upload(
            io.BytesIO(first_bytes), len(first_bytes), "same.onnx", "u2net_human_seg"
        )
        require(duplicate["deduplicated"] is True, "same model was not deduplicated")
        require(counts(manager) == (4, 4, 1), "dedup left temporary chunks")

        second_bytes = b"\x08ONNX-model-two-abcdefghijklmnopqrstuvwxyz"
        second = service.save_upload(
            io.BytesIO(second_bytes), len(second_bytes), "replacement.onnx", "u2net_human_seg"
        )
        require(second["checksumSha256"] == hashlib.sha256(second_bytes).hexdigest(), "replacement checksum failed")
        require(b"".join(service.iter_model_chunks("u2net_human_seg")) == second_bytes, "replacement round-trip failed")
        require(counts(manager) == (6, 6, 1), "old chunks were not replaced")

        before_counts = counts(manager)
        expect_error(
            "MODEL_UPLOAD_INCOMPLETE",
            lambda: service.save_upload(
                io.BytesIO(b"short"), 20, "broken.onnx", "u2net_human_seg"
            ),
        )
        require(counts(manager) == before_counts, "incomplete upload did not roll back")
        require(b"".join(service.iter_model_chunks("u2net_human_seg")) == second_bytes, "rollback damaged model")

        html = b"<!doctype html><title>download error</title>"
        expect_error(
            "MODEL_FILE_CONTENT_INVALID",
            lambda: service.save_upload(io.BytesIO(html), len(html), "error.onnx", "u2net_human_seg"),
        )
        expect_error(
            "MODEL_FILE_NAME_INVALID",
            lambda: service.save_upload(io.BytesIO(first_bytes), len(first_bytes), "model.bin", "u2net_human_seg"),
        )

        package = BackupPackageService(manager).create_package()
        package_path = APP_ROOT / package["filePath"]
        extracted_db = Path(temp_name) / "packaged.sqlite"
        with zipfile.ZipFile(package_path, "r") as archive:
            extracted_db.write_bytes(archive.read("mdpro.sqlite"))
        connection = sqlite3.connect(str(extracted_db))
        try:
            packaged_blobs = int(connection.execute("SELECT COUNT(*) FROM asset_blobs").fetchone()[0])
            packaged_bytes = int(connection.execute("SELECT SUM(LENGTH(blob_data)) FROM asset_blobs").fetchone()[0])
        finally:
            connection.close()
        require(packaged_blobs == second["chunkCount"], "backup omitted model chunks")
        require(packaged_bytes == len(second_bytes), "backup model bytes changed")

    print("SQLite model asset round-trip/replacement/rollback tests passed")


if __name__ == "__main__":
    main()
