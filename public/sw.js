// Bump version to purge any previously cached bad responses
const STATIC_CACHE = "flashkado-static-v2";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== STATIC_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Always network-first for navigation (HTML pages) and API calls.
  // This ensures the browser always gets fresh HTML with correct asset hashes
  // after a new Vercel deploy, preventing stale CSS/JS references.
  if (request.mode === "navigate" || url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(request).catch(() => caches.match(request))
    );
    return;
  }

  // Cache-first for Next.js static chunks — content-hashed and immutable.
  // Only cache successful responses to avoid persisting 404s from deploy transitions.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Network-first for everything else (fonts, public assets, etc.)
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});
