// The ground, painted once per pixel: grass, dry meadow, dirt road, ruin flagstones, water, the dock.
// Ported from src/art/ground.js. Returns an RGBA byte buffer (top row first) the size of the map.
using System;
using System.Collections.Generic;

namespace Brumafolha
{
    public static class Ground
    {
        const int TILE = U.TILE;
        public static readonly Col[] grass = U.Ramp("#2b5226", "#38702b", "#4a8a30", "#5fa335", "#7bba3c", "#9bcf4a");
        public static readonly Col[] dry = U.Ramp("#6e5f2a", "#857436", "#9c8a42", "#b39e4e", "#c8b35c");
        public static readonly Col[] dirt = U.Ramp("#5e4228", "#755634", "#8c6a40", "#a07d4c", "#b5925a");
        public static readonly Col[] stoneP = U.Ramp("#3d403f", "#4f5450", "#62685f", "#777d70", "#8d9383");
        public static readonly Col[] water = U.Ramp("#1f6f8f", "#2788a2", "#33a3b0", "#4abcbb", "#6dd3c6");
        public static readonly Col[] woodP = U.Ramp("#6a3420", "#8e4a28", "#b4652f", "#d4833c", "#e8a052");
        public static readonly Col[] bank = U.Ramp("#1f3d22", "#2a4d26");

        public static byte[] PaintGround(WorldMap W, out int w, out int h)
        {
            w = World.MW * TILE; h = World.MH * TILE;
            int ww = w, hh = h;
            var d = new byte[w * h * 4];
            var lushAt = new float[w * h]; var wfAt = new float[w * h];
            // lushness is smooth: sample it every 4 px and interpolate
            const int LS = 4; int lw = w / LS + 1; var lushGrid = new double[lw * (h / LS + 1)];
            for (int gy = 0; gy <= h / LS; gy++) for (int gx = 0; gx < lw; gx++) lushGrid[gy * lw + gx] = World.LushField(gx * LS, gy * LS);
            double LushOf(int x, int y)
            {
                double gx = x / (double)LS, gy = y / (double)LS; int xi = (int)gx, yi = (int)gy; double u = gx - xi, v = gy - yi; int k = yi * lw + xi;
                double a = lushGrid[k], b = lushGrid[k + 1], c = k + lw < lushGrid.Length ? lushGrid[k + lw] : a, e = k + lw + 1 < lushGrid.Length ? lushGrid[k + lw + 1] : b;
                return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + e * u) * v;
            }
            for (int y = 0; y < h; y++)
                for (int x = 0; x < w; x++)
                {
                    int i = y * w + x;
                    double wf = World.WaterField(x, y); wfAt[i] = (float)wf;
                    Col c;
                    if (wf < 0)
                    {
                        double depth = U.Clamp(-wf * 3.2);
                        double v = 1 - depth + (U.VNoise(x / 14.0, y / 7.0, 2) - 0.5) * 0.25;
                        c = U.RampAt(water, v, x, y);
                    }
                    else
                    {
                        double pf = World.PathField(x, y), sf = World.StoneField(x, y), lush = LushOf(x, y);
                        lushAt[i] = (float)lush;
                        double bse = U.Fbm(x / 38.0, y / 38.0, 1, 3) * 0.7 + U.VNoise(x / 6.0, y / 6.0, 4) * 0.3;
                        if (pf < 16) c = U.RampAt(dirt, bse * 0.9 + 0.15 - Math.Max(0, pf - 10) * 0.03, x, y);
                        else if (sf > 0.35) c = Flagstone(x, y, sf);
                        else if (lush < 0.41) c = U.RampAt(dry, bse * 0.85 + 0.1, x, y);
                        else c = U.RampAt(grass, bse * 0.8 + (lush - 0.41) * 0.8 - (U.Fbm(x / 70.0, y / 70.0, 41, 2) < 0.4 ? 0.18 : 0), x, y);
                        // grass overhangs the water as a dark lip
                        if (wf < 0.035) c = bank[wf < 0.018 ? 0 : 1];
                    }
                    int j = i * 4;
                    d[j] = (byte)c.r; d[j + 1] = (byte)c.g; d[j + 2] = (byte)c.b; d[j + 3] = 255;
                }

            void Set(double fx, double fy, Col c)
            {
                int x = U.ToInt32(fx), y = U.ToInt32(fy);
                if (x < 0 || y < 0 || x >= ww || y >= hh) return;
                int j = (y * ww + x) * 4;
                d[j] = (byte)Math.Round(c.r); d[j + 1] = (byte)Math.Round(c.g); d[j + 2] = (byte)Math.Round(c.b);
            }
            var R = new Rng(99);

