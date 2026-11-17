// Makes the reference saves: plays the game to each moment, saves with the game's own save, exports the file through
// the Load screen, and writes next to it what the game looked like right then (<name>.expect.json).
//
//   node make-saves.mjs 0.8.0                 the game in this folder, saves into saves/0.8.0/
//   node make-saves.mjs 0.8.0 /some/old/tree  an older copy of the game (e.g. from `git worktree add`)
//   node make-saves.mjs 0.8.0 . c2-           only the scenarios whose names start with "c2-"
//
// The 0.8.0 saves were made with the 0.8.0 code before chapter 2 existed; they are kept as they are, and the tests
// load them in the current version. Run it again only to make saves for a new version.
import fs from "node:fs";
import path from "node:path";
import { serve } from "./lib/server.mjs";
import * as T from "./lib/game.mjs";

const [version = "0.8.0", root = T.ROOT, only = ""] = process.argv.slice(2);
const OUT = path.join(T.SAVES, version);

const ACT1 = "dev=ato1&cls=guerreiro&race=humano&f=";

/** Each scenario: a ?dev= start and what to play before saving. */
export const SCENARIOS = {
  // ---- the prologue
  "p1-acampamento-explorando": { q: "dev=camp", async run(p) { await T.goTo(p, 16, 35); } },
  "p2-prologo-conversa": {
    q: "dev=camp&cls=mago&race=elfo",
    async run(p) { await T.interact(p, "Maren, a pescadora"); await T.sleep(400); },
    moment: "dialogue",
  },
  "p3-prologo-combate": {
    q: "dev=camp&cls=ladino&race=halfling",
    async run(p) { await p.evaluate(() => window.brumaSave.fight("patrol")); await T.waitPartyTurn(p); await T.sleep(1500); await T.waitPartyTurn(p); },
    moment: "combat",
  },
  // ---- Act I, chapter 1
  "a1-vau-explorando": { q: ACT1 + "goblin_pact,maren_aboard,maren_lucid,tome_alive", async run(p) { await T.goTo(p, 20, 15); } },
  "a1-conversa": {
    q: ACT1 + "goblin_pact,maren_aboard,maren_lucid,tome_alive",
    async run(p) { await T.interact(p, "Rosalva, a taverneira"); await T.play(p, ["Procuro alguém"], { until: ["dialogue"] }); },
    moment: "dialogue",
  },
  "a1-combate": {
    q: ACT1 + "maren_aboard,tome_alive",
    async run(p) {
      await tavernNight(p, "Não. Nenhuma.");
      await gate(p);
      await T.goTo(p, 10, 14);
      await T.play(p, ["Atacar."], { until: ["combat"] });
      await T.waitPartyTurn(p);
    },
    moment: "combat",
  },
  "a1-travessia-explorando": {
    q: ACT1 + "clan=scared,maren_aboard,maren_forgot",
    async run(p) { await tavernNight(p, "Não. Nenhuma."); await gate(p); await T.goTo(p, 6, 15); },
  },
  // ---- chapter 1 finished, in two different valleys
  "a1-fim-pacto-nix": {
    q: ACT1 + "goblin_pact,maren_aboard,maren_lucid,tome_alive,otavio_found,silas_doubt,returned_heirloom",
    async run(p) {
      await nixJob(p);
      await tavernNight(p, "Entregar: \"Quem me ensinou");
      await gate(p);
      await T.goTo(p, 10, 14);
      await T.play(p, ["Deixar a procissão passar."]);
      await hunters(p, ["Mostrar a marca."]);
      await courier(p, "\"Quem é L.?\"");
    },
  },
  "a1-fim-sem-pacto-sem-nix": {
    q: ACT1 + "avo_dead,smoke_out,maren_aboard,maren_forgot,tome_alive",
    async run(p) {
      await tavernNight(p, "Não. Nenhuma.");
      await gate(p);
      await T.goTo(p, 10, 14);
      await T.play(p, ["Atacar."], { until: ["combat"] });
      await T.winFight(p); await T.play(p);
      await T.goTo(p, 25, 14);
      await T.play(p, ["Sacar a arma."], { until: ["combat"] });
      await T.winFight(p); await T.play(p);
      await hunters(p, ["Mostrar a marca."]);
      await courier(p, "\"E as trezentas peças?\"");
    },
  },
};

