// The level-up screen: what each party member gained, and the one choice every level brings (a new ability of the
// class, +2 to an ability score, or a new skill). It opens by itself the first calm moment after a level is reached
// (exploring, no scene, no conversation), and from the "+" on a portrait. Companions come with a suggestion already
// picked, which the player can change. Old saves whose characters reached a level before this screen existed get
// those choices pending on load (rules.js pendingPicks), each with its suggestion.
import { G } from "./state.js";
import { sfx } from "./audio.js";
import { icon } from "./art/icons.js";
import { ABILITIES } from "./combat.js";
import { ABIL_NAMES, SKILLS, CLASSES, finalScores, mod, signed, levelOptions, suggestPick, applyPick, pendingPicks, MAIN_ABIL } from "./rules.js";
import { focusDefault } from "./input.js";
import { FX, PAL } from "./fx.js";

const $ = (s, el = document) => el.querySelector(s);
const KINDS = [["ability", "Habilidade nova"], ["asi", "Atributo +2"], ["skill", "Perícia nova"]];

let root = null, who = 0, picks = new Map(), tabOf = new Map(), onClosed = null;
let regear = null;
export function initLevelUp(hooks) { regear = hooks.regear; onClosed = hooks.closed; }

export const anyPending = () => G.party.some((p) => pendingPicks(p) > 0);
export const levelUpOpen = () => !!root && !root.classList.contains("hidden");

/** Open the screen for everyone with a choice to make (the hero first). */
export function openLevelUp(start = null) {
  const list = members();
  if (!list.length) return false;
  root = $("#levelup");
  who = Math.max(0, start ? list.indexOf(start) : 0);
  picks = new Map(); tabOf = new Map();
  // the companions come with their choice made; the hero chooses
  for (const p of list) if (p !== G.hero) { const s = suggestPick(p.build); picks.set(p, s); tabOf.set(p, s.kind); }
  root.classList.remove("hidden");
  sfx.levelUp();
  render();
  G.hooks.hint?.("levelup");
  return true;
}
export function closeLevelUp() {
  if (!root) return;
  root.classList.add("hidden");
  onClosed?.();
}

const members = () => [G.hero, ...G.party.filter((p) => p !== G.hero)].filter((p) => p && pendingPicks(p) > 0);
/** The level this choice belongs to (the earliest one still open). */
const levelOf = (p) => p.level - pendingPicks(p) + 1;

function gains(p) {
  const rows = [[icon("hp", "sm") + " Vida máxima", `+${p.hpPerLevel} (agora ${p.maxHp})`]];
  if (p.role === "martial") rows.push([icon("sword", "sm") + " Ataque", `+1 para acertar (agora ${signed(p.atk)})`]);
  if (p.maxSlots) rows.push([icon("missiles", "sm") + " Espaços de magia", `+1 (agora ${p.maxSlots})`]);
  return rows;
}

function optionCards(p) {
  const kind = tabOf.get(p) ?? "ability", b = p.build, o = levelOptions(b), sel = picks.get(p), sc = finalScores(b);
  const on = (k) => sel && sel.kind === kind && sel.key === k ? "on" : "";
  if (kind === "ability") {
    if (!o.abilities.length) return `<p class="muted">${p.name} já aprendeu tudo o que a classe ensina por agora. Escolha um atributo ou uma perícia.</p>`;
    return o.abilities.map((k) => { const a = ABILITIES[k]; return `<button class="card lu-opt ${on(k)}" data-k="${k}"><b>${icon(a.icon, "sm")} ${a.name}</b><small>${a.desc}</small></button>`; }).join("");
  }
  if (kind === "asi") return o.abils.map((k) => {
    const now = sc[k], m0 = mod(now), m1 = mod(now + 2), main = MAIN_ABIL[b.cls] === k;
    return `<button class="card lu-opt ${on(k)}" data-k="${k}"><b>${ABIL_NAMES[k]} ${now} → ${now + 2}</b><small>modificador ${signed(m0)} → ${signed(m1)}${main ? " · o atributo da classe" : ""}</small></button>`;
  }).join("");
  return o.skills.map((s) => `<button class="card lu-opt ${on(s)}" data-k="${s}"><b>${s}</b><small>${ABIL_NAMES[SKILLS[s]]} · ${signed(p.skills[s] ?? 0)} → ${signed((p.skills[s] ?? 0) + 2)}</small></button>`).join("");
}

