// A* over the tile grid, 8 directions, no corner cutting.
import { MW, MH } from "./world.js";

export function findPath(blocked, sx, sy, gx, gy, maxNodes = 4000) {
  if (sx === gx && sy === gy) return [];
  if (blocked(gx, gy)) return null;
  const key = (x, y) => y * MW + x;
  const g = new Map(), from = new Map(), open = [[0, sx, sy]];
  g.set(key(sx, sy), 0);
  const h = (x, y) => { const dx = Math.abs(x - gx), dy = Math.abs(y - gy); return Math.max(dx, dy) + 0.4 * Math.min(dx, dy); };
  let n = 0;
  while (open.length && n++ < maxNodes) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i][0] < open[bi][0]) bi = i;
    const [, x, y] = open.splice(bi, 1)[0];
    if (x === gx && y === gy) {
      const out = [];
      let k = key(x, y);
      while (from.has(k)) { out.push([k % MW, (k / MW) | 0]); k = from.get(k); }
      return out.reverse();
    }
    const gc = g.get(key(x, y));
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= MW || ny >= MH || blocked(nx, ny)) continue;
        if (dx && dy && (blocked(x + dx, y) || blocked(x, y + dy))) continue;
        const ng = gc + (dx && dy ? 1.4 : 1);
        const k = key(nx, ny);
        if (g.has(k) && g.get(k) <= ng) continue;
        g.set(k, ng); from.set(k, key(x, y));
        open.push([ng + h(nx, ny), nx, ny]);
      }
  }
  return null;
}

/** Every tile reachable within `steps` moves (diagonals count as one, like the tabletop). */
export function reachable(blocked, sx, sy, steps) {
  const dist = new Map([[sy * MW + sx, 0]]), q = [[sx, sy]];
  while (q.length) {
    const [x, y] = q.shift(), d = dist.get(y * MW + x);
    if (d >= steps) continue;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy, k = ny * MW + nx;
        if (blocked(nx, ny) || dist.has(k)) continue;
        if (dx && dy && (blocked(x + dx, y) || blocked(x, y + dy))) continue;
        dist.set(k, d + 1); q.push([nx, ny]);
      }
  }
  return dist;
}

/** Shortest path where every step costs 1, for combat moves. */
export function gridPath(blocked, sx, sy, gx, gy) {
  const prev = new Map([[sy * MW + sx, -1]]), q = [[sx, sy]];
  while (q.length) {
    const [x, y] = q.shift();
    if (x === gx && y === gy) break;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy, k = ny * MW + nx;
        if (blocked(nx, ny) || prev.has(k)) continue;
        if (dx && dy && (blocked(x + dx, y) || blocked(x, y + dy))) continue;
        prev.set(k, y * MW + x); q.push([nx, ny]);
      }
  }
  let k = gy * MW + gx;
  if (!prev.has(k)) return null;
  const out = [];
  while (prev.get(k) !== -1) { out.push([k % MW, (k / MW) | 0]); k = prev.get(k); }
  return out.reverse();
}
