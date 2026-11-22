// Brumafolha: boot, the maps, exploring, cutscenes, and drawing it all. The prologue's script lives in story.js.
import { G, lead, living } from "./state.js";
import { TILE, makeCanvas, hash2, Rng, dist, clamp, vnoise } from "./util.js";
import { buildWorld, MW, MH, zoneAt, T, waterField } from "./world.js";
import { buildDream, buildRelic } from "./maps.js";
import { buildVau, buildTravessia } from "./maps1.js";
import { buildBosque, buildMosteiro, buildClaustro } from "./maps2.js";
import * as TW from "./art/town.js";
import * as AB from "./art/abbey.js";
import { paintGround, paintBaseParallel, waterSparkles, PAL as GPAL } from "./art/ground.js";
import { groundKey, loadGround, saveGround } from "./art/groundcache.js";
import * as A from "./art/props.js";
import * as I from "./art/interiors.js";
import * as DC from "./art/decor.js";
import { decorate } from "./decor.js";
import { buildCharacter, portrait, SPECS, SW, SH } from "./art/chars.js";
import { findPath, reachable } from "./path.js";
import { FxLayer, FX, PAL } from "./fx.js";
import * as UI from "./ui.js";
import { openDialogue, dialogueKey, markTalk } from "./dialogue.js";
import { initAudio, playMusic, updateAmbience, audioState, sfx, settings as audioSet, toggleMute, setMuted, setVolume, previewSound, SOUND_GROUPS } from "./audio.js";
import { openCreator } from "./creator.js";
import { CLASSES, newBuild, heroDef, specOf, combatStats, weaponProficient, armorAllowed, shieldAllowed } from "./rules.js";
import { WEAPONS, ARMORS, gearItem } from "./items.js";
import { startCombat, combatClick, combatHover, endTurn, selectAbility, abilitiesOf, abilityOf, tileOf, tileCenter, blockedFor, refreshCombatHotbar } from "./combat.js";
import { hint, setTutorial } from "./tutorial.js";
import { toggleJournal, closeJournal, journalOpen, refreshJournal } from "./journal.js";
import * as S from "./story.js";
import { playIntro, updateIntro, skipIntro } from "./intro.js";
import { initTitle, titleLoaded, closeTitle, titleCancel, titleSaves } from "./title.js";
import { showPress, pressReady } from "./press.js";
import { ids, baseline, encode } from "./save/codec.js";
import { initGame, collect } from "./save/game.js";
import { initSaves, tickSaves, requestSave, autoSave, bootLoad, openSaves, closeSaves, savesOpen, newestSave, loadSave, saveBlock } from "./save/saves.js";
import { listSaves } from "./save/store.js";
import { icon, installIcons } from "./art/icons.js";
import { installFont } from "./art/font.js";
import { installFrames } from "./art/frames.js";
import { Input, pollInput, key, focusDefault, activeLayer, isTouch } from "./input.js";
import { initUpdates, tickUpdate, showNewNotes, openNotes, closeNotes, newsOpen } from "./update.js";
import { VERSION } from "./version.js";
import { diceReroll } from "./dialogue.js";
import { initLight, lightOn, lightAvailable, lightLayers, lightSurface, renderLight, showLight, setRamps, collectRamps, lightSettings, setLight } from "./light.js";
import * as RULES from "./rules.js";
import { P as PV, frame as pvFrame, project, unproject, rowToFlat, mouseRel, setPersp } from "./persp.js";

const canvas = document.getElementById("game");
const screen = canvas.getContext("2d");
let ctx = screen; // where the drawing functions paint: the screen, or one of the lit renderer's layers
let mistBase, vignette, fgLeft, fgRight, fogC, fogX, reflA, reflB;
const art = new Map();
const shadows = new Map();
const grassArt = [];
const maps = {};

/** Let the browser paint (the loading screen's words and bar) before the next heavy step. Not only rAF: a tab in the
 * background gets none, and the boot must not stop there. */
const nextFrame = () => new Promise((r) => { let done = false; const go = () => { if (!done) { done = true; r(); } }; requestAnimationFrame(() => setTimeout(go, 0)); setTimeout(go, 60); });
/** One step of the boot, on the loading screen: what is being made, and how far along (0–1). */
let stepT = performance.now(), stepName = "início";
const loadStep = async (text, k) => {
  const now = performance.now();
  console.debug(`[boot] ${stepName}: ${Math.round(now - stepT)} ms`); // what each step costs (Console, "verbose")
  stepT = now; stepName = text ?? `etapa ${k}`;
  window.Loading?.step(text, k); await nextFrame();
};

// ---------------------------------------------------------------- boot
async function boot() {
  const t0 = performance.now();
  // a load reloads the page: then the title is skipped (the loading screen says it is a load)
  const loading = hasPendingLoad(), dev = new URLSearchParams(location.search).get("dev");
  if (loading) document.getElementById("title").classList.add("hidden");
  installIcons();
  installFrames();
  await installFont();
  resize();
  await loadStep(null, 0.08);
  document.getElementById("titleHelp").innerHTML = `
    <li>${key("Clique", "")}${key("WASD", "L")} andar · ${key("E", "A")} interagir · ${key("Tab", "")} trocar de personagem</li>
    <li>Combate: ${key("1-9", "LB RB")} escolhe a ação · ${key("Clique", "A")} confirma · ${key("Espaço", "Y")} encerra o turno</li>
    <li>${key("I", "Select")} Bolsa · ${key("J", "Y")} Diário · ${key("Esc", "Start")} opções</li>
    <li class="touch-only"><b>Toque</b> no chão para andar e nas coisas para usar · segure e arraste para andar sem parar</li>
    <li class="touch-only">Combate: <b>toque</b> uma vez para ver, de novo para confirmar · <b>arraste</b> para olhar o campo</li>`;
  for (const el of document.querySelectorAll("[data-icon]")) el.innerHTML = icon(el.dataset.icon);
  for (let v = 0; v < 6; v++) grassArt.push(A.makeTallGrass(v));
  mistBase = makeMist();
  fgLeft = silhouette(11); fgRight = silhouette(29);
  G.fx = new FxLayer();
  await loadStep(loading ? null : "Misturando a luz...", 0.15);
  if (initLight(document.getElementById("gl"))) setRamps(collectRamps([GPAL, A.RAMP, I.IRAMP, TW.TRAMP, AB.ARAMP, DC.DRAMP, SPECS, RULES, ARMORS]));
  await loadStep(loading ? null : "Chamando os companheiros...", 0.25);
  spawnCompanions();
  S.init(E);
  initGame(SAVE_ENGINE);
  initSaves(SAVE_ENGINE);
  // the valley's ground is most of the loading: painted in parallel, off the page, while the bar follows it
  // (and kept between visits: after the first one it is only unpacked, see groundcache.js)
  const gkey = await groundKey();
  valeCached = gkey && (await loadGround(gkey, MW * TILE, MH * TILE));
  if (!valeCached) {
    await loadStep(loading ? null : "Pintando o vale pixel a pixel...", 0.3);
    valeBase = await paintBaseParallel((k) => window.Loading?.step(null, 0.3 + k * 0.45));
  } else await loadStep(loading ? null : "Desenrolando o mapa do vale...", 0.6);
  const MAPS = [["vale", null, 0.76], ["sonho", "Sonhando com Velmoor...", 0.84], ["relicario", "Descendo ao Relicário...", 0.9]];
  for (const [id, text, k] of MAPS) {
    await loadStep(loading ? null : text, k);
    buildMap(id);
  }
  valeBase = null;
  // a first visit keeps the valley's ground for the next ones, a little after the menu is up (it takes a moment)
  // (the painting as it came out, without the marks put on it afterwards: those are drawn again on every build)
  if (!valeCached && gkey) setTimeout(() => { const g = maps.vale.groundImg, [c, x] = makeCanvas(g.width, g.height); x.putImageData(g, 0, 0); saveGround(gkey, c); }, 5000);
  else if (maps.vale) maps.vale.groundImg = null;
  valeCached = null;
  await loadStep(null, 0.92);
  loadMap("vale", 15, 38);
  resize();

  console.log(`loaded in ${Math.round(performance.now() - t0)} ms`);
  G.clock = 17.9; // the menu's valley is at golden hour
  requestAnimationFrame(loop);
  if (loading) {
    // a load reloads the page, and the browser only lets sound start after a click or a key: the new page has had
    // neither yet. Try now (it works if the browser still counts the click that asked for the load), and on the first one.
    initAudio();
    // keep trying on every click, key and tap until the browser really lets the sound run (not just the first one:
    // Escape, for one, doesn't count as permission)
    const EVENTS = ["pointerdown", "pointerup", "keydown", "touchend", "click"];
    const wake = () => {
      initAudio();
      if (audioState().state === "running") for (const ev of EVENTS) removeEventListener(ev, wake, true);
    };
    for (const ev of EVENTS) addEventListener(ev, wake, true);
    if (await bootLoad(loadFailed)) { closeTitle(); await window.Loading?.hide(); showNewNotes(); }
    else window.Loading?.hide();
    return;
  }
  // the start screen comes in under the loading screen, already asking for the click, and the loading screen fades off it
  if (!dev) { showPress(startMenu); pressReady(); }
  window.Loading?.hide();
  // development shortcut: ?dev=camp (&cls=mago&race=elfo&f=flag1,flag2) skips the title, the creator and the dream
  const q = new URLSearchParams(location.search);
  if (q.get("dev")) {
    initAudio();
    closeTitle();
    G.clock = 9;
    const b = newBuild(q.get("race") ?? "humano", q.get("cls") ?? "guerreiro");
    if (!b.name) b.name = "Teste";
    recruit(b);
    setupMenu();
    S.devJump(q.get("dev"), (q.get("f") ?? "").split(",").filter(Boolean));
    showNewNotes();
  }
}

/** The click on the start screen: the sound can start now, and with it the menu's music and opening. */
function startMenu() {
  initAudio();
  playMusic("title", 2.5);
  initTitle({ start: create, options: () => { setupMenu(false); setPaused(true); }, cont: continueGame, load: () => openSaves("load", () => document.getElementById("load").focus()) });
  titleLoaded();
  refreshTitleSaves();
  showNewNotes(); // after an update: what changed (only once the menu is up, not behind the start screen)
}

