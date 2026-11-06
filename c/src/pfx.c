// pixelfx core: math, colors, the painter, simulated particles, debris and lights (core/*.js).
#include "pfx.h"
#include <stdlib.h>
#include <string.h>

// ---------------------------------------------------------------- colors
uint32_t phex(const char *h) {
  char s[8]; const char *q = h[0] == '#' ? h + 1 : h;
  if (strlen(q) == 3) { s[0] = q[0]; s[1] = q[0]; s[2] = q[1]; s[3] = q[1]; s[4] = q[2]; s[5] = q[2]; }
  else memcpy(s, q, 6);
  s[6] = 0;
  unsigned v = (unsigned)strtoul(s, NULL, 16);
  return prgb((v >> 16) & 255, (v >> 8) & 255, v & 255);
}
uint32_t pmix(uint32_t a, uint32_t b, double t) {
  t = pc01(t);
  return prgb(cred(a) + (cred(b) - cred(a)) * t, cgreen(a) + (cgreen(b) - cgreen(a)) * t, cblue(a) + (cblue(b) - cblue(a)) * t);
}
uint32_t pscale(uint32_t c, double k) { return prgb(fmin(255, cred(c) * k), fmin(255, cgreen(c) * k), fmin(255, cblue(c) * k)); }
void pfit(const uint32_t *r, int len, int n, uint32_t *out) {
  if (len == n) { memmove(out, r, sizeof(uint32_t) * n); return; }
  uint32_t tmp[16];
  for (int i = 0; i < n; i++) tmp[i] = r[(int)JSROUND((double)(i * (len - 1)) / (n - 1 > 1 ? n - 1 : 1))];
  memcpy(out, tmp, sizeof(uint32_t) * n);
}

// ---------------------------------------------------------------- math
double pclamp(double x, double a, double b) { return x < a ? a : x > b ? b : x; }
double pwrap(double x, double m) { return fmod(fmod(x, m) + m, m); }
double seg(double t, double t0, double t1) { return pc01((t - t0) / (t1 - t0)); }
double psmooth(double e0, double e1, double x) { double t = seg(x, e0, e1); return t * t * (3 - 2 * t); }
uint32_t phash(const int64_t *ns, int n) {
  uint32_t h = 0x9e3779b9u;
  for (int i = 0; i < n; i++) {
    h = (h ^ (uint32_t)ns[i]) * 0x85ebca6bu;
    h ^= h >> 13;
    h *= 0xc2b2ae35u;
    h ^= h >> 16;
  }
  return h;
}
double prand2(int64_t a, int64_t b) { int64_t n[2] = { a, b }; return phash(n, 2) / 4294967296.0; }
double prand3(int64_t a, int64_t b, int64_t c) { int64_t n[3] = { a, b, c }; return phash(n, 3) / 4294967296.0; }
void prng2(Rng *r, int64_t a, int64_t b) { int64_t n[2] = { a, b }; uint32_t h = phash(n, 2); r->s = h ? h : 1; }
void prng3(Rng *r, int64_t a, int64_t b, int64_t c) { int64_t n[3] = { a, b, c }; uint32_t h = phash(n, 3); r->s = h ? h : 1; }
/** Smooth 1D value noise in [-1, 1]. */
double pnoise1(double x, double seed) {
  double i = floor(x), f = x - i, u = f * f * (3 - 2 * f);
  double a = prand2((int64_t)i, (int64_t)seed), b = prand2((int64_t)i + 1, (int64_t)seed);
  return (a + (b - a) * u) * 2 - 1;
}
double rng_sign(Rng *r) { return rng_next(r) < 0.5 ? -1 : 1; }
double e_outCubic(double t) { return 1 - pow(1 - t, 3); }
double e_inCubic(double t) { return t * t * t; }
double e_outExpo(double t) { return t >= 1 ? 1 : 1 - pow(2, -10 * t); }
double e_outBack(double t, double s) { return t <= 0 ? 0 : t >= 1 ? 1 : 1 + (s + 1) * pow(t - 1, 3) + s * pow(t - 1, 2); }
double e_inBack(double t, double s) { return t <= 0 ? 0 : t >= 1 ? 1 : (s + 1) * t * t * t - s * t * t; }

