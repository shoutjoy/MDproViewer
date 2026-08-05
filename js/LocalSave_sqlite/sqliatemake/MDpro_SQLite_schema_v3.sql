-- MDpro SQLite Database Schema v3
-- Target: Tauri (Rust) + SQLite
-- Persistent source of truth: SQLite
-- Draft/recovery queue: IndexedDB
-- Large binary assets: local filesystem
-- Secrets: OS Credential Store / Tauri Stronghold

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA busy_timeout = 5000;
PRAGMA temp_store = MEMORY;
PRAGMA recursive_triggers = ON;

BEGIN IMMEDIATE;

-- =========================================================
-- 0. Schema and application metadata
-- =========================================================

CREATE TABLE IF NOT EXISTS schema_migrations (
    version         INTEGER PRIMARY KEY,
    name            TEXT NOT NULL,
    checksum        TEXT NOT NULL,
    applied_at      INTEGER NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS app_meta (
    key             TEXT PRIMARY KEY,
    value_json      TEXT NOT NULL CHECK (json_valid(value_json)),
    updated_at      INTEGER NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS profiles (
    id                  TEXT PRIMARY KEY,
    display_name        TEXT NOT NULL,
    academic_id         TEXT,
    major               TEXT,
    contact             TEXT,
    email               TEXT,
    prefix_enabled      INTEGER NOT NULL DEFAULT 0 CHECK (prefix_enabled IN (0, 1)),
    created_at          INTEGER NOT NULL,
    updated_at          INTEGER NOT NULL,
    deleted_at          INTEGER
) STRICT;

-- =========================================================
-- 1. Workspace, folders, documents, sessions
-- =========================================================

CREATE TABLE IF NOT EXISTS workspaces (
    id                      TEXT PRIMARY KEY,
    owner_profile_id        TEXT,
    name                    TEXT NOT NULL,
    description             TEXT,
    workspace_type          TEXT NOT NULL DEFAULT 'research'
                            CHECK (workspace_type IN (
                                'research', 'book', 'course', 'general',
                                'slide_project', 'imported', 'system'
                            )),
    root_path               TEXT,
    default_citation_style  TEXT NOT NULL DEFAULT 'apa7',
    locale                  TEXT NOT NULL DEFAULT 'ko-KR',
    created_at              INTEGER NOT NULL,
    updated_at              INTEGER NOT NULL,
    last_opened_at          INTEGER,
    deleted_at              INTEGER,
    FOREIGN KEY (owner_profile_id) REFERENCES profiles(id) ON DELETE SET NULL
) STRICT;

CREATE TABLE IF NOT EXISTS folders (
    id              TEXT PRIMARY KEY,
    workspace_id    TEXT NOT NULL,
    parent_id       TEXT,
    name            TEXT NOT NULL,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    icon            TEXT,
    color           TEXT,
    is_expanded     INTEGER NOT NULL DEFAULT 1 CHECK (is_expanded IN (0, 1)),
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL,
    deleted_at      INTEGER,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES folders(id) ON DELETE CASCADE,
    CHECK (id <> parent_id)
) STRICT;

CREATE UNIQUE INDEX IF NOT EXISTS ux_folders_active_name
ON folders (workspace_id, COALESCE(parent_id, ''), name)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_folders_workspace_parent
ON folders (workspace_id, parent_id, sort_order)
WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS documents (
    id                  TEXT PRIMARY KEY,
    workspace_id        TEXT NOT NULL,
    folder_id           TEXT,
    title               TEXT NOT NULL,
    content             TEXT NOT NULL DEFAULT '',
    content_format      TEXT NOT NULL DEFAULT 'markdown'
                        CHECK (content_format IN (
                            'markdown', 'html', 'plain_text', 'json', 'mermaid', 'code'
                        )),
    document_type       TEXT NOT NULL DEFAULT 'document'
                        CHECK (document_type IN (
                            'document', 'note', 'research_note', 'lecture_note',
                            'book_chapter', 'article_draft', 'ai_output',
                            'prompt_document', 'slide_source', 'template_instance'
                        )),
    status              TEXT NOT NULL DEFAULT 'active'
                        CHECK (status IN ('draft', 'active', 'archived', 'locked')),
    language            TEXT NOT NULL DEFAULT 'ko',
    source_mode         TEXT NOT NULL DEFAULT 'internal'
                        CHECK (source_mode IN (
                            'internal', 'local_file', 'github', 'webdav',
                            'google_docs', 'mdp_import', 'legacy_indb'
                        )),
    word_count          INTEGER NOT NULL DEFAULT 0,
    checksum            TEXT,
    version             INTEGER NOT NULL DEFAULT 1,
    is_favorite         INTEGER NOT NULL DEFAULT 0 CHECK (is_favorite IN (0, 1)),
    is_pinned           INTEGER NOT NULL DEFAULT 0 CHECK (is_pinned IN (0, 1)),
    is_readonly         INTEGER NOT NULL DEFAULT 0 CHECK (is_readonly IN (0, 1)),
    created_at          INTEGER NOT NULL,
    updated_at          INTEGER NOT NULL,
    last_opened_at      INTEGER,
    deleted_at          INTEGER,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
    FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE SET NULL
) STRICT;

CREATE INDEX IF NOT EXISTS ix_documents_workspace_folder
ON documents (workspace_id, folder_id, updated_at DESC)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_documents_recent
ON documents (workspace_id, last_opened_at DESC, updated_at DESC)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_documents_status_type
ON documents (workspace_id, status, document_type)
WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS document_metadata (
    document_id     TEXT NOT NULL,
    meta_key        TEXT NOT NULL,
    value_json      TEXT NOT NULL CHECK (json_valid(value_json)),
    updated_at      INTEGER NOT NULL,
    PRIMARY KEY (document_id, meta_key),
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
) STRICT;

CREATE TABLE IF NOT EXISTS document_versions (
    id              TEXT PRIMARY KEY,
    document_id     TEXT NOT NULL,
    version_no      INTEGER NOT NULL,
    title           TEXT NOT NULL,
    content         TEXT NOT NULL,
    checksum        TEXT,
    change_type     TEXT NOT NULL DEFAULT 'manual_save'
                    CHECK (change_type IN (
                        'manual_save', 'checkpoint', 'import', 'restore',
                        'ai_insert', 'merge', 'github_pull', 'webdav_sync',
                        'google_docs_sync', 'migration', 'snapshot'
                    )),
    change_summary  TEXT,
    created_by      TEXT,
    created_at      INTEGER NOT NULL,
    UNIQUE (document_id, version_no),
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
) STRICT;

CREATE INDEX IF NOT EXISTS ix_document_versions_document
ON document_versions (document_id, version_no DESC);

CREATE TABLE IF NOT EXISTS document_links (
    id                  TEXT PRIMARY KEY,
    source_document_id  TEXT NOT NULL,
    target_document_id  TEXT,
    target_uri          TEXT,
    link_type           TEXT NOT NULL DEFAULT 'wiki'
                        CHECK (link_type IN ('wiki', 'related', 'external', 'attachment', 'generated_from')),
    label               TEXT,
    anchor_text         TEXT,
    created_at          INTEGER NOT NULL,
    FOREIGN KEY (source_document_id) REFERENCES documents(id) ON DELETE CASCADE,
    FOREIGN KEY (target_document_id) REFERENCES documents(id) ON DELETE CASCADE,
    CHECK (target_document_id IS NOT NULL OR target_uri IS NOT NULL)
) STRICT;

CREATE INDEX IF NOT EXISTS ix_document_links_source
ON document_links (source_document_id, link_type);

CREATE INDEX IF NOT EXISTS ix_document_links_target
ON document_links (target_document_id, link_type);

CREATE TABLE IF NOT EXISTS tags (
    id              TEXT PRIMARY KEY,
    workspace_id    TEXT NOT NULL,
    name            TEXT NOT NULL,
    color           TEXT,
    description     TEXT,
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
    UNIQUE (workspace_id, name)
) STRICT;

CREATE TABLE IF NOT EXISTS document_tags (
    document_id     TEXT NOT NULL,
    tag_id          TEXT NOT NULL,
    created_at      INTEGER NOT NULL,
    PRIMARY KEY (document_id, tag_id),
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
) STRICT;

CREATE TABLE IF NOT EXISTS editor_sessions (
    id                  TEXT PRIMARY KEY,
    workspace_id        TEXT NOT NULL,
    device_session_id   TEXT,
    started_at          INTEGER NOT NULL,
    last_active_at      INTEGER NOT NULL,
    closed_at           INTEGER,
    close_state         TEXT NOT NULL DEFAULT 'open'
                        CHECK (close_state IN ('open', 'clean', 'crashed', 'recovered')),
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
) STRICT;

CREATE INDEX IF NOT EXISTS ix_editor_sessions_recent
ON editor_sessions (workspace_id, last_active_at DESC);

CREATE TABLE IF NOT EXISTS editor_tabs (
    session_id          TEXT NOT NULL,
    tab_id              TEXT NOT NULL,
    document_id         TEXT,
    temporary_key       TEXT,
    tab_type            TEXT NOT NULL DEFAULT 'document'
                        CHECK (tab_type IN ('document', 'preview', 'pdf', 'pptx', 'ai_chat', 'slide_deck')),
    title               TEXT NOT NULL,
    sort_order          INTEGER NOT NULL DEFAULT 0,
    is_active           INTEGER NOT NULL DEFAULT 0 CHECK (is_active IN (0, 1)),
    is_dirty            INTEGER NOT NULL DEFAULT 0 CHECK (is_dirty IN (0, 1)),
    cursor_position     INTEGER,
    scroll_position     REAL,
    opened_at           INTEGER NOT NULL,
    last_active_at      INTEGER NOT NULL,
    PRIMARY KEY (session_id, tab_id),
    FOREIGN KEY (session_id) REFERENCES editor_sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE SET NULL
) STRICT;

-- =========================================================
-- 2. Secrets, integrations, source trees, sync
-- =========================================================

CREATE TABLE IF NOT EXISTS secret_refs (
    id              TEXT PRIMARY KEY,
    service         TEXT NOT NULL,
    account_label   TEXT,
    vault_backend   TEXT NOT NULL DEFAULT 'os_keychain'
                    CHECK (vault_backend IN ('os_keychain', 'tauri_stronghold', 'windows_credential_manager')),
    vault_key       TEXT NOT NULL,
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL,
    UNIQUE (vault_backend, vault_key)
) STRICT;

CREATE TABLE IF NOT EXISTS integration_accounts (
    id                  TEXT PRIMARY KEY,
    workspace_id        TEXT,
    integration_type    TEXT NOT NULL
                        CHECK (integration_type IN (
                            'github', 'webdav', 'google_docs', 'imgbb',
                            'gemini', 'lm_studio', 'openai_compatible',
                            'scholar_provider', 'custom'
                        )),
    label               TEXT NOT NULL,
    config_json         TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(config_json)),
    secret_ref_id       TEXT,
    is_enabled          INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0, 1)),
    connection_status   TEXT NOT NULL DEFAULT 'unknown'
                        CHECK (connection_status IN ('unknown', 'connected', 'disconnected', 'error')),
    last_connected_at   INTEGER,
    created_at          INTEGER NOT NULL,
    updated_at          INTEGER NOT NULL,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
    FOREIGN KEY (secret_ref_id) REFERENCES secret_refs(id) ON DELETE SET NULL
) STRICT;

