// Act I, chapter two: "O Véu Sereno" (docs/historia.md §7). South through the woods, as Odara said, to the Monastery
// of the Serene Veil: orphans in white, a garden of pale tea, a Mother who never lies. Hulda is kept calm in a cell
// behind the chapel; L., the Velho Sabiá, was "invited to rest" next door. The Mother talks to the hero, gently and
// almost convincingly. Then the choice of §7: denounce the Monastery to the Crown, attack it, or leave it in peace and
// take only Hulda. What it costs shows up afterwards, never announced (§9).
//
// It runs on the same engine and tools as chapter one (act1.js hands them over), on three maps of its own (maps2.js):
// the chapter-1 maps are not changed, so old saves keep pointing at the right things.
import { G, lead } from "./state.js";
import { TILE, dist, clamp, ramp } from "./util.js";
import { SPECS } from "./art/chars.js";
import * as UI from "./ui.js";
import { sfx } from "./audio.js";
import { FX, PAL } from "./fx.js";
import { gword } from "./rules.js";
import { gearItem } from "./items.js";
import { BOSQ, MOST, CLAU } from "./maps2.js";
import { focusDefault } from "./input.js";
import { nameFn } from "./save/codec.js";

let K, E, F, cast, soon, ask, lines, say, scene, look, reward, giveItem, hasItem, takeItem, remember, approve, later, mateIs, hint;
export function init(kit) {
  K = kit;
  ({ E, F, cast, soon, ask, lines, say, scene, look, reward, giveItem, hasItem, takeItem, remember, approve, later, mateIs, hint } = kit);
}
/** The maps of this chapter: the chapter's functions answer for them. */
export const MAPS = new Set(["bosque", "mosteiro", "claustro"]);

const near = (u, tx, ty, r) => dist(u.x, u.y, tx * TILE + 16, ty * TILE + 26) < r * TILE;
const tileNow = (u) => [Math.floor(u.x / TILE), Math.floor((u.y - 1) / TILE)];
const night = () => G.clock >= 19.5 || G.clock < 6;
const ARQ = () => ({ name: "A Arquivista", portrait: cast.ghost.portrait });
/** Someone in the party (not an ally of a moment): "nix", "hulda", or the companion's key. */
const inParty = (key) => G.party.some((p) => p.key === key && !p.ai);
const mate = () => G.mate;
const kael = () => mateIs("kael");
const HU = () => cast.hulda;
const lostMemory = () => (F.eco_trade && F.eco_trade !== "refused" ? G.memories.find((m) => m.id === F.eco_trade) : null);

const ITEMS = {
  bird: { id: "bird", name: "Passarinho de madeira", icon: "feather", desc: "Um sabiá entalhado em pinho, do tamanho de um polegar, com o bico gasto de tanto ser mordido. Abel fez para a filha." },
  pletter: { id: "pletter", name: "Carta da peregrina", icon: "letter", desc: "Dobrada muitas vezes, nunca aberta.",
    read: "<p><i>Para mim mesma, quando eu chegar:</i></p><p>Você foi ao Mosteiro porque o Bento morreu e você não aguentava mais acordar sabendo. Você escolheu isso. Ninguém te levou.</p><p>Se ao ler isto você não souber quem é o Bento, então deu certo. Seja gentil com quem você ficou.</p><p class='sig'>— Ilsa, de Pedra-Alta</p>" },
  page: { id: "page", name: "Página do registro", icon: "scroll", desc: "Arrancada do livro de nomes do Mosteiro, na caligrafia redonda de uma monja.",
    text: () => `<p><b>DESCANSARAM, PELA GRAÇA DO VÉU</b></p><p>Pedra-Alta, inteira. Quarenta e uma almas. Acompanhadas pela Irmã Dalva.</p><p>Vau-Fundo, dezoito almas. Os cães foram junto.</p>${F.otavio_found ? "<p>Lago Espelhado: <b>Otávio, pescador.</b> Pediu para levar a rede. Foi permitido.</p>" : "<p>Lago Espelhado: um pescador, de nome riscado.</p>"}<p>Próxima lua nova: <b>Vau-de-Cardo</b>. A Madre irá pessoalmente.</p>` },
  sabia: { id: "sabia", name: "Bilhete do Sabiá", icon: "feather", desc: "Escrito às cegas, com as letras subindo pela página.",
    read: "<p>Não leia isto em voz alta. Ela ouve pelos seus ouvidos, mas lê devagar.</p><p>Na lua nova a Madre leva Vau-de-Cardo. Eu vou estar na fila. Vocês também, se forem quem eu acho que são.</p><p>Lá eu conto o resto. Tudo. Prometo. Até lá, guardem a anã: o deus dela ainda serve para alguma coisa.</p><p class='sig'>— L.</p>" },
  key: { id: "key", name: "Chave da cela", icon: "key", desc: "Ferro escuro, com um véu gravado no cabo." },
};

// ---------------------------------------------------------------- the cast
const C2 = (...c) => ramp(...c);
const WHITE = C2("#8a8e9e", "#b4b8c6", "#d8dbe4", "#f4f5f8");
function specs() {
  if (SPECS.odilia) return;
  const H = SPECS.hero;
  const old = C2("#8a5a44", "#c48868", "#e8b490", "#f8d4b4");
  SPECS.odilia = { ...SPECS.cendra, skin: old, hair: C2("#6a6a70", "#9a9aa0", "#c8c8cc", "#eeeef0"), weapon: "none", orb: null, eyes: [90, 110, 130], cape: C2("#c8ccd6", "#dcdfe6", "#eef0f4", "#ffffff"), trim: C2("#6a4410", "#c48a1c", "#f4d050", "#fff0a0") };
  SPECS.veu = { ...SPECS.cendra, cape: null, weapon: "staff", orb: C2("#8a9ab8", "#d0e0ff", "#ffffff", "#ffffff"), veil: true, skin: C2("#6a4430", "#9a6a4a", "#c49068", "#e0b48a") };
  SPECS.corvino = { ...SPECS.veu, big: true, weapon: "mace", orb: null, cape: C2("#5a5e6e", "#7e8292", "#a4a8b6", "#c8ccd8") };
  SPECS.salvia = { ...SPECS.cendra, cape: null, weapon: "none", orb: null, apron: C2("#5a6a6e", "#7e9298", "#a8bcc0", "#d0e2e2"), skin: C2("#5e3e24", "#8e6440", "#b8885c", "#d8ac7c"), hair: WHITE };
  SPECS.clara = { ...SPECS.cendra, cape: null, weapon: "none", orb: null, skin: C2("#9a6a5a", "#d8a088", "#f4cdb0", "#ffe6d0"), eyes: [60, 120, 70] };
  SPECS.joana = { ...SPECS.salvia, small: false, stout: true, skin: C2("#7a4630", "#a86a48", "#d09468", "#ecb88a"), hairStyle: "bun", hair: C2("#3a2a1a", "#5e4630", "#86684a", "#ae9068") };
  SPECS.tadeu = { ...SPECS.silas, beard: "long", hair: C2("#6a6a70", "#9a9aa0", "#c8c8cc", "#eeeef0"), apron: C2("#3a2a14", "#5e4420", "#86622e", "#aa8440"), skin: old };
  SPECS.sabia = { ...H, hairStyle: "bald", hair: C2("#7a7a80", "#a8a8ae", "#d4d4d8", "#f4f4f6"), beard: "long", robe: true, tunic: C2("#3a3a40", "#56565e", "#74747c", "#94949c"), pants: C2("#3a3a40", "#56565e", "#74747c"), cape: null, weapon: "none", skin: old, eyes: [150, 160, 170], trim: C2("#3a3a40", "#8a8a90", "#c8c8cc", "#e8e8ea") };
  SPECS.abel = { ...H, hair: C2("#3a1a0e", "#7a3216", "#b0521e", "#d8803a"), beard: "long", tunic: C2("#1a2a14", "#2a4220", "#3e5e2c", "#567a3a"), cape: null, weapon: "axe" };
  const kid = (hair, skin) => ({ ...H, small: true, cape: null, weapon: "none", tunic: C2("#8a8678", "#b4b0a2", "#d8d4c6", "#f0eee4"), pants: C2("#8a8678", "#b4b0a2", "#d8d4c6"), hair, skin });
  SPECS.pipa = { ...kid(C2("#3a1a0e", "#7a3216", "#b0521e", "#d8803a"), C2("#9a6a5a", "#d8a088", "#f4cdb0", "#ffe6d0")), hairStyle: "long", femme: true };
  SPECS.orphan = { ...kid(C2("#141016", "#2a2228", "#40343a", "#5a4a4e"), C2("#5e3e24", "#8e6440", "#b8885c", "#d8ac7c")), hairStyle: "short" };
  SPECS.orphan2 = { ...kid(C2("#8a5a1a", "#b8802a", "#dca848", "#f0c868"), C2("#8a4e3a", "#c47e5e", "#eab08a", "#f8d0b0")), hairStyle: "bun", femme: true };
  SPECS.ilsa = { ...SPECS.esvaido, femme: true, tunic: C2("#3e3e48", "#585864", "#747482", "#9090a0"), cape: C2("#2e2e36", "#444450", "#5a5a68", "#72727e") };
  SPECS.moth = { creature: "moth", wing: C2("#7e8496", "#a8aec0", "#cdd2de", "#eef0f6"), body: C2("#3e3a40", "#5e5660", "#827a84", "#a69ea8"), spot: C2("#2a4a7a", "#4e86c8", "#9ccaff", "#e8f6ff") };
}
// Hulda Ferrobarba, the last priestess of Ormun (§4): built by the creator's rules, like Kael, Lyra and Nix
const HULDA = { race: "anao", cls: "clerigo", gender: "f", name: "Hulda", base: { FOR: 14, DES: 10, CON: 15, INT: 9, SAB: 15, CAR: 11 },
  look: { skin: 1, hair: 2, style: "bun", beard: "short", eyes: 1, outfit: 4, cape: 5 }, equip: { main: "marteloOrmun", ranged: null, armor: "escamas", shield: null },
  extraSkills: ["História", "Atletismo", "Intimidação"] };

