// Props, painted in code: trees, pines, dead trees, rocks, bushes, ferns, ruins, camp things, the dock posts
// (art/props.js). Everything is lit from the top left, stepped through hard ramps with ordered dithering, and
// outlined dark.
#include "game.h"
#include <stdlib.h>
#include <string.h>

static const RGB INK = { 24, 18, 30 };
static double L3[3];
static RGB R_leaf[7], R_leafDark[6], R_autumn[6], R_bark[5], R_barkDead[5], R_stone[6], R_moss[4], R_wood[6], R_cloth[2][5], R_bone[4];

static void initRamps(void) {
  static bool done;
  if (done) return;
  done = true;
  double v[3] = { -0.55, -0.65, 0.55 }, n = sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  for (int i = 0; i < 3; i++) L3[i] = v[i] / n;
  { const char *a[] = { "#16301c", "#1f4522", "#2c5f28", "#3f7a2e", "#5a9a36", "#7cb840", "#a3d052" }; ramp_hex(R_leaf, 7, a); }
  { const char *a[] = { "#121f22", "#172d2a", "#1f3f30", "#2a5436", "#386a3c", "#4f8444" }; ramp_hex(R_leafDark, 6, a); }
  { const char *a[] = { "#3a1418", "#5c1f1c", "#8a3220", "#b44f24", "#d8782e", "#f0a640" }; ramp_hex(R_autumn, 6, a); }
  { const char *a[] = { "#22111a", "#381b22", "#52282c", "#6c3834", "#8a4c40" }; ramp_hex(R_bark, 5, a); }
  { const char *a[] = { "#1c0f1e", "#2e1830", "#47223e", "#62304a", "#7c4258" }; ramp_hex(R_barkDead, 5, a); }
  { const char *a[] = { "#262a30", "#383e44", "#4c5458", "#636c6c", "#7e8882", "#a0a89c" }; ramp_hex(R_stone, 6, a); }
  { const char *a[] = { "#2c4a22", "#3f6a2a", "#5a8a32", "#7aa83c" }; ramp_hex(R_moss, 4, a); }
  { const char *a[] = { "#3a1e14", "#5a2e1c", "#7e4426", "#a35e32", "#c67c42", "#e0a058" }; ramp_hex(R_wood, 6, a); }
  { const char *a[] = { "#3a1c26", "#5e2a32", "#8a3c3c", "#b0564a", "#cc7a5e" }; ramp_hex(R_cloth[0], 5, a); }
  { const char *a[] = { "#1c2a3e", "#284060", "#36587e", "#4c76a0", "#6e98bc" }; ramp_hex(R_cloth[1], 5, a); }
  { const char *a[] = { "#5a5244", "#8a806a", "#bcb298", "#e8e0c8" }; ramp_hex(R_bone, 4, a); }
}

static Art mkart(PixBuf *pb, double ox, double oy, double shadow) {
  Art a; memset(&a, 0, sizeof a);
  a.img = pb_img(pb); a.ox = ox; a.oy = oy; a.shadow = shadow;
  pb_free(pb);
  return a;
}

typedef struct { double x, y, r, sy, b, z; Ramp ramp; } Sphere;
/** Shade a set of spheres into a buffer: the nearest sphere at each pixel wins, lit by its normal. */
static void spheres(PixBuf *pb, const Sphere *list, int n, double tex, double texScale, double seed, bool rim) {
  for (int y = 0; y < pb->h; y++)
    for (int x = 0; x < pb->w; x++) {
      int best = -1; double bz = -1e9, bdx = 0, bdy = 0, bzv = 0;
      for (int i = 0; i < n; i++) {
        const Sphere *s = &list[i];
        double dx = (x - s->x) / s->r, dy = (y - s->y) / (s->r * s->sy);
        double q = dx * dx + dy * dy;
        if (q > 1) continue;
        double z = sqrt(1 - q);
        double zz = s->y + z * s->r * 0.6 + s->z;
        if (zz > bz) { bz = zz; best = i; bdx = dx; bdy = dy; bzv = z; }
      }
      if (best < 0) continue;
      const Sphere *s = &list[best];
      double v = (bdx * L3[0] + bdy * L3[1] + bzv * L3[2]) * 0.55 + 0.42 + s->b;
      v += (vnoise(x / texScale, y / texScale, seed) - 0.5) * tex * 2;
      if (rim && bdy > 0.7) v -= 0.15;
      pb_set(pb, x, y, rampAt(s->ramp, clamp01(v), x, y));
    }
}
static Sphere sph(double x, double y, double r, double sy, Ramp rp, double b) { Sphere s = { x, y, r, sy, b, 0, rp }; return s; }

