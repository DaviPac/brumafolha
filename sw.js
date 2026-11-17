// The service worker that makes Brumafolha an installable app that also plays offline.
// - Every file comes from the network first (so an update shows up on the next load) and is kept in a cache; with no
//   network, the cached copy is served. After the game has loaded once, the page hands over the list of everything it
//   loaded (src/update.js), so the whole game is in the cache from the first visit.
// - The icons the manifest asks for (icons/*.png) are not files: they are drawn here, by code, like the rest of the
//   game's art (src/art/appicon.js), and kept in the cache.
// - Updates: this worker imports src/version.js, so raising VERSION there makes the browser install a new worker
//   (the page checks for one at load, every half hour and when it comes back to the screen). The new one fills its own
//   cache with fresh copies of everything the old one kept, takes over at once, and the page moves to the new version
//   at a safe moment (src/update.js).
import { drawAppIcon } from "./src/art/appicon.js";
import { VERSION } from "./src/version.js";

const CACHE = `brumafolha-${VERSION}`;
const CORE = ["./", "index.html", "style.css", "manifest.webmanifest", "src/main.js"];
// icons/<name>.png → [size, maskable]
const ICONS = { "icon-192": [192, false], "icon-512": [512, false], "maskable-512": [512, true], "apple-touch-icon": [180, false], "favicon-32": [32, false] };

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // everything the previous version kept, fetched again (fresh) for this one, so the update also plays offline
    const urls = new Set(CORE.map((u) => new URL(u, location.href).href));
    for (const k of await caches.keys()) {
      if (k === CACHE || !k.startsWith("brumafolha-")) continue;
      for (const r of await (await caches.open(k)).keys()) if (!/\/icons\//.test(r.url)) urls.add(r.url);
    }
    await Promise.all([...urls].map((u) => fetch(u, { cache: "reload" }).then((r) => r.ok && c.put(u, r)).catch(() => {})));
    await self.skipWaiting();
  })());
});
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener("message", (e) => {
  // the page asks which version this worker is
  if (e.data?.type === "version") { e.ports[0]?.postMessage(VERSION); return; }
  // the page's list of what it loaded: keep it all for offline play
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
      // past the browser's own cache too, so a new version's files are never served stale (pages revalidate anyway)
      const res = await fetch(req, req.mode === "navigate" ? undefined : { cache: "no-cache" });
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
