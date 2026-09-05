/* オフライン固定・キャッシュ優先 */
const C = 'nyanko-split-v529';
const A = [
  './',
  './index.html',
  './app.mjs',
  './update.html',
  './core.mjs',
  './store.mjs',
  './manifest.json',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(C).then(c => c.addAll(A)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(hit => {
      if (hit) return hit;
      return fetch(e.request).then(res => {
        const copy = res.clone();
        caches.open(C).then(c => c.put(e.request, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
