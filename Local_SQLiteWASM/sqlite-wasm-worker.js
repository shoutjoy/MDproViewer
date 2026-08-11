'use strict';

const PROFILE_ID = 'profile_default';
const WORKSPACE_ID = 'workspace_default';
const ROOT_FOLDER_ID = 'root';
const WORKER_PARAMETERS = new URL(self.location.href).searchParams;
const TEST_MODE = WORKER_PARAMETERS.get('test') === '1';
const DATABASE_NAME = TEST_MODE ? '/mdpro-browser-test.sqlite' : '/mdpro.sqlite';
const MIGRATION_BACKUP_NAME = TEST_MODE ? '/pre-migration-test.sqlite' : '/pre-migration.sqlite';
const IMPORT_CANDIDATE_NAME = TEST_MODE ? '/import-candidate-test.sqlite' : '/import-candidate.sqlite';
const PRE_IMPORT_BACKUP_NAME = TEST_MODE ? '/pre-import-test.sqlite' : '/pre-import.sqlite';
const SCHEMA_URL = '../LocalSave_sqlite/migrations/001_initial_v3.sql';
const MANIFEST_URL = '../LocalSave_sqlite/migrations/manifest.json';
const SQLITE_JS_URL = './vendor/sqlite3/sqlite3.js';
const SQLITE_WASM_URL = new URL('./vendor/sqlite3/sqlite3.wasm', self.location.href).href;
const SAFE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const MAX_TITLE_LENGTH = 500;
const MAX_CONTENT_BYTES = 10 * 1024 * 1024;
const MAX_SEARCH_LENGTH = 500;
const MAX_DATABASE_IMPORT_BYTES = 512 * 1024 * 1024;
const MAX_WORK_FILE_BYTES = 512 * 1024 * 1024;
const MAX_MARKDOWN_WORK_FILE_BYTES = 8 * 1024 * 1024;
const SAFE_APP_RE = /^[a-z][a-z0-9_-]{0,63}$/;
const WORK_FILE_TYPES = Object.freeze({
    fma: { extension: 'fma', mimeType: 'application/vnd.fma+zip', kind: 'fma', maxBytes: MAX_WORK_FILE_BYTES },
    fma_webp: { extension: 'fma', mimeType: 'application/vnd.fma+zip', kind: 'fma', maxBytes: MAX_WORK_FILE_BYTES },
    fma_snapshot: { extension: 'fma', mimeType: 'application/vnd.fma+zip', kind: 'fma', maxBytes: MAX_WORK_FILE_BYTES },
    scholar_references_md: { extension: 'md', mimeType: 'text/markdown', kind: 'markdown', maxBytes: MAX_MARKDOWN_WORK_FILE_BYTES },
    crossref_markdown: { extension: 'md', mimeType: 'text/markdown', kind: 'markdown', maxBytes: MAX_MARKDOWN_WORK_FILE_BYTES }
});
const REQUIRED_IMPORT_TABLES = Object.freeze([
    'schema_migrations', 'app_meta', 'profiles', 'workspaces', 'folders',
    'documents', 'document_versions', 'settings', 'document_fts'
]);

let sqlite3 = null;
let poolUtil = null;
let database = null;
let initializationPromise = null;
let operationQueue = Promise.resolve();

importScripts('./settings-policy.js?v=20260811-custom-fonts-1');
importScripts(SQLITE_JS_URL);

function appError(code, message, status, details) {
    const error = new Error(message);
    error.code = code;
    error.status = Number(status) || 400;
    error.details = details && typeof details === 'object' ? details : {};
    return error;
}

function nowMs() {
    return Date.now();
}

function randomId(prefix) {
    const value = self.crypto && typeof self.crypto.randomUUID === 'function'
        ? self.crypto.randomUUID().replace(/-/g, '')
        : Array.from(self.crypto.getRandomValues(new Uint8Array(16))).map(function (byte) {
            return byte.toString(16).padStart(2, '0');
        }).join('');
    return String(prefix || '') + value;
}

async function sha256Text(value) {
    const bytes = new TextEncoder().encode(String(value == null ? '' : value));
    const digest = await self.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest)).map(function (byte) {
        return byte.toString(16).padStart(2, '0');
    }).join('');
}

async function sha256Bytes(value) {
    const bytes = value instanceof Uint8Array ? value : new Uint8Array(value || 0);
    const digest = await self.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest)).map(function (byte) {
        return byte.toString(16).padStart(2, '0');
    }).join('');
}

function wordCount(value) {
    const normalized = String(value == null ? '' : value).trim();
    return normalized ? normalized.split(/\s+/).filter(Boolean).length : 0;
}

function requireId(value, field) {
    const normalized = String(value || '').trim();
    if (!normalized || !SAFE_ID_RE.test(normalized)) {
        throw appError('INVALID_ID', String(field || 'id') + ' is invalid.');
    }
    return normalized;
}

function requireTitle(value, label) {
    const normalized = String(value || '').trim();
    if (!normalized) throw appError('TITLE_REQUIRED', String(label || 'Title') + ' is required.');
    if (normalized.length > MAX_TITLE_LENGTH) throw appError('TITLE_TOO_LONG', 'Title is too long.');
    return normalized;
}

function requireContent(value) {
    const normalized = String(value == null ? '' : value);
    if (new TextEncoder().encode(normalized).byteLength > MAX_CONTENT_BYTES) {
        throw appError('CONTENT_TOO_LARGE', 'Document content exceeds 10 MB.', 413);
    }
    return normalized;
}

function rows(sql, bind) {
    return Array.isArray(bind) && bind.length
        ? database.selectObjects(sql, bind)
        : database.selectObjects(sql);
}

function row(sql, bind) {
    return (Array.isArray(bind) && bind.length
        ? database.selectObject(sql, bind)
        : database.selectObject(sql)) || null;
}

function value(sql, bind) {
    return Array.isArray(bind) && bind.length
        ? database.selectValue(sql, bind)
        : database.selectValue(sql);
}

function execute(sql, bind) {
    if (Array.isArray(bind) && bind.length) database.exec({ sql: sql, bind: bind });
    else database.exec(sql);
    return Number(database.changes()) || 0;
}

function transaction(callback) {
    return database.transaction('IMMEDIATE', callback);
}

function configureDatabaseConnection(connection) {
    connection.exec([
        'PRAGMA foreign_keys = ON;',
        'PRAGMA journal_mode = DELETE;',
        'PRAGMA synchronous = NORMAL;',
        'PRAGMA busy_timeout = 5000;',
        'PRAGMA temp_store = MEMORY;',
        'PRAGMA recursive_triggers = ON;'
    ].join('\n'));
    return connection;
}

function openPoolDatabase(name) {
    return configureDatabaseConnection(new poolUtil.OpfsSAHPoolDb(name));
}

function documentSummary(source) {
    return {
        id: source.id,
        workspaceId: source.workspace_id,
        folderId: source.folder_id,
        title: source.title,
        contentFormat: source.content_format,
        documentType: source.document_type,
        status: source.status,
        wordCount: Number(source.word_count) || 0,
        version: Number(source.version) || 0,
        createdAt: Number(source.created_at) || null,
        updatedAt: Number(source.updated_at) || null,
        lastOpenedAt: Number(source.last_opened_at) || null
    };
}

function documentDetail(source) {
    return Object.assign(documentSummary(source), {
        content: source.content,
        checksum: source.checksum,
        language: source.language,
        sourceMode: source.source_mode,
        isFavorite: source.is_favorite === 1,
        isPinned: source.is_pinned === 1,
        isReadonly: source.is_readonly === 1
    });
}

function folderResult(source) {
    return {
        id: source.id,
        workspaceId: source.workspace_id,
        parentId: source.parent_id,
        name: source.name,
        sortOrder: Number(source.sort_order) || 0,
        isExpanded: source.is_expanded === 1,
        createdAt: Number(source.created_at) || null,
        updatedAt: Number(source.updated_at) || null
    };
}

function settingResult(source) {
    let parsed;
    try { parsed = JSON.parse(source.value_json); } catch (_) {
        throw appError('INVALID_STORED_SETTING', 'Stored setting JSON is invalid.', 500);
    }
    return {
        scopeType: source.scope_type,
        scopeId: source.scope_id,
        group: source.setting_group,
        key: source.setting_key,
        value: parsed,
        valueType: source.value_type,
        updatedAt: Number(source.updated_at) || null
    };
}

function requireFolder(folderId) {
    const item = row(
        'SELECT * FROM folders WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL',
        [folderId, WORKSPACE_ID]
    );
    if (!item) throw appError('FOLDER_NOT_FOUND', 'Folder not found.', 404);
    return item;
}

function getDocument(documentId) {
    const normalizedId = requireId(documentId, 'documentId');
    const item = row(
        'SELECT * FROM documents WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL',
        [normalizedId, WORKSPACE_ID]
    );
    if (!item) throw appError('DOCUMENT_NOT_FOUND', 'Document not found.', 404);
    return documentDetail(item);
}

function getFolder(folderId) {
    return folderResult(requireFolder(requireId(folderId, 'folderId')));
}

async function loadAndVerifySchema() {
    const responses = await Promise.all([
        fetch(new URL(SCHEMA_URL, self.location.href), { cache: 'no-store' }),
        fetch(new URL(MANIFEST_URL, self.location.href), { cache: 'no-store' })
    ]);
    if (!responses[0].ok || !responses[1].ok) {
        throw appError('SCHEMA_LOAD_FAILED', 'SQLite schema or manifest could not be loaded.', 500);
    }
    const schema = await responses[0].text();
    const manifest = await responses[1].json();
    const actual = await sha256Text(schema);
    const expected = String(manifest.schema_checksum_sha256 || '').toLowerCase();
    if (!expected || actual !== expected) {
        throw appError('SCHEMA_CHECKSUM_MISMATCH', 'SQLite schema checksum does not match the manifest.', 500, {
            expected: expected,
            actual: actual
        });
    }
    return {
        version: Number(manifest.schema_version) || 0,
        sql: schema.replace(/PRAGMA\s+journal_mode\s*=\s*WAL\s*;/i, 'PRAGMA journal_mode = DELETE;')
    };
}

