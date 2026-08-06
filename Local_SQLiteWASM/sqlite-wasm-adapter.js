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
            this.workerUrl = String(config.workerUrl || './Local_SQLiteWASM/sqlite-wasm-worker.js?v=20260806-fma-workfiles-1');
            this.workerFactory = config.workerFactory || function (url) { return new Worker(url); };
            this.timeoutMs = Math.max(1000, Number(config.timeoutMs) || 30000);
            this.worker = null;
            this.sequence = 0;
            this.pending = new Map();
            this.startPromise = null;
            this.fmaCache = new Map();
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

        _call(method, args, timeoutMs, transfer) {
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
                    const message = { id: id, method: method, args: Array.isArray(args) ? args : [] };
                    if (Array.isArray(transfer) && transfer.length) worker.postMessage(message, transfer);
                    else worker.postMessage(message);
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
        getExplorerSnapshot(options) { return this._call('getExplorerSnapshot', [options || {}]); }
        getExplorerDocument(id) { return this._call('getExplorerDocument', [id]); }
        listExplorerDocumentVersions(id) { return this._call('listExplorerDocumentVersions', [id]); }
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
        async importDatabase(file, options) {
            if (!(file instanceof Blob)) {
                throw new SqliteWasmError('DATABASE_IMPORT_FILE_REQUIRED', 'SQLite DB 파일을 선택해 주세요.', 400);
            }
            const maxBytes = 512 * 1024 * 1024;
            if (file.size < 512 || file.size > maxBytes) {
                throw new SqliteWasmError('DATABASE_IMPORT_SIZE_INVALID', 'SQLite DB 파일 크기가 올바르지 않거나 512MB 제한을 초과했습니다.', 413, {
                    sizeBytes: file.size,
                    maxBytes: maxBytes
                });
            }
            const config = options || {};
            const bytes = new Uint8Array(await file.arrayBuffer());
            return this._call('importDatabase', [{
                bytes: bytes,
                fileName: String(config.fileName || file.name || 'import.sqlite')
            }], 180000, [bytes.buffer]);
        }

        _safeFmaPath(value) {
            const normalized = String(value || '').replace(/\\/g, '/');
            const parts = normalized.split('/');
            if (!normalized || normalized.charAt(0) === '/' || normalized.indexOf('\u0000') >= 0
                || parts.some(function (part) { return !part || part === '.' || part === '..'; })
                || (parts[0] && parts[0].indexOf(':') >= 0)) {
                throw new SqliteWasmError('FMA_ARCHIVE_PATH_INVALID', 'FMA archive contains an unsafe path.', 409);
            }
            return normalized;
        }

        _collectFmaMediaReferences(value, result) {
            const references = result || new Set();
            if (Array.isArray(value)) {
                value.forEach((child) => this._collectFmaMediaReferences(child, references));
            } else if (value && typeof value === 'object') {
                const keys = Object.keys(value);
                if (keys.length === 1 && keys[0] === '$fmaMedia' && typeof value.$fmaMedia === 'string') {
                    references.add(value.$fmaMedia);
                } else {
                    keys.forEach((key) => this._collectFmaMediaReferences(value[key], references));
                }
            }
            return references;
        }

        async _inspectFmaArchive(blob) {
            if (!root.JSZip || typeof root.JSZip.loadAsync !== 'function') {
                throw new SqliteWasmError('FMA_ZIP_MODULE_MISSING', 'FMA ZIP 모듈을 불러오지 못했습니다.', 500);
            }
            let zip;
            try {
                zip = await root.JSZip.loadAsync(blob, { checkCRC32: true, createFolders: false });
            } catch (error) {
                throw new SqliteWasmError('FMA_ARCHIVE_INVALID', 'FMA 파일이 올바른 ZIP 형식이 아닙니다.', 409, {
                    reason: String(error && error.message || error)
                });
            }
            const names = Object.keys(zip.files);
            if (!names.length || names.length > 20000) {
                throw new SqliteWasmError('FMA_ARCHIVE_ENTRY_COUNT_INVALID', 'FMA 내부 파일 수가 허용 범위를 벗어났습니다.', 409);
            }
            let uncompressedBytes = 0;
            names.forEach((name) => {
                const entry = zip.files[name];
                const originalValue = String(entry.unsafeOriginalName || name);
                const originalName = entry.dir && originalValue.endsWith('/')
                    ? originalValue.slice(0, -1) : originalValue;
                const safeName = this._safeFmaPath(originalName);
                const storedName = entry.dir && name.endsWith('/') ? name.slice(0, -1) : name;
                if (safeName !== storedName) {
                    throw new SqliteWasmError('FMA_ARCHIVE_PATH_INVALID', 'FMA archive path was normalized for safety.', 409);
                }
                uncompressedBytes += Number(entry && entry._data && entry._data.uncompressedSize) || 0;
                if (uncompressedBytes > 2 * 1024 * 1024 * 1024) {
                    throw new SqliteWasmError('FMA_ARCHIVE_EXPANDED_TOO_LARGE', 'FMA 압축 해제 크기가 2GB 제한을 초과합니다.', 413);
                }
            });
            const manifestEntry = zip.file('manifest.json');
            if (!manifestEntry) throw new SqliteWasmError('FMA_MANIFEST_MISSING', 'FMA manifest.json이 없습니다.', 409);
            const manifestSize = Number(manifestEntry._data && manifestEntry._data.uncompressedSize) || 0;
            if (manifestSize > 16 * 1024 * 1024) {
                throw new SqliteWasmError('FMA_MANIFEST_TOO_LARGE', 'FMA manifest가 16MB를 초과합니다.', 413);
            }
            let manifest;
            try {
                manifest = JSON.parse(await manifestEntry.async('string'));
            } catch (_) {
                throw new SqliteWasmError('FMA_MANIFEST_INVALID', 'FMA manifest가 올바른 JSON이 아닙니다.', 409);
            }
            if (!manifest || manifest.format !== 'fma-archive' || !Number.isInteger(manifest.version)
                || manifest.version < 3 || !Array.isArray(manifest.images) || !manifest.images.length
                || !manifest.media || typeof manifest.media !== 'object' || Array.isArray(manifest.media)) {
                throw new SqliteWasmError('FMA_MANIFEST_UNSUPPORTED', '지원하지 않는 FMA 형식 또는 버전입니다.', 415);
            }
            const mediaIds = Object.keys(manifest.media);
            mediaIds.forEach((mediaId) => {
                const record = manifest.media[mediaId];
                if (!record || typeof record !== 'object') {
                    throw new SqliteWasmError('FMA_MEDIA_INVALID', 'FMA 미디어 메타데이터가 올바르지 않습니다.', 409);
                }
                const path = this._safeFmaPath(record.path);
                if (path.indexOf('media/') !== 0 || !zip.file(path)) {
                    throw new SqliteWasmError('FMA_MEDIA_MISSING', 'FMA manifest가 가리키는 미디어 파일이 없습니다.', 409);
                }
            });
            const references = this._collectFmaMediaReferences(manifest.images);
            if (!references.size || Array.from(references).some(function (mediaId) {
                return !Object.prototype.hasOwnProperty.call(manifest.media, mediaId);
            })) {
                throw new SqliteWasmError('FMA_MEDIA_REFERENCE_INVALID', 'FMA 미디어 참조가 올바르지 않습니다.', 409);
            }
            return {
                zip: zip,
                manifest: manifest,
                validation: {
                    format: 'fma-archive', version: manifest.version, imageCount: manifest.images.length,
                    mediaCount: mediaIds.length, uncompressedBytes: uncompressedBytes
                }
            };
        }

        _fmaMediaType(mimeType) {
            const normalized = String(mimeType || '').toLowerCase();
            if (normalized.indexOf('image/') === 0) return 'image';
            if (normalized.indexOf('video/') === 0) return 'video';
            if (normalized.indexOf('audio/') === 0) return 'audio';
            return 'other';
        }

        _fmaDisplayName(image, mediaPath, index) {
            const sourcePath = String(image && image.path || '').trim();
            if (sourcePath) {
                let cleaned = sourcePath.replace(/\\/g, '/').split('/').pop();
                if (cleaned.indexOf('$.added.') === 0) cleaned = cleaned.slice('$.added.'.length);
                if (cleaned) return cleaned.slice(0, 255);
            }
            return String(mediaPath || '').split('/').pop() || ('media-' + (index + 1));
        }

        _buildFmaSummary(record, archive) {
            const manifest = archive.manifest;
            const typeCounts = { image: 0, video: 0, audio: 0, other: 0 };
            const mimeCounts = {};
            const extensionCounts = {};
            let totalMediaBytes = 0;
            Object.keys(manifest.media).forEach((mediaId) => {
                const media = manifest.media[mediaId];
                const mimeType = String(media.mimeType || 'application/octet-stream').toLowerCase();
                const mediaType = this._fmaMediaType(mimeType);
                const extension = String(media.path || '').split('.').pop().toLowerCase() || 'none';
                typeCounts[mediaType] += 1;
                mimeCounts[mimeType] = (mimeCounts[mimeType] || 0) + 1;
                extensionCounts[extension] = (extensionCounts[extension] || 0) + 1;
                totalMediaBytes += Number(media.size) || 0;
            });
            const gallery = [];
            for (let index = 0; index < manifest.images.length && gallery.length < 24; index += 1) {
                const image = manifest.images[index];
                const mediaId = image && image.src && typeof image.src.$fmaMedia === 'string'
                    ? image.src.$fmaMedia : '';
                const media = manifest.media[mediaId];
                if (!media) continue;
                const mimeType = String(media.mimeType || image.mimeType || 'application/octet-stream').toLowerCase();
                const mediaType = this._fmaMediaType(mimeType);
                const extension = String(media.path || '').split('.').pop().toLowerCase();
                const sizeBytes = Number(media.size) || 0;
                const previewAvailable = mediaType === 'image' && mimeType !== 'image/svg+xml'
                    && sizeBytes > 0 && sizeBytes <= 64 * 1024 * 1024;
                gallery.push({
                    index: index, mediaId: mediaId, name: this._fmaDisplayName(image, media.path, index),
                    mediaType: mediaType, mimeType: mimeType, extension: extension, sizeBytes: sizeBytes,
                    width: image.width, height: image.height, previewAvailable: previewAvailable, thumbnailUrl: null
                });
            }
            return {
                kind: 'fma', format: manifest.format, version: manifest.version,
                generator: String(manifest.generator || ''), timestamp: manifest.timestamp,
                workType: record.workType, counts: {
                    galleryItems: manifest.images.length, uniqueMedia: Object.keys(manifest.media).length,
                    images: typeCounts.image, videos: typeCounts.video, audio: typeCounts.audio, other: typeCounts.other
                },
                mimeCounts: mimeCounts, extensionCounts: extensionCounts, totalMediaBytes: totalMediaBytes,
                galleryLimit: 24, shownGalleryItems: gallery.length, thumbnailSupport: true,
                previewMode: 'webpThumbnail', fallbackMaxBytes: null, gallery: gallery
            };
        }

        async _loadFmaArchive(entryId) {
            const id = String(entryId || '').trim();
            if (this.fmaCache.has(id)) return this.fmaCache.get(id);
            const record = await this._call('downloadWorkFile', [id], 180000);
            const bytes = record && record.bytes instanceof Uint8Array
                ? record.bytes : new Uint8Array(record && record.bytes || []);
            const blob = new Blob([bytes], { type: String(record && record.mimeType || 'application/vnd.fma+zip') });
            const inspected = await this._inspectFmaArchive(blob);
            const cached = { record: record, zip: inspected.zip, manifest: inspected.manifest };
            this.fmaCache.set(id, cached);
            while (this.fmaCache.size > 3) this.fmaCache.delete(this.fmaCache.keys().next().value);
            return cached;
        }

        async _createFmaThumbnail(blob) {
            if (typeof root.createImageBitmap !== 'function' || !root.document) return blob;
            const bitmap = await root.createImageBitmap(blob);
            try {
                if (bitmap.width * bitmap.height > 80000000) {
                    throw new SqliteWasmError('FMA_THUMBNAIL_PIXELS_TOO_LARGE', '이미지 크기가 미리보기 제한을 초과합니다.', 413);
                }
                const scale = Math.min(1, 240 / Math.max(bitmap.width, bitmap.height));
                const canvas = root.document.createElement('canvas');
                canvas.width = Math.max(1, Math.round(bitmap.width * scale));
                canvas.height = Math.max(1, Math.round(bitmap.height * scale));
                const context = canvas.getContext('2d');
                if (!context) throw new Error('Canvas 2D context is unavailable.');
                context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
                const thumbnail = await new Promise(function (resolve) {
                    canvas.toBlob(resolve, 'image/webp', 0.72);
                });
                return thumbnail || blob;
            } finally {
                if (bitmap && typeof bitmap.close === 'function') bitmap.close();
            }
        }

        getExplorerFileEntry(id) { return this._call('getExplorerFileEntry', [id]); }

        async getExplorerFmaPreview(id) {
            const archive = await this._loadFmaArchive(id);
            return this._buildFmaSummary(archive.record, archive);
        }

        async getExplorerFmaThumbnail(id, mediaId) {
            const archive = await this._loadFmaArchive(id);
            const normalizedMediaId = String(mediaId || '').trim();
            if (!/^[A-Za-z0-9_.:-]{1,128}$/.test(normalizedMediaId)) {
                throw new SqliteWasmError('FMA_PREVIEW_MEDIA_INVALID', 'FMA 미디어 식별자가 올바르지 않습니다.', 400);
            }
            const media = archive.manifest.media[normalizedMediaId];
            if (!media) throw new SqliteWasmError('FMA_PREVIEW_MEDIA_NOT_FOUND', 'FMA 미디어를 찾지 못했습니다.', 404);
            const mimeType = String(media.mimeType || '').toLowerCase();
            if (this._fmaMediaType(mimeType) !== 'image' || mimeType === 'image/svg+xml') {
                throw new SqliteWasmError('FMA_THUMBNAIL_UNSUPPORTED', '이 FMA 미디어는 미리보기를 지원하지 않습니다.', 415);
            }
            const path = this._safeFmaPath(media.path);
            const entry = archive.zip.file(path);
            if (!entry) throw new SqliteWasmError('FMA_PREVIEW_MEDIA_MISSING', 'FMA 미디어 파일이 없습니다.', 409);
            const bytes = await entry.async('uint8array');
            if (!bytes.byteLength || bytes.byteLength > 64 * 1024 * 1024) {
                throw new SqliteWasmError('FMA_THUMBNAIL_TOO_LARGE', 'FMA 미디어가 미리보기 제한을 초과합니다.', 413);
            }
            const blob = new Blob([bytes], { type: mimeType || 'application/octet-stream' });
            try {
                return await this._createFmaThumbnail(blob);
            } catch (error) {
                if (blob.size <= 2 * 1024 * 1024) return blob;
                throw error;
            }
        }

        async uploadWorkFile(file, options) {
            if (!file || typeof file.size !== 'number' || typeof file.arrayBuffer !== 'function') {
                throw new TypeError('uploadWorkFile requires a File or Blob.');
            }
            const config = options || {};
            const workType = String(config.workType || '').trim().toLowerCase();
            const isFma = workType === 'fma' || workType === 'fma_webp' || workType === 'fma_snapshot';
            const inspected = isFma ? await this._inspectFmaArchive(file) : { validation: {} };
            const bytes = new Uint8Array(await file.arrayBuffer());
            return this._call('uploadWorkFile', [{
                bytes: bytes,
                fileName: String(config.fileName || file.name || 'work-file.fma'),
                workType: workType,
                appId: String(config.appId || ''),
                mimeType: String(file.type || config.mimeType || 'application/vnd.fma+zip'),
                validation: inspected.validation
            }], 180000, [bytes.buffer]);
        }

        listWorkFiles(options) { return this._call('listWorkFiles', [options || {}]); }

        async downloadWorkFile(item) {
            const record = item || {};
            if (!record.id) throw new TypeError('downloadWorkFile requires an item id.');
            const result = await this._call('downloadWorkFile', [record.id], 180000);
            const bytes = result && result.bytes instanceof Uint8Array
                ? result.bytes : new Uint8Array(result && result.bytes || []);
            if (Number.isFinite(Number(record.sizeBytes)) && bytes.byteLength !== Number(record.sizeBytes)) {
                throw new SqliteWasmError('WORK_FILE_SIZE_MISMATCH', '불러온 작업파일 크기가 SQLite 메타데이터와 다릅니다.', 409);
            }
            return new Blob([bytes], { type: String(result && result.mimeType || record.mimeType || 'application/octet-stream') });
        }

        _unsupported(name) {
            return Promise.reject(new SqliteWasmError(
                'SQLITE_WASM_FEATURE_EXCLUDED',
                name + ' is outside the current SQLite WASM migration scope.',
                501
            ));
        }

        getExplorerBackup() { return this._unsupported('Backup explorer'); }
        deleteExplorerBackup() { return this._unsupported('Backup explorer'); }
        createBackupPackage() { return this._unsupported('.mdpbackup'); }
        validateBackupPackage() { return this._unsupported('.mdpbackup'); }
        downloadBackupPackage() { return this._unsupported('.mdpbackup'); }
        previewBackupRestore() { return this._unsupported('.mdpbackup restore'); }
        applyBackupRestore() { return this._unsupported('.mdpbackup restore'); }
        close() {
            if (!this.worker) return;
            this.worker.terminate();
            this.worker = null;
            this.startPromise = null;
            this.fmaCache.clear();
            this._rejectAll(new SqliteWasmError('SQLITE_WASM_CLOSED', 'SQLite WASM adapter was closed.', 0));
        }
    }

    root.MDPSqliteWasmError = SqliteWasmError;
    root.MDPSqliteWasmAdapter = SqliteWasmAdapter;
})(typeof window !== 'undefined' ? window : globalThis);
