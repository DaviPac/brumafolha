// Act I, chapter one: "A Marca de Cardo" (docs/historia.md §7). The boat reaches Vau-de-Cardo by night; "L." is
// not at the Sabiá Cego; the Crown has a price on a silver-marked hand; the Echo makes its first offer; and the
// trail leads east, over the ford, to L.'s courier. What happened in the valley (§6.10) decides who is here,
// who helps at the ford and who is waiting there with an arrow.
// It runs on the same engine and tools as the prologue: story.js hands them over in init().
import { G, lead, living } from "./state.js";
import { TILE, dist, clamp, ramp } from "./util.js";
import { SPECS } from "./art/chars.js";
import * as UI from "./ui.js";
import { sfx } from "./audio.js";
import { FX, PAL } from "./fx.js";
import { gword } from "./rules.js";
import { gearItem } from "./items.js";
import { VAU, TRAV } from "./maps1.js";
import { focusDefault } from "./input.js";
import { nameFn } from "./save/codec.js";
import * as CH2 from "./act1ch2.js";

let K, E, F, cast, soon, ask, lines, say, scene, look, reward, giveItem, hasItem, takeItem, remember, approve, tween, later, mateIs, hint;
export function init(kit) {
  K = kit;
  ({ E, F, cast, soon, ask, lines, say, scene, look, reward, giveItem, hasItem, takeItem, remember, approve, tween, later, mateIs, hint } = kit);
  CH2.init(kit);
}
/** Chapter two answers for its own maps (act1ch2.js). */
const inCh2 = () => CH2.MAPS.has(G.W?.id);
const GESTURE = nameFn("act1:gesture", () => ({ start: { narr: true, text: "(Olhos brancos. As mãos repetem um gesto que já foi um ofício.)", options: [{ label: "...", to: "end" }] } }));
const near = (u, tx, ty, r) => dist(u.x, u.y, tx * TILE + 16, ty * TILE + 26) < r * TILE;
const tileNow = (u) => [Math.floor(u.x / TILE), Math.floor((u.y - 1) / TILE)];
const night = () => G.clock >= 19.5 || G.clock < 6;
const hero = () => G.hero.name;
const ARQ = () => ({ name: "A Arquivista", portrait: cast.ghost.portrait });

const ITEMS = {
  note: { id: "note", name: "Recado de L.", icon: "feather", desc: "Um bilhete dobrado em quatro, preso com uma pena cinzenta.",
    read: "<p><i>Se você lê isto, eu não pude esperar.</i></p><p>A Coroa pôs preço na marca. Não mostre a mão a ninguém, nem a quem sorri. Minha mensageira aguarda do outro lado do vau, na Travessia do Cardo, até a lua nova.</p><p>O que você carrega escuta. Não conte a ele o que eu contei a você.</p><p class='sig'>— L.</p>" },
  gloves: { id: "gloves", name: "Luvas de couro", icon: "hand", desc: "Um par de luvas de viagem. Cobre a mão, e o que há nela." },
  smoke: { id: "smoke", name: "Fumaça de lembrança", icon: "smoke", desc: "Um maço de ervas amarrado com um pano de bebê. Queimado, lembra aos Esvaídos, por um instante, que foram alguém. O grupo fica imune à condição Esquecido na próxima luta." },
  lume: { id: "lume", name: "Lume apagada", icon: "lume", desc: "Um cristal de Velmoor do tamanho de uma noz, turvo por dentro. Alguém guardou uma lembrança aqui. Ainda está morna." },
  poster: { id: "poster", name: "Cartaz da Coroa", icon: "poster", desc: "Arrancado do quadro de avisos.",
    read: "<p><b>POR ORDEM DO MESTRE-COLETOR</b></p><p>Procura-se, com vida, portador de marca prateada na palma da mão, em forma de nervuras de folha. Viaja de barco, vindo do norte.</p><p>Duzentas peças a quem o entregar à guarnição. Quem o esconder paga o Tributo em dobro.</p><p class='sig'>V. Moss</p>" },
  seal: { id: "seal", name: "Sinete dos Lembradores", icon: "seal", desc: "Cera cinzenta com uma pena e uma torre. A mensageira disse: mostre isto no Mosteiro, só a quem perguntar pela Página em Branco." },
};

// ---------------------------------------------------------------- the cast
const C2 = (a, b, c, d) => ramp(a, b, c, d);
function specs() {
  if (SPECS.rosalva) return;
  const H = SPECS.hero;
  SPECS.rosalva = { ...SPECS.maren, hair: C2("#3a1a0e", "#7a3216", "#b0521e", "#d8803a"), hairStyle: "bun", tunic: C2("#3a2a14", "#5e4420", "#86622e", "#aa8440"), apron: ramp("#8a7a5a", "#c8b890", "#ece0c0") };
  SPECS.guard = { ...H, armor: true, tunic: ramp("#3a4250", "#5e6878", "#8a96a8", "#b8c4d4"), cape: C2("#3a0e10", "#5e1a1a", "#862828", "#a83a32"), hair: C2("#141016", "#2a2228", "#40343a", "#5a4a4e"), weapon: "spear" };
  SPECS.hesta = { ...SPECS.guard, hair: C2("#8a5a1a", "#b8802a", "#dca848", "#f0c868"), hairStyle: "bun", weapon: "sword", cape: C2("#141e38", "#1e2e56", "#2c4478", "#3e5c9a"), femme: true };
  SPECS.besteiro = { ...SPECS.guard, armor: false, tunic: C2("#3a0e10", "#5e1a1a", "#862828", "#a83a32"), cape: null, weapon: "bow", hairStyle: "hood" };
  SPECS.dario = { ...H, hair: C2("#141016", "#2a2228", "#40343a", "#5a4a4e"), beard: "short", tunic: C2("#141418", "#24242c", "#383844", "#50505e"), cape: C2("#3a0e10", "#5e1a1a", "#862828", "#a83a32"), weapon: "mace", trim: ramp("#6a4410", "#c48a1c", "#f4d050") };
  SPECS.iara = { ...SPECS.maren, hair: C2("#141016", "#2a2228", "#40343a", "#5a4a4e"), hairStyle: "long", skin: C2("#5e3e24", "#8e6440", "#b8885c", "#d8ac7c"), tunic: C2("#4a2a0a", "#7a4a14", "#a8701e", "#cc9634"), apron: null, robe: true, femme: true };
  SPECS.beni = { ...H, small: true, cape: null, weapon: "none", skin: C2("#5e3e24", "#8e6440", "#b8885c", "#d8ac7c"), hair: C2("#141016", "#2a2228", "#40343a", "#5a4a4e"), tunic: C2("#0e2a2a", "#1a4444", "#2a6262", "#3e8484") };
  SPECS.refugee = { ...H, cape: null, weapon: "none", hairStyle: "hood", hair: C2("#3a2a1a", "#5e4630", "#86684a", "#ae9068"), tunic: C2("#3a2a1a", "#5e4630", "#86684a", "#ae9068"), beard: "long" };
  SPECS.dalva = { ...SPECS.cendra, cape: null, skin: C2("#5e3e24", "#8e6440", "#b8885c", "#d8ac7c") };
  SPECS.odara = { ...H, hairStyle: "hood", hair: C2("#3e3e48", "#585864", "#747482", "#9090a0"), tunic: C2("#3e3e48", "#585864", "#747482", "#9090a0"), cape: C2("#2e2e36", "#444450", "#5a5a68", "#72727e"), weapon: "none", femme: true };
}
const NIX = { race: "tiferino", cls: "ladino", gender: "f", name: "Nix", base: { FOR: 8, DES: 15, CON: 13, INT: 12, SAB: 10, CAR: 14 },
  look: { skin: 0, hair: 6, style: "long", beard: null, eyes: 4, outfit: 4, cape: 2 }, equip: { main: "adaga", ranged: "arcoCurto", armor: "couro", shield: null },
  extraSkills: ["Enganação", "Prestidigitação", "Percepção"] };

