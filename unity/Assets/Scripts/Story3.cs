// The Prologue, part three: the Relicário, its statues, the Archivist, Sister Cendra and the Echo.
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using UnityEngine;

namespace Brumafolha
{
    public static partial class Story
    {
        // ---------------------------------------------------------------- 6.6 the Relicário
        static async Task EnterRelic()
        {
            await Scene(async () =>
            {
                await Hud.Fade(1, 700);
                var R = Game.Map("relicario");
                var hero = Game.Obj("reliefHero", R); var tm = Game.Obj("reliefTome", R);
                if (hero.spec == null) { hero.spec = G.hero.spec; tm.spec = Chars.SPECS["tome"]; Game.Refresh(hero); Game.Refresh(tm); }
                Game.LoadMap("relicario", 11, 28, 3);
                G.camFocus = null;
                await Hud.Fade(0, 900);
                if (!F.B("relic_entered"))
                {
                    F.On("relic_entered");
                    var seq = new List<(ISpeaker, string)> { (G.mate, MateIs("kael") ? "Sem poeira. Sem teia. Ou alguém limpa isso aqui todo dia, ou ninguém nunca entrou." : "(muito baixo) Velmoor... Não toquem em nada. Eu falo sério dessa vez.") };
                    if (F.B("tome_with")) seq.Add((Cast("tome"), "Tá vendo? Eu falei. Tem luz sem vela!"));
                    await Lines(seq.ToArray());
                }
            });
        }

        static async Task AtriumScene()
        {
            F.On("atrium");
            await Scene(async () =>
            {
                Look(11, 22, 2);
                await Say(null, "As paredes estão cobertas de relevos: centenas de pessoas sem rosto, de costas, como as do seu sonho. Menos duas. Uma, na parede oeste, tem o seu rosto. Exatamente o seu. A outra, na parede leste, tem o rosto de um menino.");
                if (F.B("tome_with")) await Say(Cast("tome"), "Sou eu! Eu falei que tinha a minha cara!");
                var v = await Ask(null, "(Os relevos parecem olhar para vocês.)", new List<AO> {
                    new AO { label = "Lembrar o que se conta sobre Velmoor.", check = C(14, "História"), pass = "ok", fail = "bad" },
                    new AO { label = "Sentir a magia das paredes.", check = C(13, "Arcanismo"), pass = "ok", fail = "bad" },
                    new AO { label = "Seguir em frente.", v = "no" },
                });
                if (v == "ok") { F.On("atrium_read"); await Say(null, "Você entende: os relevos não foram esculpidos para vocês. Eles mudam para mostrar quem entra. Este lugar quer que você se sinta esperado."); Reward(50, "O Átrio dos Rostos"); }
                if (v == "bad") await Say(null, "São só pedras. Pedras que sabem a sua cara.");
            });
        }

