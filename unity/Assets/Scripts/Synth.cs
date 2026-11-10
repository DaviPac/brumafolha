// A small Web Audio work-alike, so the synthesized music and effects of src/audio.js port almost line for line:
// oscillators, noise buffers, biquad filters, gains with automated parameters, a reverb, a compressor. The graph is
// pulled one sample at a time on Unity's audio thread (OnAudioFilterRead); the game thread builds voices under a lock.
using System;
using System.Collections.Generic;
using UnityEngine;

namespace Brumafolha
{
    public class AParam
    {
        enum Kind { Set, Linear, Exp, Target, Curve }
        struct Ev { public Kind k; public double t, v, tc, dur; public float[] curve; }
        readonly List<Ev> q = new List<Ev>();
        double cur, lastT, lastV;
        int mode; double tgt, tc, tStart, vStart; float[] curve; double cT0, cDur; // mode 0 hold, 1 target, 2 curve
        public readonly List<ANode> inputs = new List<ANode>();

        public AParam(double v) { cur = lastV = v; }
        public double value { get => cur; set { cur = lastV = value; mode = 0; } }

        void Add(Ev e) { int i = q.Count; while (i > 0 && q[i - 1].t > e.t) i--; q.Insert(i, e); }
        public void SetValueAtTime(double v, double t) => Add(new Ev { k = Kind.Set, t = t, v = v });
        public void LinearRampToValueAtTime(double v, double t) => Add(new Ev { k = Kind.Linear, t = t, v = v });
        public void ExponentialRampToValueAtTime(double v, double t) => Add(new Ev { k = Kind.Exp, t = t, v = v });
        public void SetTargetAtTime(double v, double t, double tc) => Add(new Ev { k = Kind.Target, t = t, v = v, tc = Math.Max(1e-4, tc) });
        public void SetValueCurveAtTime(float[] c, double t, double dur) => Add(new Ev { k = Kind.Curve, t = t, curve = c, dur = dur });
        public void CancelScheduledValues(double t) { q.RemoveAll(e => e.t >= t); }

        public double Value(double t, long n)
        {
            while (q.Count > 0)
            {
                var e = q[0];
                if (e.k == Kind.Linear || e.k == Kind.Exp)
                {
                    if (t >= e.t) { cur = lastV = e.v; lastT = e.t; mode = 0; q.RemoveAt(0); continue; }
                    double span = e.t - lastT, k = span <= 0 ? 1 : (t - lastT) / span;
                    if (k < 0) k = 0;
                    if (e.k == Kind.Linear || lastV == 0 || e.v == 0 || (lastV > 0) != (e.v > 0)) cur = lastV + (e.v - lastV) * k;
                    else cur = lastV * Math.Pow(e.v / lastV, k);
                    return cur + Mod(n);
                }
                if (t < e.t) break;
                if (e.k == Kind.Set) { cur = lastV = e.v; lastT = e.t; mode = 0; }
                else if (e.k == Kind.Target) { mode = 1; tgt = e.v; tc = e.tc; tStart = e.t; vStart = cur; }
                else { mode = 2; curve = e.curve; cT0 = e.t; cDur = e.dur; }
                q.RemoveAt(0);
            }
            if (mode == 1) { cur = tgt + (vStart - tgt) * Math.Exp(-(t - tStart) / tc); lastT = t; lastV = cur; }
            else if (mode == 2)
            {
                double k = (t - cT0) / cDur;
                if (k >= 1) { cur = curve[curve.Length - 1]; mode = 0; }
                else { double f = Math.Max(0, k) * (curve.Length - 1); int i = (int)f; double fr = f - i; cur = curve[i] + (curve[Math.Min(curve.Length - 1, i + 1)] - curve[i]) * fr; }
                lastT = t; lastV = cur;
            }
            return cur + Mod(n);
        }
        double Mod(long n)
        {
            if (inputs.Count == 0) return 0;
            double s = 0;
            for (int i = inputs.Count - 1; i >= 0; i--) { var a = inputs[i]; s += a.Out(n); if (a.Dead) inputs.RemoveAt(i); }
            return s;
        }
    }

