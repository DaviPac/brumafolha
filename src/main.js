// Brumafolha: boot, the world, exploring, and drawing it all.
import { G, lead, living } from "./state.js";
import { TILE, makeCanvas, hash2, Rng, dist, clamp, ramp } from "./util.js";
import { buildWorld, MW, MH, zoneAt, inRuins, CAMP, T, waterField } from "./world.js";
import { paintGround, waterSparkles } from "./art/ground.js";
import * as A from "./art/props.js";
import { buildCharacter, portrait, SPECS, SW, SH } from "./art/chars.js";
import { findPath, reachable } from "./path.js";
import { FxLayer, FX, PAL } from "./fx.js";
import * as UI from "./ui.js";
import { openDialogue, marenTree, tomeTree, dialogueKey } from "./dialogue.js";
import { initAudio, playMusic, updateAmbience, sfx, settings as audioSet, toggleMute, setMuted, setVolume, previewSound, SOUND_GROUPS } from "./audio.js";
import { startCombat, combatClick, combatHover, endTurn, selectAbility, abilitiesOf, tileOf, tileCenter, blockedFor, ABILITIES } from "./combat.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
let ground, sparkles, mist, vignette, fgLeft, fgRight;
const art = new Map();
const shadows = new Map();
const grassArt = [];
const critters = [];

const nextFrame = () => new Promise((r) => setTimeout(r, 16));

// ---------------------------------------------------------------- boot
async function boot() {
  const t0 = performance.now();
  G.W = buildWorld();
  await nextFrame();
  ground = document.createElement("canvas");
  ground.width = MW * TILE; ground.height = MH * TILE;
  ground.getContext("2d").putImageData(paintGround(G.W), 0, 0);
  sparkles = waterSparkles(G.W);
  await nextFrame();
  for (let v = 0; v < 6; v++) grassArt.push(A.makeTallGrass(v));
  for (const o of G.W.objects) o.art = propArt(o);
  mist = makeMist();
  fgLeft = silhouette(11); fgRight = silhouette(29);
  G.fx = new FxLayer();
  spawnCast();
  resize();
  // ambient effects
  for (const o of G.W.objects) if (o.kind === "campfire") G.fx.spawn(FX.campfire, { x: o.x, y: o.y + 2, light: 0.55, ...(o.goblin ? { seed: 3 } : {}) }, { keep: true });
  // little life: butterflies over the meadows, fireflies in the ruins and by the water
  const R = new Rng(17);
  const BF = [["#5b2c8f", "#c99cff"], ["#a04a10", "#ffc46a"], ["#2a5a8a", "#9adcff"], ["#c0c0d0", "#ffffff"]];
  for (let i = 0; i < 26; i++) {
    const x = R.range(4, MW - 4) * TILE, y = R.range(4, MH - 4) * TILE;
    if (G.W.tileAt((x / TILE) | 0, (y / TILE) | 0) !== 0) continue;
    critters.push({ kind: "bf", x, y, c: R.pick(BF), ph: R.range(0, 9), r: R.range(14, 40), sp: R.range(0.3, 0.7) });
  }
  for (let i = 0; i < 70; i++) {
    const inR = i < 40;
    const x = inR ? R.range(10, 30) * TILE : R.range(32, 60) * TILE, y = inR ? R.range(3, 14) * TILE : R.range(17, 37) * TILE;
    critters.push({ kind: "ff", x, y, ph: R.range(0, 9), r: R.range(8, 30), sp: R.range(0.15, 0.4) });
  }

  console.log(`loaded in ${Math.round(performance.now() - t0)} ms`);
  document.querySelector(".loading").classList.add("hidden");
  document.querySelector(".help").classList.remove("hidden");
  const btn = document.getElementById("start");
  btn.classList.remove("hidden");
  btn.onclick = begin;
  requestAnimationFrame(loop);
}

function begin() {
  initAudio();
  setupMenu();
  document.getElementById("title").classList.add("hidden");
  G.mode = "explore";
  UI.buildParty(selectLeader);
  UI.updateQuest();
  exploreHotbar();
  zoneNow = "";
  setTimeout(() => G.mode === "explore" && UI.toast("Maren, a pescadora, espera no cais a leste.", 3500), 3600);
}

function propArt(o) {
  const key = (k) => { if (!art.has(k)) art.set(k, makeArt(o)); return art.get(k); };
  switch (o.kind) {
    case "tree": case "pine": case "deadtree": case "rock": case "bush": case "fern": case "waterrock": case "rubble": case "bones": return key(o.kind + o.seed);
    case "wall": return key(`wall${o.h}-${o.seed % 7}`);
    case "pillar": return key(`pillar${o.h}-${o.seed}`);
    case "post": return key("post" + o.h);
    case "tent": return key("tent" + o.color);
    default: return key(o.kind);
  }
}
function makeArt(o) {
  switch (o.kind) {
    case "tree": return A.makeTree(o.seed);
    case "pine": return A.makePine(o.seed);
    case "deadtree": return A.makeDeadTree(o.seed);
    case "rock": return A.makeRock(o.seed);
    case "waterrock": return A.makeRock(o.seed, true);
    case "bush": return A.makeBush(o.seed);
    case "fern": return A.makeFern(o.seed);
    case "wall": return A.makeWall(o.h, o.seed, o.seed % 3 === 0);
    case "pillar": return A.makePillar(o.h, o.seed);
    case "rubble": return A.makeRubble(o.seed);
    case "post": return A.makePost(o.h);
    case "tent": return A.makeTent(o.color);
    case "log": return A.makeLog();
    case "crate": return A.makeCrate();
    case "barrel": return A.makeBarrel();
    case "rowboat": return A.makeRowboat();
    case "campfire": return A.makeCampfireBase();
    case "banner": return A.makeBanner();
    case "bones": return A.makeBones(o.seed);
  }
}
const shadowOf = (r) => { r = Math.round(r); if (!shadows.has(r)) shadows.set(r, A.makeShadow(r)); return shadows.get(r); };

