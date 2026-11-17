// The main menu: the valley alive behind it (the camera drifts over the Lago Espelhado at golden hour, see main.js),
// the logo, and the menu. The first time the game is opened it plays an opening: a leaf falls through the dark,
// turning over to show the silver underside the valley is named for, lands where the name will be, and the name
// comes out of the mist letter by letter. After that first time, a short version. Any key or click skips it.
import { sfx } from "./audio.js";
import { GREEN, SILVER, paintLeaf } from "./art/appicon.js";

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
  const pick = (fn) => () => { sfx.menuConfirm?.(); fn?.(); };
  $("#start").onclick = pick(on.start);
  $("#options").onclick = pick(on.options);
  $("#continue").onclick = pick(on.cont);
  $("#load").onclick = pick(on.load);
  $("#credits").onclick = pick(() => showPanel(".credits", "#credits"));
  for (const b of root.querySelectorAll(".credits .back, .installios .back")) b.onclick = () => { sfx.menuBack?.(); showPanel(null); };
  $("#install").onclick = pick(install);
  syncInstall();
  // a harp note when the cursor or the keys reach a button (once per button, not on both hover and focus)
  let last = null;
  [...root.querySelectorAll(".menu button, .credits .back, .installios .back")].forEach((b, i) => {
    const hover = () => { if (last === b || b.disabled || !finished) return; last = b; sfx.menuHover?.(i); };
    b.addEventListener("mouseenter", hover);
    b.addEventListener("focus", hover);
    b.addEventListener("mouseleave", () => { if (last === b) last = null; });
  });
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

/** main.js: are there saves? Continuar and Carregar come on. */
export function titleSaves(any) {
  for (const id of ["continue", "load"]) { const b = $("#" + id); b.disabled = !any; b.title = any ? "" : "Nenhum save ainda"; }
}

/** main.js: the world is built and drawn. The valley shows once the opening gets there. */
export function titleLoaded() {
  loaded = true;
  $(".loading", root)?.classList.add("hidden");
  const left = openEnd - performance.now();
  if (left > 0) at(left / 1000, maybeReveal); else maybeReveal();
}

/** The title is gone for good (a new game started, or a development shortcut). */
export function closeTitle() {
  root ??= $("#title"); // a load skips the title altogether: it was never set up
  if (root.classList.contains("first") || root.classList.contains("short")) finish();
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

/** A panel in place of the menu (the credits, how to install on an iPhone), or the menu again with null. */
let panelFrom = null;
function showPanel(sel, from) {
  $(".menu", root).classList.toggle("hidden", !!sel);
  for (const p of [".credits", ".installios"]) $(p, root).classList.toggle("hidden", p !== sel);
  if (sel) panelFrom = from;
  setTimeout(() => $(sel ? `${sel} .back` : panelFrom ?? "#start", root)?.focus(), 0);
}
/** Esc / B on the title closes the credits. */
export function titleCancel() {
  if ($(".menu", root).classList.contains("hidden")) { sfx.menuBack?.(); showPanel(null); }
}

// ---------------------------------------------------------------- installing the game (it is a PWA: see sw.js)
// Chrome and Edge offer an install prompt the menu can open; Safari on iPhone/iPad has none, so the button explains
// the Share → Add to Home Screen steps there. Once installed (running as the app), the button goes away.
let installEvt = null;
const installed = () => matchMedia("(display-mode: fullscreen), (display-mode: standalone)").matches || navigator.standalone === true;
const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installEvt = e; syncInstall(); });
addEventListener("appinstalled", () => { installEvt = null; syncInstall(); });
function syncInstall() { document.getElementById("install")?.classList.toggle("hidden", installed() || !(installEvt || ios)); }
async function install() {
  if (installEvt) {
    installEvt.prompt();
    await installEvt.userChoice.catch(() => null);
    installEvt = null;
    syncInstall();
  } else if (ios) showPanel(".installios", "#install");
}


// ---------------------------------------------------------------- the falling leaf
// Two 16×16 frames drawn pixel by pixel (src/art/appicon.js, also the app icon): the green top and the silver
// underside. It shows its edge between them.
function leafFrame(ramp) {
  const c = document.createElement("canvas");
  c.width = c.height = 16;
  paintLeaf(c.getContext("2d"), ramp);
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
