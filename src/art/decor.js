// Small things that make a place look lived in, painted in code (0.9.2): candles, the cold Lume braziers of Velmoor,
// clay pots with flowers, grain sacks, baskets, stumps and mushrooms; and marks painted straight onto the ground
// (pebbles, fallen leaves, flowers, twigs, puddles, moss between cobbles). Standing things follow the rest of the
// art: lit from the top left, hard ramps with ordered dither, a dark outline. Ground marks have no outline, like the
// ground itself.
import { PixBuf, Rng, ramp, rampAt, vnoise, clamp } from "../util.js";
import { RAMP } from "./props.js";
import { IRAMP } from "./interiors.js";

const INK = [24, 18, 30];
export const DRAMP = {
  wax: ramp("#8a7458", "#b89c74", "#dcc8a0", "#f2e6c8", "#fffaea"),
  clay: ramp("#3e1a14", "#66281a", "#8e3c22", "#b45a30", "#d27e46", "#e8a464"),
  burlap: ramp("#4a3620", "#6e5432", "#927448", "#b49660", "#d2b67e"),
  wicker: ramp("#3a2414", "#5e3a1c", "#86562a", "#ae783a", "#d09c52"),
  apple: ramp("#4a0e14", "#7a1a1c", "#a8302a", "#d0563a", "#f08858"),
  fish: ramp("#3c4a5a", "#627486", "#8ca0b0", "#bccad2", "#e8f0f2"),
  cap: [ramp("#4a1010", "#7a1c18", "#a8321e", "#d0502a", "#ec7a3e"), ramp("#3a2414", "#5a3a20", "#7e5630", "#a07444", "#c49660")],
  flame: [[255, 150, 60], [255, 210, 110], [255, 246, 214]],
  petal: [ramp("#7a2a5a", "#b04a86", "#e07ab4", "#ffb4dc"), ramp("#6a5a1a", "#a8901e", "#e0c43a", "#fff07a"), ramp("#3a3a8a", "#5a62c0", "#8c9ae6", "#c4ceff"), ramp("#8a8a90", "#c0c0c8", "#e8e8ee", "#ffffff"), ramp("#8a2a1a", "#c0442a", "#ec6a3a", "#ffa070")],
};

const TOP_BRONZE = ramp("#3a2410", "#6a4418", "#9a6a24", "#c8963a", "#ecc66a");

/** A shaded ellipsoid: lit from the top left, darker at the bottom right, on the ramp R. */
function blob(pb, cx, cy, rx, ry, R, { tex = 0.08, seed = 1, b = 0 } = {}) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x - cx) / rx, dy = (y - cy) / ry, q = dx * dx + dy * dy;
      if (q > 1) continue;
      const z = Math.sqrt(1 - q);
      let v = (-dx * 0.5 - dy * 0.6 + z * 0.55) * 0.55 + 0.42 + b + (vnoise(x / 2.5, y / 2.5, seed) - 0.5) * tex * 2;
      if (dy > 0.72) v -= 0.14;
      pb.set(x, y, rampAt(R, clamp(v), x, y));
    }
}

/** A small flame seen from above-front: orange, then yellow, then a white heart. */
function flame(pb, x, y, h = 3) {
  const [o, yv, w] = DRAMP.flame;
  for (let i = 0; i < h; i++) pb.set(x, y - i, i === h - 1 ? o : yv);
  pb.set(x, y, w);
  if (h > 2) { pb.set(x - 1, y, o); pb.set(x + 1, y, o); }
}

// ---------------------------------------------------------------- standing things

