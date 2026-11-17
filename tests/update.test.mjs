// The automatic update, the way players get this version: they are playing 0.8.0 (installed, with its service worker),
// the new version is published, the old page notices, makes an automatic save with the OLD code, and reloads into the
// NEW code, which must load that save and put them back where they were.
//
// The old version is taken from git (the commit where VERSION was 0.8.0) into tests/out/old-0.8.0, and served from the
// same address as the new one, so that it is the same origin: the same saves, the same service worker.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { serve } from "./lib/server.mjs";
import * as T from "./lib/game.mjs";

const OLD_COMMIT = "bc220ec"; // "Tela de carregamento com um d20 rolando": the last 0.8.0
const OLD = path.join(T.ROOT, "tests/out/old-0.8.0");
let srv, browser;
before(async () => {
  if (!fs.existsSync(path.join(OLD, "src/version.js"))) {
    fs.mkdirSync(OLD, { recursive: true });
    execSync(`git archive ${OLD_COMMIT} index.html style.css sw.js manifest.webmanifest src vendor | tar -x -C "${OLD}"`, { cwd: T.ROOT });
  }
  assert.match(fs.readFileSync(path.join(OLD, "src/version.js"), "utf8"), /VERSION = "0\.8\.0"/);
  srv = await serve(OLD);
  browser = await T.launch();
});
after(async () => { await browser?.close(); await srv?.close(); });

const newVersion = () => fs.readFileSync(path.join(T.ROOT, "src/version.js"), "utf8").match(/VERSION = "([\d.]+)"/)[1];

async function updateFrom(query, setup) {
  srv.setRoot(OLD);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: "allow" });
  const { page } = await T.newPage(browser, { context: ctx });
  try {
    await T.openDev(page, srv.url, query);
    await T.play(page);
    await setup?.(page);
    await T.sleep(2500); // the followers catch up with the leader first
    assert.equal(await page.evaluate(async () => (await import("/src/version.js")).VERSION), "0.8.0");
    // the old version's service worker is in charge of the page
    await T.waitFor(page, () => !!navigator.serviceWorker.controller, null, 30000);
    const before = await T.snapshot(page);
    // publish the new version, and let the page find it (it checks at load, every half hour, and on coming back)
    srv.setRoot(T.ROOT);
    const reloaded = page.waitForEvent("load", { timeout: 60000 });
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
    await reloaded;
    await T.waitLoaded(page);
    // now the new code runs, from the automatic save the old code made
    assert.equal(await page.evaluate(async () => (await import("/src/version.js")).VERSION), newVersion());
    const saves = await page.evaluate(async () => (await (await import("/src/save/store.js")).listSaves()).map((m) => ({ tipo: m.tipo, jogo: m.jogo })));
    assert.ok(saves.some((m) => m.tipo === "auto" && m.jogo === "0.8.0"), `há um save automático feito pela 0.8.0: ${JSON.stringify(saves)}`);
    const after = await T.snapshot(page);
    assert.deepEqual(T.compare(before, after), [], "o jogo continua de onde estava");
    await T.keepPlaying(page, after);
    assert.deepEqual(page.errors, []);
    return page;
  } finally { await ctx.close(); }
}

test("atualização automática da 0.8.0 explorando Vau-de-Cardo", async () => {
  await updateFrom("dev=ato1&f=goblin_pact,maren_aboard,maren_lucid,tome_alive", (p) => T.goTo(p, 20, 15));
});

test("atualização automática da 0.8.0 com o capítulo 1 terminado, e o capítulo 2 em seguida", async () => {
  srv.setRoot(OLD);
  // a finished chapter 1 save made by 0.8.0 is loaded in 0.8.0 first, then the update arrives
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: "allow", acceptDownloads: true });
  const { page } = await T.newPage(browser, { context: ctx });
  try {
    await T.importAndLoad(page, srv.url, path.join(T.SAVES, "0.8.0/a1-fim-sem-pacto-sem-nix.brumafolha"));
    await T.waitFor(page, () => !!navigator.serviceWorker.controller, null, 30000);
    const before = await T.snapshot(page);
    srv.setRoot(T.ROOT);
    const reloaded = page.waitForEvent("load", { timeout: 60000 });
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
    await reloaded;
    await T.waitLoaded(page);
    assert.equal(await page.evaluate(async () => (await import("/src/version.js")).VERSION), newVersion());
    assert.deepEqual(T.compare(before, await T.snapshot(page)), []);
    await T.toChapter2(page);
    assert.deepEqual(page.errors, []);
  } finally { await ctx.close(); }
});
