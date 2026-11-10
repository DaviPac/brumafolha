// The Prologue, part two: the Mirror Lake and Maren, the ruins and the Dente-de-Musgo clan, Tomé and the trapdoor.
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using UnityEngine;

namespace Brumafolha
{
    public static partial class Story
    {
        // ---------------------------------------------------------------- 6.4 the Mirror Lake and Maren
        static DTree MarenTree()
        {
            void MakePact() { F.On("goblin_pact"); Game.After(0.4f, () => Reward(150, "Pacto com o clã Dente-de-Musgo")); }
            var t = new DTree();
            if (F.B("maren_forgot")) { t.Add("start", N("Ah! Viajantes de verdade, graças à Senhora das Marés.", O("..."))); return t; }
            t["start"] = () => N(
                !F.B("maren_met") ? "Ah! Viajantes de verdade, graças à Senhora das Marés. Goblins tomaram as velhas Ruínas de Velmoor, ao norte. Roubam minhas redes, assustam os peixes... Levaram até a cadeira de balanço do meu marido."
                    : F.B("returned_heirloom") ? "Vocês de novo. Sentem, sentem. A cadeira está ali, no lugar dela." : "De volta? Alguma notícia das minhas coisas?",
                O("Nós vamos recuperar suas coisas.", "accept", () => F.On("maren_met", "maren_quest"), () => !F.B("maren_met")),
                O("Estamos aqui por outra coisa: as ruínas.", "ruins", () => F.On("maren_met", "maren_quest"), () => !F.B("maren_met")),
                O("Trouxemos a cadeira do Otávio. E a sua rede.", "heirloom", () =>
                {
                    F.On("returned_heirloom", "maren_met", "maren_quest"); TakeItem("chair"); TakeItem("net"); Approve("kael", 1); Approve("lyra", 1); G.potions++; GiveItem(Items.GearItem("weapon", "bestaLeve"));
                    Game.After(0.3f, () => { Reward(100, "As coisas de Maren voltaram para casa"); Remember("heirloom", "Maren chorando em silêncio, com a cadeira de Otávio nas mãos."); });
                }, () => HasItem("chair")),
                O("Os goblins não estão roubando à toa. Eles queimam suas coisas.", "smoke", () => F.On("maren_smoke"), () => F.B("heard_smoke") && !F.B("maren_smoke")),
                Chk("Um trabalho desses merece pagamento adiantado.", C(12, "Persuasão"), "paid", "notpaid", _ => { F.Set("paid_try", true); G.potions += 2; Hud.Toast("+2 Poções de cura"); }, _ => F.Set("paid_try", false), () => F.B("maren_met") && !F.Has("paid_try")),
                Chk("Você está escondendo alguma coisa.", C(10, "Intuição"), "secret", "nosecret", _ => F.Set("grandson", true), _ => F.Set("grandson", false), () => F.B("maren_met") && !F.Has("grandson")),
                Chk("O que você sabe das ruínas?", C(13, "História"), "history", "nohistory", _ => { F.Set("maren_history", true); Game.After(0.3f, () => Reward(50, "Uma pista sobre Velmoor")); }, _ => F.Set("maren_history", false), () => F.B("maren_met") && !F.Has("maren_history")),
                O("Essa névoa que desce do norte...", "mist", () => F.On("maren_mist"), () => F.B("maren_met") && !F.B("maren_mist")),
                O("Os goblins só queriam fumaça. Coisas velhas, como a cadeira guardava o Otávio. Eles trocariam trabalho por elas.", "pactyes", MakePact, () => F.B("pact_proposed") && !F.B("goblin_pact") && !F.B("pact_refused") && F.B("returned_heirloom"), "Ela confia em vocês"),
                Chk("Os goblins trocariam trabalho por coisas velhas.", C(12, "Persuasão"), "pactyes", "pactno", _ => MakePact(), _ => F.On("pact_refused"), () => F.B("pact_proposed") && !F.B("goblin_pact") && !F.B("pact_refused") && !F.B("returned_heirloom")),
                O("O Tomé chegou bem?", "tome", null, () => F.B("tome_home")),
                O("Quantos goblins são?", "count", null, () => F.B("maren_met") && !F.B("clan"), "Perguntar"),
                O("Até mais, Maren."));
            t.Add("accept", N("Que os deuses guiem vocês. A estrada ao norte leva direto às ruínas, e vi uma patrulha deles rondando a trilha. Se acharem a minha rede... e a cadeira do meu Otávio... tragam de volta. O resto eles podem levar.", O("Mais uma pergunta.", "start"), O("Até mais.")));
            t.Add("ruins", N("As ruínas? Só tem pedra velha e goblin lá em cima. ...Mas se vão subir, façam uma velha feliz: me tragam a minha rede. E a cadeira de balanço do meu marido.", O("Mais uma pergunta.", "start"), O("Até mais.")));
            t.Add("paid", N("Hmpf... justo. Tomem, duas poções do meu estoque. Mas eu quero aqueles goblins longe das minhas redes!", O("Combinado.", "start")));
            t.Add("notpaid", N("Adiantado? Ha! Paguem-se com o que os goblins roubaram de mim, se acharem.", O("Justo.", "start")));
            t.Add("secret", N("...Meu neto, Tomé. Foi atrás das redes e não voltou. Se o virem nas ruínas, por favor... tragam ele de volta.", O("Vamos encontrá-lo.", "start")));
            t.Add("nosecret", N("Escondendo? Só o cheiro de peixe, criança. Hah!", O("Certo...", "start")));
            t.Add("count", N("Uns quatro ou cinco nas ruínas, fora os pequenos. Um deles mexe com fogo, um xamã. Se fosse eu, derrubava esse primeiro.", O("Bom saber.", "start")));
            t.Add("heirloom", N("(Ela segura a cadeira com as duas mãos e chora em silêncio.) ...Ele levou um inverno inteiro pra entalhar isso. Dizia que era pra quando eu ficasse velha. Fiquei. Ele não viu. Tomem, uma poção. E levem a besta dele, que ninguém aqui sabe armar. Obrigada.", O("Continuar", "start")));
            t.Add("smoke", N("Queimam? A rede que eu remendo desde menina? A cadeira do meu marido? (pausa) ...Então é por isso que a fumaça das ruínas cheira a casa.", O("Continuar", "start")));
            t.Add("history", N("Ninguém sabe o que foi Velmoor. Meu avô dizia que, quando criança, sabia, e um dia acordou sem saber. A aldeia inteira acordou sem saber.", O("Continuar", "start")));
            t.Add("nohistory", N("Pedras velhas, goblins novos. É o que eu sei.", O("Continuar", "start")));
            t.Add("mist", N("Desce do norte faz uns anos. Cada inverno, um pouco mais. Meu Otávio saiu pra pescar num dia de névoa assim, faz três anos. O lago devolveu o barco. Ele, não.", O("Sinto muito.", "start")));
            t.Add("pactyes", N("...Coisa velha eu tenho. A casa é feita disso. (ela suspira) Digam pra eles: peixe pela manhã, vigia de noite, e nada de roubar. Eu mesma levo a primeira carroça de tralha.", O("Continuar", "start")));
            t.Add("pactno", N("Não. Eles me roubaram. Não vou dar mais nada pra quem me roubou.", O("Continuar", "start")));
            t.Add("tome", N("Chegou correndo, sujo de fuligem, falando de uma moça que mora debaixo da terra. (ela balança a cabeça) Obrigada. De verdade.", O("Continuar", "start")));
            return t;
        }