/** Three candles of different heights on a bronze dish, stuck with old wax. Its light comes from the world (decor.js). */
export function makeCandles(seed = 1) {
  const R = new Rng(seed), pb = new PixBuf(18, 24), Wx = DRAMP.wax;
  for (let x = 3; x <= 15; x++) for (let y = 19; y <= 22; y++) if (((x - 9) / 6.5) ** 2 + ((y - 20.5) / 2.2) ** 2 <= 1) pb.set(x, y, rampAt(TOP_BRONZE, 0.75 - (y - 19) * 0.18 - (x - 9) * 0.03, x, y));
  const hs = [R.int(9, 13), R.int(5, 8), R.int(7, 10)], xs = [6, 10, 13];
  hs.forEach((h, k) => {
    const cx = xs[k], base = 20 - (k === 1 ? -1 : 0);
    for (let y = base - h; y <= base; y++)
      for (let x = cx - 1; x <= cx + 1; x++) {
        let v = 0.82 - (x - cx + 1) * 0.22 - (y === base - h ? -0.12 : 0);
        if (x === cx - 1 && y > base - h + 2 && R.chance(0.25)) v += 0.12; // a drip of wax
        pb.set(x, y, rampAt(Wx, clamp(v), x, y));
      }
    pb.set(cx, base - h - 1, INK);
    flame(pb, cx, base - h - 2, 3);
  });
  pb.outline(INK);
  return { c: pb.canvas(), ox: 9, oy: 22, shadow: 6 };
}

/** A Velmoor brazier: a white marble stem holding a shallow bowl, and in it a Lume's cold blue flame. */
export function makeBrazier() {
  const W = 22, H = 40, pb = new PixBuf(W, H), M = IRAMP.marble, Lm = IRAMP.lume;
  // the foot
  for (let y = 34; y <= 38; y++) for (let x = 4; x <= 17; x++) if (((x - 10.5) / 7) ** 2 + ((y - 36) / 2.6) ** 2 <= 1) pb.set(x, y, rampAt(M, 0.7 - (y - 34) * 0.1 - (x - 10.5) * 0.02, x, y));
  // the stem: lit on its left
  for (let y = 16; y <= 35; y++) for (let x = 8; x <= 13; x++) {
    let v = 0.85 - (x - 8) * 0.12;
    if (y % 7 === 0) v -= 0.18; // a carved ring
    pb.set(x, y, rampAt(M, clamp(v), x, y));
  }
  // the bowl: a wide ellipse, its rim lit, its hollow dark
  for (let y = 9; y <= 18; y++) for (let x = 1; x <= 20; x++) {
    const q = ((x - 10.5) / 9.6) ** 2 + ((y - 12.5) / 4.2) ** 2;
    if (q > 1) continue;
    const inner = ((x - 10.5) / 7.6) ** 2 + ((y - 11.6) / 2.6) ** 2 <= 1;
    let v = inner ? 0.12 : 0.78 - (x - 10.5) * 0.03 - (y > 13 ? 0.3 : 0);
    pb.set(x, y, rampAt(M, clamp(v), x, y));
  }
  // the flame: a leaf of cold light rising out of the bowl
  for (let y = 0; y <= 12; y++) {
    const k = y / 12, hw = Math.sin(k * Math.PI * 0.9) * 4.2;
    for (let x = Math.floor(10.5 - hw); x <= Math.ceil(10.5 + hw); x++) {
      const v = 0.95 - Math.abs(x - 10.5) / (hw + 0.5) * 0.55 - (1 - k) * 0.15;
      pb.set(x, y, rampAt(Lm, clamp(v), x, y));
    }
  }
  pb.set(10, 8, [255, 255, 255]); pb.set(11, 9, [255, 255, 255]);
  pb.outline(INK);
  return { c: pb.canvas(), ox: 11, oy: 37, shadow: 8 };
}

