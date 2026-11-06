// The ground, painted once per pixel: grass, dry meadow, dirt road, ruin flagstones, water, the dock (art/ground.js).
#include "game.h"
#include <stdlib.h>
#include <string.h>

static RGB P_grass[6], P_dry[5], P_dirt[5], P_stone[5], P_water[5], P_wood[5], P_bank[2];
#define GR RAMP(P_grass)
static void initPal(void) {
  static bool done;
  if (done) return;
  done = true;
  const char *g[] = { "#2b5226", "#38702b", "#4a8a30", "#5fa335", "#7bba3c", "#9bcf4a" }; ramp_hex(P_grass, 6, g);
  const char *d[] = { "#6e5f2a", "#857436", "#9c8a42", "#b39e4e", "#c8b35c" }; ramp_hex(P_dry, 5, d);
  const char *r[] = { "#5e4228", "#755634", "#8c6a40", "#a07d4c", "#b5925a" }; ramp_hex(P_dirt, 5, r);
  const char *s[] = { "#3d403f", "#4f5450", "#62685f", "#777d70", "#8d9383" }; ramp_hex(P_stone, 5, s);
  const char *w[] = { "#1f6f8f", "#2788a2", "#33a3b0", "#4abcbb", "#6dd3c6" }; ramp_hex(P_water, 5, w);
  const char *o[] = { "#6a3420", "#8e4a28", "#b4652f", "#d4833c", "#e8a052" }; ramp_hex(P_wood, 5, o);
  const char *b[] = { "#1f3d22", "#2a4d26" }; ramp_hex(P_bank, 2, b);
}

static RGB flagstone(double x, double y, double sf) {
  // irregular flagstones: a jittered Voronoi, bevelled from the top left, grass in the cracks
  const double C = 15;
  double gx = floor(x / C), gy = floor(y / C);
  double d1 = 1e9, d2 = 1e9, cid = 0, px = 0, py = 0;
  for (int j = -1; j <= 1; j++)
    for (int i = -1; i <= 1; i++) {
      double cx = (gx + i + 0.2 + hash2(gx + i, gy + j, 61) * 0.6) * C, cy = (gy + j + 0.2 + hash2(gx + i, gy + j, 62) * 0.6) * C;
      double d = hypot(x - cx, (y - cy) * 1.15);
      if (d < d1) { d2 = d1; d1 = d; cid = (gx + i) * 7919 + (gy + j); px = cx; py = cy; } else if (d < d2) d2 = d;
    }
  double edge = d2 - d1;
  double moss = fbm(x / 18, y / 18, 13, 2);
  bool gone = hash2(cid, 1, 8) < 0.16 || (sf < 0.45 && hash2(cid, 2, 8) < 0.5);
  int ix = (int)x, iy = (int)y;
  if (gone) return rampAt(GR, 0.25 + moss * 0.5, ix, iy);
  if (edge < 1.6) return moss > 0.5 ? P_grass[1] : P_stone[0];
  double v = 0.42 + hash2(cid, 3, 9) * 0.3;
  double nx = (x - px) / C, ny = (y - py) / C;
  if (edge < 3.2) v += nx + ny < 0 ? 0.18 : -0.16; // bevel
  v += (vnoise(x / 3, y / 3, 14) - 0.5) * 0.2;
  if (moss > 0.64) return rampAt(GR, (moss - 0.6) * 2.5 + 0.2, ix, iy);
  return rampAt(RAMP(P_stone), v, ix, iy);
}

static uint8_t *GD; static int GW, GH;
static void gset(double fx, double fy, RGB c) {
  int x = (int)fx, y = (int)fy;
  if (x < 0 || y < 0 || x >= GW || y >= GH) return;
  uint8_t *d = GD + ((size_t)y * GW + x) * 4;
  d[0] = u8c(c.r); d[1] = u8c(c.g); d[2] = u8c(c.b);
}

static void plank(int x0, int y0, int x1, int y1) {
  for (int y = y0; y < y1; y++)
    for (int x = x0; x < x1; x++) {
      int px = x - x0, col = px / 7, lx = px % 7;
      double seed = col * 31 + floor((y - y0 + hash2(col, 0, 5) * 40) / 46);
      RGB c;
      if (lx == 0) c = P_wood[0];
      else {
        double grain = vnoise(x / 2.0, y / 9.0, seed) * 0.35;
        double v = 0.45 + hash2(seed, 1, 6) * 0.25 + grain - (lx == 6 ? 0.25 : 0) + (lx == 1 ? 0.2 : 0);
        // knots and worn spots
        if (hash2(floor(x / 4.0), floor(y / 5.0), seed) > 0.985) v = 0.05;
        c = rampAt(RAMP(P_wood), v, x, y);
      }
      // plank ends
      if ((y - y0 + (int)floor(hash2(col, 0, 5) * 40)) % 46 == 0) c = P_wood[0];
      gset(x, y, c);
    }
  // front face: the thickness of the boards
  RGB a = { 28, 60, 70 }, b = { 30, 80, 95 };
  for (int x = x0; x < x1; x++) {
    gset(x, y1, P_wood[1]); gset(x, y1 + 1, P_wood[1]); gset(x, y1 + 2, P_wood[0]);
    gset(x, y1 + 3, a); gset(x, y1 + 4, b);
  }
}

