// All sound is synthesized at run time with Web Audio, like the art: no audio files.
// - music: generative step sequencer, one track per mood (meadow, ruins, combat) plus short stings
// - ambience: wind, lapping water, campfire crackle, birds, drips in the ruins
// - sfx: footsteps by surface, blades, spells, dice, UI
const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
const hashf = (a, b, c) => { const s = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453; return s - Math.floor(s); };

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const DEFAULT_VOL = { master: 1, music: 0.5, ambience: 0.8, combat: 0.85, steps: 0.7, ui: 0.7, jingles: 0.8, world: 0.8 };
export const settings = { muted: store.get("brum.muted", false), vol: { ...DEFAULT_VOL, ...store.get("brum.vol", {}) } };
/** Every volume the player can set, in menu order; `sfx` marks the effect categories. */
export const SOUND_GROUPS = [
  { key: "master", label: "Volume geral" },
  { key: "music", label: "Música" },
  { key: "ambience", label: "Ambiente (vento, água, fogueira, pássaros)" },
  { key: "combat", label: "Golpes, magias e flechas", sfx: true },
  { key: "steps", label: "Passos", sfx: true },
  { key: "jingles", label: "Fanfarras (nível, vitória, missão, descanso)", sfx: true },
  { key: "ui", label: "Interface e dados", sfx: true },
  { key: "world", label: "Mundo (baús)", sfx: true },
];

let ctx = null, meter, master, musicBus, sfxBus, ambBus, verbIn, noiseBuf, brownBuf;
const buses = {};
// each bus has its own send into the shared reverb, at the bus's volume, so a muted category leaves no echo behind
const sends = new Map();
let OUT; // the bus the sound effect being built plays into (set by def)

/** Must be called from a user gesture (browsers keep audio locked until then). */
export function initAudio() {
  if (ctx) { ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.005; comp.release.value = 0.2;
  // a brick-wall limiter after the glue compressor: stacked hits must never clip
  const lim = ctx.createDynamicsCompressor();
  lim.threshold.value = -3; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.12;
  comp.connect(lim).connect(ctx.destination);
  meter = ctx.createAnalyser(); meter.fftSize = 2048; lim.connect(meter);
  const v = settings.vol;
  master = gainNode(settings.muted ? 0 : v.master, comp);
  musicBus = gainNode(v.music, master);
  sfxBus = gainNode(1, master);
  ambBus = gainNode(v.ambience, master);
  Object.assign(buses, { master, music: musicBus, ambience: ambBus });
  for (const g of SOUND_GROUPS) if (g.sfx) buses[g.key] = gainNode(v[g.key], sfxBus);
  OUT = buses.combat;
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  // brown noise (integrated white): the deep rumble of flames and explosions
  brownBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const b = brownBuf.getChannelData(0);
  let acc = 0, peak = 0;
  for (let i = 0; i < b.length; i++) { acc = (acc + 0.02 * (Math.random() * 2 - 1)) / 1.02; b[i] = acc; peak = Math.max(peak, Math.abs(acc)); }
  for (let i = 0; i < b.length; i++) b[i] /= peak;
  // a soft hall: decaying stereo noise as the impulse
  const verb = ctx.createConvolver(), len = ctx.sampleRate * 2.4, ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const ch = ir.getChannelData(c); for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3.2; }
  verb.buffer = ir;
  verbIn = gainNode(1, verb);
  for (const [k, bus] of Object.entries(buses)) if (k !== "master") sends.set(bus, gainNode(settings.vol[k], verbIn));
  verb.connect(gainNode(0.5, master));
  startAmbience();
  setInterval(schedule, 40);
}

/** For debugging from the console. */
export function audioState() {
  let peak = 0;
  if (meter) { const d = new Float32Array(meter.fftSize); meter.getFloatTimeDomainData(d); for (const v of d) peak = Math.max(peak, Math.abs(v)); }
  return { state: ctx?.state ?? "off", track: curName, time: ctx?.currentTime ?? 0, peak };
}

export function setVolume(kind, v) {
  settings.vol[kind] = v; store.set("brum.vol", settings.vol);
  if (!ctx) return;
  if (kind === "master") setMuted(settings.muted);
  else for (const n of [buses[kind], sends.get(buses[kind])]) n.gain.setTargetAtTime(v, ctx.currentTime, 0.05);
}
export function setMuted(m) {
  settings.muted = m; store.set("brum.muted", m);
  if (master) master.gain.setTargetAtTime(m ? 0 : settings.vol.master, ctx.currentTime, 0.05);
  return m;
}
export const toggleMute = () => setMuted(!settings.muted);
/** A short sample of a category, played when its slider is let go. */
export function previewSound(kind) {
  const p = { combat: () => { sfx.swing(); setTimeout(() => sfx.hit(false), 220); }, steps: () => [0, 260, 520].forEach((d) => setTimeout(() => sfx.step("grass"), d)),
    jingles: () => sfx.levelUp(), ui: () => sfx.success(false), world: () => sfx.chest(), master: () => sfx.turn() }[kind];
  p?.();
}

