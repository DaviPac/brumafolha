// Characters, built from parts at the pixel level: 4 facings, a 4-frame walk, an attack and a cast pose
// (art/chars.js). Seen from high up and in front (3/4 top-down), big heads, lit from the top left, outlined dark.
#include "game.h"
#include <stdlib.h>
#include <string.h>

static const RGB INK = { 22, 16, 28 };
static RGB METAL[4], GOLD[3], WOOD[3];
Spec SPECS[SPEC_N];

static void rh(RGB *out, int *n, int k, const char *a, const char *b, const char *c, const char *d) {
  const char *hs[4] = { a, b, c, d };
  ramp_hex(out, k, hs);
  if (n) *n = k;
}
void initSpecs(void) {
  rh(METAL, NULL, 4, "#3a4250", "#6e7a90", "#aab6c8", "#eef4ff");
  rh(GOLD, NULL, 3, "#6a4410", "#c48a1c", "#f4d050", 0);
  rh(WOOD, NULL, 3, "#3a2014", "#6a4026", "#9a6236", 0);
  Spec *s;
  s = &SPECS[SPEC_HERO]; memset(s, 0, sizeof *s);
  rh(s->skin, &s->nskin, 4, "#8a4e3a", "#c47e5e", "#eab08a", "#f8d0b0"); rh(s->hair, &s->nhair, 4, "#2a1610", "#4a2a1a", "#6e4026", "#90582e"); s->hairStyle = HS_SHORT;
  rh(s->tunic, &s->ntunic, 4, "#3e1e1a", "#6a2e22", "#94442a", "#b8623a"); rh(s->pants, &s->npants, 3, "#1e1e2a", "#2e3040", "#43465a", 0); rh(s->boots, &s->nboots, 3, "#1a1010", "#3a2218", "#5a3622", 0);
  rh(s->cape, &s->ncape, 4, "#16301e", "#244a2a", "#36663a", "#4c8248"); s->weapon = W_SWORD; s->ears = E_HUMAN; s->eyes = (RGB){ 20, 14, 20 };

  s = &SPECS[SPEC_MAGE]; memset(s, 0, sizeof *s);
  rh(s->skin, &s->nskin, 4, "#9a6a5a", "#d8a088", "#f4cdb0", "#ffe6d0"); rh(s->hair, &s->nhair, 4, "#3e3a6a", "#6a68a0", "#a0a2d4", "#dcdef6"); s->hairStyle = HS_LONG;
  rh(s->tunic, &s->ntunic, 4, "#1e1438", "#34205e", "#4e3288", "#6e4cb0"); rh(s->pants, &s->npants, 3, "#1e1438", "#34205e", "#4e3288", 0); rh(s->boots, &s->nboots, 3, "#140c1e", "#24183a", "#38264e", 0);
  s->robe = true; s->weapon = W_STAFF; rh(s->orb, &s->norb, 3, "#2a6a8a", "#5ad0ff", "#d0f8ff", 0); s->ears = E_ELF; s->eyes = (RGB){ 40, 90, 120 };
  memcpy(s->trim, GOLD, sizeof GOLD); s->ntrim = 3;

  s = &SPECS[SPEC_MAREN]; memset(s, 0, sizeof *s);
  rh(s->skin, &s->nskin, 4, "#8a5a44", "#c48868", "#e8b490", "#f8d4b4"); rh(s->hair, &s->nhair, 4, "#5a5a60", "#8a8a90", "#b8b8bc", "#e0e0e2"); s->hairStyle = HS_BUN;
  rh(s->tunic, &s->ntunic, 4, "#18283e", "#22405e", "#2e5a80", "#4278a0"); rh(s->pants, &s->npants, 3, "#18283e", "#22405e", "#2e5a80", 0); rh(s->boots, &s->nboots, 3, "#1a1010", "#3a2218", "#5a3622", 0);
  s->robe = true; rh(s->apron, &s->napron, 3, "#8a7a5a", "#c8b890", "#ece0c0", 0); s->weapon = W_NONE; s->ears = E_HUMAN; s->eyes = (RGB){ 20, 14, 20 };

  s = &SPECS[SPEC_GOBLIN]; memset(s, 0, sizeof *s);
  rh(s->skin, &s->nskin, 4, "#2a4a1a", "#4a7a26", "#6ea234", "#94c84a"); s->nhair = 0; s->hairStyle = HS_BALD;
  rh(s->tunic, &s->ntunic, 4, "#2a1c12", "#4a3420", "#6a4e30", "#8a6a42"); rh(s->pants, &s->npants, 3, "#1e1610", "#33261a", "#4a3826", 0); rh(s->boots, &s->nboots, 3, "#140e0a", "#261a10", "#3a2818", 0);
  s->weapon = W_DAGGER; s->ears = E_GOBLIN; s->eyes = (RGB){ 250, 210, 60 }; s->small = true;

  s = &SPECS[SPEC_SHAMAN]; memset(s, 0, sizeof *s);
  rh(s->skin, &s->nskin, 4, "#2a4a1a", "#4a7a26", "#6ea234", "#94c84a"); rh(s->hair, &s->nhair, 4, "#3a1418", "#5e2228", "#86343a", "#a84a4a"); s->hairStyle = HS_HOOD;
  rh(s->tunic, &s->ntunic, 4, "#3a1418", "#5e2228", "#86343a", "#a84a4a"); rh(s->pants, &s->npants, 3, "#1e1610", "#33261a", "#4a3826", 0); rh(s->boots, &s->nboots, 3, "#140e0a", "#261a10", "#3a2818", 0);
  s->robe = true; s->weapon = W_STAFF; rh(s->orb, &s->norb, 3, "#6a1a10", "#ff7a2a", "#ffe0a0", 0); s->ears = E_GOBLIN; s->eyes = (RGB){ 250, 120, 40 }; s->small = true; s->bones = true;

  s = &SPECS[SPEC_CHIEF]; memset(s, 0, sizeof *s);
  rh(s->skin, &s->nskin, 4, "#24401a", "#3e6a24", "#5a8e30", "#7cb040"); rh(s->hair, &s->nhair, 4, "#1a1010", "#2e1c14", "#4a2e1e", "#5e3c24"); s->hairStyle = HS_MOHAWK;
  rh(s->tunic, &s->ntunic, 4, "#2a2a30", "#44464e", "#62666e", "#8a8e96"); rh(s->pants, &s->npants, 3, "#1e1610", "#33261a", "#4a3826", 0); rh(s->boots, &s->nboots, 3, "#140e0a", "#261a10", "#3a2818", 0);
  s->weapon = W_AXE; s->ears = E_GOBLIN; s->eyes = (RGB){ 255, 60, 40 }; s->big = true; rh(s->cape, &s->ncape, 4, "#3a0e10", "#5e1a1a", "#862828", "#a83a32");
}

