// Turn-based combat on the tile grid: initiative, movement, an action and a bonus action per turn,
// d20 attack rolls against armour class, spells with slots, and enemies that think a little.
import { G, living } from "./state.js";
import { TILE, roll, rollDie } from "./util.js";
import { reachable, gridPath } from "./path.js";
import { MW } from "./world.js";
import { FX, PAL } from "./fx.js";
import { floater, log, toast, updateParty, updateInitiative, buildHotbar, tooltip, banner, tipHTML } from "./ui.js";
import { icon } from "./art/icons.js";
import { sfx } from "./audio.js";
import { isTouch } from "./input.js";

// how fast fights play: the option "Combate rápido", or Shift held down (the waits of a turn are halved)
export const combatPace = { fast: (() => { try { return localStorage.getItem("brumafolha.fast") === "1"; } catch { return false; } })() };
export function setFastCombat(on) { combatPace.fast = on; try { localStorage.setItem("brumafolha.fast", on ? "1" : "0"); } catch { /* */ } }
const paceK = () => (combatPace.fast || G.keys?.has("shift") ? 0.45 : 1);
// waits that stand still while the game is paused, so a turn never plays out behind the menu
const sleep = (ms) => new Promise((r) => {
  let left = ms * paceK(), last = performance.now();
  const tick = () => { const now = performance.now(); if (!G.paused) left -= now - last; last = now; left <= 0 ? r() : setTimeout(tick, Math.min(left, 50)); };
  setTimeout(tick, Math.min(ms, 50));
});
export const tileOf = (u) => [Math.floor(u.x / TILE), Math.floor((u.y - 1) / TILE)];
export const tileCenter = (tx, ty) => [tx * TILE + 16, ty * TILE + 26];
const cheb = (a, b) => { const [ax, ay] = tileOf(a), [bx, by] = tileOf(b); return Math.max(Math.abs(ax - bx), Math.abs(ay - by)); };
const fmtRoll = (r) => `${r.rolls.join("+")}${r.mod ? (r.mod > 0 ? "+" + r.mod : r.mod) : ""}`;

function occupiedBy(tx, ty, except) {
  return [...G.party, ...G.enemies, ...G.npcs, ...G.followers].find((u) => u !== except && u.hp > 0 && !u.gone && !u.ghost && tileOf(u)[0] === tx && tileOf(u)[1] === ty);
}
export function blockedFor(u) {
  return (tx, ty) => G.W.blocked(tx, ty) || !!occupiedBy(tx, ty, u);
}

export function hitChance(att, def, bonus) {
  const need = def.ac - bonus;
  return Math.max(5, Math.min(95, (21 - need) * 5));
}

