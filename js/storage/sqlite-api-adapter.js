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
            if (requestOptions.method !== 'GET' && requestOptions.method !== 'HEAD') {
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
                    && requestOptions.method !== 'GET'
                    && requestOptions.method !== 'HEAD'
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

        integrityCheck() {
            return this._request('/maintenance/integrity-check', { method: 'POST' });
        }

        previewIndexedDbMigration(batch) {
            return this._request(
                '/migrations/indexeddb/preview',
                this._jsonOptions('POST', batch)
            );
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
