// Saving and loading, as the player sees it: when a save is possible, waiting for a stable moment, quick and automatic
// saves, the Save / Load screen, and loading (which reloads the page and rebuilds the game from the save: nothing of
// the game before is kept, so nothing of it can leak into the loaded one).
import { G } from "../state.js";
import * as UI from "../ui.js";
import { sfx } from "../audio.js";
import { icon } from "../art/icons.js";
import { focusDefault, key } from "../input.js";
import { dialogueState } from "../dialogue.js";
import { combatStable } from "../combat.js";
import * as S from "../story.js";
import { collect, restore, FORMAT, GAME_VERSION } from "./game.js";
import { writeSave, readSave, listSaves, deleteSave, cleanOrphans, usingFallback, getMeta } from "./store.js";
import { validate, migrate } from "./schema.js";

const $ = (s, el = document) => el.querySelector(s);
const LOAD_KEY = "brumafolha.load";
const AUTO_SLOTS = 3, AUTO_EVERY = 600, AUTO_GAP = 60;

let M = null; // main.js: thumbnail(), placeName()
let pending = null; // a save asked for at a moment that wasn't stable: { kind, id?, name?, quiet }
let lastAuto = -1e9, exploreT = 0, writing = false;

export function initSaves(engine) {
  M = engine;
  cleanOrphans();
}

// ---------------------------------------------------------------- can we save now?
/** null if the game can be saved right now; { hard } if not at all here; { wait } if in a moment. */
export function saveBlock() {
  if (!G.party.length || !G.build || ["title", "intro", "create"].includes(G.mode)) return { hard: "Ainda não há uma partida para salvar." };
  if (G.mode === "over") return { hard: "Não dá para salvar depois de uma derrota." };
  if (G.mode === "end") return { hard: "Não dá para salvar nesta tela." };
  if (S.inScene() || G.mode === "cutscene") return { hard: "Não dá para salvar durante uma cena." };
  if (G.mode === "dialogue") {
    const d = dialogueState();
    if (!d?.npc || d.input) return { hard: "Não dá para salvar nesta conversa." };
    if (d.busy) return { wait: "o teste de d20" };
  }
  if (G.mode === "combat" && !combatStable()) return { wait: "a ação em andamento" };
  if (!$("#dice").classList.contains("hidden")) return { wait: "o teste de d20" };
  const b = S.storyBusy();
  if (b) return { wait: b };
  return null;
}

/** Ask for a save. It happens now, or at the next stable moment (and the player is told). */
export function requestSave(kind, opts = {}) {
  const b = saveBlock();
  if (b?.hard) { if (!opts.quiet) UI.toast(b.hard, 2600); return false; }
  if (!b && !writing) { doSave({ kind, ...opts }); return true; } // stable now (the pause menu, exploring): at once
  pending = { kind, ...opts };
  if (b?.wait && !opts.quiet) UI.toast(`Salvando assim que terminar ${b.wait}.`, 2400);
  return true;
}

/** Every frame (main.js): the pending save, and the automatic ones. */
export function tickSaves(dt) {
  if (!G.party.length || !G.build) return;
  if (!G.paused && ["explore", "dialogue", "combat"].includes(G.mode)) G.playTime = (G.playTime ?? 0) + dt;
  if (G.mode === "explore" && !G.paused) {
    exploreT += dt;
    if (exploreT >= AUTO_EVERY) { exploreT = 0; autoSave(); }
  }
  // the automatic save of a fight: at its first turn that can be saved (the fight's own state says it was done)
  if (G.mode === "combat" && G.combat && !G.combat.autoSaved && !pending && !writing && combatStable()) { G.combat.autoSaved = true; requestSave("auto", { quiet: true }); }
  if (!pending || writing || G.paused) return;
  const b = saveBlock();
  if (b?.hard) { if (!pending.quiet) UI.toast(b.hard, 2600); pending = null; return; }
  if (b?.wait) return;
  const p = pending;
  pending = null;
  doSave(p);
}

