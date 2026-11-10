// All sound is synthesized at run time, like the art: no audio files. Ported from src/audio.js.
// - music: generative step sequencer, one track per mood (meadow, ruins, dream, combat) plus short stings
// - ambience: wind, lapping water, campfire crackle, birds, drips in the ruins
// - sfx: footsteps by surface, blades, spells, dice, UI
using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;

namespace Brumafolha
{
    public static class Snd
    {
        static double Mtof(double m) => 440 * Math.Pow(2, (m - 69) / 12);
        static double Hashf(double a, double b, double c) { double s = Math.Sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453; return s - Math.Floor(s); }
        static double Rnd() => U.Rand();

        public class Group { public string key, label; public bool sfx; }
        static readonly Dictionary<string, float> DEFAULT_VOL = new Dictionary<string, float> { ["master"] = 1, ["music"] = 0.5f, ["ambience"] = 0.8f, ["combat"] = 0.85f, ["steps"] = 0.7f, ["ui"] = 0.7f, ["jingles"] = 0.8f, ["world"] = 0.8f };
        /// <summary>Every volume the player can set, in menu order; `sfx` marks the effect categories.</summary>
        public static readonly Group[] SOUND_GROUPS = {
            new Group { key = "master", label = "Volume geral" },
            new Group { key = "music", label = "Música" },
            new Group { key = "ambience", label = "Ambiente (vento, água, fogueira, pássaros)" },
            new Group { key = "combat", label = "Golpes, magias e flechas", sfx = true },
            new Group { key = "steps", label = "Passos", sfx = true },
            new Group { key = "jingles", label = "Fanfarras (nível, vitória, missão, descanso)", sfx = true },
            new Group { key = "ui", label = "Interface e dados", sfx = true },
            new Group { key = "world", label = "Mundo (baús)", sfx = true },
        };
        public static bool muted;
        public static readonly Dictionary<string, float> vol = new Dictionary<string, float>();

        static bool ctx;
        static AGain master, musicBus, sfxBus, ambBus, verbIn;
        static float[] noiseBuf, brownBuf;
        static readonly Dictionary<string, AGain> buses = new Dictionary<string, AGain>();
        // each bus has its own send into the shared reverb, at the bus's volume, so a muted category leaves no echo behind
        static readonly Dictionary<ANode, AGain> sends = new Dictionary<ANode, AGain>();
        static AGain OUT; // the bus the sound effect being built plays into (set by Def)
        static double Now => Synth.now;

        public static void LoadSettings()
        {
            muted = PlayerPrefs.GetInt("brum.muted", 0) == 1;
            foreach (var kv in DEFAULT_VOL) vol[kv.Key] = PlayerPrefs.GetFloat("brum.vol." + kv.Key, kv.Value);
        }

        public static void Init()
        {
            if (ctx) return;
            LoadSettings();
            Synth.Init();
            lock (Synth.Lock)
            {
                master = Persist(GainNode(muted ? 0 : vol["master"], Synth.output));
                musicBus = Persist(GainNode(vol["music"], master));
                sfxBus = Persist(GainNode(1, master));
                ambBus = Persist(GainNode(vol["ambience"], master));
                buses["master"] = master; buses["music"] = musicBus; buses["ambience"] = ambBus;
                foreach (var g in SOUND_GROUPS) if (g.sfx) buses[g.key] = Persist(GainNode(vol[g.key], sfxBus));
                OUT = buses["combat"];
                int n = (int)(Synth.rate * 2);
                noiseBuf = new float[n];
                for (int i = 0; i < n; i++) noiseBuf[i] = (float)(Rnd() * 2 - 1);
                // brown noise (integrated white): the deep rumble of flames and explosions
                brownBuf = new float[n];
                double acc = 0, peak = 0;
                for (int i = 0; i < n; i++) { acc = (acc + 0.02 * (Rnd() * 2 - 1)) / 1.02; brownBuf[i] = (float)acc; peak = Math.Max(peak, Math.Abs(acc)); }
                for (int i = 0; i < n; i++) brownBuf[i] /= (float)peak;
                // a soft hall
                var verb = new AReverb();
                verbIn = Persist(new AGain(1)); verbIn.Connect(verb);
                foreach (var kv in buses) if (kv.Key != "master") sends[kv.Value] = Persist(GainNode(vol[kv.Key], verbIn));
                verb.Connect(Persist(GainNode(0.5, master)));
                ctx = true;
                StartAmbience();
            }
        }
        static T Persist<T>(T n) where T : ANode { n.persistent = true; return n; }

        public static void SetVolume(string kind, float v)
        {
            vol[kind] = v; PlayerPrefs.SetFloat("brum.vol." + kind, v);
            if (!ctx) return;
            lock (Synth.Lock)
            {
                if (kind == "master") SetMuted(muted);
                else { buses[kind].gain.SetTargetAtTime(v, Now, 0.05); sends[buses[kind]].gain.SetTargetAtTime(v, Now, 0.05); }
            }
        }
        public static bool SetMuted(bool m)
        {
            muted = m; PlayerPrefs.SetInt("brum.muted", m ? 1 : 0);
            if (master != null) lock (Synth.Lock) master.gain.SetTargetAtTime(m ? 0 : vol["master"], Now, 0.05);
            return m;
        }
        public static bool ToggleMute() => SetMuted(!muted);
        /// <summary>A short sample of a category, played when its slider is let go.</summary>
        public static void PreviewSound(string kind)
        {
            switch (kind)
            {
                case "combat": swing(); Game.After(0.22f, () => hit(false)); break;
                case "steps": foreach (var d in new[] { 0f, 0.26f, 0.52f }) Game.After(d, () => step("grass")); break;
                case "jingles": levelUp(); break;
                case "ui": success(false); break;
                case "world": chest(); break;
                case "master": turn(); break;
            }
        }

