// VitaminKu minimal SW: precache offline page + icons only. Never caches pages, API, prices, stock, orders, admin.
const CACHE = "vitaminku-shell-v1";
const PRECACHE = ["/offline.html", "/icon-192.png", "/icon-512.png", "/icon-maskable-512.png", "/apple-touch-icon.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("vitaminku-shell-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase, CDN: browser handles, never cached
  if (req.mode === "navigate") {
    if (url.pathname.startsWith("/admin") || url.pathname.startsWith("/seller") || url.pathname.startsWith("/~oauth")) return;
    // Network only; offline page fallback. Pages are never stored.
    e.respondWith(fetch(req).catch(() => caches.match("/offline.html")));
    return;
  }
  if (PRECACHE.includes(url.pathname)) {
    e.respondWith(caches.match(req).then((r) => r || fetch(req)));
  }
  // everything else (API, server functions, assets): untouched, no caching
});
