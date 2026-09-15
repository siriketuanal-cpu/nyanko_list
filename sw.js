/* キャッシュ名固定。通常起動ではネットに出ない。
 * install では addAll しない（TWA更新バー・起動時通信を抑える）。
 * 初回取得は fetch ミス時のみ。まとめた取り直しは update.html。 */
const C = 'nyanko-split-v555';
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
  // ネット取得しない。すぐ待機解除のみ。
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