export function populate(W) {
  specs();
  if (CH2.MAPS.has(W.id)) return CH2.populate(W);
  const npc = (spec, def) => { const u = E.unit(spec, { team: "npc", maxHp: 8, ac: 10, ...def }); W.npcs.push(u); if (def.key) cast[def.key] = u; return u; };
  const foe = (spec, def) => { const u = E.unit(spec, { team: "enemy", passive: true, move: 5, dex: 1, ...def }); W.enemies.push(u); if (def.key) cast[def.key] = u; return u; };
  if (W.id === "vau") {
    npc("rosalva", { key: "rosalva", name: "Rosalva, a taverneira", tx: 11, ty: 6, dir: 0, talk: rosalvaTree });
    npc("guard", { key: "g1", name: "Guarda do portão", tx: 40, ty: 11, dir: 1, talk: guardTalk });
    npc("guard", { key: "g2", name: "Guarda do portão", tx: 40, ty: 14, dir: 1, talk: guardTalk });
    npc("guard", { key: "olmo", name: "Sargento Olmo", tx: 34, ty: 6, dir: 0, talk: olmoTalk });
    npc("dario", { key: "dario", name: "Dário Venn, Coletor", tx: 7, ty: 19, dir: 1, talk: () => (tribute(), null) });
    npc("iara", { key: "iara", name: "Iara", tx: 6, ty: 19, dir: 2, talk: iaraTalk });
    npc("beni", { key: "beni", name: "Beni", tx: 5, ty: 20, dir: 2, small: true, talk: () => ({ start: { text: F.iara === "forgot" ? "A mãe tá esquisita. Ela me chamou de \"menino\". Eu tenho nome." : "Você tem uma espada de verdade? O moço de capa vermelha tem uma maça. Eu não gosto dele.", options: [{ label: "...", to: "end" }] } }) });
    npc("refugee", { name: "Velho do norte", tx: 12, ty: 19, dir: 1, talk: () => ({ start: { text: "Eu sou de Pedra-Alta. Ou era. Pergunte a qualquer um aqui onde fica Pedra-Alta. Ninguém sabe. Eu mesmo já não sei desenhar o caminho.", options: [{ label: "...", to: "end" }] } }) });
    npc("refugee", { name: "Vendedora", tx: 17, ty: 11, dir: 0, talk: () => ({ start: { text: "Nabo, cebola e o que sobrou de uma vida. Não aceito lembrança, só moeda. Já me pagaram com um aniversário uma vez. Não era nem meu.", options: [{ label: "...", to: "end" }] } }) });
    const nix = E.companion(NIX, "nix", { team: "npc", tx: 24, ty: 11 });
    nix.dir = 0; nix.talk = nixTree; nix.label = "Mulher de capa rubra";
    W.npcs.push(nix); cast.nix = nix;
    // who came down the river with you
    if (F.maren_aboard) npc("maren", { key: "maren1", name: "Maren", tx: 10, ty: 20, dir: 3, talk: marenTalk });
    if (F.tome_alive) npc(SPECS.tome, { key: "tome1", name: "Tomé", tx: 8, ty: 20, dir: 3, small: true, talk: tomeTalk });
    W.chests.push({ x: 16 * TILE + 16, y: 20 * TILE + 26, open: false, loot: { potions: 1, gold: 8, items: [gearItem("armor", "couroBatido")] }, name: "Baú esquecido" });
  }
  if (W.id === "travessia") {
    const esv = (tx, ty, spec = "esvaido", name = "Esvaído") => foe(spec, { esvaido: true, name, tx, ty, maxHp: 16, ac: 10, atk: 3, dmg: "1d8+1", move: 3, dex: -1, group: "procissao", xpValue: 80, dir: 2 });
    const proc = [
      foe("dalva", { key: "dalva", name: "Irmã Dalva", tx: 16, ty: 14, maxHp: 20, ac: 12, atk: 4, dmg: "1d6+1", dex: 2, group: "procissao", xpValue: 150, boss: true, dir: 1,
        ranged: { range: 7, dmg: "1d6+2", name: "Toque do Esquecimento", pal: PAL.arcane, forget: true } }),
      esv(13, 14), esv(14, 15, "esvaidoFisher", "Esvaída lavadeira"), esv(12, 15),
    ];
    proc.passive = true;
    if (F.silas_doubt) npc("silas", { key: "silas1", name: "Irmão Silas", tx: 11, ty: 14, dir: 2, talk: silasTalk });
    const hunters = [
      foe("hesta", { key: "hesta", name: "Capitã Hesta", tx: 39, ty: 14, maxHp: 30, ac: 16, atk: 6, dmg: "1d8+3", group: "cacadores", xpValue: 250, boss: true, dir: 1 }),
      foe("guard", { name: "Soldado da Coroa", tx: 38, ty: 16, maxHp: 14, ac: 14, atk: 4, dmg: "1d8+2", group: "cacadores", xpValue: 100, dir: 1 }),
      foe("guard", { name: "Soldado da Coroa", tx: 40, ty: 13, maxHp: 14, ac: 14, atk: 4, dmg: "1d8+2", group: "cacadores", xpValue: 100, dir: 1 }),
      foe("besteiro", { name: "Besteiro da Coroa", tx: 42, ty: 15, maxHp: 11, ac: 13, atk: 4, dmg: "1d4+1", dex: 3, group: "cacadores", xpValue: 100, dir: 1, ranged: { range: 8, dmg: "1d8+2", name: "Virote", pal: PAL.wood } }),
    ];
    hunters.passive = true;
    npc("odara", { key: "odara", name: "Mensageira amarrada", tx: 43, ty: 14, dir: 1, talk: odaraTalk, fixed: true });
    W.groups = { procissao: proc, cacadores: hunters };
    // the Dente-de-Musgo clan, as the valley left it
    const [wx, wy] = TRAV.watch;
    if (F.goblin_pact) {
      W.put({ kind: "campfire", x: wx * TILE + 16, y: wy * TILE + 24, goblin: true }, [[wx, wy]]);
      W.put({ kind: "banner", x: (wx - 2) * TILE + 16, y: (wy - 1) * TILE + 26 }, [[wx - 2, wy - 1]]);
      npc("chief", { key: "gorza1", name: "Gorza", tx: wx - 1, ty: wy + 1, dir: 2, talk: gorzaTalk });
      npc("murta", { key: "murta1", name: "Murta", tx: wx + 1, ty: wy - 1, dir: 0, small: true, talk: murtaFriend });
    } else if (F.avo_dead) {
      const m = [
        foe("murta", { key: "murtaFoe", name: "Murta", tx: 25, ty: 12, maxHp: 16, ac: 14, atk: 5, dmg: "1d4+2", dex: 3, move: 6, small: true, group: "murta", xpValue: 150, boss: true, yields: true, hidden: true, ranged: { range: 8, dmg: "1d6+3", name: "Flecha", pal: PAL.wood } }),
        foe("goblin", { name: "Goblin de arco", tx: 24, ty: 17, maxHp: 9, ac: 13, atk: 4, dmg: "1d6+1", dex: 2, move: 6, small: true, group: "murta", xpValue: 60, hidden: true, ranged: { range: 7, dmg: "1d6+2", name: "Flecha", pal: PAL.wood } }),
        foe("goblin", { name: "Goblin", tx: 26, ty: 18, maxHp: 9, ac: 13, atk: 4, dmg: "1d6+2", dex: 2, move: 6, small: true, group: "murta", xpValue: 60, hidden: true }),
      ];
      m.passive = true;
      W.groups.murta = m;
    } else if (F.clan === "scared") {
      npc("murta", { key: "murta1", name: "Goblin de arco", tx: 26, ty: 14, dir: 1, small: true, talk: () => (murtaToll(), null) });
    } else if (!F.smoke_out) {
      npc("goblin", { key: "watcher", name: "Goblin vigia", tx: wx, ty: wy, dir: 1, small: true, talk: () => ({ start: { text: "(O goblin segura uma lança maior do que ele e não tira os olhos de vocês.) Chefe disse: gente passa. Chefe não disse: gente conversa.", options: [{ label: "...", to: "end" }] } }) });
    }
    W.chests.push({ x: 20 * TILE + 16, y: 7 * TILE + 26, open: false, loot: { potions: 2, gold: 14, items: [gearItem("weapon", "lancaGoblin")] }, name: "Oferenda esquecida" });
  }
}

// ---------------------------------------------------------------- arrival
export async function begin() {
  G.mode = "cutscene";
  document.getElementById("endscreen").classList.add("hidden");
  await UI.fade(1, 600);
  UI.cine("<h2>Ato I</h2><h1>A Marca de Cardo</h1>", "title");
  F.act1 = true;
  await E.sleep(400);
  E.buildMap("vau"); await E.sleep(60);
  E.buildMap("travessia"); await E.sleep(60);
  // three days on the river: everyone is rested, and nobody is in the boat any more
  for (const u of [G.hero, G.mate]) { u.hidden = false; u.hp = u.maxHp; u.slots = u.maxSlots ?? 0; u.restUsed = {}; if (u.level < 2) G.hooks.gainXp(u, u.nextXp - u.xp); }
  G.party = [G.hero, G.mate]; G.followers = []; G.leader = 0;
  Object.assign(G, { tint: null, speedCap: null, musicOverride: undefined, ambient: null, camFocus: null });
  G.clock = 20.8; G.clockTarget = 21.6;
  E.loadMap("vau", ...VAU.dock, 3);
  E.partyChanged();
  await E.sleep(2200);
  UI.cine("");
  await UI.fade(0, 1600);
  await scene(async () => {
    look(11, 20, 1.5);
    await lines([
      [null, "Três dias de rio. Na terceira noite, a correnteza do Cardo entrega o barco a um cais de tábuas novas, debaixo de uma paliçada de troncos apontados."],
      [null, "Vau-de-Cardo. Lanternas em cada poste, como se a vila tivesse medo do escuro. Do lado de dentro, mais gente do que casas."],
    ]);
    if (mateIs("kael")) await say(G.mate, "Paliçada nova, soldado no portão, refugiado dormindo na praça. Já vi essa cidade umas dez vezes, com dez nomes. (olha a sua mão) Guarda isso no bolso.");
    else await say(G.mate, "Tanta lanterna. Eles acham que a Bruma tem medo de luz. (baixinho) Tem medo é de gente lembrando. Esconda a mão, querido.");
    if (F.maren_aboard && F.maren_lucid) await say(cast.maren1, "Vão, vão cuidar do que vieram cuidar. Eu fico com o povo da fogueira. Velha de lago sempre acha uma rede pra remendar.");
    else if (F.maren_aboard) await say(null, "Maren desce do barco agradecendo a viagem a quem passa. Alguém a leva pela mão até a fogueira dos refugiados. Ela vai, sorrindo, sem perguntar para onde.");
    if (F.tome_alive) await say(cast.tome1, F.maren_aboard && !F.maren_lucid ? "(Tomé não solta a mão da avó. Ela deixa, como deixaria a de qualquer criança.)" : "Aqui tem muro! Lá em casa não tinha muro. (pausa) Lá em casa não tem mais nada, né?");
    await say(ARQ(), "(só você ouve) A taverna do Sabiá Cego. A carta dizia. Vamos ver quem tem tanto medo de mim.");
  });
  UI.banner("Vau-de-Cardo");
  UI.updateQuest();
  if (G.tutorial) later(4, () => hint("light"), "cosmetic");
}

