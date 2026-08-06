'use strict';

const PROFILE_ID = 'profile_default';
const WORKSPACE_ID = 'workspace_default';
const ROOT_FOLDER_ID = 'root';
const WORKER_PARAMETERS = new URL(self.location.href).searchParams;
const TEST_MODE = WORKER_PARAMETERS.get('test') === '1';
const DATABASE_NAME = TEST_MODE ? '/mdpro-browser-test.sqlite' : '/mdpro.sqlite';
const MIGRATION_BACKUP_NAME = TEST_MODE ? '/pre-migration-test.sqlite' : '/pre-migration.sqlite';
const SCHEMA_URL = '../LocalSave_sqlite/migrations/001_initial_v3.sql';
const MANIFEST_URL = '../LocalSave_sqlite/migrations/manifest.json';
const SQLITE_JS_URL = './vendor/sqlite3/sqlite3.js';
const SQLITE_WASM_URL = new URL('./vendor/sqlite3/sqlite3.wasm', self.location.href).href;
const SAFE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const MAX_TITLE_LENGTH = 500;
const MAX_CONTENT_BYTES = 10 * 1024 * 1024;
const MAX_SEARCH_LENGTH = 500;

let sqlite3 = null;
let poolUtil = null;
let database = null;
let initializationPromise = null;
let operationQueue = Promise.resolve();

importScripts('./settings-policy.js');
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
        database = new poolUtil.OpfsSAHPoolDb(DATABASE_NAME);
        database.exec([
            'PRAGMA foreign_keys = ON;',
            'PRAGMA journal_mode = DELETE;',
            'PRAGMA synchronous = NORMAL;',
            'PRAGMA busy_timeout = 5000;',
            'PRAGMA temp_store = MEMORY;',
            'PRAGMA recursive_triggers = ON;'
        ].join('\n'));
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
    explorer: false,
    backup: false,
    backupPackage: false,
    backupExplorer: false,
    restorePreview: false,
    restore: false,
    workFiles: false,
    modelAssets: false,
    fmaPreview: false,
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
    return {
        bytes: bytes,
        fileName: config.preMigration === true ? 'mdpro-pre-migration.sqlite' : 'mdpro.sqlite',
        mimeType: 'application/vnd.sqlite3',
        sizeBytes: bytes.byteLength
    };
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
    case 'integrityCheck': return integrityCheck();
    case 'previewIndexedDbMigration': return previewMigration(input[0]);
    case 'applyIndexedDbMigration': return applyMigration(input[0]);
    case 'exportDatabase': return exportDatabase(input[0]);
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