        static int LitCount() { var R = Game.Map("relicario"); return new[] { "s1", "s2", "s3" }.Count(id => (Game.Obj(id, R)?.lit ?? 0) != 0); }
        static readonly Dictionary<string, string> STATUE_Q = new Dictionary<string, string> {
            ["s1"] = "Quem te ensinou a ser quem você é?",
            ["s2"] = "Qual é o lugar que você chama de casa?",
            ["s3"] = "Qual é a coisa que você nunca contou a ninguém?",
        };
        static async Task StatueTalk(string id)
        {
            var o = Game.Obj(id);
            var names = new Dictionary<string, string> { ["s1"] = "A Primeira Estátua", ["s2"] = "A Segunda Estátua", ["s3"] = "A Terceira Estátua" };
            var sp = new Speaker(names[id], StatuePortrait());
            if (o.lit != 0) { await Say(sp, "(A Lume da estátua brilha. Ela já ouviu a sua resposta.)"); return; }
            string text = null;
            await Scene(async () =>
            {
                if (id == "s1")
                {
                    bool cleric = G.hero.cls.Contains("Clérigo") || G.hero.cls.Contains("Clériga");
                    var opts = new List<AO> {
                        new AO { label = "Minha mãe.", v = "mãe" }, new AO { label = "Meu pai.", v = "pai" }, new AO { label = "Um mestre.", v = "mestre" },
                        new AO { label = "Ninguém. Aprendi por conta própria.", v = "ninguém" },
                    };
                    if (cleric) opts.Add(new AO { label = "Um deus.", v = "deus" });
                    var v = await Ask(sp, STATUE_Q["s1"], opts);
                    string name = "";
                    if (v != "ninguém")
                    {
                        string q = v == "deus" ? "A quem você reza?" : v == "mestre" ? "Como se chamava o seu mestre?" : "Qual era o nome?";
                        await Ask(sp, q, new List<AO> { new AO { label = "É esse o nome.", v = "ok", @do = val => { name = val; } } },
                            new DInput { placeholder = v == "deus" ? "Solenne, Nhara, Ormun..." : "um nome (ou deixe em branco)", value = v == "deus" ? "Solenne" : "" });
                    }
                    G.origin = new Origin { mentor = v, mentorName = name };
                    text = v == "mãe" ? $"Minha mãe{(name != "" ? ", " + name : "")}, que me ensinou a ser quem eu sou."
                        : v == "pai" ? $"Meu pai{(name != "" ? ", " + name : "")}, que me ensinou a ser quem eu sou."
                        : v == "mestre" ? $"{(name != "" ? name : "Meu mestre")}, que me ensinou o ofício, e todo o resto junto."
                        : v == "deus" ? $"{(name != "" ? name : "A divindade")}, a quem eu devo quem eu sou." : "Ninguém me ensinou. Aprendi por conta própria, e lembro de cada tombo.";
                }
                if (id == "s2")
                {
                    text = await Ask(sp, STATUE_Q["s2"], new List<AO> {
                        new AO { label = "Uma aldeia.", v = "Uma aldeia de telhados baixos, onde todo mundo sabia o meu nome." },
                        new AO { label = "Uma cidade.", v = "Uma cidade barulhenta, com uma janela que dava para os telhados." },
                        new AO { label = "A estrada.", v = "A estrada. Nenhuma cama duas vezes, e o céu sempre em cima." },
                        new AO { label = "Um templo.", v = "Um templo de pedra fria, com cheiro de cera e de incenso." },
                        new AO { label = "Nenhum lugar.", v = "Nenhum lugar. Casa é uma palavra que eu nunca usei." },
                    });
                }
                if (id == "s3")
                {
                    text = await Ask(sp, STATUE_Q["s3"], new List<AO> {
                        new AO { label = "Uma vergonha.", v = "Uma vergonha que ainda queima quando eu lembro." },
                        new AO { label = "Um amor.", v = "Um amor que eu nunca disse em voz alta." },
                        new AO { label = "Um crime.", v = "Um crime que ninguém descobriu." },
                        new AO { label = "Um medo.", v = "Um medo que eu carrego desde criança." },
                        new AO { label = "Uma promessa quebrada.", v = "Uma promessa que eu quebrei." },
                    });
                }
                o.lit = 1; Game.Refresh(o);
                o.glow = new Glow { r = 38, c = new Color32(160, 200, 255, 255), a = 0.4f, h = 40 };
                G.fx.Spawn(FxKind.Bloom, o.x, o.y - 30, PAL.arcane);
                Snd.bells();
                var door = Game.Obj("door");
                door.lit = LitCount(); Game.Refresh(door);
                Remember("origin_" + id, text, true);
                await Say(sp, "(A Lume da estátua se acende. Por um instante, você sente o cheiro daquela lembrança.)");
                if (LitCount() == 3) await OpenDoor();
            });
        }
        static Img statuePort;
        static Img StatuePortrait()
        {
            if (statuePort != null) return statuePort;
            var s = Chars.SPECS["statue"].Clone(); var fig = Chars.SPECS["figure"];
            s.skin = fig.skin; s.tunic = fig.tunic; s.hair = fig.hair;
            return statuePort = Chars.Portrait(Chars.BuildCharacter(s));
        }

