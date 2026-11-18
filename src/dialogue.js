// Conversations with choices and d20 skill checks, the tabletop way.
// A tree is { id: node | () => node }. A node: { text, options, who?, narr?, input? }.
// An option: { label, to, do, if, once, tag, check: { skill | [skills], dc }, pass, fail, passTo, failTo }.
import { G } from "./state.js";
import { rollDie } from "./util.js";
import { updateQuest, log, updateParty } from "./ui.js";
import { sfx } from "./audio.js";
import { icon } from "./art/icons.js";
import { makeD20 } from "./art/frames.js";
import { SKILLS } from "./rules.js";
import { relicBonus } from "./relics.js";
import { key, focusDefault } from "./input.js";

const $ = (s) => document.querySelector(s);

let d20Art = null;
/** Show the big d20, roll it, resolve with { roll, total, ok }. After a failure the Lampejo (if the hero has it) can reroll. */
export function skillCheck(skill, who, bonus, dc, lucky = false) {
  return new Promise((resolve) => {
    const box = $("#dice");
    box.classList.remove("hidden");
    box.querySelector(".skill").textContent = skill;
    box.querySelector(".dc").innerHTML = `${who} rola contra a <b>CD ${dc}</b>`;
    box.querySelector(".hint").innerHTML = "";
    const d = box.querySelector(".d20"), num = box.querySelector(".num"), res = box.querySelector(".result"), extra = box.querySelector(".extra"), math = box.querySelector(".math");
    d20Art ??= makeD20();
    const cv = d.querySelector("canvas"), cx = cv.getContext("2d");
    cx.clearRect(0, 0, 64, 64); cx.drawImage(d20Art, 0, 0);
    const sign = (n) => (n >= 0 ? "+ " + n : "− " + -n);
    const spin = () => {
      res.textContent = ""; res.className = "result"; extra.innerHTML = ""; math.innerHTML = `d20 ${sign(bonus)}`;
      box.onclick = null;
      d.className = "d20 spin";
      let r = rollDie(20);
      if (r === 1 && lucky) r = rollDie(20); // halfling luck
      let n = 0;
      const iv = setInterval(() => { num.textContent = rollDie(20); sfx.dieTick(); if (++n > 16) finish(r); }, 60);
      let done = false;
      function finish(r) {
        if (done) return;
        done = true;
        clearInterval(iv);
        num.textContent = r;
        const total = r + bonus, ok = r === 20 || (r !== 1 && total >= dc);
        d.className = "d20 " + (ok ? "ok" : "bad");
        math.innerHTML = `<b>${r}</b> ${sign(bonus)} = <b>${total}</b> contra CD ${dc}`;
        res.textContent = r === 20 ? "Sucesso crítico!" : r === 1 ? "Falha crítica!" : ok ? "Sucesso" : "Falha";
        res.className = "result " + (ok ? "ok" : "bad");
        ok ? sfx.success(r === 20) : sfx.fail();
        if (!ok && G.hooks.lampejo?.can()) {
          const b = document.createElement("button");
          b.className = "lampejo";
          b.innerHTML = `${icon("leaf")} Lampejo de Velmoor: rolar de novo ${key("L", "X")}`;
          b.onclick = (e) => { e.stopPropagation(); G.hooks.lampejo.use(); sfx.cast("arcane"); spin(); };
          extra.appendChild(b);
        }
        box.querySelector(".hint").innerHTML = `${key("Espaço", "A")} continuar`;
        setTimeout(() => {
          box.onclick = () => { box.onclick = null; box.classList.add("hidden"); extra.innerHTML = ""; resolve({ roll: r, total, ok }); };
        }, 250);
      }
    };
    spin();
  });
}
/** The Lampejo button of an open d20, for the keyboard and the pad. */
export function diceReroll() { document.querySelector("#dice:not(.hidden) .lampejo")?.click(); }

let current = null;

