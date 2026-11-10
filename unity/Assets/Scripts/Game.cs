// Brumafolha: boot, the maps, exploring, cutscenes, and drawing it all. The prologue's script lives in Story.cs.
// Ported from src/main.js. The game draws into a small render texture at 1/scale of the screen, like the canvas did,
// and the UI goes on top with Unity's immediate-mode GUI. No scene setup needed: the game builds itself at start.
using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using UnityEngine;

namespace Brumafolha
{
    public class Game : MonoBehaviour
    {
        const int TILE = U.TILE, MW = World.MW, MH = World.MH;
        public static Game inst;
        public static bool loaded;

        static Img mist, vignette, fgLeft, fgRight, glowTex;
        static Texture2D fogTex; static Color32[] fogPx;
        static RenderTexture rt, reflRT;
        static readonly Dictionary<string, Art> art = new Dictionary<string, Art>();
        static readonly Dictionary<int, Img> shadows = new Dictionary<int, Img>();
        static readonly List<GrassArt> grassArt = new List<GrassArt>();
        static readonly Dictionary<string, WorldMap> maps = new Dictionary<string, WorldMap>();
        public static Art[] chestArt;

        // ---------------------------------------------------------------- bootstrap: works in any scene, even an empty one
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Bootstrap()
        {
            if (FindAnyObjectByType<Game>() != null) return;
            var cam = Camera.main;
            if (cam == null) { var go = new GameObject("Brumafolha"); cam = go.AddComponent<Camera>(); go.AddComponent<AudioListener>(); }
            if (cam.GetComponent<AudioListener>() == null) cam.gameObject.AddComponent<AudioListener>();
            cam.clearFlags = CameraClearFlags.SolidColor; cam.backgroundColor = new Color(11 / 255f, 10 / 255f, 16 / 255f); cam.cullingMask = 0; cam.orthographic = true;
            cam.gameObject.AddComponent<Synth>();
            cam.gameObject.AddComponent<Game>();
        }

        void Awake()
        {
            inst = this;
            Application.targetFrameRate = 60;
            Gfx.Init();
            StartCoroutine(BootRoutine());
        }

        // ---------------------------------------------------------------- boot
        IEnumerator BootRoutine()
        {
            loaded = false;
            float t0 = Time.realtimeSinceStartup;
            G.mode = "title";
            for (int v = 0; v < 6; v++) grassArt.Add(Props.MakeTallGrass(v));
            mist = MakeMist();
            fgLeft = Silhouette(11); fgRight = Silhouette(29);
            glowTex = MakeGlowTex();
            chestArt = new[] { Props.MakeChest(false), Props.MakeChest(true) };
            G.fx = new FxLayer();
            yield return null;
            // the maps and their ground are pure number crunching: do it off the main thread
            WorldMap vale = null, sonho = null, relic = null; byte[] gV = null, gS = null, gR = null; int wv = 0, hv = 0, ws = 0, hs = 0, wr = 0, hr = 0;
            List<Sparkle> sparkles = null;
            var job = Task.Run(() =>
            {
                vale = World.BuildWorld(); gV = Ground.PaintGround(vale, out wv, out hv); sparkles = Ground.WaterSparkles(vale);
                sonho = World.BuildDream(); gS = Interiors.PaintInterior(sonho, out ws, out hs);
                relic = World.BuildRelic(); gR = Interiors.PaintInterior(relic, out wr, out hr);
            });
            while (!job.IsCompleted) yield return null;
            if (job.Exception != null) { Debug.LogException(job.Exception); yield break; }
            SpawnCompanions();
            Story.Init();
            FinishMap(vale, gV, wv, hv, sparkles); yield return null;
            FinishMap(sonho, gS, ws, hs, new List<Sparkle>()); yield return null;
            FinishMap(relic, gR, wr, hr, new List<Sparkle>()); yield return null;
            LoadMap("vale", 15, 38);
            Debug.Log($"Brumafolha loaded in {Mathf.RoundToInt((Time.realtimeSinceStartup - t0) * 1000)} ms");
            loaded = true;
        }

        static void FinishMap(WorldMap W, byte[] ground, int w, int h, List<Sparkle> sparkles)
        {
            W.ground = Img.From(ground, w, h);
            if (W.id == "vale") W.waterMask = WaterMask(ground, w, h);
            W.sparkles = sparkles;
            Story.Populate(W);
            foreach (var o in W.objects) o.art = PropArt(o);
            foreach (var c in W.chests) W.block[Mathf.FloorToInt((c.y - 1) / TILE) * MW + Mathf.FloorToInt(c.x / TILE)] = 1;
            W.critters = MakeCritters(W);
            maps[W.id] = W;
        }

        public static void Create()
        {
            Snd.Init();
            G.mode = "create";
            Creator.Open(build => { Recruit(build); Begin(); }, b => CompanionFor(b).label);
        }
        /// <summary>Who joins the hero: a fighter for a spellcaster, the elven mage otherwise.</summary>
        static (Unit u, string label) CompanionFor(Build b) => Rules.CLASSES[b.cls].role == "caster" ? (G.kael, "Kael, guerreiro") : (G.lyra, "Lyra, maga élfica");
        static void Recruit(Build build)
        {
            var spec = Rules.SpecOf(build);
            var hero = MakeUnit(spec, u => { Rules.HeroDef(u, build); u.tx = 15; u.ty = 38; });
            hero.spec = spec;
            G.build = build;
            G.hero = hero;
            G.mate = CompanionFor(build).u;
            G.party = new List<Unit> { hero };
            G.leader = 0;
        }
        static void Begin()
        {
            G.mode = "cutscene";
            Story.Start().Forget();
        }

        // ---------------------------------------------------------------- the maps
        public static WorldMap Map(string id) => maps[id];

        /// <summary>Switch to a map and put the party (and followers) around a tile.</summary>
        public static void LoadMap(string id, int tx, int ty, int dir = 3)
        {
            var W = maps[id];
            G.W = W;
            G.enemies = W.enemies; G.npcs = W.npcs; G.chests = W.chests; G.groups = W.groups;
            foreach (var e in G.fx.list) e.keep = false;
            G.fx.list.Clear();
            foreach (var o in W.objects) if (o.kind == "campfire" && !o.@out) o.fxe = G.fx.Spawn(FxKind.Campfire, new FxOpts { x = o.x, y = o.y + 2, light = 0.55f, seed = o.goblin ? 3 : 0 }, keep: true);
            var all = G.party.Concat(G.followers).ToList();
            var spots = FreeAround(tx, ty, all.Count);
            for (int i = 0; i < all.Count; i++) { var c = Combat.TileCenter(spots[i].x, spots[i].y); all[i].x = c.x; all[i].y = c.y; all[i].path.Clear(); all[i].dir = dir; }
            trail.Clear();
            var l = G.Lead;
            if (l != null) { G.cam.x = l.x - G.vw / 2f; G.cam.y = l.y - G.vh / 2f; }
            zoneNow = "";
        }

        static List<Vector2Int> FreeAround(int tx, int ty, int n)
        {
            var o = new List<Vector2Int>();
            for (int r = 0; r < 6 && o.Count < n; r++)
                for (int dy = -r; dy <= r && o.Count < n; dy++)
                    for (int dx = -r; dx <= r && o.Count < n; dx++)
                    {
                        if (Math.Max(Math.Abs(dx), Math.Abs(dy)) != r) continue;
                        if (!G.W.Blocked(tx + dx, ty + dy) || (r == 0 && o.Count == 0)) o.Add(new Vector2Int(tx + dx, ty + dy));
                    }
            while (o.Count < n) o.Add(new Vector2Int(tx, ty));
            return o;
        }

        static List<Critter> MakeCritters(WorldMap W)
        {
            var o = new List<Critter>(); var R = new Rng(17 + W.id.Length);
            if (W.id == "vale")
            {
                var BF = new[] { ("#5b2c8f", "#c99cff"), ("#a04a10", "#ffc46a"), ("#2a5a8a", "#9adcff"), ("#c0c0d0", "#ffffff") };
                for (int i = 0; i < 26; i++)
                {
                    double x = R.Range(4, MW - 4) * TILE, y = R.Range(4, MH - 4) * TILE;
                    if (W.TileAt((int)(x / TILE), (int)(y / TILE)) != 0) continue;
                    var c = R.Pick(BF);
                    o.Add(new Critter { kind = "bf", x = (float)x, y = (float)y, c0 = Gfx.Hex(c.Item1), c1 = Gfx.Hex(c.Item2), ph = (float)R.Range(0, 9), r = (float)R.Range(14, 40), sp = (float)R.Range(0.3, 0.7) });
                }
                for (int i = 0; i < 70; i++)
                {
                    bool inR = i < 40;
                    double x = inR ? R.Range(10, 30) * TILE : R.Range(32, 76) * TILE, y = inR ? R.Range(3, 14) * TILE : R.Range(17, 37) * TILE;
                    o.Add(new Critter { kind = "ff", x = (float)x, y = (float)y, ph = (float)R.Range(0, 9), r = (float)R.Range(8, 30), sp = (float)R.Range(0.15, 0.4) });
                }
            }
            else
            {
                // slow pale motes of light
                for (int i = 0; i < 50; i++) o.Add(new Critter { kind = "mote", x = (float)(R.Range(2, W.w - 2) * TILE), y = (float)(R.Range(2, W.h - 2) * TILE), ph = (float)R.Range(0, 9), r = (float)R.Range(10, 40), sp = (float)R.Range(0.08, 0.2) });
            }
            return o;
        }

