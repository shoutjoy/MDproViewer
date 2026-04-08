/* FM ??File Manager (el, GH, TM, LocalFS, DelConfirm ?섏〈) */

/* ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧??   FM ??File Manager  (?대뜑 ?좏깮 ???뚯씪 紐⑸줉 ?????닿린)
   File System Access API ?ъ슜 (Chrome/Edge 吏??
   Safari쨌Firefox: 誘몄??????뚯씪 媛쒕퀎 ?좏깮 ?대갚
?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧??*/
/* ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧??   FM ??File Manager
   ? File System Access API (Chrome/Edge 86+)
   ? FileSystemDirectoryHandle ??IndexedDB ??μ쑝濡??몄뀡 媛??곸냽
   ? ???ъ떆???? IDB 蹂듭썝 ??requestPermission ???먮룞 濡쒕뱶
   ? Firefox/Safari: ?섎룞 ?좏깮 ?대갚
?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧??*/
/* ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧??   FM ??File Manager  v3  (IDB ?뚯씪 ?댁슜 罹먯떆 諛⑹떇)

   釉뚮씪?곗? 蹂댁븞 ?쒖빟:
   - FileSystemDirectoryHandle? ???ъ떆????permission 由ъ뀑
   - requestPermission()? ?ъ슜???대┃ ?놁씠 ?몄텧 遺덇?
   ???닿껐: ?뚯씪 紐⑸줉 + ?댁슜??IDB??吏곸젒 罹먯떆
            ?ъ떆????罹먯떆濡?利됱떆 蹂듭썝, ?ㅼ젣 ?뚯씪 ?숆린?붾뒗 ?대┃ ??踰?
   IDB ?ㅽ궎留?
   - DB: 'mdpro-fm-v3'
   - store 'meta'  : key='root' ??{folderName, fileCount, syncedAt}
   - store 'files' : key=?곷?寃쎈줈 ??{name, ext, folder, path, content, modified}
?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧??*/

/* GH ??js/github/api.js, history.js, sync.js */

