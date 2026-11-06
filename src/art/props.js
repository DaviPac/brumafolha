// Props, painted in code: trees, pines, dead trees, rocks, bushes, ferns, ruins, camp things, the dock posts.
// Everything is lit from the top left, stepped through hard ramps with ordered dithering, and outlined dark.
import { PixBuf, Rng, ramp, rampAt, vnoise, fbm, hash2, clamp, makeCanvas } from "../util.js";

const INK = [24, 18, 30];
const L = (() => { const v = [-0.55, -0.65, 0.55], n = Math.hypot(...v); return v.map((a) => a / n); })();

export const RAMP = {
  leaf: ramp("#16301c", "#1f4522", "#2c5f28", "#3f7a2e", "#5a9a36", "#7cb840", "#a3d052"),
  leafDark: ramp("#121f22", "#172d2a", "#1f3f30", "#2a5436", "#386a3c", "#4f8444"),
  autumn: ramp("#3a1418", "#5c1f1c", "#8a3220", "#b44f24", "#d8782e", "#f0a640"),
  bark: ramp("#22111a", "#381b22", "#52282c", "#6c3834", "#8a4c40"),
  barkDead: ramp("#1c0f1e", "#2e1830", "#47223e", "#62304a", "#7c4258"),
  stone: ramp("#262a30", "#383e44", "#4c5458", "#636c6c", "#7e8882", "#a0a89c"),
  moss: ramp("#2c4a22", "#3f6a2a", "#5a8a32", "#7aa83c"),
  wood: ramp("#3a1e14", "#5a2e1c", "#7e4426", "#a35e32", "#c67c42", "#e0a058"),
  cloth: [ramp("#3a1c26", "#5e2a32", "#8a3c3c", "#b0564a", "#cc7a5e"), ramp("#1c2a3e", "#284060", "#36587e", "#4c76a0", "#6e98bc")],
  canvasT: ramp("#5a4a36", "#7e6a4c", "#a08a62", "#c0aa7c", "#dccaa0"),
  bone: ramp("#5a5244", "#8a806a", "#bcb298", "#e8e0c8"),
};

/** Shade a set of spheres into a buffer: the nearest sphere at each pixel wins, lit by its normal. */
function spheres(pb, list, R, opt = {}) {
  const { tex = 0.18, texScale = 3, seed = 1, rim = true } = opt;
  for (let y = 0; y < pb.h; y++)
    for (let x = 0; x < pb.w; x++) {
      let best = null, bz = -1e9;
      for (const s of list) {
        const dx = (x - s.x) / s.r, dy = (y - s.y) / (s.r * (s.sy ?? 1));
        const q = dx * dx + dy * dy;
        if (q > 1) continue;
        const z = Math.sqrt(1 - q);
        const zz = s.y + z * s.r * 0.6 + (s.z ?? 0);
        if (zz > bz) { bz = zz; best = { s, dx, dy, z }; }
      }
      if (!best) continue;
      const { s, dx, dy, z } = best;
      let v = (dx * L[0] + dy * L[1] + z * L[2]) * 0.55 + 0.42 + (s.b ?? 0);
      v += (vnoise(x / texScale, y / texScale, seed) - 0.5) * tex * 2;
      if (rim && dy > 0.7) v -= 0.15;
      pb.set(x, y, rampAt(s.ramp, clamp(v), x, y));
    }
}

function leafCanopy(pb, R, cx, cy, rx, ry, rp, n) {
  const list = [];
  for (let i = 0; i < n; i++) {
    const a = R.range(0, Math.PI * 2), d = Math.sqrt(R.next());
    const r = R.range(0.32, 0.5) * Math.min(rx, ry) * 1.2;
    list.push({ x: cx + Math.cos(a) * d * (rx - r * 0.7), y: cy + Math.sin(a) * d * (ry - r * 0.7), r, sy: 0.85, ramp: rp, b: R.range(-0.05, 0.08) });
  }
  list.push({ x: cx, y: cy - ry * 0.1, r: Math.min(rx, ry) * 0.75, sy: 0.85, ramp: rp, b: 0.05 });
  spheres(pb, list, R, { tex: 0.22, texScale: 2.2, seed: R.int(1, 999) });
  // leaf clumps: tiny highlight and shadow specks, the texture of foliage
  for (let k = 0; k < rx * ry * 0.5; k++) {
    const x = R.int(0, pb.w - 1), y = R.int(0, pb.h - 1);
    if (pb.alpha(x, y) < 200 || pb.alpha(x, y - 2) < 200) continue;
    const up = y < cy - ry * 0.1 + (x - cx) * 0.3;
    pb.set(x, y, rp[up ? rp.length - 1 : 1]);
    pb.set(x + 1, y, rp[up ? rp.length - 2 : 0]);
    if (up) pb.set(x, y + 1, rp[rp.length - 3]);
  }
}

