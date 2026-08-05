(function () {
    'use strict';

    let sqliteChangeBound = false;
    let sqliteMigrationPreviewRunning = false;
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
            ].join('');
            wrap.appendChild(panel);
            const refresh = panel.querySelector('#sqlite-status-refresh');
            if (refresh) refresh.addEventListener('click', function () { refreshSqliteStatus(); });
            const migrationPreview = panel.querySelector('#sqlite-migration-preview');
            if (migrationPreview) migrationPreview.addEventListener('click', runSqliteMigrationPreview);
        }

        if (!sqliteChangeBound) {
            sqliteCheckbox.addEventListener('change', handleSqliteCheckboxChange);
            sqliteChangeBound = true;
        }
    }

    function setMigrationPreviewAvailable(available) {
        const button = document.getElementById('sqlite-migration-preview');
        if (!button) return;
        button.disabled = available !== true || sqliteMigrationPreviewRunning;
    }

    function renderMigrationPreviewResult(result) {
        const element = document.getElementById('sqlite-migration-preview-result');
        if (!element) return;
        const summary = result && result.summary ? result.summary : {};
        const documents = summary.documents || {};
        const folders = summary.folders || {};
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
            '<p class="mt-2">문서 ' + Number(documents.source || 0) + '건 · 폴더 ' + Number(folders.source || 0) + '건</p>',
            '<p class="mt-1 text-slate-500 dark:text-slate-400">SQLite에는 아무 데이터도 쓰지 않았습니다. 실제 이관은 다음 단계에서 별도 확인 후 실행합니다.</p>'
        ].join('');
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
            resultElement.textContent = '문서·폴더와 본문 SHA-256을 읽고 SQLite와 비교하고 있습니다.';
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
            setLocalAppLinkVisible(true);
            setSqliteStatus(sqliteOfflineStatus(), 'error', sqliteOfflineDetails(state.lastError) + ' · 현재 저장소: inDB');
            return state;
        }
        setLocalAppLinkVisible(false);
        setMigrationPreviewAvailable(!!(health.capabilities && health.capabilities.migrationPreview === true));
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
    };
})();
