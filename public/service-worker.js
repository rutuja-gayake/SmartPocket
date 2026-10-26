/**
 * SmartPocket Service Worker
 * Version: smartpocket-shell-v3
 *
 * Strategies:
 * - Network-First for HTML & JS: Always fetches the freshest code when online,
 *   while seamlessly falling back to cached shell when offline.
 * - API requests (/api/*): Passed straight to network (offline handling via IndexedDB).
 */

const CACHE_NAME = 'smartpocket-shell-v3';

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
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
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

  // Network-First with Cache Fallback for dynamic updates
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // When offline, serve from cache
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html');
          }
        });
      })
  );
});
