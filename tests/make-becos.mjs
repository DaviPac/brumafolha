// Makes the saves of the dead ends (tests/becos/): plays an OLD version of the game into a state the story could no
// longer leave, and saves it there. tests/becos.test.mjs then loads each one in the current version and plays on.
//
//   git worktree add /tmp/brumafolha-0.9.0 <commit of 0.9.0>
//   node make-becos.mjs /tmp/brumafolha-0.9.0        (needs tests/node_modules there, a link is enough)
//
// Each save is kept with a note of the version that made it (<name>.json). Run it again only for a new dead end.
import fs from "node:fs";
import path from "node:path";
import { serve } from "./lib/server.mjs";
import * as T from "./lib/game.mjs";

const [root, only = ""] = process.argv.slice(2);
if (!root) { console.error("uso: node make-becos.mjs <pasta de uma versão antiga do jogo>"); process.exit(2); }
const OUT = path.join(T.ROOT, "tests/becos");

export const BECOS = {
  // Tomé sent home to his grandmother before he showed the door: in 0.9.0 nobody else could open the slab
  "tome-em-casa-sem-porta": {
    q: "dev=camp&cls=guerreiro&race=humano&f=clan=truce,ruins_entered,gorza_met,heard_smoke",
    async run(p) {
      await T.interact(p, "Tomé");
      await T.play(p, ["Sua avó está te esperando"]);
      await T.goTo(p, 22, 14);
    },
  },
  // the fight in the Relicário won before the fourth round with nobody down: in 0.9.0 the Echo never came
  "relicario-sem-eco": {
    q: "dev=camp&cls=mago&race=elfo&f=clan=truce,ruins_entered,gorza_met,tome_met,trapdoor_open",
    async run(p) {
      await T.interact(p, "Alçapão");
      await T.play(p, ["Descer ao Relicário."]);
      await T.waitFor(p, () => window.G.W.id === "relicario");
      await T.goTo(p, 11, 22); await T.play(p, ["Seguir em frente."]);
      for (const pick of [["Minha mãe.", "É esse o nome."], ["A estrada."], ["Um medo."]]) {
        await T.interact(p, "Estátua de uma arquivista");
        await T.play(p, pick);
      }
      await T.goTo(p, 11, 7); await T.play(p);
      await T.goTo(p, 11, 5); await T.play(p, ["Estender a mão para a Lume.", "Então venham."], { until: ["combat"] });
      await T.winFight(p);
      await T.waitFor(p, () => window.G.f.relic_collapse);
      await T.play(p);
    },
  },
};

async function main() {
  const srv = await serve(path.resolve(root));
  const browser = await T.launch();
  const version = fs.readFileSync(path.join(root, "src/version.js"), "utf8").match(/VERSION = "([^"]+)"/)[1];
  let failed = 0;
  try {
    for (const [name, b] of Object.entries(BECOS)) {
      if (only && !name.startsWith(only)) continue;
      const { ctx, page } = await T.newPage(browser);
      try {
        await T.openDev(page, srv.url, b.q);
        await T.play(page);
        await b.run(page);
        const file = path.join(OUT, `${name}.brumafolha`);
        const { snap } = await T.saveAndExport(page, file);
        fs.writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify({ version, mapa: snap.mapa, f: snap.f }, null, 1));
        console.log(`ok  ${name}  (${version}, ${snap.mapa})`);
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
