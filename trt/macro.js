(function () {
    'use strict';

    const MACRO_ENTRIES_KEY = 'md_viewer_macro_entries_v1';
    const MACRO_MENU_LAYOUT_KEY = 'md_viewer_macro_menu_layout_v1';

    let macroRecording = false;
    let macroEntries = [];
    let macroSeq = 1;
    let macroHotkeyCaptureEntryId = '';
    let macroRuntimeHooksBound = false;
    let macroReplayDepth = 0;
    let macroScriptEditorEntryId = '';
    let macroPendingEditorBeforeInput = null;
    let macroSuppressEditorInputRecord = false;
    let macroRecordSession = null;
    let macroRecordTargetMode = 'relative';

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
            { id: 'bold', label: 'Bold', shortcut: 'Ctrl+B', run: function () { insertAtCursor('bold'); } },
            { id: 'italic', label: 'Italic', shortcut: 'Ctrl+I', run: function () { insertAtCursor('italic'); } },
            { id: 'h1', label: 'Heading H1', shortcut: 'Ctrl+Alt+1', run: function () { applyHeading(1); } },
            { id: 'h2', label: 'Heading H2', shortcut: 'Ctrl+Alt+2', run: function () { applyHeading(2); } },
            { id: 'h3', label: 'Heading H3', shortcut: 'Ctrl+Alt+3', run: function () { applyHeading(3); } },
            { id: 'list_bullet', label: 'Bullet List', shortcut: 'Alt+5', run: function () { insertListAtSelection('bullet'); } },
            { id: 'list_number', label: 'Number List', shortcut: 'Alt+6', run: function () { insertListAtSelection('number'); } },
            { id: 'code', label: 'Code Block', shortcut: 'Alt+C', run: function () { insertAtCursor('code'); } },
            { id: 'mermaid', label: 'Mermaid Block', shortcut: 'Alt+M', run: function () { insertAtCursor('mermaid'); } },
            { id: 'quote', label: 'Quote', shortcut: '-', run: function () { insertAtCursor('quote'); } },
            { id: 'table', label: 'Table', shortcut: '-', run: function () { handleTableInsertion(); } },
            { id: 'pattern_to_table', label: 'Pattern->Table', shortcut: 'Alt+7', run: function () { convertSelectionPatternToTable(); } },
            { id: 'link', label: 'Insert Link', shortcut: '-', run: function () { openLinkModal('link'); } },
            { id: 'image', label: 'Insert Image Link', shortcut: '-', run: function () { openLinkModal('image'); } },
            { id: 'image_panel', label: 'Image Panel', shortcut: '-', run: function () { openImageInsertModal(); } },
            { id: 'tidy', label: 'Tidy', shortcut: 'Ctrl+Alt+T', run: function () { tidySeparatorSpacingInEditor(); } },
            { id: 'find', label: 'Find/Replace', shortcut: 'Ctrl+H', run: function () { openFindReplace(); } },
            { id: 'editor_edit', label: 'Editor Edit', shortcut: '-', run: function () {} },
            { id: 'script_macro', label: 'Recorded Script', shortcut: '-', run: function () {} },
            { id: 'replace_current', label: 'Replace Current', shortcut: '-', run: function () { replaceCurrent(); } },
            { id: 'replace_all', label: 'Replace All', shortcut: '-', run: function () { replaceAll(); } },
            { id: 'md2html', label: 'MD2HTML', shortcut: 'Shift+Alt+H', run: function () { convertSelectionMarkdownToHtml(); } },
            { id: 'preview_popup', label: 'Preview Popup', shortcut: '-', run: function () { openPreviewPopupWindow(); } },
            { id: 'footnote', label: 'Footnote', shortcut: 'Ctrl+Alt+E', run: function () { insertFootnoteTemplate(); } },
            { id: 'id_anchor', label: 'ID Anchor', shortcut: '-', run: function () { openLinkModal('id'); } },
            { id: 'user_info', label: 'Insert userIn', shortcut: 'Shift+Alt+A', run: function () { insertUserInfoAtCursor(); } },
            { id: 'insert_br', label: 'Insert <br>', shortcut: 'Ctrl+Shift+Enter', run: function () { insertLiteralAtCursor('<br>'); } }
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

    function normalizeTargetMode(value) {
        return String(value || '').toLowerCase() === 'absolute' ? 'absolute' : 'relative';
    }

    function sanitizeCursorIndex(value) {
        const n = Number(value);
        return Number.isFinite(n) && n >= 0 ? Math.floor(n) : -1;
    }

    function getEditorElement() {
        return document.getElementById('viewer-edit-ta') || null;
    }

    function getEditorCursorIndex() {
        const ta = getEditorElement();
        if (!ta) return -1;
        const pos = Number(ta.selectionStart);
        return Number.isFinite(pos) && pos >= 0 ? Math.floor(pos) : -1;
    }

    function cloneActionArgs(value) {
        if (!value || typeof value !== 'object') return null;
        try {
            return JSON.parse(JSON.stringify(value));
        } catch (_) {
            return null;
        }
    }

    function getFindDirectionModeFromUi() {
        const checked = document.querySelector('input[name="find-direction"]:checked');
        const mode = String(checked && checked.value ? checked.value : '').toLowerCase();
        return mode === 'up' || mode === 'all' ? mode : 'down';
    }

    function getFindReplaceSnapshot() {
        const findEl = document.getElementById('find-input');
        const replaceEl = document.getElementById('replace-input');
        return {
            findTerm: String(findEl && findEl.value ? findEl.value : ''),
            replaceTerm: String(replaceEl && replaceEl.value ? replaceEl.value : ''),
            direction: getFindDirectionModeFromUi()
        };
    }

    function applyFindReplaceSnapshot(argsInput, defaultDirection) {
        const args = argsInput && typeof argsInput === 'object' ? argsInput : {};
        const findEl = document.getElementById('find-input');
        const replaceEl = document.getElementById('replace-input');
        if (findEl) findEl.value = String(args.findTerm || '');
        if (replaceEl) replaceEl.value = String(args.replaceTerm || '');
        const direction = String(args.direction || defaultDirection || 'down');
        const radios = document.querySelectorAll('input[name="find-direction"]');
        if (radios && radios.length) {
            for (let i = 0; i < radios.length; i += 1) {
                radios[i].checked = String(radios[i].value) === direction;
            }
        }
    }

    function getActionScriptSnippet(actionId) {
        const map = {
            bold: 'insertAtCursor("bold");',
            italic: 'insertAtCursor("italic");',
            h1: 'applyHeading(1);',
            h2: 'applyHeading(2);',
            h3: 'applyHeading(3);',
            list_bullet: 'insertListAtSelection("bullet");',
            list_number: 'insertListAtSelection("number");',
            code: 'insertAtCursor("code");',
            mermaid: 'insertAtCursor("mermaid");',
            quote: 'insertAtCursor("quote");',
            table: 'handleTableInsertion();',
            pattern_to_table: 'convertSelectionPatternToTable();',
            link: 'openLinkModal("link");',
            image: 'openLinkModal("image");',
            image_panel: 'openImageInsertModal();',
            tidy: 'tidySeparatorSpacingInEditor();',
            find: 'openFindReplace();',
            md2html: 'convertSelectionMarkdownToHtml();',
            preview_popup: 'openPreviewPopupWindow();',
            footnote: 'insertFootnoteTemplate();',
            id_anchor: 'openLinkModal("id");',
            user_info: 'insertUserInfoAtCursor();',
            insert_br: 'insertLiteralAtCursor("<br>");'
        };
        return map[String(actionId || '')] || '';
    }

    function buildScriptForAction(actionId, argsInput) {
        const args = argsInput && typeof argsInput === 'object' ? argsInput : {};
        const json = JSON.stringify(args);
        if (actionId === 'script_macro') {
            const steps = Array.isArray(args.steps) ? args.steps : [];
            return buildScriptFromSteps(steps);
        }
        if (actionId === 'editor_edit') {
            return [
                '(function(){',
                '  var args = ' + json + ';',
                '  if (window.TRTMacro && typeof window.TRTMacro.__applyEditorEdit === "function") {',
                '    window.TRTMacro.__applyEditorEdit(args);',
                '  }',
                '})();'
            ].join('\n');
        }
        if (actionId === 'replace_current') {
            return [
                '(function(){',
                '  var args = ' + json + ';',
                '  var f = document.getElementById("find-input");',
                '  var r = document.getElementById("replace-input");',
                '  if (f) f.value = String(args.findTerm || "");',
                '  if (r) r.value = String(args.replaceTerm || "");',
                '  var radios = document.querySelectorAll(\'input[name="find-direction"]\');',
                '  for (var i = 0; i < radios.length; i += 1) { radios[i].checked = (String(radios[i].value) === String(args.direction || "down")); }',
                '  if (typeof replaceCurrent === "function") replaceCurrent();',
                '})();'
            ].join('\n');
        }
        if (actionId === 'replace_all') {
            return [
                '(function(){',
                '  var args = ' + json + ';',
                '  var f = document.getElementById("find-input");',
                '  var r = document.getElementById("replace-input");',
                '  if (f) f.value = String(args.findTerm || "");',
                '  if (r) r.value = String(args.replaceTerm || "");',
                '  var radios = document.querySelectorAll(\'input[name="find-direction"]\');',
                '  for (var i = 0; i < radios.length; i += 1) { radios[i].checked = (String(radios[i].value) === String(args.direction || "all")); }',
                '  if (typeof replaceAll === "function") replaceAll();',
                '})();'
            ].join('\n');
        }
        const snippet = getActionScriptSnippet(actionId);
        if (!snippet) return '';
        return ['(function(){', '  ' + snippet, '})();'].join('\n');
    }

    function sanitizeMacroStep(stepInput) {
        const step = stepInput && typeof stepInput === 'object' ? stepInput : {};
        return {
            actionId: String(step.actionId || ''),
            actionArgs: cloneActionArgs(step.actionArgs),
            targetMode: normalizeTargetMode(step.targetMode || 'relative'),
            cursorIndex: sanitizeCursorIndex(step.cursorIndex)
        };
    }

    function buildScriptFromSteps(stepsInput) {
        const steps = Array.isArray(stepsInput) ? stepsInput.map(sanitizeMacroStep).filter(function (s) { return !!getMacroActionById(s.actionId); }) : [];
        const lines = [];
        lines.push('(async function(){');
        lines.push('  var api = window.TRTMacro;');
        lines.push('  if (!api || typeof api.__runMacroAction !== "function") return;');
        for (let i = 0; i < steps.length; i += 1) {
            const step = steps[i];
            lines.push('  await api.__runMacroAction(' + JSON.stringify(step.actionId) + ', ' + JSON.stringify({
                actionArgs: step.actionArgs || null,
                targetMode: step.targetMode,
                cursorIndex: step.cursorIndex
            }) + ');');
        }
        lines.push('})();');
        return lines.join('\n');
    }

    function ensureMacroEntryShape(itemInput) {
        const item = itemInput || {};
        const actionId = String(item.actionId || '');
        const actionArgs = cloneActionArgs(item.actionArgs);
        return {
            entryId: String(item.entryId || ''),
            actionId: actionId,
            enabled: item.enabled !== false,
            hotkey: normalizeShortcutText(item.hotkey || ''),
            script: String(item.script || buildScriptForAction(actionId, actionArgs)),
            targetMode: normalizeTargetMode(item.targetMode || 'relative'),
            cursorIndex: sanitizeCursorIndex(item.cursorIndex),
            actionArgs: actionArgs
        };
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

    function loadMacroEntriesFromLocal() {
        try {
            const raw = localStorage.getItem(MACRO_ENTRIES_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw);
            const seq = Number(parsed && parsed.seq);
            const entries = Array.isArray(parsed && parsed.entries) ? parsed.entries : [];
            macroSeq = Number.isFinite(seq) && seq > 0 ? Math.floor(seq) : 1;
            macroEntries = entries
                .map(function (item) { return ensureMacroEntryShape(item); })
                .filter(function (item) { return !!item.entryId && !!getMacroActionById(item.actionId); });
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
                status.textContent = 'Shortcut input: ' + macroHotkeyCaptureEntryId + ' (Esc to cancel)';
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
        updateMacroRecordModeUi();
    }

    function updateMacroRecordModeUi() {
        const btn = document.getElementById('btn-macro-record-mode');
        if (!btn) return;
        const mode = normalizeTargetMode(macroRecordTargetMode);
        btn.textContent = mode === 'absolute' ? 'ABS' : 'REL';
        btn.title = mode === 'absolute'
            ? 'Record mode: absolute position (saved cursor index)'
            : 'Record mode: relative position (current cursor on run)';
        btn.classList.toggle('border-indigo-500', mode === 'absolute');
        btn.classList.toggle('text-indigo-700', mode === 'absolute');
        btn.classList.toggle('dark:text-indigo-300', mode === 'absolute');
        btn.classList.toggle('border-slate-300', mode !== 'absolute');
        btn.classList.toggle('text-slate-700', mode !== 'absolute');
        btn.classList.toggle('dark:text-slate-300', mode !== 'absolute');
    }

    function ensureMacroRecordModeUi() {
        const header = document.getElementById('macro-menu-header');
        if (!header) return;
        let btn = document.getElementById('btn-macro-record-mode');
        if (!btn) {
            btn = document.createElement('button');
            btn.type = 'button';
            btn.id = 'btn-macro-record-mode';
            btn.className = 'px-2 py-1 rounded border text-[11px] font-semibold hover:bg-slate-100 dark:hover:bg-slate-700';
            btn.addEventListener('click', function () {
                macroRecordTargetMode = normalizeTargetMode(
                    macroRecordTargetMode === 'absolute' ? 'relative' : 'absolute'
                );
                updateMacroRecordModeUi();
                if (typeof showToast === 'function') {
                    showToast('Record mode: ' + (macroRecordTargetMode === 'absolute' ? 'ABS' : 'REL'));
                }
            });
            const rightWrap = header.querySelector('div.ml-auto');
            if (rightWrap && rightWrap.parentNode === header) header.insertBefore(btn, rightWrap);
            else header.appendChild(btn);
        }
        updateMacroRecordModeUi();
    }

    function renderMacroList() {
        const body = document.getElementById('macro-list-body');
        if (!body) return;
        if (!macroEntries.length) {
            body.innerHTML = '<div class="px-2 py-2 text-[11px] text-slate-500 dark:text-slate-400">Recorded actions will appear here.</div>';
            return;
        }
        body.innerHTML = macroEntries.map(function (entry) {
            const meta = getMacroActionById(entry.actionId);
            const label = meta ? meta.label : entry.actionId;
            const hotkey = entry.hotkey || '-';
            const modeBadge = entry.targetMode === 'absolute' ? 'ABS' : 'REL';
            return ''
                + '<div class="grid grid-cols-[30px_80px_1fr_220px_56px] gap-1 px-2 py-1.5 border-t border-slate-200 dark:border-slate-700 text-[11px]">'
                + '  <div class="flex items-center justify-center"><input type="checkbox" ' + (entry.enabled ? 'checked' : '') + ' onchange="toggleMacroEntryEnabled(\'' + entry.entryId + '\', this.checked)" class="rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500"></div>'
                + '  <div class="truncate font-mono text-slate-700 dark:text-slate-300" title="' + escapeHtml(entry.entryId) + '">' + escapeHtml(entry.entryId) + '</div>'
                + '  <div class="truncate text-slate-700 dark:text-slate-200" title="' + escapeHtml(label) + '">' + escapeHtml(label) + '</div>'
                + '  <div class="flex items-center gap-1">'
                + '    <button type="button" onclick="registerMacroEntryShortcut(\'' + entry.entryId + '\')" class="px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700">SET</button>'
                + '    <button type="button" onclick="clearMacroEntryShortcut(\'' + entry.entryId + '\')" class="px-1 py-0.5 rounded border border-rose-300 dark:border-rose-700 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-900/20">x</button>'
                + '    <button type="button" onclick="window.TRTMacro && window.TRTMacro.openMacroScriptEditor && window.TRTMacro.openMacroScriptEditor(\'' + entry.entryId + '\')" class="px-1.5 py-0.5 rounded border border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/20">JS</button>'
                + '    <span class="px-1 py-0.5 rounded border border-slate-300 dark:border-slate-600 text-[10px] text-slate-500 dark:text-slate-400" title="target mode">' + escapeHtml(modeBadge) + '</span>'
                + '    <span class="truncate text-slate-500 dark:text-slate-400" title="' + escapeHtml(hotkey) + '">' + escapeHtml(hotkey) + '</span>'
                + '  </div>'
                + '  <div class="flex items-center justify-center"><button type="button" onclick="runMacroEntry(\'' + entry.entryId + '\')" class="px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700">Run</button></div>'
                + '</div>';
        }).join('');
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

    function closeMacroScriptEditor() {
        const modal = document.getElementById('macro-script-editor-modal');
        if (!modal) return;
        modal.classList.add('hidden');
        macroScriptEditorEntryId = '';
    }

    function ensureMacroScriptEditorUi() {
        if (document.getElementById('macro-script-editor-modal')) return;
        const wrap = document.createElement('div');
        wrap.id = 'macro-script-editor-modal';
        wrap.className = 'fixed inset-0 z-[2147483644] hidden';
        wrap.innerHTML = ''
            + '<div class="absolute inset-0 bg-black/45"></div>'
            + '<div class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(900px,96vw)] h-[min(82vh,760px)] bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg shadow-2xl flex flex-col overflow-hidden">'
            + '  <div class="px-3 py-2 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2">'
            + '    <div class="text-sm font-semibold text-slate-800 dark:text-slate-100">Macro Script Editor</div>'
            + '    <button type="button" id="btn-macro-script-close" class="px-2 py-1 rounded border border-slate-300 dark:border-slate-600 text-xs text-slate-700 dark:text-slate-200">Close</button>'
            + '  </div>'
            + '  <div class="px-3 py-2 border-b border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 flex items-center gap-2">'
            + '    <span id="macro-script-editor-meta" class="font-mono"></span>'
            + '    <label class="ml-2">mode'
            + '      <select id="macro-script-editor-target-mode" class="ml-1 px-1 py-0.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100">'
            + '        <option value="relative">relative</option>'
            + '        <option value="absolute">absolute</option>'
            + '      </select>'
            + '    </label>'
            + '    <label>cursor'
            + '      <input id="macro-script-editor-cursor" type="number" min="0" step="1" class="ml-1 w-24 px-1 py-0.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100">'
            + '    </label>'
            + '  </div>'
            + '  <div class="flex-1 p-3">'
            + '    <textarea id="macro-script-editor-text" spellcheck="false" class="w-full h-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 text-xs font-mono p-2"></textarea>'
            + '  </div>'
            + '  <div class="px-3 py-2 border-t border-slate-200 dark:border-slate-700 flex items-center justify-end gap-2">'
            + '    <button type="button" id="btn-macro-script-save" class="px-3 py-1 rounded border border-indigo-500 bg-indigo-600 text-white text-xs">Save</button>'
            + '    <button type="button" id="btn-macro-script-cancel" class="px-3 py-1 rounded border border-slate-300 dark:border-slate-600 text-xs text-slate-700 dark:text-slate-200">Cancel</button>'
            + '  </div>'
            + '</div>';
        document.body.appendChild(wrap);
        const closeBtn = document.getElementById('btn-macro-script-close');
        const cancelBtn = document.getElementById('btn-macro-script-cancel');
        const saveBtn = document.getElementById('btn-macro-script-save');
        const modeEl = document.getElementById('macro-script-editor-target-mode');
        if (closeBtn) closeBtn.addEventListener('click', closeMacroScriptEditor);
        if (cancelBtn) cancelBtn.addEventListener('click', closeMacroScriptEditor);
        if (saveBtn) saveBtn.addEventListener('click', saveMacroScriptEditor);
        if (wrap.firstElementChild) {
            wrap.firstElementChild.addEventListener('click', closeMacroScriptEditor);
        }
        if (modeEl) {
            modeEl.addEventListener('change', function () {
                const cursorEl = document.getElementById('macro-script-editor-cursor');
                if (!cursorEl) return;
                cursorEl.disabled = modeEl.value !== 'absolute';
            });
        }
    }

    function openMacroScriptEditor(entryId) {
        const target = findEntryById(entryId);
        if (!target) return;
        ensureMacroScriptEditorUi();
        const modal = document.getElementById('macro-script-editor-modal');
        const metaEl = document.getElementById('macro-script-editor-meta');
        const modeEl = document.getElementById('macro-script-editor-target-mode');
        const cursorEl = document.getElementById('macro-script-editor-cursor');
        const textEl = document.getElementById('macro-script-editor-text');
        const actionMeta = getMacroActionById(target.actionId);
        macroScriptEditorEntryId = target.entryId;
        if (metaEl) metaEl.textContent = target.entryId + ' / ' + (actionMeta ? actionMeta.label : target.actionId);
        if (modeEl) modeEl.value = normalizeTargetMode(target.targetMode);
        if (cursorEl) {
            cursorEl.value = target.cursorIndex >= 0 ? String(target.cursorIndex) : '';
            cursorEl.disabled = normalizeTargetMode(target.targetMode) !== 'absolute';
        }
        if (textEl) textEl.value = String(target.script || buildScriptForAction(target.actionId, target.actionArgs));
        if (modal) modal.classList.remove('hidden');
    }

    function saveMacroScriptEditor() {
        const targetId = String(macroScriptEditorEntryId || '');
        if (!targetId) return;
        const modeEl = document.getElementById('macro-script-editor-target-mode');
        const cursorEl = document.getElementById('macro-script-editor-cursor');
        const textEl = document.getElementById('macro-script-editor-text');
        const targetMode = normalizeTargetMode(modeEl && modeEl.value ? modeEl.value : 'relative');
        const cursorIndex = targetMode === 'absolute' ? sanitizeCursorIndex(cursorEl && cursorEl.value) : -1;
        const script = String(textEl && textEl.value ? textEl.value : '');
        updateMacroEntry(targetId, function (entry) {
            return Object.assign({}, entry, { script: script, targetMode: targetMode, cursorIndex: cursorIndex });
        });
        closeMacroScriptEditor();
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
        ensureMacroRecordModeUi();
        renderMacroList();
        updateMacroRecordStatusUi();
        bindMacroMenuInteractions();
        applyMacroMenuLayout(getMacroMenuLayoutFromLocal() || getDefaultMacroMenuLayout());
    }

    function ensureMacroMenuBind() {
        if (document.body && !document.body.__macroMenuBound) {
            document.body.__macroMenuBound = true;
        }
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
        applyMacroMenuLayout({
            left: Math.max(8, vp.width - layout.width - 12),
            top: layout.top,
            width: layout.width,
            height: layout.height
        });
    }

    function toggleMacroRecord(on) {
        const next = !!on;
        if (next === macroRecording) return;
        macroRecording = next;
        if (macroRecording) {
            macroRecordSession = { startedAt: Date.now(), steps: [] };
        } else {
            macroPendingEditorBeforeInput = null;
            if (macroRecordSession && Array.isArray(macroRecordSession.steps) && macroRecordSession.steps.length) {
                appendMacroEntry('script_macro', {
                    actionArgs: { steps: macroRecordSession.steps.slice() },
                    script: buildScriptFromSteps(macroRecordSession.steps),
                    targetMode: 'relative',
                    cursorIndex: -1
                });
            }
            macroRecordSession = null;
        }
        updateMacroRecordStatusUi();
        if (typeof showToast === 'function') {
            if (macroRecording) showToast('Macro record started');
            else showToast('Macro record ended');
        }
    }

    function recordMacroStep(actionId, optionsInput) {
        const meta = getMacroActionById(actionId);
        if (!meta) return;
        const options = optionsInput || {};
        const stepMode = normalizeTargetMode(options.targetMode || macroRecordTargetMode);
        const stepCursorIndex = sanitizeCursorIndex(
            options.cursorIndex == null
                ? (stepMode === 'absolute' ? getEditorCursorIndex() : -1)
                : options.cursorIndex
        );
        const step = sanitizeMacroStep({
            actionId: meta.id,
            actionArgs: cloneActionArgs(options.actionArgs),
            targetMode: stepMode,
            cursorIndex: stepCursorIndex
        });
        if (!macroRecording || macroReplayDepth > 0) {
            appendMacroEntry(meta.id, Object.assign({}, options, {
                targetMode: stepMode,
                cursorIndex: stepCursorIndex
            }));
            return;
        }
        if (!macroRecordSession || !Array.isArray(macroRecordSession.steps)) {
            macroRecordSession = { startedAt: Date.now(), steps: [] };
        }
        macroRecordSession.steps.push(step);
        const status = document.getElementById('macro-record-status');
        if (status && !macroHotkeyCaptureEntryId) {
            status.textContent = 'recording ' + (stepMode === 'absolute' ? 'ABS' : 'REL') + ' (' + String(macroRecordSession.steps.length) + ')';
        }
    }

    function appendMacroEntry(actionId, optionsInput) {
        const meta = getMacroActionById(actionId);
        if (!meta) return;
        const options = optionsInput || {};
        const actionArgs = cloneActionArgs(options.actionArgs);
        const targetMode = normalizeTargetMode(options.targetMode || 'relative');
        const cursorIndex = sanitizeCursorIndex(
            options.cursorIndex == null
                ? (targetMode === 'absolute' ? getEditorCursorIndex() : -1)
                : options.cursorIndex
        );
        const entry = ensureMacroEntryShape({
            entryId: 'M' + String(macroSeq).padStart(3, '0'),
            actionId: meta.id,
            enabled: true,
            hotkey: '',
            targetMode: targetMode,
            cursorIndex: cursorIndex,
            actionArgs: actionArgs,
            script: String(options.script || buildScriptForAction(meta.id, actionArgs))
        });
        macroSeq += 1;
        macroEntries.push(entry);
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
            return ensureMacroEntryShape(updater(entry) || entry);
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
        if (typeof showToast === 'function') showToast(target.entryId + ' waiting for shortcut (Esc to cancel)');
    }

    function clearMacroEntryShortcut(entryId) {
        const target = findEntryById(entryId);
        if (!target) return;
        const hadHotkey = !!normalizeShortcutText(target.hotkey || '');
        updateMacroEntry(entryId, function (entry) {
            return Object.assign({}, entry, { hotkey: '' });
        });
        if (macroHotkeyCaptureEntryId === String(entryId || '')) {
            macroHotkeyCaptureEntryId = '';
            updateMacroRecordStatusUi();
        }
        if (typeof showToast === 'function') {
            if (hadHotkey) showToast(target.entryId + ' shortcut cleared');
            else showToast(target.entryId + ' has no shortcut');
        }
    }
    function replaceEditorRange(start, end, insertText) {
        const ta = getEditorElement();
        if (!ta) return false;
        const value = String(ta.value || '');
        const s = Math.max(0, Math.min(Number(start) || 0, value.length));
        const e = Math.max(s, Math.min(Number(end) || 0, value.length));
        const insert = String(insertText || '');
        ta.value = value.slice(0, s) + insert + value.slice(e);
        const next = s + insert.length;
        ta.focus();
        ta.setSelectionRange(next, next);
        if (typeof ta.dispatchEvent === 'function' && typeof Event === 'function') {
            ta.dispatchEvent(new Event('input', { bubbles: true }));
        }
        return true;
    }

    function applyRecordedEditorEdit(argsInput) {
        const args = argsInput && typeof argsInput === 'object' ? argsInput : {};
        const ta = getEditorElement();
        if (!ta) return false;
        const inputType = String(args.inputType || '');
        const data = String(args.data == null ? '' : args.data);
        const start = Number(ta.selectionStart) || 0;
        const end = Number(ta.selectionEnd) || start;
        if (inputType === 'insertText' || inputType === 'insertCompositionText' || inputType === 'insertFromPaste') {
            return replaceEditorRange(start, end, data);
        }
        if (inputType === 'insertLineBreak' || inputType === 'insertParagraph') {
            return replaceEditorRange(start, end, '\n');
        }
        if (inputType === 'deleteContentBackward') {
            if (start !== end) return replaceEditorRange(start, end, '');
            return replaceEditorRange(Math.max(0, start - 1), start, '');
        }
        if (inputType === 'deleteContentForward') {
            if (start !== end) return replaceEditorRange(start, end, '');
            return replaceEditorRange(start, Math.min(String(ta.value || '').length, end + 1), '');
        }
        if (inputType === 'deleteByCut' || inputType === 'deleteByDrag') {
            return replaceEditorRange(start, end, '');
        }
        return replaceEditorRange(start, end, data);
    }

    function bindMacroRuntimeHooks() {
        if (macroRuntimeHooksBound) return;
        macroRuntimeHooksBound = true;
        if (typeof window.replaceCurrent === 'function') {
            const originalReplaceCurrent = window.replaceCurrent;
            window.replaceCurrent = function () {
                if (macroRecording && macroReplayDepth === 0) {
                    recordMacroStep('replace_current', {
                        actionArgs: getFindReplaceSnapshot(),
                        targetMode: 'relative',
                        cursorIndex: getEditorCursorIndex()
                    });
                }
                macroSuppressEditorInputRecord = true;
                try {
                    return originalReplaceCurrent.apply(this, arguments);
                } finally {
                    macroSuppressEditorInputRecord = false;
                }
            };
        }
        if (typeof window.replaceAll === 'function') {
            const originalReplaceAll = window.replaceAll;
            window.replaceAll = function () {
                if (macroRecording && macroReplayDepth === 0) {
                    const args = getFindReplaceSnapshot();
                    args.direction = 'all';
                    recordMacroStep('replace_all', {
                        actionArgs: args,
                        targetMode: 'relative',
                        cursorIndex: getEditorCursorIndex()
                    });
                }
                macroSuppressEditorInputRecord = true;
                try {
                    return originalReplaceAll.apply(this, arguments);
                } finally {
                    macroSuppressEditorInputRecord = false;
                }
            };
        }
    }

    function bindMacroRecorderHooks() {
        const editTools = document.getElementById('edit-tools');
        if (editTools && !editTools.__macroRecordBound) {
            editTools.__macroRecordBound = true;
            editTools.addEventListener('click', function (e) {
                if (!macroRecording || macroReplayDepth > 0) return;
                const btn = e.target && e.target.closest ? e.target.closest('button[onclick]') : null;
                if (!btn) return;
                const actionId = getMacroActionIdFromOnclickAttr(btn.getAttribute('onclick'));
                if (!actionId) return;
                recordMacroStep(actionId);
            }, true);
        }
        const ta = getEditorElement();
        if (ta && !ta.__macroRecordBound) {
            ta.__macroRecordBound = true;
            ta.addEventListener('beforeinput', function (e) {
                if (!macroRecording || macroReplayDepth > 0 || macroSuppressEditorInputRecord) return;
                macroPendingEditorBeforeInput = {
                    inputType: String(e && e.inputType ? e.inputType : ''),
                    data: e && Object.prototype.hasOwnProperty.call(e, 'data') ? e.data : '',
                    selectionStart: Number(ta.selectionStart) || 0,
                    selectionEnd: Number(ta.selectionEnd) || 0
                };
            }, true);
            ta.addEventListener('input', function () {
                if (!macroRecording || macroReplayDepth > 0 || macroSuppressEditorInputRecord) return;
                if (!macroPendingEditorBeforeInput) return;
                const type = String(macroPendingEditorBeforeInput.inputType || '');
                if (!type) {
                    macroPendingEditorBeforeInput = null;
                    return;
                }
                const args = {
                    inputType: type,
                    data: macroPendingEditorBeforeInput.data == null ? '' : String(macroPendingEditorBeforeInput.data)
                };
                recordMacroStep('editor_edit', {
                    actionArgs: args,
                    targetMode: 'relative',
                    cursorIndex: -1
                });
                macroPendingEditorBeforeInput = null;
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
                        if (typeof showToast === 'function') showToast('Shortcut registration canceled');
                        return;
                    }
                    const combo = shortcutFromEvent(e, { requireModifier: true });
                    if (!combo) {
                        e.preventDefault();
                        if (typeof showToast === 'function') showToast('Use a Ctrl/Alt/Meta shortcut');
                        return;
                    }
                    e.preventDefault();
                    const duplicate = findEntryByHotkey(combo, macroHotkeyCaptureEntryId);
                    if (duplicate) clearMacroEntryShortcut(duplicate.entryId);
                    updateMacroEntry(macroHotkeyCaptureEntryId, function (entry) {
                        return Object.assign({}, entry, { hotkey: combo });
                    });
                    if (typeof showToast === 'function') showToast(macroHotkeyCaptureEntryId + ' shortcut: ' + combo);
                    macroHotkeyCaptureEntryId = '';
                    updateMacroRecordStatusUi();
                    return;
                }

                if (macroRecording && macroReplayDepth === 0) {
                    const actionId = getMacroActionIdFromHotkey(e);
                    if (!actionId) return;
                    recordMacroStep(actionId);
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
        updateMacroEntry(entryId, function (entry) {
            return Object.assign({}, entry, { enabled: !!enabled });
        });
    }

    function applyEntryTargetPosition(entry) {
        if (!entry || normalizeTargetMode(entry.targetMode) !== 'absolute') return;
        const ta = getEditorElement();
        if (!ta) return;
        const raw = sanitizeCursorIndex(entry.cursorIndex);
        if (raw < 0) return;
        const pos = Math.max(0, Math.min(raw, String(ta.value || '').length));
        ta.focus();
        ta.setSelectionRange(pos, pos);
    }

    async function runMacroActionInternal(actionId, optionsInput) {
        const options = optionsInput && typeof optionsInput === 'object' ? optionsInput : {};
        const targetMode = normalizeTargetMode(options.targetMode || 'relative');
        const cursorIndex = sanitizeCursorIndex(options.cursorIndex);
        if (targetMode === 'absolute' && cursorIndex >= 0) {
            applyEntryTargetPosition({ targetMode: 'absolute', cursorIndex: cursorIndex });
        }
        return await executeMacroAction(String(actionId || ''), {
            record: false,
            actionArgs: cloneActionArgs(options.actionArgs)
        });
    }

    async function executeMacroAction(actionId, opts) {
        const options = opts || {};
        const meta = getMacroActionById(actionId);
        if (!meta) return false;
        if (macroRecording && options.record !== false && macroReplayDepth === 0) {
            recordMacroStep(meta.id, { actionArgs: cloneActionArgs(options.actionArgs) });
        }
        try {
            if (meta.id === 'editor_edit') {
                return applyRecordedEditorEdit(options.actionArgs);
            }
            if (meta.id === 'replace_current') {
                applyFindReplaceSnapshot(options.actionArgs, 'down');
                if (typeof replaceCurrent === 'function') replaceCurrent();
                return true;
            }
            if (meta.id === 'replace_all') {
                applyFindReplaceSnapshot(options.actionArgs, 'all');
                if (typeof replaceAll === 'function') replaceAll();
                return true;
            }
            const out = typeof meta.run === 'function' ? meta.run() : null;
            if (out && typeof out.then === 'function') await out;
            return true;
        } catch (_) {
            if (typeof showToast === 'function') showToast('Macro ?????덊떀 ?????곌숯: ' + meta.label);
            return false;
        }
    }

    async function executeMacroEntry(entry) {
        if (!entry) return false;
        applyEntryTargetPosition(entry);
        const script = String(entry.script || '').trim();
        macroReplayDepth += 1;
        try {
            if (script) {
                const fn = new Function(script);
                const out = fn.call(window);
                if (out && typeof out.then === 'function') await out;
                return true;
            }
            return await executeMacroAction(entry.actionId, { record: false, actionArgs: entry.actionArgs });
        } catch (err) {
            if (typeof showToast === 'function') showToast('Macro script error: ' + entry.entryId);
            return false;
        } finally {
            macroReplayDepth = Math.max(0, macroReplayDepth - 1);
        }
    }

    function runMacroEntry(entryId) {
        const target = findEntryById(entryId);
        if (!target) return;
        executeMacroEntry(target);
    }

    async function runCheckedMacroActions() {
        const runBtn = document.getElementById('btn-macro-run');
        const targets = macroEntries.filter(function (entry) { return entry.enabled; });
        if (!targets.length) {
            if (typeof showToast === 'function') showToast('?꿔꺂?????용Ъ???꿔꺂????關臾쇘춯癒?돵??? ????ㅿ폍??????딅젩.');
            closeMacroMenuPanel();
            return;
        }
        if (runBtn) {
            runBtn.disabled = true;
            runBtn.classList.add('opacity-60', 'cursor-not-allowed');
        }
        for (let i = 0; i < targets.length; i += 1) {
            await executeMacroEntry(targets[i]);
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
        ensureMacroRecordModeUi();
        ensureMacroScriptEditorUi();
        bindMacroRuntimeHooks();
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
        dockMacroMenuRight: dockMacroMenuRight,
        openMacroScriptEditor: openMacroScriptEditor,
        closeMacroScriptEditor: closeMacroScriptEditor,
        saveMacroScriptEditor: saveMacroScriptEditor,
        __applyEditorEdit: applyRecordedEditorEdit,
        __runMacroAction: runMacroActionInternal
    };
})();
