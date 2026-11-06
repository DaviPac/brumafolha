// Turn-based combat on the tile grid: initiative, movement, an action and a bonus action per turn,
// d20 attack rolls against armour class, spells with slots, and enemies that think a little (combat.js).
// The async functions of the web version run here as coroutines (co.c).
#include "game.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define sleep_ms(ms) co_sleep((ms) / 1000.0)
void tileOf(const Unit *u, int *tx, int *ty) { *tx = (int)floor(u->x / TILE); *ty = (int)floor((u->y - 1) / TILE); }
void tileCenter(int tx, int ty, double *x, double *y) { *x = tx * TILE + 16; *y = ty * TILE + 26; }
static int cheb(const Unit *a, const Unit *b) {
  int ax, ay, bx, by; tileOf(a, &ax, &ay); tileOf(b, &bx, &by);
  int dx = abs(ax - bx), dy = abs(ay - by);
  return dx > dy ? dx : dy;
}
static void fmtRoll(const Roll *r, char *out, size_t n) {
  size_t k = 0; out[0] = 0;
  for (int i = 0; i < r->nrolls; i++) k += snprintf(out + k, n - k, "%s%d", i ? "+" : "", r->rolls[i]);
  if (r->mod) snprintf(out + k, n - k, "%s%d", r->mod > 0 ? "+" : "", r->mod);
}

static Unit *allUnits(int i, int *n) {
  int np = G.nparty, ne = G.nenemies, nn = G.nnpcs;
  *n = np + ne + nn;
  if (i < np) return G.party[i];
  if (i < np + ne) return G.enemies[i - np];
  return G.npcs[i - np - ne];
}
static Unit *occupiedBy(int tx, int ty, const Unit *except) {
  int n; allUnits(0, &n);
  for (int i = 0; i < n; i++) {
    Unit *u = allUnits(i, &n);
    if (u == except || u->hp <= 0 || u->gone) continue;
    int ux, uy; tileOf(u, &ux, &uy);
    if (ux == tx && uy == ty) return u;
  }
  return NULL;
}
bool blockedFor(int x, int y, void *u) { return wblocked(&G.W, x, y) || occupiedBy(x, y, u); }
typedef struct { Unit *u; int tx, ty; } BlockExcept;
static bool blockedExcept(int x, int y, void *p) {
  BlockExcept *b = p;
  return wblocked(&G.W, x, y) || (occupiedBy(x, y, b->u) && !(x == b->tx && y == b->ty));
}
static bool wblock(int x, int y, void *ctx) { return wblocked(&G.W, x, y); }

static int hitChance(const Unit *att, const Unit *def, int bonus) {
  int need = def->ac - bonus, v = (21 - need) * 5;
  return v < 5 ? 5 : v > 95 ? 95 : v;
}

// ---------------------------------------------------------------- abilities
const Ability ABILITIES[AB_N] = {
  [AB_ATTACK] = { "Ataque", "attack", "Golpe corpo a corpo com a arma. Clique num inimigo adjacente.", 0, 1, K_ATTACK, 0, NULL, false },
  [AB_CLEAVE] = { "Golpe Giratório", "cleave", "Gira a espada e atinge todos os inimigos adjacentes. 1x por combate.", 0, 0, K_CLEAVE, 1, NULL, false },
  [AB_SECONDWIND] = { "Retomar Fôlego", "wind", "Ação bônus: recupera 1d10 + nível PV. 1x por descanso.", 1, 0, K_SELF, 2, NULL, false },
  [AB_FIREBOLT] = { "Rajada de Fogo", "fire", "Truque: dispara uma bola de fogo. 1d10 de dano de fogo, alcance 10.", 0, 10, K_BOLT, 0, "1d10", false },
  [AB_MISSILES] = { "Mísseis Mágicos", "sparkles", "Magia de 1º círculo: três dardos que nunca erram, 1d4+1 cada.", 0, 10, K_MISSILES, 0, NULL, true },
  [AB_HEAL] = { "Curar Ferimentos", "heart", "Magia de 1º círculo: um aliado recupera 1d8+3 PV.", 0, 6, K_HEAL, 0, NULL, true },
  [AB_POTION] = { "Poção de Cura", "potion", "Ação bônus: você ou um aliado adjacente bebe e recupera 2d4+2 PV.", 1, 1, K_POTION, 0, NULL, false },
};

static bool canUse(const Unit *u, int key) {
  const Ability *ab = &ABILITIES[key];
  if (ab->cost == 0 && !u->action) return false;
  if (ab->cost == 1 && !u->bonus) return false;
  if (ab->per == 1 && u->used[key]) return false;
  if (ab->per == 2 && u->restUsed[key]) return false;
  if (ab->slot && u->slots <= 0) return false;
  if (ab->kind == K_POTION && G.potions <= 0) return false;
  return true;
}