// ---------------------------------------------------------------- building blocks
function gainNode(v, out) { const g = ctx.createGain(); g.gain.value = v; if (out) g.connect(out); return g; }
/** A voice's output: a gain into `out`, with an optional send to the reverb. */
function voice(out, wet = 0) {
  const g = ctx.createGain(); g.gain.value = 0; g.connect(out);
  if (wet) g.connect(gainNode(wet, sends.get(out) ?? verbIn));
  return g;
}
function osc(type, f, t, end, out) {
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
  o.connect(out); o.start(t); o.stop(end); return o;
}
function filt(type, f, q, out) { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; b.connect(out); return b; }
/** Percussive envelope: fast attack then exponential decay. */
function perc(g, t, peak, decay, attack = 0.004) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}
/** Filtered noise burst; f2 sweeps the filter. */
function noise(t, dur, vel, { type = "bandpass", f = 1000, f2 = null, q = 1, out = OUT, wet = 0, attack = 0.003 } = {}) {
  const src = ctx.createBufferSource(); src.buffer = noiseBuf;
  const g = voice(out, wet), b = filt(type, f, q, g);
  if (f2) b.frequency.exponentialRampToValueAtTime(f2, t + dur);
  src.connect(b);
  perc(g, t, vel, dur, attack);
  src.start(t, Math.random() * 1.5); src.stop(t + dur + attack + 0.05);
}
/** Pitched blip with a pitch sweep. */
function tone(t, type, f, f2, dur, vel, { out = OUT, wet = 0, lp = 0, attack = 0.004 } = {}) {
  const g = voice(out, wet);
  const o = osc(type, f, t, t + dur + attack + 0.05, lp ? filt("lowpass", lp, 0.7, g) : g);
  if (f2 && f2 !== f) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  perc(g, t, vel, dur, attack);
}

/** Struck metal: inharmonic sine partials, each ringing for its own time (modal synthesis). */
function metal(t, freqs, decays, vel, { out = OUT, wet = 0.3 } = {}) {
  freqs.forEach((f, i) => {
    const g = voice(out, wet), a = vel / (1 + i * 0.35);
    osc("sine", f, t, t + decays[i] + 0.1, g);
    osc("sine", f * 1.0013, t, t + decays[i] + 0.1, gainNode(0.6, g)); // a slow beat makes it shimmer
    perc(g, t, a, decays[i], 0.001);
  });
}
/** Air pushed by something moving fast: band-passed noise sweeping up then down, loudest past the middle. */
function whoosh(t, dur, vel, f0, fPeak, f1, { q = 2.5, out = OUT, wet = 0.1, buf = noiseBuf } = {}) {
  const src = ctx.createBufferSource(); src.buffer = buf;
  const g = voice(out, wet), b2 = filt("bandpass", f0, q * 0.6, g), b = filt("bandpass", f0, q, b2);
  const mid = t + dur * 0.55;
  for (const x of [b, b2]) { x.frequency.setValueAtTime(f0, t); x.frequency.exponentialRampToValueAtTime(fPeak, mid); x.frequency.exponentialRampToValueAtTime(f1, t + dur); }
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vel * 5, mid); // the two narrow band-passes eat most of the energy
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(b); src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.05);
}
/** Scattered tiny clicks: fire crackle, gravel, embers. */
function crackles(t, dur, perSec, vel, { out = OUT, fade = 1.5, fLo = 1800, fHi = 7000 } = {}) {
  const n = Math.round(dur * perSec);
  for (let i = 0; i < n; i++) {
    const x = Math.random(), tt = t + x * dur;
    noise(tt, 0.002 + Math.random() * 0.012, vel * (0.3 + Math.random() * 0.7) * (1 - x) ** fade, { type: "highpass", f: fLo + Math.random() * (fHi - fLo), out, attack: 0.0008 });
  }
}
/** Flame body: brown noise through a moving low-pass, with an irregular flicker in its loudness. */
function roar(t, dur, vel, { f0 = 400, f1 = 1500, attack = 0.06, out = OUT, wet = 0.15 } = {}) {
  const src = ctx.createBufferSource(); src.buffer = brownBuf;
  const env = voice(out, wet), flick = gainNode(0.65, env), lp = filt("lowpass", f0, 0.9, flick);
  lp.frequency.setValueAtTime(f0, t); lp.frequency.exponentialRampToValueAtTime(f1, t + Math.min(dur, attack * 3 + 0.1));
  lp.frequency.exponentialRampToValueAtTime(f0 * 0.7, t + dur);
  // flicker: slow noise wobbling the gain
  const mod = ctx.createBufferSource(); mod.buffer = noiseBuf;
  const mlp = filt("lowpass", 14, 0.5, gainNode(1.6, flick.gain));
  mod.connect(mlp);
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(vel, t + attack);
  env.gain.exponentialRampToValueAtTime(vel * 0.6, t + attack + (dur - attack) * 0.5);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(lp);
  const off = Math.random() * 1.5;
  src.start(t, off); src.stop(t + dur + 0.05); mod.start(t, off); mod.stop(t + dur + 0.05);
}
/** Something heavy landing: a low sine drop plus a muffled rumble. */
function thud(t, vel, pitch = 1) {
  tone(t, "sine", 150 * pitch, 50 * pitch, 0.14, vel);
  const src = ctx.createBufferSource(); src.buffer = brownBuf;
  const g = voice(OUT), lp = filt("lowpass", 380 * pitch, 0.7, g);
  src.connect(lp); perc(g, t, vel * 0.8, 0.12, 0.002);
  src.start(t, Math.random()); src.stop(t + 0.2);
}

