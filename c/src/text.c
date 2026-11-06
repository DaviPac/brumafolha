#include "text.h"
#include <SDL_ttf.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include <math.h>

static SDL_Renderer *R;
static const char *FILES[FONT_N] = { "PixelifySans-400.ttf", "PixelifySans-600.ttf", "Cinzel-500.ttf", "Cinzel-700.ttf", "DejaVuSans-fallback.ttf" };
static char dir[1024];

typedef struct { int size; TTF_Font *f; } Sized;
static struct { int upem, asc, desc, gap; } MET[FONT_N]; // hhea, in font units

static int rd16(const unsigned char *p) { return (p[0] << 8) | p[1]; }
static void readMetrics(FontId id, const char *path) {
  FILE *fp = fopen(path, "rb");
  MET[id].upem = 1000; MET[id].asc = 900; MET[id].desc = 250; MET[id].gap = 0;
  if (!fp) return;
  unsigned char *b = malloc(1 << 20); size_t n = fread(b, 1, 1 << 20, fp); fclose(fp);
  if (n > 12) {
    int nt = rd16(b + 4);
    for (int i = 0; i < nt && 12 + 16 * i + 16 <= (int)n; i++) {
      const unsigned char *r = b + 12 + 16 * i;
      unsigned off = ((unsigned)r[8] << 24) | (r[9] << 16) | (r[10] << 8) | r[11];
      if (off + 12 > n) continue;
      if (!memcmp(r, "head", 4)) MET[id].upem = rd16(b + off + 18);
      if (!memcmp(r, "hhea", 4)) { MET[id].asc = (short)rd16(b + off + 4); MET[id].desc = -(short)rd16(b + off + 6); MET[id].gap = (short)rd16(b + off + 8); }
    }
  }
  free(b);
}
static Sized fonts[FONT_N][16]; static int nsized[FONT_N];

static TTF_Font *font(FontId id, int size) {
  for (int i = 0; i < nsized[id]; i++) if (fonts[id][i].size == size) return fonts[id][i].f;
  char p[1100]; snprintf(p, sizeof p, "%s/fonts/%s", dir, FILES[id]);
  if (!MET[id].upem) readMetrics(id, p);
  TTF_Font *f = TTF_OpenFont(p, size);
  if (!f) { fprintf(stderr, "font %s: %s\n", p, TTF_GetError()); return NULL; }
  TTF_SetFontHinting(f, TTF_HINTING_LIGHT);
  if (nsized[id] < 16) fonts[id][nsized[id]++] = (Sized){ size, f };
  return f;
}

Col colhex(const char *h, int a) {
  unsigned v = 0; const char *s = h[0] == '#' ? h + 1 : h;
  if (strlen(s) == 3) { char b[7] = { s[0], s[0], s[1], s[1], s[2], s[2], 0 }; v = (unsigned)strtoul(b, NULL, 16); }
  else { char b[7]; memcpy(b, s, 6); b[6] = 0; v = (unsigned)strtoul(b, NULL, 16); }
  return col((v >> 16) & 255, (v >> 8) & 255, v & 255, a);
}

bool text_init(SDL_Renderer *r, const char *assetDir) {
  R = r;
  snprintf(dir, sizeof dir, "%s", assetDir);
  if (TTF_Init() < 0) { fprintf(stderr, "TTF: %s\n", TTF_GetError()); return false; }
  return font(FONT_PIX, 16) != NULL;
}

// ---- glyphs: white textures, colored with color/alpha mod; blurred copies for soft shadows
typedef struct { FontId f; int size; Uint32 cp; int blur; SDL_Texture *t; int w, h, minx, maxy, adv, pad; } Glyph;
#define GCAP 4096
static Glyph *cache[GCAP]; static int ncache;
static unsigned ghash(FontId f, int size, Uint32 cp, int blur) { return ((unsigned)f * 2654435761u ^ (unsigned)size * 40503u ^ cp * 2246822519u ^ (unsigned)blur * 3266489917u) % GCAP; }