function trunk(pb, R, cx, base, w, h, rp) {
  // roots flare out at the base
  for (let y = base - h; y <= base; y++) {
    const t = (y - (base - h)) / h;
    const flare = t > 0.7 ? ((t - 0.7) / 0.3) ** 2 * w * 0.9 : 0;
    const hw = w / 2 + flare + Math.sin(y * 0.5) * 0.4;
    for (let x = Math.floor(cx - hw); x <= Math.ceil(cx + hw); x++) {
      const u = (x - (cx - hw)) / (2 * hw);
      let v = 0.85 - u * 0.75 + (vnoise(x / 1.5, y / 6, 3) - 0.5) * 0.4;
      if (hash2(x, Math.floor(y / 4), 7) > 0.9) v -= 0.3; // bark furrows
      pb.set(x, y, rampAt(rp, clamp(v), x, y));
    }
  }
}

export function makeTree(seed) {
  const R = new Rng(seed), W = 100, H = 118;
  const pb = new PixBuf(W, H);
  const autumn = R.chance(0.1);
  trunk(pb, R, 50, 112, R.range(9, 13), 44, RAMP.bark);
  leafCanopy(pb, R, 50, 46, R.range(36, 44), R.range(30, 36), autumn ? RAMP.autumn : RAMP.leaf, R.int(9, 13));
  pb.outline(INK);
  return { c: pb.canvas(), ox: 50, oy: 112, canopy: { x: 6, y: 6, w: 88, h: 80 }, shadow: 34 };
}

export function makePine(seed) {
  const R = new Rng(seed), W = 64, H = 112;
  const pb = new PixBuf(W, H);
  trunk(pb, R, 32, 106, 7, 22, RAMP.bark);
  const tiers = R.int(4, 5);
  for (let t = 0; t < tiers; t++) {
    const top = 6 + t * 17, bot = top + 34, hw = 9 + t * 5.5;
    for (let y = top; y < bot; y++) {
      const k = (y - top) / (bot - top);
      const half = hw * Math.pow(k, 0.8) + Math.sin(y * 1.3 + t) * 1.2;
      for (let x = Math.floor(32 - half); x <= Math.ceil(32 + half); x++) {
        const u = (x - 32) / Math.max(1, half);
        let v = 0.62 - u * 0.38 - k * 0.32 + (vnoise(x / 2, y / 2, t * 9 + seed) - 0.5) * 0.35;
        if (k > 0.88) v -= 0.25;
        pb.set(x, y, rampAt(RAMP.leafDark, clamp(v), x, y));
      }
    }
  }
  pb.outline(INK);
  return { c: pb.canvas(), ox: 32, oy: 106, canopy: { x: 4, y: 0, w: 56, h: 84 }, shadow: 22 };
}

export function makeDeadTree(seed) {
  const R = new Rng(seed), W = 96, H = 110;
  const pb = new PixBuf(W, H);
  const rp = RAMP.barkDead;
  const branch = (x, y, a, len, w, depth) => {
    for (let s = 0; s < len; s++) {
      const bx = x + Math.cos(a) * s, by = y + Math.sin(a) * s, ww = Math.max(1, w * (1 - s / len * 0.6));
      for (let j = -ww; j <= ww; j++)
        for (let i = -ww; i <= ww; i++) {
          if (i * i + j * j > ww * ww) continue;
          const v = 0.55 - (i + j) / (ww * 2.5) + (vnoise((bx + i) / 2, (by + j) / 2, 4) - 0.5) * 0.3;
          pb.set(bx + i, by + j, rampAt(rp, clamp(v), bx + i, by + j));
        }
      a += R.range(-0.08, 0.08);
    }
    if (depth <= 0) return;
    const ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len;
    const k = R.int(2, 3);
    for (let i = 0; i < k; i++) branch(ex, ey, a + R.range(-0.9, 0.9), len * R.range(0.55, 0.75), w * 0.6, depth - 1);
  };
  branch(48, 104, -Math.PI / 2 + R.range(-0.15, 0.15), 34, 5, 3);
  pb.outline(INK);
  return { c: pb.canvas(), ox: 48, oy: 104, canopy: { x: 0, y: 0, w: 96, h: 70 }, shadow: 16 };
}