        static async Task PierLook()
        {
            if (F.B("pier_seen")) { await Say(null, "A água está parada. Só o seu reflexo, e o céu."); return; }
            await Scene(async () =>
            {
                Look(42, 25, 2);
                var v = await Ask(null, "Da ponta do píer, a água do Lago Espelhado está tão parada que parece vidro. A noroeste, as ruínas aparecem invertidas na superfície.", new List<AO> {
                    F.B("dream_mind") ? new AO { label = "Olhar a água com o sonho em mente.", tag = "O sonho", v = "ok" } : new AO { label = "Olhar a água com atenção.", check = C(12, "Percepção"), pass = "ok", fail = "bad" },
                    new AO { label = "Deixar para lá.", v = "no" },
                });
                if (v == "no") return;
                F.On("pier_seen");
                if (v == "bad") { await Say(null, "Por um instante você acha que o reflexo das ruínas está... inteiro. Depois pisca, e são só pedras quebradas na água."); return; }
                G.tint = new Color(220 / 255f, 230 / 255f, 1, 0.25f);
                Snd.bells();
                await Lines(
                    (null, "No reflexo, as ruínas não estão quebradas. No lugar delas há uma cidade de torres brancas, sob um céu sem sol."),
                    (null, "Na margem refletida, uma mulher de cabelos de prata está de costas. Ela se vira. A água treme, e o reflexo se desfaz."));
                G.tint = null;
                var m = Cast("maren");
                if (!F.B("maren_forgot") && U.Dist(m.x, m.y, G.Lead.x, G.Lead.y) < 14 * TILE) await Say(m, "Você também vê? Meu Otávio dizia que o lago lembra do que o mundo esqueceu.");
                Reward(50, "O Lago Espelhado");
            });
        }