            // grass blades: little two-tone strokes, denser where it is lush
            for (int k = 0; k < 230000; k++)
            {
                int x = R.Int(0, w - 1), y = R.Int(2, h - 1);
                int tt = W.TileAt(x / TILE, y / TILE);
                if (tt != T.GRASS || wfAt[y * w + x] < 0.06) continue;
                double l = lushAt[y * w + x];
                bool isDry = l < 0.41;
                if (R.Next() > (isDry ? 0.35 : 0.85)) continue;
                var P = isDry ? dry : grass;
                bool hi = R.Next() < 0.6;
                var top = hi ? P[Math.Min(P.Length - 1, 3 + R.Int(0, 2))] : P[1];
                int bh = R.Int(2, 4);
                int lean = R.Chance(0.5) ? 1 : -1;
                Set(x, y, P[0]);
                for (int s = 1; s <= bh; s++) Set(x + (s > bh - 1 ? lean : 0), y - s, s == bh ? top : P[hi ? 3 : 2]);
                if (R.Chance(0.45)) { Set(x + 2, y, P[0]); Set(x + 2, y - 1, P[2]); Set(x + 2 + lean, y - 2, top); }
            }
            // flowers and mushrooms
            var FLOWERS = new[] { U.Ramp("#5b2c8f", "#8a4ccf", "#c99cff"), U.Ramp("#8f1d2c", "#d13a3a", "#ff8a6a"), U.Ramp("#a07a10", "#e8c03a", "#fff2a0"), U.Ramp("#8a8aa8", "#e8e8f4", "#ffffff") };
            for (int k = 0; k < 2600; k++)
            {
                int cx = R.Int(0, w - 1), cy = R.Int(0, h - 1);
                if (W.TileAt(cx / TILE, cy / TILE) != T.GRASS || wfAt[cy * w + cx] < 0.08) continue;
                if (lushAt[cy * w + cx] < 0.45 && R.Chance(0.7)) continue;
                var F = R.Pick(FLOWERS); int n = R.Int(1, 4);
                for (int f = 0; f < n; f++)
                {
                    int x = cx + R.Int(-5, 5), y = cy + R.Int(-4, 4);
                    Set(x, y + 1, grass[1]); Set(x, y + 2, grass[1]);
                    Set(x, y, F[1]); Set(x - 1, y, F[0]); Set(x + 1, y, F[0]); Set(x, y - 1, F[2]);
                }
            }
            // pebbles on the road
            for (int k = 0; k < 11000; k++)
            {
                int x = R.Int(0, w - 1), y = R.Int(0, h - 1);
                if (World.PathField(x, y) > 13) continue;
                Set(x, y, dirt[4]); Set(x + 1, y, dirt[3]); Set(x, y + 1, dirt[0]); Set(x + 1, y + 1, dirt[0]);
            }
            // lily pads
            var LILY = U.Ramp("#4f8a2a", "#8cbf3a", "#b8dc54", "#e2f08a");
            var PINK = U.Ramp("#c04a7a", "#f08ab0", "#ffd8e8");
            for (int k = 0; k < 900; k++)
            {
                int x = R.Int(0, w - 1), y = R.Int(0, h - 1); double wf = wfAt[y * w + x];
                if (wf > -0.04 || wf < -0.45) continue;
                double r = R.Range(3, 6.5), rot = R.Range(0, 6.28);
                for (double j = -r; j <= r; j++)
                    for (double i = -r * 1.3; i <= r * 1.3; i++)
                    {
                        double q = Math.Pow(i / 1.3, 2) + j * j;
                        if (q > r * r) continue;
                        double a = Math.Atan2(j, i / 1.3) - rot;
                        if (Math.Abs(Math.Atan2(Math.Sin(a), Math.Cos(a))) < 0.35) continue; // the notch
                        double v = 1 - Math.Sqrt(q) / r * 0.5 - (j / r) * 0.3;
                        Set(x + i, y + j, U.RampAt(LILY, v, x + i, y + j));
                    }
                for (double i = -r * 1.3; i <= r * 1.3; i++) Set(x + i, y + r + 1, water[0]);
                if (R.Chance(0.2)) { Set(x, y - 1, PINK[1]); Set(x - 1, y, PINK[0]); Set(x + 1, y, PINK[0]); Set(x, y - 2, PINK[2]); }
            }

            PaintDock(Set);
            return d;
        }

