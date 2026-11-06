// The pixelfx effects the game uses (campfire, fireball, hit spark, critical hit, sword slash, poof, healing
// bloom), their shared recipes (fx/fire/_lib.js, fx/impacts/_lib.js, fx/nature/_lib.js), live instances
// (core/fx.js createFx) and the layer that composites them over the scene (src/fx.js).
// The effect recipes are adapted from Sprite Fusion's open-source pixel art VFX, MIT License,
// Copyright (c) 2026 Hugo Duprez (see vendor/pixelfx/NOTICE.md).
#include "pfx.h"
#include <stdlib.h>
#include <string.h>

// ---------------------------------------------------------------- palettes (core/color.js PAL)
static const char *PAL_HEX[PAL_N][8] = {
  { "#1f0b10", "#4a1118", "#8c1d1c", "#cc3a1a", "#f2701f", "#ffae35", "#ffe27a", "#fff8d6" },
  { "#1a0a0e", "#3d1012", "#701a14", "#a8301a", "#e0561e", "#ff8a2a", "#ffc46a" },
  { "#2a1c08", "#5a3e10", "#9a6c18", "#d8a428", "#ffd84a", "#fff09a", "#fffbe6", "#ffffff" },
  { "#08201a", "#0f3f2c", "#17663e", "#24924e", "#3ec466", "#7ee88a", "#c8ffc4", "#ffffff" },
  { "#140a26", "#2b1252", "#481c88", "#6b2cc0", "#9a48ec", "#c684ff", "#ecc8ff", "#ffffff" },
  { "#1e1206", "#4a2c08", "#86520c", "#c48412", "#f0b424", "#ffe066", "#fff6c4", "#ffffff" },
  { "#160c06", "#2e1a0c", "#4a2c14", "#6a421e", "#8e5c2c", "#b47c40", "#d8a464" },
};
static uint32_t PAL_C[PAL_N][8]; static int PAL_NN[PAL_N];
static void initPal(void) {
  if (PAL_NN[0]) return;
  for (int i = 0; i < PAL_N; i++) { int n = 0; while (n < 8 && PAL_HEX[i][n]) { PAL_C[i][n] = phex(PAL_HEX[i][n]); n++; } PAL_NN[i] = n; }
}
Pal pal_get(int id) { initPal(); Pal p = { PAL_C[id], PAL_NN[id] }; return p; }
static void hexs(uint32_t *out, int n, const char *const *h) { for (int i = 0; i < n; i++) out[i] = phex(h[i]); }

// ---------------------------------------------------------------- fire recipes (fx/fire/_lib.js)
static uint32_t SMOKE_R[5];
static double pnoise(double x, double period, double seed) {
  double i = floor(x), f = x - i, u = f * f * (3 - 2 * f);
  double a = prand2((int64_t)pwrap(i, period), (int64_t)seed), b = prand2((int64_t)pwrap(i + 1, period), (int64_t)seed);
  return (a + (b - a) * u) * 2 - 1;
}
/** Noise for a loop D seconds long: the same at tt and tt + D. */
static double NL(double D, double tt, double rate, double seed, double off) {
  double P = fmax(1, JSROUND(rate * D));
  return pnoise((tt / D) * P + off, P, seed);
}
typedef struct { double lw, lh; int ri; } Layer;
static const Layer LAYERS[4] = { { 1, 1, 6 }, { 0.76, 0.86, 4 }, { 0.54, 0.68, 2 }, { 0.3, 0.42, 0 } };
static const Layer BIG_LAYERS[6] = { { 1, 1, 6 }, { 0.8, 0.9, 5 }, { 0.62, 0.78, 4 }, { 0.44, 0.6, 3 }, { 0.26, 0.4, 1 }, { 0.12, 0.22, 0 } };
static const Layer BACK_LAYERS[4] = { { 1, 1, 7 }, { 0.76, 0.86, 5 }, { 0.54, 0.68, 3 }, { 0.3, 0.42, 2 } };

static void flameTongue(Painter *p, double x, double y, double h, double w, double sx, double D, double t, int n, const uint32_t *H, const Layer *layers, int nl, double jit, double wob) {
  if (h < 1) return;
  for (int l = 0; l < nl; l++) {
    double L = h * layers[l].lh; uint32_t c = H[layers[l].ri];
    for (double r = 0; r <= L; r++) {
      double u = r / fmax(1, L);
      double half = w * layers[l].lw * pow(1 - u, 0.85) * fmin(1, (r + 1.5) / 3.5) + NL(D, t, 9, n, r * 0.45) * jit;
      if (half < 0.3) continue;
      double cx = x + sx * u * u * layers[l].lh + NL(D, t, 4, n + 7, r * 0.2) * u * wob, Y = JSROUND(y - r);
      for (double px = JSROUND(cx - half), x1 = JSROUND(cx + half); px <= x1; px++) pnt_px(p, px, Y, c);
    }
  }
}
static void flameBlade(Painter *p, double x, double y, double ux, double uy, double len, double w, double bend, double D, double t, int n, const uint32_t *H, const Layer *layers, int nl, double jit, double wob) {
  if (len < 1) return;
  double nx = -uy, ny = ux;
  for (int l = 0; l < nl; l++) {
    double L = len * layers[l].lh; uint32_t c = H[layers[l].ri];
    for (double r = 0; r <= L; r += 0.5) {
      double u = r / fmax(1, L);
      double half = w * layers[l].lw * pow(1 - u, 0.85) * fmin(1, (r + 1.5) / 3.5) + NL(D, t, 9, n, r * 0.45) * jit;
      if (half < 0.3) continue;
      double off = bend * u * u * layers[l].lh + NL(D, t, 4, n + 7, r * 0.2) * u * wob, cx = x + ux * r + nx * off, cy = y + uy * r + ny * off;
      for (double q = -half; q <= half; q += 0.5) pnt_px(p, cx + nx * q, cy + ny * q, c);
    }
  }
}
/** A solid disc drawn straight in screen space. */
static void solid(Painter *p, double x, double y, double r, uint32_t c) {
  if (r < 0.6) { pnt_px(p, x, y, c); return; }
  double cx = toX(p, x, y), cy = toY(p, x, y), r2 = r * r;
  for (int sy = (int)floor(cy - r); sy <= (int)ceil(cy + r); sy++) {
    double dy = sy + 0.5 - cy, s2 = r2 - dy * dy;
    if (s2 < 0) continue;
    double s = sqrt(s2);
    for (int sx = (int)ceil(cx - s - 0.5); sx <= (int)floor(cx + s - 0.5); sx++) pnt_put(p, sx, sy, c, 1);
  }
}
/** A translucent disc in screen space: smoke and haze. */
static void softd(Painter *p, double x, double y, double r, uint32_t c, double a) {
  if (a <= 0.004) return;
  if (r < 0.5) { pnt_blend(p, x, y, c, a); return; }
  double cx = toX(p, x, y), cy = toY(p, x, y), r2 = r * r;
  for (int sy = (int)floor(cy - r); sy <= (int)ceil(cy + r); sy++) {
    double dy = sy + 0.5 - cy, s2 = r2 - dy * dy;
    if (s2 < 0) continue;
    double s = sqrt(s2);
    for (int sx = (int)ceil(cx - s - 0.5); sx <= (int)floor(cx + s - 0.5); sx++) pnt_blendPx(p, sx, sy, c, a);
  }
}
static void firePuff(Painter *p, double x, double y, double k, double size, double frac, const uint32_t *H, int n, double glowK, double tx, double ty) {
  double age = 1 - k, heat = fmin(0.999, pow(age, 0.62) + frac * 0.1);
  int idx = (int)fmin(n - 2, floor(heat * (n - 1)));
  double r = size * (0.55 + 0.45 * fmin(1, age * 7)) * (1 - age * 0.55);
  uint32_t c = H[idx];
  if (idx >= n - 2) { softd(p, x, y, r, c, fmin(1, k * 3) * 0.85); return; }
  solid(p, x, y, r, H[idx + 2 < n - 1 ? idx + 2 : n - 1]);
  if (r > 1.6 && ty > -0.99) solid(p, x + tx * r * 1.5, y + ty * r * 1.5, r * 0.3, H[idx + 1 < n - 1 ? idx + 1 : n - 1]);
  solid(p, x - r * 0.16, y - r * 0.22, r * 0.78, c);
  if (r > 1.6) solid(p, x + tx * r * 0.9, y + ty * r * 0.9, r * 0.42, c);
  if (idx <= 3 && r > 1.8) solid(p, x - r * 0.28, y - r * 0.34, r * 0.36, H[idx - 1 > 0 ? idx - 1 : 0]);
  if (idx < 6) pnt_glow(p, x, y, r * 2.4 + 2, c, glowK * k);
}
static void lick(Painter *p, double x, double y, double k, double s, const uint32_t *H) {
  double r = s * (0.4 + 0.6 * k);
  solid(p, x, y, r + 0.6, k > 0.5 ? H[5] : H[6]);
  if (k > 0.35) solid(p, x, y - 0.3, r * 0.6, k > 0.7 ? H[2] : H[4]);
}
static uint32_t smokeRamp(double t) { int i = (int)floor(t * 5); if (i < 0) i = 0; if (i > 4) i = 4; return SMOKE_R[i]; }
static void smokePuff(Painter *p, double x, double y, double k, double size, uint32_t col) {
  double age = 1 - k;
  double r = size * (0.65 + fmin(1, age * 2.5) * 0.45 + age * 0.4);
  double a = fmin(1, age * 12) * fmin(1, k * 2.4) * 0.58;
  uint32_t c = col ? pmix(col, smokeRamp(age), age) : smokeRamp(age * 1.05);
  softd(p, x, y, r, c, a * 0.45);
  softd(p, x + r * 0.05, y + r * 0.06, r * 0.74, c, a * 0.62);
  if (age < 0.5) softd(p, x - r * 0.22, y - r * 0.3, r * 0.5, pmix(c, WHITE, 0.12), a * 0.4 * (1 - age * 2));
}
static void ember(Painter *p, double x, double y, double k, double size, const uint32_t *cols, double ph) {
  if (k < 0.25 && sin(ph) < 0) return;
  uint32_t c = k > 0.6 ? cols[0] : k > 0.3 ? cols[1] : cols[2];
  if (size >= 2) {
    uint32_t rim = k > 0.45 ? cols[2] : cols[3];
    pnt_px(p, x - 1, y, rim); pnt_px(p, x + 1, y, rim); pnt_px(p, x, y - 1, rim); pnt_px(p, x, y + 1, rim);
    pnt_px(p, x, y, c);
    pnt_glow(p, x, y, 8, c, 0.4 * k);
    return;
  }
  pnt_px(p, x, y, c);
  if (size > 1.4) pnt_px(p, x, y + 1, cols[3]);
  pnt_glow(p, x, y, 3 + size, c, 0.35 * k);
}
static void spark(Painter *p, double x, double y, double vx, double vy, double k, const uint32_t *cols, int n) {
  double sp = hypot(vx, vy); if (!sp) sp = 1;
  double ux = vx / sp, uy = vy / sp, len = fmin(9, 1 + sp * 0.022);
  uint32_t head = k > 0.6 ? cols[0] : k > 0.3 ? cols[1] : cols[2];
  pnt_line(p, x - ux * len, y - uy * len, x - ux * len * 0.4, y - uy * len * 0.4, k > 0.5 ? head : cols[n - 1], 1);
  pnt_line(p, x - ux * len * 0.45, y - uy * len * 0.45, x, y, head, 1);
  pnt_glow(p, x, y, 3, head, 0.45 * k);
}
static void along(double x, double v, double a, double k, double t, double *ox, double *ov) {
  if (k <= 0) { *ox = x + v * t + 0.5 * a * t * t; *ov = v + a * t; return; }
  double e = exp(-k * t), vt = a / k;
  *ox = x + vt * t + ((v - vt) * (1 - e)) / k; *ov = vt + (v - vt) * e;
}
/** Where a body is t seconds after launch, under acceleration (ax, ay) and linear drag kx, ky: [x, y, vx, vy]. */
static void drift(double x, double y, double vx, double vy, double t, double ax, double ay, double kx, double ky, double o[4]) {
  along(x, vx, ax, kx, t, &o[0], &o[2]);
  along(y, vy, ay, ky, t, &o[1], &o[3]);
}
static void sparkAt(double x, double y, double vx, double vy, double t, double floor_, double o[4]) {
  const double g = 427, k = 2.2;
  double s[4] = { x, y, vx, vy }, left = t, e[4];
  for (int b = 0; b < 3; b++) {
    drift(s[0], s[1], s[2], s[3], left, 0, g, k, k, e);
    if (e[1] < floor_ || s[1] >= floor_) { memcpy(o, e, sizeof e); return; }
    double lo = 0, hi = left, m4[4];
    for (int i = 0; i < 16; i++) {
      double m = (lo + hi) / 2;
      drift(s[0], s[1], s[2], s[3], m, 0, g, k, k, m4);
      if (m4[1] < floor_) lo = m; else hi = m;
    }
    double c[4]; drift(s[0], s[1], s[2], s[3], hi, 0, g, k, k, c);
    s[0] = c[0]; s[1] = floor_ - 0.25; s[2] = c[2] * 0.7; s[3] = -fabs(c[3]) * 0.45;
    left -= hi;
  }
  drift(s[0], s[1], s[2], s[3], left, 0, g, k, k, e);
  if (e[1] < floor_) { memcpy(o, e, sizeof e); return; }
  o[0] = e[0]; o[1] = floor_ - 0.25; o[2] = e[2]; o[3] = 0;
}
static void floorLight(Painter *p, double fx0, double fy0, double rx, double ry, uint32_t c, double k) {
  if (k <= 0.004 || rx < 1 || ry < 0.5) return;
  SHADE_BEGIN(p, fx0 - rx, fy0 - ry, fx0 + rx, fy0 + ry)
    double dx = (x - fx0) / rx, dy = (y - fy0) / ry, d = dx * dx + dy * dy;
    if (d >= 1) SNONE;
    double f = 1 - sqrt(d);
    ol = c; ok = f * f * k;
  SHADE_END
}
#define LOOPED(t, D, count, seed, i, r, born) for (int i = 0; i < (count); i++) { Rng r; prng2(&r, (seed), i); double born = rng_next(&r) * (D);
#define AGES(t, D, born, life, age) for (double age = pwrap((t) - (born), (D)); age < (life); age += (D))
#define LOOPED_END }

