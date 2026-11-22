// Act I, painted in code: the ground of the tile-laid outdoor maps (Vau-de-Cardo and the Travessia do Cardo), and
// the things a frontier town is made of: palisade, timber houses, market stalls, lamp posts, a well, tables,
// a tavern sign, a notice board, a cart, a shrine. Same rules as the valley: lit from the top left, hard ramps
// with ordered dither, a dark outline on everything that stands.
import { TILE, PixBuf, Rng, ramp, rampAt, vnoise, fbm, hash2, clamp, bayer } from "../util.js";
import { PAL } from "./ground.js";
import { RAMP } from "./props.js";

const INK = [24, 18, 30];
export const TRAMP = {
  cobble: ramp("#3e3a38", "#544e48", "#6e665c", "#8a8070", "#a69a84", "#beb29a"),
  plaster: ramp("#6e5e4a", "#92805e", "#b8a47a", "#d8c69a", "#eee0b8"),
  timber: ramp("#2a1610", "#44241a", "#603624", "#7e4a2e", "#9c6238"),
  clay: ramp("#4a1c18", "#742a20", "#a03e28", "#c85a32", "#e47c44"),
  slate: ramp("#262c3a", "#363e50", "#4a5468", "#626e84", "#7e8aa0"),
  thatch: ramp("#5a4420", "#806428", "#a88834", "#caa848", "#e4c868"),
  pane: ramp("#1c2638", "#2c4058", "#44627e", "#6a8eaa"),
  glow: ramp("#a8601c", "#e09a2c", "#ffd45a", "#fff2a8"),
  iron: ramp("#1c2028", "#2e3440", "#48505e", "#6a7484", "#96a0b0"),
  awning: [ramp("#5a1a20", "#8a2a2c", "#b8423a", "#dc6a50"), ramp("#1c3a4a", "#28586a", "#3a7a8a", "#5aa0a8"), ramp("#5a4a14", "#8a741c", "#b89c2a", "#dcc048")],
  canvas: ramp("#8a7a5a", "#b0a07a", "#d0c29a", "#e8dcb8"),
};

const WHITEWASH = ramp("#8e8a80", "#b4b0a4", "#d4d2c8", "#ecebe4", "#fbfaf6"); // the Monastery's lime: whiter than the town's plaster