function bootstrapRows(schemaVersion) {
    const timestamp = nowMs();
    transaction(function () {
        execute(
            'INSERT OR IGNORE INTO profiles (id, display_name, prefix_enabled, created_at, updated_at) VALUES (?, ?, 0, ?, ?)',
            [PROFILE_ID, 'Default User', timestamp, timestamp]
        );
        execute(
            "INSERT OR IGNORE INTO workspaces (id, owner_profile_id, name, workspace_type, locale, created_at, updated_at, last_opened_at) VALUES (?, ?, ?, 'research', 'ko-KR', ?, ?, ?)",
            [WORKSPACE_ID, PROFILE_ID, 'MD Viewer', timestamp, timestamp, timestamp]
        );
        execute(
            "INSERT OR IGNORE INTO folders (id, workspace_id, parent_id, name, sort_order, is_expanded, created_at, updated_at) VALUES (?, ?, NULL, 'ROOT', 0, 1, ?, ?)",
            [ROOT_FOLDER_ID, WORKSPACE_ID, timestamp, timestamp]
        );
        execute(
            "INSERT INTO app_meta (key, value_json, updated_at) VALUES ('local_storage', ?, ?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json, updated_at=excluded.updated_at",
            [JSON.stringify({ schemaVersion: schemaVersion, backend: 'sqlite-wasm-opfs' }), timestamp]
        );
    });
}

async function initializeDatabase() {
    if (database) return database;
    if (initializationPromise) return initializationPromise;
    initializationPromise = (async function () {
        sqlite3 = await self.sqlite3InitModule({
            locateFile: function (name) {
                return name === 'sqlite3.wasm' ? SQLITE_WASM_URL : new URL('./vendor/sqlite3/' + name, self.location.href).href;
            }
        });
        poolUtil = await sqlite3.installOpfsSAHPoolVfs({
            name: TEST_MODE ? 'mdviewer-test' : 'mdviewer',
            directory: TEST_MODE ? '.mdviewer-sqlite-wasm-test-v1' : '.mdviewer-sqlite-wasm-v1',
            initialCapacity: 8
        });
        await poolUtil.reserveMinimumCapacity(8);
        database = openPoolDatabase(DATABASE_NAME);
        const schema = await loadAndVerifySchema();
        const hasSchema = value("SELECT 1 FROM sqlite_schema WHERE type='table' AND name='schema_migrations'");
        const currentVersion = hasSchema
            ? Number(value('SELECT COALESCE(MAX(version), 0) FROM schema_migrations')) || 0
            : 0;
        if (currentVersion < schema.version) database.exec(schema.sql);
        const finalVersion = Number(value('SELECT COALESCE(MAX(version), 0) FROM schema_migrations')) || 0;
        if (finalVersion !== schema.version) {
            throw appError('SCHEMA_VERSION_UNSUPPORTED', 'The SQLite schema version is unsupported.', 500, {
                expected: schema.version,
                actual: finalVersion
            });
        }
        bootstrapRows(schema.version);
        if (String(value('PRAGMA quick_check')).toLowerCase() !== 'ok') {
            throw appError('SQLITE_QUICK_CHECK_FAILED', 'SQLite quick_check did not return ok.', 500);
        }
        if (Number(value("SELECT json_valid('{}')")) !== 1) {
            throw appError('SQLITE_JSON_UNAVAILABLE', 'SQLite JSON support is unavailable.', 500);
        }
        value('SELECT count(*) FROM document_fts');
        return database;
    })().catch(function (error) {
        if (database) {
            try { database.close(); } catch (_) {}
        }
        database = null;
        initializationPromise = null;
        throw error;
    });
    return initializationPromise;
}

const CAPABILITIES = Object.freeze({
    health: true,
    bootstrap: true,
    integrityCheck: true,
    documents: true,
    documentVersions: true,
    folders: true,
    settings: true,
    search: true,
    migration: true,
    migrationPreview: true,
    onlineBackup: true,
    databaseExport: true,
    databaseImport: true,
    explorer: true,
    backup: false,
    backupPackage: false,
    backupExplorer: false,
    restorePreview: false,
    restore: false,
    workFiles: true,
    modelAssets: false,
    fmaPreview: true,
    imageProxy: false,
    staticHosting: false,
    storageModeActivation: true
});

async function health() {
    await initializeDatabase();
    return {
        available: true,
        backend: 'wasm-opfs',
        databasePath: 'OPFS:' + DATABASE_NAME,
        schemaVersion: Number(value('SELECT COALESCE(MAX(version), 0) FROM schema_migrations')) || 0,
        sqliteVersion: String(value('SELECT sqlite_version()')),
        journalMode: String(value('PRAGMA journal_mode')),
        foreignKeys: Number(value('PRAGMA foreign_keys')) === 1,
        readable: true,
        writable: true,
        capabilities: Object.assign({}, CAPABILITIES)
    };
}

function bootstrap() {
    const profile = row('SELECT id, display_name, academic_id, major, contact, email, prefix_enabled FROM profiles WHERE id=? AND deleted_at IS NULL', [PROFILE_ID]);
    const workspace = row('SELECT id, owner_profile_id, name, workspace_type, locale, last_opened_at FROM workspaces WHERE id=? AND deleted_at IS NULL', [WORKSPACE_ID]);
    const rootFolder = row('SELECT * FROM folders WHERE id=? AND deleted_at IS NULL', [ROOT_FOLDER_ID]);
    return {
        profile: profile ? {
            id: profile.id, displayName: profile.display_name, academicId: profile.academic_id,
            major: profile.major, contact: profile.contact, email: profile.email,
            prefixEnabled: profile.prefix_enabled === 1
        } : null,
        workspace: workspace ? {
            id: workspace.id, ownerProfileId: workspace.owner_profile_id, name: workspace.name,
            workspaceType: workspace.workspace_type, locale: workspace.locale,
            lastOpenedAt: Number(workspace.last_opened_at) || null
        } : null,
        rootFolder: rootFolder ? folderResult(rootFolder) : null
    };
}