export function makeRock(seed, wet = false) {
  const R = new Rng(seed), W = 30, H = 22;
  const pb = new PixBuf(W, H);
  const n = R.int(2, 4), list = [];
  for (let i = 0; i < n; i++) list.push({ x: 15 + R.range(-6, 6), y: 13 + R.range(-2, 2), r: R.range(5, 8.5), sy: 0.8, ramp: RAMP.stone, b: R.range(-0.05, 0.05) });
  spheres(pb, list, R, { tex: 0.25, texScale: 1.6, seed });
  if (!wet) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
    if (pb.alpha(x, y) && !pb.alpha(x, y - 2) === false && pb.alpha(x, y - 3) === 0 && fbm(x / 3, y / 3, seed, 2) > 0.45) pb.set(x, y, rampAt(RAMP.moss, 0.6, x, y));
  pb.outline(INK);
  if (wet) for (let x = 0; x < W; x++) for (let y = H - 1; y > 0; y--) if (pb.alpha(x, y)) { pb.set(x, y + 1, [150, 230, 220], 160); break; }
  return { c: pb.canvas(), ox: 15, oy: 19, shadow: 10 };
}

export function makeBush(seed) {
  const R = new Rng(seed), W = 40, H = 32;
  const pb = new PixBuf(W, H);
  const list = [];
  const n = R.int(4, 7);
  for (let i = 0; i < n; i++) list.push({ x: 20 + R.range(-10, 10), y: 19 + R.range(-5, 3), r: R.range(5, 9), sy: 0.85, ramp: RAMP.leaf, b: R.range(-0.05, 0.1) });
  spheres(pb, list, R, { tex: 0.35, texScale: 1.3, seed });
  for (let k = 0; k < 40; k++) { const x = R.int(2, W - 3), y = R.int(2, H - 3); if (pb.alpha(x, y) && !pb.alpha(x, y - 2)) { pb.set(x, y - 1, RAMP.leaf[5]); pb.set(x + 1, y - 2, RAMP.leaf[6]); } }
  if (R.chance(0.4)) {
    const berry = R.chance(0.5) ? ramp("#8a1e2a", "#e04a4a") : ramp("#4a2a8a", "#9a6ae0");
    for (let k = 0; k < 6; k++) { const x = R.int(6, 28), y = R.int(6, 20); if (pb.alpha(x, y) && pb.alpha(x, y + 1)) { pb.set(x, y, berry[1]); pb.set(x, y + 1, berry[0]); } }
  }
  pb.outline(INK);
  return { c: pb.canvas(), ox: 20, oy: 27, shadow: 13 };
}

export function makeFern(seed) {
  const R = new Rng(seed), W = 30, H = 22, pb = new PixBuf(W, H);
  const rp = RAMP.leaf;
  const fronds = R.int(5, 7);
  for (let f = 0; f < fronds; f++) {
    const a = -Math.PI / 2 + (f / (fronds - 1) - 0.5) * 2.6, len = R.range(8, 12);
    for (let s = 0; s < len; s++) {
      const bend = s * s * 0.012;
      const x = 15 + Math.cos(a) * s, y = 19 + Math.sin(a) * s + bend * 6;
      const v = 0.35 + (1 - s / len) * 0.1 + (Math.cos(a) < 0 ? 0.25 : 0);
      pb.set(x, y, rampAt(rp, v + 0.2, x, y));
      if (s > 2 && s % 2 === 0) { pb.set(x + Math.sin(a) * 2, y - Math.cos(a) * 2, rp[4]); pb.set(x - Math.sin(a) * 2, y + Math.cos(a) * 2, rp[2]); }
    }
  }
  pb.outline(INK);
  return { c: pb.canvas(), ox: 15, oy: 20, shadow: 0 };
}

