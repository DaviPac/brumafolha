// The game's version and its patch notes: one place for the page, the service worker (sw.js) and the saves.
//
// To publish an update: raise VERSION and put a new entry at the top of NOTES. The service worker imports this file,
// so the browser sees a new worker; it installs in the background and the game moves to it by itself at a safe
// moment (see src/update.js). Players see the notes of what changed the first time they open the new version.
// No DOM here: the service worker imports it too.

export const VERSION = "0.9.2";

/** Newest first. { version, date: "AAAA-MM-DD", title, items: [html] } */
export const NOTES = [
  {
    version: "0.9.2", date: "2026-11-22", title: "O vale mais vivo",
    items: [
      "A <b>hora do dia</b> aparece de verdade: a madrugada é fria e pálida, o fim de tarde é dourado, a noite é azul, e o lago escurece junto. A Bruma toma a cor da hora e pega a luz das fogueiras e dos lampiões.",
      "O <b>Relicário</b> ficou escuro e frio, iluminado pelos braseiros de Velmoor. O <b>claustro</b> do Mosteiro ficou na penumbra, com poças de luz das velas e da lareira.",
      "Os lugares parecem habitados: pedrinhas, folhas caídas, flores, poças, musgo entre as pedras, cestos, sacos, vasos, tocos e cogumelos. Fagulhas sobem das fogueiras, há pólen de dia e vaga-lumes só ao entardecer e de noite.",
      "O vau da Travessia tem correnteza e pedras para pisar, e a borda entre o capim seco e a grama não é mais uma linha reta.",
      "Quem está parado pisca, olha em volta e se vira para você quando você chega perto.",
      "Oito coisas novas para examinar, e dois cantos fora da trilha no prólogo para quem gosta de andar: um banco virado para o lago e um muro de nomes nas ruínas.",
      "Som de porta no claustro, passos de pedra no calçamento, e poeira no chão a cada golpe no combate.",
    ],
  },
  {
    version: "0.9.1", date: "2026-11-18", title: "Revisão da história",
    items: [
      "Nas conversas, o que o seu herói <b>diz</b> aparece sem aspas, e o que ele <b>faz</b> aparece <i>em itálico</i>. Quando um companheiro responde por você, o nome dele vem na frente.",
      "Mandar o Tomé para casa antes de ele mostrar a porta não prende mais o prólogo: ele conta onde fica a laje, e dá para achá-la na coluna partida. Saves presos nesse ponto se soltam sozinhos ao carregar.",
      "Se a luta do Relicário acabar depressa, a Arquivista ainda aparece, logo depois. Saves feitos nesse ponto também se corrigem ao carregar.",
      "Um teste que falha não pode mais ser repetido até dar certo. Quando o que ele daria é necessário, há sempre outro caminho: outra pessoa que sabe, outro preço, um companheiro.",
      "Rosalva entrega o recado de L. a quem mostrar a marca, mesmo sem a carta. A chave da cela de Hulda fica num prego quando os guardas saem sem entregá-la. Nix ajuda com o cadeado do cofre.",
      "Falas que não combinavam com o que já tinha acontecido foram corrigidas: quem já se apresentou não se apresenta de novo, a Madre não oferece uma Hulda que já está com você, o Sabiá conta quem de fato está na sala, Pipa levada ao pai antes da hora reencontra o pai na hora, e recompensas não saem duas vezes.",
      "Falas ditas ao seu herói agora respeitam o gênero que você escolheu.",
    ],
  },
  {
    version: "0.9.0", date: "2026-11-17", title: "Ato I, capítulo 2: O Véu Sereno",
    items: [
      "O <b>capítulo 2</b>: pelo sul do bosque até o <b>Mosteiro do Véu Sereno</b>, com o pátio, o jardim do chá de bruma, a cozinha, o dormitório dos órfãos, a capela e a ala que não se mostra a visitantes.",
      "A <b>Madre Odília</b> conversa com você, gentil e quase convincente. <b>Hulda Ferrobarba</b>, a última sacerdotisa de Ormun, entra no grupo. O <b>Velho Sabiá</b> está lá.",
      "Uma escolha sobre o Mosteiro, uma missão secundária (o passarinho de Pipa) e inimigos novos: as mariposas da Bruma e os irmãos do Véu.",
      "Quem já terminou o capítulo 1 segue de onde parou: a saída para o Mosteiro fica no fim da estrada do Cardo, a leste. Os saves da versão anterior continuam valendo.",
      "Corrigido: no primeiro descanso em Vau-de-Cardo a tela ficava preta. A conversa com a Arquivista acontecia no escuro, escondida atrás dele; agora ela aparece.",
    ],
  },
  {
    version: "0.8.0", date: "2026-11-17", title: "Atualizações automáticas",
    items: [
      "O jogo se atualiza sozinho: a versão nova baixa em segundo plano e entra num momento seguro, com um save automático antes, e você continua de onde estava.",
      "Esta janela de <b>Novidades</b> aparece depois de cada atualização, e fica no menu inicial e no menu de opções.",
      "O número da versão aparece no menu inicial e nas opções.",
    ],
  },
  {
    version: "0.7.0", date: "2026-11-17", title: "Brumafolha como app",
    items: [
      "Dá para <b>instalar</b> o jogo: botão <b>Instalar o jogo</b> no menu inicial (no iPhone, Compartilhar → Adicionar à Tela de Início).",
      "Instalado, abre em tela cheia e funciona <b>sem internet</b>.",
      "Ícone novo: a folha da abertura sobre a névoa do vale.",
    ],
  },
  {
    version: "0.6.0", date: "2026-11-17", title: "Celular e toque",
    items: [
      "Interface pensada para celular, de pé ou deitado: barra de ações, retratos, iniciativa e Diário cabem na tela.",
      "Controles por toque: toque para andar e usar, segure e arraste para andar sem parar.",
      "No combate, um toque mostra o caminho ou a chance de acerto e o segundo confirma.",
      "Botão de <b>Tela cheia</b> nas opções.",
    ],
  },
  {
    version: "0.5.1", date: "2026-11-17", title: "Câmera no combate",
    items: [
      "Mova a câmera livremente no combate: arraste com o botão direito, Shift + WASD, o analógico direito ou o dedo. <b>C</b> recentraliza.",
      "A câmera acompanha as ações: segue o projétil em voo e depois o alvo.",
    ],
  },
  {
    version: "0.5.0", date: "2026-11-17", title: "Saves",
    items: [
      "Vários saves, save rápido (F5 / F9) e saves automáticos, em exploração, conversas e combate.",
      "Menu inicial com o vale ao fundo e uma abertura na primeira vez.",
    ],
  },
];

/** Compare "1.2.3" versions: negative if a is older than b. */
export function cmpVersion(a, b) {
  const pa = String(a).split(".").map(Number), pb = String(b).split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
}
