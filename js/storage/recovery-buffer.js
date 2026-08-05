(function (root) {
    'use strict';

    const DB_NAME = 'mdpro-working-buffer';
    const DB_VERSION = 1;
    const DRAFT_STORE = 'document_drafts';
    const PENDING_STORE = 'pending_operations';

    function waitForRequest(request) {
        return new Promise(function (resolve, reject) {
            request.onsuccess = function () { resolve(request.result); };
            request.onerror = function () {
                reject(request.error || new Error('Recovery IndexedDB request failed.'));
            };
        });
    }

    function waitForTransaction(transaction) {
        return new Promise(function (resolve, reject) {
            transaction.oncomplete = function () { resolve(); };
            transaction.onerror = function () {
                reject(transaction.error || new Error('Recovery IndexedDB transaction failed.'));
            };
            transaction.onabort = function () {
                reject(transaction.error || new Error('Recovery IndexedDB transaction aborted.'));
            };
        });
    }

    async function sha256(value) {
        if (!root.crypto || !root.crypto.subtle || typeof root.TextEncoder !== 'function') {
            throw new Error('SHA-256 is unavailable in this browser.');
        }
        const bytes = new root.TextEncoder().encode(String(value || ''));
        const digest = await root.crypto.subtle.digest('SHA-256', bytes);
        return Array.from(new Uint8Array(digest)).map(function (byte) {
            return byte.toString(16).padStart(2, '0');
        }).join('');
    }

    class RecoveryBuffer {
        constructor(options) {
            const config = options || {};
            this.indexedDB = config.indexedDBImpl || root.indexedDB;
            this.dbName = String(config.dbName || DB_NAME);
            this.dbPromise = null;
            if (!this.indexedDB || typeof this.indexedDB.open !== 'function') {
                throw new TypeError('RecoveryBuffer requires IndexedDB.');
            }
        }

        initialize() {
            if (this.dbPromise) return this.dbPromise;
            this.dbPromise = new Promise((resolve, reject) => {
                const request = this.indexedDB.open(this.dbName, DB_VERSION);
                request.onupgradeneeded = function () {
                    const database = request.result;
                    if (!database.objectStoreNames.contains(DRAFT_STORE)) {
                        const drafts = database.createObjectStore(DRAFT_STORE, { keyPath: 'documentId' });
                        drafts.createIndex('savedAt', 'savedAt', { unique: false });
                    }
                    if (!database.objectStoreNames.contains(PENDING_STORE)) {
                        const pending = database.createObjectStore(PENDING_STORE, { keyPath: 'id' });
                        pending.createIndex('entityId', 'entityId', { unique: false });
                        pending.createIndex('createdAt', 'createdAt', { unique: false });
                    }
                };
                request.onsuccess = function () { resolve(request.result); };
                request.onerror = function () {
                    reject(request.error || new Error('Recovery IndexedDB could not be opened.'));
                };
                request.onblocked = function () {
                    reject(new Error('Recovery IndexedDB upgrade is blocked.'));
                };
            });
            return this.dbPromise;
        }

        async _get(storeName, key) {
            const database = await this.initialize();
            return waitForRequest(database.transaction(storeName, 'readonly').objectStore(storeName).get(key));
        }

        async _getAll(storeName) {
            const database = await this.initialize();
            const result = await waitForRequest(
                database.transaction(storeName, 'readonly').objectStore(storeName).getAll()
            );
            return Array.isArray(result) ? result : [];
        }

        async _put(storeName, record) {
            const database = await this.initialize();
            const transaction = database.transaction(storeName, 'readwrite');
            transaction.objectStore(storeName).put(record);
            await waitForTransaction(transaction);
            return record;
        }

        async _delete(storeName, key) {
            const database = await this.initialize();
            const transaction = database.transaction(storeName, 'readwrite');
            transaction.objectStore(storeName).delete(key);
            await waitForTransaction(transaction);
            return true;
        }

        async saveDraft(input) {
            const draft = input || {};
            const documentId = String(draft.documentId || '').trim();
            if (!documentId) throw new Error('Recovery draft documentId is required.');
            const content = String(draft.content == null ? '' : draft.content);
            const savedAt = Number(draft.savedAt) || Date.now();
            return this._put(DRAFT_STORE, {
                documentId: documentId,
                workspaceId: String(draft.workspaceId || 'workspace_default'),
                storageMode: draft.storageMode === 'sqlite' ? 'sqlite' : 'indb',
                title: String(draft.title || 'Untitled'),
                content: content,
                baseVersion: Number(draft.baseVersion) || null,
                checksum: String(draft.checksum || await sha256(content)),
                cursorPosition: Math.max(0, Number(draft.cursorPosition) || 0),
                scrollPosition: Math.max(0, Math.min(1, Number(draft.scrollPosition) || 0)),
                savedAt: savedAt,
                dirty: draft.dirty !== false
            });
        }

        getDraft(documentId) {
            return this._get(DRAFT_STORE, String(documentId || ''));
        }

        async listDrafts() {
            const drafts = await this._getAll(DRAFT_STORE);
            return drafts.sort(function (a, b) { return Number(b.savedAt || 0) - Number(a.savedAt || 0); });
        }

        deleteDraft(documentId) {
            return this._delete(DRAFT_STORE, String(documentId || ''));
        }

        async enqueueOperation(input) {
            const operation = input || {};
            const entityId = String(operation.entityId || '').trim();
            if (!entityId) throw new Error('Pending operation entityId is required.');
            const operationType = String(operation.operationType || 'UPDATE').toUpperCase();
            const entityType = String(operation.entityType || 'document');
            const id = String(operation.id || (entityType + ':' + operationType.toLowerCase() + ':' + entityId));
            const existing = await this._get(PENDING_STORE, id);
            const now = Date.now();
            const record = {
                id: id,
                operationType: operationType,
                entityType: entityType,
                entityId: entityId,
                expectedVersion: Number(operation.expectedVersion) || null,
                payload: operation.payload && typeof operation.payload === 'object' ? operation.payload : {},
                retryCount: existing ? Number(existing.retryCount || 0) : Number(operation.retryCount || 0),
                createdAt: existing ? Number(existing.createdAt || now) : Number(operation.createdAt || now),
                updatedAt: now,
                lastAttemptAt: Number(operation.lastAttemptAt) || (existing && existing.lastAttemptAt) || null,
                errorCode: String(operation.errorCode || (existing && existing.errorCode) || ''),
                error: String(operation.error || (existing && existing.error) || '')
            };
            return this._put(PENDING_STORE, record);
        }

        getPendingOperation(id) {
            return this._get(PENDING_STORE, String(id || ''));
        }

        async listPendingOperations(limit) {
            const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 500));
            const operations = await this._getAll(PENDING_STORE);
            return operations
                .sort(function (a, b) { return Number(a.createdAt || 0) - Number(b.createdAt || 0); })
                .slice(0, safeLimit);
        }

        async markAttempt(id, error) {
            const current = await this.getPendingOperation(id);
            if (!current) return null;
            const next = {
                ...current,
                retryCount: Number(current.retryCount || 0) + 1,
                lastAttemptAt: Date.now(),
                errorCode: String(error && error.code ? error.code : ''),
                error: String(error && error.message ? error.message : error || '')
            };
            return this._put(PENDING_STORE, next);
        }

        deletePendingOperation(id) {
            return this._delete(PENDING_STORE, String(id || ''));
        }

        async clearDocument(documentId) {
            const entityId = String(documentId || '');
            const pending = await this.listPendingOperations(500);
            await this.deleteDraft(entityId);
            const matching = pending.filter(function (operation) { return operation.entityId === entityId; });
            for (let i = 0; i < matching.length; i++) {
                await this.deletePendingOperation(matching[i].id);
            }
            return true;
        }

        async getStatus() {
            const results = await Promise.all([this.listDrafts(), this.listPendingOperations(500)]);
            return { draftCount: results[0].length, pendingCount: results[1].length };
        }
    }

    root.MDPRecoveryBuffer = RecoveryBuffer;
    root.MDPRecoverySha256 = sha256;
})(typeof window !== 'undefined' ? window : globalThis);