/** A clay pot with something flowering in it. */
export function makePot(seed = 1) {
  const R = new Rng(seed), pb = new PixBuf(20, 26), C = DRAMP.clay, P = DRAMP.petal[seed % DRAMP.petal.length];
  // the pot: narrow at the foot, a rolled rim
  for (let y = 13; y <= 24; y++) {
    const k = (y - 13) / 11, hw = 6.5 - k * 2.2;
    for (let x = Math.floor(10 - hw); x <= Math.ceil(10 + hw); x++) {
      const u = (x - 10 + hw) / (hw * 2);
      pb.set(x, y, rampAt(C, clamp(0.85 - u * 0.75 - k * 0.1), x, y));
    }
  }
  for (let x = 2; x <= 18; x++) for (let y = 11; y <= 14; y++) if (((x - 10) / 8) ** 2 + ((y - 12.5) / 2) ** 2 <= 1) pb.set(x, y, rampAt(C, y < 12.5 ? 0.95 : 0.55, x, y));
  for (let x = 4; x <= 16; x++) if (((x - 10) / 6) ** 2 <= 1) pb.set(x, 12, rampAt(RAMP.bark, 0.2, x, 12)); // earth
  // leaves, then flowers on top
  for (let i = 0; i < 9; i++) { const x = R.int(4, 16), y = R.int(4, 12); blob(pb, x, y, 2.2, 1.6, RAMP.leaf, { seed: i, b: 0.05 }); }
  for (let i = 0; i < 5; i++) {
    const x = R.int(5, 15), y = R.int(2, 9);
    pb.set(x, y, rampAt(P, 0.95, x, y)); pb.set(x - 1, y, P[2]); pb.set(x + 1, y, P[1]); pb.set(x, y - 1, P[3]); pb.set(x, y + 1, P[1]);
    pb.set(x, y, [255, 230, 120]);
  }
  pb.outline(INK);
  return { c: pb.canvas(), ox: 10, oy: 24, shadow: 7 };
}

/** Two or three grain sacks leaning on each other, tied at the top. */
export function makeSacks(seed = 1) {
  const R = new Rng(seed), n = 2 + (seed % 2), pb = new PixBuf(30, 24), B = DRAMP.burlap;
  for (let i = 0; i < n; i++) {
    const cx = 8 + i * (n === 3 ? 7 : 12) + R.int(-1, 1), cy = 15 - (i === 1 ? 2 : 0);
    blob(pb, cx, cy, 6, 7, B, { tex: 0.12, seed: seed + i });
    blob(pb, cx, cy - 7, 2.6, 2, B, { b: 0.08 }); // the gathered neck
    pb.set(cx, cy - 6, B[0]); pb.set(cx - 1, cy - 6, B[0]);
    for (let y = cy - 2; y <= cy + 4; y += 3) pb.set(cx + 2, y, B[1]); // a seam
  }
  pb.outline(INK);
  return { c: pb.canvas(), ox: 15, oy: 22, shadow: 12 };
}

/** A round wicker basket, full: apples, or the day's fish. */
export function makeBasket(seed = 1) {
  const fish = seed % 2 === 0, pb = new PixBuf(22, 18), Wk = DRAMP.wicker;
  for (let y = 7; y <= 16; y++) for (let x = 1; x <= 20; x++) {
    const q = ((x - 10.5) / 9.5) ** 2 + ((y - 11) / 5.5) ** 2;
    if (q > 1 || y < 9) continue;
    let v = 0.7 - (x - 10.5) * 0.025 - (y - 9) * 0.04 + ((x + (y >> 1)) % 3 === 0 ? -0.18 : 0);
    pb.set(x, y, rampAt(Wk, clamp(v), x, y));
  }
  for (let x = 1; x <= 20; x++) for (let y = 6; y <= 11; y++) if (((x - 10.5) / 9.5) ** 2 + ((y - 8.5) / 2.5) ** 2 <= 1 && !(((x - 10.5) / 8) ** 2 + ((y - 8.5) / 1.5) ** 2 <= 1)) pb.set(x, y, rampAt(Wk, 0.85, x, y));
  const R = new Rng(seed + 9);
  if (fish) for (let i = 0; i < 4; i++) { const y = 6 + i, x0 = R.int(4, 7); for (let x = x0; x < x0 + 10; x++) pb.set(x, y, rampAt(DRAMP.fish, 0.9 - i * 0.12 - (x - x0) * 0.03, x, y)); pb.set(x0 + 10, y, DRAMP.fish[1]); pb.set(x0 + 1, y, INK); }
  else for (let i = 0; i < 6; i++) blob(pb, R.int(5, 16), R.int(5, 8), 2.4, 2.2, DRAMP.apple, { b: 0.08, seed: i });
  pb.outline(INK);
  return { c: pb.canvas(), ox: 11, oy: 16, shadow: 9 };
}

