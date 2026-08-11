(function (global) {
    'use strict';

    var SETTINGS_KEY = 'tidyCustomScripts';
    var GITHUB_FOLDER = 'mdviewer/tidy-scripts';
    var FILE_HEADER = 'mdviewer-tidy-script:v1';
    var sourceUrl = document.currentScript && document.currentScript.src ? document.currentScript.src : '';
    var managerUrl = sourceUrl
        ? new URL('./tidy-script-manager.html', sourceUrl).href
        : './js/Tidy/tidy-script-manager.html';
    var deps = {};
    var scripts = [];
    var configured = false;
    var runBusy = false;

    function stringValue(value) {
        return String(value == null ? '' : value);
    }

    function createId() {
        if (global.crypto && typeof global.crypto.randomUUID === 'function') {
            return 'tidy_' + global.crypto.randomUUID();
        }
        return 'tidy_' + Date.now() + '_' + Math.random().toString(16).slice(2, 10);
    }

    function normalizeName(value) {
        return Array.from(stringValue(value).trim()).slice(0, 60).join('');
    }

    function normalizeRecord(input, previous) {
        var source = input && typeof input === 'object' ? input : {};
        var prior = previous && typeof previous === 'object' ? previous : {};
        var now = new Date().toISOString();
        return {
            id: stringValue(source.id || prior.id || createId()).trim(),
            name: normalizeName(source.name || prior.name || '사용자 TIDY'),
            code: stringValue(source.code != null ? source.code : prior.code).trim(),
            enabled: source.enabled !== false,
            sourceName: stringValue(source.sourceName || prior.sourceName || '').trim().slice(0, 260),
            createdAt: stringValue(prior.createdAt || source.createdAt || now),
            updatedAt: stringValue(source.updatedAt || prior.updatedAt || now),
            mirrors: {
                sqlite: !!((source.mirrors || prior.mirrors) && (source.mirrors || prior.mirrors).sqlite),
                github: !!((source.mirrors || prior.mirrors) && (source.mirrors || prior.mirrors).github)
            }
        };
    }

    function normalizeList(value) {
        var seen = new Set();
        return (Array.isArray(value) ? value : []).map(function (item) {
            return normalizeRecord(item, item);
        }).filter(function (item) {
            if (!item.id || !item.name || !item.code || seen.has(item.id)) return false;
            seen.add(item.id);
            return true;
        }).slice(0, 100);
    }

    function compileTransformer(code) {
        var source = stringValue(code).trim();
        if (!/^(?:async\s+)?function(?:\s+[A-Za-z_$][\w$]*)?\s*\(/.test(source)) {
            throw new Error('코드는 function transform(source, context) { ... } 형식이어야 합니다.');
        }
        var fn = Function('"use strict"; return (' + source + ');')();
        if (typeof fn !== 'function') throw new Error('변환 함수를 찾을 수 없습니다.');
        return fn;
    }

    function utf8ToBase64(text) {
        var bytes = new TextEncoder().encode(stringValue(text));
        var binary = '';
        for (var i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
        return btoa(binary);
    }

    function base64ToUtf8(text) {
        var binary = atob(stringValue(text).replace(/\s+/g, ''));
        var bytes = new Uint8Array(binary.length);
        for (var i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
        return new TextDecoder().decode(bytes);
    }

    function serializeGithubFile(record) {
        var metadata = {
            id: record.id,
            name: record.name,
            enabled: record.enabled !== false,
            sourceName: record.sourceName || '',
            createdAt: record.createdAt,
            updatedAt: record.updatedAt
        };
        return '/* ' + FILE_HEADER + '\n' + utf8ToBase64(JSON.stringify(metadata)) + '\n*/\n' + record.code.trim() + '\n';
    }

    function parseGithubFile(text, fallbackName) {
        var source = stringValue(text);
        var match = source.match(/^\/\*\s*mdviewer-tidy-script:v1\s*\n([A-Za-z0-9+/=\r\n]+?)\n\*\/\s*\n([\s\S]*)$/);
        if (!match) {
            return normalizeRecord({
                name: stringValue(fallbackName || '업로드 JS').replace(/\.js$/i, ''),
                code: source,
                sourceName: fallbackName || ''
            });
        }
        var metadata = JSON.parse(base64ToUtf8(match[1]));
        return normalizeRecord({
            id: metadata.id,
            name: metadata.name,
            enabled: metadata.enabled,
            sourceName: metadata.sourceName || fallbackName || '',
            createdAt: metadata.createdAt,
            updatedAt: metadata.updatedAt,
            code: match[2]
        });
    }

    function filePath(record) {
        return GITHUB_FOLDER + '/' + stringValue(record.id).replace(/[^A-Za-z0-9_.-]+/g, '_') + '.js';
    }

    function renderButtons() {
        var container = document.getElementById('tidy-custom-script-buttons');
        if (!container) return;
        container.replaceChildren();
        scripts.filter(function (item) { return item.enabled !== false; }).forEach(function (item) {
            var button = document.createElement('button');
            button.type = 'button';
            button.className = 'tidy-action-button tidy-custom-action-button px-2 py-1 rounded border border-cyan-300 dark:border-cyan-700 text-[11px] font-semibold text-cyan-700 dark:text-cyan-300 hover:bg-cyan-50 dark:hover:bg-cyan-900/20';
            button.textContent = item.name;
            button.title = '사용자 JS TIDY 실행: ' + item.name;
            button.addEventListener('click', function () { applyScript(item.id); });
            container.appendChild(button);
        });
    }

    async function refresh() {
        if (!configured || typeof deps.getSettings !== 'function') return scripts.slice();
        var settings = await deps.getSettings() || {};
        scripts = normalizeList(settings[SETTINGS_KEY]);
        renderButtons();
        return scripts.slice();
    }

    async function saveLocalList(nextList) {
        scripts = normalizeList(nextList);
        if (typeof deps.setSettings !== 'function') throw new Error('inDB 설정 저장 기능이 준비되지 않았습니다.');
        await deps.setSettings({ tidyCustomScripts: scripts });
        renderButtons();
        return scripts.slice();
    }

    async function saveSqliteList(nextList) {
        if (!global.MDPStorage || typeof global.MDPStorage.putSqliteSetting !== 'function') {
            throw new Error('SQLite 설정 저장 기능이 준비되지 않았습니다.');
        }
        var status = global.MDPStorage.getStatus ? global.MDPStorage.getStatus() : null;
        if (!status || !status.sqliteHealth || status.sqliteHealth.available !== true
            || !status.sqliteHealth.capabilities || status.sqliteHealth.capabilities.settings !== true) {
            throw new Error('SQLite 설정 저장소에 연결되지 않았습니다.');
        }
        await global.MDPStorage.putSqliteSetting({
            key: SETTINGS_KEY,
            value: normalizeList(nextList),
            group: 'collections',
            scopeType: 'workspace',
            scopeId: 'workspace_default'
        });
    }

    async function saveGithubRecord(record) {
        if (!global.GithubApp || typeof global.GithubApp.upsertTextFile !== 'function') {
            throw new Error('GitHub 파일 저장 기능이 준비되지 않았습니다.');
        }
        return global.GithubApp.upsertTextFile(
            filePath(record),
            serializeGithubFile(record),
            'tidy: save ' + record.name
        );
    }

    async function save(input) {
        var source = input && typeof input === 'object' ? input : {};
        var previous = scripts.find(function (item) { return item.id === source.id; });
        var record = normalizeRecord(source, previous);
        record.updatedAt = new Date().toISOString();
        if (!record.name) throw new Error('기능 이름을 입력하세요.');
        if (!record.code) throw new Error('JavaScript 코드를 입력하거나 업로드하세요.');
        compileTransformer(record.code);

        var requested = source.storage && typeof source.storage === 'object' ? source.storage : {};
        record.mirrors.sqlite = !!requested.sqlite;
        record.mirrors.github = !!requested.github;
        var next = scripts.filter(function (item) { return item.id !== record.id; });
        next.push(record);
        await saveLocalList(next);

        var savedTo = ['inDB'];
        var warnings = [];
        if (requested.sqlite) {
            try {
                await saveSqliteList(next);
                savedTo.push('SQLite');
            } catch (error) {
                warnings.push('SQLite: ' + (error && error.message ? error.message : error));
            }
        }
        if (requested.github) {
            try {
                await saveGithubRecord(record);
                savedTo.push('GitHub');
            } catch (error) {
                warnings.push('GitHub: ' + (error && error.message ? error.message : error));
            }
        }
        return { record: record, savedTo: savedTo, warnings: warnings };
    }

    async function remove(id, options) {
        var targetId = stringValue(id).trim();
        var target = scripts.find(function (item) { return item.id === targetId; });
        if (!target) return { removed: false, warnings: [] };
        var next = scripts.filter(function (item) { return item.id !== targetId; });
        await saveLocalList(next);
        var config = options && typeof options === 'object' ? options : {};
        var warnings = [];
        if (config.sqlite) {
            try { await saveSqliteList(next); } catch (error) {
                warnings.push('SQLite: ' + (error && error.message ? error.message : error));
            }
        }
        if (config.github && global.GithubApp && typeof global.GithubApp.deleteTextFile === 'function') {
            try { await global.GithubApp.deleteTextFile(filePath(target), 'tidy: delete ' + target.name); } catch (error) {
                warnings.push('GitHub: ' + (error && error.message ? error.message : error));
            }
        }
        return { removed: true, warnings: warnings };
    }

    async function importSqlite() {
        if (!global.MDPStorage || typeof global.MDPStorage.getResolvedSqliteSettings !== 'function') {
            throw new Error('SQLite 설정 불러오기 기능이 준비되지 않았습니다.');
        }
        var resolved = await global.MDPStorage.getResolvedSqliteSettings();
        var remote = normalizeList(resolved && resolved.values ? resolved.values[SETTINGS_KEY] : []);
        var merged = mergeLists(scripts, remote);
        await saveLocalList(merged);
        return { imported: remote.length, total: merged.length };
    }

    async function importGithub() {
        if (!global.GithubApp || typeof global.GithubApp.listTextFiles !== 'function'
            || typeof global.GithubApp.readTextFile !== 'function') {
            throw new Error('GitHub 파일 불러오기 기능이 준비되지 않았습니다.');
        }
        var files = await global.GithubApp.listTextFiles(GITHUB_FOLDER, '.js');
        var imported = [];
        for (var i = 0; i < files.length; i += 1) {
            var item = files[i];
            try {
                var content = await global.GithubApp.readTextFile(item.path);
                var parsed = parseGithubFile(content, item.path.split('/').pop());
                compileTransformer(parsed.code);
                parsed.mirrors.github = true;
                imported.push(parsed);
            } catch (error) {
                console.warn('TIDY GitHub script skipped:', item && item.path, error);
            }
        }
        var merged = mergeLists(scripts, imported);
        await saveLocalList(merged);
        return { imported: imported.length, total: merged.length };
    }

    function mergeLists(local, incoming) {
        var map = new Map();
        normalizeList(local).forEach(function (item) { map.set(item.id, item); });
        normalizeList(incoming).forEach(function (item) {
            var current = map.get(item.id);
            if (!current || stringValue(item.updatedAt) >= stringValue(current.updatedAt)) map.set(item.id, item);
        });
        return Array.from(map.values());
    }

    function getStorageStatus() {
        var storageStatus = global.MDPStorage && global.MDPStorage.getStatus ? global.MDPStorage.getStatus() : null;
        var sqliteAvailable = !!(storageStatus && storageStatus.sqliteHealth && storageStatus.sqliteHealth.available
            && storageStatus.sqliteHealth.capabilities && storageStatus.sqliteHealth.capabilities.settings);
        return Promise.resolve(typeof deps.getSettings === 'function' ? deps.getSettings() : {}).then(function (settings) {
            var github = global.GithubApp && typeof global.GithubApp.getGithubConfigFromSettings === 'function'
                ? global.GithubApp.getGithubConfigFromSettings(settings || {})
                : null;
            return {
                sqliteAvailable: sqliteAvailable,
                sqliteBackend: storageStatus && storageStatus.sqliteBackend ? storageStatus.sqliteBackend : '',
                githubAvailable: !!(github && github.enabled && github.token && github.repo && github.branch),
                githubRepo: github && github.repo ? github.repo : '',
                githubBranch: github && github.branch ? github.branch : ''
            };
        });
    }

    function runInWorker(code, source, context) {
        if (typeof Worker !== 'function' || typeof Blob !== 'function' || !global.URL || typeof global.URL.createObjectURL !== 'function') {
            return Promise.resolve().then(function () { return compileTransformer(code)(source, context); });
        }
        return new Promise(function (resolve, reject) {
            var workerSource = ''
                + 'self.onmessage=async function(event){try{'
                + 'var data=event.data||{};var fn=(0,eval)("("+data.code+")");'
                + 'var result=await fn(data.source,Object.freeze(data.context||{}));'
                + 'self.postMessage({ok:true,result:result});'
                + '}catch(error){self.postMessage({ok:false,error:String(error&&error.message?error.message:error)});}};';
            var url = global.URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }));
            var worker = new Worker(url);
            var timer = global.setTimeout(function () {
                worker.terminate();
                global.URL.revokeObjectURL(url);
                reject(new Error('사용자 JS 실행이 10초를 넘어 중단되었습니다.'));
            }, 10000);
            worker.onmessage = function (event) {
                global.clearTimeout(timer);
                worker.terminate();
                global.URL.revokeObjectURL(url);
                var payload = event.data || {};
                if (payload.ok) resolve(payload.result);
                else reject(new Error(payload.error || '사용자 JS 실행 실패'));
            };
            worker.onerror = function (event) {
                global.clearTimeout(timer);
                worker.terminate();
                global.URL.revokeObjectURL(url);
                reject(new Error(event && event.message ? event.message : '사용자 JS Worker 실행 실패'));
            };
            worker.postMessage({ code: code, source: source, context: context });
        });
    }

    async function applyScript(id) {
        if (runBusy) {
            if (typeof deps.showToast === 'function') deps.showToast('사용자 TIDY 기능을 실행하고 있습니다.');
            return;
        }
        var record = scripts.find(function (item) { return item.id === id; });
        var ta = deps.editorTextarea || document.getElementById('viewer-edit-ta');
        if (!record || record.enabled === false) return;
        if (!deps.isEditMode() || !ta) {
            if (typeof deps.showToast === 'function') deps.showToast('편집 모드에서 사용하세요.');
            return;
        }
        if (global.TidyActions && typeof global.TidyActions.closeMenu === 'function') global.TidyActions.closeMenu();
        var start = ta.selectionStart;
        var end = ta.selectionEnd;
        var hasSelection = start !== end;
        var originalText = ta.value;
        var source = hasSelection ? originalText.substring(start, end) : originalText;
        runBusy = true;
        try {
            var result = await runInWorker(record.code, source, {
                hasSelection: hasSelection,
                scope: hasSelection ? 'selection' : 'document',
                scriptId: record.id,
                scriptName: record.name
            });
            var value = typeof result === 'string' ? result : (result && typeof result.value === 'string' ? result.value : null);
            if (value == null) throw new Error('변환 함수는 문자열 또는 { value: 문자열 }을 반환해야 합니다.');
            if (ta.value !== originalText) throw new Error('실행 중 문서가 변경되었습니다. 다시 실행하세요.');
            if (value === source) {
                if (typeof deps.showToast === 'function') deps.showToast(record.name + ': 바꿀 내용이 없습니다.');
                return;
            }
            var actionDeps = typeof deps.getActionDeps === 'function' ? deps.getActionDeps() : deps;
            global.TidyActions.applyResultToEditor({ value: value }, source, actionDeps);
            var message = result && typeof result === 'object' && result.message ? stringValue(result.message) : '';
            if (typeof deps.showToast === 'function') deps.showToast(message || (record.name + ' 적용 완료'));
        } catch (error) {
            if (typeof deps.showToast === 'function') deps.showToast(record.name + ' 실패: ' + (error && error.message ? error.message : error));
        } finally {
            runBusy = false;
        }
    }

    function openManager() {
        if (global.TidyActions && typeof global.TidyActions.closeMenu === 'function') global.TidyActions.closeMenu();
        var popup = global.open(managerUrl, 'mdviewer-tidy-script-manager', 'width=1100,height=760,resizable=yes,scrollbars=yes');
        if (!popup && typeof deps.showToast === 'function') deps.showToast('팝업이 차단되었습니다. 이 사이트의 팝업을 허용하세요.');
        if (popup) popup.focus();
        return !!popup;
    }

    function configure(options) {
        deps = Object.assign({}, deps, options || {});
        configured = true;
        return refresh();
    }

    global.TidyScriptManager = {
        configure: configure,
        refresh: refresh,
        openManager: openManager,
        applyScript: applyScript,
        compileTransformer: compileTransformer,
        serializeGithubFile: serializeGithubFile,
        parseGithubFile: parseGithubFile
    };
    global.TidyScriptManagerBridge = {
        list: function () { return refresh(); },
        save: save,
        remove: remove,
        importSqlite: importSqlite,
        importGithub: importGithub,
        parseUpload: parseGithubFile,
        getStorageStatus: getStorageStatus
    };
})(window);