        // ---------------------------------------------------------------- building blocks
        static AGain GainNode(double v, ANode o = null) { var g = new AGain(v); if (o != null) g.Connect(o); return g; }
        static AGain GainToParam(double v, AParam p) { var g = new AGain(v); g.Connect(p); return g; }
        /// <summary>A voice's output: a gain into `out`, with an optional send to the reverb.</summary>
        static AGain Voice(ANode o, double wet = 0)
        {
            var g = new AGain(0); g.Connect(o);
            if (wet != 0) g.Connect(GainNode(wet, sends.TryGetValue(o, out var s) ? s : verbIn));
            return g;
        }
        static AOsc Osc(string type, double f, double t, double end, ANode o)
        {
            var os = new AOsc(type, f); os.frequency.SetValueAtTime(f, t);
            os.Connect(o); os.Start(t); os.Stop(end); return os;
        }
        static ABiquad Filt(string type, double f, double q, ANode o) { var b = new ABiquad(type, f, q); b.Connect(o); return b; }
        /// <summary>Percussive envelope: fast attack then exponential decay.</summary>
        static void Perc(AGain g, double t, double peak, double decay, double attack = 0.004)
        {
            g.gain.SetValueAtTime(0.0001, t);
            g.gain.ExponentialRampToValueAtTime(Math.Max(0.0001, peak), t + attack);
            g.gain.ExponentialRampToValueAtTime(0.0001, t + attack + decay);
        }
        class NO { public string type = "bandpass"; public double f = 1000, q = 1, wet = 0, attack = 0.003; public double? f2; public ANode o; }
        /// <summary>Filtered noise burst; f2 sweeps the filter.</summary>
        static void Noise(double t, double dur, double vel, NO op = null)
        {
            op ??= new NO();
            var o = op.o ?? OUT;
            var src = new ABufSrc { buffer = noiseBuf };
            var g = Voice(o, op.wet); var b = Filt(op.type, op.f, op.q, g);
            if (op.f2.HasValue) b.frequency.ExponentialRampToValueAtTime(op.f2.Value, t + dur);
            src.Connect(b);
            Perc(g, t, vel, dur, op.attack);
            src.Start(t, Rnd() * 1.5); src.Stop(t + dur + op.attack + 0.05);
        }
        /// <summary>Pitched blip with a pitch sweep.</summary>
        static void Tone(double t, string type, double f, double? f2, double dur, double vel, ANode o = null, double wet = 0, double lp = 0, double attack = 0.004)
        {
            o ??= OUT;
            var g = Voice(o, wet);
            var os = Osc(type, f, t, t + dur + attack + 0.05, lp != 0 ? (ANode)Filt("lowpass", lp, 0.7, g) : g);
            if (f2.HasValue && f2.Value != f) os.frequency.ExponentialRampToValueAtTime(f2.Value, t + dur);
            Perc(g, t, vel, dur, attack);
        }

        /// <summary>Struck metal: inharmonic sine partials, each ringing for its own time (modal synthesis).</summary>
        static void Metal(double t, double[] freqs, double[] decays, double vel, ANode o = null, double wet = 0.3)
        {
            o ??= OUT;
            for (int i = 0; i < freqs.Length; i++)
            {
                double f = freqs[i];
                var g = Voice(o, wet); double a = vel / (1 + i * 0.35);
                Osc("sine", f, t, t + decays[i] + 0.1, g);
                Osc("sine", f * 1.0013, t, t + decays[i] + 0.1, GainNode(0.6, g)); // a slow beat makes it shimmer
                Perc(g, t, a, decays[i], 0.001);
            }
        }
        /// <summary>Air pushed by something moving fast: band-passed noise sweeping up then down, loudest past the middle.</summary>
        static void Whoosh(double t, double dur, double vel, double f0, double fPeak, double f1, double q = 2.5, ANode o = null, double wet = 0.1, float[] buf = null)
        {
            o ??= OUT;
            var src = new ABufSrc { buffer = buf ?? noiseBuf };
            var g = Voice(o, wet); var b2 = Filt("bandpass", f0, q * 0.6, g); var b = Filt("bandpass", f0, q, b2);
            double mid = t + dur * 0.55;
            foreach (var x in new[] { b, b2 }) { x.frequency.SetValueAtTime(f0, t); x.frequency.ExponentialRampToValueAtTime(fPeak, mid); x.frequency.ExponentialRampToValueAtTime(f1, t + dur); }
            g.gain.SetValueAtTime(0.0001, t);
            g.gain.ExponentialRampToValueAtTime(vel * 5, mid); // the two narrow band-passes eat most of the energy
            g.gain.ExponentialRampToValueAtTime(0.0001, t + dur);
            src.Connect(b); src.Start(t, Rnd() * 1.5); src.Stop(t + dur + 0.05);
        }
        /// <summary>Scattered tiny clicks: fire crackle, gravel, embers.</summary>
        static void Crackles(double t, double dur, double perSec, double vel, ANode o = null, double fade = 1.5, double fLo = 1800, double fHi = 7000)
        {
            int n = (int)Math.Round(dur * perSec);
            for (int i = 0; i < n; i++)
            {
                double x = Rnd(), tt = t + x * dur;
                Noise(tt, 0.002 + Rnd() * 0.012, vel * (0.3 + Rnd() * 0.7) * Math.Pow(1 - x, fade), new NO { type = "highpass", f = fLo + Rnd() * (fHi - fLo), o = o, attack = 0.0008 });
            }
        }
        /// <summary>Flame body: brown noise through a moving low-pass, with an irregular flicker in its loudness.</summary>
        static void Roar(double t, double dur, double vel, double f0 = 400, double f1 = 1500, double attack = 0.06, ANode o = null, double wet = 0.15)
        {
            o ??= OUT;
            var src = new ABufSrc { buffer = brownBuf };
            var env = Voice(o, wet); var flick = GainNode(0.65, env); var lp = Filt("lowpass", f0, 0.9, flick);
            lp.frequency.SetValueAtTime(f0, t); lp.frequency.ExponentialRampToValueAtTime(f1, t + Math.Min(dur, attack * 3 + 0.1));
            lp.frequency.ExponentialRampToValueAtTime(f0 * 0.7, t + dur);
            // flicker: slow noise wobbling the gain
            var mod = new ABufSrc { buffer = noiseBuf };
            var mlp = Filt("lowpass", 14, 0.5, GainToParam(1.6, flick.gain));
            mod.Connect(mlp);
            env.gain.SetValueAtTime(0.0001, t);
            env.gain.ExponentialRampToValueAtTime(vel, t + attack);
            env.gain.ExponentialRampToValueAtTime(vel * 0.6, t + attack + (dur - attack) * 0.5);
            env.gain.ExponentialRampToValueAtTime(0.0001, t + dur);
            src.Connect(lp);
            double off = Rnd() * 1.5;
            src.Start(t, off); src.Stop(t + dur + 0.05); mod.Start(t, off); mod.Stop(t + dur + 0.05);
        }
        /// <summary>Something heavy landing: a low sine drop plus a muffled rumble.</summary>
        static void Thud(double t, double vel, double pitch = 1)
        {
            Tone(t, "sine", 150 * pitch, 50 * pitch, 0.14, vel);
            var src = new ABufSrc { buffer = brownBuf };
            var g = Voice(OUT); var lp = Filt("lowpass", 380 * pitch, 0.7, g);
            src.Connect(lp); Perc(g, t, vel * 0.8, 0.12, 0.002);
            src.Start(t, Rnd()); src.Stop(t + 0.2);
        }

