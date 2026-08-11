(function () {
    'use strict';

    let sqliteChangeBound = false;
    let sqliteMigrationPreviewRunning = false;
    let sqliteMigrationApplyRunning = false;
    let sqliteExplorerSnapshot = null;
    let sqliteExplorerTab = 'documents';
    let sqliteExplorerLoading = false;
    let sqliteExplorerDragBound = false;
    let sqliteExplorerPositioned = false;
    let sqliteExplorerFullscreen = false;
    let sqliteExplorerRestorePosition = null;
    let sqliteExplorerSelectedSettingIndex = -1;
    let sqliteExplorerSelectedBackupId = '';
    let sqliteExplorerFileDetailToken = 0;
    let sqliteExplorerPreviewUrls = [];
    let sqliteExplorerLMStudioProbeToken = 0;
    let sqliteExplorerLMStudioStatus = {
        state: 'idle',
        endpoint: '',
        models: [],
        error: '',
        checkedAt: 0
    };
    let sqliteIntegrityCheckRunning = false;
    let sqliteDatabaseExportRunning = false;
    let sqliteDatabaseImportRunning = false;
    let sqliteBackupPackageRunning = false;
    let lastSqliteBackupPackage = null;
    let sqliteRestorePreviewRunning = false;
    let sqliteRestorePreviewAvailable = false;
    let sqliteRestoreApplyRunning = false;
    let sqliteRestoreApplyAvailable = false;
    let selectedSqliteRestoreFile = null;
    let lastSqliteRestorePreview = null;
    let lastPreRestoreBackup = null;
    const LOCAL_SQLITE_APP_URL = 'http://127.0.0.1:8765/';
    const SQLITE_FEATURE_KEY = 'mdpro_sqlite_feature_enabled_v1';
    const DEFAULT_SQLITE_BACKEND = 'wasm';

    function readSqliteFeatureEnabled(fallback) {
        try {
            const stored = window.localStorage.getItem(SQLITE_FEATURE_KEY);
            if (stored != null) return stored === '1';
        } catch (_) {}
        return fallback === true;
    }

    function writeSqliteFeatureEnabled(enabled) {
        try { window.localStorage.setItem(SQLITE_FEATURE_KEY, enabled === true ? '1' : '0'); } catch (_) {}
    }

    function setSqliteSettingsPanelVisible(visible) {
        const panel = document.querySelector('[data-sqlite-status-panel]');
        if (!panel) return;
        const folded = typeof window.isSettingsContainerFolded === 'function'
            ? window.isSettingsContainerFolded('sqlite-settings-tool')
            : true;
        const expanded = visible === true && folded !== true;
        panel.classList.toggle('hidden', !expanded);
        panel.setAttribute('aria-hidden', expanded ? 'false' : 'true');
        const checkbox = document.getElementById('sqlite-enabled');
        if (checkbox) checkbox.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    }

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

    function notifyStorageFeatureVisibility() {
        if (typeof window.onStorageFeatureCheckboxChange === 'function') {
            window.onStorageFeatureCheckboxChange();
        }
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
        link.classList.remove('hidden');
        link.dataset.serverNeeded = visible === true ? '1' : '0';
    }

    function getFileProtocolProjectDirectory() {
        const locationInfo = window.location || {};
        if (String(locationInfo.protocol || '') !== 'file:') return '';
        try {
            let pathname = decodeURIComponent(new URL('.', String(locationInfo.href || '')).pathname || '');
            if (/^\/[a-zA-Z]:\//.test(pathname)) pathname = pathname.slice(1);
            return pathname.replace(/\//g, '\\').replace(/\\$/, '');
        } catch (_) {
            return '';
        }
    }

    function buildLocalSqliteServerCommand(projectDirectory) {
        const directory = String(projectDirectory || '');
        if (!directory) return '';
        return 'cmd.exe /k py -3 "' + directory + '\\run.py"';
    }

    function buildLocalSqliteServerFolderPickerCommand() {
        return 'powershell.exe -NoProfile -STA -Command "'
            + '$folder=(New-Object -ComObject Shell.Application).BrowseForFolder(0,'
            + "'run.py가 있는 md_viewer 폴더를 선택하세요',0);"
            + "if($folder){$runPy=Join-Path $folder.Self.Path 'run.py';"
            + "if(Test-Path -LiteralPath $runPy){py -3 $runPy}"
            + "else{Add-Type -AssemblyName PresentationFramework;"
            + "[System.Windows.MessageBox]::Show('선택한 폴더에 run.py가 없습니다.','MD Viewer')}}\"";
    }

    async function copyLocalServerCommand(command) {
        if (!command) return false;
        try {
            if (window.navigator && window.navigator.clipboard
                && typeof window.navigator.clipboard.writeText === 'function') {
                await window.navigator.clipboard.writeText(command);
                return true;
            }
        } catch (_) {}
        const textarea = document.createElement('textarea');
        textarea.value = command;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        let copied = false;
        try { copied = document.execCommand('copy') === true; } catch (_) {}
        textarea.remove();
        return copied;
    }

    async function startLocalSqliteServer() {
        const button = document.getElementById('sqlite-start-local-server');
        if (button) button.disabled = true;
        try {
            if (getSqliteLaunchInfo().isExpectedPort) {
                setSqliteStatus('Python 서버 실행 중', 'success', LOCAL_SQLITE_APP_URL + '에서 이미 실행 중입니다.');
                await refreshSqliteStatus();
                return;
            }
            if (window.api && typeof window.api.startLocalSqliteServer === 'function') {
                await window.api.startLocalSqliteServer();
                window.open(LOCAL_SQLITE_APP_URL, '_blank', 'noopener');
                return;
            }
            const projectDirectory = getFileProtocolProjectDirectory();
            const usesFolderPicker = !projectDirectory;
            const command = projectDirectory
                ? buildLocalSqliteServerCommand(projectDirectory)
                : buildLocalSqliteServerFolderPickerCommand();
            if (command && await copyLocalServerCommand(command)) {
                setSqliteStatus(
                    'Python 서버 실행 명령 복사됨',
                    'warning',
                    'Windows 키+R을 누르고 Ctrl+V, Enter를 차례로 누르세요. '
                        + (usesFolderPicker ? '폴더 찾기 창에서 run.py가 있는 md_viewer 폴더를 선택하세요. ' : '')
                        + 'run.py가 SQLite API와 웹 서버를 시작하고 ' + LOCAL_SQLITE_APP_URL + '를 자동으로 엽니다. '
                        + '또는 앱 폴더의 start-md-viewer-server.cmd를 직접 실행할 수 있습니다.'
                );
                if (typeof window.showToast === 'function') {
                    window.showToast(
                        '실행 명령 복사됨 · Windows 키+R → Ctrl+V → Enter'
                            + (usesFolderPicker ? ' → md_viewer 폴더 선택' : ''),
                        { tone: 'info', persistent: true, dismissible: true }
                    );
                }
                return;
            }
            if (command && typeof window.prompt === 'function') {
                window.prompt('아래 명령을 복사하여 Windows 실행(Windows 키+R)에 붙여넣으세요.', command);
                return;
            }
            const message = 'VS Code에서 “터미널 → 작업 실행 → MD Viewer: Python SQLite 서버”를 선택하거나 '
                + 'md_viewer 폴더에서 start-md-viewer-server.cmd를 실행해 주세요.';
            setSqliteStatus('Python 서버 실행 안내', 'warning', message);
            if (typeof window.showToast === 'function') {
                window.showToast(message, { tone: 'info', persistent: true, dismissible: true });
            }
        } finally {
            if (button) button.disabled = false;
        }
    }

    function sqliteOfflineDetails(error, state) {
        const preference = state && state.sqliteBackendPreference;
        if (preference === 'wasm') {
            return (error && error.message ? error.message : 'WASM SQLite를 초기화할 수 없습니다.')
                + ' · 이 브라우저에서 Web Worker, WebAssembly, OPFS를 사용할 수 있는지 확인해 주세요.';
        }
        if (preference === 'auto') {
            return (error && error.message ? error.message : '사용 가능한 SQLite 백엔드를 찾지 못했습니다.')
                + ' · Python API와 WASM · OPFS 연결을 모두 확인해 주세요.';
        }
        const launch = getSqliteLaunchInfo();
        if (!launch.isExpectedPort) {
            return '현재 앱 주소: ' + launch.currentAddress
                + ' · SQLite는 같은 출처의 로컬 앱에서만 안전하게 연결됩니다. '
                + '“로컬 앱 열기”로 ' + launch.localAppUrl + '를 연 뒤 다시 선택하세요.';
        }
        return (error && error.message ? error.message : '로컬 SQLite 서버에 연결할 수 없습니다.')
            + ' · run.py가 127.0.0.1:8765에서 실행 중인지 확인해 주세요.';
    }

    function sqliteOfflineStatus(state) {
        const preference = state && state.sqliteBackendPreference;
        if (preference === 'wasm') return 'WASM SQLite 초기화 실패';
        if (preference === 'auto') return 'SQLite 백엔드 연결 실패';
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
            panel.className = 'hidden mt-1 pl-6 space-y-1';
            panel.id = 'sqlite-runtime-settings-panel';
            panel.dataset.sqliteStatusPanel = '1';
            panel.innerHTML = [
                '<div class="flex items-center gap-2">',
                '  <span id="sqlite-connection-status" class="text-[11px] text-slate-500 dark:text-slate-400">서버 상태 확인 전</span>',
                '  <button type="button" id="sqlite-status-refresh" class="px-1.5 py-0.5 text-[10px] rounded border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700">다시 확인</button>',
                '</div>',
                '<div class="flex flex-wrap items-center gap-2">',
                '  <label for="sqlite-backend-select" class="text-[10px] text-slate-500 dark:text-slate-400">SQLite 실행 방식</label>',
                '  <select id="sqlite-backend-select" class="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] dark:border-slate-600 dark:bg-slate-800">',
                '    <option value="wasm" selected>WASM · OPFS (기본)</option>',
                '    <option value="api">Python API</option>',
                '    <option value="auto">자동 (API → WASM)</option>',
                '  </select>',
                '</div>',
                '<div class="flex flex-wrap items-center gap-2">',
                '  <button type="button" id="sqlite-start-local-server" class="px-2 py-1 text-[10px] rounded border border-emerald-400 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-40 dark:border-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300 dark:hover:bg-emerald-950/60">Python 서버 폴더 찾기</button>',
                '  <a id="sqlite-open-local-app" href="http://127.0.0.1:8765/" target="_blank" rel="noopener noreferrer" class="px-2 py-1 text-[10px] rounded border border-indigo-300 text-indigo-600 hover:bg-indigo-50 dark:border-indigo-700 dark:text-indigo-400 dark:hover:bg-indigo-950/30">127.0.0.1:8765 열기</a>',
                '</div>',
                '<p class="text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">Python API는 <code>run.py</code> 서버를 사용합니다. 버튼을 누른 뒤 <b>Windows 키+R → Ctrl+V → Enter</b>를 누르고, 폴더 찾기 창에서 <code>md_viewer</code> 폴더를 선택하세요. <code>file://</code>로 연 경우에는 현재 폴더가 자동 설정됩니다. WASM · OPFS는 Live Server 같은 localhost 주소에서도 동작합니다.</p>',
                '<p id="sqlite-connection-details" class="text-[10px] leading-relaxed text-slate-500 dark:text-slate-500"></p>',
                '<div class="flex flex-wrap items-center gap-2 pt-1">',
                '  <button type="button" id="sqlite-migration-preview" disabled class="px-2 py-1 text-[10px] rounded border border-cyan-300 dark:border-cyan-700 text-cyan-700 dark:text-cyan-300 disabled:opacity-40">inDB 이관 미리보기</button>',
                '  <span class="text-[10px] text-slate-500 dark:text-slate-400">읽기 전용 비교 · 아직 이관하지 않음</span>',
                '</div>',
                '<div id="sqlite-migration-preview-result" class="hidden rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/50 p-2 text-[10px] text-slate-600 dark:text-slate-300"></div>'
                ,'<div class="mt-2 border-t border-slate-200 pt-2 dark:border-slate-700">'
                ,'  <div class="flex flex-wrap items-center gap-2">'
                ,'    <button type="button" id="sqlite-integrity-check-run" disabled class="px-2 py-1 text-[10px] rounded border border-emerald-400 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 disabled:opacity-40">DB 무결성 검사</button>'
                ,'    <span class="text-[10px] text-slate-500 dark:text-slate-400">현재 DB를 변경하지 않고 integrity·FK를 검사</span>'
                ,'  </div>'
                ,'  <div id="sqlite-integrity-check-result" class="hidden mt-2 rounded border p-2 text-[10px]"></div>'
                ,'</div>'
                ,'<div class="mt-2 border-t border-slate-200 pt-2 dark:border-slate-700">'
                ,'  <div class="flex flex-wrap items-center gap-2">'
                ,'    <button type="button" id="sqlite-wasm-db-export" disabled class="px-2 py-1 text-[10px] rounded border border-violet-300 dark:border-violet-700 text-violet-700 dark:text-violet-300 disabled:opacity-40">WASM DB 파일 내보내기</button>'
                ,'    <input type="file" id="sqlite-wasm-db-import-file" accept=".sqlite,.sqlite3,.db,application/vnd.sqlite3,application/x-sqlite3" class="hidden">'
                ,'    <button type="button" id="sqlite-wasm-db-import" disabled class="px-2 py-1 text-[10px] rounded border border-fuchsia-300 dark:border-fuchsia-700 text-fuchsia-700 dark:text-fuchsia-300 disabled:opacity-40">WASM DB 파일 불러오기</button>'
                ,'    <span class="text-[10px] text-slate-500 dark:text-slate-400">OPFS SQLite 단일 파일 · 자산 ZIP 제외</span>'
                ,'  </div>'
                ,'  <div id="sqlite-wasm-db-export-result" class="hidden mt-2 rounded border p-2 text-[10px]"></div>'
                ,'  <div id="sqlite-wasm-db-import-result" class="hidden mt-2 rounded border p-2 text-[10px]"></div>'
                ,'</div>'
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
                ,'    <button type="button" id="sqlite-restore-package-apply" disabled class="px-2 py-1 text-[10px] rounded bg-red-700 text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-40">검증된 백업 복원</button>'
                ,'    <span id="sqlite-restore-package-name" class="max-w-full truncate text-[10px] text-slate-500 dark:text-slate-400">선택된 파일 없음</span>'
                ,'  </div>'
                ,'  <div id="sqlite-restore-package-result" class="hidden mt-2 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/50 p-2 text-[10px] text-slate-600 dark:text-slate-300"></div>'
                ,'</div>'
                ,'<div class="mt-2 rounded border border-amber-300 bg-amber-50 p-2 text-[10px] leading-relaxed text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">'
                ,'  <b>다른 PC 공유 안내</b><br>SQLite DB 파일을 OneDrive·NAS·공유 폴더에서 여러 PC가 동시에 열어 쓰는 방식은 지원하지 않습니다. PC 간 이동은 검증된 <b>.mdpbackup</b>을 사용하세요. 실시간 공동 사용은 상시 실행 호스트 서버·인증·TLS·충돌 정책이 필요한 별도 기능입니다.'
                ,'</div>'
            ].join('');
            wrap.appendChild(panel);
            const refresh = panel.querySelector('#sqlite-status-refresh');
            if (refresh) refresh.addEventListener('click', function () { refreshSqliteStatus(); });
            const backendSelect = panel.querySelector('#sqlite-backend-select');
            if (backendSelect) backendSelect.addEventListener('change', handleSqliteBackendChange);
            const serverStart = panel.querySelector('#sqlite-start-local-server');
            if (serverStart) serverStart.addEventListener('click', startLocalSqliteServer);
            const migrationPreview = panel.querySelector('#sqlite-migration-preview');
            if (migrationPreview) migrationPreview.addEventListener('click', runSqliteMigrationPreview);
            const integrityCheck = panel.querySelector('#sqlite-integrity-check-run');
            if (integrityCheck) integrityCheck.addEventListener('click', runSqliteIntegrityCheck);
            const databaseExport = panel.querySelector('#sqlite-wasm-db-export');
            if (databaseExport) databaseExport.addEventListener('click', runSqliteWasmDatabaseExport);
            const databaseImport = panel.querySelector('#sqlite-wasm-db-import');
            const databaseImportFile = panel.querySelector('#sqlite-wasm-db-import-file');
            if (databaseImport && databaseImportFile) {
                databaseImport.addEventListener('click', function () { databaseImportFile.click(); });
                databaseImportFile.addEventListener('change', runSqliteWasmDatabaseImport);
            }
            const backupCreate = panel.querySelector('#sqlite-backup-package-create');
            if (backupCreate) backupCreate.addEventListener('click', runSqliteBackupPackageCreate);
            const restoreFile = panel.querySelector('#sqlite-restore-package-file');
            const restoreSelect = panel.querySelector('#sqlite-restore-package-select');
            const restorePreview = panel.querySelector('#sqlite-restore-package-preview');
            const restoreApply = panel.querySelector('#sqlite-restore-package-apply');
            if (restoreSelect && restoreFile) restoreSelect.addEventListener('click', function () { restoreFile.click(); });
            if (restoreFile) restoreFile.addEventListener('change', handleSqliteRestoreFileSelection);
            if (restorePreview) restorePreview.addEventListener('click', runSqliteRestorePreview);
            if (restoreApply) restoreApply.addEventListener('click', runSqliteRestoreApply);
        }

        sqliteCheckbox.checked = readSqliteFeatureEnabled(sqliteCheckbox.checked);
        setSqliteSettingsPanelVisible(sqliteCheckbox.checked);

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
        const buttons = document.querySelectorAll('#btn-open-sqlite-explorer, #btn-footer-open-sqlite-explorer');
        buttons.forEach(function (button) {
            button.disabled = available !== true;
            button.title = available === true
                ? '현재 SQLite 백엔드에 저장된 데이터를 읽기 전용으로 탐색'
                : 'SQLite API 또는 WASM 백엔드 연결 후 사용할 수 있습니다.';
        });
    }

    function setSqliteBackupPackageAvailable(available) {
        const button = document.getElementById('sqlite-backup-package-create');
        if (!button) return;
        button.disabled = available !== true || sqliteBackupPackageRunning;
        button.title = available === true
            ? '일관된 SQLite online backup과 연결 자산을 .mdpbackup으로 생성'
            : 'SQLite 백업 패키지 기능이 준비되지 않았습니다.';
    }

    function setSqliteIntegrityCheckAvailable(available) {
        const button = document.getElementById('sqlite-integrity-check-run');
        if (!button) return;
        button.disabled = available !== true || sqliteIntegrityCheckRunning;
        button.title = available === true
            ? '현재 SQLite DB의 integrity_check와 foreign_key_check 실행'
            : 'SQLite 로컬 서버 연결 후 사용할 수 있습니다.';
    }

    function setSqliteDatabaseExportAvailable(available) {
        const button = document.getElementById('sqlite-wasm-db-export');
        if (!button) return;
        button.disabled = available !== true || sqliteDatabaseExportRunning;
        button.title = available === true
            ? '현재 OPFS SQLite DB를 단일 .sqlite 파일로 다운로드'
            : 'SQLite WASM 백엔드에 연결된 경우 사용할 수 있습니다.';
    }

    function setSqliteDatabaseImportAvailable(available) {
        const button = document.getElementById('sqlite-wasm-db-import');
        if (!button) return;
        button.disabled = available !== true || sqliteDatabaseImportRunning;
        button.title = available === true
            ? '검증된 SQLite DB 파일로 현재 OPFS DB 교체'
            : 'SQLite WASM 백엔드에 연결된 경우 사용할 수 있습니다.';
    }

    async function handleSqliteBackendChange(event) {
        const select = event && event.currentTarget
            ? event.currentTarget : document.getElementById('sqlite-backend-select');
        if (!select || !window.MDPStorage || typeof window.MDPStorage.requestSqliteBackend !== 'function') return;
        select.disabled = true;
        try {
            await window.MDPStorage.requestSqliteBackend(select.value);
        } catch (error) {
            if (typeof window.showToast === 'function') {
                window.showToast('SQLite 실행 방식 전환 실패: ' + (error && error.message ? error.message : error), 'error');
            }
        } finally {
            select.disabled = false;
            await refreshSqliteStatus();
        }
    }

    function setSqliteRestorePreviewAvailable(available) {
        sqliteRestorePreviewAvailable = available === true;
        const selectButton = document.getElementById('sqlite-restore-package-select');
        const previewButton = document.getElementById('sqlite-restore-package-preview');
        const applyButton = document.getElementById('sqlite-restore-package-apply');
        if (selectButton) selectButton.disabled = !sqliteRestorePreviewAvailable || sqliteRestorePreviewRunning;
        if (previewButton) {
            previewButton.disabled = !sqliteRestorePreviewAvailable
                || sqliteRestorePreviewRunning
                || !selectedSqliteRestoreFile;
        }
        if (applyButton) {
            applyButton.disabled = !sqliteRestoreApplyAvailable
                || sqliteRestorePreviewRunning
                || sqliteRestoreApplyRunning
                || !lastSqliteRestorePreview;
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

    function getSqliteExplorerTemplateState() {
        const settings = sqliteExplorerSnapshot && Array.isArray(sqliteExplorerSnapshot.settings)
            ? sqliteExplorerSnapshot.settings : [];
        const visibleSetting = settings.find(function (item) {
            return item && item.key === 'templateVisible';
        }) || null;
        const listSetting = settings.find(function (item) {
            return item && item.key === 'templateCustomList';
        }) || null;
        const rawBuiltInTemplates = typeof TMPLS !== 'undefined' && Array.isArray(TMPLS) ? TMPLS : [];
        const builtInTemplates = rawBuiltInTemplates.map(function (item, index) {
            return {
                id: 'builtin_' + index,
                name: String(item && item.name ? item.name : ('기본 양식 ' + (index + 1))),
                desc: String(item && item.desc ? item.desc : ''),
                content: String(item && item.content ? item.content : ''),
                source: 'builtin',
                isCustom: false
            };
        }).filter(function (item) { return item.content.trim().length > 0; });
        const rawCustomTemplates = listSetting && Array.isArray(listSetting.value) ? listSetting.value : [];
        const customTemplates = rawCustomTemplates.map(function (item, index) {
            return {
                id: String(item && item.id ? item.id : ('custom_' + index)),
                name: String(item && item.name ? item.name : ('사용자 양식 ' + (index + 1))),
                desc: String(item && item.desc ? item.desc : ''),
                content: String(item && item.content ? item.content : ''),
                source: 'sqlite',
                isCustom: true
            };
        });
        return {
            visibleSetting: visibleSetting,
            listSetting: listSetting,
            visible: visibleSetting ? visibleSetting.value === true : null,
            builtInTemplates: builtInTemplates,
            customTemplates: customTemplates,
            templates: builtInTemplates.concat(customTemplates),
            updatedAt: Math.max(
                Number(visibleSetting && visibleSetting.updatedAt || 0),
                Number(listSetting && listSetting.updatedAt || 0)
            )
        };
    }

    function openSqliteExplorerTemplateOverview() {
        const detail = document.getElementById('sqlite-explorer-detail');
        if (!detail) return;
        const state = getSqliteExplorerTemplateState();
        const names = state.templates.map(function (item) {
            return '<li class="rounded border border-slate-200 px-2 py-1 dark:border-slate-700">'
                + '<div class="flex items-center justify-between gap-2"><b>' + escapeMigrationText(item.name) + '</b>'
                + '<span class="shrink-0 text-[10px] ' + (item.isCustom ? 'text-violet-600 dark:text-violet-400' : 'text-sky-600 dark:text-sky-400') + '">'
                + (item.isCustom ? '사용자 추가' : '기본 제공') + '</span></div>'
                + (item.desc ? '<br><span class="text-[10px] text-slate-500">' + escapeMigrationText(item.desc) + '</span>' : '')
                + '</li>';
        }).join('');
        const visibleLabel = state.visible === null ? '저장되지 않음' : state.visible ? '보이기' : '숨기기';
        detail.innerHTML = [
            '<p class="text-[10px] font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">SQLite 양식 설정</p>',
            '<h3 class="mt-1 text-lg font-bold text-slate-900 dark:text-slate-100">저장된 양식 모아보기</h3>',
            '<div class="mt-4 grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px] dark:border-slate-700 dark:bg-slate-950/40 sm:grid-cols-4">',
            '<span>양식 버튼 표시<br><b>' + escapeMigrationText(visibleLabel) + '</b></span>',
            '<span>기본 양식<br><b>' + state.builtInTemplates.length + '개</b></span>',
            '<span>사용자 추가<br><b>' + state.customTemplates.length + '개</b></span>',
            '<span>최근 저장<br><b>' + escapeMigrationText(formatExplorerDate(state.updatedAt)) + '</b></span>',
            '</div>',
            '<div class="mt-4 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 text-xs text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-200">',
            '<b>SQLite 저장 항목</b><p class="mt-1"><code>templateVisible</code>에는 표시 설정을, <code>templateCustomList</code>에는 추가한 양식의 이름·설명·본문을 저장합니다.</p>',
            '</div>',
            '<h4 class="mt-5 border-b border-slate-200 pb-1 text-xs font-bold dark:border-slate-700">전체 양식 목록</h4>',
            '<ul class="mt-2 space-y-2">' + (names || '<li class="text-xs text-slate-500">표시할 양식이 없습니다.</li>') + '</ul>',
            '<p class="mt-3 text-[10px] text-slate-400">왼쪽 목록에서 양식을 선택하면 저장된 전체 본문을 읽을 수 있습니다.</p>'
        ].join('');
    }

    function openSqliteExplorerTemplate(index) {
        const detail = document.getElementById('sqlite-explorer-detail');
        const state = getSqliteExplorerTemplateState();
        const item = state.templates[index];
        if (!detail || !item) return;
        const lineCount = item.content ? item.content.split(/\r?\n/).length : 0;
        const sourceLabel = item.isCustom ? 'SQLite 사용자 추가' : '앱 기본 제공';
        document.querySelectorAll('[data-sqlite-template-index]').forEach(function (button) {
            const selected = Number(button.dataset.sqliteTemplateIndex) === index;
            button.classList.toggle('border-emerald-600', selected);
            button.classList.toggle('ring-2', selected);
            button.classList.toggle('ring-emerald-500/30', selected);
            button.setAttribute('aria-pressed', selected ? 'true' : 'false');
        });
        detail.innerHTML = [
            '<p class="text-[10px] font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">양식 세부사항</p>',
            '<h3 class="mt-1 break-all text-lg font-bold text-slate-900 dark:text-slate-100">' + escapeMigrationText(item.name) + '</h3>',
            '<p class="mt-1 text-xs text-slate-500 dark:text-slate-400">' + escapeMigrationText(item.desc || '설명 없음') + '</p>',
            '<div class="mt-3 grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px] dark:border-slate-700 dark:bg-slate-950/40 sm:grid-cols-4">',
            '<span>출처<br><b>' + escapeMigrationText(sourceLabel) + '</b></span>',
            '<span>양식 ID<br><b class="break-all">' + escapeMigrationText(item.id) + '</b></span>',
            '<span>본문 크기<br><b>' + item.content.length.toLocaleString() + '자 · ' + lineCount.toLocaleString() + '줄</b></span>',
            '<span>' + (item.isCustom ? 'SQLite 저장 시각' : '제공 방식') + '<br><b>'
                + (item.isCustom ? escapeMigrationText(formatExplorerDate(state.listSetting && state.listSetting.updatedAt)) : 'templates.js 기본 내장') + '</b></span>',
            '</div>',
            '<h4 class="mt-5 border-b border-slate-200 pb-1 text-xs font-bold dark:border-slate-700">저장된 양식 본문</h4>',
            '<pre id="sqlite-explorer-template-content" class="mt-2 min-h-40 overflow-auto whitespace-pre-wrap break-words rounded border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"></pre>',
            '<p class="mt-2 text-[10px] text-slate-400">읽기 전용 · '
                + (item.isCustom ? '사용자 양식은 추가·편집·Import 시 SQLite에 다시 저장됩니다.' : '기본 양식은 앱에 내장되어 항상 함께 표시됩니다.') + '</p>'
        ].join('');
        const content = document.getElementById('sqlite-explorer-template-content');
        if (content) content.textContent = item.content;
    }

    function releaseSqliteExplorerPreviewUrls() {
        sqliteExplorerPreviewUrls.forEach(function (url) {
            try { URL.revokeObjectURL(url); } catch (_) {}
        });
        sqliteExplorerPreviewUrls = [];
        sqliteExplorerFileDetailToken += 1;
    }

    function renderExplorerFileHeader(item, entryId) {
        return [
            '<h3 class="text-lg font-bold text-slate-900 dark:text-slate-100">' + escapeMigrationText(item.name || '(이름 없음)') + '</h3>',
            '<p class="mt-1 break-all font-mono text-[10px] text-slate-400">' + escapeMigrationText(item.path || '') + '</p>',
            '<div class="mt-3 grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">',
            '<span>Source<br><b>' + escapeMigrationText(item.sourceName || item.sourceId || '-') + '</b></span>',
            '<span>형식<br><b>' + escapeMigrationText(item.mimeType || item.extension || '-') + '</b></span>',
            '<span>크기<br><b>' + escapeMigrationText(formatExplorerBytes(item.sizeBytes)) + '</b></span>',
            '<span>수정<br><b>' + escapeMigrationText(formatExplorerDate(item.modifiedAt)) + '</b></span>',
            '</div>',
            '<p class="mt-3 break-all font-mono text-[9px] text-slate-400">SHA-256 ' + escapeMigrationText(item.checksum || '-') + '</p>'
        ].join('');
    }

    function renderExplorerFmaSummary(summary) {
        const counts = summary && summary.counts ? summary.counts : {};
        const countCards = [
            ['갤러리 항목', counts.galleryItems],
            ['고유 미디어', counts.uniqueMedia],
            ['이미지', counts.images],
            ['영상', counts.videos],
            ['오디오', counts.audio],
            ['기타', counts.other]
        ];
        const mimeCounts = summary && summary.mimeCounts ? summary.mimeCounts : {};
        const mimeHtml = Object.keys(mimeCounts).map(function (mime) {
            return '<span class="rounded-full border border-slate-300 bg-slate-50 px-2 py-1 text-[10px] dark:border-slate-700 dark:bg-slate-950">'
                + escapeMigrationText(mime) + ' <b>' + Number(mimeCounts[mime] || 0) + '</b></span>';
        }).join('');
        const gallery = Array.isArray(summary && summary.gallery) ? summary.gallery : [];
        const galleryHtml = gallery.map(function (item) {
            const placeholder = item.previewAvailable
                ? '<span class="text-[10px] text-slate-400">미리보기 불러오는 중…</span>'
                : '<span class="text-3xl" aria-hidden="true">' + (item.mediaType === 'video' ? '🎬' : item.mediaType === 'audio' ? '🎵' : '🖼️') + '</span>';
            return '<article class="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-950/60">'
                + '<div class="flex aspect-[4/3] items-center justify-center overflow-hidden bg-slate-200/70 dark:bg-slate-800" '
                + (item.previewAvailable
                    ? 'data-fma-preview-slot data-fma-media-id="' + escapeMigrationText(item.mediaId) + '"'
                    : '') + '>' + placeholder + '</div>'
                + '<div class="p-2"><p class="truncate text-[11px] font-bold" title="' + escapeMigrationText(item.name || '') + '">'
                + escapeMigrationText(item.name || ('미디어 ' + (Number(item.index) + 1))) + '</p>'
                + '<p class="mt-1 truncate text-[9px] text-slate-500">' + escapeMigrationText(item.mimeType || item.mediaType || '-')
                + ' · ' + escapeMigrationText(formatExplorerBytes(item.sizeBytes)) + '</p></div></article>';
        }).join('');
        const hiddenCount = Math.max(0, Number(counts.galleryItems || 0) - gallery.length);
        const modeMessage = summary.previewMode === 'webpThumbnail'
            ? '최대 240px WebP 썸네일'
            : '2MB 이하 이미지만 제한 미리보기';
        return [
            '<h4 class="mt-4 border-b border-slate-200 pb-1 text-xs font-bold dark:border-slate-700">FMA 파일 내용</h4>',
            '<div class="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">',
            countCards.map(function (card) {
                return '<div class="rounded-lg border border-slate-200 bg-slate-50 p-2 text-center dark:border-slate-700 dark:bg-slate-950/50">'
                    + '<b class="block text-lg text-emerald-700 dark:text-emerald-300">' + Number(card[1] || 0) + '</b>'
                    + '<span class="text-[10px] text-slate-500">' + escapeMigrationText(card[0]) + '</span></div>';
            }).join(''),
            '</div>',
            '<div class="mt-3 flex flex-wrap gap-1">' + (mimeHtml || '<span class="text-xs text-slate-500">MIME 정보 없음</span>') + '</div>',
            '<div class="mt-3 flex flex-wrap items-center justify-between gap-2">',
            '<h4 class="text-xs font-bold">경량 갤러리 ' + gallery.length + '개</h4>',
            '<span class="text-[10px] text-slate-400">' + escapeMigrationText(modeMessage)
                + (hiddenCount ? ' · 나머지 ' + hiddenCount + '개 생략' : '') + '</span>',
            '</div>',
            '<div id="sqlite-explorer-fma-gallery" class="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">',
            galleryHtml || explorerEmpty('표시할 갤러리 항목이 없습니다.'),
            '</div>',
            '<p class="mt-2 text-[10px] text-slate-400">읽기 전용 · 영상과 큰 원본 이미지는 자동 재생하거나 전체 다운로드하지 않습니다.</p>'
        ].join('');
    }

    async function hydrateExplorerFmaGallery(entryId, token) {
        const detail = document.getElementById('sqlite-explorer-detail');
        if (!detail || !window.MDPStorage) return;
        const slots = Array.from(detail.querySelectorAll('[data-fma-preview-slot]'));
        let cursor = 0;
        async function worker() {
            while (cursor < slots.length) {
                const slot = slots[cursor++];
                const mediaId = slot.dataset.fmaMediaId;
                try {
                    const blob = await window.MDPStorage.getSqliteExplorerFmaThumbnail(entryId, mediaId);
                    if (token !== sqliteExplorerFileDetailToken || !slot.isConnected) return;
                    const url = URL.createObjectURL(blob);
                    sqliteExplorerPreviewUrls.push(url);
                    const image = document.createElement('img');
                    image.src = url;
                    image.alt = 'FMA 미리보기';
                    image.loading = 'lazy';
                    image.className = 'h-full w-full object-contain';
                    slot.replaceChildren(image);
                } catch (_) {
                    if (token === sqliteExplorerFileDetailToken && slot.isConnected) {
                        slot.innerHTML = '<span class="text-[10px] text-slate-400">미리보기 없음</span>';
                    }
                }
            }
        }
        await Promise.all([worker(), worker(), worker(), worker()]);
    }

    function renderSqliteExplorerCounts(snapshot) {
        const target = document.getElementById('sqlite-explorer-counts');
        if (!target) return;
        const counts = snapshot && snapshot.counts ? snapshot.counts : {};
        const templateCount = snapshot ? getSqliteExplorerTemplateState().templates.length : 0;
        const items = [
            ['문서', counts.documents],
            ['폴더', counts.folders],
            ['양식', templateCount],
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

        if (sqliteExplorerTab === 'templates') {
            const state = getSqliteExplorerTemplateState();
            const visibleLabel = state.visible === null ? '미저장' : state.visible ? '보이기' : '숨기기';
            target.innerHTML = '<button type="button" data-sqlite-template-overview="1" '
                + 'class="mb-2 block w-full rounded-lg border border-emerald-500 bg-emerald-50 p-3 text-left hover:bg-emerald-100 dark:bg-emerald-950/30">'
                + '<div class="flex items-center justify-between gap-2"><b>양식 설정</b><span class="text-[10px] text-emerald-600">' + escapeMigrationText(visibleLabel) + '</span></div>'
                + '<p class="mt-1 text-[10px] text-slate-500">전체 ' + state.templates.length + '개 · 기본 ' + state.builtInTemplates.length
                + '개 · 사용자 추가 ' + state.customTemplates.length + '개</p>'
                + '<p class="mt-1 text-[10px] text-slate-400">최근 저장 ' + escapeMigrationText(formatExplorerDate(state.updatedAt)) + '</p></button>'
                + state.templates.map(function (item, index) {
                    const preview = item.content.replace(/\s+/g, ' ').trim().slice(0, 140);
                    return '<button type="button" data-sqlite-template-index="' + index + '" '
                        + 'class="mb-2 block w-full rounded-lg border border-slate-200 bg-white p-3 text-left hover:border-emerald-500 hover:bg-emerald-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-emerald-950/20">'
                        + '<div class="flex items-center justify-between gap-2"><b class="truncate">' + escapeMigrationText(item.name) + '</b><span class="text-[10px] '
                        + (item.isCustom ? 'text-violet-600 dark:text-violet-400' : 'text-sky-600 dark:text-sky-400') + '">'
                        + (item.isCustom ? '사용자 추가' : '기본 양식') + '</span></div>'
                        + '<p class="mt-1 text-[10px] text-slate-500">' + escapeMigrationText(item.desc || '설명 없음') + '</p>'
                        + '<p class="mt-2 line-clamp-3 whitespace-pre-wrap break-words rounded bg-slate-50 p-2 text-[10px] dark:bg-slate-950">' + escapeMigrationText(preview || '(빈 본문)') + '</p></button>';
                }).join('');
            const overview = target.querySelector('[data-sqlite-template-overview]');
            if (overview) overview.addEventListener('click', openSqliteExplorerTemplateOverview);
            target.querySelectorAll('[data-sqlite-template-index]').forEach(function (button) {
                button.addEventListener('click', function () {
                    openSqliteExplorerTemplate(Number(button.dataset.sqliteTemplateIndex));
                });
            });
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
                    + (isFolder ? '' : ' · ' + escapeMigrationText(item.workType || item.extension || 'file') + ' · ' + escapeMigrationText(formatExplorerBytes(item.sizeBytes)) + ' · ' + escapeMigrationText(formatExplorerDate(item.modifiedAt))) + '</p>'
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
            const visibleSettings = items.map(function (item, index) { return { item: item, index: index }; })
                .filter(function (entry) { return entry.item && entry.item.key !== 'encryptedToolVault'; });
            target.innerHTML = '<button type="button" data-sqlite-tool-overview="1" '
                + 'class="mb-2 block w-full rounded-lg border border-emerald-500 bg-emerald-50 p-3 text-left hover:bg-emerald-100 dark:bg-emerald-950/30">'
                + '<div class="flex items-center justify-between gap-2"><b>도구 설정 모아보기</b><span class="text-[10px] text-emerald-600">보안 요약</span></div>'
                + '<p class="mt-1 text-[10px] text-slate-500">ScholarAI · sspimgAI · AI Jena · imgBB · 모델 · 프롬프트 · 암호화 키 상태</p></button>'
                + visibleSettings.map(function (entry) {
                const item = entry.item;
                const index = entry.index;
                const isCustomFonts = item.key === 'textStyleCustomFonts';
                const settingLabel = isCustomFonts ? '사용자 폰트 · textStyleCustomFonts' : item.key;
                let renderedValue = '';
                try {
                    renderedValue = isCustomFonts && Array.isArray(item.value)
                        ? '저장된 사용자 폰트 ' + item.value.length + '개\n' + item.value.map(function (font) { return font && font.family; }).filter(Boolean).join(', ')
                        : JSON.stringify(item.value);
                } catch (_) { renderedValue = '[표시할 수 없음]'; }
                return '<button type="button" data-sqlite-setting-index="' + index + '" '
                    + 'class="mb-2 block w-full rounded-lg border border-slate-200 bg-white p-3 text-left hover:border-emerald-500 hover:bg-emerald-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-emerald-950/20">'
                    + '<div class="flex items-center justify-between gap-2"><b class="truncate">' + escapeMigrationText(settingLabel) + '</b>'
                    + '<span class="text-[10px] text-violet-600 dark:text-violet-400">' + escapeMigrationText(item.scopeType) + '</span></div>'
                    + '<p class="mt-1 text-[10px] text-slate-500">' + escapeMigrationText(item.group) + ' · '
                    + escapeMigrationText(item.scopeId || '(global)') + ' · ' + escapeMigrationText(item.valueType) + '</p>'
                    + '<pre class="mt-2 max-h-28 overflow-auto whitespace-pre-wrap break-all rounded bg-slate-50 p-2 text-[10px] dark:bg-slate-950">'
                    + escapeMigrationText(renderedValue) + '</pre>'
                    + '<p class="mt-1 text-[10px] text-slate-400">' + escapeMigrationText(formatExplorerDate(item.updatedAt)) + '</p></button>';
            }).join('');
            const overview = target.querySelector('[data-sqlite-tool-overview]');
            if (overview) overview.addEventListener('click', openSqliteExplorerToolOverview);
            target.querySelectorAll('[data-sqlite-setting-index]').forEach(function (button) {
                button.addEventListener('click', function () {
                    openSqliteExplorerSetting(Number(button.dataset.sqliteSettingIndex));
                });
            });
            return;
        }

        if (sqliteExplorerTab === 'backups') {
            target.innerHTML = items.map(function (item) {
                return '<button type="button" data-sqlite-backup-id="' + escapeMigrationText(item.id) + '" class="mb-2 block w-full rounded-lg border border-slate-200 bg-white p-3 text-left hover:border-emerald-500 hover:bg-emerald-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-emerald-950/20">'
                    + '<div class="flex items-center justify-between gap-2"><b>' + escapeMigrationText(item.type) + '</b><span class="text-[10px] text-emerald-600">' + escapeMigrationText(item.status) + '</span></div>'
                    + '<p class="mt-1 break-all text-[10px] text-slate-500">' + escapeMigrationText(item.filePath) + '</p>'
                    + '<p class="mt-1 text-[10px] text-slate-500">' + escapeMigrationText(formatExplorerBytes(item.sizeBytes)) + ' · schema v' + Number(item.schemaVersion || 0) + ' · ' + escapeMigrationText(formatExplorerDate(item.createdAt)) + '</p>'
                    + '<p class="mt-1 truncate font-mono text-[9px] text-slate-400" title="' + escapeMigrationText(item.checksumSha256 || '') + '">' + escapeMigrationText(item.checksumSha256 || '-') + '</p></button>';
            }).join('');
            target.querySelectorAll('[data-sqlite-backup-id]').forEach(function (button) {
                button.addEventListener('click', function () { openSqliteExplorerBackup(button.dataset.sqliteBackupId); });
            });
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
        if (['documents', 'folders', 'templates', 'files', 'settings', 'backups', 'migrations'].indexOf(tab) < 0) return;
        releaseSqliteExplorerPreviewUrls();
        sqliteExplorerTab = tab;
        sqliteExplorerSelectedSettingIndex = -1;
        sqliteExplorerSelectedBackupId = '';
        renderSqliteExplorerList();
        const detail = document.getElementById('sqlite-explorer-detail');
        if (!detail) return;
        if (tab === 'documents') {
            detail.innerHTML = '<p class="text-slate-500 dark:text-slate-400">문서를 선택하면 본문과 버전 기록을 확인할 수 있습니다.</p>';
        } else if (tab === 'templates') {
            openSqliteExplorerTemplateOverview();
        } else if (tab === 'files') {
            detail.innerHTML = '<p class="text-slate-500 dark:text-slate-400">파일을 선택하면 저장된 내용을 확인할 수 있습니다.</p>';
        } else if (tab === 'settings') {
            openSqliteExplorerToolOverview();
        } else if (tab === 'backups') {
            detail.innerHTML = '<p class="text-slate-500 dark:text-slate-400">백업을 선택하면 무결성, 저장 개수와 항목 목록을 확인하고 삭제할 수 있습니다.</p>';
        } else {
            detail.innerHTML = '<p class="text-slate-500 dark:text-slate-400">이 목록은 읽기 전용입니다. 변경·삭제 기능은 제공하지 않습니다.</p>';
        }
    }

    function formatExplorerSettingValue(value) {
        try {
            const rendered = JSON.stringify(value, null, 2);
            return rendered === undefined ? String(value) : rendered;
        } catch (_) {
            return String(value == null ? '' : value);
        }
    }

    function getExplorerSettingByKey(key) {
        const settings = sqliteExplorerSnapshot && Array.isArray(sqliteExplorerSnapshot.settings)
            ? sqliteExplorerSnapshot.settings : [];
        return settings.find(function (item) { return item && item.key === key; }) || null;
    }

    function toolProtectionLabel(protection) {
        const item = protection || {};
        if (!item.configured) return '키 없음';
        return (item.locked ? '잠김' : '잠금 해제') + (item.last4 ? ' · 끝 ' + item.last4 : '');
    }

    function isLMStudioTool(tool) {
        return String(tool && tool.provider || '').trim().toLowerCase() === 'lmstudio';
    }

    function lmStudioConnectionPresentation() {
        const status = sqliteExplorerLMStudioStatus;
        if (status.state === 'checking') {
            return {
                label: 'LM Studio 연결 확인 중',
                className: 'border-sky-400 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300',
                detail: '저장된 로컬 엔드포인트와 로드 모델을 확인하고 있습니다.'
            };
        }
        if (status.state === 'connected') {
            const modelText = status.models.length ? status.models.join(', ') : '';
            return {
                label: 'LM Studio 연결됨',
                className: 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
                detail: modelText ? '로드 모델: ' + modelText : 'LM Studio 로컬 모델에 연결되었습니다.'
            };
        }
        if (status.state === 'server') {
            return {
                label: '서버 연결됨 · 모델 없음',
                className: 'border-amber-500 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
                detail: 'LM Studio 서버에는 연결되었지만 현재 로드된 LLM이 없습니다.'
            };
        }
        if (status.state === 'error') {
            return {
                label: 'LM Studio 연결 안 됨',
                className: 'border-red-400 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300',
                detail: status.error || 'LM Studio 로컬 서버에 연결할 수 없습니다.'
            };
        }
        return {
            label: 'LM Studio 확인 전',
            className: 'border-slate-300 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400',
            detail: 'SQLite 탐색 화면에서 로컬 모델 연결 상태를 확인합니다.'
        };
    }

    function renderLMStudioConnectionBlock(tool) {
        if (!isLMStudioTool(tool)) return '';
        const presentation = lmStudioConnectionPresentation();
        return [
            '<div class="mt-2 rounded-md border border-slate-200 bg-white/70 p-2 dark:border-slate-700 dark:bg-slate-900/70">',
            '<div class="flex flex-wrap items-center gap-2">',
            '<span data-sqlite-lmstudio-connection class="rounded-full border px-2 py-0.5 text-[10px] font-bold ' + presentation.className + '">' + escapeMigrationText(presentation.label) + '</span>',
            '<span class="text-[10px] font-semibold text-slate-500 dark:text-slate-400">로컬 AI</span>',
            '</div>',
            '<p data-sqlite-lmstudio-connection-detail class="mt-1 break-all text-[10px] text-slate-500 dark:text-slate-400">' + escapeMigrationText(presentation.detail) + '</p>',
            '</div>'
        ].join('');
    }

    function updateSqliteExplorerLMStudioConnectionUI() {
        const presentation = lmStudioConnectionPresentation();
        document.querySelectorAll('[data-sqlite-lmstudio-connection]').forEach(function (badge) {
            badge.textContent = presentation.label;
            badge.className = 'rounded-full border px-2 py-0.5 text-[10px] font-bold ' + presentation.className;
            badge.title = sqliteExplorerLMStudioStatus.endpoint || '';
        });
        document.querySelectorAll('[data-sqlite-lmstudio-connection-detail]').forEach(function (detail) {
            detail.textContent = presentation.detail;
        });
    }

    function resetSqliteExplorerLMStudioConnection() {
        sqliteExplorerLMStudioProbeToken += 1;
        sqliteExplorerLMStudioStatus = {
            state: 'idle',
            endpoint: '',
            models: [],
            error: '',
            checkedAt: 0
        };
    }

    async function refreshSqliteExplorerLMStudioConnection(tools) {
        const lmStudioTools = (Array.isArray(tools) ? tools : []).filter(isLMStudioTool);
        if (!lmStudioTools.length) return;

        let config = {};
        try {
            if (!window.LocalAI || typeof window.LocalAI.loadConfig !== 'function' || typeof window.LocalAI.createClient !== 'function') {
                throw new Error('LM Studio 연결 모듈이 준비되지 않았습니다.');
            }
            config = window.LocalAI.loadConfig(localStorage) || {};
        } catch (error) {
            sqliteExplorerLMStudioStatus = {
                state: 'error', endpoint: '', models: [],
                error: error && error.message ? error.message : String(error), checkedAt: Date.now()
            };
            updateSqliteExplorerLMStudioConnectionUI();
            return;
        }

        const endpoint = String(config.baseUrl || (lmStudioTools[0] && lmStudioTools[0].endpoint) || '').trim();
        const current = sqliteExplorerLMStudioStatus;
        if (current.state === 'checking' && current.endpoint === endpoint) return;
        if (current.endpoint === endpoint && current.checkedAt && Date.now() - current.checkedAt < 15000) {
            updateSqliteExplorerLMStudioConnectionUI();
            return;
        }

        const token = ++sqliteExplorerLMStudioProbeToken;
        sqliteExplorerLMStudioStatus = {
            state: 'checking', endpoint: endpoint, models: [], error: '', checkedAt: 0
        };
        updateSqliteExplorerLMStudioConnectionUI();
        try {
            const client = window.LocalAI.createClient(config);
            const loaded = await client.listLoadedModels({ timeoutMs: Math.min(Number(config.timeoutMs) || 8000, 8000) });
            if (token !== sqliteExplorerLMStudioProbeToken) return;
            const models = (Array.isArray(loaded) ? loaded : []).map(function (item) {
                return String(item && (item.displayName || item.id || item.key) || '').trim();
            }).filter(Boolean);
            sqliteExplorerLMStudioStatus = {
                state: models.length ? 'connected' : 'server',
                endpoint: endpoint,
                models: models,
                error: '',
                checkedAt: Date.now()
            };
        } catch (error) {
            if (token !== sqliteExplorerLMStudioProbeToken) return;
            sqliteExplorerLMStudioStatus = {
                state: 'error',
                endpoint: endpoint,
                models: [],
                error: error && error.message ? error.message : String(error),
                checkedAt: Date.now()
            };
        }
        updateSqliteExplorerLMStudioConnectionUI();
    }

    function renderToolSettingCard(tool) {
        const options = tool && tool.options && typeof tool.options === 'object' ? tool.options : {};
        const optionText = Object.keys(options).filter(function (key) { return options[key] !== ''; }).map(function (key) {
            return key + ': ' + String(options[key]);
        }).join(' · ');
        return [
            '<article class="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950/50">',
            '<div class="flex flex-wrap items-center justify-between gap-2"><h4 class="font-bold text-slate-900 dark:text-slate-100">' + escapeMigrationText(tool.label || tool.id || '-') + '</h4>',
            '<span class="rounded-full px-2 py-0.5 text-[10px] font-bold ' + (tool.enabled ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-slate-200 text-slate-500 dark:bg-slate-800') + '">' + (tool.enabled ? '사용' : '꺼짐') + '</span></div>',
            '<div class="mt-2 grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-3">',
            '<span>공급자<br><b>' + escapeMigrationText(tool.provider || '-') + '</b></span>',
            '<span>모델<br><b class="break-all">' + escapeMigrationText(tool.model || '-') + '</b></span>',
            '<span>API 키<br><b>' + escapeMigrationText(toolProtectionLabel(tool.protection)) + '</b></span>',
            '</div>',
            tool.endpoint ? '<p class="mt-2 break-all text-[10px] text-slate-500">Endpoint: ' + escapeMigrationText(tool.endpoint) + '</p>' : '',
            optionText ? '<p class="mt-1 break-all text-[10px] text-slate-500">' + escapeMigrationText(optionText) + '</p>' : '',
            renderLMStudioConnectionBlock(tool),
            '<details class="mt-2"><summary class="cursor-pointer text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">프롬프트 보기</summary>',
            '<pre class="mt-1 max-h-36 overflow-auto whitespace-pre-wrap break-words rounded border border-slate-200 bg-white p-2 text-[10px] dark:border-slate-700 dark:bg-slate-900">' + escapeMigrationText(tool.prompt || '저장된 프롬프트 없음') + '</pre></details>',
            '</article>'
        ].join('');
    }

    function setToolVaultMessage(message, isError) {
        const target = document.getElementById('sqlite-tool-vault-message');
        if (!target) return;
        target.textContent = String(message || '');
        target.className = 'mt-2 text-[11px] ' + (isError ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400');
    }

    async function runToolVaultAction(action) {
        if (!window.MDPCredentialVault) return setToolVaultMessage('암호화 보관함 모듈이 준비되지 않았습니다.', true);
        const password = document.getElementById('sqlite-tool-vault-password');
        const next = document.getElementById('sqlite-tool-vault-new-password');
        const confirmation = document.getElementById('sqlite-tool-vault-confirmation');
        try {
            if (action === 'create') await window.MDPCredentialVault.create(password && password.value, confirmation && confirmation.value);
            if (action === 'unlock') await window.MDPCredentialVault.unlock(password && password.value);
            if (action === 'lock') window.MDPCredentialVault.lock();
            if (action === 'import') await window.MDPCredentialVault.importCurrent(password && password.value);
            if (action === 'change') await window.MDPCredentialVault.changePassword(password && password.value, next && next.value, confirmation && confirmation.value);
            await refreshSqliteExplorer();
            setToolVaultMessage(action === 'lock' ? 'API 키 보관함을 잠갔습니다.' : 'API 키 보관함 작업을 완료했습니다.', false);
        } catch (error) {
            setToolVaultMessage(error && error.message ? error.message : 'API 키 보관함 작업에 실패했습니다.', true);
        }
    }

    function bindToolVaultButtons() {
        document.querySelectorAll('[data-tool-vault-action]').forEach(function (button) {
            button.addEventListener('click', function () { runToolVaultAction(button.dataset.toolVaultAction); });
        });
    }

    function openSqliteExplorerToolOverview() {
        const detail = document.getElementById('sqlite-explorer-detail');
        if (!detail) return;
        sqliteExplorerSelectedSettingIndex = -2;
        document.querySelectorAll('[data-sqlite-setting-index]').forEach(function (button) {
            button.classList.remove('border-emerald-600', 'ring-2', 'ring-emerald-500/30');
            button.setAttribute('aria-pressed', 'false');
        });
        const catalogSetting = getExplorerSettingByKey('toolSettingsCatalog');
        const catalog = catalogSetting && catalogSetting.value && typeof catalogSetting.value === 'object'
            ? catalogSetting.value : { tools: [] };
        const vaultSetting = getExplorerSettingByKey('encryptedToolVault');
        let vaultStatus = { exists: !!vaultSetting, locked: !!vaultSetting, unlocked: false, entries: [] };
        try {
            if (window.MDPCredentialVault) vaultStatus = window.MDPCredentialVault.getStatus();
        } catch (_) {}
        const tools = Array.isArray(catalog.tools) ? catalog.tools : [];
        const entrySummary = Array.isArray(vaultStatus.entries) ? vaultStatus.entries.filter(function (item) { return item.configured; }).map(function (item) {
            return escapeMigrationText(item.label) + ' (••••' + escapeMigrationText(item.last4 || '') + ')';
        }).join(' · ') : '';
        detail.innerHTML = [
            '<div class="flex flex-wrap items-start justify-between gap-2"><div><p class="text-[10px] font-bold uppercase tracking-wide text-emerald-600">도구 설정 통합 보기</p>',
            '<h3 class="mt-1 text-lg font-bold text-slate-900 dark:text-slate-100">AI·이미지 도구 설정</h3></div>',
            '<span class="rounded-full border px-2 py-0.5 text-[10px] font-bold ' + (vaultStatus.unlocked ? 'border-emerald-500 text-emerald-600' : 'border-amber-500 text-amber-600') + '">' + (vaultStatus.exists ? (vaultStatus.unlocked ? '보관함 잠금 해제' : '보관함 잠김') : '보관함 없음') + '</span></div>',
            '<section class="mt-4 rounded-lg border border-amber-300 bg-amber-50/70 p-3 dark:border-amber-900 dark:bg-amber-950/20">',
            '<h4 class="text-sm font-bold text-slate-800 dark:text-slate-100">API 키 암호화 보관함 <span class="ml-1 text-[10px] font-normal text-slate-500">(학술검색 결과 저장과 무관)</span></h4>',
            '<p class="mt-1 text-[10px] leading-relaxed text-slate-600 dark:text-slate-400">비밀번호는 저장되지 않으며 AES-GCM 암호문만 SQLite에 저장됩니다. 비밀번호를 잊으면 복구할 수 없습니다.</p>',
            '<p class="mt-1 text-[10px] text-slate-500">' + (entrySummary || '암호화하여 저장된 API 키가 없습니다.') + '</p>',
            '<div class="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">',
            '<input id="sqlite-tool-vault-password" type="password" autocomplete="current-password" placeholder="현재 또는 새 비밀번호 (8자 이상)" class="rounded border border-slate-300 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900">',
            '<input id="sqlite-tool-vault-new-password" type="password" autocomplete="new-password" placeholder="변경할 새 비밀번호" class="rounded border border-slate-300 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900">',
            '<input id="sqlite-tool-vault-confirmation" type="password" autocomplete="new-password" placeholder="새 비밀번호 확인" class="rounded border border-slate-300 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900">',
            '</div><div class="mt-2 flex flex-wrap gap-2">',
            vaultStatus.exists ? '' : '<button data-tool-vault-action="create" class="rounded bg-emerald-700 px-2 py-1 text-[11px] font-bold text-white">현재 키 암호화 저장</button>',
            vaultStatus.exists && !vaultStatus.unlocked ? '<button data-tool-vault-action="unlock" class="rounded bg-indigo-700 px-2 py-1 text-[11px] font-bold text-white">잠금 해제</button>' : '',
            vaultStatus.unlocked ? '<button data-tool-vault-action="import" class="rounded bg-emerald-700 px-2 py-1 text-[11px] font-bold text-white">현재 입력 키 다시 암호화</button><button data-tool-vault-action="lock" class="rounded border border-slate-400 px-2 py-1 text-[11px] font-bold">잠그기</button><button data-tool-vault-action="change" class="rounded border border-indigo-500 px-2 py-1 text-[11px] font-bold text-indigo-600">비밀번호 변경</button>' : '',
            '</div><p id="sqlite-tool-vault-message" class="mt-2 text-[11px] text-slate-500"></p></section>',
            '<div class="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-2">',
            tools.length ? tools.map(renderToolSettingCard).join('') : explorerEmpty('도구 설정 카탈로그가 아직 없습니다. 새로고침하면 현재 설정을 SQLite에 동기화합니다.'),
            '</div>',
            '<p class="mt-3 text-[10px] text-slate-400">API 키 원문은 이 화면에 표시하지 않습니다. 모델·프롬프트·일반 옵션만 읽기 전용으로 확인할 수 있습니다.</p>'
        ].join('');
        bindToolVaultButtons();
        refreshSqliteExplorerLMStudioConnection(tools);
    }

    function openSqliteExplorerSetting(index) {
        const detail = document.getElementById('sqlite-explorer-detail');
        const settings = sqliteExplorerSnapshot && Array.isArray(sqliteExplorerSnapshot.settings)
            ? sqliteExplorerSnapshot.settings
            : [];
        const item = settings[index];
        if (!detail || !item) return;
        if (item.key === 'encryptedToolVault') return openSqliteExplorerToolOverview();
        const settingLabel = item.key === 'textStyleCustomFonts'
            ? '사용자 폰트 · textStyleCustomFonts'
            : (item.key || '(키 없음)');
        sqliteExplorerSelectedSettingIndex = index;
        document.querySelectorAll('[data-sqlite-setting-index]').forEach(function (button) {
            const selected = Number(button.dataset.sqliteSettingIndex) === sqliteExplorerSelectedSettingIndex;
            button.classList.toggle('border-emerald-600', selected);
            button.classList.toggle('ring-2', selected);
            button.classList.toggle('ring-emerald-500/30', selected);
            button.setAttribute('aria-pressed', selected ? 'true' : 'false');
        });
        detail.innerHTML = [
            '<div class="flex flex-wrap items-start justify-between gap-2">',
            '<div class="min-w-0"><p class="text-[10px] font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">저장된 설정</p>',
            '<h3 class="mt-1 break-all text-lg font-bold text-slate-900 dark:text-slate-100">' + escapeMigrationText(settingLabel) + '</h3></div>',
            '<span class="rounded-full border border-violet-300 px-2 py-0.5 text-[10px] font-bold text-violet-600 dark:border-violet-800 dark:text-violet-300">' + escapeMigrationText(item.scopeType || '-') + '</span>',
            '</div>',
            '<div class="mt-4 grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px] dark:border-slate-700 dark:bg-slate-950/40 sm:grid-cols-4">',
            '<span>그룹<br><b>' + escapeMigrationText(item.group || '-') + '</b></span>',
            '<span>범위<br><b>' + escapeMigrationText(item.scopeId || '(global)') + '</b></span>',
            '<span>값 형식<br><b>' + escapeMigrationText(item.valueType || '-') + '</b></span>',
            '<span>저장 시각<br><b>' + escapeMigrationText(formatExplorerDate(item.updatedAt)) + '</b></span>',
            '</div>',
            '<h4 class="mt-5 border-b border-slate-200 pb-1 text-xs font-bold dark:border-slate-700">저장된 내용</h4>',
            '<pre id="sqlite-explorer-setting-value" class="mt-2 min-h-32 overflow-auto whitespace-pre-wrap break-words rounded border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"></pre>',
            '<p class="mt-2 text-[10px] text-slate-400">읽기 전용 · 이 화면에서는 설정을 변경하거나 삭제하지 않습니다.</p>'
        ].join('');
        const value = document.getElementById('sqlite-explorer-setting-value');
        if (value) value.textContent = formatExplorerSettingValue(item.value);
    }

    async function openSqliteExplorerDocument(documentId) {
        const detail = document.getElementById('sqlite-explorer-detail');
        if (!detail || !window.MDPStorage) return;
        releaseSqliteExplorerPreviewUrls();
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
        releaseSqliteExplorerPreviewUrls();
        const detailToken = sqliteExplorerFileDetailToken;
        detail.innerHTML = '<p class="text-slate-500">파일 내용을 불러오는 중...</p>';
        try {
            const item = await window.MDPStorage.getSqliteExplorerFileEntry(entryId);
            if (detailToken !== sqliteExplorerFileDetailToken) return;
            const isFma = String(item.extension || '').toLowerCase() === 'fma'
                || String(item.mimeType || '').toLowerCase() === 'application/vnd.fma+zip';
            const workType = String(item.workType || '').toLowerCase();
            const isScholarMarkdown = workType === 'crossref_markdown' || workType === 'scholar_references_md';
            if (isFma && typeof window.MDPStorage.getSqliteExplorerFmaPreview === 'function') {
                detail.innerHTML = renderExplorerFileHeader(item, entryId)
                    + '<div class="mt-4">' + explorerEmpty('FMA manifest와 경량 미리보기를 읽는 중...') + '</div>';
                const summary = await window.MDPStorage.getSqliteExplorerFmaPreview(entryId);
                if (detailToken !== sqliteExplorerFileDetailToken) return;
                detail.innerHTML = renderExplorerFileHeader(item, entryId) + renderExplorerFmaSummary(summary);
                hydrateExplorerFmaGallery(entryId, detailToken);
                return;
            }
            if (isScholarMarkdown && typeof window.MDPStorage.loadSqliteWorkFile === 'function') {
                const blob = await window.MDPStorage.loadSqliteWorkFile(item);
                const markdown = await blob.text();
                if (detailToken !== sqliteExplorerFileDetailToken) return;
                detail.innerHTML = renderExplorerFileHeader(item, entryId) + [
                    workType === 'crossref_markdown'
                        ? '<button type="button" id="sqlite-explorer-open-scholar-result" class="mt-4 rounded bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-700">학술검색 결과창에서 열기</button>'
                        : '',
                    '<h4 class="mt-4 border-b border-slate-200 pb-1 text-xs font-bold dark:border-slate-700">Markdown 내용</h4>',
                    '<pre id="sqlite-explorer-file-content" class="mt-2 max-h-[55vh] overflow-auto whitespace-pre-wrap break-words rounded border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"></pre>'
                ].join('');
                const content = document.getElementById('sqlite-explorer-file-content');
                if (content) content.textContent = markdown;
                const openScholar = document.getElementById('sqlite-explorer-open-scholar-result');
                if (openScholar) openScholar.addEventListener('click', function () {
                    closeSqliteExplorer();
                    if (typeof window.loadScholarCrossrefSqliteItem === 'function') {
                        window.loadScholarCrossrefSqliteItem(entryId);
                    }
                });
                return;
            }
            detail.innerHTML = renderExplorerFileHeader(item, entryId) + [
                '<h4 class="mt-4 border-b border-slate-200 pb-1 text-xs font-bold dark:border-slate-700">파일 내용</h4>',
                '<pre id="sqlite-explorer-file-content" class="mt-2 max-h-[55vh] overflow-auto whitespace-pre-wrap break-words rounded border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"></pre>'
            ].join('');
            const content = document.getElementById('sqlite-explorer-file-content');
            if (content) content.textContent = String(item.content == null ? '' : item.content);
        } catch (error) {
            detail.innerHTML = explorerEmpty(error && error.message ? error.message : '파일을 불러오지 못했습니다.');
        }
    }

    function markSqliteExplorerBackupSelected(backupId) {
        sqliteExplorerSelectedBackupId = String(backupId || '');
        document.querySelectorAll('[data-sqlite-backup-id]').forEach(function (button) {
            const selected = button.dataset.sqliteBackupId === sqliteExplorerSelectedBackupId;
            button.classList.toggle('border-emerald-600', selected);
            button.classList.toggle('ring-2', selected);
            button.classList.toggle('ring-emerald-500/30', selected);
            button.setAttribute('aria-pressed', selected ? 'true' : 'false');
        });
    }

    function renderSqliteBackupRows(title, rows, renderer, totalCount, sampleLimit) {
        const items = Array.isArray(rows) ? rows : [];
        const total = Number(totalCount || 0);
        const omitted = Math.max(0, total - items.length);
        return [
            '<details class="rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-950/50">',
            '<summary class="cursor-pointer px-3 py-2 text-xs font-bold">' + escapeMigrationText(title) + ' (' + total + ')</summary>',
            '<div class="max-h-52 space-y-1 overflow-auto border-t border-slate-200 p-2 dark:border-slate-700">',
            items.length ? items.map(renderer).join('') : '<p class="p-2 text-[10px] text-slate-500">저장된 항목이 없습니다.</p>',
            omitted ? '<p class="p-1 text-[10px] text-amber-600">전체 중 ' + items.length + '개만 표시 · ' + omitted + '개 생략 (최대 ' + Number(sampleLimit || 0) + '개)</p>' : '',
            '</div></details>'
        ].join('');
    }

    function renderSqliteExplorerBackup(detailData) {
        const item = detailData || {};
        const counts = item.counts || {};
        const integrity = Array.isArray(item.integrity) ? item.integrity.join(', ') : '-';
        const countCards = [
            ['문서', counts.documents], ['폴더', counts.folders], ['버전', counts.documentVersions],
            ['Source', counts.sources], ['파일', counts.fileEntries], ['설정', counts.settings],
            ['자산', counts.assets], ['백업기록', counts.backupHistory]
        ];
        const rowClass = 'rounded border border-slate-200 bg-white px-2 py-1.5 text-[10px] dark:border-slate-700 dark:bg-slate-900';
        return [
            '<div class="flex flex-wrap items-start justify-between gap-3">',
            '<div class="min-w-0"><div class="flex flex-wrap items-center gap-2"><h3 class="text-lg font-bold">' + escapeMigrationText(item.type || 'backup') + '</h3>',
            '<span class="rounded-full px-2 py-0.5 text-[10px] font-bold ' + (item.ok ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300') + '">' + (item.ok ? '검증 정상' : '검증 주의') + '</span></div>',
            '<p class="mt-1 break-all font-mono text-[10px] text-slate-400">' + escapeMigrationText(item.id || '') + '</p></div>',
            '<button type="button" id="sqlite-explorer-backup-delete" class="rounded border border-red-500 px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50 disabled:opacity-40 dark:text-red-400 dark:hover:bg-red-950/30">백업 지우기</button>',
            '</div>',
            '<div class="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-[10px] leading-relaxed text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">',
            '읽기 전용 검사 결과입니다. 문서 본문·설정값·API 키·암호문은 표시하지 않습니다. 삭제하면 목록에서 제거되고 파일은 <b>data/backups/trash</b>로 이동하여 수동 복구할 수 있습니다.</div>',
            '<div class="mt-3 grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">',
            '<span>생성<br><b>' + escapeMigrationText(formatExplorerDate(item.createdAt)) + '</b></span>',
            '<span>크기<br><b>' + escapeMigrationText(formatExplorerBytes(item.sizeBytes)) + '</b></span>',
            '<span>Schema<br><b>v' + Number(item.schemaVersion || 0) + '</b></span>',
            '<span>상태<br><b>' + escapeMigrationText(item.status || '-') + '</b></span>',
            '</div>',
            '<p class="mt-2 break-all text-[10px] text-slate-500">파일: ' + escapeMigrationText(item.filePath || item.fileName || '-') + '</p>',
            '<p class="mt-1 break-all font-mono text-[9px] text-slate-400">SHA-256 ' + escapeMigrationText(item.checksumSha256 || '-') + '</p>',
            '<div class="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">',
            '<div class="rounded border p-2 text-center ' + (item.checksumMatches ? 'border-emerald-500' : 'border-red-500') + '"><b class="block">' + (item.checksumMatches ? '일치' : '불일치') + '</b><span class="text-[10px] text-slate-500">checksum</span></div>',
            '<div class="rounded border p-2 text-center ' + (item.sizeMatches ? 'border-emerald-500' : 'border-red-500') + '"><b class="block">' + (item.sizeMatches ? '일치' : '불일치') + '</b><span class="text-[10px] text-slate-500">파일 크기</span></div>',
            '<div class="rounded border p-2 text-center ' + (integrity === 'ok' ? 'border-emerald-500' : 'border-red-500') + '"><b class="block truncate" title="' + escapeMigrationText(integrity) + '">' + escapeMigrationText(integrity) + '</b><span class="text-[10px] text-slate-500">integrity</span></div>',
            '<div class="rounded border p-2 text-center ' + (Number(item.foreignKeyViolations || 0) === 0 ? 'border-emerald-500' : 'border-red-500') + '"><b class="block">' + Number(item.foreignKeyViolations || 0) + '</b><span class="text-[10px] text-slate-500">FK 오류</span></div>',
            '</div>',
            '<h4 class="mt-4 border-b border-slate-200 pb-1 text-xs font-bold dark:border-slate-700">저장 개수</h4>',
            '<div class="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">' + countCards.map(function (card) {
                return '<div class="rounded-lg border border-slate-200 bg-slate-50 p-2 text-center dark:border-slate-700 dark:bg-slate-950/50"><b class="block text-lg text-emerald-700 dark:text-emerald-300">' + Number(card[1] || 0) + '</b><span class="text-[10px] text-slate-500">' + escapeMigrationText(card[0]) + '</span></div>';
            }).join('') + '</div>',
            '<div class="mt-3 space-y-2">',
            renderSqliteBackupRows('문서 메타데이터', item.documents, function (row) {
                return '<div class="' + rowClass + '"><b>' + escapeMigrationText(row.title || '(제목 없음)') + '</b><span class="float-right">v' + Number(row.version || 0) + '</span><p class="mt-1 text-slate-500">' + escapeMigrationText(row.contentFormat || '-') + ' · 본문 길이 ' + Number(row.contentBytes || 0) + ' · ' + escapeMigrationText(formatExplorerDate(row.updatedAt)) + '</p></div>';
            }, counts.documents, item.sampleLimit),
            renderSqliteBackupRows('폴더 메타데이터', item.folders, function (row) {
                return '<div class="' + rowClass + '"><b>' + escapeMigrationText(row.name || '-') + '</b><p class="mt-1 font-mono text-slate-500">' + escapeMigrationText(row.id || '') + ' · 상위 ' + escapeMigrationText(row.parentId || 'ROOT') + '</p></div>';
            }, counts.folders, item.sampleLimit),
            renderSqliteBackupRows('파일 메타데이터', item.files, function (row) {
                return '<div class="' + rowClass + '"><b>' + escapeMigrationText(row.path || row.name || '-') + '</b><p class="mt-1 text-slate-500">' + escapeMigrationText(row.mimeType || row.extension || '-') + ' · ' + escapeMigrationText(formatExplorerBytes(row.sizeBytes)) + '</p></div>';
            }, counts.fileEntries, item.sampleLimit),
            renderSqliteBackupRows('설정 키 메타데이터', item.settings, function (row) {
                return '<div class="' + rowClass + '"><b>' + escapeMigrationText(row.key || '-') + '</b><p class="mt-1 text-slate-500">' + escapeMigrationText(row.group || '-') + ' · ' + escapeMigrationText(row.scopeType || '-') + '/' + escapeMigrationText(row.scopeId || 'global') + ' · ' + escapeMigrationText(row.valueType || '-') + '</p></div>';
            }, counts.settings, item.sampleLimit),
            renderSqliteBackupRows('자산 메타데이터', item.assets, function (row) {
                return '<div class="' + rowClass + '"><b>' + escapeMigrationText(row.originalName || row.id || '-') + '</b><p class="mt-1 text-slate-500">' + escapeMigrationText(row.assetType || row.mimeType || '-') + ' · ' + escapeMigrationText(formatExplorerBytes(row.sizeBytes)) + '</p></div>';
            }, counts.assets, item.sampleLimit),
            '</div>'
        ].join('');
    }

    async function openSqliteExplorerBackup(backupId) {
        const detail = document.getElementById('sqlite-explorer-detail');
        if (!detail || !window.MDPStorage) return;
        const normalizedId = String(backupId || '');
        markSqliteExplorerBackupSelected(normalizedId);
        detail.innerHTML = '<p class="text-slate-500">백업을 읽기 전용으로 검사하는 중...</p>';
        try {
            const item = await window.MDPStorage.getSqliteExplorerBackup(normalizedId);
            if (sqliteExplorerSelectedBackupId !== normalizedId) return;
            detail.innerHTML = renderSqliteExplorerBackup(item);
            const deleteButton = document.getElementById('sqlite-explorer-backup-delete');
            if (deleteButton) deleteButton.addEventListener('click', function () { deleteSqliteExplorerBackup(normalizedId); });
        } catch (error) {
            if (sqliteExplorerSelectedBackupId !== normalizedId) return;
            detail.innerHTML = explorerEmpty(error && error.message ? error.message : '백업 내용을 확인하지 못했습니다.')
                + '<button type="button" id="sqlite-explorer-backup-delete" class="mt-3 rounded border border-red-500 px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50 dark:text-red-400">등록된 백업 지우기</button>';
            const deleteButton = document.getElementById('sqlite-explorer-backup-delete');
            if (deleteButton) deleteButton.addEventListener('click', function () { deleteSqliteExplorerBackup(normalizedId); });
        }
    }

    async function deleteSqliteExplorerBackup(backupId) {
        const detail = document.getElementById('sqlite-explorer-detail');
        if (!detail || !window.MDPStorage) return;
        const normalizedId = String(backupId || '');
        const typedId = window.prompt('삭제할 백업 ID를 정확히 입력하세요.\n\n' + normalizedId, '');
        if (typedId === null) return;
        if (typedId.trim() !== normalizedId) {
            window.alert('백업 ID가 일치하지 않아 삭제하지 않았습니다.');
            return;
        }
        if (!window.confirm('이 백업을 목록에서 제거하고 파일을 관리 휴지통으로 이동할까요?\n\n현재 SQLite DB와 다른 백업은 변경되지 않습니다.')) return;
        const deleteButton = document.getElementById('sqlite-explorer-backup-delete');
        if (deleteButton) deleteButton.disabled = true;
        try {
            const result = await window.MDPStorage.deleteSqliteExplorerBackup(normalizedId);
            sqliteExplorerSelectedBackupId = '';
            await refreshSqliteExplorer();
            detail.innerHTML = '<div class="rounded-lg border border-emerald-500 bg-emerald-50 p-4 text-sm text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200"><b>백업을 목록에서 지웠습니다.</b><p class="mt-2 break-all text-[11px]">' + (result.recoverable ? '복구 가능 휴지통: ' + escapeMigrationText(result.trashPath || '-') : '원본 파일이 이미 없어 남아 있던 목록 기록만 제거했습니다.') + '</p></div>';
        } catch (error) {
            detail.innerHTML = explorerEmpty(error && error.message ? error.message : '백업을 지우지 못했습니다.');
        }
    }

    async function refreshSqliteExplorer() {
        if (sqliteExplorerLoading) return;
        releaseSqliteExplorerPreviewUrls();
        resetSqliteExplorerLMStudioConnection();
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
            if (window.MDPCredentialVault) {
                try {
                    await window.MDPCredentialVault.load();
                    await window.MDPCredentialVault.syncCatalog();
                } catch (vaultError) {
                    console.warn('SQLite tool settings catalog sync skipped:', vaultError && vaultError.message ? vaultError.message : vaultError);
                }
            }
            sqliteExplorerSnapshot = await window.MDPStorage.getSqliteExplorerSnapshot({
                query: queryElement ? queryElement.value.trim() : '',
                limit: 300
            });
            sqliteExplorerSelectedSettingIndex = -1;
            renderSqliteExplorerCounts(sqliteExplorerSnapshot);
            renderSqliteExplorerList();
            if (sqliteExplorerTab === 'settings') openSqliteExplorerToolOverview();
            if (sqliteExplorerTab === 'templates') openSqliteExplorerTemplateOverview();
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
        positionSqliteExplorer();
        bindSqliteExplorerDrag();
        sqliteExplorerTab = 'documents';
        refreshSqliteExplorer();
        const query = document.getElementById('sqlite-explorer-query');
        if (query) setTimeout(function () { query.focus(); }, 0);
    }

    function closeSqliteExplorer() {
        const modal = document.getElementById('sqlite-explorer-modal');
        if (!modal) return;
        releaseSqliteExplorerPreviewUrls();
        modal.classList.add('hidden');
    }

    function updateSqliteExplorerFullscreenButton() {
        const button = document.getElementById('sqlite-explorer-fullscreen');
        if (!button) return;
        button.textContent = sqliteExplorerFullscreen ? '복원' : '전체화면';
        button.title = sqliteExplorerFullscreen ? 'SQLite 탐색 창 크기 복원' : 'SQLite 탐색 창 전체화면';
        button.setAttribute('aria-pressed', sqliteExplorerFullscreen ? 'true' : 'false');
    }

    function toggleSqliteExplorerFullscreen() {
        const panel = document.getElementById('sqlite-explorer-panel');
        if (!panel) return;
        if (!sqliteExplorerFullscreen) {
            sqliteExplorerRestorePosition = {
                left: panel.style.left,
                top: panel.style.top
            };
            sqliteExplorerFullscreen = true;
            panel.classList.add('sqlite-explorer-fullscreen');
            panel.style.left = '8px';
            panel.style.top = '8px';
        } else {
            sqliteExplorerFullscreen = false;
            panel.classList.remove('sqlite-explorer-fullscreen');
            panel.style.left = sqliteExplorerRestorePosition && sqliteExplorerRestorePosition.left
                ? sqliteExplorerRestorePosition.left : '8px';
            panel.style.top = sqliteExplorerRestorePosition && sqliteExplorerRestorePosition.top
                ? sqliteExplorerRestorePosition.top : '8px';
            sqliteExplorerRestorePosition = null;
            requestAnimationFrame(clampSqliteExplorerPosition);
        }
        updateSqliteExplorerFullscreenButton();
    }

    function clampSqliteExplorerPosition() {
        const panel = document.getElementById('sqlite-explorer-panel');
        if (!panel || !sqliteExplorerPositioned) return;
        const maxLeft = Math.max(8, window.innerWidth - panel.offsetWidth - 8);
        const maxTop = Math.max(8, window.innerHeight - Math.min(panel.offsetHeight, window.innerHeight - 16) - 8);
        const left = Math.max(8, Math.min(maxLeft, parseFloat(panel.style.left) || 8));
        const top = Math.max(8, Math.min(maxTop, parseFloat(panel.style.top) || 8));
        panel.style.left = left + 'px';
        panel.style.top = top + 'px';
    }

    function positionSqliteExplorer() {
        const panel = document.getElementById('sqlite-explorer-panel');
        if (!panel) return;
        if (!sqliteExplorerPositioned) {
            const rect = panel.getBoundingClientRect();
            panel.style.left = Math.max(8, (window.innerWidth - rect.width) / 2) + 'px';
            panel.style.top = Math.max(8, (window.innerHeight - rect.height) / 2) + 'px';
            sqliteExplorerPositioned = true;
        }
        clampSqliteExplorerPosition();
    }

    function bindSqliteExplorerDrag() {
        if (sqliteExplorerDragBound) return;
        const panel = document.getElementById('sqlite-explorer-panel');
        const handle = document.getElementById('sqlite-explorer-drag-handle');
        if (!panel || !handle) return;
        sqliteExplorerDragBound = true;
        let pointerId = null;
        let offsetX = 0;
        let offsetY = 0;

        handle.addEventListener('pointerdown', function (event) {
            if (event.button !== 0) return;
            if (sqliteExplorerFullscreen) return;
            const target = event.target;
            if (target && target.closest && target.closest('button,input,textarea,select,a,label')) return;
            const rect = panel.getBoundingClientRect();
            pointerId = event.pointerId;
            offsetX = event.clientX - rect.left;
            offsetY = event.clientY - rect.top;
            handle.setPointerCapture(pointerId);
            event.preventDefault();
        });
        handle.addEventListener('pointermove', function (event) {
            if (pointerId !== event.pointerId) return;
            const maxLeft = Math.max(8, window.innerWidth - panel.offsetWidth - 8);
            const maxTop = Math.max(8, window.innerHeight - Math.min(panel.offsetHeight, window.innerHeight - 16) - 8);
            panel.style.left = Math.max(8, Math.min(maxLeft, event.clientX - offsetX)) + 'px';
            panel.style.top = Math.max(8, Math.min(maxTop, event.clientY - offsetY)) + 'px';
        });
        function stopDrag(event) {
            if (pointerId !== event.pointerId) return;
            if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
            pointerId = null;
        }
        handle.addEventListener('pointerup', stopDrag);
        handle.addEventListener('pointercancel', stopDrag);
        window.addEventListener('resize', clampSqliteExplorerPosition);
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

    async function runSqliteIntegrityCheck() {
        if (sqliteIntegrityCheckRunning) return;
        const button = document.getElementById('sqlite-integrity-check-run');
        const element = document.getElementById('sqlite-integrity-check-result');
        sqliteIntegrityCheckRunning = true;
        if (button) {
            button.disabled = true;
            button.textContent = '검사 중...';
        }
        if (element) {
            element.className = 'mt-2 rounded border border-slate-300 bg-slate-50 p-2 text-[10px] text-slate-600 dark:border-slate-700 dark:bg-slate-950/50 dark:text-slate-300';
            element.textContent = '현재 SQLite DB를 읽어 integrity와 foreign key를 검사하고 있습니다.';
        }
        try {
            if (!window.MDPStorage || typeof window.MDPStorage.runSqliteIntegrityCheck !== 'function') {
                throw new Error('SQLite 무결성 검사 모듈이 준비되지 않았습니다.');
            }
            const result = await window.MDPStorage.runSqliteIntegrityCheck();
            const integrity = Array.isArray(result && result.integrity) ? result.integrity : [];
            const violations = Array.isArray(result && result.foreignKeyViolations)
                ? result.foreignKeyViolations.length : Number(result && result.foreignKeyViolations || 0);
            if (element) {
                element.className = 'mt-2 rounded border p-2 text-[10px] ' + (result && result.ok
                    ? 'border-emerald-400 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200'
                    : 'border-red-400 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300');
                element.innerHTML = '<p class="font-semibold">' + (result && result.ok ? 'SQLite DB 무결성 정상' : 'SQLite DB 검사에서 문제가 발견됨') + '</p>'
                    + '<p class="mt-1">integrity: ' + escapeMigrationText(integrity.join(', ') || '-')
                    + ' · FK 위반: ' + Number(violations) + '건</p>'
                    + (result && result.ok ? '' : '<p class="mt-1">현재 DB에 추가 쓰기를 중단하고 최근 검증 백업을 확인하세요.</p>');
            }
        } catch (error) {
            if (element) {
                element.textContent = '무결성 검사를 실행하지 못했습니다: '
                    + (error && error.message ? error.message : error)
                    + ' · 현재 데이터는 변경되지 않았습니다. 서버 연결을 다시 확인하세요.';
                element.className = 'mt-2 rounded border border-red-300 bg-red-50 p-2 text-[10px] text-red-600 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400';
            }
        } finally {
            sqliteIntegrityCheckRunning = false;
            if (button) button.textContent = 'DB 무결성 검사';
            const state = window.MDPStorage && typeof window.MDPStorage.getStatus === 'function'
                ? window.MDPStorage.getStatus() : null;
            setSqliteIntegrityCheckAvailable(!!(state && state.sqliteHealth && state.sqliteHealth.capabilities
                && state.sqliteHealth.capabilities.integrityCheck === true));
        }
    }

    async function runSqliteWasmDatabaseExport() {
        if (sqliteDatabaseExportRunning) return;
        const button = document.getElementById('sqlite-wasm-db-export');
        const element = document.getElementById('sqlite-wasm-db-export-result');
        sqliteDatabaseExportRunning = true;
        if (button) {
            button.disabled = true;
            button.textContent = 'DB 내보내는 중...';
        }
        if (element) {
            element.className = 'mt-2 rounded border border-slate-300 bg-slate-50 p-2 text-[10px] text-slate-600 dark:border-slate-700 dark:bg-slate-950/50 dark:text-slate-300';
            element.textContent = 'OPFS SQLite DB의 일관된 스냅샷을 준비하고 있습니다.';
        }
        try {
            if (!window.MDPStorage || typeof window.MDPStorage.exportSqliteDatabase !== 'function') {
                throw new Error('WASM DB 내보내기 모듈이 준비되지 않았습니다.');
            }
            const result = await window.MDPStorage.exportSqliteDatabase();
            if (!result || !(result.blob instanceof Blob)) {
                throw new Error('DB 내보내기 결과가 올바르지 않습니다.');
            }
            const url = URL.createObjectURL(result.blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = result.fileName || 'mdpro.sqlite';
            anchor.style.display = 'none';
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
            if (element) {
                element.className = 'mt-2 rounded border border-emerald-400 bg-emerald-50 p-2 text-[10px] text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200';
                element.textContent = (result.fileName || 'mdpro.sqlite') + ' · '
                    + formatExplorerBytes(result.sizeBytes || result.blob.size) + ' 다운로드를 시작했습니다.';
            }
        } catch (error) {
            if (element) {
                element.className = 'mt-2 rounded border border-red-300 bg-red-50 p-2 text-[10px] text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300';
                element.textContent = 'WASM DB 내보내기 실패: ' + (error && error.message ? error.message : error);
            }
        } finally {
            sqliteDatabaseExportRunning = false;
            if (button) button.textContent = 'WASM DB 파일 내보내기';
            const state = window.MDPStorage && typeof window.MDPStorage.getStatus === 'function'
                ? window.MDPStorage.getStatus() : null;
            setSqliteDatabaseExportAvailable(!!(state && state.sqliteHealth && state.sqliteHealth.capabilities
                && state.sqliteHealth.capabilities.databaseExport === true));
        }
    }

    async function runSqliteWasmDatabaseImport(event) {
        if (sqliteDatabaseImportRunning) return;
        const input = event && event.currentTarget
            ? event.currentTarget : document.getElementById('sqlite-wasm-db-import-file');
        const file = input && input.files && input.files[0] ? input.files[0] : null;
        const button = document.getElementById('sqlite-wasm-db-import');
        const element = document.getElementById('sqlite-wasm-db-import-result');
        if (!file) return;
        const accepted = window.confirm(
            '선택한 SQLite DB로 현재 WASM OPFS DB를 교체합니다.\n\n'
            + '파일: ' + file.name + '\n크기: ' + formatExplorerBytes(file.size) + '\n\n'
            + '먼저 schema·설정 정책·integrity·FK를 검사하고 현재 DB를 OPFS에 자동 백업합니다. '
            + '검사 실패 시 현재 DB는 변경하지 않습니다. 완료 후 앱을 자동으로 새로고침하므로 '
            + '저장되지 않은 편집 내용은 사라질 수 있습니다. 계속할까요?'
        );
        if (!accepted) {
            input.value = '';
            return;
        }
        sqliteDatabaseImportRunning = true;
        if (button) {
            button.disabled = true;
            button.textContent = 'DB 검사·불러오는 중...';
        }
        if (element) {
            element.className = 'mt-2 rounded border border-slate-300 bg-slate-50 p-2 text-[10px] text-slate-600 dark:border-slate-700 dark:bg-slate-950/50 dark:text-slate-300';
            element.textContent = '후보 DB를 임시 OPFS 영역에서 검증한 뒤 현재 DB를 안전하게 교체하고 있습니다.';
        }
        try {
            if (!window.MDPStorage || typeof window.MDPStorage.importSqliteDatabase !== 'function') {
                throw new Error('WASM DB 불러오기 모듈이 준비되지 않았습니다.');
            }
            const result = await window.MDPStorage.importSqliteDatabase(file, { fileName: file.name });
            const validation = result && result.validation ? result.validation : {};
            const counts = validation.counts || {};
            if (element) {
                element.className = 'mt-2 rounded border border-emerald-400 bg-emerald-50 p-2 text-[10px] text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200';
                element.innerHTML = '<p class="font-semibold">WASM SQLite DB 불러오기 완료</p>'
                    + '<p class="mt-1 break-all">' + escapeMigrationText(result.fileName || file.name)
                    + ' · ' + escapeMigrationText(formatExplorerBytes(result.sizeBytes || file.size)) + '</p>'
                    + '<p>schema v' + Number(validation.schemaVersion || 0)
                    + ' · 문서 ' + Number(counts.documents || 0)
                    + ' · 폴더 ' + Number(counts.folders || 0)
                    + ' · 버전 ' + Number(counts.versions || 0)
                    + ' · 설정 ' + Number(counts.settings || 0) + '</p>'
                    + '<p class="mt-1">기존 DB 자동 백업: ' + escapeMigrationText(result.backup && result.backup.path || '-') + '</p>'
                    + '<p class="mt-1 font-semibold">새 DB 상태로 앱을 자동 새로고침합니다.</p>';
            }
            try {
                window.dispatchEvent(new CustomEvent('mdp-sqlite-database-imported', { detail: result }));
            } catch (_) {}
            if (window.MDPStorage && typeof window.MDPStorage.refreshSqliteHealth === 'function') {
                await window.MDPStorage.refreshSqliteHealth();
            }
            if (typeof window.showToast === 'function') {
                window.showToast('WASM SQLite DB를 불러왔습니다. 앱을 새로고침합니다.');
            }
            setTimeout(function () { window.location.reload(); }, 1200);
        } catch (error) {
            if (element) {
                element.className = 'mt-2 rounded border border-red-300 bg-red-50 p-2 text-[10px] text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300';
                element.textContent = 'WASM DB 불러오기 실패: ' + (error && error.message ? error.message : error)
                    + ' · 현재 DB는 유지되거나 자동 백업에서 복구되었습니다.';
            }
        } finally {
            sqliteDatabaseImportRunning = false;
            if (input) input.value = '';
            if (button) button.textContent = 'WASM DB 파일 불러오기';
            const state = window.MDPStorage && typeof window.MDPStorage.getStatus === 'function'
                ? window.MDPStorage.getStatus() : null;
            setSqliteDatabaseImportAvailable(!!(state && state.sqliteHealth && state.sqliteHealth.capabilities
                && state.sqliteHealth.capabilities.databaseImport === true));
        }
    }

    function handleSqliteRestoreFileSelection(event) {
        const input = event && event.currentTarget ? event.currentTarget : document.getElementById('sqlite-restore-package-file');
        const file = input && input.files && input.files[0] ? input.files[0] : null;
        const nameElement = document.getElementById('sqlite-restore-package-name');
        const resultElement = document.getElementById('sqlite-restore-package-result');
        selectedSqliteRestoreFile = null;
        lastSqliteRestorePreview = null;
        lastPreRestoreBackup = null;
        if (!file) {
            if (nameElement) nameElement.textContent = '선택된 파일 없음';
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
            '<p class="font-semibold">복원 패키지 안전 검증 완료</p>',
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
            '<p class="mt-2 font-semibold text-amber-700 dark:text-amber-300">현재 SQLite DB와 assets는 아직 변경되지 않았습니다. “검증된 백업 복원”을 누르면 현재 데이터의 자동 백업을 만든 뒤 교체하며, 실패하면 자동 rollback합니다.</p>'
        ].join('');
    }

    async function runSqliteRestorePreview() {
        if (sqliteRestorePreviewRunning || !selectedSqliteRestoreFile) return;
        const previewButton = document.getElementById('sqlite-restore-package-preview');
        const selectButton = document.getElementById('sqlite-restore-package-select');
        const resultElement = document.getElementById('sqlite-restore-package-result');
        sqliteRestorePreviewRunning = true;
        lastSqliteRestorePreview = null;
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
            lastSqliteRestorePreview = result;
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

    async function runSqliteRestoreApply() {
        if (sqliteRestoreApplyRunning || !lastSqliteRestorePreview) return;
        const preview = lastSqliteRestorePreview;
        const checksum = preview.packageChecksumSha256
            || (preview.validation && preview.validation.packageChecksumSha256);
        if (!preview.importId || !checksum) return;
        const accepted = window.confirm(
            '현재 SQLite 문서·폴더·설정·자산을 선택한 백업 내용으로 교체합니다.\n\n'
            + '교체 직전에 현재 데이터 전체를 별도 .mdpbackup으로 자동 보존하며, 실패하면 자동으로 되돌립니다. 계속할까요?'
        );
        if (!accepted) return;
        const applyButton = document.getElementById('sqlite-restore-package-apply');
        const resultElement = document.getElementById('sqlite-restore-package-result');
        sqliteRestoreApplyRunning = true;
        setSqliteRestorePreviewAvailable(sqliteRestorePreviewAvailable);
        if (applyButton) applyButton.textContent = '자동 백업 및 복원 중...';
        if (resultElement) {
            resultElement.className = 'mt-2 rounded border border-amber-300 bg-amber-50 p-2 text-[10px] text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200';
            resultElement.textContent = '현재 DB와 assets를 자동 백업한 뒤 검증된 staging 데이터로 교체하고 있습니다. 창을 닫지 마세요.';
        }
        try {
            if (!window.MDPStorage || typeof window.MDPStorage.applyBackupRestore !== 'function') {
                throw new Error('SQLite 실제 복원 기능이 준비되지 않았습니다.');
            }
            const result = await window.MDPStorage.applyBackupRestore(preview.importId, checksum);
            const backup = result.preRestoreBackup || {};
            const counts = result.verification && result.verification.databaseCounts
                ? result.verification.databaseCounts
                : {};
            lastSqliteRestorePreview = null;
            lastPreRestoreBackup = backup;
            if (resultElement) {
                resultElement.className = 'mt-2 rounded border border-emerald-300 bg-emerald-50 p-2 text-[10px] text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200';
                resultElement.innerHTML = [
                    '<p class="font-semibold">SQLite 복원 및 적용 후 검증 완료</p>',
                    '<p class="mt-1">문서 ' + Number(counts.documents || 0) + ' · 폴더 ' + Number(counts.folders || 0)
                        + ' · 설정 ' + Number(counts.settings || 0) + ' · 자산 ' + Number(counts.assets || 0) + '</p>',
                    '<p>integrity ' + escapeMigrationText((result.verification.integrityCheck || []).join(',') || '-')
                        + ' · FK 위반 ' + Number(result.verification.foreignKeyViolations || 0) + '</p>',
                    '<p class="mt-1 break-all">복원 직전 자동 백업: ' + escapeMigrationText(backup.fileName || backup.filePath || '-') + '</p>',
                    '<p class="mt-2 font-semibold">복원 전 백업을 내려받아 보관한 뒤 새 데이터로 다시 연결해 주세요.</p>',
                    '<div class="mt-2 flex flex-wrap gap-2">',
                    '<button type="button" id="sqlite-pre-restore-backup-download" class="rounded border border-emerald-700 px-2 py-1 font-semibold">복원 전 백업 다운로드</button>',
                    '<button type="button" id="sqlite-restore-reload" class="rounded bg-emerald-700 px-2 py-1 font-semibold text-white">앱 새로고침</button>',
                    '</div>'
                ].join('');
                const backupButton = resultElement.querySelector('#sqlite-pre-restore-backup-download');
                const reloadButton = resultElement.querySelector('#sqlite-restore-reload');
                if (backupButton) backupButton.addEventListener('click', runSqlitePreRestoreBackupDownload);
                if (reloadButton) reloadButton.addEventListener('click', function () { window.location.reload(); });
            }
        } catch (error) {
            if (resultElement) {
                resultElement.textContent = 'SQLite 복원 실패: ' + (error && error.message ? error.message : error)
                    + ' · 교체 도중 실패한 경우 서버가 이전 DB와 assets로 자동 rollback합니다.';
                resultElement.className = 'mt-2 rounded border border-red-300 bg-red-50 p-2 text-[10px] text-red-600 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400';
            }
        } finally {
            sqliteRestoreApplyRunning = false;
            if (applyButton) applyButton.textContent = '검증된 백업 복원';
            setSqliteRestorePreviewAvailable(sqliteRestorePreviewAvailable);
        }
    }

    async function runSqlitePreRestoreBackupDownload() {
        const button = document.getElementById('sqlite-pre-restore-backup-download');
        const fileName = lastPreRestoreBackup && lastPreRestoreBackup.fileName;
        if (!fileName || !window.MDPStorage) return;
        if (button) {
            button.disabled = true;
            button.textContent = '다운로드 준비 중...';
        }
        try {
            const downloaded = await window.MDPStorage.downloadBackupPackage(fileName);
            const url = URL.createObjectURL(downloaded.blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = downloaded.fileName || fileName;
            anchor.style.display = 'none';
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
        } catch (error) {
            if (typeof window.showToast === 'function') {
                window.showToast('복원 전 백업 다운로드 실패: ' + (error && error.message ? error.message : error), 'error');
            }
        } finally {
            if (button) {
                button.disabled = false;
                button.textContent = '복원 전 백업 다운로드';
            }
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
        if (!checkbox) return;
        const enabled = checkbox.checked === true;
        writeSqliteFeatureEnabled(enabled);
        setSqliteSettingsPanelVisible(enabled);
        notifyStorageFeatureVisibility();
        if (enabled) await refreshSqliteStatus();
    }

    async function refreshSqliteStatus() {
        installSqliteControl();
        const elements = sqliteStatusElements();
        if (!elements.checkbox) return null;
        elements.checkbox.checked = readSqliteFeatureEnabled(elements.checkbox.checked);
        setSqliteSettingsPanelVisible(elements.checkbox.checked);
        if (!window.MDPStorage || typeof window.MDPStorage.getStatus !== 'function') {
            notifyStorageFeatureVisibility();
            setSqliteStatus('저장 모듈 로드 대기 중', 'info', '');
            return null;
        }

        let state = window.MDPStorage.getStatus();
        if (state.initialized && typeof window.MDPStorage.refreshSqliteHealth === 'function') {
            await window.MDPStorage.refreshSqliteHealth();
            state = window.MDPStorage.getStatus();
        }
        notifyStorageFeatureVisibility();
        const backendSelect = document.getElementById('sqlite-backend-select');
        if (backendSelect) {
            backendSelect.value = state.sqliteBackendPreference
                || (window.MDPStorage && window.MDPStorage.DEFAULT_SQLITE_BACKEND)
                || DEFAULT_SQLITE_BACKEND;
        }
        const health = state.sqliteHealth;
        if (!health) {
            setMigrationPreviewAvailable(false);
            setSqliteExplorerAvailable(false);
            setSqliteBackupPackageAvailable(false);
            setSqliteIntegrityCheckAvailable(false);
            setSqliteDatabaseExportAvailable(false);
            setSqliteDatabaseImportAvailable(false);
            sqliteRestoreApplyAvailable = false;
            setSqliteRestorePreviewAvailable(false);
            setLocalAppLinkVisible(true);
            setSqliteStatus(sqliteOfflineStatus(state), 'error', sqliteOfflineDetails(state.lastError, state) + ' · 현재 저장소: inDB');
            return state;
        }
        setLocalAppLinkVisible(false);
        setMigrationPreviewAvailable(!!(health.capabilities && health.capabilities.migrationPreview === true));
        setSqliteExplorerAvailable(!!(health.capabilities && health.capabilities.explorer === true));
        setSqliteBackupPackageAvailable(!!(health.capabilities && health.capabilities.backupPackage === true));
        setSqliteIntegrityCheckAvailable(!!(health.capabilities && health.capabilities.integrityCheck === true));
        setSqliteDatabaseExportAvailable(!!(health.capabilities && health.capabilities.databaseExport === true));
        setSqliteDatabaseImportAvailable(!!(health.capabilities && health.capabilities.databaseImport === true));
        sqliteRestoreApplyAvailable = !!(health.capabilities && health.capabilities.restore === true);
        setSqliteRestorePreviewAvailable(!!(health.capabilities && health.capabilities.restorePreview === true));
        const recovery = state.recoveryStatus || null;
        const recoveryReady = !!(recovery && recovery.available === true);
        const canActivate = !!(health.capabilities
            && health.capabilities.storageModeActivation === true
            && recoveryReady);
        const documentApiReady = !!(health.capabilities
            && health.capabilities.documents === true
            && health.capabilities.folders === true);
        const detail = '백엔드: ' + (state.sqliteBackend || health.backend || '-')
            + ' · DB: ' + (health.databasePath || '-')
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

    function syncSqliteCheckbox(featureEnabled) {
        const elements = sqliteStatusElements();
        if (!elements.checkbox) return;
        const enabled = typeof featureEnabled === 'boolean'
            ? featureEnabled
            : readSqliteFeatureEnabled(elements.checkbox.checked);
        elements.checkbox.checked = enabled;
        writeSqliteFeatureEnabled(enabled);
        setSqliteSettingsPanelVisible(enabled);
        notifyStorageFeatureVisibility();
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
        ,runSqliteIntegrityCheck: runSqliteIntegrityCheck
        ,openSqliteExplorer: openSqliteExplorer
        ,closeSqliteExplorer: closeSqliteExplorer
        ,toggleSqliteExplorerFullscreen: toggleSqliteExplorerFullscreen
        ,refreshSqliteExplorer: refreshSqliteExplorer
        ,setSqliteExplorerTab: setSqliteExplorerTab
        ,openSqliteExplorerDocument: openSqliteExplorerDocument
        ,openSqliteExplorerFile: openSqliteExplorerFile
        ,openSqliteExplorerBackup: openSqliteExplorerBackup
        ,deleteSqliteExplorerBackup: deleteSqliteExplorerBackup
        ,openSqliteExplorerSetting: openSqliteExplorerSetting
        ,runSqliteBackupPackageCreate: runSqliteBackupPackageCreate
        ,runSqliteBackupPackageDownload: runSqliteBackupPackageDownload
        ,runSqliteRestorePreview: runSqliteRestorePreview
        ,renderSqliteRestorePreview: renderSqliteRestorePreview
        ,runSqliteRestoreApply: runSqliteRestoreApply
        ,runSqlitePreRestoreBackupDownload: runSqlitePreRestoreBackupDownload
        ,buildLocalSqliteServerCommand: buildLocalSqliteServerCommand
        ,buildLocalSqliteServerFolderPickerCommand: buildLocalSqliteServerFolderPickerCommand
        ,startLocalSqliteServer: startLocalSqliteServer
    };
})();
