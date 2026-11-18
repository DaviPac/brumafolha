// The story played to the end of each part in orders other than the ideal one: with every d20 failing, skipping
// everything optional, doing the optional things before the main ones, and in the "wrong" order of each dead end that
// was fixed (Tomé sent home before he showed the door; the slab searched before meeting him; the Relicário won before
// the Echo spoke; the letter burned before Vau-de-Cardo; the guards sent away without the key). Pictures of the
// corrected lines go to tests/out/historia-*.jpg.
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
const pic = (name) => path.join(OUT, `historia-${name}.jpg`);
const map = (page) => page.evaluate(() => window.G.W.id);
/** The answers on screen right now (the conversation is left open). */
const options = (page) => page.evaluate(() => [...document.querySelectorAll("#dialogue .opt")].map((o) => o.textContent));
/** Play an answer that may start a fight; win the fight; play on. */
async function playFight(page, picks, after = []) {
  await T.play(page, picks, { until: ["explore", "combat"] });
  if (await page.evaluate(() => window.G.mode === "combat")) { await T.winFight(page); await T.play(page, after); }
}

// ---------------------------------------------------------------- the prologue: from the camp to the boat
async function relicario(page, { atrium, archivist, cendra, echo }) {
  await T.waitFor(page, () => window.G.W.id === "relicario");
  await T.play(page);
  await T.goTo(page, 11, 22); await T.play(page, [atrium]);
  for (const pick of [["Minha mãe.", "É esse o nome."], ["A estrada."], ["Um medo."]]) { await T.interact(page, "Estátua de uma arquivista"); await T.play(page, pick); }
  assert.ok(await F(page, "door_open"), "a porta das três Lumes");
  await T.goTo(page, 11, 7); await T.play(page);
  await T.goTo(page, 11, 5);
  await T.play(page, [...archivist, "Estender a mão para a Lume.", ...cendra], { until: ["combat"] });
  // won at once, in the first round, nobody down: the Echo comes when the fight ends
  await T.winFight(page);
  await T.waitFor(page, () => window.G.f.echo === "pending" || !!window.G.f.relic_collapse);
  await T.play(page, [echo], { shots: { "A poeira da luta": pic("eco-depois-da-luta") } });
  assert.equal(await F(page, "echo"), echo === "Aceitar." ? "accepted" : "refused", "o Eco entrou");
  assert.ok(await F(page, "relic_collapse"));
}
async function boatToAct1(page, picks = []) {
  // the dock, the boat, the Diário that opens by itself, the end screen, and on to Vau-de-Cardo
  picks = [...picks];
  const t0 = Date.now();
  while (!(await page.evaluate(() => window.G.f.act1 && window.G.W.id === "vau"))) {
    if (Date.now() - t0 > 240000) throw new Error("o fim do prólogo não chegou ao Ato I");
    const s = await page.evaluate(() => ({
      journal: !document.querySelector("#journal")?.classList.contains("hidden"),
      dice: !document.querySelector("#dice").classList.contains("hidden") && !!document.querySelector("#dice").onclick,
      opts: [...document.querySelectorAll("#dialogue:not(.hidden) .opt")].map((o) => o.textContent),
      end: !document.querySelector("#endscreen").classList.contains("hidden"),
    }));
    if (s.dice) await page.evaluate(() => document.querySelector("#dice").onclick());
    else if (s.journal) await page.evaluate(async () => (await import("/src/journal.js")).closeJournal());
    else if (s.end) await page.click("#endscreen button");
    else if (s.opts.length) {
      const i = picks.length ? Math.max(0, s.opts.findIndex((o) => o.includes(picks[0]))) : 0;
      if (picks.length && s.opts[i].includes(picks[0])) picks.shift();
      await page.evaluate((k) => document.querySelectorAll("#dialogue .opt")[k].click(), i);
    }
    await T.sleep(250);
  }
  await T.play(page);
}

