// Equipment: weapons by type, armour and clothes by weight, shields. Each piece has numbers (dice, armour class),
// a look (the sprite changes when you wear it) and sometimes an effect.
import { ramp } from "./util.js";

export const WEAPON_TYPES = {
  punhos: "Punhos", adaga: "Adagas", espada: "Espadas", machado: "Machados", maca: "Maças e martelos",
  lanca: "Lanças e hastes", cajado: "Cajados", arco: "Arcos e bestas",
};

// cat: simples | marcial. props: fin (acuidade: FOR ou DES), pesada, duas (duas mãos), alcance (ataca a 2 casas)
export const WEAPONS = {
  punhos: { name: "Punhos", type: "punhos", dice: "1d4", cat: "simples", props: ["fin"], sprite: "none", desc: "Mãos nuas. Monges batem com acuidade." },
  adaga: { name: "Adaga", type: "adaga", dice: "1d4", cat: "simples", props: ["fin"], sprite: "dagger", desc: "Leve e rápida." },
  adagaVelmoor: { name: "Adaga de Velmoor", type: "adaga", dice: "1d4", cat: "simples", props: ["fin"], sprite: "dagger", bonus: 1, rare: true,
    fx: { vsForgotten: "1d4" }, desc: "Prata branca que nunca embaça. +1 para acertar e no dano; +1d4 contra Esvaídos." },
  espadaCurta: { name: "Espada curta", type: "espada", dice: "1d6", cat: "marcial", props: ["fin"], sprite: "sword", wlen: -2, desc: "Lâmina curta de soldado." },
  cimitarra: { name: "Cimitarra", type: "espada", dice: "1d6", cat: "marcial", props: ["fin"], sprite: "sword", wlen: -1, desc: "Curva, feita para cortar em movimento." },
  espadaLonga: { name: "Espada longa", type: "espada", dice: "1d8", cat: "marcial", props: [], sprite: "sword", desc: "A arma de quem aprendeu num quartel." },
  montante: { name: "Montante", type: "espada", dice: "2d6", cat: "marcial", props: ["pesada", "duas"], sprite: "sword", wlen: 3, desc: "Uma espada do tamanho de uma pessoa pequena." },
  machadinha: { name: "Machadinha", type: "machado", dice: "1d6", cat: "simples", props: [], sprite: "axe", wlen: -3, desc: "Serve para lenha e para goblins." },
  machadoBatalha: { name: "Machado de batalha", type: "machado", dice: "1d8", cat: "marcial", props: [], sprite: "axe", desc: "Lâmina larga, cabo de freixo." },
  machadoGrande: { name: "Machado grande", type: "machado", dice: "1d12", cat: "marcial", props: ["pesada", "duas"], sprite: "axe", wlen: 3, desc: "Pesado demais para ser elegante." },
  machadoGorza: { name: "Machado de Gorza", type: "machado", dice: "1d12", cat: "marcial", props: ["pesada", "duas"], sprite: "axe", wlen: 3, rare: true,
    fx: { critMin: 19 }, desc: "Lascado, remendado com corda, e muito pesado. Crítico em 19 ou 20." },
  maca: { name: "Maça", type: "maca", dice: "1d6", cat: "simples", props: [], sprite: "mace", desc: "Uma bola de ferro num cabo." },
  marteloGuerra: { name: "Martelo de guerra", type: "maca", dice: "1d8", cat: "marcial", props: [], sprite: "hammer", desc: "Achata elmos." },
  malho: { name: "Malho", type: "maca", dice: "2d6", cat: "marcial", props: ["pesada", "duas"], sprite: "hammer", wlen: 3, desc: "Um martelo de ferreiro que decidiu ir à guerra." },
  lanca: { name: "Lança", type: "lanca", dice: "1d6", cat: "simples", props: [], sprite: "spear", desc: "Haste de freixo, ponta de ferro." },
  lancaGoblin: { name: "Lança goblin", type: "lanca", dice: "1d6", cat: "simples", props: [], sprite: "spear", fx: { dmgBonus: 1 }, desc: "Ponta de osso afiada até brilhar. +1 de dano." },
  alabarda: { name: "Alabarda", type: "lanca", dice: "1d10", cat: "marcial", props: ["pesada", "duas", "alcance"], sprite: "spear", wlen: 3, desc: "Ataca inimigos a 2 casas de distância." },
  cajado: { name: "Cajado", type: "cajado", dice: "1d6", cat: "simples", props: [], sprite: "staff", desc: "Madeira firme, para andar e para bater." },
  cajadoCarvalho: { name: "Cajado de carvalho", type: "cajado", dice: "1d6", cat: "simples", props: [], sprite: "staff", orb: "leaf", fx: { healBonus: 2 }, desc: "Ainda brota folhas na ponta. +2 nas curas." },
  cajadoOsso: { name: "Cajado de osso da Avó", type: "cajado", dice: "1d6", cat: "simples", props: [], sprite: "staff", orb: "ember", rare: true,
    fx: { fireBonus: 2 }, desc: "Ossos, contas e fuligem. Magias de fogo causam +2 de dano." },
  arcoCurto: { name: "Arco curto", type: "arco", dice: "1d6", cat: "simples", props: ["dist"], range: 8, sprite: "bow", desc: "Alcance 8." },
  arcoLongo: { name: "Arco longo", type: "arco", dice: "1d8", cat: "marcial", props: ["dist", "duas"], range: 10, sprite: "bow", desc: "Alcance 10." },
  bestaLeve: { name: "Besta leve", type: "arco", dice: "1d8", cat: "simples", props: ["dist"], range: 9, sprite: "bow", desc: "Alcance 9. Fácil de usar, lenta de armar." },
};

