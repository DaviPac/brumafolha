// Dynamic 2D light for pixel art, in WebGL2. With the light on, the game paints its frame through this module
// instead of the 2D canvas: three layers (ground, standing sprites, overlay) that take the same handful of calls the
// game already makes (drawImage, fillRect, globalAlpha, save/restore...), drawn as batched quads from a sprite atlas
// on the GPU. This module then lights the first two layers and puts everything together. Nothing is copied from a
// 2D canvas to the GPU per frame: browsers (Firefox above all) pay a read-back for each such copy.
//
// The light never blends colours towards white or black. It moves each pixel up or down its own colour ramp:
// a 3D lookup texture, built from every ramp the art uses, says for any colour what "one step darker" and "one
// step lighter" are (as a per-channel ratio, so colours between two ramp steps follow the nearest ramp). Light
// arrives as a whole number of steps; the edge between two steps is a narrow band of the same 4×4 Bayer dither
// the art is painted with, aligned to world pixels. So the art's own dither survives, and hues stay on the ramps.
//
// Light sources add up in a low-resolution buffer. Each source that casts shadows first draws them into a mask:
// one tapered quad per prop or person, pointing away from the light. Shadows fall on the ground layer only.
// Turned off, none of this runs and the game draws straight to the screen as it always did.

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
};
export const lightSettings = { mode: "high", intensity: 1, ...store.get("brum.light", {}) };
export function setLight(patch) { Object.assign(lightSettings, patch); store.set("brum.light", lightSettings); }

const VS = `#version 300 es
in vec2 aPos; in float aK;
uniform vec2 uView;
out float vK;
void main() { vK = aK; vec2 c = aPos / uView * 2.0 - 1.0; gl_Position = vec4(c.x, -c.y, 0.0, 1.0); }`;

const FS_SHADOW = `#version 300 es
precision highp float;
in float vK; out vec4 o;
void main() { o = vec4(vK, 0.0, 0.0, 1.0); }`;

const FS_LIGHT = `#version 300 es
precision highp float;
uniform vec2 uView; uniform vec3 uLight; uniform vec3 uColor; uniform float uPow; uniform sampler2D uMask;
layout(location = 0) out vec4 oShadowed; layout(location = 1) out vec4 oOpen;
void main() {
  vec2 px = vec2(gl_FragCoord.x, uView.y - gl_FragCoord.y);
  float d = distance(px, uLight.xy) / uLight.z;
  float f = pow(max(0.0, 1.0 - d), 1.35) * uPow;
  float sh = texture(uMask, gl_FragCoord.xy / uView).r;
  oOpen = vec4(uColor * f, 1.0);
  oShadowed = vec4(uColor * f * (1.0 - sh), 1.0);
}`;

