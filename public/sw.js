// Polla Mundial service worker.
// Provides installability (a fetch handler is required for the install prompt)
// and a light network-first cache so the app shell loads when offline.
const CACHE = "polla-mundial-v2";
const APP_SHELL = ["/dashboard", "/login", "/manifest.webmanifest", "/icon-192x192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin GETs. Let Firebase/Google/cross-origin requests
  // (auth, Firestore) pass straight through to the network.
  if (request.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        // Don't cache /api/* (e.g. /api/matches): the match list must always
        // come from the network, otherwise the SW serves stale results (matches
        // that already finished still showing as live). The rest — the app
        // shell — is cached for offline resilience.
        if (!url.pathname.startsWith("/api/")) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
        }
        return response;
      })
      .catch(() =>
        caches.match(request).then((cached) => cached || caches.match("/dashboard"))
      )
  );
});

// ---- Web push (FCM) ----
// The Cloud Function sends DATA-only messages (title/body/url under `data`, no
// top-level `notification`), so the browser does not auto-display anything and
// we render a single, controlled notification here. Reading both `payload.data`
// and `payload.notification` keeps us robust to either message shape.
self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = {};
  }

  const data = payload.data || {};
  const notif = payload.notification || {};
  const title = data.title || notif.title || "Polla Mundial ⚽";
  const options = {
    body: data.body || notif.body || "",
    icon: "/icon-192x192.png",
    badge: "/icon-192x192.png",
    // `tag` collapses repeats of the same event (e.g. one match) into one bubble.
    tag: data.tag || undefined,
    data: { url: data.url || "/dashboard" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Tapping a notification focuses an open tab (navigating it to the target) or
// opens a new one.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/dashboard";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          if ("navigate" in client) client.navigate(url).catch(() => {});
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