        static async Task OpenDoor()
        {
            F.On("door_open");
            Look(11, 10, 2);
            await Game.Sleep(400);
            G.shake = 1.2f;
            Snd.chest();
            var d = Game.Obj("door");
            await TweenFor(1.4f, k => { d.clip = k; });
            d.hidden = true;
            for (int x = 10; x <= 12; x++) G.W.SetBlock(x, 9, false);
            Hud.Toast("A porta se abre.", 2500);
            Reward(100, "As três Lumes acesas");
        }

        static async Task HeartScene()
        {
            F.On("heart_seen");
            var g = Cast("ghost");
            g.hidden = false;
            TweenFor(2.5f, k => { g.alpha = k * 0.6f; }).Forget();
            await Scene(async () =>
            {
                Look(11, 3, 2);
                await Say(null, "Uma câmara branca e alta. No centro, num pedestal, uma lanterna de prata em forma de folha. Acima dela, uma mulher de cabelos de prata flutua como um reflexo na água. Ela sorri para você.");
            });
        }

        static async Task ArchivistScene()
        {
            F.On("arq_talk");
            var g = Cast("ghost"); var ARQ = new Speaker("A Arquivista", g.portrait);
            await Scene(async () =>
            {
                Look(11, 4, 2);
                Game.Face(G.Lead, g);
                var t = new DTree();
                DNode A(string text, params DOpt[] o) { var n = N(text, o); n.who = ARQ; return n; }
                t.Add("start", A("Você me ouviu. Atravessou um vale inteiro por um sonho. Ninguém faz isso há mil anos. Eu sou a última que lembra de Velmoor. E você... você é o primeiro que vai lembrar de mim.", O("Continuar", "hub")));
                t.Add("hub", A("(Ela espera, paciente. A luz da lanterna pulsa devagar, como um coração.)",
                    O("Quem é você?", "who", once: true),
                    O("A carta dizia para não escutar você.", "letter", once: true),
                    Chk("Você está mentindo sobre alguma coisa.", C(15, "Intuição"), "lie", "nolie", _ => F.On("eco_suspicious"), once: true),
                    O("O que você quer de mim?", "want", once: true),
                    O("Lyra?", "lyra", () => F.On("lyra_trembled"), () => MateIs("lyra"), once: true),
                    O("Estender a mão para a Lume.")));
                t.Add("who", A("Uma arquivista. Eu guardava lembranças. Agora sou uma.", O("Continuar", "hub")));
                t.Add("letter", A("Claro que dizia. Quem a escreveu tem medo do que eu sei.", O("Continuar", "hub")));
                t.Add("lie", A("(Ela sorri.) Todo mundo que lembra mente um pouco. Lembrar é escolher.", O("Continuar", "hub")));
                t.Add("nolie", A("Mentindo? Eu mal existo. Não sobra espaço em mim para mentira.", O("Continuar", "hub")));
                t.Add("want", A("Que você me leve daqui. Que você lembre de mim. É pouco, não é?", O("Continuar", "hub")));
                t.Add("lyra", NN("Lyra está pálida. Não diz nada. Você nota que as mãos dela tremem.", O("Continuar", "hub")));
                await Dialogue.Talk(ARQ, t);
                await CendraScene();
            });
        }