async function create() {
  if (G.mode !== "title") return;
  initAudio();
  G.mode = "intro"; // no second click while the menu fades
  playMusic(null, 1.2);
  await UI.fade(1, 700); // the menu fades to black, then the prelude starts in the dark
  closeTitle();
  G.clock = 9;
  await playIntro(E); // Lyra tells the valley's story before the hero exists
  G.mode = "create";
  openCreator((build) => { recruit(build); begin(); }, (b) => companionFor(b).label);
}
/** Who joins the hero: a fighter for a spellcaster, the elven mage otherwise. */
function companionFor(b) {
  return CLASSES[b.cls].role === "caster" ? { u: G.cast.kael, label: "Kael, guerreiro" } : { u: G.cast.lyra, label: "Lyra, maga élfica" };
}
function recruit(build) {
  idScope = "hero";
  const hero = unit(specOf(build), { ...heroDef(build), tx: 15, ty: 38 });
  idScope = null;
  hero.spec = specOf(build);
  baseline(hero);
  G.campaign ??= `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`; // one playthrough: its saves go together
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
let valeBase = null; // the valley ground's per-pixel pass, when workers painted it ahead (boot)
let valeCached = null; // or the whole ground, kept from an earlier visit
function buildMap(id) {
  if (maps[id]) return maps[id];
  const W = { vale: buildWorld, sonho: buildDream, relicario: buildRelic, vau: buildVau, travessia: buildTravessia, bosque: buildBosque, mosteiro: buildMosteiro, claustro: buildClaustro }[id]();
  if (id === "vale") W.outdoor = true;
  const g = document.createElement("canvas");
  g.width = W.w * TILE; g.height = W.h * TILE;
  const img = id === "vale" ? valeCached ?? paintGround(W, valeBase ?? undefined) : W.outdoor ? TW.paintOutdoor(W, T) : I.paintInterior(W, T);
  g.getContext("2d").putImageData(img, 0, 0);
  W.ground = g;
  if (id === "vale") W.groundImg = img;
  if (W.outdoor) W.waterMask = waterMask(img);
  W.sparkles = id === "vale" ? waterSparkles(W) : W.outdoor ? TW.outdoorSparkles(W, T) : [];
  W.enemies = []; W.npcs = []; W.chests = []; W.groups = {};
  W.builtFlags = encode(G.f, "flags"); // some maps are made from the story so far: a load builds them the same way
  idScope = ids.scope(id);
  S.populate(W);
  idScope = null;
  for (const o of W.objects) o.art = propArt(o);
  // what makes it look lived in: marks painted on the ground, small things standing (decor.js; never saved)
  decorate(W);
  const gx = g.getContext("2d");
  for (const d of W.decals) DC.paintDecal(gx, d.kind, d.x, d.y, d.seed);
  for (const d of W.decor) { d.art = decorArt(d); if (d.block) W.block[d.block[1] * MW + d.block[0]] = 1; }
  for (const c of W.chests) W.block[Math.floor((c.y - 1) / TILE) * MW + Math.floor(c.x / TILE)] = 1;
  W.critters = makeCritters(W);
  // the save's view of this map: ids for its objects and groups, and how everything looks right now
  W.objects.forEach((o, i) => ids.object(o, `${id}:o${i}`));
  W.chests.forEach((c, i) => ids.object(c, `${id}:c${i}`));
  for (const [name, g] of Object.entries(W.groups)) ids.group(`${id}:${name}`, g);
  for (const e of [...W.enemies, ...W.npcs, ...Object.values(W.groups).flat(), ...W.objects, ...W.chests]) baseline(e);
  W.block0 = W.block.slice();
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
    // pollen over the meadows by day (the fireflies take over at night)
    for (let i = 0; i < 40; i++) out.push({ kind: "pol", x: R.range(4, MW - 4) * TILE, y: R.range(16, MH - 4) * TILE, ph: R.range(0, 9), r: R.range(20, 50), sp: R.range(0.05, 0.12) });
    for (let i = 0; i < 70; i++) {
      const inR = i < 40;
      const x = inR ? R.range(10, 30) * TILE : R.range(32, 76) * TILE, y = inR ? R.range(3, 14) * TILE : R.range(17, 37) * TILE;
      out.push({ kind: "ff", x, y, ph: R.range(0, 9), r: R.range(8, 30), sp: R.range(0.15, 0.4) });
    }
  } else if (W.outdoor) {
    for (let i = 0; i < 40; i++) out.push({ kind: "ff", x: R.range(2, W.w - 2) * TILE, y: R.range(2, W.h - 2) * TILE, ph: R.range(0, 9), r: R.range(8, 30), sp: R.range(0.15, 0.4) });
    for (let i = 0; i < 26; i++) out.push({ kind: "pol", x: R.range(2, W.w - 2) * TILE, y: R.range(2, W.h - 2) * TILE, ph: R.range(0, 9), r: R.range(20, 50), sp: R.range(0.05, 0.12) });
  } else if (W.id === "claustro") {
    // dust turning slowly in the candlelight
    for (let i = 0; i < 60; i++) out.push({ kind: "dust", x: R.range(2, W.w - 2) * TILE, y: R.range(1, W.h - 2) * TILE, ph: R.range(0, 9), r: R.range(6, 22), sp: R.range(0.05, 0.14) });
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
    case "palisade": return key(`palisade${o.seed % 6}`);
    case "house": return key(`house${o.w}-${o.seed}-${JSON.stringify(o.opts)}`);
    case "stall": return key(`stall${o.color}-${o.seed}`);
    case "table": return key(`table${o.seed}`);
    case "cart": return key(`cart${o.wrecked ? 1 : 0}`);
    case "board": return key(`board${o.wanted === false ? 0 : 1}`);
    case "strongbox": return key(`strongbox${o.open ? 1 : 0}`);
    case "awall": return key(`awall${o.seed % 12}`);
    case "herbbed": return key(`herbbed${o.seed}-${o.mist ? 1 : 0}`);
    case "cot": return key(`cot${o.who ?? 0}`);
    case "bars": return key(`bars${o.open ? 1 : 0}`);
    case "ribbons": return key(`ribbons${o.seed}`);
    case "mgate": return key(`mgate${o.open ? 1 : 0}`);
    default: return key(o.kind);
  }
}
function decorArt(d) {
  const k = `decor-${d.kind}-${d.seed % 16}`;
  if (!art.has(k)) {
    const s = d.seed % 16;
    art.set(k, { candles: () => DC.makeCandles(s), brazier: () => DC.makeBrazier(), pot: () => DC.makePot(s), sacks: () => DC.makeSacks(s), basket: () => DC.makeBasket(s), stump: () => DC.makeStump(s), mushrooms: () => DC.makeMushrooms(s), bench: () => AB.makeBench(), marker: () => I.makeMarker() }[d.kind]());
  }
  return art.get(k);
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
    case "palisade": return TW.makePalisade(o.seed % 6);
    case "house": return TW.makeHouse(o.w, o.seed, o.opts);
    case "stall": return TW.makeStall(o.color, o.seed);
    case "lamp": return TW.makeLamp();
    case "well": return TW.makeWell();
    case "table": return TW.makeTable(o.seed);
    case "sign": return TW.makeSign();
    case "board": return TW.makeBoard(o.wanted !== false);
    case "cart": return TW.makeCart(!!o.wrecked);
    case "shrine": return TW.makeShrine();
    case "strongbox": return TW.makeStrongbox(!!o.open);
    case "satchel": return TW.makeSatchel();
    case "awall": return AB.makeAbbeyWall(o.seed % 12);
    case "belltower": return AB.makeBellTower();
    case "herbbed": return AB.makeHerbBed(o.seed, !!o.mist);
    case "bench": return AB.makeBench();
    case "cot": return AB.makeCot(o.who ?? 0);
    case "altar": return AB.makeAltar();
    case "hearth": return AB.makeHearth();
    case "bars": return AB.makeBars(!!o.open);
    case "lectern": return AB.makeLectern();
    case "ribbons": return AB.makeRibbons(o.seed);
    case "mgate": return AB.makeGate(!!o.open);
    case "veilbanner": return AB.makeVeilBanner();
    case "teapot": return AB.makeTeapot();
    case "doorway": return AB.makeDoorway();
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
  u.spec ??= spec; // the sprite is rebuilt from this when a save is loaded
  [u.x, u.y] = tileCenter(def.tx ?? 0, def.ty ?? 0);
  ids.unit(u, idScope); // a stable id for the save: by map and order while a map is built, "dyn:n" when the story makes one
  return u;
}
let idScope = null;

// the companions are built by the same rules as the hero, so they can change gear too
const KAEL = { race: "humano", cls: "guerreiro", gender: "m", name: "Kael", base: { FOR: 15, DES: 12, CON: 14, INT: 9, SAB: 12, CAR: 11 },
  look: { skin: 1, hair: 1, style: "short", beard: null, eyes: 0, outfit: 0, cape: 1 }, equip: { main: "espadaLonga", ranged: null, armor: "malha", shield: null },
  extraSkills: ["Persuasão", "Medicina", "Percepção"] };
const LYRA = { race: "elfo", cls: "mago", gender: "f", name: "Lyra", base: { FOR: 8, DES: 14, CON: 14, INT: 15, SAB: 12, CAR: 10 },
  look: { skin: 0, hair: 5, style: "long", beard: null, eyes: 2, outfit: 3, cape: 0 }, equip: { main: "cajado", ranged: null, armor: "robe", shield: null },
  extraSkills: ["História", "Natureza", "Intuição"], extraAbilities: ["heal"] };
