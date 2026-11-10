// The prologue's new places, painted in code: the dreamed Velmoor (white avenue between towers) and the Relicário
// under the ruins (white marble floor, slate walls, relief faces). Plus their props, and a few new valley props
// (the forgotten doe, the goblins' loot, the trapdoor, the Velmoor marker stone).
import { TILE, PixBuf, Rng, ramp, rampAt, vnoise, fbm, hash2, clamp } from "../util.js";
import { buildCharacter, SW, SH } from "./chars.js";

const INK = [24, 18, 30];
export const IRAMP = {
  marble: ramp("#8e95a2", "#aab0bc", "#c4c9d2", "#dadde3", "#ebedf0", "#f7f8f9"),
  warm: ramp("#a8a294", "#c2bcae", "#d8d4c8", "#e8e6de", "#f4f3ee", "#fbfbf8"),
  slate: ramp("#10151c", "#161c25", "#1c232e", "#232c38", "#2c3644", "#3a4658"),
  roof: ramp("#6c7384", "#828a9c", "#9aa2b2", "#b2b9c6", "#c8ced8"),
  mist: ramp("#d6dbe4", "#e2e6ec", "#ecf0f4", "#f6f8fa"),
  lume: ramp("#3a5a8a", "#7aa8e0", "#c8e0ff", "#f4faff"),
  fawn: ramp("#3a2014", "#6a3e22", "#94603a", "#bc8656", "#dcb07c"),
  clay: ramp("#4a2018", "#7a3a24", "#a85a34", "#c8804a"),
  rope: ramp("#3a2a18", "#5e4628", "#86683c", "#aa8c54"),
};

// ---------------------------------------------------------------- the ground of a grid map
/** Irregular slabs: distance to the nearest and second-nearest jittered cell centre. */
function slab(x, y, size, seed) {
  const gx = Math.floor(x / size), gy = Math.floor(y / size);
  let d1 = 1e9, d2 = 1e9, id = 0;
  for (let j = -1; j <= 1; j++)
    for (let i = -1; i <= 1; i++) {
      const cx = gx + i, cy = gy + j;
      const px = (cx + 0.2 + hash2(cx, cy, seed) * 0.6) * size, py = (cy + 0.2 + hash2(cx, cy, seed + 1) * 0.6) * size;
      const d = Math.hypot((x - px) * 1.15, y - py);
      if (d < d1) { d2 = d1; d1 = d; id = cx * 7919 + cy; } else if (d < d2) d2 = d;
    }
  return { edge: d2 - d1, id };
}

