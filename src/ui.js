// DOM UI: party portraits, the action bar, the initiative strip, quest tracker, banner, log, floating numbers,
// toasts and rich tooltips. Frames, icons and the font are all drawn by code (src/art/frames.js, icons.js, font.js).
import { G } from "./state.js";
import { makeCanvas } from "./util.js";
import { sfx } from "./audio.js";
import { worldToView } from "./persp.js";
import { icon } from "./art/icons.js";
import { key, isTouch } from "./input.js";

const $ = (s) => document.querySelector(s);

export function worldToScreen(x, y) {
  const [sx, sy] = worldToView(x, y);
  return [sx * G.scale, sy * G.scale];
}

export function floater(x, y, text, cls = "dmg") {
  const [sx, sy] = worldToScreen(x, y);
  const d = document.createElement("div");
  d.className = "fl " + cls;
  d.textContent = text;
  d.style.left = sx + (Math.random() * 16 - 8) + "px";
  d.style.top = sy + "px";
  $("#floaters").appendChild(d);
  setTimeout(() => d.remove(), 1400);
}

export function log(html, cls = "") {
  const el = $("#log");
  const d = document.createElement("div");
  d.className = cls;
  d.innerHTML = html;
  el.appendChild(d);
  while (el.children.length > 7) el.firstChild.remove();
}

let toastT;
export function toast(text, ms = 2200) {
  const t = $("#toast");
  t.textContent = text;
  t.classList.add("show");
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove("show"), ms);
}

let bannerT;
export function banner(text) {
  const b = $("#banner");
  b.querySelector("h1").textContent = text;
  b.classList.add("show");
  clearTimeout(bannerT);
  bannerT = setTimeout(() => b.classList.remove("show"), 3200);
}

// ---------- tooltips
let tipHold = 0, tipOff = 0;
/**
 * Show a tooltip (or hide it with null). `at` is where: nothing = by the mouse, an element = above it,
 * or { x, y } in screen pixels.
 */
export function tooltip(html, at = null) {
  const t = $("#tooltip");
  if (!at && performance.now() < tipHold) return; // a tooltip the keyboard asked for stays a moment
  clearTimeout(tipOff);
  if (!html) { t.style.display = "none"; return; }
  if (t._html !== html) { t.innerHTML = html; t._html = html; }
  t.style.display = "block";
  const w = t.offsetWidth, h = t.offsetHeight, m = 6;
  let x, y;
  if (at instanceof Element) { const r = at.getBoundingClientRect(); x = r.left + r.width / 2 - w / 2; y = r.top - h - m * 1.5; }
  else if (at) { x = at.x - w / 2; y = at.y - h - m * 3; }
  else if (isTouch()) { x = G.mouse.x - w / 2; y = G.mouse.y - h - 44; if (y < m) y = G.mouse.y + 40; } // above the finger, not under it
  else { x = G.mouse.x + 18; y = G.mouse.y + 14; }
  t.style.left = Math.max(m, Math.min(innerWidth - w - m, x)) + "px";
  t.style.top = Math.max(m, Math.min(innerHeight - h - m, y)) + "px";
  // a finger never "leaves" a button: a tooltip it opened goes away by itself
  if (isTouch() && at instanceof Element) tipOff = setTimeout(() => { t.style.display = "none"; }, 2600);
}

/** A tap on the field: whatever tooltip a button opened gives way to what the tap shows. */
export function releaseTip() { tipHold = 0; }

/** A rich tooltip: { icon, title, sub, tags: [[text, cls]], rows: [[label, value]], body, foot }. */
export function tipHTML(o) {
  return `<div class="th">${o.icon ? icon(o.icon) : ""}<div><b>${o.title}</b>${o.sub ? `<span>${o.sub}</span>` : ""}</div></div>`
    + (o.tags?.length ? `<div class="tags">${o.tags.map(([t, c]) => `<span class="tag ${c ?? ""}">${t}</span>`).join("")}</div>` : "")
    + (o.rows?.length ? `<div class="rows">${o.rows.map(([l, v]) => `<span>${l}</span><b>${v}</b>`).join("")}</div>` : "")
    + (o.body ? `<div class="body">${o.body}</div>` : "")
    + (o.foot ? `<div class="foot">${o.foot}</div>` : "");
}

