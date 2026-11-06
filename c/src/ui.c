// Party frames, hotbar, quest tracker, banner, log, floating numbers, toasts, tooltip, initiative strip, the
// dialogue box and the d20, and the title, pause and game-over screens (ui.js + style.css + index.html).
// Sizes are the stylesheet's CSS pixels.
#include "ui.h"
#include "text.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdarg.h>

static SDL_Renderer *R;
static int W, H;
static double now_; // UI clock (real time)
int ui_title = TITLE_LOADING;
bool ui_corner, ui_pause, ui_gameover;
static bool muted_;
static int mx = -1000, my = -1000;
static bool hand;

// palette (style.css :root)
#define C_PANEL col(16, 14, 22, 209)
#define C_EDGE colhex("#6b5a3a", 255)
#define C_GOLD colhex("#e8c06a", 255)
#define C_GOLDDIM colhex("#9a7a3a", 255)
#define C_TEAL colhex("#5fd0c8", 255)
#define C_TEXT colhex("#efe6d2", 255)
#define C_MUTED colhex("#a89c86", 255)
#define C_HP colhex("#d8462e", 255)
#define C_HPHI colhex("#ff8a4a", 255)
#define C_GOOD colhex("#8fd65a", 255)
#define C_BAD colhex("#ff6a5a", 255)
#define C_BLACK col(0, 0, 0, 255)

// ---------------------------------------------------------------- drawing helpers, with CSS filter/opacity
static double gA = 1, gGray = 0; // opacity; grayscale(1) brightness(gGray) when > 0
static Col F(Col c) {
  if (gGray > 0) {
    double l = (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) * gGray;
    if (l > 255) l = 255;
    c.r = c.g = c.b = (Uint8)l;
  }
  c.a = (Uint8)(c.a * gA);
  return c;
}
static SDL_Color sc(Col c) { c = F(c); SDL_Color s = { c.r, c.g, c.b, c.a }; return s; }
static void fill(double x, double y, double w, double h, Col c) {
  Col f = F(c);
  SDL_SetRenderDrawColor(R, f.r, f.g, f.b, f.a);
  SDL_FRect r = { (float)x, (float)y, (float)w, (float)h };
  SDL_RenderFillRectF(R, &r);
}
static void stroke(double x, double y, double w, double h, Col c, double t) {
  fill(x, y, w, t, c); fill(x, y + h - t, w, t, c); fill(x, y + t, t, h - 2 * t, c); fill(x + w - t, y + t, t, h - 2 * t, c);
}
static void vtx(SDL_Vertex *v, double x, double y, Col c) { v->position.x = (float)x; v->position.y = (float)y; v->color = sc(c); v->tex_coord.x = v->tex_coord.y = 0; }
/** A convex polygon, each corner with its own color (so gradients come for free). */
static void polyC(const double *xy, const Col *cs, int n) {
  SDL_Vertex v[16]; int idx[48], ni = 0;
  for (int i = 0; i < n; i++) vtx(&v[i], xy[i * 2], xy[i * 2 + 1], cs[i]);
  for (int i = 1; i + 1 < n; i++) { idx[ni++] = 0; idx[ni++] = i; idx[ni++] = i + 1; }
  SDL_RenderGeometry(R, NULL, v, n, idx, ni);
}
static void poly(const double *xy, int n, Col c) { Col cs[16]; for (int i = 0; i < n; i++) cs[i] = c; polyC(xy, cs, n); }
static void gradV(double x, double y, double w, double h, Col a, Col b) {
  double xy[8] = { x, y, x + w, y, x + w, y + h, x, y + h }; Col cs[4] = { a, a, b, b }; polyC(xy, cs, 4);
}
static Col lerpc(Col a, Col b, double t) {
  return col((int)(a.r + (b.r - a.r) * t), (int)(a.g + (b.g - a.g) * t), (int)(a.b + (b.b - a.b) * t), (int)(a.a + (b.a - a.a) * t));
}
/** radial-gradient(circle at cx cy, a, b) over a rect, farthest-corner sized. */
static void radial(double x, double y, double w, double h, double cx, double cy, Col a, Col b) {
  double r = 0;
  double cxs[4] = { x, x + w, x, x + w }, cys[4] = { y, y, y + h, y + h };
  for (int i = 0; i < 4; i++) r = fmax(r, hypot(cxs[i] - cx, cys[i] - cy));
  SDL_Rect clip = { (int)x, (int)y, (int)ceil(w), (int)ceil(h) };
  SDL_RenderSetClipRect(R, &clip);
  enum { SEG = 48, RINGS = 6 };
  SDL_Vertex v[SEG * RINGS + 1]; int idx[SEG * RINGS * 6], ni = 0;
  vtx(&v[0], cx, cy, a);
  for (int k = 1; k <= RINGS; k++)
    for (int i = 0; i < SEG; i++) {
      double ang = i * TAU / SEG, rr = r * k / RINGS;
      vtx(&v[(k - 1) * SEG + i + 1], cx + cos(ang) * rr, cy + sin(ang) * rr, lerpc(a, b, (double)k / RINGS));
    }
  for (int i = 0; i < SEG; i++) { idx[ni++] = 0; idx[ni++] = 1 + i; idx[ni++] = 1 + (i + 1) % SEG; }
  for (int k = 1; k < RINGS; k++)
    for (int i = 0; i < SEG; i++) {
      int a0 = (k - 1) * SEG + i + 1, a1 = (k - 1) * SEG + (i + 1) % SEG + 1, b0 = k * SEG + i + 1, b1 = k * SEG + (i + 1) % SEG + 1;
      idx[ni++] = a0; idx[ni++] = b0; idx[ni++] = b1; idx[ni++] = a0; idx[ni++] = b1; idx[ni++] = a1;
    }
  SDL_RenderGeometry(R, NULL, v, SEG * RINGS + 1, idx, ni);
  SDL_RenderSetClipRect(R, NULL);
}
/** A square rotated 45 degrees (CSS transform: rotate(45deg)), side s, with a border inside the box. */
static void diamondG(double cx, double cy, double s, Col top, Col bot, Col border, double bw) {
  double h = s / sqrt(2), hi = (s - 2 * bw) / sqrt(2);
  if (bw > 0) { // the border: four bands between the outer and inner outlines
    double O[4][2] = { { cx, cy - h }, { cx + h, cy }, { cx, cy + h }, { cx - h, cy } }, I[4][2] = { { cx, cy - hi }, { cx + hi, cy }, { cx, cy + hi }, { cx - hi, cy } };
    for (int i = 0; i < 4; i++) { int j = (i + 1) % 4; double xy[8] = { O[i][0], O[i][1], O[j][0], O[j][1], I[j][0], I[j][1], I[i][0], I[i][1] }; poly(xy, 4, border); }
  }
  if (hi > 0) { double xy[8] = { cx, cy - hi, cx + hi, cy, cx, cy + hi, cx - hi, cy }; Col m = lerpc(top, bot, 0.5); Col cs[4] = { top, m, bot, m }; polyC(xy, cs, 4); }
}
static void diamond(double cx, double cy, double s, Col fillc, Col border, double bw) { diamondG(cx, cy, s, fillc, fillc, border, bw); }
static void disc(double cx, double cy, double r, Col c) {
  double xy[32]; for (int i = 0; i < 16; i++) { xy[i * 2] = cx + cos(i * TAU / 16) * r; xy[i * 2 + 1] = cy + sin(i * TAU / 16) * r; }
  poly(xy, 16, c);
}
static void pill(double x, double y, double w, double h, Col c) { // a rect with fully rounded ends
  double r = h / 2;
  if (w < h) { disc(x + w / 2, y + r, fmin(r, w / 2), c); return; }
  fill(x + r, y, w - 2 * r, h, c);
  double xy[32];
  for (int side = 0; side < 2; side++) {
    double cx = side ? x + w - r : x + r;
    for (int i = 0; i < 16; i++) { double a = M_PI / 2 + (side ? M_PI : 0) + i * M_PI / 15; xy[i * 2] = cx + cos(a) * r; xy[i * 2 + 1] = y + r + sin(a) * r; }
    poly(xy, 16, c);
  }
}
static void thickLine(double x0, double y0, double x1, double y1, double w, Col c) {
  double dx = x1 - x0, dy = y1 - y0, l = hypot(dx, dy); if (!l) return;
  double nx = -dy / l * w / 2, ny = dx / l * w / 2;
  double xy[8] = { x0 + nx, y0 + ny, x1 + nx, y1 + ny, x1 - nx, y1 - ny, x0 - nx, y0 - ny };
  poly(xy, 4, c);
}

