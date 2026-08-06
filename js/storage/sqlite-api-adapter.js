(function (root) {
    'use strict';

    class SqliteApiError extends Error {
        constructor(code, message, status, details, requestId) {
            super(message || 'SQLite API request failed.');
            this.name = 'SqliteApiError';
            this.code = code || 'SQLITE_API_ERROR';
            this.status = Number(status) || 0;
            this.details = details && typeof details === 'object' ? details : {};
            this.requestId = String(requestId || '');
        }
    }

    class SqliteApiAdapter {
        constructor(options) {
            const config = options || {};
            this.kind = 'sqlite';
            this.backend = 'api';
            this.baseUrl = String(config.baseUrl || '/api/sqlite').replace(/\/$/, '');
            const fetchFunction = config.fetchImpl || root.fetch;
            this.fetchImpl = typeof fetchFunction === 'function' ? fetchFunction.bind(root) : null;
            this.sessionToken = '';
            if (typeof this.fetchImpl !== 'function') {
                throw new TypeError('SqliteApiAdapter requires fetch().');
            }
        }

        async _request(path, options, sessionRetryAttempted) {
            const requestOptions = Object.assign({
                method: 'GET',
                credentials: 'same-origin',
                cache: 'no-store',
                headers: { 'Accept': 'application/json' }
            }, options || {});
            requestOptions.headers = Object.assign({}, requestOptions.headers || {});
            const requiresSession = requestOptions.requiresSession === true
                || (requestOptions.method !== 'GET' && requestOptions.method !== 'HEAD');
            delete requestOptions.requiresSession;
            if (requiresSession) {
                await this.ensureSession();
                requestOptions.headers['X-MDViewer-Session'] = this.sessionToken;
            }

            let response;
            try {
                response = await this.fetchImpl(this.baseUrl + path, requestOptions);
            } catch (error) {
                throw new SqliteApiError('SQLITE_SERVER_OFFLINE', '로컬 SQLite 서버에 연결할 수 없습니다.', 0);
            }

            let payload = null;
            try {
                payload = await response.json();
            } catch (_) {}
            if (!response.ok || !payload || payload.ok !== true) {
                const apiError = payload && payload.error ? payload.error : {};
                if (response.status === 403
                    && requiresSession
                    && sessionRetryAttempted !== true) {
                    this.sessionToken = '';
                    return this._request(path, options, true);
                }
                throw new SqliteApiError(
                    apiError.code || 'SQLITE_API_ERROR',
                    apiError.message || ('SQLite API HTTP ' + response.status),
                    response.status,
                    apiError.details,
                    payload && payload.requestId
                );
            }
            return payload.data;
        }

        async _requestBlob(path, accept, sessionRetryAttempted) {
            await this.ensureSession();
            let response;
            try {
                response = await this.fetchImpl(this.baseUrl + path, {
                    method: 'GET',
                    credentials: 'same-origin',
                    cache: 'no-store',
                    headers: {
                        'Accept': accept || 'application/octet-stream',
                        'X-MDViewer-Session': this.sessionToken
                    }
                });
            } catch (_) {
                throw new SqliteApiError('SQLITE_SERVER_OFFLINE', '로컬 SQLite 서버에 연결할 수 없습니다.', 0);
            }
            if (!response.ok) {
                let payload = null;
                try { payload = await response.json(); } catch (_) {}
                if (response.status === 403 && sessionRetryAttempted !== true) {
                    this.sessionToken = '';
                    return this._requestBlob(path, accept, true);
                }
                const apiError = payload && payload.error ? payload.error : {};
                throw new SqliteApiError(
                    apiError.code || 'SQLITE_PREVIEW_ERROR',
                    apiError.message || ('SQLite preview HTTP ' + response.status),
                    response.status,
                    apiError.details,
                    payload && payload.requestId
                );
            }
            return response.blob();
        }

        async _download(path, sessionRetryAttempted) {
            await this.ensureSession();
            let response;
            try {
                response = await this.fetchImpl(this.baseUrl + path, {
                    method: 'GET',
                    credentials: 'same-origin',
                    cache: 'no-store',
                    headers: {
                        'Accept': 'application/vnd.mdviewer.backup+zip',
                        'X-MDViewer-Session': this.sessionToken
                    }
                });
            } catch (_) {
                throw new SqliteApiError('SQLITE_SERVER_OFFLINE', '로컬 SQLite 서버에 연결할 수 없습니다.', 0);
            }
            if (!response.ok) {
                let payload = null;
                try { payload = await response.json(); } catch (_) {}
                if (response.status === 403 && sessionRetryAttempted !== true) {
                    this.sessionToken = '';
                    return this._download(path, true);
                }
                const apiError = payload && payload.error ? payload.error : {};
                throw new SqliteApiError(
                    apiError.code || 'SQLITE_DOWNLOAD_ERROR',
                    apiError.message || ('SQLite backup download HTTP ' + response.status),
                    response.status,
                    apiError.details,
                    payload && payload.requestId
                );
            }
            const disposition = String(response.headers && response.headers.get
                ? response.headers.get('Content-Disposition') || ''
                : '');
            const match = /filename="([^"]+)"/i.exec(disposition);
            return {
                blob: await response.blob(),
                fileName: match ? match[1] : 'mdviewer-backup.mdpbackup'
            };
        }

        _jsonOptions(method, payload) {
            return {
                method: method,
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json; charset=utf-8'
                },
                body: JSON.stringify(payload || {})
            };
        }

        _query(params) {
            const pairs = [];
            Object.keys(params || {}).forEach(function (key) {
                const value = params[key];
                if (value === undefined || value === null || value === '') return;
                pairs.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(value)));
            });
            return pairs.length ? '?' + pairs.join('&') : '';
        }

        async ensureSession() {
            if (this.sessionToken) return this.sessionToken;
            const data = await this._request('/session', { method: 'GET' });
            this.sessionToken = String(data && data.token ? data.token : '');
            if (!this.sessionToken) {
                throw new SqliteApiError('INVALID_SESSION', 'SQLite 서버 세션을 만들 수 없습니다.', 0);
            }
            return this.sessionToken;
        }

        health() {
            return this._request('/health', { method: 'GET' });
        }

        bootstrap() {
            return this._request('/bootstrap', { method: 'GET' });
        }

        getExplorerSnapshot(options) {
            const config = options || {};
            return this._request('/explorer' + this._query({
                q: config.query,
                limit: config.limit
            }), { method: 'GET' });
        }

        getExplorerDocument(id) {
            return this.getDocument(id);
        }

        listExplorerDocumentVersions(id) {
            return this.listDocumentVersions(id);
        }

        getExplorerFileEntry(id) {
            return this._request('/explorer/files/' + encodeURIComponent(String(id)), { method: 'GET' });
        }

        getExplorerFmaPreview(id) {
            return this._request(
                '/explorer/files/' + encodeURIComponent(String(id)) + '/fma-preview',
                { method: 'GET', requiresSession: true }
            );
        }

        getExplorerFmaThumbnail(id, mediaId) {
            return this._requestBlob(
                '/explorer/files/' + encodeURIComponent(String(id))
                    + '/fma-thumbnail/' + encodeURIComponent(String(mediaId)),
                'image/avif,image/webp,image/png,image/jpeg,image/gif'
            );
        }

        getExplorerBackup(id) {
            return this._request(
                '/explorer/backups/' + encodeURIComponent(String(id)),
                { method: 'GET', requiresSession: true }
            );
        }

        deleteExplorerBackup(id) {
            const backupId = String(id);
            return this._request(
                '/explorer/backups/' + encodeURIComponent(backupId),
                this._jsonOptions('DELETE', { confirmation: 'DELETE_BACKUP:' + backupId })
            );
        }

        integrityCheck() {
            return this._request('/maintenance/integrity-check', { method: 'POST' });
        }

        uploadWorkFile(file, options) {
            const config = options || {};
            if (!file || typeof file.size !== 'number' || typeof file.arrayBuffer !== 'function') {
                throw new TypeError('uploadWorkFile requires a File or Blob.');
            }
            return this._request('/workfiles', {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': String(file.type || config.mimeType || 'application/octet-stream'),
                    'X-MDViewer-File-Name': encodeURIComponent(String(config.fileName || file.name || 'work-file')),
                    'X-MDViewer-Work-Type': String(config.workType || ''),
                    'X-MDViewer-App': String(config.appId || '')
                },
                body: file
            });
        }

        listWorkFiles(options) {
            const config = options || {};
            return this._request('/workfiles' + this._query({
                app: config.appId,
                q: config.query,
                type: config.workType,
                limit: config.limit || 100
            }), { method: 'GET', requiresSession: true });
        }

        async downloadWorkFile(item) {
            const record = item || {};
            if (!record.id) throw new TypeError('downloadWorkFile requires an item id.');
            const blob = await this._requestBlob(
                '/workfiles/' + encodeURIComponent(String(record.id)) + '/download',
                String(record.mimeType || 'application/octet-stream')
            );
            if (Number.isFinite(Number(record.sizeBytes)) && blob.size !== Number(record.sizeBytes)) {
                throw new SqliteApiError(
                    'WORK_FILE_SIZE_MISMATCH',
                    '불러온 작업파일 크기가 SQLite 메타데이터와 다릅니다.',
                    409
                );
            }
            return blob;
        }

        createBackupPackage() {
            return this._request('/backups/packages', this._jsonOptions('POST', {}));
        }

        validateBackupPackage(fileName) {
            return this._request(
                '/backups/packages/validate',
                this._jsonOptions('POST', { fileName: fileName })
            );
        }

        downloadBackupPackage(fileName) {
            return this._download('/backups/packages/' + encodeURIComponent(String(fileName)));
        }

        previewBackupRestore(file) {
            if (!file || typeof file.size !== 'number' || typeof file.arrayBuffer !== 'function') {
                throw new TypeError('previewBackupRestore requires a File or Blob.');
            }
            const fileName = String(file.name || 'backup.mdpbackup');
            return this._request('/backups/restore/preview', {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/vnd.mdviewer.backup+zip',
                    'X-MDViewer-Backup-Name': encodeURIComponent(fileName)
                },
                body: file
            });
        }

        applyBackupRestore(importId, expectedPackageChecksumSha256) {
            return this._request(
                '/backups/restore/apply',
                this._jsonOptions('POST', {
                    importId: importId,
                    expectedPackageChecksumSha256: expectedPackageChecksumSha256,
                    confirmation: 'RESTORE_VALIDATED_BACKUP'
                })
            );
        }

        previewIndexedDbMigration(batch) {
            return this._request(
                '/migrations/indexeddb/preview',
                this._jsonOptions('POST', batch)
            );
        }

        applyIndexedDbMigration(batch) {
            return this._request(
                '/migrations/indexeddb/apply',
                this._jsonOptions('POST', batch)
            );
        }

        async listSettings(options) {
            const config = options || {};
            const data = await this._request('/settings' + this._query({
                scopeType: config.scopeType,
                scopeId: config.scopeId,
                group: config.group
            }), { method: 'GET' });
            return data && Array.isArray(data.items) ? data.items : [];
        }

        getResolvedSettings(options) {
            const config = options || {};
            return this._request('/settings/resolved' + this._query({
                profileId: config.profileId,
                workspaceId: config.workspaceId,
                documentId: config.documentId,
                featureId: config.featureId
            }), { method: 'GET' });
        }

        putSetting(setting) {
            return this._request('/settings', this._jsonOptions('PUT', setting));
        }

        async listDocuments(options) {
            const config = options || {};
            const data = await this._request('/documents' + this._query({
                folderId: config.folderId,
                q: config.query,
                limit: config.limit
            }), { method: 'GET' });
            return data && Array.isArray(data.items) ? data.items : [];
        }

        async searchDocuments(query, options) {
            const config = options || {};
            const data = await this._request('/search' + this._query({
                q: query,
                types: config.types || 'document',
                folderId: config.folderId,
                limit: config.limit
            }), { method: 'GET' });
            return data && Array.isArray(data.items) ? data.items : [];
        }

        getDocument(id) {
            return this._request('/documents/' + encodeURIComponent(String(id)), { method: 'GET' });
        }

        createDocument(documentRecord) {
            return this._request('/documents', this._jsonOptions('POST', documentRecord));
        }

        updateDocument(id, documentRecord) {
            return this._request(
                '/documents/' + encodeURIComponent(String(id)),
                this._jsonOptions('PUT', documentRecord)
            );
        }

        deleteDocument(id, expectedVersion) {
            return this._request(
                '/documents/' + encodeURIComponent(String(id))
                    + this._query({ expectedVersion: expectedVersion }),
                { method: 'DELETE' }
            );
        }

        async listDocumentVersions(id) {
            const data = await this._request(
                '/documents/' + encodeURIComponent(String(id)) + '/versions',
                { method: 'GET' }
            );
            return data && Array.isArray(data.items) ? data.items : [];
        }

        restoreDocumentVersion(id, version, expectedVersion) {
            return this._request(
                '/documents/' + encodeURIComponent(String(id))
                    + '/restore/' + encodeURIComponent(String(version)),
                this._jsonOptions('POST', { expectedVersion: expectedVersion })
            );
        }

        async listFolders() {
            const data = await this._request('/folders/tree', { method: 'GET' });
            return data && Array.isArray(data.items) ? data.items : [];
        }

        getFolder(id) {
            return this._request('/folders/' + encodeURIComponent(String(id)), { method: 'GET' });
        }

        createFolder(folderRecord) {
            return this._request('/folders', this._jsonOptions('POST', folderRecord));
        }

        updateFolder(id, folderRecord) {
            return this._request(
                '/folders/' + encodeURIComponent(String(id)),
                this._jsonOptions('PATCH', folderRecord)
            );
        }

        deleteFolder(id) {
            return this._request('/folders/' + encodeURIComponent(String(id)), { method: 'DELETE' });
        }
    }

    root.MDPSqliteApiError = SqliteApiError;
    root.MDPSqliteApiAdapter = SqliteApiAdapter;
})(typeof window !== 'undefined' ? window : globalThis);
