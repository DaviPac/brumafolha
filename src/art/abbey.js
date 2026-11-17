// Act I, chapter two, painted in code: the Monastery of the Serene Veil and the woods south of it. Whitewashed walls
// with slate caps, a bell tower, beds of the pale "chá de bruma", benches, the orphans' cots, the veiled altar, the
// kitchen hearth with its kettle, the bars of a cell, the lectern with the book of names, the Order's white ribbons
// tied along the road. Same rules as the rest: lit from the top left, hard ramps with ordered dither, a dark outline.
import { TILE, PixBuf, Rng, ramp, rampAt, vnoise, fbm, hash2, clamp } from "../util.js";
import { RAMP } from "./props.js";
import { TRAMP } from "./town.js";

const INK = [24, 18, 30];
export const ARAMP = {
  white: ramp("#7a7468", "#a09a8c", "#c4bfb0", "#dedace", "#f0eee6", "#fbfaf6"),
  veil: ramp("#8e95a8", "#b4bac8", "#d4d8e2", "#eceef4", "#fbfcfe"),
  mist: ramp("#4e6a74", "#6e8e96", "#94b2b6", "#bcd4d2", "#e2f0ec"),
  bronze: ramp("#3a2410", "#6a4418", "#9a6a24", "#c8963a", "#ecc66a"),
  lavender: ramp("#3a2a5a", "#5e4688", "#8a6ab4", "#b494d8"),
  sheet: ramp("#8a8e9a", "#b2b6c0", "#d6d8de", "#eff0f2"),
};

/** A whitewashed stone wall, one tile long: a slate cap seen from above, plaster flaking off the stones below. */
export function makeAbbeyWall(seed) {
  const W = TILE, H = 46, pb = new PixBuf(W, H), P = ARAMP.white, S = TRAMP.slate, St = RAMP.stone;
  for (let y = 0; y < 8; y++) for (let x = 0; x < W; x++) {
    let v = 0.62 - y * 0.03 + (vnoise((x + seed * 7) / 4, y / 3, seed) - 0.5) * 0.25;
    if (y === 0) v = 0.92; if (y === 7) v = 0.12; if ((x + seed) % 11 === 0) v -= 0.25;
    pb.set(x, y + 2, rampAt(S, v, x, y));
  }
  for (let y = 0; y < 34; y++) for (let x = 0; x < W; x++) {
    const wx = x + seed * 32, peel = fbm(wx / 9, y / 7, 3 + (seed % 5), 2);
    let c;
    if (peel < 0.34) {
      // bare stones where the lime fell off
      const row = Math.floor(y / 6), off = row & 1 ? 5 : 0, brick = (wx + off) % 10;
      c = brick === 0 || y % 6 === 0 ? St[0] : rampAt(St, 0.55 - y * 0.008 + hash2(Math.floor((wx + off) / 10), row, 3) * 0.2, x, y);
    } else c = rampAt(P, 0.86 - y * 0.012 - (x > W - 3 ? 0.12 : 0) + (vnoise(wx / 5, y / 5, 8) - 0.5) * 0.12 - (peel < 0.38 ? 0.25 : 0), x, y);
    if (y > 28 && fbm(wx / 4, y, 9, 2) > 0.45) c = rampAt(RAMP.moss, 0.3 + (y - 28) * 0.05, x, y);
    pb.set(x, y + 10, c);
  }
  for (let x = 0; x < W; x++) pb.set(x, 44, P[0]);
  pb.outline(INK);
  return { c: pb.canvas(), ox: 0, oy: 44, shadow: 0 };
}

