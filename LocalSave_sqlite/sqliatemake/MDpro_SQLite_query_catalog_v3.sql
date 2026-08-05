-- MDpro SQLite Query Catalog v3
-- Named parameters use :parameter_name syntax.
-- Execute write groups inside a Rust transaction.

-- =========================================================
-- Q01. Database health and schema version
-- =========================================================
PRAGMA quick_check;
PRAGMA foreign_key_check;
SELECT MAX(version) AS schema_version FROM schema_migrations;

-- =========================================================
-- Q02. Create a workspace and root folder atomically
-- =========================================================
BEGIN IMMEDIATE;
INSERT INTO workspaces (
    id, owner_profile_id, name, description, workspace_type,
    default_citation_style, locale, created_at, updated_at
) VALUES (
    :workspace_id, :owner_profile_id, :name, :description, :workspace_type,
    :citation_style, :locale, :now_ms, :now_ms
);

INSERT INTO folders (
    id, workspace_id, parent_id, name, sort_order,
    created_at, updated_at
) VALUES (
    :root_folder_id, :workspace_id, NULL, :root_folder_name, 0,
    :now_ms, :now_ms
);
COMMIT;

-- =========================================================
-- Q03. Recursive folder tree
-- =========================================================
WITH RECURSIVE folder_tree AS (
    SELECT
        id, workspace_id, parent_id, name, sort_order,
        0 AS depth,
        printf('%08d', sort_order) || '/' || name AS sort_path
    FROM folders
    WHERE workspace_id = :workspace_id
      AND parent_id IS NULL
      AND deleted_at IS NULL

    UNION ALL

    SELECT
        F.id, F.workspace_id, F.parent_id, F.name, F.sort_order,
        P.depth + 1,
        P.sort_path || '/' || printf('%08d', F.sort_order) || '/' || F.name
    FROM folders AS F
    JOIN folder_tree AS P ON P.id = F.parent_id
    WHERE F.deleted_at IS NULL
)
SELECT *
FROM folder_tree
ORDER BY sort_path;

-- =========================================================
-- Q04. Create a document and its first version
-- =========================================================
BEGIN IMMEDIATE;
INSERT INTO documents (
    id, workspace_id, folder_id, title, content, content_format,
    document_type, status, language, source_mode,
    word_count, checksum, version, created_at, updated_at, last_opened_at
) VALUES (
    :document_id, :workspace_id, :folder_id, :title, :content, :content_format,
    :document_type, :status, :language, :source_mode,
    :word_count, :checksum, 1, :now_ms, :now_ms, :now_ms
);

INSERT INTO document_versions (
    id, document_id, version_no, title, content, checksum,
    change_type, change_summary, created_by, created_at
) VALUES (
    :version_id, :document_id, 1, :title, :content, :checksum,
    'manual_save', 'Initial version', :created_by, :now_ms
);
COMMIT;

-- =========================================================
-- Q05. Update document using optimistic locking
-- If zero rows are returned, raise VERSION_CONFLICT.
-- =========================================================
UPDATE documents
SET
    title = :title,
    content = :content,
    folder_id = :folder_id,
    word_count = :word_count,
    checksum = :checksum,
    version = version + 1,
    updated_at = :now_ms
WHERE id = :document_id
  AND version = :expected_version
  AND deleted_at IS NULL
RETURNING id, version, updated_at, checksum;

-- After Q05 succeeds, insert a durable version when policy requires it.
INSERT INTO document_versions (
    id, document_id, version_no, title, content, checksum,
    change_type, change_summary, created_by, created_at
)
SELECT
    :version_id, id, version, title, content, checksum,
    :change_type, :change_summary, :created_by, :now_ms
FROM documents
WHERE id = :document_id;

-- =========================================================
-- Q06. List documents without loading full content
-- =========================================================
SELECT
    id, folder_id, title, document_type, status, word_count,
    version, is_favorite, is_pinned, updated_at, last_opened_at
FROM documents
WHERE workspace_id = :workspace_id
  AND deleted_at IS NULL
  AND (:folder_id IS NULL OR folder_id = :folder_id)
  AND (:document_type IS NULL OR document_type = :document_type)