function listDocuments(options) {
    const config = options || {};
    const limit = Math.max(1, Math.min(Number(config.limit) || 200, 500));
    const clauses = ['workspace_id = ?', 'deleted_at IS NULL'];
    const bind = [WORKSPACE_ID];
    if (config.folderId) {
        clauses.push('folder_id = ?');
        bind.push(requireId(config.folderId, 'folderId'));
    }
    const query = String(config.query || config.q || '').trim();
    if (query) {
        clauses.push("title LIKE ? ESCAPE '\\'");
        bind.push('%' + query.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_') + '%');
    }
    bind.push(limit);
    return rows(
        'SELECT id, workspace_id, folder_id, title, content_format, document_type, status, word_count, version, created_at, updated_at, last_opened_at '
        + 'FROM documents WHERE ' + clauses.join(' AND ') + ' ORDER BY updated_at DESC, id ASC LIMIT ?',
        bind
    ).map(documentSummary);
}

function searchDocuments(queryInput, options) {
    const query = String(queryInput || '').trim();
    if (!query) return [];
    if (query.length > MAX_SEARCH_LENGTH) throw appError('SEARCH_QUERY_TOO_LONG', 'Search query is too long.');
    const config = options || {};
    const limit = Math.max(1, Math.min(Number(config.limit) || 100, 200));
    const folderClause = config.folderId ? ' AND d.folder_id = ?' : '';
    const folderBind = config.folderId ? [requireId(config.folderId, 'folderId')] : [];
    let resultRows;
    if (query.length <= 2) {
        const pattern = '%' + query.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_') + '%';
        resultRows = rows(
            "SELECT d.*, CASE WHEN d.title LIKE ? ESCAPE '\\' THEN 'title' ELSE 'content' END AS match_source, '' AS snippet "
            + "FROM documents d WHERE d.workspace_id=? AND d.deleted_at IS NULL AND (d.title LIKE ? ESCAPE '\\' OR d.content LIKE ? ESCAPE '\\')"
            + folderClause + " ORDER BY CASE WHEN d.title LIKE ? ESCAPE '\\' THEN 0 ELSE 1 END, d.updated_at DESC, d.id ASC LIMIT ?",
            [pattern, WORKSPACE_ID, pattern, pattern].concat(folderBind, [pattern, limit])
        );
    } else {
        const ftsQuery = '"' + query.replace(/"/g, '""') + '"';
        resultRows = rows(
            "SELECT d.*, CASE WHEN instr(lower(d.title), lower(?)) > 0 THEN 'title' ELSE 'content' END AS match_source, "
            + "snippet(document_fts, 3, '', '', ' … ', 16) AS snippet FROM document_fts "
            + 'JOIN documents d ON d.id=document_fts.document_id WHERE document_fts MATCH ? '
            + 'AND d.workspace_id=? AND d.deleted_at IS NULL' + folderClause
            + ' ORDER BY bm25(document_fts, 0.0, 0.0, 5.0, 1.0), d.updated_at DESC, d.id ASC LIMIT ?',
            [query, ftsQuery, WORKSPACE_ID].concat(folderBind, [limit])
        );
    }
    return resultRows.map(function (item) {
        return Object.assign(documentSummary(item), { matchSource: item.match_source, snippet: item.snippet });
    });
}

async function createDocument(payloadInput) {
    const payload = payloadInput && typeof payloadInput === 'object' ? payloadInput : {};
    const documentId = requireId(payload.id || randomId('doc_'), 'documentId');
    const folderId = requireId(payload.folderId || ROOT_FOLDER_ID, 'folderId');
    const title = requireTitle(payload.title, 'Document title');
    const content = requireContent(payload.content);
    const checksum = await sha256Text(content);
    const timestamp = nowMs();
    transaction(function () {
        requireFolder(folderId);
        if (row('SELECT id FROM documents WHERE id=?', [documentId])) {
            throw appError('DOCUMENT_CONFLICT', 'A document with this ID already exists.', 409);
        }
        execute(
            "INSERT INTO documents (id, workspace_id, folder_id, title, content, content_format, document_type, status, language, source_mode, word_count, checksum, version, created_at, updated_at, last_opened_at) VALUES (?, ?, ?, ?, ?, 'markdown', 'document', 'active', 'ko', 'internal', ?, ?, 1, ?, ?, ?)",
            [documentId, WORKSPACE_ID, folderId, title, content, wordCount(content), checksum, timestamp, timestamp, timestamp]
        );
        execute(
            "INSERT INTO document_versions (id, document_id, version_no, title, content, checksum, change_type, change_summary, created_at) VALUES (?, ?, 1, ?, ?, ?, 'manual_save', ?, ?)",
            [randomId('version_'), documentId, title, content, checksum, 'Initial SQLite WASM save', timestamp]
        );
    });
    return getDocument(documentId);
}

async function updateDocument(documentId, payloadInput) {
    const normalizedId = requireId(documentId, 'documentId');
    const payload = payloadInput && typeof payloadInput === 'object' ? payloadInput : {};
    const expectedVersion = Number(payload.expectedVersion);
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
        throw appError('EXPECTED_VERSION_REQUIRED', 'expectedVersion is required.');
    }
    const current = row('SELECT * FROM documents WHERE id=? AND workspace_id=? AND deleted_at IS NULL', [normalizedId, WORKSPACE_ID]);
    if (!current) throw appError('DOCUMENT_NOT_FOUND', 'Document not found.', 404);
    if (Number(current.version) !== expectedVersion) {
        throw appError('VERSION_CONFLICT', 'The document was changed by another operation.', 409, { currentVersion: Number(current.version) });
    }
    const title = requireTitle(payload.title === undefined ? current.title : payload.title, 'Document title');
    const content = requireContent(payload.content === undefined ? current.content : payload.content);
    const folderId = requireId(payload.folderId === undefined ? current.folder_id : payload.folderId, 'folderId');
    const checksum = await sha256Text(content);
    const nextVersion = expectedVersion + 1;
    const timestamp = nowMs();
    transaction(function () {
        requireFolder(folderId);
        const changed = execute(
            'UPDATE documents SET folder_id=?, title=?, content=?, word_count=?, checksum=?, version=?, updated_at=?, last_opened_at=? WHERE id=? AND version=? AND deleted_at IS NULL',
            [folderId, title, content, wordCount(content), checksum, nextVersion, timestamp, timestamp, normalizedId, expectedVersion]
        );
        if (changed !== 1) throw appError('VERSION_CONFLICT', 'Document update conflict.', 409);
        execute(
            "INSERT INTO document_versions (id, document_id, version_no, title, content, checksum, change_type, change_summary, created_at) VALUES (?, ?, ?, ?, ?, ?, 'manual_save', ?, ?)",
            [randomId('version_'), normalizedId, nextVersion, title, content, checksum, String(payload.changeSummary || 'SQLite WASM document update').slice(0, 500), timestamp]
        );
    });
    return getDocument(normalizedId);
}

function deleteDocument(documentId, expectedVersionInput) {
    const normalizedId = requireId(documentId, 'documentId');
    const expectedVersion = Number(expectedVersionInput);
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
        throw appError('EXPECTED_VERSION_REQUIRED', 'expectedVersion is required.');
    }
    const timestamp = nowMs();
    const changed = transaction(function () {
        return execute(
            'UPDATE documents SET deleted_at=?, updated_at=?, version=version+1 WHERE id=? AND workspace_id=? AND version=? AND deleted_at IS NULL',
            [timestamp, timestamp, normalizedId, WORKSPACE_ID, expectedVersion]
        );
    });
    if (changed !== 1) {
        const current = row('SELECT version FROM documents WHERE id=? AND deleted_at IS NULL', [normalizedId]);
        if (current) throw appError('VERSION_CONFLICT', 'The document was changed before deletion.', 409, { currentVersion: Number(current.version) });
        throw appError('DOCUMENT_NOT_FOUND', 'Document not found.', 404);
    }
    return { id: normalizedId, deleted: true };
}

function listDocumentVersions(documentId) {
    const normalizedId = requireId(documentId, 'documentId');
    getDocument(normalizedId);
    return rows(
        'SELECT id, version_no, title, checksum, change_type, change_summary, created_at FROM document_versions WHERE document_id=? ORDER BY version_no DESC',
        [normalizedId]
    ).map(function (item) {
        return {
            id: item.id, version: Number(item.version_no), title: item.title, checksum: item.checksum,
            changeType: item.change_type, changeSummary: item.change_summary, createdAt: Number(item.created_at) || null
        };
    });
}

function restoreDocumentVersion(documentId, versionInput, expectedVersionInput) {
    const normalizedId = requireId(documentId, 'documentId');
    const versionNumber = Number(versionInput);
    const expectedVersion = Number(expectedVersionInput);
    if (!Number.isInteger(versionNumber) || versionNumber < 1 || !Number.isInteger(expectedVersion) || expectedVersion < 1) {
        throw appError('INVALID_VERSION', 'Document version is invalid.');
    }
    transaction(function () {
        const current = row('SELECT * FROM documents WHERE id=? AND deleted_at IS NULL', [normalizedId]);
        if (!current) throw appError('DOCUMENT_NOT_FOUND', 'Document not found.', 404);
        if (Number(current.version) !== expectedVersion) {
            throw appError('VERSION_CONFLICT', 'The document changed before restore.', 409, { currentVersion: Number(current.version) });
        }
        const source = row('SELECT * FROM document_versions WHERE document_id=? AND version_no=?', [normalizedId, versionNumber]);
        if (!source) throw appError('VERSION_NOT_FOUND', 'Document version not found.', 404);
        const nextVersion = expectedVersion + 1;
        const timestamp = nowMs();
        execute(
            'UPDATE documents SET title=?, content=?, checksum=?, word_count=?, version=?, updated_at=? WHERE id=? AND version=?',
            [source.title, source.content, source.checksum, wordCount(source.content), nextVersion, timestamp, normalizedId, expectedVersion]
        );
        execute(
            "INSERT INTO document_versions (id, document_id, version_no, title, content, checksum, change_type, change_summary, created_at) VALUES (?, ?, ?, ?, ?, ?, 'restore', ?, ?)",
            [randomId('version_'), normalizedId, nextVersion, source.title, source.content, source.checksum, 'Restored version ' + versionNumber, timestamp]
        );
    });
    return getDocument(normalizedId);
}

function listFolders() {
    return rows(
        "SELECT * FROM folders WHERE workspace_id=? AND deleted_at IS NULL ORDER BY CASE WHEN id='root' THEN 0 ELSE 1 END, sort_order, name, id",
        [WORKSPACE_ID]
    ).map(folderResult);
}

function createFolder(payloadInput) {
    const payload = payloadInput && typeof payloadInput === 'object' ? payloadInput : {};
    const folderId = requireId(payload.id || randomId('folder_'), 'folderId');
    const parentId = payload.parentId ? requireId(payload.parentId, 'parentId') : null;
    const name = requireTitle(payload.name, 'Folder name');
    const timestamp = nowMs();
    transaction(function () {
        if (parentId) requireFolder(parentId);
        if (row('SELECT id FROM folders WHERE id=?', [folderId])) {
            throw appError('FOLDER_CONFLICT', 'A folder with this ID already exists.', 409);
        }
        try {
            execute(
                'INSERT INTO folders (id, workspace_id, parent_id, name, sort_order, is_expanded, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)',
                [folderId, WORKSPACE_ID, parentId, name, Number(payload.sortOrder) || 0, timestamp, timestamp]
            );
        } catch (error) {
            if (error.code) throw error;
            throw appError('FOLDER_CONFLICT', 'A folder with this name or ID already exists.', 409);
        }
    });
    return getFolder(folderId);
}

function updateFolder(folderId, payloadInput) {
    const normalizedId = requireId(folderId, 'folderId');
    if (normalizedId === ROOT_FOLDER_ID) throw appError('ROOT_FOLDER_LOCKED', 'ROOT folder cannot be modified.', 409);
    const payload = payloadInput && typeof payloadInput === 'object' ? payloadInput : {};
    transaction(function () {
        const current = requireFolder(normalizedId);
        const name = requireTitle(payload.name === undefined ? current.name : payload.name, 'Folder name');
        const parentValue = payload.parentId === undefined ? current.parent_id : payload.parentId;
        const parentId = parentValue ? requireId(parentValue, 'parentId') : null;
        if (parentId) {
            requireFolder(parentId);
            const cycle = row(
                'WITH RECURSIVE descendants(id) AS (SELECT id FROM folders WHERE parent_id=? AND deleted_at IS NULL UNION ALL SELECT child.id FROM folders child JOIN descendants parent ON child.parent_id=parent.id WHERE child.deleted_at IS NULL) SELECT 1 AS found FROM descendants WHERE id=? LIMIT 1',
                [normalizedId, parentId]
            );
            if (parentId === normalizedId || cycle) throw appError('FOLDER_CYCLE', 'A folder cannot be moved into itself.', 409);
        }
        try {
            execute(
                'UPDATE folders SET name=?, parent_id=?, sort_order=?, updated_at=? WHERE id=? AND deleted_at IS NULL',
                [name, parentId, payload.sortOrder === undefined ? Number(current.sort_order) : Number(payload.sortOrder) || 0, nowMs(), normalizedId]
            );
        } catch (error) {
            if (error.code) throw error;
            throw appError('FOLDER_CONFLICT', 'Folder update conflicts with existing data.', 409);
        }
    });
    return getFolder(normalizedId);
}