static void box(PixBuf *pb, double x, double y, double w, double h, Ramp R, int round, bool flipLight, double base) {
  for (int j = 0; j < h; j++)
    for (int i = 0; i < w; i++) {
      if (round && ((i < round && j < round && i + j < round) || (i >= w - round && j < round && (w - 1 - i) + j < round) ||
        (i < round && j >= h - round && i + (h - 1 - j) < round) || (i >= w - round && j >= h - round && (w - 1 - i) + (h - 1 - j) < round))) continue;
      double v = base;
      double li = flipLight ? w - 1 - i : i;
      if (li == 0) v += 0.22;
      if (li == w - 1) v -= 0.28;
      if (j == 0) v += 0.15;
      if (j == h - 1) v -= 0.22;
      pb_set(pb, x + i, y + j, rampAt(R, clamp01(v), (int)(x + i), (int)(y + j)));
    }
}
#define BOX(x, y, w, h, R) box(pb, x, y, w, h, R, 0, false, 0.55)

static Ramp shaded(const RGB *c, int n, double k, RGB *buf) { for (int i = 0; i < n; i++) { buf[i].r = c[i].r * k; buf[i].g = c[i].g * k; buf[i].b = c[i].b * k; } return (Ramp){ buf, n }; }

typedef struct {
  PixBuf *pb; const Spec *S; int dir, frame, pose;
  int cx, feet, lh, th, hh, hw, phase, bob, ly, ty, hy, tw;
  bool side, back;
} Ctx;

