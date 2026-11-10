// The Prologue, part four: the Bruma rises, the run to the dock, the boat down the Cardo, the end. Plus what's
// clickable on each map, the per-frame story logic, the fog field the renderer samples, and the story's own drawing.
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using UnityEngine;

namespace Brumafolha
{
    public static partial class Story
    {
        // ---------------------------------------------------------------- 6.7 the Bruma rises
        static readonly Vector2[] ROUTE = new[] { (24f, 12f), (21f, 13f), (22f, 18f), (20f, 24f), (25f, 25.5f), (30f, 26.5f), (34f, 27f), (38f, 26.5f), (40f, 27f) }.Select(p => new Vector2(p.Item1 * TILE + 16, p.Item2 * TILE + 16)).ToArray();
        static readonly Vector2 ORIGIN = new Vector2(24 * TILE + 16, 11 * TILE + 16);
        class Fire { public WObj o; public float d; public bool used; }
        class Esc { public float R = -48, hold; public List<Fire> fires = new List<Fire>(); public bool stop, ending; }
        static Esc esc = new Esc();

        static async Task EscapeStart()
        {
            await Scene(async () =>
            {
                await Hud.Fade(1, 700, "#fff");
                foreach (var u in G.followers) u.hidden = false;
                Game.LoadMap("vale", 24, 12, 0);
                F.On("escape");
                G.speedCap = 70;
                G.SetMusicOverride("combat");
                esc.R = -48; esc.hold = 0; esc.fires = new List<Fire>();
                // the patrol and anyone still out on the trail is gone
                foreach (var e in G.groups["patrol"]) if (!e.gone) e.gone = true;
                if (F.B("goblin_pact"))
                {
                    foreach (var (x, y) in new[] { (21, 14), (21, 19), (22, 25), (30, 26) })
                    {
                        var o = new WObj { kind = "campfire", x = x * TILE + 16, y = y * TILE + 26, goblin = true };
                        o.art = Game.PropArt(o);
                        G.W.objects.Add(o);
                        o.fxe = G.fx.Spawn(FxKind.Campfire, new FxOpts { x = o.x, y = o.y + 2, light = 0.55f, seed = 3 }, keep: true);
                        esc.fires.Add(new Fire { o = o, d = U.Dist(o.x, o.y, ORIGIN.x, ORIGIN.y) });
                    }
                    var g = Cast("gorza");
                    if (g.hp > 0) { g.gone = false; g.team = "npc"; g.passive = true; Game.Place(g, 20, 19, 2); }
                }
                else if (!F.B("smoke_out"))
                {
                    // the clan alive but not allied: Gorza burns everything they have, and they go
                    FireFlare(); Game.After(0.3f, FireFlare); Game.After(0.7f, FireFlare);
                    ClanLeaves(true);
                }
                // Maren's fate is already decided by what she has left to remember
                var m = Cast("maren");
                F.Set("maren_lucid", F.B("goblin_pact") || F.B("returned_heirloom") || !F.B("smoke_out"));
                if (F.B("maren_lucid")) Game.Place(m, 39, 28, 2); else { F.On("maren_forgot"); Game.Place(m, 40, 27, 2); }
                if (F.B("tome_home")) Game.Place(Cast("tome"), 38, 28, 2);
                await Hud.Fade(0, 700);
                Later(1.6f, () => Hud.Banner("A Bruma sobe"));
                Tutorial.Hint("escape");
            });
            if (F.B("smoke_out") && F.S("clan") != "infiltrated")
            {
                Later(3, () => Hud.Floater(14 * TILE, 5 * TILE, "gritos na névoa", "info"));
                Later(5.5f, () => Hud.Floater(14 * TILE, 5 * TILE, "...silêncio", "info"));
            }
        }

