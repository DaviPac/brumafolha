// Act I, chapter two: three new maps, on the same 80-wide grid as the others.
//   bosque    the woods south of the Cardo, the way Odara said to take (48×28)
//   mosteiro  the Monastery of the Serene Veil, from outside: walls, courtyard, garden, chapel, guest house (40×30)
//   claustro  inside: kitchen, the orphans' dormitory, the chapel, and the wing that is not shown to visitors (36×19)
// The chapter-1 maps are not touched: a save points at things by their place in each map's lists, so content for this
// chapter lives here, on maps of its own.
import { TILE, hash2, Rng } from "./util.js";
import { MW, T } from "./world.js";
import { openWorld } from "./maps1.js";
import { gridWorld } from "./maps.js";
import { IRAMP } from "./art/interiors.js";

const at = (tx, ty, dy = 26) => ({ x: tx * TILE + 16, y: ty * TILE + dy });
const LAMP = { r: 120, c: [1, 0.78, 0.42], h: 40, flicker: true };
const CANDLE = { r: 70, c: [1, 0.8, 0.5], h: 18, flicker: true, i: 0.8, shadows: false };

/** Trees, bushes and rocks wherever the map left room. */
function woods(W, seed, density = 0.45) {
  const R = new Rng(seed);
  for (let y = 0; y < W.h; y++) for (let x = 0; x < W.w; x++) {
    if (!W.free(x, y)) continue;
    const edge = Math.min(x, y, W.w - 1 - x, W.h - 1 - y), n = hash2(x >> 1, y >> 1, seed);
    if ((edge <= 1 && R.chance(0.75)) || (n > 1 - density && R.chance(0.45))) {
      const kind = y < 7 && R.chance(0.6) ? "pine" : R.chance(0.12) ? "deadtree" : "tree";
      W.put({ kind, x: x * TILE + 16 + R.range(-6, 6), y: y * TILE + 26, seed: R.int(1, 1e6) }, [[x, y]]);
      W.keep(x - 1, y - 1, x + 1, y);
    }
  }
  for (let i = 0; i < W.w * W.h * 0.1; i++) {
    const tx = R.int(1, W.w - 2), ty = R.int(1, W.h - 2), x = tx * TILE + R.range(4, 28), y = ty * TILE + R.range(8, 30);
    if (!W.free(tx, ty)) continue;
    const r = R.next();
    if (r < 0.15) W.put({ kind: "rock", x, y, seed: i }, [[tx, ty]]); else if (r < 0.5) W.put({ kind: "bush", x, y, seed: i }); else W.put({ kind: "fern", x, y, seed: i });
  }
}

