/**
 * SmartPocket Service Worker
 * Version: smartpocket-v1
 *
 * Strategies:
 * - App Shell & static assets: Cache-first with network fallback.
 * - API requests (/api/*): Network-only; offline storage is managed by IndexedDB (smartpocket_idb)
 *   to avoid caching private session or credential data in shared HTTP caches.
 */

const CACHE_NAME = 'smartpocket-shell-v1';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/theme.css',
  '/css/main.css',
  '/assets/chart.umd.min.js',
  '/assets/icons/icon.svg',
  '/js/app.js',
  '/js/api.js',
  '/js/db.js',
  '/js/sync.js',
  '/js/auth.js',
  '/js/calculations.js',
  '/js/charts.js',
  '/js/ui.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never cache API or stateful endpoints in the HTTP cache
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // Cache-first strategy for app shell & static assets
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Fetch in background to update cache (stale-while-revalidate)
        fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
          }
        }).catch(() => {});
        return cachedResponse;
      }

      return fetch(event.request).catch(() => {
        // Offline fallback for navigation
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      });
    })
  );
});