/** Paint a grid map (W.T: tile kinds) into ImageData. `floor` is the floor ramp. */
export function paintInterior(W, K) {
  const w = W.w * TILE, h = W.h * TILE, img = new ImageData(w, h), d = img.data;
  const floorish = (t) => t === K.MARBLE || t === K.STAIRS;
  const R = W.floorRamp ?? IRAMP.marble, S = IRAMP.slate;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const tx = (x / TILE) | 0, ty = (y / TILE) | 0, lx = x - tx * TILE, ly = y - ty * TILE, t = W.tileAt(tx, ty);
      let c;
      if (t === K.MARBLE) {
        const s = slab(x, y, 22, 3);
        let v = 0.62 + hash2(s.id, 0, 9) * 0.22 + (vnoise(x / 9, y / 9, 4) - 0.5) * 0.12;
        const vein = Math.abs(fbm(x / 40, y / 26, 12, 3) - 0.5);
        if (vein < 0.01) v -= 0.22;
        if (s.edge < 1.3) v = 0.12; else if (s.edge < 2.4) v -= 0.12;
        // the walls cast a soft dark band onto the floor below them
        if (W.tileAt(tx, ty - 1) !== t && !floorish(W.tileAt(tx, ty - 1)) && ly < 6) v -= 0.25 - ly * 0.04;
        c = rampAt(R, clamp(v), x, y);
      } else if (t === K.STAIRS) {
        const step = (ly / 7) | 0, sy = ly % 7;
        let v = 0.8 - step * 0.17 - (sy === 6 ? 0.2 : sy === 0 ? -0.08 : 0);
        if (lx < 2 || lx > 29) v -= 0.25;
        c = rampAt(R, clamp(v), x, y);
      } else if (t === K.ROOF) {
        // slate roof seen from above: scalloped courses
        const row = (y / 6) | 0, off = row & 1 ? 4 : 0, sx = (x + off) % 8, sy = y % 6;
        let v = 0.55 + hash2((x + off) >> 3, row, 5) * 0.2 - sy * 0.06 + (sx === 0 ? -0.2 : 0);
        v += (fbm(x / 60, y / 60, 3, 2) - 0.5) * 0.4;
        c = rampAt(IRAMP.roof, clamp(v), x, y);
      } else if (t === K.MIST) {
        c = rampAt(IRAMP.mist, 0.4 + fbm(x / 30, y / 30, 8, 3) * 0.6, x, y);
      } else {
        // walls: a slate top, and a lit marble front face where the floor is below
        const below = W.tileAt(tx, ty + 1), relief = t === K.RELIEF;
        const face = floorish(below) && ly >= 12;
        if (face) {
          const fy = ly - 12;
          let v = 0.42 + (vnoise(x / 3, y / 6, 6) - 0.5) * 0.1 - fy * 0.008;
          if (!relief && x % 10 === 0) v -= 0.12;
          if (fy === 0) v = 0.8;
          if (fy >= 18) v = 0.12;
          if (relief) {
            // faceless people carved in a row: a head and shoulders every 10 px
            const k = ((x + 3) % 10) - 5, hy = fy - 6;
            if (k * k + hy * hy * 1.2 < 9) v = 0.72 - (k > 0 ? 0.1 : 0) - (hy > 1 ? 0.06 : 0);
            else if (fy > 10 && fy < 18 && Math.abs(k) < 4 + (fy - 10) * 0.3) v = 0.6 - (k > 1 ? 0.1 : 0);
          }
          c = rampAt(R, clamp(v), x, y);
        } else {
          let v = 0.35 + (fbm(x / 20, y / 20, 2, 3) - 0.5) * 0.5;
          // a lighter lip where the wall top meets a walkable tile
          const nb = (dx, dy) => floorish(W.tileAt(tx + dx, ty + dy));
          if ((nb(0, -1) && ly < 2) || (nb(-1, 0) && lx < 2) || (nb(1, 0) && lx > 29) || (nb(0, 1) && ly > 29)) v = 0.95;
          c = rampAt(S, clamp(v), x, y);
        }
      }
      const j = (y * w + x) * 4;
      d[j] = c[0]; d[j + 1] = c[1]; d[j + 2] = c[2]; d[j + 3] = 255;
    }
  return img;
}

// ---------------------------------------------------------------- dreamed Velmoor
/** A white tower: a lit top face over a tall front face with dark arched windows. */
export function makeTower(seed, h) {
  const R = new Rng(seed), W = 32, faceH = 34 + h * 20, topH = 12, roof = seed % 3 === 0 ? 18 : 0, H = faceH + topH + roof + 4;
  const pb = new PixBuf(W, H), M = IRAMP.warm, Sl = IRAMP.roof;
  const y0 = roof + 4;
  for (let x = 1; x < W - 1; x++) {
    const u = (x - 1) / (W - 2);
    for (let y = 0; y < topH; y++) pb.set(x, y0 + y, rampAt(M, clamp(0.85 - u * 0.25 - (y === topH - 1 ? 0.25 : 0)), x, y));
    for (let y = 0; y < faceH; y++) {
      let v = 0.66 - u * 0.4 + (vnoise(x / 4, y / 9, seed) - 0.5) * 0.08 + (y / faceH) * -0.12;
      if (y % 11 === 0) v -= 0.08;
      pb.set(x, y0 + topH + y, rampAt(M, clamp(v), x, y));
    }
  }
  // crenels along the top edge
  for (let x = 1; x < W - 1; x += 6) for (let i = 0; i < 3; i++) for (let y = 0; y < 3; y++) pb.set(x + i, y0 - 3 + y, M[4]);
  // windows: tall arched slits, dark inside with a faint cold light
  const rows = Math.max(1, Math.floor((faceH - 10) / 16));
  for (let r = 0; r < rows; r++)
    for (const wx of [8, 20]) {
      if (R.chance(0.25)) continue;
      const wy = y0 + topH + 6 + r * 16;
      for (let y = 0; y < 9; y++) for (let x = 0; x < 4; x++) {
        if (y === 0 && (x === 0 || x === 3)) continue;
        pb.set(wx + x, wy + y, y < 2 ? [60, 70, 96] : [34, 40, 62]);
      }
      if (R.chance(0.3)) pb.set(wx + 1, wy + 5, [190, 210, 255]);
    }
  if (roof) {
    for (let y = 0; y < roof; y++) {
      const hw = (y / roof) * 15;
      for (let x = Math.floor(16 - hw); x <= Math.ceil(15 + hw); x++) pb.set(x, y + 4, rampAt(Sl, clamp(0.75 - (x - 16 + hw) / (2 * hw + 1) * 0.5), x, y));
    }
  }
  pb.outline(INK);
  return { c: pb.canvas(), ox: 0, oy: H - 1 };
}

