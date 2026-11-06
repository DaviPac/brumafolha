// All sound is synthesized at run time, like the art: no audio files (audio.js).
// The web version builds its sounds out of Web Audio nodes; this file carries a small engine with the same
// building blocks (oscillators, noise buffers, biquad filters, gains with scheduled automation, a convolution
// hall, a compressor and limiter), so every sound below reads like its JS original.
// - music: generative step sequencer, one track per mood (meadow, ruins, combat) plus short stings
// - ambience: wind, lapping water, campfire crackle, birds, drips in the ruins
// - sfx: footsteps by surface, blades, spells, dice, UI
#include "game.h"
#include <SDL.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>

#define SR 48000
#define BLOCK 128

// ================================================================ engine
enum { EV_SET, EV_LIN, EV_EXP, EV_TARGET, EV_CURVE };
typedef struct { int type; double t, v, tc, dur; float *curve; int ncurve; } PEv;
typedef struct Node Node;
typedef struct Param {
  double value;
  PEv *ev; int nev, cap;      // future events, sorted by time
  bool hasAct; PEv act;        // the last event passed (still shaping the value)
  double segT0, segV0;         // where the current segment starts
  double cur;                  // last computed value
  double actV0;                // value when a target / curve started
  Node **mods; int nmods, capmods;
} Param;

enum { N_GAIN, N_OSC, N_BUF, N_BIQUAD };
enum { W_SINE, W_TRI, W_SAW, W_SQUARE };
enum { F_LOWPASS, F_HIGHPASS, F_BANDPASS };
typedef struct { Node *n; Param *p; } Edge;
struct Node {
  int type; bool persistent;
  float out[BLOCK]; bool silent;
  uint64_t block;
  Node **in; int nin, capin;
  Edge *outs; int nouts, capouts;
  Param p1, p2;
  // sources
  int wave; double phase, start, stop;
  const float *buf; int buflen; double offset; bool loop; long pos;
  // biquad
  int ftype; double b0, b1, b2, a1, a2, x1, x2, y1, y2; double lastF, lastQ; bool coefOk;
  // garbage collection
  double deadAt; bool dead;
};

static SDL_AudioDeviceID dev;
static bool started;
static uint64_t frames;  // samples rendered so far
static uint64_t blockId;
static Node **nodes; static int nnodes, capnodes;
static float noiseBuf[SR * 2], brownBuf[SR * 2];
static double now(void) { return (double)frames / SR; }

static void lockA(void) { if (dev) SDL_LockAudioDevice(dev); }
static void unlockA(void) { if (dev) SDL_UnlockAudioDevice(dev); }

static void param_init(Param *p, double v) { memset(p, 0, sizeof *p); p->value = v; p->cur = v; p->segT0 = now(); p->segV0 = v; }
static void param_insert(Param *p, PEv e) {
  if (p->nev == p->cap) { p->cap = p->cap ? p->cap * 2 : 4; p->ev = realloc(p->ev, sizeof(PEv) * p->cap); }
  int i = p->nev;
  while (i > 0 && p->ev[i - 1].t > e.t) { p->ev[i] = p->ev[i - 1]; i--; }
  p->ev[i] = e; p->nev++;
}
static void p_set(Param *p, double v, double t) { PEv e = { EV_SET, t, v, 0, 0, NULL, 0 }; param_insert(p, e); }
static void p_lin(Param *p, double v, double t) { PEv e = { EV_LIN, t, v, 0, 0, NULL, 0 }; param_insert(p, e); }
static void p_exp(Param *p, double v, double t) { PEv e = { EV_EXP, t, v, 0, 0, NULL, 0 }; param_insert(p, e); }
static void p_target(Param *p, double v, double t, double tc) { PEv e = { EV_TARGET, t, v, tc, 0, NULL, 0 }; param_insert(p, e); }
static void p_curve(Param *p, const float *c, int n, double t, double dur) {
  float *cc = malloc(sizeof(float) * n); memcpy(cc, c, sizeof(float) * n);
  PEv e = { EV_CURVE, t, 0, 0, dur, cc, n }; param_insert(p, e);
}
static void p_cancel(Param *p, double t) {
  int w = 0;
  for (int i = 0; i < p->nev; i++) { if (p->ev[i].t >= t) { free(p->ev[i].curve); continue; } p->ev[w++] = p->ev[i]; }
  p->nev = w;
}
static void p_value(Param *p, double v) { p->value = v; if (!p->hasAct && !p->nev) { p->cur = v; p->segV0 = v; } }
static void param_free(Param *p) {
  for (int i = 0; i < p->nev; i++) free(p->ev[i].curve);
  if (p->hasAct) free(p->act.curve);
  free(p->ev); free(p->mods);
}

/** The automation's value at time T; T only moves forward. */
static double param_at(Param *p, double T) {
  for (;;) {
    if (!p->nev) break;
    PEv *e = &p->ev[0];
    if (e->type == EV_LIN || e->type == EV_EXP) {
      if (T < e->t) {
        double t0 = p->segT0, v0 = p->segV0, t1 = e->t, v1 = e->v;
        if (T <= t0) return p->cur = v0;
        double k = (T - t0) / (t1 - t0);
        if (e->type == EV_LIN) return p->cur = v0 + (v1 - v0) * k;
        if (v0 == 0 || v1 == 0 || (v0 < 0) != (v1 < 0)) return p->cur = v0;
        return p->cur = v0 * pow(v1 / v0, k);
      }
    } else if (T < e->t) break;
    // pass this event
    PEv ev = *e;
    memmove(p->ev, p->ev + 1, sizeof(PEv) * (p->nev - 1)); p->nev--;
    if (p->hasAct) free(p->act.curve);
    p->hasAct = true; p->act = ev;
    if (ev.type == EV_SET || ev.type == EV_LIN || ev.type == EV_EXP) { p->segT0 = ev.t; p->segV0 = ev.v; p->cur = ev.v; }
    else { p->actV0 = p->cur; p->segT0 = ev.t; p->segV0 = p->cur; }
  }
  if (!p->hasAct) return p->cur = p->value;
  PEv *a = &p->act;
  switch (a->type) {
    case EV_TARGET: p->cur = a->v + (p->actV0 - a->v) * exp(-(T - a->t) / a->tc); p->segV0 = p->cur; p->segT0 = T; return p->cur;
    case EV_CURVE: {
      double k = (T - a->t) / a->dur;
      if (k >= 1) { p->cur = a->curve[a->ncurve - 1]; }
      else { double f = k * (a->ncurve - 1); int i = (int)f; double u = f - i; p->cur = a->curve[i] + (a->curve[i + 1 < a->ncurve ? i + 1 : i] - a->curve[i]) * u; }
      p->segV0 = p->cur; p->segT0 = T; return p->cur;
    }
    default: return p->cur = p->segV0;
  }
}
static bool param_static(const Param *p) { return !p->nev && !p->nmods && (!p->hasAct || (p->act.type != EV_TARGET && p->act.type != EV_CURVE)); }

static void process(Node *n);
/** Values of a param over this block, automation plus any audio-rate inputs. */
static void param_block(Param *p, double t0, float *out) {
  if (param_static(p)) { float v = (float)param_at(p, t0); for (int i = 0; i < BLOCK; i++) out[i] = v; return; }
  for (int i = 0; i < BLOCK; i++) out[i] = (float)param_at(p, t0 + (double)i / SR);
  for (int m = 0; m < p->nmods; m++) {
    Node *mn = p->mods[m];
    process(mn);
    if (mn->silent) continue;
    for (int i = 0; i < BLOCK; i++) out[i] += mn->out[i];
  }
}

static Node *node_new(int type) {
  Node *n = calloc(1, sizeof *n);
  n->type = type; n->deadAt = -1; n->stop = INFINITY; n->start = INFINITY;
  if (nnodes == capnodes) { capnodes = capnodes ? capnodes * 2 : 256; nodes = realloc(nodes, sizeof(Node *) * capnodes); }
  nodes[nnodes++] = n;
  return n;
}
static void addOut(Node *a, Node *b, Param *p) {
  if (a->nouts == a->capouts) { a->capouts = a->capouts ? a->capouts * 2 : 2; a->outs = realloc(a->outs, sizeof(Edge) * a->capouts); }
  a->outs[a->nouts++] = (Edge){ b, p };
}
static void connect(Node *a, Node *b) {
  if (!a || !b) return;
  if (b->nin == b->capin) { b->capin = b->capin ? b->capin * 2 : 2; b->in = realloc(b->in, sizeof(Node *) * b->capin); }
  b->in[b->nin++] = a;
  addOut(a, b, NULL);
}
static void connectParam(Node *a, Node *owner, Param *p) {
  if (p->nmods == p->capmods) { p->capmods = p->capmods ? p->capmods * 2 : 2; p->mods = realloc(p->mods, sizeof(Node *) * p->capmods); }
  p->mods[p->nmods++] = a;
  addOut(a, owner, p);
}
static void removeFrom(Node **arr, int *n, Node *x) {
  int w = 0;
  for (int i = 0; i < *n; i++) if (arr[i] != x) arr[w++] = arr[i];
  *n = w;
}
static void node_free(Node *n) {
  for (int i = 0; i < n->nouts; i++) {
    Edge e = n->outs[i];
    if (e.p) removeFrom(e.p->mods, &e.p->nmods, n); else removeFrom(e.n->in, &e.n->nin, n);
  }
  // whoever feeds this node no longer does
  for (int i = 0; i < n->nin; i++) {
    Node *s = n->in[i]; int w = 0;
    for (int j = 0; j < s->nouts; j++) if (!(s->outs[j].n == n && !s->outs[j].p)) s->outs[w++] = s->outs[j];
    s->nouts = w;
  }
  Param *ps[2] = { &n->p1, &n->p2 };
  for (int k = 0; k < 2; k++)
    for (int i = 0; i < ps[k]->nmods; i++) {
      Node *s = ps[k]->mods[i]; int w = 0;
      for (int j = 0; j < s->nouts; j++) if (!(s->outs[j].n == n && s->outs[j].p == ps[k])) s->outs[w++] = s->outs[j];
      s->nouts = w;
    }
  param_free(&n->p1); param_free(&n->p2);
  free(n->in); free(n->outs); free(n);
}