ORDER BY is_pinned DESC, updated_at DESC
LIMIT :limit OFFSET :offset;

-- =========================================================
-- Q07. Open one document
-- =========================================================
SELECT *
FROM documents
WHERE id = :document_id
  AND deleted_at IS NULL;

UPDATE documents
SET last_opened_at = :now_ms
WHERE id = :document_id;

-- =========================================================
-- Q08. Soft delete, restore, and purge document
-- =========================================================
UPDATE documents
SET deleted_at = :now_ms, updated_at = :now_ms
WHERE id = :document_id AND deleted_at IS NULL;

UPDATE documents
SET deleted_at = NULL, updated_at = :now_ms
WHERE id = :document_id AND deleted_at IS NOT NULL;

-- Permanent deletion should be used only after backup and user confirmation.
DELETE FROM documents
WHERE id = :document_id AND deleted_at IS NOT NULL;

-- =========================================================
-- Q09. Move a folder and prevent a cycle
-- Perform the cycle check first; only move when result is zero.
-- =========================================================
WITH RECURSIVE descendants(id) AS (
    SELECT id FROM folders WHERE id = :folder_id
    UNION ALL
    SELECT F.id FROM folders AS F JOIN descendants AS D ON F.parent_id = D.id
)
SELECT COUNT(*) AS cycle_count
FROM descendants
WHERE id = :new_parent_id;

UPDATE folders
SET parent_id = :new_parent_id,
    sort_order = :sort_order,
    updated_at = :now_ms
WHERE id = :folder_id
  AND deleted_at IS NULL;

-- =========================================================
-- Q10. Upsert document metadata
-- value_json must be valid JSON, including JSON strings such as "apa7".
-- =========================================================
INSERT INTO document_metadata (document_id, meta_key, value_json, updated_at)
VALUES (:document_id, :meta_key, :value_json, :now_ms)
ON CONFLICT(document_id, meta_key) DO UPDATE SET
    value_json = excluded.value_json,
    updated_at = excluded.updated_at;

SELECT meta_key, value_json
FROM document_metadata
WHERE document_id = :document_id;

-- =========================================================
-- Q11. Document version list and restore
-- =========================================================
SELECT
    id, version_no, title, checksum, change_type,
    change_summary, created_by, created_at
FROM document_versions
WHERE document_id = :document_id
ORDER BY version_no DESC;

BEGIN IMMEDIATE;
UPDATE documents
SET
    title = (SELECT title FROM document_versions WHERE id = :restore_version_id AND document_id = :document_id),
    content = (SELECT content FROM document_versions WHERE id = :restore_version_id AND document_id = :document_id),
    checksum = (SELECT checksum FROM document_versions WHERE id = :restore_version_id AND document_id = :document_id),
    version = version + 1,
    updated_at = :now_ms
WHERE id = :document_id
  AND deleted_at IS NULL;

INSERT INTO document_versions (
    id, document_id, version_no, title, content, checksum,
    change_type, change_summary, created_by, created_at
)
SELECT
    :new_version_id, id, version, title, content, checksum,
    'restore', :change_summary, :created_by, :now_ms
FROM documents
WHERE id = :document_id;
COMMIT;

-- =========================================================
-- Q12. Document full-text search
-- FTS5 bm25 returns smaller values for better matches.
-- =========================================================
SELECT
    D.id, D.title, D.folder_id, D.updated_at,
    snippet(document_fts, 3, '<mark>', '</mark>', ' … ', 20) AS excerpt,
    bm25(document_fts, 5.0, 1.0) AS rank
FROM document_fts
JOIN documents AS D ON D.id = document_fts.document_id
WHERE document_fts MATCH :fts_query
  AND document_fts.workspace_id = :workspace_id
  AND D.deleted_at IS NULL
ORDER BY rank
LIMIT :limit OFFSET :offset;

