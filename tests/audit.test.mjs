// The audit of every conversation tree of the story (the prologue, chapter 1 and chapter 2), with many combinations of
// flags, items, companions and party. It looks for:
//   - an answer that leads to a node that doesn't exist, and a node with no way out;
//   - a d20 whose failure records nothing, so the answer is still there to roll again;
//   - an answer that gives a reward (XP, gold, potions, items, memories, approval) and can be picked again;
//   - answers written against the rule of docs/historia.md §9.1 (quotes around a line, a line in parentheses).
// It also checks the answers of the scenes (ask() in the source) against the same writing rule, and writes the list of
// every answer and how the dialogue box reads it to tests/out/respostas.txt.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { serve } from "./lib/server.mjs";
import * as T from "./lib/game.mjs";

const FILES = ["src/story.js", "src/act1.js", "src/act1ch2.js"].map((f) => path.join(T.ROOT, f));
// the hero's answers written elsewhere: the companions' confrontations and the campfire (only for the quotes rule)
const ANSWERS = [...FILES, ...["src/companion-lines.js", "src/campfire.js"].map((f) => path.join(T.ROOT, f)).filter((f) => fs.existsSync(f))];
const SRC = FILES.map((f) => fs.readFileSync(f, "utf8")).join("\n");

/** Every flag the story reads or writes, and the values it gives them. */
function flagSpace() {
  const space = {};
  const add = (k, v) => { (space[k] ??= new Set([undefined, true, false])).add(v); };
  for (const m of SRC.matchAll(/\bF\.(\w+)/g)) add(m[1], true);
  for (const m of SRC.matchAll(/\bF\.(\w+)\s*(?:={1,3}|!==?)\s*"([^"]*)"/g)) add(m[1], m[2]);
  for (const m of SRC.matchAll(/\bF\.(\w+)\s*(?:>=|>|<|<=)\s*(\d+)/g)) { add(m[1], +m[2]); add(m[1], +m[2] - 1); }
  // values given through a variable (F.iara = r): the ones the code compares or maps
  const more = { iara: ["paid", "talked", "scared", "forgot"], lume_done: ["nix", "people", "keep"], pipa: ["home", "lie", "bird"], proc: ["met", "passed", "freed", "smoke", "fight"],
    hunters: ["met", "sneaked", "talked", "fight", "won"], clan: ["infiltrated", "truce", "scared", "fight"], echo: ["accepted", "refused"], c2_madre: ["shaken", "even", "swayed"],
    c2_choice: ["crown", "attack", "peace"], c2_guards: ["met", "sleep", "permit", "silas", "talk", "fight", "won"], eco_trade: ["refused", "o1", "dream"], toll: ["pay", "sorry", "push", "no"],
    murta: ["spared", "fought"], c2_moths: ["met", "lured", "doused", "smoke", "fight", "won"], c2_tea: ["drank", "poured", "refused"], hulda_free: ["key", "nix", "pick", "force"], shrine: ["gave", "took"] };
  for (const [k, vs] of Object.entries(more)) for (const v of vs) add(k, v);
  return Object.fromEntries(Object.entries(space).map(([k, v]) => [k, [...v]]));
}

let srv, browser;
before(async () => { srv = await serve(T.ROOT); browser = await T.launch(); });
after(async () => { await browser?.close(); await srv?.close(); });

test("as respostas das cenas seguem a regra das aspas (§9.1)", async () => {
  // the same reading as the dialogue box: the rule is taken from src/dialogue.js itself
  const d = fs.readFileSync(path.join(T.ROOT, "src/dialogue.js"), "utf8");
  const rule = d.slice(d.indexOf("const META"), d.indexOf("const esc"));
  const { optionKind } = await import("data:text/javascript," + encodeURIComponent(rule));
  const bad = [];
  for (const f of ANSWERS) {
    const s = fs.readFileSync(f, "utf8");
    for (const m of s.matchAll(/(?:label|mend|hold): "((?:[^"\\]|\\.)*)"/g)) {
      const l = JSON.parse(`"${m[1]}"`), line = s.slice(0, m.index).split("\n").length;
      if (/^["“].*["”]$/.test(l)) bad.push(`${path.basename(f)}:${line} fala entre aspas: ${l}`);
      if (/^\(/.test(l)) bad.push(`${path.basename(f)}:${line} resposta entre parênteses: ${l}`);
      if (optionKind({ label: l }) === "other" && !/^(Kael|Lyra|Nix|Hulda): /.test(l)) bad.push(`${path.basename(f)}:${line} "Nome:" de quem não é companheiro: ${l}`);
    }
  }
  assert.deepEqual(bad, []);
});

