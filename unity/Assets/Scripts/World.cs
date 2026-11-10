// The map: a valley with a camp, a lake with a dock, and goblin-held ruins to the north.
// Also the two small prologue areas (dreamed Velmoor and the Relicário) and pathfinding. Ported from
// src/world.js, src/maps.js and src/path.js.
using System;
using System.Collections.Generic;
using UnityEngine;

namespace Brumafolha
{
    public static class T { public const int GRASS = 0, PATH = 1, WATER = 2, DOCK = 3, STONE = 4, MARBLE = 5, WALL = 6, RELIEF = 7, STAIRS = 8, ROOF = 9, MIST = 10; }

    /// <summary>A prop on the map (tree, wall, tent, statue...). `art` is filled in when the map is built.</summary>
    public class WObj
    {
        public string kind, id, who, color;
        public float x, y;
        public int seed, h, lit, v, frame, sortY;
        public bool hidden, open, empty, blank, goblin, @out, noReflect;
        public float? clip, alpha;
        public Spec spec;
        public Glow glow;
        public Art art;
        public FxInst fxe;
        public int colorIdx;
    }

    public class Chest { public float x, y; public bool open; public string name; public int potions, gold; public List<Item> items = new List<Item>(); public Action onOpen; }
    public class Grass { public float x, y, ph; public int v; }
    public class Sparkle { public float x, y, ph, sp; public int len; public bool edge; }
    public class Critter { public string kind; public float x, y, ph, r, sp; public Color32 c0, c1; }

    /// <summary>A group of enemies the story refers to by name (patrol, ruins, relic).</summary>
    public class Group : List<Unit> { public string name; public bool passive; public Group(string n) { name = n; } public Group(string n, IEnumerable<Unit> us) : base(us) { name = n; } }

    public class WorldMap
    {
        public string id, zone;
        public int w, h;
        public byte[] tiles, block;
        public List<WObj> objects = new List<WObj>();
        public List<Grass> grass = new List<Grass>();
        public Dictionary<char, List<Vector2Int>> marks = new Dictionary<char, List<Vector2Int>>();
        public Col[] floorRamp;
        // filled in when built
        public Img ground, waterMask;
        public List<Sparkle> sparkles = new List<Sparkle>();
        public List<Unit> enemies = new List<Unit>(), npcs = new List<Unit>();
        public List<Chest> chests = new List<Chest>();
        public Dictionary<string, Group> groups = new Dictionary<string, Group>();
        public List<Critter> critters = new List<Critter>();

        public int TileAt(int tx, int ty) => tx < 0 || ty < 0 || tx >= w || ty >= h ? -1 : tiles[ty * World.MW + tx];
        public bool Blocked(int tx, int ty) => tx < 0 || ty < 0 || tx >= w || ty >= h || block[ty * World.MW + tx] == 1;
        public void SetBlock(int tx, int ty, bool b) { block[ty * World.MW + tx] = (byte)(b ? 1 : 0); }
    }

    public static class World
    {
        public const int MW = 80, MH = 48; // the valley runs east along the river; the small areas reuse the same grid stride
        const int TILE = U.TILE;

