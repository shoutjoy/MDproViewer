const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const editor = fs.readFileSync(path.join(root, 'js', 'mermaid', 'mermaid-editor', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');

test('Mermaid Ref provides left and right width handles', () => {
    assert.match(html, /id="mermaid-editor-resize-left"/);
    assert.match(html, /id="mermaid-editor-resize-right"/);
    assert.match(html, /mermaid-editor-resize-left[^>]+tabindex="0"/);
    assert.match(css, /\.mermaid-editor-side-resize/);
    assert.match(app, /function bindMermaidEditorSideResize\(\)/);
    assert.match(app, /setPointerCapture/);
    assert.match(app, /event\.key !== 'ArrowLeft'/);
});

test('Mermaid Ref loads a selected document region only from its import button', () => {
    const editorHtml = fs.readFileSync(path.join(root, 'js', 'mermaid', 'mermaid-editor', 'index.html'), 'utf8');
    assert.match(app, /function getSelectedDocumentTextForMermaidEditor\(\)/);
    assert.match(editorHtml, /id="document-selection-import-btn"/);
    assert.match(editorHtml, /선택한 텍스트 가져오기/);
    assert.match(editor, /function requestSelectedDocumentText\(\)/);
    assert.match(editor, /type: 'mdv-request-document-selection'/);
    assert.match(app, /data\.type === 'mdv-request-document-selection'/);
    assert.match(app, /type: 'mdv-load-document-selection'/);
    assert.match(editor, /data\.type === 'mdv-load-document-selection'/);
    assert.match(editor, /editor\.setSelectionRange\(0, editor\.value\.length\)/);
    assert.doesNotMatch(editor, /type: 'mdv-mermaid-editor-ready'/);
    assert.doesNotMatch(app, /pendingMermaidEditorSelection/);
});

test('Mermaid Ref has a named right Dock control next to fullscreen', () => {
    assert.match(html, /전체화면<\/button>[\s\S]*id="mermaid-editor-dock-right-btn"[\s\S]*>Dock<\/button>/);
    assert.match(app, /panel\.classList\.toggle\('is-docked-right'/);
    assert.match(app, /panel\.style\.right = '0'/);
    assert.match(app, /panel\.style\.height = '100vh'/);
    assert.match(html, /app\.js\?v=20260903-mermaid-ref-manual-import-8/);
    assert.match(html, /style\.css\?v=20260903-img2math-clear-image-mermaid-ref-2/);
});
