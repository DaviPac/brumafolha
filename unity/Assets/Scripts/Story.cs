// The Prologue, "A Bruma de Brumafolha" (docs/historia.md §6): the dream, the camp, the patrol, Maren, the
// Dente-de-Musgo clan, Tomé, the Relicário and its statues, Sister Cendra, the Echo, the Bruma rising, the boat.
// Everything here is scripted on top of the engine in Game.cs and the dialogue trees. Ported from src/story.js.
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using UnityEngine;

namespace Brumafolha
{
    public class Quest { public string title, desc; public bool side; public List<(string, bool)> objs = new List<(string, bool)>(); public List<string> notes; }

    public static partial class Story
    {
        const int TILE = U.TILE, MW = World.MW;
        static Flags F => G.f;
        static readonly Dictionary<string, Unit> cast = new Dictionary<string, Unit>();
        static Unit Cast(string k) => cast.TryGetValue(k, out var u) ? u : null;
        static Vector2 Tc(int tx, int ty) => new Vector2(tx * TILE + 16, ty * TILE + 26);
        static Vector2Int TileNow(Unit u) => new Vector2Int(Mathf.FloorToInt(u.x / TILE), Mathf.FloorToInt((u.y - 1) / TILE));
        static bool Near(Unit u, float tx, float ty, float r) => U.Dist(u.x, u.y, tx * TILE + 16, ty * TILE + 26) < r * TILE;
        static bool MateIs(string k) => G.mate?.key == k;
        static void Then(Task t, Action a) { async void Go() { try { await t; a(); } catch (Exception e) { Debug.LogException(e); } } Go(); }

        public static void Init() { }
        public static void Reset()
        {
            cast.Clear(); tweens.Clear(); timers.Clear(); sceneDepth = 0; statuePort = null; relicGroup = null; deerT = 0;
            esc = new Esc(); boatRide = new BoatRide(); Chars.SPECS.Remove("tome");
        }

        // ---------------------------------------------------------------- little tools
        class Tween { public float t, sec; public Action<float> fn; public TaskCompletionSource<bool> tcs; }
        static readonly List<Tween> tweens = new List<Tween>();
        static readonly List<(float t, Action fn)> timers = new List<(float, Action)>();
        static Task TweenFor(float sec, Action<float> fn) { var tw = new Tween { sec = sec, fn = fn, tcs = new TaskCompletionSource<bool>() }; tweens.Add(tw); return tw.tcs.Task; }
        static void Later(float sec, Action fn) => timers.Add((sec, fn));

        class AO
        {
            public string label, v, tag, pass, fail; public DCheck check; public Func<bool> @if; public Action<string> @do; public Action<Unit> onPass;
        }
        /// <summary>One question, many answers: resolves with the chosen option's value (or pass/fail for checks).</summary>
        static Task<string> Ask(ISpeaker who, string text, List<AO> opts, DInput input = null)
        {
            var tcs = new TaskCompletionSource<string>();
            string v = null;
            var node = new DNode { who = who, narr = who == null, text = text, input = input };
            foreach (var o in opts)
            {
                var oo = o;
                if (o.check != null) node.options.Add(new DOpt { label = o.label, check = o.check, @if = o.@if, pass = w => { v = oo.pass; oo.onPass?.Invoke(w); }, fail = w => { v = oo.fail; }, passTo = "end", failTo = "end" });
                else node.options.Add(new DOpt { label = o.label, @if = o.@if, tag = o.tag, @do = val => { v = oo.v; oo.@do?.Invoke(val); }, to = "end" });
            }
            var tree = new DTree(); tree.Add("start", node);
            Dialogue.OpenDialogue(who ?? NARR, tree, "start", () => tcs.TrySetResult(v));
            return tcs.Task;
        }
        static readonly Speaker NARR = new Speaker("", null);
        /// <summary>A run of lines, each (speaker or null for narration, text).</summary>
        static Task Lines(params (ISpeaker who, string text)[] seq) => LinesL("Continuar", seq);
        static Task LinesL(string last, params (ISpeaker who, string text)[] seq)
        {
            var tree = new DTree();
            for (int i = 0; i < seq.Length; i++)
            {
                bool end = i == seq.Length - 1;
                tree.Add("n" + i, new DNode { who = seq[i].who, narr = seq[i].who == null, text = seq[i].text, options = { new DOpt { label = end ? last : "Continuar", to = end ? "end" : "n" + (i + 1) } } });
            }
            return Dialogue.Talk(seq[0].who ?? NARR, tree, "n0");
        }
        static Task Say(ISpeaker who, string text, string last = "Continuar") => LinesL(last, (who, text));

