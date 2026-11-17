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
// Light sources add up in a buffer. Each source that casts shadows first draws them into a mask. A shadow is the
// thing's own silhouette: while a prop or a person is painted, the quads that make it up are noted, and the shadow
// pass draws them again laid flat on the ground, stretched away from the light (the farther from a lamp, the longer)
// and fading towards the top. By day the sun does the same from where it stands at that hour: long shadows to the
// west at dawn, short ones to the north at noon, long to the east at dusk; the ground under them drops one ramp step.
// Shadows fall on the ground layer only.
//
// Bloom (an option of its own): what is brighter than the art's own light, and the effects' light, spills a soft
// halo around itself, blurred at a fraction of the size and laid back in the same Bayer bands as everything else.
// Turned off, none of this runs and the game draws straight to the screen as it always did.

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
};
export const lightSettings = { mode: "high", intensity: 1, bloom: false, ...store.get("brum.light", {}) };
export function setLight(patch) { Object.assign(lightSettings, patch); store.set("brum.light", lightSettings); }

const VS = `#version 300 es
in vec2 aPos; in float aK;
uniform vec2 uView;
out float vK;
void main() { vK = aK; vec2 c = aPos / uView * 2.0 - 1.0; gl_Position = vec4(c.x, -c.y, 0.0, 1.0); }`;

// a shadow: a sprite's quads laid on the ground; the mask keeps the darkest one (blend MAX)
const VS_CAST = `#version 300 es
in vec2 aPos; in vec2 aUV; in float aK;
uniform vec2 uView;
out vec2 vUV; out float vK;
void main() { vUV = aUV; vK = aK; vec2 c = aPos / uView * 2.0 - 1.0; gl_Position = vec4(c.x, -c.y, 0.0, 1.0); }`;
const FS_CAST = `#version 300 es
precision highp float;
uniform sampler2D uTex;
in vec2 vUV; in float vK; out vec4 o;
void main() { float a = texture(uTex, vUV).a; if (a < 0.5) discard; o = vec4(vK, 0.0, 0.0, 1.0); }`;

const FS_LIGHT = `#version 300 es
precision highp float;
uniform vec2 uView; uniform float uSS; uniform vec3 uLight; uniform vec3 uColor; uniform float uPow; uniform sampler2D uMask;
layout(location = 0) out vec4 oShadowed; layout(location = 1) out vec4 oOpen;
void main() {
  vec2 fc = gl_FragCoord.xy / uSS;
  vec2 px = vec2(fc.x, uView.y - fc.y);
  float d = distance(px, uLight.xy) / uLight.z;
  float f = pow(max(0.0, 1.0 - d), 1.35) * uPow;
  float sh = texture(uMask, fc / uView).r;
  oOpen = vec4(uColor * f, 1.0);
  oShadowed = vec4(uColor * f * (1.0 - sh), 1.0);
}`;

const FS_MIX = `#version 300 es
precision highp float;
precision highp sampler3D;
uniform vec2 uView; uniform vec2 uCam; uniform float uSS; // the view in game pixels; the picture is uSS times that
uniform sampler2D uGround, uSprites, uOver, uAdd, uLitS, uLitO, uSun;
uniform float uSunK;     // how strong the sun's shadows are now (0: night, indoors)
uniform float uBloom;    // 0: no bloom, so nothing to write to the second target
uniform sampler3D uDark, uBright;
uniform float uAmb;      // whole steps of darkness (0, -1, -2...)
uniform vec3 uTint;      // ambient colour
uniform float uTintK;    // how much of it
uniform float uGain;     // dynamic light strength
uniform float uColorK;   // how much a light's own colour shows
layout(location = 0) out vec4 o; layout(location = 1) out vec4 oB;
const float B[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
vec3 lut(sampler3D t, vec3 c) { return c * texture(t, (floor(c * 255.0 / 4.0) + 0.5) / 64.0).rgb; }
vec3 shade(vec3 c, vec3 L, float bay, float amb) {
  float lum = max(L.r, max(L.g, L.b)) * uGain;
  // light lifts the dark back to the art's own colours, and one step past them at its heart
  float lift = lum * (1.0 - amb);
  float q = amb + floor(lift + 0.5 + (bay - 0.5) * 0.55);
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
  vec2 fc = gl_FragCoord.xy / uSS;
  vec2 uv = fc / uView;
  vec2 px = vec2(fc.x, uView.y - fc.y);
  ivec2 w = ivec2(floor(px + uCam));
  float bay = (B[(w.y & 3) * 4 + (w.x & 3)] + 0.5) / 16.0;
  // the three painted layers hold colour already multiplied by alpha; the effects' light comes as raw rows, top first
  vec4 g = texture(uGround, uv), s = texture(uSprites, uv), ov = texture(uOver, uv), ad = texture(uAdd, vec2(uv.x, 1.0 - uv.y));
  // in the sun's shadow the ground is a whole step darker, with a dithered edge, and leans to the sky's blue
  float sd = texture(uSun, uv).r * uSunK, inSun = step(0.15 + bay * 0.3, sd);
  vec3 col = shade(g.rgb, texture(uLitS, uv).rgb, bay, uAmb - inSun);
  col *= mix(vec3(1.0), vec3(0.86, 0.92, 1.1), inSun);
  if (s.a > 0.004) col = mix(col, shade(s.rgb / s.a, texture(uLitO, uv).rgb, bay, uAmb), s.a);
  vec3 world = col; // the lit world, before the haze, fog and frame go over it
  col = col * (1.0 - ov.a) + ov.rgb;
  col += ad.rgb;
  o = vec4(col, 1.0);
  if (uBloom > 0.5) {
    // what glows: what the light pushed past the art's own brightest, and every bit of the effects' light
    // (not the haze or the fog over the world: a pale sky is not a lamp)
    float l = dot(world, vec3(0.3, 0.59, 0.11));
    oB = vec4(world * smoothstep(0.7, 1.0, l) * (1.0 - ov.a) + ad.rgb, 1.0);
  } else oB = vec4(0.0);
}`;