// ---------------------------------------------------------------- painter
static const double PB[16] = { 0.5 / 16, 8.5 / 16, 2.5 / 16, 10.5 / 16, 12.5 / 16, 4.5 / 16, 14.5 / 16, 6.5 / 16, 3.5 / 16, 11.5 / 16, 1.5 / 16, 9.5 / 16, 15.5 / 16, 7.5 / 16, 13.5 / 16, 5.5 / 16 };

void pnt_reset(Painter *p, Frame *f) {
  p->f = f; p->w = f->w; p->h = f->h; p->ox = f->ox; p->oy = f->oy; p->C = f->color; p->L = f->light;
  p->tx = 0; p->ty = 0; p->fx = 1; p->cs = 1; p->sn = 0; p->fade = 1; p->lightK = 1; p->layer = 1;
}
void pnt_place(Painter *p, double x, double y, bool flip, double angle) {
  p->tx = x; p->ty = y; p->fx = flip ? -1 : 1; p->cs = cos(angle); p->sn = sin(angle);
}
void pnt_put(Painter *p, int sx, int sy, uint32_t c, double a) {
  if (!c) return;
  a *= p->fade;
  if (a < 1 && a <= PB[((sy & 3) << 2) | (sx & 3)]) return;
  int x = sx - p->ox, y = sy - p->oy;
  if (x < 0 || y < 0 || x >= p->w || y >= p->h) return;
  p->C[y * p->w + x] = c;
}
void pnt_add(Painter *p, int sx, int sy, uint32_t c, double k) {
  k *= p->fade * p->lightK;
  if (k <= 0.004) return;
  int x = sx - p->ox, y = sy - p->oy;
  if (x < 0 || y < 0 || x >= p->w || y >= p->h) return;
  int i = y * p->w + x; uint32_t d = p->L[i];
  int r = (int)fmin(255, (d & 255) + (c & 255) * k);
  int g = (int)fmin(255, ((d >> 8) & 255) + ((c >> 8) & 255) * k);
  int b = (int)fmin(255, ((d >> 16) & 255) + ((c >> 16) & 255) * k);
  p->L[i] = (255u << 24) | ((uint32_t)b << 16) | ((uint32_t)g << 8) | (uint32_t)r;
}
void pnt_blendPx(Painter *p, int sx, int sy, uint32_t c, double a) {
  a *= p->fade;
  if (!c || a <= 0.004) return;
  int x = sx - p->ox, y = sy - p->oy;
  if (x < 0 || y < 0 || x >= p->w || y >= p->h) return;
  int i = y * p->w + x; uint32_t d = p->C[i];
  double da = (d >> 24) / 255.0, oa = a + da * (1 - a), k = a / oa;
#define CH(s) ((uint32_t)((int)((((c >> (s)) & 255) * k + ((d >> (s)) & 255) * (1 - k))) & 255))
  p->C[i] = (((uint32_t)(int)(oa * 255) & 255) << 24) | (CH(16) << 16) | (CH(8) << 8) | CH(0);
#undef CH
}
void pnt_blend(Painter *p, double x, double y, uint32_t c, double a) { pnt_blendPx(p, cellX(p, x, y), cellY(p, x, y), c, a); }

