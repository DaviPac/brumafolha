// The optional tutorial: short hint cards that show up the first time something happens, never blocking play.
// Turned on or off when the game starts, and from the pause menu. Ported from src/tutorial.js.
using System.Collections.Generic;
using System.Threading.Tasks;
using UnityEngine;

namespace Brumafolha
{
    public static class Tutorial
    {
        static readonly Dictionary<string, (string title, string html)> HINTS = new Dictionary<string, (string, string)> {
            ["move"] = ("Andar", "<b>Clique</b> no chão para andar, ou use <b>WASD</b> / as setas."),
            ["interact"] = ("Interagir", "Pessoas e objetos com nome ao passar o mouse podem ser usados: <b>clique</b> neles, ou chegue perto e aperte <b>E</b>."),
            ["check"] = ("Testes de perícia", "Opções com <span class='chk'>[Perícia CD X]</span> pedem um teste: rola-se um <b>d20</b> e soma-se o bônus de quem do grupo é melhor naquela perícia. Igual ou acima da CD, sucesso. Um 20 natural sempre passa; um 1 sempre falha."),
            ["party"] = ("O grupo", "<b>Tab</b> (ou clicar no retrato à esquerda) troca quem você controla. Os outros seguem o líder."),
            ["quest"] = ("Objetivos", "Os objetivos ficam no canto superior direito. O <b>Diário</b> (<b>J</b>) guarda as missões e as lembranças."),
            ["gear"] = ("Equipamento", "Armas, armaduras e escudos vão para a Bolsa. Abra a aba <b>Equipamento</b> (tecla <b>I</b>) para vestir cada membro do grupo; a prévia mostra a CA e o ataque antes de trocar."),
            ["bag"] = ("A Bolsa", "<b>I</b> abre a Bolsa. Itens marcados com <b>ler</b> podem ser lidos: clique neles."),
            ["rest"] = ("Descansar", "Na fogueira do acampamento você faz um <b>descanso longo</b>: vida, magias e habilidades voltam. Só dá para descansar sem inimigos por perto."),
            ["approach"] = ("Abordagens", "Nem todo encontro precisa virar luta. Cada opção é um jeito diferente de resolver; o teste mostra quem rola e o bônus."),
            ["combat"] = ("Combate", "O combate é por turnos. A faixa no alto mostra a ordem de <b>iniciativa</b> (d20 + Destreza). O anel dourado marca de quem é a vez."),
            ["turn"] = ("Seu turno", "A área clara é até onde você anda neste turno: <b>clique</b> num quadrado para mover. <b>Clique num inimigo</b> para atacar: passe o mouse antes para ver a chance de acerto."),
            ["actions"] = ("Ação e Ação Bônus", "Cada turno tem <b>1 Ação</b> (ataque, magia) e <b>1 Ação Bônus</b> (poção, fôlego...), além do movimento. <b>1–5</b> escolhem na barra de baixo; <b>Espaço</b> encerra o turno; <b>Esc</b> cancela a ação escolhida."),
            ["spells"] = ("Magias", "Truques podem ser usados sempre. Magias de 1º círculo gastam um <b>espaço</b> (o número no canto do ícone), que volta no descanso."),
            ["down"] = ("Caído", "Com 0 PV um personagem cai. Se o grupo vencer, ele levanta com 1 PV. Se todos caírem, a luta pode ser tentada de novo."),
            ["memory"] = ("Lembranças", "O <b>Diário de Lembranças</b> (<b>J</b>, aba Lembranças) guarda o que o herói viveu e quem ele é."),
            ["ruins"] = ("Muitas saídas", "Aqui há vários caminhos: lutar, conversar, ameaçar, entrar escondido. Você também pode voltar e explorar o vale antes."),
            ["stealth"] = ("Furtividade", "Um teste de Furtividade bem-sucedido deixa você passar sem ser visto, ou começar uma luta com <b>rodada surpresa</b>."),
            ["lampejo"] = ("Lampejo de Velmoor", "Uma vez por descanso: depois de um teste que falhou, você pode <b>rolar o d20 de novo</b>. Em combate, ele está na barra e dá <b>vantagem</b> no próximo ataque do grupo."),
            ["escape"] = ("Corra!", "Siga a trilha marcada até o barco no cais. Não pare: a Bruma está logo atrás."),
            ["pause"] = ("Menu", "<b>Esc</b> ou <b>P</b> pausa o jogo e abre o volume de cada som. As dicas do tutorial também podem ser desligadas lá."),
        };

        static readonly List<string> queue = new List<string>();
        static string showing;
        static bool asking; static TaskCompletionSource<bool> askTcs;

        /// <summary>Show a hint the first time it's asked for (only with the tutorial on).</summary>
        public static void Hint(string id)
        {
            if (!G.tutorial || !HINTS.ContainsKey(id) || G.hintsSeen.Contains(id) || queue.Contains(id) || showing == id) return;
            queue.Add(id);
            if (showing == null) Next();
        }
        static void Next()
        {
            showing = queue.Count > 0 ? queue[0] : null;
            if (queue.Count > 0) queue.RemoveAt(0);
            if (showing == null) return;
            G.hintsSeen.Add(showing);
            Snd.select();
        }
        public static void SetTutorial(bool on)
        {
            G.tutorial = on;
            if (!on) { queue.Clear(); showing = null; }
        }
        /// <summary>Ask once, before the game starts.</summary>
        public static Task<bool> AskTutorial()
        {
            asking = true; askTcs = new TaskCompletionSource<bool>();
            return askTcs.Task;
        }