static void leafCanopy(PixBuf *pb, Rng *R, double cx, double cy, double rx, double ry, Ramp rp, int n) {
  Sphere list[24]; int m = 0;
  double mr = fmin(rx, ry);
  for (int i = 0; i < n; i++) {
    double a = rng_range(R, 0, M_PI * 2), d = sqrt(rng_next(R));
    double r = rng_range(R, 0.32, 0.5) * mr * 1.2;
    double x = cx + cos(a) * d * (rx - r * 0.7), y = cy + sin(a) * d * (ry - r * 0.7);
    list[m++] = sph(x, y, r, 0.85, rp, rng_range(R, -0.05, 0.08));
  }
  list[m++] = sph(cx, cy - ry * 0.1, mr * 0.75, 0.85, rp, 0.05);
  int seed = rng_int(R, 1, 999);
  spheres(pb, list, m, 0.22, 2.2, seed, true);
  // leaf clumps: tiny highlight and shadow specks, the texture of foliage
  for (int k = 0; k < rx * ry * 0.5; k++) {
    int x = rng_int(R, 0, pb->w - 1), y = rng_int(R, 0, pb->h - 1);
    if (pb_alpha(pb, x, y) < 200 || pb_alpha(pb, x, y - 2) < 200) continue;
    bool up = y < cy - ry * 0.1 + (x - cx) * 0.3;
    pb_set(pb, x, y, rp.c[up ? rp.n - 1 : 1]);
    pb_set(pb, x + 1, y, rp.c[up ? rp.n - 2 : 0]);
    if (up) pb_set(pb, x, y + 1, rp.c[rp.n - 3]);
  }
}

static void trunk(PixBuf *pb, double cx, double base, double w, double h, Ramp rp) {
  // roots flare out at the base
  for (double y = base - h; y <= base; y++) {
    double t = (y - (base - h)) / h;
    double flare = t > 0.7 ? pow((t - 0.7) / 0.3, 2) * w * 0.9 : 0;
    double hw = w / 2 + flare + sin(y * 0.5) * 0.4;
    for (double x = floor(cx - hw); x <= ceil(cx + hw); x++) {
      double u = (x - (cx - hw)) / (2 * hw);
      double v = 0.85 - u * 0.75 + (vnoise(x / 1.5, y / 6, 3) - 0.5) * 0.4;
      if (hash2(x, floor(y / 4), 7) > 0.9) v -= 0.3; // bark furrows
      pb_set(pb, x, y, rampAt(rp, clamp01(v), (int)x, (int)y));
    }
  }
}

Art makeTree(int seed) {
  initRamps();
  Rng R; rng_seed(&R, seed);
  PixBuf pb = pb_new(100, 118);
  bool autumn = rng_chance(&R, 0.1);
  double tw = rng_range(&R, 9, 13);
  trunk(&pb, 50, 112, tw, 44, RAMP(R_bark));
  double rx = rng_range(&R, 36, 44), ry = rng_range(&R, 30, 36);
  int n = rng_int(&R, 9, 13);
  leafCanopy(&pb, &R, 50, 46, rx, ry, autumn ? RAMP(R_autumn) : RAMP(R_leaf), n);
  pb_outline(&pb, INK);
  Art a = mkart(&pb, 50, 112, 34);
  a.canopy = true; a.cx = 6; a.cy = 6; a.cw = 88; a.ch = 80;
  return a;
}

