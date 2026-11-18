// Levelling up (src/levelup.js): the screen opens by itself after a level, the hero chooses, companions come with a
// suggestion, the choice is kept by a save. A save from before the screen existed (0.8.0, everyone at level 3) gets
// two choices each, waiting. Every ability a level can teach works in a real fight.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { serve } from "./lib/server.mjs";
import * as T from "./lib/game.mjs";

let srv, browser;
const OUT = path.join(T.ROOT, "tests/out");
before(async () => { fs.mkdirSync(OUT, { recursive: true }); srv = await serve(T.ROOT); browser = await T.launch(); });
after(async () => { await browser?.close(); await srv?.close(); });
const luOpen = (page) => page.evaluate(() => !document.querySelector("#levelup").classList.contains("hidden"));

test("subir de nível: a tela abre sozinha, a escolha vale e fica no save", async () => {
  const { ctx, page } = await T.newPage(browser);
  try {
    await T.openDev(page, srv.url, "dev=camp&cls=guerreiro&race=humano");
    await T.play(page);
    assert.equal(await luOpen(page), false);
    // a level, as a fight would give it
    await page.evaluate(() => { for (const p of window.G.party) window.G.hooks.gainXp(p, 300); });
    await T.waitFor(page, () => !document.querySelector("#levelup").classList.contains("hidden"), null, 10000);
    // Lyra comes with her choice made; the hero has to choose
    const s = await page.evaluate(() => ({ ok: document.querySelector("#levelup [data-ok]").disabled, who: [...document.querySelectorAll("#levelup [data-who] small")].map((e) => e.textContent) }));
    assert.equal(s.ok, true, "confirmar espera a escolha do herói");
    assert.match(s.who[1], /Onda Trovejante/, "a sugestão de Lyra: " + s.who[1]);
    await page.screenshot({ path: path.join(OUT, "nivel-tela.jpg"), type: "jpeg", quality: 80 });
    // "later" keeps it waiting, with the + on the portrait; the + opens it again
    await page.click("#levelup [data-later]");
    assert.equal(await luOpen(page), false);
    await T.sleep(1600);
    assert.equal(await luOpen(page), false, "depois de 'Depois' a tela não volta sozinha");
    await page.click("#party .pcard .lv.up");
    assert.equal(await luOpen(page), true);
    await page.click('#levelup .lu-opt[data-k="surge"]');
    await page.click("#levelup [data-ok]");
    const after = await page.evaluate(() => ({ hero: window.G.hero.abilities, lyra: window.G.mate.abilities, picks: window.G.hero.build.picks, gpicks: window.G.build.picks }));
    assert.ok(after.hero.includes("surge"), "o herói aprendeu o Surto de Ação");
    assert.ok(after.lyra.includes("thunder"), "Lyra aprendeu a Onda Trovejante");
    assert.deepEqual(after.gpicks, after.picks);
    // saved and loaded: the choice is still there, nothing pending
    const { snap } = await T.saveAndExport(page, path.join(OUT, "nivel.brumafolha"));
    const { ctx: c2, page: p2 } = await T.newPage(browser);
    try {
      await T.importAndLoad(p2, srv.url, path.join(OUT, "nivel.brumafolha"));
      const got = await T.snapshot(p2);
      assert.deepEqual(T.compare(snap, got), []);
      assert.ok(got.abilities.includes("surge"));
      await T.sleep(1800);
      assert.equal(await luOpen(p2), false, "nada pendente depois de carregar");
      assert.deepEqual(p2.errors, []);
    } finally { await c2.close(); }
    assert.deepEqual(page.errors, []);
  } finally { await ctx.close(); }
});

test("save antigo (0.8.0) com o grupo no nível 3: duas escolhas pendentes para cada um, com sugestão", async () => {
  const { ctx, page } = await T.newPage(browser);
  try {
    await T.importAndLoad(page, srv.url, path.join(T.SAVES, "0.8.0/a1-fim-pacto-nix.brumafolha"));
    await T.waitFor(page, () => !document.querySelector("#levelup").classList.contains("hidden"), null, 10000);
    const who = await page.evaluate(() => [...document.querySelectorAll("#levelup [data-who] b")].map((e) => e.textContent));
    assert.deepEqual(who.length, 3, "herói, Lyra e Nix: " + who.join(", "));
    await page.screenshot({ path: path.join(OUT, "nivel-save-antigo.jpg"), type: "jpeg", quality: 80 });
    const chosen = await T.levelUp(page);
    assert.equal(chosen.length, 2, "o herói escolheu duas vezes (níveis 2 e 3)");
    const picks = await page.evaluate(() => window.G.party.map((p) => (p.build.picks ?? []).map((x) => x.lv)));
    assert.deepEqual(picks, [[2, 3], [2, 3], [2, 3]]);
    const nix = await page.evaluate(() => window.G.party.find((p) => p.key === "nix").abilities);
    assert.ok(nix.includes("aim") && nix.includes("dodge"), "Nix com as sugestões: " + nix);
    assert.deepEqual(page.errors, []);
  } finally { await ctx.close(); }
});

test("cada habilidade de subida de nível funciona numa luta", async () => {
  const { ctx, page } = await T.newPage(browser, { dice: "fail" });
  try {
    await T.openDev(page, srv.url, "dev=camp&cls=patrulheiro&race=humano");
    await T.play(page);
    await T.goTo(page, 22, 24);
    await T.play(page, ["Chegar devagar, de mãos abertas"], { until: ["explore", "combat"] });
    await T.waitPartyTurn(page);
    const keys = ["surge", "guard", "dodge", "arcshield", "reckless", "warcry", "bless", "command", "sleepword", "thunder", "hadar", "frostray", "chilltouch", "volley", "aim", "stun", "windstep"];
    const res = await page.evaluate(async (keys) => {
      const C = await import("/src/combat.js"), G = window.G, out = {};
      for (const k of keys) {
        const u = G.combat.active, foe = G.enemies.find((e) => e.hp > 0 && !e.gone);
        if (!foe) break;
        Object.assign(u, { action: 1, bonus: 1, moveLeft: u.move, slots: 3, spellAtk: 5, restUsed: {}, used: {}, turnUsed: {} });
        foe.hp = 99; foe.maxHp = 99;
        // the foe comes next to the one acting, for the abilities that touch
        const [tx, ty] = C.tileOf(u); [foe.x, foe.y] = C.tileCenter(tx + 1, ty);
        try { await C.useAbility(u, C.abilityOf(u, k), foe); out[k] = "ok"; } catch (e) { out[k] = String(e); }
      }
      return out;
    }, keys);
    for (const k of keys) assert.equal(res[k], "ok", `${k}: ${res[k]}`);
    assert.deepEqual(page.errors, []);
  } finally { await ctx.close(); }
});