test("auditoria das árvores de diálogo, com combinações de flags", async () => {
  const { ctx, page } = await T.newPage(browser, { seed: 1 });
  try {
    await T.openDev(page, srv.url, "dev=ato1c2&cls=guerreiro&race=humano&f=nix_joined,otavio_found,silas_doubt,maren_aboard,maren_lucid,tome_alive,goblin_pact");
    await T.play(page);
    const out = await page.evaluate(auditInPage, { space: flagSpace(), combos: Number(process.env.AUDIT_COMBOS ?? 120) });
    fs.mkdirSync(path.join(T.ROOT, "tests/out"), { recursive: true });
    fs.writeFileSync(path.join(T.ROOT, "tests/out/respostas.txt"), out.labels.sort().join("\n") + "\n");
    console.log(`  árvores: ${out.trees}, combinações: ${out.runs}, nós vistos: ${out.nodes}, respostas: ${out.labels.length}`);
    if (out.errors.length) console.log("  erros ao montar árvores (avisos):\n   " + out.errors.slice(0, 10).join("\n   "));
    assert.deepEqual(out.problems, [], "problemas nas árvores");
  } finally { await ctx.close(); }
});

/** Runs in the page. */
async function auditInPage({ space, combos }) {
  const G = window.G, E = window.brumaSave.engine;
  const S = await import("/src/story.js"), D = await import("/src/dialogue.js");
  const IDS = ["vale", "vau", "travessia", "bosque", "mosteiro", "claustro"];
  for (const id of IDS) if (!E.map(id)) E.buildMap(id);
  const MAPS = IDS.map((id) => E.map(id));
  G.audit = true;
  const TREES = S.TREES();
  // flags as accessors: what each tree reads is recorded
  const store = new Map(Object.entries(G.f));
  let reads = null;
  for (const k of Object.keys(space)) {
    if (!store.has(k)) store.set(k, undefined);
    delete G.f[k];
    Object.defineProperty(G.f, k, { configurable: true, enumerable: true, get() { reads?.add(k); return store.get(k); }, set(v) { store.set(k, v); } });
  }
  const setFlags = (fl) => { for (const k of Object.keys(space)) store.set(k, fl[k]); for (const k of Object.keys(G.f)) if (!(k in space)) delete G.f[k]; };
  const getFlags = () => Object.fromEntries(Object.keys(space).map((k) => [k, store.get(k)]));
  // the world around a conversation
  const ITEMS = ["letter", "chair", "net", "poster", "gloves", "smoke", "lume", "seal", "bird", "key", "pletter", "page", "sabia", "note"];
  const itemPool = Object.fromEntries(ITEMS.map((id) => [id, { id, name: id }]));
  const mate = G.mate, nix = MAPS.flatMap((W) => W.npcs).find((u) => u.key === "nix"), hulda = MAPS.flatMap((W) => W.npcs).find((u) => u.key === "hulda");
  const party0 = G.party.slice();
  const units = MAPS.flatMap((W) => [...W.npcs, ...W.enemies]);
  const world = () => ({
    gold: G.gold, potions: G.potions, items: G.items.slice(), memories: G.memories.map((m) => ({ ...m })), approval: { ...G.approval }, party: G.party.slice(), followers: G.followers.slice(),
    stats: G.party.map((p) => ({ p, xp: p.xp, level: p.level, hp: p.hp, maxHp: p.maxHp, abilities: p.abilities?.slice(), skills: { ...p.skills } })),
    units: units.map((u) => ({ u, label: u.label, name: u.name, x: u.x, y: u.y, gone: u.gone })), mateKey: mate.key,
    npcs: MAPS.map((W) => [W, W.npcs.slice()]),
  });
  const restore = (w) => {
    G.gold = w.gold; G.potions = w.potions; G.items.splice(0, G.items.length, ...w.items); G.memories.splice(0, G.memories.length, ...w.memories.map((m) => ({ ...m })));
    for (const k of Object.keys(G.approval)) delete G.approval[k]; Object.assign(G.approval, w.approval);
    G.party = w.party.slice(); G.followers = w.followers.slice();
    for (const s of w.stats) Object.assign(s.p, { xp: s.xp, level: s.level, hp: s.hp, maxHp: s.maxHp, abilities: s.abilities, skills: s.skills });
    for (const s of w.units) Object.assign(s.u, { label: s.label, name: s.name, x: s.x, y: s.y, gone: s.gone });
    mate.key = w.mateKey;
    for (const [W, n] of w.npcs) W.npcs.splice(0, W.npcs.length, ...n);
  };
  // what counts as a reward: something gained
  const gains = (a, b) => b.gold > a.gold || b.potions > a.potions || b.items.length > a.items.length || b.memories.length > a.memories.length
    || JSON.stringify(a.approval) !== JSON.stringify(b.approval) || b.stats.some((s, i) => a.stats[i] && s.xp > a.stats[i].xp);
  const rnd = (() => { let a = 12345; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const node = (tree, id) => { const n = tree[id]; return typeof n === "function" ? n() : n; };
  const visible = (n) => n.options.filter((o) => !o.if || o.if());
  const start = (tree) => ("start" in tree ? "start" : "n0" in tree ? "n0" : Object.keys(tree)[0]);
  const targets = (o) => (o.check ? [o.passTo, o.failTo] : [typeof o.to === "function" ? o.to() : o.to]).filter((t) => t && t !== "end");
  /** The nodes reachable from the start, through the answers that are there. */
  function reachable(tree) {
    const seen = new Set(), q = [start(tree)];
    while (q.length) { const id = q.shift(); if (seen.has(id) || !(id in tree)) continue; seen.add(id); for (const o of visible(node(tree, id))) q.push(...targets(o)); }
    return seen;
  }
  const problems = new Set(), errors = new Set(), labels = new Set();
  // trees that are opened once in the whole game (a scene that cannot come back): an answer used there is gone for good
  const ONE_SHOT = new Set(["kaelOpening", "lyraOpening"]);
  let runs = 0, nodes = 0;
  const env = { mate: ["kael", "lyra"], nix: [false, true], hulda: [false, true], gold: [0, 4, 30, 200] };

  function setWorld(fl, e) {
    setFlags(fl);
    mate.key = e.mate;
    G.party = [...party0.filter((p) => p.key !== "nix" && p.key !== "hulda"), ...(e.nix && nix ? [nix] : []), ...(e.hulda && hulda ? [hulda] : [])];
    G.gold = e.gold;
    G.items.splice(0, G.items.length, ...e.items.map((id) => ({ ...itemPool[id] })));
  }
  for (const [name, fn] of Object.entries(TREES)) {
    // which flags does this tree read? (build it, and look at every node, with no flags and with all of them on)
    reads = new Set();
    const w0 = world();
    for (const all of [false, true]) {
      setWorld(Object.fromEntries(Object.keys(space).map((k) => [k, all ? true : undefined])), { mate: "kael", nix: true, hulda: true, gold: 100, items: ITEMS });
      try { const t = fn(); if (t) for (const id of Object.keys(t)) { const n = node(t, id); visible(n); for (const o of n.options) targets(o); } } catch (e) { errors.add(`${name}: ${e.message}`); }
      restore(w0);
    }
    const mine = [...reads];
    reads = null;
    for (let r = 0; r < combos; r++) {
      const fl = {};
      // one flag at a time first, then random mixes
      if (r < mine.length) fl[mine[r]] = pick(space[mine[r]].filter((v) => v !== undefined));
      else for (const k of mine) if (rnd() < 0.5) fl[k] = pick(space[k]);
      const e = { mate: pick(env.mate), nix: pick(env.nix), hulda: pick(env.hulda), gold: pick(env.gold), items: ITEMS.filter(() => rnd() < 0.35) };
      const w = world();
      setWorld(fl, e);
      const base = getFlags(), wb = world();
      runs++;
      let tree;
      try { tree = fn(); } catch (err) { errors.add(`${name}: ${err.message}`); restore(w); continue; }
      if (!tree) { restore(w); continue; } // it started a scene instead
      for (const id of reachable(tree)) {
        nodes++;
        let n;
        try { n = node(tree, id); } catch (err) { errors.add(`${name}.${id}: ${err.message}`); continue; }
        const vis = visible(n);
        if (!vis.length) problems.add(`${name}: o nó "${id}" fica sem nenhuma resposta (flags: ${JSON.stringify(fl)})`);
        for (const o of vis) {
          labels.add(`${D.optionKind(o).padEnd(5)}  ${o.label}`);
          if (/^["“].*["”]$/.test(o.label)) problems.add(`${name}.${id}: fala entre aspas: ${o.label}`);
          for (const t of targets(o)) if (!(t in tree)) problems.add(`${name}.${id}: "${o.label}" leva a um nó que não existe ("${t}")`);
          // effects: a failed roll, a reward
          const effects = o.check ? [["fail", o.fail], ["pass", o.pass]] : [["do", o.do]];
          for (const [kind, f] of effects) {
            if (kind !== "fail" && typeof f !== "function") continue;
            setFlags(base); restore(wb);
            const before = world();
            try { if (typeof f === "function") f(G.hero, ""); } catch (err) { errors.add(`${name}.${id} "${o.label}" (${kind}): ${err.message}`); continue; }
            const got = gains(before, world());
            let again = false;
            try {
              const t2 = fn();
              if (t2 && !ONE_SHOT.has(name)) {
                const reach = reachable(t2);
                again = reach.has(id) && visible(node(t2, id)).some((x) => x.label === o.label);
              }
            } catch (err) { errors.add(`${name} (depois de "${o.label}"): ${err.message}`); }
            if (again && kind === "fail" && !o.retry) problems.add(`${name}.${id}: a rolagem "${o.label}" pode ser repetida depois de falhar`);
            if (again && got) problems.add(`${name}.${id}: "${o.label}" dá recompensa (${kind}) e pode ser escolhida de novo`);
          }
          setFlags(base); restore(wb);
        }
      }
      restore(w);
    }
  }
  setFlags({});
  return { problems: [...problems], errors: [...errors], labels: [...labels], trees: Object.keys(TREES).length, runs, nodes };
}