// ---------------------------------------------------------------- how an answer reads (docs/historia.md §9)
// What the hero SAYS is written as is, without quotes. What the hero DOES starts with a verb in the infinitive
// ("Pegar a lanterna.") and is shown in italics; an action followed by words is written "Mostrar a marca — É isto que
// você procura." Someone else answering for the hero is "Kael: ...". "Continuar", "Voltar." and "..." only move the
// conversation along. An option can say what it is with `act: true` (an action that doesn't start with a verb) or
// `act: false` (a line that does).
const META = /^(\.\.\.|Continuar|Voltar\.)$/;
const OTHER = /^([A-ZÀ-Ý][a-zà-ÿ]+): (.+)$/;
const ACT = /^([A-ZÀ-Ý][a-zà-ÿ]*(ar|er|ir|or|ôr)(-(lhe|lhes|se|me|nos))?|[A-ZÀ-Ý][a-zà-ÿ]*[áêí]-(la|lo|las|los))\b/;
const NOT_VERBS = new Set(["Por", "Melhor", "Pior", "Senhor", "Qualquer", "Mulher", "Lugar"]);
/** "say", "act", "other" (someone answers for the hero) or "meta". */
export function optionKind(o) {
  const l = o.label;
  if (META.test(l)) return "meta";
  if (o.act != null) return o.act ? "act" : "say";
  if (OTHER.test(l)) return "other";
  const m = ACT.exec(l);
  return m && !NOT_VERBS.has(m[0]) ? "act" : "say";
}
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
function optionHtml(o) {
  const kind = optionKind(o), l = o.label;
  if (kind === "other") { const [, who, words] = OTHER.exec(l); return `<span class="as">${esc(who)}:</span> ${esc(words)}`; }
  if (kind === "act") { const i = l.indexOf(" — "); return i < 0 ? `<i class="act">${esc(l)}</i>` : `<i class="act">${esc(l.slice(0, i))}</i> — ${esc(l.slice(i + 3))}`; }
  return esc(l);
}

/** Who in the party rolls a check (the best at it), and with which of the allowed skills. */
function bestAt(skills) {
  let best = null, refused = null;
  for (const p of G.party.filter((p) => p.hp > 0 && !p.ai))
    for (const s of skills) {
      const b = p.skills[s] ?? 0;
      // a companion who has had enough of the hero doesn't roll for them (companions.js)
      if (G.hooks.refuses?.(p)) { if (!refused || b > refused.bonus) refused = { who: p, bonus: b }; continue; }
      if (!best || b > best.bonus) best = { who: p, skill: s, bonus: b };
    }
  best ??= { who: G.hero, skill: skills[0], bonus: G.hero.skills[skills[0]] ?? 0 };
  best.base = best.bonus;
  // one who likes the hero lends a hand (+1)
  const help = G.hooks.checkHelp?.(best.who);
  if (help) { best.bonus += help.bonus; best.help = help; }
  // a relic of Velmoor in the bag helps in its skill
  const relic = relicBonus(best.skill);
  if (relic) { best.bonus += relic; best.relic = relic; }
  if (refused && refused.bonus > best.base) best.refused = refused.who.name;
  return best;
}

/** Open a conversation. `npc` is whoever speaks first: { name, portrait }. Resolves `onClose` when it ends. */
export function openDialogue(npc, tree, startId = "start", onClose = null, used = null) {
  const prevMode = current ? current.prevMode : G.mode === "dialogue" ? "explore" : G.mode;
  G.mode = "dialogue";
  sfx.talk();
  current = { npc, tree, used: used ?? current?.used ?? new Set(), prevMode, onClose };
  $("#dialogue").classList.remove("hidden");
  show(startId);
}

/** The same, as a promise: `await talk(npc, tree)`. */
export const talk = (npc, tree, startId = "start") => new Promise((res) => openDialogue(npc, tree, startId, res));

function setSpeaker(sp) {
  const el = $("#dialogue");
  el.classList.toggle("narr", !sp);
  el.querySelector(".name").textContent = sp?.name ?? "";
  if (!sp?.portrait) return;
  const pc = el.querySelector(".portrait canvas");
  pc.width = sp.portrait.width; pc.height = sp.portrait.height;
  const ctx = pc.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sp.portrait, 0, 0);
}

function typeText(el, text) {
  el.textContent = "";
  let i = 0;
  clearInterval(el._iv);
  el._iv = setInterval(() => { el.textContent = text.slice(0, (i += 2)); if (i >= text.length) clearInterval(el._iv); }, 16);
  el.onclick = () => { clearInterval(el._iv); el.textContent = text; };
}

/**
 * For the save: the conversation on screen, if it can be saved. Only a conversation with an NPC opened by talking to
 * them (main.js marks it) can be: it is reopened on load by asking the NPC for its tree again. Conversations inside
 * scenes can't, nor one in the middle of a d20.
 */
