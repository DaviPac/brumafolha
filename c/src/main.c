// Brumafolha: boot, the world, exploring, and drawing it all (main.js).
#include "game.h"
#include "ui.h"
#include <SDL.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <time.h>

GameState G;
static SDL_Window *win;
static SDL_Renderer *ren;
static SDL_Texture *viewTex; static int viewW, viewH;
static Img view; // the low-res canvas
static Img ground, mist, vignette, fgLeft, fgRight;
static Sparkle *sparkles; static int nsparkles;
static TallGrass grassArt[6];
typedef struct { char key[32]; Art *a; } ArtEntry; // each Art has its own allocation: objects keep pointers to it
static ArtEntry *arts; static int narts, caparts;
static Img shadows[64]; static bool hasShadow[64];
typedef struct { bool bf; double x, y, ph, r, sp; RGBA8 c0, c1; } Critter;
static Critter critters[100]; static int ncritters;
static char **gArgv;

Unit *lead(void) { return G.party[G.leader]; }
int livingCount(Unit **list, int n) { int k = 0; for (int i = 0; i < n; i++) if (list[i]->hp > 0) k++; return k; }

// ---------------------------------------------------------------- boot
static Art makeArt(const Obj *o) {
  int seed = o->seed < 0 ? 1 : o->seed;
  switch (o->kind) {
    case O_TREE: return makeTree(seed);
    case O_PINE: return makePine(seed);
    case O_DEADTREE: return makeDeadTree(seed);
    case O_ROCK: return makeRock(seed, false);
    case O_WATERROCK: return makeRock(seed, true);
    case O_BUSH: return makeBush(seed);
    case O_FERN: return makeFern(seed);
    case O_WALL: return makeWall(o->h, o->seed, o->seed % 3 == 0);
    case O_PILLAR: return makePillar(o->h, o->seed);
    case O_RUBBLE: return makeRubble(seed);
    case O_POST: return makePost(o->h);
    case O_TENT: return makeTent(o->color);
    case O_LOG: return makeLog();
    case O_CRATE: return makeCrate();
    case O_BARREL: return makeBarrel();
    case O_ROWBOAT: return makeRowboat();
    case O_CAMPFIRE: return makeCampfireBase();
    case O_BANNER: return makeBanner();
    case O_BONES: return makeBones(seed);
  }
  Art a; memset(&a, 0, sizeof a); return a;
}
static const char *KIND_NAMES[] = { "campfire", "tent", "log", "crate", "barrel", "post", "rowboat", "rubble", "wall", "pillar", "banner", "bones",
  "tree", "pine", "deadtree", "rock", "waterrock", "bush", "fern" };
static Art *propArt(const Obj *o) {
  char key[32];
  switch (o->kind) {
    case O_TREE: case O_PINE: case O_DEADTREE: case O_ROCK: case O_BUSH: case O_FERN: case O_WATERROCK: case O_RUBBLE: case O_BONES:
      if (o->seed < 0) snprintf(key, sizeof key, "%sundefined", KIND_NAMES[o->kind]); else snprintf(key, sizeof key, "%s%d", KIND_NAMES[o->kind], o->seed); break;
    case O_WALL: snprintf(key, sizeof key, "wall%d-%d", o->h, o->seed % 7); break;
    case O_PILLAR: snprintf(key, sizeof key, "pillar%d-%d", o->h, o->seed); break;
    case O_POST: snprintf(key, sizeof key, "post%d", o->h); break;
    case O_TENT: snprintf(key, sizeof key, "tent%d", o->color); break;
    default: snprintf(key, sizeof key, "%s", KIND_NAMES[o->kind]);
  }
  for (int i = 0; i < narts; i++) if (!strcmp(arts[i].key, key)) return arts[i].a;
  if (narts == caparts) { caparts = caparts ? caparts * 2 : 256; arts = realloc(arts, sizeof(ArtEntry) * caparts); }
  snprintf(arts[narts].key, sizeof arts[narts].key, "%s", key);
  arts[narts].a = malloc(sizeof(Art));
  *arts[narts].a = makeArt(o);
  return arts[narts++].a;
}
static Img *shadowOf(double r) {
  int k = (int)JSROUND(r);
  if (k < 0 || k >= 64) k = 0;
  if (!hasShadow[k]) { shadows[k] = makeShadow(k); hasShadow[k] = true; }
  return &shadows[k];
}
// tileable soft mist
static Img makeMist(void) {
  const int S = 160, P = 8;
  Img im = img_new(S, S);
  for (int y = 0; y < S; y++) for (int x = 0; x < S; x++) {
    double fx = ((double)x / S) * P, fy = ((double)y / S) * P; int xi = (int)floor(fx), yi = (int)floor(fy); double u = fx - xi, v = fy - yi;
#define VAL(a, b) hash2((((a) % P) + P) % P, (((b) % P) + P) % P, 77)
#define SM(t) ((t) * (t) * (3 - 2 * (t)))
    double n = VAL(xi, yi) * (1 - SM(u)) * (1 - SM(v)) + VAL(xi + 1, yi) * SM(u) * (1 - SM(v)) + VAL(xi, yi + 1) * (1 - SM(u)) * SM(v) + VAL(xi + 1, yi + 1) * SM(u) * SM(v);
#undef VAL
#undef SM
    uint8_t *p = im.px + ((size_t)y * S + x) * 4;
    p[0] = 190; p[1] = 210; p[2] = 215; p[3] = u8c(fmax(0, n - 0.45) * 160);
  }
  return im;
}
// dark branches framing the bottom of the screen
static Img silhouette(int seed) {
  Art t = makeDeadTree(seed);
  Img im = t.img;
  for (int i = 0; i < im.w * im.h; i++) if (im.px[i * 4 + 3]) {
    int l = im.px[i * 4] + im.px[i * 4 + 1];
    im.px[i * 4] = l > 150 ? 44 : 26; im.px[i * 4 + 1] = l > 150 ? 22 : 14; im.px[i * 4 + 2] = l > 150 ? 46 : 30;
  }
  return im;
}

// ---------------------------------------------------------------- the cast
static Character *chars[SPEC_N + 1];
static Spec tomeSpec;
static Unit *unit(int spec, int tx, int ty) {
  Unit *u = calloc(1, sizeof *u);
  const Spec *s = spec == SPEC_N ? &tomeSpec : &SPECS[spec];
  if (!chars[spec]) chars[spec] = buildCharacter(s);
  u->ch = chars[spec]; u->portrait = portrait(u->ch, 4);
  u->dir = 0; u->pose = POSE_IDLE; u->speed = 82; u->level = 1; u->nextXp = 300;
  tileCenter(tx, ty, &u->x, &u->y);
  return u;
}
static void stats(Unit *u, int maxHp, int ac, int atk, const char *dmg, int move, int dex) {
  u->maxHp = maxHp; u->hp = maxHp; u->ac = ac; u->atk = atk; snprintf(u->dmg, sizeof u->dmg, "%s", dmg); u->move = move; u->dex = dex;
}
static Unit *gob(int tx, int ty, int group, const char *name) {
  Unit *u = unit(SPEC_GOBLIN, tx, ty);
  u->name = name ? name : "Goblin"; u->team = TEAM_ENEMY; u->key = "";
  stats(u, 7, 13, 4, "1d6+2", 6, 2); u->group = group; u->xpValue = 50;
  return u;
}
static void spawnCast(void) {
  Unit *k = unit(SPEC_HERO, 15, 38);
  k->key = "hero"; k->name = "Kael"; k->cls = "Guerreiro"; k->team = TEAM_PARTY; stats(k, 26, 16, 5, "1d8+3", 6, 1); k->hpPerLevel = 8;
  int ka[] = { AB_ATTACK, AB_CLEAVE, AB_SECONDWIND, AB_POTION }; memcpy(k->abilities, ka, sizeof ka); k->nab = 4;
  k->skills[0].name = "Persuasão"; k->skills[0].v = 3; k->skills[1].name = "Atletismo"; k->skills[1].v = 5; k->nskills = 2;
  Unit *l = unit(SPEC_MAGE, 14, 39);
  l->key = "mage"; l->name = "Lyra"; l->cls = "Maga élfica"; l->team = TEAM_PARTY; stats(l, 16, 12, 5, "1d6+1", 6, 3); l->maxSlots = 3; l->slots = 3; l->hpPerLevel = 5;
  int la[] = { AB_FIREBOLT, AB_MISSILES, AB_HEAL, AB_ATTACK, AB_POTION }; memcpy(l->abilities, la, sizeof la); l->nab = 5;
  l->skills[0].name = "Intuição"; l->skills[0].v = 4; l->skills[1].name = "Arcanismo"; l->skills[1].v = 5; l->nskills = 2;
  G.party[0] = k; G.party[1] = l; G.nparty = 2;

  G.nenemies = 0;
  G.enemies[G.nenemies++] = gob(21, 21, 1, NULL);
  G.enemies[G.nenemies++] = gob(23, 22, 1, "Goblin batedor");
  G.enemies[G.nenemies++] = gob(17, 9, 2, NULL);
  Unit *archer = gob(23, 9, 2, "Goblin arqueiro");
  G.enemies[G.nenemies++] = archer;
  Unit *sh = unit(SPEC_SHAMAN, 20, 5);
  sh->name = "Xamã Fumacento"; sh->key = ""; sh->team = TEAM_ENEMY; stats(sh, 10, 12, 4, "1d4+1", 5, 1); sh->group = 2; sh->xpValue = 75;
  sh->hasRanged = true; sh->ranged.range = 8; snprintf(sh->ranged.dmg, sizeof sh->ranged.dmg, "1d8+1"); sh->ranged.name = "Chama Imunda"; sh->ranged.pal = PAL_EMBER;
  G.enemies[G.nenemies++] = sh;
  Unit *ch = unit(SPEC_CHIEF, 21, 6);
  ch->name = "Gorza, o Chefe"; ch->key = ""; ch->team = TEAM_ENEMY; stats(ch, 24, 15, 5, "1d10+3", 5, 0); ch->group = 2; ch->xpValue = 150; ch->boss = true;
  G.enemies[G.nenemies++] = ch;
  archer->hasRanged = true; archer->ranged.range = 7; snprintf(archer->ranged.dmg, sizeof archer->ranged.dmg, "1d6+2"); archer->ranged.name = "Flecha"; archer->ranged.pal = PAL_WOOD;

  tomeSpec = SPECS[SPEC_HERO];
  { const char *h[] = { "#8a5a1a", "#b8802a", "#dca848", "#f0c868" }; ramp_hex(tomeSpec.hair, 4, h); tomeSpec.nhair = 4; }
  { const char *h[] = { "#2a3a2a", "#3e5a3a", "#5a7a4a", "#7a9a5a" }; ramp_hex(tomeSpec.tunic, 4, h); tomeSpec.ntunic = 4; }
  tomeSpec.ncape = 0; tomeSpec.weapon = W_NONE; tomeSpec.small = true;
  Unit *m = unit(SPEC_MAREN, 36, 26);
  m->key = "maren"; m->name = "Maren, a pescadora"; m->team = TEAM_NPC; stats(m, 10, 10, 0, "1d4", 0, 0); m->talk = 1;
  Unit *t = unit(SPEC_N, 26, 11);
  t->key = "tome"; t->name = "Tomé"; t->team = TEAM_NPC; stats(t, 6, 10, 0, "1d4", 0, 0); t->talk = 2; t->dir = 0;
  G.npcs[0] = m; G.npcs[1] = t; G.nnpcs = 2;
  G.npcs[0]->dir = 0;
  G.chests[0] = (Chest){ 27 * TILE + 16, 11 * TILE + 26, false, 2, 30, "Baú dos goblins" };
  G.chests[1] = (Chest){ 10 * TILE + 16, 38 * TILE + 26, false, 1, 5, "Baú de suprimentos" };
  G.nchests = 2;
  for (int i = 0; i < 2; i++) G.W.block[(int)floor((G.chests[i].y - 1) / TILE) * MW + (int)floor(G.chests[i].x / TILE)] = 1;
  G.chestArt[0] = makeChest(false); G.chestArt[1] = makeChest(true);
  Unit *ld = lead();
  G.cam.x = ld->x - 320; G.cam.y = ld->y - 180;
}

