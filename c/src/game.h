// Brumafolha in C: shared types and the interfaces between modules.
// The structure follows the web version (src/*.js) file by file, so the two stay easy to compare.
#ifndef BRUMA_GAME_H
#define BRUMA_GAME_H

#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>
#include <math.h>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif
#define TAU (M_PI * 2)

// ---------------------------------------------------------------- util.c
#define TILE 32
#define JSROUND(v) floor((v) + 0.5) /* Math.round: halves go up, also below zero */

typedef struct { float r, g, b; } RGB;
typedef struct { const RGB *c; int n; } Ramp;
#define RAMP(arr) ((Ramp){ (arr), (int)(sizeof(arr) / sizeof((arr)[0])) })

typedef struct { uint32_t s; } Rng;
void rng_seed(Rng *r, double seed);
double rng_next(Rng *r);
double rng_range(Rng *r, double a, double b);
int rng_int(Rng *r, int a, int b);
bool rng_chance(Rng *r, double p);

double hash2(double x, double y, double s);
double vnoise(double x, double y, double s);
double fbm(double x, double y, double s, int oct);
double bayer(int x, int y);
RGB hexc(const char *h);
void ramp_hex(RGB *out, int n, const char *const *hs);
RGB rampAt(Ramp r, double v, int x, int y);
static inline double clampd(double v, double a, double b) { return v < a ? a : v > b ? b : v; }
static inline double clamp01(double v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
static inline double distd(double ax, double ay, double bx, double by) { return hypot(ax - bx, ay - by); }
double segDist(double px, double py, double ax, double ay, double bx, double by);
uint8_t u8c(double v); /* Uint8ClampedArray: clamp, round half to even */

double mrand(void); /* Math.random */
void mrand_seed(uint64_t s);
int rollDie(int n);
typedef struct { int total; int rolls[16]; int nrolls; int mod; } Roll;
Roll roll(const char *expr);

/** An RGBA image (bytes R, G, B, A), like an ImageData / a canvas. */
typedef struct { int w, h; uint8_t *px; } Img;
Img img_new(int w, int h);
void img_free(Img *im);
Img img_clone(const Img *src);

/** A pixel buffer you poke into, then turn into an image (util.js PixBuf). */
typedef struct { int w, h; uint8_t *d; } PixBuf;
PixBuf pb_new(int w, int h);
void pb_free(PixBuf *pb);
void pb_set(PixBuf *pb, double x, double y, RGB c);
void pb_seta(PixBuf *pb, double x, double y, RGB c, double a);
bool pb_get(const PixBuf *pb, int x, int y, uint8_t out[4]);
int pb_alpha(const PixBuf *pb, int x, int y);
void pb_rect(PixBuf *pb, int x, int y, int w, int h, RGB c);
void pb_outline(PixBuf *pb, RGB c);
Img pb_img(const PixBuf *pb);

// ---------------------------------------------------------------- canvas.c: drawing into the low-res view
typedef struct { uint8_t r, g, b, a; } RGBA8;
static inline RGBA8 rgba8(int r, int g, int b, double a) { RGBA8 c = { (uint8_t)r, (uint8_t)g, (uint8_t)b, u8c(a * 255) }; return c; }
void cv_fill(Img *dst, int x, int y, int w, int h, RGBA8 c);       /* source-over */
void cv_fill_add(Img *dst, int x, int y, int w, int h, RGBA8 c);   /* "lighter" */
void cv_draw(Img *dst, const Img *src, int dx, int dy, double alpha);
void cv_draw_sub(Img *dst, const Img *src, int sx, int sy, int sw, int sh, int dx, int dy, double alpha);
void cv_draw_flipx(Img *dst, const Img *src, int dx, int dy, double alpha);
void cv_draw_rot90(Img *dst, const Img *src, double cx, double cy, double ox, double oy, double alpha);
void cv_draw_add(Img *dst, const Img *src, int dx, int dy);

// ---------------------------------------------------------------- world.c
#define MW 64
#define MH 48
enum { T_GRASS, T_PATH, T_WATER, T_DOCK, T_STONE };
enum ObjKind { O_CAMPFIRE, O_TENT, O_LOG, O_CRATE, O_BARREL, O_POST, O_ROWBOAT, O_RUBBLE, O_WALL, O_PILLAR, O_BANNER, O_BONES,
  O_TREE, O_PINE, O_DEADTREE, O_ROCK, O_WATERROCK, O_BUSH, O_FERN };

typedef struct {
  Img img; double ox, oy;
  bool canopy; double cx, cy, cw, ch;
  double shadow;
} Art;

typedef struct { int kind; double x, y; int color, h, seed; bool goblin; Art *art; } Obj;
typedef struct { double x, y; int v; double ph; } Grass;

typedef struct {
  uint8_t tiles[MW * MH], block[MW * MH];
  Obj *objects; int nobj, capobj;
  Grass *grass; int ngrass, capgrass;
} World;

extern const struct Dock { int x0, y0, x1, y1; struct { int x0, x1, y; } pier; } DOCK;
extern const double CAMP_X, CAMP_Y;
extern const double RUINS_X0, RUINS_Y0, RUINS_X1, RUINS_Y1;
double waterField(double x, double y);
double pathField(double x, double y);
double stoneField(double x, double y);
double lushField(double x, double y);
bool inRuins(double x, double y);
const char *zoneAt(double px, double py);
void buildWorld(World *W);
int tileAt(const World *W, int tx, int ty);
bool wblocked(const World *W, int tx, int ty);

// ---------------------------------------------------------------- path.c
typedef bool (*BlockedFn)(int x, int y, void *ctx);
typedef struct { int x, y; } TilePt;
int findPath(BlockedFn blocked, void *ctx, int sx, int sy, int gx, int gy, TilePt *out, int maxOut); /* -1: none */
/** dist[k] = steps, or -1 when not reachable (k = y * MW + x). Returns count. */
int reachable(BlockedFn blocked, void *ctx, int sx, int sy, int steps, int *dist, int *order);
int gridPath(BlockedFn blocked, void *ctx, int sx, int sy, int gx, int gy, TilePt *out, int maxOut);

// ---------------------------------------------------------------- art (ground.c, props.c, chars.c)
Img paintGround(const World *W);
typedef struct { double x, y; int len; double ph, sp; bool edge; } Sparkle;
int waterSparkles(const World *W, Sparkle **out);

Art makeTree(int seed); Art makePine(int seed); Art makeDeadTree(int seed);
Art makeRock(int seed, bool wet); Art makeBush(int seed); Art makeFern(int seed);
typedef struct { Img frames[4]; double ox, oy; } TallGrass;
TallGrass makeTallGrass(int v);
Art makeWall(int h, int seed, bool broken); Art makePillar(int h, int seed); Art makeRubble(int seed);
Art makeTent(int colorIdx); Art makeLog(void); Art makeCrate(void); Art makeBarrel(void);
Art makePost(int h); Art makeRowboat(void); Art makeCampfireBase(void); Art makeBanner(void);
Art makeBones(int seed); Art makeChest(bool open);
Img makeShadow(double rx);

#define SW 26
#define SH 36
typedef struct {
  RGB skin[4], hair[4], tunic[4], pants[4], boots[4], cape[4], orb[3], apron[3], trim[3], eyes;
  int nskin, nhair, ntunic, npants, nboots, ncape, norb, napron, ntrim;
  enum { HS_SHORT, HS_LONG, HS_BUN, HS_BALD, HS_HOOD, HS_MOHAWK } hairStyle;
  enum { W_SWORD, W_STAFF, W_NONE, W_DAGGER, W_AXE } weapon;
  enum { E_HUMAN, E_ELF, E_GOBLIN } ears;
  bool robe, small, big, bones;
} Spec;
typedef struct { Img frames[4][7], flash[4][7]; } Character;
enum { SPEC_HERO, SPEC_MAGE, SPEC_MAREN, SPEC_GOBLIN, SPEC_SHAMAN, SPEC_CHIEF, SPEC_N };
extern Spec SPECS[SPEC_N];
void initSpecs(void);
Character *buildCharacter(const Spec *s);
Img portrait(const Character *ch, int scale);

// ---------------------------------------------------------------- pfx.c / effects.c: the pixelfx port
typedef struct { const uint32_t *c; int n; } Pal;
enum PalId { PAL_FIRE, PAL_EMBER, PAL_HOLY, PAL_HEAL, PAL_ARCANE, PAL_GOLD, PAL_WOOD, PAL_N };
Pal pal_get(int id);

enum FxKind { FX_CAMPFIRE, FX_FIREBALL, FX_HITSPARK, FX_CRITHIT, FX_SWORDSLASH, FX_POOF, FX_BLOOM };
typedef struct FxOpts {
  double x, y, angle, light, radius;
  bool flip, hasSeed; int seed;
  int palette; /* -1: the effect's own */
} FxOpts;
static inline FxOpts fxo(double x, double y) { FxOpts o = { x, y, 0, 1, -1, false, false, 0, -1 }; return o; }
typedef struct FxEntry FxEntry;
typedef void (*FxCallback)(FxEntry *e);
struct FxEntry {
  void *fx; double x, y, t;
  bool hasMove; double mx, my, mdur, marc, sx, sy; bool arrived;
  bool keep; double life; bool stopped;
  FxCallback onArrive; void *ud;
  bool dead;
};
void fx_init(void);
void fx_resize(int w, int h);
FxEntry *fx_spawn(int kind, FxOpts o);
FxEntry *fx_spawn_move(int kind, FxOpts o, double mx, double my, double dur, double arc, FxCallback onArrive, void *ud);
void fx_set_angle(FxEntry *e, double a);
void fx_set_keep(FxEntry *e, bool k);
void fx_update(double dt);
void fx_draw(Img *dst, double camX, double camY);

// ---------------------------------------------------------------- audio.c
enum { VOL_MASTER, VOL_MUSIC, VOL_AMBIENCE, VOL_COMBAT, VOL_STEPS, VOL_JINGLES, VOL_UI, VOL_WORLD, VOL_N };
typedef struct { const char *label; bool sfx; } SoundGroup;
extern const SoundGroup SOUND_GROUPS[VOL_N];
typedef struct { bool muted; double vol[VOL_N]; } AudioSettings;
extern AudioSettings audioSet;
void audio_load_settings(void);
void initAudio(void);
void audio_shutdown(void);
void audio_tick(void);
enum { MUS_NONE = -1, MUS_MEADOW, MUS_RUINS, MUS_COMBAT };
void playMusic(int track, double fade);
typedef struct { double wind, water, fire, birds, ruins; } AmbLevels;
void updateAmbience(AmbLevels lv, double dt, double time);
void setVolume(int kind, double v);
bool setMuted(bool m);
bool toggleMute(void);
void previewSound(int kind);
enum { SURF_GRASS, SURF_DIRT, SURF_STONE, SURF_WOOD, SURF_WATER };
enum { HIT_BLADE, HIT_FIRE, HIT_EMBER, HIT_ARCANE, HIT_ARROW };
void sfx_step(int surface, double vol);
void sfx_swing(bool big);
void sfx_hit(bool crit, int kind);
void sfx_miss(void);
void sfx_cast(int kind);
void sfx_bowDraw(double dur);
void sfx_impact(int kind);
void sfx_heal(void);
void sfx_potion(void);
void sfx_breath(void);
void sfx_enemyDown(void);
void sfx_partyDown(void);
void sfx_combatStart(void);
void sfx_turn(void);
void sfx_select(void);
void sfx_click(void);
void sfx_dieTick(void);
void sfx_success(bool crit);
void sfx_fail(void);
void sfx_chest(void);
void sfx_talk(void);
void sfx_rest(void);
void sfx_victory(void);
void sfx_defeat(void);
void sfx_levelUp(void);
void sfx_quest(void);

// ---------------------------------------------------------------- co.c: coroutines (async/await) and timers
typedef void (*CoFn)(void *arg);
void co_spawn(CoFn fn, void *arg);   /* runs now until its first wait, like calling an async function */
void co_sleep(double secs);          /* await sleep(ms): stands still while the game is paused */
void co_wait(volatile int *flag);    /* until *flag != 0 */
void co_tick(double dt, bool paused);
bool co_inside(void);
typedef void (*TimerFn)(void *a, void *b, int n);
void after(double secs, TimerFn fn, void *a, void *b, int n); /* setTimeout */
void timers_tick(double dt);

// ---------------------------------------------------------------- units and the shared state (state.js)
enum { TEAM_PARTY, TEAM_ENEMY, TEAM_NPC };
enum { POSE_IDLE, POSE_WALK, POSE_ATTACK, POSE_CAST };
enum { AB_ATTACK, AB_CLEAVE, AB_SECONDWIND, AB_FIREBOLT, AB_MISSILES, AB_HEAL, AB_POTION, AB_N };
#define MAXPATH 256

typedef struct Unit {
  const char *key; const char *name; const char *cls; int team;
  Character *ch; Img portrait;
  int dir; double animT; int pose; double poseT;
  double path[MAXPATH][2]; int npath; double speed; bool moving;
  volatile int *onArrive;
  bool used[AB_N], restUsed[AB_N];
  double flashT; int level, xp, nextXp;
  struct { const char *name; int v; } skills[4]; int nskills;
  int abilities[6]; int nab;
  int dex, maxHp, hp, ac, atk, move, hpPerLevel, maxSlots, slots, xpValue;
  char dmg[16];
  bool boss;
  bool hasRanged; struct { int range; char dmg[16]; const char *name; int pal; } ranged;
  int group; /* 0 none, 1 patrol, 2 ruins */
  double x, y; bool gone; double alert;
  bool lunge, knock; double lungeX, lungeY, lungeT, knockX, knockY, knockT;
  int moveLeft, action, bonus;
  bool hasS; double sx_, sy_, stepAcc;
  int talk; /* 1 Maren, 2 Tomé */
} Unit;

enum { MODE_TITLE, MODE_EXPLORE, MODE_DIALOGUE, MODE_COMBAT, MODE_OVER };

typedef struct {
  Unit *order[16]; int norder, idx; Unit *active; int group;
  int ability; /* -1: none */
  bool hasPreview; TilePt preview[MAXPATH]; int npreview;
  bool busy;
} Combat;

typedef struct { double x, y; bool open; int potions, gold; const char *name; } Chest;

typedef struct {
  int mode; bool paused; double time;
  struct { double x, y; } cam;
  int scale, vw, vh, winW, winH;
  World W;
  Unit *party[2]; int nparty;
  Unit *enemies[8]; int nenemies;
  Unit *npcs[2]; int nnpcs;
  Chest chests[2]; int nchests; Art chestArt[2];
  int leader, potions, gold;
  struct { int stage; int patrolSeen; /* -1 undefined, 0, 1 */ bool patrolDone, ruinsDone, grandson, grandsonFound; } quest;
  struct { double x, y, wx, wy; int tx, ty; bool in; } mouse;
  Combat *combat;
  double shake, hitstop;
  Unit *focus;
} GameState;
extern GameState G;
Unit *lead(void);
int livingCount(Unit **list, int n);
int groupMembers(int group, Unit **out);

// hooks (main.c)
void hook_gainXp(Unit *p, int xp);
void hook_combatStart(void);
void hook_combatEnd(int group);
void hook_questDone(void);
void hook_tomeLeaves(void);
void hook_gameOver(void);
void hook_afterDialogue(void);
void exploreHotbar(void);

// ---------------------------------------------------------------- combat.c
typedef struct { const char *name, *icon, *desc; int cost; /* 0 action 1 bonus */ int range; int kind; int per; /* 0, 1 combat, 2 rest */ const char *dmg; bool slot; } Ability;
enum { K_ATTACK, K_CLEAVE, K_SELF, K_BOLT, K_MISSILES, K_HEAL, K_POTION };
extern const Ability ABILITIES[AB_N];
void tileOf(const Unit *u, int *tx, int *ty);
void tileCenter(int tx, int ty, double *x, double *y);
bool blockedFor(int x, int y, void *u);
void startCombat(int group);
void combatClick(int tx, int ty);
void combatHover(int tx, int ty);
void endTurn(void);
void selectAbility(int key);
void refreshCombatHotbar(void);

// ---------------------------------------------------------------- dialogue.c
void openDialogue(Unit *npc, int tree);
void dialogueKey(int n);
void dialogue_click_option(int i);
bool dialogue_open(void);
void dialogue_update(double dt);

// ---------------------------------------------------------------- text.c / ui.c (the DOM UI, drawn with SDL)
enum { FL_DMG, FL_CRIT, FL_MISS, FL_HEAL, FL_INFO };
enum { LOG_NONE, LOG_HIT, LOG_MISS, LOG_CRIT, LOG_HEAL, LOG_SYS };
void floater(double x, double y, const char *text, int cls);
void ui_log(int cls, const char *fmt, ...);
void toast(const char *text, double secs);
void banner(const char *text);
void tooltip(const char *html); /* NULL hides it */
void buildParty(void);
void updateParty(void);
void updateQuest(void);
typedef void (*HotbarUse)(int i);
typedef struct { const char *icon; char name[48]; char desc[200]; int count; /* -1 none */ bool off, sel; HotbarUse use; int arg; } HotbarEntry;
enum { EXTRA_NONE, EXTRA_GOLD, EXTRA_TURN };
void buildHotbar(const HotbarEntry *e, int n, int extra);
void updateInitiative(void);
void hotbar_activate(int i);

// dialogue box and dice (drawn by ui.c, driven by dialogue.c)
typedef struct { char html[400]; bool used; } DlgOption;
typedef struct {
  bool visible; const Unit *npc; char text[600]; int shown; double typeT;
  DlgOption opts[6]; int nopts;
} DialogueView;
extern DialogueView dlgView;
typedef struct {
  bool visible, spin, clickable; char skill[80], dc[96], result[48]; int num; bool ok; double spinT;
  volatile int clicked;
} DiceView;
extern DiceView diceView;

#endif