        public static Art PropArt(WObj o)
        {
            Art Key(string k) { if (!art.TryGetValue(k, out var a)) art[k] = a = MakeArt(o); return a; }
            switch (o.kind)
            {
                // leafy trees carry a few wind frames each: share 48 variants of each instead of one per tree
                case "tree": case "pine": return Key(o.kind + (o.seed % 48));
                case "deadtree": case "rock": case "bush": case "fern": case "waterrock": case "rubble": case "bones": return Key(o.kind + o.seed);
                case "wall": return Key($"wall{o.h}-{o.seed % 7}");
                case "pillar": return Key($"pillar{o.h}-{o.seed}");
                case "rpillar": return Key($"rpillar{o.seed}");
                case "tower": return Key($"tower{o.h}-{o.seed % 9}");
                case "post": return Key("post" + o.h);
                case "tent": return Key("tent" + o.colorIdx);
                case "statue": return Key($"statue{(o.lit != 0 ? 1 : 0)}");
                case "door": return Key($"door{o.lit}");
                case "pedestal": return Key($"pedestal{(o.empty ? 0 : 1)}");
                case "trapdoor": return Key($"trapdoor{(o.open ? 1 : 0)}");
                case "relief": return o.spec != null ? Key($"relief-{o.who}-{(o.blank ? 0 : 1)}-{o.v}") : null;
                case "deer": return Key($"deer{o.frame}");
                default: return Key(o.kind);
            }
        }
        static Art MakeArt(WObj o)
        {
            switch (o.kind)
            {
                case "tree": return Props.MakeTree(o.seed);
                case "pine": return Props.MakePine(o.seed);
                case "deadtree": return Props.MakeDeadTree(o.seed);
                case "rock": return Props.MakeRock(o.seed);
                case "waterrock": return Props.MakeRock(o.seed, true);
                case "bush": return Props.MakeBush(o.seed);
                case "fern": return Props.MakeFern(o.seed);
                case "wall": return Props.MakeWall(o.h, o.seed, o.seed % 3 == 0);
                case "pillar": return Props.MakePillar(o.h, o.seed);
                case "rpillar": return Props.MakePillar(o.h, o.seed, Interiors.IRAMP_marble, false);
                case "rubble": return Props.MakeRubble(o.seed);
                case "post": return Props.MakePost(o.h);
                case "tent": return Props.MakeTent(o.colorIdx);
                case "log": return Props.MakeLog();
                case "crate": return Props.MakeCrate();
                case "barrel": return Props.MakeBarrel();
                case "rowboat": return Props.MakeRowboat();
                case "campfire": return Props.MakeCampfireBase();
                case "banner": return Props.MakeBanner();
                case "bones": return Props.MakeBones(o.seed);
                case "tower": return Interiors.MakeTower(o.seed, o.h);
                case "lantern": return Interiors.MakeLantern();
                case "pedestal": return Interiors.MakePedestal(!o.empty);
                case "statue": return Interiors.MakeStatue(Chars.SPECS["statue"], o.lit != 0);
                case "door": return Interiors.MakeDoor(o.lit);
                case "relief": return Interiors.MakeRelief(o.spec, o.blank);
                case "deer": return Interiors.MakeDeer(o.frame);
                case "loot": return Interiors.MakeLoot();
                case "trapdoor": return Interiors.MakeTrapdoor(o.open);
                case "marker": return Interiors.MakeMarker();
            }
            return null;
        }
        static Img ShadowOf(int r) { if (!shadows.TryGetValue(r, out var s)) shadows[r] = s = Props.MakeShadow(r); return s; }

        /// <summary>Where the ground is open water (the water ramp's colours), as an alpha mask the reflections are cut to.</summary>
        static Img WaterMask(byte[] img, int w, int h)
        {
            var keys = new HashSet<int>(Ground.water.Select(c => ((int)c.r << 16) | ((int)c.g << 8) | (int)c.b));
            var d = new byte[img.Length];
            for (int i = 0; i < img.Length; i += 4) if (keys.Contains((img[i] << 16) | (img[i + 1] << 8) | img[i + 2])) { d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = 255; }
            return Img.From(d, w, h);
        }

        // tileable soft mist
        static Img MakeMist()
        {
            const int S = 160, P = 8; var d = new byte[S * S * 4];
            double Val(int x, int y) => U.Hash2(((x % P) + P) % P, ((y % P) + P) % P, 77);
            double Sm(double t) => t * t * (3 - 2 * t);
            for (int y = 0; y < S; y++) for (int x = 0; x < S; x++)
                {
                    double fx = (double)x / S * P, fy = (double)y / S * P; int xi = (int)Math.Floor(fx), yi = (int)Math.Floor(fy); double u = fx - xi, v = fy - yi;
                    double n = Val(xi, yi) * (1 - Sm(u)) * (1 - Sm(v)) + Val(xi + 1, yi) * Sm(u) * (1 - Sm(v)) + Val(xi, yi + 1) * (1 - Sm(u)) * Sm(v) + Val(xi + 1, yi + 1) * Sm(u) * Sm(v);
                    int j = (y * S + x) * 4;
                    d[j] = 190; d[j + 1] = 210; d[j + 2] = 215; d[j + 3] = (byte)Math.Max(0, (n - 0.45) * 160);
                }
            var img = Img.From(d, S, S); img.tex.wrapMode = TextureWrapMode.Repeat;
            return img;
        }

        // dark branches framing the bottom of the screen
        static Img Silhouette(int seed)
        {
            var pb = Props.DeadTreeBuf(seed);
            for (int i = 0; i < pb.d.Length; i += 4) if (pb.d[i + 3] != 0)
                {
                    int l = pb.d[i] + pb.d[i + 1];
                    pb.d[i] = (byte)(l > 150 ? 44 : 26); pb.d[i + 1] = (byte)(l > 150 ? 22 : 14); pb.d[i + 2] = (byte)(l > 150 ? 46 : 30);
                }
            return pb.ToImg();
        }
        static Img MakeGlowTex()
        {
            const int S = 64; var d = new byte[S * S * 4];
            for (int y = 0; y < S; y++) for (int x = 0; x < S; x++)
                {
                    float r = Mathf.Sqrt((x - S / 2f + 0.5f) * (x - S / 2f + 0.5f) + (y - S / 2f + 0.5f) * (y - S / 2f + 0.5f)) / (S / 2f);
                    int j = (y * S + x) * 4; d[j] = d[j + 1] = d[j + 2] = 255; d[j + 3] = (byte)(Mathf.Clamp01(1 - r) * 255);
                }
            return Img.From(d, S, S, false);
        }
        /// <summary>A soft additive radial light, centred at a screen point (the canvas' radial gradient with "lighter").</summary>
        public static void Glow(float sx, float sy, float r, Color c) => Gfx.Draw(glowTex, sx - r, sy - r, r * 2, r * 2, c, Gfx.ADD);

        // ---------------------------------------------------------------- the cast
        public static Unit MakeUnit(string specKey, Action<Unit> def) => MakeUnit(Chars.SPECS[specKey], def);
        public static Unit MakeUnit(Spec spec, Action<Unit> def)
        {
            var ch = Chars.BuildCharacter(spec);
            var u = new Unit { ch = ch, portrait = Chars.Portrait(ch), spec = spec };
            def?.Invoke(u);
            u.hp = u.maxHp;
            u.slots = u.maxSlots;
            var c = Combat.TileCenter(u.tx, u.ty); u.x = c.x; u.y = c.y;
            return u;
        }

        // the companions are built by the same rules as the hero, so they can change gear too
        static Build KAEL() => new Build
        {
            race = "humano", cls = "guerreiro", gender = "m", name = "Kael", @base = new Dictionary<string, int> { ["FOR"] = 15, ["DES"] = 12, ["CON"] = 14, ["INT"] = 9, ["SAB"] = 12, ["CAR"] = 11 },
            look = new Look { skin = 1, hair = 1, style = "short", beard = null, eyes = 0, outfit = 0, cape = 1 }, equip = new Equip { main = "espadaLonga", ranged = null, armor = "malha", shield = null },
            extraSkills = new List<string> { "Persuasão", "Medicina", "Percepção" },
        };
        static Build LYRA() => new Build
        {
            race = "elfo", cls = "mago", gender = "f", name = "Lyra", @base = new Dictionary<string, int> { ["FOR"] = 8, ["DES"] = 14, ["CON"] = 14, ["INT"] = 15, ["SAB"] = 12, ["CAR"] = 10 },
            look = new Look { skin = 0, hair = 5, style = "long", beard = null, eyes = 2, outfit = 3, cape = 0 }, equip = new Equip { main = "cajado", ranged = null, armor = "robe", shield = null },
            extraSkills = new List<string> { "História", "Natureza", "Intuição" }, extraAbilities = new List<string> { "heal" },
        };
        static void SpawnCompanions()
        {
            Unit Mk(Build b, string key, int maxHp, int hpPerLevel, int slotBonus)
            {
                var spec = Rules.SpecOf(b);
                var u = MakeUnit(spec, x => { Rules.HeroDef(x, b, key); x.tx = 14; x.ty = 39; x.maxHp = maxHp; x.hpPerLevel = hpPerLevel; x.slotBonus = slotBonus; });
                u.spec = spec;
                u.hp = u.maxHp; u.slots = u.maxSlots;
                return u;
            }
            // veterans of the road: more hit points than a fresh level-1 sheet, and Lyra has a spell slot more
            G.kael = Mk(KAEL(), "kael", 26, 8, 0);
            G.lyra = Mk(LYRA(), "lyra", 16, 5, 1);
            Regear(G.lyra);
            G.lyra.slots = G.lyra.maxSlots;
        }

        /// <summary>Recompute a party member's numbers and sprite from their gear (after equipping, or a level-up).</summary>
        public static void Regear(Unit u, bool look = true)
        {
            var keep = u.abilities.Where(k => k == "lampejo").ToList();
            int slots = u.slots;
            Rules.CombatStats(u, u.build, u.equip, null, u.bonusAtk);
            u.abilities.AddRange(keep);
            if (u.maxSlots != 0) { u.maxSlots += u.slotBonus; u.slots = Math.Min(slots, u.maxSlots); }
            if (look) { u.spec = Rules.SpecOf(u.build, u.equip); u.ch = Chars.BuildCharacter(u.spec); u.portrait = Chars.Portrait(u.ch); }
        }

