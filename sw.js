/* Service worker: keeps the app working offline and opens the right day when you tap a notification */
const CACHE = "trippilot-v6";
const IMG_CACHE = "trippilot-photos-v1";
const IMG_HOST = "upload.wikimedia.org";
const IMG_MAX = 60;
const SHELL = [
  "./", "index.html", "css/style.css", "manifest.webmanifest",
  "js/app.js", "js/ui.js", "js/util.js", "js/store.js", "js/parser.js", "js/places.js", "js/maps.js", "js/notify.js", "js/views-trip.js", "js/pdfloader.js", "js/icons.js", "js/docs.js", "js/share.js", "js/shareui.js", "js/link.js", "js/secure.js", "js/config.js", "js/backend.js", "js/live.js", "js/photos.js", "js/banner.js",
  "lib/pdf.min.mjs", "lib/pdf.worker.min.mjs", "icons/icon.svg", "icons/icon-192.png", "icons/icon-512.png",
  "img/sky.jpg", "img/lagoon.jpg", "img/alpine.jpg", "img/harbour.jpg", "img/dunes.jpg", "img/stars.jpg"
];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== IMG_CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  /* city photos from Wikimedia: remember them so banners still show offline */
  if (url.hostname === IMG_HOST) {
    e.respondWith(caches.open(IMG_CACHE).then(async c => {
      const hit = await c.match(req.url);
      if (hit) return hit;
      try {
        const res = await fetch(req.url, { mode: "cors" });
        if (res.ok) { c.put(req.url, res.clone()); c.keys().then(k => { if (k.length > IMG_MAX) c.delete(k[0]); }); }
        return res;
      } catch (err) { return Response.error(); }
    }));
    return;
  }
  if (url.origin !== location.origin) return;
  e.respondWith(caches.match(req).then(hit => {
    const net = fetch(req).then(res => { if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return res; }).catch(() => hit);
    return hit || net;
  }));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "./";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    for (const c of list) { if ("focus" in c) { c.navigate(url).catch(() => {}); return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});
