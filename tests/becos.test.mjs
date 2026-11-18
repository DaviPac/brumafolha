// Saves stuck in a dead end of an older version (tests/becos/, made by make-becos.mjs) load in this one and get out:
// the story goes on from where the player was stopped.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { serve } from "./lib/server.mjs";
import * as T from "./lib/game.mjs";

let srv, browser;
before(async () => { srv = await serve(T.ROOT); browser = await T.launch(); });
after(async () => { await browser?.close(); await srv?.close(); });
const BECOS = path.join(T.ROOT, "tests/becos");
const F = (page, k) => page.evaluate((k) => window.G.f[k], k);
const shot = (page, name) => page.screenshot({ path: path.join(T.ROOT, "tests/out", `beco-${name}.jpg`), type: "jpeg", quality: 75 });

test("beco: Tomé mandado para casa antes de mostrar a porta (save 0.9.0)", async () => {
  const { ctx, page } = await T.newPage(browser);
  try {
    await T.importAndLoad(page, srv.url, path.join(BECOS, "tome-em-casa-sem-porta.brumafolha"));
    assert.equal(await F(page, "trapdoor_open"), undefined, "o save estava preso");
    assert.equal(await F(page, "tome_told"), true, "ao carregar, o Tomé já contou onde fica a laje");
    // the save was made near the goblin patrol's clearing: it comes up first, and is left for later
    await T.sleep(800);
    if (await page.evaluate(() => !document.querySelector("#dialogue").classList.contains("hidden"))) await T.play(page, ["Voltar por enquanto."]);
    // and the boy, at the pier, says it again
    await T.interact(page, "Tomé");
    await T.play(page, ["Onde fica aquela porta", "Não conto."], { shots: { "No pé da coluna partida": path.join(T.ROOT, "tests/out/beco-tome-cais.jpg") } });
    // the column, where he said: found for sure, no roll
    await T.interact(page, "Coluna partida");
    await T.play(page, ["Raspar a terra no pé da coluna"]);
    assert.equal(await F(page, "trapdoor_open"), true, "a laje se abriu");
    await T.interact(page, "Alçapão");
    await T.play(page, ["Descer ao Relicário."]);
    await T.waitFor(page, () => window.G.W.id === "relicario");
    assert.deepEqual(page.errors, []);
  } finally { await ctx.close(); }
});

test("beco: luta do Relicário vencida antes do Eco falar (save 0.9.0)", async () => {
  const { ctx, page } = await T.newPage(browser);
  try {
    await T.importAndLoad(page, srv.url, path.join(BECOS, "relicario-sem-eco.brumafolha"));
    // the save had no Echo; the repair may already have started its moment ("pending") by now
    assert.ok([undefined, "pending"].includes(await F(page, "echo")), "o save estava sem o Eco");
    // the Echo's moment comes by itself, a second after the load
    await T.waitFor(page, () => window.G.mode === "cutscene" || !document.querySelector("#dialogue").classList.contains("hidden"));
    await T.play(page, ["Aceitar."]);
    assert.equal(await F(page, "echo"), "accepted");
    assert.ok(await page.evaluate(() => window.G.hero.abilities.includes("lampejo")), "o Lampejo");
    await shot(page, "relicario-eco");
    // and the escape goes on
    await T.interact(page, "Escada (fugir!)");
    await T.play(page);
    await T.waitFor(page, () => window.G.W.id === "vale" && window.G.f.escape);
    assert.deepEqual(page.errors, []);
  } finally { await ctx.close(); }
});
