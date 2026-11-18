// Vau-de-Cardo alive: a few residents who walk their rounds (the dock, the market, the well, the garrison), and what
// people say out loud when the party walks by, which follows what the party did (the poster, the strongbox, Rosalva,
// the Collector, the end of the chapter). Lines are bubbles over heads (companions.js), never during a fight, a
// conversation or a scene; they may repeat, after a while, like real gossip does.
//
// The residents are added at the END of the map's NPC list (ids by position, docs/salvamento.md). A save from before
// them doesn't list them; restore() puts them back (they are marked `resident`).
import { G, lead } from "./state.js";
import { TILE, dist } from "./util.js";
import { SPECS } from "./art/chars.js";
import { findPath } from "./path.js";
import { bubble, bubbleCount, banterTalking } from "./companions.js";

const C2 = (a, b, c, d) => [a, b, c, d].map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));
let E = null, inScene = () => false;
export function initTown(kit) { E = kit.E; inScene = kit.inScene; }

function specs() {
  if (SPECS.porter) return;
  const H = SPECS.hero;
  SPECS.porter = { ...H, cape: null, weapon: "none", hairStyle: "short", beard: "short", hair: C2("#2a1610", "#4a2a1a", "#6e4026", "#90582e"), tunic: C2("#4a2a0a", "#7a4a14", "#a8701e", "#cc9634") };
  SPECS.washer = { ...H, cape: null, weapon: "none", femme: true, hairStyle: "bun", hair: C2("#3a1a0e", "#7a3216", "#b0521e", "#d8803a"), tunic: C2("#18283e", "#22405e", "#2e5a80", "#4278a0") };
  SPECS.girl = { ...H, cape: null, weapon: "none", femme: true, small: true, hairStyle: "long", hair: C2("#141016", "#2a2228", "#40343a", "#5a4a4e"), tunic: C2("#6a6050", "#9a9080", "#c8bea8", "#ece4d0") };
  SPECS.fisher = { ...H, cape: null, weapon: "none", hairStyle: "hood", hair: C2("#0e2a2a", "#1a4444", "#2a6262", "#3e8484"), tunic: C2("#0e2a2a", "#1a4444", "#2a6262", "#3e8484"), beard: "long" };
}

/** The residents of a map, added after everyone the story put there. */
export function addResidents(W) {
  if (W.id !== "vau") return;
  specs();
  const r = (spec, def) => { const u = E.unit(SPECS[spec] ?? spec, { team: "npc", maxHp: 8, ac: 10, resident: true, ri: 0, wait: 2 + W.npcs.length % 4, ...def }); W.npcs.push(u); return u; };
  r("porter", { key: "porter", name: "Carregador do cais", tx: 12, ty: 23, route: [[12, 23], [20, 17], [26, 13], [20, 17]] });
  r("washer", { key: "washer", name: "Lavadeira", tx: 8, ty: 17, route: [[8, 17], [19, 15], [8, 17], [12, 21]] });
  r("guard", { key: "patrol", name: "Soldado de ronda", tx: 30, ty: 9, route: [[30, 9], [37, 10], [37, 16], [29, 15]] });
  r("girl", { key: "girl", name: "Menina com um balde", tx: 19, ty: 16, small: true, route: [[19, 16], [14, 19], [22, 13]] });
  r("fisher", { key: "fisher", name: "Pescador", tx: 6, ty: 24, route: [[6, 24], [15, 24]] });
}

