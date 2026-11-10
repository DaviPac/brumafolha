// Character creation: pick a race, a class and a gender, shape the look, choose the starting gear, spend points on
// ability scores. A live, turnable preview in the middle and the derived character sheet on the right.
// Ported from src/creator.js.
using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;

namespace Brumafolha
{
    public static class Creator
    {
        static readonly (string k, string label)[] TABS = { ("race", "Raça"), ("class", "Classe"), ("look", "Aparência"), ("gear", "Equipamento"), ("stats", "Atributos") };
        static readonly (string k, string label)[] POSES = { ("idle", "Parado"), ("walk", "Andando"), ("attack", "Ataque"), ("cast", "Magia") };
        static Build b; static string tab = "race"; static int dir; static string pose = "walk"; static CharSheet ch;
        static Action<Build> onDone; static Func<Build, string> companionOf;
        static Vector2 paneScroll, sheetScroll;

        /// <summary>Open the creator; `done(build)` runs on confirm. `companion(build)` names who joins the hero.</summary>
        public static void Open(Action<Build> done, Func<Build, string> companion)
        {
            onDone = done; companionOf = companion;
            b = Rules.NewBuild("humano", "guerreiro");
            Rebuild();
        }
        static void Rebuild() => ch = Chars.BuildCharacter(Rules.SpecOf(b));

        static void Confirm()
        {
            if (string.IsNullOrWhiteSpace(b.name)) b.name = Rules.NamesFor(b.race, b.gender)[0];
            Snd.levelUp();
            onDone?.Invoke(b.Clone());
        }

        static T Pick<T>(IList<T> a) => U.Pick(a);
        static void Randomize()
        {
            b = Rules.NewBuild(Pick(Rules.RACES.Keys.ToList()), Pick(Rules.CLASSES.Keys.ToList()), Pick(new[] { "f", "m", "f", "m", "n" }));
            var R = Rules.RACES[b.race];
            b.look.skin = (int)(U.Rand() * R.skins.Length) % R.skins.Length; b.look.hair = (int)(U.Rand() * Rules.HAIR_COLORS.Length) % Rules.HAIR_COLORS.Length;
            b.look.eyes = (int)(U.Rand() * Rules.EYES.Length) % Rules.EYES.Length; b.look.outfit = (int)(U.Rand() * Rules.OUTFITS.Length) % Rules.OUTFITS.Length;
            b.look.cape = (int)(U.Rand() * Rules.CAPES.Length) % Rules.CAPES.Length;
            if (R.lookStyle == null && b.look.style != "hood") b.look.style = Pick(new[] { "short", "long", "bun", "bald" });
            if (b.gender != "f" && (b.race == "anao" || b.race == "humano" || b.race == "meioorc")) b.look.beard = Pick(new string[] { null, "short", "long" });
            var C = Rules.CLASSES[b.cls];
            b.equip = new Equip { main = Pick(C.optMain), ranged = Pick(C.optRanged), armor = Pick(C.optArmor), shield = Pick(C.optShield) ? "escudo" : null };
            b.name = Pick(Rules.NamesFor(b.race, b.gender));
            Snd.dieTick();
            Rebuild();
        }

        static string BonusText(Dictionary<string, int> bonus) => string.Join(" · ", bonus.Select(kv => $"{U.Signed(kv.Value)} {kv.Key}"));
        static Color Css(Col c) => new Color((float)c.r / 255, (float)c.g / 255, (float)c.b / 255, 1);
        static GUIStyle T(int s, Color c) => Hud.S(s, c);
        static void H4(string t) { GUILayout.Space(10); GUILayout.Label(t.ToUpperInvariant(), Hud.S(12, Hud.MUTED)); GUILayout.Space(2); }

