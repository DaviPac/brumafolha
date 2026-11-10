// Brumafolha: boot, the maps, exploring, cutscenes, and drawing it all. The prologue's script lives in story.js.
import { G, lead, living } from "./state.js";
import { TILE, makeCanvas, hash2, Rng, dist, clamp, vnoise } from "./util.js";
import { buildWorld, MW, MH, zoneAt, T, waterField } from "./world.js";
import { buildDream, buildRelic } from "./maps.js";
import { paintGround, waterSparkles, PAL as GPAL } from "./art/ground.js";
import * as A from "./art/props.js";
import * as I from "./art/interiors.js";
import { buildCharacter, portrait, SPECS, SW, SH } from "./art/chars.js";
import { findPath, reachable } from "./path.js";
import { FxLayer, FX, PAL } from "./fx.js";
import * as UI from "./ui.js";
import { openDialogue, dialogueKey } from "./dialogue.js";
import { initAudio, playMusic, updateAmbience, sfx, settings as audioSet, toggleMute, setMuted, setVolume, previewSound, SOUND_GROUPS } from "./audio.js";
import { openCreator } from "./creator.js";
import { CLASSES, heroDef, specOf, combatStats, weaponProficient, armorAllowed, shieldAllowed } from "./rules.js";
import { WEAPONS, ARMORS, gearItem } from "./items.js";
import { startCombat, combatClick, combatHover, endTurn, selectAbility, abilitiesOf, abilityOf, tileOf, tileCenter, blockedFor, refreshCombatHotbar } from "./combat.js";
import { hint, setTutorial } from "./tutorial.js";
import { toggleJournal, closeJournal, journalOpen, refreshJournal } from "./journal.js";
import * as S from "./story.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
let mist, vignette, fgLeft, fgRight, fogC, fogX, reflA, reflB;
const art = new Map();
const shadows = new Map();
const grassArt = [];
const maps = {};

const nextFrame = () => new Promise((r) => setTimeout(r, 16));

// ---------------------------------------------------------------- boot
async function boot() {
  const t0 = performance.now();
  for (let v = 0; v < 6; v++) grassArt.push(A.makeTallGrass(v));
  mist = makeMist();
  fgLeft = silhouette(11); fgRight = silhouette(29);
  G.fx = new FxLayer();
  spawnCompanions();
  S.init(E);
  for (const id of ["vale", "sonho", "relicario"]) { buildMap(id); await nextFrame(); }
  loadMap("vale", 15, 38);
  resize();

  console.log(`loaded in ${Math.round(performance.now() - t0)} ms`);
  document.querySelector(".loading").classList.add("hidden");
  document.querySelector(".help").classList.remove("hidden");
  const btn = document.getElementById("start");
  btn.classList.remove("hidden");
  btn.onclick = create;
  requestAnimationFrame(loop);
}

function create() {
  initAudio();
  document.getElementById("title").classList.add("hidden");
  G.mode = "create";
  openCreator((build) => { recruit(build); begin(); }, (b) => companionFor(b).label);
}
/** Who joins the hero: a fighter for a spellcaster, the elven mage otherwise. */
function companionFor(b) {
  return CLASSES[b.cls].role === "caster" ? { u: G.cast.kael, label: "Kael, guerreiro" } : { u: G.cast.lyra, label: "Lyra, maga élfica" };
}
function recruit(build) {
  const hero = unit(specOf(build), { ...heroDef(build), tx: 15, ty: 38 });
  hero.spec = specOf(build);
  G.hooks.refreshJournal?.();
  G.build = build;
  G.hero = hero;
  G.mate = companionFor(build).u;
  G.party = [hero];
  G.leader = 0;
}

function begin() {
  setupMenu();
  G.mode = "cutscene";
  S.start();
}

// ---------------------------------------------------------------- the maps
function buildMap(id) {
  const W = id === "vale" ? buildWorld() : id === "sonho" ? buildDream() : buildRelic();
  const g = document.createElement("canvas");
  g.width = W.w * TILE; g.height = W.h * TILE;
  const img = id === "vale" ? paintGround(W) : I.paintInterior(W, T);
  g.getContext("2d").putImageData(img, 0, 0);
  W.ground = g;
  if (id === "vale") W.waterMask = waterMask(img);
  W.sparkles = id === "vale" ? waterSparkles(W) : [];
  W.enemies = []; W.npcs = []; W.chests = []; W.groups = {};
  S.populate(W);
  for (const o of W.objects) o.art = propArt(o);
  for (const c of W.chests) W.block[Math.floor((c.y - 1) / TILE) * MW + Math.floor(c.x / TILE)] = 1;
  W.critters = makeCritters(W);
  maps[id] = W;
  return W;
}

/** Switch to a map and put the party (and followers) around a tile. */
function loadMap(id, tx, ty, dir = 3) {
  const W = maps[id];
  G.W = W;
  G.enemies = W.enemies; G.npcs = W.npcs; G.chests = W.chests; G.groups = W.groups;
  for (const e of G.fx.list) e.keep = false;
  G.fx.list = [];
  for (const o of W.objects) if (o.kind === "campfire" && !o.out) o.fxe = G.fx.spawn(FX.campfire, { x: o.x, y: o.y + 2, light: 0.55, ...(o.goblin ? { seed: 3 } : {}) }, { keep: true });
  const spots = freeAround(tx, ty, G.party.length + G.followers.length);
  [...G.party, ...G.followers].forEach((u, i) => { [u.x, u.y] = tileCenter(...spots[i]); u.path = []; u.dir = dir; });
  trail.length = 0;
  const l = lead();
  if (l) { G.cam.x = l.x - G.vw / 2; G.cam.y = l.y - G.vh / 2; }
  zoneNow = "";
}

function freeAround(tx, ty, n) {
  const out = [];
  for (let r = 0; r < 6 && out.length < n; r++)
    for (let dy = -r; dy <= r && out.length < n; dy++)
      for (let dx = -r; dx <= r && out.length < n; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (!G.W.blocked(tx + dx, ty + dy) || (r === 0 && out.length === 0)) out.push([tx + dx, ty + dy]);
      }
  return out;
}