static double polyblep(double t, double dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}
static void biquad_coefs(Node *n, double f, double q) {
  double nyq = SR / 2.0;
  if (f < 0) f = 0; if (f > nyq) f = nyq;
  double w0 = 2 * M_PI * f / SR, cw = cos(w0), sw = sin(w0), alpha, b0, b1, b2, a0, a1, a2;
  if (f <= 0 || f >= nyq) { // degenerate: pass or block
    n->b0 = (n->ftype == F_LOWPASS) == (f >= nyq) ? 1 : 0; n->b1 = n->b2 = n->a1 = n->a2 = 0;
    if (n->ftype == F_BANDPASS) n->b0 = 0;
    n->coefOk = true; n->lastF = f; n->lastQ = q;
    return;
  }
  if (n->ftype == F_BANDPASS) {
    double Q = q <= 0 ? 1e-4 : q;
    alpha = sw / (2 * Q);
    b0 = alpha; b1 = 0; b2 = -alpha;
  } else {
    alpha = sw / (2 * pow(10, q / 20)); // Web Audio reads low/high-pass Q in dB
    if (n->ftype == F_LOWPASS) { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = (1 - cw) / 2; }
    else { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = (1 + cw) / 2; }
  }
  a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha;
  n->b0 = b0 / a0; n->b1 = b1 / a0; n->b2 = b2 / a0; n->a1 = a1 / a0; n->a2 = a2 / a0;
  n->coefOk = true; n->lastF = f; n->lastQ = q;
}

static float pv1[BLOCK], pv2[BLOCK];
static void process(Node *n) {
  if (n->block == blockId) return;
  n->block = blockId;
  double t0 = now();
  switch (n->type) {
    case N_GAIN: {
      bool any = false;
      for (int i = 0; i < n->nin; i++) { process(n->in[i]); if (!n->in[i]->silent) any = true; }
      if (!any) { n->silent = true; for (int i = 0; i < n->p1.nmods; i++) process(n->p1.mods[i]); param_at(&n->p1, t0 + (double)(BLOCK - 1) / SR); return; }
      float g[BLOCK];
      param_block(&n->p1, t0, g);
      memset(n->out, 0, sizeof n->out);
      for (int i = 0; i < n->nin; i++) { Node *s = n->in[i]; if (s->silent) continue; for (int k = 0; k < BLOCK; k++) n->out[k] += s->out[k]; }
      for (int k = 0; k < BLOCK; k++) n->out[k] *= g[k];
      n->silent = false;
      return;
    }
    case N_OSC: {
      double t1 = t0 + (double)BLOCK / SR;
      if (t1 <= n->start || t0 >= n->stop) {
        n->silent = true;
        for (int i = 0; i < n->p1.nmods; i++) process(n->p1.mods[i]);
        return;
      }
      param_block(&n->p1, t0, pv1);
      bool detStatic = param_static(&n->p2);
      double det = detStatic ? pow(2, param_at(&n->p2, t0) / 1200.0) : 1;
      if (!detStatic) param_block(&n->p2, t0, pv2);
      for (int k = 0; k < BLOCK; k++) {
        double t = t0 + (double)k / SR;
        if (t < n->start || t >= n->stop) { n->out[k] = 0; continue; }
        double f = pv1[k] * (detStatic ? det : pow(2, pv2[k] / 1200.0)), dt = f / SR, ph = n->phase, v;
        switch (n->wave) {
          case W_SINE: v = sin(2 * M_PI * ph); break;
          case W_TRI: v = ph < 0.25 ? ph * 4 : ph < 0.75 ? 2 - ph * 4 : ph * 4 - 4; break;
          case W_SAW: { double q = ph + 0.5; q -= floor(q); v = 2 * q - 1 - polyblep(q, fabs(dt)); break; }
          default: { v = ph < 0.5 ? 1 : -1; v += polyblep(ph, fabs(dt)); double q = ph + 0.5; q -= floor(q); v -= polyblep(q, fabs(dt)); }
        }
        n->out[k] = (float)v;
        ph += dt; ph -= floor(ph);
        n->phase = ph;
      }
      n->silent = false;
      return;
    }
    case N_BUF: {
      double t1 = t0 + (double)BLOCK / SR;
      if (t1 <= n->start || t0 >= n->stop) { n->silent = true; return; }
      for (int k = 0; k < BLOCK; k++) {
        double t = t0 + (double)k / SR;
        if (t < n->start || t >= n->stop) { n->out[k] = 0; continue; }
        long i = n->pos++;
        if (n->loop) i %= n->buflen;
        n->out[k] = i < n->buflen ? n->buf[i] : 0;
      }
      n->silent = false;
      return;
    }
    case N_BIQUAD: {
      bool any = false;
      for (int i = 0; i < n->nin; i++) { process(n->in[i]); if (!n->in[i]->silent) any = true; }
      bool quiet = fabs(n->y1) + fabs(n->y2) + fabs(n->x1) + fabs(n->x2) < 1e-9;
      if (!any && quiet) {
        n->silent = true;
        param_at(&n->p1, t0 + (double)(BLOCK - 1) / SR); param_at(&n->p2, t0 + (double)(BLOCK - 1) / SR);
        return;
      }
      float in[BLOCK]; memset(in, 0, sizeof in);
      for (int i = 0; i < n->nin; i++) { Node *s = n->in[i]; if (s->silent) continue; for (int k = 0; k < BLOCK; k++) in[k] += s->out[k]; }
      bool stat = param_static(&n->p1) && param_static(&n->p2);
      for (int k = 0; k < BLOCK; k++) {
        if (!n->coefOk || (!stat && (k & 15) == 0)) {
          double t = t0 + (double)k / SR, f = param_at(&n->p1, t), q = param_at(&n->p2, t);
          if (!n->coefOk || f != n->lastF || q != n->lastQ) biquad_coefs(n, f, q);
        }
        double x = in[k], y = n->b0 * x + n->b1 * n->x1 + n->b2 * n->x2 - n->a1 * n->y1 - n->a2 * n->y2;
        n->x2 = n->x1; n->x1 = x; n->y2 = n->y1; n->y1 = y;
        n->out[k] = (float)y;
      }
      if (fabs(n->y1) < 1e-15) n->y1 = 0;
      if (fabs(n->y2) < 1e-15) n->y2 = 0;
      n->silent = false;
      return;
    }
  }
}

// ---- garbage collection: a node goes once nothing it plays or carries can sound again
static bool finished(Node *n, double t) {
  if (n->persistent) return false;
  if (n->type == N_OSC || n->type == N_BUF) return t > n->stop + 0.02 || (n->type == N_BUF && !n->loop && n->start < INFINITY && t > n->start + (n->buflen - n->offset * SR) / SR + 0.02);
  for (int i = 0; i < n->nin; i++) if (!n->in[i]->dead) return false;
  for (int i = 0; i < n->p1.nmods; i++) if (!n->p1.mods[i]->dead) return false;
  for (int i = 0; i < n->p2.nmods; i++) if (!n->p2.mods[i]->dead) return false;
  return true;
}
static void gc(void) {
  double t = now();
  // sources first, then whatever they fed, a few passes deep
  for (int pass = 0; pass < 6; pass++)
    for (int i = 0; i < nnodes; i++) {
      Node *n = nodes[i];
      if (n->dead) continue;
      if (finished(n, t)) { if (n->deadAt < 0) n->deadAt = t; if (t - n->deadAt >= (n->type == N_BIQUAD ? 0.1 : 0)) n->dead = true; }
    }
  // node_free unhooks a node from every neighbour, so the dead can go one by one
  int w = 0;
  for (int i = 0; i < nnodes; i++) { Node *n = nodes[i]; if (n->dead) node_free(n); else nodes[w++] = n; }
  nnodes = w;
}