        static readonly double LAKEcx = 47.5 * TILE, LAKEcy = 27 * TILE, LAKErx = 12.5 * TILE, LAKEry = 10 * TILE;
        static readonly double PONDcx = 8 * TILE, PONDcy = 22 * TILE, PONDrx = 3.2 * TILE, PONDry = 2.4 * TILE;
        static Vector2[] Pts(double[,] p) { var o = new Vector2[p.GetLength(0)]; for (int i = 0; i < o.Length; i++) o[i] = new Vector2((float)(p[i, 0] * TILE + 16), (float)(p[i, 1] * TILE + 16)); return o; }
        // the Cardo: the river that leaves the Mirror Lake eastward, toward Vau-de-Cardo
        public static readonly Vector2[] RIVER = Pts(new double[,] { { 56, 27.5 }, { 61, 28.5 }, { 65, 27 }, { 69, 28.8 }, { 73, 30.2 }, { 77, 29.4 }, { 82, 29.8 } });
        static readonly double[][] RIVERd = ToD(RIVER);
        static readonly double[][][] PATHS = {
            ToD(Pts(new double[,] { { 14, 40 }, { 15, 35 }, { 17, 30 }, { 20, 24 }, { 22, 18 }, { 21, 13 }, { 20, 9 } })),
            ToD(Pts(new double[,] { { 20, 24 }, { 25, 25.5 }, { 30, 26.5 }, { 34, 27 } })),
        };
        static double[][] ToD(Vector2[] v) { var o = new double[v.Length][]; for (int i = 0; i < v.Length; i++) o[i] = new double[] { v[i].x, v[i].y }; return o; }
        public static readonly int RUx0 = 9 * TILE, RUy0 = 2 * TILE, RUx1 = 31 * TILE, RUy1 = 14 * TILE;
        public static readonly Vector2 CAMP = new Vector2(13 * TILE + 16, 36 * TILE + 16);
        public const int DOCKx0 = 35, DOCKy0 = 25, DOCKx1 = 40, DOCKy1 = 28, PIERx0 = 41, PIERx1 = 45, PIERy = 27;

        /// <summary>&lt; 0 inside water, in "radius" units.</summary>
        public static double WaterField(double x, double y)
        {
            double n = (U.Fbm(x / 90, y / 90, 3, 3) - 0.5) * 0.5 + (U.VNoise(x / 22, y / 22, 9) - 0.5) * 0.06;
            double a = Sq((x - LAKEcx) / LAKErx) + Sq((y - LAKEcy) / LAKEry) - 1 + n;
            double b = Sq((x - PONDcx) / PONDrx) + Sq((y - PONDcy) / PONDry) - 1 + n * 1.4;
            double d = 1e9;
            for (int i = 0; i < RIVERd.Length - 1; i++) d = Math.Min(d, U.SegDist(x, y, RIVERd[i][0], RIVERd[i][1], RIVERd[i + 1][0], RIVERd[i + 1][1]));
            double hw = TILE * (1.35 + U.Fbm(x / 120, 3, 8, 2) * 0.6);
            double r = Sq(d / hw) - 1 + n * 0.8;
            return Math.Min(a, Math.Min(b, r));
        }
        static double Sq(double v) => v * v;
        public static double RiverDist(double x, double y)
        {
            double d = 1e9;
            for (int i = 0; i < RIVERd.Length - 1; i++) d = Math.Min(d, U.SegDist(x, y, RIVERd[i][0], RIVERd[i][1], RIVERd[i + 1][0], RIVERd[i + 1][1]));
            return d;
        }
        public static double PathField(double x, double y)
        {
            double d = 1e9;
            foreach (var pl in PATHS) for (int i = 0; i < pl.Length - 1; i++) d = Math.Min(d, U.SegDist(x, y, pl[i][0], pl[i][1], pl[i + 1][0], pl[i + 1][1]));
            double dc = Math.Sqrt(Sq(x - CAMP.x) + Sq((y - CAMP.y) * 1.3)) - 60;
            return Math.Min(d, Math.Max(0, dc) + 10) + (U.Fbm(x / 30, y / 30, 5, 2) - 0.5) * 18;
        }
        public static bool InRuins(double x, double y) => x > RUx0 && x < RUx1 && y > RUy0 && y < RUy1;
        public static double StoneField(double x, double y)
        {
            if (!InRuins(x, y)) return 0;
            double cx = (RUx0 + RUx1) / 2.0, cy = (RUy0 + RUy1) / 2.0;
            double e = 1 - Math.Sqrt(Sq((x - cx) / ((RUx1 - RUx0) / 2.0)) + Sq((y - cy) / ((RUy1 - RUy0) / 2.0)));
            return e * 1.4 + (U.Fbm(x / 50, y / 50, 11, 3) - 0.5) * 0.9;
        }
        public static double LushField(double x, double y) => LushField(x, y, WaterField(x, y));
        public static double LushField(double x, double y, double w) => U.Fbm(x / 220, y / 220, 21, 3) * 0.9 + Math.Max(0, 0.5 - w) * 0.45;
        static bool IsDockTile(int tx, int ty) => (tx >= DOCKx0 && tx <= DOCKx1 && ty >= DOCKy0 && ty <= DOCKy1) || (ty == PIERy && tx >= PIERx0 && tx <= PIERx1);