// tileable soft mist
function makeMist() {
  const S = 160, [c, cx] = makeCanvas(S, S);
  const img = cx.createImageData(S, S);
  const P = 8, val = (x, y) => hash2(((x % P) + P) % P, ((y % P) + P) % P, 77);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const fx = (x / S) * P, fy = (y / S) * P, xi = Math.floor(fx), yi = Math.floor(fy), u = fx - xi, v = fy - yi;
    const s = (t) => t * t * (3 - 2 * t);
    const n = val(xi, yi) * (1 - s(u)) * (1 - s(v)) + val(xi + 1, yi) * s(u) * (1 - s(v)) + val(xi, yi + 1) * (1 - s(u)) * s(v) + val(xi + 1, yi + 1) * s(u) * s(v);
    const j = (y * S + x) * 4;
    img.data[j] = 190; img.data[j + 1] = 210; img.data[j + 2] = 215;
    img.data[j + 3] = Math.max(0, n - 0.45) * 160;
  }
  cx.putImageData(img, 0, 0);
  return c;
}

// dark branches framing the bottom of the screen
function silhouette(seed) {
  const t = A.makeDeadTree(seed);
  const [c, cx] = makeCanvas(t.c.width, t.c.height);
  cx.drawImage(t.c, 0, 0);
  const img = cx.getImageData(0, 0, c.width, c.height);
  for (let i = 0; i < img.data.length; i += 4) if (img.data[i + 3]) {
    const l = img.data[i] + img.data[i + 1];
    img.data[i] = l > 150 ? 44 : 26; img.data[i + 1] = l > 150 ? 22 : 14; img.data[i + 2] = l > 150 ? 46 : 30;
  }
  cx.putImageData(img, 0, 0);
  return c;
}

// ---------------------------------------------------------------- the cast
function unit(spec, def) {
  const ch = buildCharacter(SPECS[spec] ?? spec);
  const u = {
    ch, portrait: portrait(ch), dir: 0, animT: 0, pose: "idle", poseT: 0, path: [], speed: 82, moving: false,
    used: {}, restUsed: {}, flashT: 0, level: 1, xp: 0, nextXp: 300, skills: {}, abilities: [], dex: 0, ...def,
  };
  u.hp = u.maxHp;
  u.slots = u.maxSlots ?? 0;
  [u.x, u.y] = tileCenter(def.tx, def.ty);
  return u;
}

function spawnCast() {
  G.party = [
    unit("hero", { key: "hero", name: "Kael", cls: "Guerreiro", team: "party", tx: 15, ty: 38, maxHp: 26, ac: 16, atk: 5, dmg: "1d8+3", move: 6, dex: 1, hpPerLevel: 8,
      abilities: ["attack", "cleave", "secondwind", "potion"], skills: { "Persuasão": 3, "Atletismo": 5 } }),
    unit("mage", { key: "mage", name: "Lyra", cls: "Maga élfica", team: "party", tx: 14, ty: 39, maxHp: 16, ac: 12, atk: 5, dmg: "1d6+1", move: 6, dex: 3, maxSlots: 3, hpPerLevel: 5,
      abilities: ["firebolt", "missiles", "heal", "attack", "potion"], skills: { "Intuição": 4, "Arcanismo": 5 } }),
  ];
  const gob = (tx, ty, group, n) => unit("goblin", { name: n ?? "Goblin", team: "enemy", tx, ty, maxHp: 7, ac: 13, atk: 4, dmg: "1d6+2", move: 6, dex: 2, group, xpValue: 50 });
  const patrol = [gob(21, 21, "patrol"), gob(23, 22, "patrol", "Goblin batedor")];
  const ruins = [
    gob(17, 9, "ruins"), gob(23, 9, "ruins", "Goblin arqueiro"),
    unit("shaman", { name: "Xamã Fumacento", team: "enemy", tx: 20, ty: 5, maxHp: 10, ac: 12, atk: 4, dmg: "1d4+1", move: 5, dex: 1, group: "ruins", xpValue: 75,
      ranged: { range: 8, dmg: "1d8+1", name: "Chama Imunda", pal: PAL.ember } }),
    unit("chief", { name: "Gorza, o Chefe", team: "enemy", tx: 21, ty: 6, maxHp: 24, ac: 15, atk: 5, dmg: "1d10+3", move: 5, dex: 0, group: "ruins", xpValue: 150, boss: true }),
  ];
  ruins[1].ranged = { range: 7, dmg: "1d6+2", name: "Flecha", pal: PAL.wood };
  G.enemies = [...patrol, ...ruins];
  G.groups = { patrol, ruins };
  const tome = { ...SPECS.hero, hair: ramp("#8a5a1a", "#b8802a", "#dca848", "#f0c868"), tunic: ramp("#2a3a2a", "#3e5a3a", "#5a7a4a", "#7a9a5a"), cape: null, weapon: "none", small: true };
  G.npcs = [
    unit("maren", { key: "maren", name: "Maren, a pescadora", team: "npc", tx: 36, ty: 26, maxHp: 10, ac: 10, talk: () => marenTree() }),
    unit(tome, { key: "tome", name: "Tomé", team: "npc", tx: 26, ty: 11, maxHp: 6, ac: 10, talk: () => tomeTree(), dir: 0 }),
  ];
  G.npcs[0].dir = 0;
  G.chests = [
    { x: 27 * TILE + 16, y: 11 * TILE + 26, open: false, loot: { potions: 2, gold: 30 }, name: "Baú dos goblins" },
    { x: 10 * TILE + 16, y: 38 * TILE + 26, open: false, loot: { potions: 1, gold: 5 }, name: "Baú de suprimentos" },
  ];
  for (const c of G.chests) G.W.block[Math.floor((c.y - 1) / TILE) * MW + Math.floor(c.x / TILE)] = 1;
  G.chestArt = [A.makeChest(false), A.makeChest(true)];
  const l = lead();
  G.cam.x = l.x - 320; G.cam.y = l.y - 180;
}