// ---------------------------------------------------------------- quests
export function quests({ all } = {}) {
  const out = [], trim = (o) => { const open = o.filter(([, d]) => !d); return all ? o : open.length ? open : o.slice(-1); };
  const o = [["Procure \"L.\" na taverna do Sabiá Cego", !!F.rosalva_met]];
  if (F.rosalva_met) o.push(["Consiga o recado que L. deixou", !!F.note]);
  if (F.note) o.push(["Descanse até o portão abrir, de manhã", !!F.rested1]);
  if (F.rested1) o.push(["Saia pelo portão leste, rumo à Travessia do Cardo", !!F.trav_entered]);
  if (F.trav_entered) o.push(["Atravesse o vau e ache a mensageira de L.", !!F.hunters]);
  if (F.hunters) o.push(["Solte a mensageira", !!F.ch1_done]);

  const notes = [];
  if (F.poster_seen) notes.push("A Coroa oferece duzentas peças por um portador de marca prateada. O cartaz é assinado por V. Moss, o Mestre-Coletor.");
  if (F.rosalva_lembradora) notes.push("Rosalva é uma dos Lembradores. \"A gente escreve tudo. Um dia alguém vai precisar ler.\"");
  if (F.eco_trade) notes.push(F.eco_trade === "refused" ? "A Arquivista ofereceu um poder em troca de uma lembrança. Você recusou. Ela pareceu triste." : "Você entregou uma lembrança à Arquivista. Há uma linha riscada no Diário, e você não sabe mais o que ela dizia.");
  if (F.monastery_hint) notes.push("As procissões da Ordem saem do Mosteiro do Véu Sereno. Os nomes de quem \"descansa\" ficam num registro, lá.");
  if (F.otavio_found && F.monastery_hint) notes.push("O nome de Otávio deve estar nesse registro. Seria a prova de que a Ordem leva gente para a névoa.");
  if (F.ch1_done) out.push(...CH2.quests({ all }));
  else out.push({ title: "O Sabiá Cego", objs: trim(o), desc: "O contrato mandava levar o que dormia em Velmoor à taverna do Sabiá Cego, em Vau-de-Cardo. Quem assinou \"L.\" não apareceu.", notes });
  if (F.q_iara) out.push({ title: "O tributo de Iara", side: true, objs: trim([["Resolva a cobrança do Coletor no acampamento", !!F.iara]]),
    desc: "Um Coletor da Coroa cobra o Tributo de uma refugiada que não tem como pagar em ouro.", notes: F.iara === "forgot" ? ["Iara pagou com o rosto do filho. Ela continua cuidando dele, com muita educação."] : [] });
  if (F.q_nix) out.push({ title: "A Lume do comandante", side: true, objs: trim([["Abra o cofre atrás da guarnição", !!F.lume_got], ...(F.lume_got ? [["Decida o que fazer com a Lume", !!F.lume_done]] : [])]),
    desc: "Nix \"Pena-Rubra\" quer a Lume que o comandante confiscou dos refugiados. De noite há menos olhos.", notes: F.lume_done === "people" ? ["A Lume voltou para os refugiados. Era a voz de uma avó cantando."] : [] });
  if (!all) return out.filter((q, i) => i === 0 || q.objs.some(([, d]) => !d));
  return out;
}
/** Development (?dev=ato1c2): Travessia, chapter one done, straight on to chapter two. */
export function devChapter2() {
  F.act1 = true;
  Object.assign(F, { rosalva_met: true, note: true, rested1: true, trav_entered: true, gate_passed: true, monastery_hint: true, ch1_done: true });
  F.hunters ??= "talked"; F.proc ??= "passed"; F.eco_trade ??= "refused";
  E.buildMap("vau"); E.buildMap("travessia");
  for (const e of E.map("travessia").groups.cacadores) { e.gone = true; e.hp = 0; }
  for (const u of [G.hero, G.mate]) { u.hidden = false; while (u.level < 3) G.hooks.gainXp(u, u.nextXp - u.xp); u.hp = u.maxHp; u.slots = u.maxSlots ?? 0; }
  G.party = [G.hero, G.mate]; G.followers = []; G.leader = 0;
  if (F.nix_joined) { const N = cast.nix, W = E.map("vau"); N.team = "party"; N.talk = null; N.label = null; W.npcs.splice(W.npcs.indexOf(N), 1); while (N.level < 3) G.hooks.gainXp(N, N.nextXp - N.xp); N.hp = N.maxHp; G.party.push(N); }
  giveItem(ITEMS.seal); G.gold += 100;
  G.clock = 10; G.clockTarget = 10;
  E.loadMap("travessia", 46, 15, 2);
  E.partyChanged();
  CH2.begin();
}
function rosalvaTree() {
  const R = cast.rosalva, first = !F.rosalva_met;
  F.rosalva_met = true;
  const give = () => { F.note = true; giveItem(ITEMS.note); UI.toast("Na bolsa: Recado de L.", 2600); };
  const room = (cost) => () => { G.gold -= cost; later(0.3, () => nightRest("tavern")); };
  return {
    start: { text: first ? "Cheio. Chão cheio, celeiro cheio, até o telhado tem gente. Se é quarto, eu dou risada. Se é sopa, senta ali fora. (ela repara na sua mão fechada) ...E se é outra coisa, fala baixo." : "Fala baixo, que a guarnição bebe aqui.",
      options: [
        { label: "Procuro alguém que assina \"L.\".", to: F.note ? "after" : "L", if: () => !F.note },
        { label: "Mostrar a Carta do Contrato.", tag: "Carta", if: () => !F.note && hasItem("letter"), do: give, to: "letter" },
        { label: "O que é aquele cartaz no portão?", to: "poster", if: () => F.poster_seen },
        { label: "De onde vem tanta gente?", to: "refugees", once: true },
        { label: "Você não é só taverneira.", check: { skill: "Intuição", dc: 13 }, if: () => F.rosalva_lembradora == null, pass: () => { F.rosalva_lembradora = true; }, fail: () => { F.rosalva_lembradora = false; }, passTo: "lemb", failTo: "nolemb" },
        { label: "Preciso de um lugar para dormir.", to: "room" },
        { label: "Até mais.", to: "end" },
      ] },
    // each way of asking is tried once; showing the mark always works (what it costs is being known)
    L: () => ({ text: F.rosalva_ask === false ? "(Ela não para de enxugar a caneca.) Já disse. Quem vem de verdade, vem com a carta. Ou com outra coisa que não dê pra inventar." : "(Ela enxuga uma caneca que já estava seca.) Muita gente assina com uma letra só. Quem pergunta?", options: [
      { if: () => F.rosalva_ask == null, label: "Quem recebeu trezentas peças de promessa e uma carta com lacre de torre.", check: { skill: "Persuasão", dc: 12 }, pass: () => { F.rosalva_ask = true; give(); }, fail: () => { F.rosalva_ask = false; }, passTo: "letter", failTo: "wary" },
      { if: () => F.rosalva_ask == null, label: "Um amigo antigo. Ele me deve dinheiro.", check: { skill: "Enganação", dc: 14 }, pass: () => { F.rosalva_ask = true; give(); }, fail: () => { F.rosalva_ask = false; }, passTo: "lied", failTo: "wary" },
      { label: "Abrir a mão no balcão e mostrar a marca.", do: () => { F.rosalva_mark = true; give(); }, to: "mark" },
      { label: "Deixa pra lá.", to: "start" },
    ] }),
    wary: { text: "Resposta errada. (ela não se mexe) Quem vem de verdade, vem com a carta. Ou com alguma coisa que não dê pra inventar.", options: [{ label: "Voltar.", to: "L" }] },
    mark: { text: "(Ela olha a palma por um segundo só, e cobre a sua mão com um pano de prato.) Guarda isso. Aqui dentro bebe a guarnição. (por baixo do pano, um papel passa para os seus dedos) Uma mulher de capa cinza deixou isto há três dias, pra quem viesse do norte com essa mão.", options: [{ label: "Continuar", to: "after" }] },
    lied: { text: "(Ela não acredita, e entrega mesmo assim.) Mentiroso ruim é gente honesta com pressa. Toma. Deixaram isso há três dias.", options: [{ label: "Continuar", to: "after" }] },
    letter: { text: "(Ela olha o lacre, depois a porta, depois você.) Há três dias uma mulher de capa cinza deixou isto \"pra quem viesse do norte com cara de quem não dormiu\". E saiu pelos fundos, que a frente já tinha soldado.", options: [{ label: "Continuar", to: "after" }] },
    after: { text: "Não li. (pausa) Li. Todo mundo aqui lê tudo, é o costume da casa. O portão leste só abre com o sol, e a Travessia não é estrada pra se andar de noite. Durmam.", options: [{ label: "Voltar.", to: "start" }] },
    poster: { text: "Duzentas peças. Sabe quanto é isso aqui? É uma família inteira sem pagar Tributo por dez anos. Eu não culparia quem te entregasse. (ela empurra um par de luvas velhas pelo balcão) Eu só não vou ser eu.", options: [{ label: "Pegar as luvas.", if: () => !hasItem("gloves"), do: () => giveItem(ITEMS.gloves), to: "start" }, { label: "Voltar.", to: "start" }] },
    refugees: { text: "Do norte. Cada semana de uma aldeia que eu nunca ouvi falar. E o pior, forasteiro, é que eles também não lembram direito o nome. Chegam dizendo \"lá de cima\". Só isso. Lá de cima.", options: [{ label: "Voltar.", to: "start" }] },
    lemb: { text: "(Ela vira o livro de contas para você. Não são contas. São nomes, aldeias, datas, canções pela metade.) A gente escreve tudo. Um dia alguém vai precisar ler. Me chamam de Lembradora. Eu chamo de teimosia.", options: [{ label: "L. é um de vocês?", to: "lemb2" }] },
    lemb2: { text: "L. é o motivo de existir um \"vocês\". E é tudo o que eu digo com a guarnição a duas mesas. O quarto dos fundos é seu. Não me pague.", options: [
      { if: () => !F.note, label: "Ele deixou alguma coisa para mim?", do: give, to: "lembnote" },
      { label: "Voltar.", to: "start" },
    ] },
    lembnote: { text: "(Ela tira um papel de dentro do livro de nomes, onde estava marcando uma página.) Deixou. Uma mulher de capa cinza trouxe há três dias. Eu ia te dar de qualquer jeito. Eu só queria ver se você era de perguntar.", options: [{ label: "Continuar", to: "after" }] },
    nolemb: { text: "Sou taverneira, cozinheira, parteira e, às terças, juíza de briga de galo. Chega?", options: [{ label: "Voltar.", to: "start" }] },
    room: { text: F.rosalva_lembradora ? "O quarto dos fundos. Não range, não tem janela pra rua, e a porta tranca por dentro." : "Tem um canto no celeiro, atrás das sacas. Cinco peças, e eu não vi vocês.", options: [
      F.rosalva_lembradora ? { label: "Dormir até de manhã.", do: room(0), to: "end" } : { label: "Pagar 5 peças e dormir até de manhã.", if: () => G.gold >= 5, do: room(5), to: "end" },
      { label: "Agora não.", to: "start" },
    ] },
  };
}

/** A night's sleep, at the tavern or by the refugees' fire: morning comes, and before it, the Echo. */
async function nightRest(where) {
  await scene(async () => {
    await UI.fade(1, 900);
    for (const p of G.party) { p.hp = p.maxHp; p.slots = p.maxSlots ?? 0; p.restUsed = {}; }
    sfx.rest();
    if (!F.eco_trade) await echoBargain();
    G.clock = 7.2; G.clockTarget = 9.5;
    if (!F.rested1) { F.rested1 = true; }
    if (where === "tavern") E.loadMap("vau", 13, 7, 0);
    UI.cine("<p class='small'>Manhã. O sino da guarnição. O portão leste range.</p>");
    await E.sleep(2200);
    UI.cine("");
    await UI.fade(0, 1200);
    E.partyChanged();
    UI.updateQuest();
  });
}
export function onRest() {
  if (inCh2()) return CH2.onRest();
  if (G.W.id !== "vau") return;
  if (F.tome_alive && F.maren_aboard && !F.maren_lucid && !F.tome_asked) { tomeAsks().then(() => nightRest("fire")); return; }
  if (night()) nightRest("fire");
}
async function tomeAsks() {
  F.tome_asked = true;
  await scene(async () => {
    const t = cast.tome1;
    await lines([
      [t, "(Tomé senta do seu lado, olhando o fogo.) A moça da sua mão. A que fala. Ela guarda lembrança, né? Ela disse que ia me contar uma coisa que eu esqueci."],
      [t, "Ela pode devolver a vó? Só o pedaço em que ela sabe quem eu sou. Eu não preciso do resto."],
    ]);
    const v = await ask(null, "A marca na sua palma está fria. A Arquivista não diz nada. Ela está ouvindo.", [
      { label: "Eu não sei, Tomé. Mas eu vou perguntar.", v: "ask" },
      { label: "Enquanto você lembrar dela, ela não foi embora.", v: "hold" },
      { label: "Não. Ela só sabe tirar.", v: "no" },
    ]);
    if (v === "ask") await say(ARQ(), "(só você ouve) ...Eu posso. Se alguém pagar. É sempre assim, você sabe que é sempre assim.");
    if (v === "hold") { await say(t, "Então eu lembro em dobro. Por mim e por ela."); approve("kael", 1); approve("lyra", 1); }
    if (v === "no") { await say(t, "(Ele encolhe os joelhos.) Tá."); await say(ARQ(), "(só você ouve) Isso foi cruel. E não é verdade. Eu guardei uma cidade inteira."); F.eco_hurt = true; }
    remember("tome_fire", "Tomé, na fogueira de Vau-de-Cardo, perguntando se a moça da sua mão pode devolver a avó.");
  });
}