Art makePine(int seed) {
  initRamps();
  Rng R; rng_seed(&R, seed);
  PixBuf pb = pb_new(64, 112);
  trunk(&pb, 32, 106, 7, 22, RAMP(R_bark));
  int tiers = rng_int(&R, 4, 5);
  for (int t = 0; t < tiers; t++) {
    double top = 6 + t * 17, bot = top + 34, hw = 9 + t * 5.5;
    for (double y = top; y < bot; y++) {
      double k = (y - top) / (bot - top);
      double half = hw * pow(k, 0.8) + sin(y * 1.3 + t) * 1.2;
      for (double x = floor(32 - half); x <= ceil(32 + half); x++) {
        double u = (x - 32) / fmax(1, half);
        double v = 0.62 - u * 0.38 - k * 0.32 + (vnoise(x / 2, y / 2, t * 9 + (double)seed) - 0.5) * 0.35;
        if (k > 0.88) v -= 0.25;
        pb_set(&pb, x, y, rampAt(RAMP(R_leafDark), clamp01(v), (int)x, (int)y));
      }
    }
  }
  pb_outline(&pb, INK);
  Art a = mkart(&pb, 32, 106, 22);
  a.canopy = true; a.cx = 4; a.cy = 0; a.cw = 56; a.ch = 84;
  return a;
}

static PixBuf *DPB; static Rng *DR;
static void branch(double x, double y, double a, double len, double w, int depth) {
  Ramp rp = RAMP(R_barkDead);
  for (double s = 0; s < len; s++) {
    double bx = x + cos(a) * s, by = y + sin(a) * s, ww = fmax(1, w * (1 - s / len * 0.6));
    for (double j = -ww; j <= ww; j++)
      for (double i = -ww; i <= ww; i++) {
        if (i * i + j * j > ww * ww) continue;
        double v = 0.55 - (i + j) / (ww * 2.5) + (vnoise((bx + i) / 2, (by + j) / 2, 4) - 0.5) * 0.3;
        pb_set(DPB, bx + i, by + j, rampAt(rp, clamp01(v), (int)(bx + i), (int)(by + j)));
      }
    a += rng_range(DR, -0.08, 0.08);
  }
  if (depth <= 0) return;
  double ex = x + cos(a) * len, ey = y + sin(a) * len;
  int k = rng_int(DR, 2, 3);
  for (int i = 0; i < k; i++) {
    double na = a + rng_range(DR, -0.9, 0.9);
    double nl = len * rng_range(DR, 0.55, 0.75);
    branch(ex, ey, na, nl, w * 0.6, depth - 1);
  }
}
Art makeDeadTree(int seed) {
  initRamps();
  Rng R; rng_seed(&R, seed);
  PixBuf pb = pb_new(96, 110);
  DPB = &pb; DR = &R;
  branch(48, 104, -M_PI / 2 + rng_range(&R, -0.15, 0.15), 34, 5, 3);
  pb_outline(&pb, INK);
  Art a = mkart(&pb, 48, 104, 16);
  a.canopy = true; a.cx = 0; a.cy = 0; a.cw = 96; a.ch = 70;
  return a;
}

Art makeRock(int seed, bool wet) {
  initRamps();
  Rng R; rng_seed(&R, seed);
  const int W = 30, H = 22;
  PixBuf pb = pb_new(W, H);
  int n = rng_int(&R, 2, 4);
  Sphere list[4];
  for (int i = 0; i < n; i++) {
    double x = 15 + rng_range(&R, -6, 6), y = 13 + rng_range(&R, -2, 2), r = rng_range(&R, 5, 8.5);
    list[i] = sph(x, y, r, 0.8, RAMP(R_stone), rng_range(&R, -0.05, 0.05));
  }
  spheres(&pb, list, n, 0.25, 1.6, seed, true);
  if (!wet) for (int y = 0; y < H; y++) for (int x = 0; x < W; x++)
    if (pb_alpha(&pb, x, y) && pb_alpha(&pb, x, y - 2) && pb_alpha(&pb, x, y - 3) == 0 && fbm(x / 3.0, y / 3.0, seed, 2) > 0.45) pb_set(&pb, x, y, rampAt(RAMP(R_moss), 0.6, x, y));
  pb_outline(&pb, INK);
  RGB wl = { 150, 230, 220 };
  if (wet) for (int x = 0; x < W; x++) for (int y = H - 1; y > 0; y--) if (pb_alpha(&pb, x, y)) { pb_seta(&pb, x, y + 1, wl, 160); break; }
  return mkart(&pb, 15, 19, 10);
}

