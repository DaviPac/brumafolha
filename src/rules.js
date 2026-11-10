// Character rules, tabletop style: races, classes, point-buy ability scores, and everything derived from them
// (hit points, armour class, attack and damage, skills). Also the look options and the sprite spec they make.
import { ramp } from "./util.js";
import { WEAPONS, ARMORS, SHIELDS, ARMOR_LEVEL } from "./items.js";

export const ABILS = ["FOR", "DES", "CON", "INT", "SAB", "CAR"];
export const ABIL_NAMES = { FOR: "Força", DES: "Destreza", CON: "Constituição", INT: "Inteligência", SAB: "Sabedoria", CAR: "Carisma" };
export const mod = (score) => Math.floor((score - 10) / 2);
export const fmtMod = (m) => (m > 0 ? `+${m}` : m < 0 ? `${m}` : "");
export const signed = (m) => (m >= 0 ? `+${m}` : `${m}`);
const PROF = 2;

// point buy: every score starts at 8, 27 points to spend, 15 is the most you can buy
export const POINTS = 27, MIN_SCORE = 8, MAX_SCORE = 15;
const COST = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
export const pointsSpent = (base) => ABILS.reduce((a, k) => a + COST[base[k]], 0);
export const canRaise = (base, k) => base[k] < MAX_SCORE && pointsSpent(base) + COST[base[k] + 1] - COST[base[k]] <= POINTS;
export const canLower = (base, k) => base[k] > MIN_SCORE;

export const SKILLS = {
  "Atletismo": "FOR", "Acrobacia": "DES", "Furtividade": "DES", "Prestidigitação": "DES", "Arcanismo": "INT", "História": "INT", "Investigação": "INT", "Natureza": "INT",
  "Intuição": "SAB", "Medicina": "SAB", "Percepção": "SAB", "Sobrevivência": "SAB", "Enganação": "CAR", "Intimidação": "CAR", "Persuasão": "CAR", "Atuação": "CAR",
};

