// IndexedDB Logic
const DB_NAME = "MarkdownProDB";
const DB_VERSION = 1;
let db;

// State
let currentMarkdown = "";
let currentFileName = "새 문서.md";
let isEditMode = false;
let pageScale = 1.0;
let fontSize = 16;
let modalMode = 'link';
let movingDocId = null;

// Sidebar states
let isSidebarHidden = true;
let isSidebarCollapsed = false;

// Theme
const THEME_KEY = 'md_viewer_theme';

const sidebar = document.getElementById('sidebar');
const viewerContainer = document.getElementById('viewer-container');
const viewer = document.getElementById('viewer');
const editorContainer = document.getElementById('editor-container');
const editorTextarea = document.getElementById('editor-textarea');
const fileNameDisplay = document.getElementById('file-name-display');
const dropZone = document.getElementById('drop-zone');
const inputModal = document.getElementById('input-modal');

// Init DB
function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = (e) => reject("DB Open Error");
        request.onsuccess = (e) => {
            db = e.target.result;
            resolve(db);
        };
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('documents')) {
                db.createObjectStore('documents', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('folders')) {
                db.createObjectStore('folders', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('autosave')) {
                db.createObjectStore('autosave', { keyPath: 'id' });
            }
        };
    });
}

function toggleTheme() {
    const html = document.documentElement;
    const isDark = html.classList.toggle('dark');
    localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light');
    lucide.createIcons();
}

function initTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const useDark = saved === 'dark' || (!saved && prefersDark);
    if (useDark) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
}

window.onload = async () => {
    initTheme();
    initSettings();
    lucide.createIcons();
    await initDB();
    await ensureRootFolder();
    renderDBList();
    checkAutoSave();

    updateContent('');

    toggleMode('edit');

    sidebar.style.display = 'none';

    if (window.electron && window.electron.ipcRenderer) {
        window.electron.ipcRenderer.on('open-external-file', (event, data) => {
            currentFileName = data.fileName;
            fileNameDisplay.textContent = currentFileName;
            updateContent(data.content);
            showToast("외부 문서를 열었습니다.");
        });
    }

    document.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.add('drag-over');
    });

    document.addEventListener('dragenter', (e) => {
        e.preventDefault();
        e.stopPropagation();
    });

    document.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove('drag-over');
    });

    document.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file) readFile(file);
    });

    editorTextarea.addEventListener('input', () => {
        currentMarkdown = editorTextarea.value;
        performAutoSave();
    });

    // Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
        // Alt + 1 for Edit mode
        if (e.altKey && e.key === '1') {
            e.preventDefault();
            if (!isEditMode) toggleMode('edit');
        }
        // Alt + 2 for View mode
        if (e.altKey && e.key === '2') {
            e.preventDefault();
            if (isEditMode) toggleMode('view');
        }
        // Alt + 4 for toggling dark/light mode
        if (e.altKey && e.key === '4') {
            e.preventDefault();
            toggleTheme();
            showToast("테마가 변경되었습니다.");
        }
        // Ctrl + H for Find/Replace
        if (e.ctrlKey && e.key.toLowerCase() === 'h') {
            e.preventDefault();
            const bar = document.getElementById('find-replace-bar');
            if (bar && bar.classList.contains('hidden')) {
                openFindReplace();
            } else if (bar) {
                closeFindReplace();
            }
        }
        // Ctrl + Z for Undo, Ctrl + Shift + Z / Ctrl + Y for Redo
        if (e.ctrlKey && (e.key.toLowerCase() === 'z' || e.key.toLowerCase() === 'y')) {
            setTimeout(() => {
                currentMarkdown = editorTextarea.value;
                renderMarkdown();
                if (activeSidebarTab === 'toc') renderTOC();
                performAutoSave();
            }, 10);
            return;
        }
        // Line Navigation & Modification
        if (isEditMode && e.altKey) {
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                moveLineUp();
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (e.shiftKey) {
                    copyLineDown();
                } else {
                    moveLineDown();
                }
            }
        }
        // Ctrl + Alt + 1, 2, 3 for Headings
        if (e.ctrlKey && e.altKey && e.key === '1') { e.preventDefault(); applyHeading(1); }
        if (e.ctrlKey && e.altKey && e.key === '2') { e.preventDefault(); applyHeading(2); }
        if (e.ctrlKey && e.altKey && e.key === '3') { e.preventDefault(); applyHeading(3); }
    });
};

// --- Core Functions ---
function updateContent(md) {
    currentMarkdown = md;
    editorTextarea.value = md;
    renderMarkdown();
    renderTOC();
}

function renderMarkdown() {
    viewer.innerHTML = marked.parse(currentMarkdown);
}

