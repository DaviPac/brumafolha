// Every save made by an older version (tests/saves/<version>/) must load in this one: no error, the same state as when
// it was saved (who is where, health, flags, bag, party, the conversation or the fight), and the game goes on from
// there. Saves with chapter 1 finished must reach chapter 2.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { serve } from "./lib/server.mjs";
import * as T from "./lib/game.mjs";

let srv, browser;
before(async () => { srv = await serve(T.ROOT); browser = await T.launch(); });
after(async () => { await browser?.close(); await srv?.close(); });

const versions = fs.readdirSync(T.SAVES).filter((v) => fs.statSync(path.join(T.SAVES, v)).isDirectory());

for (const v of versions) {
  const dir = path.join(T.SAVES, v);
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".brumafolha")).sort()) {
    const name = f.replace(/\.brumafolha$/, "");
    test(`save ${v}/${name} carrega e continua`, async () => {
      const expect = JSON.parse(fs.readFileSync(path.join(dir, `${name}.expect.json`), "utf8"));
      const { ctx, page } = await T.newPage(browser);
      try {
        await T.importAndLoad(page, srv.url, path.join(dir, f));
        const got = await T.snapshot(page);
        assert.deepEqual(T.compare(expect, got), [], "o estado carregado é o que foi salvo");
        await T.keepPlaying(page, got);
        if (expect.f.ch1_done && !process.env.BASELINE) await T.toChapter2(page);
        assert.deepEqual(page.errors, [], "sem erros no console");
      } catch (e) {
        await page.screenshot({ path: path.join(T.ROOT, "tests/out", `${v}-${name}.jpg`), type: "jpeg", quality: 60 }).catch(() => {});
        throw e;
      } finally { await ctx.close(); }
    });
  }
}
