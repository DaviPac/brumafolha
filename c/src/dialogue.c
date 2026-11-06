// Conversations with choices and d20 skill checks, the tabletop way (dialogue.js).
#include "game.h"
#include "ui.h"
#include <stdio.h>
#include <string.h>

typedef struct { const char *skill; int dc; const char *who; } Check;
typedef void (*Act)(void);
typedef struct {
  const char *label, *tag, *to;
  bool once, hasCheck; Check check;
  Act doFn, pass, fail; const char *passTo, *failTo;
} Opt;
typedef struct { const char *text; Opt opts[6]; int n; } DNode;

enum { TREE_MAREN = 1, TREE_TOME = 2 };
static struct { Unit *npc; int tree; const char *used[16]; int nused; DNode node; bool on; } current;

// ---------------------------------------------------------------- the d20
static volatile int diceDone;
static void diceClickable(void *a, void *b, int n) { diceView.clickable = true; }
void dice_click(void) { if (diceView.clickable) { diceView.clickable = false; diceView.visible = false; diceDone = 1; } }
/** Show the big d20, roll it; returns the roll, fills total and ok. Runs inside a coroutine. */
static int skillCheck(const char *skill, const char *who, int bonus, int dc, int *total, bool *ok) {
  diceView.visible = true; diceView.clickable = false;
  snprintf(diceView.skill, sizeof diceView.skill, "%s · %s", skill, who);
  snprintf(diceView.dc, sizeof diceView.dc, "Classe de Dificuldade %d  ·  bônus %s%d", dc, bonus >= 0 ? "+" : "", bonus);
  diceView.result[0] = 0;
  diceView.spin = true; diceView.spinT = 0;
  int r = rollDie(20);
  for (int n = 0; n <= 16; n++) { co_sleep(0.06); diceView.num = rollDie(20); sfx_dieTick(); }
  diceView.spin = false;
  diceView.num = r;
  *total = r + bonus;
  *ok = r == 20 || (r != 1 && *total >= dc);
  if (r == 20) snprintf(diceView.result, sizeof diceView.result, "Sucesso crítico!");
  else if (r == 1) snprintf(diceView.result, sizeof diceView.result, "Falha crítica!");
  else snprintf(diceView.result, sizeof diceView.result, "%s  (%d)", *ok ? "Sucesso" : "Falha", *total);
  diceView.ok = *ok;
  if (*ok) sfx_success(r == 20); else sfx_fail();
  diceDone = 0;
  after(0.25, diceClickable, NULL, NULL, 0);
  co_wait(&diceDone);
  return r;
}

// ---------------------------------------------------------------- Maren the fisher
static void acceptQuest(void) { G.quest.stage = 1; G.quest.patrolSeen = 1; }
static void paidPass(void) { G.potions += 2; toast("+2 Poções de cura", 2.2); }
static void secretPass(void) { G.quest.grandson = true; }
static void questDone(void) { hook_questDone(); }
static void tomeFound(void) { G.quest.grandsonFound = true; hook_tomeLeaves(); }

static Opt O(const char *label, const char *to) { Opt o; memset(&o, 0, sizeof o); o.label = label; o.to = to; return o; }
static Opt OC(const char *label, const char *skill, int dc, const char *who, Act pass, const char *passTo, const char *failTo) {
  Opt o = O(label, NULL); o.hasCheck = true; o.once = true; o.check = (Check){ skill, dc, who }; o.pass = pass; o.passTo = passTo; o.failTo = failTo; return o;
}
static Opt OD(const char *label, Act fn, const char *to) { Opt o = O(label, to); o.doFn = fn; return o; }

