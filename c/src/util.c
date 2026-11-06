// Shared helpers: seeded randomness, noise, ordered dithering, color ramps, pixel buffers (util.js).
#include "game.h"
#include <stdlib.h>
#include <string.h>
#include <stdio.h>

// JS bit ops work on 32-bit integers: ToInt32 of an exact integer is its value mod 2^32.
static inline uint32_t toU32(double v) { return (uint32_t)(int64_t)v; }

double hash2(double x, double y, double s) {
  int64_t a = (int64_t)x * 374761393LL + (int64_t)y * 668265263LL + (int64_t)s * 2147483647LL;
  uint32_t h = (uint32_t)a;
  h = (h ^ (h >> 13)) * 1274126177u;
  return (double)(h ^ (h >> 16)) / 4294967296.0;
}

void rng_seed(Rng *r, double seed) { uint32_t s = toU32(seed); r->s = s ? s : 1; }
double rng_next(Rng *r) {
  uint32_t t = (r->s += 0x6d2b79f5u);
  t = (t ^ (t >> 15)) * (t | 1u);
  t ^= t + (t ^ (t >> 7)) * (t | 61u);
  return (double)(t ^ (t >> 14)) / 4294967296.0;
}
double rng_range(Rng *r, double a, double b) { return a + (b - a) * rng_next(r); }
int rng_int(Rng *r, int a, int b) { return (int)floor(rng_range(r, a, b + 1)); }
bool rng_chance(Rng *r, double p) { return rng_next(r) < p; }