-- =========================================================
-- Q13. Unified search across documents, references, prompts, chats, highlights
-- =========================================================
WITH results AS (
    SELECT
        'document' AS entity_type,
        D.id AS entity_id,
        D.title AS title,
        snippet(document_fts, 3, '<mark>', '</mark>', ' … ', 18) AS excerpt,
        bm25(document_fts, 5.0, 1.0) AS raw_rank,
        D.updated_at AS activity_at
    FROM document_fts
    JOIN documents AS D ON D.id = document_fts.document_id
    WHERE document_fts MATCH :fts_query
      AND document_fts.workspace_id = :workspace_id
      AND D.deleted_at IS NULL

    UNION ALL

    SELECT
        'reference', B.id, COALESCE(B.title, B.raw_text),
        snippet(bibliography_fts, 3, '<mark>', '</mark>', ' … ', 18),
        bm25(bibliography_fts, 5.0, 1.5, 1.0),
        B.updated_at
    FROM bibliography_fts
    JOIN bibliographic_items AS B ON B.id = bibliography_fts.item_id
    WHERE bibliography_fts MATCH :fts_query
      AND bibliography_fts.workspace_id = :workspace_id
      AND B.deleted_at IS NULL

    UNION ALL

    SELECT
        'prompt', P.id, P.name,
        snippet(prompt_fts, 4, '<mark>', '</mark>', ' … ', 18),
        bm25(prompt_fts, 4.0, 1.0, 1.5),
        P.updated_at
    FROM prompt_fts
    JOIN prompts AS P ON P.id = prompt_fts.prompt_id
    WHERE prompt_fts MATCH :fts_query
      AND prompt_fts.workspace_id = :workspace_id
      AND P.deleted_at IS NULL

    UNION ALL

    SELECT
        'ai_message', M.id, C.title,
        snippet(ai_message_fts, 4, '<mark>', '</mark>', ' … ', 18),
        bm25(ai_message_fts, 1.0),
        M.updated_at
    FROM ai_message_fts
    JOIN ai_messages AS M ON M.id = ai_message_fts.message_id
    JOIN ai_conversations AS C ON C.id = M.conversation_id
    WHERE ai_message_fts MATCH :fts_query
      AND ai_message_fts.workspace_id = :workspace_id
      AND C.deleted_at IS NULL

    UNION ALL

    SELECT
        'highlight', H.id, 'Highlight',
        snippet(highlight_fts, 2, '<mark>', '</mark>', ' … ', 18),
        bm25(highlight_fts, 1.5, 1.0),
        H.updated_at
    FROM highlight_fts
    JOIN highlights AS H ON H.id = highlight_fts.highlight_id
    WHERE highlight_fts MATCH :fts_query
      AND highlight_fts.workspace_id = :workspace_id
      AND H.deleted_at IS NULL
)
SELECT *
FROM results
ORDER BY raw_rank ASC, activity_at DESC
LIMIT :limit OFFSET :offset;

-- =========================================================
-- Q14. Upsert a source-tree file entry (legacy inDB, FM, GitHub, WebDAV)
-- =========================================================
INSERT INTO file_entries (
    id, source_id, parent_id, entry_type, path, name, extension,
    mime_type, content_text, asset_id, size_bytes, modified_at,
    remote_revision, checksum, base_checksum, sync_status,
    created_at, updated_at
) VALUES (
    :id, :source_id, :parent_id, :entry_type, :path, :name, :extension,
    :mime_type, :content_text, :asset_id, :size_bytes, :modified_at,
    :remote_revision, :checksum, :base_checksum, :sync_status,
    :now_ms, :now_ms
)
ON CONFLICT(source_id, path) DO UPDATE SET
    parent_id = excluded.parent_id,
    entry_type = excluded.entry_type,
    name = excluded.name,
    extension = excluded.extension,
    mime_type = excluded.mime_type,
    content_text = excluded.content_text,
    asset_id = excluded.asset_id,
    size_bytes = excluded.size_bytes,
    modified_at = excluded.modified_at,
    remote_revision = excluded.remote_revision,
    checksum = excluded.checksum,
    sync_status = excluded.sync_status,
    updated_at = excluded.updated_at,
    deleted_at = NULL;