// ---------------------------------------------------------------- looks
const HUMAN_SKINS = [
  ramp("#9a6a5a", "#d8a088", "#f4cdb0", "#ffe6d0"), ramp("#8a4e3a", "#c47e5e", "#eab08a", "#f8d0b0"), ramp("#7a4630", "#a86a48", "#d09468", "#ecb88a"),
  ramp("#5e3e24", "#8e6440", "#b8885c", "#d8ac7c"), ramp("#4a2a1a", "#704028", "#9a5e3c", "#bc8058"), ramp("#2a1610", "#4a2a1c", "#6a4028", "#8a5838"),
];
const ORC_SKINS = [
  ramp("#2e3e2a", "#4e6644", "#6e8a5c", "#90a878"), ramp("#24401a", "#3e6a24", "#5a8e30", "#7cb040"),
  ramp("#3a4a3e", "#5a6e5e", "#7e927e", "#a0b4a0"), ramp("#4a4038", "#6e6256", "#928474", "#b4a694"),
];
const FIEND_SKINS = [
  ramp("#4a1420", "#7a2432", "#a83a46", "#d0606a"), ramp("#2e1a40", "#4a2a66", "#6a408a", "#8c5eae"),
  ramp("#1a2a4a", "#2a4270", "#3e5e96", "#5a80b8"), ramp("#5a2a3a", "#8a4458", "#b06478", "#d08898"),
];
export const HAIR_COLORS = [
  ["Preto", ramp("#141016", "#2a2228", "#40343a", "#5a4a4e")], ["Castanho", ramp("#2a1610", "#4a2a1a", "#6e4026", "#90582e")],
  ["Ruivo", ramp("#3a1a0e", "#7a3216", "#b0521e", "#d8803a")], ["Loiro", ramp("#8a5a1a", "#b8802a", "#dca848", "#f0c868")],
  ["Platinado", ramp("#8a8a90", "#b8b8bc", "#dcdce0", "#f4f4f6")], ["Lilás", ramp("#3e3a6a", "#6a68a0", "#a0a2d4", "#dcdef6")],
  ["Corvo", ramp("#14101c", "#2a2238", "#40345a", "#5a4c7a")], ["Carmim", ramp("#4a0e0e", "#7a1a18", "#a8302a", "#d05040")],
];
export const HAIR_STYLES = [["short", "Curto"], ["long", "Longo"], ["bun", "Coque"], ["mohawk", "Moicano"], ["bald", "Careca"], ["hood", "Capuz"]];
export const BEARDS = [[null, "Sem barba"], ["short", "Curta"], ["long", "Longa"]];
export const EYES = [
  ["Escuros", [20, 14, 20]], ["Castanhos", [80, 44, 20]], ["Azuis", [40, 100, 170]], ["Verdes", [40, 120, 60]],
  ["Âmbar", [230, 170, 40]], ["Rubros", [210, 40, 40]], ["Violeta", [130, 60, 180]], ["Glaciais", [160, 220, 240]],
];
export const OUTFITS = [
  ["Carmesim", ramp("#3e1e1a", "#6a2e22", "#94442a", "#b8623a")], ["Floresta", ramp("#1a2a14", "#2a4220", "#3e5e2c", "#567a3a")],
  ["Marinho", ramp("#18283e", "#22405e", "#2e5a80", "#4278a0")], ["Arcano", ramp("#1e1438", "#34205e", "#4e3288", "#6e4cb0")],
  ["Carvão", ramp("#141418", "#24242c", "#383844", "#50505e")], ["Ocre", ramp("#4a2a0a", "#7a4a14", "#a8701e", "#cc9634")],
  ["Turquesa", ramp("#0e2a2a", "#1a4444", "#2a6262", "#3e8484")], ["Marfim", ramp("#6a6050", "#9a9080", "#c8bea8", "#ece4d0")],
];
export const CAPES = [
  ["Sem capa", null], ["Verde", ramp("#16301e", "#244a2a", "#36663a", "#4c8248")], ["Rubra", ramp("#3a0e10", "#5e1a1a", "#862828", "#a83a32")],
  ["Azul", ramp("#141e38", "#1e2e56", "#2c4478", "#3e5c9a")], ["Negra", ramp("#0e0c12", "#1a1820", "#2a2632", "#3c3846")], ["Dourada", ramp("#4a2a0a", "#7a4a14", "#b07a1e", "#d8a83a")],
];
const PANTS = ramp("#1e1e2a", "#2e3040", "#43465a"), BOOTS = ramp("#1a1010", "#3a2218", "#5a3622");

