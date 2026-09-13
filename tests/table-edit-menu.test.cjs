const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');

function loadTableEditor(markdown, cursor) {
    const start = app.indexOf('function splitMarkdownTableRow');
    const end = app.indexOf('function insertInlineMathTemplate', start);
    assert.ok(start >= 0 && end > start, 'table editing implementation is missing');
    const context = {
        isEditMode: true,
        currentMarkdown: markdown,
        activeSidebarTab: '',
        editorTextarea: {
            value: markdown,
            selectionStart: cursor,
            selectionEnd: cursor,
            focus() {},
            setSelectionRange(startAt, endAt) {
                this.selectionStart = startAt;
                this.selectionEnd = endAt;
            }
        },
        beginEditorHistoryTransaction() { return markdown; },
        commitEditorHistoryTransaction() {},
        renderMarkdown() {},
        renderTOC() {},
        performAutoSave() {},
        showToast() {}
    };
    vm.runInNewContext(app.slice(start, end), context);
    return context;
}

test('table picker exposes the restored editing actions below the size grid', () => {
    const gridAt = index.indexOf('id="table-insert-grid"');
    const editAt = index.indexOf('editMarkdownTable(\'add-row\')');
    const captionAt = index.indexOf('표 캡션 넣기', gridAt);
    assert.ok(gridAt >= 0 && editAt > gridAt && captionAt > editAt);
    for (const action of ['add-row', 'add-column', 'delete-row', 'delete-column']) {
        assert.match(index, new RegExp(`editMarkdownTable\\('${action}'\\)`));
    }
});

test('row editing adds and removes a body row at the cursor', () => {
    const markdown = '| A | B |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |';
    const editor = loadTableEditor(markdown, markdown.indexOf('1'));
    assert.equal(editor.editMarkdownTable('add-row'), true);
    assert.equal(editor.editorTextarea.value, '| A | B |\n| --- | --- |\n| 1 | 2 |\n|  |  |\n| 3 | 4 |');

    editor.editorTextarea.selectionStart = editor.editorTextarea.value.indexOf('3');
    assert.equal(editor.editMarkdownTable('delete-row'), true);
    assert.equal(editor.editorTextarea.value, '| A | B |\n| --- | --- |\n| 1 | 2 |\n|  |  |');
});

test('column editing follows the cell containing the cursor', () => {
    const markdown = '| A | B |\n| --- | --- |\n| 1 | 2 |';
    const editor = loadTableEditor(markdown, markdown.indexOf('B'));
    assert.equal(editor.editMarkdownTable('add-column'), true);
    assert.equal(editor.editorTextarea.value, '| A | B |  |\n| --- | --- | --- |\n| 1 | 2 |  |');

    editor.editorTextarea.selectionStart = editor.editorTextarea.value.indexOf('B');
    assert.equal(editor.editMarkdownTable('delete-column'), true);
    assert.equal(editor.editorTextarea.value, '| A |  |\n| --- | --- |\n| 1 |  |');
});