// ---------------------------------------------------------------- impacts and leaves (fx/impacts/_lib.js, fx/nature/_lib.js)
typedef struct { double a, len, w; } Spike;
static void spikes(Rng *R, Spike *out, int n, double aim, double l0, double l1, double w0, double w1, double fwd, double back, double jag, double jit) {
  for (int i = 0; i < n; i++) {
    double a = aim + ((double)i / n) * TAU + rng_range(R, -jit, jit), cb = cos(a - aim);
    double L = rng_range(R, l0, l1) * (1 + fwd * pow(fmax(0, cb), 3) + back * pow(fmax(0, -cb), 3)) * (i % 2 ? jag : 1);
    double w = rng_range(R, w0, w1) * (i % 2 ? sqrt(jag) : 1);
    out[i].a = a; out[i].len = L; out[i].w = w;
  }
}
static void star(Painter *p, double x, double y, const Spike *list, int n, double sc, double th, const uint32_t cols[4], double a, double heart) {
  uint32_t rim = cols[0], body = cols[1], inner = cols[2], core = cols[3];
  for (int pass = 0; pass < 3; pass++)
    for (int i = 0; i < n; i++) {
      const Spike *s = &list[i];
      double c = cos(s->a), sn = sin(s->a), L = s->len * sc;
      for (double d = 0; d <= L; d += 0.5) {
        if (pass == 2 && d > L * 0.55) break;
        double hw0 = s->w * th * (1 - d / L) * fmin(1, 0.5 + d / 3);
        double hw = pass == 0 ? hw0 + 0.8 : pass == 1 ? hw0 : hw0 * 0.45;
        uint32_t col = pass == 0 ? rim : pass == 1 ? (d < L * 0.35 ? inner : body) : core;
        for (double o = -hw; o <= hw; o += 0.5) pnt_dot(p, x + c * d - sn * o, y + sn * d + c * o, col, a);
      }
    }
  double r = heart * sc * sqrt(th);
  pnt_circle(p, x, y, r + 0.8, inner, a);
  pnt_circle(p, x, y, r, core, a);
}
typedef struct { double a, gap, dr, w; } RingSeg;
static void brokenRing(Painter *p, double x, double y, double r, double th, const RingSeg *segs, int ns, double brk, uint32_t c, uint32_t c2, double k, double sy, double maxY) {
  if (r <= 0 || k <= 0) return;
  double full = TAU / ns;
  for (int i = 0; i < ns; i++) {
    const RingSeg *s = &segs[i];
    double span = full * (1 - s->gap * brk) + 0.02, rr = r * (1 + s->dr * brk);
    int m = (int)fmax(4, ceil(rr * span * 1.8));
    for (int j = 0; j <= m; j++) {
      double u = (double)j / m, ang = s->a + (u - 0.5) * span, w = fmax(0.5, th * s->w * (1 - brk * pow(fabs(2 * u - 1), 1.6)));
      double ca = cos(ang), sa = sin(ang);
      for (double o = -w / 2; o <= w / 2 + 0.01; o += 0.5) if (y + sa * (rr + o) * sy < maxY) pnt_dot(p, x + ca * (rr + o), y + sa * (rr + o) * sy, o > -0.26 ? c : c2, k);
    }
  }
}
static int leafIn(double i, double j, double ca, double sa, double len, double w) {
  double u = (i + 0.5) * ca + (j + 0.5) * sa + len / 2, v = -(i + 0.5) * sa + (j + 0.5) * ca;
  if (u < 0 || u > len) return 0;
  double half = w * pow(sin((M_PI * u) / len), 0.75);
  return fabs(v) <= half ? (v < 0 ? 1 : 2) : 0;
}
static void drawLeaf(Painter *p, double x, double y, double len, double wid, double ang, double fl, const uint32_t pal[4], double alpha) {
  double ca = cos(ang), sa = sin(ang), sq = cos(fl), w = fmax(0.55, fabs(sq) * wid);
  bool under = sq < 0;
  int R = (int)ceil(len / 2 + 2);
  double X = JSROUND(x), Y = JSROUND(y);
  for (int j = -R; j <= R; j++)
    for (int i = -R; i <= R; i++) {
      int s = leafIn(i, j, ca, sa, len, w);
      if (!s) {
        if (leafIn(i - 1, j, ca, sa, len, w) || leafIn(i + 1, j, ca, sa, len, w) || leafIn(i, j - 1, ca, sa, len, w) || leafIn(i, j + 1, ca, sa, len, w)) pnt_dot(p, X + i, Y + j, pal[0], alpha);
        continue;
      }
      double u = (i + 0.5) * ca + (j + 0.5) * sa + len / 2, v = -(i + 0.5) * sa + (j + 0.5) * ca;
      bool rib = fabs(v) < 0.5 && u > len * 0.12 && u < len * 0.88 && w > 1.2;
      pnt_dot(p, X + i, Y + j, rib ? pal[1] : ((s == 1) != under) ? pal[3] : pal[2], alpha);
    }
  // the stem trails off the base
  pnt_dot(p, X - ca * (len / 2 + 1), Y - sa * (len / 2 + 1), pal[1], alpha);
}

// ---------------------------------------------------------------- live effects
typedef struct Fx {
  int kind; double t, stopAt, D; bool loop;
  double x, y, angle, light, radius; bool flip; int seed;
  uint32_t pal[9]; int npal;
  void *st;
} Fx;

// ---- campfire (stateless: drawn from t alone)
static const double TONGUES[11][5] = {
  { -7.5, -7, 0.42, 1.8, 1 }, { 7.5, -7, 0.46, 1.8, 1 }, { -3, -9, 0.78, 2.0, 1 }, { 3.2, -9, 0.82, 2.0, 1 },
  { -12, -3, 0.14, 1.3, 0 }, { 12.5, -3, 0.16, 1.3, 0 }, { -9.5, -4.5, 0.3, 1.9, 0 }, { 9.5, -4.5, 0.34, 1.9, 0 },
  { -5, -6, 0.6, 2.6, 0 }, { 5.2, -6, 0.66, 2.6, 0 }, { 0, -7, 1, 3.4, 0 },
};
static const double LOGS[2][5] = { { -19, 2, 15, -12, 3.4 }, { 19, 2, -15, -12, 3.4 } };
#define CROSS_AT 0.56
typedef struct { double dx, y, h, w, env; bool back; int n; } Tongue;
typedef struct { const Tongue *T; double t, D; int S; } CF;
static double cf_fla(const CF *c, double tt) { return 0.74 + 0.16 * NL(c->D, tt, 7.3, c->S + 1, 0) + 0.1 * NL(c->D, tt, 19, c->S + 2, 0); }
static double cf_lean(const CF *c, double tt) { return NL(c->D, tt, 0.67, c->S + 90, 0) * 0.12; }
static double cf_height(const CF *c, int i, double tt) {
  const Tongue *T = &c->T[i];
  double leap = fmax(0, NL(c->D, tt, 2.6, T->n + 70, 0) - 0.55) * 1.4;
  return (T->h + 0.25 * T->h * NL(c->D, tt, 3.3, T->n, 0) + T->h * leap) * (0.9 + 0.1 * cf_fla(c, tt));
}
static double cf_sweep(const CF *c, int i, double tt, double h) { return NL(c->D, tt, 2.2, c->T[i].n + 40, 0) * (1 + h * 0.08) + cf_lean(c, tt) * h * 0.9 - pclamp(c->T[i].dx * 0.3, -2.5, 2.5); }
static void cf_tip(const CF *c, int i, double tt, double *x, double *y) {
  double h = cf_height(c, i, tt);
  *x = c->T[i].dx + cf_sweep(c, i, tt, h) * 0.85; *y = c->T[i].y - h * 0.88 + 3;
}
static uint32_t ASH[3], SMOKE1;

static void cf_log(Painter *p, const double *L, const uint32_t *W, const uint32_t *H, double u0, double u1, double t, int S, double D) {
  double x0 = L[0], y0 = L[1], x1 = L[2], y1 = L[3], r = L[4], dx = x1 - x0, dy = y1 - y0, len = hypot(dx, dy), ax = dx / len, ay = dy / len;
  double nx = -ay, ny = ax;
  if (ny < 0) { nx = -nx; ny = -ny; }
  double rim = 1 - 1.05 / r;
  SHADE_BEGIN(p, fmin(x0, x1) - r - 1, fmin(y0, y1) - r - 1, fmax(x0, x1) + r + 1, fmax(y0, y1) + r + 1)
    double alongv = (x - x0) * ax + (y - y0) * ay, u = alongv / len, s = ((x - x0) * nx + (y - y0) * ny) / r;
    if (u < u0 || u > u1 || fabs(s) > 1) SNONE;
    double burn = pc01(1.2 - fabs(x) / 8);
    int64_t lane = (int64_t)JSROUND(s * r * 0.85);
    double run = prand3((int64_t)floor(alongv / 3), lane, S);
    if (fabs(s) > rim || alongv > len - 1) SRET(s < 0 && burn > 0.4 ? H[7] : W[0]);
    if (burn > 0.35 && lane < 2) {
      // charred: black, with embers breathing in the cracks along the grain
      if (run < 0.55 && lane > -2) {
        double g = 0.5 + 0.5 * sin((t / D) * M_PI * 6 + prand3((int64_t)floor(alongv / 2), lane, S + 1) * 6.3);
        ok = 0.3 * burn * g;
        SRET(g > 0.72 ? H[3] : g > 0.4 ? H[4] : H[5]);
      }
      SRET(lane < -1 ? W[1] : W[0]);
    }
    if (lane <= -2) SRET(run < 0.25 ? W[2] : pmix(W[3], H[4], 0.45 * burn));
    if (lane == -1) SRET(run < 0.45 ? W[1] : W[2]);
    if (lane == 0) SRET(run < 0.2 ? W[1] : W[2]);
    SRET(run < 0.4 ? W[0] : W[1]);
  SHADE_END
  // the near end's cut face: a dark rim, pale sapwood, growth rings round a dark heart
  if (u0 <= 0) {
    double rx = r * 0.62, ry = r + 0.2;
    SHADE_BEGIN(p, x0 - rx, y0 - ry, x0 + rx, y0 + ry)
      double ddx = (x - x0) / rx, ddy = (y - y0) / ry, d2 = ddx * ddx + ddy * ddy;
      if (d2 > 1) SNONE;
      double d = sqrt(d2);
      oc = d > 0.78 ? W[0] : d > 0.56 ? W[5] : d > 0.32 ? W[4] : W[3];
    SHADE_END
  }
}
static void cf_coals(Painter *p, const uint32_t *W, const uint32_t *H, double t, int S, double D) {
  SHADE_BEGIN(p, -15, -3, 15, 2)
    double dx = x / 14, dy = (y + 0.3) / 2.2, d = dx * dx + dy * dy;
    if (d > 1) SNONE;
    double h = prand3((int64_t)floor(x / 2), (int64_t)floor(y), S + 20);
    if (d > 0.55 && h < 0.55) SRET(ASH[h < 0.15 ? 2 : h < 0.32 ? 1 : 0]);
    if (h > 0.5) {
      double g = (0.5 + 0.5 * sin((t / D) * M_PI * 4 + h * 40)) * (1.1 - d);
      ok = 0.35 * g;
      SRET(g > 0.7 ? H[2] : g > 0.5 ? H[3] : g > 0.3 ? H[4] : H[5]);
    }
    SRET(h > 0.3 ? W[1] : W[0]);
  SHADE_END
}

