// The main menu: the valley alive behind it (the camera drifts over the Lago Espelhado at golden hour, see main.js),
// the logo, and the menu. The first time the game is opened it plays an opening: a leaf falls through the dark,
// turning over to show the silver underside the valley is named for, lands where the name will be, and the name
// comes out of the mist letter by letter. After that first time, a short version. Any key or click skips it.
const $ = (s, el = document) => el.querySelector(s);
const SEEN = "brumafolha.opening";
const NAME = "Brumafolha";

let root, loaded = false, finished = false, revealed = false, leaf = null, openEnd = 0, timers = [];
const at = (sec, fn) => timers.push(setTimeout(fn, sec * 1000));

/**
 * Set up the title screen and start its opening. `on`: { start, options } handlers for the menu.
 * The opening is CSS animations with delays (see style.css), not a chain of timers: it plays while the valley is
 * being painted, which keeps the main thread busy for a second or more, and timers would all fire late at once.
 * Only the last step, the world showing behind the name, waits for both the opening and the loading.
 */
export function initTitle(on) {
  root = $("#title");
  const logo = $(".logo", root);
  logo.innerHTML = [...NAME].map((c, i) => `<span style="--i:${i}">${c}</span>`).join("");
  $("#start").onclick = on.start;
  $("#options").onclick = on.options;
  $("#credits").onclick = () => showCredits(true);
  $(".credits .back", root).onclick = () => showCredits(false);
  let first = true;
  try { first = !localStorage.getItem(SEEN); } catch { /* private mode: always the full opening */ }
  root.classList.add(first ? "first" : "short");
  // anything skips the opening (but only the opening: once the menu is up, keys and clicks are the menu's)
  const skip = (e) => { if (finished) return; e.preventDefault?.(); e.stopPropagation?.(); finish(); };
  root.addEventListener("pointerdown", skip, true);
  addEventListener("keydown", skip, true);
  root._unskip = () => { root.removeEventListener("pointerdown", skip, true); removeEventListener("keydown", skip, true); };
  if (first) leaf = makeLeaf();
  const len = first ? 4.8 : 0.9;
  openEnd = performance.now() + len * 1000;
  at(len, maybeReveal);
}

/** main.js: the world is built and drawn. The valley shows once the opening gets there. */
export function titleLoaded() {
  loaded = true;
  $(".loading", root).classList.add("hidden");
  const left = openEnd - performance.now();
  if (left > 0) at(left / 1000, maybeReveal); else maybeReveal();
}

/** The title is gone for good (a new game started, or a development shortcut). */
export function closeTitle() {
  finish();
  root.classList.add("hidden");
}

function maybeReveal() {
  if (revealed || !loaded || performance.now() < openEnd - 30) return;
  revealed = true;
  root.classList.add("s3");
  at(0.5, () => {
    root.classList.add("s4");
    finished = true;
    root._unskip?.();
    try { localStorage.setItem(SEEN, "1"); } catch { /* fine */ }
    // the focus waits for the menu to be there, so Enter doesn't start a game from under the opening
    setTimeout(() => $("#start").focus({ preventScroll: true }), 450);
  });
}
function finish() {
  if (root.classList.contains("skip")) return;
  leaf?.el.classList.add("gone");
  root.classList.add("skip"); // every animation jumps to its end
  openEnd = 0;
  maybeReveal(); // or, if the world isn't painted yet, as soon as it is
}

function showCredits(on) {
  $(".menu", root).classList.toggle("hidden", on);
  $(".credits", root).classList.toggle("hidden", !on);
  setTimeout(() => $(on ? ".credits .back" : "#credits", root).focus(), 0);
}
/** Esc / B on the title closes the credits. */
export function titleCancel() {
  if (!$(".credits", root).classList.contains("hidden")) showCredits(false);
}

// ---------------------------------------------------------------- the falling leaf
// Two 16×16 frames drawn pixel by pixel: the green top and the silver underside. It shows its edge between them.
const OUT = "#18121e";
const GREEN = ["#1f4a2c", "#2f6b34", "#4f8f3c", "#86b84a"];
const SILVER = ["#5a6a84", "#8ea2bc", "#c4d4e6", "#f2f6fb"];
const LEAF = [ // 0 empty, 1 outline, 2–5 shade (dark → light), 6 vein
  "..............11",
  "...........11131",
  ".........1155531",
  "........15554531",
  ".......155545531",
  "......1554565431",
  ".....15545664431",
  "....155456444431",
  "...15556444431..",
  "...1546444431...",
  "..1546444331....",
  "..1564443331....",
  ".1564433331.....",
  ".16433331.......",
  "16111111........",
  "1...............",
];
function leafFrame(ramp) {
  const c = document.createElement("canvas");
  c.width = c.height = 16;
  const x = c.getContext("2d");
  LEAF.forEach((row, j) => [...row].forEach((ch, i) => {
    if (ch === ".") return;
    x.fillStyle = ch === "1" ? OUT : ch === "6" ? ramp[0] : ramp[+ch - 2];
    x.fillRect(i, j, 1, 1);
  }));
  return c;
}
/**
 * The leaf is animated by CSS, not by JavaScript: the opening plays while the valley is being painted, which keeps the
 * main thread busy, and transforms run on the compositor regardless. Three nested boxes: the fall, the sway, and a
 * turn about the vertical axis that shows the green top and the silver back (backface-visibility does the swap).
 */
function makeLeaf() {
  const el = $(".leaf", root);
  el.innerHTML = `<div class="sway"><div class="spin"></div></div>`;
  const spin = $(".spin", el);
  for (const [ramp, cls] of [[GREEN, "front"], [SILVER, "back"]]) { const c = leafFrame(ramp); c.className = cls; spin.appendChild(c); }
  // it lands on the name: the middle of the logo, measured from the middle of the screen
  const r = $(".logo", root).getBoundingClientRect();
  el.style.setProperty("--endY", `${Math.round(r.top + r.height / 2 - innerHeight / 2)}px`);
  el.classList.add("falling");
  return { el };
}