        // ---------------------------------------------------------------- instruments
        static class I
        {
            public static void Pluck(double t, double m, double dur, double vel, ANode o)
            { // lute / harp: bright attack, filter closes fast
                double f = Mtof(m); var g = Voice(o, 0.35); var lp = Filt("lowpass", f * 6, 1, g);
                lp.frequency.SetValueAtTime(Math.Min(9000, f * 8), t);
                lp.frequency.ExponentialRampToValueAtTime(f * 1.5, t + 0.35);
                Osc("triangle", f, t, t + dur + 1, lp);
                Osc("sawtooth", f * 1.004, t, t + dur + 1, GainNode(0.35, lp));
                Perc(g, t, vel * 0.32, dur * 0.6 + 0.6, 0.003);
            }
            public static void Pad(double t, IEnumerable<double> notes, double dur, double vel, ANode o, double cut = 900)
            { // warm strings bed
                var g = Voice(o, 0.6); var lp = Filt("lowpass", cut, 0.4, g);
                foreach (var m in notes) foreach (var det in new[] { -7, 7 }) { var os = Osc("sawtooth", Mtof(m), t, t + dur + 1.6, lp); os.detune.value = det; }
                g.gain.SetValueAtTime(0.0001, t);
                g.gain.LinearRampToValueAtTime(vel * 0.06, t + Math.Min(0.9, dur * 0.4));
                g.gain.SetValueAtTime(vel * 0.06, t + dur);
                g.gain.LinearRampToValueAtTime(0.0001, t + dur + 1.4);
            }
            public static void Flute(double t, double m, double dur, double vel, ANode o)
            { // breathy sine lead with delayed vibrato
                double f = Mtof(m); var g = Voice(o, 0.5);
                var os = Osc("sine", f, t, t + dur + 0.3, g); var o2 = Osc("triangle", f * 2, t, t + dur + 0.3, GainNode(0.08, g));
                var depth = new AGain(0);
                depth.gain.SetValueAtTime(0, t); depth.gain.LinearRampToValueAtTime(f * 0.006, t + Math.Min(0.5, dur));
                Osc("sine", 5.2, t, t + dur + 0.3, depth);
                depth.Connect(os.frequency); depth.Connect(o2.frequency);
                g.gain.SetValueAtTime(0.0001, t);
                g.gain.LinearRampToValueAtTime(vel * 0.16, t + 0.07);
                g.gain.SetValueAtTime(vel * 0.14, t + Math.Max(0.08, dur - 0.05));
                g.gain.LinearRampToValueAtTime(0.0001, t + dur + 0.18);
                Noise(t, 0.12, vel * 0.03, new NO { f = f * 2, q = 2, o = o, attack = 0.03 });
            }
            public static void Horn(double t, double m, double dur, double vel, ANode o)
            { // brassy lead: filter swells open
                double f = Mtof(m); var g = Voice(o, 0.45); var lp = Filt("lowpass", 500, 1.2, g);
                lp.frequency.SetValueAtTime(400, t);
                lp.frequency.LinearRampToValueAtTime(2200 * vel + 600, t + 0.07);
                lp.frequency.SetTargetAtTime(1100, t + 0.1, 0.25);
                foreach (var det in new[] { -5, 5 }) { var os = Osc("sawtooth", f, t, t + dur + 0.4, lp); os.detune.value = det; }
                g.gain.SetValueAtTime(0.0001, t);
                g.gain.LinearRampToValueAtTime(vel * 0.13, t + 0.05);
                g.gain.SetValueAtTime(vel * 0.11, t + Math.Max(0.06, dur - 0.05));
                g.gain.LinearRampToValueAtTime(0.0001, t + dur + 0.25);
            }
            public static void Bass(double t, double m, double dur, double vel, ANode o)
            {
                double f = Mtof(m); var g = Voice(o, 0.05); var lp = Filt("lowpass", f * 4, 0.8, g);
                Osc("triangle", f, t, t + dur + 0.5, lp); Osc("sine", f / 2, t, t + dur + 0.5, GainNode(0.6, lp));
                Perc(g, t, vel * 0.45, dur + 0.2, 0.008);
            }
            public static void Drum(double t, double vel, double pitch, ANode o)
            { // taiko-ish
                var g = Voice(o, 0.25); var os = Osc("sine", 150 * pitch, t, t + 0.8, g);
                os.frequency.ExponentialRampToValueAtTime(42 * pitch, t + 0.22);
                Perc(g, t, vel * 0.9, 0.55);
                Noise(t, 0.08, vel * 0.35, new NO { type = "lowpass", f = 900 * pitch, o = o });
            }
            public static void Rim(double t, double vel, ANode o) => Noise(t, 0.05, vel * 0.3, new NO { f = 2600, q = 3, o = o, wet = 0.2 });
            public static void Hat(double t, double vel, ANode o) => Noise(t, 0.03, vel * 0.12, new NO { type = "highpass", f = 7000, o = o });
            public static void Bell(double t, double m, double vel, ANode o, double wet = 0.6)
            { // inharmonic partials, long ring
                double f = Mtof(m);
                foreach (var (r, a, d) in new[] { (1.0, 1.0, 1.6), (2.76, 0.4, 0.8), (5.4, 0.2, 0.4), (8.9, 0.08, 0.2) }) Tone(t, "sine", f * r, null, d, vel * 0.2 * a, o, wet, 0, 0.002);
            }
        }

        // ---------------------------------------------------------------- music
        static readonly Dictionary<string, int[]> PC = new Dictionary<string, int[]> {
            ["D"] = new[] { 2, 6, 9 }, ["Bm"] = new[] { 11, 2, 6 }, ["G"] = new[] { 7, 11, 2 }, ["A"] = new[] { 9, 1, 4 }, ["Fsm"] = new[] { 6, 9, 1 }, ["Am"] = new[] { 9, 0, 4 },
            ["F"] = new[] { 5, 9, 0 }, ["Dm"] = new[] { 2, 5, 9 }, ["E"] = new[] { 4, 8, 11 }, ["Bb"] = new[] { 10, 2, 5 }, ["C"] = new[] { 0, 4, 7 }, ["Gm"] = new[] { 7, 10, 2 } };
        /// <summary>Chord tones placed in the first octave at or above `low`, in rising order.</summary>
        static double[] Voicing(int[] pcs, int low) => pcs.Select(p => (double)(low + (((p - low) % 12) + 12) % 12)).OrderBy(x => x).ToArray();
        static double RootAt(int[] pcs, int low) => low + (((pcs[0] - low) % 12) + 12) % 12;