    public abstract class ANode
    {
        public readonly List<ANode> inputs = new List<ANode>();
        public bool persistent, killed;
        bool dead;
        long lastN = -1; float last;
        public bool Dead => dead || killed;
        public float Out(long n)
        {
            if (n != lastN) { lastN = n; last = dead ? 0 : Compute(n, Synth.T(n)); }
            return last;
        }
        protected abstract float Compute(long n, double t);
        protected float SumInputs(long n)
        {
            float s = 0;
            for (int i = inputs.Count - 1; i >= 0; i--) { var a = inputs[i]; s += a.Out(n); if (a.Dead) inputs.RemoveAt(i); }
            if (inputs.Count == 0 && !persistent && hadInput) dead = true;
            return s;
        }
        protected bool hadInput;
        protected void Die() { dead = true; }
        public T Connect<T>(T to) where T : ANode { to.inputs.Add(this); to.hadInput = true; return to; }
        public void Connect(AParam p) { p.inputs.Add(this); }
        public void Kill() { killed = true; }
    }

    public class AGain : ANode
    {
        public readonly AParam gain;
        public AGain(double v) { gain = new AParam(v); }
        protected override float Compute(long n, double t) { float s = SumInputs(n); return s == 0 && gain.inputs.Count == 0 ? 0 : (float)(s * gain.Value(t, n)); }
    }

    public class AOsc : ANode
    {
        public string type;
        public readonly AParam frequency, detune = new AParam(0);
        double start = double.MaxValue, stop = double.MaxValue, phase;
        public AOsc(string type, double f) { this.type = type; frequency = new AParam(f); }
        public void Start(double t) => start = t;
        public void Stop(double t) => stop = t;
        protected override float Compute(long n, double t)
        {
            if (t >= stop) { Die(); return 0; }
            if (t < start) return 0;
            double f = frequency.Value(t, n);
            double det = detune.Value(t, n);
            if (det != 0) f *= Math.Pow(2, det / 1200);
            double dt = f / Synth.rate;
            phase += dt; phase -= Math.Floor(phase);
            double p = phase, v;
            switch (type)
            {
                case "sine": v = Math.Sin(p * 2 * Math.PI); break;
                case "triangle": v = p < 0.5 ? 4 * p - 1 : 3 - 4 * p; break;
                case "square": v = (p < 0.5 ? 1 : -1) + Blep(p, dt) - Blep((p + 0.5) % 1, dt); break;
                default: v = 2 * p - 1 - Blep(p, dt); break; // sawtooth
            }
            return (float)v;
        }
        static double Blep(double t, double dt)
        {
            dt = Math.Abs(dt);
            if (dt <= 0) return 0;
            if (t < dt) { t /= dt; return t + t - t * t - 1; }
            if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
            return 0;
        }
    }

    public class ABufSrc : ANode
    {
        public float[] buffer; public bool loop;
        double start = double.MaxValue, stop = double.MaxValue; long pos = -1; long offset;
        public void Start(double t, double off = 0) { start = t; offset = (long)(off * Synth.rate); }
        public void Stop(double t) => stop = t;
        protected override float Compute(long n, double t)
        {
            if (t >= stop) { Die(); return 0; }
            if (t < start) return 0;
            if (pos < 0) pos = offset;
            if (pos >= buffer.Length) { if (loop) pos %= buffer.Length; else { Die(); return 0; } }
            return buffer[pos++];
        }
    }

    public class ABiquad : ANode
    {
        public string type;
        public readonly AParam frequency, Q;
        double b0, b1, b2, a1, a2, x1, x2, y1, y2;
        int k;
        public ABiquad(string type, double f, double q) { this.type = type; frequency = new AParam(f); Q = new AParam(q); }
        void Coef(double f, double q)
        {
            f = Math.Max(10, Math.Min(Synth.rate * 0.49, f));
            double w0 = 2 * Math.PI * f / Synth.rate, cw = Math.Cos(w0), sw = Math.Sin(w0), a0;
            if (type == "bandpass")
            {
                double al = sw / (2 * Math.Max(1e-4, q));
                b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al;
            }
            else
            {
                // lowpass / highpass: Web Audio reads Q as the resonance in dB
                double al = sw / (2 * Math.Pow(10, q / 20));
                if (type == "highpass") { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = (1 + cw) / 2; }
                else { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = (1 - cw) / 2; }
                a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al;
            }
            b0 /= a0; b1 /= a0; b2 /= a0; a1 /= a0; a2 /= a0;
        }
        protected override float Compute(long n, double t)
        {
            float x = SumInputs(n);
            double f = frequency.Value(t, n), q = Q.Value(t, n);
            if ((k++ & 15) == 0) Coef(f, q);
            double y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
            if (double.IsNaN(y) || Math.Abs(y) > 1e6) y = 0;
            x2 = x1; x1 = x; y2 = y1; y1 = y;
            return (float)y;
        }
    }