        static void UpdateEscape(float dt)
        {
            if (!F.B("escape") || F.B("escape_done") || G.W.id != "vale") return;
            float speed = F.B("goblin_pact") ? 34 : F.B("smoke_out") ? 44 : 40;
            if (esc.hold > 0) esc.hold -= dt;
            else if (!esc.stop) esc.R += speed * dt;
            foreach (var f in esc.fires)
                if (!f.used && esc.R >= f.d - 24)
                {
                    f.used = true; esc.hold = 3;
                    if (f == esc.fires[1]) Hud.Floater(f.o.x, f.o.y - 50, "Vai! Goblin segura!", "crit");
                    var ff = f;
                    Later(3, () => { ff.o.@out = true; ff.o.fxe.keep = false; ff.o.fxe.Stop(); });
                }
            if (G.mode != "explore") return;
            var l = G.Lead;
            // caught: the screen goes white and you find yourself a little further on
            if (U.Dist(l.x, l.y, ORIGIN.x, ORIGIN.y) < esc.R - 4)
            {
                int bi = 0; float bd = 1e9f;
                for (int i = 0; i < ROUTE.Length; i++) { float d = U.Dist(ROUTE[i].x, ROUTE[i].y, l.x, l.y); if (d < bd) { bd = d; bi = i; } }
                var a = ROUTE[Math.Min(ROUTE.Length - 1, bi + 1)];
                float k = Mathf.Min(1, 3 * TILE / Mathf.Max(1, U.Dist(l.x, l.y, a.x, a.y)));
                float nx = l.x + (a.x - l.x) * k, ny = l.y + (a.y - l.y) * k;
                Scene(async () =>
                {
                    await Hud.Fade(0.92f, 160, "#fff");
                    var all = G.party.Concat(G.followers).ToList();
                    for (int i = 0; i < all.Count; i++) { all[i].x = nx - i * 10; all[i].y = ny + (i % 2) * 6; all[i].path.Clear(); }
                    Game.ResetTrail();
                    esc.R = Mathf.Min(esc.R, U.Dist(nx, ny, ORIGIN.x, ORIGIN.y) - 2 * TILE);
                    await Hud.Fade(0, 600);
                }).Forget();
                Hud.Toast("A Bruma quase alcançou vocês.", 1800);
            }
            if (Mathf.FloorToInt(l.x / TILE) >= 36 && Mathf.FloorToInt((l.y - 1) / TILE) >= 25 && Mathf.FloorToInt((l.y - 1) / TILE) <= 28) DockScene().Forget();
        }

        static async Task DockScene()
        {
            if (F.B("dock")) return;
            F.On("dock");
            esc.stop = true;
            var m = Cast("maren"); var t = Cast("tome");
            await Scene(async () =>
            {
                Look(39, 27, 2);
                if (F.B("maren_lucid"))
                {
                    F.On("maren_aboard");
                    await Say(m, "Quarenta anos neste lago. E eu lembro de cada um. Vamos.");
                    if (F.B("tome_with")) await Say(t, "Vó!");
                }
                else
                {
                    await Say(null, "Maren está de pé na ponta do cais, sorrindo, com a névoa nos tornozelos.");
                    await Say(m, "Ah! Viajantes de verdade, graças à Senhora das Marés.");
                    if (F.B("tome_with") || F.B("tome_home")) { await Say(t, "Vó! Vó, sou eu! O Tomé!"); await Say(m, "(gentil) Você está perdido, menino?"); }
                    var v = await Ask(null, "Ela não sabe quem vocês são. A névoa sobe pelas tábuas do cais.", new List<AO> {
                        new AO { label = "Puxá-la para o barco.", check = C(12, "Atletismo"), pass = "ok", fail = "bad" },
                        new AO { label = "Deixá-la.", v = "leave" },
                    });
                    if (v == "ok") { F.On("maren_aboard"); await Say(null, "Você a pega pelo braço e a leva para o barco. Ela vem sem resistir, sem entender, agradecendo a gentileza."); }
                    else if (v == "bad") await Say(null, "Ela se solta, gentil, e volta para a ponta do cais, olhando o lago como quem espera um barco.");
                    else await Say(null, "Vocês a deixam no cais. Ela acena.");
                }
                F.On("escape_done");
                if (F.B("tome_with") || F.B("tome_home")) F.On("tome_alive");
            });
            await BoatEnding();
        }

