(function () {
    'use strict';

    const MACRO_ENTRIES_KEY = 'md_viewer_macro_entries_v1';
    const MACRO_MENU_LAYOUT_KEY = 'md_viewer_macro_menu_layout_v1';

    let macroRecording = false;
    let macroEntries = [];
    let macroSeq = 1;
    let macroHotkeyCaptureEntryId = '';

    let macroMenuDragBound = false;
    let macroMenuDragging = false;
    let macroMenuResizing = false;
    let macroMenuDragOffsetX = 0;
    let macroMenuDragOffsetY = 0;
    let macroMenuStartX = 0;
    let macroMenuStartY = 0;
    let macroMenuStartW = 0;
    let macroMenuStartH = 0;

    function getMacroCatalog() {
        return [
            { id: 'bold', label: '굵게', shortcut: 'Ctrl+B', run: function () { insertAtCursor('bold'); } },
            { id: 'italic', label: '기울임', shortcut: 'Ctrl+I', run: function () { insertAtCursor('italic'); } },
            { id: 'h1', label: '제목 H1', shortcut: 'Ctrl+Alt+1', run: function () { applyHeading(1); } },
            { id: 'h2', label: '제목 H2', shortcut: 'Ctrl+Alt+2', run: function () { applyHeading(2); } },
            { id: 'h3', label: '제목 H3', shortcut: 'Ctrl+Alt+3', run: function () { applyHeading(3); } },
            { id: 'list_bullet', label: '항목 목록', shortcut: 'Alt+5', run: function () { insertListAtSelection('bullet'); } },
            { id: 'list_number', label: '번호 목록', shortcut: 'Alt+6', run: function () { insertListAtSelection('number'); } },
            { id: 'code', label: '코드 블록', shortcut: 'Alt+C', run: function () { insertAtCursor('code'); } },
            { id: 'mermaid', label: 'Mermaid 블록', shortcut: 'Alt+M', run: function () { insertAtCursor('mermaid'); } },
            { id: 'quote', label: '인용구', shortcut: '-', run: function () { insertAtCursor('quote'); } },
            { id: 'table', label: '표 삽입', shortcut: '-', run: function () { handleTableInsertion(); } },
            { id: 'pattern_to_table', label: '패턴 표 변환', shortcut: 'Alt+7', run: function () { convertSelectionPatternToTable(); } },
            { id: 'link', label: '링크 삽입', shortcut: '-', run: function () { openLinkModal('link'); } },
            { id: 'image', label: '이미지 링크', shortcut: '-', run: function () { openLinkModal('image'); } },
            { id: 'image_panel', label: '이미지 패널', shortcut: '-', run: function () { openImageInsertModal(); } },
            { id: 'tidy', label: 'Tidy', shortcut: 'Ctrl+Alt+T', run: function () { tidySeparatorSpacingInEditor(); } },
            { id: 'find', label: 'Find/Replace', shortcut: 'Ctrl+H', run: function () { openFindReplace(); } },
            { id: 'md2html', label: 'MD2HTML', shortcut: 'Shift+Alt+H', run: function () { convertSelectionMarkdownToHtml(); } },
            { id: 'preview_popup', label: '프리뷰 팝업', shortcut: '-', run: function () { openPreviewPopupWindow(); } },
            { id: 'footnote', label: '각주 템플릿', shortcut: 'Ctrl+Alt+E', run: function () { insertFootnoteTemplate(); } },
            { id: 'id_anchor', label: 'ID 앵커', shortcut: '-', run: function () { openLinkModal('id'); } },
            { id: 'user_info', label: 'userIn 삽입', shortcut: 'Shift+Alt+A', run: function () { insertUserInfoAtCursor(); } },
            { id: 'insert_br', label: '<br> 삽입', shortcut: 'Ctrl+Shift+Enter', run: function () { insertLiteralAtCursor('<br>'); } }
        ];
    }

    function getMacroActionById(actionId) {
        const id = String(actionId || '').trim();
        if (!id) return null;
        const list = getMacroCatalog();
        for (let i = 0; i < list.length; i += 1) {
            if (list[i].id === id) return list[i];
        }
        return null;
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function getMacroStoragePayload() {
        return {
            seq: macroSeq,
            entries: Array.isArray(macroEntries) ? macroEntries.slice() : []
        };
    }

    function saveMacroEntriesToLocal() {
        try {
            localStorage.setItem(MACRO_ENTRIES_KEY, JSON.stringify(getMacroStoragePayload()));
        } catch (_) {}
    }

    function normalizeShortcutText(value) {
        const raw = String(value || '').trim();
        if (!raw) return '';
        const parts = raw.split('+').map(function (p) { return String(p || '').trim(); }).filter(Boolean);
        if (!parts.length) return '';
        let hasCtrl = false;
        let hasAlt = false;
        let hasShift = false;
        let hasMeta = false;
        let key = '';
        for (let i = 0; i < parts.length; i += 1) {
            const p = parts[i].toLowerCase();
            if (p === 'ctrl' || p === 'control') hasCtrl = true;
            else if (p === 'alt' || p === 'option') hasAlt = true;
            else if (p === 'shift') hasShift = true;
            else if (p === 'meta' || p === 'cmd' || p === 'command') hasMeta = true;
            else key = parts[i];
        }
        if (!key) return '';
        const out = [];
        if (hasCtrl) out.push('Ctrl');
        if (hasAlt) out.push('Alt');
        if (hasShift) out.push('Shift');
        if (hasMeta) out.push('Meta');
        out.push(String(key).toUpperCase());
        return out.join('+');
    }

    function loadMacroEntriesFromLocal() {
        try {
            const raw = localStorage.getItem(MACRO_ENTRIES_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw);
            const seq = Number(parsed && parsed.seq);
            const entries = Array.isArray(parsed && parsed.entries) ? parsed.entries : [];
            macroSeq = Number.isFinite(seq) && seq > 0 ? Math.floor(seq) : 1;
            macroEntries = entries
                .map(function (item) {
                    return {
                        entryId: String(item && item.entryId ? item.entryId : ''),
                        actionId: String(item && item.actionId ? item.actionId : ''),
                        enabled: item && item.enabled !== false,
                        hotkey: normalizeShortcutText(item && item.hotkey ? item.hotkey : '')
                    };
                })
                .filter(function (item) {
                    return !!item.entryId && !!getMacroActionById(item.actionId);
                });
        } catch (_) {
            macroEntries = [];
            macroSeq = 1;
        }
    }

    function updateMacroRecordStatusUi() {
        const status = document.getElementById('macro-record-status');
        const btn = document.getElementById('btn-macro-record');
        if (status) {
            if (macroHotkeyCaptureEntryId) {
                status.textContent = '단축키 입력: ' + macroHotkeyCaptureEntryId + ' (Esc 취소)';
                status.className = 'ml-1 text-[11px] text-amber-600 dark:text-amber-400';
            } else if (macroRecording) {
                status.textContent = 'recording...';
                status.className = 'ml-1 text-[11px] text-emerald-600 dark:text-emerald-400';
            } else {
                status.textContent = 'idle';
                status.className = 'ml-1 text-[11px] text-slate-500 dark:text-slate-400';
            }
        }
        if (btn) {
            btn.classList.toggle('bg-emerald-50', macroRecording);
            btn.classList.toggle('dark:bg-emerald-900/20', macroRecording);
        }
    }

    function renderMacroList() {
        const body = document.getElementById('macro-list-body');
        if (!body) return;
        if (!macroEntries.length) {
            body.innerHTML = '<div class="px-2 py-2 text-[11px] text-slate-500 dark:text-slate-400">record 후 동작을 수행하면 목록이 생성됩니다.</div>';
            return;
        }
        body.innerHTML = macroEntries.map(function (entry) {
            const meta = getMacroActionById(entry.actionId);
            const label = meta ? meta.label : entry.actionId;
            const hotkey = entry.hotkey || '-';
            return ''
                + '<div class="grid grid-cols-[30px_80px_1fr_170px_56px] gap-1 px-2 py-1.5 border-t border-slate-200 dark:border-slate-700 text-[11px]">'
                + '  <div class="flex items-center justify-center"><input type="checkbox" ' + (entry.enabled ? 'checked' : '') + ' onchange="toggleMacroEntryEnabled(\'' + entry.entryId + '\', this.checked)" class="rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500"></div>'
                + '  <div class="truncate font-mono text-slate-700 dark:text-slate-300" title="' + escapeHtml(entry.entryId) + '">' + escapeHtml(entry.entryId) + '</div>'
                + '  <div class="truncate text-slate-700 dark:text-slate-200" title="' + escapeHtml(label) + '">' + escapeHtml(label) + '</div>'
                + '  <div class="flex items-center gap-1">'
                + '    <button type="button" onclick="registerMacroEntryShortcut(\'' + entry.entryId + '\')" class="px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700">등록</button>'
                + '    <button type="button" onclick="clearMacroEntryShortcut(\'' + entry.entryId + '\')" class="px-1 py-0.5 rounded border border-rose-300 dark:border-rose-700 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-900/20">x</button>'
                + '    <span class="truncate text-slate-500 dark:text-slate-400" title="' + escapeHtml(hotkey) + '">' + escapeHtml(hotkey) + '</span>'
                + '  </div>'
                + '  <div class="flex items-center justify-center"><button type="button" onclick="runMacroEntry(\'' + entry.entryId + '\')" class="px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700">▶</button></div>'
                + '</div>';
        }).join('');
    }

    function ensureMacroMenuBind() {
        if (document.body && !document.body.__macroMenuBound) {
            document.body.__macroMenuBound = true;
            document.addEventListener('click', function (e) {
                const panel = document.getElementById('macro-menu-panel');
                const wrapBtn = document.getElementById('btn-macro-menu');
                const runBtn = document.getElementById('btn-macro-run');
                if (!panel || panel.classList.contains('hidden')) return;
                const target = e.target;
                if (panel.contains(target) || (wrapBtn && wrapBtn.contains(target)) || (runBtn && runBtn.contains(target))) return;
                closeMacroMenuPanel();
            });
        }
    }

    function getMacroMenuPanel() {
        return document.getElementById('macro-menu-panel');
    }

    function getMacroMenuViewport() {
        return {
            width: Math.max(320, Number(window.innerWidth) || 1200),
            height: Math.max(260, Number(window.innerHeight) || 700)
        };
    }

    function getMacroMenuLayoutFromLocal() {
        try {
            const raw = localStorage.getItem(MACRO_MENU_LAYOUT_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return null;
            return {
                left: Number(parsed.left),
                top: Number(parsed.top),
                width: Number(parsed.width),
                height: Number(parsed.height)
            };
        } catch (_) {
            return null;
        }
    }

    function setMacroMenuLayoutToLocal(layout) {
        try {
            localStorage.setItem(MACRO_MENU_LAYOUT_KEY, JSON.stringify(layout || {}));
        } catch (_) {}
    }

    function getDefaultMacroMenuLayout() {
        const vp = getMacroMenuViewport();
        const runBtn = document.getElementById('btn-macro-run');
        const runRect = runBtn ? runBtn.getBoundingClientRect() : null;
        const width = Math.max(360, Math.min(620, Math.floor(vp.width * 0.92)));
        const height = Math.max(220, Math.min(520, Math.floor(vp.height * 0.5)));
        const left = runRect ? Math.max(8, Math.min(Math.floor(runRect.left), vp.width - width - 8)) : Math.max(8, vp.width - width - 12);
        const top = runRect ? Math.max(8, Math.min(Math.floor(runRect.bottom + 8), vp.height - height - 8)) : 86;
        return { left: left, top: top, width: width, height: height };
    }

    function clampMacroMenuLayout(layoutInput) {
        const layout = layoutInput || {};
        const vp = getMacroMenuViewport();
        const minW = 360;
        const minH = 220;
        const maxW = Math.max(minW, vp.width - 16);
        const maxH = Math.max(minH, vp.height - 16);
        const width = Math.max(minW, Math.min(Number(layout.width) || 620, maxW));
        const height = Math.max(minH, Math.min(Number(layout.height) || 300, maxH));
        const maxLeft = Math.max(8, vp.width - width - 8);
        const maxTop = Math.max(8, vp.height - height - 8);
        const leftRaw = Number(layout.left);
        const topRaw = Number(layout.top);
        const left = Number.isFinite(leftRaw) ? Math.max(8, Math.min(leftRaw, maxLeft)) : maxLeft;
        const top = Number.isFinite(topRaw) ? Math.max(8, Math.min(topRaw, maxTop)) : 86;
        return { left: left, top: top, width: width, height: height };
    }

    function applyMacroMenuLayout(layoutInput) {
        const panel = getMacroMenuPanel();
        if (!panel) return;
        const layout = clampMacroMenuLayout(layoutInput || getMacroMenuLayoutFromLocal() || getDefaultMacroMenuLayout());
        panel.style.left = layout.left + 'px';
        panel.style.top = layout.top + 'px';
        panel.style.width = layout.width + 'px';
        panel.style.height = layout.height + 'px';
        panel.style.right = 'auto';
        panel.style.maxWidth = '';
        setMacroMenuLayoutToLocal(layout);
    }

    function closeMacroMenuPanel() {
        const panel = getMacroMenuPanel();
        if (!panel) return;
        panel.classList.add('hidden');
        macroHotkeyCaptureEntryId = '';
        updateMacroRecordStatusUi();
    }

    function openMacroMenuPanel() {
        const panel = getMacroMenuPanel();
        if (!panel) return;
        panel.classList.remove('hidden');
        renderMacroList();
        updateMacroRecordStatusUi();
        bindMacroMenuInteractions();
        applyMacroMenuLayout(getMacroMenuLayoutFromLocal() || getDefaultMacroMenuLayout());
    }

    function toggleMacroMenu() {
        const panel = getMacroMenuPanel();
        if (!panel) return;
        if (panel.classList.contains('hidden')) openMacroMenuPanel();
        else closeMacroMenuPanel();
    }

    function dockMacroMenuRight() {
        const layout = clampMacroMenuLayout(getMacroMenuLayoutFromLocal() || getDefaultMacroMenuLayout());
        const vp = getMacroMenuViewport();
        const next = {
            left: Math.max(8, vp.width - layout.width - 12),
            top: layout.top,
            width: layout.width,
            height: layout.height
        };
        applyMacroMenuLayout(next);
    }

    function toggleMacroRecord(on) {
        macroRecording = !!on;
        updateMacroRecordStatusUi();
        if (typeof showToast === 'function') {
            if (macroRecording) showToast('Macro record 시작');
            else showToast('Macro record 종료');
        }
    }

    function appendMacroEntry(actionId) {
        const meta = getMacroActionById(actionId);
        if (!meta) return;
        const entryId = 'M' + String(macroSeq).padStart(3, '0');
        macroSeq += 1;
        macroEntries.push({ entryId: entryId, actionId: meta.id, enabled: true, hotkey: '' });
        saveMacroEntriesToLocal();
        renderMacroList();
    }

    function getMacroActionIdFromOnclickAttr(onclickValue) {
        const s = String(onclickValue || '');
        const map = {
            "insertAtCursor('bold')": 'bold',
            "insertAtCursor('italic')": 'italic',
            'applyHeading(1)': 'h1',
            'applyHeading(2)': 'h2',
            'applyHeading(3)': 'h3',
            "insertListAtSelection('bullet')": 'list_bullet',
            "insertListAtSelection('number')": 'list_number',
            "insertAtCursor('code')": 'code',
            "insertAtCursor('mermaid')": 'mermaid',
            "insertAtCursor('quote')": 'quote',
            'handleTableInsertion()': 'table',
            'convertSelectionPatternToTable()': 'pattern_to_table',
            "openLinkModal('link')": 'link',
            "openLinkModal('image')": 'image',
            'openImageInsertModal()': 'image_panel',
            'tidySeparatorSpacingInEditor()': 'tidy',
            'openFindReplace()': 'find',
            'convertSelectionMarkdownToHtml()': 'md2html',
            'openPreviewPopupWindow()': 'preview_popup',
            'insertFootnoteTemplate()': 'footnote',
            "openLinkModal('id')": 'id_anchor',
            'insertUserInfoAtCursor()': 'user_info'
        };
        return map[s] || '';
    }

    function getMacroActionIdFromHotkey(e) {
        const key = String(e.key || '').toLowerCase();
        if (e.ctrlKey && !e.altKey && key === 'b') return 'bold';
        if (e.ctrlKey && !e.altKey && key === 'i') return 'italic';
        if (e.ctrlKey && e.altKey && !e.shiftKey && key === '1') return 'h1';
        if (e.ctrlKey && e.altKey && !e.shiftKey && key === '2') return 'h2';
        if (e.ctrlKey && e.altKey && !e.shiftKey && key === '3') return 'h3';
        if (e.altKey && !e.ctrlKey && !e.shiftKey && key === '5') return 'list_bullet';
        if (e.altKey && !e.ctrlKey && !e.shiftKey && key === '6') return 'list_number';
        if (e.altKey && !e.ctrlKey && !e.shiftKey && key === 'c') return 'code';
        if (e.altKey && !e.ctrlKey && !e.shiftKey && key === 'm') return 'mermaid';
        if (e.altKey && !e.ctrlKey && !e.shiftKey && key === '7') return 'pattern_to_table';
        if (e.ctrlKey && !e.altKey && key === 'h') return 'find';
        if (e.ctrlKey && e.altKey && !e.shiftKey && key === 't') return 'tidy';
        if (e.ctrlKey && e.altKey && !e.shiftKey && key === 'e') return 'footnote';
        if (e.shiftKey && e.altKey && !e.ctrlKey && key === 'h') return 'md2html';
        if (e.shiftKey && e.altKey && !e.ctrlKey && key === 'a') return 'user_info';
        if (e.ctrlKey && e.shiftKey && !e.altKey && (e.code === 'Enter' || key === 'enter')) return 'insert_br';
        return '';
    }

    function isOnlyModifierKey(e) {
        const k = String(e.key || '');
        return k === 'Control' || k === 'Shift' || k === 'Alt' || k === 'Meta';
    }

    function keyNameFromEvent(e) {
        const code = String(e.code || '');
        const key = String(e.key || '');
        if (code.indexOf('Key') === 0) return code.slice(3).toUpperCase();
        if (code.indexOf('Digit') === 0) return code.slice(5);
        if (code.indexOf('Numpad') === 0) return 'NUM' + code.slice(6).toUpperCase();
        if (!key) return '';
        if (key === ' ') return 'SPACE';
        if (key === 'Escape') return 'ESC';
        if (key === 'ArrowUp') return 'UP';
        if (key === 'ArrowDown') return 'DOWN';
        if (key === 'ArrowLeft') return 'LEFT';
        if (key === 'ArrowRight') return 'RIGHT';
        if (key === 'PageUp') return 'PGUP';
        if (key === 'PageDown') return 'PGDN';
        if (key === 'Backspace') return 'BACKSPACE';
        if (key === 'Delete') return 'DELETE';
        if (key === 'Enter') return 'ENTER';
        if (key === 'Tab') return 'TAB';
        if (key === 'Home') return 'HOME';
        if (key === 'End') return 'END';
        return key.length === 1 ? key.toUpperCase() : key.toUpperCase();
    }

    function shortcutFromEvent(e, opts) {
        const options = opts || {};
        if (!e || isOnlyModifierKey(e)) return '';
        const key = keyNameFromEvent(e);
        if (!key) return '';
        const hasCtrl = !!e.ctrlKey;
        const hasAlt = !!e.altKey;
        const hasShift = !!e.shiftKey;
        const hasMeta = !!e.metaKey;
        if (options.requireModifier !== false && !(hasCtrl || hasAlt || hasMeta)) return '';
        const parts = [];
        if (hasCtrl) parts.push('Ctrl');
        if (hasAlt) parts.push('Alt');
        if (hasShift) parts.push('Shift');
        if (hasMeta) parts.push('Meta');
        parts.push(key);
        return parts.join('+');
    }

    function findEntryById(entryId) {
        const id = String(entryId || '');
        return macroEntries.find(function (entry) { return entry.entryId === id; }) || null;
    }

    function findEntryByHotkey(shortcut, excludeEntryId) {
        const normalized = normalizeShortcutText(shortcut);
        if (!normalized) return null;
        const exclude = String(excludeEntryId || '');
        for (let i = 0; i < macroEntries.length; i += 1) {
            const item = macroEntries[i];
            if (!item || !item.enabled) continue;
            if (exclude && item.entryId === exclude) continue;
            if (normalizeShortcutText(item.hotkey) === normalized) return item;
        }
        return null;
    }

    function updateMacroEntry(entryId, updater) {
        const id = String(entryId || '');
        let changed = false;
        macroEntries = macroEntries.map(function (entry) {
            if (entry.entryId !== id) return entry;
            changed = true;
            return updater(entry);
        });
        if (changed) {
            saveMacroEntriesToLocal();
            renderMacroList();
        }
    }

    function registerMacroEntryShortcut(entryId) {
        const target = findEntryById(entryId);
        if (!target) return;
        macroHotkeyCaptureEntryId = target.entryId;
        updateMacroRecordStatusUi();
        if (typeof showToast === 'function') showToast(target.entryId + ' 단축키를 입력하세요. (Esc 취소)');
    }

    function clearMacroEntryShortcut(entryId) {
        updateMacroEntry(entryId, function (entry) {
            return { entryId: entry.entryId, actionId: entry.actionId, enabled: entry.enabled, hotkey: '' };
        });
        if (macroHotkeyCaptureEntryId === String(entryId || '')) {
            macroHotkeyCaptureEntryId = '';
            updateMacroRecordStatusUi();
        }
    }

    function bindMacroRecorderHooks() {
        const editTools = document.getElementById('edit-tools');
        if (editTools && !editTools.__macroRecordBound) {
            editTools.__macroRecordBound = true;
            editTools.addEventListener('click', function (e) {
                if (!macroRecording) return;
                const btn = e.target && e.target.closest ? e.target.closest('button[onclick]') : null;
                if (!btn) return;
                const actionId = getMacroActionIdFromOnclickAttr(btn.getAttribute('onclick'));
                if (!actionId) return;
                appendMacroEntry(actionId);
            }, true);
        }
        if (!window.__macroHotkeyBound) {
            window.__macroHotkeyBound = true;
            window.addEventListener('keydown', function (e) {
                if (macroHotkeyCaptureEntryId) {
                    if (e.key === 'Escape') {
                        e.preventDefault();
                        macroHotkeyCaptureEntryId = '';
                        updateMacroRecordStatusUi();
                        if (typeof showToast === 'function') showToast('단축키 등록 취소');
                        return;
                    }
                    const combo = shortcutFromEvent(e, { requireModifier: true });
                    if (!combo) {
                        e.preventDefault();
                        if (typeof showToast === 'function') showToast('Ctrl/Alt/Meta 조합으로 입력하세요.');
                        return;
                    }
                    e.preventDefault();
                    const duplicate = findEntryByHotkey(combo, macroHotkeyCaptureEntryId);
                    if (duplicate) {
                        clearMacroEntryShortcut(duplicate.entryId);
                    }
                    updateMacroEntry(macroHotkeyCaptureEntryId, function (entry) {
                        return { entryId: entry.entryId, actionId: entry.actionId, enabled: entry.enabled, hotkey: combo };
                    });
                    if (typeof showToast === 'function') showToast(macroHotkeyCaptureEntryId + ' 단축키 등록: ' + combo);
                    macroHotkeyCaptureEntryId = '';
                    updateMacroRecordStatusUi();
                    return;
                }

                if (macroRecording) {
                    const actionId = getMacroActionIdFromHotkey(e);
                    if (!actionId) return;
                    appendMacroEntry(actionId);
                    return;
                }

                const combo = shortcutFromEvent(e, { requireModifier: true });
                if (!combo) return;
                const target = findEntryByHotkey(combo, '');
                if (!target) return;
                e.preventDefault();
                runMacroEntry(target.entryId);
            }, true);
        }
    }

    function bindMacroMenuInteractions() {
        if (macroMenuDragBound) return;
        macroMenuDragBound = true;
        const panel = getMacroMenuPanel();
        const header = document.getElementById('macro-menu-header');
        const resize = document.getElementById('macro-menu-resize-handle');
        if (!panel) return;

        if (header) {
            header.addEventListener('mousedown', function (e) {
                const target = e.target;
                if (target && (target.closest('button') || target.closest('input') || target.closest('a'))) return;
                const rect = panel.getBoundingClientRect();
                macroMenuDragging = true;
                macroMenuDragOffsetX = e.clientX - rect.left;
                macroMenuDragOffsetY = e.clientY - rect.top;
                e.preventDefault();
            });
        }

        if (resize) {
            resize.addEventListener('mousedown', function (e) {
                const cur = clampMacroMenuLayout(getMacroMenuLayoutFromLocal() || getDefaultMacroMenuLayout());
                macroMenuResizing = true;
                macroMenuStartX = e.clientX;
                macroMenuStartY = e.clientY;
                macroMenuStartW = cur.width;
                macroMenuStartH = cur.height;
                e.preventDefault();
                e.stopPropagation();
            });
        }

        document.addEventListener('mousemove', function (e) {
            const panelEl = getMacroMenuPanel();
            if (!panelEl || panelEl.classList.contains('hidden')) return;
            if (macroMenuDragging) {
                const cur = clampMacroMenuLayout(getMacroMenuLayoutFromLocal() || getDefaultMacroMenuLayout());
                applyMacroMenuLayout({
                    left: e.clientX - macroMenuDragOffsetX,
                    top: e.clientY - macroMenuDragOffsetY,
                    width: cur.width,
                    height: cur.height
                });
                return;
            }
            if (macroMenuResizing) {
                const cur = clampMacroMenuLayout(getMacroMenuLayoutFromLocal() || getDefaultMacroMenuLayout());
                applyMacroMenuLayout({
                    left: cur.left,
                    top: cur.top,
                    width: macroMenuStartW + (e.clientX - macroMenuStartX),
                    height: macroMenuStartH + (e.clientY - macroMenuStartY)
                });
            }
        });

        document.addEventListener('mouseup', function () {
            macroMenuDragging = false;
            macroMenuResizing = false;
        });

        window.addEventListener('resize', function () {
            const panelEl = getMacroMenuPanel();
            if (!panelEl || panelEl.classList.contains('hidden')) return;
            applyMacroMenuLayout(getMacroMenuLayoutFromLocal() || getDefaultMacroMenuLayout());
        });
    }

    function toggleMacroEntryEnabled(entryId, enabled) {
        const target = String(entryId || '');
        macroEntries = macroEntries.map(function (entry) {
            if (entry.entryId !== target) return entry;
            return { entryId: entry.entryId, actionId: entry.actionId, enabled: !!enabled, hotkey: entry.hotkey || '' };
        });
        saveMacroEntriesToLocal();
        renderMacroList();
    }

    async function executeMacroAction(actionId, opts) {
        const options = opts || {};
        const meta = getMacroActionById(actionId);
        if (!meta || typeof meta.run !== 'function') return false;
        if (macroRecording && options.record !== false) appendMacroEntry(meta.id);
        try {
            const out = meta.run();
            if (out && typeof out.then === 'function') await out;
            return true;
        } catch (_) {
            if (typeof showToast === 'function') showToast('Macro 실행 실패: ' + meta.label);
            return false;
        }
    }

    function runMacroEntry(entryId) {
        const target = macroEntries.find(function (entry) { return entry.entryId === String(entryId || ''); });
        if (!target) return;
        executeMacroAction(target.actionId, { record: false });
    }

    async function runCheckedMacroActions() {
        const runBtn = document.getElementById('btn-macro-run');
        const targets = macroEntries.filter(function (entry) { return entry.enabled; });
        if (!targets.length) {
            if (typeof showToast === 'function') showToast('체크된 매크로가 없습니다.');
            closeMacroMenuPanel();
            return;
        }
        if (runBtn) {
            runBtn.disabled = true;
            runBtn.classList.add('opacity-60', 'cursor-not-allowed');
        }
        for (let i = 0; i < targets.length; i += 1) {
            await executeMacroAction(targets[i].actionId, { record: false });
        }
        if (runBtn) {
            runBtn.disabled = false;
            runBtn.classList.remove('opacity-60', 'cursor-not-allowed');
        }
    }

    function clearMacroEntries() {
        macroEntries = [];
        macroSeq = 1;
        macroHotkeyCaptureEntryId = '';
        saveMacroEntriesToLocal();
        renderMacroList();
        updateMacroRecordStatusUi();
    }

    function init() {
        loadMacroEntriesFromLocal();
        ensureMacroMenuBind();
        bindMacroRecorderHooks();
        bindMacroMenuInteractions();
        updateMacroRecordStatusUi();
        renderMacroList();
    }

    window.TRTMacro = {
        init: init,
        toggleMacroMenu: toggleMacroMenu,
        toggleMacroRecord: toggleMacroRecord,
        runCheckedMacroActions: runCheckedMacroActions,
        runMacroEntry: runMacroEntry,
        toggleMacroEntryEnabled: toggleMacroEntryEnabled,
        clearMacroEntries: clearMacroEntries,
        registerMacroEntryShortcut: registerMacroEntryShortcut,
        clearMacroEntryShortcut: clearMacroEntryShortcut,
        dockMacroMenuRight: dockMacroMenuRight
    };
})();