CREATE INDEX IF NOT EXISTS ix_integration_accounts_workspace
ON integration_accounts (workspace_id, integration_type, is_enabled);

CREATE TABLE IF NOT EXISTS workspace_sources (
    id                      TEXT PRIMARY KEY,
    workspace_id            TEXT NOT NULL,
    integration_account_id  TEXT,
    source_type             TEXT NOT NULL
                            CHECK (source_type IN (
                                'internal_library', 'virtual_workspace', 'local_folder',
                                'github', 'webdav', 'google_docs', 'mdp_import',
                                'legacy_indb', 'legacy_fm'
                            )),
    name                    TEXT NOT NULL,
    root_uri                TEXT,
    config_json             TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(config_json)),
    sync_direction          TEXT NOT NULL DEFAULT 'manual'
                            CHECK (sync_direction IN ('manual', 'pull', 'push', 'bidirectional')),
    is_enabled              INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0, 1)),
    status                  TEXT NOT NULL DEFAULT 'ready'
                            CHECK (status IN ('ready', 'syncing', 'offline', 'error', 'disabled')),
    last_synced_at          INTEGER,
    created_at              INTEGER NOT NULL,
    updated_at              INTEGER NOT NULL,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
    FOREIGN KEY (integration_account_id) REFERENCES integration_accounts(id) ON DELETE SET NULL
) STRICT;

CREATE INDEX IF NOT EXISTS ix_workspace_sources_workspace
ON workspace_sources (workspace_id, source_type, is_enabled);

-- =========================================================
-- 3. Assets and virtual/external file entries
-- =========================================================

CREATE TABLE IF NOT EXISTS assets (
    id                  TEXT PRIMARY KEY,
    workspace_id        TEXT,
    asset_type          TEXT NOT NULL
                        CHECK (asset_type IN (
                            'image', 'audio', 'video', 'pdf', 'pptx',
                            'attachment', 'thumbnail', 'generated', 'other'
                        )),
    storage_type        TEXT NOT NULL DEFAULT 'filesystem'
                        CHECK (storage_type IN ('filesystem', 'sqlite_blob', 'external_url')),
    original_name       TEXT,
    stored_name         TEXT,
    relative_path       TEXT,
    external_url        TEXT,
    mime_type           TEXT,
    extension           TEXT,
    size_bytes          INTEGER,
    width               INTEGER,
    height              INTEGER,
    duration_ms         INTEGER,
    checksum_sha256     TEXT,
    source_provider     TEXT,
    created_at          INTEGER NOT NULL,
    updated_at          INTEGER NOT NULL,
    deleted_at          INTEGER,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
    CHECK (
        (storage_type = 'filesystem' AND relative_path IS NOT NULL) OR
        (storage_type = 'sqlite_blob') OR
        (storage_type = 'external_url' AND external_url IS NOT NULL)
    )
) STRICT;

CREATE UNIQUE INDEX IF NOT EXISTS ux_assets_workspace_checksum
ON assets (COALESCE(workspace_id, ''), checksum_sha256)
WHERE checksum_sha256 IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_assets_workspace_type
ON assets (workspace_id, asset_type, created_at DESC)
WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS asset_blobs (
    asset_id        TEXT PRIMARY KEY,
    blob_data       BLOB NOT NULL,
    created_at      INTEGER NOT NULL,
    FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
) STRICT;