// ---- pieces of chapter 1, played the way a player would
async function tavernNight(p, echo) {
  await T.interact(p, "Rosalva, a taverneira");
  const pay = await p.evaluate(() => !window.G.f.rosalva_lembradora);
  // the room, then the night: the Echo's offer
  await T.play(p, ["Mostrar a Carta", "Preciso de um lugar", pay ? "Pagar 5" : "Dormir", echo]);
  await T.waitFor(p, () => window.G.f.rested1 && window.G.mode === "explore");
}
async function gate(p) {
  await T.goTo(p, 41, 12);
  await T.play(p, ["Fechar a mão sobre uma moeda"]);
  await T.waitFor(p, () => window.G.W.id === "travessia");
  await T.play(p);
}
async function nixJob(p) {
  await T.interact(p, "Mulher de capa rubra");
  await T.play(p, ["O que você quer", "Fechado.", "Até mais."]);
  for (let i = 0; i < 6 && !(await p.evaluate(() => window.G.f.lume_got)); i++) {
    await T.interact(p, "Cofre do comandante");
    const bribe = await p.evaluate(() => window.G.gold >= 25 && !window.G.f.bribed);
    await T.play(p, [bribe ? "Deixar uma bolsa" : "Ir por trás das caixas", "Abrir o cadeado"]).catch(async (e) => { if (!/escolhas não usadas/.test(e.message)) throw e; });
    if (bribe) await p.evaluate(() => { window.G.f.bribed = true; }); // one bribe is enough: the sergeant looks away after that
  }
  await p.evaluate(() => { delete window.G.f.bribed; });
  await T.interact(p, "Nix");
  await T.play(p, ["Entregar a Lume a Nix."]);
}
async function hunters(p, picks) {
  await T.goTo(p, 36, 14);
  await T.play(p, picks, { until: ["combat", "explore"] });
  if (await p.evaluate(() => window.G.mode === "combat")) { await T.winFight(p); await T.play(p); }
}
async function courier(p, pick) {
  await T.interact(p, "Mensageira amarrada");
  await T.play(p, [pick]);
  await T.waitFor(p, () => window.G.f.ch1_done);
  await T.sleep(2000);
  await T.play(p); // closes the end-of-chapter screen ("Continuar explorando")
}

async function main() {
  const srv = await serve(root);
  const browser = await T.launch();
  let failed = 0;
  try {
    for (const [name, sc] of Object.entries(SCENARIOS)) {
      if (only && !name.startsWith(only)) continue;
      const { ctx, page } = await T.newPage(browser);
      try {
        await T.openDev(page, srv.url, sc.q);
        await T.play(page);
        await sc.run(page);
        if (sc.moment === "combat") await T.waitPartyTurn(page);
        await T.snapshot(page); // installs the in-page snapshot
        const file = path.join(OUT, `${name}.brumafolha`);
        const { snap: expect } = await T.saveAndExport(page, file);
        if (expect.mode !== (sc.moment ?? "explore")) throw new Error(`modo ${expect.mode}, esperado ${sc.moment ?? "explore"}`);
        fs.writeFileSync(path.join(OUT, `${name}.expect.json`), JSON.stringify(expect, null, 1));
        await page.screenshot({ path: path.join(OUT, `${name}.jpg`), type: "jpeg", quality: 55 });
        if (page.errors.length) console.warn(`  avisos em ${name}:`, page.errors.slice(0, 3));
        console.log(`ok  ${name}  (${expect.mapa}, ${expect.mode})`);
      } catch (e) {
        failed++;
        console.error(`ERRO ${name}:`, e.message);
        await page.screenshot({ path: path.join(OUT, `${name}.erro.jpg`), type: "jpeg", quality: 55 }).catch(() => {});
      } finally { await ctx.close(); }
    }
  } finally { await browser.close(); await srv.close(); }
  process.exit(failed ? 1 : 0);
}
if (import.meta.main ?? process.argv[1] === import.meta.filename) main();
