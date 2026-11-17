// Act I's two maps, laid out in code on the same 80-wide grid as the valley:
// Vau-de-Cardo (a palisaded frontier town on the river, 44×30) and the Travessia do Cardo (the road east to the
// ford, 50×30). Everything outside the area is solid.
import { TILE, hash2, Rng } from "./util.js";
import { MW, MH, T } from "./world.js";

export function openWorld(id, w, h) {
  const tiles = new Uint8Array(MW * MH).fill(T.WALL), block = new Uint8Array(MW * MH).fill(1), reserve = new Uint8Array(MW * MH);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { tiles[y * MW + x] = T.GRASS; block[y * MW + x] = 0; }
  const W = { id, w, h, tiles, block, objects: [], grass: [], outdoor: true };
  W.tileAt = (tx, ty) => (tx < 0 || ty < 0 || tx >= w || ty >= h ? -1 : tiles[ty * MW + tx]);
  W.blocked = (tx, ty) => tx < 0 || ty < 0 || tx >= w || ty >= h || block[ty * MW + tx] === 1;
  W.setBlock = (tx, ty, b) => { block[ty * MW + tx] = b ? 1 : 0; };
  W.fill = (x0, y0, x1, y1, t) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (x >= 0 && y >= 0 && x < w && y < h) { tiles[y * MW + x] = t; block[y * MW + x] = t === T.WATER ? 1 : 0; } };
  W.keep = (x0, y0, x1, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (x >= 0 && y >= 0 && x < w && y < h) reserve[y * MW + x] = 1; };
  W.free = (tx, ty) => W.tileAt(tx, ty) === T.GRASS && !reserve[ty * MW + tx] && !block[ty * MW + tx];
  /** Add a prop; `blocks` are the tiles it stands on. */
  W.put = (o, blocks = []) => { W.objects.push(o); for (const [bx, by] of blocks) if (bx >= 0 && by >= 0 && bx < w && by < h) { block[by * MW + bx] = 1; reserve[by * MW + bx] = 1; } return o; };
  /** Tall grass that sways, wherever there is grass left. */
  W.sow = (n, seed) => { const R = new Rng(seed); for (let i = 0; i < n; i++) { const x = R.range(TILE, (w - 1) * TILE), y = R.range(TILE, (h - 1) * TILE); if (W.tileAt((x / TILE) | 0, (y / TILE) | 0) === T.GRASS && !reserve[((y / TILE) | 0) * MW + ((x / TILE) | 0)] && R.chance(0.7)) W.grass.push({ x, y, v: R.int(0, 5), ph: R.range(0, 6.28) }); } };
  return W;
}
const at = (tx, ty, dy = 26) => ({ x: tx * TILE + 16, y: ty * TILE + dy });
const LAMP = { r: 120, c: [1, 0.78, 0.42], h: 40, flicker: true };

