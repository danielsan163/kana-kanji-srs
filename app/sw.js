// Service worker for the web / iPhone version: works offline and shows review alerts.
// scripts/build-web.js stamps BUILD with a hash of the files, so each release gets a fresh cache.
const BUILD = 'dev';
const CACHE = 'kks-' + BUILD;
const PRECACHE = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest', 'version.json', 'CHANGELOG.md',
  'js/kana.js', 'js/web-api.js', 'js/srs.js', 'js/sync.js', 'js/app.js',
  'data/data.js', 'data/strokes.json', 'data/examples.json',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'fonts/klee-one.css',
  'fonts/pixel.css', 'fonts/press-start-2p.woff2',
];

self.addEventListener('install', (e) => {
  // cache: 'reload' skips the phone's HTTP cache, so an update never picks up stale files
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('kks-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Cache first for the app's own files. Anything fetched from the network is cached too, so the
// offline copy rebuilds itself if something cleared it (another site on the same github.io address
// can wipe caches). Sync requests go to another address and straight to the network.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.searchParams.has('check')) return; // update checks always ask the server
  e.respondWith(caches.open(CACHE).then(async (cache) => {
    const hit = await cache.match(e.request, { ignoreSearch: true });
    if (hit) return hit;
    const res = await fetch(e.request);
    if (res.ok && res.type === 'basic') cache.put(e.request, res.clone());
    return res;
  }));
});

// Review alerts sent by the notify-reviews Supabase function
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch {}
  e.waitUntil(self.registration.showNotification(d.title || 'Reviews ready', {
    body: d.body || 'Tap to start your reviews.',
    tag: 'reviews', // a newer alert replaces the old one
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    data: { view: 'reviews' },
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const view = (e.notification.data && e.notification.data.view) || 'reviews';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const open = list.find((c) => 'focus' in c);
    if (open) { open.postMessage({ navigate: view }); return open.focus(); }
    return self.clients.openWindow('./#' + view);
  }));
});