/** A sawn stump: bark around, the rings on top. */
export function makeStump(seed = 1) {
  const R = new Rng(seed), pb = new PixBuf(26, 20), Bk = RAMP.bark, Wd = RAMP.wood;
  for (let y = 6; y <= 17; y++) for (let x = 3; x <= 22; x++) {
    const flare = y > 13 ? (y - 13) * 0.9 : 0;
    if (x < 5 - flare || x > 20 + flare) continue;
    let v = 0.7 - (x - 5) / 16 * 0.6 + (x % 3 === 0 ? -0.15 : 0) + (vnoise(x, y / 3, seed) - 0.5) * 0.2;
    pb.set(x, y, rampAt(Bk, clamp(v), x, y));
  }
  for (let y = 3; y <= 9; y++) for (let x = 5; x <= 20; x++) {
    const d = Math.hypot((x - 12.5) / 7.6, (y - 6) / 3.2);
    if (d > 1) continue;
    let v = 0.78 - (Math.round(d * 4) % 2 ? 0.18 : 0) - (x - 12.5) * 0.015;
    if (d > 0.86) v = 0.35;
    pb.set(x, y, rampAt(Wd, clamp(v), x, y));
  }
  if (R.chance(0.6)) blob(pb, R.chance(0.5) ? 6 : 19, 14, 2.6, 2, RAMP.moss, { b: 0.05 });
  pb.outline(INK);
  return { c: pb.canvas(), ox: 13, oy: 17, shadow: 10 };
}

/** A few mushrooms in the moss: red caps with white spots, or plain brown ones. */
export function makeMushrooms(seed = 1) {
  const R = new Rng(seed), pb = new PixBuf(16, 14), C = DRAMP.cap[seed % 2];
  const n = 2 + (seed % 3);
  for (let i = 0; i < n; i++) {
    const x = 4 + i * 4 + R.int(-1, 1), h = R.int(2, 5), y = 12;
    for (let j = 0; j < h; j++) { pb.set(x, y - j, DRAMP.wax[3]); pb.set(x + 1, y - j, DRAMP.wax[2]); }
    blob(pb, x + 0.5, y - h - 1, 2.8, 1.8, C, { b: 0.05, seed: i });
    if (seed % 2 === 0) { pb.set(x - 1, y - h - 2, [250, 244, 230]); pb.set(x + 2, y - h - 1, [250, 244, 230]); }
  }
  pb.outline(INK);
  return { c: pb.canvas(), ox: 8, oy: 12, shadow: 4 };
}

// ---------------------------------------------------------------- marks on the ground

