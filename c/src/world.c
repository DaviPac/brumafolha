// The map: a valley with a camp, a lake with a dock, and goblin-held ruins to the north (world.js).
#include "game.h"
#include <stdlib.h>
#include <string.h>

static const double LAKE_CX = 47.5 * TILE, LAKE_CY = 27 * TILE, LAKE_RX = 12.5 * TILE, LAKE_RY = 10 * TILE;
static const double POND_CX = 8 * TILE, POND_CY = 22 * TILE, POND_RX = 3.2 * TILE, POND_RY = 2.4 * TILE;
static const double PATH0[][2] = { { 14, 40 }, { 15, 35 }, { 17, 30 }, { 20, 24 }, { 22, 18 }, { 21, 13 }, { 20, 9 } };
static const double PATH1[][2] = { { 20, 24 }, { 25, 25.5 }, { 30, 26.5 }, { 34, 27 } };
#define PX(v) ((v) * TILE + 16)
const double RUINS_X0 = 9 * TILE, RUINS_Y0 = 2 * TILE, RUINS_X1 = 31 * TILE, RUINS_Y1 = 14 * TILE;
const double CAMP_X = 13 * TILE + 16, CAMP_Y = 36 * TILE + 16;
const struct Dock DOCK = { 35, 25, 40, 28, { 41, 45, 27 } };

/** < 0 inside water, in "radius" units. */
double waterField(double x, double y) {
  double n = (fbm(x / 90, y / 90, 3, 3) - 0.5) * 0.5 + (vnoise(x / 22, y / 22, 9) - 0.5) * 0.06;
  double ax = (x - LAKE_CX) / LAKE_RX, ay = (y - LAKE_CY) / LAKE_RY, bx = (x - POND_CX) / POND_RX, by = (y - POND_CY) / POND_RY;
  double a = ax * ax + ay * ay - 1 + n;
  double b = bx * bx + by * by - 1 + n * 1.4;
  return fmin(a, b);
}
double pathField(double x, double y) {
  double d = 1e9;
  for (int i = 0; i < 6; i++) d = fmin(d, segDist(x, y, PX(PATH0[i][0]), PX(PATH0[i][1]), PX(PATH0[i + 1][0]), PX(PATH0[i + 1][1])));
  for (int i = 0; i < 3; i++) d = fmin(d, segDist(x, y, PX(PATH1[i][0]), PX(PATH1[i][1]), PX(PATH1[i + 1][0]), PX(PATH1[i + 1][1])));
  double dc = hypot(x - CAMP_X, (y - CAMP_Y) * 1.3) - 60;
  return fmin(d, fmax(0, dc) + 10) + (fbm(x / 30, y / 30, 5, 2) - 0.5) * 18;
}
bool inRuins(double x, double y) { return x > RUINS_X0 && x < RUINS_X1 && y > RUINS_Y0 && y < RUINS_Y1; }
double stoneField(double x, double y) {
  if (!inRuins(x, y)) return 0;
  double cx = (RUINS_X0 + RUINS_X1) / 2, cy = (RUINS_Y0 + RUINS_Y1) / 2;
  double e = 1 - hypot((x - cx) / ((RUINS_X1 - RUINS_X0) / 2), (y - cy) / ((RUINS_Y1 - RUINS_Y0) / 2));
  return e * 1.4 + (fbm(x / 50, y / 50, 11, 3) - 0.5) * 0.9;
}
double lushField(double x, double y) {
  double w = waterField(x, y);
  return fbm(x / 220, y / 220, 21, 3) * 0.9 + fmax(0, 0.5 - w) * 0.45;
}
static bool isDockTile(int tx, int ty) {
  return (tx >= DOCK.x0 && tx <= DOCK.x1 && ty >= DOCK.y0 && ty <= DOCK.y1) || (ty == DOCK.pier.y && tx >= DOCK.pier.x0 && tx <= DOCK.pier.x1);
}