        /// <summary>Put a bag item on (or take a slot off with item = null). Returns an error message, or null.</summary>
        public static string Equip(Unit u, string slot, Item item)
        {
            if (G.mode == "combat") return "Não dá para trocar de equipamento no meio do combate.";
            if (item != null)
            {
                var C = u.build.cls;
                if (item.gear == "weapon") slot = Items.WEAPONS[item.key].Has("dist") ? "ranged" : "main";
                else if (item.gear == "armor")
                {
                    slot = "armor";
                    if (!Rules.ArmorAllowed(C, item.key)) { var cat = Items.ARMORS[item.key].cat; return $"{u.name} não sabe usar armadura {(cat == "pesada" ? "pesada" : cat == "media" ? "média" : "leve")}."; }
                }
                else if (item.gear == "shield")
                {
                    slot = "shield";
                    if (!Rules.ShieldAllowed(C)) return $"{u.name} não sabe lutar com escudo.";
                }
            }
            string old = u.equip[slot], empty = slot == "armor" ? "roupas" : slot == "main" ? "punhos" : null;
            if (old != null && old != empty) G.items.Add(Items.GearItem(slot == "main" || slot == "ranged" ? "weapon" : slot, old));
            u.equip[slot] = item != null ? item.key : empty;
            if (item != null) G.items.Remove(item);
            Regear(u);
            Snd.chest();
            ExploreHotbar();
            return null;
        }

        // ---------------------------------------------------------------- the engine, as the story sees it
        class Timer { public float left; public bool pausable; public Action fn; }
        static readonly List<Timer> timers = new List<Timer>();
        /// <summary>Like setTimeout: runs after a delay in real time, paused or not.</summary>
        public static void After(float sec, Action fn) => timers.Add(new Timer { left = sec, fn = fn });
        /// <summary>A wait that stands still while the game is paused, so a turn never plays out behind the menu.</summary>
        public static Task Sleep(int ms) { var tcs = new TaskCompletionSource<bool>(); timers.Add(new Timer { left = ms / 1000f, pausable = true, fn = () => tcs.TrySetResult(true) }); return tcs.Task; }
        public static Task SleepReal(int ms) { var tcs = new TaskCompletionSource<bool>(); timers.Add(new Timer { left = ms / 1000f, fn = () => tcs.TrySetResult(true) }); return tcs.Task; }
        static void TickTimers(float dt)
        {
            var due = new List<Timer>();
            foreach (var t in timers) { if (t.pausable && G.paused) continue; t.left -= dt; if (t.left <= 0) due.Add(t); }
            foreach (var t in due) { timers.Remove(t); try { t.fn(); } catch (Exception e) { Debug.LogException(e); } }
        }

        public static WObj Obj(string id, WorldMap W = null) => (W ?? G.W).objects.FirstOrDefault(o => o.id == id);
        public static void Refresh(WObj o) { o.art = PropArt(o); }
        public static void Place(Unit u, int tx, int ty, int? dir = null) { var c = Combat.TileCenter(tx, ty); u.x = c.x; u.y = c.y; u.path.Clear(); if (dir.HasValue) u.dir = dir.Value; }
        /// <summary>Walk a unit to a tile along a path (resolves on arrival; immediately if there's no path).</summary>
        public static Task Walk(Unit u, int tx, int ty, float speed = 70)
        {
            var s = Combat.TileOf(u);
            var p = PathFind.FindPath((x, y) => G.W.Blocked(x, y) && !(x == tx && y == ty), s.x, s.y, tx, ty);
            if (p == null || p.Count == 0) return Task.CompletedTask;
            u.path = p.Select(q => Combat.TileCenter(q.x, q.y)).ToList();
            u.speed = speed;
            var tcs = new TaskCompletionSource<bool>();
            u.onArrive = () => tcs.TrySetResult(true);
            return tcs.Task;
        }
        public static void Face(Unit u, float tx, float ty) { float dx = tx - u.x, dy = ty - u.y; u.dir = Mathf.Abs(dx) > Mathf.Abs(dy) ? (dx < 0 ? 1 : 2) : dy < 0 ? 3 : 0; }
        public static void Face(Unit u, Unit t) => Face(u, t.x, t.y);
        public static void PartyChanged() { ExploreHotbar(); }
        public static void ResetTrail() => trail.Clear();
        public static void Fight(Group group) { G.mode = "explore"; G.camFocus = null; Combat.StartCombat(group); }
        public static void ZoneReset() { zoneNow = ""; }

        // ---------------------------------------------------------------- hooks used by other modules
        public static void GainXp(Unit p, int xp)
        {
            if (p.ai) return; // allies who only fight alongside for a moment
            p.xp += xp;
            while (p.xp >= p.nextXp)
            {
                p.level++; p.maxHp += p.hpPerLevel; p.hp = p.maxHp; p.nextXp = Mathf.RoundToInt(p.nextXp * 2.6f);
                if (p.role == "martial") p.bonusAtk++;
                if (p.maxSlots != 0) p.slotBonus++;
                if (p.build != null) Regear(p, false);
                else if (p.role == "martial") { p.atk++; if (p.bow != null) p.bow.atk++; }
                p.slots = p.maxSlots;
                var pp = p;
                After(1.8f, () => { Hud.Toast($"{pp.name} alcançou o nível {pp.level}!"); Snd.levelUp(); G.fx.Spawn(FxKind.Bloom, pp.x, pp.y + 2, PAL.holy); });
            }
        }
        public static void OnCombatStart()
        {
            Hud.Tooltip(null);
            checkpoint = Snapshot();
            Tutorial.Hint("combat");
        }
        public static void OnCombatEnd(Group group)
        {
            G.focus = null;
            checkpoint = null;
            Story.OnCombatEnd(group);
            ExploreHotbar();
        }
        public static void GameOver()
        {
            Snd.PlayMusic(null, 0.6f); Snd.defeat();
            Hud.gameOver = true; Hud.canRetry = checkpoint != null;
        }
        public static bool LampejoCan() => G.hero != null && G.hero.abilities.Contains("lampejo") && !G.hero.restUsed.Contains("lampejo");
        public static void LampejoUse() { G.hero.restUsed.Add("lampejo"); if (G.combat != null) Combat.RefreshCombatHotbar(); }

        // ---------------------------------------------------------------- try a lost fight again
        class UnitSnap { public Unit u; public float x, y; public int hp, maxHp, slots, maxSlots, level, xp, nextXp, atk, dir, skip, bonusAtk, slotBonus; public bool gone, forgotten, ai, raging, smiteNext, inspired, mocked; public float? alpha; public Unit marked; public HashSet<string> restUsed; public List<string> abilities; public Bow bow; }
        class Checkpoint { public Group group; public List<Unit> party, followers, enemies, npcs; public List<UnitSnap> units; public Flags f; public List<Item> items; public List<Memory> memories; public Dictionary<string, int> approval; public int potions, gold; }
        static Checkpoint checkpoint;
        static Checkpoint Snapshot()
        {
            var units = G.party.Concat(G.enemies).Concat(G.npcs).Concat(G.followers).Distinct().ToList();
            return new Checkpoint
            {
                group = G.combat.group,
                party = G.party.ToList(), followers = G.followers.ToList(), enemies = G.enemies.ToList(), npcs = G.npcs.ToList(),
                units = units.Select(u => new UnitSnap { u = u, x = u.x, y = u.y, hp = u.hp, maxHp = u.maxHp, slots = u.slots, maxSlots = u.maxSlots, level = u.level, xp = u.xp, nextXp = u.nextXp, atk = u.atk, dir = u.dir,
                    gone = u.gone, skip = u.skip, forgotten = u.forgotten, ai = u.ai, alpha = u.alpha, bonusAtk = u.bonusAtk, slotBonus = u.slotBonus, raging = u.raging, smiteNext = u.smiteNext, inspired = u.inspired, mocked = u.mocked,
                    marked = u.marked, restUsed = new HashSet<string>(u.restUsed), abilities = u.abilities.ToList(), bow = u.bow?.Clone() }).ToList(),
                f = G.f.Clone(), items = G.items.Select(i => i.Clone()).ToList(), memories = G.memories.Select(m => m.Clone()).ToList(), approval = new Dictionary<string, int>(G.approval),
                potions = G.potions, gold = G.gold,
            };
        }
        public static void Retry()
        {
            var cp = checkpoint;
            if (cp == null) { Restart(); return; }
            G.party = cp.party; G.followers = cp.followers;
            G.W.enemies.Clear(); G.W.enemies.AddRange(cp.enemies); G.enemies = G.W.enemies;
            G.W.npcs.Clear(); G.W.npcs.AddRange(cp.npcs); G.npcs = G.W.npcs;
            foreach (var s in cp.units)
            {
                var u = s.u;
                u.x = s.x; u.y = s.y; u.hp = s.hp; u.maxHp = s.maxHp; u.slots = s.slots; u.maxSlots = s.maxSlots; u.level = s.level; u.xp = s.xp; u.nextXp = s.nextXp; u.atk = s.atk; u.dir = s.dir;
                u.gone = s.gone; u.skip = s.skip; u.forgotten = s.forgotten; u.ai = s.ai; u.alpha = s.alpha; u.bonusAtk = s.bonusAtk; u.slotBonus = s.slotBonus; u.raging = s.raging; u.smiteNext = s.smiteNext;
                u.inspired = s.inspired; u.mocked = s.mocked; u.marked = s.marked; u.restUsed = s.restUsed; u.abilities = s.abilities; u.bow = s.bow;
                u.path.Clear(); u.lunge = null; u.knock = null; u.pose = "idle";
            }
            G.f.CopyFrom(cp.f);
            G.items.Clear(); G.items.AddRange(cp.items);
            G.memories.Clear(); G.memories.AddRange(cp.memories);
            G.approval = cp.approval;
            G.potions = cp.potions; G.gold = cp.gold; G.combat = null; G.mode = "explore"; G.advNext = false;
            Story.OnRetry();
            PartyChanged();
            Combat.StartCombat(cp.group);
        }

        /// <summary>Back to the title, as if the page had been reloaded.</summary>
        public static void Restart()
        {
            timers.Clear(); maps.Clear(); art.Clear(); grassArt.Clear();
            G.mode = "title"; G.paused = false; G.time = 0; G.W = null;
            G.party = new List<Unit>(); G.enemies = new List<Unit>(); G.npcs = new List<Unit>(); G.followers = new List<Unit>(); G.chests = new List<Chest>(); G.groups = new Dictionary<string, Group>();
            G.leader = 0; G.potions = 1; G.gold = 12; G.f.Clear(); G.items = new List<Item>(); G.memories = new List<Memory>(); G.approval = new Dictionary<string, int>();
            G.camFocus = null; G.hintsSeen = new HashSet<string>(); G.combat = null; G.shake = G.hitstop = 0; G.focus = null; G.hero = G.mate = null;
            G.speedCap = null; G.ClearMusicOverride(); G.tint = null; G.advNext = false; G.followLeader = false; G.origin = new Origin();
            Hud.gameOver = false; Hud.fadeA = Hud.fadeTo = 0; Hud.Cine(""); Hud.endRows = null; Hud.endMems = null;
            checkpoint = null; trail.Clear(); pending = null;
            Story.Reset();
            Snd.PlayMusic(null, 1);
            inst.StartCoroutine(inst.BootRoutine());
        }