        public static string ZoneAt(float px, float py)
        {
            if (InRuins(px, py)) return "Ruínas de Velmoor";
            if (U.Dist(px, py, CAMP.x, CAMP.y) < 7 * TILE) return "Acampamento do Vale";
            if (px > 58 * TILE) return "Rio Cardo";
            if (WaterField(px, py) < 0.9 && px > 26 * TILE) return "Lago Espelhado";
            return "Bosque de Brumafolha";
        }

        public static WorldMap BuildWorld()
        {
            var tiles = new byte[MW * MH]; var block = new byte[MW * MH];
            for (int ty = 0; ty < MH; ty++)
                for (int tx = 0; tx < MW; tx++)
                {
                    double x = tx * TILE + 16, y = ty * TILE + 16; int i = ty * MW + tx;
                    int t = T.GRASS;
                    if (StoneField(x, y) > 0.35) t = T.STONE;
                    if (PathField(x, y) < 18) t = T.PATH;
                    if (WaterField(x, y) < 0) t = T.WATER;
                    if (IsDockTile(tx, ty)) t = T.DOCK;
                    tiles[i] = (byte)t;
                    if (t == T.WATER) block[i] = 1;
                    if (tx == 0 || ty == 0 || tx == MW - 1 || ty == MH - 1) block[i] = 1;
                }
            var W = new WorldMap { id = "vale", w = MW, h = MH, tiles = tiles, block = block };
            var reserve = new byte[MW * MH];
            bool Free(int tx, int ty, int r)
            {
                for (int j = -r; j <= r; j++)
                    for (int i = -r; i <= r; i++)
                    {
                        int t = W.TileAt(tx + i, ty + j);
                        if (t != T.GRASS || reserve[(ty + j) * MW + tx + i] != 0) return false;
                    }
                return true;
            }
            void Put(WObj o, params int[][] blocks)
            {
                W.objects.Add(o);
                foreach (var bl in blocks) { int bx = bl[0], by = bl[1]; if (bx >= 0 && by >= 0 && bx < MW && by < MH) { block[by * MW + bx] = 1; reserve[by * MW + bx] = 1; } }
            }
            void Keep(int x0, int y0, int x1, int y1) { for (int y = y0; y <= y1; y++) for (int x = x0; x <= x1; x++) if (x >= 0 && y >= 0 && x < MW && y < MH) reserve[y * MW + x] = 1; }
            int[] B(int x, int y) => new[] { x, y };

            // clearings that stay clear
            Keep(9, 32, 18, 40); // camp
            Keep(14, 4, 27, 12); // ruins court
            Keep(18, 19, 25, 24); // patrol clearing
            Keep(12, 31, 12, 31); // the forgotten doe
            Keep(13, 4, 15, 6); // the clan's shelter
            Keep(37, 16, 39, 18); // the Tree of Names
            Keep(8, 23, 10, 25); // the Velmoor marker by the pond

            // --- prologue landmarks
            Put(new WObj { kind = "deer", x = 12 * TILE + 16, y = 31 * TILE + 26, id = "deer" }, B(12, 31));
            Put(new WObj { kind = "loot", x = 24 * TILE + 16, y = 21 * TILE + 26, id = "loot" }, B(24, 21));
            Put(new WObj { kind = "bush", x = 18 * TILE + 14, y = 21 * TILE + 24, seed = 901 });
            Put(new WObj { kind = "bush", x = 17 * TILE + 20, y = 22 * TILE + 18, seed = 902 });
            Put(new WObj { kind = "fern", x = 18 * TILE + 26, y = 22 * TILE + 26, seed = 903 });
            Put(new WObj { kind = "deadtree", x = 38 * TILE + 16, y = 17 * TILE + 26, seed = 4242, id = "nametree" }, B(38, 17));
            {
                int mx = 9, my = 24;
                foreach (var dd in new[] { B(0, 0), B(0, 1), B(1, 1), B(-1, 1), B(1, 0) }) if (W.TileAt(9 + dd[0], 24 + dd[1]) == T.GRASS) { mx = 9 + dd[0]; my = 24 + dd[1]; break; }
                Put(new WObj { kind = "marker", x = mx * TILE + 16, y = my * TILE + 26, id = "marker" }, B(mx, my));
            }

            // --- the camp
            Put(new WObj { kind = "campfire", x = CAMP.x, y = CAMP.y + 6 }, B(13, 36));
            Put(new WObj { kind = "tent", x = 10 * TILE + 16, y = 34 * TILE + 28, colorIdx = 0 }, B(10, 34), B(11, 34), B(9, 34));
            Put(new WObj { kind = "tent", x = 17 * TILE + 8, y = 34 * TILE + 24, colorIdx = 1 }, B(16, 34), B(17, 34));
            Put(new WObj { kind = "log", x = CAMP.x - 34, y = CAMP.y + 14 });
            Put(new WObj { kind = "log", x = CAMP.x + 30, y = CAMP.y + 26 });
            Put(new WObj { kind = "crate", x = 11 * TILE + 4, y = 37 * TILE + 26 }, B(11, 37));
            Put(new WObj { kind = "barrel", x = 9 * TILE + 26, y = 36 * TILE + 22 }, B(9, 36));

            // --- the dock: posts along its edges
            for (int tx = DOCKx0; tx <= DOCKx1 + 1; tx += 2)
            {
                Put(new WObj { kind = "post", x = tx * TILE + 2, y = DOCKy0 * TILE + 8, h = 14 });
                Put(new WObj { kind = "post", x = tx * TILE + 2, y = (DOCKy1 + 1) * TILE + 2, h = 10 });
            }
            for (int tx = PIERx0; tx <= PIERx1 + 1; tx += 2) Put(new WObj { kind = "post", x = tx * TILE + 2, y = (PIERy + 1) * TILE + 2, h = 8 });
            Put(new WObj { kind = "post", x = (PIERx1 + 1) * TILE + 4, y = PIERy * TILE + 4, h = 18 });
            Put(new WObj { kind = "barrel", x = 39 * TILE + 8, y = 25 * TILE + 22 }, B(39, 25));
            Put(new WObj { kind = "crate", x = 40 * TILE + 12, y = 25 * TILE + 26 }, B(40, 25));
            Put(new WObj { kind = "rowboat", x = 41 * TILE + 20, y = 28 * TILE + 22, id = "boat" });

            // --- the ruins: broken walls around a court, pillars, the goblin camp
            void Wall(int x0, int x1, int y, params int[] broken)
            {
                for (int tx = x0; tx <= x1; tx++)
                {
                    if (Array.IndexOf(broken, tx) >= 0)
                    {
                        if (U.Hash2(tx, y, 4) < 0.5) Put(new WObj { kind = "rubble", x = tx * TILE + 16, y = y * TILE + 26, seed = tx * 7 + y });
                        continue;
                    }
                    int hh = 2 + (int)Math.Floor(U.Hash2(tx, y, 2) * 3);
                    Put(new WObj { kind = "wall", x = tx * TILE, y = y * TILE + TILE, h = hh, seed = tx * 13 + y }, B(tx, y));
                }
            }
            Wall(12, 28, 3, 16, 17, 23, 26);
            Wall(12, 15, 13, 14);
            Wall(25, 28, 13, 26);
            void VWall(int x, int y0, int y1, params int[] broken)
            {
                for (int ty = y0; ty <= y1; ty++)
                {
                    if (Array.IndexOf(broken, ty) >= 0) continue;
                    Put(new WObj { kind = "wall", x = x * TILE, y = ty * TILE + TILE, h = 2 + (int)Math.Floor(U.Hash2(x, ty, 2) * 3), seed = x * 5 + ty * 3 }, B(x, ty));
                }
            }
            VWall(12, 4, 12, 7, 8);
            VWall(28, 4, 12, 9, 10);
            foreach (var p in new[] { new[] { 16, 6, 3 }, new[] { 24, 6, 2 }, new[] { 16, 10, 1 }, new[] { 24, 10, 0 } })
                Put(new WObj { kind = "pillar", x = p[0] * TILE + 16, y = p[1] * TILE + 28, h = p[2], seed = p[0] + p[1] }, B(p[0], p[1]));
            // the broken column, and the trapdoor at its foot (hidden until Tomé shows it)
            Put(new WObj { kind = "rubble", x = 25 * TILE + 4, y = 10 * TILE + 24, seed = 77 });
            Put(new WObj { kind = "trapdoor", x = 24 * TILE + 16, y = 11 * TILE + 24, id = "trapdoor", hidden = true });
            Put(new WObj { kind = "campfire", x = 20 * TILE + 16, y = 8 * TILE + 24, goblin = true }, B(20, 8));
            Put(new WObj { kind = "banner", x = 18 * TILE + 16, y = 5 * TILE + 26 }, B(18, 5));
            Put(new WObj { kind = "bones", x = 22 * TILE + 10, y = 10 * TILE + 20 });
            Put(new WObj { kind = "bones", x = 14 * TILE + 20, y = 8 * TILE + 12 });
            for (int i = 0; i < 6; i++) Put(new WObj { kind = "rubble", x = (13 + ((i * 37) % 15)) * TILE + 10, y = (5 + ((i * 23) % 7)) * TILE + 20, seed = i + 40 });

            // the Cardo's banks stay open: nothing tall right beside it, and no tree on the south bank close enough
            // for its canopy to stand over the water (the boat sails down here at the end)
            for (int ty = 0; ty < MH; ty++)
                for (int tx = 54; tx < MW; tx++)
                {
                    double x = tx * TILE + 16, y = ty * TILE + 16;
                    double d = RiverDist(x, y);
                    bool waterAbove = false;
                    for (int k = 1; k <= 5; k++) if (W.TileAt(tx, ty - k) == T.WATER) waterAbove = true;
                    if (d < 2.5 * TILE || (waterAbove && d < 6 * TILE)) Keep(tx, ty, tx, ty);
                }

            // --- trees: a dense border, then scattered groves
            var R = new Rng(7);
            void TryTree(int tx, int ty, bool edge)
            {
                if (!Free(tx, ty, edge ? 0 : 1)) return;
                string kind = ty < 15 && R.Chance(0.55) ? "pine" : R.Chance(0.12) ? "deadtree" : "tree";
                Put(new WObj { kind = kind, x = (float)(tx * TILE + 16 + R.Range(-6, 6)), y = ty * TILE + 26, seed = R.Int(1, 1e6) }, B(tx, ty));
                Keep(tx - 1, ty - 1, tx + 1, ty);
            }
            for (int ty = 0; ty < MH; ty++)
                for (int tx = 0; tx < MW; tx++)
                {
                    int e = Math.Min(Math.Min(tx, ty), Math.Min(MW - 1 - tx, MH - 1 - ty));
                    double n = U.Fbm(tx / 6.0, ty / 6.0, 31, 2);
                    if (e <= 2 && R.Chance(0.7)) TryTree(tx, ty, true);
                    else if (e > 2 && n > 0.6 && R.Chance(0.28)) TryTree(tx, ty, false);
                }
            for (int tx = 0; tx < MW; tx++) for (int ty = 0; ty < MH; ty++) if (Math.Min(Math.Min(tx, ty), Math.Min(MW - 1 - tx, MH - 1 - ty)) == 0) block[ty * MW + tx] = 1;

            // rocks, bushes, ferns
            for (int i = 0; i < 260; i++)
            {
                int tx = R.Int(2, MW - 3), ty = R.Int(2, MH - 3);
                double x = tx * TILE + R.Range(4, 28), y = ty * TILE + R.Range(8, 30);
                int t = W.TileAt(tx, ty);
                if (t == T.WATER)
                {
                    if (WaterField(x, y) > -0.5 && R.Chance(0.25)) Put(new WObj { kind = "waterrock", x = (float)x, y = (float)y, seed = i });
                    continue;
                }
                if (t != T.GRASS || reserve[ty * MW + tx] != 0) continue;
                double r = R.Next();
                if (r < 0.2) Put(new WObj { kind = "rock", x = (float)x, y = (float)y, seed = i }, B(tx, ty));
                else if (r < 0.55) Put(new WObj { kind = "bush", x = (float)x, y = (float)y, seed = i });
                else Put(new WObj { kind = "fern", x = (float)x, y = (float)y, seed = i });
            }

            // tall grass clumps that sway (not blocking)
            for (int i = 0; i < 6500; i++)
            {
                double x = R.Range(2 * TILE, (MW - 2) * TILE), y = R.Range(2 * TILE, (MH - 2) * TILE);
                int tx = (int)(x / TILE), ty = (int)(y / TILE), t = W.TileAt(tx, ty);
                if (t != T.GRASS) continue;
                double l = LushField(x, y);
                if (R.Next() > (l - 0.3) * 1.3) continue;
                W.grass.Add(new Grass { x = (float)x, y = (float)y, v = R.Int(0, 5), ph = (float)R.Range(0, 6.28) });
            }
            return W;
        }