// ---- text with CSS shadows
static void tshadowed(FontId f, int size, double x, double y, Col c, const char *s, double ls, const Shadow *sh, int nsh) {
  for (int i = 0; i < nsh; i++) { Col k = sh[i].c; k.a = (Uint8)(k.a * c.a / 255); text_shadow(f, size, x + sh[i].dx, y + sh[i].dy, F(k), s, ls, sh[i].blur); }
  text_draw(f, size, x, y, F(c), s, ls);
}
static void scShadowed(FontId f, int size, double x, double y, Col c, const char *s, double ls, const Shadow *sh, int nsh) {
  for (int i = 0; i < nsh; i++) { Col k = sh[i].c; k.a = (Uint8)(k.a * c.a / 255); text_draw_sc(f, size, x + sh[i].dx, y + sh[i].dy, F(k), s, ls, sh[i].blur); }
  text_draw_sc(f, size, x, y, F(c), s, ls, 0);
}
static Style ST(FontId f, int size, Col c) { Style s; memset(&s, 0, sizeof s); s.f = f; s.size = size; s.c = c; return s; }
static void richDraw(const Layout *L, double x, double y, const Shadow *sh, int nsh, int align) {
  // apply opacity/filters by tinting a copy
  Layout *C = malloc(sizeof *C); memcpy(C, L, sizeof *C);
  for (int i = 0; i < C->n; i++) C->runs[i].st.c = F(C->runs[i].st.c);
  Shadow s2[4]; for (int i = 0; i < nsh && i < 4; i++) { s2[i] = sh[i]; s2[i].c = F(sh[i].c); }
  rich_draw(C, x, y, 1, s2, nsh, align);
  free(C);
}

// ---- textures for images
typedef struct { const void *key; int variant; SDL_Texture *t; } TexEntry;
static TexEntry texs[64]; static int ntex;
static SDL_Texture *imgTex(const Img *im, int variant /* 0 plain, 1 grayscale(1) brightness(.6) */) {
  for (int i = 0; i < ntex; i++) if (texs[i].key == im && texs[i].variant == variant) return texs[i].t;
  SDL_Texture *t = SDL_CreateTexture(R, SDL_PIXELFORMAT_RGBA32, SDL_TEXTUREACCESS_STATIC, im->w, im->h);
  uint8_t *px = malloc((size_t)im->w * im->h * 4); memcpy(px, im->px, (size_t)im->w * im->h * 4);
  if (variant) for (int i = 0; i < im->w * im->h; i++) { double l = (0.2126 * px[i * 4] + 0.7152 * px[i * 4 + 1] + 0.0722 * px[i * 4 + 2]) * 0.6; px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = (uint8_t)l; }
  SDL_UpdateTexture(t, NULL, px, im->w * 4);
  free(px);
  SDL_SetTextureBlendMode(t, SDL_BLENDMODE_BLEND);
  SDL_SetTextureScaleMode(t, SDL_ScaleModeNearest);
  if (ntex < 64) texs[ntex++] = (TexEntry){ im, variant, t };
  return t;
}
static void drawTex(SDL_Texture *t, const SDL_Rect *src, double x, double y, double w, double h) {
  SDL_FRect d = { (float)x, (float)y, (float)w, (float)h };
  SDL_SetTextureAlphaMod(t, (Uint8)(255 * gA));
  SDL_RenderCopyF(R, t, src, &d);
}

// ---- emoji icons (baked from Noto Color Emoji into assets/icons)
static const char *ICON_NAMES[] = { "potion", "swap", "attack", "cleave", "wind", "fire", "sparkles", "heart", "coin", "sound", "muted" };
#define NICONS 11
static SDL_Texture *icons[NICONS][2];
static SDL_Texture *icon(const char *name, bool gray) {
  for (int i = 0; i < NICONS; i++) if (!strcmp(name, ICON_NAMES[i])) return icons[i][gray ? 1 : 0];
  return NULL;
}
static void loadIcons(const char *dir) {
  for (int i = 0; i < NICONS; i++) {
    char p[1100]; snprintf(p, sizeof p, "%s/icons/%s.bmp", dir, ICON_NAMES[i]);
    SDL_Surface *s = SDL_LoadBMP(p);
    if (!s) { fprintf(stderr, "icon %s: %s\n", p, SDL_GetError()); continue; }
    SDL_Surface *s2 = SDL_ConvertSurfaceFormat(s, SDL_PIXELFORMAT_ARGB8888, 0);
    SDL_FreeSurface(s);
    for (int g = 0; g < 2; g++) {
      if (g) { // grayscale(1) brightness(.55), as .slot.off
        SDL_LockSurface(s2);
        for (int y = 0; y < s2->h; y++) for (int x = 0; x < s2->w; x++) {
          Uint32 *px = (Uint32 *)((Uint8 *)s2->pixels + y * s2->pitch) + x;
          int r = (*px >> 16) & 255, gg = (*px >> 8) & 255, b = *px & 255;
          int l = (int)((0.2126 * r + 0.7152 * gg + 0.0722 * b) * 0.55);
          *px = (*px & 0xff000000u) | ((Uint32)l << 16) | ((Uint32)l << 8) | (Uint32)l;
        }
        SDL_UnlockSurface(s2);
      }
      icons[i][g] = SDL_CreateTextureFromSurface(R, s2);
      SDL_SetTextureBlendMode(icons[i][g], SDL_BLENDMODE_BLEND);
      SDL_SetTextureScaleMode(icons[i][g], SDL_ScaleModeLinear);
    }
    SDL_FreeSurface(s2);
  }
}
/** An emoji at a CSS font size: about 1.17 em wide, sitting on the text's line box. */
static void drawIcon(const char *name, bool gray, double x, double y, double size) {
  SDL_Texture *t = icon(name, gray);
  if (!t) return;
  double s = size * 1.18;
  drawTex(t, NULL, x, y, s, s);
}

// ---------------------------------------------------------------- CSS timing
static double bezier(double x1, double y1, double x2, double y2, double x) {
  if (x <= 0) return 0; if (x >= 1) return 1;
  double lo = 0, hi = 1, t = x;
  for (int i = 0; i < 30; i++) {
    t = (lo + hi) / 2;
    double bx = 3 * (1 - t) * (1 - t) * t * x1 + 3 * (1 - t) * t * t * x2 + t * t * t;
    if (bx < x) lo = t; else hi = t;
  }
  return 3 * (1 - t) * (1 - t) * t * y1 + 3 * (1 - t) * t * t * y2 + t * t * t;
}
static double ease(double x) { return bezier(0.25, 0.1, 0.25, 1, x); }
static double easeOut(double x) { return bezier(0, 0, 0.58, 1, x); }
typedef struct { double from, to, t0, dur; } Trans;
static double trans_val(const Trans *t) { double k = t->dur > 0 ? (now_ - t->t0) / t->dur : 1; return k >= 1 ? t->to : t->from + (t->to - t->from) * ease(k); }
static void trans_set(Trans *t, double to, double dur) { if (t->to == to) return; t->from = trans_val(t); t->to = to; t->t0 = now_; t->dur = dur; }

/** HTML collapses runs of spaces into one. */
static void collapse(char *s) { char *w = s; for (char *r = s; *r; r++) { if (*r == ' ' && w > s && w[-1] == ' ') continue; *w++ = *r; } *w = 0; }

// ---------------------------------------------------------------- floaters
typedef struct { double x, y, t0; char text[32]; int cls; bool on; } Floater;
static Floater fls[64];
void floater(double x, double y, const char *text, int cls) {
  double sx = (x - G.cam.x) * G.scale, sy = (y - G.cam.y) * G.scale;
  for (int i = 0; i < 64; i++) if (!fls[i].on) {
    fls[i].on = true; fls[i].x = sx + (mrand() * 16 - 8); fls[i].y = sy; fls[i].t0 = now_; fls[i].cls = cls;
    snprintf(fls[i].text, sizeof fls[i].text, "%s", text);
    return;
  }
}
static void drawFloaters(void) {
  for (int i = 0; i < 64; i++) {
    Floater *f = &fls[i];
    if (!f->on) continue;
    double k = (now_ - f->t0) / 1.3;
    if (now_ - f->t0 >= 1.4) { f->on = false; continue; }
    if (k > 1) k = 1;
    // @keyframes rise, ease-out between keyframes: opacity 0 / 1 (12%) / 1 (70%) / 0; margin-top 6 / -6 (12%) / -46
    double op = k < 0.12 ? easeOut(k / 0.12) : k < 0.7 ? 1 : 1 - easeOut((k - 0.7) / 0.3);
    double mt = k < 0.12 ? 6 + (-12) * easeOut(k / 0.12) : -6 + (-40) * easeOut((k - 0.12) / 0.88);
    if (k >= 1) op = 1; // animation-fill-mode forwards would hold 0; the element is gone at 1.4 s anyway
    if (k >= 1) op = 0;
    int size = 20; Col c = col(255, 255, 255, 255);
    switch (f->cls) {
      case FL_CRIT: size = 28; c = colhex("#ffd84a", 255); break;
      case FL_MISS: size = 16; c = colhex("#c8c8c8", 255); break;
      case FL_HEAL: c = colhex("#8fff7a", 255); break;
      case FL_INFO: size = 15; c = C_TEAL; break;
    }
    c.a = (Uint8)(255 * op);
    double w = text_width(FONT_PIXB, size, f->text, 0), h = text_lineh(FONT_PIXB, size);
    double x = f->x - w / 2, y = f->y + mt - h; // translate(-50%, -100%)
    Shadow sh[2] = { { 0, 2, 0, C_BLACK }, { 0, 0, 3, C_BLACK } };
    tshadowed(FONT_PIXB, size, x, y, c, f->text, 0, sh, 2);
  }
}

