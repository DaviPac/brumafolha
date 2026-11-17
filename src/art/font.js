// The game's pixel font, drawn here glyph by glyph and turned into a real TrueType font in memory, so the whole
// DOM interface can use it (wrapping, bold, inputs) with no font file and no network. 5×7 capitals, a 5-px
// x-height, two rows of descender, and three rows above the capitals for Portuguese accents.
// One font pixel is 100 units of a 1300-unit em: at `font-size: 13px × n` every font pixel is exactly n screen pixels.

const G7 = {
  A: ".###./#...#/#...#/#####/#...#/#...#/#...#", B: "####./#...#/#...#/####./#...#/#...#/####.", C: ".###./#...#/#..../#..../#..../#...#/.###.",
  D: "####./#...#/#...#/#...#/#...#/#...#/####.", E: "#####/#..../#..../####./#..../#..../#####", F: "#####/#..../#..../####./#..../#..../#....",
  G: ".###./#...#/#..../#.###/#...#/#...#/.####", H: "#...#/#...#/#...#/#####/#...#/#...#/#...#", I: "###/.#./.#./.#./.#./.#./###",
  J: "..##/...#/...#/...#/...#/#..#/.##.", K: "#...#/#..#./#.#../##.../#.#../#..#./#...#", L: "#.../#.../#.../#.../#.../#.../####",
  M: "#...#/##.##/#.#.#/#.#.#/#...#/#...#/#...#", N: "#...#/##..#/##..#/#.#.#/#..##/#..##/#...#", O: ".###./#...#/#...#/#...#/#...#/#...#/.###.",
  P: "####./#...#/#...#/####./#..../#..../#....", Q: ".###./#...#/#...#/#...#/#.#.#/#..#./.##.#", R: "####./#...#/#...#/####./#.#../#..#./#...#",
  S: ".####/#..../#..../.###./....#/....#/####.", T: "#####/..#../..#../..#../..#../..#../..#..", U: "#...#/#...#/#...#/#...#/#...#/#...#/.###.",
  V: "#...#/#...#/#...#/#...#/.#.#./.#.#./..#..", W: "#...#/#...#/#...#/#.#.#/#.#.#/##.##/#...#", X: "#...#/#...#/.#.#./..#../.#.#./#...#/#...#",
  Y: "#...#/#...#/.#.#./..#../..#../..#../..#..", Z: "#####/....#/...#./..#../.#.../#..../#####",
  a: "/ /.###./....#/.####/#...#/.####", b: "#..../#..../####./#...#/#...#/#...#/####.", c: "/ /.###/#.../#.../#.../.###",
  d: "....#/....#/.####/#...#/#...#/#...#/.####", e: "/ /.###./#...#/#####/#..../.###.", f: "..##/.#../###./.#../.#../.#../.#..",
  g: "/ /.####/#...#/#...#/#...#/.####/....#/.###.", h: "#..../#..../####./#...#/#...#/#...#/#...#", i: "#/ /#/#/#/#/#",
  j: ".#/ /.#/.#/.#/.#/.#/.#/#.", k: "#.../#.../#..#/#.#./##../#.#./#..#", l: "#/#/#/#/#/#/#",
  m: "/ /##.#./#.#.#/#.#.#/#.#.#/#.#.#", n: "/ /####./#...#/#...#/#...#/#...#", o: "/ /.###./#...#/#...#/#...#/.###.",
  p: "/ /####./#...#/#...#/#...#/####./#..../#....", q: "/ /.####/#...#/#...#/#...#/.####/....#/....#", r: "/ /#.##/##../#.../#.../#...",
  s: "/ /.###/#.../.##./...#/###.", t: ".#../.#../###./.#../.#../.#../..##", u: "/ /#...#/#...#/#...#/#...#/.####",
  v: "/ /#...#/#...#/#...#/.#.#./..#..", w: "/ /#...#/#...#/#.#.#/#.#.#/.#.#.", x: "/ /#...#/.#.#./..#../.#.#./#...#",
  y: "/ /#...#/#...#/#...#/#...#/.####/....#/.###.", z: "/ /#####/...#./..#../.#.../#####",
  0: ".###./#...#/#..##/#.#.#/##..#/#...#/.###.", 1: "..#../.##../..#../..#../..#../..#../.###.", 2: ".###./#...#/....#/...#./..#../.#.../#####",
  3: ".###./#...#/....#/..##./....#/#...#/.###.", 4: "...#./..##./.#.#./#..#./#####/...#./...#.", 5: "#####/#..../####./....#/....#/#...#/.###.",
  6: ".###./#..../#..../####./#...#/#...#/.###.", 7: "#####/....#/...#./..#../..#../..#../..#..", 8: ".###./#...#/#...#/.###./#...#/#...#/.###.",
  9: ".###./#...#/#...#/.####/....#/....#/.###.",
  ".": "/ / / / / /#", ",": "/ / / / / /.#/#.", ":": "/ /#/ / / /#", ";": "/ /.#/ / / /.#/#.", "!": "#/#/#/#/#/ /#", "?": ".###./#...#/....#/...#./..#../ /..#..",
  "'": "#/#", '"': "#.#/#.#", "(": ".#/#./#./#./#./#./.#", ")": "#./.#/.#/.#/.#/.#/#.", "[": "##/#./#./#./#./#./##", "]": "##/.#/.#/.#/.#/.#/##",
  "{": ".##/.#./.#./#../.#./.#./.##", "}": "##./.#./.#./..#/.#./.#./##.",
  "-": "/ / /###", "–": "/ / /####", "—": "/ / /######", "−": "/ / /####", "+": "/..#../..#../#####/..#../..#..", "=": "/ /####/ /####",
  "/": "....#/...#./...#./..#../.#.../.#.../#....", "\\": "#..../.#.../.#.../..#../...#./...#./....#", "*": "/#.#/.#./#.#", "%": "##..#/##.#./...#./..#../.#.../.#.##/#..##",
  "#": ".#.#./.#.#./#####/.#.#./#####/.#.#./.#.#.", "&": ".##../#..#./#.#../.#.../#.#.#/#..#./.##.#", "@": ".###./#...#/#.###/#.#.#/#.###/#..../.###.",
  "<": "...#/..#./.#../#.../.#../..#./...#", ">": "#.../.#../..#./...#/..#./.#../#...", "_": "/ / / / / / /#####", "~": "/ / /.#.#/#.#.", "|": "#/#/#/#/#/#/#",
  "$": "..#../.####/#.#../.###./..#.#/####./..#..", "°": ".#./#.#/.#.", "º": ".#./#.#/.#./ /###", "ª": ".##/#.#/.##/ /###",
  "×": "/ /#.#/.#./#.#", "·": "/ / /#", "•": "/ /.##./####/####/.##.", "…": "/ / / / / /#.#.#",
  "“": ".#.#/#.#.", "”": ".#.#/#.#.", "‘": ".#/#.", "’": ".#/#.", "«": "/ /.#.#/#.#./.#.#", "»": "/ /#.#./.#.#/#.#.",
  "→": "/...#../....#./######/....#./...#..", "←": "/..#.../.#..../######/.#..../..#...", "↑": "/..#../.###./#.#.#/..#../..#../..#..", "↓": "/..#../..#../..#../#.#.#/.###./..#..",
  "¡": "#/ /#/#/#/#/#", "¿": "..#../ /..#../.#.../#..../#...#/.###.",
};

