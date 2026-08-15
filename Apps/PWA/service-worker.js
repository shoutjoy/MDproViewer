'use strict';

const CACHE_PREFIX = 'md-viewer-pwa-';
const CACHE_VERSION = '20260816-1';
const STATIC_CACHE = CACHE_PREFIX + CACHE_VERSION;
const CORE_ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './css/tailwind-static.css',
  './js/app.js',
  './Apps/PWA/manifest.webmanifest',
  './Apps/PWA/icons/icon.svg',
  './Apps/PWA/icons/icon-maskable.svg',
  './Apps/PWA/pwa-settings.css',
  './Apps/PWA/pwa-settings.js'
];

async function cacheCoreAssets() {
  const cache = await caches.open(STATIC_CACHE);
  await Promise.all(CORE_ASSETS.map(async function (asset) {
    try {
      await cache.add(new Request(asset, { cache: 'reload' }));
    } catch (error) {
      console.warn('[MD Viewer PWA] Core asset cache skipped:', asset, error);
    }
  }));
}

async function removeOldCaches(includeCurrent) {
  const keys = await caches.keys();
  const targets = keys.filter(function (key) {
    return key.startsWith(CACHE_PREFIX) && (includeCurrent || key !== STATIC_CACHE);
  });
  await Promise.all(targets.map(function (key) { return caches.delete(key); }));
  return targets.length;
}

self.addEventListener('install', function (event) {
  event.waitUntil(cacheCoreAssets().then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (event) {
  event.waitUntil(removeOldCaches(false).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (event) {
  const request = event.request;
  if (request.method !== 'GET' || request.headers.has('range')) return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then(function (response) {
      if (response && response.ok) {
        const copy = response.clone();
        event.waitUntil(caches.open(STATIC_CACHE).then(function (cache) {
          return cache.put('./index.html', copy);
        }));
      }
      return response;
    }).catch(async function () {
      return (await caches.match(request, { ignoreSearch: true }))
        || (await caches.match('./index.html'))
        || Response.error();
    }));
    return;
  }

  const cacheableDestination = ['script', 'style', 'image', 'font'].includes(request.destination);
  if (!cacheableDestination) return;

  event.respondWith(caches.match(request).then(function (cached) {
    const network = fetch(request).then(function (response) {
      if (response && response.ok && response.type === 'basic') {
        const copy = response.clone();
        event.waitUntil(caches.open(STATIC_CACHE).then(function (cache) {
          return cache.put(request, copy);
        }));
      }
      return response;
    }).catch(function () { return cached || Response.error(); });
    return cached || network;
  }));
});

self.addEventListener('message', function (event) {
  const data = event.data || {};
  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }
  if (data.type === 'REFRESH_PWA_CACHE') {
    event.waitUntil((async function () {
      const removed = await removeOldCaches(true);
      await cacheCoreAssets();
      if (event.source && event.source.postMessage) {
        event.source.postMessage({ type: 'PWA_CACHE_REFRESHED', removed: removed });
      }
    })());
  }
});
