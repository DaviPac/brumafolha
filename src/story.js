// The Prologue, "A Bruma de Brumafolha" (docs/historia.md §6): the dream, the camp, the patrol, Maren, the
// Dente-de-Musgo clan, Tomé, the Relicário and its statues, Sister Cendra, the Echo, the Bruma rising, the boat.
// Everything here is scripted on top of the engine in main.js (passed in as E) and the dialogue trees.
import { G, lead, living } from "./state.js";
import { TILE, dist, clamp, vnoise } from "./util.js";
import { T, CAMP, MW, RIVER } from "./world.js";
import { gword } from "./rules.js";
import { gearItem } from "./items.js";
import { SPECS, buildCharacter, portrait, SW } from "./art/chars.js";
import * as UI from "./ui.js";
import { talk, openDialogue } from "./dialogue.js";
import { hint, askTutorial } from "./tutorial.js";
import { sfx } from "./audio.js";
import { FX, PAL } from "./fx.js";
import { openJournal, refreshJournal } from "./journal.js";
import { refreshCombatHotbar } from "./combat.js";

let E;
const F = G.f; // story flags
const NARR = { name: "", portrait: null };
const tc = (tx, ty) => [tx * TILE + 16, ty * TILE + 26];
const tileNow = (u) => [Math.floor(u.x / TILE), Math.floor((u.y - 1) / TILE)];
const near = (u, tx, ty, r) => dist(u.x, u.y, tx * TILE + 16, ty * TILE + 26) < r * TILE;
const mateIs = (k) => G.mate?.key === k;
const cast = {}; // the story's named units, by key

export function init(engine) {
  E = engine;
  G.hooks.quests = quests;
  G.hooks.turnStart = turnStart;
  G.hooks.partyDown = () => { if (G.combat) G.combat.someoneDown = true; hint("down"); };
  G.hooks.itemRead = itemRead;
  G.hooks.journalClosed = () => { const f = afterJournal; afterJournal = null; f?.(); };
}

// ---------------------------------------------------------------- little tools
const tweens = [], timers = [];
const tween = (sec, fn) => new Promise((res) => tweens.push({ t: 0, sec, fn, res }));
const later = (sec, fn) => timers.push({ t: sec, fn });
let afterJournal = null;

/** One question, many answers: resolves with the chosen option's value (or pass/fail for checks). */
function ask(who, text, opts, node = {}) {
  return new Promise((res) => {
    let v = null;
    const options = opts.map((o) => o.check
      ? { label: o.label, check: o.check, if: o.if, pass: (w) => { v = o.pass; o.onPass?.(w); }, fail: () => { v = o.fail; }, passTo: "end", failTo: "end" }
      : { label: o.label, if: o.if, tag: o.tag, do: (val) => { v = o.v; o.do?.(val); }, to: "end" });
    openDialogue(who ?? NARR, { start: { ...node, who: who ?? undefined, narr: !who, text, options } }, "start", () => res(v));
  });
}
/** A run of lines, each [speaker | null for narration, text]. */
function lines(seq, last = "Continuar") {
  const tree = {};
  seq.forEach(([who, text], i) => {
    const end = i === seq.length - 1;
    tree["n" + i] = { who: who ?? undefined, narr: !who, text, options: [{ label: end ? last : "Continuar", to: end ? "end" : "n" + (i + 1) }] };
  });
  return talk(seq[0][0] ?? NARR, tree, "n0");
}
const say = (who, text, last) => lines([[who, text]], last);

let sceneDepth = 0;
/** Run a scripted moment: no player control until it's done (unless it starts a fight). */
async function scene(fn) {
  sceneDepth++;
  if (G.mode !== "combat") G.mode = "cutscene";
  const l = lead(); if (l) l.path = [];
  UI.tooltip(null);
  try { await fn(); } finally {
    sceneDepth--;
    if (!sceneDepth && G.mode === "cutscene") { G.mode = "explore"; G.camFocus = null; E.hotbar(); }
  }
}
const look = (tx, ty, speed = 3) => { G.camFocus = { x: tx * TILE + 16, y: ty * TILE + 16, speed }; };

function reward(xp, why) {
  for (const p of G.party) if (!p.ai) G.hooks.gainXp(p, xp);
  UI.toast(`${why}  ·  +${xp} XP`, 3200);
  sfx.quest();
}
export function giveItem(it) { if (!G.items.some((i) => i.id === it.id)) G.items.push(it); refreshJournal(); }
const hasItem = (id) => G.items.some((i) => i.id === id);
const takeItem = (id) => { const i = G.items.findIndex((x) => x.id === id); if (i >= 0) G.items.splice(i, 1); };
function remember(id, text, origin = false) {
  if (G.memories.some((m) => m.id === id)) return;
  G.memories.push({ id, text, origin });
  UI.toast(`Nova lembrança: ${text.length > 46 ? text.slice(0, 44) + "…" : text}`, 3600);
  hint("memory");
  refreshJournal();
}
function approve(key, n) {
  if (!mateIs(key)) return;
  G.approval[key] = (G.approval[key] ?? 0) + n;
  UI.floater(G.mate.x, G.mate.y - 44, n > 0 ? `${G.mate.name} aprova` : `${G.mate.name} desaprova`, n > 0 ? "heal" : "miss");
}
const speaker = (name, specKey) => ({ name, portrait: portrait(buildCharacter(SPECS[specKey])) });

// ---------------------------------------------------------------- items
const ITEMS = {
  letter: { id: "letter", name: "Carta do Contrato", icon: "✉️", desc: "Selada com uma pena de sabiá. O lacre tem o desenho de uma torre.",
    read: "<p><i>Ao portador desta:</i></p><p>sob as Ruínas de Velmoor, no vale de Brumafolha, dorme algo que não pode ser esquecido. Traga-o a Vau-de-Cardo, à taverna do Sabiá Cego, e receba trezentas peças.</p><p>Não abra o que encontrar. Não escute o que ele disser.</p><p class='sig'>— L.</p>" },
  net: { id: "net", name: "Rede da Maren", icon: "🕸️", desc: "Uma rede de pesca remendada tantas vezes que já é mais remendo do que rede." },
  chair: { id: "chair", name: "Cadeira do Otávio", icon: "🪑", desc: "Uma cadeira de balanço. No encosto, entalhado à faca, com um talho em forma de anzol: \"Para a Maren, do teu Otávio\"." },
};

// ---------------------------------------------------------------- the cast, map by map
export function populate(W) {
  const npc = (spec, def) => { const u = E.unit(spec, { team: "npc", maxHp: 6, ac: 10, ...def }); W.npcs.push(u); if (def.key) cast[def.key] = u; return u; };
  if (W.id === "vale") {
    const gob = (tx, ty, group, n, spec = "goblin", key) => {
      const u = E.unit(spec, { name: n ?? "Goblin", team: "enemy", tx, ty, maxHp: 7, ac: 13, atk: 4, dmg: "1d6+2", move: 6, dex: 2, group, xpValue: 50, key, passive: true });
      if (key) cast[key] = u;
      return u;
    };
    const patrol = [gob(21, 21, "patrol"), gob(23, 22, "patrol", "Goblin batedor"), gob(22, 20, "patrol", "Fiapo", "fiapo", "fiapo")];
    patrol[0].dir = 2; patrol[1].dir = 1; patrol[2].dir = 0;
    const ruins = [
      gob(17, 9, "ruins"), gob(23, 9, "ruins", "Goblin arqueiro"),
      E.unit("shaman", { key: "avo", name: "Xamã Fumacento", team: "enemy", tx: 20, ty: 5, maxHp: 10, ac: 12, atk: 4, dmg: "1d4+1", move: 5, dex: 1, group: "ruins", xpValue: 75,
        ranged: { range: 8, dmg: "1d8+1", name: "Chama Imunda", pal: PAL.ember } }),
      E.unit("chief", { key: "gorza", name: "Gorza, o Chefe", team: "enemy", tx: 21, ty: 6, maxHp: 24, ac: 15, atk: 5, dmg: "1d10+3", move: 5, dex: 0, group: "ruins", xpValue: 150, boss: true }),
    ];
    ruins[1].ranged = { range: 7, dmg: "1d6+2", name: "Flecha", pal: PAL.wood };
    cast.avo = ruins[2]; cast.gorza = ruins[3];
    W.enemies.push(...patrol, ...ruins);
    W.groups = { patrol, ruins };
    patrol.passive = ruins.passive = true;
    // Tomé: a sandy-haired boy in a green smock
    const tome = { ...SPECS.hero, cape: null, weapon: "none", small: true,
      hair: [[138, 90, 26], [184, 128, 42], [220, 168, 72], [240, 200, 104]], tunic: [[42, 58, 42], [62, 90, 58], [90, 122, 74], [122, 154, 90]] };
    SPECS.tome = tome;
    npc("maren", { key: "maren", name: "Maren, a pescadora", tx: 36, ty: 26, talk: marenTree, dir: 0 });
    npc(tome, { key: "tome", name: "Tomé", tx: 26, ty: 11, talk: tomeTree, dir: 0, small: true });
    npc("goblinElder", { key: "elder", name: "Goblin velha", tx: 14, ty: 5, dir: 0, talk: elderTalk });
    npc("goblinKid", { key: "kid1", name: "Criança goblin", tx: 13, ty: 6, dir: 0, talk: kidTalk, small: true });
    npc("goblinKid", { key: "kid2", name: "Criança goblin", tx: 15, ty: 5, dir: 1, talk: kidTalk, small: true });
    npc("murta", { key: "murta", name: "Goblin de arco", tx: 15, ty: 6, dir: 0, talk: murtaTalk, small: true });
    W.chests.push(
      { x: 27 * TILE + 16, y: 11 * TILE + 26, open: false, loot: { potions: 2, gold: 30, items: [gearItem("weapon", "machadinha"), gearItem("armor", "gibao"), gearItem("shield", "escudoOrmun")] }, name: "Baú dos goblins" },
      { x: 10 * TILE + 16, y: 38 * TILE + 26, open: false, loot: { potions: 1, gold: 5, item: ITEMS.letter }, name: "Baú de suprimentos", onOpen: () => hint("bag") },
    );
  }
  if (W.id === "sonho") {
    for (const [x, y] of W.marks.o) { npc("figure", { name: "Figura sem rosto", tx: x, ty: y, dir: 3, fixed: true }); W.setBlock(x, y, true); }
    const [cx, cy] = W.marks.C[0];
    npc("figure", { key: "turner", name: "Figura sem rosto", tx: cx, ty: cy, dir: 3, fixed: true });
    W.setBlock(cx, cy, true);
    const [lx, ly] = W.marks.L[0];
    const w = npc("archivist", { key: "woman", name: "A mulher da lanterna", tx: lx, ty: ly, dir: 0, fixed: true, talk: () => { dreamWoman(); return null; } });
    w.glow = { r: 40, c: [170, 200, 255], a: 0.18, h: 18 };
    W.setBlock(lx, ly, true);
    W.objects.push({ kind: "lantern", id: "lantern", x: lx * TILE + 28, y: ly * TILE + 22, glow: { r: 40, c: [200, 225, 255], a: 0.5, h: 12 }, sortY: 1 });
  }
  if (W.id === "relicario") {
    const [px, py] = W.marks.P[0];
    W.objects.push({ kind: "pedestal", id: "pedestal", x: px * TILE + 16, y: py * TILE + 28, glow: { r: 40, c: [160, 200, 255], a: 0.28, h: 40 } });
    W.marks.S.forEach(([x, y], i) => W.objects.push({ kind: "statue", id: "s" + (i + 1), x: x * TILE + 16, y: y * TILE + 28, lit: false }));
    const [dx, dy] = W.marks.D[0];
    W.objects.push({ kind: "door", id: "door", x: dx * TILE, y: dy * TILE + 31, lit: 0, sortY: -6 });
    W.chests.push({ x: 6 * TILE + 16, y: 15 * TILE + 26, open: false, loot: { potions: 1, gold: 0, items: [gearItem("weapon", "adagaVelmoor"), gearItem("armor", "mantoBruma")] }, name: "Arca de Velmoor" });
    const [hx, hy] = W.marks.H[0], [mx, my] = W.marks.M[0];
    W.objects.push({ kind: "relief", id: "reliefHero", who: "hero", x: hx * TILE + 16, y: hy * TILE + 30 });
    W.objects.push({ kind: "relief", id: "reliefTome", who: "tome", x: mx * TILE + 16, y: my * TILE + 30 });
    const g = npc("archivist", { key: "ghost", name: "A Arquivista", tx: px, ty: py - 1, dir: 0, fixed: true, ghost: true, hidden: true, float: 10, alpha: 0 });
    g.glow = { r: 44, c: [170, 200, 255], a: 0.12, h: 30 };
  }
}

