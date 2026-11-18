// A guided tour of the game for the refinement pass (docs/refinamento.md): two playthroughs with different heroes and
// companions, from the camp to the end of chapter 2, with pictures of the moments the diagnosis talks about.
// node tour.mjs antes|depois  → tests/out/tour/<label>-*.jpg
import path from "node:path";
import fs from "node:fs";
import { serve } from "./lib/server.mjs";
import * as T from "./lib/game.mjs";

const label = process.argv[2] ?? "antes";
const OUT = path.join(T.ROOT, "tests/out/tour");
fs.mkdirSync(OUT, { recursive: true });
const shot = async (page, name) => { await T.sleep(500); await page.screenshot({ path: path.join(OUT, `${label}-${name}.jpg`), type: "jpeg", quality: 80 }); console.log("foto", name); };
const playFight = async (page, picks, after = [], name = null) => {
  await T.play(page, picks, { until: ["explore", "combat"], auto: true });
  if (await page.evaluate(() => window.G.mode === "combat")) {
    await T.waitPartyTurn(page);
    if (name) {
      // hover the nearest enemy: what the player reads before attacking
      await page.evaluate(() => { const e = window.G.enemies.find((e) => e.hp > 0); const [tx, ty] = window.__B.combat.tileOf(e); window.__B.combat.combatHover(tx, ty); });
      await shot(page, name);
    }
    await T.winFight(page); await T.play(page, after, { auto: true });
  }
};
const srv = await serve(T.ROOT), browser = await T.launch();
const slow = process.env.SLOW; // wait for level-up screens etc.
try {
  // ---------------- run 1: a human fighter with Lyra, in the prologue, every roll passing
  {
    const { ctx, page } = await T.newPage(browser, { dice: "fail" });
    await T.openDev(page, srv.url, "dev=camp&cls=guerreiro&race=humano");
    await T.play(page);
    await shot(page, "01-acampamento");
    await T.interact(page, "Maren, a pescadora");
    await T.play(page, ["Nós vamos recuperar"], { until: ["dialogue"] });
    await shot(page, "02-dialogo-teste");
    await T.play(page, ["Até mais"], { auto: true });
    await T.goTo(page, 22, 24);
    await playFight(page, ["Chegar devagar, de mãos abertas"], [], "03-combate-patrulha");
    await shot(page, "04-depois-da-patrulha");
    await T.goTo(page, 20, 12);
    await playFight(page, ["Ninguém precisa quebrar"], [], "05-combate-ruinas");
    await shot(page, "06-ruinas");
    await T.interact(page, "Tomé");
    await T.play(page, ["Mostre essa porta.", "Tá bem. Pode vir"]);
    await T.interact(page, "Alçapão"); await T.play(page, ["Descer ao Relicário."]);
    await T.waitFor(page, () => window.G.W.id === "relicario");
    await T.play(page);
    await shot(page, "07-relicario");
    await page.evaluate(async () => (await import("/src/journal.js")).toggleJournal("quests"));
    await shot(page, "08-diario");
    await page.evaluate(async () => (await import("/src/journal.js")).closeJournal());
    console.log("approval", await page.evaluate(() => JSON.stringify(window.G.approval)), "level", await page.evaluate(() => window.G.hero.level));
    await ctx.close();
  }
  // ---------------- run 2: an elf wizard with Kael, chapter 1 and 2
  {
    const { ctx, page } = await T.newPage(browser, { dice: "pass" });
    await T.openDev(page, srv.url, "dev=ato1&cls=mago&race=elfo&f=goblin_pact,maren_aboard,maren_lucid,tome_alive");
    await T.play(page);
    await shot(page, "10-vau-chegada");
    await T.goTo(page, 20, 16);
    await shot(page, "11-vau-mercado");
    await T.interact(page, "Mulher de capa rubra"); await T.play(page, ["O que você quer?", "Fechado.", "Até mais."]);
    await T.interact(page, "Rosalva, a taverneira");
    await T.play(page, ["Mostrar a Carta", "Preciso de um lugar", "Pagar 5"], { until: ["dialogue"] });
    await shot(page, "12-eco-oferta");
    await T.play(page, ["Entregar"]);
    await T.waitFor(page, () => window.G.f.rested1 && window.G.mode === "explore");
    await T.play(page);
    await shot(page, "13-manha");
    await T.goTo(page, 41, 12);
    await T.play(page, ["Mostrar só a mão sem marca"]);
    await T.waitFor(page, () => window.G.W.id === "travessia");
    await T.play(page);
    await shot(page, "14-travessia");
    await T.goTo(page, 10, 14);
    await playFight(page, ["Eles não escolheram isso"], [], "15-combate-procissao");
    await T.goTo(page, 36, 14);
    await playFight(page, [], [], "16-combate-cacadores");
    await T.interact(page, "Mensageira amarrada");
    await T.play(page, ["Ele mentiu para mim."], { endscreen: false });
    await T.waitFor(page, () => window.G.f.ch1_done);
    await T.sleep(2000);
    await shot(page, "17-fim-cap1");
    await T.play(page);
    await T.waitFor(page, () => window.G.W.id === "bosque" && window.G.f.c2, null, 30000);
    await T.play(page);
    await shot(page, "18-bosque");
    await T.goTo(page, 47, 18); await T.play(page);
    await T.waitFor(page, () => window.G.W.id === "mosteiro");
    await T.play(page);
    await shot(page, "19-mosteiro");
    console.log("approval", await page.evaluate(() => JSON.stringify(window.G.approval)), "level", await page.evaluate(() => window.G.hero.level), "errors", page.errors);
    await ctx.close();
  }
} finally { await browser.close(); await srv.close(); }