// ---------------------------------------------------------------- hooks used by other modules
static void levelUpLater(void *a, void *b, int n) {
  Unit *p = a; char t[80]; snprintf(t, sizeof t, "%s alcançou o nível %d!", p->name, n);
  toast(t, 2.2); sfx_levelUp();
  FxOpts o = fxo(p->x, p->y + 2); o.palette = PAL_HOLY; fx_spawn(FX_BLOOM, o);
}
void hook_gainXp(Unit *p, int xp) {
  p->xp += xp;
  while (p->xp >= p->nextXp) {
    p->level++; p->maxHp += p->hpPerLevel; p->hp = p->maxHp; p->nextXp = (int)JSROUND(p->nextXp * 2.6);
    if (!strcmp(p->key, "hero")) p->atk++;
    if (!strcmp(p->key, "mage")) { p->maxSlots++; p->slots = p->maxSlots; }
    after(1.8, levelUpLater, p, NULL, p->level);
  }
  updateParty();
}
void hook_combatStart(void) { tooltip(NULL); }
static void ruinsBanner(void *a, void *b, int n) { banner("Ruínas libertadas"); }
void hook_combatEnd(int group) {
  G.focus = NULL;
  if (group == 2) { if (G.quest.stage < 2) G.quest.stage = G.quest.stage > 2 ? G.quest.stage : 2; G.quest.ruinsDone = true; after(1.5, ruinsBanner, NULL, NULL, 0); }
  if (group == 1) { G.quest.patrolDone = true; if (G.quest.patrolSeen < 0) G.quest.patrolSeen = 1; }
  updateQuest();
  exploreHotbar();
}
void hook_questDone(void) {
  if (G.quest.stage >= 3) return;
  G.quest.stage = 3; G.gold += 50;
  for (int i = 0; i < G.nparty; i++) hook_gainXp(G.party[i], 100);
  toast("Missão concluída: Goblins de Velmoor  ·  +100 XP  ·  +50 ouro", 4);
  sfx_quest();
}
void hook_tomeLeaves(void) {
  Unit *t = G.npcs[1];
  G.quest.grandson = true;
  fx_spawn(FX_POOF, fxo(t->x, t->y));
  tileCenter(37, 27, &t->x, &t->y);
  updateQuest();
}
void hook_gameOver(void) { playMusic(MUS_NONE, 0.6); sfx_defeat(); ui_gameover = true; }
void hook_afterDialogue(void) { exploreHotbar(); }

static int trailN; static double trail[120][3];
void main_selectLeader(int i) {
  if (G.mode != MODE_EXPLORE || G.party[i]->hp <= 0) return;
  G.leader = i;
  trailN = 0;
  updateParty();
  exploreHotbar();
}
static void usePotion(int arg) {
  Unit *u = lead();
  G.potions--;
  int r = 2 + (int)ceil(mrand() * 4) + (int)ceil(mrand() * 4);
  u->hp = u->hp + r > u->maxHp ? u->maxHp : u->hp + r;
  char s[16]; snprintf(s, sizeof s, "+%d", r);
  floater(u->x, u->y - 34, s, FL_HEAL);
  fx_spawn(FX_BLOOM, fxo(u->x, u->y + 2));
  updateParty(); exploreHotbar();
}
static void swapLeader(int arg) { main_selectLeader((G.leader + 1) % G.nparty); }
void exploreHotbar(void) {
  if (G.mode == MODE_COMBAT) return;
  Unit *u = lead();
  HotbarEntry e[2]; memset(e, 0, sizeof e);
  e[0].icon = "potion"; snprintf(e[0].name, sizeof e[0].name, "Poção de Cura");
  snprintf(e[0].desc, sizeof e[0].desc, "Recupera 2d4+2 PV de %s. Você tem %d.", u->name, G.potions);
  e[0].count = G.potions; e[0].off = G.potions <= 0 || u->hp >= u->maxHp; e[0].use = usePotion;
  e[1].icon = "swap"; snprintf(e[1].name, sizeof e[1].name, "Trocar líder"); snprintf(e[1].desc, sizeof e[1].desc, "Controla o outro personagem (Tab).");
  e[1].count = -1; e[1].use = swapLeader;
  buildHotbar(e, 2, EXTRA_GOLD);
}

// ---------------------------------------------------------------- explore: movement and interaction
enum { IT_NPC, IT_CHEST, IT_FIRE };
typedef struct { double x, y, r; const char *name; int kind; void *ent; } Interact;
static Interact pending; static bool hasPending;
static bool wb(int x, int y, void *ctx) { return wblocked(&G.W, x, y); }

static bool walkTo(Unit *u, double wx, double wy) {
  int sx, sy; tileOf(u, &sx, &sy);
  int gx = (int)floor(wx / TILE), gy = (int)floor((wy - 1) / TILE);
  if (wblocked(&G.W, gx, gy)) {
    bool have = false; int bx = 0, by = 0; double bd = 0;
    for (int dy = -1; dy <= 1; dy++) for (int dx = -1; dx <= 1; dx++) {
      if (wblocked(&G.W, gx + dx, gy + dy)) continue;
      double d = hypot(gx + dx - sx, gy + dy - sy);
      if (!have || d < bd) { have = true; bx = gx + dx; by = gy + dy; bd = d; }
    }
    if (!have) return false;
    gx = bx; gy = by;
  }
  static TilePt p[MAXPATH];
  int n = findPath(wb, NULL, sx, sy, gx, gy, p, MAXPATH);
  if (n < 0) return false;
  u->npath = n;
  for (int i = 0; i < n; i++) tileCenter(p[i].x, p[i].y, &u->path[i][0], &u->path[i][1]);
  if (n && (int)floor(wx / TILE) == gx && (int)floor((wy - 1) / TILE) == gy && !wblocked(&G.W, gx, gy)) { u->path[n - 1][0] = wx; u->path[n - 1][1] = wy; }
  u->speed = 90;
  return true;
}