/** §3.2: every new power costs a memory. The first one after the prologue. */
async function echoBargain() {
  const A = ARQ(), power = F.echo === "accepted" ? "eyes" : "lampejo";
  UI.cine("<p class='small'>Você sonha com torres brancas. Desta vez, ela está sentada na beira da sua cama.</p>");
  await E.sleep(2600);
  UI.cine("");
  await lines([
    [A, F.echo === "accepted" ? "Você dormiu três noites num barco e não me disse uma palavra. Eu não reclamo. Eu fiquei mil anos sem ouvir uma." : "Você recusou. Eu entrei mesmo assim. Desculpe. Eu estava com tanto frio."],
    [A, power === "eyes" ? "Há soldados contando as suas pegadas. Eu posso te emprestar os olhos de Velmoor: a gente via a mentira no rosto das pessoas como você vê sujeira num vidro." : "O Lampejo que eu te ofereci lá embaixo ainda é seu, se quiser. Só que agora eu não tenho mais de onde tirar. Presente, só o primeiro."],
    [A, "Eu preciso de espaço para caber. Uma lembrança. Uma só. Você escolhe qual, eu não olho."],
  ]);
  const mems = G.memories.filter((m) => !m.struck);
  const v = await ask(A, "(O Diário de Lembranças está aberto no seu colo. Você não lembra de tê-lo aberto.)", [
    ...mems.map((m) => ({ label: `Entregar: "${m.text.length > 64 ? m.text.slice(0, 62) + "…" : m.text}"`, tag: m.origin ? "origem" : "lembrança", v: m.id })),
    { label: "Não. Nenhuma.", v: "no" },
  ]);
  if (v === "no" || v == null) {
    F.eco_trade = "refused";
    await say(A, "(Ela fecha o Diário com cuidado, como se fosse dela.) Está bem. Eu sei esperar. É a única coisa que eu sei fazer bem.");
    return;
  }
  const m = G.memories.find((x) => x.id === v);
  m.struck = true; m.lost = m.text; m.text = "— — — — — — — —";
  F.eco_trade = v; F["lost_" + v] = true;
  G.fx.spawn(FX.bloom, { x: G.hero.x, y: G.hero.y + 2, palette: PAL.arcane });
  if (power === "eyes") { G.hero.ecoEyes = true; for (const s of ["Percepção", "Intuição", "Investigação"]) G.hero.skills[s] = (G.hero.skills[s] ?? 0) + 2; }
  else { G.hero.abilities.push("lampejo"); G.hero.restUsed.lampejo = false; }
  K.refreshJournal();
  await lines([
    [null, "Uma linha do Diário fica em branco. Você sabe que havia alguma coisa escrita ali. Sabe pelo tamanho do vazio."],
    [A, power === "eyes" ? "Pronto. Olhos de Velmoor: +2 em Percepção, Intuição e Investigação. Obrigada. Estava apertado aqui." : "Pronto. O Lampejo de Velmoor é seu: uma vez por descanso, role de novo um d20 que falhou. Obrigada. Estava apertado aqui."],
  ]);
  if (mateIs("kael")) { await say(G.mate, "(de manhã, antes de qualquer bom-dia) Você tá com cara de quem pagou alguma coisa. Eu conheço essa cara. Eu cobrava ela."); approve("kael", -1); }
  else await say(G.mate, "(de manhã, Lyra olha o seu Diário fechado por tempo demais, e não pergunta nada.)");
}

// ---------------------------------------------------------------- the gate and the notice board
async function boardLook() {
  const first = !F.poster_seen;
  F.poster_seen = true;
  await scene(async () => {
    await say(null, "Entre um aviso de racionamento e um de \"procura-se cabra\", um cartaz novo, com o selo da Coroa: procura-se, com vida, portador de marca prateada na palma da mão. Duzentas peças.");
    if (first) {
      if (mateIs("kael")) await say(G.mate, "\"V. Moss\". O Mestre-Coletor assina de próprio punho quando quer muito uma coisa. Eu trabalhei oito anos pra esse homem e vi a assinatura dele duas vezes.");
      else await say(G.mate, "\"Em forma de nervuras de folha.\" Eles sabiam o desenho antes de você ter a marca. (ela franze a testa) Quem contou a eles?");
      const v = await ask(null, "O cartaz está preso por um prego só.", [{ label: "Arrancar o cartaz.", v: "take" }, { label: "Deixar onde está.", v: "leave" }]);
      if (v === "take") { giveItem(ITEMS.poster); const b = E.obj("board"); b.wanted = false; E.refresh(b); F.poster_taken = true; }
      UI.updateQuest();
    }
  });
}
function guardTalk() {
  return { start: { text: night() ? "Portão fechado até o sol nascer. Ordem do comandante. Depois que escurece, quem está fora fica fora, e o que está fora também." : F.rested1 ? "Pode passar. A estrada é sua, o risco também." : "Circulando.", options: [{ label: "...", to: "end" }] } };
}
async function gateScene() {
  if (F.gate_busy) return;
  F.gate_busy = true;
  const g = cast.g1, l = lead();
  try {
    if (!F.note || !F.rested1 || night()) {
      await scene(async () => {
        await say(g, night() ? "Alto. Portão fechado até o sol nascer." : "A estrada do vau está perigosa. Só sai quem tem o que fazer do outro lado.");
        E.place(l, 39, 12, 1);
      });
      return;
    }
    if (!F.gate_passed) {
      let ok = hasItem("gloves");
      await scene(async () => {
        await say(g, "Um instante. Ordem nova: mostrar as mãos na saída. As duas, palma pra cima.");
        if (ok) await say(null, "Você estende as mãos enluvadas. O guarda olha as luvas, olha a fila atrás de você, e decide que não é pago para pedir que alguém tire a roupa.");
        else {
          const v = await ask(g, "(Ele espera. O outro guarda encosta a lança no ombro e boceja.)", [
            { label: "Mostrar só a mão sem marca, falando sem parar.", check: { skill: "Enganação", dc: 12 }, pass: "ok", fail: "bad" },
            { label: "Fechar a mão sobre uma moeda, e deixar a moeda com ele.", tag: "20 de ouro", if: () => G.gold >= 20, v: "bribe" },
            { label: "Um soldado de verdade não precisa de ordem pra saber quem é honesto.", check: { skill: "Intimidação", dc: 14 }, pass: "ok", fail: "bad" },
            { label: "Voltar para a vila.", v: "back" },
          ]);
          if (v === "bribe") { G.gold -= 20; ok = true; await say(g, "(A moeda some.) Mãos limpas. Boa viagem."); }
          else if (v === "ok") { ok = true; await say(g, "Tá, tá. Passa."); }
          else if (v === "bad") { ok = true; F.guard_alert = true; await say(g, "(Ele vê. Um brilho frio entre os seus dedos. Não diz nada, e isso é pior.) ...Passa."); await say(null, "Quando você olha para trás, o guarda não está mais no posto. Está correndo para a guarnição."); }
          else E.place(l, 39, 12, 1);
        }
      });
      if (!ok) return;
      F.gate_passed = true;
    }
    await scene(async () => {
      await UI.fade(1, 600);
      F.trav_entered = true;
      E.loadMap("travessia", ...TRAV.west, 2);
      if (G.clock < 9) G.clock = 9;
      G.clockTarget = Math.max(G.clock, 13);
      UI.updateQuest();
      await UI.fade(0, 700);
    });
  } finally { F.gate_busy = false; }
}

// ---------------------------------------------------------------- side quest: Iara's tribute
function iaraTalk() {
  if (!F.iara) { tribute(); return null; }
  const t = { paid: "Eu não sei o seu nome e você pagou a minha dívida. Lá em cima a gente tinha uma palavra pra isso. Eu esqueci a palavra. Fica o obrigada.", talked: "Ele foi embora. Vai voltar, eles sempre voltam. Mas hoje o Beni janta olhando pra uma mãe que sabe quem ele é.",
    scared: "Você assustou um Coletor. Ninguém assusta um Coletor. (ela quase ri) Vão cobrar isso de alguém. Tomara que não de você.", forgot: "Bom dia. Esse menino é seu? É muito educado. Fica sempre por perto de mim, não sei por quê." };
  return { start: { text: t[F.iara], options: [{ label: "...", to: "end" }] } };
}
async function tribute() {
  if (F.iara) { await scene(() => say(cast.dario, "A Coroa agradece a sua opinião.")); return; }
  F.q_iara = true;
  const D = cast.dario, I = cast.iara, kael = mateIs("kael");
  await scene(async () => {
    look(6, 19, 2);
    await lines([
      [D, "Trinta peças de Tributo, três luas de atraso. A Coroa não cobra juros. A Coroa é generosa. (ele tira do cinto um frasco vazio, do tamanho de um dedo) Ela aceita o equivalente."],
      [I, "Eu já dei o meu casamento. Já dei a casa onde eu nasci. Eu não sei mais de que cor era a porta."],
      [D, "Então sobra pouco, e o pouco vale mais. O rosto do menino. A senhora continua tendo o menino. Só não vai lembrar de quando ele era pequeno."],
    ]);
    if (kael) await lines([[D, "(Ele vê Kael e o frasco para no ar.) ...Varrow? Disseram que você tinha desertado. Ou morrido. No nosso ofício dá no mesmo."], [G.mate, "Dário. Você ainda segura o frasco com a mão esquerda. Eu te ensinei errado."]]);
    const v = await ask(null, kael ? "Kael está muito quieto. A mão dele foi, sem ele perceber, até alguma coisa que ele carrega no peito." : "O menino, Beni, olha de um adulto para o outro sem entender o preço que está sendo discutido.", [
      { label: "Pagar as trinta peças.", tag: "30 de ouro", if: () => G.gold >= 30, v: "paid" },
      { label: kael ? "Kael, qual é a cláusula que ele está pulando?" : "O Tributo é por lar. Ela não tem lar. Mostre a ordem que manda cobrar de quem dorme no chão.", check: { skill: "Persuasão", dc: kael ? 11 : 14 }, pass: "talked", fail: "fail" },
      { label: "Encoste nela e você vai precisar de um frasco maior.", check: { skill: "Intimidação", dc: 15 }, pass: "scared", fail: "fail" },
      { label: "Mostrar o cartaz: \"O comandante quer todo Coletor na guarnição. Agora.\"", tag: "Cartaz", if: () => hasItem("poster"), check: { skill: "Enganação", dc: 12 }, pass: "talked", fail: "fail" },
      { label: "Não se meter.", v: "forgot" },
    ]);
    let r = v;
    if (v === "fail") {
      await say(D, "Bonito. Agora são trinta peças dela e a minha paciência, que também tem preço.");
      r = await ask(null, "Dário destampa o frasco.", [{ label: "Pagar as trinta peças.", tag: "30 de ouro", if: () => G.gold >= 30, v: "paid" }, { label: "Deixar acontecer.", v: "forgot" }]);
    }
    F.iara = r;
    if (r === "paid") { G.gold -= 30; await say(D, "(Ele conta duas vezes.) A Coroa agradece. O senhor acabou de comprar três luas para uma desconhecida. Na quarta eu volto."); }
    if (r === "talked") await say(D, kael && v !== "forgot" ? "(Kael recita, de cor, o artigo sobre refugiados sem domicílio. Dário fecha o frasco.) ...Você sempre decorou o livro. Era por isso que eu não gostava de você." : "(Ele guarda o frasco, devagar.) Vou conferir. E vou lembrar do seu rosto. Eu sou pago pra isso.");
    if (r === "scared") { await say(D, "(Ele recua um passo, e depois outro, e finge que era o que ia fazer.) Isso vai para o relatório."); F.guard_alert = true; }
    if (r === "forgot") {
      await lines([
        [null, "Dário encosta o frasco na têmpora dela. Não há luz, nem som. Só uma coisa leitosa enchendo o vidro, e os ombros de Iara descendo, aliviados, como os de quem larga um peso."],
        [I, "(Ela olha para Beni com a gentileza que se tem com o filho dos outros.) Oi. Você está perdido?"],
      ]);
      if (kael) { await say(G.mate, "(Kael não olha para você.) Eu fiz isso por oito anos. Eu sei quanto tempo leva. Dava tempo de ter impedido."); approve("kael", -2); }
      else { await say(G.mate, "(Lyra aperta o cajado até os nós dos dedos ficarem brancos.) Em Lethiel a gente faz isso de propósito e chama de cerimônia."); approve("lyra", -1); }
    } else {
      E.walk(D, 10, 13, 60).then(() => { D.gone = true; });
      approve("kael", 1); approve("lyra", 1);
      await say(I, "(Ela põe na sua mão um maço de ervas amarrado com um pano pequeno.) Fumaça de lembrança. Os goblins lá de cima ensinaram a minha mãe. O pano era do Beni. Queime quando os de olho branco chegarem perto.");
      giveItem(ITEMS.smoke);
      reward(120, "O tributo de Iara");
      remember("iara", "Iara, que não lembra a cor da porta de casa, e ainda lembra do rosto do filho.");
    }
    UI.updateQuest();
  });
}