        static int sceneDepth;
        /// <summary>Run a scripted moment: no player control until it's done (unless it starts a fight).</summary>
        static async Task Scene(Func<Task> fn)
        {
            sceneDepth++;
            if (G.mode != "combat") G.mode = "cutscene";
            var l = G.Lead; if (l != null) l.path.Clear();
            Hud.Tooltip(null);
            try { await fn(); }
            finally
            {
                sceneDepth--;
                if (sceneDepth == 0 && G.mode == "cutscene") { G.mode = "explore"; G.camFocus = null; Game.ExploreHotbar(); }
            }
        }
        static void Look(float tx, float ty, float speed = 3) { G.camFocus = CamFocus.At(tx * TILE + 16, ty * TILE + 16, speed); }

        static void Reward(int xp, string why)
        {
            foreach (var p in G.party.ToList()) if (!p.ai) Game.GainXp(p, xp);
            Hud.Toast($"{why}  ·  +{xp} XP", 3200);
            Snd.quest();
        }
        public static void GiveItem(Item it) { if (!G.items.Any(i => i.id == it.id)) G.items.Add(it); }
        static bool HasItem(string id) => G.items.Any(i => i.id == id);
        static void TakeItem(string id) { int i = G.items.FindIndex(x => x.id == id); if (i >= 0) G.items.RemoveAt(i); }
        static void Remember(string id, string text, bool origin = false)
        {
            if (G.memories.Any(m => m.id == id)) return;
            G.memories.Add(new Memory { id = id, text = text, origin = origin });
            Hud.Toast($"Nova lembrança: {(text.Length > 46 ? text.Substring(0, 44) + "…" : text)}", 3600);
            Tutorial.Hint("memory");
        }
        static void Approve(string key, int n)
        {
            if (!MateIs(key)) return;
            G.approval[key] = (G.approval.TryGetValue(key, out var v) ? v : 0) + n;
            Hud.Floater(G.mate.x, G.mate.y - 44, n > 0 ? $"{G.mate.name} aprova" : $"{G.mate.name} desaprova", n > 0 ? "heal" : "miss");
        }

        // ---------------------------------------------------------------- items
        static Item LETTER() => new Item { id = "letter", name = "Carta do Contrato", icon = "letter", desc = "Selada com uma pena de sabiá. O lacre tem o desenho de uma torre.",
            read = "<p><i>Ao portador desta:</i></p><p>sob as Ruínas de Velmoor, no vale de Brumafolha, dorme algo que não pode ser esquecido. Traga-o a Vau-de-Cardo, à taverna do Sabiá Cego, e receba trezentas peças.</p><p>Não abra o que encontrar. Não escute o que ele disser.</p><p class='sig'>— L.</p>" };
        static Item NET() => new Item { id = "net", name = "Rede da Maren", icon = "net", desc = "Uma rede de pesca remendada tantas vezes que já é mais remendo do que rede." };
        static Item CHAIR() => new Item { id = "chair", name = "Cadeira do Otávio", icon = "chair", desc = "Uma cadeira de balanço. No encosto, entalhado à faca, com um talho em forma de anzol: \"Para a Maren, do teu Otávio\"." };