function deleteFolder(folderId) {
    const normalizedId = requireId(folderId, 'folderId');
    if (normalizedId === ROOT_FOLDER_ID) throw appError('ROOT_FOLDER_LOCKED', 'ROOT folder cannot be deleted.', 409);
    const timestamp = nowMs();
    let movedDocuments = 0;
    transaction(function () {
        const folder = requireFolder(normalizedId);
        movedDocuments = Number(value('SELECT count(*) FROM documents WHERE folder_id=? AND deleted_at IS NULL', [normalizedId])) || 0;
        execute('UPDATE documents SET folder_id=?, version=version+1, updated_at=? WHERE folder_id=? AND deleted_at IS NULL', [ROOT_FOLDER_ID, timestamp, normalizedId]);
        execute('UPDATE folders SET parent_id=?, updated_at=? WHERE parent_id=? AND deleted_at IS NULL', [folder.parent_id, timestamp, normalizedId]);
        execute('UPDATE folders SET deleted_at=?, updated_at=? WHERE id=? AND deleted_at IS NULL', [timestamp, timestamp, normalizedId]);
    });
    return { id: normalizedId, deleted: true, movedDocuments: movedDocuments };
}

function listSettings(options) {
    const config = options || {};
    const clauses = [];
    const bind = [];
    if (config.scopeType) {
        const scope = String(config.scopeType).trim().toLowerCase();
        if (self.MDPWasmSettingPolicy.SCOPE_PRIORITY.indexOf(scope) < 0) {
            throw appError('INVALID_SETTING_SCOPE', 'Setting scope is invalid.');
        }
        clauses.push('scope_type=?');
        bind.push(scope);
    }
    if (config.scopeId !== undefined && config.scopeId !== null) {
        clauses.push('scope_id=?');
        bind.push(String(config.scopeId).trim());
    }
    if (config.group) {
        clauses.push('setting_group=?');
        bind.push(String(config.group).trim());
    }
    const where = clauses.length ? ' WHERE ' + clauses.join(' AND ') : '';
    return rows(
        "SELECT * FROM settings" + where + " ORDER BY CASE scope_type WHEN 'global' THEN 0 WHEN 'profile' THEN 1 WHEN 'workspace' THEN 2 WHEN 'feature' THEN 3 WHEN 'document' THEN 4 ELSE 99 END, setting_group, setting_key, scope_id",
        bind
    ).map(settingResult);
}

function normalizeWorkFilePayload(payloadInput) {
    const payload = payloadInput && typeof payloadInput === 'object' ? payloadInput : {};
    const appId = String(payload.appId || '').trim().toLowerCase();
    const workType = String(payload.workType || '').trim().toLowerCase();
    const rawName = String(payload.fileName || '').replace(/\\/g, '/').split('/').pop().trim();
    const bytes = payload.bytes instanceof Uint8Array
        ? payload.bytes
        : (payload.bytes instanceof ArrayBuffer ? new Uint8Array(payload.bytes) : null);
    if (!SAFE_APP_RE.test(appId)) throw appError('WORK_FILE_APP_INVALID', 'Work file app identifier is invalid.');
    if (!Object.prototype.hasOwnProperty.call(WORK_FILE_TYPES, workType)) {
        throw appError('WORK_FILE_TYPE_UNSUPPORTED', 'SQLite WASM does not support this work file type.', 415);
    }
    const type = WORK_FILE_TYPES[workType];
    const extensionPattern = new RegExp('\\.' + type.extension + '$', 'i');
    if (!rawName || rawName.length > 255 || rawName.indexOf('\u0000') >= 0 || !extensionPattern.test(rawName)) {
        throw appError('WORK_FILE_NAME_INVALID', 'Work file must use the .' + type.extension + ' extension.');
    }
    if (!bytes || bytes.byteLength <= 0) throw appError('WORK_FILE_EMPTY', 'Work file is empty.');
    if (bytes.byteLength > type.maxBytes) {
        throw appError('WORK_FILE_TOO_LARGE', 'Work file exceeds the browser storage limit for this format.', 413, {
            sizeBytes: bytes.byteLength,
            maxBytes: type.maxBytes
        });
    }
    let validation = {};
    if (type.kind === 'fma') {
        if (bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 0x03 || bytes[3] !== 0x04) {
            throw appError('FMA_ARCHIVE_INVALID', 'FMA file is not a valid ZIP archive.');
        }
        validation = payload.validation && typeof payload.validation === 'object' ? payload.validation : {};
    } else if (type.kind === 'markdown') {
        let markdown = '';
        try {
            markdown = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        } catch (_) {
            throw appError('MARKDOWN_ENCODING_INVALID', 'Markdown work file must be valid UTF-8.');
        }
        if (markdown.indexOf('\u0000') >= 0) {
            throw appError('MARKDOWN_CONTENT_INVALID', 'Markdown work file contains an invalid null character.');
        }
        validation = {
            format: 'markdown',
            workType: workType,
            lineCount: markdown ? markdown.split(/\r\n|\r|\n/).length : 0,
            characterCount: markdown.length
        };
    }
    return {
        appId: appId,
        workType: workType,
        fileName: rawName,
        extension: type.extension,
        mimeType: type.mimeType,
        bytes: bytes,
        validation: validation
    };
}

function workFileResult(source, appId) {
    return {
        id: source.id,
        assetId: source.asset_id,
        appId: appId,
        workType: String(source.remote_revision || ''),
        name: source.name,
        extension: String(source.extension || ''),
        mimeType: String(source.mime_type || 'application/octet-stream'),
        sizeBytes: Number(source.size_bytes) || 0,
        checksumSha256: String(source.checksum || ''),
        createdAt: Number(source.created_at) || null,
        updatedAt: Number(source.updated_at) || null,
        downloadUrl: null
    };
}

async function uploadWorkFile(payloadInput) {
    const payload = normalizeWorkFilePayload(payloadInput);
    const checksum = await sha256Bytes(payload.bytes);
    const timestamp = nowMs();
    const sourceId = 'source_sqlite_workfiles_' + payload.appId;
    const entryId = randomId('file_');
    let assetId = randomId('asset_');
    let deduplicatedAsset = false;
    const logicalPath = payload.appId + '/' + timestamp + '/' + entryId.slice(-12) + '_' + payload.fileName;

    transaction(function () {
        execute(
            "INSERT INTO workspace_sources (id, workspace_id, source_type, name, root_uri, config_json, sync_direction, is_enabled, status, created_at, updated_at) "
            + "VALUES (?, ?, 'internal_library', ?, ?, ?, 'manual', 1, 'ready', ?, ?) "
            + "ON CONFLICT(id) DO UPDATE SET name=excluded.name, config_json=excluded.config_json, is_enabled=1, status='ready', updated_at=excluded.updated_at",
            [sourceId, WORKSPACE_ID, payload.appId + ' SQLite 작업파일', 'sqlite://workfiles/' + payload.appId,
                JSON.stringify({ appId: payload.appId, kind: 'workfiles' }), timestamp, timestamp]
        );

        const existing = row(
            'SELECT a.id, a.storage_type, a.size_bytes, b.asset_id AS blob_asset_id FROM assets a '
            + 'LEFT JOIN asset_blobs b ON b.asset_id=a.id '
            + 'WHERE a.workspace_id=? AND a.checksum_sha256=? AND a.deleted_at IS NULL',
            [WORKSPACE_ID, checksum]
        );
        if (existing) {
            assetId = String(existing.id);
            deduplicatedAsset = existing.storage_type === 'sqlite_blob'
                && Boolean(existing.blob_asset_id)
                && Number(existing.size_bytes) === payload.bytes.byteLength;
            if (!deduplicatedAsset) {
                execute(
                    "UPDATE assets SET asset_type='attachment', storage_type='sqlite_blob', original_name=?, stored_name=?, "
                    + "relative_path=NULL, external_url=NULL, mime_type=?, extension=?, size_bytes=?, checksum_sha256=?, "
                    + "source_provider=?, updated_at=? WHERE id=?",
                    [payload.fileName, checksum + '.' + payload.extension, payload.mimeType, payload.extension, payload.bytes.byteLength, checksum,
                        'sqlite_workfiles:' + payload.appId, timestamp, assetId]
                );
                execute(
                    'INSERT INTO asset_blobs (asset_id, blob_data, created_at) VALUES (?, ?, ?) '
                    + 'ON CONFLICT(asset_id) DO UPDATE SET blob_data=excluded.blob_data, created_at=excluded.created_at',
                    [assetId, payload.bytes, timestamp]
                );
            }
        } else {
            execute(
                "INSERT INTO assets (id, workspace_id, asset_type, storage_type, original_name, stored_name, mime_type, extension, "
                + "size_bytes, checksum_sha256, source_provider, created_at, updated_at) "
                + "VALUES (?, ?, 'attachment', 'sqlite_blob', ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [assetId, WORKSPACE_ID, payload.fileName, checksum + '.' + payload.extension, payload.mimeType, payload.extension, payload.bytes.byteLength,
                    checksum, 'sqlite_workfiles:' + payload.appId, timestamp, timestamp]
            );
            execute(
                'INSERT INTO asset_blobs (asset_id, blob_data, created_at) VALUES (?, ?, ?)',
                [assetId, payload.bytes, timestamp]
            );
        }

        execute(
            "INSERT INTO file_entries (id, source_id, entry_type, path, name, extension, mime_type, asset_id, size_bytes, "
            + "modified_at, remote_revision, checksum, base_checksum, sync_status, created_at, updated_at) "
            + "VALUES (?, ?, 'file', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced', ?, ?)",
            [entryId, sourceId, logicalPath, payload.fileName, payload.extension, payload.mimeType, assetId, payload.bytes.byteLength,
                timestamp, payload.workType, checksum, checksum, timestamp, timestamp]
        );
    });

    return {
        id: entryId,
        assetId: assetId,
        appId: payload.appId,
        workType: payload.workType,
        name: payload.fileName,
        mimeType: payload.mimeType,
        sizeBytes: payload.bytes.byteLength,
        checksumSha256: checksum,
        createdAt: timestamp,
        deduplicatedAsset: deduplicatedAsset,
        validation: payload.validation,
        downloadUrl: null
    };
}

