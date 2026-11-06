// The map: a valley with a camp, a lake with a dock, and goblin-held ruins to the north.
import { TILE, fbm, vnoise, segDist, Rng, hash2 } from "./util.js";

export const MW = 64, MH = 48;
export const T = { GRASS: 0, PATH: 1, WATER: 2, DOCK: 3, STONE: 4 };

const LAKE = { cx: 47.5 * TILE, cy: 27 * TILE, rx: 12.5 * TILE, ry: 10 * TILE };
const POND = { cx: 8 * TILE, cy: 22 * TILE, rx: 3.2 * TILE, ry: 2.4 * TILE };
export const PATHS = [
  [[14, 40], [15, 35], [17, 30], [20, 24], [22, 18], [21, 13], [20, 9]],
  [[20, 24], [25, 25.5], [30, 26.5], [34, 27]],
].map((pl) => pl.map(([x, y]) => [x * TILE + 16, y * TILE + 16]));
export const RUINS = { x0: 9 * TILE, y0: 2 * TILE, x1: 31 * TILE, y1: 14 * TILE };
export const CAMP = { x: 13 * TILE + 16, y: 36 * TILE + 16 };
export const DOCK = { x0: 35, y0: 25, x1: 40, y1: 28, pier: { x0: 41, x1: 45, y: 27 } };

/** < 0 inside water, in "radius" units. */
export function waterField(x, y) {
  const n = (fbm(x / 90, y / 90, 3, 3) - 0.5) * 0.5 + (vnoise(x / 22, y / 22, 9) - 0.5) * 0.06;
  const a = ((x - LAKE.cx) / LAKE.rx) ** 2 + ((y - LAKE.cy) / LAKE.ry) ** 2 - 1 + n;
  const b = ((x - POND.cx) / POND.rx) ** 2 + ((y - POND.cy) / POND.ry) ** 2 - 1 + n * 1.4;
  return Math.min(a, b);
}
export function pathField(x, y) {
  let d = 1e9;
  for (const pl of PATHS) for (let i = 0; i < pl.length - 1; i++) d = Math.min(d, segDist(x, y, ...pl[i], ...pl[i + 1]));
  const dc = Math.hypot(x - CAMP.x, (y - CAMP.y) * 1.3) - 60;
  return Math.min(d, Math.max(0, dc) + 10) + (fbm(x / 30, y / 30, 5, 2) - 0.5) * 18;
}
export const inRuins = (x, y) => x > RUINS.x0 && x < RUINS.x1 && y > RUINS.y0 && y < RUINS.y1;
export function stoneField(x, y) {
  if (!inRuins(x, y)) return 0;
  const cx = (RUINS.x0 + RUINS.x1) / 2, cy = (RUINS.y0 + RUINS.y1) / 2;
  const e = 1 - Math.hypot((x - cx) / ((RUINS.x1 - RUINS.x0) / 2), (y - cy) / ((RUINS.y1 - RUINS.y0) / 2));
  return e * 1.4 + (fbm(x / 50, y / 50, 11, 3) - 0.5) * 0.9;
}
export function lushField(x, y, w = waterField(x, y)) {
  return fbm(x / 220, y / 220, 21, 3) * 0.9 + Math.max(0, 0.5 - w) * 0.45;
}
const isDockTile = (tx, ty) =>
  (tx >= DOCK.x0 && tx <= DOCK.x1 && ty >= DOCK.y0 && ty <= DOCK.y1) || (ty === DOCK.pier.y && tx >= DOCK.pier.x0 && tx <= DOCK.pier.x1);

export function zoneAt(px, py) {
  if (inRuins(px, py)) return "Ruínas de Velmoor";
  if (Math.hypot(px - CAMP.x, py - CAMP.y) < 7 * TILE) return "Acampamento do Vale";
  if (waterField(px, py) < 0.9 && px > 26 * TILE) return "Lago Espelhado";
  return "Bosque de Brumafolha";
}