        // ---------------------------------------------------------------- 6.8 the Mirror Lake, the end
        class BoatRide { public bool on, reflection; public List<Unit> people = new List<Unit>(); }
        static BoatRide boatRide = new BoatRide();
        static async Task BoatEnding()
        {
            G.mode = "cutscene";
            await Hud.Fade(1, 1200);
            var boat = Game.Obj("boat");
            var m = Cast("maren"); var t = Cast("tome");
            boatRide.people = new List<Unit> { G.mate, G.hero };
            if (F.B("tome_alive")) boatRide.people.Add(t);
            if (F.B("maren_aboard")) boatRide.people.Add(m);
            foreach (var u in boatRide.people) u.hidden = true;
            if (!F.B("maren_aboard")) Game.Place(m, 40, 27, 2);
            boatRide.on = true;
            G.speedCap = null;
            G.SetMusicOverride("dream");
            G.tint = new Color(1, 120 / 255f, 50 / 255f, 0.2f); // the sun going down over the lake
            boat.noReflect = true; // its reflection, with one passenger too many, is drawn by DrawOver
            G.camFocus = CamFocus.At(boat.x, boat.y, 2);
            esc.stop = false; esc.ending = true;
            // across the lake to the mouth of the Cardo, then down the river, east, toward Vau-de-Cardo
            var way = new List<Vector2> { new Vector2(boat.x, boat.y), new Vector2(48 * TILE, 29 * TILE + 8), new Vector2(53 * TILE, 28 * TILE + 20) };
            way.AddRange(World.RIVER.Select(p => new Vector2(p.x, p.y + 8)));
            var lens = new List<float>(); for (int i = 1; i < way.Count; i++) lens.Add(Vector2.Distance(way[i - 1], way[i]));
            float total = lens.Sum();
            TweenFor(52, k =>
            {
                float d = total * (k * k * (3 - 2 * k) * 0.5f + k * 0.5f); int i = 0;
                while (i < lens.Count - 1 && d > lens[i]) d -= lens[i++];
                float f = Mathf.Min(1, d / lens[i]); var a = way[i]; var b = way[i + 1];
                boat.x = a.x + (b.x - a.x) * f; boat.y = a.y + (b.y - a.y) * f + Mathf.Sin(k * 40) * 1.5f;
            }).Forget();
            await Hud.Fade(0, 1500);
            await Game.Sleep(2200);
            await Say(null, "O barco desliza pelo lago. Atrás, o vale de Brumafolha some na névoa: primeiro as ruínas...");
            G.camFocus = CamFocus.At(21 * TILE, 9 * TILE, 1.2f);
            await Game.Sleep(3200);
            await Say(null, "...depois o bosque...");
            G.camFocus = CamFocus.At(21 * TILE, 22 * TILE, 1.2f);
            await Game.Sleep(3200);
            await Say(null, "...depois o acampamento onde você acordou. A fogueira é a última coisa que se apaga.");
            G.camFocus = CamFocus.At(World.CAMP.x, World.CAMP.y, 1.2f);
            await Game.Sleep(2600);
            var fire = G.W.objects.First(o => o.kind == "campfire" && !o.goblin);
            fire.@out = true; if (fire.fxe != null) { fire.fxe.keep = false; fire.fxe.Stop(); }
            G.fx.Spawn(FxKind.Poof, fire.x, fire.y);
            F.On("fireGone");
            await Game.Sleep(1800);
            G.camFocus = CamFocus.Follow(() => new Vector2(boat.x, boat.y));
            await Game.Sleep(2200);
            await Say(null, "O lago se estreita e vira rio. A correnteza do Cardo pega o barco e o leva para o leste, para longe da névoa, rumo a Vau-de-Cardo.");
            await Game.Sleep(1200);
            boatRide.reflection = true;
            await Say(null, "Na água, o reflexo mostra a cidade branca. Desta vez, a mulher de prata está no barco, sentada atrás de você. Só no reflexo.");
            if (MateIs("kael")) await Lines((G.mate, "(olhando a sua mão) Eu vi muita coisa que pede memória em troca de ajuda. Nunca vi uma que devolvesse."), (G.mate, "(pausa) Se essa coisa começar a tirar você de você, me avisa. Eu sei como é ficar vazio. Não deixo acontecer com mais ninguém."));
            else await Lines((G.mate, "(evitando os seus olhos) Vau-de-Cardo fica a três dias rio abaixo. Lá tem bibliotecas. Alguém vai saber o que é isso."), (G.mate, "(bem baixo, para si mesma) ...Alguém além de mim."));
            if (F.B("maren_aboard") && F.B("maren_lucid")) await Say(m, F.B("otavio_found") ? "(Maren olha para trás, para a névoa.) ...Vocês viram alguma coisa lá embaixo. Eu sei. Um dia vocês me contam." : "(Maren põe um saquinho de moedas na sua mão.) Cinquenta peças. Não discutam com uma velha num barco.");
            if (F.B("maren_aboard") && F.B("maren_lucid")) G.gold += 50;
            // the Diário opens by itself
            Remember("sunset", "O pôr do sol no Lago Espelhado.");
            var origins = G.memories.Where(x => x.origin).ToList();
            var flick = origins.Count > 0 ? origins[(int)(U.Rand() * origins.Count) % origins.Count] : null;
            if (flick != null) flick.flicker = true;
            await Say(null, "O Diário de Lembranças abre sozinho no seu colo.");
            var tcs = new TaskCompletionSource<bool>();
            Journal.afterClose = () => tcs.TrySetResult(true);
            Journal.Open("memories");
            await tcs.Task;
            if (flick != null) flick.flicker = false;
            await Say(new Speaker("A Arquivista", Cast("ghost").portrait), "(só você ouve) Você tem tanta coisa para lembrar. Deixe que eu cuide do resto.");
            await Hud.Fade(1, 2500);
            G.ClearMusicOverride();
            Hud.Cine("<h1>Brumafolha</h1><h2>Ato I — A Marca de Cardo</h2>", "title");
            await Game.Sleep(5500);
            Hud.Cine("");
            EndScreen();
        }