// ---------------------------------------------------------------- abilities
export const ABILITIES = {
  attack: { name: "Ataque", icon: "sword", cost: "action", range: 1, kind: "attack", desc: "Golpe corpo a corpo com a arma. Clique num inimigo adjacente." },
  cleave: { name: "Golpe Giratório", icon: "cleave", cost: "action", range: 0, kind: "cleave", per: "combat", desc: "Gira a espada e atinge todos os inimigos adjacentes. 1x por combate." },
  secondwind: { name: "Retomar Fôlego", icon: "wind", cost: "bonus", range: 0, kind: "self", per: "rest", desc: "Ação bônus: recupera 1d10 + nível PV. 1x por descanso." },
  firebolt: { name: "Rajada de Fogo", icon: "flame", cost: "action", range: 10, kind: "bolt", dmg: "1d10", pal: "fire", desc: "Truque: dispara uma bola de fogo. 1d10 de dano de fogo, alcance 10." },
  missiles: { name: "Mísseis Mágicos", icon: "missiles", cost: "action", range: 10, kind: "missiles", slot: true, desc: "Magia de 1º círculo: três dardos que nunca erram, 1d4+1 cada." },
  heal: { name: "Curar Ferimentos", icon: "heart", cost: "action", range: 6, kind: "heal", slot: true, heal: "1d8", desc: "Magia de 1º círculo: um aliado recupera 1d8+3 PV." },
  shoot: { name: "Disparar", icon: "bow", cost: "action", range: 10, kind: "shoot", desc: "Ataque à distância com o arco." },
  sacredflame: { name: "Chama Sagrada", icon: "sun", cost: "action", range: 8, kind: "bolt", dmg: "1d8", pal: "holy", desc: "Truque: luz radiante desce sobre um inimigo. 1d8 de dano, alcance 8." },
  healword: { name: "Palavra Curativa", icon: "word", cost: "bonus", range: 6, kind: "heal", slot: true, heal: "1d4", desc: "Ação bônus, magia de 1º círculo: um aliado à distância recupera 1d4 + SAB PV." },
  cunning: { name: "Ação Ardilosa", icon: "boot", cost: "bonus", range: 0, kind: "dash", desc: "Ação bônus: dispara e ganha movimento extra igual ao seu deslocamento." },
  mark: { name: "Marca do Caçador", icon: "target", cost: "bonus", range: 12, kind: "mark", slot: true, desc: "Ação bônus, magia: marca um inimigo; seus ataques com arma nele causam +1d6." },
  potion: { name: "Poção de Cura", icon: "potion", cost: "bonus", range: 1, kind: "potion", desc: "Ação bônus: você ou um aliado adjacente bebe e recupera 2d4+2 PV." },
  rage: { name: "Fúria", icon: "rage", cost: "bonus", range: 0, kind: "rage", per: "combat", desc: "Ação bônus: até o fim do combate, +2 de dano corpo a corpo e metade do dano de armas. 1x por combate." },
  smite: { name: "Golpe Divino", icon: "bolt", cost: "bonus", range: 0, kind: "smite", slot: true, desc: "Ação bônus, gasta um espaço: o próximo acerto corpo a corpo causa +2d8 de dano radiante." },
  layhands: { name: "Cura pelas Mãos", icon: "hand", cost: "action", range: 1, kind: "layhands", per: "rest", desc: "Toque num aliado adjacente (ou em você): cura 5 × nível PV. 1x por descanso." },
  mockery: { name: "Zombaria Viciosa", icon: "mask", cost: "action", range: 8, kind: "bolt", dmg: "1d4", pal: "arcane", effect: "mock", desc: "Truque: um insulto com magia. 1d4 de dano psíquico, e o próximo ataque do alvo leva −5." },
  inspire: { name: "Inspiração de Bardo", icon: "note", cost: "bonus", range: 8, kind: "inspire", per: "combat", desc: "Ação bônus: um aliado soma 1d6 ao próximo ataque. 1x por combate." },
  eldritch: { name: "Rajada Mística", icon: "orb", cost: "action", range: 12, kind: "bolt", dmg: "1d10", pal: "arcane", desc: "Truque: um raio de força crepitante. 1d10 de dano, alcance 12." },
  hex: { name: "Maldição", icon: "eye", cost: "bonus", range: 12, kind: "mark", slot: true, desc: "Ação bônus, magia: amaldiçoa um inimigo; todos os seus ataques nele, magias também, causam +1d6." },
  produceflame: { name: "Criar Chama", icon: "palmflame", cost: "action", range: 6, kind: "bolt", dmg: "1d8", pal: "fire", desc: "Truque: uma chama na palma da mão, arremessada. 1d8 de dano de fogo, alcance 6." },
  entangle: { name: "Constrição", icon: "vine", cost: "action", range: 8, kind: "entangle", slot: true, desc: "Magia: raízes agarram um inimigo. Ele rola d20 + bônus contra a CD das suas magias; se falhar, perde o próximo turno." },
  flurry: { name: "Rajada de Golpes", icon: "fist", cost: "bonus", range: 1, kind: "flurry", desc: "Ação bônus, depois de atacar neste turno: dois golpes desarmados rápidos num inimigo adjacente." },
  // learned at a level-up (rules.js LEVEL_POOL)
  surge: { name: "Surto de Ação", icon: "bolt", cost: "free", range: 0, kind: "surge", per: "rest", desc: "Sem custo: você ganha mais uma ação neste turno. 1x por descanso." },
  guard: { name: "Postura Defensiva", icon: "ac", cost: "bonus", range: 0, kind: "guard", amt: 2, desc: "Ação bônus: +2 de CA até o seu próximo turno." },
  dodge: { name: "Esquiva Ardilosa", icon: "boot", cost: "bonus", range: 0, kind: "guard", amt: 3, desc: "Ação bônus: +3 de CA até o seu próximo turno. Bom para sair de perto depois de um ataque furtivo." },
  arcshield: { name: "Escudo Arcano", icon: "ac", cost: "bonus", range: 0, kind: "guard", amt: 5, slot: true, desc: "Ação bônus, magia de 1º círculo: uma parede de força, +5 de CA até o seu próximo turno." },
  reckless: { name: "Ataque Imprudente", icon: "rage", cost: "free", range: 0, kind: "reckless", per: "turn", desc: "Sem custo: seus ataques corpo a corpo neste turno rolam com vantagem, mas você fica com −2 de CA até o seu próximo turno." },
  warcry: { name: "Grito de Guerra", icon: "mask", cost: "bonus", range: 0, kind: "warcry", per: "combat", desc: "Ação bônus: os inimigos a até 2 casas ficam abalados (−5 no próximo ataque). 1x por combate." },
  bless: { name: "Bênção", icon: "sun", cost: "action", range: 0, kind: "bless", slot: true, desc: "Magia de 1º círculo: você e os aliados a até 6 casas somam 1d4 ao próximo ataque." },
  command: { name: "Comando", icon: "word", cost: "action", range: 6, kind: "entangle", slot: true, note: "Obedece", verb: "obedece à palavra", desc: "Magia de 1º círculo: uma palavra de ordem. O alvo rola d20 + bônus contra a CD das suas magias; se falhar, perde o próximo turno." },
  sleepword: { name: "Cantiga de Ninar", icon: "note", cost: "action", range: 6, kind: "entangle", slot: true, note: "Cochilando", verb: "cochila em pé", desc: "Magia de 1º círculo: uma cantiga baixinha. O alvo rola d20 + bônus contra a CD das suas magias; se falhar, perde o próximo turno." },
  thunder: { name: "Onda Trovejante", icon: "cleave", cost: "action", range: 0, kind: "burst", slot: true, dmg: "2d8", pal: "arcane", desc: "Magia de 1º círculo: um trovão em volta de você. Cada inimigo adjacente rola contra a CD das suas magias: falhou, 2d8 de dano e é empurrado uma casa; passou, metade." },
  hadar: { name: "Braços de Hadar", icon: "vine", cost: "action", range: 0, kind: "burst", slot: true, dmg: "2d6", pal: "arcane", desc: "Magia de 1º círculo: tentáculos de escuro saem de você. Cada inimigo adjacente rola contra a CD das suas magias: falhou, 2d6 de dano e perde a ação bônus; passou, metade." },
  frostray: { name: "Raio de Gelo", icon: "missiles", cost: "action", range: 10, kind: "bolt", dmg: "1d8", pal: "arcane", effect: "slow", desc: "Truque: um raio branco de frio. 1d8 de dano, e o alvo anda só metade no próximo turno." },
  chilltouch: { name: "Toque Gélido", icon: "orb", cost: "action", range: 12, kind: "bolt", dmg: "1d8", pal: "arcane", effect: "slow", desc: "Truque: uma mão de espectro agarra o alvo. 1d8 de dano, e ele anda só metade no próximo turno." },
  volley: { name: "Disparo Duplo", icon: "bow", cost: "action", range: 10, kind: "volley", per: "combat", desc: "Dois disparos: no alvo e no inimigo mais perto dele (até 2 casas). 1x por combate. Precisa de arma à distância." },
  aim: { name: "Mira Firme", icon: "target", cost: "bonus", range: 0, kind: "aim", desc: "Ação bônus, se ainda não andou: o próximo ataque rola com vantagem, e você não anda mais neste turno." },
  stun: { name: "Golpe Atordoante", icon: "fist", cost: "action", range: 1, kind: "stun", per: "combat", desc: "Um golpe num ponto certo. Se acertar, o alvo rola contra a sua CD; se falhar, perde o próximo turno. 1x por combate." },
  windstep: { name: "Passo do Vento", icon: "wind", cost: "bonus", range: 0, kind: "dash", desc: "Ação bônus: você ganha movimento extra igual ao seu deslocamento." },
  lampejo: { name: "Lampejo de Velmoor", icon: "leaf", cost: "free", range: 0, kind: "flash", per: "rest", desc: "Sem custo de ação: o próximo ataque do grupo rola o d20 duas vezes e fica com o melhor. 1x por descanso (o mesmo Lampejo que rerola testes)." },
};

/** An ability as this unit has it (the bow's range and damage come from the unit). */
export function abilityOf(u, key) {
  const ab = { key, ...ABILITIES[key] };
  if (key === "attack" && u.reach) ab.range = u.reach;
  if (key === "shoot" && u.bow) Object.assign(ab, { range: u.bow.range, name: `Disparar (${u.bow.name})`, desc: `Ataque à distância: ${u.bow.dmg} de dano, alcance ${u.bow.range}.` });
  return ab;
}
export function abilitiesOf(u) {
  return u.abilities.map((k) => abilityOf(u, k));
}

/** What is on someone right now, to show over their head, on the initiative strip and in the tooltip. */
export function conditionsOf(u) {
  const out = [], C = (icon, name, desc, bad) => out.push({ icon, name, desc, bad });
  if (u.forgotten) C("leaf", "Esquecido", "Esqueceu o que ia fazer: perde a ação bônus no próximo turno.", true);
  if (u.skip > 0) C("vine", u.skipNote ?? "Preso", "Perde o próximo turno.", true);
  if (u.mocked) C("mask", "Abalado", "−5 no próximo ataque.", true);
  if (u.slowed) C("boot", "Lento", "Anda só metade no próximo turno.", true);
  if (G.party.some((p) => p.marked === u)) C("target", "Marcado", "Os ataques de quem marcou causam +1d6.", true);
  if (u.inspired) C("note", u.blessed ? "Abençoado" : "Inspirado", `+1d${u.inspireDie || 6} no próximo ataque.`, false);
  if (u.guardAc > 0) C("ac", "Em guarda", `+${u.guardAc} de CA até o próximo turno.`, false);
  if (u.guardAc < 0) C("ac", "Desguardado", `${u.guardAc} de CA até o próximo turno.`, true);
  if (u.raging) C("rage", "Fúria", "+2 de dano corpo a corpo, metade do dano de armas.", false);
  if (u.smiteNext) C("bolt", "Arma brilhando", "O próximo acerto corpo a corpo causa +2d8 radiante.", false);
  if (u.forgetWard && u.team === "party") C("smoke", "Protegido", "Não pode ficar Esquecido nesta luta.", false);
  return out;
}

export const isFriendly = (ab) => ["heal", "potion", "layhands", "inspire"].includes(ab.kind);

/**
 * What a click on an enemy does when no ability is chosen: next to it, the weapon; farther, a caster's cantrip or a
 * bow if it reaches (a wizard doesn't walk up to swing a staff); otherwise walk up and strike.
 */