// ---------------------------------------------------------------- the ground of an outdoor tile map
/** Paint W (tile kinds K: GRASS, PATH, WATER, DOCK, COBBLE) to ImageData. Borders between kinds wander like the valley's. */
export function paintOutdoor(W, K) {
  const w = W.w * TILE, h = W.h * TILE, img = new ImageData(w, h), d = img.data;
  const raw = (x, y) => W.tileAt(Math.floor(x / TILE), Math.floor(y / TILE));
  const kind = (x, y) => {
    const r = raw(x, y);
    if (r === K.DOCK) return r;
    const t = raw(x + (vnoise(x / 13, y / 13, 3) - 0.5) * 18, y + (vnoise(x / 13, y / 13, 7) - 0.5) * 18);
    return t === K.DOCK || t < 0 ? r : t;
  };
  const kinds = new Int8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) kinds[y * w + x] = kind(x, y);
  const kAt = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? -1 : kinds[y * w + x]);
  const lushSeed = W.seed ?? 5;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const t = kinds[y * w + x];
      const base = fbm(x / 38, y / 38, 1, 3) * 0.7 + vnoise(x / 6, y / 6, 4) * 0.3;
      let c;
      if (t === K.WATER) {
        // deeper away from the banks
        let land = 0;
        for (const r of [8, 20, 34]) for (let a = 0; a < 6; a++) { const k = kAt(Math.round(x + Math.cos(a * 1.047) * r), Math.round(y + Math.sin(a * 1.047) * r)); if (k !== K.WATER && k !== K.DOCK && k >= 0) land += 1 / 18; }
        c = rampAt(PAL.water, clamp(0.15 + land * 1.6) + (vnoise(x / 14, y / 7, 2) - 0.5) * 0.25, x, y);
        if (W.ford) {
          // the shallows of a ford: an edge that wanders, paler where it is shallowest, and the current combed into
          // light streaks running downstream (not a straight band across the river)
          const j = (vnoise(x / 11, y / 9, 13) - 0.5) * 26 + (vnoise(x / 4, y / 4, 19) - 0.5) * 6;
          if (W.ford(x, y + j)) {
            const mid = W.ford(x, y + j - 12) && W.ford(x, y + j + 12);
            c = rampAt(PAL.water, (mid ? 0.82 : 0.66) + (vnoise(x / 5, y / 3, 9) - 0.5) * 0.34, x, y);
            if (vnoise(x / 2.2, y / 10, 17) > 0.8) c = PAL.water[PAL.water.length - 1];
          }
        }
        const up = kAt(x, y - 3), up2 = kAt(x, y - 1);
        if ((up !== K.WATER && up !== K.DOCK && up >= 0) || (up2 !== K.WATER && up2 !== K.DOCK && up2 >= 0)) c = PAL.bank[up2 !== K.WATER ? 0 : 1];
      } else if (t === K.DOCK) {
        const col = Math.floor(x / 7), lx = x % 7, seed = col * 31 + Math.floor((y + hash2(col, 0, 5) * 40) / 46);
        if (lx === 0 || (y + Math.floor(hash2(col, 0, 5) * 40)) % 46 === 0) c = PAL.wood[0];
        else c = rampAt(PAL.wood, 0.45 + hash2(seed, 1, 6) * 0.25 + vnoise(x / 2, y / 9, seed) * 0.35 - (lx === 6 ? 0.25 : 0) + (lx === 1 ? 0.2 : 0), x, y);
        if (raw(x, y + 3) === K.WATER) c = PAL.wood[y % 3 === 0 ? 0 : 1];
      } else if (t === K.PATH) {
        c = rampAt(PAL.dirt, base * 0.9 + 0.15, x, y);
      } else if (t === K.COBBLE) {
        c = cobble(x, y);
      } else {
        const lush = fbm(x / 200, y / 200, 21 + lushSeed, 3);
        // a ragged, dithered border between dry meadow and grass (as in the valley)
        const k = (lush + (vnoise(x / 7, y / 6, 33) - 0.5) * 0.06 + (vnoise(x / 2.5, y / 2.5, 34) - 0.5) * 0.025 - 0.39) / 0.04;
        c = k < 1 && k <= bayer(x, y) ? rampAt(PAL.dry, base * 0.85 + 0.1 + (k > 0 ? 0.08 : 0), x, y) : rampAt(PAL.grass, base * 0.8 + Math.max(0, lush - 0.4) * 0.8 - (k < 1.6 ? 0.12 : 0) - (fbm(x / 70, y / 70, 41, 2) < 0.4 ? 0.18 : 0), x, y);
      }
      const j = (y * w + x) * 4;
      d[j] = c[0]; d[j + 1] = c[1]; d[j + 2] = c[2]; d[j + 3] = 255;
    }
  const set = (x, y, c) => { x |= 0; y |= 0; if (x < 0 || y < 0 || x >= w || y >= h) return; const j = (y * w + x) * 4; d[j] = c[0]; d[j + 1] = c[1]; d[j + 2] = c[2]; };
  const R = new Rng(41 + lushSeed);
  // grass blades, flowers, pebbles: the same small marks as the valley
  for (let k = 0; k < w * h / 42; k++) {
    const x = R.int(0, w - 1), y = R.int(3, h - 1);
    if (kinds[y * w + x] !== K.GRASS || kAt(x, y - 4) !== K.GRASS) continue;
    const P = PAL.grass, hi = R.next() < 0.6, bh = R.int(2, 4), lean = R.chance(0.5) ? 1 : -1;
    set(x, y, P[0]);
    for (let s = 1; s <= bh; s++) set(x + (s > bh - 1 ? lean : 0), y - s, s === bh ? P[hi ? 4 : 1] : P[hi ? 3 : 2]);
  }
  const FLOWERS = [ramp("#5b2c8f", "#8a4ccf", "#c99cff"), ramp("#8f1d2c", "#d13a3a", "#ff8a6a"), ramp("#a07a10", "#e8c03a", "#fff2a0"), ramp("#8a8aa8", "#e8e8f4", "#ffffff")];
  for (let k = 0; k < w * h / 2600; k++) {
    const cx = R.int(4, w - 5), cy = R.int(4, h - 5);
    if (kinds[cy * w + cx] !== K.GRASS) continue;
    const F = R.pick(FLOWERS);
    for (let f = R.int(1, 3); f > 0; f--) { const x = cx + R.int(-5, 5), y = cy + R.int(-4, 4); if (kAt(x, y) !== K.GRASS) continue; set(x, y + 1, PAL.grass[1]); set(x, y, F[1]); set(x - 1, y, F[0]); set(x + 1, y, F[0]); set(x, y - 1, F[2]); }
  }
  for (let k = 0; k < w * h / 500; k++) {
    const x = R.int(0, w - 2), y = R.int(0, h - 2);
    if (kinds[y * w + x] !== K.PATH) continue;
    set(x, y, PAL.dirt[4]); set(x + 1, y, PAL.dirt[3]); set(x, y + 1, PAL.dirt[0]); set(x + 1, y + 1, PAL.dirt[0]);
  }
  return img;
}