const FS_MIX = `#version 300 es
precision highp float;
precision highp sampler3D;
uniform vec2 uView; uniform vec2 uCam;
uniform sampler2D uGround, uSprites, uOver, uAdd, uLitS, uLitO;
uniform sampler3D uDark, uBright;
uniform float uAmb;      // whole steps of darkness (0, -1, -2...)
uniform vec3 uTint;      // ambient colour
uniform float uTintK;    // how much of it
uniform float uGain;     // dynamic light strength
uniform float uColorK;   // how much a light's own colour shows
out vec4 o;
const float B[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
vec3 lut(sampler3D t, vec3 c) { return c * texture(t, (floor(c * 255.0 / 4.0) + 0.5) / 64.0).rgb; }
vec3 shade(vec3 c, vec3 L, float bay) {
  float lum = max(L.r, max(L.g, L.b)) * uGain;
  // light lifts the dark back to the art's own colours, and one step past them at its heart
  float lift = lum * (1.0 - uAmb);
  float q = uAmb + floor(lift + 0.5 + (bay - 0.5) * 0.55);
  q = clamp(q, -3.0, 1.0);
  vec3 r = c;
  if (q < -0.5) r = lut(uDark, r);
  if (q < -1.5) r = lut(uDark, r);
  if (q < -2.5) r = lut(uDark, r);
  if (q > 0.5) r = lut(uBright, r);
  // the ambient colour where it is dark, the light's own colour where it is lit: both whole-band, never a gradient
  float lit = clamp(floor(lum * 3.0 + bay) / 3.0, 0.0, 1.0);
  r *= mix(vec3(1.0), uTint, uTintK * (1.0 - lit));
  vec3 hue = L / max(0.001, max(L.r, max(L.g, L.b)));
  r *= mix(vec3(1.0), hue * 1.12, uColorK * lit);
  return clamp(r, 0.0, 1.0);
}
void main() {
  vec2 uv = gl_FragCoord.xy / uView;
  vec2 px = vec2(gl_FragCoord.x, uView.y - gl_FragCoord.y);
  ivec2 w = ivec2(floor(px + uCam));
  float bay = (B[(w.y & 3) * 4 + (w.x & 3)] + 0.5) / 16.0;
  // the three painted layers hold colour already multiplied by alpha; the effects' light comes as raw rows, top first
  vec4 g = texture(uGround, uv), s = texture(uSprites, uv), ov = texture(uOver, uv), ad = texture(uAdd, vec2(uv.x, 1.0 - uv.y));
  vec3 col = shade(g.rgb, texture(uLitS, uv).rgb, bay);
  if (s.a > 0.004) col = mix(col, shade(s.rgb / s.a, texture(uLitO, uv).rgb, bay), s.a);
  col = col * (1.0 - ov.a) + ov.rgb;
  col += ad.rgb;
  o = vec4(col, 1.0);
}`;

let gl = null, glCanvas = null, ok = false, failed = false;
let progShadow, progLight, progMix, vbo, vao;
let fboLight, texLitS, texLitO, fboMask, texMask, texNone, texClear, texDark, texBright;
const layerTex = [];
let layers = null, size = [0, 0], addBox = null;
let ramps = [];

/** Give the renderer every colour ramp the art uses (arrays of [r,g,b], dark to light). Call before the first frame. */
export function setRamps(list) { ramps = list; if (ok) buildLut(); }

/** Find ramps anywhere inside an object: any array of three or more [r,g,b] triples. */
export function collectRamps(root, out = [], depth = 0, seen = new Set()) {
  if (!root || typeof root !== "object" || depth > 6 || seen.has(root)) return out;
  seen.add(root);
  if (Array.isArray(root) && root.length >= 2 && root.every((c) => Array.isArray(c) && c.length >= 3 && c.length <= 4 && typeof c[0] === "number")) { if (root.length >= 3) out.push(root); return out; }
  for (const v of Array.isArray(root) ? root : Object.values(root)) if (v && typeof v === "object" && !(v instanceof HTMLElement) && !ArrayBuffer.isView(v)) collectRamps(v, out, depth + 1, seen);
  return out;
}

function compile(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}
function program(vs, fs, attrs = ["aPos", "aK"]) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl.VERTEX_SHADER, vs)); gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
  attrs.forEach((a, i) => gl.bindAttribLocation(p, i, a));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {};
  for (let i = 0, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i < n; i++) { const name = gl.getActiveUniform(p, i).name.replace(/\[0\]$/, ""); u[name] = gl.getUniformLocation(p, name); }
  return { p, u };
}
function tex2d(w, h, internal = gl.RGBA8, format = gl.RGBA) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, gl.UNSIGNED_BYTE, null);
  for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
  return t;
}

function setup() {
  progShadow = program(VS, FS_SHADOW); progLight = program(VS, FS_LIGHT); progMix = program(VS, FS_MIX);
  setupSprites();
  vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  vbo = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 12, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 12, 8);
  texClear = tex2d(1, 1); // transparent black
  texNone = tex2d(1, 1, gl.R8, gl.RED);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 1, 1, 0, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array([0]));
  // everything sized to the view is made again by lightLayers
  layerTex.length = 0; layers = null; size = [0, 0];
  texLitS = texLitO = texMask = fboLight = fboMask = texDark = texBright = null;
  buildLut();
}
export function initLight(canvas) {
  glCanvas = canvas;
  try {
    gl = canvas.getContext("webgl2", { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, powerPreference: "high-performance" });
    if (!gl) throw new Error("no WebGL2");
    setup();
    ok = true;
    // a driver hiccup takes the context away; the plain 2D picture carries on until it comes back
    canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); ok = false; console.warn("lighting: context lost"); });
    canvas.addEventListener("webglcontextrestored", () => { try { setup(); ok = true; } catch (e) { console.warn("lighting unavailable:", e.message); failed = true; } });
  } catch (e) {
    console.warn("lighting unavailable:", e.message);
    ok = false; failed = true;
  }
  return ok;
}
export const lightAvailable = () => ok;
export const lightOn = () => ok && lightSettings.mode !== "off";

