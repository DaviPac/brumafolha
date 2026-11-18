// The campfire of stories (docs/historia.md §8): after a long rest by a fire with no scene of its own, the party sits
// around it. The player picks whom to sit with: each companion has stories, told in order, the last one only to
// someone they trust (the personal talk, approval 3+). Or the hero tells one of their own memories out loud, and it
// is anchored: the tea of the Monastery can't take an anchored memory. One talk per night, then sleep.
import { G } from "./state.js";
import { member, approve, approval, COMPANIONS } from "./companions.js";

let K = null;
export function initCampfire(kit) { K = kit; }

/**
 * Each story: min approval to tell it, `if` (story flags), what they say, the hero's two answers (with approval), and
 * the memory it leaves. A story isn't told twice (F["fire_" + id]).
 */
const STORIES = {
  kael: [
    { id: "k1", lines: ["(Kael mexe nas brasas com a ponta da espada.) A primeira porta que eu bati como Coletor era de um sapateiro. Devia três anos de Tributo.", "Ele pagou com a lembrança de ter aprendido a ler. Na saída, eu vi o menino dele lendo uma placa em voz alta pro pai. O pai ouvia como quem ouve língua estrangeira."],
      answers: [["E você? Ainda lê?", 1, "Devagar. Toda vez que eu leio, eu lembro dele. Acho que é o castigo certo."], ["Você fazia o seu trabalho.", -1, "Era isso que eu dizia. Por oito anos. Funciona até não funcionar."]],
      memory: "Kael, na fogueira, contando do sapateiro que pagou o Tributo com a lembrança de ter aprendido a ler." },
    { id: "k2", min: 1, if: (F) => F.act1, lines: ["O Dário Venn, o Coletor do acampamento. Nós entramos juntos. Ele ria alto, cantava mal, dava pão pros meninos das casas que a gente cobrava.", "Ele ainda dá pão. Eu vi, hoje. E cobra igual. (pausa) Eu não sei se isso é pior ou melhor do que o que eu virei."],
      answers: [["Você parou. Ele não.", 1, "Eu parei. Ainda não sei se parar basta."], ["Pão não paga lembrança.", 0, "Não. Mas ajuda a dormir. A ele, digo."]],
      memory: "Kael, na fogueira, falando do Coletor Dário Venn, que cantava mal e dava pão aos meninos." },
    { id: "k3", min: 3, if: (F) => F.act1, personal: true, lines: ["Eu vou te contar uma coisa que eu nunca contei pra ninguém. Não tem ninguém pra quem contar, então não é tanto mérito assim.", "Eu não lembro do rosto da minha filha. Da Ila. Eu lembro da lamparina, do cheiro do cabelo, do jeito que ela pulava o último degrau. O rosto, não.", "(a mão dele vai até o peito, e volta) Um dia eu te conto por quê. Hoje eu só queria que alguém soubesse que ela tinha um rosto."],
      answers: [["Eu vou lembrar que ela tinha.", 2, "(Ele não responde. Mas fica perto do fogo até o fim, e você nunca viu Kael ficar perto de nada até o fim.)"], ["Ficar em silêncio com ele.", 1, "(O fogo estala. Ele respira fundo, uma vez. É o suficiente.)"]],
      memory: "A noite em que Kael contou sobre a filha, Ila, e disse que não lembra do rosto dela." },
  ],
  lyra: [
    { id: "l1", lines: ["Em Lethiel as árvores têm folhas de prata dos dois lados. Eu ensinava as crianças a contar folhas: uma por dia, só uma, e lembrar dela.", "Uma menina chegou a novecentas e doze. Depois veio uma Poda. (ela sorri) Ela recomeçou do um. Mais rápida, dessa vez."],
      answers: [["Você lembra da folha novecentos e doze?", 1, "Lembro. Tinha uma mordida de lagarta em forma de lua. Ninguém mais lembra. É por isso que eu tenho que lembrar."], ["Por que contar folhas?", 0, "Porque é o tamanho certo de lembrança para uma criança, meu bem. Uma por dia."]],
      memory: "Lyra, na fogueira, contando das crianças de Lethiel que contavam uma folha de prata por dia." },
    { id: "l2", min: 1, if: (F) => F.act1, lines: ["Na véspera da Poda, em Lethiel, a gente põe lanternas na água. Cada uma leva uma coisa que vai ser esquecida, para se despedir.", "Eu pus a minha lanterna na água e entrei no barco atrás dela. Remei a noite inteira. (ela olha as próprias mãos) Ainda tenho os calos. Oitenta anos depois."],
      answers: [["O que ia na sua lanterna?", 1, "(Ela demora.) Um rosto. Que não era meu. Me pergunta outro dia, quando eu tiver bebido menos fumaça."], ["Você fugiu sozinha?", 0, "Todo mundo foge sozinho. Mesmo quando foge junto."]],
      memory: "Lyra, na fogueira, contando da lanterna na água na véspera da Poda, e do barco que remou a noite inteira." },
    { id: "l3", min: 3, if: (F) => F.act1, personal: true, lines: ["Você me perguntou, no começo, por que eu aceitei viajar com alguém que sonha com uma cidade de torres brancas.", "Eu já vi uma lanterna como a do seu sonho. Faz muito tempo. Eu era aprendiz, e segurava a escada de alguém muito mais importante do que eu.", "(Lyra cobre a boca com a mão, como quem segura uma tosse.) Me pergunta de novo quando a gente sair deste reino. Eu juro que respondo. Eu juro, meu bem."],
      answers: [["Eu pergunto. E eu espero.", 2, "Obrigada. Esperar é uma coisa que os humanos fazem mal. Você faz bonito."], ["Por que não agora?", -1, "Porque agora eu ainda tenho medo de você me olhar diferente."]],
      memory: "A noite em que Lyra disse que já viu uma lanterna como a do sonho, e prometeu contar o resto fora do reino." },
  ],
  nix: [
    { id: "n1", lines: ["A primeira lembrança que eu roubei foi de um padeiro. O cheiro do forno às quatro da manhã. Eu tinha nove anos e muita fome.", "Até hoje eu acordo às quatro com fome de pão. Eu nunca trabalhei numa padaria. (ela ri) O padeiro dorme até tarde, agora. Ganhei um hábito, ele ganhou sono."],
      answers: [["Você devolveria, se pudesse?", 1, "Pergunta difícil pra uma ladra. (pensa) Não. Mas eu dividiria. Às quatro, com ele."], ["Bom negócio para os dois.", 0, "Viu? Você entende de Feira."]],
      memory: "Nix, na fogueira, contando que acorda às quatro da manhã com fome de um pão que nunca assou." },
    { id: "n2", min: 1, lines: ["Pena-Rubra. Sabe de onde vem? Eu lembro de uma pena vermelha num parapeito, e de uma mão de mulher pondo ela ali.", "Só que eu já bebi tanta lembrança alheia que não sei se a mão era da minha mãe, ou da mãe de alguém que me vendeu isso por três moedas."],
      answers: [["A pena é sua. Você escolheu o nome.", 2, "(Ela olha pra você por muito tempo, sem o sorriso.) Ninguém nunca me disse isso desse jeito. Anota aí: você me deve uma."], ["Faz diferença?", -1, "Pra você, não. Pra mim, faz toda."]],
      memory: "Nix, na fogueira, falando da pena vermelha num parapeito, e da mão que talvez fosse da mãe dela." },
    { id: "n3", min: 3, personal: true, lines: ["Eu não estou indo pra Maralto pelo dinheiro. Tá, também pelo dinheiro.", "No Arquivo Real tem uma prateleira com lembranças de criança, catalogadas com nome de outro. Uma delas é minha. A primeira. A de antes de tudo.", "Eu nunca contei isso pra ninguém, porque quem sabe o que você quer sabe quanto cobrar. (ela joga um graveto no fogo) Pronto. Agora você sabe o meu preço."],
      answers: [["Eu vou te ajudar a achar.", 2, "Não promete. (pausa) Promete, vai. Eu gosto de ouvir."], ["Por que me contar?", 0, "Porque eu queria ver se doía. Doeu menos do que eu achei."]],
      memory: "A noite em que Nix contou que a primeira lembrança dela está no Arquivo Real, com o nome de outra pessoa." },
  ],
  hulda: [
    { id: "h1", lines: ["O último peregrino de Ormun chegou ao templo há onze anos. Era eu. Fui sozinha, subi os mil degraus de joelho, como manda.", "No topo, caiu uma pedra do teto. Bem do meu lado. Não na cabeça: do lado. (ela sorri) É assim que ele diz obrigado."],
      answers: [["Ele ainda responde, então.", 1, "Responde. Mais devagar. Deus velho é igual anão velho: fala pouco, e com pedra."], ["E se a pedra tivesse caído na cabeça?", 0, "Aí eu ia saber que ele estava bravo. Também é resposta."]],
      memory: "Hulda, na fogueira, contando dos mil degraus do templo de Ormun, e da pedra que caiu do lado dela." },
    { id: "h2", min: 1, lines: ["O chá da Madre levou uma coisa minha. Eu sei porque tem um buraco no lugar. Acho que era a canção da bigorna que a minha mãe cantava.", "Eu lembro do ritmo. Tan, tan-tan, tan. A letra foi embora. (ela bate o martelo na pedra, devagar) Tan, tan-tan, tan."],
      answers: [["Bater o ritmo junto, numa pedra.", 2, "(Hulda para. Olha. Depois continua, mais alto, e as duas batidas ficam juntas por um bom tempo.) ...Ormun gostou. Eu sei. Caiu uma pedrinha."], ["Talvez a letra volte.", 0, "Talvez. Ou talvez eu invente outra. A minha mãe inventava toda vez."]],
      memory: "Hulda, na fogueira, batendo com o martelo o ritmo da canção da bigorna que o chá levou." },
    { id: "h3", min: 3, personal: true, lines: ["Cada milagre que eu peço pode ser o último. Ormun é feito de quem lembra dele, e quem lembra sou eu, e uns velhos nas montanhas.", "Se eu cair, você lembra o nome dele? Não precisa rezar. Só lembrar. Dizer em voz alta, de vez em quando. Ormun. Pra ele não ir embora junto."],
      answers: [["Ormun. Eu lembro.", 2, "(Uma pedrinha cai no seu colo, quente como pão.) Pronto. Agora vocês se conhecem."], ["Você não vai cair.", 1, "Que bonito. Mentira, mas bonito. Ormun gosta de mentira bonita, de vez em quando."]],
      memory: "A noite em que Hulda pediu que você lembrasse o nome de Ormun, se ela caísse." },
  ],
};