// ---------------------------------------------------------------- the quest log
export function quests({ all } = {}) {
  if (!F.awake) return G.W?.id === "sonho" ? [{ title: "Um sonho", objs: [["Siga a avenida até a luz", !!F.dream_done]] }] : [];
  const out = [];
  const o = [];
  o.push(["Siga a trilha ao norte, até as Ruínas de Velmoor", !!F.ruins_entered]);
  if (F.ruins_entered) o.push([F.clan === "infiltrated" ? "Lide com o clã goblin (entrou escondido)" : "Lide com o clã goblin das ruínas", !!F.clan]);
  if (F.clan || F.tome_met) o.push(["Ache o caminho para baixo das ruínas", !!F.trapdoor_open]);
  if (F.trapdoor_open) o.push(["Desça ao Relicário, sob a coluna partida", !!F.relic_entered]);
  if (F.relic_entered) o.push([`Acenda as três Lumes das estátuas (${litCount()}/3)`, !!F.door_open]);
  if (F.door_open) o.push(["Descubra o que dorme no coração do Relicário", !!F.echo]);
  if (F.echo) o.push(["Fuja do Relicário", !!F.escape]);
  if (F.escape) o.push(["Corra até o barco, no cais", !!F.escape_done]);
  const notes = [];
  if (F.heard_smoke) notes.push("Os goblins queimam coisas velhas para afastar a névoa. São ladrões ou refugiados?");
  if (F.maren_history) notes.push("Maren: a aldeia do avô dela acordou um dia sem saber o que foi Velmoor.");
  if (F.otavio_found) notes.push("Um dos Esvaídos da Ordem era Otávio, o marido de Maren.");
  out.push({ title: "O que dorme em Velmoor", objs: all ? o : trimObjs(o), desc: "Um contrato assinado \"L.\": buscar o que dorme sob as Ruínas de Velmoor e levá-lo a Vau-de-Cardo. Trezentas peças de ouro.", notes });
  if (F.maren_quest) {
    const m = [];
    m.push(["Recupere a rede e a cadeira de Maren", !!F.loot_taken]);
    if (F.loot_taken) m.push(["Devolva a cadeira a Maren", !!F.returned_heirloom]);
    if (F.grandson) m.push(["Encontre Tomé, o neto de Maren", !!F.tome_met]);
    if (F.pact_proposed) m.push([F.pact_refused ? "Maren recusou a troca com os goblins" : "Convença Maren a trocar com os goblins", !!F.goblin_pact || !!F.pact_refused]);
    if (!all && m.every(([, d]) => d)) return out;
    out.push({ title: "As redes de Maren", side: true, objs: all ? m : trimObjs(m), desc: "Os goblins das ruínas roubaram as coisas de Maren, a pescadora do Lago Espelhado." });
  }
  return out;
}
const trimObjs = (o) => { const open = o.filter(([, d]) => !d); return open.length ? open : o.slice(-1); };

// ---------------------------------------------------------------- 6.1 the dream
export async function start() {
  await askTutorial();
  G.mode = "cutscene";
  E.loadMap("sonho", 8, 22, 3);
  E.partyChanged();
  UI.fade(1, 0);
  UI.cine("<p class='small'>Vento. Sinos, muito longe.</p>");
  sfx.bells?.();
  await E.sleep(2600);
  UI.cine("");
  await UI.fade(0, 2600);
  G.mode = "explore";
  hint("move");
  later(9, () => hint("interact"));
}

async function dreamWoman() {
  if (F.dream_woman) return;
  F.dream_woman = true;
  const w = cast.woman, ARQ = { name: "A mulher da lanterna", portrait: w.portrait };
  await scene(async () => {
    look(8, 3, 2);
    E.face(lead(), w);
    await say(ARQ, "Você veio. Eu sabia que viria. Eles todos esqueceram... mas você ainda vai lembrar. Lembre-se de mim.");
    let v;
    do {
      v = await ask(ARQ, "(Ela estende a lanterna. A luz é fria e não faz sombra.)", [
        { label: "Quem é você?", v: "who", if: () => !F.dw1 },
        { label: "Onde estamos?", v: "where", if: () => !F.dw2 },
        { label: "Tocar a luz.", v: "touch" },
      ]);
      if (v === "who") { F.dw1 = true; await say(ARQ, "Alguém que você ainda não conhece. Mas vai lembrar. É assim que funciona, com a gente."); }
      if (v === "where") { F.dw2 = true; await say(ARQ, "Em Velmoor. No que sobrou dela. Em você."); }
    } while (v !== "touch");
    // the towers come apart from the bottom up, like wet paper
    sfx.bells?.();
    const towers = G.W.objects.filter((o) => o.kind === "tower");
    const ymax = Math.max(...towers.map((o) => o.y));
    const figs = G.npcs.filter((n) => n !== w);
    const dissolve = tween(5, (k) => {
      for (const o of towers) o.clip = clamp(k * 1.8 - ((ymax - o.y) / (24 * TILE)) * 0.8);
      for (const f of figs) f.alpha = 1 - clamp(k * 2 - (f.y < 10 * TILE ? 0.5 : 0));
      F.whiteK = clamp(k * 1.2 - 0.3);
    });
    await E.sleep(1800);
    await say(ARQ, "Não tenha medo da Bruma. Tenha medo de esquecer.");
    tween(1.5, (k) => { w.alpha = 1 - k; E.obj("lantern").alpha = 1 - k; });
    await dissolve;
    F.dream_done = true;
    remember("dream", "A cidade branca do sonho, e a mulher de prata que pediu: \"lembre-se de mim\".", false);
    await UI.fade(1, 1400, "#fff");
    await E.sleep(600);
  });
  await campWake();
}

// ---------------------------------------------------------------- 6.2 the camp
async function campWake() {
  G.mode = "cutscene";
  F.whiteK = 0;
  G.party = [G.hero, G.mate];
  E.loadMap("vale", 15, 38, 3);
  E.place(G.hero, 15, 38, 3);
  E.place(G.mate, 14, 37, 1);
  E.partyChanged();
  G.camFocus = { x: G.hero.x, y: G.hero.y - 60, speed: 2 };
  UI.cine("<p class='small'>Fogueira estalando.</p>");
  await E.sleep(1200);
  UI.cine("");
  await UI.fade(0, 2200, "#fff");
  await E.sleep(500);
  await scene(async () => {
    G.camFocus = { x: G.hero.x - 16, y: G.hero.y - 10, speed: 2 };
    E.face(G.mate, G.hero);
    await talk(G.mate, mateIs("kael") ? kaelOpening() : lyraOpening());
  });
  F.awake = true;
  UI.updateQuest();
  UI.banner("O que dorme em Velmoor");
  hint("party"); hint("quest");
  later(25, () => hint("pause"));
}

function kaelOpening() {
  const next = [{ label: "Continuar", to: "next" }];
  return {
    start: { text: "Você falou dormindo de novo. \"Lembre-se de mim.\" Terceira noite seguida. (ele mexe no fogo) Se for uma mulher, tudo bem. Se for um deus, eu volto pra cidade.",
      options: [
        { label: "É só um sonho.", to: "dream" },
        { label: "É a torre do lacre. A mesma torre.", do: () => { F.dream_mind = true; F.letter_ask = true; }, to: "seal" },
        { label: "Você também anda sonhando, não anda?", check: { skill: "Intuição", dc: 10 }, pass: () => { F.kael_daughter_hint = true; }, passTo: "daughter", failTo: "nodaughter" },
      ] },
    dream: { text: "Sonhos não fazem a gente andar quatro dias até um vale no fim do mundo.", options: next },
    seal: { text: "A carta? Deixa eu ver esse desenho de novo. Tá no baú, com as poções. (ele aponta o baú com o queixo) Pega lá e me mostra.", options: next },
    daughter: { text: "...Com a minha filha. Mas esse é um sonho que eu tenho há anos. (ele cutuca a brasa e não diz mais nada sobre isso)", options: next },
    nodaughter: { text: "Eu? Eu durmo feito pedra. Vantagem de não pensar muito.", options: next },
    next: { text: "Bom. O contrato fala das ruínas, ao norte, subindo a trilha. Mas tem fumaça de chaminé no lago, a leste. Quem mora num lugar desses sabe o que tem nele. (ele olha para o norte) E essa névoa tá mais grossa do que ontem.", options: [{ label: "Vamos.", to: "end" }] },
  };
}
function lyraOpening() {
  const next = [{ label: "Continuar", to: "next" }];
  return {
    start: { text: "Bom dia. Você murmurou \"lembre-se de mim\" a noite toda. Achei romântico nas primeiras vinte vezes. (ela olha para o norte e para de sorrir) Essa névoa não é névoa.",
      options: [
        { label: "Como assim?", to: "how" },
        { label: "Examinar a névoa.", check: { skill: "Arcanismo", dc: 12 }, pass: () => { F.lyra_bruma = true; }, passTo: "bruma", failTo: "nobruma" },
        { label: "Você já viu isso antes.", to: "before" },
      ] },
    how: { text: "Névoa não tem cheiro de biblioteca.", options: next },
    bruma: { narr: true, text: "Você se abaixa. Na borda da névoa, as folhas de grama não terminam: elas simplesmente param de existir, como um desenho apagado com o dedo.", options: [{ label: "Continuar", to: "bruma2" }] },
    bruma2: { text: "(séria) Bruma. Tão ao sul? Não devia estar aqui por mais uns dez anos.", options: next },
    nobruma: { text: "É... névoa. Fria, úmida, cinza. Olhe de novo amanhã. Ou melhor, não olhe.", options: next },
    before: { text: "Eu já vi quase tudo antes, meu bem. (ela desvia os olhos)", options: next },
    next: { text: "A carta do contrato está no baú, com as poções. Ruínas ao norte, pela trilha. E há uma casa de pescador no lago, a leste: sempre vale perguntar a quem mora perto de um lugar o que ele esconde.", options: [{ label: "Vamos.", to: "end" }] },
  };
}

function itemRead(it) {
  if (it.id !== "letter" || F.letter_read) return;
  F.letter_read = true;
  afterJournal = () => scene(async () => {
    if (mateIs("kael")) await lines([[G.mate, F.letter_ask ? "(Kael olha o lacre por um bom tempo.) Uma torre. A mesma do seu sonho, aposto." : "(Kael lê por cima do seu ombro.)"],
      [G.mate, "\"Não escute o que ele disser.\" Ótimo. Adoro trabalho que vem com instrução assim."]]);
    else await lines([[G.mate, "(Lyra lê por cima do seu ombro, e para no fim.) \"L.\" ...Hm."], [G.mate, "Nada. Letra bonita. Gente com letra bonita nunca paga em dia."]]);
  });
}

async function deerTalk() {
  const o = E.obj("deer");
  await scene(async () => {
    const v = await ask(null, "Uma corça, parada na borda do acampamento, de frente para a névoa. Mastiga devagar um capim que não está ali. Os olhos dela são brancos, sem pupila. Ela não foge quando vocês chegam perto.", [
      { label: "Examinar a corça.", check: { skill: ["Medicina", "Natureza"], dc: 10 }, pass: "ok", fail: "bad", if: () => !F.deer_seen },
      { label: "Deixá-la em paz.", v: "leave" },
      { label: "Dar-lhe um fim rápido.", v: "end" },
    ]);
    if (v === "ok") { F.deer_seen = true; await say(null, "Ela não está doente. O coração bate, o corpo está quente. Ela só... esqueceu como ter medo."); return deerTalk(); }
    if (v === "bad") { F.deer_seen = true; await say(null, "Você não entende o que há com ela. Ela não reage a nada: nem a mão, nem a voz."); return; }
    if (v === "end") {
      F.deer_mercy = true;
      G.fx.spawn(FX.poof, { x: o.x, y: o.y });
      o.hidden = true;
      G.W.block[31 * MW + 12] = 0;
      if (mateIs("kael")) { approve("kael", 1); await say(G.mate, "(ele desvia o olhar) ...Rápido. Pelo menos foi rápido."); }
      else { approve("lyra", -1); await say(G.mate, "Ela não estava sofrendo, meu bem. Esse é o pior da Bruma: ninguém sofre."); }
    } else {
      F.deer_left = true;
      await say(G.mate, mateIs("kael") ? "Bicho nenhum fica parado assim. Nem os burros do regimento." : "...Não toque nela. Por favor.");
    }
  });
}

export function onRest() {
  if (G.W.id !== "vale" || F.rested_story || !F.awake) return;
  F.rested_story = true;
  scene(async () => {
    look(13, 34, 2);
    if (mateIs("kael")) await lines([
      [G.mate, "Tinha um velho no meu regimento, o Brás. Toda noite contava a mesma história: a de um ferreiro que forjou uma panela tão boa que a mulher dele nunca mais quis outra."],
      [G.mate, "Era só isso. Uma panela. A gente ria, mandava ele calar a boca. (pausa) Ele morreu no inverno. Eu ainda lembro da panela."],
    ]);
    else await lines([
      [G.mate, "Em Lethiel contam de uma estrela que caiu no lago e ficou com vergonha de voltar pro céu. Os peixes passaram a noite inteira contando histórias pra ela, até ela rir."],
      [G.mate, "Quando riu, subiu de novo. É por isso que os peixes não falam: gastaram todas as palavras naquela noite."],
    ]);
    tween(5, (k) => { F.campFogK = k; });
    await say(null, `Enquanto ${mateIs("kael") ? "ele" : "ela"} fala, a névoa em volta do acampamento recua, devagar, como um bicho que perdeu o interesse.`);
    remember("fire", mateIs("kael") ? "Kael, na fogueira, contando do velho Brás e da panela." : "Lyra, na fogueira, contando da estrela que caiu no lago.");
  });
}

