// The screen before the main menu: a night over the valley painted by pixelfx (an aurora, shooting stars, fireflies
// over the grass, the Bruma drifting low) and "click to start". It is there for a reason: browsers allow no sound
// until the player clicks or presses a key, so the menu's music and its opening start together, on that click.
// It shows while the valley is being painted, and asks for the click once the game is ready.
import { createFrame, clearFrame, createFx, composite, backdrop } from "../vendor/pixelfx/src/core/index.js";
import * as aurora from "../vendor/pixelfx/src/fx/weather/aurora.js";
import * as shootingStars from "../vendor/pixelfx/src/fx/weather/shooting-stars.js";
import * as fireflies from "../vendor/pixelfx/src/fx/weather/fireflies.js";
import * as fog from "../vendor/pixelfx/src/fx/weather/fog.js";
import { focusDefault } from "./input.js";

const W = 320, H = 180;
const $ = (s, el = document) => el.querySelector(s);

let root = null, raf = 0, ready = false, onStart = null;

/** Show the screen at once (before the game is built). `start` runs on the click, once the game is ready. */
export function showPress(start) {
  onStart = start;
  root = $("#press");
  const touch = matchMedia("(pointer: coarse)").matches;
  root.innerHTML = `
    <canvas width="${W}" height="${H}"></canvas>
    <div class="vignette"></div>
    <div class="prompt">
      <div class="wait">Pintando o vale pixel a pixel...</div>
      <button class="go-start" data-default>${touch ? "Toque para iniciar" : "Clique para iniciar"}</button>
      <div class="sub">${touch ? "" : "ou aperte qualquer tecla"}</div>
    </div>`;
  root.classList.remove("hidden");
  const cv = $("canvas", root), cx = cv.getContext("2d");
  const frame = createFrame(W, H), img = cx.createImageData(W, H), bg = backdrop("sky", W, H);
  // each loop is placed by its own origin, so they all fill the same 320 × 180 canvas
  const at = (mod, o = {}) => createFx(mod, { x: mod.meta.origin[0], y: mod.meta.origin[1], ...o });
  // back to front: the sky, the Bruma low over the land, and the meadow with its fireflies in front of it
  const layers = [
    at(aurora, { light: 0.8 }),
    at(shootingStars),
    at(fog, { light: 0.5 }),
    at(fireflies),
  ];
  let last = performance.now();
  const tick = (now) => {
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - last) / 1000);
    if (now - last < 30) return; // 30 frames a second: the loops are drawn at that rate
    last = now;
    clearFrame(frame);
    for (const fx of layers) { fx.update(dt); fx.draw(frame); }
    composite(frame, img.data, bg);
    cx.putImageData(img, 0, 0);
  };
  raf = requestAnimationFrame(tick);
  // the click, a tap, a key, or the pad's A (which clicks the focused button)
  root.addEventListener("pointerdown", go);
  $(".go-start", root).onclick = go;
  addEventListener("keydown", key, true);
}

function key(e) {
  if (!ready || ["Shift", "Control", "Alt", "Meta", "Tab", "F5", "F12"].includes(e.key)) return;
  e.preventDefault(); e.stopPropagation();
  go();
}

/** main.js: the game is built; the click can start it now. */
export function pressReady() {
  if (!root) return;
  ready = true;
  root.classList.add("ready");
  focusDefault(root, true);
}

function go() {
  if (!ready || !onStart) return;
  const f = onStart;
  onStart = null;
  removeEventListener("keydown", key, true);
  root.classList.add("out"); // fades out over the menu's opening
  setTimeout(() => { cancelAnimationFrame(raf); root.classList.add("hidden"); root.innerHTML = ""; }, 1200);
  f();
}
