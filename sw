const CACHE = "hizaya-v1";
const ASSETS = [
  "/hizaya-pwa/",
  "/hizaya-pwa/index.html",
  "/hizaya-pwa/manifest.json"
];

self.addEventListener("install", e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));
});
self.addEventListener("fetch", e=>{
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
