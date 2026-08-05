/* MD Viewer iframe compatibility bridge. */
(function initializeMdViewerBridge(global) {
    "use strict";

    const params = new URLSearchParams(global.location.search);
    const embedded = params.get("embedded") === "1" || global.parent !== global;
    if (!embedded) return;

    function fileName(value, fallback = "image") {
        return String(value || "").trim().split(/[\\/]/).pop() || fallback;
    }

    function mediaTypeFor(item) {
        const probe = `${item?.mimeType || ""} ${item?.name || ""} ${item?.path || ""}`;
        return /video\/|\.(?:mp4|webm|mov|m4v|ogv)(?:\s|$)/i.test(probe) ? "video" : "image";
    }

    function selectImage(selectedName, selectedPath) {
        if (!Array.isArray(global.images) || !global.images.length) return;
        const wantedName = fileName(selectedName || selectedPath, "").toLowerCase();
        const wantedPath = String(selectedPath || "").toLowerCase();
        let index = global.images.findIndex(item => {
            const path = String(item?.path || "").toLowerCase();
            return (wantedPath && path === wantedPath) ||
                (wantedName && fileName(path, "").toLowerCase() === wantedName);
        });
        if (index < 0) index = 0;
        global.currentIndex = index;
        if (typeof global.renderGallery === "function") global.renderGallery();
        if (typeof global.renderFavorites === "function") global.renderFavorites();
        if (typeof global.showImage === "function") global.showImage(index);
        if (global.dom?.imageCount) global.dom.imageCount.innerText = "Media: " + global.images.length;
    }

    async function openFiles(files, selectedName, importMode) {
        const list = Array.from(files || []).filter(Boolean);
        if (!list.length) return;
        const fma = list.find(item => /\.(?:fma|json)$/i.test(String(item.name || "")));
        if (fma && typeof global.loadFMA === "function") {
            await global.loadFMA(fma);
            return;
        }
        const append = importMode === "append";
        if (!append) {
            global.images = [];
            if (typeof global.releaseFmaArchiveObjectUrls === "function") global.releaseFmaArchiveObjectUrls();
        }
        if (typeof global.handleImportFiles === "function") await global.handleImportFiles(list);
        else if (typeof global.handleAddImages === "function") await global.handleAddImages(list);
        selectImage(selectedName, "");
    }

    function openRecords(records, selectedPath) {
        const rows = Array.isArray(records) ? records : [];
        global.images = rows.filter(item => item?.src).map((item, index) => ({
            src: String(item.src),
            path: String(item.path || item.filePath || item.name || `image_${index + 1}`),
            group: String(item.group || item.folder || "folder"),
            date: Number(item.date || item.mtimeMs || Date.now()),
            createdAt: Number(item.createdAt || item.mtimeMs || Date.now()),
            modifiedAt: Number(item.modifiedAt || item.mtimeMs || Date.now()),
            size: Number(item.size || 0),
            mimeType: String(item.mimeType || ""),
            mediaType: mediaTypeFor(item),
            isFav: Boolean(item.isFav),
            metadata: item.metadata || {}
        }));
        selectImage("", selectedPath);
        persistImages();
    }

    function persistImages() {
        if (typeof global.saveCurrentImagesToDB !== "function") return;
        Promise.resolve(global.saveCurrentImagesToDB(true)).catch(error => {
            console.warn("MD Viewer 이미지 저장 실패:", error);
        });
    }

    function applyEditedImage(dataUrl, name, addNew) {
        const src = String(dataUrl || "");
        if (!/^data:(?:image|video)\//i.test(src)) return;
        const now = Date.now();
        const item = {
            src,
            path: fileName(name, `edited_${now}.png`),
            group: "edited",
            date: now,
            createdAt: now,
            modifiedAt: now,
            size: src.length,
            mimeType: src.match(/^data:([^;,]+)/i)?.[1] || "image/png",
            mediaType: src.startsWith("data:video/") ? "video" : "image",
            isFav: false
        };
        if (!addNew && global.images[global.currentIndex]) {
            global.images[global.currentIndex] = { ...global.images[global.currentIndex], ...item };
        } else {
            item.sourcePath = String(global.images[global.currentIndex]?.path || "");
            global.images.push(item);
            global.currentIndex = global.images.length - 1;
        }
        selectImage(item.path, item.path);
        persistImages();
    }

    function currentImagePayload(requestedIndex) {
        const requested = Number(requestedIndex);
        const index = Number.isInteger(requested) && requested >= 0 && requested < (global.images?.length || 0)
            ? requested : global.currentIndex;
        const item = global.images?.[index];
        if (!item) return null;
        return {
            index,
            src: String(item.src || ""),
            path: String(item.path || ""),
            name: fileName(item.path, `image_${index + 1}.png`),
            size: Number(item.size || 0)
        };
    }

    function sendAction(type, requestedIndex) {
        const image = currentImagePayload(requestedIndex);
        if (!image || global.parent === global) return false;
        global.parent.postMessage({ type, image }, "*");
        return true;
    }

    function getImageCount() {
        return Array.isArray(global.images) ? global.images.length : 0;
    }

    async function handleMessage(event) {
        if (event.source !== global.parent) return;
        const data = event.data;
        if (!data || typeof data !== "object") return;
        try {
            if (data.type === "fmaviewer-get-image-count") {
                global.parent.postMessage({
                    type: "fmaviewer-image-count",
                    requestId: String(data.requestId || ""),
                    imageCount: getImageCount()
                }, "*");
            }
            else if (data.type === "fmaviewer-open-files") {
                await openFiles(data.files, data.selectedName || "", data.importMode || "replace");
            }
            else if (data.type === "fmaviewer-open-records") openRecords(data.records, data.selectedPath || "");
            else if (data.type === "fmaviewer-apply-image") applyEditedImage(data.dataUrl, data.name, false);
            else if (data.type === "fmaviewer-add-image") applyEditedImage(data.dataUrl, data.name, true);
        } catch (error) {
            console.error("MD Viewer 연동 처리 실패:", error);
        }
    }

    function announceReady() {
        global.parent.postMessage({ type: "fmaviewer-ready" }, "*");
    }

    global.FMAMdViewerBridge = Object.freeze({ sendAction, currentImagePayload, getImageCount });
    global.addEventListener("message", handleMessage);
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", announceReady, { once: true });
    else announceReady();
})(window);