        // ---------------------------------------------------------------- the prologue's two small areas
        // laid out tile by tile from the level plan (docs/planta-prologo.html): dreamed Velmoor (17×24) and the
        // Relicário under the ruins (23×31). They share the valley's 64-wide grid stride, so pathfinding and combat
        // work unchanged; everything outside the area is solid.
        static WorldMap GridWorld(string id, string[] rows, Dictionary<char, (int t, bool walk)> legend)
        {
            int h = rows.Length, w = rows[0].Length;
            var tiles = new byte[MW * MH]; var block = new byte[MW * MH];
            for (int i = 0; i < tiles.Length; i++) { tiles[i] = T.WALL; block[i] = 1; }
            var W = new WorldMap { id = id, w = w, h = h, tiles = tiles, block = block };
            for (int y = 0; y < h; y++)
                for (int x = 0; x < w; x++)
                {
                    char ch = rows[y][x];
                    var L = legend.TryGetValue(ch, out var l) ? l : legend['.'];
                    tiles[y * MW + x] = (byte)L.t;
                    block[y * MW + x] = (byte)(L.walk ? 0 : 1);
                    if (!W.marks.TryGetValue(ch, out var list)) W.marks[ch] = list = new List<Vector2Int>();
                    list.Add(new Vector2Int(x, y));
                }
            return W;
        }