Art makeBush(int seed) {
  initRamps();
  Rng R; rng_seed(&R, seed);
  const int W = 40, H = 32;
  PixBuf pb = pb_new(W, H);
  Sphere list[8];
  int n = rng_int(&R, 4, 7);
  for (int i = 0; i < n; i++) {
    double x = 20 + rng_range(&R, -10, 10), y = 19 + rng_range(&R, -5, 3), r = rng_range(&R, 5, 9);
    list[i] = sph(x, y, r, 0.85, RAMP(R_leaf), rng_range(&R, -0.05, 0.1));
  }
  spheres(&pb, list, n, 0.35, 1.3, seed, true);
  for (int k = 0; k < 40; k++) { int x = rng_int(&R, 2, W - 3), y = rng_int(&R, 2, H - 3); if (pb_alpha(&pb, x, y) && !pb_alpha(&pb, x, y - 2)) { pb_set(&pb, x, y - 1, R_leaf[5]); pb_set(&pb, x + 1, y - 2, R_leaf[6]); } }
  if (rng_chance(&R, 0.4)) {
    RGB berry[2];
    if (rng_chance(&R, 0.5)) { const char *a[] = { "#8a1e2a", "#e04a4a" }; ramp_hex(berry, 2, a); }
    else { const char *a[] = { "#4a2a8a", "#9a6ae0" }; ramp_hex(berry, 2, a); }
    for (int k = 0; k < 6; k++) { int x = rng_int(&R, 6, 28), y = rng_int(&R, 6, 20); if (pb_alpha(&pb, x, y) && pb_alpha(&pb, x, y + 1)) { pb_set(&pb, x, y, berry[1]); pb_set(&pb, x, y + 1, berry[0]); } }
  }
  pb_outline(&pb, INK);
  return mkart(&pb, 20, 27, 13);
}

Art makeFern(int seed) {
  initRamps();
  Rng R; rng_seed(&R, seed);
  PixBuf pb = pb_new(30, 22);
  Ramp rp = RAMP(R_leaf);
  int fronds = rng_int(&R, 5, 7);
  for (int f = 0; f < fronds; f++) {
    double a = -M_PI / 2 + ((double)f / (fronds - 1) - 0.5) * 2.6, len = rng_range(&R, 8, 12);
    for (double s = 0; s < len; s++) {
      double bend = s * s * 0.012;
      double x = 15 + cos(a) * s, y = 19 + sin(a) * s + bend * 6;
      double v = 0.35 + (1 - s / len) * 0.1 + (cos(a) < 0 ? 0.25 : 0);
      pb_set(&pb, x, y, rampAt(rp, v + 0.2, (int)x, (int)y));
      if (s > 2 && fmod(s, 2) == 0) { pb_set(&pb, x + sin(a) * 2, y - cos(a) * 2, rp.c[4]); pb_set(&pb, x - sin(a) * 2, y + cos(a) * 2, rp.c[2]); }
    }
  }
  pb_outline(&pb, INK);
  return mkart(&pb, 15, 20, 0);
}

/** Tall grass clump, a few sway frames. */
TallGrass makeTallGrass(int v) {
  TallGrass tg;
  Rng R0; rng_seed(&R0, v * 101 + 3);
  struct { double x, h, lean; int c; } blades[24];
  bool big = v >= 3;
  int n = big ? 16 + rng_int(&R0, 0, 6) : 7 + rng_int(&R0, 0, 5);
  for (int i = 0; i < n; i++) {
    double u = rng_next(&R0);
    blades[i].x = (big ? 3 : 4) + u * (big ? 22 : 12);
    blades[i].h = rng_range(&R0, big ? 9 : 7, big ? 19 : 14) * (1 - fabs(u - 0.5) * 0.6);
    blades[i].lean = (u - 0.5) * 1.1 + rng_range(&R0, -0.2, 0.2);
    blades[i].c = rng_int(&R0, 0, 2);
  }
  RGB P[4];
  const char *pa[3][4] = { { "#2b5a22", "#3f7a2a", "#5f9e34", "#86c040" }, { "#2f5a24", "#4a8a2c", "#72b23a", "#a2d04c" }, { "#5e5422", "#7e7030", "#a8963e", "#cdb85a" } };
  ramp_hex(P, 4, pa[v % 3]);
  for (int f = 0; f < 4; f++) {
    PixBuf pb = pb_new(big ? 28 : 20, big ? 22 : 18);
    double sway = sin((f / 4.0) * M_PI * 2) * 1.2;
    for (int b = 0; b < n; b++) {
      for (double s = 0; s < blades[b].h; s++) {
        double k = s / blades[b].h;
        double x = blades[b].x + (blades[b].lean * s) + sway * k * k;
        double y = (big ? 21 : 17) - s;
        pb_set(&pb, x, y, P[k > 0.75 ? 3 : k > 0.35 ? 2 : blades[b].c == 0 ? 0 : 1]);
        if (k < 0.5) pb_set(&pb, x + 1, y, P[1]);
      }
    }
    tg.frames[f] = pb_img(&pb);
    pb_free(&pb);
  }
  tg.ox = big ? 14 : 10; tg.oy = big ? 21 : 17;
  return tg;
}

