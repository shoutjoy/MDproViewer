"""Read-only FMA manifest summaries and small cached gallery thumbnails."""

from __future__ import annotations

import hashlib
import io
import json
import os
import re
import tempfile
import uuid
import zipfile
from collections import Counter
from pathlib import Path, PurePosixPath
from typing import Any, Dict, List, Tuple
from urllib.parse import quote

from .database import DatabaseManager
from .repositories import RepositoryError

try:
    from PIL import Image, ImageOps, UnidentifiedImageError
    DecompressionBombError = Image.DecompressionBombError
except ImportError:  # Keep summary/counts available on minimal Python installs.
    Image = None
    ImageOps = None
    UnidentifiedImageError = OSError
    DecompressionBombError = OSError


class FmaPreviewService:
    MAX_MANIFEST_BYTES = 16 * 1024 * 1024
    MAX_MEDIA_BYTES = 64 * 1024 * 1024
    MAX_FALLBACK_MEDIA_BYTES = 2 * 1024 * 1024
    MAX_IMAGE_PIXELS = 80_000_000
    MAX_GALLERY_ITEMS = 24
    THUMBNAIL_SIZE = (240, 240)
    SAFE_ENTRY_ID_RE = re.compile(r"^file_[a-f0-9]{32}$")
    SAFE_MEDIA_ID_RE = re.compile(r"^[A-Za-z0-9_.:-]{1,128}$")
    FMA_WORK_TYPES = {"fma", "fma_webp", "fma_snapshot"}
    FALLBACK_IMAGE_MIMES = {
        "image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"
    }

    def __init__(self, manager: DatabaseManager) -> None:
        self.manager = manager

    @property
    def assets_root(self) -> Path:
        return (self.manager.data_root / "assets").resolve()

    @property
    def cache_root(self) -> Path:
        root = (self.manager.data_root / "previews" / "fma").resolve()
        root.mkdir(parents=True, exist_ok=True)
        return root

    @staticmethod
    def _safe_zip_path(value: Any) -> str:
        normalized = str(value or "").replace("\\", "/")
        path = PurePosixPath(normalized)
        if (
            not normalized
            or normalized.startswith("/")
            or "\x00" in normalized
            or any(part in {"", ".", ".."} for part in path.parts)
            or (path.parts and ":" in path.parts[0])
        ):
            raise RepositoryError("FMA_PREVIEW_PATH_INVALID", "FMA contains an unsafe media path.", 409)
        return path.as_posix()

    @classmethod
    def _entry_id(cls, value: Any) -> str:
        normalized = str(value or "").strip()
        if not cls.SAFE_ENTRY_ID_RE.fullmatch(normalized):
            raise RepositoryError("FMA_PREVIEW_ENTRY_INVALID", "FMA file entry identifier is invalid.")
        return normalized

    @classmethod
    def _media_id(cls, value: Any) -> str:
        normalized = str(value or "").strip()
        if not cls.SAFE_MEDIA_ID_RE.fullmatch(normalized):
            raise RepositoryError("FMA_PREVIEW_MEDIA_INVALID", "FMA media identifier is invalid.")
        return normalized

    def _resolve_entry(self, entry_id: Any) -> Dict[str, Any]:
        normalized_id = self._entry_id(entry_id)
        with self.manager.connection() as connection:
            row = connection.execute(
                """
                SELECT e.id, e.name, e.extension, e.mime_type, e.size_bytes,
                       e.remote_revision, e.checksum, e.asset_id,
                       s.id AS source_id, s.workspace_id,
                       a.storage_type, a.relative_path, a.size_bytes AS asset_size,
                       a.checksum_sha256, a.source_provider
                FROM file_entries AS e
                JOIN workspace_sources AS s ON s.id = e.source_id
                JOIN assets AS a ON a.id = e.asset_id
                WHERE e.id = ? AND e.deleted_at IS NULL AND a.deleted_at IS NULL
                """,
                (normalized_id,),
            ).fetchone()
        if not row:
            raise RepositoryError("FMA_PREVIEW_NOT_FOUND", "FMA work file was not found.", 404)
        if (
            row["workspace_id"] != self.manager.DEFAULT_WORKSPACE_ID
            or str(row["extension"] or "").lower() != "fma"
            or str(row["remote_revision"] or "") not in self.FMA_WORK_TYPES
            or row["storage_type"] != "filesystem"
            or not str(row["source_provider"] or "").startswith("sqlite_workfiles:fmaviewer")
        ):
            raise RepositoryError("FMA_PREVIEW_UNSUPPORTED", "Selected file is not a managed FMA work file.", 415)
        relative_path = self._safe_zip_path(row["relative_path"])
        path = (self.assets_root / Path(*PurePosixPath(relative_path).parts)).resolve()
        try:
            path.relative_to(self.assets_root)
        except ValueError as error:
            raise RepositoryError("FMA_PREVIEW_PATH_INVALID", "FMA asset path is invalid.", 409) from error
        expected_size = int(row["asset_size"] or row["size_bytes"] or 0)
        if not path.is_file() or path.stat().st_size != expected_size:
            raise RepositoryError("FMA_PREVIEW_ASSET_MISSING", "FMA asset is missing or incomplete.", 409)
        return {
            "id": normalized_id,
            "name": str(row["name"]),
            "path": path,
            "sizeBytes": expected_size,
            "checksumSha256": str(row["checksum_sha256"] or row["checksum"] or ""),
            "workType": str(row["remote_revision"]),
        }

    def _load_manifest(self, path: Path) -> Tuple[Dict[str, Any], Dict[str, zipfile.ZipInfo]]:
        try:
            with zipfile.ZipFile(path, "r") as archive:
                infos: Dict[str, zipfile.ZipInfo] = {}
                for info in archive.infolist():
                    safe_name = self._safe_zip_path(info.filename)
                    if safe_name in infos:
                        raise RepositoryError("FMA_PREVIEW_DUPLICATE_PATH", "FMA contains duplicate paths.", 409)
                    if info.flag_bits & 0x1:
                        raise RepositoryError("FMA_PREVIEW_ENCRYPTED", "Encrypted FMA entries cannot be previewed.", 415)
                    infos[safe_name] = info
                manifest_info = infos.get("manifest.json")
                if not manifest_info or manifest_info.file_size > self.MAX_MANIFEST_BYTES:
                    raise RepositoryError("FMA_PREVIEW_MANIFEST_INVALID", "FMA manifest is missing or too large.", 409)
                try:
                    manifest = json.loads(archive.read(manifest_info).decode("utf-8"))
                except (UnicodeDecodeError, json.JSONDecodeError) as error:
                    raise RepositoryError("FMA_PREVIEW_MANIFEST_INVALID", "FMA manifest is invalid.", 409) from error
        except zipfile.BadZipFile as error:
            raise RepositoryError("FMA_PREVIEW_ARCHIVE_INVALID", "FMA archive is invalid.", 409) from error
        if (
            not isinstance(manifest, dict)
            or manifest.get("format") != "fma-archive"
            or int(manifest.get("version") or 0) < 3
            or not isinstance(manifest.get("images"), list)
            or not isinstance(manifest.get("media"), dict)
        ):
            raise RepositoryError("FMA_PREVIEW_MANIFEST_UNSUPPORTED", "FMA manifest format is unsupported.", 415)
        return manifest, infos

    @staticmethod
    def _media_type(mime_type: str) -> str:
        normalized = str(mime_type or "").lower()
        if normalized.startswith("image/"):
            return "image"
        if normalized.startswith("video/"):
            return "video"
        if normalized.startswith("audio/"):
            return "audio"
        return "other"

    @staticmethod
    def _display_name(image: Dict[str, Any], media_path: str, index: int) -> str:
        source_path = str(image.get("path") or "").strip()
        if source_path:
            cleaned = source_path.replace("\\", "/").split("/")[-1]
            if cleaned.startswith("$.added."):
                cleaned = cleaned[len("$.added.") :]
            if cleaned:
                return cleaned[:255]
        return PurePosixPath(media_path).name or f"media-{index + 1}"

    def get_summary(self, entry_id: Any) -> Dict[str, Any]:
        entry = self._resolve_entry(entry_id)
        manifest, infos = self._load_manifest(entry["path"])
        media_manifest = manifest["media"]
        type_counts: Counter[str] = Counter()
        mime_counts: Counter[str] = Counter()
        extension_counts: Counter[str] = Counter()
        total_media_bytes = 0
        for media_id, record in media_manifest.items():
            if not isinstance(media_id, str) or not isinstance(record, dict):
                raise RepositoryError("FMA_PREVIEW_MEDIA_INVALID", "FMA media metadata is invalid.", 409)
            media_path = self._safe_zip_path(record.get("path"))
            info = infos.get(media_path)
            if not media_path.startswith("media/") or not info or info.is_dir():
                raise RepositoryError("FMA_PREVIEW_MEDIA_MISSING", "FMA media file is missing.", 409)
            mime_type = str(record.get("mimeType") or "application/octet-stream").lower()
            media_type = self._media_type(mime_type)
            type_counts[media_type] += 1
            mime_counts[mime_type] += 1
            extension_counts[PurePosixPath(media_path).suffix.lower().lstrip(".") or "none"] += 1
            total_media_bytes += int(record.get("size") or info.file_size or 0)

        gallery: List[Dict[str, Any]] = []
        for index, image in enumerate(manifest["images"]):
            if len(gallery) >= self.MAX_GALLERY_ITEMS:
                break
            if not isinstance(image, dict):
                continue
            source = image.get("src")
            media_id = source.get("$fmaMedia") if isinstance(source, dict) else None
            if not isinstance(media_id, str) or not self.SAFE_MEDIA_ID_RE.fullmatch(media_id):
                continue
            record = media_manifest.get(media_id)
            if not isinstance(record, dict):
                continue
            media_path = self._safe_zip_path(record.get("path"))
            info = infos.get(media_path)
            if not info or info.is_dir():
                continue
            mime_type = str(record.get("mimeType") or image.get("mimeType") or "application/octet-stream").lower()
            media_type = self._media_type(mime_type)
            media_size = int(record.get("size") or info.file_size or 0)
            preview_available = bool(
                media_type == "image"
                and (
                    (Image is not None and mime_type != "image/svg+xml" and 0 < info.file_size <= self.MAX_MEDIA_BYTES)
                    or (
                        Image is None
                        and mime_type in self.FALLBACK_IMAGE_MIMES
                        and 0 < info.file_size <= self.MAX_FALLBACK_MEDIA_BYTES
                    )
                )
            )
            gallery.append(
                {
                    "index": index,
                    "mediaId": media_id,
                    "name": self._display_name(image, media_path, index),
                    "mediaType": media_type,
                    "mimeType": mime_type,
                    "extension": PurePosixPath(media_path).suffix.lower().lstrip("."),
                    "sizeBytes": media_size,
                    "width": image.get("width"),
                    "height": image.get("height"),
                    "previewAvailable": preview_available,
                    "thumbnailUrl": (
                        f"/api/sqlite/explorer/files/{entry['id']}/fma-thumbnail/{quote(media_id, safe='')}"
                        if preview_available
                        else None
                    ),
                }
            )

        return {
            "kind": "fma",
            "format": str(manifest.get("format")),
            "version": int(manifest.get("version") or 0),
            "generator": str(manifest.get("generator") or ""),
            "timestamp": manifest.get("timestamp"),
            "workType": entry["workType"],
            "counts": {
                "galleryItems": len(manifest["images"]),
                "uniqueMedia": len(media_manifest),
                "images": int(type_counts["image"]),
                "videos": int(type_counts["video"]),
                "audio": int(type_counts["audio"]),
                "other": int(type_counts["other"]),
            },
            "mimeCounts": dict(sorted(mime_counts.items())),
            "extensionCounts": dict(sorted(extension_counts.items())),
            "totalMediaBytes": total_media_bytes,
            "galleryLimit": self.MAX_GALLERY_ITEMS,
            "shownGalleryItems": len(gallery),
            "thumbnailSupport": Image is not None,
            "previewMode": "webpThumbnail" if Image is not None else "limitedOriginal",
            "fallbackMaxBytes": self.MAX_FALLBACK_MEDIA_BYTES if Image is None else None,
            "gallery": gallery,
        }

    def get_thumbnail(self, entry_id: Any, media_id: Any) -> Dict[str, Any]:
        entry = self._resolve_entry(entry_id)
        normalized_media_id = self._media_id(media_id)
        manifest, infos = self._load_manifest(entry["path"])
        record = manifest["media"].get(normalized_media_id)
        if not isinstance(record, dict):
            raise RepositoryError("FMA_PREVIEW_MEDIA_NOT_FOUND", "FMA media was not found.", 404)
        media_path = self._safe_zip_path(record.get("path"))
        info = infos.get(media_path)
        mime_type = str(record.get("mimeType") or "").lower()
        using_pillow = Image is not None and ImageOps is not None
        maximum_bytes = self.MAX_MEDIA_BYTES if using_pillow else self.MAX_FALLBACK_MEDIA_BYTES
        if (
            not info
            or info.is_dir()
            or self._media_type(mime_type) != "image"
            or (using_pillow and mime_type == "image/svg+xml")
            or (not using_pillow and mime_type not in self.FALLBACK_IMAGE_MIMES)
            or info.file_size <= 0
            or info.file_size > maximum_bytes
        ):
            raise RepositoryError("FMA_THUMBNAIL_UNSUPPORTED", "This FMA media cannot be previewed.", 415)

        cache_key = hashlib.sha256(
            f"{entry['checksumSha256']}:{normalized_media_id}:"
            f"{'240:webp' if using_pillow else 'limited-original'}:v1".encode("utf-8")
        ).hexdigest()
        cache_dir = (self.cache_root / cache_key[:2]).resolve()
        cache_dir.mkdir(parents=True, exist_ok=True)
        fallback_extension = PurePosixPath(media_path).suffix.lower()
        cache_extension = ".webp" if using_pillow else fallback_extension
        cache_path = (cache_dir / f"{cache_key}{cache_extension}").resolve()
        try:
            cache_path.relative_to(self.cache_root)
        except ValueError as error:
            raise RepositoryError("FMA_THUMBNAIL_CACHE_INVALID", "Thumbnail cache path is invalid.", 500) from error
        if cache_path.is_file() and 0 < cache_path.stat().st_size <= 2 * 1024 * 1024:
            return {
                "path": cache_path,
                "mimeType": "image/webp" if using_pillow else mime_type,
                "cached": True,
                "mode": "webpThumbnail" if using_pillow else "limitedOriginal",
            }

        try:
            with zipfile.ZipFile(entry["path"], "r") as archive:
                media_bytes = archive.read(info)
            with tempfile.NamedTemporaryFile(
                mode="wb",
                prefix=f"{cache_key}_{uuid.uuid4().hex}_",
                suffix=".tmp",
                dir=cache_dir,
                delete=False,
            ) as target:
                temp_path = Path(target.name)
                if using_pillow:
                    with Image.open(io.BytesIO(media_bytes)) as source:
                        if source.width * source.height > self.MAX_IMAGE_PIXELS:
                            raise RepositoryError("FMA_THUMBNAIL_PIXELS_TOO_LARGE", "Image dimensions exceed the preview limit.", 413)
                        source.load()
                        preview = ImageOps.exif_transpose(source)
                        preview.thumbnail(self.THUMBNAIL_SIZE)
                        if preview.mode not in {"RGB", "RGBA"}:
                            preview = preview.convert("RGBA" if "transparency" in preview.info else "RGB")
                        preview.save(target, format="WEBP", quality=72, method=4)
                else:
                    target.write(media_bytes)
                target.flush()
                os.fsync(target.fileno())
            os.replace(temp_path, cache_path)
        except RepositoryError:
            raise
        except (OSError, UnidentifiedImageError, DecompressionBombError, ValueError, zipfile.BadZipFile) as error:
            raise RepositoryError("FMA_THUMBNAIL_FAILED", "FMA thumbnail could not be generated.", 415) from error
        finally:
            if "temp_path" in locals() and temp_path.is_file():
                temp_path.unlink()
        return {
            "path": cache_path,
            "mimeType": "image/webp" if using_pillow else mime_type,
            "cached": False,
            "mode": "webpThumbnail" if using_pillow else "limitedOriginal",
        }
