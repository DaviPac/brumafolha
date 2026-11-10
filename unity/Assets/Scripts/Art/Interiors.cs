// The prologue's new places, painted in code: the dreamed Velmoor (white avenue between towers) and the Relicário
// under the ruins (white marble floor, slate walls, relief faces). Plus their props, and a few new valley props
// (the forgotten doe, the goblins' loot, the trapdoor, the Velmoor marker stone). Ported from src/art/interiors.js.
using System;

namespace Brumafolha
{
    public static class Interiors
    {
        const int TILE = U.TILE;
        static readonly Col INK = new Col(24, 18, 30);
        public static readonly Col[] IRAMP_marble = U.Ramp("#8e95a2", "#aab0bc", "#c4c9d2", "#dadde3", "#ebedf0", "#f7f8f9");
        public static readonly Col[] IRAMP_warm = U.Ramp("#a8a294", "#c2bcae", "#d8d4c8", "#e8e6de", "#f4f3ee", "#fbfbf8");
        public static readonly Col[] slate = U.Ramp("#10151c", "#161c25", "#1c232e", "#232c38", "#2c3644", "#3a4658");
        public static readonly Col[] roof = U.Ramp("#6c7384", "#828a9c", "#9aa2b2", "#b2b9c6", "#c8ced8");
        public static readonly Col[] mist = U.Ramp("#d6dbe4", "#e2e6ec", "#ecf0f4", "#f6f8fa");
        public static readonly Col[] lume = U.Ramp("#3a5a8a", "#7aa8e0", "#c8e0ff", "#f4faff");
        public static readonly Col[] fawn = U.Ramp("#3a2014", "#6a3e22", "#94603a", "#bc8656", "#dcb07c");
        public static readonly Col[] clay = U.Ramp("#4a2018", "#7a3a24", "#a85a34", "#c8804a");
        public static readonly Col[] rope = U.Ramp("#3a2a18", "#5e4628", "#86683c", "#aa8c54");

        // ---------------------------------------------------------------- the ground of a grid map
        /// <summary>Irregular slabs: distance to the nearest and second-nearest jittered cell centre.</summary>
        static (double edge, double id) Slab(int x, int y, int size, int seed)
        {
            int gx = (int)Math.Floor(x / (double)size), gy = (int)Math.Floor(y / (double)size);
            double d1 = 1e9, d2 = 1e9, id = 0;
            for (int j = -1; j <= 1; j++)
                for (int i = -1; i <= 1; i++)
                {
                    int cx = gx + i, cy = gy + j;
                    double px = (cx + 0.2 + U.Hash2(cx, cy, seed) * 0.6) * size, py = (cy + 0.2 + U.Hash2(cx, cy, seed + 1) * 0.6) * size;
                    double d = Math.Sqrt(Math.Pow((x - px) * 1.15, 2) + (y - py) * (y - py));
                    if (d < d1) { d2 = d1; d1 = d; id = cx * 7919.0 + cy; } else if (d < d2) d2 = d;
                }
            return (d2 - d1, id);
        }