static int interactables(Interact *out) {
  int n = 0;
  for (int i = 0; i < G.nnpcs; i++) if (!G.npcs[i]->gone) out[n++] = (Interact){ G.npcs[i]->x, G.npcs[i]->y, 14, G.npcs[i]->name, IT_NPC, G.npcs[i] };
  for (int i = 0; i < G.nchests; i++) if (!G.chests[i].open) out[n++] = (Interact){ G.chests[i].x, G.chests[i].y, 14, G.chests[i].name, IT_CHEST, &G.chests[i] };
  for (int i = 0; i < G.W.nobj; i++) { Obj *o = &G.W.objects[i]; if (o->kind == O_CAMPFIRE && !o->goblin) out[n++] = (Interact){ o->x, o->y, 16, "Fogueira (descansar)", IT_FIRE, o }; }
  return n;
}
static bool underMouse(Interact *out) {
  Interact L[16]; int n = interactables(L);
  for (int i = 0; i < n; i++) if (fabs(G.mouse.wx - L[i].x) < L[i].r && G.mouse.wy < L[i].y + 4 && G.mouse.wy > L[i].y - 34) { *out = L[i]; return true; }
  return false;
}
static void talk(Unit *n) {
  Unit *l = lead();
  n->dir = fabs(l->x - n->x) > fabs(l->y - n->y) ? (l->x < n->x ? 1 : 2) : l->y < n->y ? 3 : 0;
  openDialogue(n, n->talk);
}
static void openChest(Chest *c) {
  c->open = true;
  G.potions += c->potions; G.gold += c->gold;
  FxOpts o = fxo(c->x, c->y - 12); o.palette = PAL_GOLD; fx_spawn(FX_HITSPARK, o);
  sfx_chest();
  char t[120]; snprintf(t, sizeof t, "%s: +%d poção, +%d ouro", c->name, c->potions, c->gold);
  toast(t, 2.2);
  exploreHotbar();
}
static void rest(void) {
  for (int i = 0; i < G.nenemies; i++) if (G.enemies[i]->hp > 0 && distd(G.enemies[i]->x, G.enemies[i]->y, lead()->x, lead()->y) < 400) { toast("Não dá pra descansar com inimigos por perto.", 2.2); return; }
  for (int i = 0; i < G.nparty; i++) {
    Unit *p = G.party[i];
    p->hp = p->maxHp; p->slots = p->maxSlots; memset(p->restUsed, 0, sizeof p->restUsed);
    FxOpts o = fxo(p->x, p->y + 2); o.palette = PAL_HOLY; fx_spawn(FX_BLOOM, o);
  }
  toast("Descanso longo: vida e magias restauradas.", 2.2);
  sfx_rest();
  updateParty();
}
static void act(const Interact *it) {
  if (it->kind == IT_NPC) talk(it->ent);
  else if (it->kind == IT_CHEST) openChest(it->ent);
  else rest();
}
static bool nearestInteractable(Interact *out) {
  Unit *l = lead();
  Interact L[16]; int n = interactables(L); bool have = false; double bd = 0;
  for (int i = 0; i < n; i++) { double d = distd(L[i].x, L[i].y, l->x, l->y); if (d < 52 && (!have || d < bd)) { have = true; bd = d; *out = L[i]; } }
  return have;
}

static struct { double x, y, t; bool on; } clickMark;
static void onClick(void) {
  if (G.mode == MODE_COMBAT) { combatClick(G.mouse.tx, G.mouse.ty); return; }
  if (G.mode != MODE_EXPLORE) return;
  Unit *l = lead();
  Interact it;
  if (underMouse(&it)) {
    if (distd(it.x, it.y, l->x, l->y) < 48) { act(&it); return; }
    pending = it; hasPending = true;
    walkTo(l, it.x, it.y + 8);
    return;
  }
  hasPending = false;
  if (walkTo(l, G.mouse.wx, G.mouse.wy)) { clickMark.x = G.mouse.wx; clickMark.y = G.mouse.wy; clickMark.t = 0.5; clickMark.on = true; }
}

// ---------------------------------------------------------------- input
static bool keys[512];
static bool keyDown(SDL_Keycode k) { int s = SDL_GetScancodeFromKey(k); return s > 0 && s < 512 && keys[s]; }
static void setMouse(int x, int y) {
  G.mouse.x = x; G.mouse.y = y; G.mouse.in = true;
  G.mouse.wx = G.cam.x + G.mouse.x / G.scale; G.mouse.wy = G.cam.y + G.mouse.y / G.scale;
  G.mouse.tx = (int)floor(G.mouse.wx / TILE); G.mouse.ty = (int)floor(G.mouse.wy / TILE);
}
static void resize(void) {
  int w, h; SDL_GetRendererOutputSize(ren, &w, &h);
  G.winW = w; G.winH = h;
  int s = h >= 1000 ? 3 : h >= 520 ? 2 : 1;
  G.scale = s;
  G.vw = (w + s - 1) / s; G.vh = (h + s - 1) / s;
  if (view.w != G.vw || view.h != G.vh) {
    img_free(&view); view = img_new(G.vw, G.vh);
    if (viewTex) SDL_DestroyTexture(viewTex);
    viewTex = SDL_CreateTexture(ren, SDL_PIXELFORMAT_RGBA32, SDL_TEXTUREACCESS_STREAMING, G.vw, G.vh);
    SDL_SetTextureScaleMode(viewTex, SDL_ScaleModeNearest);
    viewW = G.vw; viewH = G.vh;
    fx_resize(G.vw, G.vh);
  }
}

// ---------------------------------------------------------------- update
static void stepAlongPath(Unit *u, double dt) {
  if (!u->npath) { u->moving = false; return; }
  double tx = u->path[0][0], ty = u->path[0][1];
  double dx = tx - u->x, dy = ty - u->y, d = hypot(dx, dy), s = u->speed * dt;
  if (fabs(dx) > 0.5 || fabs(dy) > 0.5) u->dir = fabs(dx) > fabs(dy) * 1.1 ? (dx < 0 ? 1 : 2) : dy < 0 ? 3 : 0;
  if (d <= s) {
    u->x = tx; u->y = ty;
    memmove(u->path, u->path + 1, sizeof(u->path[0]) * (u->npath - 1)); u->npath--;
    if (!u->npath) { u->moving = false; volatile int *f = u->onArrive; u->onArrive = NULL; if (f) *f = 1; }
  } else { u->x += (dx / d) * s; u->y += (dy / d) * s; u->moving = true; }
}
static bool canStand(double x, double y) {
  const int O[4][2] = { { -5, -2 }, { 5, -2 }, { -5, -8 }, { 5, -8 } };
  for (int i = 0; i < 4; i++) if (wblocked(&G.W, (int)floor((x + O[i][0]) / TILE), (int)floor((y + O[i][1]) / TILE))) return false;
  return true;
}

// audio
static int surfaceAt(double x, double y) {
  int t = tileAt(&G.W, (int)floor(x / TILE), (int)floor((y - 2) / TILE));
  return t == T_DOCK ? SURF_WOOD : t == T_STONE ? SURF_STONE : t == T_PATH ? SURF_DIRT : t == T_WATER ? SURF_WATER : SURF_GRASS;
}
static void updateAudio(double dt) {
  if (G.mode == MODE_TITLE) return;
  Unit *l = lead();
  bool ruins = !strcmp(zoneAt(l->x, l->y), "Ruínas de Velmoor");
  playMusic(G.mode == MODE_COMBAT ? MUS_COMBAT : G.mode == MODE_OVER ? MUS_NONE : ruins ? MUS_RUINS : MUS_MEADOW, G.mode == MODE_COMBAT ? 0.5 : 2.5);
  double w = waterField(l->x, l->y), fire = 0;
  for (int i = 0; i < G.W.nobj; i++) if (G.W.objects[i].kind == O_CAMPFIRE) fire = fmax(fire, 1 - distd(G.W.objects[i].x, G.W.objects[i].y, l->x, l->y) / 220);
  AmbLevels lv = { ruins ? 1 : 0.7, clampd(1 - w / 1.1, 0, 1), fire, ruins || G.mode == MODE_COMBAT ? 0 : 1, ruins ? 1 : 0 };
  updateAmbience(lv, dt, G.time);
  // footsteps: one every ~20 px walked, quieter for everyone but the leader
  for (int i = 0; i < G.nparty + G.nenemies; i++) {
    Unit *u = i < G.nparty ? G.party[i] : G.enemies[i - G.nparty];
    if (u->hp <= 0) continue;
    double d = !u->hasS ? 0 : distd(u->sx_, u->sy_, u->x, u->y);
    u->sx_ = u->x; u->sy_ = u->y; u->hasS = true;
    if (d > 30) { u->stepAcc = 0; continue; } // teleport / snap
    u->stepAcc += d;
    if (u->stepAcc > 20) {
      u->stepAcc = 0;
      bool onScreen = u->x > G.cam.x - 20 && u->x < G.cam.x + G.vw + 20 && u->y > G.cam.y - 20 && u->y < G.cam.y + G.vh + 20;
      if (onScreen) sfx_step(surfaceAt(u->x, u->y), u == l ? 1 : u->team == TEAM_PARTY ? 0.55 : 0.7);
    }
  }
}

void main_setPaused(bool p) {
  if (G.mode == MODE_TITLE || G.mode == MODE_OVER) p = false;
  G.paused = p;
  memset(keys, 0, sizeof keys);
  tooltip(NULL);
  ui_pause = p;
  sfx_click();
}

