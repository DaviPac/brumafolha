// The companions between scenes (src/companions.js): approval shows and matters, lines over heads in the right
// places and never during a fight or a conversation, approval changes what they say, and running out of it brings a
// confrontation.
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
const comp = (page, fn, arg) => page.evaluate(async ([fn, arg]) => { const C = await import("/src/companions.js"); return new Function("C", "G", "arg", fn)(C, window.G, arg); }, [fn, arg]);
const bubbles = (page) => page.evaluate(() => [...document.querySelectorAll("#bubbles .bubble")].map((b) => b.textContent));
const ACT1 = "dev=ato1&cls=mago&race=elfo&f=goblin_pact,maren_aboard,maren_lucid,tome_alive";

test("aprovação: aviso discreto, sem número; ajuda nos testes; muda o que o companheiro diz", async () => {
  const { ctx, page } = await T.newPage(browser);
  try {
    await T.openDev(page, srv.url, ACT1);
    await T.play(page); await T.settle(page);
    await page.evaluate(async () => { for (const b of (await import("/src/companion-lines.js")).BARKS) window.G.barks.add(b.id); }); // the lines about places are not what this test is about
    await comp(page, "C.clearBubbles()"); await T.sleep(500);
    await comp(page, "C.approve('kael', 1)");
    const note = await page.evaluate(() => document.querySelector("#approve .apn")?.textContent);
    assert.match(note, /Kael gostou\./);
    assert.doesNotMatch(note, /\d/, "sem número");
    // nobody else in the party: approval for someone absent does nothing
    await comp(page, "C.approve('nix', 5)");
    assert.equal(await page.evaluate(() => window.G.approval.nix), undefined);
    // close: Kael helps in checks, and says what he only says to someone he trusts
    await page.evaluate(() => { window.G.approval.kael = 3; });
    await T.interact(page, "Rosalva, a taverneira");
    const chk = await page.evaluate(() => [...document.querySelectorAll("#dialogue .opt .chk")].map((e) => e.textContent).join(" | "));
    assert.match(chk, /\+1 Kael/, "a ajuda aparece no teste: " + chk);
    assert.match(chk, /\((CAR|SAB|INT|DES|FOR)\)/, "o teste diz de que atributo depende");
    await page.screenshot({ path: path.join(OUT, "aprovacao-teste.jpg"), type: "jpeg", quality: 80 });
    await T.play(page, ["Até mais."]);
    await comp(page, "C.forceBanter()");
    await T.waitFor(page, () => [...document.querySelectorAll("#bubbles .bubble")].some((b) => b.textContent.startsWith("Kael")), null, 15000);
    const said = (await bubbles(page)).filter((t) => t.startsWith("Kael")).join(" ");
    assert.match(said, /Você pergunta antes de decidir/, "a fala de quem confia: " + said);
    await page.screenshot({ path: path.join(OUT, "aprovacao-fala.jpg"), type: "jpeg", quality: 80 });
    assert.deepEqual(page.errors, []);
  } finally { await ctx.close(); }
});

test("aprovação baixa: a fala muda, ele não ajuda nos testes, e há um confronto", async () => {
  const { ctx, page } = await T.newPage(browser);
  try {
    await T.openDev(page, srv.url, ACT1);
    await T.play(page); await T.settle(page);
    await page.evaluate(async () => { for (const b of (await import("/src/companion-lines.js")).BARKS) window.G.barks.add(b.id); window.G.approval.kael = -2; });
    await comp(page, "C.clearBubbles()"); await T.sleep(500);
    await comp(page, "C.forceBanter()");
    await T.waitFor(page, () => [...document.querySelectorAll("#bubbles .bubble")].some((b) => b.textContent.startsWith("Kael")), null, 15000);
    assert.match((await bubbles(page)).filter((t) => t.startsWith("Kael")).join(" "), /Termina comigo cobrando a conta/);
    // out of approval: the confrontation, once
    await page.evaluate(() => { window.G.approval.kael = -4; });
    await T.waitFor(page, () => !document.querySelector("#dialogue").classList.contains("hidden"), null, 5000);
    await page.screenshot({ path: path.join(OUT, "aprovacao-confronto.jpg"), type: "jpeg", quality: 80 });
    await T.play(page, ["Eu decido o que eu faço"]);
    assert.equal(await page.evaluate(() => window.G.f.confronto_kael), "hold");
    // he no longer rolls for the hero
    await T.interact(page, "Rosalva, a taverneira");
    const chk = await page.evaluate(() => [...document.querySelectorAll("#dialogue .opt .chk")].map((e) => e.textContent).join(" | "));
    assert.doesNotMatch(chk, /Kael [+-]\d/, "Kael não rola: " + chk);
    await T.play(page, ["Até mais."]);
    assert.deepEqual(page.errors, []);
  } finally { await ctx.close(); }
});