// ---- the hall: a convolver with Web Audio's normalization, uniformly partitioned
#define RB 512
#define RN 1024
typedef struct { double re, im; } Cx;
static Cx tw[RN / 2]; static int rev[RN];
static void fft(Cx *a, bool inv) {
  for (int i = 0; i < RN; i++) if (i < rev[i]) { Cx t = a[i]; a[i] = a[rev[i]]; a[rev[i]] = t; }
  for (int len = 2; len <= RN; len <<= 1) {
    int step = RN / len;
    for (int i = 0; i < RN; i += len)
      for (int j = 0; j < len / 2; j++) {
        Cx w = tw[j * step]; if (inv) w.im = -w.im;
        Cx u = a[i + j], v = a[i + j + len / 2];
        Cx t = { v.re * w.re - v.im * w.im, v.re * w.im + v.im * w.re };
        a[i + j] = (Cx){ u.re + t.re, u.im + t.im };
        a[i + j + len / 2] = (Cx){ u.re - t.re, u.im - t.im };
      }
  }
}
#define NB (RN / 2 + 1)
static int RP; static Cx *H[2]; static Cx *FDL; static int fdlPos;
static float rin[RB], prevIn[RB], routL[RB], routR[RB]; static int rinN, routN;
static void reverb_init(void) {
  for (int i = 0; i < RN / 2; i++) tw[i] = (Cx){ cos(-2 * M_PI * i / RN), sin(-2 * M_PI * i / RN) };
  int bits = 0; while ((1 << bits) < RN) bits++;
  for (int i = 0; i < RN; i++) { int r = 0; for (int b = 0; b < bits; b++) if (i & (1 << b)) r |= 1 << (bits - 1 - b); rev[i] = r; }
  // a soft hall: decaying stereo noise as the impulse
  int len = (int)(SR * 2.4);
  float *ir[2]; double power = 0;
  for (int c = 0; c < 2; c++) { ir[c] = malloc(sizeof(float) * len); for (int i = 0; i < len; i++) { ir[c][i] = (float)((mrand() * 2 - 1) * pow(1 - (double)i / len, 3.2)); power += (double)ir[c][i] * ir[c][i]; } }
  power = sqrt(power / (2.0 * len));
  double scale = 1 / power * 0.00125 * 44100.0 / SR;
  RP = (len + RB - 1) / RB;
  for (int c = 0; c < 2; c++) {
    H[c] = calloc((size_t)RP * NB, sizeof(Cx));
    for (int k = 0; k < RP; k++) {
      Cx buf[RN]; memset(buf, 0, sizeof buf);
      for (int i = 0; i < RB && k * RB + i < len; i++) buf[i].re = ir[c][k * RB + i] * scale;
      fft(buf, false);
      memcpy(H[c] + (size_t)k * NB, buf, sizeof(Cx) * NB);
    }
    free(ir[c]);
  }
  FDL = calloc((size_t)RP * NB, sizeof(Cx));
  routN = RB; // one partition of latency: start with silence queued
}
static void reverb_partition(void) {
  Cx X[RN];
  for (int i = 0; i < RB; i++) { X[i] = (Cx){ prevIn[i], 0 }; X[RB + i] = (Cx){ rin[i], 0 }; }
  memcpy(prevIn, rin, sizeof rin);
  fft(X, false);
  fdlPos = (fdlPos + RP - 1) % RP;
  memcpy(FDL + (size_t)fdlPos * NB, X, sizeof(Cx) * NB);
  for (int c = 0; c < 2; c++) {
    Cx Y[RN]; memset(Y, 0, sizeof Y);
    for (int k = 0; k < RP; k++) {
      const Cx *x = FDL + (size_t)((fdlPos + k) % RP) * NB, *h = H[c] + (size_t)k * NB;
      for (int b = 0; b < NB; b++) { Y[b].re += x[b].re * h[b].re - x[b].im * h[b].im; Y[b].im += x[b].re * h[b].im + x[b].im * h[b].re; }
    }
    for (int b = 1; b < RN / 2; b++) Y[RN - b] = (Cx){ Y[b].re, -Y[b].im };
    fft(Y, true);
    float *o = c ? routR : routL;
    for (int i = 0; i < RB; i++) o[i] = (float)(Y[RB + i].re / RN);
  }
  routN = RB;
}
/** Push one engine block in, get one block of wet stereo out. */
static void reverb_block(const float *in, bool silentIn, float *L, float *R) {
  static float qL[RB * 2], qR[RB * 2]; static int qn = RB; // the output queue, primed with silence
  for (int i = 0; i < BLOCK; i++) rin[rinN++] = silentIn ? 0 : in[i];
  if (rinN == RB) {
    reverb_partition(); rinN = 0;
    memcpy(qL + qn, routL, sizeof routL); memcpy(qR + qn, routR, sizeof routR); qn += RB;
  }
  memcpy(L, qL, sizeof(float) * BLOCK); memcpy(R, qR, sizeof(float) * BLOCK);
  memmove(qL, qL + BLOCK, sizeof(float) * (qn - BLOCK)); memmove(qR, qR + BLOCK, sizeof(float) * (qn - BLOCK));
  qn -= BLOCK;
}

// ---- glue compressor and brick-wall limiter (DynamicsCompressorNode, with its make-up gain)
#define LOOK 288 /* Chrome's compressor looks 6 ms ahead */
typedef struct { double thr, knee, ratio, att, rel, env, makeup; float dl[LOOK], dr[LOOK]; int pos; } Comp;
static double comp_curve(const Comp *c, double x) { // dB in -> dB out
  if (c->knee <= 0) return x < c->thr ? x : c->thr + (x - c->thr) / c->ratio;
  if (x < c->thr) return x;
  if (x < c->thr + c->knee) { double d = x - c->thr; return x + (1 / c->ratio - 1) * d * d / (2 * c->knee); }
  return c->thr + c->knee + (1 / c->ratio - 1) * c->knee / 2 + (x - c->thr - c->knee) / c->ratio;
}
static void comp_init(Comp *c, double thr, double knee, double ratio, double att, double rel) {
  memset(c, 0, sizeof *c);
  c->thr = thr; c->knee = knee; c->ratio = ratio; c->att = att; c->rel = rel; c->env = 0;
  c->makeup = pow(1 / pow(10, comp_curve(c, 0) / 20), 0.6);
}
static void comp_run(Comp *c, float *L, float *R, int n) {
  double ka = exp(-1.0 / (c->att * SR)), kr = exp(-1.0 / (c->rel * SR));
  for (int i = 0; i < n; i++) {
    double peak = fmax(fabs(L[i]), fabs(R[i]));
    double x = peak > 1e-9 ? 20 * log10(peak) : -180;
    double red = x - comp_curve(c, x); // dB of reduction wanted
    c->env = red > c->env ? ka * c->env + (1 - ka) * red : kr * c->env + (1 - kr) * red;
    double g = pow(10, -c->env / 20) * c->makeup;
    // the gain lands on the sample from 6 ms ago, so a transient is already turned down when it plays
    float l = c->dl[c->pos], r = c->dr[c->pos];
    c->dl[c->pos] = L[i]; c->dr[c->pos] = R[i]; c->pos = (c->pos + 1) % LOOK;
    L[i] = (float)(l * g); R[i] = (float)(r * g);
  }
}

// ---- the mix: master (dry sum + half the hall) through the compressor and limiter
static Node *master, *musicBus, *sfxBus, *ambBus, *verbIn;
static Node *buses[VOL_N], *sends[VOL_N];
static Comp comp, lim;
static float mixL[BLOCK], mixR[BLOCK];

static void render_block(void) {
  blockId++;
  double t0 = now();
  // the master gain node sums the dry buses; the hall is fed from verbIn
  for (int i = 0; i < master->nin; i++) process(master->in[i]); // music, sfx, ambience buses
  process(verbIn);
  float wl[BLOCK], wr[BLOCK];
  reverb_block(verbIn->out, verbIn->silent, wl, wr);
  // master.gain applies to the hall return too, so scale the dry sum back out of master's own gain
  float g[BLOCK];
  param_block(&master->p1, t0, g);
  for (int k = 0; k < BLOCK; k++) {
    float dry = 0;
    for (int i = 0; i < master->nin; i++) if (!master->in[i]->silent) dry += master->in[i]->out[k];
    mixL[k] = (dry + 0.5f * wl[k]) * g[k];
    mixR[k] = (dry + 0.5f * wr[k]) * g[k];
  }
  comp_run(&comp, mixL, mixR, BLOCK);
  comp_run(&lim, mixL, mixR, BLOCK);
  for (int k = 0; k < BLOCK; k++) {
    if (mixL[k] > 1) mixL[k] = 1; if (mixL[k] < -1) mixL[k] = -1;
    if (mixR[k] > 1) mixR[k] = 1; if (mixR[k] < -1) mixR[k] = -1;
  }
  frames += BLOCK;
  if ((blockId & 15) == 0) gc();
}
static void SDLCALL callback(void *ud, Uint8 *stream, int len) {
  float *out = (float *)stream; int n = len / (int)(sizeof(float) * 2);
  static int have = 0, at = 0;
  for (int i = 0; i < n; i++) {
    if (at >= have) { render_block(); have = BLOCK; at = 0; }
    out[i * 2] = mixL[at]; out[i * 2 + 1] = mixR[at]; at++;
  }
}