test("prólogo falhando todas as rolagens, com o Tomé mandado para casa antes de mostrar a porta", async () => {
  const { ctx, page } = await T.newPage(browser, { dice: "fail" });
  try {
    await T.openDev(page, srv.url, "dev=camp&cls=guerreiro&race=humano");
    await T.play(page);
    // Maren: every question with a roll is asked once, and fails
    await T.interact(page, "Maren, a pescadora");
    await T.play(page, ["Nós vamos recuperar", "Mais uma pergunta.", "Um trabalho desses", "Você está escondendo", "O que você sabe das ruínas"], { until: ["dialogue"] });
    const after = await options(page);
    assert.ok(!after.some((o) => /Um trabalho desses|escondendo|sabe das ruínas/.test(o)), "as rolagens que falharam não voltam: " + after.join(" | "));
    await T.play(page, ["Até mais, Maren."]);
    // the patrol, talked to and failed: a fight
    await T.goTo(page, 22, 24);
    await playFight(page, ["Chegar devagar, de mãos abertas"]);
    await T.interact(page, "Pilha de coisas roubadas"); await T.play(page, ["Pegar a rede e a cadeira."]);
    await T.interact(page, "Maren, a pescadora"); await T.play(page, ["Trouxemos a cadeira", "Até mais, Maren."]);
    // the ruins: talking fails, a fight
    await T.goTo(page, 20, 12);
    await playFight(page, ["Ninguém precisa quebrar"]);
    assert.equal(await F(page, "clan"), "fight");
    // Tomé, sent home before he showed the door
    await T.interact(page, "Tomé");
    await T.play(page, ["Sua avó está te esperando"]);
    assert.ok(await F(page, "tome_home"));
    assert.ok(!(await F(page, "trapdoor_open")), "a porta ainda está fechada");
    // at the pier he still says where it is; at the column, the slab is found for sure
    await T.interact(page, "Tomé");
    await T.play(page, ["Onde fica aquela porta", "Não conto."], { shots: { "No pé da coluna partida": pic("tome-no-cais") } });
    await T.interact(page, "Coluna partida");
    await T.play(page, ["Raspar a terra no pé da coluna"], { shots: { "o rosto de um menino": pic("laje-achada") } });
    assert.ok(await F(page, "trapdoor_open"), "a laje se abriu sem rolagem");
    await T.interact(page, "Alçapão"); await T.play(page, ["Descer ao Relicário."]);
    await relicario(page, { atrium: "Lembrar o que se conta", archivist: ["Você está mentindo"], cendra: ["Silas. Você não quer", "Tudo bem. A Lume é sua."], echo: "Aceitar." });
    // Otávio: the carving is compared once; after the failure the answer is gone
    await T.interact(page, "Esvaído pescador"); await T.play(page, ["Comparar o entalhe da faca com o da cadeira."]);
    assert.equal(await F(page, "otavio_try"), false);
    await T.interact(page, "Esvaído pescador");
    assert.deepEqual((await options(page)).map((o) => o.replace(/^\d/, "")), ["Deixá-lo."], "a comparação não volta");
    await T.play(page, ["Deixá-lo."]);
    // the escape and the boat
    await T.interact(page, "Escada (fugir!)"); await T.play(page);
    await T.waitFor(page, () => window.G.W.id === "vale" && window.G.f.escape);
    await T.goTo(page, 37, 26);
    await boatToAct1(page);
    assert.ok(await F(page, "maren_aboard"), "Maren no barco");
    assert.deepEqual(page.errors, []);
  } finally { await ctx.close(); }
});

test("prólogo pulando tudo o que é opcional: a coluna antes do Tomé, e a luta do Relicário ganha de uma vez", async () => {
  const { ctx, page } = await T.newPage(browser, { dice: "fail" });
  try {
    await T.openDev(page, srv.url, "dev=camp&cls=mago&race=halfling");
    await T.play(page);
    await T.goTo(page, 20, 12);
    await playFight(page, ["Então vamos quebrar."]);
    // the column first, without knowing: one roll, failed; then only the boy can show it
    await T.interact(page, "Coluna partida");
    await T.play(page, ["Procurar alguma coisa no pé da coluna."]);
    assert.equal(await F(page, "column_try"), false);
    await T.interact(page, "Coluna partida");
    await T.play(page, [], { shots: { "Talvez o menino": pic("coluna-sem-tome") } });
    assert.ok(!(await F(page, "trapdoor_open")));
    await T.interact(page, "Tomé");
    await T.play(page, ["Mostre essa porta.", "Tá bem. Pode vir"]);
    assert.ok(await F(page, "trapdoor_open"));
    await T.interact(page, "Alçapão"); await T.play(page, ["Descer ao Relicário."]);
    await relicario(page, { atrium: "Seguir em frente.", archivist: [], cendra: ["Entregar a Lume."], echo: "Recusar." });
    await T.interact(page, "Escada (fugir!)"); await T.play(page);
    await T.waitFor(page, () => window.G.W.id === "vale" && window.G.f.escape);
    await T.goTo(page, 37, 26);
    // Maren doesn't know anyone: pulling her to the boat fails
    await boatToAct1(page, ["Puxá-la para o barco."]);
    assert.ok(await F(page, "tome_alive"));
    assert.deepEqual(page.errors, []);
  } finally { await ctx.close(); }
});