export function defaultAbility(u, target) {
  const d = cheb(u, target), caster = u.role === "caster";
  const ranged = u.abilities.map((k) => abilityOf(u, k)).filter((ab) => (ab.kind === "bolt" && !ab.slot) || ab.kind === "shoot");
  const fits = ranged.filter((ab) => canUse(u, ab) && d <= ab.range);
  if (d <= (u.reach ?? 1) && !caster) return "attack";
  const cantrip = fits.find((ab) => ab.kind === "bolt"), bow = fits.find((ab) => ab.kind === "shoot");
  if (caster) return (cantrip ?? bow)?.key ?? "attack";
  return (bow ?? cantrip)?.key ?? "attack";
}

function canUse(u, ab) {
  if (ab.cost === "action" && !u.action) return false;
  if (ab.cost === "bonus" && !u.bonus) return false;
  if (ab.per === "combat" && u.used[ab.key]) return false;
  if (ab.per === "rest" && u.restUsed[ab.key]) return false;
  if (ab.per === "turn" && u.turnUsed?.[ab.key]) return false;
  if (ab.slot && u.slots <= 0) return false;
  if (ab.kind === "volley" && !u.bow) return false;
  if (ab.kind === "aim" && u.moveLeft < u.move) return false;
  if (ab.kind === "potion" && G.potions <= 0) return false;
  if (ab.kind === "flurry" && !u.attackedThisTurn) return false;
  return true;
}

function whyNot(u, ab) {
  if (ab.cost === "action" && !u.action) return "Você já usou a ação deste turno.";
  if (ab.cost === "bonus" && !u.bonus) return "Você já usou a ação bônus deste turno.";
  if (ab.per === "combat" && u.used[ab.key]) return "Já usado neste combate.";
  if (ab.per === "rest" && u.restUsed[ab.key]) return "Só volta depois de um descanso.";
  if (ab.per === "turn" && u.turnUsed?.[ab.key]) return "Já usado neste turno.";
  if (ab.slot && u.slots <= 0) return "Sem espaços de magia.";
  if (ab.kind === "volley" && !u.bow) return "Precisa de uma arma à distância equipada.";
  if (ab.kind === "aim" && u.moveLeft < u.move) return "Só antes de andar neste turno.";
  if (ab.kind === "potion" && G.potions <= 0) return "Sem poções.";
  if (ab.kind === "flurry" && !u.attackedThisTurn) return "Ataque primeiro neste turno.";
  return "";
}