// ---------------------------------------------------------------- log, toast, banner, tooltip
typedef struct { char html[400]; int cls; } LogLine;
static LogLine logs[9]; static int nlogs;
void ui_log(int cls, const char *fmt, ...) {
  va_list ap; va_start(ap, fmt);
  if (nlogs == 9) { memmove(logs, logs + 1, sizeof(LogLine) * 8); nlogs--; }
  vsnprintf(logs[nlogs].html, sizeof logs[nlogs].html, fmt, ap);
  logs[nlogs].cls = cls; nlogs++;
  va_end(ap);
}
static char toastText[200]; static Trans toastOp; static double toastHideAt = -1;
void toast(const char *text, double secs) {
  snprintf(toastText, sizeof toastText, "%s", text); collapse(toastText);
  trans_set(&toastOp, 1, 0.4);
  toastHideAt = now_ + secs;
}
static char bannerText[100]; static Trans bannerOp; static double bannerHideAt = -1;
void banner(const char *text) {
  snprintf(bannerText, sizeof bannerText, "%s", text);
  trans_set(&bannerOp, 1, 0.9);
  bannerHideAt = now_ + 3.2;
}
static char tipHtml[600]; static bool tipOn; static double tipX, tipY;
void tooltip(const char *html) {
  if (!html) { tipOn = false; return; }
  snprintf(tipHtml, sizeof tipHtml, "%s", html);
  tipOn = true;
  tipX = G.mouse.x + 18; tipY = G.mouse.y + 14;
}
static void tooltipAtMouse(const char *html) { tooltip(html); tipX = mx + 18; tipY = my + 14; }

static void drawLog(void) {
  // right 18, bottom 96, width 300, max-height 170, anchored to the bottom
  double x = W - 18 - 300, bottom = H - 96, y = bottom;
  SDL_Rect clip = { (int)x - 8, (int)(bottom - 170), 316, 170 + 4 };
  SDL_RenderSetClipRect(R, &clip);
  for (int i = nlogs - 1; i >= 0; i--) {
    Col c = colhex("#ddd2bc", 255);
    switch (logs[i].cls) {
      case LOG_HIT: c = colhex("#ffb070", 255); break; case LOG_MISS: c = colhex("#9a9a9a", 255); break;
      case LOG_CRIT: c = colhex("#ffd84a", 255); break; case LOG_HEAL: c = C_GOOD; break; case LOG_SYS: c = C_TEAL; break;
    }
    Layout L; rich_layout(&L, logs[i].html, ST(FONT_PIX, 13, c), 300, 0);
    y -= L.h;
    Shadow sh[2] = { { 0, 1, 0, C_BLACK }, { 0, 0, 4, C_BLACK } };
    richDraw(&L, x, y, sh, 2, 0);
    y -= 2;
    if (y < bottom - 170) break;
  }
  SDL_RenderSetClipRect(R, NULL);
}
static void drawToast(void) {
  double op = trans_val(&toastOp);
  if (op <= 0.001 || !toastText[0]) return;
  double w = text_width(FONT_CIN5, 22, toastText, 0);
  Shadow sh[2] = { { 0, 2, 0, C_BLACK }, { 0, 0, 12, C_BLACK } };
  Col c = C_GOLD; c.a = (Uint8)(255 * op);
  tshadowed(FONT_CIN5, 22, (W - w) / 2, H * 0.3, c, toastText, 0, sh, 2);
}
static double bannerSize(void) { return fmin(46, fmax(26, W * 0.034)); }
static void drawBanner(void) {
  double op = trans_val(&bannerOp);
  if (op <= 0.001 || !bannerText[0]) return;
  double bw = fmin(720, W * 0.9), bx = (W - bw) / 2, by = H * 0.09;
  int fs = (int)JSROUND(bannerSize());
  double lh = text_lineh(FONT_CIN5, fs), bh = 10 + 1 + 4 + lh + 4 + 1 + 10;
  double saveA = gA; gA = op;
  // linear-gradient(90deg, transparent, rgba(10,12,18,.75) 20% .. 80%, transparent)
  Col dark = col(10, 12, 18, 191), clear = col(10, 12, 18, 0);
  double xs[4] = { bx, bx + bw * 0.2, bx + bw * 0.8, bx + bw };
  Col cs[4] = { clear, dark, dark, clear };
  for (int i = 0; i < 3; i++) { double xy[8] = { xs[i], by, xs[i + 1], by, xs[i + 1], by + bh, xs[i], by + bh }; Col c4[4] = { cs[i], cs[i + 1], cs[i + 1], cs[i] }; polyC(xy, c4, 4); }
  // the ornaments: a teal hairline fading out at both ends, a diamond at its middle
  for (int k = 0; k < 2; k++) {
    double oy = k == 0 ? by + 10 : by + bh - 11, ox0 = bx + bw * 0.12, ox1 = bx + bw * 0.88, om = (ox0 + ox1) / 2;
    Col t = C_TEAL, t0 = C_TEAL; t0.a = 0;
    { double xy[8] = { ox0, oy, om, oy, om, oy + 1, ox0, oy + 1 }; Col c4[4] = { t0, t, t, t0 }; polyC(xy, c4, 4); }
    { double xy[8] = { om, oy, ox1, oy, ox1, oy + 1, om, oy + 1 }; Col c4[4] = { t, t0, t0, t }; polyC(xy, c4, 4); }
    diamond(om, oy, 8, colhex("#0e1418", 255), C_TEAL, 1);
  }
  double ls = fs * 0.06, tw = text_width_sc(FONT_CIN5, fs, bannerText, ls);
  Shadow sh[1] = { { 0, 2, 0, C_BLACK } };
  scShadowed(FONT_CIN5, fs, bx + (bw - tw) / 2, by + 15, colhex("#f4ecdc", 255), bannerText, ls, sh, 1);
  gA = saveA;
}
static void drawTooltip(void) {
  if (!tipOn) return;
  Style s = ST(FONT_PIX, 13, C_TEXT); s.bold = C_GOLD;
  Layout L; rich_layout(&L, tipHtml, s, 260 - 20 - 2, 0);
  double w = L.w + 20 + 2, h = L.h + 12 + 2;
  fill(tipX, tipY, w, h, C_PANEL);
  stroke(tipX, tipY, w, h, C_GOLDDIM, 1);
  richDraw(&L, tipX + 11, tipY + 7, NULL, 0, 0);
}