// ---------------------------------------------------------------- Act I, chapter 1
test("capítulo 1 falhando todas as rolagens, sem a carta, com tudo o que é opcional antes", async () => {
  const { ctx, page } = await T.newPage(browser, { dice: "fail" });
  try {
    await T.openDev(page, srv.url, "dev=ato1&cls=guerreiro&race=humano&f=offered_letter,clan=scared,smoke_out,maren_aboard,maren_forgot,tome_alive");
    await T.play(page);
    await page.evaluate(() => { const i = window.G.items.findIndex((x) => x.id === "letter"); window.G.items.splice(i, 1); }); // burned in the valley
    // the optional things first: the board, the tribute, Nix's strongbox
    await T.interact(page, "Quadro de avisos"); await T.play(page, ["Arrancar o cartaz."]);
    await T.goTo(page, 6, 18);
    await T.play(page, ["Encoste nela", "Deixar acontecer."]);
    assert.equal(await F(page, "iara"), "forgot");
    await T.interact(page, "Mulher de capa rubra"); await T.play(page, ["O que você quer?", "Fechado.", "Até mais."]);
    await T.interact(page, "Cofre do comandante"); await T.play(page, ["Ir por trás das caixas"]);
    await T.interact(page, "Cofre do comandante");
    await T.play(page, ["Sargento!"]);
    // both ways past the sergeant failed: they don't come back, the purse is left
    await T.interact(page, "Cofre do comandante");
    const box = await options(page);
    assert.ok(!box.some((o) => /caixas|Sargento!/.test(o)), "as tentativas que falharam não voltam: " + box.join(" | "));
    await T.play(page, ["Deixar uma bolsa", "Abrir o cadeado."]);
    assert.equal(await F(page, "box_lock"), false);
    await T.interact(page, "Cofre do comandante");
    await T.play(page, ["Assobiar para Nix"], { shots: { "Convença, eu disse": pic("cofre-nix") } });
    assert.ok(await F(page, "lume_got"), "a Lume, com a ajuda de Nix");
    await T.interact(page, "Nix"); await T.play(page, ["Ela é de uma velha"]);
    assert.ok(await F(page, "nix_joined"));
    // Rosalva, without the letter: every roll fails, the mark is the way
    await T.interact(page, "Rosalva, a taverneira");
    await T.play(page, ["Você não é só taverneira.", "Procuro alguém", "Quem recebeu trezentas peças"], { until: ["dialogue"] });
    const L = await options(page);
    assert.ok(!L.some((o) => /Quem recebeu|amigo antigo/.test(o)), "as perguntas que falharam não voltam: " + L.join(" | "));
    await T.play(page, ["Abrir a mão no balcão", "Preciso de um lugar", "Pagar 5 peças", "Não. Nenhuma."], { shots: { "Ela olha a palma": pic("rosalva-marca") } });
    assert.ok(await F(page, "note"), "o recado de L.");
    await T.waitFor(page, () => window.G.f.rested1 && window.G.mode === "explore");
    // the gate, the procession, Murta, the hunters, Odara
    await T.goTo(page, 41, 12);
    await T.play(page, ["Mostrar só a mão sem marca"]);
    await T.waitFor(page, () => window.G.W.id === "travessia");
    await T.play(page);
    await T.goTo(page, 10, 14);
    await T.play(page, ["Eles não escolheram isso", "Deixar a procissão passar."]);
    assert.ok(await F(page, "proc_free_try"));
    await T.goTo(page, 25, 14);
    await T.play(page, ["Eu estava errado"]);
    await T.goTo(page, 36, 14);
    await playFight(page, []);
    await T.interact(page, "Mensageira amarrada");
    await T.play(page, ["Ele mentiu para mim."], { endscreen: false });
    await T.waitFor(page, () => window.G.f.ch1_done);
    await T.sleep(2000);
    await T.play(page); // the end of the chapter: "Seguir para o Mosteiro"
    await T.waitFor(page, () => window.G.W.id === "bosque" && window.G.f.c2, null, 30000);
    assert.deepEqual(page.errors, []);
  } finally { await ctx.close(); }
});

