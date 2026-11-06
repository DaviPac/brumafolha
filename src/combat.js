// Turn-based combat on the tile grid: initiative, movement, an action and a bonus action per turn,
// d20 attack rolls against armour class, spells with slots, and enemies that think a little.
import { G, living } from "./state.js";
import { TILE, roll, rollDie } from "./util.js";
import { reachable, gridPath } from "./path.js";
import { MW } from "./world.js";
import { FX, PAL } from "./fx.js";
import { floater, log, toast, updateParty, updateInitiative, buildHotbar, tooltip, banner } from "./ui.js";
import { sfx } from "./audio.js";

// waits that stand still while the game is paused, so a turn never plays out behind the menu
const sleep = (ms) => new Promise((r) => {
  let left = ms, last = performance.now();
  const tick = () => { const now = performance.now(); if (!G.paused) left -= now - last; last = now; left <= 0 ? r() : setTimeout(tick, Math.min(left, 50)); };
  setTimeout(tick, Math.min(ms, 50));
});
export const tileOf = (u) => [Math.floor(u.x / TILE), Math.floor((u.y - 1) / TILE)];
export const tileCenter = (tx, ty) => [tx * TILE + 16, ty * TILE + 26];
const cheb = (a, b) => { const [ax, ay] = tileOf(a), [bx, by] = tileOf(b); return Math.max(Math.abs(ax - bx), Math.abs(ay - by)); };
const fmtRoll = (r) => `${r.rolls.join("+")}${r.mod ? (r.mod > 0 ? "+" + r.mod : r.mod) : ""}`;

function occupiedBy(tx, ty, except) {
  return [...G.party, ...G.enemies, ...G.npcs].find((u) => u !== except && u.hp > 0 && !u.gone && tileOf(u)[0] === tx && tileOf(u)[1] === ty);
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
  attack: { name: "Ataque", icon: "⚔️", cost: "action", range: 1, kind: "attack", desc: "Golpe corpo a corpo com a arma. Clique num inimigo adjacente." },
  cleave: { name: "Golpe Giratório", icon: "🌀", cost: "action", range: 0, kind: "cleave", per: "combat", desc: "Gira a espada e atinge todos os inimigos adjacentes. 1x por combate." },
  secondwind: { name: "Retomar Fôlego", icon: "💨", cost: "bonus", range: 0, kind: "self", per: "rest", desc: "Ação bônus: recupera 1d10 + nível PV. 1x por descanso." },
  firebolt: { name: "Rajada de Fogo", icon: "🔥", cost: "action", range: 10, kind: "bolt", dmg: "1d10", desc: "Truque: dispara uma bola de fogo. 1d10 de dano de fogo, alcance 10." },
  missiles: { name: "Mísseis Mágicos", icon: "✨", cost: "action", range: 10, kind: "missiles", slot: true, desc: "Magia de 1º círculo: três dardos que nunca erram, 1d4+1 cada." },
  heal: { name: "Curar Ferimentos", icon: "💚", cost: "action", range: 6, kind: "heal", slot: true, desc: "Magia de 1º círculo: um aliado recupera 1d8+3 PV." },
  potion: { name: "Poção de Cura", icon: "🧪", cost: "bonus", range: 1, kind: "potion", desc: "Ação bônus: você ou um aliado adjacente bebe e recupera 2d4+2 PV." },
};

export function abilitiesOf(u) {
  return u.abilities.map((k) => ({ key: k, ...ABILITIES[k] }));
}

function canUse(u, ab) {
  if (ab.cost === "action" && !u.action) return false;
  if (ab.cost === "bonus" && !u.bonus) return false;
  if (ab.per === "combat" && u.used[ab.key]) return false;
  if (ab.per === "rest" && u.restUsed[ab.key]) return false;
  if (ab.slot && u.slots <= 0) return false;
  if (ab.kind === "potion" && G.potions <= 0) return false;
  return true;
}