// ---------------------------------------------------------------- the ramp lookup
function buildLut() {
  const N = 64, n3 = N * N * N;
  // every distinct colour that sits on a ramp, with its darker and lighter neighbour as per-channel ratios
  const pts = new Map();
  const ratio = (to, from) => [0, 1, 2].map((k) => Math.max(0.3, Math.min(2.6, (to[k] + 3) / (from[k] + 3))));
  for (const R of ramps) {
    // some "ramps" in the art are colour lists; only keep those that really climb in brightness
    const lum = R.map((c) => c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11);
    if (!lum.every((v, i) => i === 0 || v > lum[i - 1])) continue;
    R.forEach((c, i) => {
      const key = (c[0] << 16) | (c[1] << 8) | c[2];
      if (pts.has(key)) return;
      const lo = i > 0 ? R[i - 1] : [c[0] * 0.7 + 4, c[1] * 0.68 + 2, c[2] * 0.76 + 8];
      const hi = i < R.length - 1 ? R[i + 1] : [Math.min(255, c[0] * 1.1 + 8), Math.min(255, c[1] * 1.1 + 8), Math.min(255, c[2] * 1.06 + 6)];
      pts.set(key, { c, d: ratio(lo, c), b: ratio(hi, c) });
    });
  }
  const P = [...pts.values()];
  const dark = new Float32Array(n3 * 3), bright = new Float32Array(n3 * 3);
  // coarse pass: for each 16³ block, the ramp colour nearest its centre (a neutral cool step if the art has no ramps)
  const C = 16, near = new Array(C * C * C), GEN = { d: [0.7, 0.68, 0.78], b: [1.2, 1.18, 1.1] };
  for (let b = 0; b < C; b++) for (let g = 0; g < C; g++) for (let r = 0; r < C; r++) {
    const cr = r * 16 + 8, cg = g * 16 + 8, cb = b * 16 + 8;
    let best = GEN, bd = 1e9;
    for (const p of P) { const d = (p.c[0] - cr) ** 2 + (p.c[1] - cg) ** 2 + (p.c[2] - cb) ** 2; if (d < bd) { bd = d; best = p; } }
    // far from every ramp, lean on the neutral step
    const k = Math.min(1, Math.sqrt(bd) / 90);
    near[(b * C + g) * C + r] = { d: best.d.map((v, i) => v + (GEN.d[i] - v) * k), b: best.b.map((v, i) => v + (GEN.b[i] - v) * k) };
  }
  for (let b = 0; b < N; b++) for (let g = 0; g < N; g++) for (let r = 0; r < N; r++) {
    const e = near[((b >> 2) * C + (g >> 2)) * C + (r >> 2)], j = ((b * N + g) * N + r) * 3;
    dark.set(e.d, j); bright.set(e.b, j);
  }
  // exact pass: the cell a ramp colour falls in answers with that colour's own neighbours
  for (const p of P) { const j = (((p.c[2] >> 2) * N + (p.c[1] >> 2)) * N + (p.c[0] >> 2)) * 3; dark.set(p.d, j); bright.set(p.b, j); }
  const mk = (data, old) => {
    const t = old ?? gl.createTexture();
    gl.bindTexture(gl.TEXTURE_3D, t);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGB32F, N, N, N, 0, gl.RGB, gl.FLOAT, data);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_3D, k, v);
    return t;
  };
  texDark = mk(dark, texDark); texBright = mk(bright, texBright);
}

