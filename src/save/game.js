// The game, as a save and back. collect() turns the running game into data; restore() puts that data back on a
// game that has just booted (a load always reloads the page first, see saves.js). Only what changed since each map
// was built is stored (codec.js), so a save is small, and anything the story changes on its own is caught.
import { G } from "../state.js";
import { TILE } from "../util.js";
import * as C from "./codec.js";
import { dialogueState, resumeDialogue } from "../dialogue.js";
import { combatState, resumeCombat } from "../combat.js";
import * as S from "../story.js";

export const FORMAT = 1;
import { VERSION as GAME_VERSION } from "../version.js";
export { GAME_VERSION }; // the saves record which version wrote them

let M = null; // main.js's internals: maps, recruit, unit, buildMap, placeMap, refreshArt, ...
export function initGame(engine) { M = engine; }

// what of G goes in a save (the rest is per-frame, per-screen, or rebuilt)
const G_KEYS = ["party", "followers", "leader", "hero", "mate", "potions", "gold", "f", "items", "memories", "approval", "clock", "clockTarget", "tint", "ambient",
  "musicOverride", "speedCap", "tutorial", "hintsSeen", "barks", "origin", "advNext", "followLeader", "campaign", "playTime"];

/** The running game as data. `moment` says what was going on: explore, a conversation, a fight. */
export function collect() {
  const maps = {};
  for (const [id, W] of Object.entries(M.maps())) {
    const block = [];
    for (let i = 0; i < W.block.length; i++) if (W.block[i] !== W.block0[i]) block.push([i, W.block[i]]);
    // things put on the map after it was built (the escape's campfires) get an id now
    for (const o of W.objects) if (!o.oid) C.ids.object(o, `${id}:o+${W.objects.indexOf(o)}:${Math.random().toString(36).slice(2, 6)}`);
    maps[id] = {
      builtFlags: W.builtFlags,
      enemies: W.enemies.map((u) => C.ids.unit(u)), npcs: W.npcs.map((u) => C.ids.unit(u)),
      objects: W.objects.map((o) => o.oid),
      block,
    };
  }
  const units = {}, objects = {}, groups = {};
  for (const [id, u] of C.allUnits()) { const d = C.diff(u); if (d) units[id] = d; }
  for (const [id, o] of C.allObjects()) { const d = C.diff(o); if (d) objects[id] = d; }
  for (const [id, g] of C.allGroups()) groups[id] = { ids: g.map((u) => C.ids.unit(u)), passive: !!g.passive };
  // wrapped, so that a unit held directly (G.hero, G.mate) is written as a reference, not copied
  const g = C.encode(Object.fromEntries(G_KEYS.map((k) => [k, G[k]])), "G");
  return {
    formato: FORMAT, jogo: GAME_VERSION,
    campanha: G.campaign, gravadoEm: new Date().toISOString(), tempoDeJogo: Math.round(G.playTime ?? 0),
    build: C.encode(G.build, "build"),
    mapa: G.W.id,
    dynSeq: C.ids.dynSeq,
    maps, units, objects, groups, g,
    story: S.saveState(),
    moment: moment(),
  };
}

function moment() {
  if (G.mode === "combat") return { kind: "combat", combat: combatState(C.encode) };
  if (G.mode === "dialogue") {
    const d = dialogueState();
    return { kind: "dialogue", npc: d.npc.uid, node: d.node, used: d.used };
  }
  return { kind: "explore" };
}

