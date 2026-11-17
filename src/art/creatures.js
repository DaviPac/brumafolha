// Creatures that are not people, on the same sheet as the characters (4 facings × walk0-3, idle, attack, cast; feet
// at (13, 34) of a 26×36 cell), so the engine moves, flashes and poses them like anyone else.
//
// The Bruma moth (mariposa da Bruma): a moth as big as a cat, pale as the mist it lives in, with two cold blue eye
// spots on the wings. It drinks what is being forgotten. It hovers: the body rides high over its shadow, the wings beat
// in the walk frames, sweep forward to strike, and shed glittering dust to cast.
import { PixBuf, rampAt, clamp } from "../util.js";

const SW = 26, SH = 36, INK = [22, 16, 28];

export function buildCreature(spec) {
  const draw = { moth: drawMoth }[spec.creature];
  const sheet = [];
  for (let dir = 0; dir < 4; dir++) {
    const row = [];
    for (let f = 0; f < 4; f++) row.push(draw(spec, dir, f, "walk"));
    row.push(draw(spec, dir, 0, "idle"), draw(spec, dir, 0, "attack"), draw(spec, dir, 0, "cast"));
    sheet.push(row);
  }
  const flash = sheet.map((r) => r.map((pb) => {
    const w = new PixBuf(pb.w, pb.h);
    for (let y = 0; y < pb.h; y++) for (let x = 0; x < pb.w; x++) if (pb.alpha(x, y)) w.set(x, y, [255, 255, 255]);
    return w.canvas();
  }));
  return { frames: sheet.map((r) => r.map((pb) => pb.canvas())), flash, bufs: sheet };
}

function drawMoth(S, dir, f, pose) {
  const pb = new PixBuf(SW, SH);
  const open = pose === "walk" ? [1, 0.55, 0.12, 0.55][f] : pose === "attack" ? 0.25 : pose === "cast" ? 1 : 0.8;
  const side = dir === 1 || dir === 2, back = dir === 3, fx = dir === 1 ? -1 : 1;
  const cx = 13, by = pose === "attack" ? 19 : 14 - (pose === "walk" && f === 2 ? 1 : 0);
  const W = S.wing, B = S.body, E = S.spot;
  const wingPx = (x, y, lx, ly, k) => {
    // light from the top left, veins every few pixels, a darker trailing edge
    let v = 0.78 - lx * 0.02 - ly * 0.025 + (k > 0.8 ? -0.25 : 0);
    if ((Math.abs(lx) + ly) % 4 === 0 && k < 0.8) v -= 0.12;
    pb.set(x, y, rampAt(W, clamp(v), x, y));
  };
  if (!side) {
    // front or back: both wings spread to the sides, the upper pair big, the lower pair small
    const spanU = 4 + 7 * open, spanL = 3 + 4 * open;
    for (const s of [-1, 1]) {
      const ux = cx + s * (2 + spanU * 0.5), uy = by - 3 - (1 - open) * 4;
      for (let y = -7; y <= 5; y++) for (let x = -Math.ceil(spanU / 2) - 1; x <= Math.ceil(spanU / 2) + 1; x++) {
        const k = (x / (spanU / 2 + 0.6)) ** 2 + (y / (5.2 + (1 - open) * 1.5)) ** 2;
        if (k <= 1) wingPx(Math.round(ux + x), Math.round(uy + y), s * x + 4, y + 7, k);
      }
      const lx = cx + s * (1.5 + spanL * 0.5), ly = by + 4;
      for (let y = -3; y <= 4; y++) for (let x = -Math.ceil(spanL / 2) - 1; x <= Math.ceil(spanL / 2) + 1; x++) {
        const k = (x / (spanL / 2 + 0.5)) ** 2 + (y / 3.6) ** 2;
        if (k <= 1) wingPx(Math.round(lx + x), Math.round(ly + y), s * x + 6, y + 9, k);
      }
      // the eye spot: the moth's whole trick, a cold blue Lume-glint
      if (open > 0.4 && !back) { const ex = Math.round(ux + s * 1), ey = Math.round(uy); pb.set(ex, ey, E[2]); pb.set(ex + 1, ey, E[1]); pb.set(ex, ey + 1, E[1]); pb.set(ex + 1, ey + 1, E[0]); }
    }
  } else {
    // side: the far wing peeks above the body, the near one covers it
    for (const [dx, dy, s, tone] of [[-fx * 2, -2, 0.85, -0.18], [0, 0, 1, 0]]) {
      const h = 3 + 7 * open, wcx = cx + dx - fx * 1, wcy = by - 2 + dy - open * 3;
      for (let y = -Math.ceil(h); y <= 4; y++) for (let x = -6; x <= 6; x++) {
        const k = (x / (5.6 * s)) ** 2 + (y / (y < 0 ? h : 4)) ** 2;
        if (k <= 1) { wingPx(wcx + x, wcy + y, fx * x + 6, y + 8, k); if (tone) pb.set(wcx + x, wcy + y, rampAt(W, 0.35 - k * 0.1, x, y)); }
      }
      if (!tone && open > 0.4) { pb.set(wcx + fx, wcy - 2, E[2]); pb.set(wcx + fx, wcy - 1, E[1]); }
    }
  }
  // the body: a furry spindle with a fluffy collar
  for (let y = -4; y <= 7; y++) for (let x = -2; x <= 2; x++) {
    const half = y < -2 ? 1.6 : y > 4 ? 1.4 - (y - 4) * 0.35 : 2.2;
    if (Math.abs(x) > half) continue;
    let v = 0.65 - x * 0.12 - y * 0.03 + ((y & 1) && !side ? -0.1 : 0);
    pb.set(cx + x + (side ? fx : 0), by + y, rampAt(B, clamp(v + (back ? -0.15 : 0)), x, y));
  }
  for (let x = -3; x <= 3; x++) pb.set(cx + x + (side ? fx : 0), by - 3, rampAt(W, 0.95 - Math.abs(x) * 0.1, x, 0));
  // head, eyes and the feathery antennae
  const hx = cx + (side ? fx * 3 : 0), hy = by - 5;
  for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) pb.set(hx + x, hy + y, B[back ? 1 : 2]);
  if (!back) { pb.set(hx - (side ? 0 : 1), hy, E[3]); if (!side) pb.set(hx + 1, hy, E[3]); else pb.set(hx + fx, hy, E[3]); }
  for (const s of side ? [fx] : [-1, 1]) for (let k = 1; k <= 5; k++) {
    const ax = hx + s * Math.round(k * 0.7), ay = hy - 1 - k;
    pb.set(ax, ay, B[1]);
    if (k > 1 && k < 5) pb.set(ax + s, ay + 1, W[1]);
  }
  // dust shed when casting
  if (pose === "cast") for (let i = 0; i < 12; i++) { const a = i * 2.39, r = 6 + (i % 4) * 2; pb.set(Math.round(cx + Math.cos(a) * r), Math.round(by + 2 + Math.sin(a) * r * 0.8), E[3]); }
  // long legs dangling under it, the feet never touch the ground
  if (!back) for (const s of side ? [0] : [-1, 1]) for (let k = 0; k < 3; k++) pb.set(cx + s * (1 + (k >> 1)), by + 7 + k, B[0]);
  pb.outline(INK);
  return pb;
}