/** Round river cobbles set in dark earth, bevelled from the top left, worn paler where people walk. */
function cobble(x, y) {
  const C = 10, S = TRAMP.cobble, gx = Math.floor(x / C), gy = Math.floor(y / C);
  let d1 = 1e9, d2 = 1e9, id = 0, px = 0, py = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = (gx + i + 0.25 + hash2(gx + i, gy + j, 71) * 0.5) * C, cy = (gy + j + 0.25 + hash2(gx + i, gy + j, 72) * 0.5) * C;
    const dd = Math.hypot(x - cx, (y - cy) * 1.2);
    if (dd < d1) { d2 = d1; d1 = dd; id = (gx + i) * 7919 + gy + j; px = cx; py = cy; } else if (dd < d2) d2 = dd;
  }
  const edge = d2 - d1;
  if (edge < 1.3) return fbm(x / 16, y / 16, 15, 2) > 0.62 ? PAL.grass[1] : S[0];
  let v = 0.4 + hash2(id, 3, 9) * 0.3 + (fbm(x / 60, y / 60, 5, 2) - 0.5) * 0.3;
  if (edge < 3) v += (x - px) + (y - py) < 0 ? 0.16 : -0.16;
  return rampAt(S, v + (vnoise(x / 3, y / 3, 14) - 0.5) * 0.14, x, y);
}

/** Glint sample points over a tile map's water. */
export function outdoorSparkles(W, K) {
  const out = [], R = new Rng(5);
  for (let k = 0; k < W.w * W.h * 3; k++) {
    const x = R.int(0, W.w * TILE), y = R.int(0, W.h * TILE);
    if (W.tileAt((x / TILE) | 0, (y / TILE) | 0) !== K.WATER || W.tileAt((x / TILE) | 0, ((y - 6) / TILE) | 0) !== K.WATER) continue;
    out.push({ x, y, len: R.int(2, 6), ph: R.range(0, 1), sp: R.range(0.25, 0.6), edge: false });
  }
  return out;
}

// ---------------------------------------------------------------- town props
/**
 * A timber-and-plaster house seen from the front and a little above: the roof takes the upper half.
 * w: width in tiles. opts: roof ("clay" | "slate" | "thatch"), lit (windows aglow), door (0..1 across), tall.
 */