/** Tall grass clump, a few sway frames. */
export function makeTallGrass(v) {
  const frames = [];
  const R0 = new Rng(v * 101 + 3);
  const blades = [];
  const big = v >= 3;
  const n = big ? 16 + R0.int(0, 6) : 7 + R0.int(0, 5);
  for (let i = 0; i < n; i++) {
    const u = R0.next();
    blades.push({ x: (big ? 3 : 4) + u * (big ? 22 : 12), h: R0.range(big ? 9 : 7, big ? 19 : 14) * (1 - Math.abs(u - 0.5) * 0.6), lean: (u - 0.5) * 1.1 + R0.range(-0.2, 0.2), c: R0.int(0, 2) });
  }
  const P = [ramp("#2b5a22", "#3f7a2a", "#5f9e34", "#86c040"), ramp("#2f5a24", "#4a8a2c", "#72b23a", "#a2d04c"), ramp("#5e5422", "#7e7030", "#a8963e", "#cdb85a")][v % 3];
  for (let f = 0; f < 4; f++) {
    const pb = new PixBuf(big ? 28 : 20, big ? 22 : 18);
    const sway = Math.sin((f / 4) * Math.PI * 2) * 1.2;
    for (const b of blades) {
      for (let s = 0; s < b.h; s++) {
        const k = s / b.h;
        const x = b.x + (b.lean * s) + sway * k * k;
        const y = (big ? 21 : 17) - s;
        pb.set(x, y, P[k > 0.75 ? 3 : k > 0.35 ? 2 : b.c === 0 ? 0 : 1]);
        if (k < 0.5) pb.set(x + 1, y, P[1]);
      }
    }
    frames.push(pb.canvas());
  }
  return { frames, ox: big ? 14 : 10, oy: big ? 21 : 17 };
}

export function makeWall(h, seed, broken) {
  const R = new Rng(seed), W = 32, faceH = h * 9, topH = 10, H = faceH + topH + 8;
  const pb = new PixBuf(W, H);
  const S = RAMP.stone;
  const jag = (x) => (broken ? Math.floor(vnoise(x / 4, 0, seed) * 6) : 0);
  for (let x = 0; x < W; x++) {
    const j = jag(x);
    // top face
    for (let y = j; y < topH; y++) {
      const v = 0.75 + (vnoise(x / 3, y / 3, seed) - 0.5) * 0.3 - (y === topH - 1 ? 0.2 : 0);
      pb.set(x, y + 8, rampAt(S, v, x, y));
    }
    // front face, brick courses
    for (let y = 0; y < faceH; y++) {
      const row = Math.floor(y / 9), off = (row & 1) * 8, lx = (x + off) % 16, ly = y % 9;
      let v = 0.42 + hash2(Math.floor((x + off) / 16), row, seed) * 0.2 - (y / faceH) * 0.15;
      if (ly === 0) v += 0.18;
      if (ly === 8 || lx === 0) v = 0.02;
      pb.set(x, y + topH + 8, rampAt(S, v, x, y));
    }
  }
  // moss creeping over the top and hanging down
  for (let x = 0; x < W; x++) {
    if (fbm(x / 5, seed, 3, 2) > 0.5) {
      const len = Math.floor(fbm(x / 3, seed, 8, 2) * 12);
      for (let y = jag(x); y < topH + len; y++) pb.set(x, y + 8, rampAt(RAMP.moss, 0.7 - y / 30, x, y));
    }
  }
  pb.outline(INK);
  return { c: pb.canvas(), ox: 0, oy: H - 1 };
}