static void campfire_draw(Fx *fx, Painter *p, double t) {
  const double D = 3; const int S = fx->seed; const double HC = 22;
  uint32_t F[9], H[9], W[6];
  pfit(fx->pal, fx->npal, 9, F);
  for (int i = 0; i < 9; i++) H[i] = F[8 - i];
  { const char *w[] = { "#0e080a", "#24130f", "#3b2216", "#5a3520", "#8a5a34", "#b9884f" }; hexs(W, 6, w); }
  Rng R; rng_seed(&R, S);
  Tongue T[11];
  for (int i = 0; i < 11; i++) {
    T[i].dx = TONGUES[i][0] + rng_range(&R, -0.4, 0.4); T[i].y = TONGUES[i][1];
    T[i].h = 3 + HC * TONGUES[i][2] * rng_range(&R, 0.92, 1.08);
    T[i].w = TONGUES[i][3] * rng_range(&R, 0.9, 1.1);
    T[i].back = TONGUES[i][4] != 0; T[i].env = TONGUES[i][2]; T[i].n = (S * 7 + i) * 13;
  }
  CF c = { T, t, D, S };
  double fl = cf_fla(&c, t);
  uint32_t GLOW = pmix(pmix(H[3], H[4], 0.5), WHITE, 0.25), SMOKE = pmix(SMOKE1, H[6], 0.25);
  uint32_t SPARKS[4] = { H[1], H[2], H[4], H[5] }, EMB[4] = { H[1], H[2], H[4], H[6] };
  double o4[4];

  // smoke curling off the top, behind everything
  LOOPED(t, D, 48, S + 300, i, r, born)
    double qx = rng_range(&r, -5, 5), qy = -HC * 0.8 - rng_range(&r, 0, 8), qvx = rng_range(&r, -2, 2), qvy = -rng_range(&r, 10, 17), life = rng_range(&r, 2, 2.9), qs = rng_range(&r, 2.4, 3.8);
    AGES(t, D, born, life, age) {
      drift(qx, qy, qvx, qvy, age, 4, -20, 1.6, 1, o4);
      smokePuff(p, o4[0] + NL(D, t - age, 0.8, S + 60, 0) * (2 + 3 * age), o4[1], 1 - age / life, qs, SMOKE);
    }
  LOOPED_END
  // flame puffs shed from the tips: they burn out above the fire, some into smoke
  static double puffs[11 * 24 * 3][5]; int np = 0;
  LOOPED(t, D, 11 * 24, S + 200, j, r, born)
    int qi = j % 11; double fire = rng_range(&r, 0.14, 0.3); bool smokes = rng_chance(&r, 0.45);
    double sl = rng_range(&r, 0.8, 1.4), ox = rng_range(&r, -1, 1), oy = rng_range(&r, 0, 4), vx = rng_range(&r, -4, 4), vy = -rng_range(&r, 15, 30);
    double qs = rng_range(&r, 0.8, 1.6) * (0.8 + 0.6 * T[qi].env), qf = rng_next(&r), life = fire + (smokes ? 1.4 : 0);
    AGES(t, D, born, life, age) {
      double tx, ty; cf_tip(&c, qi, t - age, &tx, &ty);
      drift(tx + ox, ty + oy, vx, vy, fmin(age, fire), 0, -95, 5, 3.2, o4);
      if (age < fire) { if (np < (int)(sizeof puffs / sizeof *puffs)) { puffs[np][0] = o4[0]; puffs[np][1] = o4[1]; puffs[np][2] = 1 - age / fire; puffs[np][3] = qs; puffs[np][4] = qf; np++; } continue; }
      if (age - fire > sl) continue;
      double s4[4]; drift(o4[0], o4[1], o4[2] * 0.6, o4[3] * 0.6 - 6, age - fire, 2, -16, 1.6, 1.2, s4);
      smokePuff(p, s4[0], s4[1], 1 - (age - fire) / sl, qs * 0.7, 0);
    }
  LOOPED_END

  cf_coals(p, W, H, t, S, D);
  for (int l = 0; l < 2; l++) cf_log(p, LOGS[l], W, H, CROSS_AT, 1, t, S + 11, D);
#define TONGUE_AT(i) do { double h = cf_height(&c, i, t); \
    flameTongue(p, T[i].dx, T[i].y, h, T[i].w, cf_sweep(&c, i, t, h), D, t, T[i].n, H, T[i].back ? BACK_LAYERS : T[i].w > 2.2 ? BIG_LAYERS : LAYERS, T[i].back ? 4 : T[i].w > 2.2 ? 6 : 4, 0.5, 1.1 + h * 0.04); } while (0)
  for (int i = 0; i < 11; i++) if (T[i].back) TONGUE_AT(i);
  // flames licking up off the burning wood
  LOOPED(t, D, 90, S + 210, i, r, born)
    double qx = rng_range(&r, -10, 10), qy = -rng_range(&r, 3, 8), vx = rng_range(&r, -5, 5), vy = -rng_range(&r, 20, 40), life = rng_range(&r, 0.16, 0.3), qs = rng_range(&r, 1, 1.8), qf = rng_next(&r);
    AGES(t, D, born, life, age) {
      drift(qx, qy, vx, vy, age, 0, -95, 5, 3.2, o4);
      firePuff(p, o4[0], o4[1], 1 - age / life, qs, qf, H, 9, 0.18, 0, -1);
    }
  LOOPED_END
  for (int i = 0; i < 11; i++) if (!T[i].back) TONGUE_AT(i);
#undef TONGUE_AT
  // licks torn off the tips, rising and shrinking
  LOOPED(t, D, 11 * 12, S + 220, j, r, born)
    int qi = j % 11; double vx = rng_range(&r, -3, 3), vy = -rng_range(&r, 12, 22), qs = rng_range(&r, 0.9, 1.6) * (0.8 + 0.5 * T[qi].env), life = 0.26;
    AGES(t, D, born, life, age) {
      double tx, ty; cf_tip(&c, qi, t - age, &tx, &ty);
      lick(p, tx + vx * age, ty - 2 + vy * age, 1 - age / life, qs, H);
    }
  LOOPED_END
  for (int i = 0; i < np; i++) firePuff(p, puffs[i][0], puffs[i][1], puffs[i][2], puffs[i][3], puffs[i][4], H, 9, 0.18, 0, -1);
  for (int l = 0; l < 2; l++) cf_log(p, LOGS[l], W, H, 0, CROSS_AT, t, S + 11, D);

  // pops: a crack, a flash, and a fistful of sparks thrown up out of the wood that bounce on the floor
  LOOPED(t, D, 4, S + 400, i, r, born)
    double qx = rng_range(&r, -9, 9), qy = -rng_range(&r, 4, 9); int qn = rng_int(&r, 3, 5), qseed = rng_int(&r, 0, 1000000); double life = 0.7;
    AGES(t, D, born, life, age) {
      if (age < 0.08) { pnt_px(p, qx, qy, WHITE); pnt_glow(p, qx, qy, 12, H[1], 0.7 * (1 - age / 0.08)); }
      Rng rr; rng_seed(&rr, qseed);
      for (int k = 0; k < qn; k++) {
        double a = -M_PI / 2 + rng_range(&rr, -0.8, 0.8), sp = rng_range(&rr, 110, 220), lf = rng_range(&rr, 0.25, 0.6);
        if (age >= lf) continue;
        sparkAt(qx, qy, cos(a) * sp, sin(a) * sp, age, 0, o4);
        spark(p, o4[0], o4[1], o4[2], o4[3], 1 - age / lf, SPARKS, 4);
      }
    }
  LOOPED_END
  // embers carried up by the heat, wandering and cooling
  LOOPED(t, D, 36, S + 500, i, r, born)
    double qx = rng_range(&r, -7, 7), qy = -rng_range(&r, 8, 18), vx = rng_range(&r, -15, 15), vy = -rng_range(&r, 25, 60), life = rng_range(&r, 1.1, 2.5);
    double qs = rng_chance(&r, 0.15) ? 2 : rng_range(&r, 1, 1.6), qa = rng_range(&r, 0, 6.3), qb = rng_range(&r, 0, 6.3);
    AGES(t, D, born, life, age) {
      drift(qx, qy, vx, vy, age, 0, -30, 1.6, 1.6, o4);
      ember(p, o4[0] + 7 * (sin(age * 2.3 + qa) - sin(qa)), o4[1] + 2 * (sin(age * 3 + qb) - sin(qb)), 1 - age / life, qs, EMB, age * 40 + qa);
    }
  LOOPED_END

  // light: a big warm room light, a hot heart, a pool on the floor, all breathing with the flames
  double br = 0.92 + 0.08 * NL(D, t, 0.67, S + 3, 0);
  double lx = cf_lean(&c, t) * 12;
  pnt_glow(p, lx, -8, 74 * br * (0.9 + 0.1 * fl), GLOW, 0.3 * fl);
  const double G3[3][3] = { { -6, -17, 0.85 }, { 0, -21, 1 }, { 6, -17, 0.85 } };
  for (int i = 0; i < 3; i++) {
    pnt_glow(p, G3[i][0] + lx, G3[i][1], 46 * br, GLOW, 0.3 * G3[i][2] * fl);
    pnt_glow(p, G3[i][0] * 0.6, G3[i][1] + 13, 15, H[2], 0.16 * G3[i][2] * fl);
  }
  pnt_glow(p, 0, -3, 9, H[0], 0.16 * fl);
  floorLight(p, 0, 0.5, 48, 8, GLOW, 0.3 * fl);
}

