// The Diário: the bag (items you can read), the quests with their notes, and the Diário de Lembranças.
// Opening it pauses the game.
import { G } from "./state.js";
import { sfx } from "./audio.js";
import { derive, weaponProficient, armorAllowed, shieldAllowed, signed } from "./rules.js";
import { WEAPONS, ARMORS, SHIELDS, ARMOR_CAT_NAMES, itemDef, weaponLine } from "./items.js";

const $ = (s) => document.querySelector(s);
const TABS = [["bag", "🎒 Bolsa"], ["gear", "⚔️ Equipamento"], ["quests", "📖 Missões"], ["memories", "🍃 Lembranças"]];
let tab = "bag", open = false, reading = null, who = 0, err = "";

export const journalOpen = () => open;

export function openJournal(t = tab) {
  if (G.mode === "title" || G.mode === "create" || G.mode === "over") return;
  tab = t; open = true; reading = null;
  G.paused = true;
  render();
  $("#journal").classList.remove("hidden");
  sfx.select();
}
export function closeJournal() {
  if (!open) return;
  open = false;
  G.paused = false;
  $("#journal").classList.add("hidden");
  sfx.click();
  G.hooks.journalClosed?.();
}
export const toggleJournal = (t) => (open && (t === tab || !t) ? closeJournal() : openJournal(t));

function render() {
  const el = $("#journal");
  el.innerHTML = `<div class="box"><nav>${TABS.map(([k, l]) => `<button data-t="${k}" class="${k === tab ? "on" : ""}">${l}</button>`).join("")}<button class="x" title="Fechar (Esc)">✕</button></nav><div class="page"></div></div>`;
  el.querySelectorAll("[data-t]").forEach((b) => (b.onclick = () => { tab = b.dataset.t; reading = null; sfx.click(); render(); }));
  el.querySelector(".x").onclick = closeJournal;
  const page = el.querySelector(".page");
  if (tab === "bag") page.innerHTML = bagPage();
  if (tab === "quests") page.innerHTML = questPage();
  if (tab === "memories") page.innerHTML = memoryPage();
  if (tab === "gear") { page.innerHTML = gearPage(); wireGear(page); }
  page.querySelectorAll("[data-item]").forEach((b) => (b.onclick = () => {
    const it = G.items.find((i) => i.id === b.dataset.item);
    if (!it?.read) return;
    reading = it.id; sfx.click(); render();
    G.hooks.itemRead?.(it);
  }));
  page.querySelector(".back")?.addEventListener("click", () => { reading = null; render(); });
}

function bagPage() {
  if (reading) {
    const it = G.items.find((i) => i.id === reading);
    return `<div class="reader"><h2>${it.icon} ${it.name}</h2><div class="paper">${it.read}</div><button class="back">← Voltar</button></div>`;
  }
  const rows = [
    `<div class="item"><span class="ic">🪙</span><div><b>Ouro</b><p>${G.gold} peças.</p></div></div>`,
    `<div class="item"><span class="ic">🧪</span><div><b>Poção de Cura</b> ×${G.potions}<p>Recupera 2d4+2 PV. Em combate, gasta a ação bônus.</p></div></div>`,
    ...G.items.map((it) => `<div class="item ${it.read ? "readable" : ""}" data-item="${it.id}"><span class="ic">${it.icon}</span><div><b>${it.name}</b>${it.read ? ' <span class="tag">📜 ler</span>' : it.gear ? ' <span class="tag">⚔️ equipável</span>' : ""}<p>${it.gear ? gearLine(it) + " — " : ""}${it.desc}</p></div></div>`),
  ];
  return `<h2>Bolsa</h2><div class="items">${rows.join("")}</div>`;
}

function questPage() {
  const qs = G.hooks.quests?.({ all: true }) ?? [];
  if (!qs.length) return "<h2>Missões</h2><p class='muted'>Nenhuma missão ainda.</p>";
  return "<h2>Missões</h2>" + qs.map((q) => `<div class="quest"><h3>${q.title}</h3>${q.desc ? `<p class="desc">${q.desc}</p>` : ""}${q.objs.map(([t, d]) => `<div class="obj ${d ? "done" : ""}">${t}</div>`).join("")}${(q.notes ?? []).map((n) => `<p class="note">${n}</p>`).join("")}</div>`).join("");
}

function memoryPage() {
  const ms = G.memories;
  const head = `<h2>Diário de Lembranças</h2><p class="muted">O que você viveu, e quem você é.</p>`;
  if (!ms.length) return head + "<p class='muted'>Por enquanto, só o sonho. E nem dele você tem certeza.</p>";
  return head + `<ul class="mems">${ms.map((m) => `<li class="${m.struck ? "struck" : ""} ${m.origin ? "origin" : ""} ${m.flicker ? "flicker" : ""}">${m.text}</li>`).join("")}</ul>`;
}

// ---------------------------------------------------------------- equipment
const SLOTS = [["main", "Arma"], ["ranged", "À distância"], ["armor", "Armadura / roupa"], ["shield", "Escudo"]];
const slotOf = (it) => (it.gear === "weapon" ? (WEAPONS[it.key].props.includes("dist") ? "ranged" : "main") : it.gear);
function gearLine(it) {
  const d = itemDef(it.gear, it.key);
  if (it.gear === "weapon") return weaponLine(d);
  if (it.gear === "armor") return `${ARMOR_CAT_NAMES[d.cat]} · CA ${d.base}${d.dexMax ? " + DES" + (d.dexMax < 9 ? ` (máx. ${d.dexMax})` : "") : ""}`;
  return `+${d.ac} CA`;
}
const members = () => G.party.filter((p) => p.build && !p.ai);

