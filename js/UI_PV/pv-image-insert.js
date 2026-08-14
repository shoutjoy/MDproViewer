(function () {
    'use strict';

    const state = {
        dataUrl: '',
        fileName: '',
        internalId: '',
        savedRange: null,
        galleryWindow: null,
        objectUrls: []
    };

    function byId(id) {
        return document.getElementById(id);
    }

    function setStatus(message, isError) {
        const el = byId('pv-image-status');
        if (!el) return;
        el.textContent = String(message || '');
        el.classList.toggle('is-error', !!isError);
    }

    function getEditor() {
        return byId('pv-content');
    }

    function rememberSelection() {
        const editor = getEditor();
        const selection = window.getSelection && window.getSelection();
        if (!editor || !selection || !selection.rangeCount) return;
        const range = selection.getRangeAt(0);
        if (editor.contains(range.commonAncestorContainer)) state.savedRange = range.cloneRange();
    }

    function restoreSelection() {
        const editor = getEditor();
        const selection = window.getSelection && window.getSelection();
        let range = state.savedRange;
        if (!editor || !selection) return null;
        if (!range || !editor.contains(range.commonAncestorContainer)) {
            range = document.createRange();
            range.selectNodeContents(editor);
            range.collapse(false);
        }
        selection.removeAllRanges();
        selection.addRange(range);
        return range;
    }

    function setPreview(dataUrl, fileName) {
        state.dataUrl = String(dataUrl || '');
        state.fileName = String(fileName || ('pv-image-' + Date.now() + '.png'));
        state.internalId = '';
        const urlInput = byId('pv-image-url');
        if (urlInput && String(urlInput.value || '').trim().startsWith('internal://')) urlInput.value = '';
        const preview = byId('pv-image-preview');
        if (preview) {
            preview.src = state.dataUrl;
            preview.hidden = !state.dataUrl;
        }
        if (state.dataUrl) setStatus('PV 창에 이미지가 준비되었습니다.', false);
    }

    function readFile(file) {
        if (!file || !String(file.type || '').startsWith('image/')) {
            setStatus('이미지 파일을 선택해 주세요.', true);
            return;
        }
        const reader = new FileReader();
        reader.onload = function () { setPreview(reader.result, file.name); };
        reader.onerror = function () { setStatus('이미지 파일을 읽지 못했습니다.', true); };
        reader.readAsDataURL(file);
    }

    function getAlt(source) {
        const name = state.fileName || String(source || '').split(/[?#]/)[0].split('/').pop() || 'image';
        return String(name).replace(/\.[^.]+$/, '').replace(/[\[\]<>]/g, '').trim() || 'image';
    }

    function notifyChanged() {
        try {
            if (window.opener && typeof window.opener.rememberPreviewPopupRenderedSelection === 'function') {
                window.opener.rememberPreviewPopupRenderedSelection();
            }
            if (window.opener && typeof window.opener.previewPopupHandleEditorInput === 'function') {
                window.opener.previewPopupHandleEditorInput(true);
            }
            if (window.opener && typeof window.opener.syncPreviewPopupImageResize === 'function') {
                window.opener.syncPreviewPopupImageResize();
            }
        } catch (_) {}
    }

    function parseInternalId(source) {
        const value = String(source || '').trim();
        if (!value.startsWith('internal://')) return '';
        try { return decodeURIComponent(value.slice('internal://'.length)); }
        catch (_) { return value.slice('internal://'.length); }
    }

    async function getInternalDisplayUrl(internalId) {
        if (!internalId) return '';
        if (state.internalId === internalId && state.dataUrl) return state.dataUrl;
        const db = await openDatabase();
        if (!db.objectStoreNames.contains('images')) throw new Error('images 저장소가 없습니다.');
        const record = await new Promise(function (resolve, reject) {
            const tx = db.transaction('images', 'readonly');
            const request = tx.objectStore('images').get(internalId);
            request.onsuccess = function () { resolve(request.result || null); };
            request.onerror = function () { reject(request.error || new Error('내부 이미지를 읽지 못했습니다.')); };
        });
        if (!record || !record.blob) throw new Error('저장된 내부 이미지를 찾지 못했습니다.');
        const objectUrl = URL.createObjectURL(record.blob);
        state.objectUrls.push(objectUrl);
        return objectUrl;
    }

    async function insertImage(outputType) {
        const editor = getEditor();
        const url = String((byId('pv-image-url') || {}).value || '').trim();
        const source = url || state.dataUrl;
        if (!editor || !source) {
            setStatus('이미지 URL을 입력하거나 이미지를 선택해 주세요.', true);
            return false;
        }
        if (editor.getAttribute('contenteditable') !== 'true') {
            setStatus('PV 렌더 편집 모드를 먼저 켜 주세요.', true);
            return false;
        }
        const internalId = parseInternalId(source);
        let displaySource = source;
        if (internalId) {
            try {
                displaySource = await getInternalDisplayUrl(internalId);
            } catch (error) {
                setStatus('내부 이미지 표시 실패: ' + (error && error.message ? error.message : error), true);
                return false;
            }
        }
        editor.focus();
        const range = restoreSelection();
        if (!range) return false;
        const image = document.createElement('img');
        image.alt = getAlt(source);
        if (internalId) image.setAttribute('data-internal-id', internalId);
        image.setAttribute('data-pv-image-output', outputType === 'html' ? 'html' : 'markdown');
        image.addEventListener('load', function () {
            try {
                if (window.opener && typeof window.opener.schedulePreviewPopupImageResize === 'function') {
                    window.opener.schedulePreviewPopupImageResize();
                }
            } catch (_) {}
        }, { once: true });
        image.src = displaySource;
        range.deleteContents();
        range.insertNode(image);
        range.setStartAfter(image);
        range.collapse(true);
        state.savedRange = range.cloneRange();
        restoreSelection();
        notifyChanged();
        try {
            if (window.opener && typeof window.opener.schedulePreviewPopupImageResize === 'function') {
                window.opener.schedulePreviewPopupImageResize();
            }
        } catch (_) {}
        pvCloseImageInsert();
        return true;
    }

    function openDatabase() {
        return new Promise(function (resolve, reject) {
            const request = indexedDB.open('MarkdownProDB');
            request.onsuccess = function () { resolve(request.result); };
            request.onerror = function () { reject(request.error || new Error('inDB를 열지 못했습니다.')); };
        });
    }

    async function saveInternal() {
        if (!state.dataUrl) {
            setStatus('먼저 이미지 파일을 선택하거나 붙여넣어 주세요.', true);
            return;
        }
        try {
            const db = await openDatabase();
            if (!db.objectStoreNames.contains('images')) throw new Error('images 저장소가 없습니다.');
            const comma = state.dataUrl.indexOf(',');
            const header = state.dataUrl.slice(0, comma);
            const mime = (header.match(/^data:([^;]+)/i) || [])[1] || 'image/png';
            const binary = atob(state.dataUrl.slice(comma + 1));
            const bytes = new Uint8Array(binary.length);
            for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
            const id = 'img_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
            await new Promise(function (resolve, reject) {
                const tx = db.transaction('images', 'readwrite');
                tx.objectStore('images').put({
                    id: id,
                    blob: new Blob([bytes], { type: mime }),
                    name: state.fileName || (id + '.png'),
                    mime: mime,
                    createdAt: Date.now()
                });
                tx.oncomplete = resolve;
                tx.onerror = function () { reject(tx.error || new Error('이미지를 저장하지 못했습니다.')); };
            });
            state.internalId = id;
            byId('pv-image-url').value = 'internal://' + encodeURIComponent(id);
            setStatus('PV에서 문서 내부 이미지로 저장했습니다.', false);
        } catch (error) {
            setStatus('문서 내부 저장 실패: ' + (error && error.message ? error.message : error), true);
        }
    }

    async function uploadImgbb() {
        if (!state.dataUrl) {
            setStatus('먼저 이미지 파일을 선택하거나 붙여넣어 주세요.', true);
            return;
        }
        const apiKey = String(localStorage.getItem('ss_imgbb_api_key') || '').trim();
        if (!apiKey) {
            setStatus('설정에서 imgBB API key를 먼저 저장해 주세요.', true);
            return;
        }
        try {
            setStatus('PV에서 imgBB로 업로드 중...', false);
            const form = new FormData();
            form.append('image', state.dataUrl.slice(state.dataUrl.indexOf(',') + 1));
            const response = await fetch('https://api.imgbb.com/1/upload?key=' + encodeURIComponent(apiKey), {
                method: 'POST',
                body: form
            });
            const payload = await response.json();
            if (!response.ok || !payload || !payload.success) throw new Error(payload && payload.error && payload.error.message || '업로드 실패');
            const url = payload.data && (payload.data.url || payload.data.display_url);
            if (!url) throw new Error('직접 이미지 URL이 없습니다.');
            byId('pv-image-url').value = url;
            setStatus('PV에서 imgBB 업로드를 완료했습니다.', false);
        } catch (error) {
            setStatus('imgBB 업로드 실패: ' + (error && error.message ? error.message : error), true);
        }
    }

    function pvOpenImageInsert() {
        const editor = getEditor();
        if (!editor) return false;
        if (editor.getAttribute('contenteditable') !== 'true') {
            try {
                if (window.opener && typeof window.opener.previewPopupToggleEditor === 'function') {
                    window.opener.previewPopupToggleEditor();
                }
            } catch (_) {}
        }
        rememberSelection();
        const modal = byId('pv-image-insert-modal');
        if (!modal) return false;
        modal.hidden = false;
        modal.setAttribute('aria-hidden', 'false');
        setStatus('이 PV 창에서 사용할 이미지를 선택하세요.', false);
        return true;
    }

    function pvCloseImageInsert() {
        const modal = byId('pv-image-insert-modal');
        if (!modal) return;
        modal.hidden = true;
        modal.setAttribute('aria-hidden', 'true');
    }

    window.pvOpenImageInsert = pvOpenImageInsert;
    window.pvCloseImageInsert = pvCloseImageInsert;
    window.pvInsertImage = insertImage;
    window.pvUploadImageToImgbb = uploadImgbb;
    window.pvSaveImageInternal = saveInternal;

    const fileInput = byId('pv-image-file');
    const uploadZone = byId('pv-image-upload-zone');
    const pasteZone = byId('pv-image-paste-zone');
    if (fileInput) fileInput.addEventListener('change', function () { readFile(fileInput.files && fileInput.files[0]); });
    if (uploadZone) {
        uploadZone.addEventListener('click', function () { if (fileInput) fileInput.click(); });
        uploadZone.addEventListener('dragover', function (event) { event.preventDefault(); uploadZone.classList.add('is-dragging'); });
        uploadZone.addEventListener('dragleave', function () { uploadZone.classList.remove('is-dragging'); });
        uploadZone.addEventListener('drop', function (event) {
            event.preventDefault();
            uploadZone.classList.remove('is-dragging');
            readFile(event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0]);
        });
    }
    if (pasteZone) pasteZone.addEventListener('click', function () { pasteZone.focus(); });
    document.addEventListener('paste', function (event) {
        const modal = byId('pv-image-insert-modal');
        if (!modal || modal.hidden) return;
        const items = Array.from(event.clipboardData && event.clipboardData.items || []);
        const imageItem = items.find(function (item) { return String(item.type || '').startsWith('image/'); });
        if (!imageItem) return;
        event.preventDefault();
        readFile(imageItem.getAsFile());
    });
    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') pvCloseImageInsert();
    });
    window.addEventListener('beforeunload', function () {
        state.objectUrls.forEach(function (url) { try { URL.revokeObjectURL(url); } catch (_) {} });
        state.objectUrls = [];
    });
})();
