// Chapter 2 played end to end, three ways, from the reference saves of 0.8.0 and from the ?dev= shortcut. On the way,
// saves are made in the new maps (exploring, in a conversation, in a fight), loaded back, and compared.
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

const F = (page, k) => page.evaluate((k) => window.G.f[k], k);
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `c2-${name}.jpg`), type: "jpeg", quality: 70 });

/** Save now, load the save back (the page reloads), and check that nothing changed. */
async function saveReload(page, name) {
  const file = path.join(OUT, `c2-${name}.brumafolha`);
  const { snap } = await T.saveAndExport(page, file);
  await T.importAndLoad(page, srv.url, file);
  const got = await T.snapshot(page);
  assert.deepEqual(T.compare(snap, got), [], `save novo "${name}" volta igual`);
}
/** Answer a question that may have gone either way (a d20): if a fight started, win it. */
async function settle(page) {
  if (await page.evaluate(() => window.G.mode === "combat")) { await T.winFight(page); }
  await T.play(page);
}

async function woods(page, { mothPick, saveTalk, saveFight }) {
  await T.waitFor(page, () => window.G.W.id === "bosque");
  await T.goTo(page, 17, 25);
  await T.interact(page, "Abel, o lenhador");
  if (saveTalk) {
    await T.play(page, ["Quem é você?"], { until: ["dialogue"] });
    await saveReload(page, "conversa-abel");
    await T.play(page, ["Eu levo para ela.", "Até mais."]);
  } else await T.play(page, ["Quem é você?", "Eu levo para ela.", "Até mais."]);
  assert.ok(await F(page, "q_pipa"), "missão de Pipa");
  await T.goTo(page, 29, 16);
  await T.play(page, [mothPick], { until: ["explore", "combat"] });
  if (await page.evaluate(() => window.G.mode === "combat")) {
    if (saveFight) { await T.waitPartyTurn(page); await saveReload(page, "combate-mariposas"); }
    await T.winFight(page);
  }
  await T.play(page);
  assert.ok(await F(page, "c2_moths"));
  if (await page.evaluate(async () => (await import("/src/story.js")).interactables().some((i) => i.name === "Bolsa da peregrina"))) { await T.interact(page, "Bolsa da peregrina"); await T.play(page); }
  await T.goTo(page, 47, 18);
  await T.play(page);
  await T.waitFor(page, () => window.G.W.id === "mosteiro" && window.G.f.c2_arrived);
}

async function monastery(page, v) {
  // Clara and her tea
  await T.interact(page, "Irmã Clara");
  await T.play(page, ["Uma xícara de chá.", v.tea, ...(v.tea.includes("Obrigado") ? ["Até mais."] : [])]);
  // Pipa and the wooden bird
  await T.interact(page, "Menina de branco");
  await T.play(page, ["Mostrar o passarinho", "Continuar", "Voltar.", v.pipaCome ? "Quer ir ver o seu pai?" : "Até mais."], { until: ["explore", "dialogue"] });
  // the d20 decides: if she says no, the conversation goes back to its start and waits for a way out; if she says
  // yes, it ends by itself and "Até mais." is never asked
  await T.play(page, ["Até mais."]).catch((e) => { if (!/escolhas não usadas/.test(e.message)) throw e; });
  assert.ok(await F(page, "pipa_bird"), "Pipa recebeu o passarinho");
  // the Mother, in the garden
  await T.goTo(page, 31, 22);
  await T.play(page, v.madre);
  assert.ok(await F(page, "c2_madre"), "conversou com a Madre");
  if (v.sleep) { await T.interact(page, "Hospedaria"); await T.play(page, ["Dormir aqui."]); assert.ok(await F(page, "c2_slept")); }
  // a way to the hidden door: Silas, or the seal for Tadeu
  if (v.silas) { await T.interact(page, "Irmão Silas"); await T.play(page, ["Onde está o Sabiá?", "Continuar", "..."]); assert.ok(await F(page, "c2_silas")); }
  if (v.tadeu) { await T.interact(page, "Irmão Tadeu"); await T.play(page, ["Por que nunca tomou?", "Não. Mas trago", "Mostrar o sinete", "Continuar", "..."]); assert.ok(await F(page, "c2_tadeu")); }
  // inside, by the kitchen door
  await T.interact(page, "Porta da cozinha");
  await T.play(page);
  await T.waitFor(page, () => window.G.W.id === "claustro");
  if (v.kettle) { await T.interact(page, "Chaleiras"); await T.play(page, [v.kettle]); }
  if (v.saveInside) await saveReload(page, "claustro-explorando");
  await T.interact(page, "Altar do Véu");
  await T.play(page, v.altar ?? []);
  assert.ok(await F(page, "c2_altar"), "a porta atrás do véu");
  // the wing: the guards
  await T.goTo(page, 26, 6);
  await T.play(page, [v.guards], { until: ["explore", "combat"] });
  if (await page.evaluate(() => window.G.mode === "combat")) {
    if (v.saveFight) { await T.waitPartyTurn(page); await saveReload(page, "combate-guardas"); }
    await T.winFight(page);
    await T.play(page);
  }
  // Hulda
  await T.interact(page, "Grades da cela");
  await T.play(page, [v.bars, v.wake]);
  assert.ok(await F(page, "hulda_joined"), "Hulda entrou no grupo");
  assert.ok(await page.evaluate(() => window.G.party.some((p) => p.key === "hulda")));
  // L. and the book
  await T.interact(page, "Velho de cinza");
  await T.play(page, [v.sabia]);
  assert.ok(await F(page, "c2_sabia"));
  await T.interact(page, "Livro de nomes");
  await T.play(page, [v.book]);
  if (v.saveAfter) await saveReload(page, "depois-de-hulda");
  // out, to the gate: the choice
  await T.goTo(page, 17, 16);
  await T.interact(page, "Saída para o pátio");
  await T.play(page);
  await T.waitFor(page, () => window.G.W.id === "mosteiro");
  await T.goTo(page, 2, 15);
  await T.play(page, [v.choice], { until: ["explore", "combat"] });
  if (await page.evaluate(() => window.G.mode === "combat")) { await T.winFight(page); await T.play(page); }
  await T.waitFor(page, () => window.G.f.ch2_done, null, 60000);
  await T.play(page);
  assert.equal(await page.evaluate(() => window.G.W.id), "bosque");
  assert.equal(await F(page, "c2_choice"), v.choiceFlag);
}