/** Put a save back on a freshly booted game. Throws if the save doesn't fit this game; the caller shows why. */
export function restore(save) {
  C.ids.dynSeq = save.dynSeq ?? 0;
  // 1. the hero, rebuilt from the creator's sheet (with the same id as before: "hero")
  M.recruit(C.decode(save.build));
  // 2. the maps: those built later in the story are built again with the flags they were built with
  for (const [id, m] of Object.entries(save.maps)) {
    if (M.maps()[id]) continue;
    const keep = { ...G.f };
    for (const k of Object.keys(G.f)) delete G.f[k];
    Object.assign(G.f, m.builtFlags ?? {});
    M.buildMap(id);
    for (const k of Object.keys(G.f)) delete G.f[k];
    Object.assign(G.f, keep);
  }
  // 3. units made after their map (allies, Sister Cendra...): made again, empty, so references can find them
  for (const [id, d] of Object.entries(save.units)) {
    if (C.unitById(id)) continue;
    if (!d.full) throw new Error(`unidade desconhecida: ${id}`);
    const spec = C.decode(d.full.spec ?? null);
    M.remakeUnit(id, spec, C.decode(d.full.build ?? null));
  }
  // ... and objects put on a map after it was built
  for (const [id, m] of Object.entries(save.maps)) {
    const W = M.maps()[id];
    for (const oid of m.objects) if (!C.objById(oid)) {
      const d = save.objects[oid];
      if (!d?.full) throw new Error(`objeto desconhecido: ${oid}`);
      const o = {};
      C.ids.object(o, oid);
      W.objects.push(o);
    }
  }
  // 4. groups (filled in place: the story holds them by identity)
  for (const [gid, g] of Object.entries(save.groups ?? {})) {
    let arr = C.groupById(gid);
    if (!arr) { arr = []; C.ids.group(gid, arr); }
    arr.length = 0;
    for (const id of g.ids) { const u = C.unitById(id); if (u) arr.push(u); }
    arr.passive = g.passive;
  }
  // 5. every change, on every unit and object
  for (const [id, d] of Object.entries(save.units)) C.apply(C.unitById(id), d);
  for (const [id, d] of Object.entries(save.objects)) { const o = C.objById(id); if (o) C.apply(o, d); }
  // 6. who stands on which map, in which order; what blocks what
  for (const [id, m] of Object.entries(save.maps)) {
    const W = M.maps()[id];
    W.enemies.splice(0, W.enemies.length, ...m.enemies.map(C.unitById).filter(Boolean));
    const residents = W.npcs.filter((u) => u.resident); // town.js: added after the save may have been written
    W.npcs.splice(0, W.npcs.length, ...m.npcs.map(C.unitById).filter(Boolean));
    for (const u of residents) if (!W.npcs.includes(u)) W.npcs.push(u);
    const byId = new Map(W.objects.map((o) => [o.oid, o]));
    W.objects.splice(0, W.objects.length, ...m.objects.map((oid) => byId.get(oid)).filter(Boolean));
    for (const [i, v] of m.block) W.block[i] = v;
  }
  // 7. the game's own numbers, flags, bag and memories
  const g = save.g;
  for (const k of G_KEYS) {
    if (!(k in g)) continue;
    const v = C.decode(g[k]);
    if (k === "f") { for (const x of Object.keys(G.f)) delete G.f[x]; Object.assign(G.f, v); }
    else if (k === "items" || k === "memories") G[k].splice(0, G[k].length, ...v);
    else if (k === "approval") { for (const x of Object.keys(G.approval)) delete G.approval[x]; Object.assign(G.approval, v); }
    else if (k === "hintsSeen") G.hintsSeen = v instanceof Set ? v : new Set();
    else if (k === "barks") G.barks = v instanceof Set ? v : new Set();
    else G[k] = v;
  }
  // Saves written before the codec kept undefined apart from null carry musicOverride: null, which the game reads as
  // "silence" and loaded games stayed mute. The story sets null only in the prologue's last cutscene, where saving is
  // not allowed, so a saved null is always that old mistake: back to "the place's own music".
  if (G.musicOverride === null) G.musicOverride = undefined;
  // 8. pictures, from the data (sprites, portraits, props)
  for (const id of Object.keys(save.units)) M.refreshUnitArt(C.unitById(id));
  for (const id of Object.keys(save.objects)) { const o = C.objById(id); if (o) M.refreshObject(o); }
  S.loadState(save.story);
  // 9. the map on screen, without moving anyone
  M.showMap(save.mapa);
  checkInvariants();
  // 10. what was going on
  const mo = save.moment ?? { kind: "explore" };
  M.afterLoad();
  if (mo.kind === "combat") { resumeCombat(C.decode(mo.combat)); return; }
  G.mode = "explore";
  if (mo.kind === "dialogue") {
    const npc = C.unitById(mo.npc), tree = npc?.talk?.();
    if (!npc || !resumeDialogue(npc, tree, mo.node, mo.used)) console.warn("[save] a conversa salva não pôde ser reaberta");
  }
}

/** A loaded game that breaks a rule is mended, not trusted: the party exists, its leader stands, nobody is in a wall. */
function checkInvariants() {
  G.party = G.party.filter(Boolean);
  if (!G.party.length) throw new Error("o grupo está vazio");
  G.hero ??= G.party[0];
  if (!(G.leader >= 0 && G.leader < G.party.length) || G.party[G.leader].hp <= 0 || G.party[G.leader].ai) {
    G.leader = Math.max(0, G.party.findIndex((p) => p.hp > 0 && !p.ai));
  }
  for (const u of [...G.party, ...G.followers]) {
    if (!Number.isFinite(u.x) || !Number.isFinite(u.y)) throw new Error(`posição inválida: ${u.name}`);
    const tx = Math.floor(u.x / TILE), ty = Math.floor((u.y - 1) / TILE);
    if (tx < 0 || ty < 0 || tx >= G.W.w || ty >= G.W.h || (G.W.blocked(tx, ty) && G.mode !== "combat")) {
      console.warn(`[save] ${u.name} estava fora do chão; foi posto no lugar livre mais perto`);
      M.unstick(u);
    }
    u.path = [];
  }
}