static DNode marenNode(const char *id) {
  DNode d; memset(&d, 0, sizeof d);
  if (!strcmp(id, "start")) {
    int stage = G.quest.stage;
    if (stage == 0) {
      d.text = "Ah! Viajantes de verdade, graças à Senhora das Marés. Goblins tomaram as velhas Ruínas de Velmoor, ao norte. Roubam minhas redes, assustam os peixes, e ontem quase levaram o barco.";
      d.opts[d.n++] = O("Nós cuidamos dos goblins.", "accept");
      d.opts[d.n++] = OC("Um trabalho desses merece pagamento adiantado.", "Persuasão", 12, "hero", paidPass, "paid", "notpaid");
      d.opts[d.n++] = OC("Você está escondendo alguma coisa.", "Intuição", 10, "mage", secretPass, "secret", "nosecret");
      { Opt o = O("Quantos são?", "count"); o.tag = "Perguntar"; d.opts[d.n++] = o; }
      d.opts[d.n++] = O("Agora não.", "end");
    } else if (stage == 1) {
      d.text = "As ruínas ficam ao norte, sigam a estrada. Cuidado com o chefe deles, um brutamontes chamado Gorza.";
      d.opts[d.n++] = O("Estamos indo.", "end");
    } else if (stage == 2) {
      d.text = G.quest.grandsonFound ? "Vocês... trouxeram notícias do Tomé? Ele está vivo! Escondido nas ruínas esse tempo todo, o tolo. Não tenho como agradecer."
                                     : "A fumaça das ruínas parou! Vocês conseguiram mesmo. O lago está em paz de novo.";
      d.opts[d.n++] = OD("Foi um prazer.", questDone, "reward");
    } else {
      d.text = "Voltem quando quiserem. Sempre haverá peixe assado pra vocês.";
      d.opts[d.n++] = O("Até mais, Maren.", "end");
    }
  } else if (!strcmp(id, "accept")) {
    d.text = "Que os deuses guiem suas lâminas. A estrada ao norte leva direto às ruínas. E vi uma patrulha deles rondando a trilha.";
    d.opts[d.n++] = OD("Vamos lá.", acceptQuest, "end");
  } else if (!strcmp(id, "paid")) {
    d.text = "Hmpf... justo. Tomem, duas poções do meu estoque. Mas eu quero aqueles goblins longe daqui!";
    d.opts[d.n++] = OD("Combinado.", acceptQuest, "end"); d.opts[d.n++] = O("Mais uma pergunta.", "start");
  } else if (!strcmp(id, "notpaid")) {
    d.text = "Adiantado? Ha! Paguem-se com o que os goblins roubaram de mim, se acharem.";
    d.opts[d.n++] = OD("Justo.", acceptQuest, "end"); d.opts[d.n++] = O("Mais uma pergunta.", "start");
  } else if (!strcmp(id, "secret")) {
    d.text = "...Meu neto, Tomé. Foi atrás das redes e não voltou. Se o virem nas ruínas, por favor... tragam ele de volta.";
    d.opts[d.n++] = O("Vamos encontrá-lo.", "start");
  } else if (!strcmp(id, "nosecret")) {
    d.text = "Escondendo? Só o cheiro de peixe, querida. Hah!";
    d.opts[d.n++] = O("Certo...", "start");
  } else if (!strcmp(id, "count")) {
    d.text = "Uns quatro ou cinco nas ruínas. Um deles mexe com fogo, um xamã. Se fosse eu, derrubava esse primeiro.";
    d.opts[d.n++] = O("Bom saber.", "start");
  } else if (!strcmp(id, "reward")) {
    d.text = "Tomem, é pouco, mas é de coração: 50 peças de ouro. E o barco é de vocês quando quiserem pescar.";
    d.opts[d.n++] = O("[Fim do protótipo] Obrigado, Maren.", "end");
  }
  return d;
}
static DNode tomeNode(const char *id) {
  DNode d; memset(&d, 0, sizeof d);
  if (!strcmp(id, "start")) {
    d.text = "Não me machuquem! Ah... vocês não são goblins. Eu sou o Tomé. Fiquei escondido aqui atrás da coluna desde que eles chegaram.";
    d.opts[d.n++] = OD("Sua avó está te esperando no cais.", tomeFound, "bye");
  } else if (!strcmp(id, "bye")) {
    d.text = "A vó Maren! Vou correndo pra lá. Obrigado, de verdade!";
    d.opts[d.n++] = O("Vá com cuidado.", "end");
  }
  return d;
}