// ---------------------------------------------------------------- Vau-de-Cardo
export const VAU = { dock: [10, 23], gate: [41, 12], tavern: [11, 6], board: [37, 11], strongbox: [35, 5], fire: [9, 19], well: [21, 14] };
export function buildVau() {
  const W = openWorld("vau", 44, 30);
  W.zone = "Vau-de-Cardo"; W.seed = 11; W.music = "meadow";
  W.zoneAt = (x, y) => { const tx = x / TILE, ty = y / TILE; return ty > 21 ? "Cais do Cardo" : tx < 18 && ty < 9 ? "Taverna do Sabiá Cego" : tx > 26 && ty < 9 ? "Guarnição da Coroa" : tx < 16 && ty > 16 ? "Acampamento dos refugiados" : tx > 13 && tx < 28 && ty > 8 && ty < 18 ? "Mercado dos refugiados" : "Vau-de-Cardo"; };
  // ground
  W.fill(0, 24, 43, 29, T.WATER);
  W.fill(8, 22, 13, 24, T.DOCK); W.fill(10, 25, 11, 26, T.DOCK);
  W.fill(14, 9, 27, 17, T.COBBLE); W.fill(27, 5, 36, 8, T.COBBLE); W.fill(28, 12, 43, 13, T.COBBLE); W.fill(31, 9, 32, 11, T.COBBLE);
  W.fill(9, 5, 17, 8, T.PATH); W.fill(10, 9, 11, 21, T.PATH); W.fill(12, 12, 13, 13, T.PATH); W.fill(4, 17, 15, 20, T.PATH); W.fill(14, 7, 16, 9, T.PATH);
  W.keep(2, 1, 41, 23);
  // the palisade, with the east gate and the way down to the dock left open
  const pal = (tx, ty) => W.put({ kind: "palisade", x: tx * TILE, y: ty * TILE + 31, seed: tx * 7 + ty * 13 }, [[tx, ty]]);
  for (let x = 2; x <= 41; x++) { pal(x, 1); if (x < 8 || x > 13) pal(x, 21); }
  for (let y = 2; y <= 20; y++) { pal(2, y); if (y !== 12 && y !== 13) pal(41, y); }
  // houses: [left tile, base row, width, options]
  const house = (tx, row, w, opts = {}) => {
    const blocks = []; for (let x = tx; x < tx + w; x++) { blocks.push([x, row], [x, row - 1]); }
    const o = W.put({ kind: "house", x: tx * TILE, y: row * TILE + 31, w, seed: tx * 31 + row, opts }, blocks);
    // a lit house throws its window light on the street
    if (opts.lit) o.light = { r: 100, c: [1, 0.8, 0.45], h: 14, dx: (w * TILE) / 2, i: 0.8, shadows: false };
    return o;
  };
  house(4, 4, 5, { tall: true, lit: true, roof: "clay", door: 0.72 }).id = "tavern";
  house(4, 10, 3, { roof: "thatch", door: 0.3 });
  house(4, 14, 3, { roof: "clay", door: 0.7, lit: true });
  house(33, 10, 4, { roof: "thatch", door: 0.3 });
  house(30, 18, 4, { roof: "slate", lit: true });
  house(35, 18, 3, { roof: "clay", door: 0.3 });
  house(28, 4, 6, { tall: true, roof: "slate", door: 0.5, lit: true }).id = "garrison";
  house(19, 4, 4, { roof: "clay", lit: true });
  W.put({ kind: "banner", ...at(34, 4) }, [[34, 4]]);
  // the tavern yard
  W.put({ kind: "sign", ...at(9, 4, 30) }, [[9, 4]]);
  W.put({ kind: "barrel", ...at(10, 5, 22) }, [[10, 5]]); W.put({ kind: "barrel", x: 11 * TILE + 10, y: 5 * TILE + 20 }, [[11, 5]]); W.put({ kind: "crate", ...at(12, 5) }, [[12, 5]]);
  W.put({ kind: "table", ...at(14, 6), seed: 1 }, [[14, 6]]); W.put({ kind: "table", ...at(16, 8), seed: 2 }, [[16, 8]]);
  // the market
  [[16, 0], [20, 1], [24, 2]].forEach(([tx, c]) => W.put({ kind: "stall", x: (tx + 1) * TILE, y: 10 * TILE + 26, color: c, seed: tx }, [[tx, 10], [tx + 1, 10]]));
  W.put({ kind: "well", ...at(21, 14) }, [[21, 14]]);
  W.put({ kind: "cart", ...at(26, 16) }, [[25, 16], [26, 16]]);
  W.put({ kind: "crate", ...at(15, 16) }, [[15, 16]]); W.put({ kind: "barrel", ...at(27, 10, 22) }, [[27, 10]]);
  // the garrison's yard
  W.put({ kind: "strongbox", ...at(35, 5), id: "strongbox" }, [[35, 5]]);
  W.put({ kind: "crate", ...at(27, 5) }, [[27, 5]]);
  W.put({ kind: "board", ...at(37, 11), id: "board" }, [[37, 11]]);
  // the refugees' camp
  W.put({ kind: "campfire", x: 9 * TILE + 16, y: 19 * TILE + 22, id: "campfire" }, [[9, 19]]);
  W.put({ kind: "tent", x: 5 * TILE + 16, y: 18 * TILE + 28, color: 1 }, [[4, 18], [5, 18], [6, 18]]);
  W.put({ kind: "tent", x: 14 * TILE, y: 18 * TILE + 28, color: 0 }, [[13, 18], [14, 18]]);
  W.put({ kind: "tent", x: 14 * TILE, y: 20 * TILE + 26, color: 1 }, [[13, 20], [14, 20]]);
  W.put({ kind: "log", x: 8 * TILE, y: 20 * TILE + 12 }); W.put({ kind: "crate", ...at(4, 20) }, [[4, 20]]);
  // lamps: every one of them is a light after dark
  for (const [tx, ty] of [[13, 9], [28, 9], [13, 17], [28, 17], [9, 8], [17, 5], [12, 22], [39, 11], [39, 14], [27, 7], [36, 8], [20, 13], [3, 12], [22, 20], [32, 15]])
    W.put({ kind: "lamp", ...at(tx, ty), light: { ...LAMP } }, [[tx, ty]]);
  // the dock
  for (let tx = 8; tx <= 14; tx += 2) W.put({ kind: "post", x: tx * TILE + 2, y: 25 * TILE + 2, h: 10 });
  W.put({ kind: "post", x: 12 * TILE + 2, y: 27 * TILE, h: 14 });
  W.put({ kind: "rowboat", x: 12 * TILE + 26, y: 26 * TILE + 12, id: "boat" });
  W.put({ kind: "barrel", ...at(8, 22, 22) }, [[8, 22]]); W.put({ kind: "crate", ...at(13, 22) }, [[13, 22]]);
  // trees beyond the wall
  const R = new Rng(23);
  for (let y = 0; y < 23; y++) for (const x of [0, 1, 42, 43]) if (!(x > 41 && y >= 11 && y <= 14) && R.chance(0.75)) W.put({ kind: R.chance(0.3) ? "pine" : "tree", x: x * TILE + 16 + R.range(-5, 5), y: y * TILE + 26, seed: R.int(1, 1e6) }, [[x, y]]);
  for (let x = 2; x < 42; x += 1) if (R.chance(0.6)) W.put({ kind: "pine", x: x * TILE + 16, y: 20, seed: R.int(1, 1e6) }, [[x, 0]]);
  for (const [tx, ty] of [[18, 19], [24, 19], [26, 20], [7, 12], [18, 6], [24, 6], [38, 16], [37, 6]]) W.put({ kind: "bush", ...at(tx, ty), seed: tx * 9 + ty });
  W.keep(0, 0, 43, 29);
  // a little grass between the houses
  const G = new Rng(9);
  for (let i = 0; i < 500; i++) { const x = G.range(3 * TILE, 41 * TILE), y = G.range(2 * TILE, 21 * TILE); if (W.tileAt((x / TILE) | 0, (y / TILE) | 0) === T.GRASS && !W.blocked((x / TILE) | 0, (y / TILE) | 0)) W.grass.push({ x, y, v: G.int(0, 5), ph: G.range(0, 6.28) }); }
  return W;
}