static double smooth3(double t) { return t * t * (3 - 2 * t); }
double vnoise(double x, double y, double s) {
  double xi = floor(x), yi = floor(y), xf = x - xi, yf = y - yi;
  double a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  double u = smooth3(xf), v = smooth3(yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
double fbm(double x, double y, double s, int oct) {
  double v = 0, amp = 0.5, f = 1, tot = 0;
  for (int i = 0; i < oct; i++) { v += vnoise(x * f, y * f, s + i * 17) * amp; tot += amp; amp *= 0.5; f *= 2; }
  return v / tot;
}

static const int BAYER[16] = { 0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5 };
double bayer(int x, int y) { return (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16; }

RGB hexc(const char *h) {
  char buf[8];
  if (strlen(h) == 4) { buf[0] = h[1]; buf[1] = h[1]; buf[2] = h[2]; buf[3] = h[2]; buf[4] = h[3]; buf[5] = h[3]; buf[6] = 0; }
  else { memcpy(buf, h + 1, 6); buf[6] = 0; }
  unsigned n = (unsigned)strtoul(buf, NULL, 16);
  RGB c = { (float)((n >> 16) & 255), (float)((n >> 8) & 255), (float)(n & 255) };
  return c;
}
void ramp_hex(RGB *out, int n, const char *const *hs) { for (int i = 0; i < n; i++) out[i] = hexc(hs[i]); }

RGB rampAt(Ramp r, double v, int x, int y) {
  double f = fmax(0, fmin(0.9999, v)) * (r.n - 1);
  int i = (int)floor(f);
  int k = i + (f - i > bayer(x, y) ? 1 : 0);
  if (k > r.n - 1) k = r.n - 1;
  return r.c[k];
}

double segDist(double px, double py, double ax, double ay, double bx, double by) {
  double dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
  double t = l ? clamp01(((px - ax) * dx + (py - ay) * dy) / l) : 0;
  return hypot(px - ax - dx * t, py - ay - dy * t);
}

uint8_t u8c(double v) {
  if (!(v > 0)) return 0;
  if (v >= 255) return 255;
  double f = floor(v), d = v - f;
  if (d < 0.5) return (uint8_t)f;
  if (d > 0.5) return (uint8_t)(f + 1);
  return (uint8_t)(((int)f & 1) ? f + 1 : f);
}

// ---- Math.random and dice
static uint64_t rs = 0x9E3779B97F4A7C15ull;
void mrand_seed(uint64_t s) { rs = s ? s : 0x9E3779B97F4A7C15ull; }
double mrand(void) {
  rs ^= rs << 13; rs ^= rs >> 7; rs ^= rs << 17;
  return (double)(rs >> 11) / 9007199254740992.0;
}
int rollDie(int n) { return 1 + (int)floor(mrand() * n); }
Roll roll(const char *expr) {
  // "2d6+3" -> { total, rolls }
  Roll r = { 0 };
  int n = 0, d = 0, m = 0;
  char sign = 0;
  if (sscanf(expr, "%dd%d%c%d", &n, &d, &sign, &m) < 2) return r;
  if (sign == '-') m = -m; else if (sign != '+') m = 0;
  for (int i = 0; i < n && i < 16; i++) { r.rolls[r.nrolls++] = rollDie(d); r.total += r.rolls[i]; }
  r.total += m;
  return r;
}

// ---- images
Img img_new(int w, int h) { Img im = { w, h, calloc((size_t)w * h, 4) }; return im; }
void img_free(Img *im) { free(im->px); im->px = NULL; im->w = im->h = 0; }
Img img_clone(const Img *src) { Img im = img_new(src->w, src->h); memcpy(im.px, src->px, (size_t)src->w * src->h * 4); return im; }

// ---- PixBuf
PixBuf pb_new(int w, int h) { PixBuf pb = { w, h, calloc((size_t)w * h, 4) }; return pb; }
void pb_free(PixBuf *pb) { free(pb->d); pb->d = NULL; }
void pb_seta(PixBuf *pb, double fx, double fy, RGB c, double a) {
  int x = (int)fx, y = (int)fy; /* x |= 0 truncates toward zero */
  if (fx != fx || fy != fy) return;
  if (x < 0 || y < 0 || x >= pb->w || y >= pb->h) return;
  uint8_t *d = pb->d + ((size_t)y * pb->w + x) * 4;
  if (a >= 255) { d[0] = u8c(c.r); d[1] = u8c(c.g); d[2] = u8c(c.b); d[3] = 255; return; }
  double f = a / 255, g = d[3] / 255.0, na = f + g * (1 - f);
  if (na <= 0) return;
  double cc[3] = { c.r, c.g, c.b };
  for (int k = 0; k < 3; k++) d[k] = u8c((cc[k] * f + d[k] * g * (1 - f)) / na);
  d[3] = u8c(na * 255);
}
void pb_set(PixBuf *pb, double x, double y, RGB c) { pb_seta(pb, x, y, c, 255); }
bool pb_get(const PixBuf *pb, int x, int y, uint8_t out[4]) {
  if (x < 0 || y < 0 || x >= pb->w || y >= pb->h) return false;
  const uint8_t *d = pb->d + ((size_t)y * pb->w + x) * 4;
  if (!d[3]) return false;
  memcpy(out, d, 4);
  return true;
}
int pb_alpha(const PixBuf *pb, int x, int y) { return x < 0 || y < 0 || x >= pb->w || y >= pb->h ? 0 : pb->d[((size_t)y * pb->w + x) * 4 + 3]; }
void pb_rect(PixBuf *pb, int x, int y, int w, int h, RGB c) { for (int j = 0; j < h; j++) for (int i = 0; i < w; i++) pb_set(pb, x + i, y + j, c); }
/** Dark outline around everything opaque (4-neighbour). */
void pb_outline(PixBuf *pb, RGB c) {
  int n = 0, *add = malloc(sizeof(int) * 2 * pb->w * pb->h);
  for (int y = 0; y < pb->h; y++)
    for (int x = 0; x < pb->w; x++)
      if (!pb_alpha(pb, x, y) && (pb_alpha(pb, x - 1, y) > 128 || pb_alpha(pb, x + 1, y) > 128 || pb_alpha(pb, x, y - 1) > 128 || pb_alpha(pb, x, y + 1) > 128)) { add[n++] = x; add[n++] = y; }
  for (int i = 0; i < n; i += 2) pb_set(pb, add[i], add[i + 1], c);
  free(add);
}
Img pb_img(const PixBuf *pb) { Img im = img_new(pb->w, pb->h); memcpy(im.px, pb->d, (size_t)pb->w * pb->h * 4); return im; }