export function makePillar(h, seed) {
  const W = 22, colH = 14 + h * 10, H = colH + 16, pb = new PixBuf(W, H);
  const S = RAMP.stone;
  for (let y = 0; y < colH; y++)
    for (let x = 3; x < 19; x++) {
      const u = (x - 3) / 16;
      let v = 0.8 - Math.abs(u - 0.3) * 1.1 + (vnoise(x / 2, y / 3, seed) - 0.5) * 0.2;
      if ((x - 3) % 4 === 0) v -= 0.12; // fluting
      pb.set(x, H - 4 - y, rampAt(S, clamp(v), x, y));
    }
  // broken top
  for (let x = 3; x < 19; x++) {
    const j = Math.floor(vnoise(x / 3, 1, seed) * 5);
    for (let y = 0; y < 5 + j; y++) pb.set(x, H - 4 - colH + y, rampAt(S, 0.85 - y * 0.05, x, y));
    for (let y = 0; y < j; y++) pb.set(x, H - 4 - colH - 1 + y, null);
  }
  // plinth
  for (let x = 0; x < W; x++) for (let y = 0; y < 5; y++) pb.set(x, H - 5 + y, rampAt(S, 0.6 - y * 0.12 - Math.abs(x - 8) * 0.01, x, y));
  for (let y = 0; y < colH; y++) if (fbm(y / 4, seed, 6, 2) > 0.55) pb.set(4 + (y % 3), H - 4 - y, RAMP.moss[2]);
  pb.outline(INK);
  return { c: pb.canvas(), ox: 11, oy: H - 1 };
}

export function makeRubble(seed) {
  const R = new Rng(seed), pb = new PixBuf(28, 16);
  const list = [];
  for (let i = 0; i < 4; i++) list.push({ x: R.range(6, 22), y: R.range(8, 11), r: R.range(2.5, 4.5), sy: 0.8, ramp: RAMP.stone });
  spheres(pb, list, R, { tex: 0.2, seed });
  pb.outline(INK);
  return { c: pb.canvas(), ox: 14, oy: 13 };
}

export function makeTent(colorIdx) {
  const W = 56, H = 46, pb = new PixBuf(W, H);
  const C = RAMP.cloth[colorIdx];
  for (let y = 0; y < 38; y++) {
    const half = 3 + y * 0.68;
    for (let x = Math.floor(28 - half); x <= Math.ceil(28 + half); x++) {
      const left = x < 28;
      let v = left ? 0.72 : 0.38;
      v += (vnoise(x / 3, y / 5, 2) - 0.5) * 0.15 - (y > 34 ? 0.15 : 0);
      if (Math.abs(x - 28) < 1) v = 0.15;
      pb.set(x, y + 4, rampAt(C, v, x, y));
    }
  }
  // the opening
  for (let y = 22; y < 38; y++) { const half = (y - 22) * 0.45; for (let x = Math.floor(28 - half); x <= Math.ceil(28 + half); x++) pb.set(x, y + 4, [30, 18, 22]); }
  // poles
  pb.set(28, 1, RAMP.wood[3]); pb.set(28, 2, RAMP.wood[3]); pb.set(28, 3, RAMP.wood[2]);
  pb.outline(INK);
  return { c: pb.canvas(), ox: 28, oy: 42, shadow: 26 };
}

export function makeLog() {
  const pb = new PixBuf(40, 14);
  for (let y = 2; y < 12; y++) for (let x = 4; x < 36; x++) {
    const v = 0.75 - (y - 2) / 10 * 0.6 + (vnoise(x / 4, y, 2) - 0.5) * 0.2;
    pb.set(x, y, rampAt(RAMP.wood, v, x, y));
  }
  for (let y = 2; y < 12; y++) for (let x = 0; x < 6; x++) {
    const q = ((x - 4) / 3) ** 2 + ((y - 7) / 5) ** 2;
    if (q <= 1) pb.set(x + 1, y, q > 0.5 ? RAMP.wood[4] : RAMP.wood[5]);
  }
  pb.outline(INK);
  return { c: pb.canvas(), ox: 20, oy: 12, shadow: 16 };
}

export function makeCrate() {
  const pb = new PixBuf(26, 28), Wd = RAMP.wood;
  for (let y = 0; y < 8; y++) for (let x = 1; x < 25; x++) pb.set(x, y + 1, rampAt(Wd, 0.85 - (x % 6 === 0 ? 0.3 : 0), x, y));
  for (let y = 0; y < 17; y++) for (let x = 1; x < 25; x++) {
    let v = 0.5 - y * 0.012 + (x % 6 === 0 ? -0.25 : 0);
    if (y === 0 || y === 16 || x === 1 || x === 24 || Math.abs(x - 1 - y * 1.4) < 1.2) v = 0.25;
    pb.set(x, y + 9, rampAt(Wd, v, x, y));
  }
  pb.outline(INK);
  return { c: pb.canvas(), ox: 13, oy: 26, shadow: 12 };
}