// accents: [dx, dy] from the top centre of the letter, dy counted upward (1 = the row right above the gap)
const MARKS = {
  acute: [[0, 1], [1, 2]], grave: [[0, 1], [-1, 2]], circ: [[-1, 1], [1, 1], [0, 2]], tilde: [[-1, 1], [1, 1], [0, 2], [2, 2]], uml: [[-1, 1], [1, 1]],
};
const ACCENTED = {
  acute: "aeiouAEIOU|áéíóúÁÉÍÓÚ", grave: "aA|àÀ", circ: "aeoAEO|âêôÂÊÔ",
  tilde: "aoAOnN|ãõÃÕñÑ", uml: "uU|üÜ",
};

const ROWS_UP = 10, ROWS_DOWN = 3; // rows above the baseline (3 for accents + 7), and below it
const PX = 100, EM = (ROWS_UP + ROWS_DOWN) * PX;

/** Every glyph as { ch, w, px: [[x, y]] } with y counted up from the baseline (0 = the row sitting on it). */
function glyphs(bold) {
  const out = [];
  const parse = (src) => {
    const rows = src.split("/").map((r) => r.trimEnd());
    const w = Math.max(...rows.map((r) => r.length), 1), px = [];
    rows.forEach((r, j) => [...r].forEach((c, i) => { if (c === "#") px.push([i, 6 - j]); }));
    return { w, px };
  };
  const add = (ch, g) => {
    let { w, px } = g;
    const minX = Math.min(0, ...px.map((p) => p[0]));
    px = px.map(([x, y]) => [x - minX, y]);
    w = Math.max(w - minX, ...px.map((p) => p[0] + 1));
    if (bold) {
      // thicken every stroke to the right, but never close a one-pixel gap (m, w, #)
      const has = new Set(px.map(([x, y]) => x + "," + y));
      px = [...px, ...px.filter(([x, y]) => !has.has(x + 2 + "," + y) || has.has(x + 1 + "," + y)).map(([x, y]) => [x + 1, y])];
      w++;
    }
    out.push({ ch, w, px });
  };
  for (const [ch, src] of Object.entries(G7)) add(ch, parse(src));
  for (const [mark, set] of Object.entries(ACCENTED)) {
    const [bases, chars] = set.split("|");
    [...bases].forEach((b, i) => {
      // a dotless i under an accent
      const g = b === "i" ? parse("/ /#/#/#/#/#") : parse(G7[b]);
      const upper = b === b.toUpperCase(), top = upper ? 6 : 4, cx = Math.floor((g.w - 1) / 2);
      add([...chars][i], { w: g.w, px: [...g.px, ...MARKS[mark].map(([dx, dy]) => [cx + dx, top + 1 + dy])] });
    });
  }
  // ç Ç: a hook under the c
  for (const [b, ch] of [["c", "ç"], ["C", "Ç"]]) { const g = parse(G7[b]); const cx = Math.floor(g.w / 2); add(ch, { w: g.w, px: [...g.px, [cx, -1], [cx - 1, -2]] }); }
  add(" ", { w: 2, px: [] });
  add(" ", { w: 2, px: [] });
  return out.sort((a, b) => a.ch.codePointAt(0) - b.ch.codePointAt(0));
}