function makeCritters(W) {
  const out = [], R = new Rng(17 + W.id.length);
  if (W.id === "vale") {
    const BF = [["#5b2c8f", "#c99cff"], ["#a04a10", "#ffc46a"], ["#2a5a8a", "#9adcff"], ["#c0c0d0", "#ffffff"]];
    for (let i = 0; i < 26; i++) {
      const x = R.range(4, MW - 4) * TILE, y = R.range(4, MH - 4) * TILE;
      if (W.tileAt((x / TILE) | 0, (y / TILE) | 0) !== 0) continue;
      out.push({ kind: "bf", x, y, c: R.pick(BF), ph: R.range(0, 9), r: R.range(14, 40), sp: R.range(0.3, 0.7) });
    }
    for (let i = 0; i < 70; i++) {
      const inR = i < 40;
      const x = inR ? R.range(10, 30) * TILE : R.range(32, 76) * TILE, y = inR ? R.range(3, 14) * TILE : R.range(17, 37) * TILE;
      out.push({ kind: "ff", x, y, ph: R.range(0, 9), r: R.range(8, 30), sp: R.range(0.15, 0.4) });
    }
  } else {
    // slow pale motes of light
    for (let i = 0; i < 50; i++) out.push({ kind: "mote", x: R.range(2, W.w - 2) * TILE, y: R.range(2, W.h - 2) * TILE, ph: R.range(0, 9), r: R.range(10, 40), sp: R.range(0.08, 0.2) });
  }
  return out;
}

function propArt(o) {
  const key = (k) => { if (!art.has(k)) art.set(k, makeArt(o)); return art.get(k); };
  switch (o.kind) {
    // leafy trees carry a few wind frames each: share 48 variants of each instead of one per tree
    case "tree": case "pine": return key(o.kind + (o.seed % 48));
    case "deadtree": case "rock": case "bush": case "fern": case "waterrock": case "rubble": case "bones": return key(o.kind + o.seed);
    case "wall": return key(`wall${o.h}-${o.seed % 7}`);
    case "pillar": return key(`pillar${o.h}-${o.seed}`);
    case "rpillar": return key(`rpillar${o.seed}`);
    case "tower": return key(`tower${o.h}-${o.seed % 9}`);
    case "post": return key("post" + o.h);
    case "tent": return key("tent" + o.color);
    case "statue": return key(`statue${o.lit ? 1 : 0}`);
    case "door": return key(`door${o.lit}`);
    case "pedestal": return key(`pedestal${o.empty ? 0 : 1}`);
    case "trapdoor": return key(`trapdoor${o.open ? 1 : 0}`);
    case "relief": return o.spec ? key(`relief-${o.who}-${o.blank ? 0 : 1}-${o.v ?? 0}`) : null;
    case "deer": return key(`deer${o.frame ?? 0}`);
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
    case "rpillar": return A.makePillar(o.h, o.seed, I.IRAMP.marble, false);
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
    case "tower": return I.makeTower(o.seed, o.h);
    case "lantern": return I.makeLantern();
    case "pedestal": return I.makePedestal(!o.empty);
    case "statue": return I.makeStatue(SPECS.statue, o.lit);
    case "door": return I.makeDoor(o.lit);
    case "relief": return I.makeRelief(o.spec, o.blank);
    case "deer": return I.makeDeer(o.frame ?? 0);
    case "loot": return I.makeLoot();
    case "trapdoor": return I.makeTrapdoor(o.open);
    case "marker": return I.makeMarker();
  }
}
const shadowOf = (r) => { r = Math.round(r); if (!shadows.has(r)) shadows.set(r, A.makeShadow(r)); return shadows.get(r); };

/** Where the ground is open water (the water ramp's colours), as an alpha mask the reflections are cut to. */
function waterMask(img) {
  const keys = new Set(GPAL.water.map((c) => (c[0] << 16) | (c[1] << 8) | c[2]));
  const m = new ImageData(img.width, img.height), s = img.data, d = m.data;
  for (let i = 0; i < s.length; i += 4) if (keys.has((s[i] << 16) | (s[i + 1] << 8) | s[i + 2])) d[i + 3] = 255;
  const [c, cx] = makeCanvas(img.width, img.height);
  cx.putImageData(m, 0, 0);
  return c;
}

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
  u.hp = u.maxHp ?? 1;
  u.slots = u.maxSlots ?? 0;
  [u.x, u.y] = tileCenter(def.tx ?? 0, def.ty ?? 0);
  return u;
}

// the companions are built by the same rules as the hero, so they can change gear too
const KAEL = { race: "humano", cls: "guerreiro", gender: "m", name: "Kael", base: { FOR: 15, DES: 12, CON: 14, INT: 9, SAB: 12, CAR: 11 },
  look: { skin: 1, hair: 1, style: "short", beard: null, eyes: 0, outfit: 0, cape: 1 }, equip: { main: "espadaLonga", ranged: null, armor: "malha", shield: null },
  extraSkills: ["Persuasão", "Medicina", "Percepção"] };
const LYRA = { race: "elfo", cls: "mago", gender: "f", name: "Lyra", base: { FOR: 8, DES: 14, CON: 14, INT: 15, SAB: 12, CAR: 10 },
  look: { skin: 0, hair: 5, style: "long", beard: null, eyes: 2, outfit: 3, cape: 0 }, equip: { main: "cajado", ranged: null, armor: "robe", shield: null },
  extraSkills: ["História", "Natureza", "Intuição"], extraAbilities: ["heal"] };
function spawnCompanions() {
  const mk = (b, key, veteran) => {
    const u = unit(specOf(b), { ...heroDef(b, key), tx: 14, ty: 39, ...veteran });
    u.spec = specOf(b);
    u.hp = u.maxHp; u.slots = u.maxSlots ?? 0;
    return u;
  };
  // veterans of the road: more hit points than a fresh level-1 sheet, and Lyra has a spell slot more
  const kael = mk(KAEL, "kael", { maxHp: 26, hpPerLevel: 8 });
  const lyra = mk(LYRA, "lyra", { maxHp: 16, hpPerLevel: 5, slotBonus: 1 });
  regear(lyra);
  lyra.slots = lyra.maxSlots;
  G.cast = { kael, lyra };
}

/** Recompute a party member's numbers and sprite from their gear (after equipping, or a level-up). */
function regear(u, look = true) {
  const keep = u.abilities.filter((k) => k === "lampejo");
  Object.assign(u, combatStats(u.build, u.equip, undefined, u.bonusAtk ?? 0));
  u.abilities.push(...keep);
  if (u.maxSlots) { u.maxSlots += u.slotBonus ?? 0; u.slots = Math.min(u.slots ?? u.maxSlots, u.maxSlots); }
  if (look) { u.spec = specOf(u.build, u.equip); u.ch = buildCharacter(u.spec); u.portrait = portrait(u.ch); }
}

