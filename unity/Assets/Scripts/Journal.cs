// The Diário: the bag (items you can read), equipment, the quests with their notes, and the Diário de Lembranças.
// Opening it pauses the game. Ported from src/journal.js.
using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;

namespace Brumafolha
{
    public static class Journal
    {
        static readonly (string k, string label, string icon)[] TABS = { ("bag", "Bolsa", "bag"), ("gear", "Equipamento", "sword"), ("quests", "Missões", "book"), ("memories", "Lembranças", "leaf") };
        static string tab = "bag"; public static bool open; static string reading; static int who; static string err = "";
        static Vector2 scroll;
        public static Action afterClose;

        public static void Open(string t = null)
        {
            if (G.mode == "title" || G.mode == "create" || G.mode == "over") return;
            tab = t ?? tab; open = true; reading = null; scroll = Vector2.zero;
            G.paused = true;
            Snd.select();
        }
        public static void Close()
        {
            if (!open) return;
            open = false;
            G.paused = false;
            Snd.click();
            var f = afterClose; afterClose = null; f?.Invoke();
        }
        public static void Toggle(string t) { if (open && (t == tab || t == null)) Close(); else Open(t); }

        public static void Draw(float SW, float SH)
        {
            if (!open) return;
            Hud.Fill(new Rect(0, 0, SW, SH), new Color(5 / 255f, 5 / 255f, 8 / 255f, 0.6f));
            float w = Mathf.Min(760, SW - 32), h = Mathf.Min(SH - 40, 680), x = (SW - w) / 2, y = (SH - h) / 2;
            var box = new Rect(x, y, w, h);
            Hud.VGrad(box, Gfx.Hex("#1e1912"), Gfx.Hex("#141008")); Hud.Border(box, Hud.EDGE);
            // tabs
            float tx = x + 12;
            foreach (var (k, label, icon) in TABS)
            {
                var r = new Rect(tx, y + 10, 160, 34);
                bool on = k == tab;
                if (on) Hud.Fill(r, new Color(0.91f, 0.75f, 0.42f, 0.08f));
                if (on) Hud.Fill(new Rect(r.x, r.yMax - 2, r.width, 2), Hud.GOLD);
                Hud.Pic(new Rect(r.x + 10, r.y + 9, 16, 16), Icons.Get(icon));
                GUI.Label(new Rect(r.x + 32, r.y, r.width - 32, r.height), label, Hud.S(15, on ? Hud.GOLD : Hud.MUTED, true, TextAnchor.MiddleLeft, false));
                if (Hud.Click(r)) { tab = k; reading = null; scroll = Vector2.zero; Snd.click(); }
                tx += 164;
            }
            var xr = new Rect(box.xMax - 44, y + 10, 32, 32);
            GUI.Label(xr, "✕", Hud.S(20, Hud.Hover(xr) ? Hud.GOLD : Hud.MUTED, false, TextAnchor.MiddleCenter, false));
            if (Hud.Click(xr)) { Close(); Hud.Block(box); return; }
            Hud.Fill(new Rect(x, y + 46, w, 1), Hud.EDGE);
            GUILayout.BeginArea(new Rect(x + 22, y + 56, w - 44, h - 70));
            scroll = GUILayout.BeginScrollView(scroll);
            if (tab == "bag") BagPage(w - 70);
            else if (tab == "quests") QuestPage();
            else if (tab == "memories") MemoryPage();
            else GearPage(w - 70);
            GUILayout.EndScrollView();
            GUILayout.EndArea();
            Hud.Block(new Rect(0, 0, SW, SH));
        }

        static void H2(string t) { GUILayout.Label(t, Hud.S(24, Hud.GOLD, true)); GUILayout.Space(6); }
        static void Muted(string t) => GUILayout.Label(t, Hud.S(14, Hud.MUTED));

