(function (root) {
    'use strict';

    const SOURCE_DATABASE = 'MarkdownProDB';

    function requestAsPromise(request) {
        return new Promise(function (resolve, reject) {
            request.onsuccess = function () { resolve(request.result); };
            request.onerror = function () { reject(request.error || new Error('IndexedDB request failed.')); };
        });
    }

    function transactionDone(transaction) {
        return new Promise(function (resolve, reject) {
            transaction.oncomplete = function () { resolve(); };
            transaction.onerror = function () { reject(transaction.error || new Error('IndexedDB transaction failed.')); };
            transaction.onabort = function () { reject(transaction.error || new Error('IndexedDB transaction was aborted.')); };
        });
    }

    function normalizeTime(value) {
        if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
        if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
        if (typeof value === 'string' && value.trim()) {
            const parsed = Date.parse(value);
            return Number.isFinite(parsed) ? parsed : null;
        }
        return null;
    }

    function normalizeFolder(record) {
        const source = record && typeof record === 'object' ? record : {};
        const id = String(source.id || '').trim();
        return {
            id: id,
            name: id === 'root' ? 'ROOT' : String(source.name || '').trim(),
            parentId: id === 'root' ? null : String(source.parentId || 'root').trim(),
            sortOrder: Number.isFinite(Number(source.sortOrder)) ? Math.trunc(Number(source.sortOrder)) : 0,
            createdAt: normalizeTime(source.createdAt),
            updatedAt: normalizeTime(source.updatedAt)
        };
    }

    function normalizeDocument(record) {
        const source = record && typeof record === 'object' ? record : {};
        return {
            id: String(source.id || '').trim(),
            title: String(source.title || '').trim(),
            content: String(source.content == null ? '' : source.content),
            folderId: String(source.folderId || 'root').trim(),
            createdAt: normalizeTime(source.createdAt),
            updatedAt: normalizeTime(source.updatedAt)
        };
    }

    async function sha256Text(value) {
        const cryptoApi = root.crypto;
        if (!cryptoApi || !cryptoApi.subtle || typeof TextEncoder !== 'function') {
            const error = new Error('이관 미리보기에 필요한 SHA-256 기능을 사용할 수 없습니다. 로컬 앱 주소로 열어 주세요.');
            error.code = 'BROWSER_CHECKSUM_UNAVAILABLE';
            throw error;
        }
        const bytes = new TextEncoder().encode(String(value == null ? '' : value));
        const digest = await cryptoApi.subtle.digest('SHA-256', bytes);
        return Array.from(new Uint8Array(digest)).map(function (byte) {
            return byte.toString(16).padStart(2, '0');
        }).join('');
    }

    async function buildBatchFromRecords(records, version) {
        const folders = (Array.isArray(records && records.folders) ? records.folders : []).map(normalizeFolder);
        const documents = [];
        const sourceDocuments = Array.isArray(records && records.documents) ? records.documents : [];
        for (let index = 0; index < sourceDocuments.length; index++) {
            const documentRecord = normalizeDocument(sourceDocuments[index]);
            documentRecord.checksum = await sha256Text(documentRecord.content);
            documents.push(documentRecord);
        }
        return {
            source: { database: SOURCE_DATABASE, version: Number(version) || 0 },
            folders: folders,
            documents: documents
        };
    }

    function openSourceDatabase() {
        return new Promise(function (resolve, reject) {
            if (!root.indexedDB || typeof root.indexedDB.open !== 'function') {
                reject(new Error('IndexedDB를 사용할 수 없습니다.'));
                return;
            }
            const request = root.indexedDB.open(SOURCE_DATABASE);
            let createdDuringOpen = false;
            request.onupgradeneeded = function () { createdDuringOpen = true; };
            request.onsuccess = function () {
                if (createdDuringOpen) {
                    request.result.close();
                    const error = new Error('기존 MarkdownProDB를 찾을 수 없습니다.');
                    error.code = 'SOURCE_DATABASE_NOT_FOUND';
                    reject(error);
                    return;
                }
                resolve(request.result);
            };
            request.onerror = function () { reject(request.error || new Error('MarkdownProDB를 열 수 없습니다.')); };
        });
    }

    async function readSourceBatch() {
        const database = await openSourceDatabase();
        try {
            const required = ['folders', 'documents'];
            const missing = required.filter(function (name) { return !database.objectStoreNames.contains(name); });
            if (missing.length) {
                const error = new Error('IndexedDB 저장소가 없습니다: ' + missing.join(', '));
                error.code = 'SOURCE_STORE_NOT_FOUND';
                throw error;
            }
            const transaction = database.transaction(required, 'readonly');
            const foldersRequest = transaction.objectStore('folders').getAll();
            const documentsRequest = transaction.objectStore('documents').getAll();
            const results = await Promise.all([
                requestAsPromise(foldersRequest),
                requestAsPromise(documentsRequest),
                transactionDone(transaction)
            ]);
            return await buildBatchFromRecords({ folders: results[0], documents: results[1] }, database.version);
        } finally {
            database.close();
        }
    }

    async function preview() {
        if (!root.MDPStorage || typeof root.MDPStorage.previewIndexedDbMigration !== 'function') {
            throw new Error('SQLite 이관 미리보기 서비스가 준비되지 않았습니다.');
        }
        const batch = await readSourceBatch();
        return root.MDPStorage.previewIndexedDbMigration(batch);
    }

    root.MDPIndexedDbMigration = {
        readSourceBatch: readSourceBatch,
        buildBatchFromRecords: buildBatchFromRecords,
        preview: preview,
        normalizeFolder: normalizeFolder,
        normalizeDocument: normalizeDocument
    };
})(typeof window !== 'undefined' ? window : globalThis);
