/* public/sw.js — hand-written service worker.
 *
 * STRATEGY
 *  - Cache-first: static assets (_next/static, icons, brand, manifest).
 *  - Offline shell for the field app: ONLY routes whose HTML is a client-
 *    rendered shell with no PHI in it (they render from IndexedDB, which is
 *    encrypted). Those are precached on install and refreshed network-first.
 *  - Everything else — API/data requests AND server-rendered field pages
 *    (timesheet, documents, training, more: their HTML carries names) — is
 *    network-only and NEVER written to Cache Storage. Offline, a navigation
 *    to one of those falls back to the /field shell.
 */
const SHELL_CACHE = "dls-shell-v3";

// Client-rendered shells: safe to cache (no PHI in the HTML).
const SHELL_URLS = ["/field", "/field/week", "/field/emar", "/manifest.json"];
function isCacheableShell(pathname) {
  return (
    pathname === "/field" ||
    pathname === "/field/week" ||
    pathname === "/field/emar" ||
    /^\/field\/visits\/[^/]+(\/note)?$/.test(pathname)
  );
}

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
  if (isPhiRequest(url)) return; // network only

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

  if (event.request.mode === "navigate" && url.pathname.startsWith("/field")) {
    const cacheable = isCacheableShell(url.pathname);
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          // Only PHI-free shells are stored; server-rendered pages pass through.
          if (cacheable && res.ok) {
            const copy = res.clone();
            caches.open(SHELL_CACHE).then((c) => c.put(url.pathname, copy));
          }
          return res;
        })
        .catch(async () => {
          const exact = cacheable ? await caches.match(url.pathname) : null;
          if (exact) return exact;
          // Deep links and server-rendered pages fall back to the Today shell,
          // which renders the local (encrypted) data.
          return caches.match("/field");
        })
    );
  }
});