/** The silver leaf-lantern: the Lume. */
function leafLantern(pb, cx, cy, s = 1, lit = true) {
  const L = lit ? IRAMP.lume : ramp("#3a3e48", "#5a606c", "#7a8290", "#9aa2ae");
  for (let y = -8 * s; y <= 8 * s; y++)
    for (let x = -6 * s; x <= 6 * s; x++) {
      const k = y / (8 * s), hw = Math.sin((k + 1) * Math.PI / 2) * 5 * s * (k < 0 ? 1 : 0.9);
      if (Math.abs(x) > hw) continue;
      let v = 0.8 - (x + y) / (14 * s) * 0.4 - (Math.abs(x) > hw - 1 ? 0.3 : 0);
      if (x === 0 || (Math.abs(x) === Math.round(Math.abs(y + 3 * s) * 0.5) && y > -5 * s)) v -= 0.35; // veins
      pb.set(cx + x, cy + y, rampAt(L, clamp(v), cx + x, cy + y));
    }
  if (lit) pb.set(cx, cy, [255, 255, 255]);
}

export function makeLantern() {
  const pb = new PixBuf(16, 24);
  for (let y = 0; y < 5; y++) pb.set(8, y, [200, 205, 215]);
  leafLantern(pb, 8, 13, 1, true);
  pb.outline(INK);
  return { c: pb.canvas(), ox: 8, oy: 23 };
}

// ---------------------------------------------------------------- the Relicário
export function makePedestal(withLume) {
  const W = 28, H = 54, pb = new PixBuf(W, H), M = IRAMP.marble;
  // column
  for (let y = 22; y < H - 4; y++) for (let x = 7; x < 21; x++) {
    const u = (x - 7) / 14;
    let v = 0.85 - Math.abs(u - 0.3) * 1.1 + ((x - 7) % 4 === 0 ? -0.1 : 0);
    pb.set(x, y, rampAt(M, clamp(v), x, y));
  }
  // capital and base: wide flat ellipses
  for (const [cy, rx] of [[22, 12], [H - 4, 13]])
    for (let y = -3; y <= 3; y++) for (let x = -rx; x <= rx; x++)
      if ((x / rx) ** 2 + (y / 3.2) ** 2 <= 1) pb.set(14 + x, cy + y, rampAt(M, clamp(0.85 - (x + y) / (rx * 2.4) - (y > 1 ? 0.3 : 0)), x, y));
  if (withLume) leafLantern(pb, 14, 11, 1, true);
  pb.outline(INK);
  return { c: pb.canvas(), ox: 14, oy: H - 2, shadow: 12 };
}

/** A Velmoor archivist in marble, holding up a Lume (dark until her question is answered). */
export function makeStatue(spec, lit) {
  const ch = buildCharacter(spec);
  const src = ch.bufs[0][6]; // the cast pose, staff raised
  const W = 32, H = SH + 16, pb = new PixBuf(W, H), M = IRAMP.marble;
  let tip = null;
  for (let y = 0; y < SH; y++)
    for (let x = 0; x < SW; x++) {
      const c = src.get(x, y);
      if (!c) continue;
      if (!tip && x > 15) tip = [x + 3, y + 2];
      const l = (c[0] * 0.3 + c[1] * 0.5 + c[2] * 0.2) / 255;
      pb.set(x + 3, y + 2, l < 0.12 ? INK : rampAt(M, clamp((l - 0.2) * 1.35), x, y));
    }
  // plinth
  for (let y = 0; y < 12; y++) for (let x = 2; x < W - 2; x++) {
    let v = y < 4 ? 0.9 - (x - 2) / 40 : 0.5 - (x - 2) / 60 - (y - 4) * 0.03;
    if (y === 4) v = 0.25;
    pb.set(x, SH + y + 2, rampAt(M, clamp(v), x, y));
  }
  pb.outline(INK);
  // the Lume she holds up: dark until her question is answered
  if (tip) leafLantern(pb, tip[0], tip[1] + 3, 0.55, lit);
  return { c: pb.canvas(), ox: 16, oy: H - 2, shadow: 14 };
}

