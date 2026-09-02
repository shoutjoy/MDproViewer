const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'js/mermaid/mermaid-editor/index.html'), 'utf8');
const editor = fs.readFileSync(path.join(root, 'js/mermaid/mermaid-editor/app.js'), 'utf8');
const app = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
const inDb = fs.readFileSync(path.join(root, 'js/inDB/inDB.js'), 'utf8');

for (const id of ['mermaid-image-dropzone', 'mermaid-image-file', 'mermaid-image-prompt', 'mermaid-image-generate', 'raw-code-editor', 'render']) {
  assert.match(html, new RegExp(`id=["']${id}["']`), `missing ${id}`);
}
for (const id of ['toolbar-layout-controls', 'toolbar-collapse-btn', 'toolbar-float-btn', 'toolbar-drag-handle']) {
  assert.match(html, new RegExp(`id=["']${id}["']`), `missing ${id}`);
}
assert.match(html, /id=["']mermaid-ai-collapse-btn["']/, 'AI panel collapse button is missing');
assert.match(html, /id=["']collapsed-example-select["']/, 'collapsed sample list is missing');
assert.match(html, /id=["']mermaid-document-insert["']/, 'document insert button is missing');
assert.doesNotMatch(html, /class=["']ai-ref-copy["']/, 'obsolete left-side AI description should be removed');
assert.match(editor, /addEventListener\('paste'/, 'clipboard image support is missing');
assert.match(editor, /addEventListener\('drop'/, 'drop image support is missing');
assert.match(editor, /mdv-analyze-image-to-mermaid/, 'AI request bridge is missing');
assert.match(editor, /mdv-image-to-mermaid-stream/, 'streaming code display is missing');
assert.match(editor, /typeMermaidCode/, 'non-streaming typewriter fallback is missing');
assert.match(editor, /toggleToolbarCollapsed/, 'toolbar collapse behavior is missing');
assert.match(editor, /toggleToolbarFloating/, 'floating toolbar behavior is missing');
assert.match(editor, /toggleMermaidAiPanel/, 'AI panel collapse behavior is missing');
assert.match(editor, /\{ collapsed: true, floating: false \}/, 'collapsed toolbar must be the default');
assert.match(editor, /saved === null \? true/, 'collapsed AI panel must be the default');
assert.match(editor, /initCollapsedExampleSelect/, 'collapsed sample list synchronization is missing');
assert.match(editor, /insertIntoDocumentAndClose/, 'insert-and-close behavior is missing');
assert.match(editor, /ResizeObserver/, 'floating toolbar resize persistence is missing');
assert.match(editor, /saveMermaidHistoryRecord/, 'automatic Mermaid history save is missing');
assert.match(editor, /toggleMermaidHistory/, 'Mermaid history panel is missing');
assert.match(editor, /mdv-open-mermaid-svg-in-image-insert/, 'SVG image handoff is missing');
assert.match(app, /AIChatBridge\.complete/, 'AI provider integration is missing');
assert.match(app, /onStreamEvent:\s*streamReply/, 'AI stream forwarding is missing');
assert.match(app, /data\.closeEditor === true/, 'Mermaid modal close after insertion is missing');
assert.match(app, /saveFeatureRecordToInDb\('mermaid_refs'/, 'Mermaid inDB save integration is missing');
assert.match(inDb, /mermaid_refs:\s*'Mermaid 생성 기록'/, 'Mermaid inDB store label is missing');
assert.match(app, /OpenAI 또는 AI Studio API 키/, 'vision-provider fallback guidance is missing');
assert.match(app, /applyImageInsertDataUrl/, 'image insert integration is missing');
assert.match(app, /fromMermaidEditor/, 'iframe message source validation is missing');

console.log('mermaid image ref tests passed');
