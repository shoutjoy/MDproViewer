// Image insert/upload/gallery logic moved from js/app.js
function insertMarkdownImageAtCursor(imageUrl, altText) {
    if (!isEditMode) {
        showToast('Use this in edit mode.');
        return;
    }
    const u = String(imageUrl || '').trim();
    if (!u) {
        showToast('Enter an image URL.');
        return;
    }
    const alt = String(altText || 'image').trim().replace(/[\[\]]/g, '') || 'image';
    const md = '![' + alt + '](' + u + ')';
    const ta = editorTextarea;
    const scrollTop = ta.scrollTop;
    ta.focus();
    document.execCommand('insertText', false, md);
    currentMarkdown = ta.value;
    ta.scrollTop = scrollTop;
    performAutoSave();
    if (activeSidebarTab === 'toc') renderTOC();
    showToast('Markdown image inserted.');
}

function insertHtmlImageAtCursor(imageUrl, altText) {
    if (!isEditMode) {
        showToast('Use this in edit mode.');
        return;
    }
    const u = String(imageUrl || '').trim();
    if (!u) {
        showToast('Enter an image URL.');
        return;
    }
    const alt = String(altText || 'image')
        .trim()
        .replace(/"/g, '&quot;')
        .replace(/[<>]/g, '') || 'image';
    const html = '<img src="' + u + '" alt="' + alt + '" border="0" />';
    const ta = editorTextarea;
    const scrollTop = ta.scrollTop;
    ta.focus();
    document.execCommand('insertText', false, html);
    currentMarkdown = ta.value;
    ta.scrollTop = scrollTop;
    performAutoSave();
    if (activeSidebarTab === 'toc') renderTOC();
    showToast('HTML image tag inserted.');
}

function getImageAltTextFromUrl(imageUrl) {
    const u = String(imageUrl || '').trim();
    if (!u) return 'image';
    try {
        const path = u.split('?')[0].split('#')[0];
        const name = decodeURIComponent(path.substring(path.lastIndexOf('/') + 1) || 'image')
            .replace(/\.[^.]+$/, '')
            .trim();
        return name || 'image';
    } catch (e) {
        return 'image';
    }
}

function setImageInsertStatus(msg, isError) {
    const el = document.getElementById('img-insert-status');
    if (!el) return;
    el.textContent = String(msg || '');
    el.className = 'mt-3 text-xs ' + (isError ? 'text-red-600 dark:text-red-400' : 'text-slate-500 dark:text-slate-400');
}

function setImageUploadProgress(pct, active) {
    const wrap = document.getElementById('img-insert-progress-wrap');
    const fill = document.getElementById('img-insert-progress-fill');
    const text = document.getElementById('img-insert-progress-text');
    if (!wrap || !fill || !text) return;
    const safe = Math.max(0, Math.min(100, Number(pct) || 0));
    fill.style.width = safe + '%';
    text.textContent = safe + '%';
    if (active) wrap.classList.remove('hidden');
    else if (safe >= 100 || safe <= 0) setTimeout(function () { wrap.classList.add('hidden'); }, 700);
}

function setImageInsertPreview(dataUrl) {
    const img = document.getElementById('img-insert-preview');
    if (!img) return;
    if (!dataUrl) {
        img.classList.add('hidden');
        img.removeAttribute('src');
        return;
    }
    img.src = dataUrl;
    img.classList.remove('hidden');
}

function applyImageInsertDataUrl(dataUrl, fileName) {
    const value = String(dataUrl || '');
    if (value.indexOf('data:image') !== 0) return false;
    imageInsertCurrentDataUrl = value;
    imageInsertCurrentFileName = fileName || ('sketch_' + Date.now() + '.png');
    clearImageInsertInternalSavedState();
    imageInsertChangedByCrop = false;
    setImageInsertPreview(value);
    renderImageInsertInternalInfo();
    const input = document.getElementById('img-insert-url');
    if (input) {
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    setImageInsertStatus('Sketchpad image loaded. You can crop, upload, save internally, or insert it.', false);
    return true;
}

function revokeImageInsertGalleryObjectUrls() {
    if (!Array.isArray(imageInsertGalleryObjectUrls) || imageInsertGalleryObjectUrls.length === 0) return;
    imageInsertGalleryObjectUrls.forEach(function (u) {
        try { URL.revokeObjectURL(u); } catch (e) {}
    });
    imageInsertGalleryObjectUrls = [];
}

function setImageInsertGalleryToggleActive(active) {
    const btn = document.getElementById('img-insert-gallery-toggle');
    if (!btn) return;
    if (active) {
        btn.classList.add('ring-2', 'ring-fuchsia-300');
    } else {
        btn.classList.remove('ring-2', 'ring-fuchsia-300');
    }
}

function blobToDataUrlForImageInsert(blob) {
    return new Promise(function (resolve, reject) {
        const r = new FileReader();
        r.onload = function () { resolve(String(r.result || '')); };
        r.onerror = function () { reject(r.error || new Error('Failed to read blob')); };
        r.readAsDataURL(blob);
    });
}

async function ensureImageInsertDataUrlFromInternalSelection() {
    if (imageInsertCurrentDataUrl && imageInsertCurrentDataUrl.indexOf('data:image') === 0) return true;
    if (!db || !window.ImageDB || typeof window.ImageDB.getImage !== 'function') return false;
    const id = String(imageInsertSavedInternalId || '').trim();
    if (!id) return false;
    const rec = await window.ImageDB.getImage(db, id);
    if (!rec || !rec.blob) return false;
    const dataUrl = await blobToDataUrlForImageInsert(rec.blob);
    if (!dataUrl || dataUrl.indexOf('data:image') !== 0) return false;
    imageInsertCurrentDataUrl = dataUrl;
    imageInsertCurrentFileName = rec.name || ('gallery_' + id + '.png');
    setImageInsertPreview(dataUrl);
    return true;
}

async function getImageInsertGalleryDataUrl(id, blob) {
    const key = String(id || '').trim();
    if (!key || !blob) return '';
    if (imageInsertGalleryDataUrlCache.has(key)) return imageInsertGalleryDataUrlCache.get(key) || '';
    const dataUrl = await blobToDataUrlForImageInsert(blob);
    imageInsertGalleryDataUrlCache.set(key, dataUrl);
    return dataUrl;
}

async function syncImageInsertFullscreenGallery(items, currentId, currentDataUrl) {
    if (typeof window.viewerSSPSetFullscreenGallery !== 'function') return;
    const src = Array.isArray(items) ? items : [];
    const list = src
        .filter(function (it) { return it && it.blob && String(it.id || '').trim(); })
        .slice(0, 80);
    if (!list.length) {
        window.viewerSSPSetFullscreenGallery([], '');
        return;
    }
    const entries = [];
    for (let i = 0; i < list.length; i++) {
        const it = list[i];
        const id = String(it.id || '').trim();
        let dataUrl = '';
        if (id === currentId && currentDataUrl && currentDataUrl.indexOf('data:image') === 0) dataUrl = currentDataUrl;
        else {
            try { dataUrl = await getImageInsertGalleryDataUrl(id, it.blob); } catch (e) { dataUrl = ''; }
        }
        if (!dataUrl || dataUrl.indexOf('data:image') !== 0) continue;
        entries.push({
            id: 'idb_' + encodeURIComponent(id),
            dataURL: dataUrl,
            prompt: String(it.name || id),
            createdAt: Number(it.createdAt || Date.now())
        });
    }
    window.viewerSSPSetFullscreenGallery(entries, currentDataUrl || '');
}

function openImageInsertGalleryFullscreen(src) {
    const safeSrc = String(src || '').trim();
    if (!safeSrc) return;
    if (typeof window.viewerSSPOpenFullscreen === 'function') {
        window.viewerSSPOpenFullscreen(safeSrc);
        return;
    }
    try {
        window.open(safeSrc, '_blank', 'noopener,noreferrer');
    } catch (e) {}
}

async function loadImageInsertGallery() {
    const panel = document.getElementById('img-insert-gallery-panel');
    const list = document.getElementById('img-insert-gallery-list');
    if (!panel || !list) return;
    if (!db) {
        list.innerHTML = '<div class="text-xs text-red-500">DB not ready.</div>';
        return;
    }

    revokeImageInsertGalleryObjectUrls();
    list.innerHTML = '<div class="text-xs text-slate-500">불러오는 중...</div>';

    try {
        const items = await new Promise(function (resolve, reject) {
            const tx = db.transaction('images', 'readonly');
            const req = tx.objectStore('images').getAll();
            req.onsuccess = function () { resolve(Array.isArray(req.result) ? req.result : []); };
            req.onerror = function () { reject(req.error || new Error('Failed to load images')); };
        });

        items.sort(function (a, b) { return Number(b && b.createdAt || 0) - Number(a && a.createdAt || 0); });

        if (!items.length) {
            list.innerHTML = '<div class="text-xs text-slate-500">IndexedDB 이미지가 없습니다.</div>';
            return;
        }

        const html = [];
        items.forEach(function (it, idx) {
            const id = String(it && it.id || '').trim();
            if (!id || !it.blob) return;
            const objectUrl = URL.createObjectURL(it.blob);
            imageInsertGalleryObjectUrls.push(objectUrl);
            const title = String(it.name || id).replace(/</g, '&lt;').replace(/>/g, '&gt;');
            html.push(
                '<button type="button" class="img-gallery-item rounded border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 p-1 text-left" data-idx="' + idx + '" data-id="' + encodeURIComponent(id) + '" title="' + title + '">' +
                '<img src="' + objectUrl + '" class="w-full h-20 object-contain rounded bg-slate-100 dark:bg-slate-900">' +
                '<div class="mt-1 text-[10px] text-slate-600 dark:text-slate-300 truncate">' + title + '</div>' +
                '</button>'
            );
        });
        list.innerHTML = html.join('');

        Array.from(list.querySelectorAll('.img-gallery-item')).forEach(function (btn) {
            btn.addEventListener('click', async function () {
                const encId = String(btn.getAttribute('data-id') || '');
                const id = decodeURIComponent(encId);
                const target = items.find(function (x) { return String(x && x.id || '') === id; });
                if (!target) return;

                const internalUrl = (window.ImageDB && typeof window.ImageDB.internalUrlFromId === 'function')
                    ? window.ImageDB.internalUrlFromId(id)
                    : ('internal://' + encodeURIComponent(id));

                const input = document.getElementById('img-insert-url');
                if (input) input.value = internalUrl;
                imageInsertSavedInternalId = id;
                imageInsertSavedInternalUrl = internalUrl;
                imageInsertSavedFingerprint = '';
                renderImageInsertInternalInfo();

                try {
                    const dataUrl = await getImageInsertGalleryDataUrl(id, target.blob);
                    imageInsertCurrentDataUrl = dataUrl;
                    imageInsertCurrentFileName = target.name || ('gallery_' + id + '.png');
                    setImageInsertPreview(dataUrl);

                    if (typeof window.viewerSSPSetFullscreenGallery === 'function') {
                        window.viewerSSPSetFullscreenGallery([{
                            id: 'idb_' + encodeURIComponent(id),
                            dataURL: dataUrl,
                            prompt: String(target.name || id),
                            createdAt: Number(target.createdAt || Date.now())
                        }], dataUrl);
                    }
                    openImageInsertGalleryFullscreen(dataUrl);
                    syncImageInsertFullscreenGallery(items, id, dataUrl).catch(function () {});
                } catch (e) {
                    setImageInsertPreview('');
                }

                Array.from(list.querySelectorAll('.img-gallery-item')).forEach(function (el) {
                    el.classList.remove('ring-2', 'ring-indigo-400');
                });
                btn.classList.add('ring-2', 'ring-indigo-400');

                setImageInsertStatus('갤러리 이미지 선택됨: ' + internalUrl, false);
            });
        });
    } catch (e) {
        list.innerHTML = '<div class="text-xs text-red-500">갤러리 로드 실패</div>';
        setImageInsertStatus('IndexedDB 갤러리 로드 실패: ' + (e && e.message ? e.message : e), true);
    }
}

function refreshImageInsertGallery() {
    if (!imageInsertGalleryOpen) return;
    loadImageInsertGallery();
}

async function downloadImageInsertGalleryZip() {
    if (!db || typeof JSZip === 'undefined') {
        setImageInsertStatus('ZIP export is not available.', true);
        return;
    }
    setImageInsertStatus('Preparing gallery ZIP...', false);
    try {
        const items = await new Promise(function (resolve, reject) {
            const tx = db.transaction('images', 'readonly');
            const req = tx.objectStore('images').getAll();
            req.onsuccess = function () { resolve(Array.isArray(req.result) ? req.result : []); };
            req.onerror = function () { reject(req.error || new Error('Failed to load images')); };
        });
        if (!items.length) {
            setImageInsertStatus('No IndexedDB images to export.', true);
            return;
        }

        const zip = new JSZip();
        const used = new Set();
        let added = 0;
        items.forEach(function (it, idx) {
            if (!it || !it.blob) return;
            const id = String(it.id || ('img_' + idx));
            const rawName = String(it.name || id || ('image_' + idx)).trim();
            const extFromMime = (String(it.mime || it.blob.type || '').split('/')[1] || 'bin').replace(/[^a-zA-Z0-9]/g, '');
            const safeBase = rawName.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim() || ('image_' + idx);
            const hasExt = /\.[a-zA-Z0-9]{2,5}$/.test(safeBase);
            const baseName = hasExt ? safeBase : (safeBase + '.' + extFromMime);
            let fileName = baseName;
            let seq = 2;
            while (used.has(fileName.toLowerCase())) {
                const dot = baseName.lastIndexOf('.');
                if (dot > 0) fileName = baseName.slice(0, dot) + '_' + seq + baseName.slice(dot);
                else fileName = baseName + '_' + seq;
                seq += 1;
            }
            used.add(fileName.toLowerCase());
            zip.file('images/' + fileName, it.blob);
            added += 1;
        });
        if (!added) {
            setImageInsertStatus('No valid images found for ZIP export.', true);
            return;
        }
        zip.file('manifest.json', JSON.stringify({
            format: 'mdviewer-indexeddb-gallery',
            createdAt: new Date().toISOString(),
            count: added
        }, null, 2));

        const blob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'indexeddb_gallery_' + new Date().toISOString().slice(0, 10) + '.zip';
        a.click();
        setTimeout(function () { URL.revokeObjectURL(url); }, 400);
        setImageInsertStatus('Gallery ZIP downloaded (' + added + ' images).', false);
    } catch (e) {
        setImageInsertStatus('Failed to export gallery ZIP: ' + (e && e.message ? e.message : e), true);
    }
}

function toggleImageInsertGallery() {
    const panel = document.getElementById('img-insert-gallery-panel');
    if (!panel) return;
    imageInsertGalleryOpen = !imageInsertGalleryOpen;
    panel.classList.toggle('hidden', !imageInsertGalleryOpen);
    setImageInsertGalleryToggleActive(imageInsertGalleryOpen);
    if (imageInsertGalleryOpen) loadImageInsertGallery();
    else revokeImageInsertGalleryObjectUrls();
}
function openImageInsertModal() {
    const modal = document.getElementById('image-insert-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    if (window.toggleCaptionInsertPanel) {
        try { window.toggleCaptionInsertPanel('figure', true); } catch (e) {}
    } else if (window.prepareCaptionPanel) {
        try { window.prepareCaptionPanel('figure'); } catch (e) {}
    }
    applyImageInsertPanelLayout();
    bindImageInsertModalDrag();
    if (!imageInsertCropBound) {
        imageInsertCropBound = true;
        window.addEventListener('message', function (ev) {
            if (!ev || !ev.data || !imageInsertCropWindow || ev.source !== imageInsertCropWindow) return;
            if (ev.data.type === 'crop-ready') {
                if (!imageInsertCurrentDataUrl) return;
                try { imageInsertCropWindow.postMessage({ type: 'crop', image: imageInsertCurrentDataUrl }, '*'); } catch (e) {}
                return;
            }
            if (ev.data.type === 'aiimg-cropped' && ev.data.dataUrl) {
                imageInsertCurrentDataUrl = String(ev.data.dataUrl);
                imageInsertCurrentFileName = 'cropped_' + Date.now() + '.png';
                resetImageInsertForNewImage(true);
                setImageInsertPreview(imageInsertCurrentDataUrl);
                setImageInsertStatus('Image pasted. Click [imgBB] Upload to continue.', false);
                try { imageInsertCropWindow.postMessage({ type: 'crop-applied' }, '*'); } catch (e) {}
            }
        });
    }

    const galleryPanel = document.getElementById('img-insert-gallery-panel');
    if (galleryPanel) {
        galleryPanel.classList.toggle('hidden', !imageInsertGalleryOpen);
    }
    setImageInsertGalleryToggleActive(imageInsertGalleryOpen);
    if (imageInsertGalleryOpen) {
        loadImageInsertGallery();
    }

    setImageUploadProgress(0, false);
    renderImageInsertInternalInfo();
    setImageInsertStatus('Image pasted. Click [imgBB] Upload to continue.', false);
    if (typeof window.setInputModalImagePanelToggleState === 'function') window.setInputModalImagePanelToggleState();
}

function closeImageInsertModal() {
    const modal = document.getElementById('image-insert-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    const panel = document.getElementById('image-insert-panel');
    if (panel) {
        panel.style.left = '';
        panel.style.top = '';
        panel.style.margin = '';
    }

    const galleryPanel = document.getElementById('img-insert-gallery-panel');
    imageInsertGalleryOpen = false;
    if (galleryPanel) {
        galleryPanel.classList.add('hidden');
    }
    setImageInsertGalleryToggleActive(false);
    revokeImageInsertGalleryObjectUrls();
    imageInsertGalleryDataUrlCache.clear();

    imageInsertDragging = false;
    setImageUploadProgress(0, false);
    if (typeof window.setInputModalImagePanelToggleState === 'function') window.setInputModalImagePanelToggleState();
}

function applyImageInsertPanelLayout() {
    const modal = document.getElementById('image-insert-modal');
    const panel = document.getElementById('image-insert-panel');
    if (!modal || !panel) return;
    if (imageInsertDockRight) {
        modal.classList.remove('justify-center');
        modal.classList.add('justify-end');
        panel.classList.remove('max-w-2xl');
        panel.classList.add('max-w-xl');
        panel.style.marginRight = '12px';
    } else {
        modal.classList.remove('justify-end');
        modal.classList.add('justify-center');
        panel.classList.remove('max-w-xl');
        panel.classList.add('max-w-2xl');
        panel.style.marginRight = '';
    }
}

function toggleImageInsertDockRight() {
    imageInsertDockRight = !imageInsertDockRight;
    applyImageInsertPanelLayout();
}

function openImageInsertExternalLink(type) {
    const targetUrl = type === 'imgbb'
        ? 'https://imgbb.com/'
        : 'https://www.google.co.kr/imghp';
    try {
        const win = window.open(targetUrl, '_blank', 'noopener,noreferrer');
        if (!win) {
            setImageInsertStatus('Popup blocked. Please allow popups in your browser settings.', true);
            return;
        }
        setImageInsertStatus('Image pasted. Click [imgBB] Upload to continue.', false);
    } catch (e) {
        setImageInsertStatus('Could not open external link. Please try again.', true);
    }
}

function bindImageInsertModalDrag() {
    if (imageInsertDragBound) return;
    imageInsertDragBound = true;
    const header = document.getElementById('image-insert-header');
    const panel = document.getElementById('image-insert-panel');
    if (!header || !panel) return;

    header.addEventListener('mousedown', function (e) {
        const target = e.target;
        if (target && (target.closest('button') || target.tagName === 'BUTTON')) return;
        imageInsertDragging = true;
        const rect = panel.getBoundingClientRect();
        imageInsertDragOffsetX = e.clientX - rect.left;
        imageInsertDragOffsetY = e.clientY - rect.top;
        panel.style.position = 'fixed';
        panel.style.margin = '0';
        panel.style.left = rect.left + 'px';
        panel.style.top = rect.top + 'px';
        e.preventDefault();
    });

    document.addEventListener('mousemove', function (e) {
        if (!imageInsertDragging) return;
        const panelEl = document.getElementById('image-insert-panel');
        if (!panelEl) return;
        const nextLeft = Math.max(8, Math.min(window.innerWidth - panelEl.offsetWidth - 8, e.clientX - imageInsertDragOffsetX));
        const nextTop = Math.max(8, Math.min(window.innerHeight - panelEl.offsetHeight - 8, e.clientY - imageInsertDragOffsetY));
        panelEl.style.left = nextLeft + 'px';
        panelEl.style.top = nextTop + 'px';
    });

    document.addEventListener('mouseup', function () {
        imageInsertDragging = false;
    });
}

function focusImageInsertPasteZone() {
    setImageInsertStatus('Image pasted. Click [imgBB] Upload to continue.', false);
}

function handleImageInsertFile(event) {
    const file = event && event.target && event.target.files ? event.target.files[0] : null;
    if (!file) return;
    readImageFileForInsertModal(file);
    if (event && event.target) event.target.value = '';
}

function readImageFileForInsertModal(file) {
    if (!file || String(file.type || '').indexOf('image') !== 0) {
        setImageInsertStatus('Please select an image file.', true);
        return;
    }
    const reader = new FileReader();
    reader.onload = function () {
        imageInsertCurrentDataUrl = String(reader.result || '');
        imageInsertCurrentFileName = file.name || ('upload_' + Date.now() + '.png');
        clearImageInsertInternalSavedState();
        imageInsertChangedByCrop = false;
        setImageInsertPreview(imageInsertCurrentDataUrl);
        renderImageInsertInternalInfo();
        setImageInsertStatus('Image pasted. Click [imgBB] Upload to continue.', false);
    };
    reader.readAsDataURL(file);
}

function onImageInsertUploadDragOver(event) {
    if (!event) return;
    event.preventDefault();
    const zone = document.getElementById('img-insert-upload-zone');
    if (zone) {
        zone.classList.add('bg-indigo-50');
        zone.classList.add('dark:bg-indigo-900/30');
    }
}

function onImageInsertUploadDragLeave(event) {
    if (event) event.preventDefault();
    const zone = document.getElementById('img-insert-upload-zone');
    if (zone) {
        zone.classList.remove('bg-indigo-50');
        zone.classList.remove('dark:bg-indigo-900/30');
    }
}

function onImageInsertUploadDrop(event) {
    if (!event) return;
    event.preventDefault();
    onImageInsertUploadDragLeave(event);
    const file = event.dataTransfer && event.dataTransfer.files ? event.dataTransfer.files[0] : null;
    if (!file) {
        setImageInsertStatus('No file was dropped.', true);
        return;
    }
    readImageFileForInsertModal(file);
}

function getCropPageUrlForImageInsert() {
    try {
        return new URL('js/crop/crop.html', document.baseURI || window.location.href).href;
    } catch (e) {
        return './js/crop/crop.html';
    }
}

function cropImageInsertCurrent() {
    if (!imageInsertCurrentDataUrl) {
        setImageInsertStatus('Select or paste an image before cropping.', true);
        return;
    }
    imageInsertCropWindow = window.open(getCropPageUrlForImageInsert(), 'img_insert_crop', 'width=700,height=620,scrollbars=yes,resizable=yes');
    if (!imageInsertCropWindow) {
        setImageInsertStatus('Failed to open crop window. Please allow popups and try again.', true);
        return;
    }
    try { imageInsertCropWindow.focus(); } catch (e) {}
    try { imageInsertCropWindow.postMessage({ type: 'crop', image: imageInsertCurrentDataUrl }, '*'); } catch (e) {}
}

async function uploadImageInsertToImgbb() {
    if (!imageInsertCurrentDataUrl || imageInsertCurrentDataUrl.indexOf('data:image') !== 0) {
        try { await ensureImageInsertDataUrlFromInternalSelection(); } catch (e) {}
    }
    if (!imageInsertCurrentDataUrl || imageInsertCurrentDataUrl.indexOf('data:image') !== 0) {
        setImageInsertStatus('Select or paste an image before uploading.', true);
        return;
    }
    const apiKey = String(getImgbbApiKey() || '').trim();
    if (!apiKey) {
        setImageInsertStatus('imgBB API key is missing. Please save it in settings first.', true);
        return;
    }
    setImageInsertStatus('Uploading to imgBB...', false);
    setImageUploadProgress(0, true);
    try {
        const comma = imageInsertCurrentDataUrl.indexOf(',');
        const base64Data = comma >= 0 ? imageInsertCurrentDataUrl.slice(comma + 1) : imageInsertCurrentDataUrl;
        const form = new FormData();
        form.append('image', base64Data);
        form.append('name', 'img_insert_' + Date.now());

        const payload = await new Promise(function (resolve, reject) {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', 'https://api.imgbb.com/1/upload?key=' + encodeURIComponent(apiKey), true);
            xhr.upload.onprogress = function (ev) {
                if (!ev || !ev.lengthComputable) return;
                const pct = Math.round((ev.loaded / ev.total) * 100);
                setImageUploadProgress(pct, true);
                setImageInsertStatus('Uploading to imgBB... ' + pct + '%', false);
            };
            xhr.onload = function () {
                try {
                    const data = JSON.parse(xhr.responseText || '{}');
                    if (xhr.status >= 200 && xhr.status < 300 && data && data.success !== false) resolve(data);
                    else {
                        const msg = data && data.error && data.error.message ? data.error.message : ('imgBB upload failed (' + xhr.status + ')');
                        reject(new Error(msg));
                    }
                } catch (e) {
                    reject(e);
                }
            };
            xhr.onerror = function () { reject(new Error('Network error during imgBB upload.')); };
            xhr.send(form);
        });

        const data = payload.data || {};
        const directUrl = data.url || (data.image && data.image.url) || data.display_url || '';
        const input = document.getElementById('img-insert-url');
        if (input) input.value = directUrl || '';
        setImageUploadProgress(100, false);
        setImageInsertStatus(directUrl ? ('Upload complete: ' + directUrl) : 'Upload complete.', false);
    } catch (e) {
        setImageUploadProgress(0, false);
        setImageInsertStatus('imgBB upload failed: ' + (e && e.message ? e.message : e), true);
    }
}

async function saveImageInsertToInternalDb() {
    if (!db) {
        setImageInsertStatus('Database is not ready yet.', true);
        return;
    }
    if (!window.ImageDB || typeof window.ImageDB.saveDataUrl !== 'function') {
        setImageInsertStatus('ImageDB module is not available.', true);
        return;
    }
    if (!imageInsertCurrentDataUrl || imageInsertCurrentDataUrl.indexOf('data:image') !== 0) {
        setImageInsertStatus('Select or paste an image before saving internally.', true);
        return;
    }
    const nowFingerprint = getImageInsertFingerprint(imageInsertCurrentDataUrl);
    if (imageInsertSavedInternalUrl) {
        if (imageInsertSavedFingerprint === nowFingerprint) {
            const inputEl = document.getElementById('img-insert-url');
            if (inputEl) inputEl.value = imageInsertSavedInternalUrl;
            setImageInsertStatus('Already saved internally. Reusing the existing internal link.', false);
            renderImageInsertInternalInfo();
            return;
        }
        if (!imageInsertChangedByCrop) {
            setImageInsertStatus('An internal link already exists. Delete the saved internal image first to save a new one.', true);
            return;
        }
    }
    try {
        const saved = await window.ImageDB.saveDataUrl(db, imageInsertCurrentDataUrl, {
            name: imageInsertCurrentFileName || ('internal_' + Date.now() + '.png')
        });
        const input = document.getElementById('img-insert-url');
        if (input) input.value = saved.url;
        imageInsertSavedInternalId = saved.id;
        imageInsertSavedInternalUrl = saved.url;
        imageInsertSavedFingerprint = nowFingerprint;
        imageInsertChangedByCrop = false;
        renderImageInsertInternalInfo();
        setImageInsertStatus('Saved to internal image DB. Insert with Markdown/HTML buttons.', false);
        if (imageInsertGalleryOpen) loadImageInsertGallery();
        showToast('Image saved to internal DB.');
    } catch (e) {
        setImageInsertStatus('Failed to save image internally: ' + (e && e.message ? e.message : e), true);
    }
}

async function deleteSavedInternalImage() {
    if (!db || !imageInsertSavedInternalId) return;
    try {
        const tx = db.transaction('images', 'readwrite');
        tx.objectStore('images').delete(imageInsertSavedInternalId);
        await new Promise(function (resolve, reject) {
            tx.oncomplete = resolve;
            tx.onerror = function () { reject(tx.error || new Error('Failed to delete image.')); };
        });
        clearImageInsertInternalSavedState();
        imageInsertChangedByCrop = false;
        const input = document.getElementById('img-insert-url');
        if (input && String(input.value || '').trim().startsWith('internal://')) input.value = '';
        renderImageInsertInternalInfo();
        if (imageInsertGalleryOpen) loadImageInsertGallery();
        setImageInsertStatus('Deleted saved internal image. You can save a new internal image now.', false);
    } catch (e) {
        setImageInsertStatus('Failed to delete saved internal image: ' + (e && e.message ? e.message : e), true);
    }
}

function insertImageFromModal(type) {
    if (!isEditMode) {
        showToast('Use this in edit mode.');
        return;
    }
    const urlInput = document.getElementById('img-insert-url');
    const url = String(urlInput && urlInput.value ? urlInput.value : '').trim();
    const source = url || imageInsertCurrentDataUrl;
    if (!source) {
        setImageInsertStatus('Enter an image URL or upload an image first.', true);
        return;
    }
    const alt = getImageAltTextFromUrl(source);
    if (type === 'html') insertHtmlImageAtCursor(source, alt);
    else insertMarkdownImageAtCursor(source, alt);
    closeImageInsertModal();
}

// Global exports for inline handlers in index.html toolbar/modal.
window.insertMarkdownImageAtCursor = insertMarkdownImageAtCursor;
window.insertHtmlImageAtCursor = insertHtmlImageAtCursor;
window.openImageInsertModal = openImageInsertModal;
window.closeImageInsertModal = closeImageInsertModal;
window.toggleImageInsertDockRight = toggleImageInsertDockRight;
window.openImageInsertExternalLink = openImageInsertExternalLink;
window.focusImageInsertPasteZone = focusImageInsertPasteZone;
window.handleImageInsertFile = handleImageInsertFile;
window.onImageInsertUploadDragOver = onImageInsertUploadDragOver;
window.onImageInsertUploadDragLeave = onImageInsertUploadDragLeave;
window.onImageInsertUploadDrop = onImageInsertUploadDrop;
window.cropImageInsertCurrent = cropImageInsertCurrent;
window.uploadImageInsertToImgbb = uploadImageInsertToImgbb;
window.saveImageInsertToInternalDb = saveImageInsertToInternalDb;
window.toggleImageInsertGallery = toggleImageInsertGallery;
window.refreshImageInsertGallery = refreshImageInsertGallery;
window.downloadImageInsertGalleryZip = downloadImageInsertGalleryZip;
window.insertImageFromModal = insertImageFromModal;
window.applyImageInsertDataUrl = applyImageInsertDataUrl;