static void legs(Ctx *c) {
  PixBuf *pb = c->pb; const Spec *S = c->S; int cx = c->cx, feet = c->feet;
  Ramp boots = { S->boots, S->nboots }, pants = { S->pants, S->npants };
  if (S->robe && !c->side) {
    // feet peeking under the robe
    int l = c->phase == 1 ? -1 : 0, r = c->phase == -1 ? -1 : 0;
    BOX(cx - 4, feet - 2 + l, 3, 2, boots);
    BOX(cx + 1, feet - 2 + r, 3, 2, boots);
    return;
  }
  if (c->side) {
    int sw = c->phase * 2;
    for (int k = 0; k < 2; k++) {
      int dx = k == 0 ? -sw : sw; bool shade = k == 0;
      int x = cx - 1 + dx;
      RGB buf[4];
      BOX(x, c->ly + c->bob, 3, c->lh - 2 - c->bob, shade ? shaded(S->pants, S->npants, 0.8, buf) : pants);
      BOX(x + (c->dir == 2 ? 0 : -1), feet - 2, 4, 2, boots);
    }
    return;
  }
  int l1 = c->phase == 1 ? 1 : 0, l2 = c->phase == -1 ? 1 : 0;
  BOX(cx - 4, c->ly + c->bob, 3, c->lh - 2 - c->bob - l1, pants);
  BOX(cx - 4, feet - 2 - l1, 3, 2, boots);
  BOX(cx + 1, c->ly + c->bob, 3, c->lh - 2 - c->bob - l2, pants);
  BOX(cx + 1, feet - 2 - l2, 3, 2, boots);
}

static void capeBack(Ctx *c) {
  PixBuf *pb = c->pb; const Spec *S = c->S;
  if (!S->ncape) return;
  if (c->back) return; // drawn on top later
  Ramp cape = { S->cape, S->ncape };
  if (c->side) {
    int x = c->dir == 2 ? c->cx - 5 : c->cx + 2;
    int flutter = c->pose == POSE_WALK ? (int[]){ 0, 1, 0, 1 }[c->frame] : 0;
    box(pb, x, c->ty + 1, 3, c->th + 2 + flutter, cape, 0, c->dir == 1, 0.55);
  } else {
    BOX(c->cx - c->tw / 2.0 - 1, c->ty + 1, c->tw + 2, c->th + 1, cape);
  }
}

static void torso(Ctx *c) {
  PixBuf *pb = c->pb; const Spec *S = c->S; int cx = c->cx;
  Ramp tunic = { S->tunic, S->ntunic };
  int w = c->side ? 7 : c->tw, x = cx - (int)floor(w / 2.0);
  int h = S->robe ? c->feet - c->ty - (c->side ? 1 : 2) : c->th;
  box(pb, x, c->ty, w, h, tunic, 1, c->dir == 1, 0.55);
  if (S->robe) {
    // flare at the hem
    box(pb, x - 1, c->ty + h - 3, w + 2, 3, tunic, 0, c->dir == 1, 0.55);
    if (S->ntrim) for (int i = 0; i < w + 2; i++) pb_set(pb, x - 1 + i, c->ty + h - 1, S->trim[(i & 1) + 1]);
    if (S->napron && !c->back) BOX(x + 1 + (c->side ? (c->dir == 2 ? 2 : -1) : 1), c->ty + 4, c->side ? 3 : w - 4, h - 6, ((Ramp){ S->apron, S->napron }));
  } else {
    // belt
    RGB belt = { 40, 24, 18 };
    for (int i = 0; i < w; i++) pb_set(pb, x + i, c->ty + c->th - 3, belt);
    if (!c->back) pb_set(pb, x + (c->side ? (c->dir == 2 ? w - 2 : 1) : (int)floor(w / 2.0)), c->ty + c->th - 3, GOLD[2]);
  }
  if (!c->back && !c->side) { pb_set(pb, cx - 1, c->ty, S->skin[1]); pb_set(pb, cx, c->ty, S->skin[1]); }
  RGB bone = { 230, 220, 196 };
  if (S->bones && !c->back) for (int i = 0; i < w; i += 2) pb_set(pb, x + i, c->ty + 1, bone);
}

