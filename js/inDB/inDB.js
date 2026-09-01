// MarkdownProDB(inDB) initialization, saving, feature synchronization, and storage UI.
// Loaded after app.js so editor globals remain available while this concern stays isolated.
const DB_NAME = "MarkdownProDB";
const DB_VERSION = 8;
const FEATURE_DATA_STORE_NAMES = ['fonts', 'ai_chat', 'scholar_ai', 'ssp_image_ai', 'highlights', 'genslides'];
const INDB_ENABLED_SETTING_KEY = 'md_viewer_indb_enabled';

function isInDbStorageEnabled() {
    try {
        const stored = localStorage.getItem(INDB_ENABLED_SETTING_KEY);
        return stored === null ? true : stored !== 'false';
    } catch (_) {
        return true;
    }
}

function syncInDbStorageSettingsUi() {
    const enabled = isInDbStorageEnabled();
    const checkbox = document.getElementById('indb-storage-enabled');
    const statusButton = document.getElementById('btn-open-indb-status');
    const footerButton = document.getElementById('btn-footer-open-indb-status');
    const help = document.getElementById('indb-storage-setting-help');
    if (checkbox) checkbox.checked = enabled;
    if (statusButton) statusButton.disabled = !enabled;
    if (footerButton) footerButton.disabled = !enabled;
    if (help) {
        help.textContent = enabled
            ? '새로고침 후에도 inDB를 내부 저장소로 사용합니다.'
            : '새로고침 후 inDB 자동 저장과 내부 동기화를 실행하지 않습니다.';
    }
    if (document.body) {
        document.body.classList.toggle('feature-indb-enabled', enabled);
        document.body.classList.toggle('feature-indb-disabled', !enabled);
    }
    return enabled;
}

function setInDbStorageEnabled(enabled) {
    const next = enabled !== false;
    try { localStorage.setItem(INDB_ENABLED_SETTING_KEY, next ? 'true' : 'false'); } catch (_) {}
    syncInDbStorageSettingsUi();
    if (typeof window.onStorageFeatureCheckboxChange === 'function') {
        window.onStorageFeatureCheckboxChange();
    }
    if (typeof showToast === 'function') {
        showToast(next
            ? 'inDB 내부 저장소를 사용합니다.'
            : 'inDB 사용을 껐습니다. 새로고침 후 내부 자동 저장이 중지됩니다.');
    }
    return next;
}

function onInDbStorageSettingChange(checked) {
    return setInDbStorageEnabled(checked === true);
}

