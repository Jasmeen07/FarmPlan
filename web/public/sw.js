/**
 * web/public/sw.js
 * Service Worker for FarmPlan v2 (Offline PWA)
 * Caches app shell, styles, and JSON data files so the app works in airplane mode.
 */

const CACHE_NAME = "farmplan-v2-cache-v1";
const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./src/style.css",
  "./src/main.js",
  "./src/i18n.js",
  "./src/state.js",
  "./src/stage.js",
  "./src/rules.js",
  "./src/dsrGate.js",
  "./src/cost.js",
  "./data/districts.json",
  "./data/varieties.json",
  "./data/rules.json",
  "./data/cost_defaults.json",
  "./data/season_config.json",
  "./data/strings.en.json",
  "./data/strings.pa.json",
  "./data/strings.hi.json",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((k) => {
          if (k !== CACHE_NAME) return caches.delete(k);
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  // Stale-while-revalidate: serve from cache first, update in background
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const fetchPromise = fetch(e.request)
        .then((networkRes) => {
          if (networkRes && networkRes.status === 200 && e.request.method === "GET") {
            const resClone = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(e.request, resClone);
            });
          }
          return networkRes;
        })
        .catch(() => cached);

      return cached || fetchPromise;
    })
  );
});
