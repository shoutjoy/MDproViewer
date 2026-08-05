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
            this.getDb = config.getDb;
        }

        _requireDb() {
            const database = this.getDb();
            if (!database) throw new Error('IndexedDB is not ready.');
            return database;
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
            const db = this._requireDb();
            const tx = db.transaction('folders', 'readwrite');
            tx.objectStore('folders').delete(String(id));
            await waitForTransaction(tx);
            return true;
        }
    }

    root.MDPIndexedDbAdapter = IndexedDbAdapter;
})(typeof window !== 'undefined' ? window : globalThis);