// ---------------------------------------------------------------- start / end
export function startCombat(group) {
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
  G.combat = { order: order.map((o) => o.u), idx: -1, active: null, group, ability: null, preview: null, busy: false };
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
  do { C.idx = (C.idx + 1) % C.order.length; } while (C.order[C.idx].hp <= 0);
  const u = (C.active = C.order[C.idx]);
  u.moveLeft = u.move; u.action = 1; u.bonus = 1;
  C.ability = null;
  updateInitiative(); updateParty();
  if (u.team === "party") {
    sfx.turn();
    G.hooks.focus?.(u);
    refreshCombatHotbar();
  } else {
    buildHotbar([]);
    C.busy = true;
    await sleep(450);
    await enemyTurn(u);
    C.busy = false;
    if (G.combat) nextTurn();
  }
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
    sel: C.ability === ab.key,
    count: ab.slot ? u.slots : ab.kind === "potion" ? G.potions : null,
    use: () => selectAbility(ab.key),
  }));
  const pip = (on, c) => `<span class="pip ${on ? "on" : ""} ${c}"></span>`;
  buildHotbar(entries, `<div class="econ"><div>${pip(u.action, "a")}Ação</div><div>${pip(u.bonus, "b")}Bônus</div><div>${pip(u.moveLeft > 0, "m")}Movimento ${u.moveLeft}</div></div><button id="endturn">Fim do turno</button>`);
  document.querySelector("#endturn").onclick = (e) => { e.stopPropagation(); endTurn(); };
}