Art makeWall(int h, int seed, bool broken) {
  initRamps();
  const int W = 32, faceH = h * 9, topH = 10, H = faceH + topH + 8;
  PixBuf pb = pb_new(W, H);
  Ramp S = RAMP(R_stone);
#define JAG(x) (broken ? (int)floor(vnoise((x) / 4.0, 0, seed) * 6) : 0)
  for (int x = 0; x < W; x++) {
    int j = JAG(x);
    // top face
    for (int y = j; y < topH; y++) {
      double v = 0.75 + (vnoise(x / 3.0, y / 3.0, seed) - 0.5) * 0.3 - (y == topH - 1 ? 0.2 : 0);
      pb_set(&pb, x, y + 8, rampAt(S, v, x, y));
    }
    // front face, brick courses
    for (int y = 0; y < faceH; y++) {
      int row = y / 9, off = (row & 1) * 8, lx = (x + off) % 16, ly = y % 9;
      double v = 0.42 + hash2(floor((x + off) / 16.0), row, seed) * 0.2 - ((double)y / faceH) * 0.15;
      if (ly == 0) v += 0.18;
      if (ly == 8 || lx == 0) v = 0.02;
      pb_set(&pb, x, y + topH + 8, rampAt(S, v, x, y));
    }
  }
  // moss creeping over the top and hanging down
  for (int x = 0; x < W; x++) {
    if (fbm(x / 5.0, seed, 3, 2) > 0.5) {
      int len = (int)floor(fbm(x / 3.0, seed, 8, 2) * 12);
      for (int y = JAG(x); y < topH + len; y++) pb_set(&pb, x, y + 8, rampAt(RAMP(R_moss), 0.7 - y / 30.0, x, y));
    }
  }
#undef JAG
  pb_outline(&pb, INK);
  return mkart(&pb, 0, H - 1, 0);
}

Art makePillar(int h, int seed) {
  initRamps();
  const int W = 22, colH = 14 + h * 10, H = colH + 16;
  PixBuf pb = pb_new(W, H);
  Ramp S = RAMP(R_stone);
  for (int y = 0; y < colH; y++)
    for (int x = 3; x < 19; x++) {
      double u = (x - 3) / 16.0;
      double v = 0.8 - fabs(u - 0.3) * 1.1 + (vnoise(x / 2.0, y / 3.0, seed) - 0.5) * 0.2;
      if ((x - 3) % 4 == 0) v -= 0.12; // fluting
      pb_set(&pb, x, H - 4 - y, rampAt(S, clamp01(v), x, y));
    }
  // broken top
  for (int x = 3; x < 19; x++) {
    int j = (int)floor(vnoise(x / 3.0, 1, seed) * 5);
    for (int y = 0; y < 5 + j; y++) pb_set(&pb, x, H - 4 - colH + y, rampAt(S, 0.85 - y * 0.05, x, y));
  }
  // plinth
  for (int x = 0; x < W; x++) for (int y = 0; y < 5; y++) pb_set(&pb, x, H - 5 + y, rampAt(S, 0.6 - y * 0.12 - abs(x - 8) * 0.01, x, y));
  for (int y = 0; y < colH; y++) if (fbm(y / 4.0, seed, 6, 2) > 0.55) pb_set(&pb, 4 + (y % 3), H - 4 - y, R_moss[2]);
  pb_outline(&pb, INK);
  return mkart(&pb, 11, H - 1, 0);
}

Art makeRubble(int seed) {
  initRamps();
  Rng R; rng_seed(&R, seed);
  PixBuf pb = pb_new(28, 16);
  Sphere list[4];
  for (int i = 0; i < 4; i++) {
    double x = rng_range(&R, 6, 22), y = rng_range(&R, 8, 11), r = rng_range(&R, 2.5, 4.5);
    list[i] = sph(x, y, r, 0.8, RAMP(R_stone), 0);
  }
  spheres(&pb, list, 4, 0.2, 3, seed, true);
  pb_outline(&pb, INK);
  return mkart(&pb, 14, 13, 0);
}