        /// <summary>Paint a grid map into an RGBA buffer. `floorRamp` is the floor ramp.</summary>
        public static byte[] PaintInterior(WorldMap W, out int w, out int h)
        {
            w = W.w * TILE; h = W.h * TILE;
            var d = new byte[w * h * 4];
            bool Floorish(int t) => t == T.MARBLE || t == T.STAIRS;
            var R = W.floorRamp ?? IRAMP_marble; var S = slate;
            for (int y = 0; y < h; y++)
                for (int x = 0; x < w; x++)
                {
                    int tx = x / TILE, ty = y / TILE, lx = x - tx * TILE, ly = y - ty * TILE, t = W.TileAt(tx, ty);
                    Col c;
                    if (t == T.MARBLE)
                    {
                        var s = Slab(x, y, 22, 3);
                        double v = 0.62 + U.Hash2(s.id, 0, 9) * 0.22 + (U.VNoise(x / 9.0, y / 9.0, 4) - 0.5) * 0.12;
                        double vein = Math.Abs(U.Fbm(x / 40.0, y / 26.0, 12, 3) - 0.5);
                        if (vein < 0.01) v -= 0.22;
                        if (s.edge < 1.3) v = 0.12; else if (s.edge < 2.4) v -= 0.12;
                        // the walls cast a soft dark band onto the floor below them
                        if (W.TileAt(tx, ty - 1) != t && !Floorish(W.TileAt(tx, ty - 1)) && ly < 6) v -= 0.25 - ly * 0.04;
                        c = U.RampAt(R, U.Clamp(v), x, y);
                    }
                    else if (t == T.STAIRS)
                    {
                        int step = ly / 7, sy = ly % 7;
                        double v = 0.8 - step * 0.17 - (sy == 6 ? 0.2 : sy == 0 ? -0.08 : 0);
                        if (lx < 2 || lx > 29) v -= 0.25;
                        c = U.RampAt(R, U.Clamp(v), x, y);
                    }
                    else if (t == T.ROOF)
                    {
                        // slate roof seen from above: scalloped courses
                        int row = y / 6, off = (row & 1) != 0 ? 4 : 0, sx = (x + off) % 8, sy = y % 6;
                        double v = 0.55 + U.Hash2((x + off) >> 3, row, 5) * 0.2 - sy * 0.06 + (sx == 0 ? -0.2 : 0);
                        v += (U.Fbm(x / 60.0, y / 60.0, 3, 2) - 0.5) * 0.4;
                        c = U.RampAt(roof, U.Clamp(v), x, y);
                    }
                    else if (t == T.MIST)
                    {
                        c = U.RampAt(mist, 0.4 + U.Fbm(x / 30.0, y / 30.0, 8, 3) * 0.6, x, y);
                    }
                    else
                    {
                        // walls: a slate top, and a lit marble front face where the floor is below
                        int below = W.TileAt(tx, ty + 1); bool relief = t == T.RELIEF;
                        bool face = Floorish(below) && ly >= 12;
                        if (face)
                        {
                            int fy = ly - 12;
                            double v = 0.42 + (U.VNoise(x / 3.0, y / 6.0, 6) - 0.5) * 0.1 - fy * 0.008;
                            if (!relief && x % 10 == 0) v -= 0.12;
                            if (fy == 0) v = 0.8;
                            if (fy >= 18) v = 0.12;
                            if (relief)
                            {
                                // faceless people carved in a row: a head and shoulders every 10 px
                                int k = ((x + 3) % 10) - 5, hy = fy - 6;
                                if (k * k + hy * hy * 1.2 < 9) v = 0.72 - (k > 0 ? 0.1 : 0) - (hy > 1 ? 0.06 : 0);
                                else if (fy > 10 && fy < 18 && Math.Abs(k) < 4 + (fy - 10) * 0.3) v = 0.6 - (k > 1 ? 0.1 : 0);
                            }
                            c = U.RampAt(R, U.Clamp(v), x, y);
                        }
                        else
                        {
                            double v = 0.35 + (U.Fbm(x / 20.0, y / 20.0, 2, 3) - 0.5) * 0.5;
                            // a lighter lip where the wall top meets a walkable tile
                            bool Nb(int dx, int dy) => Floorish(W.TileAt(tx + dx, ty + dy));
                            if ((Nb(0, -1) && ly < 2) || (Nb(-1, 0) && lx < 2) || (Nb(1, 0) && lx > 29) || (Nb(0, 1) && ly > 29)) v = 0.95;
                            c = U.RampAt(S, U.Clamp(v), x, y);
                        }
                    }
                    int j = (y * w + x) * 4;
                    d[j] = (byte)c.r; d[j + 1] = (byte)c.g; d[j + 2] = (byte)c.b; d[j + 3] = 255;
                }
            return d;
        }