export function selectAbility(key) {
  const C = G.combat;
  if (!C || C.busy) return;
  const u = C.active, ab = { key, ...ABILITIES[key] };
  sfx.select();
  if (!canUse(u, ab)) return;
  if (ab.kind === "self") { useAbility(u, ab, u); return; }
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
  const abKey = C.ability ?? (target && target.team === "enemy" ? "attack" : null);
  C.preview = null;
  if (abKey && target) {
    const ab = { key: abKey, ...ABILITIES[abKey] };
    const d = cheb(u, target);
    const friendly = ab.kind === "heal" || ab.kind === "potion";
    if (friendly !== (target.team === "party")) { tooltip(null); return; }
    if (ab.kind === "attack" || ab.kind === "bolt") {
      const pct = hitChance(u, target, u.atk);
      const inRange = d <= ab.range;
      let note = "";
      if (!inRange && ab.kind === "attack") {
        const app = approachTile(u, target);
        note = app ? `<br>vai até ele (${app.path.length} de movimento)` : "<br><span style='color:#ff8a7a'>longe demais</span>";
        if (app) C.preview = { path: app.path };
      } else if (!inRange) note = "<br><span style='color:#ff8a7a'>fora de alcance</span>";
      tooltip(`<b>${ab.name}</b> → ${target.name}<br><span class="pct">${pct}%</span> de acerto · ${ab.kind === "bolt" ? ab.dmg : u.dmg} dano<br>PV ${target.hp}/${target.maxHp} · CA ${target.ac}${note}`);
    } else if (ab.kind === "missiles") tooltip(`<b>${ab.name}</b> → ${target.name}<br><span class="pct">100%</span> · 3×(1d4+1)${d > ab.range ? "<br>fora de alcance" : ""}`);
    else if (friendly) tooltip(`<b>${ab.name}</b> → ${target.name}<br>PV ${target.hp}/${target.maxHp}${d > ab.range ? "<br>fora de alcance" : ""}`);
    return;
  }
  tooltip(target ? `<b>${target.name}</b><br>PV ${target.hp}/${target.maxHp} · CA ${target.ac}` : null);
  if (C.ability) return;
  const [ux, uy] = tileOf(u);
  const reach = reachable(blockedFor(u), ux, uy, u.moveLeft);
  if (reach.has(ty * MW + tx) && !(tx === ux && ty === uy)) C.preview = { path: gridPath(blockedFor(u), ux, uy, tx, ty) };
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
  const abKey = C.ability ?? (target && target.team === "enemy" ? "attack" : null);
  if (abKey && target) {
    const ab = { key: abKey, ...ABILITIES[abKey] };
    if (!canUse(u, ab)) { floater(u.x, u.y - 36, ab.cost === "bonus" ? "Sem ação bônus" : "Sem ação", "info"); return; }
    const friendly = ab.kind === "heal" || ab.kind === "potion";
    if (friendly !== (target.team === "party")) return;
    if (cheb(u, target) > ab.range) {
      if (ab.kind !== "attack") { floater(u.x, u.y - 36, "Fora de alcance", "info"); return; }
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

function moveAlong(u, path) {
  // an empty path never "arrives" in stepAlongPath, so resolve it here or the turn hangs
  if (!path?.length) return Promise.resolve();
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
  t.hp -= amount;
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
      log(`${t.name} cai.`, "sys");
      sfx.enemyDown();
    } else {
      floater(t.x, t.y - 46, "Caído", "info");
      log(`${t.name} está caído!`, "miss");
      sfx.partyDown();
    }
  }
  updateParty(); updateInitiative();
}

function heal(t, amount) {
  t.hp = Math.min(t.maxHp, t.hp + amount);
  floater(t.x, t.y - 34, `+${amount}`, "heal");
  updateParty(); updateInitiative();
}

function attackRoll(u, t, bonus) {
  const d = rollDie(20), total = d + bonus;
  const crit = d === 20, hit = crit || (d !== 1 && total >= t.ac);
  return { d, total, crit, hit };
}

function rollDmg(expr, crit) {
  const r = roll(expr);
  if (crit) { const r2 = roll(expr.replace(/[+-]\d+$/, "")); r.total += r2.total; r.rolls.push(...r2.rolls); }
  r.mod = +(/[+-]\d+$/.exec(expr)?.[0] ?? 0);
  return r;
}

async function meleeAttack(u, t, expr) {
  lunge(u, t);
  const flip = t.x < u.x;
  await sleep(120);
  const r = attackRoll(u, t, u.atk);
  G.fx.spawn(FX.swordSlash, { x: t.x + (flip ? 14 : -14), y: t.y + 2, flip, radius: 24, ...(u.slashPal ? { palette: u.slashPal } : {}) });
  sfx.swing();
  await sleep(110);
  if (r.hit) {
    const dm = rollDmg(expr, r.crit);
    G.fx.spawn(r.crit ? FX.critHit : FX.hitSpark, { x: t.x, y: t.y - 14, flip });
    damage(t, dm.total, r.crit, u);
    log(`${u.name} → ${t.name}: d20 ${r.d}+${u.atk}=${r.total} vs CA ${t.ac} · <b>${r.crit ? "CRÍTICO" : "acerto"}</b> ${dm.total} (${fmtRoll(dm)})`, r.crit ? "crit" : "hit");
  } else {
    floater(t.x, t.y - 34, "Errou", "miss");
    sfx.miss();
    log(`${u.name} → ${t.name}: d20 ${r.d}+${u.atk}=${r.total} vs CA ${t.ac} · errou`, "miss");
  }
  await sleep(380);
}

const soundKind = (palette) => (palette === PAL.fire ? "fire" : palette === PAL.arcane ? "arcane" : palette === PAL.wood ? "arrow" : "ember");

function bolt(u, t, palette, onHit, arc = 0, dur = null) {
  return new Promise((res) => {
    const sx = u.x, sy = u.y - 18, ex = t.x, ey = t.y - 14;
    const ang = Math.atan2(ey - sy, ex - sx);
    const d = Math.hypot(ex - sx, ey - sy), kind = soundKind(palette);
    sfx.cast(kind);
    const fx = G.fx.spawn(FX.fireball, { x: sx, y: sy, angle: ang, palette, radius: 4 }, {
      move: { x: ex, y: ey, dur: dur ?? Math.max(0.18, d / 420), arc },
      onArrive: () => { G.fx.spawn(FX.hitSpark, { x: ex, y: ey, palette, flip: ex < sx }); sfx.impact(kind); onHit(); res(); },
    });
    fx.fx.options.angle = ang;
  });
}

async function rangedSpell(u, t, expr, palette, label) {
  face(u, t);
  const arrow = soundKind(palette) === "arrow";
  u.pose = "cast"; u.poseT = arrow ? 0.85 : 0.5;
  if (arrow) sfx.bowDraw(0.5); // draw the bow before letting go
  await sleep(arrow ? 560 : 200);
  const r = attackRoll(u, t, u.atk);
  await bolt(u, t, palette, () => {
    if (r.hit) {
      const dm = rollDmg(expr, r.crit);
      damage(t, dm.total, r.crit, u, soundKind(palette));
      log(`${u.name} — ${label} → ${t.name}: d20 ${r.d}+${u.atk}=${r.total} vs CA ${t.ac} · <b>${r.crit ? "CRÍTICO" : "acerto"}</b> ${dm.total}`, r.crit ? "crit" : "hit");
    } else {
      floater(t.x, t.y - 34, "Errou", "miss");
    sfx.miss();
      log(`${u.name} — ${label} → ${t.name}: d20 ${r.d}+${u.atk}=${r.total} · errou`, "miss");
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
  if (ab.slot) u.slots--;
  switch (ab.kind) {
    case "attack": await meleeAttack(u, target, u.dmg); break;
    case "bolt": await rangedSpell(u, target, ab.dmg, PAL.fire, ab.name); break;
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
      const r = roll("1d8+3"); heal(target, r.total);
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
        else { floater(t.x, t.y - 34, "Errou", "miss"); log(`Golpe Giratório → ${t.name}: errou`, "miss"); }
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

// ---------------------------------------------------------------- enemy AI
async function enemyTurn(u) {
  const foes = living(G.party);
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
