// Conversations with choices and d20 skill checks, the tabletop way. Ported from src/dialogue.js.
// A tree maps ids to nodes (built on demand). A node: text, options, who / narr, an optional text input.
// An option: label, to, do, if, once, tag, check { skills, dc }, pass, fail, passTo, failTo.
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace Brumafolha
{
    public class DCheck { public string[] skills; public int dc; public DCheck(int dc, params string[] skills) { this.dc = dc; this.skills = skills; } }
    public class DInput { public string placeholder = "", value = ""; public int max = 18; }
    public class DOpt
    {
        public string label, tag;
        public string to; public Func<string> toFn;
        public Action<string> @do;
        public Func<bool> @if;
        public bool once;
        public DCheck check;
        public Action<Unit> pass, fail;
        public string passTo, failTo;
    }
    public class DNode
    {
        public string text, name;
        public List<DOpt> options = new List<DOpt>();
        public ISpeaker who;
        public bool narr;
        public DInput input;
    }
    /// <summary>A dialogue tree: node ids to node builders (so a node's text can depend on the flags when shown).</summary>
    public class DTree : Dictionary<string, Func<DNode>>
    {
        public void Add(string id, DNode n) => this[id] = () => n;
    }

    public static class Dialogue
    {
        class Current { public ISpeaker npc; public DTree tree; public HashSet<string> used; public string prevMode; public Action onClose; public bool busy; }
        static Current current;
        public static bool Open => current != null;

        // what the UI shows
        public static ISpeaker shownSpeaker;
        public static string shownName, shownText;
        public static bool shownNarr;
        public static float typeT;
        public class ShownOpt { public string html; public DOpt opt; public bool used; public (Unit who, string skill, int bonus) best; }
        public static List<ShownOpt> shownOpts = new List<ShownOpt>();
        public static DInput shownInput;
        public static string inputValue = "";

        /// <summary>Who in the party rolls a check (the best at it), and with which of the allowed skills.</summary>
        static (Unit who, string skill, int bonus) BestAt(string[] skills)
        {
            (Unit, string, int) best = (null, null, int.MinValue);
            foreach (var p in G.party.Where(p => p.hp > 0 && !p.ai))
                foreach (var s in skills)
                {
                    int b = p.skills.TryGetValue(s, out var v) ? v : 0;
                    if (best.Item1 == null || b > best.Item3) best = (p, s, b);
                }
            return best;
        }

        /// <summary>Open a conversation. `npc` is whoever speaks first. Runs `onClose` when it ends.</summary>
        public static void OpenDialogue(ISpeaker npc, DTree tree, string startId = "start", Action onClose = null)
        {
            string prevMode = current != null ? current.prevMode : G.mode == "dialogue" ? "explore" : G.mode;
            G.mode = "dialogue";
            Snd.talk();
            current = new Current { npc = npc, tree = tree, used = current?.used ?? new HashSet<string>(), prevMode = prevMode, onClose = onClose };
            Show(startId);
        }

        /// <summary>The same, awaitable: `await Talk(npc, tree)`.</summary>
        public static Task Talk(ISpeaker npc, DTree tree, string startId = "start")
        {
            var tcs = new TaskCompletionSource<bool>();
            OpenDialogue(npc, tree, startId, () => tcs.TrySetResult(true));
            return tcs.Task;
        }

        static void Show(string id)
        {
            var node = current.tree[id]();
            var sp = node.narr ? null : node.who ?? current.npc;
            shownNarr = sp == null || (sp.SpPortrait == null && string.IsNullOrEmpty(sp.SpName));
            shownSpeaker = sp;
            shownName = node.name ?? sp?.SpName ?? "";
            shownText = Rich.Html(node.text);
            typeT = 0;
            shownInput = node.input;
            inputValue = node.input?.value ?? "";
            shownOpts.Clear();
            int i = 0;
            foreach (var o in node.options.Where(o => o.@if == null || o.@if()))
            {
                var skills = o.check?.skills;
                var best = skills != null ? BestAt(skills) : (null, null, 0);
                string tag = o.check != null ? $"<color=#e8a84a>[{string.Join(" ou ", skills)} CD {o.check.dc} · {best.who.name} {U.Signed(best.bonus)}]</color> "
                    : o.tag != null ? $"<color=#5fd0c8>[{o.tag}]</color> " : "";
                if (o.check != null) Tutorial.Hint("check");
                shownOpts.Add(new ShownOpt { html = $"{++i}. {tag}{Rich.Html(o.label)}", opt = o, used = o.once && current.used.Contains(o.label), best = best });
            }
        }

        public static async void Choose(int index)
        {
            if (current == null || current.busy || index < 0 || index >= shownOpts.Count) return;
            var so = shownOpts[index];
            if (so.used) return;
            var o = so.opt;
            Snd.click();
            if (o.once) current.used.Add(o.label);
            string value = (inputValue ?? "").Trim();
            if (o.check != null)
            {
                var best = so.best;
                current.busy = true;
                var res = await Dice.SkillCheck(best.skill, best.who.name, best.bonus, o.check.dc, best.who.lucky);
                if (current != null) current.busy = false;
                Hud.Log($"{best.who.name} — {best.skill}: {res.roll}{U.Signed(best.bonus)} = {res.total} vs CD {o.check.dc} · {(res.ok ? "sucesso" : "falha")}", res.ok ? "heal" : "miss");
                var next = res.ok ? o.pass : o.fail;
                next?.Invoke(best.who);
                Go(res.ok ? o.passTo : o.failTo);
                return;
            }
            o.@do?.Invoke(value);
            Go(o.toFn != null ? o.toFn() : o.to);
        }

        static void Go(string id)
        {
            if (current == null) return;
            if (string.IsNullOrEmpty(id) || id == "end") { CloseDialogue(); return; }
            Show(id);
        }

        public static void CloseDialogue()
        {
            var c = current;
            current = null;
            if (G.mode == "dialogue") G.mode = c?.prevMode ?? "explore";
            Game.ExploreHotbar();
            c?.onClose?.Invoke();
        }

        public static void Key(int n)
        {
            if (current == null || shownInput != null) return;
            Choose(n - 1);
        }
    }

    /// <summary>The big d20: roll it, resolve with { roll, total, ok }. After a failure the Lampejo (if the hero has it) can reroll.</summary>
    public static class Dice
    {
        public struct Result { public int roll, total; public bool ok; }
        public static bool open, spinning, canClose, lampejoOffer;
        public static string skillLine, dcLine, resultText; public static bool resultOk; public static int shownNum;
        static int bonus, dc, final; static bool lucky; static float spinT, tickT; static int ticks;
        static TaskCompletionSource<Result> tcs;

        public static Task<Result> SkillCheck(string skill, string who, int b, int d, bool luck = false)
        {
            tcs = new TaskCompletionSource<Result>();
            open = true; bonus = b; dc = d; lucky = luck;
            skillLine = skill + " · " + who;
            dcLine = $"Classe de Dificuldade {dc}  ·  bônus {U.Signed(bonus)}";
            Spin();
            return tcs.Task;
        }
        static void Spin()
        {
            resultText = ""; lampejoOffer = false; canClose = false;
            spinning = true; spinT = 0; ticks = 0; tickT = 0;
            int r = U.RollDie(20);
            if (r == 1 && lucky) r = U.RollDie(20); // halfling luck
            final = r;
        }
        public static void Update(float dt)
        {
            if (!open) return;
            if (spinning)
            {
                tickT += dt;
                while (tickT >= 0.06f && spinning)
                {
                    tickT -= 0.06f;
                    shownNum = U.RollDie(20); Snd.dieTick();
                    if (++ticks > 16) Finish();
                }
            }
            else if (!canClose) { spinT += dt; if (spinT > 0.25f) canClose = true; }
        }
        static void Finish()
        {
            spinning = false; spinT = 0;
            int r = final; shownNum = r;
            int total = r + bonus; bool ok = r == 20 || (r != 1 && total >= dc);
            resultText = r == 20 ? "Sucesso crítico!" : r == 1 ? "Falha crítica!" : ok ? $"Sucesso  ({total})" : $"Falha  ({total})";
            resultOk = ok;
            if (ok) Snd.success(r == 20); else Snd.fail();
            lampejoOffer = !ok && Game.LampejoCan();
        }
        public static void UseLampejo()
        {
            if (!lampejoOffer) return;
            Game.LampejoUse(); Snd.cast("arcane"); Spin();
        }
        public static void Click()
        {
            if (!open || spinning || !canClose) return;
            open = false;
            int total = final + bonus;
            tcs.TrySetResult(new Result { roll = final, total = total, ok = final == 20 || (final != 1 && total >= dc) });
        }
    }
}