static SDL_Surface *blurSurface(SDL_Surface *s, int rad, int *pad) {
  // three box blurs approximate a Gaussian with sigma = rad / 2 (CSS text-shadow blur radius)
  double sigma = rad / 2.0;
  int P = (int)ceil(sigma * 3) + 1; *pad = P;
  int W = s->w + 2 * P, H = s->h + 2 * P;
  float *a = calloc((size_t)W * H, sizeof(float)), *b = calloc((size_t)W * H, sizeof(float));
  SDL_LockSurface(s);
  for (int y = 0; y < s->h; y++) for (int x = 0; x < s->w; x++) { Uint32 px = ((Uint32 *)((Uint8 *)s->pixels + y * s->pitch))[x]; a[(y + P) * W + x + P] = (float)((px >> 24) & 255); }
  SDL_UnlockSurface(s);
  int box = (int)floor(sqrt(12 * sigma * sigma / 3 + 1)); if (box < 1) box = 1;
  int r = box / 2;
  for (int pass = 0; pass < 3; pass++) {
    for (int y = 0; y < H; y++) { double acc = 0; for (int x = -r; x <= r; x++) if (x >= 0 && x < W) acc += a[y * W + x];
      for (int x = 0; x < W; x++) { b[y * W + x] = (float)(acc / (2 * r + 1)); int o = x - r, i = x + r + 1; if (o >= 0) acc -= a[y * W + o]; if (i < W) acc += a[y * W + i]; } }
    for (int x = 0; x < W; x++) { double acc = 0; for (int y = -r; y <= r; y++) if (y >= 0 && y < H) acc += b[y * W + x];
      for (int y = 0; y < H; y++) { a[y * W + x] = (float)(acc / (2 * r + 1)); int o = y - r, i = y + r + 1; if (o >= 0) acc -= b[o * W + x]; if (i < H) acc += b[i * W + x]; } }
  }
  SDL_Surface *o = SDL_CreateRGBSurfaceWithFormat(0, W, H, 32, SDL_PIXELFORMAT_ARGB8888);
  for (int y = 0; y < H; y++) for (int x = 0; x < W; x++) { int v = (int)(a[y * W + x] + 0.5); if (v > 255) v = 255; ((Uint32 *)((Uint8 *)o->pixels + y * o->pitch))[x] = ((Uint32)v << 24) | 0xffffff; }
  free(a); free(b);
  return o;
}

static Glyph *glyph(FontId f, int size, Uint32 cp, int blur) {
  unsigned h = ghash(f, size, cp, blur);
  for (unsigned i = h, k = 0; k < GCAP; k++, i = (i + 1) % GCAP) {
    Glyph *g = cache[i];
    if (!g) break;
    if (g->f == f && g->size == size && g->cp == cp && g->blur == blur) return g;
  }
  if (ncache > GCAP * 3 / 4) return NULL;
  TTF_Font *tf = font(f, size);
  if (!tf) return NULL;
  if (f != FONT_FALLBACK && !TTF_GlyphIsProvided32(tf, cp)) { TTF_Font *fb = font(FONT_FALLBACK, size); if (fb) tf = fb; }
  Glyph *g = calloc(1, sizeof *g);
  g->f = f; g->size = size; g->cp = cp; g->blur = blur;
  int minx, maxx, miny, maxy, adv;
  if (TTF_GlyphMetrics32(tf, cp, &minx, &maxx, &miny, &maxy, &adv) == 0) { g->minx = minx; g->maxy = maxy; g->adv = adv; }
  SDL_Color white = { 255, 255, 255, 255 };
  if (cp != ' ' && cp != 0xA0) {
    SDL_Surface *s = TTF_RenderGlyph32_Blended(tf, cp, white);
    if (s) {
      SDL_Surface *s2 = SDL_ConvertSurfaceFormat(s, SDL_PIXELFORMAT_ARGB8888, 0);
      SDL_FreeSurface(s);
      if (blur > 0) { SDL_Surface *b = blurSurface(s2, blur, &g->pad); SDL_FreeSurface(s2); s2 = b; }
      g->w = s2->w; g->h = s2->h;
      g->t = SDL_CreateTextureFromSurface(R, s2);
      SDL_SetTextureBlendMode(g->t, SDL_BLENDMODE_BLEND);
      SDL_FreeSurface(s2);
    }
  }
  for (unsigned i = h;; i = (i + 1) % GCAP) if (!cache[i]) { cache[i] = g; ncache++; break; }
  return g;
}

static Uint32 utf8next(const char **p) {
  const unsigned char *s = (const unsigned char *)*p;
  Uint32 c = *s;
  if (c < 0x80) { *p += 1; return c; }
  if ((c >> 5) == 6 && s[1]) { *p += 2; return ((c & 31) << 6) | (s[1] & 63); }
  if ((c >> 4) == 14 && s[1] && s[2]) { *p += 3; return ((c & 15) << 12) | ((s[1] & 63) << 6) | (s[2] & 63); }
  if ((c >> 3) == 30 && s[1] && s[2] && s[3]) { *p += 4; return ((c & 7) << 18) | ((s[1] & 63) << 12) | ((s[2] & 63) << 6) | (s[3] & 63); }
  *p += 1; return '?';
}

