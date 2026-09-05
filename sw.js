/* 完全キャッシュ優先・通常時はネットワークに出ない */
const C = 'nyanko-split-v534';
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
    caches.match(e.request, { ignoreSearch: true }).then(hit => {
      // キャッシュにあれば絶対にネットワークへ出ない
      if (hit) return hit;
      // 初回インストール時など、キャッシュにない場合のみ取得して保存
      return fetch(e.request).then(res => {
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(C).then(c => c.put(e.request, copy)).catch(() => {});
        }
        return res;
      }).catch(() => caches.match('./index.html') || caches.match('./'));
    })
  );
});
