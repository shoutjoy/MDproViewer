const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'ShareSites', 'sitesshow', 'sitesshow.js'),
  'utf8'
);

test('Sites opens beside AI Jena without overlapping its right dock', () => {
  assert.match(source, /const SITES_AI_JENA_GAP = 120;/);
  assert.match(source, /dockWidth \+ SITES_AI_JENA_GAP/);
  assert.match(source, /panel\.classList\.toggle\('ai-jena-dock-adjacent', dockWidth > 0\)/);
  assert.match(source, /window\.addEventListener\('ai-jena-layout-change'/);
});

test('Sites returns to its normal corner when AI Jena is not docked', () => {
  assert.match(source, /dockWidth > 0 \? dockWidth \+ SITES_AI_JENA_GAP : 12/);
  assert.match(source, /dockWidth > 0 \? SITES_DOCK_BOTTOM_GAP : 12/);
});