function listWorkFiles(options) {
    const config = options || {};
    const appId = String(config.appId || 'fmaviewer').trim().toLowerCase();
    if (!SAFE_APP_RE.test(appId)) throw appError('WORK_FILE_APP_INVALID', 'Work file app identifier is invalid.');
    const workType = String(config.workType || '').trim().toLowerCase();
    if (workType && !Object.prototype.hasOwnProperty.call(WORK_FILE_TYPES, workType)) {
        throw appError('WORK_FILE_TYPE_UNSUPPORTED', 'SQLite WASM does not support this work file type.', 415);
    }
    const query = String(config.query || '').trim();
    if (query.length > MAX_SEARCH_LENGTH) throw appError('WORK_FILE_QUERY_TOO_LONG', 'Work file search query is too long.');
    const limit = Math.max(1, Math.min(Number(config.limit) || 100, 500));
    const clauses = ['f.source_id=?', 'f.deleted_at IS NULL', 'a.deleted_at IS NULL'];
    const bind = ['source_sqlite_workfiles_' + appId];
    if (query) {
        const pattern = '%' + query.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_') + '%';
        clauses.push("(f.name LIKE ? ESCAPE '\\' OR f.path LIKE ? ESCAPE '\\')");
        bind.push(pattern, pattern);
    }
    if (workType) {
        clauses.push('f.remote_revision=?');
        bind.push(workType);
    }
    bind.push(limit);
    const items = rows(
        'SELECT f.id, f.source_id, f.asset_id, f.name, f.extension, f.mime_type, f.size_bytes, f.remote_revision, '
        + 'f.checksum, f.created_at, f.updated_at FROM file_entries f JOIN assets a ON a.id=f.asset_id '
        + 'WHERE ' + clauses.join(' AND ') + ' ORDER BY f.created_at DESC, f.id DESC LIMIT ?',
        bind
    ).map(function (item) { return workFileResult(item, appId); });
    return { items: items, query: query, appId: appId, workType: workType || null, limit: limit };
}

function requireWorkFile(entryId) {
    const normalizedId = requireId(entryId, 'fileEntryId');
    const item = row(
        'SELECT f.id, f.source_id, f.asset_id, f.name, f.extension, f.mime_type, f.size_bytes, f.remote_revision, '
        + 'f.checksum, f.created_at, f.updated_at, a.storage_type, a.checksum_sha256, b.blob_data '
        + 'FROM file_entries f JOIN workspace_sources s ON s.id=f.source_id JOIN assets a ON a.id=f.asset_id '
        + 'LEFT JOIN asset_blobs b ON b.asset_id=a.id '
        + "WHERE f.id=? AND s.workspace_id=? AND s.id LIKE 'source_sqlite_workfiles_%' "
        + 'AND f.deleted_at IS NULL AND a.deleted_at IS NULL',
        [normalizedId, WORKSPACE_ID]
    );
    if (!item) throw appError('WORK_FILE_NOT_FOUND', 'Work file was not found.', 404);
    if (item.storage_type !== 'sqlite_blob' || !(item.blob_data instanceof Uint8Array)) {
        throw appError('WORK_FILE_ASSET_MISSING', 'Stored work file bytes are not available in this browser database.', 409);
    }
    if (item.blob_data.byteLength !== Number(item.size_bytes)) {
        throw appError('WORK_FILE_SIZE_MISMATCH', 'Stored work file size does not match its metadata.', 409);
    }
    return item;
}

function downloadWorkFile(entryId) {
    const item = requireWorkFile(entryId);
    const sourcePrefix = 'source_sqlite_workfiles_';
    const result = workFileResult(item, String(item.source_id || '').slice(sourcePrefix.length));
    result.bytes = new Uint8Array(item.blob_data);
    return result;
}

function getExplorerFileEntry(entryId) {
    const normalizedId = requireId(entryId, 'fileEntryId');
    const item = row(
        'SELECT e.id, e.source_id, s.name AS source_name, e.parent_id, e.entry_type, e.path, e.name, '
        + 'e.extension, e.mime_type, e.content_text, e.size_bytes, e.modified_at, e.remote_revision, e.checksum, '
        + 'e.sync_status, e.created_at, e.updated_at FROM file_entries e JOIN workspace_sources s ON s.id=e.source_id '
        + 'WHERE e.id=? AND s.workspace_id=? AND e.deleted_at IS NULL',
        [normalizedId, WORKSPACE_ID]
    );
    if (!item) throw appError('FILE_ENTRY_NOT_FOUND', 'File entry not found.', 404);
    return {
        id: item.id, sourceId: item.source_id, sourceName: item.source_name, parentId: item.parent_id,
        entryType: item.entry_type, path: item.path, name: item.name, extension: item.extension,
        mimeType: item.mime_type, content: item.content_text, sizeBytes: Number(item.size_bytes) || 0,
        modifiedAt: Number(item.modified_at) || null, workType: String(item.remote_revision || ''),
        checksum: item.checksum, syncStatus: item.sync_status,
        createdAt: Number(item.created_at) || null, updatedAt: Number(item.updated_at) || null
    };
}