// ---------------------------------------------------------------- per-frame
/** The three layers to paint this frame: [ground, sprites, overlay], each { x } with x standing in for a 2D context. */
export function lightLayers(w, h) {
  if (!layers || size[0] !== w || size[1] !== h) {
    size = [w, h];
    glCanvas.width = w; glCanvas.height = h;
    const mk = () => tex2d(w, h);
    for (const t of [texLitS, texLitO, texMask, ...layerTex]) if (t) gl.deleteTexture(t);
    layerTex.length = 0; addBox = null;
    for (let i = 0; i < 4; i++) {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t); gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, w, h);
      for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
      layerTex.push(t);
    }
    layers ??= [0, 1, 2].map((i) => ({ x: new Layer(i) }));
    layers.forEach((l, i) => {
      l.x.fbo ??= gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, l.x.fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, layerTex[i], 0);
    });
    texLitS = mk(); texLitO = mk(); texMask = tex2d(w, h, gl.R8, gl.RED);
    fboLight ??= gl.createFramebuffer(); fboMask ??= gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fboLight);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texLitS, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, texLitO, 0);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fboMask);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texMask, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  frameNo++; curLayer = null; nQ = 0;
  gl.disable(gl.BLEND); gl.clearColor(0, 0, 0, 0);
  for (const l of layers) { l.x.reset(); gl.bindFramebuffer(gl.FRAMEBUFFER, l.x.fbo); gl.clear(gl.COLOR_BUFFER_BIT); }
  return layers;
}

// ---------------------------------------------------------------- sprites on the GPU: a stand-in for the 2D context
const VS_SPR = `#version 300 es
in vec2 aPos; in vec2 aUV; in vec4 aCol;
uniform vec2 uView;
out vec2 vUV; out vec4 vCol;
void main() { vUV = aUV; vCol = aCol; vec2 c = aPos / uView * 2.0 - 1.0; gl_Position = vec4(c.x, -c.y, 0.0, 1.0); }`;
const FS_SPR = `#version 300 es
precision highp float;
uniform sampler2D uTex;
in vec2 vUV; in vec4 vCol; out vec4 o;
void main() { o = texture(uTex, vUV) * vCol; }`;

const PAGE = 2048, BIG = 640, MAXQ = 4096, FPV = 8;
let progSpr, vaoS, vboS, pages = [], srcs = new WeakMap(), named = new Map();
let frameNo = 0, curLayer = null, curTex = null, curBlend = 0, nQ = 0;
const qv = new Float32Array(MAXQ * 6 * FPV);