// ---------------------------------------------------------------- 6.3 the patrol
async function patrolScene() {
  F.patrol_met = true;
  const P = G.groups.patrol, fiapo = cast.fiapo;
  await scene(async () => {
    look(22, 21, 2.5);
    hint("approach");
    const v = await ask(null, "Três goblins discutem na clareira, em volta de uma pilha de coisas: uma rede de pesca enrolada, potes e uma cadeira de balanço. Ainda não viram vocês.", [
      { label: "Esgueirar-se até a moita e escutar.", check: { skill: "Furtividade", dc: 11 }, pass: "hide", fail: "spotted" },
      { label: "Sair do mato gritando, armas em punho.", check: { skill: "Intimidação", dc: 13 }, pass: "scared", fail: "angry" },
      { label: "Chegar devagar, de mãos abertas, e falar.", check: { skill: "Persuasão", dc: 14 }, pass: "talk", fail: "angry" },
      { label: "Atacar.", tag: "Combate", v: "fight" },
      { label: "Voltar por enquanto.", v: "back" },
    ]);
    if (v === "back") { F.patrol_met = false; F.patrol_cd = true; G.camFocus = null; return; }
    if (v === "spotted") { await say(null, "Um galho estala sob o seu pé. Três cabeças verdes se viram ao mesmo tempo."); return patrolFight(false); }
    if (v === "angry") { await say(fiapo, "Gente grande! Pega! Pega!"); return patrolFight(false); }
    if (v === "fight") return patrolFight(false);
    if (v === "scared") {
      F.patrol = "scared"; F.gorza_warned = true;
      await say(fiapo, "Grande! Grande e feio! Corre, corre!");
      patrolLeave(true);
      return reward(100, "A patrulha fugiu para as ruínas");
    }
    if (v === "hide") {
      E.walk(lead(), 18, 22, 60);
      await E.sleep(700);
      F.heard_smoke = true;
      if (mateIs("lyra")) await lines([[null, "Da moita, dá para ouvir tudo. Os goblins falam rápido, numa língua de estalos e chiados."], [G.mate, "(sussurrando) \"A velha disse: mais coisa com cheiro de gente. A fumaça tá fina.\" ...Foi o que eles disseram. Palavra por palavra."]]);
      else await lines([[null, "Da moita, dá para ouvir tudo. Os goblins falam rápido, numa língua de estalos e chiados. Você pega duas palavras que parecem \"fumaça\" e \"velha\"."], [G.mate, "(sussurrando) Não entendi nada. Alguma coisa sobre fumaça. E uma velha. Acho."]]);
      const w = await ask(null, "Os goblins não sabem que vocês estão aqui.", [
        { label: "Emboscar.", tag: "Rodada surpresa", v: "ambush" },
        { label: "Esperar que vão embora.", v: "wait" },
        { label: "Sair da moita e falar com eles.", check: { skill: "Persuasão", dc: 12 }, pass: "talk", fail: "angry" },
      ]);
      if (w === "ambush") return patrolFight(true);
      if (w === "angry") { await say(fiapo, "Tava escondido! Escondido é inimigo!"); return patrolFight(false); }
      if (w === "wait") {
        F.patrol = "sneaked";
        await say(null, "Depois de muito discutir, os goblins largam a pilha ali mesmo (\"pra buscar depois\", parece) e sobem a trilha para o norte.");
        patrolLeave(false);
        return reward(100, "Vocês passaram sem ser vistos");
      }
    }
    // talk
    F.patrol = "talked"; F.heard_smoke = true; F.fiapo_spared = true;
    E.face(fiapo, lead());
    await lines([
      [fiapo, "Não bate! Fiapo fala, Fiapo fala! ...O branco come a gente lá em cima. Come a cabeça. A gente esquece de comer, de andar, de ser goblin."],
      [fiapo, "A Avó faz fumaça que o branco não gosta. Mas precisa de coisa. Coisa com cheiro de gente. Coisa velha. (ele aponta a pilha)"],
    ]);
    const w = await ask(fiapo, "Fiapo pode ir?", [
      { label: "Essas coisas são da Maren, a pescadora.", v: "maren" },
      { label: "Vão. Digam à Avó que viemos em paz.", v: "go" },
    ]);
    if (w === "maren") await say(fiapo, "...Fiapo sabe. Fiapo pede desculpa pra cadeira.");
    patrolLeave(false);
    reward(100, "A patrulha foi embora sem luta");
  });
}
function patrolFight(surprise) {
  const P = G.groups.patrol;
  if (surprise) for (const e of P) { e.skip = 1; e.skipNote = "Surpreso!"; }
  F.patrol = "fought";
  E.fight(P);
}
function patrolLeave(running) {
  for (const e of G.groups.patrol) {
    if (e.hp <= 0) continue;
    e.passive = true;
    E.walk(e, 21, 14, running ? 120 : 60).then(() => { e.gone = true; });
  }
}
async function lootTalk() {
  const o = E.obj("loot");
  if (G.groups.patrol.some((e) => e.hp > 0 && !e.gone)) return UI.toast("Os goblins estão bem em cima da pilha.");
  await scene(async () => {
    const v = await ask(null, "A rede enrolada, dois potes de barro e uma cadeira de balanço. No encosto da cadeira, entalhado à faca, com um talho em forma de anzol: \"Para a Maren, do teu Otávio\".", [
      { label: "Pegar a rede e a cadeira.", v: "take" },
      { label: "Deixar tudo aí.", v: "leave" },
    ]);
    if (v !== "take") return;
    F.loot_taken = true; F.chair_seen = true;
    giveItem(ITEMS.net); giveItem(ITEMS.chair); giveItem(gearItem("weapon", "lancaGoblin"));
    o.hidden = true;
    G.W.block[21 * MW + 24] = 0;
    sfx.chest();
    UI.toast("Rede da Maren, Cadeira do Otávio e uma lança goblin na bolsa", 3200);
  });
}

// ---------------------------------------------------------------- 6.4 the Mirror Lake and Maren
function marenTree() {
  const makePact = () => { F.goblin_pact = true; setTimeout(() => reward(150, "Pacto com o clã Dente-de-Musgo"), 400); };
  if (F.maren_forgot) return { start: { text: "Ah! Viajantes de verdade, graças à Senhora das Marés.", options: [{ label: "...", to: "end" }] } };
  return {
    start: () => ({
      text: !F.maren_met ? "Ah! Viajantes de verdade, graças à Senhora das Marés. Goblins tomaram as velhas Ruínas de Velmoor, ao norte. Roubam minhas redes, assustam os peixes... Levaram até a cadeira de balanço do meu marido."
        : F.returned_heirloom ? "Vocês de novo. Sentem, sentem. A cadeira está ali, no lugar dela." : "De volta? Alguma notícia das minhas coisas?",
      options: [
        { if: () => !F.maren_met, label: "Nós vamos recuperar suas coisas.", do: () => { F.maren_met = F.maren_quest = true; }, to: "accept" },
        { if: () => !F.maren_met, label: "Estamos aqui por outra coisa: as ruínas.", do: () => { F.maren_met = F.maren_quest = true; }, to: "ruins" },
        { if: () => hasItem("chair"), label: "Trouxemos a cadeira do Otávio. E a sua rede.", do: () => {
          F.returned_heirloom = F.maren_met = F.maren_quest = true; takeItem("chair"); takeItem("net"); approve("kael", 1); approve("lyra", 1); G.potions++; giveItem(gearItem("weapon", "bestaLeve"));
          setTimeout(() => { reward(100, "As coisas de Maren voltaram para casa"); remember("heirloom", "Maren chorando em silêncio, com a cadeira de Otávio nas mãos."); }, 300);
        }, to: "heirloom" },
        { if: () => F.heard_smoke && !F.maren_smoke, label: "Os goblins não estão roubando à toa. Eles queimam suas coisas.", do: () => { F.maren_smoke = true; }, to: "smoke" },
        { if: () => F.maren_met && F.paid_try == null, label: "Um trabalho desses merece pagamento adiantado.", check: { skill: "Persuasão", dc: 12 }, pass: () => { F.paid_try = true; G.potions += 2; UI.toast("+2 Poções de cura"); }, fail: () => { F.paid_try = false; }, passTo: "paid", failTo: "notpaid" },
        { if: () => F.maren_met && F.grandson == null, label: "Você está escondendo alguma coisa.", check: { skill: "Intuição", dc: 10 }, pass: () => { F.grandson = true; }, fail: () => { F.grandson = false; }, passTo: "secret", failTo: "nosecret" },
        { if: () => F.maren_met && F.maren_history == null, label: "O que você sabe das ruínas?", check: { skill: "História", dc: 13 }, pass: () => { F.maren_history = true; setTimeout(() => reward(50, "Uma pista sobre Velmoor"), 300); }, fail: () => { F.maren_history = false; }, passTo: "history", failTo: "nohistory" },
        { if: () => F.maren_met && !F.maren_mist, label: "Essa névoa que desce do norte...", do: () => { F.maren_mist = true; }, to: "mist" },
        { if: () => F.pact_proposed && !F.goblin_pact && !F.pact_refused && F.returned_heirloom, label: "Os goblins só queriam fumaça. Coisas velhas, como a cadeira guardava o Otávio. Eles trocariam trabalho por elas.", tag: "Ela confia em vocês", do: makePact, to: "pactyes" },
        { if: () => F.pact_proposed && !F.goblin_pact && !F.pact_refused && !F.returned_heirloom, label: "Os goblins trocariam trabalho por coisas velhas.", check: { skill: "Persuasão", dc: 12 }, pass: makePact, fail: () => { F.pact_refused = true; }, passTo: "pactyes", failTo: "pactno" },
        { if: () => F.tome_home, label: "O Tomé chegou bem?", to: "tome" },
        { if: () => F.maren_met && !F.clan, label: "Quantos goblins são?", tag: "Perguntar", to: "count" },
        { label: "Até mais, Maren.", to: "end" },
      ],
    }),
    accept: { text: "Que os deuses guiem vocês. A estrada ao norte leva direto às ruínas, e vi uma patrulha deles rondando a trilha. Se acharem a minha rede... e a cadeira do meu Otávio... tragam de volta. O resto eles podem levar.", options: [{ label: "Mais uma pergunta.", to: "start" }, { label: "Até mais.", to: "end" }] },
    ruins: { text: "As ruínas? Só tem pedra velha e goblin lá em cima. ...Mas se vão subir, façam uma velha feliz: me tragam a minha rede. E a cadeira de balanço do meu marido.", options: [{ label: "Mais uma pergunta.", to: "start" }, { label: "Até mais.", to: "end" }] },
    paid: { text: "Hmpf... justo. Tomem, duas poções do meu estoque. Mas eu quero aqueles goblins longe das minhas redes!", options: [{ label: "Combinado.", to: "start" }] },
    notpaid: { text: "Adiantado? Ha! Paguem-se com o que os goblins roubaram de mim, se acharem.", options: [{ label: "Justo.", to: "start" }] },
    secret: { text: "...Meu neto, Tomé. Foi atrás das redes e não voltou. Se o virem nas ruínas, por favor... tragam ele de volta.", options: [{ label: "Vamos encontrá-lo.", to: "start" }] },
    nosecret: { text: "Escondendo? Só o cheiro de peixe, criança. Hah!", options: [{ label: "Certo...", to: "start" }] },
    count: { text: "Uns quatro ou cinco nas ruínas, fora os pequenos. Um deles mexe com fogo, um xamã. Se fosse eu, derrubava esse primeiro.", options: [{ label: "Bom saber.", to: "start" }] },
    heirloom: { text: "(Ela segura a cadeira com as duas mãos e chora em silêncio.) ...Ele levou um inverno inteiro pra entalhar isso. Dizia que era pra quando eu ficasse velha. Fiquei. Ele não viu. Tomem, uma poção. E levem a besta dele, que ninguém aqui sabe armar. Obrigada.", options: [{ label: "Continuar", to: "start" }] },
    smoke: { text: "Queimam? A rede que eu remendo desde menina? A cadeira do meu marido? (pausa) ...Então é por isso que a fumaça das ruínas cheira a casa.", options: [{ label: "Continuar", to: "start" }] },
    history: { text: "Ninguém sabe o que foi Velmoor. Meu avô dizia que, quando criança, sabia, e um dia acordou sem saber. A aldeia inteira acordou sem saber.", options: [{ label: "Continuar", to: "start" }] },
    nohistory: { text: "Pedras velhas, goblins novos. É o que eu sei.", options: [{ label: "Continuar", to: "start" }] },
    mist: { text: "Desce do norte faz uns anos. Cada inverno, um pouco mais. Meu Otávio saiu pra pescar num dia de névoa assim, faz três anos. O lago devolveu o barco. Ele, não.", options: [{ label: "Sinto muito.", to: "start" }] },
    pactyes: { text: "...Coisa velha eu tenho. A casa é feita disso. (ela suspira) Digam pra eles: peixe pela manhã, vigia de noite, e nada de roubar. Eu mesma levo a primeira carroça de tralha.", options: [{ label: "Continuar", to: "start" }] },
    pactno: { text: "Não. Eles me roubaram. Não vou dar mais nada pra quem me roubou.", options: [{ label: "Continuar", to: "start" }] },
    tome: { text: "Chegou correndo, sujo de fuligem, falando de uma moça que mora debaixo da terra. (ela balança a cabeça) Obrigada. De verdade.", options: [{ label: "Continuar", to: "start" }] },
  };
}

async function pierLook() {
  if (F.pier_seen) return say(null, "A água está parada. Só o seu reflexo, e o céu.");
  await scene(async () => {
    look(42, 25, 2);
    const v = await ask(null, "Da ponta do píer, a água do Lago Espelhado está tão parada que parece vidro. A noroeste, as ruínas aparecem invertidas na superfície.", [
      F.dream_mind ? { label: "Olhar a água com o sonho em mente.", tag: "O sonho", v: "ok" } : { label: "Olhar a água com atenção.", check: { skill: "Percepção", dc: 12 }, pass: "ok", fail: "bad" },
      { label: "Deixar para lá.", v: "no" },
    ]);
    if (v === "no") return;
    F.pier_seen = true;
    if (v === "bad") return say(null, "Por um instante você acha que o reflexo das ruínas está... inteiro. Depois pisca, e são só pedras quebradas na água.");
    G.tint = "rgba(220,230,255,0.25)";
    sfx.bells?.();
    await lines([
      [null, "No reflexo, as ruínas não estão quebradas. No lugar delas há uma cidade de torres brancas, sob um céu sem sol."],
      [null, "Na margem refletida, uma mulher de cabelos de prata está de costas. Ela se vira. A água treme, e o reflexo se desfaz."],
    ]);
    G.tint = null;
    const m = cast.maren;
    if (!F.maren_forgot && dist(m.x, m.y, lead().x, lead().y) < 14 * TILE) await say(m, "Você também vê? Meu Otávio dizia que o lago lembra do que o mundo esqueceu.");
    reward(50, "O Lago Espelhado");
  });
}