void each_init(Each *e, Painter *p, double x0, double y0, double x1, double y1) {
  double ax = INFINITY, bx = -INFINITY, ay = INFINITY, by = -INFINITY;
  for (int k = 0; k < 4; k++) {
    double x = k & 1 ? x1 : x0, y = k & 2 ? y1 : y0, sx = toX(p, x, y), sy = toY(p, x, y);
    if (sx < ax) ax = sx; if (sx > bx) bx = sx; if (sy < ay) ay = sy; if (sy > by) by = sy;
  }
  e->p = p;
  double sx0 = fmax(floor(ax), p->ox), sx1 = fmin(ceil(bx), p->ox + p->w - 1);
  double sy0 = fmax(floor(ay), p->oy), sy1 = fmin(ceil(by), p->oy + p->h - 1);
  e->ok = sx0 <= sx1 && sy0 <= sy1 && isfinite(sx0) && isfinite(sy0) && isfinite(sx1) && isfinite(sy1);
  if (!e->ok) return;
  e->sx0 = (int)sx0; e->sx1 = (int)sx1; e->sy1 = (int)sy1;
  e->sx = e->sx0 - 1; e->sy = (int)sy0;
}

/** A translucent disc: puffs of smoke, vapour, dust. */
void pnt_disc(Painter *p, double cx, double cy, double r, uint32_t c, double a) {
  if (r < 0.5) { pnt_blend(p, cx, cy, c, a); return; }
  Each e; each_init(&e, p, cx - r, cy - r, cx + r, cy + r);
  while (each_next(&e)) {
    double dx = e.lx - cx, dy = e.ly - cy;
    if (dx * dx + dy * dy > r * r) continue;
    pnt_blendPx(p, e.sx, e.sy, c, a);
  }
}

void pnt_line_fn(Painter *p, double x0, double y0, double x1, double y1, uint32_t (*cf)(double u, void *ud), void *ud) {
  int sx = cellX(p, x0, y0), sy = cellY(p, x0, y0);
  int ex = cellX(p, x1, y1), ey = cellY(p, x1, y1);
  int dx = abs(ex - sx), dy = -abs(ey - sy), stepx = sx < ex ? 1 : -1, stepy = sy < ey ? 1 : -1;
  int n = dx > -dy ? dx : -dy; if (!n) n = 1;
  int err = dx + dy, i = 0;
  for (;;) {
    double u = (double)i++ / n;
    pnt_put(p, sx, sy, cf(u, ud), 1);
    if (sx == ex && sy == ey) break;
    int e2 = 2 * err;
    if (e2 >= dy) { err += dy; sx += stepx; }
    if (e2 <= dx) { err += dx; sy += stepy; }
  }
}
typedef struct { uint32_t c; } ConstC;
static uint32_t constC(double u, void *ud) { (void)u; return ((ConstC *)ud)->c; }
void pnt_line(Painter *p, double x0, double y0, double x1, double y1, uint32_t c, double a) {
  if (a >= 1) { ConstC k = { c }; pnt_line_fn(p, x0, y0, x1, y1, constC, &k); return; }
  int sx = cellX(p, x0, y0), sy = cellY(p, x0, y0);
  int ex = cellX(p, x1, y1), ey = cellY(p, x1, y1);
  int dx = abs(ex - sx), dy = -abs(ey - sy), stepx = sx < ex ? 1 : -1, stepy = sy < ey ? 1 : -1;
  int err = dx + dy;
  for (;;) {
    pnt_put(p, sx, sy, c, a);
    if (sx == ex && sy == ey) break;
    int e2 = 2 * err;
    if (e2 >= dy) { err += dy; sx += stepx; }
    if (e2 <= dx) { err += dx; sy += stepy; }
  }
}

void pnt_circle(Painter *p, double cx, double cy, double r, uint32_t c, double a) {
  if (r < 0.6) { pnt_dot(p, cx, cy, c, a); return; }
  SHADE_BEGIN(p, cx - r, cy - r, cx + r, cy + r)
    double dx = x - cx, dy = y - cy;
    if (dx * dx + dy * dy > r * r) SNONE;
    oc = c; oa = a;
  SHADE_END
}
void pnt_ring(Painter *p, double cx, double cy, double r, double w, uint32_t c, double a) {
  double r0 = fmax(0, r - w);
  SHADE_BEGIN(p, cx - r, cy - r, cx + r, cy + r)
    double dx = x - cx, dy = y - cy, d2 = dx * dx + dy * dy;
    if (d2 > r * r || d2 < r0 * r0) SNONE;
    oc = c; oa = a;
  SHADE_END
}