export function populate(W) {
  specs();
  const npc = (spec, def) => { const u = E.unit(spec, { team: "npc", maxHp: 8, ac: 10, ...def }); W.npcs.push(u); if (def.key) cast[def.key] = u; return u; };
  const foe = (spec, def) => { const u = E.unit(spec, { team: "enemy", passive: true, move: 5, dex: 1, ...def }); W.enemies.push(u); if (def.key) cast[def.key] = u; return u; };
  const moth = (tx, ty, key) => foe("moth", { key, name: "Mariposa da Bruma", tx, ty, maxHp: 11, ac: 12, atk: 4, dmg: "1d6+1", move: 6, dex: 3, float: 9, esvaido: true, group: "mariposas", xpValue: 90, dir: 0,
    ranged: { range: 2, dmg: "1d4+2", name: "Pó do esquecimento", pal: PAL.arcane, forget: true } });
  if (W.id === "bosque") {
    npc("abel", { key: "abel", name: "Abel, o lenhador", tx: BOSQ.abel[0], ty: BOSQ.abel[1], dir: 0, talk: abelTree });
    npc("ilsa", { key: "ilsa", name: "Peregrina sentada", tx: BOSQ.pilgrim[0], ty: BOSQ.pilgrim[1], dir: 0, talk: ilsaTalk, gesture: true });
    W.groups = { mariposas: Object.assign([moth(27, 10, "moth1"), moth(31, 11, "moth2"), moth(29, 9, "moth3")], { passive: true }) };
    W.chests.push({ x: 26 * TILE + 16, y: 21 * TILE + 26, open: false, loot: { potions: 1, gold: 12, items: [gearItem("weapon", "machadinha")] }, name: "Caixa de ferramentas do lenhador" });
  }
  if (W.id === "mosteiro") {
    npc("clara", { key: "clara", name: "Irmã Clara", tx: MOST.clara[0], ty: MOST.clara[1], dir: 1, talk: claraTree });
    npc("odilia", { key: "odilia", name: "Madre Odília", tx: MOST.madre[0], ty: MOST.madre[1], dir: 0, talk: odiliaTalk, maxHp: 30 });
    npc("tadeu", { key: "tadeu", name: "Irmão Tadeu", tx: MOST.tadeu[0], ty: MOST.tadeu[1], dir: 3, talk: tadeuTree });
    npc("pipa", { key: "pipa", name: "Menina de branco", tx: 12, ty: 16, dir: 0, small: true, talk: pipaTalk });
    npc("orphan", { key: "tito", name: "Tito", tx: 14, ty: 17, dir: 1, small: true, talk: () => ({ start: { text: "A gente tá brincando de procissão. Quem fica por último tem que esquecer o próprio nome. (ele ri) Eu nunca fico por último.", options: [{ label: "...", to: "end" }] } }) });
    npc("orphan2", { key: "lia", name: "Lia", tx: 11, ty: 18, dir: 2, small: true, talk: () => ({ start: { text: "A Madre penteia o cabelo de todo mundo antes de dormir. Ela nunca puxa. Minha mãe puxava. (pausa) Eu acho que puxava.", options: [{ label: "...", to: "end" }] } }) });
    if (F.silas_doubt) npc("silas", { key: "silas2", name: "Irmão Silas", tx: MOST.kitchen[0] + 1, ty: MOST.kitchen[1] + 1, dir: 1, talk: silasTree });
    // the Monastery's own, for the night someone decides to fight it
    const keeper = (spec, def) => foe(spec, { group: "assalto", hidden: true, ...def });
    W.groups = { assalto: Object.assign([
      keeper("corvino", { key: "corvino", name: "Irmão Corvino", tx: 6, ty: 13, maxHp: 36, ac: 15, atk: 6, dmg: "1d10+3", move: 5, dex: 0, boss: true, xpValue: 300, dir: 1 }),
      keeper("veu", { name: "Irmão do Véu", tx: 7, ty: 16, maxHp: 18, ac: 14, atk: 5, dmg: "1d8+2", xpValue: 120, dir: 1 }),
      keeper("veu", { name: "Irmão do Véu", tx: 6, ty: 18, maxHp: 18, ac: 14, atk: 5, dmg: "1d8+2", xpValue: 120, dir: 1 }),
      keeper("veu", { name: "Irmã do Véu", tx: 8, ty: 12, maxHp: 16, ac: 13, atk: 4, dmg: "1d6+2", dex: 2, xpValue: 120, dir: 1, ranged: { range: 6, dmg: "1d6+2", name: "Toque do Esquecimento", pal: PAL.arcane, forget: true } }),
    ], { passive: true }) };
  }
  if (W.id === "claustro") {
    npc("joana", { key: "joana", name: "Irmã Joana, a cozinheira", tx: 8, ty: 9, dir: 0, talk: joanaTree });
    npc("orphan", { key: "beto", name: "Menino acordado", tx: 18, ty: 10, dir: 0, small: true, talk: betoTalk });
    npc("sabia", { key: "sabia", name: "Velho de cinza", tx: 23, ty: 2, dir: 0, talk: sabiaTalk });
    const hulda = E.companion(HULDA, "hulda", { team: "npc", tx: 4, ty: 2 });
    hulda.dir = 0; hulda.talk = huldaTalk; hulda.label = "Anã adormecida"; hulda.hp = Math.ceil(hulda.maxHp / 2);
    W.npcs.push(hulda); cast.hulda = hulda;
    W.groups = { guardas: Object.assign([
      foe("salvia", { key: "salvia", name: "Irmã Sálvia, a do chá", tx: 27, ty: 5, maxHp: 26, ac: 13, atk: 5, dmg: "1d6+2", dex: 2, boss: true, xpValue: 250, dir: 0, yields: true,
        ranged: { range: 7, dmg: "1d8+2", name: "Chá fervente", pal: PAL.arcane, forget: true } }),
      foe("veu", { key: "veu1", name: "Irmão do Véu", tx: 24, ty: 6, maxHp: 18, ac: 14, atk: 5, dmg: "1d8+2", xpValue: 120, dir: 0 }),
      foe("veu", { key: "veu2", name: "Irmão do Véu", tx: 29, ty: 6, maxHp: 18, ac: 14, atk: 5, dmg: "1d8+2", xpValue: 120, dir: 0 }),
    ], { passive: true }) };
    W.chests.push({ x: 33 * TILE + 16, y: 3 * TILE + 26, open: false, loot: { potions: 2, gold: 25, items: [gearItem("shield", "escudo")] }, name: "Armário dos confiscos" });
  }
}

// ---------------------------------------------------------------- the way there
/** From the Travessia (or the end of chapter one): south of the woods, as Odara said. */
export async function begin() {
  document.getElementById("endscreen").classList.add("hidden");
  G.paused = false;
  const first = !F.c2;
  await scene(async () => {
    await UI.fade(1, 700);
    F.c2 = true;
    E.buildMap("bosque");
    E.loadMap("bosque", ...BOSQ.west, 2);
    if (first) {
      UI.cine("<h2>Ato I · Capítulo 2</h2><h1>O Véu Sereno</h1>", "title");
      G.clock = Math.max(9, Math.min(G.clock, 11)); G.clockTarget = 16.5;
      await E.sleep(2400);
      UI.cine("");
    }
    await UI.fade(0, 1200);
    UI.banner("Sul do Bosque");
    if (!first) return;
    look(8, 15, 1.5);
    await lines([
      [null, "A estrada do Cardo segue reta para o leste, larga e vigiada. Uma trilha de lenhador desce para o sul, entre carvalhos, e é por ela que vocês vão. Odara disse: pelo sul. Ninguém discutiu."],
      [null, "De vez em quando, amarradas nos galhos à altura dos olhos, fitas brancas. Muitas. Alguém marcou esse caminho para quem não lembra mais o caminho."],
    ]);
    if (kael()) await say(mate(), "Fita branca em galho. Na guerra a gente marcava assim a trilha dos feridos. (ele não toca em nenhuma) Só que os feridos voltavam.");
    else await say(mate(), "Fitas. Em Lethiel a gente amarra uma no pulso de quem vai ser podado, para não se perder no caminho até o bosque sagrado. (ela desvia de uma) Detesto quando os humanos têm a mesma ideia que nós.");
    if (inParty("nix")) await say(cast.nix, "Seda boa, isso. Alguém gasta dinheiro para enfeitar o caminho de quem não vai lembrar do enfeite.");
    await say(ARQ(), "(só você ouve) Um homem que sabe como me tirar de você, e uma casa onde se ensina a esquecer. Que dia, o de hoje.");
    UI.updateQuest();
  });
}
async function toMap(id, tx, ty, dir, after) {
  await scene(async () => {
    await UI.fade(1, 500);
    E.buildMap(id);
    E.loadMap(id, tx, ty, dir);
    await UI.fade(0, 600);
    if (after) await after();
  });
}

// ---------------------------------------------------------------- quests
export function quests({ all } = {}) {
  const out = [], trim = (o) => { const open = o.filter(([, d]) => !d); return all ? o : open.length ? open : o.slice(-1); };
  const o = [["Siga pelo sul do bosque até o Mosteiro do Véu Sereno", !!F.c2_arrived]];
  if (F.c2_arrived) {
    o.push(["Ache a parte do Mosteiro que não se mostra a visitantes", !!F.c2_altar]);
    o.push(["Encontre L.", !!F.c2_sabia]);
    o.push(["Liberte a anã que a Ordem está \"acalmando\"", !!F.hulda_joined]);
  }
  if (F.hulda_joined) o.push(["Decida o que fazer com o Mosteiro", !!F.c2_choice]);
  if (F.ch2_done) o.push(["Continua: o Bosque de Lethiel", false]);
  const notes = [];
  if (F.c2_madre) notes.push({ shaken: "A Madre hesitou. Uma vez. Ela mesma pareceu surpresa.", even: "A Madre ouviu tudo e não mudou de ideia. Você também não. Ela agradeceu a conversa.", swayed: "A Madre falou de paz, e por um momento você não lembrou por que tinha vindo." }[F.c2_madre]);
  if (F.c2_proof) notes.push(F.otavio_found ? "No livro de nomes: \"Otávio, pescador. Pediu para levar a rede.\" Você arrancou a página." : "No livro de nomes, aldeias inteiras que \"descansaram\". Você arrancou a página.");
  if (F.c2_vau_next) notes.push("Próxima lua nova: Vau-de-Cardo. A Madre irá pessoalmente.");
  if (F.c2_sabia) notes.push("L. é o Velho Sabiá. Ele não quis sair: \"Na lua nova eu conto o resto.\"");
  if (F.c2_slept) notes.push("Vocês dormiram no Mosteiro. De manhã, havia uma linha a menos no seu Diário, e ninguém pediu.");
  out.push({ title: F.ch2_done ? "A Procissão Branca" : "O Véu Sereno", objs: trim(o), desc: "L. foi \"convidado a descansar\" no Mosteiro do Véu Sereno. Odara disse: pelo sul do bosque, e não durmam lá.", notes });
  if (F.q_pipa) out.push({ title: "O passarinho de Pipa", side: true,
    objs: trim([["Leve o passarinho de madeira a Pipa, no Mosteiro", !!F.pipa_bird], ["Conte a Abel como está a filha", !!F.pipa]]),
    desc: "Abel, o lenhador, deixou a filha no Mosteiro no inverno, quando não tinha o que pôr na mesa. Quando a visita, ela sorri para ele como se sorri para um estranho.",
    notes: F.pipa === "home" ? ["Pipa voltou para casa, assobiando como sabiá."] : F.pipa === "lie" ? ["Você disse a Abel que ela está feliz. Ela está."] : [] });
  if (!all) return out.filter((q, i) => i === 0 || q.objs.some(([, d]) => !d));
  return out;
}

// ---------------------------------------------------------------- the woods: Abel and his daughter
function abelTree() {
  const A = cast.abel;
  if (F.pipa) return { start: { text: { home: "(Pipa está sentada no toco, assobiando para o passarinho de madeira. Abel não para de olhar para ela.) Ela errou meu nome duas vezes hoje. Eu nunca fui tão feliz de ser chamado errado.", lie: "Feliz. Você disse feliz. Eu fico repetindo a palavra enquanto racho lenha.", bird: "Você deixou o passarinho com ela. Então tem um pedaço de mim lá dentro. Dá pra dormir com isso." }[F.pipa] ?? "...", options: [{ label: "...", to: "end" }] } };
  return {
    start: { text: F.q_pipa ? (F.pipa_bird ? "E então? Ela... pegou o passarinho?" : "O Mosteiro fica no fim da trilha. Você vai ver: as crianças andam de branco. A minha tem o cabelo da cor do meu.") : "(Um homem ruivo, de machado no ombro, olha para vocês e depois para a trilha que vai ao Mosteiro.) Mais gente indo descansar? Vocês não têm cara de quem quer esquecer nada.",
      options: [
        { label: "Quem é você?", to: "who", if: () => !F.q_pipa },
        { label: "Ela pegou. Ela assobiou como sabiá.", if: () => F.pipa_bird && !F.pipa && !F.pipa_follow, do: () => pipaEnd("bird"), to: "end" },
        { label: "Ela está bem. Está feliz lá.", if: () => F.q_pipa && !F.pipa && !F.pipa_follow, do: () => pipaEnd("lie"), to: "end" },
        { label: "O que você sabe do Mosteiro?", to: "monastery", once: true },
        { label: "As fitas brancas na trilha.", to: "ribbons", once: true },
        { label: "Até mais.", to: "end" },
      ] },
    who: { text: "Abel. Lenhador, enquanto tiver bosque. (ele aponta a cabana) Minha mulher morreu no inverno da febre. Eu fiquei com uma menina de oito anos e uma panela vazia. As monjas vieram com pão e com conversa boa.", options: [{ label: "Continuar", to: "who2" }] },
    who2: { text: "Pipa. Eu deixei a Pipa com elas. Vou lá todo domingo. Ela me sorri. É um sorriso educado, de quem recebe visita. (ele mostra um passarinho entalhado) Eu fiz isso pra ela. Ela dormia mordendo o bico. Esqueceu lá em casa.", options: [
      { label: "Eu levo para ela.", do: () => { F.q_pipa = true; giveItem(ITEMS.bird); UI.toast("Na bolsa: Passarinho de madeira", 2400); UI.updateQuest(); }, to: "who3" },
      { label: "Por que você mesmo não leva?", to: "why" },
      { label: "Voltar.", to: "start" },
    ] },
    why: { text: "Porque se eu der e ela me agradecer como se agradece a um estranho, eu não volto mais lá. E se eu não voltar, ela esquece de vez. (ele estende o passarinho) Você, ela não precisa lembrar.", options: [
      { label: "Pegar o passarinho.", do: () => { F.q_pipa = true; giveItem(ITEMS.bird); UI.toast("Na bolsa: Passarinho de madeira", 2400); UI.updateQuest(); }, to: "who3" }, { label: "Voltar.", to: "start" }] },
    who3: { text: "Se ela lembrar, me conta. Se não lembrar... me conta também. Eu prefiro saber.", options: [{ label: "Voltar.", to: "start" }] },
    monastery: { text: "Gente boa. É isso que me dá medo. Gente ruim a gente sabe o que quer. (cospe) À noite sai de lá uma fila de branco, pro norte, cantando. Eu fecho a janela. Uma vez eu contei os que voltaram: nenhum.", options: [{ label: "Voltar.", to: "start" }] },
    ribbons: { text: "Uma fita por aldeia. A monja de lanterna amarra na ida. Ninguém desamarra na volta, que não tem volta. Se você contar as fitas, sabe quantas aldeias o mundo perdeu esse ano.", options: [{ label: "Voltar.", to: "start" }] },
  };
}
function pipaEnd(how) {
  F.pipa = how;
  if (how === "bird") { reward(120, "O passarinho de Pipa"); approve("kael", 1); approve("lyra", 1); }
  if (how === "lie") { reward(60, "O passarinho de Pipa"); approve("kael", -1); }
  UI.updateQuest();
}

