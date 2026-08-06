"""Round-trip and safety tests for SQLite work-file storage."""

from __future__ import annotations

import hashlib
import io
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
from LocalSave_sqlite.server.repositories import RepositoryError  # noqa: E402
from LocalSave_sqlite.server.work_files import WorkFileService  # noqa: E402


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


def build_fma() -> bytes:
    target = io.BytesIO()
    manifest = {
        "format": "fma-archive",
        "version": 3,
        "timestamp": "2026-08-06T00:00:00.000Z",
        "images": [{"src": {"$fmaMedia": "media_1"}, "path": "$.images[0].src"}],
        "media": {
            "media_1": {
                "path": "media/image.webp",
                "mimeType": "image/webp",
                "size": 12,
            }
        },
    }
    with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("manifest.json", json.dumps(manifest))
        archive.writestr("media/image.webp", b"RIFFtestWEBP")
    return target.getvalue()


def build_fme() -> bytes:
    return json.dumps(
        {
            "format": "FMA_EDIT_PROJECT",
            "version": 1,
            "source": {"src": "data:image/png;base64,AA==", "name": "논문 그림.png"},
            "config": {"layers": [], "drawingDataUrl": ""},
        },
        ensure_ascii=False,
    ).encode("utf-8")


def build_ai_jena_preset() -> bytes:
    return json.dumps(
        {
            "format": "FMA-AI-JENA-REFERENCES",
            "version": 1,
            "name": "봄 패션 Try-on",
            "createdAt": "2026-08-06T00:00:00.000Z",
            "references": {
                "face": {
                    "name": "face.png",
                    "mimeType": "image/png",
                    "src": "data:image/png;base64,AA==",
                },
                "clothing": None,
                "background": None,
                "pose": None,
            },
            "poseCategory": "서있는 자세",
            "posePreset": "정면",
            "selectedPose": "정면",
        },
        ensure_ascii=False,
    ).encode("utf-8")


def build_genslide_mpp() -> bytes:
    return json.dumps(
        {
            "format": "genslide-html2pptx-mpp",
            "version": 2,
            "exportedAt": "2026-08-06T09:00:00.000Z",
            "currentIndex": 0,
            "slides": [{"html": "<section>SQLite GenSlide</section>"}],
            "images": [
                {"id": "image_1", "name": "pixel.png", "mime": "image/png", "base64": "AA=="}
            ],
        },
        ensure_ascii=False,
    ).encode("utf-8")


def build_genslide_pptx() -> bytes:
    target = io.BytesIO()
    with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", "<Types/>")
        archive.writestr("ppt/presentation.xml", "<p:presentation/>")
        archive.writestr("ppt/slides/slide1.xml", "<p:sld/>")
    return target.getvalue()


def build_genslide_png() -> bytes:
    return b"\x89PNG\r\n\x1a\n" + b"\x00\x00\x00\x0dIHDR" + (1).to_bytes(4, "big") + (1).to_bytes(4, "big")