        public static void SelectLeader(int i)
        {
            if (G.mode != "explore" || i >= G.party.Count || G.party[i].hp <= 0 || G.party[i].ai) return;
            G.leader = i;
            trail.Clear();
            ExploreHotbar();
        }

        public static void ExploreHotbar()
        {
            if (G.mode == "combat" || G.party.Count == 0) return;
            var u = G.Lead;
            Hud.BuildHotbar(new List<Hud.Slot> {
                new Hud.Slot { icon = "potion", name = "Poção de Cura", desc = $"Recupera 2d4+2 PV de {u.name}. Você tem {G.potions}.", count = G.potions, off = G.potions <= 0 || u.hp >= u.maxHp,
                    use = () => { G.potions--; int r = 2 + U.RollDie(4) + U.RollDie(4); u.hp = Math.Min(u.maxHp, u.hp + r); Hud.Floater(u.x, u.y - 34, "+" + r, "heal"); G.fx.Spawn(FxKind.Bloom, u.x, u.y + 2); ExploreHotbar(); } },
                new Hud.Slot { icon = "swap", name = "Trocar líder", desc = "Controla o outro personagem (Tab).", off = G.party.Count < 2, use = () => SelectLeader((G.leader + 1) % G.party.Count) },
                new Hud.Slot { icon = "bag", name = "Bolsa", desc = "Itens e cartas (I).", use = () => Journal.Toggle("bag") },
                new Hud.Slot { icon = "book", name = "Diário", desc = "Missões e lembranças (J).", use = () => Journal.Toggle("quests") },
            });
        }

        // ---------------------------------------------------------------- explore: movement and interaction
        static readonly List<Vector3> trail = new List<Vector3>();
        public class Interactable { public float x, y, r = 16, h = 34, reach = 52; public float? reachClick; public string name; public Action act; }
        static Interactable pending; // something to interact with on arrival

        static bool WalkTo(Unit u, float wx, float wy)
        {
            var s = Combat.TileOf(u);
            int gx = Mathf.FloorToInt(wx / TILE), gy = Mathf.FloorToInt((wy - 1) / TILE);
            if (G.W.Blocked(gx, gy))
            {
                (int x, int y, float d)? best = null;
                for (int dy = -1; dy <= 1; dy++) for (int dx = -1; dx <= 1; dx++)
                    {
                        if (G.W.Blocked(gx + dx, gy + dy)) continue;
                        float d = U.Dist(gx + dx, gy + dy, s.x, s.y);
                        if (best == null || d < best.Value.d) best = (gx + dx, gy + dy, d);
                    }
                if (best == null) return false;
                gx = best.Value.x; gy = best.Value.y;
            }
            var p = PathFind.FindPath((x, y) => G.W.Blocked(x, y), s.x, s.y, gx, gy);
            if (p == null) return false;
            u.path = p.Select(q => Combat.TileCenter(q.x, q.y)).ToList();
            if (u.path.Count > 0 && Mathf.FloorToInt(wx / TILE) == gx && Mathf.FloorToInt((wy - 1) / TILE) == gy && !G.W.Blocked(gx, gy)) u.path[u.path.Count - 1] = new Vector2(wx, wy);
            u.speed = Mathf.Min(90, G.speedCap ?? 90);
            return true;
        }

        static List<Interactable> Interactables()
        {
            var list = new List<Interactable>();
            foreach (var n in G.npcs) if (!n.gone && n.talk != null) { var nn = n; list.Add(new Interactable { x = n.x, y = n.y, name = n.label ?? n.name, r = 14, act = () => Talk(nn) }); }
            foreach (var c in G.chests) if (!c.open) { var cc = c; list.Add(new Interactable { x = c.x, y = c.y, name = c.name, r = 14, act = () => OpenChest(cc) }); }
            foreach (var o in G.W.objects) if (o.kind == "campfire" && !o.goblin && !o.@out) list.Add(new Interactable { x = o.x, y = o.y, name = "Fogueira (descansar)", r = 16, act = Rest });
            list.AddRange(Story.Interactables());
            return list;
        }
        static Interactable UnderMouse()
        {
            float wx = G.mwx, wy = G.mwy;
            return Interactables().FirstOrDefault(i => Mathf.Abs(wx - i.x) < i.r && wy < i.y + 4 && wy > i.y - i.h);
        }
        static void Talk(Unit n)
        {
            var l = G.Lead;
            if (!n.@fixed) n.dir = Mathf.Abs(l.x - n.x) > Mathf.Abs(l.y - n.y) ? (l.x < n.x ? 1 : 2) : l.y < n.y ? 3 : 0;
            var t = n.talk();
            if (t != null) Dialogue.OpenDialogue(n, t);
        }
        static void OpenChest(Chest c)
        {
            c.open = true;
            G.potions += c.potions; G.gold += c.gold;
            G.fx.Spawn(FxKind.HitSpark, c.x, c.y - 12, PAL.gold);
            Snd.chest();
            var got = c.items;
            Hud.Toast($"{c.name}: +{c.potions} poção{(c.gold != 0 ? $", +{c.gold} ouro" : "")}{(got.Count > 0 ? ", " + string.Join(", ", got.Select(i => i.name)) : "")}", 3600);
            foreach (var it in got) Story.GiveItem(it);
            if (got.Any(i => i.gear != null)) Tutorial.Hint("gear");
            c.onOpen?.Invoke();
            ExploreHotbar();
        }
        static void Rest()
        {
            var l = G.Lead;
            if (G.enemies.Any(e => e.hp > 0 && !e.gone && !e.passive && !GroupPassive(e) && U.Dist(e.x, e.y, l.x, l.y) < 400)) { Hud.Toast("Não dá pra descansar com inimigos por perto."); return; }
            foreach (var p in G.party) { p.hp = p.maxHp; p.slots = p.maxSlots; p.restUsed.Clear(); G.fx.Spawn(FxKind.Bloom, p.x, p.y + 2, PAL.holy); }
            Hud.Toast("Descanso longo: vida, magias e habilidades restauradas.");
            Snd.rest();
            ExploreHotbar();
            Story.OnRest();
        }
        static bool GroupPassive(Unit e) => e.group != null && G.groups.TryGetValue(e.group, out var g) && g.passive && false;

        static Interactable NearestInteractable()
        {
            var l = G.Lead; Interactable best = null; float bd = 1e9f;
            foreach (var i in Interactables()) { float d = U.Dist(i.x, i.y, l.x, l.y); if (d < i.reach && d < bd) { best = i; bd = d; } }
            return best;
        }

        static void OnClick()
        {
            if (G.mode == "combat") { Combat.CombatClick(G.mtx, G.mty); return; }
            if (G.mode != "explore") return;
            var l = G.Lead;
            var it = UnderMouse();
            if (it != null)
            {
                if (U.Dist(it.x, it.y, l.x, l.y) < (it.reachClick ?? 48)) { it.act(); return; }
                pending = it;
                WalkTo(l, it.x, it.y + 8);
                return;
            }
            pending = null;
            if (WalkTo(l, G.mwx, G.mwy)) clickMark = (G.mwx, G.mwy, 0.5f);
        }
        static (float x, float y, float t)? clickMark;

        // ---------------------------------------------------------------- input (read in OnGUI, so it works with any input backend)
        static readonly HashSet<string> keys = new HashSet<string>();
        static string KeyName(KeyCode k)
        {
            if (k >= KeyCode.A && k <= KeyCode.Z) return ((char)('a' + (k - KeyCode.A))).ToString();
            if (k >= KeyCode.Alpha0 && k <= KeyCode.Alpha9) return ((char)('0' + (k - KeyCode.Alpha0))).ToString();
            if (k >= KeyCode.Keypad0 && k <= KeyCode.Keypad9) return ((char)('0' + (k - KeyCode.Keypad0))).ToString();
            switch (k) { case KeyCode.Space: return " "; case KeyCode.Tab: return "tab"; case KeyCode.Escape: return "escape"; case KeyCode.UpArrow: return "arrowup"; case KeyCode.DownArrow: return "arrowdown"; case KeyCode.LeftArrow: return "arrowleft"; case KeyCode.RightArrow: return "arrowright"; }
            return null;
        }
        static void OnKey(string k)
        {
            if (G.mode == "create") return; // typing a name
            if (k == "m" && G.mode != "title") { Snd.ToggleMute(); return; }
            if (G.mode == "title" || G.mode == "over" || G.mode == "end") return;
            if (Journal.open) { if (k == "escape" || k == "i" || k == "j") Journal.Close(); return; }
            if (Dice.open) { if (k == " " || k == "escape") Dice.Click(); return; }
            // Esc first cancels a chosen combat action; otherwise it (or P) opens and closes the menu
            if (k == "escape" && !G.paused && G.combat?.ability != null) { G.combat.ability = null; Combat.RefreshCombatHotbar(); return; }
            if (k == "escape" || k == "p") { SetPaused(!G.paused); return; }
            if (G.paused) return;
            if ((k == "i" || k == "j") && G.mode != "dialogue") { Journal.Toggle(k == "i" ? "bag" : "quests"); return; }
            bool digit = k.Length == 1 && k[0] >= '1' && k[0] <= '9';
            if (G.mode == "dialogue" && digit) Dialogue.Key(k[0] - '0');
            else if (G.mode == "combat")
            {
                if (k == " ") Combat.EndTurn();
                if (digit) { var u = G.combat?.active; if (u != null && u.team == "party" && !u.ai) { var abs = Combat.AbilitiesOf(u); int i = k[0] - '1'; if (i < abs.Count) Combat.SelectAbility(abs[i].key); } }
            }
            else if (G.mode == "explore")
            {
                if (k == "e") NearestInteractable()?.act();
                if (k == "tab" && G.party.Count > 0) SelectLeader((G.leader + 1) % G.party.Count);
                if (digit) Hud.UseSlot(k[0] - '1');
            }
        }

