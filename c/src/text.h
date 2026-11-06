// Text for the UI: the web version's fonts (Cinzel, Pixelify Sans), glyph caching, CSS-like shadows, and a
// tiny inline layout for the bits of HTML the game writes (<b>, <br>, colored <span>s).
#ifndef BRUMA_TEXT_H
#define BRUMA_TEXT_H
#include <SDL.h>
#include <stdbool.h>

typedef enum { FONT_PIX, FONT_PIXB, FONT_CIN5, FONT_CIN7, FONT_FALLBACK, FONT_N } FontId; /* FONT_FALLBACK: glyphs the others lack (→, ☰) */
typedef struct { Uint8 r, g, b, a; } Col;
static inline Col col(int r, int g, int b, int a) { Col c = { (Uint8)r, (Uint8)g, (Uint8)b, (Uint8)a }; return c; }
Col colhex(const char *h, int a);

bool text_init(SDL_Renderer *r, const char *assetDir);
double text_width(FontId f, int size, const char *s, double letterSpacing);
int text_lineh(FontId f, int size);   /* CSS line-height: normal */
int text_ascent(FontId f, int size);
int text_descent(FontId f, int size);  /* positive */
/** Draw a line of text with its line box's top at y. */
void text_draw(FontId f, int size, double x, double y, Col c, const char *s, double letterSpacing);
/** font-variant: small-caps on a font without it, the way Chrome synthesizes it: lowercase letters become
    capitals at 70% size. */
double text_width_sc(FontId f, int size, const char *s, double letterSpacing);
void text_draw_sc(FontId f, int size, double x, double y, Col c, const char *s, double letterSpacing, double blur);
/** text-shadow with a blur radius (0 for a hard offset copy). */
void text_shadow(FontId f, int size, double x, double y, Col c, const char *s, double letterSpacing, double blur);

typedef struct { FontId f; int size; Col c; bool strike; Col bold; /* a == 0: <b> keeps the color */ } Style;
typedef struct { Style st; char text[160]; double x, w; int line; } Run;
typedef struct {
  Run runs[96]; int n;
  int nlines; double lineTop[16], lineH[16], lineBase[16], lineW[16];
  double w, h;
} Layout;
/** Lay out the HTML subset. maxW 0: no wrapping. lineHeight 0: normal, else a multiple of the font size. */
void rich_layout(Layout *L, const char *html, Style base, double maxW, double lineHeight);
typedef struct { double dx, dy, blur; Col c; } Shadow;
void rich_draw(const Layout *L, double x, double y, double alpha, const Shadow *sh, int nsh, int align /* 0 left 1 center 2 right */);

#endif
