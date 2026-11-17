// Bridge to pixelfx: effects live in world coordinates, draw into one screen-sized frame, and get
// composited over the scene (color with alpha, then light added on top).
import { createFrame, clearFrame, createFx, PAL } from "../vendor/pixelfx/src/core/index.js";
import * as campfire from "../vendor/pixelfx/src/fx/fire/campfire.js";
import * as fireball from "../vendor/pixelfx/src/fx/fire/fireball.js";
import * as hitSpark from "../vendor/pixelfx/src/fx/impacts/hit-spark.js";
import * as critHit from "../vendor/pixelfx/src/fx/impacts/crit-hit.js";
import * as swordSlash from "../vendor/pixelfx/src/fx/melee/sword-slash.js";
import * as poof from "../vendor/pixelfx/src/fx/spawn/poof.js";
import * as bloom from "../vendor/pixelfx/src/fx/nature/healing-bloom.js";
import * as butterfly from "../vendor/pixelfx/src/fx/critters/butterfly.js";
import * as fireflies from "../vendor/pixelfx/src/fx/weather/fireflies.js";
import * as leaves from "../vendor/pixelfx/src/fx/weather/falling-leaves.js";
import { makeCanvas } from "./util.js";

export const FX = { campfire, fireball, hitSpark, critHit, swordSlash, poof, bloom, butterfly, fireflies, leaves };
export { PAL };
const FX_LIGHT = new Map([
  [fireball, { r: 70, i: 0.9, c: "#ffae35", life: 9, shadows: true }], [hitSpark, { r: 44, i: 0.8, c: "#fff6c4", life: 0.35 }], [critHit, { r: 60, i: 1, c: "#fff6c4", life: 0.45 }],
  [bloom, { r: 64, i: 0.8, c: "#7ee88a", life: 1.1 }],
]);