// ================================================================ the Web Audio-like helpers audio.js builds with
static Node *OUT; // the bus the sound effect being built plays into
static Node *gainNode(double v, Node *out) { Node *g = node_new(N_GAIN); param_init(&g->p1, v); if (out) connect(g, out); return g; }
static Node *gainParam(double v, Node *owner, Param *p) { Node *g = node_new(N_GAIN); param_init(&g->p1, v); connectParam(g, owner, p); return g; }
static Node *sendOf(Node *bus) { for (int i = 0; i < VOL_N; i++) if (buses[i] == bus) return sends[i]; return NULL; }
static Node *trackGain, *trackSend; // the music track playing now and its reverb send
static Node *sendFor(Node *out) { if (out == trackGain && trackGain) return trackSend; Node *s = sendOf(out); return s ? s : verbIn; }
/** A voice's output: a gain into `out`, with an optional send to the reverb. */
static Node *voice(Node *out, double wet) {
  Node *g = gainNode(0, out);
  if (wet) connect(g, gainNode(wet, sendFor(out)));
  return g;
}
static Node *osc(int type, double f, double t, double end, Node *out) {
  Node *o = node_new(N_OSC);
  o->wave = type; param_init(&o->p1, 440); param_init(&o->p2, 0);
  p_set(&o->p1, f, t);
  o->start = t; o->stop = end;
  connect(o, out);
  return o;
}
static Node *filt(int type, double f, double q, Node *out) {
  Node *b = node_new(N_BIQUAD);
  b->ftype = type; param_init(&b->p1, f); param_init(&b->p2, q);
  connect(b, out);
  return b;
}
static Node *bufsrc(const float *buf, double t, double offset, double stop, Node *out) {
  Node *s = node_new(N_BUF);
  s->buf = buf; s->buflen = SR * 2; s->offset = offset; s->pos = (long)(offset * SR);
  s->start = t; s->stop = stop;
  if (out) connect(s, out);
  return s;
}
/** Percussive envelope: fast attack then exponential decay. */
static void perc(Node *g, double t, double peak, double decay, double attack) {
  p_set(&g->p1, 0.0001, t);
  p_exp(&g->p1, peak, t + attack);
  p_exp(&g->p1, 0.0001, t + attack + decay);
}
typedef struct { int type; double f, f2, q; Node *out; double wet, attack; } NoiseOpt;
static NoiseOpt NO(void) { NoiseOpt o = { F_BANDPASS, 1000, 0, 1, NULL, 0, 0.003 }; return o; }
/** Filtered noise burst; f2 sweeps the filter. */
static void noise(double t, double dur, double vel, NoiseOpt o) {
  Node *out = o.out ? o.out : OUT;
  Node *g = voice(out, o.wet), *b = filt(o.type, o.f, o.q, g);
  if (o.f2) p_exp(&b->p1, o.f2, t + dur);
  bufsrc(noiseBuf, t, mrand() * 1.5, t + dur + o.attack + 0.05, b);
  perc(g, t, vel, dur, o.attack);
}
typedef struct { Node *out; double wet, lp, attack; } ToneOpt;
static ToneOpt TO(void) { ToneOpt o = { NULL, 0, 0, 0.004 }; return o; }
/** Pitched blip with a pitch sweep. */
static void tone(double t, int type, double f, double f2, double dur, double vel, ToneOpt o) {
  Node *out = o.out ? o.out : OUT;
  Node *g = voice(out, o.wet);
  Node *o2 = osc(type, f, t, t + dur + o.attack + 0.05, o.lp ? filt(F_LOWPASS, o.lp, 0.7, g) : g);
  if (f2 && f2 != f) p_exp(&o2->p1, f2, t + dur);
  perc(g, t, vel, dur, o.attack);
}
/** Struck metal: inharmonic sine partials, each ringing for its own time (modal synthesis). */
static void metal(double t, const double *freqs, const double *decays, int n, double vel, Node *out, double wet) {
  if (!out) out = OUT;
  for (int i = 0; i < n; i++) {
    Node *g = voice(out, wet); double a = vel / (1 + i * 0.35);
    osc(W_SINE, freqs[i], t, t + decays[i] + 0.1, g);
    osc(W_SINE, freqs[i] * 1.0013, t, t + decays[i] + 0.1, gainNode(0.6, g)); // a slow beat makes it shimmer
    perc(g, t, a, decays[i], 0.001);
  }
}
/** Air pushed by something moving fast: band-passed noise sweeping up then down, loudest past the middle. */
static void whoosh(double t, double dur, double vel, double f0, double fPeak, double f1, double q, Node *out, double wet, const float *buf) {
  if (!out) out = OUT;
  Node *g = voice(out, wet), *b2 = filt(F_BANDPASS, f0, q * 0.6, g), *b = filt(F_BANDPASS, f0, q, b2);
  double mid = t + dur * 0.55;
  Node *xs[2] = { b, b2 };
  for (int i = 0; i < 2; i++) { p_set(&xs[i]->p1, f0, t); p_exp(&xs[i]->p1, fPeak, mid); p_exp(&xs[i]->p1, f1, t + dur); }
  p_set(&g->p1, 0.0001, t);
  p_exp(&g->p1, vel * 5, mid); // the two narrow band-passes eat most of the energy
  p_exp(&g->p1, 0.0001, t + dur);
  bufsrc(buf, t, mrand() * 1.5, t + dur + 0.05, b);
}
#define WHOOSH(t, dur, vel, f0, fp, f1) whoosh(t, dur, vel, f0, fp, f1, 2.5, NULL, 0.1, noiseBuf)
/** Scattered tiny clicks: fire crackle, gravel, embers. */
static void crackles(double t, double dur, double perSec, double vel, Node *out, double fade, double fLo, double fHi) {
  int n = (int)JSROUND(dur * perSec);
  for (int i = 0; i < n; i++) {
    double x = mrand(), tt = t + x * dur;
    NoiseOpt o = NO(); o.type = F_HIGHPASS; o.out = out; o.attack = 0.0008;
    double d = 0.002 + mrand() * 0.012, v = vel * (0.3 + mrand() * 0.7) * pow(1 - x, fade);
    o.f = fLo + mrand() * (fHi - fLo);
    noise(tt, d, v, o);
  }
}
/** Flame body: brown noise through a moving low-pass, with an irregular flicker in its loudness. */
static void roar(double t, double dur, double vel, double f0, double f1, double attack, Node *out, double wet) {
  if (!out) out = OUT;
  Node *env = voice(out, wet), *flick = gainNode(0.65, env), *lp = filt(F_LOWPASS, f0, 0.9, flick);
  p_set(&lp->p1, f0, t); p_exp(&lp->p1, f1, t + fmin(dur, attack * 3 + 0.1));
  p_exp(&lp->p1, f0 * 0.7, t + dur);
  // flicker: slow noise wobbling the gain
  Node *mlp = filt(F_LOWPASS, 14, 0.5, gainParam(1.6, flick, &flick->p1));
  p_set(&env->p1, 0.0001, t);
  p_exp(&env->p1, vel, t + attack);
  p_exp(&env->p1, vel * 0.6, t + attack + (dur - attack) * 0.5);
  p_exp(&env->p1, 0.0001, t + dur);
  double off = mrand() * 1.5;
  bufsrc(brownBuf, t, off, t + dur + 0.05, lp);
  bufsrc(noiseBuf, t, off, t + dur + 0.05, mlp);
}
/** Something heavy landing: a low sine drop plus a muffled rumble. */
static void thud(double t, double vel, double pitch) {
  tone(t, W_SINE, 150 * pitch, 50 * pitch, 0.14, vel, TO());
  Node *g = voice(OUT, 0), *lp = filt(F_LOWPASS, 380 * pitch, 0.7, g);
  perc(g, t, vel * 0.8, 0.12, 0.002);
  bufsrc(brownBuf, t, mrand(), t + 0.2, lp);
}

// ---------------------------------------------------------------- instruments
static double mtof(double m) { return 440 * pow(2, (m - 69) / 12); }
static double hashf(double a, double b, double c) { double s = sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453; return s - floor(s); }
static void I_pluck(double t, double m, double dur, double vel, Node *out) { // lute / harp: bright attack, filter closes fast
  double f = mtof(m);
  Node *g = voice(out, 0.35), *lp = filt(F_LOWPASS, f * 6, 1, g);
  p_set(&lp->p1, fmin(9000, f * 8), t);
  p_exp(&lp->p1, f * 1.5, t + 0.35);
  osc(W_TRI, f, t, t + dur + 1, lp);
  osc(W_SAW, f * 1.004, t, t + dur + 1, gainNode(0.35, lp));
  perc(g, t, vel * 0.32, dur * 0.6 + 0.6, 0.003);
}
static void I_pad(double t, const int *notes, int n, double dur, double vel, Node *out, double cut) { // warm strings bed
  Node *g = voice(out, 0.6), *lp = filt(F_LOWPASS, cut, 0.4, g);
  for (int i = 0; i < n; i++) for (int d = -7; d <= 7; d += 14) { Node *o = osc(W_SAW, mtof(notes[i]), t, t + dur + 1.6, lp); p_value(&o->p2, d); }
  p_set(&g->p1, 0.0001, t);
  p_lin(&g->p1, vel * 0.06, t + fmin(0.9, dur * 0.4));
  p_set(&g->p1, vel * 0.06, t + dur);
  p_lin(&g->p1, 0.0001, t + dur + 1.4);
}
static void I_flute(double t, double m, double dur, double vel, Node *out) { // breathy sine lead with delayed vibrato
  double f = mtof(m);
  Node *g = voice(out, 0.5);
  Node *o = osc(W_SINE, f, t, t + dur + 0.3, g), *o2 = osc(W_TRI, f * 2, t, t + dur + 0.3, gainNode(0.08, g));
  Node *depth = node_new(N_GAIN); param_init(&depth->p1, 1);
  p_set(&depth->p1, 0, t); p_lin(&depth->p1, f * 0.006, t + fmin(0.5, dur));
  osc(W_SINE, 5.2, t, t + dur + 0.3, depth);
  connectParam(depth, o, &o->p1); connectParam(depth, o2, &o2->p1);
  p_set(&g->p1, 0.0001, t);
  p_lin(&g->p1, vel * 0.16, t + 0.07);
  p_set(&g->p1, vel * 0.14, t + fmax(0.08, dur - 0.05));
  p_lin(&g->p1, 0.0001, t + dur + 0.18);
  NoiseOpt no = NO(); no.f = f * 2; no.q = 2; no.out = out; no.attack = 0.03;
  noise(t, 0.12, vel * 0.03, no);
}
static void I_horn(double t, double m, double dur, double vel, Node *out) { // brassy lead: filter swells open
  double f = mtof(m);
  Node *g = voice(out, 0.45), *lp = filt(F_LOWPASS, 500, 1.2, g);
  p_set(&lp->p1, 400, t);
  p_lin(&lp->p1, 2200 * vel + 600, t + 0.07);
  p_target(&lp->p1, 1100, t + 0.1, 0.25);
  for (int d = -5; d <= 5; d += 10) { Node *o = osc(W_SAW, f, t, t + dur + 0.4, lp); p_value(&o->p2, d); }
  p_set(&g->p1, 0.0001, t);
  p_lin(&g->p1, vel * 0.13, t + 0.05);
  p_set(&g->p1, vel * 0.11, t + fmax(0.06, dur - 0.05));
  p_lin(&g->p1, 0.0001, t + dur + 0.25);
}
static void I_bass(double t, double m, double dur, double vel, Node *out) {
  double f = mtof(m);
  Node *g = voice(out, 0.05), *lp = filt(F_LOWPASS, f * 4, 0.8, g);
  osc(W_TRI, f, t, t + dur + 0.5, lp); osc(W_SINE, f / 2, t, t + dur + 0.5, gainNode(0.6, lp));
  perc(g, t, vel * 0.45, dur + 0.2, 0.008);
}
static void I_drum(double t, double vel, double pitch, Node *out) { // taiko-ish
  Node *g = voice(out, 0.25), *o = osc(W_SINE, 150 * pitch, t, t + 0.8, g);
  p_exp(&o->p1, 42 * pitch, t + 0.22);
  perc(g, t, vel * 0.9, 0.55, 0.004);
  NoiseOpt no = NO(); no.type = F_LOWPASS; no.f = 900 * pitch; no.out = out;
  noise(t, 0.08, vel * 0.35, no);
}
static void I_rim(double t, double vel, Node *out) { NoiseOpt o = NO(); o.f = 2600; o.q = 3; o.out = out; o.wet = 0.2; noise(t, 0.05, vel * 0.3, o); }
static void I_hat(double t, double vel, Node *out) { NoiseOpt o = NO(); o.type = F_HIGHPASS; o.f = 7000; o.out = out; noise(t, 0.03, vel * 0.12, o); }
static void I_bell(double t, double m, double vel, Node *out, double wet) { // inharmonic partials, long ring
  double f = mtof(m);
  const double P[4][3] = { { 1, 1, 1.6 }, { 2.76, 0.4, 0.8 }, { 5.4, 0.2, 0.4 }, { 8.9, 0.08, 0.2 } };
  for (int i = 0; i < 4; i++) { ToneOpt o = TO(); o.out = out; o.wet = wet; o.attack = 0.002; tone(t, W_SINE, f * P[i][0], 0, P[i][2], vel * 0.2 * P[i][1], o); }
}