Art makeTent(int colorIdx) {
  initRamps();
  PixBuf pb = pb_new(56, 46);
  Ramp C = RAMP(R_cloth[colorIdx]);
  for (int y = 0; y < 38; y++) {
    double half = 3 + y * 0.68;
    for (int x = (int)floor(28 - half); x <= (int)ceil(28 + half); x++) {
      bool left = x < 28;
      double v = left ? 0.72 : 0.38;
      v += (vnoise(x / 3.0, y / 5.0, 2) - 0.5) * 0.15 - (y > 34 ? 0.15 : 0);
      if (abs(x - 28) < 1) v = 0.15;
      pb_set(&pb, x, y + 4, rampAt(C, v, x, y));
    }
  }
  // the opening
  RGB dark = { 30, 18, 22 };
  for (int y = 22; y < 38; y++) { double half = (y - 22) * 0.45; for (int x = (int)floor(28 - half); x <= (int)ceil(28 + half); x++) pb_set(&pb, x, y + 4, dark); }
  // poles
  pb_set(&pb, 28, 1, R_wood[3]); pb_set(&pb, 28, 2, R_wood[3]); pb_set(&pb, 28, 3, R_wood[2]);
  pb_outline(&pb, INK);
  return mkart(&pb, 28, 42, 26);
}

Art makeLog(void) {
  initRamps();
  PixBuf pb = pb_new(40, 14);
  for (int y = 2; y < 12; y++) for (int x = 4; x < 36; x++) {
    double v = 0.75 - (y - 2) / 10.0 * 0.6 + (vnoise(x / 4.0, y, 2) - 0.5) * 0.2;
    pb_set(&pb, x, y, rampAt(RAMP(R_wood), v, x, y));
  }
  for (int y = 2; y < 12; y++) for (int x = 0; x < 6; x++) {
    double q = pow((x - 4) / 3.0, 2) + pow((y - 7) / 5.0, 2);
    if (q <= 1) pb_set(&pb, x + 1, y, q > 0.5 ? R_wood[4] : R_wood[5]);
  }
  pb_outline(&pb, INK);
  return mkart(&pb, 20, 12, 16);
}

Art makeCrate(void) {
  initRamps();
  PixBuf pb = pb_new(26, 28);
  Ramp Wd = RAMP(R_wood);
  for (int y = 0; y < 8; y++) for (int x = 1; x < 25; x++) pb_set(&pb, x, y + 1, rampAt(Wd, 0.85 - (x % 6 == 0 ? 0.3 : 0), x, y));
  for (int y = 0; y < 17; y++) for (int x = 1; x < 25; x++) {
    double v = 0.5 - y * 0.012 + (x % 6 == 0 ? -0.25 : 0);
    if (y == 0 || y == 16 || x == 1 || x == 24 || fabs(x - 1 - y * 1.4) < 1.2) v = 0.25;
    pb_set(&pb, x, y + 9, rampAt(Wd, v, x, y));
  }
  pb_outline(&pb, INK);
  return mkart(&pb, 13, 26, 12);
}

Art makeBarrel(void) {
  initRamps();
  PixBuf pb = pb_new(22, 28);
  Ramp Wd = RAMP(R_wood);
  for (int y = 0; y < 22; y++) {
    double bulge = sin((y / 21.0) * M_PI) * 2;
    for (int x = (int)floor(3 - bulge); x <= (int)ceil(18 + bulge); x++) {
      double u = (x - 3 + bulge) / (15 + bulge * 2);
      double v = 0.8 - u * 0.7 + (x % 4 == 0 ? -0.1 : 0);
      if (y == 4 || y == 5 || y == 16 || y == 17) v = u < 0.4 ? 0.3 : 0.12;
      pb_set(&pb, x, y + 5, rampAt(Wd, clamp01(v), x, y));
    }
  }
  for (int y = 0; y < 6; y++) for (int x = 3; x < 19; x++) if (pow((x - 10.5) / 8, 2) + pow((y - 3) / 3.0, 2) <= 1) pb_set(&pb, x, y + 1, rampAt(Wd, y < 3 ? 0.9 : 0.6, x, y));
  pb_outline(&pb, INK);
  return mkart(&pb, 11, 26, 10);
}

