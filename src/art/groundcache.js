// The valley's ground, kept between visits. Painting it is most of the loading, and it comes out the same every time,
// so after the first visit the finished picture is kept (a lossless PNG in IndexedDB) and the next visits only unpack
// it. The key is a hash of the code that paints it (this folder's ground.js, world.js, util.js): change that code and
// the kept picture is simply not found, so a stale ground can never show.
const DB = "brumafolha-cache", STORE = "ground";
const SOURCES = ["./ground.js", "../world.js", "../util.js"].map((p) => new URL(p, import.meta.url).href);

function db() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

/** The key for this version of the painting code, or null (then nothing is cached). */
export async function groundKey() {
  try {
    if (!crypto?.subtle) return null;
    const texts = await Promise.all(SOURCES.map((u) => fetch(u).then((r) => (r.ok ? r.text() : Promise.reject(new Error(r.status))))));
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texts.join("\u0000")));
    return "vale-" + [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch { return null; }
}

/** The kept ground for this key, as ImageData, or null. */
export async function loadGround(key, w, h) {
  try {
    const d = await db();
    const blob = await req(d.transaction(STORE).objectStore(STORE).get(key));
    d.close();
    if (!blob) return null;
    const bmp = await createImageBitmap(blob, { colorSpaceConversion: "none", premultiplyAlpha: "none" });
    if (bmp.width !== w || bmp.height !== h) return null;
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const x = c.getContext("2d", { willReadFrequently: true });
    x.drawImage(bmp, 0, 0);
    return x.getImageData(0, 0, w, h);
  } catch (e) {
    console.warn("[ground] cache ilegível, pintando de novo", e);
    return null;
  }
}

/** Keep the painted ground (the canvas it was drawn into) under this key; older versions are dropped. */
export async function saveGround(key, canvas) {
  try {
    const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
    if (!blob) return;
    const d = await db();
    const tx = d.transaction(STORE, "readwrite"), st = tx.objectStore(STORE);
    for (const k of await req(st.getAllKeys())) if (k !== key) st.delete(k);
    st.put(blob, key);
    await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    d.close();
  } catch (e) {
    console.warn("[ground] não foi possível guardar o chão", e);
  }
}