        static async Task NameTree()
        {
            if (F.Has("names_tree")) { await Say(null, F.B("names_tree") ? "M + O, com o talho em forma de anzol." : "Nomes e mais nomes, quase todos gastos pelo tempo."); return; }
            await Scene(async () =>
            {
                var v = await Ask(null, "Uma árvore morta na margem norte do lago, coberta de nomes entalhados. A maioria já ficou ilegível. Alguns parecem ter sido raspados.", new List<AO> {
                    new AO { label = "Procurar um nome conhecido.", check = C(12, "Investigação"), pass = "ok", fail = "bad" },
                    new AO { label = "Deixar a árvore em paz.", v = "no" },
                });
                if (v == "no") return;
                F.Set("names_tree", v == "ok");
                if (v == "ok") { await Say(null, "Perto da raiz: \"M + O\". Ao lado, um talho em forma de anzol, feito com a ponta de uma faca. Alguém assinava assim."); Reward(25, "A Árvore dos Nomes"); }
                else await Say(null, "Nomes demais, e nenhum que diga alguma coisa a você.");
            });
        }
        static async Task MarkerStone()
        {
            if (F.Has("marker_read")) { await Say(null, "O marco de Velmoor, meio enterrado na margem."); return; }
            await Scene(async () =>
            {
                var v = await Ask(null, "Uma pedra branca meio enterrada na margem da lagoa, lisa demais para ser natural. Uma linha de sinais corre pela face dela.", new List<AO> {
                    new AO { label = "Decifrar a inscrição.", check = C(12, "História"), pass = "ok", fail = "bad" },
                    new AO { label = "Seguir caminho.", v = "no" },
                });
                if (v == "no") return;
                F.Set("marker_read", v == "ok");
                if (v == "ok")
                {
                    await Lines((null, "É escrita velmooriana, a mesma das ruínas. Você lê devagar: \"Tudo o que existe é lembrado por alguém.\""),
                        (G.mate, MateIs("lyra") ? "(baixinho) ...\"O que ninguém lembra, a Bruma leva.\" A frase continua do outro lado. Está enterrada." : "Bonito. Agora diz o que significa."));
                    Reward(50, "Um marco de Velmoor");
                }
                else await Say(null, "Os sinais parecem letras, mas nenhuma que você conheça.");
            });
        }

        // ---------------------------------------------------------------- 6.5 the ruins and the Dente-de-Musgo clan
        static Speaker AvoSpeaker() => new Speaker("Avó Fuligem", Cast("avo").portrait);

        static async Task BreachScene()
        {
            F.On("breach_asked");
            await Scene(async () =>
            {
                Look(26, 9, 2.5f);
                Tutorial.Hint("stealth");
                var v = await Ask(null, "Uma brecha no muro leste. Lá dentro, a fumaça cinzenta e doce cobre tudo. Um goblin arqueiro vigia o pátio, de costas, coçando a orelha. Atrás de uma coluna partida, algo se mexe.", new List<AO> {
                    new AO { label = "Entrar escondido.", check = C(13, "Furtividade"), pass = "in", fail = "seen" },
                    new AO { label = "Dar a volta e entrar pela frente.", v = "front" },
                });
                if (v == "in")
                {
                    F.On("infiltrated"); F.Set("clan", "infiltrated"); F.On("ruins_entered");
                    await Say(null, "Vocês passam pela brecha colados ao muro. O arqueiro boceja. Ninguém vira a cabeça.");
                    Reward(100, "Entraram nas ruínas sem ser vistos");
                }
                else if (v == "seen")
                {
                    await Say(null, "Uma pedra solta rola do muro. O arqueiro se vira, e grita alguma coisa em goblin.");
                    await GorzaScene(true);
                }
            });
        }