// ---------------------------------------------------------------- instruments
const I = {
  pluck(t, m, dur, vel, out) { // lute / harp: bright attack, filter closes fast
    const f = mtof(m), g = voice(out, 0.35), lp = filt("lowpass", f * 6, 1, g);
    lp.frequency.setValueAtTime(Math.min(9000, f * 8), t);
    lp.frequency.exponentialRampToValueAtTime(f * 1.5, t + 0.35);
    osc("triangle", f, t, t + dur + 1, lp);
    osc("sawtooth", f * 1.004, t, t + dur + 1, gainNode(0.35, lp));
    perc(g, t, vel * 0.32, dur * 0.6 + 0.6, 0.003);
  },
  pad(t, notes, dur, vel, out, cut = 900) { // warm strings bed
    const g = voice(out, 0.6), lp = filt("lowpass", cut, 0.4, g);
    for (const m of notes) for (const det of [-7, 7]) { const o = osc("sawtooth", mtof(m), t, t + dur + 1.6, lp); o.detune.value = det; }
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel * 0.06, t + Math.min(0.9, dur * 0.4));
    g.gain.setValueAtTime(vel * 0.06, t + dur);
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 1.4);
  },
  flute(t, m, dur, vel, out) { // breathy sine lead with delayed vibrato
    const f = mtof(m), g = voice(out, 0.5);
    const o = osc("sine", f, t, t + dur + 0.3, g), o2 = osc("triangle", f * 2, t, t + dur + 0.3, gainNode(0.08, g));
    const depth = ctx.createGain();
    depth.gain.setValueAtTime(0, t); depth.gain.linearRampToValueAtTime(f * 0.006, t + Math.min(0.5, dur));
    osc("sine", 5.2, t, t + dur + 0.3, depth);
    depth.connect(o.frequency); depth.connect(o2.frequency);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel * 0.16, t + 0.07);
    g.gain.setValueAtTime(vel * 0.14, t + Math.max(0.08, dur - 0.05));
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.18);
    noise(t, 0.12, vel * 0.03, { f: f * 2, q: 2, out, attack: 0.03 });
  },
  horn(t, m, dur, vel, out) { // brassy lead: filter swells open
    const f = mtof(m), g = voice(out, 0.45), lp = filt("lowpass", 500, 1.2, g);
    lp.frequency.setValueAtTime(400, t);
    lp.frequency.linearRampToValueAtTime(2200 * vel + 600, t + 0.07);
    lp.frequency.setTargetAtTime(1100, t + 0.1, 0.25);
    for (const det of [-5, 5]) { const o = osc("sawtooth", f, t, t + dur + 0.4, lp); o.detune.value = det; }
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel * 0.13, t + 0.05);
    g.gain.setValueAtTime(vel * 0.11, t + Math.max(0.06, dur - 0.05));
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.25);
  },
  bass(t, m, dur, vel, out) {
    const f = mtof(m), g = voice(out, 0.05), lp = filt("lowpass", f * 4, 0.8, g);
    osc("triangle", f, t, t + dur + 0.5, lp); osc("sine", f / 2, t, t + dur + 0.5, gainNode(0.6, lp));
    perc(g, t, vel * 0.45, dur + 0.2, 0.008);
  },
  drum(t, vel, pitch = 1, out) { // taiko-ish
    const g = voice(out, 0.25), o = osc("sine", 150 * pitch, t, t + 0.8, g);
    o.frequency.exponentialRampToValueAtTime(42 * pitch, t + 0.22);
    perc(g, t, vel * 0.9, 0.55);
    noise(t, 0.08, vel * 0.35, { type: "lowpass", f: 900 * pitch, out });
  },
  rim(t, vel, out) { noise(t, 0.05, vel * 0.3, { f: 2600, q: 3, out, wet: 0.2 }); },
  hat(t, vel, out) { noise(t, 0.03, vel * 0.12, { type: "highpass", f: 7000, out }); },
  bell(t, m, vel, out, wet = 0.6) { // inharmonic partials, long ring
    const f = mtof(m);
    [[1, 1, 1.6], [2.76, 0.4, 0.8], [5.4, 0.2, 0.4], [8.9, 0.08, 0.2]].forEach(([r, a, d]) => tone(t, "sine", f * r, null, d, vel * 0.2 * a, { out, wet, attack: 0.002 }));
  },
};

// ---------------------------------------------------------------- music
const PC = { D: [2, 6, 9], Bm: [11, 2, 6], G: [7, 11, 2], A: [9, 1, 4], Fsm: [6, 9, 1], Am: [9, 0, 4], F: [5, 9, 0], Dm: [2, 5, 9], E: [4, 8, 11], Bb: [10, 2, 5], C: [0, 4, 7], Gm: [7, 10, 2] };
/** Chord tones placed in the first octave at or above `low`, in rising order. */
const voicing = (pcs, low) => pcs.map((p) => low + ((p - low) % 12 + 12) % 12).sort((a, b) => a - b);
const rootAt = (pcs, low) => low + ((pcs[0] - low) % 12 + 12) % 12;

