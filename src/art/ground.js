// The ground, painted once per pixel: grass, dry meadow, dirt road, ruin flagstones, water, the dock.
import { TILE, fbm, vnoise, hash2, bayer, ramp, rampAt, Rng, clamp } from "../util.js";
import { MW, MH, T, waterField, pathField, stoneField, lushField, DOCK } from "../world.js";

export const PAL = {
  grass: ramp("#2b5226", "#38702b", "#4a8a30", "#5fa335", "#7bba3c", "#9bcf4a"),
  dry: ramp("#6e5f2a", "#857436", "#9c8a42", "#b39e4e", "#c8b35c"),
  dirt: ramp("#5e4228", "#755634", "#8c6a40", "#a07d4c", "#b5925a"),
  stone: ramp("#3d403f", "#4f5450", "#62685f", "#777d70", "#8d9383"),
  water: ramp("#1f6f8f", "#2788a2", "#33a3b0", "#4abcbb", "#6dd3c6"),
  wood: ramp("#6a3420", "#8e4a28", "#b4652f", "#d4833c", "#e8a052"),
  bank: ramp("#1f3d22", "#2a4d26"),
};

export function paintGround(W) {
  const w = MW * TILE, h = MH * TILE;
  const img = new ImageData(w, h), d = img.data;
  const lushAt = new Float32Array(w * h), wfAt = new Float32Array(w * h);
  // lushness is smooth: sample it every 4 px and interpolate
  const LS = 4, lw = w / LS + 1, lushGrid = new Float32Array(lw * (h / LS + 1));
  for (let gy = 0; gy <= h / LS; gy++) for (let gx = 0; gx < lw; gx++) lushGrid[gy * lw + gx] = lushField(gx * LS, gy * LS);
  const lushOf = (x, y) => {
    const gx = x / LS, gy = y / LS, xi = gx | 0, yi = gy | 0, u = gx - xi, v = gy - yi, k = yi * lw + xi;
    return (lushGrid[k] * (1 - u) + lushGrid[k + 1] * u) * (1 - v) + (lushGrid[k + lw] * (1 - u) + lushGrid[k + lw + 1] * u) * v;
  };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const wf = (wfAt[i] = waterField(x, y));
      let c;
      if (wf < 0) {
        const depth = clamp(-wf * 3.2);
        const v = 1 - depth + (vnoise(x / 14, y / 7, 2) - 0.5) * 0.25;
        c = rampAt(PAL.water, v, x, y);
      } else {
        const pf = pathField(x, y), sf = stoneField(x, y), lush = lushOf(x, y);
        lushAt[i] = lush;
        const base = fbm(x / 38, y / 38, 1, 3) * 0.7 + vnoise(x / 6, y / 6, 4) * 0.3;
        if (pf < 16) {
          c = rampAt(PAL.dirt, base * 0.9 + 0.15 - Math.max(0, pf - 10) * 0.03, x, y);
        } else if (sf > 0.35) {
          c = flagstone(x, y, sf);
        } else if (lush < 0.41) {
          c = rampAt(PAL.dry, base * 0.85 + 0.1, x, y);
        } else {
          c = rampAt(PAL.grass, base * 0.8 + (lush - 0.41) * 0.8 - (fbm(x / 70, y / 70, 41, 2) < 0.4 ? 0.18 : 0), x, y);
        }
        // grass overhangs the water as a dark lip
        if (wf < 0.035) c = PAL.bank[wf < 0.018 ? 0 : 1];
      }
      const j = i * 4;
      d[j] = c[0]; d[j + 1] = c[1]; d[j + 2] = c[2]; d[j + 3] = 255;
    }

  const set = (x, y, c) => {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const j = (y * w + x) * 4;
    d[j] = c[0]; d[j + 1] = c[1]; d[j + 2] = c[2];
  };
  const R = new Rng(99);

  // grass blades: little two-tone strokes, denser where it is lush
  for (let k = 0; k < 230000; k++) {
    const x = R.int(0, w - 1), y = R.int(2, h - 1);
    const tt = W.tileAt((x / TILE) | 0, (y / TILE) | 0);
    if (tt !== T.GRASS || wfAt[y * w + x] < 0.06) continue;
    const l = lushAt[y * w + x];
    const dry = l < 0.41;
    if (R.next() > (dry ? 0.35 : 0.85)) continue;
    const P = dry ? PAL.dry : PAL.grass;
    const hi = R.next() < 0.6;
    const top = hi ? P[Math.min(P.length - 1, 3 + R.int(0, 2))] : P[1];
    const bh = R.int(2, 4);
    const lean = R.chance(0.5) ? 1 : -1;
    set(x, y, P[0]);
    for (let s = 1; s <= bh; s++) set(x + (s > bh - 1 ? lean : 0), y - s, s === bh ? top : P[hi ? 3 : 2]);
    if (R.chance(0.45)) { set(x + 2, y, P[0]); set(x + 2, y - 1, P[2]); set(x + 2 + lean, y - 2, top); }
  }
  // flowers and mushrooms
  const FLOWERS = [ramp("#5b2c8f", "#8a4ccf", "#c99cff"), ramp("#8f1d2c", "#d13a3a", "#ff8a6a"), ramp("#a07a10", "#e8c03a", "#fff2a0"), ramp("#8a8aa8", "#e8e8f4", "#ffffff")];
  for (let k = 0; k < 2600; k++) {
    const cx = R.int(0, w - 1), cy = R.int(0, h - 1);
    if (W.tileAt((cx / TILE) | 0, (cy / TILE) | 0) !== T.GRASS || wfAt[cy * w + cx] < 0.08) continue;
    if (lushAt[cy * w + cx] < 0.45 && R.chance(0.7)) continue;
    const F = R.pick(FLOWERS), n = R.int(1, 4);
    for (let f = 0; f < n; f++) {
      const x = cx + R.int(-5, 5), y = cy + R.int(-4, 4);
      set(x, y + 1, PAL.grass[1]); set(x, y + 2, PAL.grass[1]);
      set(x, y, F[1]); set(x - 1, y, F[0]); set(x + 1, y, F[0]); set(x, y - 1, F[2]);
    }
  }
  // pebbles on the road
  for (let k = 0; k < 11000; k++) {
    const x = R.int(0, w - 1), y = R.int(0, h - 1);
    if (pathField(x, y) > 13) continue;
    set(x, y, PAL.dirt[4]); set(x + 1, y, PAL.dirt[3]); set(x, y + 1, PAL.dirt[0]); set(x + 1, y + 1, PAL.dirt[0]);
  }
  // lily pads
  const LILY = ramp("#4f8a2a", "#8cbf3a", "#b8dc54", "#e2f08a");
  for (let k = 0; k < 900; k++) {
    const x = R.int(0, w - 1), y = R.int(0, h - 1), wf = wfAt[y * w + x];
    if (wf > -0.04 || wf < -0.45) continue;
    const r = R.range(3, 6.5), rot = R.range(0, 6.28);
    for (let j = -r; j <= r; j++)
      for (let i = -r * 1.3; i <= r * 1.3; i++) {
        const q = (i / 1.3) ** 2 + j * j;
        if (q > r * r) continue;
        const a = Math.atan2(j, i / 1.3) - rot;
        if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.35) continue; // the notch
        const v = 1 - Math.sqrt(q) / r * 0.5 - (j / r) * 0.3;
        set(x + i, y + j, rampAt(LILY, v, x + i, y + j));
      }
    for (let i = -r * 1.3; i <= r * 1.3; i++) set(x + i, y + r + 1, PAL.water[0]);
    if (R.chance(0.2)) { const p = ramp("#c04a7a", "#f08ab0", "#ffd8e8"); set(x, y - 1, p[1]); set(x - 1, y, p[0]); set(x + 1, y, p[0]); set(x, y - 2, p[2]); }
  }

  paintDock(set, d, w);
  return img;
}