        static async Task GorzaScene(bool caught)
        {
            F.On("gorza_met", "ruins_entered");
            var gorza = Cast("gorza"); var avo = AvoSpeaker();
            await Scene(async () =>
            {
                Look(20, 7, 2.5f);
                Tutorial.Hint("ruins");
                Game.Face(gorza, G.Lead);
                var seq = new List<(ISpeaker, string)>();
                if (caught) seq.Add((gorza, "Vocês achou que goblin não tem olho?"));
                if (F.B("gorza_warned")) seq.Add((gorza, "Batedor contou. Gente grande e feia na trilha. Gorza tava esperando."));
                seq.Add((null, "No centro do pátio, uma fogueira verde-acinzentada queima redes, sapatos, brinquedos, cartas. A névoa branca para exatamente na borda da fumaça, como água contra um vidro."));
                seq.Add((gorza, "Mais um passo e Gorza quebra vocês. (ele olha para a névoa atrás do grupo) ...Ou vocês ficam e o branco come vocês. Escolhe."));
                await Lines(seq.ToArray());
                int dcTalk = F.B("heard_smoke") || F.B("fiapo_spared") ? 11 : F.B("gorza_warned") ? 15 : 14;
                var v = await Ask(gorza, "(Gorza espera, de machado na mão. Atrás dele, uma goblin velha de capuz vermelho observa vocês e mexe a brasa com um osso.)", new List<AO> {
                    new AO { label = F.B("heard_smoke") || F.B("fiapo_spared") ? "Vocês queimam essas coisas para segurar a névoa. Por quê?" : "Ninguém precisa quebrar ninguém. Por que vocês estão aqui?", check = C(dcTalk, "Persuasão"), pass = "talk", fail = "angry" },
                    new AO { label = "Saiam do vale. Hoje.", check = C(F.B("gorza_warned") ? 14 : 16, "Intimidação"), pass = "scared", fail = "angry" },
                    new AO { label = "Atacar a velha de capuz primeiro.", tag = "Combate, surpresa", v = "avo" },
                    new AO { label = "Então vamos quebrar.", tag = "Combate", v = "fight" },
                });
                if (v == "angry") { await Say(gorza, "Gorza cansou de conversa."); RuinsFight(false); return; }
                if (v == "fight") { RuinsFight(false); return; }
                if (v == "avo") { F.On("target_avo"); Approve("kael", -1); Approve("lyra", -1); RuinsFight(true); return; }
                if (v == "scared")
                {
                    await Say(gorza, "(Gorza olha para vocês. Depois para a névoa.) ...Gorza leva o clã. Mas o branco vem atrás de vocês também. Lembra disso.");
                    F.Set("clan", "scared"); F.On("smoke_out");
                    ClanLeaves(true);
                    await Game.Sleep(1500);
                    await Say(null, "Uma goblin pequena, de arco nas costas, fica por último. Olha para você como quem decora um rosto. Depois some pela brecha.");
                    Reward(250, "O clã Dente-de-Musgo deixou o vale");
                    return;
                }
                // they talk
                await Lines(
                    (gorza, "...Gorza veio de cima. Das Terras Altas. Clã inteiro. Metade ficou branca no caminho. Andando, andando, e depois só parado. Olhando pra nada."),
                    (gorza, "Avó descobriu: fumaça de coisa lembrada segura o branco. Então goblin pega coisa. Coisa de goblin, goblin quase não tem mais."),
                    (avo, "Humano acha que goblin rouba coisa. Goblin rouba lembrança. Toda coisa velha tem lembrança grudada, que nem fuligem. A gente queima, e a fumaça diz pro branco: \"aqui alguém lembra\"."),
                    (avo, "(ela cospe no fogo) Vocês fazem igual, lá na cidade grande. Só que queimam gente."));
                F.Set("clan", "truce"); F.On("heard_smoke");
                string w;
                do
                {
                    w = await Ask(gorza, "E agora?", new List<AO> {
                        new AO { @if = () => !F.B("pact_proposed"), label = "E se vocês trocassem em vez de roubar? A pescadora tem coisa velha de sobra. Vocês ajudam na pesca e vigiam o vale.", v = "trade" },
                        new AO { @if = () => HasItem("letter") && !F.B("offered_letter"), label = "Queimem isto.", tag = "Oferecer a Carta do Contrato", v = "letter" },
                        new AO { @if = () => !F.B("mate_offer"), label = MateIs("kael") ? "Kael, você tem alguma coisa pra oferecer ao fogo?" : "Lyra, você tem alguma coisa pra oferecer ao fogo?", v = "mate" },
                        new AO { label = "Por enquanto, só queremos passar.", v = "done" },
                    });
                    if (w == "trade")
                    {
                        F.On("pact_proposed");
                        await Lines((gorza, "...Pescadora não gosta de goblin."), (avo, "Pescadora gosta de peixe. Vai lá, humano. Fala com ela. Se ela topar, goblin topa."));
                    }
                    if (w == "letter")
                    {
                        F.On("offered_letter"); TakeItem("letter");
                        FireFlare();
                        await Lines((avo, "(ela cheira o papel) Papel com medo dentro. Queima bonito."), (G.mate, MateIs("kael") ? "(baixinho) Lá se vai a nossa prova do contrato." : "(baixinho) \"Não escute o que ele disser.\" Agora ninguém mais vai ler isso. Que pena."));
                    }
                    if (w == "mate")
                    {
                        F.On("mate_offer");
                        if (MateIs("kael")) { F.On("kael_refused"); await Say(G.mate, "(Kael leva a mão ao peito, onde guarda alguma coisa por baixo da camisa. Hesita.) ...Não. Isso não."); }
                        else { F.On("lyra_offered"); FireFlare(); await Say(G.mate, "(Lyra tira uma fita do cabelo e joga no fogo sem olhar. A fumaça sobe azulada.) Tenho trezentos anos de coisas, meu bem. Uma fita não faz falta."); }
                    }
                } while (w != "done");
                await Say(gorza, "Pode andar. Não mexe na fogueira. E tem filhote de humano escondido atrás da coluna. Gorza não come filhote. Leva embora.");
                Reward(250, "Trégua com o clã Dente-de-Musgo");
            });
        }
        static void RuinsFight(bool surprise)
        {
            var R = G.groups["ruins"];
            if (surprise) foreach (var e in R) { e.skip = 1; e.skipNote = "Surpreso!"; }
            Game.Fight(R);
        }
        static void FireFlare()
        {
            var o = G.W.objects.FirstOrDefault(x => x.kind == "campfire" && x.goblin);
            if (o == null) return;
            G.fx.Spawn(FxKind.Bloom, o.x, o.y, PAL.ember);
            for (int i = 0; i < 3; i++) { int k = i; Game.After(i * 0.14f, () => G.fx.Spawn(FxKind.HitSpark, o.x + (k - 1) * 6, o.y - 16, PAL.ember)); }
        }
        static void FireOut()
        {
            var o = G.W.objects.FirstOrDefault(x => x.kind == "campfire" && x.goblin);
            if (o == null || o.@out) return;
            o.@out = true;
            if (o.fxe != null) { o.fxe.keep = false; o.fxe.Stop(); }
            G.fx.Spawn(FxKind.Poof, o.x, o.y);
            TweenFor(20, k => F.Set("smokeK", k)).Forget();
        }
        /// <summary>The clan walks out through the west breach and is gone.</summary>
        static void ClanLeaves(bool all)
        {
            var who = (all ? G.groups["ruins"].ToList() : new List<Unit>()).Concat(new[] { Cast("elder"), Cast("kid1"), Cast("kid2"), Cast("murta") }).Where(u => u != null && u.hp > 0 && !u.gone).ToList();
            for (int i = 0; i < who.Count; i++)
            {
                var u = who[i]; int k = i;
                u.passive = true;
                Game.After(i * 0.22f, () =>
                {
                    async Task Go() { await Game.Walk(u, 12, 7 + (k % 2), 90); await Game.Walk(u, 10, 8, 90); G.fx.Spawn(FxKind.Poof, u.x, u.y); u.gone = true; }
                    Go().Forget();
                });
            }
            if (all) FireOut();
        }