const char *zoneAt(double px, double py) {
  if (inRuins(px, py)) return "Ruínas de Velmoor";
  if (hypot(px - CAMP_X, py - CAMP_Y) < 7 * TILE) return "Acampamento do Vale";
  if (waterField(px, py) < 0.9 && px > 26 * TILE) return "Lago Espelhado";
  return "Bosque de Brumafolha";
}

int tileAt(const World *W, int tx, int ty) { return tx < 0 || ty < 0 || tx >= MW || ty >= MH ? -1 : W->tiles[ty * MW + tx]; }
bool wblocked(const World *W, int tx, int ty) { return tx < 0 || ty < 0 || tx >= MW || ty >= MH || W->block[ty * MW + tx] == 1; }

static World *CW;
static uint8_t reserve[MW * MH];

static bool freeAt(int tx, int ty, int r) {
  for (int j = -r; j <= r; j++)
    for (int i = -r; i <= r; i++) {
      int t = tileAt(CW, tx + i, ty + j);
      if (t != T_GRASS || reserve[(ty + j) * MW + tx + i]) return false;
    }
  return true;
}
static Obj *put(Obj o) {
  if (CW->nobj == CW->capobj) { CW->capobj = CW->capobj ? CW->capobj * 2 : 256; CW->objects = realloc(CW->objects, sizeof(Obj) * CW->capobj); }
  CW->objects[CW->nobj] = o;
  return &CW->objects[CW->nobj++];
}
static void blockAt(int bx, int by) { if (bx >= 0 && by >= 0 && bx < MW && by < MH) { CW->block[by * MW + bx] = 1; reserve[by * MW + bx] = 1; } }
static void keep(int x0, int y0, int x1, int y1) { for (int y = y0; y <= y1; y++) for (int x = x0; x <= x1; x++) if (x >= 0 && y >= 0 && x < MW && y < MH) reserve[y * MW + x] = 1; }
static Obj O(int kind, double x, double y) { Obj o = { kind, x, y, 0, 0, 0, false, NULL }; return o; }
static bool inList(int v, const int *l, int n) { for (int i = 0; i < n; i++) if (l[i] == v) return true; return false; }

static void wall(int x0, int x1, int y, const int *broken, int nb) {
  for (int tx = x0; tx <= x1; tx++) {
    if (inList(tx, broken, nb)) {
      if (hash2(tx, y, 4) < 0.5) { Obj o = O(O_RUBBLE, tx * TILE + 16, y * TILE + 26); o.seed = tx * 7 + y; put(o); }
      continue;
    }
    int h = 2 + (int)floor(hash2(tx, y, 2) * 3);
    Obj o = O(O_WALL, tx * TILE, y * TILE + TILE); o.h = h; o.seed = tx * 13 + y; put(o); blockAt(tx, y);
  }
}
static void vwall(int x, int y0, int y1, const int *broken, int nb) {
  for (int ty = y0; ty <= y1; ty++) {
    if (inList(ty, broken, nb)) continue;
    Obj o = O(O_WALL, x * TILE, ty * TILE + TILE); o.h = 2 + (int)floor(hash2(x, ty, 2) * 3); o.seed = x * 5 + ty * 3; put(o); blockAt(x, ty);
  }
}

static Rng R;
static void tryTree(int tx, int ty, bool edge) {
  if (!freeAt(tx, ty, edge ? 0 : 1)) return;
  int kind = ty < 15 && rng_chance(&R, 0.55) ? O_PINE : rng_chance(&R, 0.12) ? O_DEADTREE : O_TREE;
  double x = tx * TILE + 16 + rng_range(&R, -6, 6);
  Obj o = O(kind, x, ty * TILE + 26);
  o.seed = rng_int(&R, 1, 1000000);
  put(o); blockAt(tx, ty);
  keep(tx - 1, ty - 1, tx + 1, ty);
}