function getExplorerSnapshot(options) {
    const config = options || {};
    const query = String(config.query || '').trim();
    if (query.length > MAX_SEARCH_LENGTH) throw appError('SEARCH_QUERY_TOO_LONG', 'Search query is too long.');
    const limit = Math.max(1, Math.min(Number(config.limit) || 200, 500));
    const pattern = '%' + query.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_') + '%';

    const documentWhere = [
        'd.workspace_id=?',
        'd.deleted_at IS NULL'
    ];
    const documentBind = [WORKSPACE_ID];
    if (query) {
        documentWhere.push("(d.title LIKE ? ESCAPE '\\' OR d.id LIKE ? ESCAPE '\\' OR COALESCE(f.name, '') LIKE ? ESCAPE '\\')");
        documentBind.push(pattern, pattern, pattern);
    }
    documentBind.push(limit);
    const documents = rows(
        'SELECT d.id, d.workspace_id, d.folder_id, d.title, d.content_format, d.document_type, d.status, '
        + 'd.word_count, d.version, d.checksum, d.source_mode, d.created_at, d.updated_at, d.last_opened_at, '
        + 'f.name AS folder_name FROM documents d LEFT JOIN folders f ON f.id=d.folder_id AND f.deleted_at IS NULL '
        + 'WHERE ' + documentWhere.join(' AND ') + ' ORDER BY d.updated_at DESC, d.id ASC LIMIT ?',
        documentBind
    ).map(function (item) {
        return Object.assign(documentSummary(item), {
            checksum: item.checksum,
            sourceMode: item.source_mode,
            folderName: item.folder_name
        });
    });

    const folderWhere = ['workspace_id=?', 'deleted_at IS NULL'];
    const folderBind = [WORKSPACE_ID];
    if (query) {
        folderWhere.push("(name LIKE ? ESCAPE '\\' OR id LIKE ? ESCAPE '\\')");
        folderBind.push(pattern, pattern);
    }
    folderBind.push(limit);
    const folders = rows(
        'SELECT folders.*, (SELECT COUNT(*) FROM documents d WHERE d.folder_id=folders.id AND d.deleted_at IS NULL) AS document_count '
        + 'FROM folders WHERE ' + folderWhere.join(' AND ')
        + " ORDER BY CASE WHEN id='root' THEN 0 ELSE 1 END, sort_order, name, id LIMIT ?",
        folderBind
    ).map(function (item) {
        return Object.assign(folderResult(item), { documentCount: Number(item.document_count) || 0 });
    });

    const settingWhere = [];
    const settingBind = [];
    if (query) {
        settingWhere.push("(setting_key LIKE ? ESCAPE '\\' OR setting_group LIKE ? ESCAPE '\\' OR scope_type LIKE ? ESCAPE '\\' OR scope_id LIKE ? ESCAPE '\\' OR value_json LIKE ? ESCAPE '\\')");
        settingBind.push(pattern, pattern, pattern, pattern, pattern);
    }
    settingBind.push(limit);
    const settings = rows(
        'SELECT * FROM settings' + (settingWhere.length ? ' WHERE ' + settingWhere.join(' AND ') : '')
        + ' ORDER BY updated_at DESC, setting_group, setting_key LIMIT ?',
        settingBind
    ).map(settingResult);

    const checkpoints = rows(
        "SELECT key, value_json, updated_at FROM app_meta WHERE key LIKE 'indexeddb_migration:%' ORDER BY updated_at DESC, key DESC LIMIT ?",
        [limit]
    ).map(function (item) {
        let metadata = {};
        try { metadata = JSON.parse(item.value_json) || {}; } catch (_) { metadata = { status: 'invalid_metadata' }; }
        return {
            key: item.key,
            migrationId: String(item.key).split(':').slice(1).join(':'),
            status: metadata.status,
            fingerprint: metadata.fingerprint,
            applied: metadata.applied || {},
            verified: metadata.verified || {},
            backup: metadata.backup || null,
            completedAt: metadata.completedAt || null,
            updatedAt: Number(item.updated_at) || null
        };
    });

    const sources = rows(
        'SELECT id, source_type, name, root_uri, sync_direction, is_enabled, status, last_synced_at, created_at, updated_at '
        + 'FROM workspace_sources WHERE workspace_id=? ORDER BY updated_at DESC, id ASC LIMIT ?',
        [WORKSPACE_ID, limit]
    ).map(function (item) {
        return {
            id: item.id, type: item.source_type, name: item.name, rootUri: item.root_uri,
            syncDirection: item.sync_direction, isEnabled: item.is_enabled === 1, status: item.status,
            lastSyncedAt: Number(item.last_synced_at) || null, createdAt: Number(item.created_at) || null,
            updatedAt: Number(item.updated_at) || null
        };
    });

    const fileWhere = ['s.workspace_id=?', 'e.deleted_at IS NULL'];
    const fileBind = [WORKSPACE_ID];
    if (query) {
        fileWhere.push("(e.path LIKE ? ESCAPE '\\' OR e.name LIKE ? ESCAPE '\\' OR s.name LIKE ? ESCAPE '\\')");
        fileBind.push(pattern, pattern, pattern);
    }
    fileBind.push(limit);
    const fileEntries = rows(
        'SELECT e.id, e.source_id, s.name AS source_name, e.parent_id, e.entry_type, e.path, e.name, '
        + 'e.extension, e.mime_type, e.size_bytes, e.modified_at, e.remote_revision, e.checksum, e.sync_status, '
        + 'e.created_at, e.updated_at FROM file_entries e JOIN workspace_sources s ON s.id=e.source_id '
        + 'WHERE ' + fileWhere.join(' AND ') + " ORDER BY CASE WHEN e.entry_type='folder' THEN 0 ELSE 1 END, e.path, e.id LIMIT ?",
        fileBind
    ).map(function (item) {
        return {
            id: item.id, sourceId: item.source_id, sourceName: item.source_name, parentId: item.parent_id,
            entryType: item.entry_type, path: item.path, name: item.name, extension: item.extension,
            mimeType: item.mime_type, sizeBytes: Number(item.size_bytes) || 0,
            modifiedAt: Number(item.modified_at) || null, workType: String(item.remote_revision || ''),
            checksum: item.checksum, syncStatus: item.sync_status,
            createdAt: Number(item.created_at) || null, updatedAt: Number(item.updated_at) || null
        };
    });

    return {
        readOnly: true,
        query: query,
        limit: limit,
        database: {
            path: 'OPFS:' + DATABASE_NAME,
            schemaVersion: Number(value('SELECT COALESCE(MAX(version), 0) FROM schema_migrations')) || 0,
            sqliteVersion: String(value('SELECT sqlite_version()')),
            journalMode: String(value('PRAGMA journal_mode'))
        },
        counts: {
            documents: Number(value('SELECT COUNT(*) FROM documents WHERE workspace_id=? AND deleted_at IS NULL', [WORKSPACE_ID])) || 0,
            deletedDocuments: Number(value('SELECT COUNT(*) FROM documents WHERE workspace_id=? AND deleted_at IS NOT NULL', [WORKSPACE_ID])) || 0,
            folders: Number(value('SELECT COUNT(*) FROM folders WHERE workspace_id=? AND deleted_at IS NULL', [WORKSPACE_ID])) || 0,
            versions: Number(value('SELECT COUNT(*) FROM document_versions v JOIN documents d ON d.id=v.document_id WHERE d.workspace_id=?', [WORKSPACE_ID])) || 0,
            backups: 0,
            migrationCheckpoints: Number(value("SELECT COUNT(*) FROM app_meta WHERE key LIKE 'indexeddb_migration:%'")) || 0,
            sources: Number(value('SELECT COUNT(*) FROM workspace_sources WHERE workspace_id=?', [WORKSPACE_ID])) || 0,
            fileEntries: Number(value('SELECT COUNT(*) FROM file_entries e JOIN workspace_sources s ON s.id=e.source_id WHERE s.workspace_id=? AND e.deleted_at IS NULL', [WORKSPACE_ID])) || 0,
            settings: Number(value('SELECT COUNT(*) FROM settings')) || 0
        },
        documents: documents,
        folders: folders,
        backups: [],
        migrationCheckpoints: checkpoints,
        sources: sources,
        fileEntries: fileEntries,
        settings: settings
    };
}

function putSetting(payload) {
    const item = self.MDPWasmSettingPolicy.validateSetting(payload);
    const timestamp = nowMs();
    execute(
        'INSERT INTO settings (scope_type, scope_id, setting_group, setting_key, value_json, value_type, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(scope_type, scope_id, setting_group, setting_key) DO UPDATE SET value_json=excluded.value_json, value_type=excluded.value_type, updated_at=excluded.updated_at',
        [item.scopeType, item.scopeId, item.group, item.key, item.valueJson, item.valueType, timestamp]
    );
    return {
        scopeType: item.scopeType, scopeId: item.scopeId, group: item.group, key: item.key,
        value: item.value, valueType: item.valueType, updatedAt: timestamp
    };
}

function getResolvedSettings(options) {
    const config = options || {};
    const scopeIds = {
        global: '',
        profile: String(config.profileId || PROFILE_ID).trim(),
        workspace: String(config.workspaceId || WORKSPACE_ID).trim(),
        feature: String(config.featureId || '').trim(),
        document: String(config.documentId || '').trim()
    };
    const selected = new Map();
    self.MDPWasmSettingPolicy.SCOPE_PRIORITY.forEach(function (scopeType) {
        const scopeId = scopeIds[scopeType];
        if (scopeType !== 'global' && !scopeId) return;
        listSettings({ scopeType: scopeType, scopeId: scopeId }).forEach(function (item) {
            selected.set(item.group + '\u0000' + item.key, item);
        });
    });
    const items = Array.from(selected.values()).sort(function (left, right) {
        return (left.group + '\u0000' + left.key).localeCompare(right.group + '\u0000' + right.key);
    });
    const values = {};
    items.forEach(function (item) { values[item.key] = item.value; });
    return { precedence: self.MDPWasmSettingPolicy.SCOPE_PRIORITY.slice(), scopeIds: scopeIds, values: values, items: items };
}

function integrityCheck() {
    const quick = rows('PRAGMA quick_check').map(Object.values).flat().map(String);
    const integrity = rows('PRAGMA integrity_check').map(Object.values).flat().map(String);
    const foreignKeys = rows('PRAGMA foreign_key_check');
    return {
        ok: quick.every(function (item) { return item.toLowerCase() === 'ok'; })
            && integrity.every(function (item) { return item.toLowerCase() === 'ok'; })
            && foreignKeys.length === 0,
        quickCheck: quick,
        integrityCheck: integrity,
        foreignKeyViolations: foreignKeys
    };
}

function migrationCore(payloadInput) {
    const payload = payloadInput && typeof payloadInput === 'object' ? payloadInput : {};
    return {
        source: payload.source || {},
        folders: Array.isArray(payload.folders) ? payload.folders : [],
        documents: Array.isArray(payload.documents) ? payload.documents : [],
        settings: Array.isArray(payload.settings) ? payload.settings : [],
        settingsClassification: payload.settingsClassification || {}
    };
}

async function migrationFingerprint(payload) {
    return sha256Text(JSON.stringify(migrationCore(payload)));
}

function statusSummary(sourceCount) {
    return { source: sourceCount, new: 0, duplicate: 0, conflict: 0, excluded: 0 };
}