// ---- fireball (stateless)
static const double BODY[4][3] = { { 30, 4.2, 0 }, { 23, 4.4, -1.6 }, { 22, 4.4, 1.6 }, { 15, 4.6, 0 } };
static const double CORONA[6][3] = { { -1.3, 6, 1.1 }, { -1.8, 8, 1.2 }, { -2.3, 7, 1.1 }, { 1.3, 6, 1.1 }, { 1.8, 8, 1.2 }, { 2.3, 7, 1.1 } };
static void fb_head(Painter *p, const uint32_t *H, double t, double D, double R0, int S, double hx, double hy) {
  double ph = t / D;
  SHADE_BEGIN(p, hx - R0 * 2.4, hy - R0 * 1.7, hx + R0 * 1.5, hy + R0 * 1.7)
    double lx = x - hx, ly = y - hy;
    double d = hypot(lx, ly), th = atan2(ly, lx), back = fmax(0, -cos(th)), a = th / TAU;
    double bump = 0.55 * pnoise(a * 9 + ph * 9, 9, S) + 0.35 * pnoise(a * 5 - ph * 10, 5, S + 1);
    double rim = R0 * (1 + 0.55 * back * back) + bump;
    if (d > rim) SNONE;
    double swirl = pnoise(a * 5 - ph * 10 + d * 0.45, 5, S + 2);
    double h = 1 - d / rim + 0.26 * swirl + 0.1 * (1 - back);
    if (rim - d < 1 && back < 0.3) SRET(h > 0.3 ? H[3] : H[5]);
    SRET(h > 0.74 ? H[0] : h > 0.58 ? H[1] : h > 0.42 ? H[2] : h > 0.27 ? H[4] : h > 0.13 ? H[5] : H[6]);
  SHADE_END
}
typedef struct { double age, x, y, s, f, fl, sl; } FbPuff;
static int fbcmp(const void *a, const void *b) { double d = ((const FbPuff *)b)->age - ((const FbPuff *)a)->age; return d < 0 ? -1 : d > 0 ? 1 : 0; }
static void fireball_draw(Fx *fx, Painter *p, double t) {
  const double D = 1.2, R0 = fx->radius, V = 120; const int S = fx->seed;
  uint32_t F[9], H[9];
  pfit(fx->pal, fx->npal, 9, F);
  for (int i = 0; i < 9; i++) H[i] = F[8 - i];
  uint32_t GLOW = pmix(pmix(H[3], H[4], 0.5), WHITE, 0.25), SMOKE = pmix(SMOKE1, H[6], 0.3);
  uint32_t SPARKS[4] = { H[1], H[2], H[4], H[5] }, EMB[4] = { H[1], H[2], H[4], H[6] };
  double hx = NL(D, t, 3, S + 50, 0) * 0.5, hy = NL(D, t, 2.5, S + 51, 0) * 0.7;
  double o4[4];
  static FbPuff fire[400], smoke[400]; int nf = 0, ns = 0;
  LOOPED(t, D, 130, S + 100, i, r, born)
    double fl = rng_range(&r, 0.22, 0.55); bool sm = rng_chance(&r, 0.55); double qx = -rng_range(&r, 2, 24);
    double qy = rng_range(&r, -1, 1) * (R0 - 0.1 * -qx), qv = V * rng_range(&r, 0.3, 0.6), qvy = rng_range(&r, -16, 16);
    double sl = rng_range(&r, 0.25, 0.45), qs = rng_range(&r, 1.3, 2.9), qf = rng_next(&r) * 0.5 + 0.5 * (-qx / 24), life = fl + (sm ? 0.45 : 0);
    AGES(t, D, born, life, age) {
      double ta = fmin(age, fl);
      drift(0, qy, qv, qvy, ta, 0, -70, 4.5, 3, o4);
      double x = qx + o4[0] - V * ta, y = o4[1];
      if (age < fl) { if (nf < 400) fire[nf++] = (FbPuff){ age, x, y, qs, qf, fl, sl }; continue; }
      if (!sm || age - fl > sl) continue;
      double sa = age - fl, s4[4];
      drift(x, y, o4[2] - V, o4[3] * 0.6 - 6, sa, V * 2, -30, 2, 1.2, s4);
      if (ns < 400) smoke[ns++] = (FbPuff){ sa, s4[0], s4[1], qs, qf, fl, sl };
    }
  LOOPED_END
  for (int i = 0; i < ns; i++) smokePuff(p, smoke[i].x, smoke[i].y, 1 - smoke[i].age / smoke[i].sl, smoke[i].s * 0.9, SMOKE);
  // stable sort, oldest first (the JS sort is stable)
  for (int i = 1; i < nf; i++) { FbPuff k = fire[i]; int j = i - 1; while (j >= 0 && fbcmp(&fire[j], &k) > 0) { fire[j + 1] = fire[j]; j--; } fire[j + 1] = k; }
  for (int i = 0; i < nf; i++) {
    double u = fire[i].age / fire[i].fl;
    firePuff(p, fire[i].x, fire[i].y, 1 - u, fire[i].s * (1 + 1.3 * u), fire[i].f, H, 9, 0.07, -0.86, -0.5);
  }
  // the body: tongues of flame rooted in the head streaming back, and a corona licking round it
  for (int i = 0; i < 4; i++) {
    double len = BODY[i][0], w = BODY[i][1], dy = BODY[i][2];
    int n = (S * 5 + i) * 17;
    double L = len * (0.82 + 0.25 * NL(D, t, 4, n, 0)) * (1 + 0.3 * fmax(0, NL(D, t, 2.4, n + 3, 0)));
    flameBlade(p, hx + 1, hy + dy * 0.5, -1, dy * 0.02, L, w * R0 / 5, NL(D, t, 3, n + 5, 0) * 3 + dy, D, t, n, H, LAYERS, 4, 0.5, 1.1 + L * 0.05);
  }
  for (int i = 0; i < 6; i++) {
    double a = CORONA[i][0], len = CORONA[i][1], w = CORONA[i][2];
    int n = (S * 5 + i + 20) * 17;
    double L = len * (0.7 + 0.4 * (0.5 + 0.5 * NL(D, t, 6, n, 0))), ox = cos(a) * R0 * 0.85, oy = sin(a) * R0 * 0.85;
    double dx = cos(a) * 0.55 - 1, dy = sin(a) * 0.55, l = hypot(dx, dy);
    flameBlade(p, hx + ox, hy + oy, dx / l, dy / l, L, w, -(a > 0 ? 1 : a < 0 ? -1 : 0) * 1.5, D, t, n, H, LAYERS, 4, 0.5, 1.1);
  }
  fb_head(p, H, t, D, R0, S, hx, hy);
  // motes flicked off the head's skin
  LOOPED(t, D, 26, S + 200, i, r, born)
    double qa = rng_range(&r, -2.4, 2.4), qv = rng_range(&r, 30, 70), life = rng_range(&r, 0.08, 0.18);
    AGES(t, D, born, life, age) {
      double ca = cos(qa), sa = sin(qa), d = R0 * 0.9 + qv * age, x = hx + ca * d - V * 0.4 * age, y = hy + sa * d;
      double k = 1 - age / life, L = 1 + 2 * k;
      pnt_line(p, x - ca * L + V * 0.02, y - sa * L, x, y, k > 0.5 ? H[1] : H[3], 1);
      pnt_glow(p, x, y, 3, H[2], 0.4 * k);
    }
  LOOPED_END
  // embers left behind
  LOOPED(t, D, 30, S + 300, i, r, born)
    double qx = -rng_range(&r, 2, 16), qy = rng_range(&r, -3, 3), qv = V * rng_range(&r, 0.3, 0.8), qvy = rng_range(&r, -20, 20), life = rng_range(&r, 0.25, 0.55);
    bool big = rng_chance(&r, 0.25); double ph = rng_range(&r, 0, 6.3);
    AGES(t, D, born, life, age) {
      drift(0, qy, qv, qvy, age, 0, 50, 3, 2, o4);
      double x = qx + o4[0] - V * age, k = 1 - age / life;
      if (big) ember(p, x, o4[1], k, 2, EMB, age * 40 + ph);
      else spark(p, x, o4[1], o4[2] - V, o4[3], k, SPARKS, 4);
    }
  LOOPED_END
  double fl = 0.85 + 0.15 * NL(D, t, 9, S + 7, 0);
  pnt_glowLine(p, hx - 6, hy, -50, -2, 12, GLOW, 0.2 * fl);
  pnt_glow(p, hx - 2, hy, 42, GLOW, 0.42 * fl);
  pnt_glow(p, hx, hy, 13, H[1], 0.3 * fl);
}

// ---- hit spark
typedef struct { double a, L, w; } Ray;
typedef struct { uint32_t C[7]; Rng R; Particles ps; Lights lights; Ray rays[5]; double t, A, Y; } HitSpark;
static void hs_ray(Painter *p, double x, double y, double a, double L, double w, const uint32_t *C, double from) {
  double c = cos(a), s = sin(a);
  for (double d = from * L; d <= L; d += 0.5) {
    double u = d / L, hw = w * pow(1 - u, 1.6);
    uint32_t col = u < 0.3 ? WHITE : u < 0.62 ? C[5] : u < 0.88 ? C[4] : C[3];
    pnt_px(p, x + c * d, y + s * d, col);
    if (hw > 0.45) for (double o = 0.5; o <= hw; o += 0.5) for (int k = 0; k < 2; k++) { double e = k ? o : -o; pnt_px(p, x + c * d - s * e, y + s * d + c * e, u < 0.3 && o < 1 ? C[5] : C[4]); }
  }
}
static void hs_diamond(Painter *p, double x, double y, int r, const uint32_t *C) {
  for (int dy = -r - 1; dy <= r + 1; dy++)
    for (int dx = -r - 1; dx <= r + 1; dx++) {
      int m = abs(dx) + abs(dy);
      if (m <= r) pnt_px(p, x + dx, y + dy, WHITE);
      else if (m == r + 1) pnt_px(p, x + dx, y + dy, C[3]);
    }
}
static void *hitspark_create(Fx *fx) {
  HitSpark *h = calloc(1, sizeof *h);
  pfit(fx->pal, fx->npal, 7, h->C);
  const uint32_t *C = h->C;
  rng_seed(&h->R, fx->seed);
  Rng *R = &h->R;
  double X = 0, Y = -20, A = 0.1;
  h->A = A; h->Y = Y;
  uint32_t sp[4] = { C[6], C[5], C[4], C[2] };
  ps_init(&h->ps, R, sp, 4);
  double tilt = rng_range(R, -0.08, 0.08);
  h->rays[0] = (Ray){ A + tilt, rng_range(R, 33, 37), 2.2 };
  h->rays[1] = (Ray){ A + M_PI + tilt, rng_range(R, 8, 10), 2.2 };
  h->rays[2] = (Ray){ A - M_PI / 2 + tilt, rng_range(R, 15, 18), 2.6 };
  h->rays[3] = (Ray){ A + M_PI / 2 + tilt, rng_range(R, 10, 12), 2.3 };
  h->rays[4] = (Ray){ A - M_PI / 4 + tilt, rng_range(R, 5, 7), 1 };
  lights_add(&h->lights, X, Y, 38, C[4], 0.35, 0.18);
  lights_add(&h->lights, X + cos(A) * 10, Y + sin(A) * 10, 22, C[5], 0.45, 0.1);
  lights_add(&h->lights, X, -2, 26, C[3], 0.22, 0.22);
  for (int i = 0; i < 9; i++) {
    double a = A + rng_range(R, -0.6, 0.6) - 0.15, v = rng_range(R, 170, 360);
    double life = rng_range(R, 0.25, 0.45), delay = i > 6 ? rng_range(R, 0.01, 0.03) : 0;
    ps_spawn(&h->ps, PK_SPARK, X + 1, Y, cos(a) * v, sin(a) * v - 40, life, WHITE, 1, delay);
  }
  for (int i = 0; i < 6; i++) {
    double a = A + rng_range(R, -1.1, 0.5) - 0.3, v = rng_range(R, 70, 170);
    double vy = sin(a) * v - rng_range(R, 30, 80), life = rng_range(R, 0.35, 0.45);
    const uint32_t pick[4] = { C[5], C[4], C[4], C[3] };
    uint32_t col = pick[(int)floor(rng_next(R) * 4)];
    ps_spawn(&h->ps, PK_GRIT, X + 1, Y, cos(a) * v, vy, life, col, 1, 0);
  }
  return h;
}
static void hitspark_update(Fx *fx, double dt) { HitSpark *h = fx->st; h->t += dt; ps_update(&h->ps, dt); lights_update(&h->lights, dt); }
static void hitspark_draw(Fx *fx, Painter *p) {
  HitSpark *h = fx->st; const uint32_t *C = h->C; double t = h->t, X = 0, Y = h->Y, A = h->A;
  ps_draw(&h->ps, p, -1);
  if (t < 0.025) {
    for (int i = 0; i < 5; i++) hs_ray(p, X, Y, h->rays[i].a, h->rays[i].L, h->rays[i].w, C, 0);
    hs_diamond(p, X, Y, 4, C);
  } else if (t < 0.058) {
    for (int i = 0; i < 5; i++) hs_ray(p, X, Y, h->rays[i].a, h->rays[i].L * 1.2, h->rays[i].w * 0.55, C, 0.12);
    hs_diamond(p, X, Y, 3, C);
  } else if (t < 0.092) {
    uint32_t c6[6] = { C[0], C[1], C[2], C[3], C[3], C[4] };
    hs_ray(p, X, Y, h->rays[0].a, h->rays[0].L * 1.3, 0.6, c6, 0.4);
  }
  double pop = exp(-t / 0.045);
  if (pop > 0.02) {
    pnt_glow(p, X, Y, 22, C[4], 0.3 * pop);
    pnt_glow(p, X, Y, 7, WHITE, 0.15 * pop);
    pnt_glowLine(p, X, Y, X + cos(A) * 26, Y + sin(A) * 26, 4, C[5], 0.25 * pop);
  }
  lights_draw(&h->lights, p);
}