function gearPage() {
  const ms = members();
  if (!ms.length) return "<h2>Equipamento</h2><p class='muted'>Ninguém para equipar ainda.</p>";
  const u = ms[Math.min(who, ms.length - 1)], d = derive(u.build, u.equip);
  const slotName = (k, key) => (!key ? "—" : itemDef(k === "main" || k === "ranged" ? "weapon" : k, key).name);
  const stat = (l, v) => `<div class="gs"><span>${l}</span><b>${v}</b></div>`;
  const rows = G.items.filter((it) => it.gear).map((it) => {
    const slot = slotOf(it), eq = { ...u.equip, [slot]: it.key }, nd = derive(u.build, eq);
    let why = "";
    if (it.gear === "armor" && !armorAllowed(u.build.cls, it.key)) why = "sem treino com essa armadura";
    if (it.gear === "shield" && !shieldAllowed(u.build.cls)) why = "sem treino com escudo";
    const diff = [];
    if (nd.ac !== d.ac) diff.push(`CA ${d.ac} → <b class="${nd.ac > d.ac ? "up" : "down"}">${nd.ac}</b>`);
    if (slot === "main" && (nd.atk !== d.atk || nd.dmg !== d.dmg)) diff.push(`ataque ${signed(d.atk)} ${d.dmg} → <b>${signed(nd.atk)} ${nd.dmg}</b>`);
    if (slot === "ranged") diff.push(`distância: <b>${signed(nd.bow.atk)} ${nd.bow.dmg}</b>`);
    if (nd.move !== d.move) diff.push(`movimento ${d.move} → <b class="${nd.move > d.move ? "up" : "down"}">${nd.move}</b>`);
    const warn = nd.notes.filter((n) => !d.notes.includes(n));
    if (slot === "main" && !weaponProficient(u.build.cls, it.key)) warn.push("sem proficiência: sem +2 para acertar");
    return `<div class="item gear"><span class="ic">${it.icon}</span><div><b>${it.name}</b> <small>${gearLine(it)}</small><p>${it.desc}</p>
      ${diff.length ? `<p class="diff">${diff.join(" · ")}</p>` : ""}${warn.map((w) => `<p class="warn">⚠ ${w}</p>`).join("")}</div>
      <button data-equip="${it.id}" ${why ? `disabled title="${why}"` : ""}>${why ? why : "Equipar"}</button></div>`;
  });
  return `<h2>Equipamento</h2>
    <div class="who">${ms.map((p, i) => `<button data-who="${i}" class="${p === u ? "on" : ""}">${p.name}</button>`).join("")}</div>
    ${err ? `<p class="err">${err}</p>` : ""}
    <div class="gearsheet"><div class="doll"></div><div>
      <div class="gstats">${stat("CA", `${d.ac}`)}${stat("Ataque", `${signed(d.atk)} · ${d.dmg}`)}${stat("Distância", d.bow ? `${signed(d.bow.atk)} · ${d.bow.dmg}` : "—")}${stat("Movimento", d.move)}</div>
      <p class="muted small">${d.acNote}${d.reach > 1 ? " · ataca a 2 casas" : ""}</p>
      ${d.notes.map((n) => `<p class="warn">⚠ ${n}</p>`).join("")}
      <div class="gslots">${SLOTS.map(([k, l]) => { const key = u.equip[k], empty = !key || key === "roupas" || key === "punhos";
        return `<div class="gslot"><span>${l}</span><b>${slotName(k, key)}</b>${empty ? "" : `<button data-unequip="${k}">Tirar</button>`}</div>`; }).join("")}</div>
    </div></div>
    <h3>Na bolsa</h3>${rows.length ? `<div class="items">${rows.join("")}</div>` : "<p class='muted'>Nenhuma arma ou armadura sobrando. Procure em baús e com quem cruzar o seu caminho.</p>"}`;
}

function wireGear(page) {
  const ms = members(), u = ms[Math.min(who, ms.length - 1)];
  if (!u) return;
  const doll = page.querySelector(".doll");
  for (const dir of [0, 2, 3]) {
    const c = document.createElement("canvas");
    c.width = 26 * 4; c.height = 36 * 4;
    const x = c.getContext("2d"); x.imageSmoothingEnabled = false;
    x.drawImage(u.ch.frames[dir][4], 0, 0, c.width, c.height);
    doll.appendChild(c);
  }
  page.querySelectorAll("[data-who]").forEach((b) => (b.onclick = () => { who = +b.dataset.who; err = ""; sfx.click(); render(); }));
  page.querySelectorAll("[data-equip]").forEach((b) => (b.onclick = () => {
    const it = G.items.find((i) => i.id === b.dataset.equip);
    err = G.hooks.equip?.(u, null, it) ?? "";
    render();
  }));
  page.querySelectorAll("[data-unequip]").forEach((b) => (b.onclick = () => { err = G.hooks.equip?.(u, b.dataset.unequip, null) ?? ""; render(); }));
}

/** Redraw if it's showing (an item or memory changed). */
export function refreshJournal() { if (open) render(); }