        public static void Draw(float SW, float SH)
        {
            if (b == null) return;
            Hud.Fill(new Rect(0, 0, SW, SH), new Color(6 / 255f, 6 / 255f, 9 / 255f, 0.93f));
            Hud.Text(new Rect(0, 14, SW, 44), "Crie seu herói", Hud.S(Mathf.Clamp((int)(SW * 0.034f), 26, 40), Hud.GOLD, true, TextAnchor.MiddleCenter, false));
            GUI.Label(new Rect(0, 58, SW, 20), "Raça, classe, aparência e atributos, como numa ficha de mesa.", Hud.S(14, Hud.MUTED, false, TextAnchor.MiddleCenter, false));
            float top = 88, bottom = SH - 70, gap = 16, pad = 22;
            float colW = (SW - pad * 2 - gap * 2);
            float lw = colW * 0.345f, cw = colW * 0.31f, rw = colW - lw - cw;
            var L = new Rect(pad, top, lw, bottom - top); var Cc = new Rect(L.xMax + gap, top, cw, bottom - top); var R = new Rect(Cc.xMax + gap, top, rw, bottom - top);
            foreach (var r in new[] { L, Cc, R }) { Hud.Fill(r, new Color(18 / 255f, 15 / 255f, 22 / 255f, 0.94f)); Hud.Border(r, Hud.EDGE); }

            // left: tabs and the pane
            float tw = lw / TABS.Length;
            for (int i = 0; i < TABS.Length; i++)
            {
                var r = new Rect(L.x + i * tw, L.y, tw, 36);
                bool on = TABS[i].k == tab;
                if (on) { Hud.Fill(r, new Color(0.91f, 0.75f, 0.42f, 0.07f)); Hud.Fill(new Rect(r.x, r.yMax - 2, r.width, 2), Hud.GOLD); }
                GUI.Label(r, TABS[i].label, Hud.S(13, on ? Hud.GOLD : Hud.MUTED, true, TextAnchor.MiddleCenter, false, FontStyle.Bold));
                if (Hud.Click(r)) { tab = TABS[i].k; paneScroll = Vector2.zero; Snd.click(); }
            }
            Hud.Fill(new Rect(L.x, L.y + 36, L.width, 1), Hud.EDGE);
            GUILayout.BeginArea(new Rect(L.x + 14, L.y + 46, L.width - 28, L.height - 56));
            paneScroll = GUILayout.BeginScrollView(paneScroll);
            float pw = L.width - 50;
            switch (tab)
            {
                case "race": RacePane(pw); break;
                case "class": ClassPane(pw); break;
                case "look": LookPane(pw); break;
                case "gear": GearPane(pw); break;
                default: StatsPane(pw); break;
            }
            GUILayout.EndScrollView();
            GUILayout.EndArea();

            Stage(Cc);

            // right: the sheet
            GUILayout.BeginArea(new Rect(R.x + 16, R.y + 12, R.width - 32, R.height - 24));
            sheetScroll = GUILayout.BeginScrollView(sheetScroll);
            Sheet(R.width - 60);
            GUILayout.EndScrollView();
            GUILayout.EndArea();

            // footer
            // footer: a plain "random" button and the big gold "go"
            var gst = Hud.S(20, Hud.GOLD, true, TextAnchor.MiddleCenter, false, FontStyle.Bold);
            float gw = Hud.W("Começar a aventura", gst) + 84, rw2 = Hud.W("Tudo aleatório", Hud.S(15, Hud.TEXT, false, TextAnchor.MiddleCenter, false)) + 36 + 22;
            float fx = SW / 2 - (gw + rw2 + 12) / 2;
            var rr2 = new Rect(fx, SH - 56, rw2, 42);
            Hud.Fill(rr2, Gfx.Hex("#1c1824")); Hud.Border(rr2, Hud.Hover(rr2) ? Hud.GOLD_DIM : Hud.EDGE);
            Hud.Pic(new Rect(rr2.x + 16, rr2.y + 13, 16, 16), Icons.Get("dice"));
            GUI.Label(new Rect(rr2.x + 36, rr2.y, rr2.width - 36, rr2.height), "Tudo aleatório", Hud.S(15, Hud.TEXT, false, TextAnchor.MiddleLeft, false));
            if (Hud.Click(rr2)) Randomize();
            if (Hud.BigButton(new Rect(rr2.xMax + 12, SH - 58, gw, 46), "Começar a aventura", 20)) Confirm();
            Hud.Block(new Rect(0, 0, SW, SH));
        }