function spawnCompanions() {
  const mk = (b, key, veteran) => {
    idScope = key;
    const u = unit(specOf(b), { ...heroDef(b, key), tx: 14, ty: 39, ...veteran });
    idScope = null;
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
  baseline(kael); baseline(lyra);
}

/** Recompute a party member's numbers and sprite from their gear (after equipping, or a level-up). */
function regear(u, look = true) {
  const keep = u.abilities.filter((k) => k === "lampejo");
  Object.assign(u, combatStats(u.build, u.equip, undefined, u.bonusAtk ?? 0));
  if (u.ecoEyes) for (const s of ["Percepção", "Intuição", "Investigação"]) u.skills[s] = (u.skills[s] ?? 0) + 2; // a gift of the Echo
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
  unit, loadMap, sleep, tileCenter, tileOf, propArt, buildMap,
  /** A party-grade character built by the creator's rules (Kael, Lyra, Nix), wherever the story needs them. */
  companion(b, key, extra = {}) { const u = unit(specOf(b), { ...heroDef(b, key), ...extra }); u.spec = specOf(b); u.hp = u.maxHp; u.slots = u.maxSlots ?? 0; return u; },
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

// ---------------------------------------------------------------- saving: what the save modules need from here
const SAVE_ENGINE = {
  maps: () => maps,
  buildMap, recruit,
  /** A unit the story made after its map was built, made again to receive its saved fields. */
  remakeUnit(id, spec, build) {
    idScope = id;
    const u = unit(spec ?? (build ? specOf(build) : "goblin"), {});
    idScope = null;
    return u;
  },
  refreshUnitArt(u) {
    if (!u) return;
    const spec = u.build ? specOf(u.build, u.equip) : u.spec;
    if (!spec) return;
    if (u.build) u.spec = spec;
    u.ch = buildCharacter(SPECS[spec] ?? spec);
    u.portrait = portrait(u.ch);
  },
  refreshObject(o) { o.art = propArt(o); },
  /** Put a map on screen as the save left it: nobody is moved. */
  showMap(id) {
    const W = maps[id];
    G.W = W;
    G.enemies = W.enemies; G.npcs = W.npcs; G.chests = W.chests; G.groups = W.groups;
    for (const e of G.fx.list) e.keep = false;
    G.fx.list = [];
    for (const o of W.objects) if (o.kind === "campfire" && !o.out) o.fxe = G.fx.spawn(FX.campfire, { x: o.x, y: o.y + 2, light: 0.55, ...(o.goblin ? { seed: 3 } : {}) }, { keep: true });
    trail.length = 0;
    const l = lead() ?? G.party[0];
    if (l) { G.cam.x = l.x - G.vw / 2; G.cam.y = l.y - G.vh / 2; }
    zoneNow = "";
  },
  unstick(u) { const [tx, ty] = tileOf(u); const [x, y] = freeAround(tx, ty, 1)[0]; [u.x, u.y] = tileCenter(x, y); },
  afterLoad() {
    setupMenu();
    G.camFocus = null; G.focus = null; G.paused = false;
    E.partyChanged();
    refreshJournal();
  },
  thumbnail: () => new Promise((res, rej) => { thumbWaiters.push({ res, rej }); setTimeout(() => rej(new Error("sem quadro")), 1500); }),
  placeName() {
    const l = lead() ?? G.party[0], W = G.W;
    return W.id === "vale" ? zoneAt(l.x, l.y) : W.zoneAt ? W.zoneAt(l.x, l.y) : W.zone ?? W.id;
  },
};
const thumbWaiters = [];
/** A small picture of the screen for the save list, taken right after a frame is drawn (the GPU canvas is only readable then). */
function takeThumbnail() {
  const waiting = thumbWaiters.splice(0);
  try {
    const src = lightAvailable() ? document.getElementById("gl") : canvas;
    const [c, x] = makeCanvas(192, 108);
    const k = Math.max(192 / src.width, 108 / src.height), w = src.width * k, h = src.height * k;
    x.imageSmoothingEnabled = true;
    x.drawImage(src, (192 - w) / 2, (108 - h) / 2, w, h);
    const url = c.toDataURL("image/jpeg", 0.8);
    for (const p of waiting) p.res(url);
  } catch (e) { for (const p of waiting) p.rej(e); }
}

function hasPendingLoad() { try { return !!sessionStorage.getItem("brumafolha.load"); } catch { return false; } }
/** A load that failed: back to the title, with the reason and (if there is one) the backup. */
function loadFailed(msg, tryBackup) {
  G.mode = "title";
  G.party = [];
  document.getElementById("title").classList.remove("hidden");
  initTitle({ start: () => location.reload(), options: () => { setupMenu(false); setPaused(true); }, cont: continueGame, load: () => openSaves("load") });
  titleLoaded();
  refreshTitleSaves();
  UI.fade(0, 300);
  const box = document.createElement("div");
  box.id = "loaderr";
  box.className = "fr fr-panel";
  box.innerHTML = `<p>${msg}</p><div class="row">${tryBackup ? '<button class="go" data-b>Tentar a cópia anterior</button>' : ""}<button data-ok>Fechar</button></div>`;
  document.getElementById("title").appendChild(box);
  box.querySelector("[data-b]")?.addEventListener("click", tryBackup);
  box.querySelector("[data-ok]").onclick = () => box.remove();
}
async function continueGame() {
  const m = await newestSave();
  if (m) loadSave(m.id);
}
async function refreshTitleSaves() {
  const list = await listSaves().catch(() => []);
  titleSaves(list.length > 0);
}
/** F5 / F9 and the pause menu's buttons. */
function quickSave() { requestSave("quick"); }
async function quickLoad() {
  const list = await listSaves().catch(() => []);
  const m = list.find((x) => x.campanha === G.campaign && x.tipo === "quick") ?? list.find((x) => x.campanha === G.campaign);
  if (m) loadSave(m.id); else UI.toast("Ainda não há save desta partida.", 2200);
}

Input.onDevice = () => { fillControls(); if (G.mode === "explore") exploreHotbar(); else if (G.combat) refreshCombatHotbar(); };

// ---------------------------------------------------------------- hooks used by other modules
G.hooks.focus = (u) => { G.focus = u; freeCam = false; if (cursor.on) [cursor.tx, cursor.ty] = tileOf(u); };
/** Something happens in combat (a projectile flies, a blow lands, someone walks): the camera follows it. */
G.hooks.watch = (o) => { G.focus = o; freeCam = false; };
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
G.hooks.gameOver = async () => {
  playMusic(null, 0.6); sfx.defeat();
  const last = (await listSaves().catch(() => [])).find((m) => m.campanha === G.campaign);
  const d = document.createElement("div");
  d.id = "gameover";
  d.className = "dim";
  d.innerHTML = `<div class="fr fr-panel" style="padding:6rem 16rem 10rem"><h1>O grupo caiu</h1><p>As brumas guardam mais um segredo.</p>
    ${checkpoint ? '<button id="retry" class="go" data-default>Tentar a luta de novo</button> ' : ""}${last ? `<button id="lastsave" class="${checkpoint ? "" : "go"}" ${checkpoint ? "" : "data-default"}>Carregar o último save</button> ` : ""}<button id="restart" class="quiet">Recomeçar do início</button></div>`;
  document.getElementById("ui").appendChild(d);
  d.querySelector("#restart").onclick = () => location.reload();
  d.querySelector("#retry")?.addEventListener("click", () => { d.remove(); retry(); });
  d.querySelector("#lastsave")?.addEventListener("click", () => loadSave(last.id));
  focusDefault(d, true);
};
G.hooks.sceneEnd = () => autoSave();
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
    { icon: "potion", name: "Poção de Cura", desc: `Recupera 2d4+2 PV de ${u.name}. Você tem ${G.potions}.`, count: G.potions, off: G.potions <= 0 || u.hp >= u.maxHp,
      use: () => { G.potions--; const r = 2 + Math.ceil(Math.random() * 4) + Math.ceil(Math.random() * 4); u.hp = Math.min(u.maxHp, u.hp + r); UI.floater(u.x, u.y - 34, `+${r}`, "heal"); G.fx.spawn(FX.bloom, { x: u.x, y: u.y + 2 }); UI.updateParty(); exploreHotbar(); } },
    { icon: "swap", name: "Trocar líder", desc: "Passa o controle para o próximo do grupo (Tab).", off: G.party.length < 2, use: () => selectLeader((G.leader + 1) % G.party.length) },
    { icon: "bag", name: "Bolsa", desc: "Itens e cartas (I).", use: () => toggleJournal("bag") },
    { icon: "book", name: "Diário", desc: "Missões e lembranças (J).", use: () => toggleJournal("quests") },
  ], { who: u, sub: `${u.cls ?? ""} · nível ${u.level}`, econ: `<div class="econ gold"><div>${icon("coin")} ${G.gold}</div></div>` });
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
  return interactables().find((i) => { const [dx, dy] = mouseRel(i.x, i.y); return Math.abs(dx) < i.r && dy < 4 && dy > -(i.h ?? 34); });
}
function talk(n) {
  const l = lead();
  if (!n.fixed) n.dir = Math.abs(l.x - n.x) > Math.abs(l.y - n.y) ? (l.x < n.x ? 1 : 2) : l.y < n.y ? 3 : 0;
  const t = n.talk();
  if (t) { openDialogue(n, t); markTalk(n); }
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
  G.mouse.x = e.clientX; G.mouse.y = e.clientY; G.mouse.in = true; cursor.on = false;
  mouseWorld();
}
/** The ground point under a screen point (client px), relative to the camera's corner; null above the horizon in 3D. */
function groundRel(sx, sy) {
  const mx = sx / G.scale, my = sy / G.scale;
  return PV.on ? unproject(mx, my) : [mx, my];
}
/** The ground point under the mouse (through the tilted camera in 3D), and its tile. */
function mouseWorld() {
  const [fx, fy] = groundRel(G.mouse.x, G.mouse.y) ?? [-1e5, -1e5];
  G.mouse.wx = G.cam.x + fx; G.mouse.wy = G.cam.y + fy;
  G.mouse.tx = Math.floor(G.mouse.wx / TILE); G.mouse.ty = Math.floor(G.mouse.wy / TILE);
  if (cursor.on && G.mode === "combat") { G.mouse.tx = cursor.tx; G.mouse.ty = cursor.ty; return; } // the keyboard/pad cursor names its tile itself
  if (PV.on && G.mode === "combat") {
    // in 3D the ground behind someone's head is far away: pointing at a body means that body's tile
    const u = [...G.enemies, ...G.party].filter((e) => e.hp > 0 && !e.gone && !e.hidden).sort((a, b) => b.y - a.y)
      .find((e) => { const [dx, dy] = mouseRel(e.x, e.y); return Math.abs(dx) < 11 && dy < 3 && dy > -32; });
    if (u) [G.mouse.tx, G.mouse.ty] = tileOf(u);
  }
}
/** Switch between the flat top-down view and the tilted 3D camera. */
function setView(on, tilt) {
  setPersp(on, tilt);
  resize();
  const box = document.getElementById("perspOn");
  if (box) { box.checked = PV.on; document.getElementById("tiltRow").classList.toggle("off", !PV.on); }
}
// a tile cursor for the keyboard and the pad: it stands in for the mouse during combat
const cursor = { on: false, tx: 0, ty: 0 };
function cursorMove(dx, dy) {
  if (!G.combat) return;
  if (!cursor.on) { [cursor.tx, cursor.ty] = tileOf(G.combat.active ?? lead()); cursor.on = true; }
  const nx = cursor.tx + dx, ny = cursor.ty + dy;
  if (nx >= 0 && ny >= 0 && nx < G.W.w && ny < G.W.h) { cursor.tx = nx; cursor.ty = ny; }
  G.focus = { x: cursor.tx * TILE + 16, y: cursor.ty * TILE + 26 };
  freeCam = false;
}

// ---------------------------------------------------------------- free camera in combat
// The player can look around the field: drag with the right (or middle) mouse button, Shift + WASD/arrows, or the
// right stick. Any action (a walk, an attack, a spell, a new turn) takes the camera back and follows it; C recenters.
let freeCam = false, drag = null;
/** Put the camera's corner at (x, y), kept on the map, and stop it following anyone. */
function panTo(x, y) {
  freeCam = true;
  G.cam.x = camClamp(x, G.W.w * TILE, G.vw);
  G.cam.y = PV.on ? camClampTilted(y, G.W.h * TILE) : camClamp(y, G.W.h * TILE, G.vh);
}
function startDrag(e) {
  const g = groundRel(e.clientX, e.clientY);
  if (!g) return;
  drag = { sx: e.clientX, sy: e.clientY, ax: G.cam.x + g[0], ay: G.cam.y + g[1], btn: e.button, moved: false };
}
addEventListener("mousemove", (e) => {
  if (!drag) return;
  if (!G.combat || G.paused) { drag = null; return; }
  if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 5) return;
  drag.moved = true;
  canvas.style.cursor = "grabbing";
  // keep the ground point that was grabbed under the mouse
  const g = groundRel(e.clientX, e.clientY);
  if (g) panTo(drag.ax - g[0], drag.ay - g[1]);
});
addEventListener("mouseup", (e) => {
  if (!drag || e.button !== drag.btn) return;
  // a right click that didn't drag still cancels the chosen action
  if (!drag.moved && drag.btn === 2 && G.combat) { G.combat.ability = null; refreshCombatHotbar(); }
  if (drag.moved) canvas.style.cursor = "";
  drag = null;
});
/** Shift + WASD/arrows and the right stick pan the camera, every frame. */
function panCamera(dt) {
  let mx = Input.look.x, my = Input.look.y;
  if (G.keys.has("shift")) {
    if (G.keys.has("w") || G.keys.has("arrowup")) my--;
    if (G.keys.has("s") || G.keys.has("arrowdown")) my++;
    if (G.keys.has("a") || G.keys.has("arrowleft")) mx--;
    if (G.keys.has("d") || G.keys.has("arrowright")) mx++;
  }
  if (!mx && !my) return;
  const k = 340 * dt / Math.max(1, Math.hypot(mx, my));
  panTo(G.cam.x + mx * k, G.cam.y + my * k * (PV.on ? 1.6 : 1));
}
/** Buttons that reach the game because no menu is open (see input.js). */
Input.onAction = (a) => {
  if (G.mode === "title" || G.mode === "create" || G.mode === "over" || G.mode === "end") return;
  if (a === "start") { setPaused(true); return; }
  if (a === "select" && !document.getElementById("hint").classList.contains("hidden")) { document.querySelector("#hint .ok")?.click(); return; }
  if (G.paused) return;
  if (G.mode === "combat") {
    if (a === "up") cursorMove(0, -1); else if (a === "down") cursorMove(0, 1); else if (a === "left") cursorMove(-1, 0); else if (a === "right") cursorMove(1, 0);
    else if (a === "confirm") { cursorMove(0, 0); combatClick(cursor.tx, cursor.ty); }
    else if (a === "cancel") { if (G.combat?.ability) { G.combat.ability = null; refreshCombatHotbar(); } }
    else if (a === "x") UI.hotbarUse();
    else if (a === "lb") UI.hotbarMove(-1); else if (a === "rb") UI.hotbarMove(1);
    else if (a === "y") endTurn();
  } else if (G.mode === "explore") {
    if (a === "confirm") nearestInteractable()?.act();
    else if (a === "x") UI.hotbarUse();
    else if (a === "lb") UI.hotbarMove(-1); else if (a === "rb") UI.hotbarMove(1);
    else if (a === "y") toggleJournal("quests");
    else if (a === "select") toggleJournal("bag");
  }
};
Input.onCancel = (layer) => {
  if (layer === "news") { closeNotes(); return; }
  if (layer === "intro") { skipIntro(); return; }
  if (layer === "saves") { closeSaves(); return; }
  if (layer === "title") { titleCancel(); return; }
  if (layer === "pause") setPaused(false);
  else if (layer === "journal") closeJournal();
  else if (layer === "dice") document.getElementById("dice").click();
};
canvas.addEventListener("mousemove", setMouse);
canvas.addEventListener("mouseleave", () => { G.mouse.in = false; UI.tooltip(null); });
canvas.addEventListener("mousedown", (e) => {
  if (G.paused) return;
  setMouse(e);
  if (e.button === 0) onClick();
  if ((e.button === 2 || e.button === 1) && G.combat) { e.preventDefault(); startDrag(e); }
});
canvas.addEventListener("contextmenu", (e) => e.preventDefault());