static void beginToast(void *a, void *b, int n) { if (G.mode == MODE_EXPLORE) toast("Maren, a pescadora, espera no cais a leste.", 3.5); }
static const char *zoneNow = ""; static double zoneT;
void main_begin(void) {
  initAudio();
  ui_corner = true; ui_syncMute(audioSet.muted);
  ui_title = TITLE_HIDDEN;
  G.mode = MODE_EXPLORE;
  buildParty();
  updateQuest();
  exploreHotbar();
  zoneNow = "";
  after(3.6, beginToast, NULL, NULL, 0);
}
void main_reload(void) {
  // location.reload(): start over from a fresh process
  audio_shutdown();
  SDL_Quit();
  execv("/proc/self/exe", gArgv);
  execvp(gArgv[0], gArgv);
  exit(0);
}

static void update(double dt) {
  G.time += dt;
  if (G.hitstop > 0) { G.hitstop -= dt; return; }
  fx_update(dt);
  Unit *l = lead();
  if (G.mode == MODE_EXPLORE) {
    // keyboard walking
    int mxk = 0, myk = 0;
    if (keyDown(SDLK_w) || keyDown(SDLK_UP)) myk--;
    if (keyDown(SDLK_s) || keyDown(SDLK_DOWN)) myk++;
    if (keyDown(SDLK_a) || keyDown(SDLK_LEFT)) mxk--;
    if (keyDown(SDLK_d) || keyDown(SDLK_RIGHT)) mxk++;
    if (mxk || myk) {
      l->npath = 0; hasPending = false;
      double k = 88 * dt / hypot(mxk, myk);
      if (canStand(l->x + mxk * k, l->y)) l->x += mxk * k;
      if (canStand(l->x, l->y + myk * k)) l->y += myk * k;
      l->dir = mxk ? (mxk < 0 ? 1 : 2) : myk < 0 ? 3 : 0;
      l->moving = true;
    } else stepAlongPath(l, dt);
    if (hasPending && !l->npath) { if (distd(pending.x, pending.y, l->x, l->y) < 56) act(&pending); hasPending = false; }
    // the trail the others follow
    if (!trailN || distd(trail[0][0], trail[0][1], l->x, l->y) > 3) {
      if (trailN < 120) trailN++;
      memmove(trail + 1, trail, sizeof(trail[0]) * (trailN - 1));
      trail[0][0] = l->x; trail[0][1] = l->y; trail[0][2] = l->dir;
    }
    for (int i = 0; i < G.nparty; i++) {
      Unit *p = G.party[i];
      if (p == l) continue;
      double want = 22 * (i < G.leader ? i + 1 : i);
      double acc = 0; int target = -1;
      for (int j = 1; j < trailN; j++) { acc += distd(trail[j][0], trail[j][1], trail[j - 1][0], trail[j - 1][1]); if (acc >= want) { target = j; break; } }
      p->npath = 0;
      if (distd(p->x, p->y, l->x, l->y) > 260) { p->x = l->x - 12; p->y = l->y + 4; trailN = 0; continue; }
      if (target < 0) { p->moving = false; continue; }
      double dx = trail[target][0] - p->x, dy = trail[target][1] - p->y, d = hypot(dx, dy);
      if (d > 1.5) {
        double s = fmin(d, fmax(88, d * 4) * dt);
        p->x += (dx / d) * s; p->y += (dy / d) * s; p->moving = true;
        p->dir = fabs(dx) > fabs(dy) ? (dx < 0 ? 1 : 2) : dy < 0 ? 3 : 0;
      } else p->moving = false;
    }
    // enemies notice you (G.groups: patrol, then ruins)
    for (int g = 1; g <= 2; g++) {
      bool any = false;
      for (int i = 0; i < G.nenemies; i++) if (G.enemies[i]->group == g && G.enemies[i]->hp > 0) any = true;
      if (!any) continue;
      double r = g == 2 ? 6.5 * TILE : 5 * TILE;
      bool seen = false;
      for (int i = 0; i < G.nenemies && !seen; i++) {
        Unit *e = G.enemies[i];
        if (e->group != g || e->hp <= 0) continue;
        for (int j = 0; j < G.nparty; j++) if (G.party[j]->hp > 0 && distd(G.party[j]->x, G.party[j]->y, e->x, e->y) < r) { seen = true; break; }
      }
      if (seen) {
        for (int i = 0; i < G.nenemies; i++) if (G.enemies[i]->group == g) G.enemies[i]->alert = 0.8;
        startCombat(g);
        break;
      }
    }
    // zone names
    if ((zoneT -= dt) < 0) {
      zoneT = 0.5;
      const char *z = zoneAt(l->x, l->y);
      if (strcmp(z, zoneNow)) { zoneNow = z; banner(z); }
    }
  } else if (G.mode == MODE_COMBAT) {
    for (int i = 0; i < G.nparty + G.nenemies; i++) stepAlongPath(i < G.nparty ? G.party[i] : G.enemies[i - G.nparty], dt);
  }
  for (int i = 0; i < G.nparty + G.nenemies + G.nnpcs; i++) {
    Unit *u = i < G.nparty ? G.party[i] : i < G.nparty + G.nenemies ? G.enemies[i - G.nparty] : G.npcs[i - G.nparty - G.nenemies];
    u->animT += dt;
    if (u->poseT > 0) u->poseT -= dt; else u->pose = POSE_IDLE;
    if (u->flashT > 0) u->flashT -= dt;
    if (u->lunge) { u->lungeT -= dt; if (u->lungeT <= 0) u->lunge = false; }
    if (u->knock) { u->knockT -= dt; if (u->knockT <= 0) u->knock = false; }
    if (u->alert > 0) u->alert -= dt;
  }
  updateAudio(dt);
  // idle NPC life
  Unit *maren = G.npcs[0];
  if (G.mode != MODE_DIALOGUE && (int)floor(G.time / 4) % 3 == 0) maren->dir = 2; else if (G.mode != MODE_DIALOGUE) maren->dir = 0;
  // camera
  Unit *f = G.mode == MODE_COMBAT && G.focus ? G.focus : l;
  double tx = clampd(f->x - G.vw / 2.0, 0, MW * TILE - G.vw), ty = clampd(f->y - 16 - G.vh / 2.0, 0, MH * TILE - G.vh);
  double k = 1 - exp(-dt * (G.mode == MODE_COMBAT ? 4 : 6));
  G.cam.x += (tx - G.cam.x) * k; G.cam.y += (ty - G.cam.y) * k;
  if (G.shake > 0) G.shake -= dt;
  if (clickMark.on) { clickMark.t -= dt; if (clickMark.t <= 0) clickMark.on = false; }
  // mouse in world
  G.mouse.wx = G.cam.x + G.mouse.x / G.scale; G.mouse.wy = G.cam.y + G.mouse.y / G.scale;
  G.mouse.tx = (int)floor(G.mouse.wx / TILE); G.mouse.ty = (int)floor(G.mouse.wy / TILE);
}
static bool pointerCursor;
static void hoverTick(void) {
  pointerCursor = false;
  if (G.paused) return;
  if (G.mode == MODE_COMBAT && G.mouse.in) combatHover(G.mouse.tx, G.mouse.ty);
  else if (G.mode == MODE_EXPLORE && G.mouse.in) {
    Interact it; bool hasIt = underMouse(&it);
    Unit *en = NULL;
    for (int i = 0; i < G.nenemies; i++) { Unit *e = G.enemies[i]; if (e->hp > 0 && fabs(G.mouse.wx - e->x) < 12 && G.mouse.wy < e->y + 3 && G.mouse.wy > e->y - 32) { en = e; break; } }
    char t[200];
    if (hasIt) { snprintf(t, sizeof t, "<b>%s</b>", it.name); tooltip(t); }
    else if (en) { snprintf(t, sizeof t, "<b>%s</b><br><span style=\"color:#ff8a7a\">hostil</span>", en->name); tooltip(t); }
    else tooltip(NULL);
    pointerCursor = hasIt;
  }
}