export function makeHouse(w, seed, opts = {}) {
  const R = new Rng(seed), W = w * TILE, roofH = opts.tall ? 46 : 36, wallH = opts.tall ? 36 : 28, H = roofH + wallH + 4;
  const pb = new PixBuf(W, H), RF = TRAMP[opts.roof ?? "clay"], PL = opts.white ? WHITEWASH : TRAMP.plaster, TB = TRAMP.timber;
  const thatch = opts.roof === "thatch";
  // the roof: courses of tiles running down to the eave, the ridge catching the light
  for (let y = 0; y < roofH; y++) {
    const inset = Math.max(0, 5 - y * 0.6) | 0;
    for (let x = inset; x < W - inset; x++) {
      const row = Math.floor(y / 5), off = row & 1 ? 4 : 0, sx = (x + off) % 8, sy = y % 5;
      let v = 0.62 - (y / roofH) * 0.22 + hash2((x + off) >> 3, row, seed) * 0.16;
      if (thatch) v = 0.6 - (y / roofH) * 0.2 + (vnoise(x / 2, y / 6, seed) - 0.5) * 0.35;
      else { if (sy === 4) v -= 0.22; if (sx === 0) v -= 0.14; if (sy === 0) v += 0.08; }
      if (y < 2) v = 0.95;
      v -= (x / W) * 0.12;
      if (y >= roofH - 2) v = 0.12; // the eave's shadow line
      pb.set(x, y + 2, rampAt(RF, clamp(v), x, y));
    }
  }
  // chimney
  if (!thatch) { const cx = Math.floor(W * (R.chance(0.5) ? 0.22 : 0.74)); for (let y = 0; y < 12; y++) for (let x = 0; x < 8; x++) pb.set(cx + x, y, rampAt(RAMP.stone, 0.7 - x * 0.05 - (y % 4 === 3 ? 0.2 : 0), x, y)); }
  // the wall: plaster between dark timbers
  const y0 = roofH + 2;
  for (let y = 0; y < wallH; y++) for (let x = 2; x < W - 2; x++) {
    let v = 0.62 - (y < 4 ? 0.3 - y * 0.07 : 0) + (vnoise(x / 5, y / 5, seed + 3) - 0.5) * 0.14 - (x / W) * 0.1;
    let c = rampAt(PL, clamp(v), x, y);
    const post = x < 5 || x >= W - 5 || (w > 2 && Math.abs(x - W / 2) < 2 && !opts.noMid);
    if (post || y >= wallH - 3) c = rampAt(TB, 0.55 - (y / wallH) * 0.2 - (x % 3 === 0 ? 0.1 : 0), x, y);
    pb.set(x, y + y0, c);
  }
  // door and windows
  const dx = Math.floor(W * (opts.door ?? 0.5)) - 6;
  for (let y = 0; y < 20; y++) for (let x = 0; x < 12; x++) {
    let c = rampAt(RAMP.wood, 0.5 - x * 0.02 - (x % 4 === 0 ? 0.18 : 0), x, y);
    if (x === 0 || x === 11 || y === 0) c = TB[0];
    pb.set(dx + x, y0 + wallH - 3 - 20 + y + 1, c);
  }
  pb.set(dx + 9, y0 + wallH - 12, TRAMP.glow[1]);
  const wins = w >= 4 ? [0.2, 0.8] : w === 3 ? [(opts.door ?? 0.5) > 0.5 ? 0.25 : 0.78] : [];
  for (const k of wins) {
    const wx = Math.floor(W * k) - 5, wy = y0 + 7;
    for (let y = 0; y < 11; y++) for (let x = 0; x < 10; x++) {
      const frame = x === 0 || x === 9 || y === 0 || y === 10 || x === 4 || x === 5 || y === 5;
      const c = frame ? TB[1] : opts.lit ? rampAt(TRAMP.glow, 0.75 - y * 0.03 - (x > 5 ? 0.12 : 0), x, y) : rampAt(TRAMP.pane, 0.6 - (x + y) * 0.04, x, y);
      pb.set(wx + x, wy + y, c);
    }
    for (let x = -1; x < 11; x++) pb.set(wx + x, wy + 11, TB[3]);
  }
  pb.outline(INK);
  return { c: pb.canvas(), ox: 0, oy: H - 2, shadow: 0, windows: wins.map((k) => [Math.floor(W * k), wallH - 12]) };
}

/** One tile of palisade: sharpened logs lashed together. */
export function makePalisade(seed) {
  const pb = new PixBuf(TILE, 50), T = RAMP.bark, Wd = RAMP.wood;
  for (let i = 0; i < 4; i++) {
    const x0 = i * 8, top = 4 + Math.floor(hash2(i, seed, 3) * 5);
    for (let y = top; y < 48; y++) for (let x = 0; x < 8; x++) {
      const tip = y - top;
      if (tip < 5 && Math.abs(x - 3.5) > tip * 0.8 + 0.6) continue;
      let v = 0.72 - x * 0.07 + (vnoise(x0 + x, y / 5, seed) - 0.5) * 0.2 - (y > 40 ? 0.15 : 0);
      if (x === 7) v = 0.1;
      pb.set(x0 + x, y, tip < 5 ? rampAt(Wd, v + 0.1, x, y) : rampAt(T, v, x, y));
    }
  }
  for (const yy of [16, 34]) for (let x = 0; x < TILE; x++) { pb.set(x, yy, RAMP.bone[x % 4 === 0 ? 1 : 2]); pb.set(x, yy + 1, RAMP.bone[0]); }
  pb.outline(INK);
  return { c: pb.canvas(), ox: 0, oy: 48, shadow: 0 };
}