// ---------------------------------------------------------------- Act I, chapter 2
async function toMonastery(page) {
  await T.goTo(page, 47, 18);
  await T.play(page);
  await T.waitFor(page, () => window.G.W.id === "mosteiro" && window.G.f.c2_arrived);
  await T.play(page);
}
async function inside(page, door = "Porta da cozinha") {
  await T.interact(page, door); await T.play(page);
  await T.waitFor(page, () => window.G.W.id === "claustro");
}
async function outside(page) {
  await T.goTo(page, 17, 16);
  await T.interact(page, "Saída para o pátio"); await T.play(page);
  await T.waitFor(page, () => window.G.W.id === "mosteiro");
}
async function chooseAndEnd(page, choice) {
  await T.goTo(page, 2, 15);
  await playFight(page, [choice]);
  await T.waitFor(page, () => window.G.f.ch2_done, null, 60000);
  await T.play(page);
}

test("capítulo 2 falhando todas as rolagens: a porta pelo Silas, a chave depois da luta", async () => {
  const { ctx, page } = await T.newPage(browser, { dice: "fail" });
  try {
    await T.openDev(page, srv.url, "dev=ato1c2&cls=clerigo&race=anao&f=silas_doubt,otavio_found");
    await T.play(page);
    await T.interact(page, "Abel, o lenhador"); await T.play(page, ["Quem é você?", "Eu levo para ela.", "Até mais."]);
    await T.goTo(page, 29, 16); await playFight(page, ["Chegar por trás e apagar a lanterna."]);
    await toMonastery(page);
    await T.interact(page, "Irmã Clara"); await T.play(page, ["Uma xícara de chá.", "Fingir que bebe"]);
    assert.equal(await F(page, "c2_tea"), "drank");
    await T.interact(page, "Menina de branco");
    await T.play(page, ["Mostrar o passarinho", "Continuar", "Voltar.", "Quer ir ver o seu pai?"], { until: ["dialogue"] });
    assert.ok(!(await options(page)).some((o) => /ver o seu pai/.test(o)), "o pedido que falhou não volta");
    await T.play(page, ["Até mais."]);
    await T.goTo(page, 31, 22); await T.play(page, ["A dor era o que sobrava", "Contar uma lembrança da sua origem", "Uma criança que não queria ir"]);
    // inside: the kettle and the altar, both failed once
    await inside(page);
    await T.interact(page, "Chaleiras"); await T.play(page, ["Pôr um punhado"]);
    assert.equal(await F(page, "c2_kettle_try"), false);
    await T.interact(page, "Altar do Véu"); await T.play(page, ["Procurar de onde vem o ar."]);
    assert.equal(await F(page, "c2_altar_try"), false);
    await T.interact(page, "Altar do Véu"); await T.play(page, [], { shots: { "Alguém da casa deve saber": pic("altar-depois-de-falhar") } });
    assert.ok(!(await F(page, "c2_altar")));
    // Silas, by the kitchen door, knows: then the altar opens for sure
    await T.interact(page, "Porta da cozinha"); await T.play(page);
    await T.waitFor(page, () => window.G.W.id === "mosteiro");
    await T.interact(page, "Irmão Silas"); await T.play(page, ["Onde está o Sabiá?", "Continuar", "..."]);
    await inside(page);
    await T.interact(page, "Altar do Véu"); await T.play(page);
    assert.ok(await F(page, "c2_altar"));
    await T.goTo(page, 26, 6); await playFight(page, ["O Irmão Silas manda dizer"]);
    // the bars: the wire and the force fail once each, the key from the fight opens
    await T.interact(page, "Grades da cela"); await T.play(page, ["Abrir a fechadura com um arame."]);
    await T.interact(page, "Grades da cela"); await T.play(page, ["Forçar as grades."]);
    await T.interact(page, "Grades da cela");
    const bars = await options(page);
    assert.ok(!bars.some((o) => /arame|Forçar/.test(o)), "as tentativas que falharam não voltam: " + bars.join(" | "));
    await T.play(page, ["Usar a chave da cela.", "Examinar a respiração"]);
    assert.ok(await F(page, "hulda_joined"));
    await T.interact(page, "Velho de cinza"); await T.play(page, ["O que é isso na minha mão?"], { shots: { "Pela respiração": pic("sabia-conta") } });
    await T.interact(page, "Livro de nomes"); await T.play(page, ["Arrancar a página"]);
    await outside(page);
    await chooseAndEnd(page, "Deixar o Mosteiro em paz");
    assert.equal(await F(page, "c2_choice"), "peace");
    assert.deepEqual(page.errors, []);
  } finally { await ctx.close(); }
});

