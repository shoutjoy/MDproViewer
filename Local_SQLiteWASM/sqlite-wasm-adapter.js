(function (root) {
    'use strict';

    class SqliteWasmError extends Error {
        constructor(code, message, status, details) {
            super(message || 'SQLite WASM operation failed.');
            this.name = 'SqliteWasmError';
            this.code = code || 'SQLITE_WASM_ERROR';
            this.status = Number(status) || 0;
            this.details = details && typeof details === 'object' ? details : {};
        }
    }

    class SqliteWasmAdapter {
        constructor(options) {
            const config = options || {};
            this.kind = 'sqlite';
            this.backend = 'wasm-opfs';
            this.workerUrl = String(config.workerUrl || './Local_SQLiteWASM/sqlite-wasm-worker.js');
            this.workerFactory = config.workerFactory || function (url) { return new Worker(url); };
            this.timeoutMs = Math.max(1000, Number(config.timeoutMs) || 30000);
            this.worker = null;
            this.sequence = 0;
            this.pending = new Map();
            this.startPromise = null;
        }

        static isSupported(environment) {
            const target = environment || root;
            return typeof target.Worker === 'function'
                && typeof target.WebAssembly === 'object'
                && !!(target.navigator && target.navigator.storage);
        }

        _createWorker() {
            if (this.worker) return this.worker;
            let worker;
            try {
                worker = this.workerFactory(this.workerUrl);
            } catch (error) {
                throw new SqliteWasmError('SQLITE_WASM_WORKER_START_FAILED', error && error.message, 0);
            }
            this.worker = worker;
            const self = this;
            worker.addEventListener('message', function (event) { self._onMessage(event); });
            worker.addEventListener('error', function (event) {
                self._rejectAll(new SqliteWasmError(
                    'SQLITE_WASM_WORKER_ERROR',
                    event && event.message ? event.message : 'SQLite WASM Worker failed.',
                    0
                ));
            });
            worker.addEventListener('messageerror', function () {
                self._rejectAll(new SqliteWasmError(
                    'SQLITE_WASM_MESSAGE_ERROR',
                    'SQLite WASM Worker message could not be decoded.',
                    0
                ));
            });
            return worker;
        }

        _rejectAll(error) {
            this.pending.forEach(function (entry) {
                clearTimeout(entry.timer);
                entry.reject(error);
            });
            this.pending.clear();
        }

        _onMessage(event) {
            const message = event && event.data && typeof event.data === 'object' ? event.data : {};
            const entry = this.pending.get(message.id);
            if (!entry) return;
            clearTimeout(entry.timer);
            this.pending.delete(message.id);
            if (message.ok === true) {
                entry.resolve(message.result);
                return;
            }
            const source = message.error && typeof message.error === 'object' ? message.error : {};
            entry.reject(new SqliteWasmError(source.code, source.message, source.status, source.details));
        }

        _call(method, args, timeoutMs) {
            const worker = this._createWorker();
            const id = 'wasm_' + Date.now() + '_' + (++this.sequence);
            const self = this;
            return new Promise(function (resolve, reject) {
                const timer = setTimeout(function () {
                    self.pending.delete(id);
                    reject(new SqliteWasmError(
                        'SQLITE_WASM_TIMEOUT',
                        'SQLite WASM operation timed out: ' + method,
                        0
                    ));
                }, Math.max(1000, Number(timeoutMs) || self.timeoutMs));
                self.pending.set(id, { resolve: resolve, reject: reject, timer: timer });
                try {
                    worker.postMessage({ id: id, method: method, args: Array.isArray(args) ? args : [] });
                } catch (error) {
                    clearTimeout(timer);
                    self.pending.delete(id);
                    reject(new SqliteWasmError('SQLITE_WASM_MESSAGE_SEND_FAILED', error && error.message, 0));
                }
            });
        }

        start() {
            if (!this.startPromise) {
                this.startPromise = this._call('health', [], 60000).catch((error) => {
                    this.startPromise = null;
                    throw error;
                });
            }
            return this.startPromise;
        }

        health() { return this.start(); }
        bootstrap() { return this._call('bootstrap'); }
        listDocuments(options) { return this._call('listDocuments', [options || {}]); }
        searchDocuments(query, options) { return this._call('searchDocuments', [query, options || {}]); }
        getDocument(id) { return this._call('getDocument', [id]); }
        createDocument(record) { return this._call('createDocument', [record || {}]); }
        updateDocument(id, record) { return this._call('updateDocument', [id, record || {}]); }
        deleteDocument(id, expectedVersion) { return this._call('deleteDocument', [id, expectedVersion]); }
        listDocumentVersions(id) { return this._call('listDocumentVersions', [id]); }
        restoreDocumentVersion(id, version, expectedVersion) {
            return this._call('restoreDocumentVersion', [id, version, expectedVersion]);
        }
        listFolders() { return this._call('listFolders'); }
        getFolder(id) { return this._call('getFolder', [id]); }
        createFolder(record) { return this._call('createFolder', [record || {}]); }
        updateFolder(id, record) { return this._call('updateFolder', [id, record || {}]); }
        deleteFolder(id) { return this._call('deleteFolder', [id]); }
        listSettings(options) { return this._call('listSettings', [options || {}]); }
        getResolvedSettings(options) { return this._call('getResolvedSettings', [options || {}]); }
        putSetting(setting) { return this._call('putSetting', [setting || {}]); }
        integrityCheck() { return this._call('integrityCheck', [], 60000); }
        previewIndexedDbMigration(batch) {
            return this._call('previewIndexedDbMigration', [batch || {}], 60000);
        }
        applyIndexedDbMigration(batch) {
            return this._call('applyIndexedDbMigration', [batch || {}], 120000);
        }
        exportDatabase(options) {
            return this._call('exportDatabase', [options || {}], 120000).then(function (result) {
                const bytes = result && result.bytes instanceof Uint8Array
                    ? result.bytes
                    : new Uint8Array(result && result.bytes || []);
                return {
                    blob: new Blob([bytes], { type: String(result && result.mimeType || 'application/vnd.sqlite3') }),
                    fileName: String(result && result.fileName || 'mdpro.sqlite'),
                    sizeBytes: Number(result && result.sizeBytes) || bytes.byteLength
                };
            });
        }

        _unsupported(name) {
            return Promise.reject(new SqliteWasmError(
                'SQLITE_WASM_FEATURE_EXCLUDED',
                name + ' is outside the current SQLite WASM migration scope.',
                501
            ));
        }

        getExplorerSnapshot() { return this._unsupported('SQLite explorer'); }
        getExplorerDocument() { return this._unsupported('SQLite explorer'); }
        listExplorerDocumentVersions() { return this._unsupported('SQLite explorer'); }
        getExplorerFileEntry() { return this._unsupported('Work files'); }
        getExplorerFmaPreview() { return this._unsupported('FMA preview'); }
        getExplorerFmaThumbnail() { return this._unsupported('FMA preview'); }
        getExplorerBackup() { return this._unsupported('Backup explorer'); }
        deleteExplorerBackup() { return this._unsupported('Backup explorer'); }
        createBackupPackage() { return this._unsupported('.mdpbackup'); }
        validateBackupPackage() { return this._unsupported('.mdpbackup'); }
        downloadBackupPackage() { return this._unsupported('.mdpbackup'); }
        previewBackupRestore() { return this._unsupported('.mdpbackup restore'); }
        applyBackupRestore() { return this._unsupported('.mdpbackup restore'); }
        uploadWorkFile() { return this._unsupported('Work files'); }
        listWorkFiles() { return this._unsupported('Work files'); }
        downloadWorkFile() { return this._unsupported('Work files'); }

        close() {
            if (!this.worker) return;
            this.worker.terminate();
            this.worker = null;
            this.startPromise = null;
            this._rejectAll(new SqliteWasmError('SQLITE_WASM_CLOSED', 'SQLite WASM adapter was closed.', 0));
        }
    }

    root.MDPSqliteWasmError = SqliteWasmError;
    root.MDPSqliteWasmAdapter = SqliteWasmAdapter;
})(typeof window !== 'undefined' ? window : globalThis);