// ---------------------------------------------------------------- party frames
typedef struct { Trans hp, xp; } CardAnim;
static CardAnim cardAnim[2];
static bool partyBuilt;
static struct { int hp, maxHp, xp, nextXp, level, ac; bool active, down; } cards[2];
void buildParty(void) { partyBuilt = true; for (int i = 0; i < 2; i++) { cardAnim[i].hp = (Trans){ 100, 100, 0, 0 }; cardAnim[i].xp = (Trans){ 0, 0, 0, 0 }; } updateParty(); }
void updateParty(void) {
  if (!partyBuilt) return;
  for (int i = 0; i < G.nparty; i++) {
    Unit *p = G.party[i];
    cards[i].hp = p->hp; cards[i].maxHp = p->maxHp; cards[i].xp = p->xp; cards[i].nextXp = p->nextXp; cards[i].level = p->level; cards[i].ac = p->ac;
    cards[i].active = G.mode == MODE_COMBAT ? (G.combat && G.combat->active == p) : i == G.leader;
    cards[i].down = p->hp <= 0;
    trans_set(&cardAnim[i].hp, 100.0 * (p->hp > 0 ? p->hp : 0) / p->maxHp, 0.3);
    trans_set(&cardAnim[i].xp, fmin(100, 100.0 * p->xp / p->nextXp), 0.3);
  }
}
static double cardH(void) {
  double info = text_lineh(FONT_PIX, 14) + 4 + 9 + 2 + text_lineh(FONT_PIX, 11) + 4 + 5;
  return fmax(50, info) + 12 + 2;
}
static void cardRect(int i, double *x, double *y, double *w, double *h) {
  double ch = cardH();
  *w = 290; *h = ch; *x = 16;
  *y = H - 16 - ch * (G.nparty - i) - 8 * (G.nparty - 1 - i);
}
static void slantBar(double x, double y, double w, double h, double pct, Col bg, Col top, Col bot, double slant) {
  // border 1px #000 and clip-path polygon(0 0, 100% 0, slant 100%, 0 100%)
  double bx = slant * w;
  { double xy[8] = { x, y, x + w, y, x + bx, y + h, x, y + h }; poly(xy, 4, C_BLACK); }
  { double xy[8] = { x + 1, y + 1, x + w - 1, y + 1, x + bx - (1 - slant) * 1, y + h - 1, x + 1, y + h - 1 }; poly(xy, 4, bg); }
  double fw = (w - 2) * pct / 100;
  if (fw > 0) {
    // the fill covers the padding box, clipped by the same slant
    double rx0 = x + 1 + fw, ex = x + w - (w - bx) * 0; (void)ex;
    double topR = fmin(rx0, x + w - 1), botR = fmin(rx0, x + bx - (1 - slant));
    double xy[8] = { x + 1, y + 1, topR, y + 1, botR, y + h - 1, x + 1, y + h - 1 };
    Col cs[4] = { top, top, bot, bot };
    polyC(xy, cs, 4);
  }
}
static void drawParty(void) {
  if (!partyBuilt) return;
  for (int i = 0; i < G.nparty; i++) {
    Unit *p = G.party[i];
    double x, y, w, h; cardRect(i, &x, &y, &w, &h);
    gGray = cards[i].down ? 0.6 : 0;
    Col edge = cards[i].active ? C_GOLD : C_EDGE;
    // clip-path polygon(0 0, 100% 0, 96% 100%, 0 100%): the panel under its border, and the slanted side
    // loses its border; .active adds an inset 1px gold ring inside the gold border
    { double xy[8] = { x, y, x + w, y, x + w * 0.96, y + h, x, y + h }; poly(xy, 4, C_PANEL); }
    double bw = cards[i].active ? 2 : 1;
    fill(x, y, w, bw, edge);
    fill(x, y + bw, bw, h - 2 * bw, edge);
    { double s0 = w - w * 0.04 * (h - bw) / h, xy[8] = { x, y + h - bw, x + s0, y + h - bw, x + w * 0.96, y + h, x, y + h }; poly(xy, 4, edge); }
    double cx = x + 1 + 6, inner = h - 14, cy = y + 1 + 6 + (inner - 50) / 2;
    // portrait: 52 x 48 on a radial gradient, 1px gold-dim border
    stroke(cx, cy, 54, 50, C_GOLDDIM, 1);
    radial(cx + 1, cy + 1, 52, 48, cx + 1 + 26, cy + 1 + 48 * 0.4, colhex("#3a3448", 255), colhex("#16121e", 255));
    SDL_Rect src = { 0, 0, p->portrait.w, p->portrait.h };
    drawTex(imgTex(&p->portrait, cards[i].down ? 1 : 0), &src, cx + 1, cy + 1, 52, 48);
    // info
    double ix = cx + 54 + 10, iw = 290 - 2 - 6 - 12 - 54 - 10;
    double ih = text_lineh(FONT_PIX, 14) + 4 + 9 + 2 + text_lineh(FONT_PIX, 11) + 4 + 5;
    double iy = y + 1 + 6 + (inner - ih) / 2;
    text_draw(FONT_PIX, 14, ix, iy, F(C_TEXT), p->name, 0);
    char cls[80]; snprintf(cls, sizeof cls, "%s · nv ", p->cls);
    char lv[8]; snprintf(lv, sizeof lv, "%d", cards[i].level);
    double w1 = text_width(FONT_PIX, 12, cls, 0), w2 = text_width(FONT_PIXB, 12, lv, 0);
    text_draw(FONT_PIX, 12, ix + iw - w1 - w2, iy, F(C_MUTED), cls, 0);
    text_draw(FONT_PIXB, 12, ix + iw - w2, iy, F(C_MUTED), lv, 0);
    double by = iy + text_lineh(FONT_PIX, 14) + 4;
    slantBar(ix, by, iw, 9, trans_val(&cardAnim[i].hp), colhex("#2a1a1a", 255), C_HPHI, C_HP, 0.98);
    double ty = by + 9 + 2;
    char hp[32]; snprintf(hp, sizeof hp, "%d / %d PV", cards[i].hp > 0 ? cards[i].hp : 0, cards[i].maxHp);
    char ac[16]; snprintf(ac, sizeof ac, "CA %d", cards[i].ac);
    text_draw(FONT_PIX, 11, ix, ty, F(C_MUTED), hp, 0);
    text_draw(FONT_PIX, 11, ix + iw - text_width(FONT_PIX, 11, ac, 0), ty, F(C_MUTED), ac, 0);
    double xy2 = ty + text_lineh(FONT_PIX, 11) + 4;
    slantBar(ix, xy2, iw, 5, trans_val(&cardAnim[i].xp), colhex("#1a1a22", 255), colhex("#fff0a0", 255), colhex("#d8a83a", 255), 0.98);
    gGray = 0;
  }
}

// ---------------------------------------------------------------- quest tracker
static struct { char text[80]; bool done; } objs[6]; static int nobjs; static bool questBuilt;
void updateQuest(void) {
  questBuilt = true; nobjs = 0;
#define OBJ(t, d) do { snprintf(objs[nobjs].text, 80, "%s", t); objs[nobjs].done = (d); nobjs++; } while (0)
  OBJ("Fale com Maren no cais", G.quest.stage > 0);
  if (G.quest.stage >= 1) OBJ("Expulse os goblins das Ruínas de Velmoor", G.quest.stage >= 2);
  if (G.quest.stage >= 1 && G.quest.patrolSeen >= 0) OBJ("Patrulha goblin na estrada", G.quest.patrolDone);
  if (G.quest.stage >= 2) OBJ("Volte para Maren", G.quest.stage >= 3);
  if (G.quest.grandson) OBJ("Procure o neto de Maren", G.quest.grandsonFound);
#undef OBJ
}
static void drawQuest(void) {
  if (!questBuilt) return;
  double right = W - 18, y = 14;
  Shadow sh[2] = { { 0, 1, 0, C_BLACK }, { 0, 0, 6, C_BLACK } };
  const char *title = "Goblins de Velmoor";
  double tw = text_width_sc(FONT_CIN7, 17, title, 0);
  scShadowed(FONT_CIN7, 17, right - tw, y, C_GOLD, title, 0, sh, 2);
  y += text_lineh(FONT_CIN7, 17) + 6;
  int lh = text_lineh(FONT_PIX, 14);
  for (int i = 0; i < nobjs; i++) {
    y += 3;
    // the diamond (9px box, rotated) sits after the text, 8px gap
    double dx = right - 9 / 2.0, dy = y + lh / 2.0;
    diamond(dx, dy, 9, objs[i].done ? C_GOLD : col(0, 0, 0, 0), C_GOLD, 1.5);
    double w = text_width(FONT_PIX, 14, objs[i].text, 0), tx = right - 9 - 8 - w;
    Col c = objs[i].done ? C_MUTED : C_TEXT;
    tshadowed(FONT_PIX, 14, tx, y, c, objs[i].text, 0, sh, 2);
    if (objs[i].done) fill(tx, floor(y + lh * 0.55), w, 1, c);
    y += lh + 3;
  }
}