export function makeBarrel() {
  const pb = new PixBuf(22, 28), Wd = RAMP.wood;
  for (let y = 0; y < 22; y++) {
    const bulge = Math.sin((y / 21) * Math.PI) * 2;
    for (let x = Math.floor(3 - bulge); x <= Math.ceil(18 + bulge); x++) {
      const u = (x - 3 + bulge) / (15 + bulge * 2);
      let v = 0.8 - u * 0.7 + (x % 4 === 0 ? -0.1 : 0);
      if (y === 4 || y === 5 || y === 16 || y === 17) v = u < 0.4 ? 0.3 : 0.12;
      pb.set(x, y + 5, rampAt(Wd, clamp(v), x, y));
    }
  }
  for (let y = 0; y < 6; y++) for (let x = 3; x < 19; x++) if (((x - 10.5) / 8) ** 2 + ((y - 3) / 3) ** 2 <= 1) pb.set(x, y + 1, rampAt(Wd, y < 3 ? 0.9 : 0.6, x, y));
  pb.outline(INK);
  return { c: pb.canvas(), ox: 11, oy: 26, shadow: 10 };
}

export function makePost(h) {
  const W = 12, H = h + 16, pb = new PixBuf(W, H), Wd = RAMP.wood;
  for (let y = 4; y < H; y++) for (let x = 2; x < 10; x++) {
    const u = (x - 2) / 8;
    pb.set(x, y, rampAt(Wd, clamp(0.85 - u * 0.75 - (y > H - 4 ? 0.3 : 0)), x, y));
  }
  for (let y = 0; y < 6; y++) for (let x = 2; x < 10; x++) {
    const q = ((x - 5.5) / 4) ** 2 + ((y - 3.5) / 2.2) ** 2;
    if (q <= 1) pb.set(x, y + 1, q < 0.35 ? Wd[3] : q < 0.7 ? Wd[4] : Wd[5]);
  }
  pb.outline(INK);
  // waterline
  for (let x = 1; x < 11; x++) pb.set(x, H - 1, [170, 240, 228], 200);
  return { c: pb.canvas(), ox: 6, oy: H - 2 };
}

export function makeRowboat() {
  const W = 64, H = 28, pb = new PixBuf(W, H), Wd = RAMP.wood;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const q = ((x - 32) / 30) ** 2 + ((y - 12) / 10) ** 2;
    if (q > 1) continue;
    let v;
    if (q > 0.72) v = y < 12 ? 0.9 : 0.35;
    else v = 0.45 + (x % 8 === 0 ? -0.2 : 0) - y * 0.01;
    pb.set(x, y, rampAt(Wd, v, x, y));
  }
  for (let x = 18; x < 46; x += 12) for (let y = 5; y < 20; y++) if (((x - 32) / 30) ** 2 + ((y - 12) / 10) ** 2 < 0.7) pb.set(x, y, Wd[5]);
  pb.outline(INK);
  for (let x = 4; x < 60; x++) pb.set(x, 24, [180, 245, 232], 180);
  return { c: pb.canvas(), ox: 32, oy: 22 };
}

export function makeCampfireBase() {
  const pb = new PixBuf(34, 18);
  const R = new Rng(3);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2, x = 17 + Math.cos(a) * 12, y = 9 + Math.sin(a) * 5;
    const list = [{ x, y, r: 3.2, sy: 0.8, ramp: RAMP.stone }];
    const tmp = new PixBuf(34, 18);
    spheres(tmp, list, R, { tex: 0.2, seed: i });
    for (let yy = 0; yy < 18; yy++) for (let xx = 0; xx < 34; xx++) { const c = tmp.get(xx, yy); if (c) pb.set(xx, yy, c); }
  }
  for (let k = 0; k < 4; k++) for (let s = 0; s < 14; s++) {
    const a = (k / 4) * Math.PI + 0.3, x = 17 + Math.cos(a) * (s - 7), y = 9 + Math.sin(a) * (s - 7) * 0.4;
    pb.set(x, y, RAMP.wood[k % 2 ? 1 : 2]); pb.set(x, y + 1, RAMP.wood[0]);
  }
  for (let x = 13; x < 22; x++) pb.set(x, 9, [60, 24, 20]);
  pb.outline(INK);
  return { c: pb.canvas(), ox: 17, oy: 12 };
}