// ---------------------------------------------------------------- start / end
static void nextTurn(void);
static void nextTurnTimer(void *a, void *b, int n) { nextTurn(); }
void startCombat(int group) {
  if (G.mode == MODE_COMBAT) return;
  Unit *enemies[8]; int ne = 0;
  for (int i = 0; i < G.nenemies; i++) if (G.enemies[i]->group == group && G.enemies[i]->hp > 0) enemies[ne++] = G.enemies[i];
  if (!ne) return;
  G.mode = MODE_COMBAT;
  // stop everyone and snap them onto tiles
  static bool taken[MW * MH]; memset(taken, 0, sizeof taken);
  Unit *party[2]; int np = 0;
  for (int i = 0; i < G.nparty; i++) if (G.party[i]->hp > 0) party[np++] = G.party[i];
  Unit *all[10]; int na = 0;
  for (int i = 0; i < np; i++) all[na++] = party[i];
  for (int i = 0; i < ne; i++) all[na++] = enemies[i];
  for (int k = 0; k < na; k++) {
    Unit *u = all[k];
    u->npath = 0;
    int tx, ty; tileOf(u, &tx, &ty);
#define OK(x, y) (!wblocked(&G.W, x, y) && !taken[(y) * MW + (x)])
    if (!OK(tx, ty)) {
      bool found = false;
      for (int r = 1; r < 5 && !found; r++) for (int dy = -r; dy <= r && !found; dy++) for (int dx = -r; dx <= r && !found; dx++) if (OK(tx + dx, ty + dy)) { tx += dx; ty += dy; found = true; }
    }
#undef OK
    if (tx >= 0 && ty >= 0 && tx < MW && ty < MH) taken[ty * MW + tx] = true;
    tileCenter(tx, ty, &u->x, &u->y);
  }
  struct { Unit *u; int init; } order[10];
  for (int k = 0; k < na; k++) { order[k].u = all[k]; order[k].init = rollDie(20) + all[k]->dex; }
  // a stable sort, highest first
  for (int i = 1; i < na; i++) { __typeof__(order[0]) v = order[i]; int j = i - 1; while (j >= 0 && order[j].init < v.init) { order[j + 1] = order[j]; j--; } order[j + 1] = v; }
  Combat *C = calloc(1, sizeof *C); // kept: a turn still running may hold it after the fight ends
  C->norder = na; for (int k = 0; k < na; k++) C->order[k] = order[k].u;
  C->idx = -1; C->group = group; C->ability = -1;
  G.combat = C;
  for (int k = 0; k < na; k++) memset(C->order[k]->used, 0, sizeof C->order[k]->used);
  char buf[400]; int len = snprintf(buf, sizeof buf, "<b>Combate!</b> Iniciativa: ");
  for (int k = 0; k < na; k++) len += snprintf(buf + len, sizeof buf - len, "%s%s %d", k ? ", " : "", order[k].u->name, order[k].init);
  ui_log(LOG_SYS, "%s", buf);
  banner("Combate");
  sfx_combatStart();
  hook_combatStart();
  after(0.9, nextTurnTimer, NULL, NULL, 0);
}

static bool checkEnd(void) {
  Combat *C = G.combat;
  int alive = 0, xp = 0;
  for (int i = 0; i < G.nenemies; i++) if (G.enemies[i]->group == C->group) { if (G.enemies[i]->hp > 0) alive++; xp += G.enemies[i]->xpValue; }
  if (!alive) {
    G.mode = MODE_EXPLORE;
    G.combat = NULL;
    for (int i = 0; i < G.nparty; i++) if (G.party[i]->hp <= 0) { G.party[i]->hp = 1; floater(G.party[i]->x, G.party[i]->y - 36, "De pé!", FL_INFO); }
    char t[64]; snprintf(t, sizeof t, "Vitória!  +%d XP", xp); toast(t, 2.2);
    sfx_victory();
    ui_log(LOG_SYS, "Vitória. Cada um recebe %d XP.", xp);
    for (int i = 0; i < G.nparty; i++) hook_gainXp(G.party[i], xp);
    updateInitiative(); updateParty();
    hook_combatEnd(C->group);
    return true;
  }
  if (!livingCount(G.party, G.nparty)) {
    G.mode = MODE_OVER;
    hook_gameOver();
    return true;
  }
  return false;
}

