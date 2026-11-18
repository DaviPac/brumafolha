// Every icon in the game, drawn in code into one 16×16 atlas. An icon is a handful of shapes, each of a
// material; the shading is not drawn by hand: every material is bevelled from the top left (a lighter step
// where it meets the light, a darker one on the bottom right), stepped through a hard five-colour ramp, and
// the whole silhouette gets the game's dark outline. So all the icons agree with each other and with the sprites.
import { ramp, makeCanvas } from "../util.js";

export const IS = 16; // icon cell, px
const COLS = 16;
const INK = [24, 18, 30];

export const IRAMPS = {
  steel: ramp("#3a4250", "#5e6878", "#8a96a8", "#b8c4d4", "#e6eef6"),
  gold: ramp("#7a4a12", "#b07a1e", "#e0a832", "#f6d056", "#fff2a0"),
  wood: ramp("#3a1e14", "#5a2e1c", "#8a4c28", "#b46a36", "#dc9450"),
  leather: ramp("#2e1a10", "#4e2e1a", "#744828", "#9a663a", "#c08c58"),
  red: ramp("#5a1420", "#8f1d2c", "#c8342e", "#ea5a3c", "#ff9a6a"),
  fire: ramp("#8a1e10", "#d0401a", "#f07a1e", "#ffb43a", "#ffe88a"),
  green: ramp("#16401c", "#23682a", "#3c9a34", "#6cc84a", "#b4f07a"),
  teal: ramp("#124a50", "#1c787a", "#2ea8a0", "#5fd0c8", "#b0f4e6"),
  blue: ramp("#1c2a5e", "#2c4a9a", "#4a78d0", "#7aa8f0", "#c8e0ff"),
  purple: ramp("#2e1650", "#54288a", "#8448c4", "#b47cf0", "#e4c0ff"),
  bone: ramp("#5a5244", "#8a806a", "#bcb298", "#e8e0c8", "#fffaf0"),
  silver: ramp("#4a5a7a", "#7a92b8", "#a8c4e8", "#d4e6fa", "#ffffff"),
  skin: ramp("#6a3a24", "#9a5a38", "#c8845a", "#e8ac80", "#ffd4ac"),
  dark: ramp("#120e16", "#1c1624", "#2a2234", "#3c3248", "#54486a"),
  rope: ramp("#3a2a18", "#5e4628", "#86683c", "#aa8c54", "#d0b47a"),
};
const MATS = Object.keys(IRAMPS);

