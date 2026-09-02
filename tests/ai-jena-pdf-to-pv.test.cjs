const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const search = fs.readFileSync('js/Scholarref/ai/academic-search.js', 'utf8');
const chat = fs.readFileSync('AI_App/aiChat/ai-chat.js', 'utf8');
const pv = fs.readFileSync('js/UI_PV/editpv.js', 'utf8');
const app = fs.readFileSync('js/app.js', 'utf8');

test('academic search keeps public PDF URLs from OpenAlex and Crossref', () => {
  assert.match(search, /best_oa_location/);
  assert.match(search, /pdfUrl: cleanText\(bestOpenAccess\.pdf_url \|\| primary\.pdf_url\)/);
  assert.match(search, /item && item\.link/);
  assert.match(search, /if \(!existing\.pdfUrl && item\.pdfUrl\)/);
});

test('AI Jena PDF search results open in PV', () => {
  assert.match(chat, /PDF · PV에서 열기/);
  assert.match(chat, /openRemotePdfInPreviewPopup/);
  assert.match(chat, /isDirectPdfUrl\(source\.url\)/);
  assert.match(pv, /function openRemotePdfInPreviewPopup/);
  assert.match(pv, /window\.openRemotePdfInPreviewPopup = openRemotePdfInPreviewPopup/);
  assert.match(app, /academic-search\.js\?v=20260817-scholar-audit-1-pdf-to-pv-1/);
  assert.match(app, /ai-chat\.js\?v=20260902-search-max-tokens-1-pdf-to-pv-1/);
});