// line-height: normal, the way Chrome rounds it: round(ascent) + round(descent) + round(line gap)
int text_ascent(FontId f, int size) { font(f, size); return (int)floor(MET[f].asc * (double)size / MET[f].upem + 0.5); }
int text_descent(FontId f, int size) { font(f, size); return (int)floor(MET[f].desc * (double)size / MET[f].upem + 0.5); }
int text_lineh(FontId f, int size) { font(f, size); return text_ascent(f, size) + text_descent(f, size) + (int)floor(MET[f].gap * (double)size / MET[f].upem + 0.5); }

// ---- whole strings, shaped with kerning, cached as textures
typedef struct { FontId f; int size, blur; char *s; SDL_Texture *t; int w, h, pad, adv; unsigned used; } Str;
#define SCAP 1024
static Str strs[SCAP]; static unsigned useClock;
static unsigned shash(FontId f, int size, int blur, const char *s) { unsigned h = 2166136261u ^ (unsigned)f * 16777619u ^ (unsigned)size * 31u ^ (unsigned)blur * 7919u; while (*s) h = (h ^ (unsigned char)*s++) * 16777619u; return h; }
static Str *str(FontId f, int size, const char *s, int blur, bool needTex) {
  unsigned h = shash(f, size, blur, s) % SCAP;
  Str *slot = NULL;
  for (unsigned k = 0; k < 8; k++) {
    Str *e = &strs[(h + k) % SCAP];
    if (e->s && e->f == f && e->size == size && e->blur == blur && !strcmp(e->s, s)) {
      e->used = ++useClock;
      if (!needTex || e->t || !*s) return e;
      slot = e; break; // measured before, needs its texture now
    }
    if (!e->s) { slot = e; break; }
    if (!slot || e->used < slot->used) slot = e;
  }
  TTF_Font *tf = font(f, size);
  if (!tf) return NULL;
  if (!slot) slot = &strs[h];
  if (slot->s && strcmp(slot->s, s)) { free(slot->s); if (slot->t) SDL_DestroyTexture(slot->t); memset(slot, 0, sizeof *slot); }
  if (!slot->s) slot->s = strdup(s);
  slot->f = f; slot->size = size; slot->blur = blur; slot->used = ++useClock;
  int w = 0, hh = 0; TTF_SizeUTF8(tf, s, &w, &hh); slot->adv = w;
  if (needTex && *s && !slot->t) {
    SDL_Color white = { 255, 255, 255, 255 };
    SDL_Surface *sf = TTF_RenderUTF8_Blended(tf, s, white);
    if (sf) {
      SDL_Surface *s2 = SDL_ConvertSurfaceFormat(sf, SDL_PIXELFORMAT_ARGB8888, 0);
      SDL_FreeSurface(sf);
      if (blur > 0) { SDL_Surface *b = blurSurface(s2, blur, &slot->pad); SDL_FreeSurface(s2); s2 = b; }
      slot->w = s2->w; slot->h = s2->h;
      slot->t = SDL_CreateTextureFromSurface(R, s2);
      SDL_SetTextureBlendMode(slot->t, SDL_BLENDMODE_BLEND);
      SDL_FreeSurface(s2);
    }
  }
  return slot;
}

/** Split s into runs drawn by f and runs drawn by the fallback font; fn gets each run. Returns false when f has every glyph. */
typedef void (*RunFn)(FontId f, const char *run, void *ud);
static bool splitRuns(FontId f, int size, const char *s, RunFn fn, void *ud) {
  TTF_Font *tf = font(f, size);
  if (!tf || f == FONT_FALLBACK) return false;
  bool all = true;
  for (const char *p = s; *p;) { Uint32 cp = utf8next(&p); if (!TTF_GlyphIsProvided32(tf, cp)) { all = false; break; } }
  if (all) return false;
  char run[512]; int n = 0; int cur = -1;
  for (const char *p = s; *p;) {
    const char *st = p; Uint32 cp = utf8next(&p);
    int which = TTF_GlyphIsProvided32(tf, cp) ? 0 : 1;
    if (which != cur && n) { run[n] = 0; fn(cur ? FONT_FALLBACK : f, run, ud); n = 0; }
    cur = which;
    while (st < p && n < 510) run[n++] = *st++;
  }
  if (n) { run[n] = 0; fn(cur ? FONT_FALLBACK : f, run, ud); }
  return true;
}
typedef struct { int size; double w; double x, y; Col c; int blur; } RunCtx;
static void measureRun(FontId f, const char *run, void *ud) { RunCtx *c = ud; Str *e = str(f, c->size, run, 0, false); if (e) c->w += e->adv; }