/** The bell tower: white, narrow, a slate spire, an arch with a bronze bell, a veil hung below it. */
export function makeBellTower() {
  const W = 52, H = 150, pb = new PixBuf(W, H), P = ARAMP.white, S = TRAMP.slate, B = ARAMP.bronze;
  const x0 = 6, bw = 40, roofH = 40, top = roofH;
  // spire
  for (let y = 0; y < roofH; y++) {
    const half = 3 + (y / roofH) * (bw / 2 + 3);
    for (let x = 0; x < W; x++) {
      const dx = x - W / 2;
      if (Math.abs(dx) > half) continue;
      let v = 0.5 + (dx < 0 ? 0.25 : -0.15) - (y % 5 === 4 ? 0.2 : 0) + (vnoise(x / 3, y / 2, 4) - 0.5) * 0.2;
      pb.set(x, y + 2, rampAt(S, v, x, y));
    }
  }
  for (let y = 0; y < 3; y++) pb.set(W / 2, y, B[3 - y]);
  // the shaft
  for (let y = top; y < H - 2; y++) for (let x = x0; x < x0 + bw; x++) {
    const lx = x - x0, ly = y - top;
    let v = 0.85 - lx * 0.01 - (lx > bw - 4 ? 0.2 : 0) + (vnoise(x / 6, y / 6, 3) - 0.5) * 0.1;
    if (ly === 0 || ly === 1) v = 0.3;
    if (ly % 26 === 25) v -= 0.25;
    pb.set(x, y + 2, rampAt(P, v, x, y));
  }
  // the bell arch: dark inside, the bell hanging
  const ax = W / 2, ay = top + 30;
  for (let y = -18; y < 6; y++) for (let x = -10; x <= 10; x++) {
    const inArch = y >= -8 ? Math.abs(x) <= 9 : x * x + (y + 8) * (y + 8) <= 81;
    if (inArch) pb.set(ax + x, ay + y, y > 3 ? P[1] : rampAt(TRAMP.slate, 0.1 + (y + 18) * 0.004, x, y));
  }
  for (let y = 0; y < 13; y++) for (let x = -6; x <= 6; x++) {
    const half = 2.5 + y * 0.32;
    if (Math.abs(x) > half) continue;
    pb.set(ax + x, ay - 14 + y, rampAt(B, 0.75 - (x + 6) * 0.045 - (y === 12 ? 0.3 : 0), x, y));
  }
  pb.set(ax, ay - 1, B[1]); pb.set(ax, ay, B[0]);
  // a slit window, and the veil banner of the Order
  for (let y = 0; y < 12; y++) { pb.set(ax - 1, top + 58 + y, S[0]); pb.set(ax, top + 58 + y, S[1]); }
  for (let y = 0; y < 34; y++) for (let x = 0; x < 14; x++) {
    if (y > 28 && (x + y) % 4 === 0) continue;
    pb.set(ax - 7 + x, top + 76 + y, rampAt(ARAMP.veil, 0.85 - x * 0.03 + Math.sin(x * 0.9 + y * 0.2) * 0.08, x, y));
  }
  eye(pb, ax, top + 88, ARAMP.veil[0]);
  pb.outline(INK);
  return { c: pb.canvas(), ox: W / 2, oy: H - 2, shadow: 22 };
}
/** The Order's sign: an eye, closed, with three lashes. */
function eye(pb, cx, cy, c) {
  for (let x = -4; x <= 4; x++) pb.set(cx + x, cy + (Math.abs(x) > 2 ? -1 : 0), c);
  for (const x of [-3, 0, 3]) { pb.set(cx + x, cy + 1, c); pb.set(cx + x, cy + 2, c); }
}