// ---- critical hit
typedef struct { uint32_t C[8]; Rng R; Particles ps; Bits bits; Lights lights; Spike sp[14]; RingSeg segs[7]; double t; } CritHit;
static const struct { double t, sc, th, a; int cols[4]; } KEYS[5] = {
  { 0, 1, 1, 1, { 6, 7, 7, 7 } }, { 0.025, 1.3, 1, 1, { 2, 5, 6, 7 } }, { 0.058, 1.05, 0.72, 1, { 2, 4, 5, 6 } }, { 0.092, 1.22, 0.3, 1, { 1, 2, 3, 4 } }, { 0.125, 0, 0, 0, { 0 } },
};
static void crit_flare(Painter *p, double x, double y, double L, double k, const uint32_t *C) {
  const double arms[4][3] = { { 1, 0, L }, { 0, 1, L * 0.45 }, { 0.7, 0.7, L * 0.16 }, { 0.7, -0.7, L * 0.16 } };
  for (int q = 0; q < 4; q++) {
    double dx = arms[q][0], dy = arms[q][1], len = arms[q][2];
    for (int si = 0; si < 2; si++) {
      double s = si ? 1 : -1;
      for (double d = 1; d <= len; d++) {
        double u = d / len, a = u < 0.7 ? 1 : k * (1.6 - u);
        pnt_dot(p, x + s * dx * d, y + s * dy * d, u < 0.35 ? WHITE : u < 0.7 ? C[6] : C[5], a);
        if (dy == 0 && u < 0.42) for (int e = -1; e <= 1; e += 2) pnt_dot(p, x + s * d, y + e, u < 0.2 ? C[6] : C[5], u < 0.3 ? 1 : k);
      }
    }
  }
  pnt_glowLine(p, x - L, y, x + L, y, 6, C[6], 0.5 * k);
  pnt_glowLine(p, x, y - L * 0.45, x, y + L * 0.45, 4, C[6], 0.3 * k);
}
static void *crit_create(Fx *fx) {
  CritHit *h = calloc(1, sizeof *h);
  pfit(fx->pal, fx->npal, 8, h->C);
  const uint32_t *C = h->C;
  rng_seed(&h->R, fx->seed);
  Rng *R = &h->R;
  double X = 0, Y = -26, A = 0.12;
  uint32_t sp[4] = { C[7], C[6], C[5], C[3] };
  ps_init(&h->ps, R, sp, 4);
  spikes(R, h->sp, 14, A, 11, 15, 1.8, 2.5, 1.4, 0.6, 0.5, 0.18);
  // the two longest spikes get longer still
  int i1 = -1, i2 = -1;
  for (int i = 0; i < 14; i++) if (i1 < 0 || h->sp[i].len > h->sp[i1].len) i1 = i;
  for (int i = 0; i < 14; i++) if (i != i1 && (i2 < 0 || h->sp[i].len > h->sp[i2].len)) i2 = i;
  h->sp[i1].len *= 1.3; h->sp[i2].len *= 1.3;
  for (int i = 0; i < 7; i++) {
    double a = A + (i / 7.0) * TAU;
    double gap = rng_range(R, 0.55, 0.85), dr = rng_range(R, 0.08, 0.4) + 0.15 * fmax(0, cos(a - A));
    h->segs[i] = (RingSeg){ a, gap, dr, 0.7 + 0.5 * fmax(0, cos(a - A)) };
  }
  lights_add(&h->lights, X, Y, 84, C[5], 0.6, 0.5);
  lights_add(&h->lights, X, Y, 30, WHITE, 0.7, 0.1);
  lights_add(&h->lights, X, -4, 44, C[4], 0.3, 0.45);
  for (int i = 0; i < 36; i++) {
    bool back = rng_chance(R, 0.22);
    double a = (back ? A + M_PI : A) + rng_range(R, -1, 1) * (back ? 0.6 : 0.8), v = rng_range(R, 170, 430) * (back ? 0.6 : 1);
    double life = rng_range(R, 0.15, 0.5), delay = rng_chance(R, 0.3) ? rng_range(R, 0, 0.04) : 0;
    ps_spawn(&h->ps, PK_SPARK, X, Y, cos(a) * v, sin(a) * v - 50, life, WHITE, 1, delay);
  }
  for (int i = 0; i < 10; i++) {
    double a = A + rng_range(R, -1, 1) * 1.1 - 0.35, v = rng_range(R, 110, 280);
    Bit b; memset(&b, 0, sizeof b);
    b.x = X; b.y = Y; b.vx = cos(a) * v; b.vy = sin(a) * v - 40; b.g = 0.8; b.drag = 0.7; b.bounce = 0.35;
    b.life = rng_range(R, 0.55, 0.85); b.a = rng_range(R, 0, TAU); b.va = rng_range(R, -25, 25); b.s = rng_range(R, 2, 4.5);
    const uint32_t pick[4] = { C[7], C[6], C[6], C[5] };
    b.c = pick[(int)floor(rng_next(R) * 4)];
    bits_add(&h->bits, b);
  }
  for (int i = 0; i < 12; i++) {
    double a = A - M_PI / 2 + rng_range(R, -1.4, 1.4), v = rng_range(R, 35, 110);
    double life = rng_range(R, 0.35, 0.7);
    const uint32_t pick[3] = { C[6], C[5], C[5] };
    uint32_t col = pick[(int)floor(rng_next(R) * 3)];
    double delay = rng_range(R, 0, 0.05);
    ps_spawn(&h->ps, PK_MOTE, X + cos(a) * 4, Y + sin(a) * 4, cos(a) * v, sin(a) * v - 15, life, col, 0.6, delay);
  }
  for (int i = 0; i < 5; i++) {
    double a = rng_range(R, 0, TAU), d = rng_range(R, 14, 34);
    double life = rng_range(R, 0.22, 0.38); uint32_t col = rng_chance(R, 0.5) ? C[6] : WHITE; double size = rng_range(R, 1.6, 3), delay = rng_range(R, 0.08, 0.32);
    ps_spawn(&h->ps, PK_STAR, X + cos(a) * d, Y + sin(a) * d * 0.8, 0, -4, life, col, size, delay);
  }
  return h;
}
static void crit_update(Fx *fx, double dt) { CritHit *h = fx->st; h->t += dt; ps_update(&h->ps, dt); bits_update(&h->bits, dt); lights_update(&h->lights, dt); }
static void crit_draw(Fx *fx, Painter *p) {
  CritHit *h = fx->st; const uint32_t *C = h->C; double t = h->t, X = 0, Y = -26;
  double u = pc01((t - 0.03) / 0.37);
  if (t >= 0.03 && u < 1) {
    double r = 10 + 30 * e_outCubic(u), brk = psmooth(0.12, 0.6, u), th = fmax(1, 3.6 * pow(1 - u, 1.2));
    int i = u < 0.12 ? 7 : u < 0.3 ? 6 : u < 0.5 ? 5 : u < 0.75 ? 4 : 3;
    brokenRing(p, X, Y, r, th, h->segs, 7, brk, C[i], C[i - 2 > 2 ? i - 2 : 2], u < 0.6 ? 1 : (1 - u) / 0.4, 1, 0);
    if (u < 0.6) pnt_glowRing(p, X, Y, r, 6, C[5], 0.35 * pow(1 - u / 0.6, 2));
  }
  bits_draw(&h->bits, p);
  ps_draw(&h->ps, p, -1);
  double f = (t - 0.04) / 0.28;
  if (f > 0 && f < 1) {
    crit_flare(p, X, Y, 64 * pow(1 - f, 1.3), 1 - f, C);
    pnt_glow(p, X, Y, 56, C[5], 0.4 * (1 - f));
  }
  for (int i = 0; i < 4; i++)
    if (t >= KEYS[i].t && t < KEYS[i + 1].t) {
      uint32_t cols[4] = { C[KEYS[i].cols[0]], C[KEYS[i].cols[1]], C[KEYS[i].cols[2]], C[KEYS[i].cols[3]] };
      star(p, X, Y, h->sp, 14, KEYS[i].sc, KEYS[i].th, cols, KEYS[i].a, 2.6);
    }
  double pop = exp(-t / 0.05);
  if (pop > 0.02) { pnt_glow(p, X, Y, 44, C[5], 0.4 * pop); pnt_glow(p, X, Y, 12, WHITE, 0.6 * pop); }
  lights_draw(&h->lights, p);
}

// ---- sword slash
typedef struct { double cx, cy, R, sy, rot, a0, a1, W, t0, sweep, hold, trail; const uint32_t *ramp; int n; } Slash;
typedef struct { uint32_t C[7]; Rng R; Particles ps; Slash A, E; double tipx, tipy, tipdx, tipdy, t; bool landed; } SwordSlash;
static void onArc(const Slash *s, double r, double a, double *x, double *y) {
  double lx = cos(a) * r, ly = sin(a) * r * s->sy, c = cos(s->rot), n = sin(s->rot);
  *x = s->cx + lx * c - ly * n; *y = s->cy + lx * n + ly * c;
}
static void crescent(Painter *p, const Slash *s, double ta, double L, double W, double age) {
  if (fabs(L) < 0.02 || W < 0.3) return;
  const uint32_t *R = s->ramp; int n = s->n;
  double dir = L > 0 ? 1 : -1, span = fabs(L), c = cos(s->rot), sn = sin(s->rot), B = s->R + 2;
  SHADE_BEGIN(p, s->cx - B, s->cy - B, s->cx + B, s->cy + B)
    double dx = x - s->cx, dy = y - s->cy, lx = dx * c + dy * sn, ly = (-dx * sn + dy * c) / s->sy, r = hypot(lx, ly);
    if (r > s->R + 0.5 || r < s->R - W - 1) SNONE;
    double u = fmod(dir * (atan2(ly, lx) - ta), TAU);
    if (u < 0) u += TAU;
    if (u > span) SNONE;
    double v = u / span, w = W * pow(sin(M_PI * pow(v, 2.2)), 0.6);
    if (w < 0.35) SNONE;
    double q = (s->R - r) / w;
    if (q < 0 || q > 1) SNONE;
    int ci = q < 0.22 && age < 0.5 ? 0 : (int)JSROUND(q * (n - 1) * 0.75 + age * 2.4 - v * 0.8 + 0.4);
    if (ci < 0) ci = 0; if (ci > n - 1) ci = n - 1;
    oc = R[n - 1 - ci];
    oa = fmin(1, v / 0.4);
  SHADE_END
  for (double u = 0; u <= span; u += 0.3) {
    double x, y; onArc(s, s->R - W * 0.4, ta + dir * u, &x, &y);
    pnt_glow(p, x, y, 5 + W, R[n - 3], 0.22 * (1 - age) * (u / span));
  }
}
static void drawSlash(Painter *p, const Slash *s, double t) {
  double u = t - s->t0;
  if (u < 0) return;
  double span = s->a1 - s->a0, head = e_outExpo(pc01(u / s->sweep)), tail = psmooth(s->sweep + s->hold, s->sweep + s->hold + s->trail, u);
  double age = pc01(u / (s->sweep + s->hold + s->trail));
  if (tail < 1) crescent(p, s, s->a0 + span * tail, span * (head - tail), s->W * (1 - tail * 0.55), age);
  double th = 0.7 * (1 - pc01((u - s->sweep - s->hold) / (s->trail + 0.2)));
  if (tail > 0.02 && th > 0)
    for (double k = 0; k <= tail; k += 0.6 / (fabs(span) * s->R)) {
      double x, y; onArc(s, s->R - 0.5, s->a0 + span * k, &x, &y);
      pnt_dot(p, x, y, s->ramp[1], th * (0.4 + 0.6 * k));
    }
}
static void *slash_create(Fx *fx) {
  SwordSlash *h = calloc(1, sizeof *h);
  pfit(fx->pal, fx->npal, 7, h->C);
  rng_seed(&h->R, fx->seed);
  uint32_t sp[4]; { const char *s[] = { "#fff3a6", "#ffe26b", "#ff8a2a", "#f2561d" }; hexs(sp, 4, s); }
  ps_init(&h->ps, &h->R, sp, 4);
  double R0 = fx->radius > 0 ? fx->radius : 42, a0 = -2.55, a1 = 0.95;
  h->A = (Slash){ 6, -26, R0, 0.6, -0.38, a0, a1, 12, 0, 0.06, 0.06, 0.24, h->C, 7 };
  h->E = h->A;
  h->E.R = R0 * (33.0 / 42); h->E.W = R0 * (4.5 / 42); h->E.a0 = a0 + (a1 - a0) * 0.1; h->E.a1 = a1 - (a1 - a0) * (0.15 / 3.5);
  h->E.t0 = 0.017; h->E.hold = 0.03; h->E.trail = 0.2; h->E.n = 6;
  const Slash *s = &h->A;
  double x, y, x2, y2;
  onArc(s, s->R - s->W * 0.3, s->a1, &x, &y);
  onArc(s, s->R - s->W * 0.3, s->a1 + (s->a1 - s->a0 > 0 ? 1 : -1) * 0.05, &x2, &y2);
  double l = hypot(x2 - x, y2 - y); if (!l) l = 1;
  h->tipx = x; h->tipy = y; h->tipdx = (x2 - x) / l; h->tipdy = (y2 - y) / l;
  return h;
}
static void slash_update(Fx *fx, double dt) {
  SwordSlash *h = fx->st; Rng *Rg = &h->R; const uint32_t *C = h->C;
  h->t += dt;
  if (!h->landed && h->t >= h->A.sweep) {
    h->landed = true;
    for (int i = 0; i < 10; i++) {
      double a = atan2(h->tipdy, h->tipdx) + rng_range(Rg, -0.5, 0.5), sp = rng_range(Rg, 150, 400), life = rng_range(Rg, 0.12, 0.35);
      ps_spawn(&h->ps, PK_SPARK, h->tipx, h->tipy, cos(a) * sp, sin(a) * sp, life, WHITE, 1, 0);
    }
    for (int i = 0; i < 16; i++) {
      double a = h->A.a0 + (h->A.a1 - h->A.a0) * rng_range(Rg, 0.3, 1), x, y;
      onArc(&h->A, h->A.R, a, &x, &y);
      double ox = x - h->A.cx, oy = y - h->A.cy, l = hypot(ox, oy); if (!l) l = 1;
      double sp = rng_range(Rg, 30, 100), life = rng_range(Rg, 0.25, 0.55);
      uint32_t col = C[4 + rng_int(Rg, 0, 1)];
      ps_spawn(&h->ps, PK_MOTE, x, y, (ox / l) * sp, (oy / l) * sp - 10, life, col, 0.6, 0);
    }
  }
  ps_update(&h->ps, dt);
}
static void slash_draw(Fx *fx, Painter *p) {
  SwordSlash *h = fx->st; const uint32_t *C = h->C; double t = h->t;
  drawSlash(p, &h->E, t);
  drawSlash(p, &h->A, t);
  double g = t - h->A.sweep * 0.6;
  if (g > 0 && g < 0.22) sparkle(p, h->tipx, h->tipy, 9 * e_outBack(fmin(1, g / 0.05), 1.70158) * (1 - g / 0.22), C[5], C[3], 0.6);
  if (t < 0.3) {
    double x, y; onArc(&h->A, h->A.R - 4, h->A.a0 + (h->A.a1 - h->A.a0) * e_outExpo(pc01(t / h->A.sweep)), &x, &y);
    pnt_glow(p, x, y, 40, C[3], 0.5 * (1 - t / 0.3));
  }
  ps_draw(&h->ps, p, -1);
}