function toggleMode(mode) {
    const btnView = document.getElementById('btn-view');
    const btnEdit = document.getElementById('btn-edit');
    const editTools = document.getElementById('edit-tools');
    const activeClasses = ['bg-white', 'dark:bg-slate-700', 'shadow-sm', 'text-indigo-600', 'dark:text-indigo-400'];

    if (mode === 'edit') {
        isEditMode = true;
        viewerContainer.classList.add('hidden');
        editorContainer.classList.remove('hidden');
        editTools.classList.remove('hidden');
        btnEdit.classList.add(...activeClasses);
        btnView.classList.remove(...activeClasses);
        editorTextarea.focus();
    } else {
        isEditMode = false;
        renderMarkdown();
        viewerContainer.classList.remove('hidden');
        editorContainer.classList.add('hidden');
        editTools.classList.add('hidden');
        btnView.classList.add(...activeClasses);
        btnEdit.classList.remove(...activeClasses);
    }
}

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) readFile(file);
}

function readFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        currentFileName = file.name;
        fileNameDisplay.textContent = currentFileName;
        updateContent(e.target.result);
        showToast("파일을 불러왔습니다.");
    };
    reader.readAsText(file);
}

function saveFile() {
    const blob = new Blob([currentMarkdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = currentFileName.endsWith('.md') ? currentFileName : currentFileName + ".md";
    a.click();
    showToast("파일을 내보냈습니다.");
}

function printPage() {
    if (isEditMode) toggleMode('view');
    setTimeout(() => window.print(), 500);
}

// --- Sidebar Visibility & Collapse Logic ---
function toggleSidebarVisibility() {
    isSidebarHidden = !isSidebarHidden;
    sidebar.style.display = isSidebarHidden ? 'none' : 'flex';
}

function toggleSidebarCollapse() {
    isSidebarCollapsed = !isSidebarCollapsed;
    const collapseIcon = document.getElementById('collapse-icon');

    if (isSidebarCollapsed) {
        sidebar.classList.add('sidebar-collapsed');
        collapseIcon.setAttribute('data-lucide', 'chevron-right');
    } else {
        sidebar.classList.remove('sidebar-collapsed');
        collapseIcon.setAttribute('data-lucide', 'chevron-left');
    }
    lucide.createIcons();
    renderDBList();
    if (activeSidebarTab === 'toc') renderTOC();
}

// --- TOC & Sidebar Tabs ---
let activeSidebarTab = 'files';

function switchSidebarTab(tab) {
    activeSidebarTab = tab;
    const btnFiles = document.getElementById('tab-files');
    const btnToc = document.getElementById('tab-toc');
    const dbList = document.getElementById('db-list');
    const tocList = document.getElementById('toc-list');
    const searchContainer = document.getElementById('search-container');
    const btnNewFolder = document.getElementById('btn-new-folder');

    if (tab === 'files') {
        btnFiles.className = "flex-1 text-xs font-bold py-1 bg-white dark:bg-slate-700 rounded shadow-sm text-slate-800 dark:text-white transition-colors";
        btnToc.className = "flex-1 text-xs font-bold py-1 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-colors";
        dbList.classList.remove('hidden');
        tocList.classList.add('hidden');
        searchContainer.classList.remove('hidden');
        if (btnNewFolder) btnNewFolder.classList.remove('hidden');
        renderDBList();
    } else {
        btnToc.className = "flex-1 text-xs font-bold py-1 bg-white dark:bg-slate-700 rounded shadow-sm text-slate-800 dark:text-white transition-colors";
        btnFiles.className = "flex-1 text-xs font-bold py-1 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-colors";
        dbList.classList.add('hidden');
        tocList.classList.remove('hidden');
        searchContainer.classList.add('hidden');
        if (btnNewFolder) btnNewFolder.classList.add('hidden');
        renderTOC();
    }
}

function renderTOC() {
    const tocList = document.getElementById('toc-list');
    if (!tocList) return;
    tocList.innerHTML = '';

    if (isSidebarCollapsed) {
        tocList.innerHTML = `<div class="p-2 text-center text-xs text-slate-400">목차보기</div>`;
        return;
    }

    const lines = currentMarkdown.split('\n');
    let tocHtml = '<div class="space-y-1 p-2">';
    let found = false;

    lines.forEach((line, index) => {
        const match = line.match(/^(#{1,6})\s+(.*)/);
        if (match) {
            found = true;
            const level = match[1].length;
            const text = match[2].trim();
            const padding = (level - 1) * 12;
            const sizeClasses = level === 1 ? 'font-bold text-slate-800 dark:text-slate-200' : 'text-slate-600 dark:text-slate-400';
            tocHtml += `<div class="text-xs cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 py-1.5 px-2 rounded truncate transition-colors ${sizeClasses}" style="margin-left: ${padding}px" onclick="scrollToLine(${index})">${text}</div>`;
        }
    });

    tocHtml += '</div>';

    if (!found) {
        tocHtml = '<div class="p-4 text-xs text-slate-400 text-center">작성된 목차가 없습니다.<br>(# 제목)</div>';
    }
    tocList.innerHTML = tocHtml;
}

function scrollToLine(lineIndex) {
    if (isEditMode) {
        const text = editorTextarea.value;
        const lines = text.split('\n');
        let charPos = 0;
        for (let i = 0; i < lineIndex; i++) {
            charPos += lines[i].length + 1;
        }
        editorTextarea.focus();
        editorTextarea.setSelectionRange(charPos, charPos);
        const lineHeight = parseInt(getComputedStyle(editorTextarea).lineHeight) || 28;
        editorTextarea.scrollTop = lineIndex * lineHeight;
    } else {
        const lines = currentMarkdown.split('\n');
        let headerIndex = 0;
        for (let i = 0; i <= lineIndex; i++) {
            if (/^(#{1,6})\s+(.*)/.test(lines[i])) {
                if (i === lineIndex) break;
                headerIndex++;
            }
        }
        const headers = viewer.querySelectorAll('h1, h2, h3, h4, h5, h6');
        if (headers[headerIndex]) {
            headers[headerIndex].scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }
}

// --- IndexedDB Actions ---
async function ensureRootFolder() {
    const tx = db.transaction('folders', 'readwrite');
    const store = tx.objectStore('folders');
    return new Promise((res) => {
        const req = store.get('root');
        req.onsuccess = () => {
            if (!req.result) store.add({ id: 'root', name: '내 문서 (root)' });
            res();
        };
    });
}

let currentActionCallback = null;

function createNewFolder() {
    const modal = document.getElementById('save-modal');
    document.querySelector('#save-modal h3').textContent = '새 폴더 생성';
    document.querySelector('#save-modal label').textContent = '새 폴더 이름을 입력하세요';
    const input = document.getElementById('save-title-input');
    input.value = '새 폴더';

    currentActionCallback = (name) => {
        if (!name) return;
        const tx = db.transaction('folders', 'readwrite');
        const id = 'folder_' + Date.now();
        tx.objectStore('folders').add({ id, name });
        tx.oncomplete = () => renderDBList();
    };

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    input.focus();
}

function saveToDB() {
    const modal = document.getElementById('save-modal');
    document.querySelector('#save-modal h3').textContent = '문서 저장';
    document.querySelector('#save-modal label').textContent = '저장할 제목을 입력하세요';
    const input = document.getElementById('save-title-input');
    input.value = currentFileName.replace('.md', '');

    currentActionCallback = (title) => {
        if (!title) return;
        const doc = {
            id: 'doc_' + Date.now(),
            title: title,
            content: currentMarkdown,
            folderId: 'root',
            updatedAt: new Date()
        };

        const tx = db.transaction('documents', 'readwrite');
        tx.objectStore('documents').add(doc);
        tx.oncomplete = () => {
            showToast("문서가 저장되었습니다.");
            renderDBList();
            if (isSidebarHidden) toggleSidebarVisibility();
        };
    };

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    input.focus();
}

function closeSaveModal() {
    document.getElementById('save-modal').classList.add('hidden');
    document.getElementById('save-modal').classList.remove('flex');
    currentActionCallback = null;
}

function confirmSaveModal() {
    const val = document.getElementById('save-title-input').value;
    if (currentActionCallback) currentActionCallback(val);
    closeSaveModal();
}


async function renderDBList() {
    const listEl = document.getElementById('db-list');
    const searchTerm = document.getElementById('db-search').value.toLowerCase();
    listEl.innerHTML = "";

    const txFolders = db.transaction('folders', 'readonly');
    const folders = await new Promise(r => {
        const req = txFolders.objectStore('folders').getAll();
        req.onsuccess = () => r(req.result);
    });

    const txDocs = db.transaction('documents', 'readonly');
    const docs = await new Promise(r => {
        const req = txDocs.objectStore('documents').getAll();
        req.onsuccess = () => r(req.result);
    });

    folders.forEach(folder => {
        const folderDocs = docs.filter(d => d.folderId === folder.id && d.title.toLowerCase().includes(searchTerm));

        const folderDiv = document.createElement('div');
        folderDiv.className = "mb-2";
        folderDiv.innerHTML = `
            <div class="flex items-center gap-2 px-2 py-1 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-tighter ${isSidebarCollapsed ? 'justify-center' : ''}">
                <i data-lucide="folder" class="w-3 h-3"></i> 
                <span class="sidebar-text">${folder.name}</span>
            </div>
        `;

        const docContainer = document.createElement('div');
        docContainer.className = isSidebarCollapsed ? "space-y-1" : "pl-2 space-y-1";

        folderDocs.forEach(doc => {
            const docItem = document.createElement('div');
            docItem.className = "group bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-md p-2 hover:border-indigo-300 dark:hover:border-indigo-600 transition-all shadow-sm cursor-pointer";
            docItem.title = doc.title;
            docItem.onclick = () => loadFromDB(doc.id);

            docItem.innerHTML = `
                <div class="flex flex-col gap-1 doc-item-inner">
                    <div class="flex items-center gap-2">
                        <i data-lucide="file-text" class="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400 shrink-0"></i>
                        <span class="text-sm font-semibold text-slate-700 dark:text-slate-300 truncate ${isSidebarCollapsed ? '' : 'sidebar-text'}">
                            ${isSidebarCollapsed ? doc.title.substring(0, 1) : doc.title}
                        </span>
                    </div>
                    <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity doc-action-btns">
                        <button onclick="event.stopPropagation(); loadFromDB('${doc.id}')" class="text-[10px] bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 rounded border border-indigo-100 dark:border-indigo-800 font-bold hover:bg-indigo-600 hover:text-white">불러오기</button>
                        <button onclick="event.stopPropagation(); openMoveModal('${doc.id}')" class="text-[10px] bg-slate-50 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-600 font-bold hover:bg-slate-200 dark:hover:bg-slate-600">이동</button>
                        <button onclick="event.stopPropagation(); deleteFromDB('${doc.id}')" class="text-[10px] bg-red-50 dark:bg-red-900/40 text-red-600 dark:text-red-400 px-1.5 py-0.5 rounded border border-red-100 dark:border-red-800 font-bold hover:bg-red-600 hover:text-white ml-auto">X</button>
                    </div>
                </div>
            `;
            docContainer.appendChild(docItem);
        });

        if (folderDocs.length > 0 || searchTerm === "") {
            folderDiv.appendChild(docContainer);
            listEl.appendChild(folderDiv);
        }
    });
    lucide.createIcons();
}

async function loadFromDB(id) {
    const tx = db.transaction('documents', 'readonly');
    const doc = await new Promise(r => {
        const req = tx.objectStore('documents').get(id);
        req.onsuccess = () => r(req.result);
    });
    if (doc) {
        currentFileName = doc.title + ".md";
        fileNameDisplay.textContent = currentFileName;
        updateContent(doc.content);
        showToast("문서를 불러왔습니다.");
        if (window.innerWidth < 1024 && !isSidebarHidden) toggleSidebarVisibility();
    }
}

let deleteTargetId = null;

function deleteFromDB(id) {
    deleteTargetId = id;
    const modal = document.getElementById('delete-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeDeleteModal() {
    const modal = document.getElementById('delete-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    deleteTargetId = null;
}

function confirmDeleteModal() {
    if (!deleteTargetId) return;
    const tx = db.transaction('documents', 'readwrite');
    tx.objectStore('documents').delete(deleteTargetId);
    tx.oncomplete = () => {
        showToast("삭제되었습니다.");
        renderDBList();
        closeDeleteModal();
    };
}

// --- Move Folder Logic ---
async function openMoveModal(docId) {
    movingDocId = docId;
    const tx = db.transaction('folders', 'readonly');
    const folders = await new Promise(r => {
        const req = tx.objectStore('folders').getAll();
        req.onsuccess = () => r(req.result);
    });

    const list = document.getElementById('folder-choice-list');
    list.innerHTML = "";
    folders.forEach(f => {
        const btn = document.createElement('button');
        btn.className = "w-full text-left px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/40 rounded-md transition-colors flex items-center gap-2";
        btn.innerHTML = `<i data-lucide="folder" class="w-4 h-4 text-slate-400 dark:text-slate-500"></i> ${f.name}`;
        btn.onclick = () => moveDocToFolder(docId, f.id);
        list.appendChild(btn);
    });

    document.getElementById('move-modal').classList.remove('hidden');
    document.getElementById('move-modal').classList.add('flex');
    lucide.createIcons();
}

function closeMoveModal() {
    document.getElementById('move-modal').classList.add('hidden');
    document.getElementById('move-modal').classList.remove('flex');
    movingDocId = null;
}

async function moveDocToFolder(docId, folderId) {
    const tx = db.transaction('documents', 'readwrite');
    const store = tx.objectStore('documents');
    const doc = await new Promise(r => {
        const req = store.get(docId);
        req.onsuccess = () => r(req.result);
    });
    if (doc) {
        doc.folderId = folderId;
        store.put(doc);
    }
    tx.oncomplete = () => {
        showToast("문서가 이동되었습니다.");
        closeMoveModal();
        renderDBList();
    };
}

// --- AutoSave & Recovery ---
function performAutoSave() {
    if (!db) return;
    const tx = db.transaction('autosave', 'readwrite');
    tx.objectStore('autosave').put({
        id: 'last_work',
        content: currentMarkdown,
        title: currentFileName,
        timestamp: Date.now()
    });
}

async function checkAutoSave() {
    const tx = db.transaction('autosave', 'readonly');
    const saved = await new Promise(r => {
        const req = tx.objectStore('autosave').get('last_work');
        req.onsuccess = () => r(req.result);
    });
    if (saved && saved.content.length > 50) {
        document.getElementById('recovery-modal').classList.remove('hidden');
        document.getElementById('recovery-modal').classList.add('flex');
    }
}

function applyRecovery() {
    const tx = db.transaction('autosave', 'readonly');
    tx.objectStore('autosave').get('last_work').onsuccess = (e) => {
        const data = e.target.result;
        if (data) {
            currentFileName = data.title;
            fileNameDisplay.textContent = currentFileName;
            updateContent(data.content);
            showToast("작업 내용이 복구되었습니다.");
        }
        dismissRecovery();
    };
}

function dismissRecovery() {
    document.getElementById('recovery-modal').classList.add('hidden');
    document.getElementById('recovery-modal').classList.remove('flex');
    const tx = db.transaction('autosave', 'readwrite');
    tx.objectStore('autosave').delete('last_work');
}

// --- Helper Insertion (Modal) ---
function insertAtCursor(type) {
    const start = editorTextarea.selectionStart;
    const end = editorTextarea.selectionEnd;
    const text = editorTextarea.value;
    const selectedText = text.substring(start, end);
    const currentScrollTop = editorTextarea.scrollTop;

    let before = "", after = "", placeholder = "";

    switch (type) {
        case 'bold': before = "**"; after = "**"; placeholder = "굵은 글씨"; break;
        case 'italic': before = "*"; after = "*"; placeholder = "기울임꼴"; break;
        case 'quote': before = "\n> "; placeholder = "인용문 내용"; break;
        case 'br': before = "  \n"; break;
    }

    const content = selectedText || placeholder;
    const replacement = before + content + after;

    editorTextarea.focus();
    editorTextarea.setSelectionRange(start, end);
    document.execCommand('insertText', false, replacement);

    currentMarkdown = editorTextarea.value;
    editorTextarea.scrollTop = currentScrollTop;
    performAutoSave();
    if (activeSidebarTab === 'toc') renderTOC();

    if (!selectedText && placeholder) {
        editorTextarea.setSelectionRange(start + before.length, start + before.length + content.length);
    } else {
        editorTextarea.setSelectionRange(start + replacement.length, start + replacement.length);
    }
}

function applyHeading(level) {
    if (!isEditMode) return;
    const text = editorTextarea.value;
    const cursor = editorTextarea.selectionStart;

    let lineStart = text.lastIndexOf('\n', cursor - 1) + 1;
    let lineEnd = text.indexOf('\n', cursor);
    if (lineEnd === -1) lineEnd = text.length;

    let lineText = text.substring(lineStart, lineEnd);
    lineText = lineText.replace(/^#+\s*/, '');

    const prefix = '#'.repeat(level) + ' ';
    const replacement = prefix + lineText;

    editorTextarea.focus();
    editorTextarea.setSelectionRange(lineStart, lineEnd);
    document.execCommand('insertText', false, replacement);

    currentMarkdown = editorTextarea.value;

    const newCursor = lineStart + prefix.length + lineText.length;
    editorTextarea.setSelectionRange(newCursor, newCursor);

    performAutoSave();
    if (activeSidebarTab === 'toc') renderTOC();
}

function handleTableInsertion() {
    const start = editorTextarea.selectionStart;
    const end = editorTextarea.selectionEnd;
    const text = editorTextarea.value;
    const selectedText = text.substring(start, end);
    const scrollTop = editorTextarea.scrollTop;

    let replacement = "";

    if (selectedText) {
        const lines = selectedText.trim().split('\n');

        const processRow = (line) => {
            let sep = '\t';
            if (line.includes('\t')) sep = '\t';
            else if (line.includes(',')) sep = ',';
            else if (line.includes(';')) sep = ';';

            if (sep === '\t' && !line.includes('\t')) {
                return `| ${line.trim()} |`;
            }

            const cols = line.split(sep).map(c => c.trim().replace(/^["']|["']$/g, ''));
            return `| ${cols.join(' | ')} |`;
        };

        const generateDivider = (line) => {
            let sep = '\t';
            if (line.includes('\t')) sep = '\t';
            else if (line.includes(',')) sep = ',';
            else if (line.includes(';')) sep = ';';
            if (sep === '\t' && !line.includes('\t')) return `|---|`;

            const cols = line.split(sep);
            return `|${cols.map(() => '---').join('|')}|`;
        };

        if (lines.length > 0) {
            replacement += processRow(lines[0]) + '\n';
            replacement += generateDivider(lines[0]) + '\n';
            for (let i = 1; i < lines.length; i++) {
                replacement += processRow(lines[i]) + '\n';
            }
        }
    } else {
        replacement = `\n| 칼럼 1 | 칼럼 2 | 칼럼 3 |\n| --- | --- | --- |\n| 내용 1 | 내용 2 | 내용 3 |\n| 내용 4 | 내용 5 | 내용 6 |\n`;
    }

    editorTextarea.focus();
    editorTextarea.setSelectionRange(start, end);
    document.execCommand('insertText', false, replacement);

    currentMarkdown = editorTextarea.value;
    editorTextarea.scrollTop = scrollTop;
    editorTextarea.setSelectionRange(start + replacement.length, start + replacement.length);
    performAutoSave();
    if (activeSidebarTab === 'toc') renderTOC();
}

function openLinkModal(mode) {
    modalMode = mode;
    document.getElementById('modal-title').textContent = mode === 'link' ? '링크 삽입' : '이미지 삽입';
    document.getElementById('label-text').textContent = mode === 'link' ? '표시 텍스트' : '이미지 설명';
    document.getElementById('input-display-text').value = editorTextarea.value.substring(editorTextarea.selectionStart, editorTextarea.selectionEnd);
    document.getElementById('input-url').value = "";
    inputModal.classList.remove('hidden');
    inputModal.classList.add('flex');
    document.getElementById('input-display-text').focus();
}

function closeModal() {
    inputModal.classList.add('hidden');
    inputModal.classList.remove('flex');
    editorTextarea.focus();
}

function confirmModalInsert() {
    const displayText = document.getElementById('input-display-text').value || (modalMode === 'link' ? '링크' : '이미지');
    const url = document.getElementById('input-url').value || 'https://';
    const start = editorTextarea.selectionStart;
    const end = editorTextarea.selectionEnd;
    const text = editorTextarea.value;
    const currentScrollTop = editorTextarea.scrollTop;

    const replacement = modalMode === 'link' ? `[${displayText}](${url})` : `![${displayText}](${url})`;

    editorTextarea.value = text.substring(0, start) + replacement + text.substring(end);
    currentMarkdown = editorTextarea.value;
    closeModal();
    editorTextarea.scrollTop = currentScrollTop;
    editorTextarea.setSelectionRange(start + replacement.length, start + replacement.length);
    performAutoSave();
}

// --- Utility ---
function adjustPageScale(delta) {
    pageScale = Math.max(0.5, Math.min(3.0, pageScale + delta));

    // Use zoom to correctly scale layout without clipping bugs
    viewer.style.zoom = pageScale;
    editorTextarea.style.zoom = pageScale;

    // Clear any previous transform styles
    viewer.style.transform = "none";

    document.getElementById('scale-display').textContent = `${Math.round(pageScale * 100)}%`;
}

function adjustFontSize(delta) {
    fontSize = Math.max(10, Math.min(48, fontSize + delta));
    viewer.style.fontSize = `${fontSize}px`;
    editorTextarea.style.fontSize = `${fontSize}px`;
    document.getElementById('font-size-display').textContent = `${fontSize}px`;
}

function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.style.opacity = "1";
    setTimeout(() => { toast.style.opacity = "0"; }, 3000);
}

// --- Settings ---
function initSettings() {
    const savedBg = localStorage.getItem('md_viewer_code_bg');
    const savedText = localStorage.getItem('md_viewer_code_text');
    if (savedBg) {
        document.documentElement.style.setProperty('--code-bg-color', savedBg);
        document.getElementById('code-bg-color').value = savedBg;
    }
    if (savedText) {
        document.documentElement.style.setProperty('--code-text-color', savedText);
        document.getElementById('code-text-color').value = savedText;
    }
}

function openSettingsModal() {
    document.getElementById('settings-modal').classList.remove('hidden');
    document.getElementById('settings-modal').classList.add('flex');
}

function closeSettingsModal() {
    document.getElementById('settings-modal').classList.add('hidden');
    document.getElementById('settings-modal').classList.remove('flex');
}

function applyCodeColorSettings() {
    const bg = document.getElementById('code-bg-color').value;
    const text = document.getElementById('code-text-color').value;
    document.documentElement.style.setProperty('--code-bg-color', bg);
    document.documentElement.style.setProperty('--code-text-color', text);

    // Save to local storage
    localStorage.setItem('md_viewer_code_bg', bg);
    localStorage.setItem('md_viewer_code_text', text);
}

function resetCodeColorSettings() {
    const defaultBg = '#1e293b';
    const defaultText = '#f8fafc';
    document.getElementById('code-bg-color').value = defaultBg;
    document.getElementById('code-text-color').value = defaultText;
    applyCodeColorSettings();
    showToast("코드창 색상을 초기화했습니다.");
}

// Global exports for inline HTML handlers
window.toggleTheme = toggleTheme;
window.updateContent = updateContent;
window.renderMarkdown = renderMarkdown;
window.toggleMode = toggleMode;
window.handleFileSelect = handleFileSelect;
window.readFile = readFile;
window.saveFile = saveFile;
window.printPage = printPage;
window.toggleSidebarVisibility = toggleSidebarVisibility;
window.toggleSidebarCollapse = toggleSidebarCollapse;
window.ensureRootFolder = ensureRootFolder;
window.createNewFolder = createNewFolder;
window.saveToDB = saveToDB;
window.renderDBList = renderDBList;
window.loadFromDB = loadFromDB;
window.deleteFromDB = deleteFromDB;
window.openMoveModal = openMoveModal;
window.closeMoveModal = closeMoveModal;
window.moveDocToFolder = moveDocToFolder;
window.performAutoSave = performAutoSave;
window.checkAutoSave = checkAutoSave;
window.applyRecovery = applyRecovery;
window.dismissRecovery = dismissRecovery;
window.insertAtCursor = insertAtCursor;
window.openLinkModal = openLinkModal;
window.closeModal = closeModal;
window.confirmModalInsert = confirmModalInsert;
window.adjustPageScale = adjustPageScale;
window.adjustFontSize = adjustFontSize;
window.showToast = showToast;
window.closeSaveModal = closeSaveModal;
window.confirmSaveModal = confirmSaveModal;
window.closeDeleteModal = closeDeleteModal;
window.confirmDeleteModal = confirmDeleteModal;
window.openSettingsModal = openSettingsModal;
window.closeSettingsModal = closeSettingsModal;
window.applyCodeColorSettings = applyCodeColorSettings;
window.resetCodeColorSettings = resetCodeColorSettings;
window.switchSidebarTab = switchSidebarTab;
window.renderTOC = renderTOC;
window.scrollToLine = scrollToLine;
window.applyHeading = applyHeading;
window.handleTableInsertion = handleTableInsertion;

// --- Advanced Edit Functions ---
function openFindReplace() {
    const bar = document.getElementById('find-replace-bar');
    if (!bar) return;
    bar.classList.remove('hidden');
    if (!isEditMode) toggleMode('edit');
    document.getElementById('find-input').focus();
}

function closeFindReplace() {
    const bar = document.getElementById('find-replace-bar');
    if (bar) bar.classList.add('hidden');
    editorTextarea.focus();
}

let lastFindIndex = -1;

function findNext() {
    const term = document.getElementById('find-input').value;
    if (!term) return;
    const text = editorTextarea.value;
    let idx = text.toLowerCase().indexOf(term.toLowerCase(), lastFindIndex + 1);
    if (idx === -1) idx = text.toLowerCase().indexOf(term.toLowerCase(), 0);

    if (idx !== -1) {
        lastFindIndex = idx;
        editorTextarea.focus();
        editorTextarea.setSelectionRange(idx, idx + term.length);
        const textUpToIdx = text.substring(0, idx);
        const lineCount = textUpToIdx.split('\n').length;
        const lineHeight = parseInt(getComputedStyle(editorTextarea).lineHeight) || 28;
        editorTextarea.scrollTop = (lineCount - 1) * lineHeight - editorTextarea.clientHeight / 2;
    } else {
        showToast("검색 결과가 없습니다.");
    }
}

function findPrev() {
    const term = document.getElementById('find-input').value;
    if (!term) return;
    const text = editorTextarea.value;
    let idx = text.toLowerCase().lastIndexOf(term.toLowerCase(), Math.max(0, lastFindIndex - 1));
    if (idx === -1) idx = text.toLowerCase().lastIndexOf(term.toLowerCase());

    if (idx !== -1) {
        lastFindIndex = idx;
        editorTextarea.focus();
        editorTextarea.setSelectionRange(idx, idx + term.length);
        const lineCount = text.substring(0, idx).split('\n').length;
        const lineHeight = parseInt(getComputedStyle(editorTextarea).lineHeight) || 28;
        editorTextarea.scrollTop = (lineCount - 1) * lineHeight - editorTextarea.clientHeight / 2;
    } else {
        showToast("검색 결과가 없습니다.");
    }
}

function replaceCurrent() {
    const term = document.getElementById('find-input').value;
    const replacement = document.getElementById('replace-input').value;
    if (!term) return;
    const start = editorTextarea.selectionStart;
    const end = editorTextarea.selectionEnd;
    const selectedText = editorTextarea.value.substring(start, end);

    if (selectedText.toLowerCase() === term.toLowerCase()) {
        editorTextarea.setSelectionRange(start, end);
        document.execCommand('insertText', false, replacement);
        currentMarkdown = editorTextarea.value;
        performAutoSave();
        if (activeSidebarTab === 'toc') renderTOC();
        findNext();
    } else {
        findNext();
    }
}

function replaceAll() {
    const term = document.getElementById('find-input').value;
    const replacement = document.getElementById('replace-input').value;
    if (!term) return;

    let count = 0;
    editorTextarea.focus();
    editorTextarea.setSelectionRange(0, 0);

    while (true) {
        let text = editorTextarea.value;
        let idx = text.toLowerCase().indexOf(term.toLowerCase(), editorTextarea.selectionEnd);
        if (idx === -1) break;
        editorTextarea.setSelectionRange(idx, idx + term.length);
        document.execCommand('insertText', false, replacement);
        count++;
    }

    if (count > 0) {
        currentMarkdown = editorTextarea.value;
        performAutoSave();
        if (activeSidebarTab === 'toc') renderTOC();
        showToast(`${count}개 항목이 바뀌었습니다.`);
    } else {
        showToast("검색 결과가 없습니다.");
    }
}

function moveLineUp() {
    const start = editorTextarea.selectionStart;
    const text = editorTextarea.value;
    let lineStart = text.lastIndexOf('\n', start - 1) + 1;
    let lineEnd = text.indexOf('\n', editorTextarea.selectionEnd);
    if (lineEnd === -1) lineEnd = text.length;

    if (lineStart === 0) return;

    let prevLineStart = text.lastIndexOf('\n', lineStart - 2) + 1;
    let prevLineText = text.substring(prevLineStart, lineStart);
    let currentLineText = text.substring(lineStart, lineEnd);

    editorTextarea.setSelectionRange(prevLineStart, lineEnd);
    const replacement = currentLineText + '\n' + prevLineText.replace(/\n$/, '');
    document.execCommand('insertText', false, replacement);

    currentMarkdown = editorTextarea.value;
    performAutoSave();
    if (activeSidebarTab === 'toc') renderTOC();

    editorTextarea.setSelectionRange(prevLineStart, prevLineStart + currentLineText.length);
}

function moveLineDown() {
    const start = editorTextarea.selectionStart;
    const text = editorTextarea.value;
    let lineStart = text.lastIndexOf('\n', start - 1) + 1;
    let lineEnd = text.indexOf('\n', editorTextarea.selectionEnd);
    if (lineEnd === -1) lineEnd = text.length;

    if (lineEnd === text.length) return;

    let nextLineEnd = text.indexOf('\n', lineEnd + 1);
    if (nextLineEnd === -1) nextLineEnd = text.length;

    let currentLineText = text.substring(lineStart, lineEnd);
    let nextLineText = text.substring(lineEnd + 1, nextLineEnd);

    editorTextarea.setSelectionRange(lineStart, nextLineEnd);
    const replacement = nextLineText + '\n' + currentLineText;
    document.execCommand('insertText', false, replacement);

    currentMarkdown = editorTextarea.value;
    performAutoSave();
    if (activeSidebarTab === 'toc') renderTOC();

    const newStart = lineStart + nextLineText.length + 1;
    editorTextarea.setSelectionRange(newStart, newStart + currentLineText.length);
}

function copyLineDown() {
    const start = editorTextarea.selectionStart;
    const text = editorTextarea.value;
    let lineStart = text.lastIndexOf('\n', start - 1) + 1;
    let lineEnd = text.indexOf('\n', editorTextarea.selectionEnd);
    if (lineEnd === -1) lineEnd = text.length;

    let currentLineText = text.substring(lineStart, lineEnd);

    editorTextarea.setSelectionRange(lineEnd, lineEnd);
    document.execCommand('insertText', false, '\n' + currentLineText);

    currentMarkdown = editorTextarea.value;
    performAutoSave();
    if (activeSidebarTab === 'toc') renderTOC();

    const newStart = lineEnd + 1;
    editorTextarea.setSelectionRange(newStart, newStart + currentLineText.length);
}

window.openFindReplace = openFindReplace;
window.closeFindReplace = closeFindReplace;
window.findNext = findNext;
window.findPrev = findPrev;
window.replaceCurrent = replaceCurrent;
window.replaceAll = replaceAll;