// ---------------------------------------------------------------- touch
// A tap is a click, except in combat: the first tap shows (the path, the chance to hit) and a second tap on the same
// tile confirms, so a finger never attacks or walks by accident. Dragging looks around the field in combat; outside
// it, holding a finger down walks the leader toward it.
let touch = null, armed = null;
const touchPt = (t) => ({ clientX: t.clientX, clientY: t.clientY, button: -1 });
canvas.addEventListener("touchstart", (e) => {
  e.preventDefault(); // no made-up mouse events, no page scroll or zoom
  if (G.paused || e.touches.length > 1) { touch = null; drag = null; return; }
  const t = e.touches[0];
  touch = { x: t.clientX, y: t.clientY, fx: t.clientX, fy: t.clientY, t0: performance.now(), moved: false, held: false };
  if (G.combat) startDrag(touchPt(t));
}, { passive: false });
canvas.addEventListener("touchmove", (e) => {
  e.preventDefault();
  if (!touch || e.touches.length > 1) return;
  const t = e.touches[0];
  touch.fx = t.clientX; touch.fy = t.clientY;
  if (!touch.moved && Math.hypot(t.clientX - touch.x, t.clientY - touch.y) < 12) return;
  touch.moved = true;
  if (G.combat && drag) {
    drag.moved = true;
    const g = groundRel(t.clientX, t.clientY);
    if (g) panTo(drag.ax - g[0], drag.ay - g[1]);
  }
}, { passive: false });
canvas.addEventListener("touchend", (e) => {
  e.preventDefault();
  const tc = touch;
  touch = null; drag = null;
  if (!tc || tc.moved || tc.held || G.paused) return;
  setMouse({ clientX: tc.x, clientY: tc.y });
  UI.releaseTip();
  if (G.mode === "combat") {
    const C = G.combat, k = `${C?.ability},${C?.active?.name}`;
    // the second tap confirms the tile the first one showed: on it, or near where the finger was (the camera may
    // still be easing, so the same spot on the glass can be over the next tile by now)
    const again = armed && armed.k === k && performance.now() - armed.t < 6000
      && ((armed.tx === G.mouse.tx && armed.ty === G.mouse.ty) || Math.hypot(tc.x - armed.x, tc.y - armed.y) < 26);
    if (C && !C.busy && again) {
      G.mouse.tx = armed.tx; G.mouse.ty = armed.ty; armed = null;
      G.mouse.in = false; UI.tooltip(null);
      onClick();
    } else armed = { k, tx: G.mouse.tx, ty: G.mouse.ty, x: tc.x, y: tc.y, t: performance.now() };
    return;
  }
  armed = null;
  onClick();
  G.mouse.in = false; UI.tooltip(null);
}, { passive: false });
canvas.addEventListener("touchcancel", () => { touch = null; drag = null; });
/** Explore: a finger held down steers the leader toward it, like a stick. */
function touchSteer() {
  if (!touch || G.mode !== "explore" || (!touch.moved && performance.now() - touch.t0 < 300)) return null;
  touch.held = true;
  const g = groundRel(touch.fx, touch.fy), l = lead();
  if (!g) return null;
  const dx = G.cam.x + g[0] - l.x, dy = G.cam.y + g[1] - (l.y - 8), d = Math.hypot(dx, dy);
  return d < 10 ? null : [dx / d, dy / d];
}
// the "use" bubble over something nearby is a button on a touch screen
document.getElementById("prompt").onclick = () => { if (G.mode === "explore" && !G.paused) nearestInteractable()?.act(); };
addEventListener("keydown", (e) => {
  if (e.key === "F5" || e.key === "F9") {
    e.preventDefault(); // F5 would reload the page
    if (!e.repeat && G.party.length && G.build && !savesOpen()) e.key === "F5" ? quickSave() : quickLoad();
    return;
  }
  if (newsOpen()) { if (e.key === "Escape") closeNotes(); return; }
  if (savesOpen()) { if (e.key === "Escape") closeSaves(); return; }
  if (G.mode === "create" || e.target?.tagName === "INPUT") return; // typing a name
  const k = e.key.toLowerCase();
  G.keys.add(k);
  if (k === "m" && G.mode !== "title") { syncMute(toggleMute()); return; }
  if (k === "v" && G.mode !== "title") { setView(!PV.on); return; }
  if (G.mode === "title") { if (k === "escape") { if (G.paused) setPaused(false); else titleCancel(); } return; }
  if (G.mode === "intro") { if (k === "escape") skipIntro(); return; }
  if (k === "l") diceReroll();
  if (k === "h") document.querySelector("#hint:not(.hidden) .ok")?.click();
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
    const mv = { w: [0, -1], arrowup: [0, -1], s: [0, 1], arrowdown: [0, 1], a: [-1, 0], arrowleft: [-1, 0], d: [1, 0], arrowright: [1, 0] }[k];
    if (mv) { e.preventDefault(); if (!e.shiftKey) { document.body.classList.add("nav-keys"); cursorMove(...mv); } }
    if (k === "c") freeCam = false;
    if (k === "tab") { e.preventDefault(); UI.hotbarMove(e.shiftKey ? -1 : 1); }
    if (k === "f") UI.hotbarUse();
    if (/^[1-9]$/.test(k)) UI.hotbarUse(+k - 1);
  } else if (G.mode === "explore") {
    if (k === "e") nearestInteractable()?.act();
    if (k === "tab") { e.preventDefault(); selectLeader((G.leader + 1) % G.party.length); }
    if (/^[1-9]$/.test(k)) UI.hotbarUse(+k - 1);
  }
});
addEventListener("keyup", (e) => G.keys.delete(e.key.toLowerCase()));
addEventListener("resize", resize);
// the party portraits and the log sit above the action bar, however tall it wraps on a narrow screen
new ResizeObserver(() => document.documentElement.style.setProperty("--hbh", document.getElementById("hotbar").offsetHeight + "px")).observe(document.getElementById("hotbar"));

function resize() {
  // the world's pixel size follows the screen's short side, so a phone shows the same field upright and sideways
  const short = Math.min(innerWidth, innerHeight), s = short >= 1000 ? 3 : short >= 520 ? 2 : 1;
  // the interface has its own pixel size: 2 screen pixels per UI pixel at 1080p
  const u = +new URLSearchParams(location.search).get("u") || (innerHeight >= 1500 ? 3 : innerHeight >= 950 && innerWidth >= 1500 ? 2 : innerHeight >= 640 && innerWidth >= 1000 ? 1.5 : 1);
  document.documentElement.style.setProperty("--u", u);
  G.ui = u;
  G.scale = s;
  G.vw = Math.ceil(innerWidth / s); G.vh = Math.ceil(innerHeight / s);
  // the 3D view paints at twice the game resolution, so scaled sprites and the ground's rows stay crisp
  const ss = PV.on ? PV.ss : 1;
  canvas.width = G.vw * ss; canvas.height = G.vh * ss;
  pvFrame(G.vw, G.vh);
  canvas.style.width = G.vw * s + "px"; canvas.style.height = G.vh * s + "px";
  screen.imageSmoothingEnabled = false;
  G.fx?.resize(G.vw, G.vh);
  document.body.classList.toggle("portrait", innerHeight > innerWidth * 1.1);
  document.body.classList.toggle("short", innerHeight / u < 480);
}

// ---------------------------------------------------------------- update
/** People standing about look around now and then, and turn to whoever comes close; only while exploring, and only
 * in how they are drawn (u.face): where they face in the story (u.dir, which the save keeps) never changes. */
function glance(n, dt) {
  const l = lead();
  if (G.mode !== "explore" || !l || n.fixed || n.ghost || n.float || n.hidden || n.gone || n.moving || n.path?.length || n.team !== "npc") { n.face = null; return; }
  const dx = l.x - n.x, dy = l.y - n.y;
  if (dx * dx + dy * dy < (2.6 * TILE) ** 2) { n.face = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 1 : 2) : dy < 0 ? 3 : 0; n.lookT = 1.5; return; }
  n.lookT = (n.lookT ?? 2 + hash2(Math.round(n.x), 3, 9) * 6) - dt;
  if (n.lookT > 0) return;
  // a look to one side, then back to what they were doing
  n.face = n.face == null && hash2(Math.round(G.time), Math.round(n.x), 11) < 0.6 ? [0, 1, 2][Math.floor(hash2(Math.round(G.time * 7), Math.round(n.y), 13) * 3)] : null;
  n.lookT = n.face == null ? 4 + hash2(Math.round(G.time), Math.round(n.y), 17) * 6 : 1.2 + hash2(Math.round(G.time), 2, 19) * 1.6;
}
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
  const l = lead(), vale = G.W.id === "vale", out = !!G.W.outdoor;
  const zone = vale ? zoneAt(l.x, l.y) : G.W.zone, ruins = zone === "Ruínas de Velmoor";
  const track = G.musicOverride !== undefined ? G.musicOverride : G.mode === "combat" ? "combat" : G.mode === "over" ? null : !out ? "dream" : ruins ? "ruins" : G.W.music ?? "meadow";
  playMusic(track, G.mode === "combat" ? 0.5 : 2.5);
  const w = vale ? waterField(l.x, l.y) : 9, fire = Math.max(0, ...campfires().map((o) => 1 - dist(o.x, o.y, l.x, l.y) / 220));
  updateAmbience({
    wind: !out ? 0.35 : ruins ? 1 : 0.7, water: vale ? clamp(1 - w / 1.1, 0, 1) : out ? clamp(1 - Math.abs(G.W.id === "vau" ? l.y - 25 * TILE : l.x - 31 * TILE) / (7 * TILE)) : 0, fire,
    birds: !out || ruins || G.mode === "combat" || (vale && G.f.escape) || G.clock > 19.5 || G.clock < 5.5 ? 0 : 1, ruins: !out ? 0.8 : ruins ? 1 : 0,
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
  document.getElementById("mute").innerHTML = icon(muted ? "mute" : "sound");
  document.getElementById("muteAll").checked = muted;
  document.getElementById("pause").classList.toggle("muted", muted);
}
// ---------------------------------------------------------------- pause menu
function setupMenu(corner = true) {
  document.getElementById("corner").classList.toggle("hidden", !corner);
  document.getElementById("resume").textContent = corner ? "Continuar" : "Voltar";
  document.getElementById("menuBtn").onclick = () => setPaused(!G.paused);
  document.getElementById("mute").onclick = () => syncMute(toggleMute());
  document.getElementById("bagBtn").onclick = () => toggleJournal("bag");
  document.getElementById("bookBtn").onclick = () => toggleJournal("quests");
  document.getElementById("muteAll").onchange = (e) => syncMute(setMuted(e.target.checked));
  document.getElementById("tutOn").onchange = (e) => setTutorial(e.target.checked);
  document.getElementById("resume").onclick = () => setPaused(false);
  const sv = document.getElementById("saveBtn"), ld = document.getElementById("loadBtn");
  sv.classList.toggle("hidden", !corner); ld.classList.toggle("hidden", !corner);
  sv.onclick = () => openSaves("save", () => { syncSaveBtn(); sv.focus(); });
  ld.onclick = () => openSaves("load", () => ld.focus());
  const pOn = document.getElementById("perspOn"), tilt = document.getElementById("tilt"), tiltPct = document.querySelector("#tiltRow .pct");
  const showTilt = () => { tiltPct.textContent = Math.round(tilt.value * 100) + "%"; };
  pOn.checked = PV.on; tilt.value = PV.tilt; showTilt();
  document.getElementById("tiltRow").classList.toggle("off", !PV.on);
  pOn.onchange = () => setView(pOn.checked);
  tilt.oninput = () => { showTilt(); setView(PV.on, +tilt.value); };
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
  // light: off / low / high, and how strong
  const lo = document.getElementById("lightOpts");
  const modes = [["off", "Desligada"], ["low", "Baixa"], ["high", "Alta"]];
  const drawLight = () => {
    lo.innerHTML = lightAvailable()
      ? `<div class="seg">${modes.map(([k, l]) => `<button data-lm="${k}" class="${lightSettings.mode === k ? "on" : ""}">${l}</button>`).join("")}</div>
        <label class="vrow ${lightSettings.mode === "off" ? "off" : ""}"><span>Intensidade</span><input type="range" min="0.4" max="1.4" step="0.1" value="${lightSettings.intensity}"><span class="pct">${Math.round(lightSettings.intensity * 100)}%</span></label>
        <p class="muted">${lightSettings.mode === "off" ? "Sem luz dinâmica: o jogo como era." : lightSettings.mode === "low" ? "Luzes e hora do dia, sem sombras." : "Luzes, hora do dia e sombras dos objetos."}</p>`
      : `<p class="muted">Este navegador não tem WebGL2: a luz dinâmica fica desligada.</p>`;
    lo.querySelectorAll("[data-lm]").forEach((b) => (b.onclick = () => { setLight({ mode: b.dataset.lm }); sfx.click(); drawLight(); lo.querySelector(`[data-lm="${b.dataset.lm}"]`)?.focus(); }));
    const r = lo.querySelector("input");
    if (r) r.oninput = () => { setLight({ intensity: +r.value }); lo.querySelector(".pct").textContent = Math.round(r.value * 100) + "%"; };
  };
  drawLight();
  fillControls();
  document.getElementById("newsBtn").onclick = () => openNotes();
  document.getElementById("pauseVer").textContent = `Brumafolha v${VERSION}`;
  const fs = document.getElementById("fullscreen");
  fs.classList.toggle("hidden", !document.fullscreenEnabled && !document.documentElement.webkitRequestFullscreen);
  fs.onclick = toggleFullscreen;
}
/** Phones lose a third of the screen to the browser's bars: the game can take all of it. */
function toggleFullscreen() {
  const d = document, el = d.documentElement;
  if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen ?? d.webkitExitFullscreen).call(d);
  else (el.requestFullscreen ?? el.webkitRequestFullscreen)?.call(el, { navigationUI: "hide" })?.catch?.(() => {});
}
addEventListener("fullscreenchange", () => { document.getElementById("fullscreen").textContent = document.fullscreenElement ? "Sair da tela cheia" : "Tela cheia"; });
/** The pause menu's list of controls: keys and buttons, or gestures on a touch screen. */
function fillControls() {
  const el = document.getElementById("keys");
  if (!el) return;
  if (isTouch()) {
    el.innerHTML = [
      ["Toque no chão", "andar"], ["Segure e arraste", "andar sem parar"], ["Toque numa pessoa ou objeto", "conversar, usar"],
      ["Toque no balão sobre algo", "usar o que está perto"], ["Toque num retrato", "trocar de personagem"],
      ["Combate: toque 1×", "ver o caminho, a chance de acerto"], ["Combate: toque 2×", "confirmar"],
      ["Combate: arraste", "mover a câmera"], ["Barra de baixo", "ações; tocar mostra o que fazem"],
    ].map(([k, t]) => `<li><b>${k}</b></li><li>${t}</li>`).join("");
    return;
  }
  el.innerHTML = [
    [key("Clique", "") + key("WASD", "L"), "andar"], [key("E", "A"), "interagir, confirmar"], [key("Tab", ""), "trocar de personagem"],
    [key("1-9", "LB RB") + key("", "X"), "usar a barra de ações"], [key("Setas", "D-pad"), "cursor no combate, navegar nos menus"],
    [key("Espaço", "Y"), "encerrar o turno"],
    [key("Botão direito + arrastar", "RS") + key("Shift+WASD", ""), "mover a câmera no combate"], [key("C", ""), "recentralizar a câmera"], [key("Esc", "B"), "cancelar, voltar"], [key("I", "Select"), "Bolsa"], [key("J", "Y"), "Diário"],
    [key("Q E", "LB RB"), "trocar de aba nos menus"], [key("M", ""), "som"], [key("V", ""), "perspectiva 3D"], [key("Esc P", "Start"), "este menu"],
  ].map(([k, t]) => `<li>${k}</li><li>${t}</li>`).join("");
}
function setPaused(p) {
  if (G.mode === "over" || G.mode === "end") p = false;
  G.paused = p;
  if (p) syncSaveBtn();
  if (!p && G.mode === "title") setTimeout(() => document.getElementById("options").focus(), 0);
  if (p) setTimeout(() => focusDefault(document.getElementById("pause"), true), 0);
  G.keys.clear();
  UI.tooltip(null);
  document.getElementById("pause").classList.toggle("hidden", !p);
  sfx.click();
}