// ---------------------------------------------------------------- start / end
export function startCombat(group, opts = {}) {
  if (G.mode === "combat") return;
  const enemies = living(group);
  if (!enemies.length) return;
  G.mode = "combat";
  // stop everyone and snap them onto tiles
  const taken = new Set();
  const snap = (u) => {
    u.path = [];
    let [tx, ty] = tileOf(u);
    const ok = (x, y) => !G.W.blocked(x, y) && !taken.has(y * MW + x);
    if (!ok(tx, ty)) {
      outer: for (let r = 1; r < 5; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (ok(tx + dx, ty + dy)) { tx += dx; ty += dy; break outer; }
    }
    taken.add(ty * MW + tx);
    [u.x, u.y] = tileCenter(tx, ty);
  };
  const party = living(G.party);
  party.forEach(snap); enemies.forEach(snap);
  const order = [...party, ...enemies].map((u) => ({ u, init: rollDie(20) + u.dex }));
  order.sort((a, b) => b.init - a.init);
  G.combat = { order: order.map((o) => o.u), idx: -1, round: 0, active: null, group, opts, ability: null, preview: null, busy: false };
  for (const u of G.combat.order) u.used = {};
  log("<b>Combate!</b> Iniciativa: " + order.map((o) => `${o.u.name} ${o.init}`).join(", "), "sys");
  banner("Combate");
  sfx.combatStart();
  G.hooks.combatStart?.();
  setTimeout(nextTurn, 900);
}

function checkEnd() {
  const C = G.combat;
  if (!living(C.group).length) {
    const xp = C.group.reduce((a, e) => a + e.xpValue, 0);
    G.mode = "explore";
    G.combat = null;
    for (const p of G.party) if (p.hp <= 0) { p.hp = 1; floater(p.x, p.y - 36, "De pé!", "info"); }
    for (const p of G.party) { p.raging = p.smiteNext = p.inspired = p.mocked = p.blessed = p.advOnce = p.advTurn = p.slowed = false; p.marked = null; if (p.guardAc) { p.ac -= p.guardAc; p.guardAc = 0; } }
    toast(`Vitória!  +${xp} XP`);
    sfx.victory();
    log(`Vitória. Cada um recebe ${xp} XP.`, "sys");
    for (const p of G.party) G.hooks.gainXp?.(p, xp);
    updateInitiative(); updateParty();
    G.hooks.combatEnd?.(C.group);
    return true;
  }
  if (!living(G.party).length) {
    G.mode = "over";
    G.hooks.gameOver?.();
    return true;
  }
  return false;
}

async function nextTurn() {
  const C = G.combat;
  if (!C || checkEnd()) return;
  const prev = C.idx;
  do { C.idx = (C.idx + 1) % C.order.length; } while (C.order[C.idx].hp <= 0 || C.order[C.idx].gone);
  if (C.idx <= prev || prev < 0) C.round++;
  const u = (C.active = C.order[C.idx]);
  u.moveLeft = u.move; u.action = 1; u.bonus = 1; u.sneakUsed = false; u.attackedThisTurn = false;
  // what lasted "until your next turn" ends now
  if (u.guardAc) { u.ac -= u.guardAc; u.guardAc = 0; }
  u.advTurn = false; u.turnUsed = {};
  if (u.slowed) { u.slowed = false; u.moveLeft = Math.floor(u.move / 2); floater(u.x, u.y - 40, "Lento", "info"); }
  C.ability = null;
  updateInitiative(); updateParty();
  // the story can step in at the start of a turn (allies arriving, a voice that stops time)
  if (G.hooks.turnStart) {
    C.busy = true;
    await G.hooks.turnStart(u, C);
    C.busy = false;
    if (G.combat !== C || checkEnd()) return;
    if (u.hp <= 0 || u.gone) return nextTurn();
    updateInitiative(); updateParty();
  }
  if (u.skip > 0) {
    u.skip--;
    floater(u.x, u.y - 40, u.skipNote ?? "Surpreso!", "info");
    log(`${u.name} perde o turno.`, "sys");
    C.busy = true; buildHotbar([]);
    await sleep(700);
    C.busy = false;
    if (G.combat === C) nextTurn();
    return;
  }
  if (u.forgotten) {
    u.forgotten = false; u.bonus = 0;
    floater(u.x, u.y - 40, "Esquecido", "info");
    log(`${u.name} esqueceu o que ia fazer: sem ação bônus neste turno.`, "miss");
  }
  if (u.team === "party" && !u.ai) {
    sfx.turn();
    G.hooks.focus?.(u);
    refreshCombatHotbar();
  } else {
    buildHotbar([]);
    C.busy = true;
    await sleep(450);
    await aiTurn(u);
    C.busy = false;
    if (G.combat) nextTurn();
  }
}

/**
 * For the save: is the fight at a point it can be saved and picked up again? That is a party member's turn, waiting
 * for an order: no attack, spell, walk or enemy turn under way.
 */
export function combatStable() {
  const C = G.combat;
  return !!(C && !C.busy && C.active && C.active.team === "party" && !C.active.ai && C.active.hp > 0 && !(G.hitstop > 0));
}
/** The fight as data (the units themselves are saved with everyone else). */
export function combatState(encode) {
  const C = G.combat;
  const { preview, busy, ability, ...rest } = C;
  return encode(rest, "combat");
}
/** Pick a saved fight up again, at the turn it was saved on. */
export function resumeCombat(data) {
  G.combat = { ...data, ability: null, preview: null, busy: false };
  G.mode = "combat";
  const u = G.combat.active;
  banner("Combate");
  updateInitiative(); updateParty();
  G.hooks.focus?.(u);
  refreshCombatHotbar();
}

export function endTurn() {
  const C = G.combat;
  if (!C || C.busy || C.active?.team !== "party") return;
  tooltip(null);
  nextTurn();
}

export function refreshCombatHotbar() {
  const C = G.combat, u = C?.active;
  if (!u || u.team !== "party") return;
  const entries = abilitiesOf(u).map((ab) => ({
    ...ab,
    off: !canUse(u, ab) || C.busy,
    why: whyNot(u, ab),
    dmg: ab.dmg ?? (ab.kind === "attack" || ab.kind === "cleave" ? u.dmg : ab.kind === "shoot" ? u.bow?.dmg : null),
    sel: C.ability === ab.key,
    count: ab.slot ? u.slots : ab.kind === "potion" ? G.potions : null,
    use: () => selectAbility(ab.key),
  }));
  const pip = (on, ic, label) => `<div class="${on ? "on" : ""}">${icon(ic)} ${label}</div>`;
  buildHotbar(entries, { who: u, sub: `PV ${u.hp}/${u.maxHp}${u.maxSlots ? ` · magias ${u.slots}/${u.maxSlots}` : ""}`,
    econ: `<div class="econ">${pip(u.action, "action", "Ação")}${pip(u.bonus, "bonus", "Bônus")}${pip(u.moveLeft > 0, "move", `Mover ${u.moveLeft}`)}</div>`, end: "Fim do turno", onEnd: endTurn });
}

export function selectAbility(key) {
  const C = G.combat;
  if (!C || C.busy) return;
  const u = C.active, ab = abilityOf(u, key);
  sfx.select();
  if (!canUse(u, ab)) return;
  if (["self", "dash", "flash", "rage", "smite", "surge", "guard", "reckless", "warcry", "bless", "burst", "aim"].includes(ab.kind)) { useAbility(u, ab, u); return; }
  if (ab.kind === "cleave") { useAbility(u, ab, null); return; }
  C.ability = C.ability === key ? null : key;
  refreshCombatHotbar();
}

// ---------------------------------------------------------------- player input
export function combatHover(tx, ty) {
  const C = G.combat;
  if (!C || C.busy || C.active?.team !== "party") { C && (C.preview = null); return; }
  const u = C.active;
  const target = [...G.enemies, ...G.party].find((e) => e.hp > 0 && tileOf(e)[0] === tx && tileOf(e)[1] === ty);
  const abKey = C.ability ?? (target && target.team === "enemy" ? defaultAbility(u, target) : null);
  C.preview = null;
  if (abKey && target) {
    const ab = abilityOf(u, abKey);
    const d = cheb(u, target);
    const friendly = isFriendly(ab);
    if (friendly !== (target.team === "party")) { tooltip(null); return; }
    if (["attack", "stun", "bolt", "shoot", "volley"].includes(ab.kind)) {
      const ranged = ab.kind === "shoot" || ab.kind === "volley", melee = ab.kind === "attack" || ab.kind === "stun";
      const bonus = ranged ? u.bow.atk : ab.kind === "bolt" ? u.spellAtk ?? u.atk : u.atk;
      const pct = hitChance(u, target, bonus);
      const inRange = d <= ab.range;
      let note = "";
      if (!inRange && melee) {
        const app = approachTile(u, target);
        note = app ? `<br>vai até ele (${app.path.length} de movimento)` : '<br><span class="bad">longe demais</span>';
        if (app) C.preview = { path: app.path };
      } else if (!inRange) note = '<br><span class="bad">fora de alcance</span>';
      const dmg = ab.kind === "bolt" ? ab.dmg : ranged ? u.bow.dmg : u.dmg;
      tooltip(tipHTML({ icon: ab.icon, title: ab.name, sub: `em ${target.name}`, rows: [["Acerto", `<span class="pct">${pct}%</span>`], ["Dano", `${dmg}${u.marked === target ? " +1d6" : ""}`], ["Alvo", `PV ${target.hp}/${target.maxHp} · CA ${target.ac}`]], foot: tapNote(note.replace(/^<br>/, "") || null, !note.includes("bad")) }));
    } else {
      const far = d > ab.range ? `<span class="bad">fora de alcance</span>` : null;
      const rows = ab.kind === "missiles" ? [["Acerto", `<span class="pct">100%</span>`], ["Dano", "3 × (1d4+1)"]] : ab.kind === "mark" ? [["Efeito", "+1d6 nos seus ataques"]] : [["Alvo", `PV ${target.hp}/${target.maxHp}`]];
      tooltip(tipHTML({ icon: ab.icon, title: ab.name, sub: `em ${target.name}`, rows, foot: tapNote(far, !far) }));
    }
    return;
  }
  tooltip(target ? tipHTML({ icon: target.team === "enemy" ? "skull" : "hp", title: target.name, sub: target.team === "enemy" ? "hostil" : "aliado",
    body: `<div class="hpbar"><i style="width:${(100 * target.hp) / target.maxHp}%"></i></div>` + conditionsOf(target).map((c) => `<div class="cond ${c.bad ? "bad" : "good"}">${icon(c.icon, "sm")} <b>${c.name}</b>: ${c.desc}</div>`).join(""),
    rows: [["PV", `${target.hp}/${target.maxHp}`], ["CA", target.ac]] }) : null);
  if (C.ability) return;
  const [ux, uy] = tileOf(u);
  const reach = reachable(blockedFor(u), ux, uy, u.moveLeft);
  if (reach.has(ty * MW + tx) && !(tx === ux && ty === uy)) {
    C.preview = { path: gridPath(blockedFor(u), ux, uy, tx, ty) };
    // no hover on a touch screen: say what the second tap will do
    if (isTouch() && !target) tooltip(tipHTML({ icon: "boot", title: "Andar até aqui", sub: `${C.preview.path.length} de ${u.moveLeft} de movimento`, foot: tapNote(null, true) }));
  }
}
/** On a touch screen the first tap only shows: the tooltip says that a second one confirms. */
function tapNote(foot, can) {
  if (!isTouch() || !can) return foot;
  return (foot ? foot + "<br>" : "") + '<span class="tapok">Toque de novo para confirmar</span>';
}

function approachTile(u, target) {
  const [ux, uy] = tileOf(u), [tx, ty] = tileOf(target);
  const reach = reachable(blockedFor(u), ux, uy, u.moveLeft);
  let best = null;
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = tx + dx, ny = ty + dy, k = ny * MW + nx;
      if (!reach.has(k)) continue;
      if (!best || reach.get(k) < best.d) best = { x: nx, y: ny, d: reach.get(k) };
    }
  if (!best) return null;
  return { ...best, path: gridPath(blockedFor(u), ux, uy, best.x, best.y) };
}