const FM = (() => {
    /* ?? IDB ????????????????????????????????????????????? */
    const DB_NAME = 'mdpro-fm-v3';
    const DB_VER  = 1;
    let _db       = null;
    let _subHandles    = {};  /* path ??FileSystemDirectoryHandle */
    let _currentSubDir = null; /* ?꾩옱 ?먯깋 以묒씤 ?섏쐞 ?대뜑 寃쎈줈 */

    function _getDB() {
        if (_db) return Promise.resolve(_db);
        return new Promise((res, rej) => {
            const req = indexedDB.open(DB_NAME, DB_VER);
            req.onupgradeneeded = ev => {
                const db = ev.target.result;
                if (!db.objectStoreNames.contains('meta'))  db.createObjectStore('meta');
                if (!db.objectStoreNames.contains('files')) db.createObjectStore('files');
            };
            req.onsuccess = ev => { _db = ev.target.result; res(_db); };
            req.onerror   = ev => rej(ev.target.error);
        });
    }

    /* IDB ?⑥씪 ???쎄린 */
    async function _idbGet(store, key) {
        const db = await _getDB();
        return new Promise((res, rej) => {
            const req = db.transaction(store, 'readonly').objectStore(store).get(key);
            req.onsuccess = ev => res(ev.target.result ?? null);
            req.onerror   = ev => rej(ev.target.error);
        });
    }

    /* IDB ?꾩껜 ?ㅒ룰컪 ?쎄린 */
    async function _idbAll(store) {
        const db = await _getDB();
        return new Promise((res, rej) => {
            const results = [];
            const req = db.transaction(store, 'readonly').objectStore(store).openCursor();
            req.onsuccess = ev => {
                const cur = ev.target.result;
                if (cur) { results.push(cur.value); cur.continue(); }
                else res(results);
            };
            req.onerror = ev => rej(ev.target.error);
        });
    }

    /* IDB ?곌린 */
    async function _idbPut(store, key, val) {
        const db = await _getDB();
        return new Promise((res, rej) => {
            const req = db.transaction(store, 'readwrite').objectStore(store).put(val, key);
            req.onsuccess = () => res();
            req.onerror   = ev => rej(ev.target.error);
        });
    }

    /* IDB ?꾩껜 ??젣 */
    async function _idbClearStore(store) {
        const db = await _getDB();
        return new Promise((res, rej) => {
            const req = db.transaction(store, 'readwrite').objectStore(store).clear();
            req.onsuccess = () => res();
            req.onerror   = ev => rej(ev.target.error);
        });
    }

    async function _idbDel(store, key) {
        const db = await _getDB();
        return new Promise((res, rej) => {
            const req = db.transaction(store, 'readwrite').objectStore(store).delete(key);
            req.onsuccess = () => res();
            req.onerror   = ev => rej(ev.target.error);
        });
    }

    /* ?? ?곹깭 ??????????????????????????????????????????? */
    const hasAPI   = () => 'showDirectoryPicker' in window;
    let dirHandle  = null;   // FileSystemDirectoryHandle (?몄뀡 以묒뿉留??좏슚)
    let allFiles   = [];     // ?꾩옱 ?쒖떆 以묒씤 ?뚯씪 紐⑸줉
    let filtered   = [];
    let activeFile = null;
    let folderName = '';     // ?대뜑 ?대쫫 (?쒖떆??
    let _searchQuery = '';   // 寃?됱뼱 (search input)
    const FM_SHOW_HIDDEN_KEY = 'fm_show_hidden';
    let showHiddenFiles = localStorage.getItem(FM_SHOW_HIDDEN_KEY) === 'on';  /* ?뷀뤃?? ?④? */

    function _isPathHidden(path) {
        return path.split('/').some(seg => seg.startsWith('.'));
    }
    function _applyFilters() {
        let base = showHiddenFiles ? allFiles : allFiles.filter(f => !_isPathHidden(f.path));
        filtered = _searchQuery
            ? base.filter(f => f.name.toLowerCase().includes(_searchQuery.toLowerCase()))
            : base;
    }

    /* ?? ???쒖옉: IDB 罹먯떆?먯꽌 利됱떆 蹂듭썝 ??????????????
       ?몃뱾 ?놁씠??罹먯떆??紐⑸줉/?댁슜?쇰줈 ?뚯씪 ??梨꾩?     */
    async function restore() {
        try {
            showHiddenFiles = localStorage.getItem(FM_SHOW_HIDDEN_KEY) === 'on';
            const meta = await _idbGet('meta', 'root');
            if (!meta) return;
            folderName = meta.folderName;
            const cached = await _idbAll('files');
            if (!cached.length) return;
            allFiles   = cached;
            _applyFilters();
            /* DOM???꾩쟾??以鍮꾨맂 ??UI ?낅뜲?댄듃 */
            setTimeout(() => {
                _setFolderUI(folderName, false);
                _render();
            }, 0);
        } catch (e) {
            console.warn('FM.restore:', e);
        }
    }

    /* ?? ?대뜑 ?좏깮 ??????????????????????????????????????? */
    async function selectFolder() {
        if (!hasAPI()) { _noAPIFallback(); return; }
        try {
            const h = await window.showDirectoryPicker({ mode: 'readwrite' });
            dirHandle = h;
            folderName = h.name;
            _setFolderUI(folderName, 'syncing');
            await _syncFromHandle();                // ?뚯씪 ?쎄린 + IDB 罹먯떆 ???            _setFolderUI(folderName, true);
        } catch (e) {
            if (e.name !== 'AbortError') console.warn('FM.selectFolder:', e);
        }
    }

    /* ?? ?ㅼ젣 ?뚯씪 ?쒖뒪????IDB ?꾩껜 ?숆린???????????????
       dirHandle???쒖꽦(permission granted)???뚮쭔 ?몄텧   */
    async function _syncFromHandle() {
        if (!dirHandle) return;
        const fresh = [];
        _emptyFolders = {};  /* 鍮??대뜑 紐⑸줉 珥덇린??*/
        await _scanDir(dirHandle, '', 0, fresh);
        allFiles = fresh;
        _applyFilters();
        /* IDB 罹먯떆 ???*/
        await _idbClearStore('files');
        const db = await _getDB();
        await new Promise((res, rej) => {
            const tx = db.transaction('files', 'readwrite');
            const st = tx.objectStore('files');
            fresh.forEach(f => st.put(f, f.path));
            tx.oncomplete = res;
            tx.onerror    = ev => rej(ev.target.error);
        });
        await _idbPut('meta', 'root', {
            folderName,
            fileCount: fresh.length,
            syncedAt: Date.now()
        });
        _render();
    }

    /* 鍮??대뜑??異붿쟻 (?대뜑寃쎈줈 ??true) */
    let _emptyFolders = {};

    /* ?? ?붾젆?곕━ ?ш? ?ㅼ틪 ?????????????????????????????? */
    async function _scanDir(handle, prefix, depth, out) {
        if (depth > 4) return;
        let hasChildren = false;
        for await (const entry of handle.values()) {
            hasChildren = true;
            if (entry.kind === 'directory') {
                const subPath = prefix ? `${prefix}/${entry.name}` : entry.name;
                _subHandles[subPath] = entry;   /* ?섏쐞 ?대뜑 ?몃뱾 ???*/
                await _scanDir(entry, subPath, depth + 1, out);
            } else if (entry.kind === 'file') {
                const ext = entry.name.split('.').pop().toLowerCase();
                if (!['md','txt','html'].includes(ext)) continue;
                try {
                    const file    = await entry.getFile();
                    const content = await file.text();
                    out.push({
                        name    : entry.name,
                        ext,
                        folder  : prefix || '/',
                        path    : prefix ? `${prefix}/${entry.name}` : entry.name,
                        content,
                        modified: file.lastModified,
                    });
                } catch(e) { /* ?쎄린 ?ㅽ뙣 ?뚯씪 ?ㅽ궢 */ }
            }
        }
        /* ???대뜑??md/txt/html ?뚯씪???녾퀬 ?섏쐞???놁쑝硫?鍮??대뜑濡?湲곕줉 */
        if (prefix) {
            const hasFiles = out.some(f => f.folder === prefix || f.path.startsWith(prefix + '/'));
            if (!hasFiles) _emptyFolders[prefix] = true;
        }
    }

    /* ?? ?덈줈怨좎묠: ?대뜑 ?ъ뿰寃?or 罹먯떆 ?щ줈????????????? */
    async function refresh() {
        /* dirHandle???덉쑝硫??ㅼ떆媛??숆린???쒕룄 */
        if (dirHandle) {
            try {
                const perm = await dirHandle.queryPermission({ mode: 'read' });
                if (perm === 'granted') {
                    _setFolderUI(folderName, 'syncing');
                    await _syncFromHandle();
                    _setFolderUI(folderName, true);
                    return;
                }
            } catch(e) {}
        }
        /* 沅뚰븳 ?놁쓬 ???대뜑 ?좏깮 ?ㅼ씠?쇰줈洹?*/
        await selectFolder();
    }

    /* ?? ?대뜑 蹂寃????????????????????????????????????????? */
    async function changeFolder() {
        dirHandle  = null;
        allFiles   = [];
        filtered   = [];
        folderName = '';
        _searchQuery = '';
        const searchInput = document.getElementById('files-search-input');
        if (searchInput) searchInput.value = '';
        await _idbClearStore('files');
        await _idbClearStore('meta');
        _render();
        await selectFolder();
    }

    /* ?? UI ?ㅻ뜑 ?곹깭 ?쒖떆 ?????????????????????????????? */
    function _setFolderUI(name, state) {
        /* state: true(?곌껐?? | false(罹먯떆,?ㅽ봽?쇱씤) | 'syncing' */
        const nameEl  = document.getElementById('files-folder-name');
        const selBtn  = document.getElementById('files-folder-btn');
        const refBtn  = document.getElementById('files-refresh-btn');
        const syncBar = document.getElementById('fm-sync-bar');
        if (syncBar) syncBar.style.display = (name && state !== 'syncing') ? '' : 'none';

        if (nameEl) {
            if (state === 'syncing') {
                nameEl.textContent = `???숆린??以묅?;
                nameEl.style.color = 'var(--tx3)';
            } else if (state === true) {
                nameEl.textContent = `${name}  (${allFiles.length}媛?`;
                nameEl.style.color = 'var(--tx2)';
            } else {
                /* 罹먯떆 紐⑤뱶 */
                nameEl.innerHTML =
                    `<span style="color:var(--tx3);font-size:9px">?벀 罹먯떆</span> ${_esc(name)}`;
                nameEl.style.color = 'var(--tx3)';
            }
        }
        if (selBtn) {
            selBtn.textContent = (state !== false) ? '??蹂寃? : '?봽 ?ъ뿰寃?;
            selBtn.onclick     = (state !== false) ? changeFolder : refresh;
            selBtn.title       = (state === false)
                ? '?대뜑瑜??ㅼ떆 ?좏깮?섏뿬 理쒖떊 ?뚯씪???숆린?뷀빀?덈떎'
                : '?ㅻⅨ ?대뜑濡?蹂寃?;
        }
        if (refBtn) refBtn.style.display = (state === true) ? '' : 'none';
        const openBtn = document.getElementById('files-open-btn');
        const foldBtn = document.getElementById('files-fold-toggle-btn');
        const hiddenBtn = document.getElementById('files-hidden-toggle-btn');
        if (openBtn) openBtn.style.display = (state === true && name) ? '' : 'none';
        if (foldBtn) foldBtn.style.display = (name && allFiles.length > 0) ? '' : 'none';
        if (hiddenBtn) {
            hiddenBtn.style.display = (state === true && name) ? '' : 'none';
            hiddenBtn.title = showHiddenFiles ? '?④? ?뚯씪 ?④린湲?(.git ??' : '?④? ?뚯씪 ?쒖떆 (.git ??';
            hiddenBtn.classList.toggle('active', showHiddenFiles);
        }
    }

    /* ?? 寃????????????????????????????????????????????? */
    function search(q) {
        _searchQuery = (q && q.trim()) ? q.trim() : '';
        _applyFilters();
        _render();
    }

    /* ?? ?④? ?뚯씪 ?쒖떆 ?좉? ????????????????????????????? */
    function toggleShowHidden() {
        showHiddenFiles = !showHiddenFiles;
        localStorage.setItem(FM_SHOW_HIDDEN_KEY, showHiddenFiles ? 'on' : 'off');
        _applyFilters();
        _setFolderUI(folderName, !!dirHandle);
        _render();
    }

    /* ?? ?꾩껜 ?대뜑 ?묎린/?쇱튂湲??좉? ????????????????????? */
    const FM_LOCKED_FOLDERS_KEY = 'mdpro_fm_locked_folders';
    function _getLockedFolders() {
        try {
            const raw = localStorage.getItem(FM_LOCKED_FOLDERS_KEY);
            const arr = raw ? JSON.parse(raw) : [];
            return new Set(Array.isArray(arr) ? arr : []);
        } catch (e) { return new Set(); }
    }
    function _setLockedFolders(set) {
        try { localStorage.setItem(FM_LOCKED_FOLDERS_KEY, JSON.stringify([...set])); } catch (e) {}
    }

    function toggleFoldAll() {
        const list = document.getElementById('files-list');
        if (!list) return;
        const folders = list.querySelectorAll('.ft-folder');
        if (!folders.length) return;
        const lockedSet = _getLockedFolders();
        const anyExpanded = Array.from(folders).some(f => !f.classList.contains('collapsed'));
        const collapse = anyExpanded;
        folders.forEach(f => {
            const path = f.dataset.path;
            if (!collapse && path && lockedSet.has(path)) return;
            const hdr = f.querySelector('.ft-folder-hdr');
            const toggle = hdr && hdr.querySelector('.ft-toggle');
            const isEmpty = toggle && toggle.textContent === '??;
            if (collapse) {
                f.classList.add('collapsed');
                if (toggle && !isEmpty) toggle.textContent = '??;
            } else {
                f.classList.remove('collapsed');
                if (toggle && !isEmpty) toggle.textContent = '??;
            }
        });
        const foldBtn = document.getElementById('files-fold-toggle-btn');
        if (foldBtn) foldBtn.textContent = collapse ? '?? : '??;
    }

    /* ?? ?뚯씪 紐⑸줉 ?뚮뜑留?(?몃━ 援ъ“) ??????????????????? */
    function _render() {
        const list = document.getElementById('files-list');
        if (!list) return;
        list.innerHTML = '';

        if (!allFiles.length) {
            list.innerHTML =
                '<div class="files-empty">' +
                '<div style="font-size:28px;margin-bottom:8px">?뱚</div>' +
                '<div style="font-weight:600;margin-bottom:6px">?대뜑瑜??좏깮?섏꽭??/div>' +
                '<div style="color:var(--tx3);font-size:10px;line-height:1.7">.md / .txt / .html ?뚯씪<br>?섏쐞 ?대뜑源뚯? ?몃━濡??먯깋<br>?댁슜??罹먯떆?섏뼱 ?ъ떆???꾩뿉??br>利됱떆 ?????덉뒿?덈떎</div>' +
                '</div>';
            return;
        }

        const src = filtered;
        if (!src.length) {
            list.innerHTML = '<div class="files-empty">寃??寃곌낵 ?놁쓬</div>';
            return;
        }

        /* ?? ?몃━ ?몃뱶 鍮뚮뱶 ?? */
        /* node: { name, children:{}, files:[] }  */
        const root = { name: '', children: {}, files: [] };

        src.forEach(f => {
            const parts = f.path.split('/');
            let node = root;
            for (let i = 0; i < parts.length - 1; i++) {
                const seg = parts[i];
                if (!node.children[seg]) node.children[seg] = { name: seg, children: {}, files: [] };
                node = node.children[seg];
            }
            node.files.push(f);
        });

        /* 鍮??대뜑(_emptyFolders)???몃━??異붽? (?④? 寃쎈줈 ?쒖쇅) */
        const emptyFoldersToAdd = showHiddenFiles
            ? Object.keys(_emptyFolders)
            : Object.keys(_emptyFolders).filter(p => !_isPathHidden(p));
        emptyFoldersToAdd.sort().forEach(folderPath => {
            const parts = folderPath.split('/');
            let node = root;
            for (let i = 0; i < parts.length; i++) {
                const seg = parts[i];
                if (!node.children[seg]) node.children[seg] = { name: seg, children: {}, files: [], _fullPath: parts.slice(0, i+1).join('/') };
                node = node.children[seg];
            }
        });

        /* ?몃━ ?몃뱶瑜?DOM?쇰줈 ?뚮뜑 */
        function renderNode(node, depth, container) {
            const indent = depth * 12;

            /* ?섏쐞 ?대뜑 癒쇱? (?뚰뙆踰??? */
            Object.keys(node.children).sort().forEach(folderName => {
                const child = node.children[folderName];
                /* _fullPath 蹂댁옣 ???몃━ 鍮뚮뱶 ???꾨씫??寃쎌슦 遺紐?寃쎈줈濡?怨꾩궛 */
                if (!child._fullPath) {
                    child._fullPath = node._fullPath
                        ? node._fullPath + '/' + folderName
                        : folderName;
                }
                const totalFiles = countFiles(child);
                const isEmpty = totalFiles === 0;

                const folderEl = document.createElement('div');
                folderEl.className = 'ft-folder';
                folderEl.dataset.path = child._fullPath;

                const hdr = document.createElement('div');
                hdr.className = 'ft-folder-hdr';
                hdr.style.paddingLeft = (8 + indent) + 'px';
                const folderPath = child._fullPath;
                hdr.innerHTML =
                    `<span class="ft-toggle">${isEmpty ? '?? : '??}</span>` +
                    `<span class="ft-folder-icon">?뱛</span>` +
                    `<span class="ft-folder-name">${_esc(folderName)}</span>` +
                    `<span class="ft-folder-lock" title="?묒뿀?????좉툑 ???몃━ ?덈줈怨좎묠 ?쒖뿉???묓엺 ?곹깭 ?좎?" role="button" tabindex="0">??/span>` +
                    `<span class="ft-count" style="${isEmpty ? 'opacity:.4' : ''}">${isEmpty ? '鍮??대뜑' : totalFiles}</span>` +
                    `<button class="fg-add-btn" title="???대뜑?????뚯씪 留뚮뱾湲? ` +
                    `onclick="event.stopPropagation();FM.createFileInFolder('${_esc(folderPath)}')">竊?/button>` +
                    `<button class="folder-move-btn" title="?대뜑 ?대룞" data-path="${_esc(folderPath)}" ` +
                    `onclick="event.stopPropagation();FM.moveFolder(this)">??/button>` +
                    `<button class="folder-rename-btn" title="?대뜑紐?怨좎튂湲? data-path="${_esc(folderPath)}" ` +
                    `onclick="event.stopPropagation();FM.renameFolder(this)">??/button>` +
                    `<button class="folder-del-btn" title="${isEmpty ? '鍮??대뜑 ??젣' : '?대뜑 ??젣 (?대? ?뚯씪 ?ы븿)'}" ` +
                    `data-path="${_esc(folderPath)}" data-empty="${isEmpty}" ` +
                    `onclick="event.stopPropagation();FM.confirmDeleteFolder(this)">?뿊</button>`;
                hdr.onclick = (e) => {
                    if (e.target.closest('.ft-folder-lock')) return;
                    folderEl.classList.toggle('collapsed');
                    hdr.querySelector('.ft-toggle').textContent =
                        folderEl.classList.contains('collapsed') ? '?? : '??;
                };
                const lockEl = hdr.querySelector('.ft-folder-lock');
                lockEl.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const locked = _getLockedFolders();
                    if (locked.has(folderPath)) {
                        locked.delete(folderPath);
                        lockEl.classList.remove('ft-folder-lock-on');
                    } else {
                        locked.add(folderPath);
                        folderEl.classList.add('collapsed');
                        hdr.querySelector('.ft-toggle').textContent = isEmpty ? '?? : '??;
                        lockEl.classList.add('ft-folder-lock-on');
                    }
                    _setLockedFolders(locked);
                });
                folderEl.appendChild(hdr);

                const body = document.createElement('div');
                body.className = 'ft-folder-body';
                renderNode(child, depth + 1, body);
                folderEl.appendChild(body);
                container.appendChild(folderEl);
            });

            /* ?뚯씪 */
            node.files.sort((a, b) => (b.modified||0) - (a.modified||0)).forEach(f => {
                const row = document.createElement('div');
                const isAct = f.path === activeFile || f.name === activeFile;
                row.className = 'file-item' + (isAct ? ' active' : '');
                row.style.paddingLeft = (18 + indent) + 'px';
                const icon = f.ext === 'html' ? '?뙋' : f.ext === 'txt' ? '?뱞' : '?뱷';
                const modStr = f.modified
                    ? new Date(f.modified).toLocaleDateString('ko', { month:'2-digit', day:'2-digit' })
                    : '';
                const sizeStr = f.size != null
                    ? (f.size >= 1048576
                        ? (f.size / 1048576).toFixed(1) + 'MB'
                        : f.size >= 1024
                            ? (f.size / 1024).toFixed(1) + 'KB'
                            : f.size + 'B')
                    : '';
                const metaStr = [sizeStr, modStr].filter(Boolean).join(' 쨌 ');
                const metaContent = sizeStr && modStr
                    ? `<span class="file-item-meta-size">${sizeStr}</span> 쨌 <span class="file-item-meta-date">${modStr}</span>`
                    : sizeStr ? `<span class="file-item-meta-size">${sizeStr}</span>` : modStr ? `<span class="file-item-meta-date">${modStr}</span>` : '';
                row.innerHTML =
                    `<span class="file-item-icon">${icon}</span>` +
                    `<span class="file-item-name">${_esc(f.name.replace(/\.[^.]+$/, ''))}</span>` +
                    `<span class="file-item-meta">${metaContent}</span>` +
                    `<button class="file-share-btn" title="mdliveData(GitHub)??Push" onclick="event.stopPropagation();FM.pushToGH(this)" style="font-size:9px;padding:1px 4px">?릻</button>` +
                    `<button class="file-share-btn" title="md-viewer??Push (怨듭쑀)" onclick="event.stopPropagation();FM.pushToViewer(this)" style="font-size:9px;padding:1px 4px;color:#58c8f8">?뱾</button>` +
                    `<button class="file-move-btn" title="?뚯씪 ?대룞" onclick="event.stopPropagation();FM.moveFile(this)">??/button>` +
                    `<button class="file-rename-btn" title="?뚯씪紐?怨좎튂湲? onclick="event.stopPropagation();FM.renameFile(this)">??/button>` +
                    `<button class="file-del-btn" title="?뚯씪 ??젣" onclick="event.stopPropagation();FM.confirmDelete(this)">?뿊</button>`;
                row.title = f.path + (f.size != null ? '\n?ш린: ' + sizeStr : '') + (f.modified ? '\n?섏젙: ' + new Date(f.modified).toLocaleString('ko') : '');
                row._fmFile = f;
                row.onclick = () => _openCached(f);
                container.appendChild(row);
            });
        }

        function countFiles(node) {
            let n = node.files.length;
            Object.values(node.children).forEach(c => { n += countFiles(c); });
            return n;
        }

        /* 猷⑦듃 ?뚯씪 + ?대뜑 ?몃━ ?뚮뜑 */
        renderNode(root, 0, list);
        /* ?좉툑 ?대뜑: ?묓엺 ?곹깭 ?좎? + ?뱀깋 ??궪媛곹삎 ?쒖떆 */
        const lockedSet = _getLockedFolders();
        list.querySelectorAll('.ft-folder').forEach(folderEl => {
            const path = folderEl.dataset.path;
            if (!path || !lockedSet.has(path)) return;
            folderEl.classList.add('collapsed');
            const hdr = folderEl.querySelector('.ft-folder-hdr');
            const toggle = hdr && hdr.querySelector('.ft-toggle');
            const isEmpty = toggle && toggle.textContent === '??;
            if (toggle && !isEmpty) toggle.textContent = '??;
            const lockSpan = hdr && hdr.querySelector('.ft-folder-lock');
            if (lockSpan) lockSpan.classList.add('ft-folder-lock-on');
        });
        /* ?꾩껜 ?묎린 踰꾪듉: ?뚮뜑 ??湲곕낯? 紐⑤몢 ?쇱묠 ????*/
        const foldBtn = document.getElementById('files-fold-toggle-btn');
        if (foldBtn) foldBtn.textContent = '??;
    }

    /** 濡쒖뺄 ?뚯씪 ?몃━?먯꽌 ??λ맂 寃쎈줈 ?됱쓣 ?쒖꽦?쇰줈 ?쒖떆?섍퀬 紐⑸줉???ㅼ떆 洹몃┛??*/
    function highlightPathForSaved(path) {
        if (path == null || path === '') return;
        activeFile = path;
        _render();
    }

    /* ?? ?뚯씪 ?닿린 (罹먯떆???댁슜 ?ъ슜 ??利됱떆 ?대┝) ?????? */
    function _openCached(f) {
        activeFile = f.name;
        document.querySelectorAll('.file-item').forEach(el =>
            el.classList.toggle('active', el.title.startsWith(f.path)));

        const name    = f.name.replace(/\.[^.]+$/, '');
        const ft      = f.ext === 'html' ? 'md' : f.ext;
        const content = f.ext === 'html'
            ? (TM._htmlToEditableContent || (x => x))(f.content)
            : f.content;

        /* ?대? ?대┛ ??씠硫??꾪솚 */
        const existing = TM.getAll().find(t => t.filePath === f.path || t.title === name);
        if (existing) { TM.switchTab(existing.id); return; }

        /* ????쑝濡??닿린 */
        const tab = TM.newTab(name, content, ft);
        tab.filePath = f.path;
        TM.markClean(tab.id);
        TM.renderTabs();
        TM.persist();
    }

    /* ?? ?대갚 (API 誘몄??? ?????????????????????????????? */
    function _noAPIFallback() {
        alert('?대뜑 ?좏깮 API??Chrome/Edge?먯꽌留?吏?먮맗?덈떎.\n\n??諛붿쓽 ?뱛 ?닿린 踰꾪듉?쇰줈 ?뚯씪??吏곸젒 ?ъ꽭??');
    }

    function _esc(s) {
        return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    /* ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧
       濡쒖뺄 ??GitHub ?숆린?? (?덉쟾 ?ㅺ퀎)

       SHA 異붿쟻 援ъ“:
         _baseSHAs  = { ghPath ??sha }
                      留덉?留?pull/push ?꾨즺 ?쒖젏???먭꺽 SHA
                      ??"??湲곗??? : ?댄썑 蹂寃?媛먯???湲곗?

       ?곹깭 遺꾨쪟 (?뚯씪蹂?:
         same      : localSHA === remoteSHA  (蹂寃??놁쓬)
         local     : localSHA ??baseSHA, remoteSHA === baseSHA  (?닿? 蹂寃?
         remote    : localSHA === baseSHA, remoteSHA ??baseSHA  (?먭꺽 蹂寃?
         conflict  : ????baseSHA? ?ㅻ쫫  (異⑸룎)
         new-local : baseSHA ?녾퀬 ?먭꺽???놁쓬  (???좉퇋)
         new-remote: baseSHA ?녾퀬 濡쒖뺄???놁쓬  (?먭꺽 ?좉퇋)

       push ?덉쟾 洹쒖튃:
         remote ?먮뒗 conflict ?곹깭 ?뚯씪???섎굹?쇰룄 ?덉쑝硫?push 李⑤떒
         ??"pull 癒쇱? ?ㅽ뻾?섏꽭?? ?덈궡

       pull ?숈옉:
         remote/conflict ?뚯씪??GitHub ?댁슜??IDB 罹먯떆??諛섏쁺
         conflict ?뚯씪? ?ъ슜???뺤씤 ??援먯껜
         pull ?꾨즺 ??_baseSHAs瑜??먭꺽 理쒖떊 SHA濡?媛깆떊
    ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧 */

    /* IDB??湲곗? SHA 留????蹂듭썝 */
    const BASE_SHA_KEY = 'fm_base_shas';
    let _baseSHAs = {};  // ghPath ??sha  (留덉?留?sync 湲곗???

    async function _loadBaseSHAs() {
        try {
            const db = await (async () => {
                return new Promise((res, rej) => {
                    const r = indexedDB.open('mdpro-fm-v3', 1);
                    r.onsuccess = e => res(e.target.result);
                    r.onerror   = e => rej(e.target.error);
                });
            })();
            const val = await new Promise((res, rej) => {
                const r = db.transaction('meta','readonly').objectStore('meta').get(BASE_SHA_KEY);
                r.onsuccess = e => res(e.target.result ?? {});
                r.onerror   = e => rej(e.target.error);
            });
            _baseSHAs = val || {};
        } catch(e) { _baseSHAs = {}; }
    }

    async function _saveBaseSHAs() {
        try {
            const db = await (async () => {
                return new Promise((res, rej) => {
                    const r = indexedDB.open('mdpro-fm-v3', 1);
                    r.onsuccess = e => res(e.target.result);
                    r.onerror   = e => rej(e.target.error);
                });
            })();
            await new Promise((res, rej) => {
                const r = db.transaction('meta','readwrite').objectStore('meta').put(_baseSHAs, BASE_SHA_KEY);
                r.onsuccess = () => res();
                r.onerror   = e => rej(e.target.error);
            });
        } catch(e) {}
    }

    /* ?? blob SHA 怨꾩궛 (git hash-object ?명솚) ??????????? */
    async function _blobSHA(content) {
        const enc  = new TextEncoder();
        const data = enc.encode(content);
        const hdr  = enc.encode('blob ' + data.byteLength);
        const buf  = new Uint8Array(hdr.length + 1 + data.length);
        buf.set(hdr, 0);
        buf[hdr.length] = 0;   /* NUL byte */
        buf.set(data, hdr.length + 1);
        const hashBuf = await crypto.subtle.digest('SHA-1', buf);
        return Array.from(new Uint8Array(hashBuf))
            .map(b => b.toString(16).padStart(2,'0')).join('');
    }

    /* ?? ?뚯씪 ?곹깭 遺꾨쪟 ????????????????????????????????? */
    async function _classifyFiles(remoteSHAs) {
        if (!GH.isConnected()) return { files: [], hasConflict: false, hasRemote: false };
        const ghCfg = GH.cfg;
        const base  = ghCfg && ghCfg.basePath
            ? ghCfg.basePath.replace(/\/$/, '') + '/' : '';

        const results = await Promise.all(allFiles.map(async f => {
            const ghPath   = base + f.path;
            const localSHA = await _blobSHA(f.content);
            const remoteSHA = remoteSHAs[ghPath] || null;
            const baseSHA   = _baseSHAs[ghPath]  || null;

            let status;
            if (!baseSHA && !remoteSHA) status = 'new-local';
            else if (!baseSHA && remoteSHA) {
                status = (localSHA === remoteSHA) ? 'same' : 'conflict';
            } else if (localSHA === remoteSHA)    status = 'same';
            else if (localSHA === baseSHA)         status = 'remote';   // ?닿? ??諛붽퓞, ?먭꺽留?諛붾?            else if (remoteSHA === baseSHA)        status = 'local';    // ?닿? 諛붽퓞, ?먭꺽? ??諛붾?            else                                   status = 'conflict'; // ????諛붾?
            return { ...f, ghPath, localSHA, remoteSHA, baseSHA, status };
        }));

        /* ?먭꺽?먮쭔 ?덈뒗 ?좉퇋 ?뚯씪 (濡쒖뺄 罹먯떆???놁쓬) */
        const localPaths = new Set(results.map(f => f.ghPath));
        Object.keys(remoteSHAs).forEach(ghPath => {
            if (!localPaths.has(ghPath)) {
                const base2 = ghCfg && ghCfg.basePath
                    ? ghCfg.basePath.replace(/\/$/, '') + '/' : '';
                if (!base2 || ghPath.startsWith(base2)) {
                    const name   = ghPath.split('/').pop();
                    const ext    = name.split('.').pop().toLowerCase();
                    if (['md','txt','html'].includes(ext)) {
                        const relPath = base2 ? ghPath.slice(base2.length) : ghPath;
                        const parts   = relPath.split('/');
                        const fname   = parts.pop();
                        results.push({
                            name: fname, ext, folder: parts.join('/') || '/',
                            path: relPath, ghPath,
                            localSHA: null, remoteSHA: remoteSHAs[ghPath],
                            baseSHA: _baseSHAs[ghPath] || null,
                            status: 'new-remote', content: null,
                        });
                    }
                }
            }
        });

        const hasConflict = results.some(f => f.status === 'conflict');
        const hasRemote   = results.some(f => f.status === 'remote' || f.status === 'new-remote');
        return { files: results, hasConflict, hasRemote };
    }

    /* ?? UI ?ы띁 ???????????????????????????????????????? */
    function _syncStatus(cls, msg) {
        const el2 = document.getElementById('fm-sync-status');
        if (!el2) return;
        el2.className = cls;
        el2.textContent = msg;
    }
    function _setBusy(busy) {
        const pullBtn = document.getElementById('fm-pull-btn');
        const pushBtn = document.getElementById('fm-sync-btn');
        const pullIco = document.getElementById('fm-pull-icon');
        const pushIco = document.getElementById('fm-sync-icon');
        if (pullBtn) pullBtn.disabled = busy;
        if (pushBtn) pushBtn.disabled = busy;
        if (pullIco) pullIco.classList.toggle('icon-spin', busy);
        if (pushIco) pushIco.classList.toggle('icon-spin', busy);
    }

    /* ?? PULL: GitHub ??濡쒖뺄 罹먯떆 ????????????????????????
       1. ?먭꺽 ?뚯씪 SHA 留?議고쉶
       2. remote / new-remote / conflict ?뚯씪 遺꾨쪟
       3. conflict ?뚯씪: ?ъ슜?먯뿉寃?"?먭꺽?쇰줈 ??뼱?멸퉴?" ?뺤씤
       4. ????뚯씪 GitHub?먯꽌 ?댁슜 ?ㅼ슫濡쒕뱶
       5. IDB 罹먯떆 媛깆떊 + allFiles ?낅뜲?댄듃
       6. _baseSHAs瑜??꾩옱 ?먭꺽 SHA濡?媛깆떊 (湲곗????대룞)
       7. ?대? ?대┛ ??뿉 "媛깆떊?? ?뚮┝                   */
    /** ?ㅼ젙??GitHub(mdliveData) ??μ냼瑜?ZIP?쇰줈 ?ㅼ슫濡쒕뱶?쒕떎. ????뿉??GitHub ZIP URL???곕떎 */
    function downloadGitHubZip() {
        if (!GH.isConnected()) {
            alert('GitHub ?곌껐???ㅼ젙?섏? ?딆븯?듬땲??\n癒쇱? ?릻 GitHub ??뿉???곌껐 ?ㅼ젙???꾨즺?섏꽭??');
            return;
        }
        const ghCfg = GH.cfg;
        const zipUrl = `https://github.com/${ghCfg.repo}/archive/refs/heads/${ghCfg.branch || 'main'}.zip`;
        window.open(zipUrl, '_blank');
        if (typeof App !== 'undefined' && App._toast) App._toast('?벀 ZIP ?ㅼ슫濡쒕뱶 ?쒖옉');
    }

    /* ?? Clone URL 蹂듭궗 (濡쒖뺄 ?대뜑?? ?? */
    function cloneFromGitHub() {
        if (!GH.isConnected()) {
            alert('GitHub ?곌껐???ㅼ젙?섏? ?딆븯?듬땲??\n癒쇱? ?릻 GitHub ??뿉???곌껐 ?ㅼ젙???꾨즺?섏꽭??');
            return;
        }
        const ghCfg = GH.cfg;
        const cloneUrl = `https://github.com/${ghCfg.repo}.git`;
        /* ?대┰蹂대뱶 蹂듭궗 + ?덈궡 */
        navigator.clipboard.writeText(cloneUrl).then(() => {
            App._toast(`?뱥 Clone URL 蹂듭궗?? ${cloneUrl}`);
            /* 媛꾨떒???덈궡 紐⑤떖 */
            const ov = document.createElement('div');
            ov.style.cssText = 'position:fixed;inset:0;z-index:9500;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;padding:16px';
            ov.innerHTML = `
            <div style="background:var(--bg2);border:1px solid rgba(160,144,255,.35);border-radius:12px;padding:20px 22px;max-width:440px;width:100%;box-shadow:0 12px 50px rgba(0,0,0,.7)">
              <div style="font-size:13px;font-weight:700;color:#a090ff;margin-bottom:10px">?뱥 Clone URL 蹂듭궗??/div>
              <div style="font-size:11px;color:var(--tx3);margin-bottom:10px;line-height:1.6">
                ?곕??먯뿉???꾨옒 紐낅졊?쇰줈 濡쒖뺄??Clone?섏꽭??
              </div>
              <div style="background:var(--bg3);border:1px solid var(--bd);border-radius:6px;padding:9px 12px;font-family:var(--fm);font-size:11px;color:#a090ff;margin-bottom:14px;word-break:break-all">
                git clone ${cloneUrl}
              </div>
              <div style="font-size:10.5px;color:var(--tx3);margin-bottom:14px;line-height:1.6">
                Clone ??<b style="color:var(--tx2)">濡쒖뺄 ?대뜑 ?닿린</b>濡??대떦 ?대뜑瑜??좏깮?섎㈃<br>
                Pull / Push濡?GitHub? ?숆린?뷀븷 ???덉뒿?덈떎.
              </div>
              <div style="display:flex;justify-content:flex-end">
                <button id="clone-info-close" style="padding:6px 16px;border-radius:6px;border:1px solid var(--bd);background:var(--bg3);color:var(--tx2);font-size:12px;cursor:pointer">?リ린</button>
              </div>
            </div>`;
            document.body.appendChild(ov);
            document.getElementById('clone-info-close').onclick = () => ov.remove();
            ov.onclick = e => { if (e.target === ov) ov.remove(); };
        }).catch(() => {
            prompt('?꾨옒 URL??蹂듭궗??git clone ?섏꽭??', cloneUrl);
        });
    }

    async function pullFromGitHub() {
        if (!GH.isConnected()) {
            alert('GitHub ?곌껐???ㅼ젙?섏? ?딆븯?듬땲??\n癒쇱? ?릻 GitHub ??뿉???곌껐 ?ㅼ젙???꾨즺?섏꽭??');
            return;
        }
        _setBusy(true);
        _syncStatus('ing', '???먭꺽 ?곹깭 ?뺤씤 以묅?);
        try {
            await _loadBaseSHAs();
            const remoteSHAs = await GH.getRemoteSHAs();
            const { files, hasConflict, hasRemote } = await _classifyFiles(remoteSHAs);

            const toFetch = files.filter(f =>
                f.status === 'remote' || f.status === 'new-remote');
            const conflicts = files.filter(f => f.status === 'conflict');

            /* 異⑸룎 ?뚯씪 泥섎━ */
            let pullConflicts = [];
            if (conflicts.length) {
                const names = conflicts.map(f => `  ??${f.name}`).join('\n');
                const ok = confirm(
                    `??異⑸룎 ?뚯씪 ${conflicts.length}媛?\n${names}\n\n` +
                    `濡쒖뺄怨??먭꺽 紐⑤몢 蹂寃쎈릺?덉뒿?덈떎.\n` +
                    `?먭꺽 ?댁슜?쇰줈 ??뼱?곗떆寃좎뒿?덇퉴?\n\n` +
                    `(痍⑥냼: 異⑸룎 ?뚯씪? 洹몃?濡??좎?)`
                );
                if (ok) pullConflicts = conflicts;
            }

            const allToPull = [...toFetch, ...pullConflicts];

            if (!allToPull.length && !hasRemote) {
                _syncStatus('ok', '???대? 理쒖떊 ?곹깭?낅땲??);
                _setBusy(false);
                return;
            }

            _syncStatus('ing', `??${allToPull.length}媛??뚯씪 ?ㅼ슫濡쒕뱶 以묅?);

            /* GitHub?먯꽌 ?댁슜 ?ㅼ슫濡쒕뱶 */
            const ghCfg = GH.cfg;
            let pulled = 0;
            for (const f of allToPull) {
                try {
                    const data = await fetch(
                        `https://api.github.com/repos/${ghCfg.repo}/contents/${encodeURIComponent(f.ghPath)}?ref=${ghCfg.branch}`,
                        { headers: {
                            'Authorization': `token ${ghCfg.token}`,
                            'Accept': 'application/vnd.github.v3+json',
                        }}
                    ).then(r => r.json());

                    const content = decodeURIComponent(
                        escape(atob(data.content.replace(/\n/g, '')))
                    );

                    /* IDB 罹먯떆 + allFiles 媛깆떊 */
                    const idx = allFiles.findIndex(af => af.path === f.path);
                    const updated = {
                        name    : f.name,
                        ext     : f.ext,
                        folder  : f.folder,
                        path    : f.path,
                        content,
                        modified: Date.now(),
                    };
                    if (idx >= 0) allFiles[idx] = updated;
                    else          allFiles.push(updated);

                    /* IDB?????*/
                    const db = await (async () => new Promise((res, rej) => {
                        const r = indexedDB.open('mdpro-fm-v3', 1);
                        r.onsuccess = e => res(e.target.result);
                        r.onerror   = e => rej(e.target.error);
                    }))();
                    await new Promise((res, rej) => {
                        const r = db.transaction('files','readwrite')
                            .objectStore('files').put(updated, updated.path);
                        r.onsuccess = () => res();
                        r.onerror   = e => rej(e.target.error);
                    });

                    /* ?대? ?대┛ ??뿉 媛깆떊 ?뚮┝ */
                    _notifyOpenTab(f.name.replace(/\.[^.]+$/, ''), content, f.path);

                    pulled++;
                } catch(e2) {
                    console.warn('pull failed for', f.path, e2);
                }
            }

            /* _baseSHAs 媛깆떊 (湲곗????대룞) */
            files.forEach(f => {
                if (f.remoteSHA) _baseSHAs[f.ghPath] = f.remoteSHA;
            });
            await _saveBaseSHAs();

            filtered = allFiles;
            _render();
            _syncStatus('ok', `??${pulled}媛?pull ?꾨즺`);

        } catch(e) {
            console.error('FM.pullFromGitHub:', e);
            _syncStatus('err', `??${e.message}`);
        } finally {
            _setBusy(false);
        }
    }

    /* pull ???대? ?대┛ ??뿉 ?뚮┝ */
    function _notifyOpenTab(title, newContent, filePath) {
        const tab = TM.getAll().find(t =>
            t.filePath === filePath || t.title === title);
        if (!tab) return;
        /* ??뿉 媛깆떊 諭껋? ?쒖떆 */
        tab._updatedContent = newContent;
        const titleEl = document.querySelector(`.tab[data-id="${tab.id}"] .tab-title`);
        if (titleEl && !titleEl.querySelector('.tab-updated-badge')) {
            titleEl.insertAdjacentHTML('afterend',
                '<span class="tab-updated-badge" title="?먭꺽?먯꽌 媛깆떊?????대┃?섏뿬 ?곸슜">NEW</span>');
        }
        /* ?꾩옱 ?쒖꽦 ??씠硫?toast ?뚮┝ */
        if (TM.getActive() && TM.getActive().id === tab.id) {
            App._toast(`??"${title}" ???먭꺽?먯꽌 媛깆떊?? ??쓽 NEW 諛곗?瑜??대┃?섎㈃ ?곸슜?⑸땲??`);
        }
    }

    /* ?? PUSH: 濡쒖뺄 罹먯떆 ??GitHub ????????????????????????
       ?덉쟾 洹쒖튃:
         ???먭꺽??蹂寃쎌씠 ?덉쑝硫?push 李⑤떒 ??pull 癒쇱?
         ??異⑸룎???덉쑝硫?push 李⑤떒 ??pull ???닿껐
         ???듦낵 ??local + new-local ?뚯씪留?push
         ??push ?꾨즺 ??_baseSHAs 媛깆떊                   */
    async function syncToGitHub() {
        if (!allFiles.length) {
            alert('癒쇱? 濡쒖뺄 ?대뜑瑜??좏깮?섍퀬 ?뚯씪??遺덈윭?ㅼ꽭??');
            return;
        }
        if (!GH.isConnected()) {
            const go = confirm('GitHub ?곌껐???ㅼ젙?섏? ?딆븯?듬땲??\n?ㅼ젙 ?붾㈃???ъ떆寃좎뒿?덇퉴?');
            if (go) { SB.switchTab('files'); SB.switchSource('github'); GH.showSettings(); }
            return;
        }

        _setBusy(true);
        _syncStatus('ing', '???먭꺽 ?곹깭 ?뺤씤 以묅?);

        try {
            await _loadBaseSHAs();
            const remoteSHAs = await GH.getRemoteSHAs();
            const { files, hasConflict, hasRemote } = await _classifyFiles(remoteSHAs);

            /* ???먭꺽 蹂寃?/ 異⑸룎 李⑤떒 */
            if (hasConflict) {
                const names = files.filter(f => f.status === 'conflict')
                    .map(f => `  ?뵶 ${f.name}`).join('\n');
                _syncStatus('err', `??異⑸룎 ${files.filter(f=>f.status==='conflict').length}媛???pull ???닿껐?섏꽭??);
                alert(`Push 李⑤떒: 異⑸룎 ?뚯씪???덉뒿?덈떎.\n${names}\n\n癒쇱? Pull???ㅽ뻾?섏뿬 異⑸룎???닿껐?섏꽭??`);
                _setBusy(false);
                return;
            }
            if (hasRemote) {
                _syncStatus('ing', '???먭꺽 蹂寃??덉쓬 ??Pull 癒쇱? ?ㅽ뻾 以묅?);
                await pullFromGitHub();
                await _loadBaseSHAs();
                const remoteSHAs2 = await GH.getRemoteSHAs();
                const res2 = await _classifyFiles(remoteSHAs2);
                if (res2.hasConflict) {
                    const names = res2.files.filter(f => f.status === 'conflict').map(f => `  ?뵶 ${f.name}`).join('\n');
                    _syncStatus('err', '??異⑸룎 ???닿껐 ??Push ?섏꽭??);
                    alert(`Push 李⑤떒: Pull ??異⑸룎 ?뚯씪???덉뒿?덈떎.\n${names}\n\n異⑸룎???닿껐?????ㅼ떆 Push ?섏꽭??`);
                    _setBusy(false);
                    return;
                }
                if (res2.hasRemote) {
                    _syncStatus('err', '???먭꺽怨??댁슜???ㅻ쫭?덈떎');
                    alert('?먭꺽怨??댁슜???ㅻ쫭?덈떎. Pull ??濡쒖뺄?먯꽌 蹂묓빀?????ㅼ떆 Push ?섏꽭??');
                    _setBusy(false);
                    return;
                }
                files.length = 0;
                files.push(...res2.files);
            }

            /* ??push ??? local + new-local 留?*/
            const toPush = files.filter(f =>
                f.status === 'local' || f.status === 'new-local');

            if (!toPush.length) {
                _syncStatus('ok', '??蹂寃쎌궗???놁쓬 ??GitHub? ?숈씪?⑸땲??);
                _setBusy(false);
                return;
            }

            /* ??而ㅻ컠 硫붿떆吏 (?쇱옄+?붿씪 ?먮룞, ?섏젙 媛?? */
            const now = new Date();
            const days = ['??,'??,'??,'??,'紐?,'湲?,'??];
            const defaultMsg = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} (${days[now.getDay()]})`;
            const summary = toPush.length <= 3
                ? toPush.map(f => f.name).join(', ')
                : `${toPush.length}媛??뚯씪`;
            const msg = prompt(
                `Push???뚯씪 ${toPush.length}媛?\n` +
                toPush.map(f => `  ${f.status === 'new-local' ? '?? : '??} ${f.name}`).join('\n') +
                '\n\n而ㅻ컠 硫붿떆吏:',
                defaultMsg
            );
            if (msg === null) { _setBusy(false); _syncStatus('', ''); return; }

            _syncStatus('ing', `??${toPush.length}媛??뚯씪 push 以묅?);

            /* ??Git Data API濡??쇨큵 push */
            const result = await GH.pushLocalFiles(
                toPush.map(f => ({ path: f.ghPath, content: f.content })),
                msg || `Update ${summary}`
            );

            /* ??_baseSHAs 媛깆떊 */
            const newRemote = await GH.getRemoteSHAs();
            toPush.forEach(f => {
                if (newRemote[f.ghPath]) _baseSHAs[f.ghPath] = newRemote[f.ghPath];
            });
            await _saveBaseSHAs();

            _syncStatus('ok',
                `??${result.pushed}媛?push ?꾨즺  #${result.commitSha}`);
            App._toast(`??GitHub push ?꾨즺 ??${result.pushed}媛??뚯씪 (#${result.commitSha})`);
            _render();

        } catch(e) {
            console.error('FM.syncToGitHub:', e);
            _syncStatus('err', `??${e.message}`);
        } finally {
            _setBusy(false);
        }
    }

    /* clone ?꾨즺 ??GH媛 ?몄텧 ???먭꺽 SHA瑜?湲곗??먯쑝濡??ㅼ젙 */
    function _setBaseSHAsFromRemote(remoteSHAs, basePath) {
        const base = basePath ? basePath.replace(/\/$/, '') + '/' : '';
        Object.keys(remoteSHAs).forEach(ghPath => {
            _baseSHAs[ghPath] = remoteSHAs[ghPath];
        });
        _saveBaseSHAs();
    }

    /* ?? ?뱀젙 ?대뜑???뚯씪 留뚮뱾湲?(?대뜑 洹몃９ ?ㅻ뜑 + ?대┃) ????? */
    async function createFileInFolder(folderPath) {
        _currentSubDir = folderPath === '/' ? null : folderPath;
        await createLocalFile();
        _currentSubDir = null;
    }

    /* ?? ???대뜑 留뚮뱾湲???????????????????????????????????? */
    async function createFolder() {
        if (!dirHandle) { alert('癒쇱? ?대뜑瑜??좏깮?섏꽭??'); return; }

        /* 遺紐??대뜑 ?좏깮 UI */
        const parentOptions = [{ label: '?뱚 (猷⑦듃)', value: '' }];
        Object.keys(_subHandles).sort().forEach(p => {
            const depth = p.split('/').length - 1;
            parentOptions.push({ label: '?뱛 ' + '  '.repeat(depth) + p.split('/').pop() + '  (' + p + ')', value: p });
        });

        const ov = document.createElement('div');
        ov.style.cssText = 'position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center';
        const box = document.createElement('div');
        box.style.cssText = 'background:var(--bg2);border:1px solid var(--bd);border-radius:12px;padding:20px 22px;min-width:320px;max-width:420px;width:90%;box-shadow:0 8px 40px rgba(0,0,0,.5)';
        box.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
                <span style="font-size:14px;font-weight:700;color:var(--txh)">?뱚 ???대뜑 留뚮뱾湲?/span>
                <button id="fm-ndir-close" style="background:none;border:none;cursor:pointer;color:var(--tx3);font-size:18px;line-height:1;padding:0 4px">??/button>
            </div>
            <div style="margin-bottom:12px">
                <label style="font-size:11px;color:var(--tx3);display:block;margin-bottom:5px">?꾩튂 (遺紐??대뜑)</label>
                <select id="fm-ndir-parent" style="width:100%;background:var(--bg3);border:1px solid var(--bd);border-radius:6px;color:var(--tx);font-size:12px;padding:7px 10px;outline:none;cursor:pointer">
                    ${parentOptions.map(o => '<option value="' + o.value + '"' + (defaultParent !== undefined && o.value === defaultParent ? ' selected' : '') + '>' + o.label + '</option>').join('')}
                </select>
            </div>
            <div style="margin-bottom:16px">
                <label style="font-size:11px;color:var(--tx3);display:block;margin-bottom:5px">?대뜑 ?대쫫</label>
                <input id="fm-ndir-name" type="text" value="?덊뤃??
                    style="width:100%;background:var(--bg3);border:1px solid var(--bd);border-radius:6px;color:var(--tx);font-size:13px;padding:7px 10px;outline:none;box-sizing:border-box">
                <div id="fm-ndir-err" style="display:none;margin-top:5px;font-size:11px;color:#f76a6a">???대뜑 ?대쫫???욌뮘 怨듬갚???덉뒿?덈떎. 怨듬갚???쒓굅?댁＜?몄슂.</div>
            </div>
                        <div style="margin-bottom:16px">
                <label style="font-size:11px;color:var(--tx3);display:block;margin-bottom:5px">새 파일 이름 <span style="opacity:.7">(.md 자동 추가)</span></label>
                <input id="fm-ndir-file" type="text" value="notes.md"
                    style="width:100%;background:var(--bg3);border:1px solid var(--bd);border-radius:6px;color:var(--tx);font-size:13px;padding:7px 10px;outline:none;box-sizing:border-box">
            </div><div style="display:flex;gap:8px;justify-content:flex-end">
                <button id="fm-ndir-cancel" style="padding:6px 16px;border-radius:6px;border:1px solid var(--bd);background:var(--bg3);color:var(--tx2);font-size:12px;cursor:pointer">痍⑥냼</button>
                <button id="fm-ndir-ok" style="padding:6px 18px;border-radius:6px;border:none;background:var(--ac);color:#fff;font-size:12px;font-weight:600;cursor:pointer">???앹꽦</button>
            </div>`;
        ov.appendChild(box);
        document.body.appendChild(ov);

        const nameInput = document.getElementById('fm-ndir-name');
        const fileInput = document.getElementById('fm-ndir-file');
        const parentSel = document.getElementById('fm-ndir-parent');
        setTimeout(() => { nameInput.focus(); nameInput.select(); }, 50);

        const result = await new Promise(resolve => {
            const close = (v) => { ov.remove(); resolve(v); };
            document.getElementById('fm-ndir-close').onclick = () => close(null);
            document.getElementById('fm-ndir-cancel').onclick = () => close(null);
            ov.onclick = (e) => { if (e.target === ov) close(null); };
            document.getElementById('fm-ndir-ok').onclick = () => {
                const raw = nameInput.value;
                const trimmed = raw.trim();
                const fileRaw = (fileInput && fileInput.value) ? fileInput.value.trim() : '';
                const errEl = document.getElementById('fm-ndir-err');
                if (!trimmed) { nameInput.focus(); return; }
                if (!fileRaw) { if (fileInput) fileInput.focus(); return; }
                if (raw !== trimmed) {
                    /* ?욌뮘 怨듬갚 ?덉쓬 ???먮윭 ?쒖떆, ?낅젰? ?뚮몢由?媛뺤“ */
                    errEl.style.display = 'block';
                    nameInput.style.borderColor = '#f76a6a';
                    nameInput.focus();
                    nameInput.setSelectionRange(0, raw.length);
                    return;
                }
                errEl.style.display = 'none';
                nameInput.style.borderColor = '';
                close({ parentVal: parentSel.value, name: trimmed, fileName: fileRaw });
            };
            nameInput.addEventListener('input', () => {
                /* ?낅젰 以??먮윭 ?댁냼 ???ㅼ떆媛꾩쑝濡??④? */
                const errEl = document.getElementById('fm-ndir-err');
                if (nameInput.value === nameInput.value.trim()) {
                    errEl.style.display = 'none';
                    nameInput.style.borderColor = '';
                }
            });
            nameInput.addEventListener('keydown', e => {
                if (e.key === 'Enter') document.getElementById('fm-ndir-ok').click();
                if (e.key === 'Escape') close(null);
            });
        });

        if (!result) return;

        const safe = result.name.replace(/[/\\:*?"<>|]/g, '_');
        let safeFile = String(result.fileName || '').trim().replace(/[/\\:*?"<>|]/g, '_');
        if (!safeFile) safeFile = 'notes.md';
        if (!/\.[a-z0-9]+$/i.test(safeFile)) safeFile += '.md';
        const parentHandle = result.parentVal
            ? (_subHandles[result.parentVal] || dirHandle)
            : dirHandle;

        try {
            const perm = await dirHandle.requestPermission({ mode: 'readwrite' });
            if (perm !== 'granted') { alert('?곌린 沅뚰븳??嫄곕??섏뿀?듬땲??'); return; }
            const newHandle = await parentHandle.getDirectoryHandle(safe, { create: true });
            const where = result.parentVal ? result.parentVal + '/' + safe : safe;
            const createdFileHandle = await newHandle.getFileHandle(safeFile, { create: true });
            const wr = await createdFileHandle.createWritable();
            await wr.write('');
            await wr.close();
            const whereFile = where + '/' + safeFile;
            _subHandles[where] = newHandle;
            delete _emptyFolders[where];
            App._toast('폴더/파일 생성: ' + whereFile);
            const title = safeFile.replace(/\.[^.]+$/, '');
            const tab = TM.newTab(title, '', 'md');
            tab.filePath = whereFile;
            tab._fileHandle = createdFileHandle;
            TM.markClean(tab.id);
            TM.renderTabs();
            _render();  /* 즉시 UI 반영 */
            /* 諛깃렇?쇱슫?쒕줈 ?꾩껜 ?ъ뒪罹?*/
            _subHandles = {};
            _emptyFolders = {};
            await _syncFromHandle();
        } catch(e) {
            if (e.name === 'NotAllowedError') {
                if (confirm('?곌린 沅뚰븳???꾩슂?⑸땲?? ?대뜑瑜??ㅼ떆 ?좏깮?섏떆寃좎뒿?덇퉴?')) selectFolder();
            } else { alert('?대뜑 ?앹꽦 ?ㅽ뙣: ' + e.message); }
        }
    }

    /* ?? ?꾩옱 ?대뜑?????뚯씪 留뚮뱾湲?(?대뜑 ?좏깮 UI ?ы븿) ?? */
    async function createLocalFile() {
        if (!dirHandle) { alert('癒쇱? ?대뜑瑜??좏깮?섏꽭??'); return; }
        /* ?좏깮 媛?ν븳 ?대뜑 紐⑸줉: 猷⑦듃 + _subHandles??紐⑤뱺 ?대뜑 */
        const folderOptions = [{ label: '?뱚 (猷⑦듃)', value: '' }];
        Object.keys(_subHandles).sort().forEach(p => {
            const depth = p.split('/').length - 1;
            folderOptions.push({ label: '?뱛 ' + '  '.repeat(depth) + p.split('/').pop() + '  (' + p + ')', value: p });
        });
        /* 鍮??대뜑???ы븿 */
        Object.keys(_emptyFolders).sort().forEach(p => {
            if (!_subHandles[p]) {
                const depth = p.split('/').length - 1;
                folderOptions.push({ label: '?뱛 ' + '  '.repeat(depth) + p.split('/').pop() + '  (' + p + ')', value: p });
            }
        });

        /* ?대뜑 ?좏깮 紐⑤떖 ?쒖떆 */
        const chosen = await _showNewFileModal(folderOptions);
        if (!chosen) return;  /* 痍⑥냼 */

        const { folderVal, filename } = chosen;
        let fname = filename.trim();
        if (!fname) return;
        if (!/\.[a-z]+$/i.test(fname)) fname += '.md';
        const safe = fname.replace(/[/\\:*?"<>|]/g, '_');

        const targetHandle = folderVal
            ? (_subHandles[folderVal] || await (async () => {
                /* _subHandles???놁쑝硫?dirHandle?먯꽌 吏곸젒 寃쎈줈 ?먯깋 */
                try {
                    const parts = folderVal.split('/');
                    let h = dirHandle;
                    for (const p of parts) { h = await h.getDirectoryHandle(p); }
                    _subHandles[folderVal] = h;
                    return h;
                } catch(e2) { return null; }
            })())
            : dirHandle;
        if (!targetHandle) { alert('?대뜑 ?몃뱾??李얠쓣 ???놁뒿?덈떎. ?덈줈怨좎묠 ???ㅼ떆 ?쒕룄?섏꽭??'); return; }

        try {
            const perm = await dirHandle.requestPermission({ mode: 'readwrite' });
            if (perm !== 'granted') { alert('?곌린 沅뚰븳??嫄곕??섏뿀?듬땲??'); return; }
            const fh = await targetHandle.getFileHandle(safe, { create: true });
            const wr = await fh.createWritable();
            await wr.write('');
            await wr.close();
            const where = folderVal ? folderVal + '/' + safe : safe;
            App._toast('?뱞 "' + where + '" ?앹꽦??);
            const title = safe.replace(/\.[^.]+$/, '');
            const tab = TM.newTab(title, '', 'md');
            tab.filePath    = where;
            tab._fileHandle = fh;
            TM.markClean(tab.id);
            TM.renderTabs();
            _emptyFolders = {};
            _subHandles = {};
            await _syncFromHandle();
        } catch(e) {
            if (e.name === 'NotAllowedError') {
                if (confirm('?곌린 沅뚰븳???꾩슂?⑸땲?? ?대뜑瑜??ㅼ떆 ?좏깮?섏떆寃좎뒿?덇퉴?')) selectFolder();
            } else { alert('?뚯씪 ?앹꽦 ?ㅽ뙣: ' + e.message); }
        }
    }

    /* ?? ???뚯씪 留뚮뱾湲?紐⑤떖 (?대뜑 ?좏깮 + ?뚯씪紐??낅젰) ??? */
    function _showNewFileModal(folderOptions) {
        return new Promise(resolve => {
            /* 湲곗〈 紐⑤떖 ?쒓굅 */
            const existing = document.getElementById('fm-newfile-modal');
            if (existing) existing.remove();

            const ov = document.createElement('div');
            ov.id = 'fm-newfile-modal';
            ov.style.cssText = 'position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center';

            const box = document.createElement('div');
            box.style.cssText = 'background:var(--bg2);border:1px solid var(--bd);border-radius:12px;padding:20px 22px;min-width:340px;max-width:460px;width:90%;box-shadow:0 8px 40px rgba(0,0,0,.5)';

            const selOptions = folderOptions.map(o =>
                `<option value="${o.value}">${o.label}</option>`
            ).join('');

            box.innerHTML = `
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
                    <span style="font-size:14px;font-weight:700;color:var(--txh)">?뱞 ???뚯씪 留뚮뱾湲?/span>
                    <button id="fm-nf-close" style="background:none;border:none;cursor:pointer;color:var(--tx3);font-size:18px;line-height:1;padding:0 4px">??/button>
                </div>
                <div style="margin-bottom:12px">
                    <label style="font-size:11px;color:var(--tx3);display:block;margin-bottom:5px">????대뜑 ?좏깮</label>
                    <select id="fm-nf-folder" style="width:100%;background:var(--bg3);border:1px solid var(--bd);border-radius:6px;color:var(--tx);font-size:12px;padding:7px 10px;outline:none;cursor:pointer">
                        ${selOptions}
                    </select>
                </div>
                <div style="margin-bottom:16px">
                    <label style="font-size:11px;color:var(--tx3);display:block;margin-bottom:5px">?뚯씪 ?대쫫 <span style="opacity:.6">(.md ?먮룞 異붽?)</span></label>
                    <input id="fm-nf-name" type="text" value="Untitled"
                        style="width:100%;background:var(--bg3);border:1px solid var(--bd);border-radius:6px;color:var(--tx);font-size:13px;padding:7px 10px;outline:none;box-sizing:border-box"
                        placeholder="?뚯씪紐낆쓣 ?낅젰?섏꽭??>
                </div>
                <div style="display:flex;gap:8px;justify-content:flex-end">
                    <button id="fm-nf-cancel" style="padding:6px 16px;border-radius:6px;border:1px solid var(--bd);background:var(--bg3);color:var(--tx2);font-size:12px;cursor:pointer">痍⑥냼</button>
                    <button id="fm-nf-ok" style="padding:6px 18px;border-radius:6px;border:none;background:var(--ac);color:#fff;font-size:12px;font-weight:600;cursor:pointer">???앹꽦</button>
                </div>`;

            ov.appendChild(box);
            document.body.appendChild(ov);

            const nameInput = document.getElementById('fm-nf-name');
            const folderSel = document.getElementById('fm-nf-folder');
            setTimeout(() => { nameInput.focus(); nameInput.select(); }, 50);

            /* ?꾩옱 ?좏깮???쒕툕?대뜑媛 ?덉쑝硫?湲곕낯媛믪쑝濡?*/
            if (_currentSubDir) {
                const opt = [...folderSel.options].find(o => o.value === _currentSubDir);
                if (opt) folderSel.value = _currentSubDir;
            }

            const close = (result) => { ov.remove(); resolve(result); };

            document.getElementById('fm-nf-close').onclick = () => close(null);
            document.getElementById('fm-nf-cancel').onclick = () => close(null);
            ov.onclick = (e) => { if (e.target === ov) close(null); };
            document.getElementById('fm-nf-ok').onclick = () => {
                const fn = nameInput.value.trim();
                if (!fn) { nameInput.focus(); return; }
                close({ folderVal: folderSel.value, filename: fn });
            };
            nameInput.addEventListener('keydown', e => {
                if (e.key === 'Enter') document.getElementById('fm-nf-ok').click();
                if (e.key === 'Escape') close(null);
            });
        });
    }

    /** inDB ?뚯씪??吏?뺣맂 濡쒖뺄 ?대뜑????? ?대뜑 誘몄꽑?????덈궡, ?뚯씪 ?좏깮 紐⑤떖 ?쒖떆 */
    async function importFromInDB() {
        if (!dirHandle) { alert('癒쇱? ?대뜑瑜??좏깮?섏꽭??'); return; }
        if (typeof InDB === 'undefined') { alert('inDB瑜??ъ슜?????놁뒿?덈떎.'); return; }
        const files = InDB.getFiles();
        if (!files || !files.length) { alert('inDB??媛?몄삱 ?뚯씪???놁뒿?덈떎.'); return; }

        /* ????대뜑 ?듭뀡: 猷⑦듃 + _subHandles, _emptyFolders */
        const folderOptions = [{ label: '?뱚 (猷⑦듃)', value: '' }];
        const allPaths = new Set([...Object.keys(_subHandles), ...Object.keys(_emptyFolders)]);
        [...allPaths].sort().forEach(p => {
            const depth = p.split('/').length - 1;
            folderOptions.push({ label: '?뱛 ' + '  '.repeat(depth) + p.split('/').pop() + '  (' + p + ')', value: p });
        });

        const chosen = await _showImportFromInDBModal(folderOptions, files);
        if (!chosen || !chosen.selectedPaths.length) return;

        const { folderVal, selectedPaths } = chosen;
        const targetHandle = folderVal
            ? (_subHandles[folderVal] || await _getOrCreateDirHandle(dirHandle, folderVal))
            : dirHandle;
        if (!targetHandle) { alert('?대뜑 ?몃뱾??李얠쓣 ???놁뒿?덈떎.'); return; }

        try {
            const perm = await dirHandle.requestPermission({ mode: 'readwrite' });
            if (perm !== 'granted') { alert('?곌린 沅뚰븳??嫄곕??섏뿀?듬땲??'); return; }

            let ok = 0, fail = 0;
            let applyToAllChoice = null;  /* { action, filename?, saveasCounter } ???섎㉧吏?먮룄 媛숈? ?됰룞 ?곸슜 */
            for (const path of selectedPaths) {
                const f = files.find(x => x.path === path);
                if (!f) continue;
                let content = (typeof TM !== 'undefined' && TM.getAll)
                    ? (TM.getAll().find(t => (t.filePath || '').replace(/^indb:/, '') === path)?.content ?? f.content)
                    : f.content;
                if (content === undefined || content === null) content = f.content != null ? String(f.content) : '';

                const relPath = f.path || f.name;
                const parts = relPath.split('/');
                const fileName = parts.pop() || 'untitled';
                const subDirPath = parts.join('/');
                const dirToUse = subDirPath ? await _getOrCreateDirHandle(targetHandle, subDirPath) : targetHandle;
                let safe = fileName.replace(/[/\\:*?"<>|]/g, '_');

                /* 濡쒖뺄???대? ?덉쑝硫???뼱?곌린/?ㅻⅨ?대쫫???嫄대꼫?곌린 ?좏깮 */
                try {
                    await dirToUse.getFileHandle(safe);
                    let choice = applyToAllChoice;
                    if (!choice) {
                        choice = await _showOverwriteChoiceModal(safe);
                        if (!choice) { fail++; continue; }
                        if (choice.applyToAll) {
                            applyToAllChoice = {
                                action: choice.action,
                                filename: choice.filename,
                                saveasCounter: 0
                            };
                        }
                    } else if (choice.action === 'saveas') {
                        applyToAllChoice.saveasCounter++;
                        const base = (choice.filename || '').replace(/\.[^.]+$/, '');
                        const ext = (choice.filename || '').match(/\.[^.]+$/)?.[0] || '.' + (f.ext || 'md');
                        safe = (base + '_' + applyToAllChoice.saveasCounter + ext).replace(/[/\\:*?"<>|]/g, '_');
                    }
                    if (choice.action === 'skip') continue;
                    if (choice.action === 'saveas' && choice.filename && !applyToAllChoice?.saveasCounter) {
                        safe = choice.filename.replace(/[/\\:*?"<>|]/g, '_');
                        if (!/\.[a-z]+$/i.test(safe)) safe += '.' + (f.ext || 'md');
                    }
                } catch (_) { /* ?뚯씪 ?놁쓬 ??洹몃?濡?吏꾪뻾 */ }

                try {
                    const fh = await dirToUse.getFileHandle(safe, { create: true });
                    const wr = await fh.createWritable();
                    const toWrite = _prepareContentForWrite(content, f.ext);
                    await wr.write(toWrite);
                    await wr.close();
                    ok++;
                } catch (e) {
                    fail++;
                    console.warn('importFromInDB ?ㅽ뙣:', path, e);
                }
            }
            _subHandles = {};
            _emptyFolders = {};
            await _syncFromHandle();
            if (typeof App !== 'undefined' && App._toast) App._toast(`?뱿 ${ok}媛?媛?몄샂${fail ? ` (${fail}媛??ㅽ뙣)` : ''}`);
        } catch (e) {
            if (e.name === 'NotAllowedError') {
                if (confirm('?곌린 沅뚰븳???꾩슂?⑸땲?? ?대뜑瑜??ㅼ떆 ?좏깮?섏떆寃좎뒿?덇퉴?')) selectFolder();
            } else { alert('媛?몄삤湲??ㅽ뙣: ' + (e.message || e)); }
        }
    }

    /** 寃쎈줈濡??섏쐞 ?붾젆?곕━ ?몃뱾 ?띾뱷. ?놁쑝硫??앹꽦 */
    async function _getOrCreateDirHandle(parentHandle, pathStr) {
        if (!pathStr || !pathStr.trim()) return parentHandle;
        const parts = pathStr.split('/').filter(Boolean);
        let h = parentHandle;
        for (const p of parts) { h = await h.getDirectoryHandle(p, { create: true }); }
        return h;
    }

    /** inDB content瑜??뚯씪 ?곌린???곗씠?곕줈 蹂?? base64 ?대?吏???붿퐫??*/
    function _prepareContentForWrite(content, ext) {
        if (content == null) return '';
        const s = String(content);
        const imgExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'ico'];
        const isImg = imgExts.includes((ext || '').toLowerCase());
        let b64 = '';
        if (s.startsWith('data:')) {
            const m = s.match(/^data:[^;]+;base64,(.+)$/);
            b64 = m ? m[1] : '';
        } else if (isImg && /^[A-Za-z0-9+/]+=*$/.test(s)) b64 = s;
        if (b64 && isImg) {
            try {
                const binary = atob(b64.replace(/=+$/, ''));
                const bytes = new Uint8Array(binary.length);
                for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
                return bytes;
            } catch (_) {}
        }
        return s;
    }

    /** 濡쒖뺄???뚯씪???덉쓣 ????뼱?곌린/?ㅻⅨ?대쫫???嫄대꼫?곌린 ?좏깮 紐⑤떖. 諛섑솚: { action, applyToAll?, filename? } ?먮뒗 null */
    function _showOverwriteChoiceModal(fileName) {
        return new Promise(resolve => {
            const existing = document.getElementById('fm-overwrite-modal');
            if (existing) existing.remove();

            const ov = document.createElement('div');
            ov.id = 'fm-overwrite-modal';
            ov.style.cssText = 'position:fixed;inset:0;z-index:9100;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center';

            const esc = (x) => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
            const box = document.createElement('div');
            box.style.cssText = 'background:var(--bg2);border:1px solid var(--bd);border-radius:12px;padding:20px 22px;min-width:320px;max-width:420px;width:90%;box-shadow:0 8px 40px rgba(0,0,0,.6)';
            box.innerHTML = `
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
                    <span style="font-size:14px;font-weight:700;color:var(--txh)">???뚯씪???대? 議댁옱?⑸땲??/span>
                    <button id="fm-ow-close" style="background:none;border:none;cursor:pointer;color:var(--tx3);font-size:18px;line-height:1;padding:0 4px">??/button>
                </div>
                <div style="font-size:12px;color:var(--tx2);margin-bottom:14px;padding:8px 10px;background:var(--bg3);border-radius:6px;word-break:break-all">
                    ${esc(fileName)}
                </div>
                <div style="margin-bottom:14px;display:none" id="fm-ow-saveas-wrap">
                    <label style="font-size:11px;color:var(--tx3);display:block;margin-bottom:4px">?ㅻⅨ ?뚯씪 ?대쫫</label>
                    <input id="fm-ow-newfile" type="text" value="" placeholder="???뚯씪紐??낅젰"
                        style="width:100%;background:var(--bg3);border:1px solid var(--bd);border-radius:6px;color:var(--tx);font-size:12px;padding:7px 10px;outline:none;box-sizing:border-box">
                </div>
                <label style="display:flex;align-items:center;gap:6px;margin-bottom:14px;cursor:pointer;font-size:11px;color:var(--tx2)">
                    <input type="checkbox" id="fm-ow-apply-all" style="accent-color:var(--ac)">
                    <span>?섎㉧吏 異⑸룎 ?뚯씪?먮룄 媛숈? ?됰룞 ?곸슜</span>
                </label>
                <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap">
                    <button id="fm-ow-skip" style="padding:6px 14px;border-radius:6px;border:1px solid var(--bd);background:var(--bg3);color:var(--tx2);font-size:12px;cursor:pointer">嫄대꼫?곌린</button>
                    <button id="fm-ow-saveas" style="padding:6px 14px;border-radius:6px;border:1px solid var(--bd);background:var(--bg3);color:var(--tx2);font-size:12px;cursor:pointer">?ㅻⅨ ?대쫫?쇰줈</button>
                    <button id="fm-ow-overwrite" style="padding:6px 18px;border-radius:6px;border:none;background:var(--ac);color:#fff;font-size:12px;font-weight:600;cursor:pointer">??뼱?곌린</button>
                </div>`;

            ov.appendChild(box);
            document.body.appendChild(ov);

            const applyAllCb = document.getElementById('fm-ow-apply-all');
            const close = (result) => { ov.remove(); resolve(result); };
            const saveasWrap = document.getElementById('fm-ow-saveas-wrap');
            const newfileInput = document.getElementById('fm-ow-newfile');

            const withApplyAll = (action, extra = {}) => ({
                action, applyToAll: !!applyAllCb?.checked, ...extra
            });

            document.getElementById('fm-ow-close').onclick = () => close(null);
            document.getElementById('fm-ow-skip').onclick = () => close(withApplyAll('skip'));
            document.getElementById('fm-ow-overwrite').onclick = () => close(withApplyAll('overwrite'));

            const checkSaveas = () => {
                const fn = newfileInput.value.trim();
                if (fn) close(withApplyAll('saveas', { filename: fn }));
            };
            document.getElementById('fm-ow-saveas').onclick = () => {
                if (saveasWrap.style.display === 'block') {
                    checkSaveas();
                } else {
                    saveasWrap.style.display = 'block';
                    newfileInput.value = fileName.replace(/\.[^.]+$/, '') + '_copy';
                    newfileInput.focus();
                    newfileInput.select();
                    document.getElementById('fm-ow-saveas').textContent = '?????;
                }
            };
            newfileInput.onkeydown = (e) => {
                if (e.key === 'Enter') checkSaveas();
                if (e.key === 'Escape') close(null);
            };

            ov.onclick = (e) => { if (e.target === ov) close(null); };
        });
    }

    /** inDB 媛?몄삤湲?紐⑤떖: ?대뜑 ?좏깮 + ?뚯씪 ?ㅼ쨷 ?좏깮 */
    function _showImportFromInDBModal(folderOptions, files) {
        return new Promise(resolve => {
            const existing = document.getElementById('fm-import-indb-modal');
            if (existing) existing.remove();

            const ov = document.createElement('div');
            ov.id = 'fm-import-indb-modal';
            ov.style.cssText = 'position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center';

            const selOptions = folderOptions.map(o => `<option value="${o.value}">${o.label}</option>`).join('');
            const fileRows = files.map(f => {
                const esc = (x) => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
                const p = esc(f.path);
                return `<label class="fm-import-row" style="display:flex;align-items:center;gap:8px;padding:4px 0;cursor:pointer;font-size:12px;color:var(--tx2)">
                    <input type="checkbox" data-path="${p}" class="fm-import-cb">
                    <span title="${p}">${p}</span>
                </label>`;
            }).join('');

            const box = document.createElement('div');
            box.style.cssText = 'background:var(--bg2);border:1px solid var(--bd);border-radius:12px;padding:20px 22px;min-width:360px;max-width:480px;width:90%;max-height:85vh;display:flex;flex-direction:column;box-shadow:0 8px 40px rgba(0,0,0,.5)';
            box.innerHTML = `
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-shrink:0">
                    <span style="font-size:14px;font-weight:700;color:var(--txh)">?뱿 inDB?먯꽌 媛?몄삤湲?/span>
                    <button id="fm-imp-close" style="background:none;border:none;cursor:pointer;color:var(--tx3);font-size:18px;line-height:1;padding:0 4px">??/button>
                </div>
                <div style="margin-bottom:10px;flex-shrink:0">
                    <label style="font-size:11px;color:var(--tx3);display:block;margin-bottom:4px">????대뜑</label>
                    <select id="fm-imp-folder" style="width:100%;background:var(--bg3);border:1px solid var(--bd);border-radius:6px;color:var(--tx);font-size:12px;padding:7px 10px;outline:none;cursor:pointer;box-sizing:border-box">
                        ${selOptions}
                    </select>
                </div>
                <div style="margin-bottom:8px;flex-shrink:0">
                    <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:11px;color:var(--tx3)">
                        <input type="checkbox" id="fm-imp-all"> ?꾩껜 ?좏깮
                    </label>
                </div>
                <div style="flex:1;min-height:0;overflow-y:auto;margin-bottom:14px;padding:4px 0;border:1px solid var(--bd);border-radius:6px;background:var(--bg3)" id="fm-imp-list">
                    ${fileRows}
                </div>
                <div style="display:flex;gap:8px;justify-content:flex-end;flex-shrink:0">
                    <button id="fm-imp-cancel" style="padding:6px 16px;border-radius:6px;border:1px solid var(--bd);background:var(--bg3);color:var(--tx2);font-size:12px;cursor:pointer">痍⑥냼</button>
                    <button id="fm-imp-ok" style="padding:6px 18px;border-radius:6px;border:none;background:var(--ac);color:#fff;font-size:12px;font-weight:600;cursor:pointer">??媛?몄삤湲?/button>
                </div>`;

            ov.appendChild(box);
            document.body.appendChild(ov);

            const listEl = document.getElementById('fm-imp-list');
            const allCb = document.getElementById('fm-imp-all');
            const cbs = listEl.querySelectorAll('.fm-import-cb');

            allCb.onchange = () => { cbs.forEach(cb => { cb.checked = allCb.checked; }); };
            listEl.querySelectorAll('.fm-import-row').forEach(row => {
                row.onclick = (e) => { if (e.target.type !== 'checkbox') row.querySelector('.fm-import-cb').click(); };
            });

            const close = (result) => { ov.remove(); resolve(result); };

            document.getElementById('fm-imp-close').onclick = () => close(null);
            document.getElementById('fm-imp-cancel').onclick = () => close(null);
            ov.onclick = (e) => { if (e.target === ov) close(null); };
            document.getElementById('fm-imp-ok').onclick = () => {
                const selected = [...cbs].filter(cb => cb.checked).map(cb => cb.dataset.path);
                close({ folderVal: document.getElementById('fm-imp-folder').value, selectedPaths: selected });
            };
        });
    }

    /* ?? 濡쒖뺄 ?뚯씪 ??젣 ?뺤씤 & ?ㅽ뻾 ?????????????????????? */
    function confirmDelete(btn) {
        const row = btn.closest('.file-item');
        const f   = row && row._fmFile;
        if (!f) return;
        DelConfirm.show({
            name : f.name,
            path : f.path,
            type : 'local',
            onConfirm: async () => {
                try {
                    /* File System Access API: 遺紐??대뜑 ?몃뱾?먯꽌 removeEntry */
                    const parentPath = (f.folder && f.folder !== '/') ? f.folder : '';

                    /* 1) 罹먯떆?먯꽌 癒쇱? ?먯깋
                       2) ?놁쑝硫?dirHandle?먯꽌 寃쎈줈 ?멸렇癒쇳듃瑜??곕씪 吏곸젒 ?먯깋 (怨듬갚 ?ы븿 寃쎈줈 ??? */
                    let parentHandle = parentPath ? _subHandles[parentPath] : dirHandle;
                    if (parentPath && !parentHandle) {
                        try {
                            let h = dirHandle;
                            for (const seg of parentPath.split('/')) {
                                h = await h.getDirectoryHandle(seg);
                            }
                            parentHandle = h;
                            _subHandles[parentPath] = h; /* 罹먯떆 ?깅줉 */
                        } catch(e2) { parentHandle = null; }
                    }

                    if (!parentHandle) throw new Error('?대뜑 ?몃뱾 ?놁쓬 ???대뜑瑜??ㅼ떆 ?좏깮?댁＜?몄슂');

                    /* ?곌린 沅뚰븳 ?붿껌 */
                    const perm = await dirHandle.requestPermission({ mode: 'readwrite' });
                    if (perm !== 'granted') throw new Error('?곌린 沅뚰븳??嫄곕??섏뿀?듬땲??);

                    /* ?ㅼ젣 ?뚯씪 ??젣 */
                    await parentHandle.removeEntry(f.name);

                    /* IDB 罹먯떆?먯꽌???쒓굅 */
                    await _idbDel('files', f.path);
                    allFiles = allFiles.filter(x => x.path !== f.path);
                    _applyFilters();

                    /* ?대젮 ?덈뒗 ??씠硫??リ린 */
                    const tab = TM.getAll().find(t => t.filePath === f.path || t.title === f.name.replace(/\.[^.]+$/, ''));
                    if (tab) TM.closeTab(tab.id);

                    _render();
                    App._toast(`?뿊 ${f.name} ??젣 ?꾨즺`);
                } catch(e) {
                    alert('??젣 ?ㅽ뙣: ' + (e.message || e));
                }
            },
        });
    }

    /* ?? 濡쒖뺄 ?뚯씪 ??mdliveData(GitHub) Push ?? */
    async function pushToGH(btn) {
        const row = btn.closest('.file-item');
        const f   = row && row._fmFile;
        if (!f) return;
        if (!GH.isConnected()) { alert('GitHub(mdliveData) ?곌껐 ?ㅼ젙???꾩슂?⑸땲??); return; }

        /* f.content??_scanDir?먯꽌 ?대? 濡쒕뱶??*/
        const content = f.content;
        if (content === undefined || content === null) {
            alert('?뚯씪 ?댁슜??遺덈윭?????놁뒿?덈떎. ?대뜑瑜??덈줈怨좎묠 ???ㅼ떆 ?쒕룄?섏꽭??');
            return;
        }

        btn.textContent = '??; btn.disabled = true;
        try {
            const ghCfg  = GH.cfg;
            const base   = ghCfg.basePath ? ghCfg.basePath.replace(/\/$/, '') + '/' : '';
            const path   = base + f.name;
            /* 湲곗〈 ?뚯씪 SHA 議고쉶 (?놁쑝硫??좉퇋 ?앹꽦) */
            let sha = null;
            try {
                const info = await fetch(
                    `https://api.github.com/repos/${ghCfg.repo}/contents/${encodeURIComponent(path)}?ref=${ghCfg.branch}`,
                    { headers: { 'Authorization': `token ${ghCfg.token}`, 'Accept': 'application/vnd.github.v3+json' } }
                ).then(r => r.ok ? r.json() : null);
                if (info?.sha) sha = info.sha;
            } catch(e) {}

            const b64  = btoa(unescape(encodeURIComponent(content)));
            const body = { message: `Upload: ${f.name}`, content: b64, branch: ghCfg.branch };
            if (sha) body.sha = sha;

            const res = await fetch(
                `https://api.github.com/repos/${ghCfg.repo}/contents/${encodeURIComponent(path)}`,
                {
                    method : 'PUT',
                    headers: {
                        'Authorization': `token ${ghCfg.token}`,
                        'Accept': 'application/vnd.github.v3+json',
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(body),
                }
            );
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(`GitHub ${res.status}: ${err.message || res.statusText}`);
            }
            btn.textContent = '?릻'; btn.disabled = false;
            App._toast(`?릻 mdliveData Push ?꾨즺: ${f.name}`);
            GH._render();
        } catch(e) {
            btn.textContent = '?릻'; btn.disabled = false;
            alert('push ?ㅽ뙣: ' + e.message);
        }
    }

    /* ?? 濡쒖뺄 ?뚯씪 ??md-viewer Push ?? */
    async function pushToViewer(btn) {
        const row = btn.closest('.file-item');
        const f   = row && row._fmFile;
        if (!f) return;

        /* f.content??_scanDir?먯꽌 ?대? 濡쒕뱶??*/
        const content = f.content;
        if (content === undefined || content === null) {
            alert('?뚯씪 ?댁슜??遺덈윭?????놁뒿?덈떎. ?대뜑瑜??덈줈怨좎묠 ???ㅼ떆 ?쒕룄?섏꽭??');
            return;
        }

        btn.textContent = '??; btn.disabled = true;
        try {
            btn.textContent = '?뱾'; btn.disabled = false;
            await PVShare.quickPush({ name: f.name, content });
        } catch(e) {
            btn.textContent = '?뱾'; btn.disabled = false;
            alert('push ?ㅽ뙣: ' + e.message);
        }
    }

    /* ?? 濡쒖뺄 ?대뜑 ??젣 ?????????????????????????????????? */
    async function confirmDeleteFolder(btn) {
        const folderPath = btn.dataset.path;
        const isEmpty    = btn.dataset.empty === 'true';
        if (!folderPath || !dirHandle) return;

        /* ?대뜑 ?몃뱾 ?뺤씤 ???놁쑝硫?遺紐⑥뿉???ы깘??*/
        let fHandle = _subHandles[folderPath];
        if (!fHandle) {
            /* 遺紐??몃뱾?먯꽌 吏곸젒 ?먯깋 ?쒕룄 */
            try {
                const parts2 = folderPath.split('/');
                const leafName = parts2.pop();
                const parentPath2 = parts2.join('/');
                const parentH = parentPath2 ? (_subHandles[parentPath2] || dirHandle) : dirHandle;
                if (parentH) fHandle = await parentH.getDirectoryHandle(leafName);
                if (fHandle) _subHandles[folderPath] = fHandle;
            } catch(e2) { /* silent */ }
        }
        if (!fHandle) {
            alert('?대뜑 ?몃뱾??李얠쓣 ???놁뒿?덈떎. ?덈줈怨좎묠(?? ???ㅼ떆 ?쒕룄?섏꽭??');
            return;
        }

        /* ?뺤씤 紐⑤떖 */
        const filesInFolder = allFiles.filter(f =>
            f.folder === folderPath || f.path.startsWith(folderPath + '/')
        );
        const fileCount = filesInFolder.length;

        const confirmed = await _showFolderDeleteModal(folderPath, isEmpty, fileCount);
        if (!confirmed) return;

        try {
            const perm = await dirHandle.requestPermission({ mode: 'readwrite' });
            if (perm !== 'granted') throw new Error('?곌린 沅뚰븳??嫄곕??섏뿀?듬땲??);

            /* 遺紐??몃뱾 李얘린 */
            const parts = folderPath.split('/');
            const folderName = parts.pop();
            const parentPath = parts.join('/');
            const parentHandle = parentPath ? (_subHandles[parentPath] || dirHandle) : dirHandle;

            if (!parentHandle) throw new Error('遺紐??대뜑 ?몃뱾 ?놁쓬');

            /* ?ш? ??젣 (recursive: true) ??Chrome 91+ 吏??*/
            await parentHandle.removeEntry(folderName, { recursive: true });

            /* 硫붾え由?텶DB?먯꽌 ?쒓굅 */
            const removed = allFiles.filter(f =>
                f.folder === folderPath || f.path.startsWith(folderPath + '/')
            );
            for (const f of removed) {
                await _idbDel('files', f.path);
                /* ?대젮?덈뒗 ??룄 ?リ린 */
                const tab = TM.getAll().find(t => t.filePath === f.path);
                if (tab) TM.closeTab(tab.id);
            }
            allFiles  = allFiles.filter(f => f.folder !== folderPath && !f.path.startsWith(folderPath + '/'));
            _applyFilters();
            delete _subHandles[folderPath];
            delete _emptyFolders[folderPath];

            App._toast(`?뿊 "${folderPath}" ?대뜑 ??젣 ?꾨즺`);
            _render();
        } catch(e) {
            alert('?대뜑 ??젣 ?ㅽ뙣: ' + (e.message || e));
        }
    }

    function _showFolderDeleteModal(folderPath, isEmpty, fileCount) {
        return new Promise(resolve => {
            const ov = document.createElement('div');
            ov.style.cssText = 'position:fixed;inset:0;z-index:9100;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center';

            const folderName = folderPath.split('/').pop();
            const warnHtml = isEmpty
                ? `<div style="font-size:11px;color:#6af7b0;margin-top:6px">??鍮??대뜑?낅땲?? ?덉쟾?섍쾶 ??젣?⑸땲??</div>`
                : `<div style="font-size:11px;color:#f7a06a;margin-top:6px;line-height:1.7">
                    ?????대뜑 ?덉쓽 <b style="color:#ff8080">${fileCount}媛??뚯씪</b>??紐⑤몢 ?곴뎄 ??젣?⑸땲??<br>
                    ??젣???뚯씪? 蹂듦뎄?????놁뒿?덈떎.
                   </div>`;

            const box = document.createElement('div');
            box.style.cssText = 'background:var(--bg2);border:2px solid rgba(247,106,106,.4);border-radius:12px;padding:20px 22px;min-width:320px;max-width:420px;width:90%;box-shadow:0 8px 40px rgba(0,0,0,.6)';
            box.innerHTML = `
                <div style="display:flex;align-items:center;gap:9px;margin-bottom:14px">
                    <span style="font-size:20px">?뿊</span>
                    <span style="font-size:14px;font-weight:700;color:#f76a6a">?대뜑 ??젣</span>
                </div>
                <div style="background:rgba(247,106,106,.08);border:1px solid rgba(247,106,106,.3);border-radius:8px;padding:12px 14px;margin-bottom:14px">
                    <div style="font-size:11px;color:var(--tx3);margin-bottom:4px">??젣???대뜑</div>
                    <div style="font-size:14px;font-weight:700;color:#f76a6a">${_esc(folderName)}</div>
                    <div style="font-size:10px;color:var(--tx3);font-family:var(--fm)">${_esc(folderPath)}</div>
                    ${warnHtml}
                </div>
                <div style="display:flex;gap:8px;justify-content:flex-end">
                    <button id="fdel-cancel" style="padding:6px 16px;border-radius:6px;border:1px solid var(--bd);background:var(--bg3);color:var(--tx2);font-size:12px;cursor:pointer">痍⑥냼</button>
                    <button id="fdel-ok" style="padding:6px 18px;border-radius:6px;border:none;background:rgba(247,106,106,.2);border:1px solid rgba(247,106,106,.5);color:#f76a6a;font-size:12px;font-weight:700;cursor:pointer">?뿊 ??젣 ?뺤씤</button>
                </div>`;
            ov.appendChild(box);
            document.body.appendChild(ov);

            const close = (v) => { ov.remove(); resolve(v); };
            document.getElementById('fdel-cancel').onclick = () => close(false);
            ov.onclick = (e) => { if (e.target === ov) close(false); };
            document.getElementById('fdel-ok').onclick = () => close(true);
        });
    }

    /* 濡쒖뺄: ?붾젆?곕━ ?몃━瑜??ш? 蹂듭궗?쒕떎(理쒕? depth, 諛붿씠?덈━ ?덉쟾) */
    async function _fmCopyDirTree(srcDir, destDir, maxDepth) {
        if (maxDepth <= 0) return;
        for await (const ent of srcDir.values()) {
            if (ent.kind === 'file') {
                const fh  = await srcDir.getFileHandle(ent.name);
                const file = await fh.getFile();
                const out = await destDir.getFileHandle(ent.name, { create: true });
                const w   = await out.createWritable();
                await w.write(await file.arrayBuffer());
                await w.close();
            } else if (ent.kind === 'directory') {
                const subSrc = await srcDir.getDirectoryHandle(ent.name);
                const subDst = await destDir.getDirectoryHandle(ent.name, { create: true });
                await _fmCopyDirTree(subSrc, subDst, maxDepth - 1);
            }
        }
    }

    /** 濡쒖뺄: dirHandle 湲곗??쇰줈 ?대뜑瑜??ㅻⅨ ?쇰━ 寃쎈줈濡???린嫄곕굹 ?대쫫留?諛붽씔??move API ?곗꽑, ?ㅽ뙣 ??蹂듭궗+??젣) */
    async function _fmRelocateFolderLogical(oldFull, newFull) {
        const oldFullN = String(oldFull || '').replace(/\/$/, '');
        const newFullN = String(newFull || '').replace(/\/$/, '');
        if (oldFullN === newFullN) return;
        const perm = await dirHandle.requestPermission({ mode: 'readwrite' });
        if (perm !== 'granted') throw new Error('?곌린 沅뚰븳??嫄곕??섏뿀?듬땲??);

        const oldParts = oldFullN.split('/').filter(Boolean);
        const oldLeaf  = oldParts.pop();
        const oldPar   = oldParts.join('/');
        const newParts = newFullN.split('/').filter(Boolean);
        const newLeaf  = newParts.pop();
        const newPar   = newParts.join('/');

        const walkTo = async (pathStr) => {
            let h = dirHandle;
            if (!pathStr) return h;
            for (const seg of pathStr.split('/')) {
                h = await h.getDirectoryHandle(seg);
            }
            return h;
        };

        const oldParentH = await walkTo(oldPar);
        const newParentH = await walkTo(newPar);
        const srcDir     = await oldParentH.getDirectoryHandle(oldLeaf);

        if (typeof srcDir.move === 'function') {
            try {
                if (!newPar || newPar === oldPar) await srcDir.move(newLeaf);
                else await srcDir.move(newLeaf, { parent: newParentH });
                return;
            } catch (moveErr) {
                console.warn('FM._fmRelocateFolderLogical move', moveErr);
            }
        }
        const dstDir = await newParentH.getDirectoryHandle(newLeaf, { create: true });
        await _fmCopyDirTree(srcDir, dstDir, 16);
        await oldParentH.removeEntry(oldLeaf, { recursive: true });
    }

    /** ?대┛ ??쓽 filePath?먯꽌 ?대뜑 ?묐몢?대? ?쇨큵 移섑솚?쒕떎 */
    function _fmRemapOpenTabsFolderPrefix(oldP, newP) {
        if (typeof TM === 'undefined' || !TM.getAll) return;
        TM.getAll().forEach(t => {
            const fp = t.filePath;
            if (!fp) return;
            if (fp === oldP) t.filePath = newP;
            else if (fp.startsWith(oldP + '/')) t.filePath = newP + fp.slice(oldP.length);
        });
        TM.renderTabs();
        if (TM.persist) TM.persist();
    }

    /** ?좉툑 ?대뜑 寃쎈줈 ?묐몢??移섑솚 */
    function _fmRemapLockedFoldersPrefix(oldP, newP) {
        const locked = _getLockedFolders();
        const out    = new Set();
        locked.forEach(p => {
            if (p === oldP) out.add(newP);
            else if (p.startsWith(oldP + '/')) out.add(newP + p.slice(oldP.length));
            else out.add(p);
        });
        _setLockedFolders(out);
    }

    /* ?? 濡쒖뺄 ?뚯씪紐?蹂寃?????????????????????????????????? */
    async function renameFile(btn) {
        const row = btn.closest('.file-item');
        const f   = row && row._fmFile;
        if (!f) return;
        const input = prompt('???뚯씪紐?(?뺤옣???ы븿)', f.name);
        if (input == null) return;
        const newName = String(input).trim().replace(/[\\/:*?"<>|]/g, '_');
        if (!newName || newName === f.name) return;
        const destPath = f.folder === '/' ? newName : f.folder + '/' + newName;
        if (destPath === f.path) return;
        if (allFiles.some(x => x.path === destPath)) {
            alert('媛숈? ?대쫫???뚯씪???대? ?덉뒿?덈떎.');
            return;
        }
        try {
            const perm = await dirHandle.requestPermission({ mode: 'readwrite' });
            if (perm !== 'granted') throw new Error('?곌린 沅뚰븳??嫄곕??섏뿀?듬땲??);
            const srcParentPath   = f.folder === '/' ? '' : f.folder;
            const srcParentHandle = srcParentPath ? (_subHandles[srcParentPath] || dirHandle) : dirHandle;
            const srcFileHandle   = await srcParentHandle.getFileHandle(f.name);
            const srcFile         = await srcFileHandle.getFile();
            const srcContent      = await srcFile.text();
            const newFH           = await srcParentHandle.getFileHandle(newName, { create: true });
            const wr              = await newFH.createWritable();
            await wr.write(srcContent);
            await wr.close();
            await srcParentHandle.removeEntry(f.name);
            const tab = TM.getAll().find(t => t.filePath === f.path);
            if (tab) {
                tab.filePath    = destPath;
                tab.title       = newName.replace(/\.[^.]+$/, '');
                tab._fileHandle = newFH;
                TM.renderTabs();
            }
            await _idbDel('files', f.path);
            _subHandles = {};
            _emptyFolders = {};
            await _syncFromHandle();
            App._toast(`???뚯씪紐?蹂寃? ${newName}`);
        } catch (e) {
            alert('?뚯씪紐?蹂寃??ㅽ뙣: ' + (e.message || e));
        }
    }

    /* ?? 濡쒖뺄 ?대뜑紐?蹂寃?????????????????????????????????? */
    async function renameFolder(btn) {
        const folderPath = (btn.dataset.path || '').replace(/\/$/, '');
        if (!folderPath || !dirHandle) return;
        const parts = folderPath.split('/').filter(Boolean);
        const leaf    = parts.pop();
        if (!leaf) return;
        const parentPath = parts.join('/');
        const input = prompt('???대뜑 ?대쫫', leaf);
        if (input == null) return;
        const newLeaf = String(input).trim().replace(/[\\/:*?"<>|]/g, '_').replace(/\/+/g, '');
        if (!newLeaf || newLeaf === leaf) return;
        const newFull = parentPath ? parentPath + '/' + newLeaf : newLeaf;
        if (newFull === folderPath) return;
        const clash = allFiles.some(f => {
            if (f.path === folderPath || f.path.startsWith(folderPath + '/')) return false;
            return f.path === newFull || f.path.startsWith(newFull + '/');
        });
        if (clash) {
            alert('???寃쎈줈???대? ?뚯씪???덉뼱 痍⑥냼?덉뒿?덈떎.');
            return;
        }
        try {
            await _fmRelocateFolderLogical(folderPath, newFull);
            _fmRemapOpenTabsFolderPrefix(folderPath, newFull);
            _fmRemapLockedFoldersPrefix(folderPath, newFull);
            _subHandles = {};
            _emptyFolders = {};
            await _syncFromHandle();
            App._toast(`???대뜑紐?蹂寃? ${newLeaf}`);
        } catch (e) {
            alert('?대뜑紐?蹂寃??ㅽ뙣: ' + (e.message || e));
        }
    }

    /* ?? 濡쒖뺄 ?대뜑 ?대룞 (?곸쐞 ?대뜑留?蹂寃? ?대쫫 ?좎?) ??? */
    async function moveFolder(btn) {
        const folderPath = (btn.dataset.path || '').replace(/\/$/, '');
        if (!folderPath || !dirHandle) return;
        const parts      = folderPath.split('/').filter(Boolean);
        const leaf       = parts.pop();
        if (!leaf) return;
        const parentPath = parts.join('/');
        const isUnderMoved = (p) => p === folderPath || (folderPath && p.startsWith(folderPath + '/'));

        const folderOptions = [{ label: '?뱚 (猷⑦듃)', value: '/' }];
        Object.keys(_subHandles).sort().forEach(p => {
            if (isUnderMoved(p)) return;
            if (parentPath && p === parentPath) return;
            const depth = p.split('/').length - 1;
            folderOptions.push({
                label: '?뱛 ' + '  '.repeat(depth) + p.split('/').pop() + '  (' + p + ')',
                value: p,
            });
        });
        Object.keys(_emptyFolders).sort().forEach(p => {
            if (isUnderMoved(p) || _subHandles[p]) return;
            if (parentPath && p === parentPath) return;
            const depth = p.split('/').length - 1;
            folderOptions.push({
                label: '?뱛 ' + '  '.repeat(depth) + p.split('/').pop() + '  (' + p + ')',
                value: p,
            });
        });

        const destFolder = await _showMoveModal(leaf, folderOptions, '?벀 ?대뜑 ?대룞');
        if (destFolder === null) return;
        const newFull = destFolder === '/' ? leaf : destFolder + '/' + leaf;
        if (newFull === folderPath) {
            App._toast('媛숈? ?대뜑?낅땲??);
            return;
        }
        const clash = allFiles.some(f => {
            if (f.path === folderPath || f.path.startsWith(folderPath + '/')) return false;
            return f.path === newFull || f.path.startsWith(newFull + '/');
        });
        if (clash) {
            alert('???寃쎈줈???대? ?뚯씪???덉뼱 痍⑥냼?덉뒿?덈떎.');
            return;
        }
        try {
            await _fmRelocateFolderLogical(folderPath, newFull);
            _fmRemapOpenTabsFolderPrefix(folderPath, newFull);
            _fmRemapLockedFoldersPrefix(folderPath, newFull);
            _subHandles = {};
            _emptyFolders = {};
            await _syncFromHandle();
            App._toast(`???대뜑 ?대룞 ?꾨즺`);
        } catch (e) {
            alert('?대뜑 ?대룞 ?ㅽ뙣: ' + (e.message || e));
        }
    }

    /* ?? 濡쒖뺄 ?뚯씪 ?대룞 ?????????????????????????????????? */
    async function moveFile(btn) {
        const row = btn.closest('.file-item');
        const f   = row && row._fmFile;
        if (!f) return;

        /* ?대룞 媛?ν븳 ?대뜑 紐⑸줉 (?꾩옱 ?대뜑 ?쒖쇅) */
        const currentFolder = f.folder || '/';
        const folderOptions = [{ label: '?뱚 (猷⑦듃)', value: '/' }];
        Object.keys(_subHandles).sort().forEach(p => {
            if (p !== currentFolder) {
                const depth = p.split('/').length - 1;
                folderOptions.push({
                    label: '?뱛 ' + '  '.repeat(depth) + p.split('/').pop() + '  (' + p + ')',
                    value: p
                });
            }
        });
        Object.keys(_emptyFolders).sort().forEach(p => {
            if (p !== currentFolder && !_subHandles[p]) {
                const depth = p.split('/').length - 1;
                folderOptions.push({
                    label: '?뱛 ' + '  '.repeat(depth) + p.split('/').pop() + '  (' + p + ')',
                    value: p
                });
            }
        });

        const destFolder = await _showMoveModal(f.name, folderOptions);
        if (destFolder === null) return;  /* 痍⑥냼 */

        const destPath = destFolder === '/' ? f.name : destFolder + '/' + f.name;
        if (destPath === f.path) { App._toast('媛숈? ?대뜑?낅땲??); return; }

        try {
            const perm = await dirHandle.requestPermission({ mode: 'readwrite' });
            if (perm !== 'granted') throw new Error('?곌린 沅뚰븳??嫄곕??섏뿀?듬땲??);

            /* ?먮낯 ?뚯씪 ?쎄린 */
            const srcParentPath = f.folder === '/' ? '' : f.folder;
            const srcParentHandle = srcParentPath ? (_subHandles[srcParentPath] || dirHandle) : dirHandle;
            const srcFileHandle = await srcParentHandle.getFileHandle(f.name);
            const srcFile = await srcFileHandle.getFile();
            const srcContent = await srcFile.text();

            /* ????대뜑???뚯씪 ?곌린 */
            const destFolderPath = destFolder === '/' ? '' : destFolder;
            const destHandle = destFolderPath ? (_subHandles[destFolderPath] || dirHandle) : dirHandle;
            const newFH = await destHandle.getFileHandle(f.name, { create: true });
            const wr = await newFH.createWritable();
            await wr.write(srcContent);
            await wr.close();

            /* ?먮낯 ??젣 */
            await srcParentHandle.removeEntry(f.name);

            /* ??쓽 filePath ?낅뜲?댄듃 */
            const tab = TM.getAll().find(t => t.filePath === f.path);
            if (tab) {
                tab.filePath = destPath;
                tab._fileHandle = newFH;
                TM.renderTabs();
            }

            /* IDB 媛깆떊 */
            await _idbDel('files', f.path);
            _subHandles = {};
            _emptyFolders = {};
            await _syncFromHandle();
            App._toast(`??"${f.name}" ??"${destFolder === '/' ? '猷⑦듃' : destFolder}" ?대룞 ?꾨즺`);
        } catch(e) {
            alert('?뚯씪 ?대룞 ?ㅽ뙣: ' + (e.message || e));
        }
    }

    /** ?대룞 ????대뜑 ?좏깮 紐⑤떖 (?뚯씪쨌?대뜑 怨듯넻, title 吏??媛?? */
    function _showMoveModal(fileName, folderOptions, title) {
        return new Promise(resolve => {
            const ov = document.createElement('div');
            ov.style.cssText = 'position:fixed;inset:0;z-index:9100;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center';
            const box = document.createElement('div');
            box.style.cssText = 'background:var(--bg2);border:1px solid var(--bd);border-radius:12px;padding:20px 22px;min-width:320px;max-width:420px;width:90%;box-shadow:0 8px 40px rgba(0,0,0,.6)';
            const head = title || '?벀 ?뚯씪 ?대룞';
            box.innerHTML = `
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
                    <span style="font-size:14px;font-weight:700;color:var(--txh)">${_esc(head)}</span>
                    <button id="fmov-close" style="background:none;border:none;cursor:pointer;color:var(--tx3);font-size:18px;line-height:1;padding:0 4px">??/button>
                </div>
                <div style="font-size:12px;color:var(--tx2);margin-bottom:12px;padding:8px 10px;background:var(--bg3);border-radius:6px">
                    ?뱷 <b>${_esc(fileName)}</b>
                </div>
                <div style="margin-bottom:16px">
                    <label style="font-size:11px;color:var(--tx3);display:block;margin-bottom:5px">?대룞???대뜑 ?좏깮</label>
                    <select id="fmov-dest" style="width:100%;background:var(--bg3);border:1px solid var(--bd);border-radius:6px;color:var(--tx);font-size:12px;padding:7px 10px;outline:none;cursor:pointer;box-sizing:border-box">
                        ${folderOptions.map(o => `<option value="${o.value}">${o.label}</option>`).join('')}
                    </select>
                </div>
                <div style="display:flex;gap:8px;justify-content:flex-end">
                    <button id="fmov-cancel" style="padding:6px 16px;border-radius:6px;border:1px solid var(--bd);background:var(--bg3);color:var(--tx2);font-size:12px;cursor:pointer">痍⑥냼</button>
                    <button id="fmov-ok" style="padding:6px 18px;border-radius:6px;border:none;background:var(--ac);color:#fff;font-size:12px;font-weight:600;cursor:pointer">???대룞</button>
                </div>`;
            ov.appendChild(box);
            document.body.appendChild(ov);

            const close = (v) => { ov.remove(); resolve(v); };
            document.getElementById('fmov-close').onclick = () => close(null);
            document.getElementById('fmov-cancel').onclick = () => close(null);
            ov.onclick = (e) => { if (e.target === ov) close(null); };
            document.getElementById('fmov-ok').onclick = () => {
                close(document.getElementById('fmov-dest').value);
            };
        });
    }

    /* ?? 濡쒖뺄 ?대뜑瑜??먯깋湲곗뿉???닿린 (FM ?ㅼ퐫?? ??
       釉뚮씪?곗? ?뺤콉?쇰줈 吏곸젒 ?????놁쑝硫?紐⑤떖濡?二쇱냼 ?쒖떆 + ?먮룞 蹂듭궗 */
    const FOPEN_SAVE_KEY = 'fm_custom_folder_path_';
    function openInExplorer() {
        if (!dirHandle) { App._toast('???대뜑瑜?癒쇱? ?좏깮?섏꽭??); return; }
        const defaultPath = folderName;
        const savedPath = localStorage.getItem(FOPEN_SAVE_KEY + defaultPath);
        const initialValue = (savedPath && savedPath.trim()) ? savedPath : defaultPath;
        const ov = document.createElement('div');
        ov.style.cssText = 'position:fixed;inset:0;z-index:9100;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center';
        ov.innerHTML = `
            <div style="background:var(--bg2);border:1px solid var(--bd);border-radius:12px;padding:20px 22px;min-width:320px;max-width:440px;width:90%;box-shadow:0 8px 40px rgba(0,0,0,.6)">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
                    <span style="font-size:14px;font-weight:700;color:var(--txh)">?뱛 ?대뜑 ?닿린 ?덈궡</span>
                    <button id="fopen-close" style="background:none;border:none;cursor:pointer;color:var(--tx3);font-size:18px;line-height:1;padding:0 4px">??/button>
                </div>
                <div style="font-size:11px;color:var(--tx3);margin-bottom:12px;line-height:1.6">
                    釉뚮씪?곗? 蹂댁븞 ?뺤콉?쇰줈 ?대떦 ?대뜑瑜?吏곸젒 ?????놁뒿?덈떎.<br>
                    ?꾨옒 ?대뜑 二쇱냼瑜??섏젙쨌??ν븯嫄곕굹 蹂듭궗?섏뿬 ?먯깋湲?二쇱냼李쎌뿉 遺숈뿬?ｌ쑝?몄슂.
                </div>
                <input type="text" id="fopen-path" style="width:100%;box-sizing:border-box;background:var(--bg3);border:1px solid var(--bd);border-radius:6px;padding:10px 12px;font-size:12px;font-family:monospace;color:var(--tx2);margin-bottom:14px;outline:none">
                <div style="display:flex;gap:8px;justify-content:flex-end">
                    <button id="fopen-save" style="padding:6px 14px;border-radius:6px;border:1px solid rgba(88,200,248,.4);background:rgba(88,200,248,.15);color:#58c8f8;font-size:12px;cursor:pointer">?뮶 ???/button>
                    <button id="fopen-copy" style="padding:6px 14px;border-radius:6px;border:1px solid rgba(106,247,176,.4);background:rgba(106,247,176,.15);color:#6af7b0;font-size:12px;cursor:pointer">?뱥 蹂듭궗</button>
                    <button id="fopen-ok" style="padding:6px 14px;border-radius:6px;border:1px solid var(--bd);background:var(--bg3);color:var(--tx2);font-size:12px;cursor:pointer">?リ린</button>
                </div>
            </div>`;
        document.body.appendChild(ov);
        const pathInput = document.getElementById('fopen-path');
        if (pathInput) pathInput.value = initialValue;
        const getValue = () => (pathInput && pathInput.value) ? pathInput.value.trim() : defaultPath;
        const doCopy = () => {
            const val = getValue();
            navigator.clipboard.writeText(val).then(() => {
                App._toast('?뱥 ?대뜑 二쇱냼媛 蹂듭궗?섏뿀?듬땲??);
            }).catch(() => {
                const ta = document.createElement('textarea');
                ta.value = val;
                ta.style.cssText = 'position:fixed;left:-9999px';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                ta.remove();
                App._toast('?뱥 ?대뜑 二쇱냼媛 蹂듭궗?섏뿀?듬땲??);
            });
        };
        const doSave = () => {
            const val = getValue();
            if (val) {
                localStorage.setItem(FOPEN_SAVE_KEY + defaultPath, val);
                App._toast('?뮶 ??λ릺?덉뒿?덈떎');
            }
        };
        doCopy();  /* 李??대┝怨??숈떆???먮룞 蹂듭궗 */
        document.getElementById('fopen-close').onclick = () => ov.remove();
        document.getElementById('fopen-ok').onclick = () => ov.remove();
        document.getElementById('fopen-save').onclick = () => doSave();
        document.getElementById('fopen-copy').onclick = () => doCopy();
        ov.onclick = (e) => { if (e.target === ov) ov.remove(); };
    }

    /** .mdp?먯꽌 蹂듭썝: files 諛곗뿴??IDB????ν븯怨?UI 媛깆떊 (罹먯떆 紐⑤뱶) */
    async function restoreFromMdp(filesArr, name) {
        if (!filesArr || !Array.isArray(filesArr) || !filesArr.length) return false;
        dirHandle = null;
        folderName = name || 'mdp-import';
        const normalized = filesArr.map(f => {
            const path = (f.path || '').trim();
            if (!path) return null;
            const parts = path.split('/');
            const fileName = parts.pop() || 'untitled';
            const folder = parts.length ? parts.join('/') : '/';
            const ext = (f.ext || fileName.split('.').pop() || 'md').toLowerCase();
            return {
                name: f.name || fileName,
                ext: ['md','txt','html'].includes(ext) ? ext : 'md',
                folder,
                path,
                content: (f.content != null) ? String(f.content) : '',
                modified: f.modified || Date.now()
            };
        }).filter(Boolean);
        allFiles = normalized;
        _applyFilters();
        await _idbClearStore('files');
        const db = await _getDB();
        await new Promise((res, rej) => {
            const tx = db.transaction('files', 'readwrite');
            const st = tx.objectStore('files');
            normalized.forEach(f => st.put(f, f.path));
            tx.oncomplete = res;
            tx.onerror    = ev => rej(ev.target.error);
        });
        await _idbPut('meta', 'root', { folderName, fileCount: normalized.length, syncedAt: Date.now() });
        setTimeout(() => {
            _setFolderUI(folderName, false);
            _render();
        }, 0);
        return true;
    }

    return { restore, selectFolder, changeFolder, refresh, search, openInExplorer, toggleFoldAll, toggleShowHidden,
             syncToGitHub, pullFromGitHub, cloneFromGitHub, downloadGitHubZip, createFolder, createLocalFile, createFileInFolder,
             importFromInDB, confirmDelete, confirmDeleteFolder, moveFile, renameFile, moveFolder, renameFolder, pushToGH, pushToViewer,
             getFiles: () => allFiles,
             getFolderName: () => folderName,
             restoreFromMdp,
             highlightPathForSaved,
             _setBaseSHAsFromRemote, _render };
})();