export function dialogueState() {
  if (!current) return null;
  return { npc: current.from ?? null, node: current.node, used: [...current.used], busy: !!current.busy, input: !!current.input };
}
export function markTalk(npc) { if (current) current.from = npc; }
/** Reopen a saved conversation. Returns false if that node no longer exists. */
export function resumeDialogue(npc, tree, node, used) {
  if (!tree || !(node in tree)) return false;
  openDialogue(npc, tree, node, null, new Set(used ?? []));
  current.from = npc;
  return true;
}

function show(id) {
  current.node = id;
  const node = typeof current.tree[id] === "function" ? current.tree[id]() : current.tree[id];
  const el = $("#dialogue");
  setSpeaker(node.narr ? null : node.who ?? current.npc);
  if (node.name) el.querySelector(".name").textContent = node.name;
  typeText(el.querySelector(".text"), node.text);
  const opts = el.querySelector(".options");
  opts.innerHTML = "";
  if (node.input) {
    const inp = document.createElement("input");
    inp.className = "dlg-input"; inp.maxLength = node.input.max ?? 18; inp.placeholder = node.input.placeholder ?? ""; inp.value = node.input.value ?? "";
    inp.onkeydown = (e) => { e.stopPropagation(); if (e.key === "Enter") opts.querySelector(".opt")?.click(); };
    opts.appendChild(inp);
    setTimeout(() => inp.focus(), 50);
    current.input = inp;
  } else current.input = null;
  node.options.filter((o) => !o.if || o.if()).forEach((o, i) => {
    const d = document.createElement("div");
    d.className = "opt k-" + optionKind(o) + (o.once && current.used.has(o.label) ? " used" : "");
    d.tabIndex = 0;
    if (i === 0) d.dataset.default = "";
    const skills = o.check ? [o.check.skill].flat() : null;
    const best = skills && bestAt(skills);
    let tag = o.tag ? `<span class="tag">[${o.tag}]</span> ` : "";
    if (o.check) {
      const pct = Math.max(5, Math.min(95, (21 - (o.check.dc - best.bonus)) * 5));
      // what it depends on (the ability behind the skill), who rolls, who helps, who won't
      const abil = [...new Set(skills.map((s) => SKILLS[s]))].join("/");
      const sign = (n) => (n >= 0 ? "+" : "") + n;
      const extra = (best.help ? ` ${sign(best.help.bonus)} ${best.help.who}` : "") + (best.relic ? ` ${sign(best.relic)} relíquia` : "") + (best.refused ? ` · ${best.refused} não quis ajudar` : "");
      tag = `<span class="chk">${icon("d20")} ${skills.join(" ou ")} (${abil}) CD ${o.check.dc} <small>· ${best.who.name} ${sign(best.base)}${extra} · <span class="p">${pct}%</span></small></span> `;
    }
    d.innerHTML = `<span class="num">${i + 1}</span>${tag}${optionHtml(o)}`;
    if (o.check) G.hooks.hint?.("check");
    d.onclick = async () => {
      if (!current || current.busy) return;
      sfx.click();
      if (o.once) current.used.add(o.label);
      const value = current.input?.value.trim() ?? "";
      if (o.check) {
        current.busy = true;
        const res = await skillCheck(best.skill, best.who.name + (best.help ? `, com a ajuda de ${best.help.who},` : ""), best.bonus, o.check.dc, best.who.lucky);
        current.busy = false;
        log(`${best.who.name} — ${best.skill}: ${res.roll}${best.bonus >= 0 ? "+" : ""}${best.bonus} = ${res.total} vs CD ${o.check.dc} · ${res.ok ? "sucesso" : "falha"}`, res.ok ? "heal" : "miss");
        const next = res.ok ? o.pass : o.fail;
        if (typeof next === "function") next(best.who);
        return go(res.ok ? o.passTo : o.failTo);
      }
      o.do?.(value);
      go(typeof o.to === "function" ? o.to() : o.to);
    };
    opts.appendChild(d);
  });
  // with keys or a pad the first answer is already under the cursor
  if (!current.input) focusDefault(el, true);
}

function go(id) {
  if (!current) return;
  if (!id || id === "end") return closeDialogue();
  show(id);
}

export function closeDialogue() {
  $("#dialogue").classList.add("hidden");
  const c = current;
  current = null;
  if (G.mode === "dialogue") G.mode = c?.prevMode ?? "explore";
  updateQuest();
  updateParty();
  G.hooks.afterDialogue?.();
  c?.onClose?.();
}

export function dialogueKey(n) {
  if (!current || current.input) return;
  const opts = [...document.querySelectorAll("#dialogue .opt")];
  opts[n - 1]?.click();
}