async function nameTree() {
  if (F.names_tree != null) return say(null, F.names_tree ? "M + O, com o talho em forma de anzol." : "Nomes e mais nomes, quase todos gastos pelo tempo.");
  await scene(async () => {
    const v = await ask(null, "Uma árvore morta na margem norte do lago, coberta de nomes entalhados. A maioria já ficou ilegível. Alguns parecem ter sido raspados.", [
      { label: "Procurar um nome conhecido.", check: { skill: "Investigação", dc: 12 }, pass: "ok", fail: "bad" },
      { label: "Deixar a árvore em paz.", v: "no" },
    ]);
    if (v === "no") return;
    F.names_tree = v === "ok";
    if (v === "ok") { await say(null, "Perto da raiz: \"M + O\". Ao lado, um talho em forma de anzol, feito com a ponta de uma faca. Alguém assinava assim."); reward(25, "A Árvore dos Nomes"); }
    else await say(null, "Nomes demais, e nenhum que diga alguma coisa a você.");
  });
}
async function markerStone() {
  if (F.marker_read != null) return say(null, "O marco de Velmoor, meio enterrado na margem.");
  await scene(async () => {
    const v = await ask(null, "Uma pedra branca meio enterrada na margem da lagoa, lisa demais para ser natural. Uma linha de sinais corre pela face dela.", [
      { label: "Decifrar a inscrição.", check: { skill: "História", dc: 12 }, pass: "ok", fail: "bad" },
      { label: "Seguir caminho.", v: "no" },
    ]);
    if (v === "no") return;
    F.marker_read = v === "ok";
    if (v === "ok") { await lines([[null, "É escrita velmooriana, a mesma das ruínas. Você lê devagar: \"Tudo o que existe é lembrado por alguém.\""], [G.mate, mateIs("lyra") ? "(baixinho) ...\"O que ninguém lembra, a Bruma leva.\" A frase continua do outro lado. Está enterrada." : "Bonito. Agora diz o que significa."]]); reward(50, "Um marco de Velmoor"); }
    else await say(null, "Os sinais parecem letras, mas nenhuma que você conheça.");
  });
}

// ---------------------------------------------------------------- 6.5 the ruins and the Dente-de-Musgo clan
const avoSpeaker = () => ({ name: "Avó Fuligem", portrait: cast.avo.portrait });
const gorzaSp = () => cast.gorza;

async function breachScene() {
  F.breach_asked = true;
  await scene(async () => {
    look(26, 9, 2.5);
    hint("stealth");
    const v = await ask(null, "Uma brecha no muro leste. Lá dentro, a fumaça cinzenta e doce cobre tudo. Um goblin arqueiro vigia o pátio, de costas, coçando a orelha. Atrás de uma coluna partida, algo se mexe.", [
      { label: "Entrar escondido.", check: { skill: "Furtividade", dc: 13 }, pass: "in", fail: "seen" },
      { label: "Dar a volta e entrar pela frente.", v: "front" },
    ]);
    if (v === "in") {
      F.infiltrated = true; F.clan = "infiltrated"; F.ruins_entered = true;
      await say(null, "Vocês passam pela brecha colados ao muro. O arqueiro boceja. Ninguém vira a cabeça.");
      reward(100, "Entraram nas ruínas sem ser vistos");
    } else if (v === "seen") {
      await say(null, "Uma pedra solta rola do muro. O arqueiro se vira, e grita alguma coisa em goblin.");
      await gorzaScene(true);
    }
  });
}

async function gorzaScene(caught) {
  F.gorza_met = true; F.ruins_entered = true;
  const gorza = gorzaSp(), avo = avoSpeaker();
  await scene(async () => {
    look(20, 7, 2.5);
    hint("ruins");
    E.face(gorza, lead());
    await lines([
      ...(caught ? [[gorza, "Vocês achou que goblin não tem olho?"]] : []),
      ...(F.gorza_warned ? [[gorza, "Batedor contou. Gente grande e feia na trilha. Gorza tava esperando."]] : []),
      [null, "No centro do pátio, uma fogueira verde-acinzentada queima redes, sapatos, brinquedos, cartas. A névoa branca para exatamente na borda da fumaça, como água contra um vidro."],
      [gorza, "Mais um passo e Gorza quebra vocês. (ele olha para a névoa atrás do grupo) ...Ou vocês ficam e o branco come vocês. Escolhe."],
    ]);
    const dcTalk = F.heard_smoke || F.fiapo_spared ? 11 : F.gorza_warned ? 15 : 14;
    const v = await ask(gorza, "(Gorza espera, de machado na mão. Atrás dele, uma goblin velha de capuz vermelho observa vocês e mexe a brasa com um osso.)", [
      { label: F.heard_smoke || F.fiapo_spared ? "Vocês queimam essas coisas para segurar a névoa. Por quê?" : "Ninguém precisa quebrar ninguém. Por que vocês estão aqui?", check: { skill: "Persuasão", dc: dcTalk }, pass: "talk", fail: "angry" },
      { label: "Saiam do vale. Hoje.", check: { skill: "Intimidação", dc: F.gorza_warned ? 14 : 16 }, pass: "scared", fail: "angry" },
      { label: "Atacar a velha de capuz primeiro.", tag: "Combate, surpresa", v: "avo" },
      { label: "Então vamos quebrar.", tag: "Combate", v: "fight" },
    ]);
    if (v === "angry") { await say(gorza, "Gorza cansou de conversa."); return ruinsFight(false); }
    if (v === "fight") return ruinsFight(false);
    if (v === "avo") { F.target_avo = true; approve("kael", -1); approve("lyra", -1); return ruinsFight(true); }
    if (v === "scared") {
      await say(gorza, "(Gorza olha para vocês. Depois para a névoa.) ...Gorza leva o clã. Mas o branco vem atrás de vocês também. Lembra disso.");
      F.clan = "scared"; F.smoke_out = true;
      clanLeaves(true);
      await E.sleep(1500);
      await say(null, "Uma goblin pequena, de arco nas costas, fica por último. Olha para você como quem decora um rosto. Depois some pela brecha.");
      return reward(250, "O clã Dente-de-Musgo deixou o vale");
    }
    // they talk
    await lines([
      [gorza, "...Gorza veio de cima. Das Terras Altas. Clã inteiro. Metade ficou branca no caminho. Andando, andando, e depois só parado. Olhando pra nada."],
      [gorza, "Avó descobriu: fumaça de coisa lembrada segura o branco. Então goblin pega coisa. Coisa de goblin, goblin quase não tem mais."],
      [avo, "Humano acha que goblin rouba coisa. Goblin rouba lembrança. Toda coisa velha tem lembrança grudada, que nem fuligem. A gente queima, e a fumaça diz pro branco: \"aqui alguém lembra\"."],
      [avo, "(ela cospe no fogo) Vocês fazem igual, lá na cidade grande. Só que queimam gente."],
    ]);
    F.clan = "truce"; F.heard_smoke = true;
    let w;
    do {
      w = await ask(gorza, "E agora?", [
        { if: () => !F.pact_proposed, label: "E se vocês trocassem em vez de roubar? A pescadora tem coisa velha de sobra. Vocês ajudam na pesca e vigiam o vale.", v: "trade" },
        { if: () => hasItem("letter") && !F.offered_letter, label: "Queimem isto.", tag: "Oferecer a Carta do Contrato", v: "letter" },
        { if: () => !F.mate_offer, label: mateIs("kael") ? "Kael, você tem alguma coisa pra oferecer ao fogo?" : "Lyra, você tem alguma coisa pra oferecer ao fogo?", v: "mate" },
        { label: "Por enquanto, só queremos passar.", v: "done" },
      ]);
      if (w === "trade") {
        F.pact_proposed = true;
        await lines([[gorza, "...Pescadora não gosta de goblin."], [avo, "Pescadora gosta de peixe. Vai lá, humano. Fala com ela. Se ela topar, goblin topa."]]);
      }
      if (w === "letter") {
        F.offered_letter = true; takeItem("letter");
        fireFlare();
        await lines([[avo, "(ela cheira o papel) Papel com medo dentro. Queima bonito."], [G.mate, mateIs("kael") ? "(baixinho) Lá se vai a nossa prova do contrato." : "(baixinho) \"Não escute o que ele disser.\" Agora ninguém mais vai ler isso. Que pena."]]);
      }
      if (w === "mate") {
        F.mate_offer = true;
        if (mateIs("kael")) { F.kael_refused = true; await say(G.mate, "(Kael leva a mão ao peito, onde guarda alguma coisa por baixo da camisa. Hesita.) ...Não. Isso não."); }
        else { F.lyra_offered = true; fireFlare(); await say(G.mate, "(Lyra tira uma fita do cabelo e joga no fogo sem olhar. A fumaça sobe azulada.) Tenho trezentos anos de coisas, meu bem. Uma fita não faz falta."); }
      }
    } while (w !== "done");
    await say(gorza, "Pode andar. Não mexe na fogueira. E tem filhote de humano escondido atrás da coluna. Gorza não come filhote. Leva embora.");
    reward(250, "Trégua com o clã Dente-de-Musgo");
  });
}
function ruinsFight(surprise) {
  const R = G.groups.ruins;
  if (surprise) for (const e of R) { e.skip = 1; e.skipNote = "Surpreso!"; }
  E.fight(R);
}
function fireFlare() {
  const o = G.W.objects.find((x) => x.kind === "campfire" && x.goblin);
  G.fx.spawn(FX.bloom, { x: o.x, y: o.y, palette: PAL.ember });
  for (let i = 0; i < 3; i++) setTimeout(() => G.fx.spawn(FX.hitSpark, { x: o.x + (i - 1) * 6, y: o.y - 16, palette: PAL.ember }), i * 140);
}
function fireOut() {
  const o = G.W.objects.find((x) => x.kind === "campfire" && x.goblin);
  if (!o || o.out) return;
  o.out = true;
  if (o.fxe) { o.fxe.keep = false; o.fxe.fx.stop(); }
  G.fx.spawn(FX.poof, { x: o.x, y: o.y });
  tween(20, (k) => { F.smokeK = k; });
}
/** The clan walks out through the west breach and is gone. */
function clanLeaves(all) {
  const who = [...(all ? G.groups.ruins : []), cast.elder, cast.kid1, cast.kid2, cast.murta].filter((u) => u && u.hp > 0 && !u.gone);
  who.forEach((u, i) => {
    u.passive = true;
    setTimeout(() => E.walk(u, 12, 7 + (i % 2), 90).then(() => E.walk(u, 10, 8, 90)).then(() => { G.fx.spawn(FX.poof, { x: u.x, y: u.y }); u.gone = true; }), i * 220);
  });
  if (all) fireOut();
}

function elderTalk() {
  return { start: { text: mateIs("lyra") ? "(A goblin velha esconde o rosto num trapo e resmunga em goblin. Lyra traduz:) Ela diz que você tem cheiro de chuva. Acho que é um elogio." : "(A goblin velha esconde o rosto num trapo e resmunga alguma coisa em goblin. Não parece um elogio.)", options: [{ label: "Deixá-la em paz.", to: "end" }] } };
}
function kidTalk() {
  return { start: { text: "(Uma criança goblin espia você por trás de um trapo. Quando você olha, ela some.)", options: [{ label: "...", to: "end" }] } };
}
function murtaTalk() {
  const m = cast.murta;
  return { start: { text: "(Uma goblin jovem, de arco nas costas, encara você sem piscar.) Humano olha muito. Murta não gosta.", options: [{ label: "Murta? É o seu nome?", do: () => { m.name = "Murta"; }, to: "name" }, { label: "Desculpe.", to: "end" }] },
    name: { text: "Neta da Avó. Murta atira em quem mexe na fogueira. Murta atira bem.", options: [{ label: "Vou lembrar disso.", to: "end" }] } };
}