CREATE TABLE IF NOT EXISTS asset_variants (
    id              TEXT PRIMARY KEY,
    asset_id        TEXT NOT NULL,
    variant_type    TEXT NOT NULL
                    CHECK (variant_type IN ('thumbnail', 'preview', 'optimized', 'waveform', 'poster')),
    relative_path   TEXT,
    blob_data       BLOB,
    mime_type       TEXT,
    width           INTEGER,
    height          INTEGER,
    size_bytes      INTEGER,
    checksum_sha256 TEXT,
    created_at      INTEGER NOT NULL,
    UNIQUE (asset_id, variant_type),
    FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
    CHECK (relative_path IS NOT NULL OR blob_data IS NOT NULL)
) STRICT;

CREATE TABLE IF NOT EXISTS file_entries (
    id                  TEXT PRIMARY KEY,
    source_id           TEXT NOT NULL,
    parent_id           TEXT,
    entry_type          TEXT NOT NULL CHECK (entry_type IN ('file', 'folder')),
    path                TEXT NOT NULL,
    name                TEXT NOT NULL,
    extension           TEXT,
    mime_type           TEXT,
    content_text        TEXT,
    asset_id            TEXT,
    size_bytes          INTEGER,
    modified_at         INTEGER,
    remote_revision     TEXT,
    checksum            TEXT,
    base_checksum       TEXT,
    sync_status         TEXT NOT NULL DEFAULT 'synced'
                        CHECK (sync_status IN (
                            'synced', 'local_changed', 'remote_changed',
                            'conflict', 'pending_upload', 'pending_download', 'error'
                        )),
    created_at          INTEGER NOT NULL,
    updated_at          INTEGER NOT NULL,
    deleted_at          INTEGER,
    FOREIGN KEY (source_id) REFERENCES workspace_sources(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES file_entries(id) ON DELETE CASCADE,
    FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE SET NULL,
    UNIQUE (source_id, path),
    CHECK (
        entry_type = 'folder' OR content_text IS NOT NULL OR asset_id IS NOT NULL
    )
) STRICT;

CREATE INDEX IF NOT EXISTS ix_file_entries_source_parent
ON file_entries (source_id, parent_id, entry_type, name)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_file_entries_sync_status
ON file_entries (source_id, sync_status, updated_at DESC)
WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS document_sources (
    id                          TEXT PRIMARY KEY,
    document_id                 TEXT NOT NULL,
    source_id                   TEXT NOT NULL,
    file_entry_id               TEXT,
    external_id                 TEXT,
    external_path               TEXT,
    remote_revision             TEXT,
    last_synced_document_version INTEGER,
    last_synced_checksum        TEXT,
    sync_status                 TEXT NOT NULL DEFAULT 'synced'
                                CHECK (sync_status IN (
                                    'synced', 'local_changed', 'remote_changed',
                                    'conflict', 'pending', 'error'
                                )),
    is_primary                  INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
    last_synced_at              INTEGER,
    created_at                  INTEGER NOT NULL,
    updated_at                  INTEGER NOT NULL,
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
    FOREIGN KEY (source_id) REFERENCES workspace_sources(id) ON DELETE CASCADE,
    FOREIGN KEY (file_entry_id) REFERENCES file_entries(id) ON DELETE SET NULL
) STRICT;

CREATE UNIQUE INDEX IF NOT EXISTS ux_document_sources_identity
ON document_sources (
    document_id, source_id,
    COALESCE(file_entry_id, ''),
    COALESCE(external_id, ''),
    COALESCE(external_path, '')
);

CREATE INDEX IF NOT EXISTS ix_document_sources_document
ON document_sources (document_id, is_primary DESC);

CREATE TABLE IF NOT EXISTS document_assets (
    document_id     TEXT NOT NULL,
    asset_id        TEXT NOT NULL,
    usage_role      TEXT NOT NULL DEFAULT 'embedded'
                    CHECK (usage_role IN ('embedded', 'cover', 'attachment', 'background', 'reference')),
    alt_text        TEXT,
    caption         TEXT,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    created_at      INTEGER NOT NULL,
    PRIMARY KEY (document_id, asset_id, usage_role),
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
    FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
) STRICT;

-- =========================================================
-- 4. Workspace history and immutable snapshots
-- =========================================================

CREATE TABLE IF NOT EXISTS workspace_snapshots (
    id                  TEXT PRIMARY KEY,
    workspace_id        TEXT NOT NULL,
    snapshot_type       TEXT NOT NULL DEFAULT 'manual'
                        CHECK (snapshot_type IN (
                            'manual', 'history', 'migration', 'pre_update',
                            'recovery', 'sync_checkpoint'
                        )),
    name                TEXT,
    memo                TEXT,
    app_version         TEXT,
    state_json          TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(state_json)),
    file_count          INTEGER NOT NULL DEFAULT 0,
    document_count      INTEGER NOT NULL DEFAULT 0,
    created_at          INTEGER NOT NULL,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
) STRICT;