// ---------------------------------------------------------------- the woods: the moths and the pilgrim
const ilsaTalk = nameFn("ch2:ilsa", () => {
  if (!F.c2_moths) return { start: { narr: true, text: "Uma mulher de olhos brancos, sentada no chão, segurando uma lanterna acesa no colo. Em volta dela, coisas grandes e pálidas batem asas devagar.", options: [{ label: "...", to: "end" }] } };
  return { start: { narr: true, text: F.c2_moths === "smoke" ? "Ilsa olha para as próprias mãos, como quem procura uma coisa que estava ali. Ela sussurra um nome, \"Bento\", e não sabe de quem é." : "A peregrina continua sentada, com as mãos no colo onde estava a lanterna. Ela não está mais indo a lugar nenhum.", options: [{ label: "...", to: "end" }] } };
});
async function mothsScene() {
  if (F.c2_moths) return;
  F.c2_moths = "met";
  const Mg = G.groups.mariposas, L = E.obj("plantern");
  await scene(async () => {
    look(29, 11, 2);
    await lines([
      [null, "Na clareira, uma mulher de capuz cinza está sentada na grama, com uma lanterna acesa no colo. Os olhos dela são brancos. Ela sorri para nada."],
      [null, "Em volta dela, três mariposas do tamanho de gatos. Brancas, peludas, com duas manchas azuis nas asas que parecem olhos. Elas pousam nos ombros da mulher, uma de cada vez, e bebem alguma coisa do rosto dela que não é sangue."],
    ]);
    if (mateIs("lyra")) await say(mate(), "Mariposas da Bruma. Elas bebem o que está sendo esquecido, enquanto ainda tem gosto. (baixinho) Não olhe para as manchas das asas. É assim que elas entram.");
    else await say(mate(), "Já vi isso no norte. Bicho que segue os Esvaídos como corvo segue exército. Não deixa encostar. Quem leva pó delas na cara esquece o que ia fazer.");
    if (inParty("nix")) await say(cast.nix, "Elas gostam da luz. Toda coisa que come lembrança gosta de luz. Eu sei porque eu também gosto.");
    const v = await ask(null, "A lanterna no colo da peregrina é a única luz da clareira. As mariposas não se afastam dela.", [
      { label: "Pegar a lanterna e levar as mariposas para longe, mata adentro.", check: { skill: ["Sobrevivência", "Natureza"], dc: 12 }, pass: "lured", fail: "fight" },
      { label: "Chegar por trás e apagar a lanterna.", check: { skill: "Furtividade", dc: 13 }, pass: "doused", fail: "fight" },
      { label: "Queimar a fumaça de lembrança.", tag: "Fumaça", if: () => hasItem("smoke"), v: "smoke" },
      { label: "Atacar.", v: "fight" },
    ]);
    F.c2_moths = v;
    if (v === "lured") {
      L.hidden = true;
      await say(null, "Você ergue a lanterna devagar. As três manchas azuis giram junto, como girassóis. Você anda para dentro do mato, longe, até um tronco oco, e deixa a luz lá dentro. Quando volta, a clareira está escura e as mariposas não vieram junto.");
      for (const m of Mg) { m.gone = true; m.hp = 0; }
      reward(150, "As mariposas seguiram a luz");
    } else if (v === "doused") {
      L.light.off = true; L.hidden = true;
      await say(null, "Um sopro. A clareira fica cinza. As mariposas sobem, desorientadas, batem nos galhos, e somem no branco do norte, uma atrás da outra.");
      for (const m of Mg) { m.gone = true; m.hp = 0; }
      reward(150, "No escuro, ninguém bebe");
    } else if (v === "smoke") {
      takeItem("smoke"); F.smoke_used2 = true;
      G.fx.spawn(FX.bloom, { x: lead().x, y: lead().y, palette: PAL.ember });
      await lines([
        [null, "A fumaça cheira a roupa de criança. As mariposas recuam como se tivessem se queimado: o que é lembrado não tem gosto para elas. Elas fogem para o norte."],
        [cast.ilsa, "...Bento. (a mulher pisca) Bento. Quem... (os olhos continuam brancos, mas ela segura o nome com as duas mãos)"],
      ]);
      for (const m of Mg) { m.gone = true; m.hp = 0; }
      reward(180, "Um nome na fumaça");
    } else {
      F.c2_moths = "fight";
      for (const m of Mg) m.passive = false;
      Mg.passive = false;
      if (v === "fight") await say(null, "As três manchas azuis se viram para você ao mesmo tempo.");
      E.fight(Mg);
    }
    UI.updateQuest();
  });
}
async function pilgrimBag() {
  F.c2_pbag = true;
  E.obj("pbag").hidden = true;
  G.potions += 1;
  giveItem(ITEMS.pletter);
  await scene(() => say(null, "Na bolsa da peregrina: um pão duro, uma poção embrulhada num pano, e uma carta dobrada muitas vezes, endereçada \"para mim mesma, quando eu chegar\". O lacre nunca foi quebrado."));
  UI.toast("+1 poção · Carta da peregrina");
}

// ---------------------------------------------------------------- the Monastery: arrival, Clara, the tea
async function arrive() {
  F.c2_arrived = true;
  await scene(async () => {
    look(8, 15, 1.5);
    G.clockTarget = Math.max(G.clock, 18.4);
    await lines([
      [null, "O muro do Mosteiro é branco de cal e baixo o bastante para se ver por cima. Lá dentro, crianças de branco correm em volta de um poço. Um sino toca uma vez, sem pressa. Cheira a pão e a hortelã."],
      [null, "Nada aqui parece perigoso. É a primeira coisa que você nota, e não sai da cabeça."],
      [cast.clara, "Sejam bem-vindos à casa do Véu. Ninguém aqui pergunta de onde vocês vêm. (ela sorri para todos, e por último para a sua mão) A Madre caminha no jardim a essa hora. Ela gosta de conhecer quem chega."],
    ]);
    if (kael()) await say(mate(), "(entre dentes) Bem-vindos, sem pergunta. Os Coletores falam igualzinho. A diferença é que a gente pedia assinatura.");
    else await say(mate(), "(entre dentes) É bonito. Eu odeio que seja bonito.");
    UI.updateQuest();
  });
}
function claraTree() {
  return {
    start: { text: night() ? "A casa dorme cedo. Se quiserem uma cama, a hospedaria está aberta: a gente nunca fecha uma porta para quem está cansado." : "Precisam de alguma coisa? Água do poço, um banco na sombra, uma xícara de chá?",
      options: [
        { label: "Uma xícara de chá.", if: () => !F.c2_tea, to: "tea" },
        { label: "Procuramos um velho que chegou há uns dias. De cinza.", to: "old", once: true },
        { label: "Dizem que há uma anã aqui.", to: "dwarf", once: true },
        { label: "O que tem do outro lado do portão de ferro, ao norte?", to: "north", once: true },
        { label: "Até mais.", to: "end" },
      ] },
    tea: { text: "(Ela serve de um bule branco. O chá é claro como água, e cheira a chuva.) Chá do jardim. A folha cresce perto do muro norte, onde a névoa encosta. Acalma. Ninguém aqui dorme mal.", options: [
      { label: "Beber.", do: () => drinkTea("drank"), to: "drank" },
      { label: "Fingir que bebe, e despejar no canteiro.", check: { skill: "Prestidigitação", dc: 11 }, pass: () => drinkTea("poured"), fail: () => drinkTea("drank"), passTo: "poured", failTo: "drank" },
      { label: "\"Obrigado, não.\"", do: () => { F.c2_tea = "refused"; }, to: "refused" },
    ] },
    drank: { text: "(Ela sorri.) Viu? Às vezes a gente só precisa de um pouco menos de peso. Volte quando quiser mais.", options: [{ label: "...", to: "end" }] },
    poured: { text: "(Ela não vê. O canteiro bebe o chá sem reclamar.) Volte quando quiser mais.", options: [{ label: "...", to: "end" }] },
    refused: { text: "Claro. Ninguém aqui é obrigado a nada. É a primeira regra da casa, e a única.", options: [{ label: "Voltar.", to: "start" }] },
    old: { text: "O irmão Sabiá? Ele está descansando. Chegou muito cansado, coitado. A Madre cuida dele pessoalmente. (o sorriso não muda) Visitas, só com a bênção dela.", options: [{ label: "Voltar.", to: "start" }] },
    dwarf: { text: "A senhora Hulda. (ela suspira) Ela grita com um deus que ninguém lembra, a noite inteira. Assusta as crianças. A Madre achou melhor que ela ficasse num lugar mais quieto, até se acalmar.", options: [{ label: "Voltar.", to: "start" }] },
    north: { text: "O caminho de quem já está pronto. A gente abre o portão quando alguém pede para ir. (ela olha para o portão com carinho) Ninguém nunca pediu para voltar.", options: [{ label: "Voltar.", to: "start" }] },
  };
}
function drinkTea(how) {
  F.c2_tea = how;
  if (how !== "drank") return;
  // the tea doesn't take a memory: it takes the edge off it. The hero is a little slower to care, for a while.
  G.hero.forgotten = true;
  later(0.6, () => { UI.floater(G.hero.x, G.hero.y - 44, "Calmo demais", "info"); }, "cosmetic");
  soon(() => scene(() => say(ARQ(), "(só você ouve, de longe) Que gosto estranho. Parece com... (ela não termina a frase, e você não pergunta)")), 900);
  approve("kael", -1);
}