/** Lines said out loud near the party. `who`: an NPC's key or name. The first that fits is said; then it rests. */
const SAYS = [
  // the garrison patrol
  { who: "patrol", if: (F) => F.ch1_done, text: "Dizem que a Capitã Hesta voltou do vau sem a prisioneira. E com menos homens do que foi." },
  { who: "patrol", if: (F) => F.lume_got && !F.ch1_done, text: "Alguém abriu o cofre do comandante. O sargento diz que não viu nada. O sargento nunca vê nada." },
  { who: "patrol", if: (F) => F.poster_taken, text: "Arrancaram o cartaz da Coroa do quadro. Vou ter que pregar outro. Eu nem sei ler direito o que diz." },
  { who: "patrol", if: (F) => F.poster_seen, text: "Duzentas peças por uma mão de prata. Com isso eu comprava de volta a lembrança do meu casamento." },
  { who: "patrol", text: "O portão só abre de manhã. Ordem do comandante. Não fui eu que inventei a Bruma." },
  // the dock
  { who: "porter", if: (F) => F.rosalva_mark, text: "A Rosalva fechou o Sabiá mais cedo ontem. Ela nunca fecha mais cedo. Nem no dia em que o marido morreu." },
  { who: "porter", if: (F) => F.goblin_pact, text: "Goblins guardando o vau. Goblins! E cobrando menos pedágio do que a Coroa, isso eu tenho que admitir." },
  { who: "porter", text: "Três barcos hoje, todos do norte, todos cheios. Ninguém lá dentro sabe dizer de onde saiu." },
  { who: "fisher", if: (F) => F.maren_aboard, text: "A velha que desceu com vocês pesca melhor do que eu. Na idade dela. Com uma rede remendada. Eu desisto." },
  { who: "fisher", text: "O Cardo está mais raso este ano. Ou é a água que esqueceu até onde ia." },
  // the camp and the well
  { who: "washer", if: (F) => F.iara === "forgot", text: "A Iara lavou a camisa do menino três vezes hoje. Disse que era de um vizinho. Ninguém teve coragem de dizer nada." },
  { who: "washer", if: (F) => F.iara && F.iara !== "forgot", text: "O Coletor saiu do acampamento sem cobrar ninguém. Isso nunca aconteceu. Quem foi que falou com ele?" },
  { who: "washer", text: "Água do poço, sim. Água do rio, não. O rio vem do norte, e o norte é branco." },
  { who: "girl", if: (F) => F.lume_done === "people", text: "A vó da fila da sopa está cantando! Ela não cantava desde a nossa casa. Eu nem sabia que vó canta." },
  { who: "girl", text: "Eu conto os barcos. Ontem foram cinco. Hoje eu esqueci quantos foram ontem." },
  { who: "Vendedora", if: (F) => F.ch1_done, text: "Você de novo. Ouvi dizer que soltou uma mensageira no vau. Freguês assim eu atendo primeiro." },
  { who: "Velho do norte", if: (F) => F.rested1, text: "Dormiu bem? Eu sonhei com Pedra-Alta. Acordei e a cidade ainda estava lá, no sonho. É o único lugar onde ela ainda está." },
];
// two guards at the gate, at night, talking to each other
const GATE_TALK = [["g1", "Viu o cartaz novo? Portador de marca prateada."], ["g2", "Vi. Já viu alguma marca prateada na vida?"], ["g1", "Só a sua careca, de manhã, no sol."], ["g2", "(O outro não ri.)"]];

const rest = new Map(); // who -> seconds until they talk again
const said = new Set(); // lines already heard this session: someone says a new thing before repeating one
let walkT = 0, sayT = 0, gateDone = false, talking = false;
const calm = () => G.mode === "explore" && !G.paused && !inScene();
const byWho = (w) => G.npcs.find((u) => !u.gone && (u.key === w || u.name === w));

/** Every frame: residents walk their rounds; people near the party talk. */
export function tickTown(dt) {
  if (!G.W || !G.party.length || G.W.id !== "vau") return;
  // rounds: a resident with nowhere to go waits a moment, then walks to the next stop
  if ((walkT -= dt) <= 0) {
    walkT = 0.5;
    for (const u of G.npcs) {
      if (!u.route || u.gone || u.path.length) continue;
      if ((u.wait -= 0.5) > 0) continue;
      u.ri = (u.ri + 1) % u.route.length;
      const [tx, ty] = u.route[u.ri], sx = Math.floor(u.x / TILE), sy = Math.floor((u.y - 1) / TILE);
      const p = findPath((x, y) => G.W.blocked(x, y), sx, sy, tx, ty);
      if (p?.length) { u.path = p.map(([x, y]) => E.tileCenter(x, y)); u.speed = 34; }
      u.wait = 3 + ((u.ri * 7) % 5);
    }
  }
  for (const [k, v] of rest) rest.set(k, v - dt);
  if (!calm() || talking || bubbleCount() || banterTalking() || (sayT -= dt) > 0) return;
  sayT = 1;
  const l = lead(), F = G.f;
  // the gate guards, once, at night
  if (!gateDone && (G.clock < 6 || G.clock > 19) && dist(l.x, l.y, 40 * TILE, 12.5 * TILE) < 5 * TILE && byWho("g1") && byWho("g2")) {
    gateDone = true; talking = true;
    (async () => { for (const [w, t] of GATE_TALK) { const u = byWho(w); if (!u || !calm()) break; await bubble(u, t); } talking = false; })();
    return;
  }
  const fits = SAYS.filter((s) => (!s.if || s.if(F)) && (rest.get(s.who) ?? 0) <= 0).filter((s) => { const u = byWho(s.who); return u && dist(u.x, u.y, l.x, l.y) < 4 * TILE; });
  const s = fits.find((x) => !said.has(x.text)) ?? fits[0];
  if (!s) return;
  said.add(s.text);
  rest.set(s.who, 45);
  sayT = 7; // a pause between voices
  bubble(byWho(s.who), s.text);
}
