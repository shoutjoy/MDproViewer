const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('heavy optional features are absent from the initial script graph', () => {
  const html = read('index.html');
  const initialScriptSources = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)]
    .map((match) => match[1]);
  const deferred = [
    'mammoth.browser.min.js',
    'docx-export.js',
    'html-export.js',
    'pdf-export.js',
    'AI_App/aiChat/ai-chat.js',
    'js/Scholarref/reference/scholarref.js',
    'js/Scholarref/crossref/search.js',
    'js/Scholarref/ui/scholarsearch-shell.js',
    'cdnjs.cloudflare.com/ajax/libs/mathjax',
    'cdn.jsdelivr.net/npm/katex'
  ];
  for (const token of deferred) {
    assert.equal(initialScriptSources.some((source) => source.includes(token)), false, token);
  }
});

test('Tailwind uses a local static stylesheet with an opt-in CDN fallback', () => {
  const html = read('index.html');
  assert.match(html, /css\/tailwind-static\.css\?v=/);
  assert.doesNotMatch(html, /<script\b[^>]*src=["']https:\/\/cdn\.tailwindcss\.com/i);
  assert.match(html, /tailwindCdn/);
  assert.ok(read('css/tailwind-static.css').length > 20000);
});

test('hidden tool frames use data-src and have explicit activation hooks', () => {
  const html = read('index.html');
  const app = read('js/app.js');
  for (const id of ['mermaid-editor-frame', 'highlight-popup-frame', 'html2ppt-frame']) {
    const tag = html.match(new RegExp(`<iframe\\b[^>]*id=["']${id}["'][^>]*>`, 'i'));
    assert.ok(tag, id);
    assert.match(tag[0], /\bdata-src=/i);
    assert.doesNotMatch(tag[0], /\ssrc=/i);
    assert.match(app, new RegExp(`ensureLazyFrameLoaded\\(['"]${id}['"]\\)`));
  }
});

test('versioned assets and HTML receive different cache policies', () => {
  const server = read('run.py');
  assert.match(server, /max-age=31536000, immutable/);
  assert.match(server, /path\.endswith\(\(\"\.html\", \"\.htm\"\)\)/);
  assert.match(server, /MD_VIEWER_CACHE_MODE/);
});
