(function () {
    'use strict';

    let sqliteChangeBound = false;
    let sqliteMigrationPreviewRunning = false;
    let sqliteMigrationApplyRunning = false;
    let sqliteExplorerSnapshot = null;
    let sqliteExplorerTab = 'documents';
    let sqliteExplorerLoading = false;
    let sqliteBackupPackageRunning = false;
    let lastSqliteBackupPackage = null;
    let sqliteRestorePreviewRunning = false;
    let sqliteRestorePreviewAvailable = false;
    let selectedSqliteRestoreFile = null;
    const LOCAL_SQLITE_APP_URL = 'http://127.0.0.1:8765/';

    function getSqliteLaunchInfo() {
        const locationInfo = window.location || {};
        const protocol = String(locationInfo.protocol || '');
        const hostname = String(locationInfo.hostname || '').toLowerCase();
        const port = String(locationInfo.port || '');
        const isLocalHttp = (protocol === 'http:' || protocol === 'https:')
            && (hostname === '127.0.0.1' || hostname === 'localhost');
        const currentAddress = protocol === 'file:'
            ? 'file://'
            : String(locationInfo.origin || locationInfo.href || '알 수 없는 주소');
        return {
            localAppUrl: LOCAL_SQLITE_APP_URL,
            currentAddress: currentAddress,
            isLocalHttp: isLocalHttp,
            isExpectedPort: isLocalHttp && port === '8765'
        };
    }

    function sqliteStatusElements() {
        return {
            checkbox: document.getElementById('sqlite-enabled'),
            status: document.getElementById('sqlite-connection-status'),
            details: document.getElementById('sqlite-connection-details')
        };
    }

    function setSqliteStatus(message, tone, details) {
        const elements = sqliteStatusElements();
        if (elements.status) {
            elements.status.textContent = String(message || '');
            elements.status.className = 'text-[11px] ' + (
                tone === 'success' ? 'text-emerald-600 dark:text-emerald-400'
                    : tone === 'error' ? 'text-red-600 dark:text-red-400'
                        : tone === 'warning' ? 'text-amber-600 dark:text-amber-400'
                            : 'text-slate-500 dark:text-slate-400'
            );
        }
        if (elements.details) elements.details.textContent = String(details || '');
    }

    function setLocalAppLinkVisible(visible) {
        const link = document.getElementById('sqlite-open-local-app');
        if (!link) return;
        link.href = LOCAL_SQLITE_APP_URL;
        link.classList.toggle('hidden', visible !== true);
    }

    function sqliteOfflineDetails(error) {
        const launch = getSqliteLaunchInfo();
        if (!launch.isExpectedPort) {
            return '현재 앱 주소: ' + launch.currentAddress
                + ' · SQLite는 같은 출처의 로컬 앱에서만 안전하게 연결됩니다. '
                + '“로컬 앱 열기”로 ' + launch.localAppUrl + '를 연 뒤 다시 선택하세요.';
        }
        return (error && error.message ? error.message : '로컬 SQLite 서버에 연결할 수 없습니다.')
            + ' · run.py가 127.0.0.1:8765에서 실행 중인지 확인해 주세요.';
    }

    function sqliteOfflineStatus() {
        return getSqliteLaunchInfo().isExpectedPort
            ? 'SQLite 서버 연결 실패'
            : '로컬 SQLite 앱 주소가 아님';
    }

    function installSqliteControl() {
        const sqliteCheckbox = document.getElementById('sqlite-enabled');
        if (!sqliteCheckbox) return;
        const wrap = sqliteCheckbox.closest('.pt-1');
        if (!wrap) return;

        if (!wrap.querySelector('[data-sqlite-status-panel]')) {
            const panel = document.createElement('div');
            panel.className = 'mt-1 pl-6 space-y-1';
            panel.dataset.sqliteStatusPanel = '1';
            panel.innerHTML = [
                '<div class="flex items-center gap-2">',
                '  <span id="sqlite-connection-status" class="text-[11px] text-slate-500 dark:text-slate-400">서버 상태 확인 전</span>',
                '  <button type="button" id="sqlite-status-refresh" class="px-1.5 py-0.5 text-[10px] rounded border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700">다시 확인</button>',
                '  <a id="sqlite-open-local-app" href="http://127.0.0.1:8765/" target="_blank" rel="noopener noreferrer" class="hidden px-1.5 py-0.5 text-[10px] rounded border border-indigo-300 dark:border-indigo-700 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30">로컬 앱 열기</a>',
                '</div>',
                '<p id="sqlite-connection-details" class="text-[10px] leading-relaxed text-slate-500 dark:text-slate-500"></p>',
                '<div class="flex flex-wrap items-center gap-2 pt-1">',
                '  <button type="button" id="sqlite-migration-preview" disabled class="px-2 py-1 text-[10px] rounded border border-cyan-300 dark:border-cyan-700 text-cyan-700 dark:text-cyan-300 disabled:opacity-40">inDB 이관 미리보기</button>',
                '  <span class="text-[10px] text-slate-500 dark:text-slate-400">읽기 전용 비교 · 아직 이관하지 않음</span>',
                '</div>',
                '<div id="sqlite-migration-preview-result" class="hidden rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/50 p-2 text-[10px] text-slate-600 dark:text-slate-300"></div>'
                ,'<div class="mt-2 border-t border-slate-200 pt-2 dark:border-slate-700">'
                ,'  <div class="flex flex-wrap items-center gap-2">'
                ,'    <button type="button" id="sqlite-backup-package-create" disabled class="px-2 py-1 text-[10px] rounded border border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 disabled:opacity-40">공유 백업 만들기</button>'
                ,'    <span class="text-[10px] text-slate-500 dark:text-slate-400">DB 전체 + 연결된 로컬 자산 · 비밀 문서 내용 포함 가능</span>'
                ,'  </div>'
                ,'  <div id="sqlite-backup-package-result" class="hidden mt-2 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/50 p-2 text-[10px] text-slate-600 dark:text-slate-300"></div>'
                ,'</div>'
                ,'<div class="mt-2 border-t border-slate-200 pt-2 dark:border-slate-700">'
                ,'  <div class="flex flex-wrap items-center gap-2">'
                ,'    <input type="file" id="sqlite-restore-package-file" accept=".mdpbackup,application/vnd.mdviewer.backup+zip" class="hidden">'
                ,'    <button type="button" id="sqlite-restore-package-select" disabled class="px-2 py-1 text-[10px] rounded border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 disabled:opacity-40">복원 파일 선택</button>'
                ,'    <button type="button" id="sqlite-restore-package-preview" disabled class="px-2 py-1 text-[10px] rounded border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 disabled:opacity-40">복원 미리보기</button>'
                ,'    <span id="sqlite-restore-package-name" class="max-w-full truncate text-[10px] text-slate-500 dark:text-slate-400">선택된 파일 없음 · 실제 복원은 아직 비활성</span>'
                ,'  </div>'
                ,'  <div id="sqlite-restore-package-result" class="hidden mt-2 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/50 p-2 text-[10px] text-slate-600 dark:text-slate-300"></div>'
                ,'</div>'
            ].join('');
            wrap.appendChild(panel);
            const refresh = panel.querySelector('#sqlite-status-refresh');
            if (refresh) refresh.addEventListener('click', function () { refreshSqliteStatus(); });
            const migrationPreview = panel.querySelector('#sqlite-migration-preview');
            if (migrationPreview) migrationPreview.addEventListener('click', runSqliteMigrationPreview);
            const backupCreate = panel.querySelector('#sqlite-backup-package-create');
            if (backupCreate) backupCreate.addEventListener('click', runSqliteBackupPackageCreate);
            const restoreFile = panel.querySelector('#sqlite-restore-package-file');
            const restoreSelect = panel.querySelector('#sqlite-restore-package-select');
            const restorePreview = panel.querySelector('#sqlite-restore-package-preview');
            if (restoreSelect && restoreFile) restoreSelect.addEventListener('click', function () { restoreFile.click(); });
            if (restoreFile) restoreFile.addEventListener('change', handleSqliteRestoreFileSelection);
            if (restorePreview) restorePreview.addEventListener('click', runSqliteRestorePreview);
        }

        if (!sqliteChangeBound) {
            sqliteCheckbox.addEventListener('change', handleSqliteCheckboxChange);
            sqliteChangeBound = true;
        }
    }

    function setMigrationPreviewAvailable(available) {
        const button = document.getElementById('sqlite-migration-preview');
        if (!button) return;
        button.disabled = available !== true || sqliteMigrationPreviewRunning || sqliteMigrationApplyRunning;
    }

    function setSqliteExplorerAvailable(available) {
        const button = document.getElementById('btn-open-sqlite-explorer');
        if (!button) return;
        button.disabled = available !== true;
        button.title = available === true
            ? 'SQLite 서버에 저장된 데이터를 읽기 전용으로 탐색'
            : 'SQLite 로컬 서버 연결 후 사용할 수 있습니다.';
    }

    function setSqliteBackupPackageAvailable(available) {
        const button = document.getElementById('sqlite-backup-package-create');
        if (!button) return;
        button.disabled = available !== true || sqliteBackupPackageRunning;
        button.title = available === true
            ? '일관된 SQLite online backup과 연결 자산을 .mdpbackup으로 생성'
            : 'SQLite 백업 패키지 기능이 준비되지 않았습니다.';
    }

    function setSqliteRestorePreviewAvailable(available) {
        sqliteRestorePreviewAvailable = available === true;
        const selectButton = document.getElementById('sqlite-restore-package-select');
        const previewButton = document.getElementById('sqlite-restore-package-preview');
        if (selectButton) selectButton.disabled = !sqliteRestorePreviewAvailable || sqliteRestorePreviewRunning;
        if (previewButton) {
            previewButton.disabled = !sqliteRestorePreviewAvailable
                || sqliteRestorePreviewRunning
                || !selectedSqliteRestoreFile;
        }
    }

    function escapeMigrationText(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function formatExplorerDate(value) {
        const timestamp = Number(value || 0);
        if (!timestamp) return '-';
        try { return new Date(timestamp).toLocaleString('ko-KR'); } catch (_) { return String(value); }
    }

    function formatExplorerBytes(value) {
        const bytes = Number(value || 0);
        if (!bytes) return '0 B';
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    function explorerEmpty(message) {
        return '<div class="rounded border border-dashed border-slate-300 p-5 text-center text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">'
            + escapeMigrationText(message) + '</div>';
    }

    function renderSqliteExplorerCounts(snapshot) {
        const target = document.getElementById('sqlite-explorer-counts');
        if (!target) return;
        const counts = snapshot && snapshot.counts ? snapshot.counts : {};
        const items = [
            ['문서', counts.documents],
            ['폴더', counts.folders],
            ['버전', counts.versions],
            ['Source', counts.sources],
            ['파일', counts.fileEntries],
            ['설정', counts.settings],
            ['백업', counts.backups],
            ['이관 기록', counts.migrationCheckpoints],
            ['삭제 문서', counts.deletedDocuments]
        ];
        target.innerHTML = items.map(function (item) {
            return '<div class="rounded border border-slate-200 bg-slate-50 px-1 py-1 dark:border-slate-700 dark:bg-slate-950/50">'
                + '<b class="block text-sm text-slate-800 dark:text-slate-100">' + Number(item[1] || 0) + '</b>'
                + escapeMigrationText(item[0]) + '</div>';
        }).join('');
    }

    function renderSqliteExplorerList() {
        const target = document.getElementById('sqlite-explorer-list');
        if (!target) return;
        document.querySelectorAll('[data-sqlite-explorer-tab]').forEach(function (button) {
            const active = button.dataset.sqliteExplorerTab === sqliteExplorerTab;
            button.className = 'rounded-t px-3 py-1.5 text-xs font-semibold '
                + (active
                    ? 'bg-emerald-700 text-white'
                    : 'text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-800');
        });
        if (!sqliteExplorerSnapshot) {
            target.innerHTML = explorerEmpty('SQLite 데이터를 불러오지 못했습니다.');
            return;
        }

        let items = [];
        if (sqliteExplorerTab === 'documents') items = sqliteExplorerSnapshot.documents || [];
        if (sqliteExplorerTab === 'folders') items = sqliteExplorerSnapshot.folders || [];
        if (sqliteExplorerTab === 'files') items = sqliteExplorerSnapshot.fileEntries || [];
        if (sqliteExplorerTab === 'settings') items = sqliteExplorerSnapshot.settings || [];
        if (sqliteExplorerTab === 'backups') items = sqliteExplorerSnapshot.backups || [];
        if (sqliteExplorerTab === 'migrations') items = sqliteExplorerSnapshot.migrationCheckpoints || [];
        if (!items.length) {
            target.innerHTML = explorerEmpty(sqliteExplorerSnapshot.query ? '검색 결과가 없습니다.' : '저장된 항목이 없습니다.');
            return;
        }

        if (sqliteExplorerTab === 'documents') {
            target.innerHTML = items.map(function (item) {
                return '<button type="button" data-sqlite-document-id="' + escapeMigrationText(item.id) + '" '
                    + 'class="mb-2 block w-full rounded-lg border border-slate-200 bg-white p-3 text-left hover:border-emerald-500 hover:bg-emerald-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-emerald-950/20">'
                    + '<span class="block truncate text-sm font-bold text-slate-800 dark:text-slate-100">' + escapeMigrationText(item.title) + '</span>'
                    + '<span class="mt-1 block text-[10px] text-slate-500 dark:text-slate-400">'
                    + escapeMigrationText(item.folderName || item.folderId || 'ROOT') + ' · v' + Number(item.version || 0)
                    + ' · ' + escapeMigrationText(formatExplorerDate(item.updatedAt)) + '</span>'
                    + '<span class="mt-1 block truncate font-mono text-[9px] text-slate-400">' + escapeMigrationText(item.id) + '</span></button>';
            }).join('');
            target.querySelectorAll('[data-sqlite-document-id]').forEach(function (button) {
                button.addEventListener('click', function () {
                    openSqliteExplorerDocument(button.dataset.sqliteDocumentId);
                });
            });
            return;
        }

        if (sqliteExplorerTab === 'folders') {
            target.innerHTML = items.map(function (item) {
                return '<div class="mb-2 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">'
                    + '<p class="font-bold text-slate-800 dark:text-slate-100">' + escapeMigrationText(item.name) + '</p>'
                    + '<p class="mt-1 text-[10px] text-slate-500">문서 ' + Number(item.documentCount || 0)
                    + '건 · 상위 ' + escapeMigrationText(item.parentId || '-') + '</p>'
                    + '<p class="mt-1 truncate font-mono text-[9px] text-slate-400">' + escapeMigrationText(item.id) + '</p></div>';
            }).join('');
            return;
        }

        if (sqliteExplorerTab === 'files') {
            target.innerHTML = items.map(function (item) {
                const isFolder = item.entryType === 'folder';
                const openTag = isFolder
                    ? '<div'
                    : '<button type="button" data-sqlite-file-entry-id="' + escapeMigrationText(item.id) + '"';
                const closeTag = isFolder ? '</div>' : '</button>';
                return openTag + ' class="mb-2 block w-full rounded-lg border border-slate-200 bg-white p-3 text-left '
                    + (isFolder ? '' : 'hover:border-emerald-500 hover:bg-emerald-50 ')
                    + 'dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-emerald-950/20">'
                    + '<div class="flex items-center gap-2"><span>' + (isFolder ? '📁' : '📄') + '</span><b class="min-w-0 flex-1 truncate">' + escapeMigrationText(item.path) + '</b></div>'
                    + '<p class="mt-1 text-[10px] text-slate-500">' + escapeMigrationText(item.sourceName || item.sourceId || '-')
                    + (isFolder ? '' : ' · ' + escapeMigrationText(formatExplorerBytes(item.sizeBytes)) + ' · ' + escapeMigrationText(formatExplorerDate(item.modifiedAt))) + '</p>'
                    + closeTag;
            }).join('');
            target.querySelectorAll('[data-sqlite-file-entry-id]').forEach(function (button) {
                button.addEventListener('click', function () {
                    openSqliteExplorerFile(button.dataset.sqliteFileEntryId);
                });
            });
            return;
        }

        if (sqliteExplorerTab === 'settings') {
            target.innerHTML = items.map(function (item) {
                let renderedValue = '';
                try { renderedValue = JSON.stringify(item.value); } catch (_) { renderedValue = '[표시할 수 없음]'; }
                return '<div class="mb-2 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">'
                    + '<div class="flex items-center justify-between gap-2"><b class="truncate">' + escapeMigrationText(item.key) + '</b>'
                    + '<span class="text-[10px] text-violet-600 dark:text-violet-400">' + escapeMigrationText(item.scopeType) + '</span></div>'
                    + '<p class="mt-1 text-[10px] text-slate-500">' + escapeMigrationText(item.group) + ' · '
                    + escapeMigrationText(item.scopeId || '(global)') + ' · ' + escapeMigrationText(item.valueType) + '</p>'
                    + '<pre class="mt-2 max-h-28 overflow-auto whitespace-pre-wrap break-all rounded bg-slate-50 p-2 text-[10px] dark:bg-slate-950">'
                    + escapeMigrationText(renderedValue) + '</pre>'
                    + '<p class="mt-1 text-[10px] text-slate-400">' + escapeMigrationText(formatExplorerDate(item.updatedAt)) + '</p></div>';
            }).join('');
            return;
        }

        if (sqliteExplorerTab === 'backups') {
            target.innerHTML = items.map(function (item) {
                return '<div class="mb-2 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">'
                    + '<div class="flex items-center justify-between gap-2"><b>' + escapeMigrationText(item.type) + '</b><span class="text-[10px] text-emerald-600">' + escapeMigrationText(item.status) + '</span></div>'
                    + '<p class="mt-1 break-all text-[10px] text-slate-500">' + escapeMigrationText(item.filePath) + '</p>'
                    + '<p class="mt-1 text-[10px] text-slate-500">' + escapeMigrationText(formatExplorerBytes(item.sizeBytes)) + ' · schema v' + Number(item.schemaVersion || 0) + ' · ' + escapeMigrationText(formatExplorerDate(item.createdAt)) + '</p>'
                    + '<p class="mt-1 truncate font-mono text-[9px] text-slate-400" title="' + escapeMigrationText(item.checksumSha256 || '') + '">' + escapeMigrationText(item.checksumSha256 || '-') + '</p></div>';
            }).join('');
            return;
        }

        target.innerHTML = items.map(function (item) {
            const applied = item.applied || {};
            const verified = item.verified || {};
            return '<div class="mb-2 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">'
                + '<div class="flex items-center justify-between gap-2"><b class="truncate">' + escapeMigrationText(item.migrationId) + '</b><span class="text-[10px] text-cyan-600">' + escapeMigrationText(item.status || '-') + '</span></div>'
                + '<p class="mt-1 text-[10px] text-slate-500">적용 문서 ' + Number(applied.documents || 0) + ' · 폴더 ' + Number(applied.folders || 0)
                + ' · 파일 ' + Number(applied.files || 0) + ' · 검증 문서 ' + Number(verified.documents || 0)
                + ' · 검증 파일 ' + Number(verified.files || 0) + '</p>'
                + '<p class="mt-1 text-[10px] text-slate-500">' + escapeMigrationText(formatExplorerDate(item.completedAt || item.updatedAt)) + '</p></div>';
        }).join('');
    }

    function setSqliteExplorerTab(tab) {
        if (['documents', 'folders', 'files', 'settings', 'backups', 'migrations'].indexOf(tab) < 0) return;
        sqliteExplorerTab = tab;
        renderSqliteExplorerList();
        const detail = document.getElementById('sqlite-explorer-detail');
        if (detail && tab !== 'documents') {
            detail.innerHTML = '<p class="text-slate-500 dark:text-slate-400">이 목록은 읽기 전용입니다. 변경·삭제 기능은 제공하지 않습니다.</p>';
        }
    }

    async function openSqliteExplorerDocument(documentId) {
        const detail = document.getElementById('sqlite-explorer-detail');
        if (!detail || !window.MDPStorage) return;
        detail.innerHTML = '<p class="text-slate-500">문서와 버전 기록을 불러오는 중...</p>';
        try {
            const results = await Promise.all([
                window.MDPStorage.getSqliteExplorerDocument(documentId),
                window.MDPStorage.listSqliteExplorerDocumentVersions(documentId)
            ]);
            const item = results[0] || {};
            const versions = Array.isArray(results[1]) ? results[1] : [];
            detail.innerHTML = [
                '<h3 class="text-lg font-bold text-slate-900 dark:text-slate-100">' + escapeMigrationText(item.title || '(제목 없음)') + '</h3>',
                '<p class="mt-1 break-all font-mono text-[10px] text-slate-400">' + escapeMigrationText(item.id || documentId) + '</p>',
                '<div class="mt-3 grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">',
                '<span>폴더<br><b>' + escapeMigrationText(item.folderId || 'ROOT') + '</b></span>',
                '<span>현재 버전<br><b>v' + Number(item.version || 0) + '</b></span>',
                '<span>형식<br><b>' + escapeMigrationText(item.contentFormat || '-') + '</b></span>',
                '<span>수정<br><b>' + escapeMigrationText(formatExplorerDate(item.updatedAt)) + '</b></span>',
                '</div>',
                '<h4 class="mt-4 border-b border-slate-200 pb-1 text-xs font-bold dark:border-slate-700">본문</h4>',
                '<pre id="sqlite-explorer-document-content" class="mt-2 max-h-[45vh] overflow-auto whitespace-pre-wrap break-words rounded border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"></pre>',
                '<h4 class="mt-4 border-b border-slate-200 pb-1 text-xs font-bold dark:border-slate-700">버전 기록 (' + versions.length + ')</h4>',
                '<div class="mt-2 space-y-1">' + (versions.length ? versions.map(function (version) {
                    return '<div class="rounded border border-slate-200 px-2 py-1 text-[10px] dark:border-slate-700">v' + Number(version.version || 0)
                        + ' · ' + escapeMigrationText(version.changeType || '-') + ' · ' + escapeMigrationText(formatExplorerDate(version.createdAt))
                        + (version.changeSummary ? '<br><span class="text-slate-500">' + escapeMigrationText(version.changeSummary) + '</span>' : '') + '</div>';
                }).join('') : explorerEmpty('버전 기록이 없습니다.')) + '</div>'
            ].join('');
            const content = document.getElementById('sqlite-explorer-document-content');
            if (content) content.textContent = String(item.content == null ? '' : item.content);
        } catch (error) {
            detail.innerHTML = explorerEmpty(error && error.message ? error.message : '문서를 불러오지 못했습니다.');
        }
    }

    async function openSqliteExplorerFile(entryId) {
        const detail = document.getElementById('sqlite-explorer-detail');
        if (!detail || !window.MDPStorage) return;
        detail.innerHTML = '<p class="text-slate-500">파일 내용을 불러오는 중...</p>';
        try {
            const item = await window.MDPStorage.getSqliteExplorerFileEntry(entryId);
            detail.innerHTML = [
                '<h3 class="text-lg font-bold text-slate-900 dark:text-slate-100">' + escapeMigrationText(item.name || '(이름 없음)') + '</h3>',
                '<p class="mt-1 break-all font-mono text-[10px] text-slate-400">' + escapeMigrationText(item.path || '') + '</p>',
                '<div class="mt-3 grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">',
                '<span>Source<br><b>' + escapeMigrationText(item.sourceName || item.sourceId || '-') + '</b></span>',
                '<span>형식<br><b>' + escapeMigrationText(item.mimeType || item.extension || '-') + '</b></span>',
                '<span>크기<br><b>' + escapeMigrationText(formatExplorerBytes(item.sizeBytes)) + '</b></span>',
                '<span>수정<br><b>' + escapeMigrationText(formatExplorerDate(item.modifiedAt)) + '</b></span>',
                '</div>',
                '<p class="mt-3 break-all font-mono text-[9px] text-slate-400">SHA-256 ' + escapeMigrationText(item.checksum || '-') + '</p>',
                '<h4 class="mt-4 border-b border-slate-200 pb-1 text-xs font-bold dark:border-slate-700">파일 내용</h4>',
                '<pre id="sqlite-explorer-file-content" class="mt-2 max-h-[55vh] overflow-auto whitespace-pre-wrap break-words rounded border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"></pre>'
            ].join('');
            const content = document.getElementById('sqlite-explorer-file-content');
            if (content) content.textContent = String(item.content == null ? '' : item.content);
        } catch (error) {
            detail.innerHTML = explorerEmpty(error && error.message ? error.message : '파일을 불러오지 못했습니다.');
        }
    }

    async function refreshSqliteExplorer() {
        if (sqliteExplorerLoading) return;
        const status = document.getElementById('sqlite-explorer-status');
        const refreshButton = document.getElementById('sqlite-explorer-refresh');
        const queryElement = document.getElementById('sqlite-explorer-query');
        const database = document.getElementById('sqlite-explorer-database');
        const list = document.getElementById('sqlite-explorer-list');
        sqliteExplorerLoading = true;
        if (refreshButton) refreshButton.disabled = true;
        if (status) status.textContent = 'SQLite 데이터를 읽는 중...';
        if (list) list.innerHTML = explorerEmpty('불러오는 중...');
        try {
            if (!window.MDPStorage || typeof window.MDPStorage.getSqliteExplorerSnapshot !== 'function') {
                throw new Error('SQLite 탐색 모듈이 아직 준비되지 않았습니다.');
            }
            sqliteExplorerSnapshot = await window.MDPStorage.getSqliteExplorerSnapshot({
                query: queryElement ? queryElement.value.trim() : '',
                limit: 300
            });
            renderSqliteExplorerCounts(sqliteExplorerSnapshot);
            renderSqliteExplorerList();
            const db = sqliteExplorerSnapshot.database || {};
            if (database) database.textContent = (db.path || '-') + ' · schema v' + (db.schemaVersion || '-')
                + ' · ' + String(db.journalMode || '').toUpperCase() + ' · SQLite ' + (db.sqliteVersion || '-');
            if (status) status.textContent = '읽기 전용 조회 완료 · ' + formatExplorerDate(Date.now())
                + (sqliteExplorerSnapshot.query ? ' · 검색: ' + sqliteExplorerSnapshot.query : '');
        } catch (error) {
            sqliteExplorerSnapshot = null;
            renderSqliteExplorerCounts(null);
            if (list) list.innerHTML = explorerEmpty(error && error.message ? error.message : 'SQLite 서버에 연결할 수 없습니다.');
            if (database) database.textContent = 'SQLite 서버 연결 실패';
            if (status) status.textContent = error && error.message ? error.message : '조회 실패';
        } finally {
            sqliteExplorerLoading = false;
            if (refreshButton) refreshButton.disabled = false;
        }
    }

    function openSqliteExplorer() {
        const modal = document.getElementById('sqlite-explorer-modal');
        if (!modal) return;
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        sqliteExplorerTab = 'documents';
        refreshSqliteExplorer();
        const query = document.getElementById('sqlite-explorer-query');
        if (query) setTimeout(function () { query.focus(); }, 0);
    }

    function closeSqliteExplorer() {
        const modal = document.getElementById('sqlite-explorer-modal');
        if (!modal) return;
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }

    function renderMigrationPreviewResult(result) {
        const element = document.getElementById('sqlite-migration-preview-result');
        if (!element) return;
        const summary = result && result.summary ? result.summary : {};
        const documents = summary.documents || {};
        const folders = summary.folders || {};
        const fileSources = summary.fileSources || {};
        const fileEntries = summary.fileEntries || {};
        const settings = summary.settings || {};
        const settingsClassification = summary.settingsClassification || {};
        const missingSecrets = Array.isArray(summary.missingSecrets) ? summary.missingSecrets : [];
        const storageState = window.MDPStorage && typeof window.MDPStorage.getStatus === 'function'
            ? window.MDPStorage.getStatus()
            : null;
        const capabilities = storageState && storageState.sqliteHealth
            ? storageState.sqliteHealth.capabilities || {}
            : {};
        const canApply = capabilities.migration === true
            && capabilities.onlineBackup === true
            && Number(summary.newCount || 0) > 0
            && Number(summary.conflictCount || 0) === 0
            && Number(summary.excludedCount || 0) === 0;
        element.className = 'rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/50 p-2 text-[10px] text-slate-600 dark:text-slate-300';
        element.innerHTML = [
            '<p class="font-semibold text-slate-700 dark:text-slate-200">IndexedDB → SQLite 미리보기</p>',
            '<div class="grid grid-cols-5 gap-1 mt-2 text-center">',
            '  <div><b>' + Number(summary.sourceCount || 0) + '</b><br>원본</div>',
            '  <div class="text-emerald-600 dark:text-emerald-400"><b>' + Number(summary.newCount || 0) + '</b><br>신규</div>',
            '  <div class="text-sky-600 dark:text-sky-400"><b>' + Number(summary.duplicateCount || 0) + '</b><br>중복</div>',
            '  <div class="text-red-600 dark:text-red-400"><b>' + Number(summary.conflictCount || 0) + '</b><br>충돌</div>',
            '  <div class="text-amber-600 dark:text-amber-400"><b>' + Number(summary.excludedCount || 0) + '</b><br>제외</div>',
            '</div>',
            '<p class="mt-2">문서 ' + Number(documents.source || 0) + '건 · 폴더 ' + Number(folders.source || 0)
                + '건 · 파일 원본 ' + Number(summary.sourceFiles || 0) + '건 · 생성 경로 폴더 ' + Number(summary.generatedFileFolders || 0)
                + '건 · source ' + Number(fileSources.source || 0) + '건 · file entry ' + Number(fileEntries.source || 0) + '건</p>',
            '<p class="mt-1">비민감 설정 ' + Number(settings.source || 0) + '건 · 민감 설정 제외 '
                + Number(settingsClassification.sensitive || 0) + '건 · 일시/장치 상태 제외 '
                + Number(settingsClassification.transient || 0) + '건 · 미분류 제외 '
                + Number(settingsClassification.unknown || 0) + '건</p>',
            missingSecrets.length
                ? '<p class="mt-1 text-amber-600 dark:text-amber-400">다른 PC에서는 비밀값을 다시 입력해야 합니다: '
                    + escapeMigrationText(missingSecrets.join(', ')) + '</p>'
                : '',
            '<p class="mt-1 text-slate-500 dark:text-slate-400">SQLite에는 아직 아무 데이터도 쓰지 않았습니다. IndexedDB 원본은 실제 이관 후에도 삭제하지 않습니다.</p>',
            canApply
                ? '<button type="button" id="sqlite-migration-apply" class="mt-2 px-2 py-1 rounded bg-cyan-700 hover:bg-cyan-800 text-white text-[10px]">online backup 후 실제 이관</button>'
                : Number(summary.newCount || 0) === 0
                    ? '<p class="mt-2 text-sky-600 dark:text-sky-400">새로 이관할 항목이 없습니다.</p>'
                    : '<p class="mt-2 text-red-600 dark:text-red-400">충돌·제외 항목을 해결하기 전에는 실제 이관할 수 없습니다.</p>'
        ].join('');
        const applyButton = element.querySelector('#sqlite-migration-apply');
        if (applyButton) applyButton.addEventListener('click', runSqliteMigrationApply);
    }

    function renderMigrationApplyResult(result) {
        const element = document.getElementById('sqlite-migration-preview-result');
        if (!element) return;
        const applied = result && result.applied ? result.applied : {};
        const verified = result && result.verified ? result.verified : {};
        const backup = result && result.backup ? result.backup : {};
        element.className = 'rounded border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 p-2 text-[10px] text-emerald-700 dark:text-emerald-300';
        element.innerHTML = [
            '<p class="font-semibold">IndexedDB → SQLite 이관 완료</p>',
            '<p class="mt-1">적용: 폴더 ' + Number(applied.folders || 0) + '건 · 문서 ' + Number(applied.documents || 0)
                + '건 · 파일 source ' + Number(applied.fileSources || 0) + '건 · 경로 폴더 ' + Number(applied.fileFolders || 0) + '건 · 파일 ' + Number(applied.files || 0)
                + '건 · 비민감 설정 ' + Number(applied.settings || 0) + '건</p>',
            '<p>검증: 폴더 ' + Number(verified.folders || 0) + '건 · 문서 ' + Number(verified.documents || 0)
                + '건 · 파일 source ' + Number(verified.fileSources || 0) + '건 · 경로 폴더 ' + Number(verified.fileFolders || 0) + '건 · 파일 ' + Number(verified.files || 0)
                + '건 · 비민감 설정 ' + Number(verified.settings || 0) + '건</p>',
            '<p>중복 건너뜀: ' + Number(result && result.skippedDuplicates || 0) + '건</p>',
            backup.filePath ? '<p class="break-all">이관 전 backup: ' + escapeMigrationText(backup.filePath) + '</p>' : '',
            '<p class="mt-1">기존 IndexedDB 원본은 그대로 보존되며 API Key·토큰·비밀번호·인증 상태는 SQLite에 저장하지 않습니다.</p>'
        ].join('');
    }

    function renderSqliteBackupPackageResult(result) {
        const element = document.getElementById('sqlite-backup-package-result');
        if (!element) return;
        const manifest = result && result.manifest ? result.manifest : {};
        const database = manifest.database || {};
        const assets = manifest.assets || {};
        const validation = result && result.validation ? result.validation : {};
        element.className = 'mt-2 rounded border border-indigo-300 bg-indigo-50 p-2 text-[10px] text-indigo-800 dark:border-indigo-800 dark:bg-indigo-950/30 dark:text-indigo-200';
        element.innerHTML = [
            '<p class="font-semibold">.mdpbackup 생성 및 자체 검증 완료</p>',
            '<p class="mt-1 break-all">파일: ' + escapeMigrationText(result.fileName || '-') + '</p>',
            '<p>DB schema v' + Number(database.schemaVersion || 0) + ' · '
                + escapeMigrationText(formatExplorerBytes(database.sizeBytes)) + ' · 자산 '
                + Number(assets.count || 0) + '개 (' + escapeMigrationText(formatExplorerBytes(assets.totalBytes)) + ')</p>',
            '<p>검증: integrity ' + escapeMigrationText((validation.integrityCheck || []).join(',') || '-')
                + ' · FK 위반 ' + Number(validation.foreignKeyViolations || 0) + '</p>',
            '<p class="mt-1 break-all font-mono text-[9px]" title="package SHA-256">SHA-256 ' + escapeMigrationText(result.checksumSha256 || '-') + '</p>',
            '<p class="mt-1 text-amber-700 dark:text-amber-300">이 파일에는 모든 문서 본문·일반 설정과 연결된 로컬 자산이 포함됩니다. API Key·토큰은 설정 정책상 제외되지만 문서 본문에 직접 적은 비밀 내용은 포함될 수 있습니다.</p>',
            '<button type="button" id="sqlite-backup-package-download" class="mt-2 rounded bg-indigo-700 px-2 py-1 font-semibold text-white hover:bg-indigo-800">검증된 백업 다운로드</button>'
        ].join('');
        const downloadButton = element.querySelector('#sqlite-backup-package-download');
        if (downloadButton) downloadButton.addEventListener('click', runSqliteBackupPackageDownload);
    }

    function handleSqliteRestoreFileSelection(event) {
        const input = event && event.currentTarget ? event.currentTarget : document.getElementById('sqlite-restore-package-file');
        const file = input && input.files && input.files[0] ? input.files[0] : null;
        const nameElement = document.getElementById('sqlite-restore-package-name');
        const resultElement = document.getElementById('sqlite-restore-package-result');
        selectedSqliteRestoreFile = null;
        if (!file) {
            if (nameElement) nameElement.textContent = '선택된 파일 없음 · 실제 복원은 아직 비활성';
            setSqliteRestorePreviewAvailable(sqliteRestorePreviewAvailable);
            return;
        }
        if (!String(file.name || '').toLowerCase().endsWith('.mdpbackup')) {
            if (nameElement) nameElement.textContent = '올바른 .mdpbackup 파일을 선택해 주세요.';
            if (resultElement) {
                resultElement.textContent = '지원하지 않는 파일 형식입니다. 현재 DB는 변경되지 않았습니다.';
                resultElement.className = 'mt-2 rounded border border-red-300 bg-red-50 p-2 text-[10px] text-red-600 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400';
            }
            if (input) input.value = '';
            setSqliteRestorePreviewAvailable(sqliteRestorePreviewAvailable);
            return;
        }
        selectedSqliteRestoreFile = file;
        if (nameElement) {
            nameElement.textContent = String(file.name) + ' · ' + formatExplorerBytes(file.size)
                + ' · 아직 업로드/복원하지 않음';
        }
        if (resultElement) resultElement.classList.add('hidden');
        setSqliteRestorePreviewAvailable(sqliteRestorePreviewAvailable);
    }

    function renderSqliteRestorePreview(result) {
        const element = document.getElementById('sqlite-restore-package-result');
        if (!element) return;
        const validation = result && result.validation ? result.validation : {};
        const manifest = validation.manifest || {};
        const database = manifest.database || {};
        const assets = manifest.assets || {};
        const counts = validation.databaseCounts || {};
        element.className = 'mt-2 rounded border border-emerald-300 bg-emerald-50 p-2 text-[10px] text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200';
        element.innerHTML = [
            '<p class="font-semibold">복원 패키지 안전 검증 완료 · 미리보기 전용</p>',
            '<p class="mt-1 break-all">원본 파일: ' + escapeMigrationText(result.originalName || '-') + '</p>',
            '<div class="mt-2 grid grid-cols-3 gap-1 text-center sm:grid-cols-6">',
            '<span>문서<br><b>' + Number(counts.documents || 0) + '</b></span>',
            '<span>폴더<br><b>' + Number(counts.folders || 0) + '</b></span>',
            '<span>버전<br><b>' + Number(counts.documentVersions || 0) + '</b></span>',
            '<span>설정<br><b>' + Number(counts.settings || 0) + '</b></span>',
            '<span>자산<br><b>' + Number(counts.assets || 0) + '</b></span>',
            '<span>파일<br><b>' + Number(counts.fileEntries || 0) + '</b></span>',
            '</div>',
            '<p class="mt-2">schema v' + Number(validation.schemaVersion || database.schemaVersion || 0)
                + ' · DB ' + escapeMigrationText(formatExplorerBytes(validation.databaseSizeBytes))
                + ' · package 자산 ' + Number(assets.count || validation.assetCount || 0) + '개 ('
                + escapeMigrationText(formatExplorerBytes(assets.totalBytes || validation.assetBytes)) + ')</p>',
            '<p>검증: SHA-256 일치 · integrity ' + escapeMigrationText((validation.integrityCheck || []).join(',') || '-')
                + ' · FK 위반 ' + Number(validation.foreignKeyViolations || 0) + ' · 안전 경로 확인</p>',
            '<p class="mt-1 break-all font-mono text-[9px]">package SHA-256 ' + escapeMigrationText(validation.packageChecksumSha256 || result.packageChecksumSha256 || '-') + '</p>',
            '<p class="mt-2 font-semibold text-amber-700 dark:text-amber-300">패키지는 격리된 staging에만 보관되었습니다. 현재 SQLite DB와 assets는 변경되지 않았으며 실제 복원 버튼은 아직 제공하지 않습니다.</p>'
        ].join('');
    }

    async function runSqliteRestorePreview() {
        if (sqliteRestorePreviewRunning || !selectedSqliteRestoreFile) return;
        const previewButton = document.getElementById('sqlite-restore-package-preview');
        const selectButton = document.getElementById('sqlite-restore-package-select');
        const resultElement = document.getElementById('sqlite-restore-package-result');
        sqliteRestorePreviewRunning = true;
        if (previewButton) {
            previewButton.disabled = true;
            previewButton.textContent = '업로드 및 검증 중...';
        }
        if (selectButton) selectButton.disabled = true;
        if (resultElement) {
            resultElement.className = 'mt-2 rounded border border-slate-200 p-2 text-[10px] text-slate-600 dark:border-slate-700 dark:text-slate-300';
            resultElement.textContent = '격리 staging에 업로드한 뒤 ZIP 경로·manifest·SHA-256·schema·integrity·FK를 검사하고 있습니다.';
        }
        try {
            if (!window.MDPStorage || typeof window.MDPStorage.previewBackupRestore !== 'function') {
                throw new Error('SQLite 복원 미리보기 기능이 준비되지 않았습니다.');
            }
            const result = await window.MDPStorage.previewBackupRestore(selectedSqliteRestoreFile);
            renderSqliteRestorePreview(result);
        } catch (error) {
            if (resultElement) {
                resultElement.textContent = '복원 미리보기 차단: ' + (error && error.message ? error.message : error)
                    + ' · 실패한 staging 파일은 서버에서 제거되며 현재 SQLite DB는 변경되지 않습니다.';
                resultElement.className = 'mt-2 rounded border border-red-300 bg-red-50 p-2 text-[10px] text-red-600 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400';
            }
        } finally {
            sqliteRestorePreviewRunning = false;
            if (previewButton) previewButton.textContent = '복원 미리보기';
            setSqliteRestorePreviewAvailable(sqliteRestorePreviewAvailable);
        }
    }

    async function runSqliteBackupPackageCreate() {
        if (sqliteBackupPackageRunning) return;
        const accepted = window.confirm(
            '공유 백업에는 SQLite의 모든 문서 본문과 일반 설정, 연결된 로컬 자산이 포함됩니다.\n'
            + '문서에 직접 작성한 개인정보나 비밀 내용도 포함될 수 있습니다. 패키지를 생성할까요?'
        );
        if (!accepted) return;
        const button = document.getElementById('sqlite-backup-package-create');
        const element = document.getElementById('sqlite-backup-package-result');
        sqliteBackupPackageRunning = true;
        lastSqliteBackupPackage = null;
        if (button) {
            button.disabled = true;
            button.textContent = 'online backup 및 검증 중...';
        }
        if (element) {
            element.className = 'mt-2 rounded border border-slate-200 p-2 text-[10px] text-slate-600 dark:border-slate-700 dark:text-slate-300';
            element.textContent = 'SQLite online backup을 만든 뒤 manifest·DB checksum·integrity·FK·자산 checksum을 검증하고 있습니다.';
        }
        try {
            if (!window.MDPStorage || typeof window.MDPStorage.createBackupPackage !== 'function') {
                throw new Error('SQLite 공유 백업 기능이 준비되지 않았습니다.');
            }
            const result = await window.MDPStorage.createBackupPackage();
            lastSqliteBackupPackage = result;
            renderSqliteBackupPackageResult(result);
        } catch (error) {
            if (element) {
                element.textContent = '공유 백업 생성 실패: ' + (error && error.message ? error.message : error)
                    + ' · 현재 SQLite DB는 변경되지 않았습니다.';
                element.className = 'mt-2 rounded border border-red-300 bg-red-50 p-2 text-[10px] text-red-600 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400';
            }
        } finally {
            sqliteBackupPackageRunning = false;
            if (button) button.textContent = '공유 백업 만들기';
            const state = window.MDPStorage && typeof window.MDPStorage.getStatus === 'function'
                ? window.MDPStorage.getStatus()
                : null;
            setSqliteBackupPackageAvailable(!!(state && state.sqliteHealth && state.sqliteHealth.capabilities
                && state.sqliteHealth.capabilities.backupPackage === true));
        }
    }

    async function runSqliteBackupPackageDownload() {
        const button = document.getElementById('sqlite-backup-package-download');
        if (!lastSqliteBackupPackage || !lastSqliteBackupPackage.fileName) return;
        if (button) {
            button.disabled = true;
            button.textContent = '다운로드 준비 중...';
        }
        try {
            const downloaded = await window.MDPStorage.downloadBackupPackage(lastSqliteBackupPackage.fileName);
            const url = URL.createObjectURL(downloaded.blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = downloaded.fileName || lastSqliteBackupPackage.fileName;
            anchor.style.display = 'none';
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
            if (typeof window.showToast === 'function') window.showToast('검증된 SQLite 공유 백업 다운로드를 시작했습니다.');
        } catch (error) {
            if (typeof window.showToast === 'function') {
                window.showToast('백업 다운로드 실패: ' + (error && error.message ? error.message : error));
            }
        } finally {
            if (button) {
                button.disabled = false;
                button.textContent = '검증된 백업 다운로드';
            }
        }
    }

    async function runSqliteMigrationApply() {
        if (sqliteMigrationApplyRunning || sqliteMigrationPreviewRunning) return;
        const confirmed = window.confirm(
            'SQLite online backup을 먼저 만든 뒤 미리보기의 신규 문서·폴더·inDB 파일·비민감 설정을 이관합니다.\n'
            + '기존 IndexedDB 원본은 삭제하지 않습니다. 계속할까요?'
        );
        if (!confirmed) return;
        const button = document.getElementById('sqlite-migration-apply');
        const resultElement = document.getElementById('sqlite-migration-preview-result');
        sqliteMigrationApplyRunning = true;
        if (button) {
            button.disabled = true;
            button.textContent = 'backup 및 이관 중...';
        }
        try {
            if (!window.MDPIndexedDbMigration || typeof window.MDPIndexedDbMigration.applyLastPreview !== 'function') {
                throw new Error('IndexedDB 이관 적용 모듈이 준비되지 않았습니다.');
            }
            const result = await window.MDPIndexedDbMigration.applyLastPreview();
            renderMigrationApplyResult(result);
            if (typeof window.renderDBList === 'function') await window.renderDBList();
        } catch (error) {
            if (resultElement) {
                resultElement.textContent = '실제 이관 실패: ' + (error && error.message ? error.message : error)
                    + ' · IndexedDB 원본과 이관 전 backup은 유지됩니다.';
                resultElement.className = 'rounded border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-2 text-[10px] text-red-600 dark:text-red-400';
            }
        } finally {
            sqliteMigrationApplyRunning = false;
            const state = window.MDPStorage && typeof window.MDPStorage.getStatus === 'function'
                ? window.MDPStorage.getStatus()
                : null;
            setMigrationPreviewAvailable(!!(state && state.sqliteHealth && state.sqliteHealth.capabilities
                && state.sqliteHealth.capabilities.migrationPreview === true));
        }
    }

    async function runSqliteMigrationPreview() {
        if (sqliteMigrationPreviewRunning) return;
        const button = document.getElementById('sqlite-migration-preview');
        const resultElement = document.getElementById('sqlite-migration-preview-result');
        sqliteMigrationPreviewRunning = true;
        if (button) {
            button.disabled = true;
            button.textContent = 'IndexedDB 읽는 중...';
        }
        if (resultElement) {
            resultElement.className = 'rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/50 p-2 text-[10px] text-slate-600 dark:text-slate-300';
            resultElement.textContent = '문서·폴더·inDB 파일·비민감 설정과 본문 SHA-256을 읽고 SQLite와 비교하고 있습니다.';
        }
        try {
            if (!window.MDPIndexedDbMigration || typeof window.MDPIndexedDbMigration.preview !== 'function') {
                throw new Error('IndexedDB 이관 모듈이 준비되지 않았습니다.');
            }
            const result = await window.MDPIndexedDbMigration.preview();
            renderMigrationPreviewResult(result);
        } catch (error) {
            if (resultElement) {
                resultElement.textContent = '미리보기 실패: ' + (error && error.message ? error.message : error);
                resultElement.className = 'rounded border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-2 text-[10px] text-red-600 dark:text-red-400';
            }
        } finally {
            sqliteMigrationPreviewRunning = false;
            if (button) button.textContent = 'inDB 이관 미리보기';
            const state = window.MDPStorage && typeof window.MDPStorage.getStatus === 'function'
                ? window.MDPStorage.getStatus()
                : null;
            setMigrationPreviewAvailable(!!(state && state.sqliteHealth && state.sqliteHealth.capabilities
                && state.sqliteHealth.capabilities.migrationPreview === true));
        }
    }

    async function handleSqliteCheckboxChange(event) {
        const checkbox = event && event.currentTarget ? event.currentTarget : document.getElementById('sqlite-enabled');
        if (!checkbox || !window.MDPStorage) return;
        checkbox.disabled = true;
        setLocalAppLinkVisible(false);
        setSqliteStatus('SQLite 저장소 확인 중...', 'info', '');
        try {
            const targetMode = checkbox.checked ? 'sqlite' : 'indb';
            const state = await window.MDPStorage.requestMode(targetMode);
            checkbox.checked = state.activeMode === 'sqlite';
            await refreshSqliteStatus();
        } catch (error) {
            checkbox.checked = false;
            const code = error && error.code ? error.code : '';
            if (code === 'SQLITE_STORAGE_NOT_READY') {
                setSqliteStatus(
                    'SQLite 앱 연결됨 · 활성화 검증 중',
                    'warning',
                    '현재 문서는 계속 inDB에 저장됩니다. 자동저장 복구 검증이 완료되기 전에는 SQLite 모드를 켤 수 없습니다.'
                );
            } else if (code === 'RECOVERY_BUFFER_UNAVAILABLE') {
                setSqliteStatus('SQLite 복구 버퍼 사용 불가', 'error', error.message);
            } else {
                setLocalAppLinkVisible(true);
                setSqliteStatus(sqliteOfflineStatus(), 'error', sqliteOfflineDetails(error));
            }
        } finally {
            checkbox.disabled = false;
        }
    }

    async function refreshSqliteStatus() {
        installSqliteControl();
        const elements = sqliteStatusElements();
        if (!elements.checkbox) return null;
        if (!window.MDPStorage || typeof window.MDPStorage.getStatus !== 'function') {
            elements.checkbox.checked = false;
            setSqliteStatus('저장 모듈 로드 대기 중', 'info', '');
            return null;
        }

        let state = window.MDPStorage.getStatus();
        if (state.initialized && typeof window.MDPStorage.refreshSqliteHealth === 'function') {
            await window.MDPStorage.refreshSqliteHealth();
            state = window.MDPStorage.getStatus();
        }
        elements.checkbox.checked = state.activeMode === 'sqlite';
        const health = state.sqliteHealth;
        if (!health) {
            setMigrationPreviewAvailable(false);
            setSqliteExplorerAvailable(false);
            setSqliteBackupPackageAvailable(false);
            setSqliteRestorePreviewAvailable(false);
            setLocalAppLinkVisible(true);
            setSqliteStatus(sqliteOfflineStatus(), 'error', sqliteOfflineDetails(state.lastError) + ' · 현재 저장소: inDB');
            return state;
        }
        setLocalAppLinkVisible(false);
        setMigrationPreviewAvailable(!!(health.capabilities && health.capabilities.migrationPreview === true));
        setSqliteExplorerAvailable(!!(health.capabilities && health.capabilities.explorer === true));
        setSqliteBackupPackageAvailable(!!(health.capabilities && health.capabilities.backupPackage === true));
        setSqliteRestorePreviewAvailable(!!(health.capabilities && health.capabilities.restorePreview === true));
        const recovery = state.recoveryStatus || null;
        const recoveryReady = !!(recovery && recovery.available === true);
        const canActivate = !!(health.capabilities
            && health.capabilities.storageModeActivation === true
            && recoveryReady);
        const documentApiReady = !!(health.capabilities
            && health.capabilities.documents === true
            && health.capabilities.folders === true);
        const detail = 'DB: ' + (health.databasePath || '-')
            + ' · schema v' + (health.schemaVersion || '-')
            + ' · ' + String(health.journalMode || '').toUpperCase()
            + ' · 복구버퍼 ' + (recoveryReady ? '준비됨' : '사용 불가')
            + (recovery && recovery.pendingCount ? ' · 대기 ' + recovery.pendingCount + '건' : '');
        if (canActivate && state.activeMode === 'sqlite') {
            setSqliteStatus('SQLite 저장 사용 중', 'success', detail);
        } else if (canActivate) {
            setSqliteStatus('SQLite 사용 가능 · 현재 inDB', 'success', detail);
        } else if (documentApiReady) {
            setSqliteStatus('SQLite 앱 CRUD 연결됨 · 활성화 검증 중', 'warning', detail + ' · 현재 문서는 inDB에 저장됩니다.');
        } else {
            setSqliteStatus('서버 연결됨 · 문서 저장 전환 준비 중', 'warning', detail + ' · 현재 문서는 inDB에 저장됩니다.');
        }
        return state;
    }

    function syncSqliteCheckbox() {
        const elements = sqliteStatusElements();
        if (!elements.checkbox) return;
        const state = window.MDPStorage && typeof window.MDPStorage.getStatus === 'function'
            ? window.MDPStorage.getStatus()
            : null;
        elements.checkbox.checked = !!(state && state.activeMode === 'sqlite');
    }

    function installSettingUi() {
        installSqliteControl();
        refreshSqliteStatus();
        const query = document.getElementById('sqlite-explorer-query');
        if (query && query.dataset.sqliteExplorerBound !== '1') {
            query.dataset.sqliteExplorerBound = '1';
            query.addEventListener('keydown', function (event) {
                if (event.key === 'Enter') refreshSqliteExplorer();
            });
        }
        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape') closeSqliteExplorer();
        });
    }

    document.addEventListener('DOMContentLoaded', installSettingUi);

    window.SettingUI = {
        install: installSettingUi,
        installSqliteControl: installSqliteControl,
        refreshSqliteStatus: refreshSqliteStatus,
        syncSqliteCheckbox: syncSqliteCheckbox,
        getSqliteLaunchInfo: getSqliteLaunchInfo,
        runSqliteMigrationPreview: runSqliteMigrationPreview,
        renderMigrationPreviewResult: renderMigrationPreviewResult
        ,runSqliteMigrationApply: runSqliteMigrationApply
        ,renderMigrationApplyResult: renderMigrationApplyResult
        ,openSqliteExplorer: openSqliteExplorer
        ,closeSqliteExplorer: closeSqliteExplorer
        ,refreshSqliteExplorer: refreshSqliteExplorer
        ,setSqliteExplorerTab: setSqliteExplorerTab
        ,openSqliteExplorerDocument: openSqliteExplorerDocument
        ,openSqliteExplorerFile: openSqliteExplorerFile
        ,runSqliteBackupPackageCreate: runSqliteBackupPackageCreate
        ,runSqliteBackupPackageDownload: runSqliteBackupPackageDownload
        ,runSqliteRestorePreview: runSqliteRestorePreview
        ,renderSqliteRestorePreview: renderSqliteRestorePreview
    };
})();
