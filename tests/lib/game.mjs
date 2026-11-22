// Driving the game from Playwright: open it, play through scenes by picking answers, walk, fight, save, export and
// import saves, and take a snapshot of the game's state to compare before and after a load.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

export const ROOT = path.resolve(import.meta.dirname, "../..");
export const SAVES = path.join(ROOT, "tests/saves");

/** PW_CHROMIUM=/path/to/chrome uses a browser other than the one this Playwright version downloads (a machine with
 * another version preinstalled). */
export async function launch() {
  return chromium.launch({ headless: true, ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}), args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required"] });
}

/**
 * A fresh browser profile (its own saves) and a page. Dice are made repeatable: Math.random follows a fixed seed, so
 * the same script rolls the same numbers every time.
 */
export async function newPage(browser, { seed = 7, context = null, notes = false, dice = null } = {}) {
  const ctx = context ?? (await browser.newContext({ viewport: { width: 1280, height: 720 }, acceptDownloads: true, serviceWorkers: "block" }));
  // dice: "fail" makes every roll a 1 (every check fails), "pass" every roll a 20
  await ctx.addInitScript(([s, notes, dice]) => {
    let a = s >>> 0;
    Math.random = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    if (dice === "fail") Math.random = () => 0;
    if (dice === "pass") Math.random = () => 0.9999;
    // the menu's long opening and the "what's new" window are for people, not for scripts
    try { localStorage.setItem("brumafolha.opening", "1"); if (!notes && !localStorage.getItem("brumafolha.version")) localStorage.setItem("brumafolha.version", "999.0.0"); } catch { /* */ }
  }, [seed, notes, dice]);
  const page = await ctx.newPage();
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(String(e.stack ?? e)));
  page.on("console", (m) => { if (m.type() === "error") page.errors.push(m.text()); if (process.env.VERBOSE) console.log("[page]", m.text()); });
  return { ctx, page };
}