function setupSprites() {
  progSpr = program(VS_SPR, FS_SPR, ["aPos", "aUV", "aCol"]);
  vaoS = gl.createVertexArray(); gl.bindVertexArray(vaoS);
  vboS = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vboS);
  gl.bufferData(gl.ARRAY_BUFFER, qv.byteLength, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, FPV * 4, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, FPV * 4, 8);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, FPV * 4, 16);
  pages = []; srcs = new WeakMap(); named = new Map(); curLayer = null; nQ = 0;
  newPage();
}
function plainTex(w, h, smooth) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t); gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, w, h);
  const f = smooth ? gl.LINEAR : gl.NEAREST;
  for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, f], [gl.TEXTURE_MAG_FILTER, f], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
  return t;
}
function newPage() {
  const p = { tex: plainTex(PAGE, PAGE), w: PAGE, h: PAGE, shelves: [], y: 4 };
  // a few white texels in the corner: plain rectangles are drawn from them, in the same batch as the sprites
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 2, 2, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(16).fill(255));
  pages.push(p);
  return p;
}
/** Where an image lives on the GPU: a slot in an atlas page, or a texture of its own if it is large. Sent once. */
function place(img) {
  const w = img.width, h = img.height;
  let e;
  if (w > BIG || h > BIG || img.dyn) e = { tex: plainTex(w, h), tw: w, th: h, x: 0, y: 0, w, h };
  else {
    let spot = null;
    for (const p of pages) {
      // shelves: rows of similar height, filled left to right
      for (const sh of p.shelves) if (sh.h >= h && sh.h <= h * 1.35 + 4 && sh.x + w + 1 <= PAGE) { spot = { p, x: sh.x, y: sh.y }; sh.x += w + 1; break; }
      if (!spot && p.y + h + 1 <= PAGE) { p.shelves.push({ y: p.y, h, x: w + 1 }); spot = { p, x: 0, y: p.y }; p.y += h + 1; }
      if (spot) break;
    }
    if (!spot) { const p = newPage(); p.shelves.push({ y: p.y, h, x: w + 1 }); spot = { p, x: 0, y: p.y }; p.y += h + 1; }
    e = { tex: spot.p.tex, tw: PAGE, th: PAGE, x: spot.x, y: spot.y, w, h };
    gl.bindTexture(gl.TEXTURE_2D, e.tex);
  }
  send(e, img);
  srcs.set(img, e);
  return e;
}
function send(e, img) {
  gl.bindTexture(gl.TEXTURE_2D, e.tex);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, e.x, e.y, gl.RGBA, gl.UNSIGNED_BYTE, img);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  e.stamp = frameNo;
}
function flush() {
  if (!nQ || !curLayer) { nQ = 0; return; }
  gl.bindFramebuffer(gl.FRAMEBUFFER, curLayer.fbo);
  gl.viewport(0, 0, size[0], size[1]);
  gl.useProgram(progSpr.p); gl.uniform2f(progSpr.u.uView, size[0], size[1]); gl.uniform1i(progSpr.u.uTex, 0);
  gl.bindVertexArray(vaoS); gl.bindBuffer(gl.ARRAY_BUFFER, vboS);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, qv, 0, nQ * 6 * FPV);
  gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD);
  // colours carry their alpha already; "lighter" adds light without thickening the layer
  if (curBlend) gl.blendFuncSeparate(gl.ONE, gl.ONE, gl.ZERO, gl.ONE); else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, curTex);
  gl.drawArrays(gl.TRIANGLES, 0, nQ * 6);
  nQ = 0;
}
const colors = new Map();
function parseColor(str) {
  let c = colors.get(str);
  if (c) return c;
  if (str[0] === "#") {
    const h = str.length === 4 ? str[1] + str[1] + str[2] + str[2] + str[3] + str[3] : str.slice(1), n = parseInt(h, 16);
    c = [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1];
  } else {
    const m = str.match(/[\d.]+/g) ?? [0, 0, 0];
    c = [m[0] / 255, m[1] / 255, m[2] / 255, m[3] == null ? 1 : +m[3]];
  }
  if (colors.size > 4000) colors.clear();
  colors.set(str, c);
  return c;
}

/** One layer of the frame. It answers to the part of CanvasRenderingContext2D the game draws with. */
class Layer {
  constructor(i) { this.i = i; this.fbo = null; this.reset(); }
  reset() {
    this.m = [1, 0, 0, 1, 0, 0]; this.flat = true; this.stack = [];
    this.globalAlpha = 1; this.blend = 0; this.lineWidth = 1; this.imageSmoothingEnabled = false;
    this.fs = "#000"; this.fc = [0, 0, 0, 1]; this.ss = "#000"; this.sc = [0, 0, 0, 1];
  }
  get fillStyle() { return this.fs; }
  set fillStyle(v) { if (v !== this.fs) { this.fs = v; this.fc = parseColor(v); } }
  get strokeStyle() { return this.ss; }
  set strokeStyle(v) { if (v !== this.ss) { this.ss = v; this.sc = parseColor(v); } }
  get globalCompositeOperation() { return this.blend ? "lighter" : "source-over"; }
  set globalCompositeOperation(v) { this.blend = v === "lighter" ? 1 : 0; }
  save() { this.stack.push([this.m.slice(), this.flat, this.globalAlpha, this.blend, this.fs, this.fc, this.ss, this.sc, this.lineWidth]); }
  restore() { const s = this.stack.pop(); if (s) [this.m, this.flat, this.globalAlpha, this.blend, this.fs, this.fc, this.ss, this.sc, this.lineWidth] = s; }
  translate(x, y) { const m = this.m; m[4] += m[0] * x + m[2] * y; m[5] += m[1] * x + m[3] * y; this.flat = false; }
  scale(x, y) { const m = this.m; m[0] *= x; m[1] *= x; m[2] *= y; m[3] *= y; this.flat = false; }
  rotate(a) { const m = this.m, c = Math.cos(a), s = Math.sin(a), [a0, a1, a2, a3] = m; m[0] = a0 * c + a2 * s; m[1] = a1 * c + a3 * s; m[2] = a2 * c - a0 * s; m[3] = a3 * c - a1 * s; this.flat = false; }