// melodies: per bar, [step, midi, length in 16ths]
const MEADOW_MEL = [
  [[0, 74, 6], [6, 73, 2], [8, 71, 4], [12, 69, 4]], [[0, 66, 8], [8, 69, 4], [12, 71, 4]],
  [[0, 74, 4], [4, 76, 4], [8, 78, 6], [14, 76, 2]], [[0, 73, 12]],
  [[0, 78, 6], [6, 76, 2], [8, 74, 4], [12, 73, 4]], [[0, 73, 4], [4, 69, 4], [8, 66, 8]],
  [[0, 67, 4], [4, 71, 4], [8, 74, 4], [12, 76, 4]], [[0, 76, 8], [8, 73, 8]],
];
const COMBAT_MEL = [
  [[0, 74, 4], [4, 77, 4], [8, 81, 6], [14, 79, 2]], [[0, 79, 6], [6, 77, 2], [8, 74, 8]],
  [[0, 74, 4], [4, 77, 4], [8, 82, 4], [12, 81, 4]], [[0, 81, 8], [8, 76, 4], [12, 73, 4]],
];
const playMel = (mel, bar, s, sp, play) => { for (const [st, m, len] of mel[bar] ?? []) if (st === s) play(m, len * sp); };

const TRACKS = {
  meadow: {
    bpm: 84, bars: 8, prog: ["D", "Bm", "G", "A", "D", "Fsm", "G", "A"],
    step(bar, s, t, loop, out, sp) {
      const ch = PC[this.prog[bar]];
      if (s === 0) { I.pad(t, voicing(ch, 54), sp * 16, 0.9, out, 1100); I.bass(t, rootAt(ch, 38), sp * 6, 0.8, out); }
      if (s === 8) I.bass(t, rootAt(ch, 38) + (bar % 2 ? 7 : 0), sp * 6, 0.6, out);
      if (s % 2 === 0) {
        const v = voicing(ch, 62), notes = [v[0], v[1], v[2], v[0] + 12];
        const idx = [0, 1, 2, 1, 3, 2, 1, 2][s / 2];
        I.pluck(t, notes[idx], sp * 2, s % 8 === 0 ? 0.75 : 0.5, out);
      }
      if (loop % 2 === 0) playMel(MEADOW_MEL, bar, s, sp, (m, d) => I.flute(t, m, d, 0.9, out));
      else if (s === 4 && bar % 2 === 1) I.bell(t, voicing(ch, 74)[1], 0.35, out);
    },
  },
  ruins: {
    bpm: 62, bars: 4, prog: ["Am", "F", "Dm", "E"],
    step(bar, s, t, loop, out, sp) {
      const ch = PC[this.prog[bar]];
      if (s === 0) { I.pad(t, [...voicing(ch, 45), 33], sp * 16, 1, out, 520); if (bar % 2 === 0) I.drum(t, 0.4, 0.55, out); }
      if (s % 2 === 0 && hashf(loop, bar, s) < 0.32) {
        const scale = [57, 60, 62, 64, 67, 69, 72, 74];
        I.pluck(t, scale[(hashf(s, loop, bar) * scale.length) | 0], sp * 3, 0.45, out);
      }
      if (bar === 3 && s === 8) I.flute(t, 68, sp * 8, 0.45, out); // the raised 7th, unresolved
      if (bar === 1 && s === 10 && loop % 2) I.bell(t, 81, 0.25, out);
    },
  },
  dream: { // dreamed Velmoor and the Relicário: a slow bed, far bells, a flute that never resolves
    bpm: 50, bars: 4, prog: ["F", "C", "Dm", "Bb"],
    step(bar, s, t, loop, out, sp) {
      const ch = PC[this.prog[bar]];
      if (s === 0) I.pad(t, [...voicing(ch, 53), rootAt(ch, 41)], sp * 16, 0.8, out, 700);
      if (s === 0 && bar % 2 === 0) I.bell(t, voicing(ch, 77)[0], 0.3, out, 0.9);
      if (s === 8 && hashf(loop, bar, 3) < 0.6) I.bell(t, voicing(ch, 72)[(hashf(bar, loop, 1) * 3) | 0], 0.18, out, 0.9);
      if (bar === 2 && s === 4 && loop % 2 === 0) I.flute(t, 69, sp * 10, 0.35, out);
      if (bar === 3 && s === 6 && loop % 2 === 1) I.flute(t, 67, sp * 8, 0.3, out);
    },
  },
  combat: {
    bpm: 128, bars: 8, prog: ["Dm", "Dm", "Bb", "C", "Dm", "Gm", "Bb", "A"],
    step(bar, s, t, loop, out, sp) {
      const ch = PC[this.prog[bar]], r = rootAt(ch, 38);
      if ([0, 6, 8, 14].includes(s)) I.drum(t, s === 0 ? 1 : 0.7, 1, out);
      if (s === 3 || s === 11) I.drum(t, 0.45, 1.6, out);
      if (s === 4 || s === 12) I.rim(t, 0.9, out);
      if (s % 2 === 1) I.hat(t, 0.8, out);
      if (s % 2 === 0) I.bass(t, [r, r, r + 12, r, r, r + 7, r + 12, r][s / 2], sp * 1.6, 0.75, out);
      if (s === 0) I.pad(t, voicing(ch, 50), sp * 16, 0.7, out, 800);
      const v = voicing(ch, 62);
      I.pluck(t, [v[0], v[1], v[2], v[1]][s % 4], sp, 0.28, out);
      if (bar >= 4) playMel(COMBAT_MEL, bar - 4, s, sp, (m, d) => I.horn(t, m, d, 0.9, out));
      else if (loop % 2 === 1) playMel(COMBAT_MEL, bar, s, sp, (m, d) => I.horn(t, m - 12, d, 0.6, out));
    },
  },
};