/** A market stall: two posts, a striped awning, a counter with wares. */
export function makeStall(color, seed) {
  const W = 60, H = 54, pb = new PixBuf(W, H), A = TRAMP.awning[color % 3], Wd = RAMP.wood, R = new Rng(seed);
  for (const px of [4, 53]) for (let y = 18; y < 50; y++) for (let x = 0; x < 3; x++) pb.set(px + x, y, Wd[3 - x]);
  // counter
  for (let y = 0; y < 14; y++) for (let x = 6; x < 54; x++) pb.set(x, y + 36, y < 4 ? rampAt(Wd, 0.85 - x / 200, x, y) : rampAt(Wd, 0.45 - (x % 9 === 0 ? 0.25 : 0) - y * 0.01, x, y));
  // wares on the counter
  const goods = [RAMP.cloth[0], RAMP.cloth[1], RAMP.leaf, TRAMP.awning[2], RAMP.bone];
  for (let i = 0; i < 5; i++) { const g = R.pick(goods), gx = 10 + i * 9, gh = R.int(3, 6); for (let y = 0; y < gh; y++) for (let x = 0; x < 6; x++) pb.set(gx + x, 36 - gh + y, rampAt(g, 0.8 - x * 0.1 - y * 0.05, x, y)); }
  // awning: stripes sloping to a scalloped front edge
  for (let y = 0; y < 20; y++) for (let x = 0; x < W; x++) {
    const stripe = Math.floor(x / 6) & 1, scallop = y >= 16 ? (x % 6 === 0 || (y === 19 && x % 6 !== 3) ? 1 : 0) : 0;
    if (scallop) continue;
    let v = 0.78 - y * 0.02 - (x / W) * 0.14 - (y >= 15 ? 0.2 : 0);
    pb.set(x, y + 1, stripe ? rampAt(A, v, x, y) : rampAt(TRAMP.canvas, v, x, y));
  }
  pb.outline(INK);
  return { c: pb.canvas(), ox: 30, oy: 50, shadow: 26 };
}

/** A lamp post: the lantern is drawn lit; the world gives it a light. */
export function makeLamp() {
  const pb = new PixBuf(14, 50), I = TRAMP.iron, Gl = TRAMP.glow;
  for (let y = 12; y < 48; y++) { pb.set(6, y, I[3]); pb.set(7, y, I[1]); }
  for (let x = 4; x < 10; x++) { pb.set(x, 47, I[2]); pb.set(x, 48, I[0]); }
  for (let y = 0; y < 9; y++) for (let x = 0; x < 8; x++) {
    const frame = x === 0 || x === 7 || y === 0 || y === 8;
    pb.set(3 + x, 3 + y, frame ? I[x === 0 || y === 0 ? 3 : 1] : rampAt(Gl, 0.95 - Math.hypot(x - 3.5, y - 4.5) * 0.14, x, y));
  }
  for (let x = 4; x < 10; x++) pb.set(x, 2, I[2]);
  pb.set(6, 1, I[3]); pb.set(7, 1, I[2]);
  pb.outline(INK);
  return { c: pb.canvas(), ox: 7, oy: 48, shadow: 5 };
}

export function makeWell() {
  const W = 34, H = 44, pb = new PixBuf(W, H), S = RAMP.stone, Wd = RAMP.wood;
  // rim, seen from above: a ring of stones around dark water
  for (let y = 0; y < 22; y++) for (let x = 0; x < W; x++) {
    const q = ((x - 16.5) / 15) ** 2 + ((y - 9) / 8) ** 2, qi = ((x - 16.5) / 10) ** 2 + ((y - 9) / 4.6) ** 2;
    if (q <= 1 && qi > 1) pb.set(x, y + 16, rampAt(S, 0.8 - (x / W) * 0.3 - (Math.floor(Math.atan2(y - 9, x - 16.5) * 3) & 1 ? 0.12 : 0), x, y));
    else if (qi <= 1) pb.set(x, y + 16, rampAt(PAL.water, 0.1 + (y - 5) * 0.03, x, y));
    else if (y > 9 && Math.abs(x - 16.5) < 15 && y < 20) pb.set(x, y + 16 + 4, rampAt(S, 0.42 - (x / W) * 0.2 - ((x + (y & 4)) % 7 === 0 ? 0.2 : 0), x, y));
  }
  for (let y = 9; y < 20; y++) for (let x = 2; x < 32; x++) if (((x - 16.5) / 15) ** 2 + ((y - 9) / 8) ** 2 > 1 && Math.abs(x - 16.5) < 15) pb.set(x, y + 20, rampAt(S, 0.4 - (x / W) * 0.2 - ((x + (y & 4)) % 7 === 0 ? 0.2 : 0), x, y));
  // posts, crossbeam, rope and bucket
  for (const px of [3, 29]) for (let y = 2; y < 26; y++) { pb.set(px, y, Wd[3]); pb.set(px + 1, y, Wd[1]); }
  for (let x = 2; x < 32; x++) { pb.set(x, 2, Wd[4]); pb.set(x, 3, Wd[2]); pb.set(x, 4, Wd[0]); }
  for (let y = 5; y < 18; y++) pb.set(16, y, RAMP.bone[1]);
  for (let y = 0; y < 5; y++) for (let x = 0; x < 6; x++) pb.set(14 + x, 17 + y, rampAt(Wd, 0.7 - x * 0.08, x, y));
  pb.outline(INK);
  return { c: pb.canvas(), ox: 17, oy: 38, shadow: 16 };
}