        static void ItemRow(string icon, string titleHtml, string body, Action onClick = null)
        {
            GUILayout.BeginHorizontal();
            var ir = GUILayoutUtility.GetRect(28, 28, GUILayout.Width(28));
            Hud.Pic(new Rect(ir.x, ir.y + 2, 24, 24), Icons.Get(icon));
            GUILayout.Space(8);
            GUILayout.BeginVertical();
            GUILayout.Label(titleHtml, Hud.S(15, Hud.TEXT));
            GUILayout.Label(body, Hud.S(13, Hud.MUTED));
            GUILayout.EndVertical();
            GUILayout.EndHorizontal();
            var last = GUILayoutUtility.GetLastRect();
            if (onClick != null && Event.current.type == EventType.Repaint && last.Contains(Event.current.mousePosition)) Hud.Border(last, Hud.GOLD_DIM);
            if (onClick != null && Hud.Click(last)) onClick();
            GUILayout.Space(10);
        }

        static void BagPage(float w)
        {
            if (reading != null)
            {
                var it = G.items.FirstOrDefault(i => i.id == reading);
                if (it == null) { reading = null; return; }
                H2(it.name);
                GUILayout.Label(Rich.Html(it.read), new GUIStyle(Hud.S(17, Gfx.Hex("#3a2c1c"))) { normal = { background = Paper(), textColor = Gfx.Hex("#3a2c1c") }, padding = new RectOffset(22, 22, 18, 18) });
                GUILayout.Space(10);
                if (Hud.Button(GUILayoutUtility.GetRect(140, 36, GUILayout.Width(140)), "← Voltar", 14)) reading = null;
                return;
            }
            H2("Bolsa");
            ItemRow("gold", "<b>Ouro</b>", $"{G.gold} peças.");
            ItemRow("potion", $"<b>Poção de Cura</b> ×{G.potions}", "Recupera 2d4+2 PV. Em combate, gasta a ação bônus.");
            foreach (var it in G.items.ToList())
            {
                string tag = it.read != null ? " <color=#5fd0c8>[ler]</color>" : it.gear != null ? " <color=#5fd0c8>[equipável]</color>" : "";
                ItemRow(it.icon, $"<b>{it.name}</b>{tag}", (it.gear != null ? GearLine(it) + " — " : "") + it.desc,
                    it.read != null ? () => { reading = it.id; Snd.click(); Story.ItemRead(it); } : (Action)null);
            }
        }
        static Texture2D paper;
        static Texture2D Paper()
        {
            if (paper != null) return paper;
            paper = new Texture2D(1, 1); paper.SetPixel(0, 0, Gfx.Hex("#e8dcc0")); paper.Apply();
            return paper;
        }

        static void QuestPage()
        {
            var qs = Story.Quests(true);
            H2("Missões");
            if (qs.Count == 0) { Muted("Nenhuma missão ainda."); return; }
            foreach (var q in qs)
            {
                GUILayout.Label(q.title, Hud.S(19, Hud.GOLD, true));
                if (q.desc != null) GUILayout.Label(q.desc, Hud.S(14, Hud.MUTED));
                foreach (var (t, d) in q.objs) GUILayout.Label((d ? "◆ <color=#a89c86>" : "◇ ") + t + (d ? "</color>" : ""), Hud.S(15, Hud.TEXT));
                foreach (var n in q.notes ?? new List<string>()) GUILayout.Label("<i>" + n + "</i>", Hud.S(14, Gfx.Hex("#d8ccb4")));
                GUILayout.Space(14);
            }
        }

        static void MemoryPage()
        {
            H2("Diário de Lembranças");
            Muted("O que você viveu, e quem você é.");
            GUILayout.Space(8);
            if (G.memories.Count == 0) { Muted("Por enquanto, só o sonho. E nem dele você tem certeza."); return; }
            foreach (var m in G.memories)
            {
                var c = m.origin ? Hud.GOLD : Hud.TEXT;
                if (m.flicker) c.a = 0.45f + 0.55f * Mathf.Abs(Mathf.Sin(Time.unscaledTime * 3));
                GUILayout.Label("• " + (m.struck ? "<color=#a89c86>" + m.text + "</color>" : m.text), Hud.S(16, c));
                GUILayout.Space(4);
            }
        }