    /// <summary>A soft hall (the convolver's noise impulse, as a Schroeder reverb).</summary>
    public class AReverb : ANode
    {
        readonly float[][] combs; readonly int[] ci; readonly float[] cf;
        readonly float[][] aps; readonly int[] ai;
        float lp;
        public AReverb()
        {
            persistent = true;
            int[] cl = { 1557, 1617, 1491, 1422, 1277, 1356 }, al = { 225, 556, 441 };
            double sc = Synth.rate / 44100.0;
            combs = new float[cl.Length][]; ci = new int[cl.Length]; cf = new float[cl.Length];
            for (int i = 0; i < cl.Length; i++) { combs[i] = new float[(int)(cl[i] * sc * 1.6)]; cf[i] = 0.86f; }
            aps = new float[al.Length][]; ai = new int[al.Length];
            for (int i = 0; i < al.Length; i++) aps[i] = new float[(int)(al[i] * sc)];
        }
        protected override float Compute(long n, double t)
        {
            float x = SumInputs(n) * 0.12f, o = 0;
            for (int i = 0; i < combs.Length; i++)
            {
                var b = combs[i]; float y = b[ci[i]];
                lp = y * 0.6f + lp * 0.4f;
                b[ci[i]] = x + lp * cf[i];
                ci[i] = (ci[i] + 1) % b.Length;
                o += y;
            }
            for (int i = 0; i < aps.Length; i++)
            {
                var b = aps[i]; float y = b[ai[i]];
                b[ai[i]] = o + y * 0.5f;
                o = y - o * 0.5f;
                ai[i] = (ai[i] + 1) % b.Length;
            }
            return o;
        }
    }

    /// <summary>The glue compressor and the brick-wall limiter after it, in one.</summary>
    public class ADynamics : ANode
    {
        float env = 0;
        public ADynamics() { persistent = true; }
        protected override float Compute(long n, double t)
        {
            float x = SumInputs(n), a = Mathf.Abs(x);
            float att = 1 - Mathf.Exp(-1f / (0.005f * (float)Synth.rate)), rel = 1 - Mathf.Exp(-1f / (0.2f * (float)Synth.rate));
            env += (a - env) * (a > env ? att : rel);
            float thr = 0.158f; // -16 dB
            float g = 1;
            if (env > thr) g = Mathf.Pow(env / thr, 1f / 4 - 1);
            float y = x * g * 1.6f;
            // limiter at -3 dB, soft
            const float L = 0.708f;
            if (Mathf.Abs(y) > L * 0.8f) y = Mathf.Sign(y) * (L * 0.8f + (L * 0.2f) * (float)Math.Tanh((Mathf.Abs(y) - L * 0.8f) / (L * 0.2f)));
            return y;
        }
    }

    /// <summary>The graph's clock and output. Lives on the camera next to the AudioListener.</summary>
    public class Synth : MonoBehaviour
    {
        public static readonly object Lock = new object();
        public static double rate = 48000;
        static long sampleN;
        public static ADynamics output;
        static volatile bool ready;
        public static double T(long n) => n / rate;
        /// <summary>Like AudioContext.currentTime.</summary>
        public static double now => sampleN / rate;

        public static void Init()
        {
            rate = AudioSettings.outputSampleRate;
            output = new ADynamics();
            ready = true;
        }

        void OnAudioFilterRead(float[] data, int channels)
        {
            if (!ready) return;
            lock (Lock)
            {
                for (int i = 0; i < data.Length; i += channels)
                {
                    float s = output.Out(sampleN);
                    sampleN++;
                    for (int c = 0; c < channels; c++) data[i + c] += s;
                }
            }
        }
    }
}
