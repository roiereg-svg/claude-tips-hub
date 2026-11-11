/* service worker: שומר את קבצי האפליקציה כדי שתיפתח גם בלי אינטרנט.
   כשמשנים קבצים, מעלים את מספר הגרסה כאן. */
const VERSION = "v16";
const CACHE = "claude-tips-hub-" + VERSION;
const SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./tips-data.js",
  "./manifest.webmanifest",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// קודם מהרשת (תמיד הגרסה העדכנית, בלי מטמון ביניים של הדפדפן), ואם אין רשת: מהמטמון
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      try {
        const res = await fetch(req, { cache: "no-cache" });
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      } catch (e) {
        const cached = await cache.match(req, { ignoreSearch: true });
        if (cached) return cached;
        throw e;
      }
    })
  );
});