/** Ease the camera toward a point (a cutscene's focus, the unit in combat, the leader). */
function moveCamera(dt, f) {
  if (!f) return;
  const tx = camClamp(f.x - G.vw / 2, G.W.w * TILE, G.vw), ty = PV.on ? camClampTilted(f.y - 16 - G.vh / 2, G.W.h * TILE) : camClamp(f.y - 16 - G.vh / 2, G.W.h * TILE, G.vh);
  const k = 1 - Math.exp(-dt * (G.camFocus?.speed ?? f.camSpeed ?? (G.mode === "combat" ? 4 : 6)));
  G.cam.x += (tx - G.cam.x) * k; G.cam.y += (ty - G.cam.y) * k;
}

/** The pause menu's Save button says why it can't, when it can't. */
function syncSaveBtn() {
  const b = saveBlock(), sv = document.getElementById("saveBtn");
  sv.title = b?.hard ?? (b?.wait ? `Vai salvar quando terminar ${b.wait}` : "Salvar o jogo (F5 faz um save rápido)");
  sv.classList.toggle("off", !!b?.hard);
}

let zoneNow = "", zoneT = 0;
function update(dt) {
  G.time += dt;
  if (G.clockTarget != null) G.clock += clamp(G.clockTarget - G.clock, -dt / 45, dt / 45); // the story moves the sun
  if (G.hitstop > 0) { G.hitstop -= dt; return; }
  G.fx.update(dt);
  if (G.mode === "title") {
    // the menu's background: a slow drift over the Lago Espelhado
    const a = G.time * 0.035;
    G.camFocus = null;
    moveCamera(dt, { x: (39 + Math.sin(a) * 8) * TILE, y: (27 + Math.sin(a * 1.6) * 3.5) * TILE });
    updateAmbience({ wind: 0.45, water: 0.6, fire: 0, birds: 0.45, ruins: 0 }, dt, G.time); // the lake at the end of the afternoon
    return;
  }
  if (G.mode === "intro") {
    updateIntro(dt);
    for (const u of G.followers) { stepAlongPath(u, dt); u.animT += dt; }
    moveCamera(dt, G.camFocus);
    return;
  }
  if (!G.party.length) return;
  tickSaves(dt);
  const l = lead();
  if (G.mode === "explore") {
    // keyboard walking
    let mx = 0, my = 0;
    if (G.keys.has("w") || G.keys.has("arrowup")) my--;
    if (G.keys.has("s") || G.keys.has("arrowdown")) my++;
    if (G.keys.has("a") || G.keys.has("arrowleft")) mx--;
    if (G.keys.has("d") || G.keys.has("arrowright")) mx++;
    if (!mx && !my) { mx = Input.axis.x; my = Input.axis.y; }
    if (!mx && !my) { const st = touchSteer(); if (st) [mx, my] = st; }
    if (mx || my) {
      l.path = []; pending = null;
      const k = Math.min(88, G.speedCap ?? 88) * dt / Math.max(1, Math.hypot(mx, my));
      if (canStand(l.x + mx * k, l.y)) l.x += mx * k;
      if (canStand(l.x, l.y + my * k)) l.y += my * k;
      l.dir = Math.abs(mx) >= Math.abs(my) ? (mx < 0 ? 1 : 2) : my < 0 ? 3 : 0;
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
      const z = G.W.id === "vale" ? zoneAt(l.x, l.y) : G.W.zoneAt ? G.W.zoneAt(l.x, l.y) : G.W.zone;
      if (z !== zoneNow) { zoneNow = z; UI.banner(z); }
    }
  } else if (G.mode === "combat") {
    for (const u of [...G.party, ...G.enemies]) stepAlongPath(u, dt);
  } else if (G.mode === "cutscene" || G.mode === "dialogue") {
    for (const u of [...G.party, ...G.enemies, ...G.followers]) stepAlongPath(u, dt);
    if (G.followLeader) followTrail(dt);
  }
  if (G.mode !== "combat") for (const n of G.npcs) stepAlongPath(n, dt);
  for (const n of G.npcs) glance(n, dt);
  for (const u of [...G.party, ...G.enemies, ...G.npcs, ...G.followers]) {
    u.animT += dt;
    if (u.poseT > 0) u.poseT -= dt; else u.pose = "idle";
    if (u.flashT > 0) u.flashT -= dt;
    for (const k of ["lunge", "knock"]) if (u[k]) { u[k].t -= dt; if (u[k].t <= 0) u[k] = null; }
    if (u.alert > 0) u.alert -= dt;
  }
  S.update(dt);
  updateAudio(dt);
  // camera: in combat the player may look around freely until the next action
  if (G.mode !== "combat") { freeCam = false; drag = null; }
  else if (!G.camFocus) panCamera(dt);
  if (!(freeCam && G.mode === "combat" && !G.camFocus)) moveCamera(dt, G.camFocus ?? (G.mode === "combat" && G.focus ? G.focus : l));
  if (G.shake > 0) G.shake -= dt;
  if (clickMark) { clickMark.t -= dt; if (clickMark.t <= 0) clickMark = null; }
  // the keyboard/pad cursor moves the "mouse" during combat
  if (cursor.on && G.mode === "combat") { [G.mouse.x, G.mouse.y] = UI.worldToScreen(cursor.tx * TILE + 16, cursor.ty * TILE + 12); G.mouse.in = true; }
  else if (cursor.on) cursor.on = false;
  // what the leader could use right now, with the key that does it
  if (G.mode === "explore") { const it = nearestInteractable(); UI.prompt(it, it && `${isTouch() ? icon("hand", "sm") : key("E", "A")} ${it.name}`); } else UI.prompt(null);
  // mouse in world
  mouseWorld();
  if (G.mode === "combat" && G.mouse.in) combatHover(G.mouse.tx, G.mouse.ty);
  else if (G.mode === "explore" && G.mouse.in) {
    const it = underMouse();
    const en = G.enemies.find((e) => { if (e.hp <= 0 || e.gone || e.passive) return false; const [dx, dy] = mouseRel(e.x, e.y); return Math.abs(dx) < 12 && dy < 3 && dy > -32; });
    UI.tooltip(it ? UI.tipHTML({ icon: it.ent ? "talk" : "hand", title: it.name, foot: `${key("Clique", "A")} ${it.ent ? "falar" : "usar"}` })
      : en ? UI.tipHTML({ icon: "skull", title: en.name, sub: "hostil", rows: [["PV", `${en.hp}/${en.maxHp}`], ["CA", en.ac]] }) : null);
    canvas.style.cursor = it ? "pointer" : "";
  } else if (G.mode !== "combat") { UI.tooltip(null); canvas.style.cursor = ""; }
}
/** Keep the camera inside the map; a map smaller than the screen sits in the middle. */
const camClamp = (v, size, view) => (size <= view ? (size - view) / 2 : clamp(v, 0, size - view));
/** The tilted camera sees less ground below the focus and more above it (fading into the haze): keep its near edge on the map. */
const camClampTilted = (v, size) => { const hi = size - PV.fyBot; return hi <= 0 ? (size - PV.fyBot - Math.max(0, PV.fyTop)) / 2 : clamp(v, 0, hi); };

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
  // a blink now and then while standing (each one on its own beat); the face it shows can be a glance (u.face)
  const dir = u.face ?? u.dir;
  const blink = fi === 4 && !u.moving && dir !== 3 && ((G.time + (u.blinkPh ??= hash2(Math.round(u.x), Math.round(u.y), 5) * 5)) % 4.6) < 0.14;
  const set = sheetOf(u), fj = blink && set.frames[dir][7] ? 7 : fi;
  const img = u.flashT > 0 ? set.flash[dir][fj] : set.frames[dir][fj];
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
    anchored(u.x, u.y, () => {
      const x = Math.round(u.x - cx) - 9, y = Math.round(u.y - cy) - 40;
      ctx.fillStyle = "#120e16"; ctx.fillRect(x - 1, y - 1, 20, 4);
      ctx.fillStyle = "#3a1414"; ctx.fillRect(x, y, 18, 2);
      ctx.fillStyle = u.team === "enemy" ? "#e0402a" : u.ai ? "#e8c06a" : "#6ad04a"; ctx.fillRect(x, y, Math.ceil((18 * u.hp) / u.maxHp), 2);
    });
  }
}

