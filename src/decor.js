// What makes a map look lived in without being part of the story (0.9.2): marks painted on the ground (pebbles,
// fallen leaves, flowers, puddles, moss between cobbles) and small standing things (candles, Velmoor braziers, pots,
// sacks, baskets, stumps, mushrooms).
//
// None of it is in W.objects: saves name objects by their place in that list ("<map>:o<n>"), so anything added there
// would move or add ids (tests/ids.test.mjs). This is W.decor instead: rebuilt the same way every time the map is
// built (seeded by the map's id), never saved, never talked to. A standing thing that blocks its tile only goes on a
// tile that is free (no one standing, nothing there, not a road) and is checked in tests/refino.test.mjs to leave
// every walkable area connected.
import { TILE, Rng } from "./util.js";
import { T } from "./world.js";

export const CANDLE_LIGHT = { r: 74, c: [1, 0.76, 0.42], h: 12, flicker: true, i: 0.85, shadows: false };
export const LUME_LIGHT = { r: 100, c: [0.6, 0.78, 1], h: 30, flicker: true, i: 1, shadows: true };

const seedOf = (s) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

/** Fill W.decor (standing things) and W.decals (ground marks) for this map. */
export function decorate(W) {
  const R = new Rng(seedOf(W.id) ^ 0x5eed), stand = [], decals = [];
  const taken = new Set();
  const key = (tx, ty) => ty * 1000 + tx;
  for (const e of [...W.objects, ...W.chests, ...W.npcs, ...W.enemies, ...Object.values(W.groups ?? {}).flat()]) taken.add(key(Math.floor(e.x / TILE), Math.floor((e.y - 1) / TILE)));
  const tile = (tx, ty) => W.tileAt(tx, ty);
  /** Free to stand a blocking thing on: walkable, nobody and nothing there, no road under or beside it. */
  const free = (tx, ty, road = true) => {
    if (W.blocked(tx, ty) || taken.has(key(tx, ty))) return false;
    const t = tile(tx, ty);
    if (t === T.WATER || t === T.DOCK || t === T.STAIRS || t === T.PATH) return false;
    if (road) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (tile(tx + dx, ty + dy) === T.PATH || tile(tx + dx, ty + dy) === T.STAIRS) return false;
    return !pinches(tx, ty);
  };
  const mine = new Set(); // tiles this decor already blocks
  const walk = (x, y) => !W.blocked(x, y) && !mine.has(key(x, y));
  /** Would blocking this tile cut its open neighbours apart? (They must still meet around it, within a few tiles.) */
  const pinches = (tx, ty) => {
    const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [tx + dx, ty + dy]).filter(([x, y]) => walk(x, y));
    if (nb.length < 2) return false;
    const seen = new Set([key(...nb[0])]), q = [nb[0]];
    while (q.length) {
      const [x, y] = q.pop();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (Math.abs(nx - tx) > 3 || Math.abs(ny - ty) > 3 || (nx === tx && ny === ty) || seen.has(key(nx, ny)) || !walk(nx, ny)) continue;
        seen.add(key(nx, ny)); q.push([nx, ny]);
      }
    }
    return nb.some(([x, y]) => !seen.has(key(x, y)));
  };
  const put = (kind, tx, ty, o = {}) => {
    if (o.block !== false && !free(tx, ty, o.road ?? true)) return null;
    const d = { kind, x: tx * TILE + 16 + (o.dx ?? 0), y: ty * TILE + (o.dy ?? 26), seed: o.seed ?? R.int(1, 999), ...(o.light ? { light: { ...o.light } } : {}) };
    if (o.block !== false) { d.block = [tx, ty]; taken.add(key(tx, ty)); mine.add(key(tx, ty)); }
    stand.push(d);
    return d;
  };
  /** A tiny thing that doesn't block (mushrooms): anywhere walkable or under a tree, not on a road. */
  const sprinkle = (kind, x, y) => {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE), t = tile(tx, ty);
    if (t !== T.GRASS || taken.has(key(tx, ty))) return;
    stand.push({ kind, x: Math.round(x), y: Math.round(y), seed: R.int(1, 999), small: true });
  };
  const mark = (kind, x, y) => decals.push({ kind, x: Math.round(x), y: Math.round(y), seed: R.int(1, 99999) });

  // ground marks, by what the ground is
  const outdoor = !!W.outdoor || W.id === "vale";
  if (outdoor) {
    const n = Math.round((W.w * W.h) / 3.2);
    for (let i = 0; i < n; i++) {
      const x = R.range(TILE, (W.w - 1) * TILE), y = R.range(TILE, (W.h - 1) * TILE), t = tile(Math.floor(x / TILE), Math.floor(y / TILE));
      if (t === T.GRASS) mark(R.pick(["flowers", "flowers", "pebbles", "twigs", "flowers", "pebbles"]), x, y);
      else if (t === T.PATH) mark(R.chance(W.id === "vau" ? 0.08 : 0.02) ? "puddle" : R.pick(["pebbles", "pebbles", "twigs", "leaves"]), x, y);
      else if (t === T.COBBLE) mark(R.chance(0.05) ? "puddle" : W.id === "vau" && R.chance(0.3) ? "straw" : "moss", x, y);
      else if (t === T.STONE) mark(R.pick(["moss", "moss", "pebbles"]), x, y);
    }
    // under the trees: fallen leaves, now and then a mushroom or two
    for (const o of W.objects) {
      if (o.kind !== "tree" && o.kind !== "pine" && o.kind !== "deadtree") continue;
      for (let k = 0, m = R.int(1, 3); k < m; k++) mark(o.kind === "pine" ? "twigs" : "leaves", o.x + R.range(-26, 26), o.y + R.range(-6, 14));
      if (R.chance(0.22)) sprinkle("mushrooms", o.x + R.range(-22, 22), o.y + R.range(6, 16));
    }
    // a few stumps where the woods are thick, away from the roads
    const stumps = { vale: 7, travessia: 5, bosque: 8 }[W.id] ?? 0;
    for (let i = 0, tries = 0; i < stumps && tries < 400; tries++) {
      const tx = R.int(2, W.w - 3), ty = R.int(2, W.h - 3);
      if (tile(tx, ty) !== T.GRASS) continue;
      let near = false;
      for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2], [1, 1], [-1, -1], [1, -1], [-1, 1]]) if (tile(tx + dx, ty + dy) === T.PATH) near = true;
      if (near || stand.some((d) => d.kind === "stump" && Math.abs(d.x - tx * TILE) < 6 * TILE && Math.abs(d.y - ty * TILE) < 6 * TILE)) continue;
      if (put("stump", tx, ty, { dy: 24 })) i++;
    }
  }

  // things that belong to a place: by the houses and stalls, and per map
  for (const o of W.objects) {
    const tx = Math.floor(o.x / TILE), ty = Math.floor((o.y - 1) / TILE);
    if (o.kind === "house") {
      // a pot of flowers by the front, on whichever side is free
      const w = o.w ?? 3, l = Math.floor(o.x / TILE) - 1, r = Math.floor(o.x / TILE) + w;
      put("pot", R.chance(0.5) ? l : r, ty + 1, { dy: 20 }) ?? put("pot", r, ty + 1, { dy: 20 });
    }
    if (o.kind === "stall") {
      put(R.chance(0.5) ? "sacks" : "basket", tx + (R.chance(0.5) ? -2 : 2), ty, { road: false }) ?? put("basket", tx, ty + 1, { road: false });
    }
  }
  const per = PLACES[W.id];
  if (per) per({ put, mark, R, W });
  W.decor = stand;
  W.decals = decals;
  return W;
}

