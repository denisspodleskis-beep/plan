/* Keeps the page shell on the device so it opens without a connection. The timetable file itself is never stored here. */
const CACHE = 'shell-v2';
const SHELL = ["./", "index.html", "app.css", "app.js", "icon.svg", "icon-192.png", "apple-touch-icon.png", "fonts/golos-text-cyrillic-400-normal.woff2", "fonts/golos-text-latin-400-normal.woff2", "fonts/golos-text-latin-ext-400-normal.woff2", "fonts/golos-text-cyrillic-500-normal.woff2", "fonts/golos-text-latin-500-normal.woff2", "fonts/golos-text-latin-ext-500-normal.woff2", "fonts/golos-text-cyrillic-600-normal.woff2", "fonts/golos-text-latin-600-normal.woff2", "fonts/golos-text-latin-ext-600-normal.woff2", "fonts/golos-text-cyrillic-700-normal.woff2", "fonts/golos-text-latin-700-normal.woff2", "fonts/golos-text-latin-ext-700-normal.woff2", "fonts/unbounded-cyrillic-600-normal.woff2", "fonts/unbounded-latin-600-normal.woff2"];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.endsWith('/data.json')) return;
  const id = url.origin + url.pathname;
  e.respondWith(fetch(req).then((res) => {
    if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(id, copy)); }
    return res;
  }).catch(() => caches.match(id).then((hit) => hit || Response.error())));
});
