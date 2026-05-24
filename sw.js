// CValRSketch service worker — offline-first cache of the single-file app.
// Bumping CACHE_NAME forces a fresh fetch + cache rebuild on next install.
const CACHE_NAME = 'cvalrsketch-v0.11.23';
const CORE_ASSETS = [
  './',
  './index.html',
  './core.js',
  './dictation.js',
  './manifest.webmanifest',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './m/',
  './m/index.html',
  './m/manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // addAll is atomic — if any asset fails (e.g. icon-192.png not yet present),
      // the whole install fails. Add the entry doc first, then settle the rest individually.
      cache.add('./index.html')
        .then(() => Promise.allSettled(CORE_ASSETS.map((url) => cache.add(url))))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((resp) => {
          // Cache successful same-origin GETs as they're requested
          if (resp && resp.ok) {
            const clone = resp.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return resp;
        })
        .catch(() => caches.match('./index.html'));
    })
  );
});
