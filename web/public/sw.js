// Service Worker: App-Dateien offline verfügbar, Push-Benachrichtigungen. Daten und Fotos laufen nie über diesen Cache.
const C = 'putzplan-v2';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/') || u.pathname.startsWith('/photos/')) return;
  const keep = r => { if (r.ok) { const cp = r.clone(); caches.open(C).then(c => c.put(e.request, cp)); } return r; };
  // Dateien mit Prüfsumme im Namen ändern sich nie: erst Cache. Alles andere: erst Netz, ohne Netz aus dem Cache.
  if (u.pathname.startsWith('/assets/')) e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(keep)));
  else e.respondWith(fetch(e.request).then(keep).catch(() => caches.match(e.request).then(r => r || caches.match('/'))));
});

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data.json(); } catch { d = { title: 'Putzplan', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Putzplan', { body: d.body || '', icon: '/icon-192.png', badge: '/icon-192.png', tag: d.tag }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => (cs.length ? cs[0].focus() : clients.openWindow('/'))));
});
