const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('hotkey.js: Insert <br> action has Ctrl+Shift+Enter', () => {
    const hotkeyPath = path.join(__dirname, '../hotkey/hotkey.js');
    const code = fs.readFileSync(hotkeyPath, 'utf8');

    const sandbox = { window: {} };
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox);

    const hotkeys = sandbox.window.MDViewerHotkey.hotkeys;
    const brHotkey = hotkeys.find(item => item.action === 'Insert <br>');
    assert.ok(brHotkey, 'Insert <br> must exist');
    assert.deepEqual(brHotkey.keys, ['Ctrl', 'Shift', 'Enter']);
    assert.equal(brHotkey.alt, undefined);
});

test('hotkey.js: attachHotkeys does NOT trigger <br> on Shift+Enter alone, but triggers on Ctrl+Shift+Enter', () => {
    const hotkeyPath = path.join(__dirname, '../hotkey/hotkey.js');
    const code = fs.readFileSync(hotkeyPath, 'utf8');

    let registeredListener = null;
    const sandbox = {
        window: {
            addEventListener: (event, handler) => {
                if (event === 'keydown') registeredListener = handler;
            },
            removeEventListener: () => {}
        }
    };
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox);

    let insertedLiteral = null;
    let prevented = false;
    const deps = {
        getIsEditMode: () => true,
        getEditorTextarea: () => null,
        insertLiteralAtCursor: (val) => { insertedLiteral = val; }
    };

    const cleanup = sandbox.window.MDViewerHotkey.attachHotkeys(deps);
    assert.ok(registeredListener);

    // 1. Shift + Enter alone -> should NOT trigger <br>
    const shiftEnterEvent = {
        key: 'Enter',
        code: 'Enter',
        shiftKey: true,
        altKey: false,
        ctrlKey: false,
        metaKey: false,
        target: { tagName: 'DIV' },
        preventDefault: () => { prevented = true; }
    };

    registeredListener(shiftEnterEvent);
    assert.equal(prevented, false);
    assert.equal(insertedLiteral, null);

    // 2. Ctrl + Shift + Enter -> SHOULD trigger <br>
    prevented = false;
    insertedLiteral = null;
    const ctrlShiftEnterEvent = {
        key: 'Enter',
        code: 'Enter',
        shiftKey: true,
        altKey: false,
        ctrlKey: true,
        metaKey: false,
        target: { tagName: 'DIV' },
        preventDefault: () => { prevented = true; }
    };

    registeredListener(ctrlShiftEnterEvent);
    assert.equal(prevented, true);
    assert.equal(insertedLiteral, '<br>');

    if (typeof cleanup === 'function') cleanup();
});

test('macro.js: insert_br shortcut is Ctrl+Shift+Enter', () => {
    const macroPath = path.join(__dirname, '../trt/macro.js');
    const content = fs.readFileSync(macroPath, 'utf8');
    assert.match(content, /id:\s*['"]insert_br['"].*?shortcut:\s*['"]Ctrl\+Shift\+Enter['"]/s);
});

test('app.js: does not intercept Shift+Enter for <br>, uses Ctrl+Shift+Enter instead', () => {
    const appPath = path.join(__dirname, '../js/app.js');
    const content = fs.readFileSync(appPath, 'utf8');

    assert.ok(!content.includes("event.shiftKey && !event.altKey && (event.key === 'Enter' || event.code === 'Enter')"));
    assert.match(content, /e\.ctrlKey && e\.shiftKey && !e\.altKey && \(e\.code === 'Enter' \|\| e\.key === 'Enter'\)[\s\S]*?insertLiteralAtCursor\('<br>'\)/);
});

test('editor keydown: Shift+Enter does not insert <br>, Ctrl+Shift+Enter inserts <br>', () => {
    let inserted = null;
    let prevented = false;

    function insertLiteralAtCursor(literal) {
        inserted = literal;
    }

    function editorKeydownHandler(event) {
        if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && (event.key === 'Enter' || event.code === 'Enter')) {
            event.preventDefault();
            insertLiteralAtCursor('\n\n<div class="page-break"></div>\n\n');
            return;
        }
        if (event.ctrlKey && event.shiftKey && !event.altKey && (event.key === 'Enter' || event.code === 'Enter')) {
            event.preventDefault();
            insertLiteralAtCursor('<br>');
            return;
        }
    }

    // 1. Shift + Enter alone -> no <br>, no preventDefault
    const event1 = {
        key: 'Enter',
        code: 'Enter',
        shiftKey: true,
        altKey: false,
        ctrlKey: false,
        metaKey: false,
        preventDefault: () => { prevented = true; }
    };
    editorKeydownHandler(event1);
    assert.equal(prevented, false);
    assert.equal(inserted, null);

    // 2. Ctrl + Shift + Enter -> inserts <br>
    inserted = null;
    prevented = false;
    const event2 = {
        key: 'Enter',
        code: 'Enter',
        shiftKey: true,
        altKey: false,
        ctrlKey: true,
        metaKey: false,
        preventDefault: () => { prevented = true; }
    };
    editorKeydownHandler(event2);
    assert.equal(prevented, true);
    assert.equal(inserted, '<br>');

    // 3. Normal Enter -> no <br>
    inserted = null;
    prevented = false;
    const event3 = {
        key: 'Enter',
        code: 'Enter',
        shiftKey: false,
        altKey: false,
        ctrlKey: false,
        metaKey: false,
        preventDefault: () => { prevented = true; }
    };
    editorKeydownHandler(event3);
    assert.equal(prevented, false);
    assert.equal(inserted, null);
});