export async function combatClick(tx, ty) {
  const C = G.combat;
  if (!C || C.busy || C.active?.team !== "party") return;
  const u = C.active;
  const target = [...G.enemies, ...G.party].find((e) => e.hp > 0 && tileOf(e)[0] === tx && tileOf(e)[1] === ty);
  const abKey = C.ability ?? (target && target.team === "enemy" ? defaultAbility(u, target) : null);
  if (abKey && target) {
    const ab = abilityOf(u, abKey);
    if (!canUse(u, ab)) { floater(u.x, u.y - 36, ab.cost === "bonus" ? "Sem ação bônus" : "Sem ação", "info"); return; }
    const friendly = isFriendly(ab);
    if (friendly !== (target.team === "party")) return;
    if (cheb(u, target) > ab.range) {
      if (ab.kind !== "attack" && ab.kind !== "stun") { floater(u.x, u.y - 36, "Fora de alcance", "info"); return; }
      const app = approachTile(u, target);
      if (!app) { floater(u.x, u.y - 36, "Longe demais", "info"); return; }
      C.busy = true; refreshCombatHotbar();
      await moveAlong(u, app.path);
      C.busy = false;
    }
    await useAbility(u, ab, target);
    return;
  }
  if (C.ability) { C.ability = null; refreshCombatHotbar(); return; }
  const [ux, uy] = tileOf(u);
  const reach = reachable(blockedFor(u), ux, uy, u.moveLeft);
  if (!reach.has(ty * MW + tx) || (tx === ux && ty === uy)) return;
  const path = gridPath(blockedFor(u), ux, uy, tx, ty);
  C.busy = true; C.preview = null; refreshCombatHotbar();
  await moveAlong(u, path);
  C.busy = false;
  refreshCombatHotbar();
}

/** The camera follows what is happening: a projectile in flight, else whoever is hit, healed or walking. */
const watch = (o) => G.hooks.watch?.(o);

function moveAlong(u, path) {
  // an empty path never "arrives" in stepAlongPath, so resolve it here or the turn hangs
  if (!path?.length) return Promise.resolve();
  watch(u);
  u.moveLeft -= path.length;
  return new Promise((res) => {
    u.path = path.map(([x, y]) => tileCenter(x, y));
    u.onArrive = res;
    u.speed = 120;
  });
}

// ---------------------------------------------------------------- resolution
function face(u, t) {
  const dx = t.x - u.x, dy = t.y - u.y;
  u.dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 1 : 2) : dy < 0 ? 3 : 0;
}
function lunge(u, t) {
  face(u, t);
  u.pose = "attack"; u.poseT = 0.35;
  const dx = t.x - u.x, dy = t.y - u.y, l = Math.hypot(dx, dy) || 1;
  u.lunge = { x: (dx / l) * 5, y: (dy / l) * 5, t: 0.25 };
}

function damage(t, amount, crit, src, kind = "blade") {
  amount = Math.max(1, amount);
  if (t.fireRes && (kind === "fire" || kind === "ember")) { amount = Math.max(1, amount >> 1); floater(t.x, t.y - 48, "Resistente", "info"); }
  if (t.raging && (kind === "blade" || kind === "arrow")) amount = Math.max(1, amount >> 1);
  t.hp -= amount;
  if (t.hp <= 0 && t.relentless && !t.restUsed.relentless) { t.hp = 1; t.restUsed.relentless = true; setTimeout(() => floater(t.x, t.y - 50, "Implacável!", "crit"), 200); }
  t.flashT = 0.16;
  const dx = t.x - src.x, dy = t.y - src.y, l = Math.hypot(dx, dy) || 1;
  t.knock = { x: (dx / l) * 3, y: (dy / l) * 3, t: 0.2 };
  floater(t.x, t.y - 34, crit ? `${amount}!` : `${amount}`, crit ? "crit" : "dmg");
  G.shake = crit ? 0.3 : 0.12;
  G.hitstop = crit ? 0.12 : 0.06;
  sfx.hit(crit, kind);
  if (t.hp <= 0) {
    t.hp = 0;
    if (t.team === "enemy") {
      setTimeout(() => {
        G.fx.spawn(FX.poof, { x: t.x, y: t.y });
        t.gone = true;
      }, 250);
      log(t.yields ? `${t.name} recua, ferida.` : `${t.name} cai.`, "sys");
      sfx.enemyDown();
    } else {
      floater(t.x, t.y - 46, "Caído", "info");
      log(`${t.name} está caído!`, "miss");
      sfx.partyDown();
      G.hooks.partyDown?.(t);
    }
  }
  updateParty(); updateInitiative();
}

function heal(t, amount) {
  t.hp = Math.min(t.maxHp, t.hp + amount);
  floater(t.x, t.y - 34, `+${amount}`, "heal");
  updateParty(); updateInitiative();
}

function attackRoll(u, t, bonus, melee = false) {
  let d = rollDie(20);
  if (d === 1 && u.lucky) { d = rollDie(20); floater(u.x, u.y - 46, "Sortudo!", "info"); }
  if (u.team === "party" && G.advNext) { G.advNext = false; const d2 = rollDie(20); if (d2 > d) d = d2; floater(u.x, u.y - 52, "Lampejo!", "crit"); }
  else if (u.advOnce || (u.advTurn && melee)) { u.advOnce = false; const d2 = rollDie(20); if (d2 > d) d = d2; floater(u.x, u.y - 52, "Vantagem", "info"); }
  let total = d + bonus;
  if (u.inspired) { u.inspired = false; const i = rollDie(u.inspireDie ?? 6); u.inspireDie = 0; total += i; floater(u.x, u.y - 52, `${u.blessed ? "Bênção" : "Inspiração"} +${i}`, "info"); u.blessed = false; }
  if (u.mocked) { u.mocked = false; total -= 5; floater(u.x, u.y - 52, "Abalado −5", "info"); }
  const crit = d >= (u.critMin ?? 20), hit = crit || (d !== 1 && total >= t.ac);
  return { d, total, crit, hit };
}

/** Why an attack missed, on the field: the roll against the armour (a natural 1 says so). */
const missText = (r, t) => (r.d === 1 ? "Errou: 1 natural" : `Errou: ${r.total} contra CA ${t.ac}`);

function rollDmg(expr, crit) {
  const r = roll(expr);
  if (crit) { const r2 = roll(expr.replace(/[+-]\d+$/, "")); r.total += r2.total; r.rolls.push(...r2.rolls); }
  r.mod = +(/[+-]\d+$/.exec(expr)?.[0] ?? 0);
  return r;
}

/** Extra weapon damage: Hunter's Mark, Sneak Attack (an ally next to the target), Savage Attacks on a crit. */
function weaponExtras(u, t, crit, melee) {
  let add = 0;
  const notes = [];
  const dice = (n) => roll(`${crit ? 2 : 1}d${n}`).total;
  if (u.marked === t) { const v = dice(6); add += v; notes.push(`marca +${v}`); }
  if (u.sneak && !u.sneakUsed && G.party.some((p) => p !== u && p.hp > 0 && cheb(p, t) <= 1)) {
    u.sneakUsed = true;
    const v = dice(6); add += v; notes.push(`furtivo +${v}`);
    floater(t.x, t.y - 50, "Ataque furtivo!", "crit");
  }
  if (melee && crit && u.savage) { const v = roll(u.dmg.replace(/[+-]\d+$/, "")).total; add += v; notes.push(`selvagem +${v}`); }
  if (melee && u.raging) { add += 2; notes.push("fúria +2"); }
  if (melee && u.smiteNext) { u.smiteNext = false; const v = dice(8) + dice(8); add += v; notes.push(`golpe divino +${v}`); floater(t.x, t.y - 50, "Golpe Divino!", "crit"); G.fx.spawn(FX.bloom, { x: t.x, y: t.y + 2, palette: PAL.holy }); }
  if (melee && u.wfx?.vsForgotten && t.esvaido) { const v = roll(u.wfx.vsForgotten).total; add += v; notes.push(`prata +${v}`); }
  return { add, note: notes.length ? ` [${notes.join(", ")}]` : "" };
}