        // ---------------------------------------------------------------- equipment
        static readonly (string k, string label)[] SLOTS = { ("main", "Arma"), ("ranged", "À distância"), ("armor", "Armadura / roupa"), ("shield", "Escudo") };
        static string SlotOf(Item it) => it.gear == "weapon" ? (Items.WEAPONS[it.key].Has("dist") ? "ranged" : "main") : it.gear;
        public static string GearLine(Item it)
        {
            if (it.gear == "weapon") return Items.WeaponLine(Items.WEAPONS[it.key]);
            if (it.gear == "armor") { var d = Items.ARMORS[it.key]; return $"{Items.ARMOR_CAT_NAMES[d.cat]} · CA {d.@base}{(d.dexMax != 0 ? " + DES" + (d.dexMax < 9 ? $" (máx. {d.dexMax})" : "") : "")}"; }
            return $"+{Items.SHIELDS[it.key].ac} CA";
        }
        static List<Unit> Members() => G.party.Where(p => p.build != null && !p.ai).ToList();

        static void Stat(string l, string v)
        {
            GUILayout.BeginVertical(GUILayout.Width(120));
            GUILayout.Label(l, Hud.S(12, Hud.MUTED));
            GUILayout.Label("<b>" + v + "</b>", Hud.S(17, Hud.TEXT));
            GUILayout.EndVertical();
        }