/** A round tavern table with mugs on it. */
export function makeTable(seed = 1) {
  const W = 30, H = 26, pb = new PixBuf(W, H), Wd = RAMP.wood;
  for (let y = 14; y < 24; y++) for (const x of [7, 8, 21, 22]) pb.set(x, y, Wd[x % 2 ? 1 : 2]);
  for (let y = 0; y < 16; y++) for (let x = 0; x < W; x++) {
    const q = ((x - 14.5) / 14) ** 2 + ((y - 7) / 6.5) ** 2;
    if (q <= 1) pb.set(x, y + 2, rampAt(Wd, 0.78 - (x / W) * 0.25 - (y % 4 === 3 ? 0.15 : 0) - (q > 0.8 ? 0.15 : 0), x, y));
    else if (y > 7 && Math.abs(x - 14.5) < 13.6 && ((x - 14.5) / 14) ** 2 + ((y - 10) / 6.5) ** 2 <= 1) pb.set(x, y + 2, Wd[1]);
  }
  const R = new Rng(seed);
  for (let i = 0; i < 2; i++) { const mx = 8 + i * 9 + R.int(0, 2), my = 5 + R.int(0, 3); for (let y = 0; y < 4; y++) for (let x = 0; x < 3; x++) pb.set(mx + x, my + y, y === 0 ? RAMP.bone[3] : TRAMP.iron[3 - x]); }
  pb.outline(INK);
  return { c: pb.canvas(), ox: 15, oy: 22, shadow: 13 };
}

/** The tavern's hanging sign: a small bird with a bandaged eye. */
export function makeSign() {
  const pb = new PixBuf(26, 48), Wd = RAMP.wood, I = TRAMP.iron;
  for (let y = 4; y < 46; y++) { pb.set(3, y, Wd[3]); pb.set(4, y, Wd[1]); }
  for (let x = 3; x < 22; x++) { pb.set(x, 4, I[3]); pb.set(x, 5, I[1]); }
  for (const x of [9, 19]) for (let y = 6; y < 9; y++) pb.set(x, y, I[2]);
  for (let y = 0; y < 14; y++) for (let x = 0; x < 16; x++) pb.set(6 + x, 9 + y, x === 0 || x === 15 || y === 0 || y === 13 ? Wd[1] : rampAt(TRAMP.canvas, 0.8 - x * 0.02 - y * 0.02, x, y));
  // the thrush: brown back, speckled breast, a strip of cloth over the eye
  const B = RAMP.bark, bx = 9, by = 12;
  for (const [x, y, c] of [[3, 2, B[3]], [4, 2, B[3]], [5, 2, B[2]], [2, 3, B[3]], [3, 3, B[4]], [4, 3, B[3]], [5, 3, B[2]], [6, 3, B[1]], [2, 4, RAMP.bone[3]], [3, 4, RAMP.bone[2]], [4, 4, B[3]], [5, 4, B[2]], [6, 4, B[1]], [7, 4, B[1]], [3, 5, RAMP.bone[3]], [4, 5, RAMP.bone[2]], [5, 5, B[2]], [8, 5, B[0]], [4, 6, B[0]], [5, 6, B[0]], [1, 3, TRAMP.glow[1]], [2, 2, RAMP.bone[3]], [3, 1, RAMP.bone[3]]]) pb.set(bx + x, by + y, c);
  pb.outline(INK);
  return { c: pb.canvas(), ox: 4, oy: 46, shadow: 4 };
}