        static void Stage(Rect r)
        {
            float cx = r.center.x;
            // name
            var nr = new Rect(cx - 130, r.y + 18, 216, 40);
            Hud.Fill(nr, Gfx.Hex("#0e0c14")); Hud.Border(nr, Hud.EDGE);
            var ns = new GUIStyle(Hud.S(20, Hud.GOLD, true, TextAnchor.MiddleCenter, false, FontStyle.Bold));
            string nn = GUI.TextField(nr, b.name ?? "", 18, ns);
            if (nn != b.name) b.name = nn;
            var rr = new Rect(nr.xMax + 6, nr.y, 40, 40);
            Hud.Frame(rr, Gfx.Hex("#1c1824"), Hud.EDGE);
            Hud.Pic(new Rect(rr.x + 12, rr.y + 12, 16, 16), Icons.Get("dice"));
            if (Hud.Click(rr)) { b.name = Pick(Rules.NamesFor(b.race, b.gender).Where(n => n != b.name).ToList()); Snd.dieTick(); }
            GUI.Label(new Rect(r.x, nr.yMax + 6, r.width, 20), $"{Rules.RaceName(b.race, b.gender)} · {Rules.ClassName(b.cls, b.gender)}", Hud.S(14, Hud.MUTED, false, TextAnchor.MiddleCenter, false));
            // the preview, 6x
            float t = Time.unscaledTime;
            float s = Mathf.Min(6, (r.height - 200) / Chars.SH);
            float pw = Chars.SW * s, ph = Chars.SH * s, px = cx - pw / 2, py = nr.yMax + 34 + Mathf.Max(0, (r.height - 200 - ph) / 2);
            // .podium: a green glow on the ground, and a soft shadow under the feet
            var pod = new Rect(r.x + 1, nr.yMax + 30, r.width - 2, r.yMax - 60 - (nr.yMax + 30));
            Hud.Radial(pod, new Color(74 / 255f, 138 / 255f, 48 / 255f, 0.4f), new Color(74 / 255f, 138 / 255f, 48 / 255f, 0f), 0.5f, 0.78f, 0.34f, 0.62f);
            Hud.Fill(new Rect(cx - 42, py + 34 * s - 2 - 12, 84, 24), new Color(0, 0, 0, 0.35f), 12);
            int f = 4, bob = 0;
            if (pose == "walk") f = (int)(t * 6) % 4;
            else if (pose == "attack") f = (int)(t * 1.5f) % 2 != 0 ? 5 : 4;
            else if (pose == "cast") f = (int)(t * 1.5f) % 2 != 0 ? 6 : 4;
            else bob = (int)(t * 1.6f) % 2;
            // walking and standing the weapon is put away, as in the game; attacking and casting draw it
            var set = (pose == "idle" || pose == "walk") && ch.sheathed != null ? ch.sheathed : ch;
            Hud.Pic(new Rect(px, py + bob * s, pw, ph), set.frames[dir][f]);
            // turn and pose buttons
            float by = r.yMax - 52, bw = 64, total = 2 * 36 + POSES.Length * (bw + 4) + 8, bx = cx - total / 2;
            var turn = new[] { 0, 1, 3, 2 };
            if (Hud.Chip(new Rect(bx, by, 32, 30), "<", false, 15)) { dir = turn[(Array.IndexOf(turn, dir) + 3) % 4]; Snd.click(); }
            bx += 36;
            foreach (var (k, l) in POSES) { if (Hud.Chip(new Rect(bx, by, bw, 30), l, pose == k, 12, TextAnchor.MiddleCenter, 14)) { pose = k; Snd.click(); } bx += bw + 4; }
            if (Hud.Chip(new Rect(bx + 4, by, 32, 30), ">", false, 15)) { dir = turn[(Array.IndexOf(turn, dir) + 1) % 4]; Snd.click(); }
        }