// ---------------------------------------------------------------- hooks used by other modules
G.hooks.focus = (u) => { G.focus = u; };
G.hooks.afterDialogue = () => exploreHotbar();
G.hooks.gainXp = (p, xp) => {
  p.xp += xp;
  while (p.xp >= p.nextXp) {
    p.level++; p.maxHp += p.hpPerLevel; p.hp = p.maxHp; p.nextXp = Math.round(p.nextXp * 2.6);
    if (p.key === "hero") p.atk++;
    if (p.key === "mage") { p.maxSlots++; p.slots = p.maxSlots; }
    setTimeout(() => { UI.toast(`${p.name} alcançou o nível ${p.level}!`); sfx.levelUp(); G.fx.spawn(FX.bloom, { x: p.x, y: p.y + 2, palette: PAL.holy }); }, 1800);
  }
  UI.updateParty();
};
G.hooks.combatStart = () => { UI.tooltip(null); };
G.hooks.combatEnd = (group) => {
  G.focus = null;
  if (group === G.groups.ruins) { if (G.quest.stage < 2) G.quest.stage = Math.max(2, G.quest.stage); G.quest.flags.ruinsDone = true; setTimeout(() => UI.banner("Ruínas libertadas"), 1500); }
  if (group === G.groups.patrol) { G.quest.flags.patrolDone = true; if (G.quest.flags.patrolSeen === undefined) G.quest.flags.patrolSeen = true; }
  UI.updateQuest();
  exploreHotbar();
};
G.hooks.questDone = () => {
  if (G.quest.stage >= 3) return;
  G.quest.stage = 3; G.gold += 50;
  for (const p of G.party) G.hooks.gainXp(p, 100);
  UI.toast("Missão concluída: Goblins de Velmoor  ·  +100 XP  ·  +50 ouro", 4000);
  sfx.quest();
};
G.hooks.tomeLeaves = () => {
  const t = G.npcs.find((n) => n.key === "tome");
  G.quest.flags.grandson = true;
  G.fx.spawn(FX.poof, { x: t.x, y: t.y });
  [t.x, t.y] = tileCenter(37, 27);
  UI.updateQuest();
};
G.hooks.gameOver = () => {
  playMusic(null, 0.6); sfx.defeat();
  const d = document.createElement("div");
  d.id = "gameover";
  d.innerHTML = `<div style="text-align:center"><h1 style="font-size:54px;color:#ff6a5a;margin:0">O grupo caiu</h1><p style="color:#a89c86">As brumas do vale guardam mais um segredo.</p><button id="start" onclick="location.reload()">Tentar de novo</button></div>`;
  document.getElementById("ui").appendChild(d);
};

function selectLeader(i) {
  if (G.mode !== "explore" || G.party[i].hp <= 0) return;
  G.leader = i;
  trail.length = 0;
  UI.updateParty();
  exploreHotbar();
}

function exploreHotbar() {
  if (G.mode === "combat") return;
  const u = lead();
  UI.buildHotbar([
    { icon: "🧪", name: "Poção de Cura", desc: `Recupera 2d4+2 PV de ${u.name}. Você tem ${G.potions}.`, count: G.potions, off: G.potions <= 0 || u.hp >= u.maxHp,
      use: () => { G.potions--; const r = 2 + Math.ceil(Math.random() * 4) + Math.ceil(Math.random() * 4); u.hp = Math.min(u.maxHp, u.hp + r); UI.floater(u.x, u.y - 34, `+${r}`, "heal"); G.fx.spawn(FX.bloom, { x: u.x, y: u.y + 2 }); UI.updateParty(); exploreHotbar(); } },
    { icon: "🔁", name: "Trocar líder", desc: "Controla o outro personagem (Tab).", use: () => selectLeader((G.leader + 1) % G.party.length) },
  ], `<div class="econ"><div>🪙 ${G.gold} ouro</div></div>`);
}

// ---------------------------------------------------------------- explore: movement and interaction
const trail = [];
let pending = null; // something to interact with on arrival

function walkTo(u, wx, wy) {
  const [sx, sy] = tileOf(u);
  let gx = Math.floor(wx / TILE), gy = Math.floor((wy - 1) / TILE);
  if (G.W.blocked(gx, gy)) {
    let best = null;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (G.W.blocked(gx + dx, gy + dy)) continue;
      const d = Math.hypot(gx + dx - sx, gy + dy - sy);
      if (!best || d < best.d) best = { x: gx + dx, y: gy + dy, d };
    }
    if (!best) return false;
    gx = best.x; gy = best.y;
  }
  const p = findPath((x, y) => G.W.blocked(x, y), sx, sy, gx, gy);
  if (!p) return false;
  u.path = p.map(([x, y]) => tileCenter(x, y));
  if (u.path.length && Math.floor(wx / TILE) === gx && Math.floor((wy - 1) / TILE) === gy && !G.W.blocked(gx, gy)) u.path[u.path.length - 1] = [wx, wy];
  u.speed = 90;
  return true;
}

function interactables() {
  const list = [];
  for (const n of G.npcs) if (!n.gone) list.push({ x: n.x, y: n.y, name: n.name, r: 14, act: () => talk(n), ent: n });
  for (const c of G.chests) if (!c.open) list.push({ x: c.x, y: c.y, name: c.name, r: 14, act: () => openChest(c) });
  for (const o of G.W.objects) if (o.kind === "campfire" && !o.goblin) list.push({ x: o.x, y: o.y, name: "Fogueira (descansar)", r: 16, act: rest });
  return list;
}
function underMouse() {
  const { wx, wy } = G.mouse;
  return interactables().find((i) => Math.abs(wx - i.x) < i.r && wy < i.y + 4 && wy > i.y - 34);
}
function talk(n) {
  const l = lead();
  n.dir = Math.abs(l.x - n.x) > Math.abs(l.y - n.y) ? (l.x < n.x ? 1 : 2) : l.y < n.y ? 3 : 0;
  openDialogue(n, n.talk());
}
function openChest(c) {
  c.open = true;
  G.potions += c.loot.potions; G.gold += c.loot.gold;
  G.fx.spawn(FX.hitSpark, { x: c.x, y: c.y - 12, palette: PAL.gold });
  sfx.chest();
  UI.toast(`${c.name}: +${c.loot.potions} poção, +${c.loot.gold} ouro`);
  exploreHotbar();
}
function rest() {
  if (G.enemies.some((e) => e.hp > 0 && dist(e.x, e.y, lead().x, lead().y) < 400)) { UI.toast("Não dá pra descansar com inimigos por perto."); return; }
  for (const p of G.party) { p.hp = p.maxHp; p.slots = p.maxSlots ?? 0; p.restUsed = {}; G.fx.spawn(FX.bloom, { x: p.x, y: p.y + 2, palette: PAL.holy }); }
  UI.toast("Descanso longo: vida e magias restauradas.");
  sfx.rest();
  UI.updateParty();
}