async function meleeAttack(u, t, expr) {
  u.attackedThisTurn = true;
  watch(t);
  lunge(u, t);
  const flip = t.x < u.x;
  await sleep(120);
  const r = attackRoll(u, t, u.atk, true);
  G.fx.spawn(FX.swordSlash, { x: t.x + (flip ? 14 : -14), y: t.y + 2, flip, radius: 24, ...(u.slashPal ? { palette: u.slashPal } : {}) });
  sfx.swing();
  await sleep(110);
  if (r.hit) {
    const dm = rollDmg(expr, r.crit), ex = u.team === "party" ? weaponExtras(u, t, r.crit, true) : { add: 0, note: "" };
    G.fx.spawn(r.crit ? FX.critHit : FX.hitSpark, { x: t.x, y: t.y - 14, flip });
    damage(t, dm.total + ex.add, r.crit, u);
    log(`${u.name} → ${t.name}: d20 ${r.d}+${u.atk}=${r.total} vs CA ${t.ac} · <b>${r.crit ? "CRÍTICO" : "acerto"}</b> ${dm.total + ex.add} (${fmtRoll(dm)})${ex.note}`, r.crit ? "crit" : "hit");
  } else {
    floater(t.x, t.y - 34, missText(r, t), "miss");
    sfx.miss();
    log(`${u.name} → ${t.name}: d20 ${r.d}+${u.atk}=${r.total} vs CA ${t.ac} · errou`, "miss");
  }
  await sleep(380);
  return r;
}

const soundKind = (palette) => (palette === PAL.fire ? "fire" : palette === PAL.arcane || palette === PAL.holy ? "arcane" : palette === PAL.wood ? "arrow" : "ember");

function bolt(u, t, palette, onHit, arc = 0, dur = null) {
  return new Promise((res) => {
    const sx = u.x, sy = u.y - 18, ex = t.x, ey = t.y - 14;
    const ang = Math.atan2(ey - sy, ex - sx);
    const d = Math.hypot(ex - sx, ey - sy), kind = soundKind(palette);
    sfx.cast(kind);
    const fx = G.fx.spawn(FX.fireball, { x: sx, y: sy, angle: ang, palette, radius: 4 }, {
      move: { x: ex, y: ey, dur: dur ?? Math.max(0.18, d / 420), arc },
      onArrive: () => { watch(t); G.fx.spawn(FX.hitSpark, { x: ex, y: ey, palette, flip: ex < sx }); sfx.impact(kind); onHit(); res(); },
    });
    fx.fx.options.angle = ang;
    fx.camSpeed = 9; // keep up with it
    watch(fx);
  });
}

async function rangedSpell(u, t, expr, palette, label, bonus = u.atk, weapon = false, effect = null) {
  face(u, t);
  watch(u); // on the shooter while they aim, then on the shot
  const arrow = soundKind(palette) === "arrow";
  u.pose = "cast"; u.poseT = arrow ? 0.85 : 0.5;
  if (arrow) sfx.bowDraw(0.5); // draw the bow before letting go
  await sleep(arrow ? 560 : 200);
  const r = attackRoll(u, t, bonus);
  await bolt(u, t, palette, () => {
    if (r.hit) {
      const dm = rollDmg(expr, r.crit), ex = weapon ? weaponExtras(u, t, r.crit, false) : { add: 0, note: "" };
      if (!weapon && u.markSpells && u.marked === t) { const v = roll("1d6").total; ex.add += v; ex.note += ` [maldição +${v}]`; }
      if (!weapon && palette === PAL.fire && u.wfx?.fireBonus) { ex.add += u.wfx.fireBonus; ex.note += ` [cajado +${u.wfx.fireBonus}]`; }
      if (effect === "mock" && t.hp > 0) { t.mocked = true; setTimeout(() => floater(t.x, t.y - 50, "Zombado", "info"), 250); }
      if (effect === "slow" && t.hp > 0) { t.slowed = true; setTimeout(() => floater(t.x, t.y - 50, "Lento", "info"), 250); }
      damage(t, dm.total + ex.add, r.crit, u, soundKind(palette));
      if (u.ranged?.forget && t.hp > 0) {
        if (t.forgetWard) setTimeout(() => floater(t.x, t.y - 50, "Protegido do Esquecimento", "heal"), 250);
        else { t.forgotten = true; setTimeout(() => floater(t.x, t.y - 50, "Esquecido: sem ação bônus", "info"), 250); G.hooks.hint?.("forgotten"); }
      }
      log(`${u.name} — ${label} → ${t.name}: d20 ${r.d}+${bonus}=${r.total} vs CA ${t.ac} · <b>${r.crit ? "CRÍTICO" : "acerto"}</b> ${dm.total + ex.add}${ex.note}`, r.crit ? "crit" : "hit");
    } else {
      floater(t.x, t.y - 34, missText(r, t), "miss");
      sfx.miss();
      log(`${u.name} — ${label} → ${t.name}: d20 ${r.d}+${bonus}=${r.total} · errou`, "miss");
    }
  });
  await sleep(350);
}