        void Resize()
        {
            int s = Screen.height >= 1000 ? 3 : Screen.height >= 520 ? 2 : 1;
            G.scale = s;
            G.vw = Mathf.CeilToInt(Screen.width / (float)s); G.vh = Mathf.CeilToInt(Screen.height / (float)s);
            if (rt == null || rt.width != G.vw || rt.height != G.vh)
            {
                if (rt != null) { rt.Release(); reflRT.Release(); }
                rt = Gfx.NewTarget(G.vw, G.vh); reflRT = Gfx.NewTarget(G.vw, G.vh);
                vignette = null;
            }
        }

        public static void SetPaused(bool p)
        {
            if (G.mode == "title" || G.mode == "over" || G.mode == "end") p = false;
            G.paused = p;
            keys.Clear();
            Hud.Tooltip(null);
            Snd.click();
        }

        // ---------------------------------------------------------------- update
        static void StepAlongPath(Unit u, float dt)
        {
            if (u.path.Count == 0) { u.moving = false; return; }
            var t = u.path[0];
            float dx = t.x - u.x, dy = t.y - u.y, d = Mathf.Sqrt(dx * dx + dy * dy), s = u.speed * dt;
            if (Mathf.Abs(dx) > 0.5f || Mathf.Abs(dy) > 0.5f) u.dir = Mathf.Abs(dx) > Mathf.Abs(dy) * 1.1f ? (dx < 0 ? 1 : 2) : dy < 0 ? 3 : 0;
            if (d <= s)
            {
                u.x = t.x; u.y = t.y; u.path.RemoveAt(0);
                if (u.path.Count == 0) { u.moving = false; var f = u.onArrive; u.onArrive = null; f?.Invoke(); }
            }
            else { u.x += dx / d * s; u.y += dy / d * s; u.moving = true; }
        }

        static bool CanStand(float x, float y)
        {
            foreach (var (ox, oy) in new[] { (-5, -2), (5, -2), (-5, -8), (5, -8) }) if (G.W.Blocked(Mathf.FloorToInt((x + ox) / TILE), Mathf.FloorToInt((y + oy) / TILE))) return false;
            return true;
        }

        /// <summary>Everyone who isn't the leader walks the leader's trail: the party first, then followers.</summary>
        static void FollowTrail(float dt)
        {
            var l = G.Lead;
            if (trail.Count == 0 || U.Dist(trail[0].x, trail[0].y, l.x, l.y) > 3) { trail.Insert(0, new Vector3(l.x, l.y, l.dir)); if (trail.Count > 200) trail.RemoveAt(trail.Count - 1); }
            var others = G.party.Where(p => p != l && p.hp > 0).Concat(G.followers).ToList();
            for (int i = 0; i < others.Count; i++)
            {
                var p = others[i];
                float want = 22 * (i + 1), acc = 0; Vector3? target = null;
                for (int j = 1; j < trail.Count; j++) { acc += U.Dist(trail[j].x, trail[j].y, trail[j - 1].x, trail[j - 1].y); if (acc >= want) { target = trail[j]; break; } }
                p.path.Clear();
                if (U.Dist(p.x, p.y, l.x, l.y) > 260) { p.x = l.x - 12; p.y = l.y + 4; trail.Clear(); return; }
                if (target == null) { p.moving = false; continue; }
                float dx = target.Value.x - p.x, dy = target.Value.y - p.y, d = Mathf.Sqrt(dx * dx + dy * dy);
                if (d > 1.5f)
                {
                    float s = Mathf.Min(d, Mathf.Max(88, d * 4) * dt);
                    p.x += dx / d * s; p.y += dy / d * s; p.moving = true;
                    p.dir = Mathf.Abs(dx) > Mathf.Abs(dy) ? (dx < 0 ? 1 : 2) : dy < 0 ? 3 : 0;
                }
                else p.moving = false;
            }
        }

        // ---------------------------------------------------------------- audio
        static IEnumerable<WObj> Campfires() => G.W.objects.Where(o => o.kind == "campfire" && !o.@out);
        static string SurfaceAt(float x, float y)
        {
            int t = G.W.TileAt(Mathf.FloorToInt(x / TILE), Mathf.FloorToInt((y - 2) / TILE));
            return t == T.DOCK ? "wood" : t == T.STONE || t == T.MARBLE || t == T.STAIRS ? "stone" : t == T.PATH ? "dirt" : t == T.WATER ? "water" : "grass";
        }
        static void UpdateAudio(float dt)
        {
            Snd.Schedule();
            if (G.mode == "title" || G.mode == "create" || G.party.Count == 0) return;
            var l = G.Lead; bool vale = G.W.id == "vale";
            string zone = vale ? World.ZoneAt(l.x, l.y) : G.W.zone; bool ruins = zone == "Ruínas de Velmoor";
            string track = G.hasMusicOverride ? G.musicOverride : G.mode == "combat" ? "combat" : G.mode == "over" ? null : !vale ? "dream" : ruins ? "ruins" : "meadow";
            Snd.PlayMusic(track, G.mode == "combat" ? 0.5f : 2.5f);
            double w = vale ? World.WaterField(l.x, l.y) : 9;
            float fire = 0; foreach (var o in Campfires()) fire = Mathf.Max(fire, 1 - U.Dist(o.x, o.y, l.x, l.y) / 220);
            Snd.UpdateAmbience(new Snd.Amb
            {
                wind = !vale ? 0.35f : ruins ? 1 : 0.7f, water = Mathf.Clamp01((float)(1 - w / 1.1)), fire = fire,
                birds = !vale || ruins || G.mode == "combat" || G.f.B("escape") ? 0 : 1, ruins = !vale ? 0.8f : ruins ? 1 : 0,
            }, dt, G.time);
            // footsteps: one every ~20 px walked, quieter for everyone but the leader
            foreach (var u in G.party.Concat(G.enemies).Concat(G.followers))
            {
                if (u.hp <= 0) continue;
                float d = u.sx == null ? 0 : U.Dist(u.sx.Value, u.sy.Value, u.x, u.y);
                u.sx = u.x; u.sy = u.y;
                if (d > 30) { u.stepAcc = 0; continue; } // teleport / snap
                u.stepAcc += d;
                if (u.stepAcc > (u.small || u.spec?.small == true ? 15 : 20))
                {
                    u.stepAcc = 0;
                    bool onScreen = u.x > G.cam.x - 20 && u.x < G.cam.x + G.vw + 20 && u.y > G.cam.y - 20 && u.y < G.cam.y + G.vh + 20;
                    if (onScreen) Snd.step(SurfaceAt(u.x, u.y), u == l ? 1 : u.team == "party" ? 0.55 : 0.7);
                }
            }
        }

        static string zoneNow = ""; static float zoneT;
        void Update()
        {
            Resize();
            float dt = Mathf.Min(0.05f, Time.unscaledDeltaTime);
            TickTimers(dt);
            Hud.Update(dt);
            if (!loaded) return;
            if (!G.paused) Step(dt);
            else Snd.Schedule();
        }

        static void Step(float dt)
        {
            G.time += dt;
            if (G.hitstop > 0) { G.hitstop -= dt; return; }
            G.fx.Update(dt);
            if (G.party.Count == 0) return;
            var l = G.Lead;
            if (G.mode == "explore")
            {
                // keyboard walking
                int mx = 0, my = 0;
                if (keys.Contains("w") || keys.Contains("arrowup")) my--;
                if (keys.Contains("s") || keys.Contains("arrowdown")) my++;
                if (keys.Contains("a") || keys.Contains("arrowleft")) mx--;
                if (keys.Contains("d") || keys.Contains("arrowright")) mx++;
                if (mx != 0 || my != 0)
                {
                    l.path.Clear(); pending = null;
                    float k = Mathf.Min(88, G.speedCap ?? 88) * dt / Mathf.Sqrt(mx * mx + my * my);
                    if (CanStand(l.x + mx * k, l.y)) l.x += mx * k;
                    if (CanStand(l.x, l.y + my * k)) l.y += my * k;
                    l.dir = mx != 0 ? (mx < 0 ? 1 : 2) : my < 0 ? 3 : 0;
                    l.moving = true;
                }
                else StepAlongPath(l, dt);
                if (pending != null && l.path.Count == 0) { if (U.Dist(pending.x, pending.y, l.x, l.y) < pending.reach + 8) pending.act(); pending = null; }
                FollowTrail(dt);
                // enemies that aren't held back by the story notice you
                foreach (var kv in G.groups)
                {
                    var group = kv.Value;
                    if (group.passive || !group.Any(e => e.hp > 0)) continue;
                    float r = kv.Key == "ruins" ? 6.5f * TILE : 5 * TILE;
                    if (group.Any(e => e.hp > 0 && !e.gone && G.party.Any(p => p.hp > 0 && U.Dist(p.x, p.y, e.x, e.y) < r)))
                    {
                        foreach (var e in group) e.alert = 0.8f;
                        Combat.StartCombat(group);
                        break;
                    }
                }
                // zone names
                if ((zoneT -= dt) < 0)
                {
                    zoneT = 0.5f;
                    string z = G.W.id == "vale" ? World.ZoneAt(l.x, l.y) : G.W.zone;
                    if (z != zoneNow) { zoneNow = z; Hud.Banner(z); }
                }
            }
            else if (G.mode == "combat") { foreach (var u in G.party.Concat(G.enemies).ToList()) StepAlongPath(u, dt); }
            else if (G.mode == "cutscene" || G.mode == "dialogue")
            {
                foreach (var u in G.party.Concat(G.enemies).Concat(G.followers).ToList()) StepAlongPath(u, dt);
                if (G.followLeader) FollowTrail(dt);
            }
            if (G.mode != "combat") foreach (var n in G.npcs.ToList()) StepAlongPath(n, dt);
            foreach (var u in G.party.Concat(G.enemies).Concat(G.npcs).Concat(G.followers))
            {
                u.animT += dt;
                if (u.poseT > 0) u.poseT -= dt; else u.pose = "idle";
                if (u.flashT > 0) u.flashT -= dt;
                if (u.lunge != null) { u.lunge.t -= dt; if (u.lunge.t <= 0) u.lunge = null; }
                if (u.knock != null) { u.knock.t -= dt; if (u.knock.t <= 0) u.knock = null; }
                if (u.alert > 0) u.alert -= dt;
            }
            Story.Update(dt);
            UpdateAudio(dt);
            // camera
            Vector2 f = G.camFocus != null ? G.camFocus.pos() : G.mode == "combat" && G.focus != null ? new Vector2(G.focus.x, G.focus.y) : new Vector2(l.x, l.y);
            float tx = CamClamp(f.x - G.vw / 2f, G.W.w * TILE, G.vw), ty = CamClamp(f.y - 16 - G.vh / 2f, G.W.h * TILE, G.vh);
            float kk = 1 - Mathf.Exp(-dt * (G.camFocus?.speed ?? (G.mode == "combat" ? 4 : 6)));
            G.cam.x += (tx - G.cam.x) * kk; G.cam.y += (ty - G.cam.y) * kk;
            if (G.shake > 0) G.shake -= dt;
            if (clickMark != null) { var c = clickMark.Value; c.t -= dt; clickMark = c.t <= 0 ? null : c; }
            // mouse in world
            G.mwx = G.cam.x + G.mouseX / G.scale; G.mwy = G.cam.y + G.mouseY / G.scale;
            G.mtx = Mathf.FloorToInt(G.mwx / TILE); G.mty = Mathf.FloorToInt(G.mwy / TILE);
            if (G.mode == "combat" && G.mouseIn && !Hud.overUI) Combat.CombatHover(G.mtx, G.mty);
            else if (G.mode == "explore" && G.mouseIn && !Hud.overUI)
            {
                var it = UnderMouse();
                var en = G.enemies.FirstOrDefault(e => e.hp > 0 && !e.gone && !e.passive && Mathf.Abs(G.mwx - e.x) < 12 && G.mwy < e.y + 3 && G.mwy > e.y - 32);
                Hud.Tooltip(it != null ? $"<b>{it.name}</b>" : en != null ? $"<b>{en.name}</b>\n<color=#ff8a7a>hostil</color>" : null);
            }
            else if (G.mode != "combat" && !Hud.overUI) Hud.Tooltip(null);
        }
        /// <summary>Keep the camera inside the map; a map smaller than the screen sits in the middle.</summary>
        static float CamClamp(float v, float size, float view) => size <= view ? (size - view) / 2 : Mathf.Clamp(v, 0, size - view);