// ---------------------------------------------------------------- side quest: Nix and the commander's Lume
function nixTree() {
  const N = cast.nix, known = F.q_nix;
  if (F.nix_joined) return null;
  if (F.lume_got && !F.lume_done) { lumeChoice(); return null; }
  if (F.lume_done) return { start: { text: F.lume_done === "people" ? "Você deu uma fortuna a quem não pode pagar. (ela sorri torto) Eu ainda não decidi se isso me irrita ou me interessa." : "Negócio fechado é negócio esquecido. É o lema da Feira.", options: [{ label: "...", to: "end" }] } };
  N.label = "Nix";
  return {
    start: { text: known ? "E então? O cofre não vai se abrir de saudade." : "(Uma tiferina de capa rubra examina uma maçã como quem avalia uma joia.) Você anda como quem esconde uma coisa na mão direita. Relaxa. Eu vivo de reparar, não de contar. Nix. \"Pena-Rubra\", pra quem deve dinheiro.", options: [
      { label: "O que você quer?", to: "job", if: () => !F.q_nix },
      { label: "Como eu abro o cofre?", to: "how", if: () => !!F.q_nix },
      { label: "O que é uma Lume, pra você?", to: "lume", once: true },
      ...(mateIs("kael") && !F.nix_kael ? [{ label: "(Kael e ela se encaram.)", to: "kael" }] : []),
      { label: "Tem luvas pra vender?", to: "gloves", if: () => !hasItem("gloves") },
      { label: "Até mais.", to: "end" },
    ] },
    job: { text: "Atrás da guarnição tem um cofre de ferro. Dentro, uma Lume que o comandante tomou de uma velha na fila da sopa: \"contrabando de memória\". Eu quero a Lume. Eu sou boa de fechadura e péssima de sargento. Você tem cara de quem resolve sargento.", options: [
      { label: "Fechado.", do: () => { F.q_nix = true; }, to: "how" }, { label: "Vou pensar.", do: () => { F.q_nix = true; }, to: "end" },
    ] },
    how: { text: "O sargento Olmo fica plantado ali o dia todo. De noite ele cochila em pé, eu já vi. Distrai, suborna, passa por trás: não me interessa como. Abriu, a Lume é minha, e sessenta peças são suas.", options: [{ label: "Voltar.", to: "start" }] },
    lume: { text: "Um primeiro beijo. A receita de um mestre-cervejeiro. O jeito que um pai ria. Na Feira das Lembranças de Maralto, isso é moeda. (ela dá de ombros, rápido demais) Eu já bebi tantas que não sei mais quais risadas de pai são minhas.", options: [{ label: "Voltar.", to: "start" }] },
    kael: { text: "Ora. O Coletor que pagou pra roubar o próprio Arquivo. Um frasco só, lacrado, prateleira dos \"não reclamados\". (ela olha o peito dele) Você ainda não bebeu. Dá pra ver daqui.", options: [{ label: "Continuar", do: () => { F.nix_kael = true; }, to: "kael2" }] },
    kael2: { who: G.mate, text: "Você recebeu. Eu recebi. A conversa acabou há três anos.", options: [{ label: "Voltar.", to: "start" }] },
    gloves: { text: "Couro de cabra, quase do seu tamanho. Cinco peças. Não pergunto por que alguém quer luva no verão.", options: [{ label: "Comprar.", tag: "5 de ouro", if: () => G.gold >= 5, do: () => { G.gold -= 5; giveItem(ITEMS.gloves); }, to: "start" }, { label: "Voltar.", to: "start" }] },
  };
}
function olmoTalk() {
  if (F.lume_got) return { start: { text: "(O sargento olha o cofre, depois você, depois o cofre.) ...Eu não vi nada. Eu nunca vejo nada. É por isso que eu ainda sou sargento.", options: [{ label: "...", to: "end" }] } };
  return { start: { text: night() ? "(O sargento Olmo está de pé, de olhos fechados, apoiado na lança. Ronca baixo.)" : "Propriedade da Coroa. Dá a volta.", options: [{ label: "...", to: "end" }] } };
}
async function strongbox() {
  const box = E.obj("strongbox"), O = cast.olmo;
  if (F.lume_got) return say(null, "O cofre está aberto e vazio, tirando uma lista de \"bens apreendidos\": uma Lume, dois brinquedos, um xale.");
  if (!F.q_nix) return say(null, "Um cofre de ferro, com um cadeado do tamanho de um punho. O sargento ao lado pigarreia.");
  // each way past the sergeant is tried once (by day or by night: he sleeps standing up at night, and that is the
  // only difference). The purse always works, for whoever has the gold. The lock: tried once, then Nix does it.
  await scene(async () => {
    const hard = F.guard_alert ? 2 : 0, dark = night() ? -3 : 0;
    if (!F.box_past) {
      const tried = F.box_sneak != null && F.box_lie != null;
      const v = await ask(null, tried ? "O sargento Olmo já conhece o seu rosto. Não vai cair na mesma conversa, nem olhar de novo para as caixas. Sobra a moeda." : night() ? "O sargento Olmo cochila em pé, a três passos do cofre. As lanternas da guarnição deixam uma faixa de sombra atrás das caixas." : "O sargento Olmo vigia o cofre com a atenção de quem não tem mais nada para fazer. De dia, não há sombra onde se esconder.", [
        { if: () => F.box_sneak == null, label: "Ir por trás das caixas, sem barulho.", act: true, check: { skill: "Furtividade", dc: 14 + hard + dark }, pass: "ok", fail: "sneak" },
        { if: () => F.box_lie == null, label: "Sargento! Tem um Coletor apanhando no acampamento!", check: { skill: "Enganação", dc: 13 + hard }, pass: "ok", fail: "lie" },
        { label: "Deixar uma bolsa \"cair\" perto da bota dele.", tag: "25 de ouro", if: () => G.gold >= 25, v: "bribe" },
        { label: "Voltar mais tarde.", v: "no" },
      ]);
      if (v === "no" || v == null) return;
      if (v === "sneak" || v === "lie") {
        F[v === "sneak" ? "box_sneak" : "box_lie"] = false;
        F.box_tries = (F.box_tries ?? 0) + 1;
        await say(O, "Ei! Mão longe do ferro! (ele bate a lança no chão) Some, antes que eu lembre do seu rosto.");
        return;
      }
      if (v === "bribe") { G.gold -= 25; await say(O, "(O sargento descobre, de repente, um interesse profundo pelo outro lado da praça.)"); }
      F.box_past = true;
    }
    const lock = await ask(null, F.box_lock === false ? "O cadeado continua fechado, com o seu arame torto ainda enfiado nele." : "O cadeado é velho e bem feito. Nix deixou com você dois arames e um conselho: \"não force, convença\".", [
      F.box_lock === false ? { label: "Assobiar para Nix, do outro lado da praça.", tag: "Nix", v: "nix" }
        : { label: "Abrir o cadeado.", check: { skill: ["Prestidigitação", "Investigação"], dc: 12 }, pass: "ok", fail: "bad" },
      { label: "Desistir por agora.", v: "no" },
    ]);
    if (lock === "bad") { F.box_lock = false; F.box_tries = (F.box_tries ?? 0) + 1; await say(null, "O arame entorta. O cadeado nem toma conhecimento. Do outro lado da praça, Nix cobre o rosto com a mão."); return; }
    if (lock !== "ok" && lock !== "nix") return;
    if (lock === "nix") await say(cast.nix, "(Ela chega sem pressa, tira o seu arame torto como quem tira um espinho, e o cadeado abre no primeiro toque.) Convença, eu disse. Não brigue. (ela volta para as maçãs) Você me deve a vergonha.");
    box.open = true; E.refresh(box); sfx.chest();
    F.lume_got = true;
    giveItem(ITEMS.lume);
    G.hero.glow = { r: 34, c: [170, 205, 255], a: 0.4, h: 18 };
    await lines([
      [null, "Dentro: um xale, dois brinquedos de madeira, e um cristal turvo do tamanho de uma noz. Quando você o pega, ele esquenta, e por um segundo você ouve uma mulher velha cantando para alguém dormir."],
      [ARQ(), "(só você ouve) Uma Lume de cozinha. Em Velmoor toda casa tinha uma dúzia. (uma pausa longa) ...Eu tinha esquecido que elas cantavam."],
    ]);
    reward(lock === "nix" ? 60 : 100, "O cofre do comandante");
    UI.updateQuest();
  });
}
async function lumeChoice() {
  const N = cast.nix;
  await scene(async () => {
    await say(N, "(Os olhos dela vão direto para a sua mão.) Você conseguiu. Ela canta? As boas cantam. Sessenta peças, como combinado.");
    const v = await ask(null, "A Lume está morna na sua palma, ao lado da marca de prata.", [
      { label: "Entregar a Lume a Nix.", v: "nix" },
      { label: "Ela é de uma velha na fila da sopa. Vai voltar pra ela.", v: "people" },
      { label: "Ficar com a Lume.", v: "keep" },
    ]);
    F.lume_done = v;
    if (v === "nix") {
      takeItem("lume"); G.gold += 60;
      await lines([[N, "(Ela encosta o cristal no ouvido, fecha os olhos, e por um instante parece ter dez anos.) ...Não é a minha. Nunca é a minha. (guarda no decote) Mas vende bem."], [N, "Você trabalha limpo. Eu estou indo para onde você vai: quem tem a Coroa no rastro acaba passando por Maralto, e eu tenho uma coisa pra buscar lá."]]);
    } else if (v === "people") {
      takeItem("lume");
      await lines([
        [null, "A velha está na fila da sopa, como Nix disse. Quando põe a Lume no ouvido, ela não chora. Ela canta junto, baixinho, a segunda voz."],
        [N, "(Nix assistiu de longe, de braços cruzados.) Era a mãe dela cantando. Você deu uma fortuna a quem não pode pagar. (uma pausa) Faz tempo que eu não vejo alguém fazer um negócio tão ruim de propósito."],
        [N, "Eu vou com você. Não por bondade. Eu quero ver até onde isso vai."],
      ]);
      approve("kael", 1); approve("lyra", 1);
      remember("lume_song", "Uma velha na fila da sopa, cantando a segunda voz da canção da própria mãe.");
      reward(80, "A Lume voltou para casa");
    } else {
      await lines([[N, "(O sorriso dela não muda. Os olhos, sim.) Entendi. Você também coleciona."], [N, "Então eu vou junto, pra ficar de olho no meu investimento. Você dorme, uma hora."]]);
      approve("kael", -1);
    }
    G.hero.glow = { r: 30, c: [160, 200, 255], a: 0.35, h: 18 };
    await nixJoins();
    UI.updateQuest();
  });
}
async function nixJoins() {
  const N = cast.nix, W = E.map("vau");
  F.nix_joined = true;
  N.team = "party"; N.talk = null; N.label = null;
  W.npcs.splice(W.npcs.indexOf(N), 1);
  while (N.level < G.hero.level) G.hooks.gainXp(N, N.nextXp - N.xp);
  N.hp = N.maxHp;
  G.party.push(N);
  E.partyChanged();
  UI.banner("Nix entrou no grupo");
  sfx.quest();
  if (mateIs("kael")) await say(G.mate, "Ela rouba lembrança de gente viva. (para Nix) Encosta na minha bolsa e eu te devolvo à Feira em parcelas.");
  else await say(G.mate, "Uma ladra de memórias. Em Lethiel a gente as chama de bibliotecárias, quando não está olhando ninguém. Bem-vinda.");
}