-- =========================================================
-- Q15. Detect local/remote sync conflicts
-- =========================================================
SELECT
    DS.id AS document_source_id,
    D.id AS document_id,
    D.version AS local_version,
    D.checksum AS local_checksum,
    DS.last_synced_document_version,
    DS.last_synced_checksum,
    FE.remote_revision,
    FE.checksum AS remote_checksum
FROM document_sources AS DS
JOIN documents AS D ON D.id = DS.document_id
LEFT JOIN file_entries AS FE ON FE.id = DS.file_entry_id
WHERE DS.source_id = :source_id
  AND D.deleted_at IS NULL
  AND D.version > COALESCE(DS.last_synced_document_version, 0)
  AND FE.remote_revision IS NOT NULL
  AND FE.remote_revision <> COALESCE(DS.remote_revision, '')
  AND D.checksum <> COALESCE(FE.checksum, '');

-- =========================================================
-- Q16. Register an asset and link it to a document
-- The binary file is written atomically by Rust before COMMIT.
-- =========================================================
BEGIN IMMEDIATE;
INSERT INTO assets (
    id, workspace_id, asset_type, storage_type,
    original_name, stored_name, relative_path, external_url,
    mime_type, extension, size_bytes, width, height, duration_ms,
    checksum_sha256, source_provider, created_at, updated_at
) VALUES (
    :asset_id, :workspace_id, :asset_type, :storage_type,
    :original_name, :stored_name, :relative_path, :external_url,
    :mime_type, :extension, :size_bytes, :width, :height, :duration_ms,
    :checksum_sha256, :source_provider, :now_ms, :now_ms
)
ON CONFLICT DO NOTHING;

-- Resolve an already existing duplicate by checksum before linking.
-- Rust should read this id and bind it as :resolved_asset_id.
SELECT id AS resolved_asset_id
FROM assets
WHERE COALESCE(workspace_id, '') = COALESCE(:workspace_id, '')
  AND checksum_sha256 = :checksum_sha256
  AND deleted_at IS NULL
LIMIT 1;

INSERT OR IGNORE INTO document_assets (
    document_id, asset_id, usage_role, alt_text, caption, sort_order, created_at
) VALUES (
    :document_id, :resolved_asset_id, :usage_role, :alt_text, :caption, :sort_order, :now_ms
);
COMMIT;

-- Resolve an internal://<asset_id> URI.
SELECT
    id, storage_type, relative_path, external_url, mime_type,
    original_name, size_bytes, checksum_sha256
FROM assets
WHERE id = :asset_id AND deleted_at IS NULL;

-- =========================================================
-- Q17. Orphan asset candidates
-- Do not immediately delete; move files to a quarantine directory first.
-- =========================================================
SELECT *
FROM v_orphan_assets
WHERE created_at < :older_than_ms
ORDER BY created_at;

-- =========================================================
-- Q18. Insert or update a bibliographic item by DOI
-- First find a duplicate, then update or insert inside one transaction.
-- =========================================================
SELECT id, version
FROM bibliographic_items
WHERE workspace_id = :workspace_id
  AND doi_normalized = :doi_normalized
  AND deleted_at IS NULL;

INSERT INTO bibliographic_items (
    id, workspace_id, item_type, title, normalized_title,
    container_title, abstract, publication_year, issued_date,
    volume, issue, pages, publisher, language, url,
    doi_normalized, citation_key, apa_text, raw_text, raw_json,
    source_provider, created_at, updated_at
) VALUES (
    :id, :workspace_id, :item_type, :title, :normalized_title,
    :container_title, :abstract, :publication_year, :issued_date,
    :volume, :issue, :pages, :publisher, :language, :url,
    :doi_normalized, :citation_key, :apa_text, :raw_text, :raw_json,
    :source_provider, :now_ms, :now_ms
)
ON CONFLICT(workspace_id, doi_normalized)
WHERE doi_normalized IS NOT NULL AND doi_normalized <> '' AND deleted_at IS NULL
DO UPDATE SET
    title = COALESCE(excluded.title, bibliographic_items.title),
    normalized_title = COALESCE(excluded.normalized_title, bibliographic_items.normalized_title),
    container_title = COALESCE(excluded.container_title, bibliographic_items.container_title),
    abstract = COALESCE(excluded.abstract, bibliographic_items.abstract),
    publication_year = COALESCE(excluded.publication_year, bibliographic_items.publication_year),
    url = COALESCE(excluded.url, bibliographic_items.url),
    apa_text = COALESCE(excluded.apa_text, bibliographic_items.apa_text),
    raw_text = CASE
        WHEN length(excluded.raw_text) > length(bibliographic_items.raw_text)
        THEN excluded.raw_text ELSE bibliographic_items.raw_text END,
    raw_json = COALESCE(excluded.raw_json, bibliographic_items.raw_json),
    source_provider = COALESCE(excluded.source_provider, bibliographic_items.source_provider),
    version = bibliographic_items.version + 1,
    updated_at = excluded.updated_at;