        // ---------------------------------------------------------------- dreamed Velmoor
        /// <summary>A white tower: a lit top face over a tall front face with dark arched windows.</summary>
        public static Art MakeTower(int seed, int h)
        {
            var R = new Rng(seed); int W = 32, faceH = 34 + h * 20, topH = 12, roofH = seed % 3 == 0 ? 18 : 0, H = faceH + topH + roofH + 4;
            var pb = new PixBuf(W, H); var M = IRAMP_warm; var Sl = roof;
            int y0 = roofH + 4;
            for (int x = 1; x < W - 1; x++)
            {
                double u = (x - 1) / (double)(W - 2);
                for (int y = 0; y < topH; y++) pb.Set(x, y0 + y, U.RampAt(M, U.Clamp(0.85 - u * 0.25 - (y == topH - 1 ? 0.25 : 0)), x, y));
                for (int y = 0; y < faceH; y++)
                {
                    double v = 0.66 - u * 0.4 + (U.VNoise(x / 4.0, y / 9.0, seed) - 0.5) * 0.08 + ((double)y / faceH) * -0.12;
                    if (y % 11 == 0) v -= 0.08;
                    pb.Set(x, y0 + topH + y, U.RampAt(M, U.Clamp(v), x, y));
                }
            }
            // crenels along the top edge
            for (int x = 1; x < W - 1; x += 6) for (int i = 0; i < 3; i++) for (int y = 0; y < 3; y++) pb.Set(x + i, y0 - 3 + y, M[4]);
            // windows: tall arched slits, dark inside with a faint cold light
            int rows = Math.Max(1, (int)Math.Floor((faceH - 10) / 16.0));
            for (int r = 0; r < rows; r++)
                foreach (int wx in new[] { 8, 20 })
                {
                    if (R.Chance(0.25)) continue;
                    int wy = y0 + topH + 6 + r * 16;
                    for (int y = 0; y < 9; y++) for (int x = 0; x < 4; x++)
                        {
                            if (y == 0 && (x == 0 || x == 3)) continue;
                            pb.Set(wx + x, wy + y, y < 2 ? new Col(60, 70, 96) : new Col(34, 40, 62));
                        }
                    if (R.Chance(0.3)) pb.Set(wx + 1, wy + 5, new Col(190, 210, 255));
                }
            if (roofH != 0)
            {
                for (int y = 0; y < roofH; y++)
                {
                    double hw = ((double)y / roofH) * 15;
                    for (double x = Math.Floor(16 - hw); x <= Math.Ceiling(15 + hw); x++) pb.Set(x, y + 4, U.RampAt(Sl, U.Clamp(0.75 - (x - 16 + hw) / (2 * hw + 1) * 0.5), x, y));
                }
            }
            pb.Outline(INK);
            return new Art { c = pb.ToImg(), ox = 0, oy = H - 1 };
        }

        /// <summary>The silver leaf-lantern: the Lume.</summary>
        static void LeafLantern(PixBuf pb, double cx, double cy, double s = 1, bool lit = true)
        {
            var L = lit ? lume : U.Ramp("#3a3e48", "#5a606c", "#7a8290", "#9aa2ae");
            for (double y = -8 * s; y <= 8 * s; y++)
                for (double x = -6 * s; x <= 6 * s; x++)
                {
                    double k = y / (8 * s), hw = Math.Sin((k + 1) * Math.PI / 2) * 5 * s * (k < 0 ? 1 : 0.9);
                    if (Math.Abs(x) > hw) continue;
                    double v = 0.8 - (x + y) / (14 * s) * 0.4 - (Math.Abs(x) > hw - 1 ? 0.3 : 0);
                    if (x == 0 || (Math.Abs(x) == Math.Floor(Math.Abs(y + 3 * s) * 0.5 + 0.5) && y > -5 * s)) v -= 0.35; // veins
                    pb.Set(cx + x, cy + y, U.RampAt(L, U.Clamp(v), cx + x, cy + y));
                }
            if (lit) pb.Set(cx, cy, new Col(255, 255, 255));
        }

        public static Art MakeLantern()
        {
            var pb = new PixBuf(16, 24);
            for (int y = 0; y < 5; y++) pb.Set(8, y, new Col(200, 205, 215));
            LeafLantern(pb, 8, 13, 1, true);
            pb.Outline(INK);
            return new Art { c = pb.ToImg(), ox = 8, oy = 23 };
        }

        // ---------------------------------------------------------------- the Relicário
        public static Art MakePedestal(bool withLume)
        {
            int W = 28, H = 54; var pb = new PixBuf(W, H); var M = IRAMP_marble;
            // column
            for (int y = 22; y < H - 4; y++) for (int x = 7; x < 21; x++)
                {
                    double u = (x - 7) / 14.0;
                    double v = 0.85 - Math.Abs(u - 0.3) * 1.1 + ((x - 7) % 4 == 0 ? -0.1 : 0);
                    pb.Set(x, y, U.RampAt(M, U.Clamp(v), x, y));
                }
            // capital and base: wide flat ellipses
            foreach (var (cy, rx) in new[] { (22, 12), (H - 4, 13) })
                for (int y = -3; y <= 3; y++) for (int x = -rx; x <= rx; x++)
                        if (Math.Pow((double)x / rx, 2) + Math.Pow(y / 3.2, 2) <= 1) pb.Set(14 + x, cy + y, U.RampAt(M, U.Clamp(0.85 - (x + y) / (rx * 2.4) - (y > 1 ? 0.3 : 0)), x, y));
            if (withLume) LeafLantern(pb, 14, 11, 1, true);
            pb.Outline(INK);
            return new Art { c = pb.ToImg(), ox = 14, oy = H - 2, shadow = 12 };
        }