        // ---------------------------------------------------------------- Sister Cendra
        static readonly Dictionary<string, int[]> RELIC_POS = new Dictionary<string, int[]> { ["hero"] = new[] { 10, 4 }, ["mate"] = new[] { 12, 4 }, ["tome"] = new[] { 14, 4 }, ["cendra"] = new[] { 11, 8 }, ["silas"] = new[] { 9, 8 }, ["e1"] = new[] { 7, 7 }, ["e2"] = new[] { 15, 7 } };
        static Group relicGroup;
        static List<Unit> MakeRelicFoes()
        {
            Unit Mk(string spec, Action<Unit> def) => Game.MakeUnit(spec, x => { x.team = "enemy"; x.group = "relic"; def(x); });
            var cendra = Mk("cendra", x => { x.key = "cendra"; x.name = "Irmã Cendra"; x.tx = 11; x.ty = 11; x.maxHp = 24; x.ac = 13; x.atk = 5; x.dmg = "1d6+2"; x.move = 6; x.dex = 2; x.xpValue = 200; x.boss = true; x.yields = true;
                x.ranged = new RangedAtk { range = 7, dmg = "1d8+2", name = "Toque do Esquecimento", pal = PAL.arcane, forget = true }; });
            var silas = Mk("silas", x => { x.key = "silas"; x.name = "Irmão Silas"; x.tx = 10; x.ty = 11; x.maxHp = 14; x.ac = 13; x.atk = 4; x.dmg = "1d6+2"; x.move = 6; x.dex = 2; x.xpValue = 100; });
            var e1 = Mk("esvaido", x => { x.esvaido = true; x.name = "Esvaído"; x.tx = 12; x.ty = 11; x.maxHp = 18; x.ac = 10; x.atk = 3; x.dmg = "1d8+1"; x.move = 3; x.dex = -1; x.xpValue = 100; });
            var e2 = Mk("esvaidoFisher", x => { x.esvaido = true; x.key = "fisher"; x.name = "Esvaído pescador"; x.tx = 11; x.ty = 12; x.maxHp = 18; x.ac = 10; x.atk = 3; x.dmg = "1d8+1"; x.move = 3; x.dex = -1; x.xpValue = 100; });
            cast["cendra"] = cendra; cast["silas"] = silas; cast["e1"] = e1; cast["fisher"] = e2;
            return new List<Unit> { cendra, silas, e1, e2 };
        }