        /// <summary>Lay out a grid of fixed-width cards; returns the index clicked, or -1.</summary>
        static int Cards(int n, float width, float cardW, float cardH, Func<int, bool> on, Func<int, string> label)
        {
            int cols = Mathf.Max(1, (int)((width + 6) / (cardW + 6))); int clicked = -1;
            float w = (width - (cols - 1) * 6) / cols;
            for (int i = 0; i < n; i += cols)
            {
                GUILayout.BeginHorizontal();
                for (int j = i; j < Mathf.Min(n, i + cols); j++)
                {
                    var r = GUILayoutUtility.GetRect(w, cardH, GUILayout.Width(w), GUILayout.Height(cardH));
                    if (Hud.Chip(r, label(j), on(j), 14, TextAnchor.UpperLeft)) clicked = j;
                    if (j < i + cols - 1) GUILayout.Space(6);
                }
                GUILayout.EndHorizontal();
                GUILayout.Space(6);
            }
            return clicked;
        }

        static void RacePane(float w)
        {
            var R = Rules.RACES[b.race]; var keys = Rules.RACES.Keys.ToList();
            int c = Cards(keys.Count, w, 118, 48, i => keys[i] == b.race, i => $"<b>{Rules.RACES[keys[i]].name}</b>\n<size=11><color=#a89c86>{BonusText(Rules.RACES[keys[i]].bonus)}</color></size>");
            if (c >= 0 && keys[c] != b.race)
            {
                var oldNames = Rules.NamesFor(b.race, "n");
                b.race = keys[c]; Rules.ApplyDefaultLook(b, "race");
                if (string.IsNullOrEmpty(b.name) || oldNames.Contains(b.name)) b.name = Rules.NamesFor(b.race, b.gender)[0];
                Snd.select(); Rebuild();
            }
            GUILayout.Space(6);
            GUILayout.Label(R.desc, T(14, Hud.TEXT));
            GUILayout.Space(6);
            foreach (var tr in R.traits) GUILayout.Label($"<b><color=#e8c06a>{tr[0]}.</color></b> {tr[1]}", T(13, Hud.MUTED));
            if (R.move == null) GUILayout.Label("<b><color=#e8c06a>Deslocamento</color></b> 6.", T(13, Hud.MUTED));
        }

        static void ClassPane(float w)
        {
            var C = Rules.CLASSES[b.cls]; var keys = Rules.CLASSES.Keys.ToList();
            int c = Cards(keys.Count, w, 118, 48, i => keys[i] == b.cls, i => { var cc = Rules.CLASSES[keys[i]]; return $"<b>{Rules.ClassName(keys[i], b.gender)}</b>\n<size=11><color=#a89c86>d{cc.hitDie} de vida{(cc.caster != null ? $" · magia ({cc.caster})" : "")}</color></size>"; });
            if (c >= 0 && keys[c] != b.cls)
            {
                b.cls = keys[c]; b.@base = new Dictionary<string, int>(Rules.CLASSES[b.cls].scores); Rules.ApplyDefaultLook(b, "class"); Rules.DefaultGear(b);
                Snd.select(); Rebuild();
            }
            GUILayout.Space(6);
            GUILayout.Label(C.desc, T(14, Hud.TEXT));
            string armorWord = new[] { "só roupas", "armadura leve", "armadura média", "armadura pesada" }[C.profArmor];
            GUILayout.Label($"<b><color=#efe6d2>Treinamento:</color></b> armas {(C.profMartial ? "simples e marciais" : "simples")} · até {armorWord}{(C.profShield ? " · escudo" : "")}", T(13, Hud.MUTED));
            GUILayout.Space(6);
            foreach (var k in C.abilities)
            {
                var a = Combat.ABILITIES[k];
                GUILayout.BeginHorizontal();
                var ir = GUILayoutUtility.GetRect(22, 22, GUILayout.Width(22));
                Hud.Pic(new Rect(ir.x + 2, ir.y + 3, 16, 16), Icons.Get(a.icon));
                GUILayout.Label(a.name, T(14, Hud.TEXT));
                GUILayout.EndHorizontal();
                if (Hud.Hover(GUILayoutUtility.GetLastRect())) Hud.Tooltip($"<b>{a.name}</b>\n{a.desc}");
            }
        }