export async function useAbility(u, ab, target) {
  const C = G.combat;
  if (!C) return;
  C.busy = true; C.ability = null; C.preview = null; tooltip(null);
  refreshCombatHotbar();
  if (ab.cost === "action") u.action = 0;
  if (ab.cost === "bonus") u.bonus = 0;
  if (ab.per === "combat") u.used[ab.key] = true;
  if (ab.per === "rest") u.restUsed[ab.key] = true;
  if (ab.per === "turn") (u.turnUsed ??= {})[ab.key] = true;
  if (ab.slot) u.slots--;
  // abilities that throw something follow the projectile themselves; the rest show whom they touch
  watch(["bolt", "shoot", "missiles", "volley"].includes(ab.kind) ? u : target ?? u);
  switch (ab.kind) {
    case "attack": await meleeAttack(u, target, u.dmg); break;
    case "bolt": await rangedSpell(u, target, ab.dmg, PAL[ab.pal ?? "fire"], ab.name, u.spellAtk ?? u.atk, false, ab.effect); break;
    case "rage": {
      u.raging = true;
      G.fx.spawn(FX.bloom, { x: u.x, y: u.y + 2, palette: PAL.ember });
      floater(u.x, u.y - 40, "FÚRIA!", "crit");
      log(`${u.name} entra em fúria: +2 de dano corpo a corpo e metade do dano de armas.`, "sys");
      sfx.swing(true);
      await sleep(400);
      break;
    }
    case "smite": {
      u.smiteNext = true;
      G.fx.spawn(FX.hitSpark, { x: u.x, y: u.y - 20, palette: PAL.holy });
      floater(u.x, u.y - 40, "Arma brilha", "info");
      sfx.cast("arcane");
      await sleep(350);
      break;
    }
    case "layhands": {
      face(u, target);
      u.pose = "cast"; u.poseT = 0.6;
      G.fx.spawn(FX.bloom, { x: target.x, y: target.y + 2, palette: PAL.holy });
      sfx.heal();
      await sleep(450);
      heal(target, 5 * u.level);
      log(`${u.name} impõe as mãos em ${target.name}: +${5 * u.level} PV`, "heal");
      await sleep(300);
      break;
    }
    case "inspire": {
      face(u, target);
      u.pose = "cast"; u.poseT = 0.5;
      target.inspired = true;
      G.fx.spawn(FX.hitSpark, { x: target.x, y: target.y - 18, palette: PAL.gold });
      floater(target.x, target.y - 40, "Inspirado", "heal");
      log(`${u.name} inspira ${target.name}: +1d6 no próximo ataque.`, "sys");
      sfx.cast("arcane");
      await sleep(400);
      break;
    }
    case "entangle": {
      face(u, target);
      u.pose = "cast"; u.poseT = 0.6;
      G.fx.spawn(FX.bloom, { x: target.x, y: target.y + 2, palette: PAL.heal });
      sfx.cast("arcane");
      await sleep(450);
      const dc = 8 + (u.spellAtk ?? 4), save = rollDie(20) + Math.max(0, (target.atk ?? 3) - 2);
      const note = ab.note ?? "Enredado";
      if (save < dc) { target.skip = (target.skip ?? 0) + 1; target.skipNote = note; floater(target.x, target.y - 40, note + "!", "crit"); log(ab.verb ? `${target.name} ${ab.verb} (${save} vs CD ${dc}): perde o próximo turno.` : `Raízes prendem ${target.name} (${save} vs CD ${dc}): perde o próximo turno.`, "hit"); }
      else { floater(target.x, target.y - 40, `Resistiu (${save} vs CD ${dc})`, "miss"); log(ab.verb ? `${target.name} resiste (${save} vs CD ${dc}).` : `${target.name} arrebenta as raízes (${save} vs CD ${dc}).`, "miss"); }
      await sleep(350);
      break;
    }
    case "flurry": {
      for (let i = 0; i < 2 && target.hp > 0; i++) await meleeAttack(u, target, u.unarmed ?? "1d4");
      break;
    }
    case "shoot": await rangedSpell(u, target, u.bow.dmg, PAL.wood, u.bow.name, u.bow.atk, true); break;
    case "flash": {
      G.advNext = true;
      G.fx.spawn(FX.bloom, { x: u.x, y: u.y + 2, palette: PAL.arcane });
      floater(u.x, u.y - 40, "Lampejo de Velmoor", "crit");
      log(`${u.name} acende o Lampejo: o próximo ataque do grupo rola com vantagem.`, "sys");
      sfx.cast("arcane");
      await sleep(400);
      break;
    }
    case "surge": {
      u.action = 1;
      G.fx.spawn(FX.bloom, { x: u.x, y: u.y + 2, palette: PAL.ember });
      floater(u.x, u.y - 40, "Mais uma ação!", "crit");
      log(`${u.name} respira fundo e ganha mais uma ação.`, "sys");
      sfx.breath();
      await sleep(350);
      break;
    }
    case "guard": {
      u.guardAc = (u.guardAc ?? 0) + ab.amt; u.ac += ab.amt;
      G.fx.spawn(FX.hitSpark, { x: u.x, y: u.y - 18, palette: ab.slot ? PAL.arcane : PAL.gold });
      floater(u.x, u.y - 40, `CA +${ab.amt}`, "heal");
      log(`${u.name}: ${ab.name}, CA ${u.ac} até o próximo turno.`, "sys");
      ab.slot ? sfx.cast("arcane") : sfx.swing();
      await sleep(300);
      break;
    }
    case "reckless": {
      u.advTurn = true; u.guardAc = (u.guardAc ?? 0) - 2; u.ac -= 2;
      floater(u.x, u.y - 40, "Imprudente!", "crit");
      log(`${u.name} ataca sem se guardar: vantagem corpo a corpo neste turno, CA ${u.ac} até o próximo.`, "sys");
      sfx.swing(true);
      await sleep(300);
      break;
    }
    case "aim": {
      u.advOnce = true; u.moveLeft = 0;
      G.fx.spawn(FX.hitSpark, { x: u.x, y: u.y - 20, palette: PAL.gold });
      floater(u.x, u.y - 40, "Mira firme", "info");
      log(`${u.name} firma a mira: vantagem no próximo ataque.`, "sys");
      await sleep(300);
      break;
    }
    case "warcry": {
      u.pose = "attack"; u.poseT = 0.5;
      sfx.swing(true);
      const near = G.enemies.filter((e) => e.hp > 0 && !e.gone && cheb(u, e) <= 2);
      for (const e of near) { e.mocked = true; floater(e.x, e.y - 40, "Abalado", "info"); }
      floater(u.x, u.y - 46, "GRITO!", "crit");
      log(`${u.name} grita: ${near.length ? near.map((e) => e.name).join(", ") + " ficam abalados (−5 no próximo ataque)" : "ninguém perto o bastante para ouvir"}.`, "sys");
      G.shake = 0.2;
      await sleep(450);
      break;
    }
    case "bless": {
      u.pose = "cast"; u.poseT = 0.6;
      sfx.cast("arcane");
      const who = G.party.filter((p) => p.hp > 0 && cheb(u, p) <= 6);
      for (const p of who) { p.inspired = true; p.inspireDie = 4; p.blessed = true; G.fx.spawn(FX.hitSpark, { x: p.x, y: p.y - 18, palette: PAL.holy }); floater(p.x, p.y - 40, "Abençoado", "heal"); }
      log(`${u.name} abençoa ${who.map((p) => p.name).join(", ")}: +1d4 no próximo ataque.`, "sys");
      await sleep(500);
      break;
    }
    case "burst": {
      u.pose = "cast"; u.poseT = 0.6;
      const pal = PAL[ab.pal ?? "arcane"];
      G.fx.spawn(FX.bloom, { x: u.x, y: u.y + 2, palette: pal });
      sfx.cast("arcane"); G.shake = 0.25;
      await sleep(250);
      const adj = G.enemies.filter((e) => e.hp > 0 && !e.gone && cheb(u, e) <= 1);
      if (!adj.length) floater(u.x, u.y - 36, "Ninguém ao redor", "info");
      const dc = 8 + (u.spellAtk ?? 4);
      for (const t of adj) {
        const save = rollDie(20) + Math.max(0, (t.atk ?? 3) - 2), ok = save >= dc;
        const r = roll(ab.dmg), amt = ok ? Math.max(1, r.total >> 1) : r.total;
        G.fx.spawn(FX.hitSpark, { x: t.x, y: t.y - 14, palette: pal });
        damage(t, amt, false, u, "arcane");
        if (!ok && t.hp > 0) {
          if (ab.key === "hadar") { t.forgotten = true; floater(t.x, t.y - 50, "Sem ação bônus", "info"); }
          else {
            // pushed one tile away, if the tile is free
            const [ux, uy] = tileOf(u), [tx, ty] = tileOf(t), nx = tx + Math.sign(tx - ux), ny = ty + Math.sign(ty - uy);
            if (!blockedFor(t)(nx, ny)) { [t.x, t.y] = tileCenter(nx, ny); floater(t.x, t.y - 50, "Empurrado", "info"); }
          }
        }
        log(`${ab.name} → ${t.name}: ${save} vs CD ${dc} · ${ok ? "resistiu, metade" : "falhou"} · ${amt}`, ok ? "miss" : "hit");
        await sleep(120);
      }
      await sleep(350);
      break;
    }
    case "volley": {
      if (!u.bow) break;
      const second = G.enemies.filter((e) => e !== target && e.hp > 0 && !e.gone && cheb(e, target) <= 2).sort((a, b) => cheb(a, target) - cheb(b, target))[0];
      await rangedSpell(u, target, u.bow.dmg, PAL.wood, u.bow.name, u.bow.atk, true);
      if (G.combat && second && second.hp > 0) await rangedSpell(u, second, u.bow.dmg, PAL.wood, u.bow.name, u.bow.atk, true);
      break;
    }
    case "stun": {
      const r = await meleeAttack(u, target, u.dmg);
      if (r?.hit && target.hp > 0) {
        const dc = 8 + 2 + Math.max(0, u.atk - 2), save = rollDie(20) + Math.max(0, (target.atk ?? 3) - 2);
        if (save < dc) { target.skip = (target.skip ?? 0) + 1; target.skipNote = "Atordoado"; floater(target.x, target.y - 50, "Atordoado!", "crit"); log(`${target.name} fica atordoado (${save} vs CD ${dc}): perde o próximo turno.`, "hit"); }
        else { floater(target.x, target.y - 50, `Resistiu (${save} vs CD ${dc})`, "miss"); log(`${target.name} sacode a cabeça (${save} vs CD ${dc}).`, "miss"); }
        await sleep(250);
      }
      break;
    }
    case "dash": {
      u.moveLeft += u.move;
      floater(u.x, u.y - 36, `+${u.move} movimento`, "info");
      sfx.miss();
      await sleep(250);
      break;
    }
    case "mark": {
      face(u, target);
      u.pose = "cast"; u.poseT = 0.4;
      u.marked = target;
      G.fx.spawn(FX.hitSpark, { x: target.x, y: target.y - 14, palette: PAL.gold });
      sfx.cast("arcane");
      floater(target.x, target.y - 40, "Marcado", "info");
      log(`${u.name} marca ${target.name}: +1d6 nos ataques com arma.`, "sys");
      await sleep(350);
      break;
    }
    case "missiles": {
      face(u, target);
      u.pose = "cast"; u.poseT = 0.9;
      let tot = 0;
      const shots = [0, 1, 2].map((i) => sleep(i * 160).then(() => bolt(u, target, PAL.arcane, () => {
        if (target.hp <= 0) return;
        const r = roll("1d4+1"); tot += r.total; damage(target, r.total, false, u, "arcane");
      }, 26 * (i - 1), 0.42)));
      await Promise.all(shots);
      log(`${u.name} — Mísseis Mágicos → ${target.name}: ${tot} de dano`, "hit");
      await sleep(300);
      break;
    }
    case "heal": {
      face(u, target);
      u.pose = "cast"; u.poseT = 0.6;
      G.fx.spawn(FX.bloom, { x: target.x, y: target.y + 2 });
      sfx.heal();
      await sleep(500);
      const cm = (u.castMod ?? 3) + (u.wfx?.healBonus ?? 0), r = roll(`${ab.heal ?? "1d8"}${cm < 0 ? "" : "+"}${cm}`); heal(target, Math.max(1, r.total));
      log(`${u.name} cura ${target.name}: +${r.total} PV`, "heal");
      await sleep(400);
      break;
    }
    case "potion": {
      G.potions--;
      G.fx.spawn(FX.bloom, { x: target.x, y: target.y + 2, palette: PAL.heal });
      sfx.potion();
      await sleep(350);
      const r = roll("2d4+2"); heal(target, r.total);
      log(`${target.name} bebe uma poção: +${r.total} PV`, "heal");
      await sleep(300);
      break;
    }
    case "self": {
      const r = roll(`1d10+${u.level}`);
      G.fx.spawn(FX.bloom, { x: u.x, y: u.y + 2, palette: PAL.holy });
      sfx.breath();
      await sleep(400);
      heal(u, r.total);
      log(`${u.name} retoma o fôlego: +${r.total} PV`, "heal");
      break;
    }
    case "cleave": {
      const adj = G.enemies.filter((e) => e.hp > 0 && cheb(u, e) <= 1);
      u.pose = "attack"; u.poseT = 0.5;
      G.fx.spawn(FX.swordSlash, { x: u.x - 12, y: u.y + 2, flip: true, radius: 24 });
      G.fx.spawn(FX.swordSlash, { x: u.x + 12, y: u.y + 2, radius: 24 });
      sfx.swing(true);
      await sleep(200);
      if (!adj.length) floater(u.x, u.y - 36, "Ninguém ao redor", "info");
      for (const t of adj) {
        const r = attackRoll(u, t, u.atk);
        if (r.hit) { const dm = rollDmg(u.dmg, r.crit); G.fx.spawn(FX.hitSpark, { x: t.x, y: t.y - 14, flip: t.x < u.x }); damage(t, dm.total, r.crit, u); log(`Golpe Giratório → ${t.name}: ${dm.total}`, "hit"); }
        else { floater(t.x, t.y - 34, missText(r, t), "miss"); log(`Golpe Giratório → ${t.name}: errou`, "miss"); }
        await sleep(120);
      }
      await sleep(350);
      break;
    }
  }
  if (!G.combat) return;
  C.busy = false;
  if (checkEnd()) return;
  refreshCombatHotbar();
}