        // ---------------------------------------------------------------- the cast, map by map
        public static void Populate(WorldMap W)
        {
            Unit Npc(object spec, string key, string name, int tx, int ty, int dir = 0, Func<DTree> talk = null, bool small = false, bool fixd = false, Action<Unit> more = null)
            {
                Action<Unit> def = x => { x.team = "npc"; x.maxHp = 6; x.ac = 10; x.key = key; x.name = name; x.tx = tx; x.ty = ty; x.dir = dir; x.talk = talk; x.small = small; x.@fixed = fixd; more?.Invoke(x); };
                var u = spec is Spec s ? Game.MakeUnit(s, def) : Game.MakeUnit((string)spec, def);
                W.npcs.Add(u); if (key != null) cast[key] = u; return u;
            }
            if (W.id == "vale")
            {
                Unit Gob(int tx, int ty, string group, string n = null, string spec = "goblin", string key = null)
                {
                    var u = Game.MakeUnit(spec, x => { x.name = n ?? "Goblin"; x.team = "enemy"; x.tx = tx; x.ty = ty; x.maxHp = 7; x.ac = 13; x.atk = 4; x.dmg = "1d6+2"; x.move = 6; x.dex = 2; x.group = group; x.xpValue = 50; x.key = key; x.passive = true; x.small = true; });
                    if (key != null) cast[key] = u;
                    return u;
                }
                var patrol = new Group("patrol", new[] { Gob(21, 21, "patrol"), Gob(23, 22, "patrol", "Goblin batedor"), Gob(22, 20, "patrol", "Fiapo", "fiapo", "fiapo") });
                patrol[0].dir = 2; patrol[1].dir = 1; patrol[2].dir = 0;
                var ruins = new Group("ruins", new[] {
                    Gob(17, 9, "ruins"), Gob(23, 9, "ruins", "Goblin arqueiro"),
                    Game.MakeUnit("shaman", x => { x.key = "avo"; x.name = "Xamã Fumacento"; x.team = "enemy"; x.tx = 20; x.ty = 5; x.maxHp = 10; x.ac = 12; x.atk = 4; x.dmg = "1d4+1"; x.move = 5; x.dex = 1; x.group = "ruins"; x.xpValue = 75; x.small = true;
                        x.ranged = new RangedAtk { range = 8, dmg = "1d8+1", name = "Chama Imunda", pal = PAL.ember }; }),
                    Game.MakeUnit("chief", x => { x.key = "gorza"; x.name = "Gorza, o Chefe"; x.team = "enemy"; x.tx = 21; x.ty = 6; x.maxHp = 24; x.ac = 15; x.atk = 5; x.dmg = "1d10+3"; x.move = 5; x.dex = 0; x.group = "ruins"; x.xpValue = 150; x.boss = true; }),
                });
                ruins[1].ranged = new RangedAtk { range = 7, dmg = "1d6+2", name = "Flecha", pal = PAL.wood };
                cast["avo"] = ruins[2]; cast["gorza"] = ruins[3];
                W.enemies.AddRange(patrol); W.enemies.AddRange(ruins);
                W.groups = new Dictionary<string, Group> { ["patrol"] = patrol, ["ruins"] = ruins };
                patrol.passive = ruins.passive = true;
                // Tomé: a sandy-haired boy in a green smock
                var tome = Chars.SPECS["hero"].Clone();
                tome.cape = null; tome.weapon = "none"; tome.small = true;
                tome.hair = U.Ramp(new[] { 138, 90, 26 }, new[] { 184, 128, 42 }, new[] { 220, 168, 72 }, new[] { 240, 200, 104 });
                tome.tunic = U.Ramp(new[] { 42, 58, 42 }, new[] { 62, 90, 58 }, new[] { 90, 122, 74 }, new[] { 122, 154, 90 });
                Chars.SPECS["tome"] = tome;
                Npc("maren", "maren", "Maren, a pescadora", 36, 26, 0, MarenTree);
                Npc(tome, "tome", "Tomé", 26, 11, 0, TomeTree, true);
                Npc("goblinElder", "elder", "Goblin velha", 14, 5, 0, ElderTalk, true);
                Npc("goblinKid", "kid1", "Criança goblin", 13, 6, 0, KidTalk, true);
                Npc("goblinKid", "kid2", "Criança goblin", 15, 5, 1, KidTalk, true);
                Npc("murta", "murta", "Goblin de arco", 15, 6, 0, MurtaTalk, true);
                W.chests.Add(new Chest { x = 27 * TILE + 16, y = 11 * TILE + 26, potions = 2, gold = 30, name = "Baú dos goblins", items = { Items.GearItem("weapon", "machadinha"), Items.GearItem("armor", "gibao"), Items.GearItem("shield", "escudoOrmun") } });
                W.chests.Add(new Chest { x = 10 * TILE + 16, y = 38 * TILE + 26, potions = 1, gold = 5, name = "Baú de suprimentos", items = { LETTER() }, onOpen = () => Tutorial.Hint("bag") });
            }
            if (W.id == "sonho")
            {
                foreach (var p in W.marks['o']) { Npc("figure", null, "Figura sem rosto", p.x, p.y, 3, null, false, true); W.SetBlock(p.x, p.y, true); }
                var c = W.marks['C'][0];
                Npc("figure", "turner", "Figura sem rosto", c.x, c.y, 3, null, false, true);
                W.SetBlock(c.x, c.y, true);
                var lp = W.marks['L'][0];
                var w = Npc("archivist", "woman", "A mulher da lanterna", lp.x, lp.y, 0, () => { DreamWoman().Forget(); return null; }, false, true);
                w.glow = new Glow { r = 40, c = new Color32(170, 200, 255, 255), a = 0.18f, h = 18 };
                W.SetBlock(lp.x, lp.y, true);
                W.objects.Add(new WObj { kind = "lantern", id = "lantern", x = lp.x * TILE + 28, y = lp.y * TILE + 22, glow = new Glow { r = 40, c = new Color32(200, 225, 255, 255), a = 0.5f, h = 12 }, sortY = 1 });
            }
            if (W.id == "relicario")
            {
                var pp = W.marks['P'][0];
                W.objects.Add(new WObj { kind = "pedestal", id = "pedestal", x = pp.x * TILE + 16, y = pp.y * TILE + 28, glow = new Glow { r = 40, c = new Color32(160, 200, 255, 255), a = 0.28f, h = 40 } });
                for (int i = 0; i < W.marks['S'].Count; i++) { var s = W.marks['S'][i]; W.objects.Add(new WObj { kind = "statue", id = "s" + (i + 1), x = s.x * TILE + 16, y = s.y * TILE + 28, lit = 0 }); }
                var d = W.marks['D'][0];
                W.objects.Add(new WObj { kind = "door", id = "door", x = d.x * TILE, y = d.y * TILE + 31, lit = 0, sortY = -6 });
                W.chests.Add(new Chest { x = 6 * TILE + 16, y = 15 * TILE + 26, potions = 1, gold = 0, name = "Arca de Velmoor", items = { Items.GearItem("weapon", "adagaVelmoor"), Items.GearItem("armor", "mantoBruma") } });
                var h = W.marks['H'][0]; var m = W.marks['M'][0];
                W.objects.Add(new WObj { kind = "relief", id = "reliefHero", who = "hero", x = h.x * TILE + 16, y = h.y * TILE + 30 });
                W.objects.Add(new WObj { kind = "relief", id = "reliefTome", who = "tome", x = m.x * TILE + 16, y = m.y * TILE + 30 });
                var g = Npc("archivist", "ghost", "A Arquivista", pp.x, pp.y - 1, 0, null, false, true, x => { x.ghost = true; x.hidden = true; x.@float = 10; x.alpha = 0; });
                g.glow = new Glow { r = 44, c = new Color32(170, 200, 255, 255), a = 0.12f, h = 30 };
            }
        }