// ---------------------------------------------------------------- races
export const RACES = {
  humano: {
    name: "Humano", nameF: "Humana", desc: "Ambiciosos e adaptáveis, os humanos se espalharam por todo o vale.", bonus: { FOR: 1, DES: 1, CON: 1, INT: 1, SAB: 1, CAR: 1 },
    skins: HUMAN_SKINS, ears: "human", skills: ["Persuasão"],
    traits: [["Versátil", "+1 em todos os atributos."], ["Lábia", "Proficiência em Persuasão."]],
    namesF: ["Mirela", "Brisa", "Isolde", "Selene", "Ana", "Teodora"], namesM: ["Aldren", "Tavio", "Corvan", "Dario", "Bento", "Lauro"], look: { hair: 1, beard: null },
  },
  elfo: {
    name: "Elfo", nameF: "Elfa", desc: "Longevos e graciosos, com sentidos afiados pela floresta.", bonus: { DES: 2, SAB: 1 },
    skins: HUMAN_SKINS, ears: "elf", skills: ["Percepção"],
    traits: [["Sentidos aguçados", "Proficiência em Percepção."], ["Passo leve", "+1 de iniciativa."]], init: 1,
    namesF: ["Aeris", "Sylwen", "Naeris", "Ithil", "Elowen", "Liria"], namesM: ["Lyrien", "Thalas", "Faelar", "Elandor", "Caelum", "Erevan"], look: { hair: 4, beard: null, style: "long" },
  },
  anao: {
    name: "Anão", nameF: "Anã", desc: "Robustos como a pedra das montanhas, teimosos e leais.", bonus: { CON: 2, SAB: 1 },
    skins: HUMAN_SKINS, ears: "human", stout: true, move: 5, hpPerLevel: 1, skills: [],
    traits: [["Robustez anã", "+1 PV por nível."], ["Firme", "Deslocamento 5, mas não é derrubado fácil."]],
    namesF: ["Hilda", "Dagna", "Brunna", "Ketta", "Sigrun", "Morna"], namesM: ["Borin", "Thrain", "Gimrik", "Torvald", "Durgan", "Hakon"], look: { hair: 2, beard: "long" },
  },
  halfling: {
    name: "Halfling", desc: "Pequenos, alegres e misteriosamente sortudos.", bonus: { DES: 2, CAR: 1 },
    skins: HUMAN_SKINS, ears: "human", small: true, move: 5, lucky: true, skills: [],
    traits: [["Sortudo", "Rola de novo os 1 naturais no d20."], ["Pequeno", "Deslocamento 5."]],
    namesF: ["Rosie", "Tansy", "Clover", "Poppy", "Mel", "Lila"], namesM: ["Pip", "Milo", "Bram", "Wendel", "Tico", "Fred"], look: { hair: 3, beard: null },
  },
  meioorc: {
    name: "Meio-orc", desc: "Fortes e intensos, com sangue orc correndo nas veias.", bonus: { FOR: 2, CON: 1 },
    skins: ORC_SKINS, ears: "human", tusks: true, blush: false, relentless: true, savage: true, skills: ["Intimidação"],
    traits: [["Implacável", "Ao cair a 0 PV, fica com 1 PV (1x por descanso)."], ["Ataques selvagens", "Críticos corpo a corpo somam mais um dado de dano."]],
    namesF: ["Urza", "Kragga", "Shura", "Yeva", "Ogra", "Vesh"], namesM: ["Grask", "Morn", "Dorgath", "Brakk", "Thokk", "Ruuk"], look: { hair: 0, beard: null, style: "mohawk" },
  },
  tiferino: {
    name: "Tiferino", nameF: "Tiferina", desc: "Marcados por uma linhagem infernal: chifres, olhos de brasa e muita presença.", bonus: { CAR: 2, INT: 1 },
    skins: FIEND_SKINS, ears: "human", horns: true, blush: false, fireRes: true, skills: [],
    traits: [["Resistência infernal", "Metade do dano de fogo."], ["Chifres", "Presença marcante."]],
    namesF: ["Lilith", "Nemeia", "Orianna", "Velka", "Ira", "Zara"], namesM: ["Damakos", "Mordai", "Akmen", "Skamos", "Kallas", "Orin"], look: { hair: 6, beard: null, style: "long", eyes: 4 },
  },
};

export const GENDERS = [["f", "Feminino"], ["m", "Masculino"], ["n", "Não-binário"]];
/** Names to suggest for a race and gender. */
export const namesFor = (race, g) => (g === "f" ? RACES[race].namesF : g === "m" ? RACES[race].namesM : [...RACES[race].namesF, ...RACES[race].namesM]);
/** A word in the right gender: g(build, "a ladina", "o ladino", "le ladine"); non-binary falls back to `n` or the masculine. */
export const gword = (gender, f, m, n) => (gender === "f" ? f : gender === "n" ? n ?? m : m);