test("capítulo 2 a partir do save 0.8.0 com pacto e Nix: em paz, só Hulda", async () => {
  const { ctx, page } = await T.newPage(browser, { seed: 11 });
  try {
    await T.importAndLoad(page, srv.url, path.join(T.SAVES, "0.8.0/a1-fim-pacto-nix.brumafolha"));
    await T.toChapter2(page);
    await woods(page, { mothPick: "Pegar a lanterna", saveTalk: true });
    await shot(page, "a-mosteiro");
    await monastery(page, {
      tea: "Obrigado, não.", pipaCome: true,
      madre: ["Eu não sei.", "Ficar em silêncio.", "Otávio, pescador"],
      silas: true, kettle: "Deixar Nix cuidar disso.", saveInside: true, guards: "Esperar.",
      bars: "Usar a chave da cela.", wake: "Perguntar, bem alto", sabia: "Você é L.", book: "Deixar Nix levar o livro inteiro.",
      saveAfter: true, choice: "Deixar o Mosteiro em paz", choiceFlag: "peace",
    });
    await shot(page, "a-fim");
    assert.equal(await F(page, "pipa"), (await F(page, "pipa_follow")) ? "home" : undefined, "Pipa: em casa se veio junto");
    assert.deepEqual(page.errors, []);
  } finally { await ctx.close(); }
});

test("capítulo 2 a partir do save 0.8.0 sem pacto nem Nix: dormir lá, lutar, atacar", async () => {
  const { ctx, page } = await T.newPage(browser, { seed: 5 });
  try {
    await T.importAndLoad(page, srv.url, path.join(T.SAVES, "0.8.0/a1-fim-sem-pacto-sem-nix.brumafolha"));
    await T.toChapter2(page);
    await woods(page, { mothPick: "Atacar.", saveFight: true });
    await monastery(page, {
      tea: "Beber.", pipaCome: false,
      madre: ["A dor era o que sobrava", "Contar uma lembrança da sua origem", "Talvez a senhora tenha razão."],
      sleep: true, tadeu: true, guards: "Aceitar a xícara", saveFight: true,
      bars: "Usar a chave da cela.", wake: "Examinar a respiração", sabia: "Por que você me mandou", book: "Ler em voz alta",
      choice: "Atacar o Mosteiro agora", choiceFlag: "attack",
    });
    await shot(page, "b-fim");
    assert.ok(await F(page, "c2_madre_left"));
    assert.deepEqual(page.errors, []);
  } finally { await ctx.close(); }
});

test("capítulo 2 pelo atalho ?dev=ato1c2: denunciar à Coroa", async () => {
  const { ctx, page } = await T.newPage(browser, { seed: 3 });
  try {
    await T.openDev(page, srv.url, "dev=ato1c2&cls=clerigo&race=anao&f=otavio_found,silas_doubt,nix_joined,maren_aboard,eco_trade=o2");
    await T.play(page);
    await woods(page, { mothPick: "Chegar por trás" });
    await monastery(page, {
      tea: "Fingir que bebe", pipaCome: false,
      madre: ["Você não escolheu", "Ficar em silêncio.", "Otávio, pescador"],
      silas: true, guards: "O Irmão Silas manda dizer",
      bars: "Deixar Nix abrir.", wake: "Perguntar, bem alto", sabia: "O que é isso na minha mão?", book: "Arrancar a página",
      choice: "Mandar a página do registro", choiceFlag: "crown",
    });
    assert.deepEqual(page.errors, []);
  } finally { await ctx.close(); }
});