/** Paint one ground mark into a 2D context at (x, y) (its middle). Deterministic by seed; no outline. */
export function paintDecal(ctx, kind, x, y, seed) {
  const R = new Rng(seed * 7 + 3), set = (px, py, c, a = 1) => { ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${a})`; ctx.fillRect(Math.round(x + px), Math.round(y + py), 1, 1); };
  if (kind === "pebbles") {
    const S = RAMP.stone;
    for (let i = 0, n = R.int(2, 4); i < n; i++) {
      const px = R.int(-5, 5), py = R.int(-3, 3), w = R.int(1, 3);
      for (let k = 0; k < w; k++) { set(px + k, py, S[k === 0 ? 4 : 3]); set(px + k, py + 1, S[1], 0.8); }
      if (w > 1) set(px, py - 1, S[5]);
    }
  } else if (kind === "stones") {
    // stepping stones in shallow water: rounded, wet-dark below, a bright wet glint on top
    const S = RAMP.stone;
    for (let i = 0, n = R.int(1, 2); i < n; i++) {
      const px = R.int(-4, 4), py = R.int(-2, 2), rx = R.int(3, 5), ry = Math.max(2, Math.round(rx * 0.6));
      for (let yy = -ry; yy <= ry + 1; yy++) for (let xx = -rx; xx <= rx; xx++) {
        const q = (xx / rx) ** 2 + (yy / ry) ** 2;
        if (yy === ry + 1) { if (Math.abs(xx) < rx - 1) set(px + xx, py + yy, [170, 220, 220], 0.7); continue; } // a ripple of foam below
        if (q > 1) continue;
        set(px + xx, py + yy, S[q > 0.7 ? 1 : xx + yy < -1 ? 4 : yy > 0 ? 2 : 3]);
      }
      set(px - 1, py - ry + 1, S[5]); set(px, py - ry + 1, S[5]);
    }
  } else if (kind === "leaves") {
    const A = RAMP.autumn;
    for (let i = 0, n = R.int(3, 6); i < n; i++) {
      const px = R.int(-7, 7), py = R.int(-4, 4), c = A[R.int(2, 5)];
      set(px, py, c); set(px + 1, py, A[Math.max(1, A.indexOf(c) - 1)]); if (R.chance(0.5)) set(px, py - 1, A[5]);
    }
  } else if (kind === "flowers") {
    const P = DRAMP.petal[seed % DRAMP.petal.length], L = RAMP.leaf;
    for (let i = 0, n = R.int(3, 6); i < n; i++) {
      const px = R.int(-6, 6), py = R.int(-3, 3);
      set(px, py + 1, L[2]); set(px, py + 2, L[1]);
      set(px, py, P[3]); set(px - 1, py, P[2]); set(px + 1, py, P[1]); set(px, py - 1, P[2]);
      set(px, py, [255, 226, 110]);
    }
  } else if (kind === "twigs") {
    const B = RAMP.bark;
    for (let i = 0, n = R.int(1, 2); i < n; i++) {
      const px = R.int(-5, 3), py = R.int(-3, 3), len = R.int(4, 8), dy = R.chance(0.5) ? 1 : -1;
      for (let k = 0; k < len; k++) set(px + k, py + Math.floor((k * dy) / 3), B[k % 3 === 0 ? 4 : 3]);
    }
  } else if (kind === "puddle") {
    const Wt = [[52, 60, 72], [70, 86, 102], [96, 118, 132], [158, 182, 192]], rx = R.int(4, 8), ry = Math.max(2, rx * 0.4);
    for (let py = -Math.ceil(ry); py <= ry; py++) for (let px = -rx; px <= rx; px++) {
      const q = (px / rx) ** 2 + (py / ry) ** 2 + (vnoise(px / 3, py / 2, seed) - 0.5) * 0.5;
      if (q > 1) continue;
      set(px, py, q > 0.75 ? Wt[0] : py < -ry * 0.3 ? Wt[2] : Wt[1]);
    }
    for (let k = -2; k <= 1; k++) set(k - Math.round(rx / 3), -Math.round(ry / 2), Wt[3]); // the sky in it
  } else if (kind === "moss") {
    const M = RAMP.moss;
    for (let i = 0, n = R.int(4, 9); i < n; i++) { const px = R.int(-5, 5), py = R.int(-2, 2); set(px, py, M[R.int(0, 3)]); }
  } else if (kind === "straw") {
    const C = RAMP.canvasT;
    for (let i = 0, n = R.int(4, 8); i < n; i++) { const px = R.int(-7, 6), py = R.int(-3, 3); set(px, py, C[R.int(2, 4)]); set(px + 1, py + (R.chance(0.5) ? 0 : 1), C[3]); }
  } else if (kind === "wax") {
    for (let i = 0, n = R.int(2, 4); i < n; i++) { const px = R.int(-4, 4), py = R.int(-2, 2); set(px, py, DRAMP.wax[3]); set(px + 1, py, DRAMP.wax[2]); }
  }
}
