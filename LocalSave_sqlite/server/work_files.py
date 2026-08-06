"""Validated binary work-file storage backed by SQLite metadata.

The browser sends the file bytes, never a filesystem path. Original bytes live
under the managed assets directory while SQLite stores searchable metadata.
"""

from __future__ import annotations

import hashlib
import base64
import binascii
import json
import os
import re
import tempfile
import time
import uuid
import zipfile
from pathlib import Path, PurePosixPath
from typing import Any, BinaryIO, Dict, List, Optional

from .database import DatabaseManager
from .repositories import RepositoryError


class WorkFileService:
    MAX_FILE_BYTES = 2 * 1024 * 1024 * 1024
    MAX_FME_BYTES = 512 * 1024 * 1024
    MAX_AI_JENA_PRESET_BYTES = 64 * 1024 * 1024
    MAX_AI_JENA_REFERENCE_BYTES = 16 * 1024 * 1024
    MAX_AI_JENA_REFERENCE_TOTAL_BYTES = 48 * 1024 * 1024
    MAX_MARKDOWN_BYTES = 8 * 1024 * 1024
    MAX_GENSLIDE_MPP_BYTES = 256 * 1024 * 1024
    MAX_GENSLIDE_PPTX_BYTES = 1024 * 1024 * 1024
    MAX_GENSLIDE_IMAGE_BYTES = 512 * 1024 * 1024
    MAX_GENSLIDE_IMAGE_ZIP_BYTES = 1024 * 1024 * 1024
    MAX_ARCHIVE_ENTRIES = 20000
    MAX_ARCHIVE_UNCOMPRESSED_BYTES = 8 * 1024 * 1024 * 1024
    SAFE_APP_RE = re.compile(r"^[a-z][a-z0-9_-]{0,63}$")
    WORK_TYPES = {
        "fma": {"extension": ".fma", "mime": "application/vnd.fma+zip"},
        "fma_webp": {"extension": ".fma", "mime": "application/vnd.fma+zip"},
        "fma_snapshot": {"extension": ".fma", "mime": "application/vnd.fma+zip"},
        "fme": {"extension": ".fme", "mime": "application/vnd.fma-edit+json"},
        "ai_jena_preset": {
            "extension": ".json",
            "mime": "application/vnd.fma-ai-jena-preset+json",
        },
        "scholar_references_md": {
            "extension": ".md",
            "mime": "text/markdown",
        },
        "crossref_markdown": {
            "extension": ".md",
            "mime": "text/markdown",
        },
        "genslide_mpp": {
            "extension": ".mpp",
            "mime": "application/vnd.genslide.mpp+json",
        },
        "genslide_pptx": {
            "extension": ".pptx",
            "mime": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        },
        "genslide_png": {
            "extension": ".png",
            "mime": "image/png",
        },
        "genslide_image_zip": {
            "extension": ".zip",
            "mime": "application/zip",
        },
    }
    AI_JENA_REFERENCE_ROLES = {"face", "clothing", "background", "pose"}
    AI_JENA_IMAGE_MIMES = {
        "image/png", "image/jpeg", "image/webp", "image/gif", "image/avif", "image/bmp"
    }

    def __init__(self, manager: DatabaseManager) -> None:
        self.manager = manager

    @property
    def assets_root(self) -> Path:
        root = (self.manager.data_root / "assets").resolve()
        root.mkdir(parents=True, exist_ok=True)
        return root

    @property
    def temp_root(self) -> Path:
        root = (self.manager.data_root / "tmp" / "workfiles").resolve()
        root.mkdir(parents=True, exist_ok=True)
        return root

    @classmethod
    def _work_type(cls, value: Any) -> str:
        normalized = str(value or "").strip().lower()
        if normalized not in cls.WORK_TYPES:
            raise RepositoryError("WORK_FILE_TYPE_INVALID", "Work file type is not supported.")
        return normalized

    @classmethod
    def _app_id(cls, value: Any) -> str:
        normalized = str(value or "").strip().lower()
        if not cls.SAFE_APP_RE.fullmatch(normalized):
            raise RepositoryError("WORK_FILE_APP_INVALID", "Work file app identifier is invalid.")
        return normalized

    @classmethod
    def _display_name(cls, value: Any, work_type: str) -> str:
        normalized = str(value or "").replace("\\", "/").split("/")[-1].strip()
        if not normalized or len(normalized) > 255 or "\x00" in normalized:
            raise RepositoryError("WORK_FILE_NAME_INVALID", "Work file name is invalid.")
        required_extension = str(cls.WORK_TYPES[work_type]["extension"])
        if Path(normalized).suffix.lower() != required_extension:
            raise RepositoryError(
                "WORK_FILE_EXTENSION_INVALID",
                f"Work file must use the {required_extension} extension.",
            )
        return normalized

    @classmethod
    def _content_length(cls, value: Any, work_type: str = "") -> int:
        try:
            size = int(str(value or ""))
        except ValueError as error:
            raise RepositoryError("INVALID_CONTENT_LENGTH", "Content-Length is invalid.") from error
        if size <= 0:
            raise RepositoryError("WORK_FILE_EMPTY", "Work file is empty.")
        if size > cls.MAX_FILE_BYTES:
            raise RepositoryError("WORK_FILE_TOO_LARGE", "Work file exceeds the 2 GB limit.", 413)
        if work_type == "ai_jena_preset" and size > cls.MAX_AI_JENA_PRESET_BYTES:
            raise RepositoryError(
                "AI_JENA_PRESET_TOO_LARGE",
                "AI Jena reference preset exceeds the 64 MB limit.",
                413,
            )
        if work_type in {"scholar_references_md", "crossref_markdown"} and size > cls.MAX_MARKDOWN_BYTES:
            raise RepositoryError(
                "MARKDOWN_WORK_FILE_TOO_LARGE",
                "Markdown work file exceeds the 8 MB limit.",
                413,
            )
        limit_by_type = {
            "genslide_mpp": (cls.MAX_GENSLIDE_MPP_BYTES, "GenSlide MPP exceeds the 256 MB limit."),
            "genslide_pptx": (cls.MAX_GENSLIDE_PPTX_BYTES, "GenSlide PPTX exceeds the 1 GB limit."),
            "genslide_png": (cls.MAX_GENSLIDE_IMAGE_BYTES, "GenSlide PNG exceeds the 512 MB limit."),
            "genslide_image_zip": (
                cls.MAX_GENSLIDE_IMAGE_ZIP_BYTES,
                "GenSlide image ZIP exceeds the 1 GB limit.",
            ),
        }
        if work_type in limit_by_type and size > limit_by_type[work_type][0]:
            raise RepositoryError("GENSLIDE_FILE_TOO_LARGE", limit_by_type[work_type][1], 413)
        return size

    @staticmethod
    def _safe_archive_path(value: str) -> str:
        normalized = str(value or "").replace("\\", "/")
        path = PurePosixPath(normalized)
        if (
            not normalized
            or normalized.startswith("/")
            or "\x00" in normalized
            or any(part in {"", ".", ".."} for part in path.parts)
            or (path.parts and ":" in path.parts[0])
        ):
            raise RepositoryError("FMA_ARCHIVE_PATH_INVALID", "FMA archive contains an unsafe path.")
        return path.as_posix()

    @staticmethod
    def _sha256_file(path: Path) -> str:
        digest = hashlib.sha256()
        with path.open("rb") as source:
            for chunk in iter(lambda: source.read(1024 * 1024), b""):
                digest.update(chunk)
        return digest.hexdigest()

    @classmethod
    def _collect_media_references(cls, value: Any, result: Optional[set[str]] = None) -> set[str]:
        references = result if result is not None else set()
        if isinstance(value, list):
            for child in value:
                cls._collect_media_references(child, references)
        elif isinstance(value, dict):
            if set(value) == {"$fmaMedia"} and isinstance(value.get("$fmaMedia"), str):
                references.add(value["$fmaMedia"])
            else:
                for child in value.values():
                    cls._collect_media_references(child, references)
        return references

    @classmethod
    def _validate_fma(cls, path: Path) -> Dict[str, Any]:
        try:
            with zipfile.ZipFile(path, "r") as archive:
                infos = archive.infolist()
                if not infos or len(infos) > cls.MAX_ARCHIVE_ENTRIES:
                    raise RepositoryError("FMA_ARCHIVE_INVALID", "FMA archive entry count is invalid.")
                names: set[str] = set()
                uncompressed_bytes = 0
                for info in infos:
                    safe_name = cls._safe_archive_path(info.filename)
                    if safe_name in names:
                        raise RepositoryError("FMA_ARCHIVE_DUPLICATE", "FMA archive contains duplicate paths.")
                    names.add(safe_name)
                    if info.flag_bits & 0x1:
                        raise RepositoryError("FMA_ARCHIVE_ENCRYPTED", "Encrypted FMA entries are not supported.")
                    uncompressed_bytes += int(info.file_size)
                    if uncompressed_bytes > cls.MAX_ARCHIVE_UNCOMPRESSED_BYTES:
                        raise RepositoryError("FMA_ARCHIVE_EXPANDED_TOO_LARGE", "FMA archive expands beyond the safety limit.")
                if "manifest.json" not in names:
                    raise RepositoryError("FMA_MANIFEST_MISSING", "FMA manifest.json is missing.")
                manifest_info = archive.getinfo("manifest.json")
                if manifest_info.file_size > 16 * 1024 * 1024:
                    raise RepositoryError("FMA_MANIFEST_TOO_LARGE", "FMA manifest is too large.")
                try:
                    manifest = json.loads(archive.read(manifest_info).decode("utf-8"))
                except (UnicodeDecodeError, json.JSONDecodeError) as error:
                    raise RepositoryError("FMA_MANIFEST_INVALID", "FMA manifest is not valid UTF-8 JSON.") from error
                if (
                    not isinstance(manifest, dict)
                    or manifest.get("format") != "fma-archive"
                    or not isinstance(manifest.get("version"), int)
                    or int(manifest["version"]) < 3
                    or not isinstance(manifest.get("images"), list)
                    or not manifest["images"]
                    or not isinstance(manifest.get("media"), dict)
                ):
                    raise RepositoryError("FMA_MANIFEST_UNSUPPORTED", "FMA manifest format or version is unsupported.")
                for media_id, record in manifest["media"].items():
                    if not isinstance(media_id, str) or not isinstance(record, dict):
                        raise RepositoryError("FMA_MEDIA_INVALID", "FMA media metadata is invalid.")
                    media_path = cls._safe_archive_path(str(record.get("path") or ""))
                    if not media_path.startswith("media/") or media_path not in names:
                        raise RepositoryError("FMA_MEDIA_MISSING", "FMA media file referenced by the manifest is missing.")
                referenced_media = cls._collect_media_references(manifest["images"])
                if not referenced_media or not referenced_media.issubset(set(manifest["media"])):
                    raise RepositoryError("FMA_MEDIA_REFERENCE_INVALID", "FMA image media references are invalid.")
                return {
                    "format": "fma-archive",
                    "version": int(manifest["version"]),
                    "imageCount": len(manifest["images"]),
                    "mediaCount": len(manifest["media"]),
                    "uncompressedBytes": uncompressed_bytes,
                }
        except zipfile.BadZipFile as error:
            raise RepositoryError("FMA_ARCHIVE_INVALID", "FMA file is not a valid ZIP archive.") from error

    @classmethod
    def _validate_fme(cls, path: Path, size_bytes: int) -> Dict[str, Any]:
        if size_bytes > cls.MAX_FME_BYTES:
            raise RepositoryError("FME_TOO_LARGE", "FME file exceeds the 512 MB validation limit.", 413)
        try:
            with path.open("r", encoding="utf-8") as source:
                project = json.load(source)
        except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
            raise RepositoryError("FME_JSON_INVALID", "FME file is not valid UTF-8 JSON.") from error
        if (
            not isinstance(project, dict)
            or project.get("format") != "FMA_EDIT_PROJECT"
            or not isinstance(project.get("version"), int)
            or int(project["version"]) < 1
            or not isinstance(project.get("source"), dict)
            or not isinstance(project["source"].get("src"), str)
            or not project["source"]["src"]
            or not isinstance(project.get("config"), dict)
        ):
            raise RepositoryError("FME_PROJECT_UNSUPPORTED", "FME project format or version is unsupported.")
        return {
            "format": "FMA_EDIT_PROJECT",
            "version": int(project["version"]),
            "sourceName": str(project["source"].get("name") or "")[:255],
        }

    @classmethod
    def _validate_ai_jena_preset(cls, path: Path, size_bytes: int) -> Dict[str, Any]:
        if size_bytes > cls.MAX_AI_JENA_PRESET_BYTES:
            raise RepositoryError(
                "AI_JENA_PRESET_TOO_LARGE",
                "AI Jena reference preset exceeds the 64 MB limit.",
                413,
            )
        try:
            with path.open("r", encoding="utf-8") as source:
                preset = json.load(source)
        except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
            raise RepositoryError(
                "AI_JENA_PRESET_JSON_INVALID",
                "AI Jena reference preset is not valid UTF-8 JSON.",
            ) from error
        if (
            not isinstance(preset, dict)
            or preset.get("format") != "FMA-AI-JENA-REFERENCES"
            or preset.get("version") != 1
            or not isinstance(preset.get("references"), dict)
        ):
            raise RepositoryError(
                "AI_JENA_PRESET_UNSUPPORTED",
                "AI Jena reference preset format or version is unsupported.",
            )
        name = str(preset.get("name") or "").strip()
        if not name or len(name) > 80:
            raise RepositoryError("AI_JENA_PRESET_NAME_INVALID", "AI Jena preset name is invalid.")
        references = preset["references"]
        if set(references) != cls.AI_JENA_REFERENCE_ROLES:
            raise RepositoryError(
                "AI_JENA_PRESET_REFERENCES_INVALID",
                "AI Jena preset must contain the four supported reference roles.",
            )
        total_bytes = 0
        reference_count = 0
        for role in sorted(cls.AI_JENA_REFERENCE_ROLES):
            reference = references.get(role)
            if reference is None:
                continue
            if not isinstance(reference, dict):
                raise RepositoryError(
                    "AI_JENA_PRESET_REFERENCE_INVALID",
                    "AI Jena reference metadata is invalid.",
                )
            reference_name = str(reference.get("name") or "").strip()
            mime_type = str(reference.get("mimeType") or "").strip().lower()
            src = reference.get("src")
            if not reference_name or len(reference_name) > 255 or mime_type not in cls.AI_JENA_IMAGE_MIMES:
                raise RepositoryError(
                    "AI_JENA_PRESET_REFERENCE_INVALID",
                    "AI Jena reference name or image type is invalid.",
                )
            if not isinstance(src, str):
                raise RepositoryError("AI_JENA_PRESET_DATA_URL_INVALID", "AI Jena reference image is invalid.")
            match = re.fullmatch(r"data:([^;,]+);base64,([A-Za-z0-9+/]*={0,2})", src)
            if not match or match.group(1).lower() != mime_type:
                raise RepositoryError(
                    "AI_JENA_PRESET_DATA_URL_INVALID",
                    "AI Jena reference image must be a matching base64 data URL.",
                )
            try:
                decoded = base64.b64decode(match.group(2), validate=True)
            except (ValueError, binascii.Error) as error:
                raise RepositoryError(
                    "AI_JENA_PRESET_DATA_URL_INVALID",
                    "AI Jena reference image base64 is invalid.",
                ) from error
            decoded_size = len(decoded)
            if decoded_size <= 0 or decoded_size > cls.MAX_AI_JENA_REFERENCE_BYTES:
                raise RepositoryError(
                    "AI_JENA_PRESET_IMAGE_TOO_LARGE",
                    "An AI Jena reference image exceeds the 16 MB limit.",
                    413,
                )
            total_bytes += decoded_size
            if total_bytes > cls.MAX_AI_JENA_REFERENCE_TOTAL_BYTES:
                raise RepositoryError(
                    "AI_JENA_PRESET_IMAGES_TOO_LARGE",
                    "AI Jena reference images exceed the 48 MB combined limit.",
                    413,
                )
            reference_count += 1
        for field in ("poseCategory", "posePreset", "selectedPose"):
            value = preset.get(field, "")
            if not isinstance(value, str) or len(value) > 500:
                raise RepositoryError("AI_JENA_PRESET_POSE_INVALID", "AI Jena pose metadata is invalid.")
        return {
            "format": "FMA-AI-JENA-REFERENCES",
            "version": 1,
            "name": name,
            "referenceCount": reference_count,
            "referenceBytes": total_bytes,
        }

    @classmethod
    def _validate_markdown(cls, path: Path, size_bytes: int, work_type: str) -> Dict[str, Any]:
        if size_bytes > cls.MAX_MARKDOWN_BYTES:
            raise RepositoryError(
                "MARKDOWN_WORK_FILE_TOO_LARGE",
                "Markdown work file exceeds the 8 MB limit.",
                413,
            )
        try:
            content = path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError) as error:
            raise RepositoryError(
                "MARKDOWN_WORK_FILE_INVALID",
                "Markdown work file is not valid UTF-8 text.",
            ) from error
        if not content.strip():
            raise RepositoryError("MARKDOWN_WORK_FILE_EMPTY", "Markdown work file is empty.")
        return {
            "format": "markdown",
            "workType": work_type,
            "characterCount": len(content),
            "lineCount": content.count("\n") + 1,
        }

    @classmethod
    def _validate_genslide_mpp(cls, path: Path, size_bytes: int) -> Dict[str, Any]:
        if size_bytes > cls.MAX_GENSLIDE_MPP_BYTES:
            raise RepositoryError("GENSLIDE_FILE_TOO_LARGE", "GenSlide MPP exceeds the 256 MB limit.", 413)
        try:
            with path.open("r", encoding="utf-8") as source:
                payload = json.load(source)
        except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
            raise RepositoryError("GENSLIDE_MPP_INVALID", "GenSlide MPP is not valid UTF-8 JSON.") from error
        allowed_root = {"format", "version", "exportedAt", "currentIndex", "slides", "images"}
        if (
            not isinstance(payload, dict)
            or set(payload) - allowed_root
            or payload.get("format") != "genslide-html2pptx-mpp"
            or payload.get("version") != 2
            or not isinstance(payload.get("slides"), list)
            or not payload["slides"]
            or len(payload["slides"]) > 10000
            or not isinstance(payload.get("images", []), list)
            or len(payload.get("images", [])) > 10000
        ):
            raise RepositoryError("GENSLIDE_MPP_UNSUPPORTED", "GenSlide MPP format or structure is unsupported.")
        for slide in payload["slides"]:
            html = slide if isinstance(slide, str) else slide.get("html") if isinstance(slide, dict) else None
            if not isinstance(html, str) or len(html) > 16 * 1024 * 1024:
                raise RepositoryError("GENSLIDE_MPP_SLIDE_INVALID", "GenSlide MPP slide content is invalid.")
            if isinstance(slide, dict) and set(slide) != {"html"}:
                raise RepositoryError("GENSLIDE_MPP_SLIDE_INVALID", "GenSlide MPP slide fields are invalid.")
        image_ids: set[str] = set()
        image_bytes = 0
        for image in payload.get("images", []):
            if not isinstance(image, dict) or set(image) - {"id", "name", "mime", "base64"}:
                raise RepositoryError("GENSLIDE_MPP_IMAGE_INVALID", "GenSlide MPP image metadata is invalid.")
            image_id = str(image.get("id") or "").strip()
            mime_type = str(image.get("mime") or "").strip().lower()
            encoded = image.get("base64")
            if (
                not image_id
                or len(image_id) > 255
                or image_id in image_ids
                or not mime_type.startswith("image/")
                or len(mime_type) > 100
                or not isinstance(encoded, str)
                or not re.fullmatch(r"[A-Za-z0-9+/]*={0,2}", encoded)
            ):
                raise RepositoryError("GENSLIDE_MPP_IMAGE_INVALID", "GenSlide MPP image metadata is invalid.")
            image_ids.add(image_id)
            image_bytes += (len(encoded.rstrip("=")) * 3) // 4
            if image_bytes > cls.MAX_GENSLIDE_MPP_BYTES:
                raise RepositoryError("GENSLIDE_MPP_IMAGE_TOO_LARGE", "GenSlide MPP embedded images are too large.", 413)
        current_index = payload.get("currentIndex", 0)
        if not isinstance(current_index, int) or current_index < 0 or current_index >= len(payload["slides"]):
            raise RepositoryError("GENSLIDE_MPP_INDEX_INVALID", "GenSlide MPP current slide index is invalid.")
        return {
            "format": "genslide-html2pptx-mpp",
            "version": 2,
            "slideCount": len(payload["slides"]),
            "imageCount": len(payload.get("images", [])),
            "embeddedImageBytes": image_bytes,
        }

    @classmethod
    def _validate_genslide_archive(cls, path: Path, work_type: str) -> Dict[str, Any]:
        try:
            with zipfile.ZipFile(path, "r") as archive:
                infos = archive.infolist()
                if not infos or len(infos) > cls.MAX_ARCHIVE_ENTRIES:
                    raise RepositoryError("GENSLIDE_ARCHIVE_INVALID", "GenSlide archive entry count is invalid.")
                names: set[str] = set()
                uncompressed_bytes = 0
                file_count = 0
                for info in infos:
                    safe_name = cls._safe_archive_path(info.filename.rstrip("/"))
                    if safe_name in names:
                        raise RepositoryError("GENSLIDE_ARCHIVE_DUPLICATE", "GenSlide archive contains duplicate paths.")
                    names.add(safe_name)
                    if info.flag_bits & 0x1:
                        raise RepositoryError("GENSLIDE_ARCHIVE_ENCRYPTED", "Encrypted GenSlide archives are not supported.")
                    uncompressed_bytes += int(info.file_size)
                    if uncompressed_bytes > cls.MAX_ARCHIVE_UNCOMPRESSED_BYTES:
                        raise RepositoryError("GENSLIDE_ARCHIVE_EXPANDED_TOO_LARGE", "GenSlide archive expands beyond the safety limit.")
                    if not info.is_dir():
                        file_count += 1
                        if work_type == "genslide_image_zip" and Path(safe_name).suffix.lower() != ".png":
                            raise RepositoryError("GENSLIDE_IMAGE_ZIP_INVALID", "GenSlide image ZIP may contain PNG files only.")
                if work_type == "genslide_pptx" and not {
                    "[Content_Types].xml", "ppt/presentation.xml"
                }.issubset(names):
                    raise RepositoryError("GENSLIDE_PPTX_INVALID", "GenSlide PPTX required OOXML parts are missing.")
                return {
                    "format": "pptx" if work_type == "genslide_pptx" else "png-zip",
                    "entryCount": len(infos),
                    "fileCount": file_count,
                    "uncompressedBytes": uncompressed_bytes,
                }
        except zipfile.BadZipFile as error:
            raise RepositoryError("GENSLIDE_ARCHIVE_INVALID", "GenSlide file is not a valid ZIP archive.") from error

    @staticmethod
    def _validate_genslide_png(path: Path) -> Dict[str, Any]:
        try:
            with path.open("rb") as source:
                header = source.read(24)
        except OSError as error:
            raise RepositoryError("GENSLIDE_PNG_INVALID", "GenSlide PNG cannot be read.") from error
        if len(header) < 24 or header[:8] != b"\x89PNG\r\n\x1a\n" or header[12:16] != b"IHDR":
            raise RepositoryError("GENSLIDE_PNG_INVALID", "GenSlide image is not a valid PNG.")
        width = int.from_bytes(header[16:20], "big")
        height = int.from_bytes(header[20:24], "big")
        if width <= 0 or height <= 0 or width > 100000 or height > 100000:
            raise RepositoryError("GENSLIDE_PNG_DIMENSIONS_INVALID", "GenSlide PNG dimensions are invalid.")
        return {"format": "png", "width": width, "height": height}

    def _validate_file(self, path: Path, work_type: str, size_bytes: int) -> Dict[str, Any]:
        if work_type == "fme":
            return self._validate_fme(path, size_bytes)
        if work_type == "ai_jena_preset":
            return self._validate_ai_jena_preset(path, size_bytes)
        if work_type in {"scholar_references_md", "crossref_markdown"}:
            return self._validate_markdown(path, size_bytes, work_type)
        if work_type == "genslide_mpp":
            return self._validate_genslide_mpp(path, size_bytes)
        if work_type in {"genslide_pptx", "genslide_image_zip"}:
            return self._validate_genslide_archive(path, work_type)
        if work_type == "genslide_png":
            return self._validate_genslide_png(path)
        return self._validate_fma(path)

    def save_upload(
        self,
        stream: BinaryIO,
        content_length: Any,
        file_name: Any,
        work_type: Any,
        app_id: Any,
    ) -> Dict[str, Any]:
        normalized_type = self._work_type(work_type)
        normalized_app = self._app_id(app_id)
        normalized_name = self._display_name(file_name, normalized_type)
        expected_size = self._content_length(content_length, normalized_type)
        digest = hashlib.sha256()
        received = 0
        temp_path: Optional[Path] = None
        try:
            with tempfile.NamedTemporaryFile(
                mode="wb", prefix="upload_", suffix=".tmp", dir=self.temp_root, delete=False
            ) as target:
                temp_path = Path(target.name)
                remaining = expected_size
                while remaining > 0:
                    chunk = stream.read(min(remaining, 1024 * 1024))
                    if not chunk:
                        break
                    target.write(chunk)
                    digest.update(chunk)
                    received += len(chunk)
                    remaining -= len(chunk)
                target.flush()
                os.fsync(target.fileno())
            if received != expected_size:
                raise RepositoryError("WORK_FILE_UPLOAD_INCOMPLETE", "Work file upload is incomplete.")

            validation = self._validate_file(temp_path, normalized_type, received)
            checksum = digest.hexdigest()
            extension = str(self.WORK_TYPES[normalized_type]["extension"])
            mime_type = str(self.WORK_TYPES[normalized_type]["mime"])
            relative_path = PurePosixPath(
                "workfiles", normalized_app, checksum[:2], f"{checksum}{extension}"
            ).as_posix()
            final_path = (self.assets_root / Path(*PurePosixPath(relative_path).parts)).resolve()
            try:
                final_path.relative_to(self.assets_root)
            except ValueError as error:
                raise RepositoryError("WORK_FILE_PATH_INVALID", "Managed work file path is invalid.", 500) from error

            now_ms = int(time.time() * 1000)
            asset_id = f"asset_{uuid.uuid4().hex}"
            entry_id = f"file_{uuid.uuid4().hex}"
            source_id = f"source_sqlite_workfiles_{normalized_app}"
            logical_path = PurePosixPath(
                normalized_app,
                str(now_ms),
                f"{entry_id[-12:]}_{normalized_name}",
            ).as_posix()
            created_asset_file = False
            with self.manager.exclusive_write():
                with self.manager.connection() as connection:
                    existing = connection.execute(
                        """
                        SELECT id, relative_path, size_bytes FROM assets
                        WHERE workspace_id = ? AND checksum_sha256 = ? AND deleted_at IS NULL
                        """,
                        (self.manager.DEFAULT_WORKSPACE_ID, checksum),
                    ).fetchone()
                if existing:
                    asset_id = str(existing["id"])
                    relative_path = str(existing["relative_path"] or "")
                    final_path = (self.assets_root / Path(*PurePosixPath(relative_path).parts)).resolve()
                    if not final_path.is_file() or final_path.stat().st_size != received:
                        raise RepositoryError(
                            "WORK_FILE_ASSET_INCONSISTENT",
                            "Existing work file metadata does not match its managed file.",
                            409,
                        )
                else:
                    final_path.parent.mkdir(parents=True, exist_ok=True)
                    if final_path.exists():
                        if (
                            final_path.stat().st_size != received
                            or self._sha256_file(final_path) != checksum
                        ):
                            raise RepositoryError("WORK_FILE_PATH_CONFLICT", "Managed work file path conflicts.", 409)
                    else:
                        os.replace(temp_path, final_path)
                        temp_path = None
                        created_asset_file = True

                try:
                    with self.manager.write_transaction() as connection:
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
                                f"{normalized_app} SQLite 작업파일",
                                f"sqlite://workfiles/{normalized_app}",
                                json.dumps({"appId": normalized_app, "kind": "workfiles"}, ensure_ascii=False),
                                now_ms,
                                now_ms,
                            ),
                        )
                        if not existing:
                            connection.execute(
                                """
                                INSERT INTO assets
                                    (id, workspace_id, asset_type, storage_type, original_name,
                                     stored_name, relative_path, mime_type, extension, size_bytes,
                                     checksum_sha256, source_provider, created_at, updated_at)
                                VALUES (?, ?, 'attachment', 'filesystem', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                                """,
                                (
                                    asset_id,
                                    self.manager.DEFAULT_WORKSPACE_ID,
                                    normalized_name,
                                    final_path.name,
                                    relative_path,
                                    mime_type,
                                    extension.lstrip("."),
                                    received,
                                    checksum,
                                    f"sqlite_workfiles:{normalized_app}",
                                    now_ms,
                                    now_ms,
                                ),
                            )
                        connection.execute(
                            """
                            INSERT INTO file_entries
                                (id, source_id, entry_type, path, name, extension, mime_type,
                                 asset_id, size_bytes, modified_at, remote_revision, checksum,
                                 base_checksum, sync_status, created_at, updated_at)
                            VALUES (?, ?, 'file', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced', ?, ?)
                            """,
                            (
                                entry_id,
                                source_id,
                                logical_path,
                                normalized_name,
                                extension.lstrip("."),
                                mime_type,
                                asset_id,
                                received,
                                now_ms,
                                normalized_type,
                                checksum,
                                checksum,
                                now_ms,
                                now_ms,
                            ),
                        )
                except Exception:
                    if created_asset_file and final_path.is_file():
                        final_path.unlink()
                    raise
            return {
                "id": entry_id,
                "assetId": asset_id,
                "appId": normalized_app,
                "workType": normalized_type,
                "name": normalized_name,
                "mimeType": mime_type,
                "sizeBytes": received,
                "checksumSha256": checksum,
                "createdAt": now_ms,
                "deduplicatedAsset": bool(existing),
                "validation": validation,
                "downloadUrl": f"/api/sqlite/workfiles/{entry_id}/download",
            }
        finally:
            if temp_path and temp_path.is_file():
                temp_path.unlink()

    def list_files(
        self,
        app_id: Any = "fmaviewer",
        query: Any = "",
        work_type: Any = None,
        limit: Any = 100,
    ) -> Dict[str, Any]:
        normalized_app = self._app_id(app_id)
        normalized_query = str(query or "").strip()
        if len(normalized_query) > 500:
            raise RepositoryError("WORK_FILE_QUERY_TOO_LONG", "Work file search query is too long.")
        normalized_type = self._work_type(work_type) if work_type else ""
        try:
            normalized_limit = max(1, min(int(limit), 500))
        except (TypeError, ValueError) as error:
            raise RepositoryError("INVALID_LIMIT", "limit must be an integer.") from error
        clauses = ["s.id = ?", "f.deleted_at IS NULL", "a.deleted_at IS NULL"]
        values: List[Any] = [f"source_sqlite_workfiles_{normalized_app}"]
        if normalized_query:
            escaped = normalized_query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            clauses.append("(f.name LIKE ? ESCAPE '\\' OR f.path LIKE ? ESCAPE '\\')")
            values.extend([f"%{escaped}%", f"%{escaped}%"])
        if normalized_type:
            clauses.append("f.remote_revision = ?")
            values.append(normalized_type)
        values.append(normalized_limit)
        with self.manager.connection() as connection:
            rows = connection.execute(
                f"""
                SELECT f.id, f.name, f.extension, f.mime_type, f.size_bytes,
                       f.remote_revision, f.checksum, f.created_at, f.updated_at,
                       f.asset_id
                FROM file_entries AS f
                JOIN workspace_sources AS s ON s.id = f.source_id
                JOIN assets AS a ON a.id = f.asset_id
                WHERE {' AND '.join(clauses)}
                ORDER BY f.created_at DESC, f.id DESC
                LIMIT ?
                """,
                values,
            ).fetchall()
        return {
            "items": [self._row_result(row, normalized_app) for row in rows],
            "query": normalized_query,
            "appId": normalized_app,
            "workType": normalized_type or None,
            "limit": normalized_limit,
        }

    @staticmethod
    def _row_result(row: Any, app_id: str) -> Dict[str, Any]:
        entry_id = str(row["id"])
        return {
            "id": entry_id,
            "assetId": str(row["asset_id"]),
            "appId": app_id,
            "workType": str(row["remote_revision"] or ""),
            "name": str(row["name"]),
            "extension": str(row["extension"] or ""),
            "mimeType": str(row["mime_type"] or "application/octet-stream"),
            "sizeBytes": int(row["size_bytes"] or 0),
            "checksumSha256": str(row["checksum"] or ""),
            "createdAt": int(row["created_at"]),
            "updatedAt": int(row["updated_at"]),
            "downloadUrl": f"/api/sqlite/workfiles/{entry_id}/download",
        }

    def resolve_download(self, entry_id: Any) -> Dict[str, Any]:
        normalized_id = str(entry_id or "").strip()
        if not re.fullmatch(r"file_[a-f0-9]{32}", normalized_id):
            raise RepositoryError("WORK_FILE_ID_INVALID", "Work file identifier is invalid.")
        with self.manager.connection() as connection:
            row = connection.execute(
                """
                SELECT f.id, f.name, f.mime_type, f.size_bytes, f.checksum,
                       a.relative_path, a.checksum_sha256
                FROM file_entries AS f
                JOIN assets AS a ON a.id = f.asset_id
                WHERE f.id = ? AND f.deleted_at IS NULL AND a.deleted_at IS NULL
                """,
                (normalized_id,),
            ).fetchone()
        if not row:
            raise RepositoryError("WORK_FILE_NOT_FOUND", "Work file was not found.", 404)
        relative_path = str(row["relative_path"] or "")
        path = (self.assets_root / Path(*PurePosixPath(relative_path).parts)).resolve()
        try:
            path.relative_to(self.assets_root)
        except ValueError as error:
            raise RepositoryError("WORK_FILE_PATH_INVALID", "Stored work file path is invalid.", 500) from error
        if not path.is_file() or path.stat().st_size != int(row["size_bytes"] or 0):
            raise RepositoryError("WORK_FILE_ASSET_MISSING", "Stored work file is missing or incomplete.", 409)
        checksum = self._sha256_file(path)
        if checksum != str(row["checksum_sha256"] or "").lower():
            raise RepositoryError("WORK_FILE_CHECKSUM_MISMATCH", "Stored work file checksum does not match.", 409)
        return {
            "path": path,
            "name": str(row["name"]),
            "mimeType": str(row["mime_type"] or "application/octet-stream"),
            "sizeBytes": path.stat().st_size,
        }