static void enemyTurn(Unit *u);
static void nextTurnTask(void *arg) {
  Combat *C = G.combat;
  if (!C || checkEnd()) return;
  do { C->idx = (C->idx + 1) % C->norder; } while (C->order[C->idx]->hp <= 0);
  Unit *u = C->active = C->order[C->idx];
  u->moveLeft = u->move; u->action = 1; u->bonus = 1;
  C->ability = -1;
  updateInitiative(); updateParty();
  if (u->team == TEAM_PARTY) {
    sfx_turn();
    G.focus = u;
    refreshCombatHotbar();
  } else {
    buildHotbar(NULL, 0, EXTRA_NONE);
    C->busy = true;
    sleep_ms(450);
    enemyTurn(u);
    C->busy = false;
    if (G.combat) nextTurn();
  }
}
static void nextTurn(void) { co_spawn(nextTurnTask, NULL); }

void endTurn(void) {
  Combat *C = G.combat;
  if (!C || C->busy || !C->active || C->active->team != TEAM_PARTY) return;
  tooltip(NULL);
  nextTurn();
}

static void useSelected(int key) { selectAbility(key); }
void refreshCombatHotbar(void) {
  Combat *C = G.combat; Unit *u = C ? C->active : NULL;
  if (!u || u->team != TEAM_PARTY) return;
  HotbarEntry e[6]; int n = 0;
  for (int i = 0; i < u->nab; i++) {
    int k = u->abilities[i]; const Ability *ab = &ABILITIES[k];
    HotbarEntry h; memset(&h, 0, sizeof h);
    h.icon = ab->icon; snprintf(h.name, sizeof h.name, "%s", ab->name); snprintf(h.desc, sizeof h.desc, "%s", ab->desc);
    h.off = !canUse(u, k) || C->busy; h.sel = C->ability == k;
    h.count = ab->slot ? u->slots : ab->kind == K_POTION ? G.potions : -1;
    h.use = useSelected; h.arg = k;
    e[n++] = h;
  }
  buildHotbar(e, n, EXTRA_TURN);
}

static void useAbilityTask(void *arg);
typedef struct { Unit *u; int key; Unit *target; } UseArgs;
static UseArgs useArgs[8]; static int useN;
static void useAbility(Unit *u, int key, Unit *target);
static void spawnUse(Unit *u, int key, Unit *target) { UseArgs *a = &useArgs[useN++ % 8]; a->u = u; a->key = key; a->target = target; co_spawn(useAbilityTask, a); }

void selectAbility(int key) {
  Combat *C = G.combat;
  if (!C || C->busy) return;
  Unit *u = C->active;
  sfx_select();
  if (!canUse(u, key)) return;
  if (ABILITIES[key].kind == K_SELF) { spawnUse(u, key, u); return; }
  if (ABILITIES[key].kind == K_CLEAVE) { spawnUse(u, key, NULL); return; }
  C->ability = C->ability == key ? -1 : key;
  refreshCombatHotbar();
}

// ---------------------------------------------------------------- player input
static Unit *targetAt(int tx, int ty) {
  for (int i = 0; i < G.nenemies + G.nparty; i++) {
    Unit *e = i < G.nenemies ? G.enemies[i] : G.party[i - G.nenemies];
    int ex, ey; tileOf(e, &ex, &ey);
    if (e->hp > 0 && ex == tx && ey == ty) return e;
  }
  return NULL;
}
static int reachDist[MW * MH], reachOrder[MW * MH];
typedef struct { int x, y, d; TilePt path[MAXPATH]; int npath; } Approach;
static bool approachTile(Unit *u, Unit *target, Approach *out) {
  int ux, uy, tx, ty; tileOf(u, &ux, &uy); tileOf(target, &tx, &ty);
  reachable(blockedFor, u, ux, uy, u->moveLeft, reachDist, reachOrder);
  bool found = false;
  for (int dy = -1; dy <= 1; dy++)
    for (int dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      int nx = tx + dx, ny = ty + dy, k = ny * MW + nx;
      if (k < 0 || k >= MW * MH || reachDist[k] < 0) continue;
      if (!found || reachDist[k] < out->d) { out->x = nx; out->y = ny; out->d = reachDist[k]; found = true; }
    }
  if (!found) return false;
  out->npath = gridPath(blockedFor, u, ux, uy, out->x, out->y, out->path, MAXPATH);
  return true;
}

