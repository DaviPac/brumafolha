// 0.9.2 (refinement): what was added to make the maps look lived in must not change how they play.
// - The standing decor (W.decor, src/decor.js) never takes a tile someone or something already uses, and never cuts
//   a walkable area in two: every tile reachable before it was put down is still reachable (but its own).
// - It is the same on every build (seeded by the map), and it is not in the save's lists (W.objects keeps its ids).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { serve } from "./lib/server.mjs";
import * as T from "./lib/game.mjs";

let srv, browser;
before(async () => { srv = await serve(T.ROOT); browser = await T.launch(); });
after(async () => { await browser?.close(); await srv?.close(); });

const MAPS = ["vale", "relicario", "vau", "travessia", "bosque", "mosteiro", "claustro"];

/** For every map: the decor, the tiles it blocks, what it would take from people and things, and whether it splits an area. */
async function check(page) {
  return page.evaluate((MAPS) => {
    const E = window.brumaSave.engine, MW = 80, out = {};
    for (const id of MAPS) {
      const W = E.buildMap(id), errs = [];
      const decTiles = new Set(W.decor.filter((d) => d.block).map((d) => d.block[1] * MW + d.block[0]));
      const tileOf = (e) => Math.floor((e.y - 1) / 32) * MW + Math.floor(e.x / 32);
      for (const e of [...W.npcs, ...W.enemies, ...Object.values(W.groups).flat(), ...W.objects, ...W.chests]) if (decTiles.has(tileOf(e))) errs.push(`decoração em cima de ${e.name ?? e.kind ?? "baú"}`);
      // the grid without the decor, and with it
      const withD = W.block0, without = withD.slice();
      for (const k of decTiles) without[k] = 0;
      const open = (b, k) => b[k] === 0;
      const bfs = (b, k0) => {
        const seen = new Set([k0]), q = [k0];
        while (q.length) {
          const k = q.pop(), x = k % MW, y = (k / MW) | 0;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = x + dx, ny = y + dy, n = ny * MW + nx;
            if (nx < 0 || ny < 0 || nx >= W.w || ny >= W.h || seen.has(n) || !open(b, n)) continue;
            seen.add(n); q.push(n);
          }
        }
        return seen;
      };
      const done = new Set();
      for (let y = 0; y < W.h; y++) for (let x = 0; x < W.w; x++) {
        const k = y * MW + x;
        if (done.has(k) || !open(without, k)) continue;
        const area = bfs(without, k);
        for (const a of area) done.add(a);
        const left = [...area].filter((a) => !decTiles.has(a));
        if (!left.length) continue;
        const reach = bfs(withD, left[0]);
        const lost = left.filter((a) => !reach.has(a));
        if (lost.length) errs.push(`a decoração separa ${lost.length} casas perto de ${lost[0] % MW},${(lost[0] / MW) | 0}`);
      }
      out[id] = { errs, decor: W.decor.length, blocking: decTiles.size, decals: W.decals.length, objects: W.objects.length, inObjects: W.decor.some((d) => W.objects.includes(d)) };
    }
    return out;
  }, MAPS);
}

test("decoração: não ocupa o lugar de ninguém, não separa áreas, não entra nos ids do save", async () => {
  for (const q of ["dev=ato1c2&f=otavio_found,silas_doubt", "dev=ato1&f=avo_dead,maren_aboard,maren_forgot"]) {
    const { ctx, page } = await T.newPage(browser);
    try {
      await T.openDev(page, srv.url, q);
      const r = await check(page);
      for (const [id, m] of Object.entries(r)) {
        assert.deepEqual(m.errs, [], `${id}: ${m.errs.join("; ")}`);
        assert.ok(!m.inObjects, `${id}: decoração dentro de W.objects`);
        assert.ok(m.decor + m.decals > 0, `${id}: nenhuma decoração`);
      }
      assert.deepEqual(page.errors.filter((e) => !/Failed to load resource/.test(e)), []);
    } finally { await ctx.close(); }
  }
});