function nearestInteractable() {
  const l = lead();
  let best = null;
  for (const i of interactables()) { const d = dist(i.x, i.y, l.x, l.y); if (d < 52 && (!best || d < best.d)) best = { ...i, d }; }
  return best;
}

function onClick() {
  if (G.mode === "combat") { combatClick(G.mouse.tx, G.mouse.ty); return; }
  if (G.mode !== "explore") return;
  const l = lead();
  const it = underMouse();
  if (it) {
    if (dist(it.x, it.y, l.x, l.y) < 48) { it.act(); return; }
    pending = it;
    walkTo(l, it.x, it.y + 8);
    return;
  }
  pending = null;
  if (walkTo(l, G.mouse.wx, G.mouse.wy)) clickMark = { x: G.mouse.wx, y: G.mouse.wy, t: 0.5 };
}
let clickMark = null;

// ---------------------------------------------------------------- input
function setMouse(e) {
  G.mouse.x = e.clientX; G.mouse.y = e.clientY; G.mouse.in = true;
  G.mouse.wx = G.cam.x + G.mouse.x / G.scale; G.mouse.wy = G.cam.y + G.mouse.y / G.scale;
  G.mouse.tx = Math.floor(G.mouse.wx / TILE); G.mouse.ty = Math.floor(G.mouse.wy / TILE);
}
canvas.addEventListener("mousemove", setMouse);
canvas.addEventListener("mouseleave", () => { G.mouse.in = false; UI.tooltip(null); });
canvas.addEventListener("mousedown", (e) => { if (G.paused) return; setMouse(e); if (e.button === 0) onClick(); if (e.button === 2 && G.combat) { G.combat.ability = null; } });
canvas.addEventListener("contextmenu", (e) => e.preventDefault());
addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  G.keys.add(k);
  if (k === "m" && G.mode !== "title") { syncMute(toggleMute()); return; }
  if (G.mode === "title" || G.mode === "over") return;
  // Esc first cancels a chosen combat action; otherwise it (or P) opens and closes the menu
  if (k === "escape" && !G.paused && G.combat?.ability) { G.combat.ability = null; return; }
  if (k === "escape" || k === "p") { setPaused(!G.paused); return; }
  if (G.paused) return;
  if (G.mode === "dialogue" && /^[1-9]$/.test(k)) dialogueKey(+k);
  else if (G.mode === "combat") {
    if (k === " ") { e.preventDefault(); endTurn(); }
    if (/^[1-9]$/.test(k)) { const u = G.combat?.active; const ab = u?.team === "party" && abilitiesOf(u)[+k - 1]; if (ab) selectAbility(ab.key); }
  } else if (G.mode === "explore") {
    if (k === "e") nearestInteractable()?.act();
    if (k === "tab") { e.preventDefault(); selectLeader((G.leader + 1) % G.party.length); }
    if (/^[1-9]$/.test(k)) document.querySelectorAll("#hotbar .slot")[+k - 1]?.click();
  }
});
addEventListener("keyup", (e) => G.keys.delete(e.key.toLowerCase()));
addEventListener("resize", resize);

function resize() {
  const s = innerHeight >= 1000 ? 3 : innerHeight >= 520 ? 2 : 1;
  G.scale = s;
  G.vw = Math.ceil(innerWidth / s); G.vh = Math.ceil(innerHeight / s);
  canvas.width = G.vw; canvas.height = G.vh;
  canvas.style.width = G.vw * s + "px"; canvas.style.height = G.vh * s + "px";
  ctx.imageSmoothingEnabled = false;
  G.fx?.resize(G.vw, G.vh);
}

// ---------------------------------------------------------------- update
function stepAlongPath(u, dt) {
  if (!u.path.length) { u.moving = false; return; }
  const [tx, ty] = u.path[0];
  const dx = tx - u.x, dy = ty - u.y, d = Math.hypot(dx, dy), s = u.speed * dt;
  if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) u.dir = Math.abs(dx) > Math.abs(dy) * 1.1 ? (dx < 0 ? 1 : 2) : dy < 0 ? 3 : 0;
  if (d <= s) {
    u.x = tx; u.y = ty; u.path.shift();
    if (!u.path.length) { u.moving = false; const f = u.onArrive; u.onArrive = null; f?.(); }
  } else { u.x += (dx / d) * s; u.y += (dy / d) * s; u.moving = true; }
}

function canStand(x, y) {
  for (const [ox, oy] of [[-5, -2], [5, -2], [-5, -8], [5, -8]]) if (G.W.blocked(Math.floor((x + ox) / TILE), Math.floor((y + oy) / TILE))) return false;
  return true;
}