// ---------------------------------------------------------------- draw
static void px1(int x, int y, RGBA8 c) { cv_fill(&view, x, y, 1, 1, c); }
static void ring(double x, double y, RGBA8 c, double rx) {
  for (int a = 0; a < 40; a++) {
    double t = (a / 40.0) * M_PI * 2;
    px1((int)JSROUND(x + cos(t) * rx), (int)JSROUND(y + sin(t) * rx * 0.45), c);
  }
}
static void strokeBox(int x, int y, int w, int h, RGBA8 c) { // a 1px rect outline, corners drawn once
  cv_fill(&view, x, y, w, 1, c); cv_fill(&view, x, y + h - 1, w, 1, c);
  cv_fill(&view, x, y + 1, 1, h - 2, c); cv_fill(&view, x + w - 1, y + 1, 1, h - 2, c);
}
static void drawUnit(Unit *u, int cx, int cy) {
  if (u->gone) return;
  bool down = u->hp <= 0 && u->team == TEAM_PARTY;
  double ox = 0, oy = 0;
  if (u->lunge) { double k = sin((u->lungeT / 0.25) * M_PI); ox += u->lungeX * k; oy += u->lungeY * k; }
  if (u->knock) { double k = u->knockT / 0.2; ox += u->knockX * k; oy += u->knockY * k; }
  int x = (int)JSROUND(u->x + ox - cx), y = (int)JSROUND(u->y + oy - cy);
  int fi = 4;
  if (u->pose == POSE_ATTACK && u->poseT > 0) fi = 5;
  else if (u->pose == POSE_CAST && u->poseT > 0) fi = 6;
  else if (u->moving) fi = (int)floor(u->animT * 8) % 4;
  const Img *img = u->flashT > 0 ? &u->ch->flash[u->dir][fi] : &u->ch->frames[u->dir][fi];
  if (down) { cv_draw_rot90(&view, img, x, y - 6, -SW / 2.0, -SH / 2.0 - 4, 0.6); return; }
  // idle breathing: a 1px bob every so often
  bool breathe = !u->moving && fi == 4 && (int)floor(u->animT * 1.6) % 2 == 1;
  if (breathe) {
    cv_draw_sub(&view, img, 0, 0, SW, 22, x - 13, y - 34 + 1, 1);
    cv_draw_sub(&view, img, 0, 22, SW, SH - 22, x - 13, y - 34 + 22, 1);
  } else cv_draw(&view, img, x - 13, y - 34, 1);
  if (u->alert > 0 && u->team == TEAM_ENEMY) {
    RGBA8 c = rgba8(0xff, 0xd8, 0x4a, 1);
    cv_fill(&view, x - 1, y - 46, 2, 6, c); cv_fill(&view, x - 1, y - 38, 2, 2, c);
  }
}
static void drawBars(int cx, int cy) {
  if (G.mode != MODE_COMBAT) return;
  for (int i = 0; i < G.nenemies + G.nparty; i++) {
    Unit *u = i < G.nenemies ? G.enemies[i] : G.party[i - G.nenemies];
    if (u->hp <= 0 || u->gone) continue;
    int x = (int)JSROUND(u->x - cx) - 9, y = (int)JSROUND(u->y - cy) - 40;
    cv_fill(&view, x - 1, y - 1, 20, 4, rgba8(0x12, 0x0e, 0x16, 1));
    cv_fill(&view, x, y, 18, 2, rgba8(0x3a, 0x14, 0x14, 1));
    cv_fill(&view, x, y, (int)ceil((18.0 * u->hp) / u->maxHp), 2, u->team == TEAM_ENEMY ? rgba8(0xe0, 0x40, 0x2a, 1) : rgba8(0x6a, 0xd0, 0x4a, 1));
  }
}
static int reachD[MW * MH], reachO[MW * MH];
static void drawCombatGrid(int cx, int cy) {
  Combat *C = G.combat;
  if (!C || !C->active) return;
  Unit *u = C->active;
  int ux, uy; tileOf(u, &ux, &uy);
  int x0 = (int)floor(cx / (double)TILE), y0 = (int)floor(cy / (double)TILE), x1 = x0 + (int)ceil(G.vw / (double)TILE) + 1, y1 = y0 + (int)ceil(G.vh / (double)TILE) + 1;
  // faint grid
  RGBA8 gc = rgba8(10, 20, 20, 0.13);
  for (int ty = y0; ty <= y1; ty++) for (int tx = x0; tx <= x1; tx++) {
    if (wblocked(&G.W, tx, ty)) continue;
    int sx = tx * TILE - cx, sy = ty * TILE - cy;
    cv_fill(&view, sx, sy, TILE, 1, gc); cv_fill(&view, sx, sy, 1, TILE, gc);
  }
  if (u->team != TEAM_PARTY || C->busy) return;
  const Ability *ab = C->ability >= 0 ? &ABILITIES[C->ability] : NULL;
  if (ab) {
    RGBA8 c = ab->kind == K_HEAL || ab->kind == K_POTION ? rgba8(120, 240, 120, 0.12) : rgba8(255, 140, 60, 0.12);
    for (int ty = uy - ab->range; ty <= uy + ab->range; ty++) for (int tx = ux - ab->range; tx <= ux + ab->range; tx++)
      if (!wblocked(&G.W, tx, ty)) cv_fill(&view, tx * TILE - cx + 1, ty * TILE - cy + 1, TILE - 1, TILE - 1, c);
  } else if (u->moveLeft > 0) {
    // the reach of this turn's movement: a light fill and a bright border
    int n = reachable(blockedFor, u, ux, uy, u->moveLeft, reachD, reachO);
    double pulse = 0.55 + sin(G.time * 3) * 0.15;
    RGBA8 fillc = rgba8(95, 208, 200, 0.07), edge = rgba8(120, 236, 224, pulse);
#define IN(k) ((k) >= 0 && (k) < MW * MH && reachD[k] >= 0)
    for (int i = 0; i < n; i++) {
      int k = reachO[i], tx = k % MW, ty = k / MW, sx = tx * TILE - cx, sy = ty * TILE - cy;
      cv_fill(&view, sx, sy, TILE, TILE, fillc);
      if (!IN(k - MW)) cv_fill(&view, sx, sy, TILE, 1, edge);
      if (!IN(k + MW)) cv_fill(&view, sx, sy + TILE - 1, TILE, 1, edge);
      if (!IN(k - 1)) cv_fill(&view, sx, sy, 1, TILE, edge);
      if (!IN(k + 1)) cv_fill(&view, sx + TILE - 1, sy, 1, TILE, edge);
    }
#undef IN
  }
  if (C->hasPreview && C->npreview) {
    RGBA8 c = rgba8(0xf4, 0xec, 0xdc, 1);
    double px = u->x, py = u->y - 8;
    for (int i = 0; i < C->npreview; i++) {
      double wx, wy; tileCenter(C->preview[i].x, C->preview[i].y, &wx, &wy);
      for (double s = 0; s < 1; s += 0.2) cv_fill(&view, (int)JSROUND(px + (wx - px) * s - cx), (int)JSROUND(py + (wy - 8 - py) * s - cy), 2, 2, c);
      px = wx; py = wy - 8;
    }
    TilePt e = C->preview[C->npreview - 1];
    strokeBox(e.x * TILE - cx + 1, e.y * TILE - cy + 1, TILE - 2, TILE - 2, rgba8(0xe8, 0xc0, 0x6a, 1));
  }
  // hovered tile
  int mxx = G.mouse.tx, myy = G.mouse.ty;
  if (G.mouse.in && !wblocked(&G.W, mxx, myy)) strokeBox(mxx * TILE - cx, myy * TILE - cy, TILE, TILE, rgba8(244, 236, 220, 0.5));
}

typedef struct { double y; int kind, idx; } Item; // kind 0 object, 1 grass, 2 unit, 3 chest
static Item *items; static int capitems;
static int itemCmp(const void *a, const void *b) {
  const Item *x = a, *y = b;
  if (x->y < y->y) return -1; if (x->y > y->y) return 1;
  return x->kind != y->kind ? x->kind - y->kind : x->idx - y->idx; // stable, like Array.sort
}
static Unit *unitAt(int i) { return i < G.nparty ? G.party[i] : i < G.nparty + G.nenemies ? G.enemies[i - G.nparty] : G.npcs[i - G.nparty - G.nenemies]; }

static void drawCritters(int cx, int cy, double ruinK) {
  double t = G.time;
  for (int i = 0; i < ncritters; i++) {
    Critter *c = &critters[i];
    double a = t * c->sp + c->ph;
    int x = (int)JSROUND(c->x + sin(a) * c->r + sin(a * 2.3) * 6 - cx), y = (int)JSROUND(c->y + sin(a * 1.7) * c->r * 0.5 + cos(a * 3.1) * 4 - cy - 14);
    if (x < -4 || y < -4 || x > G.vw + 4 || y > G.vh + 4) continue;
    if (c->bf) {
      bool open = (int)floor(t * 12 + c->ph) % 2 == 0;
      cv_fill(&view, x, y + 12, 2, 1, rgba8(10, 20, 10, 0.25));
      if (open) { cv_fill(&view, x - 2, y - 1, 2, 2, c->c0); cv_fill(&view, x + 1, y - 1, 2, 2, c->c0); cv_fill(&view, x - 2, y - 1, 1, 1, c->c1); cv_fill(&view, x + 2, y - 1, 1, 1, c->c1); }
      else { cv_fill(&view, x - 1, y - 2, 1, 2, c->c0); cv_fill(&view, x + 1, y - 2, 1, 2, c->c0); }
      cv_fill(&view, x, y - 1, 1, 2, rgba8(0x1a, 0x10, 0x20, 1));
    } else {
      double b = fmax(0, sin(t * 2.2 + c->ph * 3)) * (0.35 + ruinK * 0.65);
      if (b < 0.05) continue;
      cv_fill_add(&view, x - 1, y - 1, 3, 3, rgba8(120, 160, 40, b * 0.35));
      cv_fill_add(&view, x, y, 1, 1, rgba8(230, 255, 150, b));
    }
  }
}