// ---------------------------------------------------------------- classes
// profs: armour weight they can wear (0 roupa, 1 leve, 2 média, 3 pesada), martial weapons, shields.
// options: the starting gear to choose from in the creator (the first of each is the default).
export const CLASSES = {
  guerreiro: {
    name: "Guerreiro", nameF: "Guerreira", desc: "Mestre das armas e da armadura. Aguenta a linha de frente e bate forte.", hitDie: 10, role: "martial",
    profs: { armor: 3, martial: true, shield: true },
    options: { main: ["espadaLonga", "machadoBatalha", "marteloGuerra", "montante", "alabarda"], ranged: [null, "arcoLongo", "bestaLeve"], armor: ["malha", "escamas", "couroBatido"], shield: [false, true] },
    abilities: ["attack", "cleave", "secondwind", "potion"], skills: ["Atletismo", "Intimidação"],
    scores: { FOR: 15, DES: 13, CON: 14, INT: 8, SAB: 12, CAR: 10 }, look: { outfit: 0, cape: 1 },
  },
  barbaro: {
    name: "Bárbaro", nameF: "Bárbara", desc: "Fúria das terras de fronteira. Sem armadura, a pele grossa e a raiva bastam.", hitDie: 12, role: "martial", unarmored: "CON",
    profs: { armor: 2, martial: true, shield: true },
    options: { main: ["machadoGrande", "malho", "machadoBatalha", "montante", "alabarda"], ranged: [null], armor: ["roupas", "gibao"], shield: [false, true] },
    abilities: ["attack", "rage", "potion"], skills: ["Atletismo", "Sobrevivência"],
    scores: { FOR: 15, DES: 13, CON: 15, INT: 8, SAB: 10, CAR: 8 }, look: { outfit: 5, cape: 0 },
  },
  paladino: {
    name: "Paladino", nameF: "Paladina", desc: "Um juramento feito em voz alta. Golpes cheios de luz e mãos que curam.", hitDie: 10, role: "martial", caster: "CAR", slots: 2,
    profs: { armor: 3, martial: true, shield: true },
    options: { main: ["espadaLonga", "marteloGuerra", "montante", "alabarda", "maca"], ranged: [null], armor: ["malha", "escamas"], shield: [true, false] },
    abilities: ["attack", "smite", "layhands", "potion"], skills: ["Persuasão", "Intuição"],
    scores: { FOR: 15, DES: 8, CON: 14, INT: 8, SAB: 10, CAR: 15 }, look: { outfit: 7, cape: 5 },
  },
  patrulheiro: {
    name: "Patrulheiro", nameF: "Patrulheira", desc: "Caçador das matas. Arco longo e a Marca do Caçador na presa.", hitDie: 10, role: "martial", caster: "SAB", slots: 2, showRanged: true,
    profs: { armor: 2, martial: true, shield: true },
    options: { main: ["espadaCurta", "cimitarra", "machadinha", "lanca"], ranged: ["arcoLongo", "arcoCurto", "bestaLeve"], armor: ["couroBatido", "escamas", "couro"], shield: [false] },
    abilities: ["attack", "mark", "potion"], skills: ["Sobrevivência", "Percepção", "Furtividade", "Natureza"],
    scores: { FOR: 12, DES: 15, CON: 14, INT: 8, SAB: 14, CAR: 8 }, look: { outfit: 1, cape: 1 },
  },
  ladino: {
    name: "Ladino", nameF: "Ladina", desc: "Ágil e traiçoeiro. Ataque furtivo quando um aliado distrai o alvo.", hitDie: 8, role: "martial", sneak: true,
    profs: { armor: 1, martial: false, finesseMartial: true, shield: false },
    options: { main: ["espadaCurta", "adaga", "cimitarra"], ranged: ["arcoCurto", "bestaLeve", null], armor: ["couro", "roupas"], shield: [false] },
    abilities: ["attack", "cunning", "potion"], skills: ["Furtividade", "Prestidigitação", "Enganação", "Percepção"],
    scores: { FOR: 8, DES: 15, CON: 14, INT: 12, SAB: 10, CAR: 13 }, look: { outfit: 4, cape: 4, style: "hood" },
  },
  monge: {
    name: "Monge", nameF: "Monja", desc: "Corpo treinado como arma. Sem armadura, rápido, e golpes que vêm em rajadas.", hitDie: 8, role: "martial", unarmored: "SAB", monk: true,
    profs: { armor: 0, martial: false, shield: false },
    options: { main: ["punhos", "cajado", "lanca", "espadaCurta"], ranged: [null], armor: ["roupas"], shield: [false] },
    abilities: ["attack", "flurry", "potion"], skills: ["Acrobacia", "Intuição"],
    scores: { FOR: 10, DES: 15, CON: 13, INT: 8, SAB: 15, CAR: 8 }, look: { outfit: 5, cape: 0, style: "bald" },
  },
  bardo: {
    name: "Bardo", nameF: "Barda", desc: "Histórias, canções e insultos que machucam de verdade. Inspira o grupo.", hitDie: 8, role: "caster", caster: "CAR", slots: 2,
    profs: { armor: 1, martial: false, finesseMartial: true, shield: false },
    options: { main: ["espadaCurta", "cimitarra", "adaga"], ranged: [null, "arcoCurto"], armor: ["couro", "roupas"], shield: [false] },
    abilities: ["mockery", "healword", "inspire", "attack", "potion"], skills: ["Persuasão", "Enganação", "História", "Atuação"],
    scores: { FOR: 8, DES: 14, CON: 13, INT: 10, SAB: 10, CAR: 15 }, look: { outfit: 2, cape: 2 },
  },
  mago: {
    name: "Mago", nameF: "Maga", desc: "Estudioso do arcano. Pouca vida, mas fogo e mísseis que nunca erram.", hitDie: 6, role: "caster", caster: "INT", slots: 2, mageArmor: 13,
    profs: { armor: 0, martial: false, shield: false },
    options: { main: ["cajado", "adaga"], ranged: [null, "bestaLeve"], armor: ["robe", "roupas"], shield: [false] },
    abilities: ["firebolt", "missiles", "attack", "potion"], skills: ["Arcanismo", "Investigação"],
    scores: { FOR: 8, DES: 14, CON: 14, INT: 15, SAB: 12, CAR: 8 }, look: { outfit: 3, cape: 0 },
  },
  bruxo: {
    name: "Bruxo", nameF: "Bruxa", desc: "Um pacto com algo que não se explica. Rajadas místicas e uma maldição na presa.", hitDie: 8, role: "caster", caster: "CAR", slots: 1, markSpells: true,
    profs: { armor: 1, martial: false, shield: false },
    options: { main: ["adaga", "cajado", "maca"], ranged: [null, "bestaLeve"], armor: ["couro", "roupas"], shield: [false] },
    abilities: ["eldritch", "hex", "attack", "potion"], skills: ["Arcanismo", "Enganação"],
    scores: { FOR: 8, DES: 14, CON: 14, INT: 12, SAB: 10, CAR: 15 }, look: { outfit: 4, cape: 4, style: "hood" },
  },
  clerigo: {
    name: "Clérigo", nameF: "Clériga", desc: "Servo de uma divindade. Cura os aliados e queima os inimigos com luz.", hitDie: 8, role: "caster", caster: "SAB", slots: 2,
    profs: { armor: 2, martial: false, shield: true },
    options: { main: ["maca", "marteloGuerra", "lanca"], ranged: [null, "bestaLeve"], armor: ["escamas", "couro"], shield: [true, false] },
    abilities: ["attack", "sacredflame", "heal", "healword", "potion"], skills: ["Medicina", "Intuição"],
    scores: { FOR: 14, DES: 10, CON: 13, INT: 8, SAB: 15, CAR: 12 }, look: { outfit: 7, cape: 5 },
  },
  druida: {
    name: "Druida", desc: "Fala com raízes e com bichos. Chamas na mão, cura e plantas que agarram.", hitDie: 8, role: "caster", caster: "SAB", slots: 2,
    profs: { armor: 2, martial: false, shield: true },
    options: { main: ["cajadoCarvalho", "cajado", "lanca", "cimitarra"], ranged: [null], armor: ["couro", "gibao", "roupas"], shield: [false, true] },
    abilities: ["produceflame", "entangle", "heal", "attack", "potion"], skills: ["Natureza", "Medicina"],
    scores: { FOR: 10, DES: 13, CON: 14, INT: 8, SAB: 15, CAR: 10 }, look: { outfit: 1, cape: 1 },
  },
};
// the marteloGuerra is martial; clerics get it from their god, druids get the scimitar from their circle
CLASSES.clerigo.profs.extra = ["marteloGuerra"];
CLASSES.druida.profs.extra = ["cimitarra"];
CLASSES.bardo.profs.extra = CLASSES.ladino.profs.extra = ["espadaCurta", "cimitarra"];
CLASSES.monge.profs.extra = ["espadaCurta"];