/** A raised bed of herbs, two tiles long. `mist`: the pale "chá de bruma", silver leaves and white bells. */
export function makeHerbBed(seed, mist = false) {
  const W = 62, H = 36, pb = new PixBuf(W, H), Wd = RAMP.wood, R = new Rng(seed);
  // the box: a lit top rim, dark soil inside, the front board
  for (let y = 0; y < 20; y++) for (let x = 0; x < W; x++) {
    const rim = x < 3 || x > W - 4 || y < 3 || y > 16;
    pb.set(x, y + 10, rim ? rampAt(Wd, (y < 3 ? 0.82 : y > 16 ? 0.5 : 0.62) - x * 0.003, x, y) : rampAt(RAMP.bark, 0.18 + vnoise(x / 2, y / 2, seed) * 0.3, x, y));
  }
  for (let x = 0; x < W; x++) for (let y = 0; y < 6; y++) pb.set(x, 30 + y, rampAt(Wd, 0.42 - y * 0.06 - (x % 15 === 0 ? 0.15 : 0), x, y));
  // two rows of round clumps, each a little dome of leaves lit from the top left, flowers on top
  const L = mist ? ARAMP.mist : RAMP.leaf;
  for (const [row, cy] of [[0, 15], [1, 22]]) for (let i = 0; i < 7; i++) {
    const cx = 6 + i * 8.2 + row * 4 + R.range(-1, 1), r = R.range(3.6, 4.8), top = cy - r;
    for (let y = -Math.ceil(r * 1.3); y <= Math.ceil(r * 0.6); y++) for (let x = -Math.ceil(r); x <= Math.ceil(r); x++) {
      const q = (x / r) ** 2 + (y / (r * (y < 0 ? 1.3 : 0.6))) ** 2;
      if (q > 1 || cx + x > W - 4 || cx + x < 3) continue;
      let v = 0.62 - x * 0.07 - y * 0.06 + (vnoise((cx + x) / 1.6, (cy + y) / 1.6, seed + i) - 0.5) * 0.45 - (q > 0.75 ? 0.18 : 0);
      pb.set(cx + x, cy + y, rampAt(L, clamp(v), cx + x, cy + y));
    }
    const n = mist ? 3 : i % 2 ? 0 : 2;
    for (let k = 0; k < n; k++) {
      const fx = Math.round(cx + R.range(-r * 0.6, r * 0.6)), fy = Math.round(top + R.range(0, 2));
      if (mist) { pb.set(fx, fy, ARAMP.white[5]); pb.set(fx, fy + 1, ARAMP.veil[1]); }
      else { pb.set(fx, fy - 1, ARAMP.lavender[3]); pb.set(fx, fy, ARAMP.lavender[2]); pb.set(fx, fy + 1, ARAMP.lavender[1]); }
    }
  }
  pb.outline(INK);
  return { c: pb.canvas(), ox: 31, oy: 35, shadow: 28 };
}

/** A plain wooden bench. */
export function makeBench() {
  const W = 34, H = 18, pb = new PixBuf(W, H), Wd = RAMP.wood;
  for (const lx of [4, 27]) for (let y = 8; y < 17; y++) { pb.set(lx, y, Wd[2]); pb.set(lx + 1, y, Wd[1]); }
  for (let y = 0; y < 8; y++) for (let x = 0; x < W; x++) pb.set(x, y + 3, rampAt(Wd, (y < 4 ? 0.82 : 0.4) - x * 0.006 - (y === 3 ? 0.25 : 0), x, y));
  pb.outline(INK);
  return { c: pb.canvas(), ox: 17, oy: 16, shadow: 15 };
}