        static DTree One(string text, string label = "...", bool narr = false) { var t = new DTree(); t.Add("start", new DNode { text = text, narr = narr, options = { O(label) } }); return t; }
        static DTree ElderTalk() => One(MateIs("lyra") ? "(A goblin velha esconde o rosto num trapo e resmunga em goblin. Lyra traduz:) Ela diz que você tem cheiro de chuva. Acho que é um elogio." : "(A goblin velha esconde o rosto num trapo e resmunga alguma coisa em goblin. Não parece um elogio.)", "Deixá-la em paz.");
        static DTree KidTalk() => One("(Uma criança goblin espia você por trás de um trapo. Quando você olha, ela some.)");
        static DTree MurtaTalk()
        {
            var m = Cast("murta"); var t = new DTree();
            t.Add("start", N("(Uma goblin jovem, de arco nas costas, encara você sem piscar.) Humano olha muito. Murta não gosta.", O("Murta? É o seu nome?", "name", () => { m.name = "Murta"; }), O("Desculpe.")));
            t.Add("name", N("Neta da Avó. Murta atira em quem mexe na fogueira. Murta atira bem.", O("Vou lembrar disso.")));
            return t;
        }

        // ---------------------------------------------------------------- Tomé and the trapdoor
        static DTree TomeTree()
        {
            var t = new DTree();
            if (F.B("tome_home") && G.W.id == "vale") { t.Add("start", N("A vó disse que eu não posso mais sair de perto do cais. ...Mas a moça lá de baixo ainda fala comigo, sabia? Baixinho.", O("Fique com a sua avó."))); return t; }
            if (F.B("tome_with")) { t.Add("start", N("Eu fico atrás de você. Prometo.", O("Fique perto."))); return t; }
            if (F.B("tome_met"))
            {
                t.Add("start", N("A porta tá ali, ó. Debaixo da coluna.", O("Vá pra casa, Tomé. Sua avó está esperando.", "bye", TomeHome), O("Tá bem. Pode vir, mas fica atrás de mim.", "come", TomeCome), O("Já volto.")));
                t.Add("bye", N("Tá... tá bom. Vou correndo pra lá.", O("Vá com cuidado.")));
                t.Add("come", N("Eu sabia que vocês eram legais!", O("Fique perto.")));
                return t;
            }
            t.Add("start", N("Não me machuquem! ...Vocês não são goblins. Eu sou o Tomé. Eu vim atrás das redes e... achei uma porta. Debaixo da coluna. Ela tem a minha cara desenhada. Juro! E tem uma moça que fala lá de baixo.",
                O("Sua avó está te esperando no cais. Vá pra casa.", "bye", () => { F.On("tome_met"); TomeHome(); }),
                O("Mostre essa porta.", "door", () => { F.On("tome_met"); OpenTrapdoor(); }),
                O("Que moça?", "lady")));
            t.Add("lady", N("Ela fala baixinho. Só quando tá tudo quieto. Ela disse que conhece vocês. Que estava esperando.", O("Mostre essa porta.", "door", () => { F.On("tome_met"); OpenTrapdoor(); }), O("Vá pra casa, Tomé.", "bye", () => { F.On("tome_met"); TomeHome(); })));
            t.Add("door", N("Ali, ó, no pé da coluna partida! (ele raspa a terra com o pé, e aparece uma laje com um rosto de menino entalhado) Eu vou junto! A moça disse que ia me contar uma coisa que eu esqueci.",
                O("Tá bem. Pode vir, mas fica atrás de mim.", "come", TomeCome), O("Não. Vá pra casa, sua avó está preocupada.", "bye", TomeHome)));
            t.Add("bye", N("A vó Maren! Tá... vou correndo pra lá. Obrigado, de verdade!", O("Vá com cuidado.")));
            t.Add("come", N("Eu sabia que vocês eram legais!", O("Fique perto.")));
            return t;
        }
        static void OpenTrapdoor()
        {
            F.On("trapdoor_open");
            var o = Game.Obj("trapdoor", Game.Map("vale"));
            o.hidden = false; o.open = true; Game.Refresh(o);
            G.fx.Spawn(FxKind.Poof, o.x, o.y);
            Game.After(0.4f, () => Reward(50, "Uma porta sob as ruínas"));
        }
        static void TomeHome()
        {
            var t = Cast("tome");
            F.On("tome_home"); F.Off("tome_with"); F.On("tome_alive");
            G.followers.Remove(t);
            if (!G.W.npcs.Contains(t) && G.W.id == "vale") G.W.npcs.Add(t);
            G.fx.Spawn(FxKind.Poof, t.x, t.y);
            Game.Place(t, 37, 27, 0);
            if (F.B("grandson")) Game.After(0.5f, () => Reward(50, "Tomé voltou para a avó"));
        }
        static void TomeCome()
        {
            var t = Cast("tome");
            F.On("tome_with", "tome_alive");
            Approve("kael", -1);
            G.W.npcs.Remove(t);
            G.followers.Add(t);
            Game.ResetTrail();
        }

        static async Task TrapdoorUse()
        {
            if (F.B("escape")) return;
            var v = await Ask(null, "A laje se abre para uma escada de pedra branca. Lá embaixo há uma luz fria, sem fonte. Não vem nenhum cheiro de poeira.", new List<AO> {
                new AO { label = "Descer ao Relicário.", v = "down" },
                new AO { label = "Ainda não.", v = "no" },
            });
            if (v == "down") await EnterRelic();
        }
    }
}
