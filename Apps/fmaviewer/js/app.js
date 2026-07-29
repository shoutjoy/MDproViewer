/* =======================================================
   Main App Core
   ======================================================= */

async function init() {
    initGrid();
    initPanelResize();
    initDB();
    setupEventListeners();
    updateModeButtons();
    updateStepButtons();
    await loadViewerLaunchImages();
}

const FMA_IMAGE_EXTENSIONS = new Set([
    '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.ico', '.avif'
]);

function getFileExtension(value) {
    const match = String(value || '').toLowerCase().match(/(\.[^.\\/]+)$/);
    return match ? match[1] : '';
}

function isImageFile(file) {
    return !!file && (
        String(file.type || '').toLowerCase().startsWith('image/')
        || FMA_IMAGE_EXTENSIONS.has(getFileExtension(file.name))
    );
}

function selectLaunchImage(selectedName, selectedPath) {
    const wantedName = String(selectedName || '').toLowerCase();
    const wantedPath = String(selectedPath || '').toLowerCase();
    let index = images.findIndex((image) => {
        const imagePath = String(image.path || '').toLowerCase();
        return (wantedPath && imagePath === wantedPath)
            || (wantedName && (imagePath.endsWith('/' + wantedName) || imagePath.endsWith('\\' + wantedName) || imagePath === wantedName));
    });
    if (index < 0) index = 0;
    if (images.length) showImage(index);
}

function loadImageRecords(records, selectedPath) {
    const rows = Array.isArray(records) ? records : [];
    images = rows
        .filter((item) => item && item.src)
        .map((item) => ({
            src: String(item.src),
            path: String(item.path || item.filePath || item.name || ''),
            group: String(item.group || item.folder || 'folder'),
            date: Number(item.date || item.mtimeMs || Date.now()),
            size: Number(item.size || 0),
            isFav: false
        }));

    renderGallery();
    renderFavorites();
    if (dom.imageCount) dom.imageCount.innerText = "Images: " + images.length;
    selectLaunchImage('', selectedPath);
}

function currentImagePayload() {
    const item = images[currentIndex];
    if (!item) return null;
    const path = String(item.path || '');
    const name = path.split(/[\\/]/).pop() || ('image_' + (currentIndex + 1) + '.png');
    return {
        index: currentIndex,
        src: String(item.src || ''),
        path: path,
        name: name,
        size: Number(item.size || 0)
    };
}

function sendViewerAction(type) {
    const image = currentImagePayload();
    if (!image) {
        alert('먼저 이미지를 선택하세요.');
        return;
    }
    if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: type, image: image }, '*');
    }
}

function applyEditedImage(dataUrl, name) {
    if (!images[currentIndex] || !/^data:image\//i.test(String(dataUrl || ''))) return;
    const old = images[currentIndex];
    images[currentIndex] = {
        ...old,
        src: String(dataUrl),
        path: String(name || old.path || ('edited_' + Date.now() + '.png')),
        date: Date.now(),
        size: String(dataUrl).length
    };
    renderGallery();
    renderFavorites();
    showImage(currentIndex);
}

function addEditedImage(dataUrl, name) {
    if (!/^data:image\//i.test(String(dataUrl || ''))) return;
    const source = images[currentIndex] || {};
    const nextIndex = images.length;
    images.push({
        src: String(dataUrl),
        path: String(name || ('edited_' + Date.now() + '.png')),
        group: 'edited',
        date: Date.now(),
        size: String(dataUrl).length,
        isFav: false,
        sourcePath: String(source.path || '')
    });
    currentIndex = nextIndex;
    renderGallery();
    renderFavorites();
    if (dom.imageCount) dom.imageCount.innerText = "Images: " + images.length;
    showImage(currentIndex);
}

async function loadViewerFiles(files, selectedName) {
    const imageFiles = Array.from(files || []).filter(isImageFile);
    if (!imageFiles.length) return false;
    images = [];
    await handleAddImages(imageFiles, { persist: false });
    selectLaunchImage(selectedName, '');
    return true;
}

async function loadViewerLaunchImages() {
    const params = new URLSearchParams(window.location.search);
    const selectedPath = params.get('path') || '';
    const selectedName = params.get('title') || selectedPath.split(/[\\/]/).pop() || '';
    if (selectedName) document.title = selectedName + ' - 이미지 보기';

    if (selectedPath && window.web2electron && typeof window.web2electron.getImageFolder === 'function') {
        try {
            const result = await window.web2electron.getImageFolder({ filePath: selectedPath });
            if (result && !result.error && Array.isArray(result.images) && result.images.length) {
                loadImageRecords(result.images, result.selectedPath || selectedPath);
                return true;
            }
        } catch (error) {
            console.warn('이미지 폴더를 불러오지 못했습니다.', error);
        }
    }

    const directUrl = params.get('file') || '';
    if (directUrl) {
        loadImageRecords([{
            src: directUrl,
            path: selectedPath || selectedName,
            name: selectedName,
            group: 'folder'
        }], selectedPath);
        return true;
    }
    return false;
}

function initGrid() {
    const savedCols = localStorage.getItem('fma_grid_cols') || 2;
    changeGrid(parseInt(savedCols));
}

function changeGrid(cols) {
    document.documentElement.style.setProperty('--grid-cols', cols);
    localStorage.setItem('fma_grid_cols', cols);
    document.querySelectorAll('.btnGrid').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.getAttribute('data-cols')) === cols);
    });
}