static void draw(void) {
  int vw = G.vw, vh = G.vh;
  int cx = (int)JSROUND(G.cam.x), cy = (int)JSROUND(G.cam.y);
  if (G.shake > 0) { cx += (int)JSROUND((mrand() - 0.5) * 4); cy += (int)JSROUND((mrand() - 0.5) * 4); }
  cv_fill(&view, 0, 0, vw, vh, rgba8(0x0b, 0x0a, 0x10, 1));
  cv_draw_sub(&view, &ground, cx, cy, vw, vh, 0, 0, 1);

  // water: drifting glints and a breathing shoreline
  double t = G.time;
  for (int i = 0; i < nsparkles; i++) {
    Sparkle *s = &sparkles[i];
    if (s->x < cx - 8 || s->x > cx + vw + 8 || s->y < cy - 4 || s->y > cy + vh + 4) continue;
    double ph = fmod(t * s->sp + s->ph, 1);
    if (ph > 0.4) continue;
    double a = sin((ph / 0.4) * M_PI);
    int len = (int)fmax(1, JSROUND(s->len * a));
    RGBA8 c = s->edge ? rgba8(220, 255, 240, 0.75 * a) : rgba8(200, 250, 240, 0.6 * a);
    int x = (int)JSROUND(s->x - cx + ph * 6), y = (int)JSROUND(s->y - cy);
    cv_fill(&view, x, y, len, 1, c);
    if (len > 3) cv_fill(&view, x + 1, y - 1, len - 2, 1, c);
  }

  // click marker
  if (clickMark.on) ring(clickMark.x - cx, clickMark.y - cy, rgba8(232, 192, 106, fmin(1, clickMark.t * 2)), 6 + (0.5 - clickMark.t) * 10);
  drawCombatGrid(cx, cy);

  // everything standing, sorted by its feet
  int nitems = 0, nunits = G.nparty + G.nenemies + G.nnpcs;
  int need = G.W.nobj + G.W.ngrass + nunits + G.nchests;
  if (need > capitems) { capitems = need; items = realloc(items, sizeof(Item) * capitems); }
#define INVIEW(X, Y, M) ((X) > cx - (M) && (X) < cx + vw + (M) && (Y) > cy - 20 && (Y) < cy + vh + 140)
  for (int i = 0; i < G.W.nobj; i++) if (INVIEW(G.W.objects[i].x, G.W.objects[i].y, 120)) items[nitems++] = (Item){ G.W.objects[i].y, 0, i };
  for (int i = 0; i < G.W.ngrass; i++) if (INVIEW(G.W.grass[i].x, G.W.grass[i].y, 20)) items[nitems++] = (Item){ G.W.grass[i].y, 1, i };
  for (int i = 0; i < nunits; i++) { Unit *u = unitAt(i); if (!u->gone && INVIEW(u->x, u->y, 120)) items[nitems++] = (Item){ u->y, 2, i }; }
  for (int i = 0; i < G.nchests; i++) if (INVIEW(G.chests[i].x, G.chests[i].y, 120)) items[nitems++] = (Item){ G.chests[i].y, 3, i };
#undef INVIEW
  qsort(items, nitems, sizeof(Item), itemCmp);
  // shadows first, so nothing's shadow falls on top of a neighbour
  for (int i = 0; i < nitems; i++) {
    Item *it = &items[i];
    double r = 0, x = 0, y = 0;
    if (it->kind == 0) { Obj *o = &G.W.objects[it->idx]; r = o->art ? o->art->shadow : 0; x = o->x; y = o->y; }
    else if (it->kind == 2) { Unit *u = unitAt(it->idx); r = 9; x = u->x; y = u->y; }
    else if (it->kind == 3) { r = 12; x = G.chests[it->idx].x; y = G.chests[it->idx].y; }
    if (!r) continue;
    Img *s = shadowOf(r);
    cv_draw(&view, s, (int)JSROUND(x - cx - s->w / 2.0), (int)JSROUND(y - cy - s->h / 2.0 - (it->kind == 0 ? 1 : 0)), 1);
  }
  Unit *l = lead();
  // active / hover rings
  if (G.mode == MODE_COMBAT && G.combat && G.combat->active) ring(G.combat->active->x - cx, G.combat->active->y - cy - 1, G.combat->active->team == TEAM_PARTY ? rgba8(0xe8, 0xc0, 0x6a, 1) : rgba8(0xff, 0x5a, 0x4a, 1), 11);
  else if (G.mode == MODE_EXPLORE) ring(l->x - cx, l->y - cy - 1, rgba8(232, 192, 106, 0.55), 9);
  for (int i = 0; i < nitems; i++) {
    Item *it = &items[i];
    if (it->kind == 2) { drawUnit(unitAt(it->idx), cx, cy); continue; }
    if (it->kind == 3) { Chest *c = &G.chests[it->idx]; Art *a = &G.chestArt[c->open ? 1 : 0]; cv_draw(&view, &a->img, (int)JSROUND(c->x - cx - a->ox), (int)JSROUND(c->y - cy - a->oy), 1); continue; }
    if (it->kind == 1) {
      Grass *g = &G.W.grass[it->idx];
      TallGrass *ga = &grassArt[g->v];
      int f = (int)floor(fmod(t * 1.6 + g->ph, 4));
      for (int j = 0; j < G.nparty; j++) if (fabs(G.party[j]->x - g->x) < 9 && fabs(G.party[j]->y - g->y) < 6) f = G.party[j]->x < g->x ? 1 : 3;
      cv_draw(&view, &ga->frames[f], (int)JSROUND(g->x - cx - ga->ox), (int)JSROUND(g->y - cy - ga->oy), 1);
      continue;
    }
    Obj *o = &G.W.objects[it->idx]; Art *a = o->art;
    if (!a) continue;
    int x = (int)JSROUND(o->x - cx - a->ox), y = (int)JSROUND(o->y - cy - a->oy);
    if (a->canopy) {
      // see-through canopy when someone stands behind it
      double bx = o->x - a->ox + a->cx, by = o->y - a->oy + a->cy;
      bool hide = false;
      for (int j = 0; j < G.nparty + G.nenemies && !hide; j++) {
        Unit *u = unitAt(j);
        if (!u->gone && u->y < o->y - 2 && u->x > bx && u->x < bx + a->cw && u->y - 20 > by && u->y - 20 < by + a->ch) hide = true;
      }
      if (hide) { cv_draw(&view, &a->img, x, y, 0.45); continue; }
    }
    cv_draw(&view, &a->img, x, y, 1);
  }
  drawBars(cx, cy);

  // atmosphere: the ruins are darker and misty
  double ruinK = clamp01(1 - fmax(0, (l->y - 15 * TILE)) / (6 * TILE)) * (l->x < 33 * TILE ? 1 : 0.3);
  if (ruinK > 0.01) cv_fill(&view, 0, 0, vw, vh, rgba8(16, 20, 40, 0.32 * ruinK));
  fx_draw(&view, cx, cy);
  drawCritters(cx, cy, ruinK);
  double mk = 0.08 + ruinK * 0.7;
  double mx0 = -fmod(cx * 1.0 + t * 8, mist.w) - mist.w, my0 = -fmod(cy * 1.0 + t * 3, mist.h) - mist.h;
  for (double y = my0; y < vh; y += mist.h) for (double x = mx0; x < vw; x += mist.w) cv_draw(&view, &mist, (int)JSROUND(x), (int)JSROUND(y), mk);

  // framing: branches at the bottom corners, and a vignette
  cv_draw(&view, &fgLeft, (int)JSROUND(-30 - fmod(cx * 0.05, 10)), vh - fgLeft.h + 34, 1);
  cv_draw_flipx(&view, &fgRight, (int)JSROUND(-vw - 24 + fmod(cx * 0.05, 10)), vh - fgRight.h + 40, 1);
  if (vignette.w != vw || vignette.h != vh) {
    img_free(&vignette); vignette = img_new(vw, vh);
    double r0 = fmin(vw, vh) * 0.35, r1 = fmax(vw, vh) * 0.72;
    for (int y = 0; y < vh; y++) for (int x = 0; x < vw; x++) {
      double d = hypot(x + 0.5 - vw / 2.0, y + 0.5 - vh / 2.0), k = clamp01((d - r0) / (r1 - r0));
      uint8_t *p = vignette.px + ((size_t)y * vw + x) * 4;
      p[0] = 8; p[1] = 6; p[2] = 14; p[3] = u8c(0.55 * k * 255);
    }
  }
  cv_draw(&view, &vignette, 0, 0, 1);
}