// ---- poof
#define CY (-17)
typedef struct { double x, y, vx, vy, r0, r1, life, delay, max; } Ball;
typedef struct { double a, r1, d; } SpeedLine;
typedef struct { uint32_t C[6], S[3]; Rng R; Particles ps; Lights lights; Ball balls[24]; int nb; SpeedLine lines[12]; double t; } Poof;
static void *poof_create(Fx *fx) {
  Poof *h = calloc(1, sizeof *h);
  pfit(fx->pal, fx->npal, 6, h->C);
  { const char *s[] = { "#ffd84a", "#fff3a6", "#ffffff" }; hexs(h->S, 3, s); }
  const uint32_t *C = h->C, *S = h->S;
  rng_seed(&h->R, fx->seed);
  Rng *R = &h->R;
  uint32_t sp[4] = { WHITE, S[1], S[0], C[2] };
  ps_init(&h->ps, R, sp, 4);
  for (int i = 0; i < 9; i++) {
    double a = (i / 9.0) * TAU + rng_range(R, -0.2, 0.2), s = rng_range(R, 95, 140), r = rng_range(R, 5, 7);
    Ball b = { cos(a) * 3, CY + sin(a) * 3, cos(a) * s, sin(a) * s * 0.8 - 12, r * 0.5, r, 0, 0, 0 };
    b.life = rng_range(R, 0.7, 1.05); b.delay = rng_range(R, 0, 0.03);
    h->balls[h->nb++] = b;
  }
  for (int i = 0; i < 5; i++) {
    double a = rng_range(R, 0, TAU), s = rng_range(R, 20, 60);
    Ball b = { cos(a) * 2, CY + sin(a) * 2, cos(a) * s, sin(a) * s - 16, 4, 0, 0, 0, 0 };
    b.r1 = rng_range(R, 6.5, 8.5); b.life = rng_range(R, 0.85, 1.2); b.delay = rng_range(R, 0.02, 0.06);
    h->balls[h->nb++] = b;
  }
  for (int i = 0; i < 7; i++) {
    double a = rng_range(R, 0, TAU), s = rng_range(R, 170, 240), r = rng_range(R, 2.2, 3.6);
    Ball b = { cos(a) * 4, CY + sin(a) * 4, cos(a) * s, sin(a) * s * 0.75 - 10, r * 0.6, r, 0, 0, 0 };
    b.life = rng_range(R, 0.32, 0.5); b.delay = rng_range(R, 0.01, 0.04);
    h->balls[h->nb++] = b;
  }
  for (int i = 0; i < h->nb; i++) h->balls[i].max = h->balls[i].life;
  for (int i = 0; i < 12; i++) {
    double a = (i / 12.0) * TAU + rng_range(R, -0.12, 0.12) + 0.13, sa = sin(a);
    double r1 = fmin(rng_range(R, 24, 34), sa > 0.1 ? (-2 - CY) / sa : 99);
    h->lines[i] = (SpeedLine){ a, r1, rng_range(R, 0, 0.04) };
  }
  for (int i = 0; i < 7; i++) {
    double a = rng_range(R, -M_PI, 0.3), s = rng_range(R, 70, 125);
    double life = rng_range(R, 0.55, 0.95);
    const uint32_t pick[4] = { S[2], S[1], S[1], S[0] };
    uint32_t col = pick[(int)floor(rng_next(R) * 4)];
    double size = rng_range(R, 1.3, 2.4), delay = rng_range(R, 0.02, 0.1);
    ps_spawn(&h->ps, PK_STAR, cos(a) * 6, CY + sin(a) * 6, cos(a) * s, sin(a) * s - 30, life, col, size, delay);
  }
  for (int i = 0; i < 10; i++) {
    double a = rng_range(R, 0, TAU), s = rng_range(R, 40, 110);
    double life = rng_range(R, 0.3, 0.6);
    const uint32_t pick[2] = { WHITE, S[1] };
    uint32_t col = pick[(int)floor(rng_next(R) * 2)];
    double delay = rng_range(R, 0, 0.08);
    ps_spawn(&h->ps, PK_STAR, cos(a) * 5, CY + sin(a) * 5, cos(a) * s, sin(a) * s - 20, life, col, 0.6, delay);
  }
  for (int i = 0; i < 6; i++) {
    double s = rng_sign(R);
    double x = s * rng_range(R, 1, 6), vx = s * rng_range(R, 25, 70), vy = -rng_range(R, 2, 10), life = rng_range(R, 0.4, 0.7), size = rng_range(R, 1.6, 3), delay = rng_range(R, 0.02, 0.08);
    ps_spawn(&h->ps, PK_DUST, x, -1, vx, vy, life, C[2], size, delay);
  }
  lights_add(&h->lights, 0, CY, 46, C[4], 0.8, 0.4);
  lights_add(&h->lights, 0, CY, 22, WHITE, 0.8, 0.1);
  return h;
}
static double ball_radius(const Ball *b) {
  double age = b->max - b->life, u = age / b->max;
  double grow = b->r0 + (b->r1 - b->r0) * e_outBack(pc01(age / 0.22), 2), breathe = 1 + 0.06 * sin(age * 14 + b->r1);
  return grow * breathe * (u < 0.62 ? 1 : 1 - e_inBack(pc01((u - 0.62) / 0.38), 1.4));
}
static void poof_update(Fx *fx, double dt) {
  Poof *h = fx->st;
  h->t += dt;
  for (int i = h->nb - 1; i >= 0; i--) {
    Ball *b = &h->balls[i];
    if (b->delay > 0) { b->delay -= dt; continue; }
    if ((b->life -= dt) <= 0) {
      if (b->r1 > 4) ps_spawn(&h->ps, PK_STAR, b->x, b->y, 0, -8, 0.22, WHITE, 0.6, 0);
      memmove(h->balls + i, h->balls + i + 1, sizeof(Ball) * (h->nb - i - 1)); h->nb--;
      continue;
    }
    b->vx -= b->vx * 7 * dt;
    b->vy -= b->vy * 7 * dt + 30 * dt;
    b->x += b->vx * dt;
    b->y = fmin(b->y + b->vy * dt, -ball_radius(b) * 0.7);
  }
  ps_update(&h->ps, dt);
  lights_update(&h->lights, dt);
}
static uint32_t poofLineC(double v, void *ud) { return v > 0.6 ? WHITE : *(uint32_t *)ud; }
static void poof_drawBack(Fx *fx, Painter *p) {
  Poof *h = fx->st;
  double s = 1 - psmooth(0.1, 0.9, h->t);
  if (s > 0) pnt_glow(p, 0, -1, 26, h->C[4], 0.25 * s);
  ps_draw(&h->ps, p, 0);
}
static void poof_draw(Fx *fx, Painter *p) {
  Poof *h = fx->st; const uint32_t *C = h->C; double t = h->t;
  for (int layer = 0; layer < 3; layer++)
    for (int i = 0; i < h->nb; i++) {
      Ball *b = &h->balls[i];
      if (b->delay > 0) continue;
      double age = b->max - b->life, r = ball_radius(b), a = fmin(1, age * 20);
      bool lit = age < 0.12;
      if (r < 0.6) continue;
      double hy = (b->y - CY + 6) / 14; bool lo = hy > 0.4, hi = hy < -0.3;
      if (layer == 0) pnt_disc(p, b->x + r * 0.16, b->y + r * 0.2, r, lit ? C[3] : lo ? C[1] : C[2], 0.8 * a);
      else if (layer == 1) pnt_disc(p, b->x - r * 0.06, b->y - r * 0.08, r * 0.86, lit ? C[4] : lo ? C[2] : C[3], 0.88 * a);
      else if (!lo || lit) {
        pnt_disc(p, b->x - r * 0.28, b->y - r * 0.34, r * 0.42, lit || hi ? WHITE : C[4], 0.85 * a);
        if (age < 0.25) pnt_disc(p, b->x - r * 0.3, b->y - r * 0.38, r * 0.2, WHITE, 0.9 * a * (1 - age / 0.25));
      }
    }
  if (t < 0.07) {
    double k = t / 0.07;
    pnt_circle(p, 0, CY, 9 + 3 * k, C[4], 1);
    pnt_circle(p, 0, CY, 7 + 3 * k, WHITE, 1);
    flare(p, 0, CY, 20 * (1 - k * 0.5), 1 - k, C, 6);
  }
  double rk = (t - 0.03) / 0.2;
  if (rk > 0 && rk < 1) pnt_ring(p, 0, CY, 8 + 18 * e_outCubic(rk), fmax(1, 2.5 * (1 - rk)), rk < 0.3 ? WHITE : C[4], 1.1 - rk);
  for (int i = 0; i < 12; i++) {
    SpeedLine *l = &h->lines[i];
    double u = (t - l->d) / 0.2;
    if (u <= 0 || u >= 1) continue;
    double head = 8 + (l->r1 - 8) * e_outExpo(pc01(u / 0.6)), tail = 8 + (l->r1 - 8) * e_inCubic(u), ca = cos(l->a), sa = sin(l->a);
    uint32_t c4 = C[4];
    pnt_line_fn(p, ca * tail, CY + sa * tail, ca * head, CY + sa * head, poofLineC, &c4);
    pnt_glowLine(p, ca * tail, CY + sa * tail, ca * head, CY + sa * head, 3, C[4], 0.25);
  }
  ps_draw(&h->ps, p, 1);
  lights_draw(&h->lights, p);
}
#undef CY

