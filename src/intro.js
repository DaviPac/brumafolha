// The prelude: before the hero exists, Lyra tells the valley's story over a slow tour of the real map.
// The epigraph in the dark, the Ruins of Velmoor at night, the Bruma coming down from the north, the Lago Espelhado
// at dawn, and Lyra herself at the end of the pier. It ends asking who you are, and the creator answers that.
// Click / Enter / A moves the narration on; Esc / B skips the whole thing.
import { G } from "./state.js";
import { TILE, clamp, vnoise } from "./util.js";
import { sfx, playMusic, updateAmbience } from "./audio.js";
import { key, focusDefault } from "./input.js";
import * as UI from "./ui.js";

let E = null;
const SKIP = Symbol("skip");
const st = { on: false, skipped: false, timers: [], pan: null, caption: null, amb: { wind: 0.5, water: 0, fire: 0, birds: 0, ruins: 0 }, clockTo: null };
const $ = (s) => document.querySelector(s);
const tc = (tx, ty) => [tx * TILE + 16, ty * TILE + 16];

export const introOn = () => st.on;

/** Play the prelude; resolves when it ends or is skipped. `engine` is main.js's E. */
export async function playIntro(engine) {
  E = engine;
  const root = $("#intro");
  Object.assign(st, { on: true, skipped: false, timers: [], pan: null, caption: null, clockTo: null });
  const keep = { enemies: G.enemies, npcs: G.npcs, clock: G.clock };
  G.mode = "intro";
  G.enemies = []; G.npcs = []; // the valley empty of its people: only the place, and her
  root.innerHTML = `
    <div class="lb top"></div><div class="lb bot"></div>
    <div class="card"></div>
    <div class="cap"><div class="portrait"><canvas></canvas></div><div class="body"><div class="name"></div><div class="text"></div></div></div>
    <div class="ctl"><button class="next quiet" data-default>Avançar ${key("Enter", "A")}</button><button class="skip quiet">Pular ${key("Esc", "B")}</button></div>`;
  root.classList.remove("hidden");
  root.onclick = (e) => { if (!e.target.closest(".skip")) advance(); };
  root.querySelector(".skip").onclick = (e) => { e.stopPropagation(); skipIntro(); };
  root.querySelector(".next").onclick = (e) => { e.stopPropagation(); advance(); };
  focusDefault(root, true);
  const lyra = G.cast.lyra;
  try {
    await script(root, lyra);
  } catch (e) {
    if (e !== SKIP) throw e;
  }
  // tidy up: the valley gets its people back, Lyra goes back to the camp, the light to the morning
  setCaption(null);
  card("");
  await UI.fade(1, st.skipped ? 300 : 900);
  root.classList.remove("on");
  root.classList.add("hidden");
  root.innerHTML = "";
  G.followers = G.followers.filter((u) => u !== lyra);
  E.place(lyra, 14, 39, 0);
  lyra.moving = false;
  G.enemies = keep.enemies; G.npcs = keep.npcs;
  G.introFog = null; G.camFocus = null; G.ambient = null;
  G.clock = keep.clock; G.clockTarget = null;
  st.on = false;
  await UI.fade(0, 500);
}

export function skipIntro() {
  if (!st.on || st.skipped) return;
  st.skipped = true;
  sfx.click?.();
  for (const t of st.timers) t.res();
  st.timers = [];
  st.caption?.res();
}

/** Click, Enter, A: finish the line being typed, or go to the next one. */
export function advance() {
  const c = st.caption;
  if (!c) return;
  if (c.shown < c.text.length) { c.shown = c.text.length; draw(c); return; }
  c.res();
}

