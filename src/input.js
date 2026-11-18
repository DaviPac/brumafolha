// One way in for keyboard and gamepad. Menus (anything in LAYERS that is open) are walked with the arrows or the
// D-pad/stick: focus jumps to the nearest control in that direction, confirm clicks it, cancel closes. When no
// menu is open the same buttons go to the game (main.js) as actions. The mouse keeps working on its own.
// Whoever was used last decides which key caps the interface shows (body.dev-kbm / body.dev-pad).

export const Input = {
  device: "kbm",
  /** Left stick / D-pad as a direction for walking, each axis −1..1. */
  axis: { x: 0, y: 0 },
  /** Right stick, for scrolling long pages. */
  scroll: 0,
  /** Right stick as a direction, each axis −1..1 (pans the camera in combat). */
  look: { x: 0, y: 0 },
  onAction: null, // (name) => void, when no menu took it
  onCancel: null, // (layerId) => void
  onDevice: null, // (device) => void, when the player switches between keyboard/mouse, pad and touch
};

// top-most first
const LAYERS = ["#news", "#dice", "#saves", "#gameover", "#pick", "#tutask", "#pause", "#levelup", "#journal", "#creator", "#endscreen", "#dialogue", "#intro", "#press", "#title"];
const FOCUSABLE = "button:not(:disabled), input, [tabindex]";

export function activeLayer() {
  for (const s of LAYERS) { const el = document.querySelector(s); if (el && !el.classList.contains("hidden")) return el; }
  return null;
}
const visible = (el) => el.offsetParent !== null && !el.classList.contains("used");
const focusables = (layer) => [...layer.querySelectorAll(FOCUSABLE)].filter(visible);

function setDevice(d) {
  if (Input.device === d) return;
  Input.device = d;
  document.body.classList.toggle("dev-pad", d === "pad");
  document.body.classList.toggle("dev-kbm", d === "kbm");
  document.body.classList.toggle("dev-touch", d === "touch");
  Input.onDevice?.(d);
}
/** A phone or tablet: no key caps, taps instead of clicks, bigger targets. */
export const isTouch = () => Input.device === "touch";
// a touch screen starts in touch mode; the first touch switches to it, a real mouse or key switches back.
// A tap also sends made-up mouse events right after it: those don't count as the mouse.
let lastTouch = -1e9;
addEventListener("touchstart", () => { lastTouch = performance.now(); setDevice("touch"); }, { capture: true, passive: true });
const fakeMouse = () => performance.now() - lastTouch < 1200;
const hasMouse = () => matchMedia("(any-pointer: fine)").matches;
if (matchMedia("(pointer: coarse)").matches && !hasMouse()) queueMicrotask(() => setDevice("touch"));
function navMode(on) { document.body.classList.toggle("nav-keys", on); }

/** Put the focus on a layer's default control (or its first), if the focus isn't already inside it. */
export function focusDefault(layer = activeLayer(), force = false) {
  if (!layer) return;
  if (!force && layer.contains(document.activeElement) && visible(document.activeElement)) return;
  const el = layer.querySelector("[data-default]:not(.hidden)") ?? focusables(layer)[0];
  if (el && visible(el)) el.focus({ preventScroll: false });
}

function move(layer, dx, dy) {
  const list = focusables(layer), cur = document.activeElement;
  if (!list.length) return;
  if (!layer.contains(cur) || !visible(cur)) { focusDefault(layer, true); return; }
  // a slider under the focus takes left/right for itself
  if (cur.type === "range" && dx) {
    const step = +(cur.step || 1), v = Math.min(+cur.max, Math.max(+cur.min, +cur.value + dx * step));
    if (v !== +cur.value) { cur.value = v; cur.dispatchEvent(new Event("input", { bubbles: true })); cur.dispatchEvent(new Event("change", { bubbles: true })); }
    return;
  }
  const a = cur.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2;
  let best = null, bs = 1e9;
  for (const el of list) {
    if (el === cur) continue;
    const b = el.getBoundingClientRect();
    // from the edge of the current control to the nearest point of the candidate
    const px = Math.max(b.left, Math.min(ax, b.right)), py = Math.max(b.top, Math.min(ay, b.bottom));
    const along = dx ? (px - ax) * dx : (py - ay) * dy, across = dx ? Math.abs(py - ay) : Math.abs(px - ax);
    const lead = dx ? (b.left + b.width / 2 - ax) * dx : (b.top + b.height / 2 - ay) * dy;
    if (lead <= 1) continue;
    const s = Math.max(0, along) + across * 2.5;
    if (s < bs) { bs = s; best = el; }
  }
  if (best) { best.focus(); best.scrollIntoView({ block: "nearest", inline: "nearest" }); }
}

/** LB / RB (or Q / E): the previous or next tab of the open menu, if it has tabs. */
function tab(layer, dir) {
  const tabs = [...layer.querySelectorAll("[data-t], [data-tab]")].filter(visible);
  if (!tabs.length) return false;
  const i = Math.max(0, tabs.findIndex((t) => t.classList.contains("on")));
  tabs[(i + dir + tabs.length) % tabs.length].click();
  setTimeout(() => focusDefault(activeLayer(), true), 0);
  return true;
}