        // melodies: per bar, [step, midi, length in 16ths]
        static readonly int[][][] MEADOW_MEL = {
            new[] { new[] { 0, 74, 6 }, new[] { 6, 73, 2 }, new[] { 8, 71, 4 }, new[] { 12, 69, 4 } }, new[] { new[] { 0, 66, 8 }, new[] { 8, 69, 4 }, new[] { 12, 71, 4 } },
            new[] { new[] { 0, 74, 4 }, new[] { 4, 76, 4 }, new[] { 8, 78, 6 }, new[] { 14, 76, 2 } }, new[] { new[] { 0, 73, 12 } },
            new[] { new[] { 0, 78, 6 }, new[] { 6, 76, 2 }, new[] { 8, 74, 4 }, new[] { 12, 73, 4 } }, new[] { new[] { 0, 73, 4 }, new[] { 4, 69, 4 }, new[] { 8, 66, 8 } },
            new[] { new[] { 0, 67, 4 }, new[] { 4, 71, 4 }, new[] { 8, 74, 4 }, new[] { 12, 76, 4 } }, new[] { new[] { 0, 76, 8 }, new[] { 8, 73, 8 } },
        };
        static readonly int[][][] COMBAT_MEL = {
            new[] { new[] { 0, 74, 4 }, new[] { 4, 77, 4 }, new[] { 8, 81, 6 }, new[] { 14, 79, 2 } }, new[] { new[] { 0, 79, 6 }, new[] { 6, 77, 2 }, new[] { 8, 74, 8 } },
            new[] { new[] { 0, 74, 4 }, new[] { 4, 77, 4 }, new[] { 8, 82, 4 }, new[] { 12, 81, 4 } }, new[] { new[] { 0, 81, 8 }, new[] { 8, 76, 4 }, new[] { 12, 73, 4 } },
        };
        static void PlayMel(int[][][] mel, int bar, int s, double sp, Action<double, double> play)
        {
            if (bar < 0 || bar >= mel.Length) return;
            foreach (var e in mel[bar]) if (e[0] == s) play(e[1], e[2] * sp);
        }

        class Track { public double bpm; public int bars; public string[] prog; public Action<Track, int, int, double, int, ANode, double> step; }
        static readonly Dictionary<string, Track> TRACKS = new Dictionary<string, Track> {
            ["meadow"] = new Track { bpm = 84, bars = 8, prog = new[] { "D", "Bm", "G", "A", "D", "Fsm", "G", "A" }, step = (tr, bar, s, t, loop, o, sp) => {
                var ch = PC[tr.prog[bar]];
                if (s == 0) { I.Pad(t, Voicing(ch, 54), sp * 16, 0.9, o, 1100); I.Bass(t, RootAt(ch, 38), sp * 6, 0.8, o); }
                if (s == 8) I.Bass(t, RootAt(ch, 38) + (bar % 2 != 0 ? 7 : 0), sp * 6, 0.6, o);
                if (s % 2 == 0) {
                    var v = Voicing(ch, 62); var notes = new[] { v[0], v[1], v[2], v[0] + 12 };
                    int idx = new[] { 0, 1, 2, 1, 3, 2, 1, 2 }[s / 2];
                    I.Pluck(t, notes[idx], sp * 2, s % 8 == 0 ? 0.75 : 0.5, o);
                }
                if (loop % 2 == 0) PlayMel(MEADOW_MEL, bar, s, sp, (m, d) => I.Flute(t, m, d, 0.9, o));
                else if (s == 4 && bar % 2 == 1) I.Bell(t, Voicing(ch, 74)[1], 0.35, o);
            } },
            ["ruins"] = new Track { bpm = 62, bars = 4, prog = new[] { "Am", "F", "Dm", "E" }, step = (tr, bar, s, t, loop, o, sp) => {
                var ch = PC[tr.prog[bar]];
                if (s == 0) { I.Pad(t, Voicing(ch, 45).Append(33), sp * 16, 1, o, 520); if (bar % 2 == 0) I.Drum(t, 0.4, 0.55, o); }
                if (s % 2 == 0 && Hashf(loop, bar, s) < 0.32) {
                    var scale = new[] { 57, 60, 62, 64, 67, 69, 72, 74 };
                    I.Pluck(t, scale[(int)(Hashf(s, loop, bar) * scale.Length)], sp * 3, 0.45, o);
                }
                if (bar == 3 && s == 8) I.Flute(t, 68, sp * 8, 0.45, o); // the raised 7th, unresolved
                if (bar == 1 && s == 10 && loop % 2 != 0) I.Bell(t, 81, 0.25, o);
            } },
            ["dream"] = new Track { bpm = 50, bars = 4, prog = new[] { "F", "C", "Dm", "Bb" }, step = (tr, bar, s, t, loop, o, sp) => {
                // dreamed Velmoor and the Relicário: a slow bed, far bells, a flute that never resolves
                var ch = PC[tr.prog[bar]];
                if (s == 0) I.Pad(t, Voicing(ch, 53).Append(RootAt(ch, 41)), sp * 16, 0.8, o, 700);
                if (s == 0 && bar % 2 == 0) I.Bell(t, Voicing(ch, 77)[0], 0.3, o, 0.9);
                if (s == 8 && Hashf(loop, bar, 3) < 0.6) I.Bell(t, Voicing(ch, 72)[(int)(Hashf(bar, loop, 1) * 3)], 0.18, o, 0.9);
                if (bar == 2 && s == 4 && loop % 2 == 0) I.Flute(t, 69, sp * 10, 0.35, o);
                if (bar == 3 && s == 6 && loop % 2 == 1) I.Flute(t, 67, sp * 8, 0.3, o);
            } },
            ["combat"] = new Track { bpm = 128, bars = 8, prog = new[] { "Dm", "Dm", "Bb", "C", "Dm", "Gm", "Bb", "A" }, step = (tr, bar, s, t, loop, o, sp) => {
                var ch = PC[tr.prog[bar]]; double r = RootAt(ch, 38);
                if (s == 0 || s == 6 || s == 8 || s == 14) I.Drum(t, s == 0 ? 1 : 0.7, 1, o);
                if (s == 3 || s == 11) I.Drum(t, 0.45, 1.6, o);
                if (s == 4 || s == 12) I.Rim(t, 0.9, o);
                if (s % 2 == 1) I.Hat(t, 0.8, o);
                if (s % 2 == 0) I.Bass(t, new[] { r, r, r + 12, r, r, r + 7, r + 12, r }[s / 2], sp * 1.6, 0.75, o);
                if (s == 0) I.Pad(t, Voicing(ch, 50), sp * 16, 0.7, o, 800);
                var v = Voicing(ch, 62);
                I.Pluck(t, new[] { v[0], v[1], v[2], v[1] }[s % 4], sp, 0.28, o);
                if (bar >= 4) PlayMel(COMBAT_MEL, bar - 4, s, sp, (m, d) => I.Horn(t, m, d, 0.9, o));
                else if (loop % 2 == 1) PlayMel(COMBAT_MEL, bar, s, sp, (m, d) => I.Horn(t, m - 12, d, 0.6, o));
            } },
        };

