/* Lead Radar service worker. Conservative on purpose:
   - pages (navigations) are NEVER cached: network only, with an offline page when the network is down
   - Supabase, API, auth and non-GET requests are never touched
   - only same-origin static build assets and icons are cached (stale-while-revalidate) */
const VERSION = 'lr-v1';
const SHELL = VERSION + '-shell';
const STATIC = VERSION + '-static';
const PRECACHE = ['/offline.html', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

const isStaticAsset = (url) => url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/') || /\.(?:woff2?|css|png|svg|ico)$/.test(url.pathname);

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase and every other origin go straight to the network
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) return;

  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match('/offline.html')));
    return;
  }
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.open(STATIC).then(async (cache) => {
        const hit = await cache.match(req);
        const net = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => hit);
        return hit || net;
      }),
    );
  }
});

self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { d = { body: event.data ? event.data.text() : '' }; }
  const title = String(d.title || 'Lead Radar').slice(0, 80);
  event.waitUntil(
    self.registration.showNotification(title, {
      body: String(d.body || '').slice(0, 140),
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      tag: d.tag || d.event || undefined,
      data: { url: typeof d.url === 'string' && d.url.startsWith('/') ? d.url : '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (new URL(c.url).origin === self.location.origin && 'focus' in c) {
          return c.focus().then((f) => (f && 'navigate' in f ? f.navigate(target) : undefined));
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