static void arm(Ctx *c, double x, double y, int len, bool shade, bool hand) {
  PixBuf *pb = c->pb; const Spec *S = c->S;
  RGB buf[4];
  Ramp R = shade ? shaded(S->tunic, S->ntunic, 0.75, buf) : (Ramp){ S->tunic, S->ntunic };
  BOX(x, y, 2, len - 2, R);
  if (hand) BOX(x, y + len - 2, 2, 2, ((Ramp){ S->skin, S->nskin }));
}

static void arms(Ctx *c) {
  PixBuf *pb = c->pb; const Spec *S = c->S; int cx = c->cx, ty = c->ty;
  int swing = c->pose == POSE_WALK ? c->phase : 0;
  int up = c->pose == POSE_CAST ? -5 : 0;
  Ramp skin = { S->skin, S->nskin }, tunic = { S->tunic, S->ntunic };
  if (c->side) {
    int fwd = c->dir == 2 ? 1 : -1;
    if (c->pose == POSE_ATTACK) {
      // arm thrust forward
      for (int i = 0; i < 6; i++) { pb_set(pb, cx + fwd * i, ty + 3, S->tunic[2]); pb_set(pb, cx + fwd * i, ty + 4, S->tunic[1]); }
      BOX(cx + fwd * 6 - (fwd < 0 ? 1 : 0), ty + 3, 2, 2, skin);
      return;
    }
    arm(c, cx - 1 - swing * fwd * 2, ty + 1 + up, 7, false, true);
    return;
  }
  int lx = cx - (int)floor(c->tw / 2.0) - 2, rx = cx + (int)ceil(c->tw / 2.0);
  if (c->pose == POSE_ATTACK && !c->back) {
    arm(c, lx, ty + 1, 7, false, true);
    // weapon arm reaches forward/down
    BOX(rx - 1, ty + 4, 2, 6, tunic);
    BOX(rx - 1, ty + 10, 2, 2, skin);
    return;
  }
  arm(c, lx, ty + 1 + swing + up, 7, false, true);
  arm(c, rx, ty + 1 - swing + up, 7, true, true);
}

static void head(Ctx *c) {
  PixBuf *pb = c->pb; const Spec *S = c->S; int cx = c->cx, hy = c->hy, hh = c->hh;
  int w = c->side ? 11 : c->hw;
  int x = cx - (int)floor(w / 2.0);
  box(pb, x, hy, w, hh, (Ramp){ S->skin, S->nskin }, 3, c->dir == 1, 0.6);
  // ears
  int earY = hy + (int)floor(hh * 0.55);
  if (S->ears == E_ELF || S->ears == E_GOBLIN) {
    int L = S->ears == E_GOBLIN ? 4 : 2;
    int sides[2], ns = 0;
    if (c->side) sides[ns++] = c->dir == 2 ? -1 : 1; else { sides[ns++] = -1; sides[ns++] = 1; }
    for (int k = 0; k < ns; k++) {
      int s = sides[k];
      int ex = s < 0 ? x - 1 : x + w;
      for (int i = 0; i < L; i++) { pb_set(pb, ex + s * i, earY - i, S->skin[i == L - 1 ? 3 : 2]); pb_set(pb, ex + s * i, earY - i + 1, S->skin[1]); }
    }
  }
  if (c->back) return;
  // face
  int ey = hy + (int)floor(hh * 0.58);
  RGB dk = { 20, 10, 10 }, blush = { 230, 120, 110 }, fang = { 240, 240, 220 };
#define EYE(ex) do { if (S->small) { pb_set(pb, ex, ey, S->eyes); pb_set(pb, ex, ey + 1, dk); } else { pb_set(pb, ex, ey, S->eyes); pb_set(pb, ex, ey + 1, S->eyes); } } while (0)
  if (c->side) {
    int f = c->dir == 2 ? 1 : -1;
    EYE(cx + f * 3);
    pb_set(pb, cx + f * 6, ey + 1, S->skin[2]); // nose
    pb_set(pb, cx + f * 3, ey + 3, S->skin[0]);
  } else {
    EYE(cx - 3); EYE(cx + 2);
    pb_set(pb, cx - 4, ey + 2, blush); pb_set(pb, cx + 3, ey + 2, blush);
    pb_set(pb, cx - 1, ey + 3, S->skin[0]); pb_set(pb, cx, ey + 3, S->skin[0]);
    if (S->small) { pb_set(pb, cx - 2, ey + 3, fang); pb_set(pb, cx + 1, ey + 3, fang); } // little fangs
  }
#undef EYE
}