void combatHover(int tx, int ty) {
  Combat *C = G.combat;
  if (!C || C->busy || !C->active || C->active->team != TEAM_PARTY) { if (C) C->hasPreview = false; return; }
  Unit *u = C->active;
  Unit *target = targetAt(tx, ty);
  int abKey = C->ability >= 0 ? C->ability : (target && target->team == TEAM_ENEMY ? AB_ATTACK : -1);
  C->hasPreview = false;
  char t[400];
  if (abKey >= 0 && target) {
    const Ability *ab = &ABILITIES[abKey];
    int d = cheb(u, target);
    bool friendly = ab->kind == K_HEAL || ab->kind == K_POTION;
    if (friendly != (target->team == TEAM_PARTY)) { tooltip(NULL); return; }
    if (ab->kind == K_ATTACK || ab->kind == K_BOLT) {
      int pct = hitChance(u, target, u->atk);
      bool inRange = d <= ab->range;
      char note[120] = "";
      if (!inRange && ab->kind == K_ATTACK) {
        static Approach app;
        if (approachTile(u, target, &app)) {
          snprintf(note, sizeof note, "<br>vai até ele (%d de movimento)", app.npath < 0 ? 0 : app.npath);
          C->hasPreview = app.npath > 0; C->npreview = app.npath > 0 ? app.npath : 0; memcpy(C->preview, app.path, sizeof(TilePt) * C->npreview);
          if (app.npath == 0) C->hasPreview = true; // an empty path still counts as a preview (and draws nothing)
        } else snprintf(note, sizeof note, "<br><span style='color:#ff8a7a'>longe demais</span>");
      } else if (!inRange) snprintf(note, sizeof note, "<br><span style='color:#ff8a7a'>fora de alcance</span>");
      snprintf(t, sizeof t, "<b>%s</b> → %s<br><span class=\"pct\">%d%%</span> de acerto · %s dano<br>PV %d/%d · CA %d%s", ab->name, target->name, pct, ab->kind == K_BOLT ? ab->dmg : u->dmg, target->hp, target->maxHp, target->ac, note);
      tooltip(t);
    } else if (ab->kind == K_MISSILES) {
      snprintf(t, sizeof t, "<b>%s</b> → %s<br><span class=\"pct\">100%%</span> · 3×(1d4+1)%s", ab->name, target->name, d > ab->range ? "<br>fora de alcance" : "");
      tooltip(t);
    } else if (friendly) {
      snprintf(t, sizeof t, "<b>%s</b> → %s<br>PV %d/%d%s", ab->name, target->name, target->hp, target->maxHp, d > ab->range ? "<br>fora de alcance" : "");
      tooltip(t);
    }
    return;
  }
  if (target) { snprintf(t, sizeof t, "<b>%s</b><br>PV %d/%d · CA %d", target->name, target->hp, target->maxHp, target->ac); tooltip(t); }
  else tooltip(NULL);
  if (C->ability >= 0) return;
  int ux, uy; tileOf(u, &ux, &uy);
  reachable(blockedFor, u, ux, uy, u->moveLeft, reachDist, reachOrder);
  int k = ty * MW + tx;
  if (tx >= 0 && ty >= 0 && tx < MW && ty < MH && reachDist[k] >= 0 && !(tx == ux && ty == uy)) {
    int n = gridPath(blockedFor, u, ux, uy, tx, ty, C->preview, MAXPATH);
    C->hasPreview = n > 0; C->npreview = n > 0 ? n : 0;
  }
}

static void moveAlong(Unit *u, const TilePt *path, int n) {
  // an empty path never "arrives" in stepAlongPath, so return here or the turn hangs
  if (n <= 0) return;
  u->moveLeft -= n;
  volatile int arrived = 0;
  u->npath = 0;
  for (int i = 0; i < n && i < MAXPATH; i++) { tileCenter(path[i].x, path[i].y, &u->path[i][0], &u->path[i][1]); u->npath++; }
  u->onArrive = &arrived;
  u->speed = 120;
  co_wait(&arrived);
}

