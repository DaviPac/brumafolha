// The companions between the scenes: how much each one approves of the hero (and what that changes), the little
// notice when they like or dislike something, the lines they say over their heads when the party walks into a place
// or past something, the talks between them on the road, and the confrontation when one of them has had enough.
// What they say lives in companion-lines.js. Nothing here talks during a fight, a conversation or a scene.
import { G, lead } from "./state.js";
import { TILE, dist } from "./util.js";
import { worldToScreen } from "./ui.js";
import { sfx } from "./audio.js";
import { icon } from "./art/icons.js";
import { BARKS, WALKS, BOND, CONFRONT } from "./companion-lines.js";

const $ = (s) => document.querySelector(s);
export const COMPANIONS = ["kael", "lyra", "nix", "hulda"];
let K = null; // the story's kit: scene, lines, ask, say, F, interactables, zone
export function initCompanions(kit) {
  K = kit;
  G.hooks.checkHelp = checkHelp;
  G.hooks.refuses = (u) => !!u?.key && COMPANIONS.includes(u.key) && tier(u.key) <= -2;
}

// ---------------------------------------------------------------- approval
/** A companion in the party, able to talk (not someone fighting alongside for a moment). */
export const member = (key) => G.party.find((p) => p.key === key && !p.ai && !p.gone);
export const approval = (key) => G.approval[key] ?? 0;
/** -2 cold, -1 wary, 0 neutral, 1 close, 2 loyal. */
export function tier(key) {
  const v = approval(key);
  return v <= -4 ? -2 : v <= -1 ? -1 : v >= 6 ? 2 : v >= 3 ? 1 : 0;
}
/** Approval changes only for whoever is in the party to see it, and it shows: a face and a word, never a number. */
export function approve(key, n) {
  const u = member(key);
  if (!u || !n) return;
  G.approval[key] = approval(key) + n;
  notify(u, n);
}
function notify(u, n) {
  const box = $("#approve");
  if (!box) return;
  const el = document.createElement("div");
  el.className = "apn " + (n > 0 ? "up" : "down");
  const c = document.createElement("canvas");
  c.width = 26; c.height = 24;
  const x = c.getContext("2d"); x.imageSmoothingEnabled = false; x.drawImage(u.portrait, 0, 0, 26, 24);
  el.append(c);
  el.insertAdjacentHTML("beforeend", `<span>${icon(n > 0 ? "up" : "down", "sm")} ${u.name} ${n > 1 ? "gostou muito." : n > 0 ? "gostou." : n < -1 ? "não gostou nada." : "não gostou."}</span>`);
  box.appendChild(el);
  while (box.children.length > 4) box.firstChild.remove();
  setTimeout(() => el.classList.add("out"), 3600);
  setTimeout(() => el.remove(), 4200);
}
/** In a skill check: a companion who likes the hero lends a hand (+1), whoever rolls. Who, and how much. */
function checkHelp(roller) {
  const helpers = COMPANIONS.map(member).filter((u) => u && u !== roller && u.hp > 0 && tier(u.key) >= 1);
  if (!helpers.length) return null;
  const best = helpers.sort((a, b) => approval(b.key) - approval(a.key))[0];
  return { bonus: 1, who: best.name };
}
/** The Diário's page about the party: where each one stands, in words. */
export function bondPage() {
  const rows = COMPANIONS.map(member).filter(Boolean).map((u) => {
    const t = tier(u.key), B = BOND[u.key];
    const perks = [t >= 1 ? "ajuda nos seus testes (+1)" : t <= -2 ? "não ajuda nos seus testes" : null, t >= 1 ? "tem uma conversa para a fogueira" : null].filter(Boolean);
    return `<div class="bond t${t}"><canvas data-face="${u.key}" width="26" height="24"></canvas><div><b>${u.name}</b><p>${B[t + 2]}</p>${perks.length ? `<small>${perks.join(" · ")}</small>` : ""}</div></div>`;
  });
  return `<h2>O grupo</h2>${rows.length ? rows.join("") : `<p class="muted">Ninguém viaja com você ainda.</p>`}
    <p class="muted small">Eles reparam no que você escolhe, e no que você entrega à Arquivista.</p>`;
}
export function drawFaces(root) {
  root.querySelectorAll("canvas[data-face]").forEach((c) => { const u = member(c.dataset.face); if (!u) return; const x = c.getContext("2d"); x.imageSmoothingEnabled = false; x.drawImage(u.portrait, 0, 0, 26, 24); });
}