void buildWorld(World *W) {
  memset(W, 0, sizeof *W);
  CW = W;
  memset(reserve, 0, sizeof reserve);
  for (int ty = 0; ty < MH; ty++)
    for (int tx = 0; tx < MW; tx++) {
      double x = tx * TILE + 16, y = ty * TILE + 16;
      int i = ty * MW + tx, t = T_GRASS;
      if (stoneField(x, y) > 0.35) t = T_STONE;
      if (pathField(x, y) < 18) t = T_PATH;
      if (waterField(x, y) < 0) t = T_WATER;
      if (isDockTile(tx, ty)) t = T_DOCK;
      W->tiles[i] = (uint8_t)t;
      if (t == T_WATER) W->block[i] = 1;
      if (tx == 0 || ty == 0 || tx == MW - 1 || ty == MH - 1) W->block[i] = 1;
    }

  // clearings that stay clear
  keep(9, 32, 18, 40); // camp
  keep(14, 4, 27, 12); // ruins court
  keep(18, 19, 25, 24); // patrol clearing

  // --- the camp
  put(O(O_CAMPFIRE, CAMP_X, CAMP_Y + 6)); blockAt(13, 36);
  { Obj o = O(O_TENT, 10 * TILE + 16, 34 * TILE + 28); o.color = 0; put(o); blockAt(10, 34); blockAt(11, 34); blockAt(9, 34); }
  { Obj o = O(O_TENT, 17 * TILE + 8, 34 * TILE + 24); o.color = 1; put(o); blockAt(16, 34); blockAt(17, 34); }
  put(O(O_LOG, CAMP_X - 34, CAMP_Y + 14));
  put(O(O_LOG, CAMP_X + 30, CAMP_Y + 26));
  put(O(O_CRATE, 11 * TILE + 4, 37 * TILE + 26)); blockAt(11, 37);
  put(O(O_BARREL, 9 * TILE + 26, 36 * TILE + 22)); blockAt(9, 36);

  // --- the dock: posts along its edges
  for (int tx = DOCK.x0; tx <= DOCK.x1 + 1; tx += 2) {
    Obj a = O(O_POST, tx * TILE + 2, DOCK.y0 * TILE + 8); a.h = 14; put(a);
    Obj b = O(O_POST, tx * TILE + 2, (DOCK.y1 + 1) * TILE + 2); b.h = 10; put(b);
  }
  for (int tx = DOCK.pier.x0; tx <= DOCK.pier.x1 + 1; tx += 2) { Obj o = O(O_POST, tx * TILE + 2, (DOCK.pier.y + 1) * TILE + 2); o.h = 8; put(o); }
  { Obj o = O(O_POST, (DOCK.pier.x1 + 1) * TILE + 4, DOCK.pier.y * TILE + 4); o.h = 18; put(o); }
  put(O(O_BARREL, 39 * TILE + 8, 25 * TILE + 22)); blockAt(39, 25);
  put(O(O_CRATE, 40 * TILE + 12, 25 * TILE + 26)); blockAt(40, 25);
  put(O(O_ROWBOAT, 40 * TILE + 8, 31 * TILE + 20));

  // --- the ruins: broken walls around a court, pillars, the goblin camp
  { int b[] = { 16, 17, 23, 26 }; wall(12, 28, 3, b, 4); }
  { int b[] = { 14 }; wall(12, 15, 13, b, 1); }
  { int b[] = { 26 }; wall(25, 28, 13, b, 1); }
  { int b[] = { 7, 8 }; vwall(12, 4, 12, b, 2); }
  { int b[] = { 9, 10 }; vwall(28, 4, 12, b, 2); }
  { int P[4][3] = { { 16, 6, 3 }, { 24, 6, 2 }, { 16, 10, 1 }, { 24, 10, 3 } };
    for (int i = 0; i < 4; i++) { Obj o = O(O_PILLAR, P[i][0] * TILE + 16, P[i][1] * TILE + 28); o.h = P[i][2]; o.seed = P[i][0] + P[i][1]; put(o); blockAt(P[i][0], P[i][1]); } }
  { Obj o = O(O_CAMPFIRE, 20 * TILE + 16, 8 * TILE + 24); o.goblin = true; put(o); blockAt(20, 8); }
  put(O(O_BANNER, 18 * TILE + 16, 5 * TILE + 26)); blockAt(18, 5);
  put(O(O_BONES, 22 * TILE + 10, 10 * TILE + 20));
  put(O(O_BONES, 14 * TILE + 20, 8 * TILE + 12));
  for (int i = 0; i < 6; i++) { Obj o = O(O_RUBBLE, (13 + ((i * 37) % 15)) * TILE + 10, (5 + ((i * 23) % 7)) * TILE + 20); o.seed = i + 40; put(o); }
  // JS gives "bones" no seed: makeBones(undefined) is new Rng(undefined) -> seed 1, and the art key is "bonesundefined"
  for (int i = 0; i < W->nobj; i++) if (W->objects[i].kind == O_BONES) W->objects[i].seed = -1;

  // --- trees: a dense border, then scattered groves
  rng_seed(&R, 7);
  for (int ty = 0; ty < MH; ty++)
    for (int tx = 0; tx < MW; tx++) {
      int e = tx; if (ty < e) e = ty; if (MW - 1 - tx < e) e = MW - 1 - tx; if (MH - 1 - ty < e) e = MH - 1 - ty;
      double n = fbm(tx / 6.0, ty / 6.0, 31, 2);
      if (e <= 2 && rng_chance(&R, 0.7)) tryTree(tx, ty, true);
      else if (e > 2 && n > 0.6 && rng_chance(&R, 0.28)) tryTree(tx, ty, false);
    }
  for (int tx = 0; tx < MW; tx++) for (int ty = 0; ty < MH; ty++) {
    int e = tx; if (ty < e) e = ty; if (MW - 1 - tx < e) e = MW - 1 - tx; if (MH - 1 - ty < e) e = MH - 1 - ty;
    if (e == 0) W->block[ty * MW + tx] = 1;
  }

  // rocks, bushes, ferns
  for (int i = 0; i < 260; i++) {
    int tx = rng_int(&R, 2, MW - 3), ty = rng_int(&R, 2, MH - 3);
    double x = tx * TILE + rng_range(&R, 4, 28), y = ty * TILE + rng_range(&R, 8, 30);
    int t = tileAt(W, tx, ty);
    if (t == T_WATER) {
      if (waterField(x, y) > -0.5 && rng_chance(&R, 0.25)) { Obj o = O(O_WATERROCK, x, y); o.seed = i; put(o); }
      continue;
    }
    if (t != T_GRASS || reserve[ty * MW + tx]) continue;
    double r = rng_next(&R);
    Obj o = O(r < 0.2 ? O_ROCK : r < 0.55 ? O_BUSH : O_FERN, x, y); o.seed = i; put(o);
    if (r < 0.2) blockAt(tx, ty);
  }

  // tall grass clumps that sway (not blocking)
  for (int i = 0; i < 6500; i++) {
    double x = rng_range(&R, 2 * TILE, (MW - 2) * TILE), y = rng_range(&R, 2 * TILE, (MH - 2) * TILE);
    int tx = (int)(x / TILE), ty = (int)(y / TILE), t = tileAt(W, tx, ty);
    if (t != T_GRASS) continue;
    double l = lushField(x, y);
    if (rng_next(&R) > (l - 0.3) * 1.3) continue;
    if (W->ngrass == W->capgrass) { W->capgrass = W->capgrass ? W->capgrass * 2 : 1024; W->grass = realloc(W->grass, sizeof(Grass) * W->capgrass); }
    Grass g = { x, y, 0, 0 };
    g.v = rng_int(&R, 0, 5);
    g.ph = rng_range(&R, 0, 6.28);
    W->grass[W->ngrass++] = g;
  }
}