// ---------------------------------------------------------------- audio
const campfires = () => G.W.objects.filter((o) => o.kind === "campfire");
function surfaceAt(x, y) {
  const t = G.W.tileAt(Math.floor(x / TILE), Math.floor((y - 2) / TILE));
  return t === T.DOCK ? "wood" : t === T.STONE ? "stone" : t === T.PATH ? "dirt" : t === T.WATER ? "water" : "grass";
}
function updateAudio(dt) {
  if (G.mode === "title") return;
  const l = lead(), zone = zoneAt(l.x, l.y), ruins = zone === "Ruínas de Velmoor";
  playMusic(G.mode === "combat" ? "combat" : G.mode === "over" ? null : ruins ? "ruins" : "meadow", G.mode === "combat" ? 0.5 : 2.5);
  const w = waterField(l.x, l.y), fire = Math.max(0, ...campfires().map((o) => 1 - dist(o.x, o.y, l.x, l.y) / 220));
  updateAmbience({
    wind: ruins ? 1 : 0.7, water: clamp(1 - w / 1.1, 0, 1), fire,
    birds: ruins || G.mode === "combat" ? 0 : 1, ruins: ruins ? 1 : 0,
  }, dt, G.time);
  // footsteps: one every ~20 px walked, quieter for everyone but the leader
  for (const u of [...G.party, ...G.enemies]) {
    if (u.hp <= 0) continue;
    const d = u._sx == null ? 0 : dist(u._sx, u._sy, u.x, u.y);
    u._sx = u.x; u._sy = u.y;
    if (d > 30) { u._stepAcc = 0; continue; } // teleport / snap
    u._stepAcc = (u._stepAcc ?? 0) + d;
    if (u._stepAcc > (u.small ? 15 : 20)) {
      u._stepAcc = 0;
      const onScreen = u.x > G.cam.x - 20 && u.x < G.cam.x + G.vw + 20 && u.y > G.cam.y - 20 && u.y < G.cam.y + G.vh + 20;
      if (onScreen) sfx.step(surfaceAt(u.x, u.y), u === l ? 1 : u.team === "party" ? 0.55 : 0.7);
    }
  }
}
function syncMute(muted) {
  document.getElementById("mute").textContent = muted ? "🔇" : "🔊";
  document.getElementById("muteAll").checked = muted;
  document.getElementById("pause").classList.toggle("muted", muted);
}
// ---------------------------------------------------------------- pause menu
function setupMenu() {
  document.getElementById("corner").classList.remove("hidden");
  document.getElementById("menuBtn").onclick = () => setPaused(!G.paused);
  document.getElementById("mute").onclick = () => syncMute(toggleMute());
  document.getElementById("muteAll").onchange = (e) => syncMute(setMuted(e.target.checked));
  document.getElementById("resume").onclick = () => setPaused(false);
  const box = document.getElementById("vols");
  box.innerHTML = "";
  let sfxHeader = false;
  for (const g of SOUND_GROUPS) {
    if (g.sfx && !sfxHeader) { box.insertAdjacentHTML("beforeend", "<h4>Efeitos sonoros</h4>"); sfxHeader = true; }
    const row = document.createElement("label");
    row.className = "vrow";
    row.innerHTML = `<span>${g.label}</span><input type="range" min="0" max="1" step="0.05"><span class="pct"></span>`;
    const input = row.querySelector("input"), pct = row.querySelector(".pct");
    const show = () => { pct.textContent = Math.round(input.value * 100) + "%"; row.classList.toggle("off", +input.value === 0); };
    input.value = audioSet.vol[g.key]; show();
    input.oninput = () => { setVolume(g.key, +input.value); show(); };
    input.onchange = () => previewSound(g.key);
    box.appendChild(row);
  }
  syncMute(audioSet.muted);
}
function setPaused(p) {
  if (G.mode === "title" || G.mode === "over") p = false;
  G.paused = p;
  G.keys.clear();
  UI.tooltip(null);
  document.getElementById("pause").classList.toggle("hidden", !p);
  sfx.click();
}

let zoneNow = "", zoneT = 0;
function update(dt) {
  G.time += dt;
  if (G.hitstop > 0) { G.hitstop -= dt; return; }
  G.fx.update(dt);
  const l = lead();
  if (G.mode === "explore") {
    // keyboard walking
    let mx = 0, my = 0;
    if (G.keys.has("w") || G.keys.has("arrowup")) my--;
    if (G.keys.has("s") || G.keys.has("arrowdown")) my++;
    if (G.keys.has("a") || G.keys.has("arrowleft")) mx--;
    if (G.keys.has("d") || G.keys.has("arrowright")) mx++;
    if (mx || my) {
      l.path = []; pending = null;
      const k = 88 * dt / Math.hypot(mx, my);
      if (canStand(l.x + mx * k, l.y)) l.x += mx * k;
      if (canStand(l.x, l.y + my * k)) l.y += my * k;
      l.dir = mx ? (mx < 0 ? 1 : 2) : my < 0 ? 3 : 0;
      l.moving = true;
    } else stepAlongPath(l, dt);
    if (pending && !l.path.length) { if (dist(pending.x, pending.y, l.x, l.y) < 56) pending.act(); pending = null; }
    // the trail the others follow
    const last = trail[0];
    if (!last || dist(last[0], last[1], l.x, l.y) > 3) { trail.unshift([l.x, l.y, l.dir]); if (trail.length > 120) trail.pop(); }
    G.party.forEach((p, i) => {
      if (p === l) return;
      const want = 22 * (i < G.leader ? i + 1 : i);
      let acc = 0, target = null;
      for (let j = 1; j < trail.length; j++) { acc += dist(trail[j][0], trail[j][1], trail[j - 1][0], trail[j - 1][1]); if (acc >= want) { target = trail[j]; break; } }
      p.path = [];
      if (dist(p.x, p.y, l.x, l.y) > 260) { p.x = l.x - 12; p.y = l.y + 4; trail.length = 0; return; }
      if (!target) { p.moving = false; return; }
      const dx = target[0] - p.x, dy = target[1] - p.y, d = Math.hypot(dx, dy);
      if (d > 1.5) {
        const s = Math.min(d, Math.max(88, d * 4) * dt);
        p.x += (dx / d) * s; p.y += (dy / d) * s; p.moving = true;
        p.dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 1 : 2) : dy < 0 ? 3 : 0;
      } else p.moving = false;
    });
    // enemies notice you
    for (const [name, group] of Object.entries(G.groups)) {
      if (!living(group).length) continue;
      const r = name === "ruins" ? 6.5 * TILE : 5 * TILE;
      if (living(group).some((e) => G.party.some((p) => p.hp > 0 && dist(p.x, p.y, e.x, e.y) < r))) {
        for (const e of group) e.alert = 0.8;
        startCombat(group);
        break;
      }
    }
    // zone names
    if ((zoneT -= dt) < 0) {
      zoneT = 0.5;
      const z = zoneAt(l.x, l.y);
      if (z !== zoneNow) { zoneNow = z; UI.banner(z); }
    }
  } else if (G.mode === "combat") {
    for (const u of [...G.party, ...G.enemies]) stepAlongPath(u, dt);
  }
  for (const u of [...G.party, ...G.enemies, ...G.npcs]) {
    u.animT += dt;
    if (u.poseT > 0) u.poseT -= dt; else u.pose = "idle";
    if (u.flashT > 0) u.flashT -= dt;
    for (const k of ["lunge", "knock"]) if (u[k]) { u[k].t -= dt; if (u[k].t <= 0) u[k] = null; }
    if (u.alert > 0) u.alert -= dt;
  }
  updateAudio(dt);
  // idle NPC life
  const maren = G.npcs[0];
  if (G.mode !== "dialogue" && Math.floor(G.time / 4) % 3 === 0) maren.dir = 2; else if (G.mode !== "dialogue") maren.dir = 0;
  // camera
  const f = G.mode === "combat" && G.focus ? G.focus : l;
  const tx = clamp(f.x - G.vw / 2, 0, MW * TILE - G.vw), ty = clamp(f.y - 16 - G.vh / 2, 0, MH * TILE - G.vh);
  const k = 1 - Math.exp(-dt * (G.mode === "combat" ? 4 : 6));
  G.cam.x += (tx - G.cam.x) * k; G.cam.y += (ty - G.cam.y) * k;
  if (G.shake > 0) G.shake -= dt;
  if (clickMark) { clickMark.t -= dt; if (clickMark.t <= 0) clickMark = null; }
  // mouse in world
  G.mouse.wx = G.cam.x + G.mouse.x / G.scale; G.mouse.wy = G.cam.y + G.mouse.y / G.scale;
  G.mouse.tx = Math.floor(G.mouse.wx / TILE); G.mouse.ty = Math.floor(G.mouse.wy / TILE);
  if (G.mode === "combat" && G.mouse.in) combatHover(G.mouse.tx, G.mouse.ty);
  else if (G.mode === "explore" && G.mouse.in) {
    const it = underMouse();
    const en = G.enemies.find((e) => e.hp > 0 && Math.abs(G.mouse.wx - e.x) < 12 && G.mouse.wy < e.y + 3 && G.mouse.wy > e.y - 32);
    UI.tooltip(it ? `<b>${it.name}</b>` : en ? `<b>${en.name}</b><br><span style="color:#ff8a7a">hostil</span>` : null);
    canvas.style.cursor = it ? "pointer" : "";
  }
}