/** The little drawing kit one icon is made with. Later shapes cover earlier ones. */
class Pen {
  constructor() { this.m = new Int8Array(IS * IS).fill(-1); this.b = new Float32Array(IS * IS); }
  px(x, y, mat, bias = 0) {
    x = Math.round(x); y = Math.round(y);
    if (x < 1 || y < 1 || x > IS - 2 || y > IS - 2) return this;
    this.m[y * IS + x] = MATS.indexOf(mat); this.b[y * IS + x] = bias;
    return this;
  }
  /** Nudge the shade of pixels already drawn (+ lighter, − darker). */
  sh(x, y, bias) { x = Math.round(x); y = Math.round(y); if (this.m[y * IS + x] >= 0) this.b[y * IS + x] = bias; return this; }
  r(x, y, w, h, mat, bias = 0) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, mat, bias); return this; }
  l(x0, y0, x1, y1, mat, th = 1, bias = 0) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1;
    for (let i = 0; i <= n; i++) {
      const x = Math.round(x0 + ((x1 - x0) * i) / n), y = Math.round(y0 + ((y1 - y0) * i) / n);
      this.px(x, y, mat, bias);
      if (th > 1) { this.px(x + 1, y, mat, bias); if (th > 2) { this.px(x, y + 1, mat, bias); this.px(x + 1, y + 1, mat, bias); } }
    }
    return this;
  }
  e(cx, cy, rx, ry, mat, bias = 0) {
    for (let y = 0; y < IS; y++) for (let x = 0; x < IS; x++) if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) this.px(x, y, mat, bias);
    return this;
  }
  c(cx, cy, r, mat, bias = 0) { return this.e(cx, cy, r, r, mat, bias); }
  /** An arc of an ellipse, from angle a0 to a1 (radians, clockwise from east). */
  arc(cx, cy, rx, ry, a0, a1, mat, th = 1, bias = 0) {
    const n = Math.ceil(Math.abs(a1 - a0) * Math.max(rx, ry) * 1.5);
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n, x = Math.round(cx + Math.cos(a) * rx), y = Math.round(cy + Math.sin(a) * ry);
      this.px(x, y, mat, bias);
      if (th > 1) this.px(x + 1, y, mat, bias);
    }
    return this;
  }
  /** A filled polygon (pixel centres inside the outline). */
  p(pts, mat, bias = 0) {
    for (let y = 0; y < IS; y++) for (let x = 0; x < IS; x++) {
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[j];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
      }
      if (inside) this.px(x, y, mat, bias);
    }
    return this;
  }
  /** Rows of letters, each letter a material from `map` (space or dot = nothing). */
  s(x, y, rows, map, bias = 0) {
    rows.forEach((row, j) => [...row].forEach((ch, i) => { if (map[ch]) this.px(x + i, y + j, map[ch], bias); }));
    return this;
  }
  /** Shade, outline, and write the icon into the atlas image at cell (cx, cy). */
  bake(d, W, ox, oy) {
    const at = (x, y) => (x < 0 || y < 0 || x >= IS || y >= IS ? -1 : this.m[y * IS + x]);
    for (let y = 0; y < IS; y++) for (let x = 0; x < IS; x++) {
      const m = at(x, y), j = ((oy + y) * W + ox + x) * 4;
      let c = null;
      if (m >= 0) {
        let v = 0.5 + this.b[y * IS + x];
        const up = at(x, y - 1), le = at(x - 1, y), dn = at(x, y + 1), ri = at(x + 1, y);
        if (up < 0 || le < 0) v += 0.25; else if (up !== m || le !== m) v += 0.1;
        if (dn < 0 || ri < 0) v -= 0.25; else if (dn !== m || ri !== m) v -= 0.1;
        const R = IRAMPS[MATS[m]];
        c = R[Math.max(0, Math.min(R.length - 1, Math.round(v * (R.length - 1))))];
      } else if (at(x - 1, y) >= 0 || at(x + 1, y) >= 0 || at(x, y - 1) >= 0 || at(x, y + 1) >= 0) c = INK;
      if (c) { d[j] = c[0]; d[j + 1] = c[1]; d[j + 2] = c[2]; d[j + 3] = 255; }
    }
  }
}