export class FxLayer {
  constructor() { this.list = []; this.resize(16, 16); }
  resize(w, h) {
    this.w = w; this.h = h;
    this.frame = createFrame(w, h);
    [this.cc, this.cctx] = makeCanvas(w, h);
    [this.lc, this.lctx] = makeCanvas(w, h);
    this.ci = new ImageData(w, h); this.li = new ImageData(w, h);
    this.c32 = new Uint32Array(this.ci.data.buffer); this.l32 = new Uint32Array(this.li.data.buffer);
    this.hadLight = false;
  }
  /** opts: pixelfx options plus x, y in world px. extra: { move: {x,y,dur}, onDone, layer } */
  spawn(mod, opts = {}, extra = {}) {
    const fx = createFx(mod, { seed: (Math.random() * 1e6) | 0, ...opts });
    const e = { fx, mod, pal: opts.palette, x: opts.x ?? 0, y: opts.y ?? 0, ...extra, t: 0 };
    if (e.move) { e.sx = e.x; e.sy = e.y; }
    this.list.push(e);
    return e;
  }
  update(dt) {
    for (const e of this.list) {
      e.t += dt;
      e.fx.update(dt);
      if (e.move) {
        const k = Math.min(1, e.t / e.move.dur);
        e.x = e.sx + (e.move.x - e.sx) * k; e.y = e.sy + (e.move.y - e.sy) * k - Math.sin(k * Math.PI) * (e.move.arc ?? 0);
        e.fx.options.x = e.x; e.fx.options.y = e.y;
        if (k >= 1 && !e.arrived) { e.arrived = true; e.onArrive?.(); e.fx.stop(); }
      }
      if (e.life && e.t > e.life && !e.stopped) { e.stopped = true; e.fx.stop(); }
    }
    this.list = this.list.filter((e) => { const d = e.fx.done(); if (d) e.onDone?.(); return !d || e.keep; });
  }
  /** Light thrown by the effects in flight (spells, sparks, blooms), for the lighting renderer. Campfires are lit by their prop. */
  lights() {
    const out = [];
    for (const e of this.list) {
      const L = FX_LIGHT.get(e.mod);
      if (!L) continue;
      const fade = e.move ? (e.arrived ? 0 : 1) : Math.max(0, 1 - e.t / L.life);
      if (fade <= 0) continue;
      const hex = e.pal?.[Math.max(0, e.pal.length - 3)] ?? L.c, n = parseInt(hex.slice(1), 16);
      out.push({ x: e.x, y: e.y, r: L.r, c: [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255], i: L.i * fade, shadows: !!L.shadows });
    }
    return out;
  }
  /**
   * The 3D view: each effect is painted alone into a small frame around its anchor and handed to place(x, y, fn),
   * which sets up the billboard transform for that spot and calls fn(ctx) to draw in flat coordinates.
   */
  drawEach(camX, camY, place) {
    if (!this.small) {
      const W = 240, H = 272;
      const S = this.small = { f: createFrame(W, H), ax: 120, ay: 212 };
      [S.cc, S.cctx] = makeCanvas(W, H);
      [S.lc, S.lctx] = makeCanvas(W, H);
      S.ci = new ImageData(W, H); S.li = new ImageData(W, H);
      S.c32 = new Uint32Array(S.ci.data.buffer); S.l32 = new Uint32Array(S.li.data.buffer);
    }
    this.lightPixels = null;
    const S = this.small, f = S.f;
    for (const e of this.list) {
      f.ox = Math.round(e.x) - S.ax; f.oy = Math.round(e.y) - S.ay;
      place(e.x, e.y, (ctx) => {
        clearFrame(f);
        e.fx.draw(f);
        this.blit(ctx, f, S, f.ox - camX, f.oy - camY);
      });
    }
  }
  /** A small pixelfx frame onto a context at x, y: color with alpha, then light added on top. */
  blit(ctx, f, B, x, y) {
    const n = f.w * f.h, C = f.color, L = f.light, c32 = B.c32, l32 = B.l32;
    let anyC = false, anyL = false;
    for (let i = 0; i < n; i++) {
      const c = C[i], l = L[i] & 0xffffff;
      c32[i] = c;
      if (c) anyC = true;
      if (l) { anyL = true; l32[i] = l | 0xff000000; } else l32[i] = 0;
    }
    if (ctx.pixels) { // the GPU layer takes the pixels as they are
      if (anyC) ctx.pixels("fx-small", B.ci.data, f.w, f.h, null, x, y, f.w, f.h);
      if (anyL) { ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.pixels("fx-small-light", B.li.data, f.w, f.h, null, x, y, f.w, f.h); ctx.restore(); }
      return;
    }
    if (anyC) { B.cctx.putImageData(B.ci, 0, 0); ctx.drawImage(B.cc, x, y); }
    if (anyL) {
      B.lctx.putImageData(B.li, 0, 0);
      ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.drawImage(B.lc, x, y); ctx.restore();
    }
  }
  /** `lit`: the lighting renderer adds the light layer itself, straight from `lightPixels` (no canvas in between). */
  draw(ctx, camX, camY, lit) {
    const vis = this.list.filter((e) => e.x > camX - 200 && e.x < camX + this.w + 200 && e.y > camY - 200 && e.y < camY + this.h + 260);
    this.lightPixels = null;
    if (!vis.length) return;
    const f = this.frame;
    clearFrame(f);
    f.ox = camX | 0; f.oy = camY | 0;
    for (const e of vis) e.fx.draw(f);
    // the frame's pixels are already laid out like ImageData's (R in the low byte): copy whole words, and note the box
    // each layer's pixels fall in, so only that much is handed to the canvas (or, for the light, to the GPU)
    const C = f.color, L = f.light, c32 = this.c32, l32 = this.l32, w = f.w, h = f.h;
    let cx0 = w, cy0 = h, cx1 = -1, cy1 = -1, x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0, i = 0; y < h; y++) {
      let anyC = false, any = false;
      for (let x = 0; x < w; x++, i++) {
        const c = C[i], l = L[i] & 0xffffff;
        c32[i] = c;
        if (c >>> 24) { anyC = true; if (x < cx0) cx0 = x; if (x > cx1) cx1 = x; }
        if (l) { l32[i] = l | 0xff000000; any = true; if (x < x0) x0 = x; if (x > x1) x1 = x; } else l32[i] = 0;
      }
      if (anyC) { if (y < cy0) cy0 = y; cy1 = y; }
      if (any) { if (y < y0) y0 = y; y1 = y; }
    }
    if (cx1 >= 0) {
      const bw = cx1 - cx0 + 1, bh = cy1 - cy0 + 1;
      if (ctx.pixels) ctx.pixels("fx", this.ci.data, w, h, [cx0, cy0, bw, bh], cx0, cy0, bw, bh); // the GPU layer takes the pixels as they are
      else { this.cctx.putImageData(this.ci, 0, 0, cx0, cy0, bw, bh); ctx.drawImage(this.cc, cx0, cy0, bw, bh, cx0, cy0, bw, bh); }
    }
    if (x1 < 0) return;
    if (lit) { this.lightPixels = { data: this.li.data, x0, y0, x1, y1 }; return; }
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    this.lctx.putImageData(this.li, 0, 0, x0, y0, bw, bh);
    ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.drawImage(this.lc, x0, y0, bw, bh, x0, y0, bw, bh); ctx.restore();
  }
}