        static Track cur; static string curName = "__none"; static AGain curGain; static double nextT; static long stepN;
        public static string CurrentTrack => curName;
        /// <summary>Crossfade to a track by name ("meadow", "ruins", "dream", "combat"), or null for silence.</summary>
        public static void PlayMusic(string name, float fade = 1.2f)
        {
            if (!ctx || name == curName) return;
            curName = name;
            lock (Synth.Lock)
            {
                double now = Now;
                if (curGain != null)
                {
                    var g = curGain; var sg = sends[g];
                    foreach (var n in new[] { g, sg }) { n.gain.CancelScheduledValues(now); n.gain.SetTargetAtTime(0, now, fade / 3); }
                    Game.After(fade + 4, () => { lock (Synth.Lock) { g.Kill(); sg.Kill(); sends.Remove(g); } });
                }
                cur = name != null && TRACKS.TryGetValue(name, out var tr) ? tr : null; curGain = null;
                if (cur == null) return;
                curGain = Persist(GainNode(0, musicBus));
                sends[curGain] = Persist(GainNode(0, sends[musicBus]));
                foreach (var n in new[] { curGain, sends[curGain] }) n.gain.SetTargetAtTime(1, now + 0.05, fade / 3);
                nextT = now + 0.08; stepN = 0;
            }
        }
        /// <summary>Called every frame: queue the next 0.3 s of the current track.</summary>
        public static void Schedule()
        {
            if (cur == null || curGain == null) return;
            lock (Synth.Lock)
            {
                double sp = 60 / cur.bpm / 4, now = Now;
                if (nextT < now - 0.2) nextT = now + 0.05; // the game was asleep: skip ahead rather than burst
                while (nextT < now + 0.3)
                {
                    int s = (int)(stepN % 16), bar = (int)((stepN / 16) % cur.bars), loop = (int)(stepN / (16 * cur.bars));
                    cur.step(cur, bar, s, nextT, loop, curGain, sp);
                    nextT += sp; stepN++;
                }
            }
        }
        /// <summary>Duck the music for a moment (under a sting or a big moment).</summary>
        static void Duck(double amount, double secs)
        {
            double t = Now;
            foreach (var n in new[] { musicBus, sends[musicBus] })
            {
                n.gain.CancelScheduledValues(t);
                n.gain.SetTargetAtTime(vol["music"] * amount, t, 0.08);
                n.gain.SetTargetAtTime(vol["music"], t + secs, 0.6);
            }
        }

        // ---------------------------------------------------------------- ambience
        class Loop { public AGain g; public ABiquad b; }
        static Loop windL, waterL; static float birdT = 2, dripT = 3;
        static Loop LoopNoise(string type, double f, double q)
        {
            var src = new ABufSrc { buffer = noiseBuf, loop = true };
            var g = Persist(GainNode(0, ambBus)); var b = Filt(type, f, q, g); b.persistent = true;
            src.Connect(b); src.Start(0);
            return new Loop { g = g, b = b };
        }
        static void StartAmbience() { windL = LoopNoise("bandpass", 420, 0.6); waterL = LoopNoise("lowpass", 520, 0.7); }

        public struct Amb { public float wind, water, fire, birds, ruins; }
        /// <summary>levels in 0..1; call every frame.</summary>
        public static void UpdateAmbience(Amb lv, float dt, float time)
        {
            if (!ctx || windL == null) return;
            lock (Synth.Lock)
            {
                double t = Now;
                windL.g.gain.SetTargetAtTime(lv.wind * (0.05 + 0.03 * Math.Sin(time * 0.31) + 0.02 * Math.Sin(time * 0.83)), t, 0.4);
                windL.b.frequency.SetTargetAtTime(380 + 160 * Math.Sin(time * 0.23) + (lv.ruins != 0 ? -120 : 0), t, 0.5);
                waterL.g.gain.SetTargetAtTime(lv.water * (0.09 + 0.06 * Math.Max(0, Math.Sin(time * 1.7))), t, 0.15);
                if (muted) return;
                if (lv.fire > 0.02f && Rnd() < lv.fire * dt * 16)
                {
                    Noise(t, 0.012 + Rnd() * 0.03, lv.fire * (0.08 + Rnd() * 0.18), new NO { type = "highpass", f = 1500 + Rnd() * 3000, o = ambBus });
                    if (Rnd() < 0.1) Noise(t, 0.25, lv.fire * 0.05, new NO { type = "lowpass", f = 500, o = ambBus, attack = 0.05 });
                }
                if (lv.birds > 0.05f && (birdT -= dt) < 0)
                {
                    birdT = 2 + (float)Rnd() * 6;
                    double bse = 2200 + Rnd() * 1600, kind = Rnd(); int n = 2 + (int)(Rnd() * 4);
                    for (int i = 0; i < n; i++)
                    {
                        double tt = t + i * (0.09 + kind * 0.08);
                        Tone(tt, "sine", bse * (kind < 0.5 ? 1 : 1.25), bse * (kind < 0.5 ? 1.35 : 0.85), 0.07, lv.birds * 0.05, ambBus, 0.4, 0, 0.01);
                    }
                }
                if (lv.ruins > 0.05f && (dripT -= dt) < 0)
                {
                    dripT = 1.5f + (float)Rnd() * 4;
                    Tone(t, "sine", 1400 + Rnd() * 900, 700, 0.06, lv.ruins * 0.05, ambBus, 0.9);
                }
            }
        }