double text_width(FontId f, int size, const char *s, double ls) {
  if (ls == 0) {
    RunCtx c = { size, 0, 0, 0, { 0 }, 0 };
    if (splitRuns(f, size, s, measureRun, &c)) return c.w;
    Str *e = str(f, size, s, 0, false); return e ? e->adv : 0;
  }
  TTF_Font *tf = font(f, size);
  double w = 0; Uint32 prev = 0;
  while (*s) {
    Uint32 cp = utf8next(&s);
    Glyph *g = glyph(f, size, cp, 0);
    if (!g) continue;
    if (prev && tf) w += TTF_GetFontKerningSizeGlyphs32(tf, prev, cp);
    w += g->adv + ls;
    prev = cp;
  }
  return w;
}

static void drawRun(FontId f, const char *run, void *ud) {
  RunCtx *rc = ud;
  TTF_Font *tf = font(f, rc->size);
  Str *e = str(f, rc->size, run, rc->blur, true);
  if (!e || !tf) return;
  if (e->t) {
    SDL_FRect d = { (float)floor(rc->x - e->pad + 0.5), (float)floor(rc->y - TTF_FontAscent(tf) - e->pad + 0.5), (float)e->w, (float)e->h };
    SDL_SetTextureColorMod(e->t, rc->c.r, rc->c.g, rc->c.b);
    SDL_SetTextureAlphaMod(e->t, rc->c.a);
    SDL_RenderCopyF(R, e->t, NULL, &d);
  }
  rc->x += e->adv;
}
static void drawGlyphs(FontId f, int size, double x, double y, Col c, const char *s, double ls, int blur) {
  TTF_Font *tf = font(f, size);
  if (!tf) return;
  // the line box: half the leading above the ascent (line-height: normal has none)
  double base = y + text_ascent(f, size);
  if (ls == 0) {
    RunCtx rc = { size, 0, x, base, c, blur };
    if (splitRuns(f, size, s, drawRun, &rc)) return;
    Str *e = str(f, size, s, blur, true);
    if (!e || !e->t) return;
    SDL_FRect d = { (float)floor(x - e->pad + 0.5), (float)floor(base - TTF_FontAscent(tf) - e->pad + 0.5), (float)e->w, (float)e->h };
    SDL_SetTextureColorMod(e->t, c.r, c.g, c.b);
    SDL_SetTextureAlphaMod(e->t, c.a);
    SDL_RenderCopyF(R, e->t, NULL, &d);
    return;
  }
  Uint32 prev = 0;
  double pen = x;
  while (*s) {
    Uint32 cp = utf8next(&s);
    Glyph *g = glyph(f, size, cp, blur);
    if (!g) continue;
    if (prev) pen += TTF_GetFontKerningSizeGlyphs32(tf, prev, cp);
    if (g->t) {
      // TTF_RenderGlyph renders the glyph in a box as tall as the font, with the ascent at its top
      TTF_Font *gf = TTF_GlyphIsProvided32(tf, cp) ? tf : font(FONT_FALLBACK, size);
      SDL_FRect d = { (float)floor(pen - g->pad + 0.5), (float)floor(base - TTF_FontAscent(gf ? gf : tf) - g->pad + 0.5), (float)g->w, (float)g->h };
      SDL_SetTextureColorMod(g->t, c.r, c.g, c.b);
      SDL_SetTextureAlphaMod(g->t, c.a);
      SDL_RenderCopyF(R, g->t, NULL, &d);
    }
    pen += g->adv + ls;
    prev = cp;
  }
}
void text_draw(FontId f, int size, double x, double y, Col c, const char *s, double ls) { drawGlyphs(f, size, x, y, c, s, ls, 0); }
void text_shadow(FontId f, int size, double x, double y, Col c, const char *s, double ls, double blur) {
  int b = (int)(blur + 0.5);
  if (b <= 0) { drawGlyphs(f, size, x, y, c, s, ls, 0); return; }
  // a soft shadow reads stronger in a browser than one blurred pass: draw it twice for strong ones
  drawGlyphs(f, size, x, y, c, s, ls, b);
}