// ---------------------------------------------------------------- the woods south of the Cardo
export const BOSQ = { west: [1, 14], east: [46, 18], hut: [16, 22], abel: [17, 23], moths: [29, 11], pilgrim: [29, 11], lantern: [30, 12], camp: [39, 21] };
const roadY = (x) => Math.round(14 + (x / 47) * 4 + Math.sin(x / 5.5) * 1.2);
export function buildBosque() {
  const W = openWorld("bosque", 48, 28);
  W.zone = "Sul do Bosque"; W.seed = 19; W.music = "meadow";
  W.zoneAt = (x, y) => { const tx = x / TILE, ty = y / TILE; return Math.hypot(tx - 16, ty - 22) < 6 ? "Cabana do lenhador" : Math.hypot(tx - 29, ty - 11) < 6 ? "Clareira das mariposas" : Math.hypot(tx - 39, ty - 21) < 5 ? "Clareira dos lenhadores" : ty < 5 ? "A borda da Bruma" : "Sul do Bosque"; };
  // the trail: a footpath, not a road
  for (let x = 0; x < 48; x++) { const y = roadY(x); W.fill(x, y, x, y, T.PATH); if (x % 3) W.fill(x, y + 1, x, y + 1, T.PATH); W.keep(x, y - 1, x, y + 2); }
  for (let y = roadY(16); y <= 22; y++) W.fill(16, y, 16, y, T.PATH);
  for (let y = 12; y <= roadY(29); y++) W.fill(29, y, 29, y, T.PATH);
  for (let y = roadY(39); y <= 20; y++) W.fill(39, y, 39, y, T.PATH);
  W.keep(12, 18, 21, 25); W.keep(24, 7, 34, 14); W.keep(35, 18, 43, 24); W.keep(45, 15, 47, 21);
  // the woodcutter's hut, his woodpile and his chopping block
  W.put({ kind: "house", x: 14 * TILE, y: 21 * TILE + 31, w: 3, seed: 1401, opts: { roof: "thatch", door: 0.6, lit: true } }, [[14, 21], [15, 21], [16, 21], [14, 20], [15, 20], [16, 20]]).light = { r: 90, c: [1, 0.8, 0.45], h: 14, dx: 48, i: 0.7, shadows: false };
  W.put({ kind: "log", x: 18 * TILE, y: 22 * TILE + 14 }, [[18, 22]]);
  W.put({ kind: "log", x: 18 * TILE + 6, y: 22 * TILE + 4 });
  W.put({ kind: "crate", ...at(13, 22) }, [[13, 22]]);
  // the Order's ribbons along the trail
  W.put({ kind: "ribbons", ...at(6, roadY(6) - 1), seed: 3, id: "ribbons" }, [[6, roadY(6) - 1]]);
  W.put({ kind: "ribbons", ...at(22, roadY(22) - 1), seed: 9 }, [[22, roadY(22) - 1]]);
  W.put({ kind: "ribbons", ...at(41, roadY(41) - 1), seed: 14 }, [[41, roadY(41) - 1]]);
  // the moths' clearing: a pilgrim sat down here with her lantern and did not get up
  W.put({ kind: "lantern", ...at(...BOSQ.lantern, 24), id: "plantern", light: { r: 80, c: [0.7, 0.85, 1], h: 8, i: 0.9, flicker: true, shadows: false } });
  W.put({ kind: "satchel", ...at(31, 10, 22), id: "pbag" });
  // the woodcutters' clearing: a cold fire ring that can be lit, logs to sit on
  W.put({ kind: "campfire", x: BOSQ.camp[0] * TILE + 16, y: BOSQ.camp[1] * TILE + 22, id: "bfire" }, [BOSQ.camp]);
  W.put({ kind: "log", x: 37 * TILE + 8, y: 22 * TILE + 10 });
  W.put({ kind: "log", x: 40 * TILE + 4, y: 20 * TILE + 8 });
  woods(W, 47, 0.5);
  W.sow(2200, 61);
  return W;
}

