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

    function getSidebarShellHtml() {
        return [
            '<div class="p-4 border-b border-slate-200 dark:border-slate-700 space-y-4">',
            '  <div class="flex items-center gap-2 mb-2 sidebar-text">',
            '    <button onclick="openBackupModal()" class="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 rounded text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors" title="내문서 백업"><i data-lucide="archive" class="w-3.5 h-3.5"></i><span>BackUP</span></button>',
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
            '    <button type="button" id="tab-storage-indb" onclick="switchStorageSourceTab(\'indb\')" class="px-2 py-1 text-xs font-semibold border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200">inDB</button>',
            '    <button type="button" id="tab-storage-github" onclick="switchStorageSourceTab(\'github\')" class="px-2 py-1 text-xs font-semibold border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200">github</button>',
            '    <a id="tab-storage-github-link" href="#" target="_blank" rel="noopener noreferrer" class="hidden px-1.5 py-1 text-[10px] font-bold border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700" title="GitHub 저장소 열기">↗</a>',
            '  </div>',
            '  <div class="relative search-container" id="search-container">',
            '    <i data-lucide="search" class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 search-icon-only"></i>',
            '    <input type="text" id="db-search" oninput="renderDBList()" placeholder="문서 검색..." class="w-full pl-9 pr-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-md text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500">',
            '  </div>',
            '</div>',
            '<div id="db-list" class="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1"></div>',
            '<div id="toc-list" class="hidden flex-1 overflow-y-auto custom-scrollbar p-2"></div>',
            '<div class="p-2 border-t border-slate-200 dark:border-slate-700">',
            '  <div class="flex items-center gap-2">',
            '    <button type="button" id="btn-github-sync" onclick="pullGithubRepo()" class="hidden flex-1 items-center justify-center gap-2 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-md text-xs font-semibold text-white transition-colors" title="GitHub 저장소에서 Pull 동기화"><i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i><span class="sidebar-text" id="github-sync-label">sync</span></button>',
            '    <button type="button" onclick="clearUnusedCache()" class="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 rounded-md text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors" title="Clear temporary cache"><i data-lucide="refresh-ccw" class="w-3.5 h-3.5"></i><span class="sidebar-text">Clear Cache</span></button>',
            '  </div>',
            '</div>'
        ].join('');
    }

    function installSidebarShell() {
        const sidebar = document.getElementById('sidebar');
        if (!sidebar || sidebar.dataset.sidebarLeftReady === '1') return;
        if (sidebar.children.length === 0) sidebar.innerHTML = getSidebarShellHtml();
        sidebar.dataset.sidebarLeftReady = '1';
    }

    document.addEventListener('DOMContentLoaded', installSidebarShell);

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

    function renderInDbList(ctx) {
        const listEl = ctx.listEl;
        const db = ctx.db;
        const searchTerm = String(ctx.searchTerm || '').toLowerCase();
        const githubReady = !!ctx.githubReady;
        const rootFolderName = ctx.rootFolderName || 'ROOT';
        const isSidebarCollapsed = !!ctx.isSidebarCollapsed;
        if (!listEl || !db) return Promise.resolve();

        const txFolders = db.transaction('folders', 'readonly');
        return new Promise(function (resolve) {
            const folderReq = txFolders.objectStore('folders').getAll();
            folderReq.onsuccess = async function () {
                const folders = Array.isArray(folderReq.result) ? folderReq.result : [];
                const txDocs = db.transaction('documents', 'readonly');
                const docs = await new Promise(function (r) {
                    const req = txDocs.objectStore('documents').getAll();
                    req.onsuccess = function () { r(Array.isArray(req.result) ? req.result : []); };
                    req.onerror = function () { r([]); };
                });

                folders.forEach(function (folder) {
                    const folderDocs = docs.filter(function (d) {
                        return d.folderId === folder.id && String(d.title || '').toLowerCase().includes(searchTerm);
                    });
                    const folderDisplayName = folder.id === 'root' ? rootFolderName : String(folder.name || 'Folder');
                    const isCollapsedFolder = !searchTerm && !!(ctx.isFolderCollapsed && ctx.isFolderCollapsed(folder.id));

                    const folderDiv = document.createElement('div');
                    folderDiv.className = 'mb-2';
                    const folderHeader = document.createElement('div');
                    folderHeader.className = 'flex items-center gap-2 px-2 py-1 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-tighter cursor-pointer select-none hover:bg-slate-100/70 dark:hover:bg-slate-800/70 rounded ' + (isSidebarCollapsed ? 'justify-center' : '');
                    const folderDeleteBtn = folder.id === 'root'
                        ? ''
                        : '<button onclick="event.stopPropagation(); deleteFolderFromDB(\'' + esc(folder.id) + '\')" class="ml-auto text-[10px] px-1 py-0.5 rounded border border-red-200 dark:border-red-700 text-red-500 dark:text-red-400 hover:bg-red-600 hover:text-white" title="폴더 삭제">x</button>';
                    folderHeader.innerHTML = '<i data-lucide="' + (isCollapsedFolder ? 'chevron-right' : 'chevron-down') + '" class="w-3 h-3"></i><i data-lucide="folder" class="w-3 h-3"></i><span class="sidebar-text">' + esc(folderDisplayName) + '</span>' + folderDeleteBtn;
                    folderHeader.addEventListener('click', function () {
                        if (typeof ctx.toggleFolderCollapse === 'function') ctx.toggleFolderCollapse(folder.id);
                    });
                    folderDiv.appendChild(folderHeader);

                    const docContainer = document.createElement('div');
                    docContainer.className = (isSidebarCollapsed ? 'space-y-1' : 'pl-2 space-y-1') + (isCollapsedFolder ? ' hidden' : '');

                    folderDocs.forEach(function (doc) {
                        const docItem = document.createElement('div');
                        docItem.dataset.indbDocId = String(doc.id || '');
                        docItem.className = isSidebarCollapsed
                            ? 'group w-12 h-6 mx-auto bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-md hover:border-indigo-300 dark:hover:border-indigo-600 transition-all shadow-sm cursor-pointer flex items-center justify-center'
                            : 'group bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-md p-2 hover:border-indigo-300 dark:hover:border-indigo-600 transition-all shadow-sm cursor-pointer';
                        docItem.title = String(doc.title || '');
                        docItem.onclick = function () { if (typeof window.loadFromDB === 'function') window.loadFromDB(doc.id); };

                        const pushBtn = githubReady
                            ? '<button onclick="event.stopPropagation(); pushDocToGithub(\'' + esc(doc.id) + '\')" class="text-[10px] bg-slate-50 dark:bg-slate-700 text-slate-700 dark:text-slate-200 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-600 font-bold hover:bg-slate-200 dark:hover:bg-slate-600">github</button>'
                            : '';

                        docItem.innerHTML = '<div class="flex flex-col gap-1 doc-item-inner"><div class="flex items-center gap-2"><i data-lucide="file-text" class="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400 shrink-0 ' + (isSidebarCollapsed ? 'hidden' : '') + '"></i><span class="text-sm font-semibold text-slate-700 dark:text-slate-300 truncate ' + (isSidebarCollapsed ? '' : 'sidebar-text') + '">' + esc(isSidebarCollapsed ? shortText(doc.title, 3) : doc.title) + '</span></div><div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity doc-action-btns"><button onclick="event.stopPropagation(); loadFromDB(\'' + esc(doc.id) + '\')" class="text-[10px] bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 rounded border border-indigo-100 dark:border-indigo-800 font-bold hover:bg-indigo-600 hover:text-white">열기</button><button onclick="event.stopPropagation(); openMoveModal(\'' + esc(doc.id) + '\')" class="text-[10px] bg-slate-50 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-600 font-bold hover:bg-slate-200 dark:hover:bg-slate-600">이동</button>' + pushBtn + '<button onclick="event.stopPropagation(); deleteFromDB(\'' + esc(doc.id) + '\')" class="text-[10px] bg-red-50 dark:bg-red-900/40 text-red-600 dark:text-red-400 px-1.5 py-0.5 rounded border border-red-100 dark:border-red-800 font-bold hover:bg-red-600 hover:text-white ml-auto">X</button></div></div>';
                        docContainer.appendChild(docItem);
                    });

                    if (folderDocs.length > 0 || searchTerm === '') {
                        folderDiv.appendChild(docContainer);
                        listEl.appendChild(folderDiv);
                    }
                });
                resolve();
            };
            folderReq.onerror = function () { resolve(); };
        });
    }

    window.SidebarLeft = {
        getActiveTab: function () { return activeTab; },
        installSidebarShell,
        setActiveTab: function (tab) { activeTab = tab === 'toc' ? 'toc' : 'files'; return activeTab; },
        getLastTocItems: function () { return lastTocItems.slice(); },
        switchSidebarTab,
        parseTocItemsFromMarkdown,
        renderTOC,
        scrollToLine,
        renderInDbList
    };
})();