// ---------------------------------------------------------------- the script
async function script(root, lyra) {
  const go = async (p) => { await p; if (st.skipped) throw SKIP; };
  const wait = (sec) => go(new Promise((res) => st.timers.push({ t: sec, res })));
  const say = (text, who) => go(caption(text, who));
  const LYRA = { name: "Lyra", portrait: lyra.portrait };
  const VOICE = { name: "Uma voz", portrait: null };

  // the epigraph, in the dark
  UI.fade(1, 0);
  playMusic("dream", 3);
  sfx.bells?.();
  st.amb = { wind: 0.35, water: 0, fire: 0, birds: 0, ruins: 0.6 };
  card(`<p class="epi">"Tudo o que existe é lembrado por alguém.<br>O que ninguém lembra, a Bruma leva."</p><p class="src">— inscrição nas Ruínas de Velmoor</p>`);
  await wait(1.2);
  root.classList.add("on");
  await wait(4.6);
  card("");
  await wait(1.2);

  // 1. the Ruins of Velmoor, at night
  G.clock = 1.5;
  G.ambient = null;
  cut(20, 15);
  pan([20, 15], [21, 7.5], 22);
  st.amb = { wind: 1, water: 0, fire: 0, birds: 0, ruins: 1 };
  G.introFog = fogFront(-2 * TILE);
  UI.fade(0, 2600);
  await wait(1.6);
  await say("Toda história de fogueira começa do mesmo jeito: com alguém dormindo.", VOICE);
  await say("Dizem que o mundo é o sonho de Ondrael, o Sonhador. Que uma montanha só fica de pé enquanto alguém se lembra dela.", VOICE);
  await say("Aqui era Velmoor. Torres brancas, gente que guardava lembranças dentro de cristais de luz. Hoje é pedra, e ninguém sabe o que ela foi.", VOICE);
  await say("Ninguém. Quase ninguém.", VOICE);

  // 2. the Bruma comes down from the north
  pan([21, 7.5], [19, 20], 16);
  const front = { y: -2 * TILE };
  G.introFog = fogFront(front);
  tweenFront(front, 15 * TILE, 15);
  playMusic("ruins", 4);
  await say("Há doze anos, uma névoa branca começou a descer do norte. É bonita. Cheira a chuva e a folhas.", VOICE);
  await say("Por onde a Bruma passa, as coisas deixam de ter existido. Quem fica nela esquece um nome, depois um rosto, depois a si mesmo.", VOICE);
  await say("Os sábios dizem que é o Sonhador se mexendo na cama. Nenhum sábio quis chegar perto para conferir.", VOICE);
  await go(UI.fade(1, 1400));
  setCaption(null);

  // 3. the Lago Espelhado at dawn, and someone at the end of the pier
  G.introFog = null;
  G.clock = 5.2; st.clockTo = 6.6;
  playMusic("meadow", 3);
  st.amb = { wind: 0.5, water: 1, fire: 0, birds: 0.6, ruins: 0 };
  E.place(lyra, 38, 26, 2);
  if (!G.followers.includes(lyra)) G.followers.push(lyra);
  cut(31, 25);
  pan([31, 25], [43, 26.5], 20);
  UI.fade(0, 2200);
  await wait(1.4);
  E.walk(lyra, 45, 27, 30).then(() => { if (st.on) lyra.dir = 2; }); // to the end of the pier, to look at the water
  await say("Brumafolha é o último vale antes do branco. Folhas de prata por baixo, um lago que é espelho. Bonito demais para durar.", VOICE);
  await say("Ah. Esqueci de me apresentar. Logo eu.", LYRA);
  await say("Lyra, de Lethiel. Trezentos e doze anos, e uma memória boa demais. É o meu defeito.", LYRA);
  await say("Meu povo esquece de propósito, a cada cem anos. Eu, por teimosia, ainda lembro. Inclusive do que preferia não lembrar.", LYRA);
  await say("Esta é a história de alguém que veio ao vale buscar o que dorme sob Velmoor. Por trezentas peças de ouro e uma carta assinada só com um \"L.\"", LYRA);
  await say("E de um sonho: uma cidade branca, uma mulher de cabelos de prata, e um pedido. \"Lembre-se de mim.\"", LYRA);
  lyra.dir = 0;
  st.pan = null;
  G.camFocus = { x: lyra.x, y: lyra.y - 10, speed: 1.2 };
  await wait(0.6);
  await say("Mas uma história precisa de alguém para ser lembrado. Então me diga...", LYRA);
  setCaption(null);
  await go(UI.fade(1, 1200));
  card(`<h1>Quem é você?</h1>`);
  sfx.bells?.();
  await wait(2.6);
}

