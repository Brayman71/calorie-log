/* Offline support. The app itself is cached on install; the barcode reader, fonts and Claude SDK
   (loaded from CDNs) are cached the first time they're used. Food and Claude API calls are never cached. */
const VERSION="calorie-log-v8";
const SHELL=[
  "./", "index.html", "manifest.webmanifest", "css/app.css",
  "js/util.js","js/store.js","js/foods.js","js/fastfood.js","js/recipes.js","js/recipes-popular.js","js/plan-math.js","js/planner.js","js/foodapi.js","js/scanner.js","js/claude.js",
  "js/ui.js","js/today.js","js/addfood.js","js/plan-ui.js","js/progress.js","js/me.js","js/app.js",
  "icons/icon-180.png","icons/icon-192.png","icons/icon-512.png","icons/maskable-512.png"
];
const CDN_HOSTS=["cdn.jsdelivr.net","fastly.jsdelivr.net","fonts.googleapis.com","fonts.gstatic.com"];

self.addEventListener("install", e=>{
  e.waitUntil(caches.open(VERSION).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()));
});
self.addEventListener("activate", e=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==VERSION && k!=="calorie-log-cdn").map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});

self.addEventListener("fetch", e=>{
  const req=e.request;
  if (req.method!=="GET") return;
  const url=new URL(req.url);

  // The app's own files: network first so updates show up, cache when offline.
  if (url.origin===location.origin){
    e.respondWith(
      fetch(req).then(res=>{
        if (res.ok){ const copy=res.clone(); caches.open(VERSION).then(c=>c.put(req, copy)); }
        return res;
      }).catch(()=>caches.match(req, {ignoreSearch:true}).then(r=>r || (req.mode==="navigate"? caches.match("index.html") : Response.error())))
    );
    return;
  }
  // Libraries and fonts from CDNs: versioned URLs, so cache first.
  if (CDN_HOSTS.includes(url.hostname)){
    e.respondWith(caches.open("calorie-log-cdn").then(async c=>{
      const hit=await c.match(req); if (hit) return hit;
      const res=await fetch(req);
      if (res.ok || res.type==="opaque") c.put(req, res.clone());
      return res;
    }));
  }
  // Everything else (Open Food Facts, USDA, Anthropic) goes straight to the network.
});