// bloom: a downsample (four bilinear taps), a separable blur, and the sum laid over the picture in Bayer bands
const FS_DOWN = `#version 300 es
precision highp float;
uniform sampler2D uTex; uniform vec2 uView; out vec4 o;
void main() {
  vec2 uv = gl_FragCoord.xy / uView, d = 0.5 / uView;
  o = 0.25 * (texture(uTex, uv + vec2(-d.x, -d.y)) + texture(uTex, uv + vec2(d.x, -d.y)) + texture(uTex, uv + vec2(-d.x, d.y)) + texture(uTex, uv + vec2(d.x, d.y)));
}`;
const FS_BLUR = `#version 300 es
precision highp float;
uniform sampler2D uTex; uniform vec2 uView; uniform vec2 uDir; out vec4 o;
void main() {
  vec2 uv = gl_FragCoord.xy / uView, st = uDir / uView;
  // 9 taps folded into 5 bilinear reads
  vec4 c = texture(uTex, uv) * 0.2270270;
  c += (texture(uTex, uv + st * 1.3846154) + texture(uTex, uv - st * 1.3846154)) * 0.3162162;
  c += (texture(uTex, uv + st * 3.2307692) + texture(uTex, uv - st * 3.2307692)) * 0.0702703;
  o = c;
}`;
const FS_COMP = `#version 300 es
precision highp float;
uniform sampler2D uScene, uA, uB; uniform vec2 uView; uniform vec2 uCam; uniform float uSS; uniform vec2 uK;
out vec4 o;
const float B[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
void main() {
  vec2 fc = gl_FragCoord.xy / uSS, uv = fc / uView;
  ivec2 w = ivec2(floor(vec2(fc.x, uView.y - fc.y) + uCam));
  float bay = (B[(w.y & 3) * 4 + (w.x & 3)] + 0.5) / 16.0;
  vec3 b = texture(uA, uv).rgb * uK.x + texture(uB, uv).rgb * uK.y;
  b = floor(b * 10.0 + bay) / 10.0; // in bands, like the light, never a smooth gradient
  o = vec4(texture(uScene, uv).rgb + b, 1.0);
}`;

let gl = null, glCanvas = null, ok = false, failed = false;
let progCast, progLight, progMix, progDown, progBlur, progComp, vbo, vao, vaoC, vboC;
let fboLight, texLitS, texLitO, fboMask, texMask, fboSun, texSun, texNone, texClear, texDark, texBright;
let fboScene, texScene, texGlow, bloomT = []; // bloom: the lit picture, what glows in it, and two blurred sizes of that
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
function smoothTex(w, h) {
  const t = tex2d(w, h);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  return t;
}
function tex2d(w, h, internal = gl.RGBA8, format = gl.RGBA) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, gl.UNSIGNED_BYTE, null);
  for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
  return t;
}