// Init DB
function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = (e) => reject("DB Open Error");
        request.onsuccess = (e) => {
            db = e.target.result;
            resolve(db);
        };
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('documents')) {
                db.createObjectStore('documents', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('folders')) {
                db.createObjectStore('folders', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('autosave')) {
                db.createObjectStore('autosave', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('ai_settings')) {
                db.createObjectStore('ai_settings', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('images')) {
                db.createObjectStore('images', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('fonts')) {
                db.createObjectStore('fonts', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('scholar_refs')) {
                db.createObjectStore('scholar_refs', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('work_files')) {
                const workFileStore = db.createObjectStore('work_files', { keyPath: 'id' });
                workFileStore.createIndex('appId', 'appId', { unique: false });
                workFileStore.createIndex('workType', 'workType', { unique: false });
                workFileStore.createIndex('createdAt', 'createdAt', { unique: false });
            }
            FEATURE_DATA_STORE_NAMES.forEach(function (storeName) {
                if (!db.objectStoreNames.contains(storeName)) {
                    db.createObjectStore(storeName, { keyPath: 'id' });
                }
            });
        };
    });
}


async function saveCurrentToInDbAuto() {
    if (!isInDbStorageEnabled()) {
        showToast('설정에서 inDB 사용을 먼저 켜세요.');
        return false;
    }
    if (!db) {
        showToast('Database is not ready yet. Please try again.');
        return false;
    }
    syncCurrentMarkdownFromEditor();
    const baseTitle = String((currentFileName || 'Untitled').replace(/\.md$/i, '')).trim() || 'Untitled';
    const docs = await new Promise(function (resolve) {
        const req = db.transaction('documents', 'readonly').objectStore('documents').getAll();
        req.onsuccess = function () { resolve(Array.isArray(req.result) ? req.result : []); };
        req.onerror = function () { resolve([]); };
    });
    const title = typeof getNextIndexedDbTitle === 'function'
        ? getNextIndexedDbTitle(baseTitle, docs)
        : baseTitle;
    const doc = {
        id: 'doc_' + Date.now(),
        title: title,
        content: String(currentMarkdown || ''),
        folderId: 'root',
        createdAt: new Date(),
        updatedAt: new Date()
    };
    await new Promise(function (resolve, reject) {
        const tx = db.transaction('documents', 'readwrite');
        tx.objectStore('documents').put(doc);
        tx.oncomplete = resolve;
        tx.onerror = function () { reject(tx.error || new Error('Failed to save to inDB.')); };
    });
    renderDBList();
    if (isSidebarHidden) toggleSidebarVisibility();
    markPersistedState();
    showToast('Saved to inDB.');
    return true;
}


const INDB_STATUS_STORE_ORDER = [
    'documents',
    'folders',
    'images',
    'fonts',
    'autosave',
    'ai_settings',
    'scholar_refs',
    'work_files',
    'ai_chat',
    'scholar_ai',
    'ssp_image_ai',
    'highlights',
    'genslides'
];
const INDB_STATUS_STORE_LABELS = Object.freeze({
    documents: '문서',
    folders: '폴더',
    images: '이미지',
    fonts: '사용자 폰트',
    autosave: '자동 저장',
    ai_settings: 'AI 설정',
    scholar_refs: '학술 참고문헌',
    work_files: '작업 파일',
    ai_chat: 'AI 대화',
    scholar_ai: 'ScholarAI',
    ssp_image_ai: '이미지 AI',
    highlights: '하이라이트',
    genslides: 'GenSlide'
});
let featureDataSyncPromise = null;
let inDbStatusObjectUrls = new Set();
let inDbStatusSnapshot = null;
let inDbStatusViewState = { storeName: '', recordId: '' };
let inDbAiMessageFilter = 'all';
let inDbUnusedImageObjectUrls = new Set();
let inDbUnusedImageSnapshot = null;

function normalizeFeatureInDbRecord(storeName, record, index) {
    const source = record && typeof record === 'object' ? record : { value: record };
    const normalized = Object.assign({}, source);
    const rawId = source.id != null && String(source.id).trim()
        ? String(source.id)
        : storeName + '-' + String(index + 1);
    normalized.id = rawId;
    normalized.syncedAt = new Date().toISOString();
    return normalized;
}

function replaceFeatureStoreRecordsInDb(storeName, records) {
    const store = String(storeName || '').trim();
    if (!isInDbStorageEnabled() || !db || !FEATURE_DATA_STORE_NAMES.includes(store) || !db.objectStoreNames.contains(store)) {
        return Promise.resolve(false);
    }
    const list = Array.isArray(records) ? records : [];
    return new Promise(function (resolve, reject) {
        try {
            const tx = db.transaction(store, 'readwrite');
            const objectStore = tx.objectStore(store);
            objectStore.clear();
            list.forEach(function (record, index) {
                objectStore.put(normalizeFeatureInDbRecord(store, record, index));
            });
            tx.oncomplete = function () { resolve(true); };
            tx.onerror = function () { reject(tx.error || new Error('Failed to synchronize ' + store)); };
            tx.onabort = function () { reject(tx.error || new Error('Synchronization was aborted: ' + store)); };
        } catch (error) {
            reject(error);
        }
    });
}

function saveFeatureRecordToInDb(storeName, record) {
    const store = String(storeName || '').trim();
    if (!isInDbStorageEnabled() || !db || !FEATURE_DATA_STORE_NAMES.includes(store) || !db.objectStoreNames.contains(store)) {
        return Promise.resolve(false);
    }
    return new Promise(function (resolve, reject) {
        try {
            const tx = db.transaction(store, 'readwrite');
            tx.objectStore(store).put(normalizeFeatureInDbRecord(store, record, 0));
            tx.oncomplete = function () { resolve(true); };
            tx.onerror = function () { reject(tx.error || new Error('Failed to save ' + store)); };
        } catch (error) {
            reject(error);
        }
    });
}

function upsertFeatureStoreRecordsInDb(storeName, records) {
    const store = String(storeName || '').trim();
    if (!isInDbStorageEnabled() || !db || !FEATURE_DATA_STORE_NAMES.includes(store) || !db.objectStoreNames.contains(store)) {
        return Promise.resolve(false);
    }
    const list = Array.isArray(records) ? records : [];
    return new Promise(function (resolve, reject) {
        try {
            const tx = db.transaction(store, 'readwrite');
            const objectStore = tx.objectStore(store);
            list.forEach(function (record, index) {
                objectStore.put(normalizeFeatureInDbRecord(store, record, index));
            });
            tx.oncomplete = function () { resolve(true); };
            tx.onerror = function () { reject(tx.error || new Error('Failed to update ' + store)); };
        } catch (error) {
            reject(error);
        }
    });
}

function deleteFeatureRecordFromInDb(storeName, id) {
    const store = String(storeName || '').trim();
    const recordId = String(id == null ? '' : id).trim();
    if (!db || !FEATURE_DATA_STORE_NAMES.includes(store) || !recordId || !db.objectStoreNames.contains(store)) {
        return Promise.resolve(false);
    }
    return new Promise(function (resolve, reject) {
        try {
            const tx = db.transaction(store, 'readwrite');
            tx.objectStore(store).delete(recordId);
            tx.oncomplete = function () { resolve(true); };
            tx.onerror = function () { reject(tx.error || new Error('Failed to delete ' + store)); };
        } catch (error) {
            reject(error);
        }
    });
}

async function getExistingIndexedDbNames() {
    if (!window.indexedDB || typeof window.indexedDB.databases !== 'function') return null;
    try {
        const databases = await window.indexedDB.databases();
        return new Set((databases || []).map(function (item) { return String(item && item.name || ''); }));
    } catch (_) {
        return null;
    }
}

function readExternalIndexedDbStore(dbName, storeName, existingNames) {
    if (!window.indexedDB) return Promise.resolve({ available: false, records: [] });
    if (existingNames && !existingNames.has(dbName)) {
        return Promise.resolve({ available: false, records: [] });
    }
    return new Promise(function (resolve) {
        let settled = false;
        let externalDb = null;
        const finish = function (result) {
            if (settled) return;
            settled = true;
            try { if (externalDb) externalDb.close(); } catch (_) {}
            resolve(result);
        };
        try {
            const request = window.indexedDB.open(dbName);
            request.onerror = function () { finish({ available: false, records: [] }); };
            request.onblocked = function () { finish({ available: false, records: [] }); };
            request.onsuccess = function () {
                externalDb = request.result;
                if (!externalDb.objectStoreNames.contains(storeName)) {
                    finish({ available: false, records: [] });
                    return;
                }
                try {
                    const tx = externalDb.transaction(storeName, 'readonly');
                    const getAll = tx.objectStore(storeName).getAll();
                    getAll.onsuccess = function () {
                        finish({ available: true, records: Array.isArray(getAll.result) ? getAll.result : [] });
                    };
                    getAll.onerror = function () { finish({ available: false, records: [] }); };
                } catch (_) {
                    finish({ available: false, records: [] });
                }
            };
        } catch (_) {
            finish({ available: false, records: [] });
        }
    });
}

function readFeatureLocalStorageArray(key) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
        return [];
    }
}

async function syncKnownFeatureDataToInDb() {
    if (!isInDbStorageEnabled() || !db) return false;
    if (featureDataSyncPromise) return featureDataSyncPromise;
    featureDataSyncPromise = (async function () {
        const existingNames = await getExistingIndexedDbNames();

        const scholarHistory = readFeatureLocalStorageArray('ss_viewer_scholar_ai_history');
        await replaceFeatureStoreRecordsInDb('scholar_ai', scholarHistory);

        const sspHistory = readFeatureLocalStorageArray('ss_viewer_ssp_img_history');
        await upsertFeatureStoreRecordsInDb('ssp_image_ai', sspHistory);

        const aiChat = await readExternalIndexedDbStore('md_viewer_ai_chat', 'conversations', existingNames);
        if (aiChat.available) {
            await replaceFeatureStoreRecordsInDb('ai_chat', aiChat.records);
        }

        const highlightRecords = await readExternalIndexedDbStore('MDProViewer_Ultimate_DB', 'records', existingNames);
        const highlightTags = await readExternalIndexedDbStore('MDProViewer_Ultimate_DB', 'tags', existingNames);
        if (highlightRecords.available || highlightTags.available) {
            const records = (highlightRecords.records || []).map(function (record, index) {
                return Object.assign({}, record, {
                    id: 'record:' + String(record && record.id != null ? record.id : index + 1),
                    sourceId: record && record.id,
                    recordType: 'highlight'
                });
            });
            const tags = (highlightTags.records || []).map(function (record, index) {
                return Object.assign({}, record, {
                    id: 'tag:' + String(record && record.name || index + 1),
                    recordType: 'tag'
                });
            });
            await replaceFeatureStoreRecordsInDb('highlights', records.concat(tags));
        }

        const genSlides = await readExternalIndexedDbStore('GenSlideDB', 'autosave', existingNames);
        const genSlideImages = await readExternalIndexedDbStore('GenSlideDB', 'images', existingNames);
        if (genSlides.available || genSlideImages.available) {
            const slides = (genSlides.records || []).map(function (record, index) {
                return Object.assign({}, record, {
                    id: 'slides:' + String(record && record.id != null ? record.id : index + 1),
                    sourceId: record && record.id,
                    recordType: 'slides'
                });
            });
            const images = (genSlideImages.records || []).map(function (record, index) {
                return Object.assign({}, record, {
                    id: 'image:' + String(record && record.id != null ? record.id : index + 1),
                    sourceId: record && record.id,
                    recordType: 'image'
                });
            });
            await upsertFeatureStoreRecordsInDb('genslides', slides.concat(images));
        }
        return true;
    })();
    try {
        return await featureDataSyncPromise;
    } finally {
        featureDataSyncPromise = null;
    }
}

function escapeInDbStatusHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getInDbStatusStores() {
    if (!db || !db.objectStoreNames) return [];
    const existing = Array.from(db.objectStoreNames || []).filter(function (name) { return name !== 'AI_data'; });
    const ordered = [];
    INDB_STATUS_STORE_ORDER.forEach(function (name) {
        if (existing.includes(name)) ordered.push(name);
    });
    existing.forEach(function (name) {
        if (!ordered.includes(name)) ordered.push(name);
    });
    return ordered;
}

function getInDbStatusPrimaryText(storeName, item) {
    const rec = item || {};
    if (storeName === 'documents') return String(rec.title || rec.id || '(untitled)');
    if (storeName === 'folders') return String(rec.name || rec.id || '(folder)');
    if (storeName === 'images') return String(rec.name || rec.id || '(image)');
    if (storeName === 'fonts') return String(rec.family || rec.id || '(font)');
    if (storeName === 'autosave') return String(rec.title || rec.id || '(autosave)');
    if (storeName === 'scholar_refs') return String(rec.title || rec.id || '(scholar ref)');
    if (storeName === 'work_files') return String(rec.name || rec.id || '(work file)');
    if (storeName === 'ai_settings') return String(rec.id || 'ai_settings');
    if (storeName === 'ai_chat') return String(rec.title || rec.id || '(AI chat)');
    if (storeName === 'AI_data') {
        if (rec.recordType === 'academic_search') return String(rec.question || rec.query || '(학술검색)');
        return String(rec.title || rec.name || rec.id || '(AI data)');
    }
    if (storeName === 'scholar_ai') return String(rec.prompt || rec.title || rec.id || '(ScholarAI)');
    if (storeName === 'ssp_image_ai') return String(rec.prompt || rec.name || rec.id || '(sspimgAI image)');
    if (storeName === 'highlights') {
        if (rec.recordType === 'tag') return '#' + String(rec.name || rec.id || 'tag');
        return String(rec.title || rec.contentData || rec.content || rec.id || '(highlight)').replace(/\s+/g, ' ').slice(0, 100);
    }
    if (storeName === 'genslides') return String(rec.name || rec.title || rec.sourceId || rec.id || '(GenSlide)');
    return String(rec.id || '(item)');
}

function getInDbStatusSecondaryText(storeName, item) {
    const rec = item || {};
    if (storeName === 'documents') {
        const len = String(rec.content || '').length;
        return 'id=' + String(rec.id || '') + ' | chars=' + len;
    }
    if (storeName === 'images') {
        const size = rec.blob && typeof rec.blob.size === 'number' ? rec.blob.size : 0;
        return 'id=' + String(rec.id || '') + ' | bytes=' + size;
    }
    if (storeName === 'fonts') {
        return String(rec.format || 'webfont') + ' | weight=' + String(rec.weight || 'normal')
            + ' | ' + String(rec.url || '');
    }
    if (storeName === 'work_files') {
        return String(rec.appId || 'mdpro') + ' | ' + String(rec.workType || 'generic')
            + ' | bytes=' + Number(rec.sizeBytes || 0);
    }
    if (storeName === 'ai_chat') {
        return 'id=' + String(rec.id || '') + ' | messages=' + (Array.isArray(rec.messages) ? rec.messages.length : 0);
    }
    if (storeName === 'AI_data') {
        const typeLabels = { conversation: 'AI 대화', academic_search: '학술검색', attachment: '첨부 사용', image: 'AI 이미지' };
        const type = typeLabels[rec.recordType] || String(rec.recordType || 'AI 사용 기록');
        const count = rec.recordType === 'academic_search' && Array.isArray(rec.results) ? ' | 결과=' + rec.results.length : '';
        return type + count + ' | 대화=' + String(rec.conversationTitle || rec.conversationId || '-');
    }
    if (storeName === 'scholar_ai') {
        return 'id=' + String(rec.id || '') + ' | result chars=' + String(rec.result || '').length;
    }
    if (storeName === 'ssp_image_ai') {
        return 'id=' + String(rec.id || '') + ' | image bytes≈' + Math.round(String(rec.dataURL || '').length * 0.75);
    }
    if (storeName === 'highlights') {
        return 'id=' + String(rec.id || '') + ' | type=' + String(rec.recordType || 'highlight');
    }
    if (storeName === 'genslides') {
        const count = Array.isArray(rec.slides) ? rec.slides.length : 0;
        const size = rec.blob && typeof rec.blob.size === 'number' ? rec.blob.size : 0;
        return 'id=' + String(rec.id || '') + ' | type=' + String(rec.recordType || 'slides')
            + (count ? ' | slides=' + count : '')
            + (size ? ' | bytes=' + size : '');
    }
    return 'id=' + String(rec.id || '');
}

async function readAllInDbStoreItems(storeName) {
    return await new Promise(function (resolve) {
        try {
            const tx = db.transaction(storeName, 'readonly');
            const req = tx.objectStore(storeName).getAll();
            req.onsuccess = function () { resolve(Array.isArray(req.result) ? req.result : []); };
            req.onerror = function () { resolve([]); };
        } catch (e) {
            resolve([]);
        }
    });
}

function releaseInDbStatusObjectUrls() {
    inDbStatusObjectUrls.forEach(function (url) {
        try { URL.revokeObjectURL(url); } catch (_) {}
    });
    inDbStatusObjectUrls.clear();
}

function formatInDbBytes(value) {
    const bytes = Math.max(0, Number(value) || 0);
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(bytes < 10240 ? 1 : 0) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(bytes < 10485760 ? 1 : 0) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

function getCurrentInDbMarkdownSource() {
    try {
        if (typeof getNoteCoverMarkdownSource === 'function') return String(getNoteCoverMarkdownSource() || '');
    } catch (_) {}
    const cmView = editorTextarea && editorTextarea.__mdCm6View;
    if (cmView && cmView.state && cmView.state.doc) return String(cmView.state.doc.toString());
    if (editorTextarea && typeof editorTextarea.value === 'string') return String(editorTextarea.value);
    return String(currentMarkdown || '');
}

function getInternalIdsFromInDbValue(value) {
    if (window.ImageDB && typeof window.ImageDB.extractInternalImageIdsDeep === 'function') {
        return window.ImageDB.extractInternalImageIdsDeep(value);
    }
    if (window.ImageDB && typeof window.ImageDB.extractInternalImageIds === 'function') {
        try { return window.ImageDB.extractInternalImageIds(JSON.stringify(value)); } catch (_) {}
    }
    return [];
}

async function createInDbStatusSnapshot() {
    const stores = getInDbStatusStores();
    const entries = await Promise.all(stores.map(async function (name) {
        return { name: name, items: await readAllInDbStoreItems(name) };
    }));
    const imageEntry = entries.find(function (entry) { return entry.name === 'images'; });
    const images = imageEntry ? imageEntry.items : [];
    const referenceValues = [getCurrentInDbMarkdownSource()];
    entries.forEach(function (entry) {
        if (entry.name !== 'images') referenceValues.push(entry.items);
    });

    const referencedIds = new Set();
    const referenceCounts = new Map();
    referenceValues.forEach(function (value) {
        getInternalIdsFromInDbValue(value).forEach(function (id) {
            referencedIds.add(id);
            referenceCounts.set(id, (referenceCounts.get(id) || 0) + 1);
        });
    });
    const unusedList = window.ImageDB && typeof window.ImageDB.findUnusedImageIds === 'function'
        ? window.ImageDB.findUnusedImageIds(images, referenceValues)
        : images.map(function (item) { return String(item && item.id || ''); })
            .filter(function (id) { return id && !referencedIds.has(id); });
    const unusedIds = new Set(unusedList);
    const imageBytes = images.reduce(function (sum, item) {
        return sum + (item && item.blob && typeof item.blob.size === 'number' ? item.blob.size : 0);
    }, 0);
    const unusedBytes = images.reduce(function (sum, item) {
        const id = String(item && item.id || '');
        if (!unusedIds.has(id)) return sum;
        return sum + (item && item.blob && typeof item.blob.size === 'number' ? item.blob.size : 0);
    }, 0);
    return {
        stores: stores,
        entries: entries,
        images: images,
        referencedIds: referencedIds,
        referenceCounts: referenceCounts,
        unusedIds: unusedIds,
        imageBytes: imageBytes,
        unusedBytes: unusedBytes,
        totalRecords: entries.reduce(function (sum, entry) { return sum + entry.items.length; }, 0)
    };
}

function releaseUnusedInDbImageObjectUrls() {
    inDbUnusedImageObjectUrls.forEach(function (url) {
        try { URL.revokeObjectURL(url); } catch (_) {}
    });
    inDbUnusedImageObjectUrls.clear();
}

function getUnusedInDbImageRecord(id) {
    if (!inDbUnusedImageSnapshot) return null;
    const targetId = String(id == null ? '' : id);
    return inDbUnusedImageSnapshot.images.find(function (item) {
        return String(item && item.id != null ? item.id : '') === targetId;
    }) || null;
}

function updateUnusedInDbImageSelection() {
    const inputs = Array.from(document.querySelectorAll('#indb-unused-image-grid .indb-unused-checkbox'));
    let selectedCount = 0;
    let selectedBytes = 0;
    inputs.forEach(function (input) {
        const selected = !!input.checked;
        const card = input.closest('.indb-unused-card');
        if (card) card.classList.toggle('is-selected', selected);
        if (!selected) return;
        selectedCount += 1;
        const record = getUnusedInDbImageRecord(input.dataset.id);
        selectedBytes += record && record.blob instanceof Blob ? record.blob.size : 0;
    });
    const summary = document.getElementById('indb-unused-selection-summary');
    if (summary) summary.textContent = selectedCount + '개 선택 · ' + formatInDbBytes(selectedBytes);
    const deleteButton = document.getElementById('btn-delete-selected-unused-images');
    if (deleteButton) {
        deleteButton.disabled = selectedCount === 0;
        deleteButton.textContent = '선택 삭제 ' + selectedCount;
    }
}

function setAllUnusedInDbImagesSelected(selected) {
    document.querySelectorAll('#indb-unused-image-grid .indb-unused-checkbox').forEach(function (input) {
        input.checked = !!selected;
    });
    updateUnusedInDbImageSelection();
}

function closeUnusedInDbImageCleaner() {
    const modal = document.getElementById('indb-unused-image-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
    inDbUnusedImageSnapshot = null;
    releaseUnusedInDbImageObjectUrls();
}

function renderUnusedInDbImageCleaner(snapshot) {
    const modal = document.getElementById('indb-unused-image-modal');
    const grid = document.getElementById('indb-unused-image-grid');
    if (!modal || !grid) return false;
    releaseUnusedInDbImageObjectUrls();
    inDbUnusedImageSnapshot = snapshot;
    const unusedRecords = snapshot.images.filter(function (item) {
        return snapshot.unusedIds.has(String(item && item.id || ''));
    });
    grid.innerHTML = unusedRecords.map(function (item, index) {
        const id = String(item && item.id || '');
        const blob = item && item.blob instanceof Blob ? item.blob : null;
        const mime = String(item && item.mime || (blob && blob.type) || 'application/octet-stream');
        const title = String(item && item.name || id || ('unused-image-' + (index + 1)));
        let preview = '<span class="indb-image-thumb-fallback">미리보기 없음</span>';
        if (blob && /^image\//i.test(mime)) {
            const objectUrl = URL.createObjectURL(blob);
            inDbUnusedImageObjectUrls.add(objectUrl);
            preview = '<img src="' + escapeInDbStatusHtml(objectUrl) + '" alt="' + escapeInDbStatusHtml(title)
                + '" loading="lazy" decoding="async">';
        }
        return '<label class="indb-unused-card"><input type="checkbox" class="indb-unused-checkbox" data-id="'
            + escapeInDbStatusHtml(id) + '" onchange="updateUnusedInDbImageSelection()">'
            + '<span class="indb-unused-thumb">' + preview + '</span><span class="indb-unused-card-copy">'
            + '<span class="indb-unused-card-title" title="' + escapeInDbStatusHtml(title) + '">'
            + escapeInDbStatusHtml(title) + '</span><span class="indb-unused-card-meta">'
            + escapeInDbStatusHtml(formatInDbBytes(blob ? blob.size : 0)) + ' · ' + escapeInDbStatusHtml(mime)
            + '</span><span class="indb-unused-card-meta" title="' + escapeInDbStatusHtml(id) + '">'
            + escapeInDbStatusHtml(id) + '</span></span></label>';
    }).join('');
    const subtitle = document.getElementById('indb-unused-subtitle');
    if (subtitle) subtitle.textContent = '미사용 이미지 ' + unusedRecords.length + '개 · '
        + formatInDbBytes(snapshot.unusedBytes) + ' · 기본은 미선택 상태입니다.';
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    updateUnusedInDbImageSelection();
    try {
        const panel = modal.firstElementChild;
        if (panel) {
            panel.setAttribute('tabindex', '-1');
            panel.focus();
        }
    } catch (_) {}
    return true;
}

async function deleteUnusedInDbImages() {
    if (!db || !db.objectStoreNames.contains('images')) return;
    const snapshot = await createInDbStatusSnapshot();
    if (!snapshot.unusedIds.size) {
        showToast('정리할 미사용 이미지가 없습니다.');
        return;
    }
    renderUnusedInDbImageCleaner(snapshot);
}

async function deleteSelectedUnusedInDbImages() {
    if (!db || !inDbUnusedImageSnapshot) return;
    const ids = Array.from(document.querySelectorAll('#indb-unused-image-grid .indb-unused-checkbox:checked'))
        .map(function (input) { return String(input.dataset.id || ''); })
        .filter(Boolean);
    if (!ids.length) return;
    const bytes = ids.reduce(function (sum, id) {
        const record = getUnusedInDbImageRecord(id);
        return sum + (record && record.blob instanceof Blob ? record.blob.size : 0);
    }, 0);
    const confirmed = window.confirm(
        '선택한 미사용 이미지 ' + ids.length + '개(' + formatInDbBytes(bytes) + ')를 삭제할까요?\n\n'
        + '삭제 후에는 복구할 수 없습니다. 필요한 경우 먼저 전체 백업을 내려받으세요.'
    );
    if (!confirmed) return;
    const button = document.getElementById('btn-delete-selected-unused-images');
    if (button) button.disabled = true;
    try {
        await new Promise(function (resolve, reject) {
            const tx = db.transaction('images', 'readwrite');
            const store = tx.objectStore('images');
            ids.forEach(function (id) { store.delete(id); });
            tx.oncomplete = resolve;
            tx.onerror = function () { reject(tx.error || new Error('미사용 이미지 삭제 실패')); };
        });
        closeUnusedInDbImageCleaner();
        await renderInDbStatusModal();
        showToast('선택한 미사용 이미지 ' + ids.length + '개를 정리했습니다. (' + formatInDbBytes(bytes) + ')');
    } catch (error) {
        showToast('미사용 이미지 정리에 실패했습니다: ' + (error && error.message ? error.message : error));
        updateUnusedInDbImageSelection();
    }
}

function dockSettingsModalForFmaViewer() {
    const modal = document.getElementById('settings-modal');
    const panel = document.getElementById('settings-modal-panel');
    if (!modal || !panel) return 0;
    modal.classList.remove('hidden');
    settingsModalFullscreen = false;
    settingsModalRestoreRect = null;
    settingsModalCompact = false;
    panel.classList.remove('settings-modal-fullscreen', 'settings-modal-compact');
    const viewportWidth = Math.max(0, window.innerWidth || document.documentElement.clientWidth || 0);
    const panelWidth = Math.max(320, Math.min(420, Math.floor(viewportWidth * 0.28)));
    panel.style.position = 'fixed';
    panel.style.left = '10px';
    panel.style.top = '10px';
    panel.style.right = 'auto';
    panel.style.margin = '0';
    panel.style.width = panelWidth + 'px';
    panel.style.height = 'calc(100vh - 20px)';
    panel.style.maxWidth = 'calc(100vw - 20px)';
    panel.style.maxHeight = 'calc(100vh - 20px)';
    applySettingsModalFullscreenUI();
    updateSettingsModalResponsiveLayout();
    return Math.min(Math.max(0, viewportWidth - 360), panelWidth + 20);
}

async function openAllInDbImagesInFmaViewer() {
    if (!db || !db.objectStoreNames.contains('images')) {
        showToast('inDB 이미지 저장소가 준비되지 않았습니다.');
        return;
    }
    if (!window.InternalImageApp || typeof window.InternalImageApp.openFiles !== 'function') {
        showToast('FMA Viewer 연결 모듈을 불러오지 못했습니다.');
        return;
    }
    const records = await readAllInDbStoreItems('images');
    const imageRecords = records.filter(function (item) {
        return item && item.blob instanceof Blob && /^image\//i.test(String(item.mime || item.blob.type || ''));
    });
    if (!imageRecords.length) {
        showToast('FMA Viewer에서 열 수 있는 저장 이미지가 없습니다.');
        return;
    }
    const files = imageRecords.map(function (item, index) {
        const blob = item.blob;
        const name = String(item.name || item.id || ('inDB-image-' + (index + 1) + getInDbMimeExtension(item.mime || blob.type)));
        return new File([blob], name, {
            type: String(item.mime || blob.type || 'application/octet-stream'),
            lastModified: Number(item.createdAt) || Date.now()
        });
    });
    closeInDbStatusModal();
    const viewerLeftOffset = dockSettingsModalForFmaViewer();
    window.InternalImageApp.openFiles(files, files[0].name, {
        importMode: 'replace',
        layout: 'settings-left',
        leftOffset: viewerLeftOffset
    });
    showToast('inDB 이미지 ' + files.length + '개를 FMA Viewer로 열었습니다.');
}

function sanitizeInDbZipSegment(value, fallback) {
    const cleaned = String(value == null ? '' : value)
        .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
        .replace(/\s+/g, ' ')
        .replace(/^\.+|\.+$/g, '')
        .trim();
    return (cleaned || fallback || 'item').slice(0, 120);
}

function getInDbMimeExtension(mimeType) {
    const mime = String(mimeType || '').toLowerCase().split(';')[0];
    const extensions = {
        'image/png': '.png',
        'image/jpeg': '.jpg',
        'image/gif': '.gif',
        'image/webp': '.webp',
        'image/svg+xml': '.svg',
        'image/bmp': '.bmp',
        'image/avif': '.avif',
        'image/x-icon': '.ico',
        'image/vnd.microsoft.icon': '.ico',
        'image/tiff': '.tif',
        'application/pdf': '.pdf',
        'application/zip': '.zip',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
        'text/plain': '.txt',
        'text/markdown': '.md',
        'text/html': '.html',
        'text/csv': '.csv',
        'application/json': '.json'
    };
    return extensions[mime] || '.bin';
}

function getInDbBlobExtension(blob, originalName) {
    const nameMatch = String(originalName || '').match(/\.([a-z0-9]{1,10})$/i);
    if (nameMatch) return '.' + nameMatch[1].toLowerCase();
    return getInDbMimeExtension(blob && blob.type);
}

function makeUniqueInDbZipPath(path, usedPaths) {
    const originalPath = String(path || 'file.bin');
    if (!usedPaths) return originalPath;
    let candidate = originalPath;
    let suffix = 2;
    const dotIndex = originalPath.lastIndexOf('.');
    const base = dotIndex > originalPath.lastIndexOf('/') ? originalPath.slice(0, dotIndex) : originalPath;
    const extension = dotIndex > originalPath.lastIndexOf('/') ? originalPath.slice(dotIndex) : '';
    while (usedPaths.has(candidate.toLocaleLowerCase())) {
        candidate = base + '-' + String(suffix) + extension;
        suffix += 1;
    }
    usedPaths.add(candidate.toLocaleLowerCase());
    return candidate;
}

function getInDbAttachmentPath(context, extension) {
    const safeKeyPath = context.keyPath.map(function (part) {
        return sanitizeInDbZipSegment(part, 'value');
    }).join('-');
    const baseFolder = String(context.attachmentBasePath || (
        'inDB/_attachments/'
        + sanitizeInDbZipSegment(context.storeName, 'store') + '/'
        + sanitizeInDbZipSegment(context.recordToken, 'record')
    )).replace(/\/+$/g, '');
    return makeUniqueInDbZipPath(
        baseFolder + '/' + (safeKeyPath || 'value') + String(extension || '.bin'),
        context.usedPaths
    );
}

function decodeInDbDataUrl(value) {
    const text = String(value || '');
    if (!/^data:/i.test(text)) return null;
    const commaIndex = text.indexOf(',');
    if (commaIndex < 5) return null;
    const header = text.slice(5, commaIndex);
    const payload = text.slice(commaIndex + 1);
    const parts = header.split(';').filter(Boolean);
    const mime = parts.length && parts[0].includes('/') ? parts.shift() : 'application/octet-stream';
    const isBase64 = parts.some(function (part) { return part.toLowerCase() === 'base64'; });
    try {
        if (isBase64) {
            const binary = atob(payload.replace(/\s+/g, ''));
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            return { bytes: bytes, mime: mime };
        }
        return {
            bytes: new TextEncoder().encode(decodeURIComponent(payload)),
            mime: mime
        };
    } catch (_) {
        return null;
    }
}

async function serializeInDbValueForZip(value, context) {
    if (typeof value === 'string') {
        const decodedDataUrl = decodeInDbDataUrl(value);
        if (decodedDataUrl) {
            const path = getInDbAttachmentPath(context, getInDbMimeExtension(decodedDataUrl.mime));
            context.zip.file(path, decodedDataUrl.bytes);
            context.attachments.push({
                store: context.storeName,
                record: context.recordToken,
                field: context.keyPath.join('.'),
                path: path,
                type: decodedDataUrl.mime,
                size: decodedDataUrl.bytes.byteLength
            });
            return {
                __indbType: 'DataURL',
                path: path,
                type: decodedDataUrl.mime,
                size: decodedDataUrl.bytes.byteLength
            };
        }
        return value;
    }
    if (value === null || typeof value === 'number' || typeof value === 'boolean') {
        return value;
    }
    if (typeof value === 'undefined') return { __indbType: 'Undefined' };
    if (typeof value === 'bigint') return { __indbType: 'BigInt', value: String(value) };
    if (value instanceof Date) return { __indbType: 'Date', value: value.toISOString() };

    if (typeof Blob !== 'undefined' && value instanceof Blob) {
        const extension = getInDbBlobExtension(value, value.name || context.originalName);
        const path = getInDbAttachmentPath(context, extension);
        const bytes = new Uint8Array(await value.arrayBuffer());
        context.zip.file(path, bytes);
        context.attachments.push({
            store: context.storeName,
            record: context.recordToken,
            field: context.keyPath.join('.'),
            path: path,
            type: value.type || 'application/octet-stream',
            size: value.size
        });
        return {
            __indbType: 'Blob',
            path: path,
            type: value.type || 'application/octet-stream',
            size: value.size
        };
    }

    if (value instanceof ArrayBuffer || (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(value))) {
        const bytes = value instanceof ArrayBuffer
            ? new Uint8Array(value)
            : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
        const path = getInDbAttachmentPath(context, '.bin');
        context.zip.file(path, bytes);
        context.attachments.push({
            store: context.storeName,
            record: context.recordToken,
            field: context.keyPath.join('.'),
            path: path,
            type: 'application/octet-stream',
            size: bytes.byteLength
        });
        return {
            __indbType: 'Binary',
            path: path,
            size: bytes.byteLength
        };
    }

    if (typeof value !== 'object') return String(value);
    if (context.seen.has(value)) return { __indbType: 'CircularReference' };
    context.seen.add(value);

    let serialized;
    if (Array.isArray(value)) {
        serialized = [];
        for (let i = 0; i < value.length; i++) {
            serialized.push(await serializeInDbValueForZip(value[i], Object.assign({}, context, {
                keyPath: context.keyPath.concat(String(i))
            })));
        }
    } else {
        serialized = {};
        const keys = Object.keys(value);
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            serialized[key] = await serializeInDbValueForZip(value[key], Object.assign({}, context, {
                keyPath: context.keyPath.concat(key),
                originalName: key === 'blob' && value.name ? value.name : context.originalName
            }));
        }
    }
    context.seen.delete(value);
    return serialized;
}

function getInDbBackupFileName() {
    const now = new Date();
    const pad = function (value) { return String(value).padStart(2, '0'); };
    return getFileDownloadPrefixFromLocal() + '-indb-folders-'
        + now.getFullYear()
        + pad(now.getMonth() + 1)
        + pad(now.getDate())
        + '-'
        + pad(now.getHours())
        + pad(now.getMinutes())
        + pad(now.getSeconds())
        + '.zip';
}

function getInDbExportStoreFolderName(storeName, storeIndex) {
    return String(storeIndex + 1).padStart(2, '0')
        + '_'
        + sanitizeInDbZipSegment(storeName, 'store');
}

function getInDbExportRecordFolderName(storeName, record, recordIndex, usedNames) {
    const number = String(recordIndex + 1).padStart(3, '0');
    const primary = sanitizeInDbZipSegment(
        getInDbStatusPrimaryText(storeName, record),
        'record-' + String(recordIndex + 1)
    ).slice(0, 72);
    const id = sanitizeInDbZipSegment(
        record && record.id != null ? record.id : '',
        'id-' + String(recordIndex + 1)
    ).slice(0, 36);
    let name = number + '_' + primary;
    let collisionIndex = 2;
    while (usedNames.has(name.toLocaleLowerCase())) {
        name = number + '_' + primary + '_' + id
            + (collisionIndex > 2 ? '_' + String(collisionIndex) : '');
        collisionIndex += 1;
    }
    usedNames.add(name.toLocaleLowerCase());
    return name;
}

function getInDbConversationMarkdown(record) {
    const item = record || {};
    const lines = ['# ' + String(item.title || 'AI Jena'), ''];
    const messages = Array.isArray(item.messages) ? item.messages : [];
    messages.forEach(function (message) {
        const role = String(message && message.role || 'message');
        const heading = role === 'user' ? 'User' : (role === 'assistant' ? 'Assistant' : role);
        const content = message && typeof message.content === 'string'
            ? message.content
            : JSON.stringify(message && message.content != null ? message.content : '', null, 2);
        lines.push('## ' + heading, '', content, '');
    });
    return lines.join('\n');
}

function addInDbReadableFilesToRecordFolder(zip, storeName, record, folderPath) {
    const item = record || {};
    if (storeName === 'documents') {
        zip.file(folderPath + '/document.md', String(item.content == null ? '' : item.content));
        return;
    }
    if (storeName === 'autosave' && typeof item.content === 'string') {
        zip.file(folderPath + '/autosave.md', item.content);
        return;
    }
    if (storeName === 'fonts') {
        const format = item.format ? ' format("' + String(item.format).replace(/[^a-z0-9-]/gi, '') + '")' : '';
        zip.file(
            folderPath + '/font-face.css',
            '@font-face {\n'
            + '  font-family: "' + String(item.family || '').replace(/["\\\r\n]/g, '') + '";\n'
            + '  src: url("' + String(item.url || '').replace(/["\\\r\n]/g, '') + '")' + format + ';\n'
            + '  font-weight: ' + String(item.weight || 'normal').replace(/[^a-z0-9-]/gi, '') + ';\n'
            + '  font-style: ' + String(item.style || 'normal').replace(/[^a-z-]/gi, '') + ';\n'
            + '  font-display: ' + String(item.display || 'swap').replace(/[^a-z-]/gi, '') + ';\n'
            + '}\n'
        );
        return;
    }
    if (storeName === 'ai_chat') {
        zip.file(folderPath + '/conversation.md', getInDbConversationMarkdown(item));
        return;
    }
    if (storeName === 'scholar_ai') {
        if (item.prompt != null) zip.file(folderPath + '/prompt.txt', String(item.prompt));
        if (item.result != null) zip.file(folderPath + '/result.md', String(item.result));
        return;
    }
    if (storeName === 'ssp_image_ai' && item.prompt != null) {
        zip.file(folderPath + '/prompt.txt', String(item.prompt));
        return;
    }
    if (storeName === 'highlights') {
        const highlightText = item.contentData != null ? item.contentData : item.content;
        if (typeof highlightText === 'string' && highlightText) {
            zip.file(folderPath + '/highlight.txt', highlightText);
        }
        return;
    }
    if (storeName === 'genslides' && Array.isArray(item.slides)) {
        item.slides.forEach(function (slide, index) {
            if (!slide || typeof slide.html !== 'string') return;
            zip.file(
                folderPath + '/slides/slide-' + String(index + 1).padStart(3, '0') + '.html',
                slide.html
            );
        });
    }
}

async function downloadAllInDbAsZip() {
    if (!db) {
        showToast('inDB가 아직 준비되지 않았습니다.');
        return;
    }
    if (typeof JSZip === 'undefined') {
        showToast('ZIP 모듈을 불러오지 못했습니다.');
        return;
    }

    const button = document.getElementById('btn-download-all-indb');
    const originalLabel = button ? button.textContent : '';
    if (button) {
        button.disabled = true;
        button.textContent = '폴더 정리 중...';
    }

    try {
        await syncKnownFeatureDataToInDb();
        const zip = new JSZip();
        const stores = getInDbStatusStores();
        const attachments = [];
        const usedPaths = new Set();
        const manifest = {
            format: 'md-viewer-indb-backup',
            version: 2,
            exportedAt: new Date().toISOString(),
            databaseName: db.name || '',
            databaseVersion: db.version || null,
            rootFolder: 'inDB',
            stores: {},
            attachments: attachments
        };

        for (let storeIndex = 0; storeIndex < stores.length; storeIndex++) {
            const storeName = stores[storeIndex];
            const records = await readAllInDbStoreItems(storeName);
            const storeFolderName = getInDbExportStoreFolderName(storeName, storeIndex);
            const storeFolderPath = 'inDB/' + storeFolderName;
            const recordFolderNames = new Set();
            const storeManifest = {
                folder: storeFolderPath,
                recordCount: records.length,
                records: []
            };
            zip.folder(storeFolderPath);
            if (!records.length) {
                zip.file(storeFolderPath + '/_EMPTY.txt', storeName + ' 저장소에 레코드가 없습니다.\n');
            }

            for (let recordIndex = 0; recordIndex < records.length; recordIndex++) {
                const record = records[recordIndex];
                const recordToken = sanitizeInDbZipSegment(
                    record && record.id != null ? record.id : String(recordIndex + 1),
                    'record-' + String(recordIndex + 1)
                );
                const recordFolderName = getInDbExportRecordFolderName(
                    storeName,
                    record,
                    recordIndex,
                    recordFolderNames
                );
                const recordFolderPath = storeFolderPath + '/' + recordFolderName;
                const attachmentStartIndex = attachments.length;
                zip.folder(recordFolderPath);
                const serializedRecord = await serializeInDbValueForZip(record, {
                    zip: zip,
                    storeName: storeName,
                    recordToken: recordToken,
                    keyPath: [],
                    originalName: record && record.name ? record.name : '',
                    attachmentBasePath: recordFolderPath + '/files',
                    attachments: attachments,
                    seen: new WeakSet(),
                    usedPaths: usedPaths
                });
                zip.file(recordFolderPath + '/record.json', JSON.stringify(serializedRecord, null, 2));
                addInDbReadableFilesToRecordFolder(zip, storeName, record, recordFolderPath);
                storeManifest.records.push({
                    id: String(record && record.id != null ? record.id : ''),
                    title: getInDbStatusPrimaryText(storeName, record),
                    folder: recordFolderPath,
                    recordFile: recordFolderPath + '/record.json',
                    attachmentCount: attachments.length - attachmentStartIndex
                });
            }
            zip.file(
                storeFolderPath + '/_index.json',
                JSON.stringify(storeManifest, null, 2)
            );
            manifest.stores[storeName] = storeManifest;
        }

        zip.file('inDB/_manifest.json', JSON.stringify(manifest, null, 2));
        zip.file(
            'inDB/README.txt',
            'md-viewer inDB 전체 폴더 백업\n\n'
            + '- 각 번호 폴더는 inDB Status 화면의 저장소입니다.\n'
            + '- 각 저장소 안에는 화면에 보이는 레코드별 폴더가 있습니다.\n'
            + '- record.json: 해당 레코드의 전체 데이터\n'
            + '- files/: 해당 레코드에 포함된 이미지·Blob·Data URL·바이너리 원본\n'
            + '- document.md, conversation.md, result.md 등: 바로 읽을 수 있는 보조 파일\n'
            + '- _index.json: 저장소 내 레코드 목록\n'
            + '- _manifest.json: 전체 백업 정보\n\n'
            + '주의: ai_settings 폴더에는 저장된 API 키 등 민감한 설정이 포함될 수 있습니다.\n'
        );

        const backupBlob = await zip.generateAsync({
            type: 'blob',
            compression: 'DEFLATE',
            compressionOptions: { level: 6 }
        });
        const url = URL.createObjectURL(backupBlob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = getInDbBackupFileName();
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);

        const totalRecords = Object.keys(manifest.stores).reduce(function (sum, name) {
            return sum + manifest.stores[name].recordCount;
        }, 0);
        showToast('inDB 폴더형 전체 백업을 다운로드했습니다. (' + totalRecords + '개 레코드)');
    } catch (error) {
        console.error('Failed to download the full inDB backup:', error);
        showToast('inDB 전체 다운로드에 실패했습니다: ' + (error && error.message ? error.message : error));
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = originalLabel || '전체 다운로드';
        }
    }
}

function getInDbStatusEntry(snapshot, storeName) {
    return snapshot && Array.isArray(snapshot.entries)
        ? snapshot.entries.find(function (entry) { return entry.name === storeName; }) || null
        : null;
}

function getInDbStatusRecord(snapshot, storeName, recordId) {
    const entry = getInDbStatusEntry(snapshot, storeName);
    if (!entry) return null;
    const id = String(recordId == null ? '' : recordId);
    return entry.items.find(function (item) { return String(item && item.id != null ? item.id : '') === id; }) || null;
}

function createInDbStatusObjectUrl(blob) {
    if (!(blob instanceof Blob)) return '';
    const objectUrl = URL.createObjectURL(blob);
    inDbStatusObjectUrls.add(objectUrl);
    return objectUrl;
}

function stringifyInDbDetailValue(value) {
    const seen = new WeakSet();
    let text = '';
    try {
        text = JSON.stringify(value, function (key, child) {
            if (/api.?key|access.?token|password|secret/i.test(key)) return '[보호된 값]';
            if (child instanceof Blob) {
                return { type: 'Blob', mime: child.type || 'application/octet-stream', size: child.size };
            }
            if (child instanceof Date) return child.toISOString();
            if (child && typeof child === 'object') {
                if (seen.has(child)) return '[순환 참조]';
                seen.add(child);
            }
            return child;
        }, 2);
    } catch (_) {
        text = String(value);
    }
    if (typeof text !== 'string') text = String(value);
    const limit = 12000;
    return text.length > limit ? text.slice(0, limit) + '\n… (' + (text.length - limit) + '자 생략)' : text;
}

function renderInDbStatusDetailValue(key, value) {
    if (/api.?key|access.?token|password|secret/i.test(key)) {
        return '<span class="indb-detail-protected">보호된 값</span>';
    }
    if (value instanceof Blob) {
        return '<span class="indb-detail-scalar">Blob · '
            + escapeInDbStatusHtml(value.type || 'application/octet-stream') + ' · '
            + escapeInDbStatusHtml(formatInDbBytes(value.size)) + '</span>';
    }
    if (value == null || ['number', 'boolean', 'undefined', 'bigint'].includes(typeof value)) {
        return '<span class="indb-detail-scalar">' + escapeInDbStatusHtml(String(value)) + '</span>';
    }
    const text = typeof value === 'string' ? value : stringifyInDbDetailValue(value);
    const limit = 12000;
    const clipped = text.length > limit ? text.slice(0, limit) + '\n… (' + (text.length - limit) + '자 생략)' : text;
    return '<pre class="indb-detail-value">' + escapeInDbStatusHtml(clipped) + '</pre>';
}

function renderInDbStatusDetail(snapshot, storeName, record) {
    if (!record) {
        return '<div class="indb-detail-placeholder"><span class="indb-detail-placeholder-icon">↖</span>'
            + '<strong>항목을 선택하세요</strong><p>가운데 목록에서 항목을 누르면 이곳에 세부내용이 나타납니다.</p></div>';
    }
    const id = String(record.id == null ? '' : record.id);
    const title = escapeInDbStatusHtml(getInDbStatusPrimaryText(storeName, record));
    const lockedRoot = storeName === 'folders' && id === 'root';
    let imagePreview = '';
    if (storeName === 'images' && record.blob instanceof Blob && /^image\//i.test(record.mime || record.blob.type || '')) {
        const imageUrl = createInDbStatusObjectUrl(record.blob);
        imagePreview = '<div class="indb-detail-image"><img src="' + escapeInDbStatusHtml(imageUrl)
            + '" alt="' + title + '" decoding="async"></div>';
    }
    if (storeName === 'AI_data' && record.recordType === 'image' && /^data:image\//i.test(String(record.dataUrl || ''))) {
        imagePreview = '<div class="indb-detail-image indb-ai-image-preview"><img src="'
            + escapeInDbStatusHtml(record.dataUrl) + '" alt="' + title + '" decoding="async"></div>';
    }
    let aiContent = '';
    if (storeName === 'ai_settings' && String(record.id || '') === 'ai_settings') {
        const sharedPrompt = String(record.scholarAIPromptPack || localStorage.getItem('ss_scholar_ai_system') || (typeof window.getDefaultScholarAIPrompt === 'function' ? window.getDefaultScholarAIPrompt() : ''));
        aiContent = '<section class="indb-shared-prompt-editor"><div><strong>ScholarAI 공유 사전 프롬프트</strong><p>문체 변경·학술 번역·슬라이드 생성 규칙을 ScholarAI와 하나의 자료로 공유합니다.</p></div>'
            + '<textarea id="indb-scholar-ai-prompt-editor" readonly spellcheck="false">' + escapeInDbStatusHtml(sharedPrompt) + '</textarea>'
            + '<div class="indb-shared-prompt-actions"><button type="button" onclick="editInDbScholarAIPrompt()">수정</button><button type="button" onclick="saveInDbScholarAIPrompt()">저장</button></div>'
            + '<p id="indb-scholar-ai-prompt-status" aria-live="polite"></p></section>';
    }
    if (storeName === 'AI_data' && record.recordType === 'conversation') {
        const messages = (Array.isArray(record.messages) ? record.messages : []).filter(function (message) {
            return inDbAiMessageFilter !== 'assistant' || message.role === 'assistant';
        });
        aiContent = '<div class="indb-ai-filter" role="group" aria-label="대화 메시지 필터">'
            + '<button type="button" class="' + (inDbAiMessageFilter === 'all' ? 'is-active' : '')
            + '" onclick="setInDbAiMessageFilter(\'all\')">질문 + 답변</button>'
            + '<button type="button" class="' + (inDbAiMessageFilter === 'assistant' ? 'is-active' : '')
            + '" onclick="setInDbAiMessageFilter(\'assistant\')">답변만 보기</button></div>'
            + '<div class="indb-ai-message-list">' + (messages.length ? messages.map(function (message) {
                const assistant = message && message.role === 'assistant';
                const academicResults = !assistant && Array.isArray(message.academicSources) && message.academicSources.length
                    ? '<details class="indb-ai-academic-inline"><summary>학술검색 결과 ' + message.academicSources.length + '건</summary>'
                        + message.academicSources.map(function (source) {
                            return '<div><strong>' + escapeInDbStatusHtml(String(source.title || '(제목 없음)')) + '</strong><span>'
                                + escapeInDbStatusHtml([source.authorLabel, source.year, source.doi].filter(Boolean).join(' · ')) + '</span></div>';
                        }).join('') + '</details>' : '';
                return '<article class="indb-ai-message ' + (assistant ? 'is-assistant' : 'is-user') + '"><strong>'
                    + (assistant ? 'AI 답변' : '질문') + '</strong><div>'
                    + escapeInDbStatusHtml(String((message && message.content) || '')) + '</div>' + academicResults + '</article>';
            }).join('') : '<div class="indb-empty-state">표시할 메시지가 없습니다.</div>') + '</div>';
    } else if (storeName === 'AI_data' && record.recordType === 'academic_search') {
        const results = Array.isArray(record.results) ? record.results : [];
        aiContent = '<div class="indb-ai-academic-search"><section><strong>질문</strong><p>'
            + escapeInDbStatusHtml(String(record.question || '')) + '</p></section><section><strong>검색어</strong><p>'
            + escapeInDbStatusHtml(String(record.query || '')) + '</p></section><div class="indb-ai-academic-results">'
            + (results.length ? results.map(function (source, index) {
                const url = String(source.url || (source.doi ? 'https://doi.org/' + source.doi : ''));
                return '<article><span>' + (index + 1) + '</span><div><strong>'
                    + escapeInDbStatusHtml(String(source.title || '(제목 없음)')) + '</strong><p>'
                    + escapeInDbStatusHtml([source.authorLabel, source.year, source.journal].filter(Boolean).join(' · ')) + '</p>'
                    + (source.abstract ? '<details><summary>초록 보기</summary><div>' + escapeInDbStatusHtml(source.abstract) + '</div></details>' : '')
                    + (url ? '<a href="' + escapeInDbStatusHtml(url) + '" target="_blank" rel="noopener noreferrer">원문/DOI 열기</a>' : '')
                    + '</div></article>';
            }).join('') : '<div class="indb-empty-state">저장된 검색 결과가 없습니다.</div>') + '</div></div>';
    } else if (storeName === 'AI_data' && record.recordType === 'attachment') {
        aiContent = '<div class="indb-ai-attachment-note"><strong>AI 입력에 사용된 첨부 기록</strong><p>파일 원문은 AI 데이터 센터에 보관하지 않습니다.</p></div>';
    }
    const keys = Object.keys(record);
    const fields = keys.length ? keys.map(function (key) {
        return '<div class="indb-detail-field"><div class="indb-detail-key">' + escapeInDbStatusHtml(key)
            + '</div><div class="indb-detail-field-value">' + renderInDbStatusDetailValue(key, record[key]) + '</div></div>';
    }).join('') : '<div class="indb-empty-state">표시할 필드가 없습니다.</div>';
    const deleteControl = lockedRoot
        ? '<span class="indb-usage-badge is-used">ROOT</span>'
        : '<button type="button" class="indb-detail-delete" data-store="' + escapeInDbStatusHtml(storeName)
            + '" data-id="' + escapeInDbStatusHtml(id)
            + '" onclick="deleteInDbStatusItem(this.dataset.store,this.dataset.id)">이 항목 삭제</button>';
    return '<div class="indb-detail-content"><header class="indb-detail-header"><div class="indb-detail-heading">'
        + '<span class="indb-detail-store">' + escapeInDbStatusHtml(storeName) + '</span><h3>' + title + '</h3>'
        + '<p>' + escapeInDbStatusHtml(getInDbStatusSecondaryText(storeName, record)) + '</p></div>' + deleteControl
        + '</header>' + imagePreview + aiContent + '<div class="indb-detail-fields">' + fields + '</div></div>';
}

function editInDbScholarAIPrompt() {
    const input = document.getElementById('indb-scholar-ai-prompt-editor');
    if (!input) return;
    input.readOnly = false;
    input.focus();
}

async function saveInDbScholarAIPrompt() {
    const input = document.getElementById('indb-scholar-ai-prompt-editor');
    const status = document.getElementById('indb-scholar-ai-prompt-status');
    if (!input) return false;
    const prompt = String(input.value || '').trim();
    try {
        if (prompt) localStorage.setItem('ss_scholar_ai_system', prompt);
        else localStorage.removeItem('ss_scholar_ai_system');
        if (typeof setAiSettings === 'function') await setAiSettings({ scholarAIPromptPack: prompt });
        if (typeof notifyAiToolSettingsChanged === 'function') notifyAiToolSettingsChanged();
        const scholarInput = document.getElementById('scholar-ai-pre-prompt-text');
        if (scholarInput) scholarInput.value = prompt;
        input.readOnly = true;
        if (status) status.textContent = '저장 완료 · ScholarAI 사전 프롬프트와 공유됨';
        if (inDbStatusSnapshot) await renderInDbStatusModal();
        return true;
    } catch (error) {
        if (status) status.textContent = '저장 실패: ' + (error && error.message ? error.message : error);
        return false;
    }
}

window.editInDbScholarAIPrompt = editInDbScholarAIPrompt;
window.saveInDbScholarAIPrompt = saveInDbScholarAIPrompt;

function setInDbAiMessageFilter(filter) {
    inDbAiMessageFilter = filter === 'assistant' ? 'assistant' : 'all';
    if (inDbStatusSnapshot) renderInDbStatusBrowser(inDbStatusSnapshot);
}

function renderInDbStatusBrowser(snapshot) {
    const listEl = document.getElementById('indb-status-list');
    if (!listEl || !snapshot) return;
    releaseInDbStatusObjectUrls();
    let activeEntry = getInDbStatusEntry(snapshot, inDbStatusViewState.storeName);
    if (!activeEntry) {
        activeEntry = getInDbStatusEntry(snapshot, 'documents') || snapshot.entries[0] || null;
        inDbStatusViewState.storeName = activeEntry ? activeEntry.name : '';
        inDbStatusViewState.recordId = '';
    }
    const activeStore = activeEntry ? activeEntry.name : '';
    let activeRecord = getInDbStatusRecord(snapshot, activeStore, inDbStatusViewState.recordId);
    if (!activeRecord) inDbStatusViewState.recordId = '';

    const overview = '<div class="indb-overview-grid">'
        + '<div class="indb-stat-card"><span class="indb-stat-label">전체 레코드</span><strong class="indb-stat-value">'
            + snapshot.totalRecords + '</strong></div>'
        + '<div class="indb-stat-card"><span class="indb-stat-label">저장 이미지</span><strong class="indb-stat-value">'
            + snapshot.images.length + '</strong></div>'
        + '<div class="indb-stat-card"><span class="indb-stat-label">이미지 용량</span><strong class="indb-stat-value">'
            + escapeInDbStatusHtml(formatInDbBytes(snapshot.imageBytes)) + '</strong></div>'
        + '<div class="indb-stat-card' + (snapshot.unusedIds.size ? ' is-warning' : '')
            + '"><span class="indb-stat-label">미사용 이미지</span><strong class="indb-stat-value">'
            + snapshot.unusedIds.size + ' · ' + escapeInDbStatusHtml(formatInDbBytes(snapshot.unusedBytes)) + '</strong></div>'
        + '</div>';

    const stores = snapshot.entries.map(function (entry) {
        const label = INDB_STATUS_STORE_LABELS[entry.name] || entry.name;
        const active = entry.name === activeStore;
        return '<button type="button" class="indb-store-nav-button' + (active ? ' is-active' : '')
            + '" data-store="' + escapeInDbStatusHtml(entry.name) + '" onclick="selectInDbStatusStore(this.dataset.store)"'
            + ' aria-pressed="' + (active ? 'true' : 'false') + '"><span class="indb-store-nav-copy"><strong>'
            + escapeInDbStatusHtml(label) + '</strong><small>' + escapeInDbStatusHtml(entry.name)
            + '</small></span><span class="indb-store-count">' + entry.items.length + '</span></button>';
    }).join('');

    const records = activeEntry && activeEntry.items.length ? activeEntry.items.map(function (record) {
        const id = String(record && record.id != null ? record.id : '');
        if (!id) return '';
        const active = id === inDbStatusViewState.recordId;
        const title = escapeInDbStatusHtml(getInDbStatusPrimaryText(activeStore, record));
        const sub = escapeInDbStatusHtml(getInDbStatusSecondaryText(activeStore, record));
        const lockedRoot = activeStore === 'folders' && id === 'root';
        let thumb = '';
        if (activeStore === 'images' || (activeStore === 'AI_data' && record.recordType === 'image')) {
            const blob = record.blob instanceof Blob ? record.blob : null;
            const mime = String(record.mime || (blob && blob.type) || '');
            if (activeStore === 'AI_data' && /^data:image\//i.test(String(record.dataUrl || ''))) {
                thumb = '<span class="indb-record-thumb"><img src="' + escapeInDbStatusHtml(record.dataUrl) + '" alt="" loading="lazy" decoding="async"></span>';
            } else if (blob && /^image\//i.test(mime)) {
                const url = createInDbStatusObjectUrl(blob);
                thumb = '<span class="indb-record-thumb"><img src="' + escapeInDbStatusHtml(url) + '" alt="" loading="lazy" decoding="async"></span>';
            } else {
                thumb = '<span class="indb-record-thumb indb-record-thumb-empty">IMG</span>';
            }
        }
        const trailing = lockedRoot
            ? '<span class="indb-usage-badge is-used">ROOT</span>'
            : '<button type="button" class="indb-delete-button" data-store="' + escapeInDbStatusHtml(activeStore)
                + '" data-id="' + escapeInDbStatusHtml(id)
                + '" onclick="deleteInDbStatusItem(this.dataset.store,this.dataset.id)" aria-label="삭제: '
                + title + '" title="삭제">×</button>';
        const searchable = [title, sub, record.question, record.query, record.title, record.name]
            .concat(Array.isArray(record.messages) ? record.messages.map(function (message) { return message && message.content; }) : [])
            .concat(Array.isArray(record.results) ? record.results.map(function (source) { return source && source.title; }) : [])
            .filter(Boolean).join(' ').toLowerCase();
        return '<article class="indb-record-select-row' + (active ? ' is-active' : '') + '" data-ai-search="'
            + escapeInDbStatusHtml(searchable) + '"><button type="button"'
            + ' class="indb-record-select" data-store="' + escapeInDbStatusHtml(activeStore) + '" data-id="'
            + escapeInDbStatusHtml(id) + '" onclick="selectInDbStatusRecord(this.dataset.store,this.dataset.id)">'
            + thumb + '<span class="indb-record-copy"><span class="indb-record-title">' + title
            + '</span><span class="indb-record-meta">' + sub + '</span></span></button>' + trailing + '</article>';
    }).join('') : '<div class="indb-empty-state">저장된 항목이 없습니다.</div>';
    const activeLabel = activeEntry ? (INDB_STATUS_STORE_LABELS[activeStore] || activeStore) : '항목';
    const fmaButton = document.getElementById('btn-open-indb-images-fma');
    if (fmaButton && activeStore === 'AI_data') {
        const aiImageCount = activeEntry.items.filter(function (item) { return item && item.recordType === 'image' && item.dataUrl; }).length;
        fmaButton.disabled = aiImageCount === 0;
        fmaButton.textContent = aiImageCount ? 'FMA AI 이미지 ' + aiImageCount : 'FMA AI 이미지';
    } else if (fmaButton) {
        fmaButton.disabled = snapshot.images.length === 0;
        fmaButton.textContent = snapshot.images.length ? 'FMA 전체보기 ' + snapshot.images.length : 'FMA 전체보기';
    }

    listEl.innerHTML = overview + '<div class="indb-browser-grid">'
        + '<nav class="indb-store-sidebar" aria-label="inDB 저장소 분류"><div class="indb-pane-title"><strong>저장소</strong><span>분류</span></div>'
        + '<div class="indb-store-nav-list">' + stores + '</div></nav>'
        + '<section class="indb-record-pane"><div class="indb-pane-title"><strong>' + escapeInDbStatusHtml(activeLabel)
        + '</strong><span>' + (activeEntry ? activeEntry.items.length : 0) + '개 항목</span></div>'
        + (activeStore === 'AI_data' ? '<div class="indb-ai-search-box"><input type="search" placeholder="질문·답변·검색어·논문 제목 검색" oninput="filterInDbAiRecords(this.value)" aria-label="AI 사용 기록 검색"></div>' : '')
        + '<div class="indb-record-scroll">'
        + records + '</div></section>'
        + '<aside class="indb-detail-pane" aria-label="선택한 inDB 항목 세부내용"><div class="indb-pane-title"><strong>세부내용</strong><span>항목 선택</span></div>'
        + '<div class="indb-detail-scroll">' + renderInDbStatusDetail(snapshot, activeStore, activeRecord) + '</div></aside>'
        + '</div>';
}

function selectInDbStatusStore(storeName) {
    if (!inDbStatusSnapshot || !getInDbStatusEntry(inDbStatusSnapshot, storeName)) return;
    inDbStatusViewState = { storeName: String(storeName), recordId: '' };
    renderInDbStatusBrowser(inDbStatusSnapshot);
}

function selectInDbStatusRecord(storeName, recordId) {
    if (!inDbStatusSnapshot || !getInDbStatusRecord(inDbStatusSnapshot, storeName, recordId)) return;
    inDbStatusViewState = { storeName: String(storeName), recordId: String(recordId) };
    renderInDbStatusBrowser(inDbStatusSnapshot);
}

function filterInDbAiRecords(value) {
    const query = String(value || '').trim().toLowerCase();
    document.querySelectorAll('#indb-status-list .indb-record-select-row[data-ai-search]').forEach(function (row) {
        row.hidden = !!query && !String(row.dataset.aiSearch || '').includes(query);
    });
}

function openActiveInDbImagesInFmaViewer() {
    if (inDbStatusViewState.storeName !== 'AI_data') return openAllInDbImagesInFmaViewer();
    const entry = inDbStatusSnapshot && getInDbStatusEntry(inDbStatusSnapshot, 'AI_data');
    const records = entry ? entry.items.filter(function (item) {
        return item && item.recordType === 'image' && /^data:image\//i.test(String(item.dataUrl || ''));
    }) : [];
    if (!records.length) return showToast('AI 데이터 센터에 이미지가 없습니다.');
    if (!window.AIChatBridge || typeof window.AIChatBridge.openAIDataImagesInFma !== 'function') {
        return showToast('FMA Viewer 연결 모듈이 준비되지 않았습니다.');
    }
    window.AIChatBridge.openAIDataImagesInFma(records, records[0].name);
}

async function renderInDbStatusModal() {
    const listEl = document.getElementById('indb-status-list');
    if (!listEl) return;
    releaseInDbStatusObjectUrls();
    if (!db) {
        listEl.innerHTML = '<div class="indb-empty-state">IndexedDB가 아직 준비되지 않았습니다.</div>';
        return;
    }

    listEl.innerHTML = '<div class="indb-loading-state">inDB 저장 상태와 이미지 사용 여부를 분석하는 중입니다…</div>';
    const snapshot = await createInDbStatusSnapshot();
    inDbStatusSnapshot = snapshot;
    if (!snapshot.stores.length) {
        listEl.innerHTML = '<div class="indb-empty-state">표시할 inDB 저장소가 없습니다.</div>';
        return;
    }
    renderInDbStatusBrowser(snapshot);

    const cleanButton = document.getElementById('btn-clean-unused-indb-images');
    if (cleanButton) {
        cleanButton.disabled = snapshot.unusedIds.size === 0;
        cleanButton.textContent = snapshot.unusedIds.size
            ? '미사용 이미지 정리 ' + snapshot.unusedIds.size
            : '미사용 이미지 없음';
    }
    const fmaButton = document.getElementById('btn-open-indb-images-fma');
    if (fmaButton) {
        if (inDbStatusViewState.storeName === 'AI_data') {
            const aiEntry = getInDbStatusEntry(snapshot, 'AI_data');
            const aiImageCount = aiEntry ? aiEntry.items.filter(function (item) {
                return item && item.recordType === 'image' && item.dataUrl;
            }).length : 0;
            fmaButton.disabled = aiImageCount === 0;
            fmaButton.textContent = aiImageCount ? 'FMA AI 이미지 ' + aiImageCount : 'FMA AI 이미지';
        } else {
            fmaButton.disabled = snapshot.images.length === 0;
            fmaButton.textContent = snapshot.images.length
                ? 'FMA 전체보기 ' + snapshot.images.length
                : 'FMA 전체보기';
        }
    }
    const subtitle = document.getElementById('indb-status-subtitle');
    if (subtitle) {
        subtitle.textContent = 'MarkdownProDB · ' + snapshot.stores.length + '개 저장소 · 이미지 '
            + snapshot.images.length + '개 (' + formatInDbBytes(snapshot.imageBytes) + ')';
    }
}

async function openInDbStatusModal(initialStoreName) {
    ensureInDbStatusUi();
    const modal = document.getElementById('indb-status-modal');
    if (!modal) return;
    // Keep inDB modal above settings modal when opened from Settings.
    modal.style.zIndex = '2147483646';
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    inDbStatusViewState = { storeName: String(initialStoreName || 'documents'), recordId: '' };
    inDbStatusSnapshot = null;
    try {
        const panel = modal.firstElementChild;
        if (panel && typeof panel.focus === 'function') {
            panel.setAttribute('tabindex', '-1');
            panel.focus();
        }
    } catch (_) {}
    try {
        await syncKnownFeatureDataToInDb();
    } catch (error) {
        console.warn('Feature data status sync failed:', error);
        showToast('일부 앱 데이터 동기화에 실패했습니다.');
    }
    await renderInDbStatusModal();
}

function closeInDbStatusModal() {
    const modal = document.getElementById('indb-status-modal');
    if (!modal) return;
    closeUnusedInDbImageCleaner();
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    inDbStatusSnapshot = null;
    releaseInDbStatusObjectUrls();
}

async function deleteInDbStatusItem(storeName, id) {
    const store = String(storeName || '').trim();
    const itemId = String(id || '').trim();
    if (!db || !store || !itemId) return;
    if (store === 'folders' && itemId === 'root') {
        showToast('ROOT folder cannot be deleted.');
        return;
    }

    let deletePrompt = '이 항목을 삭제할까요?\n[' + store + '] ' + itemId;
    if (store === 'images') {
        try {
            const snapshot = await createInDbStatusSnapshot();
            if (snapshot.referencedIds.has(itemId)) {
                deletePrompt = '이 이미지는 현재 편집 문서 또는 inDB 저장 문서에서 사용 중입니다.\n'
                    + '삭제하면 internal:// 이미지 링크가 깨질 수 있습니다. 그래도 삭제할까요?\n\n'
                    + itemId;
            }
        } catch (error) {
            console.warn('Failed to inspect image references before delete:', error);
        }
    }
    const first = window.confirm(deletePrompt);
    if (!first) return;
    const second = window.confirm('한 번 더 확인합니다.\n삭제한 데이터는 복구할 수 없습니다.');
    if (!second) return;

    await new Promise(function (resolve, reject) {
        try {
            const tx = db.transaction(store, 'readwrite');
            tx.objectStore(store).delete(itemId);
            tx.oncomplete = resolve;
            tx.onerror = function () { reject(tx.error || new Error('Failed to delete item.')); };
        } catch (e) {
            reject(e);
        }
    }).catch(function (e) {
        showToast('Delete failed: ' + (e && e.message ? e.message : e));
    });

    if (store === 'documents' && String(currentDbDocId || '') === itemId) {
        clearCurrentDocumentRef();
        setCurrentDocumentInfo('untitled.md', null);
        updateContent('');
        markPersistedState();
    }
    if (store === 'fonts' && window.TextStyleTool && typeof window.TextStyleTool.refreshFromInDb === 'function') {
        try { await window.TextStyleTool.refreshFromInDb(); } catch (error) {
            console.warn('Custom font list refresh failed:', error);
        }
    }

    await ensureRootFolder();
    renderDBList();
    await renderInDbStatusModal();
    showToast('Deleted: [' + store + '] ' + itemId);
}

async function deleteAllInDbStatusItems() {
    if (!db) return;
    const first = window.confirm('Delete all inDB items?');
    if (!first) return;
    const second = window.confirm('Are you sure again?\nAll records will be removed (ROOT folder is kept).');
    if (!second) return;

    const stores = getInDbStatusStores();
    for (let i = 0; i < stores.length; i++) {
        const storeName = stores[i];
        if (storeName === 'folders') {
            const folders = await readAllInDbStoreItems('folders');
            await new Promise(function (resolve) {
                try {
                    const tx = db.transaction('folders', 'readwrite');
                    const os = tx.objectStore('folders');
                    folders.forEach(function (f) {
                        const id = String((f && f.id) || '').trim();
                        if (id && id !== 'root') os.delete(id);
                    });
                    tx.oncomplete = resolve;
                    tx.onerror = resolve;
                } catch (e) {
                    resolve();
                }
            });
        } else {
            await new Promise(function (resolve) {
                try {
                    const tx = db.transaction(storeName, 'readwrite');
                    tx.objectStore(storeName).clear();
                    tx.oncomplete = resolve;
                    tx.onerror = resolve;
                } catch (e) {
                    resolve();
                }
            });
        }
    }

    if (window.TextStyleTool && typeof window.TextStyleTool.refreshFromInDb === 'function') {
        try { await window.TextStyleTool.refreshFromInDb(); } catch (error) {
            console.warn('Custom font list refresh after clear failed:', error);
        }
    }

    clearCurrentDocumentRef();
    setCurrentDocumentInfo('untitled.md', null);
    updateContent('');
    markPersistedState();
    await ensureRootFolder();
    renderDBList();
    await renderInDbStatusModal();
    showToast('All inDB items deleted.');
}


const INDB_BACKUP_PREFIX_SETTINGS_HTML = `
<!-- Full backup filename prefix (shortcuts 아래, 기본 접힘) -->
                <div id="indb-backup-prefix-settings-card"
                    class="border border-slate-200 dark:border-slate-700 rounded-lg p-4 bg-slate-50 dark:bg-slate-900/50">
                    <div class="flex items-center justify-between gap-2 mb-3 border-b border-slate-200 dark:border-slate-700 pb-2">
                        <h4 class="text-sm font-bold text-slate-700 dark:text-slate-300">전체 파일 prefix</h4>
                    </div>
                    <div class="space-y-3">
                        <label for="indb-backup-prefix-input" class="block text-xs font-semibold text-slate-600 dark:text-slate-400">
                            전체 백업·설정 파일명 prefix
                            <input type="text" id="indb-backup-prefix-input" maxlength="40" value="mdpro"
                                placeholder="mdpro" spellcheck="false" autocomplete="off"
                                onkeydown="if(event.key==='Enter'){event.preventDefault();saveFileDownloadPrefixSetting();}"
                                class="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                        </label>
                        <p class="text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">
                            예: <code id="indb-backup-prefix-preview">mdpro-indb-folders-YYYYMMDD-HHMMSS.zip</code>
                        </p>
                        <div class="flex items-center justify-end gap-2">
                            <button type="button" onclick="resetFileDownloadPrefixSetting()"
                                class="rounded border border-slate-300 dark:border-slate-600 px-2.5 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800">기본값</button>
                            <button type="button" onclick="saveFileDownloadPrefixSetting()"
                                class="rounded bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700">저장</button>
                        </div>
                    </div>
                </div>
`;

const INDB_STATUS_MODALS_HTML = `
<!-- inDB Status Modal -->
    <div id="indb-status-modal" class="indb-status-backdrop fixed inset-0 hidden items-center justify-center z-[2147483646] no-print" onclick="if(event.target===this) closeInDbStatusModal()">
        <section id="indb-status-panel" class="indb-status-panel" role="dialog" aria-modal="true" aria-labelledby="indb-status-title">
            <header class="indb-status-header">
                <div class="indb-status-mark" aria-hidden="true">DB</div>
                <div class="indb-status-heading">
                    <h2 id="indb-status-title">inDB 저장소</h2>
                    <p id="indb-status-subtitle">브라우저 내부 데이터와 이미지 사용 상태를 확인합니다.</p>
                </div>
                <button type="button" class="indb-icon-button" onclick="renderInDbStatusModal()" title="새로고침" aria-label="inDB 새로고침">↻</button>
                <button type="button" class="indb-icon-button" onclick="closeInDbStatusModal()" title="닫기" aria-label="inDB 창 닫기">×</button>
            </header>
            <div id="indb-status-list" class="indb-status-list" aria-live="polite"></div>
            <footer class="indb-status-footer">
                <div class="indb-footer-group">
                    <button type="button" id="btn-open-indb-images-fma" class="indb-action-button indb-action-fma" onclick="openActiveInDbImagesInFmaViewer()">FMA 전체보기</button>
                    <button type="button" id="btn-clean-unused-indb-images" class="indb-action-button indb-action-clean" onclick="deleteUnusedInDbImages()">미사용 이미지 정리</button>
                </div>
                <div class="indb-footer-group indb-footer-group-end">
                    <button type="button" id="btn-download-all-indb" class="indb-action-button indb-action-backup" onclick="downloadAllInDbAsZip()">전체 백업</button>
                    <button type="button" class="indb-action-button indb-action-danger" onclick="deleteAllInDbStatusItems()">전체 삭제</button>
                    <button type="button" class="indb-action-button indb-action-neutral" onclick="closeInDbStatusModal()">닫기</button>
                </div>
            </footer>
        </section>
    </div>

    <!-- Unused inDB image selection cleaner -->
    <div id="indb-unused-image-modal" class="indb-unused-backdrop fixed inset-0 hidden items-center justify-center z-[2147483647] no-print"
        onclick="if(event.target===this) closeUnusedInDbImageCleaner()">
        <section class="indb-unused-panel" role="dialog" aria-modal="true" aria-labelledby="indb-unused-title">
            <header class="indb-unused-header">
                <div class="indb-status-mark" aria-hidden="true">IMG</div>
                <div class="indb-status-heading">
                    <h2 id="indb-unused-title">미사용 이미지 선택 정리</h2>
                    <p id="indb-unused-subtitle">삭제할 이미지를 직접 선택하세요.</p>
                </div>
                <button type="button" class="indb-icon-button" onclick="closeUnusedInDbImageCleaner()" title="닫기" aria-label="미사용 이미지 선택 창 닫기">×</button>
            </header>
            <div class="indb-unused-toolbar">
                <div class="indb-footer-group">
                    <button type="button" class="indb-action-button indb-action-fma" onclick="setAllUnusedInDbImagesSelected(true)">전체 선택</button>
                    <button type="button" class="indb-action-button indb-action-neutral" onclick="setAllUnusedInDbImagesSelected(false)">전체 해제</button>
                </div>
                <strong id="indb-unused-selection-summary">0개 선택 · 0 B</strong>
            </div>
            <div id="indb-unused-image-grid" class="indb-unused-grid" aria-live="polite"></div>
            <footer class="indb-unused-footer">
                <span>선택한 이미지만 삭제됩니다.</span>
                <div class="indb-footer-group">
                    <button type="button" class="indb-action-button indb-action-neutral" onclick="closeUnusedInDbImageCleaner()">취소</button>
                    <button type="button" id="btn-delete-selected-unused-images" class="indb-action-button indb-action-danger"
                        onclick="deleteSelectedUnusedInDbImages()" disabled>선택 삭제 0</button>
                </div>
            </footer>
        </section>
    </div>
`;

const INDB_SETTINGS_CONTROL_HTML = `
<section id="indb-storage-settings-card" class="rounded-lg border border-cyan-200 dark:border-cyan-900 bg-cyan-50/60 dark:bg-cyan-950/20 p-3 space-y-3">
    <label class="inline-flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200 cursor-pointer select-none">
        <input type="checkbox" id="indb-storage-enabled" onchange="onInDbStorageSettingChange(this.checked)" checked
            class="rounded border-slate-300 dark:border-slate-600 text-cyan-600 focus:ring-cyan-500">
        <span>inDB 사용</span>
    </label>
    <p id="indb-storage-setting-help" class="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">새로고침 후에도 inDB를 내부 저장소로 사용합니다.</p>
    <button type="button" id="btn-open-indb-status" onclick="openInDbStatusModal()"
        class="w-full px-4 py-2 border-2 border-cyan-700 dark:border-cyan-600 rounded-md text-sm font-semibold text-cyan-800 dark:text-cyan-300 bg-white dark:bg-slate-800 hover:bg-cyan-50 dark:hover:bg-cyan-950/30 disabled:opacity-40 disabled:cursor-not-allowed">inDB 저장소 보기</button>
</section>`;
const INDB_SETTINGS_FOOTER_BUTTON_HTML = `
<button type="button" id="btn-footer-open-indb-status" onclick="openInDbStatusModal()"
    class="settings-footer-action border border-slate-500 rounded-md text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
    title="inDB" aria-label="inDB">
    <i data-lucide="database" class="h-4 w-4" aria-hidden="true"></i>
    <span class="settings-action-label">inDB</span>
</button>`;

function ensureInDbStatusUi() {
    if (!document.getElementById('indb-storage-settings-card')) {
        const githubSlot = document.getElementById('github-settings-slot');
        const settingsBody = document.getElementById('settings-modal-body');
        if (githubSlot && typeof githubSlot.insertAdjacentHTML === 'function') {
            githubSlot.insertAdjacentHTML('beforebegin', INDB_SETTINGS_CONTROL_HTML);
        } else if (settingsBody && typeof settingsBody.insertAdjacentHTML === 'function') {
            settingsBody.insertAdjacentHTML('beforeend', INDB_SETTINGS_CONTROL_HTML);
        }
    }
    if (!document.getElementById('btn-footer-open-indb-status')) {
        const sqliteFooterButton = document.getElementById('btn-footer-open-sqlite-explorer');
        if (sqliteFooterButton && typeof sqliteFooterButton.insertAdjacentHTML === 'function') {
            sqliteFooterButton.insertAdjacentHTML('beforebegin', INDB_SETTINGS_FOOTER_BUTTON_HTML);
        }
    }
    if (!document.getElementById('indb-backup-prefix-settings-card')) {
        const shortcuts = document.getElementById('shortcuts-settings-card');
        const settingsBody = document.getElementById('settings-modal-body');
        if (shortcuts && typeof shortcuts.insertAdjacentHTML === 'function') {
            shortcuts.insertAdjacentHTML('afterend', INDB_BACKUP_PREFIX_SETTINGS_HTML);
        } else if (settingsBody && typeof settingsBody.insertAdjacentHTML === 'function') {
            settingsBody.insertAdjacentHTML('beforeend', INDB_BACKUP_PREFIX_SETTINGS_HTML);
        }
    }
    if (!document.getElementById('indb-status-modal')) {
        document.body.insertAdjacentHTML('beforeend', INDB_STATUS_MODALS_HTML);
    }
    syncInDbStorageSettingsUi();
}

window.openInDbStatusModal = openInDbStatusModal;
window.closeInDbStatusModal = closeInDbStatusModal;
window.renderInDbStatusModal = renderInDbStatusModal;
window.selectInDbStatusStore = selectInDbStatusStore;
window.selectInDbStatusRecord = selectInDbStatusRecord;
window.setInDbAiMessageFilter = setInDbAiMessageFilter;
window.filterInDbAiRecords = filterInDbAiRecords;
window.deleteInDbStatusItem = deleteInDbStatusItem;
window.deleteUnusedInDbImages = deleteUnusedInDbImages;
window.updateUnusedInDbImageSelection = updateUnusedInDbImageSelection;
window.setAllUnusedInDbImagesSelected = setAllUnusedInDbImagesSelected;
window.closeUnusedInDbImageCleaner = closeUnusedInDbImageCleaner;
window.deleteSelectedUnusedInDbImages = deleteSelectedUnusedInDbImages;
window.openAllInDbImagesInFmaViewer = openAllInDbImagesInFmaViewer;
window.openActiveInDbImagesInFmaViewer = openActiveInDbImagesInFmaViewer;
window.deleteAllInDbStatusItems = deleteAllInDbStatusItems;
window.downloadAllInDbAsZip = downloadAllInDbAsZip;
window.saveFeatureRecordToInDb = saveFeatureRecordToInDb;
window.upsertFeatureStoreRecordsInDb = upsertFeatureStoreRecordsInDb;
window.replaceFeatureStoreRecordsInDb = replaceFeatureStoreRecordsInDb;
window.deleteFeatureRecordFromInDb = deleteFeatureRecordFromInDb;
window.syncKnownFeatureDataToInDb = syncKnownFeatureDataToInDb;
window.isInDbStorageEnabled = isInDbStorageEnabled;
window.setInDbStorageEnabled = setInDbStorageEnabled;
window.onInDbStorageSettingChange = onInDbStorageSettingChange;
window.syncInDbStorageSettingsUi = syncInDbStorageSettingsUi;
window.InDbStorage = Object.freeze({
    name: DB_NAME,
    version: DB_VERSION,
    init: initDB,
    getDatabase: function () { return db || null; },
    isEnabled: isInDbStorageEnabled,
    setEnabled: setInDbStorageEnabled,
    saveCurrentDocument: saveCurrentToInDbAuto,
    ensureSettingsUi: ensureInDbStatusUi,
    openStatus: openInDbStatusModal,
    refreshStatus: renderInDbStatusModal,
    syncKnownFeatureData: syncKnownFeatureDataToInDb
});

ensureInDbStatusUi();