// ---------------------------------------------------------------- AI (enemies, and allies who fight on their own)
async function aiTurn(u) {
  const C = G.combat;
  if (u.noncombat) { await sleep(300); return; }
  const foes = (u.team === "enemy" ? living(G.party) : living(C.group).filter((e) => !e.gone)).filter((f) => f.key !== u.spare);
  if (!foes.length) return;
  const byDist = foes.map((f) => ({ f, d: cheb(u, f) })).sort((a, b) => a.d - b.d || a.f.hp - b.f.hp);
  G.hooks.focus?.(u);
  if (u.ranged) {
    // prefer the most wounded target in range; keep a step away from blades
    const inRange = byDist.filter((o) => o.d <= u.ranged.range);
    if (byDist[0].d <= 1) {
      const [ux, uy] = tileOf(u), reach = reachable(blockedFor(u), ux, uy, u.moveLeft);
      let best = null;
      for (const [k] of reach) {
        const tx = k % MW, ty = (k / MW) | 0;
        const dmin = Math.min(...foes.map((f) => { const [fx, fy] = tileOf(f); return Math.max(Math.abs(fx - tx), Math.abs(fy - ty)); }));
        if (dmin >= 3 && (!best || dmin > best.d)) best = { tx, ty, d: dmin };
      }
      if (best) await moveAlong(u, gridPath(blockedFor(u), ux, uy, best.tx, best.ty));
    }
    const pick = (inRange.length ? inRange : byDist).sort((a, b) => a.f.hp - b.f.hp)[0].f;
    if (cheb(u, pick) > u.ranged.range) {
      const [ux, uy] = tileOf(u), [tx, ty] = tileOf(pick);
      const p = gridPath(blockedFor(u), ux, uy, tx, ty);
      if (p) await moveAlong(u, p.slice(0, Math.min(u.moveLeft, Math.max(0, p.length - u.ranged.range))));
    }
    if (cheb(u, pick) <= u.ranged.range) await rangedSpell(u, pick, u.ranged.dmg, u.ranged.pal ?? PAL.ember, u.ranged.name);
    return;
  }
  let target = byDist[0].f;
  if (byDist[0].d > 1) {
    // walk toward the closest reachable foe
    let app = null;
    for (const o of byDist) { app = approachTile(u, o.f); if (app) { target = o.f; break; } }
    if (app) await moveAlong(u, app.path);
    else {
      const [ux, uy] = tileOf(u), [tx, ty] = tileOf(target);
      const p = gridPath((x, y) => G.W.blocked(x, y) || (!!occupiedBy(x, y, u) && !(x === tx && y === ty)), ux, uy, tx, ty);
      if (p) await moveAlong(u, p.slice(0, Math.min(u.moveLeft, p.length - 1)));
    }
  }
  if (cheb(u, target) <= 1) await meleeAttack(u, target, u.dmg);
}
