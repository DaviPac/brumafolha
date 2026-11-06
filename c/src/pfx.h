// pixelfx core, ported from vendor/pixelfx/src/core: frames, the painter, simulated particles and lights.
#ifndef BRUMA_PFX_H
#define BRUMA_PFX_H
#include "game.h"

// ---- colors: 32-bit, laid out like ImageData bytes (R in the low byte)
static inline uint32_t prgb(double r, double g, double b) { return (255u << 24) | (((uint32_t)(int)b & 255) << 16) | (((uint32_t)(int)g & 255) << 8) | ((uint32_t)(int)r & 255); }
static inline int cred(uint32_t c) { return c & 255; }
static inline int cgreen(uint32_t c) { return (c >> 8) & 255; }
static inline int cblue(uint32_t c) { return (c >> 16) & 255; }
uint32_t phex(const char *h);
uint32_t pmix(uint32_t a, uint32_t b, double t);
uint32_t pscale(uint32_t c, double k);
/** Resample a ramp to exactly n steps, keeping its ends. */
void pfit(const uint32_t *r, int len, int n, uint32_t *out);
#define WHITE 0xffffffffu

// ---- math
double pclamp(double x, double a, double b);
static inline double pc01(double x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
double pwrap(double x, double m);
double seg(double t, double t0, double t1);
double psmooth(double e0, double e1, double x);
uint32_t phash(const int64_t *ns, int n);
double prand2(int64_t a, int64_t b);
double prand3(int64_t a, int64_t b, int64_t c);
void prng2(Rng *r, int64_t a, int64_t b);
void prng3(Rng *r, int64_t a, int64_t b, int64_t c);
double pnoise1(double x, double seed);
double rng_sign(Rng *r);
double e_outCubic(double t); double e_inCubic(double t); double e_outExpo(double t);
double e_outBack(double t, double s); double e_inBack(double t, double s);

// ---- frames and the painter
typedef struct { int w, h, ox, oy; uint32_t *color, *light; } Frame;
typedef struct {
  Frame *f; int w, h, ox, oy; uint32_t *C, *L;
  double tx, ty, fx, cs, sn, fade, lightK;
  int layer; /* 0 back, 1 front */
} Painter;
void pnt_reset(Painter *p, Frame *f);
void pnt_place(Painter *p, double x, double y, bool flip, double angle);
static inline double toX(const Painter *p, double x, double y) { return p->tx + x * p->fx * p->cs - y * p->sn; }
static inline double toY(const Painter *p, double x, double y) { return p->ty + x * p->fx * p->sn + y * p->cs; }
static inline double fromX(const Painter *p, double sx, double sy) { double dx = sx - p->tx, dy = sy - p->ty; return (dx * p->cs + dy * p->sn) * p->fx; }
static inline double fromY(const Painter *p, double sx, double sy) { double dx = sx - p->tx, dy = sy - p->ty; return -dx * p->sn + dy * p->cs; }
static inline int cellX(const Painter *p, double x, double y) { return (int)floor(toX(p, floor(x) + 0.5, floor(y) + 0.5)); }
static inline int cellY(const Painter *p, double x, double y) { return (int)floor(toY(p, floor(x) + 0.5, floor(y) + 0.5)); }
void pnt_put(Painter *p, int sx, int sy, uint32_t c, double a);
void pnt_add(Painter *p, int sx, int sy, uint32_t c, double k);
void pnt_blendPx(Painter *p, int sx, int sy, uint32_t c, double a);
void pnt_blend(Painter *p, double x, double y, uint32_t c, double a);
void pnt_disc(Painter *p, double cx, double cy, double r, uint32_t c, double a);
static inline void pnt_px(Painter *p, double x, double y, uint32_t c) { pnt_put(p, cellX(p, x, y), cellY(p, x, y), c, 1); }
static inline void pnt_dot(Painter *p, double x, double y, uint32_t c, double a) { if (a > 0) pnt_put(p, cellX(p, x, y), cellY(p, x, y), c, a); }
static inline void pnt_light(Painter *p, double x, double y, uint32_t c, double k) { pnt_add(p, cellX(p, x, y), cellY(p, x, y), c, k); }
void pnt_line(Painter *p, double x0, double y0, double x1, double y1, uint32_t c, double a);
void pnt_line_fn(Painter *p, double x0, double y0, double x1, double y1, uint32_t (*c)(double u, void *ud), void *ud);
void pnt_circle(Painter *p, double cx, double cy, double r, uint32_t c, double a);
void pnt_ring(Painter *p, double cx, double cy, double r, double w, uint32_t c, double a);
void pnt_glow(Painter *p, double x, double y, double r, uint32_t c, double k);
void pnt_glowLine(Painter *p, double x0, double y0, double x1, double y1, double r, uint32_t c, double k);
void pnt_glowRing(Painter *p, double x, double y, double R, double r, uint32_t c, double k);

/** Visit every screen pixel whose center falls in the local box: the basis of every filled shape. */
typedef struct { Painter *p; int sx, sy, sx0, sx1, sy1; double lx, ly; bool ok; } Each;
void each_init(Each *e, Painter *p, double x0, double y0, double x1, double y1);
static inline bool each_next(Each *e) {
  if (!e->ok) return false;
  if (++e->sx > e->sx1) { e->sx = e->sx0; if (++e->sy > e->sy1) return false; }
  double cx = e->sx + 0.5, cy = e->sy + 0.5;
  e->lx = fromX(e->p, cx, cy); e->ly = fromY(e->p, cx, cy);
  return true;
}
/* shade(): the body sees x, y (local) and may set oc (color), oa (alpha), ol (light color), ok (light amount).
   SRET(v) returns a color like the JS shader's `return v`; SNONE leaves the pixel. */
#define SHADE_BEGIN(P, X0, Y0, X1, Y1) { Painter *_sp = (P); Each _e; each_init(&_e, _sp, X0, Y0, X1, Y1); \
  while (each_next(&_e)) { double x = _e.lx, y = _e.ly; uint32_t oc = 0, ol = 0; double oa = 1, ok = 0; (void)x; (void)y; do {
#define SHADE_END } while (0); if (oc) pnt_put(_sp, _e.sx, _e.sy, oc, oa); if (ok > 0) pnt_add(_sp, _e.sx, _e.sy, ol ? ol : oc, ok); } }
#define SRET(v) { uint32_t _v = (v); if (_v) oc = _v; break; }
#define SNONE break

// ---- simulated particles (sim.js)
enum { PK_SPARK, PK_MOTE, PK_STREAK, PK_FLAKE, PK_VAPOUR, PK_DUST, PK_STAR, PK_EMBER, PK_SMOKE, PK_FIRE, PK_BRAND, PK_GRIT };
enum { PF_SMOKES = 1, PF_BIG = 2, PF_BACK = 4 };
typedef struct { int k; double x, y, vx, vy, life, max; uint32_t col; double size, seed, delay; int flag; } Particle;
typedef struct { Rng *R; Particle *list; int n, cap; double t; double ground; uint32_t sparks[4]; int nsparks; } Particles;
void ps_init(Particles *ps, Rng *R, const uint32_t *sparks, int nsparks);
void ps_free(Particles *ps);
void ps_spawn(Particles *ps, int k, double x, double y, double vx, double vy, double life, uint32_t col, double size, double delay);
void ps_update(Particles *ps, double dt);
void ps_draw(Particles *ps, Painter *p, int layer); /* -1 all, 0 back, 1 front */

typedef struct { double x, y, r; uint32_t color; double k, life, max; } Light;
typedef struct { Light list[16]; int n; } Lights;
void lights_add(Lights *L, double x, double y, double r, uint32_t c, double k, double life);
void lights_update(Lights *L, double dt);
void lights_draw(Lights *L, Painter *p);

typedef struct { double x, y, vx, vy, a, va, s; uint32_t c; double g, drag, bounce, life, max; bool rest; } Bit;
typedef struct { Bit list[16]; int n; } Bits;
void bits_add(Bits *B, Bit b);
void bits_update(Bits *B, double dt);
void bits_draw(Bits *B, Painter *p);

void sparkle(Painter *p, double x, double y, double arm, uint32_t c, uint32_t tip, double k);
void flare(Painter *p, double x, double y, double L, double k, const uint32_t *ramp, int n);
void band(Painter *p, double cx, double cy, double r, double sy, double th, double k, const uint32_t *ramp, int n, bool farHalfOnly);

#endif