        // ---------------------------------------------------------------- the quest log
        public static List<Quest> Quests(bool all)
        {
            var o = new List<Quest>();
            if (!F.B("awake")) return G.W?.id == "sonho" ? new List<Quest> { new Quest { title = "Um sonho", objs = { ("Siga a avenida até a luz", F.B("dream_done")) } } } : o;
            var ob = new List<(string, bool)>();
            ob.Add(("Siga a trilha ao norte, até as Ruínas de Velmoor", F.B("ruins_entered")));
            if (F.B("ruins_entered")) ob.Add((F.S("clan") == "infiltrated" ? "Lide com o clã goblin (entrou escondido)" : "Lide com o clã goblin das ruínas", F.B("clan")));
            if (F.B("clan") || F.B("tome_met")) ob.Add(("Ache o caminho para baixo das ruínas", F.B("trapdoor_open")));
            if (F.B("trapdoor_open")) ob.Add(("Desça ao Relicário, sob a coluna partida", F.B("relic_entered")));
            if (F.B("relic_entered")) ob.Add(($"Acenda as três Lumes das estátuas ({LitCount()}/3)", F.B("door_open")));
            if (F.B("door_open")) ob.Add(("Descubra o que dorme no coração do Relicário", F.B("echo")));
            if (F.B("echo")) ob.Add(("Fuja do Relicário", F.B("escape")));
            if (F.B("escape")) ob.Add(("Corra até o barco, no cais", F.B("escape_done")));
            var notes = new List<string>();
            if (F.B("heard_smoke")) notes.Add("Os goblins queimam coisas velhas para afastar a névoa. São ladrões ou refugiados?");
            if (F.B("maren_history")) notes.Add("Maren: a aldeia do avô dela acordou um dia sem saber o que foi Velmoor.");
            if (F.B("otavio_found")) notes.Add("Um dos Esvaídos da Ordem era Otávio, o marido de Maren.");
            o.Add(new Quest { title = "O que dorme em Velmoor", objs = all ? ob : Trim(ob), desc = "Um contrato assinado \"L.\": buscar o que dorme sob as Ruínas de Velmoor e levá-lo a Vau-de-Cardo. Trezentas peças de ouro.", notes = notes });
            if (F.B("maren_quest"))
            {
                var m = new List<(string, bool)>();
                m.Add(("Recupere a rede e a cadeira de Maren", F.B("loot_taken")));
                if (F.B("loot_taken")) m.Add(("Devolva a cadeira a Maren", F.B("returned_heirloom")));
                if (F.B("grandson")) m.Add(("Encontre Tomé, o neto de Maren", F.B("tome_met")));
                if (F.B("pact_proposed")) m.Add((F.B("pact_refused") ? "Maren recusou a troca com os goblins" : "Convença Maren a trocar com os goblins", F.B("goblin_pact") || F.B("pact_refused")));
                if (!all && m.All(x => x.Item2)) return o;
                o.Add(new Quest { title = "As redes de Maren", side = true, objs = all ? m : Trim(m), desc = "Os goblins das ruínas roubaram as coisas de Maren, a pescadora do Lago Espelhado." });
            }
            return o;
        }
        static List<(string, bool)> Trim(List<(string, bool)> o) { var open = o.Where(x => !x.Item2).ToList(); return open.Count > 0 ? open : o.Skip(o.Count - 1).ToList(); }

