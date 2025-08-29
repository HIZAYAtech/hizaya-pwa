const CACHE = "hizaya-v1";
const ASSETS = ["./","./index.html","./app.js","./config.js","./manifest.json"];

self.addEventListener("install", e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));
});
self.addEventListener("activate", e=>{
  e.waitUntil(self.clients.claim());
});
self.addEventListener("fetch", e=>{
  const req = e.request;
  if (req.method !== "GET") return;
  e.respondWith(
    caches.match(req).then(cached=>{
      return cached || fetch(req).then(res=>{
        const copy = res.clone();
        caches.open(CACHE).then(c=>c.put(req, copy));
        return res;
      }).catch(()=> cached);
    })
  );
});
