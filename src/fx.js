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

export class FxLayer {
  constructor() { this.list = []; this.resize(16, 16); }
  resize(w, h) {
    this.w = w; this.h = h;
    this.frame = createFrame(w, h);
    [this.cc, this.cctx] = makeCanvas(w, h);
    [this.lc, this.lctx] = makeCanvas(w, h);
    this.ci = new ImageData(w, h); this.li = new ImageData(w, h);
  }
  /** opts: pixelfx options plus x, y in world px. extra: { move: {x,y,dur}, onDone, layer } */
  spawn(mod, opts = {}, extra = {}) {
    const fx = createFx(mod, { seed: (Math.random() * 1e6) | 0, ...opts });
    const e = { fx, x: opts.x ?? 0, y: opts.y ?? 0, ...extra, t: 0 };
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
  draw(ctx, camX, camY, view) {
    const vis = this.list.filter((e) => e.x > camX - 200 && e.x < camX + this.w + 200 && e.y > camY - 200 && e.y < camY + this.h + 260);
    if (!vis.length) return;
    const f = this.frame;
    clearFrame(f);
    f.ox = camX | 0; f.oy = camY | 0;
    for (const e of vis) e.fx.draw(f);
    const n = f.w * f.h, C = f.color, L = f.light, cd = this.ci.data, ld = this.li.data;
    let anyL = false;
    for (let i = 0; i < n; i++) {
      const c = C[i], l = L[i], j = i * 4;
      cd[j] = c & 255; cd[j + 1] = (c >>> 8) & 255; cd[j + 2] = (c >>> 16) & 255; cd[j + 3] = c >>> 24;
      if (l & 0xffffff) { anyL = true; ld[j] = l & 255; ld[j + 1] = (l >>> 8) & 255; ld[j + 2] = (l >>> 16) & 255; ld[j + 3] = 255; }
      else ld[j + 3] = 0;
    }
    this.cctx.putImageData(this.ci, 0, 0);
    ctx.drawImage(this.cc, 0, 0);
    if (anyL) {
      this.lctx.putImageData(this.li, 0, 0);
      ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.drawImage(this.lc, 0, 0); ctx.restore();
    }
  }
}