        static void Swatches(string key, int count, Func<int, Col?> color, Func<int, string> title, int sel, Action<int> set)
        {
            GUILayout.BeginHorizontal();
            for (int i = 0; i < count; i++)
            {
                var r = GUILayoutUtility.GetRect(32, 32, GUILayout.Width(32));
                var c = color(i);
                var inner = new Rect(r.x + 2, r.y + 2, 28, 28);
                if (sel == i) Hud.Border(new Rect(r.x - 1, r.y - 1, 34, 34), Hud.GOLD, 2, 17);
                if (c.HasValue) Hud.Fill(inner, Css(c.Value), 14); else { Hud.Fill(inner, Gfx.Hex("#1c1824"), 14); GUI.Label(inner, "x", Hud.S(12, Hud.MUTED, false, TextAnchor.MiddleCenter, false)); }
                Hud.Border(inner, new Color(0, 0, 0, 0.5f), 2, 14);
                if (Hud.Hover(r) && title != null) Hud.Tooltip(title(i));
                if (Hud.Click(r)) { set(i); Snd.click(); Rebuild(); }
                GUILayout.Space(4);
            }
            GUILayout.FlexibleSpace();
            GUILayout.EndHorizontal();
        }
        static void Chips<TV>((TV v, string label)[] list, Func<TV, bool> on, Action<TV> set)
        {
            GUILayout.BeginHorizontal();
            foreach (var (v, l) in list)
            {
                var r = GUILayoutUtility.GetRect(Hud.W(l, Hud.S(13, Hud.TEXT, false, TextAnchor.MiddleCenter, false)) + 24, 28, GUILayout.ExpandWidth(false));
                if (Hud.Chip(r, l, on(v), 13, TextAnchor.MiddleCenter, 14)) { set(v); Snd.click(); Rebuild(); }
                GUILayout.Space(5);
            }
            GUILayout.FlexibleSpace();
            GUILayout.EndHorizontal();
        }

        static void LookPane(float w)
        {
            var R = Rules.RACES[b.race]; var Lk = b.look;
            H4("Gênero");
            Chips(Rules.GENDERS, g => b.gender == g, g =>
            {
                bool was = Rules.NamesFor(b.race, "n").Contains(b.name);
                b.gender = g;
                if (b.gender == "f") b.look.beard = null;
                if (R.lookStyle == null && Rules.CLASSES[b.cls].lookStyle == null) b.look.style = b.gender == "f" ? "long" : b.gender == "m" && b.look.style == "long" ? "short" : b.look.style;
                if (was) b.name = Rules.NamesFor(b.race, b.gender)[0];
            });
            H4("Tom de pele"); Swatches("skin", R.skins.Length, i => R.skins[i][2], null, Lk.skin, i => Lk.skin = i);
            H4("Cabelo"); Chips(Rules.HAIR_STYLES, v => Lk.style == v, v => Lk.style = v);
            H4("Cor do cabelo"); Swatches("hair", Rules.HAIR_COLORS.Length, i => Rules.HAIR_COLORS[i].ramp[2], i => Rules.HAIR_COLORS[i].name, Lk.hair, i => Lk.hair = i);
            H4("Barba"); Chips(Rules.BEARDS, v => Lk.beard == v, v => Lk.beard = v);
            H4("Olhos"); Swatches("eyes", Rules.EYES.Length, i => Rules.EYES[i].c, i => Rules.EYES[i].name, Lk.eyes, i => Lk.eyes = i);
            H4("Roupa"); Swatches("outfit", Rules.OUTFITS.Length, i => Rules.OUTFITS[i].ramp[2], i => Rules.OUTFITS[i].name, Lk.outfit, i => Lk.outfit = i);
            H4("Capa"); Swatches("cape", Rules.CAPES.Length, i => Rules.CAPES[i].ramp != null ? Rules.CAPES[i].ramp[2] : (Col?)null, i => Rules.CAPES[i].name, Lk.cape, i => Lk.cape = i);
        }