        static Col Flagstone(int x, int y, double sf)
        {
            // irregular flagstones: a jittered Voronoi, bevelled from the top left, grass in the cracks
            var S = stoneP; const int C = 15;
            int gx = (int)Math.Floor(x / (double)C), gy = (int)Math.Floor(y / (double)C);
            double d1 = 1e9, d2 = 1e9, px = 0, py = 0; double cid = 0;
            for (int j = -1; j <= 1; j++)
                for (int i = -1; i <= 1; i++)
                {
                    double cx = (gx + i + 0.2 + U.Hash2(gx + i, gy + j, 61) * 0.6) * C, cy = (gy + j + 0.2 + U.Hash2(gx + i, gy + j, 62) * 0.6) * C;
                    double dd = Math.Sqrt((x - cx) * (x - cx) + Math.Pow((y - cy) * 1.15, 2));
                    if (dd < d1) { d2 = d1; d1 = dd; cid = (gx + i) * 7919.0 + (gy + j); px = cx; py = cy; } else if (dd < d2) d2 = dd;
                }
            double edge = d2 - d1;
            double moss = U.Fbm(x / 18.0, y / 18.0, 13, 2);
            bool gone = U.Hash2(cid, 1, 8) < 0.16 || (sf < 0.45 && U.Hash2(cid, 2, 8) < 0.5);
            if (gone) return U.RampAt(grass, 0.25 + moss * 0.5, x, y);
            if (edge < 1.6) return moss > 0.5 ? grass[1] : S[0];
            double v = 0.42 + U.Hash2(cid, 3, 9) * 0.3;
            double nx = (x - px) / C, ny = (y - py) / C;
            if (edge < 3.2) v += nx + ny < 0 ? 0.18 : -0.16; // bevel
            v += (U.VNoise(x / 3.0, y / 3.0, 14) - 0.5) * 0.2;
            if (moss > 0.64) return U.RampAt(grass, (moss - 0.6) * 2.5 + 0.2, x, y);
            return U.RampAt(S, v, x, y);
        }

        static void PaintDock(Action<double, double, Col> set)
        {
            var Wd = woodP;
            void Plank(int x0, int y0, int x1, int y1)
            {
                for (int y = y0; y < y1; y++)
                    for (int x = x0; x < x1; x++)
                    {
                        int px = x - x0, col = px / 7, lx = px % 7;
                        double seed = col * 31 + Math.Floor((y - y0 + U.Hash2(col, 0, 5) * 40) / 46);
                        Col c;
                        if (lx == 0) c = Wd[0];
                        else
                        {
                            double grain = U.VNoise(x / 2.0, y / 9.0, seed) * 0.35;
                            double v = 0.45 + U.Hash2(seed, 1, 6) * 0.25 + grain - (lx == 6 ? 0.25 : 0) + (lx == 1 ? 0.2 : 0);
                            // knots and worn spots
                            if (U.Hash2(Math.Floor(x / 4.0), Math.Floor(y / 5.0), seed) > 0.985) v = 0.05;
                            c = U.RampAt(Wd, v, x, y);
                        }
                        // plank ends
                        if ((y - y0 + (int)Math.Floor(U.Hash2(col, 0, 5) * 40)) % 46 == 0) c = Wd[0];
                        set(x, y, c);
                    }
                // front face: the thickness of the boards
                for (int x = x0; x < x1; x++)
                {
                    set(x, y1, Wd[1]); set(x, y1 + 1, Wd[1]); set(x, y1 + 2, Wd[0]);
                    set(x, y1 + 3, new Col(28, 60, 70)); set(x, y1 + 4, new Col(30, 80, 95));
                }
            }
            Plank(World.DOCKx0 * TILE, World.DOCKy0 * TILE + 6, (World.DOCKx1 + 1) * TILE + 4, (World.DOCKy1 + 1) * TILE);
            Plank(World.PIERx0 * TILE + 4, World.PIERy * TILE + 4, (World.PIERx1 + 1) * TILE + 2, (World.PIERy + 1) * TILE);
        }

        /// <summary>Shore and sparkle sample points, so the water can be animated cheaply.</summary>
        public static List<Sparkle> WaterSparkles(WorldMap W)
        {
            var o = new List<Sparkle>();
            var R = new Rng(5);
            for (int k = 0; k < 11000; k++)
            {
                int x = R.Int(0, World.MW * TILE), y = R.Int(0, World.MH * TILE); double wf = World.WaterField(x, y);
                if (wf > -0.02) continue;
                if (W.TileAt(x / TILE, y / TILE) == T.DOCK) continue;
                o.Add(new Sparkle { x = x, y = y, len = R.Int(2, 6), ph = (float)R.Range(0, 1), sp = (float)R.Range(0.25, 0.6), edge = wf > -0.08 });
            }
            return o;
        }
    }
}