function setupEventListeners() {
    // Top Bar Actions
    dom.btnOpen.onclick = () => dom.input.click();
    dom.dropzone.onclick = () => dom.input.click();
    dom.input.onchange = (e) => {
        const file = e.target.files[0];
        if (file) loadFMA(file);
    };

    dom.btnAddImg.onclick = () => dom.addImgInput.click();
    dom.addImgInput.onchange = (e) => handleAddImages(Array.from(e.target.files));
    if (dom.btnCropImage) dom.btnCropImage.onclick = () => sendViewerAction('fmaviewer-crop-image');
    if (dom.btnRemoveBackground) dom.btnRemoveBackground.onclick = () => sendViewerAction('fmaviewer-remove-background');
    if (dom.btnInsertInternal) dom.btnInsertInternal.onclick = () => sendViewerAction('fmaviewer-insert-internal');
    if (dom.btnUploadImgbb) dom.btnUploadImgbb.onclick = () => sendViewerAction('fmaviewer-upload-imgbb');
    dom.btnSave.onclick = saveFMA;
    dom.btnClear.onclick = resetProject;
    dom.btnZip.onclick = downloadAllAsZIP;
    dom.btnRestoreRemove.onclick = restoreLastDeleted;
    dom.btnRestore.onclick = restoreLastSession;

    // Sort & Fav & Orientation
    dom.sortSelect.onchange = (e) => {
        sortMode = e.target.value;
        renderGallery();
    };

    dom.btnToggleFavs.onclick = () => {
        dom.favSidebar.classList.toggle('open');
        renderFavorites();
    };

    dom.btnOrientation.onclick = toggleOrientation;

    // View Modes
    dom.btnModeSingle.onclick = () => switchViewMode(1);
    dom.btnModeTwo.onclick = () => switchViewMode(2);

    // Zoom Buttons
    dom.btnZoomIn.onclick = () => { zoom *= 1.2; updateZoom(); };
    dom.btnZoomOut.onclick = () => { zoom /= 1.2; updateZoom(); };
    dom.btnResetZoom.onclick = resetZoom;

    // Navigation
    dom.btnPrev.onclick = () => showImage(currentIndex - navStep);
    dom.btnNext.onclick = () => showImage(currentIndex + navStep);
    dom.btnPrevMenu.onclick = () => showImage(currentIndex - navStep);
    dom.btnNextMenu.onclick = () => showImage(currentIndex + navStep);

    // Skip/Step Buttons
    dom.btnStep1.onclick = () => { navStep = 1; updateStepButtons(); };
    dom.btnStep2.onclick = () => { navStep = 2; updateStepButtons(); };

    // Keyboard
    document.addEventListener("keydown", e => {
        if (e.key === "ArrowRight") showImage(currentIndex + navStep);
        if (e.key === "ArrowLeft") showImage(currentIndex - navStep);
    });

    // Mouse Interactions (Zoom & Pan)
    setupDragPan();

    // Fullscreen
    dom.btnFullscreen.onclick = toggleFullscreen;

    // FMA Dropzone (Smart: handles both FMA and Images)
    dom.dropzone.ondragover = e => e.preventDefault();
    dom.dropzone.ondragenter = () => dom.dropzone.classList.add('drag-over');
    dom.dropzone.ondragleave = () => dom.dropzone.classList.remove('drag-over');
    dom.dropzone.ondrop = e => {
        e.preventDefault();
        dom.dropzone.classList.remove('drag-over');
        const items = Array.from(e.dataTransfer.files);
        if (items.length === 0) return;

        const file = items[0];
        if (file.name.toLowerCase().endsWith('.fma') || file.type === 'application/json') {
            loadFMA(file);
        } else if (file.type.startsWith('image/')) {
            handleAddImages(items);
        }
    };

    if (dom.dropzoneImg) {
        dom.dropzoneImg.ondragover = e => e.preventDefault();
        dom.dropzoneImg.ondragenter = () => dom.dropzoneImg.classList.add('drag-over');
        dom.dropzoneImg.ondragleave = () => dom.dropzoneImg.classList.remove('drag-over');
        dom.dropzoneImg.ondrop = e => {
            e.preventDefault();
            dom.dropzoneImg.classList.remove('drag-over');
            const files = Array.from(e.dataTransfer.files);
            if (files.length > 0) handleAddImages(files);
        };
        // Option: Can also click to add images
        dom.dropzoneImg.onclick = () => dom.addImgInput.click();
    }

    window.addEventListener('message', async (event) => {
        const data = event && event.data;
        if (!data) return;
        if (data.type === 'fmaviewer-open-files') {
            await loadViewerFiles(data.files, data.selectedName || '');
            return;
        }
        if (data.type === 'fmaviewer-open-records') {
            loadImageRecords(data.records, data.selectedPath || '');
            return;
        }
        if (data.type === 'fmaviewer-apply-image') {
            applyEditedImage(data.dataUrl, data.name);
            return;
        }
        if (data.type === 'fmaviewer-add-image') {
            addEditedImage(data.dataUrl, data.name);
        }
    });

    if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'fmaviewer-ready' }, '*');
    }
}

function updateModeButtons() {
    if (!dom.btnModeSingle) return;
    dom.btnModeSingle.classList.toggle('active', viewMode === 1);
    dom.btnModeTwo.classList.toggle('active', viewMode === 2);
}

function updateStepButtons() {
    if (!dom.btnStep1) return;
    dom.btnStep1.classList.toggle('active', navStep === 1);
    dom.btnStep2.classList.toggle('active', navStep === 2);

    // Header navigation/step visibility
    const isHorz = (orientation === 'horz');
    if (dom.stepOption) dom.stepOption.style.display = isHorz ? 'flex' : 'none';
    if (dom.navMenu) dom.navMenu.style.display = 'flex'; // Always visible

    // Page count update
    if (dom.pageText) dom.pageText.innerText = `${currentIndex + 1} / ${images.length}`;
}

// Run Initialization
document.addEventListener("DOMContentLoaded", init);