// ---------------------------------------------------------------- Tomé and the trapdoor
function tomeTree() {
  const t = cast.tome;
  if (F.tome_home && G.W.id === "vale") return { start: { text: "A vó disse que eu não posso mais sair de perto do cais. ...Mas a moça lá de baixo ainda fala comigo, sabia? Baixinho.", options: [{ label: "Fique com a sua avó.", to: "end" }] } };
  if (F.tome_with) return { start: { text: "Eu fico atrás de você. Prometo.", options: [{ label: "Fique perto.", to: "end" }] } };
  if (F.tome_met) return { start: { text: "A porta tá ali, ó. Debaixo da coluna.", options: [
    { label: "Vá pra casa, Tomé. Sua avó está esperando.", do: tomeHome, to: "bye" },
    { label: "Tá bem. Pode vir, mas fica atrás de mim.", do: tomeCome, to: "come" },
    { label: "Já volto.", to: "end" },
  ] }, bye: { text: "Tá... tá bom. Vou correndo pra lá.", options: [{ label: "Vá com cuidado.", to: "end" }] }, come: { text: "Eu sabia que vocês eram legais!", options: [{ label: "Fique perto.", to: "end" }] } };
  return {
    start: { text: "Não me machuquem! ...Vocês não são goblins. Eu sou o Tomé. Eu vim atrás das redes e... achei uma porta. Debaixo da coluna. Ela tem a minha cara desenhada. Juro! E tem uma moça que fala lá de baixo.",
      options: [
        { label: "Sua avó está te esperando no cais. Vá pra casa.", do: () => { F.tome_met = true; tomeHome(); }, to: "bye" },
        { label: "Mostre essa porta.", do: () => { F.tome_met = true; openTrapdoor(); }, to: "door" },
        { label: "Que moça?", to: "lady" },
      ] },
    lady: { text: "Ela fala baixinho. Só quando tá tudo quieto. Ela disse que conhece vocês. Que estava esperando.", options: [{ label: "Mostre essa porta.", do: () => { F.tome_met = true; openTrapdoor(); }, to: "door" }, { label: "Vá pra casa, Tomé.", do: () => { F.tome_met = true; tomeHome(); }, to: "bye" }] },
    door: { text: "Ali, ó, no pé da coluna partida! (ele raspa a terra com o pé, e aparece uma laje com um rosto de menino entalhado) Eu vou junto! A moça disse que ia me contar uma coisa que eu esqueci.",
      options: [
        { label: "Tá bem. Pode vir, mas fica atrás de mim.", do: tomeCome, to: "come" },
        { label: "Não. Vá pra casa, sua avó está preocupada.", do: tomeHome, to: "bye" },
      ] },
    bye: { text: "A vó Maren! Tá... vou correndo pra lá. Obrigado, de verdade!", options: [{ label: "Vá com cuidado.", to: "end" }] },
    come: { text: "Eu sabia que vocês eram legais!", options: [{ label: "Fique perto.", to: "end" }] },
  };
}
function openTrapdoor() {
  F.trapdoor_open = true;
  const o = E.obj("trapdoor", E.map("vale"));
  o.hidden = false; o.open = true; E.refresh(o);
  G.fx.spawn(FX.poof, { x: o.x, y: o.y });
  setTimeout(() => reward(50, "Uma porta sob as ruínas"), 400);
}
function tomeHome() {
  const t = cast.tome;
  F.tome_home = true; F.tome_with = false; F.tome_alive = true;
  G.followers = G.followers.filter((u) => u !== t);
  if (!G.W.npcs.includes(t) && G.W.id === "vale") G.W.npcs.push(t);
  G.fx.spawn(FX.poof, { x: t.x, y: t.y });
  E.place(t, 37, 27, 0);
  if (F.grandson) setTimeout(() => reward(50, "Tomé voltou para a avó"), 500);
}
function tomeCome() {
  const t = cast.tome;
  F.tome_with = true; F.tome_alive = true;
  approve("kael", -1);
  if (G.W.npcs.includes(t)) G.W.npcs.splice(G.W.npcs.indexOf(t), 1);
  G.followers.push(t);
  E.resetTrail();
}

async function trapdoorUse() {
  if (F.escape) return;
  const v = await ask(null, "A laje se abre para uma escada de pedra branca. Lá embaixo há uma luz fria, sem fonte. Não vem nenhum cheiro de poeira.", [
    { label: "Descer ao Relicário.", v: "down" },
    { label: "Ainda não.", v: "no" },
  ]);
  if (v === "down") enterRelic();
}

// ---------------------------------------------------------------- 6.6 the Relicário
async function enterRelic() {
  await scene(async () => {
    await UI.fade(1, 700);
    const R = E.map("relicario");
    const hero = E.obj("reliefHero", R), tm = E.obj("reliefTome", R);
    if (!hero.spec) { hero.spec = G.hero.spec; tm.spec = SPECS.tome; E.refresh(hero); E.refresh(tm); }
    E.loadMap("relicario", 11, 28, 3);
    G.camFocus = null;
    await UI.fade(0, 900);
    if (!F.relic_entered) {
      F.relic_entered = true;
      await lines([
        [G.mate, mateIs("kael") ? "Sem poeira. Sem teia. Ou alguém limpa isso aqui todo dia, ou ninguém nunca entrou." : "(muito baixo) Velmoor... Não toquem em nada. Eu falo sério dessa vez."],
        ...(F.tome_with ? [[cast.tome, "Tá vendo? Eu falei. Tem luz sem vela!"]] : []),
      ]);
      UI.updateQuest();
    }
  });
}

async function atriumScene() {
  F.atrium = true;
  await scene(async () => {
    look(11, 22, 2);
    await say(null, "As paredes estão cobertas de relevos: centenas de pessoas sem rosto, de costas, como as do seu sonho. Menos duas. Uma, na parede oeste, tem o seu rosto. Exatamente o seu. A outra, na parede leste, tem o rosto de um menino.");
    if (F.tome_with) await say(cast.tome, "Sou eu! Eu falei que tinha a minha cara!");
    const v = await ask(null, "(Os relevos parecem olhar para vocês.)", [
      { label: "Lembrar o que se conta sobre Velmoor.", check: { skill: "História", dc: 14 }, pass: "ok", fail: "bad" },
      { label: "Sentir a magia das paredes.", check: { skill: "Arcanismo", dc: 13 }, pass: "ok", fail: "bad" },
      { label: "Seguir em frente.", v: "no" },
    ]);
    if (v === "ok") { F.atrium_read = true; await say(null, "Você entende: os relevos não foram esculpidos para vocês. Eles mudam para mostrar quem entra. Este lugar quer que você se sinta esperado."); reward(50, "O Átrio dos Rostos"); }
    if (v === "bad") await say(null, "São só pedras. Pedras que sabem a sua cara.");
  });
}

const litCount = () => ["s1", "s2", "s3"].filter((id) => E.obj(id, E.map("relicario"))?.lit).length;
const STATUE_Q = {
  s1: "Quem te ensinou a ser quem você é?",
  s2: "Qual é o lugar que você chama de casa?",
  s3: "Qual é a coisa que você nunca contou a ninguém?",
};
async function statueTalk(id) {
  const o = E.obj(id);
  const names = { s1: "A Primeira Estátua", s2: "A Segunda Estátua", s3: "A Terceira Estátua" };
  const sp = { name: names[id], portrait: statuePortrait() };
  if (o.lit) return say(sp, `(A Lume da estátua brilha. Ela já ouviu a sua resposta.)`);
  let text = null;
  await scene(async () => {
    if (id === "s1") {
      const cleric = /Clérigo/.test(G.hero.cls);
      const v = await ask(sp, STATUE_Q.s1, [
        { label: "Minha mãe.", v: "mãe" }, { label: "Meu pai.", v: "pai" }, { label: "Um mestre.", v: "mestre" },
        { label: "Ninguém. Aprendi por conta própria.", v: "ninguém" },
        ...(cleric ? [{ label: "Um deus.", v: "deus" }] : []),
      ]);
      let name = "";
      if (v !== "ninguém") {
        const q = v === "deus" ? "A quem você reza?" : v === "mestre" ? "Como se chamava o seu mestre?" : "Qual era o nome?";
        await ask(sp, q, [{ label: "É esse o nome.", v: "ok", do: (val) => { name = val; } }], { input: { placeholder: v === "deus" ? "Solenne, Nhara, Ormun..." : "um nome (ou deixe em branco)", value: v === "deus" ? "Solenne" : "" } });
      }
      G.origin = { ...G.origin, mentor: v, mentorName: name };
      text = v === "mãe" ? `Minha mãe${name ? ", " + name : ""}, que me ensinou a ser quem eu sou.`
        : v === "pai" ? `Meu pai${name ? ", " + name : ""}, que me ensinou a ser quem eu sou.`
        : v === "mestre" ? `${name || "Meu mestre"}, que me ensinou o ofício, e todo o resto junto.`
        : v === "deus" ? `${name || "A divindade"}, a quem eu devo quem eu sou.` : "Ninguém me ensinou. Aprendi por conta própria, e lembro de cada tombo.";
    }
    if (id === "s2") {
      const v = await ask(sp, STATUE_Q.s2, [
        { label: "Uma aldeia.", v: "Uma aldeia de telhados baixos, onde todo mundo sabia o meu nome." },
        { label: "Uma cidade.", v: "Uma cidade barulhenta, com uma janela que dava para os telhados." },
        { label: "A estrada.", v: "A estrada. Nenhuma cama duas vezes, e o céu sempre em cima." },
        { label: "Um templo.", v: "Um templo de pedra fria, com cheiro de cera e de incenso." },
        { label: "Nenhum lugar.", v: "Nenhum lugar. Casa é uma palavra que eu nunca usei." },
      ]);
      text = v;
    }
    if (id === "s3") {
      const v = await ask(sp, STATUE_Q.s3, [
        { label: "Uma vergonha.", v: "Uma vergonha que ainda queima quando eu lembro." },
        { label: "Um amor.", v: "Um amor que eu nunca disse em voz alta." },
        { label: "Um crime.", v: "Um crime que ninguém descobriu." },
        { label: "Um medo.", v: "Um medo que eu carrego desde criança." },
        { label: "Uma promessa quebrada.", v: "Uma promessa que eu quebrei." },
      ]);
      text = v;
    }
    o.lit = true; E.refresh(o);
    o.glow = { r: 38, c: [160, 200, 255], a: 0.4, h: 40 };
    G.fx.spawn(FX.bloom, { x: o.x, y: o.y - 30, palette: PAL.arcane });
    sfx.bells?.();
    const door = E.obj("door");
    door.lit = litCount(); E.refresh(door);
    remember("origin_" + id, text, true);
    UI.updateQuest();
    await say(sp, "(A Lume da estátua se acende. Por um instante, você sente o cheiro daquela lembrança.)");
    if (litCount() === 3) await openDoor();
  });
}
let statuePort = null;
const statuePortrait = () => (statuePort ??= portrait(buildCharacter({ ...SPECS.statue, skin: SPECS.figure.skin, tunic: SPECS.figure.tunic, hair: SPECS.figure.hair })));

async function openDoor() {
  F.door_open = true;
  look(11, 10, 2);
  await E.sleep(400);
  G.shake = 1.2;
  sfx.chest();
  const d = E.obj("door");
  await tween(1.4, (k) => { d.clip = k; });
  d.hidden = true;
  for (let x = 10; x <= 12; x++) G.W.setBlock(x, 9, false);
  UI.toast("A porta se abre.", 2500);
  reward(100, "As três Lumes acesas");
}

async function heartScene() {
  F.heart_seen = true;
  const g = cast.ghost;
  g.hidden = false;
  tween(2.5, (k) => { g.alpha = k * 0.6; });
  await scene(async () => {
    look(11, 3, 2);
    await say(null, "Uma câmara branca e alta. No centro, num pedestal, uma lanterna de prata em forma de folha. Acima dela, uma mulher de cabelos de prata flutua como um reflexo na água. Ela sorri para você.");
  });
}

async function archivistScene() {
  F.arq_talk = true;
  const g = cast.ghost, ARQ = { name: "A Arquivista", portrait: g.portrait };
  await scene(async () => {
    look(11, 4, 2);
    E.face(lead(), g);
    const tree = {
      start: { who: ARQ, text: "Você me ouviu. Atravessou um vale inteiro por um sonho. Ninguém faz isso há mil anos. Eu sou a última que lembra de Velmoor. E você... você é o primeiro que vai lembrar de mim.", options: [{ label: "Continuar", to: "hub" }] },
      hub: { who: ARQ, text: "(Ela espera, paciente. A luz da lanterna pulsa devagar, como um coração.)", options: [
        { label: "Quem é você?", once: true, to: "who" },
        { label: "A carta dizia para não escutar você.", once: true, to: "letter" },
        { label: "Você está mentindo sobre alguma coisa.", once: true, check: { skill: "Intuição", dc: 15 }, pass: () => { F.eco_suspicious = true; }, passTo: "lie", failTo: "nolie" },
        { label: "O que você quer de mim?", once: true, to: "want" },
        { if: () => mateIs("lyra"), label: "Lyra?", once: true, do: () => { F.lyra_trembled = true; }, to: "lyra" },
        { label: "Estender a mão para a Lume.", to: "end" },
      ] },
      who: { who: ARQ, text: "Uma arquivista. Eu guardava lembranças. Agora sou uma.", options: [{ label: "Continuar", to: "hub" }] },
      letter: { who: ARQ, text: "Claro que dizia. Quem a escreveu tem medo do que eu sei.", options: [{ label: "Continuar", to: "hub" }] },
      lie: { who: ARQ, text: "(Ela sorri.) Todo mundo que lembra mente um pouco. Lembrar é escolher.", options: [{ label: "Continuar", to: "hub" }] },
      nolie: { who: ARQ, text: "Mentindo? Eu mal existo. Não sobra espaço em mim para mentira.", options: [{ label: "Continuar", to: "hub" }] },
      want: { who: ARQ, text: "Que você me leve daqui. Que você lembre de mim. É pouco, não é?", options: [{ label: "Continuar", to: "hub" }] },
      lyra: { narr: true, text: "Lyra está pálida. Não diz nada. Você nota que as mãos dela tremem.", options: [{ label: "Continuar", to: "hub" }] },
    };
    await talk(ARQ, tree);
    await cendraScene();
  });
}