// ---------------------------------------------------------------- the box
static bool used(const char *label) { for (int i = 0; i < current.nused; i++) if (!strcmp(current.used[i], label)) return true; return false; }
static void typeText(const char *text) {
  snprintf(dlgView.text, sizeof dlgView.text, "%s", text);
  dlgView.shown = 0; dlgView.typeT = 0;
}
static void show(const char *id) {
  current.node = current.tree == TREE_MAREN ? marenNode(id) : tomeNode(id);
  typeText(current.node.text);
  dlgView.nopts = current.node.n;
  for (int i = 0; i < current.node.n; i++) {
    Opt *o = &current.node.opts[i];
    char tag[80] = "";
    if (o->hasCheck) snprintf(tag, sizeof tag, "<span class=\"tag chk\">[%s CD %d]</span> ", o->check.skill, o->check.dc);
    else if (o->tag) snprintf(tag, sizeof tag, "<span class=\"tag\">[%s]</span> ", o->tag);
    snprintf(dlgView.opts[i].html, sizeof dlgView.opts[i].html, "%d. %s%s", i + 1, tag, o->label);
    dlgView.opts[i].used = o->once && used(o->label);
  }
}
static void closeDialogue(void) {
  dlgView.visible = false;
  current.on = false;
  G.mode = MODE_EXPLORE;
  updateQuest();
  updateParty();
  hook_afterDialogue();
}
static void go(const char *id) {
  if (!id || !strcmp(id, "end")) { closeDialogue(); return; }
  show(id);
}
bool dialogue_open(void) { return current.on; }

void openDialogue(Unit *npc, int tree) {
  G.mode = MODE_DIALOGUE;
  sfx_talk();
  memset(&current, 0, sizeof current);
  current.npc = npc; current.tree = tree; current.on = true;
  dlgView.visible = true; dlgView.npc = npc;
  show("start");
}

/** Typing: two characters every 16 ms; a click on the text shows it all. */
void dialogue_update(double dt) {
  if (!dlgView.visible) return;
  int len = (int)strlen(dlgView.text);
  if (dlgView.shown >= len) return;
  dlgView.typeT += dt;
  while (dlgView.typeT >= 0.016 && dlgView.shown < len) {
    dlgView.typeT -= 0.016;
    for (int k = 0; k < 2 && dlgView.shown < len; k++) {
      dlgView.shown++;
      while (dlgView.shown < len && (dlgView.text[dlgView.shown] & 0xC0) == 0x80) dlgView.shown++;
    }
  }
}
void dialogue_text_click(void) { dlgView.shown = (int)strlen(dlgView.text); }

typedef struct { Opt o; } Pick;
static Pick picks[8]; static int pickN;
static void optionTask(void *arg) {
  Opt o = ((Pick *)arg)->o;
  if (o.hasCheck) {
    Unit *who = G.party[0];
    for (int i = 0; i < G.nparty; i++) if (!strcmp(G.party[i]->key, o.check.who)) who = G.party[i];
    int bonus = 0;
    for (int i = 0; i < who->nskills; i++) if (!strcmp(who->skills[i].name, o.check.skill)) bonus = who->skills[i].v;
    int total; bool ok;
    int r = skillCheck(o.check.skill, who->name, bonus, o.check.dc, &total, &ok);
    ui_log(ok ? LOG_HEAL : LOG_MISS, "%s — %s: %d+%d = %d vs CD %d · %s", who->name, o.check.skill, r, bonus, total, o.check.dc, ok ? "sucesso" : "falha");
    Act next = ok ? o.pass : o.fail;
    if (next) next();
    if (current.on) go(ok ? o.passTo : o.failTo);
    return;
  }
  if (o.doFn) o.doFn();
  if (current.on) go(o.to);
}
/** The option's click handler (also what the number keys fire, even on a spent option, like .click()). */
void dialogue_click_option(int i) {
  if (!current.on || i < 0 || i >= current.node.n) return;
  Opt *o = &current.node.opts[i];
  sfx_click();
  if (o->once && current.nused < 16) current.used[current.nused++] = o->label;
  Pick *p = &picks[pickN++ % 8];
  p->o = *o;
  co_spawn(optionTask, p);
}
void dialogueKey(int n) {
  if (!current.on) return;
  dialogue_click_option(n - 1);
}
