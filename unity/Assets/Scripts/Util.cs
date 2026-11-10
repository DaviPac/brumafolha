// Shared helpers: seeded randomness, noise, ordered dithering and color ramps, a pixel buffer, dice.
// Ported from src/util.js; the integer math follows JavaScript's exactly, so the same seeds paint the same valley.
using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;
using UnityEngine;

namespace Brumafolha
{
    /// <summary>A colour with 0..255 channels, kept as doubles like the JS arrays it replaces.</summary>
    public struct Col
    {
        public double r, g, b, a;
        public Col(double r, double g, double b, double a = 255) { this.r = r; this.g = g; this.b = b; this.a = a; }
        public Col Mul(double k) => new Col(r * k, g * k, b * k, a);
        public Color ToColor(double alpha = 1) => new Color((float)(r / 255), (float)(g / 255), (float)(b / 255), (float)alpha);
        public static Col Hex(string h)
        {
            if (h.Length == 4) h = "#" + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
            int n = Convert.ToInt32(h.Substring(1, 6), 16);
            return new Col((n >> 16) & 255, (n >> 8) & 255, n & 255);
        }
        public static readonly Col White = new Col(255, 255, 255);
    }

    public static class U
    {
        public const int TILE = 32;

        /// <summary>JavaScript's ToInt32: truncate, then wrap into a signed 32-bit integer.</summary>
        public static int ToInt32(double v)
        {
            if (double.IsNaN(v) || double.IsInfinity(v)) return 0;
            if (v > -2147483648.0 && v < 2147483648.0) return (int)v;
            double m = Math.Truncate(v) % 4294967296.0;
            if (m < 0) m += 4294967296.0;
            return unchecked((int)(uint)m);
        }

        public static double Hash2(double x, double y, double s = 0)
        {
            int h = ToInt32(x * 374761393.0 + y * 668265263.0 + s * 2147483647.0);
            uint hu = unchecked((uint)h);
            hu = unchecked((uint)((int)(hu ^ (hu >> 13)) * 1274126177));
            return (hu ^ (hu >> 16)) / 4294967296.0;
        }

        static double Smooth(double t) => t * t * (3 - 2 * t);
        public static double VNoise(double x, double y, double s = 0)
        {
            double xi = Math.Floor(x), yi = Math.Floor(y), xf = x - xi, yf = y - yi;
            double a = Hash2(xi, yi, s), b = Hash2(xi + 1, yi, s), c = Hash2(xi, yi + 1, s), d = Hash2(xi + 1, yi + 1, s);
            double u = Smooth(xf), v = Smooth(yf);
            return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
        }
        public static double Fbm(double x, double y, double s = 0, int oct = 4)
        {
            double v = 0, amp = 0.5, f = 1, tot = 0;
            for (int i = 0; i < oct; i++) { v += VNoise(x * f, y * f, s + i * 17) * amp; tot += amp; amp *= 0.5; f *= 2; }
            return v / tot;
        }

        static readonly int[] BAYER = { 0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5 };
        public static double Bayer(double x, double y) => (BAYER[(ToInt32(y) & 3) * 4 + (ToInt32(x) & 3)] + 0.5) / 16;

        public static Col[] Ramp(params string[] hs)
        {
            var r = new Col[hs.Length];
            for (int i = 0; i < hs.Length; i++) r[i] = Col.Hex(hs[i]);
            return r;
        }
        public static Col[] Ramp(params int[][] cs)
        {
            var r = new Col[cs.Length];
            for (int i = 0; i < cs.Length; i++) r[i] = new Col(cs[i][0], cs[i][1], cs[i][2]);
            return r;
        }
        public static Col[] Scale(Col[] r, double k) { var o = new Col[r.Length]; for (int i = 0; i < r.Length; i++) o[i] = r[i].Mul(k); return o; }
        public static Col[] Slice(Col[] r, int n) { var o = new Col[Math.Min(n, r.Length)]; Array.Copy(r, o, o.Length); return o; }

        /// <summary>Pick a ramp step from a 0..1 value with ordered dithering between steps.</summary>
        public static Col RampAt(Col[] r, double v, double x, double y)
        {
            double f = Math.Max(0, Math.Min(0.9999, v)) * (r.Length - 1);
            int i = (int)Math.Floor(f);
            return r[Math.Min(r.Length - 1, i + (f - i > Bayer(x, y) ? 1 : 0))];
        }