CREATE INDEX IF NOT EXISTS ix_workspace_snapshots_recent
ON workspace_snapshots (workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS snapshot_documents (
    snapshot_id         TEXT NOT NULL,
    document_id         TEXT NOT NULL,
    document_version_id TEXT NOT NULL,
    tab_order           INTEGER,
    is_active           INTEGER NOT NULL DEFAULT 0 CHECK (is_active IN (0, 1)),
    PRIMARY KEY (snapshot_id, document_id),
    FOREIGN KEY (snapshot_id) REFERENCES workspace_snapshots(id) ON DELETE CASCADE,
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
    FOREIGN KEY (document_version_id) REFERENCES document_versions(id) ON DELETE RESTRICT
) STRICT;

CREATE TABLE IF NOT EXISTS snapshot_files (
    snapshot_id         TEXT NOT NULL,
    source_id           TEXT,
    path                TEXT NOT NULL,
    entry_type          TEXT NOT NULL CHECK (entry_type IN ('file', 'folder')),
    content_text        TEXT,
    asset_id            TEXT,
    checksum            TEXT,
    modified_at         INTEGER,
    PRIMARY KEY (snapshot_id, path),
    FOREIGN KEY (snapshot_id) REFERENCES workspace_snapshots(id) ON DELETE CASCADE,
    FOREIGN KEY (source_id) REFERENCES workspace_sources(id) ON DELETE SET NULL,
    FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE SET NULL
) STRICT;

-- =========================================================
-- 5. Bibliographic library, citations, academic search
-- =========================================================

CREATE TABLE IF NOT EXISTS bibliographic_items (
    id                  TEXT PRIMARY KEY,
    workspace_id        TEXT NOT NULL,
    item_type           TEXT NOT NULL DEFAULT 'article'
                        CHECK (item_type IN (
                            'article', 'book', 'book_chapter', 'conference_paper',
                            'thesis', 'report', 'webpage', 'dataset', 'software',
                            'preprint', 'other'
                        )),
    title               TEXT,
    normalized_title    TEXT,
    subtitle            TEXT,
    container_title     TEXT,
    abstract            TEXT,
    publication_year    INTEGER,
    issued_date         TEXT,
    volume              TEXT,
    issue               TEXT,
    pages               TEXT,
    publisher           TEXT,
    edition             TEXT,
    language            TEXT,
    url                 TEXT,
    doi_normalized      TEXT,
    citation_key        TEXT,
    apa_text            TEXT,
    raw_text            TEXT NOT NULL,
    raw_json            TEXT CHECK (raw_json IS NULL OR json_valid(raw_json)),
    source_provider     TEXT,
    read_status         TEXT NOT NULL DEFAULT 'unread'
                        CHECK (read_status IN ('unread', 'reading', 'read', 'reviewed')),
    is_favorite         INTEGER NOT NULL DEFAULT 0 CHECK (is_favorite IN (0, 1)),
    version             INTEGER NOT NULL DEFAULT 1,
    created_at          INTEGER NOT NULL,
    updated_at          INTEGER NOT NULL,
    deleted_at          INTEGER,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
    CHECK (title IS NOT NULL OR raw_text <> '')
) STRICT;

CREATE UNIQUE INDEX IF NOT EXISTS ux_bibliographic_items_doi
ON bibliographic_items (workspace_id, doi_normalized)
WHERE doi_normalized IS NOT NULL AND doi_normalized <> '' AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_bibliographic_items_title_year
ON bibliographic_items (workspace_id, normalized_title, publication_year)
WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS bibliographic_contributors (
    id              TEXT PRIMARY KEY,
    item_id         TEXT NOT NULL,
    role            TEXT NOT NULL DEFAULT 'author'
                    CHECK (role IN ('author', 'editor', 'translator', 'advisor', 'other')),
    sequence_no     INTEGER NOT NULL,
    family_name     TEXT,
    given_name      TEXT,
    literal_name    TEXT,
    orcid           TEXT,
    affiliation     TEXT,
    UNIQUE (item_id, role, sequence_no),
    FOREIGN KEY (item_id) REFERENCES bibliographic_items(id) ON DELETE CASCADE,
    CHECK (family_name IS NOT NULL OR literal_name IS NOT NULL)
) STRICT;

CREATE INDEX IF NOT EXISTS ix_bibliographic_contributors_item
ON bibliographic_contributors (item_id, role, sequence_no);

CREATE TABLE IF NOT EXISTS bibliographic_identifiers (
    item_id             TEXT NOT NULL,
    scheme              TEXT NOT NULL,
    value               TEXT NOT NULL,
    normalized_value    TEXT NOT NULL,
    PRIMARY KEY (item_id, scheme, normalized_value),
    FOREIGN KEY (item_id) REFERENCES bibliographic_items(id) ON DELETE CASCADE
) STRICT;

CREATE INDEX IF NOT EXISTS ix_bibliographic_identifiers_lookup
ON bibliographic_identifiers (scheme, normalized_value);

CREATE TABLE IF NOT EXISTS bibliographic_keywords (
    item_id         TEXT NOT NULL,
    keyword         TEXT NOT NULL,
    normalized_keyword TEXT NOT NULL,
    PRIMARY KEY (item_id, normalized_keyword),
    FOREIGN KEY (item_id) REFERENCES bibliographic_items(id) ON DELETE CASCADE
) STRICT;

CREATE TABLE IF NOT EXISTS document_citations (
    id                  TEXT PRIMARY KEY,
    document_id         TEXT NOT NULL,
    item_id             TEXT NOT NULL,
    citation_key        TEXT,
    locator             TEXT,
    prefix_text         TEXT,
    suffix_text         TEXT,
    citation_context    TEXT,
    first_cited_at      INTEGER NOT NULL,
    last_cited_at       INTEGER NOT NULL,
    citation_count      INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES bibliographic_items(id) ON DELETE CASCADE
) STRICT;

CREATE UNIQUE INDEX IF NOT EXISTS ux_document_citations_identity
ON document_citations (
    document_id, item_id,
    COALESCE(locator, ''),
    COALESCE(prefix_text, ''),
    COALESCE(suffix_text, '')
);

CREATE INDEX IF NOT EXISTS ix_document_citations_document
ON document_citations (document_id, first_cited_at);

CREATE INDEX IF NOT EXISTS ix_document_citations_item
ON document_citations (item_id, last_cited_at DESC);

CREATE TABLE IF NOT EXISTS reference_collections (
    id              TEXT PRIMARY KEY,
    workspace_id    TEXT NOT NULL,
    parent_id       TEXT,
    name            TEXT NOT NULL,
    description     TEXT,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES reference_collections(id) ON DELETE CASCADE
) STRICT;

CREATE UNIQUE INDEX IF NOT EXISTS ux_reference_collections_active_name
ON reference_collections (workspace_id, COALESCE(parent_id, ''), name);

CREATE TABLE IF NOT EXISTS reference_collection_items (
    collection_id   TEXT NOT NULL,
    item_id         TEXT NOT NULL,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    added_at        INTEGER NOT NULL,
    PRIMARY KEY (collection_id, item_id),
    FOREIGN KEY (collection_id) REFERENCES reference_collections(id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES bibliographic_items(id) ON DELETE CASCADE
) STRICT;

CREATE TABLE IF NOT EXISTS academic_searches (
    id                  TEXT PRIMARY KEY,
    workspace_id        TEXT NOT NULL,
    document_id         TEXT,
    conversation_id     TEXT,
    provider            TEXT NOT NULL,
    query_text          TEXT NOT NULL,
    query_used          TEXT,
    filters_json        TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(filters_json)),
    status              TEXT NOT NULL DEFAULT 'completed'
                        CHECK (status IN ('running', 'completed', 'partial', 'failed', 'cancelled')),
    result_count        INTEGER NOT NULL DEFAULT 0,
    abstract_count      INTEGER NOT NULL DEFAULT 0,
    warnings_json       TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(warnings_json)),
    error_message       TEXT,
    created_at          INTEGER NOT NULL,
    completed_at        INTEGER,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE SET NULL,
    FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id) ON DELETE SET NULL
) STRICT;

CREATE INDEX IF NOT EXISTS ix_academic_searches_recent
ON academic_searches (workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS academic_search_results (
    search_id           TEXT NOT NULL,
    rank_no             INTEGER NOT NULL,
    saved_item_id       TEXT,
    provider_record_id  TEXT,
    title               TEXT,
    authors_text        TEXT,
    publication_year    INTEGER,
    journal             TEXT,
    doi_normalized      TEXT,
    url                 TEXT,
    cited_by            INTEGER,
    abstract_text       TEXT,
    source_names_json   TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(source_names_json)),
    relevance_score     REAL,
    raw_json            TEXT NOT NULL CHECK (json_valid(raw_json)),
    PRIMARY KEY (search_id, rank_no),
    FOREIGN KEY (search_id) REFERENCES academic_searches(id) ON DELETE CASCADE,
    FOREIGN KEY (saved_item_id) REFERENCES bibliographic_items(id) ON DELETE SET NULL
) STRICT;

CREATE TABLE IF NOT EXISTS highlights (
    id                      TEXT PRIMARY KEY,
    workspace_id            TEXT NOT NULL,
    document_id             TEXT,
    bibliographic_item_id   TEXT,
    source_type             TEXT NOT NULL DEFAULT 'manual'
                            CHECK (source_type IN ('manual', 'document', 'pdf', 'web', 'ai_message', 'reference')),
    source_locator          TEXT,
    content_markdown        TEXT NOT NULL,
    note_markdown           TEXT,
    content_data_json       TEXT CHECK (content_data_json IS NULL OR json_valid(content_data_json)),
    color                   TEXT,
    created_at              INTEGER NOT NULL,
    updated_at              INTEGER NOT NULL,
    deleted_at              INTEGER,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE SET NULL,
    FOREIGN KEY (bibliographic_item_id) REFERENCES bibliographic_items(id) ON DELETE SET NULL
) STRICT;

