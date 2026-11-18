// Saves point at things by their place in each map's lists (<map>:o<n>, <map>:c<n>, units by a counter per map,
// functions by where they sit). This builds the maps that existed in 0.8.0 with the old code and with the new code,
// with the same story flags, and checks that every id still names the same thing.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { serve } from "./lib/server.mjs";
import * as T from "./lib/game.mjs";

const OLD = path.join(T.ROOT, "tests/out/old-0.8.0");
let oldSrv, newSrv, browser;
before(async () => {
  if (!fs.existsSync(path.join(OLD, "src/version.js"))) {
    fs.mkdirSync(OLD, { recursive: true });
    execSync(`git archive bc220ec index.html style.css sw.js manifest.webmanifest src vendor | tar -x -C "${OLD}"`, { cwd: T.ROOT });
  }
  oldSrv = await serve(OLD); newSrv = await serve(T.ROOT); browser = await T.launch();
});
after(async () => { await browser?.close(); await oldSrv?.close(); await newSrv?.close(); });

/** Every id the save system knows after the 0.8.0 maps are built, with what it names. */
async function ids(base, flags) {
  const { ctx, page } = await T.newPage(browser);
  try {
    await T.openDev(page, base, `dev=ato1&f=${flags}`);
    return await page.evaluate(async () => {
      const C = await import("/src/save/codec.js");
      const OLD_MAPS = /^(vale|sonho|relicario|vau|travessia|hero|kael|lyra)\b/;
      const out = {};
      for (const [id, u] of C.allUnits()) if (OLD_MAPS.test(id)) out[id] = `${u.name}|${u.team}|${Math.round(u.x)},${Math.round(u.y)}`;
      for (const [id, o] of C.allObjects()) if (OLD_MAPS.test(id)) out[id] = `${o.kind ?? o.name}|${Math.round(o.x)},${Math.round(o.y)}`;
      for (const [id, g] of C.allGroups()) if (OLD_MAPS.test(id)) out[id] = g.map((u) => u.uid).join(",");
      return out;
    });
  } finally { await ctx.close(); }
}

for (const flags of ["goblin_pact,maren_aboard,maren_lucid,tome_alive,silas_doubt", "avo_dead,smoke_out,maren_aboard,maren_forgot", "clan=scared,returned_heirloom"]) {
  test(`ids dos mapas antigos iguais na 0.8.0 e na nova (${flags})`, async () => {
    const [a, b] = [await ids(oldSrv.url, flags), await ids(newSrv.url, flags)];
    assert.ok(Object.keys(a).length > 500, `ids suficientes: ${Object.keys(a).length}`);
    // new things may be added at the end of a list (a new id); an old id must name the same thing
    const diff = Object.keys(a).filter((k) => a[k] !== b[k]).map((k) => `${k}: ${a[k]} → ${b[k]}`);
    assert.deepEqual(diff, []);
  });
}
