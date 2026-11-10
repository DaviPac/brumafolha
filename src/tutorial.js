// The optional tutorial: short hint cards that show up the first time something happens, never blocking play.
// Turned on or off when the game starts, and from the pause menu.
import { G } from "./state.js";
import { sfx } from "./audio.js";

const $ = (s) => document.querySelector(s);

const HINTS = {
  move: ["Andar", "<b>Clique</b> no chão para andar, ou use <b>WASD</b> / as setas."],
  interact: ["Interagir", "Pessoas e objetos com nome ao passar o mouse podem ser usados: <b>clique</b> neles, ou chegue perto e aperte <b>E</b>."],
  check: ["Testes de perícia", "Opções com <span class='chk'>[Perícia CD X]</span> pedem um teste: rola-se um <b>d20</b> e soma-se o bônus de quem do grupo é melhor naquela perícia. Igual ou acima da CD, sucesso. Um 20 natural sempre passa; um 1 sempre falha."],
  party: ["O grupo", "<b>Tab</b> (ou clicar no retrato à esquerda) troca quem você controla. Os outros seguem o líder."],
  quest: ["Objetivos", "Os objetivos ficam no canto superior direito. O <b>Diário</b> (<b>J</b> ou 📖) guarda as missões e as lembranças."],
  gear: ["Equipamento", "Armas, armaduras e escudos vão para a Bolsa. Abra a aba <b>⚔️ Equipamento</b> (tecla <b>I</b>) para vestir cada membro do grupo; a prévia mostra a CA e o ataque antes de trocar."],
  bag: ["A Bolsa", "<b>I</b> (ou 🎒) abre a Bolsa. Itens com 📜 podem ser lidos: clique neles."],
  rest: ["Descansar", "Na fogueira do acampamento você faz um <b>descanso longo</b>: vida, magias e habilidades voltam. Só dá para descansar sem inimigos por perto."],
  approach: ["Abordagens", "Nem todo encontro precisa virar luta. Cada opção é um jeito diferente de resolver; o teste mostra quem rola e o bônus."],
  combat: ["Combate", "O combate é por turnos. A faixa no alto mostra a ordem de <b>iniciativa</b> (d20 + Destreza). O anel dourado marca de quem é a vez."],
  turn: ["Seu turno", "A área clara é até onde você anda neste turno: <b>clique</b> num quadrado para mover. <b>Clique num inimigo</b> para atacar: passe o mouse antes para ver a chance de acerto."],
  actions: ["Ação e Ação Bônus", "Cada turno tem <b>1 Ação</b> (ataque, magia) e <b>1 Ação Bônus</b> (poção, fôlego...), além do movimento. <b>1–5</b> escolhem na barra de baixo; <b>Espaço</b> encerra o turno; <b>Esc</b> cancela a ação escolhida."],
  spells: ["Magias", "Truques podem ser usados sempre. Magias de 1º círculo gastam um <b>espaço</b> (o número no canto do ícone), que volta no descanso."],
  down: ["Caído", "Com 0 PV um personagem cai. Se o grupo vencer, ele levanta com 1 PV. Se todos caírem, a luta pode ser tentada de novo."],
  memory: ["Lembranças", "O <b>Diário de Lembranças</b> (<b>J</b>, aba Lembranças) guarda o que o herói viveu e quem ele é."],
  ruins: ["Muitas saídas", "Aqui há vários caminhos: lutar, conversar, ameaçar, entrar escondido. Você também pode voltar e explorar o vale antes."],
  stealth: ["Furtividade", "Um teste de Furtividade bem-sucedido deixa você passar sem ser visto, ou começar uma luta com <b>rodada surpresa</b>."],
  lampejo: ["Lampejo de Velmoor", "Uma vez por descanso: depois de um teste que falhou, você pode <b>rolar o d20 de novo</b>. Em combate, ele está na barra e dá <b>vantagem</b> no próximo ataque do grupo."],
  escape: ["Corra!", "Siga a trilha marcada até o barco no cais. Não pare: a Bruma está logo atrás."],
  pause: ["Menu", "<b>Esc</b> ou <b>P</b> pausa o jogo e abre o volume de cada som. As dicas do tutorial também podem ser desligadas lá."],
};

const queue = [];
let showing = null;

/** Show a hint the first time it's asked for (only with the tutorial on). */
export function hint(id) {
  if (!G.tutorial || !HINTS[id] || G.hintsSeen.has(id) || queue.includes(id) || showing === id) return;
  queue.push(id);
  if (!showing) next();
}

function next() {
  const el = $("#hint");
  showing = queue.shift() ?? null;
  if (!showing) { el.classList.add("hidden"); return; }
  G.hintsSeen.add(showing);
  const [title, html] = HINTS[showing];
  el.innerHTML = `<div class="ht">💡 ${title}</div><div class="hb">${html}</div><div class="hf"><button class="ok">Entendi</button><button class="off">Desligar dicas</button></div>`;
  el.classList.remove("hidden");
  el.querySelector(".ok").onclick = () => { sfx.click(); next(); };
  el.querySelector(".off").onclick = () => { sfx.click(); setTutorial(false); };
  sfx.select();
}

export function setTutorial(on) {
  G.tutorial = on;
  const box = document.getElementById("tutOn");
  if (box) box.checked = on;
  if (!on) { queue.length = 0; showing = null; $("#hint").classList.add("hidden"); }
}

/** Ask once, before the game starts. */
export function askTutorial() {
  return new Promise((res) => {
    const el = $("#tutask");
    el.classList.remove("hidden");
    const pick = (on) => { sfx.click(); el.classList.add("hidden"); setTutorial(on); res(on); };
    el.querySelector(".yes").onclick = () => pick(true);
    el.querySelector(".no").onclick = () => pick(false);
  });
}