test("comentários: nunca durante uma luta nem uma conversa; cada um uma vez; ficam no save", async () => {
  const { ctx, page } = await T.newPage(browser, { dice: "fail" });
  try {
    await T.openDev(page, srv.url, "dev=camp&cls=guerreiro&race=humano");
    await T.play(page);
    // in a conversation: nothing
    await T.interact(page, "Maren, a pescadora");
    const before = await page.evaluate(() => window.G.barks.size);
    await comp(page, "C.forceBanter()"); await T.sleep(1500);
    assert.deepEqual(await bubbles(page), [], "nada durante a conversa");
    assert.equal(await page.evaluate(() => window.G.barks.size), before);
    await T.play(page, ["Até mais"], { auto: true });
    // in a fight: nothing, and a line that had started stops
    await T.goTo(page, 22, 24);
    await T.play(page, ["Chegar devagar, de mãos abertas"], { until: ["explore", "combat"] });
    await T.waitPartyTurn(page);
    await comp(page, "C.forceBanter()"); await T.sleep(1500);
    assert.deepEqual(await bubbles(page), [], "nada durante a luta");
    await T.winFight(page); await T.play(page, [], { auto: true });
    // exploring again: a line, and it is kept by a save
    await comp(page, "C.forceBanter()");
    await T.waitFor(page, () => document.querySelector("#bubbles .bubble"), null, 8000);
    const said = await page.evaluate(() => [...window.G.barks]);
    assert.ok(said.length > before, "uma fala depois da luta");
    const { snap } = await T.saveAndExport(page, path.join(OUT, "falas.brumafolha"));
    const { ctx: c2, page: p2 } = await T.newPage(browser);
    try {
      await T.importAndLoad(p2, srv.url, path.join(OUT, "falas.brumafolha"));
      const kept = await p2.evaluate(() => [...window.G.barks]);
      for (const id of said) assert.ok(kept.includes(id), `${id} continua dito depois de carregar`);
      assert.deepEqual(T.compare(snap, await T.snapshot(p2)), []);
    } finally { await c2.close(); }
    assert.deepEqual(page.errors, []);
  } finally { await ctx.close(); }
});

test("fogueira de histórias: escolher com quem conversar, a história vira lembrança; contar uma lembrança a ancora", async () => {
  const { ctx, page } = await T.newPage(browser);
  try {
    await T.openDev(page, srv.url, ACT1 + ",rested1");
    await T.play(page); await T.settle(page);
    const rest = async () => {
      await page.evaluate(() => { const G = window.G; G.clock = 12; G.f.tribute_seen = true; G.f.iara = "forgot"; const f = G.W.objects.find((o) => o.kind === "campfire"); const l = G.party[G.leader]; l.x = f.x; l.y = f.y - 28; l.path = []; });
      await T.sleep(300);
      await page.keyboard.press("e");
      await T.waitFor(page, () => [...document.querySelectorAll("#dialogue:not(.hidden) .opt")].some((o) => /Dormir/.test(o.textContent)), null, 8000);
    };
    await rest();
    await page.screenshot({ path: path.join(OUT, "fogueira.jpg"), type: "jpeg", quality: 80 });
    await T.play(page, ["Sentar perto de Kael", "E você? Ainda lê?"]);
    const s = await page.evaluate(() => ({ f: window.G.f.fire_k1, mem: window.G.memories.some((m) => m.id === "fire_k1"), ap: window.G.approval.kael }));
    assert.deepEqual(s, { f: true, mem: true, ap: 1 });
    // the next one, in order; the personal talk after it needs more trust: he says so, and it isn't told
    await rest();
    await T.play(page, ["Sentar perto de Kael", "Pão não paga lembrança."]);
    assert.equal(await page.evaluate(() => window.G.f.fire_k2), true);
    await rest();
    await T.play(page, ["Sentar perto de Kael"]);
    assert.equal(await page.evaluate(() => window.G.f.fire_k3), undefined, "a conversa pessoal espera aprovação alta");
    // the hero tells a memory: it is anchored, and the Monastery's tea won't take it
    await rest();
    await T.play(page, ["Contar uma lembrança sua", "Contar: \"Kael, na fogueira"]);
    assert.ok(await page.evaluate(() => window.G.memories.find((m) => m.id === "fire_k1").anchored), "ancorada");
    assert.deepEqual(page.errors, []);
  } finally { await ctx.close(); }
});