const heard = (s) => !!K.F["fire_" + s.id];
/** The next story a companion would tell tonight, and whether approval is what holds it back. */
function nextStory(key) {
  const list = STORIES[key].filter((s) => !heard(s) && (!s.if || s.if(K.F)));
  const s = list[0];
  if (!s) return { story: null };
  return approval(key) >= (s.min ?? 0) ? { story: s } : { story: null, held: true };
}

/** After a long rest with no scene of its own: the fire, and whom to sit with. */
export async function campfire() {
  const here = COMPANIONS.map(member).filter(Boolean);
  const mems = G.memories.filter((m) => !m.struck && !m.anchored);
  if (!here.length) return;
  G.hooks.hint?.("fire");
  await K.scene(async () => {
    const names = here.map((u) => u.name);
    const v = await K.ask(null, `O fogo estala. ${names.length > 1 ? names.slice(0, -1).join(", ") + " e " + names[names.length - 1] + " se ajeitam" : names[0] + " se ajeita"} em volta dele. A noite é longa, e ninguém tem sono ainda.`, [
      ...here.map((u) => { const n = nextStory(u.key); return { label: `Sentar perto de ${u.name}.`, tag: n.story?.personal ? "conversa pessoal" : n.story ? "história" : null, v: u.key }; }),
      ...(mems.length ? [{ label: "Contar uma lembrança sua.", tag: "ancorar", v: "tell" }] : []),
      { label: "Dormir.", v: "sleep" },
    ]);
    if (v === "sleep" || v == null) { await K.say(null, "Você deita de costas para o fogo. O calor nas costas, a noite na cara. Dorme rápido."); return; }
    if (v === "tell") return tell(here, mems);
    const u = member(v), n = nextStory(v);
    if (!n.story) {
      await K.say(u, n.held ? silent(v) : done(v));
      return;
    }
    const s = n.story;
    K.F["fire_" + s.id] = true;
    await K.lines(s.lines.map((t) => [u, t]));
    const a = await K.ask(u, "(O fogo estala.)", s.answers.map(([label, ap], i) => ({ label, v: i })));
    const [, ap, reply] = s.answers[a ?? 0];
    approve(v, ap);
    await K.say(u, reply);
    K.remember("fire_" + s.id, s.memory);
  });
}
/** Someone who isn't ready to tell the next story yet. */
const silent = (k) => ({
  kael: "(Kael olha o fogo e não diz nada. Hoje não. Talvez quando ele confiar mais em você.)",
  lyra: "Hoje eu só quero ouvir o fogo, meu bem. Ele não me pergunta nada.",
  nix: "Hoje a loja está fechada, chefe. Volta quando eu gostar mais de você.",
  hulda: "(Hulda resmunga uma reza curta e vira de lado.) Ormun disse que ainda não. Eu concordo com ele.",
}[k]);
const done = (k) => ({
  kael: "Eu já te contei o que eu tinha pra contar. O resto eu ainda estou vivendo.",
  lyra: "Por hoje, meu bem, eu já gastei as minhas melhores histórias. As piores eu guardo para os inimigos.",
  nix: "Acabou o estoque, chefe. Volta no mês que vem.",
  hulda: "Ormun diz que eu falei demais por um ano. Ele não sabe contar anos. Mas tem razão.",
}[k]);

