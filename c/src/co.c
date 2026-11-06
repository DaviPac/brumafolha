// The web version's combat and dialogue are async functions that await sleeps, moves, projectiles and clicks.
// Here each one runs as a coroutine (ucontext) on the main thread: co_spawn starts it right away, like calling
// an async function, and it runs until it waits; co_tick resumes whatever is ready, once per frame.
// Timers stand in for setTimeout.
#include "game.h"
#include <ucontext.h>
#include <stdlib.h>
#include <string.h>

#define CO_STACK (256 * 1024)
typedef struct Co {
  ucontext_t ctx, *back;
  CoFn fn; void *arg;
  bool dead;
  double wake; volatile int *flag; // waiting: until clock >= wake, or *flag != 0
  char *stack;
} Co;

static Co *list[64]; static int nlist;
static Co *cur;
static ucontext_t mainCtx;
static double clock_; // the coroutines' own time: it stands still while the game is paused

static void entry(unsigned lo, unsigned hi) {
  Co *c = (Co *)(((uintptr_t)hi << 32) | (uintptr_t)lo);
  c->fn(c->arg);
  c->dead = true;
  swapcontext(&c->ctx, c->back);
}

static void resume(Co *c) {
  Co *prev = cur;
  c->back = prev ? &prev->ctx : &mainCtx;
  cur = c;
  swapcontext(c->back, &c->ctx);
  cur = prev;
  if (c->dead) {
    for (int i = 0; i < nlist; i++) if (list[i] == c) { memmove(list + i, list + i + 1, sizeof(Co *) * (nlist - i - 1)); nlist--; break; }
    free(c->stack); free(c);
  }
}

void co_spawn(CoFn fn, void *arg) {
  if (nlist >= 64) { fn(arg); return; }
  Co *c = calloc(1, sizeof *c);
  c->fn = fn; c->arg = arg; c->stack = malloc(CO_STACK);
  getcontext(&c->ctx);
  c->ctx.uc_stack.ss_sp = c->stack; c->ctx.uc_stack.ss_size = CO_STACK; c->ctx.uc_link = NULL;
  uintptr_t p = (uintptr_t)c;
  makecontext(&c->ctx, (void (*)(void))entry, 2, (unsigned)(p & 0xffffffffu), (unsigned)(p >> 32));
  list[nlist++] = c;
  resume(c);
}

static void yield(void) { Co *c = cur; swapcontext(&c->ctx, c->back); }
bool co_inside(void) { return cur != NULL; }

void co_sleep(double secs) {
  if (!cur) return;
  cur->wake = clock_ + secs; cur->flag = NULL;
  yield();
}
void co_wait(volatile int *flag) {
  if (!cur) return;
  if (*flag) return;
  cur->flag = flag; cur->wake = 0;
  yield();
  cur->flag = NULL;
}

void co_tick(double dt, bool paused) {
  if (!paused) clock_ += dt;
  // resume, once, everything that was ready when the tick began (a coroutine spawned meanwhile already ran
  // up to its first wait, and one woken by another gets its turn next frame)
  Co *ready[64]; int nr = 0;
  for (int i = 0; i < nlist; i++) { Co *c = list[i]; if (c->flag ? *c->flag != 0 : clock_ >= c->wake) ready[nr++] = c; }
  for (int k = 0; k < nr; k++) {
    Co *c = ready[k];
    bool alive = false;
    for (int i = 0; i < nlist; i++) if (list[i] == c) { alive = true; break; }
    if (!alive || !(c->flag ? *c->flag != 0 : clock_ >= c->wake)) continue;
    resume(c);
  }
}

// ---------------------------------------------------------------- timers (setTimeout: real time, even when paused)
typedef struct { double at; TimerFn fn; void *a, *b; int n; } Timer;
static Timer timers[128]; static int ntimers;
static double tnow;
void after(double secs, TimerFn fn, void *a, void *b, int n) {
  if (ntimers >= 128) return;
  timers[ntimers++] = (Timer){ tnow + secs, fn, a, b, n };
}
void timers_tick(double dt) {
  tnow += dt;
  for (;;) {
    int best = -1;
    for (int i = 0; i < ntimers; i++) if (timers[i].at <= tnow && (best < 0 || timers[i].at < timers[best].at)) best = i;
    if (best < 0) break;
    Timer t = timers[best];
    timers[best] = timers[--ntimers];
    t.fn(t.a, t.b, t.n);
  }
}
