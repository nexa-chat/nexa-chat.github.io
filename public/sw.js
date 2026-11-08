// Caches the app shell only, so NEXA opens offline. Provider requests are never touched,
// and no conversation or key ever passes through this cache.
//
// The site may live under a base path, such as /NEXA/ on GitHub Pages, so every path is
// read relative to this worker's scope.
const CACHE = "nexa-shell-v3";
const BASE = new URL(self.registration.scope).pathname.replace(/\/$/, "");
const CHAT = `${BASE}/chat`;

function isChat(pathname) {
  return pathname.replace(/\/$/, "") === CHAT;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // A static build serves /chat/, a server build /chat. Whichever answers is kept.
      .then((cache) => Promise.any([cache.add(`${CHAT}/`), cache.add(CHAT)]).catch(() => undefined))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith(`${BASE}/api/`)) return;

  if (url.pathname.startsWith(`${BASE}/_next/static/`)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
            return response;
          }),
      ),
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && isChat(url.pathname)) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(CHAT, copy));
          }
          return response;
        })
        .catch(() =>
          caches
            .match(CHAT)
            .then((cached) => cached ?? caches.match(`${CHAT}/`))
            .then((cached) => cached ?? Response.error()),
        ),
    );
  }
});