// ---- healing bloom
#define STEM 0.42
#define BUD 0.75
#define OPEN 1.05
#define LIFT 1.7
#define WILT 2.4
#define BH 36
#define NPET 6
#define BDUR 3.3
typedef struct { double az, at; bool gone; } Petal;
typedef struct { double x, y, vx, vy, a, va, fl, vf, life, max; } Flying;
typedef struct { double x, y, t0, life, seed; int L; } Glyph;
typedef struct {
  uint32_t C[8], Pt[4], Ht[4]; Rng R; Particles ps; Lights lights;
  Petal petals[NPET]; Flying flying[NPET]; int nfly; Glyph glyphs[64]; int ngly;
  double t; bool popped, sprouted;
} Bloom;
static double bl_grow(const Bloom *h) { return e_outCubic(pc01(h->t / STEM)) * (1 - e_inCubic(pc01((h->t - WILT) / 0.6))); }
static double bl_sway(const Bloom *h) { return sin(h->t * 2.6) * 1.4 * psmooth(0.2, 0.6, h->t); }
static void bl_stem(const Bloom *h, double pts[13][2]) {
  double g = bl_grow(h), sw = bl_sway(h);
  for (int i = 0; i <= 12; i++) { double s = i / 12.0; pts[i][0] = sin(s * 3.2) * 2.2 * s + sw * s * s; pts[i][1] = (1 - g) * BH * 1.1 - s * BH; }
}
static double bl_open(const Bloom *h) { return e_outBack(pc01((h->t - BUD) / (OPEN - BUD)), 1.4); }
static void *bloom_create(Fx *fx) {
  Bloom *h = calloc(1, sizeof *h);
  pfit(fx->pal, fx->npal, 8, h->C);
  { const char *s[] = { "#4a1a3a", "#a8406e", "#ec8ab0", "#ffd8e8" }; hexs(h->Pt, 4, s); }
  { const char *s[] = { "#a8641a", "#f0b42e", "#ffe680", "#fffbe0" }; hexs(h->Ht, 4, s); }
  rng_seed(&h->R, fx->seed);
  uint32_t sp[4] = { h->Ht[3], h->Ht[2], h->Ht[1], h->Ht[0] };
  ps_init(&h->ps, &h->R, sp, 4);
  for (int i = 0; i < NPET; i++) h->petals[i] = (Petal){ (i / (double)NPET) * TAU + 0.3, LIFT + fmod(i * 0.37, 1) * 0.55, false };
  return h;
}
static void bloom_update(Fx *fx, double dt) {
  Bloom *h = fx->st; Rng *R = &h->R; const uint32_t *C = h->C, *Ht = h->Ht, *Pt = h->Pt;
  h->t += dt;
  double t = h->t, f = fmin(1, dt * 120), pts[13][2];
  bl_stem(h, pts);
  double top0 = pts[12][0], top1 = pts[12][1];
  if (!h->sprouted) {
    h->sprouted = true;
    for (int i = 0; i < 8; i++) {
      double x = rng_range(R, -3, 3), vx = rng_range(R, -40, 40), vy = -rng_range(R, 40, 100), life = rng_range(R, 0.5, 0.8);
      uint32_t col = rng_next(R) < 0.5 ? C[2] : C[3];
      ps_spawn(&h->ps, PK_GRIT, x, -1, vx, vy, life, col, 1, 0);
    }
    for (int i = 0; i < 3; i++) {
      double x = rng_range(R, -3, 3), s = rng_sign(R), vx = s * rng_range(R, 10, 30), vy = -rng_range(R, 4, 10), life = rng_range(R, 0.4, 0.6), size = rng_range(R, 1.5, 2.5);
      ps_spawn(&h->ps, PK_DUST, x, -1, vx, vy, life, C[3], size, 0);
    }
  }
  // the bud draws light in as it swells
  if (t > STEM && t < BUD && rng_chance(R, 0.3 * f)) {
    double a = rng_range(R, 0, TAU), d = rng_range(R, 14, 26), x = top0 + cos(a) * d, y = top1 - 3 + sin(a) * d * 0.8;
    double life = rng_range(R, 0.18, 0.26); uint32_t col = rng_chance(R, 0.5) ? Ht[2] : C[6];
    ps_spawn(&h->ps, PK_STREAK, x, y, (top0 - x) * 3.4, (top1 - 3 - y) * 3.4, life, col, 1, 0);
  }
  if (!h->popped && t >= OPEN - 0.12) {
    h->popped = true;
    lights_add(&h->lights, top0, top1 - 3, 22, WHITE, 0.45, 0.08);
    lights_add(&h->lights, top0, top1 - 3, 70, Ht[2], 0.5, 0.8);
    for (int i = 0; i < 16; i++) {
      double a = rng_range(R, 0, TAU), sp = rng_range(R, 40, 120), life = rng_range(R, 0.4, 0.8); uint32_t col = rng_chance(R, 0.5) ? Ht[3] : C[7];
      ps_spawn(&h->ps, PK_MOTE, top0, top1 - 3, cos(a) * sp, sin(a) * sp - 20, life, col, 0.7, 0);
    }
    for (int i = 0; i < 5; i++) {
      double x = top0 + rng_range(R, -10, 10), y = top1 - rng_range(R, 0, 14), life = rng_range(R, 0.3, 0.6), size = rng_range(R, 1, 2.4), delay = rng_range(R, 0, 0.3);
      ps_spawn(&h->ps, PK_STAR, x, y, 0, -6, life, Ht[3], size, delay);
    }
  }
  // while it blooms: crosses and motes of light drift up round it
  if (t > OPEN && t < WILT && rng_chance(R, 0.13 * f)) {
    Glyph g; g.x = rng_range(R, -22, 22); g.y = -rng_range(R, 2, 36); g.t0 = t; g.life = fmin(rng_range(R, 0.7, 1.1), BDUR - 0.05 - t);
    g.L = rng_chance(R, 0.35) ? 3 : 2; g.seed = rng_next(R) * 9;
    if (h->ngly < 64) h->glyphs[h->ngly++] = g;
  }
  if (t > OPEN - 0.1 && t < WILT && rng_chance(R, 0.35 * f)) {
    double x = rng_range(R, -20, 20), y = -rng_range(R, 0, 8), vx = rng_range(R, -6, 6), vy = -rng_range(R, 25, 55), life = fmin(rng_range(R, 0.6, 1.1), BDUR - 0.05 - t);
    uint32_t col = rng_chance(R, 0.6) ? C[6] : Ht[2]; double size = rng_chance(R, 0.3) ? 2 : 1;
    ps_spawn(&h->ps, PK_EMBER, x, y, vx, vy, life, col, size, 0);
  }
  for (int i = h->ngly - 1; i >= 0; i--) if (t - h->glyphs[i].t0 > h->glyphs[i].life) { memmove(h->glyphs + i, h->glyphs + i + 1, sizeof(Glyph) * (h->ngly - i - 1)); h->ngly--; }
  // petals let go one by one and lift away, turning, until they twinkle out
  for (int i = 0; i < NPET; i++) {
    Petal *q = &h->petals[i];
    if (!q->gone && t >= q->at) {
      q->gone = true;
      double e = M_PI / 2 - 0.15, dx = sin(e) * cos(q->az), L = 10;
      Flying fl; fl.x = top0 + dx * L * 0.6; fl.y = top1 - 3 - cos(e) * L * 0.6;
      fl.vx = dx * 30 + rng_range(R, -10, 10); fl.vy = -rng_range(R, 25, 45); fl.a = atan2(-cos(e), dx); fl.va = rng_range(R, -5, 5);
      fl.fl = 0; fl.vf = rng_range(R, 5, 9); fl.life = fmin(rng_range(R, 0.75, 1.0), BDUR - 0.45 - t); fl.max = fl.life;
      if (h->nfly < NPET) h->flying[h->nfly++] = fl;
    }
  }
  for (int i = h->nfly - 1; i >= 0; i--) {
    Flying *q = &h->flying[i];
    if ((q->life -= dt) <= 0) {
      ps_spawn(&h->ps, PK_STAR, q->x, q->y, 0, -8, fmin(0.35, BDUR - 0.05 - t), Pt[3], 1.8, 0);
      memmove(h->flying + i, h->flying + i + 1, sizeof(Flying) * (h->nfly - i - 1)); h->nfly--;
      continue;
    }
    q->vx -= q->vx * 1.5 * dt;
    q->vy -= q->vy * 0.8 * dt + 10 * dt;
    q->x += q->vx * dt + sin(q->fl) * 12 * dt;
    q->y += q->vy * dt;
    q->a += q->va * dt;
    q->fl += q->vf * dt;
  }
  ps_update(&h->ps, dt);
  lights_update(&h->lights, dt);
}
static void bl_petal(Bloom *h, Painter *p, const Petal *q, double top0, double top1) {
  double op = bl_open(h), e = 0.15 + (M_PI / 2 - 0.2 - 0.15) * op, dx = sin(e) * cos(q->az), dz = sin(e) * sin(q->az), dy = -cos(e);
  double L = 8 + (12 - 8) * op, len = L * hypot(dx, dy), ang = atan2(dy, dx), cy = top1 - 3;
  bool back = dz < 0;
  if (len < 1.5) return;
  const uint32_t *Pt = h->Pt;
  uint32_t pb[4] = { Pt[0], Pt[0], Pt[1], Pt[2] };
  drawLeaf(p, top0 + dx * L * 0.5, cy + dy * L * 0.5, len + 1, 3 + (1 - fabs(dz)) * 0.8, ang, back ? 0.9 : 0.2, back ? pb : Pt, 1);
}
static void bl_cross(Painter *p, double x, double y, int L, const uint32_t *C, double a, bool glint) {
  double X = JSROUND(x), Y = JSROUND(y);
#define INS(dx, dy) (((dx) == 0 && abs(dy) <= L) || ((dy) == 0 && abs(dx) <= L))
  for (int dy = -L - 1; dy <= L + 1; dy++)
    for (int dx = -L - 1; dx <= L + 1; dx++) {
      if (INS(dx, dy)) pnt_dot(p, X + dx, Y + dy, glint && !dx && !dy ? WHITE : dy < 0 || dx < 0 ? C[6] : C[5], a);
      else if (L > 1 && (INS(dx - 1, dy) || INS(dx + 1, dy) || INS(dx, dy - 1) || INS(dx, dy + 1))) pnt_dot(p, X + dx, Y + dy, C[2], a * 0.8);
    }
#undef INS
  pnt_glow(p, x, y, 5 + L * 2, C[6], 0.35 * a);
}
static void bloom_drawBack(Fx *fx, Painter *p) {
  Bloom *h = fx->st; const uint32_t *C = h->C, *Ht = h->Ht; double t = h->t, pts[13][2];
  double bloom = psmooth(OPEN - 0.15, OPEN + 0.2, t) * (1 - psmooth(WILT - 0.2, WILT + 0.5, t));
  bl_stem(h, pts);
  for (int hh = 0; hh < 70; hh += 7) pnt_glow(p, 0, -hh, 22, C[5], 0.12 * bloom * (1 - hh / 80.0));
  double k = pc01((t - OPEN + 0.12) / 0.6);
  if (k > 0 && k < 1) { uint32_t r4[4] = { C[3], C[5], Ht[2], Ht[3] }; band(p, 0, 0.5, 6 + 30 * e_outCubic(k), 0.18, fmax(1, 3 * (1 - k)), 1.1 - k, r4, 4, true); }
  double fw = 6 + 16 * psmooth(0, 0.8, t);
  for (int x = (int)floor(-fw); x <= fw; x++) {
    double u = abs(x) / fw, a = sqrt(1 - u) * psmooth(0, 0.4, t) * (1 - psmooth(WILT, WILT + 0.6, t));
    pnt_dot(p, x, 0, u < 0.3 ? C[6] : u < 0.65 ? C[5] : C[4], a);
    if ((x % 5) == 0) pnt_glow(p, x, 0, 8, C[5], 0.2 * a * (1 - u));
  }
  if (t > BUD - 0.05) for (int i = 0; i < NPET; i++) if (sin(h->petals[i].az) < 0 && !h->petals[i].gone) bl_petal(h, p, &h->petals[i], pts[12][0], pts[12][1]);
  ps_draw(&h->ps, p, 0);
}
static void bloom_draw(Fx *fx, Painter *p) {
  Bloom *h = fx->st; const uint32_t *C = h->C, *Ht = h->Ht, *Pt = h->Pt; double t = h->t, pts[13][2];
  bl_stem(h, pts);
  double top0 = pts[12][0], top1 = pts[12][1], g = bl_grow(h);
  if (g > 0.02) {
    for (int i = 1; i < 13; i++) {
      double x0 = pts[i - 1][0], y0 = pts[i - 1][1], x1 = pts[i][0], y1 = pts[i][1];
      if (y1 > 0) continue;
      pnt_line(p, x0, y0, x1, y1, C[5], 1);
      pnt_line(p, x0 + 1, y0, x1 + 1, y1, C[3], 1);
    }
    const double LV[2][3] = { { 4, -1, 0.1 }, { 7, 1, 0.22 } };
    for (int q = 0; q < 2; q++) {
      int i = (int)LV[q][0]; double sd = LV[q][1], d = LV[q][2];
      double lk = e_outBack(pc01((t - d - 0.12) / 0.3), 1.6) * (1 - psmooth(WILT, WILT + 0.5, t) * 0.4), x = pts[i][0], y = pts[i][1];
      if (lk <= 0 || y > -1) continue;
      double la = sd < 0 ? -2.6 + 0.4 * (1 - lk) : -0.55 - 0.4 * (1 - lk);
      uint32_t lp[4] = { C[1], C[3], C[5], C[6] };
      drawLeaf(p, x + cos(la) * 6 * lk, y + sin(la) * 6 * lk, 12 * lk, 3.4, la, 0.25, lp, 1);
    }
    if (t > STEM - 0.1 && t < OPEN - 0.1) {
      double b = pc01((t - STEM + 0.1) / (BUD - STEM)), w = 2 + 2.5 * b, hh = 3.5 + 5 * b, ecx = top0, ecy = top1 - hh * 0.6;
      SHADE_BEGIN(p, ecx - w, ecy - hh, ecx + w, ecy + hh)
        double dx = (x - ecx) / w, dy = (y - ecy) / hh, d2 = dx * dx + dy * dy;
        if (d2 > 1) SNONE;
        double d = sqrt(d2), a = atan2(dy, dx);
        oc = cos(a) < -0.2 ? Pt[2] : d > 0.7 ? Pt[0] : Pt[1];
      SHADE_END
      pnt_glow(p, top0, top1 - hh * 0.6, 8 + 8 * b, Ht[2], 0.25 * b);
    }
  }
  for (int i = 0; i < NPET; i++) if (sin(h->petals[i].az) >= 0 && !h->petals[i].gone && t > BUD - 0.05) bl_petal(h, p, &h->petals[i], top0, top1);
  if (t > OPEN - 0.12 && t < WILT + 0.3) {
    double pulse = 0.85 + 0.15 * sin(t * 9), k = 1 - psmooth(WILT - 0.3, WILT + 0.3, t), cy = top1 - 4;
    pnt_circle(p, top0, cy, 3.3 * k, Ht[1], 1);
    pnt_circle(p, top0 - 0.5, cy - 0.5, 2.2 * k, Ht[2], 1);
    pnt_px(p, top0 - 1, cy - 1, Ht[3]);
    pnt_glow(p, top0, cy, 16 * pulse, Ht[2], 0.5 * k);
    pnt_glow(p, top0, cy, 34, C[5], 0.2 * k);
  }
  double e = t - OPEN + 0.12;
  if (e > 0 && e < 0.16) sparkle(p, top0, top1 - 3, 10 * (1 - e / 0.16), Ht[3], Ht[2], 0.6);
  for (int i = 0; i < h->nfly; i++) { Flying *q = &h->flying[i]; drawLeaf(p, q->x, q->y, 6, 2.2, q->a, q->fl, Pt, fmin(1, q->life / 0.3)); }
  for (int i = 0; i < h->ngly; i++) {
    Glyph *q = &h->glyphs[i];
    double k = (t - q->t0) / q->life;
    bl_cross(p, q->x + sin(k * 5 + q->seed) * 2, q->y - k * 24, q->L, C, sin(M_PI * k), sin(k * 14 + q->seed) > 0.8);
  }
  ps_draw(&h->ps, p, 1);
  lights_draw(&h->lights, p);
}

