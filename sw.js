const C = 'nyanko-split-v511';
const A = [
  './', './index.html', './update.html', './core.mjs', './store.mjs',
  './manifest.json', './icon.svg',
  './icon-192.png', './icon-512.png', './icon-maskable-512.png'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(C).then(c => c.addAll(A)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // HTML / 画面遷移はネット優先（古い index を掴み続けない）
  const isDoc = req.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname.endsWith('/');
  if (isDoc) {
    e.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(C).then(c => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
    );
    return;
  }
  // その他はキャッシュ優先
  e.respondWith(
    caches.match(req).then(r => r || fetch(req).then(res => {
      const copy = res.clone();
      caches.open(C).then(c => c.put(req, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