/** Wait until the game says so (a function of window.G, run in the page). */
export async function waitFor(page, fn, arg, timeout = 60000) {
  await page.waitForFunction(fn, arg, { timeout, polling: 100 });
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Open the game with a ?dev= shortcut and wait for the scene to be on screen. */
export async function openDev(page, base, query) {
  await page.goto(`${base}?${query}`);
  await waitFor(page, () => window.G?.build && window.G.W && ["explore", "cutscene", "dialogue"].includes(window.G.mode), null, 90000);
}

/** A scene is running, or story work is still under way (a timer about to start one). */
const inScene = (page) => page.evaluate(async () => { const S = await import("/src/story.js"); return S.inScene() || !!S.storyBusy(); });

/**
 * Play: click through lines, roll dice, and answer questions with `picks` (substrings of the answers, in order).
 * Stops when the game is back to `until` (default: exploring) with no conversation or scene. Throws if a question
 * comes up that the picks don't answer.
 */
export async function play(page, picks = [], { until = ["explore"], timeout = 90000, endscreen = true, shots = null } = {}) {
  const stopInDialogue = until.includes("dialogue");
  picks = [...picks];
  const t0 = Date.now();
  let calm = 0;
  while (Date.now() - t0 < timeout) {
    const s = await page.evaluate(() => {
      const dice = document.querySelector("#dice"), dlg = document.querySelector("#dialogue"), end = document.querySelector("#endscreen");
      return {
        mode: window.G.mode,
        dice: dice && !dice.classList.contains("hidden"), diceReady: dice && !!dice.onclick,
        dlg: dlg && !dlg.classList.contains("hidden"),
        opts: dlg ? [...dlg.querySelectorAll(".opt")].map((o) => o.textContent) : [],
        end: end && !end.classList.contains("hidden"),
        busy: !!window.G.combat?.busy,
      };
    });
    if (s.dice) { if (s.diceReady) await page.evaluate(() => document.querySelector("#dice").onclick()); await sleep(150); calm = 0; continue; }
    if (shots && (s.dlg || s.end)) {
      // pictures of the scenes: when a line containing a key is on screen, once (a click shows the whole line at once)
      const text = await page.evaluate(() => { const e = document.querySelector("#endscreen:not(.hidden)"); if (e) return e.textContent; const t = document.querySelector("#dialogue .text"); t?.onclick?.(); return t?.textContent ?? ""; });
      for (const [k, file] of Object.entries(shots)) if (text.includes(k)) { delete shots[k]; await sleep(700); await page.screenshot({ path: file, type: "jpeg", quality: 82 }); }
    }
    if (s.end && endscreen) { await page.click("#endscreen button"); calm = 0; continue; }
    if (s.dlg && s.opts.length) {
      if (stopInDialogue && !picks.length) return; // stay in this conversation (to save in the middle of it)
      const next = picks[0];
      let i = next ? s.opts.findIndex((o) => o.includes(next)) : -1;
      if (i >= 0) picks.shift();
      else if (s.opts.length === 1 || s.opts.every((o) => /Continuar|\.\.\.|Voltar/.test(o))) i = 0;
      else if (s.opts.some((o) => /^\d?Continuar/.test(o))) i = s.opts.findIndex((o) => /^\d?Continuar/.test(o));
      else throw new Error(`pergunta sem resposta (${next ?? "nenhuma escolha"}): ${s.opts.join(" | ")}`);
      await page.evaluate((k) => document.querySelectorAll("#dialogue .opt")[k].click(), i);
      await sleep(120);
      calm = 0;
      continue;
    }
    if (until.includes(s.mode) && !s.dlg && !(await inScene(page)) && !s.busy) {
      if (++calm >= 4) { if (picks.length) throw new Error(`escolhas não usadas: ${picks.join(", ")}`); return; }
    } else calm = 0;
    await sleep(150);
  }
  throw new Error(`tempo esgotado jogando (modo ${await page.evaluate(() => window.G.mode)})`);
}

/** Put the party's leader on a tile (as if it had walked there) and let the story's per-frame checks see it. */
export async function goTo(page, tx, ty) {
  await page.evaluate(([tx, ty]) => {
    const G = window.G, l = G.party[G.leader];
    l.x = tx * 32 + 16; l.y = ty * 32 + 26; l.path = [];
    for (const u of [...G.party, ...G.followers]) if (u !== l) { u.x = l.x + 4; u.y = l.y + 2; u.path = []; }
  }, [tx, ty]);
  await sleep(250);
}
/** Walk next to whoever is called `name` (an NPC, or a clickable thing) and press E. */
export async function interact(page, name) {
  const where = await page.evaluate(async (name) => {
    const G = window.G;
    const n = G.npcs.find((u) => !u.gone && (u.name === name || u.label === name));
    if (n) return [n.x, n.y];
    const S = await import("/src/story.js");
    const i = S.interactables().find((x) => x.name.includes(name));
    if (i) return [i.x, i.y];
    const c = G.chests.find((x) => x.name === name && !x.open);
    return c ? [c.x, c.y] : null;
  }, name);
  if (!where) throw new Error(`não há "${name}" aqui`);
  await page.evaluate(([x, y]) => {
    const G = window.G, l = G.party[G.leader];
    l.x = x; l.y = y + 30; l.path = []; l.dir = 3;
  }, where);
  await sleep(150);
  await page.keyboard.press("e");
  await sleep(250);
}

/** Win the fight on screen: on a party turn, the enemies fall, and the turn ends through the game's own path. */
export async function winFight(page) {
  await waitPartyTurn(page);
  await page.evaluate(async () => {
    const C = window.G.combat;
    for (const e of C.group) e.hp = 0;
    (await import("/src/combat.js")).endTurn();
  });
}
/** Wait for a party member's turn in a fight (the moment a fight can be saved). */
export async function waitPartyTurn(page) {
  await mods(page);
  await waitFor(page, () => window.__B.combat.combatStable(), null, 60000);
}
/** The game's modules, kept on window so that checks can run synchronously in waitForFunction. */
export async function mods(page) {
  await page.evaluate(async () => {
    window.__B ??= { combat: await import("/src/combat.js"), saves: await import("/src/save/saves.js"), story: await import("/src/story.js"), dialogue: await import("/src/dialogue.js") };
  });
}

/** Save with the game's own manual save, then export it as a file through the Load screen. Returns the save's id. */
export async function saveAndExport(page, file) {
  await mods(page);
  await page.evaluate(SNAP_SRC);
  await waitFor(page, () => !window.__B.saves.saveBlock(), null, 60000);
  // the snapshot and the save in the same moment: nothing can move between them
  const { id, snap } = await page.evaluate(() => new Promise((res, rej) => {
    const snap = window.__snapNow();
    const ok = window.__B.saves.requestSave("manual", { name: "Referência", quiet: true, onDone: (good, id) => (good ? res({ id, snap }) : rej(new Error("o save falhou"))) });
    if (!ok) rej(new Error("não dá para salvar agora: " + JSON.stringify(window.__B.saves.saveBlock())));
  }));
  await exportSave(page, id, file);
  return { id, snap };
}
export async function exportSave(page, id, file) {
  await page.evaluate(async () => (await import("/src/save/saves.js")).openSaves("load"));
  await page.waitForSelector(`#saves [data-exp="${id}"]`);
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click(`#saves [data-exp="${id}"]`)]);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await dl.saveAs(file);
  await page.evaluate(async () => (await import("/src/save/saves.js")).closeSaves());
}

