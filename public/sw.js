/* Service worker: app shell cached for offline, API answers cached as a last-known fallback. */
const SHELL = 'shell-v2';
const DATA = 'data-v2';
const SHELL_FILES = ['/', '/index.html', '/app.js', '/shorts.js', '/style.css', '/manifest.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => ![SHELL, DATA].includes(k)).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname === '/api/stream') return; // SSE, never cache

  if (url.pathname.startsWith('/api/')) {
    // Network first; if it fails, hand back the last good answer with a marker header.
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          if (res.ok) { const copy = res.clone(); caches.open(DATA).then((c) => c.put(e.request, copy)).catch(() => {}); }
          return res;
        })
        .catch(async () => {
          const hit = await caches.match(e.request);
          if (!hit) return new Response(JSON.stringify({ error: 'offline', message: 'You are offline and nothing is cached for this yet.' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
          const headers = new Headers(hit.headers);
          headers.set('X-From-Cache', '1');
          return new Response(await hit.blob(), { status: 200, headers });
        }),
    );
    return;
  }

  // App shell: cache first, refresh in the background.
  e.respondWith(
    caches.match(e.request).then((hit) => {
      const net = fetch(e.request).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(SHELL).then((c) => c.put(e.request, copy)).catch(() => {}); } return res; }).catch(() => hit);
      return hit || net;
    }),
  );
});