export function buildWorld() {
  const tiles = new Uint8Array(MW * MH), block = new Uint8Array(MW * MH);
  for (let ty = 0; ty < MH; ty++)
    for (let tx = 0; tx < MW; tx++) {
      const x = tx * TILE + 16, y = ty * TILE + 16, i = ty * MW + tx;
      let t = T.GRASS;
      if (stoneField(x, y) > 0.35) t = T.STONE;
      if (pathField(x, y) < 18) t = T.PATH;
      if (waterField(x, y) < 0) t = T.WATER;
      if (isDockTile(tx, ty)) t = T.DOCK;
      tiles[i] = t;
      if (t === T.WATER) block[i] = 1;
      if (tx === 0 || ty === 0 || tx === MW - 1 || ty === MH - 1) block[i] = 1;
    }
  const W = { tiles, block, objects: [], grass: [] };
  const tileAt = (tx, ty) => (tx < 0 || ty < 0 || tx >= MW || ty >= MH ? -1 : tiles[ty * MW + tx]);
  W.tileAt = tileAt;
  W.blocked = (tx, ty) => tx < 0 || ty < 0 || tx >= MW || ty >= MH || block[ty * MW + tx] === 1;
  const reserve = new Uint8Array(MW * MH);
  const free = (tx, ty, r = 0) => {
    for (let j = -r; j <= r; j++)
      for (let i = -r; i <= r; i++) {
        const t = tileAt(tx + i, ty + j);
        if (t !== T.GRASS || reserve[(ty + j) * MW + tx + i]) return false;
      }
    return true;
  };
  const put = (o, blocks = []) => {
    W.objects.push(o);
    for (const [bx, by] of blocks) if (bx >= 0 && by >= 0 && bx < MW && by < MH) { block[by * MW + bx] = 1; reserve[by * MW + bx] = 1; }
  };
  const keep = (x0, y0, x1, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (x >= 0 && y >= 0 && x < MW && y < MH) reserve[y * MW + x] = 1; };

  // clearings that stay clear
  keep(9, 32, 18, 40); // camp
  keep(14, 4, 27, 12); // ruins court
  keep(18, 19, 25, 24); // patrol clearing

  // --- the camp
  put({ kind: "campfire", x: CAMP.x, y: CAMP.y + 6 }, [[13, 36]]);
  put({ kind: "tent", x: 10 * TILE + 16, y: 34 * TILE + 28, color: 0 }, [[10, 34], [11, 34], [9, 34]]);
  put({ kind: "tent", x: 17 * TILE + 8, y: 34 * TILE + 24, color: 1 }, [[16, 34], [17, 34]]);
  put({ kind: "log", x: CAMP.x - 34, y: CAMP.y + 14 });
  put({ kind: "log", x: CAMP.x + 30, y: CAMP.y + 26 });
  put({ kind: "crate", x: 11 * TILE + 4, y: 37 * TILE + 26 }, [[11, 37]]);
  put({ kind: "barrel", x: 9 * TILE + 26, y: 36 * TILE + 22 }, [[9, 36]]);

  // --- the dock: posts along its edges
  for (let tx = DOCK.x0; tx <= DOCK.x1 + 1; tx += 2) {
    put({ kind: "post", x: tx * TILE + 2, y: DOCK.y0 * TILE + 8, h: 14 });
    put({ kind: "post", x: tx * TILE + 2, y: (DOCK.y1 + 1) * TILE + 2, h: 10 });
  }
  for (let tx = DOCK.pier.x0; tx <= DOCK.pier.x1 + 1; tx += 2) put({ kind: "post", x: tx * TILE + 2, y: (DOCK.pier.y + 1) * TILE + 2, h: 8 });
  put({ kind: "post", x: (DOCK.pier.x1 + 1) * TILE + 4, y: DOCK.pier.y * TILE + 4, h: 18 });
  put({ kind: "barrel", x: 39 * TILE + 8, y: 25 * TILE + 22 }, [[39, 25]]);
  put({ kind: "crate", x: 40 * TILE + 12, y: 25 * TILE + 26 }, [[40, 25]]);
  put({ kind: "rowboat", x: 40 * TILE + 8, y: 31 * TILE + 20 });

  // --- the ruins: broken walls around a court, pillars, the goblin camp
  const wall = (x0, x1, y, broken = []) => {
    for (let tx = x0; tx <= x1; tx++) {
      if (broken.includes(tx)) {
        if (hash2(tx, y, 4) < 0.5) put({ kind: "rubble", x: tx * TILE + 16, y: y * TILE + 26, seed: tx * 7 + y });
        continue;
      }
      const h = 2 + Math.floor(hash2(tx, y, 2) * 3);
      put({ kind: "wall", x: tx * TILE, y: y * TILE + TILE, h, seed: tx * 13 + y }, [[tx, y]]);
    }
  };
  wall(12, 28, 3, [16, 17, 23, 26]);
  wall(12, 15, 13, [14]);
  wall(25, 28, 13, [26]);
  const vwall = (x, y0, y1, broken = []) => {
    for (let ty = y0; ty <= y1; ty++) {
      if (broken.includes(ty)) continue;
      put({ kind: "wall", x: x * TILE, y: ty * TILE + TILE, h: 2 + Math.floor(hash2(x, ty, 2) * 3), seed: x * 5 + ty * 3 }, [[x, ty]]);
    }
  };
  vwall(12, 4, 12, [7, 8]);
  vwall(28, 4, 12, [9, 10]);
  for (const [px, py, h] of [[16, 6, 3], [24, 6, 2], [16, 10, 1], [24, 10, 3]]) put({ kind: "pillar", x: px * TILE + 16, y: py * TILE + 28, h, seed: px + py }, [[px, py]]);
  put({ kind: "campfire", x: 20 * TILE + 16, y: 8 * TILE + 24, goblin: true }, [[20, 8]]);
  put({ kind: "banner", x: 18 * TILE + 16, y: 5 * TILE + 26 }, [[18, 5]]);
  put({ kind: "bones", x: 22 * TILE + 10, y: 10 * TILE + 20 });
  put({ kind: "bones", x: 14 * TILE + 20, y: 8 * TILE + 12 });
  for (let i = 0; i < 6; i++) put({ kind: "rubble", x: (13 + ((i * 37) % 15)) * TILE + 10, y: (5 + ((i * 23) % 7)) * TILE + 20, seed: i + 40 });

  // --- trees: a dense border, then scattered groves
  const R = new Rng(7);
  const tryTree = (tx, ty, edge) => {
    if (!free(tx, ty, edge ? 0 : 1)) return;
    const kind = ty < 15 && R.chance(0.55) ? "pine" : R.chance(0.12) ? "deadtree" : "tree";
    put({ kind, x: tx * TILE + 16 + R.range(-6, 6), y: ty * TILE + 26, seed: R.int(1, 1e6) }, [[tx, ty]]);
    keep(tx - 1, ty - 1, tx + 1, ty);
  };
  for (let ty = 0; ty < MH; ty++)
    for (let tx = 0; tx < MW; tx++) {
      const e = Math.min(tx, ty, MW - 1 - tx, MH - 1 - ty);
      const n = fbm(tx / 6, ty / 6, 31, 2);
      if (e <= 2 && R.chance(0.7)) tryTree(tx, ty, true);
      else if (e > 2 && n > 0.6 && R.chance(0.28)) tryTree(tx, ty, false);
    }
  for (let tx = 0; tx < MW; tx++) for (let ty = 0; ty < MH; ty++) if (Math.min(tx, ty, MW - 1 - tx, MH - 1 - ty) === 0) block[ty * MW + tx] = 1;

  // rocks, bushes, ferns
  for (let i = 0; i < 260; i++) {
    const tx = R.int(2, MW - 3), ty = R.int(2, MH - 3);
    const x = tx * TILE + R.range(4, 28), y = ty * TILE + R.range(8, 30);
    const t = tileAt(tx, ty);
    if (t === T.WATER) {
      if (waterField(x, y) > -0.5 && R.chance(0.25)) put({ kind: "waterrock", x, y, seed: i });
      continue;
    }
    if (t !== T.GRASS || reserve[ty * MW + tx]) continue;
    const r = R.next();
    if (r < 0.2) put({ kind: "rock", x, y, seed: i }, [[tx, ty]]);
    else if (r < 0.55) put({ kind: "bush", x, y, seed: i });
    else put({ kind: "fern", x, y, seed: i });
  }

  // tall grass clumps that sway (not blocking)
  for (let i = 0; i < 6500; i++) {
    const x = R.range(2 * TILE, (MW - 2) * TILE), y = R.range(2 * TILE, (MH - 2) * TILE);
    const tx = (x / TILE) | 0, ty = (y / TILE) | 0, t = tileAt(tx, ty);
    if (t !== T.GRASS) continue;
    const l = lushField(x, y);
    if (R.next() > (l - 0.3) * 1.3) continue;
    W.grass.push({ x, y, v: R.int(0, 5), ph: R.range(0, 6.28) });
  }
  return W;
}