// ---------------------------------------------------------------- who came down the river
function marenTalk() {
  if (!F.maren_lucid) return { start: { text: "Ah! Viajantes de verdade, graças à Senhora das Marés. (ela sorri, do mesmo jeito, com as mesmas palavras) Vocês viram um barco? Estou esperando um barco.", options: [
    ...(hasItem("chair") && !F.chair_given1 ? [{ label: "Pôr a cadeira de balanço ao lado dela.", tag: "Cadeira", do: () => { F.chair_given1 = true; takeItem("chair"); remember("maren_chair", "Maren sentando numa cadeira que não lembra de quem é, e ficando quieta."); }, to: "chair" }] : []),
    { label: "...", to: "end" }] },
    chair: { narr: true, text: "Ela passa o dedo pelo entalhe do encosto, \"Para a Maren, do teu Otávio\", como quem lê um nome estrangeiro. Depois senta. A cadeira range do jeito certo. Ela fica muito quieta, e para de perguntar pelo barco.", options: [{ label: "...", to: "end" }] } };
  return { start: { text: F.otavio_found ? "Eu sonhei com o Otávio no barco. Ele jogava a rede e a rede não tinha fim. (ela olha para você) Vocês viram alguma coisa lá embaixo. Não precisa ser hoje. Mas um dia vocês me contam." : "Tem gente aqui de aldeia que eu nunca ouvi falar. Eu faço cada um dizer o nome da sua três vezes por dia. Nome que se diz não some.", options: [
    ...(F.otavio_found && !F.maren_told ? [{ label: "Contar de Otávio, entre os Esvaídos da Ordem.", do: () => { F.maren_told = true; approve("kael", 1); approve("lyra", 1); }, to: "told" }] : []),
    { label: "Fique bem, Maren.", to: "end" }] },
    told: { text: "(Ela ouve até o fim sem piscar.) Três anos eu rezei pra Nhara devolver o corpo. Ela não tinha o corpo. (as mãos dela não tremem) Ele ainda joga a rede? ...Então ele ainda é ele. Eu vou buscar o meu marido, nem que seja pra sentar do lado.", options: [{ label: "...", to: "end" }] } };
}
function tomeTalk() {
  return { start: { text: F.maren_aboard && !F.maren_lucid ? "A vó me chama de \"menino\". Eu respondo. Se eu parar de responder ela esquece até isso." : "O Beni disse que aqui tem escola. Eu disse que eu já desci num lugar com estátua que fala. Ele não acreditou.", options: [{ label: "...", to: "end" }] } };
}

// ---------------------------------------------------------------- the road: the lost procession
function silasTalk() {
  return { start: { text: F.proc ? "Eu vou voltar ao Mosteiro. Não para ficar. Há um livro lá, com nomes. Se vocês forem, perguntem por mim na porta da cozinha, não na da frente." : "(Irmão Silas caminha atrás da procissão, de cabeça baixa. Quando vê vocês, não corre nem ataca.) Vocês. Do Relicário. Eu... eu não segurei a lança de ninguém desde aquele dia.", options: [{ label: "...", to: "end" }] } };
}
async function procession() {
  if (F.proc) return;
  F.proc = "met";
  const P = G.groups.procissao, D = cast.dalva;
  await scene(async () => {
    look(14, 14, 2);
    await lines([
      [null, "Na estrada, três pessoas andam em fila, devagar, descalças. Olhos brancos. Uma delas esfrega as mãos uma na outra, sem parar, como quem lava roupa. Atrás, uma monja de branco carrega uma lanterna apagada."],
      [D, "Bom dia, viajantes. Não se assustem com os meus irmãos. Eles vêm de Pedra-Alta e estão cansados. Eu só os estou levando para descansar."],
    ]);
    if (F.otavio_found) await say(G.mate, mateIs("kael") ? "\"Descansar.\" Foi assim que levaram o pescador da Maren. Mesma fila, mesmo passo." : "O norte fica para lá. Ela os está levando de volta para dentro da Bruma. Como fizeram com Otávio.");
    if (F.silas_doubt && cast.silas1) await say(cast.silas1, "(baixo, sem olhar para Dalva) Eles não pediram. Eu estava na aldeia. Ninguém pediu.");
    let v;
    do {
      v = await ask(D, "A Bruma está a meia légua, irmãos. Para eles, é só mais um pouco de estrada. Deixem-nos passar.", [
        { label: "Para onde saem as procissões?", v: "where", if: () => !F.monastery_hint },
        { label: "Deixar a procissão passar.", v: "pass" },
        { if: () => !F.proc_free_try, label: "Eles não escolheram isso. Solte-os e vá embora.", check: { skill: "Persuasão", dc: 14 }, pass: "free", fail: "nofree" },
        { label: "Queimar a fumaça de lembrança diante deles.", tag: "Fumaça", if: () => hasItem("smoke"), v: "smoke" },
        { label: "Atacar.", v: "fight" },
      ]);
      if (v === "where") { F.monastery_hint = true; await say(D, "Do Mosteiro do Véu Sereno, onde a Madre nos ensina a largar o que pesa. Há um livro lá com o nome de cada um que descansou. Nós não esquecemos de ninguém. Só ajudamos cada um a esquecer de si."); UI.updateQuest(); }
      if (v === "nofree") { F.proc_free_try = true; await say(D, "Soltar? Eles não estão presos, irmão. Presos estão vocês, a tudo o que dói."); }
    } while (v === "where" || v === "nofree");
    if (v === "pass") {
      F.proc = "passed";
      for (const e of P) { e.passive = true; E.walk(e, e === D ? 12 : 10, 3, 34).then(() => { e.gone = true; }); }
      await say(null, "A fila sai da estrada e sobe para o norte, entre os pinheiros, na direção do branco. A lavadeira é a última. Ela ainda esfrega as mãos quando some.");
      approve("kael", -1); approve("lyra", -1);
    } else if (v === "free") {
      F.proc = "freed";
      D.passive = true; E.walk(D, 12, 3, 60).then(() => { D.gone = true; });
      for (const e of P) if (e !== D) { e.team = "npc"; e.gesture = true; G.W.npcs.push(e); G.W.enemies.splice(G.W.enemies.indexOf(e), 1); e.talk = GESTURE; }
      await lines([[D, "(Ela pensa por um bom tempo.) A Madre diz que ninguém é levado, só acompanhado. Se eu os deixo aqui, eu só os acompanhei até a metade. (ela apaga uma lanterna que já estava apagada) Que fiquem. Eles não vão saber a diferença. Vocês vão."], [null, "Ela vai embora sozinha. Os três ficam parados na estrada, sem fila para seguir."]]);
      reward(150, "A procissão perdida");
    } else if (v === "smoke") {
      takeItem("smoke"); F.smoke_used = true; F.proc = "smoke";
      G.fx.spawn(FX.bloom, { x: lead().x, y: lead().y, palette: PAL.ember });
      await lines([
        [null, "A fumaça é doce e cheira a roupa de criança guardada. Os três param. A lavadeira olha para as próprias mãos, como se as visse pela primeira vez em anos."],
        [{ name: "Esvaída lavadeira", portrait: P[2].portrait }, "...Rio. Eu... lavava no rio. Tinha uma... (a palavra não vem. Os olhos continuam brancos, mas estão molhados.)"],
        [D, "(A voz gentil acaba.) Apague isso. Apague! Você não sabe o que é dar de volta a alguém a única coisa de que ela finalmente se livrou!"],
      ]);
      for (const p of G.party) p.forgetWard = true;
      for (const e of P) if (e !== D) { e.skip = 2; e.skipNote = "Lembrando..."; }
      E.fight(P);
    } else {
      F.proc = "fight";
      await say(D, "Então descansem também. Eu não guardo rancor. Eu não guardo nada.");
      E.fight(P);
    }
    UI.updateQuest();
  });
}