        static async Task CendraScene()
        {
            var W = G.W;
            var foes0 = MakeRelicFoes(); var cendra = foes0[0]; var silas = foes0[1]; var e1 = foes0[2]; var e2 = foes0[3];
            W.enemies.AddRange(foes0);
            await Say(null, "Passos na escada.");
            Look(11, 6, 2);
            var tm = Cast("tome");
            Task Wk(Unit u, string k, float sp = 70) => Game.Walk(u, RELIC_POS[k][0], RELIC_POS[k][1], sp);
            await Task.WhenAll(Wk(G.hero, "hero"), Wk(G.mate, "mate"), F.B("tome_with") ? Wk(tm, "tome") : Task.CompletedTask,
                Wk(cendra, "cendra", 60), Wk(silas, "silas", 60), Wk(e1, "e1", 50), Wk(e2, "e2", 50));
            foreach (var u in new[] { G.hero, G.mate, tm }) Game.Face(u, cendra);
            foreach (var u in new[] { cendra, silas, e1, e2 }) Game.Face(u, G.hero);
            var seq = new List<(ISpeaker, string)> {
                (cendra, "Afaste-se da Lume, criança. Você não sabe o que está segurando. Nós sabemos. A Madre esperou doze anos por esse dia."),
                (silas, "(baixinho) Cendra, eles são só viajantes..."),
                (cendra, "Todo mundo é só viajante, Silas. É por isso que vamos ajudá-los a descansar."),
                (null, "Os dois vultos atrás dela andam como quem já esqueceu por quê. Olhos brancos. Um deles usa roupas de pescador."),
            };
            if (F.B("tome_with")) seq.Add((cendra, "E trouxeram uma criança. Que gentileza. Ela descansa primeiro."));
            await Lines(seq.ToArray());
            string v;
            do
            {
                v = await Ask(cendra, "(Ela espera, com as mãos abertas, como quem oferece um abraço.)", new List<AO> {
                    new AO { @if = () => !F.B("silas_try"), label = "Silas. Você não quer fazer isso.", check = C(15, "Persuasão"), pass = "silas", fail = "silasno" },
                    new AO { label = "Tudo bem. A Lume é sua. Venha pegar.", check = C(13, "Enganação"), pass = "deceive", fail = "deceiveno" },
                    new AO { label = "Mais um passo e quem descansa são vocês.", check = C(14, "Intimidação"), pass = "scare", fail = "scareno" },
                    new AO { label = "Entregar a Lume.", v = "give" },
                    new AO { label = "Então venham.", tag = "Combate", v = "fight" },
                });
                if (v == "silas" || v == "silasno")
                {
                    F.On("silas_try");
                    if (v == "silas")
                    {
                        F.On("silas_doubt");
                        await Lines((silas, "(Silas olha para a criança, para os Esvaídos, para você.) ...Que a Madre me perdoe."), (cendra, "Silas!"));
                        W.enemies.Remove(silas);
                        silas.team = "npc";
                        W.npcs.Add(silas);
                        Then(Game.Walk(silas, 11, 16, 90), () => { G.fx.Spawn(FxKind.Poof, silas.x, silas.y); silas.gone = true; });
                    }
                    else await Say(silas, "(Silas baixa os olhos e não se mexe.)");
                }
            } while (v == "silas" || v == "silasno");
            var foes = new Group("relic", new[] { cendra }.Concat(F.B("silas_doubt") ? new Unit[0] : new[] { silas }).Concat(new[] { e1, e2 }));
            relicGroup = foes;
            W.groups["relic"] = foes;
            if (v == "deceive") { await Say(null, "Cendra dá um passo à frente, as mãos estendidas. Perto demais."); foreach (var e in foes) { e.skip = 1; e.skipNote = "Surpreso!"; } }
            if (v == "deceiveno") await Say(cendra, "Mentira tem cheiro, criança.");
            if (v == "scare") { await Say(cendra, "(Cendra ri.) Que coragem. ...Mas um dos Esvaídos dá um passo para trás."); e1.skip = 1; e1.skipNote = "Hesita"; }
            if (v == "scareno") await Say(cendra, "(Cendra ri, e o riso ecoa na câmara branca.)");
            if (v == "give")
            {
                F.On("lume_given");
                var ped = Game.Obj("pedestal");
                ped.empty = true; Game.Refresh(ped); ped.glow = null;
                G.hero.glow = new Glow { r = 30, c = new Color32(160, 200, 255, 255), a = 0.35f, h = 18 };
                await Lines(
                    (null, "Você pega a Lume do pedestal e a estende. Cendra a toma com as duas mãos."),
                    (cendra, "Finalmente. A Madre vai..."),
                    (null, "A Lume queima. Cendra grita e a solta; a lanterna salta pelo ar, direto para a sua mão, como se tivesse sido chamada."),
                    (cendra, $"(soprando os dedos) ...Ela escolheu você. Tanto faz. {Rules.Gword(G.hero.gender, "Quero a portadora inteira", "Quero o portador inteiro", "Quero quem carrega a Lume inteiro")}. Os outros podem descansar."));
                cendra.spare = e1.spare = e2.spare = silas.spare = "player";
            }
            F.Set("cendra_choice", v);
            Game.Fight(foes);
        }

        public static async Task TurnStart(Unit u, CombatState C)
        {
            if (u.team == "party" && !u.ai) { Tutorial.Hint("turn"); Tutorial.Hint("actions"); if (u.abilities.Any(k => k == "missiles" || k == "heal" || k == "healword" || k == "mark")) Tutorial.Hint("spells"); }
            if (C.group != relicGroup) return;
            if (C.round >= 3 && F.B("goblin_pact") && !C.alliesIn) { C.alliesIn = true; await AlliesArrive(C); }
            if (!F.B("echo") && (C.round >= 4 || C.someoneDown)) await EchoMoment();
        }
        public static void PartyDown(Unit u) { if (G.combat != null) G.combat.someoneDown = true; Tutorial.Hint("down"); }

