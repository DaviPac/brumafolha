// Is this a save this game can read? Checked before writing (a save that would not load is never written) and before
// loading (a damaged or foreign file is refused with a reason, never half-applied). And migrations: a save of an older
// format is brought up to date, step by step; one from a newer game is refused.
import { FORMAT } from "./game.js";

const MAPS = ["vale", "sonho", "relicario", "vau", "travessia"];
const MODES = ["explore", "dialogue", "combat"];

/** One function per old format, turning a save of format n into format n + 1. */
const MIGRATIONS = {
  // 1: () => ...   (none yet: format 1 is the first)
};

export function migrate(save) {
  if (!save || typeof save !== "object") throw new Error("o arquivo não é um save");
  let s = save;
  if (!Number.isInteger(s.formato)) throw new Error("save sem versão de formato");
  if (s.formato > FORMAT) throw new Error("este save é de uma versão mais nova do jogo");
  while (s.formato < FORMAT) {
    const step = MIGRATIONS[s.formato];
    if (!step) throw new Error(`não há como converter saves do formato ${s.formato}`);
    s = step(structuredClone(s));
    s.formato++;
  }
  return s;
}

const fail = (why) => { throw new Error(`save inválido (${why})`); };
const obj = (v) => v && typeof v === "object" && !Array.isArray(v);
const str = (v) => typeof v === "string" && v.length > 0;

export function validate(s) {
  if (!obj(s)) fail("não é um objeto");
  if (s.formato !== FORMAT) fail("formato");
  if (!str(s.campanha)) fail("campanha");
  if (!obj(s.build) || !str(s.build.race) || !str(s.build.cls)) fail("ficha do herói");
  if (!MAPS.includes(s.mapa)) fail(`mapa "${s.mapa}"`);
  if (!obj(s.maps) || !s.maps[s.mapa]) fail("mapas");
  for (const [id, m] of Object.entries(s.maps)) {
    if (!MAPS.includes(id)) fail(`mapa "${id}"`);
    if (!Array.isArray(m.enemies) || !Array.isArray(m.npcs) || !Array.isArray(m.objects) || !Array.isArray(m.block)) fail(`mapa ${id}`);
    for (const b of m.block) if (!Array.isArray(b) || !Number.isInteger(b[0]) || b[0] < 0) fail(`bloqueios de ${id}`);
  }
  if (!obj(s.units) || !obj(s.objects) || !obj(s.g)) fail("conteúdo");
  for (const [id, d] of Object.entries(s.units)) if (!obj(d) || !(obj(d.full) || obj(d.set))) fail(`unidade ${id}`);
  const party = s.g.party;
  if (!Array.isArray(party) || !party.length || !party.every((p) => p && str(p.$u))) fail("grupo");
  if (!obj(s.g.f)) fail("flags");
  if (!Array.isArray(s.g.items) || !Array.isArray(s.g.memories)) fail("bolsa");
  for (const k of ["gold", "potions", "clock"]) if (typeof s.g[k] !== "number" || !Number.isFinite(s.g[k])) fail(k);
  const mo = s.moment ?? { kind: "explore" };
  if (!MODES.includes(mo.kind)) fail("momento");
  if (mo.kind === "combat" && (!obj(mo.combat) || !Array.isArray(mo.combat.order) || !mo.combat.active)) fail("combate");
  if (mo.kind === "dialogue" && (!str(mo.npc) || !str(mo.node))) fail("conversa");
  // every unit the party, the fight and the maps name must be in the save or be made by a map
  return true;
}