// ---------------------------------------------------------------- the ford: the Dente-de-Musgo clan
function gorzaTalk() {
  return { start: { text: F.hunters === "won" ? "Soldado de capa azul correu que nem coelho. Goblin riu. Faz tempo que goblin não ria." : "Humano do vale! Gorza guarda o rio agora. Humano de Maren manda peixe, goblin manda fumaça. Troca boa. (ele aponta o outro lado com o queixo) Tem soldado lá. Quatro. Amarraram uma humana de cinza. Se briga começar, goblin atravessa.", options: [{ label: "...", to: "end" }] } };
}
function murtaFriend() {
  return { start: { text: "A Avó ficou. Ela disse que fogo velho não muda de lugar. (Murta aperta a corda do arco) Um dia Murta volta lá dentro e traz a Avó. Você tem a moça de prata na mão. A moça sabe andar no branco. Quando você for, Murta vai.", options: [{ label: "\"Combinado.\"", do: () => { F.murta_promise = true; }, to: "end" }, { label: "...", to: "end" }] } };
}
async function murtaToll() {
  if (F.toll) return;
  const M = cast.murta1;
  await scene(async () => {
    await lines([[M, "(Uma goblin pequena, de arco armado, no meio do vau.) Você. O que fez o clã correr com palavra feia. A fumaça foi embora com a gente. O vale ficou branco. Murta decorou sua cara."], [M, "Rio agora é de Murta. Vinte moedas, ou volta nadando."]]);
    const v = await ask(M, "(A flecha aponta para o seu joelho, não para o peito. Ela quer que doa por muito tempo.)", [
      { label: "Pagar as vinte moedas.", tag: "20 de ouro", if: () => G.gold >= 20, v: "pay" },
      { label: "Eu estava errado. Vocês não eram ladrões.", check: { skill: "Persuasão", dc: 13 }, pass: "sorry", fail: "no" },
      { label: "Passar assim mesmo.", v: "push" },
    ]);
    F.toll = v;
    if (v === "pay") { G.gold -= 20; await say(M, "(Ela morde uma moeda.) Humano paga quando tem flecha apontada. Murta aprendeu isso com humano."); }
    else if (v === "sorry") { await say(M, "(O arco desce um dedo.) ...Palavra não acende fogo. Mas é a primeira que humano dá de graça. Passa. Murta ainda não gosta de você."); F.murta_softened = true; reward(80, "Murta baixou o arco"); }
    else { await say(M, "(A flecha passa raspando a sua orelha e some na água.) Essa foi a de aviso. Murta só tem uma de aviso."); if (v === "no") G.hero.hp = Math.max(1, G.hero.hp - 3); }
    E.walk(M, 24, 20, 90).then(() => { M.gone = true; });
  });
}
async function murtaAmbush() {
  if (F.ambush) return;
  F.ambush = true;
  const Mg = G.groups.murta, M = cast.murtaFoe;
  await scene(async () => {
    for (const e of Mg) { e.hidden = false; G.fx.spawn(FX.poof, { x: e.x, y: e.y }); }
    look(25, 14, 3);
    await lines([[null, "Uma flecha se crava na areia do vau, a um palmo da sua bota. Dos juncos saem três goblins. A menor tem um capuz vermelho grande demais para ela, chamuscado na barra."], [M, "Murta decorou sua cara. No vale. Do lado do fogo, onde a Avó caiu. (ela puxa a corda até a orelha) A Avó segurava o branco pra todo mundo. Até pra você."]]);
    const v = await ask(M, "Fala. Murta quer ouvir a voz antes.", [
      { label: "Eu não sabia o que ela fazia. Agora eu sei. Eu sinto muito.", check: { skill: "Persuasão", dc: 16 }, pass: "sorry", fail: "fight" },
      { label: "Ela me atacou primeiro.", v: "fight" },
      { label: "Sacar a arma.", v: "fight" },
    ]);
    if (v === "sorry") {
      F.murta = "spared";
      await lines([[M, "(O arco treme. Ela não atira.) ...Sentir muito não acorda ninguém. (ela cospe na água) Murta vai contar até mil. Se você ainda estiver no rio, Murta para de contar."], [null, "Os três somem nos juncos. O capuz vermelho é a última coisa que você vê."]]);
      for (const e of Mg) { e.gone = true; e.hp = 0; }
      reward(150, "Murta baixou o arco");
    } else { F.murta = "fought"; E.fight(Mg); }
  });
}

// ---------------------------------------------------------------- the east bank: the Crown's hunters
function odaraTalk() {
  if (!F.hunters) return { start: { narr: true, text: "Uma mulher de capa cinza, amarrada à roda da carroça. Ela balança a cabeça, quase nada: não.", options: [{ label: "...", to: "end" }] } };
  if (!F.ch1_done) { courier(); return null; }
  return { start: { text: "Vão pelo sul do bosque, não pela estrada. E não durmam no Mosteiro, por mais gentil que seja a cama.", options: [{ label: "...", to: "end" }] } };
}
async function hunters() {
  if (F.hunters) return;
  const H = cast.hesta, Hg = G.groups.cacadores;
  F.hunters = "met";
  await scene(async () => {
    look(40, 14, 2);
    await lines([
      [null, "Do outro lado do vau, uma carroça tombada. Quatro soldados de capa da Coroa reviram a carga. Amarrada a uma roda, uma mulher de capa cinza, com uma pena presa no capuz."],
      [H, F.guard_alert ? "Aí está. O portão mandou um corredor: \"brilho na mão direita, saiu pelo leste\". (ela desembainha, sem pressa) Eu adoro quando o serviço vem até mim." : "Estrada fechada, por ordem do Mestre-Coletor. (ela olha as suas mãos antes do seu rosto) Quem são vocês e o que carregam?"],
    ]);
    let v = "fight";
    if (!F.guard_alert) {
      v = await ask(H, "As mãos. Devagar.", [
        { label: "Mercadores de sal. A carroça de trás atolou.", check: { skill: "Enganação", dc: hasItem("gloves") ? 11 : 15 }, pass: "lie", fail: "fight" },
        { label: mateIs("kael") ? "Kael: Coletor Varrow, em serviço. A prisioneira é minha." : "Essa mulher é uma cidadã. Sob que acusação?", check: { skill: mateIs("kael") ? "Intimidação" : "Persuasão", dc: 15 }, pass: "rank", fail: "fight" },
        { label: "Mostrar a marca — É isto que você procura.", v: "fight" },
      ]);
    }
    if (v === "lie") {
      await lines([[H, "Sal. (ela perde o interesse) Passem. E se virem alguém com um brilho na mão, são duzentas peças. Eu divido. Dez para vocês."], [null, "Vocês passam. A mulher de capa cinza acompanha vocês com os olhos. Vinte passos adiante, a estrada faz uma curva atrás de um bosque. Os soldados estão de costas."]]);
      const w = await ask(null, "Daqui, dá para voltar por trás das árvores.", [
        { label: "Voltar e soltar a mulher em silêncio.", check: { skill: "Furtividade", dc: 13 }, pass: "sneak", fail: "caught" },
        { label: "Atacar pelas costas.", v: "ambush" },
      ]);
      if (w === "sneak") {
        F.hunters = "sneaked";
        await say(null, "A corda cede no terceiro nó. A mulher não faz um som. Quando a capitã finalmente olha para a carroça, só há uma roda, uma corda cortada e uma pena cinza.");
        for (const e of Hg) { e.passive = true; E.walk(e, 48, 14, 80).then(() => { e.gone = true; e.hp = 0; }); }
        reward(350, "Ninguém viu");
        UI.updateQuest();
        return;
      }
      for (const e of Hg) { e.skip = 1; e.skipNote = "Surpreso!"; }
      if (w === "caught") { for (const e of Hg) e.skip = 0; await say(H, "Mercadores de sal não andam na ponta do pé. Peguem!"); }
    } else if (v === "rank") {
      F.hunters = "talked";
      await lines([[H, mateIs("kael") ? "(Ela hesita. O nome ainda pesa.) Varrow... constava como desertor. (olha os próprios homens) Mas ninguém me mandou a baixa por escrito. Leve. E diga ao Mestre que a Hesta cooperou." : "(Ela não tem uma acusação. Tem uma ordem, e a ordem não diz nada sobre mensageiras.) ...Soltem. Não vale a tinta do relatório."], [null, "Os soldados montam e seguem para o norte da estrada. A capitã olha para trás duas vezes."]]);
      for (const e of Hg) { e.passive = true; E.walk(e, 48, 14, 80).then(() => { e.gone = true; e.hp = 0; }); }
      reward(350, "Sem tirar a espada");
      UI.updateQuest();
      return;
    } else await say(H, `${gword(G.hero.gender, "Viva", "Vivo", "Com vida")}, diz o cartaz. Não diz \"inteir${gword(G.hero.gender, "a", "o", "e")}\". Os outros são brinde.`);
    F.hunters = "fight";
    if (F.smoke_used === undefined) for (const p of G.party) p.forgetWard = p.forgetWard ?? false;
    E.fight(Hg);
  });
}
async function goblinsCross(C) {
  const mk = (spec, def) => E.unit(spec, { team: "party", ai: true, hpPerLevel: 0, ...def });
  const gorza = mk("chief", { key: "gorzaAlly", name: "Gorza", tx: 35, ty: 14, maxHp: 24, ac: 15, atk: 5, dmg: "1d10+3", move: 5, dex: 0, cls: "Chefe goblin · aliado" });
  const murta = mk("murta", { key: "murtaAlly", name: "Murta", tx: 35, ty: 15, maxHp: 12, ac: 13, atk: 4, dmg: "1d6+2", move: 6, dex: 3, small: true, cls: "Arqueira goblin · aliada", ranged: { range: 8, dmg: "1d6+2", name: "Flecha", pal: PAL.wood } });
  for (const a of [gorza, murta]) { G.fx.spawn(FX.poof, { x: a.x, y: a.y }); a.dir = 2; }
  for (const k of ["gorza1", "murta1"]) if (cast[k]) cast[k].gone = true;
  G.party.push(gorza, murta);
  C.order.splice(C.idx + 1, 0, gorza, murta);
  E.partyChanged();
  UI.banner("O clã Dente-de-Musgo");
  await lines([[gorza, "Goblin guarda o rio! Soldado não pediu pra passar!"], [murta, "Murta atira no de capa azul."]]);
}
export async function turnStart(u, C) {
  if (C.group === G.groups.cacadores && F.goblin_pact && C.round >= 2 && !C.alliesIn) { C.alliesIn = true; await goblinsCross(C); }
}