-- Fallback duplicate detection when DOI is absent.
SELECT id, title, publication_year
FROM bibliographic_items
WHERE workspace_id = :workspace_id
  AND normalized_title = :normalized_title
  AND publication_year IS :publication_year
  AND deleted_at IS NULL
LIMIT 5;

-- =========================================================
-- Q19. Replace bibliographic contributors atomically
-- =========================================================
BEGIN IMMEDIATE;
DELETE FROM bibliographic_contributors WHERE item_id = :item_id;
-- Execute the following INSERT once per contributor.
INSERT INTO bibliographic_contributors (
    id, item_id, role, sequence_no, family_name,
    given_name, literal_name, orcid, affiliation
) VALUES (
    :contributor_id, :item_id, :role, :sequence_no, :family_name,
    :given_name, :literal_name, :orcid, :affiliation
);
COMMIT;

-- =========================================================
-- Q20. Link a reference to a document and increment citation count
-- =========================================================
INSERT INTO document_citations (
    id, document_id, item_id, citation_key, locator,
    prefix_text, suffix_text, citation_context,
    first_cited_at, last_cited_at, citation_count
) VALUES (
    :id, :document_id, :item_id, :citation_key, :locator,
    :prefix_text, :suffix_text, :citation_context,
    :now_ms, :now_ms, 1
)
ON CONFLICT DO UPDATE SET
    citation_context = excluded.citation_context,
    last_cited_at = excluded.last_cited_at,
    citation_count = document_citations.citation_count + 1;

-- References used in one document, in author/year order.
SELECT
    B.id, B.title, B.publication_year, B.apa_text, B.raw_text,
    C.locator, C.citation_count
FROM document_citations AS C
JOIN bibliographic_items AS B ON B.id = C.item_id
WHERE C.document_id = :document_id
  AND B.deleted_at IS NULL
ORDER BY B.publication_year, B.title;

-- Documents that use one reference.
SELECT D.id, D.title, C.citation_count, C.last_cited_at
FROM document_citations AS C
JOIN documents AS D ON D.id = C.document_id
WHERE C.item_id = :item_id
  AND D.deleted_at IS NULL
ORDER BY C.last_cited_at DESC;

-- =========================================================
-- Q21. Save an academic search and its results
-- =========================================================
BEGIN IMMEDIATE;
INSERT INTO academic_searches (
    id, workspace_id, document_id, conversation_id,
    provider, query_text, query_used, filters_json, status,
    result_count, abstract_count, warnings_json,
    error_message, created_at, completed_at
) VALUES (
    :search_id, :workspace_id, :document_id, :conversation_id,
    :provider, :query_text, :query_used, :filters_json, :status,
    :result_count, :abstract_count, :warnings_json,
    :error_message, :created_at, :completed_at
);
-- Execute once per result.
INSERT INTO academic_search_results (
    search_id, rank_no, saved_item_id, provider_record_id,
    title, authors_text, publication_year, journal,
    doi_normalized, url, cited_by, abstract_text,
    source_names_json, relevance_score, raw_json
) VALUES (
    :search_id, :rank_no, :saved_item_id, :provider_record_id,
    :title, :authors_text, :publication_year, :journal,
    :doi_normalized, :url, :cited_by, :abstract_text,
    :source_names_json, :relevance_score, :raw_json
);
COMMIT;