        static async Task AlliesArrive(CombatState C)
        {
            var gorza = Game.MakeUnit("chief", x => { x.key = "gorzaAlly"; x.name = "Gorza"; x.team = "party"; x.ai = true; x.tx = 10; x.ty = 9; x.maxHp = 24; x.ac = 15; x.atk = 5; x.dmg = "1d10+3"; x.move = 5; x.dex = 0; x.cls = "Chefe goblin · aliado"; x.hpPerLevel = 0; });
            var murta = Game.MakeUnit("murta", x => { x.key = "murtaAlly"; x.name = "Murta"; x.team = "party"; x.ai = true; x.tx = 12; x.ty = 9; x.maxHp = 12; x.ac = 13; x.atk = 4; x.dmg = "1d6+2"; x.move = 6; x.dex = 3; x.small = true; x.cls = "Arqueira goblin · aliada"; x.hpPerLevel = 0;
                x.ranged = new RangedAtk { range = 8, dmg = "1d6+2", name = "Flecha", pal = PAL.wood }; });
            foreach (var a in new[] { gorza, murta }) { G.fx.Spawn(FxKind.Poof, a.x, a.y); a.dir = 3; }
            G.party.Add(gorza); G.party.Add(murta);
            C.order.InsertRange(C.idx + 1, new[] { gorza, murta });
            Game.PartyChanged();
            Hud.Banner("O clã Dente-de-Musgo");
            await Lines((gorza, "Goblin paga o que deve! Murta, atira!"), (murta, "Murta atira bem."));
        }

        static async Task EchoMoment()
        {
            F.Set("echo", "pending");
            var g = Cast("ghost"); var ARQ = new Speaker("A Arquivista", g.portrait);
            G.tint = new Color(190 / 255f, 205 / 255f, 1, 0.28f);
            Snd.bells();
            var prevFocus = G.camFocus;
            G.camFocus = CamFocus.At(G.hero.x, G.hero.y - 10, 3);
            await Say(null, "O tempo para. A poeira fica suspensa no ar. As chamas das magias congelam no meio do caminho. Só a voz dela se mexe.");
            var v = await Ask(ARQ, "Eu posso ajudar. Só me deixe entrar. Não vai doer. Eu só preciso de um pouco de espaço.", new List<AO> {
                new AO { label = "Aceitar.", v = "accepted" },
                new AO { label = "Recusar.", v = "refused" },
            });
            var ped = Game.Obj("pedestal");
            ped.empty = true; Game.Refresh(ped); ped.glow = null;
            g.hidden = true;
            G.fx.Spawn(FxKind.Bloom, G.hero.x, G.hero.y + 2, PAL.arcane);
            G.hero.glow = new Glow { r = 30, c = new Color32(160, 200, 255, 255), a = 0.35f, h = 18 };
            if (v == "accepted")
            {
                await Lines((null, "A Lume se desfaz em luz e entra pela sua palma. Nervuras de prata sobem pelo seu braço, frias como água de poço."), (ARQ, "O primeiro é um presente. Os outros, uma troca justa."));
                if (!G.hero.abilities.Contains("lampejo")) G.hero.abilities.Add("lampejo");
                Tutorial.Hint("lampejo");
            }
            else await Lines((null, "Você fecha a mão. Não adianta. A luz entra por entre os seus dedos fechados, gentil e irresistível. Nervuras de prata sobem pelo seu braço."), (ARQ, "Desculpe. Eu estava com tanto frio."));
            F.Set("echo", v);
            G.tint = null;
            G.camFocus = prevFocus;
            Hud.Toast("O Eco agora mora na sua mão.", 3000);
            if (G.combat?.active?.team == "party" && !G.combat.active.ai) Combat.RefreshCombatHotbar();
        }