// ---------------------------------------------------------------- A Travessia do Cardo
export const TRAV = { west: [2, 14], ford: [31, 14], shrine: [22, 8], wagon: [41, 16], watch: [26, 17] };
const riverX = (ty) => 31 + Math.sin(ty / 3.6) * 1.6;
export function buildTravessia() {
  const W = openWorld("travessia", 50, 30);
  W.zone = "Travessia do Cardo"; W.seed = 3; W.music = "ruins";
  W.zoneAt = (x, y) => (y < 5 * TILE ? "A borda da Bruma" : Math.abs(x / TILE - 31) < 5 ? "O Vau" : x > 36 * TILE ? "Margem leste" : "Estrada do Cardo");
  for (let y = 0; y < 30; y++) for (let x = 0; x < 50; x++) if (Math.abs(x + 0.5 - riverX(y)) < 2.6) W.fill(x, y, x, y, T.WATER);
  // the road, wandering a little, and the spur up to the shrine
  for (let x = 0; x < 50; x++) { const y = 14 + Math.round(Math.sin(x / 7) * 0.8); for (const yy of [y, y + 1]) if (W.tileAt(x, yy) !== T.WATER) W.fill(x, yy, x, yy, T.PATH); W.keep(x, y - 1, x, y + 2); }
  for (let y = 9; y < 14; y++) W.fill(21, y, 21, y, T.PATH);
  // the ford: shallows you can wade, where the road meets the water
  for (let y = 13; y <= 16; y++) for (let x = 27; x <= 35; x++) if (W.tileAt(x, y) === T.WATER) W.setBlock(x, y, false);
  W.ford = (px, py) => py > 13 * TILE + 6 && py < 17 * TILE - 6;
  W.keep(18, 6, 24, 12); W.keep(36, 11, 46, 19); W.keep(23, 15, 28, 19); W.keep(9, 11, 19, 18);
  W.put({ kind: "shrine", ...at(22, 8), id: "shrine", light: { r: 60, c: [1, 0.8, 0.5], h: 6, i: 0.7, flicker: true, shadows: false } }, [[22, 8]]);
  // what is left of the bridge: posts marching into the water
  for (const [tx, h] of [[27, 16], [28, 12], [34, 10], [35, 14]]) W.put({ kind: "post", x: tx * TILE + 10, y: 13 * TILE + 8, h });
  W.put({ kind: "cart", ...at(41, 16), wrecked: true, id: "wagon" }, [[40, 16], [41, 16]]);
  W.put({ kind: "satchel", ...at(43, 17, 22), id: "satchel", hidden: true });
  W.put({ kind: "crate", ...at(39, 17) }, [[39, 17]]);
  // woods: thick to the north where the Bruma is, open along the road
  const R = new Rng(77);
  for (let y = 0; y < 30; y++) for (let x = 0; x < 50; x++) {
    const edge = Math.min(x, y, 49 - x, 29 - y), n = hash2(x >> 1, y >> 1, 5);
    if (!W.free(x, y)) continue;
    if ((edge <= 1 && R.chance(0.7)) || (n > 0.62 && R.chance(0.4))) { const kind = y < 9 && R.chance(0.6) ? "pine" : R.chance(0.2) ? "deadtree" : "tree"; W.put({ kind, x: x * TILE + 16 + R.range(-6, 6), y: y * TILE + 26, seed: R.int(1, 1e6) }, [[x, y]]); W.keep(x - 1, y - 1, x + 1, y); }
  }
  for (let i = 0; i < 130; i++) {
    const tx = R.int(2, 47), ty = R.int(2, 27), x = tx * TILE + R.range(4, 28), y = ty * TILE + R.range(8, 30);
    if (W.tileAt(tx, ty) === T.WATER) { if (R.chance(0.3) && !(ty >= 13 && ty <= 16)) W.put({ kind: "waterrock", x, y, seed: i }); continue; }
    if (!W.free(tx, ty)) continue;
    const r = R.next();
    if (r < 0.2) W.put({ kind: "rock", x, y, seed: i }, [[tx, ty]]); else if (r < 0.55) W.put({ kind: "bush", x, y, seed: i }); else W.put({ kind: "fern", x, y, seed: i });
  }
  W.sow(2600, 31);
  return W;
}
