(function () {
    const HOTKEYS = [
        { action: 'Edit mode', keys: ['Alt', '1'] },
        { action: 'View mode', keys: ['Alt', '2'] },
        { action: 'Theme toggle', keys: ['Alt', '4'] },
        { action: 'Pattern to table', keys: ['Alt', '7'] },
        { action: 'Text style modal', keys: ['Alt', 'L'] },
        { action: 'Heading H1', keys: ['Ctrl', 'Alt', '1'] },
        { action: 'Heading H2', keys: ['Ctrl', 'Alt', '2'] },
        { action: 'Heading H3', keys: ['Ctrl', 'Alt', '3'] },
        { action: 'Find/Replace', keys: ['Ctrl', 'H'] },
        { action: 'Bold', keys: ['Ctrl', 'B'] },
        { action: 'Italic', keys: ['Ctrl', 'I'] },
        { action: 'Tidy', keys: ['Ctrl', 'Alt', 'T'] },
        { action: 'MD to HTML', keys: ['Shift', 'Alt', 'H'] },
        { action: 'Insert <br>', keys: ['Ctrl', 'Shift', 'Enter'] },
        { action: 'Insert &nbsp;', keys: ['Ctrl', 'Shift', 'Space'] },
        { action: 'Undo', keys: ['Ctrl', 'Z'] },
        { action: 'Redo', keys: ['Ctrl', 'Shift', 'Z'], alt: ['Ctrl', 'Y'] },
        { action: 'Move line up', keys: ['Alt', 'ArrowUp'] },
        { action: 'Move line down', keys: ['Alt', 'ArrowDown'] },
        { action: 'Copy line down', keys: ['Shift', 'Alt', 'ArrowDown'] },
        { action: 'Insert user info', keys: ['Shift', 'Alt', 'A'] }
    ];

    function isDigitKey(e, digit) {
        return e.code === 'Digit' + digit || e.key === String(digit);
    }

    function attachHotkeys(deps) {
        if (!deps || typeof deps !== 'object') return function () {};

        function onKeydown(e) {
            const isAltGraph = typeof e.getModifierState === 'function' && e.getModifierState('AltGraph');
            const isEditMode = !!(deps.getIsEditMode && deps.getIsEditMode());
            const editorTextarea = deps.getEditorTextarea ? deps.getEditorTextarea() : null;
            const keyLower = String(e.key || '').toLowerCase();

            if (e.ctrlKey && e.altKey && isDigitKey(e, 1)) {
                e.preventDefault();
                if (typeof deps.applyHeading === 'function') deps.applyHeading(1);
                return;
            }
            if (e.ctrlKey && e.altKey && isDigitKey(e, 2)) {
                e.preventDefault();
                if (typeof deps.applyHeading === 'function') deps.applyHeading(2);
                return;
            }
            if (e.ctrlKey && e.altKey && isDigitKey(e, 3)) {
                e.preventDefault();
                if (typeof deps.applyHeading === 'function') deps.applyHeading(3);
                return;
            }

            if (e.altKey && !e.ctrlKey && !isAltGraph && isDigitKey(e, 1)) {
                e.preventDefault();
                if (!isEditMode && typeof deps.toggleMode === 'function') deps.toggleMode('edit');
                return;
            }
            if (e.altKey && !e.ctrlKey && !isAltGraph && isDigitKey(e, 2)) {
                e.preventDefault();
                if (isEditMode && typeof deps.toggleMode === 'function') deps.toggleMode('view');
                return;
            }
            if (e.altKey && !e.ctrlKey && !isAltGraph && isDigitKey(e, 4)) {
                e.preventDefault();
                if (typeof deps.toggleTheme === 'function') deps.toggleTheme();
                if (typeof deps.showThemeToggleToast === 'function') deps.showThemeToggleToast();
                return;
            }
            if (e.altKey && !e.ctrlKey && !e.shiftKey && !isAltGraph && (e.code === 'KeyL' || e.key === 'l' || e.key === 'L')) {
                e.preventDefault();
                if (typeof deps.openTextStyleModal === 'function') deps.openTextStyleModal();
                return;
            }

            if (e.altKey && !e.ctrlKey && !e.shiftKey && isDigitKey(e, 7)) {
                e.preventDefault();
                if (typeof deps.convertSelectionPatternToTable === 'function') deps.convertSelectionPatternToTable();
                return;
            }
            if (e.shiftKey && e.altKey && !e.ctrlKey && (e.key === 'h' || e.key === 'H')) {
                e.preventDefault();
                if (typeof deps.convertSelectionMarkdownToHtml === 'function') deps.convertSelectionMarkdownToHtml();
                return;
            }
            if (e.ctrlKey && e.altKey && !e.shiftKey && (e.key === 't' || e.key === 'T')) {
                e.preventDefault();
                if (typeof deps.tidySeparatorSpacingInEditor === 'function') deps.tidySeparatorSpacingInEditor();
                return;
            }
            if (e.ctrlKey && e.shiftKey && !e.altKey && (e.code === 'Enter' || e.key === 'Enter')) {
                e.preventDefault();
                if (typeof deps.insertLiteralAtCursor === 'function') deps.insertLiteralAtCursor('<br>');
                return;
            }
            if (e.ctrlKey && e.shiftKey && !e.altKey && (e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar')) {
                e.preventDefault();
                if (typeof deps.insertLiteralAtCursor === 'function') deps.insertLiteralAtCursor('&nbsp;');
                return;
            }

            if (e.shiftKey && e.altKey && !e.ctrlKey && (e.key === 'a' || e.key === 'A')) {
                e.preventDefault();
                if (typeof deps.insertUserInfoAtCursor === 'function') deps.insertUserInfoAtCursor();
                return;
            }
            if (e.ctrlKey && e.key === '7') {
                e.preventDefault();
                if (typeof deps.adjustPageScale === 'function') deps.adjustPageScale(-0.1);
                return;
            }
            if (e.ctrlKey && e.key === '8') {
                e.preventDefault();
                if (typeof deps.adjustPageScale === 'function') deps.adjustPageScale(0.1);
                return;
            }
            if (e.ctrlKey && e.key === '9') {
                e.preventDefault();
                if (typeof deps.adjustFontSize === 'function') deps.adjustFontSize(-1);
                return;
            }
            if (e.ctrlKey && e.key === '0') {
                e.preventDefault();
                if (typeof deps.adjustFontSize === 'function') deps.adjustFontSize(1);
                return;
            }
            if (e.ctrlKey && keyLower === 'h') {
                e.preventDefault();
                if (typeof deps.toggleFindReplace === 'function') deps.toggleFindReplace();
                return;
            }
            if (e.ctrlKey && !e.altKey && keyLower === 'b') {
                e.preventDefault();
                if (isEditMode && editorTextarea && typeof deps.insertAtCursor === 'function') deps.insertAtCursor('bold');
                return;
            }
            if (e.ctrlKey && !e.altKey && keyLower === 'i') {
                e.preventDefault();
                if (isEditMode && editorTextarea && typeof deps.insertAtCursor === 'function') deps.insertAtCursor('italic');
                return;
            }
            if (e.ctrlKey && (keyLower === 'z' || keyLower === 'y')) {
                if (typeof deps.afterUndoRedo === 'function') deps.afterUndoRedo();
                return;
            }
            if (isEditMode && e.altKey) {
                if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    if (typeof deps.moveLineUp === 'function') deps.moveLineUp();
                    return;
                }
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    if (e.shiftKey) {
                        if (typeof deps.copyLineDown === 'function') deps.copyLineDown();
                    } else if (typeof deps.moveLineDown === 'function') {
                        deps.moveLineDown();
                    }
                    return;
                }
            }
        }

        window.addEventListener('keydown', onKeydown);
        return function cleanup() {
            window.removeEventListener('keydown', onKeydown);
        };
    }

    function renderHotkeyTable(container) {
        if (!container) return;
        const rows = HOTKEYS.map(function (item) {
            const primary = item.keys.join(' + ');
            const alt = item.alt ? ' (or ' + item.alt.join(' + ') + ')' : '';
            return '<tr><td>' + item.action + '</td><td><code>' + primary + '</code>' + alt + '</td></tr>';
        }).join('');
        container.innerHTML = rows;
    }

    window.MDViewerHotkey = {
        hotkeys: HOTKEYS,
        attachHotkeys: attachHotkeys,
        renderHotkeyTable: renderHotkeyTable
    };
})();