// ---------------------------------------------------------------- the Mother
/** The Mother's first conversation: long, kind, and a debate the hero can lose. */
async function madreFirst() {
  F.c2_madre_met = true;
  const O = cast.odilia, A = ARQ();
  let won = 0;
  await scene(async () => {
    look(MOST.madre[0], MOST.madre[1], 2);
    E.face(O, lead());
    const sawMark = !hasItem("gloves") || F.c2_slept;
    if (sawMark) F.c2_madre_saw = true;
    await lines([
      [O, "(Uma mulher de branco, de uns sessenta anos, poda a lavanda com uma tesoura pequena. Ela termina o galho antes de se virar.) Vocês vieram pelo sul. Quem vem pelo sul foi avisado de alguma coisa. (ela sorri) Sentem. A lavanda não tem pressa."],
      [O, sawMark ? "(Os olhos dela vão para a sua mão, e ficam.) A folha de prata. Então é você. Eu imaginei alguém mais velho. Ou mais cansado. (ela não estende a mão para tocar) Não tenha medo. Eu não tiro nada de ninguém." : "(Ela olha para as suas luvas, e depois para o seu rosto, como quem lê a capa de um livro.) Luvas no verão. Todo mundo que chega aqui esconde alguma coisa. A gente costuma ajudar a largar."],
      [O, "Eu tive três filhos. Eu sei disso porque tenho uma cicatriz de cada parto e uma carta com três nomes que eu não reconheço. Uma guerra de fronteira levou os três. Eu andei até a Bruma para morrer."],
      [O, "Ela não me matou. Ela me deixou leve. Eu saí sem lembrar deles, e pela primeira vez em anos eu dormi a noite inteira. (ela corta mais um galho) Me diga: isso foi uma maldição ou uma cura?"],
    ]);
    // round one: what grief is for
    const r1 = await ask(O, "Ela espera a resposta de verdade. Não é retórica.", [
      { label: "A dor era o que sobrava do amor. Você jogou fora os dois.", check: { skill: "Persuasão", dc: 14 }, pass: "ok", fail: "no" },
      { label: "Você não escolheu. A Bruma escolheu por você, e você chama de fé.", check: { skill: "Intuição", dc: 13 }, pass: "ok", fail: "no" },
      { label: "Eu não sei.", v: "honest" },
    ]);
    if (r1 === "ok") { won++; await say(O, "(A tesoura para.) ...Os dois. (ela olha para a lavanda por muito tempo) Você fala como quem já perdeu alguém. Ou como quem tem medo de perder."); }
    else if (r1 === "honest") { await say(O, "Ninguém sabe. É a única resposta honesta que eu já ouvi nesse jardim. (ela sorri, e parece mais velha) Obrigada."); won += 0.5; }
    else await say(O, "Você diz isso porque nunca dormiu leve. Eu não te culpo. Ninguém gosta de soltar a corda quando acha que está segurando alguém.");
    // round two: what the hero is made of; it depends on what was given to the Echo
    const lost = lostMemory();
    await say(O, "Me conte uma coisa sua. Quem te ensinou a ser quem você é? Ou o lugar que você chama de casa. Uma coisa só, que você não queira largar.");
    let r2;
    if (lost?.origin) {
      await lines([
        [null, "Você abre a boca para responder. Há um lugar exato onde a resposta deveria estar, e ele está limpo, liso, como uma prateleira de onde tiraram um livro."],
        [null, `No Diário, uma linha riscada. Você sabe que era uma das suas raízes. Você não sabe qual.`],
      ]);
      r2 = await ask(O, "(Ela percebe. Ela é gentil a ponto de não dizer nada por um momento.)", [
        { label: "Eu dei isso a outra pessoa. Por um motivo.", check: { skill: "Persuasão", dc: 16 }, pass: "ok", fail: "no" },
        { label: "Ficar em silêncio.", v: "blank" },
      ]);
      if (r2 !== "ok") { await say(O, "Você já começou. (a voz dela é quase um carinho) Viu como não dói? Você nem sente falta. É só um quarto vazio numa casa grande."); F.c2_blank = true; }
      await say(A, "(só você ouve) Eu guardei. Eu guardo tudo. Não deixe ela te dizer que você perdeu: você me deu.");
    } else {
      r2 = await ask(O, "Ela espera, com a tesoura parada.", [
        { label: lost ? "Contar uma coisa sua. (Uma lembrança que você não deu.)" : "Contar uma lembrança da sua origem, com detalhes.", check: { skill: ["Persuasão", "Atuação"], dc: 13 }, pass: "ok", fail: "no" },
        { label: "Isso é meu. Você não vai saber.", check: { skill: "Intimidação", dc: 14 }, pass: "ok", fail: "no" },
        ...(F.eco_trade === "refused" ? [{ label: "Uma coisa dentro de mim me pediu uma lembrança. Eu disse não. Eu continuo dizendo não.", v: "refused" }] : []),
      ]);
      if (r2 === "refused") { r2 = "ok"; await say(A, "(só você ouve, e a voz dela treme um pouco) ...Você está contando isso para ela. Para ela, e não para mim."); }
    }
    if (r2 === "ok") { won++; await say(O, "(Ela escuta até o fim, de olhos fechados.) Que lindo. E que pesado. Você carrega isso o tempo todo? Os ombros devem doer."); }
    else if (!lost?.origin) await say(O, "(Ela concorda devagar.) Você segura com força. É assim que a gente faz com o que machuca.");
    // round three: the companions, and Otávio
    const ap = G.approval[mate().key] ?? 0;
    if (ap <= -2) await say(mate(), kael() ? "(Kael, de repente, para ela) Eu cobrei lembrança por oito anos. Às vezes a viúva agradecia. (ele não olha para você) Eu nunca soube se ela estava errada." : "(Lyra, de repente) Ela não está errada sobre tudo. Em Lethiel, quem passa pela Poda volta sorrindo. (ela não olha para você) Eu fugi da minha. Às vezes eu me pergunto do quê.");
    const r3 = await ask(O, "A Ordem só acompanha quem está cansado. Nós não arrastamos ninguém. Nós seguramos a lanterna.", [
      ...(F.otavio_found ? [{ label: "Otávio, pescador do Lago Espelhado. Vocês o levaram. A mulher dele ainda espera.", v: "otavio" }] : []),
      { label: "Uma criança que não queria ir também estava cansada?", check: { skill: "Persuasão", dc: ap <= -2 ? 17 : 14 }, pass: "ok", fail: "no" },
      ...(ap >= 2 ? [{ label: `Deixar ${mate().name} responder.`, tag: "Aprovação", check: { skill: ["Persuasão", "Intuição"], dc: 10 }, pass: "mate", fail: "no" }] : []),
      { label: "Talvez a senhora tenha razão.", v: "yield" },
    ]);
    if (r3 === "otavio") {
      won++;
      await lines([[O, "Sim. (sem hesitar) Ele estava no meio da névoa, procurando a rede. Ele estava sofrendo, e agora não sofre."], [O, "A esposa dele sofre. Eu sei. (pela primeira vez, ela abaixa a tesoura) Eu não minto. Eu não sei se isso me faz melhor ou pior."]]);
    } else if (r3 === "mate") {
      won++;
      await say(mate(), kael() ? "Eu bati em mil portas. Nenhuma pessoa cansada abria a porta pra me pedir pra levar a dor. Elas abriam porque tinham medo. A senhora acha que a sua lanterna não dá medo?" : "Eu tenho trezentos e doze anos e lembro de todos. Dói. E é meu. Ninguém tem o direito de segurar a lanterna por mim.");
      await say(O, "(Ela olha para o seu companheiro com respeito.) Você tem bons amigos. Isso ajuda a carregar. Nem todo mundo tem.");
    } else if (r3 === "ok") { won++; await say(O, "(Um silêncio longo.) ...Havia um menino. Na aldeia de Pedra-Alta. Ele não queria soltar a mão da mãe. A mãe já não lembrava dele. (ela fecha os olhos) Eu disse a mim mesma que o levamos para não ficar sozinho."); }
    else if (r3 === "yield") { won -= 1; approve("kael", -1); approve("lyra", -1); }
    else await say(O, "Eu entendo a raiva. A raiva é a última coisa que a memória faz para não ser largada.");
    // how it went
    F.c2_madre = won >= 2.5 ? "shaken" : won >= 1 ? "even" : "swayed";
    if (F.c2_madre === "shaken") {
      await lines([
        [O, "(Ela guarda a tesoura no bolso do avental.) Você me fez lembrar que eu já tive dúvida. Faz anos. Eu tinha esquecido como era. (ela ri, baixo) Não é agradável."],
        [O, "A anã. Hulda. Ela não descansa, e não deixa ninguém descansar. Se vocês quiserem levá-la, levem. Digam à Irmã Sálvia que a Madre permitiu. É verdade, e eu não digo o que não é verdade."],
      ]);
      reward(250, "A Madre hesitou");
    } else if (F.c2_madre === "even") {
      await say(O, "Vocês são bem-vindos aqui, como todos. Há uma cama na hospedaria. Fiquem a noite. (ela se levanta) Amanhã a gente conversa de novo, se ainda houver o que conversar.");
      reward(120, "Uma conversa no jardim");
    } else {
      await lines([
        [O, "(Ela põe a mão no seu ombro, de leve.) Fique a noite. Durma. Não precisa decidir nada hoje. Ninguém aqui decide nada com pressa."],
        [null, "Por um momento, você não lembra por que veio. Só lembra que está cansado. Muito."],
        [A, "(só você ouve, alto, quase gritando) L.! Hulda! Você veio buscar os dois! (mais baixo) Não me faça lembrar por você. Eu não sei se eu vou devolver."],
      ]);
      approve("kael", -1); approve("lyra", -1);
    }
    UI.updateQuest();
  });
}
function odiliaTalk() {
  if (!F.c2_madre_met) { madreFirst(); return null; }
  const O = cast.odilia;
  return {
    start: { text: F.hulda_joined ? "A anã gritava com o deus dela e as crianças não dormiam. Agora ela grita com vocês. (ela sorri) Cada um com o seu fardo." : F.c2_madre === "shaken" ? "Eu ainda estou pensando no que você disse. É estranho pensar em alguma coisa por tanto tempo." : "A lavanda floresce melhor perto do muro norte. Ninguém sabe por quê. Eu acho que eu sei.",
      options: [
        { label: "O que a senhora quer com a minha mão?", if: () => !!F.c2_madre_saw, to: "hand", once: true },
        { label: "E o velho de cinza? O Sabiá?", to: "sabia", once: true },
        { label: "Por que as crianças?", to: "kids", once: true },
        { label: "Posso ver a anã?", if: () => F.c2_madre === "shaken" && !F.hulda_joined, to: "permit" },
        { label: "Até mais.", to: "end" },
      ] },
    hand: { who: O, text: "Paz. Para todo mundo, de uma vez. (ela fala como quem diz a hora) O que você carrega já fez isso uma vez, há mil anos, pela metade. Uma cidade inteira descansou numa noite. Eu gostaria de terminar o que ela começou. Sem guerra, sem dor. Eu não vou tirar à força. Eu nunca tiro à força.", options: [{ label: "Voltar.", to: "start" }] },
    sabia: { who: O, text: "Ele lembra demais. Lembra de tudo o que leu, de tudo o que perdeu, e não dorme. Eu lhe ofereço chá todos os dias. Às vezes ele aceita. (ela ri) Ontem ele recitou para mim, inteira, uma canção de ninar de uma cidade que não existe mais.", options: [{ label: "Voltar.", to: "start" }] },
    kids: { who: O, text: "Porque as crianças da fronteira já perderam tudo, e ninguém quer ficar com elas. A Coroa as \"tributa\". As aldeias não têm pão. Nós temos pão, cama, e ninguém aqui bate em criança. (ela olha o pátio) O que você ofereceria a elas?", options: [{ label: "Voltar.", to: "start" }] },
    permit: { who: O, text: "Diga à Irmã Sálvia que a Madre permitiu. Ela fica na ala atrás da capela. (uma pausa) Você vai precisar encontrar a porta sozinho. Eu permito, mas não ajudo.", options: [{ label: "Voltar.", to: "start" }] },
  };
}

// ---------------------------------------------------------------- the garden: brother Tadeu and the Blank Page
function tadeuTree() {
  return {
    start: { text: F.c2_tadeu ? "Atrás do véu do altar. Terceiro castiçal da esquerda. E não me olhe assim quando passar por mim: eu sou só um velho que cuida de planta." : "(Um monge velho, de barba branca, arranca erva daninha dos canteiros de chá.) Essa folha só cresce onde a névoa encosta. Pálida, macia, e boa pra esquecer. Eu planto há vinte anos e nunca tomei uma xícara.",
      options: [
        { label: "Por que nunca tomou?", to: "why", if: () => !F.c2_tadeu },
        { label: "Mostrar o sinete dos Lembradores.", tag: "Sinete", if: () => !F.c2_tadeu && F.c2_tadeu_asked && hasItem("seal"), do: () => { F.c2_tadeu = true; UI.updateQuest(); }, to: "seal" },
        { label: "Até mais.", to: "end" },
      ] },
    why: { text: "(Ele limpa a terra das mãos devagar.) Porque eu ainda estou lendo uma coisa. Faz vinte anos. (ele baixa a voz) Diga, viajante: você já leu a Página em Branco?", options: [
      { label: "Não. Mas trago uma pena e uma torre.", if: () => hasItem("seal"), do: () => { F.c2_tadeu_asked = true; }, to: "start" },
      { label: "Que página?", do: () => { F.c2_tadeu_asked = true; }, to: "blank" },
    ] },
    blank: { text: "Os três séculos que faltam em todos os livros de história. (ele volta para a erva daninha) Esquece. Coisa de velho.", options: [{ label: "...", to: "end" }] },
    seal: { text: "(Ele olha o sinete por um bom tempo, e depois para os dois lados.) Pena e torre. Faz vinte anos que eu planto chá esperando alguém aparecer com isso. O Sabiá está na Ala do Silêncio, com a anã, atrás da capela. A porta fica atrás do véu do altar: empurre o terceiro castiçal da esquerda.", options: [{ label: "Continuar", to: "seal2" }] },
    seal2: { text: "Quem guarda a ala é a Irmã Sálvia, com dois irmãos de véu. Ela mesma prepara o chá deles na cozinha. (ele sorri sem dentes) A Joana cozinha melhor, mas quem escolhe a chaleira é a Sálvia. Agora vai, antes que alguém veja um jardineiro conversando.", options: [{ label: "...", do: () => { reward(120, "Pena e torre"); }, to: "end" }] },
  };
}