// ---------------------------------------------------------------- Sister Cendra
const RELIC_POS = { hero: [10, 4], mate: [12, 4], tome: [14, 4], cendra: [11, 8], silas: [9, 8], e1: [7, 7], e2: [15, 7] };
let relicGroup = null;
function makeRelicFoes() {
  const mk = (spec, def) => E.unit(spec, { team: "enemy", group: "relic", ...def });
  const cendra = mk("cendra", { key: "cendra", name: "Irmã Cendra", tx: 11, ty: 11, maxHp: 24, ac: 13, atk: 5, dmg: "1d6+2", move: 6, dex: 2, xpValue: 200, boss: true, yields: true,
    ranged: { range: 7, dmg: "1d8+2", name: "Toque do Esquecimento", pal: PAL.arcane, forget: true } });
  const silas = mk("silas", { key: "silas", name: "Irmão Silas", tx: 10, ty: 11, maxHp: 14, ac: 13, atk: 4, dmg: "1d6+2", move: 6, dex: 2, xpValue: 100 });
  const e1 = mk("esvaido", { esvaido: true, name: "Esvaído", tx: 12, ty: 11, maxHp: 18, ac: 10, atk: 3, dmg: "1d8+1", move: 3, dex: -1, xpValue: 100 });
  const e2 = mk("esvaidoFisher", { esvaido: true, key: "fisher", name: "Esvaído pescador", tx: 11, ty: 12, maxHp: 18, ac: 10, atk: 3, dmg: "1d8+1", move: 3, dex: -1, xpValue: 100 });
  Object.assign(cast, { cendra, silas, e1, fisher: e2 });
  return [cendra, silas, e1, e2];
}

async function cendraScene() {
  const W = G.W;
  const [cendra, silas, e1, e2] = makeRelicFoes();
  W.enemies.push(cendra, silas, e1, e2);
  await say(null, "Passos na escada.");
  look(11, 6, 2);
  const tm = cast.tome;
  await Promise.all([
    E.walk(G.hero, ...RELIC_POS.hero), E.walk(G.mate, ...RELIC_POS.mate), F.tome_with ? E.walk(tm, ...RELIC_POS.tome) : null,
    E.walk(cendra, ...RELIC_POS.cendra, 60), E.walk(silas, ...RELIC_POS.silas, 60), E.walk(e1, ...RELIC_POS.e1, 50), E.walk(e2, ...RELIC_POS.e2, 50),
  ]);
  for (const u of [G.hero, G.mate, tm]) E.face(u, cendra);
  for (const u of [cendra, silas, e1, e2]) E.face(u, G.hero);
  await lines([
    [cendra, "Afaste-se da Lume, criança. Você não sabe o que está segurando. Nós sabemos. A Madre esperou doze anos por esse dia."],
    [silas, "(baixinho) Cendra, eles são só viajantes..."],
    [cendra, "Todo mundo é só viajante, Silas. É por isso que vamos ajudá-los a descansar."],
    [null, "Os dois vultos atrás dela andam como quem já esqueceu por quê. Olhos brancos. Um deles usa roupas de pescador."],
    ...(F.tome_with ? [[cendra, "E trouxeram uma criança. Que gentileza. Ela descansa primeiro."]] : []),
  ]);
  let v;
  do {
    v = await ask(cendra, "(Ela espera, com as mãos abertas, como quem oferece um abraço.)", [
      { if: () => !F.silas_try, label: "Silas. Você não quer fazer isso.", check: { skill: "Persuasão", dc: 15 }, pass: "silas", fail: "silasno", onPass: () => {} },
      { label: "Tudo bem. A Lume é sua. Venha pegar.", check: { skill: "Enganação", dc: 13 }, pass: "deceive", fail: "deceiveno" },
      { label: "Mais um passo e quem descansa são vocês.", check: { skill: "Intimidação", dc: 14 }, pass: "scare", fail: "scareno" },
      { label: "Entregar a Lume.", v: "give" },
      { label: "Então venham.", tag: "Combate", v: "fight" },
    ]);
    if (v === "silas" || v === "silasno") {
      F.silas_try = true;
      if (v === "silas") {
        F.silas_doubt = true;
        await lines([[silas, "(Silas olha para a criança, para os Esvaídos, para você.) ...Que a Madre me perdoe."], [cendra, "Silas!"]]);
        W.enemies.splice(W.enemies.indexOf(silas), 1);
        silas.team = "npc";
        W.npcs.push(silas);
        E.walk(silas, 11, 16, 90).then(() => { G.fx.spawn(FX.poof, { x: silas.x, y: silas.y }); silas.gone = true; });
      } else await say(silas, "(Silas baixa os olhos e não se mexe.)");
    }
  } while (v === "silas" || v === "silasno");
  const foes = [cendra, ...(F.silas_doubt ? [] : [silas]), e1, e2];
  relicGroup = foes;
  W.groups.relic = foes;
  if (v === "deceive") { await say(null, "Cendra dá um passo à frente, as mãos estendidas. Perto demais."); for (const e of foes) { e.skip = 1; e.skipNote = "Surpreso!"; } }
  if (v === "deceiveno") await say(cendra, "Mentira tem cheiro, criança.");
  if (v === "scare") { await say(cendra, "(Cendra ri.) Que coragem. ...Mas um dos Esvaídos dá um passo para trás."); e1.skip = 1; e1.skipNote = "Hesita"; }
  if (v === "scareno") await say(cendra, "(Cendra ri, e o riso ecoa na câmara branca.)");
  if (v === "give") {
    F.lume_given = true;
    const ped = E.obj("pedestal");
    ped.empty = true; E.refresh(ped); ped.glow = null;
    G.hero.glow = { r: 30, c: [160, 200, 255], a: 0.35, h: 18 };
    await lines([
      [null, "Você pega a Lume do pedestal e a estende. Cendra a toma com as duas mãos."],
      [cendra, "Finalmente. A Madre vai..."],
      [null, "A Lume queima. Cendra grita e a solta; a lanterna salta pelo ar, direto para a sua mão, como se tivesse sido chamada."],
      [cendra, `(soprando os dedos) ...Ela escolheu você. Tanto faz. ${gword(G.hero.gender, "Quero a portadora inteira", "Quero o portador inteiro", "Quero quem carrega a Lume inteiro")}. Os outros podem descansar.`],
    ]);
    cendra.spare = e1.spare = e2.spare = silas.spare = "player";
  }
  F.cendra_choice = v;
  E.fight(foes);
}

async function turnStart(u, C) {
  if (u.team === "party" && !u.ai) { hint("turn"); hint("actions"); if (u.abilities.some((k) => ["missiles", "heal", "healword", "mark"].includes(k))) hint("spells"); }
  if (C.group !== relicGroup) return;
  if (C.round >= 3 && F.goblin_pact && !C.alliesIn) { C.alliesIn = true; await alliesArrive(C); }
  if (!F.echo && (C.round >= 4 || C.someoneDown)) await echoMoment();
}

async function alliesArrive(C) {
  const gorza = E.unit("chief", { key: "gorzaAlly", name: "Gorza", team: "party", ai: true, tx: 10, ty: 9, maxHp: 24, ac: 15, atk: 5, dmg: "1d10+3", move: 5, dex: 0, cls: "Chefe goblin · aliado", hpPerLevel: 0 });
  const murta = E.unit("murta", { key: "murtaAlly", name: "Murta", team: "party", ai: true, tx: 12, ty: 9, maxHp: 12, ac: 13, atk: 4, dmg: "1d6+2", move: 6, dex: 3, small: true, cls: "Arqueira goblin · aliada", hpPerLevel: 0,
    ranged: { range: 8, dmg: "1d6+2", name: "Flecha", pal: PAL.wood } });
  for (const a of [gorza, murta]) { G.fx.spawn(FX.poof, { x: a.x, y: a.y }); a.dir = 3; }
  G.party.push(gorza, murta);
  C.order.splice(C.idx + 1, 0, gorza, murta);
  E.partyChanged();
  UI.banner("O clã Dente-de-Musgo");
  await lines([[gorza, "Goblin paga o que deve! Murta, atira!"], [murta, "Murta atira bem."]]);
}

async function echoMoment() {
  F.echo = "pending";
  const g = cast.ghost, ARQ = { name: "A Arquivista", portrait: g.portrait };
  G.tint = "rgba(190,205,255,0.28)";
  sfx.bells?.();
  const prevFocus = G.camFocus;
  G.camFocus = { x: G.hero.x, y: G.hero.y - 10, speed: 3 };
  await say(null, "O tempo para. A poeira fica suspensa no ar. As chamas das magias congelam no meio do caminho. Só a voz dela se mexe.");
  const v = await ask(ARQ, "Eu posso ajudar. Só me deixe entrar. Não vai doer. Eu só preciso de um pouco de espaço.", [
    { label: "Aceitar.", v: "accepted" },
    { label: "Recusar.", v: "refused" },
  ]);
  const ped = E.obj("pedestal");
  ped.empty = true; E.refresh(ped); ped.glow = null;
  g.hidden = true;
  G.fx.spawn(FX.bloom, { x: G.hero.x, y: G.hero.y + 2, palette: PAL.arcane });
  G.hero.glow = { r: 30, c: [160, 200, 255], a: 0.35, h: 18 };
  if (v === "accepted") {
    await lines([[null, "A Lume se desfaz em luz e entra pela sua palma. Nervuras de prata sobem pelo seu braço, frias como água de poço."], [ARQ, "O primeiro é um presente. Os outros, uma troca justa."]]);
    if (!G.hero.abilities.includes("lampejo")) G.hero.abilities.push("lampejo");
    hint("lampejo");
  } else {
    await lines([[null, "Você fecha a mão. Não adianta. A luz entra por entre os seus dedos fechados, gentil e irresistível. Nervuras de prata sobem pelo seu braço."], [ARQ, "Desculpe. Eu estava com tanto frio."]]);
  }
  F.echo = v;
  G.tint = null;
  G.camFocus = prevFocus;
  UI.toast("O Eco agora mora na sua mão.", 3000);
  if (G.combat?.active?.team === "party" && !G.combat.active.ai) refreshCombatHotbar();
}

export function onRetry() {
  const R = E.map("relicario");
  if (!F.echo && G.W === R) {
    const ped = E.obj("pedestal", R);
    if (!F.lume_given) { ped.empty = false; E.refresh(ped); ped.glow = { r: 44, c: [160, 200, 255], a: 0.4, h: 40 }; G.hero.glow = null; }
    cast.ghost.hidden = false;
  }
  G.tint = null;
}

export function onCombatEnd(group) {
  const W = G.W;
  if (group === W.groups.patrol) {
    G.groups.patrol.passive = true;
    setTimeout(() => scene(() => say(null, "O último goblin, caído, ainda agarra a rede: \"Não... a fumaça... precisa...\"")), 900);
  }
  if (group === W.groups.ruins) {
    F.clan = "fight"; F.smoke_out = true;
    if (cast.avo.hp <= 0) F.avo_dead = true;
    const trophies = [...(cast.gorza.hp <= 0 ? [gearItem("weapon", "machadoGorza")] : []), ...(F.avo_dead ? [gearItem("weapon", "cajadoOsso")] : [])];
    trophies.forEach(giveItem);
    if (trophies.length) setTimeout(() => UI.toast(`Na bolsa: ${trophies.map((t) => t.name).join(", ")}`, 3200), 4200);
    clanLeaves(false);
    setTimeout(() => UI.banner("Ruínas libertadas"), 1500);
    later(40, () => { if (G.W.id === "vale") { fireOut(); UI.toast("A fogueira verde se apagou. A névoa branca começa a escorrer pelos muros.", 4500); } else fireOut(); });
    setTimeout(() => scene(async () => {
      await say(null, "As crianças e os velhos do clã fogem pela brecha oeste, direto para a névoa. Uma goblin pequena, de arco nas costas, para na brecha e olha para trás. Para você.");
      if (F.avo_dead) await say(null, "Ela vê a velha de capuz vermelho caída perto do fogo. Não grita. Só decora o seu rosto, e some.");
    }), 2600);
  }
  if (group === relicGroup) { relicGroup.passive = true; relicAftermath(); }
}

async function relicAftermath() {
  const W = G.W;
  const allies = G.party.filter((p) => p.ai);
  await E.sleep(900);
  await scene(async () => {
    if (allies.length) {
      await say(allies[0], "Vai! O branco vem! Goblin segura lá em cima!");
      G.party = G.party.filter((p) => !p.ai);
      for (const a of allies) { a.team = "npc"; W.npcs.push(a); E.walk(a, 11, 16, 110).then(() => { a.gone = true; }); }
      E.partyChanged();
    }
    // Cendra doesn't die: she steps back into the Bruma coming down the stairs
    const c = cast.cendra;
    c.gone = false; c.hp = 1; c.team = "npc"; c.alpha = 1;
    E.place(c, 11, 10, 3);
    if (!W.npcs.includes(c)) W.npcs.push(c);
    W.enemies.splice(W.enemies.indexOf(c), 1);
    look(11, 9, 2);
    F.relic_collapse = true;
    G.shake = 0.6;
    await say(c, "(Ela sorri, com a mão queimada contra o peito.) A Madre vai te encontrar. Todos encontram o descanso.");
    E.walk(c, 11, 16, 50);
    await tween(2.2, (k) => { c.alpha = 1 - k; });
    c.gone = true;
    // the fallen Forgotten get up, and go back to the last thing they remembered doing
    for (const e of [cast.e1, cast.fisher]) {
      if (!e) continue;
      e.gone = false; e.hp = 1; e.team = "npc"; e.passive = true; e.gesture = true;
      if (!W.npcs.includes(e)) W.npcs.push(e);
      W.enemies.splice(W.enemies.indexOf(e), 1);
    }
    cast.fisher.talk = otavioTree;
    cast.fisher.label = "Esvaído pescador";
    cast.e1.label = "Esvaído";
    cast.e1.talk = () => ({ start: { narr: true, text: "(O Esvaído embala nos braços alguma coisa que não está ali, devagar, para lá e para cá.)", options: [{ label: "...", to: "end" }] } });
    await say(null, "Os Esvaídos caídos se levantam devagar, sem raiva nenhuma, e voltam ao último gesto que lembravam. Um deles embala um filho que não está lá. O outro, com roupas de pescador, estende as mãos como quem joga uma rede.");
    // the milestone: everyone leaves the Relicário at level 2 at least
    for (const p of G.party) if (p.level < 2) G.hooks.gainXp(p, p.nextXp - p.xp);
    await say(null, `O chão treme. As paredes brancas começam a se desfazer de baixo para cima, como papel molhado, exatamente como no sonho. Uma névoa perolada escorre pela escada.`);
    const ARQ = { name: "A Arquivista", portrait: cast.ghost.portrait };
    await say(ARQ, "(só você ouve) Corra. Este lugar só existia porque eu estava nele.");
    UI.updateQuest();
  });
}