// ---------------------------------------------------------------- createFx (core/fx.js)
static const struct { const char *pal[9]; int n; double D; bool loop; } META[] = {
  [FX_CAMPFIRE] = { { "#4a1712", "#8a1f17", "#c9281f", "#f2561d", "#ff8a2a", "#ffc23d", "#ffe26b", "#fff3a6", "#ffffff" }, 9, 3, true },
  [FX_FIREBALL] = { { "#4a1712", "#8a1f17", "#c9281f", "#f2561d", "#ff8a2a", "#ffc23d", "#ffe26b", "#fff3a6", "#ffffff" }, 9, 1.2, true },
  [FX_HITSPARK] = { { "#4a1712", "#c9281f", "#f2561d", "#ff8a2a", "#ffe26b", "#fff3a6", "#ffffff" }, 7, 0.5, false },
  [FX_CRITHIT] = { { "#2a0510", "#5c0a1c", "#a3142a", "#e0302c", "#ff7a2a", "#ffc23d", "#fff09a", "#ffffff" }, 8, 0.9, false },
  [FX_SWORDSLASH] = { { "#212f6b", "#2c58aa", "#3a8bd8", "#62c8f4", "#b8c9e8", "#e8f1ff", "#ffffff" }, 7, 0.75, false },
  [FX_POOF] = { { "#2a2440", "#5e5878", "#9a94b4", "#cdc8e0", "#f2f0fa", "#ffffff" }, 6, 1.6, false },
  [FX_BLOOM] = { { "#0c1a10", "#173a1a", "#24582a", "#357a34", "#52a03e", "#86c84e", "#c4ec7a", "#f4ffd0" }, 8, 3.3, false },
};
static const double FADE = 0.3;

static Fx *createFx(int kind, FxOpts o) {
  initPal();
  if (!SMOKE1) {
    SMOKE1 = phex("#5b5566");
    const char *a[] = { "#2a2530", "#4a4350", "#6b6270" }; hexs(ASH, 3, a);
    const char *s[] = { "#7b6f72", "#5d5660", "#433d48", "#2b2630", "#1a171e" }; hexs(SMOKE_R, 5, s);
  }
  Fx *fx = calloc(1, sizeof *fx);
  fx->kind = kind; fx->stopAt = INFINITY; fx->D = META[kind].D; fx->loop = META[kind].loop;
  fx->x = o.x; fx->y = o.y; fx->angle = o.angle; fx->light = o.light; fx->flip = o.flip;
  fx->radius = o.radius > 0 ? o.radius : kind == FX_FIREBALL ? 5 : 42;
  fx->seed = o.hasSeed ? o.seed : (int)(mrand() * 1e6);
  int dn = META[kind].n;
  uint32_t def[9]; for (int i = 0; i < dn; i++) def[i] = phex(META[kind].pal[i]);
  // a caller's palette of another length is resampled to the default's length (resolveOptions)
  if (o.palette >= 0) { Pal pp = pal_get(o.palette); pfit(pp.c, pp.n, dn, fx->pal); }
  else memcpy(fx->pal, def, sizeof(uint32_t) * dn);
  fx->npal = dn;
  switch (kind) {
    case FX_HITSPARK: fx->st = hitspark_create(fx); break;
    case FX_CRITHIT: fx->st = crit_create(fx); break;
    case FX_SWORDSLASH: fx->st = slash_create(fx); break;
    case FX_POOF: fx->st = poof_create(fx); break;
    case FX_BLOOM: fx->st = bloom_create(fx); break;
    default: break;
  }
  return fx;
}
static void freeFx(Fx *fx) {
  switch (fx->kind) {
    case FX_HITSPARK: ps_free(&((HitSpark *)fx->st)->ps); break;
    case FX_CRITHIT: ps_free(&((CritHit *)fx->st)->ps); break;
    case FX_SWORDSLASH: ps_free(&((SwordSlash *)fx->st)->ps); break;
    case FX_POOF: ps_free(&((Poof *)fx->st)->ps); break;
    case FX_BLOOM: ps_free(&((Bloom *)fx->st)->ps); break;
  }
  free(fx->st); free(fx);
}
static void fxUpdate(Fx *fx, double dt) {
  fx->t += dt;
  if (fx->kind == FX_CAMPFIRE || fx->kind == FX_FIREBALL) return;
  // simulations step at 120 Hz or finer whatever the caller's frame rate, so they look the same everywhere
  int n = (int)fmax(1, ceil(dt * 120 - 1e-9));
  for (int i = 0; i < n; i++) {
    double d = dt / n;
    switch (fx->kind) {
      case FX_HITSPARK: hitspark_update(fx, d); break;
      case FX_CRITHIT: crit_update(fx, d); break;
      case FX_SWORDSLASH: slash_update(fx, d); break;
      case FX_POOF: poof_update(fx, d); break;
      case FX_BLOOM: bloom_update(fx, d); break;
    }
  }
}
static void fxDraw(Fx *fx, Painter *p) {
  pnt_place(p, fx->x, fx->y, fx->flip, fx->angle);
  p->fade = fx->stopAt == INFINITY ? 1 : pc01(1 - (fx->t - fx->stopAt) / FADE);
  p->lightK = fx->light;
  double tt = fx->loop ? fmod(fx->t, fx->D) : fmin(fx->t, fx->D);
  if (fx->kind == FX_POOF) { p->layer = 0; poof_drawBack(fx, p); }
  if (fx->kind == FX_BLOOM) { p->layer = 0; bloom_drawBack(fx, p); }
  p->layer = 1;
  switch (fx->kind) {
    case FX_CAMPFIRE: campfire_draw(fx, p, tt); break;
    case FX_FIREBALL: fireball_draw(fx, p, tt); break;
    case FX_HITSPARK: hitspark_draw(fx, p); break;
    case FX_CRITHIT: crit_draw(fx, p); break;
    case FX_SWORDSLASH: slash_draw(fx, p); break;
    case FX_POOF: poof_draw(fx, p); break;
    case FX_BLOOM: bloom_draw(fx, p); break;
  }
}
static void fxStop(Fx *fx) { if (fx->stopAt == INFINITY) fx->stopAt = fx->t; }
static bool fxDone(Fx *fx) { return fx->t - fx->stopAt >= FADE || (!fx->loop && fx->t >= fx->D); }

// ---------------------------------------------------------------- the layer (src/fx.js)
static FxEntry **list; static int nlist, caplist;
static Frame frame;
void fx_init(void) { fx_resize(16, 16); }
void fx_resize(int w, int h) {
  free(frame.color); free(frame.light);
  frame.w = w; frame.h = h; frame.color = calloc((size_t)w * h, 4); frame.light = calloc((size_t)w * h, 4);
}
static FxEntry *addEntry(int kind, FxOpts o) {
  FxEntry *e = calloc(1, sizeof *e);
  e->fx = createFx(kind, o);
  e->x = o.x; e->y = o.y;
  if (nlist == caplist) { caplist = caplist ? caplist * 2 : 32; list = realloc(list, sizeof(FxEntry *) * caplist); }
  list[nlist++] = e;
  return e;
}
FxEntry *fx_spawn(int kind, FxOpts o) { return addEntry(kind, o); }
FxEntry *fx_spawn_move(int kind, FxOpts o, double mx, double my, double dur, double arc, FxCallback onArrive, void *ud) {
  FxEntry *e = addEntry(kind, o);
  e->hasMove = true; e->mx = mx; e->my = my; e->mdur = dur; e->marc = arc; e->sx = e->x; e->sy = e->y;
  e->onArrive = onArrive; e->ud = ud;
  return e;
}
void fx_set_angle(FxEntry *e, double a) { ((Fx *)e->fx)->angle = a; }
void fx_set_keep(FxEntry *e, bool k) { e->keep = k; }
void fx_update(double dt) {
  // like the JS for...of, entries spawned by a callback during the loop are updated this frame too
  for (int i = 0; i < nlist; i++) {
    FxEntry *e = list[i];
    Fx *fx = e->fx;
    e->t += dt;
    fxUpdate(fx, dt);
    if (e->hasMove) {
      double k = fmin(1, e->t / e->mdur);
      e->x = e->sx + (e->mx - e->sx) * k; e->y = e->sy + (e->my - e->sy) * k - sin(k * M_PI) * e->marc;
      fx->x = e->x; fx->y = e->y;
      if (k >= 1 && !e->arrived) { e->arrived = true; if (e->onArrive) e->onArrive(e); fxStop(fx); }
    }
    if (e->life && e->t > e->life && !e->stopped) { e->stopped = true; fxStop(fx); }
  }
  int w = 0;
  for (int i = 0; i < nlist; i++) {
    FxEntry *e = list[i];
    bool d = fxDone(e->fx);
    if (!d || e->keep) list[w++] = e;
    else { freeFx(e->fx); free(e); }
  }
  nlist = w;
}
void fx_draw(Img *dst, double camX, double camY) {
  int vis = 0;
  for (int i = 0; i < nlist; i++) {
    FxEntry *e = list[i];
    if (e->x > camX - 200 && e->x < camX + frame.w + 200 && e->y > camY - 200 && e->y < camY + frame.h + 260) vis++;
  }
  if (!vis) return;
  memset(frame.color, 0, (size_t)frame.w * frame.h * 4);
  memset(frame.light, 0, (size_t)frame.w * frame.h * 4);
  frame.ox = (int)camX; frame.oy = (int)camY;
  Painter p;
  for (int i = 0; i < nlist; i++) {
    FxEntry *e = list[i];
    if (!(e->x > camX - 200 && e->x < camX + frame.w + 200 && e->y > camY - 200 && e->y < camY + frame.h + 260)) continue;
    pnt_reset(&p, &frame);
    fxDraw(e->fx, &p);
  }
  // color with alpha over the scene, then light added on top
  int n = frame.w * frame.h;
  for (int i = 0; i < n && i < dst->w * dst->h; i++) {
    uint32_t c = frame.color[i], l = frame.light[i];
    uint8_t *d = dst->px + (size_t)i * 4;
    int a = c >> 24;
    if (a) {
      int r = c & 255, g = (c >> 8) & 255, b = (c >> 16) & 255;
      if (a == 255) { d[0] = (uint8_t)r; d[1] = (uint8_t)g; d[2] = (uint8_t)b; }
      else { int ia = 255 - a; d[0] = (uint8_t)((r * a + d[0] * ia + 127) / 255); d[1] = (uint8_t)((g * a + d[1] * ia + 127) / 255); d[2] = (uint8_t)((b * a + d[2] * ia + 127) / 255); }
    }
    if (l & 0xffffff) {
      int v;
      v = d[0] + (int)(l & 255); d[0] = (uint8_t)(v > 255 ? 255 : v);
      v = d[1] + (int)((l >> 8) & 255); d[1] = (uint8_t)(v > 255 ? 255 : v);
      v = d[2] + (int)((l >> 16) & 255); d[2] = (uint8_t)(v > 255 ? 255 : v);
    }
  }
}