        // # mist (closes the sides)   2 tower   ~ avenue   o a faceless figure   C the one who turns   L the woman
        static readonly string[] DREAM = {
            "#################",
            "##222~~~~~~~222##",
            "#222~~~~L~~~~222#",
            "#22~~~~~~~~~~~22#",
            "#22~~o~~~~~o~~22#",
            "#222~~~~~~~~~222#",
            "##2222~~~~~2222##",
            "##2222~o~~~2222##",
            "##2222~~~C~2222##",
            "##2222o~~~o2222##",
            "##2222~~~o~2222##",
            "##2222o~~~o2222##",
            "##2222~~o~~2222##",
            "##2222~~~~~2222##",
            "##2222o~~~o2222##",
            "###22~~~~~~~22###",
            "###22~~o~~o~22###",
            "###22~~~~~~~22###",
            "###222o~~~o222###",
            "####22~~~~~22####",
            "####22~~~~~22####",
            "####22~~~~~22####",
            "######~~~~~######",
            "#################",
        };

        public static WorldMap BuildDream()
        {
            var walk = (T.MARBLE, true);
            var W = GridWorld("sonho", DREAM, new Dictionary<char, (int, bool)> { ['#'] = (T.MIST, false), ['2'] = (T.ROOF, false), ['~'] = walk, ['o'] = walk, ['C'] = walk, ['L'] = walk, ['.'] = (T.MIST, false) });
            W.zone = "Velmoor sonhada";
            W.floorRamp = Interiors.IRAMP_warm;
            // a skyline: a tower on every roof tile, taller towards the back
            foreach (var p in W.marks['2'])
            {
                int h = 1 + (int)Math.Floor(U.Hash2(p.x, p.y, 9) * 3) + (p.y < 8 ? 1 : 0);
                W.objects.Add(new WObj { kind = "tower", x = p.x * TILE, y = p.y * TILE + TILE - 1, h = h, seed = p.x * 31 + p.y * 7 });
            }
            return W;
        }