CREATE INDEX IF NOT EXISTS ix_highlights_workspace_recent
ON highlights (workspace_id, created_at DESC)
WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS highlight_tags (
    highlight_id    TEXT NOT NULL,
    tag_id          TEXT NOT NULL,
    created_at      INTEGER NOT NULL,
    PRIMARY KEY (highlight_id, tag_id),
    FOREIGN KEY (highlight_id) REFERENCES highlights(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
) STRICT;

-- =========================================================
-- 6. AI providers, conversations, messages, runs
-- =========================================================

CREATE TABLE IF NOT EXISTS ai_provider_profiles (
    id                  TEXT PRIMARY KEY,
    workspace_id        TEXT,
    integration_account_id TEXT,
    provider            TEXT NOT NULL,
    name                TEXT NOT NULL,
    base_url            TEXT,
    model               TEXT NOT NULL,
    options_json        TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(options_json)),
    is_default          INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
    is_enabled          INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0, 1)),
    created_at          INTEGER NOT NULL,
    updated_at          INTEGER NOT NULL,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
    FOREIGN KEY (integration_account_id) REFERENCES integration_accounts(id) ON DELETE SET NULL
) STRICT;

CREATE INDEX IF NOT EXISTS ix_ai_provider_profiles_workspace
ON ai_provider_profiles (workspace_id, provider, is_enabled);

CREATE TABLE IF NOT EXISTS ai_conversations (
    id                          TEXT PRIMARY KEY,
    workspace_id                TEXT NOT NULL,
    document_id                 TEXT,
    provider_profile_id         TEXT,
    title                       TEXT NOT NULL,
    response_mode               TEXT,
    show_reasoning              INTEGER NOT NULL DEFAULT 0 CHECK (show_reasoning IN (0, 1)),
    academic_search_enabled     INTEGER NOT NULL DEFAULT 0 CHECK (academic_search_enabled IN (0, 1)),
    academic_search_count       INTEGER NOT NULL DEFAULT 0,
    context_json                TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(context_json)),
    created_at                  INTEGER NOT NULL,
    updated_at                  INTEGER NOT NULL,
    archived_at                 INTEGER,
    deleted_at                  INTEGER,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE SET NULL,
    FOREIGN KEY (provider_profile_id) REFERENCES ai_provider_profiles(id) ON DELETE SET NULL
) STRICT;

CREATE INDEX IF NOT EXISTS ix_ai_conversations_workspace_recent
ON ai_conversations (workspace_id, updated_at DESC)
WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS ai_messages (
    id                      TEXT PRIMARY KEY,
    conversation_id         TEXT NOT NULL,
    parent_message_id       TEXT,
    sequence_no             INTEGER NOT NULL,
    role                    TEXT NOT NULL CHECK (role IN ('system', 'user', 'assistant', 'tool')),
    content_markdown        TEXT NOT NULL DEFAULT '',
    reasoning_summary       TEXT,
    checklist_json          TEXT CHECK (checklist_json IS NULL OR json_valid(checklist_json)),
    notice_text             TEXT,
    provider                TEXT,
    model                   TEXT,
    response_id             TEXT,
    usage_json              TEXT CHECK (usage_json IS NULL OR json_valid(usage_json)),
    metadata_json           TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata_json)),
    academic_part           INTEGER,
    academic_total_parts    INTEGER,
    continuation_count      INTEGER NOT NULL DEFAULT 0,
    status                  TEXT NOT NULL DEFAULT 'completed'
                            CHECK (status IN ('streaming', 'completed', 'cancelled', 'failed', 'recovered')),
    error_message           TEXT,
    version                 INTEGER NOT NULL DEFAULT 1,
    created_at              INTEGER NOT NULL,
    updated_at              INTEGER NOT NULL,
    UNIQUE (conversation_id, sequence_no),
    FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_message_id) REFERENCES ai_messages(id) ON DELETE SET NULL
) STRICT;

CREATE INDEX IF NOT EXISTS ix_ai_messages_conversation
ON ai_messages (conversation_id, sequence_no);

CREATE TABLE IF NOT EXISTS ai_message_sources (
    id                      TEXT PRIMARY KEY,
    message_id              TEXT NOT NULL,
    bibliographic_item_id   TEXT,
    citation_label          TEXT,
    title                   TEXT,
    url                     TEXT,
    doi_normalized          TEXT,
    provider                TEXT,
    quoted_text             TEXT,
    metadata_json           TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata_json)),
    sort_order              INTEGER NOT NULL DEFAULT 0,
    created_at              INTEGER NOT NULL,
    FOREIGN KEY (message_id) REFERENCES ai_messages(id) ON DELETE CASCADE,
    FOREIGN KEY (bibliographic_item_id) REFERENCES bibliographic_items(id) ON DELETE SET NULL
) STRICT;

CREATE TABLE IF NOT EXISTS ai_message_assets (
    message_id      TEXT NOT NULL,
    asset_id        TEXT NOT NULL,
    usage_role      TEXT NOT NULL DEFAULT 'attachment'
                    CHECK (usage_role IN ('attachment', 'input_image', 'generated_image', 'reference')),
    sort_order      INTEGER NOT NULL DEFAULT 0,
    created_at      INTEGER NOT NULL,
    PRIMARY KEY (message_id, asset_id, usage_role),
    FOREIGN KEY (message_id) REFERENCES ai_messages(id) ON DELETE CASCADE,
    FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
) STRICT;

CREATE TABLE IF NOT EXISTS ai_runs (
    id                      TEXT PRIMARY KEY,
    conversation_id         TEXT,
    user_message_id         TEXT,
    assistant_message_id    TEXT,
    provider_profile_id     TEXT,
    prompt_id               TEXT,
    status                  TEXT NOT NULL
                            CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
    request_json            TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(request_json)),
    usage_json              TEXT CHECK (usage_json IS NULL OR json_valid(usage_json)),
    latency_ms              INTEGER,
    error_message           TEXT,
    started_at              INTEGER NOT NULL,
    completed_at            INTEGER,
    FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id) ON DELETE SET NULL,
    FOREIGN KEY (user_message_id) REFERENCES ai_messages(id) ON DELETE SET NULL,
    FOREIGN KEY (assistant_message_id) REFERENCES ai_messages(id) ON DELETE SET NULL,
    FOREIGN KEY (provider_profile_id) REFERENCES ai_provider_profiles(id) ON DELETE SET NULL,
    FOREIGN KEY (prompt_id) REFERENCES prompts(id) ON DELETE SET NULL
) STRICT;

-- =========================================================
-- 7. Prompt library, templates, GenSlide
-- =========================================================

CREATE TABLE IF NOT EXISTS prompt_folders (
    id              TEXT PRIMARY KEY,
    workspace_id    TEXT NOT NULL,
    parent_id       TEXT,
    name            TEXT NOT NULL,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES prompt_folders(id) ON DELETE CASCADE
) STRICT;

CREATE UNIQUE INDEX IF NOT EXISTS ux_prompt_folders_name
ON prompt_folders (workspace_id, COALESCE(parent_id, ''), name);