const steel = ramp("#3a4250", "#5e6878", "#8a96a8", "#b8c4d4");
// cat: roupa | leve | media | pesada. Lighter pieces let more Destreza through (dexMax).
export const ARMORS = {
  roupas: { name: "Roupas de viagem", cat: "roupa", base: 10, dexMax: 9, look: {}, desc: "Sem armadura. Classes que lutam sem armadura usam a própria defesa." },
  robe: { name: "Robe de estudioso", cat: "roupa", base: 10, dexMax: 9, look: { robe: true, trim: true }, fx: { spellAtk: 1 }, desc: "Bordado com runas de foco. +1 para acertar magias." },
  mantoBruma: { name: "Manto de Bruma", cat: "roupa", base: 11, dexMax: 9, rare: true, look: { robe: true, tunic: ramp("#7e8496", "#a8aec0", "#cdd2de", "#eef0f6") },
    fx: { forgetWard: true }, desc: "Tecido de Velmoor, frio ao toque. CA 11 + DES. Imune à condição Esquecido." },
  couro: { name: "Armadura de couro", cat: "leve", base: 11, dexMax: 9, look: { tunic: ramp("#2e1a10", "#4e2e1a", "#6e4426", "#8e5c34") }, desc: "CA 11 + DES." },
  couroBatido: { name: "Couro batido", cat: "leve", base: 12, dexMax: 9, look: { tunic: ramp("#26180e", "#44281a", "#62402a", "#806040"), studs: true }, desc: "CA 12 + DES." },
  gibao: { name: "Gibão de peles", cat: "media", base: 12, dexMax: 2, look: { tunic: ramp("#3a2a1a", "#5e4630", "#86684a", "#ae9068"), fur: true }, desc: "CA 12 + DES (máx. 2). Quente, e cheira a bicho." },
  escamas: { name: "Cota de escamas", cat: "media", base: 14, dexMax: 2, stealth: -3, look: { tunic: steel, armor: true }, desc: "CA 14 + DES (máx. 2). Barulhenta: −3 em Furtividade." },
  malha: { name: "Cota de malha", cat: "pesada", base: 16, dexMax: 0, stealth: -3, str: 13, look: { tunic: steel, armor: true }, desc: "CA 16. Exige FOR 13 (senão −1 de movimento). −3 em Furtividade." },
};

export const SHIELDS = {
  escudo: { name: "Escudo de madeira", ac: 2, desc: "+2 de CA. Ocupa a outra mão." },
  escudoOrmun: { name: "Escudo de Ormun", ac: 2, rare: true, fx: { fireRes: true }, desc: "Pedra gravada com runas anãs. +2 de CA e metade do dano de fogo." },
};

export const ARMOR_LEVEL = { roupa: 0, leve: 1, media: 2, pesada: 3 };
export const ARMOR_CAT_NAMES = { roupa: "roupa", leve: "leve", media: "média", pesada: "pesada" };

/** The definition behind an inventory item or a slot key. */
export function itemDef(kind, key) {
  return kind === "weapon" || kind === "ranged" ? WEAPONS[key] : kind === "armor" ? ARMORS[key] : kind === "shield" ? SHIELDS[key] : null;
}

/** A bag entry for a piece of equipment (story items stay as they are). */
export function gearItem(kind, key) {
  const d = itemDef(kind, key);
  const icon = kind === "armor" ? "🥋" : kind === "shield" ? "🛡️" : d.type === "arco" ? "🏹" : d.type === "cajado" ? "🪄" : d.type === "machado" ? "🪓" : d.type === "maca" ? "🔨" : d.type === "adaga" ? "🗡️" : d.type === "lanca" ? "🔱" : "⚔️";
  return { id: `${kind}:${key}:${Math.random().toString(36).slice(2, 7)}`, gear: kind === "ranged" ? "weapon" : kind, key, name: d.name, icon, desc: d.desc };
}

/** One line describing a weapon's numbers. */
export function weaponLine(w) {
  const p = [];
  if (w.props.includes("fin")) p.push("acuidade");
  if (w.props.includes("pesada")) p.push("pesada");
  if (w.props.includes("duas")) p.push("duas mãos");
  if (w.props.includes("alcance")) p.push("alcance 2");
  if (w.range) p.push(`distância ${w.range}`);
  return `${w.dice}${w.bonus ? ` +${w.bonus}` : ""} · ${w.cat}${p.length ? " · " + p.join(", ") : ""}`;
}