async function previewMigration(payload) {
    const core = migrationCore(payload);
    const folderSummary = statusSummary(core.folders.length);
    const documentSummaryResult = statusSummary(core.documents.length);
    const settingSummary = statusSummary(core.settings.length);
    const excluded = [];

    core.folders.forEach(function (item, index) {
        try {
            const id = requireId(item.id, 'folderId');
            const existing = row('SELECT * FROM folders WHERE id=?', [id]);
            if (!existing) folderSummary.new += 1;
            else if (String(existing.name) === String(id === ROOT_FOLDER_ID ? 'ROOT' : item.name).trim()) folderSummary.duplicate += 1;
            else folderSummary.conflict += 1;
        } catch (error) {
            folderSummary.excluded += 1;
            excluded.push({ kind: 'folder', index: index, reason: error.code || 'INVALID_FOLDER' });
        }
    });
    core.documents.forEach(function (item, index) {
        try {
            const id = requireId(item.id, 'documentId');
            requireTitle(item.title, 'Document title');
            requireContent(item.content);
            const existing = row('SELECT id, title, checksum FROM documents WHERE id=?', [id]);
            if (!existing) documentSummaryResult.new += 1;
            else if (String(existing.checksum || '') === String(item.checksum || '') && String(existing.title) === String(item.title).trim()) documentSummaryResult.duplicate += 1;
            else documentSummaryResult.conflict += 1;
        } catch (error) {
            documentSummaryResult.excluded += 1;
            excluded.push({ kind: 'document', index: index, reason: error.code || 'INVALID_DOCUMENT' });
        }
    });
    core.settings.forEach(function (item, index) {
        try {
            const setting = self.MDPWasmSettingPolicy.validateSetting(item);
            const existing = row(
                'SELECT value_json FROM settings WHERE scope_type=? AND scope_id=? AND setting_group=? AND setting_key=?',
                [setting.scopeType, setting.scopeId, setting.group, setting.key]
            );
            if (!existing) settingSummary.new += 1;
            else if (String(existing.value_json) === String(setting.valueJson)) settingSummary.duplicate += 1;
            else settingSummary.conflict += 1;
        } catch (error) {
            settingSummary.excluded += 1;
            excluded.push({ kind: 'setting', index: index, reason: error.code || 'INVALID_SETTING' });
        }
    });
    const fingerprint = await migrationFingerprint(core);
    const newCount = folderSummary.new + documentSummaryResult.new + settingSummary.new;
    const conflictCount = folderSummary.conflict + documentSummaryResult.conflict + settingSummary.conflict;
    const excludedCount = folderSummary.excluded + documentSummaryResult.excluded + settingSummary.excluded;
    const classification = core.settingsClassification || {};
    return {
        batchFingerprint: fingerprint,
        migrationId: 'indb_' + fingerprint.slice(0, 24),
        summary: {
            folders: folderSummary,
            documents: documentSummaryResult,
            settings: settingSummary,
            settingsClassification: {
                sensitive: Array.isArray(classification.sensitiveKeys) ? classification.sensitiveKeys.length : 0,
                transient: Array.isArray(classification.transientKeys) ? classification.transientKeys.length : 0,
                unknown: Array.isArray(classification.unknownKeys) ? classification.unknownKeys.length : 0
            },
            newCount: newCount,
            duplicateCount: folderSummary.duplicate + documentSummaryResult.duplicate + settingSummary.duplicate,
            conflictCount: conflictCount,
            excludedCount: excludedCount,
            outOfScopeCount: (Array.isArray(payload && payload.files) ? payload.files.length : 0) + (payload && payload.fileSource ? 1 : 0)
        },
        excluded: excluded
    };
}

function orderedFolders(items) {
    const pending = items.filter(function (item) { return String(item.id || '') !== ROOT_FOLDER_ID; }).slice();
    const ordered = [];
    const known = new Set(listFolders().map(function (item) { return item.id; }));
    while (pending.length) {
        const before = pending.length;
        for (let index = pending.length - 1; index >= 0; index -= 1) {
            const parentId = String(pending[index].parentId || ROOT_FOLDER_ID);
            if (known.has(parentId)) {
                const item = pending.splice(index, 1)[0];
                ordered.push(item);
                known.add(String(item.id));
            }
        }
        if (pending.length === before) throw appError('MIGRATION_FOLDER_CYCLE', 'IndexedDB folders contain a cycle or missing parent.', 409);
    }
    return ordered;
}

async function applyMigration(payload) {
    const preview = await previewMigration(payload);
    if (String(payload.previewFingerprint || '') !== preview.batchFingerprint
        || String(payload.migrationId || '') !== preview.migrationId) {
        throw appError('MIGRATION_PREVIEW_MISMATCH', 'Migration payload changed after preview.', 409);
    }
    if (preview.summary.conflictCount || preview.summary.excludedCount) {
        throw appError('MIGRATION_NOT_APPLICABLE', 'Migration contains conflicts or invalid records.', 409, preview.summary);
    }
    const core = migrationCore(payload);
    const liveBytes = poolUtil.exportFile(DATABASE_NAME);
    poolUtil.importDb(MIGRATION_BACKUP_NAME, liveBytes);
    const applied = { folders: 0, documents: 0, settings: 0, fileSources: 0, fileFolders: 0, files: 0 };
    transaction(function () {
        orderedFolders(core.folders).forEach(function (item) {
            const id = requireId(item.id, 'folderId');
            if (row('SELECT id FROM folders WHERE id=?', [id])) return;
            const timestamp = Number(item.createdAt) || nowMs();
            execute(
                'INSERT INTO folders (id, workspace_id, parent_id, name, sort_order, is_expanded, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)',
                [id, WORKSPACE_ID, requireId(item.parentId || ROOT_FOLDER_ID, 'parentId'), requireTitle(item.name, 'Folder name'), Number(item.sortOrder) || 0, timestamp, Number(item.updatedAt) || timestamp]
            );
            applied.folders += 1;
        });
        core.documents.forEach(function (item) {
            const id = requireId(item.id, 'documentId');
            if (row('SELECT id FROM documents WHERE id=?', [id])) return;
            const folderId = requireId(item.folderId || ROOT_FOLDER_ID, 'folderId');
            requireFolder(folderId);
            const title = requireTitle(item.title, 'Document title');
            const content = requireContent(item.content);
            const checksum = String(item.checksum || '');
            const createdAt = Number(item.createdAt) || nowMs();
            const updatedAt = Number(item.updatedAt) || createdAt;
            execute(
                "INSERT INTO documents (id, workspace_id, folder_id, title, content, content_format, document_type, status, language, source_mode, word_count, checksum, version, created_at, updated_at, last_opened_at) VALUES (?, ?, ?, ?, ?, 'markdown', 'document', 'active', 'ko', 'legacy_indb', ?, ?, 1, ?, ?, ?)",
                [id, WORKSPACE_ID, folderId, title, content, wordCount(content), checksum, createdAt, updatedAt, updatedAt]
            );
            execute(
                "INSERT INTO document_versions (id, document_id, version_no, title, content, checksum, change_type, change_summary, created_at) VALUES (?, ?, 1, ?, ?, ?, 'migration', 'IndexedDB to SQLite WASM migration', ?)",
                [randomId('version_'), id, title, content, checksum, updatedAt]
            );
            applied.documents += 1;
        });
        core.settings.forEach(function (item) {
            const setting = self.MDPWasmSettingPolicy.validateSetting(item);
            const existing = row(
                'SELECT value_json FROM settings WHERE scope_type=? AND scope_id=? AND setting_group=? AND setting_key=?',
                [setting.scopeType, setting.scopeId, setting.group, setting.key]
            );
            if (existing && String(existing.value_json) === setting.valueJson) return;
            putSetting(item);
            applied.settings += 1;
        });
        execute(
            'INSERT INTO app_meta (key, value_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json, updated_at=excluded.updated_at',
            [
                'indexeddb_migration:' + preview.migrationId,
                JSON.stringify({ status: 'completed', fingerprint: preview.batchFingerprint, applied: applied }),
                nowMs()
            ]
        );
    });
    return {
        status: 'completed',
        migrationId: preview.migrationId,
        batchFingerprint: preview.batchFingerprint,
        sourcePreserved: true,
        applied: applied,
        verified: {
            folders: applied.folders,
            documents: applied.documents,
            settings: applied.settings,
            files: 0
        },
        backup: {
            type: 'pre_migration',
            filePath: 'OPFS:' + MIGRATION_BACKUP_NAME,
            sizeBytes: liveBytes.byteLength
        },
        outOfScopeCount: preview.summary.outOfScopeCount
    };
}

function exportDatabase(options) {
    const config = options || {};
    const sourceName = config.preMigration === true ? MIGRATION_BACKUP_NAME : DATABASE_NAME;
    const bytes = poolUtil.exportFile(sourceName);
    const exportedAt = new Date();
    const exportDate = String(exportedAt.getFullYear())
        + String(exportedAt.getMonth() + 1).padStart(2, '0')
        + String(exportedAt.getDate()).padStart(2, '0');
    return {
        bytes: bytes,
        fileName: config.preMigration === true
            ? 'mdpro-pre-migration.sqlite'
            : 'mdpro' + exportDate + '.sqlite',
        mimeType: 'application/vnd.sqlite3',
        sizeBytes: bytes.byteLength
    };
}

function firstColumnStrings(connection, sql) {
    return connection.selectObjects(sql).map(function (item) {
        return String(Object.values(item)[0]);
    });
}