const COST = { action: ["Ação", "action"], bonus: ["Ação bônus", "bonus"], free: ["Livre", "free"] };
/** The tooltip of an action-bar entry (an ability, or a plain shortcut). */
function slotTip(e, i) {
  const tags = [], rows = [];
  if (e.cost) tags.push(COST[e.cost]);
  if (e.slot) tags.push([`Espaço de magia (${e.count ?? 0})`, "slot"]);
  if (e.per) tags.push([e.per === "combat" ? "1× por combate" : "1× por descanso"]);
  if (e.cost && e.range != null) rows.push(["Alcance", e.range <= 0 ? "você" : e.range === 1 ? "corpo a corpo" : `${e.range} casas`]);
  if (e.dmg) rows.push(["Dano", e.dmg]);
  if (e.heal) rows.push(["Cura", e.heal]);
  return tipHTML({ icon: e.icon, title: e.name, tags, rows, body: e.desc, foot: e.off && e.why ? `<span class="bad">${e.why}</span>` : isTouch() ? (e.range > 0 ? "Agora toque no alvo" : null) : `${key(String(i + 1), "X")} usar` });
}

// ---------- party portraits
const cards = new Map();
function face(u, w = 26, h = 24) {
  const [c, ctx] = makeCanvas(w, h);
  ctx.drawImage(u.portrait, 0, 0, w, h);
  return c;
}
export function buildParty(onSelect) {
  const root = $("#party");
  root.innerHTML = "";
  cards.clear();
  G.party.forEach((p, i) => {
    const el = document.createElement("div");
    el.className = "pcard";
    el.innerHTML = `<div class="pf"><span class="lv"></span></div><div class="info"><div class="nm">${p.name}</div><span class="cls">${p.cls ?? ""}</span>
      <div class="hpt"><span class="hpv"></span><span class="ac"></span></div><div class="bar hp"><i></i></div><div class="bar xp"><i></i></div></div>`;
    el.querySelector(".pf").prepend(face(p));
    el.onclick = () => onSelect(i);
    root.appendChild(el);
    cards.set(p, el);
  });
  updateParty();
}
export function updateParty() {
  G.party.forEach((p, i) => {
    const el = cards.get(p);
    if (!el) return;
    el.querySelector(".hp i").style.width = (100 * Math.max(0, p.hp)) / p.maxHp + "%";
    el.querySelector(".hpv").innerHTML = `${icon("hp", "sm")} ${Math.max(0, p.hp)}/${p.maxHp}`;
    el.querySelector(".xp i").style.width = Math.min(100, (100 * p.xp) / p.nextXp) + "%";
    el.querySelector(".lv").textContent = p.level;
    el.querySelector(".ac").innerHTML = `${icon("ac", "sm")} ${p.ac}`;
    const active = G.mode === "combat" ? G.combat?.active === p : i === G.leader;
    el.classList.toggle("active", active);
    el.classList.toggle("down", p.hp <= 0);
  });
}

// ---------- quest tracker (the story says what the quests are)
export function updateQuest() {
  const qs = G.hooks.quests?.() ?? [];
  $("#quest").innerHTML = qs.map((q) => `<div class="q ${q.side ? "side" : ""}"><h3>${q.title}</h3>` + q.objs.map(([t, d]) => `<div class="obj ${d ? "done" : ""}">${t}</div>`).join("") + "</div>").join("");
}

// ---------- screen fades and title cards
/** Fade the whole screen to a colour (opacity 1) or back (0). */
export function fade(to, ms = 800, color = "#000") {
  const f = $("#fade");
  f.style.transition = `opacity ${ms}ms steps(${Math.max(2, Math.min(16, Math.round(ms / 60)))})`;
  if (to > 0) f.style.background = color;
  requestAnimationFrame(() => (f.style.opacity = to));
  return new Promise((r) => setTimeout(r, ms + 30));
}
/** Centered text over the screen, for title cards and narration in the dark. Empty hides it. */
export function cine(html, cls = "") {
  const c = $("#cine");
  c.className = cls;
  c.innerHTML = html;
  c.classList.toggle("show", !!html);
}

// ---------- the action bar
let bar = { entries: [], cur: 0 };
/**
 * entries: [{ icon, name, desc, off, sel, count, use, cost?, ... }]. opts: { who: unit shown on the left,
 * econ: html for the right-hand column, end: label of the end-turn button (with onEnd) }.
 */