        public static double Clamp(double v, double a = 0, double b = 1) => v < a ? a : v > b ? b : v;
        public static float Clampf(float v, float a = 0, float b = 1) => v < a ? a : v > b ? b : v;
        public static double Lerp(double a, double b, double t) => a + (b - a) * t;
        public static float Dist(float ax, float ay, float bx, float by) => Mathf.Sqrt((ax - bx) * (ax - bx) + (ay - by) * (ay - by));
        public static double DistD(double ax, double ay, double bx, double by) => Math.Sqrt((ax - bx) * (ax - bx) + (ay - by) * (ay - by));

        public static double SegDist(double px, double py, double ax, double ay, double bx, double by)
        {
            double dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
            double t = l != 0 ? Clamp(((px - ax) * dx + (py - ay) * dy) / l) : 0;
            double ex = px - ax - dx * t, ey = py - ay - dy * t;
            return Math.Sqrt(ex * ex + ey * ey);
        }

        // ------------------------------------------------------------ randomness that isn't seeded (dice, jitter)
        static readonly System.Random rnd = new System.Random();
        public static float Rand() { lock (rnd) return (float)rnd.NextDouble(); }
        public static int RollDie(int n) => 1 + (int)Math.Floor(Rand() * n);
        public static T Pick<T>(IList<T> a) => a[(int)(Rand() * a.Count) % a.Count];

        public struct RollResult { public int total; public List<int> rolls; public int mod; }
        static readonly Regex DICE = new Regex(@"^(\d+)d(\d+)([+-]\d+)?$");
        /// <summary>"2d6+3" -> total and the individual dice.</summary>
        public static RollResult Roll(string expr)
        {
            var m = DICE.Match(expr);
            var rolls = new List<int>();
            int n = int.Parse(m.Groups[1].Value), sides = int.Parse(m.Groups[2].Value);
            for (int i = 0; i < n; i++) rolls.Add(RollDie(sides));
            int tot = 0; foreach (var r in rolls) tot += r;
            int mod = m.Groups[3].Success ? int.Parse(m.Groups[3].Value) : 0;
            return new RollResult { total = tot + mod, rolls = rolls, mod = mod };
        }
        /// <summary>Strip a trailing "+3" / "-1" from a dice expression.</summary>
        public static string DiceOnly(string expr) => Regex.Replace(expr, @"[+-]\d+$", "");
        public static int DiceMod(string expr) { var m = Regex.Match(expr, @"[+-]\d+$"); return m.Success ? int.Parse(m.Value) : 0; }
        public static string FmtMod(int m) => m > 0 ? "+" + m : m < 0 ? m.ToString() : "";
        public static string Signed(int m) => m >= 0 ? "+" + m : m.ToString();
    }

    /// <summary>mulberry32, as in the JS: the same seed gives the same sequence.</summary>
    public class Rng
    {
        uint s;
        public Rng(double seed = 1) { s = unchecked((uint)U.ToInt32(seed)); if (s == 0) s = 1; }
        public double Next()
        {
            unchecked
            {
                uint t = (s += 0x6D2B79F5u);
                t = (t ^ (t >> 15)) * (t | 1u);
                t ^= t + (t ^ (t >> 7)) * (t | 61u);
                return (t ^ (t >> 14)) / 4294967296.0;
            }
        }
        public double Range(double a, double b) => a + (b - a) * Next();
        public int Int(double a, double b) => (int)Math.Floor(Range(a, b + 1));
        public T Pick<T>(IList<T> arr) => arr[(int)Math.Floor(Next() * arr.Count)];
        public bool Chance(double p) => Next() < p;
    }

    /// <summary>A pixel buffer you poke into, then turn into a texture. Row 0 is the top.</summary>
    public class PixBuf
    {
        public readonly int w, h;
        public readonly byte[] d;
        public PixBuf(int w, int h) { this.w = w; this.h = h; d = new byte[w * h * 4]; }

        static byte U8(double v) => double.IsNaN(v) || v <= 0 ? (byte)0 : v >= 255 ? (byte)255 : (byte)Math.Round(v, MidpointRounding.ToEven);