/** An orphan's cot, seen from above and in front: the sheet on top, the pillow at the head, the wooden side below. `who`: someone asleep in it (0 = empty). */
export function makeCot(who = 0) {
  const W = 26, H = 34, pb = new PixBuf(W, H), Wd = RAMP.wood, Sh = ARAMP.sheet;
  // headboard
  for (let y = 0; y < 6; y++) for (let x = 1; x < W - 1; x++) pb.set(x, y + 1, rampAt(Wd, (y < 2 ? 0.85 : 0.5) - x * 0.008, x, y));
  // the top: a short sheet, foreshortened
  for (let y = 0; y < 20; y++) for (let x = 0; x < W; x++) {
    const frame = x < 2 || x > W - 3;
    pb.set(x, y + 7, frame ? rampAt(Wd, 0.7 - x * 0.01, x, y) : rampAt(Sh, 0.85 - x * 0.01 - (y > 6 && (x + y) % 9 === 0 ? 0.15 : 0), x, y));
  }
  // the side, the legs
  for (let y = 0; y < 4; y++) for (let x = 0; x < W; x++) pb.set(x, y + 27, rampAt(Wd, 0.4 - y * 0.08, x, y));
  for (const lx of [1, 23]) for (let y = 31; y < 33; y++) { pb.set(lx, y, Wd[1]); pb.set(lx + 1, y, Wd[0]); }
  for (let y = 0; y < 5; y++) for (let x = 0; x < 16; x++) if (((x - 7.5) / 8) ** 2 + ((y - 2) / 2.8) ** 2 <= 1) pb.set(5 + x, 8 + y, rampAt(ARAMP.white, 0.95 - x * 0.02 - y * 0.04, x, y));
  if (who) {
    const hair = [RAMP.bark, TRAMP.timber, ramp("#8a5a1a", "#b8802a", "#dca848", "#f0c868"), RAMP.stone][who % 4];
    for (let y = 0; y < 6; y++) for (let x = 0; x < 9; x++) if (((x - 4) / 4.6) ** 2 + ((y - 3) / 3.2) ** 2 <= 1) pb.set(8 + x, 7 + y, rampAt(hair, 0.72 - x * 0.06, x, y));
    for (let y = 0; y < 12; y++) for (let x = 0; x < 18; x++) if (((x - 8.5) / 9) ** 2 + ((y - 6) / 6.4) ** 2 <= 1) pb.set(4 + x, 13 + y, rampAt(Sh, 0.95 - x * 0.03 - y * 0.02, x, y));
  }
  pb.outline(INK);
  return { c: pb.canvas(), ox: 13, oy: 32, shadow: 13 };
}

/** The veiled altar: a stone table with a white runner, candles, and the great veil hung on a frame behind it. */
export function makeAltar() {
  const W = 70, H = 76, pb = new PixBuf(W, H), St = RAMP.stone, V = ARAMP.veil, Wd = RAMP.wood;
  for (const px of [3, 64]) for (let y = 2; y < 50; y++) { pb.set(px, y, Wd[3]); pb.set(px + 1, y, Wd[1]); pb.set(px + 2, y, Wd[0]); }
  for (let x = 2; x < 68; x++) { pb.set(x, 2, Wd[4]); pb.set(x, 3, Wd[2]); }
  for (let y = 0; y < 46; y++) for (let x = 6; x < 64; x++) {
    const fold = Math.sin(x * 0.55 + y * 0.05) * 0.12;
    if (y > 40 && (x + y) % 3 === 0) continue;
    pb.set(x, y + 4, rampAt(V, 0.8 + fold - y * 0.006 - (x > 58 ? 0.1 : 0), x, y));
  }
  eye(pb, 35, 22, V[0]);
  // the altar: top face, front face, the runner
  for (let y = 0; y < 22; y++) for (let x = 8; x < 62; x++) {
    let v = y < 8 ? 0.82 - x * 0.004 : 0.48 - (y - 8) * 0.012 - (x > 58 ? 0.1 : 0);
    if (y === 8) v = 0.95;
    pb.set(x, y + 52, rampAt(St, v + (vnoise(x / 4, y / 4, 2) - 0.5) * 0.08, x, y));
  }
  for (let y = 0; y < 18; y++) for (let x = 28; x < 42; x++) if (y < 8 || x % 13 !== 0) pb.set(x, y + 53, rampAt(ARAMP.white, 0.9 - (x - 28) * 0.02 - (y > 7 ? 0.15 : 0), x, y));
  for (const cx of [14, 22, 48, 56]) {
    for (let y = 0; y < 7; y++) { pb.set(cx, 47 + y, ARAMP.white[4]); pb.set(cx + 1, 47 + y, ARAMP.white[2]); }
    pb.set(cx, 45, TRAMP.glow[3]); pb.set(cx, 46, TRAMP.glow[2]); pb.set(cx + 1, 46, TRAMP.glow[1]);
  }
  pb.outline(INK);
  return { c: pb.canvas(), ox: 35, oy: 74, shadow: 30 };
}