Art makePost(int h) {
  initRamps();
  const int W = 12, H = h + 16;
  PixBuf pb = pb_new(W, H);
  Ramp Wd = RAMP(R_wood);
  for (int y = 4; y < H; y++) for (int x = 2; x < 10; x++) {
    double u = (x - 2) / 8.0;
    pb_set(&pb, x, y, rampAt(Wd, clamp01(0.85 - u * 0.75 - (y > H - 4 ? 0.3 : 0)), x, y));
  }
  for (int y = 0; y < 6; y++) for (int x = 2; x < 10; x++) {
    double q = pow((x - 5.5) / 4, 2) + pow((y - 3.5) / 2.2, 2);
    if (q <= 1) pb_set(&pb, x, y + 1, q < 0.35 ? R_wood[3] : q < 0.7 ? R_wood[4] : R_wood[5]);
  }
  pb_outline(&pb, INK);
  // waterline
  RGB wl = { 170, 240, 228 };
  for (int x = 1; x < 11; x++) pb_seta(&pb, x, H - 1, wl, 200);
  return mkart(&pb, 6, H - 2, 0);
}

Art makeRowboat(void) {
  initRamps();
  const int W = 64, H = 28;
  PixBuf pb = pb_new(W, H);
  Ramp Wd = RAMP(R_wood);
  for (int y = 0; y < H; y++) for (int x = 0; x < W; x++) {
    double q = pow((x - 32) / 30.0, 2) + pow((y - 12) / 10.0, 2);
    if (q > 1) continue;
    double v;
    if (q > 0.72) v = y < 12 ? 0.9 : 0.35;
    else v = 0.45 + (x % 8 == 0 ? -0.2 : 0) - y * 0.01;
    pb_set(&pb, x, y, rampAt(Wd, v, x, y));
  }
  for (int x = 18; x < 46; x += 12) for (int y = 5; y < 20; y++) if (pow((x - 32) / 30.0, 2) + pow((y - 12) / 10.0, 2) < 0.7) pb_set(&pb, x, y, R_wood[5]);
  pb_outline(&pb, INK);
  RGB wl = { 180, 245, 232 };
  for (int x = 4; x < 60; x++) pb_seta(&pb, x, 24, wl, 180);
  return mkart(&pb, 32, 22, 0);
}

Art makeCampfireBase(void) {
  initRamps();
  PixBuf pb = pb_new(34, 18);
  for (int i = 0; i < 9; i++) {
    double a = (i / 9.0) * M_PI * 2, x = 17 + cos(a) * 12, y = 9 + sin(a) * 5;
    Sphere list[1] = { sph(x, y, 3.2, 0.8, RAMP(R_stone), 0) };
    PixBuf tmp = pb_new(34, 18);
    spheres(&tmp, list, 1, 0.2, 3, i, true);
    uint8_t c[4];
    for (int yy = 0; yy < 18; yy++) for (int xx = 0; xx < 34; xx++) if (pb_get(&tmp, xx, yy, c)) { RGB cc = { c[0], c[1], c[2] }; pb_set(&pb, xx, yy, cc); }
    pb_free(&tmp);
  }
  for (int k = 0; k < 4; k++) for (int s = 0; s < 14; s++) {
    double a = (k / 4.0) * M_PI + 0.3, x = 17 + cos(a) * (s - 7), y = 9 + sin(a) * (s - 7) * 0.4;
    pb_set(&pb, x, y, R_wood[k % 2 ? 1 : 2]); pb_set(&pb, x, y + 1, R_wood[0]);
  }
  RGB coal = { 60, 24, 20 };
  for (int x = 13; x < 22; x++) pb_set(&pb, x, 9, coal);
  pb_outline(&pb, INK);
  return mkart(&pb, 17, 12, 0);
}

