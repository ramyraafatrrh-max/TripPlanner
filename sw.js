/* sw.js - works offline, and picks up edited files by itself.
   - app files (html, css, js, json): network first, so a file you replaced on GitHub is used on the next open; the cached copy is the offline fallback
   - pictures: cache first;  city photos from Wikimedia: remembered (last 60) so banners still show offline.
   Because of this, updating one module never needs a version bump here. */
const CACHE = "trippilot-app", IMG = "trippilot-img", WIKI = "upload.wikimedia.org";
const CORE = ["./", "index.html", "css/base.css", "js/boot.js", "js/config.js", "manifest.webmanifest", "img/icon-192.png", "img/sky.jpg", "lib/pdf.min.mjs", "lib/pdf.worker.min.mjs"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE).catch(() => {})).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== IMG).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const req = e.request; if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.hostname === WIKI) {
    e.respondWith(caches.open(IMG).then(async c => { const hit = await c.match(req.url); if (hit) return hit; try { const r = await fetch(req.url, { mode: "cors" }); if (r.ok) { c.put(req.url, r.clone()); c.keys().then(k => { if (k.length > 60) c.delete(k[0]); }); } return r; } catch (err) { return Response.error(); } }));
    return;
  }
  if (url.origin !== location.origin) return;
  if (/\/img\//.test(url.pathname)) { e.respondWith(caches.open(CACHE).then(async c => { const hit = await c.match(req); if (hit) return hit; const r = await fetch(req); if (r.ok) c.put(req, r.clone()); return r; })); return; }
  e.respondWith(fetch(req, { cache: "no-cache" }).then(r => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return r; }).catch(() => caches.match(req).then(h => h || (req.mode === "navigate" ? caches.match("index.html") : Response.error()))));
});