// ---------------------------------------------------------------- inline layout
static void addRun(Layout *L, Style st, const char *txt, int len, double x, double w, int line) {
  if (L->n >= 96 || len <= 0) return;
  Run *r = &L->runs[L->n++];
  r->st = st; r->x = x; r->w = w; r->line = line;
  if (len > 159) len = 159;
  memcpy(r->text, txt, len); r->text[len] = 0;
}
static bool startsWith(const char *s, const char *p) { return strncmp(s, p, strlen(p)) == 0; }

void rich_layout(Layout *L, const char *html, Style base, double maxW, double lineHeight) {
  memset(L, 0, sizeof *L);
  Style stack[8]; int sp = 0;
  Style st = base;
  double x = 0; int line = 0;
  const char *p = html;
  char word[160]; int wl = 0;
  // words are laid out one at a time; a space goes with the word before it
#define FLUSH_WORD() do { if (wl) { word[wl] = 0; double ww = text_width(st.f, st.size, word, 0); \
    char trimmed[160]; int tl = wl; memcpy(trimmed, word, wl); while (tl && trimmed[tl - 1] == ' ') tl--; trimmed[tl] = 0; \
    double tw = text_width(st.f, st.size, trimmed, 0); \
    if (maxW > 0 && x > 0 && x + tw > maxW && line < 15) { line++; x = 0; } \
    addRun(L, st, word, wl, x, ww, line); x += ww; wl = 0; } } while (0)
  while (*p) {
    if (*p == '<') {
      FLUSH_WORD();
      if (startsWith(p, "<br")) { if (line < 15) line++; x = 0; }
      else if (startsWith(p, "<b>") || startsWith(p, "<b ")) { if (sp < 8) stack[sp++] = st; st.f = st.f == FONT_PIX ? FONT_PIXB : st.f; if (base.bold.a) st.c = base.bold; }
      else if (startsWith(p, "</b") || startsWith(p, "</span")) { if (sp) st = stack[--sp]; }
      else if (startsWith(p, "<span")) {
        if (sp < 8) stack[sp++] = st;
        const char *end = strchr(p, '>');
        char tag[200]; int n = end ? (int)(end - p) : (int)strlen(p); if (n > 199) n = 199; memcpy(tag, p, n); tag[n] = 0;
        char *cc = strstr(tag, "color:");
        if (cc) { cc += 6; while (*cc == ' ') cc++; st.c = colhex(cc, st.c.a); }
        if (strstr(tag, "pct")) { st.size = 20; st.c = col(255, 255, 255, st.c.a); }
        if (strstr(tag, "tag chk")) st.c = colhex("#e8a84a", st.c.a);
        else if (strstr(tag, "\"tag\"") || strstr(tag, "'tag'")) st.c = colhex("#5fd0c8", st.c.a);
      }
      const char *end = strchr(p, '>');
      p = end ? end + 1 : p + strlen(p);
      continue;
    }
    if (wl >= 150) FLUSH_WORD();
    if (*p == ' ' && ((wl && word[wl - 1] == ' ') || (!wl && L->n && x > 0 && L->runs[L->n - 1].text[strlen(L->runs[L->n - 1].text) - 1] == ' '))) { p++; continue; } // collapse spaces
    word[wl++] = *p;
    if (*p == ' ') { p++; FLUSH_WORD(); continue; }
    p++;
  }
  FLUSH_WORD();
#undef FLUSH_WORD
  L->nlines = line + 1;
  // line metrics: the tallest run sets each line's box, all runs share a baseline
  double top = 0;
  for (int l = 0; l < L->nlines; l++) {
    double asc = 0, desc = 0, lh = 0, w = 0;
    bool any = false;
    for (int i = 0; i < L->n; i++) if (L->runs[i].line == l) {
      Run *r = &L->runs[i]; any = true;
      double a = text_ascent(r->st.f, r->st.size), d = text_descent(r->st.f, r->st.size);
      double h = lineHeight > 0 ? lineHeight * r->st.size : text_lineh(r->st.f, r->st.size);
      double half = (h - (a + d)) / 2;
      if (a + half > asc) asc = a + half;
      if (d + half > desc) desc = d + half;
      if (h > lh) lh = h;
      // trailing spaces don't count toward the line's width
      char t[160]; strcpy(t, r->text); int tl = (int)strlen(t); while (tl && t[tl - 1] == ' ') tl--; t[tl] = 0;
      double e = r->x + text_width(r->st.f, r->st.size, t, 0);
      if (e > w) w = e;
    }
    if (!any) { lh = lineHeight > 0 ? lineHeight * base.size : text_lineh(base.f, base.size); asc = lh * 0.8; desc = lh * 0.2; }
    double boxH = fmax(lh, asc + desc);
    L->lineTop[l] = top; L->lineH[l] = boxH; L->lineBase[l] = top + asc; L->lineW[l] = w;
    top += boxH;
    if (w > L->w) L->w = w;
  }
  L->h = top;
}