Img paintGround(const World *W) {
  initPal();
  int w = MW * TILE, h = MH * TILE;
  Img img = img_new(w, h);
  uint8_t *d = img.px;
  GD = d; GW = w; GH = h;
  float *lushAt = calloc((size_t)w * h, sizeof(float)), *wfAt = calloc((size_t)w * h, sizeof(float));
  // lushness is smooth: sample it every 4 px and interpolate
  const int LS = 4, lw = w / LS + 1, lh = h / LS + 1;
  float *lushGrid = calloc((size_t)lw * (lh + 1), sizeof(float));
  for (int gy = 0; gy <= h / LS; gy++) for (int gx = 0; gx < lw; gx++) lushGrid[gy * lw + gx] = (float)lushField(gx * LS, gy * LS);
  for (int y = 0; y < h; y++)
    for (int x = 0; x < w; x++) {
      int i = y * w + x;
      double wf = waterField(x, y);
      wfAt[i] = (float)wf;
      RGB c;
      if (wf < 0) {
        double depth = clamp01(-wf * 3.2);
        double v = 1 - depth + (vnoise(x / 14.0, y / 7.0, 2) - 0.5) * 0.25;
        c = rampAt(RAMP(P_water), v, x, y);
      } else {
        double pf = pathField(x, y), sf = stoneField(x, y);
        double gx = (double)x / LS, gy = (double)y / LS; int xi = (int)gx, yi = (int)gy; double u = gx - xi, v = gy - yi; int k = yi * lw + xi;
        double lush = ((double)lushGrid[k] * (1 - u) + (double)lushGrid[k + 1] * u) * (1 - v) + ((double)lushGrid[k + lw] * (1 - u) + (double)lushGrid[k + lw + 1] * u) * v;
        lushAt[i] = (float)lush;
        double base = fbm(x / 38.0, y / 38.0, 1, 3) * 0.7 + vnoise(x / 6.0, y / 6.0, 4) * 0.3;
        if (pf < 16) c = rampAt(RAMP(P_dirt), base * 0.9 + 0.15 - fmax(0, pf - 10) * 0.03, x, y);
        else if (sf > 0.35) c = flagstone(x, y, sf);
        else if (lush < 0.41) c = rampAt(RAMP(P_dry), base * 0.85 + 0.1, x, y);
        else c = rampAt(GR, base * 0.8 + (lush - 0.41) * 0.8 - (fbm(x / 70.0, y / 70.0, 41, 2) < 0.4 ? 0.18 : 0), x, y);
        // grass overhangs the water as a dark lip
        if (wf < 0.035) c = P_bank[wf < 0.018 ? 0 : 1];
      }
      uint8_t *p = d + (size_t)i * 4;
      p[0] = (uint8_t)c.r; p[1] = (uint8_t)c.g; p[2] = (uint8_t)c.b; p[3] = 255;
    }
  free(lushGrid);

  Rng R; rng_seed(&R, 99);
  // grass blades: little two-tone strokes, denser where it is lush
  for (int k = 0; k < 230000; k++) {
    int x = rng_int(&R, 0, w - 1), y = rng_int(&R, 2, h - 1);
    int tt = tileAt(W, x / TILE, y / TILE);
    if (tt != T_GRASS || (double)wfAt[y * w + x] < 0.06) continue;
    double l = lushAt[y * w + x];
    bool dry = l < 0.41;
    if (rng_next(&R) > (dry ? 0.35 : 0.85)) continue;
    const RGB *P = dry ? P_dry : P_grass; int PN = dry ? 5 : 6;
    bool hi = rng_next(&R) < 0.6;
    RGB top;
    if (hi) { int ix = 3 + rng_int(&R, 0, 2); top = P[ix < PN - 1 ? ix : PN - 1]; } else top = P[1];
    int bh = rng_int(&R, 2, 4);
    int lean = rng_chance(&R, 0.5) ? 1 : -1;
    gset(x, y, P[0]);
    for (int s = 1; s <= bh; s++) gset(x + (s > bh - 1 ? lean : 0), y - s, s == bh ? top : P[hi ? 3 : 2]);
    if (rng_chance(&R, 0.45)) { gset(x + 2, y, P[0]); gset(x + 2, y - 1, P[2]); gset(x + 2 + lean, y - 2, top); }
  }
  // flowers and mushrooms
  RGB FL[4][3];
  { const char *a[] = { "#5b2c8f", "#8a4ccf", "#c99cff" }; ramp_hex(FL[0], 3, a); }
  { const char *a[] = { "#8f1d2c", "#d13a3a", "#ff8a6a" }; ramp_hex(FL[1], 3, a); }
  { const char *a[] = { "#a07a10", "#e8c03a", "#fff2a0" }; ramp_hex(FL[2], 3, a); }
  { const char *a[] = { "#8a8aa8", "#e8e8f4", "#ffffff" }; ramp_hex(FL[3], 3, a); }
  for (int k = 0; k < 2600; k++) {
    int cx = rng_int(&R, 0, w - 1), cy = rng_int(&R, 0, h - 1);
    if (tileAt(W, cx / TILE, cy / TILE) != T_GRASS || (double)wfAt[cy * w + cx] < 0.08) continue;
    if ((double)lushAt[cy * w + cx] < 0.45 && rng_chance(&R, 0.7)) continue;
    const RGB *F = FL[(int)floor(rng_next(&R) * 4)];
    int n = rng_int(&R, 1, 4);
    for (int f = 0; f < n; f++) {
      int x = cx + rng_int(&R, -5, 5), y = cy + rng_int(&R, -4, 4);
      gset(x, y + 1, P_grass[1]); gset(x, y + 2, P_grass[1]);
      gset(x, y, F[1]); gset(x - 1, y, F[0]); gset(x + 1, y, F[0]); gset(x, y - 1, F[2]);
    }
  }
  // pebbles on the road
  for (int k = 0; k < 9000; k++) {
    int x = rng_int(&R, 0, w - 1), y = rng_int(&R, 0, h - 1);
    if (pathField(x, y) > 13) continue;
    gset(x, y, P_dirt[4]); gset(x + 1, y, P_dirt[3]); gset(x, y + 1, P_dirt[0]); gset(x + 1, y + 1, P_dirt[0]);
  }
  // lily pads
  RGB LILY[4]; { const char *a[] = { "#4f8a2a", "#8cbf3a", "#b8dc54", "#e2f08a" }; ramp_hex(LILY, 4, a); }
  RGB PINK[3]; { const char *a[] = { "#c04a7a", "#f08ab0", "#ffd8e8" }; ramp_hex(PINK, 3, a); }
  for (int k = 0; k < 900; k++) {
    int x = rng_int(&R, 0, w - 1), y = rng_int(&R, 0, h - 1);
    double wf = wfAt[y * w + x];
    if (wf > -0.04 || wf < -0.45) continue;
    double r = rng_range(&R, 3, 6.5), rot = rng_range(&R, 0, 6.28);
    for (double j = -r; j <= r; j++)
      for (double i = -r * 1.3; i <= r * 1.3; i++) {
        double q = (i / 1.3) * (i / 1.3) + j * j;
        if (q > r * r) continue;
        double a = atan2(j, i / 1.3) - rot;
        if (fabs(atan2(sin(a), cos(a))) < 0.35) continue; // the notch
        double v = 1 - sqrt(q) / r * 0.5 - (j / r) * 0.3;
        // rampAt's dither cell uses the (fractional) pixel coords: x & 3 truncates them
        gset(x + i, y + j, rampAt(RAMP(LILY), v, (int)(x + i), (int)(y + j)));
      }
    for (double i = -r * 1.3; i <= r * 1.3; i++) gset(x + i, y + r + 1, P_water[0]);
    if (rng_chance(&R, 0.2)) { gset(x, y - 1, PINK[1]); gset(x - 1, y, PINK[0]); gset(x + 1, y, PINK[0]); gset(x, y - 2, PINK[2]); }
  }

  plank(DOCK.x0 * TILE, DOCK.y0 * TILE + 6, (DOCK.x1 + 1) * TILE + 4, (DOCK.y1 + 1) * TILE);
  plank(DOCK.pier.x0 * TILE + 4, DOCK.pier.y * TILE + 4, (DOCK.pier.x1 + 1) * TILE + 2, (DOCK.pier.y + 1) * TILE);
  free(lushAt); free(wfAt);
  return img;
}

/** Shore and sparkle sample points, so the water can be animated cheaply. */
int waterSparkles(const World *W, Sparkle **out) {
  int n = 0, cap = 4096;
  Sparkle *s = malloc(sizeof(Sparkle) * cap);
  Rng R; rng_seed(&R, 5);
  for (int k = 0; k < 9000; k++) {
    int x = rng_int(&R, 0, MW * TILE), y = rng_int(&R, 0, MH * TILE);
    double wf = waterField(x, y);
    if (wf > -0.02) continue;
    int tx = x / TILE, ty = y / TILE;
    if (tileAt(W, tx, ty) == T_DOCK) continue;
    if (n == cap) { cap *= 2; s = realloc(s, sizeof(Sparkle) * cap); }
    Sparkle sp = { x, y, 0, 0, 0, wf > -0.08 };
    sp.len = rng_int(&R, 2, 6);
    sp.ph = rng_range(&R, 0, 1);
    sp.sp = rng_range(&R, 0.25, 0.6);
    s[n++] = sp;
  }
  *out = s;
  return n;
}