        // ---------------------------------------------------------------- sound effects
        /// <summary>Run a sound effect in a volume category (null: into whatever bus is current).</summary>
        static void Def(string cat, Action<double> fn)
        {
            if (!ctx || muted) return;
            lock (Synth.Lock)
            {
                var prev = OUT;
                if (cat != null) OUT = buses[cat];
                try { fn(Now); } catch (Exception e) { Debug.LogWarning("sfx " + e); } finally { OUT = prev; }
            }
        }
        static double Jit(double v, double j = 0.12) => v * (1 + (Rnd() * 2 - 1) * j);
        static double[] Shuffle(double[] a, double k = 0.04) => a.Select(f => Jit(f, k)).ToArray();
        static double[] A(params double[] v) => v;

        public static void step(string surface, double volume = 1) => Def("steps", t =>
        {
            double v = 0.6 * volume;
            if (surface == "wood")
            { // hollow plank knock
                Metal(t, Shuffle(A(205, 470, 760)), A(0.09, 0.05, 0.035), v * 0.16, null, 0.05);
                Noise(t, 0.015, v * 0.15, new NO { type = "lowpass", f = 1500 });
            }
            else if (surface == "stone")
            { // hard heel click and a scuff
                Noise(t, 0.006, v * 0.3, new NO { type = "highpass", f = 3200, attack = 0.0008 });
                Noise(t + 0.008, 0.04, v * 0.12, new NO { f = Jit(1900), q = 1.2 });
                Tone(t, "sine", Jit(280), 180, 0.03, v * 0.08);
            }
            else if (surface == "dirt")
            { // soft thump and a crumble of grit
                Noise(t, 0.05, v * 0.6, new NO { type = "lowpass", f = Jit(700) });
                Crackles(t + 0.005, 0.05, 140, v * 0.2, null, 1.5, 1500, 4500);
            }
            else if (surface == "water")
            {
                Whoosh(t, 0.16, v * 0.18, 700, 2400, 900, 1);
                for (int i = 0; i < 2; i++) Bubble(t + 0.04 + i * 0.05, v * 0.4);
            }
            else
            { // grass: heel then toe, a dry rustle
                foreach (var (d, a) in new[] { (0.0, 1.0), (0.035, 0.6) }) Noise(t + d, 0.045, v * 0.4 * a, new NO { f = Jit(3600, 0.2), q = 0.7, attack = 0.006 });
                Tone(t, "sine", 95, 70, 0.025, v * 0.2);
            }
        });
        static void Bubble(double t, double vel = 1)
        { // a single rising bubble "blip"
            double f = 250 + Rnd() * 450; var g = Voice(OUT, 0.1); var o = Osc("sine", f, t, t + 0.09, g);
            o.frequency.ExponentialRampToValueAtTime(f * 2.4, t + 0.035);
            Perc(g, t, 0.25 * vel, 0.05, 0.002);
        }
        public static void swing(bool big = false) => Def("combat", t =>
        { // blade cutting air, then a faint ring of steel
            Whoosh(t, big ? 0.3 : 0.2, big ? 0.6 : 0.5, 450, big ? 1700 : 2300, 800);
            if (big) Whoosh(t + 0.12, 0.26, 0.45, 500, 1900, 700);
            Metal(t + 0.03, Shuffle(A(3150, 4720, 6380, 8150)), A(0.32, 0.25, 0.18, 0.12), 0.035, null, 0.5);
        });
        public static void hit(bool crit = false, string kind = "blade") => Def("combat", t =>
        {
            if (kind == "blade")
            {
                Noise(t, 0.008, 0.35, new NO { type = "highpass", f = 2500, attack = 0.0008 }); // edge contact
                Noise(t + 0.004, 0.07, 0.3, new NO { f = 1600, f2 = 600, q = 1.2 });              // the cut
                Metal(t, Shuffle(A(1870, 2740, 3910, 5230)), A(0.22, 0.17, 0.12, 0.08), 0.05);
                Thud(t, 0.35);
            }
            else Thud(t, 0.25, 1.2);
            if (crit)
            { // a heavy clang and a boom
                Metal(t, Shuffle(A(523, 1287, 2011, 2896, 3870, 5100)), A(1.1, 0.85, 0.6, 0.45, 0.3, 0.2), 0.12, null, 0.45);
                Thud(t, 0.45, 0.6);
                I.Drum(t, 0.4, 0.7, OUT);
            }
        });
        public static void miss() => Def("combat", t => Whoosh(t, 0.14, 0.14, 1200, 3200, 1600, 3));