        /// <summary>A Velmoor archivist in marble, holding up a Lume (dark until her question is answered).</summary>
        public static Art MakeStatue(Spec spec, bool lit)
        {
            var src = Chars.DrawAll(spec)[0][6]; // the cast pose, staff raised
            int W = 32, H = Chars.SH + 16; var pb = new PixBuf(W, H); var M = IRAMP_marble;
            int[] tip = null;
            for (int y = 0; y < Chars.SH; y++)
                for (int x = 0; x < Chars.SW; x++)
                {
                    var c = src.Get(x, y);
                    if (!c.HasValue) continue;
                    if (tip == null && x > 15) tip = new[] { x + 3, y + 2 };
                    double l = (c.Value.r * 0.3 + c.Value.g * 0.5 + c.Value.b * 0.2) / 255;
                    pb.Set(x + 3, y + 2, l < 0.12 ? INK : U.RampAt(M, U.Clamp((l - 0.2) * 1.35), x, y));
                }
            // plinth
            for (int y = 0; y < 12; y++) for (int x = 2; x < W - 2; x++)
                {
                    double v = y < 4 ? 0.9 - (x - 2) / 40.0 : 0.5 - (x - 2) / 60.0 - (y - 4) * 0.03;
                    if (y == 4) v = 0.25;
                    pb.Set(x, Chars.SH + y + 2, U.RampAt(M, U.Clamp(v), x, y));
                }
            pb.Outline(INK);
            // the Lume she holds up: dark until her question is answered
            if (tip != null) LeafLantern(pb, tip[0], tip[1] + 3, 0.55, lit);
            return new Art { c = pb.ToImg(), ox = 16, oy = H - 2, shadow = 14 };
        }

        /// <summary>The sealed door: three tiles wide, with a socket per statue that lights as each Lume does.</summary>
        public static Art MakeDoor(int lit)
        {
            int W = 96, H = 58; var pb = new PixBuf(W, H); var M = IRAMP_marble;
            for (int y = 0; y < H; y++) for (int x = 0; x < W; x++)
                {
                    double v = 0.6 + (U.VNoise(x / 5.0, y / 8.0, 31) - 0.5) * 0.1 - y * 0.004;
                    if (x == 47 || x == 48) v = 0.18; // the seam between the leaves
                    if (y < 8) v = 0.85 - x / 400.0;
                    if (y == 8) v = 0.3;
                    if (x < 3 || x > W - 4) v = 0.35;
                    // a carved arch
                    double ax = (x - 48) / 40.0, ay = (y - 54) / 44.0;
                    if (Math.Abs(ax * ax + ay * ay - 1) < 0.04 && y > 10) v -= 0.25;
                    pb.Set(x, y, U.RampAt(M, U.Clamp(v), x, y));
                }
            for (int i = 0; i < 3; i++)
            {
                int cx = 24 + i * 24, cy = 30;
                for (int y = -4; y <= 4; y++) for (int x = -4; x <= 4; x++)
                    {
                        int q = x * x + y * y;
                        if (q > 18) continue;
                        pb.Set(cx + x, cy + y, i < lit ? lume[q < 4 ? 3 : q < 10 ? 2 : 1] : q > 12 ? M[0] : new Col(44, 50, 64));
                    }
            }
            pb.Outline(INK);
            return new Art { c = pb.ToImg(), ox = 0, oy = H - 1 };
        }