function flagstone(x, y, sf) {
  // irregular flagstones: a jittered Voronoi, bevelled from the top left, grass in the cracks
  const S = PAL.stone, C = 15;
  const gx = Math.floor(x / C), gy = Math.floor(y / C);
  let d1 = 1e9, d2 = 1e9, cid = 0, px = 0, py = 0;
  for (let j = -1; j <= 1; j++)
    for (let i = -1; i <= 1; i++) {
      const cx = (gx + i + 0.2 + hash2(gx + i, gy + j, 61) * 0.6) * C, cy = (gy + j + 0.2 + hash2(gx + i, gy + j, 62) * 0.6) * C;
      const d = Math.hypot(x - cx, (y - cy) * 1.15);
      if (d < d1) { d2 = d1; d1 = d; cid = (gx + i) * 7919 + (gy + j); px = cx; py = cy; } else if (d < d2) d2 = d;
    }
  const edge = d2 - d1;
  const moss = fbm(x / 18, y / 18, 13, 2);
  const gone = hash2(cid, 1, 8) < 0.16 || sf < 0.45 && hash2(cid, 2, 8) < 0.5;
  if (gone) return rampAt(PAL.grass, 0.25 + moss * 0.5, x, y);
  if (edge < 1.6) return moss > 0.5 ? PAL.grass[1] : S[0];
  let v = 0.42 + hash2(cid, 3, 9) * 0.3;
  const nx = (x - px) / C, ny = (y - py) / C;
  if (edge < 3.2) v += nx + ny < 0 ? 0.18 : -0.16; // bevel
  v += (vnoise(x / 3, y / 3, 14) - 0.5) * 0.2;
  if (moss > 0.64) return rampAt(PAL.grass, (moss - 0.6) * 2.5 + 0.2, x, y);
  return rampAt(S, v, x, y);
}