        // ---------------------------------------------------------------- GUI and input
        void OnGUI()
        {
            if (Hud.body == null) Hud.InitFonts();
            var e = Event.current;
            // the low-resolution frame, scaled up with hard pixels, under the UI
            if (e.type == EventType.Repaint && rt != null) GUI.DrawTexture(new Rect(0, 0, rt.width * G.scale, rt.height * G.scale), rt, ScaleMode.StretchToFill, false);
            if (e.isMouse || e.type == EventType.Repaint) { G.mouseX = e.mousePosition.x; G.mouseY = e.mousePosition.y; G.mouseIn = true; }
            if (e.type == EventType.KeyUp) { var kn = KeyName(e.keyCode); if (kn != null) keys.Remove(kn); }
            Hud.Draw();
            if (e.type == EventType.KeyDown && e.keyCode != KeyCode.None)
            {
                var kn = KeyName(e.keyCode);
                if (kn != null) { if (!G.paused && !Dialogue.Open && G.mode != "create") keys.Add(kn); OnKey(kn); e.Use(); }
            }
            if (e.type == EventType.MouseDown && loaded && !G.paused && !Hud.overUI)
            {
                G.mwx = G.cam.x + G.mouseX / G.scale; G.mwy = G.cam.y + G.mouseY / G.scale;
                G.mtx = Mathf.FloorToInt(G.mwx / TILE); G.mty = Mathf.FloorToInt(G.mwy / TILE);
                if (e.button == 0) OnClick();
                if (e.button == 1 && G.combat != null) { G.combat.ability = null; Combat.RefreshCombatHotbar(); }
                e.Use();
            }
        }

        // ---------------------------------------------------------------- draw
        void OnPostRender()
        {
            if (rt == null) return;
            try
            {
                if (loaded && G.W != null) DrawScene();
                else { Gfx.Begin(rt, new Color(11 / 255f, 10 / 255f, 16 / 255f, 1)); Gfx.End(); }
            }
            catch (Exception ex) { Gfx.End(); Debug.LogException(ex); }
        }

        /// <summary>Weapons are drawn only by those fighting right now; everyone else walks with theirs put away.</summary>
        static CharSheet SheetOf(Unit u) => u.ch.sheathed != null && !(G.combat != null && G.combat.order.Contains(u)) ? u.ch.sheathed : u.ch;

        static void DrawUnit(Unit u, float cx, float cy)
        {
            if (u.gone || u.hidden) return;
            bool down = u.hp <= 0 && u.team == "party";
            float ox = 0, oy = u.@float != 0 ? Mathf.Round(Mathf.Sin(G.time * 1.6f) * 2) - u.@float : 0;
            if (u.lunge != null) { float k = Mathf.Sin(u.lunge.t / 0.25f * Mathf.PI); ox += u.lunge.x * k; oy += u.lunge.y * k; }
            if (u.knock != null) { float k = u.knock.t / 0.2f; ox += u.knock.x * k; oy += u.knock.y * k; }
            float x = Mathf.Round(u.x + ox - cx), y = Mathf.Round(u.y + oy - cy);
            int fi = 4;
            if (u.pose == "attack" && u.poseT > 0) fi = 5;
            else if (u.pose == "cast" && u.poseT > 0) fi = 6;
            else if (u.gesture) fi = (int)(u.animT * 0.9f) % 2 != 0 ? 6 : 4;
            else if (u.moving) fi = (int)(u.animT * 8) % 4;
            var set = SheetOf(u);
            var img = u.flashT > 0 ? set.flash[u.dir][fi] : set.frames[u.dir][fi];
            float a = u.alpha ?? 1;
            if (down) { Gfx.DrawRotated90(img, x, y - 6 - 4, new Color(1, 1, 1, 0.6f)); return; }
            var tint = new Color(1, 1, 1, a);
            // idle breathing: a 1px bob every so often
            bool breathe = !u.moving && fi == 4 && (int)(u.animT * 1.6f) % 2 == 1;
            if (breathe)
            {
                Gfx.Draw(img, 0, 0, Chars.SW, 22, x - 13, y - 34 + 1, Chars.SW, 22, tint);
                Gfx.Draw(img, 0, 22, Chars.SW, Chars.SH - 22, x - 13, y - 34 + 22, Chars.SW, Chars.SH - 22, tint);
            }
            else Gfx.Draw(img, x - 13, y - 34, tint);
            if (u.alert > 0 && u.team == "enemy") { var yl = Gfx.Hex("#ffd84a"); Gfx.Fill(x - 1, y - 46, 2, 6, yl); Gfx.Fill(x - 1, y - 38, 2, 2, yl); }
        }

        static void DrawBars(float cx, float cy)
        {
            if (G.mode != "combat") return;
            foreach (var u in G.enemies.Concat(G.party))
            {
                if (u.hp <= 0 || u.gone) continue;
                float x = Mathf.Round(u.x - cx) - 9, y = Mathf.Round(u.y - cy) - 40;
                Gfx.Fill(x - 1, y - 1, 20, 4, Gfx.Hex("#120e16"));
                Gfx.Fill(x, y, 18, 2, Gfx.Hex("#3a1414"));
                Gfx.Fill(x, y, Mathf.Ceil(18f * u.hp / u.maxHp), 2, u.team == "enemy" ? Gfx.Hex("#e0402a") : u.ai ? Gfx.Hex("#e8c06a") : Gfx.Hex("#6ad04a"));
            }
        }

        static void Ring(float x, float y, Color c, float rx = 10)
        {
            for (int a = 0; a < 40; a++)
            {
                float t = a / 40f * Mathf.PI * 2;
                Gfx.Fill(Mathf.Round(x + Mathf.Cos(t) * rx), Mathf.Round(y + Mathf.Sin(t) * rx * 0.45f), 1, 1, c);
            }
        }

        static void DrawCombatGrid(float cx, float cy)
        {
            var C = G.combat;
            if (C == null || C.active == null) return;
            var u = C.active;
            var ut = Combat.TileOf(u);
            int x0 = Mathf.FloorToInt(cx / TILE), y0 = Mathf.FloorToInt(cy / TILE), x1 = x0 + Mathf.CeilToInt(G.vw / (float)TILE) + 1, y1 = y0 + Mathf.CeilToInt(G.vh / (float)TILE) + 1;
            // faint grid
            var gc = new Color(10 / 255f, 20 / 255f, 20 / 255f, 0.13f);
            for (int ty = y0; ty <= y1; ty++) for (int tx = x0; tx <= x1; tx++)
                {
                    if (G.W.Blocked(tx, ty)) continue;
                    float sx = tx * TILE - cx, sy = ty * TILE - cy;
                    Gfx.Fill(Mathf.Round(sx), Mathf.Round(sy), TILE, 1, gc); Gfx.Fill(Mathf.Round(sx), Mathf.Round(sy), 1, TILE, gc);
                }
            if (u.team != "party" || u.ai || C.busy) return;
            var ab = C.ability != null ? Combat.AbilityOf(u, C.ability) : null;
            if (ab != null)
            {
                var fc = ab.kind == "heal" || ab.kind == "potion" ? new Color(120 / 255f, 240 / 255f, 120 / 255f, 0.12f) : new Color(1, 140 / 255f, 60 / 255f, 0.12f);
                for (int ty = ut.y - ab.range; ty <= ut.y + ab.range; ty++) for (int tx = ut.x - ab.range; tx <= ut.x + ab.range; tx++)
                        if (!G.W.Blocked(tx, ty)) Gfx.Fill(Mathf.Round(tx * TILE - cx) + 1, Mathf.Round(ty * TILE - cy) + 1, TILE - 1, TILE - 1, fc);
            }
            else if (u.moveLeft > 0)
            {
                // the reach of this turn's movement: a light fill and a bright border
                var reach = PathFind.Reachable(Combat.BlockedFor(u), ut.x, ut.y, u.moveLeft);
                float pulse = 0.55f + Mathf.Sin(G.time * 3) * 0.15f;
                var fill = new Color(95 / 255f, 208 / 255f, 200 / 255f, 0.07f); var edge = new Color(120 / 255f, 236 / 255f, 224 / 255f, pulse);
                foreach (var k in reach.Keys)
                {
                    int tx = k % MW, ty = k / MW; float sx = Mathf.Round(tx * TILE - cx), sy = Mathf.Round(ty * TILE - cy);
                    Gfx.Fill(sx, sy, TILE, TILE, fill);
                    if (!reach.ContainsKey(k - MW)) Gfx.Fill(sx, sy, TILE, 1, edge);
                    if (!reach.ContainsKey(k + MW)) Gfx.Fill(sx, sy + TILE - 1, TILE, 1, edge);
                    if (!reach.ContainsKey(k - 1)) Gfx.Fill(sx, sy, 1, TILE, edge);
                    if (!reach.ContainsKey(k + 1)) Gfx.Fill(sx + TILE - 1, sy, 1, TILE, edge);
                }
            }
            if (C.preview != null && C.preview.Count > 0)
            {
                var pc = Gfx.Hex("#f4ecdc");
                float px = u.x, py = u.y - 8;
                foreach (var p in C.preview)
                {
                    var w = Combat.TileCenter(p.x, p.y);
                    for (float s = 0; s < 1; s += 0.2f) Gfx.Fill(Mathf.Round(px + (w.x - px) * s - cx), Mathf.Round(py + (w.y - 8 - py) * s - cy), 2, 2, pc);
                    px = w.x; py = w.y - 8;
                }
                var e = C.preview[C.preview.Count - 1];
                Gfx.StrokeRect(Mathf.Round(e.x * TILE - cx) + 1, Mathf.Round(e.y * TILE - cy) + 1, TILE - 2, TILE - 2, Gfx.Hex("#e8c06a"));
            }
            // hovered tile
            int mx = G.mtx, my = G.mty;
            if (G.mouseIn && !G.W.Blocked(mx, my)) Gfx.StrokeRect(Mathf.Round(mx * TILE - cx), Mathf.Round(my * TILE - cy), TILE, TILE, new Color(244 / 255f, 236 / 255f, 220 / 255f, 0.5f));
        }