/** Put a bag item on (or take a slot off with item = null). Returns an error message, or nothing. */
G.hooks.equip = (u, slot, item) => {
  if (G.mode === "combat") return "Não dá para trocar de equipamento no meio do combate.";
  if (item) {
    const C = u.build.cls;
    if (item.gear === "weapon") {
      slot = WEAPONS[item.key].props.includes("dist") ? "ranged" : "main";
    } else if (item.gear === "armor") {
      slot = "armor";
      if (!armorAllowed(C, item.key)) return `${u.name} não sabe usar armadura ${ARMORS[item.key].cat === "pesada" ? "pesada" : ARMORS[item.key].cat === "media" ? "média" : "leve"}.`;
    } else if (item.gear === "shield") {
      slot = "shield";
      if (!shieldAllowed(C)) return `${u.name} não sabe lutar com escudo.`;
    }
  }
  const old = u.equip[slot], empty = slot === "armor" ? "roupas" : slot === "main" ? "punhos" : null;
  if (old && old !== empty) G.items.push(gearItem(slot === "main" || slot === "ranged" ? "weapon" : slot, old));
  u.equip[slot] = item ? item.key : empty;
  if (item) G.items.splice(G.items.indexOf(item), 1);
  regear(u);
  sfx.chest();
  UI.buildParty(selectLeader);
  exploreHotbar();
};
G.hooks.regear = regear;

// ---------------------------------------------------------------- the engine, as the story sees it
const sleep = (ms) => new Promise((r) => {
  let left = ms, last = performance.now();
  const tick = () => { const now = performance.now(); if (!G.paused) left -= now - last; last = now; left <= 0 ? r() : setTimeout(tick, Math.min(left, 50)); };
  setTimeout(tick, Math.min(ms, 50));
});
const E = {
  unit, loadMap, sleep, tileCenter, tileOf, propArt,
  map: (id) => maps[id],
  obj: (id, W = G.W) => W.objects.find((o) => o.id === id),
  refresh: (o) => { o.art = propArt(o); },
  place(u, tx, ty, dir) { [u.x, u.y] = tileCenter(tx, ty); u.path = []; if (dir != null) u.dir = dir; },
  /** Walk a unit to a tile along a path (resolves on arrival; immediately if there's no path). */
  walk(u, tx, ty, speed = 70) {
    const [sx, sy] = tileOf(u);
    const p = findPath((x, y) => G.W.blocked(x, y) && !(x === tx && y === ty), sx, sy, tx, ty);
    if (!p || !p.length) return Promise.resolve();
    u.path = p.map(([x, y]) => tileCenter(x, y));
    u.speed = speed;
    return new Promise((res) => { u.onArrive = res; });
  },
  face(u, t) { const dx = t.x - u.x, dy = t.y - u.y; u.dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 1 : 2) : dy < 0 ? 3 : 0; },
  hotbar: () => exploreHotbar(),
  partyChanged() { UI.buildParty(selectLeader); UI.updateQuest(); exploreHotbar(); },
  resetTrail: () => { trail.length = 0; },
  fight(group, opts) { G.mode = "explore"; G.camFocus = null; startCombat(group, opts); },
  zone: () => { zoneNow = ""; },
};

// ---------------------------------------------------------------- hooks used by other modules
G.hooks.focus = (u) => { G.focus = u; };
G.hooks.afterDialogue = () => exploreHotbar();
G.hooks.hint = hint;
G.hooks.gainXp = (p, xp) => {
  if (p.ai) return; // allies who only fight alongside for a moment
  p.xp += xp;
  while (p.xp >= p.nextXp) {
    p.level++; p.maxHp += p.hpPerLevel; p.hp = p.maxHp; p.nextXp = Math.round(p.nextXp * 2.6);
    if (p.role === "martial") p.bonusAtk = (p.bonusAtk ?? 0) + 1;
    if (p.maxSlots) { p.slotBonus = (p.slotBonus ?? 0) + 1; }
    if (p.build) regear(p, false);
    else if (p.role === "martial") { p.atk++; if (p.bow) p.bow.atk++; }
    p.slots = p.maxSlots ?? 0;
    setTimeout(() => { UI.toast(`${p.name} alcançou o nível ${p.level}!`); sfx.levelUp(); G.fx.spawn(FX.bloom, { x: p.x, y: p.y + 2, palette: PAL.holy }); }, 1800);
  }
  UI.updateParty();
};
G.hooks.combatStart = () => {
  UI.tooltip(null);
  checkpoint = snapshot();
  hint("combat");
};
G.hooks.combatEnd = (group) => {
  G.focus = null;
  checkpoint = null;
  S.onCombatEnd(group);
  UI.updateQuest();
  exploreHotbar();
};
G.hooks.gameOver = () => {
  playMusic(null, 0.6); sfx.defeat();
  const d = document.createElement("div");
  d.id = "gameover";
  d.innerHTML = `<div style="text-align:center"><h1 style="font-size:54px;color:#ff6a5a;margin:0">O grupo caiu</h1><p style="color:#a89c86">As brumas do vale guardam mais um segredo.</p>
    ${checkpoint ? '<button id="retry">Tentar a luta de novo</button> ' : ""}<button id="restart">Recomeçar do início</button></div>`;
  document.getElementById("ui").appendChild(d);
  d.querySelector("#restart").onclick = () => location.reload();
  d.querySelector("#retry")?.addEventListener("click", () => { d.remove(); retry(); });
};
G.hooks.lampejo = {
  can: () => G.hero?.abilities.includes("lampejo") && !G.hero.restUsed.lampejo,
  use: () => { G.hero.restUsed.lampejo = true; if (G.combat) refreshCombatHotbar(); },
};