// ---------------------------------------------------------------- the camera, the fog, the clock
/** Jump the camera to a tile. */
function cut(tx, ty) {
  const [x, y] = tc(tx, ty);
  G.camFocus = { x, y, speed: 1000 };
  st.pan = null;
}
/** Glide the camera between two tiles over `sec`, eased at both ends. */
function pan(a, b, sec) {
  const [x0, y0] = tc(...a), [x1, y1] = tc(...b);
  st.pan = { x0, y0, x1, y1, sec, t: 0 };
}
/** A wall of Bruma whose southern edge is at front.y (a number, or an object whose y moves). */
function fogFront(front) {
  return (x, y) => {
    const fy = typeof front === "number" ? front : front.y;
    const edge = fy + (vnoise(x / 90, 3.3, 7) - 0.5) * 3 * TILE;
    return clamp((edge - y) / (4 * TILE)) * 0.92;
  };
}
function tweenFront(front, to, sec) {
  const from = front.y;
  const step = { t: 0, sec, fn: (k) => { front.y = from + (to - from) * k; } };
  st.tweens = [...(st.tweens ?? []), step];
}

/** Called by main.js every frame while the prelude runs. */
export function updateIntro(dt) {
  for (const t of [...st.timers]) if ((t.t -= dt) <= 0) { st.timers.splice(st.timers.indexOf(t), 1); t.res(); }
  if (st.tweens) for (const w of [...st.tweens]) { w.t += dt; w.fn(clamp(w.t / w.sec)); if (w.t >= w.sec) st.tweens.splice(st.tweens.indexOf(w), 1); }
  const p = st.pan;
  if (p) {
    p.t += dt;
    const k = clamp(p.t / p.sec), e = k * k * (3 - 2 * k);
    G.camFocus = { x: p.x0 + (p.x1 - p.x0) * e, y: p.y0 + (p.y1 - p.y0) * e, speed: 8 };
    if (k >= 1) st.pan = null;
  } else if (G.camFocus?.speed > 100) G.camFocus.speed = 8; // a cut lasts one frame
  if (st.clockTo != null) { G.clock = Math.min(st.clockTo, G.clock + dt * 0.06); if (G.clock >= st.clockTo) st.clockTo = null; }
  updateAmbience(st.amb, dt, G.time);
  const c = st.caption;
  if (c) {
    if (c.shown < c.text.length) { c.acc += dt * 42; const n = Math.min(c.text.length, Math.floor(c.acc)); if (n !== c.shown) { c.shown = n; draw(c); } }
    else if ((c.hold -= dt) <= 0) c.res();
  }
}

// ---------------------------------------------------------------- captions and title cards
function card(html) {
  const el = $("#intro .card");
  if (!el) return;
  if (html) el.innerHTML = html;
  el.classList.toggle("show", !!html);
}
/** One line of narration: typed out, held long enough to read, then it moves on by itself. */
function caption(text, who) {
  return new Promise((res) => {
    const c = { text, who, shown: 0, acc: 0, hold: 2.2 + text.length * 0.045, res: () => { if (st.caption === c) st.caption = null; res(); } };
    st.caption = c;
    setCaption(c);
  });
}
function setCaption(c) {
  const el = $("#intro .cap");
  if (!el) return;
  if (!c) { el.classList.remove("show"); return; }
  el.classList.add("show");
  el.classList.toggle("voice", !c.who?.portrait);
  el.querySelector(".name").textContent = c.who?.name ?? "";
  if (c.who?.portrait) {
    const pc = el.querySelector(".portrait canvas"), src = c.who.portrait;
    pc.width = src.width; pc.height = src.height;
    const x = pc.getContext("2d");
    x.imageSmoothingEnabled = false;
    x.clearRect(0, 0, pc.width, pc.height);
    x.drawImage(src, 0, 0);
  }
  draw(c);
}
function draw(c) {
  const el = $("#intro .cap .text");
  if (!el) return;
  // the untyped rest is there but invisible, so the line doesn't reflow while it types
  el.innerHTML = `${esc(c.text.slice(0, c.shown))}<span class="rest">${esc(c.text.slice(c.shown))}</span>`;
}
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