// ---------------------------------------------------------------- the 3D view
// The flat scene is painted as before; in 3D the ground goes to an offscreen layer that is then laid on the tilted
// plane one screen row at a time, and every standing thing is drawn upright at its feet, scaled by its distance.
// `base` is what the frame is being painted on: the screen, or (light on) one of the lit renderer's layers.
const view = { cx: 0, cy: 0, ss: 1, lit: false };
let base = screen;
const flats = [];
/** Paint on `c` from here on, in game pixels. */
function paintOn(c) { base = ctx = c; ctx.setTransform(view.ss, 0, 0, view.ss, 0, 0); }
/** An offscreen flat layer of w × h: [what to draw from, what to paint with]. A GPU surface when the light is on. */
function flatLayer(i, w, h) {
  if (view.lit) { const L = lightSurface(i, w, h); return [L, L]; }
  let L = flats[i];
  if (!L || L[0].width !== w || L[0].height !== h) L = flats[i] = makeCanvas(w, h);
  L[1].setTransform(1, 0, 0, 1, 0, 0);
  return L;
}
/** Draw fn() in flat coordinates as a billboard standing at world (x, y). In the flat view, just fn(). */
function anchored(x, y, fn) {
  if (!PV.on) { fn(); return; }
  const fx = x - view.cx, fy = y - view.cy, p = project(fx, fy);
  if (!p || p.x < -200 * p.k || p.x > G.vw + 200 * p.k) return;
  const ss = view.ss, k = ss * p.k;
  ctx.setTransform(k, 0, 0, k, Math.round(ss * (p.x - p.k * fx)), Math.round(ss * (p.y - p.k * fy)));
  fn();
  ctx.setTransform(ss, 0, 0, ss, 0, 0);
}
/** Lay a flat layer whose top-left is at flat (fx0, fy0) onto the tilted ground plane. */
function warp(src, fx0, fy0) {
  const ss = view.ss, rows = Math.ceil(G.vh * ss), vw = G.vw;
  for (let r = 0; r < rows; r++) {
    const sy = (r + 0.5) / ss, k = (sy - PV.hy) / PV.D;
    const fy = Math.floor(rowToFlat(sy)) - fy0;
    if (fy < 0 || fy >= src.height) continue;
    const half = PV.cx / k;
    ctx.drawImage(src, PV.cx - half - fx0, fy, half * 2, 1, 0, r / ss, vw, 1 / ss);
  }
}
/** Paint into an offscreen flat layer (ground, fog) as if it were the screen, then warp it into place. */
function flatPass(i, cx, cy, box, paint, clear) {
  const [c, x] = flatLayer(i, box.w, box.h);
  if (clear) x.clearRect(0, 0, box.w, box.h);
  const vw = G.vw, vh = G.vh, to = base;
  ctx = x; G.vw = box.w; G.vh = box.h;
  try { paint(cx + box.x, cy + box.y, box.w, box.h); } finally { ctx = to; G.vw = vw; G.vh = vh; }
  ctx.setTransform(view.ss, 0, 0, view.ss, 0, 0);
  warp(c, box.x, box.y);
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
  if (G.mouse.in && cursor.on) {
    // the keyboard/pad cursor: four gold corners that breathe
    const x = Math.round(mx * TILE - cx), y = Math.round(my * TILE - cy), k = Math.floor(G.time * 3) % 2, L = 7;
    for (const [c, w] of [["#18121e", 3], [G.W.blocked(mx, my) ? "#ff7a5a" : "#f6d056", 1]]) {
      ctx.fillStyle = c;
      const o = (w - 1) / 2;
      for (const [ax, ay, sx, sy] of [[x - k, y - k, 1, 1], [x + TILE - 1 + k, y - k, -1, 1], [x - k, y + TILE - 1 + k, 1, -1], [x + TILE - 1 + k, y + TILE - 1 + k, -1, -1]]) {
        ctx.fillRect(Math.min(ax, ax + sx * (L - 1)) - o, ay - o, L + o * 2, w);
        ctx.fillRect(ax - o, Math.min(ay, ay + sy * (L - 1)) - o, w, L + o * 2);
      }
    }
  } else if (G.mouse.in && !G.W.blocked(mx, my)) { ctx.strokeStyle = "rgba(244,236,220,0.5)"; ctx.strokeRect(Math.round(mx * TILE - cx) + 0.5, Math.round(my * TILE - cy) + 0.5, TILE - 1, TILE - 1); }
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
  // bands two pixels tall, but neighbours that slide by the same amount go out as one blit (a tree is a handful, not fifty)
  const L = a.leaves, B = 2, LW = L.width, LH = L.height, rest = Math.min(LH, Math.ceil(bottom / B) * B);
  let r0 = 0, o0 = 0;
  for (let row = 0; row < rest; row += B) {
    const k = Math.min(1, (bottom - row) / (bottom - top));
    const off = Math.round(amp * k * gust * (Math.sin(t * speed + ph - row * 0.035) + 0.35 * Math.sin(t * speed * 2.3 + ph * 1.7 - row * 0.06)));
    if (off !== o0) { if (row > r0) target.drawImage(L, 0, r0, LW, row - r0, x + o0, y + r0, LW, row - r0); r0 = row; o0 = off; }
  }
  if (rest > r0) target.drawImage(L, 0, r0, LW, rest - r0, x + o0, y + r0, LW, rest - r0);
  if (LH > rest) target.drawImage(L, 0, rest, LW, LH - rest, x, y + rest, LW, LH - rest);
}

/** Mirror images of whatever stands by the water: flipped at the feet, rippling, cut to the water and tinted by it. */
function drawReflections(cx, cy, items) {
  const W = G.W;
  if (!W.waterMask) return;
  const vw = G.vw, vh = G.vh, gpu = !!ctx.mirror;
  if (!gpu && (!reflA || reflA[0].width !== vw || reflA[0].height !== vh)) { reflA = makeCanvas(vw, vh); reflB = makeCanvas(vw, vh); reflB[0].dyn = true; }
  // on the GPU layers the mirrored sprites are drawn straight onto the ground, rippled and cut to the water by the shader
  const [ca, a] = gpu ? [null, ctx] : reflA, [cb, b] = gpu ? [] : reflB;
  if (gpu) ctx.mirror(W.waterMask, cx, cy, G.time); else a.clearRect(0, 0, vw, vh);
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
  if (gpu) { ctx.mirror(null); return; }
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
const glows = new Map();
/** The same soft glow as a picture, for the GPU layers (which have no gradients). */
function glowArt(r, g, b, a) {
  const k = `${r},${g},${b},${a}`;
  if (!glows.has(k)) {
    const [c, x] = makeCanvas(96, 96), gr = x.createRadialGradient(48, 48, 0, 48, 48, 48);
    gr.addColorStop(0, `rgba(${k})`); gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
    x.fillStyle = gr; x.fillRect(0, 0, 96, 96);
    glows.set(k, c);
  }
  return glows.get(k);
}
function drawGlows(cx, cy) {
  const list = [];
  for (const o of G.W.objects) if (o.glow && !o.hidden) list.push([o.x, o.y, o.glow]);
  for (const u of [...G.party, ...G.npcs, ...G.followers, ...G.enemies]) if (u.glow && !u.gone && !u.hidden) list.push([u.x, u.y, u.glow]);
  if (!list.length) return;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const [x, y, g] of list) {
    let sx = x - cx, sy = y - cy - (g.h ?? 16), k = 1;
    if (PV.on) { const p = project(x - cx, y - cy); if (!p) continue; k = p.k; sx = p.x; sy = p.y - (g.h ?? 16) * k; }
    const r = g.r * k * (1 + Math.sin(G.time * 2 + x) * 0.05);
    if (sx < -r || sy < -r || sx > G.vw + r || sy > G.vh + r) continue;
    const [R, Gc, B] = g.c ?? [150, 190, 255];
    if (ctx.pixels) { ctx.drawImage(glowArt(R, Gc, B, g.a ?? 0.35), sx - r, sy - r, r * 2, r * 2); continue; }
    const gr = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
    gr.addColorStop(0, `rgba(${R},${Gc},${B},${g.a ?? 0.35})`); gr.addColorStop(1, `rgba(${R},${Gc},${B},0)`);
    ctx.fillStyle = gr;
    ctx.fillRect(sx - r, sy - r, r * 2, r * 2);
  }
  ctx.restore();
}

/** The Bruma: a soft pearly fog from the story's fog field, rendered at a quarter resolution. */
function drawFog(cx, cy) {
  if (!S.hasFog()) return;
  // the tilted camera sees several times more ground, and squeezes the far part of it: coarser cells are enough there
  const C = PV.on ? 8 : 4, M = 4, w = Math.ceil(G.vw / C) + 1 + M * 2, h = Math.ceil(G.vh / C) + 1 + M * 2;
  if (!fogC || fogC.width !== w || fogC.height !== h) { [fogC, fogX] = makeCanvas(w, h); fogC.img = fogX.createImageData(w, h); fogC.age = 99; }
  const ox = Math.floor(cx / C) - M, oy = Math.floor(cy / C) - M;
  // the field drifts slowly: it is worked out every third frame (or when the camera outruns the margin) and reused between
  const fresh = ++fogC.age >= 3 || fogC.map !== G.W || Math.abs(ox - fogC.ox) >= M || Math.abs(oy - fogC.oy) >= M;
  if (fresh) {
    fogC.age = 0; fogC.map = G.W; fogC.ox = ox; fogC.oy = oy;
    const d = fogC.img.data, t = G.time;
    // the Bruma takes the colour of the hour (pearly blue at night: it "glows faintly", never white on a dark map)
    // and catches the warm light of fires and lamps near it
    const [mr, mg, mb] = air.fog, R0 = 236 * mr, G0 = 240 * mg, B0 = 246 * mb;
    const x0 = ox * C, y0 = oy * C, x1 = x0 + w * C, y1 = y0 + h * C;
    const lamps = air.lamps.filter((L) => L.x + L.r > x0 && L.x - L.r < x1 && L.y + L.r > y0 && L.y - L.r < y1);
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) {
        const wx = (ox + i) * C, wy = (oy + j) * C;
        let f = S.fogAt(wx, wy);
        if (f > 0.01) f *= 0.7 + vnoise(wx / 70 + t * 0.12, wy / 50 - t * 0.05, 5) * 0.55;
        const k = (j * w + i) * 4;
        let r = R0, g = G0, b = B0;
        if (f > 0.01) for (const L of lamps) {
          const q = 1 - Math.hypot(wx - L.x, (wy - L.y) * 1.25) / L.r;
          if (q > 0) { const e = q * q * L.i * air.lampK; r += L.c[0] * e; g += L.c[1] * e; b += L.c[2] * e; }
        }
        d[k] = Math.min(255, r); d[k + 1] = Math.min(255, g); d[k + 2] = Math.min(255, b); d[k + 3] = clamp(f, 0, 1) * 235;
      }
  }
  const x = fogC.ox * C - cx, y = fogC.oy * C - cy;
  if (ctx.pixels) { ctx.pixels("fog", fogC.img.data, w, h, fresh ? null : false, x, y, w * C, h * C, true); return; }
  if (fresh || fogC.stale) fogX.putImageData(fogC.img, 0, 0);
  fogC.stale = false;
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(fogC, x, y, w * C, h * C);
  ctx.restore();
}

const SEC = {}; let secT = 0;
/** Close a section of the frame for the F3 meter. */
function sec(name) { if (!meter) return; const n = performance.now(); SEC[name] = (SEC[name] ?? 0) + n - secT; secT = n; }

/** The ground layer: terrain, water glints, markers, the combat grid, reflections, shadows and selection rings. */
function drawFloor(cx, cy, vw, vh, items, bg) {
  const W = G.W, t = G.time;
  ctx.fillStyle = bg; ctx.fillRect(0, 0, vw, vh);
  ctx.drawImage(W.ground, -cx, -cy);

  // water: drifting glints and a breathing shoreline
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
  sec("chão");
  // click marker
  if (clickMark) ring(clickMark.x - cx, clickMark.y - cy, `rgba(232,192,106,${clickMark.t * 2})`, 6 + (0.5 - clickMark.t) * 10);
  S.drawGround(ctx, cx, cy);
  drawCombatGrid(cx, cy);
  drawReflections(cx, cy, items);
  sec("reflexos");
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
}

/** One standing thing: a unit, a chest, a tuft of grass or a prop, with its top-left relative to the camera. */
function drawItem(it, cx, cy) {
  const t = G.time;
  if (it.u) { drawUnit(it.u, cx, cy); return; }
  if (it.c) { const a = G.chestArt[it.c.open ? 1 : 0]; ctx.drawImage(a.c, Math.round(it.c.x - cx - a.ox), Math.round(it.c.y - cy - a.oy)); return; }
  if (it.g) {
    const ga = grassArt[it.g.v];
    let f = Math.floor((t * 1.6 + it.g.ph) % 4);
    for (const p of G.party) if (Math.abs(p.x - it.g.x) < 9 && Math.abs(p.y - it.g.y) < 6) f = p.x < it.g.x ? 1 : 3;
    ctx.drawImage(ga.frames[f], Math.round(it.g.x - cx - ga.ox), Math.round(it.g.y - cy - ga.oy));
    return;
  }
  const o = it.o, a = o.art;
  if (!a) return;
  const x = Math.round(o.x - cx - a.ox), y = Math.round(o.y - cy - a.oy);
  if (o.alpha != null) ctx.globalAlpha = o.alpha;
  if (o.clip) {
    // dissolving from the bottom up, like wet paper
    const keep = Math.max(0, Math.round(a.c.height * (1 - o.clip)));
    if (keep > 0) ctx.drawImage(a.c, 0, 0, a.c.width, keep, x, y, a.c.width, keep);
    ctx.globalAlpha = 1;
    return;
  }
  if (a.canopy) {
    // see-through canopy when someone stands behind it
    const bx = o.x - a.ox + a.canopy.x, by = o.y - a.oy + a.canopy.y;
    const hide = [...G.party, ...G.enemies].some((u) => !u.gone && u.y < o.y - 2 && u.x > bx && u.x < bx + a.canopy.w && u.y - 20 > by && u.y - 20 < by + a.canopy.h);
    if (hide) { ctx.globalAlpha = 0.45; drawProp(ctx, o, x, y); ctx.globalAlpha = 1; return; }
  }
  drawProp(ctx, o, x, y);
  ctx.globalAlpha = 1;
}