typedef struct { int tx, ty; } ClickArgs;
static ClickArgs clickArgs[8]; static int clickN;
static void combatClickTask(void *arg) {
  ClickArgs a = *(ClickArgs *)arg;
  Combat *C = G.combat;
  if (!C || C->busy || !C->active || C->active->team != TEAM_PARTY) return;
  Unit *u = C->active;
  Unit *target = targetAt(a.tx, a.ty);
  int abKey = C->ability >= 0 ? C->ability : (target && target->team == TEAM_ENEMY ? AB_ATTACK : -1);
  if (abKey >= 0 && target) {
    const Ability *ab = &ABILITIES[abKey];
    if (!canUse(u, abKey)) { floater(u->x, u->y - 36, ab->cost == 1 ? "Sem ação bônus" : "Sem ação", FL_INFO); return; }
    bool friendly = ab->kind == K_HEAL || ab->kind == K_POTION;
    if (friendly != (target->team == TEAM_PARTY)) return;
    if (cheb(u, target) > ab->range) {
      if (ab->kind != K_ATTACK) { floater(u->x, u->y - 36, "Fora de alcance", FL_INFO); return; }
      static Approach app;
      if (!approachTile(u, target, &app)) { floater(u->x, u->y - 36, "Longe demais", FL_INFO); return; }
      C->busy = true; refreshCombatHotbar();
      moveAlong(u, app.path, app.npath);
      C->busy = false;
    }
    useAbility(u, abKey, target);
    return;
  }
  if (C->ability >= 0) { C->ability = -1; refreshCombatHotbar(); return; }
  int ux, uy; tileOf(u, &ux, &uy);
  reachable(blockedFor, u, ux, uy, u->moveLeft, reachDist, reachOrder);
  int k = a.ty * MW + a.tx;
  if (a.tx < 0 || a.ty < 0 || a.tx >= MW || a.ty >= MH || reachDist[k] < 0 || (a.tx == ux && a.ty == uy)) return;
  static TilePt path[MAXPATH];
  int n = gridPath(blockedFor, u, ux, uy, a.tx, a.ty, path, MAXPATH);
  C->busy = true; C->hasPreview = false; refreshCombatHotbar();
  moveAlong(u, path, n);
  C->busy = false;
  refreshCombatHotbar();
}
void combatClick(int tx, int ty) { ClickArgs *a = &clickArgs[clickN++ % 8]; a->tx = tx; a->ty = ty; co_spawn(combatClickTask, a); }

// ---------------------------------------------------------------- resolution
static void face(Unit *u, const Unit *t) {
  double dx = t->x - u->x, dy = t->y - u->y;
  u->dir = fabs(dx) > fabs(dy) ? (dx < 0 ? 1 : 2) : dy < 0 ? 3 : 0;
}
static void lunge(Unit *u, const Unit *t) {
  face(u, t);
  u->pose = POSE_ATTACK; u->poseT = 0.35;
  double dx = t->x - u->x, dy = t->y - u->y, l = hypot(dx, dy); if (!l) l = 1;
  u->lunge = true; u->lungeX = (dx / l) * 5; u->lungeY = (dy / l) * 5; u->lungeT = 0.25;
}

static void poofLater(void *a, void *b, int n) {
  Unit *t = a;
  fx_spawn(FX_POOF, fxo(t->x, t->y));
  t->gone = true;
}
static void damage(Unit *t, int amount, bool crit, const Unit *src, int kind) {
  t->hp -= amount;
  t->flashT = 0.16;
  double dx = t->x - src->x, dy = t->y - src->y, l = hypot(dx, dy); if (!l) l = 1;
  t->knock = true; t->knockX = (dx / l) * 3; t->knockY = (dy / l) * 3; t->knockT = 0.2;
  char s[16]; snprintf(s, sizeof s, crit ? "%d!" : "%d", amount);
  floater(t->x, t->y - 34, s, crit ? FL_CRIT : FL_DMG);
  G.shake = crit ? 0.3 : 0.12;
  G.hitstop = crit ? 0.12 : 0.06;
  sfx_hit(crit, kind);
  if (t->hp <= 0) {
    t->hp = 0;
    if (t->team == TEAM_ENEMY) {
      after(0.25, poofLater, t, NULL, 0);
      ui_log(LOG_SYS, "%s cai.", t->name);
      sfx_enemyDown();
    } else {
      floater(t->x, t->y - 46, "Caído", FL_INFO);
      ui_log(LOG_MISS, "%s está caído!", t->name);
      sfx_partyDown();
    }
  }
  updateParty(); updateInitiative();
}
static void heal(Unit *t, int amount) {
  t->hp = t->hp + amount > t->maxHp ? t->maxHp : t->hp + amount;
  char s[16]; snprintf(s, sizeof s, "+%d", amount);
  floater(t->x, t->y - 34, s, FL_HEAL);
  updateParty(); updateInitiative();
}
typedef struct { int d, total; bool crit, hit; } Attack;
static Attack attackRoll(const Unit *u, const Unit *t, int bonus) {
  Attack a; a.d = rollDie(20); a.total = a.d + bonus; a.crit = a.d == 20; a.hit = a.crit || (a.d != 1 && a.total >= t->ac);
  return a;
}
static Roll rollDmg(const char *expr, bool crit) {
  Roll r = roll(expr);
  if (crit) {
    char base[16]; snprintf(base, sizeof base, "%s", expr);
    char *pm = strpbrk(base + 1, "+-"); if (pm) *pm = 0;
    Roll r2 = roll(base);
    r.total += r2.total;
    for (int i = 0; i < r2.nrolls && r.nrolls < 16; i++) r.rolls[r.nrolls++] = r2.rolls[i];
  }
  const char *pm = strpbrk(expr + 1, "+-");
  r.mod = pm ? atoi(pm) : 0;
  return r;
}