        public static void OnRetry()
        {
            var R = Game.Map("relicario");
            if (!F.B("echo") && G.W == R)
            {
                var ped = Game.Obj("pedestal", R);
                if (!F.B("lume_given")) { ped.empty = false; Game.Refresh(ped); ped.glow = new Glow { r = 44, c = new Color32(160, 200, 255, 255), a = 0.4f, h = 40 }; G.hero.glow = null; }
                Cast("ghost").hidden = false;
            }
            G.tint = null;
        }

        public static void OnCombatEnd(Group group)
        {
            var W = G.W;
            if (W.groups.TryGetValue("patrol", out var patrol) && group == patrol)
            {
                patrol.passive = true;
                Game.After(0.9f, () => Scene(() => Say(null, "O último goblin, caído, ainda agarra a rede: \"Não... a fumaça... precisa...\"")).Forget());
            }
            if (W.groups.TryGetValue("ruins", out var ruins) && group == ruins)
            {
                F.Set("clan", "fight"); F.On("smoke_out");
                if (Cast("avo").hp <= 0) F.On("avo_dead");
                var trophies = new List<Item>();
                if (Cast("gorza").hp <= 0) trophies.Add(Items.GearItem("weapon", "machadoGorza"));
                if (F.B("avo_dead")) trophies.Add(Items.GearItem("weapon", "cajadoOsso"));
                trophies.ForEach(GiveItem);
                if (trophies.Count > 0) Game.After(4.2f, () => Hud.Toast($"Na bolsa: {string.Join(", ", trophies.Select(t => t.name))}", 3200));
                ClanLeaves(false);
                Game.After(1.5f, () => Hud.Banner("Ruínas libertadas"));
                Later(40, () => { if (G.W.id == "vale") { FireOut(); Hud.Toast("A fogueira verde se apagou. A névoa branca começa a escorrer pelos muros.", 4500); } else FireOutValley(); });
                Game.After(2.6f, () => Scene(async () =>
                {
                    await Say(null, "As crianças e os velhos do clã fogem pela brecha oeste, direto para a névoa. Uma goblin pequena, de arco nas costas, para na brecha e olha para trás. Para você.");
                    if (F.B("avo_dead")) await Say(null, "Ela vê a velha de capuz vermelho caída perto do fogo. Não grita. Só decora o seu rosto, e some.");
                }).Forget());
            }
            if (group == relicGroup) { relicGroup.passive = true; RelicAftermath().Forget(); }
        }
        /// <summary>The goblin fire going out while the party is below ground: it still goes out in the valley.</summary>
        static void FireOutValley()
        {
            var o = Game.Map("vale").objects.FirstOrDefault(x => x.kind == "campfire" && x.goblin);
            if (o == null || o.@out) return;
            o.@out = true;
            if (o.fxe != null) { o.fxe.keep = false; o.fxe.Stop(); }
            TweenFor(20, k => F.Set("smokeK", k)).Forget();
        }