/** An automatic save: after a map change, at the first turn of a fight, after a scene (at most one a minute). */
export function autoSave(force = false) {
  if (!force && G.playTime - lastAuto < AUTO_GAP) return;
  lastAuto = G.playTime ?? 0;
  requestSave("auto", { quiet: true });
}

// ---------------------------------------------------------------- writing
const KIND_NAME = { manual: "Save", quick: "Save rápido", auto: "Automático" };

async function doSave({ kind, id, name, quiet, onDone }) {
  writing = true;
  try {
    let data;
    try {
      data = collect();
      validate(data); // a save the game couldn't read back is never written
    } catch (e) {
      console.error("[save]", e);
      throw new Error(`Não foi possível salvar: ${e.message}`);
    }
    const metas = (await listSaves()).filter((m) => m.campanha === G.campaign);
    if (kind === "quick") id = `q-${G.campaign}`;
    if (kind === "auto") {
      const autos = metas.filter((m) => m.tipo === "auto");
      id = autos.length < AUTO_SLOTS ? `a-${G.campaign}-${autos.length}` : autos[autos.length - 1].id; // the oldest
    }
    id ??= `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const mini = await M.thumbnail().catch(() => null);
    const hero = G.hero;
    const meta = {
      id, tipo: kind, nome: name ?? KIND_NAME[kind], campanha: G.campaign, gravadoEm: data.gravadoEm, tempoDeJogo: data.tempoDeJogo,
      formato: FORMAT, jogo: GAME_VERSION, lugar: M.placeName(), missao: (G.hooks.quests?.() ?? [])[0]?.title ?? "",
      heroi: { nome: hero.name, classe: hero.cls ?? "", nivel: hero.level }, grupo: G.party.filter((p) => !p.ai).map((p) => p.name),
      momento: data.moment.kind, mini,
    };
    await writeSave(meta, data);
    if (!quiet) { UI.toast(kind === "quick" ? "Save rápido feito." : "Jogo salvo.", 1800); sfx.quest?.(); }
    onDone?.(true, id);
  } catch (e) {
    UI.toast(e.message, 4200);
    onDone?.(false);
  } finally {
    writing = false;
  }
}

// ---------------------------------------------------------------- loading
/**
 * Load a save: check that it can be read, then reload the page; the boot finds the request and rebuilds the game
 * from it (see bootLoad). Nothing of the game on screen survives into the loaded one.
 */
export async function loadSave(id, { backup = false } = {}) {
  try {
    const r = await readSave(id, { preferBackup: backup });
    validate(migrate(r.data));
    sessionStorage.setItem(LOAD_KEY, JSON.stringify({ id, backup: backup || r.fromBackup }));
    UI.fade(1, 250);
    setTimeout(() => location.reload(), 260);
  } catch (e) {
    UI.toast(e.message, 4200);
  }
}

/** At boot: was a load asked for? Then do it. Resolves true if a game was loaded. */
export async function bootLoad(showError) {
  let req = null;
  try { req = JSON.parse(sessionStorage.getItem(LOAD_KEY)); } catch { /* none */ }
  sessionStorage.removeItem(LOAD_KEY); // read once: a load that crashes must not crash every reload after it
  if (!req?.id) return false;
  try {
    const r = await readSave(req.id, { preferBackup: req.backup });
    const save = migrate(r.data);
    validate(save);
    restore(save);
    if (r.fromBackup) setTimeout(() => UI.toast("O save principal estava danificado: foi carregada a cópia anterior.", 5000), 800);
    lastAuto = G.playTime ?? 0;
    return true;
  } catch (e) {
    console.error("[save] carregar", e);
    const meta = await getMeta(req.id).catch(() => null);
    showError(`Não foi possível carregar este save: ${e.message}`, !req.backup && meta?.backupKey ? () => loadSave(req.id, { backup: true }) : null);
    return false;
  }
}

export async function newestSave() { return (await listSaves().catch(() => []))[0] ?? null; }

// ---------------------------------------------------------------- the Save / Load screen
let screen = null;

/** Open the Save ("save") or Load ("load") screen. `onClose` runs when it closes. */
export async function openSaves(mode, onClose) {
  const el = $("#saves");
  screen = { mode, onClose, confirm: null };
  el.classList.remove("hidden");
  await render();
}
export const savesOpen = () => !!screen;
export function closeSaves() {
  if (!screen) return;
  const c = screen.onClose;
  screen = null;
  $("#saves").classList.add("hidden");
  $("#saves").innerHTML = "";
  c?.();
}

const when = (iso) => { const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); };
const hours = (s) => { s = Math.round(s ?? 0); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h}h${String(m).padStart(2, "0")}` : `${m} min`; };
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const TIPO = { manual: "", quick: "Rápido", auto: "Automático" };
const MOMENTO = { combat: "em combate", dialogue: "numa conversa" };

async function render() {
  if (!screen) return;
  const el = $("#saves"), { mode } = screen;
  let list = [];
  try { list = await listSaves(); } catch (e) { list = []; UI.toast("Não foi possível ler os saves deste navegador.", 4000); }
  const block = mode === "save" ? saveBlock() : null;
  // grouped by campaign (one hero, one playthrough), the current one first
  const camps = new Map();
  for (const m of list) { if (!camps.has(m.campanha)) camps.set(m.campanha, []); camps.get(m.campanha).push(m); }
  const order = [...camps.keys()].sort((a, b) => (a === G.campaign ? -1 : b === G.campaign ? 1 : 0));
  const shown = mode === "save" ? order.filter((c) => c === G.campaign) : order;
  const row = (m) => {
    const conf = screen.confirm?.id === m.id ? screen.confirm.what : null;
    const acts = conf
      ? `<span class="ask">${conf === "del" ? "Apagar este save?" : "Salvar por cima deste?"}</span><button data-yes="${m.id}" class="go">Sim</button><button data-no>Não</button>`
      : mode === "save"
        ? (m.tipo === "manual" ? `<button data-over="${m.id}" ${block?.hard ? "disabled" : ""}>Salvar por cima</button>` : "")
        : `<button data-load="${m.id}" class="go">Carregar</button><button data-exp="${m.id}" title="Baixar como arquivo">${icon("scroll")}</button><button data-del="${m.id}" title="Apagar">${icon("skull")}</button>`;
    return `<div class="srow" data-id="${m.id}">
      <div class="mini">${m.mini ? `<img src="${m.mini}" alt="">` : ""}</div>
      <div class="info"><b>${esc(m.nome)}</b>${TIPO[m.tipo] && TIPO[m.tipo] !== m.nome && KIND_NAME[m.tipo] !== m.nome ? ` <span class="tipo">${TIPO[m.tipo]}</span>` : ""}
        <span>${esc(m.lugar)}${MOMENTO[m.momento] ? ` · ${MOMENTO[m.momento]}` : ""}</span>
        <span class="muted">${esc(m.missao)}</span>
        <span class="muted">${when(m.gravadoEm)} · ${hours(m.tempoDeJogo)} de jogo${m.formato > FORMAT ? " · <span class='bad'>versão mais nova do jogo</span>" : ""}</span></div>
      <div class="acts">${acts}</div></div>`;
  };
  const camp = (c) => {
    const ms = camps.get(c), h = ms[0].heroi ?? {};
    return `<section class="camp"><h3>${esc(h.nome)} <span>${esc(h.classe)} · nível ${h.nivel ?? "?"}${c === G.campaign ? " · partida atual" : ""}</span></h3>${ms.map(row).join("")}</section>`;
  };
  el.innerHTML = `<div class="box fr fr-panel">
    <h1>${mode === "save" ? "Salvar" : "Carregar"}</h1>
    ${usingFallback() ? `<p class="warn">Este navegador não deixa usar o banco de saves: eles ficam num espaço menor e podem sumir ao fechar o navegador. Exporte os importantes.</p>` : ""}
    <div class="top">
      ${mode === "save"
        ? `<button class="go" data-new ${block?.hard ? "disabled" : ""}>${icon("book")} Novo save</button>${block?.hard ? `<span class="why">${block.hard}</span>` : block?.wait ? `<span class="why">Vai salvar quando terminar ${block.wait}.</span>` : ""}`
        : `<label class="imp"><input type="file" accept=".brumafolha,.json" hidden><span class="btnlike">${icon("bag")} Importar save</span></label>`}
    </div>
    <div class="list">${shown.length ? shown.map(camp).join("") : `<p class="muted empty">${mode === "save" ? "Nenhum save desta partida ainda." : "Nenhum save neste navegador."}</p>`}</div>
    <div class="row"><button data-close data-default>Voltar ${key("Esc", "B")}</button></div>
  </div>`;
  wire(el);
  focusDefault(el, true);
}

function wire(el) {
  const on = (sel, fn) => el.querySelectorAll(sel).forEach((b) => (b.onclick = (e) => { e.stopPropagation(); sfx.click?.(); fn(b); }));
  on("[data-close]", () => closeSaves());
  on("[data-new]", () => { requestSave("manual", { onDone: () => render() }); render(); });
  on("[data-over]", (b) => { screen.confirm = { id: b.dataset.over, what: "over" }; render(); });
  on("[data-del]", (b) => { screen.confirm = { id: b.dataset.del, what: "del" }; render(); });
  on("[data-no]", () => { screen.confirm = null; render(); });
  on("[data-yes]", async (b) => {
    const { id, what } = screen.confirm; screen.confirm = null;
    if (what === "del") { await deleteSave(id).catch((e) => UI.toast(e.message)); render(); }
    else { const m = (await listSaves()).find((x) => x.id === id); requestSave("manual", { id, name: m?.nome, onDone: () => render() }); render(); }
  });
  on("[data-load]", (b) => loadSave(b.dataset.load));
  on("[data-exp]", (b) => exportSave(b.dataset.exp));
  const file = el.querySelector("input[type=file]");
  if (file) {
    el.querySelector(".btnlike").onclick = (e) => { e.preventDefault(); file.click(); };
    file.onchange = () => file.files[0] && importSave(file.files[0]);
  }
}

// ---------------------------------------------------------------- export / import
async function exportSave(id) {
  try {
    const r = await readSave(id);
    const blob = new Blob([JSON.stringify({ brumafolha: 1, meta: r.meta, data: r.data })], { type: "application/json" });
    const a = document.createElement("a");
    const name = `${r.meta.heroi?.nome ?? "save"}-${(r.meta.gravadoEm ?? "").slice(0, 16).replace(/[:T]/g, "-")}.brumafolha`;
    a.href = URL.createObjectURL(blob); a.download = name.replace(/[^\w.-]+/g, "_");
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  } catch (e) { UI.toast(e.message, 4000); }
}
async function importSave(file) {
  try {
    const text = await file.text();
    let pack;
    try { pack = JSON.parse(text); } catch { throw new Error("Este arquivo não é um save de Brumafolha."); }
    if (!pack?.data || !pack.meta) throw new Error("Este arquivo não é um save de Brumafolha.");
    const data = migrate(pack.data);
    validate(data);
    const meta = { ...pack.meta, id: `m-${Date.now().toString(36)}-imp`, tipo: "manual", nome: `${pack.meta.nome ?? "Save"} (importado)` };
    delete meta.dataKey; delete meta.backupKey; delete meta.hash; delete meta.backupHash;
    await writeSave(meta, pack.data);
    UI.toast("Save importado.", 2000);
    render();
  } catch (e) { UI.toast(e.message, 4200); }
}