CREATE TABLE IF NOT EXISTS prompts (
    id                      TEXT PRIMARY KEY,
    workspace_id            TEXT NOT NULL,
    folder_id               TEXT,
    name                    TEXT NOT NULL,
    description             TEXT,
    prompt_type             TEXT NOT NULL DEFAULT 'user'
                            CHECK (prompt_type IN (
                                'system', 'user', 'assistant', 'scholar_search',
                                'paper_review', 'summarization', 'translation',
                                'image_generation', 'slide_generation',
                                'code_generation', 'custom'
                            )),
    content                 TEXT NOT NULL,
    variables_json          TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(variables_json)),
    default_values_json     TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(default_values_json)),
    model_options_json      TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(model_options_json)),
    version                 INTEGER NOT NULL DEFAULT 1,
    is_builtin              INTEGER NOT NULL DEFAULT 0 CHECK (is_builtin IN (0, 1)),
    is_favorite             INTEGER NOT NULL DEFAULT 0 CHECK (is_favorite IN (0, 1)),
    created_at              INTEGER NOT NULL,
    updated_at              INTEGER NOT NULL,
    deleted_at              INTEGER,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
    FOREIGN KEY (folder_id) REFERENCES prompt_folders(id) ON DELETE SET NULL
) STRICT;

CREATE INDEX IF NOT EXISTS ix_prompts_workspace_folder
ON prompts (workspace_id, folder_id, updated_at DESC)
WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS prompt_versions (
    id                      TEXT PRIMARY KEY,
    prompt_id               TEXT NOT NULL,
    version_no              INTEGER NOT NULL,
    content                 TEXT NOT NULL,
    variables_json          TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(variables_json)),
    default_values_json     TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(default_values_json)),
    model_options_json      TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(model_options_json)),
    change_summary          TEXT,
    created_at              INTEGER NOT NULL,
    UNIQUE (prompt_id, version_no),
    FOREIGN KEY (prompt_id) REFERENCES prompts(id) ON DELETE CASCADE
) STRICT;

CREATE TABLE IF NOT EXISTS prompt_runs (
    id                  TEXT PRIMARY KEY,
    prompt_id           TEXT NOT NULL,
    prompt_version_no   INTEGER,
    document_id         TEXT,
    conversation_id     TEXT,
    output_message_id   TEXT,
    input_values_json   TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(input_values_json)),
    status              TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
    started_at          INTEGER NOT NULL,
    completed_at        INTEGER,
    FOREIGN KEY (prompt_id) REFERENCES prompts(id) ON DELETE CASCADE,
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE SET NULL,
    FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id) ON DELETE SET NULL,
    FOREIGN KEY (output_message_id) REFERENCES ai_messages(id) ON DELETE SET NULL
) STRICT;

CREATE TABLE IF NOT EXISTS templates (
    id                  TEXT PRIMARY KEY,
    workspace_id        TEXT,
    name                TEXT NOT NULL,
    description         TEXT,
    template_type       TEXT NOT NULL DEFAULT 'markdown'
                        CHECK (template_type IN ('markdown', 'document', 'prompt', 'slide', 'report', 'custom')),
    content             TEXT NOT NULL,
    variables_json      TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(variables_json)),
    version             INTEGER NOT NULL DEFAULT 1,
    is_builtin          INTEGER NOT NULL DEFAULT 0 CHECK (is_builtin IN (0, 1)),
    is_favorite         INTEGER NOT NULL DEFAULT 0 CHECK (is_favorite IN (0, 1)),
    created_at          INTEGER NOT NULL,
    updated_at          INTEGER NOT NULL,
    deleted_at          INTEGER,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
) STRICT;

CREATE TABLE IF NOT EXISTS template_versions (
    id                  TEXT PRIMARY KEY,
    template_id         TEXT NOT NULL,
    version_no          INTEGER NOT NULL,
    content             TEXT NOT NULL,
    variables_json      TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(variables_json)),
    change_summary      TEXT,
    created_at          INTEGER NOT NULL,
    UNIQUE (template_id, version_no),
    FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE CASCADE
) STRICT;

CREATE TABLE IF NOT EXISTS slide_decks (
    id                  TEXT PRIMARY KEY,
    workspace_id        TEXT NOT NULL,
    title               TEXT NOT NULL,
    description         TEXT,
    current_slide_index INTEGER NOT NULL DEFAULT 0,
    canvas_width        INTEGER NOT NULL DEFAULT 1280,
    canvas_height       INTEGER NOT NULL DEFAULT 720,
    theme_json          TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(theme_json)),
    state_json          TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(state_json)),
    version             INTEGER NOT NULL DEFAULT 1,
    created_at          INTEGER NOT NULL,
    updated_at          INTEGER NOT NULL,
    deleted_at          INTEGER,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
) STRICT;

CREATE INDEX IF NOT EXISTS ix_slide_decks_workspace
ON slide_decks (workspace_id, updated_at DESC)
WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS slides (
    id                  TEXT PRIMARY KEY,
    deck_id             TEXT NOT NULL,
    slide_no            INTEGER NOT NULL,
    html_content        TEXT NOT NULL DEFAULT '',
    notes_markdown      TEXT,
    duration_ms         INTEGER,
    background_json     TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(background_json)),
    version             INTEGER NOT NULL DEFAULT 1,
    created_at          INTEGER NOT NULL,
    updated_at          INTEGER NOT NULL,
    UNIQUE (deck_id, slide_no),
    FOREIGN KEY (deck_id) REFERENCES slide_decks(id) ON DELETE CASCADE
) STRICT;

CREATE TABLE IF NOT EXISTS slide_assets (
    id              TEXT PRIMARY KEY,
    slide_id        TEXT NOT NULL,
    asset_id        TEXT NOT NULL,
    usage_role      TEXT NOT NULL DEFAULT 'content'
                    CHECK (usage_role IN ('content', 'background', 'audio', 'video', 'thumbnail')),
    element_id      TEXT,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    created_at      INTEGER NOT NULL,
    FOREIGN KEY (slide_id) REFERENCES slides(id) ON DELETE CASCADE,
    FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
) STRICT;

CREATE UNIQUE INDEX IF NOT EXISTS ux_slide_assets_identity
ON slide_assets (slide_id, asset_id, usage_role, COALESCE(element_id, ''));

-- =========================================================
-- 8. Sites, share targets, settings, synchronization, backups
-- =========================================================

CREATE TABLE IF NOT EXISTS sites (
    id              TEXT PRIMARY KEY,
    workspace_id    TEXT,
    name            TEXT NOT NULL,
    url             TEXT NOT NULL,
    category        TEXT,
    icon            TEXT,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    is_enabled      INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0, 1)),
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
) STRICT;

CREATE TABLE IF NOT EXISTS share_destinations (
    id                  TEXT PRIMARY KEY,
    workspace_id        TEXT,
    destination_type    TEXT NOT NULL
                        CHECK (destination_type IN (
                            'google_docs', 'github', 'webdav', 'naver_blog',
                            'clipboard', 'local_file', 'custom'
                        )),
    name                TEXT NOT NULL,
    config_json         TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(config_json)),
    integration_account_id TEXT,
    is_enabled          INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0, 1)),
    created_at          INTEGER NOT NULL,
    updated_at          INTEGER NOT NULL,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
    FOREIGN KEY (integration_account_id) REFERENCES integration_accounts(id) ON DELETE SET NULL
) STRICT;