// ---------------------------------------------------------------- draw
function drawUnit(u, cx, cy) {
  if (u.gone) return;
  const down = u.hp <= 0 && u.team === "party";
  if (u.hp <= 0 && u.team === "enemy" && u.gone) return;
  let ox = 0, oy = 0;
  if (u.lunge) { const k = Math.sin((u.lunge.t / 0.25) * Math.PI); ox += u.lunge.x * k; oy += u.lunge.y * k; }
  if (u.knock) { const k = u.knock.t / 0.2; ox += u.knock.x * k; oy += u.knock.y * k; }
  const x = Math.round(u.x + ox - cx), y = Math.round(u.y + oy - cy);
  let fi = 4;
  if (u.pose === "attack" && u.poseT > 0) fi = 5;
  else if (u.pose === "cast" && u.poseT > 0) fi = 6;
  else if (u.moving) fi = Math.floor(u.animT * 8) % 4;
  const img = u.flashT > 0 ? u.ch.flash[u.dir][fi] : u.ch.frames[u.dir][fi];
  if (down) {
    ctx.save(); ctx.globalAlpha = 0.6; ctx.translate(x, y - 6); ctx.rotate(Math.PI / 2); ctx.drawImage(img, -SW / 2, -SH / 2 - 4); ctx.restore();
    return;
  }
  // idle breathing: a 1px bob every so often
  const breathe = !u.moving && fi === 4 && Math.floor(u.animT * 1.6) % 2 === 1 ? 1 : 0;
  if (breathe) {
    ctx.drawImage(img, 0, 0, SW, 22, x - 13, y - 34 + 1, SW, 22);
    ctx.drawImage(img, 0, 22, SW, SH - 22, x - 13, y - 34 + 22, SW, SH - 22);
  } else ctx.drawImage(img, x - 13, y - 34);
  if (u.alert > 0 && u.team === "enemy") {
    ctx.fillStyle = "#ffd84a"; ctx.fillRect(x - 1, y - 46, 2, 6); ctx.fillRect(x - 1, y - 38, 2, 2);
  }
}

function drawBars(cx, cy) {
  if (G.mode !== "combat") return;
  for (const u of [...G.enemies, ...G.party]) {
    if (u.hp <= 0 || u.gone) continue;
    const x = Math.round(u.x - cx) - 9, y = Math.round(u.y - cy) - 40 + (u.ch.bufs ? 0 : 0);
    ctx.fillStyle = "#120e16"; ctx.fillRect(x - 1, y - 1, 20, 4);
    ctx.fillStyle = "#3a1414"; ctx.fillRect(x, y, 18, 2);
    ctx.fillStyle = u.team === "enemy" ? "#e0402a" : "#6ad04a"; ctx.fillRect(x, y, Math.ceil((18 * u.hp) / u.maxHp), 2);
  }
}

function ring(x, y, color, rx = 10) {
  ctx.fillStyle = color;
  for (let a = 0; a < 40; a++) {
    const t = (a / 40) * Math.PI * 2;
    ctx.fillRect(Math.round(x + Math.cos(t) * rx), Math.round(y + Math.sin(t) * rx * 0.45), 1, 1);
  }
}