        /// <summary>A stone slab carved with someone's likeness (the relief that shows whoever comes in).</summary>
        public static Art MakeRelief(Spec spec, bool blank)
        {
            Spec s = spec; if (blank) { s = spec.Clone(); s.faceless = true; }
            var src = Chars.DrawAll(s)[0][4];
            int W = 30, H = 34; var pb = new PixBuf(W, H); var M = IRAMP_marble;
            for (int y = 0; y < H; y++) for (int x = 0; x < W; x++) pb.Set(x, y, U.RampAt(M, U.Clamp(0.36 + (U.VNoise(x / 3.0, y / 3.0, 77) - 0.5) * 0.12 - (x > W - 3 ? 0.15 : 0)), x, y));
            for (int y = 0; y < 26; y++)
                for (int x = 0; x < Chars.SW; x++)
                {
                    var c = src.Get(x, y);
                    if (!c.HasValue) continue;
                    double l = (c.Value.r * 0.3 + c.Value.g * 0.5 + c.Value.b * 0.2) / 255;
                    pb.Set(x + 2, y + 5, l < 0.1 ? M[0] : U.RampAt(M, U.Clamp(0.2 + (l - 0.15) * 0.95), x, y));
                }
            pb.Outline(INK);
            return new Art { c = pb.ToImg(), ox = 15, oy = H - 1 };
        }

        // ---------------------------------------------------------------- valley props for the prologue
        /// <summary>The forgotten doe: alive, white-eyed, head down chewing grass that isn't there.</summary>
        public static Art MakeDeer(int frame = 0)
        {
            int W = 34, H = 30; var pb = new PixBuf(W, H); var F = fawn;
            int bob = frame != 0 ? 1 : 0;
            // legs
            foreach (var (lx, bk) in new[] { (11, 0), (14, 1), (22, 0), (25, 1) })
                for (int y = 18; y < 28; y++) { pb.Set(lx, y, F[bk != 0 ? 1 : 2]); pb.Set(lx + 1, y, F[bk != 0 ? 0 : 1]); if (y > 25) pb.Set(lx, y, F[0]); }
            // body
            for (int y = -5; y <= 5; y++) for (int x = -9; x <= 9; x++)
                {
                    double q = Math.Pow(x / 9.5, 2) + Math.Pow(y / 5.5, 2);
                    if (q > 1) continue;
                    double v = 0.75 - y * 0.06 - x * 0.012 - (q > 0.75 ? 0.15 : 0);
                    if (y > 2) v = 0.95; // pale belly
                    pb.Set(19 + x, 15 + y, U.RampAt(F, U.Clamp(v), x, y));
                }
            // white tail
            pb.Set(28, 11, new Col(240, 236, 226)); pb.Set(29, 12, new Col(240, 236, 226)); pb.Set(28, 12, new Col(220, 214, 200));
            // neck going down to the grass, head low
            for (int s = 0; s < 9; s++)
            {
                double x = 11 - s * 0.7, y = 12 + s * 0.9 + bob * (s / 9.0);
                for (int k = -2; k <= 1; k++) pb.Set(x + k, y, U.RampAt(F, 0.7 - k * 0.1, x, y));
            }
            int hx = 4, hy = 22 + bob;
            for (int y = -2; y <= 2; y++) for (int x = -3; x <= 4; x++) if (Math.Pow(x / 4.0, 2) + Math.Pow(y / 2.6, 2) <= 1) pb.Set(hx + x, hy + y, U.RampAt(F, 0.7 - y * 0.1, x, y));
            pb.Set(hx - 3, hy + 1, F[0]); // muzzle
            pb.Set(hx + 3, hy - 3, F[3]); pb.Set(hx + 4, hy - 4, F[3]); pb.Set(hx + 2, hy - 3, F[2]); // ears
            pb.Outline(INK);
            // the eye: white, no pupil
            pb.Set(hx + 1, hy - 1, new Col(250, 250, 255)); pb.Set(hx + 2, hy - 1, new Col(220, 226, 240));
            return new Art { c = pb.ToImg(), ox = 18, oy = 27, shadow = 12 };
        }