function setup() {
  progLight = program(VS, FS_LIGHT); progMix = program(VS, FS_MIX);
  progDown = program(VS, FS_DOWN); progBlur = program(VS, FS_BLUR); progComp = program(VS, FS_COMP);
  progCast = program(VS_CAST, FS_CAST, ["aPos", "aUV", "aK"]);
  setupSprites();
  vaoC = gl.createVertexArray(); gl.bindVertexArray(vaoC);
  vboC = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vboC);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 20, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 8);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 20, 16);
  vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  vbo = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 12, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 12, 8);
  texClear = tex2d(1, 1); // transparent black
  texNone = tex2d(1, 1, gl.R8, gl.RED);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 1, 1, 0, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array([0]));
  // everything sized to the view is made again by lightLayers
  layerTex.length = 0; layers = null; size = [0, 0];
  texLitS = texLitO = texMask = texSun = fboLight = fboMask = fboSun = texDark = texBright = null;
  fboScene = texScene = texGlow = null; bloomT = [];
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
/**
 * A separate surface to paint on and then draw from (the 3D view paints the flat ground on one and lays it down row
 * by row). Ask after lightLayers each frame; it comes back ready, with its last picture still on it.
 */
export function lightSurface(i, w, h) {
  let L = surfaces[i];
  if (!L || L.w !== w || L.h !== h) {
    if (L) { gl.deleteTexture(L.tex); gl.deleteFramebuffer(L.fbo); }
    L = surfaces[i] = new Layer(10 + i);
    L.w = w; L.h = h; L.tex = plainTex(w, h); L.fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, L.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, L.tex, 0);
  }
  L.reset();
  return L;
}

/** The three layers to paint this frame: [ground, sprites, overlay], each { x } with x standing in for a 2D context. */
export function lightLayers(w, h) {
  if (!layers || size[0] !== w || size[1] !== h) {
    size = [w, h];
    glCanvas.width = w; glCanvas.height = h;
    const mk = () => tex2d(w, h);
    for (const t of [texLitS, texLitO, texMask, texSun, texScene, texGlow, ...layerTex, ...bloomT.map((b) => b.tex)]) if (t) gl.deleteTexture(t);
    for (const b of bloomT) gl.deleteFramebuffer(b.fbo);
    bloomT = [];
    layerTex.length = 0; addBox = null;
    for (let i = 0; i < 4; i++) {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t); gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, w, h);
      for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
      layerTex.push(t);
    }
    layers ??= [0, 1, 2].map((i) => ({ x: new Layer(i) }));
    layers.forEach((l, i) => {
      l.x.w = w; l.x.h = h; l.x.tex = layerTex[i];
      l.x.fbo ??= gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, l.x.fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, layerTex[i], 0);
    });
    texLitS = mk(); texLitO = mk(); texMask = tex2d(w, h, gl.R8, gl.RED); texSun = tex2d(w, h, gl.R8, gl.RED);
    texScene = mk(); texGlow = smoothTex(w, h);
    fboLight ??= gl.createFramebuffer(); fboMask ??= gl.createFramebuffer(); fboSun ??= gl.createFramebuffer(); fboScene ??= gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fboSun);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texSun, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fboScene);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texScene, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, texGlow, 0);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    // the bloom's working sizes: a quarter and an eighth of the picture's side, two textures each (for the two blur passes)
    for (const d of [4, 4, 8, 8]) {
      const bw = Math.max(1, Math.round(w / d)), bh = Math.max(1, Math.round(h / d)), tex = smoothTex(bw, bh), fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      bloomT.push({ tex, fbo, w: bw, h: bh });
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, fboLight);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texLitS, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, texLitO, 0);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fboMask);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texMask, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  frameNo++; curLayer = null; curMirror = null; nQ = 0; casters.length = 0;
  gl.disable(gl.BLEND); gl.clearColor(0, 0, 0, 0);
  for (const l of layers) { l.x.reset(); gl.bindFramebuffer(gl.FRAMEBUFFER, l.x.fbo); gl.clear(gl.COLOR_BUFFER_BIT); }
  return layers;
}

