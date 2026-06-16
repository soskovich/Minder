/* Minder service worker — v2
   Network-first voor de app-pagina (altijd verse versie als je online bent),
   cache-first voor statische assets (iconen). Werkt offline via de cache. */
const CACHE = 'minder-v2';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const isHTML = e.request.mode === 'navigate' ||
                 (e.request.headers.get('accept') || '').includes('text/html');
  if (isHTML) {
    // network-first: altijd de nieuwste app-pagina proberen, val terug op cache offline
    e.respondWith(
      fetch(e.request).then(resp => {
        const copy = resp.clone();
        caches.open(CACHE).then(c => c.put('./index.html', copy)).catch(() => {});
        return resp;
      }).catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
    );
  } else {
    // cache-first voor iconen e.d.
    e.respondWith(
      caches.match(e.request).then(cached =>
        cached || fetch(e.request).then(resp => {
          const copy = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
          return resp;
        }).catch(() => cached)
      )
    );
  }
});