void pnt_glow(Painter *p, double x, double y, double r, uint32_t c, double k) {
  if (r < 1 || k <= 0.004) return;
  double cx = toX(p, x, y), cy = toY(p, x, y);
  int x0 = (int)floor(cx - r), x1 = (int)ceil(cx + r), y0 = (int)floor(cy - r), y1 = (int)ceil(cy + r);
  // clip to the frame (the JS walks the whole box; pixels outside are dropped by add())
  if (x0 < p->ox) x0 = p->ox; if (y0 < p->oy) y0 = p->oy;
  if (x1 > p->ox + p->w - 1) x1 = p->ox + p->w - 1; if (y1 > p->oy + p->h - 1) y1 = p->oy + p->h - 1;
  for (int sy = y0; sy <= y1; sy++) {
    double dy = (sy + 0.5 - cy) / r;
    for (int sx = x0; sx <= x1; sx++) {
      double dx = (sx + 0.5 - cx) / r, d = dx * dx + dy * dy;
      if (d >= 1) continue;
      double f = 1 - sqrt(d);
      pnt_add(p, sx, sy, c, f * f * k);
    }
  }
}
void pnt_glowLine(Painter *p, double x0, double y0, double x1, double y1, double r, uint32_t c, double k) {
  if (r < 1 || k <= 0.004) return;
  double ax = toX(p, x0, y0), ay = toY(p, x0, y0), bx = toX(p, x1, y1), by = toY(p, x1, y1);
  double dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy; if (!L2) L2 = 1e-9;
  int X0 = (int)floor(fmin(ax, bx) - r), X1 = (int)ceil(fmax(ax, bx) + r);
  int Y0 = (int)floor(fmin(ay, by) - r), Y1 = (int)ceil(fmax(ay, by) + r);
  if (X0 < p->ox) X0 = p->ox; if (Y0 < p->oy) Y0 = p->oy;
  if (X1 > p->ox + p->w - 1) X1 = p->ox + p->w - 1; if (Y1 > p->oy + p->h - 1) Y1 = p->oy + p->h - 1;
  for (int sy = Y0; sy <= Y1; sy++)
    for (int sx = X0; sx <= X1; sx++) {
      double px = sx + 0.5, py = sy + 0.5, u = pc01(((px - ax) * dx + (py - ay) * dy) / L2);
      double ex = ax + dx * u - px, ey = ay + dy * u - py, d = sqrt(ex * ex + ey * ey) / r;
      if (d >= 1) continue;
      double f = 1 - d;
      pnt_add(p, sx, sy, c, f * f * k);
    }
}
void pnt_glowRing(Painter *p, double x, double y, double R, double r, uint32_t c, double k) {
  if (r < 1 || k <= 0.004) return;
  double cx = toX(p, x, y), cy = toY(p, x, y), E = R + r;
  for (int sy = (int)floor(cy - E); sy <= (int)ceil(cy + E); sy++)
    for (int sx = (int)floor(cx - E); sx <= (int)ceil(cx + E); sx++) {
      double d = fabs(hypot(sx + 0.5 - cx, sy + 0.5 - cy) - R) / r;
      if (d >= 1) continue;
      double f = 1 - d;
      pnt_add(p, sx, sy, c, f * f * k);
    }
}