        // ---------------------------------------------------------------- 6.1 the dream
        public static async Task Start()
        {
            await Tutorial.AskTutorial();
            G.mode = "cutscene";
            Game.LoadMap("sonho", 8, 22, 3);
            Game.PartyChanged();
            Hud.Fade(1, 0).Forget();
            Hud.Cine("<p class='small'>Vento. Sinos, muito longe.</p>");
            Snd.bells();
            await Game.Sleep(2600);
            Hud.Cine("");
            await Hud.Fade(0, 2600);
            G.mode = "explore";
            Tutorial.Hint("move");
            Later(9, () => Tutorial.Hint("interact"));
        }

        static async Task DreamWoman()
        {
            if (F.B("dream_woman")) return;
            F.On("dream_woman");
            var w = Cast("woman"); var ARQ = new Speaker("A mulher da lanterna", w.portrait);
            await Scene(async () =>
            {
                Look(8, 3, 2);
                Game.Face(G.Lead, w);
                await Say(ARQ, "Você veio. Eu sabia que viria. Eles todos esqueceram... mas você ainda vai lembrar. Lembre-se de mim.");
                string v;
                do
                {
                    v = await Ask(ARQ, "(Ela estende a lanterna. A luz é fria e não faz sombra.)", new List<AO> {
                        new AO { label = "Quem é você?", v = "who", @if = () => !F.B("dw1") },
                        new AO { label = "Onde estamos?", v = "where", @if = () => !F.B("dw2") },
                        new AO { label = "Tocar a luz.", v = "touch" },
                    });
                    if (v == "who") { F.On("dw1"); await Say(ARQ, "Alguém que você ainda não conhece. Mas vai lembrar. É assim que funciona, com a gente."); }
                    if (v == "where") { F.On("dw2"); await Say(ARQ, "Em Velmoor. No que sobrou dela. Em você."); }
                } while (v != "touch");
                // the towers come apart from the bottom up, like wet paper
                Snd.bells();
                var towers = G.W.objects.Where(o => o.kind == "tower").ToList();
                float ymax = towers.Max(o => o.y);
                var figs = G.npcs.Where(n => n != w).ToList();
                var dissolve = TweenFor(5, k =>
                {
                    foreach (var o in towers) o.clip = Mathf.Clamp01(k * 1.8f - (ymax - o.y) / (24 * TILE) * 0.8f);
                    foreach (var f in figs) f.alpha = 1 - Mathf.Clamp01(k * 2 - (f.y < 10 * TILE ? 0.5f : 0));
                    F.Set("whiteK", Mathf.Clamp01(k * 1.2f - 0.3f));
                });
                await Game.Sleep(1800);
                await Say(ARQ, "Não tenha medo da Bruma. Tenha medo de esquecer.");
                TweenFor(1.5f, k => { w.alpha = 1 - k; Game.Obj("lantern").alpha = 1 - k; }).Forget();
                await dissolve;
                F.On("dream_done");
                Remember("dream", "A cidade branca do sonho, e a mulher de prata que pediu: \"lembre-se de mim\".", false);
                await Hud.Fade(1, 1400, "#fff");
                await Game.Sleep(600);
            });
            await CampWake();
        }

        // ---------------------------------------------------------------- 6.2 the camp
        static async Task CampWake()
        {
            G.mode = "cutscene";
            F.Set("whiteK", 0f);
            G.party = new List<Unit> { G.hero, G.mate };
            Game.LoadMap("vale", 15, 38, 3);
            Game.Place(G.hero, 15, 38, 3);
            Game.Place(G.mate, 14, 37, 1);
            Game.PartyChanged();
            G.camFocus = CamFocus.At(G.hero.x, G.hero.y - 60, 2);
            Hud.Cine("<p class='small'>Fogueira estalando.</p>");
            await Game.Sleep(1200);
            Hud.Cine("");
            await Hud.Fade(0, 2200, "#fff");
            await Game.Sleep(500);
            await Scene(async () =>
            {
                G.camFocus = CamFocus.At(G.hero.x - 16, G.hero.y - 10, 2);
                Game.Face(G.mate, G.hero);
                await Dialogue.Talk(G.mate, MateIs("kael") ? KaelOpening() : LyraOpening());
            });
            F.On("awake");
            Hud.Banner("O que dorme em Velmoor");
            Tutorial.Hint("party"); Tutorial.Hint("quest");
            Later(25, () => Tutorial.Hint("pause"));
        }

