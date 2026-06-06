const CACHE = "aura-v6"; // bumped — WalletConnect ESM loader fix
const CORE  = ["/", "/index.html", "/styles.css", "/app.js", "/logo.svg", "/icon.svg", "/manifest.json"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE).catch(() => {})));
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", e => {
  const url = e.request.url;
  // Pass through: RPC calls, external CDN, Google Fonts
  if (url.includes("somnia.network") || url.includes("googleapis") ||
      url.includes("cloudflare") || url.includes("gstatic") ||
      url.includes("esm.sh") || url.includes("unpkg.com") ||
      url.includes("jsdelivr.net")) return;

  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res && res.status === 200 && e.request.method === "GET") {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      });
    }).catch(() => caches.match("/index.html"))
  );
});