        /// <summary>
        /// Draw a prop with its top-left at (x, y). Leafy plants sway: their leaves are drawn in thin horizontal bands, each
        /// slid sideways by the wind at that moment, most at the crown and nothing where the leaves meet the trunk. Each band
        /// lags a little behind the one below, so the motion rolls up the canopy like a wave, and a slow gust front crosses
        /// the valley from the west, so neighbouring trees move alike but not in lockstep.
        /// </summary>
        static void DrawProp(WObj o, float x, float y, float alpha = 1)
        {
            var a = o.art;
            var tint = new Color(1, 1, 1, alpha);
            if (a.leaves == null) { Gfx.Draw(a.c, x, y, tint); return; }
            int top = a.sway.top, bottom = a.sway.bottom; float amp = (float)a.sway.amp, t = G.time, ph = (o.seed % 997) * 0.37f;
            float gust = 0.68f + 0.32f * Mathf.Sin(t * 0.45f - o.x * 0.004f); // never quite still
            float speed = o.kind == "bush" ? 2.2f : o.kind == "pine" ? 1.3f : 1.6f;
            Gfx.Draw(a.trunk, x, y, tint);
            var L = a.leaves; const int B = 2;
            for (int row = 0; row < L.h; row += B)
            {
                if (row >= bottom) { Gfx.Draw(L, 0, row, L.w, L.h - row, x, y + row, L.w, L.h - row, tint); break; }
                float k = Mathf.Min(1, (bottom - row) / (float)(bottom - top));
                float off = Mathf.Round(amp * k * gust * (Mathf.Sin(t * speed + ph - row * 0.035f) + 0.35f * Mathf.Sin(t * speed * 2.3f + ph * 1.7f - row * 0.06f)));
                Gfx.Draw(L, 0, row, L.w, B, x + off, y + row, L.w, B, tint);
            }
        }

        class Item3 { public float y; public WObj o; public Grass g; public Unit u; public Chest c; }

        /// <summary>Mirror images of whatever stands by the water: flipped at the feet, rippling, cut to the water and tinted by it.</summary>
        static void DrawReflections(float cx, float cy, List<Item3> items)
        {
            var W = G.W;
            if (W.waterMask == null) return;
            bool Wet(float x, float y)
            {
                int tx = Mathf.FloorToInt(x / TILE), ty = Mathf.FloorToInt(y / TILE);
                for (int k = 0; k <= 3; k++) for (int dx = -1; dx <= 1; dx++) if (W.TileAt(tx + dx, ty + k) == T.WATER) return true;
                return false;
            }
            bool any = false;
            Gfx.Begin(reflRT, new Color(0, 0, 0, 0));
            foreach (var it in items)
            {
                var u = it.u; var o = it.o;
                if (u == null && o == null) continue;
                float sx = u?.x ?? o.x, sy = u?.y ?? o.y;
                if (!Wet(sx, sy)) continue;
                float fy = Mathf.Round(sy - cy);
                Gfx.flipAxis = fy;
                if (u != null)
                {
                    if (u.hidden || u.gone || (u.hp <= 0 && u.team == "party")) continue;
                    int fi = u.pose == "attack" && u.poseT > 0 ? 5 : u.pose == "cast" && u.poseT > 0 ? 6 : u.moving ? (int)(u.animT * 8) % 4 : 4;
                    Gfx.Draw(SheetOf(u).frames[u.dir][fi], Mathf.Round(u.x - cx - 13), fy - 34, new Color(1, 1, 1, u.alpha ?? 1));
                }
                else
                {
                    if (o.art == null || o.clip != null || o.noReflect || o.hidden) continue;
                    DrawProp(o, Mathf.Round(o.x - cx - o.art.ox), fy - o.art.oy);
                }
                any = true;
            }
            Gfx.flipAxis = null;
            // back to the frame: ripple thin rows sideways, keep only what falls on water, tint it by the water
            Gfx.Begin(rt);
            if (any) Gfx.Reflection(reflRT, W.waterMask.tex, cx, cy, G.vw, G.vh, G.time, new Color(24 / 255f, 96 / 255f, 120 / 255f, 0.45f), 0.5f);
        }

        /// <summary>Soft light: additive radial glows for things that carry it (Lumes, the lantern, the hero's silver mark).</summary>
        static void DrawGlows(float cx, float cy)
        {
            void One(float x, float y, Glow g)
            {
                float sx = x - cx, sy = y - cy, r = g.r * (1 + Mathf.Sin(G.time * 2 + x) * 0.05f);
                if (sx < -r || sy < -r || sx > G.vw + r || sy > G.vh + r) return;
                Glow(sx, sy, r, new Color(g.c.r / 255f, g.c.g / 255f, g.c.b / 255f, g.a));
            }
            foreach (var o in G.W.objects) if (o.glow != null && !o.hidden) One(o.x, o.y - o.glow.h, o.glow);
            foreach (var u in G.party.Concat(G.npcs).Concat(G.followers).Concat(G.enemies)) if (u.glow != null && !u.gone && !u.hidden) One(u.x, u.y - u.glow.h, u.glow);
        }

        /// <summary>The Bruma: a soft pearly fog from the story's fog field, rendered at a quarter resolution.</summary>
        static void DrawFog(float cx, float cy)
        {
            if (!Story.HasFog()) return;
            const int C = 4; int w = Mathf.CeilToInt(G.vw / (float)C) + 1, h = Mathf.CeilToInt(G.vh / (float)C) + 1;
            if (fogTex == null || fogTex.width != w || fogTex.height != h)
            {
                fogTex = new Texture2D(w, h, TextureFormat.RGBA32, false) { filterMode = FilterMode.Bilinear, wrapMode = TextureWrapMode.Clamp };
                fogPx = new Color32[w * h];
            }
            float t = G.time; int ox = Mathf.FloorToInt(cx / C), oy = Mathf.FloorToInt(cy / C);
            for (int j = 0; j < h; j++)
                for (int i = 0; i < w; i++)
                {
                    float wx = (ox + i) * C, wy = (oy + j) * C;
                    float f = Story.FogAt(wx, wy);
                    if (f > 0.01f) f *= 0.7f + (float)U.VNoise(wx / 70 + t * 0.12, wy / 50 - t * 0.05, 5) * 0.55f;
                    fogPx[(h - 1 - j) * w + i] = new Color32(236, 240, 246, (byte)(Mathf.Clamp01(f) * 235));
                }
            fogTex.SetPixels32(fogPx); fogTex.Apply(false);
            Gfx.Blit(fogTex, ox * C - cx, oy * C - cy, w * C, h * C, Color.white);
        }