/** A notice board with papers pinned to it. `wanted`: one of them is a poster with a face. */
export function makeBoard(wanted = true) {
  const pb = new PixBuf(38, 40), Wd = RAMP.wood;
  for (const px of [3, 33]) for (let y = 4; y < 38; y++) { pb.set(px, y, Wd[3]); pb.set(px + 1, y, Wd[1]); }
  for (let y = 0; y < 22; y++) for (let x = 0; x < 34; x++) pb.set(2 + x, 5 + y, y < 2 ? Wd[4] : rampAt(Wd, 0.5 - (y % 6 === 0 ? 0.2 : 0) - x * 0.004, x, y));
  for (let x = 0; x < 38; x++) { pb.set(x, 3, TRAMP.timber[3]); pb.set(x, 4, TRAMP.timber[1]); }
  const paper = (x0, y0, w, h, face) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) pb.set(x0 + x, y0 + y, rampAt(TRAMP.canvas, 0.9 - (x + y) * 0.02, x, y));
    pb.set(x0 + (w >> 1), y0, TRAMP.iron[3]);
    if (face) { for (const [x, y] of [[3, 3], [4, 3], [5, 3], [3, 4], [5, 4], [3, 5], [4, 5], [5, 5], [2, 7], [3, 7], [4, 7], [5, 7], [6, 7]]) pb.set(x0 + x, y0 + y, TRAMP.timber[1]); for (let x = 2; x < w - 2; x++) pb.set(x0 + x, y0 + h - 3, TRAMP.clay[2]); }
    else for (let y = 3; y < h - 2; y += 2) for (let x = 2; x < w - 2; x++) if ((x + y) % 5) pb.set(x0 + x, y0 + y, RAMP.stone[2]);
  };
  paper(6, 9, 8, 10, false); paper(24, 8, 8, 9, false);
  if (wanted) paper(14, 8, 9, 14, true);
  pb.outline(INK);
  return { c: pb.canvas(), ox: 19, oy: 37, shadow: 12 };
}

/** A two-wheeled cart; `wrecked`: tipped, a wheel off, the load spilled. */
export function makeCart(wrecked = false) {
  const W = 48, H = 34, pb = new PixBuf(W, H), Wd = RAMP.wood, I = TRAMP.iron;
  const tilt = (x) => (wrecked ? Math.round((x - 24) * 0.22) : 0);
  for (let y = 0; y < 12; y++) for (let x = 6; x < 40; x++) pb.set(x, 8 + y + tilt(x), y < 3 ? rampAt(Wd, 0.85 - x / 160, x, y) : rampAt(Wd, 0.5 - (x % 8 === 0 ? 0.22 : 0) - y * 0.012, x, y));
  for (let x = 40; x < 47; x++) for (let y = 0; y < 2; y++) pb.set(x, 15 + y + tilt(x), Wd[2 - y]);
  const wheel = (cx, cy) => { for (let y = -6; y <= 6; y++) for (let x = -6; x <= 6; x++) { const r = Math.hypot(x, y); if (r <= 6.3 && r > 4.2) pb.set(cx + x, cy + y, Wd[x + y < 0 ? 3 : 1]); else if (r <= 4.2 && (x === 0 || y === 0 || Math.abs(x) === Math.abs(y))) pb.set(cx + x, cy + y, Wd[2]); else if (r < 1.6) pb.set(cx + x, cy + y, I[3]); } };
  wheel(14, 24 + tilt(14));
  if (!wrecked) wheel(32, 24); else { for (let x = 0; x < 13; x++) for (let y = 0; y < 5; y++) if (((x - 6) / 6.3) ** 2 + ((y - 2) / 2.4) ** 2 <= 1) pb.set(33 + x, 27 + y, Wd[y < 2 ? 3 : 1]); }
  // sacks (and a spilled one)
  const sack = (sx, sy) => { for (let y = 0; y < 7; y++) for (let x = 0; x < 8; x++) if (((x - 3.5) / 4) ** 2 + ((y - 3.5) / 3.6) ** 2 <= 1) pb.set(sx + x, sy + y, rampAt(TRAMP.canvas, 0.85 - x * 0.07 - y * 0.05, x, y)); };
  sack(10, 3 + tilt(12)); sack(20, 2 + tilt(22)); if (wrecked) sack(2, 26); else sack(29, 3);
  pb.outline(INK);
  return { c: pb.canvas(), ox: 24, oy: 30, shadow: 20 };
}