        static void EndScreen()
        {
            G.mode = "end";
            var clan = new Dictionary<string, string> { ["pact"] = "fez um pacto com o vale. Gorza e Murta desceram ao Relicário por vocês.", ["truce"] = "viveu em trégua com vocês.", ["infiltrated"] = "nunca soube que vocês passaram por ele.", ["scared"] = "deixou o vale, levando a fumaça embora.", ["fight"] = "foi derrotado. Os que fugiram foram para a névoa." };
            string cl = F.S("clan");
            Hud.endRows = new List<(string, string)> {
                ("O clã Dente-de-Musgo", F.B("goblin_pact") ? clan["pact"] : cl != null && clan.TryGetValue(cl, out var c) ? c : "seguiu queimando as suas coisas velhas."),
                ("A Avó Fuligem", F.B("avo_dead") ? "morreu perto do fogo. A neta dela decorou o seu rosto." : F.B("smoke_out") ? "foi embora com o clã." : "ficou nas ruínas, alimentando a fogueira até o fim."),
                ("Maren", F.B("maren_aboard") ? (F.B("maren_lucid") ? "lembra de cada ano no lago, e está no barco." : "está no barco, sem saber quem é.") : "ficou no cais, esperando um barco que não vem."),
                ("Tomé", F.B("tome_alive") ? "está vivo, no barco." : "..."),
                ("Otávio", F.B("otavio_found") ? "foi encontrado entre os Esvaídos da Ordem." : "continua jogando a rede, em algum lugar sob a névoa."),
                ("Irmão Silas", F.B("silas_doubt") ? "duvidou, e foi embora antes da luta." : "lutou ao lado de Cendra."),
                ("O Eco", F.S("echo") == "accepted" ? "foi aceito. Você tem o Lampejo de Velmoor." : "entrou mesmo assim. Ela pediu desculpas."),
            };
            Hud.endMems = G.memories.Where(m => m.origin).Select(m => m.text).ToList();
            Hud.Fade(0, 1200).Forget();
        }