        static void GearRow(string slot, string key, string name, string line, string desc)
        {
            var st = Hud.S(14, Hud.TEXT);
            string label = $"<b>{name}</b>" + (line != "" ? $"\n<size=11><color=#a89c86>{line}</color></size>" : "") + (desc != "" ? $"\n<size=12><i><color=#d8ccb4>{desc}</color></i></size>" : "");
            float h = Hud.H(label, st, 300) + 12;
            var r = GUILayoutUtility.GetRect(100, h, GUILayout.ExpandWidth(true));
            if (Hud.Chip(r, label, b.equip[slot] == key, 14, TextAnchor.UpperLeft)) { b.equip[slot] = key; Snd.click(); Rebuild(); }
            GUILayout.Space(5);
        }
        static void GearPane(float w)
        {
            var C = Rules.CLASSES[b.cls];
            void Wpn(string slot, string k)
            {
                if (k == null) { GearRow(slot, null, "Nenhuma", "", ""); return; }
                var wd = Items.WEAPONS[k];
                GearRow(slot, k, wd.name, Items.WeaponLine(wd) + (Rules.WeaponProficient(b.cls, k) ? "" : " · sem proficiência"), wd.desc);
            }
            H4("Arma"); foreach (var k in C.optMain) Wpn("main", k);
            if (C.optRanged.Length > 1 || C.optRanged[0] != null) { H4("Arma à distância"); foreach (var k in C.optRanged) Wpn("ranged", k); }
            H4("Armadura ou roupa");
            foreach (var k in C.optArmor) { var a = Items.ARMORS[k]; GearRow("armor", k, a.name, $"{Items.ARMOR_CAT_NAMES[a.cat]} · CA {a.@base}{(a.dexMax != 0 ? $" + DES{(a.dexMax < 9 ? $" (máx. {a.dexMax})" : "")}" : "")}", a.desc); }
            if (C.optShield.Contains(true)) { H4("Escudo"); GearRow("shield", null, "Sem escudo", "", ""); GearRow("shield", "escudo", Items.SHIELDS["escudo"].name, "+2 CA", Items.SHIELDS["escudo"].desc); }
            GUILayout.Space(8);
            GUILayout.Label("Mais equipamento aparece pelo caminho. Troque a qualquer hora na Bolsa (I).", T(13, Hud.MUTED));
        }