        // . slate wall   B floor   # relief wall   0 pillar   P pedestal   D sealed door   S statue
        // R a relief with someone's face (H the hero, M Tomé)   I inscription   E stairs up to the valley
        static readonly string[] RELIC = {
            ".......................",
            "....BBBBBBBBBBBBBBB....",
            "...BBBBBBBBBBBBBBBBB...",
            "...BB0BBBBBPBBBBB0BB...",
            "...BBBBBBBBBBBBBBBBB...",
            "...BBBBBBBBBBBBBBBBB...",
            "...BB0BBBBBBBBBBB0BB...",
            "...BBBBBBBBBBBBBBBBB...",
            "....BBBBBBBBBBBBBBB....",
            "..........DDD..........",
            "..........BBB..........",
            ".....BBBBBBBBBBBBB.....",
            ".....BBBBBBBBBBBBB.....",
            "....SBBBBBBSBBBBBBS....",
            ".....BBBBBBBBBBBBB.....",
            ".....BBBBBBBBBBBBB.....",
            "..........BBB..........",
            "..........BBB..........",
            "..........BBB..........",
            "......####BBB####......",
            ".....#BBBBBBBBBBB#.....",
            ".....HBBBBBBBBBBB#.....",
            ".....#BBBBBBBBBBBM.....",
            ".....#BBBBBBBBBBB#.....",
            ".....#BBBBBBBBBBB#.....",
            "......####BBB####......",
            "..........BBB..........",
            "..........BBB..........",
            ".........IBBB..........",
            "..........EEE..........",
            ".......................",
        };

