// A* over the tile grid, 8 directions, no corner cutting; BFS reach and paths for combat (path.js).
#include "game.h"
#include <stdlib.h>
#include <string.h>

typedef struct { double f; int x, y; } OpenNode;

int findPath(BlockedFn blocked, void *ctx, int sx, int sy, int gx, int gy, TilePt *out, int maxOut) {
  const int maxNodes = 4000;
  if (sx == gx && sy == gy) return 0;
  if (blocked(gx, gy, ctx)) return -1;
  static double g[MW * MH];
  static int from[MW * MH];
  static bool has[MW * MH];
  memset(has, 0, sizeof has);
  for (int i = 0; i < MW * MH; i++) from[i] = -1;
  int cap = 1024, nopen = 0;
  OpenNode *open = malloc(sizeof(OpenNode) * cap);
  open[nopen++] = (OpenNode){ 0, sx, sy };
  g[sy * MW + sx] = 0; has[sy * MW + sx] = true;
  int n = 0, result = -1;
  while (nopen && n++ < maxNodes) {
    int bi = 0;
    for (int i = 1; i < nopen; i++) if (open[i].f < open[bi].f) bi = i;
    OpenNode cur = open[bi];
    memmove(open + bi, open + bi + 1, sizeof(OpenNode) * (nopen - bi - 1));
    nopen--;
    int x = cur.x, y = cur.y;
    if (x == gx && y == gy) {
      int len = 0, k = y * MW + x;
      while (from[k] >= 0) { len++; k = from[k]; }
      if (len > maxOut) len = maxOut;
      k = y * MW + x;
      int i = 0, total = 0;
      { int kk = k; while (from[kk] >= 0) { total++; kk = from[kk]; } }
      // collect from the goal back, then keep the first maxOut steps from the start
      TilePt *tmp = malloc(sizeof(TilePt) * (total + 1));
      while (from[k] >= 0) { tmp[i++] = (TilePt){ k % MW, k / MW }; k = from[k]; }
      for (int j = 0; j < len; j++) out[j] = tmp[total - 1 - j];
      free(tmp);
      result = len;
      break;
    }
    double gc = g[y * MW + x];
    for (int dy = -1; dy <= 1; dy++)
      for (int dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        int nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= MW || ny >= MH || blocked(nx, ny, ctx)) continue;
        if (dx && dy && (blocked(x + dx, y, ctx) || blocked(x, y + dy, ctx))) continue;
        double ng = gc + (dx && dy ? 1.4 : 1);
        int k = ny * MW + nx;
        if (has[k] && g[k] <= ng) continue;
        g[k] = ng; has[k] = true; from[k] = y * MW + x;
        int ddx = abs(nx - gx), ddy = abs(ny - gy);
        double h = (ddx > ddy ? ddx : ddy) + 0.4 * (ddx < ddy ? ddx : ddy);
        if (nopen == cap) { cap *= 2; open = realloc(open, sizeof(OpenNode) * cap); }
        open[nopen++] = (OpenNode){ ng + h, nx, ny };
      }
  }
  free(open);
  return result;
}

/** Every tile reachable within `steps` moves (diagonals count as one, like the tabletop). */
int reachable(BlockedFn blocked, void *ctx, int sx, int sy, int steps, int *dist, int *order) {
  for (int i = 0; i < MW * MH; i++) dist[i] = -1;
  int qh = 0, qt = 0, n = 0;
  static int q[MW * MH];
  dist[sy * MW + sx] = 0; order[n++] = sy * MW + sx; q[qt++] = sy * MW + sx;
  while (qh < qt) {
    int k0 = q[qh++], x = k0 % MW, y = k0 / MW, d = dist[k0];
    if (d >= steps) continue;
    for (int dy = -1; dy <= 1; dy++)
      for (int dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        int nx = x + dx, ny = y + dy, k = ny * MW + nx;
        if (blocked(nx, ny, ctx) || dist[k] >= 0) continue;
        if (dx && dy && (blocked(x + dx, y, ctx) || blocked(x, y + dy, ctx))) continue;
        dist[k] = d + 1; order[n++] = k; q[qt++] = k;
      }
  }
  return n;
}

/** Shortest path where every step costs 1, for combat moves. */
int gridPath(BlockedFn blocked, void *ctx, int sx, int sy, int gx, int gy, TilePt *out, int maxOut) {
  static int prev[MW * MH], q[MW * MH];
  for (int i = 0; i < MW * MH; i++) prev[i] = -2;
  int qh = 0, qt = 0;
  prev[sy * MW + sx] = -1; q[qt++] = sy * MW + sx;
  while (qh < qt) {
    int k0 = q[qh++], x = k0 % MW, y = k0 / MW;
    if (x == gx && y == gy) break;
    for (int dy = -1; dy <= 1; dy++)
      for (int dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        int nx = x + dx, ny = y + dy, k = ny * MW + nx;
        if (blocked(nx, ny, ctx) || prev[k] != -2) continue;
        if (dx && dy && (blocked(x + dx, y, ctx) || blocked(x, y + dy, ctx))) continue;
        prev[k] = y * MW + x; q[qt++] = k;
      }
  }
  if (gx < 0 || gy < 0 || gx >= MW || gy >= MH) return -1;
  int k = gy * MW + gx;
  if (prev[k] == -2) return -1;
  int total = 0;
  for (int kk = k; prev[kk] != -1; kk = prev[kk]) total++;
  int len = total < maxOut ? total : maxOut, i = total - 1;
  TilePt tmp[MW * MH / 4 + 8];
  for (int kk = k; prev[kk] != -1; kk = prev[kk]) { if (i < (int)(sizeof tmp / sizeof *tmp)) tmp[i] = (TilePt){ kk % MW, kk / MW }; i--; }
  for (int j = 0; j < len; j++) out[j] = tmp[j];
  return len;
}
