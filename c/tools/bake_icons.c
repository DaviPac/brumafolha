// Bakes the emoji the web version uses as hotbar/menu icons into small BMPs (assets/icons), so the game
// needs no emoji font at run time. Build: cc bake_icons.c $(pkg-config --cflags --libs sdl2 SDL2_ttf)
#include <SDL.h>
#include <SDL_ttf.h>
#include <stdio.h>
static const struct { const char *name; Uint32 cp; } ICONS[] = {
  {"potion", 0x1F9EA}, {"swap", 0x1F501}, {"attack", 0x2694}, {"cleave", 0x1F300}, {"wind", 0x1F4A8},
  {"fire", 0x1F525}, {"sparkles", 0x2728}, {"heart", 0x1F49A}, {"coin", 0x1FA99}, {"sound", 0x1F50A}, {"muted", 0x1F507},
};
int main(int argc, char **argv) {
  const char *font = argc > 1 ? argv[1] : "/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf";
  const char *out = argc > 2 ? argv[2] : "../assets/icons";
  const int S = 64;
  SDL_Init(0); TTF_Init();
  TTF_Font *f = TTF_OpenFont(font, 109);
  if (!f) { fprintf(stderr, "%s\n", TTF_GetError()); return 1; }
  for (size_t i = 0; i < sizeof ICONS / sizeof *ICONS; i++) {
    SDL_Color w = {255, 255, 255, 255};
    SDL_Surface *g = TTF_RenderGlyph32_Blended(f, ICONS[i].cp, w);
    if (!g) { fprintf(stderr, "%s: %s\n", ICONS[i].name, TTF_GetError()); continue; }
    SDL_Surface *g32 = SDL_ConvertSurfaceFormat(g, SDL_PIXELFORMAT_ARGB8888, 0);
    SDL_Surface *o = SDL_CreateRGBSurfaceWithFormat(0, S, S, 32, SDL_PIXELFORMAT_ARGB8888);
    SDL_SetSurfaceBlendMode(g32, SDL_BLENDMODE_NONE);
    // fit the glyph's box into S x S, keeping its aspect
    int gw = g32->w, gh = g32->h; float k = (float)S / (gw > gh ? gw : gh);
    SDL_Rect dst = {(int)((S - gw * k) / 2), (int)((S - gh * k) / 2), (int)(gw * k), (int)(gh * k)};
    SDL_BlitScaled(g32, NULL, o, &dst);
    char path[512]; snprintf(path, sizeof path, "%s/%s.bmp", out, ICONS[i].name);
    SDL_SaveBMP(o, path);
    printf("%s %dx%d\n", path, gw, gh);
    SDL_FreeSurface(g); SDL_FreeSurface(g32); SDL_FreeSurface(o);
  }
  TTF_Quit(); SDL_Quit();
  return 0;
}