// ---------------------------------------------------------------- music
enum { C_D, C_Bm, C_G, C_A, C_Fsm, C_Am, C_F, C_Dm, C_E, C_Bb, C_C, C_Gm };
static const int PC[12][3] = { { 2, 6, 9 }, { 11, 2, 6 }, { 7, 11, 2 }, { 9, 1, 4 }, { 6, 9, 1 }, { 9, 0, 4 }, { 5, 9, 0 }, { 2, 5, 9 }, { 4, 8, 11 }, { 10, 2, 5 }, { 0, 4, 7 }, { 7, 10, 2 } };
static int imod(int a, int m) { return ((a % m) + m) % m; }
/** Chord tones placed in the first octave at or above `low`, in rising order. */
static void voicing(const int *pcs, int low, int *out) {
  for (int i = 0; i < 3; i++) out[i] = low + imod(pcs[i] - low, 12);
  for (int i = 0; i < 3; i++) for (int j = i + 1; j < 3; j++) if (out[j] < out[i]) { int t = out[i]; out[i] = out[j]; out[j] = t; }
}
static int rootAt(const int *pcs, int low) { return low + imod(pcs[0] - low, 12); }
typedef struct { int st, m, len; } MelNote;
static const MelNote MEADOW_MEL[8][4] = {
  { { 0, 74, 6 }, { 6, 73, 2 }, { 8, 71, 4 }, { 12, 69, 4 } }, { { 0, 66, 8 }, { 8, 69, 4 }, { 12, 71, 4 } },
  { { 0, 74, 4 }, { 4, 76, 4 }, { 8, 78, 6 }, { 14, 76, 2 } }, { { 0, 73, 12 } },
  { { 0, 78, 6 }, { 6, 76, 2 }, { 8, 74, 4 }, { 12, 73, 4 } }, { { 0, 73, 4 }, { 4, 69, 4 }, { 8, 66, 8 } },
  { { 0, 67, 4 }, { 4, 71, 4 }, { 8, 74, 4 }, { 12, 76, 4 } }, { { 0, 76, 8 }, { 8, 73, 8 } },
};
static const MelNote COMBAT_MEL[4][4] = {
  { { 0, 74, 4 }, { 4, 77, 4 }, { 8, 81, 6 }, { 14, 79, 2 } }, { { 0, 79, 6 }, { 6, 77, 2 }, { 8, 74, 8 } },
  { { 0, 74, 4 }, { 4, 77, 4 }, { 8, 82, 4 }, { 12, 81, 4 } }, { { 0, 81, 8 }, { 8, 76, 4 }, { 12, 73, 4 } },
};
static const MelNote *melAt(const MelNote (*mel)[4], int bars, int bar, int s) {
  if (bar < 0 || bar >= bars) return NULL;
  for (int i = 0; i < 4; i++) if (mel[bar][i].len && mel[bar][i].st == s) return &mel[bar][i];
  return NULL;
}
static const int MEADOW_PROG[8] = { C_D, C_Bm, C_G, C_A, C_D, C_Fsm, C_G, C_A };
static const int RUINS_PROG[4] = { C_Am, C_F, C_Dm, C_E };
static const int COMBAT_PROG[8] = { C_Dm, C_Dm, C_Bb, C_C, C_Dm, C_Gm, C_Bb, C_A };
static const struct { double bpm; int bars; } TRACKS[3] = { { 84, 8 }, { 62, 4 }, { 128, 8 } };

static void step_meadow(int bar, int s, double t, int loop, Node *out, double sp) {
  const int *ch = PC[MEADOW_PROG[bar]];
  if (s == 0) { int v[3]; voicing(ch, 54, v); I_pad(t, v, 3, sp * 16, 0.9, out, 1100); I_bass(t, rootAt(ch, 38), sp * 6, 0.8, out); }
  if (s == 8) I_bass(t, rootAt(ch, 38) + (bar % 2 ? 7 : 0), sp * 6, 0.6, out);
  if (s % 2 == 0) {
    int v[3]; voicing(ch, 62, v);
    int notes[4] = { v[0], v[1], v[2], v[0] + 12 };
    static const int IDX[8] = { 0, 1, 2, 1, 3, 2, 1, 2 };
    I_pluck(t, notes[IDX[s / 2]], sp * 2, s % 8 == 0 ? 0.75 : 0.5, out);
  }
  if (loop % 2 == 0) { const MelNote *m = melAt(MEADOW_MEL, 8, bar, s); if (m) I_flute(t, m->m, m->len * sp, 0.9, out); }
  else if (s == 4 && bar % 2 == 1) { int v[3]; voicing(ch, 74, v); I_bell(t, v[1], 0.35, out, 0.6); }
}
static void step_ruins(int bar, int s, double t, int loop, Node *out, double sp) {
  const int *ch = PC[RUINS_PROG[bar]];
  if (s == 0) { int v[3]; voicing(ch, 45, v); int n4[4] = { v[0], v[1], v[2], 33 }; I_pad(t, n4, 4, sp * 16, 1, out, 520); if (bar % 2 == 0) I_drum(t, 0.4, 0.55, out); }
  if (s % 2 == 0 && hashf(loop, bar, s) < 0.32) {
    static const int scale[8] = { 57, 60, 62, 64, 67, 69, 72, 74 };
    I_pluck(t, scale[(int)(hashf(s, loop, bar) * 8)], sp * 3, 0.45, out);
  }
  if (bar == 3 && s == 8) I_flute(t, 68, sp * 8, 0.45, out); // the raised 7th, unresolved
  if (bar == 1 && s == 10 && loop % 2) I_bell(t, 81, 0.25, out, 0.6);
}
static void step_combat(int bar, int s, double t, int loop, Node *out, double sp) {
  const int *ch = PC[COMBAT_PROG[bar]]; int r = rootAt(ch, 38);
  if (s == 0 || s == 6 || s == 8 || s == 14) I_drum(t, s == 0 ? 1 : 0.7, 1, out);
  if (s == 3 || s == 11) I_drum(t, 0.45, 1.6, out);
  if (s == 4 || s == 12) I_rim(t, 0.9, out);
  if (s % 2 == 1) I_hat(t, 0.8, out);
  if (s % 2 == 0) { int B[8] = { r, r, r + 12, r, r, r + 7, r + 12, r }; I_bass(t, B[s / 2], sp * 1.6, 0.75, out); }
  if (s == 0) { int v[3]; voicing(ch, 50, v); I_pad(t, v, 3, sp * 16, 0.7, out, 800); }
  int v[3]; voicing(ch, 62, v);
  int P4[4] = { v[0], v[1], v[2], v[1] };
  I_pluck(t, P4[s % 4], sp, 0.28, out);
  if (bar >= 4) { const MelNote *m = melAt(COMBAT_MEL, 4, bar - 4, s); if (m) I_horn(t, m->m, m->len * sp, 0.9, out); }
  else if (loop % 2 == 1) { const MelNote *m = melAt(COMBAT_MEL, 4, bar, s); if (m) I_horn(t, m->m - 12, m->len * sp, 0.6, out); }
}

static int curName = MUS_NONE;
static int cur = MUS_NONE;
static double nextT; static long stepN;
/** Crossfade to a track, or MUS_NONE for silence. */
void playMusic(int name, double fade) {
  if (!started || name == curName) return;
  lockA();
  curName = name;
  double t = now();
  if (trackGain) {
    Node *xs[2] = { trackGain, trackSend };
    for (int i = 0; i < 2; i++) { p_cancel(&xs[i]->p1, t); p_target(&xs[i]->p1, 0, t, fade / 3); xs[i]->persistent = false; }
  }
  cur = name; trackGain = trackSend = NULL;
  if (cur >= 0) {
    trackGain = gainNode(0, musicBus); trackGain->persistent = true;
    trackSend = gainNode(0, sends[VOL_MUSIC]); trackSend->persistent = true;
    p_target(&trackGain->p1, 1, t + 0.05, fade / 3);
    p_target(&trackSend->p1, 1, t + 0.05, fade / 3);
    nextT = t + 0.08; stepN = 0;
  }
  unlockA();
}
static void schedule(void) {
  if (cur < 0 || !trackGain) return;
  double sp = 60 / TRACKS[cur].bpm / 4, t = now();
  if (nextT < t - 0.2) nextT = t + 0.05; // asleep: skip ahead rather than burst
  while (nextT < t + 0.3) {
    int s = (int)(stepN % 16), bar = (int)((stepN / 16) % TRACKS[cur].bars), loop = (int)(stepN / (16 * TRACKS[cur].bars));
    if (cur == MUS_MEADOW) step_meadow(bar, s, nextT, loop, trackGain, sp);
    else if (cur == MUS_RUINS) step_ruins(bar, s, nextT, loop, trackGain, sp);
    else step_combat(bar, s, nextT, loop, trackGain, sp);
    nextT += sp; stepN++;
  }
}
/** Duck the music for a moment (under a sting or a big moment). */
static void duck(double amount, double secs) {
  double t = now();
  Node *xs[2] = { musicBus, sends[VOL_MUSIC] };
  for (int i = 0; i < 2; i++) {
    p_cancel(&xs[i]->p1, t);
    p_target(&xs[i]->p1, audioSet.vol[VOL_MUSIC] * amount, t, 0.08);
    p_target(&xs[i]->p1, audioSet.vol[VOL_MUSIC], t + secs, 0.6);
  }
}

