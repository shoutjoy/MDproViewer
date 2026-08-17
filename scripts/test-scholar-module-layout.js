const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const index = read('index.html');
const app = read('js/app.js');
const integration = read('js/Scholarref/integration/scholar-search-app.js');
const shell = read('js/Scholarref/ui/scholarsearch-shell.js');
const shellHtml = read('js/Scholarref/ui/scholarsearch-shell.html');
const academicSearch = read('js/Scholarref/ai/academic-search.js');
const academicCompat = read('AI_App/aiChat/academic-search.js');

for (const file of [
  'js/Scholarref/reference/scholarref.js',
  'js/Scholarref/crossref/search.js',
  'js/Scholarref/ai/academic-search.js',
  'js/Scholarref/ui/scholarsearch-shell.html',
  'js/Scholarref/ui/scholarsearch-shell.js',
  'js/Scholarref/styles/scholarref.css',
  'js/Scholarref/tools/sync-fallback-from-html.js',
  'js/Scholarref/integration/scholar-search-app.js',
  'js/Scholarref/Usermamual.md'
]) assert.ok(fs.existsSync(path.join(root, file)), `Missing Scholar module: ${file}`);

assert.match(index, /id="scholar-search-header-slot"/);
assert.match(index, /id="scholar-search-settings-slot"/);
assert.match(index, /Scholarref\/integration\/scholar-search-app\.js/);
assert.doesNotMatch(index, /id="btn-scholar-search"/);
assert.doesNotMatch(index, /id="scholar-search-visible"/);

for (const token of [
  'global.ScholarSearch = namespace',
  'global.ScholarSearchApp = api',
  'ensureLoaded: ensureLoaded',
  'applyVisibility: applyVisibility',
  "moduleUrl('../reference/scholarref.js')",
  "moduleUrl('../crossref/search.js')",
  "moduleUrl('../ui/scholarsearch-shell.js')"
]) assert.ok(integration.includes(token), `Missing integration token: ${token}`);

assert.doesNotMatch(app, /function ensureScholarSearchLoaded/);
assert.doesNotMatch(app, /function applyScholarSearchVisibility/);
assert.doesNotMatch(app, /function toggleScholarSearchSection/);
assert.match(app, /ScholarSearchApp\.connectHost/);
assert.match(app, /Scholarref\/ai\/academic-search\.js/);
assert.match(shell, /Scholarref\/reference\/scholarref\.js/);
assert.match(shell, /Scholarref\/ui\/scholarsearch-shell\.html/);
assert.match(academicSearch, /root\.ScholarSearch\.AcademicSearch = api/);
assert.match(academicCompat, /Scholarref\/ai\/academic-search\.js/);
const fallbackMatch = shell.match(/var FALLBACK_TEMPLATE_HTML = (".*");\r?\n/);
assert.ok(fallbackMatch, 'Missing generated Scholar shell fallback');
assert.equal(JSON.parse(fallbackMatch[1]).trim(), shellHtml.trim(), 'Scholar shell fallback is out of sync');
assert.equal(fs.existsSync(path.join(root, 'js/Scholarref/scholarsearch-shell.html')), false, 'Legacy HTML source should not remain duplicated');

console.log('Scholar module layout and host wiring checks passed.');