def build_genslide_image_zip() -> bytes:
    target = io.BytesIO()
    with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("slide_001.png", build_genslide_png())
        archive.writestr("slide_002.png", build_genslide_png())
    return target.getvalue()


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="sqlite-workfiles-", dir=APP_ROOT / "LocalSave_sqlite") as temp_name:
        manager = DatabaseManager(APP_ROOT, data_root=Path(temp_name) / "data")
        manager.initialize()
        service = WorkFileService(manager)

        fma_bytes = build_fma()
        first = service.save_upload(
            io.BytesIO(fma_bytes), len(fma_bytes), "원본 프로젝트.fma", "fma", "fmaviewer"
        )
        require(first["checksumSha256"] == hashlib.sha256(fma_bytes).hexdigest(), "FMA checksum mismatch")
        require(first["validation"]["mediaCount"] == 1, "FMA validation metadata missing")
        require(first["deduplicatedAsset"] is False, "first FMA unexpectedly deduplicated")

        second = service.save_upload(
            io.BytesIO(fma_bytes), len(fma_bytes), "압축 프로젝트.fma", "fma_webp", "fmaviewer"
        )
        require(second["assetId"] == first["assetId"], "same bytes did not reuse the asset")
        require(second["id"] != first["id"], "logical save entries were not preserved")
        require(second["deduplicatedAsset"] is True, "duplicate FMA was not reported")

        fme_bytes = build_fme()
        fme = service.save_upload(
            io.BytesIO(fme_bytes), len(fme_bytes), "논문그림_편집.fme", "fme", "fmaviewer"
        )
        require(fme["validation"]["format"] == "FMA_EDIT_PROJECT", "FME validation failed")

        preset_bytes = build_ai_jena_preset()
        preset = service.save_upload(
            io.BytesIO(preset_bytes),
            len(preset_bytes),
            "봄 패션 참고 세팅.json",
            "ai_jena_preset",
            "fmaviewer",
        )
        require(preset["checksumSha256"] == hashlib.sha256(preset_bytes).hexdigest(), "preset checksum mismatch")
        require(preset["validation"]["referenceCount"] == 1, "preset reference validation failed")
        duplicate_preset = service.save_upload(
            io.BytesIO(preset_bytes),
            len(preset_bytes),
            "복사 참고 세팅.json",
            "ai_jena_preset",
            "fmaviewer",
        )
        require(duplicate_preset["assetId"] == preset["assetId"], "preset asset was not deduplicated")
        require(duplicate_preset["id"] != preset["id"], "preset logical entries were not preserved")

        references_md = "# References\n\nKim, A. (2026). SQLite research.\n".encode("utf-8")
        references = service.save_upload(
            io.BytesIO(references_md),
            len(references_md),
            "scholar_references.md",
            "scholar_references_md",
            "scholarref",
        )
        require(references["validation"]["format"] == "markdown", "reference Markdown validation failed")
        crossref_md = "# Crossref 검색 결과\n\n## 1. 논문\n".encode("utf-8")
        crossref = service.save_upload(
            io.BytesIO(crossref_md),
            len(crossref_md),
            "crossref-results.md",
            "crossref_markdown",
            "scholarsearch",
        )
        require(crossref["validation"]["lineCount"] == 4, "Crossref Markdown metadata mismatch")
        require(
            service.resolve_download(references["id"])["path"].read_bytes() == references_md,
            "reference Markdown bytes changed",
        )
        require(
            service.resolve_download(crossref["id"])["path"].read_bytes() == crossref_md,
            "Crossref Markdown bytes changed",
        )
        require(
            len(service.list_files("scholarref", work_type="scholar_references_md")["items"]) == 1,
            "reference Markdown list failed",
        )
        require(
            len(service.list_files("scholarsearch", work_type="crossref_markdown")["items"]) == 1,
            "Crossref Markdown list failed",
        )

        genslide_cases = [
            ("deck.mpp", "genslide_mpp", build_genslide_mpp()),
            ("deck.pptx", "genslide_pptx", build_genslide_pptx()),
            ("slide.png", "genslide_png", build_genslide_png()),
            ("slides.zip", "genslide_image_zip", build_genslide_image_zip()),
        ]
        genslide_items = []
        for name, work_type, content in genslide_cases:
            item = service.save_upload(io.BytesIO(content), len(content), name, work_type, "genslide")
            require(item["checksumSha256"] == hashlib.sha256(content).hexdigest(), f"{work_type} checksum mismatch")
            require(service.resolve_download(item["id"])["path"].read_bytes() == content, f"{work_type} bytes changed")
            genslide_items.append(item)
        require(
            len(service.list_files("genslide")["items"]) == 4,
            "GenSlide SQLite work-file list count mismatch",
        )
        require(genslide_items[0]["validation"]["slideCount"] == 1, "GenSlide MPP slide validation failed")
        require(genslide_items[1]["validation"]["format"] == "pptx", "GenSlide PPTX validation failed")
        require(genslide_items[2]["validation"]["width"] == 1, "GenSlide PNG validation failed")
        require(genslide_items[3]["validation"]["fileCount"] == 2, "GenSlide image ZIP validation failed")

        all_files = service.list_files("fmaviewer")
        require(len(all_files["items"]) == 5, "work file list count mismatch")
        search = service.list_files("fmaviewer", query="논문그림", work_type="fme")
        require(len(search["items"]) == 1 and search["items"][0]["id"] == fme["id"], "search failed")
        preset_search = service.list_files("fmaviewer", query="봄 패션", work_type="ai_jena_preset")
        require(
            len(preset_search["items"]) == 1 and preset_search["items"][0]["id"] == preset["id"],
            "AI Jena preset search failed",
        )

        download = service.resolve_download(first["id"])
        require(download["path"].read_bytes() == fma_bytes, "download bytes changed")
        preset_download = service.resolve_download(preset["id"])
        require(preset_download["path"].read_bytes() == preset_bytes, "preset download bytes changed")

        with manager.connection() as connection:
            asset_count = int(connection.execute("SELECT COUNT(*) FROM assets").fetchone()[0])
            entry_count = int(connection.execute("SELECT COUNT(*) FROM file_entries").fetchone()[0])
        require(asset_count == 9 and entry_count == 11, "asset deduplication counts mismatch")

        package = BackupPackageService(manager).create_package()
        require(package["validation"]["assetCount"] == 9, "work files were not included in backup")

        bad_manifest = io.BytesIO()
        with zipfile.ZipFile(bad_manifest, "w") as archive:
            archive.writestr("manifest.json", '{"format":"wrong","version":3}')
        invalid_fma = bad_manifest.getvalue()
        expect_error(
            "FMA_MANIFEST_UNSUPPORTED",
            lambda: service.save_upload(
                io.BytesIO(invalid_fma), len(invalid_fma), "bad.fma", "fma", "fmaviewer"
            ),
        )
        invalid_fme = b'{"format":"wrong"}'
        expect_error(
            "FME_PROJECT_UNSUPPORTED",
            lambda: service.save_upload(
                io.BytesIO(invalid_fme), len(invalid_fme), "bad.fme", "fme", "fmaviewer"
            ),
        )
        expect_error(
            "WORK_FILE_EXTENSION_INVALID",
            lambda: service.save_upload(io.BytesIO(fme_bytes), len(fme_bytes), "bad.txt", "fme", "fmaviewer"),
        )
        invalid_preset = preset_bytes.replace(b"data:image/png;base64,AA==", b"https://example.invalid/image.png")
        expect_error(
            "AI_JENA_PRESET_DATA_URL_INVALID",
            lambda: service.save_upload(
                io.BytesIO(invalid_preset),
                len(invalid_preset),
                "invalid-reference.json",
                "ai_jena_preset",
                "fmaviewer",
            ),
        )
        wrong_format_preset = preset_bytes.replace(b"FMA-AI-JENA-REFERENCES", b"WRONG-FORMAT")
        expect_error(
            "AI_JENA_PRESET_UNSUPPORTED",
            lambda: service.save_upload(
                io.BytesIO(wrong_format_preset),
                len(wrong_format_preset),
                "wrong-format.json",
                "ai_jena_preset",
                "fmaviewer",
            ),
        )
        expect_error(
            "AI_JENA_PRESET_TOO_LARGE",
            lambda: service.save_upload(
                io.BytesIO(b"{}"),
                WorkFileService.MAX_AI_JENA_PRESET_BYTES + 1,
                "too-large.json",
                "ai_jena_preset",
                "fmaviewer",
            ),
        )
        invalid_utf8 = b"\xff\xfe\xfd"
        expect_error(
            "MARKDOWN_WORK_FILE_INVALID",
            lambda: service.save_upload(
                io.BytesIO(invalid_utf8),
                len(invalid_utf8),
                "invalid.md",
                "crossref_markdown",
                "scholarsearch",
            ),
        )
        expect_error(
            "MARKDOWN_WORK_FILE_TOO_LARGE",
            lambda: service.save_upload(
                io.BytesIO(b"# x"),
                WorkFileService.MAX_MARKDOWN_BYTES + 1,
                "too-large.md",
                "scholar_references_md",
                "scholarref",
            ),
        )
        invalid_mpp = b'{"format":"wrong","version":2,"currentIndex":0,"slides":[{"html":"x"}],"images":[]}'
        expect_error(
            "GENSLIDE_MPP_UNSUPPORTED",
            lambda: service.save_upload(
                io.BytesIO(invalid_mpp), len(invalid_mpp), "invalid.mpp", "genslide_mpp", "genslide"
            ),
        )
        invalid_pptx = io.BytesIO()
        with zipfile.ZipFile(invalid_pptx, "w") as archive:
            archive.writestr("not-pptx.txt", "invalid")
        invalid_pptx_bytes = invalid_pptx.getvalue()
        expect_error(
            "GENSLIDE_PPTX_INVALID",
            lambda: service.save_upload(
                io.BytesIO(invalid_pptx_bytes),
                len(invalid_pptx_bytes),
                "invalid.pptx",
                "genslide_pptx",
                "genslide",
            ),
        )
        expect_error(
            "GENSLIDE_PNG_INVALID",
            lambda: service.save_upload(
                io.BytesIO(b"not png"), 7, "invalid.png", "genslide_png", "genslide"
            ),
        )
        bad_image_zip = io.BytesIO()
        with zipfile.ZipFile(bad_image_zip, "w") as archive:
            archive.writestr("slide.svg", "<svg/>")
        bad_image_zip_bytes = bad_image_zip.getvalue()
        expect_error(
            "GENSLIDE_IMAGE_ZIP_INVALID",
            lambda: service.save_upload(
                io.BytesIO(bad_image_zip_bytes),
                len(bad_image_zip_bytes),
                "invalid.zip",
                "genslide_image_zip",
                "genslide",
            ),
        )

    print("SQLite work-file round-trip/safety tests passed")


if __name__ == "__main__":
    main()
