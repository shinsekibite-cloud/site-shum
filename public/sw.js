const CACHE = "sochi-shell-v37-audit";
const PRECACHE = [
  "/manifest.webmanifest",
  "/offline.html",
  "/brand/logo.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
  "/offline-games/",
  "/offline-games/index.html",
  "/offline-games/snake.html",
  "/offline-games/tetris.html",
  "/offline-games/checkers.html",
  "/offline-games/games.css",
  "/offline-games/scores.js",
];

const NEVER_CACHE = [
  "/admin",
  "/dashboard",
  "/scanner",
  "/login",
  "/register",
  "/auth",
  "/games",
];

function shouldBypass(pathname) {
  return NEVER_CACHE.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
}

/** Next RSC / flight — must never get offline.html or opaque SW errors. */
function isNextDataRequest(request, url) {
  if (url.searchParams.has("_rsc")) return true;
  const dest = request.destination;
  if (dest === "document" && request.mode !== "navigate") {
    /* keep checking headers */
  }
  try {
    if (request.headers.get("RSC") === "1") return true;
    if (request.headers.get("Next-Router-Prefetch") === "1") return true;
    if (request.headers.get("Next-Router-State-Tree")) return true;
    const accept = request.headers.get("Accept") || "";
    if (accept.includes("text/x-component")) return true;
  } catch {
    /* ignore */
  }
  return false;
}

function offlinePage() {
  return caches.match("/offline.html").then(
    (cached) =>
      cached ||
      new Response("Офлайн", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      })
  );
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).catch(() => undefined)
  );
});

self.addEventListener("message", (event) => {
  const data = event?.data;
  if (data === "SKIP_WAITING" || data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;

  const path = url.pathname;

  /* Never intercept API / Next data / RSC — substituting offline.html caused
     "Failed to convert value to Response", Failed to fetch, and hung navigations. */
  if (
    path.startsWith("/api/") ||
    path.startsWith("/_next/data/") ||
    isNextDataRequest(req, url)
  ) {
    return;
  }

  if (shouldBypass(path)) {
    /* Only soft-fallback for full navigations — never for prefetch/XHR. */
    if (req.mode === "navigate") {
      event.respondWith(fetch(req).catch(() => offlinePage()));
    }
    return;
  }

  if (path.startsWith("/offline-games") || path === "/offline.html") {
    event.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req)
          .then((res) => {
            if (res.ok && res.status === 200 && res.type !== "opaque") {
              const copy = res.clone();
              caches.open(CACHE).then((c) => {
                c.put(req, copy).catch(() => undefined);
              });
            }
            return res;
          })
          .catch(() => cached || offlinePage());
        return cached || network;
      })
    );
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && path.startsWith("/games")) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then((c) => c || offlinePage()))
    );
    return;
  }

  if (path.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(req).then(
        (cached) =>
          cached ||
          fetch(req).then((res) => {
            if (res.ok && res.status === 200 && res.type !== "opaque") {
              const copy = res.clone();
              caches.open(CACHE).then((c) => {
                c.put(req, copy).catch(() => undefined);
              });
            }
            return res;
          })
      )
    );
    return;
  }

  if (path.startsWith("/_next/")) {
    event.respondWith(fetch(req));
    return;
  }

  if (path.startsWith("/brand/") || path.startsWith("/covers/")) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req)
          .then((res) => {
            if (res.ok && res.status === 200 && res.type !== "opaque") {
              const copy = res.clone();
              caches.open(CACHE).then((c) => {
                c.put(req, copy).catch(() => undefined);
              });
            }
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  if (
    path.startsWith("/icons/") ||
    path.startsWith("/uploads/") ||
    /\.(png|jpg|jpeg|webp|svg|ico|woff2?)$/i.test(path)
  ) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req)
          .then((res) => {
            if (res.ok && res.status === 200 && res.type !== "opaque") {
              const copy = res.clone();
              caches.open(CACHE).then((c) => {
                c.put(req, copy).catch(() => undefined);
              });
            }
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  /* Default: network only — do not invent 503/504 for soft navigations / RSC leftovers. */
  event.respondWith(fetch(req));
});

/** Web Push → system tray notification */
self.addEventListener("push", (event) => {
  let data = {
    title: "Уведомление",
    body: "",
    url: "/dashboard",
    tag: "yp-notif",
  };
  try {
    if (event.data) {
      const parsed = event.data.json();
      data = Object.assign({}, data, parsed);
    }
  } catch (e) {
    try {
      const text = event.data && event.data.text();
      if (text) data.body = text;
    } catch (e2) {
      /* ignore */
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title || "Уведомление", {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-32.png",
      tag: data.tag || "yp-notif",
      renotify: true,
      data: { url: data.url || "/dashboard" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const raw =
    (event.notification && event.notification.data && event.notification.data.url) ||
    "/dashboard";
  const url = raw.indexOf("http") === 0 ? raw : new URL(raw, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url.indexOf(self.location.origin) === 0 && "focus" in client) {
          if (typeof client.navigate === "function") {
            return client.navigate(url).then(function (c) {
              return c && c.focus ? c.focus() : client.focus();
            });
          }
          return client.focus().then(function () {
            client.postMessage({ type: "YP_NAVIGATE", url: raw });
          });
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});

self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const old = event.oldSubscription;
        if (!old || !old.options || !old.options.applicationServerKey) return;
        const sub = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: old.options.applicationServerKey,
        });
        await fetch("/api/user/push", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(sub.toJSON()),
          credentials: "include",
        });
      } catch (e) {
        console.warn("pushsubscriptionchange", e);
      }
    })()
  );
});
