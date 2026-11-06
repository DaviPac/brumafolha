// The handful of 2D canvas operations the game draws with (fillRect, drawImage, globalAlpha, "lighter"),
// on straight-alpha RGBA images. The view is opaque, so source-over is a plain mix.
#include "game.h"

static inline void blend_px(uint8_t *d, int r, int g, int b, int a) {
  if (a >= 255) { d[0] = (uint8_t)r; d[1] = (uint8_t)g; d[2] = (uint8_t)b; d[3] = 255; return; }
  if (a <= 0) return;
  int ia = 255 - a;
  d[0] = (uint8_t)((r * a + d[0] * ia + 127) / 255);
  d[1] = (uint8_t)((g * a + d[1] * ia + 127) / 255);
  d[2] = (uint8_t)((b * a + d[2] * ia + 127) / 255);
  d[3] = (uint8_t)(a + (d[3] * ia + 127) / 255);
}
static inline void add_px(uint8_t *d, int r, int g, int b, int a) {
  int v;
  v = d[0] + (r * a + 127) / 255; d[0] = (uint8_t)(v > 255 ? 255 : v);
  v = d[1] + (g * a + 127) / 255; d[1] = (uint8_t)(v > 255 ? 255 : v);
  v = d[2] + (b * a + 127) / 255; d[2] = (uint8_t)(v > 255 ? 255 : v);
}

void cv_fill(Img *dst, int x, int y, int w, int h, RGBA8 c) {
  int x0 = x < 0 ? 0 : x, y0 = y < 0 ? 0 : y, x1 = x + w > dst->w ? dst->w : x + w, y1 = y + h > dst->h ? dst->h : y + h;
  if (!c.a) return;
  for (int j = y0; j < y1; j++) {
    uint8_t *d = dst->px + ((size_t)j * dst->w + x0) * 4;
    for (int i = x0; i < x1; i++, d += 4) blend_px(d, c.r, c.g, c.b, c.a);
  }
}
void cv_fill_add(Img *dst, int x, int y, int w, int h, RGBA8 c) {
  int x0 = x < 0 ? 0 : x, y0 = y < 0 ? 0 : y, x1 = x + w > dst->w ? dst->w : x + w, y1 = y + h > dst->h ? dst->h : y + h;
  for (int j = y0; j < y1; j++) {
    uint8_t *d = dst->px + ((size_t)j * dst->w + x0) * 4;
    for (int i = x0; i < x1; i++, d += 4) add_px(d, c.r, c.g, c.b, c.a);
  }
}

void cv_draw_sub(Img *dst, const Img *src, int sx, int sy, int sw, int sh, int dx, int dy, double alpha) {
  int ga = (int)(alpha * 256 + 0.5);
  if (ga <= 0) return;
  // clip to both images
  int j0 = 0, j1 = sh, i0 = 0, i1 = sw;
  if (-dy > j0) j0 = -dy; if (-sy > j0) j0 = -sy;
  if (dst->h - dy < j1) j1 = dst->h - dy; if (src->h - sy < j1) j1 = src->h - sy;
  if (-dx > i0) i0 = -dx; if (-sx > i0) i0 = -sx;
  if (dst->w - dx < i1) i1 = dst->w - dx; if (src->w - sx < i1) i1 = src->w - sx;
  for (int j = j0; j < j1; j++) {
    int Y = dy + j, v = sy + j;
    for (int i = i0; i < i1; i++) {
      int X = dx + i, u = sx + i;
      const uint8_t *s = src->px + ((size_t)v * src->w + u) * 4;
      if (!s[3]) continue;
      int a = ga >= 256 ? s[3] : (s[3] * ga) >> 8;
      blend_px(dst->px + ((size_t)Y * dst->w + X) * 4, s[0], s[1], s[2], a);
    }
  }
}
void cv_draw(Img *dst, const Img *src, int dx, int dy, double alpha) { cv_draw_sub(dst, src, 0, 0, src->w, src->h, dx, dy, alpha); }

/** ctx.scale(-1, 1); drawImage(src, dx, dy): the image mirrored, landing on [-dx - w, -dx). */
void cv_draw_flipx(Img *dst, const Img *src, int dx, int dy, double alpha) {
  int left = -dx - src->w, ga = (int)(alpha * 256 + 0.5);
  for (int j = 0; j < src->h; j++) {
    int Y = dy + j;
    if (Y < 0 || Y >= dst->h) continue;
    for (int i = 0; i < src->w; i++) {
      int X = left + i;
      if (X < 0 || X >= dst->w) continue;
      const uint8_t *s = src->px + ((size_t)j * src->w + (src->w - 1 - i)) * 4;
      if (!s[3]) continue;
      int a = ga >= 256 ? s[3] : (s[3] * ga) >> 8;
      blend_px(dst->px + ((size_t)Y * dst->w + X) * 4, s[0], s[1], s[2], a);
    }
  }
}

/** translate(cx, cy); rotate(PI / 2); drawImage(src, ox, oy) with nearest sampling. */
void cv_draw_rot90(Img *dst, const Img *src, double cx, double cy, double ox, double oy, double alpha) {
  int ga = (int)(alpha * 256 + 0.5);
  // local (u, v) lands on screen (cx - v, cy + u)
  int X0 = (int)floor(cx - (oy + src->h)) - 1, X1 = (int)ceil(cx - oy) + 1;
  int Y0 = (int)floor(cy + ox) - 1, Y1 = (int)ceil(cy + ox + src->w) + 1;
  for (int Y = Y0; Y <= Y1; Y++) {
    if (Y < 0 || Y >= dst->h) continue;
    for (int X = X0; X <= X1; X++) {
      if (X < 0 || X >= dst->w) continue;
      double u = (Y + 0.5) - cy, v = -((X + 0.5) - cx);
      int i = (int)floor(u - ox), j = (int)floor(v - oy);
      if (i < 0 || j < 0 || i >= src->w || j >= src->h) continue;
      const uint8_t *s = src->px + ((size_t)j * src->w + i) * 4;
      if (!s[3]) continue;
      blend_px(dst->px + ((size_t)Y * dst->w + X) * 4, s[0], s[1], s[2], (s[3] * ga) >> 8);
    }
  }
}

void cv_draw_add(Img *dst, const Img *src, int dx, int dy) {
  for (int j = 0; j < src->h; j++) {
    int Y = dy + j;
    if (Y < 0 || Y >= dst->h) continue;
    for (int i = 0; i < src->w; i++) {
      int X = dx + i;
      if (X < 0 || X >= dst->w) continue;
      const uint8_t *s = src->px + ((size_t)j * src->w + i) * 4;
      if (!s[3]) continue;
      add_px(dst->px + ((size_t)Y * dst->w + X) * 4, s[0], s[1], s[2], s[3]);
    }
  }
}
