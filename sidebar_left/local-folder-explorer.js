(function () {
    'use strict';

    const HANDLE_DB_NAME = 'md-viewer-local-folder';
    const HANDLE_STORE_NAME = 'handles';
    const HANDLE_KEY = 'active-root';
    const SEARCH_ENTRY_LIMIT = 5000;
    const SEARCH_DEPTH_LIMIT = 24;

    let rootHandle = null;
    let rootNode = null;
    let fallbackMode = false;
    let restorePromise = null;
    let searchWasTruncated = false;

    function notify(message) {
        if (typeof window.showToast === 'function') window.showToast(message);
    }

    function requestRender() {
        if (typeof window.renderDBList === 'function') window.renderDBList();
    }

    function compareNodes(a, b) {
        if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1;
        return String(a.name || '').localeCompare(String(b.name || ''), 'ko', {
            numeric: true,
            sensitivity: 'base'
        });
    }

    function makeNode(name, kind, handle, parent, file) {
        const parentPath = parent && parent.path ? parent.path : '';
        const path = parentPath ? parentPath + '/' + name : name;
        return {
            name: String(name || ''),
            kind: kind === 'directory' ? 'directory' : 'file',
            handle: handle || null,
            file: file || null,
            parent: parent || null,
            path: path,
            children: [],
            loaded: kind !== 'directory',
            expanded: false,
            error: ''
        };
    }

    function openHandleDb() {
        return new Promise(function (resolve, reject) {
            if (!window.indexedDB) {
                resolve(null);
                return;
            }
            const request = indexedDB.open(HANDLE_DB_NAME, 1);
            request.onupgradeneeded = function () {
                const database = request.result;
                if (!database.objectStoreNames.contains(HANDLE_STORE_NAME)) {
                    database.createObjectStore(HANDLE_STORE_NAME);
                }
            };
            request.onsuccess = function () { resolve(request.result); };
            request.onerror = function () { reject(request.error); };
        });
    }

    async function readSavedHandle() {
        const database = await openHandleDb();
        if (!database) return null;
        return new Promise(function (resolve) {
            const request = database.transaction(HANDLE_STORE_NAME, 'readonly')
                .objectStore(HANDLE_STORE_NAME).get(HANDLE_KEY);
            request.onsuccess = function () { resolve(request.result || null); };
            request.onerror = function () { resolve(null); };
        });
    }

    async function saveHandle(handle) {
        try {
            const database = await openHandleDb();
            if (!database) return;
            await new Promise(function (resolve, reject) {
                const tx = database.transaction(HANDLE_STORE_NAME, 'readwrite');
                tx.objectStore(HANDLE_STORE_NAME).put(handle, HANDLE_KEY);
                tx.oncomplete = resolve;
                tx.onerror = function () { reject(tx.error); };
            });
        } catch (_) {
            // Some Chromium shells do not allow handle structured cloning.
        }
    }

    async function getPermission(handle, requestAccess, mode) {
        if (!handle) return 'denied';
        const permissionMode = mode === 'readwrite' ? 'readwrite' : 'read';
        try {
            let state = await handle.queryPermission({ mode: permissionMode });
            if (state === 'prompt' && requestAccess && typeof handle.requestPermission === 'function') {
                state = await handle.requestPermission({ mode: permissionMode });
            }
            return state;
        } catch (_) {
            return 'denied';
        }
    }

    async function readChildren(node) {
        if (!node || node.kind !== 'directory' || node.loaded || !node.handle) return node ? node.children : [];
        const children = [];
        try {
            for await (const entry of node.handle.values()) {
                children.push(makeNode(entry.name, entry.kind, entry, node, null));
            }
            children.sort(compareNodes);
            node.children = children;
            node.loaded = true;
            node.error = '';
        } catch (error) {
            node.loaded = true;
            node.error = error && error.message ? error.message : '폴더를 읽을 수 없습니다.';
        }
        return node.children;
    }

    async function installRootHandle(handle) {
        rootHandle = handle;
        fallbackMode = false;
        rootNode = makeNode(handle.name || '로컬 폴더', 'directory', handle, null, null);
        rootNode.expanded = true;
        await readChildren(rootNode);
    }

    async function restoreSavedHandle(requestAccess) {
        if (rootNode) return true;
        try {
            const saved = await readSavedHandle();
            if (!saved) return false;
            const permission = await getPermission(saved, !!requestAccess);
            if (permission !== 'granted') return false;
            await installRootHandle(saved);
            return true;
        } catch (_) {
            return false;
        }
    }

    function ensureRestored(requestAccess) {
        if (rootNode) return Promise.resolve(true);
        if (!restorePromise || requestAccess) restorePromise = restoreSavedHandle(!!requestAccess);
        return restorePromise;
    }

    function pickFallbackFolder() {
        return new Promise(function (resolve) {
            const input = document.createElement('input');
            input.type = 'file';
            input.multiple = true;
            input.setAttribute('webkitdirectory', '');
            input.setAttribute('directory', '');
            input.className = 'hidden';
            document.body.appendChild(input);
            let settled = false;
            const finish = function (value) {
                if (settled) return;
                settled = true;
                input.remove();
                resolve(value);
            };
            input.addEventListener('change', function () {
                const files = Array.from(input.files || []);
                if (!files.length) {
                    finish(false);
                    return;
                }
                buildFallbackTree(files);
                finish(true);
            }, { once: true });
            input.addEventListener('cancel', function () { finish(false); }, { once: true });
            input.click();
        });
    }

    function buildFallbackTree(files) {
        const firstPath = String(files[0] && files[0].webkitRelativePath || files[0].name || '로컬 폴더');
        const rootName = firstPath.split('/').filter(Boolean)[0] || '로컬 폴더';
        rootHandle = null;
        fallbackMode = true;
        rootNode = makeNode(rootName, 'directory', null, null, null);
        rootNode.loaded = true;
        rootNode.expanded = true;

        files.forEach(function (file) {
            const fullParts = String(file.webkitRelativePath || file.name || '').split('/').filter(Boolean);
            const parts = fullParts[0] === rootName ? fullParts.slice(1) : fullParts;
            let parent = rootNode;
            parts.slice(0, -1).forEach(function (folderName) {
                let folder = parent.children.find(function (item) {
                    return item.kind === 'directory' && item.name === folderName;
                });
                if (!folder) {
                    folder = makeNode(folderName, 'directory', null, parent, null);
                    folder.loaded = true;
                    parent.children.push(folder);
                }
                parent = folder;
            });
            const fileName = parts[parts.length - 1] || file.name;
            parent.children.push(makeNode(fileName, 'file', null, parent, file));
        });

        (function sortTree(node) {
            node.children.sort(compareNodes);
            node.children.filter(function (child) { return child.kind === 'directory'; }).forEach(sortTree);
        })(rootNode);
    }

    async function chooseFolder() {
        try {
            if (typeof window.showDirectoryPicker === 'function') {
                const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
                await installRootHandle(handle);
                await saveHandle(handle);
                notify('로컬 폴더를 열었습니다: ' + rootNode.name);
                requestRender();
                return true;
            }
            const picked = await pickFallbackFolder();
            if (picked) {
                notify('로컬 폴더를 열었습니다: ' + rootNode.name);
                requestRender();
            }
            return picked;
        } catch (error) {
            if (error && error.name === 'AbortError') return false;
            notify('로컬 폴더를 열 수 없습니다: ' + (error && error.message ? error.message : error));
            return false;
        }
    }

    async function activate(options) {
        const opts = options || {};
        await ensureRestored(true);
        if (rootNode) return true;
        return opts.pickIfNeeded === false ? false : chooseFolder();
    }

    async function refresh() {
        if (!rootNode) return chooseFolder();
        if (fallbackMode) {
            notify('폴더를 다시 선택하면 최신 파일 목록을 불러옵니다.');
            return chooseFolder();
        }
        const permission = await getPermission(rootHandle, true);
        if (permission !== 'granted') {
            notify('폴더 읽기 권한이 필요합니다.');
            return false;
        }
        rootNode.loaded = false;
        rootNode.children = [];
        await readChildren(rootNode);
        requestRender();
        if (typeof window.refreshCurrentLocalFileFromDisk === 'function') {
            await window.refreshCurrentLocalFileFromDisk();
        }
        return true;
    }

    async function scanForSearch(node, counter, depth) {
        if (!node || node.kind !== 'directory') return;
        if (counter.count >= SEARCH_ENTRY_LIMIT || depth > SEARCH_DEPTH_LIMIT) {
            searchWasTruncated = true;
            return;
        }
        await readChildren(node);
        for (let i = 0; i < node.children.length; i += 1) {
            counter.count += 1;
            if (counter.count >= SEARCH_ENTRY_LIMIT) {
                searchWasTruncated = true;
                return;
            }
            if (node.children[i].kind === 'directory') {
                await scanForSearch(node.children[i], counter, depth + 1);
            }
        }
    }

    function nodeMatchesSearch(node, query) {
        if (!query) return true;
        if (String(node.name || '').toLocaleLowerCase().includes(query)) return true;
        return node.kind === 'directory' && node.children.some(function (child) {
            return nodeMatchesSearch(child, query);
        });
    }

    function iconForFile(name) {
        const extension = String(name || '').toLowerCase().split('.').pop();
        if (['md', 'mdown', 'markdown', 'txt'].includes(extension)) return 'file-text';
        if (['html', 'htm', 'css', 'js', 'json', 'xml', 'csv'].includes(extension)) return 'file-code-2';
        if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico', 'avif'].includes(extension)) return 'file-image';
        if (extension === 'pdf') return 'file-type-2';
        return 'file';
    }

    async function openNodeFile(node, button) {
        if (!node || node.kind !== 'file') return;
        if (button) button.classList.add('opacity-50');
        try {
            const file = node.file || (node.handle && await node.handle.getFile());
            if (!file) throw new Error('파일을 읽을 수 없습니다.');
            if (typeof window.openFileFromLocalFolderExplorer !== 'function') {
                throw new Error('문서 열기 기능이 준비되지 않았습니다.');
            }
            await window.openFileFromLocalFolderExplorer(file, node.path, node.handle);
        } catch (error) {
            notify('파일을 열 수 없습니다: ' + (error && error.message ? error.message : error));
        } finally {
            if (button) button.classList.remove('opacity-50');
        }
    }

    function makeIcon(name, className) {
        const icon = document.createElement('i');
        icon.setAttribute('data-lucide', name);
        icon.className = className || 'h-4 w-4 shrink-0';
        return icon;
    }

    function renderTreeNode(node, depth, container, query) {
        if (!nodeMatchesSearch(node, query)) return;
        const row = document.createElement('div');
        row.className = 'group flex min-w-0 items-center gap-1 rounded px-1 py-1 text-xs text-slate-700 hover:bg-slate-200 dark:text-slate-200 dark:hover:bg-slate-800';
        row.style.paddingLeft = Math.min(12 + depth * 14, 180) + 'px';
        row.dataset.localFolderPath = node.path;

        if (node.kind === 'directory') {
            const toggle = document.createElement('button');
            toggle.type = 'button';
            toggle.className = 'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded hover:bg-slate-300 dark:hover:bg-slate-700';
            const expanded = query ? true : node.expanded;
            toggle.title = expanded ? '폴더 접기' : '폴더 펼치기';
            toggle.appendChild(makeIcon(expanded ? 'chevron-down' : 'chevron-right', 'h-3.5 w-3.5'));
            toggle.onclick = async function () {
                node.expanded = !node.expanded;
                if (node.expanded) await readChildren(node);
                requestRender();
            };
            row.appendChild(toggle);
            row.appendChild(makeIcon(expanded ? 'folder-open' : 'folder', 'h-4 w-4 shrink-0 text-amber-500'));
            const label = document.createElement('span');
            label.className = 'min-w-0 flex-1 truncate font-semibold';
            label.textContent = node.name;
            label.title = node.path;
            label.ondblclick = function () { toggle.click(); };
            row.appendChild(label);
            container.appendChild(row);

            if (node.error) {
                const error = document.createElement('div');
                error.className = 'py-1 pr-2 text-[10px] text-red-500';
                error.style.paddingLeft = Math.min(42 + depth * 14, 210) + 'px';
                error.textContent = node.error;
                container.appendChild(error);
            }
            if (expanded && node.loaded && !node.children.length && !node.error) {
                const empty = document.createElement('div');
                empty.className = 'py-1 pr-2 text-[10px] italic text-slate-400';
                empty.style.paddingLeft = Math.min(42 + depth * 14, 210) + 'px';
                empty.textContent = '빈 폴더';
                container.appendChild(empty);
            }
            if (expanded) node.children.forEach(function (child) {
                renderTreeNode(child, depth + 1, container, query);
            });
            return;
        }

        const spacer = document.createElement('span');
        spacer.className = 'inline-block h-5 w-5 shrink-0';
        row.appendChild(spacer);
        row.appendChild(makeIcon(iconForFile(node.name), 'h-4 w-4 shrink-0 text-sky-500'));
        const fileButton = document.createElement('button');
        fileButton.type = 'button';
        fileButton.className = 'min-w-0 flex-1 truncate text-left';
        fileButton.textContent = node.name;
        fileButton.title = '열기: ' + node.path;
        fileButton.onclick = function () { openNodeFile(node, fileButton); };
        row.appendChild(fileButton);
        container.appendChild(row);
    }

    function renderEmpty(container) {
        const wrap = document.createElement('div');
        wrap.className = 'flex flex-col items-center gap-3 px-4 py-10 text-center';
        wrap.appendChild(makeIcon('folder-open', 'h-10 w-10 text-amber-500'));
        const title = document.createElement('p');
        title.className = 'text-sm font-bold text-slate-700 dark:text-slate-200';
        title.textContent = '로컬 폴더 열기';
        wrap.appendChild(title);
        const detail = document.createElement('p');
        detail.className = 'text-[11px] leading-relaxed text-slate-500 dark:text-slate-400';
        detail.textContent = '내 컴퓨터의 폴더를 선택하면 이곳에 탐색기 형태로 표시됩니다.';
        wrap.appendChild(detail);
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'rounded-md bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700';
        button.textContent = '폴더 선택';
        button.onclick = chooseFolder;
        wrap.appendChild(button);
        container.appendChild(wrap);
    }

    async function render(container, searchTerm) {
        if (!container) return;
        await ensureRestored(false);
        if (!rootNode) {
            renderEmpty(container);
            return;
        }

        const query = String(searchTerm || '').trim().toLocaleLowerCase();
        searchWasTruncated = false;
        if (query) await scanForSearch(rootNode, { count: 0 }, 0);

        const header = document.createElement('div');
        header.className = 'sticky top-0 z-10 mb-1 flex items-center gap-1 border-b border-slate-200 bg-slate-100 px-2 py-2 dark:border-slate-700 dark:bg-slate-900';
        header.appendChild(makeIcon('hard-drive', 'h-4 w-4 shrink-0 text-indigo-500'));
        const title = document.createElement('strong');
        title.className = 'min-w-0 flex-1 truncate text-xs text-slate-700 dark:text-slate-200';
        title.textContent = rootNode.name;
        title.title = rootNode.name;
        header.appendChild(title);

        const refreshButton = document.createElement('button');
        refreshButton.type = 'button';
        refreshButton.className = 'inline-flex h-7 w-7 items-center justify-center rounded hover:bg-slate-200 dark:hover:bg-slate-700';
        refreshButton.title = '새로고침';
        refreshButton.appendChild(makeIcon('refresh-cw', 'h-3.5 w-3.5'));
        refreshButton.onclick = refresh;
        header.appendChild(refreshButton);

        const changeButton = document.createElement('button');
        changeButton.type = 'button';
        changeButton.className = 'rounded border border-slate-300 px-2 py-1 text-[10px] font-semibold hover:bg-slate-200 dark:border-slate-600 dark:hover:bg-slate-700';
        changeButton.textContent = '변경';
        changeButton.title = '다른 로컬 폴더 선택';
        changeButton.onclick = chooseFolder;
        header.appendChild(changeButton);
        container.appendChild(header);

        const tree = document.createElement('div');
        tree.className = 'pb-2';
        rootNode.children.forEach(function (child) { renderTreeNode(child, 0, tree, query); });
        if (!tree.childNodes.length) {
            const empty = document.createElement('div');
            empty.className = 'px-3 py-8 text-center text-xs text-slate-500 dark:text-slate-400';
            empty.textContent = query ? '검색 결과가 없습니다.' : '이 폴더는 비어 있습니다.';
            tree.appendChild(empty);
        }
        container.appendChild(tree);

        if (searchWasTruncated) {
            const status = document.createElement('div');
            status.className = 'border-t border-amber-200 px-3 py-2 text-[10px] text-amber-700 dark:border-amber-900 dark:text-amber-300';
            status.textContent = '검색 범위가 커서 처음 ' + SEARCH_ENTRY_LIMIT + '개 항목만 확인했습니다.';
            container.appendChild(status);
        }
    }

    window.LocalFolderExplorer = {
        activate: activate,
        chooseFolder: chooseFolder,
        refresh: refresh,
        render: render,
        getRootName: function () { return rootNode ? rootNode.name : ''; },
        getRootHandle: function () { return rootHandle || null; },
        hasFolder: function () { return !!rootNode; }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { ensureRestored(false); }, { once: true });
    } else {
        ensureRestored(false);
    }
})();
