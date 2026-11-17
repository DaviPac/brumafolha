// Automatic updates and the patch notes ("Novidades").
//
// sw.js caches the game for offline play and imports src/version.js. When a new version is published, the browser
// installs a new worker in the background (checked at load, every half hour and when the game comes back to the
// screen) and it takes over at once. This page then still runs the old code, so it moves to the new one by itself at
// a safe moment: right away on the title screen; in a game, while exploring with nothing going on, after an automatic
// save that the reload loads again, so the player carries on from the same spot. Nothing is ever lost mid-fight,
// mid-conversation or mid-scene: those wait. After the move, the notes of what changed are shown once.
import { G } from "./state.js";
import { VERSION, NOTES, cmpVersion } from "./version.js";
import * as UI from "./ui.js";
import { focusDefault } from "./input.js";

const SEEN = "brumafolha.version"; // the last version whose notes the player has seen
const CHECK_EVERY = 30 * 60 * 1000;
let E = null; // main.js: { safe(): bool, saveAndReload(onFail) }
let reg = null, next = null, moving = false, notesWasPaused = false;

/** Ask a worker which version it is (null if it doesn't answer). */
function workerVersion(sw) {
  return new Promise((res) => {
    if (!sw) return res(null);
    const ch = new MessageChannel();
    const t = setTimeout(() => res(null), 3000);
    ch.port1.onmessage = (e) => { clearTimeout(t); res(e.data); };
    sw.postMessage({ type: "version" }, [ch.port2]);
  });
}

/** A worker of a newer version is in charge: move to it at the next safe moment. */
async function check() {
  const v = await workerVersion(navigator.serviceWorker.controller);
  if (!v || cmpVersion(v, VERSION) <= 0 || next === v) return;
  next = v;
  if (G.mode !== "title") UI.toast(`Versão ${v} baixada: o jogo se atualiza no próximo momento tranquilo.`, 4200);
}

export function initUpdates(engine) {
  E = engine;
  if (!("serviceWorker" in navigator) || location.protocol === "file:") return;
  navigator.serviceWorker.addEventListener("controllerchange", check);
  addEventListener("load", async () => {
    try {
      // updateViaCache "none": the browser's cache never hides a new sw.js or version.js
      reg = await navigator.serviceWorker.register("sw.js", { type: "module", updateViaCache: "none" });
      const ready = await navigator.serviceWorker.ready;
      // everything this page loaded (modules, styles) goes to the cache, so the next visit works without network
      ready.active?.postMessage({ type: "precache", urls: [location.href, ...performance.getEntriesByType("resource").map((r) => r.name)] });
      check();
      setInterval(() => reg.update().catch(() => {}), CHECK_EVERY);
      document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") reg.update().catch(() => {}); });
    } catch (err) {
      console.warn("Sem service worker: o jogo funciona, mas não offline nem com atualização automática.", err);
    }
  });
}

/** Every frame (main.js): move to a downloaded version when the moment allows. */
export function tickUpdate() {
  if (!next || moving || newsOpen()) return;
  if (G.mode === "title") {
    moving = true;
    UI.fade(1, 300).then(() => location.reload());
    return;
  }
  if (!E.safe()) return;
  moving = true;
  UI.toast(`Atualizando para a versão ${next}…`, 3000);
  E.saveAndReload(() => { moving = false; }); // if the save fails, try again at the next safe moment
}

// ---------------------------------------------------------------- the patch notes
export const newsOpen = () => !document.getElementById("news").classList.contains("hidden");

/**
 * Show the notes. `since`: only the versions newer than it (after an update); none: every version (from the menus).
 */
export function openNotes(since = null) {
  const list = NOTES.filter((n) => !since || cmpVersion(n.version, since) > 0);
  if (!list.length) return;
  const el = document.getElementById("news");
  const fmt = (d) => d.split("-").reverse().join("/");
  el.innerHTML = `<div class="box fr fr-panel">
    <h1>${since ? "Atualizado!" : "Novidades"}</h1>
    <p class="sub">${since ? `Brumafolha agora está na versão <b>${VERSION}</b>. O que mudou:` : `Versão atual: <b>${VERSION}</b>`}</p>
    <div class="list">${list.map((n) => `<section><h3>${n.title} <span>v${n.version} · ${fmt(n.date)}</span></h3><ul>${n.items.map((i) => `<li>${i}</li>`).join("")}</ul></section>`).join("")}</div>
    <div class="row"><button class="go" data-default>Continuar</button></div>
  </div>`;
  el.querySelector("button").onclick = closeNotes;
  el.classList.remove("hidden");
  notesWasPaused = G.paused;
  if (G.mode !== "title") G.paused = true; // the world waits while reading
  focusDefault(el, true);
}
export function closeNotes() {
  const el = document.getElementById("news");
  if (el.classList.contains("hidden")) return;
  el.classList.add("hidden");
  if (G.mode !== "title") G.paused = notesWasPaused;
  try { localStorage.setItem(SEEN, VERSION); } catch { /* private mode */ }
}

/**
 * At boot: the notes of a version the player hasn't seen yet. The very first time the game is opened there is
 * nothing to tell, so it only remembers the version.
 */
export function showNewNotes() {
  let seen = null;
  try { seen = localStorage.getItem(SEEN); } catch { return; }
  if (!seen) {
    // someone who played before the notes existed (the opening was seen) still hears about this version
    let played = false;
    try { played = !!localStorage.getItem("brumafolha.opening"); localStorage.setItem(SEEN, VERSION); } catch { /* private mode */ }
    if (played && NOTES[1]) setTimeout(() => openNotes(NOTES[1].version), 600);
    return;
  }
  if (cmpVersion(seen, VERSION) < 0) setTimeout(() => openNotes(seen), 600);
}
