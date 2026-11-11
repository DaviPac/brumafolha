// The interface's frames, drawn in code as tiny 9-slice images: an ink outline, a bronze rim lit from the top
// left, an inset shadow, a flat centre. CSS stretches the edges and keeps the corners (border-image), so one
// 24-px drawing frames a panel of any size. Also the big pixel d20 of the skill checks.
import { makeCanvas, ramp, rampAt } from "../util.js";
import { IRAMPS } from "./icons.js";

const INK = [24, 18, 30];
const PLUM = ramp("#120e18", "#1a1522", "#221b2c", "#2c2338", "#3a2e48");
const PAPER = ramp("#8a7350", "#b89c70", "#d8c090", "#eadbb0", "#f6ecd0");

/**
 * One frame. `b` is the border thickness in px (the slice), `rim` a ramp, `fill` a colour [r,g,b,a?].
 * Layers from the outside in: ink, rim light/dark, rim mid, ink, inset shade, fill.
 */
function frame({ size = 24, b = 6, rim = IRAMPS.gold, fill = PLUM[1], studs = false, inset = PLUM, cut = 1, flat = false }) {
  const [c, ctx] = makeCanvas(size, size), img = ctx.createImageData(size, size), d = img.data, S = size - 1;
  const set = (x, y, col) => { const j = (y * size + x) * 4; d[j] = col[0]; d[j + 1] = col[1]; d[j + 2] = col[2]; d[j + 3] = col[3] ?? 255; };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const k = Math.min(x, y, S - x, S - y); // ring index from the outside
    const lit = (x === k && y <= S - k - 1) || (y === k && x <= S - k - 1);
    // cut corners: a rounder silhouette
    if (cut && ((x < cut && y < cut) || (S - x < cut && y < cut) || (x < cut && S - y < cut) || (S - x < cut && S - y < cut))) continue;
    let col;
    if (k === 0) col = INK;
    else if (flat) col = k === 1 ? (lit ? rim[3] : rim[1]) : fill;
    else if (k === 1) col = lit ? rim[4] : rim[1];
    else if (k === 2) col = lit ? rim[2] : rim[0];
    else if (k === 3 && b >= 5) col = INK;
    else if (k === 4 && b >= 6) col = lit ? inset[0] : inset[3];
    else col = fill;
    set(x, y, col);
  }
  if (studs) {
    // a small bright stud on each corner of the rim
    for (const [cx, cy] of [[1, 1], [S - 3, 1], [1, S - 3], [S - 3, S - 3]]) {
      for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) set(cx + i, cy + j, i + j === 0 ? IRAMPS.bone[4] : i + j < 2 ? rim[4] : i + j < 4 ? rim[2] : rim[0]);
      for (let i = -1; i <= 3; i++) for (const [x, y] of [[cx + i, cy - 1], [cx + i, cy + 3], [cx - 1, cy + i], [cx + 3, cy + i]]) if (x >= 0 && y >= 0 && x <= S && y <= S && d[(y * size + x) * 4 + 3] && !(x >= cx && x < cx + 3 && y >= cy && y < cy + 3)) set(x, y, INK);
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

const FRAMES = {
  panel: () => frame({ studs: true, fill: [...PLUM[1], 244] }),
  panel2: () => frame({ rim: IRAMPS.steel, fill: [...PLUM[1], 236], b: 6 }),
  tip: () => frame({ size: 16, b: 4, rim: IRAMPS.gold, fill: [...PLUM[0], 250], flat: true }),
  paper: () => frame({ rim: IRAMPS.rope, fill: PAPER[3], inset: [PAPER[1], PAPER[1], PAPER[1], PAPER[4]] }),
  btn: () => frame({ size: 16, b: 4, rim: IRAMPS.wood, fill: IRAMPS.wood[1], flat: true }),
  btnHi: () => frame({ size: 16, b: 4, rim: IRAMPS.gold, fill: IRAMPS.wood[2], flat: true }),
  btnGo: () => frame({ size: 16, b: 4, rim: IRAMPS.gold, fill: IRAMPS.gold[0], flat: true }),
  btnOff: () => frame({ size: 16, b: 4, rim: IRAMPS.dark, fill: PLUM[2], flat: true }),
  slot: () => frame({ size: 16, b: 4, rim: IRAMPS.steel, fill: PLUM[0], flat: true, cut: 1 }),
  slotHi: () => frame({ size: 16, b: 4, rim: IRAMPS.gold, fill: PLUM[2], flat: true, cut: 1 }),
  port: () => frame({ size: 16, b: 4, rim: IRAMPS.rope, fill: [0, 0, 0, 0], flat: true }),
  portHi: () => frame({ size: 16, b: 4, rim: IRAMPS.gold, fill: [0, 0, 0, 0], flat: true }),
  portFoe: () => frame({ size: 16, b: 4, rim: IRAMPS.red, fill: [0, 0, 0, 0], flat: true }),
  bar: () => frame({ size: 12, b: 3, rim: IRAMPS.dark, fill: PLUM[0], flat: true, cut: 0 }),
  plate: () => frame({ size: 16, b: 4, rim: IRAMPS.gold, fill: IRAMPS.wood[0], flat: true }),
  chip: () => frame({ size: 12, b: 3, rim: IRAMPS.dark, fill: PLUM[3], flat: true }),
};

/** Hand every frame to CSS as --f-<name>. Call once at boot. */
export function installFrames() {
  const st = document.documentElement.style;
  for (const [k, f] of Object.entries(FRAMES)) st.setProperty(`--f-${k}`, `url(${f().toDataURL()})`);
  // a 4×4 ordered-dither tile, for dim overlays that stay in the pixel-art grain
  const [c, ctx] = makeCanvas(4, 4);
  ctx.fillStyle = "rgba(8,6,14,0.5)";
  for (const [x, y] of [[0, 0], [2, 0], [1, 1], [3, 1], [0, 2], [2, 2], [1, 3], [3, 3]]) ctx.fillRect(x, y, 1, 1);
  st.setProperty("--dither", `url(${c.toDataURL()})`);
}
export const frameCanvas = (k) => FRAMES[k]();
export const FRAME_NAMES = Object.keys(FRAMES);

/** The twenty-sided die of a skill check: a hexagon of facets, each shaded by where it faces. 64×64. */
export function makeD20(tone = "silver") {
  const N = 64, [c, ctx] = makeCanvas(N, N), img = ctx.createImageData(N, N), d = img.data;
  const R = IRAMPS[tone], C = [32, 32];
  const hexPt = (i, r) => [C[0] + Math.sin((i * Math.PI) / 3) * r, C[1] - Math.cos((i * Math.PI) / 3) * r * 1.04];
  const O = [0, 1, 2, 3, 4, 5].map((i) => hexPt(i, 29));
  const T = [hexPt(0, 15), hexPt(2, 15), hexPt(4, 15)]; // the facing triangle
  // facets: the centre triangle, three kites to the corners between, and six slivers on the rim
  const facets = [
    { p: T, v: 0.86 },
    { p: [T[0], O[0], O[1], O[2], T[1]], v: 0.56 }, { p: [T[1], O[2], O[3], O[4], T[2]], v: 0.3 }, { p: [T[2], O[4], O[5], O[0], T[0]], v: 0.7 },
  ];
  const inside = (pts, x, y) => { let s = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) s = !s; } return s; };
  const segD = (x, y, [ax, ay], [bx, by]) => { const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy))); return Math.hypot(x - ax - dx * t, y - ay - dy * t); };
  const edges = [[T[0], T[1]], [T[1], T[2]], [T[2], T[0]], [T[0], O[0]], [T[1], O[2]], [T[2], O[4]], [T[0], O[1]], [T[1], O[1]], [T[1], O[3]], [T[2], O[3]], [T[2], O[5]], [T[0], O[5]]];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (!inside(O, x + 0.5, y + 0.5)) continue;
    let v = 0.5;
    for (const f of facets) if (inside(f.p, x + 0.5, y + 0.5)) { v = f.v; break; }
    // the split kites: the half nearer the light is a step brighter
    v += ((32 - x) + (32 - y)) / 220;
    let col = rampAt(R, v, x, y);
    if (edges.some(([a, b]) => segD(x + 0.5, y + 0.5, a, b) < 0.8)) col = R[0];
    const j = (y * N + x) * 4;
    d[j] = col[0]; d[j + 1] = col[1]; d[j + 2] = col[2]; d[j + 3] = 255;
  }
  // outline
  const a = (x, y) => (x < 0 || y < 0 || x >= N || y >= N ? 0 : d[(y * N + x) * 4 + 3]);
  const add = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (!a(x, y) && (a(x - 1, y) || a(x + 1, y) || a(x, y - 1) || a(x, y + 1))) add.push(x, y);
  for (let i = 0; i < add.length; i += 2) { const j = (add[i + 1] * N + add[i]) * 4; d[j] = INK[0]; d[j + 1] = INK[1]; d[j + 2] = INK[2]; d[j + 3] = 255; }
  ctx.putImageData(img, 0, 0);
  return c;
}
