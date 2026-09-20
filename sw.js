const C = 'nyanko-split-v556';
const SHELL = [
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

self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== C).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  const hasBypassQuery = url.searchParams.has('t');

  // update.html からの強制取得クエリ(?t=...)が付いている場合はネットから取得
  if (hasBypassQuery) {
    event.respondWith(
      fetch(event.request).then(res => {
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(C).then(c => c.put(event.request, copy)).catch(() => {});
        }
        return res;
      }).catch(() => caches.match(event.request, { ignoreSearch: true }))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then(hit => {
      if (hit) return hit;
      return fetch(event.request).then(res => {
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(C).then(c => c.put(event.request, copy)).catch(() => {});
        }
        return res;
      }).catch(() =>
        caches.match('./index.html').then(h => h || caches.match('./'))
      );
    })
  );
});
