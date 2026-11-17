// The service worker that makes Brumafolha an installable app that also plays offline.
// - Every file comes from the network first (so an update shows up on the next load) and is kept in a cache; with no
//   network, the cached copy is served. After the game has loaded once, the page hands over the list of everything it
//   loaded (main.js), so the whole game is in the cache from the first visit.
// - The icons the manifest asks for (icons/*.png) are not files: they are drawn here, by code, like the rest of the
//   game's art (src/art/appicon.js), and kept in the cache.
import { drawAppIcon } from "./src/art/appicon.js";

const CACHE = "brumafolha-v1";
const CORE = ["./", "index.html", "style.css", "manifest.webmanifest", "src/main.js"];
// icons/<name>.png → [size, maskable]
const ICONS = { "icon-192": [192, false], "icon-512": [512, false], "maskable-512": [512, true], "apple-touch-icon": [180, false], "favicon-32": [32, false] };

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

// the page's list of what it loaded: keep it all for offline play
self.addEventListener("message", (e) => {
  if (e.data?.type !== "precache" || !Array.isArray(e.data.urls)) return;
  const same = e.data.urls.filter((u) => { try { return new URL(u).origin === location.origin; } catch { return false; } });
  e.waitUntil(caches.open(CACHE).then(async (c) => {
    for (const u of same) if (!(await c.match(u, { ignoreSearch: true }))) await c.add(u).catch(() => {});
  }));
});

async function iconResponse(name) {
  const [size, maskable] = ICONS[name];
  const canvas = new OffscreenCanvas(size, size);
  drawAppIcon(canvas.getContext("2d"), size, maskable);
  const blob = await canvas.convertToBlob({ type: "image/png" });
  return new Response(blob, { headers: { "Content-Type": "image/png", "Cache-Control": "max-age=86400" } });
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  const icon = url.pathname.match(/\/icons\/([\w-]+)\.png$/);
  if (icon && ICONS[icon[1]]) {
    e.respondWith(caches.open(CACHE).then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await iconResponse(icon[1]);
      c.put(req, res.clone());
      return res;
    }));
    return;
  }
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    try {
      const res = await fetch(req);
      if (res.ok && res.type === "basic") c.put(req, res.clone());
      return res;
    } catch (err) {
      // offline: the cached copy (the game's page for any address inside it, e.g. ?dev=...)
      const hit = await c.match(req, { ignoreSearch: req.mode === "navigate" }) ?? (req.mode === "navigate" ? await c.match("index.html") : null);
      if (hit) return hit;
      throw err;
    }
  })());
});
