"""FMA explorer summary, lightweight thumbnail and cache tests."""

from __future__ import annotations

import io
import base64
import json
import sys
import tempfile
import zipfile
from pathlib import Path


APP_ROOT = Path(__file__).resolve().parents[1]
if str(APP_ROOT) not in sys.path:
    sys.path.insert(0, str(APP_ROOT))

from LocalSave_sqlite.server.backup_packages import BackupPackageService  # noqa: E402
from LocalSave_sqlite.server.database import DatabaseManager  # noqa: E402
from LocalSave_sqlite.server.fma_previews import FmaPreviewService  # noqa: E402
from LocalSave_sqlite.server.repositories import RepositoryError  # noqa: E402
from LocalSave_sqlite.server.work_files import WorkFileService  # noqa: E402


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def make_png() -> bytes:
    return base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
    )


def make_fma() -> bytes:
    png = make_png()
    manifest = {
        "format": "fma-archive",
        "version": 3,
        "generator": "preview-test",
        "images": [
            {
                "path": "$.added.sample.png",
                "src": {"$fmaMedia": "image-1"},
                "mimeType": "image/png",
                "size": len(png),
                "width": 640,
                "height": 360,
            },
            {
                "path": "$.added.clip.webm",
                "src": {"$fmaMedia": "video-1"},
                "mimeType": "video/webm",
                "size": 12,
            },
        ] + [
            {
                "path": f"$.added.copy-{index}.png",
                "src": {"$fmaMedia": "image-1"},
                "mimeType": "image/png",
                "size": len(png),
            }
            for index in range(28)
        ],
        "media": {
            "image-1": {"path": "media/image-1.png", "mimeType": "image/png", "size": len(png)},
            "video-1": {"path": "media/video-1.webm", "mimeType": "video/webm", "size": 12},
        },
    }
    target = io.BytesIO()
    with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("manifest.json", json.dumps(manifest))
        archive.writestr("media/image-1.png", png)
        archive.writestr("media/video-1.webm", b"webm-preview")
    return target.getvalue()


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="sqlite-fma-preview-", dir=APP_ROOT / "LocalSave_sqlite") as temp_name:
        manager = DatabaseManager(APP_ROOT, data_root=Path(temp_name) / "data")
        manager.initialize()
        work_files = WorkFileService(manager)
        fma_bytes = make_fma()
        saved = work_files.save_upload(
            io.BytesIO(fma_bytes), len(fma_bytes), "gallery.fma", "fma", "fmaviewer"
        )
        previews = FmaPreviewService(manager)
        summary = previews.get_summary(saved["id"])
        require(summary["counts"]["galleryItems"] == 30, "gallery item count failed")
        require(summary["counts"]["uniqueMedia"] == 2, "unique media count failed")
        require(summary["counts"]["images"] == 1, "image type count failed")
        require(summary["counts"]["videos"] == 1, "video type count failed")
        require(summary["mimeCounts"] == {"image/png": 1, "video/webm": 1}, "MIME counts failed")
        require(summary["shownGalleryItems"] == 24, "gallery limit failed")
        require(summary["gallery"][0]["name"] == "sample.png", "gallery display name failed")
        require(summary["gallery"][1]["previewAvailable"] is False, "video must use a placeholder")

        thumbnail = previews.get_thumbnail(saved["id"], "image-1")
        require(thumbnail["mimeType"] in {"image/webp", "image/png"}, "thumbnail MIME failed")
        require(thumbnail["path"].is_file(), "thumbnail cache file missing")
        require(thumbnail["path"].stat().st_size < len(fma_bytes), "thumbnail is not lightweight")
        require(thumbnail["path"].stat().st_size <= 2 * 1024 * 1024, "preview byte cap failed")
        cached = previews.get_thumbnail(saved["id"], "image-1")
        require(cached["cached"] is True and cached["path"] == thumbnail["path"], "thumbnail cache was not reused")

        try:
            previews.get_thumbnail(saved["id"], "video-1")
        except RepositoryError as error:
            require(error.code == "FMA_THUMBNAIL_UNSUPPORTED", "video thumbnail error mismatch")
        else:
            raise AssertionError("video thumbnail must be blocked")

        package = BackupPackageService(manager).create_package()
        package_path = APP_ROOT / package["filePath"]
        with zipfile.ZipFile(package_path, "r") as archive:
            require(
                not any(name.startswith("previews/") for name in archive.namelist()),
                "regenerable preview cache leaked into backup",
            )

    print("SQLite FMA explorer summary/thumbnail/cache tests passed")


if __name__ == "__main__":
    main()