// ---------------------------------------------------------------- hotbar
static HotbarEntry hb[8]; static int nhb; static int hbExtra;
static int hbHover = -1; static bool endHover;
void buildHotbar(const HotbarEntry *e, int n, int extra) {
  nhb = n < 8 ? n : 8; if (nhb) memcpy(hb, e, sizeof(HotbarEntry) * nhb); hbExtra = extra;
}
void hotbar_activate(int i) { if (i >= 0 && i < nhb && !hb[i].off) { sfx_click(); hb[i].use(hb[i].arg); } }
typedef struct { double x, y, w, h; } Box;
static Box hbSlots[8], hbEcon, hbEnd, hbBox;
static void layoutHotbar(void) {
  double w = 0, h = 0;
  w = nhb * 54 + (nhb > 1 ? (nhb - 1) * 10 : 0);
  h = nhb ? 54 : 0;
  double ew = 0, eh = 0, bw = 0, bh = 0;
  if (hbExtra == EXTRA_GOLD) {
    char g[32]; snprintf(g, sizeof g, " %d ouro", G.gold);
    ew = 12 * 1.18 + text_width(FONT_PIX, 12, g, 0); eh = text_lineh(FONT_PIX, 12);
  } else if (hbExtra == EXTRA_TURN) {
    Unit *u = G.combat ? G.combat->active : NULL;
    char m[32]; snprintf(m, sizeof m, "Movimento %d", u ? u->moveLeft : 0);
    ew = 10 + 6 + fmax(text_width(FONT_PIX, 12, m, 0), text_width(FONT_PIX, 12, "Bônus", 0)); eh = 3 * text_lineh(FONT_PIX, 12) + 8;
    bw = text_width(FONT_CIN7, 15, "Fim do turno", 0) + 36 + 4; bh = text_lineh(FONT_CIN7, 15) + 20 + 4;
  }
  double tot = w + (ew ? (nhb ? 10 : 0) + ew : 0) + (bw ? 12 + bw : 0);
  double hh = fmax(h, fmax(eh, bh));
  double x = (W - tot) / 2, bottom = H - 16;
  hbBox = (Box){ x, bottom - hh, tot, hh };
  for (int i = 0; i < nhb; i++) hbSlots[i] = (Box){ x + i * 64, bottom - 54, 54, 54 };
  double ex = x + w + (nhb ? 10 : 0);
  hbEcon = (Box){ ex, bottom - eh, ew, eh };
  hbEnd = (Box){ ex + ew + 12, bottom - bh, bw, bh };
  if (!nhb && !ew) hbBox.w = 0;
}
static void drawHotbar(void) {
  layoutHotbar();
  for (int i = 0; i < nhb; i++) {
    Box b = hbSlots[i]; HotbarEntry *e = &hb[i];
    double cx = b.x + 27, cy = b.y + 27;
    gGray = e->off ? 0.55 : 0;
    bool lit = (i == hbHover && !e->off) || e->sel || (i == hbHover && e->off && false);
    if (i == hbHover) lit = true;
    // ::before: a 40px square turned 45 degrees, gradient(135deg), 2px border and a 2px dark ring
    diamond(cx, cy, 44, col(0, 0, 0, 136), col(0, 0, 0, 0), 0);
    diamondG(cx, cy, 40, lit ? colhex("#5a3a1a", 255) : colhex("#3a2a1a", 255), lit ? colhex("#1e140e", 255) : colhex("#140e0c", 255), lit ? C_GOLD : C_GOLDDIM, 2);
    drawIcon(e->icon, e->off, cx - 22 * 1.18 / 2, cy - 22 * 1.18 / 2 + 1, 22);
    // the key number, under the slot
    char k[4]; snprintf(k, sizeof k, "%d", i + 1);
    double kw = text_width(FONT_PIX, 11, k, 0) + 8 + 2, kh = text_lineh(FONT_PIX, 11) + 2;
    double kx = cx - kw / 2, ky = b.y + 54 + 6 - kh;
    fill(kx, ky, kw, kh, colhex("#0c0a10", 255));
    stroke(kx, ky, kw, kh, C_GOLDDIM, 1);
    text_draw(FONT_PIX, 11, kx + 5, ky + 1, F(C_GOLD), k, 0);
    if (e->count >= 0) {
      char n[8]; snprintf(n, sizeof n, "%d", e->count);
      double nw = text_width(FONT_PIX, 11, n, 0);
      Shadow sh[1] = { { 0, 1, 0, C_BLACK } };
      tshadowed(FONT_PIX, 11, b.x + 54 + 2 - nw, b.y - 2, col(255, 255, 255, 255), n, 0, sh, 1);
    }
    gGray = 0;
  }
  if (hbExtra == EXTRA_GOLD) {
    char g[32]; snprintf(g, sizeof g, " %d ouro", G.gold);
    drawIcon("coin", false, hbEcon.x, hbEcon.y + 1, 12);
    text_draw(FONT_PIX, 12, hbEcon.x + 12 * 1.18, hbEcon.y, F(C_MUTED), g, 0);
  } else if (hbExtra == EXTRA_TURN && G.combat && G.combat->active) {
    Unit *u = G.combat->active;
    int lh = text_lineh(FONT_PIX, 12);
    const char *lab[3] = { "Ação", "Bônus", "Movimento" };
    bool on[3] = { u->action > 0, u->bonus > 0, u->moveLeft > 0 };
    Col pc[3] = { colhex("#6ad04a", 255), colhex("#e89a2a", 255), colhex("#5fb0e8", 255) };
    for (int r = 0; r < 3; r++) {
      double y = hbEcon.y + r * (lh + 4);
      // the pip: inline-block 10px square turned 45 degrees, sitting on the baseline
      double base = y + (lh - (text_ascent(FONT_PIX, 12) + text_descent(FONT_PIX, 12))) / 2.0 + text_ascent(FONT_PIX, 12);
      diamond(hbEcon.x + 5, base - 5, 10, on[r] ? pc[r] : colhex("#333333", 255), C_BLACK, 1);
      char t[32]; if (r == 2) snprintf(t, sizeof t, "%s %d", lab[r], u->moveLeft); else snprintf(t, sizeof t, "%s", lab[r]);
      text_draw(FONT_PIX, 12, hbEcon.x + 16, y, F(C_MUTED), t, 0);
    }
    // the end-turn button: a parallelogram (clip-path 8% .. 92%)
    Box b = hbEnd; double s = b.w * 0.08;
    { double xy[8] = { b.x + s, b.y, b.x + b.w, b.y, b.x + b.w - s, b.y + b.h, b.x, b.y + b.h }; Col cs[4] = { colhex("#5a3a1a", 255), colhex("#5a3a1a", 255), colhex("#2a1a0e", 255), colhex("#2a1a0e", 255) }; polyC(xy, cs, 4); }
    Col bc = endHover ? C_GOLD : C_GOLDDIM;
    { double xy[8] = { b.x + s, b.y, b.x + b.w, b.y, b.x + b.w - s * 2 / b.h, b.y + 2, b.x + s - s * 2 / b.h, b.y + 2 }; poly(xy, 4, bc); }
    { double xy[8] = { b.x + s * 2 / b.h, b.y + b.h - 2, b.x + b.w - s + s * 2 / b.h, b.y + b.h - 2, b.x + b.w - s, b.y + b.h, b.x, b.y + b.h }; poly(xy, 4, bc); }
    text_draw(FONT_CIN7, 15, b.x + 20, b.y + 12, F(endHover ? col(255, 255, 255, 255) : C_GOLD), "Fim do turno", 0);
  }
}

// ---------------------------------------------------------------- initiative strip
static struct { Unit *u; bool party, now, dead; double hp; } ini[16]; static int nini;
void updateInitiative(void) {
  nini = 0;
  Combat *C = G.combat;
  if (!C) return;
  for (int i = 0; i < C->norder; i++) {
    Unit *u = C->order[i];
    ini[nini].u = u; ini[nini].party = u->team == TEAM_PARTY; ini[nini].now = u == C->active; ini[nini].dead = u->hp <= 0;
    ini[nini].hp = 100.0 * (u->hp > 0 ? u->hp : 0) / u->maxHp; nini++;
  }
}
static void drawIniOne(int i, double x, double y) {
  double s = ini[i].now ? 1.12 : 1, w = 46 * s, h = 52 * s;
  double cx = x + 23, cy = y + 26 + (ini[i].now ? 4 : 0);
  double X = cx - w / 2, Y = cy - h / 2;
  gA = ini[i].dead ? 0.25 : 1;
  if (ini[i].now) { // box-shadow 0 0 10px #e8c06a88
    for (int k = 6; k >= 1; k--) { Col g = C_GOLD; g.a = (Uint8)(136 * 0.12); stroke(X - k * 1.6, Y - k * 1.6, w + k * 3.2, h + k * 3.2, g, 1.6); }
  }
  fill(X, Y, w, h, C_PANEL);
  stroke(X, Y, w, h, ini[i].now ? C_GOLD : ini[i].party ? colhex("#2a6a8a", 255) : colhex("#8a2a2a", 255), s);
  SDL_Rect src = { 0, 0, ini[i].u->portrait.w, ini[i].u->portrait.h };
  drawTex(imgTex(&ini[i].u->portrait, 0), &src, cx - 20 * s, cy - 18.5 * s, 40 * s, 37 * s);
  double bx = X + 3 * s, bw = w - 6 * s, bh = 3 * s, by = Y + h - 2 * s - bh;
  fill(bx, by, bw, bh, colhex("#330000", 255));
  fill(bx, by, bw * ini[i].hp / 100, bh, C_HP);
  gA = 1;
}
static void drawInitiative(void) {
  if (!nini) return;
  double tot = nini * 46 + (nini - 1) * 6, x = (W - tot) / 2, y = 14;
  int nowI = -1;
  for (int i = 0; i < nini; i++) { if (ini[i].now) { nowI = i; continue; } drawIniOne(i, x + i * 52, y); }
  if (nowI >= 0) drawIniOne(nowI, x + nowI * 52, y);
}

// ---------------------------------------------------------------- corner buttons and the pause menu
static Box cornerBtn[2];
static int cornerHover = -1;
void ui_syncMute(bool m) { muted_ = m; }
static void drawCorner(void) {
  if (!ui_corner) return;
  for (int i = 0; i < 2; i++) {
    Box b = { 14 + i * 40, 12, 34, 34 }; cornerBtn[i] = b;
    fill(b.x + 1, b.y + 1, 32, 32, C_PANEL);
    // border-radius 6
    Col e = cornerHover == i ? C_GOLD : C_EDGE;
    fill(b.x + 6, b.y, 22, 1, e); fill(b.x + 6, b.y + 33, 22, 1, e); fill(b.x, b.y + 6, 1, 22, e); fill(b.x + 33, b.y + 6, 1, 22, e);
    for (int k = 0; k < 6; k++) {
      double a = M_PI / 2 * k / 5, ox = 6 - 6 * cos(a), oy = 6 - 6 * sin(a);
      fill(b.x + ox, b.y + oy, 1, 1, e); fill(b.x + 33 - ox, b.y + oy, 1, 1, e); fill(b.x + ox, b.y + 33 - oy, 1, 1, e); fill(b.x + 33 - ox, b.y + 33 - oy, 1, 1, e);
    }
    if (i == 0) { // ☰
      for (int k = 0; k < 3; k++) fill(b.x + 10, b.y + 11 + k * 5, 14, 2, C_TEXT);
    } else drawIcon(muted_ ? "muted" : "sound", false, b.x + 17 - 16 * 1.18 / 2, b.y + 17 - 16 * 1.18 / 2, 16);
  }
}

