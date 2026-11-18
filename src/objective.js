// A discreet mark for the next step of the main quest: a small diamond over the place or person, and a pointer at the
// edge of the screen when it is off view. It follows the same steps as the quest tracker (story flags), only for the
// main quest, only while exploring, and it can be turned off in the options. It fades in after a while of exploring
// without progress, so it doesn't lead by the hand from the first second.
import { G, lead } from "./state.js";
import { TILE } from "./util.js";
import { worldToScreen } from "./ui.js";
import { icon } from "./art/icons.js";

export const markPrefs = { on: (() => { try { return localStorage.getItem("brumafolha.mark") !== "0"; } catch { return true; } })() };
export function setMarkOn(on) { markPrefs.on = on; try { localStorage.setItem("brumafolha.mark", on ? "1" : "0"); } catch { /* */ } }

let S = null;
export function initObjective(story) { S = story; }

const tile = (tx, ty) => ({ x: tx * TILE + 16, y: ty * TILE + 20 });
const npc = (key) => [...G.npcs, ...G.enemies].find((u) => u.key === key && !u.gone && !u.hidden);
const thing = (name) => S.interactables().find((i) => i.name.includes(name));
const obj = (id) => G.W.objects.find((o) => o.id === id);

/** Where the next step of the main quest is, on this map (null: nothing to point at here). */
export function target() {
  const F = G.f, map = G.W?.id;
  if (!F.awake) return null;
  if (!F.act1) {
    if (map === "vale") {
      if (F.escape && !F.escape_done) return tile(37, 26);
      if (F.escape) return null;
      if (!F.ruins_entered) return tile(20, 14);
      if (!F.clan) return npc("gorza") ?? tile(20, 11);
      if (!F.trapdoor_open) return (F.tome_met && !F.tome_home && npc("tome")) || thing("Coluna partida") || tile(24, 11);
      if (!F.relic_entered) return thing("Alçapão") ?? tile(24, 11);
      return null;
    }
    if (map === "relicario") {
      if (F.relic_collapse && !F.escape) return thing("Escada") ?? tile(11, 29);
      if (!F.door_open) return ["s1", "s2", "s3"].map(obj).find((o) => o && !o.lit) ?? null;
      if (!F.echo) return tile(11, 5);
      return null;
    }
    return null;
  }
  if (!F.ch1_done) {
    if (map === "vau") {
      if (!F.note) return npc("rosalva");
      if (!F.rested1) return obj("campfire");
      return tile(41, 12);
    }
    if (map === "travessia") {
      if (!F.hunters) return tile(36, 14);
      return npc("odara");
    }
    return null;
  }
  if (!F.c2_choice) {
    if (map === "vau") return tile(41, 12);
    if (map === "travessia") return thing("Trilha pelo sul") ?? tile(47, 15);
    if (map === "bosque") return tile(47, 18);
    if (map === "mosteiro") return F.hulda_joined ? tile(2, 15) : thing("Porta da cozinha");
    if (map === "claustro") {
      if (F.hulda_joined) return thing("Saída para o pátio");
      if (!F.c2_altar) return thing("Altar do Véu");
      return thing("Grades da cela") ?? tile(26, 6);
    }
  }
  return null;
}

let el = null, idle = 0, lastKey = "";
/** Every frame: place the mark (or hide it). */
export function tickObjective(dt) {
  el ??= document.getElementById("objmark");
  if (!el) return;
  const t = G.mode === "explore" && !G.paused && markPrefs.on ? target() : null;
  // progress (a new target) resets the wait: the mark shows up only after a while without one
  const k = t ? `${G.W.id}:${Math.round(t.x / TILE)},${Math.round(t.y / TILE)}` : "";
  const now = performance.now() / 1000;
  if (k !== lastKey) { lastKey = k; idle = now; }
  if (!t || now - idle < 25) { el.classList.add("hidden"); return; }
  const l = lead();
  if (l && Math.hypot(t.x - l.x, t.y - l.y) < 2.5 * TILE) { el.classList.add("hidden"); return; }
  const [sx, sy] = worldToScreen(t.x, t.y - 40);
  const m = 24, W = innerWidth, H = innerHeight;
  const off = sx < m || sy < m || sx > W - m || sy > H - m;
  const x = Math.max(m, Math.min(W - m, sx)), y = Math.max(m, Math.min(H - m, sy));
  el.classList.remove("hidden");
  el.classList.toggle("edge", off);
  el.style.left = x + "px"; el.style.top = y + "px";
  if (off) { const [lx, ly] = worldToScreen(l.x, l.y); el.style.setProperty("--a", Math.atan2(sy - ly, sx - lx) + "rad"); }
  if (!el.innerHTML) el.innerHTML = `<span class="dia"></span><span class="arrow">${icon("right", "sm")}</span>`;
}
