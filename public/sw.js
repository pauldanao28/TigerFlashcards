// Bump version to purge any previously cached bad responses
const STATIC_CACHE = "flashkado-static-v3";

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

// Opening the installed app (or any navigation) races the network against this
// timeout — whichever answers first wins. On a slow connection or a cold function,
// that caps "time to see something" instead of making every launch wait out however
// long the network takes; the network fetch keeps running in the background either
// way and refreshes the cache for next time, so a fast connection still always gets
// perfectly fresh HTML (the timeout only ever matters when the network is the
// slower of the two).
const NAV_TIMEOUT_MS = 900;

function navigateFast(event) {
  const { request } = event;
  const networkFetch = fetch(request).then((response) => {
    if (response.ok) {
      const clone = response.clone();
      event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone)));
    }
    return response;
  });
  // Keep the service worker alive for the background cache refresh even once we've
  // already answered from cache below.
  event.waitUntil(networkFetch.catch(() => {}));

  return new Promise((resolve) => {
    let done = false;
    const finish = (value) => { if (!done && value) { done = true; resolve(value); } };

    networkFetch.then(finish).catch(() => {});

    setTimeout(() => {
      if (done) return;
      // Nothing cached yet (e.g. first-ever visit) just keeps waiting on networkFetch above.
      caches.match(request).then(finish);
    }, NAV_TIMEOUT_MS);

    // Network failed outright (offline) and nothing resolved yet — last resort.
    networkFetch.catch(() => {
      if (done) return;
      caches.match(request).then((cached) => { done = true; resolve(cached ?? Response.error()); });
    });
  });
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.mode === "navigate") {
    event.respondWith(navigateFast(event));
    return;
  }

  // API calls always wait for the network — their response is never static HTML/
  // assets, so there's nothing stale-but-useful to race against.
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(request).catch(() => caches.match(request).then(r => r ?? Response.error()))
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
    fetch(request).catch(() => caches.match(request).then(r => r ?? Response.error()))
  );
});