/** Distance haze for the 3D view, per area: far ground fades into the air (or the dark, underground). */
const HAZE = { vale: "150,172,182", sonho: "232,235,241", relicario: "12,16,24", vau: "96,110,132", travessia: "150,172,182" };
const hazeArt = new Map();
/** The haze as a tall strip to stretch over the top of the view (the GPU layers have no gradients). */
function hazeStrip(rgb) {
  if (!hazeArt.has(rgb)) {
    const [c, x] = makeCanvas(1, 128);
    for (let i = 0; i < 128; i++) { const k = i / 127, a = k < 0.45 ? 0.62 + (0.2 - 0.62) * (k / 0.45) : 0.2 * (1 - (k - 0.45) / 0.55); x.fillStyle = `rgba(${rgb},${a})`; x.fillRect(0, i, 1, 1); }
    hazeArt.set(rgb, c);
  }
  return hazeArt.get(rgb);
}

function draw() {
  const vw = G.vw, vh = G.vh, ss = PV.on ? PV.ss : 1;
  secT = performance.now();
  let cx = Math.round(G.cam.x), cy = Math.round(G.cam.y);
  if (G.shake > 0) { cx += Math.round((Math.random() - 0.5) * 4); cy += Math.round((Math.random() - 0.5) * 4); }
  const W = G.W;
  // with the light on, the scene is painted in layers (ground, sprites, overlay) and put together by light.js
  // (with the light off the layers are still used, just not lit: the GPU draws the frame far faster than canvas 2D)
  const gpu = lightAvailable(), lit = lightOn(), LY = gpu ? lightLayers(vw * ss, vh * ss) : null;
  Object.assign(view, { cx, cy, ss, lit: gpu });
  showLight(gpu, vw * G.scale, vh * G.scale);
  paintOn(gpu ? LY[0].x : screen);
  // past the edge of an outdoor map is more wood, in the dark (the tilted camera sees past the edges): not a black void
  const bg = W.id === "sonho" ? "#e8ebf1" : W.id === "relicario" ? "#0e1219" : (W.outdoor || W.id === "vale") && PV.on ? "#16231c" : "#0b0a10";

  // the part of the flat world this frame shows: the screen, or (3D) the trapezoid under the tilted camera
  const box = { x: 0, y: 0, w: vw, h: vh };
  if (PV.on) {
    pvFrame(vw, vh);
    box.x = Math.floor(PV.cx - PV.cx / PV.kTop) - 1; box.y = Math.floor(PV.fyTop) - 1;
    box.w = Math.ceil(vw / PV.kTop) + 3; box.h = Math.ceil(PV.fyBot) + 2 - box.y;
  }

  // everything standing, sorted by its feet
  const items = [];
  const inView = (x, y, m = 120) => x > cx + box.x - m && x < cx + box.x + box.w + m && y > cy + box.y - 20 && y < cy + box.y + box.h + 160;
  for (const o of W.objects) if (!o.hidden && inView(o.x, o.y, o.kind === "house" ? 210 : 120)) items.push({ y: o.y + (o.sortY ?? 0), o });
  for (const o of W.decor) if (inView(o.x, o.y, 40)) items.push({ y: o.y, o });
  for (const g of W.grass) if (inView(g.x, g.y, 20)) items.push({ y: g.y, g });
  for (const u of [...G.party, ...G.enemies, ...G.npcs, ...G.followers]) if (!u.gone && !u.hidden && inView(u.x, u.y)) items.push({ y: u.y + (u.float ? 40 : 0), u });
  G.chests.forEach((c) => inView(c.x, c.y) && items.push({ y: c.y, c }));
  items.sort((a, b) => a.y - b.y);
  sec("ordem");

  if (PV.on) {
    ctx.fillStyle = bg; ctx.fillRect(0, 0, vw, vh);
    flatPass(0, cx, cy, box, (x, y, w, h) => drawFloor(x, y, w, h, items, bg));
  } else drawFloor(cx, cy, vw, vh, items, bg);
  sec("chão");

  if (gpu) paintOn(LY[1].x);
  for (const it of items) { const p = it.u ?? it.c ?? it.g ?? it.o; anchored(p.x, p.y, () => drawItem(it, cx, cy)); }
  sec("sprites");
  // the people in the boat sit with the sprites when the light is on, so the lamps reach them
  const boat = PV.on && W.objects.find((o) => o.id === "boat");
  const over = () => (boat ? anchored(boat.x, boat.y, () => S.drawOver(ctx, cx, cy)) : S.drawOver(ctx, cx, cy));
  if (lit) over();
  if (gpu) paintOn(LY[2].x);
  drawBars(cx, cy);
  if (PV.on) {
    const hz = HAZE[W.id] ?? HAZE.vale;
    if (gpu) ctx.drawImage(hazeStrip(hz), 0, 0, vw, PV.sA * 0.8);
    else {
      const g = ctx.createLinearGradient(0, 0, 0, PV.sA * 0.8);
      g.addColorStop(0, `rgba(${hz},0.62)`); g.addColorStop(0.45, `rgba(${hz},0.2)`); g.addColorStop(1, `rgba(${hz},0)`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, vw, vh);
    }
  }

  // atmosphere: the ruins are darker and misty; the dream is pale; the Relicário is cold
  // (with the light on, the darkness of a place is its ambient light instead of a veil over the picture)
  const l = lead(), t = G.time;
  let ruinK = 0;
  if (W.id === "vale" && l) {
    ruinK = clamp(1 - Math.max(0, (l.y - 15 * TILE)) / (6 * TILE)) * (l.x < 33 * TILE ? 1 : 0.3);
    if (ruinK > 0.01 && !lit) { ctx.fillStyle = `rgba(16,20,40,${0.32 * ruinK})`; ctx.fillRect(0, 0, vw, vh); }
  } else if (W.id === "sonho") { ctx.fillStyle = "rgba(170,180,230,0.16)"; ctx.fillRect(0, 0, vw, vh); }
  else if (W.id === "relicario" && !lit) { ctx.fillStyle = "rgba(30,50,90,0.14)"; ctx.fillRect(0, 0, vw, vh); }
  const amb = lit ? ambientNow(ruinK) : null;
  airNow(amb);
  if (G.tint && !lit) { ctx.fillStyle = G.tint; ctx.fillRect(0, 0, vw, vh); }
  sec("barras");
  if (PV.on) G.fx.drawEach(cx, cy, (x, y, fn) => { if (x > cx + box.x - 140 && x < cx + box.x + box.w + 140 && y > cy + box.y - 80 && y < cy + box.y + box.h + 230) anchored(x, y, () => fn(ctx)); });
  else G.fx.draw(ctx, cx, cy, gpu);
  sec("efeitos");
  if (!lit) drawGlows(cx, cy);
  drawCritters(cx, cy, ruinK);
  const mk = W.id === "vale" ? 0.08 + ruinK * 0.7 : W.id === "sonho" ? 0.5 : W.id === "vau" ? 0.05 : 0.15;
  ctx.globalAlpha = mk;
  const mist = mistArt(air.mist);
  const mx = -((cx * 1.0 + t * 8) % mist.width) - mist.width, my = -((cy * 1.0 + t * 3) % mist.height) - mist.height;
  for (let y = my; y < vh; y += mist.height) for (let x = mx; x < vw; x += mist.width) ctx.drawImage(mist, Math.round(x), Math.round(y));
  ctx.globalAlpha = 1;
  sec("névoa fina");
  if (!PV.on) drawFog(cx, cy);
  else if (S.hasFog()) flatPass(1, cx, cy, box, (x, y) => drawFog(x, y), true);
  sec("bruma");
  if (!lit) over();

  // framing: branches at the bottom corners (outdoors), and a vignette
  if (W.id === "vale" || W.id === "travessia") {
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
  if (gpu) {
    renderLight({
      ss, cam: PV.on ? [0, 0] : [cx, cy], add: !PV.on && G.fx.w === vw && G.fx.h === vh ? G.fx.lightPixels : null,
      amb: lit ? amb : { level: 0, tint: [1, 1, 1], tintK: 0, gain: 0 }, // unlit: every colour as painted
      lights: lit ? gatherLights(cx, cy) : [], occluders: lit ? gatherOccluders(items, cx, cy) : [],
    });
    base = ctx = screen;
  }
  sec(gpu ? "moldura+luz" : "moldura");
}

// ---------------------------------------------------------------- light: what shines, what blocks it, how dark it is
// The colours multiply what stays dark: at night every channel goes below 1 (blue the least), so saturated things
// like the lake's turquoise sink with the rest instead of glowing; dawn is cold and pale, the late afternoon golden.
const NIGHT = [0.5, 0.6, 0.94];
const DAY = [ // hour, darkness in ramp steps, ambient colour, how much of it
  [0, -2, NIGHT, 1], [4.6, -2, NIGHT, 1], [5.5, -1.4, [0.7, 0.78, 1], 0.9], [6.3, -0.8, [0.86, 0.9, 1.04], 0.75], [7.2, -0.3, [0.96, 0.98, 1.04], 0.45],
  [8.2, 0, [1, 1, 1], 0], [15.8, 0, [1, 1, 1], 0], [16.9, 0, [1.1, 0.98, 0.84], 0.5], [17.8, -0.6, [1.18, 0.88, 0.66], 0.8], [18.8, -1.2, [1.04, 0.74, 0.7], 0.85],
  [19.6, -1.5, [0.78, 0.66, 0.88], 0.9], [20.4, -2, NIGHT, 1], [24, -2, NIGHT, 1],
];
/** The sky's light at an hour of the day (0–24): whole steps of darkness, and a colour for what stays dark. */
function dayLight(h) {
  h = ((h % 24) + 24) % 24;
  let i = 0;
  while (i < DAY.length - 2 && DAY[i + 1][0] <= h) i++;
  const a = DAY[i], b = DAY[i + 1], k = clamp((h - a[0]) / (b[0] - a[0]));
  const level = Math.round(a[1] + (b[1] - a[1]) * k);
  return { level, tint: a[2].map((v, j) => v + (b[2][j] - v) * k), tintK: a[3] + (b[3] - a[3]) * k, gain: level === 0 ? 0.4 : 1 };
}
function ambientNow(ruinK) {
  const W = G.W;
  if (G.ambient) return G.ambient; // the story's say (a sunset, a room going dark)
  if (W.amb) return W.amb; // indoors, or a dream: the hour doesn't matter
  const d = dayLight(G.clock);
  // the ruins sit under their own smoke: a step darker than the valley, and colder
  if (W.id === "vale" && ruinK > 0.5 && d.level === 0) return { level: -1, tint: [0.78, 0.86, 1.1], tintK: 0.7 * ruinK, gain: 1 };
  return d;
}
G.clock = 9;
/** The open air this frame: colour multipliers for what is painted over the light (the fine mist, the Bruma), and
 * the warm lights the Bruma catches. Unlit (light off, or no WebGL2), everything is as painted. */
const air = { fog: [1, 1, 1], mist: [1, 1, 1], lamps: [], lampK: 0 };
function airNow(amb) {
  air.lamps.length = 0;
  if (!amb) { air.fog = air.mist = [1, 1, 1]; air.lampK = 0; return; }
  const b = 1 + Math.min(0, amb.level) * 0.17;
  const m = amb.tint.map((v) => clamp(b * (1 + (v - 1) * amb.tintK), 0, 1.2));
  air.mist = m;
  air.fog = m.map((v) => 0.42 + 0.58 * v);
  air.lampK = clamp(-amb.level * 0.5 + 0.25, 0.25, 1) * 150;
  for (const o of G.W.objects) {
    if (o.hidden) continue;
    if (o.kind === "campfire") { if (!o.out) air.lamps.push({ x: o.x, y: o.y, r: 150, c: o.goblin ? [0.5, 1, 0.45] : [1, 0.55, 0.2], i: 1 }); }
    else if (o.light && !o.light.off && o.light.r >= 60) air.lamps.push({ x: o.x + (o.light.dx ?? 0), y: o.y, r: o.light.r * 0.9, c: o.light.c, i: (o.light.i ?? 1) * 0.8 });
  }
  for (const o of G.W.decor) if (o.light && o.light.r >= 60) air.lamps.push({ x: o.x, y: o.y, r: o.light.r * 0.9, c: o.light.c, i: (o.light.i ?? 1) * 0.8 });
}
/** The tileable mist in the colour of the hour (a few shades, made once each). */
const mists = new Map();
function mistArt(m) {
  const k = m.map((v) => Math.round(v * 10)).join(",");
  if (!mists.has(k)) {
    if (k === "10,10,10") mists.set(k, mistBase);
    else {
      const [c, x] = makeCanvas(mistBase.width, mistBase.height);
      x.drawImage(mistBase, 0, 0);
      const img = x.getImageData(0, 0, c.width, c.height), q = k.split(",").map((v) => v / 10);
      for (let i = 0; i < img.data.length; i += 4) { img.data[i] *= q[0]; img.data[i + 1] *= q[1]; img.data[i + 2] *= q[2]; }
      x.putImageData(img, 0, 0);
      mists.set(k, c);
    }
  }
  return mists.get(k);
}
const flick = (seed) => { const t = Math.floor(G.time * 9); return 1 + 0.07 * Math.sin(t * 1.7 + seed) + 0.04 * Math.sin(t * 3.3 + seed * 2); };
/** Something at flat (x, y) on the ground, `up` pixels tall: where it is in the view and how large things are there. */
function onView(x, y, up = 0) {
  if (!PV.on) return [x, y - up, 1];
  const p = project(x, y);
  return p ? [p.x, p.y - up * p.k, p.k] : null;
}
function gatherLights(cx, cy) {
  const out = [];
  const add = (wx, wy, up, r, c, i, shadows) => { const p = onView(wx - cx, wy - cy, up); if (p) out.push({ x: p[0], y: p[1], r: r * p[2], c, i, shadows }); };
  const glow = (e, g) => add(e.x, e.y, g.h ?? 16, g.r * 2.6, (g.c ?? [150, 190, 255]).map((v) => v / 255), Math.min(1, (g.a ?? 0.35) * 2.4), g.r > 30);
  for (const o of G.W.objects) {
    if (o.hidden) continue;
    if (o.kind === "campfire") { if (!o.out) add(o.x, o.y, 4, 176, o.goblin ? [0.72, 1, 0.66] : [1, 0.64, 0.32], flick(o.x), true); }
    else if (o.light) { if (!o.light.off) add(o.x + (o.light.dx ?? 0), o.y, o.light.h ?? 0, o.light.r, o.light.c, (o.light.i ?? 1) * (o.light.flicker ? flick(o.x) : 1), o.light.shadows ?? true); }
    else if (o.glow) glow(o, o.glow);
    else if (o.kind === "statue" && o.lit) add(o.x, o.y, 30, 90, [0.6, 0.78, 1], 0.9, true);
  }
  for (const o of G.W.decor) if (o.light) add(o.x + (o.light.dx ?? 0), o.y, o.light.h ?? 0, o.light.r, o.light.c, (o.light.i ?? 1) * (o.light.flicker ? flick(o.x + o.y) : 1), o.light.shadows ?? true);
  for (const u of [...G.party, ...G.npcs, ...G.followers, ...G.enemies]) if (u.glow && !u.gone && !u.hidden) glow(u, u.glow);
  for (const L of G.fx.lights()) add(L.x, L.y, 0, L.r, L.c, L.i, L.shadows);
  return out;
}
function gatherOccluders(items, cx, cy) {
  const out = [];
  const add = (e, w, h) => { const p = onView(e.x - cx, e.y - cy); if (p) out.push({ x: p[0], y: p[1], w: w * p[2], h: h * p[2] }); };
  for (const it of items) {
    if (it.o) { const a = it.o.art; if (a?.shadow && !it.o.clip && it.o.kind !== "campfire") add(it.o, a.shadow * 0.75, Math.min(110, a.c.height * 0.7)); }
    else if (it.u) { if (!it.u.float && !it.u.ghost && !(it.u.hp <= 0 && it.u.team === "party")) add(it.u, it.u.small ? 4 : 5, it.u.small ? 20 : 28); }
    else if (it.c) add(it.c, 9, 14);
  }
  return out;
}

/** Sparks rising off the fires: worked out from the time alone, so they cost nothing to keep. */
function embers(cx, cy, t) {
  ctx.globalCompositeOperation = "lighter";
  for (const o of G.W.objects) {
    if (o.kind !== "campfire" || o.out || o.hidden) continue;
    if (o.x < cx - 60 || o.x > cx + G.vw + 60 || o.y < cy - 20 || o.y > cy + G.vh + 120) continue;
    for (let i = 0; i < 7; i++) {
      const p = (t * (0.32 + (i % 3) * 0.07) + i * 0.143) % 1;
      const gx = o.x + Math.sin(i * 2.7 + t * 1.3) * (3 + p * 9) + (i - 3), gy = o.y - 8 - p * 46;
      anchored(gx, gy + 14, () => {
        const a = (1 - p) * (p < 0.08 ? p / 0.08 : 1);
        ctx.fillStyle = o.goblin ? `rgba(170,255,140,${a})` : p < 0.4 ? `rgba(255,214,120,${a})` : `rgba(255,140,60,${a * 0.8})`;
        ctx.fillRect(Math.round(gx - cx), Math.round(gy - cy), 1, 1);
      });
    }
  }
  ctx.globalCompositeOperation = "source-over";
}
/** How much it is night outdoors (0 by day, 1 at night): fireflies come out, the pollen settles. */
function nightK() {
  if (!G.W.outdoor || G.W.amb) return 0;
  return clamp(-dayLight(G.clock).level / 2 + (G.clock > 17.5 || G.clock < 6.5 ? 0.25 : 0));
}
function drawCritters(cx, cy, ruinK) {
  const t = G.time, nk = nightK();
  ctx.save();
  embers(cx, cy, t);
  for (const c of G.W.critters) {
    const a = t * c.sp + c.ph;
    const gx = c.x + Math.sin(a) * c.r + Math.sin(a * 2.3) * 6, gy = c.y + Math.sin(a * 1.7) * c.r * 0.5 + Math.cos(a * 3.1) * 4;
    const x = Math.round(gx - cx), y = Math.round(gy - cy - 14);
    if (!PV.on && (x < -4 || y < -4 || x > G.vw + 4 || y > G.vh + 4)) continue;
    if (c.kind === "bf" && (G.f.escape || nk > 0.6)) continue;
    if (c.kind === "pol" && nk > 0.5) continue;
    anchored(gx, gy, () => {
      if (c.kind === "bf") {
        const open = Math.floor(t * 12 + c.ph) % 2 === 0;
        ctx.fillStyle = "rgba(10,20,10,0.25)"; ctx.fillRect(x, y + 12, 2, 1);
        ctx.fillStyle = c.c[0];
        if (open) { ctx.fillRect(x - 2, y - 1, 2, 2); ctx.fillRect(x + 1, y - 1, 2, 2); ctx.fillStyle = c.c[1]; ctx.fillRect(x - 2, y - 1, 1, 1); ctx.fillRect(x + 2, y - 1, 1, 1); }
        else { ctx.fillRect(x - 1, y - 2, 1, 2); ctx.fillRect(x + 1, y - 2, 1, 2); }
        ctx.fillStyle = "#1a1020"; ctx.fillRect(x, y - 1, 1, 2);
      } else if (c.kind === "pol" || c.kind === "dust") {
        // pollen in the sun, dust in the candlelight: a pale speck that drifts and catches the light now and then
        const b = (0.35 + 0.35 * Math.sin(t * 0.7 + c.ph * 5)) * (c.kind === "pol" ? 1 - nk : 1);
        if (b < 0.08) return;
        ctx.fillStyle = c.kind === "pol" ? `rgba(255,246,190,${b})` : `rgba(255,226,170,${b * 0.8})`;
        ctx.fillRect(x, y + Math.round(Math.sin(t * 0.3 + c.ph) * 6), 1, 1);
      } else {
        const mote = c.kind === "mote";
        // fireflies glow at dusk and at night (and in the ruins' smoke); by day only a faint one here and there
        const b = Math.max(0, Math.sin(t * (mote ? 0.9 : 2.2) + c.ph * 3)) * (mote ? 0.7 : (0.12 + nk * 0.88) * (0.35 + Math.max(ruinK, nk) * 0.65));
        if (b < 0.05) return;
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = mote ? `rgba(120,150,220,${b * 0.3})` : `rgba(120,160,40,${b * 0.35})`; ctx.fillRect(x - 1, y - 1, 3, 3);
        ctx.fillStyle = mote ? `rgba(220,235,255,${b})` : `rgba(230,255,150,${b})`; ctx.fillRect(x, y, 1, 1);
        ctx.globalCompositeOperation = "source-over";
      }
    });
  }
  ctx.restore();
}

// a frame meter for when the game feels slow: F3, or ?fps in the address
let meter = null, mAcc = 0, mN = 0, mWorst = 0, mU = 0, mD = 0;
function toggleMeter() {
  if (meter) { meter.remove(); meter = null; return; }
  meter = document.createElement("div");
  meter.style.cssText = "position:fixed;left:6px;top:64px;z-index:999;padding:3px 6px;background:rgba(10,8,16,.8);color:#f4ecdc;font:12px/1.3 monospace;white-space:pre;pointer-events:none";
  document.body.appendChild(meter);
}
addEventListener("keydown", (e) => { if (e.key === "F3") { e.preventDefault(); toggleMeter(); } });
if (new URLSearchParams(location.search).has("fps")) toggleMeter();

let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop); // schedule first: an error in one frame must not freeze the game
  tickUpdate();
  // on a 120/144/165 Hz screen, paint every second or third refresh: the art moves in whole pixels and gains nothing
  // from more, and the time goes back to the browser (music, input, the interface)
  if (now - last < 9.5) return;
  const dt = Math.min(0.05, (now - last) / 1000);
  if (meter) { mAcc += now - last; mN++; mWorst = Math.max(mWorst, now - last); }
  last = now;
  const a = performance.now();
  pollInput(now);
  UI.syncMode();
  if (!G.paused) update(dt);
  const b = performance.now();
  draw();
  if (thumbWaiters.length) takeThumbnail();
  G.perf = { update: b - a, draw: performance.now() - b };
  if (meter) {
    mU += G.perf.update; mD += G.perf.draw;
    if (mAcc >= 500) {
      meter.textContent = `${Math.round(1000 * mN / mAcc)} qps  pior ${mWorst.toFixed(0)} ms\nlógica ${(mU / mN).toFixed(1)}  desenho ${(mD / mN).toFixed(1)} ms\n${G.vw}×${G.vh} ×${G.scale}  luz ${lightOn() ? lightSettings.mode : lightAvailable() ? "off" : "sem WebGL2"}\n` + Object.entries(SEC).map(([k, v]) => `${k} ${(v / mN).toFixed(1)}`).join("  ");
      for (const k in SEC) SEC[k] = 0;
      mAcc = mN = mWorst = mU = mD = 0;
    }
  }
}

G.chestArt = [A.makeChest(false), A.makeChest(true)];
G.hooks.refreshJournal = refreshJournal;
// ---------------------------------------------------------------- the app (PWA): offline, and updates by itself (src/update.js)
initUpdates({
  // a moment the game can be saved and picked up again without anyone noticing: exploring, nothing open or going on
  safe: () => G.mode === "explore" && !G.paused && !G.camFocus && !saveBlock() && !journalOpen() && !savesOpen()
    && document.getElementById("hint").classList.contains("hidden"),
  // an automatic save, then the reload loads it: the player carries on from the same spot in the new version
  saveAndReload: (fail) => { if (!requestSave("auto", { quiet: true, onDone: (ok, id) => (ok && id ? loadSave(id) : fail()) })) fail(); },
});

window.G = G; // handy from the console
window.brumaSave = { collect, quickSave: () => quickSave(), saveBlock, fight: (name) => E.fight(G.groups[name]), audio: audioState, engine: E }; // and for the save tests
boot();
