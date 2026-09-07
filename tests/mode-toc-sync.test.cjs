const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

// Uneven rendered slide heights and wrapped source lines deliberately differ.
const markdown = Array.from({ length: 10 }, (_, i) => `# SLIDE${i + 1}\n${'body '.repeat(i * 15 + 1)}\n`).join('\n');
const sourceTop = text => text.split('\n').reduce((n, line) => n + Math.max(1, Math.ceil(line.length / 40)) * 24, -24);
let viewScroll = 0;
let editMode = false;
let headingMargin = 0;
let scrollPadding = 0;
const headers = Array.from({ length: 10 }, (_, i) => ({
    tagName: 'H1', textContent: `SLIDE${i + 1}`,
    getBoundingClientRect: () => ({ top: i * i * 130 - viewScroll }),
    scrollIntoView: () => { viewScroll = i * i * 130 - headingMargin - scrollPadding; }
}));
const editor = {
    value: markdown, scrollTop: 0, clientWidth: 400,
    focus() {}, setSelectionRange(start) { this.selectionStart = start; },
    scrollTo({ top }) { this.scrollTop = top; }
};
const style = { lineHeight: '24px', paddingTop: '0px' };
const getComputedStyle = element => element.tagName
    ? { scrollMarginTop: `${headingMargin}px` }
    : { ...style, scrollPaddingTop: `${scrollPadding}px` };
const document = {
    getElementById: id => id === 'viewer-container' ? { getBoundingClientRect: () => ({ top: 0 }) } : null,
    addEventListener() {},
    createElement: () => ({ style: {}, appendChild(marker) { marker.offsetTop = sourceTop(this.textContent); } }),
    body: { appendChild() {}, removeChild() {} }
};
const window = { getComputedStyle };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../sidebar_left/sidebar-left.js'), 'utf8'), { window, document, getComputedStyle });
const api = window.SidebarLeft;
const ctx = { getEditor: () => editor, getViewer: () => ({ querySelectorAll: () => headers }), getMarkdown: () => markdown, isEditMode: () => editMode, instant: true };
const items = api.parseTocItemsFromMarkdown(markdown);
viewScroll = 7 * 7 * 130;
assert.equal(api.getModeSyncLine(ctx), items[7].lineIndex, 'view identifies SLIDE8');
editMode = true;
api.scrollToLine(items[7].lineIndex, ctx);
assert.equal(markdown.slice(editor.selectionStart).startsWith('# SLIDE8'), true);
assert.equal(api.getModeSyncLine(ctx), items[7].lineIndex, 'wrapped editor stays on SLIDE8');
editMode = false;
viewScroll = 0;
api.scrollToLine(items[7].lineIndex, ctx);
assert.equal(viewScroll, 7 * 7 * 130, 'return to view restores SLIDE8');
viewScroll = 8 * 8 * 130 + 150;
assert.equal(api.getModeSyncLine(ctx), items[8].lineIndex, 'manual scrolling updates the section');
for (const margin of [80, 100]) {
    headingMargin = margin;
    scrollPadding = 16;
    editMode = false;
    api.scrollToLine(items[7].lineIndex, ctx);
    const capturedLine = api.getModeSyncLine(ctx);
    assert.equal(capturedLine, items[7].lineIndex, 'TOC heading below viewport top is still SLIDE8');
    editMode = true;
    api.scrollToLine(capturedLine, ctx);
    assert.ok(markdown.slice(editor.selectionStart).startsWith('# SLIDE8'), 'view to edit must not jump to SLIDE7');
}
assert.equal(api.getModeSyncLine({ ...ctx, getMarkdown: () => 'no headings' }), null);
console.log('Mode TOC synchronization checks passed.');