static Box pauseBox, resumeBtn, muteRow, sliders[VOL_N];
static int pauseHover = -1, dragSlider = -1;
static double sliderVal(int i, int x) { Box s = sliders[i]; double v = (x - s.x - 8) / (s.w - 16); v = v < 0 ? 0 : v > 1 ? 1 : v; return JSROUND(v / 0.05) * 0.05; }
static void drawPause(void) {
  if (!ui_pause) return;
  fill(0, 0, W, H, col(5, 5, 8, 184));
  double bw = fmin(560, W - 32), px = 28, py = 22;
  double cw = bw - 2 - 2 * px;
  // measure first
  int l16 = text_lineh(FONT_PIX, 16), l14 = text_lineh(FONT_PIX, 14), l13 = text_lineh(FONT_PIX, 13);
  double h1 = text_lineh(FONT_CIN7, 34), h3 = text_lineh(FONT_CIN7, 16);
  double rowH = fmax(l14, 20); // an <input type=range> is 16px tall with a 2px margin
  const char *keys[3] = { "<b>Clique</b> ou <b>WASD</b> anda · <b>E</b> interage · <b>Tab</b> troca de personagem",
    "Combate: <b>1–5</b> ação · <b>Espaço</b> encerra o turno · <b>Esc</b> cancela a ação", "<b>Esc</b> ou <b>P</b> pausa · <b>M</b> liga/desliga o som" };
  Style ks = ST(FONT_PIX, 13, C_MUTED); ks.bold = C_TEXT;
  Layout KL[3]; double keysH = 0;
  for (int i = 0; i < 3; i++) { rich_layout(&KL[i], keys[i], ks, cw - 18, 1.7); keysH += KL[i].h; }
  double resumeH = text_lineh(FONT_CIN7, 18) + 20 + 4, resumeW = text_width(FONT_CIN7, 18, "Continuar", 0) + 72 + 4;
  double contentH = h1 + 18 + h3 + 4 + 1 + 8 + l16 + (6 + rowH) * 3 + 12 + l13 + 4 + (rowH + 6) * 5 - 6 + 18 + h3 + 4 + 1 + 8 + keysH + 20 + resumeH;
  double bh = contentH + 2 * py + 2;
  double bx = (W - bw) / 2, by = (H - bh) / 2;
  if (by < 16) by = 16;
  pauseBox = (Box){ bx, by, bw, bh };
  for (int k = 10; k >= 1; k--) fill(bx - k * 2, by + 10 - k * 2 + 4, bw + k * 4, bh + k * 4, col(0, 0, 0, 14)); // box-shadow
  gradV(bx, by, bw, bh, col(20, 17, 26, 247), col(10, 9, 14, 250));
  stroke(bx, by, bw, bh, C_EDGE, 1);
  double x = bx + 1 + px, y = by + 1 + py;
  { const char *t = "Pausado"; double ls = 34 * 0.06, w = text_width_sc(FONT_CIN7, 34, t, ls); text_draw_sc(FONT_CIN7, 34, x + (cw - w) / 2, y, C_GOLD, t, ls, 0); y += h1 + 18; }
  // h3 Som
  text_draw(FONT_CIN7, 16, x, y, C_GOLD, "Som", 0); y += h3 + 4; fill(x, y, cw, 1, col(0x6b, 0x5a, 0x3a, 0x66)); y += 1 + 8;
  // mute checkbox row
  muteRow = (Box){ x, y, cw, l16 };
  { double cy = y + l16 / 2.0; Col bc = audioSet.muted ? colhex("#0075ff", 255) : col(255, 255, 255, 255);
    fill(x + 3, cy - 6.5, 13, 13, bc); if (!audioSet.muted) stroke(x + 3, cy - 6.5, 13, 13, colhex("#767676", 255), 1);
    else { thickLine(x + 5.5, cy, x + 8.5, cy + 3, 2, col(255, 255, 255, 255)); thickLine(x + 8.5, cy + 3, x + 13.5, cy - 3, 2, col(255, 255, 255, 255)); }
    text_draw(FONT_PIX, 16, x + 3 + 13 + 3 + 8, y, C_TEXT, " Silenciar tudo", 0);
    double kw = text_width(FONT_PIX, 12, "M", 0) + 12 + 2, kh = text_lineh(FONT_PIX, 12) + 2;
    stroke(x + cw - kw, cy - kh / 2, kw, kh, col(0x6b, 0x5a, 0x3a, 0x88), 1);
    text_draw(FONT_PIX, 12, x + cw - kw + 7, cy - kh / 2 + 1, C_MUTED, "M", 0); }
  y += l16;
  bool hdr = false;
  for (int i = 0; i < VOL_N; i++) {
    if (SOUND_GROUPS[i].sfx && !hdr) { y += 12 - 6; text_draw(FONT_PIX, 13, x, y, C_MUTED, "EFEITOS SONOROS", 13 * 0.08); y += l13 + 4; hdr = true; }
    y += 6;
    bool off = audioSet.vol[i] == 0;
    gA = off ? 0.45 : 1;
    double c3 = 42, c2 = 150, c1 = cw - c3 - c2 - 20;
    Layout L; rich_layout(&L, SOUND_GROUPS[i].label, ST(FONT_PIX, 14, C_TEXT), c1, 0);
    double rh = fmax(rowH, L.h);
    richDraw(&L, x, y + (rh - L.h) / 2, NULL, 0, 0);
    Box s = { x + c1 + 10, y + rh / 2 - 8, c2, 16 }; sliders[i] = s;
    double v = audioSet.vol[i], tx = s.x + 8, tw = s.w - 16, cy = s.y + 8;
    // the range input, tinted with accent-color: a rounded 8px track (gray border, dark rest), a 16px thumb
    pill(s.x, cy - 4, s.w, 8, colhex("#8a8a8a", 255));
    pill(s.x + 1, cy - 3, s.w - 2, 6, colhex("#3b3b3b", 255));
    pill(s.x + 1, cy - 3, tx - s.x - 1 + tw * v, 6, C_GOLD);
    disc(tx + tw * v, cy, 8, C_GOLD);
    char pct[8]; snprintf(pct, sizeof pct, "%d%%", (int)JSROUND(v * 100));
    double pw = text_width(FONT_PIX, 14, pct, 0);
    text_draw(FONT_PIX, 14, x + cw - pw, y + (rh - l14) / 2, F(C_MUTED), pct, 0);
    gA = 1;
    y += rh;
  }
  y += 18;
  text_draw(FONT_CIN7, 16, x, y, C_GOLD, "Controles", 0); y += h3 + 4; fill(x, y, cw, 1, col(0x6b, 0x5a, 0x3a, 0x66)); y += 1 + 8;
  for (int i = 0; i < 3; i++) {
    double by2 = y + KL[i].lineBase[0];
    disc(x + 18 - 9, by2 - 4, 2.5, C_MUTED); // the bullet
    richDraw(&KL[i], x + 18, y, NULL, 0, 0);
    y += KL[i].h;
  }
  y += 20;
  Box rb = { x + (cw - resumeW) / 2, y, resumeW, resumeH }; resumeBtn = rb;
  gradV(rb.x, rb.y, rb.w, rb.h, colhex("#5a3a1a", 255), colhex("#2a1a0e", 255));
  stroke(rb.x, rb.y, rb.w, rb.h, C_GOLD, 2);
  text_draw(FONT_CIN7, 18, rb.x + 38, rb.y + 12, pauseHover == 100 ? col(255, 255, 255, 255) : C_GOLD, "Continuar", 0);
}