  /** A quad of texture `tex` (u, v in 0..1) at x, y, w, h, tinted by r, g, b, a (alpha already multiplied in). */
  quad(tex, u0, v0, u1, v1, x, y, w, h, r, g, b, a) {
    if (curLayer !== this || curTex !== tex || curBlend !== this.blend || nQ >= MAXQ) { flush(); curLayer = this; curTex = tex; curBlend = this.blend; }
    let x0 = x, y0 = y, x1 = x + w, y1 = y, x2 = x, y2 = y + h, x3 = x + w, y3 = y + h;
    if (!this.flat) {
      const m = this.m, X = (px, py) => m[0] * px + m[2] * py + m[4], Y = (px, py) => m[1] * px + m[3] * py + m[5];
      [x0, y0, x1, y1, x2, y2, x3, y3] = [X(x, y), Y(x, y), X(x + w, y), Y(x + w, y), X(x, y + h), Y(x, y + h), X(x + w, y + h), Y(x + w, y + h)];
    }
    let o = nQ++ * 6 * FPV;
    const v = qv, put = (px, py, pu, pv) => { v[o++] = px; v[o++] = py; v[o++] = pu; v[o++] = pv; v[o++] = r; v[o++] = g; v[o++] = b; v[o++] = a; };
    put(x0, y0, u0, v0); put(x1, y1, u1, v0); put(x2, y2, u0, v1);
    put(x2, y2, u0, v1); put(x1, y1, u1, v0); put(x3, y3, u1, v1);
  }
  rect(x, y, w, h, c) {
    const a = c[3] * this.globalAlpha, t = pages[0];
    this.quad(t.tex, 0.5 / PAGE, 0.5 / PAGE, 1 / PAGE, 1 / PAGE, x, y, w, h, c[0] * a, c[1] * a, c[2] * a, a);
  }
  fillRect(x, y, w, h) { this.rect(x, y, w, h, this.fc); }
  strokeRect(x, y, w, h) {
    const l = this.lineWidth, k = l / 2, c = this.sc;
    this.rect(x - k, y - k, w + l, l, c); this.rect(x - k, y + h - k, w + l, l, c);
    this.rect(x - k, y + k, l, h - l, c); this.rect(x + w - k, y + k, l, h - l, c);
  }
  /** drawImage(img, dx, dy) · (img, dx, dy, dw, dh) · (img, sx, sy, sw, sh, dx, dy, dw, dh) */
  drawImage(img, a, b, c, d, e, f, g, h) {
    if (!img.width || !img.height) return;
    let t = srcs.get(img);
    if (!t) t = place(img);
    else if (img.dyn && t.stamp !== frameNo) { flush(); send(t, img); } // a canvas repainted every frame (reflections)
    let sx = 0, sy = 0, sw = t.w, sh = t.h, dx = a, dy = b, dw = t.w, dh = t.h;
    if (e !== undefined) { sx = a; sy = b; sw = c; sh = d; dx = e; dy = f; dw = g; dh = h; } else if (c !== undefined) { dw = c; dh = d; }
    const ga = this.globalAlpha;
    this.quad(t.tex, (t.x + sx) / t.tw, (t.y + sy) / t.th, (t.x + sx + sw) / t.tw, (t.y + sy + sh) / t.th, dx, dy, dw, dh, ga, ga, ga, ga);
  }
  /**
   * Raw RGBA pixels (plain alpha, top row first) that change every frame: effects, fog. `name` keeps one texture per use;
   * `box` [x, y, w, h] is the part of the w×h image worth sending (null: all of it, false: nothing new since last time).
   * Drawn from that box, or all of it if none was given, to dx, dy, dw, dh.
   */
  pixels(name, data, w, h, box, dx, dy, dw, dh, smooth = false) {
    let t = named.get(name);
    if (!t || t.w !== w || t.h !== h) { if (t) gl.deleteTexture(t.tex); t = { tex: plainTex(w, h, smooth), w, h }; named.set(name, t); if (box === false) box = null; }
    if (box !== false) {
      const [bx, by, bw, bh] = box ?? [0, 0, w, h];
      if (curTex === t.tex) flush();
      gl.bindTexture(gl.TEXTURE_2D, t.tex);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.pixelStorei(gl.UNPACK_ROW_LENGTH, w); gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, bx); gl.pixelStorei(gl.UNPACK_SKIP_ROWS, by);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, bx, by, bw, bh, gl.RGBA, gl.UNSIGNED_BYTE, data);
      gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0); gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0); gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    }
    const [sx, sy, sw, sh] = box || [0, 0, w, h], ga = this.globalAlpha;
    this.quad(t.tex, sx / w, sy / h, (sx + sw) / w, (sy + sh) / h, dx, dy, dw, dh, ga, ga, ga, ga);
  }
}

