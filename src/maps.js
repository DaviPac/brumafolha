// The prologue's two small areas, laid out tile by tile from the level plan (docs/planta-prologo.html):
// dreamed Velmoor (17×24) and the Relicário under the ruins (23×31). They share the valley's 64-wide grid
// stride, so pathfinding and combat work unchanged; everything outside the area is solid.
import { TILE, hash2 } from "./util.js";
import { MW, MH, T } from "./world.js";
import { IRAMP } from "./art/interiors.js";

function gridWorld(id, rows, legend) {
  const h = rows.length, w = rows[0].length;
  const tiles = new Uint8Array(MW * MH).fill(T.WALL), block = new Uint8Array(MW * MH).fill(1);
  const marks = {};
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x], L = legend[ch] ?? legend["."];
      tiles[y * MW + x] = L.t;
      block[y * MW + x] = L.walk ? 0 : 1;
      (marks[ch] ??= []).push([x, y]);
    }
  const W = { id, w, h, tiles, block, objects: [], grass: [], marks };
  W.tileAt = (tx, ty) => (tx < 0 || ty < 0 || tx >= w || ty >= h ? -1 : tiles[ty * MW + tx]);
  W.blocked = (tx, ty) => tx < 0 || ty < 0 || tx >= w || ty >= h || block[ty * MW + tx] === 1;
  W.setBlock = (tx, ty, b) => { block[ty * MW + tx] = b ? 1 : 0; };
  return W;
}

// ---------------------------------------------------------------- 1 · Velmoor sonhada
// # mist (closes the sides)   2 tower   ~ avenue   o a faceless figure   C the one who turns   L the woman
const DREAM = [
  "#################",
  "##222~~~~~~~222##",
  "#222~~~~L~~~~222#",
  "#22~~~~~~~~~~~22#",
  "#22~~o~~~~~o~~22#",
  "#222~~~~~~~~~222#",
  "##2222~~~~~2222##",
  "##2222~o~~~2222##",
  "##2222~~~C~2222##",
  "##2222o~~~o2222##",
  "##2222~~~o~2222##",
  "##2222o~~~o2222##",
  "##2222~~o~~2222##",
  "##2222~~~~~2222##",
  "##2222o~~~o2222##",
  "###22~~~~~~~22###",
  "###22~~o~~o~22###",
  "###22~~~~~~~22###",
  "###222o~~~o222###",
  "####22~~~~~22####",
  "####22~~~~~22####",
  "####22~~~~~22####",
  "######~~~~~######",
  "#################",
];

export function buildDream() {
  const walk = { t: T.MARBLE, walk: true };
  const W = gridWorld("sonho", DREAM, { "#": { t: T.MIST }, "2": { t: T.ROOF }, "~": walk, o: walk, C: walk, L: walk, ".": { t: T.MIST } });
  W.zone = "Velmoor sonhada";
  W.floorRamp = IRAMP.warm;
  // a skyline: a tower on every roof tile, taller towards the back
  for (const [x, y] of W.marks["2"]) {
    const h = 1 + Math.floor(hash2(x, y, 9) * 3) + (y < 8 ? 1 : 0);
    W.objects.push({ kind: "tower", x: x * TILE, y: y * TILE + TILE - 1, h, seed: x * 31 + y * 7 });
  }
  return W;
}

// ---------------------------------------------------------------- 3 · O Relicário de Velmoor
// . slate wall   B floor   # relief wall   0 pillar   P pedestal   D sealed door   S statue
// R a relief with someone's face (H the hero, M Tomé)   I inscription   E stairs up to the valley
const RELIC = [
  ".......................",
  "....BBBBBBBBBBBBBBB....",
  "...BBBBBBBBBBBBBBBBB...",
  "...BB0BBBBBPBBBBB0BB...",
  "...BBBBBBBBBBBBBBBBB...",
  "...BBBBBBBBBBBBBBBBB...",
  "...BB0BBBBBBBBBBB0BB...",
  "...BBBBBBBBBBBBBBBBB...",
  "....BBBBBBBBBBBBBBB....",
  "..........DDD..........",
  "..........BBB..........",
  ".....BBBBBBBBBBBBB.....",
  ".....BBBBBBBBBBBBB.....",
  "....SBBBBBBSBBBBBBS....",
  ".....BBBBBBBBBBBBB.....",
  ".....BBBBBBBBBBBBB.....",
  "..........BBB..........",
  "..........BBB..........",
  "..........BBB..........",
  "......####BBB####......",
  ".....#BBBBBBBBBBB#.....",
  ".....HBBBBBBBBBBB#.....",
  ".....#BBBBBBBBBBBM.....",
  ".....#BBBBBBBBBBB#.....",
  ".....#BBBBBBBBBBB#.....",
  "......####BBB####......",
  "..........BBB..........",
  "..........BBB..........",
  ".........IBBB..........",
  "..........EEE..........",
  ".......................",
];

export function buildRelic() {
  const floor = { t: T.MARBLE, walk: true }, solidFloor = { t: T.MARBLE };
  const W = gridWorld("relicario", RELIC, {
    ".": { t: T.WALL }, "#": { t: T.RELIEF }, H: { t: T.RELIEF }, M: { t: T.RELIEF }, I: { t: T.WALL },
    B: floor, "0": solidFloor, P: solidFloor, S: solidFloor, D: solidFloor, E: { t: T.STAIRS, walk: true },
  });
  W.zone = "Relicário de Velmoor";
  W.floorRamp = IRAMP.marble;
  for (const [x, y] of W.marks["0"]) W.objects.push({ kind: "rpillar", x: x * TILE + 16, y: y * TILE + 28, h: 4, seed: 300 + x * 3 + y });
  return W;
}