test("capítulo 2 com todas as rolagens dando certo: Pipa levada ao pai antes da escolha, a chave no prego, dormir duas vezes", async () => {
  const { ctx, page } = await T.newPage(browser, { dice: "pass" });
  try {
    await T.openDev(page, srv.url, "dev=ato1c2&cls=guerreiro&race=humano");
    await T.play(page);
    await T.interact(page, "Abel, o lenhador"); await T.play(page, ["Quem é você?", "Eu levo para ela.", "Até mais."]);
    await T.goTo(page, 29, 16); await T.play(page, ["Pegar a lanterna"]);
    await toMonastery(page);
    await T.interact(page, "Menina de branco"); await T.play(page, ["Mostrar o passarinho", "Continuar", "Voltar.", "Quer ir ver o seu pai?"]);
    assert.ok(await F(page, "pipa_follow"));
    // back to the woods with her: the reunion happens now, once
    await T.goTo(page, 0, 15); await T.play(page);
    await T.waitFor(page, () => window.G.W.id === "bosque");
    await T.interact(page, "Abel, o lenhador");
    await T.play(page, [], { shots: { "Abel larga o machado": pic("pipa-e-abel") } });
    assert.equal(await F(page, "pipa"), "home");
    const xp = await page.evaluate(() => window.G.hero.xp);
    await toMonastery(page);
    // sleeping in the Monastery: the first night takes a line of the Diário; there is no second night
    await T.interact(page, "Hospedaria"); await T.play(page, ["Dormir aqui."]);
    const struck = await page.evaluate(() => window.G.memories.filter((m) => m.struck).length);
    await T.interact(page, "Hospedaria"); await T.play(page, [], { shots: { "No bosque": pic("segunda-noite") } });
    assert.equal(await page.evaluate(() => window.G.memories.filter((m) => m.struck).length), struck, "só uma linha riscada");
    await T.interact(page, "Irmão Tadeu"); await T.play(page, ["Por que nunca tomou?", "Não. Mas trago", "Mostrar o sinete", "Continuar", "..."]);
    await inside(page);
    await T.interact(page, "Altar do Véu"); await T.play(page);
    // the guards believe the lie and go back to their cups: the key is on its nail
    await T.goTo(page, 26, 6); await T.play(page, ["A Madre nos mandou ver o velho"]);
    assert.equal(await F(page, "c2_guards"), "talk");
    await T.interact(page, "Grades da cela"); await T.play(page, ["Pegar a chave no prego", "Perguntar, bem alto"]);
    assert.ok(await F(page, "hulda_joined"));
    await outside(page);
    await chooseAndEnd(page, "Deixar o Mosteiro em paz");
    assert.equal(await F(page, "pipa"), "home");
    assert.equal(await page.evaluate(() => window.G.memories.filter((m) => m.id === "pipa_home").length), 1, "o reencontro uma vez só");
    assert.ok((await page.evaluate(() => window.G.hero.xp)) >= xp);
    assert.deepEqual(page.errors, []);
  } finally { await ctx.close(); }
});