function paintDock(set, d, w) {
  const Wd = PAL.wood;
  const plank = (x0, y0, x1, y1) => {
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const px = x - x0, col = Math.floor(px / 7), lx = px % 7;
        const seed = col * 31 + Math.floor((y - y0 + hash2(col, 0, 5) * 40) / 46);
        let c;
        if (lx === 0) c = Wd[0];
        else {
          const grain = vnoise(x / 2, y / 9, seed) * 0.35;
          let v = 0.45 + hash2(seed, 1, 6) * 0.25 + grain - (lx === 6 ? 0.25 : 0) + (lx === 1 ? 0.2 : 0);
          // knots and worn spots
          if (hash2(Math.floor(x / 4), Math.floor(y / 5), seed) > 0.985) v = 0.05;
          c = rampAt(Wd, v, x, y);
        }
        // plank ends
        if ((y - y0 + Math.floor(hash2(col, 0, 5) * 40)) % 46 === 0) c = Wd[0];
        set(x, y, c);
      }
    // front face: the thickness of the boards
    for (let x = x0; x < x1; x++) {
      set(x, y1, Wd[1]); set(x, y1 + 1, Wd[1]); set(x, y1 + 2, Wd[0]);
      set(x, y1 + 3, [28, 60, 70]); set(x, y1 + 4, [30, 80, 95]);
    }
  };
  plank(DOCK.x0 * TILE, DOCK.y0 * TILE + 6, (DOCK.x1 + 1) * TILE + 4, (DOCK.y1 + 1) * TILE);
  plank(DOCK.pier.x0 * TILE + 4, DOCK.pier.y * TILE + 4, (DOCK.pier.x1 + 1) * TILE + 2, (DOCK.pier.y + 1) * TILE);
}

/** Shore and sparkle sample points, so the water can be animated cheaply. */
export function waterSparkles(W) {
  const out = [];
  const R = new Rng(5);
  for (let k = 0; k < 11000; k++) {
    const x = R.int(0, MW * TILE), y = R.int(0, MH * TILE), wf = waterField(x, y);
    if (wf > -0.02) continue;
    const tx = (x / TILE) | 0, ty = (y / TILE) | 0;
    if (W.tileAt(tx, ty) === T.DOCK) continue;
    out.push({ x, y, len: R.int(2, 6), ph: R.range(0, 1), sp: R.range(0.25, 0.6), edge: wf > -0.08 });
  }
  return out;
}