// ---------------------------------------------------------------- Pipa
function pipaTalk() {
  const P = cast.pipa;
  if (F.pipa_follow) return { start: { text: "A gente vai ver meu pai? Eu não lembro a cara dele direito. Mas eu lembro o assobio.", options: [{ label: "...", to: "end" }] } };
  return {
    start: { text: F.pipa_bird ? "(Ela segura o passarinho de madeira com as duas mãos, e morde o bico de vez em quando, sem perceber.)" : "Você tem cara de quem veio de longe. A Madre diz que longe é onde as coisas doem. Eu sou daqui. Eu acho.",
      options: [
        { label: "Mostrar o passarinho de madeira.", tag: "Passarinho", if: () => hasItem("bird") && !F.pipa_bird, to: "bird" },
        { label: "\"Quer ir ver o seu pai?\"", if: () => F.pipa_bird && !F.pipa, check: { skill: "Persuasão", dc: 12 }, pass: () => pipaFollow(), passTo: "come", failTo: "nocome" },
        { label: "Qual é o seu nome?", to: "name", once: true },
        { label: "Até mais.", to: "end" },
      ] },
    name: { text: "Pipa. A Madre disse que é um nome bonito. Ela disse que eu posso trocar, se quiser. Lia trocou. Antes ela era outra coisa.", options: [{ label: "Voltar.", to: "start" }] },
    bird: { text: "(Ela pega o passarinho. Vira na mão. Põe o bico na boca, sem pensar, e morde.) ...Isso é meu. (ela não sabe por que disse isso) Isso é meu! Tinha um homem que fazia assim, ó.", options: [{ label: "Continuar", do: () => birdGiven(), to: "bird2" }] },
    bird2: { text: "(Ela assobia: duas notas, uma alta e uma baixa, como sabiá de manhã.) Ele fazia assim de manhã, pra eu acordar. Ele tinha o cabelo da minha cor. (ela franze a testa) Por que eu não lembrava disso ontem?", options: [{ label: "Voltar.", to: "start" }] },
    come: { text: "(Ela olha para o portão, depois para as outras crianças, depois para o passarinho.) Só pra ver. Depois eu volto. (ela pega a sua mão) Vamos antes do sino.", options: [{ label: "...", to: "end" }] },
    nocome: { text: "A Madre diz que quem sai pelo portão da frente esquece o caminho de volta. (ela aperta o passarinho) Eu não quero esquecer o caminho.", options: [{ label: "Voltar.", to: "start" }] },
  };
}
function birdGiven() {
  F.pipa_bird = true;
  takeItem("bird");
  cast.pipa.name = "Pipa"; cast.pipa.label = null;
  remember("pipa", "Pipa, no pátio do Mosteiro, assobiando duas notas como sabiá de manhã.");
  approve("kael", 1); approve("lyra", 1);
  UI.updateQuest();
}
function pipaFollow() {
  F.pipa_follow = true;
  const P = cast.pipa, W = E.map("mosteiro");
  if (W.npcs.includes(P)) W.npcs.splice(W.npcs.indexOf(P), 1);
  G.followers.push(P);
  E.resetTrail();
  UI.toast("Pipa vem com vocês", 2400);
}

// ---------------------------------------------------------------- Silas, by the kitchen door
function silasTree() {
  return {
    start: { text: F.c2_silas ? "A Sálvia faz a ronda com o chá nas horas pares. Se ela beber do próprio bule, dorme como pedra. Eu nunca disse isso." : "(Irmão Silas, sentado num caixote ao lado da porta da cozinha, descascando batatas.) Vocês vieram. Pela porta da cozinha, como eu pedi. (ele não levanta os olhos) Ninguém olha para a porta da cozinha.",
      options: [
        { label: "Onde está o Sabiá?", to: "where", if: () => !F.c2_silas },
        { label: "Você vem com a gente?", to: "come", once: true },
        { label: "Até mais.", to: "end" },
      ] },
    where: { text: "Na Ala do Silêncio, atrás da capela. Com a anã. A porta é atrás do véu do altar. (ele corta uma batata ao meio) A Irmã Sálvia guarda a ala e prepara o chá dos guardas aqui, nesta cozinha. Se o chá deles estiver forte demais, ninguém vai culpar a cozinheira.", options: [{ label: "Continuar", to: "where2" }] },
    where2: { text: "E há o livro. O livro com os nomes de quem descansou. Fica na ala também. (ele finalmente olha para você) Eu quero que alguém leia esse livro em voz alta, um dia. Não precisa ser hoje.", options: [{ label: "...", do: () => { F.c2_silas = true; reward(100, "Pela porta da cozinha"); UI.updateQuest(); }, to: "end" }] },
    come: { text: "Ainda não. Se eu for, a Madre sabe que alguém de dentro duvidou, e procura os outros. Há outros. (ele volta para as batatas) Na lua nova eu estou na procissão de Vau-de-Cardo. Do lado de quem eu estiver, até lá.", options: [{ label: "Voltar.", do: () => { F.silas_promise = true; }, to: "start" }] },
  };
}

// ---------------------------------------------------------------- inside: the kitchen, the dormitory
function joanaTree() {
  return {
    start: { text: "Fome? Sempre tem pão. A Madre diz que ninguém esquece de comer, nem os que esquecem de tudo. (ela ri) É verdade. Eu já vi.",
      options: [
        { label: "Para quem é aquela chaleira separada?", to: "kettle", once: true },
        { label: "Um pedaço de pão.", to: "bread", once: true },
        { label: "Até mais.", to: "end" },
      ] },
    kettle: { text: "Da Irmã Sálvia. Ela mesma prepara, pra ronda da noite. Forte que nem cavalo. (ela baixa a voz) Uma xícara daquilo e eu esqueço onde guardei o sal por uma semana.", options: [{ label: "Voltar.", to: "start" }] },
    bread: { text: "(Ela embrulha um pão ainda quente num pano.) Leva. A fome não pergunta de que lado você está.", options: [{ label: "Voltar.", do: () => { G.potions += 0; for (const p of G.party) p.hp = Math.min(p.maxHp, p.hp + 4); UI.toast("O grupo come. +4 PV"); }, to: "start" }] },
  };
}
async function kettle() {
  if (F.c2_tea_swapped) return say(null, "A chaleira da ronda descansa na borda do fogo, cheia do chá que a Sálvia preparou para os guardas. Agora ele está forte. Muito forte.");
  await scene(async () => {
    const nix = inParty("nix");
    const v = await ask(null, "Duas chaleiras na borda do fogo. Uma grande, para a casa. Uma pequena, de tampa amarrada com fita branca: a da ronda da Ala. Ao lado, um saco de folhas pálidas, das fortes.", [
      ...(nix ? [{ label: "Deixar Nix cuidar disso.", tag: "Nix", v: "nix" }] : []),
      { label: "Pôr um punhado das folhas fortes na chaleira da ronda.", check: { skill: ["Prestidigitação", "Furtividade"], dc: 12 }, pass: "ok", fail: "bad" },
      { label: "Deixar como está.", v: "no" },
    ]);
    if (v === "nix") { await say(cast.nix, "(Ela nem olha para as mãos. A tampa sobe, as folhas caem, a fita volta para o lugar, e ela já está mordendo um pão.) Feira das Lembranças. Primeira coisa que se aprende é o que vai na xícara de quem."); }
    if (v === "ok" || v === "nix") { F.c2_tea_swapped = true; reward(80, "O chá da ronda"); }
    if (v === "bad") await say(cast.joana, "Ei! Essa é da Sálvia! (ela tira a chaleira das suas mãos sem raiva nenhuma) Ninguém mexe na chaleira da Sálvia. Nem a Madre.");
  });
}
function betoTalk() {
  return { start: { text: night() ? "(Um menino sentado na cama, de olhos bem abertos.) Eu não bebo o chá. Eu cuspo no penico. Aí eu ouço a anã cantando atrás da parede da capela. Ela canta com raiva. Eu gosto." : "Eu não gosto de dormir de dia. Mas aqui todo mundo dorme de dia. Eu fico contando as camas. Tinha mais ontem.", options: [{ label: "...", to: "end" }] } };
}

// ---------------------------------------------------------------- the chapel and the hidden wing
async function altar() {
  if (F.c2_altar) return say(null, "O véu grande do altar, puxado de lado. Atrás dele, uma porta estreita na parede de cal.");
  await scene(async () => {
    if (F.c2_tadeu || F.c2_silas) {
      await say(null, "Atrás do véu, uma fileira de castiçais de ferro presos à parede. Você empurra o terceiro da esquerda. Uma parte da parede de cal cede um palmo, sem barulho nenhum.");
      revealDoor();
      return;
    }
    const v = await ask(null, "O altar está coberto por um véu grande, branco, bordado com um olho fechado. A capela está vazia. Uma corrente de ar faz o véu se mexer, de leve, e não há janela aberta.", [
      { label: "Procurar de onde vem o ar.", check: { skill: ["Investigação", "Percepção"], dc: 14 }, pass: "ok", fail: "bad" },
      { label: "Deixar o altar em paz.", v: "no" },
    ]);
    if (v === "ok") { await say(null, "O ar vem de trás do véu, da parede. Entre os castiçais, um está gasto onde a mão segura, só ele. Você empurra. A parede cede."); revealDoor(); }
    if (v === "bad") await say(null, "Velas, cal, um véu bordado. Se há alguma coisa aqui, ela não quer ser achada por você, hoje.");
  });
}
function revealDoor() {
  F.c2_altar = true;
  const W = E.map("claustro"), d = E.obj("hdoor", W), c = E.obj("curtain", W);
  d.hidden = false; c.hidden = true;
  W.setBlock(...CLAU.hidden, false);
  G.fx.spawn(FX.poof, { x: d.x + 16, y: d.y - 8 });
  sfx.chest();
  reward(100, "A porta atrás do véu");
  UI.updateQuest();
}
async function guards() {
  if (F.c2_guards) return;
  F.c2_guards = "met";
  const Gg = G.groups.guardas, S = cast.salvia;
  await scene(async () => {
    look(26, 5, 2);
    await lines([
      [null, "Um corredor estreito, de cal, sem janelas, com velas em nichos. Cheira forte a chá. Nas portas, de um lado e do outro, grades."],
      [S, F.c2_tea_swapped ? "(Uma monja de avental, sentada, segurando uma xícara com as duas mãos. Os dois irmãos de véu ao lado dela piscam devagar.) Quem... a ala é fechada. Fechada para... (ela boceja)" : "(Uma monja de avental, de pé, com uma bandeja de xícaras. Dois irmãos de véu se viram para a porta ao mesmo tempo.) A ala é fechada. Vocês se perderam, filhos. Eu levo vocês de volta."],
    ]);
    const v = await ask(S, F.c2_tea_swapped ? "Os três estão quase dormindo em pé." : "Ela não grita. Ela sorri e estende uma xícara.", [
      ...(F.c2_tea_swapped ? [{ label: "Esperar.", v: "sleep" }] : []),
      ...(F.c2_madre === "shaken" ? [{ label: "A Madre permitiu que levássemos a anã.", v: "permit" }] : []),
      ...(F.c2_silas ? [{ label: "O Irmão Silas manda dizer que a Madre chama na capela.", check: { skill: "Enganação", dc: 11 }, pass: "silas", fail: "fight" }] : []),
      { label: "A Madre nos mandou ver o velho. Ela quer saber se ele bebeu o chá.", check: { skill: "Enganação", dc: 15 }, pass: "talk", fail: "fight" },
      { label: "Aceitar a xícara, e jogar o chá na cara dela.", v: "fight" },
    ]);
    F.c2_guards = v;
    if (v === "sleep") {
      await say(null, "Você conta até trinta. A Irmã Sálvia encosta a cabeça na parede. Um irmão de véu escorrega devagar até sentar no chão. O outro dorme em pé, como cavalo. A chave da cela está pendurada no avental dela.");
      for (const e of Gg) { e.sleeping = true; e.dir = 0; }
      giveItem(ITEMS.key);
      reward(200, "Bebam do próprio chá");
    } else if (v === "permit") {
      await lines([[S, "(Ela fica muito quieta.) A Madre não mente. (ela tira a chave do avental e põe na sua mão sem encostar em você) Ela não mente, mas às vezes ela se engana. Leve a anã. E não volte."]]);
      giveItem(ITEMS.key);
      reward(200, "A Madre não mente");
    } else if (v === "silas" || v === "talk") {
      await say(S, v === "silas" ? "A Madre? Agora? (ela larga a bandeja) Fiquem aqui, e não toquem em nada. (os três saem pelo corredor, apressados)" : "(Ela aperta os olhos, e depois desiste de desconfiar: desconfiar dá trabalho.) O velho bebeu meia xícara. Diga isso a ela. (ela volta a arrumar as xícaras, de costas para vocês)");
      if (v === "silas") for (const e of Gg) { e.passive = true; E.walk(e, 26, 7, 60).then(() => { e.gone = true; e.hp = 0; }); }
      reward(200, v === "silas" ? "Pelo corredor, apressados" : "Meia xícara");
    } else {
      F.c2_guards = "fight";
      await say(S, "(Ela suspira, como quem vai limpar uma sujeira.) Então vocês vão dormir do jeito difícil.");
      for (const e of Gg) e.passive = false;
      Gg.passive = false;
      E.fight(Gg);
    }
    UI.updateQuest();
  });
}

