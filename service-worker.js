/**
 * Amber Learn — service worker (PWA).
 *
 * Стратегия:
 *  - HTML: network-first, fallback cache
 *  - JSON: stale-while-revalidate (контент обновляется, но старый не теряется)
 *  - JS/CSS/manifest: cache-first (с прекешированием)
 */
const CACHE_VERSION = 5;
const CACHE_NAME = 'amber-learn-v' + CACHE_VERSION;

const PRECACHE_URLS = [
  './',
  './styles/cyberpunk.css?v=' + CACHE_VERSION,
  './styles/layout.css?v=' + CACHE_VERSION,
  './js/highlighter.js?v=' + CACHE_VERSION,
  './scripts/app.js?v=' + CACHE_VERSION,
  './scripts/content.js?v=' + CACHE_VERSION,
  './scripts/editor.js?v=' + CACHE_VERSION,
  './scripts/js-runner.js?v=' + CACHE_VERSION,
  './scripts/storage.js?v=' + CACHE_VERSION,
  './scripts/auth.js?v=' + CACHE_VERSION,
  './scripts/progress.js?v=' + CACHE_VERSION,
  './manifest.webmanifest',
  './index.html?v=' + CACHE_VERSION,
  './dashboard.html?v=' + CACHE_VERSION,
  './course.html?v=' + CACHE_VERSION,
  './lesson.html?v=' + CACHE_VERSION,
  './login.html?v=' + CACHE_VERSION,
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(PRECACHE_URLS);
    }).catch(function (err) {
      // Игнорируем отсутствующие файлы
      console.warn('SW precache warning:', err);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(
        names.filter(function (name) {
          return name !== CACHE_NAME;
        }).map(function (name) {
          return caches.delete(name);
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', function (event) {
  var url = new URL(event.request.url);

  // Внешние ресурсы (Google Fonts) — сразу в сеть
  if (url.hostname.includes('fonts.googleapis.com') ||
      url.hostname.includes('fonts.gstatic.com') ||
      url.hostname.includes('cdn.jsdelivr.net')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // JSON-контент: stale-while-revalidate
  if (url.pathname.endsWith('.json')) {
    var cached = caches.match(event.request);
    event.respondWith(
      cached.then(function (response) {
        var fetchPromise = fetch(event.request).then(function (networkResponse) {
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(event.request, networkResponse.clone());
          });
          return networkResponse;
        }).catch(function () {
          return response;
        });
        return response || fetchPromise;
      }).catch(function () {
        return fetch(event.request);
      })
    );
    return;
  }

  // HTML: network-first
  if (event.request.headers.get('accept')?.includes('text/html') ||
      url.pathname.endsWith('.html')) {
    event.respondWith(
      fetch(event.request).then(function (res) {
        if (res.ok) {
          var clone = res.clone();
          caches.open(CACHE_NAME).then(function (c) { c.put(event.request, clone); });
        }
        return res;
      }).catch(function () {
        return caches.match(event.request);
      })
    );
    return;
  }

  // Статика (JS, CSS, manifest): cache-first
  event.respondWith(
    caches.match(event.request).then(function (cached) {
      return cached || fetch(event.request).then(function (res) {
        if (res.ok) {
          var clone = res.clone();
          caches.open(CACHE_NAME).then(function (c) { c.put(event.request, clone); });
        }
        return res;
      });
    }).catch(function () {
      return caches.match(event.request);
    })
  );
});