export function buildHotbar(entries, opts = {}) {
  const hb = $("#hotbar");
  hb.innerHTML = "";
  bar.entries = entries;
  bar.cur = Math.min(bar.cur, Math.max(0, entries.length - 1));
  if (!entries.length) { tooltip(null); return; }
  if (opts.who) {
    const w = document.createElement("div");
    w.className = "who";
    w.appendChild(face(opts.who));
    w.insertAdjacentHTML("beforeend", `<div><b>${opts.who.name}</b><span>${opts.sub ?? ""}</span></div>`);
    hb.appendChild(w);
  }
  const slots = document.createElement("div");
  slots.className = "slots";
  entries.forEach((e, i) => {
    const s = document.createElement("div");
    s.className = "slot" + (e.off ? " off" : "") + (e.sel ? " sel" : "");
    s.innerHTML = `${icon(e.icon)}<span class="k">${i + 1}</span>${e.count != null ? `<span class="n">${e.count}</span>` : ""}${e.cost ? `<span class="cost ${e.cost}"></span>` : ""}`;
    s.onmousemove = () => tooltip(slotTip(e, i), s);
    s.onmouseleave = () => tooltip(null);
    s.onclick = (ev) => {
      ev.stopPropagation(); bar.cur = i;
      // a touch screen has no hover: a tap also says what the action does (or why it can't be used now)
      if (isTouch()) { const el = [...document.querySelectorAll("#hotbar .slot")][i]; if (el) { tooltip(slotTip(e, i), el); tipHold = performance.now() + 2500; } }
      if (!e.off) { sfx.click(); e.use(); }
    };
    slots.appendChild(s);
  });
  hb.appendChild(slots);
  if (opts.econ) hb.insertAdjacentHTML("beforeend", opts.econ);
  if (opts.end) {
    const b = document.createElement("button");
    b.id = "endturn"; b.className = "go";
    b.innerHTML = `${opts.end} ${key("Espaço", "Y")}`;
    b.onclick = (ev) => { ev.stopPropagation(); opts.onEnd(); };
    hb.appendChild(b);
  }
  markCur();
}
function markCur() {
  const keys = document.body.classList.contains("nav-keys") || document.body.classList.contains("dev-pad");
  document.querySelectorAll("#hotbar .slot").forEach((s, i) => s.classList.toggle("cur", keys && i === bar.cur));
}
/** Keyboard/pad: move the highlight along the bar and show that slot's tooltip. */
export function hotbarMove(dir) {
  if (!bar.entries.length) return;
  bar.cur = (bar.cur + dir + bar.entries.length) % bar.entries.length;
  markCur();
  const s = document.querySelectorAll("#hotbar .slot")[bar.cur];
  if (s) { tooltip(slotTip(bar.entries[bar.cur], bar.cur), s); tipHold = performance.now() + 2500; sfx.select(); }
}
export function hotbarUse(i = bar.cur) {
  const e = bar.entries[i];
  if (!e) return;
  bar.cur = i;
  tipHold = 0;
  tooltip(null);
  if (!e.off) { sfx.click(); e.use(); }
}

// ---------- initiative strip
export function updateInitiative() {
  const el = $("#initiative");
  const C = G.combat;
  el.innerHTML = "";
  if (!C) return;
  el.insertAdjacentHTML("beforeend", `<div class="round">Rodada<br>${Math.max(1, C.round)}</div>`);
  C.order.forEach((u) => {
    if (u.gone) return;
    const d = document.createElement("div");
    d.className = `ini ${u.team === "party" ? "party" : "enemy"} ${u === C.active ? "now" : ""} ${u.hp <= 0 ? "dead" : ""}`;
    d.appendChild(face(u));
    d.insertAdjacentHTML("beforeend", `<div class="hp"><i style="width:${(100 * Math.max(0, u.hp)) / u.maxHp}%"></i></div>`);
    el.appendChild(d);
  });
}

// ---------- "press E" over something in the world
let promptKey = "";
export function prompt(target, html) {
  const p = $("#prompt");
  if (!target) { if (promptKey) { p.classList.remove("show"); promptKey = ""; } return; }
  const [sx, sy] = worldToScreen(target.x, target.y - (target.h ?? 34) - 6);
  p.style.left = Math.round(sx) + "px"; p.style.top = Math.round(sy) + "px";
  if (promptKey !== html) { p.innerHTML = html; promptKey = html; p.classList.remove("show"); void p.offsetWidth; p.classList.add("show"); }
}

/** The body carries the game mode, so the stylesheet can hide what doesn't belong (the bar during a conversation...). */
let lastMode = "";
export function syncMode() {
  if (G.mode === lastMode) return;
  if (lastMode) document.body.classList.remove("mode-" + lastMode);
  document.body.classList.add("mode-" + G.mode);
  lastMode = G.mode;
}