        // ---------------------------------------------------------------- what's clickable, per map
        public static List<Game.Interactable> Interactables()
        {
            var o = new List<Game.Interactable>();
            var W = G.W;
            void At(int tx, int ty, string name, Func<Task> act, float? reach = null, float h = 34)
                => o.Add(new Game.Interactable { x = tx * TILE + 16, y = ty * TILE + 26, name = name, r = 16, h = h, act = () => act().Forget(), reach = reach ?? 52, reachClick = reach });
            void AtObj(WObj ob, string name, float r, Func<Task> act, float h = 34, float? reach = null)
                => o.Add(new Game.Interactable { x = ob.x, y = ob.y, name = name, r = r, h = h, act = () => act().Forget(), reach = reach ?? 52, reachClick = reach });
            if (!F.B("awake") && W.id != "sonho") return o;
            if (W.id == "vale")
            {
                var deer = Game.Obj("deer");
                if (!deer.hidden && !F.B("escape")) AtObj(deer, "Corça", 16, DeerTalk);
                var loot = Game.Obj("loot");
                if (!loot.hidden && !F.B("escape")) AtObj(loot, "Pilha de coisas roubadas", 18, LootTalk);
                if (!F.B("escape"))
                {
                    At(45, 27, "Ponta do píer", PierLook, 40);
                    At(38, 17, "Árvore dos Nomes", NameTree, null, 80);
                    AtObj(Game.Obj("marker"), "Marco de pedra", 14, MarkerStone);
                }
                if (F.B("trapdoor_open") && !F.B("escape")) At(24, 11, "Alçapão (descer)", TrapdoorUse, null, 24);
            }
            if (W.id == "relicario")
            {
                At(9, 28, "Inscrição", () => Say(null, "Letras finas, gravadas na pedra branca: \"Tudo o que existe é lembrado por alguém. O que ninguém lembra, a Bruma leva.\""), 56);
                At(11, 29, F.B("relic_collapse") ? "Escada (fugir!)" : "Escada (voltar ao vale)", StairsUse, null, 20);
                At(5, 21, "Relevo com o seu rosto", () => Say(null, "Um relevo com o seu rosto. Não parecido: o seu. Até a pequena marca que você tem perto do olho, que ninguém nunca nota."), 56);
                At(17, 22, "Relevo com o rosto de um menino", () => Say(null, F.B("tome_with") || F.B("tome_met") ? "O rosto de Tomé, sem tirar nem pôr. Sorrindo." : "O rosto de um menino de uns dez anos, sorrindo."), 56);
                foreach (var (id, tx) in new[] { ("s1", 4), ("s2", 11), ("s3", 18) })
                {
                    var ob = Game.Obj(id); var idd = id;
                    AtObj(ob, ob.lit != 0 ? "Estátua (Lume acesa)" : "Estátua de uma arquivista", 16, () => StatueTalk(idd), 50, 58);
                }
                if (!F.B("door_open")) At(11, 9, "Porta selada", () => Say(null, $"Uma porta de mármore sem maçaneta, com três encaixes redondos. {LitCount()} de 3 brilham."), 60, 56);
            }
            return o;
        }

