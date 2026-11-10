// Props, painted in code: trees, pines, dead trees, rocks, bushes, ferns, ruins, camp things, the dock posts.
// Everything is lit from the top left, stepped through hard ramps with ordered dithering, and outlined dark.
// Ported from src/art/props.js.
using System;
using System.Collections.Generic;

namespace Brumafolha
{
    public class Sway { public int top, bottom; public double amp; }
    public class CanopyBox { public int x, y, w, h; }
    /// <summary>A prop's picture, anchored at (ox, oy) on its foot. Swaying plants also carry `trunk` and `leaves` layers.</summary>
    public class Art
    {
        public Img c, trunk, leaves;
        public Sway sway;
        public int ox, oy, shadow;
        public CanopyBox canopy;
    }
    public class GrassArt { public Img[] frames; public int ox, oy; }

    public static class Props
    {
        static readonly Col INK = new Col(24, 18, 30);
        static readonly double[] L = MakeL();
        static double[] MakeL() { double[] v = { -0.55, -0.65, 0.55 }; double n = Math.Sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]); return new[] { v[0] / n, v[1] / n, v[2] / n }; }

        public static readonly Col[] leaf = U.Ramp("#16301c", "#1f4522", "#2c5f28", "#3f7a2e", "#5a9a36", "#7cb840", "#a3d052");
        public static readonly Col[] leafDark = U.Ramp("#121f22", "#172d2a", "#1f3f30", "#2a5436", "#386a3c", "#4f8444");
        public static readonly Col[] autumn = U.Ramp("#3a1418", "#5c1f1c", "#8a3220", "#b44f24", "#d8782e", "#f0a640");
        public static readonly Col[] bark = U.Ramp("#22111a", "#381b22", "#52282c", "#6c3834", "#8a4c40");
        public static readonly Col[] barkDead = U.Ramp("#1c0f1e", "#2e1830", "#47223e", "#62304a", "#7c4258");
        public static readonly Col[] stone = U.Ramp("#262a30", "#383e44", "#4c5458", "#636c6c", "#7e8882", "#a0a89c");
        public static readonly Col[] moss = U.Ramp("#2c4a22", "#3f6a2a", "#5a8a32", "#7aa83c");
        public static readonly Col[] wood = U.Ramp("#3a1e14", "#5a2e1c", "#7e4426", "#a35e32", "#c67c42", "#e0a058");
        public static readonly Col[][] cloth = { U.Ramp("#3a1c26", "#5e2a32", "#8a3c3c", "#b0564a", "#cc7a5e"), U.Ramp("#1c2a3e", "#284060", "#36587e", "#4c76a0", "#6e98bc") };
        public static readonly Col[] bone = U.Ramp("#5a5244", "#8a806a", "#bcb298", "#e8e0c8");

        class Sph { public double x, y, r, sy = 1, b, z; public Col[] ramp; }

        /// <summary>Shade a set of spheres into a buffer: the nearest sphere at each pixel wins, lit by its normal.</summary>
        static void Spheres(PixBuf pb, List<Sph> list, double tex = 0.18, double texScale = 3, double seed = 1, bool rim = true)
        {
            for (int y = 0; y < pb.h; y++)
                for (int x = 0; x < pb.w; x++)
                {
                    Sph best = null; double bz = -1e9, bdx = 0, bdy = 0, bzz = 0;
                    foreach (var s in list)
                    {
                        double dx = (x - s.x) / s.r, dy = (y - s.y) / (s.r * s.sy);
                        double q = dx * dx + dy * dy;
                        if (q > 1) continue;
                        double z = Math.Sqrt(1 - q);
                        double zz = s.y + z * s.r * 0.6 + s.z;
                        if (zz > bz) { bz = zz; best = s; bdx = dx; bdy = dy; bzz = z; }
                    }
                    if (best == null) continue;
                    double v = (bdx * L[0] + bdy * L[1] + bzz * L[2]) * 0.55 + 0.42 + best.b;
                    v += (U.VNoise(x / texScale, y / texScale, seed) - 0.5) * tex * 2;
                    if (rim && bdy > 0.7) v -= 0.15;
                    pb.Set(x, y, U.RampAt(best.ramp, U.Clamp(v), x, y));
                }
        }

        static void LeafCanopy(PixBuf pb, Rng R, double cx, double cy, double rx, double ry, Col[] rp, int n)
        {
            var list = new List<Sph>();
            for (int i = 0; i < n; i++)
            {
                double a = R.Range(0, Math.PI * 2), d = Math.Sqrt(R.Next());
                double r = R.Range(0.32, 0.5) * Math.Min(rx, ry) * 1.2;
                list.Add(new Sph { x = cx + Math.Cos(a) * d * (rx - r * 0.7), y = cy + Math.Sin(a) * d * (ry - r * 0.7), r = r, sy = 0.85, ramp = rp, b = R.Range(-0.05, 0.08) });
            }
            list.Add(new Sph { x = cx, y = cy - ry * 0.1, r = Math.Min(rx, ry) * 0.75, sy = 0.85, ramp = rp, b = 0.05 });
            Spheres(pb, list, 0.22, 2.2, R.Int(1, 999));
            // leaf clumps: tiny highlight and shadow specks, the texture of foliage
            for (int k = 0; k < rx * ry * 0.5; k++)
            {
                int x = R.Int(0, pb.w - 1), y = R.Int(0, pb.h - 1);
                if (pb.Alpha(x, y) < 200 || pb.Alpha(x, y - 2) < 200) continue;
                bool up = y < cy - ry * 0.1 + (x - cx) * 0.3;
                pb.Set(x, y, rp[up ? rp.Length - 1 : 1]);
                pb.Set(x + 1, y, rp[up ? rp.Length - 2 : 0]);
                if (up) pb.Set(x, y + 1, rp[rp.Length - 3]);
            }
        }

        /// <summary>A trunk `h` tall with roots flaring at the base; `ext` carries it further up, straight, into the canopy.</summary>
        static void Trunk(PixBuf pb, double cx, double bse, double w, double h, Col[] rp, double ext = 0)
        {
            for (double y = bse - h - ext; y <= bse; y++)
            {
                double t = (y - (bse - h)) / h;
                double flare = t > 0.7 ? Math.Pow((t - 0.7) / 0.3, 2) * w * 0.9 : 0;
                double hw = w / 2 + flare + Math.Sin(y * 0.5) * 0.4;
                for (double x = Math.Floor(cx - hw); x <= Math.Ceiling(cx + hw); x++)
                {
                    double u = (x - (cx - hw)) / (2 * hw);
                    double v = 0.85 - u * 0.75 + (U.VNoise(x / 1.5, y / 6, 3) - 0.5) * 0.4;
                    if (U.Hash2(x, Math.Floor(y / 4), 7) > 0.9) v -= 0.3; // bark furrows
                    pb.Set(x, y, U.RampAt(rp, U.Clamp(v), x, y));
                }
            }
        }

        /// <summary>
        /// Wind: the trunk and the leaves as separate layers, so the renderer can slide the leaves sideways row by row as the
        /// wind blows (most at `top`, nothing at `bottom`, where they meet the trunk or the ground). `c` is the still picture.
        /// </summary>
        static Art Swayable(PixBuf bse, PixBuf leaves, int top, int bottom, double amp)
        {
            var still = bse.Copy();
            for (int i = 0; i < leaves.d.Length; i += 4) if (leaves.d[i + 3] != 0) Array.Copy(leaves.d, i, still.d, i, 4);
            still.Outline(INK);
            bse.Outline(INK);
            leaves.Outline(INK);
            return new Art { c = still.ToImg(), trunk = bse.ToImg(), leaves = leaves.ToImg(), sway = new Sway { top = top, bottom = bottom, amp = amp } };
        }

        public static Art MakeTree(int seed)
        {
            var R = new Rng(seed); int W = 100, H = 118;
            var pb = new PixBuf(W, H); var leaves = new PixBuf(W, H);
            bool aut = R.Chance(0.1);
            // the trunk goes on up into the middle of the canopy, so no gap can open between them however the leaves fall
            Trunk(pb, 50, 112, R.Range(9, 13), 44, bark, 20);
            LeafCanopy(leaves, R, 50, 46, R.Range(36, 44), R.Range(30, 36), aut ? autumn : leaf, R.Int(9, 13));
            var a = Swayable(pb, leaves, 8, 84, 3.2);
            a.ox = 50; a.oy = 112; a.canopy = new CanopyBox { x = 6, y = 6, w = 88, h = 80 }; a.shadow = 34;
            return a;
        }

        public static Art MakePine(int seed)
        {
            var R = new Rng(seed); int W = 64, H = 112;
            var bse = new PixBuf(W, H); var pb = new PixBuf(W, H);
            Trunk(bse, 32, 106, 7, 22, bark, 14);
            int tiers = R.Int(4, 5);
            for (int t = 0; t < tiers; t++)
            {
                double top = 6 + t * 17, bot = top + 34, hw = 9 + t * 5.5;
                for (double y = top; y < bot; y++)
                {
                    double k = (y - top) / (bot - top);
                    double half = hw * Math.Pow(k, 0.8) + Math.Sin(y * 1.3 + t) * 1.2;
                    for (double x = Math.Floor(32 - half); x <= Math.Ceiling(32 + half); x++)
                    {
                        double u = (x - 32) / Math.Max(1, half);
                        double v = 0.62 - u * 0.38 - k * 0.32 + (U.VNoise(x / 2, y / 2, t * 9 + seed) - 0.5) * 0.35;
                        if (k > 0.88) v -= 0.25;
                        pb.Set(x, y, U.RampAt(leafDark, U.Clamp(v), x, y));
                    }
                }
            }
            var a = Swayable(bse, pb, 6, 96, 2.2);
            a.ox = 32; a.oy = 106; a.canopy = new CanopyBox { x = 4, y = 0, w = 56, h = 84 }; a.shadow = 22;
            return a;
        }

        public static PixBuf DeadTreeBuf(int seed)
        {
            var R = new Rng(seed); int W = 96, H = 110;
            var pb = new PixBuf(W, H);
            var rp = barkDead;
            void Branch(double x, double y, double a, double len, double w, int depth)
            {
                for (int s = 0; s < len; s++)
                {
                    double bx = x + Math.Cos(a) * s, by = y + Math.Sin(a) * s, ww = Math.Max(1, w * (1 - s / len * 0.6));
                    for (double j = -ww; j <= ww; j++)
                        for (double i = -ww; i <= ww; i++)
                        {
                            if (i * i + j * j > ww * ww) continue;
                            double v = 0.55 - (i + j) / (ww * 2.5) + (U.VNoise((bx + i) / 2, (by + j) / 2, 4) - 0.5) * 0.3;
                            pb.Set(bx + i, by + j, U.RampAt(rp, U.Clamp(v), bx + i, by + j));
                        }
                    a += R.Range(-0.08, 0.08);
                }
                if (depth <= 0) return;
                double ex = x + Math.Cos(a) * len, ey = y + Math.Sin(a) * len;
                int k = R.Int(2, 3);
                for (int i = 0; i < k; i++) Branch(ex, ey, a + R.Range(-0.9, 0.9), len * R.Range(0.55, 0.75), w * 0.6, depth - 1);
            }
            Branch(48, 104, -Math.PI / 2 + R.Range(-0.15, 0.15), 34, 5, 3);
            pb.Outline(INK);
            return pb;
        }
        public static Art MakeDeadTree(int seed) => new Art { c = DeadTreeBuf(seed).ToImg(), ox = 48, oy = 104, canopy = new CanopyBox { x = 0, y = 0, w = 96, h = 70 }, shadow = 16 };

        public static Art MakeRock(int seed, bool wet = false)
        {
            var R = new Rng(seed); int W = 30, H = 22;
            var pb = new PixBuf(W, H);
            int n = R.Int(2, 4); var list = new List<Sph>();
            for (int i = 0; i < n; i++) list.Add(new Sph { x = 15 + R.Range(-6, 6), y = 13 + R.Range(-2, 2), r = R.Range(5, 8.5), sy = 0.8, ramp = stone, b = R.Range(-0.05, 0.05) });
            Spheres(pb, list, 0.25, 1.6, seed);
            if (!wet) for (int y = 0; y < H; y++) for (int x = 0; x < W; x++)
                        if (pb.Alpha(x, y) != 0 && pb.Alpha(x, y - 2) != 0 && pb.Alpha(x, y - 3) == 0 && U.Fbm(x / 3.0, y / 3.0, seed, 2) > 0.45) pb.Set(x, y, U.RampAt(moss, 0.6, x, y));
            pb.Outline(INK);
            if (wet) for (int x = 0; x < W; x++) for (int y = H - 1; y > 0; y--) if (pb.Alpha(x, y) != 0) { pb.Set(x, y + 1, new Col(150, 230, 220), 160); break; }
            return new Art { c = pb.ToImg(), ox = 15, oy = 19, shadow = 10 };
        }

        public static Art MakeBush(int seed)
        {
            var R = new Rng(seed); int W = 40, H = 32;
            var pb = new PixBuf(W, H);
            var list = new List<Sph>();
            int n = R.Int(4, 7);
            for (int i = 0; i < n; i++) list.Add(new Sph { x = 20 + R.Range(-10, 10), y = 19 + R.Range(-5, 3), r = R.Range(5, 9), sy = 0.85, ramp = leaf, b = R.Range(-0.05, 0.1) });
            Spheres(pb, list, 0.35, 1.3, seed);
            for (int k = 0; k < 40; k++) { int x = R.Int(2, W - 3), y = R.Int(2, H - 3); if (pb.Alpha(x, y) != 0 && pb.Alpha(x, y - 2) == 0) { pb.Set(x, y - 1, leaf[5]); pb.Set(x + 1, y - 2, leaf[6]); } }
            if (R.Chance(0.4))
            {
                var berry = R.Chance(0.5) ? U.Ramp("#8a1e2a", "#e04a4a") : U.Ramp("#4a2a8a", "#9a6ae0");
                for (int k = 0; k < 6; k++) { int x = R.Int(6, 28), y = R.Int(6, 20); if (pb.Alpha(x, y) != 0 && pb.Alpha(x, y + 1) != 0) { pb.Set(x, y, berry[1]); pb.Set(x, y + 1, berry[0]); } }
            }
            var a = Swayable(new PixBuf(W, H), pb, 6, 26, 1.6);
            a.ox = 20; a.oy = 27; a.shadow = 13;
            return a;
        }

        public static Art MakeFern(int seed)
        {
            var R = new Rng(seed); int W = 30, H = 22; var pb = new PixBuf(W, H);
            var rp = leaf;
            int fronds = R.Int(5, 7);
            for (int f = 0; f < fronds; f++)
            {
                double a = -Math.PI / 2 + ((double)f / (fronds - 1) - 0.5) * 2.6, len = R.Range(8, 12);
                for (int s = 0; s < len; s++)
                {
                    double bend = s * s * 0.012;
                    double x = 15 + Math.Cos(a) * s, y = 19 + Math.Sin(a) * s + bend * 6;
                    double v = 0.35 + (1 - s / len) * 0.1 + (Math.Cos(a) < 0 ? 0.25 : 0);
                    pb.Set(x, y, U.RampAt(rp, v + 0.2, x, y));
                    if (s > 2 && s % 2 == 0) { pb.Set(x + Math.Sin(a) * 2, y - Math.Cos(a) * 2, rp[4]); pb.Set(x - Math.Sin(a) * 2, y + Math.Cos(a) * 2, rp[2]); }
                }
            }
            pb.Outline(INK);
            return new Art { c = pb.ToImg(), ox = 15, oy = 20, shadow = 0 };
        }

        /// <summary>Tall grass clump, a few sway frames.</summary>
        public static GrassArt MakeTallGrass(int v)
        {
            var frames = new Img[4];
            var R0 = new Rng(v * 101 + 3);
            bool big = v >= 3;
            int n = big ? 16 + R0.Int(0, 6) : 7 + R0.Int(0, 5);
            var blades = new List<(double x, double h, double lean, int c)>();
            for (int i = 0; i < n; i++)
            {
                double u = R0.Next();
                blades.Add(((big ? 3 : 4) + u * (big ? 22 : 12), R0.Range(big ? 9 : 7, big ? 19 : 14) * (1 - Math.Abs(u - 0.5) * 0.6), (u - 0.5) * 1.1 + R0.Range(-0.2, 0.2), R0.Int(0, 2)));
            }
            var P = new[] { U.Ramp("#2b5a22", "#3f7a2a", "#5f9e34", "#86c040"), U.Ramp("#2f5a24", "#4a8a2c", "#72b23a", "#a2d04c"), U.Ramp("#5e5422", "#7e7030", "#a8963e", "#cdb85a") }[v % 3];
            for (int f = 0; f < 4; f++)
            {
                var pb = new PixBuf(big ? 28 : 20, big ? 22 : 18);
                double sway = Math.Sin((f / 4.0) * Math.PI * 2) * 1.2;
                foreach (var b in blades)
                {
                    for (int s = 0; s < b.h; s++)
                    {
                        double k = s / b.h;
                        double x = b.x + (b.lean * s) + sway * k * k;
                        double y = (big ? 21 : 17) - s;
                        pb.Set(x, y, P[k > 0.75 ? 3 : k > 0.35 ? 2 : b.c == 0 ? 0 : 1]);
                        if (k < 0.5) pb.Set(x + 1, y, P[1]);
                    }
                }
                frames[f] = pb.ToImg();
            }
            return new GrassArt { frames = frames, ox = big ? 14 : 10, oy = big ? 21 : 17 };
        }

        public static Art MakeWall(int h, int seed, bool broken)
        {
            int W = 32, faceH = h * 9, topH = 10, H = faceH + topH + 8;
            var pb = new PixBuf(W, H);
            var S = stone;
            int Jag(int x) => broken ? (int)Math.Floor(U.VNoise(x / 4.0, 0, seed) * 6) : 0;
            for (int x = 0; x < W; x++)
            {
                int j = Jag(x);
                // top face
                for (int y = j; y < topH; y++)
                {
                    double v = 0.75 + (U.VNoise(x / 3.0, y / 3.0, seed) - 0.5) * 0.3 - (y == topH - 1 ? 0.2 : 0);
                    pb.Set(x, y + 8, U.RampAt(S, v, x, y));
                }
                // front face, brick courses
                for (int y = 0; y < faceH; y++)
                {
                    int row = y / 9, off = (row & 1) * 8, lx = (x + off) % 16, ly = y % 9;
                    double v = 0.42 + U.Hash2(Math.Floor((x + off) / 16.0), row, seed) * 0.2 - ((double)y / faceH) * 0.15;
                    if (ly == 0) v += 0.18;
                    if (ly == 8 || lx == 0) v = 0.02;
                    pb.Set(x, y + topH + 8, U.RampAt(S, v, x, y));
                }
            }
            // moss creeping over the top and hanging down
            for (int x = 0; x < W; x++)
            {
                if (U.Fbm(x / 5.0, seed, 3, 2) > 0.5)
                {
                    int len = (int)Math.Floor(U.Fbm(x / 3.0, seed, 8, 2) * 12);
                    for (int y = Jag(x); y < topH + len; y++) pb.Set(x, y + 8, U.RampAt(moss, 0.7 - y / 30.0, x, y));
                }
            }
            pb.Outline(INK);
            return new Art { c = pb.ToImg(), ox = 0, oy = H - 1 };
        }

        public static Art MakePillar(int h, int seed, Col[] S = null, bool mossy = true)
        {
            S ??= stone;
            int W = 22, colH = 14 + h * 10, H = colH + 16; var pb = new PixBuf(W, H);
            for (int y = 0; y < colH; y++)
                for (int x = 3; x < 19; x++)
                {
                    double u = (x - 3) / 16.0;
                    double v = 0.8 - Math.Abs(u - 0.3) * 1.1 + (U.VNoise(x / 2.0, y / 3.0, seed) - 0.5) * 0.2;
                    if ((x - 3) % 4 == 0) v -= 0.12; // fluting
                    pb.Set(x, H - 4 - y, U.RampAt(S, U.Clamp(v), x, y));
                }
            // broken top
            for (int x = 3; x < 19; x++)
            {
                int j = mossy ? (int)Math.Floor(U.VNoise(x / 3.0, 1, seed) * 5) : 0; // the Relicário's pillars are whole
                for (int y = 0; y < 5 + j; y++) pb.Set(x, H - 4 - colH + y, U.RampAt(S, 0.85 - y * 0.05, x, y));
            }
            // plinth
            for (int x = 0; x < W; x++) for (int y = 0; y < 5; y++) pb.Set(x, H - 5 + y, U.RampAt(S, 0.6 - y * 0.12 - Math.Abs(x - 8) * 0.01, x, y));
            if (mossy) for (int y = 0; y < colH; y++) if (U.Fbm(y / 4.0, seed, 6, 2) > 0.55) pb.Set(4 + (y % 3), H - 4 - y, moss[2]);
            pb.Outline(INK);
            return new Art { c = pb.ToImg(), ox = 11, oy = H - 1 };
        }

        public static Art MakeRubble(int seed)
        {
            var R = new Rng(seed); var pb = new PixBuf(28, 16);
            var list = new List<Sph>();
            for (int i = 0; i < 4; i++) list.Add(new Sph { x = R.Range(6, 22), y = R.Range(8, 11), r = R.Range(2.5, 4.5), sy = 0.8, ramp = stone });
            Spheres(pb, list, 0.2, 3, seed);
            pb.Outline(INK);
            return new Art { c = pb.ToImg(), ox = 14, oy = 13 };
        }

        public static Art MakeTent(int colorIdx)
        {
            int W = 56, H = 46; var pb = new PixBuf(W, H);
            var C = cloth[colorIdx];
            for (int y = 0; y < 38; y++)
            {
                double half = 3 + y * 0.68;
                for (double x = Math.Floor(28 - half); x <= Math.Ceiling(28 + half); x++)
                {
                    bool left = x < 28;
                    double v = left ? 0.72 : 0.38;
                    v += (U.VNoise(x / 3, y / 5.0, 2) - 0.5) * 0.15 - (y > 34 ? 0.15 : 0);
                    if (Math.Abs(x - 28) < 1) v = 0.15;
                    pb.Set(x, y + 4, U.RampAt(C, v, x, y));
                }
            }
            // the opening
            for (int y = 22; y < 38; y++) { double half = (y - 22) * 0.45; for (double x = Math.Floor(28 - half); x <= Math.Ceiling(28 + half); x++) pb.Set(x, y + 4, new Col(30, 18, 22)); }
            // poles
            pb.Set(28, 1, wood[3]); pb.Set(28, 2, wood[3]); pb.Set(28, 3, wood[2]);
            pb.Outline(INK);
            return new Art { c = pb.ToImg(), ox = 28, oy = 42, shadow = 26 };
        }

        public static Art MakeLog()
        {
            var pb = new PixBuf(40, 14);
            for (int y = 2; y < 12; y++) for (int x = 4; x < 36; x++)
                {
                    double v = 0.75 - (y - 2) / 10.0 * 0.6 + (U.VNoise(x / 4.0, y, 2) - 0.5) * 0.2;
                    pb.Set(x, y, U.RampAt(wood, v, x, y));
                }
            for (int y = 2; y < 12; y++) for (int x = 0; x < 6; x++)
                {
                    double q = Math.Pow((x - 4) / 3.0, 2) + Math.Pow((y - 7) / 5.0, 2);
                    if (q <= 1) pb.Set(x + 1, y, q > 0.5 ? wood[4] : wood[5]);
                }
            pb.Outline(INK);
            return new Art { c = pb.ToImg(), ox = 20, oy = 12, shadow = 16 };
        }

        public static Art MakeCrate()
        {
            var pb = new PixBuf(26, 28); var Wd = wood;
            for (int y = 0; y < 8; y++) for (int x = 1; x < 25; x++) pb.Set(x, y + 1, U.RampAt(Wd, 0.85 - (x % 6 == 0 ? 0.3 : 0), x, y));
            for (int y = 0; y < 17; y++) for (int x = 1; x < 25; x++)
                {
                    double v = 0.5 - y * 0.012 + (x % 6 == 0 ? -0.25 : 0);
                    if (y == 0 || y == 16 || x == 1 || x == 24 || Math.Abs(x - 1 - y * 1.4) < 1.2) v = 0.25;
                    pb.Set(x, y + 9, U.RampAt(Wd, v, x, y));
                }
            pb.Outline(INK);
            return new Art { c = pb.ToImg(), ox = 13, oy = 26, shadow = 12 };
        }

        public static Art MakeBarrel()
        {
            var pb = new PixBuf(22, 28); var Wd = wood;
            for (int y = 0; y < 22; y++)
            {
                double bulge = Math.Sin((y / 21.0) * Math.PI) * 2;
                for (double x = Math.Floor(3 - bulge); x <= Math.Ceiling(18 + bulge); x++)
                {
                    double u = (x - 3 + bulge) / (15 + bulge * 2);
                    double v = 0.8 - u * 0.7 + (x % 4 == 0 ? -0.1 : 0);
                    if (y == 4 || y == 5 || y == 16 || y == 17) v = u < 0.4 ? 0.3 : 0.12;
                    pb.Set(x, y + 5, U.RampAt(Wd, U.Clamp(v), x, y));
                }
            }
            for (int y = 0; y < 6; y++) for (int x = 3; x < 19; x++) if (Math.Pow((x - 10.5) / 8, 2) + Math.Pow((y - 3) / 3.0, 2) <= 1) pb.Set(x, y + 1, U.RampAt(Wd, y < 3 ? 0.9 : 0.6, x, y));
            pb.Outline(INK);
            return new Art { c = pb.ToImg(), ox = 11, oy = 26, shadow = 10 };
        }

        public static Art MakePost(int h)
        {
            int W = 12, H = h + 16; var pb = new PixBuf(W, H); var Wd = wood;
            for (int y = 4; y < H; y++) for (int x = 2; x < 10; x++)
                {
                    double u = (x - 2) / 8.0;
                    pb.Set(x, y, U.RampAt(Wd, U.Clamp(0.85 - u * 0.75 - (y > H - 4 ? 0.3 : 0)), x, y));
                }
            for (int y = 0; y < 6; y++) for (int x = 2; x < 10; x++)
                {
                    double q = Math.Pow((x - 5.5) / 4, 2) + Math.Pow((y - 3.5) / 2.2, 2);
                    if (q <= 1) pb.Set(x, y + 1, q < 0.35 ? Wd[3] : q < 0.7 ? Wd[4] : Wd[5]);
                }
            pb.Outline(INK);
            // waterline
            for (int x = 1; x < 11; x++) pb.Set(x, H - 1, new Col(170, 240, 228), 200);
            return new Art { c = pb.ToImg(), ox = 6, oy = H - 2 };
        }

        public static Art MakeRowboat()
        {
            int W = 64, H = 28; var pb = new PixBuf(W, H); var Wd = wood;
            for (int y = 0; y < H; y++) for (int x = 0; x < W; x++)
                {
                    double q = Math.Pow((x - 32) / 30.0, 2) + Math.Pow((y - 12) / 10.0, 2);
                    if (q > 1) continue;
                    double v;
                    if (q > 0.72) v = y < 12 ? 0.9 : 0.35;
                    else v = 0.45 + (x % 8 == 0 ? -0.2 : 0) - y * 0.01;
                    pb.Set(x, y, U.RampAt(Wd, v, x, y));
                }
            for (int x = 18; x < 46; x += 12) for (int y = 5; y < 20; y++) if (Math.Pow((x - 32) / 30.0, 2) + Math.Pow((y - 12) / 10.0, 2) < 0.7) pb.Set(x, y, Wd[5]);
            pb.Outline(INK);
            for (int x = 4; x < 60; x++) pb.Set(x, 24, new Col(180, 245, 232), 180);
            return new Art { c = pb.ToImg(), ox = 32, oy = 22 };
        }

        public static Art MakeCampfireBase()
        {
            var pb = new PixBuf(34, 18);
            for (int i = 0; i < 9; i++)
            {
                double a = (i / 9.0) * Math.PI * 2, x = 17 + Math.Cos(a) * 12, y = 9 + Math.Sin(a) * 5;
                var list = new List<Sph> { new Sph { x = x, y = y, r = 3.2, sy = 0.8, ramp = stone } };
                var tmp = new PixBuf(34, 18);
                Spheres(tmp, list, 0.2, 3, i);
                for (int yy = 0; yy < 18; yy++) for (int xx = 0; xx < 34; xx++) { var c = tmp.Get(xx, yy); if (c.HasValue) pb.Set(xx, yy, c.Value); }
            }
            for (int k = 0; k < 4; k++) for (int s = 0; s < 14; s++)
                {
                    double a = (k / 4.0) * Math.PI + 0.3, x = 17 + Math.Cos(a) * (s - 7), y = 9 + Math.Sin(a) * (s - 7) * 0.4;
                    pb.Set(x, y, wood[k % 2 != 0 ? 1 : 2]); pb.Set(x, y + 1, wood[0]);
                }
            for (int x = 13; x < 22; x++) pb.Set(x, 9, new Col(60, 24, 20));
            pb.Outline(INK);
            return new Art { c = pb.ToImg(), ox = 17, oy = 12 };
        }

        public static Art MakeBanner()
        {
            var pb = new PixBuf(24, 56);
            for (int y = 2; y < 56; y++) { pb.Set(11, y, wood[2]); pb.Set(12, y, wood[1]); }
            var C = U.Ramp("#2a2a1a", "#4a4a22", "#6a6a2a", "#8a8a34");
            for (int y = 6; y < 30; y++) for (int x = 13; x < 23; x++)
                {
                    if (y > 24 && (x + y) % 3 == 0) continue;
                    pb.Set(x, y, U.RampAt(C, 0.55 + Math.Sin(x * 0.8 + y * 0.2) * 0.2, x, y));
                }
            // a crude red skull mark
            var R2 = U.Ramp("#6a1a1a", "#b0302a");
            foreach (var p in new[] { (16, 12), (17, 12), (18, 12), (19, 12), (15, 13), (16, 13), (19, 13), (20, 13), (16, 14), (17, 14), (18, 14), (19, 14), (17, 16), (18, 16) }) pb.Set(p.Item1, p.Item2, R2[1]);
            pb.Outline(INK);
            return new Art { c = pb.ToImg(), ox = 12, oy = 54, shadow = 6 };
        }

        public static Art MakeBones(int seed)
        {
            var R = new Rng(seed); var pb = new PixBuf(24, 14);
            for (int k = 0; k < 3; k++)
            {
                double a = R.Range(0, Math.PI), x0 = 12 + R.Range(-5, 5), y0 = 7 + R.Range(-2, 2);
                for (int s = -4; s <= 4; s++) pb.Set(x0 + Math.Cos(a) * s, y0 + Math.Sin(a) * s * 0.5, bone[2]);
                pb.Set(x0 + Math.Cos(a) * 5, y0 + Math.Sin(a) * 2.5, bone[3]);
                pb.Set(x0 - Math.Cos(a) * 5, y0 - Math.Sin(a) * 2.5, bone[3]);
            }
            pb.Outline(new Col(40, 34, 30));
            return new Art { c = pb.ToImg(), ox = 12, oy = 10 };
        }

        public static Art MakeChest(bool open)
        {
            var pb = new PixBuf(26, 24); var Wd = wood; var G = U.Ramp("#6a4a10", "#c4901c", "#f4d050");
            for (int y = 0; y < 12; y++) for (int x = 1; x < 25; x++)
                {
                    double v = 0.55 - y * 0.03;
                    if (x == 1 || x == 24 || x == 12 || x == 13) v = 0.2;
                    pb.Set(x, y + 11, U.RampAt(Wd, v, x, y));
                }
            if (!open)
            {
                for (int y = 0; y < 9; y++) for (int x = 1; x < 25; x++) pb.Set(x, y + 3, U.RampAt(Wd, 0.85 - y * 0.06, x, y));
                for (int x = 1; x < 25; x++) pb.Set(x, 11, G[0]);
                pb.Rect(11, 10, 4, 4, G[1]); pb.Set(12, 11, G[2]);
            }
            else
            {
                for (int y = 0; y < 6; y++) for (int x = 1; x < 25; x++) pb.Set(x, y + 1, U.RampAt(Wd, 0.4, x, y));
                for (int x = 3; x < 23; x++) pb.Set(x, 11, new Col(30, 16, 14));
                for (int x = 4; x < 22; x += 3) pb.Set(x, 12, G[2]);
            }
            pb.Outline(INK);
            return new Art { c = pb.ToImg(), ox = 13, oy = 22, shadow = 12 };
        }

        /// <summary>A soft dithered ellipse that goes under everything standing on the ground.</summary>
        public static Img MakeShadow(double rx)
        {
            double ry = Math.Max(2, rx * 0.42); int W = (int)Math.Ceiling(rx * 2 + 2), H = (int)Math.Ceiling(ry * 2 + 2);
            var d = new byte[W * H * 4];
            for (int y = 0; y < H; y++) for (int x = 0; x < W; x++)
                {
                    double q = Math.Pow((x - W / 2.0 + 0.5) / rx, 2) + Math.Pow((y - H / 2.0 + 0.5) / ry, 2);
                    if (q > 1) continue;
                    int j = (y * W + x) * 4;
                    d[j] = 14; d[j + 1] = 24; d[j + 2] = 20;
                    d[j + 3] = (byte)(q < 0.55 ? 110 : 70);
                }
            return Img.From(d, W, H);
        }
    }
}