/** Gendered display names. */
export const className = (cls, g) => (g === "f" && CLASSES[cls].nameF) || CLASSES[cls].name;
export const raceName = (race, g) => (g === "f" && RACES[race].nameF) || RACES[race].name;

// ---------------------------------------------------------------- a build
/** A fresh build with the class's suggested scores, starting gear, and the race's typical look. */
export function newBuild(race = "humano", cls = "guerreiro", gender = "m") {
  const b = { race, cls, gender, name: namesFor(race, gender)[0], base: { ...CLASSES[cls].scores }, look: {}, equip: {} };
  applyDefaultLook(b);
  defaultGear(b);
  return b;
}
/** The class's default starting gear (the first option of each slot). */
export function defaultGear(b) {
  const o = CLASSES[b.cls].options;
  b.equip = { main: o.main[0], ranged: o.ranged[0], armor: o.armor[0], shield: o.shield[0] ? "escudo" : null };
}
/** Reset the parts of the look that depend on race/class (called when either changes). */
export function applyDefaultLook(b, what = "all") {
  const R = RACES[b.race], C = CLASSES[b.cls], L = b.look;
  if (what === "all" || what === "race") {
    L.skin = Math.min(L.skin ?? 1, R.skins.length - 1);
    L.hair = R.look.hair; L.beard = b.gender === "f" ? null : R.look.beard; L.eyes = R.look.eyes ?? 0;
    if (R.look.style) L.style = R.look.style; else if (!L.style || ["mohawk", "long"].includes(L.style)) L.style = b.gender === "f" ? "long" : "short";
  }
  if (what === "all" || what === "class") {
    L.outfit = C.look.outfit; L.cape = C.look.cape;
    if (C.look.style) L.style = C.look.style; else if (L.style === "hood" || L.style === "bald") L.style = R.look.style ?? (b.gender === "f" ? "long" : "short");
  }
}