// ---------------------------------------------------------------- speech over heads
const bubbles = [];
/** A line over someone's head, for a while. Resolves when it fades. */
export function bubble(u, text, ms = 2200 + text.length * 42) {
  const el = document.createElement("div");
  el.className = "bubble";
  el.innerHTML = `<b>${u.name}</b> ${text}`;
  $("#bubbles")?.appendChild(el);
  const b = { u, el, t: ms / 1000 };
  bubbles.push(b);
  place(b);
  return new Promise((res) => { b.res = res; });
}
function place(b) {
  const [x, y] = worldToScreen(b.u.x, b.u.y - 40);
  b.el.style.left = x + "px"; b.el.style.top = y + "px";
}
export function clearBubbles() {
  for (const b of bubbles.splice(0)) { b.el.remove(); b.res?.(); }
}

// ---------------------------------------------------------------- what they say on the road
const calm = () => G.mode === "explore" && !G.paused && !K.inScene() && !K.busy();
let checkT = 0, walkT = 0, talking = null, zone = "";
/** Can this line be said now? Everyone it needs is in the party, its approval and flags hold. */
function fits(e) {
  if (G.barks.has(e.id)) return false;
  if (e.map && e.map !== G.W.id) return false;
  if (e.who && !e.who.every((k) => member(k))) return false;
  for (const [k, v] of Object.entries(e.min ?? {})) if (approval(k) < v) return false;
  for (const [k, v] of Object.entries(e.max ?? {})) if (approval(k) > v) return false;
  if (e.if && !e.if(K.F)) return false;
  return true;
}
/** The first variant whose speaker is in the party (an entry can be said by one of several companions). */
function variant(e) {
  if (!e.say) return e.lines;
  const v = e.say.find(([k]) => member(k) && (!e.need?.[k] || approval(k) >= e.need[k]));
  return v ? [v] : null;
}
async function run(e, lines) {
  talking = e;
  G.barks.add(e.id);
  for (const [k, text] of lines) {
    const u = k === "hero" ? G.hero : member(k);
    if (!u || !calm()) break;
    sfx.talk?.();
    await bubble(u, text);
    if (talking !== e) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  if (talking === e) talking = null;
  e.after?.(K.F);
  walkT = 0;
}
function near(e) {
  const l = lead();
  if (e.zone && e.zone !== zone) return false;
  if (e.at) { const [tx, ty, r = 3] = e.at; if (dist(l.x, l.y, tx * TILE + 16, ty * TILE + 16) > r * TILE) return false; }
  if (e.thing) { const t = K.interactables().find((i) => i.name.includes(e.thing)); if (!t || dist(l.x, l.y, t.x, t.y) > (e.r ?? 3) * TILE) return false; }
  return true;
}
/** Every frame: bubbles follow heads; while exploring, a line about the place, or a talk on the road. */
export function tickCompanions(dt) {
  for (let i = bubbles.length - 1; i >= 0; i--) {
    const b = bubbles[i];
    b.t -= dt;
    if (b.t <= 0 || G.mode !== "explore") { b.el.remove(); bubbles.splice(i, 1); b.res?.(); continue; }
    place(b);
    b.el.classList.toggle("fade", b.t < 0.4);
  }
  if (!G.party.length || !G.W) return;
  if (!calm()) { if (talking) { talking = null; clearBubbles(); } walkT = Math.max(0, walkT - dt); return; }
  confrontTick();
  if (talking) return;
  if ((checkT -= dt) > 0) return;
  checkT = 0.5;
  const l = lead();
  zone = K.zone();
  // a line about where they are, or what they pass by
  for (const e of BARKS) if (fits(e) && near(e)) { const ls = variant(e); if (ls) { run(e, ls); return; } }
  // a talk on the road: after a while of walking (or standing about), one that fits, in order
  if (l.moving || l.path?.length) walkT += 0.5; else walkT += 0.15;
  if (walkT < 55) return;
  for (const e of WALKS) if (fits(e) && near(e)) { const ls = variant(e); if (ls) { run(e, ls); return; } }
}
/** For the tests: say the next line that fits here right now, whatever the timers. */
export function forceBanter() { checkT = 0; walkT = 999; }
export const banterTalking = () => !!talking;

// ---------------------------------------------------------------- when approval runs out
function confrontTick() {
  for (const key of COMPANIONS) {
    if (!member(key) || tier(key) > -2 || K.F["confronto_" + key]) continue;
    K.F["confronto_" + key] = "pending";
    confront(key);
    return;
  }
}
async function confront(key) {
  const u = member(key), C = CONFRONT[key];
  await K.scene(async () => {
    K.look?.();
    await K.lines(C.lines.map((t) => [u, t]));
    const v = await K.ask(u, C.ask, [
      { label: C.mend, v: "mend" },
      { label: C.hold, v: "hold" },
    ]);
    K.F["confronto_" + key] = v;
    if (v === "mend") { G.approval[key] = approval(key) + 2; await K.say(u, C.mended); notify(u, 2); }
    else await K.say(u, C.held);
  });
}