function render() {
  const list = members();
  if (!list.length) { closeLevelUp(); return; }
  who = Math.min(who, list.length - 1);
  const p = list[who], kind = tabOf.get(p) ?? "ability", sel = picks.get(p), lv = levelOf(p), left = pendingPicks(p);
  const ready = list.every((m) => picks.get(m));
  const choiceName = (m) => { const c = picks.get(m); if (!c) return "falta escolher"; return c.kind === "ability" ? ABILITIES[c.key].name : c.kind === "asi" ? `${ABIL_NAMES[c.key]} +2` : c.key; };
  root.innerHTML = `<div class="box fr fr-panel">
    <h1>${icon("star")} Subir de nível</h1>
    <nav class="lu-who">${list.map((m, i) => `<button data-who="${i}" class="${i === who ? "on" : ""}"><canvas width="26" height="24"></canvas><span><b>${m.name}</b><small>nível ${levelOf(m)} · ${choiceName(m)}</small></span></button>`).join("")}</nav>
    <div class="lu-body">
      <section class="lu-gain"><h3>${p.name} chega ao nível ${lv}</h3>
        <dl>${gains(p).filter(([a]) => a).map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join("")}</dl>
        ${left > 1 ? `<p class="muted">Mais ${left - 1} ${left - 1 > 1 ? "escolhas guardadas" : "escolha guardada"} de níveis anteriores, depois desta.</p>` : ""}
        ${p !== G.hero ? `<p class="muted">${p.name} já sabe o que quer: a escolha marcada é a sugestão. Pode trocar.</p>` : `<p class="muted">Escolha uma coisa para levar deste nível.</p>`}
      </section>
      <section class="lu-pick">
        <nav class="tabs">${KINDS.map(([k, l]) => `<button data-tab="${k}" class="${k === kind ? "on" : ""}">${l}</button>`).join("")}</nav>
        <div class="cards">${optionCards(p)}</div>
      </section>
    </div>
    <div class="row"><button class="quiet" data-later>Depois</button><button class="go" data-ok ${ready ? "data-default" : "disabled"}>${ready ? "Confirmar" : `Escolha para ${list.filter((m) => !picks.get(m)).map((m) => m.name).join(" e ")}`}</button></div>
  </div>`;
  root.querySelectorAll("[data-who] canvas").forEach((c, i) => { const x = c.getContext("2d"); x.imageSmoothingEnabled = false; x.drawImage(list[i].portrait, 0, 0, 26, 24); });
  root.querySelectorAll("[data-who]").forEach((el) => (el.onclick = () => { who = +el.dataset.who; sfx.click(); render(); }));
  root.querySelectorAll("[data-tab]").forEach((el) => (el.onclick = () => { tabOf.set(p, el.dataset.tab); sfx.click(); render(); }));
  root.querySelectorAll(".lu-opt").forEach((el) => (el.onclick = () => {
    picks.set(p, { kind, key: el.dataset.k }); sfx.click();
    // the next one who still has to choose, if any
    const next = list.findIndex((m) => !picks.get(m));
    if (next >= 0 && p === G.hero && next !== who) who = next;
    render();
    focusDefault(root, true);
  }));
  $("[data-later]", root).onclick = () => { sfx.click(); closeLevelUp(); };
  $("[data-ok]", root).onclick = confirm;
  if (!ready && !sel) root.querySelector(".lu-opt")?.setAttribute("data-default", "");
  focusDefault(root, true);
}

function confirm() {
  const list = members();
  if (!list.every((m) => picks.get(m))) return;
  for (const p of list) {
    const pick = picks.get(p), con0 = mod(finalScores(p.build).CON);
    applyPick(p.build, pick, levelOf(p));
    if (p === G.hero) G.build = p.build;
    regear(p, false);
    // a Constitution that crosses a modifier gives back the hit points of every level
    const dc = mod(finalScores(p.build).CON) - con0;
    if (dc > 0) { p.maxHp += dc * p.level; p.hp += dc * p.level; p.hpPerLevel += dc; }
    G.fx.spawn(FX.bloom, { x: p.x, y: p.y + 2, palette: PAL.holy });
  }
  sfx.quest();
  // a save from before this screen may still have more choices for older levels: the screen stays for them
  if (members().length) { picks = new Map(); for (const p of members()) if (p !== G.hero) { const s = suggestPick(p.build); picks.set(p, s); tabOf.set(p, s.kind); } render(); return; }
  closeLevelUp();
}