// ---------------------------------------------------------------- settings (localStorage in the web version)
const SoundGroup SOUND_GROUPS[VOL_N] = {
  { "Volume geral", false }, { "Música", false }, { "Ambiente (vento, água, fogueira, pássaros)", false },
  { "Golpes, magias e flechas", true }, { "Passos", true }, { "Fanfarras (nível, vitória, missão, descanso)", true },
  { "Interface e dados", true }, { "Mundo (baús)", true },
};
static const double DEFAULT_VOL[VOL_N] = { 1, 0.5, 0.8, 0.85, 0.7, 0.8, 0.7, 0.8 };
static const char *VOL_KEYS[VOL_N] = { "master", "music", "ambience", "combat", "steps", "jingles", "ui", "world" };
AudioSettings audioSet;
static char *settingsPath(void) {
  static char path[1024];
  if (!path[0]) { char *p = SDL_GetPrefPath("brumafolha", "brumafolha"); snprintf(path, sizeof path, "%ssound.cfg", p ? p : "./"); SDL_free(p); }
  return path;
}
void audio_load_settings(void) {
  audioSet.muted = false;
  memcpy(audioSet.vol, DEFAULT_VOL, sizeof DEFAULT_VOL);
  FILE *f = fopen(settingsPath(), "r");
  if (!f) return;
  char key[64]; double v;
  while (fscanf(f, "%63s %lf", key, &v) == 2) {
    if (!strcmp(key, "muted")) audioSet.muted = v != 0;
    for (int i = 0; i < VOL_N; i++) if (!strcmp(key, VOL_KEYS[i])) audioSet.vol[i] = clampd(v, 0, 1);
  }
  fclose(f);
}
static void saveSettings(void) {
  FILE *f = fopen(settingsPath(), "w");
  if (!f) return;
  fprintf(f, "muted %d\n", audioSet.muted ? 1 : 0);
  for (int i = 0; i < VOL_N; i++) fprintf(f, "%s %.2f\n", VOL_KEYS[i], audioSet.vol[i]);
  fclose(f);
}

// ---------------------------------------------------------------- ambience
static struct { Node *windG, *windB, *waterG, *waterB; double birdT, dripT; } amb;
static void loopNoise(int type, double f, double q, Node **g, Node **b) {
  *g = gainNode(0, ambBus); (*g)->persistent = true;
  *b = filt(type, f, q, *g); (*b)->persistent = true;
  Node *s = bufsrc(noiseBuf, now(), 0, INFINITY, *b);
  s->loop = true; s->persistent = true;
}
static void startAmbience(void) {
  loopNoise(F_BANDPASS, 420, 0.6, &amb.windG, &amb.windB);
  loopNoise(F_LOWPASS, 520, 0.7, &amb.waterG, &amb.waterB);
  amb.birdT = 2; amb.dripT = 3;
}
/** levels in 0..1; call every frame. */
void updateAmbience(AmbLevels lv, double dt, double time) {
  if (!started) return;
  lockA();
  double t = now();
  p_target(&amb.windG->p1, lv.wind * (0.05 + 0.03 * sin(time * 0.31) + 0.02 * sin(time * 0.83)), t, 0.4);
  p_target(&amb.windB->p1, 380 + 160 * sin(time * 0.23) + (lv.ruins ? -120 : 0), t, 0.5);
  p_target(&amb.waterG->p1, lv.water * (0.09 + 0.06 * fmax(0, sin(time * 1.7))), t, 0.15);
  if (audioSet.muted) { unlockA(); return; }
  if (lv.fire > 0.02 && mrand() < lv.fire * dt * 16) {
    NoiseOpt o = NO(); o.type = F_HIGHPASS; o.out = ambBus;
    double d = 0.012 + mrand() * 0.03, v = lv.fire * (0.08 + mrand() * 0.18);
    o.f = 1500 + mrand() * 3000;
    noise(t, d, v, o);
    if (mrand() < 0.1) { NoiseOpt o2 = NO(); o2.type = F_LOWPASS; o2.f = 500; o2.out = ambBus; o2.attack = 0.05; noise(t, 0.25, lv.fire * 0.05, o2); }
  }
  if (lv.birds > 0.05 && (amb.birdT -= dt) < 0) {
    amb.birdT = 2 + mrand() * 6;
    double base = 2200 + mrand() * 1600; int n = 2 + (int)(mrand() * 4); double kind = mrand();
    for (int i = 0; i < n; i++) {
      double tt = t + i * (0.09 + kind * 0.08);
      ToneOpt o = TO(); o.out = ambBus; o.wet = 0.4; o.attack = 0.01;
      tone(tt, W_SINE, base * (kind < 0.5 ? 1 : 1.25), base * (kind < 0.5 ? 1.35 : 0.85), 0.07, lv.birds * 0.05, o);
    }
  }
  if (lv.ruins > 0.05 && (amb.dripT -= dt) < 0) {
    amb.dripT = 1.5 + mrand() * 4;
    ToneOpt o = TO(); o.out = ambBus; o.wet = 0.9;
    tone(t, W_SINE, 1400 + mrand() * 900, 700, 0.06, lv.ruins * 0.05, o);
  }
  unlockA();
}

// ---------------------------------------------------------------- init, volumes
/** Opens the audio device (the web version must wait for a click; here the Start button calls it too). */
void initAudio(void) {
  if (started) return;
  if (SDL_InitSubSystem(SDL_INIT_AUDIO) < 0) { fprintf(stderr, "audio: %s\n", SDL_GetError()); return; }
  for (int i = 0; i < SR * 2; i++) noiseBuf[i] = (float)(mrand() * 2 - 1);
  // brown noise (integrated white): the deep rumble of flames and explosions
  double acc = 0, peak = 0;
  for (int i = 0; i < SR * 2; i++) { acc = (acc + 0.02 * (mrand() * 2 - 1)) / 1.02; brownBuf[i] = (float)acc; peak = fmax(peak, fabs(acc)); }
  for (int i = 0; i < SR * 2; i++) brownBuf[i] = (float)(brownBuf[i] / peak);
  reverb_init();
  comp_init(&comp, -16, 30, 4, 0.005, 0.2);
  // a brick-wall limiter after the glue compressor: stacked hits must never clip
  comp_init(&lim, -3, 0, 20, 0.001, 0.12);
  const double *v = audioSet.vol;
  master = gainNode(audioSet.muted ? 0 : v[VOL_MASTER], NULL); master->persistent = true;
  musicBus = gainNode(v[VOL_MUSIC], master); musicBus->persistent = true;
  sfxBus = gainNode(1, master); sfxBus->persistent = true;
  ambBus = gainNode(v[VOL_AMBIENCE], master); ambBus->persistent = true;
  buses[VOL_MASTER] = master; buses[VOL_MUSIC] = musicBus; buses[VOL_AMBIENCE] = ambBus;
  for (int i = 0; i < VOL_N; i++) if (SOUND_GROUPS[i].sfx) { buses[i] = gainNode(v[i], sfxBus); buses[i]->persistent = true; }
  OUT = buses[VOL_COMBAT];
  verbIn = gainNode(1, NULL); verbIn->persistent = true;
  for (int i = 0; i < VOL_N; i++) if (i != VOL_MASTER) { sends[i] = gainNode(v[i], verbIn); sends[i]->persistent = true; }
  startAmbience();
  SDL_AudioSpec want = { 0 }, have;
  want.freq = SR; want.format = AUDIO_F32SYS; want.channels = 2; want.samples = 1024; want.callback = callback;
  dev = SDL_OpenAudioDevice(NULL, 0, &want, &have, 0);
  if (!dev) { fprintf(stderr, "audio: %s\n", SDL_GetError()); return; }
  started = true;
  SDL_PauseAudioDevice(dev, 0);
}
void audio_shutdown(void) { if (dev) SDL_CloseAudioDevice(dev); dev = 0; started = false; }
/** The sequencer runs from the main loop (setInterval(schedule, 40) in the web version). */
void audio_tick(void) { if (!started) return; lockA(); schedule(); unlockA(); }

bool setMuted(bool m) {
  audioSet.muted = m; saveSettings();
  if (started) { lockA(); p_target(&master->p1, m ? 0 : audioSet.vol[VOL_MASTER], now(), 0.05); unlockA(); }
  return m;
}
void setVolume(int kind, double v) {
  audioSet.vol[kind] = v; saveSettings();
  if (!started) return;
  if (kind == VOL_MASTER) { setMuted(audioSet.muted); return; }
  lockA();
  p_target(&buses[kind]->p1, v, now(), 0.05);
  p_target(&sends[kind]->p1, v, now(), 0.05);
  unlockA();
}
bool toggleMute(void) { return setMuted(!audioSet.muted); }

// ---------------------------------------------------------------- sound effects
static double jit(double v, double j) { return v * (1 + (mrand() * 2 - 1) * j); }
static void shuffle(const double *in, double *out, int n, double k) { for (int i = 0; i < n; i++) out[i] = jit(in[i], k); }
/** Define a sound effect in a volume category (-1: play into whatever bus is current). */

static void bubble(double t, double vel) { // a single rising bubble "blip"
  double f = 250 + mrand() * 450;
  Node *g = voice(OUT, 0.1), *o = osc(W_SINE, f, t, t + 0.09, g);
  p_exp(&o->p1, f * 2.4, t + 0.035);
  perc(g, t, 0.25 * vel, 0.05, 0.002);
}
#define SFX(name, cat, args) void sfx_##name args { if (!started || audioSet.muted) return; lockA(); Node *prev = OUT; if ((cat) >= 0) OUT = buses[cat]; double t = now();
#define END OUT = prev; unlockA(); }