static void meleeAttack(Unit *u, Unit *t, const char *expr) {
  lunge(u, t);
  bool flip = t->x < u->x;
  sleep_ms(120);
  Attack r = attackRoll(u, t, u->atk);
  FxOpts o = fxo(t->x + (flip ? 14 : -14), t->y + 2); o.flip = flip; o.radius = 24;
  fx_spawn(FX_SWORDSLASH, o);
  sfx_swing(false);
  sleep_ms(110);
  if (r.hit) {
    Roll dm = rollDmg(expr, r.crit);
    FxOpts h = fxo(t->x, t->y - 14); h.flip = flip;
    fx_spawn(r.crit ? FX_CRITHIT : FX_HITSPARK, h);
    damage(t, dm.total, r.crit, u, HIT_BLADE);
    char fr[64]; fmtRoll(&dm, fr, sizeof fr);
    ui_log(r.crit ? LOG_CRIT : LOG_HIT, "%s → %s: d20 %d+%d=%d vs CA %d · <b>%s</b> %d (%s)", u->name, t->name, r.d, u->atk, r.total, t->ac, r.crit ? "CRÍTICO" : "acerto", dm.total, fr);
  } else {
    floater(t->x, t->y - 34, "Errou", FL_MISS);
    sfx_miss();
    ui_log(LOG_MISS, "%s → %s: d20 %d+%d=%d vs CA %d · errou", u->name, t->name, r.d, u->atk, r.total, t->ac);
  }
  sleep_ms(380);
}

static int soundKind(int pal) { return pal == PAL_FIRE ? HIT_FIRE : pal == PAL_ARCANE ? HIT_ARCANE : pal == PAL_WOOD ? HIT_ARROW : HIT_EMBER; }

// a projectile: its hit happens when the fireball arrives
enum { HIT_SPELL, HIT_MISSILE };
typedef struct { Unit *u, *t; int pal, kind; double ex, ey, sx; volatile int done;
  Attack r; const char *expr, *label; int *tot; } Bolt;
static void boltArrive(FxEntry *e) {
  Bolt *b = e->ud;
  FxOpts o = fxo(b->ex, b->ey); o.palette = b->pal; o.flip = b->ex < b->sx;
  fx_spawn(FX_HITSPARK, o);
  int kind = soundKind(b->pal);
  sfx_impact(kind);
  Unit *u = b->u, *t = b->t;
  if (b->kind == HIT_SPELL) {
    if (b->r.hit) {
      Roll dm = rollDmg(b->expr, b->r.crit);
      damage(t, dm.total, b->r.crit, u, kind);
      ui_log(b->r.crit ? LOG_CRIT : LOG_HIT, "%s — %s → %s: d20 %d+%d=%d vs CA %d · <b>%s</b> %d", u->name, b->label, t->name, b->r.d, u->atk, b->r.total, t->ac, b->r.crit ? "CRÍTICO" : "acerto", dm.total);
    } else {
      floater(t->x, t->y - 34, "Errou", FL_MISS);
      sfx_miss();
      ui_log(LOG_MISS, "%s — %s → %s: d20 %d+%d=%d · errou", u->name, b->label, t->name, b->r.d, u->atk, b->r.total);
    }
  } else if (t->hp > 0) {
    Roll r = roll("1d4+1"); *b->tot += r.total; damage(t, r.total, false, u, HIT_ARCANE);
  }
  b->done = 1;
}
static void bolt(Bolt *b, double arc, double dur) {
  Unit *u = b->u, *t = b->t;
  double sx = u->x, sy = u->y - 18, ex = t->x, ey = t->y - 14;
  double ang = atan2(ey - sy, ex - sx), d = hypot(ex - sx, ey - sy);
  b->ex = ex; b->ey = ey; b->sx = sx; b->done = 0;
  sfx_cast(soundKind(b->pal));
  FxOpts o = fxo(sx, sy); o.angle = ang; o.palette = b->pal; o.radius = 4;
  fx_spawn_move(FX_FIREBALL, o, ex, ey, dur > 0 ? dur : fmax(0.18, d / 420), arc, boltArrive, b);
  co_wait(&b->done);
}

static void rangedSpell(Unit *u, Unit *t, const char *expr, int pal, const char *label) {
  face(u, t);
  bool arrow = soundKind(pal) == HIT_ARROW;
  u->pose = POSE_CAST; u->poseT = arrow ? 0.85 : 0.5;
  if (arrow) sfx_bowDraw(0.5); // draw the bow before letting go
  sleep_ms(arrow ? 560 : 200);
  Bolt b; memset(&b, 0, sizeof b);
  b.u = u; b.t = t; b.pal = pal; b.kind = HIT_SPELL; b.r = attackRoll(u, t, u->atk); b.expr = expr; b.label = label;
  bolt(&b, 0, 0);
  sleep_ms(350);
}