// ---------------------------------------------------------------- the Monastery, outside
export const MOST = { gate: [1, 15], clara: [4, 14], front: [13, 10], kitchen: [5, 7], chapel: [26, 10], guest: [5, 23], north: [20, 3], madre: [31, 20], tadeu: [25, 24] };
export function buildMosteiro() {
  const W = openWorld("mosteiro", 40, 30);
  W.zone = "Mosteiro do Véu Sereno"; W.seed = 23; W.music = "meadow";
  W.zoneAt = (x, y) => { const tx = x / TILE, ty = y / TILE; return tx < 2.5 ? "Portão do Mosteiro" : tx > 23 && ty > 12 ? "Jardim do Véu" : ty < 8 ? "Pátio dos fundos" : tx < 9 && ty > 19 ? "Hospedaria" : "Pátio do Mosteiro"; };
  // ground: the courtyard paved, paths to every door, the back yard, the way out north
  W.fill(4, 11, 22, 19, T.COBBLE);
  W.fill(0, 14, 4, 15, T.PATH); W.fill(4, 4, 7, 10, T.PATH); W.fill(8, 5, 35, 6, T.PATH); W.fill(19, 3, 20, 6, T.PATH);
  W.fill(23, 10, 28, 12, T.COBBLE); W.fill(23, 13, 24, 25, T.PATH); W.fill(24, 25, 34, 25, T.PATH); W.fill(5, 20, 8, 23, T.PATH);
  W.keep(2, 3, 37, 26);
  // the wall: whitewashed stone, a gate west (the way in) and the iron gate north (the way the processions go)
  const wall = (tx, ty) => W.put({ kind: "awall", x: tx * TILE, y: ty * TILE + 31, seed: (tx * 7 + ty * 13) % 97 }, [[tx, ty]]);
  for (let x = 2; x <= 37; x++) { if (x !== 19 && x !== 20) wall(x, 3); wall(x, 26); }
  for (let y = 4; y <= 25; y++) { if (y !== 14 && y !== 15) wall(2, y); wall(37, y); }
  W.put({ kind: "mgate", x: 20 * TILE, y: 3 * TILE + 30, id: "ngate" }, [[19, 3], [20, 3]]);
  W.put({ kind: "veilbanner", ...at(3, 13, 30) }, [[3, 13]]);
  W.put({ kind: "veilbanner", ...at(3, 16, 30) }, [[3, 16]]);
  // the buildings: the cloister house (front door), the kitchen at the back, the chapel and its bell tower, the guest house
  const house = (tx, row, w, opts) => {
    const blocks = []; for (let x = tx; x < tx + w; x++) blocks.push([x, row], [x, row - 1]);
    const o = W.put({ kind: "house", x: tx * TILE, y: row * TILE + 31, w, seed: tx * 31 + row, opts }, blocks);
    if (opts.lit) o.light = { r: 100, c: [1, 0.8, 0.45], h: 14, dx: (w * TILE) / 2, i: 0.8, shadows: false };
    return o;
  };
  house(9, 9, 9, { tall: true, roof: "slate", door: 0.5, lit: true, white: true }).id = "cloister";
  house(4, 6, 3, { roof: "slate", door: 0.5, lit: true, white: true }).id = "kitchen";
  house(23, 9, 6, { tall: true, roof: "slate", door: 0.55, white: true }).id = "chapel";
  W.put({ kind: "belltower", x: 30 * TILE + 16, y: 9 * TILE + 30 }, [[29, 9], [30, 9], [31, 9], [29, 8], [30, 8], [31, 8]]);
  house(4, 22, 4, { roof: "thatch", door: 0.35, lit: true, white: true }).id = "guest";
  // the courtyard: a well, benches, lamps, the Order's banners
  W.put({ kind: "well", ...at(16, 15) }, [[16, 15]]);
  W.put({ kind: "bench", ...at(10, 18) }, [[10, 18]]);
  W.put({ kind: "bench", ...at(20, 18) }, [[20, 18]]);
  W.put({ kind: "veilbanner", ...at(8, 11, 30) }, [[8, 11]]);
  W.put({ kind: "veilbanner", ...at(19, 11, 30) }, [[19, 11]]);
  for (const [tx, ty] of [[4, 11], [22, 11], [4, 19], [22, 19], [23, 13], [8, 7], [33, 24], [6, 21]]) W.put({ kind: "lamp", ...at(tx, ty), light: { ...LAMP } }, [[tx, ty]]);
  // the garden: the pale tea, the lavender, benches between them
  for (const [tx, ty] of [[26, 15], [26, 18], [26, 21]]) W.put({ kind: "herbbed", x: (tx + 1) * TILE, y: ty * TILE + 30, seed: tx * 5 + ty, mist: true }, [[tx, ty], [tx + 1, ty]]);
  for (const [tx, ty] of [[31, 15], [31, 18]]) W.put({ kind: "herbbed", x: (tx + 1) * TILE, y: ty * TILE + 30, seed: tx * 5 + ty, mist: false }, [[tx, ty], [tx + 1, ty]]);
  W.put({ kind: "bench", ...at(34, 21) }, [[34, 21]]);
  W.put({ kind: "bench", ...at(29, 23) }, [[29, 23]]);
  for (const [tx, ty] of [[35, 13], [35, 17], [33, 12], [36, 24], [27, 13]]) W.put({ kind: "tree", ...at(tx, ty), seed: tx * 97 + ty }, [[tx, ty]]);
  for (const [tx, ty] of [[30, 13], [34, 15], [28, 24], [36, 20], [11, 21], [18, 21], [14, 23]]) W.put({ kind: "bush", ...at(tx, ty), seed: tx * 9 + ty });
  // the back yard: crates, barrels and the woodpile by the kitchen
  W.put({ kind: "barrel", ...at(7, 5, 22) }, [[7, 5]]); W.put({ kind: "crate", ...at(8, 4) }, [[8, 4]]);
  W.put({ kind: "log", x: 10 * TILE, y: 4 * TILE + 12 });
  // outside the walls: the woods, and the Bruma to the north
  W.keep(0, 13, 4, 16);
  const R = new Rng(29);
  for (let y = 0; y < 30; y++) for (const x of [0, 1, 38, 39]) if (W.free(x, y) && R.chance(0.8)) W.put({ kind: R.chance(0.35) ? "pine" : "tree", x: x * TILE + 16 + R.range(-5, 5), y: y * TILE + 26, seed: R.int(1, 1e6) }, [[x, y]]);
  for (let x = 2; x < 38; x++) for (const y of [0, 1, 2, 27, 28, 29]) if (W.free(x, y) && !(y < 3 && x > 17 && x < 22) && R.chance(0.6)) W.put({ kind: y < 3 ? "pine" : "tree", x: x * TILE + 16 + R.range(-5, 5), y: y * TILE + 26, seed: R.int(1, 1e6) }, [[x, y]]);
  W.keep(0, 0, 39, 29);
  const G = new Rng(13);
  for (let i = 0; i < 700; i++) { const x = G.range(3 * TILE, 37 * TILE), y = G.range(4 * TILE, 26 * TILE); if (W.tileAt((x / TILE) | 0, (y / TILE) | 0) === T.GRASS && !W.blocked((x / TILE) | 0, (y / TILE) | 0)) W.grass.push({ x, y, v: G.int(0, 5), ph: G.range(0, 6.28) }); }
  return W;
}

