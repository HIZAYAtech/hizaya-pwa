// Cache simple pour le shell
const CACHE = "hizaya-cache-v2"; // bump la version si tu modifies
const ASSETS = [
  "./",
  "./index.html",
  "./app.js",
  "./manifest.json",
  // ajoute "icon-192.png", "icon-512.png", "apple-touch-icon.png", "favicon.ico" si présents
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
});
self.addEventListener("fetch", (e) => {
  e.respondWith(
    caches.match(e.request).then((r) => r || fetch(e.request))
  );
});
