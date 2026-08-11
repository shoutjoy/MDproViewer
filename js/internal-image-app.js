(function (global) {
    'use strict';

    const state = {
        shell: null,
        panel: null,
        frame: null,
        previewFrame: null,
        title: null,
        toolLayer: null,
        toolFrame: null,
        toolTitle: null,
        pendingOpen: null,
        pendingTool: null,
        objectUrls: [],
        maximized: false,
        restoreStyle: '',
        dragBound: false,
        viewerReady: false,
        activeKind: '',
        layout: '',
        preDockStyle: '',
        imageCountRequestSequence: 0,
        imageCountWaiters: new Map()
    };

    function bridge() {
        return global.web2electron || null;
    }

    function showStatus(message, isError) {
        const shell = ensureShell();
        const status = shell.querySelector('#internal-image-app-status');
        status.textContent = String(message || '');
        status.style.background = isError ? 'rgba(127,29,29,.96)' : 'rgba(30,41,59,.96)';
        status.style.display = 'block';
        global.clearTimeout(status._hideTimer);
        status._hideTimer = global.setTimeout(function () {
            status.style.display = 'none';
        }, isError ? 5000 : 2600);
    }

    function ensureShell() {
        if (state.shell && state.shell.isConnected) return state.shell;
        const shell = document.createElement('div');
        shell.id = 'internal-image-app-shell';
        shell.style.cssText = 'position:fixed;inset:0;z-index:14000;display:none;align-items:center;justify-content:center;padding:18px;background:rgba(2,6,23,.58);backdrop-filter:blur(2px);';
        shell.innerHTML = [
            '<section id="internal-image-app-panel" role="dialog" aria-modal="true" aria-label="이미지 앱"',
            ' style="position:relative;width:min(1380px,96vw);height:min(900px,92vh);min-width:520px;min-height:360px;resize:both;overflow:hidden;border:1px solid #475569;border-radius:12px;background:#0f172a;box-shadow:0 28px 80px rgba(0,0,0,.58);display:flex;flex-direction:column;">',
            '<header id="internal-image-app-header" style="height:42px;flex:0 0 42px;display:flex;align-items:center;gap:8px;padding:0 10px;background:#111827;border-bottom:1px solid #334155;color:#e5e7eb;cursor:move;user-select:none;">',
            '<span style="color:#f472b6;font-size:16px">▣</span>',
            '<strong id="internal-image-app-title" style="min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;">이미지 보기</strong>',
            '<button type="button" data-action="maximize" title="최대화/복원" style="width:32px;height:28px;border:1px solid #475569;border-radius:6px;background:#1e293b;color:#e5e7eb;cursor:pointer;">□</button>',
            '<button type="button" data-action="close" title="닫기" style="width:32px;height:28px;border:1px solid #7f1d1d;border-radius:6px;background:#450a0a;color:#fecaca;cursor:pointer;">×</button>',
            '</header>',
            '<iframe id="internal-image-app-frame" title="FMA 이미지 뷰어" style="width:100%;height:100%;flex:1;border:0;background:#0b0d12;"></iframe>',
            '<iframe id="internal-image-preview-frame" title="파일 미리보기" style="display:none;width:100%;height:100%;flex:1;border:0;background:#0b0d12;"></iframe>',
            '<div id="internal-image-tool-layer" style="position:absolute;inset:42px 0 0;z-index:4;display:none;align-items:center;justify-content:center;padding:16px;background:rgba(2,6,23,.72);">',
            '<section style="width:min(1120px,96%);height:min(780px,96%);display:flex;flex-direction:column;overflow:hidden;border:1px solid #64748b;border-radius:10px;background:#111827;box-shadow:0 20px 60px rgba(0,0,0,.65);">',
            '<header style="height:38px;flex:0 0 38px;display:flex;align-items:center;padding:0 9px;border-bottom:1px solid #334155;color:#e2e8f0;">',
            '<strong id="internal-image-tool-title" style="flex:1;font-size:12px;">이미지 도구</strong>',
            '<button type="button" data-action="close-tool" style="width:30px;height:26px;border:1px solid #7f1d1d;border-radius:5px;background:#450a0a;color:#fecaca;cursor:pointer;">×</button>',
            '</header>',
            '<iframe id="internal-image-tool-frame" title="이미지 도구" style="width:100%;height:100%;flex:1;border:0;background:#111827;"></iframe>',
            '</section></div>',
            '<div id="internal-image-app-status" style="display:none;position:absolute;right:14px;bottom:14px;z-index:7;max-width:min(520px,80%);padding:9px 12px;border:1px solid #64748b;border-radius:8px;color:#f8fafc;font-size:12px;box-shadow:0 8px 28px rgba(0,0,0,.4);"></div>',
            '</section>'
        ].join('');
        document.body.appendChild(shell);
        state.shell = shell;
        state.panel = shell.querySelector('#internal-image-app-panel');
        state.frame = shell.querySelector('#internal-image-app-frame');
        state.previewFrame = shell.querySelector('#internal-image-preview-frame');
        state.title = shell.querySelector('#internal-image-app-title');
        state.toolLayer = shell.querySelector('#internal-image-tool-layer');
        state.toolFrame = shell.querySelector('#internal-image-tool-frame');
        state.toolTitle = shell.querySelector('#internal-image-tool-title');

        shell.querySelector('[data-action="close"]').addEventListener('click', close);
        shell.querySelector('[data-action="maximize"]').addEventListener('click', toggleMaximize);
        shell.querySelector('[data-action="close-tool"]').addEventListener('click', closeTool);
        shell.addEventListener('mousedown', function (event) {
            if (event.target === shell) close();
        });
        bindPanelDrag(shell.querySelector('#internal-image-app-header'));
        global.addEventListener('message', handleMessage);
        document.addEventListener('keydown', function (event) {
            if (event.key !== 'Escape' || state.shell.style.display === 'none') return;
            if (state.toolLayer.style.display !== 'none') closeTool();
            else close();
        });
        return shell;
    }

    function bindPanelDrag(handle) {
        if (!handle || state.dragBound) return;
        state.dragBound = true;
        handle.addEventListener('pointerdown', function (event) {
            if (event.target.closest('button') || state.maximized) return;
            const rect = state.panel.getBoundingClientRect();
            const offsetX = event.clientX - rect.left;
            const offsetY = event.clientY - rect.top;
            state.panel.style.position = 'fixed';
            state.panel.style.left = rect.left + 'px';
            state.panel.style.top = rect.top + 'px';
            state.panel.style.margin = '0';
            handle.setPointerCapture(event.pointerId);
            const move = function (moveEvent) {
                const maxLeft = Math.max(0, global.innerWidth - state.panel.offsetWidth);
                const maxTop = Math.max(0, global.innerHeight - state.panel.offsetHeight);
                state.panel.style.left = Math.max(0, Math.min(maxLeft, moveEvent.clientX - offsetX)) + 'px';
                state.panel.style.top = Math.max(0, Math.min(maxTop, moveEvent.clientY - offsetY)) + 'px';
            };
            const end = function () {
                handle.removeEventListener('pointermove', move);
                handle.removeEventListener('pointerup', end);
                handle.removeEventListener('pointercancel', end);
            };
            handle.addEventListener('pointermove', move);
            handle.addEventListener('pointerup', end);
            handle.addEventListener('pointercancel', end);
            event.preventDefault();
        });
    }

    function toggleMaximize() {
        ensureShell();
        if (!state.maximized) {
            state.restoreStyle = state.panel.getAttribute('style') || '';
            state.panel.style.position = 'fixed';
            state.panel.style.inset = '6px';
            state.panel.style.left = '6px';
            state.panel.style.top = '6px';
            state.panel.style.width = 'calc(100vw - 12px)';
            state.panel.style.height = 'calc(100vh - 12px)';
            state.panel.style.maxWidth = 'none';
            state.panel.style.maxHeight = 'none';
            state.panel.style.resize = 'none';
        } else {
            state.panel.setAttribute('style', state.restoreStyle);
        }
        state.maximized = !state.maximized;
    }

    function viewerUrl(title) {
        const url = new URL('./Apps/fmaviewer/index.html', document.baseURI || global.location.href);
        url.searchParams.set('embedded', '1');
        url.searchParams.set('v', '20260806-import-choice-2');
        if (title) url.searchParams.set('title', title);
        return url.href;
    }

    function applyPanelLayout(options) {
        ensureShell();
        const opts = options || {};
        if (opts.layout === 'settings-left') {
            if (state.layout !== 'settings-left') state.preDockStyle = state.panel.getAttribute('style') || '';
            state.layout = 'settings-left';
            state.maximized = false;
            const leftOffset = Math.max(0, Number(opts.leftOffset) || 0);
            state.panel.style.position = 'fixed';
            state.panel.style.inset = 'auto';
            state.panel.style.left = leftOffset + 'px';
            state.panel.style.top = '10px';
            state.panel.style.right = '10px';
            state.panel.style.margin = '0';
            state.panel.style.width = 'calc(100vw - ' + (leftOffset + 10) + 'px)';
            state.panel.style.height = 'calc(100vh - 20px)';
            state.panel.style.maxWidth = 'none';
            state.panel.style.maxHeight = 'none';
            state.panel.style.minWidth = '0';
            state.panel.style.minHeight = '360px';
            state.panel.style.resize = 'horizontal';
            return;
        }
        if (state.layout === 'settings-left') {
            state.panel.setAttribute('style', state.preDockStyle);
            state.layout = '';
            state.preDockStyle = '';
        }
    }

    function show(title, options) {
        ensureShell();
        applyPanelLayout(options);
        state.title.textContent = title ? title + ' · 이미지 앱' : '이미지 앱';
        state.shell.style.display = 'flex';
    }

    function postToViewer(payload) {
        if (!state.frame || !state.frame.contentWindow) return;
        state.frame.contentWindow.postMessage(payload, '*');
    }

    function isFmaViewerUrl(url) {
        try {
            const parsed = new URL(String(url || ''), document.baseURI || global.location.href);
            return /\/Apps\/fmaviewer\/index\.html$/i.test(parsed.pathname);
        } catch (_) {
            return false;
        }
    }

    function showViewerFrame(title) {
        ensureShell();
        closePreviewFrame();
        state.activeKind = 'viewer';
        state.frame.style.display = 'block';
        state.previewFrame.style.display = 'none';
        loadViewerFrame(title);
    }

    function showPreviewFrame(url) {
        ensureShell();
        state.activeKind = 'preview';
        state.frame.style.display = 'none';
        state.previewFrame.style.display = 'block';
        state.previewFrame.src = url;
    }

    function closePreviewFrame() {
        if (!state.previewFrame) return;
        state.previewFrame.style.display = 'none';
        state.previewFrame.removeAttribute('src');
        global.setTimeout(releaseObjectUrls, 0);
    }

    async function sendPendingOpen() {
        const pending = state.pendingOpen;
        if (!pending) return;
        if (pending.files) {
            postToViewer({
                type: 'fmaviewer-open-files',
                files: pending.files,
                selectedName: pending.selectedName || '',
                importMode: pending.importMode || 'replace'
            });
            if (state.pendingOpen === pending) state.pendingOpen = null;
            return;
        }
        if (pending.path && bridge() && typeof bridge().getImageFolder === 'function') {
            const result = await bridge().getImageFolder({ filePath: pending.path });
            if (!result || result.error) throw new Error(result && result.error ? result.error : '이미지 폴더를 읽지 못했습니다.');
            postToViewer({
                type: 'fmaviewer-open-records',
                records: result.images || [],
                selectedPath: result.selectedPath || pending.path
            });
            if (state.pendingOpen === pending) state.pendingOpen = null;
        }
    }

    function openPath(filePath, title) {
        const path = String(filePath || '');
        if (!path) return;
        releaseObjectUrls();
        state.pendingOpen = { path: path, selectedName: title || '' };
        show(title || path.split(/[\\/]/).pop() || '이미지');
        showViewerFrame(title || path.split(/[\\/]/).pop() || '');
        if (state.viewerReady) sendPendingOpen().catch(function (error) {
            showStatus(error && error.message ? error.message : error, true);
        });
    }

    function openFiles(files, selectedName, options) {
        const list = Array.from(files || []);
        if (!list.length) return;
        const opts = options || {};
        releaseObjectUrls();
        state.pendingOpen = {
            files: list,
            selectedName: selectedName || list[0].name || '',
            importMode: opts.importMode === 'append' ? 'append' : 'replace'
        };
        show(selectedName || list[0].name || '이미지', opts);
        showViewerFrame(selectedName || list[0].name || '');
        if (state.viewerReady) sendPendingOpen().catch(function (error) {
            showStatus(error && error.message ? error.message : error, true);
        });
    }

    function getViewerImageCount() {
        if (!state.viewerReady || !state.frame || !state.frame.contentWindow) return 0;
        try {
            const viewerBridge = state.frame.contentWindow.FMAMdViewerBridge;
            if (viewerBridge && typeof viewerBridge.getImageCount === 'function') {
                return Number(viewerBridge.getImageCount()) || 0;
            }
        } catch (_) {}
        return null;
    }

    function requestViewerImageCount() {
        const directCount = getViewerImageCount();
        if (directCount !== null) return Promise.resolve(directCount);
        if (!state.viewerReady || !state.frame || !state.frame.contentWindow) return Promise.resolve(0);
        const requestId = 'fma-count-' + Date.now() + '-' + (++state.imageCountRequestSequence);
        return new Promise(function (resolve) {
            const timer = global.setTimeout(function () {
                state.imageCountWaiters.delete(requestId);
                resolve(0);
            }, 1500);
            state.imageCountWaiters.set(requestId, {
                resolve: resolve,
                timer: timer
            });
            postToViewer({
                type: 'fmaviewer-get-image-count',
                requestId: requestId
            });
        });
    }

    function resolveViewerImageCount(data) {
        const requestId = String(data && data.requestId || '');
        const waiter = state.imageCountWaiters.get(requestId);
        if (!waiter) return false;
        state.imageCountWaiters.delete(requestId);
        global.clearTimeout(waiter.timer);
        waiter.resolve(Math.max(0, Number(data.imageCount) || 0));
        return true;
    }

    function cancelViewerImageCountRequests() {
        state.imageCountWaiters.forEach(function (waiter) {
            global.clearTimeout(waiter.timer);
            waiter.resolve(0);
        });
        state.imageCountWaiters.clear();
    }

    function showViewerImportChoice(existingCount, incomingCount) {
        const add = global.confirm(
            'FMA Viewer에 기존 이미지 ' + existingCount + '개가 있습니다.\n\n' +
            '새 이미지 ' + incomingCount + '개를 추가할까요?\n\n' +
            '[확인] 이미지 추가  ·  [취소] 초기화 선택으로 이동'
        );
        if (add) return 'append';
        const replace = global.confirm(
            '기존 이미지를 초기화하고 새로 넣을까요?\n\n' +
            '[확인] 초기화하고 새로 넣기  ·  [취소] 작업 취소'
        );
        return replace ? 'replace' : 'cancel';
    }

    async function getViewerImportMode(incomingCount) {
        const existingCount = await requestViewerImageCount();
        if (existingCount <= 0) return 'replace';
        return showViewerImportChoice(existingCount, incomingCount);
    }

    function resetViewerReadyState() {
        state.viewerReady = false;
        cancelViewerImageCountRequests();
    }

    function loadViewerFrame(title) {
        if (!state.frame.getAttribute('src')) {
            resetViewerReadyState();
            state.frame.src = viewerUrl(title || '');
        }
    }

    async function openFilesWithChoice(files, selectedName) {
        const list = Array.from(files || []);
        if (!list.length) return false;
        const importMode = await getViewerImportMode(list.length);
        if (importMode === 'cancel') return false;
        openFiles(list, selectedName, { importMode: importMode });
        return true;
    }

    function releaseObjectUrls() {
        const urls = state.objectUrls.splice(0);
        urls.forEach(function (url) {
            try { URL.revokeObjectURL(url); } catch (_) {}
        });
    }

    function openFrame(url, title, options) {
        const targetUrl = String(url || '');
        if (!targetUrl) return;
        releaseObjectUrls();
        const opts = options || {};
        state.objectUrls = Array.isArray(opts.objectUrls) ? opts.objectUrls.slice() : [];
        state.pendingOpen = null;
        show(title || '파일 보기', opts);
        if (isFmaViewerUrl(targetUrl)) showViewerFrame(title || 'FMA Viewer');
        else showPreviewFrame(targetUrl);
    }

    function closeTool() {
        if (!state.toolLayer) return;
        state.toolLayer.style.display = 'none';
        state.toolFrame.removeAttribute('src');
        state.pendingTool = null;
    }

    function close() {
        if (!state.shell) return;
        closeTool();
        state.shell.style.display = 'none';
        if (state.activeKind === 'preview') {
            closePreviewFrame();
            state.activeKind = '';
        }
    }

    async function imageToDataUrl(image) {
        const src = String(image && image.src || '');
        if (/^data:image\//i.test(src)) return src;
        const filePath = String(image && image.path || '');
        if (filePath && bridge() && typeof bridge().readImageDataUrl === 'function') {
            const result = await bridge().readImageDataUrl({ filePath: filePath });
            if (result && result.dataUrl) return result.dataUrl;
            if (result && result.error) throw new Error(result.error);
        }
        if (src) {
            const response = await fetch(src);
            if (!response.ok) throw new Error('이미지를 읽지 못했습니다.');
            const blob = await response.blob();
            return await new Promise(function (resolve, reject) {
                const reader = new FileReader();
                reader.onload = function () { resolve(String(reader.result || '')); };
                reader.onerror = function () { reject(reader.error || new Error('이미지 변환 실패')); };
                reader.readAsDataURL(blob);
            });
        }
        throw new Error('선택된 이미지가 없습니다.');
    }

    async function openCrop(image) {
        const dataUrl = await imageToDataUrl(image);
        state.pendingTool = { kind: 'crop', dataUrl: dataUrl, image: image };
        state.toolTitle.textContent = 'Crop · ' + (image.name || '이미지');
        state.toolLayer.style.display = 'flex';
        state.toolFrame.src = new URL('./js/crop/crop.html?embedded=1&v=20260725-edit-result-2', document.baseURI || global.location.href).href;
    }

    async function openBackgroundRemover(image) {
        const dataUrl = await imageToDataUrl(image);
        const targetId = 'mdviewer_image_' + Date.now();
        state.pendingTool = { kind: 'background', dataUrl: dataUrl, image: image, targetId: targetId };
        state.toolTitle.textContent = '배경 제거 · ' + (image.name || '이미지');
        state.toolLayer.style.display = 'flex';
        const url = new URL('./Apps/bgremover_react/bgremoverV2.html', document.baseURI || global.location.href);
        url.searchParams.set('mode', 'mdviewer-image');
        url.searchParams.set('targetId', targetId);
        url.searchParams.set('v', '20260725-edit-result-2');
        state.toolFrame.src = url.href;
    }

    async function openImageInsertFromViewer(image) {
        if (typeof global.openImageInsertModal !== 'function' ||
            typeof global.applyImageInsertDataUrl !== 'function') {
            throw new Error('문서 이미지 삽입 기능을 찾지 못했습니다.');
        }
        const dataUrl = await imageToDataUrl(image);
        close();
        ensureEditMode();
        global.openImageInsertModal();
        global.applyImageInsertDataUrl(
            dataUrl,
            image.name || ('fma_viewer_' + Date.now() + '.png')
        );
        if (typeof global.setImageInsertStatus === 'function') {
            global.setImageInsertStatus(
                'FMA Viewer 이미지가 준비되었습니다. [imgBB] Upload 또는 문서내부저장으로 링크를 만든 뒤 Markdown/HTML을 선택하세요.',
                false
            );
        }
    }

    function ensureEditMode() {
        try {
            if (typeof isEditMode !== 'undefined' && !isEditMode && typeof toggleMode === 'function') toggleMode('edit');
        } catch (_) {}
    }

    function insertImageUrl(url, name) {
        ensureEditMode();
        if (typeof global.insertMarkdownImageAtCursor === 'function') {
            global.insertMarkdownImageAtCursor(url, String(name || 'image').replace(/\.[^.]+$/, ''));
            return true;
        }
        throw new Error('문서 이미지 삽입 기능을 찾지 못했습니다.');
    }

    async function saveInternalAndInsert(image) {
        const dataUrl = await imageToDataUrl(image);
        if (!global.ImageDB || typeof global.ImageDB.saveDataUrl !== 'function') throw new Error('내부 이미지 DB가 준비되지 않았습니다.');
        if (typeof db === 'undefined' || !db) throw new Error('내부 데이터베이스가 준비되지 않았습니다.');
        const saved = await global.ImageDB.saveDataUrl(db, dataUrl, {
            name: image.name || ('viewer_image_' + Date.now() + '.png')
        });
        if (!saved || !saved.url) throw new Error('내부 이미지 주소를 만들지 못했습니다.');
        insertImageUrl(saved.url, image.name);
        showStatus('이미지를 내부 저장하고 문서에 삽입했습니다.', false);
    }

    async function uploadToImgbbAndInsert(image) {
        const dataUrl = await imageToDataUrl(image);
        const apiKey = typeof getImgbbApiKey === 'function' ? String(getImgbbApiKey() || '').trim() : '';
        if (!apiKey) throw new Error('설정에서 imgBB API key를 먼저 저장해 주세요.');
        const comma = dataUrl.indexOf(',');
        const form = new FormData();
        form.append('image', comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl);
        form.append('name', String(image.name || ('viewer_image_' + Date.now())).replace(/\.[^.]+$/, ''));
        showStatus('imgBB에 이미지를 업로드하는 중입니다...', false);
        const response = await fetch('https://api.imgbb.com/1/upload?key=' + encodeURIComponent(apiKey), {
            method: 'POST',
            body: form
        });
        let payload = {};
        try { payload = await response.json(); } catch (_) {}
        if (!response.ok || !payload || payload.success === false) {
            const detail = payload && payload.error && payload.error.message ? payload.error.message : ('HTTP ' + response.status);
            throw new Error('imgBB 업로드 실패: ' + detail);
        }
        const data = payload.data || {};
        const url = String(data.url || (data.image && data.image.url) || data.display_url || '');
        if (!/^https?:\/\//i.test(url)) throw new Error('imgBB가 이미지 주소를 반환하지 않았습니다.');
        insertImageUrl(url, image.name);
        showStatus('imgBB 업로드 주소를 문서에 삽입했습니다.', false);
    }

    function applyEditedImage(dataUrl, sourceName, action) {
        postToViewer({
            type: action === 'new' ? 'fmaviewer-add-image' : 'fmaviewer-apply-image',
            dataUrl: dataUrl,
            name: sourceName || ('edited_' + Date.now() + '.png')
        });
    }

    async function handleMessage(event) {
        const data = event && event.data;
        if (!data || typeof data !== 'object') return;
        if (state.frame && event.source === state.frame.contentWindow) {
            if (data.type === 'fmaviewer-image-count') {
                resolveViewerImageCount(data);
                return;
            }
            if (data.type === 'fmaviewer-ready') {
                state.viewerReady = true;
                try { await sendPendingOpen(); } catch (error) { showStatus(error.message || error, true); }
                return;
            }
            if (data.type === 'fmaviewer-close') {
                close();
                return;
            }
            const image = data.image || {};
            try {
                if (data.type === 'fmaviewer-crop-image') await openCrop(image);
                if (data.type === 'fmaviewer-remove-background') await openBackgroundRemover(image);
                if (data.type === 'fmaviewer-open-image-insert') await openImageInsertFromViewer(image);
                if (data.type === 'fmaviewer-insert-internal') await saveInternalAndInsert(image);
                if (data.type === 'fmaviewer-upload-imgbb') await uploadToImgbbAndInsert(image);
            } catch (error) {
                showStatus(error && error.message ? error.message : String(error), true);
            }
            return;
        }
        if (!state.toolFrame || event.source !== state.toolFrame.contentWindow || !state.pendingTool) return;
        if (data.type === 'crop-ready' && state.pendingTool.kind === 'crop') {
            state.toolFrame.contentWindow.postMessage({ type: 'crop', image: state.pendingTool.dataUrl }, '*');
            return;
        }
        if (data.type === 'aiimg-cropped' && data.dataUrl && state.pendingTool.kind === 'crop') {
            const action = data.action === 'new' ? 'new' : 'replace';
            applyEditedImage(data.dataUrl, 'cropped_' + (state.pendingTool.image.name || 'image.png'), action);
            state.toolFrame.contentWindow.postMessage({ type: 'crop-applied' }, '*');
            closeTool();
            showStatus(action === 'new'
                ? 'Crop 결과를 새 파일로 추가했습니다.'
                : 'Crop 결과를 현재 파일에 적용했습니다.', false);
            return;
        }
        if (data.type === 'crop-cancel') {
            closeTool();
            return;
        }
        if (data.type === 'bgremover-ready' && state.pendingTool.kind === 'background') {
            state.toolFrame.contentWindow.postMessage({
                type: 'bgremover-init',
                mode: 'mdviewer-image',
                targetId: state.pendingTool.targetId,
                name: state.pendingTool.image.name || 'image.png',
                dataUrl: state.pendingTool.dataUrl
            }, '*');
            return;
        }
        if (data.type === 'bgremover-commit' && data.dataUrl && state.pendingTool.kind === 'background') {
            const action = data.action === 'new' ? 'new' : 'replace';
            applyEditedImage(data.dataUrl, 'nobg_' + (state.pendingTool.image.name || 'image.png'), action);
            closeTool();
            showStatus(action === 'new'
                ? '배경 제거 결과를 새 파일로 추가했습니다.'
                : '배경 제거 결과를 현재 파일에 적용했습니다.', false);
            return;
        }
        if (data.type === 'bgremover-cancel') closeTool();
    }

    function bindElectronOpen() {
        const api = bridge();
        if (!api || typeof api.onInternalImageOpen !== 'function') return;
        api.onInternalImageOpen(function (payload) {
            if (!payload || !payload.path) return;
            openPath(payload.path, payload.title || payload.fileName || '');
        });
    }

    global.InternalImageApp = Object.freeze({
        openPath: openPath,
        openFiles: openFiles,
        openFilesWithChoice: openFilesWithChoice,
        getViewerImageCount: getViewerImageCount,
        requestViewerImageCount: requestViewerImageCount,
        openFrame: openFrame,
        close: close
    });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindElectronOpen);
    else bindElectronOpen();
})(window);
