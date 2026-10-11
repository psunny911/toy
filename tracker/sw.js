// 오프라인 지원용 서비스 워커 (http/https로 열었을 때만 등록됨, file://에서는 동작 안 함).
// 네트워크 우선 + 캐시 폴백: 온라인이면 항상 최신 파일, 오프라인이면 마지막으로 받은 파일.
// 기록 데이터는 localStorage에 있으므로 이 캐시와 무관하다.
const CACHE = 'tracker-shell-v3';
const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/style.css?v=3',
  'js/dates.js?v=3',
  'js/store.js?v=3',
  'js/stats.js?v=3',
  'js/storage.js?v=3',
  'js/app.js?v=3',
  'icons/icon.svg',
  'icons/icon-192.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: false }).then((hit) => hit || caches.match('index.html'))),
  );
});