// ---------------------------------------------------------------- a minimal TrueType writer
class Buf {
  constructor() { this.a = []; }
  u8(v) { this.a.push(v & 255); return this; }
  u16(v) { this.a.push((v >> 8) & 255, v & 255); return this; }
  i16(v) { return this.u16(v < 0 ? v + 65536 : v); }
  u32(v) { this.a.push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255); return this; }
  tag(s) { for (const c of s) this.a.push(c.charCodeAt(0)); return this; }
  pad() { while (this.a.length % 4) this.a.push(0); return this; }
  get length() { return this.a.length; }
}
const checksum = (bytes) => { let s = 0; for (let i = 0; i < bytes.length; i += 4) s = (s + (((bytes[i] << 24) | ((bytes[i + 1] ?? 0) << 16) | ((bytes[i + 2] ?? 0) << 8) | (bytes[i + 3] ?? 0)) >>> 0)) >>> 0; return s; };

/** Build a TrueType font (ArrayBuffer) out of the pixel glyphs. */
export function buildFont(family, bold = false) {
  const list = glyphs(bold);
  // glyph 0 is .notdef: a hollow box
  const box = []; for (let y = 0; y < 7; y++) for (let x = 0; x < 4; x++) if (x === 0 || x === 3 || y === 0 || y === 6) box.push([x, y]);
  const all = [{ ch: null, w: 4, px: box }, ...list];

  // outlines: one rectangle per horizontal run of pixels, merged downward when the run repeats
  const glyf = new Buf(), loca = [0], hmtx = new Buf();
  let maxPts = 0, maxCont = 0, xMaxAll = 0, advMax = 0;
  for (const g of all) {
    const rows = new Map();
    for (const [x, y] of g.px) (rows.get(y) ?? rows.set(y, new Set()).get(y)).add(x);
    const rects = [];
    for (const [y, xs] of rows) {
      const s = [...xs].sort((a, b) => a - b);
      for (let i = 0; i < s.length; ) { let j = i; while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++; rects.push([s[i], y, s[j] + 1, y + 1]); i = j + 1; }
    }
    rects.sort((a, b) => a[0] - b[0] || a[2] - b[2] || a[1] - b[1]);
    const merged = [];
    for (const r of rects) { const m = merged[merged.length - 1]; if (m && m[0] === r[0] && m[2] === r[2] && m[3] === r[1]) m[3] = r[3]; else merged.push([...r]); }
    const adv = (g.w + 1) * PX;
    advMax = Math.max(advMax, adv);
    hmtx.u16(adv).i16(0);
    if (!merged.length) { loca.push(glyf.length); continue; }
    const pts = [];
    for (const [x0, y0, x1, y1] of merged) pts.push([x0, y0], [x0, y1], [x1, y1], [x1, y0]); // clockwise, y up
    const X = pts.map((p) => p[0] * PX), Y = pts.map((p) => p[1] * PX);
    const xMax = Math.max(...X);
    xMaxAll = Math.max(xMaxAll, xMax);
    maxPts = Math.max(maxPts, pts.length); maxCont = Math.max(maxCont, merged.length);
    glyf.i16(merged.length).i16(Math.min(...X)).i16(Math.min(...Y)).i16(xMax).i16(Math.max(...Y));
    merged.forEach((_, i) => glyf.u16(i * 4 + 3));
    glyf.u16(0);
    for (let i = 0; i < pts.length; i++) glyf.u8(1);
    let px = 0; for (const x of X) { glyf.i16(x - px); px = x; }
    let py = 0; for (const y of Y) { glyf.i16(y - py); py = y; }
    glyf.pad();
    loca.push(glyf.length);
  }
  const locaB = new Buf(); for (const o of loca) locaB.u32(o);

  // cmap, format 4: one segment per run of consecutive code points
  const segs = [];
  list.forEach((g, i) => { const c = g.ch.codePointAt(0), id = i + 1, s = segs[segs.length - 1]; if (s && s.end + 1 === c) s.end = c; else segs.push({ start: c, end: c, delta: (id - c) & 0xffff }); });
  segs.push({ start: 0xffff, end: 0xffff, delta: 1 });
  const n = segs.length, sr = 2 * 2 ** Math.floor(Math.log2(n)), cmap = new Buf();
  cmap.u16(0).u16(1).u16(3).u16(1).u32(12);
  cmap.u16(4).u16(16 + n * 8).u16(0).u16(n * 2).u16(sr).u16(Math.log2(sr / 2)).u16(n * 2 - sr);
  for (const s of segs) cmap.u16(s.end);
  cmap.u16(0);
  for (const s of segs) cmap.u16(s.start);
  for (const s of segs) cmap.u16(s.delta);
  for (let i = 0; i < n; i++) cmap.u16(0);

  const asc = ROWS_UP * PX, desc = -ROWS_DOWN * PX;
  const head = new Buf();
  head.u32(0x00010000).u32(0x00010000).u32(0).u32(0x5f0f3cf5).u16(0x000b).u16(EM).u32(0).u32(0).u32(0).u32(0)
    .i16(0).i16(desc).i16(xMaxAll).i16(asc).u16(bold ? 1 : 0).u16(8).i16(2).i16(1).i16(0);
  const hhea = new Buf();
  hhea.u32(0x00010000).i16(asc).i16(desc).i16(0).u16(advMax).i16(0).i16(0).i16(xMaxAll).i16(1).i16(0).i16(0).i16(0).i16(0).i16(0).i16(0).i16(0).u16(all.length);
  const maxp = new Buf();
  maxp.u32(0x00010000).u16(all.length).u16(maxPts).u16(maxCont).u16(0).u16(0).u16(2).u16(0).u16(0).u16(0).u16(0).u16(0).u16(0).u16(0).u16(0);
  const post = new Buf();
  post.u32(0x00030000).u32(0).i16(-200).i16(100).u32(0).u32(0).u32(0).u32(0).u32(0);
  const os2 = new Buf();
  os2.u16(4).i16(600).u16(bold ? 700 : 400).u16(5).u16(0);
  for (const v of [650, 600, 0, 75, 650, 600, 0, 350, 100, 300]) os2.i16(v);
  os2.i16(0);
  for (let i = 0; i < 10; i++) os2.u8(0);
  os2.u32(3).u32(0).u32(0).u32(0).tag("BRUM").u16(bold ? 0x20 : 0x40).u16(32).u16(0x2193)
    .i16(asc).i16(desc).i16(0).u16(asc).u16(-desc).u32(1).u32(0).i16(5 * PX).i16(7 * PX).u16(0).u16(32).u16(1);
  const name = new Buf();
  const style = bold ? "Bold" : "Regular", strs = [[1, family], [2, style], [3, `${family}-${style}-1`], [4, `${family} ${style}`], [5, "Version 1.0"], [6, `${family}-${style}`.replace(/\s/g, "")]];
  name.u16(0).u16(strs.length).u16(6 + strs.length * 12);
  let off = 0;
  for (const [id, s] of strs) { name.u16(3).u16(1).u16(0x409).u16(id).u16(s.length * 2).u16(off); off += s.length * 2; }
  for (const [, s] of strs) for (const c of s) name.u16(c.charCodeAt(0));

  const tables = [["OS/2", os2], ["cmap", cmap], ["glyf", glyf], ["head", head], ["hhea", hhea], ["hmtx", hmtx], ["loca", locaB], ["maxp", maxp], ["name", name], ["post", post]];
  const nt = tables.length, srT = 16 * 2 ** Math.floor(Math.log2(nt)), file = new Buf();
  file.u32(0x00010000).u16(nt).u16(srT).u16(Math.log2(srT / 16)).u16(nt * 16 - srT);
  let at = 12 + nt * 16, headAt = 0;
  for (const [tag, b] of tables) {
    const len = b.length; b.pad();
    file.tag(tag).u32(checksum(b.a)).u32(at).u32(len);
    if (tag === "head") headAt = at;
    at += b.a.length;
  }
  for (const [, b] of tables) file.a.push(...b.a);
  const adj = (0xb1b0afba - checksum(file.a)) >>> 0;
  file.a[headAt + 8] = adj >>> 24; file.a[headAt + 9] = (adj >>> 16) & 255; file.a[headAt + 10] = (adj >>> 8) & 255; file.a[headAt + 11] = adj & 255;
  return new Uint8Array(file.a).buffer;
}

/** Register "Bruma" (regular and bold) with the page. Resolves when text can be drawn with it. */
export async function installFont() {
  try {
    const faces = [new FontFace("Bruma", buildFont("Bruma", false), { weight: "400" }), new FontFace("Bruma", buildFont("Bruma", true), { weight: "700" })];
    for (const f of faces) document.fonts.add(await f.load());
    return true;
  } catch (e) {
    console.warn("pixel font failed to load, falling back to monospace", e);
    return false;
  }
}

/** Has the font a glyph for every character of this text? (used by the sheet to catch missing letters) */
export function missingGlyphs(text) {
  const have = new Set(glyphs(false).map((g) => g.ch));
  return [...new Set([...text].filter((c) => c !== "\n" && !have.has(c)))];
}
