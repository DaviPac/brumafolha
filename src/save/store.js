// Where saves live: IndexedDB, two stores. "meta" holds one small record per save (what the lists show); "data" holds
// the save itself. A save is never written over in place:
//   1. the new data goes in under a new key, with its SHA-256;
//   2. it is read back and the hash checked;
//   3. in one transaction, the save's record points at the new data and keeps the previous one as its backup;
//   4. only then the generation before that is deleted.
// A tab closed halfway leaves, at worst, an orphan record (cleaned on the next start); the save still points at a
// whole one. Loading checks the hash and falls back to the backup. Without IndexedDB (some private modes) it falls
// back to localStorage, and says so.

const DB = "brumafolha-saves", VER = 1;
let dbp = null, fallback = false;

function openDB() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    let req;
    try { req = indexedDB.open(DB, VER); } catch (e) { rej(e); return; }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "id" });
      if (!db.objectStoreNames.contains("data")) db.createObjectStore("data", { keyPath: "key" });
    };
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
    req.onblocked = () => rej(new Error("banco de saves bloqueado por outra aba"));
  }).catch((e) => { console.warn("[save] sem IndexedDB, usando localStorage", e); fallback = true; return null; });
  return dbp;
}
export const usingFallback = () => fallback;

const done = (tx) => new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error ?? new Error("transação abortada")); });
const reqP = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

// ---- the localStorage fallback: same shape, one key per record
const LS = "brumafolha.save.";
const ls = {
  get(store, key) { try { const v = localStorage.getItem(LS + store + "." + key); return v == null ? undefined : JSON.parse(v); } catch { return undefined; } },
  put(store, rec) { localStorage.setItem(LS + store + "." + (rec.id ?? rec.key), JSON.stringify(rec)); },
  del(store, key) { localStorage.removeItem(LS + store + "." + key); },
  all(store) {
    const out = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(LS + store + ".")) try { out.push(JSON.parse(localStorage.getItem(k))); } catch { /* a broken record is skipped */ }
    }
    return out;
  },
};

async function get(store, key) {
  const db = await openDB();
  if (!db) return ls.get(store, key);
  return reqP(db.transaction(store).objectStore(store).get(key));
}
async function all(store) {
  const db = await openDB();
  if (!db) return ls.all(store);
  return reqP(db.transaction(store).objectStore(store).getAll());
}

export async function sha256(text) {
  if (!crypto?.subtle) return "x" + text.length; // not a secure context: a length check is better than nothing
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Only one tab writes at a time. */
const locked = (fn) => (navigator.locks ? navigator.locks.request("brumafolha-save", fn) : fn());

const newKey = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * Write a save. `meta.id` names the slot (an existing id overwrites that save, keeping the old data as its backup).
 * Resolves with the stored meta record; throws with a readable message if anything fails (nothing is lost then).
 */
export async function writeSave(meta, data) {
  const text = typeof data === "string" ? data : JSON.stringify(data);
  const hash = await sha256(text);
  const key = newKey();
  return locked(async () => {
    const db = await openDB();
    try { await navigator.storage?.persist?.(); } catch { /* best effort */ }
    const old = await get("meta", meta.id);
    const rec = { ...meta, dataKey: key, hash, backupKey: old?.dataKey ?? null, backupHash: old?.hash ?? null, bytes: text.length };
    const stale = old?.backupKey; // two generations back: goes once the new one is safe
    try {
      if (!db) {
        ls.put("data", { key, text, hash });
        if (ls.get("data", key)?.hash !== hash) throw new Error("a cópia gravada não confere");
        ls.put("meta", rec);
        if (stale) ls.del("data", stale);
        return rec;
      }
      let tx = db.transaction("data", "readwrite");
      tx.objectStore("data").put({ key, text, hash });
      await done(tx);
      const back = await get("data", key);
      if (!back || back.text !== text || (await sha256(back.text)) !== hash) throw new Error("a cópia gravada não confere");
      tx = db.transaction(["meta", "data"], "readwrite");
      tx.objectStore("meta").put(rec);
      if (stale) tx.objectStore("data").delete(stale);
      await done(tx);
      return rec;
    } catch (e) {
      // undo the half-written data; the slot still points at what it had
      try { if (db) { const t = db.transaction("data", "readwrite"); t.objectStore("data").delete(key); await done(t); } else ls.del("data", key); } catch { /* fine */ }
      throw new Error(quota(e) ? "Não há espaço para salvar. Apague saves antigos e tente de novo." : `Não foi possível salvar: ${e.message ?? e}`);
    }
  });
}
const quota = (e) => e?.name === "QuotaExceededError" || /quota/i.test(e?.message ?? "");

/** Every save's record (no data), newest first. */
export async function listSaves() {
  const list = (await all("meta")) ?? [];
  return list.sort((a, b) => (b.gravadoEm ?? "").localeCompare(a.gravadoEm ?? ""));
}
export const getMeta = (id) => get("meta", id);

/**
 * Read a save's data, checked. Falls back to the backup when the main copy is missing or damaged.
 * Resolves { data (parsed), fromBackup, meta }; throws when neither copy is usable.
 */
export async function readSave(id, { preferBackup = false } = {}) {
  const meta = await get("meta", id);
  if (!meta) throw new Error("Este save não existe mais.");
  const tries = preferBackup ? [["backupKey", "backupHash", true]] : [["dataKey", "hash", false], ["backupKey", "backupHash", true]];
  let why = "";
  for (const [k, h, isBackup] of tries) {
    if (!meta[k]) continue;
    try {
      const rec = await get("data", meta[k]);
      if (!rec) { why = "dados não encontrados"; continue; }
      if ((await sha256(rec.text)) !== meta[h]) { why = "dados danificados"; continue; }
      return { data: JSON.parse(rec.text), fromBackup: isBackup, meta };
    } catch (e) { why = e.message; }
  }
  throw new Error(`Não foi possível ler este save (${why || "sem cópia de segurança"}).`);
}

export async function deleteSave(id) {
  return locked(async () => {
    const meta = await get("meta", id);
    if (!meta) return;
    const db = await openDB();
    if (!db) { ls.del("meta", id); for (const k of [meta.dataKey, meta.backupKey]) if (k) ls.del("data", k); return; }
    const tx = db.transaction(["meta", "data"], "readwrite");
    tx.objectStore("meta").delete(id);
    for (const k of [meta.dataKey, meta.backupKey]) if (k) tx.objectStore("data").delete(k);
    await done(tx);
  });
}

/** Data no save points at any more (a write interrupted by a closed tab). Run once at start. */
export async function cleanOrphans() {
  try {
    await locked(async () => {
      const metas = (await all("meta")) ?? [], used = new Set(metas.flatMap((m) => [m.dataKey, m.backupKey]).filter(Boolean));
      const db = await openDB();
      const keys = db ? await reqP(db.transaction("data").objectStore("data").getAllKeys()) : ls.all("data").map((r) => r.key);
      const orphans = keys.filter((k) => !used.has(k));
      if (!orphans.length) return;
      if (!db) { orphans.forEach((k) => ls.del("data", k)); return; }
      const tx = db.transaction("data", "readwrite");
      orphans.forEach((k) => tx.objectStore("data").delete(k));
      await done(tx);
    });
  } catch (e) { console.warn("[save] limpeza", e); }
}