void rich_draw(const Layout *L, double x, double y, double alpha, const Shadow *sh, int nsh, int align) {
  for (int pass = 0; pass <= nsh; pass++)
    for (int i = 0; i < L->n; i++) {
      const Run *r = &L->runs[i];
      double off = align == 1 ? (L->w - L->lineW[r->line]) / 2 : align == 2 ? L->w - L->lineW[r->line] : 0;
      TTF_Font *tf = NULL; (void)tf;
      double top = y + L->lineBase[r->line] - text_ascent(r->st.f, r->st.size) - (text_lineh(r->st.f, r->st.size) - (text_ascent(r->st.f, r->st.size) + text_descent(r->st.f, r->st.size))) / 2.0;
      double rx = x + off + r->x;
      if (pass < nsh) {
        Col c = sh[pass].c; c.a = (Uint8)(c.a * alpha * r->st.c.a / 255);
        text_shadow(r->st.f, r->st.size, rx + sh[pass].dx, top + sh[pass].dy, c, r->text, 0, sh[pass].blur);
      } else {
        Col c = r->st.c; c.a = (Uint8)(c.a * alpha);
        text_draw(r->st.f, r->st.size, rx, top, c, r->text, 0);
        if (r->st.strike) {
          char t[160]; strcpy(t, r->text); int tl = (int)strlen(t); while (tl && t[tl - 1] == ' ') tl--; t[tl] = 0;
          double w = text_width(r->st.f, r->st.size, t, 0);
          SDL_SetRenderDrawColor(R, c.r, c.g, c.b, c.a);
          SDL_FRect s = { (float)rx, (float)floor(y + L->lineBase[r->line] - r->st.size * 0.3), (float)w, 1 };
          SDL_RenderFillRectF(R, &s);
        }
      }
    }
}

// ---------------------------------------------------------------- synthesized small caps
static bool lowerToUpper(Uint32 cp, Uint32 *up) {
  if (cp >= 'a' && cp <= 'z') { *up = cp - 32; return true; }
  if (cp >= 0xE0 && cp <= 0xFE && cp != 0xF7) { *up = cp - 32; return true; }
  return false;
}
static void scWalk(FontId f, int size, double x, double y, Col c, const char *s, double ls, int blur, bool draw, double *wout) {
  TTF_Font *big = font(f, size);
  int smallSize = (int)floor(size * 0.7 + 0.5);
  TTF_Font *small = font(f, smallSize);
  if (!big || !small) { if (wout) *wout = 0; return; }
  double base = y + text_ascent(f, size);
  double pen = x;
  while (*s) {
    Uint32 cp = utf8next(&s), up;
    bool lo = lowerToUpper(cp, &up);
    int sz = lo ? smallSize : size; TTF_Font *tf = lo ? small : big;
    Glyph *g = glyph(f, sz, lo ? up : cp, draw ? blur : 0);
    if (!g) continue;
    if (draw && g->t) {
      SDL_FRect d = { (float)floor(pen - g->pad + 0.5), (float)floor(base - TTF_FontAscent(tf) - g->pad + 0.5), (float)g->w, (float)g->h };
      SDL_SetTextureColorMod(g->t, c.r, c.g, c.b);
      SDL_SetTextureAlphaMod(g->t, c.a);
      SDL_RenderCopyF(R, g->t, NULL, &d);
    }
    pen += g->adv + ls;
  }
  if (wout) *wout = pen - x;
}
double text_width_sc(FontId f, int size, const char *s, double ls) { double w; scWalk(f, size, 0, 0, col(0, 0, 0, 0), s, ls, 0, false, &w); return w; }
void text_draw_sc(FontId f, int size, double x, double y, Col c, const char *s, double ls, double blur) { scWalk(f, size, x, y, c, s, ls, (int)(blur + 0.5), true, NULL); }