const quad = new Float32Array(18);
function drawQuad(x0, y0, x1, y1) {
  quad.set([x0, y0, 0, x1, y0, 0, x0, y1, 0, x0, y1, 0, x1, y0, 0, x1, y1, 0]);
  gl.bufferData(gl.ARRAY_BUFFER, quad, gl.DYNAMIC_DRAW);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
}
let verts = new Float32Array(6 * 3 * 256);

/**
 * Light the frame and show it. `s` is:
 *   add: { data, x0, y0, x1, y1 }, RGBA pixels of the view (top row first) to add on top and the box that holds them, or null;
 *   cam: [x, y] of the view's top-left in the world; amb: { level, tint: [r,g,b], tintK };
 *   lights: [{ x, y, r, c: [r,g,b] 0..1, i, shadows }] and occluders: [{ x, y, w, h }], all in view pixels.
 */
export function renderLight(s) {
  const [w, h] = size, high = lightSettings.mode === "high", I = lightSettings.intensity;
  flush(); curLayer = null;
  gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.viewport(0, 0, w, h);
  layers.forEach((l, i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, layerTex[i]); });
  // the effects' light: opaque where there is any, so it needs no alpha handling; nothing to send on most frames
  gl.activeTexture(gl.TEXTURE3);
  if (s.add) {
    // only the box that holds light now, or held it at the last upload (to wipe what moved away)
    const A = s.add, R = addBox ? [Math.min(A.x0, addBox[0]), Math.min(A.y0, addBox[1]), Math.max(A.x1, addBox[2]), Math.max(A.y1, addBox[3])] : [A.x0, A.y0, A.x1, A.y1];
    addBox = [A.x0, A.y0, A.x1, A.y1];
    gl.bindTexture(gl.TEXTURE_2D, layerTex[3]);
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, w); gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, R[0]); gl.pixelStorei(gl.UNPACK_SKIP_ROWS, R[1]);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, R[0], R[1], R[2] - R[0] + 1, R[3] - R[1] + 1, gl.RGBA, gl.UNSIGNED_BYTE, A.data);
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0); gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0); gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
  }
  else gl.bindTexture(gl.TEXTURE_2D, texClear);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);

  // ---- the light buffer
  gl.bindFramebuffer(gl.FRAMEBUFFER, fboLight);
  gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
  let casters = 0;
  for (const L of s.lights) {
    if (L.x < -L.r || L.y < -L.r || L.x > w + L.r || L.y > h + L.r) continue;
    let mask = texNone;
    if (high && L.shadows && casters < 8) {
      // this light's shadows: a tapered quad behind everything that stands within its reach
      let n = 0;
      for (const o of s.occluders) {
        const dx = o.x - L.x, dy = o.y - L.y, d = Math.hypot(dx, dy);
        if (d > L.r || d < Math.max(4, o.w * 0.8)) continue;
        const ux = dx / d, uy = dy / d, px = -uy, py = ux;
        const len = Math.min(72, o.h * (0.3 + d / 70)), w0 = o.w, w1 = o.w * 1.3, k0 = 1, k1 = 0.3;
        const ax = o.x - ux * 2, ay = o.y - uy * 2, bx = o.x + ux * len, by = o.y + uy * len;
        if (n + 18 > verts.length) { const v = new Float32Array(verts.length * 2); v.set(verts); verts = v; }
        const P = [[ax + px * w0, ay + py * w0, k0], [ax - px * w0, ay - py * w0, k0], [bx + px * w1, by + py * w1, k1], [bx - px * w1, by - py * w1, k1]];
        for (const i of [0, 1, 2, 2, 1, 3]) { verts[n++] = P[i][0]; verts[n++] = P[i][1]; verts[n++] = P[i][2]; }
      }
      if (n) {
        casters++;
        gl.bindFramebuffer(gl.FRAMEBUFFER, fboMask);
        gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(progShadow.p); gl.uniform2f(progShadow.u.uView, w, h);
        gl.enable(gl.BLEND); gl.blendEquation(gl.MAX); gl.blendFunc(gl.ONE, gl.ONE);
        gl.bufferData(gl.ARRAY_BUFFER, verts.subarray(0, n), gl.DYNAMIC_DRAW);
        gl.drawArrays(gl.TRIANGLES, 0, n / 3);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fboLight);
        mask = texMask;
      }
    }
    gl.useProgram(progLight.p);
    gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ONE, gl.ONE);
    gl.activeTexture(gl.TEXTURE6); gl.bindTexture(gl.TEXTURE_2D, mask);
    gl.uniform1i(progLight.u.uMask, 6);
    gl.uniform2f(progLight.u.uView, w, h);
    gl.uniform3f(progLight.u.uLight, L.x, L.y, L.r);
    gl.uniform3f(progLight.u.uColor, L.c[0], L.c[1], L.c[2]);
    gl.uniform1f(progLight.u.uPow, L.i);
    drawQuad(L.x - L.r, L.y - L.r, L.x + L.r, L.y + L.r);
  }

  // ---- everything together
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.disable(gl.BLEND);
  const P = progMix;
  gl.useProgram(P.p);
  gl.uniform2f(P.u.uView, w, h);
  gl.uniform2f(P.u.uCam, s.cam[0], s.cam[1]);
  ["uGround", "uSprites", "uOver", "uAdd"].forEach((n, i) => gl.uniform1i(P.u[n], i));
  gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, texLitS); gl.uniform1i(P.u.uLitS, 4);
  gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D, texLitO); gl.uniform1i(P.u.uLitO, 5);
  gl.activeTexture(gl.TEXTURE7); gl.bindTexture(gl.TEXTURE_3D, texDark); gl.uniform1i(P.u.uDark, 7);
  gl.activeTexture(gl.TEXTURE8); gl.bindTexture(gl.TEXTURE_3D, texBright); gl.uniform1i(P.u.uBright, 8);
  // the slider scales the darkness (in whole steps) as well as the lamps
  gl.uniform1f(P.u.uAmb, Math.round(s.amb.level * Math.min(1.25, I)));
  gl.uniform3f(P.u.uTint, ...s.amb.tint);
  gl.uniform1f(P.u.uTintK, Math.min(1, s.amb.tintK * I));
  gl.uniform1f(P.u.uGain, I * (s.amb.gain ?? 1));
  gl.uniform1f(P.u.uColorK, high ? 0.3 : 0.15);
  drawQuad(0, 0, w, h);
}

/** Show or hide the lit canvas over the plain one, matching its on-screen size. */
export function showLight(on, cssW, cssH) {
  if (!glCanvas) return;
  glCanvas.style.display = on ? "block" : "none";
  if (on) { glCanvas.style.width = cssW + "px"; glCanvas.style.height = cssH + "px"; }
}
