// HIZAYA PWA — App Shell cache pour GitHub Pages (sous-dossier)
const CACHE_NAME = "hizaya-cache-v10"; // ⬅️ incrémente la version à chaque déploiement
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./app.js",
  "./supabase-auth.js",
  "./favicon.ico",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png"
];

// Install: pré-cache l'app shell
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

// Activate: nettoie les anciens caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: 
// - navigation → offline fallback sur index.html
// - assets même origine → cache-first (stale-while-revalidate light)
// - le reste → réseau direct
self.addEventListener("fetch", (event) => {
  const req = event.request;

  // On ne gère que GET
  if (req.method !== "GET") return;

  // Navigations (SPA / PWA) → fallback index.html
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => caches.match("./index.html"))
    );
    return;
  }

  const url = new URL(req.url);

  // Seulement les ressources du même origin
  if (url.origin === self.location.origin) {
    // Si fait partie de l'app shell → cache d'abord, puis mise à jour en arrière-plan
    if (ASSETS.includes(url.pathname.replace(/^\//, "./"))) {
      event.respondWith(
        caches.match(req).then((cached) => {
          const fetchPromise = fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
            return res;
          }).catch(() => cached);
          return cached || fetchPromise;
        })
      );
      return;
    }
  }

  // Par défaut: réseau (laisser passer Tailwind CDN, MQTT.js, etc.)
  event.respondWith(fetch(req).catch(() => caches.match(req)));
});