SFX(step, VOL_STEPS, (int surface, double vol))
  double v = 0.6 * vol;
  if (surface == SURF_WOOD) { // hollow plank knock
    double f[3] = { 205, 470, 760 }, sf[3], d[3] = { 0.09, 0.05, 0.035 }; shuffle(f, sf, 3, 0.04);
    metal(t, sf, d, 3, v * 0.16, NULL, 0.05);
    NoiseOpt o = NO(); o.type = F_LOWPASS; o.f = 1500; noise(t, 0.015, v * 0.15, o);
  } else if (surface == SURF_STONE) { // hard heel click and a scuff
    NoiseOpt o = NO(); o.type = F_HIGHPASS; o.f = 3200; o.attack = 0.0008; noise(t, 0.006, v * 0.3, o);
    NoiseOpt o2 = NO(); o2.f = jit(1900, 0.12); o2.q = 1.2; noise(t + 0.008, 0.04, v * 0.12, o2);
    tone(t, W_SINE, jit(280, 0.12), 180, 0.03, v * 0.08, TO());
  } else if (surface == SURF_DIRT) { // soft thump and a crumble of grit
    NoiseOpt o = NO(); o.type = F_LOWPASS; o.f = jit(700, 0.12); noise(t, 0.05, v * 0.6, o);
    crackles(t + 0.005, 0.05, 140, v * 0.2, NULL, 1.5, 1500, 4500);
  } else if (surface == SURF_WATER) {
    whoosh(t, 0.16, v * 0.18, 700, 2400, 900, 1, NULL, 0.1, noiseBuf);
    for (int i = 0; i < 2; i++) bubble(t + 0.04 + i * 0.05, v * 0.4);
  } else { // grass: heel then toe, a dry rustle
    const double DA[2][2] = { { 0, 1 }, { 0.035, 0.6 } };
    for (int i = 0; i < 2; i++) { NoiseOpt o = NO(); o.f = jit(3600, 0.2); o.q = 0.7; o.attack = 0.006; noise(t + DA[i][0], 0.045, v * 0.4 * DA[i][1], o); }
    tone(t, W_SINE, 95, 70, 0.025, v * 0.2, TO());
  }
END
SFX(swing, VOL_COMBAT, (bool big)) // blade cutting air, then a faint ring of steel
  WHOOSH(t, big ? 0.3 : 0.2, big ? 0.6 : 0.5, 450, big ? 1700 : 2300, 800);
  if (big) WHOOSH(t + 0.12, 0.26, 0.45, 500, 1900, 700);
  double f[4] = { 3150, 4720, 6380, 8150 }, sf[4], d[4] = { 0.32, 0.25, 0.18, 0.12 }; shuffle(f, sf, 4, 0.04);
  metal(t + 0.03, sf, d, 4, 0.035, NULL, 0.5);
END
static void drumOut(double t, double vel, double pitch) { I_drum(t, vel, pitch, OUT); }
SFX(hit, VOL_COMBAT, (bool crit, int kind))
  if (kind == HIT_BLADE) {
    NoiseOpt a = NO(); a.type = F_HIGHPASS; a.f = 2500; a.attack = 0.0008; noise(t, 0.008, 0.35, a); // edge contact
    NoiseOpt b = NO(); b.f = 1600; b.f2 = 600; b.q = 1.2; noise(t + 0.004, 0.07, 0.3, b);           // the cut
    double f[4] = { 1870, 2740, 3910, 5230 }, sf[4], d[4] = { 0.22, 0.17, 0.12, 0.08 }; shuffle(f, sf, 4, 0.04);
    metal(t, sf, d, 4, 0.05, NULL, 0.3);
    thud(t, 0.35, 1);
  } else thud(t, 0.25, 1.2);
  if (crit) { // a heavy clang and a boom
    double f[6] = { 523, 1287, 2011, 2896, 3870, 5100 }, sf[6], d[6] = { 1.1, 0.85, 0.6, 0.45, 0.3, 0.2 }; shuffle(f, sf, 6, 0.04);
    metal(t, sf, d, 6, 0.12, NULL, 0.45);
    thud(t, 0.45, 0.6);
    drumOut(t, 0.4, 0.7);
  }
END
SFX(miss, VOL_COMBAT, (void)) whoosh(t, 0.14, 0.14, 1200, 3200, 1600, 3, NULL, 0.1, noiseBuf); END

// projectiles by kind: fire (Lyra), ember (the shaman's foul flame), arcane (missiles), arrow
SFX(cast, VOL_COMBAT, (int kind))
  if (kind == HIT_FIRE) { // ignition "fwoomp", then the ball roaring as it flies
    whoosh(t, 0.28, 0.35, 250, 1300, 600, 0.9, NULL, 0.1, brownBuf);
    roar(t, 0.65, 1.0, 300, 2600, 0.07, NULL, 0.15);
    crackles(t + 0.05, 0.6, 45, 0.18, NULL, 1.5, 1800, 7000);
    tone(t, W_SINE, 60, 95, 0.18, 0.25, TO());
  } else if (kind == HIT_EMBER) { // darker, wetter: low roar with a sizzling hiss
    roar(t, 0.6, 0.85, 180, 1100, 0.12, NULL, 0.15);
    NoiseOpt o = NO(); o.type = F_HIGHPASS; o.f = 5000; o.attack = 0.2; noise(t, 0.55, 0.07, o);
    crackles(t + 0.1, 0.5, 25, 0.12, NULL, 1.5, 1200, 3500);
  } else if (kind == HIT_ARCANE) { // glassy chirp rising, with a fast shimmer
    Node *g = voice(OUT, 0.5), *trem = gainNode(0.5, g);
    osc(W_SINE, 28, t, t + 0.3, gainParam(0.5, trem, &trem->p1));
    const double rs[3] = { 1, 1.5, 2.01 };
    for (int i = 0; i < 3; i++) { Node *o = osc(W_SINE, 700 * rs[i], t, t + 0.3, trem); p_exp(&o->p1, 1900 * rs[i], t + 0.18); }
    perc(g, t, 0.25, 0.22, 0.01);
    whoosh(t, 0.22, 0.12, 2000, 6000, 3000, 2, NULL, 0.1, noiseBuf);
  } else if (kind == HIT_ARROW) { // release: string twang, slap on the bracer, fletching fluttering away
    Node *g = voice(OUT, 0.08), *lp = filt(F_LOWPASS, 2600, 3, g);
    const double RA[3][2] = { { 1, 1 }, { 2, 0.45 }, { 3.01, 0.2 } };
    for (int i = 0; i < 3; i++) { Node *o = osc(W_SAW, 142 * RA[i][0], t, t + 0.3, gainNode(RA[i][1], lp)); p_exp(&o->p1, 122 * RA[i][0], t + 0.2); }
    p_exp(&lp->p1, 350, t + 0.18);
    perc(g, t, 0.3, 0.2, 0.001);
    NoiseOpt a = NO(); a.type = F_HIGHPASS; a.f = 2400; a.attack = 0.0008; noise(t, 0.012, 0.3, a);
    NoiseOpt b = NO(); b.f = 1100; b.q = 1.5; noise(t + 0.004, 0.03, 0.25, b);
    Node *fg = voice(OUT, 0), *fl = filt(F_BANDPASS, 1700, 2.2, fg);
    Node *flut = gainNode(0.5, fl);
    osc(W_SQUARE, 34, t, t + 0.45, gainParam(0.5, flut, &flut->p1)); // feathers chopping the air
    p_exp(&fl->p1, 1200, t + 0.4);
    p_set(&fg->p1, 0.0001, t + 0.03); p_exp(&fg->p1, 0.25, t + 0.08); p_exp(&fg->p1, 0.0001, t + 0.42);
    bufsrc(noiseBuf, t, mrand(), t + 0.45, flut);
  }
END
SFX(bowDraw, VOL_COMBAT, (double dur))
  // the limbs bending: a stick-slip creak rising in pitch as the string tightens, over a low wooden groan
  Node *g = voice(OUT, 0.12), *bp = filt(F_BANDPASS, 1500, 6, g), *bp2 = filt(F_BANDPASS, 2700, 8, g);
  Node *o = osc(W_SAW, 55, t, t + dur + 0.1, bp); connect(o, bp2);
  float curve[32];
  for (int i = 0; i < 32; i++) curve[i] = (float)(48 + 85 * pow(i / 32.0, 1.4) + (mrand() - 0.5) * 30);
  p_curve(&o->p1, curve, 32, t, dur);
  p_set(&g->p1, 0.0001, t); p_lin(&g->p1, 0.09, t + 0.08); p_lin(&g->p1, 0.22, t + dur * 0.9); p_lin(&g->p1, 0.0001, t + dur + 0.04);
  Node *wg = voice(OUT, 0), *wl = filt(F_LOWPASS, 420, 1.5, wg), *wo = osc(W_TRI, 85, t, t + dur + 0.1, wl);
  p_lin(&wo->p1, 125, t + dur);
  p_set(&wg->p1, 0.0001, t); p_lin(&wg->p1, 0.12, t + dur * 0.8); p_lin(&wg->p1, 0.0001, t + dur + 0.05);
  NoiseOpt a = NO(); a.f = 2200; a.q = 1.5; noise(t + 0.02, 0.06, 0.12, a); // arrow nocked against the grip
  NoiseOpt b = NO(); b.type = F_HIGHPASS; b.f = 5000; b.attack = dur * 0.8; noise(t, dur, 0.05, b); // string stretching
END
SFX(impact, VOL_COMBAT, (int kind))
  if (kind == HIT_FIRE || kind == HIT_EMBER) { // a flame burst: crack, boom, roar dying into crackle
    bool big = kind == HIT_FIRE;
    NoiseOpt a = NO(); a.type = F_HIGHPASS; a.f = 2000; a.attack = 0.0008; noise(t, 0.012, 0.5, a);
    Node *g = voice(OUT, 0.35), *lp = filt(F_LOWPASS, big ? 4500 : 2500, 0.8, g);
    p_exp(&lp->p1, 220, t + 0.7);
    perc(g, t, big ? 0.5 : 0.38, 0.75, 0.003);
    bufsrc(brownBuf, t, mrand(), t + 0.85, lp);
    tone(t, W_SINE, 95, 32, 0.4, big ? 0.4 : 0.3, TO());
    roar(t + 0.05, 0.9, big ? 0.25 : 0.18, 500, 900, 0.05, NULL, 0.15);
    crackles(t + 0.03, 1.0, big ? 70 : 40, 0.22, NULL, 2, 1800, 7000);
    if (!big) { NoiseOpt s = NO(); s.type = F_HIGHPASS; s.f = 4500; s.attack = 0.05; noise(t + 0.05, 0.8, 0.06, s); } // sizzle
  } else if (kind == HIT_ARCANE) { // a bright pop of sparks
    double f[4] = { 2350, 3520, 4890, 6610 }, sf[4], d[4] = { 0.3, 0.22, 0.15, 0.1 }; shuffle(f, sf, 4, 0.08);
    metal(t, sf, d, 4, 0.13, NULL, 0.6);
    NoiseOpt a = NO(); a.type = F_HIGHPASS; a.f = 3500; noise(t, 0.05, 0.45, a);
    tone(t, W_SINE, 900, 220, 0.12, 0.4, TO());
  } else if (kind == HIT_ARROW) { // thunk into wood or hide
    NoiseOpt a = NO(); a.type = F_LOWPASS; a.f = 1100; noise(t, 0.03, 0.8, a);
    tone(t, W_TRI, 230, 95, 0.06, 0.5, TO());
    Node *g = voice(OUT, 0), *o = osc(W_TRI, 180, t, t + 0.25, g); // shaft quiver
    osc(W_SINE, 38, t, t + 0.25, gainParam(25, o, &o->p1));
    perc(g, t + 0.01, 0.12, 0.18, 0.004);
  }