        // projectiles by kind: fire (Lyra), ember (the shaman's foul flame), arcane (missiles), arrow
        public static void cast(string kind) => Def("combat", t =>
        {
            if (kind == "fire")
            { // ignition "fwoomp", then the ball roaring as it flies
                Whoosh(t, 0.28, 0.35, 250, 1300, 600, 0.9, null, 0.1, brownBuf);
                Roar(t, 0.65, 1.0, 300, 2600, 0.07);
                Crackles(t + 0.05, 0.6, 45, 0.18);
                Tone(t, "sine", 60, 95, 0.18, 0.25);
            }
            else if (kind == "ember")
            { // darker, wetter: low roar with a sizzling hiss
                Roar(t, 0.6, 0.85, 180, 1100, 0.12);
                Noise(t, 0.55, 0.07, new NO { type = "highpass", f = 5000, attack = 0.2 });
                Crackles(t + 0.1, 0.5, 25, 0.12, null, 1.5, 1200, 3500);
            }
            else if (kind == "arcane")
            { // glassy chirp rising, with a fast shimmer
                var g = Voice(OUT, 0.5); var trem = GainNode(0.5, g);
                Osc("sine", 28, t, t + 0.3, GainToParam(0.5, trem.gain));
                foreach (var r in new[] { 1, 1.5, 2.01 }) { var o = Osc("sine", 700 * r, t, t + 0.3, trem); o.frequency.ExponentialRampToValueAtTime(1900 * r, t + 0.18); }
                Perc(g, t, 0.25, 0.22, 0.01);
                Whoosh(t, 0.22, 0.12, 2000, 6000, 3000, 2);
            }
            else if (kind == "arrow")
            { // release: string twang, slap on the bracer, fletching fluttering away
                var g = Voice(OUT, 0.08); var lp = Filt("lowpass", 2600, 3, g);
                foreach (var (r, a) in new[] { (1.0, 1.0), (2.0, 0.45), (3.01, 0.2) }) { var o = Osc("sawtooth", 142 * r, t, t + 0.3, GainNode(a, lp)); o.frequency.ExponentialRampToValueAtTime(122 * r, t + 0.2); }
                lp.frequency.ExponentialRampToValueAtTime(350, t + 0.18);
                Perc(g, t, 0.3, 0.2, 0.001);
                Noise(t, 0.012, 0.3, new NO { type = "highpass", f = 2400, attack = 0.0008 });
                Noise(t + 0.004, 0.03, 0.25, new NO { f = 1100, q = 1.5 });
                var fg = Voice(OUT); var fl = Filt("bandpass", 1700, 2.2, fg); var src = new ABufSrc { buffer = noiseBuf };
                var flut = GainNode(0.5, fl); src.Connect(flut);
                Osc("square", 34, t, t + 0.45, GainToParam(0.5, flut.gain)); // feathers chopping the air
                fl.frequency.ExponentialRampToValueAtTime(1200, t + 0.4);
                fg.gain.SetValueAtTime(0.0001, t + 0.03); fg.gain.ExponentialRampToValueAtTime(0.25, t + 0.08); fg.gain.ExponentialRampToValueAtTime(0.0001, t + 0.42);
                src.Start(t, Rnd()); src.Stop(t + 0.45);
            }
        });
        public static void bowDraw(double dur = 0.5) => Def("combat", t =>
        {
            // the limbs bending: a stick-slip creak rising in pitch as the string tightens, over a low wooden groan
            var g = Voice(OUT, 0.12); var bp = Filt("bandpass", 1500, 6, g); var bp2 = Filt("bandpass", 2700, 8, g);
            var o = Osc("sawtooth", 55, t, t + dur + 0.1, bp); o.Connect(bp2);
            int n = 32; var curve = new float[n];
            for (int i = 0; i < n; i++) curve[i] = (float)(48 + 85 * Math.Pow((double)i / n, 1.4) + (Rnd() - 0.5) * 30);
            o.frequency.SetValueCurveAtTime(curve, t, dur);
            g.gain.SetValueAtTime(0.0001, t); g.gain.LinearRampToValueAtTime(0.09, t + 0.08); g.gain.LinearRampToValueAtTime(0.22, t + dur * 0.9); g.gain.LinearRampToValueAtTime(0.0001, t + dur + 0.04);
            var wg = Voice(OUT); var wl = Filt("lowpass", 420, 1.5, wg); var wo = Osc("triangle", 85, t, t + dur + 0.1, wl);
            wo.frequency.LinearRampToValueAtTime(125, t + dur);
            wg.gain.SetValueAtTime(0.0001, t); wg.gain.LinearRampToValueAtTime(0.12, t + dur * 0.8); wg.gain.LinearRampToValueAtTime(0.0001, t + dur + 0.05);
            Noise(t + 0.02, 0.06, 0.12, new NO { f = 2200, q = 1.5 }); // arrow nocked against the grip
            Noise(t, dur, 0.05, new NO { type = "highpass", f = 5000, attack = dur * 0.8 }); // string stretching
        });
        public static void impact(string kind) => Def("combat", t =>
        {
            if (kind == "fire" || kind == "ember")
            { // a flame burst: crack, boom, roar dying into crackle
                bool big = kind == "fire";
                Noise(t, 0.012, 0.5, new NO { type = "highpass", f = 2000, attack = 0.0008 });
                var src = new ABufSrc { buffer = brownBuf };
                var g = Voice(OUT, 0.35); var lp = Filt("lowpass", big ? 4500 : 2500, 0.8, g);
                lp.frequency.ExponentialRampToValueAtTime(220, t + 0.7);
                src.Connect(lp); Perc(g, t, big ? 0.5 : 0.38, 0.75, 0.003);
                src.Start(t, Rnd()); src.Stop(t + 0.85);
                Tone(t, "sine", 95, 32, 0.4, big ? 0.4 : 0.3);
                Roar(t + 0.05, 0.9, big ? 0.25 : 0.18, 500, 900, 0.05);
                Crackles(t + 0.03, 1.0, big ? 70 : 40, 0.22, null, 2);
                if (!big) Noise(t + 0.05, 0.8, 0.06, new NO { type = "highpass", f = 4500, attack = 0.05 }); // sizzle
            }
            else if (kind == "arcane")
            { // a bright pop of sparks
                Metal(t, Shuffle(A(2350, 3520, 4890, 6610), 0.08), A(0.3, 0.22, 0.15, 0.1), 0.13, null, 0.6);
                Noise(t, 0.05, 0.45, new NO { type = "highpass", f = 3500 });
                Tone(t, "sine", 900, 220, 0.12, 0.4);
            }
            else if (kind == "arrow")
            { // thunk into wood or hide
                Noise(t, 0.03, 0.8, new NO { type = "lowpass", f = 1100 });
                Tone(t, "triangle", 230, 95, 0.06, 0.5);
                var g = Voice(OUT); var o = Osc("triangle", 180, t, t + 0.25, g); // shaft quiver
                Osc("sine", 38, t, t + 0.25, GainToParam(25, o.frequency));
                Perc(g, t + 0.01, 0.12, 0.18, 0.004);
            }
        });
        public static void heal() => Def("combat", t => { var ms = new[] { 72, 76, 79, 84 }; for (int i = 0; i < ms.Length; i++) I.Bell(t + i * 0.07, ms[i], 0.7, OUT); Noise(t, 0.8, 0.04, new NO { type = "highpass", f = 6000, attack = 0.3, wet = 0.6 }); });
        public static void potion() => Def("combat", t =>
        {
            // cork pop, a few glugs of bubbling liquid, a swallow, then the healing chime
            Noise(t, 0.012, 0.35, new NO { f = 900, q = 2, attack = 0.0008 }); Tone(t, "sine", 520, 170, 0.03, 0.3);
            for (int i = 0; i < 7; i++) Bubble(t + 0.12 + i * (0.045 + Rnd() * 0.04), 1.4);
            foreach (var d in new[] { 0.5, 0.72 }) Tone(t + d, "sine", 170, 85, 0.09, 0.3);
            Game.After(0.65f, heal);
        });
        public static void breath() => Def("combat", t => { Noise(t, 0.6, 0.18, new NO { f = 450, f2 = 900, q = 0.8, attack = 0.25 }); I.Bell(t + 0.35, 74, 0.5, OUT); });
        public static void enemyDown() => Def("combat", t =>
        { // a goblin croak, the body falling, a puff of smoke
            var g = Voice(OUT, 0.2); var bp = Filt("bandpass", 950, 2.5, g); var o = Osc("sawtooth", 430, t, t + 0.45, bp);
            o.frequency.ExponentialRampToValueAtTime(130, t + 0.38);
            Osc("sine", 31, t, t + 0.45, GainToParam(40, o.frequency)); // rasp
            Perc(g, t, 0.5, 0.38, 0.02);
            Thud(t + 0.3, 0.7, 0.8);
            Whoosh(t + 0.28, 0.35, 0.12, 400, 1200, 500, 1);
        });
        public static void partyDown() => Def("combat", t =>
        {
            Thud(t + 0.1, 0.65, 0.7);
            Metal(t + 0.12, Shuffle(A(1650, 2470, 3600)), A(0.2, 0.14, 0.1), 0.04); // gear rattling
            I.Bell(t + 0.05, 50, 0.8, OUT);
        });
        public static void combatStart() => Def("jingles", t => { Duck(0.2, 1.2); I.Drum(t, 1, 0.7, OUT); I.Drum(t + 0.18, 0.8, 0.7, OUT); I.Horn(t + 0.05, 50, 0.7, 1, OUT); I.Horn(t + 0.05, 57, 0.7, 0.9, OUT); I.Horn(t + 0.05, 62, 0.7, 0.7, OUT); });
        public static void turn() => Def("ui", t => I.Bell(t, 81, 0.45, OUT, 0.3));
        public static void select() => Def("ui", t => Tone(t, "triangle", 1100, 1300, 0.04, 0.08));
        public static void click() => Def("ui", t => Tone(t, "triangle", 640, 520, 0.04, 0.1));
        public static void dieTick() => Def("ui", t => { Noise(t, 0.02, Jit(0.4, 0.4), new NO { f = Jit(3200, 0.3), q = 3 }); Tone(t, "sine", Jit(1600, 0.3), null, 0.015, 0.04); });
        public static void success(bool crit) => Def("ui", t => { var ms = new[] { 76, 83, 88 }; for (int i = 0; i < 3; i++) I.Bell(t + i * 0.06, ms[i], 0.8, OUT); if (crit) I.Horn(t, 74, 0.8, 0.8, OUT); });
        public static void fail() => Def("ui", t => { Tone(t, "triangle", 220, 170, 0.45, 0.2, null, 0, 900); Tone(t, "triangle", 233, 180, 0.45, 0.14, null, 0, 900); });
        public static void chest() => Def("world", t =>
        {
            // hinge creak: a buzzing stick-slip, then the lid knocking back and coins clinking
            var g = Voice(OUT, 0.15); var bp = Filt("bandpass", 1100, 5, g); var o = Osc("sawtooth", 50, t, t + 0.5, bp);
            var curve = new float[24]; for (int i = 0; i < 24; i++) curve[i] = (float)(38 + 30 * Math.Sin(i * 0.7) + Rnd() * 25);
            o.frequency.SetValueCurveAtTime(curve, t, 0.42);
            g.gain.SetValueAtTime(0.0001, t); g.gain.LinearRampToValueAtTime(0.16, t + 0.06); g.gain.LinearRampToValueAtTime(0.0001, t + 0.44);
            Metal(t + 0.45, Shuffle(A(190, 430, 720)), A(0.12, 0.07, 0.05), 0.3, null, 0.1);
            Noise(t + 0.45, 0.03, 0.25, new NO { type = "lowpass", f = 1200 });
            for (int i = 0; i < 6; i++)
            {
                double tt = t + 0.6 + i * 0.07 + Rnd() * 0.05, b = 3000 + Rnd() * 1800;
                Metal(tt, A(b, b * 1.48, b * 2.21, b * 2.93), A(0.3, 0.22, 0.15, 0.1), 0.07, null, 0.25);
            }
        });
        public static void talk() => Def("ui", t => I.Pluck(t, 69, 0.2, 0.4, OUT));
        public static void bells() => Def("world", t => { foreach (var (d, m, v) in new[] { (0.0, 74, 0.35), (0.9, 69, 0.25), (1.7, 77, 0.2), (3.1, 72, 0.18) }) I.Bell(t + d, m, v, OUT, 0.95); });
        public static void rest() => Def("jingles", t => { Duck(0.3, 2.5); var ms = new[] { 62, 66, 69, 74 }; for (int i = 0; i < 4; i++) I.Bell(t + i * 0.18, ms[i], 0.7, OUT); I.Pad(t, new double[] { 50, 57, 62, 66 }, 1.6, 1.2, OUT, 1400); });
        public static void victory() => Def("jingles", t =>
        {
            Duck(0.05, 3.2);
            foreach (var (d, m) in new[] { (0.0, 62), (0.14, 66), (0.28, 69) }) I.Horn(t + d, m, 0.16, 1, OUT);
            I.Horn(t + 0.42, 74, 1.4, 1, OUT); I.Horn(t + 0.42, 66, 1.4, 0.7, OUT);
            I.Drum(t + 0.42, 0.9, 0.8, OUT);
            I.Pad(t + 0.42, new double[] { 50, 57, 62, 66 }, 1.6, 1.4, OUT, 1600);
        });
        public static void defeat() => Def("jingles", t => { Duck(0, 6); I.Pad(t, new double[] { 38, 50, 53, 57 }, 3.5, 1.6, OUT, 700); var ms = new[] { 62, 60, 57, 53 }; for (int i = 0; i < 4; i++) I.Flute(t + 0.3 + i * 0.55, ms[i], 0.5, 0.8, OUT); I.Bell(t + 2.6, 38, 1, OUT); });
        public static void levelUp() => Def("jingles", t => { Duck(0.3, 2); var ms = new[] { 72, 76, 79, 84, 88 }; for (int i = 0; i < 5; i++) I.Bell(t + i * 0.08, ms[i], 0.9, OUT); I.Horn(t + 0.4, 84, 0.8, 0.6, OUT); });
        public static void quest() => Def("jingles", t => { victory(); var ms = new[] { 86, 90, 93 }; for (int i = 0; i < 3; i++) I.Bell(t + 0.5 + i * 0.1, ms[i], 0.7, OUT); });
    }
}
