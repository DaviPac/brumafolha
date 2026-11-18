// Relics of Velmoor (docs/historia.md §8, "lore à Dark Souls"): six small things from the night of the ritual, one
// in each place of the prologue and of Act I, in a chest of their own. Each one is read in the bag and tells a piece
// of that night; carried, it helps a little in one skill (+1 to whoever of the party rolls it). Together they tell
// what the Diário calls "A noite de Velmoor", without saying Aurelith's name: that is for Act II.
//
// The chests are added at the END of each map's chest list (ids <map>:c<n> are by position, docs/salvamento.md):
// old saves find them closed where they always were.
import { G } from "./state.js";
import { TILE } from "./util.js";

export const RELICS = [
  { id: "relic_bell", map: "vale", at: [40, 18], chest: "Oco na raiz", name: "Sino de vidro", icon: "bell", skill: "Percepção",
    desc: "Um sino do tamanho de um dedal, de vidro fino, sem badalo. Carregado: +1 em Percepção.",
    read: "<p>Os sinos de Velmoor eram de vidro, e tocavam com o vento que vinha do lago.</p><p>Na última noite não houve vento. Os sinos tocaram mesmo assim, todos juntos, a noite inteira. Quem ouviu achou que era festa e foi para a rua.</p><p>É por isso que havia tanta gente na praça quando ela subiu a escada.</p>" },
  { id: "relic_quill", map: "relicario", at: [17, 15], chest: "Arca de escriba", name: "Pena de arquivista", icon: "quill", skill: "História",
    desc: "Uma pena branca, com a ponta manchada de uma tinta que não seca. Carregada: +1 em História.",
    read: "<p>Os arquivistas de Velmoor escreviam o nome de cada pessoa que nascia na cidade, num livro que ninguém lia. Lembrar era o ofício deles.</p><p>Esta pena escreveu um nome só, naquela noite, numa página em branco. Depois riscou o nome. A tinta do risco ainda está fresca.</p>" },
  { id: "relic_ring", map: "vau", at: [30, 24], chest: "Caixote do cais", name: "Anel sem pedra", icon: "ring", skill: "Persuasão",
    desc: "Prata branca, o engaste vazio. Carregado: +1 em Persuasão.",
    read: "<p>Dentro do aro, gravado em letra miúda: <i>para quem lembra por nós</i>.</p><p>Os refugiados do norte trocam isto por pão sem saber o que é. Em Velmoor, era o anel que se dava a quem ficava de vigília na noite das lanternas, para os outros poderem dormir.</p><p>Naquela noite, todos os vigias deram o anel a uma pessoa só.</p>" },
  { id: "relic_mirror", map: "travessia", at: [9, 7], chest: "Bolsa enterrada", name: "Caco de espelho", icon: "mirror", skill: "Intuição",
    desc: "Um triângulo de espelho, frio, que não embaça com o hálito. Carregado: +1 em Intuição.",
    read: "<p>Os espelhos de Velmoor mostravam o rosto de quem olhava como ele seria lembrado, não como era.</p><p>Neste caco, o seu rosto aparece um pouco mais velho, e sorrindo. Atrás do seu ombro, por um instante, uma mulher de cabelos de prata segurando uma lanterna. Quando você vira, não há ninguém.</p>" },
  { id: "relic_cup", map: "bosque", at: [33, 6], chest: "Oco de árvore", name: "Taça de folha", icon: "cup", skill: "Medicina",
    desc: "Uma taça de prata em forma de folha, com a borda gasta de mão. Carregada: +1 em Medicina.",
    read: "<p>Não é de Velmoor. O desenho é élfico: uma folha de prata dos dois lados, como as árvores de Lethiel.</p><p>No pé da taça, alguém gravou em élfico antigo: <i>o que se bebe aqui não volta</i>. Por dentro, um resíduo branco, fino como cinza, que cheira a lavanda.</p><p>Alguém de Lethiel esteve em Velmoor naquela noite, e trouxe de beber.</p>" },
  { id: "relic_ribbon", map: "claustro", at: [30, 15], chest: "Arca dos confiscos antigos", name: "Fita de estandarte", icon: "ribbon", skill: "Arcanismo",
    desc: "Um pedaço de seda branca, bordado com uma torre. Carregado: +1 em Arcanismo.",
    read: "<p>O primeiro véu da Ordem foi cortado de um estandarte de Velmoor. A torre bordada ainda aparece, se a luz bate de lado.</p><p>A Ordem guarda esta fita como relíquia e não sabe por quê. A irmã que a cortou escreveu, num papel preso ao nó: <i>ela pediu que esquecessem, e nós obedecemos. Era o único jeito de amá-la.</i></p>" },
];

/** A relic as a bag item: readable, with its small help. */
export const relicItem = (r) => ({ id: r.id, name: r.name, icon: r.icon, relic: true, skill: r.skill, desc: r.desc, read: r.read });

/** Put this map's relic chest at the end of its chest list (on a free tile near the spot). */
export function addRelics(W) {
  for (const r of RELICS) {
    if (r.map !== W.id) continue;
    let [tx, ty] = r.at;
    outer: for (let d = 0; d < 6; d++) for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) {
      const x = r.at[0] + dx, y = r.at[1] + dy;
      if (x > 0 && y > 0 && x < W.w - 1 && y < W.h - 1 && !W.blocked(x, y) && !W.chests.some((c) => Math.floor(c.x / TILE) === x && Math.floor((c.y - 1) / TILE) === y)) { tx = x; ty = y; break outer; }
    }
    W.chests.push({ x: tx * TILE + 16, y: ty * TILE + 26, open: false, loot: { potions: 0, gold: 0, items: [relicItem(r)] }, name: r.chest, relic: r.id });
  }
}

/** The relics in the bag: their help in a skill check. */
export const relicBonus = (skill) => G.items.filter((i) => i.relic && i.skill === skill).length;
export const relicsFound = () => RELICS.filter((r) => G.items.some((i) => i.id === r.id));