let cur = null, curName = null, curGain = null, nextT = 0, stepN = 0;
/** Crossfade to a track by name ("meadow", "ruins", "combat"), or null for silence. */
export function playMusic(name, fade = 1.2) {
  if (!ctx || name === curName) return;
  curName = name;
  const now = ctx.currentTime;
  if (curGain) {
    const g = curGain, sg = sends.get(g);
    for (const n of [g, sg]) { n.gain.cancelScheduledValues(now); n.gain.setTargetAtTime(0, now, fade / 3); }
    setTimeout(() => { g.disconnect(); sg.disconnect(); sends.delete(g); }, fade * 1000 + 4000);
  }
  cur = TRACKS[name] ?? null; curGain = null;
  if (!cur) return;
  curGain = gainNode(0, musicBus);
  sends.set(curGain, gainNode(0, sends.get(musicBus)));
  for (const n of [curGain, sends.get(curGain)]) n.gain.setTargetAtTime(1, now + 0.05, fade / 3);
  nextT = now + 0.08; stepN = 0;
}
function schedule() {
  if (!cur || !curGain) return;
  const sp = 60 / cur.bpm / 4, now = ctx.currentTime;
  if (nextT < now - 0.2) nextT = now + 0.05; // tab was asleep: skip ahead rather than burst
  while (nextT < now + 0.3) {
    const s = stepN % 16, bar = ((stepN / 16) | 0) % cur.bars, loop = (stepN / (16 * cur.bars)) | 0;
    cur.step(bar, s, nextT, loop, curGain, sp);
    nextT += sp; stepN++;
  }
}
/** Duck the music for a moment (under a sting or a big moment). */
function duck(amount, secs) {
  const t = ctx.currentTime;
  for (const n of [musicBus, sends.get(musicBus)]) {
    n.gain.cancelScheduledValues(t);
    n.gain.setTargetAtTime(settings.vol.music * amount, t, 0.08);
    n.gain.setTargetAtTime(settings.vol.music, t + secs, 0.6);
  }
}

// ---------------------------------------------------------------- ambience
let amb = null;
function loopNoise(type, f, q) {
  const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  const g = gainNode(0, ambBus), b = filt(type, f, q, g);
  src.connect(b); src.start();
  return { g, b };
}
function startAmbience() {
  amb = { wind: loopNoise("bandpass", 420, 0.6), water: loopNoise("lowpass", 520, 0.7), birdT: 2, dripT: 3 };
}
/** levels: { wind, water, fire, birds, ruins } in 0..1; call every frame. */
export function updateAmbience(lv, dt, time) {
  if (!ctx || !amb) return;
  const t = ctx.currentTime;
  amb.wind.g.gain.setTargetAtTime(lv.wind * (0.05 + 0.03 * Math.sin(time * 0.31) + 0.02 * Math.sin(time * 0.83)), t, 0.4);
  amb.wind.b.frequency.setTargetAtTime(380 + 160 * Math.sin(time * 0.23) + (lv.ruins ? -120 : 0), t, 0.5);
  amb.water.g.gain.setTargetAtTime(lv.water * (0.09 + 0.06 * Math.max(0, Math.sin(time * 1.7))), t, 0.15);
  if (settings.muted) return;
  if (lv.fire > 0.02 && Math.random() < lv.fire * dt * 16) {
    noise(t, 0.012 + Math.random() * 0.03, lv.fire * (0.08 + Math.random() * 0.18), { type: "highpass", f: 1500 + Math.random() * 3000, out: ambBus });
    if (Math.random() < 0.1) noise(t, 0.25, lv.fire * 0.05, { type: "lowpass", f: 500, out: ambBus, attack: 0.05 });
  }
  if (lv.birds > 0.05 && (amb.birdT -= dt) < 0) {
    amb.birdT = 2 + Math.random() * 6;
    const base = 2200 + Math.random() * 1600, n = 2 + ((Math.random() * 4) | 0), kind = Math.random();
    for (let i = 0; i < n; i++) {
      const tt = t + i * (0.09 + kind * 0.08);
      tone(tt, "sine", base * (kind < 0.5 ? 1 : 1.25), base * (kind < 0.5 ? 1.35 : 0.85), 0.07, lv.birds * 0.05, { out: ambBus, wet: 0.4, attack: 0.01 });
    }
  }
  if (lv.ruins > 0.05 && (amb.dripT -= dt) < 0) {
    amb.dripT = 1.5 + Math.random() * 4;
    tone(t, "sine", 1400 + Math.random() * 900, 700, 0.06, lv.ruins * 0.05, { out: ambBus, wet: 0.9 });
  }
}

// ---------------------------------------------------------------- sound effects
export const sfx = {};
/** Define a sound effect in a volume category (null: play into whatever bus is current). */
function def(name, cat, fn) {
  sfx[name] = (...a) => {
    if (!ctx || settings.muted) return;
    const prev = OUT;
    if (cat) OUT = buses[cat];
    try { fn(ctx.currentTime, ...a); } catch (e) { console.warn("sfx", name, e); } finally { OUT = prev; }
  };
}
const jit = (v, j = 0.12) => v * (1 + (Math.random() * 2 - 1) * j);

const shuffle = (a, k = 0.04) => a.map((f) => jit(f, k));