        // dialogue builders: a node, an option
        static DNode N(string text, params DOpt[] opts) => new DNode { text = text, options = opts.ToList() };
        static DNode NN(string text, params DOpt[] opts) => new DNode { text = text, narr = true, options = opts.ToList() };
        static DOpt O(string label, string to = "end", Action d = null, Func<bool> iff = null, string tag = null, bool once = false) => new DOpt { label = label, to = to, @do = d == null ? (Action<string>)null : _ => d(), @if = iff, tag = tag, once = once };
        static DOpt Chk(string label, DCheck check, string passTo, string failTo, Action<Unit> pass = null, Action<Unit> fail = null, Func<bool> iff = null, bool once = false) => new DOpt { label = label, check = check, passTo = passTo, failTo = failTo, pass = pass, fail = fail, @if = iff, once = once };
        static DCheck C(int dc, params string[] skills) => new DCheck(dc, skills);

        static DTree KaelOpening()
        {
            var next = O("Continuar", "next");
            var t = new DTree();
            t.Add("start", N("Você falou dormindo de novo. \"Lembre-se de mim.\" Terceira noite seguida. (ele mexe no fogo) Se for uma mulher, tudo bem. Se for um deus, eu volto pra cidade.",
                O("É só um sonho.", "dream"),
                O("É a torre do lacre. A mesma torre.", "seal", () => { F.On("dream_mind", "letter_ask"); }),
                Chk("Você também anda sonhando, não anda?", C(10, "Intuição"), "daughter", "nodaughter", _ => F.On("kael_daughter_hint"))));
            t.Add("dream", N("Sonhos não fazem a gente andar quatro dias até um vale no fim do mundo.", next));
            t.Add("seal", N("A carta? Deixa eu ver esse desenho de novo. Tá no baú, com as poções. (ele aponta o baú com o queixo) Pega lá e me mostra.", next));
            t.Add("daughter", N("...Com a minha filha. Mas esse é um sonho que eu tenho há anos. (ele cutuca a brasa e não diz mais nada sobre isso)", next));
            t.Add("nodaughter", N("Eu? Eu durmo feito pedra. Vantagem de não pensar muito.", next));
            t.Add("next", N("Bom. O contrato fala das ruínas, ao norte, subindo a trilha. Mas tem fumaça de chaminé no lago, a leste. Quem mora num lugar desses sabe o que tem nele. (ele olha para o norte) E essa névoa tá mais grossa do que ontem.", O("Vamos.")));
            return t;
        }
        static DTree LyraOpening()
        {
            var next = O("Continuar", "next");
            var t = new DTree();
            t.Add("start", N("Bom dia. Você murmurou \"lembre-se de mim\" a noite toda. Achei romântico nas primeiras vinte vezes. (ela olha para o norte e para de sorrir) Essa névoa não é névoa.",
                O("Como assim?", "how"),
                Chk("Examinar a névoa.", C(12, "Arcanismo"), "bruma", "nobruma", _ => F.On("lyra_bruma")),
                O("Você já viu isso antes.", "before")));
            t.Add("how", N("Névoa não tem cheiro de biblioteca.", next));
            t.Add("bruma", NN("Você se abaixa. Na borda da névoa, as folhas de grama não terminam: elas simplesmente param de existir, como um desenho apagado com o dedo.", O("Continuar", "bruma2")));
            t.Add("bruma2", N("(séria) Bruma. Tão ao sul? Não devia estar aqui por mais uns dez anos.", next));
            t.Add("nobruma", N("É... névoa. Fria, úmida, cinza. Olhe de novo amanhã. Ou melhor, não olhe.", next));
            t.Add("before", N("Eu já vi quase tudo antes, meu bem. (ela desvia os olhos)", next));
            t.Add("next", N("A carta do contrato está no baú, com as poções. Ruínas ao norte, pela trilha. E há uma casa de pescador no lago, a leste: sempre vale perguntar a quem mora perto de um lugar o que ele esconde.", O("Vamos.")));
            return t;
        }

        public static void ItemRead(Item it)
        {
            if (it.id != "letter" || F.B("letter_read")) return;
            F.On("letter_read");
            Journal.afterClose = () => Scene(async () =>
            {
                if (MateIs("kael")) await Lines((G.mate, F.B("letter_ask") ? "(Kael olha o lacre por um bom tempo.) Uma torre. A mesma do seu sonho, aposto." : "(Kael lê por cima do seu ombro.)"),
                    (G.mate, "\"Não escute o que ele disser.\" Ótimo. Adoro trabalho que vem com instrução assim."));
                else await Lines((G.mate, "(Lyra lê por cima do seu ombro, e para no fim.) \"L.\" ...Hm."), (G.mate, "Nada. Letra bonita. Gente com letra bonita nunca paga em dia."));
            }).Forget();
        }