-- =========================================================
-- Q22. Create AI conversation and append messages
-- =========================================================
INSERT INTO ai_conversations (
    id, workspace_id, document_id, provider_profile_id, title,
    response_mode, show_reasoning, academic_search_enabled,
    academic_search_count, context_json, created_at, updated_at
) VALUES (
    :conversation_id, :workspace_id, :document_id, :provider_profile_id, :title,
    :response_mode, :show_reasoning, :academic_search_enabled,
    :academic_search_count, :context_json, :now_ms, :now_ms
);

INSERT INTO ai_messages (
    id, conversation_id, parent_message_id, sequence_no, role,
    content_markdown, reasoning_summary, checklist_json, notice_text,
    provider, model, response_id, usage_json, metadata_json,
    academic_part, academic_total_parts, continuation_count,
    status, error_message, created_at, updated_at
) VALUES (
    :message_id, :conversation_id, :parent_message_id, :sequence_no, :role,
    :content_markdown, :reasoning_summary, :checklist_json, :notice_text,
    :provider, :model, :response_id, :usage_json, :metadata_json,
    :academic_part, :academic_total_parts, :continuation_count,
    :status, :error_message, :now_ms, :now_ms
);

UPDATE ai_conversations
SET updated_at = :now_ms
WHERE id = :conversation_id;

-- =========================================================
-- Q23. Finalize a streaming AI message with optimistic locking
-- Partial streaming text remains in IndexedDB until this succeeds.
-- =========================================================
UPDATE ai_messages
SET
    content_markdown = :content_markdown,
    reasoning_summary = :reasoning_summary,
    usage_json = :usage_json,
    metadata_json = :metadata_json,
    status = :status,
    error_message = :error_message,
    version = version + 1,
    updated_at = :now_ms
WHERE id = :message_id
  AND version = :expected_version
RETURNING id, version, status, updated_at;

-- =========================================================
-- Q24. Store sources attached to an AI answer
-- =========================================================
INSERT INTO ai_message_sources (
    id, message_id, bibliographic_item_id, citation_label,
    title, url, doi_normalized, provider, quoted_text,
    metadata_json, sort_order, created_at
) VALUES (
    :id, :message_id, :bibliographic_item_id, :citation_label,
    :title, :url, :doi_normalized, :provider, :quoted_text,
    :metadata_json, :sort_order, :now_ms
);

-- =========================================================
-- Q25. Create or update a prompt and preserve a version
-- =========================================================
BEGIN IMMEDIATE;
UPDATE prompts
SET
    name = :name,
    description = :description,
    content = :content,
    variables_json = :variables_json,
    default_values_json = :default_values_json,
    model_options_json = :model_options_json,
    version = version + 1,
    updated_at = :now_ms
WHERE id = :prompt_id
  AND version = :expected_version
  AND deleted_at IS NULL;

INSERT INTO prompt_versions (
    id, prompt_id, version_no, content, variables_json,
    default_values_json, model_options_json, change_summary, created_at
)
SELECT
    :prompt_version_id, id, version, content, variables_json,
    default_values_json, model_options_json, :change_summary, :now_ms
FROM prompts
WHERE id = :prompt_id;
COMMIT;

-- =========================================================
-- Q26. Upsert and read settings
-- =========================================================
INSERT INTO settings (
    scope_type, scope_id, setting_group, setting_key,
    value_json, value_type, updated_at
) VALUES (
    :scope_type, :scope_id, :setting_group, :setting_key,
    :value_json, :value_type, :now_ms
)
ON CONFLICT(scope_type, scope_id, setting_group, setting_key) DO UPDATE SET
    value_json = excluded.value_json,
    value_type = excluded.value_type,
    updated_at = excluded.updated_at;

SELECT setting_key, value_json, value_type, updated_at
FROM settings
WHERE scope_type = :scope_type
  AND scope_id = :scope_id
  AND setting_group = :setting_group
ORDER BY setting_key;