/** The hero tells a memory out loud: someone answers, and the memory is anchored. */
async function tell(here, mems) {
  const pick = await K.ask(null, "(O Diário está no seu colo. Qual delas você conta em voz alta?)", [
    ...mems.slice(-6).map((m) => ({ label: `Contar: "${m.text.length > 64 ? m.text.slice(0, 62) + "…" : m.text}"`, tag: m.origin ? "origem" : "lembrança", v: m.id })),
    { label: "Deixar para outra noite.", v: null },
  ]);
  if (!pick) return;
  const m = G.memories.find((x) => x.id === pick);
  m.anchored = true;
  const u = here.slice().sort((a, b) => approval(b.key) - approval(a.key))[0];
  await K.say(null, "Você conta devagar, com os detalhes que só você sabe. Quando termina, a lembrança parece mais pesada no Diário. Mais funda. Como um prego que entrou até o fim.");
  await K.say(u, {
    kael: "(Kael demora para falar.) Agora eu também sei. Se você esquecer, eu conto de volta. Do meu jeito, mal contado.",
    lyra: "Guardei, meu bem. Trezentos anos de prateleira, e ainda cabe uma.",
    nix: "Que lembrança boa. Eu não vou roubar. (pausa) Eu vou pensar em roubar. Mas não vou.",
    hulda: "Ormun ouviu. O que Ormun ouve fica gravado. É a especialidade dele: coisa que não sai.",
  }[u.key]);
  approve(u.key, 1);
  K.refreshJournal();
}