// ---------------------------------------------------------------- the icons
const HI = 0.5, LO = -0.5;
const handle = (d, x0, y0, x1, y1) => d.l(x0, y0, x1, y1, "wood", 2);
const DRAW = {
  // ---- combat
  sword: (d) => { d.l(11, 2, 5, 8, "steel", 2).px(12, 2, "steel", HI).l(3, 7, 8, 12, "gold", 1).l(4, 7, 8, 11, "gold").l(4, 11, 3, 12, "wood", 2).px(2, 13, "gold").px(3, 13, "gold"); },
  cleave: (d) => { d.arc(8, 8, 6, 6, -2.2, 2.4, "silver", 2).arc(8, 8, 3, 3, -1.2, 2.8, "steel", 1).px(8, 8, "gold").px(3, 4, "silver", HI).px(4, 3, "silver", HI); },
  wind: (d) => { d.l(2, 5, 9, 5, "silver", 1).arc(9, 3.5, 2, 1.6, 1.5, -2.6, "silver").l(3, 8, 11, 8, "teal", 1).arc(11, 10, 2, 2, -1.5, 2.2, "teal").l(2, 11, 7, 11, "silver").px(5, 13, "teal").px(6, 13, "teal"); },
  flame: (d) => { d.p([[8, 1], [11, 5], [13, 9], [11, 13.5], [5, 13.5], [3, 9], [5, 6], [6, 8], [7, 4]], "fire", -0.1).p([[8, 6], [10, 10], [9, 13.5], [6.5, 13.5], [6, 10]], "gold", 0.1).px(8, 11, "gold", HI).px(8, 12, "bone", HI); },
  missiles: (d) => { for (const [x, y] of [[1, 8], [4, 4], [7, 11]]) d.l(x, y + 3, x + 3, y, "purple", 2).r(x + 4, y - 2, 3, 3, "silver", 0.2).px(x + 5, y - 1, "bone", HI); },
  heart: (d) => { d.c(5.5, 6, 3.2, "green").c(10.5, 6, 3.2, "green").p([[2.4, 7.2], [13.6, 7.2], [8, 14]], "green").r(7, 4, 2, 7, "bone", 0.3).r(5, 6, 6, 2, "bone", 0.3); },
  bow: (d) => { d.arc(4, 8, 7, 6.6, -1.35, 1.35, "wood", 2).l(5, 2, 5, 14, "bone").l(3, 8, 12, 8, "rope").p([[11, 6], [14.5, 8.5], [11, 11]], "steel").px(2, 7, "red").px(2, 9, "red"); },
  sun: (d) => { d.c(8, 8, 3.4, "gold", 0.1); for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4; d.l(8 + Math.cos(a) * 5.2, 8 + Math.sin(a) * 5.2, 8 + Math.cos(a) * 6.4, 8 + Math.sin(a) * 6.4, i % 2 ? "fire" : "gold"); } d.px(7, 7, "bone", HI); },
  word: (d) => { d.e(8, 7, 6.2, 4.6, "bone").p([[4, 10], [7, 10], [3.5, 14]], "bone").r(7, 4, 2, 6, "green").r(5, 6, 6, 2, "green"); },
  boot: (d) => { d.r(6, 2, 4, 9, "leather").r(6, 10, 8, 3, "leather").r(5, 13, 10, 1, "dark").r(6, 2, 4, 2, "rope").px(13, 10, "leather", LO).l(1, 6, 3, 6, "silver").l(1, 9, 4, 9, "silver").l(2, 12, 3, 12, "silver"); },
  target: (d) => { d.c(8, 8, 6.4, "red").c(8, 8, 4.4, "bone").c(8, 8, 2.4, "red").px(8, 8, "bone", HI); },
  potion: (d) => { d.r(7, 3, 2, 3, "silver").r(6, 1, 4, 2, "wood").c(8, 10, 4.6, "red").r(5, 8, 6, 1, "silver", 0.2).px(6, 10, "bone", HI).px(6, 11, "red", HI); },
  rage: (d) => { d.c(8, 8, 6.2, "red").l(4, 5, 7, 7, "dark").l(11, 5, 9, 7, "dark").px(5, 7, "bone", HI).px(10, 7, "bone", HI).r(5, 10, 6, 2, "dark").px(5, 10, "bone", HI).px(7, 10, "bone", HI).px(9, 10, "bone", HI).px(6, 11, "bone", HI).px(8, 11, "bone", HI).px(10, 11, "bone", HI); },
  bolt: (d) => { d.p([[10, 1], [4, 8.5], [7.5, 8.5], [5, 15], [12.5, 6.5], [9, 6.5], [12, 1]], "gold", 0.1); },
  hand: (d) => { d.r(5, 7, 6, 6, "skin").r(5, 4, 1, 3, "skin").r(7, 2, 1, 5, "skin").r(9, 2, 1, 5, "skin").r(11, 4, 1, 4, "skin").l(3, 8, 4, 10, "skin").r(6, 13, 4, 1, "skin").px(8, 9, "gold", HI).px(7, 10, "gold").px(9, 10, "gold").px(8, 11, "gold").px(2, 3, "gold").px(13, 2, "gold").px(13, 11, "gold"); },
  mask: (d) => { d.e(8, 7.5, 5.4, 6.2, "bone").l(4, 6, 6, 5, "dark").l(10, 5, 12, 6, "dark").px(5, 7, "dark").px(11, 7, "dark").arc(8, 8.5, 3, 3, 0.3, 2.85, "red").px(8, 12, "red"); },
  note: (d) => { d.r(9, 2, 2, 10, "gold").p([[11, 2], [14.5, 5], [14.5, 8], [11, 5]], "gold").e(7, 12, 3, 2.2, "gold"); },
  orb: (d) => { d.c(8, 8, 5.2, "purple").px(6, 6, "silver", HI).px(7, 5, "purple", HI).l(2, 3, 4, 4, "silver").l(13, 2, 12, 4, "silver").l(13, 13, 12, 12, "silver").px(2, 12, "silver"); },
  eye: (d) => { d.e(8, 8, 6.6, 3.8, "bone").c(8, 8, 2.6, "purple").px(8, 8, "dark", LO).px(7, 7, "silver", HI).l(3, 3, 4, 4, "purple").l(8, 2, 8, 3, "purple").l(13, 3, 12, 4, "purple"); },
  palmflame: (d) => { d.p([[8, 1], [11, 5], [11, 8.5], [5, 8.5], [5, 5], [7, 5]], "fire").px(8, 6, "gold", HI).px(8, 7, "gold", HI).r(3, 11, 10, 3, "skin").r(2, 10, 2, 2, "skin").r(12, 10, 2, 2, "skin"); },
  vine: (d) => { d.arc(6, 5, 3.5, 3, 3.3, 7.6, "green", 2).arc(9, 11, 3.5, 3, 0.2, 4.4, "green", 2).px(11, 3, "green", HI).px(12, 3, "green", HI).px(12, 4, "green").px(3, 9, "green", HI).px(2, 10, "green").px(3, 10, "green").px(13, 13, "green", HI).px(8, 8, "red"); },
  fist: (d) => { d.r(5, 5, 8, 7, "skin").r(5, 4, 2, 1, "skin").r(8, 4, 2, 1, "skin").r(11, 4, 2, 1, "skin").r(4, 8, 2, 4, "skin").r(6, 12, 6, 2, "leather").sh(7, 6, LO).sh(10, 6, LO).sh(7, 7, LO).sh(10, 7, LO).l(1, 4, 2, 4, "silver").l(1, 7, 2, 7, "silver").l(1, 10, 2, 10, "silver"); },
  leaf: (d) => { d.p([[12.5, 1.5], [14, 6], [11, 11], [6, 13.5], [3.5, 12.5], [2.5, 10], [5, 5], [9, 2]], "silver").l(12, 3, 4, 11, "blue").l(8, 7, 9, 4, "blue").l(8, 7, 11, 8, "blue").l(6, 9, 5, 7, "blue").l(3, 12, 1, 14, "blue").px(11, 3, "silver", HI); },
  // ---- interface
  bag: (d) => { d.arc(8, 4, 2.5, 2.5, 3.2, 6.2, "rope").r(3, 5, 10, 9, "leather").r(3, 5, 10, 4, "leather", 0.2).r(4, 14, 8, 1, "leather", LO).r(7, 8, 2, 3, "gold").px(3, 5, "leather", LO).px(12, 5, "leather", LO); },
  book: (d) => { d.r(3, 2, 10, 12, "red").r(3, 2, 2, 12, "red", LO).r(12, 3, 1, 10, "bone").r(5, 13, 8, 1, "bone", LO).r(7, 5, 4, 1, "gold").r(8, 4, 2, 3, "gold").r(7, 9, 4, 1, "gold", -0.2); },
  coin: (d) => { d.c(8, 8, 5.6, "gold").c(8, 8, 3.4, "gold", -0.3).r(8, 6, 1, 5, "gold", 0.3).px(7, 7, "gold", 0.3).px(6, 5, "bone", HI); },
  swap: (d) => { d.l(3, 5, 11, 5, "teal", 1).r(3, 5, 9, 2, "teal").p([[10, 2], [14.5, 6], [10, 10]], "teal").r(5, 10, 9, 2, "gold").p([[6, 7], [1.5, 11], [6, 15]], "gold"); },
  menu: (d) => { d.r(3, 3, 10, 2, "gold").r(3, 7, 10, 2, "gold").r(3, 11, 10, 2, "gold"); },
  sound: (d) => { d.r(2, 6, 3, 4, "steel").p([[5, 6], [8.5, 2.5], [8.5, 13.5], [5, 10]], "steel").arc(9, 8, 2, 3, -1, 1, "silver").arc(10, 8, 4, 5.5, -1, 1, "silver"); },
  mute: (d) => { d.r(2, 6, 3, 4, "steel").p([[5, 6], [8.5, 2.5], [8.5, 13.5], [5, 10]], "steel").l(10, 6, 14, 10, "red").l(14, 6, 10, 10, "red"); },
  d20: (d) => { d.p([[8, 0.5], [14.6, 4.2], [14.6, 11.8], [8, 15.5], [1.4, 11.8], [1.4, 4.2]], "silver").p([[8, 4], [12, 11], [4, 11]], "silver", 0.3).l(8, 1, 8, 4, "blue").l(2, 5, 4, 11, "blue").l(14, 5, 12, 11, "blue").l(4, 11, 8, 14, "blue").l(12, 11, 8, 14, "blue").l(4, 11, 12, 11, "blue").l(8, 4, 4, 11, "blue").l(8, 4, 12, 11, "blue").px(8, 8, "dark").px(8, 9, "dark").px(7, 9, "dark").px(9, 9, "dark"); },
  scroll: (d) => { d.r(4, 3, 8, 10, "bone").r(3, 2, 10, 2, "bone", 0.2).r(3, 12, 10, 2, "bone", -0.2).px(2, 2, "rope").px(13, 2, "rope").px(2, 13, "rope").px(13, 13, "rope").l(6, 6, 10, 6, "dark").l(6, 8, 9, 8, "dark").l(6, 10, 10, 10, "dark"); },
  warn: (d) => { d.p([[8, 1], [15, 14], [1, 14]], "gold").r(7, 2, 2, 1, "gold").r(7, 5, 2, 5, "dark").r(7, 11, 2, 2, "dark"); },
  close: (d) => { d.l(3, 3, 11, 11, "red", 2).l(11, 3, 3, 11, "red", 2); },
  bulb: (d) => { d.c(8, 6, 4.4, "gold", 0.1).r(6, 10, 4, 2, "steel").r(7, 12, 2, 1, "steel", LO).px(6, 4, "bone", HI).l(7, 7, 8, 9, "fire").l(9, 7, 8, 9, "fire"); },
  left: (d) => { d.p([[8, 2], [8, 14], [1.5, 8]], "gold").r(8, 6, 6, 4, "gold"); },
  right: (d) => { d.p([[8, 2], [14.5, 8], [8, 14]], "gold").r(2, 6, 6, 4, "gold"); },
  up: (d) => { d.p([[2, 8], [8, 1.5], [14, 8]], "gold").r(6, 8, 4, 6, "gold"); },
  down: (d) => { d.p([[2, 8], [14, 8], [8, 14.5]], "gold").r(6, 2, 4, 6, "gold"); },
  rotl: (d) => { d.arc(8, 8, 5, 5, -2.2, 2.6, "gold", 2).p([[1, 2], [7, 2], [1, 8]], "gold"); },
  rotr: (d) => { d.arc(8, 8, 5, 5, -0.9, -5.7, "gold", 2).p([[15, 2], [9, 2], [15, 8]], "gold"); },
  gem: (d) => { d.p([[8, 3], [13, 8], [8, 13], [3, 8]], "gold"); },
  star: (d) => { d.p([[8, 1], [9.5, 6.5], [15, 8], [9.5, 9.5], [8, 15], [6.5, 9.5], [1, 8], [6.5, 6.5]], "silver", 0.1); },
  check: (d) => { d.l(3, 8, 6, 11, "green", 2).l(6, 11, 12, 4, "green", 2); },
  gear: (d) => { d.c(8, 8, 4.6, "steel"); for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4; d.r(Math.round(7.5 + Math.cos(a) * 5.4), Math.round(7.5 + Math.sin(a) * 5.4), 2, 2, "steel"); } d.c(8, 8, 1.6, "dark"); },
  skull: (d) => { d.e(8, 7, 5.2, 4.8, "bone").r(5, 10, 6, 3, "bone").r(5, 6, 2, 3, "dark").r(9, 6, 2, 3, "dark").px(8, 9, "dark").px(8, 10, "dark").px(6, 12, "dark").px(8, 12, "dark").px(10, 12, "dark"); },
  talk: (d) => { d.e(8, 7, 6.2, 4.6, "bone").p([[4, 10], [7, 10], [3.5, 14]], "bone").r(5, 7, 1, 1, "dark").r(8, 7, 1, 1, "dark").r(11, 7, 1, 1, "dark"); },
  hp: (d) => { d.c(5.5, 6, 3.2, "red").c(10.5, 6, 3.2, "red").p([[2.4, 7.2], [13.6, 7.2], [8, 14]], "red").px(5, 5, "bone", HI); },
  ac: (d) => { d.p([[3, 2], [13, 2], [13, 8], [8, 14.5], [3, 8]], "steel").p([[8, 2], [13, 2], [13, 8], [8, 14.5]], "steel", -0.2); },
  move: (d) => { d.e(6, 5, 2.4, 3, "teal").r(4, 9, 4, 2, "teal").e(11, 9, 2.4, 3, "teal").r(9, 13, 4, 2, "teal"); },
  action: (d) => { d.c(8, 8, 5.4, "green"); },
  bonus: (d) => { d.p([[8, 2], [14.5, 13.5], [1.5, 13.5]], "fire"); },
  slot: (d) => { d.p([[8, 2], [14, 8], [8, 14], [2, 8]], "blue").px(6, 6, "silver", HI); },
  moon: (d) => { d.c(8, 8, 5.6, "silver"); const p = new Pen(); p.c(10.5, 6.5, 4.6, "dark"); for (let i = 0; i < IS * IS; i++) if (p.m[i] >= 0) d.m[i] = -1; },
  camp: (d) => { d.l(3, 13, 12, 10, "wood", 2).l(12, 13, 3, 10, "wood", 2).p([[8, 2], [11, 7], [10, 11], [6, 11], [5, 7]], "fire").px(8, 8, "gold", HI).px(8, 9, "gold", HI); },
  pad: (d) => { d.e(8, 8.5, 6.6, 4.2, "dark", 0.3).r(4, 7, 1, 3, "silver").r(3, 8, 3, 1, "silver").px(11, 7, "green", HI).px(12, 9, "red", HI).px(10, 9, "blue", HI); },
  // ---- things in the bag
  letter: (d) => { d.r(2, 4, 12, 9, "bone").l(2, 4, 7, 9, "rope").l(13, 4, 8, 9, "rope").c(7.5, 9.5, 1.6, "red"); },
  net: (d) => { for (let k = -12; k < 16; k += 4) { d.l(k, 3, k + 11, 14, "rope"); d.l(k + 11, 3, k, 14, "rope"); } const cut = new Pen(); cut.e(8, 8.5, 6.4, 5.6, "dark"); for (let i = 0; i < IS * IS; i++) if (cut.m[i] < 0) d.m[i] = -1; d.arc(8, 8.5, 6.4, 5.6, 0, 6.3, "rope", 1, 0.2).c(3, 4, 1.5, "bone").c(13, 4, 1.5, "bone"); },
  chair: (d) => { d.r(4, 2, 2, 10, "wood").r(4, 2, 5, 1, "wood").r(8, 2, 1, 6, "wood").r(4, 8, 8, 2, "wood", 0.2).r(10, 10, 2, 3, "wood").arc(8, 9, 6, 5, 0.35, 2.8, "wood", 1).px(6, 4, "wood", LO).px(6, 6, "wood", LO); },
  armor: (d) => { d.p([[4, 3], [12, 3], [13, 6], [11.5, 14], [4.5, 14], [3, 6]], "steel").r(2, 3, 3, 3, "steel", 0.2).r(11, 3, 3, 3, "steel", 0.2).p([[6, 2.5], [10, 2.5], [8, 5.5]], "dark").l(8, 6, 8, 13, "steel", 1, LO).r(5, 10, 6, 1, "leather"); },
  shield: (d) => { d.p([[3, 2], [13, 2], [13, 8], [8, 14.5], [3, 8]], "wood").p([[3, 2], [13, 2], [13, 3.5], [3, 3.5]], "steel").l(3, 2, 3, 8, "steel").l(12, 2, 12, 8, "steel").l(3, 8, 8, 14, "steel").l(12, 8, 8, 14, "steel").c(8, 7.5, 1.8, "gold"); },
  staff: (d) => { handle(d, 3, 13, 10, 5); d.c(11.5, 3.5, 2.4, "blue").px(11, 3, "silver", HI).px(9, 6, "gold").px(10, 6, "gold"); },
  axe: (d) => { handle(d, 3, 13, 10, 4); d.p([[8, 1.5], [13, 2], [14.5, 7], [11, 8.5], [9.5, 5.5]], "steel").sh(13, 6, HI); },
  hammer: (d) => { d.r(7, 6, 2, 9, "wood").r(3, 2, 10, 5, "steel").r(3, 2, 2, 5, "steel", -0.2).r(11, 2, 2, 5, "steel", 0.2); },
  dagger: (d) => { d.l(11, 3, 7, 7, "steel", 2).px(12, 2, "steel", HI).l(5, 6, 9, 10, "gold").l(5, 9, 4, 10, "wood", 2).px(3, 12, "gold").px(4, 12, "gold"); },
  spear: (d) => { d.l(2, 13, 10, 5, "wood", 1).l(3, 13, 11, 5, "wood", 1).p([[10, 3.5], [14.5, 1.5], [12.5, 6.5]], "steel").px(9, 7, "red").px(8, 7, "red"); },
  key: (d) => { d.c(5, 5, 3, "gold").c(5, 5, 1.2, "dark").l(7, 7, 12, 12, "gold", 2).r(11, 13, 2, 1, "gold").r(13, 11, 1, 2, "gold"); },
  lume: (d) => { d.p([[8, 1.5], [12, 7], [8, 14.5], [4, 7]], "silver").p([[8, 1.5], [12, 7], [8, 14.5]], "blue", 0.3).px(7, 5, "silver", HI).px(2, 3, "silver").px(13, 2, "silver").px(14, 12, "silver").px(2, 12, "silver"); },
  poster: (d) => { d.r(3, 2, 10, 12, "bone").c(8, 6.5, 2.4, "rope").r(6, 9, 4, 2, "rope").l(5, 12, 10, 12, "dark").px(8, 2, "steel", LO).px(7, 6, "dark").px(9, 6, "dark").l(11, 5, 12, 9, "silver"); },
  mug: (d) => { d.r(4, 5, 7, 9, "wood").r(4, 7, 7, 1, "steel").r(4, 11, 7, 1, "steel").arc(11, 9, 3, 3, -1.3, 1.3, "wood").r(4, 3, 7, 2, "bone").px(6, 2, "bone").px(9, 2, "bone"); },
  feather: (d) => { d.p([[12, 1.5], [14, 4], [10, 10], [6, 12], [5.5, 9], [8, 4]], "fire", -0.2).l(12, 3, 3, 13, "bone").l(9, 5, 10, 8, "red").l(7, 8, 8, 10, "red"); },
  smoke: (d) => { d.r(6, 8, 5, 6, "green").r(6, 10, 5, 2, "red").r(7, 7, 3, 1, "fire", 0.3).arc(9, 4.5, 2, 1.6, 1.6, 5.4, "silver").arc(6.5, 2.5, 2, 1.4, -1.4, 2.2, "silver"); },
  lantern: (d) => { d.arc(8, 3, 2.4, 2, 3.2, 6.2, "steel").r(5, 4, 6, 2, "steel").r(5, 6, 6, 6, "gold", 0.2).r(5, 12, 6, 2, "steel").r(7, 6, 2, 6, "fire", 0.3).r(5, 6, 1, 6, "steel").r(10, 6, 1, 6, "steel"); },
  chest: (d) => { d.r(2, 5, 12, 9, "wood").r(2, 5, 12, 3, "wood", 0.2).r(2, 8, 12, 1, "steel").r(2, 5, 1, 9, "steel").r(13, 5, 1, 9, "steel").r(7, 7, 2, 3, "gold"); },
  seal: (d) => { d.c(8, 8, 5.8, "red").r(7, 6, 2, 6, "red", LO).r(6, 4, 4, 2, "red", LO).px(6, 3, "red", LO).px(9, 3, "red", LO).px(4, 6, "red", HI); },
  tooth: (d) => { d.p([[4, 2], [12, 2], [11, 9], [8, 14.5], [5, 9]], "bone").l(8, 3, 8, 6, "rope").px(5, 3, "green").px(6, 3, "green").px(11, 4, "green"); },
  bread: (d) => { d.e(8, 9, 6, 4.2, "rope", 0.1).l(5, 7, 6, 9, "wood").l(8, 6, 9, 9, "wood").l(11, 7, 12, 9, "wood"); },
  veil: (d) => { d.p([[8, 1.5], [13, 6], [13, 14], [3, 14], [3, 6]], "bone").e(8, 8.5, 3, 3.6, "dark").px(8, 3, "silver", HI); },
  crown: (d) => { d.p([[2, 12], [2, 4], [5, 8], [8, 3], [11, 8], [14, 4], [14, 12]], "gold").r(2, 11, 12, 2, "gold", -0.2).px(8, 9, "red", HI).px(4, 10, "blue", HI).px(12, 10, "blue", HI); },
  // the relics of Velmoor (src/relics.js): white silver and glass, with one warm or blue note each
  bell: (d) => { d.p([[8, 2], [11, 5], [12, 11], [4, 11], [5, 5]], "silver", 0.1).r(3, 11, 10, 2, "silver", -0.2).px(8, 1, "steel").px(6, 5, "silver", HI).px(6, 6, "silver", HI).c(8, 13.5, 1.2, "blue"); },
  quill: (d) => { d.p([[13, 1.5], [14, 3], [9, 10], [6, 11.5], [6, 9], [9, 4]], "bone", 0.1).l(13, 2, 3, 14, "silver").l(4, 13, 3, 14, "dark").px(10, 5, "bone", LO).px(8, 8, "bone", LO); },
  ring: (d) => { d.c(8, 9, 5, "silver").c(8, 9, 2.6, "dark").r(6, 3, 4, 2, "silver", -0.2).px(7, 3, "dark").px(8, 3, "dark").px(5, 7, "silver", HI); },
  mirror: (d) => { d.p([[3, 13], [8, 2], [13, 12]], "blue", 0.2).p([[5, 12], [8, 5], [10, 10]], "silver", 0.2).px(7, 6, "silver", HI).px(6, 9, "silver", HI); },
  cup: (d) => { d.p([[2, 3], [14, 3], [11, 8], [5, 8]], "silver").r(7, 8, 2, 4, "silver", -0.1).r(5, 12, 6, 2, "silver", -0.2).l(8, 3, 8, 7, "steel").px(4, 4, "silver", HI).px(5, 5, "bone"); },
  ribbon: (d) => { d.p([[2, 3], [14, 3], [13, 9], [14, 14], [10, 11], [6, 11], [2, 14], [3, 9]], "bone", 0.1).r(7, 4, 2, 5, "silver", -0.3).r(6, 5, 4, 1, "silver", -0.3).px(8, 3, "gold"); },
};