// ---------------------------------------------------------------- try a lost fight again
let checkpoint = null;
const UNIT_KEYS = ["x", "y", "hp", "maxHp", "slots", "maxSlots", "level", "xp", "nextXp", "atk", "dir", "gone", "skip", "forgotten", "ai", "alpha", "bonusAtk", "slotBonus", "raging", "smiteNext", "inspired", "mocked", "marked"];
function snapshot() {
  const units = [...new Set([...G.party, ...G.enemies, ...G.npcs, ...G.followers])];
  return {
    group: G.combat.group, opts: G.combat.opts,
    party: [...G.party], followers: [...G.followers], enemies: [...G.enemies], npcs: [...G.npcs],
    units: units.map((u) => ({ u, v: Object.fromEntries(UNIT_KEYS.map((k) => [k, u[k]])), restUsed: { ...u.restUsed }, abilities: [...u.abilities], bow: u.bow && { ...u.bow } })),
    f: structuredClone(G.f), items: structuredClone(G.items), memories: structuredClone(G.memories), approval: { ...G.approval },
    potions: G.potions, gold: G.gold,
  };
}
function retry() {
  const cp = checkpoint;
  G.party = cp.party; G.followers = cp.followers;
  G.W.enemies = G.enemies = cp.enemies; G.W.npcs = G.npcs = cp.npcs;
  for (const { u, v, restUsed, abilities, bow } of cp.units) { Object.assign(u, v, { restUsed, abilities, bow, path: [], lunge: null, knock: null, pose: "idle" }); }
  // the story holds references to these, so refill them in place
  for (const k of Object.keys(G.f)) delete G.f[k];
  Object.assign(G.f, cp.f);
  G.items.splice(0, G.items.length, ...cp.items);
  G.memories.splice(0, G.memories.length, ...cp.memories);
  Object.assign(G.approval, cp.approval);
  Object.assign(G, { potions: cp.potions, gold: cp.gold, combat: null, mode: "explore", advNext: false });
  S.onRetry();
  E.partyChanged();
  startCombat(cp.group, cp.opts);
}

function selectLeader(i) {
  if (G.mode !== "explore" || G.party[i].hp <= 0 || G.party[i].ai) return;
  G.leader = i;
  trail.length = 0;
  UI.updateParty();
  exploreHotbar();
}