// ---------------------------------------------------------------- Hulda
function huldaTalk() {
  if (F.hulda_joined) return null;
  if (!F.hulda_free) return { start: { narr: true, text: "Atrás das grades, uma anã ruiva de barba trançada, deitada numa cama estreita. Ela respira fundo e devagar. De vez em quando, resmunga dormindo: \"...não é hora de cair pedra, seu velho surdo...\"", options: [{ label: "...", to: "end" }] } };
  huldaWakes();
  return null;
}
async function bars() {
  if (F.hulda_free) return;
  const b = E.obj("bars");
  await scene(async () => {
    const opts = [
      ...(hasItem("key") ? [{ label: "Usar a chave da cela.", tag: "Chave", v: "key" }] : []),
      ...(inParty("nix") ? [{ label: "Deixar Nix abrir.", tag: "Nix", v: "nix" }] : []),
      { label: "Abrir a fechadura com um arame.", check: { skill: "Prestidigitação", dc: 14 }, pass: "pick", fail: "bad" },
      { label: "Forçar as grades.", check: { skill: "Atletismo", dc: 16 }, pass: "force", fail: "bad" },
      { label: "Deixar para depois.", v: "no" },
    ];
    const v = await ask(null, "Uma porta de grades, com um cadeado grande. Do outro lado, a anã ronca.", opts);
    if (v === "no" || v == null) return;
    if (v === "bad") { await say(null, "O ferro não cede. A anã, do outro lado, resmunga dormindo: \"...mais força, criatura...\""); return; }
    if (v === "nix") await say(cast.nix, "(Ela se agacha, sopra a fechadura, e a porta abre.) Cadeado de mosteiro. Feito por gente que acha que ninguém quer entrar.");
    if (v === "force") await say(null, "Você apoia o pé na parede e puxa. O ferro reclama, entorta, e solta da pedra com um estalo que ecoa pela ala inteira.");
    F.hulda_free = v;
    b.open = true; E.refresh(b);
    E.map("claustro").setBlock(...CLAU.bars, false);
    sfx.chest();
    await huldaWakes();
  });
}
async function huldaWakes() {
  if (F.hulda_joined) return;
  const Hd = HU(), A = ARQ();
  await scene(async () => {
    look(4, 2, 2);
    await lines([
      [null, "A anã está deitada de costas, com as mãos cruzadas no peito, como uma estátua de túmulo. Uma xícara vazia no chão. Ela sorri dormindo. É um sorriso que não combina com a barba."],
    ]);
    const v = await ask(null, "Ela respira devagar demais. O chá ainda está nela.", [
      { label: "Examinar a respiração e o pulso, e acordá-la direito.", check: { skill: "Medicina", dc: 12 }, pass: "med", fail: "slow" },
      { label: "Queimar a fumaça de lembrança.", tag: "Fumaça", if: () => hasItem("smoke"), v: "smoke" },
      { label: "Perguntar, bem alto, o nome do deus dela.", v: "ormun" },
    ]);
    if (v === "smoke") { takeItem("smoke"); G.fx.spawn(FX.bloom, { x: Hd.x, y: Hd.y, palette: PAL.ember }); }
    if (v === "ormun") {
      await lines([
        [Hd, "(Os olhos se abrem de uma vez.) ORMUN. O nome é Ormun. O que Guarda as Pedras. Quem pergunta? (ela senta) E por que eu estou de camisola?"],
        [null, "Um pedrisco cai do teto e quica na testa dela. Ela olha para cima, ofendida."],
        [Hd, "Agora ele aparece. Três semanas eu rezando nessa cela, e ele escolhe o dia em que eu tenho visita."],
      ]);
    } else if (v === "slow") {
      await lines([[null, "Você sacode, chama, belisca. Leva um bom tempo. Quando ela acorda, acorda brigando."], [Hd, "Mais um beliscão e eu te ensino o que é pedra. (ela pisca) ...Você não é monja. Graças a Ormun, você não é monja."]]);
    } else {
      await lines([[Hd, "(Ela tosse, cospe alguma coisa clara no chão, e senta de uma vez.) Que gosto de nuvem molhada. Três semanas me dando nuvem molhada de café da manhã."]]);
    }
    await lines([
      [Hd, "Hulda Ferrobarba. Sacerdotisa de Ormun, o que Guarda as Pedras, o que Lembra os Juramentos. Última sacerdotisa, se você quer saber, e todo mundo quer, e todo mundo faz essa cara."],
      [Hd, "Eu vim aqui gritar com a Madre. Ela me ofereceu chá. Eu gritei mais. Ela me ofereceu mais chá. (ela coça a barba) No fim o chá ganhou. Chá é teimoso."],
      [Hd, "(ela olha a sua mão, sem cerimônia) Ah. Uma marca de prata. Ormun detesta coisa que pede lembrança em troca de favor. Ele também detesta segunda-feira, chuva e gente alta. Ele detesta muita coisa."],
    ]);
    if (kael()) await lines([[mate(), "Uma clériga que briga com o próprio deus. (quase sorri) Finalmente alguém com quem eu concordo."], [Hd, "Você tem cara de quem já cobrou imposto, rapaz. Eu reconheço o andar."]]);
    else await lines([[mate(), "Ormun. Eu li sobre ele numa biblioteca que não existe mais. Achei que já não tinha ninguém."], [Hd, "Tem eu. Eu sou ninguém com barba. (ela olha Lyra de cima a baixo) Elfa. Vocês esqueceram ele primeiro. Eu ainda não perdoei."]]);
    if (inParty("nix")) await lines([[cast.nix, "Uma deusa quase esquecida, numa cela, com uma única fiel. Na Feira isso valeria uma fortuna. Um lote raro."], [Hd, "Encosta na minha fé e eu te enterro de pé, tiferina. (pausa) Depois a gente conversa de preço."]]);
    await say(A, "(só você ouve) Ela não gosta de mim. Ninguém que reza para pedra gosta de mim. (uma pausa) Pedras lembram de tudo, sabia? Elas só não contam.");
    await huldaJoins(v);
  });
}
async function huldaJoins(how) {
  const Hd = HU(), W = E.map("claustro");
  F.hulda_joined = true;
  Hd.team = "party"; Hd.talk = null; Hd.label = null;
  if (W.npcs.includes(Hd)) W.npcs.splice(W.npcs.indexOf(Hd), 1);
  while (Hd.level < G.hero.level) G.hooks.gainXp(Hd, Hd.nextXp - Hd.xp);
  Hd.hp = how === "slow" ? Math.ceil(Hd.maxHp / 2) : Hd.maxHp;
  G.party.push(Hd);
  E.partyChanged();
  UI.banner("Hulda entrou no grupo");
  sfx.quest();
  remember("hulda", "Hulda acordando numa cela de mosteiro e brigando com Ormun por causa de um pedrisco.");
  await say(Hd, "Meu martelo e minha cota estão no armário do fim do corredor, que a Sálvia chama de \"confiscos\". Eu chamo de roubo. (ela já está vestida, não se sabe como) Pronto. Vamos sair daqui antes que alguém me ofereça chá.");
  reward(250, "Hulda Ferrobarba");
  UI.updateQuest();
}

// ---------------------------------------------------------------- L., and the book of names
function sabiaTalk() {
  if (!F.c2_sabia) { sabiaFirst(); return null; }
  const S = cast.sabia;
  return {
    start: { text: "(O velho está de olhos fechados, mas não está dormindo.) Vão. Na lua nova. A anã, levem. Eu fico com o chá e com a vista da janela.",
      options: [
        { label: "Por que a carta dizia 'não escute'?", if: () => !!F.sabia_halftruth, to: "listen", once: true },
        { label: "Venha com a gente agora.", to: "come", once: true },
        { label: "Até mais.", to: "end" },
      ] },
    listen: { who: S, text: "(Ele abre os olhos. São cinzentos, claros, e enxergam muito bem.) Porque eu escutei, uma vez. E ela foi muito convincente. (ele fecha os olhos de novo) Na lua nova.", options: [{ label: "Voltar.", to: "start" }] },
    come: { who: S, text: "Se eu sair, a Madre muda a data, e eu não vou saber qual é. Aqui dentro eu sei. (ele bate na têmpora) Além do mais, eu sou um velho. Velho que foge cai. Velho que fica, escuta.", options: [{ label: "Voltar.", to: "start" }] },
  };
}
async function sabiaFirst() {
  F.c2_sabia = true;
  const S = cast.sabia, A = ARQ();
  await scene(async () => {
    look(23, 2, 2);
    S.name = "O Velho Sabiá";
    await lines([
      [null, "Um velho magro, careca, de barba branca até o peito, sentado numa cadeira de frente para a janela gradeada. Uma xícara de chá pela metade na mão. Ele não se vira."],
      [S, "Pela respiração, quatro. Não, cinco, um é baixinho. (ele sorri para a janela) E um deles não respira, mas está aqui. (ele finalmente se vira, e olha direto para a sua mão) Olá, Arquivista. Faz tempo."],
      [A, "(só você ouve, e a voz dela é muito fina, muito cuidadosa) ...Eu não conheço esse homem."],
      [S, "Ela diz que não me conhece. Eu sei. Eu também não a conheço. Eu só li sobre ela. Muito. (ele se volta para você) E você é quem aceitou o contrato. Trezentas peças. Eu devo duzentas. Sinto muito por tudo o resto."],
    ]);
    if (inParty("hulda")) await lines([[HU(), "Velho! Três semanas eu ouvindo você roncar pela parede."], [S, "E eu ouvindo a senhora discutir com uma pedra. (ele sorri) A pedra estava ganhando."]]);
    const v = await ask(S, "Ele toma um gole de chá e faz careta.", [
      { label: "Você é L.", v: "l" },
      { label: "O que é isso na minha mão?", v: "what" },
      { label: "Por que você me mandou buscar isso?", v: "why" },
    ]);
    if (v === "l") await say(S, "Sou o que assinou a carta. A Odara me chama de Sabiá porque eu canto cedo e fora de hora. (ele dá de ombros) Nome é coisa que a gente veste.");
    if (v === "what") await say(S, "Uma coisa que lembra. Por isso ela vale tanto: todo mundo hoje em dia quer esquecer, ou fazer esquecer. (ele aponta a sua mão com a xícara) Ela não. Ela quer lembrar. De tudo. É bonito e é terrível, como quase tudo que vale a pena.");
    if (v === "why") await say(S, "Porque ela ia acordar de qualquer jeito, e eu preferia que acordasse na mão de alguém que não fosse a Coroa nem esta casa. (ele olha para a xícara) Eu escolhi você pelo lacre. Quem sonha com a torre atende o chamado da torre. Foi crueldade minha. Desculpe.");
    await lines([
      [S, "Agora escute, e escute rápido, que o chá volta daqui a pouco. Eu não saio daqui. Se eu sair, a Madre muda a data, e eu preciso saber a data."],
      [S, "Na próxima lua nova, ela leva Vau-de-Cardo. A vila inteira, cantando, para dentro da Bruma. Ela vai pessoalmente. Eu vou estar na fila, de branco, com uma xícara na mão. Vocês também vão estar lá."],
      [S, "E lá eu conto o resto. Tudo o que eu sei sobre ela. (ele olha a sua mão) Não aqui. Aqui ela escuta, e eu ainda não sei o que ela faz com o que ouve."],
    ]);
    giveItem(ITEMS.sabia);
    await say(S, "(Ele escreve alguma coisa num papel, sem olhar para a folha, e dobra.) Leia depois. Longe. E levem a anã: o deus dela ainda serve para alguma coisa.");
    await say(A, F.eco_suspicious ? "(só você ouve) Ele sabe o meu nome. O nome que eu não te disse. (silêncio) Você vai perguntar a ele? Eu preferia que você me perguntasse." : "(só você ouve) Ele lê devagar e fala depressa. Eu gosto dele. Eu não confio nele. As duas coisas cabem, você sabe.");
    remember("sabia", "O Velho Sabiá, de costas para você, contando quantos vocês eram pela respiração.");
    reward(200, "O Velho Sabiá");
    UI.updateQuest();
  });
}
async function lectern() {
  if (F.c2_proof) return say(null, "O livro de nomes, aberto. Falta uma página, arrancada rente à costura.");
  await scene(async () => {
    await lines([
      [null, "Um livro grande, aberto num atril. Letra redonda, de monja, em colunas: o nome de uma aldeia, um número, uma data, e embaixo, sempre a mesma frase: \"descansaram, pela graça do Véu\"."],
      [null, "Pedra-Alta, inteira. Vau-Fundo, dezoito almas. Os cães foram junto. Você vira a página. E a outra. Há muitas."],
    ]);
    if (F.otavio_found) await lines([[null, "E então, no meio de uma coluna: \"Lago Espelhado: Otávio, pescador. Pediu para levar a rede. Foi permitido.\""], [mate(), kael() ? "\"Foi permitido.\" (ele lê de novo) Ela permitiu que ele levasse a rede para dentro da Bruma. Que generosa." : "Ele pediu para levar a rede. (a voz dela falha) Então ele ainda sabia o que era uma rede."]]);
    await say(null, "Na última página escrita, com a tinta ainda brilhando: \"Próxima lua nova: Vau-de-Cardo. A Madre irá pessoalmente.\"");
    if (inParty("hulda")) await say(HU(), "Ormun é o deus das coisas gravadas. Juramento, nome, fronteira: o que se escreve na pedra é pra ficar. (ela passa o dedo nas colunas) Isto aqui é o contrário. Escrever um nome pra poder esquecer a pessoa. Ele detestaria. Eu detesto por ele.");
    F.c2_vau_next = true;
    const v = await ask(null, "O livro pesa mais do que parece.", [
      { label: "Arrancar a página com os nomes.", v: "page" },
      ...(inParty("nix") ? [{ label: "Deixar Nix levar o livro inteiro.", tag: "Nix", v: "nix" }] : []),
      { label: "Ler em voz alta os nomes da página, e deixar o livro.", v: "read" },
    ]);
    if (v === "page" || v === "nix") { F.c2_proof = true; const { text, ...page } = ITEMS.page; giveItem({ ...page, read: text() }); }
    if (v === "nix") { F.c2_book = "nix"; await say(cast.nix, "(O livro some dentro da capa rubra como se fosse um lenço.) Arquivo Real, Feira, Lembradores... alguém vai pagar o peso disso em ouro. Ou em vergonha. As duas moedas me servem."); }
    if (v === "read") {
      F.c2_book = "read";
      await say(null, "Você lê os nomes em voz alta, um a um. Leva tempo. Ninguém interrompe. Quando termina, a vela do nicho está mais baixa, e o corredor parece mais quente.");
      remember("names", "Os nomes do livro do Mosteiro, lidos em voz alta, um a um, na Ala do Silêncio.");
      approve("kael", 1); approve("lyra", 1);
      if (F.silas_doubt) F.c2_read_for_silas = true;
    }
    reward(150, "O livro de nomes");
    UI.updateQuest();
  });
}