/** The sealed door: three tiles wide, with a socket per statue that lights as each Lume does. */
export function makeDoor(lit) {
  const W = 96, H = 58, pb = new PixBuf(W, H), M = IRAMP.marble;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let v = 0.6 + (vnoise(x / 5, y / 8, 31) - 0.5) * 0.1 - y * 0.004;
    if (x === 47 || x === 48) v = 0.18; // the seam between the leaves
    if (y < 8) v = 0.85 - x / 400;
    if (y === 8) v = 0.3;
    if (x < 3 || x > W - 4) v = 0.35;
    // a carved arch
    const ax = (x - 48) / 40, ay = (y - 54) / 44;
    if (Math.abs(ax * ax + ay * ay - 1) < 0.04 && y > 10) v -= 0.25;
    pb.set(x, y, rampAt(M, clamp(v), x, y));
  }
  for (let i = 0; i < 3; i++) {
    const cx = 24 + i * 24, cy = 30;
    for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) {
      const q = x * x + y * y;
      if (q > 18) continue;
      pb.set(cx + x, cy + y, i < lit ? IRAMP.lume[q < 4 ? 3 : q < 10 ? 2 : 1] : q > 12 ? M[0] : [44, 50, 64]);
    }
  }
  pb.outline(INK);
  return { c: pb.canvas(), ox: 0, oy: H - 1 };
}

/** A stone slab carved with someone's likeness (the relief that shows whoever comes in). */
export function makeRelief(spec, blank) {
  const ch = buildCharacter(blank ? { ...spec, faceless: true } : spec);
  const src = ch.bufs[0][4];
  const W = 30, H = 34, pb = new PixBuf(W, H), M = IRAMP.marble;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) pb.set(x, y, rampAt(M, clamp(0.36 + (vnoise(x / 3, y / 3, 77) - 0.5) * 0.12 - (x > W - 3 ? 0.15 : 0)), x, y));
  for (let y = 0; y < 26; y++)
    for (let x = 0; x < SW; x++) {
      const c = src.get(x, y);
      if (!c) continue;
      const l = (c[0] * 0.3 + c[1] * 0.5 + c[2] * 0.2) / 255;
      pb.set(x + 2, y + 5, l < 0.1 ? M[0] : rampAt(M, clamp(0.2 + (l - 0.15) * 0.95), x, y));
    }
  pb.outline(INK);
  return { c: pb.canvas(), ox: 15, oy: H - 1 };
}

// ---------------------------------------------------------------- valley props for the prologue
/** The forgotten doe: alive, white-eyed, head down chewing grass that isn't there. */
export function makeDeer(frame = 0) {
  const W = 34, H = 30, pb = new PixBuf(W, H), F = IRAMP.fawn;
  const bob = frame ? 1 : 0;
  // legs
  for (const [lx, back] of [[11, 0], [14, 1], [22, 0], [25, 1]])
    for (let y = 18; y < 28; y++) { pb.set(lx, y, F[back ? 1 : 2]); pb.set(lx + 1, y, F[back ? 0 : 1]); if (y > 25) pb.set(lx, y, F[0]); }
  // body
  for (let y = -5; y <= 5; y++) for (let x = -9; x <= 9; x++) {
    const q = (x / 9.5) ** 2 + (y / 5.5) ** 2;
    if (q > 1) continue;
    let v = 0.75 - y * 0.06 - x * 0.012 - (q > 0.75 ? 0.15 : 0);
    if (y > 2) v = 0.95; // pale belly
    pb.set(19 + x, 15 + y, rampAt(F, clamp(v), x, y));
  }
  // white tail
  pb.set(28, 11, [240, 236, 226]); pb.set(29, 12, [240, 236, 226]); pb.set(28, 12, [220, 214, 200]);
  // neck going down to the grass, head low
  for (let s = 0; s < 9; s++) {
    const x = 11 - s * 0.7, y = 12 + s * 0.9 + bob * (s / 9);
    for (let k = -2; k <= 1; k++) pb.set(x + k, y, rampAt(F, 0.7 - k * 0.1, x, y));
  }
  const hx = 4, hy = 22 + bob;
  for (let y = -2; y <= 2; y++) for (let x = -3; x <= 4; x++) if ((x / 4) ** 2 + (y / 2.6) ** 2 <= 1) pb.set(hx + x, hy + y, rampAt(F, 0.7 - y * 0.1, x, y));
  pb.set(hx - 3, hy + 1, F[0]); // muzzle
  pb.set(hx + 3, hy - 3, F[3]); pb.set(hx + 4, hy - 4, F[3]); pb.set(hx + 2, hy - 3, F[2]); // ears
  pb.outline(INK);
  // the eye: white, no pupil
  pb.set(hx + 1, hy - 1, [250, 250, 255]); pb.set(hx + 2, hy - 1, [220, 226, 240]);
  return { c: pb.canvas(), ox: 18, oy: 27, shadow: 12 };
}