// ---------------------------------------------------------------- the cloister, inside
// rooms: [x0, y0, x1, y1]; doors: walkable gaps in the walls between them; exits: stairs out to the courtyard
export const CLAU = {
  cell: [2, 1, 8, 3], register: [11, 1, 18, 3], sabia: [21, 1, 27, 3], tea: [30, 1, 33, 3], wing: [2, 5, 33, 6],
  kitchen: [2, 8, 11, 13], dorm: [14, 8, 21, 13], chapel: [24, 8, 33, 13], hall: [2, 15, 33, 16],
  doors: [[5, 4], [14, 4], [24, 4], [31, 4], [6, 14], [17, 14], [28, 14]],
  hidden: [26, 7], bars: [5, 4],
  exits: { kitchen: [1, 10], front: [17, 17], chapel: [34, 10] },
};
export function buildClaustro() {
  const w = 36, h = 19, rows = [];
  for (let y = 0; y < h; y++) rows.push(Array(w).fill("."));
  const carve = ([x0, y0, x1, y1], c = "B") => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) rows[y][x] = c; };
  for (const k of ["cell", "register", "sabia", "tea", "wing", "kitchen", "dorm", "chapel", "hall"]) carve(CLAU[k]);
  for (const [x, y] of CLAU.doors) rows[y][x] = "B";
  rows[CLAU.hidden[1]][CLAU.hidden[0]] = "H";
  for (const [x, y] of Object.values(CLAU.exits)) rows[y][x] = "E";
  const W = gridWorld("claustro", rows.map((r) => r.join("")), {
    ".": { t: T.WALL }, B: { t: T.MARBLE, walk: true }, H: { t: T.WALL }, E: { t: T.STAIRS, walk: true },
  });
  W.zone = "Claustro do Véu";
  W.zoneAt = (x, y) => {
    const tx = x / TILE, ty = y / TILE, inR = (r) => tx >= r[0] && tx < r[2] + 1 && ty >= r[1] && ty < r[3] + 1;
    return ty < 7 ? "Ala do Silêncio" : inR(CLAU.kitchen) ? "Cozinha" : inR(CLAU.dorm) ? "Dormitório dos órfãos" : inR(CLAU.chapel) ? "Capela do Véu" : "Claustro do Véu";
  };
  W.amb = { level: -1, tint: [1.12, 0.98, 0.84], tintK: 0.45, gain: 1 }; // candlelight, whitewash, no sky
  W.floorRamp = IRAMP.warm;
  const put = (o, blocks = []) => { W.objects.push(o); for (const [bx, by] of blocks) W.setBlock(bx, by, true); return o; };
  // the kitchen: the hearth, the kettle of tea that keeps the house calm, tables
  put({ kind: "hearth", ...at(6, 8, 28), id: "hearth", light: { r: 130, c: [1, 0.66, 0.34], h: 10, flicker: true } }, [[5, 8], [6, 8], [7, 8]]);
  put({ kind: "table", ...at(4, 11), seed: 4 }, [[4, 11]]);
  put({ kind: "table", ...at(9, 11), seed: 5 }, [[9, 11]]);
  put({ kind: "barrel", ...at(10, 8, 22) }, [[10, 8]]); put({ kind: "crate", ...at(2, 8) }, [[2, 8]]);
  put({ kind: "teapot", ...at(9, 11, 18) });
  // the dormitory: rows of cots, some with someone in them
  [[15, 9, 1], [17, 9, 0], [19, 9, 2], [21, 9, 0], [15, 12, 3], [17, 12, 0], [19, 12, 5], [21, 12, 0]].forEach(([tx, ty, who], i) => put({ kind: "cot", ...at(tx, ty, 28), who, id: `cot${i}` }, [[tx, ty]]));
  // the chapel: the altar under the great veil, benches, candles; behind the veil, a door that is not there
  put({ kind: "altar", x: 29 * TILE + 16, y: 9 * TILE + 30, id: "altar" }, [[28, 9], [29, 9], [30, 9]]);
  for (const [tx, ty] of [[26, 11], [31, 11], [26, 12], [31, 12]]) put({ kind: "bench", ...at(tx, ty) }, [[tx, ty]]);
  for (const [tx, ty] of [[25, 8], [33, 8]]) put({ kind: "lantern", ...at(tx, ty, 22), light: { ...CANDLE } });
  put({ kind: "veilbanner", x: 26 * TILE + 12, y: 8 * TILE + 30, id: "curtain" });
  put({ kind: "doorway", x: CLAU.hidden[0] * TILE, y: CLAU.hidden[1] * TILE + 31, id: "hdoor", hidden: true });
  // the hall: pillars, candles
  for (const tx of [4, 9, 13, 21, 25, 31]) put({ kind: "rpillar", x: tx * TILE + 16, y: 15 * TILE + 28, h: 3, seed: 600 + tx }, [[tx, 15]]);
  for (const tx of [7, 19, 29]) put({ kind: "lantern", ...at(tx, 16, 22), light: { ...CANDLE } });
  // the wing that is not shown: the cell, the book of names, the old man's room, the tea room
  put({ kind: "bars", x: CLAU.bars[0] * TILE, y: CLAU.bars[1] * TILE + 31, id: "bars" }, [CLAU.bars]);
  put({ kind: "cot", ...at(3, 2, 30), who: 0 }, [[3, 2]]);
  put({ kind: "lectern", ...at(15, 2, 28), id: "lectern" }, [[15, 2]]);
  put({ kind: "crate", ...at(12, 1) }, [[12, 1]]); put({ kind: "crate", ...at(17, 1) }, [[17, 1]]);
  put({ kind: "cot", ...at(26, 2, 30), who: 0 }, [[26, 2]]);
  put({ kind: "table", ...at(31, 2), seed: 7 }, [[31, 2]]);
  put({ kind: "teapot", ...at(31, 2, 18) });
  for (const [tx, ty] of [[9, 5], [20, 5], [29, 5], [14, 1], [23, 1]]) put({ kind: "lantern", ...at(tx, ty, 22), light: { ...CANDLE } });
  return W;
}