// ---------------------------------------------------------------- sleeping where you were told not to
async function sleepHere() {
  await scene(async () => {
    const v = await ask(null, "A hospedaria tem camas limpas, de lençol branco, que cheiram a lavanda. Odara disse: não durmam no Mosteiro, por mais gentil que seja a cama.", [
      { label: "Dormir aqui.", v: "yes" },
      { label: "Dormir no bosque, como Odara disse.", v: "no" },
    ]);
    if (v !== "yes") return;
    await UI.fade(1, 900);
    F.c2_slept = true;
    for (const p of G.party) { p.hp = p.maxHp; p.slots = p.maxSlots ?? 0; p.restUsed = {}; }
    sfx.rest();
    UI.cine("<p class='small'>Você dorme sem sonhar. É a primeira noite sem a cidade branca em semanas.</p>");
    await E.sleep(2600);
    UI.cine("");
    // in the night someone came with a cup and a cloth, and took the edge off one memory: not the Echo, the house
    const m = [...G.memories].reverse().find((x) => !x.struck && !x.origin);
    if (m) { m.struck = true; m.lost = m.text; m.by = "cha"; m.text = "— — — — — — — —"; F.c2_tea_memory = m.id; K.refreshJournal(); }
    F.c2_madre_saw = true;
    G.clock = 7.4; G.clockTarget = 10;
    E.loadMap("mosteiro", 6, 21, 0);
    await UI.fade(0, 1200);
    E.partyChanged();
    await lines([
      [null, "Você acorda descansado como não acordava há meses. Há uma xícara vazia na mesinha ao lado da cama. Você não lembra de ter bebido."],
      [null, m ? "No Diário de Lembranças, uma linha riscada que não estava riscada ontem. Não foi a Arquivista: a letra do risco é redonda, de monja." : "O Diário está na mesinha, fechado com cuidado, com a fita no lugar errado."],
      [ARQ(), "(só você ouve, e ela está com raiva, pela primeira vez) Alguém entrou. Alguém mexeu nas minhas prateleiras enquanto você dormia. Com uma xícara e um pano. (um silêncio frio) E ela viu a sua mão. A palma inteira."],
    ]);
    if (kael()) { await say(mate(), "(Kael está sentado na porta, de espada no colo.) Eu fiquei acordado. Eu juro que fiquei acordado. (ele olha a xícara) Eu acho que fiquei."); approve("kael", -1); }
    else { await say(mate(), "(Lyra está de pé na janela, de olhos vermelhos.) Eu sonhei que estava na Poda. Que tinha deixado. Que era bom. (ela fecha a janela com força) Vamos sair daqui."); approve("lyra", -1); }
    if (inParty("hulda")) await say(HU(), "Eu avisei. Avisei? Se eu não avisei, eu estava pensando em avisar. Chá teimoso.");
    UI.updateQuest();
  });
}
export function onRest() {
  if (G.W.id === "bosque" && !F.c2_rested) { F.c2_rested = true; campfire(); }
}
async function campfire() {
  await scene(async () => {
    await lines([[null, "Vocês dormem na clareira dos lenhadores, com o fogo baixo, como Odara disse. O chão é duro. Ninguém traz chá."]]);
    if (kael()) await say(mate(), "(acordado, de madrugada, mexendo nas brasas) A minha filha tinha medo de escuro. Eu deixava a lamparina acesa. Eu lembro disso. (pausa) Eu vou continuar lembrando disso.");
    else await say(mate(), "(de madrugada, olhando o fogo) Em Lethiel, depois da Poda, a gente acende uma fogueira e ninguém fala de nada que aconteceu antes. Eu fugi na véspera. Esta é a primeira fogueira em oitenta anos em que eu falo do antes.");
  });
}

// ---------------------------------------------------------------- the choice of the Monastery (§7)
async function choice() {
  if (F.c2_choice || F.c2_choosing) return;
  F.c2_choosing = true;
  const Hd = HU(), O = cast.odilia;
  try {
    await scene(async () => {
      look(4, 15, 2);
      await lines([
        [null, "No portão, vocês param. Atrás, o pátio, o poço, as crianças de branco brincando de procissão. O sino toca. Ninguém veio atrás de vocês. Ninguém precisa."],
        [Hd, "Bom. Eu estou solta, o velho escolheu ficar, e esta casa continua aqui, servindo chá e levando aldeias para o branco. (ela bate o martelo na palma) Alguém vai dizer o que a gente faz, ou eu decido sozinha?"],
      ]);
      if (kael()) await say(mate(), "A guarnição de Vau-de-Cardo pagaria caro por esse livro. E mandaria cinquenta homens. Eu sei o que cinquenta homens da Coroa fazem num lugar cheio de criança. Eu estava lá, das outras vezes.");
      else await say(mate(), "Se a Coroa souber, ela vem. Com fogo e frasco. As crianças viram Tributo. (ela olha o pátio) E se ninguém souber, na lua nova Vau-de-Cardo inteira vai cantar até a Bruma.");
      if (inParty("nix")) await say(cast.nix, "Tem uma terceira opção, que é a de sempre: a gente vai embora e finge que não viu. Eu sou muito boa nessa.");
      const v = await ask(null, "Atrás de vocês, o Mosteiro do Véu Sereno respira devagar, como quem dorme.", [
        { label: F.c2_proof ? "Mandar a página do registro à guarnição de Vau-de-Cardo. Denunciar à Coroa." : "Contar à guarnição de Vau-de-Cardo o que vimos aqui. Denunciar à Coroa.", v: "crown" },
        { label: "Atacar o Mosteiro agora, nós mesmos.", v: "attack" },
        { label: "Deixar o Mosteiro em paz e levar só Hulda.", v: "peace" },
        { label: "Voltar para dentro, por enquanto.", v: "back" },
      ]);
      if (v === "back" || v == null) { E.place(lead(), 4, 15, 2); return; }
      F.c2_choice = v;
      if (v === "crown") {
        await say(Hd, "A Coroa. (ela fica quieta muito tempo, para uma anã) Ormun gosta de juramento cumprido. Eu jurei acabar com essa casa. Não jurei como. (ela cospe) Não gosto. Vamos.");
        approve("kael", -2); approve("lyra", -1);
      } else if (v === "attack") {
        await say(Hd, "AGORA sim. Ormun gosta de pedra quebrada quando é a pedra certa. (ela já está andando de volta para o pátio)");
        approve("kael", 1); approve("lyra", -1);
        await assault();
        return;
      } else {
        await say(Hd, "Em paz. (ela olha o portão norte) Na lua nova a gente vê quanta paz cabe numa vila. Eu levo isso na conta, viu, Ormun? Na conta.");
        approve("lyra", 1);
      }
      await leave();
    });
  } finally { F.c2_choosing = false; }
}
async function assault() {
  const Ag = G.groups.assalto, O = cast.odilia;
  look(8, 15, 2);
  for (const e of Ag) { e.hidden = false; e.passive = false; G.fx.spawn(FX.poof, { x: e.x, y: e.y }); }
  Ag.passive = false;
  await lines([
    [cast.corvino, "(Um monge enorme, de véu, sai da casa capitular com uma maça de ferro na mão. Atrás dele, mais três.) A Madre disse que talvez fosse hoje. Ela nunca erra. (ele baixa o véu) Crianças, para dentro."],
    [O, "(Da porta da capela, sem levantar a voz.) Corvino, ninguém aqui mata ninguém. Segurem-nos até eu sair. (ela olha para você, sem raiva) Eu vou levar as crianças para onde nada dói. Vocês escolheram o caminho que dói. Que seja leve para vocês também."],
  ]);
  // she leaves by the north gate with the children while the fight goes on
  const g = E.obj("ngate");
  g.open = true; E.refresh(g); E.map("mosteiro").setBlock(19, 3, false); E.map("mosteiro").setBlock(20, 3, false);
  for (const k of ["odilia", "clara", "tito", "lia", ...(F.pipa_follow ? [] : ["pipa"]), "tadeu"]) { const u = cast[k]; if (!u || u.gone) continue; u.passive = true; E.walk(u, 20, 2, 55).then(() => { u.gone = true; }); }
  F.c2_madre_left = true;
  E.fight(Ag);
}
async function leave() {
  await UI.fade(1, 900);
  for (const k of ["silas2"]) if (cast[k]) cast[k].gone = true;
  E.buildMap("bosque");
  G.clock = 6.6; G.clockTarget = 9;
  E.loadMap("bosque", BOSQ.camp[0] - 1, BOSQ.camp[1] + 1, 3);
  E.partyChanged();
  await UI.fade(0, 1400);
  await aftermath();
}
/** The next morning, at the woodcutters' clearing: what the choice cost, shown, never announced. */
async function aftermath() {
  const Hd = HU(), Ab = cast.abel, ch = F.c2_choice;
  look(BOSQ.camp[0], BOSQ.camp[1], 2);
  if (ch === "crown") {
    await lines([
      [null, "Três dias depois, de manhã, a fumaça. Uma coluna grossa, preta, subindo de onde fica o Mosteiro. O vento traz cheiro de palha queimada e, por baixo, de lavanda."],
      [Ab, "(Abel vem correndo pela trilha, de machado na mão, sem fôlego.) Soldados. De capa vermelha. Cinquenta, mais. Chegaram de noite com um papel com selo. Os monges não lutaram. Nenhum. Abriram o portão e ofereceram chá."],
      [Ab, F.pipa_follow ? "As crianças... os soldados levaram as crianças. Em fila. Pra Maralto, disseram, pro Tributo. Uma chorava porque não lembrava o próprio nome, e um soldado disse que lá ela não ia precisar de um. (ele olha para Pipa, e a abraça até ela reclamar)" : "As crianças... os soldados levaram as crianças. Em fila. Pra Maralto, pro Tributo. (a voz dele quebra) A minha tinha o cabelo da minha cor. Eu não sei se ela olhou pra trás. Eu não sei se ela sabia pra quem olhar."],
      [null, "A Madre não estava entre os presos. Nem a Irmã Clara. Ninguém viu quando saíram, nem por onde."],
    ]);
    if (kael()) await say(mate(), "(Kael olha a fumaça sem piscar.) Eu falei. Eu falei o que cinquenta homens fazem. (ele vira as costas) Me deixa sozinho um pouco.");
  } else if (ch === "attack") {
    await lines([
      [null, "De manhã, o Mosteiro está vazio. Os irmãos que ficaram de pé foram embora pela estrada do Cardo, sem olhar para trás. O pátio tem marcas de luta e um balde virado."],
      [null, "O portão norte está aberto. No chão, para lá dele, pegadas pequenas. Muitas. Andando em fila, para dentro do branco. Do lado delas, as de uma mulher adulta, de passo calmo."],
      [Ab, F.pipa_follow ? "(Abel aparece na trilha, segurando Pipa pela mão, sem soltar.) De madrugada eu vi uma fila branca de criança subindo pro norte, cantando. Eu fechei a janela. Depois eu abri. (ele aperta a mão da filha) Depois eu abri." : "(Abel aparece na trilha, sem machado, de mãos vazias.) De madrugada eu vi uma fila branca de criança subindo pro norte, cantando. Uma tinha o cabelo da minha cor. Eu fechei a janela. (ele olha para as próprias mãos) Por que eu fechei a janela?"],
    ]);
    await say(Hd, "(Hulda olha para o norte por muito tempo.) A pedra certa. Eu disse a pedra certa. (baixo) Ormun, você podia ter derrubado um teto na hora certa, só uma vez.");
  } else {
    await lines([
      [null, "De manhã, o Mosteiro está como sempre: o sino toca uma vez, sem pressa, e o vento traz cheiro de pão e de hortelã."],
      [null, "Amarrada na alça da sua bolsa, uma fita branca que não estava lá quando você dormiu. Bordado nela, com letra redonda de monja: \"Lua nova. Vau-de-Cardo. Venha cantar conosco.\""],
      [Ab, F.pipa_follow ? "(Abel aparece na trilha e para. Pipa solta a sua mão e corre. Ele cai de joelhos para pegar a filha, e não fala nada por um bom tempo.)" : "(Abel aparece na trilha, com o machado no ombro.) Domingo eu vou lá de novo. Ela vai sorrir pra mim. Educada. (ele dá de ombros, um ombro só) Eu vou de novo no outro domingo."],
    ]);
    await say(Hd, "Uma fita. Ela marca a gente como marca as aldeias. (Hulda tenta desamarrar, e o nó não cede) Ah, Ormun. Até a seda dela é teimosa.");
  }
  if (F.pipa_follow) {
    F.pipa = "home";
    const P = cast.pipa;
    G.followers = G.followers.filter((u) => u !== P);
    P.gone = true;
    await say(null, "Pipa assobia duas notas para o pai, uma alta e uma baixa. Ele responde do mesmo jeito. Ela erra o nome dele duas vezes. Ele não corrige.");
    reward(250, "O passarinho de Pipa");
    remember("pipa_home", "Abel de joelhos na trilha, e Pipa assobiando duas notas como sabiá.");
  }
  await say(ARQ(), ch === "crown" ? "(só você ouve) Fumaça. Uma casa inteira de gente que queria esquecer, e agora todo mundo vai lembrar dela. (uma pausa) Eu não sei se você fez bem. Eu sei que eu teria feito igual." : ch === "attack" ? "(só você ouve) Ela levou as crianças. Ela não mentiu: ela disse que levaria. (baixo) Eu gosto cada vez menos dessa mulher. Ela se parece comigo." : "(só você ouve) Lua nova. Eu também vou estar lá, sabe. Eu vou com você a todo lugar.");
  F.ch2_done = true;
  for (const p of G.party) if (!p.ai && p.level < 4) G.hooks.gainXp(p, p.nextXp - p.xp);
  UI.updateQuest();
  await E.sleep(800);
  chapterEnd();
}
function chapterEnd() {
  const rows = [
    ["A Madre Odília", F.c2_madre_left ? "levou as crianças para o norte, cantando." : F.c2_choice === "crown" ? "saiu antes dos soldados. Ninguém viu por onde." : { shaken: "hesitou uma vez, e lembrou como era.", even: "ouviu tudo, e não mudou de ideia.", swayed: "quase fez você esquecer por que tinha vindo." }[F.c2_madre] ?? "não conversou com você."],
    ["Hulda", F.hulda_free === "force" ? "saiu de uma cela de grades entortadas, e veio junto." : "acordou brigando com Ormun, e veio junto."],
    ["O Velho Sabiá", F.c2_sabia ? "ficou, com o chá e a janela. Na lua nova, ele conta o resto." : "continua descansando, em algum lugar da ala."],
    ["O livro de nomes", F.c2_book === "nix" ? "está na capa rubra de Nix." : F.c2_book === "read" ? "foi lido em voz alta, nome por nome." : F.c2_proof ? "perdeu uma página." : "continua no atril."],
    ["Pipa", F.pipa === "home" ? "voltou para casa, assobiando." : F.pipa === "bird" ? "tem um passarinho de madeira, e lembra de um assobio." : F.pipa === "lie" ? "está feliz, você disse." : F.q_pipa ? "não recebeu o passarinho." : "brinca de procissão no pátio."],
    ["O Mosteiro", { crown: "queimou. A Coroa levou as crianças para o Tributo.", attack: "ficou vazio. O portão norte, aberto.", peace: "toca o sino uma vez, sem pressa." }[F.c2_choice]],
    ["Você", F.c2_slept ? "dormiu no Mosteiro. Há uma linha a mais riscada no seu Diário." : "não dormiu no Mosteiro."],
  ];
  const el = document.getElementById("endscreen");
  el.innerHTML = `<div class="box fr fr-panel"><h1>Fim do capítulo</h1><h2>Ato I · O Véu Sereno</h2>
    <h3>O que o Mosteiro vai lembrar</h3><dl>${rows.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join("")}</dl>
    <p class="muted" style="margin-top:8rem">Nível ${G.hero.level} · ${G.gold} peças de ouro · Continua no Bosque de Lethiel.</p>
    <div class="row"><button class="go" data-default id="keepPlaying">Continuar explorando</button></div></div>`;
  el.classList.remove("hidden");
  G.paused = true;
  el.querySelector("#keepPlaying").onclick = () => { el.classList.add("hidden"); G.paused = false; };
  focusDefault(el, true);
}