static void hair(Ctx *c) {
  PixBuf *pb = c->pb; const Spec *S = c->S; int cx = c->cx, hy = c->hy, hh = c->hh, dir = c->dir;
  if (!S->nhair || S->hairStyle == HS_BALD) return;
  Ramp H = { S->hair, S->nhair };
  int w = c->side ? 11 : c->hw;
  int x = cx - (int)floor(w / 2.0);
#define PX(i, j, v) pb_set(pb, x + (i), hy + (j), rampAt(H, clamp01(v), x + (i), hy + (j)))
#define SHADE(i, j) (0.62 + (dir == 1 ? (i) - w / 2.0 : w / 2.0 - (i)) * 0.035 - (j) * 0.03)
  if (S->hairStyle == HS_MOHAWK) {
    for (int j = -3; j < hh - 4; j++) for (int i = w / 2 - 1; i <= w / 2 + 1; i++) if (j < 3 || c->back) PX(i, j, SHADE(i, j) + 0.1);
    return;
  }
  bool hood = S->hairStyle == HS_HOOD;
  bool lng = S->hairStyle == HS_LONG || hood;
  for (int j = -1; j < hh + (lng ? 6 : 0); j++)
    for (int i = -1; i <= w; i++) {
      bool on = false;
      if (c->back) on = j < hh - (lng ? -5 : 2) && i >= (j < 1 ? 1 : 0) - (j > 2 && hood ? 1 : 0) && i < w - (j < 1 ? 1 : 0) + (j > 2 && hood ? 1 : 0);
      else if (c->side) {
        bool f = dir == 2;
        bool backSide = f ? i < 5 : i > w - 6;
        on = (j < 4 && i >= 0 && i < w) || (j == 4 && (f ? i < 9 : i > 1)) || (backSide && j < (lng ? hh + 5 : hh - 2) && i >= -1 && i <= w);
        if (hood) on = on || (j < hh && (f ? i < 3 : i > w - 4));
      } else {
        on = j < 4 && i >= 0 && i < w;
        if (j == -1) on = i >= 2 && i < w - 2;
        if (j == 4) on = i < 3 || i > w - 4 || i == 5 || (i == 6 && !hood);
        if (j > 4) on = (i <= (hood ? 1 : 0) || i >= w - (hood ? 2 : 1)) && j < (lng ? hh + 5 : hh - 3);
        if (hood && j > 4) on = (i <= 1 || i >= w - 2) && j < hh + 1;
      }
      if (on) PX(i, j, SHADE(i, j));
    }
  if (S->hairStyle == HS_BUN) for (int j = -4; j < 0; j++) for (int i = 4; i < 8; i++) if (!(j == -4 && (i == 4 || i == 7))) PX(i, j, 0.7 - j * 0.02);
  // a highlight streak
  if (!hood) for (int i = 2; i < w - 4; i += 2) pb_set(pb, x + i, hy + 1, H.c[H.n - 1]);
#undef PX
#undef SHADE
}

static void capeFront(Ctx *c) {
  PixBuf *pb = c->pb; const Spec *S = c->S; int cx = c->cx;
  if (!S->ncape || !c->back) return;
  int flutter = c->pose == POSE_WALK ? (int[]){ 0, 1, 0, 1 }[c->frame] : 0;
  box(pb, cx - (int)floor(c->tw / 2.0) - 1, c->ty, c->tw + 2, c->th + 3 + flutter, (Ramp){ S->cape, S->ncape }, 1, false, 0.55);
  for (int j = 3; j < c->th + 2; j += 1) { pb_set(pb, cx - 2, c->ty + j, S->cape[1]); pb_set(pb, cx + 2, c->ty + j, S->cape[1]); }
}