def("step", "steps", (t, surface, vol = 1) => {
  const v = 0.6 * vol;
  if (surface === "wood") { // hollow plank knock
    metal(t, shuffle([205, 470, 760]), [0.09, 0.05, 0.035], v * 0.16, { wet: 0.05 });
    noise(t, 0.015, v * 0.15, { type: "lowpass", f: 1500 });
  } else if (surface === "stone") { // hard heel click and a scuff
    noise(t, 0.006, v * 0.3, { type: "highpass", f: 3200, attack: 0.0008 });
    noise(t + 0.008, 0.04, v * 0.12, { f: jit(1900), q: 1.2 });
    tone(t, "sine", jit(280), 180, 0.03, v * 0.08);
  } else if (surface === "dirt") { // soft thump and a crumble of grit
    noise(t, 0.05, v * 0.6, { type: "lowpass", f: jit(700) });
    crackles(t + 0.005, 0.05, 140, v * 0.2, { fLo: 1500, fHi: 4500 });
  } else if (surface === "water") {
    whoosh(t, 0.16, v * 0.18, 700, 2400, 900, { q: 1 });
    for (let i = 0; i < 2; i++) sfx.bubble(t + 0.04 + i * 0.05, v * 0.4);
  } else { // grass: heel then toe, a dry rustle
    for (const [d, a] of [[0, 1], [0.035, 0.6]]) noise(t + d, 0.045, v * 0.4 * a, { f: jit(3600, 0.2), q: 0.7, attack: 0.006 });
    tone(t, "sine", 95, 70, 0.025, v * 0.2);
  }
});
def("bubble", null, (t0, t, vel = 1) => { // a single rising bubble "blip"
  const f = 250 + Math.random() * 450, g = voice(OUT, 0.1), o = osc("sine", f, t, t + 0.09, g);
  o.frequency.exponentialRampToValueAtTime(f * 2.4, t + 0.035);
  perc(g, t, 0.25 * vel, 0.05, 0.002);
});
def("swing", "combat", (t, big = false) => { // blade cutting air, then a faint ring of steel
  whoosh(t, big ? 0.3 : 0.2, big ? 0.6 : 0.5, 450, big ? 1700 : 2300, 800);
  if (big) whoosh(t + 0.12, 0.26, 0.45, 500, 1900, 700);
  metal(t + 0.03, shuffle([3150, 4720, 6380, 8150]), [0.32, 0.25, 0.18, 0.12], 0.035, { wet: 0.5 });
});
def("hit", "combat", (t, crit = false, kind = "blade") => {
  if (kind === "blade") {
    noise(t, 0.008, 0.35, { type: "highpass", f: 2500, attack: 0.0008 });     // edge contact
    noise(t + 0.004, 0.07, 0.3, { f: 1600, f2: 600, q: 1.2 });                // the cut
    metal(t, shuffle([1870, 2740, 3910, 5230]), [0.22, 0.17, 0.12, 0.08], 0.05);
    thud(t, 0.35);
  } else thud(t, 0.25, 1.2);
  if (crit) { // a heavy clang and a boom
    metal(t, shuffle([523, 1287, 2011, 2896, 3870, 5100]), [1.1, 0.85, 0.6, 0.45, 0.3, 0.2], 0.12, { wet: 0.45 });
    thud(t, 0.45, 0.6);
    I.drum(t, 0.4, 0.7, OUT);
  }
});
def("miss", "combat", (t) => whoosh(t, 0.14, 0.14, 1200, 3200, 1600, { q: 3 }));