        public static WorldMap BuildRelic()
        {
            var floor = (T.MARBLE, true); var solidFloor = (T.MARBLE, false);
            var W = GridWorld("relicario", RELIC, new Dictionary<char, (int, bool)> {
                ['.'] = (T.WALL, false), ['#'] = (T.RELIEF, false), ['H'] = (T.RELIEF, false), ['M'] = (T.RELIEF, false), ['I'] = (T.WALL, false),
                ['B'] = floor, ['0'] = solidFloor, ['P'] = solidFloor, ['S'] = solidFloor, ['D'] = solidFloor, ['E'] = (T.STAIRS, true),
            });
            W.zone = "Relicário de Velmoor";
            W.floorRamp = Interiors.IRAMP_marble;
            foreach (var p in W.marks['0']) W.objects.Add(new WObj { kind = "rpillar", x = p.x * TILE + 16, y = p.y * TILE + 28, h = 4, seed = 300 + p.x * 3 + p.y });
            return W;
        }
    }

    // ---------------------------------------------------------------- A* over the tile grid, 8 directions, no corner cutting
    public static class PathFind
    {
        const int MW = World.MW, MH = World.MH;

        public static List<Vector2Int> FindPath(Func<int, int, bool> blocked, int sx, int sy, int gx, int gy, int maxNodes = 4000)
        {
            if (sx == gx && sy == gy) return new List<Vector2Int>();
            if (blocked(gx, gy)) return null;
            int Key(int x, int y) => y * MW + x;
            var g = new Dictionary<int, double>(); var from = new Dictionary<int, int>();
            var open = new List<(double f, int x, int y)> { (0, sx, sy) };
            g[Key(sx, sy)] = 0;
            double H(int x, int y) { int dx = Math.Abs(x - gx), dy = Math.Abs(y - gy); return Math.Max(dx, dy) + 0.4 * Math.Min(dx, dy); }
            int n = 0;
            while (open.Count > 0 && n++ < maxNodes)
            {
                int bi = 0;
                for (int i = 1; i < open.Count; i++) if (open[i].f < open[bi].f) bi = i;
                var (_, x, y) = open[bi]; open.RemoveAt(bi);
                if (x == gx && y == gy)
                {
                    var o = new List<Vector2Int>();
                    int k = Key(x, y);
                    while (from.ContainsKey(k)) { o.Add(new Vector2Int(k % MW, k / MW)); k = from[k]; }
                    o.Reverse();
                    return o;
                }
                double gc = g[Key(x, y)];
                for (int dy = -1; dy <= 1; dy++)
                    for (int dx = -1; dx <= 1; dx++)
                    {
                        if (dx == 0 && dy == 0) continue;
                        int nx = x + dx, ny = y + dy;
                        if (nx < 0 || ny < 0 || nx >= MW || ny >= MH || blocked(nx, ny)) continue;
                        if (dx != 0 && dy != 0 && (blocked(x + dx, y) || blocked(x, y + dy))) continue;
                        double ng = gc + (dx != 0 && dy != 0 ? 1.4 : 1);
                        int k = Key(nx, ny);
                        if (g.TryGetValue(k, out var old) && old <= ng) continue;
                        g[k] = ng; from[k] = Key(x, y);
                        open.Add((ng + H(nx, ny), nx, ny));
                    }
            }
            return null;
        }

