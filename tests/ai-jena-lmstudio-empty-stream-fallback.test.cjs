const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const appSource = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

test('LM Studio retries an empty streaming response without streaming', function () {
  assert.match(appSource, /await client\.chatStream\(chatOptions\)/);
  assert.match(appSource, /응답이 비어\|empty response\|failed to fetch/);
  assert.match(appSource, /receivedStreamContent\) throw streamError/);
  assert.match(appSource, /type:\s*'transport\.fallback'/);
  assert.match(appSource, /await client\.chat\(Object\.assign\(\{\}, chatOptions/);
  assert.match(appSource, /internalStream:\s*false/);
  assert.match(appSource, /completeStreaming:\s*false/);
});

test('LM Studio empty-stream fallback does not retry an aborted request', function () {
  assert.match(appSource, /controller\.signal\.aborted\s*\|\|\s*streamError\?\.name\s*===\s*'AbortError'/);
});

test('the deployed app script URL has a cache-busting fallback marker', function () {
  assert.match(indexSource, /lmStudioEmptyStreamFallback=20260914-1/);
});