// ---------------------------------------------------------------- sprites on the GPU: a stand-in for the 2D context
const VS_SPR = `#version 300 es
in vec2 aPos; in vec2 aUV; in vec4 aCol;
uniform vec2 uView;
out vec2 vUV; out vec4 vCol; out vec2 vPos;
void main() { vUV = aUV; vCol = aCol; vPos = aPos; vec2 c = aPos / uView * 2.0 - 1.0; gl_Position = vec4(c.x, -c.y, 0.0, 1.0); }`;
const FS_SPR = `#version 300 es
precision highp float;
uniform sampler2D uTex, uMask;
uniform float uStraight;      // the texture holds plain (not premultiplied) alpha: raw pixels from the effects and the fog
uniform float uMirror, uTime; // reflections on water: rippled rows, kept only where the mask says water, tinted by it
uniform vec4 uMaskRect;       // the layer's origin in the world (x, y), and 1 / the mask's size
in vec2 vUV; in vec4 vCol; in vec2 vPos; out vec4 o;
void main() {
  if (uMirror > 0.5) {
    vec2 wp = floor(vPos) + uMaskRect.xy;
    float row = floor(wp.y / 2.0) * 2.0;
    float off = floor(sin(uTime * 1.8 + row * 0.22) * 1.2 + sin(uTime * 0.7 + row * 0.05) * 0.8 + 0.5);
    vec4 c = texture(uTex, vUV - vec2(off / float(textureSize(uTex, 0).x), 0.0));
    c.rgb = mix(c.rgb, vec3(24.0, 96.0, 120.0) / 255.0 * c.a, 0.45);
    o = c * vCol * 0.5 * texture(uMask, (wp + 0.5) * uMaskRect.zw).a;
  } else {
    vec4 c = texture(uTex, vUV);
    if (uStraight > 0.5) c.rgb *= c.a;
    o = c * vCol;
  }
}`;

const PAGE = 2048, BIG = 640, MAXQ = 4096, FPV = 8, GAP = 3; // GAP: clear texels between sprites in a row (reflections ripple sideways)
let progSpr, vaoS, vboS, pages = [], srcs = new WeakMap(), named = new Map(), surfaces = [];
let frameNo = 0, curLayer = null, curTex = null, curBlend = 0, curMirror = null, curStraight = false, nQ = 0;
/** What casts a shadow this frame: { fx, fy (its feet, flat), m (the transform it was drawn under), q: its quads }. */
const casters = [];
const qv = new Float32Array(MAXQ * 6 * FPV);