// ---------------------------------------------------------------- particles
static const int CROSS[4][2] = { { 1, 0 }, { -1, 0 }, { 0, 1 }, { 0, -1 } };
static const int DIAG[4][2] = { { 1, 1 }, { 1, -1 }, { -1, 1 }, { -1, -1 } };
#define GRAVITY 950
static uint32_t SMOKE_RAMP[5];
static void initSmoke(void) {
  if (SMOKE_RAMP[0]) return;
  const char *s[] = { "#7b6f72", "#5d5660", "#433d48", "#2b2630", "#1a171e" };
  for (int i = 0; i < 5; i++) SMOKE_RAMP[i] = phex(s[i]);
}
static bool soft(int k) { return k == PK_VAPOUR || k == PK_DUST || k == PK_SMOKE; }

void ps_init(Particles *ps, Rng *R, const uint32_t *sparks, int nsparks) {
  memset(ps, 0, sizeof *ps);
  initSmoke();
  ps->R = R; ps->ground = 0;
  if (sparks) { memcpy(ps->sparks, sparks, sizeof(uint32_t) * nsparks); ps->nsparks = nsparks; }
  else { const char *h[] = { "#fff3a6", "#ffe26b", "#ff8a2a", "#f2561d" }; for (int i = 0; i < 4; i++) ps->sparks[i] = phex(h[i]); ps->nsparks = 4; }
}
void ps_free(Particles *ps) { free(ps->list); ps->list = NULL; ps->n = ps->cap = 0; }
void ps_spawn(Particles *ps, int k, double x, double y, double vx, double vy, double life, uint32_t col, double size, double delay) {
  if (ps->n == ps->cap) { ps->cap = ps->cap ? ps->cap * 2 : 32; ps->list = realloc(ps->list, sizeof(Particle) * ps->cap); }
  Particle q = { k, x, y, vx, vy, life, life, col, size, rng_next(ps->R) * 100, delay, 0 };
  ps->list[ps->n++] = q;
}
static void ps_remove(Particles *ps, int i) { memmove(ps->list + i, ps->list + i + 1, sizeof(Particle) * (ps->n - i - 1)); ps->n--; }
void ps_update(Particles *ps, double dt) {
  ps->t += dt;
  Rng *R = ps->R; double t = ps->t;
  for (int i = ps->n - 1; i >= 0; i--) {
    Particle *p = &ps->list[i];
    if (p->delay > 0) { p->delay -= dt; continue; }
    if ((p->life -= dt) <= 0) { ps_remove(ps, i); continue; }
    switch (p->k) {
      case PK_FIRE:
        p->vy -= 95 * dt; p->vx += sin(t * 17 + p->seed) * 30 * dt; p->vx -= p->vx * 5 * dt; p->vy -= p->vy * 3.2 * dt;
        break;
      case PK_GRIT: {
        p->vy += GRAVITY * dt;
        p->vx -= p->vx * 0.8 * dt;
        double g = ps->ground, ny = p->y + p->vy * dt;
        p->x += p->vx * dt;
        if (p->vy > 0 && p->y <= g && ny >= g) {
          p->y = g - 0.25;
          if (p->vy > 130 && rng_chance(R, 0.4)) { p->vy = -p->vy * 0.25; p->vx = p->vx * 0.5 + rng_range(R, -10, 10); }
          else { p->vx = p->vy = 0; p->life = fmin(p->life, 0.5); }
        } else p->y = ny;
        continue;
      }
      case PK_SPARK: {
        p->vy += GRAVITY * 0.45 * dt;
        p->vx -= p->vx * 2.2 * dt;
        p->vy -= p->vy * 2.2 * dt;
        double g = ps->ground, ny = p->y + p->vy * dt;
        p->x += p->vx * dt;
        if (p->vy > 0 && p->y <= g && ny >= g) { p->vy = -p->vy * 0.45; p->vx *= 0.7; p->y = g - 0.25; }
        else p->y = ny;
        continue;
      }
      case PK_STREAK: p->vx += p->vx * 3 * dt; p->vy += p->vy * 3 * dt; break;
      case PK_FLAKE:
        p->vx -= p->vx * 2.2 * dt; p->vy -= p->vy * 2.2 * dt - 35 * dt; p->x += sin(ps->t * 2.5 + p->seed) * 7 * dt;
        break;
      case PK_EMBER:
        p->vy += (-30 + sin(t * 3 + p->seed) * 20) * dt;
        p->vx += cos(t * 2.3 + p->seed) * 45 * dt;
        p->vx -= p->vx * 1.6 * dt;
        p->vy -= p->vy * 1.6 * dt;
        break;
      case PK_SMOKE: {
        bool big = p->flag & PF_BIG;
        p->vy -= (big ? 23 : 16) * dt; p->vx += sin(t * 1.3 + p->seed) * 8 * dt; p->vx -= p->vx * 1.6 * dt; p->vy -= p->vy * 1.2 * dt;
        break;
      }
      case PK_MOTE: p->vx -= p->vx * 0.6 * dt; p->vy -= p->vy * 0.6 * dt; break;
      default: {
        double drag = soft(p->k) ? 4 : 1.6;
        p->vx -= p->vx * drag * dt;
        p->vy -= p->vy * drag * dt + 5 * dt;
      }
    }
    p->x += p->vx * dt;
    p->y += p->vy * dt;
  }
}
static uint32_t smokeAt(double t) { int i = (int)floor(t * 5); if (i < 0) i = 0; if (i > 4) i = 4; return SMOKE_RAMP[i]; }
void ps_draw(Particles *ps, Painter *p, int layer) {
  for (int i = 0; i < ps->n; i++) {
    Particle *q = &ps->list[i];
    if (q->delay > 0) continue;
    if (layer >= 0 && ((soft(q->k) || (q->flag & PF_BACK)) ? 0 : 1) != layer) continue;
    double k = q->life / q->max, x = q->x, y = q->y, sp = hypot(q->vx, q->vy);
    if (!sp) sp = 1;
    double ux = q->vx / sp, uy = q->vy / sp;
    switch (q->k) {
      case PK_SPARK: {
        const uint32_t *S = ps->sparks; int n = ps->nsparks;
        uint32_t hd = k > 0.6 ? S[0] : k > 0.3 ? S[1] : S[2];
        double len = fmin(9, 1 + sp * 0.022);
        pnt_line(p, x - ux * len, y - uy * len, x - ux * len * 0.4, y - uy * len * 0.4, k > 0.5 ? hd : S[n - 1], 1);
        pnt_line(p, x - ux * len * 0.45, y - uy * len * 0.45, x, y, hd, 1);
        pnt_glow(p, x, y, 3, hd, 0.45 * k);
        break;
      }
      case PK_MOTE: {
        double len = fmin(16, 0.5 + sp * 0.026) * q->size, a = k < 0.35 ? k / 0.35 : 1;
        pnt_line(p, x - ux * len, y - uy * len, x - ux * len * 0.35, y - uy * len * 0.35, pscale(q->col, 0.55), a);
        pnt_line(p, x - ux * len * 0.4, y - uy * len * 0.4, x, y, q->col, a);
        pnt_glow(p, x, y, 2.5 + q->size, q->col, 0.4 * k);
        break;
      }
      case PK_STREAK: {
        double L = pclamp(sp / 30, 1, 7);
        for (double d = L; d >= 0; d -= 0.5) pnt_dot(p, x - ux * d, y - uy * d, d < 1 ? WHITE : d < L * 0.5 ? q->col : pscale(q->col, 0.6), d < L * 0.5 ? 1 : 1.2 - d / L);
        pnt_glow(p, x, y, 4, q->col, 0.4);
        break;
      }
      case PK_FLAKE: {
        double a = fmin(1, k * 3);
        pnt_dot(p, x, y, q->col, a);
        if (q->size > 1.3) for (int j = 0; j < 4; j++) pnt_dot(p, x + CROSS[j][0], y + CROSS[j][1], pscale(q->col, 0.8), a * 0.8);
        break;
      }
      case PK_VAPOUR: {
        double r = q->size * (0.6 + (1 - k) * 0.9);
        pnt_disc(p, x, y, r, q->col, pow(k, 1.3) * 0.45);
        break;
      }
      case PK_DUST: pnt_disc(p, x, y, q->size * (0.6 + (1 - k) * 0.9), q->col, pow(k, 1.3) * 0.7); break;
      case PK_SMOKE: {
        double age = 1 - k; bool big = q->flag & PF_BIG;
        double r = q->size * (0.65 + fmin(1, age * 2.5) * 0.45 + age * (big ? 0.5 : 0.4));
        double a = fmin(1, age * 12) * fmin(1, k * 2.4) * (big ? 0.7 : 0.58);
        uint32_t c = q->col ? pmix(q->col, smokeAt(age), age) : smokeAt(age * 1.05);
        pnt_disc(p, x, y, r, c, a * 0.45);
        pnt_disc(p, x + r * 0.05, y + r * 0.06, r * 0.74, c, a * 0.62);
        if (age < 0.5) pnt_disc(p, x - r * 0.22, y - r * 0.3, r * 0.5, pmix(c, WHITE, 0.12), a * 0.4 * (1 - age * 2));
        break;
      }
      case PK_GRIT:
        if (k > 0.25 || k * 4 > 0.5) {
          pnt_px(p, x, y, q->col);
          if (q->size >= 2) { pnt_px(p, x + 1, y, q->col); pnt_px(p, x, y + 1, pscale(q->col, 0.8)); pnt_px(p, x + 1, y + 1, pscale(q->col, 0.7)); }
        }
        break;
      case PK_EMBER: {
        uint32_t c = k > 0.6 ? ps->sparks[0] : k > 0.3 ? ps->sparks[1] : ps->sparks[2];
        if (k < 0.25 && sin(ps->t * 40 + q->seed) < 0) break;
        pnt_px(p, x, y, c);
        if (q->size > 1.5) pnt_px(p, x, y + 1, ps->sparks[ps->nsparks - 1]);
        pnt_glow(p, x, y, 3 + q->size, c, 0.35 * k);
        break;
      }
      default: {
        // STAR: a twinkling cross, arms set by size
        double tw = 0.6 + 0.4 * sin(ps->t * (8 + fmod(q->seed, 5)) + q->seed);
        if (q->size < 1) {
          if (tw * k > 0.25) pnt_px(p, x, y, tw > 0.8 ? WHITE : q->col);
          pnt_glow(p, x, y, 3, q->col, 0.4 * k * tw);
          break;
        }
        sparkle(p, x, y, q->size * tw * fmin(1, k * 3), q->col, pscale(q->col, 0.75), 0.5 * k * tw);
      }
    }
  }
}