/** The kitchen hearth: a stone chimney breast, a fire, the big kettle of tea on a hook. */
export function makeHearth() {
  const W = 56, H = 70, pb = new PixBuf(W, H), St = RAMP.stone, I = TRAMP.iron, G = TRAMP.glow;
  for (let y = 0; y < 66; y++) for (let x = 2; x < 54; x++) {
    const row = Math.floor(y / 7), off = row & 1 ? 6 : 0, joint = (x + off) % 12 === 0 || y % 7 === 0;
    let v = 0.62 - x * 0.006 + hash2(Math.floor((x + off) / 12), row, 4) * 0.18;
    if (y < 4) v = 0.85;
    pb.set(x, y + 2, joint ? St[0] : rampAt(St, v, x, y));
  }
  for (let y = 0; y < 26; y++) for (let x = -14; x <= 14; x++) {
    const ok = y > 6 ? true : x * x + (6 - y) ** 2 * 4 <= 196;
    if (!ok) continue;
    pb.set(28 + x, 40 + y, rampAt(St, 0.05 + (y / 26) * 0.1, x, y));
  }
  for (let y = 0; y < 10; y++) for (let x = -9; x <= 9; x++) {
    const h = 10 - Math.abs(x) * 0.8 - (hash2(x, y, 6) * 2);
    if (y > h) continue;
    pb.set(28 + x, 64 - y, rampAt(G, 0.95 - y * 0.08 - Math.abs(x) * 0.03, x, y));
  }
  for (let x = 16; x < 41; x++) pb.set(x, 64, RAMP.bark[1]);
  for (let y = 40; y < 50; y++) pb.set(28, y, I[2]);
  for (let y = 0; y < 10; y++) for (let x = -7; x <= 7; x++) if ((x / 7.5) ** 2 + ((y - 5) / 5.2) ** 2 <= 1) pb.set(28 + x, 50 + y, rampAt(I, 0.72 - (x + 7) * 0.04 - y * 0.02, x, y));
  for (let x = 23; x < 34; x++) pb.set(x, 49, I[3]);
  pb.set(36, 52, I[2]); pb.set(37, 51, I[2]); pb.set(38, 50, I[3]);
  pb.outline(INK);
  return { c: pb.canvas(), ox: 28, oy: 68, shadow: 26 };
}

/** The door of a cell: iron bars in a stone frame. `open`: swung in, only the frame. */
export function makeBars(open = false) {
  const W = TILE, H = 50, pb = new PixBuf(W, H), I = TRAMP.iron, St = RAMP.stone;
  for (let y = 0; y < 48; y++) for (const [x0, x1] of [[0, 4], [W - 4, W]]) for (let x = x0; x < x1; x++) pb.set(x, y + 1, rampAt(St, 0.65 - (x - x0) * 0.1 - y * 0.004, x, y));
  for (let x = 0; x < W; x++) for (let y = 0; y < 5; y++) pb.set(x, y + 1, rampAt(St, 0.8 - y * 0.12, x, y));
  if (!open) {
    for (let bx = 7; bx < W - 5; bx += 4) for (let y = 6; y < 48; y++) { pb.set(bx, y, I[3]); pb.set(bx + 1, y, I[1]); }
    for (const yy of [14, 34]) for (let x = 4; x < W - 4; x++) { pb.set(x, yy, I[3]); pb.set(x, yy + 1, I[1]); }
    pb.rect(13, 22, 6, 6, I[2]); pb.set(15, 24, INK); pb.set(16, 25, INK);
  } else for (let y = 6; y < 48; y++) { pb.set(5, y, I[3]); pb.set(6, y, I[1]); pb.set(8, y + (y > 40 ? 0 : 0), I[2]); }
  pb.outline(INK);
  return { c: pb.canvas(), ox: 0, oy: 48, shadow: 0 };
}

