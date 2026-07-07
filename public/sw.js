/* public/sw.js — hand-written service worker.
 *
 * STRATEGY
 *  - Precache + network-first-with-fallback: the /field/* app shell routes.
 *    Data renders from IndexedDB (Dexie, encrypted) — pages work offline.
 *  - Cache-first: static assets (_next/static, icons, brand, manifest).
 *  - Network-only, NO CACHE, for API/data requests: PHI must never land in
 *    the SW cache. Offline data lives in IndexedDB, managed by lib/offline.
 */
const SHELL_CACHE = "dls-shell-v2";
const SHELL_URLS = [
  "/field",
  "/field/week",
  "/field/timesheet",
  "/field/more",
  "/field/emar",
  "/manifest.json"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isPhiRequest(url) {
  // Supabase REST/auth/storage + our API routes: NEVER cached.
  return url.pathname.startsWith("/api/") || url.hostname.endsWith(".supabase.co");
}

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/brand/") ||
    url.pathname === "/manifest.json"
  );
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET") return;

  // PHI/data: network only. Offline fallback is IndexedDB in app code.
  if (isPhiRequest(url)) return;

  // Static assets: cache-first
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(event.request).then(
        (hit) =>
          hit ||
          fetch(event.request).then((res) => {
            const copy = res.clone();
            caches.open(SHELL_CACHE).then((c) => c.put(event.request, copy));
            return res;
          })
      )
    );
    return;
  }

  // Field shell navigation: network-first; offline falls back to the cached
  // shell for that route (deep links included — /field/visits/* falls back
  // to /field, where Dexie renders the visit from local data).
  if (event.request.mode === "navigate" && url.pathname.startsWith("/field")) {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put(url.pathname, copy));
          return res;
        })
        .catch(async () => {
          const exact = await caches.match(url.pathname);
          if (exact) return exact;
          // client-side router will resolve the deep link from IndexedDB
          return caches.match("/field");
        })
    );
  }
});
