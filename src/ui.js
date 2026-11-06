// DOM UI: party frames, hotbar, quest tracker, banner, log, floating numbers, toasts, tooltip.
import { G } from "./state.js";
import { makeCanvas } from "./util.js";
import { sfx } from "./audio.js";

const $ = (s) => document.querySelector(s);

export function worldToScreen(x, y) {
  return [(x - G.cam.x) * G.scale, (y - G.cam.y) * G.scale];
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
  while (el.children.length > 9) el.firstChild.remove();
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

export function tooltip(html) {
  const t = $("#tooltip");
  if (!html) { t.style.display = "none"; return; }
  t.innerHTML = html;
  t.style.display = "block";
  t.style.left = G.mouse.x + 18 + "px";
  t.style.top = G.mouse.y + 14 + "px";
}

// ---------- party frames
const cards = new Map();
export function buildParty(onSelect) {
  const root = $("#party");
  root.innerHTML = "";
  G.party.forEach((p, i) => {
    const el = document.createElement("div");
    el.className = "pcard";
    const [c, ctx] = makeCanvas(26, 24);
    ctx.drawImage(p.portrait, 0, 0, 26, 24);
    el.appendChild(c);
    el.insertAdjacentHTML("beforeend", `<div class="info"><div class="nm">${p.name}<span class="cls">${p.cls} · nv <b class="lv">${p.level}</b></span></div>
      <div class="bar hp"><i></i></div><div class="hpt"><span class="hpv"></span><span class="ac">CA ${p.ac}</span></div><div class="bar xp"><i></i></div></div>`);
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
    el.querySelector(".hpv").textContent = `${Math.max(0, p.hp)} / ${p.maxHp} PV`;
    el.querySelector(".xp i").style.width = Math.min(100, (100 * p.xp) / p.nextXp) + "%";
    el.querySelector(".lv").textContent = p.level;
    el.querySelector(".ac").textContent = `CA ${p.ac}`;
    const active = G.mode === "combat" ? G.combat?.active === p : i === G.leader;
    el.classList.toggle("active", active);
    el.classList.toggle("down", p.hp <= 0);
  });
}

// ---------- quest tracker
export function updateQuest() {
  const q = G.quest;
  const objs = [
    ["Fale com Maren no cais", q.stage > 0],
    ...(q.stage >= 1 ? [["Expulse os goblins das Ruínas de Velmoor", q.stage >= 2]] : []),
    ...(q.stage >= 1 && q.flags.patrolSeen !== undefined ? [["Patrulha goblin na estrada", !!q.flags.patrolDone]] : []),
    ...(q.stage >= 2 ? [["Volte para Maren", q.stage >= 3]] : []),
    ...(q.flags.grandson ? [["Procure o neto de Maren", !!q.flags.grandsonFound]] : []),
  ];
  $("#quest").innerHTML = `<h3>Goblins de Velmoor</h3>` + objs.map(([t, d]) => `<div class="obj ${d ? "done" : ""}">${t}</div>`).join("");
}

// ---------- hotbar
export function buildHotbar(entries, extra = "") {
  const hb = $("#hotbar");
  hb.innerHTML = "";
  entries.forEach((e, i) => {
    const s = document.createElement("div");
    s.className = "slot" + (e.off ? " off" : "") + (e.sel ? " sel" : "");
    s.innerHTML = `<span class="ic">${e.icon}</span><span class="k">${i + 1}</span>${e.count != null ? `<span class="n">${e.count}</span>` : ""}`;
    s.onmouseenter = () => { s._tip = true; };
    s.onmousemove = () => tooltip(`<b>${e.name}</b><br>${e.desc}`);
    s.onmouseleave = () => tooltip(null);
    s.onclick = (ev) => { ev.stopPropagation(); if (!e.off) { sfx.click(); e.use(); } };
    hb.appendChild(s);
  });
  if (extra) hb.insertAdjacentHTML("beforeend", extra);
}

// ---------- initiative strip
export function updateInitiative() {
  const el = $("#initiative");
  const C = G.combat;
  if (!C) { el.innerHTML = ""; return; }
  el.innerHTML = "";
  C.order.forEach((u) => {
    const d = document.createElement("div");
    d.className = `ini ${u.team === "party" ? "party" : "enemy"} ${u === C.active ? "now" : ""} ${u.hp <= 0 ? "dead" : ""}`;
    const [c, ctx] = makeCanvas(26, 24);
    ctx.drawImage(u.portrait, 0, 0, 26, 24);
    d.appendChild(c);
    d.insertAdjacentHTML("beforeend", `<div class="hp"><i style="width:${(100 * Math.max(0, u.hp)) / u.maxHp}%"></i></div>`);
    d.title = u.name;
    el.appendChild(d);
  });
}