        static async Task DeerTalk()
        {
            var o = Game.Obj("deer");
            bool again = false;
            await Scene(async () =>
            {
                var v = await Ask(null, "Uma corça, parada na borda do acampamento, de frente para a névoa. Mastiga devagar um capim que não está ali. Os olhos dela são brancos, sem pupila. Ela não foge quando vocês chegam perto.", new List<AO> {
                    new AO { label = "Examinar a corça.", check = C(10, "Medicina", "Natureza"), pass = "ok", fail = "bad", @if = () => !F.B("deer_seen") },
                    new AO { label = "Deixá-la em paz.", v = "leave" },
                    new AO { label = "Dar-lhe um fim rápido.", v = "end" },
                });
                if (v == "ok") { F.On("deer_seen"); await Say(null, "Ela não está doente. O coração bate, o corpo está quente. Ela só... esqueceu como ter medo."); again = true; return; }
                if (v == "bad") { F.On("deer_seen"); await Say(null, "Você não entende o que há com ela. Ela não reage a nada: nem a mão, nem a voz."); return; }
                if (v == "end")
                {
                    F.On("deer_mercy");
                    G.fx.Spawn(FxKind.Poof, o.x, o.y);
                    o.hidden = true;
                    G.W.block[31 * MW + 12] = 0;
                    if (MateIs("kael")) { Approve("kael", 1); await Say(G.mate, "(ele desvia o olhar) ...Rápido. Pelo menos foi rápido."); }
                    else { Approve("lyra", -1); await Say(G.mate, "Ela não estava sofrendo, meu bem. Esse é o pior da Bruma: ninguém sofre."); }
                }
                else
                {
                    F.On("deer_left");
                    await Say(G.mate, MateIs("kael") ? "Bicho nenhum fica parado assim. Nem os burros do regimento." : "...Não toque nela. Por favor.");
                }
            });
            if (again) await DeerTalk();
        }

        public static void OnRest()
        {
            if (G.W.id != "vale" || F.B("rested_story") || !F.B("awake")) return;
            F.On("rested_story");
            Scene(async () =>
            {
                Look(13, 34, 2);
                if (MateIs("kael")) await Lines(
                    (G.mate, "Tinha um velho no meu regimento, o Brás. Toda noite contava a mesma história: a de um ferreiro que forjou uma panela tão boa que a mulher dele nunca mais quis outra."),
                    (G.mate, "Era só isso. Uma panela. A gente ria, mandava ele calar a boca. (pausa) Ele morreu no inverno. Eu ainda lembro da panela."));
                else await Lines(
                    (G.mate, "Em Lethiel contam de uma estrela que caiu no lago e ficou com vergonha de voltar pro céu. Os peixes passaram a noite inteira contando histórias pra ela, até ela rir."),
                    (G.mate, "Quando riu, subiu de novo. É por isso que os peixes não falam: gastaram todas as palavras naquela noite."));
                TweenFor(5, k => F.Set("campFogK", k)).Forget();
                await Say(null, $"Enquanto {(MateIs("kael") ? "ele" : "ela")} fala, a névoa em volta do acampamento recua, devagar, como um bicho que perdeu o interesse.");
                Remember("fire", MateIs("kael") ? "Kael, na fogueira, contando do velho Brás e da panela." : "Lyra, na fogueira, contando da estrela que caiu no lago.");
            }).Forget();
        }