// ---------------------------------------------------------------- the custom cursor (the stylesheet's SVG arrow)
static bool inPath(const char *d, double px, double py) {
  // even-odd test of a path of h/v moves from "M x y"
  double pts[64][2]; int n = 0; double x = 0, y = 0;
  const char *s = d;
  while (*s) {
    char c = *s++;
    if (c == 'M') { x = strtod(s, (char **)&s); y = strtod(s, (char **)&s); pts[n][0] = x; pts[n][1] = y; n++; }
    else if (c == 'h') { x += strtod(s, (char **)&s); pts[n][0] = x; pts[n][1] = y; n++; }
    else if (c == 'v') { y += strtod(s, (char **)&s); pts[n][0] = x; pts[n][1] = y; n++; }
  }
  bool in = false;
  for (int i = 0, j = n - 1; i < n; j = i++) {
    double xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
    if ((yi > py) != (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) in = !in;
  }
  return in;
}
static SDL_Cursor *makeCursor(void) {
  const char *dark = "M2 2h3v1h1v1h1v1h1v1h1v1h1v1h1v1h1v1h1v1h-4v1h1v1h1v2h-2v-1h-1v-1h-1v1h-1v1h-2z";
  const char *gold = "M3 4h1v1h1v1h1v1h1v1h1v1h1v1h1v1h-3v1h1v1h1v1h-1v-1h-1v-1h-1v1h-1v1h-1z";
  SDL_Surface *s = SDL_CreateRGBSurfaceWithFormat(0, 24, 24, 32, SDL_PIXELFORMAT_ARGB8888);
  SDL_FillRect(s, NULL, 0);
  for (int y = 0; y < 24; y++) for (int x = 0; x < 24; x++) {
    Uint32 *p = (Uint32 *)((Uint8 *)s->pixels + y * s->pitch) + x;
    if (inPath(dark, x + 0.5, y + 0.5)) *p = 0xff120e16;
    if (inPath(gold, x + 0.5, y + 0.5)) *p = 0xffe8c06a;
  }
  SDL_Cursor *c = SDL_CreateColorCursor(s, 2, 2);
  SDL_FreeSurface(s);
  return c;
}

// ---------------------------------------------------------------- main
static const char *captureTo;
static void presentFrame(void) {
  SDL_SetRenderDrawColor(ren, 0x0b, 0x0a, 0x10, 255);
  SDL_RenderClear(ren);
  if (viewTex && ui_title != TITLE_LOADING) {
    SDL_UpdateTexture(viewTex, NULL, view.px, view.w * 4);
    SDL_Rect d = { 0, 0, G.vw * G.scale, G.vh * G.scale };
    SDL_RenderCopy(ren, viewTex, NULL, &d);
  }
  ui_draw();
  if (captureTo) { // BRUMA_SMOKE: save this frame
    SDL_Surface *s = SDL_CreateRGBSurfaceWithFormat(0, G.winW, G.winH, 32, SDL_PIXELFORMAT_ARGB8888);
    SDL_RenderReadPixels(ren, NULL, SDL_PIXELFORMAT_ARGB8888, s->pixels, s->pitch);
    SDL_SaveBMP(s, captureTo);
    SDL_FreeSurface(s);
    captureTo = NULL;
  }
  SDL_RenderPresent(ren);
}
// ---------------------------------------------------------------- headless checks
// BRUMA_SMOKE=out.bmp runs a scene for a few seconds, saves a frame and quits; BRUMA_SCENE picks the scene
// (title, explore, dialogue, dice, combat, pause). Used to compare the C build with the web version.
static void sendKey(SDL_Keycode k) {
  SDL_Event e; memset(&e, 0, sizeof e);
  e.type = SDL_KEYDOWN; e.key.keysym.sym = k; e.key.keysym.scancode = SDL_GetScancodeFromKey(k);
  SDL_PushEvent(&e);
  e.type = SDL_KEYUP; SDL_PushEvent(&e);
}
static void teleport(double x, double y) {
  for (int i = 0; i < G.nparty; i++) { G.party[i]->x = x - i * 14; G.party[i]->y = y + i * 6; G.party[i]->npath = 0; }
  trailN = 0;
  G.cam.x = clampd(x - G.vw / 2.0, 0, MW * TILE - G.vw); G.cam.y = clampd(y - 16 - G.vh / 2.0, 0, MH * TILE - G.vh);
}
static int frameCount;
/** Plays by itself: fights the patrol, then the ruins, saving a frame now and then (BRUMA_SMOKE + n). */
static void autoplay(double real, bool *running) {
  static double t, next = 1, shotT = 5; static int phase, shots, guard;
  t += real;
  const char *limit = getenv("BRUMA_SECONDS");
  static double overAt = -1;
  if (G.mode == MODE_OVER && overAt < 0) overAt = t;
  if (overAt >= 0 && t - overAt < 2) { // let the game-over screen come up, then save it
    static bool shot; if (!shot && t - overAt > 1.5) { static char p[600]; snprintf(p, sizeof p, "%s-over.bmp", getenv("BRUMA_SMOKE")); captureTo = p; shot = true; }
    return;
  }
  if (t > (limit ? atof(limit) : 90) || G.mode == MODE_OVER) {
    printf("frames %d (%.1f fps)\n", frameCount, frameCount / t);
    printf("autoplay end: mode %d, quest stage %d, party hp %d/%d, enemies left %d\n", G.mode, G.quest.stage, G.party[0]->hp, G.party[1]->hp, livingCount(G.enemies, G.nenemies));
    *running = false; return;
  }
  if (t > shotT) { static char p[600]; snprintf(p, sizeof p, "%s-%02d.bmp", getenv("BRUMA_SMOKE"), shots++); captureTo = p; shotT += 7; }
  if (t < next) return;
  next = t + 0.25;
  if (G.mode == MODE_DIALOGUE) { if (dlgView.nopts) dialogue_click_option(dlgView.nopts - 1); return; }
  if (diceView.visible) { if (diceView.clickable) dice_click(); return; }
  if (G.mode == MODE_EXPLORE) {
    bool patrol = false, ruins = false;
    for (int i = 0; i < G.nenemies; i++) if (G.enemies[i]->hp > 0) { if (G.enemies[i]->group == 1) patrol = true; else ruins = true; }
    if (phase == 0) { teleport(1168 - 34, 858 + 6); sendKey(SDLK_e); phase = 1; return; } // talk to Maren first
    if (phase == 1 && G.mode == MODE_EXPLORE) { phase = 2; return; }
    if (patrol) teleport(19 * TILE + 16, 25 * TILE + 26);
    else if (ruins) teleport(20 * TILE + 16, 14 * TILE + 26);
    else if (phase < 3) { teleport(1168 - 34, 858 + 6); sendKey(SDLK_e); phase = 3; } // back to Maren
    return;
  }
  Combat *C = G.combat;
  if (G.mode != MODE_COMBAT || !C || C->busy || !C->active || C->active->team != TEAM_PARTY) return;
  Unit *u = C->active, *best = NULL; int bd = 1 << 30;
  for (int i = 0; i < G.nenemies; i++) { Unit *e = G.enemies[i]; if (e->hp <= 0) continue; int ex, ey, ux, uy; tileOf(e, &ex, &ey); tileOf(u, &ux, &uy); int d = abs(ex - ux) > abs(ey - uy) ? abs(ex - ux) : abs(ey - uy); if (d < bd) { bd = d; best = e; } }
  if (!best || (!u->action && !u->bonus) || ++guard % 6 == 0) { endTurn(); return; }
  int ex, ey; tileOf(best, &ex, &ey);
  if (!strcmp(u->key, "mage") && u->action) { selectAbility(u->slots > 0 && guard % 3 == 0 ? AB_MISSILES : AB_FIREBOLT); combatClick(ex, ey); return; }
  if (u->hp < u->maxHp / 2 && u->bonus && !u->restUsed[AB_SECONDWIND] && !strcmp(u->key, "hero")) { selectAbility(AB_SECONDWIND); return; }
  if (u->action) { if (!u->used[AB_CLEAVE] && bd <= 1 && guard % 2) selectAbility(AB_CLEAVE); else combatClick(ex, ey); return; }
  endTurn();
}
static void smokeStep(double real, bool *running) {
  static double t; static int stage;
  const char *scene = getenv("BRUMA_SCENE"); if (!scene) scene = "explore";
  t += real;
  bool title = !strcmp(scene, "title");
  if (stage == 0 && t > 0.5 && !title) { main_begin(); stage = 1; }
  if (stage == 1 && t > 0.8) {
    if (!strcmp(scene, "dialogue") || !strcmp(scene, "dice")) { teleport(1168 - 34, 858 + 6); sendKey(SDLK_e); }
    if (!strcmp(scene, "combat")) teleport(19 * TILE + 16, 25 * TILE + 26);
    if (!strcmp(scene, "pause")) sendKey(SDLK_ESCAPE);
    if (!strcmp(scene, "over")) { for (int i = 0; i < G.nparty; i++) G.party[i]->hp = 0; G.mode = MODE_OVER; hook_gameOver(); }
    stage = 2;
  }
  if (stage == 2 && t > 3.2 && !strcmp(scene, "dice")) { sendKey(SDLK_2); stage = 3; }
  if (!strcmp(scene, "autoplay")) { autoplay(real, running); return; }
  double at = title ? 1.0 : !strcmp(scene, "dice") ? 5.0 : !strcmp(scene, "combat") ? 4.5 : 4.0;
  if (stage < 10 && t > at) { captureTo = getenv("BRUMA_SMOKE"); stage = 10; }
  else if (stage == 10) *running = false;
}
static char assetDir[1024];
static void findAssets(void) {
  char *base = SDL_GetBasePath();
  const char *tries[4] = { "assets", "../assets", "c/assets", "../share/brumafolha/assets" };
  for (int i = 0; i < 4; i++) {
    char p[1100], f[1200];
    snprintf(p, sizeof p, "%s%s", base ? base : "", tries[i]);
    snprintf(f, sizeof f, "%s/fonts/Cinzel-700.ttf", p);
    FILE *fp = fopen(f, "rb");
    if (fp) { fclose(fp); snprintf(assetDir, sizeof assetDir, "%s", p); SDL_free(base); return; }
    snprintf(p, sizeof p, "%s", tries[i]);
    snprintf(f, sizeof f, "%s/fonts/Cinzel-700.ttf", p);
    fp = fopen(f, "rb");
    if (fp) { fclose(fp); snprintf(assetDir, sizeof assetDir, "%s", p); SDL_free(base); return; }
  }
  snprintf(assetDir, sizeof assetDir, "assets");
  SDL_free(base);
}

int main(int argc, char **argv) {
  gArgv = argv;
  mrand_seed((uint64_t)time(NULL) ^ ((uint64_t)getpid() << 32));
  if (SDL_Init(SDL_INIT_VIDEO | SDL_INIT_EVENTS | SDL_INIT_TIMER) < 0) { fprintf(stderr, "SDL: %s\n", SDL_GetError()); return 1; }
  SDL_SetHint(SDL_HINT_RENDER_SCALE_QUALITY, "nearest");
  win = SDL_CreateWindow("Brumafolha", SDL_WINDOWPOS_CENTERED, SDL_WINDOWPOS_CENTERED, 1280, 720, SDL_WINDOW_RESIZABLE);
  if (!win) { fprintf(stderr, "SDL: %s\n", SDL_GetError()); return 1; }
  ren = SDL_CreateRenderer(win, -1, SDL_RENDERER_ACCELERATED | SDL_RENDERER_PRESENTVSYNC);
  if (!ren) ren = SDL_CreateRenderer(win, -1, SDL_RENDERER_SOFTWARE);
  if (!ren) { fprintf(stderr, "SDL: %s\n", SDL_GetError()); return 1; }
  findAssets();
  if (!ui_init(ren, assetDir)) { fprintf(stderr, "could not load the fonts in %s\n", assetDir); return 1; }
  SDL_Cursor *arrow = makeCursor(), *handC = SDL_CreateSystemCursor(SDL_SYSTEM_CURSOR_HAND);
  if (arrow) SDL_SetCursor(arrow);
  audio_load_settings();
  resize();
  presentFrame(); // the title, while the valley is painted
  SDL_PumpEvents();

  // boot: the world, its art, the cast
  Uint64 t0 = SDL_GetPerformanceCounter();
  initSpecs();
  buildWorld(&G.W);
  ground = paintGround(&G.W);
  nsparkles = waterSparkles(&G.W, &sparkles);
  for (int v = 0; v < 6; v++) grassArt[v] = makeTallGrass(v);
  for (int i = 0; i < G.W.nobj; i++) G.W.objects[i].art = propArt(&G.W.objects[i]);
  mist = makeMist();
  fgLeft = silhouette(11); fgRight = silhouette(29);
  fx_init();
  G.mode = MODE_TITLE; G.potions = 1; G.gold = 12; G.quest.patrolSeen = -1;
  spawnCast();
  resize(); fx_resize(G.vw, G.vh);
  // ambient effects
  for (int i = 0; i < G.W.nobj; i++) {
    Obj *o = &G.W.objects[i];
    if (o->kind != O_CAMPFIRE) continue;
    FxOpts f = fxo(o->x, o->y + 2); f.light = 0.55;
    if (o->goblin) { f.hasSeed = true; f.seed = 3; }
    FxEntry *e = fx_spawn(FX_CAMPFIRE, f);
    fx_set_keep(e, true);
  }
  // little life: butterflies over the meadows, fireflies in the ruins and by the water
  Rng R; rng_seed(&R, 17);
  const char *BF[4][2] = { { "#5b2c8f", "#c99cff" }, { "#a04a10", "#ffc46a" }, { "#2a5a8a", "#9adcff" }, { "#c0c0d0", "#ffffff" } };
  for (int i = 0; i < 26; i++) {
    double x = rng_range(&R, 4, MW - 4) * TILE, y = rng_range(&R, 4, MH - 4) * TILE;
    if (tileAt(&G.W, (int)(x / TILE), (int)(y / TILE)) != 0) continue;
    Critter c; memset(&c, 0, sizeof c); c.bf = true; c.x = x; c.y = y;
    int k = (int)floor(rng_next(&R) * 4); RGB a = hexc(BF[k][0]), b = hexc(BF[k][1]);
    c.c0 = rgba8((int)a.r, (int)a.g, (int)a.b, 1); c.c1 = rgba8((int)b.r, (int)b.g, (int)b.b, 1);
    c.ph = rng_range(&R, 0, 9); c.r = rng_range(&R, 14, 40); c.sp = rng_range(&R, 0.3, 0.7);
    critters[ncritters++] = c;
  }
  for (int i = 0; i < 70; i++) {
    bool inR = i < 40;
    double x = inR ? rng_range(&R, 10, 30) * TILE : rng_range(&R, 32, 60) * TILE;
    double y = inR ? rng_range(&R, 3, 14) * TILE : rng_range(&R, 17, 37) * TILE;
    Critter c; memset(&c, 0, sizeof c); c.x = x; c.y = y;
    c.ph = rng_range(&R, 0, 9); c.r = rng_range(&R, 8, 30); c.sp = rng_range(&R, 0.15, 0.4);
    critters[ncritters++] = c;
  }
  printf("loaded in %d ms\n", (int)((SDL_GetPerformanceCounter() - t0) * 1000 / SDL_GetPerformanceFrequency()));
  ui_title = TITLE_READY;
  bool smoke = getenv("BRUMA_SMOKE") != NULL;

  Uint64 last = SDL_GetPerformanceCounter();
  bool running = true, overCanvas = false;
  while (running) {
    SDL_Event e;
    while (SDL_PollEvent(&e)) {
      switch (e.type) {
        case SDL_QUIT: running = false; break;
        case SDL_WINDOWEVENT: if (e.window.event == SDL_WINDOWEVENT_SIZE_CHANGED) resize(); break;
        case SDL_MOUSEMOTION: {
          ui_mousemove(e.motion.x, e.motion.y);
          bool cap = ui_captures(e.motion.x, e.motion.y);
          if (!cap) { setMouse(e.motion.x, e.motion.y); overCanvas = true; }
          else if (overCanvas) { overCanvas = false; G.mouse.in = false; tooltip(NULL); }
          break;
        }
        case SDL_WINDOWEVENT_LEAVE: break;
        case SDL_MOUSEBUTTONDOWN: {
          if (ui_mousedown(e.button.x, e.button.y, e.button.button)) break;
          if (G.paused) break;
          setMouse(e.button.x, e.button.y);
          if (e.button.button == SDL_BUTTON_LEFT) onClick();
          if (e.button.button == SDL_BUTTON_RIGHT && G.combat) G.combat->ability = -1;
          break;
        }
        case SDL_MOUSEBUTTONUP: ui_mouseup(e.button.x, e.button.y, e.button.button); break;
        case SDL_KEYDOWN: {
          SDL_Keycode k = e.key.keysym.sym;
          int sc = e.key.keysym.scancode;
          if (sc > 0 && sc < 512) keys[sc] = true;
          if (e.key.repeat && (k == SDLK_m || k == SDLK_ESCAPE || k == SDLK_p || k == SDLK_TAB)) break;
          if (k == SDLK_m && G.mode != MODE_TITLE) { ui_syncMute(toggleMute()); break; }
          if (G.mode == MODE_TITLE || G.mode == MODE_OVER) break;
          // Esc first cancels a chosen combat action; otherwise it (or P) opens and closes the menu
          if (k == SDLK_ESCAPE && !G.paused && G.combat && G.combat->ability >= 0) { G.combat->ability = -1; break; }
          if (k == SDLK_ESCAPE || k == SDLK_p) { main_setPaused(!G.paused); break; }
          if (G.paused) break;
          int digit = k >= SDLK_1 && k <= SDLK_9 ? (int)(k - SDLK_1) + 1 : k >= SDLK_KP_1 && k <= SDLK_KP_9 ? (int)(k - SDLK_KP_1) + 1 : 0;
          if (G.mode == MODE_DIALOGUE && digit) dialogueKey(digit);
          else if (G.mode == MODE_COMBAT) {
            if (k == SDLK_SPACE) endTurn();
            if (digit) { Unit *u = G.combat ? G.combat->active : NULL; if (u && u->team == TEAM_PARTY && digit <= u->nab) selectAbility(u->abilities[digit - 1]); }
          } else if (G.mode == MODE_EXPLORE) {
            if (k == SDLK_e) { Interact it; if (nearestInteractable(&it)) act(&it); }
            if (k == SDLK_TAB) main_selectLeader((G.leader + 1) % G.nparty);
            if (digit) hotbar_activate(digit - 1);
          }
          break;
        }
        case SDL_KEYUP: { int sc = e.key.keysym.scancode; if (sc > 0 && sc < 512) keys[sc] = false; break; }
      }
    }
    Uint64 nowc = SDL_GetPerformanceCounter();
    double real = (double)(nowc - last) / SDL_GetPerformanceFrequency();
    last = nowc;
    double dt = fmin(0.05, real);
    timers_tick(real);
    co_tick(real, G.paused);
    audio_tick();
    if (!G.paused) update(dt);
    hoverTick();
    dialogue_update(real);
    ui_update(real);
    draw();
    SDL_SetCursor(ui_wants_hand() || (pointerCursor && overCanvas) ? handC : arrow);
    presentFrame();
    frameCount++;
    if (smoke) smokeStep(real, &running);
  }
  audio_shutdown();
  SDL_Quit();
  return 0;
}