        public static void Draw(float SW, float SH)
        {
            if (asking)
            {
                // #tutask: no panel, just the radial veil and centred text
                Hud.Radial(new Rect(0, 0, SW, SH), new Color(16 / 255f, 20 / 255f, 28 / 255f, 0.9f), new Color(4 / 255f, 4 / 255f, 8 / 255f, 0.98f), 0.5f, 0.4f);
                float w = Mathf.Min(620, SW - 32), x = (SW - w) / 2;
                int h1 = Mathf.Clamp((int)(SW * 0.04f), 28, 44);
                string p = "O tutorial mostra dicas curtas na primeira vez que algo acontece: andar, conversar, testes de d20, combate. Ele nunca pausa o jogo e pode ser desligado no menu a qualquer momento.";
                var pst = Hud.S(16, Gfx.Hex("#d8ccb4"), false, TextAnchor.UpperCenter);
                float ph = Hud.H(p, pst, w);
                float total = h1 * 1.3f + 12 + 16 + ph + 16 + 20 + 46, y = (SH - total) / 2;
                GUI.Label(new Rect(0, y, SW, h1 * 1.3f), "Primeira vez em Brumafolha?", Hud.S(h1, Gfx.Hex("#f4ecdc"), true, TextAnchor.MiddleCenter, false, FontStyle.Bold));
                y += h1 * 1.3f + 12 + 16;
                GUI.Label(new Rect(x, y, w, ph), p, pst);
                y += ph + 16 + 20;
                void Pick(bool on) { asking = false; SetTutorial(on); askTcs.TrySetResult(on); }
                var bst = Hud.S(18, Hud.GOLD, true, TextAnchor.MiddleCenter, false, FontStyle.Bold);
                float b1 = Hud.W("Jogar com tutorial", bst) + 52, b2 = Hud.W("Jogar sem tutorial", bst) + 52, bx = SW / 2 - (b1 + b2 + 12) / 2;
                if (Hud.BigButton(new Rect(bx, y, b1, 46), "Jogar com tutorial", 18)) Pick(true);
                else if (Hud.BigButton(new Rect(bx + b1 + 12, y, b2, 46), "Jogar sem tutorial", 18, true)) Pick(false);
                Hud.Block(new Rect(0, 0, SW, SH));
                return;
            }
            if (showing == null) return;
            var (title, html) = HINTS[showing];
            // #hint: 320 wide at (14, 58), a teal edge on the left
            string body = Rich.Html(html).Replace("<b>", "<b><color=#e8c06a>").Replace("</b>", "</color></b>");
            float hw = Mathf.Min(320, SW * 0.8f), bx2 = 14, by = 58;
            var st = Hud.S(14, Hud.TEXT);
            float bh = Hud.H(body, st, hw - 28);
            var card = new Rect(bx2, by, hw, 12 + 22 + bh + 10 + 28 + 12);
            Hud.Fill(new Rect(card.x - 4, card.y + 6, card.width + 8, card.height + 10), new Color(0, 0, 0, 0.25f), 8);
            Hud.VGrad(card, new Color(18 / 255f, 22 / 255f, 30 / 255f, 0.95f), new Color(10 / 255f, 12 / 255f, 18 / 255f, 0.96f));
            Hud.Border(card, new Color(95 / 255f, 208 / 255f, 200 / 255f, 0.53f));
            Hud.Fill(new Rect(card.x, card.y, 3, card.height), Hud.TEAL);
            Hud.Pic(new Rect(bx2 + 14, by + 13, 16, 16), Icons.Get("bulb"));
            GUI.Label(new Rect(bx2 + 36, by + 12, hw - 50, 22), title, Hud.S(16, Hud.TEAL, true, TextAnchor.UpperLeft, false, FontStyle.Bold));
            GUI.Label(new Rect(bx2 + 14, by + 12 + 22 + 6, hw - 28, bh), body, st);
            float fy = by + 12 + 22 + 6 + bh + 10;
            bool Small(Rect r, string l, Color border, Color text)
            {
                Hud.Fill(r, Gfx.Hex("#1c1824"), 4); Hud.Border(r, border, 1, 4);
                GUI.Label(r, l, Hud.S(13, text, false, TextAnchor.MiddleCenter, false));
                return Hud.Click(r);
            }
            var ok = new Rect(bx2 + 14, fy, Hud.W("Entendi", Hud.S(13, Hud.TEAL, false, TextAnchor.MiddleCenter, false)) + 24, 26);
            if (Small(ok, "Entendi", Hud.TEAL, Hud.TEAL)) { Snd.click(); Next(); return; }
            var off = new Rect(ok.xMax + 8, fy, Hud.W("Desligar dicas", Hud.S(13, Hud.MUTED, false, TextAnchor.MiddleCenter, false)) + 24, 26);
            if (Small(off, "Desligar dicas", Hud.EDGE, Hud.MUTED)) { Snd.click(); SetTutorial(false); return; }
            Hud.Block(card);
        }
    }
}
