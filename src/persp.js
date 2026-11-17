// The 3D view: a camera tilted over the valley, like the old "Mode 7". The ground is a plane seen in perspective,
// and everything that stands (people, trees, walls) is a billboard, kept upright and scaled by its distance.
//
// Coordinates: "flat" is the old top-down screen (world minus camera, in game pixels); "screen" is where it lands.
// Screen row sy shows flat row  fy = sA + D − D² / (sy − hy)  at a horizontal scale  k = (sy − hy) / D.
// At the anchor row sA (where the camera keeps the leader's feet) k = 1 and the vertical scale is 1 too, so the
// party looks exactly as in the flat view; farther away things shrink, nearer ones grow.
import { G } from "./state.js";

const KEY = "brumafolha.persp";
export const P = { on: true, tilt: 0.55, ss: 2, sA: 0, D: 1, hy: 0, cx: 0, kTop: 1, fyTop: 0, fyBot: 0 };
try { Object.assign(P, JSON.parse(localStorage.getItem(KEY)) ?? {}); } catch {}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ on: P.on, tilt: P.tilt })); } catch {} };

export function setPersp(on, tilt = P.tilt) { P.on = !!on; P.tilt = Math.max(0, Math.min(1, tilt)); save(); }

/** Recompute the camera for a view of vw × vh game pixels. */
export function frame(vw, vh) {
  P.cx = vw / 2;
  P.sA = Math.round(vh / 2 + 16); // the camera puts its focus 16 px under the middle
  P.D = vh * (1.0 + (1 - P.tilt) * 1.2); // smaller = steeper
  P.hy = P.sA - P.D; // the horizon, always above the top of the screen
  P.kTop = -P.hy / P.D;
  P.fyTop = rowToFlat(0);
  P.fyBot = rowToFlat(vh);
  return P;
}
export const rowToFlat = (sy) => P.sA + P.D - (P.D * P.D) / (sy - P.hy);

/** Flat (camera-relative) → screen, with the scale there. Null past the horizon. */
export function project(fx, fy) {
  const d = P.D - (fy - P.sA);
  if (d <= P.D * 0.05) return null;
  const k = P.D / d;
  return { x: P.cx + (fx - P.cx) * k, y: P.hy + P.D * k, k };
}
/** Screen → flat (on the ground). Null above the horizon. */
export function unproject(sx, sy) {
  if (sy <= P.hy + 1) return null;
  const k = (sy - P.hy) / P.D;
  return [P.cx + (sx - P.cx) / k, rowToFlat(sy)];
}

/** Where a world point is on screen, in game pixels (works in both views). */
export function worldToView(x, y) {
  const fx = x - G.cam.x, fy = y - G.cam.y;
  if (!P.on) return [fx, fy, 1];
  const p = project(fx, fy);
  return p ? [p.x, p.y, p.k] : [-9999, -9999, 1];
}

/**
 * The mouse relative to something standing at (x, y), in that thing's own (unscaled) pixels: [dx, dy], with dy < 0
 * above its feet. Lets picking test a sprite's box in both views.
 */
export function mouseRel(x, y) {
  const mx = G.mouse.x / G.scale, my = G.mouse.y / G.scale;
  if (!P.on) return [G.cam.x + mx - x, G.cam.y + my - y];
  const [sx, sy, k] = worldToView(x, y);
  return [(mx - sx) / k, (my - sy) / k];
}