/** Import a save file through the Load screen and load it. Waits for the game to be back. */
export async function importAndLoad(page, base, file) {
  await page.goto(base);
  // the start screen, under it the menu: the Load screen opens from there
  await waitFor(page, () => window.G?.mode === "title" && document.querySelector("#loading").classList.contains("hidden"), null, 90000);
  await page.evaluate(async () => (await import("/src/save/saves.js")).openSaves("load"));
  // wait for this import to be stored (the list may already show an earlier one from the same profile)
  const imports = () => page.evaluate(async () => (await (await import("/src/save/store.js")).listSaves()).filter((m) => m.id.endsWith("-imp")).length);
  const before = await imports();
  await page.setInputFiles("#saves input[type=file]", file);
  for (let t = Date.now(); (await imports()) <= before; ) { if (Date.now() - t > 30000) throw new Error("o save importado não apareceu"); await sleep(100); }
  await page.waitForSelector("#saves [data-load]");
  // the save just imported: the newest import (an earlier one in the same browser profile has an older stamp)
  const id = await page.evaluate(async () => (await (await import("/src/save/store.js")).listSaves()).filter((m) => m.id.endsWith("-imp")).sort((a, b) => parseInt(b.id.split("-")[1], 36) - parseInt(a.id.split("-")[1], 36))[0].id);
  await Promise.all([page.waitForEvent("load"), page.click(`#saves [data-load="${id}"]`)]);
  await waitLoaded(page);
  return id;
}
/** After a load (the page reloads): the game is back and the loading screen is gone. */
export async function waitLoaded(page) {
  await waitFor(page, () => window.G?.build && window.G.W && ["explore", "dialogue", "combat"].includes(window.G.mode) && document.querySelector("#loading").classList.contains("hidden"), null, 90000);
  await sleep(600);
}

/** What a save should bring back: where everyone is, their health, the flags, the bag, the party, the moment. */
export async function snapshot(page) {
  await mods(page);
  await page.evaluate(SNAP_SRC);
  return page.evaluate(() => window.__snapNow());
}
const SNAP_SRC = `window.__snapNow = ${(() => {
    const G = window.G, D = window.__B.dialogue;
    const r = Math.round;
    const unit = (u) => u && { uid: u.uid, name: u.name, x: r(u.x), y: r(u.y), hp: u.hp, maxHp: u.maxHp, team: u.team, gone: !!u.gone, level: u.level, xp: u.xp };
    const d = D.dialogueState();
    return {
      mapa: G.W.id, mode: G.mode, leader: G.leader,
      party: G.party.map(unit), followers: G.followers.map((u) => u.uid), hero: G.hero.uid, mate: G.mate?.uid,
      f: JSON.parse(JSON.stringify(G.f)), items: G.items.map((i) => i.id ?? i.key ?? i.name).sort(), gold: G.gold, potions: G.potions,
      memories: G.memories.map((m) => ({ id: m.id, struck: !!m.struck })), approval: { ...G.approval },
      npcs: G.npcs.map(unit), enemies: G.enemies.map(unit),
      chests: G.chests.map((c) => !!c.open),
      objects: G.W.objects.filter((o) => o.id).map((o) => ({ id: o.id, kind: o.kind, open: !!o.open, hidden: !!o.hidden, lit: !!o.lit, out: !!o.out, empty: !!o.empty })),
      combat: G.combat ? { round: G.combat.round, active: G.combat.active?.uid, order: G.combat.order.map((u) => u.uid), hp: G.combat.order.map((u) => u.hp) } : null,
      dialogue: d?.npc ? { npc: d.npc.uid, node: d.node } : null,
      abilities: G.hero.abilities.slice().sort(),
    };
  }).toString()};`;