export function finalScores(b) {
  const bonus = RACES[b.race].bonus, out = {};
  for (const k of ABILS) out[k] = b.base[k] + (bonus[k] ?? 0);
  return out;
}

/** Can this class use this weapon with proficiency? */
export function weaponProficient(cls, key) {
  const w = WEAPONS[key], P = CLASSES[cls].profs;
  return !w || w.cat === "simples" || P.martial || (P.extra ?? []).includes(key) || (P.finesseMartial && w.props.includes("fin"));
}
/** Can this class wear this armour (or carry a shield)? */
export const armorAllowed = (cls, key) => ARMOR_LEVEL[ARMORS[key].cat] <= CLASSES[cls].profs.armor;
export const shieldAllowed = (cls) => CLASSES[cls].profs.shield;

/** Everything the game needs to know about a build and its gear, as numbers. */
export function derive(b, eq = b.equip ?? {}) {
  const R = RACES[b.race], C = CLASSES[b.cls], sc = finalScores(b), m = (k) => mod(sc[k]);
  const notes = [];
  const fx = {};
  const addFx = (o) => { for (const [k, v] of Object.entries(o ?? {})) fx[k] = typeof v === "number" ? (fx[k] ?? 0) + v : v; };
  // armour class
  const A = ARMORS[eq.armor ?? "roupas"], S = eq.shield ? SHIELDS[eq.shield] : null;
  let ac = A.base + Math.min(m("DES"), A.dexMax), acNote = A.name;
  if (A.cat === "roupa") {
    if (C.unarmored && !(C.monk && S)) { const alt = 10 + m("DES") + m(C.unarmored); if (alt > ac) { ac = alt; acNote = `sem armadura (DES + ${C.unarmored})`; } }
    if (C.mageArmor) { const alt = C.mageArmor + m("DES"); if (alt > ac) { ac = alt; acNote = "Armadura Arcana"; } }
  }
  if (S) { ac += S.ac; acNote += " + escudo"; addFx(S.fx); }
  addFx(A.fx);
  let move = R.move ?? 6;
  if (A.str && sc.FOR < A.str) { move -= 1; notes.push(`${A.name} pesa: −1 de movimento (FOR ${sc.FOR} < ${A.str}).`); }
  if (C.monk && A.cat === "roupa" && !S) move += 1;
  // the weapon in hand
  const W = WEAPONS[eq.main ?? "punhos"];
  addFx(W.fx);
  const prof = weaponProficient(b.cls, eq.main ?? "punhos");
  if (!prof) notes.push(`Sem proficiência com ${W.name}: sem o bônus de +2 para acertar.`);
  const fin = W.props.includes("fin") || (C.monk && (W.cat === "simples" || W.type === "punhos" || eq.main === "espadaCurta"));
  const wStat = fin && m("DES") > m("FOR") ? "DES" : "FOR";
  let atk = (prof ? PROF : 0) + m(wStat) + (W.bonus ?? 0);
  if (W.props.includes("pesada") && R.small) { atk -= 2; notes.push(`${W.name} é pesada demais para ${R.name.toLowerCase()}s: −2 para acertar.`); }
  let dice = W.dice;
  if (C.monk && (W.type === "punhos")) dice = "1d6";
  const dmgMod = m(wStat) + (W.bonus ?? 0) + (fx.dmgBonus ?? 0);
  // the ranged weapon, if any
  const B = eq.ranged ? WEAPONS[eq.ranged] : null;
  const bprof = B && weaponProficient(b.cls, eq.ranged);
  const bow = B ? { name: B.name, atk: (bprof ? PROF : 0) + m("DES") + (B.bonus ?? 0) - (B.props.includes("pesada") && R.small ? 2 : 0), dmg: B.dice + fmtMod(m("DES")), range: B.range } : null;
  if (eq.shield && W.props.includes("duas")) notes.push(`${W.name} pede as duas mãos: o escudo fica nas costas.`);
  if (eq.shield && W.props.includes("duas")) ac -= S.ac;
  const castMod = C.caster ? m(C.caster) : 0;
  const profSkills = new Set([...C.skills, ...R.skills, ...(b.extraSkills ?? [])]);
  const skills = {};
  for (const [s, a] of Object.entries(SKILLS)) skills[s] = m(a) + (profSkills.has(s) ? PROF : 0);
  if (A.stealth) skills["Furtividade"] += A.stealth;
  return {
    scores: sc, maxHp: Math.max(1, C.hitDie + m("CON") + (R.hpPerLevel ?? 0)), hpPerLevel: Math.max(1, (C.hitDie >> 1) + 1 + m("CON") + (R.hpPerLevel ?? 0)),
    ac, acNote, atk, dmg: dice + fmtMod(dmgMod), weaponStat: wStat, weapon: W, reach: W.props.includes("alcance") ? 2 : 1,
    bow, spellAtk: C.caster ? PROF + castMod + (fx.spellAtk ?? 0) : null, castMod, maxSlots: C.slots ?? 0,
    unarmed: "1d4" + fmtMod(Math.max(m("DES"), m("FOR"))),
    move, init: m("DES") + (R.init ?? 0), skills, proficient: profSkills, fx, notes,
  };
}