/** An action from the keyboard or the pad. Returns true if a menu used it. */
function act(name) {
  const layer = activeLayer();
  if (layer) {
    navMode(true);
    const cur = document.activeElement, inside = layer.contains(cur) && visible(cur);
    switch (name) {
      case "up": move(layer, 0, -1); break;
      case "down": move(layer, 0, 1); break;
      case "left": move(layer, -1, 0); break;
      case "right": move(layer, 1, 0); break;
      case "confirm":
        if (layer.id === "dice") layer.click();
        else if (inside) cur.click();
        else focusDefault(layer, true);
        break;
      case "cancel": Input.onCancel?.(layer.id); break;
      case "lb": tab(layer, -1); break;
      case "rb": tab(layer, 1); break;
      case "start": if (layer.id === "pause") Input.onCancel?.("pause"); break;
      default: return false;
    }
    return true;
  }
  Input.onAction?.(name);
  return false;
}

// ---------------------------------------------------------------- keyboard
const KEYMAP = { arrowup: "up", arrowdown: "down", arrowleft: "left", arrowright: "right", enter: "confirm" };
addEventListener("keydown", (e) => {
  setDevice("kbm");
  const k = e.key.toLowerCase(), layer = activeLayer(), typing = e.target?.tagName === "INPUT" && e.target.type !== "range" && e.target.type !== "checkbox";
  if (!layer) { if (k === "enter") Input.onAction?.("confirm"); return; }
  if (typing && (k === "arrowleft" || k === "arrowright")) return;
  let name = KEYMAP[k];
  if (!typing && (k === "w" || k === "s")) name = k === "w" ? "up" : "down";
  if (!typing && layer.id !== "dialogue" && (k === "a" || k === "d")) name = k === "a" ? "left" : "right";
  if (!typing && (k === "q" || k === "e") && layer.id !== "dialogue") name = k === "q" ? "lb" : "rb";
  if (k === " " && !typing && (layer.id === "dice" || document.activeElement?.tagName !== "BUTTON")) name = "confirm";
  if (!name) return;
  // Enter on a real button already clicks it
  if (name === "confirm" && k === "enter" && layer.contains(document.activeElement) && ["BUTTON"].includes(document.activeElement.tagName)) { navMode(true); return; }
  e.preventDefault();
  act(name);
}, true);
addEventListener("mousemove", (e) => {
  // browsers also send mouse moves when the page changes under a still pointer, or right after a tap: only a real
  // mouse moving counts, and only on a device that has one
  if (fakeMouse() || !hasMouse() || e.sourceCapabilities?.firesTouchEvents || (!e.movementX && !e.movementY)) return;
  if (document.body.classList.contains("nav-keys")) navMode(false);
  setDevice("kbm");
});

// ---------------------------------------------------------------- gamepad
const BTN = { 0: "confirm", 1: "cancel", 2: "x", 3: "y", 4: "lb", 5: "rb", 8: "select", 9: "start", 12: "up", 13: "down", 14: "left", 15: "right" };
const held = {}, repeatAt = {};
function fire(name, down, now, repeats) {
  if (!down) { held[name] = false; return; }
  if (!held[name]) { held[name] = true; repeatAt[name] = now + 380; setDevice("pad"); act(name); }
  else if (repeats && now >= repeatAt[name]) { repeatAt[name] = now + 110; act(name); }
}

/** Call every frame. */
export function pollInput(now = performance.now()) {
  const pad = [...(navigator.getGamepads?.() ?? [])].find((p) => p && p.connected);
  if (!pad) { Input.axis.x = Input.axis.y = 0; Input.scroll = 0; Input.look.x = Input.look.y = 0; return; }
  const dz = (v) => (Math.abs(v) < 0.25 ? 0 : v);
  const sx = dz(pad.axes[0] ?? 0), sy = dz(pad.axes[1] ?? 0);
  const b = (i) => !!pad.buttons[i]?.pressed;
  for (const [i, name] of Object.entries(BTN)) {
    const dir = +i >= 12;
    const stick = name === "up" ? sy < -0.55 : name === "down" ? sy > 0.55 : name === "left" ? sx < -0.55 : name === "right" ? sx > 0.55 : false;
    fire(name, b(+i) || stick, now, dir);
  }
  Input.axis.x = sx || (b(15) ? 1 : 0) - (b(14) ? 1 : 0);
  Input.axis.y = sy || (b(13) ? 1 : 0) - (b(12) ? 1 : 0);
  Input.scroll = dz(pad.axes[3] ?? 0);
  Input.look.x = dz(pad.axes[2] ?? 0); Input.look.y = Input.scroll;
  if (Input.scroll) {
    const layer = activeLayer(), sc = layer && [...layer.querySelectorAll(".page, .pane, .box, .sheet")].find((el) => el.scrollHeight > el.clientHeight + 2);
    if (sc) sc.scrollTop += Input.scroll * 14;
  }
  if (sx || sy) setDevice("pad");
}

/** Key caps that follow the device in use: key("E", "A") shows E on a keyboard and the A button on a pad. */
export function key(kbm, pad) {
  const cls = { A: "pa", B: "pb", X: "px", Y: "py" }[pad] ?? "";
  return `${kbm ? `<kbd class="kbm">${kbm}</kbd>` : ""}${pad ? `<kbd class="pad ${cls}">${pad}</kbd>` : ""}`;
}