// standing things put by hand, map by map (tiles from the layouts in maps*.js)
const PLACES = {
  vale(k) {
    // the camp: sacks by the supply crates, a basket of the day's catch by Maren's dock
    k.put("sacks", 9, 35); k.put("basket", 34, 24, { seed: 2 });
    // the goblins' ruins: offerings of candles at the old walls
    for (const [tx, ty] of [[12, 3], [28, 4], [10, 12]]) { const c = k.put("candles", tx, ty, { road: false }); if (c) { c.light = { ...CANDLE_LIGHT, c: [0.8, 1, 0.6] }; k.mark("wax", c.x, c.y + 2); } }
  },
  relicario(k) {
    // cold Lume braziers along the walls: the light of Velmoor, still burning for no one
    for (const [tx, ty] of [[3, 4], [19, 4], [3, 7], [19, 7], [6, 11], [16, 11], [6, 15], [16, 15], [6, 20], [16, 20], [6, 24], [16, 24]]) k.put("brazier", tx, ty, { road: false, light: LUME_LIGHT, dy: 28 });
  },
  claustro(k) {
    // candles: the orphans' night lights, the chapel by the altar, a pair in the kitchen
    for (const [tx, ty] of [[14, 10], [21, 10], [27, 9], [31, 9], [2, 12], [11, 9], [33, 12]]) { const c = k.put("candles", tx, ty, { road: false, light: CANDLE_LIGHT }); if (c) k.mark("wax", c.x + 6, c.y + 1); }
  },
  mosteiro(k) {
    // the garden: baskets of picked tea leaves, flowers along the beds
    for (const [tx, ty] of [[27, 15], [33, 21], [26, 22]]) k.put("basket", tx, ty, { road: false, seed: 1 });
    for (let i = 0; i < 40; i++) k.mark("flowers", k.R.range(25, 36) * TILE, k.R.range(13, 25) * TILE);
    // the kitchen door: sacks of flour; pots by the guesthouse
    k.put("sacks", 5, 9, { road: false }); k.put("pot", 9, 21, { road: false, dy: 20 }); k.put("pot", 11, 23, { road: false, dy: 20 });
  },
  vau(k) {
    // the dock and the market: the town lives by the river
    k.put("basket", 6, 20, { road: false, seed: 2 }); k.put("sacks", 15, 19, { road: false }); k.put("basket", 3, 19, { road: false, seed: 4 });
    for (let i = 0; i < 18; i++) k.mark("straw", k.R.range(14, 28) * TILE, k.R.range(10, 17) * TILE);
  },
  travessia(k) {
    // the ford: wet stones to step on
    for (let i = 0; i < 9; i++) k.mark("stones", k.R.range(27.6, 32.4) * TILE, k.R.range(13.5, 16.5) * TILE);
    // the shrine of Nhara: candles left by the ones who crossed
    const c = k.put("candles", 21, 8, { road: false, light: { ...CANDLE_LIGHT, r: 60 } }); if (c) k.mark("wax", c.x - 4, c.y + 2);
  },
  bosque(k) {
    // the woodcutter's yard
    k.put("stump", 19, 21, { road: false }); k.put("basket", 13, 23, { road: false, seed: 3 });
  },
};