        static void StatsPane(float w)
        {
            int left = Rules.POINTS - Rules.PointsSpent(b.@base); var sc = Rules.FinalScores(b); var bonus = Rules.RACES[b.race].bonus;
            GUILayout.Label($"Pontos restantes: <b><color={(left != 0 ? "#e8c06a" : "#a89c86")}>{left}</color></b> / {Rules.POINTS}", T(15, Hud.TEXT));
            GUILayout.Space(8);
            GUILayout.BeginHorizontal();
            foreach (var (h, cw) in new[] { ("", 120f), ("Base", 110f), ("Raça", 50f), ("Total", 50f), ("Mod", 50f) }) GUILayout.Label(h, Hud.S(12, Hud.MUTED, false, TextAnchor.MiddleCenter), GUILayout.Width(cw));
            GUILayout.EndHorizontal();
            foreach (var k in Rules.ABILS)
            {
                bool key = Rules.CLASSES[b.cls].scores[k] >= 14;
                GUILayout.BeginHorizontal();
                GUILayout.Label($"<b>{k}</b> <size=11><color=#a89c86>{Rules.ABIL_NAMES[k]}</color></size>", Hud.S(15, key ? Hud.GOLD : Hud.TEXT), GUILayout.Width(120));
                var dn = GUILayoutUtility.GetRect(28, 26, GUILayout.Width(28));
                if (Hud.Button(dn, "−", 14, false, !Rules.CanLower(b.@base, k))) { b.@base[k]--; }
                GUILayout.Label(b.@base[k].ToString(), Hud.S(16, Hud.TEXT, false, TextAnchor.MiddleCenter), GUILayout.Width(50));
                var up = GUILayoutUtility.GetRect(28, 26, GUILayout.Width(28));
                if (Hud.Button(up, "+", 14, false, !Rules.CanRaise(b.@base, k))) { b.@base[k]++; }
                GUILayout.Label(bonus.TryGetValue(k, out var bv) && bv != 0 ? U.Signed(bv) : "", Hud.S(14, Hud.TEAL, false, TextAnchor.MiddleCenter), GUILayout.Width(50));
                GUILayout.Label("<b>" + sc[k] + "</b>", Hud.S(16, Hud.TEXT, false, TextAnchor.MiddleCenter), GUILayout.Width(50));
                GUILayout.Label(U.Signed(Rules.Mod(sc[k])), Hud.S(14, Hud.MUTED, false, TextAnchor.MiddleCenter), GUILayout.Width(50));
                GUILayout.EndHorizontal();
                GUILayout.Space(4);
            }
            GUILayout.Space(6);
            GUILayout.Label("Cada atributo começa em 8 e vai até 15 antes do bônus da raça. Os destacados são os principais da classe.", T(13, Hud.MUTED));
            GUILayout.Space(6);
            var r = GUILayoutUtility.GetRect(300, 30, GUILayout.ExpandWidth(false));
            if (Hud.Chip(r, $"Distribuição sugerida para {Rules.CLASSES[b.cls].name}", false, 13, TextAnchor.MiddleCenter, 14)) { b.@base = new Dictionary<string, int>(Rules.CLASSES[b.cls].scores); Snd.click(); }
        }

        static void Sheet(float w)
        {
            var R = Rules.RACES[b.race]; var C = Rules.CLASSES[b.cls]; var d = Rules.Derive(b);
            var abilities = C.abilities.Where(k => k != "shoot").ToList(); if (d.bow != null) abilities.Add("shoot");
            GUILayout.Label("Ficha", Hud.S(20, Hud.GOLD, true));
            GUILayout.Space(4);
            GUILayout.BeginHorizontal();
            void St(string l, string v, string sub)
            {
                // .st: a little card, label in caps, the number big
                var r = GUILayoutUtility.GetRect(w / 4 - 6, 64, GUILayout.Width(w / 4 - 6), GUILayout.Height(64));
                Hud.Fill(r, Gfx.Hex("#1c1824"), 4); Hud.Border(r, Gfx.Hex("#4a3e2a"), 1, 4);
                GUI.Label(new Rect(r.x, r.y + 6, r.width, 14), l.ToUpperInvariant(), Hud.S(11, Hud.MUTED, false, TextAnchor.UpperCenter, false));
                GUI.Label(new Rect(r.x, r.y + 18, r.width, 26), v, Hud.S(20, Hud.TEXT, false, TextAnchor.UpperCenter, false, FontStyle.Bold));
                if (sub != "") GUI.Label(new Rect(r.x + 2, r.y + 42, r.width - 4, 22), sub, Hud.S(10, Hud.MUTED, false, TextAnchor.UpperCenter));
                GUILayout.Space(6);
            }
            St("PV", d.maxHp.ToString(), $"+{d.hpPerLevel}/nível"); St("CA", d.ac.ToString(), d.acNote); St("Iniciativa", U.Signed(d.init), ""); St("Movimento", d.move.ToString(), "");
            GUILayout.EndHorizontal();
            H4("Ataques");
            GUILayout.Label($"<b>{d.weapon.name}</b> {U.Signed(d.atk)} para acertar · {d.dmg} dano{(d.reach > 1 ? " · alcance 2" : "")}", T(14, Hud.TEXT));
            if (d.bow != null) GUILayout.Label($"<b>{d.bow.name}</b> {U.Signed(d.bow.atk)} · {d.bow.dmg} · alcance {d.bow.range}", T(14, Hud.TEXT));
            if (d.spellAtk != null) GUILayout.Label($"<b>Magia</b> {U.Signed(d.spellAtk.Value)} para acertar · {d.maxSlots} espaços de 1º círculo", T(14, Hud.TEXT));
            H4("Habilidades");
            GUILayout.BeginHorizontal();
            foreach (var k in abilities)
            {
                var r = GUILayoutUtility.GetRect(34, 34, GUILayout.Width(34));
                Hud.Fill(r, Gfx.Hex("#1c1824"), 4); Hud.Border(r, Gfx.Hex("#4a3e2a"), 1, 4);
                Hud.Pic(new Rect(r.x + 6, r.y + 6, 22, 22), Icons.Get(Combat.ABILITIES[k].icon));
                GUILayout.Space(6);
                if (Hud.Hover(r)) Hud.Tooltip($"<b>{Combat.ABILITIES[k].name}</b>\n{Combat.ABILITIES[k].desc}");
            }
            GUILayout.FlexibleSpace();
            GUILayout.EndHorizontal();
            foreach (var n in d.notes) GUILayout.Label("! " + n, T(13, Gfx.Hex("#e8a84a")));
            if (d.fx.Any)
            {
                var parts = new List<string>();
                if (d.weapon.fx != null) parts.Add($"<b><color=#e8c06a>{d.weapon.name}:</color></b> {d.weapon.desc}");
                var A = Items.ARMORS[b.equip.armor ?? "roupas"];
                if (A.fx != null) parts.Add($"<b><color=#e8c06a>{A.name}:</color></b> {A.desc}");
                if (parts.Count > 0) GUILayout.Label(string.Join("\n", parts), T(13, Hud.MUTED));
            }
            if (C.sneak) GUILayout.Label("<b><color=#e8c06a>Ataque furtivo:</color></b> +1d6 uma vez por turno se um aliado estiver ao lado do alvo.", T(13, Hud.MUTED));
            H4("Perícias");
            foreach (var kv in d.skills.Where(kv => d.proficient.Contains(kv.Key) || kv.Key == "Persuasão" || kv.Key == "Intuição"))
            {
                GUILayout.BeginHorizontal();
                bool pro = d.proficient.Contains(kv.Key);
                GUILayout.Label(kv.Key, T(14, pro ? Hud.TEXT : Hud.MUTED));
                GUILayout.FlexibleSpace();
                GUILayout.Label("<b>" + U.Signed(kv.Value) + "</b>", Hud.S(14, pro ? Hud.GOLD : Hud.MUTED, false, TextAnchor.UpperRight));
                GUILayout.EndHorizontal();
            }
            H4("Traços");
            foreach (var tr in R.traits) GUILayout.Label($"<b><color=#e8c06a>{tr[0]}.</color></b> {tr[1]}", T(13, Hud.MUTED));
            var mate = companionOf?.Invoke(b);
            if (mate != null) { GUILayout.Space(8); GUILayout.Label($"Companheiro: <b><color=#e8c06a>{mate}</color></b>", T(14, Hud.TEXT)); }
        }
    }
}