CREATE TABLE IF NOT EXISTS settings (
    scope_type      TEXT NOT NULL
                    CHECK (scope_type IN ('global', 'profile', 'workspace', 'document', 'feature')),
    scope_id        TEXT NOT NULL DEFAULT '',
    setting_group   TEXT NOT NULL,
    setting_key     TEXT NOT NULL,
    value_json      TEXT NOT NULL CHECK (json_valid(value_json)),
    value_type      TEXT NOT NULL DEFAULT 'json'
                    CHECK (value_type IN ('json', 'string', 'number', 'boolean', 'array', 'object')),
    updated_at      INTEGER NOT NULL,
    PRIMARY KEY (scope_type, scope_id, setting_group, setting_key)
) STRICT;

CREATE INDEX IF NOT EXISTS ix_settings_group
ON settings (scope_type, scope_id, setting_group);

CREATE TABLE IF NOT EXISTS sync_jobs (
    id                      TEXT PRIMARY KEY,
    workspace_id            TEXT NOT NULL,
    source_id               TEXT,
    integration_account_id  TEXT,
    job_type                TEXT NOT NULL
                            CHECK (job_type IN ('scan', 'pull', 'push', 'bidirectional', 'import', 'export')),
    status                  TEXT NOT NULL
                            CHECK (status IN ('queued', 'running', 'completed', 'partial', 'failed', 'cancelled')),
    items_total             INTEGER NOT NULL DEFAULT 0,
    items_completed         INTEGER NOT NULL DEFAULT 0,
    items_failed            INTEGER NOT NULL DEFAULT 0,
    details_json            TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(details_json)),
    error_message           TEXT,
    started_at              INTEGER NOT NULL,
    completed_at            INTEGER,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
    FOREIGN KEY (source_id) REFERENCES workspace_sources(id) ON DELETE SET NULL,
    FOREIGN KEY (integration_account_id) REFERENCES integration_accounts(id) ON DELETE SET NULL
) STRICT;

CREATE INDEX IF NOT EXISTS ix_sync_jobs_recent
ON sync_jobs (workspace_id, started_at DESC);

CREATE TABLE IF NOT EXISTS sync_conflicts (
    id                  TEXT PRIMARY KEY,
    workspace_id        TEXT NOT NULL,
    document_id         TEXT,
    source_id           TEXT,
    file_entry_id       TEXT,
    conflict_type       TEXT NOT NULL
                        CHECK (conflict_type IN ('content', 'rename', 'delete', 'metadata', 'revision')),
    local_version       INTEGER,
    local_checksum      TEXT,
    remote_revision     TEXT,
    remote_checksum     TEXT,
    local_content       TEXT,
    remote_content      TEXT,
    resolution_status   TEXT NOT NULL DEFAULT 'unresolved'
                        CHECK (resolution_status IN ('unresolved', 'resolved_local', 'resolved_remote', 'merged', 'ignored')),
    resolution_note     TEXT,
    created_at          INTEGER NOT NULL,
    resolved_at         INTEGER,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE SET NULL,
    FOREIGN KEY (source_id) REFERENCES workspace_sources(id) ON DELETE SET NULL,
    FOREIGN KEY (file_entry_id) REFERENCES file_entries(id) ON DELETE SET NULL
) STRICT;

CREATE INDEX IF NOT EXISTS ix_sync_conflicts_unresolved
ON sync_conflicts (workspace_id, resolution_status, created_at DESC);

CREATE TABLE IF NOT EXISTS backup_history (
    id                  TEXT PRIMARY KEY,
    workspace_id        TEXT,
    backup_type         TEXT NOT NULL
                        CHECK (backup_type IN ('manual', 'daily', 'weekly', 'pre_migration', 'pre_update')),
    file_path           TEXT NOT NULL,
    checksum_sha256     TEXT,
    size_bytes          INTEGER,
    schema_version      INTEGER NOT NULL,
    manifest_json       TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(manifest_json)),
    status              TEXT NOT NULL CHECK (status IN ('creating', 'completed', 'failed', 'restored')),
    error_message       TEXT,
    created_at          INTEGER NOT NULL,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL
) STRICT;

-- =========================================================
-- 9. Full-text search indexes and triggers
-- =========================================================

CREATE VIRTUAL TABLE IF NOT EXISTS document_fts USING fts5(
    document_id UNINDEXED,
    workspace_id UNINDEXED,
    title,
    content,
    tokenize = 'trigram case_sensitive 0'
);

CREATE TRIGGER IF NOT EXISTS trg_documents_fts_insert
AFTER INSERT ON documents
WHEN NEW.deleted_at IS NULL
BEGIN
    INSERT INTO document_fts (document_id, workspace_id, title, content)
    VALUES (NEW.id, NEW.workspace_id, NEW.title, NEW.content);
END;

CREATE TRIGGER IF NOT EXISTS trg_documents_fts_update
AFTER UPDATE OF title, content, workspace_id, deleted_at ON documents
BEGIN
    DELETE FROM document_fts WHERE document_id = OLD.id;
    INSERT INTO document_fts (document_id, workspace_id, title, content)
    SELECT NEW.id, NEW.workspace_id, NEW.title, NEW.content
    WHERE NEW.deleted_at IS NULL;
END;

CREATE TRIGGER IF NOT EXISTS trg_documents_fts_delete
AFTER DELETE ON documents
BEGIN
    DELETE FROM document_fts WHERE document_id = OLD.id;
END;

CREATE VIRTUAL TABLE IF NOT EXISTS bibliography_fts USING fts5(
    item_id UNINDEXED,
    workspace_id UNINDEXED,
    title,
    abstract,
    raw_text,
    tokenize = 'trigram case_sensitive 0'
);

CREATE TRIGGER IF NOT EXISTS trg_bibliography_fts_insert
AFTER INSERT ON bibliographic_items
WHEN NEW.deleted_at IS NULL
BEGIN
    INSERT INTO bibliography_fts (item_id, workspace_id, title, abstract, raw_text)
    VALUES (NEW.id, NEW.workspace_id, COALESCE(NEW.title, ''), COALESCE(NEW.abstract, ''), NEW.raw_text);
END;

CREATE TRIGGER IF NOT EXISTS trg_bibliography_fts_update
AFTER UPDATE OF title, abstract, raw_text, workspace_id, deleted_at ON bibliographic_items
BEGIN
    DELETE FROM bibliography_fts WHERE item_id = OLD.id;
    INSERT INTO bibliography_fts (item_id, workspace_id, title, abstract, raw_text)
    SELECT NEW.id, NEW.workspace_id, COALESCE(NEW.title, ''), COALESCE(NEW.abstract, ''), NEW.raw_text
    WHERE NEW.deleted_at IS NULL;
END;

CREATE TRIGGER IF NOT EXISTS trg_bibliography_fts_delete
AFTER DELETE ON bibliographic_items
BEGIN
    DELETE FROM bibliography_fts WHERE item_id = OLD.id;
END;

CREATE VIRTUAL TABLE IF NOT EXISTS prompt_fts USING fts5(
    prompt_id UNINDEXED,
    workspace_id UNINDEXED,
    name,
    description,
    content,
    tokenize = 'trigram case_sensitive 0'
);

CREATE TRIGGER IF NOT EXISTS trg_prompts_fts_insert
AFTER INSERT ON prompts
WHEN NEW.deleted_at IS NULL
BEGIN
    INSERT INTO prompt_fts (prompt_id, workspace_id, name, description, content)
    VALUES (NEW.id, NEW.workspace_id, NEW.name, COALESCE(NEW.description, ''), NEW.content);
END;