        static void GearPage(float w)
        {
            var ms = Members();
            H2("Equipamento");
            if (ms.Count == 0) { Muted("Ninguém para equipar ainda."); return; }
            var u = ms[Math.Min(who, ms.Count - 1)]; var d = Rules.Derive(u.build, u.equip);
            GUILayout.BeginHorizontal();
            for (int i = 0; i < ms.Count; i++)
            {
                var r = GUILayoutUtility.GetRect(120, 30, GUILayout.Width(120));
                if (Hud.Chip(r, ms[i].name, ms[i] == u, 14)) { who = i; err = ""; Snd.click(); }
                GUILayout.Space(6);
            }
            GUILayout.EndHorizontal();
            if (err != "") GUILayout.Label(err, Hud.S(14, Hud.BAD));
            GUILayout.Space(8);
            GUILayout.BeginHorizontal();
            // the doll: front, side and back
            var doll = GUILayoutUtility.GetRect(3 * 78 + 12, 144, GUILayout.Width(3 * 78 + 12));
            Hud.Fill(doll, Gfx.Hex("#1c1824"));
            int di = 0;
            foreach (int dir in new[] { 0, 2, 3 }) { Hud.Pic(new Rect(doll.x + 4 + di * 78, doll.y + 4, 78, 108), u.ch.frames[dir][4]); di++; }
            GUILayout.Space(12);
            GUILayout.BeginVertical();
            GUILayout.BeginHorizontal();
            Stat("CA", d.ac.ToString()); Stat("Ataque", $"{U.Signed(d.atk)} · {d.dmg}");
            Stat("Distância", d.bow != null ? $"{U.Signed(d.bow.atk)} · {d.bow.dmg}" : "—"); Stat("Movimento", d.move.ToString());
            GUILayout.EndHorizontal();
            GUILayout.Label(d.acNote + (d.reach > 1 ? " · ataca a 2 casas" : ""), Hud.S(12, Hud.MUTED));
            foreach (var n in d.notes) GUILayout.Label("⚠ " + n, Hud.S(13, Gfx.Hex("#e8a84a")));
            foreach (var (k, l) in SLOTS)
            {
                string key = u.equip[k]; bool empty = key == null || key == "roupas" || key == "punhos";
                GUILayout.BeginHorizontal();
                GUILayout.Label(l, Hud.S(13, Hud.MUTED), GUILayout.Width(130));
                GUILayout.Label("<b>" + (key == null ? "—" : Items.NameOf(k, key)) + "</b>", Hud.S(14, Hud.TEXT));
                if (!empty)
                {
                    var br = GUILayoutUtility.GetRect(70, 24, GUILayout.Width(70));
                    if (Hud.Button(br, "Tirar", 12)) err = Game.Equip(u, k, null) ?? "";
                }
                GUILayout.EndHorizontal();
            }
            GUILayout.EndVertical();
            GUILayout.EndHorizontal();
            GUILayout.Space(14);
            GUILayout.Label("Na bolsa", Hud.S(18, Hud.GOLD, true));
            var gear = G.items.Where(it => it.gear != null).ToList();
            if (gear.Count == 0) { Muted("Nenhuma arma ou armadura sobrando. Procure em baús e com quem cruzar o seu caminho."); return; }
            foreach (var it in gear)
            {
                string slot = SlotOf(it); var eq = u.equip.Clone(); eq[slot] = it.key; var nd = Rules.Derive(u.build, eq);
                string why = "";
                if (it.gear == "armor" && !Rules.ArmorAllowed(u.build.cls, it.key)) why = "sem treino com essa armadura";
                if (it.gear == "shield" && !Rules.ShieldAllowed(u.build.cls)) why = "sem treino com escudo";
                var diff = new List<string>();
                if (nd.ac != d.ac) diff.Add($"CA {d.ac} → <b><color={(nd.ac > d.ac ? "#8fd65a" : "#ff6a5a")}>{nd.ac}</color></b>");
                if (slot == "main" && (nd.atk != d.atk || nd.dmg != d.dmg)) diff.Add($"ataque {U.Signed(d.atk)} {d.dmg} → <b>{U.Signed(nd.atk)} {nd.dmg}</b>");
                if (slot == "ranged" && nd.bow != null) diff.Add($"distância: <b>{U.Signed(nd.bow.atk)} {nd.bow.dmg}</b>");
                if (nd.move != d.move) diff.Add($"movimento {d.move} → <b><color={(nd.move > d.move ? "#8fd65a" : "#ff6a5a")}>{nd.move}</color></b>");
                var warn = nd.notes.Where(n => !d.notes.Contains(n)).ToList();
                if (slot == "main" && !Rules.WeaponProficient(u.build.cls, it.key)) warn.Add("sem proficiência: sem +2 para acertar");
                GUILayout.BeginHorizontal();
                var ir = GUILayoutUtility.GetRect(28, 28, GUILayout.Width(28));
                Hud.Pic(new Rect(ir.x, ir.y + 2, 24, 24), Icons.Get(it.icon));
                GUILayout.Space(8);
                GUILayout.BeginVertical();
                GUILayout.Label($"<b>{it.name}</b>  <size=12><color=#a89c86>{GearLine(it)}</color></size>", Hud.S(15, Hud.TEXT));
                GUILayout.Label(it.desc, Hud.S(13, Hud.MUTED));
                if (diff.Count > 0) GUILayout.Label(string.Join(" · ", diff), Hud.S(13, Hud.TEXT));
                foreach (var wv in warn) GUILayout.Label("⚠ " + wv, Hud.S(13, Gfx.Hex("#e8a84a")));
                GUILayout.EndVertical();
                var br = GUILayoutUtility.GetRect(why != "" ? 200 : 100, 30, GUILayout.Width(why != "" ? 200 : 100));
                if (Hud.Button(br, why != "" ? why : "Equipar", 12, false, why != "")) err = Game.Equip(u, null, it) ?? "";
                GUILayout.EndHorizontal();
                GUILayout.Space(10);
            }
        }
    }
}