// ---------------------------------------------------------------- dialogue box and dice
DialogueView dlgView;
DiceView diceView;
static Box dlgBox, dlgText, dlgOpts[6];
static int dlgHover = -1;
static Layout dlgOptL[6];
static void drawDialogue(void) {
  if (!dlgView.visible) return;
  double bw = fmin(820, W * 0.92), bx = (W - bw) / 2;
  double bodyW = bw - 2 - 40 - 106 - 16;
  // the text typed so far
  char shown[600]; int n = dlgView.shown; int len = (int)strlen(dlgView.text);
  if (n > len) n = len;
  // never cut a UTF-8 sequence in half
  while (n < len && (dlgView.text[n] & 0xC0) == 0x80) n++;
  memcpy(shown, dlgView.text, n); shown[n] = 0;
  Layout TL; rich_layout(&TL, shown, ST(FONT_PIX, 17, C_TEXT), bodyW, 1.45);
  double textH = fmax(50, n ? TL.h : 0);
  double optsH = 0;
  for (int i = 0; i < dlgView.nopts; i++) {
    Style s = ST(FONT_PIX, 16, colhex("#e8dcc4", 255));
    rich_layout(&dlgOptL[i], dlgView.opts[i].html, s, bodyW - 16 - 2, 0);
    optsH += dlgOptL[i].h + 8 + (i ? 4 : 0);
  }
  double nameH = text_lineh(FONT_CIN7, 18) + 6;
  double bodyH = nameH + textH + (dlgView.nopts ? 12 + optsH : 12);
  double bh = fmax(98, bodyH) + 32 + 2, by = H - 120 - bh;
  dlgBox = (Box){ bx, by, bw, bh };
  for (int k = 8; k >= 1; k--) fill(bx - k * 4, by + 10 - k * 4 + 6, bw + k * 8, bh + k * 8, col(0, 0, 0, 12)); // 0 10px 40px #000a
  gradV(bx, by, bw, bh, col(14, 12, 20, 240), col(8, 8, 12, 245));
  stroke(bx, by, bw, bh, C_EDGE, 1);
  double px = bx + 1 + 20, py = by + 1 + 16;
  stroke(px, py, 106, 98, C_GOLDDIM, 1);
  radial(px + 1, py + 1, 104, 96, px + 1 + 52, py + 1 + 96 * 0.4, colhex("#3a4a58", 255), colhex("#12161e", 255));
  if (dlgView.npc) { SDL_Rect src = { 0, 0, dlgView.npc->portrait.w, dlgView.npc->portrait.h }; drawTex(imgTex(&dlgView.npc->portrait, 0), &src, px + 1, py + 1, 104, 96); }
  double tx = px + 106 + 16, ty = py;
  text_draw(FONT_CIN7, 18, tx, ty, C_GOLD, dlgView.npc ? dlgView.npc->name : "", 0);
  ty += nameH;
  dlgText = (Box){ tx, ty, bodyW, textH };
  if (n) richDraw(&TL, tx, ty, NULL, 0, 0);
  ty += textH + 12;
  for (int i = 0; i < dlgView.nopts; i++) {
    double oh = dlgOptL[i].h + 8;
    Box ob = { tx, ty, bodyW, oh }; dlgOpts[i] = ob;
    gA = dlgView.opts[i].used ? 0.4 : 1;
    bool hov = dlgHover == i && !dlgView.opts[i].used;
    if (hov) { fill(ob.x, ob.y, ob.w, ob.h, col(255, 255, 255, 16)); fill(ob.x, ob.y, 2, ob.h, C_GOLD); }
    if (hov) for (int k = 0; k < dlgOptL[i].n; k++) { Col c = dlgOptL[i].runs[k].st.c; if (c.r == 0xe8 && c.g == 0xdc) dlgOptL[i].runs[k].st.c = col(255, 255, 255, 255); }
    richDraw(&dlgOptL[i], ob.x + 2 + 8, ob.y + 4, NULL, 0, 0);
    gA = 1;
    ty += oh + 4;
  }
}
static void d20(double cx, double cy, double size, double ang) {
  // the SVG (viewBox 0 0 100 100): an outer hexagon, an inner triangle, and the facet lines, spinning
  double k = size / 100;
  const double hex[6][2] = { { 50, 3 }, { 93, 27 }, { 93, 73 }, { 50, 97 }, { 7, 73 }, { 7, 27 } };
  const double tri[3][2] = { { 50, 22 }, { 78, 68 }, { 22, 68 } };
  const double lines[9][4] = { { 50, 3, 50, 22 }, { 93, 27, 78, 68 }, { 7, 27, 22, 68 }, { 50, 97, 78, 68 }, { 50, 97, 22, 68 }, { 93, 73, 78, 68 }, { 7, 73, 22, 68 }, { 93, 27, 50, 22 }, { 7, 27, 50, 22 } };
  double ca = cos(ang), sa = sin(ang);
#define TX(px, py) (cx + (((px) - 50) * ca - ((py) - 50) * sa) * k)
#define TY(px, py) (cy + (((px) - 50) * sa + ((py) - 50) * ca) * k)
  double xy[12]; for (int i = 0; i < 6; i++) { xy[i * 2] = TX(hex[i][0], hex[i][1]); xy[i * 2 + 1] = TY(hex[i][0], hex[i][1]); }
  poly(xy, 6, colhex("#2a2236", 255));
  double t6[6]; for (int i = 0; i < 3; i++) { t6[i * 2] = TX(tri[i][0], tri[i][1]); t6[i * 2 + 1] = TY(tri[i][0], tri[i][1]); }
  poly(t6, 3, colhex("#3a3050", 255));
  for (int i = 0; i < 9; i++) thickLine(TX(lines[i][0], lines[i][1]), TY(lines[i][0], lines[i][1]), TX(lines[i][2], lines[i][3]), TY(lines[i][2], lines[i][3]), 1.2 * k, C_GOLDDIM);
  for (int i = 0; i < 3; i++) thickLine(t6[i * 2], t6[i * 2 + 1], t6[(i + 1) % 3 * 2], t6[(i + 1) % 3 * 2 + 1], 1.5 * k, C_GOLD);
  for (int i = 0; i < 6; i++) { int j = (i + 1) % 6; thickLine(xy[i * 2], xy[i * 2 + 1], xy[j * 2], xy[j * 2 + 1], 2 * k, C_GOLD); }
#undef TX
#undef TY
}
static void drawDice(void) {
  if (!diceView.visible) return;
  collapse(diceView.dc); collapse(diceView.result); collapse(diceView.skill);
  radial(0, 0, W, H, W / 2.0, H / 2.0, col(10, 8, 16, 230), col(0, 0, 0, 247));
  double hS = text_lineh(FONT_CIN5, 30), hD = text_lineh(FONT_PIX, 18), hR = fmax(46, text_lineh(FONT_CIN5, 34)), hH = text_lineh(FONT_PIX, 13);
  double tot = hS + hD + 190 + hR + hH + 40, y = (H - tot) / 2;
  double w = text_width_sc(FONT_CIN5, 30, diceView.skill, 0);
  text_draw_sc(FONT_CIN5, 30, (W - w) / 2, y, C_GOLD, diceView.skill, 0, 0); y += hS + 10;
  w = text_width(FONT_PIX, 18, diceView.dc, 0);
  text_draw(FONT_PIX, 18, (W - w) / 2, y, C_MUTED, diceView.dc, 0); y += hD + 10;
  double ang = diceView.spin ? fmod(diceView.spinT / 0.3, 1) * TAU : 0;
  d20(W / 2.0, y + 95, 190, ang);
  char num[8]; snprintf(num, sizeof num, "%d", diceView.num);
  w = text_width(FONT_PIXB, 46, num, 0);
  double nh = text_lineh(FONT_PIXB, 46);
  Shadow sh[1] = { { 0, 2, 0, C_BLACK } };
  tshadowed(FONT_PIXB, 46, (W - w) / 2, y + 95 - nh / 2 + 9, col(255, 255, 255, 255), num, 0, sh, 1);
  y += 190 + 10;
  if (diceView.result[0]) {
    w = text_width(FONT_CIN5, 34, diceView.result, 0);
    text_draw(FONT_CIN5, 34, (W - w) / 2, y, diceView.ok ? C_GOOD : C_BAD, diceView.result, 0);
  }
  y += hR + 10;
  w = text_width(FONT_PIX, 13, "clique para continuar", 0);
  text_draw(FONT_PIX, 13, (W - w) / 2, y, C_MUTED, "clique para continuar", 0);
}

// ---------------------------------------------------------------- title and game over
static Box startBtn; static bool startHover;
static void drawTitle(void) {
  if (ui_title == TITLE_HIDDEN) return;
  radial(0, 0, W, H, W / 2.0, H * 0.4, col(20, 30, 28, 140), col(5, 5, 8, 235));
  int fs = (int)JSROUND(fmin(92, fmax(44, W * 0.07)));
  double ls = fs * 0.08;
  double h1 = text_lineh(FONT_CIN7, fs), h2 = text_lineh(FONT_PIX, 18), l16 = text_lineh(FONT_PIX, 16);
  const char *help[4] = { "<b>Clique</b> no chão para andar · <b>WASD</b> também anda",
    "<b>Clique</b> em personagens e baús para interagir · <b>E</b> interage com o que está perto",
    "Em combate: <b>clique</b> num quadrado para mover, <b>1–5</b> escolhe a ação, <b>Espaço</b> encerra o turno",
    "<b>Tab</b> alterna o personagem controlado · <b>Esc</b> pausa e abre o som · <b>M</b> liga/desliga o som" };
  Style hs = ST(FONT_PIX, 16, colhex("#d8ccb4", 255)); hs.bold = C_GOLD;
  Layout HL[4]; double helpH = 0;
  if (ui_title == TITLE_READY) for (int i = 0; i < 4; i++) { rich_layout(&HL[i], help[i], hs, 0, 1.9); helpH += HL[i].h; }
  double btnH = text_lineh(FONT_CIN7, 22) + 24 + 4, btnW = text_width(FONT_CIN7, 22, "Começar", 0) + 88 + 4;
  double tot = h1 + 4 + h2 + 26 + (ui_title == TITLE_READY ? 16 + helpH + 16 + 18 + btnH : l16);
  double y = (H - tot) / 2;
  const char *t = "Brumafolha";
  double w = text_width_sc(FONT_CIN7, fs, t, ls);
  Shadow sh[2] = { { 0, 4, 0, C_BLACK }, { 0, 0, 30, col(0x5f, 0xd0, 0xc8, 0x55) } };
  scShadowed(FONT_CIN7, fs, (W - w) / 2, y, colhex("#f4ecdc", 255), t, ls, sh, 2);
  y += h1 + 4;
  const char *sub = "Um protótipo de RPG tático";
  w = text_width(FONT_PIX, 18, sub, 0);
  text_draw(FONT_PIX, 18, (W - w) / 2, y, C_TEAL, sub, 0);
  y += h2 + 26;
  if (ui_title == TITLE_LOADING) {
    const char *l = "Pintando o vale pixel a pixel…";
    w = text_width(FONT_PIX, 16, l, 0);
    text_draw(FONT_PIX, 16, (W - w) / 2, y, C_MUTED, l, 0);
    return;
  }
  y += 16;
  for (int i = 0; i < 4; i++) { richDraw(&HL[i], (W - HL[i].w) / 2, y, NULL, 0, 0); y += HL[i].h; }
  y += 16 + 18;
  Box b = { (W - btnW) / 2, y, btnW, btnH }; startBtn = b;
  gradV(b.x, b.y, b.w, b.h, colhex("#5a3a1a", 255), colhex("#2a1a0e", 255));
  stroke(b.x, b.y, b.w, b.h, C_GOLD, 2);
  text_draw(FONT_CIN7, 22, b.x + 46, b.y + 14, startHover ? col(255, 255, 255, 255) : C_GOLD, "Começar", 0);
}
static Box retryBtn; static bool retryHover;
static void drawGameOver(void) {
  if (!ui_gameover) return;
  fill(0, 0, W, H, col(0, 0, 0, 204));
  double h1 = text_lineh(FONT_CIN7, 54), p = text_lineh(FONT_CIN5, 16), btnH = text_lineh(FONT_CIN7, 22) + 24 + 4;
  double btnW = text_width(FONT_CIN7, 22, "Tentar de novo", 0) + 88 + 4;
  double tot = h1 + 16 + p + 16 + 18 + btnH, y = (H - tot) / 2;
  double w = text_width(FONT_CIN7, 54, "O grupo caiu", 0);
  text_draw(FONT_CIN7, 54, (W - w) / 2, y, colhex("#ff6a5a", 255), "O grupo caiu", 0);
  y += h1 + 16;
  const char *s = "As brumas do vale guardam mais um segredo.";
  w = text_width(FONT_CIN5, 16, s, 0);
  text_draw(FONT_CIN5, 16, (W - w) / 2, y, C_MUTED, s, 0);
  y += p + 16 + 18;
  Box b = { (W - btnW) / 2, y, btnW, btnH }; retryBtn = b;
  gradV(b.x, b.y, b.w, b.h, colhex("#5a3a1a", 255), colhex("#2a1a0e", 255));
  stroke(b.x, b.y, b.w, b.h, C_GOLD, 2);
  text_draw(FONT_CIN7, 22, b.x + 46, b.y + 14, retryHover ? col(255, 255, 255, 255) : C_GOLD, "Tentar de novo", 0);
}