void lights_add(Lights *L, double x, double y, double r, uint32_t c, double k, double life) {
  if (L->n < 16) { Light l = { x, y, r, c, k, life, life }; L->list[L->n++] = l; }
}
void lights_update(Lights *L, double dt) {
  for (int i = L->n - 1; i >= 0; i--) if ((L->list[i].life -= dt) <= 0) { memmove(L->list + i, L->list + i + 1, sizeof(Light) * (L->n - i - 1)); L->n--; }
}
void lights_draw(Lights *L, Painter *p) {
  for (int i = 0; i < L->n; i++) {
    Light *l = &L->list[i];
    double k = l->life / l->max;
    pnt_glow(p, l->x, l->y, l->r * (0.55 + 0.45 * k), l->color, l->k * k * k);
  }
}

void bits_add(Bits *B, Bit b) { b.max = b.life; if (B->n < 16) B->list[B->n++] = b; }
void bits_update(Bits *B, double dt) {
  for (int i = B->n - 1; i >= 0; i--) {
    Bit *b = &B->list[i];
    if ((b->life -= dt) <= 0) { memmove(B->list + i, B->list + i + 1, sizeof(Bit) * (B->n - i - 1)); B->n--; continue; }
    if (b->rest) continue;
    b->vy += GRAVITY * b->g * dt;
    b->vx -= b->vx * b->drag * dt;
    b->vy -= b->vy * b->drag * dt;
    b->x += b->vx * dt;
    b->y += b->vy * dt;
    b->a += b->va * dt;
    double floor_ = 0, sp = b->vy;
    if (b->g <= 0 || b->y < floor_ || sp <= 0) continue;
    b->y = floor_ - 0.01;
    if (b->bounce > 0 && sp > 70) { b->vy = -sp * b->bounce; b->vx *= 0.7; b->va *= 0.6; }
    else { b->rest = true; b->vx = b->vy = 0; }
  }
}
void bits_draw(Bits *B, Painter *p) {
  for (int i = 0; i < B->n; i++) {
    Bit *b = &B->list[i];
    double a = fmin(1, b->life / 0.4), ca = cos(b->a), sa = sin(b->a);
    for (double d = -b->s / 2; d <= b->s / 2; d += 0.5) pnt_dot(p, b->x + ca * d, b->y + sa * d, d > b->s / 2 - 0.6 ? WHITE : b->c, a);
  }
}