export const ICON_NAMES = Object.keys(DRAW);
const INDEX = Object.fromEntries(ICON_NAMES.map((k, i) => [k, i]));
const ROWS = Math.ceil(ICON_NAMES.length / COLS);
let atlas = null, url = null;

/** The atlas canvas: every icon in a 16-px grid, in the order of ICON_NAMES. */
export function iconAtlas() {
  if (atlas) return atlas;
  const W = COLS * IS, H = ROWS * IS;
  const [c, ctx] = makeCanvas(W, H);
  const img = ctx.createImageData(W, H);
  ICON_NAMES.forEach((k, i) => { const d = new Pen(); DRAW[k](d); d.bake(img.data, W, (i % COLS) * IS, Math.floor(i / COLS) * IS); });
  ctx.putImageData(img, 0, 0);
  return (atlas = c);
}

/** Give the page the atlas (as a CSS variable the .ico class reads). Call once at boot. */
export function installIcons() {
  url ??= iconAtlas().toDataURL();
  const st = document.documentElement.style;
  st.setProperty("--atlas", `url(${url})`);
  st.setProperty("--atlas-cols", COLS);
  st.setProperty("--atlas-rows", ROWS);
}

/** HTML for one icon. Unknown names fall back to the little gem, so a typo never shows a hole. */
export function icon(name, cls = "") {
  const i = INDEX[name] ?? INDEX.gem;
  return `<i class="ico ${cls}" style="--ix:${i % COLS};--iy:${Math.floor(i / COLS)}"></i>`;
}

/** One icon on its own canvas (for the sheet, or to draw into the game). */
export function iconCanvas(name) {
  const i = INDEX[name] ?? INDEX.gem, [c, ctx] = makeCanvas(IS, IS);
  ctx.drawImage(iconAtlas(), (i % COLS) * IS, Math.floor(i / COLS) * IS, IS, IS, 0, 0, IS, IS);
  return c;
}