/** Compare two snapshots. Positions may differ a little (followers take a step on the first frame). */
export function compare(a, b, { slack = 40 } = {}) {
  const errs = [];
  const eq = (k, x, y) => { if (JSON.stringify(x) !== JSON.stringify(y)) errs.push(`${k}: ${JSON.stringify(x)} ≠ ${JSON.stringify(y)}`); };
  for (const k of ["mapa", "mode", "leader", "followers", "hero", "mate", "items", "gold", "potions", "memories", "approval", "chests", "objects", "dialogue", "abilities"]) eq(k, a[k], b[k]);
  // flags: the same, except the ones that are only a fade in progress
  const VOL = new Set(["campFogK", "smokeK", "gate_busy"]);
  const fa = Object.fromEntries(Object.entries(a.f).filter(([k]) => !VOL.has(k))), fb = Object.fromEntries(Object.entries(b.f).filter(([k]) => !VOL.has(k)));
  eq("f", fa, fb);
  const units = (k, ua, ub, tol) => {
    if (ua.length !== ub.length) { errs.push(`${k}: ${ua.length} ≠ ${ub.length}`); return; }
    ua.forEach((u, i) => {
      const v = ub[i];
      for (const f of ["uid", "name", "hp", "maxHp", "team", "gone", "level", "xp"]) if (u[f] !== v[f]) errs.push(`${k}[${i}].${f}: ${u[f]} ≠ ${v[f]}`);
      const t = typeof tol === "function" ? tol(i) : tol;
      if (Math.abs(u.x - v.x) > t || Math.abs(u.y - v.y) > t) errs.push(`${k}[${i}] (${u.name}) posição: ${u.x},${u.y} ≠ ${v.x},${v.y}`);
    });
  };
  const inFight = a.mode === "combat";
  units("party", a.party, b.party, inFight ? 0 : (i) => (i === a.leader ? 3 : slack));
  units("npcs", a.npcs, b.npcs, inFight ? 0 : 6);
  units("enemies", a.enemies, b.enemies, inFight ? 0 : 6);
  eq("combat", a.combat, b.combat);
  return errs;
}

/** The game goes on from a loaded save: walk, finish the conversation, or play the fight on. */
export async function keepPlaying(page, snap) {
  if (snap.mode === "dialogue") {
    // leave the conversation the way a player would: the way out, or the last answer
    for (let i = 0; i < 12 && (await page.evaluate(() => window.G.mode === "dialogue")); i++) {
      await page.evaluate(() => {
        const o = [...document.querySelectorAll("#dialogue .opt")];
        (o.find((x) => /Até mais|Deixa pra lá|Voltar|Fique bem|\.\.\./.test(x.textContent)) ?? o[o.length - 1])?.click();
      });
      await sleep(300);
      if (await page.evaluate(() => !document.querySelector("#dice").classList.contains("hidden"))) await play(page, [], { until: ["explore", "dialogue"] }).catch(() => {});
    }
    await play(page);
  }
  if (snap.mode === "combat") {
    // a turn ends, the fight moves on to someone else, and comes back to the party
    const before = await page.evaluate(() => ({ idx: window.G.combat.idx, round: window.G.combat.round }));
    await page.evaluate(async () => (await import("/src/combat.js")).endTurn());
    await waitFor(page, (b) => !window.G.combat || window.G.combat.idx !== b.idx || window.G.combat.round !== b.round, before, 20000);
    if (await page.evaluate(() => window.G.mode === "combat")) { await winFight(page); await play(page); }
  }
  // walking: hold a key, the leader moves
  const a = await page.evaluate(() => { const l = window.G.party[window.G.leader]; return [l.x, l.y]; });
  await page.keyboard.down("d"); await sleep(500); await page.keyboard.up("d");
  await page.keyboard.down("s"); await sleep(400); await page.keyboard.up("s");
  const b = await page.evaluate(() => { const l = window.G.party[window.G.leader]; return [l.x, l.y]; });
  if (a[0] === b[0] && a[1] === b[1]) {
    await page.keyboard.down("a"); await sleep(500); await page.keyboard.up("a");
    await page.keyboard.down("w"); await sleep(400); await page.keyboard.up("w");
    const c = await page.evaluate(() => { const l = window.G.party[window.G.leader]; return [l.x, l.y]; });
    if (a[0] === c[0] && a[1] === c[1]) throw new Error("o grupo não sai do lugar depois de carregar");
  }
  // and the game can be saved again
  const block = await page.evaluate(async () => (await import("/src/save/saves.js")).saveBlock());
  if (block) throw new Error("não dá para salvar depois de carregar: " + JSON.stringify(block));
}

/** From a save with chapter 1 finished: the way to the Monastery is open, and chapter 2 starts. */
export async function toChapter2(page) {
  if (await page.evaluate(() => window.G.W.id !== "travessia")) {
    if (await page.evaluate(() => window.G.W.id === "vau")) { await goTo(page, 41, 12); await play(page); }
  }
  await goTo(page, 48, 15);
  await play(page);
  await waitFor(page, () => window.G.W.id === "bosque" && window.G.f.c2, null, 30000);
}