function drawCombatGrid(cx, cy) {
  const C = G.combat;
  if (!C || !C.active) return;
  const u = C.active;
  const [ux, uy] = tileOf(u);
  const x0 = Math.floor(cx / TILE), y0 = Math.floor(cy / TILE), x1 = x0 + Math.ceil(G.vw / TILE) + 1, y1 = y0 + Math.ceil(G.vh / TILE) + 1;
  // faint grid
  ctx.fillStyle = "rgba(10,20,20,0.13)";
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    if (G.W.blocked(tx, ty)) continue;
    const sx = tx * TILE - cx, sy = ty * TILE - cy;
    ctx.fillRect(Math.round(sx), Math.round(sy), TILE, 1); ctx.fillRect(Math.round(sx), Math.round(sy), 1, TILE);
  }
  if (u.team !== "party" || C.busy) return;
  const ab = C.ability ? ABILITIES[C.ability] : null;
  if (ab) {
    ctx.fillStyle = ab.kind === "heal" || ab.kind === "potion" ? "rgba(120,240,120,0.12)" : "rgba(255,140,60,0.12)";
    for (let ty = uy - ab.range; ty <= uy + ab.range; ty++) for (let tx = ux - ab.range; tx <= ux + ab.range; tx++)
      if (!G.W.blocked(tx, ty)) ctx.fillRect(Math.round(tx * TILE - cx) + 1, Math.round(ty * TILE - cy) + 1, TILE - 1, TILE - 1);
  } else if (u.moveLeft > 0) {
    // the reach of this turn's movement: a light fill and a bright border
    const reach = reachable(blockedFor(u), ux, uy, u.moveLeft);
    const pulse = 0.55 + Math.sin(G.time * 3) * 0.15;
    for (const [k] of reach) {
      const tx = k % MW, ty = (k / MW) | 0, sx = Math.round(tx * TILE - cx), sy = Math.round(ty * TILE - cy);
      ctx.fillStyle = "rgba(95,208,200,0.07)";
      ctx.fillRect(sx, sy, TILE, TILE);
      ctx.fillStyle = `rgba(120,236,224,${pulse})`;
      if (!reach.has(k - MW)) ctx.fillRect(sx, sy, TILE, 1);
      if (!reach.has(k + MW)) ctx.fillRect(sx, sy + TILE - 1, TILE, 1);
      if (!reach.has(k - 1)) ctx.fillRect(sx, sy, 1, TILE);
      if (!reach.has(k + 1)) ctx.fillRect(sx + TILE - 1, sy, 1, TILE);
    }
  }
  if (C.preview?.path?.length) {
    ctx.fillStyle = "#f4ecdc";
    let [px, py] = [u.x, u.y - 8];
    for (const [tx, ty] of C.preview.path) {
      const [wx, wy] = tileCenter(tx, ty);
      for (let s = 0; s < 1; s += 0.2) ctx.fillRect(Math.round(px + (wx - px) * s - cx), Math.round(py + (wy - 8 - py) * s - cy), 2, 2);
      [px, py] = [wx, wy - 8];
    }
    const [ex, ey] = C.preview.path[C.preview.path.length - 1];
    ctx.strokeStyle = "#e8c06a"; ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(ex * TILE - cx) + 1.5, Math.round(ey * TILE - cy) + 1.5, TILE - 3, TILE - 3);
  }
  // hovered tile
  const mx = G.mouse.tx, my = G.mouse.ty;
  if (G.mouse.in && !G.W.blocked(mx, my)) { ctx.strokeStyle = "rgba(244,236,220,0.5)"; ctx.strokeRect(Math.round(mx * TILE - cx) + 0.5, Math.round(my * TILE - cy) + 0.5, TILE - 1, TILE - 1); }
}