function exploreHotbar() {
  if (G.mode === "combat" || !G.party.length) return;
  const u = lead();
  UI.buildHotbar([
    { icon: "🧪", name: "Poção de Cura", desc: `Recupera 2d4+2 PV de ${u.name}. Você tem ${G.potions}.`, count: G.potions, off: G.potions <= 0 || u.hp >= u.maxHp,
      use: () => { G.potions--; const r = 2 + Math.ceil(Math.random() * 4) + Math.ceil(Math.random() * 4); u.hp = Math.min(u.maxHp, u.hp + r); UI.floater(u.x, u.y - 34, `+${r}`, "heal"); G.fx.spawn(FX.bloom, { x: u.x, y: u.y + 2 }); UI.updateParty(); exploreHotbar(); } },
    { icon: "🔁", name: "Trocar líder", desc: "Controla o outro personagem (Tab).", off: G.party.length < 2, use: () => selectLeader((G.leader + 1) % G.party.length) },
    { icon: "🎒", name: "Bolsa", desc: "Itens e cartas (I).", use: () => toggleJournal("bag") },
    { icon: "📖", name: "Diário", desc: "Missões e lembranças (J).", use: () => toggleJournal("quests") },
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
  u.speed = Math.min(90, G.speedCap ?? 90);
  return true;
}

function interactables() {
  const list = [];
  for (const n of G.npcs) if (!n.gone && n.talk) list.push({ x: n.x, y: n.y, name: n.label ?? n.name, r: 14, act: () => talk(n), ent: n });
  for (const c of G.chests) if (!c.open) list.push({ x: c.x, y: c.y, name: c.name, r: 14, act: () => openChest(c) });
  for (const o of G.W.objects) if (o.kind === "campfire" && !o.goblin && !o.out) list.push({ x: o.x, y: o.y, name: "Fogueira (descansar)", r: 16, act: rest });
  list.push(...S.interactables());
  return list;
}
function underMouse() {
  const { wx, wy } = G.mouse;
  return interactables().find((i) => Math.abs(wx - i.x) < i.r && wy < i.y + 4 && wy > i.y - (i.h ?? 34));
}
function talk(n) {
  const l = lead();
  if (!n.fixed) n.dir = Math.abs(l.x - n.x) > Math.abs(l.y - n.y) ? (l.x < n.x ? 1 : 2) : l.y < n.y ? 3 : 0;
  const t = n.talk();
  if (t) openDialogue(n, t);
}
function openChest(c) {
  c.open = true;
  G.potions += c.loot.potions; G.gold += c.loot.gold;
  G.fx.spawn(FX.hitSpark, { x: c.x, y: c.y - 12, palette: PAL.gold });
  sfx.chest();
  const got = [c.loot.item, ...(c.loot.items ?? [])].filter(Boolean);
  UI.toast(`${c.name}: +${c.loot.potions} poção${c.loot.gold ? `, +${c.loot.gold} ouro` : ""}${got.length ? ", " + got.map((i) => i.name).join(", ") : ""}`, 3600);
  got.forEach(S.giveItem);
  if (got.some((i) => i.gear)) hint("gear");
  c.onOpen?.();
  exploreHotbar();
}
function rest() {
  if (G.enemies.some((e) => e.hp > 0 && !e.gone && !e.passive && dist(e.x, e.y, lead().x, lead().y) < 400)) { UI.toast("Não dá pra descansar com inimigos por perto."); return; }
  for (const p of G.party) { p.hp = p.maxHp; p.slots = p.maxSlots ?? 0; p.restUsed = {}; G.fx.spawn(FX.bloom, { x: p.x, y: p.y + 2, palette: PAL.holy }); }
  UI.toast("Descanso longo: vida, magias e habilidades restauradas.");
  sfx.rest();
  UI.updateParty();
  exploreHotbar();
  S.onRest();
}

function nearestInteractable() {
  const l = lead();
  let best = null;
  for (const i of interactables()) { const d = dist(i.x, i.y, l.x, l.y); if (d < (i.reach ?? 52) && (!best || d < best.d)) best = { ...i, d }; }
  return best;
}

function onClick() {
  if (G.mode === "combat") { combatClick(G.mouse.tx, G.mouse.ty); return; }
  if (G.mode !== "explore") return;
  const l = lead();
  const it = underMouse();
  if (it) {
    if (dist(it.x, it.y, l.x, l.y) < (it.reach ?? 48)) { it.act(); return; }
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
  if (G.mode === "create" || e.target?.tagName === "INPUT") return; // typing a name
  const k = e.key.toLowerCase();
  G.keys.add(k);
  if (k === "m" && G.mode !== "title") { syncMute(toggleMute()); return; }
  if (G.mode === "title" || G.mode === "over" || G.mode === "end") return;
  if (journalOpen()) { if (k === "escape" || k === "i" || k === "j") closeJournal(); return; }
  // Esc first cancels a chosen combat action; otherwise it (or P) opens and closes the menu
  if (k === "escape" && !G.paused && G.combat?.ability) { G.combat.ability = null; return; }
  if (k === "escape" || k === "p") { setPaused(!G.paused); return; }
  if (G.paused) return;
  if ((k === "i" || k === "j") && G.mode !== "dialogue") { toggleJournal(k === "i" ? "bag" : "quests"); return; }
  if (G.mode === "dialogue" && /^[1-9]$/.test(k)) dialogueKey(+k);
  else if (G.mode === "combat") {
    if (k === " ") { e.preventDefault(); endTurn(); }
    if (/^[1-9]$/.test(k)) { const u = G.combat?.active; const ab = u?.team === "party" && !u.ai && abilitiesOf(u)[+k - 1]; if (ab) selectAbility(ab.key); }
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

/** Everyone who isn't the leader walks the leader's trail: the party first, then followers. */
function followTrail(dt) {
  const l = lead();
  const last = trail[0];
  if (!last || dist(last[0], last[1], l.x, l.y) > 3) { trail.unshift([l.x, l.y, l.dir]); if (trail.length > 200) trail.pop(); }
  const others = [...G.party.filter((p) => p !== l && p.hp > 0), ...G.followers];
  others.forEach((p, i) => {
    const want = 22 * (i + 1);
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
}

// ---------------------------------------------------------------- audio
const campfires = () => G.W.objects.filter((o) => o.kind === "campfire" && !o.out);
function surfaceAt(x, y) {
  const t = G.W.tileAt(Math.floor(x / TILE), Math.floor((y - 2) / TILE));
  return t === T.DOCK ? "wood" : t === T.STONE || t === T.MARBLE || t === T.STAIRS ? "stone" : t === T.PATH ? "dirt" : t === T.WATER ? "water" : "grass";
}
function updateAudio(dt) {
  if (G.mode === "title" || G.mode === "create" || !G.party.length) return;
  const l = lead(), vale = G.W.id === "vale";
  const zone = vale ? zoneAt(l.x, l.y) : G.W.zone, ruins = zone === "Ruínas de Velmoor";
  const track = G.musicOverride !== undefined ? G.musicOverride : G.mode === "combat" ? "combat" : G.mode === "over" ? null : !vale ? "dream" : ruins ? "ruins" : "meadow";
  playMusic(track, G.mode === "combat" ? 0.5 : 2.5);
  const w = vale ? waterField(l.x, l.y) : 9, fire = Math.max(0, ...campfires().map((o) => 1 - dist(o.x, o.y, l.x, l.y) / 220));
  updateAmbience({
    wind: !vale ? 0.35 : ruins ? 1 : 0.7, water: clamp(1 - w / 1.1, 0, 1), fire,
    birds: !vale || ruins || G.mode === "combat" || G.f.escape ? 0 : 1, ruins: !vale ? 0.8 : ruins ? 1 : 0,
  }, dt, G.time);
  // footsteps: one every ~20 px walked, quieter for everyone but the leader
  for (const u of [...G.party, ...G.enemies, ...G.followers]) {
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
  document.getElementById("bagBtn").onclick = () => toggleJournal("bag");
  document.getElementById("bookBtn").onclick = () => toggleJournal("quests");
  document.getElementById("muteAll").onchange = (e) => syncMute(setMuted(e.target.checked));
  document.getElementById("tutOn").onchange = (e) => setTutorial(e.target.checked);
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
  if (G.mode === "title" || G.mode === "over" || G.mode === "end") p = false;
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
  if (!G.party.length) return;
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
      const k = Math.min(88, G.speedCap ?? 88) * dt / Math.hypot(mx, my);
      if (canStand(l.x + mx * k, l.y)) l.x += mx * k;
      if (canStand(l.x, l.y + my * k)) l.y += my * k;
      l.dir = mx ? (mx < 0 ? 1 : 2) : my < 0 ? 3 : 0;
      l.moving = true;
    } else stepAlongPath(l, dt);
    if (pending && !l.path.length) { if (dist(pending.x, pending.y, l.x, l.y) < (pending.reach ?? 56) + 8) pending.act(); pending = null; }
    followTrail(dt);
    // enemies that aren't held back by the story notice you
    for (const [name, group] of Object.entries(G.groups)) {
      if (group.passive || !living(group).length) continue;
      const r = name === "ruins" ? 6.5 * TILE : 5 * TILE;
      if (living(group).some((e) => !e.gone && G.party.some((p) => p.hp > 0 && dist(p.x, p.y, e.x, e.y) < r))) {
        for (const e of group) e.alert = 0.8;
        startCombat(group);
        break;
      }
    }
    // zone names
    if ((zoneT -= dt) < 0) {
      zoneT = 0.5;
      const z = G.W.id === "vale" ? zoneAt(l.x, l.y) : G.W.zone;
      if (z !== zoneNow) { zoneNow = z; UI.banner(z); }
    }
  } else if (G.mode === "combat") {
    for (const u of [...G.party, ...G.enemies]) stepAlongPath(u, dt);
  } else if (G.mode === "cutscene" || G.mode === "dialogue") {
    for (const u of [...G.party, ...G.enemies, ...G.followers]) stepAlongPath(u, dt);
    if (G.followLeader) followTrail(dt);
  }
  if (G.mode !== "combat") for (const n of G.npcs) stepAlongPath(n, dt);
  for (const u of [...G.party, ...G.enemies, ...G.npcs, ...G.followers]) {
    u.animT += dt;
    if (u.poseT > 0) u.poseT -= dt; else u.pose = "idle";
    if (u.flashT > 0) u.flashT -= dt;
    for (const k of ["lunge", "knock"]) if (u[k]) { u[k].t -= dt; if (u[k].t <= 0) u[k] = null; }
    if (u.alert > 0) u.alert -= dt;
  }
  S.update(dt);
  updateAudio(dt);
  // camera
  const f = G.camFocus ?? (G.mode === "combat" && G.focus ? G.focus : l);
  const tx = camClamp(f.x - G.vw / 2, G.W.w * TILE, G.vw), ty = camClamp(f.y - 16 - G.vh / 2, G.W.h * TILE, G.vh);
  const k = 1 - Math.exp(-dt * (G.camFocus?.speed ?? (G.mode === "combat" ? 4 : 6)));
  G.cam.x += (tx - G.cam.x) * k; G.cam.y += (ty - G.cam.y) * k;
  if (G.shake > 0) G.shake -= dt;
  if (clickMark) { clickMark.t -= dt; if (clickMark.t <= 0) clickMark = null; }
  // mouse in world
  G.mouse.wx = G.cam.x + G.mouse.x / G.scale; G.mouse.wy = G.cam.y + G.mouse.y / G.scale;
  G.mouse.tx = Math.floor(G.mouse.wx / TILE); G.mouse.ty = Math.floor(G.mouse.wy / TILE);
  if (G.mode === "combat" && G.mouse.in) combatHover(G.mouse.tx, G.mouse.ty);
  else if (G.mode === "explore" && G.mouse.in) {
    const it = underMouse();
    const en = G.enemies.find((e) => e.hp > 0 && !e.gone && !e.passive && Math.abs(G.mouse.wx - e.x) < 12 && G.mouse.wy < e.y + 3 && G.mouse.wy > e.y - 32);
    UI.tooltip(it ? `<b>${it.name}</b>` : en ? `<b>${en.name}</b><br><span style="color:#ff8a7a">hostil</span>` : null);
    canvas.style.cursor = it ? "pointer" : "";
  } else if (G.mode !== "combat") { UI.tooltip(null); canvas.style.cursor = ""; }
}
/** Keep the camera inside the map; a map smaller than the screen sits in the middle. */
const camClamp = (v, size, view) => (size <= view ? (size - view) / 2 : clamp(v, 0, size - view));

// ---------------------------------------------------------------- draw
/** Weapons are drawn only by those fighting right now; everyone else walks with theirs put away. */
const sheetOf = (u) => (u.ch.sheathed && !(G.combat && G.combat.order.includes(u)) ? u.ch.sheathed : u.ch);

function drawUnit(u, cx, cy) {
  if (u.gone || u.hidden) return;
  const down = u.hp <= 0 && u.team === "party";
  let ox = 0, oy = u.float ? Math.round(Math.sin(G.time * 1.6) * 2) - u.float : 0;
  if (u.lunge) { const k = Math.sin((u.lunge.t / 0.25) * Math.PI); ox += u.lunge.x * k; oy += u.lunge.y * k; }
  if (u.knock) { const k = u.knock.t / 0.2; ox += u.knock.x * k; oy += u.knock.y * k; }
  const x = Math.round(u.x + ox - cx), y = Math.round(u.y + oy - cy);
  let fi = 4;
  if (u.pose === "attack" && u.poseT > 0) fi = 5;
  else if (u.pose === "cast" && u.poseT > 0) fi = 6;
  else if (u.gesture) fi = Math.floor(u.animT * 0.9) % 2 ? 6 : 4;
  else if (u.moving) fi = Math.floor(u.animT * 8) % 4;
  const set = sheetOf(u);
  const img = u.flashT > 0 ? set.flash[u.dir][fi] : set.frames[u.dir][fi];
  if (u.alpha != null) ctx.globalAlpha = u.alpha;
  if (down) {
    ctx.save(); ctx.globalAlpha = 0.6; ctx.translate(x, y - 6); ctx.rotate(Math.PI / 2); ctx.drawImage(img, -SW / 2, -SH / 2 - 4); ctx.restore();
    ctx.globalAlpha = 1;
    return;
  }
  // idle breathing: a 1px bob every so often
  const breathe = !u.moving && fi === 4 && Math.floor(u.animT * 1.6) % 2 === 1 ? 1 : 0;
  if (breathe) {
    ctx.drawImage(img, 0, 0, SW, 22, x - 13, y - 34 + 1, SW, 22);
    ctx.drawImage(img, 0, 22, SW, SH - 22, x - 13, y - 34 + 22, SW, SH - 22);
  } else ctx.drawImage(img, x - 13, y - 34);
  ctx.globalAlpha = 1;
  if (u.alert > 0 && u.team === "enemy") {
    ctx.fillStyle = "#ffd84a"; ctx.fillRect(x - 1, y - 46, 2, 6); ctx.fillRect(x - 1, y - 38, 2, 2);
  }
}

function drawBars(cx, cy) {
  if (G.mode !== "combat") return;
  for (const u of [...G.enemies, ...G.party]) {
    if (u.hp <= 0 || u.gone) continue;
    const x = Math.round(u.x - cx) - 9, y = Math.round(u.y - cy) - 40;
    ctx.fillStyle = "#120e16"; ctx.fillRect(x - 1, y - 1, 20, 4);
    ctx.fillStyle = "#3a1414"; ctx.fillRect(x, y, 18, 2);
    ctx.fillStyle = u.team === "enemy" ? "#e0402a" : u.ai ? "#e8c06a" : "#6ad04a"; ctx.fillRect(x, y, Math.ceil((18 * u.hp) / u.maxHp), 2);
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
  if (u.team !== "party" || u.ai || C.busy) return;
  const ab = C.ability ? abilityOf(u, C.ability) : null;
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

/**
 * Draw a prop with its top-left at (x, y). Leafy plants sway: their leaves are drawn in thin horizontal bands, each
 * slid sideways by the wind at that moment, most at the crown and nothing where the leaves meet the trunk. Each band
 * lags a little behind the one below, so the motion rolls up the canopy like a wave, and a slow gust front crosses the
 * valley from the west, so neighbouring trees move alike but not in lockstep.
 */
function drawProp(target, o, x, y) {
  const a = o.art;
  if (!a.leaves) { target.drawImage(a.c, x, y); return; }
  const { top, bottom, amp } = a.sway, t = G.time, ph = (o.seed % 997) * 0.37;
  const gust = 0.68 + 0.32 * Math.sin(t * 0.45 - o.x * 0.004); // never quite still
  const speed = o.kind === "bush" ? 2.2 : o.kind === "pine" ? 1.3 : 1.6;
  target.drawImage(a.trunk, x, y);
  const L = a.leaves, B = 2;
  for (let row = 0; row < L.height; row += B) {
    if (row >= bottom) { target.drawImage(L, 0, row, L.width, L.height - row, x, y + row, L.width, L.height - row); break; }
    const k = Math.min(1, (bottom - row) / (bottom - top));
    const off = Math.round(amp * k * gust * (Math.sin(t * speed + ph - row * 0.035) + 0.35 * Math.sin(t * speed * 2.3 + ph * 1.7 - row * 0.06)));
    target.drawImage(L, 0, row, L.width, B, x + off, y + row, L.width, B);
  }
}

/** Mirror images of whatever stands by the water: flipped at the feet, rippling, cut to the water and tinted by it. */
function drawReflections(cx, cy, items) {
  const W = G.W;
  if (!W.waterMask) return;
  const vw = G.vw, vh = G.vh;
  if (!reflA || reflA[0].width !== vw || reflA[0].height !== vh) { reflA = makeCanvas(vw, vh); reflB = makeCanvas(vw, vh); }
  const [ca, a] = reflA, [cb, b] = reflB;
  a.clearRect(0, 0, vw, vh);
  let any = false;
  const wet = (x, y) => { const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE); for (let k = 0; k <= 3; k++) for (const dx of [-1, 0, 1]) if (W.tileAt(tx + dx, ty + k) === T.WATER) return true; return false; };
  for (const it of items) {
    const u = it.u, o = it.o;
    if (!u && !o) continue;
    const src = u ?? o;
    if (!wet(src.x, src.y)) continue;
    let img, ox, oy;
    if (u) {
      if (u.hidden || u.gone || (u.hp <= 0 && u.team === "party")) continue;
      const fi = u.pose === "attack" && u.poseT > 0 ? 5 : u.pose === "cast" && u.poseT > 0 ? 6 : u.moving ? Math.floor(u.animT * 8) % 4 : 4;
      img = sheetOf(u).frames[u.dir][fi]; ox = 13; oy = 34;
      if (u.alpha != null) a.globalAlpha = u.alpha;
    } else {
      if (!o.art || o.clip || o.noReflect || o.hidden) continue;
      img = o; ox = o.art.ox; oy = o.art.oy;
    }
    const fy = Math.round(src.y - cy);
    a.save(); a.translate(0, fy * 2); a.scale(1, -1);
    if (img === o) drawProp(a, o, Math.round(src.x - cx - ox), fy - oy);
    else a.drawImage(img, Math.round(src.x - cx - ox), fy - oy);
    a.restore();
    a.globalAlpha = 1;
    any = true;
  }
  if (!any) return;
  // ripple: shift thin rows sideways, then keep only what falls on water
  b.clearRect(0, 0, vw, vh);
  const t = G.time;
  for (let y = 0; y < vh; y += 2) {
    const off = Math.round(Math.sin(t * 1.8 + (y + cy) * 0.22) * 1.2 + Math.sin(t * 0.7 + (y + cy) * 0.05) * 0.8);
    b.drawImage(ca, 0, y, vw, 2, off, y, vw, 2);
  }
  b.globalCompositeOperation = "destination-in";
  b.drawImage(W.waterMask, -cx, -cy);
  b.globalCompositeOperation = "source-atop";
  b.fillStyle = "rgba(24,96,120,0.45)";
  b.fillRect(0, 0, vw, vh);
  b.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 0.5;
  ctx.drawImage(cb, 0, 0);
  ctx.globalAlpha = 1;
}

/** Soft light: additive radial glows for things that carry it (Lumes, the lantern, the hero's silver mark). */
function drawGlows(cx, cy) {
  const list = [];
  for (const o of G.W.objects) if (o.glow && !o.hidden) list.push([o.x, o.y - (o.glow.h ?? 16), o.glow]);
  for (const u of [...G.party, ...G.npcs, ...G.followers, ...G.enemies]) if (u.glow && !u.gone && !u.hidden) list.push([u.x, u.y - (u.glow.h ?? 16), u.glow]);
  if (!list.length) return;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const [x, y, g] of list) {
    const sx = x - cx, sy = y - cy, r = g.r * (1 + Math.sin(G.time * 2 + x) * 0.05);
    if (sx < -r || sy < -r || sx > G.vw + r || sy > G.vh + r) continue;
    const gr = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
    const [R, Gc, B] = g.c ?? [150, 190, 255];
    gr.addColorStop(0, `rgba(${R},${Gc},${B},${g.a ?? 0.35})`); gr.addColorStop(1, `rgba(${R},${Gc},${B},0)`);
    ctx.fillStyle = gr;
    ctx.fillRect(sx - r, sy - r, r * 2, r * 2);
  }
  ctx.restore();
}

/** The Bruma: a soft pearly fog from the story's fog field, rendered at a quarter resolution. */
function drawFog(cx, cy) {
  if (!S.hasFog()) return;
  const C = 4, w = Math.ceil(G.vw / C) + 1, h = Math.ceil(G.vh / C) + 1;
  if (!fogC || fogC.width !== w || fogC.height !== h) { [fogC, fogX] = makeCanvas(w, h); fogC.img = fogX.createImageData(w, h); }
  const d = fogC.img.data, t = G.time, ox = Math.floor(cx / C), oy = Math.floor(cy / C);
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const wx = (ox + i) * C, wy = (oy + j) * C;
      let f = S.fogAt(wx, wy);
      if (f > 0.01) f *= 0.7 + vnoise(wx / 70 + t * 0.12, wy / 50 - t * 0.05, 5) * 0.55;
      const k = (j * w + i) * 4;
      d[k] = 236; d[k + 1] = 240; d[k + 2] = 246; d[k + 3] = clamp(f, 0, 1) * 235;
    }
  fogX.putImageData(fogC.img, 0, 0);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(fogC, ox * C - cx, oy * C - cy, w * C, h * C);
  ctx.restore();
}

function draw() {
  const vw = G.vw, vh = G.vh;
  let cx = Math.round(G.cam.x), cy = Math.round(G.cam.y);
  if (G.shake > 0) { cx += Math.round((Math.random() - 0.5) * 4); cy += Math.round((Math.random() - 0.5) * 4); }
  const W = G.W;
  ctx.fillStyle = W.id === "sonho" ? "#e8ebf1" : W.id === "relicario" ? "#0e1219" : "#0b0a10"; ctx.fillRect(0, 0, vw, vh);
  ctx.drawImage(W.ground, -cx, -cy);

  // water: drifting glints and a breathing shoreline
  const t = G.time;
  for (const s of W.sparkles) {
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
  S.drawGround(ctx, cx, cy);
  drawCombatGrid(cx, cy);

  // everything standing, sorted by its feet
  const items = [];
  const inView = (x, y, m = 120) => x > cx - m && x < cx + vw + m && y > cy - 20 && y < cy + vh + 160;
  for (const o of W.objects) if (!o.hidden && inView(o.x, o.y)) items.push({ y: o.y + (o.sortY ?? 0), o });
  for (const g of W.grass) if (inView(g.x, g.y, 20)) items.push({ y: g.y, g });
  for (const u of [...G.party, ...G.enemies, ...G.npcs, ...G.followers]) if (!u.gone && !u.hidden && inView(u.x, u.y)) items.push({ y: u.y + (u.float ? 40 : 0), u });
  G.chests.forEach((c) => inView(c.x, c.y) && items.push({ y: c.y, c }));
  items.sort((a, b) => a.y - b.y);
  drawReflections(cx, cy, items);
  // shadows first, so nothing's shadow falls on top of a neighbour
  for (const it of items) {
    const r = it.o ? (it.o.clip ? 0 : it.o.art?.shadow) : it.u ? (it.u.float || it.u.ghost ? 0 : it.u.small ? 7 : 9) : it.c ? 12 : 0;
    if (!r) continue;
    const x = (it.o ?? it.u ?? it.c).x, y = (it.o ?? it.u ?? it.c).y;
    const s = shadowOf(r);
    ctx.drawImage(s, Math.round(x - cx - s.width / 2), Math.round(y - cy - s.height / 2 - (it.o ? 1 : 0)));
  }
  const l = lead();
  // active / hover rings
  if (G.mode === "combat" && G.combat?.active) ring(G.combat.active.x - cx, G.combat.active.y - cy - 1, G.combat.active.team === "party" ? "#e8c06a" : "#ff5a4a", 11);
  else if (G.mode === "explore" && l) ring(l.x - cx, l.y - cy - 1, "rgba(232,192,106,0.55)", 9);
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
    if (o.alpha != null) ctx.globalAlpha = o.alpha;
    if (o.clip) {
      // dissolving from the bottom up, like wet paper
      const keep = Math.max(0, Math.round(a.c.height * (1 - o.clip)));
      if (keep > 0) ctx.drawImage(a.c, 0, 0, a.c.width, keep, x, y, a.c.width, keep);
      ctx.globalAlpha = 1;
      continue;
    }
    if (a.canopy) {
      // see-through canopy when someone stands behind it
      const bx = o.x - a.ox + a.canopy.x, by = o.y - a.oy + a.canopy.y;
      const hide = [...G.party, ...G.enemies].some((u) => !u.gone && u.y < o.y - 2 && u.x > bx && u.x < bx + a.canopy.w && u.y - 20 > by && u.y - 20 < by + a.canopy.h);
      if (hide) { ctx.globalAlpha = 0.45; drawProp(ctx, o, x, y); ctx.globalAlpha = 1; continue; }
    }
    drawProp(ctx, o, x, y);
    ctx.globalAlpha = 1;
  }
  drawBars(cx, cy);

  // atmosphere: the ruins are darker and misty; the dream is pale; the Relicário is cold
  let ruinK = 0;
  if (W.id === "vale" && l) {
    ruinK = clamp(1 - Math.max(0, (l.y - 15 * TILE)) / (6 * TILE)) * (l.x < 33 * TILE ? 1 : 0.3);
    if (ruinK > 0.01) { ctx.fillStyle = `rgba(16,20,40,${0.32 * ruinK})`; ctx.fillRect(0, 0, vw, vh); }
  } else if (W.id === "sonho") { ctx.fillStyle = "rgba(170,180,230,0.16)"; ctx.fillRect(0, 0, vw, vh); }
  else if (W.id === "relicario") { ctx.fillStyle = "rgba(30,50,90,0.14)"; ctx.fillRect(0, 0, vw, vh); }
  if (G.tint) { ctx.fillStyle = G.tint; ctx.fillRect(0, 0, vw, vh); }
  G.fx.draw(ctx, cx, cy);
  drawGlows(cx, cy);
  drawCritters(cx, cy, ruinK);
  const mk = W.id === "vale" ? 0.08 + ruinK * 0.7 : W.id === "sonho" ? 0.5 : 0.15;
  ctx.globalAlpha = mk;
  const mx = -((cx * 1.0 + t * 8) % mist.width) - mist.width, my = -((cy * 1.0 + t * 3) % mist.height) - mist.height;
  for (let y = my; y < vh; y += mist.height) for (let x = mx; x < vw; x += mist.width) ctx.drawImage(mist, Math.round(x), Math.round(y));
  ctx.globalAlpha = 1;
  drawFog(cx, cy);
  S.drawOver(ctx, cx, cy);

  // framing: branches at the bottom corners (outdoors), and a vignette
  if (W.id === "vale") {
    ctx.drawImage(fgLeft, Math.round(-30 - (cx * 0.05) % 10), vh - fgLeft.height + 34);
    ctx.save(); ctx.scale(-1, 1); ctx.drawImage(fgRight, Math.round(-vw - 24 + (cx * 0.05) % 10), vh - fgRight.height + 40); ctx.restore();
  }
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
  for (const c of G.W.critters) {
    const a = t * c.sp + c.ph;
    const x = Math.round(c.x + Math.sin(a) * c.r + Math.sin(a * 2.3) * 6 - cx), y = Math.round(c.y + Math.sin(a * 1.7) * c.r * 0.5 + Math.cos(a * 3.1) * 4 - cy - 14);
    if (x < -4 || y < -4 || x > G.vw + 4 || y > G.vh + 4) continue;
    if (c.kind === "bf") {
      if (G.f.escape) continue;
      const open = Math.floor(t * 12 + c.ph) % 2 === 0;
      ctx.fillStyle = "rgba(10,20,10,0.25)"; ctx.fillRect(x, y + 12, 2, 1);
      ctx.fillStyle = c.c[0];
      if (open) { ctx.fillRect(x - 2, y - 1, 2, 2); ctx.fillRect(x + 1, y - 1, 2, 2); ctx.fillStyle = c.c[1]; ctx.fillRect(x - 2, y - 1, 1, 1); ctx.fillRect(x + 2, y - 1, 1, 1); }
      else { ctx.fillRect(x - 1, y - 2, 1, 2); ctx.fillRect(x + 1, y - 2, 1, 2); }
      ctx.fillStyle = "#1a1020"; ctx.fillRect(x, y - 1, 1, 2);
    } else {
      const mote = c.kind === "mote";
      const b = Math.max(0, Math.sin(t * (mote ? 0.9 : 2.2) + c.ph * 3)) * (mote ? 0.7 : 0.35 + ruinK * 0.65);
      if (b < 0.05) continue;
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = mote ? `rgba(120,150,220,${b * 0.3})` : `rgba(120,160,40,${b * 0.35})`; ctx.fillRect(x - 1, y - 1, 3, 3);
      ctx.fillStyle = mote ? `rgba(220,235,255,${b})` : `rgba(230,255,150,${b})`; ctx.fillRect(x, y, 1, 1);
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

G.chestArt = [A.makeChest(false), A.makeChest(true)];
G.hooks.refreshJournal = refreshJournal;
window.G = G; // handy from the console
boot();