        // ---------------------------------------------------------------- 6.3 the patrol
        static async Task PatrolScene()
        {
            F.On("patrol_met");
            var fiapo = Cast("fiapo");
            await Scene(async () =>
            {
                Look(22, 21, 2.5f);
                Tutorial.Hint("approach");
                var v = await Ask(null, "Três goblins discutem na clareira, em volta de uma pilha de coisas: uma rede de pesca enrolada, potes e uma cadeira de balanço. Ainda não viram vocês.", new List<AO> {
                    new AO { label = "Esgueirar-se até a moita e escutar.", check = C(11, "Furtividade"), pass = "hide", fail = "spotted" },
                    new AO { label = "Sair do mato gritando, armas em punho.", check = C(13, "Intimidação"), pass = "scared", fail = "angry" },
                    new AO { label = "Chegar devagar, de mãos abertas, e falar.", check = C(14, "Persuasão"), pass = "talk", fail = "angry" },
                    new AO { label = "Atacar.", tag = "Combate", v = "fight" },
                    new AO { label = "Voltar por enquanto.", v = "back" },
                });
                if (v == "back") { F.Off("patrol_met"); F.On("patrol_cd"); G.camFocus = null; return; }
                if (v == "spotted") { await Say(null, "Um galho estala sob o seu pé. Três cabeças verdes se viram ao mesmo tempo."); PatrolFight(false); return; }
                if (v == "angry") { await Say(fiapo, "Gente grande! Pega! Pega!"); PatrolFight(false); return; }
                if (v == "fight") { PatrolFight(false); return; }
                if (v == "scared")
                {
                    F.Set("patrol", "scared"); F.On("gorza_warned");
                    await Say(fiapo, "Grande! Grande e feio! Corre, corre!");
                    PatrolLeave(true);
                    Reward(100, "A patrulha fugiu para as ruínas");
                    return;
                }
                if (v == "hide")
                {
                    Game.Walk(G.Lead, 18, 22, 60).Forget();
                    await Game.Sleep(700);
                    F.On("heard_smoke");
                    if (MateIs("lyra")) await Lines((null, "Da moita, dá para ouvir tudo. Os goblins falam rápido, numa língua de estalos e chiados."), (G.mate, "(sussurrando) \"A velha disse: mais coisa com cheiro de gente. A fumaça tá fina.\" ...Foi o que eles disseram. Palavra por palavra."));
                    else await Lines((null, "Da moita, dá para ouvir tudo. Os goblins falam rápido, numa língua de estalos e chiados. Você pega duas palavras que parecem \"fumaça\" e \"velha\"."), (G.mate, "(sussurrando) Não entendi nada. Alguma coisa sobre fumaça. E uma velha. Acho."));
                    var w = await Ask(null, "Os goblins não sabem que vocês estão aqui.", new List<AO> {
                        new AO { label = "Emboscar.", tag = "Rodada surpresa", v = "ambush" },
                        new AO { label = "Esperar que vão embora.", v = "wait" },
                        new AO { label = "Sair da moita e falar com eles.", check = C(12, "Persuasão"), pass = "talk", fail = "angry" },
                    });
                    if (w == "ambush") { PatrolFight(true); return; }
                    if (w == "angry") { await Say(fiapo, "Tava escondido! Escondido é inimigo!"); PatrolFight(false); return; }
                    if (w == "wait")
                    {
                        F.Set("patrol", "sneaked");
                        await Say(null, "Depois de muito discutir, os goblins largam a pilha ali mesmo (\"pra buscar depois\", parece) e sobem a trilha para o norte.");
                        PatrolLeave(false);
                        Reward(100, "Vocês passaram sem ser vistos");
                        return;
                    }
                }
                // talk
                F.Set("patrol", "talked"); F.On("heard_smoke", "fiapo_spared");
                Game.Face(fiapo, G.Lead);
                await Lines(
                    (fiapo, "Não bate! Fiapo fala, Fiapo fala! ...O branco come a gente lá em cima. Come a cabeça. A gente esquece de comer, de andar, de ser goblin."),
                    (fiapo, "A Avó faz fumaça que o branco não gosta. Mas precisa de coisa. Coisa com cheiro de gente. Coisa velha. (ele aponta a pilha)"));
                var w2 = await Ask(fiapo, "Fiapo pode ir?", new List<AO> {
                    new AO { label = "Essas coisas são da Maren, a pescadora.", v = "maren" },
                    new AO { label = "Vão. Digam à Avó que viemos em paz.", v = "go" },
                });
                if (w2 == "maren") await Say(fiapo, "...Fiapo sabe. Fiapo pede desculpa pra cadeira.");
                PatrolLeave(false);
                Reward(100, "A patrulha foi embora sem luta");
            });
        }
        static void PatrolFight(bool surprise)
        {
            var P = G.groups["patrol"];
            if (surprise) foreach (var e in P) { e.skip = 1; e.skipNote = "Surpreso!"; }
            F.Set("patrol", "fought");
            Game.Fight(P);
        }
        static void PatrolLeave(bool running)
        {
            foreach (var e in G.groups["patrol"])
            {
                if (e.hp <= 0) continue;
                e.passive = true;
                var ee = e;
                Then(Game.Walk(e, 21, 14, running ? 120 : 60), () => ee.gone = true);
            }
        }
        static async Task LootTalk()
        {
            var o = Game.Obj("loot");
            if (G.groups["patrol"].Any(e => e.hp > 0 && !e.gone)) { Hud.Toast("Os goblins estão bem em cima da pilha."); return; }
            await Scene(async () =>
            {
                var v = await Ask(null, "A rede enrolada, dois potes de barro e uma cadeira de balanço. No encosto da cadeira, entalhado à faca, com um talho em forma de anzol: \"Para a Maren, do teu Otávio\".", new List<AO> {
                    new AO { label = "Pegar a rede e a cadeira.", v = "take" },
                    new AO { label = "Deixar tudo aí.", v = "leave" },
                });
                if (v != "take") return;
                F.On("loot_taken", "chair_seen");
                GiveItem(NET()); GiveItem(CHAIR()); GiveItem(Items.GearItem("weapon", "lancaGoblin"));
                o.hidden = true;
                G.W.block[21 * MW + 24] = 0;
                Snd.chest();
                Hud.Toast("Rede da Maren, Cadeira do Otávio e uma lança goblin na bolsa", 3200);
            });
        }
    }
}