static void orb(Ctx *c, double x, double y) {
  PixBuf *pb = c->pb; const RGB *O = c->S->orb;
  pb_set(pb, x, y - 1, O[2]); pb_set(pb, x - 1, y, O[1]); pb_set(pb, x, y, O[2]); pb_set(pb, x + 1, y, O[1]); pb_set(pb, x, y + 1, O[0]);
  if (c->pose == POSE_CAST) { pb_set(pb, x, y - 2, O[2]); pb_set(pb, x - 2, y, O[1]); pb_set(pb, x + 2, y, O[1]); }
}

static void weapon(Ctx *c, bool behind) {
  PixBuf *pb = c->pb; const Spec *S = c->S; int cx = c->cx, ty = c->ty, hy = c->hy, feet = c->feet;
  int W = S->weapon;
  if (W == W_NONE) return;
  bool isStaff = W == W_STAFF;
  Ramp metal = RAMP(METAL);
  if (c->back) {
    if (!behind) return;
    if (isStaff) { for (int j = hy - 4; j < feet - 1; j++) pb_set(pb, cx + 6, j, WOOD[j % 3 == 0 ? 1 : 2]); orb(c, cx + 6, hy - 5); return; }
    // across the back
    int len = W == W_DAGGER ? 5 : 11;
    for (int i = 0; i < len; i++) { pb_set(pb, cx - 5 + i, ty + 8 - i, METAL[2]); pb_set(pb, cx - 4 + i, ty + 8 - i, METAL[1]); }
    pb_set(pb, cx - 6, ty + 9, WOOD[1]); pb_set(pb, cx - 7, ty + 10, WOOD[1]);
    return;
  }
  if (behind) return;
  if (c->side) {
    int f = c->dir == 2 ? 1 : -1;
    if (isStaff) {
      int hx = cx + (c->pose == POSE_CAST ? f * 2 : 0);
      int top = hy - (c->pose == POSE_CAST ? 8 : 4);
      for (int j = top; j < feet - 1; j++) pb_set(pb, hx + f * 1, j, WOOD[j % 3 == 0 ? 1 : 2]);
      orb(c, hx + f, top - 1);
      return;
    }
    if (c->pose == POSE_ATTACK) {
      int len = W == W_DAGGER ? 5 : 11;
      for (int i = 0; i < len; i++) { pb_set(pb, cx + f * (8 + i), ty + 3, METAL[3]); pb_set(pb, cx + f * (8 + i), ty + 4, METAL[1]); }
      pb_set(pb, cx + f * 7, ty + 2, GOLD[1]); pb_set(pb, cx + f * 7, ty + 5, GOLD[1]);
      if (W == W_AXE) BOX(cx + f * (8 + len - 4) - (f < 0 ? 3 : 0), ty, 4, 7, metal);
      return;
    }
    int hx = cx - 1, hy2 = ty + 7;
    int len = W == W_DAGGER ? 4 : 9;
    for (int i = 0; i < len; i++) pb_set(pb, hx + f * (1 + i * 0.6), hy2 + 1 + i * 0.8, METAL[2]);
    pb_set(pb, hx, hy2, GOLD[1]); pb_set(pb, hx + f, hy2, GOLD[1]);
    if (W == W_AXE) BOX(hx + f * 5 - 1, hy2 + 5, 4, 4, metal);
    return;
  }
  // facing us
  int hx = cx + (int)ceil(c->tw / 2.0);
  if (isStaff) {
    int top = hy - (c->pose == POSE_CAST ? 8 : 3);
    for (int j = top; j < feet; j++) pb_set(pb, hx + 2, j, WOOD[j % 3 == 0 ? 1 : 2]);
    orb(c, hx + 2, top - 1);
    return;
  }
  if (c->pose == POSE_ATTACK) {
    int len = W == W_DAGGER ? 5 : 11;
    for (int i = 0; i < len; i++) { pb_set(pb, hx, ty + 12 + i, METAL[3]); pb_set(pb, hx + 1, ty + 12 + i, METAL[1]); }
    pb_set(pb, hx - 1, ty + 12, GOLD[1]); pb_set(pb, hx + 2, ty + 12, GOLD[1]);
    if (W == W_AXE) BOX(hx + 1, ty + 12 + len - 4, 4, 4, metal);
    return;
  }
  int top = ty + 6;
  int len = W == W_DAGGER ? 4 : 10;
  pb_set(pb, hx - 1 + 1, top, GOLD[1]); pb_set(pb, hx + 2, top + 1, GOLD[1]); pb_set(pb, hx - 1, top + 1, GOLD[1]);
  for (int i = 0; i < len; i++) { pb_set(pb, hx + 1, top + 2 + i, METAL[2]); pb_set(pb, hx + 2, top + 2 + i, METAL[1]); }
  if (W == W_AXE) BOX(hx + 2, top + len - 3, 4, 4, metal);
}