typedef struct { Unit *u, *t; int i; int *tot; volatile int *left; volatile int *allDone; } Shot;
static void shotTask(void *arg) {
  Shot s = *(Shot *)arg;
  sleep_ms(s.i * 160);
  Bolt b; memset(&b, 0, sizeof b);
  b.u = s.u; b.t = s.t; b.pal = PAL_ARCANE; b.kind = HIT_MISSILE; b.tot = s.tot;
  bolt(&b, 26 * (s.i - 1), 0.42);
  if (--*s.left == 0) *s.allDone = 1;
}

static void useAbility(Unit *u, int key, Unit *target) {
  Combat *C = G.combat;
  if (!C) return;
  const Ability *ab = &ABILITIES[key];
  C->busy = true; C->ability = -1; C->hasPreview = false; tooltip(NULL);
  refreshCombatHotbar();
  if (ab->cost == 0) u->action = 0;
  if (ab->cost == 1) u->bonus = 0;
  if (ab->per == 1) u->used[key] = true;
  if (ab->per == 2) u->restUsed[key] = true;
  if (ab->slot) u->slots--;
  switch (ab->kind) {
    case K_ATTACK: meleeAttack(u, target, u->dmg); break;
    case K_BOLT: rangedSpell(u, target, ab->dmg, PAL_FIRE, ab->name); break;
    case K_MISSILES: {
      face(u, target);
      u->pose = POSE_CAST; u->poseT = 0.9;
      int tot = 0; volatile int left = 3, allDone = 0;
      Shot shots[3];
      for (int i = 0; i < 3; i++) { shots[i] = (Shot){ u, target, i, &tot, &left, &allDone }; co_spawn(shotTask, &shots[i]); }
      co_wait(&allDone);
      ui_log(LOG_HIT, "%s — Mísseis Mágicos → %s: %d de dano", u->name, target->name, tot);
      sleep_ms(300);
      break;
    }
    case K_HEAL: {
      face(u, target);
      u->pose = POSE_CAST; u->poseT = 0.6;
      FxOpts o = fxo(target->x, target->y + 2);
      fx_spawn(FX_BLOOM, o);
      sfx_heal();
      sleep_ms(500);
      Roll r = roll("1d8+3"); heal(target, r.total);
      ui_log(LOG_HEAL, "%s cura %s: +%d PV", u->name, target->name, r.total);
      sleep_ms(400);
      break;
    }
    case K_POTION: {
      G.potions--;
      FxOpts o = fxo(target->x, target->y + 2); o.palette = PAL_HEAL;
      fx_spawn(FX_BLOOM, o);
      sfx_potion();
      sleep_ms(350);
      Roll r = roll("2d4+2"); heal(target, r.total);
      ui_log(LOG_HEAL, "%s bebe uma poção: +%d PV", target->name, r.total);
      sleep_ms(300);
      break;
    }
    case K_SELF: {
      char e[16]; snprintf(e, sizeof e, "1d10+%d", u->level);
      Roll r = roll(e);
      FxOpts o = fxo(u->x, u->y + 2); o.palette = PAL_HOLY;
      fx_spawn(FX_BLOOM, o);
      sfx_breath();
      sleep_ms(400);
      heal(u, r.total);
      ui_log(LOG_HEAL, "%s retoma o fôlego: +%d PV", u->name, r.total);
      break;
    }
    case K_CLEAVE: {
      Unit *adj[8]; int na = 0;
      for (int i = 0; i < G.nenemies; i++) if (G.enemies[i]->hp > 0 && cheb(u, G.enemies[i]) <= 1) adj[na++] = G.enemies[i];
      u->pose = POSE_ATTACK; u->poseT = 0.5;
      FxOpts a = fxo(u->x - 12, u->y + 2); a.flip = true; a.radius = 24; fx_spawn(FX_SWORDSLASH, a);
      FxOpts b = fxo(u->x + 12, u->y + 2); b.radius = 24; fx_spawn(FX_SWORDSLASH, b);
      sfx_swing(true);
      sleep_ms(200);
      if (!na) floater(u->x, u->y - 36, "Ninguém ao redor", FL_INFO);
      for (int i = 0; i < na; i++) {
        Unit *t = adj[i];
        Attack r = attackRoll(u, t, u->atk);
        if (r.hit) {
          Roll dm = rollDmg(u->dmg, r.crit);
          FxOpts h = fxo(t->x, t->y - 14); h.flip = t->x < u->x; fx_spawn(FX_HITSPARK, h);
          damage(t, dm.total, r.crit, u, HIT_BLADE);
          ui_log(LOG_HIT, "Golpe Giratório → %s: %d", t->name, dm.total);
        } else { floater(t->x, t->y - 34, "Errou", FL_MISS); ui_log(LOG_MISS, "Golpe Giratório → %s: errou", t->name); }
        sleep_ms(120);
      }
      sleep_ms(350);
      break;
    }
  }
  if (!G.combat) return;
  C->busy = false;
  if (checkEnd()) return;
  refreshCombatHotbar();
}
static void useAbilityTask(void *arg) { UseArgs a = *(UseArgs *)arg; useAbility(a.u, a.key, a.target); }