-- Resolve one setting with precedence: document -> workspace -> profile -> global.
WITH candidates(priority, value_json, value_type) AS (
    SELECT 1, value_json, value_type FROM settings
    WHERE scope_type = 'document' AND scope_id = :document_id
      AND setting_group = :setting_group AND setting_key = :setting_key
    UNION ALL
    SELECT 2, value_json, value_type FROM settings
    WHERE scope_type = 'workspace' AND scope_id = :workspace_id
      AND setting_group = :setting_group AND setting_key = :setting_key
    UNION ALL
    SELECT 3, value_json, value_type FROM settings
    WHERE scope_type = 'profile' AND scope_id = :profile_id
      AND setting_group = :setting_group AND setting_key = :setting_key
    UNION ALL
    SELECT 4, value_json, value_type FROM settings
    WHERE scope_type = 'global' AND scope_id = ''
      AND setting_group = :setting_group AND setting_key = :setting_key
)
SELECT value_json, value_type
FROM candidates
ORDER BY priority
LIMIT 1;

-- =========================================================
-- Q27. Create a workspace snapshot
-- Rust should create missing document_versions before linking them.
-- =========================================================
BEGIN IMMEDIATE;
INSERT INTO workspace_snapshots (
    id, workspace_id, snapshot_type, name, memo,
    app_version, state_json, file_count, document_count, created_at
) VALUES (
    :snapshot_id, :workspace_id, :snapshot_type, :name, :memo,
    :app_version, :state_json, :file_count, :document_count, :now_ms
);

-- Execute once per document included in the snapshot.
INSERT INTO snapshot_documents (
    snapshot_id, document_id, document_version_id, tab_order, is_active
) VALUES (
    :snapshot_id, :document_id, :document_version_id, :tab_order, :is_active
);

-- Execute once per virtual/source file included in the snapshot.
INSERT INTO snapshot_files (
    snapshot_id, source_id, path, entry_type,
    content_text, asset_id, checksum, modified_at
) VALUES (
    :snapshot_id, :source_id, :path, :entry_type,
    :content_text, :asset_id, :checksum, :modified_at
);
COMMIT;

-- =========================================================
-- Q28. Save and restore editor session metadata
-- Dirty document bodies are stored in IndexedDB drafts, not editor_tabs.
-- =========================================================
INSERT INTO editor_sessions (
    id, workspace_id, device_session_id,
    started_at, last_active_at, close_state
) VALUES (
    :session_id, :workspace_id, :device_session_id,
    :now_ms, :now_ms, 'open'
);

INSERT INTO editor_tabs (
    session_id, tab_id, document_id, temporary_key,
    tab_type, title, sort_order, is_active, is_dirty,
    cursor_position, scroll_position, opened_at, last_active_at
) VALUES (
    :session_id, :tab_id, :document_id, :temporary_key,
    :tab_type, :title, :sort_order, :is_active, :is_dirty,
    :cursor_position, :scroll_position, :now_ms, :now_ms
)
ON CONFLICT(session_id, tab_id) DO UPDATE SET
    document_id = excluded.document_id,
    temporary_key = excluded.temporary_key,
    tab_type = excluded.tab_type,
    title = excluded.title,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    is_dirty = excluded.is_dirty,
    cursor_position = excluded.cursor_position,
    scroll_position = excluded.scroll_position,
    last_active_at = excluded.last_active_at;

UPDATE editor_sessions
SET close_state = :close_state,
    last_active_at = :now_ms,
    closed_at = CASE WHEN :close_state = 'clean' THEN :now_ms ELSE closed_at END
WHERE id = :session_id;

-- =========================================================
-- Q29. Save a slide deck and reorder slides
-- =========================================================
UPDATE slide_decks
SET
    title = :title,
    description = :description,
    current_slide_index = :current_slide_index,
    theme_json = :theme_json,
    state_json = :state_json,
    version = version + 1,
    updated_at = :now_ms
WHERE id = :deck_id
  AND version = :expected_version
  AND deleted_at IS NULL
RETURNING id, version, updated_at;

-- Use a temporary negative range to avoid UNIQUE(deck_id, slide_no) collisions.
BEGIN IMMEDIATE;
UPDATE slides
SET slide_no = -slide_no - 1000000
WHERE deck_id = :deck_id;
-- Execute once for each slide using the desired :new_slide_no.
UPDATE slides
SET slide_no = :new_slide_no, updated_at = :now_ms
WHERE id = :slide_id AND deck_id = :deck_id;
COMMIT;