/** A star glint: arms of length arm in color c with tips in tip, a white heart, light. */
void sparkle(Painter *p, double x, double y, double arm, uint32_t c, uint32_t tip, double k) {
  int n = (int)JSROUND(arm);
  if (n < 1) return;
  double X = floor(x), Y = floor(y);
  for (int d = 1; d <= n; d++) {
    uint32_t cc = d > n * 0.6 ? tip : c;
    for (int j = 0; j < 4; j++) pnt_px(p, X + CROSS[j][0] * d, Y + CROSS[j][1] * d, cc);
  }
  if (n >= 3) for (int j = 0; j < 4; j++) pnt_px(p, X + DIAG[j][0], Y + DIAG[j][1], c);
  if (n >= 6) for (int j = 0; j < 4; j++) pnt_px(p, X + DIAG[j][0] * 2, Y + DIAG[j][1] * 2, tip);
  pnt_px(p, X, Y, WHITE);
  pnt_glow(p, x, y, 4 + n * 2, c, k);
}

/** An 8-ray flare: long rays on the axes, shorter between, fading out along their length. */
void flare(Painter *p, double x, double y, double L, double k, const uint32_t *R, int n) {
  if (L < 1) return;
  for (int i = 0; i < 8; i++) {
    double an = (i * M_PI) / 4, len = i % 4 == 0 ? L : i % 2 == 0 ? L * 0.6 : L * 0.3, ca = cos(an), sa = sin(an);
    for (double d = 0; d <= len; d += 0.5) {
      double u = d / len;
      pnt_dot(p, x + ca * d, y + sa * d, u < 0.35 ? WHITE : u < 0.7 ? R[n - 2] : R[n - 3], u < 0.6 ? 1 : k * 1.5 * (1 - u) + 0.2);
    }
  }
}

/** A ring on a tilted plane (sy squashes it), thickness th inward, alpha k, colored by depth through the band. */
void band(Painter *p, double cx, double cy, double r, double sy, double th, double k, const uint32_t *R, int n, bool farHalfOnly) {
  if (r <= 0 || k <= 0) return;
  for (int j = 0, m = (int)ceil(r * TAU * 1.2); j < m; j++) {
    double ang = ((double)j / m) * TAU, ca = cos(ang), sa = sin(ang);
    if (farHalfOnly && !(sin(ang) < 0)) continue;
    for (double o = th; o >= 0; o -= 0.5) {
      double u = o / th;
      uint32_t c = u < 0.15 ? R[n - 1] : u < 0.4 ? R[n - 2] : u < 0.7 ? R[n - 3] : R[n - 4];
      pnt_dot(p, cx + ca * (r - o), cy + sa * (r - o) * sy, c, k * (u < 0.4 ? 1.2 : 1.15 - u));
    }
  }
}