        // ---------------------------------------------------------------- per-frame story logic
        static float deerT;
        public static void Update(float dt)
        {
            for (int i = tweens.Count - 1; i >= 0; i--)
            {
                var tw = tweens[i];
                tw.t += dt;
                float k = Mathf.Min(1, tw.t / tw.sec);
                tw.fn(k);
                if (k >= 1) { tweens.Remove(tw); tw.tcs.TrySetResult(true); }
            }
            for (int i = timers.Count - 1; i >= 0; i--)
            {
                var (tt, fn) = timers[i];
                tt -= dt;
                if (tt <= 0) { timers.RemoveAt(i); fn(); } else timers[i] = (tt, fn);
            }
            var W = G.W; var l = G.Lead;
            if (l == null) return;
            // a little life
            if (W.id == "vale")
            {
                var deer = Game.Obj("deer");
                if ((deerT += dt) > 0.9f && !deer.hidden) { deerT = 0; deer.frame = deer.frame != 0 ? 0 : 1; Game.Refresh(deer); }
                var m = Cast("maren");
                if (G.mode == "explore" && !F.B("escape") && m != null) m.dir = (int)(G.time / 4) % 3 == 0 ? 2 : 0;
            }
            if (W.id == "relicario" && F.B("relic_collapse"))
            {
                F.Set("relicFog", Mathf.Min(13 * TILE, F.N("relicFog") + dt * 10));
                if (U.Rand() < dt * 0.25f) G.shake = 0.35f;
            }
            if (esc.ending) esc.R += dt * 70; // during the ending the fog swallows the valley, faster
            UpdateEscape(dt);
            if (G.mode != "explore") return;
            var t = TileNow(l); int tx = t.x, ty = t.y;
            if (W.id == "sonho")
            {
                var turner = Cast("turner");
                if (Near(l, 9, 8, 2.6f)) Game.Face(turner, l); else if (l.y < turner.y - 3 * TILE) turner.dir = 0; else turner.dir = 3;
                if (ty <= 5 && !F.B("dream_woman")) DreamWoman().Forget();
            }
            if (W.id == "vale" && F.B("awake") && !F.B("escape"))
            {
                if (Near(l, 13, 36, 3)) Tutorial.Hint("rest");
                // the patrol
                if (!F.B("patrol") && !F.B("patrol_met") && !F.B("patrol_cd") && Near(l, 22, 21, 7.5f)) PatrolScene().Forget();
                if (F.B("patrol_cd") && !Near(l, 22, 21, 9.5f)) F.Off("patrol_cd");
                // the ruins
                if (ty <= 15 && tx >= 9 && tx <= 31) F.On("ruins_entered");
                if (!F.B("clan"))
                {
                    if (!F.B("breach_asked") && tx >= 29 && tx <= 31 && ty >= 7 && ty <= 12) BreachScene().Forget();
                    else if (tx >= 13 && tx <= 27 && ty >= 4 && ty <= 13) GorzaScene(false).Forget();
                }
                else if (F.S("clan") == "infiltrated" && !F.B("gorza_met") && tx < 22 && ty <= 12 && ty >= 4) GorzaScene(true).Forget();
            }
            if (W.id == "relicario")
            {
                if (!F.B("atrium") && ty >= 20 && ty <= 24) AtriumScene().Forget();
                if (F.B("door_open") && !F.B("heart_seen") && ty <= 8) HeartScene().Forget();
                if (F.B("heart_seen") && !F.B("arq_talk") && Near(l, 11, 3, 2.6f)) ArchivistScene().Forget();
            }
        }

        // ---------------------------------------------------------------- the Bruma, as a field the renderer samples
        public static bool HasFog() => G.W != null && (G.W.id != "relicario" || F.B("relic_collapse"));
        public static float FogAt(float x, float y)
        {
            var W = G.W; var l = G.Lead;
            if (W.id == "sonho")
            {
                float m = 0;
                foreach (var (dx, dy) in new[] { (-14, -14), (14, -14), (-14, 14), (14, 14) }) if (W.TileAt(Mathf.FloorToInt((x + dx) / TILE), Mathf.FloorToInt((y + dy) / TILE)) == T.MIST) m += 0.25f;
                float rear = l != null ? Mathf.Clamp01((y - (l.y + 3.5f * TILE)) / (2.5f * TILE)) : 0;
                return Mathf.Max(m * 0.95f, Mathf.Max(rear, F.N("whiteK")));
            }
            if (W.id == "relicario") return Mathf.Clamp01((y - (31 * TILE - F.N("relicFog"))) / (3 * TILE)) * 0.9f;
            // the valley: thick to the north, held off the ruins by the smoke, a low patch at the camp's edge
            float f = Mathf.Clamp01((5.5f * TILE - y) / (4 * TILE)) * 0.85f;
            float e = Mathf.Pow((x - 20.5f * TILE) / (11 * TILE), 2) + Mathf.Pow((y - 8 * TILE) / (7 * TILE), 2);
            float smoke = Mathf.Clamp01((e - 0.8f) / 0.4f), smokeK = F.N("smokeK");
            f *= 1 - (1 - smoke) * (1 - smokeK);
            if (smokeK != 0) f = Mathf.Max(f, (1 - e) * 0.5f * smokeK);
            float fx = 13 * TILE + 16, fy = 36 * TILE + 16, dc = U.Dist(x, y, fx, fy);
            float hole = (3 + 5 * F.N("campFogK")) * TILE;
            if (!F.B("escape")) f = Mathf.Max(f, 0.6f * Mathf.Clamp01((dc - hole) / (2 * TILE)) * Mathf.Clamp01(1.4f - dc / (10 * TILE)) * Mathf.Clamp01((fy - y) / (3 * TILE)));
            if (F.B("escape"))
            {
                float d = U.Dist(x, y, ORIGIN.x, ORIGIN.y);
                float b = Mathf.Clamp01((esc.R - d) / (2.2f * TILE));
                if (esc.ending)
                {
                    var boat = Game.Obj("boat");
                    b *= Mathf.Clamp01((U.Dist(x, y, boat.x, boat.y) - 4 * TILE) / (4 * TILE)); // the water stays clear around the boat
                    if (x > 58 * TILE) b *= 0.35f; // and the river runs ahead of it
                    if (!F.B("fireGone")) b *= Mathf.Clamp01((dc - 2 * TILE) / (3 * TILE));
                }
                f = Mathf.Max(f, b);
                if (F.B("maren_forgot") && !F.B("maren_aboard")) { var m = Cast("maren"); f = Mathf.Max(f, 0.55f * Mathf.Clamp01(1 - U.Dist(x, y, m.x, m.y) / (1.6f * TILE))); }
            }
            return f;
        }