        /// <summary>What the patrol carried off: Maren's net rolled up, two pots and a carved rocking chair.</summary>
        public static Art MakeLoot()
        {
            int W = 40, H = 30; var pb = new PixBuf(W, H); var Rp = rope; var Wd = U.Ramp("#3a1e14", "#5a2e1c", "#7e4426", "#a35e32", "#c67c42");
            // rocking chair, side view
            for (int x = 20; x < 36; x++) { double y = 27 - Math.Floor(Math.Pow((x - 28) / 8.0, 2) * 2 + 0.5); pb.Set(x, y, Wd[3]); pb.Set(x, y + 1, Wd[1]); }
            for (int y = 4; y < 26; y++) { pb.Set(33, y, Wd[3]); pb.Set(34, y, Wd[1]); }
            for (int y = 18; y < 26; y++) { pb.Set(23, y, Wd[3]); pb.Set(24, y, Wd[1]); }
            for (int x = 22; x < 35; x++) { pb.Set(x, 17, Wd[4]); pb.Set(x, 18, Wd[2]); }
            for (int y = 6; y < 17; y += 3) for (int x = 31; x < 34; x++) pb.Set(x, y, Wd[2]);
            // the net, rolled
            for (int y = -5; y <= 5; y++) for (int x = -10; x <= 10; x++)
                {
                    if (Math.Pow(x / 10.5, 2) + Math.Pow(y / 5.5, 2) > 1) continue;
                    double v = 0.7 - y * 0.07;
                    if ((x + y * 2) % 4 == 0 || (x - y * 2) % 4 == 0) v -= 0.35;
                    pb.Set(12 + x, 22 + y, U.RampAt(Rp, U.Clamp(v), x, y));
                }
            // pots
            foreach (var (px, py, r) in new[] { (6, 13, 4), (15, 12, 3) })
                for (int y = -r; y <= r; y++) for (int x = -r; x <= r; x++) if (x * x + y * y <= r * r) pb.Set(px + x, py + y, U.RampAt(clay, U.Clamp(0.8 - (x + y) / (r * 3.0)), x, y));
            pb.Outline(INK);
            return new Art { c = pb.ToImg(), ox = 20, oy = 28, shadow = 14 };
        }

        /// <summary>The trapdoor at the foot of the broken column: a slab with a child's face carved on it, or the open stairs.</summary>
        public static Art MakeTrapdoor(bool open)
        {
            int W = 30, H = 22; var pb = new PixBuf(W, H); var M = IRAMP_marble;
            for (int y = 0; y < H; y++) for (int x = 0; x < W; x++)
                {
                    bool edge = x < 2 || y < 2 || x > W - 3 || y > H - 3;
                    if (open)
                    {
                        double depth = (double)y / H;
                        pb.Set(x, y, edge ? M[1] : (y % 5 == 0 ? new Col(40, 46, 60) : U.RampAt(slate, U.Clamp(0.9 - depth * 0.9), x, y)));
                    }
                    else
                    {
                        double v = 0.55 + (U.VNoise(x / 3.0, y / 3.0, 50) - 0.5) * 0.15 - (edge ? 0.25 : 0);
                        int fx = x - 15, fy = y - 11;
                        if (Math.Abs(fx * fx + fy * fy * 1.4 - 36) < 6) v -= 0.3; // the face's outline
                        if ((fx == -2 || fx == 2) && fy == -1) v -= 0.35; // eyes
                        if (fy == 3 && Math.Abs(fx) < 2) v -= 0.3; // mouth
                        pb.Set(x, y, U.RampAt(M, U.Clamp(v), x, y));
                    }
                }
            pb.Outline(INK);
            return new Art { c = pb.ToImg(), ox = 15, oy = H - 2 };
        }

        /// <summary>A half-buried Velmoor boundary stone with a line of glyphs.</summary>
        public static Art MakeMarker()
        {
            int W = 22, H = 28; var pb = new PixBuf(W, H); var M = IRAMP_marble;
            for (int y = 0; y < H - 4; y++) for (int x = 3; x < 19; x++)
                {
                    bool top = y < 6 && Math.Abs(x - 11) > 2 + y * 1.4;
                    if (top) continue;
                    double v = 0.6 - (x - 3) / 30.0 + (U.VNoise(x / 2.0, y / 2.0, 61) - 0.5) * 0.2;
                    if (y >= 9 && y <= 17 && x > 6 && x < 16 && U.Hash2(x, y, 3) > 0.62 && y % 3 != 0) v -= 0.3; // glyphs
                    pb.Set(x, y + 2, U.RampAt(M, U.Clamp(v), x, y));
                }
            for (int x = 1; x < W - 1; x++) for (int y = H - 5; y < H - 2; y++) pb.Set(x, y, new Col(58, 92, 40)); // grass at the foot
            for (int x = 4; x < 9; x++) pb.Set(x, 10, new Col(80, 120, 50));
            pb.Outline(INK);
            return new Art { c = pb.ToImg(), ox = 11, oy = H - 3, shadow = 8 };
        }
    }
}