export function onCombatEnd(group) {
  const W = G.W;
  if (group === W.groups.mariposas) {
    group.passive = true; F.c2_moths = "won";
    soon(() => scene(() => say(null, "As mariposas caem na grama e se desfazem em pó branco, como farinha. A peregrina não se mexe. A lanterna continua acesa no colo dela.")), 1100);
  }
  if (group === W.groups.guardas) {
    group.passive = true; F.c2_guards = "won";
    const S = cast.salvia;
    soon(() => scene(async () => {
      if (S && !S.gone) { S.hp = Math.max(S.hp, 1); S.team = "npc"; S.talk = null; }
      await say(S, "(A Irmã Sálvia, sentada no chão, entrega a chave sem que ninguém peça.) Toma. Eu só queria que todo mundo dormisse bem. (ela fecha os olhos) Eu queria dormir bem.");
      giveItem(ITEMS.key);
      UI.updateQuest();
    }), 1200);
  }
  if (group === W.groups.assalto) {
    group.passive = true; F.c2_assault = "won";
    soon(() => scene(async () => {
      await say(cast.corvino ?? null, "(O monge grande, ajoelhado, não levanta o véu.) Ela já saiu. Vocês só ganharam o pátio.");
      reward(300, "O pátio do Véu");
      await leave();
    }), 1400);
  }
}

// ---------------------------------------------------------------- what's clickable
export function interactables() {
  const out = [], W = G.W;
  const at = (tx, ty, name, act, extra = {}) => out.push({ x: tx * TILE + 16, y: ty * TILE + 26, name, r: 16, act, ...extra });
  if (W.id === "bosque") {
    const r = E.obj("ribbons");
    at(Math.floor(r.x / TILE), Math.floor(r.y / TILE), "Fitas brancas", ribbons, { h: 40 });
    const b = E.obj("pbag");
    if (!b.hidden && F.c2_moths && F.c2_moths !== "met" && F.c2_moths !== "fight") out.push({ x: b.x, y: b.y, name: "Bolsa da peregrina", r: 14, act: pilgrimBag });
    at(0, 14, "Trilha de volta ao Cardo", () => toMap("travessia", 47, 15, 1), { reach: 70 });
  }
  if (W.id === "mosteiro") {
    at(MOST.front[0], MOST.front[1], "Porta do claustro", () => toMap("claustro", CLAU.exits.front[0], CLAU.exits.front[1] - 1, 3), { h: 40 });
    at(MOST.chapel[0], MOST.chapel[1], "Porta da capela", () => toMap("claustro", CLAU.exits.chapel[0] - 1, CLAU.exits.chapel[1], 1), { h: 40 });
    at(MOST.kitchen[0], MOST.kitchen[1], "Porta da cozinha", () => toMap("claustro", CLAU.exits.kitchen[0] + 1, CLAU.exits.kitchen[1], 2), { h: 40 });
    at(MOST.guest[0], MOST.guest[1], "Hospedaria (dormir)", sleepHere, { h: 40 });
    at(MOST.north[0], MOST.north[1] + 1, "Portão norte", () => say(null, F.c2_madre_left ? "O portão de ferro está aberto. Do outro lado, a névoa, branca, quieta, e uma fila de pegadas pequenas." : "Um portão de ferro com um olho fechado forjado no alto. Do outro lado, a névoa encosta nas grades como um bicho que quer carinho. Está trancado por dentro, com uma corrente nova."), { h: 50 });
  }
  if (W.id === "claustro") {
    at(...CLAU.exits.front, "Saída para o pátio", () => toMap("mosteiro", MOST.front[0], MOST.front[1] + 1, 0), { reach: 60 });
    at(...CLAU.exits.chapel, "Saída da capela", () => toMap("mosteiro", MOST.chapel[0], MOST.chapel[1] + 1, 0), { reach: 60 });
    at(...CLAU.exits.kitchen, "Porta da cozinha", () => toMap("mosteiro", MOST.kitchen[0], MOST.kitchen[1] + 1, 0), { reach: 60 });
    at(6, 9, "Chaleiras", kettle, { h: 40, reach: 64 });
    at(29, 10, "Altar do Véu", altar, { h: 60, reach: 70 });
    if (F.c2_altar) at(15, 3, "Livro de nomes", lectern, { h: 36, reach: 60 });
    if (F.c2_altar && !F.hulda_free) at(CLAU.bars[0], CLAU.bars[1] + 1, "Grades da cela", bars, { h: 46, reach: 60 });
  }
  return out;
}
async function ribbons() {
  await scene(async () => {
    await say(null, "Fitas brancas de seda amarradas num galho seco. Algumas têm nomes bordados com linha cinza: Pedra-Alta. Vau-Fundo. Três Moinhos. Nomes de lugar que você nunca ouviu, e não vai ouvir.");
    if (!F.c2_ribbon && F.otavio_found) { F.c2_ribbon = true; await say(null, "Uma, mais nova, diz só: \"Lago Espelhado\". Uma fita para uma pessoa."); }
  });
}

// ---------------------------------------------------------------- per-frame
export function update() {
  const W = G.W, l = lead();
  const [tx, ty] = tileNow(l);
  if (W.id === "bosque") {
    if (tx <= 0) toMap("travessia", 47, 15, 1);
    else if (tx >= 47) toMap("mosteiro", ...MOST.gate, 2, () => { if (!F.c2_arrived) return arrive(); });
    else if (!F.c2_moths && near(l, ...BOSQ.moths, 5.2)) mothsScene();
    if (near(l, ...BOSQ.camp, 3)) hint("rest");
  }
  if (W.id === "mosteiro") {
    if (tx <= 0) { if (F.hulda_joined && !F.c2_choice) choice(); else toMap("bosque", BOSQ.east[0] - 1, BOSQ.east[1], 1); }
    else if (F.hulda_joined && !F.c2_choice && tx <= 2 && ty >= 13 && ty <= 16) choice();
    else if (!F.c2_madre_met && F.c2_arrived && near(l, ...MOST.madre, 2.4)) madreFirst();
  }
  if (W.id === "claustro") {
    if (F.c2_altar && !F.c2_guards && ty <= 6) guards();
  }
}

// ---------------------------------------------------------------- the Bruma at the edges
export const hasFog = () => G.W.id === "bosque" || G.W.id === "mosteiro";
export function fogAt(x, y) {
  if (G.W.id === "bosque") return clamp((4.5 * TILE - y) / (3.5 * TILE)) * 0.8;
  if (G.W.id === "mosteiro") return clamp((3.2 * TILE - y) / (2.5 * TILE)) * (F.c2_madre_left ? 0.95 : 0.8);
  return 0;
}
