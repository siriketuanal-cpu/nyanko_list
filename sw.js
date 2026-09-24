const C = 'nyanko-split-v562';
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
  event.waitUntil(
    caches.open(C)
      .then(c => c.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
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

  // ナビゲーション要求（ページ遷移）はキャッシュファーストで即応答
  // → オフライン起動を確実にする
  if (event.request.mode === 'navigate') {
    event.respondWith(
      caches.match(event.request, { ignoreSearch: true })
        .then(hit => hit || caches.match('./index.html'))
        .then(hit => hit || caches.match('./'))
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // 静的リソースもキャッシュファースト（更新は update.html 経由で行う）
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then(hit => {
      if (hit) return hit;
      return fetch(event.request).then(res => {
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(C).then(c => c.put(event.request, copy)).catch(() => {});
        }
        return res;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