/** The lectern with the book of names, open, a ribbon hanging from it. */
export function makeLectern() {
  const W = 30, H = 42, pb = new PixBuf(W, H), Wd = RAMP.wood;
  for (let y = 18; y < 38; y++) for (let x = 12; x < 18; x++) pb.set(x, y, rampAt(Wd, 0.6 - (x - 12) * 0.08, x, y));
  for (let x = 6; x < 24; x++) for (let y = 37; y < 40; y++) pb.set(x, y, Wd[y === 37 ? 3 : 1]);
  for (let y = 0; y < 12; y++) for (let x = 2; x < 28; x++) pb.set(x, y + 10, rampAt(Wd, 0.7 - y * 0.03 - x * 0.006, x, y));
  for (let y = 0; y < 11; y++) for (let x = 0; x < 24; x++) {
    if (x === 11 || x === 12) { pb.set(3 + x, y + 5, ARAMP.white[1]); continue; }
    const line = y > 1 && y < 10 && y % 2 === 0 && x > 1 && x < 22 && hash2(x >> 1, y, 3) > 0.3;
    pb.set(3 + x, y + 5 - (x < 11 ? (11 - x) * 0.12 : (x - 12) * 0.12), line ? RAMP.stone[1] : rampAt(ARAMP.white, 0.92 - Math.abs(x - 11.5) * 0.015, x, y));
  }
  for (let y = 15; y < 26; y++) pb.set(16, y, TRAMP.clay[2 + (y & 1)]);
  pb.outline(INK);
  return { c: pb.canvas(), ox: 15, oy: 40, shadow: 10 };
}

/** A stake by the road with the Order's white ribbons tied to it, one for each village that passed. */
export function makeRibbons(seed) {
  const W = 26, H = 46, pb = new PixBuf(W, H), R = new Rng(seed), Wd = RAMP.barkDead;
  for (let y = 4; y < 44; y++) { pb.set(12, y, Wd[3]); pb.set(13, y, Wd[1]); }
  for (let x = 6; x < 20; x++) pb.set(x, 8 + Math.round(Math.abs(x - 12.5) * 0.3), Wd[2]);
  for (let i = 0; i < 6; i++) {
    const ax = 7 + i * 2.2, ay = 9 + R.int(0, 3), len = R.int(9, 18);
    for (let k = 0; k < len; k++) {
      const x = ax + Math.round(Math.sin(k * 0.5 + i) * 1.5 + k * 0.25), y = ay + k;
      pb.set(x, y, rampAt(ARAMP.veil, 0.95 - k * 0.025, x, y));
      if (k % 4 === 0) pb.set(x + 1, y, ARAMP.veil[1]);
    }
  }
  pb.outline(INK);
  return { c: pb.canvas(), ox: 13, oy: 44, shadow: 6 };
}