        static async Task RelicAftermath()
        {
            var W = G.W;
            var allies = G.party.Where(p => p.ai).ToList();
            await Game.Sleep(900);
            await Scene(async () =>
            {
                if (allies.Count > 0)
                {
                    await Say(allies[0], "Vai! O branco vem! Goblin segura lá em cima!");
                    G.party = G.party.Where(p => !p.ai).ToList();
                    foreach (var a in allies) { a.team = "npc"; W.npcs.Add(a); var aa = a; Then(Game.Walk(a, 11, 16, 110), () => aa.gone = true); }
                    Game.PartyChanged();
                }
                // Cendra doesn't die: she steps back into the Bruma coming down the stairs
                var c = Cast("cendra");
                c.gone = false; c.hp = 1; c.team = "npc"; c.alpha = 1;
                Game.Place(c, 11, 10, 3);
                if (!W.npcs.Contains(c)) W.npcs.Add(c);
                W.enemies.Remove(c);
                Look(11, 9, 2);
                F.On("relic_collapse");
                G.shake = 0.6f;
                await Say(c, "(Ela sorri, com a mão queimada contra o peito.) A Madre vai te encontrar. Todos encontram o descanso.");
                Game.Walk(c, 11, 16, 50).Forget();
                await TweenFor(2.2f, k => { c.alpha = 1 - k; });
                c.gone = true;
                // the fallen Forgotten get up, and go back to the last thing they remembered doing
                foreach (var e in new[] { Cast("e1"), Cast("fisher") })
                {
                    if (e == null) continue;
                    e.gone = false; e.hp = 1; e.team = "npc"; e.passive = true; e.gesture = true;
                    if (!W.npcs.Contains(e)) W.npcs.Add(e);
                    W.enemies.Remove(e);
                }
                Cast("fisher").talk = OtavioTree;
                Cast("fisher").label = "Esvaído pescador";
                Cast("e1").label = "Esvaído";
                Cast("e1").talk = () => One("(O Esvaído embala nos braços alguma coisa que não está ali, devagar, para lá e para cá.)", "...", true);
                await Say(null, "Os Esvaídos caídos se levantam devagar, sem raiva nenhuma, e voltam ao último gesto que lembravam. Um deles embala um filho que não está lá. O outro, com roupas de pescador, estende as mãos como quem joga uma rede.");
                // the milestone: everyone leaves the Relicário at level 2 at least
                foreach (var p in G.party.ToList()) if (p.level < 2) Game.GainXp(p, p.nextXp - p.xp);
                await Say(null, "O chão treme. As paredes brancas começam a se desfazer de baixo para cima, como papel molhado, exatamente como no sonho. Uma névoa perolada escorre pela escada.");
                var ARQ = new Speaker("A Arquivista", Cast("ghost").portrait);
                await Say(ARQ, "(só você ouve) Corra. Este lugar só existia porque eu estava nele.");
            });
        }

        static DTree OtavioTree()
        {
            bool canTell = F.B("chair_seen") || F.B("returned_heirloom");
            var t = new DTree();
            var opts = new List<DOpt>();
            if (!F.B("otavio_found") && canTell)
            {
                if (F.B("names_tree")) opts.Add(O("Comparar o entalhe da faca com o da cadeira e o da árvore.", "found", OtavioFound, null, "M + O"));
                else opts.Add(Chk("Comparar o entalhe da faca com o da cadeira.", C(12, "Investigação"), "found", "nofound", _ => OtavioFound()));
            }
            opts.Add(O("Deixá-lo."));
            t.Add("start", NN("O pescador esvaído joga uma rede que não existe, de novo e de novo. Na cintura dele há uma faca, com o cabo entalhado.", opts.ToArray()));
            t.Add("found", NN("É a mesma marca. O mesmo talho em forma de anzol que estava na cadeira de balanço: \"Para a Maren, do teu Otávio\". Este homem é Otávio. O lago devolveu o barco. A Ordem ficou com ele.", O("Continuar", "mate")));
            var mate = N(MateIs("kael") ? "A Ordem leva gente. Eu ouvi isso em Maralto e achei que era conversa de taverna." : "(Lyra fecha os olhos.) Ele ainda lembra de pescar. Só disso.", O("..."));
            mate.who = G.mate;
            t.Add("mate", mate);
            t.Add("nofound", NN("O chão treme demais. Você não consegue ver o entalhe direito.", O("...")));
            return t;
        }
        static void OtavioFound()
        {
            F.On("otavio_found");
            Game.After(0.3f, () => { Remember("otavio", "Otávio, o marido de Maren, jogando uma rede que não existe."); Reward(50, "Otávio"); });
        }

        static async Task StairsUse()
        {
            if (F.B("relic_collapse")) { await EscapeStart(); return; }
            var v = await Ask(null, "A escada sobe de volta para as ruínas.", new List<AO> { new AO { label = "Voltar ao vale.", v = "up" }, new AO { label = "Ficar.", v = "no" } });
            if (v != "up") return;
            await Scene(async () =>
            {
                await Hud.Fade(1, 600);
                Game.LoadMap("vale", 24, 12, 0);
                await Hud.Fade(0, 700);
            });
        }
    }
}