static PixBuf drawSprite(const Spec *S, int dir, int frame, int pose) {
  PixBuf pbv = pb_new(SW, SH);
  Ctx c; memset(&c, 0, sizeof c);
  c.pb = &pbv; c.S = S; c.dir = dir; c.frame = frame; c.pose = pose;
  c.cx = 13;
  bool sm = S->small, big = S->big;
  // layout
  c.feet = 34;
  c.lh = sm ? 5 : 7; c.th = sm ? 7 : big ? 11 : 10; c.hh = sm ? 11 : 12; c.hw = 12;
  c.phase = pose == POSE_WALK ? (int[]){ 1, 0, -1, 0 }[frame] : 0;
  c.bob = pose == POSE_WALK && frame % 2 == 0 ? 1 : 0;
  c.ly = c.feet - c.lh;
  c.ty = c.ly - c.th + 1 + c.bob;
  c.hy = c.ty - c.hh + 1;
  c.tw = big ? 12 : sm ? 9 : 10;
  c.side = dir == 1 || dir == 2;
  c.back = dir == 3;

  weapon(&c, true);
  capeBack(&c);
  if (c.side) { // the far arm, behind the body
    int fwd = dir == 2 ? 1 : -1, swing = pose == POSE_WALK ? c.phase : 0;
    arm(&c, c.cx - 1 + swing * fwd * 2, c.ty + 1, 6, true, true);
  }
  legs(&c);
  torso(&c);
  capeFront(&c);
  arms(&c);
  head(&c);
  hair(&c);
  weapon(&c, false);
  pb_outline(&pbv, INK);
  return pbv;
}

/** dirs: 0 down, 1 left, 2 right, 3 up. frames: walk0..3, idle, attack, cast. */
Character *buildCharacter(const Spec *spec) {
  Character *ch = calloc(1, sizeof *ch);
  for (int dir = 0; dir < 4; dir++)
    for (int f = 0; f < 7; f++) {
      PixBuf pb = f < 4 ? drawSprite(spec, dir, f, POSE_WALK) : drawSprite(spec, dir, 0, f == 4 ? POSE_IDLE : f == 5 ? POSE_ATTACK : POSE_CAST);
      ch->frames[dir][f] = pb_img(&pb);
      // white silhouettes for the hit flash
      Img fl = img_new(SW, SH);
      for (int i = 0; i < SW * SH; i++) if (pb.d[i * 4 + 3]) { fl.px[i * 4] = fl.px[i * 4 + 1] = fl.px[i * 4 + 2] = fl.px[i * 4 + 3] = 255; }
      ch->flash[dir][f] = fl;
      pb_free(&pb);
    }
  return ch;
}

/** Portrait: the head and shoulders of the idle front frame, scaled up. */
Img portrait(const Character *ch, int scale) {
  const Img *src = &ch->frames[0][4];
  Img out = img_new(SW * scale, 24 * scale);
  for (int y = 0; y < 24 * scale; y++) for (int x = 0; x < SW * scale; x++)
    memcpy(out.px + ((size_t)y * out.w + x) * 4, src->px + ((size_t)(y / scale) * SW + x / scale) * 4, 4);
  return out;
}