export function makeBanner() {
  const pb = new PixBuf(24, 56);
  for (let y = 2; y < 56; y++) { pb.set(11, y, RAMP.wood[2]); pb.set(12, y, RAMP.wood[1]); }
  const C = ramp("#2a2a1a", "#4a4a22", "#6a6a2a", "#8a8a34");
  for (let y = 6; y < 30; y++) for (let x = 13; x < 23; x++) {
    if (y > 24 && (x + y) % 3 === 0) continue;
    pb.set(x, y, rampAt(C, 0.55 + Math.sin(x * 0.8 + y * 0.2) * 0.2, x, y));
  }
  // a crude red skull mark
  const R2 = ramp("#6a1a1a", "#b0302a");
  for (const [x, y] of [[16, 12], [17, 12], [18, 12], [19, 12], [15, 13], [16, 13], [19, 13], [20, 13], [16, 14], [17, 14], [18, 14], [19, 14], [17, 16], [18, 16]]) pb.set(x, y, R2[1]);
  pb.outline(INK);
  return { c: pb.canvas(), ox: 12, oy: 54, shadow: 6 };
}

export function makeBones(seed) {
  const R = new Rng(seed), pb = new PixBuf(24, 14);
  for (let k = 0; k < 3; k++) {
    const a = R.range(0, Math.PI), x0 = 12 + R.range(-5, 5), y0 = 7 + R.range(-2, 2);
    for (let s = -4; s <= 4; s++) pb.set(x0 + Math.cos(a) * s, y0 + Math.sin(a) * s * 0.5, RAMP.bone[2]);
    pb.set(x0 + Math.cos(a) * 5, y0 + Math.sin(a) * 2.5, RAMP.bone[3]);
    pb.set(x0 - Math.cos(a) * 5, y0 - Math.sin(a) * 2.5, RAMP.bone[3]);
  }
  pb.outline([40, 34, 30]);
  return { c: pb.canvas(), ox: 12, oy: 10 };
}

export function makeChest(open) {
  const pb = new PixBuf(26, 24), Wd = RAMP.wood, G = ramp("#6a4a10", "#c4901c", "#f4d050");
  for (let y = 0; y < 12; y++) for (let x = 1; x < 25; x++) {
    let v = 0.55 - y * 0.03;
    if (x === 1 || x === 24 || x === 12 || x === 13) v = 0.2;
    pb.set(x, y + 11, rampAt(Wd, v, x, y));
  }
  if (!open) {
    for (let y = 0; y < 9; y++) for (let x = 1; x < 25; x++) pb.set(x, y + 3, rampAt(Wd, 0.85 - y * 0.06, x, y));
    for (let x = 1; x < 25; x++) pb.set(x, 11, G[0]);
    pb.rect(11, 10, 4, 4, G[1]); pb.set(12, 11, G[2]);
  } else {
    for (let y = 0; y < 6; y++) for (let x = 1; x < 25; x++) pb.set(x, y + 1, rampAt(Wd, 0.4, x, y));
    for (let x = 3; x < 23; x++) pb.set(x, 11, [30, 16, 14]);
    for (let x = 4; x < 22; x += 3) pb.set(x, 12, G[2]);
  }
  pb.outline(INK);
  return { c: pb.canvas(), ox: 13, oy: 22, shadow: 12 };
}

/** A soft dithered ellipse that goes under everything standing on the ground. */
export function makeShadow(rx) {
  const ry = Math.max(2, rx * 0.42), W = Math.ceil(rx * 2 + 2), H = Math.ceil(ry * 2 + 2);
  const [c, ctx] = makeCanvas(W, H);
  const img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const q = ((x - W / 2 + 0.5) / rx) ** 2 + ((y - H / 2 + 0.5) / ry) ** 2;
    if (q > 1) continue;
    const j = (y * W + x) * 4;
    img.data[j] = 14; img.data[j + 1] = 24; img.data[j + 2] = 20;
    img.data[j + 3] = q < 0.55 ? 110 : 70;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