function validateImportedDatabase(connection, expectedSchemaVersion) {
    const objectNames = new Set(connection.selectObjects(
        "SELECT name FROM sqlite_schema WHERE type IN ('table', 'view')"
    ).map(function (item) { return String(item.name); }));
    const missingTables = REQUIRED_IMPORT_TABLES.filter(function (name) { return !objectNames.has(name); });
    if (missingTables.length) {
        throw appError('DATABASE_IMPORT_SCHEMA_INVALID', '필수 SQLite 테이블이 없습니다.', 400, {
            missingTables: missingTables
        });
    }
    const schemaVersion = Number(connection.selectValue(
        'SELECT COALESCE(MAX(version), 0) FROM schema_migrations'
    )) || 0;
    if (schemaVersion !== Number(expectedSchemaVersion)) {
        throw appError(
            'DATABASE_IMPORT_SCHEMA_VERSION_MISMATCH',
            'DB schema 버전이 현재 앱과 일치하지 않습니다.',
            409,
            { expected: Number(expectedSchemaVersion), actual: schemaVersion }
        );
    }
    if (!connection.selectValue('SELECT 1 FROM profiles WHERE id=?', [PROFILE_ID])
        || !connection.selectValue('SELECT 1 FROM workspaces WHERE id=?', [WORKSPACE_ID])
        || !connection.selectValue('SELECT 1 FROM folders WHERE id=? AND workspace_id=? AND deleted_at IS NULL', [ROOT_FOLDER_ID, WORKSPACE_ID])) {
        throw appError('DATABASE_IMPORT_BOOTSTRAP_MISSING', '기본 profile, workspace 또는 ROOT 폴더가 없습니다.', 400);
    }

    connection.selectObjects(
        'SELECT scope_type, scope_id, setting_group, setting_key, value_json FROM settings'
    ).forEach(function (source) {
        let parsed;
        try { parsed = JSON.parse(source.value_json); } catch (_) {
            throw appError('DATABASE_IMPORT_SETTING_INVALID', 'DB에 올바르지 않은 설정 JSON이 있습니다.', 400, {
                key: source.setting_key
            });
        }
        const validated = self.MDPWasmSettingPolicy.validateSetting({
            key: source.setting_key,
            value: parsed,
            scopeType: source.scope_type,
            scopeId: source.scope_id
        });
        if (validated.group !== String(source.setting_group)) {
            throw appError('DATABASE_IMPORT_SETTING_POLICY_MISMATCH', 'DB 설정 그룹이 현재 보안 정책과 일치하지 않습니다.', 400, {
                key: source.setting_key
            });
        }
    });

    const quickCheck = firstColumnStrings(connection, 'PRAGMA quick_check');
    const integrityCheckResult = firstColumnStrings(connection, 'PRAGMA integrity_check');
    const foreignKeyViolations = connection.selectObjects('PRAGMA foreign_key_check');
    const checksOk = quickCheck.every(function (item) { return item.toLowerCase() === 'ok'; })
        && integrityCheckResult.every(function (item) { return item.toLowerCase() === 'ok'; })
        && foreignKeyViolations.length === 0;
    if (!checksOk) {
        throw appError('DATABASE_IMPORT_INTEGRITY_FAILED', '불러올 SQLite DB의 무결성 검사에 실패했습니다.', 400, {
            quickCheck: quickCheck,
            integrityCheck: integrityCheckResult,
            foreignKeyViolations: foreignKeyViolations.slice(0, 20)
        });
    }
    return {
        schemaVersion: schemaVersion,
        quickCheck: quickCheck,
        integrityCheck: integrityCheckResult,
        foreignKeyViolations: foreignKeyViolations.length,
        counts: {
            documents: Number(connection.selectValue('SELECT COUNT(*) FROM documents WHERE workspace_id=? AND deleted_at IS NULL', [WORKSPACE_ID])) || 0,
            folders: Number(connection.selectValue('SELECT COUNT(*) FROM folders WHERE workspace_id=? AND deleted_at IS NULL', [WORKSPACE_ID])) || 0,
            versions: Number(connection.selectValue('SELECT COUNT(*) FROM document_versions')) || 0,
            settings: Number(connection.selectValue('SELECT COUNT(*) FROM settings')) || 0
        }
    };
}

function normalizeImportBytes(payload) {
    const source = payload && payload.bytes;
    let bytes;
    if (source instanceof Uint8Array) bytes = source;
    else if (source instanceof ArrayBuffer) bytes = new Uint8Array(source);
    else if (ArrayBuffer.isView(source)) bytes = new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
    else throw appError('DATABASE_IMPORT_FILE_REQUIRED', 'SQLite DB 파일 데이터가 필요합니다.', 400);
    if (bytes.byteLength < 512 || bytes.byteLength > MAX_DATABASE_IMPORT_BYTES || bytes.byteLength % 512 !== 0) {
        throw appError('DATABASE_IMPORT_SIZE_INVALID', 'SQLite DB 파일 크기가 올바르지 않거나 512MB 제한을 초과했습니다.', 413, {
            sizeBytes: bytes.byteLength,
            maxBytes: MAX_DATABASE_IMPORT_BYTES
        });
    }
    const expectedHeader = 'SQLite format 3\u0000';
    for (let index = 0; index < expectedHeader.length; index += 1) {
        if (bytes[index] !== expectedHeader.charCodeAt(index)) {
            throw appError('DATABASE_IMPORT_HEADER_INVALID', 'SQLite format 3 파일이 아닙니다.', 400);
        }
    }
    return bytes;
}

async function importDatabase(payloadInput) {
    const payload = payloadInput && typeof payloadInput === 'object' ? payloadInput : {};
    const bytes = normalizeImportBytes(payload);
    const expectedSchemaVersion = Number(value('SELECT COALESCE(MAX(version), 0) FROM schema_migrations')) || 0;
    const sourceFileName = String(payload.fileName || 'import.sqlite').slice(0, 260);
    let candidate = null;
    let liveBytes = null;
    let mainTouched = false;
    let validation = null;
    try {
        try { poolUtil.unlink(IMPORT_CANDIDATE_NAME); } catch (_) {}
        poolUtil.importDb(IMPORT_CANDIDATE_NAME, bytes);
        candidate = openPoolDatabase(IMPORT_CANDIDATE_NAME);
        validation = validateImportedDatabase(candidate, expectedSchemaVersion);
        candidate.close();
        candidate = null;
        try { poolUtil.unlink(IMPORT_CANDIDATE_NAME); } catch (_) {}

        liveBytes = poolUtil.exportFile(DATABASE_NAME);
        poolUtil.importDb(PRE_IMPORT_BACKUP_NAME, liveBytes);
        database.close();
        database = null;
        mainTouched = true;
        poolUtil.importDb(DATABASE_NAME, bytes);
        database = openPoolDatabase(DATABASE_NAME);
        validation = validateImportedDatabase(database, expectedSchemaVersion);
        execute(
            'INSERT INTO app_meta (key, value_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json, updated_at=excluded.updated_at',
            [
                'last_database_import',
                JSON.stringify({ fileName: sourceFileName, sizeBytes: bytes.byteLength, schemaVersion: validation.schemaVersion }),
                nowMs()
            ]
        );
        return {
            imported: true,
            fileName: sourceFileName,
            sizeBytes: bytes.byteLength,
            validation: validation,
            backup: {
                path: 'OPFS:' + PRE_IMPORT_BACKUP_NAME,
                sizeBytes: liveBytes.byteLength
            },
            databasePath: 'OPFS:' + DATABASE_NAME
        };
    } catch (error) {
        if (candidate) {
            try { candidate.close(); } catch (_) {}
            candidate = null;
        }
        try { poolUtil.unlink(IMPORT_CANDIDATE_NAME); } catch (_) {}
        if (mainTouched && liveBytes) {
            try {
                if (database) database.close();
                database = null;
                poolUtil.importDb(DATABASE_NAME, liveBytes);
                database = openPoolDatabase(DATABASE_NAME);
            } catch (rollbackError) {
                throw appError('DATABASE_IMPORT_ROLLBACK_FAILED', 'DB 불러오기 실패 후 기존 DB 복구에도 실패했습니다.', 500, {
                    importError: String(error && error.message || error),
                    rollbackError: String(rollbackError && rollbackError.message || rollbackError)
                });
            }
        }
        if (error && error.code) throw error;
        throw appError('DATABASE_IMPORT_FAILED', String(error && error.message || 'SQLite DB 불러오기에 실패했습니다.'), 500);
    }
}

async function dispatch(method, args) {
    await initializeDatabase();
    const input = Array.isArray(args) ? args : [];
    switch (method) {
    case 'health': return health();
    case 'bootstrap': return bootstrap();
    case 'listDocuments': return listDocuments(input[0]);
    case 'searchDocuments': return searchDocuments(input[0], input[1]);
    case 'getDocument': return getDocument(input[0]);
    case 'createDocument': return createDocument(input[0]);
    case 'updateDocument': return updateDocument(input[0], input[1]);
    case 'deleteDocument': return deleteDocument(input[0], input[1]);
    case 'listDocumentVersions': return listDocumentVersions(input[0]);
    case 'restoreDocumentVersion': return restoreDocumentVersion(input[0], input[1], input[2]);
    case 'listFolders': return listFolders();
    case 'getFolder': return getFolder(input[0]);
    case 'createFolder': return createFolder(input[0]);
    case 'updateFolder': return updateFolder(input[0], input[1]);
    case 'deleteFolder': return deleteFolder(input[0]);
    case 'listSettings': return listSettings(input[0]);
    case 'getResolvedSettings': return getResolvedSettings(input[0]);
    case 'putSetting': return putSetting(input[0]);
    case 'getExplorerSnapshot': return getExplorerSnapshot(input[0]);
    case 'getExplorerDocument': return getDocument(input[0]);
    case 'listExplorerDocumentVersions': return listDocumentVersions(input[0]);
    case 'getExplorerFileEntry': return getExplorerFileEntry(input[0]);
    case 'uploadWorkFile': return uploadWorkFile(input[0]);
    case 'listWorkFiles': return listWorkFiles(input[0]);
    case 'downloadWorkFile': return downloadWorkFile(input[0]);
    case 'integrityCheck': return integrityCheck();
    case 'previewIndexedDbMigration': return previewMigration(input[0]);
    case 'applyIndexedDbMigration': return applyMigration(input[0]);
    case 'exportDatabase': return exportDatabase(input[0]);
    case 'importDatabase': return importDatabase(input[0]);
    default: throw appError('WASM_METHOD_UNSUPPORTED', 'SQLite WASM method is not supported: ' + method, 501);
    }
}

function serializeError(error) {
    return {
        code: String(error && error.code || 'SQLITE_WASM_ERROR'),
        message: String(error && error.message || 'SQLite WASM operation failed.'),
        status: Number(error && error.status) || 500,
        details: error && error.details && typeof error.details === 'object' ? error.details : {}
    };
}

self.addEventListener('message', function (event) {
    const message = event.data && typeof event.data === 'object' ? event.data : {};
    const id = message.id;
    operationQueue = operationQueue.catch(function () {}).then(async function () {
        try {
            const result = await dispatch(String(message.method || ''), message.args);
            if (result && result.bytes instanceof Uint8Array) {
                self.postMessage({ id: id, ok: true, result: result }, [result.bytes.buffer]);
            } else {
                self.postMessage({ id: id, ok: true, result: result });
            }
        } catch (error) {
            self.postMessage({ id: id, ok: false, error: serializeError(error) });
        }
    });
});