test("decoração: a mesma a cada vez que o mapa é montado", async () => {
  const runs = [];
  for (let i = 0; i < 2; i++) {
    const { ctx, page } = await T.newPage(browser, { seed: 3 + i * 11 });
    try {
      await T.openDev(page, srv.url, "dev=ato1c2");
      runs.push(await page.evaluate((MAPS) => MAPS.map((id) => { const W = window.brumaSave.engine.buildMap(id); return JSON.stringify([W.decor.map((d) => [d.kind, d.x, d.y, d.seed]), W.decals.map((d) => [d.kind, d.x, d.y, d.seed])]); }), MAPS));
    } finally { await ctx.close(); }
  }
  assert.deepEqual(runs[0], runs[1]);
});

// ---------------------------------------------------------------- what can be looked at (0.9.2)
/** Walk up to `name`, press E, and see the first line it says (`expect`); then play the scene to its end. */
async function examine(page, name, expect) {
  await T.interact(page, name);
  await T.waitFor(page, () => !document.querySelector("#dialogue").classList.contains("hidden"), null, 15000);
  const text = await page.evaluate(() => { const t = document.querySelector("#dialogue .text"); t?.onclick?.(); return t?.textContent ?? ""; });
  assert.ok(text.includes(expect), `"${name}" diz: ${text}`);
  await T.play(page);
}
const xp = (page) => page.evaluate(() => window.G.hero.xp);
const goMap = (page, id, tx, ty) => page.evaluate(([id, tx, ty]) => { const E = window.brumaSave.engine; E.buildMap(id); E.loadMap(id, tx, ty, 3); }, [id, tx, ty]);

test("prólogo: o banco do lago e o muro dos nomes dão uma vez a experiência; o braseiro do Relicário", async () => {
  const { ctx, page } = await T.newPage(browser);
  try {
    await T.openDev(page, srv.url, "dev=camp");
    await T.play(page);
    const x0 = await xp(page);
    await examine(page, "Banco virado para o lago", "Um banco de tábua velha");
    assert.equal(await xp(page), x0 + 25, "a experiência do banco");
    await examine(page, "Banco virado para o lago", "Um banco de tábua velha");
    assert.equal(await xp(page), x0 + 25, "o banco não dá experiência de novo");
    await examine(page, "Muro com nomes riscados", "Nomes riscados a faca");
    assert.equal(await xp(page), x0 + 50);
    assert.ok(await page.evaluate(() => window.G.f.x_bench && window.G.f.x_names));
    await page.evaluate(() => { window.G.f.atrium = true; }); // the scene of the atrium, already seen
    await goMap(page, "relicario", 11, 22);
    await examine(page, "Braseiro de Velmoor", "Uma chama fria");
    assert.deepEqual(page.errors.filter((e) => !/Failed to load resource/.test(e)), []);
  } finally { await ctx.close(); }
});

test("capítulo 1: a régua de cheia, o marco da estrada, e o velho de Pedra-Alta depois do vau", async () => {
  const { ctx, page } = await T.newPage(browser);
  try {
    await T.openDev(page, srv.url, "dev=ato1&f=goblin_pact");
    await T.play(page);
    await examine(page, "Régua de cheia", "Uma régua de madeira");
    await examine(page, "Velho do norte", "Eu sou de Pedra-Alta");
    await page.evaluate(() => { window.G.f.trav_entered = true; });
    await examine(page, "Velho do norte", "Vocês atravessaram o vau");
    await page.evaluate(() => { window.G.f.proc = "passed"; });
    await goMap(page, "travessia", 9, 14);
    await examine(page, "Marco da estrada", "Uma pedra de estrada");
    assert.deepEqual(page.errors.filter((e) => !/Failed to load resource/.test(e)), []);
  } finally { await ctx.close(); }
});

test("capítulo 2: o toco do lenhador, o cesto de folhas, as velas do dormitório", async () => {
  const { ctx, page } = await T.newPage(browser);
  try {
    await T.openDev(page, srv.url, "dev=ato1c2&f=otavio_found");
    await T.play(page);
    await examine(page, "Toco cortado", "Um toco cortado rente");
    await goMap(page, "mosteiro", 26, 17);
    await T.play(page);
    await examine(page, "Cesto de folhas", "Folhas claras do chá de bruma");
    await goMap(page, "claustro", 15, 11);
    await T.play(page);
    await examine(page, "Velas do dormitório", "Velas curtas");
    assert.deepEqual(page.errors.filter((e) => !/Failed to load resource/.test(e)), []);
  } finally { await ctx.close(); }
});
