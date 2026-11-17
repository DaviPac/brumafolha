// The first night in Vau-de-Cardo: the screen goes dark and the Echo makes its offer in the dark. The conversation must
// be drawn ON TOP of the black (a bug left it under the fade: the player saw a black screen with a question nobody could
// see), and morning must come back after it. Tried by the fire and at the tavern, from a 0.8.0 save.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { serve } from "./lib/server.mjs";
import * as T from "./lib/game.mjs";

let srv, browser;
before(async () => { srv = await serve(T.ROOT); browser = await T.launch(); });
after(async () => { await browser?.close(); await srv?.close(); });

/**
 * What the player sees where the conversation box is: a picture of that rectangle. All black (the box under the fade)
 * compresses to almost nothing; a box with a frame and text does not.
 */
async function dialogueOnTop(page) {
  const r = await page.evaluate(() => { const b = document.querySelector("#dialogue").getBoundingClientRect(); return { x: b.left, y: b.top, width: b.width, height: b.height }; });
  const png = await page.screenshot({ clip: r, type: "png" });
  const black = await page.screenshot({ clip: { ...r, y: Math.max(0, r.y - r.height - 40) }, type: "png" }); // the dark screen above it
  return { onTop: png.length > black.length * 3, bytes: png.length, black: black.length, fade: await page.evaluate(() => getComputedStyle(document.querySelector("#fade")).opacity) };
}

async function night(page, start) {
  await start();
  await T.waitFor(page, () => ["cutscene", "dialogue"].includes(window.G.mode) && getComputedStyle(document.querySelector("#fade")).opacity === "1", null, 20000);
  await T.waitFor(page, () => !document.querySelector("#dialogue").classList.contains("hidden"), null, 20000);
  await T.sleep(300);
  const seen = await dialogueOnTop(page);
  assert.equal(seen.fade, "1", "a tela está escura");
  assert.ok(seen.onTop, `a conversa do Eco aparece por cima do escuro (captura da caixa: ${seen.bytes} bytes; da tela escura acima dela: ${seen.black})`);
  await T.play(page, ["Não. Nenhuma."]);
  await T.waitFor(page, () => window.G.f.rested1 && window.G.mode === "explore" && getComputedStyle(document.querySelector("#fade")).opacity === "0", null, 20000);
  assert.ok((await page.evaluate(() => window.G.clock)) < 10, "amanheceu");
  assert.deepEqual(page.errors, []);
}

test("primeiro descanso em Vau-de-Cardo, na fogueira: o Eco aparece no escuro e amanhece", async () => {
  const { ctx, page } = await T.newPage(browser);
  try {
    await T.importAndLoad(page, srv.url, path.join(T.SAVES, "0.8.0/a1-vau-explorando.brumafolha"));
    await night(page, async () => {
      await page.evaluate(() => { const G = window.G; G.f.tribute_seen = true; G.f.iara = "forgot"; const f = G.W.objects.find((o) => o.kind === "campfire"); const l = G.party[G.leader]; l.x = f.x; l.y = f.y - 28; l.path = []; });
      await T.sleep(300);
      await page.keyboard.press("e");
    });
  } finally { await ctx.close(); }
});

test("primeiro descanso em Vau-de-Cardo, na taverna: o mesmo", async () => {
  const { ctx, page } = await T.newPage(browser);
  try {
    await T.importAndLoad(page, srv.url, path.join(T.SAVES, "0.8.0/a1-vau-explorando.brumafolha"));
    await night(page, async () => {
      await T.interact(page, "Rosalva, a taverneira");
      await T.play(page, ["Mostrar a Carta", "Preciso de um lugar", "Pagar 5"], { until: ["dialogue"] });
    });
  } finally { await ctx.close(); }
});