/** A wayside shrine to Nhara, Lady of the Tides: a carved stone with a shell and a candle. */
export function makeShrine() {
  const pb = new PixBuf(24, 38), S = RAMP.stone;
  for (let y = 0; y < 30; y++) for (let x = 0; x < 16; x++) {
    if (y < 6 && Math.abs(x - 7.5) > 3 + y * 0.9) continue;
    pb.set(4 + x, 4 + y, rampAt(S, 0.72 - x * 0.03 - y * 0.008 + (vnoise(x / 3, y / 3, 6) - 0.5) * 0.2, x, y));
  }
  for (let x = 0; x < 22; x++) for (let y = 0; y < 4; y++) pb.set(1 + x, 33 + y, rampAt(S, 0.6 - y * 0.12 - x * 0.01, x, y));
  // the shell: ribs fanning from a point
  for (let a = -3; a <= 3; a++) for (let r = 0; r < 6; r++) pb.set(12 + Math.round(a * r * 0.33), 20 - r, r === 5 ? RAMP.bone[3] : PAL.water[a & 1 ? 3 : 4]);
  for (let x = 9; x < 16; x++) pb.set(x, 21, PAL.water[1]);
  // moss, and the candle on the step
  for (let x = 4; x < 20; x++) if (fbm(x / 3, 2, 3, 2) > 0.5) for (let y = 0; y < 3 + (x % 3); y++) pb.set(x, 4 + y + (Math.abs(x - 11.5) > 3 ? 4 : 0), rampAt(RAMP.moss, 0.7 - y * 0.1, x, y));
  pb.set(17, 31, RAMP.bone[3]); pb.set(17, 32, RAMP.bone[2]); pb.set(17, 30, TRAMP.glow[2]); pb.set(17, 29, TRAMP.glow[3]);
  pb.outline(INK);
  return { c: pb.canvas(), ox: 12, oy: 36, shadow: 10 };
}

/** The commander's strongbox: iron-bound, with a heavy lock. */
export function makeStrongbox(open = false) {
  const pb = new PixBuf(26, 22), I = TRAMP.iron;
  for (let y = 0; y < 16; y++) for (let x = 1; x < 25; x++) {
    let v = (y < 6 ? 0.8 : 0.5) - y * 0.02 - x * 0.006;
    if (x === 1 || x === 24 || x === 8 || x === 17 || y === 6) v = 0.15;
    if (open && y < 6) v = 0.05;
    pb.set(x, y + 4, rampAt(I, v, x, y));
  }
  if (!open) { pb.rect(11, 9, 4, 5, TRAMP.glow[1]); pb.set(12, 11, INK); pb.set(13, 11, INK); }
  else for (let x = 4; x < 22; x += 3) pb.set(x, 10, PAL.water[4]);
  pb.outline(INK);
  return { c: pb.canvas(), ox: 13, oy: 20, shadow: 12 };
}

/** A courier's satchel, dropped. */
export function makeSatchel() {
  const pb = new PixBuf(18, 14), L = RAMP.wood;
  for (let y = 0; y < 9; y++) for (let x = 0; x < 14; x++) if (((x - 6.5) / 7) ** 2 + ((y - 4) / 4.6) ** 2 <= 1) pb.set(2 + x, 3 + y, y < 4 ? rampAt(L, 0.75 - x * 0.03, x, y) : rampAt(L, 0.45 - x * 0.02, x, y));
  pb.set(8, 7, TRAMP.glow[1]); pb.set(9, 7, TRAMP.glow[2]);
  for (let x = 4; x < 12; x++) pb.set(x + 2, 2 - (x > 5 && x < 10 ? 1 : 0), L[1]);
  // a grey feather tucked under the flap
  for (let i = 0; i < 5; i++) pb.set(12 + i * 0.6, 4 - i * 0.6, RAMP.stone[4 + (i & 1)]);
  pb.outline(INK);
  return { c: pb.canvas(), ox: 9, oy: 12, shadow: 8 };
}