function otavioTree() {
  const canTell = F.chair_seen || F.returned_heirloom;
  return {
    start: { narr: true, text: "O pescador esvaído joga uma rede que não existe, de novo e de novo. Na cintura dele há uma faca, com o cabo entalhado.", options: [
      ...(F.otavio_found ? [] : canTell ? [F.names_tree
        ? { label: "Comparar o entalhe da faca com o da cadeira e o da árvore.", tag: "M + O", do: otavioFound, to: "found" }
        : { label: "Comparar o entalhe da faca com o da cadeira.", check: { skill: "Investigação", dc: 12 }, pass: otavioFound, passTo: "found", failTo: "nofound" }] : []),
      { label: "Deixá-lo.", to: "end" },
    ] },
    found: { narr: true, text: "É a mesma marca. O mesmo talho em forma de anzol que estava na cadeira de balanço: \"Para a Maren, do teu Otávio\". Este homem é Otávio. O lago devolveu o barco. A Ordem ficou com ele.", options: [{ label: "Continuar", to: "mate" }] },
    mate: { who: G.mate, text: mateIs("kael") ? "A Ordem leva gente. Eu ouvi isso em Maralto e achei que era conversa de taverna." : "(Lyra fecha os olhos.) Ele ainda lembra de pescar. Só disso.", options: [{ label: "...", to: "end" }] },
    nofound: { narr: true, text: "O chão treme demais. Você não consegue ver o entalhe direito.", options: [{ label: "...", to: "end" }] },
  };
}
function otavioFound() {
  F.otavio_found = true;
  setTimeout(() => { remember("otavio", "Otávio, o marido de Maren, jogando uma rede que não existe."); reward(50, "Otávio"); }, 300);
}

async function stairsUse() {
  if (F.relic_collapse) return escapeStart();
  const v = await ask(null, "A escada sobe de volta para as ruínas.", [{ label: "Voltar ao vale.", v: "up" }, { label: "Ficar.", v: "no" }]);
  if (v !== "up") return;
  await scene(async () => {
    await UI.fade(1, 600);
    E.loadMap("vale", 24, 12, 0);
    await UI.fade(0, 700);
  });
}

// ---------------------------------------------------------------- 6.7 the Bruma rises
const ROUTE = [[24, 12], [21, 13], [22, 18], [20, 24], [25, 25.5], [30, 26.5], [34, 27], [38, 26.5], [40, 27]].map(([x, y]) => [x * TILE + 16, y * TILE + 16]);
const ORIGIN = [24 * TILE + 16, 11 * TILE + 16];
const esc = { R: -48, hold: 0, fires: [], stop: false };

async function escapeStart() {
  await scene(async () => {
    await UI.fade(1, 700, "#fff");
    G.followers.forEach((u) => (u.hidden = false));
    E.loadMap("vale", 24, 12, 0);
    F.escape = true;
    G.speedCap = 70;
    G.musicOverride = "combat";
    esc.R = -48; esc.hold = 0; esc.fires = [];
    // the patrol and anyone still out on the trail is gone
    for (const e of G.groups.patrol) if (!e.gone) e.gone = true;
    if (F.goblin_pact) {
      for (const [x, y] of [[21, 14], [21, 19], [22, 25], [30, 26]]) {
        const o = { kind: "campfire", x: x * TILE + 16, y: y * TILE + 26, goblin: true };
        o.art = E.propArt(o);
        G.W.objects.push(o);
        o.fxe = G.fx.spawn(FX.campfire, { x: o.x, y: o.y + 2, light: 0.55, seed: 3 }, { keep: true });
        esc.fires.push({ o, d: dist(o.x, o.y, ...ORIGIN), used: false });
      }
      const g = cast.gorza;
      if (g.hp > 0) { g.gone = false; g.team = "npc"; g.passive = true; E.place(g, 20, 19, 2); }
    } else if (!F.smoke_out) {
      // the clan alive but not allied: Gorza burns everything they have, and they go
      fireFlare(); setTimeout(fireFlare, 300); setTimeout(fireFlare, 700);
      clanLeaves(true);
    }
    // Maren's fate is already decided by what she has left to remember
    const m = cast.maren;
    F.maren_lucid = !!(F.goblin_pact || F.returned_heirloom || !F.smoke_out);
    if (F.maren_lucid) E.place(m, 39, 28, 2); else { F.maren_forgot = true; E.place(m, 40, 27, 2); }
    if (F.tome_home) E.place(cast.tome, 38, 28, 2);
    UI.updateQuest();
    await UI.fade(0, 700);
    later(1.6, () => UI.banner("A Bruma sobe"));
    hint("escape");
  });
  if (F.smoke_out && F.clan !== "infiltrated") {
    later(3, () => UI.floater(14 * TILE, 5 * TILE, "gritos na névoa", "info"));
    later(5.5, () => UI.floater(14 * TILE, 5 * TILE, "...silêncio", "info"));
  }
}

function updateEscape(dt) {
  if (!F.escape || F.escape_done || G.W.id !== "vale") return;
  const speed = F.goblin_pact ? 34 : F.smoke_out ? 44 : 40;
  if (esc.hold > 0) esc.hold -= dt;
  else if (!esc.stop) esc.R += speed * dt;
  for (const f of esc.fires) if (!f.used && esc.R >= f.d - 24) {
    f.used = true; esc.hold = 3;
    if (f === esc.fires[1]) UI.floater(f.o.x, f.o.y - 50, "Vai! Goblin segura!", "crit");
    later(3, () => { f.o.out = true; f.o.fxe.keep = false; f.o.fxe.fx.stop(); });
  }
  if (G.mode !== "explore") return;
  const l = lead();
  // caught: the screen goes white and you find yourself a little further on
  if (dist(l.x, l.y, ...ORIGIN) < esc.R - 4) {
    let bi = 0, bd = 1e9;
    ROUTE.forEach(([x, y], i) => { const d = dist(x, y, l.x, l.y); if (d < bd) { bd = d; bi = i; } });
    const [ax, ay] = ROUTE[Math.min(ROUTE.length - 1, bi + 1)];
    const k = Math.min(1, (3 * TILE) / Math.max(1, dist(l.x, l.y, ax, ay)));
    const nx = l.x + (ax - l.x) * k, ny = l.y + (ay - l.y) * k;
    scene(async () => {
      await UI.fade(0.92, 160, "#fff");
      [...G.party, ...G.followers].forEach((u, i) => { u.x = nx - i * 10; u.y = ny + (i % 2) * 6; u.path = []; });
      E.resetTrail();
      esc.R = Math.min(esc.R, dist(nx, ny, ...ORIGIN) - 2 * TILE);
      await UI.fade(0, 600);
    });
    UI.toast("A Bruma quase alcançou vocês.", 1800);
  }
  if (Math.floor(l.x / TILE) >= 36 && Math.floor((l.y - 1) / TILE) >= 25 && Math.floor((l.y - 1) / TILE) <= 28) dockScene();
}

async function dockScene() {
  if (F.dock) return;
  F.dock = true;
  esc.stop = true;
  const m = cast.maren, t = cast.tome;
  await scene(async () => {
    look(39, 27, 2);
    if (F.maren_lucid) {
      F.maren_aboard = true;
      await say(m, "Quarenta anos neste lago. E eu lembro de cada um. Vamos.");
      if (F.tome_with) await say(t, "Vó!");
    } else {
      await say(null, "Maren está de pé na ponta do cais, sorrindo, com a névoa nos tornozelos.");
      await say(m, "Ah! Viajantes de verdade, graças à Senhora das Marés.");
      if (F.tome_with || F.tome_home) { await say(t, "Vó! Vó, sou eu! O Tomé!"); await say(m, "(gentil) Você está perdido, menino?"); }
      const v = await ask(null, "Ela não sabe quem vocês são. A névoa sobe pelas tábuas do cais.", [
        { label: "Puxá-la para o barco.", check: { skill: "Atletismo", dc: 12 }, pass: "ok", fail: "bad" },
        { label: "Deixá-la.", v: "leave" },
      ]);
      if (v === "ok") { F.maren_aboard = true; await say(null, "Você a pega pelo braço e a leva para o barco. Ela vem sem resistir, sem entender, agradecendo a gentileza."); }
      else if (v === "bad") await say(null, "Ela se solta, gentil, e volta para a ponta do cais, olhando o lago como quem espera um barco.");
      else await say(null, "Vocês a deixam no cais. Ela acena.");
    }
    F.escape_done = true;
    if (F.tome_with || F.tome_home) F.tome_alive = true;
  });
  await boatEnding();
}

// ---------------------------------------------------------------- 6.8 the Mirror Lake, the end
const boatRide = { on: false, people: [] };
async function boatEnding() {
  G.mode = "cutscene";
  await UI.fade(1, 1200);
  const boat = E.obj("boat");
  const m = cast.maren, t = cast.tome;
  boatRide.people = [G.mate, G.hero, ...(F.tome_alive ? [t] : []), ...(F.maren_aboard ? [m] : [])];
  for (const u of boatRide.people) u.hidden = true;
  if (!F.maren_aboard) E.place(m, 40, 27, 2);
  boatRide.on = true;
  G.speedCap = null;
  G.musicOverride = "dream";
  G.tint = "rgba(255,120,50,0.2)"; // the sun going down over the lake
  boat.noReflect = true; // its reflection, with one passenger too many, is drawn by drawOver
  G.camFocus = { x: boat.x, y: boat.y, speed: 2 };
  esc.stop = false; esc.ending = true;
  // across the lake to the mouth of the Cardo, then down the river, east, toward Vau-de-Cardo
  const way = [[boat.x, boat.y], [48 * TILE, 29 * TILE + 8], [53 * TILE, 28 * TILE + 20], ...RIVER.map(([x, y]) => [x, y + 8])];
  const lens = way.slice(1).map((p, i) => dist(...way[i], ...p)), total = lens.reduce((a, b) => a + b, 0);
  tween(52, (k) => {
    let d = total * (k * k * (3 - 2 * k) * 0.5 + k * 0.5), i = 0;
    while (i < lens.length - 1 && d > lens[i]) d -= lens[i++];
    const f = Math.min(1, d / lens[i]), [ax, ay] = way[i], [bx, by] = way[i + 1];
    boat.x = ax + (bx - ax) * f; boat.y = ay + (by - ay) * f + Math.sin(k * 40) * 1.5;
  });
  await UI.fade(0, 1500);
  await E.sleep(2200);
  await say(null, "O barco desliza pelo lago. Atrás, o vale de Brumafolha some na névoa: primeiro as ruínas...");
  G.camFocus = { x: 21 * TILE, y: 9 * TILE, speed: 1.2 };
  await E.sleep(3200);
  await say(null, "...depois o bosque...");
  G.camFocus = { x: 21 * TILE, y: 22 * TILE, speed: 1.2 };
  await E.sleep(3200);
  await say(null, "...depois o acampamento onde você acordou. A fogueira é a última coisa que se apaga.");
  G.camFocus = { x: CAMP.x, y: CAMP.y, speed: 1.2 };
  await E.sleep(2600);
  const fire = G.W.objects.find((o) => o.kind === "campfire" && !o.goblin);
  fire.out = true; if (fire.fxe) { fire.fxe.keep = false; fire.fxe.fx.stop(); }
  G.fx.spawn(FX.poof, { x: fire.x, y: fire.y });
  F.fireGone = true;
  await E.sleep(1800);
  G.camFocus = boat;
  await E.sleep(2200);
  await say(null, "O lago se estreita e vira rio. A correnteza do Cardo pega o barco e o leva para o leste, para longe da névoa, rumo a Vau-de-Cardo.");
  await E.sleep(1200);
  boatRide.reflection = true;
  await say(null, "Na água, o reflexo mostra a cidade branca. Desta vez, a mulher de prata está no barco, sentada atrás de você. Só no reflexo.");
  if (mateIs("kael")) await lines([[G.mate, "(olhando a sua mão) Eu vi muita coisa que pede memória em troca de ajuda. Nunca vi uma que devolvesse."], [G.mate, "(pausa) Se essa coisa começar a tirar você de você, me avisa. Eu sei como é ficar vazio. Não deixo acontecer com mais ninguém."]]);
  else await lines([[G.mate, "(evitando os seus olhos) Vau-de-Cardo fica a três dias rio abaixo. Lá tem bibliotecas. Alguém vai saber o que é isso."], [G.mate, "(bem baixo, para si mesma) ...Alguém além de mim."]]);
  if (F.maren_aboard && F.maren_lucid) await say(m, F.otavio_found ? "(Maren olha para trás, para a névoa.) ...Vocês viram alguma coisa lá embaixo. Eu sei. Um dia vocês me contam." : "(Maren põe um saquinho de moedas na sua mão.) Cinquenta peças. Não discutam com uma velha num barco.");
  if (F.maren_aboard && F.maren_lucid) G.gold += 50;
  // the Diário opens by itself
  remember("sunset", "O pôr do sol no Lago Espelhado.");
  const origins = G.memories.filter((x) => x.origin);
  const flick = origins[Math.floor(Math.random() * origins.length)];
  if (flick) flick.flicker = true;
  await say(null, "O Diário de Lembranças abre sozinho no seu colo.");
  await new Promise((res) => { afterJournal = res; openJournal("memories"); });
  if (flick) flick.flicker = false;
  await say({ name: "A Arquivista", portrait: cast.ghost.portrait }, "(só você ouve) Você tem tanta coisa para lembrar. Deixe que eu cuide do resto.");
  await UI.fade(1, 2500);
  G.musicOverride = null;
  UI.cine("<h1>Brumafolha</h1><h2>Ato I — A Marca de Cardo</h2>", "title");
  await E.sleep(5500);
  UI.cine("");
  endScreen();
}