// projectiles by kind: fire (Lyra), ember (the shaman's foul flame), arcane (missiles), arrow
def("cast", "combat", (t, kind) => {
  if (kind === "fire") { // ignition "fwoomp", then the ball roaring as it flies
    whoosh(t, 0.28, 0.35, 250, 1300, 600, { q: 0.9, buf: brownBuf });
    roar(t, 0.65, 1.0, { f0: 300, f1: 2600, attack: 0.07 });
    crackles(t + 0.05, 0.6, 45, 0.18);
    tone(t, "sine", 60, 95, 0.18, 0.25);
  } else if (kind === "ember") { // darker, wetter: low roar with a sizzling hiss
    roar(t, 0.6, 0.85, { f0: 180, f1: 1100, attack: 0.12 });
    noise(t, 0.55, 0.07, { type: "highpass", f: 5000, attack: 0.2 });
    crackles(t + 0.1, 0.5, 25, 0.12, { fLo: 1200, fHi: 3500 });
  } else if (kind === "arcane") { // glassy chirp rising, with a fast shimmer
    const g = voice(OUT, 0.5), trem = gainNode(0.5, g);
    const lfo = osc("sine", 28, t, t + 0.3, gainNode(0.5, trem.gain));
    for (const r of [1, 1.5, 2.01]) { const o = osc("sine", 700 * r, t, t + 0.3, trem); o.frequency.exponentialRampToValueAtTime(1900 * r, t + 0.18); }
    perc(g, t, 0.25, 0.22, 0.01);
    whoosh(t, 0.22, 0.12, 2000, 6000, 3000, { q: 2 });
    void lfo;
  } else if (kind === "arrow") { // release: string twang, slap on the bracer, fletching fluttering away
    const g = voice(OUT, 0.08), lp = filt("lowpass", 2600, 3, g);
    for (const [r, a] of [[1, 1], [2, 0.45], [3.01, 0.2]]) { const o = osc("sawtooth", 142 * r, t, t + 0.3, gainNode(a, lp)); o.frequency.exponentialRampToValueAtTime(122 * r, t + 0.2); }
    lp.frequency.exponentialRampToValueAtTime(350, t + 0.18);
    perc(g, t, 0.3, 0.2, 0.001);
    noise(t, 0.012, 0.3, { type: "highpass", f: 2400, attack: 0.0008 });
    noise(t + 0.004, 0.03, 0.25, { f: 1100, q: 1.5 });
    const fg = voice(OUT), fl = filt("bandpass", 1700, 2.2, fg), src = ctx.createBufferSource(); src.buffer = noiseBuf;
    const flut = gainNode(0.5, fl); src.connect(flut);
    osc("square", 34, t, t + 0.45, gainNode(0.5, flut.gain)); // feathers chopping the air
    fl.frequency.exponentialRampToValueAtTime(1200, t + 0.4);
    fg.gain.setValueAtTime(0.0001, t + 0.03); fg.gain.exponentialRampToValueAtTime(0.25, t + 0.08); fg.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
    src.start(t, Math.random()); src.stop(t + 0.45);
  }
});
def("bowDraw", "combat", (t, dur = 0.5) => {
  // the limbs bending: a stick-slip creak rising in pitch as the string tightens, over a low wooden groan
  const g = voice(OUT, 0.12), bp = filt("bandpass", 1500, 6, g), bp2 = filt("bandpass", 2700, 8, g);
  const o = osc("sawtooth", 55, t, t + dur + 0.1, bp); o.connect(bp2);
  const n = 32, curve = new Float32Array(n).map((_, i) => 48 + 85 * (i / n) ** 1.4 + (Math.random() - 0.5) * 30);
  o.frequency.setValueCurveAtTime(curve, t, dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.09, t + 0.08); g.gain.linearRampToValueAtTime(0.22, t + dur * 0.9); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.04);
  const wg = voice(OUT), wl = filt("lowpass", 420, 1.5, wg), wo = osc("triangle", 85, t, t + dur + 0.1, wl);
  wo.frequency.linearRampToValueAtTime(125, t + dur);
  wg.gain.setValueAtTime(0.0001, t); wg.gain.linearRampToValueAtTime(0.12, t + dur * 0.8); wg.gain.linearRampToValueAtTime(0.0001, t + dur + 0.05);
  noise(t + 0.02, 0.06, 0.12, { f: 2200, q: 1.5 }); // arrow nocked against the grip
  noise(t, dur, 0.05, { type: "highpass", f: 5000, attack: dur * 0.8 }); // string stretching
});
def("impact", "combat", (t, kind) => {
  if (kind === "fire" || kind === "ember") { // a flame burst: crack, boom, roar dying into crackle
    const big = kind === "fire";
    noise(t, 0.012, 0.5, { type: "highpass", f: 2000, attack: 0.0008 });
    const src = ctx.createBufferSource(); src.buffer = brownBuf;
    const g = voice(OUT, 0.35), lp = filt("lowpass", big ? 4500 : 2500, 0.8, g);
    lp.frequency.exponentialRampToValueAtTime(220, t + 0.7);
    src.connect(lp); perc(g, t, big ? 0.5 : 0.38, 0.75, 0.003);
    src.start(t, Math.random()); src.stop(t + 0.85);
    tone(t, "sine", 95, 32, 0.4, big ? 0.4 : 0.3);
    roar(t + 0.05, 0.9, big ? 0.25 : 0.18, { f0: 500, f1: 900, attack: 0.05 });
    crackles(t + 0.03, 1.0, big ? 70 : 40, 0.22, { fade: 2 });
    if (!big) noise(t + 0.05, 0.8, 0.06, { type: "highpass", f: 4500, attack: 0.05 }); // sizzle
  } else if (kind === "arcane") { // a bright pop of sparks
    metal(t, shuffle([2350, 3520, 4890, 6610], 0.08), [0.3, 0.22, 0.15, 0.1], 0.13, { wet: 0.6 });
    noise(t, 0.05, 0.45, { type: "highpass", f: 3500 });
    tone(t, "sine", 900, 220, 0.12, 0.4);
  } else if (kind === "arrow") { // thunk into wood or hide
    noise(t, 0.03, 0.8, { type: "lowpass", f: 1100 });
    tone(t, "triangle", 230, 95, 0.06, 0.5);
    const g = voice(OUT), o = osc("triangle", 180, t, t + 0.25, g); // shaft quiver
    const lfo = osc("sine", 38, t, t + 0.25, gainNode(25, o.frequency)); void lfo;
    perc(g, t + 0.01, 0.12, 0.18, 0.004);
  }
});
def("heal", "combat", (t) => { [72, 76, 79, 84].forEach((m, i) => I.bell(t + i * 0.07, m, 0.7, OUT)); noise(t, 0.8, 0.04, { type: "highpass", f: 6000, attack: 0.3, wet: 0.6 }); });
def("potion", "combat", (t) => {
  // cork pop, a few glugs of bubbling liquid, a swallow, then the healing chime
  noise(t, 0.012, 0.35, { f: 900, q: 2, attack: 0.0008 }); tone(t, "sine", 520, 170, 0.03, 0.3);
  for (let i = 0; i < 7; i++) sfx.bubble(t + 0.12 + i * (0.045 + Math.random() * 0.04), 1.4);
  for (const d of [0.5, 0.72]) tone(t + d, "sine", 170, 85, 0.09, 0.3);
  setTimeout(() => sfx.heal(), 650);
});
def("breath", "combat", (t) => { noise(t, 0.6, 0.18, { f: 450, f2: 900, q: 0.8, attack: 0.25 }); I.bell(t + 0.35, 74, 0.5, OUT); });
def("enemyDown", "combat", (t) => { // a goblin croak, the body falling, a puff of smoke
  const g = voice(OUT, 0.2), bp = filt("bandpass", 950, 2.5, g), o = osc("sawtooth", 430, t, t + 0.45, bp);
  o.frequency.exponentialRampToValueAtTime(130, t + 0.38);
  osc("sine", 31, t, t + 0.45, gainNode(40, o.frequency)); // rasp
  perc(g, t, 0.5, 0.38, 0.02);
  thud(t + 0.3, 0.7, 0.8);
  whoosh(t + 0.28, 0.35, 0.12, 400, 1200, 500, { q: 1 });
});
def("partyDown", "combat", (t) => {
  thud(t + 0.1, 0.65, 0.7);
  metal(t + 0.12, shuffle([1650, 2470, 3600]), [0.2, 0.14, 0.1], 0.04); // gear rattling
  I.bell(t + 0.05, 50, 0.8, OUT);
});
def("combatStart", "jingles", (t) => { duck(0.2, 1.2); I.drum(t, 1, 0.7, OUT); I.drum(t + 0.18, 0.8, 0.7, OUT); I.horn(t + 0.05, 50, 0.7, 1, OUT); I.horn(t + 0.05, 57, 0.7, 0.9, OUT); I.horn(t + 0.05, 62, 0.7, 0.7, OUT); });
def("turn", "ui", (t) => I.bell(t, 81, 0.45, OUT, 0.3));
def("select", "ui", (t) => tone(t, "triangle", 1100, 1300, 0.04, 0.08));
def("click", "ui", (t) => tone(t, "triangle", 640, 520, 0.04, 0.1));
def("dieTick", "ui", (t) => { noise(t, 0.02, jit(0.4, 0.4), { f: jit(3200, 0.3), q: 3 }); tone(t, "sine", jit(1600, 0.3), null, 0.015, 0.04); });
def("success", "ui", (t, crit) => { [76, 83, 88].forEach((m, i) => I.bell(t + i * 0.06, m, 0.8, OUT)); if (crit) I.horn(t, 74, 0.8, 0.8, OUT); });
def("fail", "ui", (t) => { tone(t, "triangle", 220, 170, 0.45, 0.2, { lp: 900 }); tone(t, "triangle", 233, 180, 0.45, 0.14, { lp: 900 }); });
def("chest", "world", (t) => {
  // hinge creak: a buzzing stick-slip, then the lid knocking back and coins clinking
  const g = voice(OUT, 0.15), bp = filt("bandpass", 1100, 5, g), o = osc("sawtooth", 50, t, t + 0.5, bp);
  const curve = new Float32Array(24).map((_, i) => 38 + 30 * Math.sin(i * 0.7) + Math.random() * 25);
  o.frequency.setValueCurveAtTime(curve, t, 0.42);
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.16, t + 0.06); g.gain.linearRampToValueAtTime(0.0001, t + 0.44);
  metal(t + 0.45, shuffle([190, 430, 720]), [0.12, 0.07, 0.05], 0.3, { wet: 0.1 });
  noise(t + 0.45, 0.03, 0.25, { type: "lowpass", f: 1200 });
  for (let i = 0; i < 6; i++) {
    const tt = t + 0.6 + i * 0.07 + Math.random() * 0.05, b = 3000 + Math.random() * 1800;
    metal(tt, [b, b * 1.48, b * 2.21, b * 2.93], [0.3, 0.22, 0.15, 0.1], 0.07, { wet: 0.25 });
  }
});
def("talk", "ui", (t) => I.pluck(t, 69, 0.2, 0.4, OUT));
def("bells", "world", (t) => { [[0, 74, 0.35], [0.9, 69, 0.25], [1.7, 77, 0.2], [3.1, 72, 0.18]].forEach(([d, m, v]) => I.bell(t + d, m, v, OUT, 0.95)); });
def("rest", "jingles", (t) => { duck(0.3, 2.5); [62, 66, 69, 74].forEach((m, i) => I.bell(t + i * 0.18, m, 0.7, OUT)); I.pad(t, [50, 57, 62, 66], 1.6, 1.2, OUT, 1400); });
def("victory", "jingles", (t) => {
  duck(0.05, 3.2);
  [[0, 62], [0.14, 66], [0.28, 69]].forEach(([d, m]) => I.horn(t + d, m, 0.16, 1, OUT));
  I.horn(t + 0.42, 74, 1.4, 1, OUT); I.horn(t + 0.42, 66, 1.4, 0.7, OUT);
  I.drum(t + 0.42, 0.9, 0.8, OUT);
  I.pad(t + 0.42, [50, 57, 62, 66], 1.6, 1.4, OUT, 1600);
});
def("defeat", "jingles", (t) => { duck(0, 6); I.pad(t, [38, 50, 53, 57], 3.5, 1.6, OUT, 700); [62, 60, 57, 53].forEach((m, i) => I.flute(t + 0.3 + i * 0.55, m, 0.5, 0.8, OUT)); I.bell(t + 2.6, 38, 1, OUT); });
def("levelUp", "jingles", (t) => { duck(0.3, 2); [72, 76, 79, 84, 88].forEach((m, i) => I.bell(t + i * 0.08, m, 0.9, OUT)); I.horn(t + 0.4, 84, 0.8, 0.6, OUT); });
def("quest", "jingles", (t) => { sfx.victory(); [86, 90, 93].forEach((m, i) => I.bell(t + 0.5 + i * 0.1, m, 0.7, OUT)); });