Art makeBanner(void) {
  initRamps();
  PixBuf pb = pb_new(24, 56);
  for (int y = 2; y < 56; y++) { pb_set(&pb, 11, y, R_wood[2]); pb_set(&pb, 12, y, R_wood[1]); }
  RGB C[4]; { const char *a[] = { "#2a2a1a", "#4a4a22", "#6a6a2a", "#8a8a34" }; ramp_hex(C, 4, a); }
  for (int y = 6; y < 30; y++) for (int x = 13; x < 23; x++) {
    if (y > 24 && (x + y) % 3 == 0) continue;
    pb_set(&pb, x, y, rampAt(RAMP(C), 0.55 + sin(x * 0.8 + y * 0.2) * 0.2, x, y));
  }
  // a crude red skull mark
  RGB R2 = hexc("#b0302a");
  static const int P[][2] = { { 16, 12 }, { 17, 12 }, { 18, 12 }, { 19, 12 }, { 15, 13 }, { 16, 13 }, { 19, 13 }, { 20, 13 }, { 16, 14 }, { 17, 14 }, { 18, 14 }, { 19, 14 }, { 17, 16 }, { 18, 16 } };
  for (size_t i = 0; i < sizeof P / sizeof *P; i++) pb_set(&pb, P[i][0], P[i][1], R2);
  pb_outline(&pb, INK);
  return mkart(&pb, 12, 54, 6);
}

Art makeBones(int seed) {
  initRamps();
  Rng R; rng_seed(&R, seed);
  PixBuf pb = pb_new(24, 14);
  for (int k = 0; k < 3; k++) {
    double a = rng_range(&R, 0, M_PI), x0 = 12 + rng_range(&R, -5, 5), y0 = 7 + rng_range(&R, -2, 2);
    for (int s = -4; s <= 4; s++) pb_set(&pb, x0 + cos(a) * s, y0 + sin(a) * s * 0.5, R_bone[2]);
    pb_set(&pb, x0 + cos(a) * 5, y0 + sin(a) * 2.5, R_bone[3]);
    pb_set(&pb, x0 - cos(a) * 5, y0 - sin(a) * 2.5, R_bone[3]);
  }
  RGB ol = { 40, 34, 30 };
  pb_outline(&pb, ol);
  return mkart(&pb, 12, 10, 0);
}

Art makeChest(bool open) {
  initRamps();
  PixBuf pb = pb_new(26, 24);
  Ramp Wd = RAMP(R_wood);
  RGB Gd[3]; { const char *a[] = { "#6a4a10", "#c4901c", "#f4d050" }; ramp_hex(Gd, 3, a); }
  for (int y = 0; y < 12; y++) for (int x = 1; x < 25; x++) {
    double v = 0.55 - y * 0.03;
    if (x == 1 || x == 24 || x == 12 || x == 13) v = 0.2;
    pb_set(&pb, x, y + 11, rampAt(Wd, v, x, y));
  }
  if (!open) {
    for (int y = 0; y < 9; y++) for (int x = 1; x < 25; x++) pb_set(&pb, x, y + 3, rampAt(Wd, 0.85 - y * 0.06, x, y));
    for (int x = 1; x < 25; x++) pb_set(&pb, x, 11, Gd[0]);
    pb_rect(&pb, 11, 10, 4, 4, Gd[1]); pb_set(&pb, 12, 11, Gd[2]);
  } else {
    for (int y = 0; y < 6; y++) for (int x = 1; x < 25; x++) pb_set(&pb, x, y + 1, rampAt(Wd, 0.4, x, y));
    RGB in = { 30, 16, 14 };
    for (int x = 3; x < 23; x++) pb_set(&pb, x, 11, in);
    for (int x = 4; x < 22; x += 3) pb_set(&pb, x, 12, Gd[2]);
  }
  pb_outline(&pb, INK);
  return mkart(&pb, 13, 22, 12);
}

/** A soft dithered ellipse that goes under everything standing on the ground. */
Img makeShadow(double rx) {
  double ry = fmax(2, rx * 0.42);
  int W = (int)ceil(rx * 2 + 2), H = (int)ceil(ry * 2 + 2);
  Img im = img_new(W, H);
  for (int y = 0; y < H; y++) for (int x = 0; x < W; x++) {
    double qx = (x - W / 2.0 + 0.5) / rx, qy = (y - H / 2.0 + 0.5) / ry, q = qx * qx + qy * qy;
    if (q > 1) continue;
    uint8_t *p = im.px + ((size_t)y * W + x) * 4;
    p[0] = 14; p[1] = 24; p[2] = 20; p[3] = q < 0.55 ? 110 : 70;
  }
  return im;
}
