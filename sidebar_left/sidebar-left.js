(function () {
    'use strict';

    let activeTab = 'files';
    let lastTocItems = [];

    function esc(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function shortText(text, n) {
        return Array.from(String(text || '').trim()).slice(0, n).join('');
    }

    function buildFolderPath(folders, folderId) {
        const rows = Array.isArray(folders) ? folders : [];
        const byId = new Map(rows.map(function (folder) {
            return [String(folder && folder.id || ''), folder || {}];
        }));
        const targetId = String(folderId || 'root');
        if (targetId === 'root') {
            const rootFolder = byId.get('root');
            return String(rootFolder && rootFolder.name || 'ROOT');
        }

        const names = [];
        const visited = new Set();
        let currentId = targetId;
        while (currentId && currentId !== 'root' && !visited.has(currentId)) {
            visited.add(currentId);
            const folder = byId.get(currentId);
            if (!folder) break;
            names.unshift(String(folder.name || currentId));
            currentId = String(folder.parentId || 'root');
        }
        return names.length ? names.join(' / ') : 'ROOT';
    }

    function buildFolderTreeModel(folders, documents, searchTerm) {
        const normalizedFolders = (Array.isArray(folders) ? folders : []).filter(function (folder) {
            return folder && String(folder.id || '').trim();
        });
        if (!normalizedFolders.some(function (folder) { return String(folder.id) === 'root'; })) {
            normalizedFolders.push({ id: 'root', name: 'ROOT', parentId: null });
        }

        const folderById = new Map(normalizedFolders.map(function (folder) {
            return [String(folder.id), folder];
        }));
        const topLevel = [];
        const childrenByParent = new Map();
        normalizedFolders.forEach(function (folder) {
            const id = String(folder.id);
            const parentId = id === 'root' ? '' : String(folder.parentId || 'root');
            if (!parentId || parentId === 'root' || parentId === id || !folderById.has(parentId)) {
                topLevel.push(folder);
                return;
            }
            if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
            childrenByParent.get(parentId).push(folder);
        });

        const documentsByFolder = new Map();
        (Array.isArray(documents) ? documents : []).forEach(function (documentRecord) {
            let folderId = String(documentRecord && documentRecord.folderId || 'root');
            if (!folderById.has(folderId)) folderId = 'root';
            if (!documentsByFolder.has(folderId)) documentsByFolder.set(folderId, []);
            documentsByFolder.get(folderId).push(documentRecord);
        });

        let visibleFolderIds = null;
        if (String(searchTerm || '').trim()) {
            visibleFolderIds = new Set();
            documentsByFolder.forEach(function (items, folderId) {
                if (!items.length) return;
                let currentId = folderId;
                const visited = new Set();
                while (currentId && !visited.has(currentId)) {
                    visited.add(currentId);
                    visibleFolderIds.add(currentId);
                    const folder = folderById.get(currentId);
                    if (!folder || currentId === 'root') break;
                    currentId = String(folder.parentId || 'root');
                }
            });
        }

        return { folders: normalizedFolders, folderById, topLevel, childrenByParent, documentsByFolder, visibleFolderIds };
    }

    function beginDocumentTitleEdit(titleElement, documentRecord, ctx, cancelPendingClick) {
        if (!titleElement || titleElement.dataset.editing === '1') return;
        if (typeof cancelPendingClick === 'function') cancelPendingClick();
        titleElement.dataset.editing = '1';

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'sidebar-doc-title-input';
        input.value = String(documentRecord && documentRecord.title || '');
        input.setAttribute('aria-label', '문서명 수정');
        input.title = 'Enter로 저장 · Esc로 취소';
        let finished = false;

        function restore() {
            if (finished) return;
            finished = true;
            delete titleElement.dataset.editing;
            if (input.parentNode) input.replaceWith(titleElement);
        }

        async function commit() {
            if (finished) return;
            const nextTitle = String(input.value || '').trim().replace(/\.md$/i, '');
            const previousTitle = String(documentRecord && documentRecord.title || '');
            if (!nextTitle || nextTitle === previousTitle) {
                restore();
                return;
            }
            finished = true;
            input.disabled = true;
            try {
                if (!ctx || typeof ctx.renameDocument !== 'function') throw new Error('문서명 변경 기능을 사용할 수 없습니다.');
                const updated = await ctx.renameDocument(documentRecord.id, nextTitle);
                documentRecord.title = String(updated && updated.title || nextTitle);
                if (updated && updated.version) documentRecord.version = updated.version;
                titleElement.textContent = documentRecord.title;
                titleElement.title = documentRecord.title + ' · 더블클릭하여 이름 수정';
            } catch (error) {
                if (typeof window.showToast === 'function') {
                    window.showToast('문서명 변경 실패: ' + (error && error.message ? error.message : error));
                }
            }
            delete titleElement.dataset.editing;
            if (input.parentNode) input.replaceWith(titleElement);
        }

        input.addEventListener('click', function (event) { event.stopPropagation(); });
        input.addEventListener('dblclick', function (event) { event.stopPropagation(); });
        input.addEventListener('keydown', function (event) {
            event.stopPropagation();
            if (event.key === 'Enter') {
                event.preventDefault();
                commit();
            } else if (event.key === 'Escape') {
                event.preventDefault();
                restore();
            }
        });
        input.addEventListener('blur', commit);
        titleElement.replaceWith(input);
        input.focus();
        input.select();
    }

    function getSidebarShellHtml() {
        return [
            '<div class="p-4 border-b border-slate-200 dark:border-slate-700 space-y-4">',
            '  <div class="flex items-center gap-2 mb-2 sidebar-text">',
            '    <button onclick="openBackupModal()" class="shrink-0 flex items-center justify-center p-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 rounded text-slate-700 dark:text-slate-200 transition-colors" title="내문서 백업" aria-label="내문서 백업"><i data-lucide="archive" class="w-4 h-4"></i></button>',
            '    <button onclick="openMergeModal()" class="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 rounded text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors" title="문서 묶기"><i data-lucide="layers" class="w-3.5 h-3.5"></i><span>merge</span></button>',
            '    <button id="btn-highlight-popup" onclick="openHighlightPopup()" class="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 rounded text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors" title="하이라이트 열기"><i data-lucide="highlighter" class="w-3.5 h-3.5"></i><span>Highlight</span></button>',
            '  </div>',
            '  <div class="flex items-center justify-between sidebar-header-btns">',
            '    <div class="flex bg-slate-200 dark:bg-slate-800 rounded p-1 w-full mr-2 sidebar-text">',
            '      <button onclick="switchSidebarTab(\'files\')" id="tab-files" class="flex-1 text-xs font-bold py-1 bg-white dark:bg-slate-700 rounded shadow-sm text-slate-800 dark:text-white transition-colors">파일</button>',
            '      <button onclick="switchSidebarTab(\'toc\')" id="tab-toc" class="flex-1 text-xs font-bold py-1 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-colors">목차</button>',
            '    </div>',
            '    <div class="flex gap-1 shrink-0">',
            '      <button onclick="createNewFolder()" id="btn-new-folder" class="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-500 dark:text-slate-400" title="폴더 생성"><i data-lucide="folder-plus" class="w-4 h-4"></i></button>',
            '      <button onclick="toggleSidebarCollapse()" class="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-500 dark:text-slate-400" title="사이드바 축소/확장"><i id="collapse-icon" data-lucide="chevron-left" class="w-4 h-4"></i></button>',
            '    </div>',
            '  </div>',
            '  <div id="storage-source-tabs" class="hidden items-center gap-1">',
            '    <button type="button" id="tab-storage-local" onclick="switchStorageSourceTab(\'local\')" class="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200" title="로컬 폴더를 탐색기처럼 열기"><i data-lucide="folder-open" class="w-3.5 h-3.5"></i><span>Local</span></button>',
            '    <button type="button" id="tab-storage-indb" onclick="switchStorageSourceTab(\'indb\')" class="px-2 py-1 text-xs font-semibold border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200">inDB</button>',
            '    <button type="button" id="tab-storage-sqlite" onclick="switchStorageSourceTab(\'sqlite\')" class="px-2 py-1 text-xs font-semibold border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200" title="로컬 SQLite 저장소">SQLite</button>',
            '    <button type="button" id="tab-storage-github" onclick="switchStorageSourceTab(\'github\')" class="px-2 py-1 text-xs font-semibold border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200">github</button>',
            '    <a id="tab-storage-github-link" href="#" target="_blank" rel="noopener noreferrer" onclick="return openGithubRepositoryLink(event)" class="hidden px-1.5 py-1 text-[10px] font-bold border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700" title="GitHub 로그인 후 저장소 열기">↗</a>',
            '  </div>',
            '  <div id="storage-sync-status" class="hidden text-[10px] px-2 py-1 rounded border" role="status" aria-live="polite"></div>',
            '  <div class="relative search-container" id="search-container">',
            '    <i data-lucide="search" class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 search-icon-only"></i>',
            '    <input type="text" id="db-search" oninput="scheduleStorageSearch()" placeholder="문서 제목·본문 검색..." class="w-full pl-9 pr-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-md text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500">',
            '  </div>',
            '</div>',
            '<div id="db-list" class="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1"></div>',
            '<div id="toc-list" class="hidden flex-1 overflow-y-auto custom-scrollbar p-2"></div>',
            '<div class="p-2 border-t border-slate-200 dark:border-slate-700">',
            '  <div class="flex items-center gap-2">',
            '    <button type="button" id="btn-github-sync" onclick="pullGithubRepo()" class="hidden flex-1 items-center justify-center gap-2 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-md text-xs font-semibold text-white transition-colors" title="GitHub 저장소에서 Pull 동기화"><i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i><span class="sidebar-text" id="github-sync-label">sync</span></button>',
            '    <button type="button" onclick="clearUnusedCache()" class="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 rounded-md text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors" title="Clear temporary cache"><i data-lucide="refresh-ccw" class="w-3.5 h-3.5"></i><span class="sidebar-text">MDpro Viewer</span></button>',
            '  </div>',
            '</div>'
        ].join('');
    }

    function installSidebarShell() {
        const sidebar = document.getElementById('sidebar');
        if (!sidebar) return;

        const hasSidebarShell = !!(
            sidebar.querySelector('#db-list')
            && sidebar.querySelector('#toc-list')
            && sidebar.querySelector('#storage-source-tabs')
        );
        if (sidebar.dataset.sidebarLeftReady === '1' && hasSidebarShell) return;

        if (!hasSidebarShell) {
            const resizeHandle = sidebar.querySelector('#sidebar-resize-handle');
            if (resizeHandle) resizeHandle.insertAdjacentHTML('beforebegin', getSidebarShellHtml());
            else sidebar.insertAdjacentHTML('afterbegin', getSidebarShellHtml());
        }
        sidebar.dataset.sidebarLeftReady = '1';
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installSidebarShell);
    else installSidebarShell();

    function switchSidebarTab(tab, ctx) {
        activeTab = tab === 'toc' ? 'toc' : 'files';
        const btnFiles = document.getElementById('tab-files');
        const btnToc = document.getElementById('tab-toc');
        const dbList = document.getElementById('db-list');
        const tocList = document.getElementById('toc-list');
        const searchContainer = document.getElementById('search-container');
        const btnNewFolder = document.getElementById('btn-new-folder');

        if (!btnFiles || !btnToc || !dbList || !tocList || !searchContainer) return activeTab;

        if (activeTab === 'files') {
            btnFiles.className = 'flex-1 text-xs font-bold py-1 bg-white dark:bg-slate-700 rounded shadow-sm text-slate-800 dark:text-white transition-colors';
            btnToc.className = 'flex-1 text-xs font-bold py-1 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-colors';
            dbList.classList.remove('hidden');
            tocList.classList.add('hidden');
            searchContainer.classList.remove('hidden');
            if (btnNewFolder) btnNewFolder.classList.remove('hidden');
            if (ctx && typeof ctx.renderDBList === 'function') ctx.renderDBList();
        } else {
            btnToc.className = 'flex-1 text-xs font-bold py-1 bg-white dark:bg-slate-700 rounded shadow-sm text-slate-800 dark:text-white transition-colors';
            btnFiles.className = 'flex-1 text-xs font-bold py-1 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-colors';
            dbList.classList.add('hidden');
            tocList.classList.remove('hidden');
            searchContainer.classList.add('hidden');
            if (btnNewFolder) btnNewFolder.classList.add('hidden');
            if (ctx && typeof ctx.renderTOC === 'function') ctx.renderTOC();
        }
        return activeTab;
    }

    function parseTocItemsFromMarkdown(markdownText) {
        const lines = String(markdownText || '').split('\n');
        const items = [];
        let inFence = false;
        let fenceChar = '';

        lines.forEach((line, index) => {
            const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/);
            if (fenceMatch) {
                const currentFenceChar = fenceMatch[1].charAt(0);
                if (!inFence) {
                    inFence = true;
                    fenceChar = currentFenceChar;
                } else if (fenceChar === currentFenceChar) {
                    inFence = false;
                    fenceChar = '';
                }
                return;
            }
            if (inFence) return;

            const match = line.match(/^(#{1,6})\s+(.*)$/);
            if (!match) return;

            const level = match[1].length;
            const rawText = String(match[2] || '').trim();
            if (!rawText) return;
            const text = rawText.replace(/\s+#+\s*$/, '').trim();
            if (!text) return;

            items.push({ level, text, lineIndex: index });
        });

        return items;
    }

    function levelToneClass(level) {
        if (level === 1) return 'border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 bg-indigo-50/80 dark:bg-indigo-900/25 hover:bg-indigo-100/90 dark:hover:bg-indigo-900/35';
        if (level === 2) return 'border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 bg-emerald-50/80 dark:bg-emerald-900/25 hover:bg-emerald-100/90 dark:hover:bg-emerald-900/35';
        if (level === 3) return 'border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 bg-amber-50/80 dark:bg-amber-900/25 hover:bg-amber-100/90 dark:hover:bg-amber-900/35';
        if (level === 4) return 'border-sky-300 dark:border-sky-700 text-sky-700 dark:text-sky-300 bg-sky-50/80 dark:bg-sky-900/25 hover:bg-sky-100/90 dark:hover:bg-sky-900/35';
        if (level === 5) return 'border-fuchsia-300 dark:border-fuchsia-700 text-fuchsia-700 dark:text-fuchsia-300 bg-fuchsia-50/80 dark:bg-fuchsia-900/25 hover:bg-fuchsia-100/90 dark:hover:bg-fuchsia-900/35';
        return 'border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-100/90 dark:hover:bg-slate-700/60';
    }

    function renderTOC(ctx) {
        const tocList = document.getElementById('toc-list');
        if (!tocList) return [];
        const markdown = ctx && typeof ctx.getMarkdown === 'function' ? ctx.getMarkdown() : '';
        const isCollapsed = !!(ctx && typeof ctx.isCollapsed === 'function' && ctx.isCollapsed());
        const tocItems = parseTocItemsFromMarkdown(markdown);
        lastTocItems = tocItems.slice();
        tocList.innerHTML = '';

        if (isCollapsed) {
            if (!tocItems.length) {
                tocList.innerHTML = '<div class="p-2 flex justify-center"><button type="button" class="w-12 h-6 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-300 dark:text-slate-600 text-[10px] font-bold cursor-not-allowed flex items-center justify-center" disabled aria-label="No headings found">-</button></div>';
                return lastTocItems;
            }
            let compactHtml = '<div class="space-y-1 p-1 flex flex-col items-center">';
            tocItems.forEach((item) => {
                const label = shortText(item.text, 3) || '#';
                compactHtml += '<button type="button" class="w-12 h-6 rounded-md border text-[10px] font-bold transition-colors flex items-center justify-center ' + levelToneClass(item.level) + '" title="' + esc(item.text) + '" aria-label="' + esc(item.text) + '" onclick="scrollToLine(' + item.lineIndex + ')"><span class="truncate" style="max-width:2.4rem;display:inline-block">' + esc(label) + '</span></button>';
            });
            tocList.innerHTML = compactHtml + '</div>';
            return lastTocItems;
        }

        if (!tocItems.length) {
            tocList.innerHTML = '<div class="p-4 text-xs text-slate-400 text-center">No headings found. Add Markdown headings like <code># Title</code> to build a TOC.</div>';
            return lastTocItems;
        }

        let tocHtml = '<div class="space-y-1 p-2">';
        tocItems.forEach((item) => {
            const padding = (item.level - 1) * 12;
            const sizeClasses = item.level === 1 ? 'font-bold text-slate-800 dark:text-slate-200' : 'text-slate-600 dark:text-slate-400';
            tocHtml += '<div class="text-xs cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 py-1.5 px-2 rounded truncate transition-colors ' + sizeClasses + '" style="margin-left: ' + padding + 'px" onclick="scrollToLine(' + item.lineIndex + ')">' + esc(item.text) + '</div>';
        });
        tocList.innerHTML = tocHtml + '</div>';
        try { if (typeof lucide !== 'undefined') lucide.createIcons(); } catch (_) {}
        return lastTocItems;
    }

    function getTextareaCaretTopOffset(textarea, position) {
        if (!textarea) return 0;
        const value = String(textarea.value || '');
        const safePos = Math.max(0, Math.min(Number(position) || 0, value.length));
        const before = value.slice(0, safePos) + (safePos > 0 && value.charAt(safePos - 1) === '\n' ? ' ' : '');
        const mirror = document.createElement('div');
        const marker = document.createElement('span');
        const style = window.getComputedStyle(textarea);
        const props = ['boxSizing', 'width', 'height', 'overflowX', 'overflowY', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize', 'fontSizeAdjust', 'lineHeight', 'fontFamily', 'textAlign', 'textTransform', 'textIndent', 'textDecoration', 'letterSpacing', 'wordSpacing', 'tabSize', 'MozTabSize'];

        mirror.style.position = 'absolute';
        mirror.style.visibility = 'hidden';
        mirror.style.whiteSpace = 'pre-wrap';
        mirror.style.wordWrap = 'break-word';
        mirror.style.left = '-9999px';
        mirror.style.top = '0';
        mirror.style.pointerEvents = 'none';
        props.forEach((prop) => { mirror.style[prop] = style[prop]; });
        mirror.style.width = textarea.clientWidth + 'px';
        mirror.textContent = before;
        marker.textContent = '\u200b';
        mirror.appendChild(marker);
        document.body.appendChild(mirror);
        const paddingTop = parseFloat(style.paddingTop) || 0;
        const top = Math.max(0, marker.offsetTop - paddingTop);
        document.body.removeChild(mirror);
        return top;
    }

    function scrollToLine(lineIndex, ctx) {
        const editorTextarea = ctx && typeof ctx.getEditor === 'function' ? ctx.getEditor() : null;
        const viewer = ctx && typeof ctx.getViewer === 'function' ? ctx.getViewer() : null;
        const markdown = ctx && typeof ctx.getMarkdown === 'function' ? ctx.getMarkdown() : '';
        const isEditMode = !!(ctx && typeof ctx.isEditMode === 'function' && ctx.isEditMode());

        if (isEditMode) {
            if (!editorTextarea) return;
            const text = String(editorTextarea.value || '');
            const lines = text.split('\n');
            const safeLineIndex = Math.max(0, Math.min(Number(lineIndex) || 0, Math.max(0, lines.length - 1)));
            let charPos = 0;
            for (let i = 0; i < safeLineIndex; i++) charPos += lines[i].length + 1;
            editorTextarea.focus();
            editorTextarea.setSelectionRange(charPos, charPos);
            const top = getTextareaCaretTopOffset(editorTextarea, charPos);
            const lineHeight = parseFloat(getComputedStyle(editorTextarea).lineHeight) || 24;
            editorTextarea.scrollTo({ top: Math.max(0, top - (lineHeight * 3)), behavior: 'smooth' });
            return;
        }

        const tocItems = lastTocItems.length ? lastTocItems : parseTocItemsFromMarkdown(markdown);
        const targetIdx = tocItems.findIndex((item) => item.lineIndex === lineIndex);
        const targetItem = targetIdx >= 0 ? tocItems[targetIdx] : null;
        const headers = viewer ? Array.from(viewer.querySelectorAll('h1, h2, h3, h4, h5, h6')) : [];
        if (!headers.length) return;

        if (targetItem) {
            const normalizedTargetText = String(targetItem.text || '').trim();
            const sameKeyBefore = tocItems
                .slice(0, targetIdx + 1)
                .filter((item) => item.level === targetItem.level && String(item.text || '').trim() === normalizedTargetText)
                .length - 1;
            const matchingHeaders = headers.filter((h) => {
                const level = Number(String(h.tagName || '').replace(/^H/i, ''));
                return level === targetItem.level && String(h.textContent || '').trim() === normalizedTargetText;
            });
            if (matchingHeaders[sameKeyBefore]) {
                matchingHeaders[sameKeyBefore].scrollIntoView({ behavior: 'smooth', block: 'start' });
                return;
            }
        }

        const fallbackIndex = Math.max(0, Math.min(Number(targetIdx >= 0 ? targetIdx : 0), headers.length - 1));
        headers[fallbackIndex].scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    async function renderStorageList(ctx) {
        const listEl = ctx.listEl;
        const db = ctx.db;
        const searchTerm = String(ctx.searchTerm || '').toLowerCase();
        const documentsAlreadyFiltered = !!ctx.documentsAlreadyFiltered;
        const githubReady = !!ctx.githubReady;
        const storageMode = ctx.storageMode === 'sqlite' ? 'sqlite' : 'indb';
        const rootFolderName = ctx.rootFolderName || 'ROOT';
        const isSidebarCollapsed = !!ctx.isSidebarCollapsed;
        if (!listEl) return;

        let folders = Array.isArray(ctx.folders) ? ctx.folders : null;
        let docs = Array.isArray(ctx.documents) ? ctx.documents : null;
        if ((!folders || !docs) && db) {
            folders = await new Promise(function (resolve) {
                const req = db.transaction('folders', 'readonly').objectStore('folders').getAll();
                req.onsuccess = function () { resolve(Array.isArray(req.result) ? req.result : []); };
                req.onerror = function () { resolve([]); };
            });
            docs = await new Promise(function (resolve) {
                const txDocs = db.transaction('documents', 'readonly');
                const req = txDocs.objectStore('documents').getAll();
                req.onsuccess = function () { resolve(Array.isArray(req.result) ? req.result : []); };
                req.onerror = function () { resolve([]); };
            });
        }
        folders = folders || [];
        docs = docs || [];

        if (!documentsAlreadyFiltered && searchTerm) {
            docs = docs.filter(function (documentRecord) {
                return String(documentRecord && documentRecord.title || '').toLowerCase().includes(searchTerm);
            });
        }
        const tree = buildFolderTreeModel(folders, docs, searchTerm);
        const renderedFolderIds = new Set();

        function createActionButton(iconName, title, className, action) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'sidebar-folder-action-btn ' + (className || '');
            button.title = title;
            button.setAttribute('aria-label', title);
            button.innerHTML = '<i data-lucide="' + iconName + '" class="w-3.5 h-3.5" aria-hidden="true"></i>';
            button.addEventListener('click', function (event) {
                event.stopPropagation();
                action();
            });
            return button;
        }

        function createDocumentCard(doc) {
            const docItem = document.createElement('div');
            docItem.dataset.storageDocId = String(doc.id || '');
            docItem.dataset.storageMode = storageMode;
            if (storageMode === 'indb') docItem.dataset.indbDocId = String(doc.id || '');
            docItem.className = isSidebarCollapsed
                ? 'sidebar-folder-document group w-12 h-6 mx-auto bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-md hover:border-indigo-300 dark:hover:border-indigo-600 transition-all shadow-sm cursor-pointer flex items-center justify-center'
                : 'sidebar-folder-document group bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-md p-2 hover:border-indigo-300 dark:hover:border-indigo-600 transition-all shadow-sm cursor-pointer';
            docItem.title = String(doc.title || '');

            const inner = document.createElement('div');
            inner.className = 'flex flex-col gap-1 doc-item-inner';
            const titleRow = document.createElement('div');
            titleRow.className = 'sidebar-doc-title-row flex items-start gap-2';
            titleRow.innerHTML = '<i data-lucide="file-text" class="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400 shrink-0 ' + (isSidebarCollapsed ? 'hidden' : '') + '"></i>';
            const titleSpan = document.createElement('span');
            titleSpan.className = 'sidebar-doc-title font-semibold text-slate-700 dark:text-slate-300 ' + (isSidebarCollapsed ? '' : 'sidebar-text');
            titleSpan.textContent = isSidebarCollapsed ? shortText(doc.title, 3) : String(doc.title || '');
            titleSpan.title = String(doc.title || '') + (isSidebarCollapsed ? '' : ' · 더블클릭하여 이름 수정');
            if (!isSidebarCollapsed) titleSpan.dataset.inlineRename = '1';
            titleRow.appendChild(titleSpan);
            inner.appendChild(titleRow);

            const actions = document.createElement('div');
            actions.className = 'flex gap-1 doc-action-btns';
            actions.setAttribute('aria-label', '문서 작업');

            function addDocumentAction(label, className, title, action) {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = className;
                button.textContent = label;
                button.title = title || label;
                button.addEventListener('click', function (event) {
                    event.stopPropagation();
                    action();
                });
                actions.appendChild(button);
            }

            addDocumentAction('열기', 'doc-open-btn text-[10px] bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 rounded border border-indigo-100 dark:border-indigo-800 font-bold', '문서 열기', function () {
                if (typeof window.loadFromDB === 'function') window.loadFromDB(doc.id);
            });
            addDocumentAction('이동', 'doc-move-btn text-[10px] bg-slate-50 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-600 font-bold', '문서 이동', function () {
                if (typeof window.openMoveModal === 'function') window.openMoveModal(doc.id);
            });
            if (githubReady) {
                addDocumentAction('github', 'doc-github-btn text-[10px] bg-slate-50 dark:bg-slate-700 text-slate-700 dark:text-slate-200 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-600 font-bold', storageMode === 'sqlite' ? 'SQLite 문서를 GitHub로 전송' : 'inDB 문서를 GitHub로 전송', function () {
                    if (typeof window.pushDocToGithub === 'function') window.pushDocToGithub(doc.id, storageMode);
                });
            }
            addDocumentAction('삭제', 'doc-delete-btn text-[10px] px-1.5 py-0.5 rounded border font-bold ml-auto', '문서 삭제', function () {
                if (typeof window.deleteFromDB === 'function') window.deleteFromDB(doc.id);
            });
            inner.appendChild(actions);
            docItem.appendChild(inner);

            let titleClickTimer = null;
            function cancelTitleClick() {
                if (titleClickTimer) clearTimeout(titleClickTimer);
                titleClickTimer = null;
            }
            docItem.addEventListener('click', function (event) {
                if (event.target && event.target.closest && event.target.closest('button,input')) return;
                if (event.target && event.target.closest && event.target.closest('.sidebar-doc-title')) {
                    cancelTitleClick();
                    if (event.detail > 1) return;
                    titleClickTimer = setTimeout(function () {
                        titleClickTimer = null;
                        if (typeof window.loadFromDB === 'function') window.loadFromDB(doc.id);
                    }, 240);
                    return;
                }
                if (typeof window.loadFromDB === 'function') window.loadFromDB(doc.id);
            });
            titleSpan.addEventListener('dblclick', function (event) {
                event.preventDefault();
                event.stopPropagation();
                beginDocumentTitleEdit(titleSpan, doc, ctx, cancelTitleClick);
            });
            return docItem;
        }

        function renderFolder(folder, depth, ancestry) {
            const folderId = String(folder && folder.id || '');
            if (!folderId || ancestry.has(folderId)) return null;
            if (tree.visibleFolderIds && !tree.visibleFolderIds.has(folderId)) return null;
            renderedFolderIds.add(folderId);
            const nextAncestry = new Set(ancestry);
            nextAncestry.add(folderId);
            const folderDocs = tree.documentsByFolder.get(folderId) || [];
            const childFolders = tree.childrenByParent.get(folderId) || [];
            const folderDisplayName = folderId === 'root' ? rootFolderName : String(folder.name || 'Folder');
            const isCollapsedFolder = !searchTerm && !!(ctx.isFolderCollapsed && ctx.isFolderCollapsed(folderId));

            const folderDiv = document.createElement('div');
            folderDiv.className = 'sidebar-folder-node mb-2';
            folderDiv.dataset.folderId = folderId;
            folderDiv.dataset.folderDepth = String(depth);

            const folderHeader = document.createElement('div');
            folderHeader.className = 'sidebar-folder-header flex items-center gap-2 px-2 py-1 text-xs font-bold text-slate-500 dark:text-slate-400 tracking-tight cursor-pointer select-none hover:bg-slate-100/70 dark:hover:bg-slate-800/70 rounded ' + (isSidebarCollapsed ? 'justify-center' : '');
            folderHeader.setAttribute('role', 'treeitem');
            folderHeader.setAttribute('aria-level', String(depth + 1));
            folderHeader.setAttribute('aria-expanded', String(!isCollapsedFolder));
            folderHeader.innerHTML = '<i data-lucide="' + (isCollapsedFolder ? 'chevron-right' : 'chevron-down') + '" class="w-3 h-3 shrink-0"></i><i data-lucide="' + (isCollapsedFolder ? 'folder' : 'folder-open') + '" class="w-3.5 h-3.5 shrink-0"></i>';
            const folderName = document.createElement('span');
            folderName.className = 'sidebar-folder-name sidebar-text';
            folderName.textContent = folderDisplayName;
            folderName.title = buildFolderPath(tree.folders, folderId);
            folderHeader.appendChild(folderName);

            const folderActions = document.createElement('span');
            folderActions.className = 'sidebar-folder-actions ml-auto sidebar-text';
            folderActions.appendChild(createActionButton('file-plus-2', folderDisplayName + ' 폴더에 문서 생성', 'sidebar-folder-document-btn', function () {
                if (typeof ctx.createDocument === 'function') ctx.createDocument(folderId);
                else if (typeof window.createDocumentInFolder === 'function') window.createDocumentInFolder(folderId);
            }));
            folderActions.appendChild(createActionButton('folder-plus', folderDisplayName + ' 아래에 하위 폴더 생성', 'sidebar-folder-create-btn', function () {
                if (typeof ctx.createFolder === 'function') ctx.createFolder(folderId, folderDisplayName);
                else if (typeof window.createNewFolder === 'function') window.createNewFolder(folderId, folderDisplayName);
            }));
            if (folderId !== 'root') {
                folderActions.appendChild(createActionButton('x', folderDisplayName + ' 폴더 삭제', 'sidebar-folder-delete-btn', function () {
                    if (typeof ctx.deleteFolder === 'function') ctx.deleteFolder(folderId);
                    else if (typeof window.deleteFolderFromDB === 'function') window.deleteFolderFromDB(folderId);
                }));
            }
            folderHeader.appendChild(folderActions);
            folderHeader.addEventListener('click', function (event) {
                if (event.target && event.target.closest && event.target.closest('button')) return;
                if (typeof ctx.toggleFolderCollapse === 'function') ctx.toggleFolderCollapse(folderId);
            });
            folderDiv.appendChild(folderHeader);

            const folderBody = document.createElement('div');
            folderBody.className = (isSidebarCollapsed ? '' : 'sidebar-folder-body') + (isCollapsedFolder ? ' hidden' : '');
            const childContainer = document.createElement('div');
            childContainer.className = 'sidebar-folder-children';
            childFolders.forEach(function (childFolder) {
                const childNode = renderFolder(childFolder, depth + 1, nextAncestry);
                if (childNode) childContainer.appendChild(childNode);
            });
            if (childContainer.childNodes.length) folderBody.appendChild(childContainer);

            const docContainer = document.createElement('div');
            docContainer.className = (isSidebarCollapsed ? 'space-y-1' : 'sidebar-folder-documents space-y-1') + (childContainer.childNodes.length ? ' mt-1' : '');
            folderDocs.forEach(function (doc) { docContainer.appendChild(createDocumentCard(doc)); });
            if (folderDocs.length) folderBody.appendChild(docContainer);
            folderDiv.appendChild(folderBody);
            return folderDiv;
        }

        tree.topLevel.forEach(function (folder) {
            const node = renderFolder(folder, 0, new Set());
            if (node) listEl.appendChild(node);
        });
        tree.folders.forEach(function (folder) {
            if (renderedFolderIds.has(String(folder.id || ''))) return;
            const node = renderFolder(folder, 0, new Set());
            if (node) listEl.appendChild(node);
        });
        return undefined;
    }

    function renderInDbList(ctx) {
        return renderStorageList(ctx);
    }

    window.SidebarLeft = {
        getActiveTab: function () { return activeTab; },
        installSidebarShell,
        setActiveTab: function (tab) { activeTab = tab === 'toc' ? 'toc' : 'files'; return activeTab; },
        getLastTocItems: function () { return lastTocItems.slice(); },
        buildFolderPath,
        buildFolderTreeModel,
        switchSidebarTab,
        parseTocItemsFromMarkdown,
        renderTOC,
        scrollToLine,
        renderStorageList,
        renderInDbList
    };
})();