END
static void healAt(double t) {
  const int M[4] = { 72, 76, 79, 84 };
  for (int i = 0; i < 4; i++) I_bell(t + i * 0.07, M[i], 0.7, OUT, 0.6);
  NoiseOpt o = NO(); o.type = F_HIGHPASS; o.f = 6000; o.attack = 0.3; o.wet = 0.6; noise(t, 0.8, 0.04, o);
}
SFX(heal, VOL_COMBAT, (void)) healAt(t); END
static void healLater(void *a, void *b, int n) { sfx_heal(); }
SFX(potion, VOL_COMBAT, (void))
  // cork pop, a few glugs of bubbling liquid, a swallow, then the healing chime
  NoiseOpt a = NO(); a.f = 900; a.q = 2; a.attack = 0.0008; noise(t, 0.012, 0.35, a); tone(t, W_SINE, 520, 170, 0.03, 0.3, TO());
  for (int i = 0; i < 7; i++) bubble(t + 0.12 + i * (0.045 + mrand() * 0.04), 1.4);
  const double D2[2] = { 0.5, 0.72 };
  for (int i = 0; i < 2; i++) tone(t + D2[i], W_SINE, 170, 85, 0.09, 0.3, TO());
  after(0.65, healLater, NULL, NULL, 0);
END
SFX(breath, VOL_COMBAT, (void)) { NoiseOpt o = NO(); o.f = 450; o.f2 = 900; o.q = 0.8; o.attack = 0.25; noise(t, 0.6, 0.18, o); I_bell(t + 0.35, 74, 0.5, OUT, 0.6); } END
SFX(enemyDown, VOL_COMBAT, (void)) // a goblin croak, the body falling, a puff of smoke
  Node *g = voice(OUT, 0.2), *bp = filt(F_BANDPASS, 950, 2.5, g), *o = osc(W_SAW, 430, t, t + 0.45, bp);
  p_exp(&o->p1, 130, t + 0.38);
  osc(W_SINE, 31, t, t + 0.45, gainParam(40, o, &o->p1)); // rasp
  perc(g, t, 0.5, 0.38, 0.02);
  thud(t + 0.3, 0.7, 0.8);
  whoosh(t + 0.28, 0.35, 0.12, 400, 1200, 500, 1, NULL, 0.1, noiseBuf);
END
SFX(partyDown, VOL_COMBAT, (void))
  thud(t + 0.1, 0.65, 0.7);
  double f[3] = { 1650, 2470, 3600 }, sf[3], d[3] = { 0.2, 0.14, 0.1 }; shuffle(f, sf, 3, 0.04);
  metal(t + 0.12, sf, d, 3, 0.04, NULL, 0.3); // gear rattling
  I_bell(t + 0.05, 50, 0.8, OUT, 0.6);
END
SFX(combatStart, VOL_JINGLES, (void))
  duck(0.2, 1.2); I_drum(t, 1, 0.7, OUT); I_drum(t + 0.18, 0.8, 0.7, OUT);
  I_horn(t + 0.05, 50, 0.7, 1, OUT); I_horn(t + 0.05, 57, 0.7, 0.9, OUT); I_horn(t + 0.05, 62, 0.7, 0.7, OUT);
END
SFX(turn, VOL_UI, (void)) I_bell(t, 81, 0.45, OUT, 0.3); END
SFX(select, VOL_UI, (void)) tone(t, W_TRI, 1100, 1300, 0.04, 0.08, TO()); END
SFX(click, VOL_UI, (void)) tone(t, W_TRI, 640, 520, 0.04, 0.1, TO()); END
SFX(dieTick, VOL_UI, (void)) { NoiseOpt o = NO(); double v = jit(0.4, 0.4); o.f = jit(3200, 0.3); o.q = 3; noise(t, 0.02, v, o); tone(t, W_SINE, jit(1600, 0.3), 0, 0.015, 0.04, TO()); } END
SFX(success, VOL_UI, (bool crit)) { const int M[3] = { 76, 83, 88 }; for (int i = 0; i < 3; i++) I_bell(t + i * 0.06, M[i], 0.8, OUT, 0.6); if (crit) I_horn(t, 74, 0.8, 0.8, OUT); } END
SFX(fail, VOL_UI, (void)) { ToneOpt o = TO(); o.lp = 900; tone(t, W_TRI, 220, 170, 0.45, 0.2, o); tone(t, W_TRI, 233, 180, 0.45, 0.14, o); } END
SFX(chest, VOL_WORLD, (void))
  // hinge creak: a buzzing stick-slip, then the lid knocking back and coins clinking
  Node *g = voice(OUT, 0.15), *bp = filt(F_BANDPASS, 1100, 5, g), *o = osc(W_SAW, 50, t, t + 0.5, bp);
  float curve[24];
  for (int i = 0; i < 24; i++) curve[i] = (float)(38 + 30 * sin(i * 0.7) + mrand() * 25);
  p_curve(&o->p1, curve, 24, t, 0.42);
  p_set(&g->p1, 0.0001, t); p_lin(&g->p1, 0.16, t + 0.06); p_lin(&g->p1, 0.0001, t + 0.44);
  double f[3] = { 190, 430, 720 }, sf[3], d[3] = { 0.12, 0.07, 0.05 }; shuffle(f, sf, 3, 0.04);
  metal(t + 0.45, sf, d, 3, 0.3, NULL, 0.1);
  NoiseOpt a = NO(); a.type = F_LOWPASS; a.f = 1200; noise(t + 0.45, 0.03, 0.25, a);
  for (int i = 0; i < 6; i++) {
    double tt = t + 0.6 + i * 0.07 + mrand() * 0.05, b = 3000 + mrand() * 1800;
    double ff[4] = { b, b * 1.48, b * 2.21, b * 2.93 }, dd[4] = { 0.3, 0.22, 0.15, 0.1 };
    metal(tt, ff, dd, 4, 0.07, NULL, 0.25);
  }
END
SFX(talk, VOL_UI, (void)) I_pluck(t, 69, 0.2, 0.4, OUT); END
SFX(rest, VOL_JINGLES, (void))
  duck(0.3, 2.5);
  const int M[4] = { 62, 66, 69, 74 };
  for (int i = 0; i < 4; i++) I_bell(t + i * 0.18, M[i], 0.7, OUT, 0.6);
  const int P[4] = { 50, 57, 62, 66 }; I_pad(t, P, 4, 1.6, 1.2, OUT, 1400);
END
static void victoryAt(double t) {
  duck(0.05, 3.2);
  const double H3[3][2] = { { 0, 62 }, { 0.14, 66 }, { 0.28, 69 } };
  for (int i = 0; i < 3; i++) I_horn(t + H3[i][0], H3[i][1], 0.16, 1, OUT);
  I_horn(t + 0.42, 74, 1.4, 1, OUT); I_horn(t + 0.42, 66, 1.4, 0.7, OUT);
  I_drum(t + 0.42, 0.9, 0.8, OUT);
  const int P[4] = { 50, 57, 62, 66 }; I_pad(t + 0.42, P, 4, 1.6, 1.4, OUT, 1600);
}
SFX(victory, VOL_JINGLES, (void)) victoryAt(t); END
SFX(defeat, VOL_JINGLES, (void))
  duck(0, 6);
  const int P[4] = { 38, 50, 53, 57 }; I_pad(t, P, 4, 3.5, 1.6, OUT, 700);
  const int M[4] = { 62, 60, 57, 53 };
  for (int i = 0; i < 4; i++) I_flute(t + 0.3 + i * 0.55, M[i], 0.5, 0.8, OUT);
  I_bell(t + 2.6, 38, 1, OUT, 0.6);
END
SFX(levelUp, VOL_JINGLES, (void))
  duck(0.3, 2);
  const int M[5] = { 72, 76, 79, 84, 88 };
  for (int i = 0; i < 5; i++) I_bell(t + i * 0.08, M[i], 0.9, OUT, 0.6);
  I_horn(t + 0.4, 84, 0.8, 0.6, OUT);
END
SFX(quest, VOL_JINGLES, (void))
  victoryAt(t);
  const int M[3] = { 86, 90, 93 };
  for (int i = 0; i < 3; i++) I_bell(t + 0.5 + i * 0.1, M[i], 0.7, OUT, 0.6);
END

/** A short sample of a category, played when its slider is let go. */
static void prevHit(void *a, void *b, int n) { sfx_hit(false, HIT_BLADE); }
static void prevStep(void *a, void *b, int n) { sfx_step(SURF_GRASS, 1); }
void previewSound(int kind) {
  switch (kind) {
    case VOL_COMBAT: sfx_swing(false); after(0.22, prevHit, NULL, NULL, 0); break;
    case VOL_STEPS: prevStep(NULL, NULL, 0); after(0.26, prevStep, NULL, NULL, 0); after(0.52, prevStep, NULL, NULL, 0); break;
    case VOL_JINGLES: sfx_levelUp(); break;
    case VOL_UI: sfx_success(false); break;
    case VOL_WORLD: sfx_chest(); break;
    case VOL_MASTER: sfx_turn(); break;
  }
}