function setupSprites() {
  progSpr = program(VS_SPR, FS_SPR, ["aPos", "aUV", "aCol"]);
  vaoS = gl.createVertexArray(); gl.bindVertexArray(vaoS);
  vboS = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vboS);
  gl.bufferData(gl.ARRAY_BUFFER, qv.byteLength, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, FPV * 4, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, FPV * 4, 8);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, FPV * 4, 16);
  pages = []; srcs = new WeakMap(); named = new Map(); surfaces = []; curLayer = null; nQ = 0;
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
      for (const sh of p.shelves) if (sh.h >= h && sh.h <= h * 1.35 + 4 && sh.x + w + GAP <= PAGE) { spot = { p, x: sh.x, y: sh.y }; sh.x += w + GAP; break; }
      if (!spot && p.y + h + 1 <= PAGE) { p.shelves.push({ y: p.y, h, x: GAP + w + GAP }); spot = { p, x: GAP, y: p.y }; p.y += h + 1; }
      if (spot) break;
    }
    if (!spot) { const p = newPage(); p.shelves.push({ y: p.y, h, x: GAP + w + GAP }); spot = { p, x: GAP, y: p.y }; p.y += h + 1; }
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
  gl.viewport(0, 0, curLayer.w, curLayer.h);
  gl.useProgram(progSpr.p); gl.uniform2f(progSpr.u.uView, curLayer.w, curLayer.h); gl.uniform1i(progSpr.u.uTex, 0);
  gl.bindVertexArray(vaoS); gl.bindBuffer(gl.ARRAY_BUFFER, vboS);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, qv, 0, nQ * 6 * FPV);
  gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD);
  // colours carry their alpha already; "lighter" adds light without thickening the layer
  if (curBlend) gl.blendFuncSeparate(gl.ONE, gl.ONE, gl.ZERO, gl.ONE); else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  const M = curMirror;
  gl.uniform1f(progSpr.u.uMirror, M ? 1 : 0); gl.uniform1f(progSpr.u.uStraight, curStraight ? 1 : 0);
  if (M) { gl.uniform1f(progSpr.u.uTime, M.t); gl.uniform4f(progSpr.u.uMaskRect, M.x, M.y, 1 / M.mask.tw, 1 / M.mask.th); }
  // the mask's unit always holds something harmless: left alone it keeps the lit pass's bindings, which are the very
  // layers being painted, and WebGL refuses to draw into a texture a sampler could read
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, M ? M.mask.tex : pages[0].tex); gl.uniform1i(progSpr.u.uMask, 1);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, curTex);
  gl.drawArrays(gl.TRIANGLES, 0, nQ * 6);
  nQ = 0;
}
const straight = new WeakSet(); // textures uploaded as raw pixels with plain alpha
const views = new WeakMap();
/** ImageData pixels as a plain Uint8Array over the same memory (not every browser takes the clamped kind with a row offset). */
function bytes(d) { if (d instanceof Uint8Array) return d; let v = views.get(d); if (!v) views.set(d, (v = new Uint8Array(d.buffer, d.byteOffset, d.length))); return v; }
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
  constructor(i) { this.i = i; this.fbo = null; this.tex = null; this.w = 0; this.h = 0; this.rec = null; this.isRect = false; this.reset(); }
  get width() { return this.w; }
  get height() { return this.h; }
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
  setTransform(a, b, c, d, e, f) { this.m = [a, b, c, d, e, f]; this.flat = a === 1 && b === 0 && c === 0 && d === 1 && e === 0 && f === 0; }
  /** Wipes the whole layer (the game only ever clears all of one). */
  clearRect() { if (curLayer === this) flush(); gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo); gl.disable(gl.BLEND); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); }
  translate(x, y) { const m = this.m; m[4] += m[0] * x + m[2] * y; m[5] += m[1] * x + m[3] * y; this.flat = false; }
  scale(x, y) { const m = this.m; m[0] *= x; m[1] *= x; m[2] *= y; m[3] *= y; this.flat = false; }
  rotate(a) { const m = this.m, c = Math.cos(a), s = Math.sin(a), [a0, a1, a2, a3] = m; m[0] = a0 * c + a2 * s; m[1] = a1 * c + a3 * s; m[2] = a2 * c - a0 * s; m[3] = a3 * c - a1 * s; this.flat = false; }

  /**
   * From here until cast(null), what is drawn also casts a shadow: it stands with its feet at flat (fx, fy), in the
   * coordinates the current transform takes (the camera-relative world). Only plain sprites count, not rectangles.
   */
  cast(fx, fy) {
    this.rec = fx == null ? null : { fx, fy, m: this.m.slice(), q: [] };
    if (this.rec) casters.push(this.rec);
  }
  /**
   * From here until mirror(null), what is drawn is a reflection on water: `mask` is an image the size of the map whose
   * alpha says where water is, (x, y) the world position of this layer's top-left, t the time (for the ripple).
   */
  mirror(mask, x, y, t) {
    flush();
    curMirror = mask ? { mask: srcs.get(mask) ?? place(mask), x, y, t } : null;
  }
  /** A quad of texture `tex` (u, v in 0..1) at x, y, w, h, tinted by r, g, b, a (alpha already multiplied in). */
  quad(tex, u0, v0, u1, v1, x, y, w, h, r, g, b, a) {
    if (curLayer !== this || curTex !== tex || curBlend !== this.blend || nQ >= MAXQ) { flush(); curLayer = this; curTex = tex; curBlend = this.blend; curStraight = straight.has(tex); }
    let x0 = x, y0 = y, x1 = x + w, y1 = y, x2 = x, y2 = y + h, x3 = x + w, y3 = y + h;
    if (!this.flat) {
      const m = this.m, X = (px, py) => m[0] * px + m[2] * py + m[4], Y = (px, py) => m[1] * px + m[3] * py + m[5];
      [x0, y0, x1, y1, x2, y2, x3, y3] = [X(x, y), Y(x, y), X(x + w, y), Y(x + w, y), X(x, y + h), Y(x, y + h), X(x + w, y + h), Y(x + w, y + h)];
    }
    let o = nQ++ * 6 * FPV;
    const v = qv, put = (px, py, pu, pv) => { v[o++] = px; v[o++] = py; v[o++] = pu; v[o++] = pv; v[o++] = r; v[o++] = g; v[o++] = b; v[o++] = a; };
    put(x0, y0, u0, v0); put(x1, y1, u1, v0); put(x2, y2, u0, v1);
    put(x2, y2, u0, v1); put(x1, y1, u1, v0); put(x3, y3, u1, v1);
    if (this.rec && !this.blend && !this.isRect && a > 0.3 && !curStraight) this.rec.q.push({ tex, u0, v0, u1, v1, p: [x0, y0, x1, y1, x2, y2, x3, y3] });
  }
  rect(x, y, w, h, c) {
    const a = c[3] * this.globalAlpha, t = pages[0];
    this.isRect = true;
    this.quad(t.tex, 0.5 / PAGE, 0.5 / PAGE, 1 / PAGE, 1 / PAGE, x, y, w, h, c[0] * a, c[1] * a, c[2] * a, a);
    this.isRect = false;
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
    if (img instanceof Layer) {
      // another surface as the picture: its rows are stored bottom-up
      if (curLayer === img) flush();
      let sx = 0, sy = 0, sw = img.w, sh = img.h, dx = a, dy = b, dw = img.w, dh = img.h;
      if (e !== undefined) { sx = a; sy = b; sw = c; sh = d; dx = e; dy = f; dw = g; dh = h; } else if (c !== undefined) { dw = c; dh = d; }
      const ga = this.globalAlpha;
      this.quad(img.tex, sx / img.w, 1 - sy / img.h, (sx + sw) / img.w, 1 - (sy + sh) / img.h, dx, dy, dw, dh, ga, ga, ga, ga);
      return;
    }
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
    if (!t || t.w !== w || t.h !== h) { if (t) gl.deleteTexture(t.tex); t = { tex: plainTex(w, h, smooth), w, h }; straight.add(t.tex); named.set(name, t); if (box === false) box = null; }
    if (box !== false) {
      // sent as they are, alpha not multiplied in (the shader does it): Firefox refuses raw uploads that ask for both
      // premultiplication and a sub-rectangle
      if (curTex === t.tex) flush();
      gl.bindTexture(gl.TEXTURE_2D, t.tex);
      if (box) {
        const [bx, by, bw, bh] = box;
        gl.pixelStorei(gl.UNPACK_ROW_LENGTH, w); gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, bx); gl.pixelStorei(gl.UNPACK_SKIP_ROWS, by);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, bx, by, bw, bh, gl.RGBA, gl.UNSIGNED_BYTE, bytes(data));
        gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0); gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0); gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
      } else gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, bytes(data));
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
let verts = new Float32Array(5 * 6 * 512);
const cornerBuf = new Float32Array(20), TRI = [0, 1, 2, 2, 1, 3];