CREATE TRIGGER IF NOT EXISTS trg_prompts_fts_update
AFTER UPDATE OF name, description, content, workspace_id, deleted_at ON prompts
BEGIN
    DELETE FROM prompt_fts WHERE prompt_id = OLD.id;
    INSERT INTO prompt_fts (prompt_id, workspace_id, name, description, content)
    SELECT NEW.id, NEW.workspace_id, NEW.name, COALESCE(NEW.description, ''), NEW.content
    WHERE NEW.deleted_at IS NULL;
END;

CREATE TRIGGER IF NOT EXISTS trg_prompts_fts_delete
AFTER DELETE ON prompts
BEGIN
    DELETE FROM prompt_fts WHERE prompt_id = OLD.id;
END;

CREATE VIRTUAL TABLE IF NOT EXISTS ai_message_fts USING fts5(
    message_id UNINDEXED,
    conversation_id UNINDEXED,
    workspace_id UNINDEXED,
    role UNINDEXED,
    content,
    tokenize = 'trigram case_sensitive 0'
);

CREATE TRIGGER IF NOT EXISTS trg_ai_messages_fts_insert
AFTER INSERT ON ai_messages
BEGIN
    INSERT INTO ai_message_fts (message_id, conversation_id, workspace_id, role, content)
    SELECT NEW.id, NEW.conversation_id, C.workspace_id, NEW.role, NEW.content_markdown
    FROM ai_conversations AS C
    WHERE C.id = NEW.conversation_id AND C.deleted_at IS NULL;
END;

CREATE TRIGGER IF NOT EXISTS trg_ai_messages_fts_update
AFTER UPDATE OF content_markdown, role, conversation_id ON ai_messages
BEGIN
    DELETE FROM ai_message_fts WHERE message_id = OLD.id;
    INSERT INTO ai_message_fts (message_id, conversation_id, workspace_id, role, content)
    SELECT NEW.id, NEW.conversation_id, C.workspace_id, NEW.role, NEW.content_markdown
    FROM ai_conversations AS C
    WHERE C.id = NEW.conversation_id AND C.deleted_at IS NULL;
END;

CREATE TRIGGER IF NOT EXISTS trg_ai_messages_fts_delete
AFTER DELETE ON ai_messages
BEGIN
    DELETE FROM ai_message_fts WHERE message_id = OLD.id;
END;

CREATE VIRTUAL TABLE IF NOT EXISTS highlight_fts USING fts5(
    highlight_id UNINDEXED,
    workspace_id UNINDEXED,
    content,
    note,
    tokenize = 'trigram case_sensitive 0'
);

CREATE TRIGGER IF NOT EXISTS trg_highlights_fts_insert
AFTER INSERT ON highlights
WHEN NEW.deleted_at IS NULL
BEGIN
    INSERT INTO highlight_fts (highlight_id, workspace_id, content, note)
    VALUES (NEW.id, NEW.workspace_id, NEW.content_markdown, COALESCE(NEW.note_markdown, ''));
END;

CREATE TRIGGER IF NOT EXISTS trg_highlights_fts_update
AFTER UPDATE OF content_markdown, note_markdown, workspace_id, deleted_at ON highlights
BEGIN
    DELETE FROM highlight_fts WHERE highlight_id = OLD.id;
    INSERT INTO highlight_fts (highlight_id, workspace_id, content, note)
    SELECT NEW.id, NEW.workspace_id, NEW.content_markdown, COALESCE(NEW.note_markdown, '')
    WHERE NEW.deleted_at IS NULL;
END;

CREATE TRIGGER IF NOT EXISTS trg_highlights_fts_delete
AFTER DELETE ON highlights
BEGIN
    DELETE FROM highlight_fts WHERE highlight_id = OLD.id;
END;

-- =========================================================
-- 10. Convenience views
-- =========================================================

CREATE VIEW IF NOT EXISTS v_document_summary AS
SELECT
    D.id,
    D.workspace_id,
    D.folder_id,
    D.title,
    D.document_type,
    D.status,
    D.word_count,
    D.version,
    D.is_favorite,
    D.is_pinned,
    D.updated_at,
    D.last_opened_at,
    F.name AS folder_name,
    COUNT(DISTINCT C.item_id) AS citation_item_count,
    COUNT(DISTINCT A.asset_id) AS asset_count
FROM documents AS D
LEFT JOIN folders AS F ON F.id = D.folder_id
LEFT JOIN document_citations AS C ON C.document_id = D.id
LEFT JOIN document_assets AS A ON A.document_id = D.id
WHERE D.deleted_at IS NULL
GROUP BY D.id;

CREATE VIEW IF NOT EXISTS v_reference_usage AS
SELECT
    B.id AS item_id,
    B.workspace_id,
    B.title,
    B.publication_year,
    B.doi_normalized,
    COUNT(DISTINCT C.document_id) AS document_count,
    COALESCE(SUM(C.citation_count), 0) AS total_citation_count,
    MAX(C.last_cited_at) AS last_cited_at
FROM bibliographic_items AS B
LEFT JOIN document_citations AS C ON C.item_id = B.id
WHERE B.deleted_at IS NULL
GROUP BY B.id;

CREATE VIEW IF NOT EXISTS v_orphan_assets AS
SELECT A.*
FROM assets AS A
LEFT JOIN document_assets AS DA ON DA.asset_id = A.id
LEFT JOIN ai_message_assets AS AA ON AA.asset_id = A.id
LEFT JOIN slide_assets AS SA ON SA.asset_id = A.id
LEFT JOIN file_entries AS FE ON FE.asset_id = A.id AND FE.deleted_at IS NULL
WHERE A.deleted_at IS NULL
  AND DA.asset_id IS NULL
  AND AA.asset_id IS NULL
  AND SA.asset_id IS NULL
  AND FE.asset_id IS NULL;

CREATE VIEW IF NOT EXISTS v_workspace_stats AS
WITH
D AS (
    SELECT workspace_id, COUNT(*) AS document_count, COALESCE(SUM(word_count), 0) AS total_word_count
    FROM documents WHERE deleted_at IS NULL GROUP BY workspace_id
),
B AS (
    SELECT workspace_id, COUNT(*) AS reference_count
    FROM bibliographic_items WHERE deleted_at IS NULL GROUP BY workspace_id
),
C AS (
    SELECT workspace_id, COUNT(*) AS conversation_count
    FROM ai_conversations WHERE deleted_at IS NULL GROUP BY workspace_id
),
A AS (
    SELECT workspace_id, COUNT(*) AS asset_count
    FROM assets WHERE deleted_at IS NULL GROUP BY workspace_id
)
SELECT
    W.id AS workspace_id,
    W.name,
    COALESCE(D.document_count, 0) AS document_count,
    COALESCE(B.reference_count, 0) AS reference_count,
    COALESCE(C.conversation_count, 0) AS conversation_count,
    COALESCE(A.asset_count, 0) AS asset_count,
    COALESCE(D.total_word_count, 0) AS total_word_count
FROM workspaces AS W
LEFT JOIN D ON D.workspace_id = W.id
LEFT JOIN B ON B.workspace_id = W.id
LEFT JOIN C ON C.workspace_id = W.id
LEFT JOIN A ON A.workspace_id = W.id
WHERE W.deleted_at IS NULL;

INSERT OR IGNORE INTO schema_migrations (version, name, checksum, applied_at)
VALUES (3, 'mdpro_full_schema_v3', 'dc407ce4125830c2bac94edebf86d4c98cb998a8fc0b411661dfb454b7e70bf9', CAST(strftime('%s','now') AS INTEGER) * 1000);

COMMIT;

PRAGMA optimize;
