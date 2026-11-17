// What a save is made of: every unit and every map object gets a stable id, and a snapshot of how it looked right
// after its map was built (its baseline). A save stores, for each one, only the fields that differ from that baseline,
// so whatever the story changes on an object (a fire put out, a statue lit, a goblin gone) is caught without a list
// of fields to keep up to date. Things the story makes later (allies arriving mid-fight, the escape's campfires) have
// no baseline and are stored whole.
//
// Values go through encode(): plain data stays as it is; a unit or object becomes a reference by id; a function
// becomes a name (see nameFn); canvases and other live objects are left out (they are rebuilt from data on load).

const units = new Map(); // uid -> unit
const objs = new Map(); // oid -> map object
const groups = new Map(); // gid -> array of units (a combat group, compared by identity in the story)
const baselines = new WeakMap(); // entity -> { key: JSON of the encoded value }
const fnName = new Map(), fnByName = new Map();
const warned = new Set();

/** Fields of a unit that are never saved: the art (rebuilt from the spec), animation state, callbacks of the moment. */
const SKIP = new Set(["ch", "portrait", "onArrive", "_sx", "_sy", "_stepAcc", "animT", "flashT", "lunge", "knock", "alert", "art", "fxe", "pose", "poseT"]);

let dynSeq = 0;
export const ids = {
  /** A unit was made: where (a map being built, the companions, the hero) decides its id. */
  unit(u, scope) {
    if (u.uid) { if (!units.has(u.uid)) units.set(u.uid, u); return u.uid; }
    u.uid = typeof scope === "string" ? scope : scope ? scope.next() : `dyn:${++dynSeq}`;
    units.set(u.uid, u);
    return u.uid;
  },
  object(o, oid) { o.oid = oid; objs.set(oid, o); },
  group(gid, arr) { groups.set(gid, arr); arr.gid = gid; },
  scope(prefix) { let n = 0; return { next: () => `${prefix}:${n++}` }; },
  get dynSeq() { return dynSeq; },
  set dynSeq(v) { dynSeq = Math.max(dynSeq, v); },
};
export const unitById = (id) => units.get(id);
export const objById = (id) => objs.get(id);
export const groupById = (id) => groups.get(id);
export const allUnits = () => units;
export const allObjects = () => objs;
export const allGroups = () => groups;

/** Give a function a name, so a save can point at it (an NPC's conversation, a chest's reaction). */
export function nameFn(name, fn) {
  if (typeof fn !== "function") return fn;
  if (!fnName.has(fn)) fnName.set(fn, name);
  fnByName.set(name, fn);
  return fn;
}

const isPlain = (v) => { const p = Object.getPrototypeOf(v); return p === Object.prototype || p === null; };
const SKIPPED = Symbol("skipped");

function warnOnce(msg) { if (!warned.has(msg)) { warned.add(msg); console.warn("[save] " + msg); } }

/** Turn a value into JSON-safe data. `path` names functions met inside a baseline. */
export function encode(v, path = "?", naming = false, seen = new Set(), entity = false) {
  if (v === null || v === undefined) return v ?? null;
  const t = typeof v;
  if (t === "number") return Number.isFinite(v) ? v : null;
  if (t === "string" || t === "boolean") return v;
  if (t === "function") {
    if (naming && !fnName.has(v)) nameFn(path, v);
    const n = fnName.get(v);
    if (n) return { $fn: n };
    warnOnce(`função sem nome em ${path}: fica fora do save`);
    return SKIPPED;
  }
  if (t !== "object") return SKIPPED;
  if (v.uid && units.get(v.uid) === v && seen.size) return { $u: v.uid };
  if (v.oid && objs.get(v.oid) === v && seen.size) return { $o: v.oid };
  if (Array.isArray(v) && v.gid && groups.get(v.gid) === v && seen.size) return { $g: v.gid };
  if (seen.has(v)) { warnOnce(`ciclo em ${path}`); return SKIPPED; }
  if (v instanceof Set) return { $set: [...v].map((x) => encode(x, path, naming, seen)).filter((x) => x !== SKIPPED) };
  if (Array.isArray(v)) {
    seen.add(v);
    const out = v.map((x, i) => { const e = encode(x, `${path}[${i}]`, naming, seen); return e === SKIPPED ? null : e; });
    seen.delete(v);
    return out;
  }
  if (!isPlain(v)) return SKIPPED; // canvases, images, DOM, effects: rebuilt, never saved
  seen.add(v);
  const out = {};
  for (const k of Object.keys(v)) {
    if (entity && seen.size === 1 && SKIP.has(k)) continue;
    const e = encode(v[k], `${path}.${k}`, naming, seen);
    if (e !== SKIPPED) out[k] = e;
  }
  seen.delete(v);
  return out;
}

/** Back from data: references to the live units, objects, groups and functions of this boot. */
export function decode(v) {
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map(decode);
  if ("$u" in v) return units.get(v.$u) ?? null;
  if ("$o" in v) return objs.get(v.$o) ?? null;
  if ("$g" in v) return groups.get(v.$g) ?? [];
  if ("$fn" in v) { const f = fnByName.get(v.$fn); if (!f) warnOnce(`função "${v.$fn}" não existe nesta versão`); return f ?? null; }
  if ("$set" in v) return new Set(v.$set.map(decode));
  const out = {};
  for (const k of Object.keys(v)) out[k] = decode(v[k]);
  return out;
}

/** An entity's fields as data, one JSON string per field (what the diff compares). */
function fields(e, id, naming) {
  const enc = encode(e, id, naming, new Set(), true);
  const out = {};
  for (const k of Object.keys(enc)) out[k] = JSON.stringify(enc[k]);
  return out;
}
/** Remember how an entity looks now: later saves store only what changed since. Names its functions. */
export function baseline(e) { baselines.set(e, fields(e, e.uid ?? e.oid, true)); }
export const hasBaseline = (e) => baselines.has(e);

/** What changed on an entity since its baseline: { set: {k: data}, del: [k] }, or null if nothing did. */
export function diff(e) {
  const base = baselines.get(e), now = fields(e, e.uid ?? e.oid, false);
  if (!base) return { full: Object.fromEntries(Object.entries(now).map(([k, s]) => [k, JSON.parse(s)])) };
  const set = {}, del = [];
  for (const k of Object.keys(now)) if (now[k] !== base[k]) set[k] = JSON.parse(now[k]);
  for (const k of Object.keys(base)) if (!(k in now)) del.push(k);
  return Object.keys(set).length || del.length ? { set, ...(del.length ? { del } : {}) } : null;
}
/** Put saved changes back on an entity. */
export function apply(e, d) {
  if (!d) return;
  const set = d.full ?? d.set ?? {};
  for (const k of Object.keys(set)) e[k] = decode(set[k]);
  for (const k of d.del ?? []) delete e[k];
}