function draw() {
  const vw = G.vw, vh = G.vh;
  let cx = Math.round(G.cam.x), cy = Math.round(G.cam.y);
  if (G.shake > 0) { cx += Math.round((Math.random() - 0.5) * 4); cy += Math.round((Math.random() - 0.5) * 4); }
  ctx.fillStyle = "#0b0a10"; ctx.fillRect(0, 0, vw, vh);
  ctx.drawImage(ground, cx, cy, vw, vh, 0, 0, vw, vh);

  // water: drifting glints and a breathing shoreline
  const t = G.time;
  for (const s of sparkles) {
    if (s.x < cx - 8 || s.x > cx + vw + 8 || s.y < cy - 4 || s.y > cy + vh + 4) continue;
    const ph = (t * s.sp + s.ph) % 1;
    if (ph > 0.4) continue;
    const a = Math.sin((ph / 0.4) * Math.PI);
    const len = Math.max(1, Math.round(s.len * a));
    ctx.fillStyle = s.edge ? `rgba(220,255,240,${0.75 * a})` : `rgba(200,250,240,${0.6 * a})`;
    const x = Math.round(s.x - cx + ph * 6), y = Math.round(s.y - cy);
    ctx.fillRect(x, y, len, 1);
    if (len > 3) ctx.fillRect(x + 1, y - 1, len - 2, 1);
  }

  // click marker
  if (clickMark) ring(clickMark.x - cx, clickMark.y - cy, `rgba(232,192,106,${clickMark.t * 2})`, 6 + (0.5 - clickMark.t) * 10);
  drawCombatGrid(cx, cy);

  // everything standing, sorted by its feet
  const items = [];
  const inView = (x, y, m = 120) => x > cx - m && x < cx + vw + m && y > cy - 20 && y < cy + vh + 140;
  for (const o of G.W.objects) if (inView(o.x, o.y)) items.push({ y: o.y, o });
  for (const g of G.W.grass) if (inView(g.x, g.y, 20)) items.push({ y: g.y, g });
  for (const u of [...G.party, ...G.enemies, ...G.npcs]) if (!u.gone && inView(u.x, u.y)) items.push({ y: u.y, u });
  G.chests.forEach((c, i) => inView(c.x, c.y) && items.push({ y: c.y, c }));
  items.sort((a, b) => a.y - b.y);
  // shadows first, so nothing's shadow falls on top of a neighbour
  for (const it of items) {
    const r = it.o ? it.o.art?.shadow : it.u ? (it.u.small ? 7 : 9) : it.c ? 12 : 0;
    if (!r) continue;
    const x = (it.o ?? it.u ?? it.c).x, y = (it.o ?? it.u ?? it.c).y;
    const s = shadowOf(r);
    ctx.drawImage(s, Math.round(x - cx - s.width / 2), Math.round(y - cy - s.height / 2 - (it.o ? 1 : 0)));
  }
  const l = lead();
  // active / hover rings
  if (G.mode === "combat" && G.combat?.active) ring(G.combat.active.x - cx, G.combat.active.y - cy - 1, G.combat.active.team === "party" ? "#e8c06a" : "#ff5a4a", 11);
  else if (G.mode === "explore") ring(l.x - cx, l.y - cy - 1, "rgba(232,192,106,0.55)", 9);
  for (const it of items) {
    if (it.u) { drawUnit(it.u, cx, cy); continue; }
    if (it.c) { const a = G.chestArt[it.c.open ? 1 : 0]; ctx.drawImage(a.c, Math.round(it.c.x - cx - a.ox), Math.round(it.c.y - cy - a.oy)); continue; }
    if (it.g) {
      const ga = grassArt[it.g.v];
      let f = Math.floor((t * 1.6 + it.g.ph) % 4);
      for (const p of G.party) if (Math.abs(p.x - it.g.x) < 9 && Math.abs(p.y - it.g.y) < 6) f = p.x < it.g.x ? 1 : 3;
      ctx.drawImage(ga.frames[f], Math.round(it.g.x - cx - ga.ox), Math.round(it.g.y - cy - ga.oy));
      continue;
    }
    const o = it.o, a = o.art;
    if (!a) continue;
    const x = Math.round(o.x - cx - a.ox), y = Math.round(o.y - cy - a.oy);
    if (a.canopy) {
      // see-through canopy when someone stands behind it
      const bx = o.x - a.ox + a.canopy.x, by = o.y - a.oy + a.canopy.y;
      const hide = [...G.party, ...G.enemies].some((u) => !u.gone && u.y < o.y - 2 && u.x > bx && u.x < bx + a.canopy.w && u.y - 20 > by && u.y - 20 < by + a.canopy.h);
      if (hide) { ctx.globalAlpha = 0.45; ctx.drawImage(a.c, x, y); ctx.globalAlpha = 1; continue; }
      // a slight sway at the very top of trees
    }
    ctx.drawImage(a.c, x, y);
  }
  drawBars(cx, cy);

  // atmosphere: the ruins are darker and misty
  const ruinK = clamp(1 - Math.max(0, (l.y - 15 * TILE)) / (6 * TILE)) * (l.x < 33 * TILE ? 1 : 0.3);
  if (ruinK > 0.01) {
    ctx.fillStyle = `rgba(16,20,40,${0.32 * ruinK})`;
    ctx.fillRect(0, 0, vw, vh);
  }
  G.fx.draw(ctx, cx, cy);
  drawCritters(cx, cy, ruinK);
  const mk = 0.08 + ruinK * 0.7;
  ctx.globalAlpha = mk;
  const mx = -((cx * 1.0 + t * 8) % mist.width) - mist.width, my = -((cy * 1.0 + t * 3) % mist.height) - mist.height;
  for (let y = my; y < vh; y += mist.height) for (let x = mx; x < vw; x += mist.width) ctx.drawImage(mist, Math.round(x), Math.round(y));
  ctx.globalAlpha = 1;

  // framing: branches at the bottom corners, and a vignette
  ctx.drawImage(fgLeft, Math.round(-30 - (cx * 0.05) % 10), vh - fgLeft.height + 34);
  ctx.save(); ctx.scale(-1, 1); ctx.drawImage(fgRight, Math.round(-vw - 24 + (cx * 0.05) % 10), vh - fgRight.height + 40); ctx.restore();
  if (!vignette || vignette.width !== vw || vignette.height !== vh) {
    const [c, vx] = makeCanvas(vw, vh);
    const g = vx.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.35, vw / 2, vh / 2, Math.max(vw, vh) * 0.72);
    g.addColorStop(0, "rgba(8,6,14,0)"); g.addColorStop(1, "rgba(8,6,14,0.55)");
    vx.fillStyle = g; vx.fillRect(0, 0, vw, vh);
    vignette = c;
  }
  ctx.drawImage(vignette, 0, 0);
}

function drawCritters(cx, cy, ruinK) {
  const t = G.time;
  ctx.save();
  for (const c of critters) {
    const a = t * c.sp + c.ph;
    const x = Math.round(c.x + Math.sin(a) * c.r + Math.sin(a * 2.3) * 6 - cx), y = Math.round(c.y + Math.sin(a * 1.7) * c.r * 0.5 + Math.cos(a * 3.1) * 4 - cy - 14);
    if (x < -4 || y < -4 || x > G.vw + 4 || y > G.vh + 4) continue;
    if (c.kind === "bf") {
      const open = Math.floor(t * 12 + c.ph) % 2 === 0;
      ctx.fillStyle = "rgba(10,20,10,0.25)"; ctx.fillRect(x, y + 12, 2, 1);
      ctx.fillStyle = c.c[0];
      if (open) { ctx.fillRect(x - 2, y - 1, 2, 2); ctx.fillRect(x + 1, y - 1, 2, 2); ctx.fillStyle = c.c[1]; ctx.fillRect(x - 2, y - 1, 1, 1); ctx.fillRect(x + 2, y - 1, 1, 1); }
      else { ctx.fillRect(x - 1, y - 2, 1, 2); ctx.fillRect(x + 1, y - 2, 1, 2); }
      ctx.fillStyle = "#1a1020"; ctx.fillRect(x, y - 1, 1, 2);
    } else {
      const b = Math.max(0, Math.sin(t * 2.2 + c.ph * 3)) * (0.35 + ruinK * 0.65);
      if (b < 0.05) continue;
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = `rgba(120,160,40,${b * 0.35})`; ctx.fillRect(x - 1, y - 1, 3, 3);
      ctx.fillStyle = `rgba(230,255,150,${b})`; ctx.fillRect(x, y, 1, 1);
      ctx.globalCompositeOperation = "source-over";
    }
  }
  ctx.restore();
}

let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop); // schedule first: an error in one frame must not freeze the game
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const a = performance.now();
  if (!G.paused) update(dt);
  const b = performance.now();
  draw();
  G.perf = { update: b - a, draw: performance.now() - b };
}

window.G = G; // handy from the console
boot();