/** The sprite spec for the character generator: the look, dressed in the gear. */
export function specOf(b, eq = b.equip ?? {}) {
  const R = RACES[b.race], C = CLASSES[b.cls], L = b.look;
  const A = ARMORS[eq.armor ?? "roupas"].look, W = WEAPONS[eq.main ?? "punhos"], B = eq.ranged ? WEAPONS[eq.ranged] : null;
  const tunic = A.tunic ?? OUTFITS[L.outfit][1];
  const robe = !!A.robe;
  const shown = (C.showRanged && B) || (W.type === "punhos" && B) ? B : W;
  const orbs = { leaf: ramp("#2a5a1a", "#6ac040", "#d0ff90"), ember: ramp("#6a1a10", "#ff7a2a", "#ffe0a0") };
  return {
    skin: R.skins[L.skin], hair: HAIR_COLORS[L.hair][1], hairStyle: L.style, beard: L.beard, eyes: EYES[L.eyes][1],
    tunic, pants: robe ? tunic.slice(0, 3) : PANTS, boots: BOOTS, cape: CAPES[L.cape][1],
    robe, armor: !!A.armor, studs: !!A.studs, fur: !!A.fur, weapon: shown.sprite, wlen: shown.wlen ?? 0,
    twoHand: shown === W && W.props.includes("duas"), // greatswords, greataxes, mauls, halberds: held with both hands
    orb: orbs[W.orb] ?? ramp("#2a6a8a", "#5ad0ff", "#d0f8ff"), trim: robe && A.trim !== false ? ramp("#6a4410", "#c48a1c", "#f4d050") : null,
    shield: eq.shield && !W.props.includes("duas") ? (eq.shield === "escudoOrmun" ? "stone" : "wood") : null,
    ears: R.ears, small: !!R.small, stout: !!R.stout, horns: !!R.horns, tusks: !!R.tusks, blush: R.blush, femme: b.gender === "f",
  };
}