        public void Set(double fx, double fy, Col c, double a = 255)
        {
            int x = U.ToInt32(fx), y = U.ToInt32(fy);
            if (x < 0 || y < 0 || x >= w || y >= h) return;
            int i = (y * w + x) * 4;
            if (a >= 255) { d[i] = U8(c.r); d[i + 1] = U8(c.g); d[i + 2] = U8(c.b); d[i + 3] = 255; return; }
            double f = a / 255, g = d[i + 3] / 255.0, na = f + g * (1 - f);
            if (na <= 0) return;
            d[i] = U8((c.r * f + d[i] * g * (1 - f)) / na);
            d[i + 1] = U8((c.g * f + d[i + 1] * g * (1 - f)) / na);
            d[i + 2] = U8((c.b * f + d[i + 2] * g * (1 - f)) / na);
            d[i + 3] = U8(na * 255);
        }
        public void Set(double x, double y, Col? c, double a = 255) { if (c.HasValue) Set(x, y, c.Value, a); }
        public void Clear(double fx, double fy)
        {
            int x = U.ToInt32(fx), y = U.ToInt32(fy);
            if (x < 0 || y < 0 || x >= w || y >= h) return;
            int i = (y * w + x) * 4; d[i] = d[i + 1] = d[i + 2] = d[i + 3] = 0;
        }
        public Col? Get(int x, int y)
        {
            if (x < 0 || y < 0 || x >= w || y >= h) return null;
            int i = (y * w + x) * 4;
            return d[i + 3] != 0 ? new Col(d[i], d[i + 1], d[i + 2], d[i + 3]) : (Col?)null;
        }
        public int Alpha(double fx, double fy)
        {
            int x = U.ToInt32(fx), y = U.ToInt32(fy);
            return x < 0 || y < 0 || x >= w || y >= h ? 0 : d[(y * w + x) * 4 + 3];
        }
        public void Rect(int x, int y, int rw, int rh, Col c) { for (int j = 0; j < rh; j++) for (int i = 0; i < rw; i++) Set(x + i, y + j, c); }
        /// <summary>Dark outline around everything opaque (4-neighbour).</summary>
        public PixBuf Outline(Col c)
        {
            var add = new List<int>();
            for (int y = 0; y < h; y++)
                for (int x = 0; x < w; x++)
                    if (Alpha(x, y) == 0 && (Alpha(x - 1, y) > 128 || Alpha(x + 1, y) > 128 || Alpha(x, y - 1) > 128 || Alpha(x, y + 1) > 128)) { add.Add(x); add.Add(y); }
            for (int i = 0; i < add.Count; i += 2) Set(add[i], add[i + 1], c);
            return this;
        }
        public PixBuf Copy() { var p = new PixBuf(w, h); Array.Copy(d, p.d, d.Length); return p; }
        public Img ToImg() => Img.From(this);
    }

    /// <summary>A picture on the GPU: a texture and the part of it this picture uses (top-left origin, in pixels).</summary>
    public class Img
    {
        public Texture2D tex;
        public int x, y, w, h;
        public int width => w;
        public int height => h;

        public static Texture2D NewTex(int w, int h, bool point = true)
        {
            var t = new Texture2D(w, h, TextureFormat.RGBA32, false);
            t.filterMode = point ? FilterMode.Point : FilterMode.Bilinear;
            t.wrapMode = TextureWrapMode.Clamp;
            return t;
        }
        /// <summary>Upload a top-down RGBA byte buffer (flipped, since textures start at the bottom).</summary>
        public static void Upload(Texture2D t, byte[] d, int w, int h)
        {
            var flipped = new byte[d.Length];
            int row = w * 4;
            for (int y = 0; y < h; y++) Buffer.BlockCopy(d, y * row, flipped, (h - 1 - y) * row, row);
            t.LoadRawTextureData(flipped);
            t.Apply(false, false);
        }
        public static Img From(PixBuf pb)
        {
            var t = NewTex(pb.w, pb.h);
            Upload(t, pb.d, pb.w, pb.h);
            return new Img { tex = t, x = 0, y = 0, w = pb.w, h = pb.h };
        }
        public static Img From(byte[] d, int w, int h, bool point = true)
        {
            var t = NewTex(w, h, point);
            Upload(t, d, w, h);
            return new Img { tex = t, x = 0, y = 0, w = w, h = h };
        }
        public Img Sub(int sx, int sy, int sw, int sh) => new Img { tex = tex, x = x + sx, y = y + sy, w = sw, h = sh };
    }
}