/** What the patrol carried off: Maren's net rolled up, two pots and a carved rocking chair. */
export function makeLoot() {
  const W = 40, H = 30, pb = new PixBuf(W, H), Rp = IRAMP.rope, Wd = ramp("#3a1e14", "#5a2e1c", "#7e4426", "#a35e32", "#c67c42");
  // rocking chair, side view
  for (let x = 20; x < 36; x++) { const y = 27 - Math.round(((x - 28) / 8) ** 2 * 2); pb.set(x, y, Wd[3]); pb.set(x, y + 1, Wd[1]); }
  for (let y = 4; y < 26; y++) { pb.set(33, y, Wd[3]); pb.set(34, y, Wd[1]); }
  for (let y = 18; y < 26; y++) { pb.set(23, y, Wd[3]); pb.set(24, y, Wd[1]); }
  for (let x = 22; x < 35; x++) { pb.set(x, 17, Wd[4]); pb.set(x, 18, Wd[2]); }
  for (let y = 6; y < 17; y += 3) for (let x = 31; x < 34; x++) pb.set(x, y, Wd[2]);
  // the net, rolled
  for (let y = -5; y <= 5; y++) for (let x = -10; x <= 10; x++) {
    if ((x / 10.5) ** 2 + (y / 5.5) ** 2 > 1) continue;
    let v = 0.7 - y * 0.07;
    if ((x + y * 2) % 4 === 0 || (x - y * 2) % 4 === 0) v -= 0.35;
    pb.set(12 + x, 22 + y, rampAt(Rp, clamp(v), x, y));
  }
  // pots
  for (const [px, py, r] of [[6, 13, 4], [15, 12, 3]])
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r) pb.set(px + x, py + y, rampAt(IRAMP.clay, clamp(0.8 - (x + y) / (r * 3)), x, y));
  pb.outline(INK);
  return { c: pb.canvas(), ox: 20, oy: 28, shadow: 14 };
}

/** The trapdoor at the foot of the broken column: a slab with a child's face carved on it, or the open stairs. */
export function makeTrapdoor(open) {
  const W = 30, H = 22, pb = new PixBuf(W, H), M = IRAMP.marble;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const edge = x < 2 || y < 2 || x > W - 3 || y > H - 3;
    if (open) {
      const depth = y / H;
      pb.set(x, y, edge ? M[1] : (y % 5 === 0 ? [40, 46, 60] : rampAt(IRAMP.slate, clamp(0.9 - depth * 0.9), x, y)));
    } else {
      let v = 0.55 + (vnoise(x / 3, y / 3, 50) - 0.5) * 0.15 - (edge ? 0.25 : 0);
      const fx = x - 15, fy = y - 11;
      if (Math.abs(fx * fx + fy * fy * 1.4 - 36) < 6) v -= 0.3; // the face's outline
      if ((fx === -2 || fx === 2) && fy === -1) v -= 0.35; // eyes
      if (fy === 3 && Math.abs(fx) < 2) v -= 0.3; // mouth
      pb.set(x, y, rampAt(M, clamp(v), x, y));
    }
  }
  pb.outline(INK);
  return { c: pb.canvas(), ox: 15, oy: H - 2 };
}

/** A half-buried Velmoor boundary stone with a line of glyphs. */
export function makeMarker() {
  const W = 22, H = 28, pb = new PixBuf(W, H), M = IRAMP.marble;
  for (let y = 0; y < H - 4; y++) for (let x = 3; x < 19; x++) {
    const top = y < 6 ? Math.abs(x - 11) > 2 + y * 1.4 : false;
    if (top) continue;
    let v = 0.6 - (x - 3) / 30 + (vnoise(x / 2, y / 2, 61) - 0.5) * 0.2;
    if (y >= 9 && y <= 17 && x > 6 && x < 16 && hash2(x, y, 3) > 0.62 && y % 3) v -= 0.3; // glyphs
    pb.set(x, y + 2, rampAt(M, clamp(v), x, y));
  }
  for (let x = 1; x < W - 1; x++) for (let y = H - 5; y < H - 2; y++) pb.set(x, y, [58, 92, 40]); // grass at the foot
  for (let x = 4; x < 9; x++) pb.set(x, 10, [80, 120, 50]);
  pb.outline(INK);
  return { c: pb.canvas(), ox: 11, oy: H - 3, shadow: 8 };
}