        static void DrawScene()
        {
            int vw = G.vw, vh = G.vh;
            float cx = Mathf.Round(G.cam.x), cy = Mathf.Round(G.cam.y);
            if (G.shake > 0) { cx += Mathf.Round((U.Rand() - 0.5f) * 4); cy += Mathf.Round((U.Rand() - 0.5f) * 4); }
            var W = G.W;
            var bg = W.id == "sonho" ? Gfx.Hex("#e8ebf1") : W.id == "relicario" ? Gfx.Hex("#0e1219") : Gfx.Hex("#0b0a10");
            // everything standing, sorted by its feet (gathered first: the reflections draw into their own target)
            var items = new List<Item3>();
            bool InView(float x, float y, float m = 120) => x > cx - m && x < cx + vw + m && y > cy - 20 && y < cy + vh + 160;
            foreach (var o in W.objects) if (!o.hidden && InView(o.x, o.y)) items.Add(new Item3 { y = o.y + o.sortY, o = o });
            foreach (var g in W.grass) if (InView(g.x, g.y, 20)) items.Add(new Item3 { y = g.y, g = g });
            foreach (var u in G.party.Concat(G.enemies).Concat(G.npcs).Concat(G.followers)) if (!u.gone && !u.hidden && InView(u.x, u.y)) items.Add(new Item3 { y = u.y + (u.@float != 0 ? 40 : 0), u = u });
            foreach (var c in G.chests) if (InView(c.x, c.y)) items.Add(new Item3 { y = c.y, c = c });
            items = items.OrderBy(i => i.y).ToList(); // stable, like Array.prototype.sort

            Gfx.Begin(rt, bg);
            Gfx.Draw(W.ground, -cx, -cy);

            // water: drifting glints and a breathing shoreline
            float t = G.time;
            foreach (var s in W.sparkles)
            {
                if (s.x < cx - 8 || s.x > cx + vw + 8 || s.y < cy - 4 || s.y > cy + vh + 4) continue;
                float ph = (t * s.sp + s.ph) % 1;
                if (ph > 0.4f) continue;
                float a = Mathf.Sin(ph / 0.4f * Mathf.PI);
                float len = Mathf.Max(1, Mathf.Round(s.len * a));
                var col = s.edge ? new Color(220 / 255f, 1, 240 / 255f, 0.75f * a) : new Color(200 / 255f, 250 / 255f, 240 / 255f, 0.6f * a);
                float x = Mathf.Round(s.x - cx + ph * 6), y = Mathf.Round(s.y - cy);
                Gfx.Fill(x, y, len, 1, col);
                if (len > 3) Gfx.Fill(x + 1, y - 1, len - 2, 1, col);
            }

            // click marker
            if (clickMark != null) { var m = clickMark.Value; Ring(m.x - cx, m.y - cy, new Color(232 / 255f, 192 / 255f, 106 / 255f, m.t * 2), 6 + (0.5f - m.t) * 10); }
            Story.DrawGround(cx, cy);
            DrawCombatGrid(cx, cy);

            DrawReflections(cx, cy, items);
            // shadows first, so nothing's shadow falls on top of a neighbour
            foreach (var it in items)
            {
                int r = it.o != null ? (it.o.clip != null ? 0 : it.o.art?.shadow ?? 0) : it.u != null ? (it.u.@float != 0 || it.u.ghost ? 0 : it.u.small || it.u.spec?.small == true ? 7 : 9) : it.c != null ? 12 : 0;
                if (r == 0) continue;
                float x = it.o?.x ?? it.u?.x ?? it.c.x, y = it.o?.y ?? it.u?.y ?? it.c.y;
                var s = ShadowOf(r);
                Gfx.Draw(s, Mathf.Round(x - cx - s.w / 2f), Mathf.Round(y - cy - s.h / 2f - (it.o != null ? 1 : 0)));
            }
            var l = G.Lead;
            // active / hover rings
            if (G.mode == "combat" && G.combat?.active != null) Ring(G.combat.active.x - cx, G.combat.active.y - cy - 1, G.combat.active.team == "party" ? Gfx.Hex("#e8c06a") : Gfx.Hex("#ff5a4a"), 11);
            else if (G.mode == "explore" && l != null) Ring(l.x - cx, l.y - cy - 1, new Color(232 / 255f, 192 / 255f, 106 / 255f, 0.55f), 9);
            foreach (var it in items)
            {
                if (it.u != null) { DrawUnit(it.u, cx, cy); continue; }
                if (it.c != null) { var a = chestArt[it.c.open ? 1 : 0]; Gfx.Draw(a.c, Mathf.Round(it.c.x - cx - a.ox), Mathf.Round(it.c.y - cy - a.oy)); continue; }
                if (it.g != null)
                {
                    var ga = grassArt[it.g.v];
                    int f = (int)((t * 1.6f + it.g.ph) % 4);
                    foreach (var p in G.party) if (Mathf.Abs(p.x - it.g.x) < 9 && Mathf.Abs(p.y - it.g.y) < 6) f = p.x < it.g.x ? 1 : 3;
                    Gfx.Draw(ga.frames[f], Mathf.Round(it.g.x - cx - ga.ox), Mathf.Round(it.g.y - cy - ga.oy));
                    continue;
                }
                var o = it.o; var art0 = o.art;
                if (art0 == null) continue;
                float ox = Mathf.Round(o.x - cx - art0.ox), oy = Mathf.Round(o.y - cy - art0.oy);
                float alpha = o.alpha ?? 1;
                if (o.clip != null)
                {
                    // dissolving from the bottom up, like wet paper
                    float keep = Mathf.Max(0, Mathf.Round(art0.c.h * (1 - o.clip.Value)));
                    if (keep > 0) Gfx.Draw(art0.c, 0, 0, art0.c.w, keep, ox, oy, art0.c.w, keep, new Color(1, 1, 1, alpha));
                    continue;
                }
                if (art0.canopy != null)
                {
                    // see-through canopy when someone stands behind it
                    float bx = o.x - art0.ox + art0.canopy.x, by = o.y - art0.oy + art0.canopy.y;
                    bool hide = G.party.Concat(G.enemies).Any(u => !u.gone && u.y < o.y - 2 && u.x > bx && u.x < bx + art0.canopy.w && u.y - 20 > by && u.y - 20 < by + art0.canopy.h);
                    if (hide) { DrawProp(o, ox, oy, 0.45f); continue; }
                }
                DrawProp(o, ox, oy, alpha);
            }
            DrawBars(cx, cy);

            // atmosphere: the ruins are darker and misty; the dream is pale; the Relicário is cold
            float ruinK = 0;
            if (W.id == "vale" && l != null)
            {
                ruinK = Mathf.Clamp01(1 - Mathf.Max(0, l.y - 15 * TILE) / (6 * TILE)) * (l.x < 33 * TILE ? 1 : 0.3f);
                if (ruinK > 0.01f) Gfx.Fill(0, 0, vw, vh, new Color(16 / 255f, 20 / 255f, 40 / 255f, 0.32f * ruinK));
            }
            else if (W.id == "sonho") Gfx.Fill(0, 0, vw, vh, new Color(170 / 255f, 180 / 255f, 230 / 255f, 0.16f));
            else if (W.id == "relicario") Gfx.Fill(0, 0, vw, vh, new Color(30 / 255f, 50 / 255f, 90 / 255f, 0.14f));
            if (G.tint != null) Gfx.Fill(0, 0, vw, vh, G.tint.Value);
            G.fx.Draw(cx, cy, vw, vh);
            DrawGlows(cx, cy);
            DrawCritters(cx, cy, ruinK);
            float mk = W.id == "vale" ? 0.08f + ruinK * 0.7f : W.id == "sonho" ? 0.5f : 0.15f;
            Gfx.alpha = mk;
            float mx = -((cx * 1.0f + t * 8) % mist.w) - mist.w, my = -((cy * 1.0f + t * 3) % mist.h) - mist.h;
            for (float y = my; y < vh; y += mist.h) for (float x = mx; x < vw; x += mist.w) Gfx.Draw(mist, Mathf.Round(x), Mathf.Round(y));
            Gfx.alpha = 1;
            DrawFog(cx, cy);
            Story.DrawOver(cx, cy);

            // framing: branches at the bottom corners (outdoors), and a vignette
            if (W.id == "vale")
            {
                Gfx.Draw(fgLeft, Mathf.Round(-30 - (cx * 0.05f) % 10), vh - fgLeft.h + 34);
                // mirrored on the right
                float rx = vw + 24 - (cx * 0.05f) % 10;
                Gfx.Draw(fgRight, 0, 0, fgRight.w, fgRight.h, Mathf.Round(rx), vh - fgRight.h + 40, -fgRight.w, fgRight.h, Color.white);
            }
            if (vignette == null) vignette = MakeVignette(vw, vh);
            Gfx.Draw(vignette, 0, 0);
            Gfx.End();
        }

        static Img MakeVignette(int vw, int vh)
        {
            var d = new byte[vw * vh * 4];
            float r0 = Mathf.Min(vw, vh) * 0.35f, r1 = Mathf.Max(vw, vh) * 0.72f;
            for (int y = 0; y < vh; y++) for (int x = 0; x < vw; x++)
                {
                    float r = Mathf.Sqrt((x - vw / 2f) * (x - vw / 2f) + (y - vh / 2f) * (y - vh / 2f));
                    float k = Mathf.Clamp01((r - r0) / (r1 - r0));
                    int j = (y * vw + x) * 4; d[j] = 8; d[j + 1] = 6; d[j + 2] = 14; d[j + 3] = (byte)(k * 0.55f * 255);
                }
            return Img.From(d, vw, vh);
        }

        static void DrawCritters(float cx, float cy, float ruinK)
        {
            float t = G.time;
            foreach (var c in G.W.critters)
            {
                float a = t * c.sp + c.ph;
                float x = Mathf.Round(c.x + Mathf.Sin(a) * c.r + Mathf.Sin(a * 2.3f) * 6 - cx), y = Mathf.Round(c.y + Mathf.Sin(a * 1.7f) * c.r * 0.5f + Mathf.Cos(a * 3.1f) * 4 - cy - 14);
                if (x < -4 || y < -4 || x > G.vw + 4 || y > G.vh + 4) continue;
                if (c.kind == "bf")
                {
                    if (G.f.B("escape")) continue;
                    bool open = (int)(t * 12 + c.ph) % 2 == 0;
                    Gfx.Fill(x, y + 12, 2, 1, new Color(10 / 255f, 20 / 255f, 10 / 255f, 0.25f));
                    if (open) { Gfx.Fill(x - 2, y - 1, 2, 2, c.c0); Gfx.Fill(x + 1, y - 1, 2, 2, c.c0); Gfx.Fill(x - 2, y - 1, 1, 1, c.c1); Gfx.Fill(x + 2, y - 1, 1, 1, c.c1); }
                    else { Gfx.Fill(x - 1, y - 2, 1, 2, c.c0); Gfx.Fill(x + 1, y - 2, 1, 2, c.c0); }
                    Gfx.Fill(x, y - 1, 1, 2, Gfx.Hex("#1a1020"));
                }
                else
                {
                    bool mote = c.kind == "mote";
                    float b = Mathf.Max(0, Mathf.Sin(t * (mote ? 0.9f : 2.2f) + c.ph * 3)) * (mote ? 0.7f : 0.35f + ruinK * 0.65f);
                    if (b < 0.05f) continue;
                    Gfx.Fill(x - 1, y - 1, 3, 3, mote ? new Color(120 / 255f, 150 / 255f, 220 / 255f, b * 0.3f) : new Color(120 / 255f, 160 / 255f, 40 / 255f, b * 0.35f), Gfx.ADD);
                    Gfx.Fill(x, y, 1, 1, mote ? new Color(220 / 255f, 235 / 255f, 1, b) : new Color(230 / 255f, 1, 150 / 255f, b), Gfx.ADD);
                }
            }
        }
    }
}