        /// <summary>Under the actors: the escape route, glowing on the trail.</summary>
        public static void DrawGround(float cx, float cy)
        {
            if (!F.B("escape") || F.B("escape_done") || G.W.id != "vale") return;
            float t = G.time;
            for (int i = 0; i < ROUTE.Length - 1; i++)
            {
                var a = ROUTE[i]; var b = ROUTE[i + 1]; int n = Mathf.CeilToInt(Vector2.Distance(a, b) / 24);
                for (int s = 0; s < n; s++)
                {
                    float k = s / (float)n, x = a.x + (b.x - a.x) * k - cx, y = a.y + (b.y - a.y) * k - cy;
                    float al = 0.45f + 0.4f * Mathf.Sin(t * 5 - (i * n + s) * 0.6f);
                    Gfx.Fill(Mathf.Round(x) - 2, Mathf.Round(y) - 1, 5, 4, new Color(40 / 255f, 24 / 255f, 8 / 255f, al * 0.6f));
                    var c = new Color(1, 214 / 255f, 120 / 255f, al);
                    Gfx.Fill(Mathf.Round(x) - 1, Mathf.Round(y) - 2, 3, 4, c);
                    Gfx.Fill(Mathf.Round(x) - 2, Mathf.Round(y) - 1, 5, 2, c);
                }
            }
        }

        /// <summary>Over everything: the people in the boat, and the boat's reflection with one passenger too many.</summary>
        public static void DrawOver(float cx, float cy)
        {
            if (!boatRide.on || G.W.id != "vale") return;
            var boat = Game.Obj("boat");
            float bx = Mathf.Round(boat.x - cx), by = Mathf.Round(boat.y - cy);
            void Seat(Unit u, float x, float y, float a = 1) => Gfx.Draw(u.ch.frames[2][4], 0, 0, Chars.SW, 24, x - 13, y - 24, Chars.SW, 24, new Color(1, 1, 1, a));
            var spots = new[] { -20, -6, 8, 20 };
            for (int i = 0; i < boatRide.people.Count; i++) Seat(boatRide.people[i], bx + spots[i], by - 6);
            if (boatRide.reflection)
            {
                float a = 0.28f + Mathf.Sin(G.time * 2) * 0.04f;
                Gfx.flipAxis = by + 3;
                Gfx.Draw(boat.art.c, bx - boat.art.ox, by - boat.art.oy, new Color(1, 1, 1, a));
                for (int i = 0; i < boatRide.people.Count; i++) Seat(boatRide.people[i], bx + spots[i], by - 6, a);
                Seat(Cast("ghost"), bx - 13, by - 9, a);
                Gfx.flipAxis = null;
            }
        }
    }
}