        /// <summary>Every tile reachable within `steps` moves (diagonals count as one, like the tabletop).</summary>
        public static Dictionary<int, int> Reachable(Func<int, int, bool> blocked, int sx, int sy, int steps)
        {
            var dist = new Dictionary<int, int> { [sy * MW + sx] = 0 };
            var q = new Queue<(int, int)>(); q.Enqueue((sx, sy));
            while (q.Count > 0)
            {
                var (x, y) = q.Dequeue(); int d = dist[y * MW + x];
                if (d >= steps) continue;
                for (int dy = -1; dy <= 1; dy++)
                    for (int dx = -1; dx <= 1; dx++)
                    {
                        if (dx == 0 && dy == 0) continue;
                        int nx = x + dx, ny = y + dy, k = ny * MW + nx;
                        if (blocked(nx, ny) || dist.ContainsKey(k)) continue;
                        if (dx != 0 && dy != 0 && (blocked(x + dx, y) || blocked(x, y + dy))) continue;
                        dist[k] = d + 1; q.Enqueue((nx, ny));
                    }
            }
            return dist;
        }

        /// <summary>Shortest path where every step costs 1, for combat moves.</summary>
        public static List<Vector2Int> GridPath(Func<int, int, bool> blocked, int sx, int sy, int gx, int gy)
        {
            var prev = new Dictionary<int, int> { [sy * MW + sx] = -1 };
            var q = new Queue<(int, int)>(); q.Enqueue((sx, sy));
            while (q.Count > 0)
            {
                var (x, y) = q.Dequeue();
                if (x == gx && y == gy) break;
                for (int dy = -1; dy <= 1; dy++)
                    for (int dx = -1; dx <= 1; dx++)
                    {
                        if (dx == 0 && dy == 0) continue;
                        int nx = x + dx, ny = y + dy, k = ny * MW + nx;
                        if (blocked(nx, ny) || prev.ContainsKey(k)) continue;
                        if (dx != 0 && dy != 0 && (blocked(x + dx, y) || blocked(x, y + dy))) continue;
                        prev[k] = y * MW + x; q.Enqueue((nx, ny));
                    }
            }
            int kk = gy * MW + gx;
            if (!prev.ContainsKey(kk)) return null;
            var o = new List<Vector2Int>();
            while (prev[kk] != -1) { o.Add(new Vector2Int(kk % MW, kk / MW)); kk = prev[kk]; }
            o.Reverse();
            return o;
        }
    }
}