// ---------------------------------------------------------------- frame
bool ui_init(SDL_Renderer *r, const char *assetDir) {
  R = r;
  SDL_SetRenderDrawBlendMode(R, SDL_BLENDMODE_BLEND);
  if (!text_init(r, assetDir)) return false;
  loadIcons(assetDir);
  return true;
}
void ui_update(double dt) {
  now_ += dt;
  if (toastHideAt >= 0 && now_ >= toastHideAt) { trans_set(&toastOp, 0, 0.4); toastHideAt = -1; }
  if (bannerHideAt >= 0 && now_ >= bannerHideAt) { trans_set(&bannerOp, 0, 0.9); bannerHideAt = -1; }
  if (diceView.spin) diceView.spinT += dt;
}
static bool inBox(Box b, int x, int y) { return x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h; }
static void updateHover(void) {
  hbHover = -1; endHover = false; cornerHover = -1; dlgHover = -1; startHover = retryHover = false; pauseHover = -1;
  hand = false;
  if (ui_pause) {
    if (inBox(resumeBtn, mx, my)) { pauseHover = 100; hand = true; }
    if (inBox(muteRow, mx, my)) hand = true;
    return;
  }
  if (ui_gameover) { retryHover = inBox(retryBtn, mx, my); hand = retryHover; return; }
  if (ui_title != TITLE_HIDDEN) { startHover = ui_title == TITLE_READY && inBox(startBtn, mx, my); hand = startHover; return; }
  if (diceView.visible) { hand = true; return; }
  if (dlgView.visible && inBox(dlgBox, mx, my)) {
    for (int i = 0; i < dlgView.nopts; i++) if (inBox(dlgOpts[i], mx, my) && !dlgView.opts[i].used) { dlgHover = i; hand = true; }
    return;
  }
  if (ui_corner) for (int i = 0; i < 2; i++) if (inBox(cornerBtn[i], mx, my)) { cornerHover = i; hand = true; return; }
  layoutHotbar();
  if (hbBox.w > 0 && inBox(hbBox, mx, my)) {
    for (int i = 0; i < nhb; i++) if (inBox(hbSlots[i], mx, my)) { hbHover = i; hand = !hb[i].off; }
    if (hbExtra == EXTRA_TURN && inBox(hbEnd, mx, my)) { endHover = true; hand = true; }
    return;
  }
  for (int i = 0; i < G.nparty && partyBuilt; i++) { double x, y, w, h; cardRect(i, &x, &y, &w, &h); if (mx >= x && mx < x + w && my >= y && my < y + h) { hand = true; return; } }
}
bool ui_wants_hand(void) { return hand; }
bool ui_captures(int x, int y) {
  if (ui_pause || ui_gameover || ui_title != TITLE_HIDDEN || diceView.visible) return true;
  if (dlgView.visible && inBox(dlgBox, x, y)) return true;
  if (ui_corner) for (int i = 0; i < 2; i++) if (inBox(cornerBtn[i], x, y)) return true;
  layoutHotbar();
  if (hbBox.w > 0 && inBox(hbBox, x, y)) return true;
  for (int i = 0; i < G.nparty && partyBuilt; i++) { double bx, by, w, h; cardRect(i, &bx, &by, &w, &h); if (x >= bx && x < bx + w && y >= by && y < by + h) return true; }
  return false;
}
void ui_mousemove(int x, int y) {
  mx = x; my = y;
  if (dragSlider >= 0) { double v = sliderVal(dragSlider, x); if (v != audioSet.vol[dragSlider]) setVolume(dragSlider, v); }
}
bool ui_mousedown(int x, int y, int button) {
  mx = x; my = y;
  updateHover();
  if (button != SDL_BUTTON_LEFT) return ui_captures(x, y);
  if (ui_pause) {
    if (inBox(resumeBtn, x, y)) { main_setPaused(false); return true; }
    if (inBox(muteRow, x, y)) { ui_syncMute(setMuted(!audioSet.muted)); return true; }
    for (int i = 0; i < VOL_N; i++) { Box s = sliders[i]; if (x >= s.x && x < s.x + s.w && y >= s.y - 4 && y < s.y + s.h + 4) { dragSlider = i; setVolume(i, sliderVal(i, x)); return true; } }
    return true;
  }
  if (ui_gameover) { if (inBox(retryBtn, x, y)) main_reload(); return true; }
  if (ui_title != TITLE_HIDDEN) { if (ui_title == TITLE_READY && inBox(startBtn, x, y)) main_begin(); return true; }
  if (diceView.visible) { dice_click(); return true; }
  if (dlgView.visible && inBox(dlgBox, x, y)) {
    if (inBox(dlgText, x, y)) dialogue_text_click();
    for (int i = 0; i < dlgView.nopts; i++) if (inBox(dlgOpts[i], x, y) && !dlgView.opts[i].used) { dialogue_click_option(i); break; }
    return true;
  }
  if (ui_corner) {
    if (inBox(cornerBtn[0], x, y)) { main_setPaused(!G.paused); return true; }
    if (inBox(cornerBtn[1], x, y)) { ui_syncMute(toggleMute()); return true; }
  }
  layoutHotbar();
  if (hbBox.w > 0 && inBox(hbBox, x, y)) {
    for (int i = 0; i < nhb; i++) if (inBox(hbSlots[i], x, y)) { hotbar_activate(i); return true; }
    if (hbExtra == EXTRA_TURN && inBox(hbEnd, x, y)) { endTurn(); return true; }
    return true;
  }
  for (int i = 0; i < G.nparty && partyBuilt; i++) { double bx, by, w, h; cardRect(i, &bx, &by, &w, &h); if (x >= bx && x < bx + w && y >= by && y < by + h) { main_selectLeader(i); return true; } }
  return false;
}
void ui_mouseup(int x, int y, int button) {
  if (button == SDL_BUTTON_LEFT && dragSlider >= 0) { int k = dragSlider; dragSlider = -1; previewSound(k); }
}

void ui_draw(void) {
  SDL_GetRendererOutputSize(R, &W, &H);
  updateHover();
  // hovering a hotbar slot shows its tooltip, like its mousemove handler
  static bool slotTip;
  if (hbHover >= 0 && !ui_pause) { char t[300]; snprintf(t, sizeof t, "<b>%s</b><br>%s", hb[hbHover].name, hb[hbHover].desc); tooltipAtMouse(t); slotTip = true; }
  else if (slotTip) { slotTip = false; tooltip(NULL); }
  drawFloaters();
  drawBanner();
  drawQuest();
  drawInitiative();
  drawParty();
  drawHotbar();
  drawLog();
  drawToast();
  drawTooltip();
  drawCorner();
  drawDialogue();
  drawDice();
  drawTitle();
  drawGameOver();
  drawPause();
}