function endScreen() {
  G.mode = "end";
  const clan = { pact: "fez um pacto com o vale. Gorza e Murta desceram ao Relicário por vocês.", truce: "viveu em trégua com vocês.", infiltrated: "nunca soube que vocês passaram por ele.", scared: "deixou o vale, levando a fumaça embora.", fight: "foi derrotado. Os que fugiram foram para a névoa." };
  const rows = [
    ["O clã Dente-de-Musgo", F.goblin_pact ? clan.pact : clan[F.clan] ?? "seguiu queimando as suas coisas velhas."],
    ["A Avó Fuligem", F.avo_dead ? "morreu perto do fogo. A neta dela decorou o seu rosto." : F.smoke_out ? "foi embora com o clã." : "ficou nas ruínas, alimentando a fogueira até o fim."],
    ["Maren", F.maren_aboard ? (F.maren_lucid ? "lembra de cada ano no lago, e está no barco." : "está no barco, sem saber quem é.") : "ficou no cais, esperando um barco que não vem."],
    ["Tomé", F.tome_alive ? "está vivo, no barco." : "..."],
    ["Otávio", F.otavio_found ? "foi encontrado entre os Esvaídos da Ordem." : "continua jogando a rede, em algum lugar sob a névoa."],
    ["Irmão Silas", F.silas_doubt ? "duvidou, e foi embora antes da luta." : "lutou ao lado de Cendra."],
    ["O Eco", F.echo === "accepted" ? "foi aceito. Você tem o Lampejo de Velmoor." : "entrou mesmo assim. Ela pediu desculpas."],
  ];
  const mems = G.memories.filter((m) => m.origin).map((m) => `<li>${m.text}</li>`).join("");
  const el = document.getElementById("endscreen");
  el.innerHTML = `<div class="box"><h1>Fim do Prólogo</h1><h2>A Bruma de Brumafolha</h2>
    <h3>O que o vale vai lembrar</h3><dl>${rows.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join("")}</dl>
    ${mems ? `<h3>Quem você é</h3><ul>${mems}</ul>` : ""}
    <p class="muted">Nível ${G.hero.level} · ${G.gold} peças de ouro</p>
    <button onclick="location.reload()">Jogar de novo</button></div>`;
  el.classList.remove("hidden");
  UI.fade(0, 1200);
}

// ---------------------------------------------------------------- what's clickable, per map
export function interactables() {
  const out = [];
  const W = G.W;
  const at = (tx, ty, name, act, extra = {}) => out.push({ x: tx * TILE + 16, y: ty * TILE + 26, name, r: 16, act, ...extra });
  if (!F.awake && W.id !== "sonho") return out;
  if (W.id === "vale") {
    const deer = E.obj("deer");
    if (!deer.hidden && !F.escape) out.push({ x: deer.x, y: deer.y, name: "Corça", r: 16, act: deerTalk });
    const loot = E.obj("loot");
    if (!loot.hidden && !F.escape) out.push({ x: loot.x, y: loot.y, name: "Pilha de coisas roubadas", r: 18, act: lootTalk });
    if (!F.escape) {
      at(45, 27, "Ponta do píer", pierLook, { reach: 40 });
      at(38, 17, "Árvore dos Nomes", nameTree, { h: 80 });
      const mk = E.obj("marker");
      out.push({ x: mk.x, y: mk.y, name: "Marco de pedra", r: 14, act: markerStone });
    }
    if (F.trapdoor_open && !F.escape) at(24, 11, "Alçapão (descer)", trapdoorUse, { h: 24 });
  }
  if (W.id === "relicario") {
    at(9, 28, "Inscrição", () => say(null, "Letras finas, gravadas na pedra branca: \"Tudo o que existe é lembrado por alguém. O que ninguém lembra, a Bruma leva.\""), { reach: 56 });
    at(11, 29, F.relic_collapse ? "Escada (fugir!)" : "Escada (voltar ao vale)", stairsUse, { h: 20 });
    at(5, 21, "Relevo com o seu rosto", () => say(null, "Um relevo com o seu rosto. Não parecido: o seu. Até a pequena marca que você tem perto do olho, que ninguém nunca nota."), { reach: 56 });
    at(17, 22, "Relevo com o rosto de um menino", () => say(null, F.tome_with || F.tome_met ? "O rosto de Tomé, sem tirar nem pôr. Sorrindo." : "O rosto de um menino de uns dez anos, sorrindo."), { reach: 56 });
    for (const [id, tx] of [["s1", 4], ["s2", 11], ["s3", 18]]) {
      const o = E.obj(id);
      out.push({ x: o.x, y: o.y, name: o.lit ? "Estátua (Lume acesa)" : "Estátua de uma arquivista", r: 16, h: 50, act: () => statueTalk(id), reach: 58 });
    }
    if (!F.door_open) at(11, 9, "Porta selada", () => say(null, `Uma porta de mármore sem maçaneta, com três encaixes redondos. ${litCount()} de 3 brilham.`), { h: 56, reach: 60 });
  }
  return out;
}

// ---------------------------------------------------------------- per-frame story logic
let deerT = 0;
export function update(dt) {
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i];
    tw.t += dt;
    const k = Math.min(1, tw.t / tw.sec);
    tw.fn(k);
    if (k >= 1) { tweens.splice(i, 1); tw.res(); }
  }
  for (let i = timers.length - 1; i >= 0; i--) if ((timers[i].t -= dt) <= 0) { const f = timers[i].fn; timers.splice(i, 1); f(); }
  const W = G.W, l = lead();
  if (!l) return;
  // a little life
  if (W.id === "vale") {
    const deer = E.obj("deer");
    if ((deerT += dt) > 0.9 && !deer.hidden) { deerT = 0; deer.frame = deer.frame ? 0 : 1; E.refresh(deer); }
    const m = cast.maren;
    if (G.mode === "explore" && !F.escape) m.dir = Math.floor(G.time / 4) % 3 === 0 ? 2 : 0;
  }
  if (W.id === "relicario" && F.relic_collapse) {
    F.relicFog = Math.min(13 * TILE, (F.relicFog ?? 0) + dt * 10);
    if (Math.random() < dt * 0.25) G.shake = 0.35;
  }
  if (esc.ending) esc.R += dt * 70; // during the ending the fog swallows the valley, faster
  updateEscape(dt);
  if (G.mode !== "explore") return;
  const [tx, ty] = tileNow(l);
  if (W.id === "sonho") {
    const turner = cast.turner;
    if (near(l, 9, 8, 2.6)) E.face(turner, l); else if (l.y < turner.y - 3 * TILE) turner.dir = 0; else turner.dir = 3;
    if (ty <= 5 && !F.dream_woman) dreamWoman();
  }
  if (W.id === "vale" && F.awake && !F.escape) {
    if (near(l, 13, 36, 3)) hint("rest");
    // the patrol
    if (!F.patrol && !F.patrol_met && !F.patrol_cd && near(l, 22, 21, 7.5)) patrolScene();
    if (F.patrol_cd && !near(l, 22, 21, 9.5)) F.patrol_cd = false;
    // the ruins
    if (ty <= 15 && tx >= 9 && tx <= 31) F.ruins_entered = true;
    if (!F.clan) {
      if (!F.breach_asked && tx >= 29 && tx <= 31 && ty >= 7 && ty <= 12) breachScene();
      else if (tx >= 13 && tx <= 27 && ty >= 4 && ty <= 13) gorzaScene(false);
    } else if (F.clan === "infiltrated" && !F.gorza_met && tx < 22 && ty <= 12 && ty >= 4) gorzaScene(true);
  }
  if (W.id === "relicario") {
    if (!F.atrium && ty >= 20 && ty <= 24) atriumScene();
    if (F.door_open && !F.heart_seen && ty <= 8) heartScene();
    if (F.heart_seen && !F.arq_talk && near(l, 11, 3, 2.6)) archivistScene();
  }
}

// ---------------------------------------------------------------- the Bruma, as a field the renderer samples
export const hasFog = () => !!G.W && (G.W.id !== "relicario" || !!F.relic_collapse);
export function fogAt(x, y) {
  const W = G.W, l = lead();
  if (W.id === "sonho") {
    let m = 0;
    for (const [dx, dy] of [[-14, -14], [14, -14], [-14, 14], [14, 14]]) if (W.tileAt(Math.floor((x + dx) / TILE), Math.floor((y + dy) / TILE)) === T.MIST) m += 0.25;
    const rear = l ? clamp((y - (l.y + 3.5 * TILE)) / (2.5 * TILE)) : 0;
    return Math.max(m * 0.95, rear, F.whiteK ?? 0);
  }
  if (W.id === "relicario") return clamp((y - (31 * TILE - (F.relicFog ?? 0))) / (3 * TILE)) * 0.9;
  // the valley: thick to the north, held off the ruins by the smoke, a low patch at the camp's edge
  let f = clamp((5.5 * TILE - y) / (4 * TILE)) * 0.85;
  const e = ((x - 20.5 * TILE) / (11 * TILE)) ** 2 + ((y - 8 * TILE) / (7 * TILE)) ** 2;
  const smoke = clamp((e - 0.8) / 0.4);
  f *= 1 - (1 - smoke) * (1 - (F.smokeK ?? 0));
  if (F.smokeK) f = Math.max(f, (1 - e) * 0.5 * F.smokeK);
  const fx = 13 * TILE + 16, fy = 36 * TILE + 16, dc = dist(x, y, fx, fy);
  const hole = (3 + 5 * (F.campFogK ?? 0)) * TILE;
  if (!F.escape) f = Math.max(f, 0.6 * clamp((dc - hole) / (2 * TILE)) * clamp(1.4 - dc / (10 * TILE)) * clamp((fy - y) / (3 * TILE)));
  if (F.escape) {
    const d = dist(x, y, ...ORIGIN);
    let b = clamp((esc.R - d) / (2.2 * TILE));
    if (esc.ending) {
      const boat = E.obj("boat");
      b *= clamp((dist(x, y, boat.x, boat.y) - 4 * TILE) / (4 * TILE)); // the water stays clear around the boat
      if (x > 58 * TILE) b *= 0.35; // and the river runs ahead of it
      if (!F.fireGone) b *= clamp((dc - 2 * TILE) / (3 * TILE));
    }
    f = Math.max(f, b);
    if (F.maren_forgot && !F.maren_aboard) { const m = cast.maren; f = Math.max(f, 0.55 * clamp(1 - dist(x, y, m.x, m.y) / (1.6 * TILE))); }
  }
  return f;
}
/** Under the actors: the escape route, glowing on the trail. */
export function drawGround(ctx, cx, cy) {
  if (!F.escape || F.escape_done || G.W.id !== "vale") return;
  const t = G.time;
  for (let i = 0; i < ROUTE.length - 1; i++) {
    const [ax, ay] = ROUTE[i], [bx, by] = ROUTE[i + 1], n = Math.ceil(dist(ax, ay, bx, by) / 24);
    for (let s = 0; s < n; s++) {
      const k = s / n, x = ax + (bx - ax) * k - cx, y = ay + (by - ay) * k - cy;
      const a = 0.45 + 0.4 * Math.sin(t * 5 - (i * n + s) * 0.6);
      ctx.fillStyle = `rgba(40,24,8,${a * 0.6})`;
      ctx.fillRect(Math.round(x) - 2, Math.round(y) - 1, 5, 4);
      ctx.fillStyle = `rgba(255,214,120,${a})`;
      ctx.fillRect(Math.round(x) - 1, Math.round(y) - 2, 3, 4);
      ctx.fillRect(Math.round(x) - 2, Math.round(y) - 1, 5, 2);
    }
  }
}

/** Over everything: the people in the boat, and the boat's reflection with one passenger too many. */
export function drawOver(ctx, cx, cy) {
  if (!boatRide.on || G.W.id !== "vale") return;
  const boat = E.obj("boat");
  const bx = Math.round(boat.x - cx), by = Math.round(boat.y - cy);
  const seat = (u, x, y, flip) => {
    const img = u.ch.frames[2][4];
    ctx.drawImage(img, 0, 0, SW, 24, x - 13, flip ? y : y - 24, SW, 24);
  };
  const spots = [-20, -6, 8, 20];
  boatRide.people.forEach((u, i) => seat(u, bx + spots[i], by - 6));
  if (boatRide.reflection) {
    ctx.save();
    ctx.globalAlpha = 0.28 + Math.sin(G.time * 2) * 0.04;
    ctx.translate(0, by * 2 + 6);
    ctx.scale(1, -1);
    ctx.drawImage(boat.art.c, bx - boat.art.ox, by - boat.art.oy);
    boatRide.people.forEach((u, i) => seat(u, bx + spots[i], by - 6));
    seat(cast.ghost, bx - 13, by - 9);
    ctx.restore();
  }
}
