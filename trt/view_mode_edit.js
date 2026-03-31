(function (global) {
    'use strict';

    function getViewerSelectedText(options) {
        const opts = options || {};
        const viewer = opts.viewer;
        if (!viewer || opts.isEditMode || !opts.enabled) return '';
        const sel = global.getSelection ? global.getSelection() : null;
        if (!sel || sel.rangeCount < 1 || sel.isCollapsed) return '';
        const range = sel.getRangeAt(0);
        const container = range.commonAncestorContainer;
        if (!container || !(viewer.contains(container) || container === viewer)) return '';
        return String(sel.toString() || '').trim();
    }

    function findNearestOccurrence(text, needle, hintPos) {
        const source = String(text || '');
        const target = String(needle || '');
        if (!source || !target) return -1;
        let idx = source.indexOf(target);
        if (idx < 0) return -1;
        let best = idx;
        let bestDist = Math.abs(idx - (Number(hintPos) || 0));
        while (idx >= 0) {
            const dist = Math.abs(idx - (Number(hintPos) || 0));
            if (dist < bestDist) {
                bestDist = dist;
                best = idx;
            }
            idx = source.indexOf(target, idx + 1);
        }
        return best;
    }

    function parseToolbarAction(buttonEl) {
        if (!buttonEl || typeof buttonEl.getAttribute !== 'function') return null;
        const src = String(buttonEl.getAttribute('onclick') || '').trim();
        if (!src) return null;
        let m = null;
        m = src.match(/^insertAtCursor\('([^']+)'\)$/);
        if (m) return { type: 'insertAtCursor', args: [m[1]], mutate: true };
        m = src.match(/^applyHeading\((\d+)\)$/);
        if (m) return { type: 'applyHeading', args: [Number(m[1])], mutate: true };
        m = src.match(/^insertListAtSelection\('([^']+)'\)$/);
        if (m) return { type: 'insertListAtSelection', args: [m[1]], mutate: true };
        if (src === 'handleTableInsertion()') return { type: 'handleTableInsertion', args: [], mutate: true };
        if (src === 'convertSelectionPatternToTable()') return { type: 'convertSelectionPatternToTable', args: [], mutate: true };
        if (src === 'tidySeparatorSpacingInEditor()') return { type: 'tidySeparatorSpacingInEditor', args: [], mutate: true };
        if (src === 'insertFootnoteTemplate()') return { type: 'insertFootnoteTemplate', args: [], mutate: true };
        if (src === 'insertUserInfoAtCursor()') return { type: 'insertUserInfoAtCursor', args: [], mutate: true };
        return { type: 'passthrough', args: [], mutate: false };
    }

    function executeParsedAction(action) {
        if (!action || !action.type) return false;
        switch (action.type) {
            case 'insertAtCursor':
                if (typeof global.insertAtCursor === 'function') { global.insertAtCursor(action.args[0]); return true; }
                return false;
            case 'applyHeading':
                if (typeof global.applyHeading === 'function') { global.applyHeading(action.args[0]); return true; }
                return false;
            case 'insertListAtSelection':
                if (typeof global.insertListAtSelection === 'function') { global.insertListAtSelection(action.args[0]); return true; }
                return false;
            case 'handleTableInsertion':
                if (typeof global.handleTableInsertion === 'function') { global.handleTableInsertion(); return true; }
                return false;
            case 'convertSelectionPatternToTable':
                if (typeof global.convertSelectionPatternToTable === 'function') { global.convertSelectionPatternToTable(); return true; }
                return false;
            case 'tidySeparatorSpacingInEditor':
                if (typeof global.tidySeparatorSpacingInEditor === 'function') { global.tidySeparatorSpacingInEditor(); return true; }
                return false;
            case 'insertFootnoteTemplate':
                if (typeof global.insertFootnoteTemplate === 'function') { global.insertFootnoteTemplate(); return true; }
                return false;
            case 'insertUserInfoAtCursor':
                if (typeof global.insertUserInfoAtCursor === 'function') { global.insertUserInfoAtCursor(); return true; }
                return false;
            default:
                return false;
        }
    }

    function replaceTextRange(source, start, end, replacement) {
        const text = String(source || '');
        const s = Math.max(0, Math.min(Number(start) || 0, text.length));
        const e = Math.max(s, Math.min(Number(end) || 0, text.length));
        return text.slice(0, s) + String(replacement || '') + text.slice(e);
    }

    function applyToolbarAction(options) {
        const opts = options || {};
        const action = opts.action || {};
        if (!action.type) return { changed: false };

        const text = String(opts.sourceText || '');
        if (!text) return { changed: false };

        const hintPos = Math.max(0, Math.min(Number(opts.hintPos) || 0, text.length));
        const selected = String(opts.selectedText || '');
        const found = selected ? findNearestOccurrence(text, selected, hintPos) : -1;
        const hasSelection = found >= 0 && selected.length > 0;
        let next = text;
        let caretPos = hintPos;
        let changed = false;

        if (action.type === 'insertAtCursor') {
            const kind = String(action.args && action.args[0] || '');
            if (kind === 'bold' || kind === 'italic') {
                const marker = kind === 'bold' ? '**' : '*';
                const token = kind === 'bold' ? 'bold text' : 'italic text';
                const start = hasSelection ? found : hintPos;
                const end = hasSelection ? (found + selected.length) : hintPos;
                const body = hasSelection ? selected : token;
                const replacement = marker + body + marker;
                next = replaceTextRange(text, start, end, replacement);
                caretPos = hasSelection ? (start + replacement.length) : (start + marker.length + body.length);
                changed = true;
            } else if (kind === 'br') {
                const br = opts.enterButtonInsertBr ? '<br>' : '  \n';
                next = replaceTextRange(text, hintPos, hintPos, br);
                caretPos = hintPos + br.length;
                changed = true;
            } else if (kind === 'quote') {
                if (hasSelection) {
                    const quoted = selected.split('\n').map(function (line) { return '> ' + line; }).join('\n');
                    next = replaceTextRange(text, found, found + selected.length, quoted);
                    caretPos = found + quoted.length;
                } else {
                    const q = '\n> quote';
                    next = replaceTextRange(text, hintPos, hintPos, q);
                    caretPos = hintPos + q.length;
                }
                changed = true;
            }
        } else if (action.type === 'applyHeading') {
            const level = Math.max(1, Math.min(6, Number(action.args && action.args[0]) || 1));
            const pos = hasSelection ? found : hintPos;
            const lineStart = text.lastIndexOf('\n', Math.max(0, pos - 1)) + 1;
            let lineEnd = text.indexOf('\n', pos);
            if (lineEnd === -1) lineEnd = text.length;
            const line = text.slice(lineStart, lineEnd).replace(/^#+\s*/, '');
            const replacement = '#'.repeat(level) + ' ' + line;
            next = replaceTextRange(text, lineStart, lineEnd, replacement);
            caretPos = lineStart + replacement.length;
            changed = true;
        } else if (action.type === 'insertListAtSelection') {
            const kind = String(action.args && action.args[0] || 'bullet');
            const start = hasSelection ? found : (text.lastIndexOf('\n', Math.max(0, hintPos - 1)) + 1);
            const end = hasSelection
                ? (found + selected.length)
                : (function () { const le = text.indexOf('\n', hintPos); return le === -1 ? text.length : le; })();
            const block = text.slice(start, end);
            const lines = block.split('\n');
            const repl = lines.map(function (line, idx) {
                const plain = line.replace(/^\s*([-*+]|\d+\.)\s+/, '').trim();
                if (kind === 'number') return (idx + 1) + '. ' + plain;
                return '- ' + plain;
            }).join('\n');
            next = replaceTextRange(text, start, end, repl);
            caretPos = start + repl.length;
            changed = true;
        } else if (action.type === 'tidySeparatorSpacingInEditor') {
            if (typeof opts.tidySeparatorSpacing === 'function') {
                const result = opts.tidySeparatorSpacing(text);
                if (result && result.changed) {
                    next = String(result.value || text);
                    caretPos = hintPos;
                    changed = true;
                }
            }
        }

        return {
            changed: !!(changed && next !== text),
            text: next,
            caretPos: caretPos
        };
    }

    global.ViewModeEditTRT = {
        getViewerSelectedText: getViewerSelectedText,
        findNearestOccurrence: findNearestOccurrence,
        parseToolbarAction: parseToolbarAction,
        executeParsedAction: executeParsedAction,
        applyToolbarAction: applyToolbarAction
    };
})(window);
