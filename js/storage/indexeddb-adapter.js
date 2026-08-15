(function (root) {
    'use strict';

    function asPromise(request) {
        return new Promise(function (resolve, reject) {
            request.onsuccess = function () { resolve(request.result); };
            request.onerror = function () { reject(request.error || new Error('IndexedDB request failed.')); };
        });
    }

    function waitForTransaction(transaction) {
        return new Promise(function (resolve, reject) {
            transaction.oncomplete = function () { resolve(); };
            transaction.onerror = function () {
                reject(transaction.error || new Error('IndexedDB transaction failed.'));
            };
            transaction.onabort = function () {
                reject(transaction.error || new Error('IndexedDB transaction was aborted.'));
            };
        });
    }

    class IndexedDbAdapter {
        constructor(options) {
            const config = options || {};
            if (typeof config.getDb !== 'function') {
                throw new TypeError('IndexedDbAdapter requires getDb().');
            }
            this.kind = 'indb';
            this.backend = 'indb';
            this.getDb = config.getDb;
        }

        _requireDb() {
            const database = this.getDb();
            if (!database) throw new Error('IndexedDB is not ready.');
            return database;
        }

        _requireWriteEnabled() {
            if (typeof root.isInDbStorageEnabled === 'function' && !root.isInDbStorageEnabled()) {
                throw new Error('설정에서 inDB 사용을 먼저 켜세요.');
            }
        }

        async listDocuments() {
            const db = this._requireDb();
            return (await asPromise(db.transaction('documents', 'readonly').objectStore('documents').getAll())) || [];
        }

        async searchDocuments(query, options) {
            const config = options || {};
            const normalizedQuery = String(query || '').trim().toLowerCase();
            if (!normalizedQuery) return [];
            const safeLimit = Math.max(1, Math.min(Number(config.limit) || 200, 500));
            const documents = await this.listDocuments();
            return documents.filter(function (documentRecord) {
                if (config.folderId && documentRecord.folderId !== config.folderId) return false;
                return String(documentRecord.title || '').toLowerCase().includes(normalizedQuery);
            }).slice(0, safeLimit);
        }

        async getDocument(id) {
            const db = this._requireDb();
            return (await asPromise(db.transaction('documents', 'readonly').objectStore('documents').get(String(id)))) || null;
        }

        async putDocument(documentRecord) {
            this._requireWriteEnabled();
            const db = this._requireDb();
            const tx = db.transaction('documents', 'readwrite');
            tx.objectStore('documents').put(documentRecord);
            await waitForTransaction(tx);
            return documentRecord;
        }

        createDocument(documentRecord) {
            return this.putDocument(documentRecord);
        }

        updateDocument(_id, documentRecord) {
            return this.putDocument(documentRecord);
        }

        async deleteDocument(id) {
            this._requireWriteEnabled();
            const db = this._requireDb();
            const tx = db.transaction('documents', 'readwrite');
            tx.objectStore('documents').delete(String(id));
            await waitForTransaction(tx);
            return true;
        }

        async listFolders() {
            const db = this._requireDb();
            return (await asPromise(db.transaction('folders', 'readonly').objectStore('folders').getAll())) || [];
        }

        async putFolder(folderRecord) {
            this._requireWriteEnabled();
            const db = this._requireDb();
            const tx = db.transaction('folders', 'readwrite');
            tx.objectStore('folders').put(folderRecord);
            await waitForTransaction(tx);
            return folderRecord;
        }

        createFolder(folderRecord) {
            return this.putFolder(folderRecord);
        }

        updateFolder(_id, folderRecord) {
            return this.putFolder(folderRecord);
        }

        async deleteFolder(id) {
            this._requireWriteEnabled();
            const db = this._requireDb();
            const tx = db.transaction('folders', 'readwrite');
            tx.objectStore('folders').delete(String(id));
            await waitForTransaction(tx);
            return true;
        }

        async health() {
            const db = this._requireDb();
            const workFilesReady = db.objectStoreNames.contains('work_files');
            return {
                available: true,
                backend: 'indb',
                capabilities: { workFiles: workFilesReady }
            };
        }

        async uploadWorkFile(file, options) {
            if (!(file instanceof Blob)) throw new TypeError('uploadWorkFile requires a File or Blob.');
            this._requireWriteEnabled();
            const db = this._requireDb();
            if (!db.objectStoreNames.contains('work_files')) {
                throw new Error('inDB 작업파일 저장소가 준비되지 않았습니다. 앱을 새로고침해 주세요.');
            }
            const config = options || {};
            const createdAt = Date.now();
            const record = {
                id: 'work_' + createdAt + '_' + Math.random().toString(36).slice(2, 10),
                name: String(config.fileName || file.name || 'work-file.bin'),
                appId: String(config.appId || 'mdpro'),
                workType: String(config.workType || 'generic'),
                mimeType: String(file.type || 'application/octet-stream'),
                sizeBytes: Number(file.size || 0),
                createdAt: createdAt,
                modifiedAt: createdAt,
                blob: file
            };
            const tx = db.transaction('work_files', 'readwrite');
            tx.objectStore('work_files').put(record);
            await waitForTransaction(tx);
            return {
                id: record.id,
                name: record.name,
                appId: record.appId,
                workType: record.workType,
                mimeType: record.mimeType,
                sizeBytes: record.sizeBytes,
                createdAt: record.createdAt,
                modifiedAt: record.modifiedAt
            };
        }

        async listWorkFiles(options) {
            const db = this._requireDb();
            if (!db.objectStoreNames.contains('work_files')) return { items: [], total: 0 };
            const config = options || {};
            const records = (await asPromise(
                db.transaction('work_files', 'readonly').objectStore('work_files').getAll()
            )) || [];
            const items = records.filter(function (record) {
                if (config.appId && String(record.appId) !== String(config.appId)) return false;
                if (config.workType && String(record.workType) !== String(config.workType)) return false;
                return true;
            }).sort(function (left, right) {
                return Number(right.createdAt || 0) - Number(left.createdAt || 0);
            }).map(function (record) {
                return {
                    id: record.id,
                    name: record.name,
                    appId: record.appId,
                    workType: record.workType,
                    mimeType: record.mimeType,
                    sizeBytes: record.sizeBytes,
                    createdAt: record.createdAt,
                    modifiedAt: record.modifiedAt
                };
            });
            const limit = Math.max(1, Math.min(500, Number(config.limit) || 200));
            return { items: items.slice(0, limit), total: items.length };
        }

        async downloadWorkFile(item) {
            const id = String(item && item.id || item || '').trim();
            if (!id) throw new TypeError('downloadWorkFile requires an item id.');
            const db = this._requireDb();
            if (!db.objectStoreNames.contains('work_files')) throw new Error('inDB 작업파일 저장소가 없습니다.');
            const record = await asPromise(
                db.transaction('work_files', 'readonly').objectStore('work_files').get(id)
            );
            if (!record) throw new Error('inDB에서 작업파일을 찾을 수 없습니다.');
            if (record.blob instanceof Blob) return record.blob;
            return new Blob([record.blob || ''], { type: record.mimeType || 'application/octet-stream' });
        }
    }

    root.MDPIndexedDbAdapter = IndexedDbAdapter;
})(typeof window !== 'undefined' ? window : globalThis);
