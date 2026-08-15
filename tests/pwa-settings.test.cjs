const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('PWA manifest is wired to the root document', () => {
  const html = read('index.html');
  assert.match(html, /rel="manifest" href="\.\/Apps\/PWA\/manifest\.webmanifest"/);
  assert.match(html, /src="\.\/Apps\/PWA\/pwa-settings\.js\?v=/);
  assert.match(html, /onclick="openPwaSettings\(\)"/);
});

test('PWA manifest launches and scopes the root app', () => {
  const manifest = JSON.parse(read('Apps/PWA/manifest.webmanifest'));
  assert.equal(manifest.scope, '../../');
  assert.match(manifest.start_url, /^\.\.\/\.\.\/index\.html/);
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.icons.some((icon) => icon.purpose === 'maskable'));
});

test('root worker delegates to Apps/PWA and cache controls are exposed', () => {
  assert.match(read('service-worker.js'), /importScripts\('\.\/Apps\/PWA\/service-worker\.js'\)/);
  const worker = read('Apps/PWA/service-worker.js');
  assert.match(worker, /REFRESH_PWA_CACHE/);
  assert.match(worker, /request\.mode === 'navigate'/);
  const settings = read('Apps/PWA/pwa-settings.js');
  assert.match(settings, /beforeinstallprompt/);
  assert.match(settings, /navigator\.serviceWorker\.register/);
});