/** The iron gate in the north wall, the one the processions go out of. `open`: ajar. */
export function makeGate(open = false) {
  const W = 72, H = 60, pb = new PixBuf(W, H), I = TRAMP.iron, P = ARAMP.white;
  for (const px of [0, W - 8]) for (let y = 0; y < 58; y++) for (let x = 0; x < 8; x++) pb.set(px + x, y, rampAt(P, (y < 6 ? 0.92 : 0.7) - x * 0.04 - y * 0.003, x, y));
  for (let x = 8; x < W - 8; x++) {
    const arch = 10 - Math.round(Math.sqrt(Math.max(0, 1 - ((x - W / 2) / 28) ** 2)) * 8);
    pb.set(x, arch + 4, I[3]); pb.set(x, arch + 5, I[1]);
    if (open && x > 20 && x < W - 20) continue;
    if ((x - 8) % 5 === 0) for (let y = arch + 6; y < 56; y++) { pb.set(x, y, I[3]); pb.set(x + 1, y, I[1]); if (y === arch + 7) pb.set(x, y - 2, I[4]); }
  }
  for (const yy of [22, 44]) for (let x = 8; x < W - 8; x++) if (!(open && x > 20 && x < W - 20)) { pb.set(x, yy, I[3]); pb.set(x, yy + 1, I[1]); }
  eye(pb, W / 2, 14, I[0]);
  pb.outline(INK);
  return { c: pb.canvas(), ox: W / 2, oy: 57, shadow: 0 };
}

/** A white banner of the Order on a pole. */
export function makeVeilBanner() {
  const W = 18, H = 60, pb = new PixBuf(W, H), Wd = RAMP.wood;
  for (let y = 2; y < 58; y++) { pb.set(3, y, Wd[3]); pb.set(4, y, Wd[1]); }
  for (let x = 2; x < 17; x++) pb.set(x, 4, Wd[3]);
  for (let y = 0; y < 28; y++) for (let x = 0; x < 11; x++) {
    if (y > 24 && (x + y) % 3 === 0) continue;
    pb.set(5 + x, 6 + y, rampAt(ARAMP.veil, 0.88 - x * 0.03 + Math.sin(y * 0.4 + x * 0.3) * 0.07, x, y));
  }
  eye(pb, 10, 16, ARAMP.veil[0]);
  pb.outline(INK);
  return { c: pb.canvas(), ox: 4, oy: 58, shadow: 4 };
}

/** A teapot and two cups, for a table or the floor. */
export function makeTeapot() {
  const pb = new PixBuf(22, 16), P = ARAMP.white;
  for (let y = 0; y < 9; y++) for (let x = 0; x < 11; x++) if (((x - 5) / 5.5) ** 2 + ((y - 4.5) / 4.6) ** 2 <= 1) pb.set(3 + x, 4 + y, rampAt(P, 0.9 - x * 0.05 - y * 0.03, x, y));
  for (let i = 0; i < 4; i++) pb.set(14 + i, 8 - i, P[2]);
  pb.set(7, 3, P[1]); pb.set(8, 3, P[2]); pb.set(1, 7, P[1]); pb.set(2, 6, P[2]); pb.set(2, 10, P[1]);
  for (const cx of [17, 6]) for (let y = 0; y < 3; y++) for (let x = 0; x < 4; x++) pb.set(cx + x, 12 + y, y === 0 ? ARAMP.mist[3] : P[3 - x % 2]);
  pb.outline(INK);
  return { c: pb.canvas(), ox: 11, oy: 15, shadow: 8 };
}

/** The door behind the veil, once found: a narrow dark opening in the whitewash, a step down. */
export function makeDoorway() {
  const W = TILE, H = 46, pb = new PixBuf(W, H), P = ARAMP.white;
  for (let y = 0; y < 44; y++) for (let x = 0; x < W; x++) {
    const inner = x > 6 && x < W - 7 && (y > 12 || (x - 15.5) ** 2 + (y - 12) ** 2 * 1.4 < 81);
    if (inner) pb.set(x, y + 1, rampAt(TRAMP.slate, 0.05 + (y / 44) * 0.18, x, y));
    else if (x <= 6 || x >= W - 7) pb.set(x, y + 1, rampAt(P, 0.78 - (x > W / 2 ? 0.2 : 0) - y * 0.004, x, y));
  }
  for (let x = 7; x < W - 7; x++) { pb.set(x, 42, RAMP.stone[3]); pb.set(x, 43, RAMP.stone[1]); }
  pb.outline(INK);
  return { c: pb.canvas(), ox: 0, oy: 44, shadow: 0 };
}