/**
 * Lay every caster's silhouette on the ground into the mask bound now. `dirOf(c)` says, for a caster, where its
 * shadow falls: [ux, uy] (a unit vector, flat), how many pixels of shadow per pixel of height, and how dark (0..1);
 * or null for none. `proj` takes a flat point to the view (the 3D camera), or is null in the flat view.
 */
function drawCasters(dirOf, proj, ss) {
  const groups = new Map();
  for (const C of casters) {
    if (!C.q.length) continue;
    const d = dirOf(C);
    if (!d) continue;
    const [ux, uy, len, k] = d;
    // once per frame: each corner as (sideways from the feet, height above them, u, v), and the caster's height
    if (!C.l) {
      const m = C.m, ia = 1 / m[0], id = 1 / m[3];
      C.l = C.q.map((q) => { const l = new Float32Array(16); for (let i = 0; i < 4; i++) { l[i * 4] = (q.p[i * 2] - m[4]) * ia - C.fx; l[i * 4 + 1] = Math.max(0, C.fy - (q.p[i * 2 + 1] - m[5]) * id); l[i * 4 + 2] = i & 1 ? q.u1 : q.u0; l[i * 4 + 3] = i & 2 ? q.v1 : q.v0; } return l; });
      C.top = Math.max(1, ...C.l.map((l) => Math.max(l[1], l[5], l[9], l[13])));
    }
    // the silhouette stands across the light: its width runs at right angles to the shadow (squashed in depth,
    // since the ground is seen at a slant), always left to right as it is drawn
    const px = Math.abs(uy), py = (uy >= 0 ? -ux : ux) * 0.55, it = 0.4 / C.top;
    const P = cornerBuf;
    C.q.forEach((q, j) => {
      const l = C.l[j];
      for (let i = 0; i < 4; i++) {
        const lx = l[i * 4], h = l[i * 4 + 1];
        let gx = C.fx + px * lx + ux * len * h, gy = C.fy + py * lx + uy * len * h;
        if (proj) { const v = proj(gx, gy); if (!v) return; gx = v[0]; gy = v[1]; }
        const o = i * 5;
        P[o] = gx * ss; P[o + 1] = gy * ss; P[o + 2] = l[i * 4 + 2]; P[o + 3] = l[i * 4 + 3]; P[o + 4] = k * (1 - Math.min(0.4, h * it));
      }
      let g = groups.get(q.tex);
      if (!g) groups.set(q.tex, (g = []));
      for (const i of TRI) for (let c = 0; c < 5; c++) g.push(P[i * 5 + c]);
    });
  }
  if (!groups.size) return false;
  gl.useProgram(progCast.p); gl.uniform2f(progCast.u.uView, size[0], size[1]); gl.uniform1i(progCast.u.uTex, 0);
  gl.bindVertexArray(vaoC); gl.bindBuffer(gl.ARRAY_BUFFER, vboC);
  gl.enable(gl.BLEND); gl.blendEquation(gl.MAX); gl.blendFunc(gl.ONE, gl.ONE);
  gl.activeTexture(gl.TEXTURE0);
  for (const [tex, g] of groups) {
    if (g.length > verts.length) verts = new Float32Array(g.length * 2);
    verts.set(g);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.bufferData(gl.ARRAY_BUFFER, verts.subarray(0, g.length), gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.TRIANGLES, 0, g.length / 5);
  }
  gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  return true;
}