-- =========================================================
-- Q30. Workspace dashboard counts
-- =========================================================
SELECT *
FROM v_workspace_stats
WHERE workspace_id = :workspace_id;

SELECT
    document_type,
    COUNT(*) AS document_count,
    SUM(word_count) AS word_count
FROM documents
WHERE workspace_id = :workspace_id
  AND deleted_at IS NULL
GROUP BY document_type
ORDER BY document_count DESC;

-- =========================================================
-- Q31. Retention cleanup for document versions
-- Keep all manual/import/restore versions and only the newest N checkpoints.
-- =========================================================
WITH ranked AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY document_id
            ORDER BY version_no DESC
        ) AS rn
    FROM document_versions
    WHERE change_type = 'checkpoint'
)
DELETE FROM document_versions
WHERE id IN (
    SELECT id FROM ranked WHERE rn > :keep_checkpoint_count
);

-- Keep the most recent N automatic/history snapshots per workspace.
WITH ranked AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY workspace_id, snapshot_type
            ORDER BY created_at DESC
        ) AS rn
    FROM workspace_snapshots
    WHERE snapshot_type IN ('history', 'recovery', 'sync_checkpoint')
)
DELETE FROM workspace_snapshots
WHERE id IN (
    SELECT id FROM ranked WHERE rn > :keep_snapshot_count
);

-- =========================================================
-- Q32. Trash purge policy
-- =========================================================
DELETE FROM highlights
WHERE deleted_at IS NOT NULL AND deleted_at < :purge_before_ms;

DELETE FROM prompts
WHERE deleted_at IS NOT NULL AND deleted_at < :purge_before_ms;

DELETE FROM bibliographic_items
WHERE deleted_at IS NOT NULL AND deleted_at < :purge_before_ms;

DELETE FROM documents
WHERE deleted_at IS NOT NULL AND deleted_at < :purge_before_ms;

-- =========================================================
-- Q33. FTS rebuild after a migration or repair
-- =========================================================
DELETE FROM document_fts;
INSERT INTO document_fts (document_id, workspace_id, title, content)
SELECT id, workspace_id, title, content
FROM documents
WHERE deleted_at IS NULL;

DELETE FROM bibliography_fts;
INSERT INTO bibliography_fts (item_id, workspace_id, title, abstract, raw_text)
SELECT id, workspace_id, COALESCE(title, ''), COALESCE(abstract, ''), raw_text
FROM bibliographic_items
WHERE deleted_at IS NULL;

DELETE FROM prompt_fts;
INSERT INTO prompt_fts (prompt_id, workspace_id, name, description, content)
SELECT id, workspace_id, name, COALESCE(description, ''), content
FROM prompts
WHERE deleted_at IS NULL;

DELETE FROM ai_message_fts;
INSERT INTO ai_message_fts (message_id, conversation_id, workspace_id, role, content)
SELECT M.id, M.conversation_id, C.workspace_id, M.role, M.content_markdown
FROM ai_messages AS M
JOIN ai_conversations AS C ON C.id = M.conversation_id
WHERE C.deleted_at IS NULL;

DELETE FROM highlight_fts;
INSERT INTO highlight_fts (highlight_id, workspace_id, content, note)
SELECT id, workspace_id, content_markdown, COALESCE(note_markdown, '')
FROM highlights
WHERE deleted_at IS NULL;

-- =========================================================
-- Q34. Maintenance and backup operations
-- Run only when there is no active write transaction.
-- =========================================================
PRAGMA integrity_check;
PRAGMA foreign_key_check;
PRAGMA wal_checkpoint(PASSIVE);
PRAGMA optimize;

-- For a manual compact operation only; VACUUM may take time and needs free disk space.
VACUUM;

-- Prefer the SQLite online backup API from Rust for production backups.
-- VACUUM INTO can be used for an offline/manual copy when the path is safely validated.
-- VACUUM INTO '/absolute/path/mdpro-backup.sqlite';
