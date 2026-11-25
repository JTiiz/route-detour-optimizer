// Only same-origin files are cached: external services always hit the network.
const CACHE = "detour-v2";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["./", "./manifest.webmanifest", "./icons/icon.svg"])));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith("detour-") && k !== CACHE).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  // Page loads share one entry, so shared places never end up in the cache.
  const key = e.request.mode === "navigate" ? "./" : e.request;
  const save = (res) => {
    if (res.ok) { const copy = res.clone(); e.waitUntil(caches.open(CACHE).then((c) => c.put(key, copy))); }
    return res;
  };
  // Hashed files never change; everything else is network first.
  if (url.pathname.includes("/assets/")) {
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then(save)));
  } else {
    e.respondWith(fetch(e.request).then(save).catch(async () => (await caches.match(key)) || Response.error()));
  }
});