async function courier() {
  const O = cast.odara;
  await scene(async () => {
    O.name = "Odara, a Pena-Cinza"; O.fixed = false;
    E.obj("satchel").hidden = false;
    await lines([
      [O, "(Ela esfrega os pulsos.) Três dias amarrada a uma roda, ouvindo soldado discutir quanto vale uma mão. Vocês demoraram. E vieram. As duas coisas me surpreendem."],
      [O, "L. não está em Vau-de-Cardo porque L. foi \"convidado a descansar\". A Ordem do Véu Sereno o levou há seis dias para o Mosteiro. Com muita gentileza. Eles fazem tudo com muita gentileza."],
      [O, "Ele sabe o que você carrega. Sabia antes de escrever a carta. E é o único vivo que sabe como tirar isso de você sem tirar você junto. (ela olha a sua mão) ...Ou era isso que ele dizia."],
    ]);
    const v = await ask(O, "Perguntem. Eu respondo o que não for me custar a língua.", [
      { label: "Quem é L.?", v: "who" }, { label: "E as trezentas peças?", v: "gold" }, { label: "Ele mentiu para mim.", check: { skill: "Intuição", dc: F.eco_suspicious || G.hero.ecoEyes ? 11 : 14 }, pass: "lie", fail: "nolie" },
    ]);
    if (v === "who") await say(O, "Um velho que decorou mais livros do que a Coroa queimou. A gente o chama de Sabiá. Cego ele não é. Ele só olha para onde ninguém mais olha.");
    if (v === "gold") await say(O, "(Ela ri, curta.) Um terço agora, do meu bolso, que ele me paga depois. O resto quando vocês o tirarem de lá. Ele sempre foi melhor com palavras do que com contas.");
    if (v === "lie") { F.sabia_halftruth = true; await say(O, "(Ela demora.) ...Ele não mentiu. Ele escolheu o que contar. Entre os Lembradores a gente finge que isso é diferente. Perguntem a ele por que a carta dizia \"não escute\". Eu perguntei. Ele mudou de assunto."); }
    if (v === "nolie") await say(O, "Ele pagou adiantado a quem não conhecia por uma coisa que podia matá-lo. Chame do que quiser.");
    G.gold += 100;
    giveItem(ITEMS.seal);
    await say(O, "Cem peças. E isto: o sinete dos Lembradores. No Mosteiro, mostre só a quem perguntar pela Página em Branco. Vão pelo sul do bosque. E não durmam lá, por mais gentil que seja a cama.");
    await say(ARQ(), F.eco_suspicious ? "(só você ouve) Tirar você de mim. Ouviu como ela disse? Como quem tira um espinho. (um silêncio) Eu não sou um espinho. Eu acho." : "(só você ouve) Um homem que sabe como me tirar de você. Que interessante. Eu gostaria muito de conhecê-lo. Você não?");
    F.ch1_done = true;
    for (const p of G.party) if (!p.ai && p.level < 3) G.hooks.gainXp(p, p.nextXp - p.xp);
    remember("odara", "Odara, a Pena-Cinza, esfregando os pulsos: \"L. foi convidado a descansar.\"");
    UI.updateQuest();
  });
  await E.sleep(1500);
  chapterEnd();
}
function chapterEnd() {
  const rows = [
    ["Rosalva", F.rosalva_lembradora ? "mostrou a você o livro de nomes." : "guardou o recado de L., e o segredo dela."],
    ["O Eco", !F.eco_trade ? "ainda não pediu nada." : F.eco_trade === "refused" ? "pediu uma lembrança. Você disse não." : "recebeu uma lembrança. Há uma linha em branco no Diário."],
    ["Iara e Beni", { paid: "devem a você três luas.", talked: "ficaram livres do Coletor, por ora.", scared: "viram um Coletor recuar.", forgot: "moram na mesma tenda. Ela é muito gentil com o menino." }[F.iara] ?? "não cruzaram o seu caminho."],
    ["Nix", F.nix_joined ? { nix: "ficou com a Lume, e veio junto.", people: "viu a Lume voltar para casa, e veio junto.", keep: "veio junto, de olho no que é dela." }[F.lume_done] : "continua no mercado, avaliando maçãs."],
    ["A procissão", { passed: "seguiu para a Bruma.", freed: "ficou parada na estrada, sem fila para seguir.", smoke: "lembrou, por um instante, de um rio.", fight: "acabou na estrada." }[F.proc] ?? "não foi encontrada."],
    ["Murta", F.goblin_pact ? "guarda o vau com o clã, e quer buscar a Avó." : F.avo_dead ? (F.murta === "spared" ? "baixou o arco. Não perdoou." : F.murta === "fought" ? "fugiu ferida, com o capuz da Avó." : "ainda espera nos juncos.") : F.clan === "scared" ? (F.murta_softened ? "ouviu um pedido de desculpas." : "cobrou o que achou que lhe deviam.") : "não apareceu.",],
    ["Os caçadores da Coroa", { sneaked: "nunca souberam quem passou.", talked: "foram embora com uma dúvida.", fight: "foram vencidos no vau.", won: "foram vencidos no vau." }[F.hunters] ?? "..."],
  ];
  const el = document.getElementById("endscreen");
  el.innerHTML = `<div class="box fr fr-panel"><h1>Fim do capítulo</h1><h2>Ato I · A Marca de Cardo</h2>
    <h3>O que a fronteira vai lembrar</h3><dl>${rows.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join("")}</dl>
    <p class="muted" style="margin-top:8rem">Nível ${G.hero.level} · ${G.gold} peças de ouro · O caminho para o Mosteiro do Véu Sereno sai da estrada, a leste, pelo sul do bosque.</p>
    <div class="row"><button class="go" data-default id="toMonastery">Seguir para o Mosteiro</button><button id="keepPlaying">Continuar explorando</button></div></div>`;
  el.classList.remove("hidden");
  G.paused = true;
  el.querySelector("#keepPlaying").onclick = () => { el.classList.add("hidden"); G.paused = false; };
  el.querySelector("#toMonastery").onclick = () => { el.classList.add("hidden"); G.paused = false; CH2.begin(); };
  focusDefault(el, true);
}

export function onCombatEnd(group) {
  const W = G.W;
  if (inCh2()) return CH2.onCombatEnd(group);
  for (const p of G.party) p.forgetWard = p.build ? !!p.wfx?.forgetWard : false;
  if (group === W.groups.procissao) {
    group.passive = true;
    soon(() => scene(async () => {
      await say(null, F.proc === "smoke" ? "A monja cai sentada na estrada, de mãos vazias. Os três de olhos brancos ficam de pé em volta do resto da fumaça, sem atacar, respirando fundo, como gente que sente cheiro de casa." : "A estrada fica em silêncio. Os de olhos brancos caem sem um som, e sem raiva nenhuma. Um deles ainda mexe as mãos.");
      if (mateIs("lyra")) await say(G.mate, "Eles não se defenderam. Você reparou? Só ela.");
      UI.updateQuest();
    }), 1200);
  }
  if (group === W.groups.murta) {
    group.passive = true;
    soon(() => scene(() => say(null, "Murta não cai: recua para dentro dos juncos, mancando, com o capuz vermelho apertado contra o peito. Ela olha para você uma última vez. Não é mais a sua cara que ela decora. É o seu caminho.")), 1200);
  }
  if (group === W.groups.cacadores) {
    group.passive = true;
    F.hunters = "won";
    const allies = G.party.filter((p) => p.ai);
    soon(() => scene(async () => {
      if (allies.length) {
        await say(allies[0], "Humano briga bem. Goblin volta pro rio. Peixe não se pesca sozinho.");
        G.party = G.party.filter((p) => !p.ai);
        for (const a of allies) { a.team = "npc"; W.npcs.push(a); E.walk(a, TRAV.watch[0], TRAV.watch[1] + 1, 100); }
        E.partyChanged();
      }
      giveItem(gearItem("shield", "escudo"));
      UI.toast("Dos soldados: Escudo de madeira", 2600);
      UI.updateQuest();
    }), 1400);
  }
}

// ---------------------------------------------------------------- what's clickable, per map
export function interactables() {
  const out = [], W = G.W;
  const at = (tx, ty, name, act, extra = {}) => out.push({ x: tx * TILE + 16, y: ty * TILE + 26, name, r: 16, act, ...extra });
  if (W.id === "vau") {
    at(...VAU.board, "Quadro de avisos", boardLook, { h: 36 });
    at(...VAU.strongbox, "Cofre do comandante", strongbox, { h: 20 });
    at(...VAU.well, "Poço", () => say(null, "No fundo, uma lua pequena e um balde. Alguém riscou nomes na pedra da borda, um por cima do outro: os de quem chegou do norte e quis deixar escrito que chegou."), { h: 30 });
    at(9, 4, "Placa: O Sabiá Cego", () => say(null, "Um sabiá de madeira com uma venda no olho. Embaixo, em letra miúda: \"Aqui ninguém viu nada. Mas todo mundo anotou.\""), { h: 44 });
  }
  if (inCh2()) return CH2.interactables();
  if (W.id === "travessia") {
    at(...TRAV.shrine, "Santuário de Nhara", shrine, { h: 34 });
    if (F.ch1_done) at(47, 15, "Trilha pelo sul do bosque (Mosteiro)", () => CH2.begin(), { reach: 70, h: 30 });
    const s = E.obj("satchel");
    if (!s.hidden && !F.satchel) out.push({ x: s.x, y: s.y, name: "Bolsa da mensageira", r: 14, act: satchel });
  }
  return out;
}
async function shrine() {
  await scene(async () => {
    await say(null, "Uma pedra entalhada com uma concha: Nhara, Senhora das Marés, que cuida de quem atravessa. Há uma vela acesa. Alguém passou aqui hoje.");
    if (F.shrine) return;
    const v = await ask(null, "No degrau, um prato com três moedas e um anzol.", [
      { label: "Deixar uma moeda.", tag: "1 de ouro", if: () => G.gold >= 1, v: "give" },
      { label: "Pegar as moedas.", v: "take" },
      { label: "Seguir viagem.", v: "no" },
    ]);
    if (v === "give") { F.shrine = "gave"; G.gold -= 1; for (const p of G.party) p.hp = p.maxHp; UI.toast("O grupo se sente descansado."); sfx.rest(); if (F.maren_aboard && F.maren_lucid) await say(null, "Você pensa em Maren, que jura por essa deusa a cada frase. A água do vau parece um pouco mais rasa."); }
    if (v === "take") { F.shrine = "took"; G.gold += 3; approve("kael", -1); approve("lyra", -1); }
  });
}
async function satchel() {
  F.satchel = true;
  E.obj("satchel").hidden = true;
  G.potions += 2;
  await scene(() => say(null, "Dentro da bolsa: duas poções embrulhadas em pano, um caderno de capa cinza cheio de nomes de aldeias, cada um com uma data e a palavra \"apagada\". A última página diz só: \"Vau-de-Cardo — ainda não\"."));
  UI.toast("+2 poções");
}

// ---------------------------------------------------------------- per-frame
export function update(dt) {
  const W = G.W, l = lead();
  if (!l || G.mode !== "explore") return;
  if (inCh2()) return CH2.update(dt);
  const [tx, ty] = tileNow(l);
  if (W.id === "vau") {
    if (tx >= 41 && ty >= 11 && ty <= 14) gateScene();
    if (!F.tribute_seen && near(l, 6, 19, 3.2)) { F.tribute_seen = true; tribute(); }
    if (near(l, ...VAU.fire, 3)) hint("rest");
  }
  if (W.id === "travessia") {
    if (tx <= 0) scene(async () => { await UI.fade(1, 500); E.loadMap("vau", 39, 12, 1); await UI.fade(0, 600); });
    if (!F.proc && near(l, 14, 14, 5.5)) procession();
    if (tx >= 23 && tx <= 27 && ty >= 12 && ty <= 17) {
      if (G.groups.murta && !F.ambush) murtaAmbush();
      else if (cast.murta1 && F.clan === "scared" && !F.toll && !F.goblin_pact) murtaToll();
    }
    if (!F.hunters && tx >= 35) hunters();
    if (F.ch1_done && tx >= 48) CH2.begin(); // the way south of the woods, to the Monastery
  }
}

// ---------------------------------------------------------------- the Bruma, at the edge of the road
export const hasFog = () => (inCh2() ? CH2.hasFog() : G.W.id === "travessia");
export function fogAt(x, y) {
  if (inCh2()) return CH2.fogAt(x, y);
  return G.W.id === "travessia" ? clamp((4.5 * TILE - y) / (3.5 * TILE)) * 0.85 : 0;
}