/** The unit definition the game spawns for this build. */
export function heroDef(b, key = "player") {
  const R = RACES[b.race], C = CLASSES[b.cls], d = derive(b);
  return {
    key, build: b, equip: { ...b.equip }, name: b.name.trim() || namesFor(b.race, b.gender)[0], cls: `${className(b.cls, b.gender)} · ${raceName(b.race, b.gender)}`, team: "party",
    maxHp: d.maxHp, hpPerLevel: d.hpPerLevel, role: C.role, sneak: !!C.sneak, markSpells: !!C.markSpells, gender: b.gender,
    lucky: !!R.lucky, relentless: !!R.relentless, savage: !!R.savage, fireRes: !!R.fireRes,
    ...combatStats(b, b.equip, d),
  };
}

/** The parts of a unit that change with gear (recomputed whenever something is equipped). */
export function combatStats(b, eq, d = derive(b, eq), extra = 0) {
  const C = CLASSES[b.cls];
  const abilities = C.abilities.filter((k) => k !== "shoot");
  if (d.bow) abilities.splice(C.showRanged ? 0 : 1, 0, "shoot");
  for (const k of b.extraAbilities ?? []) if (!abilities.includes(k)) abilities.splice(Math.max(0, abilities.indexOf("potion")), 0, k);
  return {
    ac: d.ac, atk: d.atk + extra, dmg: d.dmg, move: d.move, dex: d.init, reach: d.reach, unarmed: d.unarmed,
    bow: d.bow && { ...d.bow, atk: d.bow.atk + extra }, maxSlots: d.maxSlots || undefined, spellAtk: d.spellAtk ?? undefined, castMod: d.castMod,
    abilities, skills: d.skills, wfx: d.fx, critMin: d.fx.critMin ?? 20, forgetWard: !!d.fx.forgetWard, fireRes: !!(RACES[b.race].fireRes || d.fx.fireRes),
  };
}
