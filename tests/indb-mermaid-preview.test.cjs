const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const inDb = fs.readFileSync(path.join(root, 'js', 'inDB', 'inDB.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'js', 'inDB', 'inDB.css'), 'utf8');

assert.match(inDb, /function renderInDbMermaidPreviewSection\(record\)/);
assert.match(inDb, /<code class="language-mermaid">/);
assert.match(inDb, /escapeInDbStatusHtml\(code\)/, 'Mermaid code must be escaped before insertion into the detail pane.');
assert.match(inDb, /window\.MermaidTRT\.renderIn\(preview\)/, 'The inDB preview must use the shared Mermaid renderer.');
assert.match(inDb, /storeName === 'mermaid_refs' \? renderInDbMermaidPreviewSection\(record\) : ''/);
assert.match(inDb, /activeStore === 'mermaid_refs' && activeRecord/);
assert.match(css, /\.indb-mermaid-preview\s*\{/);
assert.match(css, /\.indb-mermaid-preview-stage\s*\{/);
assert.match(html, /inDB\/inDB\.css\?v=20260903-mermaid-preview-1/);
assert.match(html, /inDB\/inDB\.js\?v=20260903-mermaid-preview-1/);

console.log('inDB Mermaid rendering preview checks passed');
