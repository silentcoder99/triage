/* Triage service worker.
 *
 * BUMP VERSION ON EVERY DEPLOY, and keep BUILD in index.html in step with it. This string is the only thing that tells a
 * browser a new build exists: it compares sw.js byte-for-byte, and if nothing
 * changed it keeps serving the old cache no matter what else you shipped.
 */
const VERSION = "2026.08.21-1";
const CACHE = "triage-" + VERSION;
const SHELL = ["./", "./index.html", "./manifest.json"];

self.addEventListener("install", (e) => {
  // No skipWaiting here — the page decides when to swap, so a sort in
  // progress is never pulled out from under the user.
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (e) => {
  if (!e.data) return;
  if (e.data.type === "SKIP_WAITING") self.skipWaiting();
  // Lets the page show which generation is actually serving it.
  if (e.data.type === "VERSION" && e.ports && e.ports[0]) {
    e.ports[0].postMessage({ version: VERSION });
  }
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  // The document is network-first: a deploy lands on the next load rather than
  // waiting a cache generation. Cache is the offline fallback.
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("./index.html", copy));
          return res;
        })
        .catch(() => caches.match("./index.html").then((hit) => hit || caches.match("./")))
    );
    return;
  }

  // Everything else is cache-first — it is all versioned with the worker.
  e.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res.ok && new URL(req.url).origin === self.location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      });
    })
  );
});