// ---------------------------------------------------------------- enemy AI
typedef struct { Unit *f; int d; } Foe;
static void sortFoes(Foe *a, int n, bool byHpOnly) {
  for (int i = 1; i < n; i++) {
    Foe v = a[i]; int j = i - 1;
    while (j >= 0 && (byHpOnly ? a[j].f->hp > v.f->hp : (a[j].d > v.d || (a[j].d == v.d && a[j].f->hp > v.f->hp)))) { a[j + 1] = a[j]; j--; }
    a[j + 1] = v;
  }
}
static void enemyTurn(Unit *u) {
  Foe byDist[2]; int nf = 0;
  for (int i = 0; i < G.nparty; i++) if (G.party[i]->hp > 0) { byDist[nf].f = G.party[i]; byDist[nf].d = cheb(u, G.party[i]); nf++; }
  if (!nf) return;
  sortFoes(byDist, nf, false);
  G.focus = u;
  if (u->hasRanged) {
    // prefer the most wounded target in range; keep a step away from blades
    Foe inRange[2]; int ni = 0;
    for (int i = 0; i < nf; i++) if (byDist[i].d <= u->ranged.range) inRange[ni++] = byDist[i];
    if (byDist[0].d <= 1) {
      int ux, uy; tileOf(u, &ux, &uy);
      int nr = reachable(blockedFor, u, ux, uy, u->moveLeft, reachDist, reachOrder);
      bool have = false; int bx = 0, by = 0, bd = 0;
      for (int k = 0; k < nr; k++) {
        int key = reachOrder[k], tx = key % MW, ty = key / MW, dmin = 1 << 30;
        for (int i = 0; i < nf; i++) { int fx, fy; tileOf(byDist[i].f, &fx, &fy); int d = abs(fx - tx) > abs(fy - ty) ? abs(fx - tx) : abs(fy - ty); if (d < dmin) dmin = d; }
        if (dmin >= 3 && (!have || dmin > bd)) { have = true; bx = tx; by = ty; bd = dmin; }
      }
      if (have) { static TilePt p[MAXPATH]; int n = gridPath(blockedFor, u, ux, uy, bx, by, p, MAXPATH); moveAlong(u, p, n); }
    }
    Foe *list = ni ? inRange : byDist; int nl = ni ? ni : nf;
    sortFoes(list, nl, true);
    Unit *pick = list[0].f;
    if (cheb(u, pick) > u->ranged.range) {
      int ux, uy, tx, ty; tileOf(u, &ux, &uy); tileOf(pick, &tx, &ty);
      static TilePt p[MAXPATH];
      int n = gridPath(blockedFor, u, ux, uy, tx, ty, p, MAXPATH);
      if (n >= 0) { int m = n - u->ranged.range; if (m < 0) m = 0; if (m > u->moveLeft) m = u->moveLeft; moveAlong(u, p, m); }
    }
    if (cheb(u, pick) <= u->ranged.range) rangedSpell(u, pick, u->ranged.dmg, u->ranged.pal, u->ranged.name);
    return;
  }
  Unit *target = byDist[0].f;
  if (byDist[0].d > 1) {
    // walk toward the closest reachable foe
    static Approach app; bool have = false;
    for (int i = 0; i < nf; i++) { if (approachTile(u, byDist[i].f, &app)) { target = byDist[i].f; have = true; break; } }
    if (have) moveAlong(u, app.path, app.npath);
    else {
      int ux, uy, tx, ty; tileOf(u, &ux, &uy); tileOf(target, &tx, &ty);
      BlockExcept be = { u, tx, ty };
      static TilePt p[MAXPATH];
      int n = gridPath(blockedExcept, &be, ux, uy, tx, ty, p, MAXPATH);
      if (n >= 0) { int m = n - 1; if (m > u->moveLeft) m = u->moveLeft; moveAlong(u, p, m); }
    }
  }
  if (cheb(u, target) <= 1) meleeAttack(u, target, u->dmg);
}
