// The overlay UI (index.html + style.css + ui.js in the web version), drawn with SDL at window resolution.
#ifndef BRUMA_UI_H
#define BRUMA_UI_H
#include <SDL.h>
#include "game.h"

bool ui_init(SDL_Renderer *r, const char *assetDir);
void ui_update(double dt);
void ui_draw(void);
/** Mouse over the UI: true when a UI element takes it (the canvas doesn't see it). */
bool ui_captures(int x, int y);
bool ui_mousedown(int x, int y, int button);
void ui_mouseup(int x, int y, int button);
void ui_mousemove(int x, int y);
bool ui_wants_hand(void);

// screens
enum { TITLE_LOADING, TITLE_READY, TITLE_HIDDEN };
extern int ui_title;
extern bool ui_corner, ui_pause, ui_gameover;
void ui_syncMute(bool muted);

// called back by the UI
void main_begin(void);
void main_selectLeader(int i);
void main_setPaused(bool p);
void main_reload(void);
void dialogue_text_click(void);
void dice_click(void);
#endif
