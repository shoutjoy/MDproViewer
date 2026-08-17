const fs = require('fs');
const path = require('path');

const SCHOLAR_ROOT = path.resolve(__dirname, '..');
const htmlPath = path.join(SCHOLAR_ROOT, 'ui', 'scholarsearch-shell.html');
const jsPath = path.join(SCHOLAR_ROOT, 'ui', 'scholarsearch-shell.js');

const START = '  // AUTO-GENERATED FALLBACK TEMPLATE START';
const END = '  // AUTO-GENERATED FALLBACK TEMPLATE END';

function normalizeEol(text) {
  return String(text || '').replace(/\r\n/g, '\n');
}

function buildGeneratedBlock(htmlSource) {
  const literal = JSON.stringify(htmlSource.trim());
  return [
    START,
    `  var FALLBACK_TEMPLATE_HTML = ${literal};`,
    END,
    '',
    '  function getTemplateHtml() {',
    '    return FALLBACK_TEMPLATE_HTML;',
    '  }',
    ''
  ].join('\n');
}

function replaceFunctionFallback(source, generatedBlock) {
  const fnStart = source.indexOf('  function getTemplateHtml() {');
  if (fnStart < 0) throw new Error('getTemplateHtml() not found in scholarsearch-shell.js');

  let nextFn = source.indexOf('\n  function mountTemplateHtml(', fnStart);
  if (nextFn < 0) nextFn = source.indexOf('\n  function ensureModalMarkup()', fnStart);
  if (nextFn < 0) throw new Error('mountTemplateHtml()/ensureModalMarkup() not found after getTemplateHtml()');

  return source.slice(0, fnStart) + generatedBlock + source.slice(nextFn + 1);
}

function replaceMarkerBlock(source, generatedBlock) {
  const s = source.indexOf(START);
  const e = source.indexOf(END);
  if (s < 0 || e < 0 || e < s) return null;

  const lineEndAfterEnd = source.indexOf('\n', e);
  const replaceUntil = lineEndAfterEnd >= 0 ? lineEndAfterEnd + 1 : source.length;

  const before = source.slice(0, s);
  const after = source.slice(replaceUntil);

  const fnStart = after.indexOf('  function getTemplateHtml() {');
  if (fnStart < 0) throw new Error('getTemplateHtml() not found after marker block');
  let nextFn = after.indexOf('\n  function mountTemplateHtml(', fnStart);
  if (nextFn < 0) nextFn = after.indexOf('\n  function ensureModalMarkup()', fnStart);
  if (nextFn < 0) throw new Error('mountTemplateHtml()/ensureModalMarkup() not found after getTemplateHtml()');

  const fnEnd = after.indexOf('\n  }\n', fnStart);
  if (fnEnd < 0 || fnEnd >= nextFn) throw new Error('getTemplateHtml() closing brace not found');
  const preservedHelpers = after.slice(fnEnd + 5, nextFn + 1);
  const tail = after.slice(nextFn + 1);
  return before + generatedBlock + preservedHelpers + tail;
}

function main() {
  if (!fs.existsSync(htmlPath)) throw new Error(`Missing HTML source: ${htmlPath}`);
  if (!fs.existsSync(jsPath)) throw new Error(`Missing JS target: ${jsPath}`);

  const html = normalizeEol(fs.readFileSync(htmlPath, 'utf8'));
  if (!html.trim()) throw new Error('HTML source is empty');
  if (!html.includes('id="scholar-search-modal"')) {
    throw new Error('HTML source does not include #scholar-search-modal root');
  }

  const js = normalizeEol(fs.readFileSync(jsPath, 'utf8'));
  const generated = buildGeneratedBlock(html);

  const byMarker = replaceMarkerBlock(js, generated);
  const next = byMarker == null ? replaceFunctionFallback(js, generated) : byMarker;

  fs.writeFileSync(jsPath, next, 'utf8');
  console.log('Updated fallback template in ui/scholarsearch-shell.js from ui/scholarsearch-shell.html');
}

main();