/**
 * Light the frame and show it. `s` is:
 *   add: { data, x0, y0, x1, y1 }, RGBA pixels of the view (top row first) to add on top and the box that holds them, or null;
 *   ss: how many picture pixels per game pixel (2 in the 3D view); everything below is in game pixels;
 *   cam: [x, y] of the view's top-left in the world; amb: { level, tint: [r,g,b], tintK };
 *   lights: [{ x, y, r, c: [r,g,b] 0..1, i, shadows, fx, fy, fh, fr }]: (x, y, r) in the view, and the same light
 *     on the flat ground (fx, fy), how high it hangs (fh) and how far it reaches there (fr), for its shadows;
 *   sun: { ux, uy, len, k }: where the sun's shadows fall (a unit vector, flat), how long per pixel of height, and
 *     how strong (0..1); or null;
 *   proj: (fx, fy) => [x, y] or null, flat to view, for the 3D camera; null in the flat view.
 * The casters are what the sprite layer drew between cast(...) and cast(null) this frame.
 */
export function renderLight(s) {
  const ss = s.ss ?? 1, [W, H] = size, w = W / ss, h = H / ss, high = lightSettings.mode === "high", I = lightSettings.intensity;
  const bloom = !!lightSettings.bloom;
  flush(); curLayer = null;
  gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.viewport(0, 0, W, H);
  // the effects' light: opaque where there is any, so it needs no alpha handling; nothing to send on most frames
  gl.activeTexture(gl.TEXTURE3);
  if (s.add) {
    // only the box that holds light now, or held it at the last upload (to wipe what moved away)
    const A = s.add, R = addBox ? [Math.min(A.x0, addBox[0]), Math.min(A.y0, addBox[1]), Math.max(A.x1, addBox[2]), Math.max(A.y1, addBox[3])] : [A.x0, A.y0, A.x1, A.y1];
    addBox = [A.x0, A.y0, A.x1, A.y1];
    gl.bindTexture(gl.TEXTURE_2D, layerTex[3]);
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, w); gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, R[0]); gl.pixelStorei(gl.UNPACK_SKIP_ROWS, R[1]);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, R[0], R[1], R[2] - R[0] + 1, R[3] - R[1] + 1, gl.RGBA, gl.UNSIGNED_BYTE, bytes(A.data));
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0); gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0); gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
  }
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  const addTex = s.add ? layerTex[3] : texClear;
  // (texture units 0..3 are bound to the layers only for the last pass: the shadow passes use unit 0 for the atlas)

  // ---- the sun's shadows
  const sun = high && s.sun && s.sun.k > 0.02 ? s.sun : null;
  let sunMask = texNone;
  if (sun) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, fboSun);
    gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    if (drawCasters(() => [sun.ux, sun.uy, sun.len, 1], s.proj, ss)) sunMask = texSun;
  }

  // ---- the light buffer
  gl.bindFramebuffer(gl.FRAMEBUFFER, fboLight);
  gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
  let shadowed = 0;
  for (const L of s.lights) {
    if (L.x < -L.r || L.y < -L.r || L.x > w + L.r || L.y > h + L.r) continue;
    let mask = texNone;
    if (high && L.shadows && shadowed < 8 && L.fx != null) {
      // this light's shadows: every caster within its reach, stretched away from it, longer the farther it stands
      const lh = 26 + (L.fh ?? 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fboMask);
      gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
      const any = drawCasters((C) => {
        const dx = C.fx - L.fx, dy = C.fy - L.fy, d = Math.hypot(dx, dy);
        if (d > L.fr || d < 6) return null;
        return [dx / d, dy / d, Math.max(0.3, Math.min(2.4, d / lh)), 1];
      }, s.proj, ss);
      if (any) { shadowed++; mask = texMask; }
      gl.bindFramebuffer(gl.FRAMEBUFFER, fboLight);
      gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    }
    gl.useProgram(progLight.p);
    gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ONE, gl.ONE);
    gl.activeTexture(gl.TEXTURE6); gl.bindTexture(gl.TEXTURE_2D, mask);
    gl.uniform1i(progLight.u.uMask, 6);
    gl.uniform2f(progLight.u.uView, w, h); gl.uniform1f(progLight.u.uSS, ss);
    gl.uniform3f(progLight.u.uLight, L.x, L.y, L.r);
    gl.uniform3f(progLight.u.uColor, L.c[0], L.c[1], L.c[2]);
    gl.uniform1f(progLight.u.uPow, L.i);
    drawQuad(L.x - L.r, L.y - L.r, L.x + L.r, L.y + L.r);
  }

  // ---- everything together (into a texture first when there is bloom to add)
  gl.bindFramebuffer(gl.FRAMEBUFFER, bloom ? fboScene : null);
  gl.disable(gl.BLEND);
  layers.forEach((l, i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, layerTex[i]); });
  gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, addTex);
  const P = progMix;
  gl.useProgram(P.p);
  gl.uniform2f(P.u.uView, w, h); gl.uniform1f(P.u.uSS, ss);
  gl.uniform2f(P.u.uCam, s.cam[0], s.cam[1]);
  ["uGround", "uSprites", "uOver", "uAdd"].forEach((n, i) => gl.uniform1i(P.u[n], i));
  gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, texLitS); gl.uniform1i(P.u.uLitS, 4);
  gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D, texLitO); gl.uniform1i(P.u.uLitO, 5);
  gl.activeTexture(gl.TEXTURE7); gl.bindTexture(gl.TEXTURE_3D, texDark); gl.uniform1i(P.u.uDark, 7);
  gl.activeTexture(gl.TEXTURE8); gl.bindTexture(gl.TEXTURE_3D, texBright); gl.uniform1i(P.u.uBright, 8);
  gl.activeTexture(gl.TEXTURE9); gl.bindTexture(gl.TEXTURE_2D, sunMask); gl.uniform1i(P.u.uSun, 9);
  gl.uniform1f(P.u.uSunK, sun ? Math.min(1, sun.k * I) : 0);
  gl.uniform1f(P.u.uBloom, bloom ? 1 : 0);
  // the slider scales the darkness (in whole steps) as well as the lamps
  gl.uniform1f(P.u.uAmb, Math.round(s.amb.level * Math.min(1.25, I)));
  gl.uniform3f(P.u.uTint, ...s.amb.tint);
  gl.uniform1f(P.u.uTintK, Math.min(1, s.amb.tintK * I));
  gl.uniform1f(P.u.uGain, I * (s.amb.gain ?? 1));
  gl.uniform1f(P.u.uColorK, high ? 0.3 : 0.15);
  drawQuad(0, 0, w, h);
  if (!bloom) return;

  // ---- bloom: shrink what glows twice, blur each size both ways, then lay both over the picture
  const pass = (prog, src, dst, setup) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo); gl.viewport(0, 0, dst.w, dst.h);
    gl.useProgram(prog.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src); gl.uniform1i(prog.u.uTex, 0);
    gl.uniform2f(prog.u.uView, dst.w, dst.h);
    setup?.();
    // the quad is in the target's own pixels
    drawQuad(0, 0, dst.w, dst.h);
  };
  const [A0, A1, B0, B1] = bloomT;
  pass(progDown, texGlow, A0);
  pass(progBlur, A0.tex, A1, () => gl.uniform2f(progBlur.u.uDir, 1, 0));
  pass(progBlur, A1.tex, A0, () => gl.uniform2f(progBlur.u.uDir, 0, 1));
  pass(progDown, A0.tex, B0);
  pass(progBlur, B0.tex, B1, () => gl.uniform2f(progBlur.u.uDir, 1, 0));
  pass(progBlur, B1.tex, B0, () => gl.uniform2f(progBlur.u.uDir, 0, 1));
  gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, H);
  const C = progComp;
  gl.useProgram(C.p);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texScene); gl.uniform1i(C.u.uScene, 0);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, A0.tex); gl.uniform1i(C.u.uA, 1);
  gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, B0.tex); gl.uniform1i(C.u.uB, 2);
  gl.uniform2f(C.u.uView, w, h); gl.uniform1f(C.u.uSS, ss); gl.uniform2f(C.u.uCam, s.cam[0], s.cam[1]);
  gl.uniform2f(C.u.uK, 0.6, 0.75);
  drawQuad(0, 0, w, h);
}

/** Show or hide the lit canvas over the plain one, matching its on-screen size. */
export function showLight(on, cssW, cssH) {
  if (!glCanvas) return;
  glCanvas.style.display = on ? "block" : "none";
  if (on) { glCanvas.style.width = cssW + "px"; glCanvas.style.height = cssH + "px"; }
}
